"""OpenAI 兼容 provider 的**有界重试**门（v681，镜像 Java v669a DomainServiceRetry）。

真网关（wkapi.pro/v1，gpt-6-sol）实测延迟 2–10s、曾见 503；一次瞬时 5xx/429 会让整个
设计请求 502 失败。本片把 HTTP 出站从"一次即抛"升级成**有界、指数退避、只重试瞬时错**
的重试，并真正接进 `complete()`（不是没人调的配置——这正是 Java v669a 记过的 trap：
配了 resilience 实例却没代码取用，服务照常启动、一次都不重试）。

§159 语义无歧义（与 v680 缓存不同，可以真接线）：重试是"同一逻辑请求发多次 HTTP"，
最终只产**一条成功 Completion**，`usage` 取成功那次；`latency_ms` 反映**含退避的总墙钟**
（更诚实，不把重试等待藏起来）。

纪律：
- **pass-through 默认零回归**：`max_attempts=1`（不配旋钮）时与改造前字节级一致；
  Java v669a 的双构造、现有全部测试都靠这条。
- **只重试瞬时错**：429（尊重 Retry-After）、5xx、`ConnectError`/`TimeoutException`；
  **绝不重试** 401/403/400/404/422（凭据/请求错，"404 is an answer"）、也不重试
  "200 但 payload 畸形"（确定性解析错，重试无用）。
- **可注入 sleep / transport / clock**：门不真等、不真发网络。

CI 安全（沿用 ADR 0110）：真线路腿 `test_live_*` 无 key 则 skip；离线门与臂恒跑。
判据单一真值（ADR 0095）：`_judge_*` 纯判据被真值门与变异臂共用。判据钉"声称的性质"，
不钉今天恰好相等的字面（ADR 0090/0094 X4）——例如钉"重试次数=声明值"而非"恰好 3 次"。
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Callable

import httpx
import pytest

from ai_service.providers.base import ProviderFailed
from ai_service.providers.openai_compatible import OpenAICompatibleProvider

_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


# ── 判据（单一真值：真值门与变异臂共用）────────────────────────────────────

def _judge_retried_transient(obs: dict[str, Any], *, max_attempts: int) -> None:
    """瞬时失败应被重试：请求次数落在 (1, maxAttempts]，且最终成功。"""
    assert obs["final_ok"] is True, "瞬时故障后没能成功——重试没接进 complete()"
    assert 1 < obs["requests"] <= max_attempts, (
        f"重试次数应 >1 且 <= maxAttempts({max_attempts})，实测 {obs['requests']}"
    )


def _judge_not_retried(obs: dict[str, Any]) -> None:
    """确定性失败（凭据/请求/畸形 payload）绝不重试：只发 1 次。"""
    assert obs["raised"] is True, "该失败应原样抛 ProviderFailed"
    assert obs["requests"] == 1, f"确定性失败被重试了（发了 {obs['requests']} 次）——浪费且放大攻击面"


def _judge_backoff_shape(obs: dict[str, Any], *, base: float, cap: float) -> None:
    """退避每次 >= 指数基线 base·2^i、封顶 cap、尊重 Retry-After（若给出）。钉形状不钉字面。

    刻意**不钉单调不减**：429 的 Retry-After 会打破单调（如 [0.05, 0.02, 0.03] 完全正确——
    第 0 次服务端要求等 0.05，后续回到指数退避）。钉单调会惩罚正当的 Retry-After 尊重。
    """
    waits = obs["waits"]
    assert len(waits) >= 2, "至少两次退避可比较"
    assert all(w > 0 for w in waits), f"退避必须为正，实测 {waits}"
    for i, w in enumerate(waits):
        lower = min(base * (2 ** i), cap)
        assert w >= lower - 1e-9, f"第 {i} 次退避 {w} 低于指数基线 {lower}"
        assert w <= max(cap, obs.get("retry_after") or 0) + 1e-9, (
            f"第 {i} 次退避 {w} 超过封顶（cap={cap}, Retry-After={obs.get('retry_after')}）"
        )
    if obs.get("retry_after") is not None:
        # 服务端明确给了 Retry-After：第一次等待必须 >= 它（不早于服务端允许）
        assert waits[0] >= obs["retry_after"], (
            f"没尊重 Retry-After={obs['retry_after']}，第一次只等了 {waits[0]}"
        )


def _judge_latency_includes_wait(obs: dict[str, Any]) -> None:
    """latency_ms 必须含退避等待，不把重试成本藏起来（§159 计量诚实）。"""
    assert obs["latency_ms"] >= obs["total_wait_s"] * 1000 - 1e-6, (
        f"latency_ms({obs['latency_ms']}) 没含退避总等待({obs['total_wait_s']}s)"
    )


def _judge_passthrough_byte_identical(obs: dict[str, Any]) -> None:
    """max_attempts=1 = 改造前：1 次请求、无 sleep、成功/失败语义不变。"""
    assert obs["requests"] == 1
    assert obs["waits"] == [], "pass-through 不该有任何退避"
    assert obs["final_ok"] is True


# ── 测试装置：可注入 sleep / clock / transport 的序列 handler ──────────────

class _FakeClockSleep:
    """联动的假时钟 + 假 sleep：sleep(w) 时把时钟推进 w，使 latency_ms 真正含总退避。"""

    def __init__(self, t: float = 1000.0) -> None:
        self.t = t
        self.waits: list[float] = []

    def clock(self) -> float:
        return self.t

    def sleep(self, seconds: float) -> None:
        self.waits.append(seconds)
        self.t += seconds


class _Seq:
    """按序返回"响应或异常"；记录调用次数与每次请求体（验幂等：body 逐次相同）。"""

    def __init__(self, *responses: httpx.Response | Exception) -> None:
        self.responses = list(responses)
        self.calls = 0
        self.bodies: list[bytes] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.bodies.append(request.content)
        item = self.responses[min(self.calls, len(self.responses) - 1)]
        self.calls += 1
        if isinstance(item, Exception):
            raise item
        return item


def _ok(**overrides: Any) -> httpx.Response:
    payload: dict[str, Any] = {
        "model": "gpt-x-2026",
        "choices": [{"message": {"content": '{"patches":[]}'}}],
        "usage": {"prompt_tokens": 5, "completion_tokens": 6},
    }
    payload.update(overrides)
    return httpx.Response(200, json=payload)


def _make(
    seq: _Seq,
    *,
    sleep: Callable[[float], None] | None = None,
    clock: Callable[[], float] | None = None,
    **overrides: Any,
) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        api_key="synthetic-credential",
        base_url="https://provider.example/v1",
        models={"balanced": "gpt-x"},
        transport=httpx.MockTransport(seq),
        sleep=sleep,
        clock=clock,
        **overrides,
    )


# ── 真值门（离线，恒跑）────────────────────────────────────────────────────

def test_transient_503_is_retried_until_success():
    seq = _Seq(httpx.Response(503, text="busy"), _ok())
    provider = _make(seq, max_attempts=3, base_s=0.01, cap_s=0.02)
    c = provider.complete(model="gpt-x", system="s", user="u")
    _judge_retried_transient({"final_ok": c.text == '{"patches":[]}', "requests": seq.calls},
                             max_attempts=3)
    assert c.tokens_in == 5 and c.tokens_out == 6, "usage 应取成功那次"


def test_retry_is_idempotent_same_body_each_attempt():
    seq = _Seq(httpx.Response(500, text="x"), httpx.Response(500, text="y"), _ok())
    _make(seq, max_attempts=3, base_s=0.01, cap_s=0.02).complete(
        model="gpt-x", system="s", user="u"
    )
    assert len(seq.bodies) == 3 and len(set(seq.bodies)) == 1, "重试必须重发同一 body（幂等）"


@pytest.mark.parametrize("status", [401, 403, 400, 404, 422])
def test_deterministic_client_errors_are_never_retried(status):
    seq = _Seq(httpx.Response(status, text="nope"))
    raised = False
    try:
        _make(seq, max_attempts=4, base_s=0.01, cap_s=0.02).complete(
            model="gpt-x", system="s", user="u"
        )
    except ProviderFailed:
        raised = True
    _judge_not_retried({"raised": raised, "requests": seq.calls})


def test_malformed_200_payload_is_not_retried():
    seq = _Seq(_ok(choices=[]))
    raised = False
    try:
        _make(seq, max_attempts=4, base_s=0.01, cap_s=0.02).complete(
            model="gpt-x", system="s", user="u"
        )
    except ProviderFailed:
        raised = True
    _judge_not_retried({"raised": raised, "requests": seq.calls})


def test_network_error_is_retried():
    seq = _Seq(httpx.ConnectError("boom"), _ok())
    provider = _make(seq, max_attempts=3, base_s=0.01, cap_s=0.02)
    c = provider.complete(model="gpt-x", system="s", user="u")
    _judge_retried_transient({"final_ok": bool(c.text), "requests": seq.calls}, max_attempts=3)


def test_exhausted_attempts_raise_not_silent_success():
    seq = _Seq(httpx.Response(503, text="busy"))
    raised = False
    try:
        _make(seq, max_attempts=3, base_s=0.01, cap_s=0.02).complete(
            model="gpt-x", system="s", user="u"
        )
    except ProviderFailed:
        raised = True
    assert raised, "重试耗尽后必须抛 ProviderFailed，不能悄悄返回假成功"
    assert seq.calls == 3, f"应恰好发 max_attempts 次，实测 {seq.calls}"


def test_backoff_is_exponential_capped_and_honors_retry_after():
    waits: list[float] = []
    seq = _Seq(
        httpx.Response(429, text="slow", headers={"Retry-After": "0.05"}),
        httpx.Response(503, text="busy"),
        httpx.Response(503, text="busy"),
        _ok(),
    )
    provider = _make(seq, max_attempts=4, base_s=0.01, cap_s=0.03, sleep=waits.append)
    provider.complete(model="gpt-x", system="s", user="u")
    _judge_backoff_shape({"waits": waits, "retry_after": 0.05}, base=0.01, cap=0.03)


def test_latency_includes_backoff_total_wait():
    cs = _FakeClockSleep()
    seq = _Seq(httpx.Response(503, text="a"), httpx.Response(503, text="b"), _ok())
    provider = _make(seq, max_attempts=3, base_s=0.02, cap_s=0.03,
                     sleep=cs.sleep, clock=cs.clock)
    c = provider.complete(model="gpt-x", system="s", user="u")
    _judge_latency_includes_wait({"latency_ms": c.latency_ms,
                                  "total_wait_s": sum(cs.waits)})


def test_pass_through_default_is_byte_identical():
    seq = _Seq(_ok())
    c = _make(seq).complete(model="gpt-x", system="s", user="u")  # 不配任何重试旋钮
    _judge_passthrough_byte_identical({"requests": seq.calls, "waits": [], "final_ok": bool(c.text)})


def test_invalid_max_attempts_rejected():
    with pytest.raises(ValueError):
        _make(_Seq(_ok()), max_attempts=0)


# ── 恒跑变异臂：证明判据有牙（离线，纯 dict）────────────────────────────────

def test_arm_no_retry_goes_red():
    with pytest.raises(AssertionError):
        _judge_retried_transient({"final_ok": False, "requests": 1}, max_attempts=3)


def test_arm_client_error_retried_goes_red():
    with pytest.raises(AssertionError, match="确定性失败"):
        _judge_not_retried({"raised": True, "requests": 3})


def test_arm_backoff_below_exponential_floor_goes_red():
    with pytest.raises(AssertionError, match="指数基线"):
        _judge_backoff_shape({"waits": [0.01, 0.005], "retry_after": None}, base=0.01, cap=0.05)


def test_arm_backoff_over_cap_goes_red():
    with pytest.raises(AssertionError, match="封顶"):
        _judge_backoff_shape({"waits": [0.01, 0.09], "retry_after": None}, base=0.01, cap=0.05)


def test_arm_retry_after_disrespected_goes_red():
    with pytest.raises(AssertionError, match="Retry-After"):
        _judge_backoff_shape({"waits": [0.01, 0.02], "retry_after": 0.05}, base=0.01, cap=0.5)


def test_arm_latency_hiding_wait_goes_red():
    with pytest.raises(AssertionError, match="退避"):
        _judge_latency_includes_wait({"latency_ms": 5.0, "total_wait_s": 0.1})


def test_arm_correct_observations_are_green():
    _judge_retried_transient({"final_ok": True, "requests": 2}, max_attempts=3)
    _judge_not_retried({"raised": True, "requests": 1})
    _judge_passthrough_byte_identical({"requests": 1, "waits": [], "final_ok": True})
    # 正向对照：Retry-After 打破单调是正当的，判据不该惩罚它（ADR 0094 X4）
    _judge_backoff_shape({"waits": [0.05, 0.02, 0.03], "retry_after": 0.05}, base=0.01, cap=0.03)


# ── 真线路 opt-in 腿（无 key 则 skip）───────────────────────────────────────

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
    reason="real-gateway retry leg opt-in: set NEXUS_LIVE_LLM=1 + .env with real key to run",
)


@_LIVE_SKIP
def test_live_retry_wiring_does_not_break_a_healthy_gateway_call():
    """真 gpt-6-sol 一次成功：证实重试接线没破坏健康路径（不会凭空多调、也不 sleep）。"""
    from dotenv import load_dotenv
    load_dotenv(_ENV_FILE, override=False)
    waits: list[float] = []
    provider = OpenAICompatibleProvider(
        api_key=os.environ["NEXUS_OPENAI_API_KEY"].strip(),
        base_url=os.environ["NEXUS_OPENAI_BASE_URL"].strip(),
        models={"balanced": "gpt-6-sol"},
        max_attempts=3,
        base_s=0.05,
        cap_s=0.2,
        sleep=waits.append,
    )
    try:
        c = provider.complete(
            model="gpt-6-sol",
            system="You are a JSON oracle. Reply with a single JSON object only, no prose.",
            user='Reply with exactly {"pong": true}. No markdown, no explanation.',
        )
        assert json.loads(c.text).get("pong") is True
        assert c.tokens_in > 0 and c.tokens_out > 0, "真调用 usage 应双向 > 0"
        assert waits == [], "健康网关不该触发任何退避（幂等接线不该凭空多调）"
    finally:
        provider.close()
