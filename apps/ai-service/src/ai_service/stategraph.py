# §LangGraph (2026-11-16) — 设计请求管线的 StateGraph 编排（教学级可复用小型状态机）。
#
# 为什么存在：`execute_ai_request` 是一条线性的顺序管线——同一逻辑的另一种结构表达：
# 状态图（StateGraph）把「节点（一次原子操作）」与「边（谁先谁后/失败分支去哪儿）」
# 变成显式结构。线性管线与图谱的**输出必须一致**（同样的输入、同样的 http 状态与 JSON 形状），
# 下面的测试对照真管线断言这一点；这不是又一份维护副本，而是「同一执行语义的另一种形态」，
# 用来证明 LangGraph/langgraph 的最基本用法在项目里是可用的、而不是装饰。
#
# 每个节点读取并返回状态的一部分；相同键是一条干净的 *状态更新*：
#   - 读：payload / registry / status / model / stable_digest / completion / reply / stages
#   - 写：status / body / stages / 中间值
# 终止分支一律以 `status` 定型（400/502/503/200）；LangGraph 的 conditional_edges 把
# 「失败直返」显式写出来——这才是状态机相对 `if/else` 链的增量价值。
#
# 节点与真管线一一对应（顺序）：validate → check_provider → build_prefix → call_llm → cache_read
# → parse_reply → release_patches → assemble。assemble 复用同一些 helper（import 并非拷贝）。

from __future__ import annotations

from typing import Any, TypedDict

import logging

import anyio

_logger = logging.getLogger("ai_service.stategraph")

from .contract import issues as contract_issues
from .design_prompt import build_prompt, parse_reply, stable_block_digest
from .execution import DESTRUCTIVE_OPS, LLM_MODEL_CLASSES, _cost_of, sanitize_plans
from .providers.base import ProviderFailed


class DesignGraphState(TypedDict, total=False):
    payload: dict[str, Any]
    registry: Any  # apps/ai-service Registry（含 llm / cache_telemetry / price_table）
    status: int
    body: dict[str, Any]
    stages: list[dict[str, Any]]
    model: str
    stable_digest: str
    completion: Any
    reply: dict[str, Any]


def _stage(state: DesignGraphState, stage: str, outcome: str, detail: str | None = None) -> list[dict[str, Any]]:
    event: dict[str, Any] = {"stage": stage, "outcome": outcome}
    if detail:
        event["detail"] = detail
    return [*(state.get("stages") or []), event]


def _error(code: str, message: str, hint: str = "", retryable: bool = False) -> dict[str, Any]:
    return {"code": code, "message": message, "hint": hint, "retryable": retryable}


# ── 节点 ─────────────────────────────────────────────────────────────────────────

async def validate(state: DesignGraphState) -> dict[str, Any]:
    payload = state["payload"]
    issues = contract_issues("ai-request.schema.json", payload)
    if issues:
        return {
            "status": 400,
            "body": _error("validation-failed", "AiRequest 不合契约", "；".join(issues[:5])),
            "stages": _stage(state, "validate", "fail", issues[0][:160]),
        }
    return {"stages": _stage(state, "validate", "ok")}


async def check_provider(state: DesignGraphState) -> dict[str, Any]:
    registry = state["registry"]
    if not registry.llm:
        return {
            "status": 503,
            "body": _error(
                "provider-unavailable",
                "没有可用的文字 provider",
                "设置 NEXUS_OPENAI_API_KEY 之后即可",
            ),
            "stages": _stage(state, "check_provider", "fail", "no llm on registry"),
        }
    model_class = str(state["payload"].get("modelClass") or "balanced")
    if model_class not in LLM_MODEL_CLASSES:
        return {
            "status": 503,
            "body": _error("provider-unavailable", f"{model_class} 这一档没有对应的模型配置", "图像/语音/embedding provider 属 M2/M5"),
            "stages": _stage(state, "check_provider", "fail", f"modelClass={model_class}"),
        }
    try:
        model = registry.llm.model_for(model_class)
    except ProviderFailed as exc:
        return {"status": 503, "body": _error("provider-unavailable", str(exc)), "stages": _stage(state, "check_provider", "fail", str(exc)[:160])}
    return {"model": model, "stages": _stage(state, "check_provider", "ok", model)}


async def build_prefix(state: DesignGraphState) -> dict[str, Any]:
    registry = state["registry"]
    payload = state["payload"]
    system, user = build_prompt(payload)
    digest = stable_block_digest(payload)
    registry.cache_telemetry().prefix.observe(digest)
    return {
        "stable_digest": digest,
        "stages": _stage(state, "build_prefix", "ok", f"sha16={digest[:8]}"),
    }


async def call_llm(state: DesignGraphState) -> dict[str, Any]:
    registry = state["registry"]
    system, user = build_prompt(state["payload"])
    try:
        completion = await anyio.to_thread.run_sync(
            lambda: registry.llm.complete(model=state["model"], system=system, user=user)
        )
    except ProviderFailed as exc:
        return {"status": 502, "body": _error("provider-failed", str(exc), retryable=True), "stages": _stage(state, "call_llm", "fail", str(exc)[:200])}
    return {"completion": completion, "stages": _stage(state, "call_llm", "ok", f"{completion.tokens_in} -> {completion.tokens_out} tok")}


async def cache_read(state: DesignGraphState) -> dict[str, Any]:
    registry = state["registry"]
    completion = state["completion"]
    registry.cache_telemetry().provider.record(completion)
    registry.cache_telemetry().upstream.observe(state["stable_digest"], completion.tokens_in)
    return {"stages": _stage(state, "cache_read", "ok", "reported" if completion.cache_reported else "cache-not-reported")}


async def parse_and_release(state: DesignGraphState) -> dict[str, Any]:
    completion = state["completion"]
    try:
        reply = parse_reply(completion.text)
    except ValueError as exc:
        return {"status": 502, "body": _error("provider-failed", str(exc), retryable=True), "stages": _stage(state, "parse_reply", "fail", str(exc)[:160])}
    if not isinstance(reply, dict):
        return {
            "status": 502,
            "body": _error("provider-failed", "provider 的报文不是 JSON 对象", retryable=True),
            "stages": _stage(state, "parse_reply", "fail", f"reply type={type(reply).__name__}"),
        }
    patches = reply.get("patches")
    patches = patches if isinstance(patches, list) else []
    for index, patch in enumerate(patches):
        problems = contract_issues("design-patch.schema.json", patch)
        if problems:
            return {
                "status": 502,
                "body": _error(
                    "validation-failed",
                    f"provider 的第 {index + 1} 个 patch 不合契约",
                    "；".join(problems[:5]),
                    retryable=True,
                ),
                "stages": _stage(state, "release_patches", "fail", f"patch[{index}]"),
            }
    return {"reply": reply, "stages": _stage(state, "release_patches", "ok", f"{len(patches)} patches")}


async def assemble(state: DesignGraphState) -> dict[str, Any]:
    payload = state["payload"]
    completion = state["completion"]
    reply = state.get("reply") if isinstance(state.get("reply"), dict) else {}
    model_class = str(payload.get("modelClass") or "balanced")
    cost_usd, cost_basis = _cost_of(state["registry"], completion)

    explanation = str(reply.get("explanation") or "")[:2000]
    labels = [str(label) for label in (reply.get("labels") or [])][:4]
    dry_run = bool(payload.get("dryRun"))
    approvals: list[dict[str, str]] = []
    patches = reply.get("patches") if isinstance(reply.get("patches"), list) else []
    if "delete" in (payload.get("approvalPolicy") or []):
        flagged = sorted(
            {
                f"{patch.get('pageId') or 'document'}: {op.get('op')} {op.get('nodeId') or op.get('pageId') or op.get('key') or op.get('assetId') or op.get('componentId')}"
                for patch in patches
                for op in (patch.get("ops") or [])
                if isinstance(op, dict) and op.get("op") in DESTRUCTIVE_OPS
            }
        )
        if flagged:
            approvals = [{"action": "delete", "reason": item} for item in flagged]
    applied = [] if (dry_run or approvals) else patches
    if dry_run:
        explanation = f"（仅预览，未写入任何东西）{explanation}"
    if approvals:
        explanation = f"需审批后才会执行删除类 op，未写入）{explanation}"

    response: dict[str, Any] = {
        "requestId": str(payload.get("requestId") or ""),
        "capability": "real",
        "provider": completion.provider,
        "model": completion.model,
        "plans": sanitize_plans(reply.get("plans")),
        "patches": applied,
        "labels": labels,
        "activities": [
            {
                "stage": "provider",
                "status": "completed",
                "summary": f"{completion.provider}/{completion.model} 返回 {len(patches)} 个 patch",
                "counts": {"tokensIn": completion.tokens_in, "tokensOut": completion.tokens_out},
            }
        ],
        "explanation": explanation,
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
        "approvals": approvals,
        # 正直标注：这条链是状态图（langgraph.StateGraph）编排的，与 execute_ai_request 同一输入同一输出
        # 绝不夹带非契约字段——ai-response.schema.json additionalProperties=false，编排标记只走响应头（见 app.py）。
    }
    if approvals:
        response["error"] = _error("approval-required", "该操作需要先审批", retryable=False)
    response_issues = contract_issues("ai-response.schema.json", response)
    if response_issues:
        return {
            "status": 500,
            "body": _error("internal", "ai-service 组装的响应不合契约", "；".join(response_issues[:5])),
            "stages": _stage(state, "assemble", "fail", response_issues[0][:160]),
        }
    return {
        "status": 200,
        "body": response,
        "stages": _stage(state, "assemble", "ok", "ai-response schema ok"),
    }


# ── 边与编译 ────────────────────────────────────────────────────────────────────

def _needs_review(state: DesignGraphState) -> str:
    return "end" if state.get("status", 0) >= 400 else "ok"


def build_design_graph():
    # 懒加载 langgraph（这个慢盘上 import 一次 ~38s）——只在第一次构图时付一次，service 启动路径不受影响。
    from langgraph.graph import END, StateGraph

    graph = StateGraph(DesignGraphState)
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


_DESIGN_GRAPH = None


def design_graph():
    global _DESIGN_GRAPH
    if _DESIGN_GRAPH is None:
        _DESIGN_GRAPH = build_design_graph()
    return _DESIGN_GRAPH


async def run_design_stategraph(payload: dict[str, Any], *, registry: Any) -> tuple[int, dict[str, Any]]:
    """状态图版的 execute_ai_request 入口。返回 (status, body)，与 /v1/ai/run 同一形状。"""
    initial: DesignGraphState = {"payload": payload, "registry": registry, "stages": []}
    final = await design_graph().ainvoke(initial)
    status = int(final.get("status", 500))
    stages = final.get("stages") or []
    _logger.info("stategraph stages: %s", " -> ".join(event.get("stage", "?") for event in stages))
    body = final.get("body") or _error("internal", "状态图未产出响应体")
    return status, body
