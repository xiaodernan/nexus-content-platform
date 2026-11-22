"""§AILIVE-4 · LLM 的能力状态由真调用得出，不由"配了 key"得出（ADR 0270 兑现）。

与 test_liveness.py（embedding）同一纪律、同一组对应臂：
- 探测本身：真打一次 system=ping / user=ping，json_mode=False，绕过完成缓存；
- 网关没有通道 → ProviderFailed → failed + 网关原话；
- 探测抛非-ProviderFailed 异常 → failed + 异常类名（healthz 不会崩）；
- 空回复 → failed；
- unknown ≠ 可用：没探过报未知（报告时按不可用呈现）。
"""

from __future__ import annotations

import json
import threading
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from ai_service.app import create_app
from ai_service.config import Settings
from ai_service.providers.llm_liveness import (
    DEFAULT_TTL_S,
    LlmLiveness,
    LlmProber,
    refresh_llm_in_background,
)
from ai_service.providers.openai_compatible import OpenAICompatibleProvider
from ai_service.providers.registry import Registry

MODELS = {"fast": "gpt-x-fast", "balanced": "gpt-x", "reasoning": "gpt-x", "vision": "gpt-x"}


def llm_provider(handler) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        api_key="sk-test-value",
        base_url="https://gateway.example/v1",
        models=MODELS,
        timeout_s=5.0,
        json_mode=False,
        transport=httpx.MockTransport(handler),
    )


def ok_handler(request: httpx.Request) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": "resp_probe",
            "object": "chat.completion",
            "created": 1_700_000_000,
            "model": "gpt-x-fast",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": "pong"}}],
            "usage": {"prompt_tokens": 2, "completion_tokens": 1},
        },
    )


def geo_blocked_handler(request: httpx.Request) -> httpx.Response:
    # 网关对大陆客户端直连的原话（2026-11-17 实测 api.aizzz.xyz 直连 403）
    return httpx.Response(403, json={"error": {"message": "本站不对您所在的国家及地区进行商业服务"}})


def empty_reply_handler(request: httpx.Request) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": "resp_probe",
            "object": "chat.completion",
            "created": 1_700_000_000,
            "model": "gpt-x-fast",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": ""}}],
            "usage": {"prompt_tokens": 2, "completion_tokens": 0},
        },
    )


def test_probe_ok_reports_the_ping_it_sent() -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return ok_handler(request)

    prober = LlmProber(llm_provider(handler))
    ok, reason = prober.probe()
    assert ok is True
    assert reason == ""
    # 探测必须打 /v1/chat/completions，不能被拼成相对路径打到别处
    assert calls == ["https://gateway.example/v1/chat/completions"]


def test_probe_translates_geo_block_into_failed() -> None:
    prober = LlmProber(llm_provider(geo_blocked_handler))
    ok, reason = prober.probe()
    assert ok is False
    # 地理封锁不能混进"检查 NEXUS_OPENAI_API_KEY"：换 key 治不了它，走代理才治得了
    assert "403" in reason
    assert "代理" in reason


def test_probe_reports_empty_assistant_content_as_failed() -> None:
    prober = LlmProber(llm_provider(empty_reply_handler))
    ok, reason = prober.probe()
    assert ok is False
    assert "空回复" in reason


def test_probe_swallows_unexpected_exception_into_failed() -> None:
    def boom_handler(request: httpx.Request) -> httpx.Response:  # noqa: ARG001
        raise RuntimeError("vault sealed")

    prober = LlmProber(llm_provider(boom_handler))
    ok, reason = prober.probe()
    assert ok is False
    assert "RuntimeError" in reason


def test_refresh_in_background_records_the_probe() -> None:
    liveness = LlmLiveness(ttl_s=0.0)  # ttl=0 → 永远 stale，必然起线程
    prober = LlmProber(llm_provider(ok_handler))
    started = refresh_llm_in_background(liveness, prober)
    assert started is True
    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline and liveness.state == "unknown":
        time.sleep(0.01)
    assert liveness.state == "ok"
    assert liveness.probes == 1


def test_refresh_in_background_does_not_probe_fresh_liveness() -> None:
    liveness = LlmLiveness(ttl_s=DEFAULT_TTL_S)
    liveness.record(True, "")
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return ok_handler(request)

    prober = LlmProber(llm_provider(handler))
    started = refresh_llm_in_background(liveness, prober)
    assert started is False
    time.sleep(0.2)
    assert calls == []


def _healthz(settings: Settings, registry: Registry):
    client = TestClient(create_app(settings, registry=registry))
    return client.get("/healthz").json()


def test_healthz_llmLive_reports_unknown_when_never_probed() -> None:
    settings = Settings(openai_api_key="sk-test")
    body = _healthz(settings, Registry(settings))
    assert body["llmLive"]["state"] == "unknown"
    assert body["llmLive"]["probes"] == 0


def test_healthz_llmLive_exposes_failed_reason_after_geo_block() -> None:
    settings = Settings(openai_api_key="sk-test")
    liveness = LlmLiveness(ttl_s=0.0)
    prober = LlmProber(llm_provider(geo_blocked_handler))
    prober.probe()
    liveness.record(False, prober.probe()[1])
    body = _healthz(settings, Registry(settings, llm=llm_provider(geo_blocked_handler), llm_liveness=liveness))
    assert body["llmLive"]["state"] == "failed"
    assert "403" in body["llmLive"]["reason"]
    assert "代理" in body["llmLive"]["reason"]


def quota_exhausted_handler(request: httpx.Request) -> httpx.Response:
    # 2026-11-22 实测原话：key 关掉之后网关对 gpt-6.2-sol 的答复（当时 /healthz 仍报 llm=real）
    return httpx.Response(
        403,
        json={
            "error": {
                "message": "用户额度不足, 剩余额度: $-0.001488",
                "type": "new_api_error",
                "code": "insufficient_user_quota",
            }
        },
    )


def test_a_dead_key_cannot_keep_the_llm_row_real() -> None:
    """这一臂就是今天量到的现场：探测拿到额度耗尽，能力行必须跟着落。

    修之前 providers 里 llm 那行由 `if self._llm` 推出来，永远写 real，而同一份 payload
    的 llmLive.state 已经写 failed——web 读的是前者（env.ts 按 llm 那一行定 real/demo），
    于是死链路照常被选中，用户拿到的是一句 5xx，而不是一句诚实的 DEMO MODE。
    """
    settings = Settings(openai_api_key="sk-test")
    liveness = LlmLiveness()
    registry = Registry(settings, llm=llm_provider(quota_exhausted_handler), llm_liveness=liveness)
    ok, reason = registry.llm_prober().probe()
    assert ok is False
    assert "insufficient_user_quota" in reason
    liveness.record(ok, reason)

    body = _healthz(settings, registry)
    llm = next(p for p in body["providers"] if p["kind"] == "llm")
    assert llm["status"] == "unavailable"
    assert "insufficient_user_quota" in llm["reason"]
    assert llm["models"] == []
    assert body["llmLive"]["state"] == "failed"
    # 两份读数同源：能力行与探测结论一起落，汇总行不许还站在 real 那边
    assert body["capability"] != "real"


def test_healthz_contract_accepts_llmLive_key() -> None:
    from jsonschema import Draft202012Validator

    from conftest import CONTRACTS

    settings = Settings(openai_api_key="sk-test")
    body = _healthz(settings, Registry(settings))
    schema = json.loads((CONTRACTS / "health.schema.json").read_text(encoding="utf-8"))
    errors = list(Draft202012Validator(schema).iter_errors(body))
    assert not errors, [f"{list(e.path)}: {e.message}" for e in errors]
