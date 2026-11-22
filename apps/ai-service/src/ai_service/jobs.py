"""§162 作业队列：Queue → Worker → Progress → Result。

为什么要它：图片 / 视频 / 3D / 复杂 Agent 任务一跑就是几十秒到几分钟，挂在一个 HTTP 请求上
等于让浏览器和 Next 的路由超时互相比赛。所以提交拿到的是 jobId，结果靠查。

两种后端，区别写在报文里（§159）：

- `memory`：字典 + 队列，只有当前进程看得到，重启即失。默认后端（开发兜底）。
  多副本部署时它会让"提交在一台、轮询打到另一台"查不到作业，所以每次响应都带 `note` 说明。
- `redis`：跨进程可见、带 TTL（§94 指定 Redis 承载 queues）。配置 `NEXUS_REDIS_URL` 才启用。

进度这一栏**只在真知道的时候给**：一次 LLM 调用没有可观测的中间态，所以那种作业
`progress` 一直是 `null`，而不是先报 0.2 再报 0.9 的假刻度。
"""

from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping, Protocol

from .dead_letter import DEFAULT_MAX_DEAD_LETTERS, parse_max_dead_letters, trim_command, trim_list
from .execution import error, execute_ai_request
from .providers.registry import Registry

TERMINAL = {"completed", "failed", "cancelled"}
ACTIVE = {"queued", "running"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@dataclass
class Job:
    id: str
    requestId: str
    status: str
    backend: str
    queuedAt: str
    payload: dict[str, Any] = field(default_factory=dict)
    activities: list[dict[str, Any]] = field(default_factory=list)
    startedAt: str | None = None
    finishedAt: str | None = None
    progress: float | None = None
    result: dict[str, Any] | None = None
    error: dict[str, Any] | None = None
    attempts: int = 0  # 已被 worker 真正跑过的次数（用于有界重试 + 死信判定，内部记账）

    def public(self) -> dict[str, Any]:
        """作业状态报文：payload 是 worker 的私有输入，不发回调用方。"""
        return {
            "jobId": self.id,
            "requestId": self.requestId,
            "backend": self.backend,
            "status": self.status,
            "queuedAt": self.queuedAt,
            "startedAt": self.startedAt,
            "finishedAt": self.finishedAt,
            "progress": self.progress,
            "activities": self.activities,
            **({"result": self.result} if self.result is not None else {}),
            **({"error": self.error} if self.error is not None else {}),
        }


class JobStore(Protocol):
    backend: str
    note: str
    max_attempts: int  # 每件作业允许的总尝试次数；<=1 表示不重试（默认，零回归）
    max_dead_letters: int  # 死信上限（ADR 0121）；0 = 不限（回到 ADR 0120 的旧行为）
    # >0 表示这个后端的 running 是"带租约的账"，worker 必须按 lease_s/3 续租；
    # 内存后端没有租约这回事（进程死了账本来就没了），是 0。
    lease_s: float

    async def enqueue(self, payload: dict[str, Any]) -> Job: ...
    async def claim(self) -> Job | None: ...
    async def save(self, job: Job) -> None: ...
    async def get(self, job_id: str) -> Job | None: ...
    async def counts(self) -> tuple[int, int]: ...
    async def renew_lease(self, job_id: str) -> None: ...
    async def request_cancel(self, job_id: str) -> Job | None: ...
    async def is_cancel_requested(self, job_id: str) -> bool: ...
    async def requeue(self, job: Job) -> None: ...
    async def route_to_dead_letter(self, job: Job, *, reason: str) -> None: ...
    async def dead_letters(self) -> list[dict[str, Any]]: ...
    async def close(self) -> None: ...


CANCEL_NOTE_STARTED = "取消请求已受理：worker 在开始执行前停下，provider 没有被调用"
CANCEL_NOTE_DISCARDED = "取消请求已受理：provider 调用已经返回，结果按取消丢弃（不谎报成完成）"
CANCEL_NOTE_QUEUED = "排队中被取消：worker 不会领取这一件"


class MemoryJobStore:
    """单进程内存队列：默认后端。有上限，超出的旧作业按完成时间先后丢掉。"""

    backend = "memory"
    note = "作业只存在当前 ai-service 进程里：重启即失，多副本部署时轮询可能打到另一台查不到。"
    lease_s = 0.0  # 内存后端的 running 就是对象状态本身，没有"租约到期"这回事

    def __init__(self, *, max_jobs: int = 200, max_attempts: int = 1, max_dead_letters: int = DEFAULT_MAX_DEAD_LETTERS) -> None:
        self._jobs: dict[str, Job] = {}
        # 队列的取领必须是 O(1)——claim 是 worker 的热路径，list.pop(0) 每次都搬一遍整列
        self._pending: deque[str] = deque()
        self._lock = asyncio.Lock()
        self._max_jobs = max_jobs
        self.max_attempts = max(1, max_attempts)  # <=1 表示不重试（默认零回归）
        self.max_dead_letters = max(0, max_dead_letters)  # 0 = 不限（ADR 0121）
        # 取消标志与作业本体分开存：作业本体各处都会整份写回，
        # 把标志塞进去就会出现"worker 的一次 save 把取消请求抹掉"这种竞态
        self._cancel_requested: set[str] = set()
        # 死信（dead-letter）：耗尽重试仍失败的毒消息归档在这里，既不被再次领取，也不丢失
        # （镜像 Spring Cloud Stream 的 DLQ 语义——毒消息隔离而非无限重试或静默丢弃）。
        self._dead: list[dict[str, Any]] = []

    async def enqueue(self, payload: dict[str, Any]) -> Job:
        job = Job(
            id=f"job_{uuid.uuid4().hex[:16]}",
            requestId=str(payload.get("requestId") or ""),
            status="queued",
            backend=self.backend,
            queuedAt=utc_now(),
            payload=payload,
            activities=[
                {
                    "stage": "queue",
                    "status": "info",
                    "summary": f"已进入 {self.backend} 队列，等待 worker 领取",
                    "at": utc_now(),
                }
            ],
        )
        async with self._lock:
            self._jobs[job.id] = job
            self._pending.append(job.id)
            self._purge()
        return job

    async def claim(self) -> Job | None:
        async with self._lock:
            while self._pending:
                candidate = self._jobs.get(self._pending.popleft())
                # 队列里的 id 可能指向已被淘汰或被改状态的作业：跳过，不能同时被两个 worker 领走
                if candidate is not None and candidate.status == "queued":
                    candidate.status = "running"
                    candidate.startedAt = utc_now()
                    candidate.activities.append(
                        {"stage": "queue", "status": "running", "summary": "worker 已领取，开始调用 provider", "at": utc_now()}
                    )
                    return candidate
            return None

    async def save(self, job: Job) -> None:
        async with self._lock:
            self._jobs[job.id] = job

    async def get(self, job_id: str) -> Job | None:
        async with self._lock:
            return self._jobs.get(job_id)

    async def request_cancel(self, job_id: str) -> Job | None:
        """受理一次取消（§162 取消/重试）：先立标志，排队中的顺手落成终态。

        顺序是"先标志后状态"：`running` 的作业只立标志，状态由 worker 在检查点落成
        `cancelled`——这里直接改 running 会在与 claim/save 的交错里把作业本体写回旧状态。
        返回受理之后的那一份；作业不存在返回 None。
        """
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            self._cancel_requested.add(job_id)
            if job.status == "queued":
                job.status = "cancelled"
                job.finishedAt = utc_now()
                job.activities.append({"stage": "queue", "status": "info", "summary": CANCEL_NOTE_QUEUED, "at": job.finishedAt})
            return job

    async def is_cancel_requested(self, job_id: str) -> bool:
        async with self._lock:
            return job_id in self._cancel_requested

    async def requeue(self, job: Job) -> None:
        """失败后可重试：重新挂回 pending 队列（锁内，与 claim 互斥，不会让同一件被领两次）。"""
        async with self._lock:
            self._jobs[job.id] = job
            self._pending.append(job.id)
            self._purge()

    async def route_to_dead_letter(self, job: Job, *, reason: str) -> None:
        """毒消息归档：耗尽重试仍失败，落死信而不是无限重试（也不静默丢）。"""
        async with self._lock:
            self._dead.append({"job": job.public(), "attempts": job.attempts, "reason": reason})
            trim_list(self._dead, self.max_dead_letters)
            # 作业本体保留一份终态 failed，方便按 jobId 仍能查到（与死信的归档互为冗余，不冲突）
            job.status = "failed"
            job.finishedAt = utc_now()
            job.activities.append(
                {"stage": "queue", "status": "failed", "summary": f"已路由到死信：{reason}", "at": job.finishedAt}
            )
            self._jobs[job.id] = job

    async def dead_letters(self) -> list[dict[str, Any]]:
        async with self._lock:
            return list(self._dead)

    async def counts(self) -> tuple[int, int]:
        async with self._lock:
            return self._counts_locked()

    def _counts_locked(self) -> tuple[int, int]:
        pending = sum(1 for j in self._jobs.values() if j.status == "queued")
        running = sum(1 for j in self._jobs.values() if j.status == "running")
        return pending, running

    async def renew_lease(self, job_id: str) -> None:
        # 与 Redis 后端同一套调用（Worker 不看后端）：内存里"续租"没有对象可续，直接返回。
        return None


    def _purge(self) -> None:
        if len(self._jobs) <= self._max_jobs:
            return
        finished = [j for j in self._jobs.values() if j.status in TERMINAL]
        for job in sorted(finished, key=lambda j: j.finishedAt or "")[: len(self._jobs) - self._max_jobs]:
            self._jobs.pop(job.id, None)
            self._cancel_requested.discard(job.id)

    async def close(self) -> None:
        return None


class RedisJobStore:
    """Redis 队列：跨进程可见。作业本体是一个带 TTL 的 key，pending 是一个 list，
    running 是一个**带租约的有序集合**（score=租约到期时刻）——见 `counts()`。"""

    backend = "redis"
    note = "作业存在 Redis 里（带 TTL）：重启不丢，多副本部署时轮询打到任何一台都能查到。"

    def __init__(self, client: Any, *, prefix: str = "nexus:ai", ttl_s: int = 3600, max_attempts: int = 1, max_dead_letters: int = DEFAULT_MAX_DEAD_LETTERS, lease_s: float | None = None) -> None:
        # 没点名就给 TTL 的四分之一、上限 180s：心跳让短租约变得便宜（续一条 id 一条命令），
        # 于是"worker 崩了之后 running 虚高多久"这个上界能从 3600s（旧写法的 TTL）压到分钟级。
        # 四分之一是硬约束——租约比本体活得久，就会留下谁也查不到的永久虚账；
        # 跟着 TTL 走而不是夹一个下限，是因为短 TTL 的构造（测试里 1s 过期）也是合法部署。
        lease_s = float(lease_s) if lease_s is not None else min(180.0, max(0.05, ttl_s / 4.0))
        # 租约必须比作业本体的 TTL 短，否则会出现"本体已过期、索引里还挂着 id"的永久虚账：
        # 那条 id 谁也查不到作业，却永远算进 running。判据与 ADR 0130 的 flight 租约同族
        # （那边是 lease < wait_timeout，这边是 lease < ttl）。构造期就抛，不留到运行时数错。
        if not 0 < lease_s < ttl_s:
            raise ValueError(
                f"lease_s={lease_s} 必须落在 (0, ttl_s={ttl_s}) 之间："
                "租约比 TTL 长会让过期作业的 id 永久留在 running 索引里，租约为 0 则没人能算出 running"
            )
        self._r = client
        self._prefix = prefix
        self._ttl = ttl_s
        self.lease_s = float(lease_s)
        self.max_attempts = max(1, max_attempts)  # <=1 表示不重试（默认零回归）
        self.max_dead_letters = max(0, max_dead_letters)  # 0 = 不限（ADR 0121）

    @classmethod
    async def connect(cls, url: str, *, prefix: str = "nexus:ai", ttl_s: int = 3600, max_attempts: int = 1, max_dead_letters: int = DEFAULT_MAX_DEAD_LETTERS, lease_s: float | None = None) -> "RedisJobStore":
        import redis.asyncio as aioredis  # 惰性导入：没配 Redis 时不需要这个依赖

        # ADR 0274 / ADR 0119：黑洞 Redis（TCP 可连、永不回包，例如 WSL/Docker 引擎挂掉后遗留的 relay）
        # 必须有界——没有超时就会拖死整条 provider 路径。3s 连不上就抛（本地启动按 ADR-0274
        # 走 DEGRADED-BOOT 或启动失败），3s 读不到就抛（缓存 fail-open）。
        client = aioredis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=3,
            socket_timeout=3,
        )
        await client.ping()
        return cls(client, prefix=prefix, ttl_s=ttl_s, max_attempts=max_attempts, max_dead_letters=max_dead_letters, lease_s=lease_s)

    def _key(self, job_id: str) -> str:
        return f"{self._prefix}:job:{job_id}"

    @property
    def _pending_key(self) -> str:
        return f"{self._prefix}:jobs:pending"

    async def enqueue(self, payload: dict[str, Any]) -> Job:
        job = Job(
            id=f"job_{uuid.uuid4().hex[:16]}",
            requestId=str(payload.get("requestId") or ""),
            status="queued",
            backend=self.backend,
            queuedAt=utc_now(),
            payload=payload,
            activities=[
                {"stage": "queue", "status": "info", "summary": f"已进入 {self.backend} 队列，等待 worker 领取", "at": utc_now()}
            ],
        )
        await self._r.set(self._key(job.id), json.dumps(asdict(job), ensure_ascii=False), ex=self._ttl)
        await self._r.rpush(self._pending_key, job.id)
        return job

    async def claim(self) -> Job | None:
        # LPOP 是原子的：同一个 id 不会被两个 worker 同时领走
        job_id = await self._r.lpop(self._pending_key)
        while job_id:
            job = await self.get(str(job_id))
            if job is not None and job.status == "queued":
                job.status = "running"
                job.startedAt = utc_now()
                job.activities.append(
                    {"stage": "queue", "status": "running", "summary": "worker 已领取，开始调用 provider", "at": utc_now()}
                )
                await self.save(job)
                return job
            job_id = await self._r.lpop(self._pending_key)
        return None

    @property
    def _running_key(self) -> str:
        # 前缀刻意不是 `job:`：它不是作业本体，不该被任何按 `job:*` 找本体的逻辑当成作业
        # （`_cancel_key` 当年同一条理由，见下面注释）。
        return f"{self._prefix}:jobs:running"

    def _deadline(self) -> float:
        return time.time() + self.lease_s

    async def save(self, job: Job) -> None:
        """写作业本体，再把 running 索引跟着改到位（两条命令，本体在前）。

        索引只在**这一处**收口：claim 落 running、终态落 completed/failed/cancelled、
        重试回 queued 全走 save。绕过 save 直接 set 本体的路径必须自己负责——
        原来有两条（`requeue`、`route_to_dead_letter`），现在都改成走 save。

        不合并成一条 pipeline：多等一次往返发生在写侧（作业寿命由 provider 决定，几毫秒不算），
        而 pipeline 要求每个测试替身都模拟批处理，那笔代价是真实的。
        顺序是"先本体后索引"：中间断线的话，索引只是**落后**于真值（漏算一件在跑的），
        而反过来会得到一件账上在跑、本体里根本没这回事的幽灵。前者下一次 save 就补上，
        后者要等一个租约周期才出账——所以选前者。
        """
        await self._r.set(self._key(job.id), json.dumps(asdict(job), ensure_ascii=False), ex=self._ttl)
        if job.status == "running":
            await self._r.zadd(self._running_key, {job.id: self._deadline()})
        else:
            await self._r.zrem(self._running_key, job.id)

    async def renew_lease(self, job_id: str) -> None:
        """给还在跑的作业续租。用 XX：**只更新已经在账上的 id**。

        普通 ZADD 在这里是错的：心跳与 save 是两条独立的路，worker 落了终态之后还可能有
        一次在飞的心跳回来，普通 ZADD 会把刚摘掉的 id 又挂回去，`/healthz` 从此凭空多一件在跑。
        XX 让迟到的心跳变成一次空操作（返回 0，不报错）。
        """
        await self._r.zadd(self._running_key, {job_id: self._deadline()}, xx=True)

    async def get(self, job_id: str) -> Job | None:
        raw = await self._r.get(self._key(job_id))
        if raw is None:
            return None
        data = json.loads(raw)
        return Job(**data)

    def _cancel_key(self, job_id: str) -> str:
        # 取消标志是独立的 key：作业本体整份 JSON 写回，标志塞在里面会被并发 save 抹掉。
        # 前缀刻意不用 `job:`——counts() 按 `prefix:job:*` 扫作业本体，混进去会把 "1" 当 JSON 解析
        return f"{self._prefix}:jobcancel:{job_id}"

    @property
    def _dead_key(self) -> str:
        # 死信列表：与作业本体、pending、取消标志都不同前缀，避免被 counts() 的 job:* 扫描或作业淘汰误删
        return f"{self._prefix}:dead"

    async def request_cancel(self, job_id: str) -> Job | None:
        if not await self._r.exists(self._key(job_id)):
            return None
        await self._r.set(self._cancel_key(job_id), "1", ex=self._ttl)
        job = await self.get(job_id)
        if job is None:
            return None
        if job.status == "queued":
            job.status = "cancelled"
            job.finishedAt = utc_now()
            job.activities.append({"stage": "queue", "status": "info", "summary": CANCEL_NOTE_QUEUED, "at": job.finishedAt})
            await self.save(job)
            # 从 pending list 摘掉：counts() 以 list 长度报 pending，不摘的话一个已取消作业
            # 会永远占着一格（不显眼，但它让 /healthz 报的 pending 一直多一件，且与 memory 后端口径分叉）。
            # 若 claim 已先原子弹出此 id，LREM 摘到零条——无副作用、无竞态。
            try:
                await self._r.lrem(self._pending_key, 0, job_id)
            except Exception:  # noqa: BLE001 - 摘失败不改业务正确性：claim 侧有过滤兜底
                pass
        return job

    async def is_cancel_requested(self, job_id: str) -> bool:
        return bool(await self._r.exists(self._cancel_key(job_id)))

    async def requeue(self, job: Job) -> None:
        """失败后可重试：重新挂回 pending（RPUSH 追加 = 先进先出，重试件排到队尾）。

        走 save 而不是裸 set：这一件的状态刚从 running 回到 queued，索引必须跟着摘掉，
        否则重试中的作业会被算成"在跑"，pending 与 running 同时 +1（一件事记两次）。
        """
        await self.save(job)
        await self._r.rpush(self._pending_key, job.id)

    async def route_to_dead_letter(self, job: Job, *, reason: str) -> None:
        """毒消息归档：耗尽重试仍失败，LPUSH 到死信列表（保留 TTL，随前缀清理）；本体留 failed 终态。"""
        job.status = "failed"
        job.finishedAt = utc_now()
        job.activities.append(
            {"stage": "queue", "status": "failed", "summary": f"已路由到死信：{reason}", "at": job.finishedAt}
        )
        await self.save(job)  # 也在这里摘 running 索引：终态就是终态，不管它是谁写的
        await self._r.lpush(
            self._dead_key,
            json.dumps({"job": job.public(), "attempts": job.attempts, "reason": reason}, ensure_ascii=False),
        )
        await self._r.expire(self._dead_key, self._ttl)
        try:
            await trim_command(self._r, self._dead_key, self.max_dead_letters)
        except Exception:
            pass  # 容量裁剪是 guardrail 不是主路径；失败不能拖垮死信归档

    async def dead_letters(self) -> list[dict[str, Any]]:
        raws = await self._r.lrange(self._dead_key, 0, -1)
        return [json.loads(r) for r in raws]

    async def counts(self) -> tuple[int, int]:
        """三条命令：LLEN + ZREMRANGEBYSCORE + ZCARD，与键空间大小无关。

        旧写法是 `SCAN(prefix:job:*) + 每个命中一次 GET`，实测（2026-11-23，本机 nexus-redis
        的独立 db9，判据数的是**命令条数**而不是时间——时间在这台机器上有并行会话污染）：

        | 键空间 | counts() 发出的命令 | 墙钟 |
        |---|---|---|
        | 100 个作业键 | 102 条 | 213ms |
        | 1000 个作业键 | 1007 条 | 2.28s |
        | 5000 个作业键 | 5026 条 | **21.3s** |
        | 20000 个**别的前缀**的键 + 1 个作业 | 102 条 | 221ms |

        两个结论：GET 那一段随"存活的作业数"线性涨，SCAN 那一段随**整个键空间**涨
        （MATCH 是先遍历再过滤，不是按索引取）。而 `/healthz` 只给这次读数 0.35s 预算，
        作业本体 TTL 又是 3600s——所以代价随**吞吐×TTL**积累，不随并发：跑过大约 80 件作业之后
        队列读数就永久退化成 `counts-unavailable:TimeoutError` 并报 0/0，恰好在用户最多的时候。

        租约取代了"逐个体检"：worker 崩了/被 kill 掉的 id 到了 `lease_s` 自己出账，
        不需要谁去读本体确认——这也是为什么 overcount 的上界是 `lease_s`，
        而不是旧写法那个"到 TTL 之前一直算在跑"的 3600s。

        LLEN 仍然够用：唯一会残留在 list 里却非 queued 的就是"已取消的排队作业"，
        它在 request_cancel 里已被 LREM 摘掉（取消先于 claim 的封底路径还有 claim 的过滤）。
        """
        pending = int(await self._r.llen(self._pending_key) or 0)
        await self._r.zremrangebyscore(self._running_key, 0, time.time())
        running = int(await self._r.zcard(self._running_key) or 0)
        return pending, running

    async def close(self) -> None:
        await self._r.aclose()


class Worker:
    """N 个协程 worker：领作业 → 跑与同步路由完全相同的管线 → 写回结果。"""

    def __init__(self, store: JobStore, registry: Registry, *, capacity: int = 1, poll_s: float = 0.2) -> None:
        self.store = store
        self._registry = registry
        self.capacity = max(1, capacity)
        self._poll_s = poll_s
        self._tasks: list[asyncio.Task[None]] = []
        self._stopping = asyncio.Event()
        # 这个进程**此刻正在跑**的作业 id：心跳只给它们续租，不给别人续，也不给历史续。
        self._inflight: set[str] = set()

    async def start(self) -> None:
        if self._tasks:
            return
        self._stopping.clear()
        self._tasks = [asyncio.create_task(self._loop(i)) for i in range(self.capacity)]
        if getattr(self.store, "lease_s", 0) > 0:
            # 内存后端 lease_s==0：账就是对象状态，没有租约可续，起个空转的任务只是噪声。
            self._tasks.append(asyncio.create_task(self._heartbeat()))

    async def stop(self) -> None:
        self._stopping.set()
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            try:
                await task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001 - 关停阶段只关心"别漏异常"
                pass
        self._tasks = []
        await self.store.close()

    async def _loop(self, _slot: int) -> None:
        while not self._stopping.is_set():
            job = await self.store.claim()
            if job is None:
                try:
                    await asyncio.wait_for(self._stopping.wait(), timeout=self._poll_s)
                except asyncio.TimeoutError:
                    pass
                continue
            self._inflight.add(job.id)
            try:
                await self.run_job(job)
            finally:
                # 摘牌放在 finally：run_job 自己已经把终态写回并 ZREM 了，这里只是别再给
                # 一个已经终态的 id 续租（心跳会 ZADD XX，账上没这条就是空操作，不会复活）。
                self._inflight.discard(job.id)

    async def _heartbeat(self) -> None:
        """按 `lease_s/3` 给在飞的作业续租。

        为什么非要心跳：一件作业的寿命由 provider 决定（`request_timeout_s` 就是 180s），
        不由租约决定。没有续租，租约只能取"最长可能作业时间"那种保守值，
        于是 worker 崩了以后 `/healthz` 要在那么久之后才不虚报 running。
        有了续租，租约可以短到分钟级，虚报上界跟着一起缩。

        为什么除以 3：要留出**连续丢两拍**的余量——一拍可能被一次 CPU 密集的序列化挤掉，
        两拍连着丢才说明进程真的有问题，那时让它出账正是想要的行为。

        为什么下界是 50ms 而不是 1s（test_running_index.py 的第四臂抓出来的）：
        原本写作 `max(1.0, lease_s / 3)`，于是**任何租约短于 3s 的配置都永远续不上**——
        第一拍落在租约到期之后，还在跑的作业会被 `/healthz` 报成 0，而这恰好是"心跳没工作"
        时最难发现的失败模式（数字看着正常，只是少了）。租约是运维点名的，不是我们能假设的。
        """
        beat = max(0.05, self.store.lease_s / 3.0)
        while not self._stopping.is_set():
            try:
                await asyncio.wait_for(self._stopping.wait(), timeout=beat)
            except TimeoutError:  # 正常的"到点了，该续租"
                pass
            for job_id in list(self._inflight):
                try:
                    await self.store.renew_lease(job_id)
                except Exception:  # noqa: BLE001,S110 - 一拍失败只是这一拍没续上：
                    # 租约到点自然出账，下一拍接着续。让心跳任务整体死掉更糟——那之后
                    # 所有在飞的作业都会陆续掉账，/healthz 会把"正在跑"报成 0。
                    pass

    async def run_job(self, job: Job) -> Job:
        """跑一件活并把结果写回。管线内部已经把所有失败变成 (状态码, 错误报文)，
        这里再兜一层异常：worker 崩了不能让作业永远停在 running。

        取消（§162 取消/重试）在这两个检查点生效，**不打断正在飞的 provider 调用**：
        - 执行前看到取消：一件活都没干，直接落 cancelled（那次调用压根没发生）；
        - 执行后看到取消：结果丢弃、按 cancelled 落库。丢结果而不是报完成，是因为
          调用方已经拿到了"取消受理"的答复——再报一次 completed 就是对同一个作业说两件事。
        标志在两次检查之间才被立起的竞态是承认的边界：那个作业会被记成 completed，
        web 侧的账本行早已是 cancelled（CAS 挡着回写），结果不会交回编辑区。
        """
        if await self.store.is_cancel_requested(job.id):
            job.status = "cancelled"
            job.finishedAt = utc_now()
            job.activities.append(
                {"stage": "queue", "status": "info", "summary": CANCEL_NOTE_STARTED, "at": job.finishedAt}
            )
            await self.store.save(job)
            return job
        try:
            status, body = await execute_ai_request(job.payload, registry=self._registry)
        except Exception as exc:  # noqa: BLE001
            status, body = 500, error("internal", f"worker 执行作业时抛出未预期异常：{type(exc).__name__}: {exc}")
        if await self.store.is_cancel_requested(job.id):
            job.status = "cancelled"
            job.finishedAt = utc_now()
            job.result = None
            job.error = None
            job.activities.append(
                {"stage": "queue", "status": "info", "summary": CANCEL_NOTE_DISCARDED, "at": job.finishedAt}
            )
            await self.store.save(job)
            return job
        succeeded = 200 <= status < 300
        if not succeeded:
            # 有界重试 + 死信（v686，镜像 Spring Cloud Stream DLQ + Spring Retry）：
            # 默认 max_attempts=1 时此分支整体跳过（仍落 failed 终态，零回归）；
            # opt-in 开启后，未耗尽则重新入队，耗尽则路由死信而非无限重试或静默丢。
            job.attempts += 1
            if self.store.max_attempts >= 2 and job.attempts < self.store.max_attempts:
                job.status = "queued"
                job.startedAt = None
                job.finishedAt = None
                job.activities.append(
                    {
                        "stage": "queue",
                        "status": "info",
                        "summary": f"第 {job.attempts} 次失败，重新入队等待重试（上限 {self.store.max_attempts}）",
                        "at": utc_now(),
                    }
                )
                await self.store.requeue(job)
                return job
            if self.store.max_attempts >= 2:
                await self.store.route_to_dead_letter(
                    job, reason=f"重试 {job.attempts} 次仍失败（HTTP {status}），路由到死信"
                )
                return job
        job.result = body if succeeded else None
        job.error = None if succeeded else body
        # 契约层的 200 就是真 200；4xx/5xx 一律算作业失败，不留"看起来完成了"的中间态
        job.status = "completed" if succeeded else "failed"
        job.finishedAt = utc_now()
        job.activities.append(
            {
                "stage": "queue",
                "status": "completed" if job.status == "completed" else "failed",
                "summary": (
                    f"作业结束：{job.status}（HTTP {status}）"
                    if job.status == "failed"
                    else "作业结束：结果已可取"
                ),
                "at": job.finishedAt,
            }
        )
        await self.store.save(job)
        return job


def job_capacity(env: dict[str, str] | None = None) -> int:
    raw = (env or os.environ).get("AI_SERVICE_JOB_CONCURRENCY", "1")
    try:
        return max(1, int(raw))
    except ValueError:
        return 1


def _max_attempts(env: Mapping[str, str] | None = None) -> int:
    """每件作业允许的总尝试次数：默认 1（不重试，零回归）；opt-in >=2 开启有界重试 + 死信。"""
    raw = (env or os.environ).get("AI_SERVICE_JOB_MAX_ATTEMPTS", "1")
    try:
        return max(1, int(raw))
    except ValueError:
        return 1


def _degraded_store_allowed(source: Mapping[str, str]) -> bool:
    """§降级档：默认 fail-fast（绝不静默退回内存）；AI_SERVICE_ALLOW_DEGRADED_STORE=1 显式 opt-in 才走 DEGRADED-BOOT。"""
    return (source.get("AI_SERVICE_ALLOW_DEGRADED_STORE") or "").strip() == "1"


def _degraded_memory_store(source: Mapping[str, str], exc: BaseException) -> MemoryJobStore:
    store = MemoryJobStore(
        max_attempts=_max_attempts(source),
        max_dead_letters=parse_max_dead_letters(source),
    )
    store.note = (
        f"【DEGRADED-BOOT】Redis 连不上（{type(exc).__name__}），已退回内存后端——"
        "任务重启即失；绝不在生产启用。（ADR 0274）"
    )
    return store


async def build_store(env: Mapping[str, str] | None = None, *, prefix: str = "nexus:ai") -> JobStore:
    """配了 NEXUS_REDIS_URL 就用 Redis；连不上就抛出让服务启动失败，绝不悄悄退回内存后端。

    例外只有一条：显式 `AI_SERVICE_ALLOW_DEGRADED_STORE=1` 的 opt-in（见 ADR 0274）——
    仍然启动，但 healthz 会把 note 写成【DEGRADED-BOOT】明牌，绝不是静默降级。
    """
    source = env if env is not None else os.environ
    url = (source.get("NEXUS_REDIS_URL") or "").strip()
    if not url:
        return MemoryJobStore(max_attempts=_max_attempts(source), max_dead_letters=parse_max_dead_letters(source))
    ttl = int(source.get("AI_SERVICE_JOB_TTL_S", "3600") or "3600")
    # 租约上界由 RedisJobStore 构造函数把（lease < ttl 是要抛的，不是要悄悄夹的：
    # 夹了之后"虚报多久"这个运维参数就不再是运维填的那个数）
    lease = float(source.get("AI_SERVICE_JOB_LEASE_S", "0") or 0) or None
    if not _degraded_store_allowed(source):
        return await RedisJobStore.connect(url, prefix=prefix, ttl_s=max(60, ttl), max_attempts=_max_attempts(source), max_dead_letters=parse_max_dead_letters(source), lease_s=lease)
    try:
        return await RedisJobStore.connect(url, prefix=prefix, ttl_s=max(60, ttl), max_attempts=_max_attempts(source), max_dead_letters=parse_max_dead_letters(source), lease_s=lease)
    except Exception as exc:  # noqa: BLE001 — 明牌降级必须捕获一切连接期错误
        # 明牌打印给进程日志；healthz 侧 note 也会带【DEGRADED-BOOT】（_State.store.note 已实装）
        print(f"[ai-service][DEGRADED-BOOT] Redis unreachable ({type(exc).__name__}: {exc}); "
              f"AI_SERVICE_ALLOW_DEGRADED_STORE=1 → MemoryJobStore. 任务重启即失；绝不在生产启用。（ADR 0274）")
        return _degraded_memory_store(source, exc)
