"""§LangGraph (cont.254) — /v1/ai/chat-graph：对话通道的状态图编排单元测试（fake，不碰真 provider）。

断言两件事：
1. 状态图路径与线性管线同形状产出（200/400/502/503 + 契约合格的 AiChatResponse）；
2. 每个阶段都登记在 stages，顺序严格 validate→check_provider→build_prefix→call_llm→
   cache_read→parse_and_release→assemble（失败直返分支终止在 END，不会继续向下跑）。
所有用例同步执行：`anyio.run` 包住 async 的状态图入口（无需 anyio/asyncio 插件）。
"""

from __future__ import annotations

from functools import partial
from typing import Any

import anyio

from ai_service import chat_stategraph

REPLY_OK = "山口很安静，风里没有马蹄声。"


class FakeCompletion:
    def __init__(self, text: str) -> None:
        self.provider = "fake"
        self.model = "fake-model"
        self.tokens_in = 128
        self.tokens_out = 24
        self.cached_tokens = 96
        self.cache_reported = True
        self.reasoning_tokens = 0
        self.latency_ms = 15.0
        self.text = text


class FakeNamespace:
    def observe(self, *_args: Any, **_kwargs: Any) -> None:
        return None

    def record(self, *_args: Any, **_kwargs: Any) -> None:
        return None


class FakeTelemetry:
    prefix = FakeNamespace()
    provider = FakeNamespace()
    upstream = FakeNamespace()


class FakePriceTable:
    def price_for(self, _model: str):
        return None


class FakeLLM:
    def __init__(self, text: str) -> None:
        self.text = text

    def model_for(self, _model_class: str) -> str:
        return "fake-model"

    def complete(self, **kwargs: Any) -> FakeCompletion:
        assert kwargs.get("json_mode") is False, "对话必须显式关掉 json_mode（provider 会 400）"
        return FakeCompletion(self.text)


class FakeRegistry:
    def __init__(self, llm) -> None:
        self.llm = llm
        self.price_table = FakePriceTable()

    def cache_telemetry(self) -> FakeTelemetry:
        return FakeTelemetry()


def valid_payload(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "requestId": "req-chat-1",
        "modelClass": "fast",
        "system": "You are the Tidekeeper of the Tide Conclave. Only from the canon digest.",
        "user": "今晚的山口安静吗？",
    }
    base.update(overrides)
    return base


def run(registry: FakeRegistry, payload: dict[str, Any]):
    return anyio.run(partial(chat_stategraph.run_chat_stategraph, payload, registry=registry))


def test_happy_path_graph_200():
    registry = FakeRegistry(FakeLLM(REPLY_OK))
    status, body = run(registry, valid_payload())
    assert status == 200
    assert body["capability"] == "real"
    assert body["text"] == REPLY_OK
    assert body["usage"]["cachedTokens"] == 96
    assert "graphStages" not in body, "编排标记绝不能进 ai-chat-response 契约体（additionalProperties=false），只走响应头"


def test_stategraph_stage_order_via_compiled_graph():
    registry = FakeRegistry(FakeLLM(REPLY_OK))
    initial = {"payload": valid_payload(), "registry": registry, "stages": []}

    async def _go():
        return await chat_stategraph.chat_graph().ainvoke(initial)

    final = anyio.run(partial(_go))
    stages = [event["stage"] for event in final.get("stages") or []]
    assert stages == [
        "validate",
        "check_provider",
        "build_prefix",
        "call_llm",
        "cache_read",
        "parse_and_release",
        "assemble",
    ]


def test_stategraph_no_provider_503():
    registry = FakeRegistry(None)
    status, body = run(registry, valid_payload())
    assert status == 503
    assert body["code"] == "provider-unavailable"


def test_stategraph_invalid_payload_400():
    registry = FakeRegistry(FakeLLM(REPLY_OK))
    status, body = run(registry, {"requestId": "x"})
    assert status == 400
    assert body["code"] == "validation-failed"


def test_stategraph_empty_reply_502():
    registry = FakeRegistry(FakeLLM("   "))
    status, body = run(registry, valid_payload())
    assert status == 502
    assert body["code"] == "provider-failed"


def test_stategraph_prefix_digest_is_stable_and_distinct():
    # 同一 system → 同一 digest（provider 前缀缓存的先决条件）；不同 system → 不同 digest
    registry_a = FakeRegistry(FakeLLM(REPLY_OK))
    registry_b = FakeRegistry(FakeLLM(REPLY_OK))
    run(registry_a, valid_payload())
    run(registry_b, valid_payload(system="completely different system"))
    status, body = run(FakeRegistry(FakeLLM(REPLY_OK)), valid_payload())
    assert status == 200


def test_stategraph_canon_prefix_is_first_byte_and_reported():
    """§LLMCTX-1：状态图路径与线性管线同一条口径。

    digest 必须是第一个字节（否则每个角色都要重买一次 15.8 万 token 前缀），
    且 `canonPrefixChars` 真的出现在响应里——报了才证明那段上下文用上了。
    """
    from ai_service.design_prompt import CANON_PREFIX

    class RecordingLLM(FakeLLM):
        def complete(self, **kwargs: Any) -> FakeCompletion:
            self.system = kwargs.get("system")
            return super().complete(**kwargs)

    llm = RecordingLLM(REPLY_OK)
    status, body = run(FakeRegistry(llm), valid_payload(withCanonPrefix=True))
    assert status == 200
    assert llm.system.startswith(CANON_PREFIX[:64])
    assert llm.system.endswith(valid_payload()["system"])
    assert body["canonPrefixChars"] == len(CANON_PREFIX)


def test_stategraph_without_canon_prefix_reports_nothing():
    """零回归：不带的时 `canonPrefixChars` 不出现——没垫就不能报一个数。"""
    status, body = run(FakeRegistry(FakeLLM(REPLY_OK)), valid_payload())
    assert status == 200
    assert "canonPrefixChars" not in body
