"""§CACHE-2 缓存读数门：前缀复用率与 provider 报账覆盖度。

为什么这两条要钉：
- 前缀复用率是**唯一与网关无关**的缓存指标。若它算错（例如把"每轮都不同"也算成复用），
  我们就会在网关数字抖动时自我安慰"缓存很好"——那正是这一片要终结的状态。
- `cached=0` 与"provider 没报"必须分开记。混成一句就是把缺席写成确定的 0 命中。

对照口径见 ADR 0262：真机四实验里内容零重叠也报 cached=5248，故不拿网关数字当仪器。
"""

from __future__ import annotations

import json

import pytest

from conftest import FakeProvider, ai_request
from ai_service.cache_telemetry import CacheTelemetry, PrefixReuseTracker, ProviderCacheLedger
from ai_service.design_prompt import stable_block_digest
from ai_service.providers.base import Completion


def _completion(*, tokens_in: int, cached: int, reported: bool) -> Completion:
    return Completion(
        text="{}",
        provider="fake",
        model="m",
        tokens_in=tokens_in,
        tokens_out=1,
        latency_ms=1.0,
        cached_tokens=cached,
        cache_reported=reported,
    )


# ── 前缀复用 ────────────────────────────────────────────────────────────────

def test_reuse_rate_counts_repeats_and_reports_null_before_any_request() -> None:
    t = PrefixReuseTracker(capacity=8)
    assert t.stats()["reuseRate"] is None, "一次都没请求时说 null，不许画 0%（0% 是一句具体的谎）"

    assert t.observe("aaa") is False, "第一次见不算复用"
    assert t.observe("bbb") is False
    assert t.observe("aaa") is True, "同一前缀第二次出现就是复用"
    s = t.stats()
    assert s["requests"] == 3 and s["reused"] == 1 and s["uniquePrefixes"] == 2
    assert s["reuseRate"] == pytest.approx(1 / 3, abs=1e-4)


def test_reuse_tracker_is_bounded_and_evicts_lru() -> None:
    t = PrefixReuseTracker(capacity=2)
    t.observe("a")
    t.observe("b")
    t.observe("a")          # a 成最近使用 → 内存里只剩 {a, b}，b 是最久未用
    t.observe("c")          # 超容量，淘汰最久未用的 b → {a, c}
    assert t.stats()["evictions"] == 1
    assert t.observe("c") is True, "c 刚写进来，必须还在（淘汰的是 b 不是 c）"
    assert t.observe("b") is False, "b 已被淘汰，再来应算新的"


def test_zero_capacity_is_a_config_error_not_a_silent_off_switch() -> None:
    with pytest.raises(ValueError):
        PrefixReuseTracker(capacity=0)


# ── provider 报账覆盖度 ─────────────────────────────────────────────────────

def test_provider_ledger_separates_zero_from_missing() -> None:
    led = ProviderCacheLedger()
    led.record(_completion(tokens_in=1000, cached=0, reported=True))    # 真报了一个 0
    led.record(_completion(tokens_in=500, cached=400, reported=True))
    led.record(_completion(tokens_in=800, cached=0, reported=False))   # 没报
    s = led.stats()
    assert s["reported"] == 2 and s["missing"] == 1
    assert s["cachedTokensTotal"] == 400
    assert s["promptTokensTotal"] == 1500, "分母只算报过账的样本，不把缺席的 800 混进去"
    assert s["reportedHitRate"] == pytest.approx(400 / 1500, abs=1e-4)


def test_provider_rate_is_null_when_nothing_was_reported() -> None:
    led = ProviderCacheLedger()
    led.record(_completion(tokens_in=700, cached=0, reported=False))
    s = led.stats()
    assert s["reported"] == 0 and s["missing"] == 1
    assert s["reportedHitRate"] is None, "没有报账样本时给 null，不给 0%"


# ── 稳定前缀摘要 ────────────────────────────────────────────────────────────

def _fixture_request() -> dict:
    """用契约夹具而不是手搓请求：它有真的 designIndex，摘要才有稳定块可算。"""
    import pathlib

    p = pathlib.Path(__file__).resolve().parents[3] / "contracts" / "fixtures" / "ai-request-with-index.json"
    return json.loads(p.read_text(encoding="utf-8"))


def test_stable_digest_ignores_the_volatile_tail_but_follows_the_catalog() -> None:
    """同一项目换诉求/换选中 → 摘要不变；改目录 → 摘要必变。

    这正好是前缀缓存的口径：能命中的只有稳定块，诉求不在其中。
    """
    base = _fixture_request()
    d0 = stable_block_digest(base)

    moved = json.loads(json.dumps(base))
    moved["prompt"] = "换一句完全不同的诉求"
    moved["intent"] = "design.critique"
    moved["context"]["selection"] = ["another-node"]
    assert stable_block_digest(moved) == d0, "诉求/选中变了不该影响稳定前缀摘要"

    changed = json.loads(json.dumps(base))
    changed["context"]["designIndex"]["pages"][0]["name"] = "改过的页面名"
    assert stable_block_digest(changed) != d0, "目录变了摘要必须变，否则复用率会虚高"


def test_stable_digest_is_deterministic() -> None:
    request = _fixture_request()
    assert stable_block_digest(request) == stable_block_digest(request)


# ── 端点 ────────────────────────────────────────────────────────────────────

def test_cache_stats_endpoint_reports_three_books_without_faking() -> None:
    from fastapi.testclient import TestClient

    from ai_service.app import create_app
    from ai_service.config import Settings
    from ai_service.providers.registry import Registry

    provider = FakeProvider(json.dumps({"patches": [], "explanation": "看到了", "labels": []}, ensure_ascii=False))
    registry = Registry(Settings(), llm=provider)
    client = TestClient(create_app(Settings(), registry=registry))

    first = client.get("/v1/ai/cache-stats")
    assert first.status_code == 200
    body = first.json()
    assert body["prefix"]["requests"] == 0
    assert body["prefix"]["reuseRate"] is None
    assert body["provider"]["reported"] == 0 and body["provider"]["missing"] == 0
    assert body["appCache"] is None, "没启用应用缓存就报 null，不假装一个 backend"

    request = ai_request(prompt="把标题改成 64px，只输出 json。")
    assert client.post("/v1/ai/run", json=request).status_code == 200
    assert client.post("/v1/ai/run", json=request).status_code == 200

    after = client.get("/v1/ai/cache-stats").json()
    assert after["prefix"]["requests"] == 2
    assert after["prefix"]["reused"] == 1, "同一份稳定前缀连发两次，第二次应记为复用"
    assert after["prefix"]["reuseRate"] == pytest.approx(0.5, abs=1e-4)
    # FakeProvider 不报 cached → 记 missing，不记成"命中 0"
    assert after["provider"]["missing"] == 2 and after["provider"]["reported"] == 0
    assert after["provider"]["reportedHitRate"] is None


def test_snapshot_shape_is_stable() -> None:
    snap = CacheTelemetry(prefix_capacity=4).snapshot()
    assert set(snap) == {"prefix", "provider"}
    assert set(snap["prefix"]) == {"requests", "reused", "uniquePrefixes", "capacity", "evictions", "reuseRate"}
    assert set(snap["provider"]) == {"reported", "missing", "cachedTokensTotal", "promptTokensTotal", "reportedHitRate"}
