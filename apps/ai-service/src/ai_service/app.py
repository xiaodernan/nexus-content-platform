"""NEXUS AI Service（FastAPI）。

职责：provider 抽象 + Model Router + 契约校验 + §162 作业队列。
边界：不写业务库、不应用补丁（docs/ARCHITECTURE.md 边界纪律 2）；
没有真实 provider 时明确报 provider-unavailable，绝不拿假结果冒充（§159）。

同一条执行管线（`execution.execute_ai_request`）既服务同步的 `/v1/ai/run`，也服务 `/v1/ai/jobs`
的 worker：两条路各写一遍，早晚变成"队列里的作业其实没做补丁校验"这种分叉。
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .providers.liveness import refresh_in_background

# 加载 .env 文件（开发环境），生产环境由环境变量注入
_env_file = Path(__file__).resolve().parent.parent.parent / ".env"
if _env_file.exists():
    load_dotenv(_env_file, override=True)
    import os as _os
    print(f"[dotenv] Loaded from {_env_file}, NEXUS_REDIS_URL={_os.environ.get('NEXUS_REDIS_URL')!r}")
else:
    print(f"[dotenv] .env not found at {_env_file}")

from .config import Settings, load_settings
from .contract import ContractMissing, contract_dir
from .contract import issues as contract_issues
from .execution import error as make_error
from .execution import execute_ai_request, execute_chat_request, parse_request_body
from .jobs import JobStore, Worker, build_store, job_capacity
from .providers.registry import Registry


def _error(code: str, message: str, hint: str = "", retryable: bool = False) -> dict[str, Any]:
    return make_error(code, message, hint, retryable)


class _State:
    """只在生命周期内存在的东西：队列后端与 worker（两者都要在事件循环里建）。"""

    def __init__(self, store: JobStore, worker: Worker) -> None:
        self.store = store
        self.worker = worker


def create_app(settings: Settings | None = None, *, registry: Registry | None = None) -> FastAPI:
    settings = settings or load_settings()
    registry = registry or Registry(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # create_app 是同步的，而 Redis 连接是异步的：后端只能在 startup 里建。
        # 配了 NEXUS_REDIS_URL 却连不上会直接启动失败，而不是悄悄换成内存后端骗人。
        store = await build_store()
        worker = Worker(store, registry, capacity=job_capacity())
        await worker.start()
        app.state.nexus = _State(store, worker)
        # 启动就起一次 embeddings 探测，但不在启动路径上等它：provider 慢的时候
        # 把服务拉起来的代价变成 60s 等待，不值得。第一次 /healthz 可能仍写"未验证"，
        # 那是一句实话；探测落地后下一次读到的就是网关的真答复（见 providers/liveness.py）。
        prober = registry.embedding_prober()
        if prober is not None:
            refresh_in_background(registry.liveness, prober)
        try:
            yield
        finally:
            await worker.stop()
            app.state.nexus = None

    app = FastAPI(title=settings.service, version=settings.version, lifespan=lifespan)

    def runtime() -> _State | None:
        # 没有 lifespan 就没有队列（uvicorn 正常启动一定会跑 lifespan；测试用 TestClient
        # 不加 with 时不会）。这时候如实报 backend=none，而不是崩一个 500 堆栈出来
        return getattr(app.state, "nexus", None)

    def queue_report(state: _State | None) -> dict[str, Any]:
        if state is None:
            return {
                "backend": "none",
                "pending": 0,
                "running": 0,
                "capacity": 0,
                "note": "作业队列未启动：/v1/ai/jobs 现在提交会失败，同步的 /v1/ai/run 不受影响。",
            }
        return {
            "backend": state.store.backend,
            "pending": 0,
            "running": 0,
            "capacity": state.worker.capacity,
            "note": state.store.note,
        }

    def queue_unavailable() -> JSONResponse:
        return JSONResponse(
            _error(
                "internal",
                "作业队列未启动，无法受理或查询作业",
                "ai-service 需要带 lifespan 启动（uvicorn 默认就是）；同步路径 /v1/ai/run 仍然可用。",
            ),
            status_code=503,
        )

    @app.get("/healthz")
    async def healthz() -> dict[str, Any]:
        # 结论过期就后台补一次，本次仍返回上一次已知结论：healthz 的预算是毫秒，
        # 而 web 侧探测它的超时只有 1.5s（把网络等待放进健康检查，provider 一慢就整条链路变 DEMO）。
        prober = registry.embedding_prober()
        if prober is not None:
            refresh_in_background(registry.liveness, prober)
        providers = registry.providers()
        state = runtime()
        pending, running = await state.store.counts() if state else (0, 0)
        return {
            "service": settings.service,
            "version": settings.version,
            "capability": registry.capability(),
            "providers": [
                {"kind": p.kind, "name": p.name, "status": p.status, "models": p.models, "reason": p.reason}
                for p in providers
            ],
            # §162：这两个数来自真队列。以前 pending 写死 0，等于宣称"有一个永远空的队列"
            "queue": {**queue_report(state), "pending": pending, "running": running},
            # v690：应用级 LLM 完成缓存状态（未启则 None）；面板照实读，不许藏进配置页
            "llmCache": registry.llm_cache_state(),
        }

    @app.get("/v1/capabilities")
    async def capabilities() -> dict[str, Any]:
        return await healthz()

    @app.get("/v1/ai/cache-stats")
    async def cache_stats() -> dict[str, Any]:
        """§CACHE-2 / §CACHE-4：把"缓存到底有没有生效"拆成四本互不冒充的账。

        1. `prefix`：用我们自己的字节算出来的稳定前缀复用率——**唯一与网关无关的硬指标**。
           同一摘要重复出现 = 这一轮的前缀与上一轮逐字节相同 = provider 只要做前缀缓存就必然命中。
        2. `appCache`：应用级 completion 缓存的真实命中（命中 = 0 token、0 网络、<1ms）。
        3. `provider`：上游到底**报没报** `cached_tokens`（报了多少次、缺席多少次）。
           `cached=0` 与"没报"是两件事，混成一句就是把缺席写成确定的 0 命中。
        4. `upstream`：同一段稳定前缀在不同轮次被数成了多少 token。
           字节逐字节相同却数出不同的数，只能是背后换了推理后端——那是
           「读数不可比」，不是「我们的前缀在变」。没有这一维，两种情形在面板上
           是同一个「命中率 40%」，而正确的处置完全相反。

        为什么单独开端点而不塞进 `/healthz`：healthz 被 web 每次请求探测、预算 1.5s，
        这里要的是运维面读数，不该跟着健康检查一起被拉。
        """
        return {
            "prefix": registry.cache_telemetry().prefix.stats(),
            "appCache": registry.llm_cache_state(),
            "provider": registry.cache_telemetry().provider.stats(),
            "upstream": registry.cache_telemetry().upstream.stats(),
        }

    @app.post("/v1/ai/run")
    async def run(request: Request) -> JSONResponse:
        payload, rejected = parse_request_body(await request.body(), settings.max_body_bytes)
        if rejected is not None:
            status, body = rejected
            return JSONResponse(body, status_code=status)
        assert payload is not None
        status, body = await execute_ai_request(payload, registry=registry)
        return JSONResponse(body, status_code=status)

    @app.post("/v1/ai/chat")
    async def chat(request: Request) -> JSONResponse:
        """§47 角色对话：人设与上下文由 web 侧拼好发过来，这里只做模型调用。"""
        payload, rejected = parse_request_body(await request.body(), settings.max_body_bytes)
        if rejected is not None:
            status, body = rejected
            return JSONResponse(body, status_code=status)
        assert payload is not None
        status, body = await execute_chat_request(payload, registry=registry)
        return JSONResponse(body, status_code=status)

    @app.post("/v1/ai/jobs")
    async def submit_job(request: Request) -> JSONResponse:
        """§162：把同一件事改成"提交后拿 jobId"。校验与执行和同步路径共用一条管线。"""
        payload, rejected = parse_request_body(await request.body(), settings.max_body_bytes)
        if rejected is not None:
            status, body = rejected
            return JSONResponse(body, status_code=status)
        assert payload is not None
        # 契约在入队前校验：一份不合规矩的请求排进队列，只会让 worker 产出一个注定失败的作业
        request_issues = contract_issues("ai-request.schema.json", payload)
        if request_issues:
            return JSONResponse(
                _error("validation-failed", "AiRequest 不符合契约", "；".join(request_issues[:5])),
                status_code=400,
            )
        state = runtime()
        if state is None:
            return queue_unavailable()
        job = await state.store.enqueue(payload)
        accepted = {
            "jobId": job.id,
            "requestId": job.requestId,
            "status": job.status,
            "backend": job.backend,
            "note": state.store.note,
            "capacity": state.worker.capacity,
        }
        issues = contract_issues("ai-job-accepted.schema.json", accepted)
        if issues:
            return JSONResponse(_error("internal", "作业回执不符合契约", "；".join(issues[:5])), status_code=500)
        return JSONResponse(accepted, status_code=202)

    @app.post("/v1/ai/jobs/{job_id}/cancel")
    async def cancel_job(job_id: str) -> JSONResponse:
        """§162 取消/重试：受理一次取消。三种回话各说各的，不互相冒充：

        - 404：这个作业号在后端里没有（与 GET 同一个口径，不说"存在但不给你看"）；
        - 409：作业已经 completed / failed——取消来不及了，不假装受理；
        - 200：受理。排队中的当场落成 cancelled；在跑的只立取消标志，状态由 worker
          在执行前后两个检查点落（provider 调用不被打断，理由写在 `jobs.py` 的 run_job）。
        已经 cancelled 的再按一次也回 200：重复点"取消"是同一件事说了两遍，不是错误。
        """
        state = runtime()
        if state is None:
            return queue_unavailable()
        job = await state.store.get(job_id)
        if job is None:
            return JSONResponse(
                _error(
                    "validation-failed",
                    f"没有 id 为 {job_id} 的作业",
                    "作业只在提交它的那个队列后端里可见；内存后端重启即失，Redis 后端过期即失。",
                ),
                status_code=404,
            )
        if job.status in {"completed", "failed"}:
            return JSONResponse(
                _error(
                    "validation-failed",
                    f"作业已经结束（{job.status}），取消来不及了",
                    "结果按那次执行落库；想再来一次走重试，不要把取消说成成功。",
                ),
                status_code=409,
            )
        accepted = await state.store.request_cancel(job_id)
        if accepted is None:
            # get 与 request_cancel 之间被清掉（内存后端淘汰 / Redis 过期）：按查不到回答
            return JSONResponse(
                _error(
                    "validation-failed",
                    f"没有 id 为 {job_id} 的作业",
                    "作业只在提交它的那个队列后端里可见；内存后端重启即失，Redis 后端过期即失。",
                ),
                status_code=404,
            )
        body = accepted.public()
        issues = contract_issues("ai-job-status.schema.json", body)
        if issues:
            return JSONResponse(
                _error("internal", "作业状态不符合契约", "；".join(issues[:5])),
                status_code=500,
            )
        return JSONResponse(body)

    @app.get("/v1/ai/jobs/{job_id}")
    async def job_status(job_id: str) -> JSONResponse:
        state = runtime()
        if state is None:
            return queue_unavailable()
        job = await state.store.get(job_id)
        if job is None:
            # 查不到有两种可能：id 是编的，或者作业已经过期被清掉。两种都要如实说，不含糊
            return JSONResponse(
                _error(
                    "validation-failed",
                    f"没有 id 为 {job_id} 的作业",
                    "作业只在提交它的那个队列后端里可见；内存后端重启即失，Redis 后端过期即失。",
                ),
                status_code=404,
            )
        body = job.public()
        issues = contract_issues("ai-job-status.schema.json", body)
        if issues:
            return JSONResponse(
                _error("internal", "作业状态不符合契约", "；".join(issues[:5])),
                status_code=500,
            )
        return JSONResponse(body)

    @app.exception_handler(ContractMissing)
    def missing_contract(_request: Request, exc: ContractMissing) -> JSONResponse:
        return JSONResponse(_error("internal", str(exc)), status_code=500)

    app.state.contract_dir = contract_dir()
    return app


app = create_app()
