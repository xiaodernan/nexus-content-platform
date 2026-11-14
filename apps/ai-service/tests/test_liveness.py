"""§AILIVE-3 · embeddings 的能力状态由真调用得出，不由"配了 key"得出。

钉住的读数事故：中转网关只放行 chat 模型时，`text-embedding-3-small` 返回
`model_not_found`，而 /healthz 曾长期报 embedding=real——因为状态是 `if self._embedding` 推的。
下面每一臂都对应一种"说法与事实对不上"的写法。
"""

from __future__ import annotations

import json
import threading
import time

import httpx

from ai_service.config import Settings
from ai_service.providers.liveness import EmbeddingLiveness, EmbeddingProber, refresh_in_background
from ai_service.providers.openai_compatible import OpenAICompatibleEmbeddingProvider
from ai_service.providers.registry import Registry

MODELS = {"fast": "gpt-x", "balanced": "gpt-x", "reasoning": "gpt-x", "vision": "gpt-x", "embedding": "embed-x"}


def embedding_provider(handler) -> OpenAICompatibleEmbeddingProvider:
    return OpenAICompatibleEmbeddingProvider(
        api_key="sk-test-value",
        base_url="https://gateway.example/v1",
        models=MODELS,
        timeout_s=5.0,
        transport=httpx.MockTransport(handler),
    )


def ok_handler(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json={"data": [{"embedding": [0.1, 0.2, 0.3]}], "usage": {"prompt_tokens": 1}})


def model_not_found_handler(request: httpx.Request) -> httpx.Response:
    # 网关原话（2026-11-13 实测 wkapi.pro 对 text-embedding-3-small 的答复）
    return httpx.Response(
        404,
        json={"error": {"code": "model_not_found", "message": "No available channel for model embed-x under group gpt-特价", "type": "new_api_error"}},
    )


def registry_for(provider, liveness=None) -> Registry:
    settings = Settings(
        service="t",
        version="0",
        host="127.0.0.1",
        port=3200,
        request_timeout_s=5.0,
        openai_api_key="sk-test-value",
        openai_base_url="https://gateway.example/v1",
        models=dict(MODELS),
        json_mode=False,
    )
    return Registry(settings, llm=None, embedding=provider, liveness=liveness)


def provider_row(registry: Registry, kind: str):
    return next(p for p in registry.providers() if p.kind == kind)


# ── 探测本身 ────────────────────────────────────────────────────────────────


def test_probe_ok_reports_the_vectors_it_got() -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return ok_handler(request)

    prober = EmbeddingProber(embedding_provider(handler))
    ok, reason = prober.probe()
    assert ok is True
    assert reason == ""
    # 探测也必须走 /v1/embeddings，不能被拼成相对路径打到别处
    assert calls == ["https://gateway.example/v1/embeddings"]


def test_probe_translates_the_gateway_s_no_such_model_into_a_reason() -> None:
    prober = EmbeddingProber(embedding_provider(model_not_found_handler))
    ok, reason = prober.probe()
    assert ok is False
    assert "404" in reason
    assert "model_not_found" in reason


def test_probe_treats_empty_vectors_as_failure_not_success() -> None:
    """200 但 data 里是空数组：结构上没报错，能力上等于没有。当成成功就会报 real。"""
    prober = EmbeddingProber(embedding_provider(lambda request: httpx.Response(200, json={"data": []})))
    ok, reason = prober.probe()
    assert ok is False
    assert "空向量" in reason


def test_probe_never_lets_a_transport_error_escape() -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    ok, reason = EmbeddingProber(embedding_provider(boom)).probe()
    assert ok is False
    assert reason  # 有一句能给人看的话，而不是把异常抛回 healthz


# ── 注册表怎么把结论说出去 ──────────────────────────────────────────────────


def test_unprobed_embedding_is_not_real() -> None:
    registry = registry_for(embedding_provider(ok_handler))
    info = provider_row(registry, "embedding")
    assert info.status == "unavailable"
    assert "未验证" in info.reason
    # 没验证过就不要把模型名报出去：列出来会被读成"这个模型在这儿"
    assert info.models == []


def test_probed_ok_embedding_is_real_and_names_the_model() -> None:
    liveness = EmbeddingLiveness()
    registry = registry_for(embedding_provider(ok_handler), liveness)
    ok, reason = EmbeddingProber(registry.embedding).probe()
    liveness.record(ok, reason)
    info = provider_row(registry, "embedding")
    assert info.status == "real"
    assert info.reason == ""
    assert "embed-x" in info.models


def test_probed_failed_embedding_stays_unavailable_with_the_gateway_s_words() -> None:
    liveness = EmbeddingLiveness()
    registry = registry_for(embedding_provider(model_not_found_handler), liveness)
    ok, reason = EmbeddingProber(registry.embedding).probe()
    liveness.record(ok, reason)
    info = provider_row(registry, "embedding")
    assert info.status == "unavailable"
    assert "model_not_found" in info.reason


def test_no_embedding_adapter_reports_no_key_not_unverified() -> None:
    settings = Settings(service="t", version="0", host="127.0.0.1", port=3200, request_timeout_s=5.0,
                        openai_api_key="", openai_base_url="https://gateway.example/v1", models=dict(MODELS), json_mode=False)
    registry = Registry(settings, llm=None, embedding=None)
    info = provider_row(registry, "embedding")
    assert info.status == "unavailable"
    assert "NEXUS_OPENAI_API_KEY" in info.reason


def test_text_capability_does_not_hinge_on_embedding() -> None:
    """llm 没就绪而 embedding 就绪：文本仍是 unavailable，汇总才允许是 real。"""
    liveness = EmbeddingLiveness()
    registry = registry_for(embedding_provider(ok_handler), liveness)
    liveness.record(True, "")
    assert registry.text_status() == "unavailable"
    assert registry.embedding_status() == "real"
    assert registry.capability() == "real"


# ── 刷新的节流 ──────────────────────────────────────────────────────────────


def test_stale_liveness_refreshes_once_and_fresh_one_does_not() -> None:
    probes: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        probes.append(str(request.url))
        return ok_handler(request)

    liveness = EmbeddingLiveness(ttl_s=60.0)
    registry = registry_for(embedding_provider(handler), liveness)
    assert refresh_in_background(liveness, EmbeddingProber(registry.embedding)) is True
    # 线程里的探测：等它落地（不靠 sleep 猜时长，轮询到结论出现为止）
    deadline = time.monotonic() + 5.0
    while liveness.state == "unknown" and time.monotonic() < deadline:
        time.sleep(0.01)
    assert liveness.state == "ok"
    assert len(probes) == 1
    # TTL 没到：再来一次不该再花一次网络请求
    assert refresh_in_background(liveness, EmbeddingProber(registry.embedding)) is False
    assert len(probes) == 1


def test_expired_liveness_probes_again() -> None:
    count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        count["n"] += 1
        return ok_handler(request)

    liveness = EmbeddingLiveness(ttl_s=0.0)  # 永远过期
    registry = registry_for(embedding_provider(handler), liveness)
    refresh_in_background(liveness, EmbeddingProber(registry.embedding))
    deadline = time.monotonic() + 5.0
    while count["n"] < 1 and time.monotonic() < deadline:
        time.sleep(0.01)
    assert count["n"] == 1
    liveness.release_refresh()
    refresh_in_background(liveness, EmbeddingProber(registry.embedding))
    deadline = time.monotonic() + 5.0
    while count["n"] < 2 and time.monotonic() < deadline:
        time.sleep(0.01)
    assert count["n"] == 2


def test_two_concurrent_refreshes_share_one_probe() -> None:
    """两个 /healthz 同时读到过期，也只该发一次请求——否则探测本身成了放大器。"""
    started = threading.Barrier(2)
    gate = threading.Event()
    count = {"n": 0}
    lock = threading.Lock()

    def handler(request: httpx.Request) -> httpx.Response:
        with lock:
            count["n"] += 1
        gate.wait(5.0)
        return ok_handler(request)

    liveness = EmbeddingLiveness(ttl_s=0.0)
    registry = registry_for(embedding_provider(handler), liveness)
    results: list[bool] = []

    def call() -> None:
        started.wait(5.0)
        results.append(refresh_in_background(liveness, EmbeddingProber(registry.embedding)))

    threads = [threading.Thread(target=call) for _ in range(2)]
    for t in threads:
        t.start()
    # barrier 只数两个 worker（主线程不等）：两个 worker 都到了点才一起出发，主线程靠 join 等罢工
    for t in threads:
        t.join(5.0)
    gate.set()
    # 只有一个线程拿到 claim；另一个直接返回 False，不发请求
    for t in threads:
        t.join(5.0)
    gate.set()
    deadline = time.monotonic() + 5.0
    while count["n"] < 1 and time.monotonic() < deadline:
        time.sleep(0.01)
    assert results.count(True) == 1
    assert results.count(False) == 1
    assert count["n"] == 1
