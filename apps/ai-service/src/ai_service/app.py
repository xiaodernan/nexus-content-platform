"""NEXUS AI Service（FastAPI）。

职责：provider 抽象 + Model Router + 契约校验。
边界：不写业务库、不应用补丁（docs/ARCHITECTURE.md 边界纪律 2）；
没有真实 provider 时明确报 provider-unavailable，绝不拿假结果冒充（§159）。
"""

from __future__ import annotations

import json
import threading
from typing import Any

import anyio
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .config import Settings, load_settings
from .contract import ContractMissing, contract_dir
from .contract import issues as contract_issues
from .design_prompt import build_prompt, parse_reply
from .providers.base import ProviderFailed
from .providers.registry import Registry

DESTRUCTIVE_OPS = {"remove", "removePage", "removeToken"}
LLM_MODEL_CLASSES = {"fast", "balanced", "reasoning", "vision"}


def _error(code: str, message: str, hint: str = "", retryable: bool = False) -> dict[str, Any]:
    return {"code": code, "message": message, "hint": hint, "retryable": retryable}


def _sanitize_plans(raw: Any) -> list[dict[str, Any]]:
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


class _State:
    def __init__(self, settings: Settings, registry: Registry) -> None:
        self.settings = settings
        self.registry = registry
        self.lock = threading.Lock()
        self.running = 0


def create_app(settings: Settings | None = None, *, registry: Registry | None = None) -> FastAPI:
    settings = settings or load_settings()
    registry = registry or Registry(settings)
    state = _State(settings, registry)
    app = FastAPI(title=settings.service, version=settings.version)

    @app.get("/healthz")
    def healthz() -> dict[str, Any]:
        providers = registry.providers()
        return {
            "service": settings.service,
            "version": settings.version,
            "capability": registry.capability(),
            "providers": [
                {"kind": p.kind, "name": p.name, "status": p.status, "models": p.models, "reason": p.reason}
                for p in providers
            ],
            "queue": {"pending": 0, "running": state.running},
        }

    @app.get("/v1/capabilities")
    def capabilities() -> dict[str, Any]:
        return healthz()

    @app.post("/v1/ai/run")
    async def run(request: Request) -> JSONResponse:
        body = await request.body()
        if len(body) > settings.max_body_bytes:
            return JSONResponse(
                _error("validation-failed", f"请求体超过 {settings.max_body_bytes} 字节上限"),
                status_code=413,
            )
        try:
            payload = json.loads(body or b"{}")
        except ValueError:
            return JSONResponse(_error("validation-failed", "请求体必须是 JSON"), status_code=400)
        if not isinstance(payload, dict):
            return JSONResponse(_error("validation-failed", "请求体必须是 JSON 对象"), status_code=400)

        request_issues = contract_issues("ai-request.schema.json", payload)
        if request_issues:
            return JSONResponse(
                _error("validation-failed", "AiRequest 不符合契约", "；".join(request_issues[:5])),
                status_code=400,
            )

        if not registry.llm:
            return JSONResponse(
                _error(
                    "provider-unavailable",
                    "没有可用的文本 provider",
                    "配置 NEXUS_OPENAI_API_KEY 后重试；未配置时 web 侧只会给出标注过的 DEMO 结果。",
                ),
                status_code=503,
            )

        model_class = str(payload.get("modelClass") or "balanced")
        if model_class not in LLM_MODEL_CLASSES:
            return JSONResponse(
                _error(
                    "provider-unavailable",
                    f"{model_class} 档模型尚未接入",
                    "图像 / 视频 / embedding provider 属于 M2、M5 切片。",
                ),
                status_code=503,
            )
        try:
            model = registry.llm.model_for(model_class)
        except ProviderFailed as exc:
            return JSONResponse(_error("provider-unavailable", str(exc)), status_code=503)

        system, user = build_prompt(payload)
        with state.lock:
            state.running += 1
        try:
            completion = await anyio.to_thread.run_sync(
                lambda: registry.llm.complete(model=model, system=system, user=user)
            )
        except ProviderFailed as exc:
            return JSONResponse(_error("provider-failed", str(exc), retryable=True), status_code=502)
        finally:
            with state.lock:
                state.running -= 1

        try:
            reply = parse_reply(completion.text)
        except ValueError as exc:
            return JSONResponse(_error("provider-failed", str(exc), retryable=True), status_code=502)

        patches = reply.get("patches")
        patches = patches if isinstance(patches, list) else []
        for index, patch in enumerate(patches):
            problems = contract_issues("design-patch.schema.json", patch)
            if problems:
                return JSONResponse(
                    _error(
                        "validation-failed",
                        f"provider 产出的第 {index + 1} 个补丁不符合补丁契约",
                        "；".join(problems[:5]),
                        retryable=True,
                    ),
                    status_code=502,
                )

        explanation = str(reply.get("explanation") or "")[:2000]
        labels = [str(label) for label in (reply.get("labels") or [])][:4]
        dry_run = bool(payload.get("dryRun"))
        approvals: list[dict[str, str]] = []
        policy = payload.get("approvalPolicy") or []
        if "delete" in policy:
            flagged = sorted(
                {
                    f"{patch.get('pageId') or 'document'}: {op.get('op')} {op.get('nodeId') or op.get('pageId') or op.get('key')}"
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
            "plans": _sanitize_plans(reply.get("plans")),
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
            response["error"] = _error("approval-required", "该操作需要人工审批后才执行", retryable=False)

        response_issues = contract_issues("ai-response.schema.json", response)
        if response_issues:
            return JSONResponse(
                _error("internal", "ai-service 产出的响应不符合契约", "；".join(response_issues[:5])),
                status_code=500,
            )
        return JSONResponse(response)

    @app.exception_handler(ContractMissing)
    def missing_contract(_request: Request, exc: ContractMissing) -> JSONResponse:
        return JSONResponse(_error("internal", str(exc)), status_code=500)

    app.state.nexus = state
    app.state.contract_dir = contract_dir()
    return app


app = create_app()
