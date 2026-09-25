"""一次 AI 请求的完整执行管线（§162）。

抽出来只为一件事：**同步的 `/v1/ai/run` 与异步作业必须走同一条代码**。两条路径各写一遍
provider 调用、补丁校验、审批挂起，早晚会出现"队列里的作业不做契约校验"这种分叉。
所以这里返回 `(HTTP 状态码, 报文)`，谁调用谁负责发出去。

边界不变：不写业务库、不应用补丁，没配 provider 就明确报 provider-unavailable（§159）。
"""

from __future__ import annotations

import json
from typing import Any

import anyio

from .contract import issues as contract_issues
from .design_prompt import build_prompt, parse_reply
from .providers.base import ProviderFailed
from .providers.registry import Registry

# §74 的高危 op 口径与 web 侧 `server/ai/approvals.ts` 的 DESTRUCTIVE_OPS 必须一致：
# 两边各扫各的，漏掉的那一边就等于没有门（removeAsset 以前就在这儿漏着）。
DESTRUCTIVE_OPS = {"remove", "removePage", "removeToken", "removeAsset"}
LLM_MODEL_CLASSES = {"fast", "balanced", "reasoning", "vision"}


def error(code: str, message: str, hint: str = "", retryable: bool = False) -> dict[str, Any]:
    return {"code": code, "message": message, "hint": hint, "retryable": retryable}


def sanitize_plans(raw: Any) -> list[dict[str, Any]]:
    """模型给出的 plan 形状不可信；缺字段的直接丢弃，而不是让整个请求失败。"""
    plans: list[dict[str, Any]] = []
    for plan in raw if isinstance(raw, list) else []:
        if not isinstance(plan, dict) or not isinstance(plan.get("goal"), str):
            continue
        tasks = []
        for t in plan.get("tasks") or []:
            # 任务 id 是 dependsOn 与实时事件的锚点，缺 id/title 的任务只能丢弃，不能编造
            if not isinstance(t, dict) or not isinstance(t.get("id"), str) or not isinstance(t.get("title"), str):
                continue
            tasks.append(
                {
                    "id": t["id"],
                    "title": t["title"],
                    "agent": str(t.get("agent") or "design"),
                    "status": t.get("status")
                    if t.get("status") in {"pending", "running", "done", "failed", "skipped"}
                    else "pending",
                    "dependsOn": [str(d) for d in (t.get("dependsOn") or [])],
                }
            )
        plans.append(
            {
                "goal": plan["goal"],
                "constraints": [str(c) for c in (plan.get("constraints") or [])],
                "tasks": tasks,
                "dependencies": [list(pair) for pair in (plan.get("dependencies") or []) if isinstance(pair, list)],
                "risks": [str(r) for r in (plan.get("risks") or [])],
                "validation": [str(v) for v in (plan.get("validation") or [])],
            }
        )
    return plans


def parse_request_body(body: bytes | None, max_body_bytes: int) -> tuple[dict[str, Any] | None, tuple[int, dict] | None]:
    """把线上字节变成 payload；任何一步不过就返回该发出去的错误，绝不半路猜一个请求出来。"""
    raw = body or b""
    if len(raw) > max_body_bytes:
        return None, (
            413,
            error("validation-failed", f"请求体超过 {max_body_bytes} 字节上限"),
        )
    try:
        payload = json.loads(raw or b"{}")
    except ValueError:
        return None, (400, error("validation-failed", "请求体必须是 JSON"))
    if not isinstance(payload, dict):
        return None, (400, error("validation-failed", "请求体必须是 JSON 对象"))
    return payload, None


async def execute_ai_request(payload: dict[str, Any], *, registry: Registry) -> tuple[int, dict[str, Any]]:
    """校验 → 选模型 → 调 provider → 校验补丁 → 挂审批 → 组装契约响应。

    provider 调用放在工作线程里（它是阻塞的 HTTP 请求），所以整条管线是协程：
    同步路由与异步 worker 都能直接 await。
    """
    request_issues = contract_issues("ai-request.schema.json", payload)
    if request_issues:
        return (
            400,
            error("validation-failed", "AiRequest 不符合契约", "；".join(request_issues[:5])),
        )

    if not registry.llm:
        return (
            503,
            error(
                "provider-unavailable",
                "没有可用的文本 provider",
                "配置 NEXUS_OPENAI_API_KEY 后重试；未配置时 web 侧只会给出标注过的 DEMO 结果。",
            ),
        )

    model_class = str(payload.get("modelClass") or "balanced")
    if model_class not in LLM_MODEL_CLASSES:
        return (
            503,
            error(
                "provider-unavailable",
                f"{model_class} 档模型尚未接入",
                "图像 / 视频 / embedding provider 属于 M2、M5 切片。",
            ),
        )
    try:
        model = registry.llm.model_for(model_class)
    except ProviderFailed as exc:
        return (503, error("provider-unavailable", str(exc)))

    system, user = build_prompt(payload)
    try:
        completion = await anyio.to_thread.run_sync(
            lambda: registry.llm.complete(model=model, system=system, user=user)
        )
    except ProviderFailed as exc:
        return (502, error("provider-failed", str(exc), retryable=True))

    try:
        reply = parse_reply(completion.text)
    except ValueError as exc:
        return (502, error("provider-failed", str(exc), retryable=True))

    patches = reply.get("patches")
    patches = patches if isinstance(patches, list) else []
    for index, patch in enumerate(patches):
        problems = contract_issues("design-patch.schema.json", patch)
        if problems:
            return (
                502,
                error(
                    "validation-failed",
                    f"provider 产出的第 {index + 1} 个补丁不符合补丁契约",
                    "；".join(problems[:5]),
                    retryable=True,
                ),
            )

    explanation = str(reply.get("explanation") or "")[:2000]
    labels = [str(label) for label in (reply.get("labels") or [])][:4]
    dry_run = bool(payload.get("dryRun"))
    approvals: list[dict[str, str]] = []
    if "delete" in (payload.get("approvalPolicy") or []):
        flagged = sorted(
            {
                f"{patch.get('pageId') or 'document'}: {op.get('op')} {op.get('nodeId') or op.get('pageId') or op.get('key') or op.get('assetId')}"
                for patch in patches
                for op in (patch.get("ops") or [])
                if isinstance(op, dict) and op.get("op") in DESTRUCTIVE_OPS
            }
        )
        if flagged:
            approvals = [{"action": "delete", "reason": item} for item in flagged]

    applied = [] if (dry_run or approvals) else patches
    if dry_run:
        explanation = f"（试运行，未返回可应用补丁）{explanation}"
    if approvals:
        explanation = f"（含需审批的删除动作，已挂起）{explanation}"

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
                "summary": f"{completion.provider}/{completion.model} 返回 {len(patches)} 个补丁",
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
            "latencyMs": completion.latency_ms,
            "costUsd": 0,
            "toolCalls": 1,
            "demoMode": False,
        },
        "approvals": approvals,
    }
    if approvals:
        response["error"] = error("approval-required", "该操作需要人工审批后才执行", retryable=False)

    response_issues = contract_issues("ai-response.schema.json", response)
    if response_issues:
        return (
            500,
            error("internal", "ai-service 产出的响应不符合契约", "；".join(response_issues[:5])),
        )
    return (200, response)
