"""真线路 opt-in 门：用项目自身的 provider / registry 打真实 OpenAI 兼容网关。

§159 不谎称能用：ai-service 在配了 NEXUS_OPENAI_API_KEY + NEXUS_OPENAI_BASE_URL 时
capability 才算 real。本文件把"真线路真能跑通、且跑通的是项目自己那条代码路径"从人工
curl（CURRENT-STATE cont.42）升级成**可重复、有牙、CI 安全**的门。

CI 安全（函数级 skipif，不用模块级）：真线路腿（test_live_*）没有 NEXUS_LIVE_LLM=1
或没有真实 key 时各自 skip（不发网络、不假绿）；离线变异臂（test_*_arm_*）用
MockTransport / 纯判据，**恒跑**，在无 key 的 CI 上也证明门有牙。

判据单一真值（ADR 0095）：`_judge_*` 三个纯判据被真线路腿与变异臂共用，不内联复刻，
所以"改了判据忘改臂"不会假绿。判据钉"声称的性质"，不钉今天恰好相等的字面值
（ADR 0090/0094 X4）：
 - JSON mode 生效 = 响应能被 json.loads 成对象（不是"内容等于某句"）；
 - 真调用         = usage 双向 > 0（恒 0 的假响应在门里会红）；
 - 诚实降级       = 该网关无 embedding 模型时如实报 unavailable，不谎称 real。
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Callable

import httpx
import pytest
from fastapi.testclient import TestClient

from ai_service.app import create_app
from ai_service.config import load_settings
from ai_service.providers.base import Completion, ProviderFailed
from ai_service.providers.openai_compatible import OpenAICompatibleProvider
from ai_service.providers.registry import Registry

PONG_KEY = "pong"
ORACLE_SYSTEM = "You are a JSON oracle. Reply with a single JSON object only, no prose."
ORACLE_USER = 'Reply with exactly {"pong": true}. No markdown, no explanation.'
_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


# ── 判据（单一真值：真线路腿与变异臂共用）────────────────────────────────

def _judge_json_mode(text: str) -> dict[str, Any]:
    """JSON mode 生效 = 响应是能解析的对象，且约定字段兑现。纯文本在此抛。"""
    parsed = json.loads(text)  # 非 JSON → ValueError/TypeError（臂1 验红）
    assert isinstance(parsed, dict), "JSON mode 应产出一个对象"
    assert parsed.get(PONG_KEY) is True, "约定字段未兑现，模型没真正遵循 JSON mode 契约"
    return parsed


def _judge_real_usage(completion: Completion) -> None:
    """真调用 = usage 双向 > 0。恒 0 的假响应在此抛（臂2 验红）。"""
    assert completion.tokens_in > 0, "prompt_tokens 为 0 —— 不像真调用"
    assert completion.tokens_out > 0, "completion_tokens 为 0 —— 不像真调用"
    assert completion.model, "provider 未回显模型名"
    assert completion.latency_ms > 0, "延迟未记录"


def _judge_embedding_honest(body: dict[str, Any]) -> None:
    """能力面诚实：llm=real 不被牵连，embedding 在该网关如实 unavailable。"""
    llm = [p for p in body["providers"] if p["kind"] == "llm"][0]
    emb = [p for p in body["providers"] if p["kind"] == "embedding"][0]
    assert llm["status"] == "real"
    assert body["capability"] == "real"
    assert emb["status"] == "unavailable", "embedding 谎称 real（§159）"
    assert "没有 embedding 模型" in emb["reason"]


# ── opt-in 环境装载（key 不打印、不进断言消息）───────────────────────────

def _live_creds() -> dict[str, str] | None:
    if (os.environ.get("NEXUS_LIVE_LLM", "") or "").strip() != "1":
        return None
    from dotenv import load_dotenv

    load_dotenv(_ENV_FILE, override=False)
    key = os.environ.get("NEXUS_OPENAI_API_KEY", "").strip()
    base = os.environ.get("NEXUS_OPENAI_BASE_URL", "").strip()
    if not key or not base:
        return None
    return {
        "NEXUS_OPENAI_API_KEY": key,
        "NEXUS_OPENAI_BASE_URL": base,
        "NEXUS_LLM_JSON_MODE": "1",
        "NEXUS_MODEL_BALANCED": os.environ.get("NEXUS_MODEL_BALANCED", "gpt-6-sol"),
        # 该网关只有 chat 模型；embedding 如实 opt-out，避免 /healthz 谎称 real。
        "NEXUS_MODEL_EMBEDDING": "none",
    }


_LIVE = _live_creds()
_LIVE_SKIP = pytest.mark.skipif(
    _LIVE is None,
    reason="real-wiring leg opt-in: set NEXUS_LIVE_LLM=1 + .env with real key to run",
)


def _oracle(handler: Callable[[httpx.Request], httpx.Response]) -> OpenAICompatibleProvider:
    """与生产同形（真实 base_url + json_mode），仅注入 transport。"""
    return OpenAICompatibleProvider(
        api_key="fake-oracle-credential",
        base_url="https://gateway.example/v1",
        models={"balanced": "gpt-6-sol"},
        transport=httpx.MockTransport(handler),
    )


def _chat_payload() -> dict[str, Any]:
    return {
        "requestId": "req_live_wiring",
        "system": ORACLE_SYSTEM,
        "user": ORACLE_USER,
        "modelClass": "balanced",
    }


# ── 真线路腿（仅 opt-in）──────────────────────────────────────────────────

@_LIVE_SKIP
def test_live_provider_honors_json_mode_and_reports_real_usage() -> None:
    """真调项目自己的 OpenAICompatibleProvider：JSON mode 生效 + 真 usage + key 不回显。"""
    settings = load_settings(_LIVE)
    assert settings.has_llm is True
    provider = OpenAICompatibleProvider(
        api_key=settings.openai_api_key or "",
        base_url=settings.openai_base_url,
        models=settings.models,
        timeout_s=settings.request_timeout_s,
        json_mode=settings.json_mode,
    )
    try:
        completion = provider.complete(
            model=provider.model_for("balanced"), system=ORACLE_SYSTEM, user=ORACLE_USER
        )
    finally:
        provider.close()

    parsed = _judge_json_mode(completion.text)
    assert isinstance(parsed, dict)
    _judge_real_usage(completion)
    assert completion.provider == "openai-compatible"
    assert settings.openai_api_key not in repr(completion)
    assert settings.openai_api_key not in completion.text


@_LIVE_SKIP
def test_live_chat_route_is_real_not_demo() -> None:
    """经项目真实 app 的 /v1/ai/chat 打真网关：capability=real、demoMode=false。
    把 cont.42 的"DEMO MODE 招牌被移除"人工观察升级成服务端门。"""
    settings = load_settings(_LIVE)
    client = TestClient(create_app(settings, registry=Registry(settings)))
    response = client.post("/v1/ai/chat", json=_chat_payload())
    assert response.status_code == 200, f"真线路 chat 失败：{response.status_code} {response.text[:200]}"
    body = response.json()
    assert body["capability"] == "real"
    assert body["usage"]["demoMode"] is False, "真 provider 却仍标 demoMode=true —— 招牌没摘干净"
    assert body.get("text"), "真线路没返回正文"


@_LIVE_SKIP
def test_live_healthz_reports_embedding_honestly() -> None:
    """/healthz 在 embedding 关闭时如实报 unavailable，llm 仍 real（能力面不被牵连）。"""
    settings = load_settings(_LIVE)
    assert settings.embedding_enabled is False, "本网关只有 chat 模型，embedding 必须 opt-out"
    client = TestClient(create_app(settings, registry=Registry(settings)))
    _judge_embedding_honest(client.get("/healthz").json())


# ── 离线变异臂（恒跑，证明三个判据有牙 + key 不泄漏）─────────────────────

def test_provider_live_gate_arm_json_mode_ignored_goes_red() -> None:
    """臂1：网关忽略 response_format、回纯文本 → JSON mode 判据必须红。"""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={
            "model": "gpt-6-sol",
            "choices": [{"message": {"content": "sure, here is your answer"}}],
            "usage": {"prompt_tokens": 3, "completion_tokens": 5},
        })

    completion = _oracle(handler).complete(model="gpt-6-sol", system=ORACLE_SYSTEM, user=ORACLE_USER)
    with pytest.raises((ValueError, TypeError)):
        _judge_json_mode(completion.text)


def test_provider_live_gate_arm_zero_usage_goes_red() -> None:
    """臂2：usage 恒 0（假调用/网关没记账）→ 真 usage 判据必须红。"""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={
            "model": "gpt-6-sol",
            "choices": [{"message": {"content": '{"pong": true}'}}],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0},
        })

    completion = _oracle(handler).complete(model="gpt-6-sol", system=ORACLE_SYSTEM, user=ORACLE_USER)
    assert completion.tokens_in == 0  # 前提：注入的假响应 usage 确为 0
    with pytest.raises(AssertionError):
        _judge_real_usage(completion)


def test_provider_live_gate_arm_embedding_faked_real_goes_red() -> None:
    """臂3：embedding 谎报 real → 诚实判据必须红（§159 反面）。"""
    body = {
        "capability": "real",
        "providers": [
            {"kind": "llm", "status": "real"},
            {"kind": "embedding", "status": "real", "reason": ""},
        ],
    }
    with pytest.raises(AssertionError, match="谎称 real"):
        _judge_embedding_honest(body)


def test_provider_live_gate_arm_key_never_leaks_on_error() -> None:
    """臂4：provider 报错路径不得回显 key（真线路腿的兜底）。"""
    secret = "fake-oracle-credential-SHOULD-NOT-LEAK"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text="bad key")

    provider = OpenAICompatibleProvider(
        api_key=secret,
        base_url="https://gateway.example/v1",
        models={"balanced": "gpt-6-sol"},
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(ProviderFailed) as exc:
        provider.complete(model="gpt-6-sol", system="s", user="u")
    assert secret not in str(exc.value)
    provider.close()
