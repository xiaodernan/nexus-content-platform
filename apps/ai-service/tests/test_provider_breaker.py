"""出站**断路器**门（v682，跨语言镜像 Java Spring Cloud / Resilience4j CircuitBreaker）。

v681 的有界重试解决了"瞬时抖动自愈"，但 ADR 0114 仍欠头号一条：**没有断路器**——
真网关 `wkapi.pro/v1` 持续 503 时，每个请求都要先耗尽有界重试再失败，压力被放大。
本片把 Java `services/nexus-api` 的 `DomainCircuitBreaker` 跨语言镜像进 Python provider，
带着它 2026-11-09 **实测踩过的三个坑一起迁**（ADR 0057 / ADR 0101）：

- **坑①（名与配置同源 / "配了没人用"）**：Java 侧 OpenFeign 两个 name resolver 都把 breaker
  命名成没人猜到的串，YAML 配的实例根本没被用、breaker 静默跑默认值。Python 对应：
  breaker 旋钮必须经 `Registry` 真注入 `complete()` 的**门卫**，OPEN 时**不发任何 HTTP**。
  门读的是这个行为，不是"配置块看起来对不对"。
- **坑②（404 is an answer）**：Java breaker 默认把**所有**异常算失败，100 次后 OPEN 且
  健康服务开始用 `503 No fallback available` 回答"没有这个项目"。Python 对应：只有
  **瞬时**失败（429/5xx/网络，与 v681 `_RETRYABLE_STATUS` 同源）计入滑动窗口；
  401/403/400/404/422 与畸形 payload 是"答案/请求错"，**豁免、不进窗口**（镜像
  `ignoreExceptions: FeignException.NotFound`）。健康服务不该被自己的 404 熔断。
- **坑③（OPEN 必须能自动回 HALF_OPEN）**：Java 实测配了 `automaticTransitionFromOpenToHalfOpenEnabled=true`
  才不会"一次坏分钟变永久 outage"。Python 对应：进程内无线程，按注入时钟**惰性判定**
  自动 OPEN→HALF_OPEN（下一调用/状态查询到点即探测，行为等价），探测全成功→CLOSED、
  任一失败→回 OPEN 并重新计时。

**数据结构优化**：滑动窗口是每次调用的**热路径**。用 `deque(maxlen=N)` + 增量失败计数，
`record_*` 摊还 O(1)、失败率查询 O(1)，而不是每次 `sum(window)` 遍历 O(n)。复杂度门
按 ADR 0112 带**正向锚**（代理量>0 且随调用线性）+ **两档窗口成本相等** + **静态前提耦合**
（源码必须仍是 deque+增量计数，否则换回 list 遍历后动态门假绿）。

纪律（沿用 ADR 0110/0114）：
- **默认 disabled pass-through 零回归**：不配旋钮时 `complete()` 与 v681 字节级一致。
- 判据抽纯函数 `_judge_*`，真值门与变异臂**共用**（ADR 0095）；钉**性质**不钉字面
  （不钉"第 20 次开"/"等 10s"），换阈值/窗口/等待时长仍绿（ADR 0090/0094 X4）。
- 真线路腿 `test_live_*` 无 key 则 **函数级 skipif**；离线门与臂**恒跑**。
"""
from __future__ import annotations

import importlib
import json
import os
from pathlib import Path
from typing import Any

import httpx
import pytest

from ai_service.config import load_settings
from ai_service.providers.base import ProviderFailed
from ai_service.providers.openai_compatible import OpenAICompatibleProvider
from ai_service.providers.registry import Registry

_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


# ── 判据（单一真值：真值门与变异臂共用）────────────────────────────────────

def _judge_opens_on_sustained_failure(obs: dict[str, Any], *, minimum_calls: int,
                                     threshold: float) -> None:
    """样本达 minimumNumberOfCalls 且失败率越阈值 → OPEN。钉性质，不钉第几次开。"""
    assert obs["samples"] >= minimum_calls, "前提：样本尚未达到 minimumNumberOfCalls"
    assert obs["failure_rate_pct"] >= threshold, "前提：失败率尚未达到阈值"
    assert obs["state"] == "open", (
        f"持续瞬时失败达到阈值应 OPEN，实测 state={obs['state']}"
    )


def _judge_ignored_never_opens(obs: dict[str, Any]) -> None:
    """坑②：确定性错/404 是答案，豁免不进窗口，健康服务不被自己熔断。"""
    assert obs["state"] == "closed", (
        f"404/确定性错不该熔断健康服务，实测 state={obs['state']}（Java 实测血案）"
    )
    assert obs["window_size"] == 0, (
        f"豁免结果不该进滑动窗口，实测 window_size={obs['window_size']}"
    )


def _judge_open_rejects_without_network(obs: dict[str, Any]) -> None:
    """坑①：OPEN 时 complete() 抛 CircuitOpen，且**一次 HTTP 都不发**。"""
    assert obs["state"] == "open", "前提：breaker 应处于 OPEN"
    assert obs["exc_type"] == "CircuitOpen", (
        f"OPEN 应抛 CircuitOpen（不是普通 ProviderFailed），实测 {obs['exc_type']}"
    )
    assert obs["network_hits"] == 0, (
        f"OPEN 不该发任何 HTTP（门卫要真接进 complete()），实测 {obs['network_hits']} 次"
    )


def _judge_auto_half_open(obs: dict[str, Any]) -> None:
    """坑③：OPEN 到点后**无需额外动作**自动进 HALF_OPEN。"""
    assert obs["before"] == "open" and obs["after_wait"] == "half_open", (
        f"OPEN 到点应自动半开，实测 {obs['before']}→{obs['after_wait']}"
    )


def _judge_half_open_recovers(obs: dict[str, Any]) -> None:
    """HALF_OPEN 探测全成功 → CLOSED（重置窗口）。"""
    assert obs["state"] == "closed", f"半开探测全成功应闭合，实测 {obs['state']}"


def _judge_half_open_reopens(obs: dict[str, Any]) -> None:
    """HALF_OPEN 任一探测失败 → 回 OPEN（并重新计时）。"""
    assert obs["state"] == "open", f"半开探测失败应重开，实测 {obs['state']}"


def _judge_default_pass_through(obs: dict[str, Any]) -> None:
    """默认无 breaker：1 次请求、不挂 breaker、异常/返回语义不变（零回归）。"""
    assert obs["breaker_attached"] is False, "默认不该挂 breaker"
    assert obs["requests"] == 1, f"默认应恰好 1 次请求，实测 {obs['requests']}"
    assert obs["exc_type"] is None, f"健康路径不该抛异常，实测 {obs['exc_type']}"


def _judge_config_reaches_real_code(obs: dict[str, Any]) -> None:
    """坑①：Registry 旋钮真到达 provider → 门卫在位且配置同源（不是没人调的摆设）。"""
    assert obs["breaker_attached"] is True, "Registry 的 breaker 旋钮没到达 provider 门卫"
    assert obs["config_matches_settings"] is True, "provider breaker 的配置与 Settings 旋钮不一致"
    assert obs["rejects_when_open"] is True, "breaker 是没人调的摆设：OPEN 时仍放行了调用"


def _judge_invalid_config_rejected(obs: dict[str, Any]) -> None:
    """显式拒绝无效策略（镜像 Java find(name).orElseThrow 的诚实失败，不静默退化）。"""
    assert obs["raised"] is True and obs["exc_type"] == "BreakerConfigError", (
        f"无效 breaker 策略应显式抛 BreakerConfigError，实测 raised={obs['raised']} {obs['exc_type']}"
    )


def _judge_window_update_is_o1(obs: dict[str, Any], *, m: int) -> None:
    """复杂度：单次 record 成本与窗口大小无关，且**正向锚** >0、随调用线性（ADR 0112）。"""
    assert obs["record_ops"] == m, (
        f"O(1) 增量更新应每次 record 恰好 1 步代理量，实测 {obs['record_ops']} vs {m}"
    )
    assert obs["record_ops"] > 0, "正向锚：代理量必须 >0，否则换实现恒 0 全绿假绿（ADR 0112）"


def _judge_o1_source(src: str) -> None:
    """静态前提耦合（ADR 0112）：动态门的 record_ops 可信 ⟺ 源码仍是 deque + 增量计数。"""
    assert "deque" in src, "滑动窗口必须是 deque(maxlen=N)，O(1) 弹出"
    assert "_failure_count" in src, "必须增量维护失败计数，而非每次遍历窗口求和"
    assert not any(
        banned in src for banned in ("sum(self._outcomes)", "self._outcomes.count(", "sum(self._window)")
    ), "窗口更新出现 O(n) 全量遍历，动态门会假绿"
    assert "record_ops" in src, "生产必须如实报复杂度代理量供门读（ADR 0112）"


def _judge_combination_semantics(obs: dict[str, Any]) -> None:
    """retry 内部多次物理 attempt，breaker 只记**一次逻辑请求**的最终结果。"""
    assert obs["breaker_records"] == 1, (
        f"一次逻辑请求只记 1 条 breaker 结果，实测 {obs['breaker_records']} 条"
    )
    assert obs["logical_requests"] == obs["breaker_records"], "逻辑请求与 breaker 记录应 1:1"
    assert obs["physical_attempts"] >= obs["breaker_records"], "物理尝试可多于逻辑记录（重试）"


# ── 测试装置 ───────────────────────────────────────────────────────────────

class _FakeClock:
    def __init__(self, t: float = 1000.0) -> None:
        self.t = t

    def __call__(self) -> float:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += seconds


class _Seq:
    """按序返回响应/异常；记录调用次数（验 OPEN 零网络、验重试物理次数）。"""

    def __init__(self, *items: httpx.Response | Exception) -> None:
        self.items = list(items)
        self.calls = 0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        item = self.items[min(self.calls, len(self.items) - 1)]
        self.calls += 1
        if isinstance(item, Exception):
            raise item
        return item


class _CountingTransport(httpx.BaseTransport):
    """真线路腿用：包住真 HTTPTransport 并计数（证健康路径 breaker 不误开、网络如实发生）。"""

    def __init__(self, inner: httpx.BaseTransport) -> None:
        self.inner = inner
        self.count = 0

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.count += 1
        return self.inner.handle_request(request)

    def close(self) -> None:
        self.inner.close()


def _breaker_cls():
    # 延迟 import：先红阶段组件不存在时，纯判据臂仍恒跑（离线臂恒跑纪律）
    from ai_service.resilience import BreakerConfig, BreakerConfigError, CircuitBreaker, CircuitOpen
    return CircuitBreaker, BreakerConfig, CircuitOpen, BreakerConfigError


def _cfg_base() -> dict[str, Any]:
    return {
        "name": "llm-upstream",
        "sliding_window_size": 20,
        "minimum_number_of_calls": 20,
        "failure_rate_threshold": 50.0,
        "wait_duration_in_open_state_s": 10.0,
        "permitted_calls_in_half_open": 2,
    }


def _new_breaker(clock=None, **overrides):
    CircuitBreaker, BreakerConfig, _, _ = _breaker_cls()
    cfg = {**_cfg_base(), **overrides}
    return CircuitBreaker(BreakerConfig(**cfg), clock=clock)


def _ok(**overrides: Any) -> httpx.Response:
    payload: dict[str, Any] = {
        "model": "gpt-x-2026",
        "choices": [{"message": {"content": '{"pong": true}'}}],
        "usage": {"prompt_tokens": 5, "completion_tokens": 6},
    }
    payload.update(overrides)
    return httpx.Response(200, json=payload)


def _provider(breaker=None, seq: _Seq | None = None, **overrides: Any) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        api_key="synthetic-credential",
        base_url="https://provider.example/v1",
        models={"balanced": "gpt-x"},
        transport=httpx.MockTransport(seq or _Seq(_ok())),
        breaker=breaker,
        **overrides,
    )


# ── 真值门（离线，恒跑）────────────────────────────────────────────────────

def test_sustained_transient_failures_open_the_breaker():
    b = _new_breaker(minimum_number_of_calls=3, sliding_window_size=5, failure_rate_threshold=50)
    for _ in range(3):
        b.record_failure()
    s = b.stats()
    _judge_opens_on_sustained_failure(
        {"state": s["state"], "samples": s["window_size"], "failure_rate_pct": s["failure_rate_pct"]},
        minimum_calls=3, threshold=50.0,
    )


def test_404_and_deterministic_errors_never_open_a_healthy_service():
    """坑②：连续 20 次确定性错（含 404）不该熔断一个健康服务。"""
    b = _new_breaker(minimum_number_of_calls=3, sliding_window_size=5, failure_rate_threshold=50)
    for _ in range(20):
        b.record_ignored()
    s = b.stats()
    _judge_ignored_never_opens({"state": s["state"], "window_size": s["window_size"]})


def test_open_complete_rejects_without_any_http():
    """坑①：OPEN 时 complete() 抛 CircuitOpen 且**零网络**（门卫真接进生产调用链）。"""
    _, _, CircuitOpen, _ = _breaker_cls()
    b = _new_breaker(minimum_number_of_calls=2, sliding_window_size=5, failure_rate_threshold=50)
    b.record_failure()
    b.record_failure()
    assert b.state == "open"  # 前提
    seq = _Seq(_ok())  # 若真发了网络会返回 200
    provider = _provider(breaker=b, seq=seq)
    raised = None
    try:
        provider.complete(model="gpt-x", system="s", user="u")
    except Exception as exc:  # noqa: BLE001 - 门要读异常类型
        raised = exc
    assert isinstance(raised, CircuitOpen), f"OPEN 应抛 CircuitOpen，实测 {type(raised).__name__}"
    _judge_open_rejects_without_network(
        {"state": b.state, "exc_type": type(raised).__name__, "network_hits": seq.calls}
    )


def test_breaker_auto_transitions_to_half_open_and_probe_success_closes():
    """坑③：OPEN 到点自动半开；探测全成功 → CLOSED。"""
    fc = _FakeClock()
    b = _new_breaker(clock=fc, minimum_number_of_calls=2, sliding_window_size=5,
                     failure_rate_threshold=50, wait_duration_in_open_state_s=5,
                     permitted_calls_in_half_open=2)
    b.record_failure()
    b.record_failure()
    before = b.state
    fc.advance(5)
    after_wait = b.state
    _judge_auto_half_open({"before": before, "after_wait": after_wait})
    b.record_success()
    b.record_success()
    _judge_half_open_recovers({"state": b.state})


def test_half_open_probe_failure_reopens_and_restarts_wait():
    """HALF_OPEN 任一失败 → 回 OPEN 且**重新计时**（否则 breaker 会乒乓）。"""
    fc = _FakeClock()
    b = _new_breaker(clock=fc, minimum_number_of_calls=2, sliding_window_size=5,
                     failure_rate_threshold=50, wait_duration_in_open_state_s=5,
                     permitted_calls_in_half_open=2)
    b.record_failure()
    b.record_failure()
    fc.advance(5)
    assert b.state == "half_open"  # 前提
    b.record_failure()
    _judge_half_open_reopens({"state": b.state})
    fc.advance(4)
    assert b.state == "open", "探测失败后重新计时，未满 wait 不该半开"
    fc.advance(1)
    assert b.state == "half_open", "重新计满 wait 后应可再次半开"


def test_default_no_breaker_is_pass_through():
    provider = _provider()
    c = provider.complete(model="gpt-x", system="s", user="u")
    _judge_default_pass_through(
        {"breaker_attached": getattr(provider, "_breaker", None) is not None,
         "requests": 1, "exc_type": None}
    )
    assert c.text == '{"pong": true}'


def test_registry_breaker_knobs_reach_the_real_provider():
    """坑①：Settings 旋钮经 Registry 真注入 provider，门卫生效且配置同源。"""
    _, _, CircuitOpen, _ = _breaker_cls()
    settings = load_settings({
        "NEXUS_OPENAI_API_KEY": "synthetic-credential",
        "NEXUS_LLM_CIRCUIT_BREAKER_ENABLED": "1",
        "NEXUS_LLM_CB_SLIDING_WINDOW": "4",
        "NEXUS_LLM_CB_MIN_CALLS": "2",
        "NEXUS_LLM_CB_FAILURE_RATE": "50",
        "NEXUS_LLM_CB_WAIT_S": "5",
        "NEXUS_LLM_CB_HALF_OPEN_CALLS": "1",
    })
    reg = Registry(settings)
    provider = reg.llm
    b = getattr(provider, "_breaker", None)
    cfg_matches = (
        b is not None
        and b._cfg.sliding_window_size == settings.llm_cb_sliding_window
        and b._cfg.minimum_number_of_calls == settings.llm_cb_minimum_calls
        and b._cfg.failure_rate_threshold == settings.llm_cb_failure_rate_threshold
        and b._cfg.wait_duration_in_open_state_s == settings.llm_cb_wait_s
        and b._cfg.permitted_calls_in_half_open == settings.llm_cb_half_open_calls
    )
    b.record_failure()
    b.record_failure()
    rejects = False
    try:
        provider.complete(model="gpt-x", system="s", user="u")
    except CircuitOpen:
        rejects = True
    _judge_config_reaches_real_code(
        {"breaker_attached": b is not None, "config_matches_settings": cfg_matches,
         "rejects_when_open": rejects}
    )


@pytest.mark.parametrize("bad", [
    {"sliding_window_size": 0},
    {"minimum_number_of_calls": 0},
    {"failure_rate_threshold": -1.0},
    {"failure_rate_threshold": 101.0},
    {"wait_duration_in_open_state_s": -1.0},
    {"permitted_calls_in_half_open": 0},
])
def test_invalid_breaker_config_is_rejected(bad: dict[str, Any]):
    _, BreakerConfig, _, _ = _breaker_cls()
    raised = None
    try:
        BreakerConfig(**{**_cfg_base(), **bad})
    except Exception as exc:  # noqa: BLE001
        raised = exc
    _judge_invalid_config_rejected({"raised": raised is not None, "exc_type": type(raised).__name__})


def test_deterministic_404_is_ignored_end_to_end():
    """坑②端到端：走生产 complete() 的 404 → record_ignored → 窗口不进、不熔断。"""
    b = _new_breaker(minimum_number_of_calls=2, sliding_window_size=5, failure_rate_threshold=50)
    seq = _Seq(httpx.Response(404, text="no such project"))
    provider = _provider(breaker=b, seq=seq, max_attempts=3)
    with pytest.raises(ProviderFailed):
        provider.complete(model="gpt-x", system="s", user="u")
    s = b.stats()
    _judge_ignored_never_opens({"state": s["state"], "window_size": s["window_size"]})
    assert s["ignored_calls"] == 1, "404 应走 record_ignored（answer），不计失败"
    assert s["recorded_outcomes"] == 0, "豁免结果不该成为 breaker 结果"


def test_transient_exhaustion_records_one_failure():
    """瞬时失败耗尽重试 → breaker 记 1 次失败（与 v681 重试同源分类）。"""
    from ai_service.providers.openai_compatible import TransientProviderFailed

    b = _new_breaker(minimum_number_of_calls=5, sliding_window_size=10, failure_rate_threshold=50)
    seq = _Seq(httpx.Response(503, text="busy"))
    provider = _provider(breaker=b, seq=seq, max_attempts=2, base_s=0.001, cap_s=0.002)
    with pytest.raises(TransientProviderFailed):
        provider.complete(model="gpt-x", system="s", user="u")
    s = b.stats()
    assert s["window_size"] == 1 and s["failure_count"] == 1, "瞬时耗尽应算 1 次 breaker 失败"


def test_breaker_records_one_outcome_per_logical_request():
    """组合语义：重试 1 次物理抖动后成功，breaker 只记 1 条 success（不是 2 条）。"""
    b = _new_breaker(minimum_number_of_calls=5, sliding_window_size=10, failure_rate_threshold=50)
    seq = _Seq(httpx.Response(503, text="busy"), _ok())
    provider = _provider(breaker=b, seq=seq, max_attempts=3, base_s=0.001, cap_s=0.002)
    c = provider.complete(model="gpt-x", system="s", user="u")
    assert c.text == '{"pong": true}'
    s = b.stats()
    _judge_combination_semantics(
        {"logical_requests": 1, "breaker_records": s["recorded_outcomes"],
         "physical_attempts": seq.calls}
    )


def test_window_update_cost_is_o1_across_window_sizes():
    """复杂度：窗口 20 vs 200 跑同样 M 次，代理量相等；且随 M 线性、>0（正向锚）。"""
    m = 100
    ops: dict[int, int] = {}
    for width in (20, 200):
        b = _new_breaker(sliding_window_size=width, minimum_number_of_calls=width,
                         failure_rate_threshold=100.0)  # 50% < 100% → 不触发 OPEN，纯测更新成本
        for i in range(m):
            b.record_failure() if i % 2 else b.record_success()
        ops[width] = b.stats()["record_ops"]
    assert ops[20] == ops[200], f"两档窗口单次 record 成本应相等（O(1)），实测 {ops}"
    _judge_window_update_is_o1({"record_ops": ops[20], "m": m}, m=m)
    b2 = _new_breaker(sliding_window_size=200, minimum_number_of_calls=200,
                      failure_rate_threshold=100.0)
    for _ in range(2 * m):
        b2.record_success()
    _judge_window_update_is_o1({"record_ops": b2.stats()["record_ops"], "m": 2 * m}, m=2 * m)


def test_window_update_source_stays_o1():
    """静态前提耦合：换回 list 全量 sum 后，动态门的 record_ops 会假绿——本门钉死实现形状。"""
    src = Path(importlib.import_module("ai_service.resilience").__file__).read_text(encoding="utf-8")
    _judge_o1_source(src)


# ── 恒跑变异臂：证明判据有牙（离线，纯 dict / 假源码）──────────────────────

def test_arm_never_opens_goes_red():
    with pytest.raises(AssertionError, match="OPEN"):
        _judge_opens_on_sustained_failure(
            {"state": "closed", "samples": 20, "failure_rate_pct": 95}, minimum_calls=3, threshold=50
        )


def test_arm_404_counted_as_failure_goes_red():
    with pytest.raises(AssertionError, match="熔断"):
        _judge_ignored_never_opens({"state": "open", "window_size": 5})


def test_arm_ignored_pollutes_window_goes_red():
    with pytest.raises(AssertionError, match="滑动窗口"):
        _judge_ignored_never_opens({"state": "closed", "window_size": 5})


def test_arm_open_still_hits_network_goes_red():
    with pytest.raises(AssertionError, match="HTTP"):
        _judge_open_rejects_without_network(
            {"state": "open", "exc_type": "CircuitOpen", "network_hits": 1}
        )


def test_arm_open_never_half_opens_goes_red():
    with pytest.raises(AssertionError, match="自动半开"):
        _judge_auto_half_open({"before": "open", "after_wait": "open"})


def test_arm_half_open_success_not_closing_goes_red():
    with pytest.raises(AssertionError, match="闭合"):
        _judge_half_open_recovers({"state": "half_open"})


def test_arm_config_not_wired_goes_red():
    with pytest.raises(AssertionError, match="摆设"):
        _judge_config_reaches_real_code(
            {"breaker_attached": True, "config_matches_settings": True, "rejects_when_open": False}
        )


def test_arm_invalid_config_silently_accepted_goes_red():
    with pytest.raises(AssertionError, match="显式抛"):
        _judge_invalid_config_rejected({"raised": False, "exc_type": None})


def test_arm_combination_counts_physical_attempts_goes_red():
    with pytest.raises(AssertionError, match="1 条"):
        _judge_combination_semantics({"logical_requests": 1, "breaker_records": 2, "physical_attempts": 2})


def test_arm_pass_through_broken_goes_red():
    with pytest.raises(AssertionError, match="默认不该挂 breaker"):
        _judge_default_pass_through({"breaker_attached": True, "requests": 1, "exc_type": None})


def test_arm_o1_becomes_on_goes_red():
    with pytest.raises(AssertionError, match="代理量"):
        _judge_window_update_is_o1({"record_ops": 0, "m": 100}, m=100)


def test_arm_on_source_rewrite_goes_red():
    with pytest.raises(AssertionError, match="deque"):
        _judge_o1_source("results = []\nresults.append(ok)\nfails = sum(results)")


def test_arm_correct_and_renamed_configs_stay_green():
    """正向对照（ADR 0094 X4）：换阈值/窗口/等待/名字，判据不钉字面仍绿。"""
    _judge_opens_on_sustained_failure(
        {"state": "open", "samples": 7, "failure_rate_pct": 42.9}, minimum_calls=7, threshold=42
    )
    _judge_ignored_never_opens({"state": "closed", "window_size": 0})
    _judge_auto_half_open({"before": "open", "after_wait": "half_open"})
    _judge_half_open_recovers({"state": "closed"})
    _judge_half_open_reopens({"state": "open"})
    _judge_combination_semantics({"logical_requests": 1, "breaker_records": 1, "physical_attempts": 3})
    _judge_default_pass_through({"breaker_attached": False, "requests": 1, "exc_type": None})
    _judge_config_reaches_real_code(
        {"breaker_attached": True, "config_matches_settings": True, "rejects_when_open": True}
    )
    _judge_window_update_is_o1({"record_ops": 37, "m": 37}, m=37)
    _judge_o1_source(
        "from collections import deque\nself._outcomes = deque(maxlen=n)\n"
        "self._failure_count += 1\nself.record_ops += 1"
    )


# ── 真线路 opt-in 腿（函数级 skipif，无 key 不发网络、不假绿）──────────────

def _live_ready() -> bool:
    if (os.environ.get("NEXUS_LIVE_LLM", "") or "").strip() != "1":
        return False
    from dotenv import load_dotenv
    load_dotenv(_ENV_FILE, override=False)
    return bool(
        os.environ.get("NEXUS_OPENAI_API_KEY", "").strip()
        and os.environ.get("NEXUS_OPENAI_BASE_URL", "").strip()
    )


_LIVE_SKIP = pytest.mark.skipif(
    not _live_ready(),
    reason="real-gateway breaker leg opt-in: set NEXUS_LIVE_LLM=1 + .env with real key to run",
)


@_LIVE_SKIP
def test_live_healthy_gateway_breaker_stays_closed():
    """真 gpt-6-sol 连续两次成功：证实 breaker 接线不误伤健康路径、网络如实发生。"""
    from dotenv import load_dotenv
    load_dotenv(_ENV_FILE, override=False)
    b = _new_breaker(minimum_number_of_calls=2, sliding_window_size=5, failure_rate_threshold=50)
    counting = _CountingTransport(httpx.HTTPTransport())
    provider = OpenAICompatibleProvider(
        api_key=os.environ["NEXUS_OPENAI_API_KEY"].strip(),
        base_url=os.environ["NEXUS_OPENAI_BASE_URL"].strip(),
        models={"balanced": "gpt-6-sol"},
        breaker=b,
        transport=counting,
    )
    try:
        for _ in range(2):
            c = provider.complete(
                model="gpt-6-sol",
                system="You are a JSON oracle. Reply with a single JSON object only, no prose.",
                user='Reply with exactly {"pong": true}. No markdown, no explanation.',
            )
            assert json.loads(c.text).get("pong") is True
            assert c.tokens_in > 0 and c.tokens_out > 0
        assert counting.count == 2, "两次健康调用应真发 2 次网络（门卫没拦健康路径）"
        s = b.stats()
        assert s["state"] == "closed", "健康网关不该被 breaker 熔断"
        assert s["recorded_outcomes"] == 2 and s["failure_count"] == 0
    finally:
        provider.close()
