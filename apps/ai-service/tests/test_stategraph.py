"""§LangGraph (2026-11-16) — /v1/ai/design-graph：设计管线的状态图编排单元测试。

用 FakeRegistry / FakeLLM，不触达任何真实 provider（当前 .env 指向的 provider 被地域级 403，
与此测试彻底无关）。断言两件事：
1. 状态图路径与线性管线同形状产出（200/400/502/503 + 契约合格的响应形状）；
2. 状态图每个阶段都登记在 graphStages，顺序严格 validate→check_provider→build_prefix→
   call_llm→cache_read→parse_and_release→assemble（失败直返分支终止在END，不会继续向下跑）。
所有用例同步执行：`anyio.run` 包住 async 的状态图入口，无需 anyio/asyncio 插件。
"""

from __future__ import annotations

import json
from functools import partial
from typing import Any

import anyio

from ai_service import stategraph

REPLY_OK = json.dumps(
    {
        "plans": [{"goal": "改标题", "tasks": [{"id": "t1", "title": "改 H1", "agent": "design"}]}],
        "patches": [{"pageId": "p1", "ops": [{"op": "set", "nodeId": "n1", "path": "text", "value": "hello"}]}],
        "explanation": "changed the heading",
        "labels": ["示例"],
    },
    ensure_ascii=False,
)
REPLY_DESTRUCTIVE = json.dumps(
    {
        "plans": [],
        "patches": [{"pageId": "p1", "ops": [{"op": "remove", "nodeId": "n1"}]}],
        "explanation": "delete the hero block",
        "labels": [],
    },
    ensure_ascii=False,
)


class FakeCompletion:
    def __init__(self, text: str) -> None:
        self.provider = "fake"
        self.model = "fake-model"
        self.tokens_in = 64
        self.tokens_out = 24
        self.cached_tokens = 48
        self.cache_reported = True
        self.reasoning_tokens = 0
        self.latency_ms = 12.3
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
        return FakeCompletion(self.text)


class FakeRegistry:
    def __init__(self, llm) -> None:
        self.llm = llm
        self.price_table = FakePriceTable()

    def cache_telemetry(self) -> FakeTelemetry:
        return FakeTelemetry()


def valid_payload(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "requestId": "req-test-1",
        "modelClass": "balanced",
        "intent": "design-edit",
        "prompt": "heading → hello",
        "variants": 1,
        "context": {"projectId": "proj-test-1"},
        "approvalPolicy": [],
        "dryRun": True,
    }
    base.update(overrides)
    return base


def destructive_payload() -> dict[str, Any]:
    return valid_payload(approvalPolicy=["delete"], dryRun=False)


def run(registry: FakeRegistry, payload: dict[str, Any]):
    return anyio.run(partial(stategraph.run_design_stategraph, payload, registry=registry))


def test_happy_path_graph_200():
    registry = FakeRegistry(FakeLLM(REPLY_OK))
    status, body = run(registry, valid_payload(dryRun=False))
    assert status == 200
    assert body["capability"] == "real"
    assert isinstance(body.get("patches"), list) and body["patches"], "happy path ships the set op patch"
    assert "graphStages" not in body, "编排标记绝不进 ai-response 契约体（additionalProperties=false）"


def test_stategraph_stage_order_via_compiled_graph():
    # 直接对编译后的图问中间状态（stages），HTTP 体不带这类调试信息
    import anyio
    from functools import partial

    registry = FakeRegistry(FakeLLM(REPLY_OK))
    initial = {"payload": valid_payload(dryRun=False), "registry": registry, "stages": []}

    async def _go():
        return await stategraph.design_graph().ainvoke(initial)

    final = anyio.run(partial(_go))
    stages = [event["stage"] for event in final.get("stages") or []]
    assert stages == [
        "validate",
        "check_provider",
        "build_prefix",
        "call_llm",
        "cache_read",
        "release_patches",
        "assemble",
    ]


def test_stategraph_dry_run_suppresses_patches():
    registry = FakeRegistry(FakeLLM(REPLY_OK))
    status, body = run(registry, valid_payload(dryRun=True))
    assert status == 200
    assert body["patches"] == []
    assert body.get("explanation")


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


def test_stategraph_destructive_requires_approval():
    registry = FakeRegistry(FakeLLM(REPLY_DESTRUCTIVE))
    status, body = run(registry, destructive_payload())
    assert status == 200
    assert body["patches"] == [], "审批前不执行删除类 op"
    assert body.get("approvals"), "应该有至少一条 delete 审批提醒"
    assert body.get("error", {}).get("code") == "approval-required"


def test_stategraph_non_json_reply_502():
    registry = FakeRegistry(FakeLLM("not json at all !"))
    status, body = run(registry, valid_payload())
    assert status == 502
    assert body["code"] == "provider-failed"


def test_stategraph_bad_patch_shape_502():
    bad = json.dumps({"patches": [{"pageId": "p1"}], "explanation": "x", "plans": []})
    registry = FakeRegistry(FakeLLM(bad))
    status, body = run(registry, valid_payload())
    assert status == 502
    assert body["code"] == "validation-failed"
