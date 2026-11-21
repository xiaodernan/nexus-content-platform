# §LangGraph (2026-11-19) · 对话通道的 StateGraph 编排（cont.254）
#
# 为什么存在：`execute_ai_chat`（execution.py 里的顺序管线）服务所有"角色对话"流量——潮汐预言、
# 人物对话、潮语问答。cont.222 把设计通道默认翻到 stategraph 之后，对话通道仍是线性
# 直连：同一批节点（validate → check_provider → build_prefix → call_llm → cache_read →
# parse_and_release → assemble）在对话语义下的状态图镜像。图与线性管线的**输出必须一致**
# （同一 AiChatRequest / AiChatResponse 契约、同一失败码）；下面的测试逐一对照。
#
# 差异（与 design 图相比，语义上都是"对话不需要"）：
#   - 没有 patches / plans / approval-policy（§47 对话只落记忆行，不改设计文档）；
#   - json_mode=False（对话不是 JSON 任务；provider 对 json_object 模式会 400）；
#   - build_prefix 的 digest 直接哈希 system：同一角色的 system 是逐字节稳定的
#     前缀（潮汐预言 = TIDE_ORACLE_SYSTEM_PROMPT + canon digest）——这是对话通道唯一
#     可自证的前缀摘要，provider 侧前缀缓存必然命中同一 lane；
#   - parse_and_release 只做空回复检测（剥首尾空白、封顶 4000 字），没有 JSON 解析。
from __future__ import annotations

import hashlib
import logging
from typing import Any, TypedDict

import anyio

from .contract import issues as contract_issues
from .execution import LLM_MODEL_CLASSES, _cost_of
from .design_prompt import CANON_PREFIX
from .providers.base import ProviderFailed
from .stategraph import _stage, _error

_logger = logging.getLogger("ai_service.chat_stategraph")


class ChatGraphState(TypedDict, total=False):
    payload: dict[str, Any]
    registry: Any  # apps/ai-service Registry（含 llm / cache_telemetry / price_table）
    status: int
    body: dict[str, Any]
    stages: list[dict[str, Any]]
    model: str
    stable_digest: str
    completion: Any
    text: str


# ── 节点 ─────────────────────────────────────────────────────────────────────────

async def validate(state: ChatGraphState) -> dict[str, Any]:
    payload = state["payload"]
    issues = contract_issues("ai-chat-request.schema.json", payload)
    if issues:
        return {
            "status": 400,
            "body": _error("validation-failed", "AiChatRequest 不符合契约", "·".join(issues[:5])),
            "stages": _stage(state, "validate", "fail", issues[0][:160]),
        }
    return {"stages": _stage(state, "validate", "ok")}


async def check_provider(state: ChatGraphState) -> dict[str, Any]:
    registry = state["registry"]
    if not registry.llm:
        return {
            "status": 503,
            "body": _error(
                "provider-unavailable",
                "没有可用的文本 provider",
                "设置 NEXUS_OPENAI_API_KEY 之后即可",
            ),
            "stages": _stage(state, "check_provider", "fail", "no llm on registry"),
        }
    model_class = str(state["payload"].get("modelClass") or "balanced")
    if model_class not in LLM_MODEL_CLASSES:
        return {
            "status": 503,
            "body": _error(
                "provider-unavailable",
                f"{model_class} 这一档没有对应的模型配置",
                "对话只走文本档（fast / balanced / reasoning / vision）",
            ),
            "stages": _stage(state, "check_provider", "fail", f"modelClass={model_class}"),
        }
    try:
        model = registry.llm.model_for(model_class)
    except ProviderFailed as exc:
        return {
            "status": 503,
            "body": _error("provider-unavailable", str(exc)),
            "stages": _stage(state, "check_provider", "fail", str(exc)[:160]),
        }
    return {"model": model, "stages": _stage(state, "check_provider", "ok", model)}


async def build_prefix(state: ChatGraphState) -> dict[str, Any]:
    registry = state["registry"]
    system = str(state["payload"].get("system") or "")
    # §LLMCTX-1：与线性管线同一条口径——digest 必须是第一个字节，persona 跟在后面。
    # 反过来的话每个角色的第一问都要重新买一次 15.8 万 token 的前缀。
    if bool(state["payload"].get("withCanonPrefix")):
        system = f"{CANON_PREFIX}\n{system}"
    digest = hashlib.sha256(system.encode("utf-8")).hexdigest()[:16]
    registry.cache_telemetry().prefix.observe(digest)
    return {
        "stable_digest": digest,
        "stages": _stage(state, "build_prefix", "ok", f"sha16={digest}"),
    }


async def call_llm(state: ChatGraphState) -> dict[str, Any]:
    registry = state["registry"]
    payload = state["payload"]
    system = str(payload.get("system") or "")
    if bool(payload.get("withCanonPrefix")):
        system = f"{CANON_PREFIX}\n{system}"
    user = str(payload.get("user") or "")
    try:
        # 对话不是 JSON 任务：response_format=json_object 会被 provider 400 掉
        # （协议要求内容里出现 'json' 字面），所以显式关掉 json_mode（与线性管线一致）
        completion = await anyio.to_thread.run_sync(
            lambda: registry.llm.complete(
                model=state["model"], system=system, user=user, json_mode=False
            )
        )
    except ProviderFailed as exc:
        return {
            "status": 502,
            "body": _error("provider-failed", str(exc), retryable=True),
            "stages": _stage(state, "call_llm", "fail", str(exc)[:200]),
        }
    return {
        "completion": completion,
        "stages": _stage(
            state, "call_llm", "ok", f"{completion.tokens_in} -> {completion.tokens_out} tok"
        ),
    }


async def cache_read(state: ChatGraphState) -> dict[str, Any]:
    registry = state["registry"]
    completion = state["completion"]
    registry.cache_telemetry().provider.record(completion)
    registry.cache_telemetry().upstream.observe(state["stable_digest"], completion.tokens_in)
    return {
        "stages": _stage(
            state,
            "cache_read",
            "ok",
            "reported" if completion.cache_reported else "cache-not-reported",
        )
    }


async def parse_and_release(state: ChatGraphState) -> dict[str, Any]:
    completion = state["completion"]
    text = (completion.text or "").strip()[:4000]
    if not text:
        return {
            "status": 502,
            "body": _error("provider-failed", "provider 返回了空回复", retryable=True),
            "stages": _stage(state, "parse_and_release", "fail", "empty reply"),
        }
    return {"text": text, "stages": _stage(state, "parse_and_release", "ok", f"{len(text)} chars")}


async def assemble(state: ChatGraphState) -> dict[str, Any]:
    payload = state["payload"]
    completion = state["completion"]
    model_class = str(payload.get("modelClass") or "balanced")
    cost_usd, cost_basis = _cost_of(state["registry"], completion)

    response: dict[str, Any] = {
        "requestId": str(payload.get("requestId") or ""),
        "capability": "real",
        "provider": completion.provider,
        "model": completion.model,
        "text": state["text"],
        "usage": {
            "provider": completion.provider,
            "model": completion.model,
            "modelClass": model_class,
            "tokensIn": completion.tokens_in,
            "tokensOut": completion.tokens_out,
            "cachedTokens": completion.cached_tokens,
            "cacheReported": completion.cache_reported,
            "latencyMs": completion.latency_ms,
            "costUsd": cost_usd,
            "costBasis": cost_basis,
            "toolCalls": 1,
            "demoMode": False,
            "reasoningTokens": getattr(completion, "reasoning_tokens", 0),
        },
        # §LLMCTX-1：与线性管线同一字段同一口径——带了才报，没带就不出现。
        **(
            {"canonPrefixChars": len(CANON_PREFIX)}
            if bool(payload.get("withCanonPrefix"))
            else {}
        ),
    }
    # 正直标注：这条链是状态图（langgraph.StateGraph）编排的，与 /v1/ai/chat 同一输入同一输出；
    # ai-chat-response.schema.json additionalProperties=false，编排标记只走响应头（见 app.py）。
    response_issues = contract_issues("ai-chat-response.schema.json", response)
    if response_issues:
        return {
            "status": 500,
            "body": _error(
                "internal",
                "ai-service 组装的对话响应不符合契约",
                "·".join(response_issues[:5]),
            ),
            "stages": _stage(state, "assemble", "fail", response_issues[0][:160]),
        }
    return {
        "status": 200,
        "body": response,
        "stages": _stage(state, "assemble", "ok", "ai-chat-response schema ok"),
    }


# ── 边与编译 ────────────────────────────────────────────────────────────────────

def _needs_review(state: ChatGraphState) -> str:
    return "end" if int(state.get("status", 0) or 0) >= 400 else "ok"


def build_chat_graph():
    # 懒加载 langgraph（慢盘上 import 一次 ~38s）——只在第一次构图时付一次
    from langgraph.graph import END, StateGraph

    graph = StateGraph(ChatGraphState)
    graph.add_node("validate", validate)
    graph.add_node("check_provider", check_provider)
    graph.add_node("build_prefix", build_prefix)
    graph.add_node("call_llm", call_llm)
    graph.add_node("cache_read", cache_read)
    graph.add_node("parse_and_release", parse_and_release)
    graph.add_node("assemble", assemble)

    graph.set_entry_point("validate")
    graph.add_conditional_edges("validate", _needs_review, {"ok": "check_provider", "end": END})
    graph.add_conditional_edges("check_provider", _needs_review, {"ok": "build_prefix", "end": END})
    graph.add_edge("build_prefix", "call_llm")
    graph.add_conditional_edges("call_llm", _needs_review, {"ok": "cache_read", "end": END})
    graph.add_edge("cache_read", "parse_and_release")
    graph.add_conditional_edges("parse_and_release", _needs_review, {"ok": "assemble", "end": END})
    graph.add_edge("assemble", END)
    return graph.compile()


_CHAT_GRAPH = None


def chat_graph():
    global _CHAT_GRAPH
    if _CHAT_GRAPH is None:
        _CHAT_GRAPH = build_chat_graph()
    return _CHAT_GRAPH


async def run_chat_stategraph(
    payload: dict[str, Any], *, registry: Any
) -> tuple[int, dict[str, Any]]:
    """状态图版的 execute_chat_request 入口。返回 (status, body)，与 /v1/ai/chat 同一形状。"""
    initial: ChatGraphState = {"payload": payload, "registry": registry, "stages": []}
    final = await chat_graph().ainvoke(initial)
    status = int(final.get("status", 500))
    stages = final.get("stages") or []
    _logger.info(
        "chat-stategraph stages: %s",
        " -> ".join(event.get("stage", "?") for event in stages),
    )
    body = final.get("body") or _error("internal", "状态图未产出响应体")
    return status, body
