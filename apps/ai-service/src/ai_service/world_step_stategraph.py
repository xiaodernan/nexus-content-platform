# §WS-1（2026-11-19）· 潮候步进 world-step：LLM 作为「状态流转」的分析层
#
# 为什么存在：之前的图（design-stategraph / chat_stategraph）验证了"图与线性管线等价"，
# 但每个 LLM 节点仍是黑盒一次调用——模型只负责"答一段话"，不负责"决定世界怎么变"。
# world-step 把大模型放到一步世界的**职责位置**上：
#
#   analyze  : 真 LLM · 读局（意图/风险/检索钩子）——不带 digest，前缀极小，首字极快
#   retrieve : 纯本地 · 锚句 BM25-lite（zh 锚句，sha1 指纹）——零 token、零缓存压力
#   narrate  : 真 LLM · 潮回叙事 + 结构化 delta——canon digest 稳定前缀（KV 友好）
#   canon_guard : 纯本地 · 逐字核验引用/回响号/数字夹紧——LLM 提议，本地裁决
#   assemble : 组装 ai-world-step-response.schema.json 契约——失败直返 END
#
# 两次真 provider 调用（analyze 便宜，narrate 被 digest KV 缓存摊销），中间一切
# 可本地判定的决策都留在本地。任何节点失败沿条件边直达 END，不晚霞成半成品。
from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any, TypedDict

import anyio

from .contract import issues as contract_issues
from .design_prompt import CANON_PREFIX, parse_reply
from .execution import LLM_MODEL_CLASSES, _cost_of
from .providers.base import ProviderFailed
from .stategraph import _error, _stage

_logger = logging.getLogger("ai_service.world_step_stategraph")

ANALYZE_SYSTEM_ZH = (
    "你是潮候院的读局人。只读这一步的局面，不评论世界、不续写故事。\n"
    "输出唯一一个 JSON 对象：\n"
    '{"intent":"action|question|temptation|memory","stakes":"low|mid|high","hooks":["最多5个关键词","原样取自旅人之话"]}\n'
    "意图取值：action=行动声明；question=提问；temptation=被引诱/动摇；memory=追问旧事。\n"
    "只输出这个对象，不要任何其他文字。"
)

NARRATE_RULES = """你是潮候院的潮声——站在典籍室门口的回答者。读完旅人的这一步，写下潮如何改写世界。
铁则：
1. 叙事 narrate 必须使用旅人指定的语言（zh=纯中文），不得夹杂另一语言；不超过 500 字。
2. delta.vigor / delta.depth 是整数 -3..+3：只有这一步确实改变旅人才动笔；风平浪静就填 0。delta.seals 最多 3 个新印记名（中文 ≤12 字）；没有就填 []。delta.unlocks 只能写 digest 里**真实存在**的回响编号（如 "E162"），且只有这一步真的翻到那一页时才写；没有就填 []。delta.risk 取 calm / uneasy / storm。
3. citations 只能引用输入里给出的锚句清单（anchor 指纹原样抄，quote 原样抄，≤120 字）；一条对不上原文的引用会被 canon_guard 整条剔除，宁缺毋滥。
4. 不编造潮之外的回响（不得引用输入锚句清单以外的内容），不预言未来，不为旅人替世界做最终决定——你只记下这一瞬潮如何动。
5. 输出唯一一个 JSON 对象：{"narration":"…","delta":{"vigor":0,"depth":0,"seals":[],"unlocks":[],"risk":"calm"},"citations":[{"anchor":"zh#xxxxxxxx","quote":"…"}]}，除此之外不要任何文字。"""

_UNLOCK_RE = re.compile(r"^E[12][0-9]{2}$")
_ZH_ANCHOR_PREFIX = "**锚句**："
# narrate 车道的稳定前缀指纹（chat 车道的 build_prefix 同一做法）：供 cache telemetry 对账
_NARRATE_PREFIX_DIGEST = hashlib.sha256(CANON_PREFIX.encode("utf-8")).hexdigest()[:16]
_ANALYZE_PREFIX_DIGEST = hashlib.sha256(ANALYZE_SYSTEM_ZH.encode("utf-8")).hexdigest()[:16]


class WorldStepState(TypedDict, total=False):
    payload: dict[str, Any]
    registry: Any
    status: int
    body: dict[str, Any]
    stages: list[dict[str, Any]]
    model: str
    analysis: dict[str, Any]
    anchors: list[dict[str, str]]
    completion: Any           # narrate 的回执（计量主账）
    analyze_completion: Any   # analyze 的回执（合计进 usage）
    reply: dict[str, Any]
    narration: str
    delta: dict[str, Any]
    citations: list[dict[str, str]]


def _clamp_int(value: Any, lo: int, hi: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return 0
    return max(lo, min(hi, n))


def _zh_anchors() -> list[str]:
    return [
        line[len(_ZH_ANCHOR_PREFIX):].strip()
        for line in CANON_PREFIX.splitlines()
        if line.startswith(_ZH_ANCHOR_PREFIX)
    ]


def _bigrams(text: str) -> set[str]:
    cleaned = re.sub(r"[\s，。！？；：、,.!?;:'\"“”‘’《》【】()（）]+", "", text)
    if len(cleaned) < 2:
        return {cleaned} if cleaned else set()
    return {cleaned[i : i + 2] for i in range(len(cleaned) - 1)}


def _fingerprint(anchor: str) -> str:
    return "zh#" + hashlib.sha1(anchor.encode("utf-8")).hexdigest()[:8]


def _retrieve(query: str, *, top_k: int = 4) -> list[dict[str, str]]:
    """BM25-lite：以大字符集合模型对 zh 锚句打分（二元组重叠 / 锚句长度开方）。"""
    query_ng = _bigrams(query)
    if not query_ng:
        return []
    scored: list[tuple[float, str, str]] = []
    for anchor in _zh_anchors():
        anchor_ng = _bigrams(anchor)
        if not anchor_ng:
            continue
        score = len(query_ng & anchor_ng) / (len(anchor_ng) ** 0.5)
        if score > 0:
            scored.append((score, anchor, _fingerprint(anchor)))
    scored.sort(key=lambda item: item[0], reverse=True)
    out: list[dict[str, str]] = []
    for _score, anchor, fp in scored[:top_k]:
        out.append({"anchor": fp, "quote": anchor[:120]})
    return out


_RISKS = {"calm", "uneasy", "storm"}
_ECHO_EXISTS = re.compile(r"^### Echo (\d+) · ", re.M)


def _existing_echo_numbers() -> set[int]:
    return {int(m.group(1)) for m in _ECHO_EXISTS.finditer(CANON_PREFIX)}


# ── 节点 ────────────────────────────────────────────────────────────────────────

async def validate(state: WorldStepState) -> dict[str, Any]:
    payload = state["payload"]
    issues = contract_issues("ai-world-step-request.schema.json", payload)
    if issues:
        return {
            "status": 400,
            "body": _error("validation-failed", "AiWorldStepRequest 不符合契约", "·".join(issues[:5])),
            "stages": _stage(state, "validate", "fail", issues[0][:160]),
        }
    return {"stages": _stage(state, "validate", "ok")}


async def check_provider(state: WorldStepState) -> dict[str, Any]:
    registry = state["registry"]
    if not registry.llm:
        return {
            "status": 503,
            "body": _error("provider-unavailable", "没有可用的文本 provider", "设置 NEXUS_OPENAI_API_KEY 之后即可"),
            "stages": _stage(state, "check_provider", "fail", "no llm on registry"),
        }
    model_class = str(state["payload"].get("modelClass") or "balanced")
    if model_class not in LLM_MODEL_CLASSES:
        return {
            "status": 503,
            "body": _error("provider-unavailable", f"{model_class} 这一档没有对应的模型配置", "对话只走文本档（fast / balanced / reasoning / vision）"),
            "stages": _stage(state, "check_provider", "fail", f"modelClass={model_class}"),
        }
    try:
        model = registry.llm.model_for(model_class)
    except ProviderFailed as exc:
        return {"status": 503, "body": _error("provider-unavailable", str(exc)), "stages": _stage(state, "check_provider", "fail", str(exc)[:160])}
    return {"model": model, "stages": _stage(state, "check_provider", "ok", model)}


async def analyze(state: WorldStepState) -> dict[str, Any]:
    registry = state["registry"]
    payload = state["payload"]
    move = str(payload.get("move") or "")
    traveler = (payload.get("state") or {}).get("traveler") or {}
    memory = (payload.get("state") or {}).get("memory") or []
    try:
        user = json.dumps(
            {
                "locale": payload.get("locale") or "zh",
                "move": move,
                "traveler": {
                    "vigor": traveler.get("vigor"),
                    "depth": traveler.get("depth"),
                    "seals": (traveler.get("seals") or [])[-6:],
                },
                "recent_memory": [
                    {"kind": (m.get("kind") if isinstance(m, dict) else None), "text": (m.get("text") if isinstance(m, dict) else "")[:120]}
                    for m in memory[-3:]
                    if isinstance(m, dict)
                ],
            },
            ensure_ascii=False,
        )
        completion = await anyio.to_thread.run_sync(
            lambda: registry.llm.complete(
                model=state["model"],
                system=ANALYZE_SYSTEM_ZH,
                user=user,
                json_mode=True,
            )
        )
    except ProviderFailed as exc:
        return {"status": 502, "body": _error("provider-failed", str(exc), retryable=True), "stages": _stage(state, "analyze", "fail", str(exc)[:200])}
    try:
        analysis = parse_reply(completion.text)
    except ValueError as exc:
        return {"status": 502, "body": _error("provider-failed", f"读局输出不是 JSON：{exc}", retryable=True), "stages": _stage(state, "analyze", "fail", str(exc)[:160])}
    if not isinstance(analysis, dict):
        return {"status": 502, "body": _error("provider-failed", "读局输出不是 JSON 对象", retryable=True), "stages": _stage(state, "analyze", "fail", "non-dict reply")}
    intent = str(analysis.get("intent") or "action")
    stakes = str(analysis.get("stakes") or "mid")
    hooks = [str(h) for h in (analysis.get("hooks") or []) if isinstance(h, (str, int, float))][:5]
    return {
        "analyze_completion": completion,
        "analysis": {"intent": intent, "stakes": stakes, "hooks": hooks},
        "stages": _stage(state, "analyze", "ok", f"intent={intent} stakes={stakes} hooks={len(hooks)}"),
    }


async def retrieve(state: WorldStepState) -> dict[str, Any]:
    payload = state["payload"]
    move = str(payload.get("move") or "")
    hooks = (state.get("analysis") or {}).get("hooks") or []
    query = " ".join([move, *[str(h) for h in hooks]])
    anchors = _retrieve(query, top_k=4)
    return {"anchors": anchors, "stages": _stage(state, "retrieve", "ok", f"top={len(anchors)} anchors")}


async def narrate(state: WorldStepState) -> dict[str, Any]:
    registry = state["registry"]
    payload = state["payload"]
    system = CANON_PREFIX + "\n" + NARRATE_RULES
    user = json.dumps(
        {
            "locale": payload.get("locale") or "zh",
            "clock": (payload.get("state") or {}).get("clock"),
            "traveler": (payload.get("state") or {}).get("traveler"),
            "memory": (payload.get("state") or {}).get("memory"),
            "analysis": state.get("analysis"),
            "anchors": state.get("anchors"),
            "move": payload.get("move"),
        },
        ensure_ascii=False,
    )
    try:
        completion = await anyio.to_thread.run_sync(
            lambda: registry.llm.complete(
                model=state["model"],
                system=system,
                user=user,
                json_mode=True,
            )
        )
    except ProviderFailed as exc:
        return {"status": 502, "body": _error("provider-failed", str(exc), retryable=True), "stages": _stage(state, "narrate", "fail", str(exc)[:200])}
    try:
        reply = parse_reply(completion.text)
    except ValueError as exc:
        return {"status": 502, "body": _error("provider-failed", f"潮回输出不是 JSON：{exc}", retryable=True), "stages": _stage(state, "narrate", "fail", str(exc)[:160])}
    if not isinstance(reply, dict):
        return {"status": 502, "body": _error("provider-failed", "潮回输出不是 JSON 对象", retryable=True), "stages": _stage(state, "narrate", "fail", "non-dict reply")}
    return {"completion": completion, "reply": reply, "stages": _stage(state, "narrate", "ok", f"{completion.tokens_in} -> {completion.tokens_out} tok")}


async def canon_guard(state: WorldStepState) -> dict[str, Any]:
    reply = state.get("reply") if isinstance(state.get("reply"), dict) else {}
    narration = str(reply.get("narration") or "").strip()[:1200]
    if not narration:
        return {"status": 502, "body": _error("provider-failed", "潮回为空", retryable=True), "stages": _stage(state, "canon_guard", "fail", "empty narration")}

    delta_in = reply.get("delta") if isinstance(reply.get("delta"), dict) else {}
    seals = []
    for s in (delta_in.get("seals") or []):
        if not isinstance(s, str):
            continue
        s = s.strip()[:12]
        if s and s not in seals and "\n" not in s:
            seals.append(s)
        if len(seals) >= 3:
            break
    existing = _existing_echo_numbers()
    unlocks = []
    for u in (delta_in.get("unlocks") or []):
        if not isinstance(u, str):
            continue
        u = u.strip().upper()
        if _UNLOCK_RE.match(u) and int(u[1:]) in existing and u not in unlocks:
            unlocks.append(u)
        if len(unlocks) >= 2:
            break
    risk = str(delta_in.get("risk") or "uneasy").strip().lower()
    if risk not in _RISKS:
        risk = "uneasy"
    delta = {
        "vigor": _clamp_int(delta_in.get("vigor"), -3, 3),
        "depth": _clamp_int(delta_in.get("depth"), -3, 3),
        "seals": seals,
        "unlocks": unlocks,
        "risk": risk,
    }

    digest_no_ws = re.sub(r"\s+", "", CANON_PREFIX)

    def _quote_ok(q: str) -> bool:
        return bool(q.strip()) and re.sub(r"\s+", "", q) in digest_no_ws

    citations: list[dict[str, str]] = []
    suggested = state.get("anchors") or []
    allowed_quotes = {a["quote"] for a in suggested}
    for c in (reply.get("citations") or []):
        if not isinstance(c, dict):
            continue
        anchor = str(c.get("anchor") or "").strip()[:24]
        quote = str(c.get("quote") or "").strip()[:120]
        if not anchor.startswith("zh#"):
            continue
        if quote not in allowed_quotes and not _quote_ok(quote):
            continue
        if not _quote_ok(quote):
            continue
        entry = {"anchor": anchor, "quote": quote}
        if entry not in citations:
            citations.append(entry)
        if len(citations) >= 4:
            break

    dropped = len([c for c in (reply.get("citations") or []) if isinstance(c, dict)]) - len(citations)
    return {
        "narration": narration,
        "delta": delta,
        "citations": citations,
        "stages": _stage(state, "canon_guard", "ok", f"citations={len(citations)} dropped={max(dropped, 0)} unlocks={len(unlocks)}"),
    }


def _combined_usage(state: WorldStepState) -> tuple[int, int, int, bool, float]:
    """合计两次 provider 回执的 prompt/cached/completion token 与延迟（如实加总，不抹零）。"""
    tok_in = tok_out = cached = 0
    cached_reported = False
    latency_ms = 0.0
    for key in ("completion", "analyze_completion"):
        c = state.get(key)
        if c is None:
            continue
        tok_in += int(getattr(c, "tokens_in", 0) or 0)
        tok_out += int(getattr(c, "tokens_out", 0) or 0)
        cached += int(getattr(c, "cached_tokens", 0) or 0)
        cached_reported = cached_reported or bool(getattr(c, "cache_reported", False))
        latency_ms += float(getattr(c, "latency_ms", 0) or 0)
    return tok_in, tok_out, cached, cached_reported, latency_ms


async def assemble(state: WorldStepState) -> dict[str, Any]:
    payload = state["payload"]
    registry = state["registry"]
    completion = state.get("completion")
    model_class = str(payload.get("modelClass") or "balanced")
    tok_in, tok_out, cached, cached_reported, latency_ms = _combined_usage(state)
    cost_usd, cost_basis = (0.0, "unknown")
    if completion is not None:
        cost_usd, cost_basis = _cost_of(registry, completion)

    # 与 design/chat 图同一套三本账（prefix / upstream / provider，分账不合并）
    try:
        telemetry = registry.cache_telemetry()
        if state.get("analyze_completion") is not None:
            telemetry.provider.record(state["analyze_completion"])
            telemetry.prefix.observe(_ANALYZE_PREFIX_DIGEST)
            telemetry.upstream.observe(_ANALYZE_PREFIX_DIGEST, int(getattr(state["analyze_completion"], "tokens_in", 0) or 0))
        if completion is not None:
            telemetry.provider.record(completion)
            telemetry.prefix.observe(_NARRATE_PREFIX_DIGEST)
            telemetry.upstream.observe(_NARRATE_PREFIX_DIGEST, int(getattr(completion, "tokens_in", 0) or 0))
    except Exception:  # telemetry 绝不能把一次成功的世界步进搞成 500（它只是账房，不是阀门）
        _logger.warning("cache telemetry 记录失败（不影响响应）", exc_info=True)
    response: dict[str, Any] = {
        "requestId": str(payload.get("requestId") or ""),
        "capability": "real",
        "provider": str(getattr(completion, "provider", "unknown")),
        "model": str(getattr(completion, "model", "unknown")),
        "narration": state.get("narration") or "",
        "delta": state.get("delta") or {"vigor": 0, "depth": 0, "seals": [], "unlocks": [], "risk": "calm"},
        "citations": state.get("citations") or [],
        "usage": {
            "provider": str(getattr(completion, "provider", "unknown")),
            "model": str(getattr(completion, "model", "unknown")),
            "modelClass": model_class,
            "tokensIn": tok_in,
            "tokensOut": tok_out,
            "cachedTokens": cached,
            "cacheReported": bool(cached_reported),
            "latencyMs": latency_ms,
            "costUsd": cost_usd,
            "costBasis": cost_basis,
            "toolCalls": 2,
            "demoMode": False,
            "reasoningTokens": int(getattr(completion, "reasoning_tokens", 0) or 0),
        },
    }
    response_issues = contract_issues("ai-world-step-response.schema.json", response)
    if response_issues:
        return {
            "status": 500,
            "body": _error("internal", "ai-service 组装的潮候步进响应不符合契约", "·".join(response_issues[:5])),
            "stages": _stage(state, "assemble", "fail", response_issues[0][:160]),
        }
    return {
        "status": 200,
        "body": response,
        "stages": _stage(state, "assemble", "ok", "ai-world-step-response schema ok"),
    }


# ── 边与编译 ────────────────────────────────────────────────────────────────────

def _needs_review(state: WorldStepState) -> str:
    return "end" if int(state.get("status", 0) or 0) >= 400 else "ok"


def build_world_step_graph():
    from langgraph.graph import END, StateGraph

    graph = StateGraph(WorldStepState)
    graph.add_node("validate", validate)
    graph.add_node("check_provider", check_provider)
    graph.add_node("analyze", analyze)
    graph.add_node("retrieve", retrieve)
    graph.add_node("narrate", narrate)
    graph.add_node("canon_guard", canon_guard)
    graph.add_node("assemble", assemble)

    graph.set_entry_point("validate")
    graph.add_conditional_edges("validate", _needs_review, {"ok": "check_provider", "end": END})
    graph.add_conditional_edges("check_provider", _needs_review, {"ok": "analyze", "end": END})
    graph.add_conditional_edges("analyze", _needs_review, {"ok": "retrieve", "end": END})
    graph.add_edge("retrieve", "narrate")
    graph.add_conditional_edges("narrate", _needs_review, {"ok": "canon_guard", "end": END})
    graph.add_conditional_edges("canon_guard", _needs_review, {"ok": "assemble", "end": END})
    graph.add_edge("assemble", END)
    return graph.compile()


_WORLD_STEP_GRAPH = None


def world_step_graph():
    global _WORLD_STEP_GRAPH
    if _WORLD_STEP_GRAPH is None:
        _WORLD_STEP_GRAPH = build_world_step_graph()
    return _WORLD_STEP_GRAPH


async def run_world_step_stategraph(
    payload: dict[str, Any], *, registry: Any
) -> tuple[int, dict[str, Any]]:
    initial: WorldStepState = {"payload": payload, "registry": registry, "stages": []}
    final = await world_step_graph().ainvoke(initial)
    status = int(final.get("status", 500))
    stages = final.get("stages") or []
    _logger.info(
        "world-step stages: %s",
        " -> ".join(event.get("stage", "?") for event in stages),
    )
    body = final.get("body") or _error("internal", "状态图未产出响应体")
    return status, body
