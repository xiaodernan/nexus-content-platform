"""§COST-2 后续 · 成本账的黑要分两种黑法（ADR-0311）。

`costUsd=0` 有两种来路，处置完全相反：价目表压根没配，以及**改了模型名之后表里一条都对不上**。
后者最阴——调用照常 200、代码一行没坏，只有账静默归零，而 0 会被读成"免费"。
本模块钉住 `/v1/ai/cache-stats` 的 `pricing` 那本账把两者分开说。
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from ai_service.app import create_app
from ai_service.config import Settings
from ai_service.pricing import PriceTable
from ai_service.providers.registry import Registry

CLASSES = ("fast", "balanced", "reasoning", "vision")
OLD = {c: "gpt-6-sol" for c in CLASSES}
RENAMED = {c: "gpt-6.2-sol" for c in CLASSES}


def _table(spec: dict[str, dict[str, float]]) -> PriceTable:
    return PriceTable.from_env_value(json.dumps(spec))


def _registry(models: dict[str, str], table: PriceTable) -> Registry:
    settings = Settings(models=models, price_table=table)
    return Registry(settings, llm=None, embedding=None)


def test_empty_table_reads_unconfigured_not_free() -> None:
    """表是空的 → `unconfigured`。这是"没配置"，不是"这条模型不要钱"。"""
    state = _registry(RENAMED, _table({})).pricing_state()
    assert state["state"] == "unconfigured"
    assert state["configured"] is False
    assert state["entries"] == 0
    assert sorted(state["unpriced"]) == sorted(CLASSES)


def test_matching_table_reads_ok() -> None:
    """每个在用模型名都算得出价 → ok，unpriced 必须空。"""
    state = _registry(RENAMED, _table({"gpt-6.2-sol": {"in": 3e-6, "out": 1.2e-5}})).pricing_state()
    assert state["state"] == "ok"
    assert state["configured"] is True
    assert state["unpriced"] == []
    assert sorted(state["priced"]) == sorted(CLASSES)


def test_renamed_model_flips_the_ledger_to_model_drift() -> None:
    """本片的核心一臂：价目表**配了**，但模型名从 gpt-6-sol 换成 gpt-6.2-sol。

    这正是"成本账静默归零"的形状——表非空所以 `configured` 为真，可四条全对不上。
    没有这一档，运维看到的只有 costUsd=0，而 0 会被读成免费。
    """
    state = _registry(RENAMED, _table({"gpt-6-sol": {"in": 3e-6, "out": 1.2e-5}})).pricing_state()
    assert state["state"] == "model-drift"
    assert state["configured"] is True, "表确实配了——这不是没配置"
    assert state["entries"] == 1
    assert sorted(state["unpriced"]) == sorted(CLASSES)
    assert state["priced"] == []


def test_prefix_entry_counts_as_priced() -> None:
    """前缀键（`gpt-6*`）也算匹配——判据是 price_for 的查表规则，不是字典键相等。

    否则"用前缀兜日期后缀"这条正规配法会被误报成 drift，一个天天误报的门等于没有门。
    """
    state = _registry(RENAMED, _table({"gpt-6*": {"in": 3e-6, "out": 1.2e-5}})).pricing_state()
    assert state["state"] == "ok", state
    assert state["unpriced"] == []


def test_partial_drift_lists_only_the_unmatched_class() -> None:
    """只有一条档对不上时，drift 必须点名那一条，而不是把四条一起报成黑。"""
    models = {"fast": "gpt-6.2-sol", "balanced": "gpt-6.2-sol", "reasoning": "gpt-6.2-sol", "vision": "gpt-4o"}
    state = _registry(models, _table({"gpt-6.2-sol": {"in": 3e-6, "out": 1.2e-5}})).pricing_state()
    assert state["state"] == "model-drift"
    assert state["unpriced"] == ["vision"]
    assert sorted(state["priced"]) == ["balanced", "fast", "reasoning"]


def test_cache_stats_endpoint_carries_the_pricing_ledger() -> None:
    """线上报文必须带这本账，且形状固定——面板读的是键名，不是注释。"""
    settings = Settings(models=RENAMED, price_table=_table({"gpt-6-sol": {"in": 3e-6, "out": 1.2e-5}}))
    client = TestClient(create_app(settings, registry=_registry(RENAMED, settings.price_table)))

    response = client.get("/v1/ai/cache-stats")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"prefix", "appCache", "provider", "upstream", "transport", "pricing"}
    pricing = body["pricing"]
    assert set(pricing) == {"state", "configured", "entries", "models", "priced", "unpriced", "note"}
    assert pricing["state"] == "model-drift", "端点必须把这条静默归零说破，而不是留个 0"
    assert pricing["models"] == RENAMED


def test_pricing_state_never_claims_ok_without_a_nonempty_table() -> None:
    """空表 + 空模型清单也不能报 ok：没有可比对象就说没配置。"""
    state = _registry({c: "" for c in CLASSES}, _table({})).pricing_state()
    assert state["state"] == "unconfigured"
    assert state["models"] == {c: "" for c in CLASSES}
    assert state["priced"] == [] and state["unpriced"] == []
