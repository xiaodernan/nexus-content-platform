"""**跨进程** completion-cache single-flight（v697 / ADR 0129，ADR 0128 仍欠 ①）。

v696 的 `SingleFlight` 只在**一个进程内**合并并发 miss。多副本部署时，A/B 两个实例
各自拿到同一份 prompt、各自 miss 共享的 Redis completion cache，仍然会各打一次真 LLM。
本片把"同 key 只放一个 leader 过去"扩展到进程之间：

    Redis `SET lock token NX EX lease`  -> 抢到的实例是 leader，直接打真调用；
    其余实例轮询 **本次 leader 专属的 done 标记**，出现后从共享缓存 peek 结果；
    等不到（leader 崩溃 / 缓存没读到 / Redis 抖动）就自己补打一次真调用。

为什么用"轮询 done 标记 + peek 共享缓存"而不是 pub/sub 广播序列化结果：
结果本来就要写进 `RedisLlmCompletionCache`（ADR 0119），再广播一份等于造第二个真值源，
还要定义跨进程序列化、版本、丢弃策略。让 follower 读**同一个缓存**是唯一真值，
也天然复用了 TTL / 毒条目自愈 / 降级纪律。

§159 诚实边界（六条，全有门）：
1. **leader 失败不写 done**：leader 抛异常时不留"成功"标记，follower 超时后自己补打，
   绝不返回半条结果、绝不静默重试。
2. **不删别人的锁**：锁靠 `SET NX EX` 租约 + TTL 自然过期，leader 完工**不 DEL**。
   删锁必须先比对 token，无 Lua 纪律（ADR 0119）下会误删继任者的锁。
3. **标记绑定本轮 token**：done key 是 `lock:done:<owner_token>`，不是 `lock:done`。
   否则上一轮留下的旧标记会让新一轮 miss 直接 peek 到过期/串台的结果。
4. **peek 不到就自己打**：done 到了但共享缓存读不到（过期/淘汰/降级）→ `peek_misses`
   如实计数并补打真调用，不返回 `None`、不伪造命中。
5. **Redis 故障 fail-open**：`SET`/`GET` 抛异常一律按"没有协调"处理，自己打真调用，
   缓存/锁故障绝不打挂 provider 主路径（ADR 0119 同款降级）。
6. **合并 ≠ 命中**：`coalesced` 单独记账。follower 的 `peek` 若真的命中缓存，
   由缓存自己的 `stats().hits` 计一次——那是**真实**的跨进程缓存命中，不是虚报。

复杂度（ADR 0112）：每个 key 一个定点 `SET NX` + 定点 `GET`，无 `KEYS`/`SCAN`，
无全量遍历；轮询次数 ~ `wait_timeout_s / poll_interval_s`，与缓存条目数无关。
`lock_key` 是 `sha256(各键段 NUL 拼接)`，与 `redis_completion_cache._digest` 同形，
保证不同进程对同一 CacheKey 算出同一个锁名。

作用域：`CompositeFlight` 把进程内 `SingleFlight` 套在分布式层外面——
**先在本进程合并**，只有本进程的 leader 才去抢跨进程锁，避免同机 N 个线程
同时打 Redis。默认不启用（`NEXUS_LLM_DISTRIBUTED_SINGLE_FLIGHT=0`），零回归。
"""
from __future__ import annotations

import hashlib
import math
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Hashable

# CacheKey 是 4 段字符串元组；用 NUL 分隔，段内任意字符都不会串位。
def lock_key(namespace: str, key: tuple[str, ...]) -> str:
    """锁名单点真值：两个进程必须对同一 key 算出同一个名字。"""
    digest = hashlib.sha256()
    for part in key:
        digest.update(part.encode("utf-8"))
        digest.update(b"\0")
    return f"{namespace.rstrip(':')}:flight:{digest.hexdigest()[:32]}"


def done_key(lock: str, token: str) -> str:
    """done 标记按**本轮 leader token**分桶，杜绝旧标记被新一轮复用。"""
    return f"{lock}:done:{token}"


def _text(value: Any) -> str | None:
    """redis-py `decode_responses` 可开可关：str / bytes 都要认，其余按无值。"""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, str):
        return value
    return None


@dataclass(frozen=True)
class DFlightStats:
    """跨进程协调的诚实账本。real_calls = 真的打了 provider 的次数。"""

    leaders: int = 0          # 抢到跨进程锁、自己打真调用
    joined: int = 0           # 等别人结果的次数
    coalesced: int = 0        # 因跨进程合并**省掉**的真调用
    timeouts: int = 0         # 等到上限（含锁过期 / peek 不到）
    self_served: int = 0      # 超时或 peek 不到后自己补打
    lock_failures: int = 0    # SET NX 抛异常 → fail-open 自己打
    marker_failures: int = 0  # done 标记写失败（follower 会超时自补，如实记）
    peek_misses: int = 0      # done 已到但共享缓存读不到

    @property
    def real_calls(self) -> int:
        """真调用 = leader 次数 + 所有 fail-open / 超时自补的次数。"""
        return self.leaders + self.self_served


class DistributedSingleFlight:
    """跨进程合并同 key 的 miss。`client` 是任意实现了 `set(..., nx, ex)` / `get` 的对象。

    `now` / `sleep` / `token_factory` 可注入，只为让门确定性验证超时与租约；
    生产不需要传。`peek` 读共享缓存（通常是 `RedisLlmCompletionCache.get`）。
    """

    def __init__(
        self,
        client: Any,
        *,
        peek: Callable[[Hashable], Any],
        namespace: str = "nexus:llmc",
        wait_timeout_s: float = 30.0,
        poll_interval_s: float = 0.05,
        lease_s: float = 30.0,
        marker_ttl_s: float = 30.0,
        now: Callable[[], float] | None = None,
        sleep: Callable[[float], None] | None = None,
        token_factory: Callable[[], str] | None = None,
    ) -> None:
        # ADR 0114：显式拒绝无效策略，别静默退化成"永不合并"或"无限挂住"。
        if wait_timeout_s <= 0:
            raise ValueError("wait_timeout_s 必须为正数")
        if poll_interval_s <= 0 or poll_interval_s > wait_timeout_s:
            raise ValueError("poll_interval_s 必须为正且不大于 wait_timeout_s")
        if lease_s < wait_timeout_s:
            raise ValueError("lease_s 不得小于 wait_timeout_s：锁先过期会让 follower 提前自补")
        if marker_ttl_s <= 0:
            raise ValueError("marker_ttl_s 必须为正数")
        self._client = client
        self._peek = peek
        self._ns = namespace.rstrip(":")
        self._wait_timeout_s = float(wait_timeout_s)
        self._poll_interval_s = float(poll_interval_s)
        self._lease_s = float(lease_s)
        self._marker_ttl_s = float(marker_ttl_s)
        self._now = now or time.monotonic
        self._sleep = sleep or time.sleep
        self._token_factory = token_factory or (lambda: uuid.uuid4().hex)
        self._lock = threading.Lock()
        self._leaders = 0
        self._joined = 0
        self._coalesced = 0
        self._timeouts = 0
        self._self_served = 0
        self._lock_failures = 0
        self._marker_failures = 0
        self._peek_misses = 0

    def stats(self) -> DFlightStats:
        with self._lock:
            return DFlightStats(
                leaders=self._leaders,
                joined=self._joined,
                coalesced=self._coalesced,
                timeouts=self._timeouts,
                self_served=self._self_served,
                lock_failures=self._lock_failures,
                marker_failures=self._marker_failures,
                peek_misses=self._peek_misses,
            )

    def _bump(self, name: str) -> None:
        with self._lock:
            setattr(self, name, getattr(self, name) + 1)

    def run(self, key: tuple[str, ...], work: Callable[[], Any]) -> Any:
        token = self._token_factory()
        lock = lock_key(self._ns, key)
        try:
            acquired = bool(
                self._client.set(lock, token, nx=True, ex=max(1, math.ceil(self._lease_s)))
            )
        except Exception:  # noqa: BLE001 - 缓存/锁故障必须 fail-open，不打挂主路径
            self._bump("_lock_failures")
            self._bump("_self_served")
            return work()

        if acquired:
            self._bump("_leaders")
            # 异常原样抛出、**不写 done**：follower 只能等超时后自补。
            result = work()
            try:
                self._client.set(
                    done_key(lock, token), "1", ex=max(1, math.ceil(self._marker_ttl_s))
                )
            except Exception:  # noqa: BLE001 - 标记写失败如实记，不伪装成功
                self._bump("_marker_failures")
            return result

        self._bump("_joined")
        # follower 只认**当前锁的持有者 token**；锁过期(GET 返回 None)直接走超时自补，
        # 不去抢一个可能已被别人持有的锁（避免双 leader 同时在打）。
        owner = None
        try:
            owner = _text(self._client.get(lock))
        except Exception:  # noqa: BLE001 - fail-open：当没读到，继续等
            pass
        if owner is not None:
            marker = done_key(lock, owner)
            deadline = self._now() + self._wait_timeout_s
            while self._now() < deadline:
                seen = None
                try:
                    seen = self._client.get(marker)
                except Exception:  # noqa: BLE001 - fail-open：当没读到，继续等
                    pass
                if seen is not None:
                    result = self._peek(key)
                    if result is not None:
                        self._bump("_coalesced")
                        return result
                    self._bump("_peek_misses")
                    break  # done 到了却读不到结果：不轮询到死，立刻自补
                self._sleep(min(self._poll_interval_s, max(0.0, deadline - self._now())))

        self._bump("_timeouts")
        self._bump("_self_served")
        return work()


class CompositeFlight:
    """两层合并：先进程内（省 Redis RTT），再由本进程 leader 去抢跨进程锁。

    实现与 `SingleFlight` 相同的 `run(key, work)` 面，所以 `CachedLlm` 一行不改。
    """

    def __init__(self, local: Any, remote: DistributedSingleFlight) -> None:
        self._local = local
        self._remote = remote

    @property
    def local(self) -> Any:
        return self._local

    @property
    def remote(self) -> DistributedSingleFlight:
        return self._remote

    def run(self, key: Hashable, work: Callable[[], Any]) -> Any:
        return self._local.run(key, lambda: self._remote.run(key, work))
