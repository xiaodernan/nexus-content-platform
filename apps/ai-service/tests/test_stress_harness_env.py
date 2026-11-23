"""§STRESS-2 附门 —— 压测脚本 `scripts/stress-ai-service.py` 自身的环境判据。

为什么要给发压脚本写测试：这一片踩过的两个坑都**不是服务端的 bug**，而是"仪器坏了还照样出数"。

1. `NO_PROXY` 里带方括号的 `::1` 让 `httpx.AsyncClient` 在**构造阶段**就抛
   `InvalidURL: Invalid port`，脚本一发请求都发不出去，ROADMAP 上的读数再也复现不出来。
2. 客户端若保留 `trust_env`，本机挂着系统代理时 p95 量到的是**代理的排队**，不是服务的排队。

两种坏法都不会让脚本报错，只会让它安静地量错东西。所以判据写在代码外面：
- 本地目标必须脱离进程环境里的代理；远程目标必须保留（真 provider 在这台机器上要走节点才出得去）。
- 清洗 NO_PROXY 只许用服务端那一份函数，不许脚本里再抄一遍（两把尺子量出来的数没法对齐）。
- 对照腿必须真的不是一条路由，否则"归因"扣掉的是别的东西。
- 畸形请求轮转的每一族必须在契约层就无效（缺 requestId），否则压测会烧掉真 token 预算——
  2026-11-20 就有 150 发里混进 12 发合法请求、真打了 12 次模型。
"""
from __future__ import annotations

import asyncio
import importlib.util
import io
import json
import os
import sys
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from ai_service.app import create_app
from ai_service.config import Settings, sanitize_no_proxy
from ai_service.contract import issues as contract_issues
from ai_service.providers.registry import Registry
from conftest import CONTRACTS

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = REPO_ROOT / "scripts" / "stress-ai-service.py"


@pytest.fixture(scope="module")
def harness() -> Any:
    """按路径导入压测脚本（它不是包，只能这么加载）。

    脚本在 import 期把 `sys.stdout` 换成 `TextIOWrapper(sys.stdout.buffer, encoding="utf-8")`
    （中文 Windows 的 GBK 控制台会打断输出）。直接顶在 pytest 的捕获流上，那个包装对象
    被回收时会关掉 pytest 的临时文件，于是整个会话后面都在报
    `ValueError: I/O operation on closed file`——26 条 ERROR 全是 setup，脚本一行没测。
    换成一个没有 `.buffer` 的 StringIO：脚本里那次包装如实失败（它自己有 try/except），
    pytest 的捕获流不动，测试环境反而更接近"这台机器上没有代理"的干净情况。
    """
    assert SCRIPT_PATH.exists(), f"压测脚本不在了：{SCRIPT_PATH}"
    saved = sys.stdout
    sys.stdout = io.StringIO()
    spec = importlib.util.spec_from_file_location("stress_ai_service", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
    finally:
        sys.stdout = saved
    yield module
    sys.modules.pop(spec.name, None)


def _no_proxy_values() -> list[str]:
    return [v for k, v in os.environ.items() if k.upper() == "NO_PROXY"]


async def _build_and_close(base_url: str) -> bool:
    async with httpx.AsyncClient(base_url=base_url, trust_env=True) as client:
        return client.trust_env


# ── 臂 1：本地目标不许把请求绕进代理 ──────────────────────────────────────────


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1:3200",
        "http://localhost:3200",
        "http://NEXUS.localhost:3200",
        "http://[::1]:3200",
        "http://127.0.0.1:3200/v1/ai/run",
    ],
)
def test_loopback_targets_must_ignore_process_proxy_settings(harness: Any, url: str) -> None:
    assert harness._client_kwargs(url) == {"trust_env": False}, (
        f"{url} 是本地目标却保留了 trust_env：p95 量到的是本机代理的排队时间，"
        f"而这一片存在的理由恰恰是'服务的哪一段在排队'"
    )


@pytest.mark.parametrize(
    "url",
    ["https://api.example.com/v1", "http://10.0.0.8:3200", "http://nexus-ai.internal:3200"],
)
def test_remote_targets_keep_trust_env_so_the_route_out_is_the_real_one(harness: Any, url: str) -> None:
    assert harness._client_kwargs(url) == {"trust_env": True}, (
        f"{url} 被当成回环地址关掉了 trust_env：这台机器上真 provider 必须走节点才出得去，"
        f"关掉它等于把一个故障换成另一个故障"
    )


# ── 臂 2：清洗只有一份真值，且确实是服务端那一份 ─────────────────────────────


def test_the_harness_uses_the_services_own_no_proxy_sanitizer(harness: Any) -> None:
    assert harness.sanitize_no_proxy is sanitize_no_proxy, (
        "脚本又自己抄了一份 NO_PROXY 清洗：两份判断一旦分叉，脚本量的就不是服务跑的那件事"
    )


def test_repair_no_proxy_actually_makes_httpx_constructible(harness: Any, monkeypatch) -> None:
    """本机实测的那条环境（2026-11-23）：不清洗就一发请求都发不出去。"""
    monkeypatch.setenv("NO_PROXY", "localhost,.localhost,127.0.0.1,127.0.0.0/8,[::1],::1")

    with pytest.raises(httpx.InvalidURL):
        asyncio.run(_build_and_close("https://api.example.com"))

    changed = harness._repair_no_proxy()
    assert changed, "清洗没报告任何改动，说明判据没跑到真环境"
    assert all("[" not in v and "]" not in v for v in _no_proxy_values()), (
        f"清洗后仍留着方括号：{_no_proxy_values()}"
    )
    assert asyncio.run(_build_and_close("https://api.example.com")) is True, (
        "修好了环境却顺手把 trust_env 关了，等于换个故障原因"
    )


# ── 臂 3：对照腿必须真的什么都不做 ───────────────────────────────────────────


def test_the_control_leg_is_not_a_registered_route(harness: Any) -> None:
    """对照腿的意义：它不进任何 handler，只走 ASGI 栈。

    哪天有人把它改成一条真路由（`/healthz` 看着"更方便"），归因扣掉的就是服务自己的账，
    每一轮读数都会系统性偏低——而这正是 §STRESS-1 写错归因的那一类错误。
    """
    app = create_app(Settings(), registry=Registry(Settings()))
    registered = {getattr(r, "path", None) for r in app.routes}
    control = harness.DEFAULT_CONTROL_PATH
    assert control not in registered, f"对照腿 {control} 是一条真路由，扣不掉传输层的账"
    assert "/healthz" in registered, "/healthz 不在路由表里，这一片量的目标就没了"


# ── 臂 4：畸形轮转的每一族都到不了 provider ──────────────────────────────────


def test_every_bad_body_is_rejected_by_the_contract_before_any_provider_call(harness: Any) -> None:
    for index, body in enumerate(harness.BAD_BODIES):
        assert "requestId" not in body, (
            f"BAD_BODIES[{index}] 带着 requestId：契约必填项齐了就可能走到真 provider，"
            f"压测脚本于是开始烧别人的 token 预算（2026-11-20 实测 150 发里 12 发拿到 200）"
        )
        assert contract_issues("ai-request.schema.json", body), f"BAD_BODIES[{index}] 在契约层是合法的"
    assert len(harness.BAD_BODIES) >= 4, "畸形族只剩一两条，'坏输入不许打穿进程'这条判据就没有覆盖面"


def test_the_contract_oracle_is_not_vacuously_rejecting() -> None:
    """反证：判据本身不能是"什么都判无效"，否则臂 4 永远绿。

    合法样本按契约的 required 全填齐（`requestId` + `prompt` + `context.projectId`），
    它必须**通过**校验。同时把 required 清单本身钉住：哪天契约改成 requestId 选填，
    臂 4 那句"每一族都缺 requestId 所以碰不到 provider"就自动失效，这一条要先把话说清楚。
    """
    required = json.loads((CONTRACTS / "ai-request.schema.json").read_text(encoding="utf-8"))["required"]
    assert "requestId" in required, (
        f"契约不再强制 requestId（required={required}）：BAD_BODIES 的'到不了 provider'保证已经失效，"
        f"臂 4 需要换一个判据"
    )
    legal = {"requestId": "stress-self-check", "prompt": "x", "context": {"projectId": "p-1"}}
    assert contract_issues("ai-request.schema.json", legal) == [], (
        "一份必填项齐了的请求也被判无效，说明校验用的是别的 schema：臂 4 的绿没有意义"
    )


# ── 臂 5：那一行"running 口径"不许报它没有的数据 ────────────────────────────


def test_the_lease_note_refuses_the_precision_it_does_not_have(harness: Any) -> None:
    """`/healthz` 不上报租约，所以压测输出的那一行只能说"按本机 env 推"，不能替被测进程报配置。

    这条臂是我自己踩出来的：第一次跑就把发压进程的 env 当成服务的租约打印出来，
    而目标进程当时是 `AI_SERVICE_JOB_LEASE_S=20` 起的——打印出来的 180s 与服务毫无关系。
    一个看起来像读数的假数字比没有读数更糟，因为它会被抄进 ROADMAP。

    `queue.backend` 的三种取值不靠我记的样子，直接从契约枚举取（`none` 是"队列没启动"，
    那时谈租约就是凭空给口径——这是我写第一版时漏掉的那一格）。
    """
    from ai_service.jobs import RedisJobStore

    schema = json.loads((CONTRACTS / "health.schema.json").read_text(encoding="utf-8"))
    backends = schema["properties"]["queue"]["properties"]["backend"]["enum"]
    assert backends == ["none", "memory", "redis"], f"契约的 backend 值域变了，这行口径的分支要跟着改：{backends}"

    default_store = RedisJobStore(object(), prefix="nexus:test:note", ttl_s=3600)  # type: ignore[arg-type]
    redis_note = harness._lease_note({"backend": "redis"}, env={})
    assert f"{default_store.lease_s:g}" in redis_note, (
        f"脚本推的默认租约和服务端构造函数的默认值分叉了：{redis_note}"
    )
    assert "本机" in redis_note and "未上报" in redis_note, (
        f"没有声明数据来源，这行会被当成被测进程的配置抄走：{redis_note}"
    )
    assert "本仓库当前实现" in redis_note, (
        f"'三条命令'是代码事实不是被测事实，目标进程版本更早时不成立：{redis_note}"
    )

    for backend in ("memory", "none"):
        note = harness._lease_note({"backend": backend}, env={"AI_SERVICE_JOB_LEASE_S": "90"})
        assert "90" not in note, (
            f"backend={backend} 时点名了本机租约却仍然把 90 打印出来——判据是空转的，"
            f"这种'怎么填都绿'的臂以后量不到任何东西：{note}"
        )
        assert "WARN" in note or "内存" in note, f"非 redis 后端必须明说没有租约账本：{note}"

    unknown = harness._lease_note({"backend": "foundationdb"}, env={})
    assert unknown.startswith("WARN"), f"契约外的 backend 值应当拒绝给口径，而不是当作 redis：{unknown}"

    warn = harness._lease_note({"backend": "redis"}, env={"AI_SERVICE_JOB_LEASE_S": "3600"})
    assert warn.startswith("WARN"), f"租约不小于 TTL 时应当拒绝给数，而不是报一个夹过的值：{warn}"


def test_the_lease_note_agrees_with_a_real_healthz_queue_object() -> None:
    """前面那些分支喂的是我手写的 queue 字典；这一条喂**真服务**吐出来的那一份。

    用 `with TestClient(...)` 而不是裸调用：queue 是 lifespan 建好 store 之后才有的，
    不跑 lifespan 就只能看到契约里的 default（backend=none、capacity=0），
    那正好是"看起来测了其实什么都没测"的那种假绿。
    """
    with TestClient(create_app(Settings(), registry=Registry(Settings()))) as live:
        queue = live.get("/healthz").json()["queue"]
    assert queue["backend"] in ("none", "memory", "redis"), f"契约外的后端值：{queue}"

    note = _harness_lease_note(queue)
    if queue["backend"] == "redis":
        assert not note.startswith("WARN"), f"目标是 redis 却拒绝给口径：{note}"
        assert "三条" in note, f"redis 分支应当说明读数的代价：{note}"
    else:
        assert "backend" in note or "内存" in note, f"非 redis 后端要说清楚为什么没有租约：{note}"


def _harness_lease_note(queue: dict[str, Any]) -> str:
    """单独取一次脚本模块：这条臂不用 fixture 参数，好让 `with TestClient` 那一段读起来干净。"""
    spec = importlib.util.spec_from_file_location("stress_ai_service_note", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    saved, sys.stdout = sys.stdout, io.StringIO()
    try:
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    finally:
        sys.stdout = saved
    return module._lease_note(queue, env={})
