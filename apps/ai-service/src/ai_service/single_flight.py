"""按 key 合并并发真调用（single-flight，v696 / ADR 0128）。

镜像 Spring Cache `@Cacheable(sync=true)` 与 Caffeine 的 coalescing loader：
同 key 的并发 miss 只让**一个**线程去打真 provider，其余等同一个结果。
ADR 0113 把这条列为仍欠 ④（"宁可多花一次钱也不返回半条毒缓存"），本片把它补上。

为什么需要：`execution.py` 用 `anyio.to_thread.run_sync` 调 `complete()`，N 个并发
同 prompt 请求会同时 miss 缓存、同时打 N 次真 LLM——token 与上游连接双双浪费。

§159 诚实边界（四条，都是本片最要紧的）：
1. **失败不缓存、不伪造**：leader 抛异常时，所有等它的 follower 收到**同一个异常**，
   绝不返回半条 Completion、绝不静默重试、绝不把失败写进缓存。
2. **有界等待**：follower 只等 `wait_timeout_s`；leader 卡死时 follower 不无限挂住，
   而是自己打一次真调用（并如实计 `timeouts`）。不把"等超时"伪装成命中。
3. **不谎报命中**：single-flight 合并的是**miss 期间的真调用**，不是缓存命中。
   缓存自己的 `stats().hits` 语义不变；本组件单独报 `coalesced`。
4. **不跨进程**：这是进程内锁，多实例各有各的 flight（跨实例共享由 Redis
   completion cache 负责，ADR 0119）。绝不声称集群级 single-flight。

复杂度（ADR 0112）：每 key 一个 dict 项 + 一个 Event；`get_or_join` 是 O(1) 定点操作，
不扫描在飞表。表项由 leader 在 finally 里删除，不靠后台清扫。
"""
from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Callable, Hashable, TypeVar

T = TypeVar("T")


@dataclass(frozen=True)
class FlightStats:
    """single-flight 的诚实账本：ledger 只记真发生了什么。"""

    leaders: int = 0        # 作为 leader 打真调用的次数
    joined: int = 0         # 等别人的次数（不代表缓存命中）
    coalesced: int = 0      # 因合并而**省掉**的真调用次数
    failures: int = 0       # leader 失败次数（follower 收到同一异常）
    timeouts: int = 0       # follower 等到上限、自己打真调用的次数

    @property
    def real_calls(self) -> int:
        """真实打 provider 的总次数 = leader 次数 + 超时后自己补打的次数。"""
        return self.leaders + self.timeouts


@dataclass
class _Flight:
    done: threading.Event
    result: T | None = None
    error: BaseException | None = None


class SingleFlight:
    """同 key 并发只放一个 leader 过去。`wait` 可注入，让门确定性验证超时分支。"""

    def __init__(
        self,
        *,
        wait_timeout_s: float = 30.0,
        wait: Callable[[threading.Event, float], bool] | None = None,
    ) -> None:
        if wait_timeout_s <= 0:
            raise ValueError("wait_timeout_s 必须为正数：0/负数等于永不合并，是配置错误")
        self._wait_timeout_s = float(wait_timeout_s)
        self._wait = wait or (lambda ev, timeout: ev.wait(timeout))
        self._lock = threading.Lock()
        self._inflight: dict[Hashable, _Flight] = {}
        self._leaders = 0
        self._joined = 0
        self._coalesced = 0
        self._failures = 0
        self._timeouts = 0

    def stats(self) -> FlightStats:
        with self._lock:
            return FlightStats(
                leaders=self._leaders,
                joined=self._joined,
                coalesced=self._coalesced,
                failures=self._failures,
                timeouts=self._timeouts,
            )

    @property
    def inflight(self) -> int:
        with self._lock:
            return len(self._inflight)

    def run(self, key: Hashable, work: Callable[[], T]) -> T:
        """执行 work；同 key 的并发调用共享一次结果。"""
        with self._lock:
            flight = self._inflight.get(key)
            if flight is None:
                flight = _Flight(done=threading.Event())
                self._inflight[key] = flight
                self._leaders += 1
                leader = True
            else:
                self._joined += 1
                leader = False

        if leader:
            try:
                result = work()
            except BaseException as exc:  # noqa: BLE001 - 要把同一个异常交给所有等它的人
                with self._lock:
                    flight.error = exc
                    self._failures += 1
                    self._inflight.pop(key, None)
                    flight.done.set()
                raise
            with self._lock:
                flight.result = result
                self._inflight.pop(key, None)
                flight.done.set()
            return result

        # follower：有界等待。leader 成功 → 共享同一个 Completion；失败 → 收到同一异常。
        finished = self._wait(flight.done, self._wait_timeout_s)
        if not finished:
            with self._lock:
                self._timeouts += 1
            # 不无限挂住，也不伪造结果：自己打一次真调用（成功与否照实返回/抛出）。
            return work()
        with self._lock:
            self._coalesced += 1
            error = flight.error
            result = flight.result
        if error is not None:
            raise error
        return result  # type: ignore[return-value]
