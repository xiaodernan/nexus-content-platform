"""进程内出站**断路器**（v682，跨语言镜像 Java Spring Cloud / Resilience4j CircuitBreaker）。

与 v681 有界重试配对：重试解决"瞬时抖动自愈"，断路器解决"持续失败时**别再打**"——
真网关 `wkapi.pro/v1` 持续 503 时，重试会放大压力，断路器在失败率越阈值后直接拒门，
给上游喘息、给调用方一个**命名的事实**（CircuitOpen），而不是每次都耗尽一整轮重试。

三态机 + count-based 滑动窗口，带着 Java `DomainCircuitBreaker` 实测踩过的三个坑一起迁：

- 坑①（名与配置同源）：本组件由 `Registry` 构造并经 `Settings` 旋钮真注入 `complete()`；
  `before_call()` 是唯一的门卫，OPEN 时**不发任何 HTTP**。
- 坑②（404 is an answer）：`record_ignored()` 让确定性失败**不进窗口**——只有
  `record_failure()`（瞬时：429/5xx/网络）才计失败。健康服务不该被自己的 404 熔断。
- 坑③（OPEN 必须能自动回 HALF_OPEN）：进程内无线程，按注入 `clock` **惰性判定**——
  `state` / `before_call()` 被读取时若 OPEN 已过 `wait_duration`，自动转 HALF_OPEN，
  行为等价于 Resilience4j 的 `automaticTransitionFromOpenToHalfOpenEnabled=true`。

数据结构：`deque(maxlen=sliding_window_size)` 做定长窗口 + 增量维护 `_failure_count`，
`record_*` 与失败率查询都摊还 O(1)，`record_ops` 如实计每次更新的代理步数（供复杂度门读，
ADR 0112）；不用 `sum(window)` 遍历，因为这是每次调用的**热路径**。

§159 诚实：断路器是**进程内、非持久、非跨实例**的——重启即失、多实例各自为政；
跨实例熔断共享是 Redis 另一片的事（ akin ADR 0102 的失效总线），别把本组件当分布式真相。
"""
from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass
from typing import Callable

from .providers.base import ProviderFailed

# 三态（用 str 便于进 stats / 指标，不引 enum 依赖）
CLOSED = "closed"
OPEN = "open"
HALF_OPEN = "half_open"


class CircuitOpen(ProviderFailed):
    """OPEN 状态拒绝调用：**这次逻辑请求没有发出任何 HTTP**。

    继承 `ProviderFailed` 是刻意的：调用方（execution.py 的 `except ProviderFailed`）
    无需改动即可把"熔断拒门"映射成诚实的 502 retryable，而不是漏成未处理 500——
    **默认 disabled 的部署零回归**。同时它是独立可识别的子类，`isinstance(exc, CircuitOpen)`
    让关心"到底有没有打过网络"的调用方精确区分：上游失败是"问了没成"，OPEN 是"根本没问"
    （§159 不谎称调用过）。消息里明说未发起调用与恢复时间。
    """

    def __init__(self, name: str, retry_after_s: float) -> None:
        self.name = name
        self.retry_after_s = retry_after_s
        super().__init__(
            f"断路器 {name} 处于 OPEN，拒绝本次调用（约 {retry_after_s:.2f}s 后转 HALF_OPEN 试探）"
        )


class BreakerConfigError(ValueError):
    """显式拒绝无效断路器策略（镜像 Java `find(name).orElseThrow` 的诚实失败，
    不静默退化成 `ofDefaults()`——那会像重试 404 一样把健康路径熔断）。"""


@dataclass(frozen=True)
class BreakerConfig:
    """Resilience4j `CircuitBreakerConfig` 的最小可镜像子集，字段名对齐 Java 旋钮。"""

    name: str = "llm-upstream"
    sliding_window_size: int = 20
    minimum_number_of_calls: int = 20
    failure_rate_threshold: float = 50.0  # 百分比 [0, 100]
    wait_duration_in_open_state_s: float = 10.0
    permitted_calls_in_half_open: int = 2

    def __post_init__(self) -> None:
        if self.sliding_window_size < 1:
            raise BreakerConfigError("sliding_window_size 必须 >= 1")
        if self.minimum_number_of_calls < 1:
            raise BreakerConfigError("minimum_number_of_calls 必须 >= 1")
        # 样本门不能大于窗口，否则永远达不到 minimumNumberOfCalls、breaker 永不动作（静默失效）
        if self.minimum_number_of_calls > self.sliding_window_size:
            raise BreakerConfigError(
                "minimum_number_of_calls 不能大于 sliding_window_size（否则样本门永远不满足）"
            )
        if not (0.0 <= self.failure_rate_threshold <= 100.0):
            raise BreakerConfigError("failure_rate_threshold 必须在 [0, 100] 百分比")
        if self.wait_duration_in_open_state_s < 0:
            raise BreakerConfigError("wait_duration_in_open_state_s 必须 >= 0")
        if self.permitted_calls_in_half_open < 1:
            raise BreakerConfigError("permitted_calls_in_half_open 必须 >= 1")


class CircuitBreaker:
    """count-based 滑动窗口断路器；注入 `clock` 供门确定性验证时间转移，生产传 `time.monotonic`。

    典型用法（在 `Complete` 门卫外）：
        breaker.before_call()                 # OPEN 则抛 CircuitOpen，零网络
        try:
            result = do_request()
        except TransientFailure:
            breaker.record_failure()          # 瞬时失败，计入窗口
            raise
        except DeterministicAnswer:
            breaker.record_ignored()          # 404/凭据错，是答案，不进窗口（坑②）
            raise
        else:
            breaker.record_success()
    """

    def __init__(self, config: BreakerConfig, *, clock: Callable[[], float] | None = None) -> None:
        self._cfg = config
        self._clock = clock or time.monotonic
        self._state = CLOSED
        self._opened_at = 0.0

        # count-based 定长窗口：True=失败，False=成功；增量维护失败数，避免每次 sum(window) 遍历
        self._outcomes: deque[bool] = deque(maxlen=config.sliding_window_size)
        self._failure_count = 0

        # HALF_OPEN 探测进度：累计成功数达 permitted_calls_in_half_open → 回 CLOSED；
        # 任一探测失败 → 立即回 OPEN 并重新计时（Resilience4j 同语义）。
        self._half_open_successes = 0

        # 诚实账本 + 复杂度代理量（都只读，不含任何 credential）
        self._record_ops = 0
        self._ignored_calls = 0
        self._recorded_outcomes = 0

    # ── 门卫 / 结果上报 ────────────────────────────────────────────────────

    def before_call(self) -> None:
        """调用前门卫：若 OPEN 且在等待期内 → 抛 `CircuitOpen`（零网络）；到点自动半开放行。"""
        self._maybe_auto_half_open()
        if self._state == OPEN:
            remaining = self._cfg.wait_duration_in_open_state_s - (self._clock() - self._opened_at)
            raise CircuitOpen(self._cfg.name, max(0.0, remaining))

    def record_success(self) -> None:
        """一次逻辑请求成功。HALF_OPEN 下累计成功探测，够了就闭合。"""
        if self._state == HALF_OPEN:
            self._half_open_successes += 1
            if self._half_open_successes >= self._cfg.permitted_calls_in_half_open:
                self._close()
            return
        if self._state == CLOSED:
            self._record(False)

    def record_failure(self) -> None:
        """一次**瞬时**逻辑请求失败（429/5xx/网络）。计入窗口；越阈值 → OPEN。"""
        if self._state == HALF_OPEN:
            # 探测失败：立即重开并重新计时（坑③——不让一次坏分钟变永久 outage，但也不轻易放行）
            self._open()
            return
        if self._state == CLOSED:
            self._record(True)
            self._maybe_open()

    def record_ignored(self) -> None:
        """确定性"答案/请求错"（401/403/400/404/422/畸形 payload）——**不进窗口**（坑②）。

        健康服务连续返回 404 不该被自己熔断：这些结果既不记成功也不记失败，窗口纹丝不动。
        """
        self._ignored_calls += 1

    # ── 状态查询 ───────────────────────────────────────────────────────────

    @property
    def state(self) -> str:
        """读状态时惰性执行 OPEN→HALF_OPEN 自动转移（无后台线程，行为等价 Java 自动半开）。"""
        self._maybe_auto_half_open()
        return self._state

    def failure_rate_pct(self) -> float:
        size = len(self._outcomes)
        return (self._failure_count / size * 100.0) if size else 0.0

    def stats(self) -> dict[str, object]:
        """可观测快照（§159：只读、无 key）。供 /healthz /metrics 与门消费。"""
        self._maybe_auto_half_open()
        return {
            "name": self._cfg.name,
            "state": self._state,
            "window_size": len(self._outcomes),
            "failure_count": self._failure_count,
            "failure_rate_pct": round(self.failure_rate_pct(), 2),
            "minimum_number_of_calls": self._cfg.minimum_number_of_calls,
            "sliding_window_size": self._cfg.sliding_window_size,
            "failure_rate_threshold": self._cfg.failure_rate_threshold,
            "wait_duration_in_open_state_s": self._cfg.wait_duration_in_open_state_s,
            "recorded_outcomes": self._recorded_outcomes,
            "ignored_calls": self._ignored_calls,
            "record_ops": self._record_ops,
        }

    # ── 内部：O(1) 窗口与状态转移 ──────────────────────────────────────────

    def _record(self, failed: bool) -> None:
        """摊还 O(1) 写入定长窗口：deque 满时自动弹最旧，增量维护失败计数。"""
        if len(self._outcomes) == self._outcomes.maxlen:
            oldest_failed = self._outcomes[0]  # 即将被 append 挤出的那条
            if oldest_failed:
                self._failure_count -= 1
        self._outcomes.append(failed)
        if failed:
            self._failure_count += 1
        self._recorded_outcomes += 1
        self._record_ops += 1  # 每次更新恰好 1 步代理量（与窗口大小无关，供复杂度门验 O(1)）

    def _maybe_open(self) -> None:
        """样本达 minimumNumberOfCalls 且失败率越阈值 → OPEN。"""
        if (
            len(self._outcomes) >= self._cfg.minimum_number_of_calls
            and self.failure_rate_pct() >= self._cfg.failure_rate_threshold
        ):
            self._open()

    def _open(self) -> None:
        self._state = OPEN
        self._opened_at = self._clock()
        self._half_open_successes = 0

    def _close(self) -> None:
        """回 CLOSED 并**清空窗口**（Resilience4j：闭合后以全新窗口重新计）。"""
        self._state = CLOSED
        self._outcomes.clear()
        self._failure_count = 0
        self._half_open_successes = 0

    def _maybe_auto_half_open(self) -> None:
        """惰性自动半开：OPEN 已过等待时长 → HALF_OPEN，清零探测进度。"""
        if self._state == OPEN and (self._clock() - self._opened_at) >= self._cfg.wait_duration_in_open_state_s:
            self._state = HALF_OPEN
            self._half_open_successes = 0
