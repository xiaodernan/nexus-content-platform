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
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping, Protocol

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

    async def enqueue(self, payload: dict[str, Any]) -> Job: ...
    async def claim(self) -> Job | None: ...
    async def save(self, job: Job) -> None: ...
    async def get(self, job_id: str) -> Job | None: ...
    async def counts(self) -> tuple[int, int]: ...
    async def request_cancel(self, job_id: str) -> Job | None: ...
    async def is_cancel_requested(self, job_id: str) -> bool: ...
    async def close(self) -> None: ...


CANCEL_NOTE_STARTED = "取消请求已受理：worker 在开始执行前停下，provider 没有被调用"
CANCEL_NOTE_DISCARDED = "取消请求已受理：provider 调用已经返回，结果按取消丢弃（不谎报成完成）"
CANCEL_NOTE_QUEUED = "排队中被取消：worker 不会领取这一件"


class MemoryJobStore:
    """单进程内存队列：默认后端。有上限，超出的旧作业按完成时间先后丢掉。"""

    backend = "memory"
    note = "作业只存在当前 ai-service 进程里：重启即失，多副本部署时轮询可能打到另一台查不到。"

    def __init__(self, *, max_jobs: int = 200) -> None:
        self._jobs: dict[str, Job] = {}
        self._pending: list[str] = []
        self._lock = asyncio.Lock()
        self._max_jobs = max_jobs
        # 取消标志与作业本体分开存：作业本体各处都会整份写回，
        # 把标志塞进去就会出现"worker 的一次 save 把取消请求抹掉"这种竞态
        self._cancel_requested: set[str] = set()

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
                candidate = self._jobs.get(self._pending.pop(0))
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

    async def counts(self) -> tuple[int, int]:
        async with self._lock:
            return self._counts_locked()

    def _counts_locked(self) -> tuple[int, int]:
        pending = sum(1 for j in self._jobs.values() if j.status == "queued")
        running = sum(1 for j in self._jobs.values() if j.status == "running")
        return pending, running

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
    """Redis 队列：跨进程可见。作业本体是一个带 TTL 的 key，pending 是一个 list。"""

    backend = "redis"
    note = "作业存在 Redis 里（带 TTL）：重启不丢，多副本部署时轮询打到任何一台都能查到。"

    def __init__(self, client: Any, *, prefix: str = "nexus:ai", ttl_s: int = 3600) -> None:
        self._r = client
        self._prefix = prefix
        self._ttl = ttl_s

    @classmethod
    async def connect(cls, url: str, *, prefix: str = "nexus:ai", ttl_s: int = 3600) -> "RedisJobStore":
        import redis.asyncio as aioredis  # 惰性导入：没配 Redis 时不需要这个依赖

        client = aioredis.from_url(url, decode_responses=True)
        await client.ping()
        return cls(client, prefix=prefix, ttl_s=ttl_s)

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

    async def save(self, job: Job) -> None:
        await self._r.set(self._key(job.id), json.dumps(asdict(job), ensure_ascii=False), ex=self._ttl)

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
        return job

    async def is_cancel_requested(self, job_id: str) -> bool:
        return bool(await self._r.exists(self._cancel_key(job_id)))

    async def counts(self) -> tuple[int, int]:
        # 队列长度是 Redis 给的，不需要 SCAN 全部 key（那会随作业数线性变贵）
        pending = int(await self._r.llen(self._pending_key) or 0)
        running = 0
        async for key in self._r.scan_iter(match=f"{self._prefix}:job:*", count=200):
            raw = await self._r.get(key)
            if raw and json.loads(raw).get("status") == "running":
                running += 1
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

    async def start(self) -> None:
        if self._tasks:
            return
        self._stopping.clear()
        self._tasks = [asyncio.create_task(self._loop(i)) for i in range(self.capacity)]

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
            await self.run_job(job)

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
        job.result = body if 200 <= status < 300 else None
        job.error = None if 200 <= status < 300 else body
        # 契约层的 200 就是真 200；4xx/5xx 一律算作业失败，不留"看起来完成了"的中间态
        job.status = "completed" if 200 <= status < 300 else "failed"
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


async def build_store(env: Mapping[str, str] | None = None, *, prefix: str = "nexus:ai") -> JobStore:
    """配了 NEXUS_REDIS_URL 就用 Redis；连不上就抛出让服务启动失败，绝不悄悄退回内存后端。"""
    source = env if env is not None else os.environ
    url = (source.get("NEXUS_REDIS_URL") or "").strip()
    if not url:
        return MemoryJobStore()
    ttl = int(source.get("AI_SERVICE_JOB_TTL_S", "3600") or "3600")
    return await RedisJobStore.connect(url, prefix=prefix, ttl_s=max(60, ttl))
