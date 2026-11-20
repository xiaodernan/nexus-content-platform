"""§WS-1 · /v1/ai/world-step：潮候步进（LLM 作为状态流转的分析层）单元测试。

FakeRegistry / FakeLLM，不触达任何真实 provider（与 test_stategraph.py 同纪律）。
断言五件事：
1. happy path 200：两次 provider 调用 → 契约合格的响应形状（capability=real）
2. 读局（analyze）把 hooks 喂给检索；canon_guard 逐字核验引用并剔除虚构锚句
3. delta 数字被夹紧到 [-3,3]；unlocks 只保留 digest 里真实存在的回响编号
4. 任一节点失败沿条件边直达 END（400/502/503，不晚霞成半成品）
5. stages 顺序严格 validate→check_provider→analyze→retrieve→narrate→canon_guard→assemble
同步执行：anyio.run 包住 async 入口，无需 pytest 插件。
"""

from __future__ import annotations

import json
from functools import partial
from typing import Any

import anyio

from ai_service import world_step_stategraph as ws

ANALYZE_OK = json.dumps(
    {"intent": "action", "stakes": "high", "hooks": ["灯", "潮候院"]},
    ensure_ascii=False,
)

REPLY_OK = json.dumps(
    {
        "narration": "潮候院的灯没有写这一步的名字——它只把潮退之后的一排湿脚印，摊在你面前。",
        "delta": {
            "vigor": 9,          # 越界 → 必须夹到 3
            "depth": -7,         # 越界 → 必须夹到 -3
            "seals": ["潮候印"],
            # E162 存在；E99999 远超现有回响编号（canon 已扩到 #207，不能再硬编码 E177 当"不存在"）；
            # E999 格式非法。三个形状各测一条剔除分支。
            "unlocks": ["E162", "E99999", "E999"],
            "risk": "STORM",
        },
        "citations": [
            {"anchor": "zh#aaaaaaaa", "quote": "灯亮时"},  # 原文真实存在 → 保留
            {"anchor": "zh#bbbbbbbb", "quote": "这条锚句在典籍室里根本不存在xyz"},  # 虚构 → 剔除
        ],
    },
    ensure_ascii=False,
)


class FakeCompletion:
    def __init__(self, text: str) -> None:
        self.provider = "fake"
        self.model = "fake-model"
        self.tokens_in = 512
        self.tokens_out = 128
        self.cached_tokens = 480
        self.cache_reported = True
        self.reasoning_tokens = 0
        self.latency_ms = 25.0
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
    """按队列顺序发回复：analyze 先、narrate 后。"""

    def __init__(self, texts: list[str]) -> None:
        self.texts = list(texts)
        self.calls: list[dict[str, Any]] = []

    def model_for(self, _model_class: str) -> str:
        return "fake-model"

    def complete(self, **kwargs: Any) -> FakeCompletion:
        self.calls.append(kwargs)
        return FakeCompletion(self.texts.pop(0))


class FakeRegistry:
    def __init__(self, llm) -> None:
        self.llm = llm
        self.price_table = FakePriceTable()

    def cache_telemetry(self) -> FakeTelemetry:
        return FakeTelemetry()


def valid_payload(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "requestId": "req-world-step-1",
        "locale": "zh",
        "state": {
            "clock": {"label": "霁历三十七年 · 仲秋 · 落潮", "season": "autumn", "tide": "falling"},
            "traveler": {"vigor": 6, "depth": 2, "seals": ["潮候印"]},
            "memory": [{"kind": "oracle", "text": "潮说：灯不记无名之人。"}],
        },
        "move": "我在潮候院门口站了一夜，要看那盏从不写名的灯。",
        "modelClass": "balanced",
    }
    base.update(overrides)
    return base


def run(registry: FakeRegistry, payload: dict[str, Any]):
    return anyio.run(partial(ws.run_world_step_stategraph, payload, registry=registry))


def test_happy_path_200_and_delta_clamped():
    llm = FakeLLM([ANALYZE_OK, REPLY_OK])
    registry = FakeRegistry(llm)
    status, body = run(registry, valid_payload())
    assert status == 200
    assert body["capability"] == "real"
    assert body["narration"], "narration 必须落地"
    assert body["delta"]["vigor"] == 3, "vigor 9 必须夹到 +3"
    assert body["delta"]["depth"] == -3, "depth -7 必须夹到 -3"
    assert body["delta"]["seals"] == ["潮候印"]
    assert body["delta"]["unlocks"] == ["E162"], "只有 digest 里真实存在的回响才被解锁（非法格式与未来编号都剔除）"
    assert body["delta"]["risk"] == "storm", "risk 必须折叠为小写且通过白名单"
    # 引用核验：原文真实存在的那条保留，虚构锚句被剔除
    quotes = [c["quote"] for c in body["citations"]]
    assert "灯亮时" in quotes
    assert all("xyz" not in q for q in quotes)
    # 两次 provider 调用的账都要合计进 usage，不抹零
    assert body["usage"]["toolCalls"] == 2
    assert body["usage"]["tokensIn"] == 1024
    assert body["usage"]["cachedTokens"] == 960


def test_stage_order_and_two_provider_calls():
    llm = FakeLLM([ANALYZE_OK, REPLY_OK])
    registry = FakeRegistry(llm)
    status, body = run(registry, valid_payload())
    assert status == 200
    # 两次调用的车道与顺序：analyze（微小前缀，读局）→ narrate（digest 前缀，潮回）
    assert len(llm.calls) == 2
    assert llm.calls[0]["system"] == ws.ANALYZE_SYSTEM_ZH
    assert llm.calls[0]["json_mode"] is True
    assert llm.calls[1]["system"].startswith(ws.CANON_PREFIX[:64])
    assert llm.calls[1]["json_mode"] is True


def test_analyze_bad_json_502():
    registry = FakeRegistry(FakeLLM(["not json at all !"]))
    status, body = run(registry, valid_payload())
    assert status == 502
    assert body["code"] == "provider-failed"


def test_narrate_bad_json_502():
    registry = FakeRegistry(FakeLLM([ANALYZE_OK, "<html>403 blocked</html>"]))
    status, body = run(registry, valid_payload())
    assert status == 502
    assert body["code"] == "provider-failed"


def test_no_provider_503():
    registry = FakeRegistry(None)
    status, body = run(registry, valid_payload())
    assert status == 503
    assert body["code"] == "provider-unavailable"


def test_invalid_payload_400():
    registry = FakeRegistry(FakeLLM([ANALYZE_OK, REPLY_OK]))
    status, body = run(registry, {"requestId": "x"})
    assert status == 400
    assert body["code"] == "validation-failed"


def test_citations_only_from_retrieved_anchors_or_real_digest():
    # narrate 试图引用一条不在检索结果、也不在 digest 的"带数字编号"锚句：必须被剔
    reply = json.dumps(
        {
            "narration": "潮没有回答，只在你面前落下三点盐。",
            "delta": {"vigor": 0, "depth": 1, "seals": [], "unlocks": [], "risk": "calm"},
            "citations": [{"anchor": "zh#deadbeef", "quote": "第九百九十九条典籍室从没写过的话"}],
        },
        ensure_ascii=False,
    )
    registry = FakeRegistry(FakeLLM([ANALYZE_OK, reply]))
    status, body = run(registry, valid_payload())
    assert status == 200
    assert body["citations"] == []


def test_world_step_canon_guard_drops_unlocks_not_in_digest():
    reply = json.dumps(
        {
            "narration": "潮候院只许翻到真实存在的那一页。",
            "delta": {"vigor": 1, "depth": 0, "seals": ["盐印"], "unlocks": ["E99999"], "risk": "uneasy"},
            "citations": [],
        },
        ensure_ascii=False,
    )
    registry = FakeRegistry(FakeLLM([ANALYZE_OK, reply]))
    status, body = run(registry, valid_payload())
    assert status == 200
    assert body["delta"]["unlocks"] == [], "E99999 不在 canon digest 里（未来回响），必须剔除"
