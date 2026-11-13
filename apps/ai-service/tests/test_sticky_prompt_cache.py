"""v695 门（ADR 0127）：provider 前缀缓存的粘性路由 + prompt 前缀序 + completion 键第四维。

门的纪律（ADR 0094 / 0110 / 0112 / 0125）：
- 判据抽成纯函数 `_judge_*`，真腿与变异臂共用，杜绝"改判据忘改臂"。
- 钉性质/边界/同源，不钉今天恰好相等的字面值；代理量必须带**正向锚**（>0 且随成本增长）。
- 变异臂恒跑逼红，正向对照臂证明门不惩罚正当改动。
- 真线路函数级 skipif（不是模块级 pytestmark）；探针不做断言，数字落 ADR。
"""
from __future__ import annotations

import copy
import json
import os
import pathlib
from typing import Any

import httpx
import pytest

from ai_service.completion_cache import CachedLlm, LlmCompletionCache, json_mode_key
from ai_service.design_prompt import build_prompt
from ai_service.providers.base import Completion
from ai_service.sticky_prompt_cache import (
    KEY_PREFIX,
    STABLE_PROMPT_KEYS,
    TERMINAL_VOLATILE_KEYS,
    StickyPromptCacheTransport,
    _judge_sticky_body,
    ordered_payload,
    prompt_cache_key,
    sticky_body,
)

_FIXTURE = pathlib.Path(__file__).resolve().parents[3] / "contracts" / "fixtures" / "ai-request-with-index.json"


def _turn(*, sel: str, ts: str, query: str, prompt: str, variants: int) -> dict[str, Any]:
    """真实一轮会变的东西全变：选中、批注、最近改动、语料 query、诉求、variants。"""
    r = json.loads(_FIXTURE.read_text(encoding="utf-8"))
    c = r.setdefault("context", {})
    c["selection"] = [sel]
    c["selectionDigest"] = {"schemaVersion": 1, "requested": 1, "entries": [{"nodeId": sel, "name": "标题"}]}
    c["annotations"] = [{"nodeId": sel, "body": "这个太大了", "at": ts}]
    c["recentChanges"] = [{"op": "set", "at": ts}]
    c["corpus"] = {"query": query, "items": [], "omitted": 0, "candidates": 0}
    r["prompt"] = prompt
    r["variants"] = variants
    return r


def _common_prefix(a: str, b: str) -> int:
    n = min(len(a), len(b))
    for i in range(n):
        if a[i] != b[i]:
            return i
    return n


def _chat_body(*, user: str = "把标题改成 64px", stream: bool = True) -> dict[str, Any]:
    return {
        "model": "gpt-6-sol",
        "messages": [
            {"role": "system", "content": "你是设计编辑 Agent，只输出 JSON。"},
            {"role": "user", "content": user},
        ],
        "temperature": 0.2,
        "stream": stream,
        **({"stream_options": {"include_usage": True}} if stream else {}),
    }


# ── 判据（纯函数，真腿与臂共用）────────────────────────────────────────────

def _judge_prefix_dominates(shared: int, total: int, *, min_fraction: float = 0.5) -> bool:
    """稳定前缀必须占 user prompt 的大头，且非零。钉形状，不钉"恰好 N 字符"。"""
    return shared > 0 and total > 0 and shared / total >= min_fraction


def _judge_key_stable_across_turns(keys: list[str]) -> bool:
    """路由键跨轮恒定；且键非空、带命名空间前缀（正向锚，防"恒空也算稳"的假绿）。"""
    return bool(keys) and all(k.startswith(KEY_PREFIX) and len(k) > len(KEY_PREFIX) for k in keys) and len(set(keys)) == 1


def _judge_key_separates_projects(a: str, b: str) -> bool:
    """不同稳定现场必须分开：键是内容的函数，不是常量（正向锚，防"永远返回同一个键"）。"""
    return a != b and a.startswith(KEY_PREFIX) and b.startswith(KEY_PREFIX)


def _judge_dimension_isolation(modes_seen: list[bool | None], *, expected: int) -> bool:
    """缓存键把每个维度都隔开：换一个维度就要多一次真调用。

    读的是**真实记下来的 inner.complete 调用序列**（代理量 >0 的正向锚），
    不是调用方自己写好的常数——否则门会恒绿。
    """
    if len(modes_seen) != expected or not modes_seen:
        return False
    # 三种 json_mode 态各自至少被真调一次；同一态重复调用必须被缓存挡掉
    states = {json_mode_key(m) for m in modes_seen}
    return states == {"default", "json", "text"} and len(modes_seen) == len(set(modes_seen)) + 1


# ── 前缀序门 ──────────────────────────────────────────────────────────────

def test_stable_catalog_is_a_real_byte_prefix() -> None:
    """真机根因：旧序在第 81 字节就分叉，整份目录进不了 provider 前缀缓存。"""
    _, u1 = build_prompt(_turn(sel="fx004", ts="t1", query="标题样式", prompt="把标题改成 64px", variants=1))
    _, u2 = build_prompt(_turn(sel="fx005", ts="t2", query="按钮配色", prompt="把标题改成 72px", variants=2))
    shared, total = _common_prefix(u1, u2), len(u1)
    assert _judge_prefix_dominates(shared, total), f"共享前缀 {shared}/{total} 不足以承载前缀缓存"
    # 正向锚：目录体量变大时，两轮之间的共享前缀也随之变长（代理量随成本增长，不是恒定常数）。
    # 注意是"大目录的两轮互比"，不是"大目录 vs 原目录"——往 JSON 数组中间追加元素
    # 必然在那里截断字节前缀，那种比法本身就是错的（门先别自己骗自己）。
    def _big_turn(sel: str, prompt: str) -> dict[str, Any]:
        r = _turn(sel=sel, ts="t1", query="标题样式", prompt=prompt, variants=1)
        r["context"]["designIndex"]["frames"] = r["context"]["designIndex"]["frames"] * 4
        return r

    _, b1 = build_prompt(_big_turn("fx004", "把标题改成 64px"))
    _, b2 = build_prompt(_big_turn("fx005", "把标题改成 72px"))
    shared_big = _common_prefix(b1, b2)
    assert shared_big > shared, f"代理量不随目录体量增长：{shared_big} <= {shared}"
    assert _judge_prefix_dominates(shared_big, len(b1))


def test_build_prompt_uses_shared_ordering() -> None:
    """同源门（ADR 0095）：build_prompt 必须真的调用 ordered_payload，不是各写一套。

    把产出重新排一次应当逐字节不变；若哪天有人把 build_prompt 改回手写插入序，
    这条会红——它与粘性键、前缀序门共同钉死"三处同源"。
    """
    _, user = build_prompt(_turn(sel="fx004", ts="t1", query="标题样式", prompt="把标题改成 64px", variants=1))
    assert json.dumps(ordered_payload(json.loads(user)), ensure_ascii=False, separators=(",", ":"), default=str) == user


def test_volatile_keys_are_after_stable_catalog() -> None:
    """键插入序：稳定现场在前、本轮诉求在尾（与粘性键共用 STABLE_PROMPT_KEYS 单一真值）。"""
    _, user = build_prompt(_turn(sel="fx004", ts="t1", query="标题样式", prompt="把标题改成 64px", variants=1))
    keys = list(json.loads(user).keys())
    assert keys[-3:] == list(TERMINAL_VOLATILE_KEYS), f"诉求必须在末尾，实测 {keys[-5:]}"
    stable_positions = [keys.index(k) for k in STABLE_PROMPT_KEYS if k in keys]
    assert stable_positions and max(stable_positions) < keys.index("intent"), "稳定目录必须整体在诉求之前"
    assert keys.index("selection") < keys.index("intent"), "会变的选中项也在诉求之前，不与目录抢前缀"


def test_arm_prefix_order_reverted_goes_red() -> None:
    """变异臂：把易变字段挪回最前，判据必须红（证明门真的读实现，不是恒绿）。"""
    _, u_good = build_prompt(_turn(sel="fx004", ts="t1", query="标题样式", prompt="把标题改成 64px", variants=1))
    _, u_other = build_prompt(_turn(sel="fx005", ts="t2", query="按钮配色", prompt="把标题改成 72px", variants=2))
    d = json.loads(u_good)
    # 旧序：modelClass/viewport/pageId/selection... 在最前
    old_order = {k: d[k] for k in ("modelClass", "viewport", "pageId", "selection", "selectionDigest", "annotations", "recentChanges", "corpus") if k in d}
    reverted = json.dumps({**old_order, **{k: v for k, v in d.items() if k not in old_order}}, ensure_ascii=False, separators=(",", ":"))
    shared = _common_prefix(reverted, u_other)
    assert not _judge_prefix_dominates(shared, len(reverted)), "旧序被门判绿说明门瞎了"
    # 正向对照：正确实现两门全绿
    assert _judge_prefix_dominates(_common_prefix(u_good, u_other), len(u_good))


# ── 粘性路由键门 ──────────────────────────────────────────────────────────

def test_sticky_key_stable_within_project_and_separates_projects() -> None:
    keys = []
    for turn, sel, ts, q, p, v in [
        (1, "fx004", "t1", "标题样式", "把标题改成 64px", 1),
        (2, "fx005", "t2", "按钮配色", "把标题改成 72px", 2),
        (3, "fx006", "t3", "间距规范", "把标题改成 80px", 3),
    ]:
        system, user = build_prompt(_turn(sel=sel, ts=ts, query=q, prompt=p, variants=v))
        keys.append(prompt_cache_key(system, user))
    assert _judge_key_stable_across_turns(keys), "同项目连续三轮的路由键必须一致"

    other = copy.deepcopy(_turn(sel="fx004", ts="t1", query="标题样式", prompt="把标题改成 64px", variants=1))
    other["context"]["designIndex"]["pages"] = [{"id": "pg_other", "name": "另一个项目"}]
    s2, u2 = build_prompt(other)
    assert _judge_key_separates_projects(keys[0], prompt_cache_key(s2, u2)), "不同目录不能共用路由键"


def test_arm_sticky_key_constant_goes_red() -> None:
    """变异臂：键退化成常量 → 项目隔离判据必须红（正向锚防假绿）。"""
    assert not _judge_key_separates_projects("nexus-same", "nexus-same")
    assert _judge_key_separates_projects("nexus-a", "nexus-b")


def test_arm_sticky_key_includes_volatile_goes_red() -> None:
    """变异臂：把整段 user 塞进键 → 跨轮稳定性判据必须红。"""
    keys = []
    for sel, p in [("fx004", "把标题改成 64px"), ("fx005", "把标题改成 72px")]:
        _, user = build_prompt(_turn(sel=sel, ts="t", query="q", prompt=p, variants=1))
        keys.append(f"{KEY_PREFIX}{user}")  # 错的键：含易变正文
    assert not _judge_key_stable_across_turns(keys)


def test_sticky_body_pure_and_does_not_override_caller() -> None:
    body = _chat_body()
    out = sticky_body(body)
    assert out is not body and "prompt_cache_key" not in body, "纯函数不该改入参"
    assert _judge_sticky_body(out, expected=out["prompt_cache_key"])
    explicit = {**body, "prompt_cache_key": "caller-owned"}
    assert sticky_body(explicit)["prompt_cache_key"] == "caller-owned"
    # 非 chat 请求原样放行
    no_msgs = {"model": "m", "prompt": "x"}
    assert sticky_body(no_msgs) == no_msgs


# ── transport 门：流式与非流两条路都覆盖 ───────────────────────────────────

@pytest.mark.parametrize("stream", [True, False], ids=["sse", "plain"])
def test_transport_injects_on_both_paths(stream: bool) -> None:
    seen: dict[str, Any] = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(req.content)
        seen["content_length"] = req.headers.get("content-length")
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}], "usage": {}})

    transport = StickyPromptCacheTransport(httpx.MockTransport(handler))
    with httpx.Client(transport=transport, base_url="https://example.test/v1") as c:
        body = _chat_body(stream=stream)
        if stream:
            with c.stream("POST", "/chat/completions", json=body) as r:
                assert r.status_code == 200
        else:
            assert c.post("/chat/completions", json=body).status_code == 200

    assert _judge_sticky_body(seen["body"], expected=sticky_body(body)["prompt_cache_key"])
    # content-length 必须与改写后的 body 一致：否则真机按旧长度截断 JSON
    assert int(seen["content_length"]) == len(json.dumps(seen["body"], ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def test_transport_disabled_is_byte_identical() -> None:
    """opt-out 必须字节级零回归：出站 body 一个字段都不多。"""
    seen: dict[str, Any] = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(req.content)
        return httpx.Response(200, json={})

    with httpx.Client(transport=StickyPromptCacheTransport(httpx.MockTransport(handler), enabled=False)) as c:
        c.post("https://example.test/v1/chat/completions", json=_chat_body())
    assert "prompt_cache_key" not in seen["body"]


def test_transport_skips_non_chat_and_malformed_body() -> None:
    seen: list[dict[str, Any]] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req.content)
        return httpx.Response(200, json={})

    with httpx.Client(transport=StickyPromptCacheTransport(httpx.MockTransport(handler))) as c:
        c.post("https://example.test/v1/embeddings", json={"model": "m", "input": "x"})
        c.post("https://example.test/v1/chat/completions", content=b"not-json")
    assert b"prompt_cache_key" not in seen[0], "非 chat 端点不该被注入"
    assert seen[1] == b"not-json", "畸形 body 必须原样透传，不能被改写或吞掉"


def test_arm_transport_drops_injection_goes_red() -> None:
    """变异臂：transport 什么也不注入 → 判据必须红。"""
    body = _chat_body()
    assert not _judge_sticky_body(body, expected=sticky_body(body)["prompt_cache_key"])


# ── completion 键第四维门 ──────────────────────────────────────────────────

class _CountingProvider:
    name = "counting"

    def __init__(self) -> None:
        self.calls: list[bool | None] = []

    def complete(self, *, model: str, system: str, user: str, json_mode: bool | None = None) -> Completion:
        self.calls.append(json_mode)
        return Completion(text="{}" if json_mode is not False else "plain", provider=self.name,
                          model=model, tokens_in=1, tokens_out=1, latency_ms=1.0)


def test_json_mode_is_a_real_cache_dimension() -> None:
    """chat(json_mode=False) 与 run(None/True) 同 (model,system,user) 不能共用缓存。"""
    inner = _CountingProvider()
    cached = CachedLlm(inner, LlmCompletionCache(ttl_s=60))
    kw = {"model": "m", "system": "s", "user": "u"}
    cached.complete(**kw, json_mode=False)
    cached.complete(**kw, json_mode=False)       # 同形状：命中
    cached.complete(**kw, json_mode=True)
    cached.complete(**kw, json_mode=None)
    cached.complete(**{**kw, "user": "u2"})     # 换 user：新的真调用
    assert len(inner.calls) == 4, f"json_mode 漏进键会串台，实测真调用 {len(inner.calls)} 次"
    assert json_mode_key(None) != json_mode_key(True) != json_mode_key(False)
    assert _judge_dimension_isolation(inner.calls, expected=4)


def test_arm_json_mode_dropped_goes_red() -> None:
    """变异臂：键丢掉第四维 → 三种模式只调一次，判据必须红。"""
    class _Old(CachedLlm):
        def complete(self, *, model, system, user, json_mode=None):
            key = (model, system, user, "default")  # 旧实现：json_mode 恒 default
            hit = self._cache.get(key)
            if hit is not None:
                return hit
            out = self._inner.complete(model=model, system=system, user=user, json_mode=json_mode)
            self._cache.store(key, out)
            return out

    inner = _CountingProvider()
    cached = _Old(inner, LlmCompletionCache(ttl_s=60))
    kw = {"model": "m", "system": "s", "user": "u"}
    for mode in (False, False, True, None):
        cached.complete(**kw, json_mode=mode)
    assert len(inner.calls) == 1, "变异臂本身应该复现旧 bug"
    assert not _judge_dimension_isolation(inner.calls, expected=4), "旧实现被判绿说明第四维门瞎了"


def test_arm_correct_cache_is_green() -> None:
    """正向对照：正确实现不惩罚（ADR 0094 X4）——跑真组件，不是喂常数。"""
    inner = _CountingProvider()
    cached = CachedLlm(inner, LlmCompletionCache(ttl_s=60))
    kw = {"model": "m", "system": "s", "user": "u"}
    for mode in (False, False, True, None):
        cached.complete(**kw, json_mode=mode)
    cached.complete(**{**kw, "user": "u2"})
    assert _judge_dimension_isolation(inner.calls, expected=4)


# ── 真线路 opt-in 腿：函数级 skipif，探针不做断言 ────────────────────────────

def _live_ready() -> bool:
    if (os.environ.get("NEXUS_LIVE_LLM", "") or "").strip() != "1":
        return False
    from dotenv import load_dotenv

    load_dotenv(pathlib.Path(__file__).resolve().parents[1] / ".env", override=False)
    return bool((os.environ.get("NEXUS_OPENAI_API_KEY") or "").strip())


@pytest.mark.skipif(not _live_ready(), reason="NEXUS_LIVE_LLM!=1 或未配 key：真网关腿跳过")
def test_live_sticky_routing_probe() -> None:
    """走**生产 Registry 构造链**做 A/B：同一段稳定前缀连续 4 轮，量 cached/prompt。

    ADR 0125 §146/147：探针不做断言——distributor 通道 draw 会让任何阈值 flaky。
    数字只打印、落 ADR；离线门负责钉死"出站报文真带稳定键"这件确定的事。
    `NEXUS_LLM_COMPLETION_CACHE_URL` 在这里被强制清空，确保量的是 **provider 前缀缓存**
    而不是应用级 Redis 缓存（那层是 100% 确定性命中，会掩盖本片要测的东西）。
    """
    from ai_service.config import load_settings
    from ai_service.providers.registry import Registry

    base = load_settings()
    system = "你是设计编辑 Agent，只输出 JSON。"
    catalog = {
        "contextSource": "designIndex",
        "pages": [{"id": f"pg_{i}", "name": f"页面{i}"} for i in range(12)],
        "frames": [{"id": f"fr_{i}", "name": f"框{i}", "size": {"width": 1440, "height": 900}} for i in range(180)],
        "tokens": [], "totals": {"frames": 180}, "omissions": [], "catalogTrimmed": [], "code": None,
    }

    def user(turn: int) -> str:
        return json.dumps({**catalog, "intent": "design-edit", "prompt": f"第{turn}轮改标题", "variants": 1},
                          ensure_ascii=False, separators=(",", ":"))

    for sticky in (False, True):
        settings = load_settings()
        object.__setattr__(settings, "llm_sticky_cache_key", sticky)
        object.__setattr__(settings, "llm_cache_url", "")  # 隔离应用级缓存
        provider = Registry(settings).llm
        print(f"[live-sticky] transport={type(provider._client._transport).__name__} sticky={sticky}")
        try:
            for turn in range(4):
                c = provider.complete(model=base.llm_models.get("balanced", "gpt-6-sol"),
                                      system=system, user=user(turn), json_mode=False)
                ratio = round(c.cached_tokens / c.tokens_in, 3) if c.tokens_in else 0.0
                print(f"[live-sticky] sticky={sticky} turn={turn} cached={c.cached_tokens}/{c.tokens_in} "
                      f"ratio={ratio} latency={c.latency_ms}ms")
        finally:
            provider.close()
