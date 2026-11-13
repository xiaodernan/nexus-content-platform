"""LLM completion 缓存组件门（v680，纯组件 + 真线路 opt-in 腿）。

被测对象是 `completion_cache.LlmCompletionCache` / `CachedLlm`——一个**尚未接进生产
调用链**的 opt-in 组件。为什么先做组件不接线：契约 `additionalProperties=false` + web
`TaskUsageSchema` 精确形状，"缓存命中算不算新调用、token/latency 记谁"是跨模块语义
决策（ADR 0113）。语义未定之前钉门、改生产都会惩罚将来的正当决策，故只把组件做对。

CI 安全（函数级 skipif，沿用 v677/ADR 0110）：真线路腿 `test_live_*` 没有
`NEXUS_LIVE_LLM=1` + 真 key 时各自 skip（不发网络、不假绿）；离线门与变异臂恒跑，
在无 key 的 CI 上也证明门有牙。

判据单一真值（ADR 0095）：`_judge_*` 纯判据被真线路腿与变异臂共用，不内联复刻。
判据钉"声称的性质"，不钉今天恰好相等的字面（ADR 0090/0094 X4）：
 - 命中 ≠ 新调用 = 同键第二次**没有再发网络**、且回放首次内容、stats 诚实记账；
   **刻意不钉**命中 Completion 的 token/latency/identity——那是 ADR 0113 未定的语义，
   钉死会惩罚将来"命中时把 latency 归零以更诚实"这类正当修复；
 - 键三维独立 = model / system / user 任一变都必须重新真调（漏一维就串台）；
 - 失败不缓存 = ProviderFailed 不放进缓存，不留毒条目。
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import httpx
import pytest

from ai_service.completion_cache import CachedLlm, LlmCompletionCache
from ai_service.providers.base import Completion, ProviderFailed
from ai_service.providers.openai_compatible import OpenAICompatibleProvider

_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
ORACLE_SYSTEM = "You are a JSON oracle. Reply with a single JSON object only, no prose."
ORACLE_USER = 'Reply with exactly {"pong": true}. No markdown, no explanation.'


# ── 判据（单一真值：真线路腿 / 离线门 / 变异臂共用）────────────────────────

def _judge_hit_not_new_call(obs: dict[str, Any]) -> None:
    """命中不是新调用：首次真发 1 次、第二次没再发、内容回放、stats 诚实。"""
    assert obs["inner_calls_after_first"] == 1, "首次同键调用必须真发一次"
    assert obs["inner_calls_after_second"] == 1, "同键第二次又发了网络——缓存没生效"
    assert obs["second_text"] == obs["first_text"], "命中应回放首次内容，而不是重新生成"
    assert obs["stats"]["hits"] == 1, "命中次数没记上"
    assert obs["stats"]["misses"] == 1, "首次的 miss 没记上"
    assert obs["stats"]["stores"] == 1, "首次的 store 没记上"


def _judge_three_dimension_isolation(obs: dict[str, Any]) -> None:
    """键三维独立：任一维变化都必须重新真调（漏一维 = 串台，返回上一个 prompt 的答案）。"""
    assert obs["model_change_delta"] == 1, "改 model 没重新真调——键漏了 model 维"
    assert obs["system_change_delta"] == 1, "改 system 没重新真调——键漏了 system 维"
    assert obs["user_change_delta"] == 1, "改 user 没重新真调——键漏了 user 维（最易串台）"


def _judge_failure_not_cached(obs: dict[str, Any]) -> None:
    """失败不缓存：连调两次都真发、且没有 store 毒条目。"""
    assert obs["failed_inner_calls"] == 2, "失败被缓存了：第二次没真调（毒条目）"
    assert obs["stores_after_failures"] == 0, "失败不该 store"


def _judge_ttl_expiry(obs: dict[str, Any]) -> None:
    assert obs["inner_calls"] == 2, "TTL 过期后没重新真调"
    assert obs["expirations"] == 1, "过期条目没被清点"
    assert obs["hits"] == 1 and obs["misses"] == 2, "过期前 1 命中 + 首次/过期后 2 miss"


def _judge_lru_eviction(obs: dict[str, Any]) -> None:
    assert obs["evictions"] == 1, "超容量没淘汰"
    assert obs["cache_len"] == 2, "淘汰后容量没回到上限"
    assert obs["evicted_key_gone"] is True, "最久未用的 B 没被淘汰"
    assert obs["refreshed_key_alive"] is True, "刚被命中的 A 被淘汰了——退化成 FIFO（没按命中刷新顺序）"


def _stats_dict(cache: LlmCompletionCache) -> dict[str, int]:
    s = cache.stats()
    return {"hits": s.hits, "misses": s.misses, "stores": s.stores,
            "evictions": s.evictions, "expirations": s.expirations}


# ── Recording provider（纯内存，替代网络，不改变被测组件路径）──────────────

class _RecordingProvider:
    kind = "llm"
    name = "recording"

    def __init__(self, *, fail: bool = False) -> None:
        self.calls: list[tuple[str, str, str]] = []
        self.fail = fail
        self._seq = 0

    def models(self) -> list[str]:
        return ["m0", "m1", "m2"]

    def model_for(self, model_class: str) -> str:
        return f"m-for-{model_class}"

    def complete(self, *, model: str, system: str, user: str, json_mode: bool | None = None) -> Completion:
        self.calls.append((model, system, user))
        if self.fail:
            raise ProviderFailed("synthetic provider failure")
        self._seq += 1
        # tokens 随调用序号变：若第二次真调了，返回值必然不同——门可借此识别"重生成"。
        return Completion(
            text='{"ok":true,"seq":%d}' % self._seq,
            provider=self.name,
            model=model,
            tokens_in=10 + self._seq,
            tokens_out=3,
            latency_ms=15.0,
        )


def _fresh_cache(**overrides: Any) -> LlmCompletionCache:
    opts: dict[str, Any] = {"ttl_s": 60.0, "max_entries": 16}
    opts.update(overrides)
    return LlmCompletionCache(**opts)


def _run_hit_scenario(cache: LlmCompletionCache) -> dict[str, Any]:
    inner = _RecordingProvider()
    cached = CachedLlm(inner, cache)
    kw = {"model": "m", "system": "s", "user": "u"}
    c1 = cached.complete(**kw)
    calls1 = len(inner.calls)
    c2 = cached.complete(**kw)
    calls2 = len(inner.calls)
    return {
        "inner_calls_after_first": calls1,
        "inner_calls_after_second": calls2,
        "first_text": c1.text,
        "second_text": c2.text,
        "stats": _stats_dict(cache),
    }


def _run_isolation_scenario(cache: LlmCompletionCache) -> dict[str, Any]:
    inner = _RecordingProvider()
    cached = CachedLlm(inner, cache)
    base = {"model": "m", "system": "s", "user": "u"}
    cached.complete(**base)
    b = len(inner.calls)
    cached.complete(**{**base, "model": "m2"}); m = len(inner.calls) - b; b = len(inner.calls)
    cached.complete(**{**base, "system": "s2"}); s = len(inner.calls) - b; b = len(inner.calls)
    cached.complete(**{**base, "user": "u2"}); u = len(inner.calls) - b
    return {"model_change_delta": m, "system_change_delta": s, "user_change_delta": u}


def _run_failure_scenario(cache: LlmCompletionCache) -> dict[str, Any]:
    inner = _RecordingProvider(fail=True)
    cached = CachedLlm(inner, cache)
    for _ in range(2):
        with pytest.raises(ProviderFailed):
            cached.complete(model="m", system="s", user="u")
    return {"failed_inner_calls": len(inner.calls),
            "stores_after_failures": cache.stats().stores}


# ── 离线门（恒跑，不碰网络）───────────────────────────────────────────────

def test_cache_hit_is_not_a_new_provider_call():
    _judge_hit_not_new_call(_run_hit_scenario(_fresh_cache()))


def test_all_three_key_dimensions_are_independent():
    _judge_three_dimension_isolation(_run_isolation_scenario(_fresh_cache()))


def test_provider_failure_never_poisons_cache():
    _judge_failure_not_cached(_run_failure_scenario(_fresh_cache()))


class _FakeClock:
    """满足 `now()` 契约的可控时钟：TTL 门确定性推进，不用 sleep。"""

    def __init__(self, t: float = 1000.0) -> None:
        self.t = t

    def __call__(self) -> float:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += seconds


def test_ttl_expiry_forces_a_fresh_call():
    clock = _FakeClock()
    cache = LlmCompletionCache(ttl_s=10.0, now=clock)
    inner = _RecordingProvider()
    cached = CachedLlm(inner, cache)
    kw = {"model": "m", "system": "s", "user": "u"}
    cached.complete(**kw)
    cached.complete(**kw)  # 命中（此时 clock 未推进）
    clock.advance(10.0)    # 到 TTL 边界（>= 判过期）
    cached.complete(**kw)
    s = cache.stats()
    _judge_ttl_expiry({"inner_calls": len(inner.calls), "expirations": s.expirations,
                       "hits": s.hits, "misses": s.misses})


def test_lru_evicts_least_recently_used_not_fifo():
    cache = _fresh_cache(max_entries=2)
    inner = _RecordingProvider()
    cached = CachedLlm(inner, cache)
    A = {"model": "m", "system": "s", "user": "a"}
    B = {"model": "m", "system": "s", "user": "b"}
    C = {"model": "m", "system": "s", "user": "c"}
    cached.complete(**A)             # 真调 -> store A  [A]
    cached.complete(**B)             # 真调 -> store B  [A B]
    cached.complete(**A)             # 命中 -> 刷新 A   [B A]（A 成最近用）
    cached.complete(**C)             # 真调 -> store C，超容量淘汰 B  [A C]
    # 关键：用 cache.get 直接查存活，不再经 cached.complete（否则新 store 又触发连锁淘汰，污染本门）。
    # 若实现退化成 FIFO（不按命中刷新），刚才淘汰的会是 A 而非 B —— 本门即红。
    evicted_gone = cache.get(LlmCompletionCache.key(**B)) is None
    refreshed_alive = cache.get(LlmCompletionCache.key(**A)) is not None
    s = cache.stats()
    _judge_lru_eviction({"evictions": s.evictions, "cache_len": len(cache),
                         "evicted_key_gone": evicted_gone,
                         "refreshed_key_alive": refreshed_alive})


def test_stats_are_honest_accounting():
    cache = _fresh_cache()
    inner = _RecordingProvider()
    cached = CachedLlm(inner, cache)
    kw = {"model": "m", "system": "s", "user": "u"}
    cached.complete(**kw); cached.complete(**kw); cached.complete(**kw)
    s = cache.stats()
    assert (s.hits, s.misses, s.stores) == (2, 1, 1)
    assert s.requests == 3 and s.hit_rate == pytest.approx(2 / 3)
    assert len(inner.calls) == 1, "3 次请求只应真发 1 次网络"


@pytest.mark.parametrize("bad", [
    {"ttl_s": 0}, {"ttl_s": -1.0}, {"max_entries": 0}, {"max_entries": -2},
])
def test_invalid_capacity_or_ttl_is_rejected(bad):
    opts = {"ttl_s": 1.0, **bad}
    with pytest.raises(ValueError):
        LlmCompletionCache(**opts)


def test_clear_resets_everything():
    cache = _fresh_cache()
    inner = _RecordingProvider()
    cached = CachedLlm(inner, cache)
    kw = {"model": "m", "system": "s", "user": "u"}
    cached.complete(**kw); cached.complete(**kw)
    cache.clear()
    assert len(cache) == 0
    cached.complete(**kw)
    assert len(inner.calls) == 2, "clear 后应重新真调"


def test_decorator_is_transparent_to_llm_provider_surface():
    inner = _RecordingProvider()
    cached = CachedLlm(inner, _fresh_cache())
    assert cached.kind == "llm"
    assert cached.name == inner.name
    assert cached.models() == inner.models()
    assert cached.model_for("balanced") == inner.model_for("balanced")
    assert cached.inner is inner


# ── 恒跑变异臂：证明判据有牙（离线、纯 dict / 退化组件，不碰真网关）────────

def test_arm_missing_user_dimension_goes_red():
    obs = {"model_change_delta": 1, "system_change_delta": 1, "user_change_delta": 0}
    with pytest.raises(AssertionError, match="user"):
        _judge_three_dimension_isolation(obs)


def test_arm_cached_failure_goes_red():
    with pytest.raises(AssertionError):
        _judge_failure_not_cached({"failed_inner_calls": 1, "stores_after_failures": 1})


def test_arm_second_call_counted_as_new_goes_red():
    obs = {"inner_calls_after_first": 1, "inner_calls_after_second": 2,
           "first_text": "x", "second_text": "x",
           "stats": {"hits": 0, "misses": 2, "stores": 2}}
    with pytest.raises(AssertionError, match="又发了网络|misses"):
        _judge_hit_not_new_call(obs)


def test_arm_wrong_replayed_content_goes_red():
    obs = {"inner_calls_after_first": 1, "inner_calls_after_second": 1,
           "first_text": "A", "second_text": "B",
           "stats": {"hits": 1, "misses": 1, "stores": 1}}
    with pytest.raises(AssertionError, match="回放"):
        _judge_hit_not_new_call(obs)


def test_arm_correct_observation_is_green():
    # 正向对照：判据不惩罚正确实现（ADR 0094 X4）。
    _judge_hit_not_new_call({"inner_calls_after_first": 1, "inner_calls_after_second": 1,
                             "first_text": "A", "second_text": "A",
                             "stats": {"hits": 1, "misses": 1, "stores": 1}})


def test_arm_key_without_user_breaks_the_real_component(monkeypatch):
    """判据真连着生产组件（ADR 0095 反面）：把组件的键真值退化成 2 维，门必须红。"""
    # 臂仍只干一件事：把键退化成 2 维（丢掉 user）。新加的 json_mode 维度照收不误，
    # 免得门因为"签名不匹配"而不是"键少了 user"变红——那会是假红。
    monkeypatch.setattr(
        LlmCompletionCache, "key",
        staticmethod(lambda *, model, system, user, json_mode=None: (model, system)),
    )
    obs = _run_isolation_scenario(_fresh_cache())
    with pytest.raises(AssertionError, match="user"):
        _judge_three_dimension_isolation(obs)


# ── 真线路 opt-in 腿（无 key 则 skip，不假绿）──────────────────────────────

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
    reason="real-gateway cache leg opt-in: set NEXUS_LIVE_LLM=1 + .env with real key to run",
)


class _CountingTransport(httpx.BaseTransport):
    """包住真实 HTTP transport，每次真发网络 +1；不改 provider、不改生产。"""

    def __init__(self, inner: httpx.BaseTransport) -> None:
        self._inner = inner
        self.calls = 0

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.calls += 1
        return self._inner.handle_request(request)


@_LIVE_SKIP
def test_live_cache_hit_skips_second_network_call():
    """真 gpt-6-sol：同 prompt 连调两次，第二次命中缓存 → 网关只收到 1 次请求（省钱）。"""
    from dotenv import load_dotenv
    load_dotenv(_ENV_FILE, override=False)
    counting = _CountingTransport(httpx.HTTPTransport())
    provider = OpenAICompatibleProvider(
        api_key=os.environ["NEXUS_OPENAI_API_KEY"].strip(),
        base_url=os.environ["NEXUS_OPENAI_BASE_URL"].strip(),
        models={"balanced": "gpt-6-sol"},
        transport=counting,
    )
    cache = LlmCompletionCache(ttl_s=300.0)
    cached = CachedLlm(provider, cache)
    try:
        kw = {"model": "gpt-6-sol", "system": ORACLE_SYSTEM, "user": ORACLE_USER}
        c1 = cached.complete(**kw)
        calls1 = counting.calls
        c2 = cached.complete(**kw)
        calls2 = counting.calls
        _judge_hit_not_new_call({
            "inner_calls_after_first": calls1,
            "inner_calls_after_second": calls2,
            "first_text": c1.text,
            "second_text": c2.text,
            "stats": _stats_dict(cache),
        })
        # 真调用语义（v677 判据同形）：双向 usage > 0；命中内容仍合法 JSON。
        assert c1.tokens_in > 0 and c1.tokens_out > 0, "首次不像真调用"
        parsed = json.loads(c2.text)
        assert parsed.get("pong") is True, "命中回放的内容应仍是合法 JSON mode 响应"
    finally:
        provider.close()
