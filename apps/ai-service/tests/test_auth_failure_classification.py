"""401/403 不是一句话能打完的——把网关原话分门别类，处置才跟得上（§AILIVE-4）。

钉住的现场：2026-11-22 一天之内三种 403 全都路过——
额度耗尽（`insufficient_user_quota`）、地理封锁（"本站不对您所在的国家及地区进行商业服务"）、
失效令牌（wkapi 的 `Invalid token`）。在此之前它们统一渲染成
"provider 拒绝了凭据（401/403），检查 NEXUS_OPENAI_API_KEY"，
于是"该充值"被说成"该换 key"：照着做的人会换一把同样没钱的 key，问题一点没动。
"""

from __future__ import annotations

import httpx

from ai_service.providers.base import ProviderFailed
from ai_service.providers.openai_compatible import (
    OpenAICompatibleEmbeddingProvider,
    OpenAICompatibleProvider,
    describe_auth_failure,
)


def sync_provider(handler) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        api_key="sk-test-value",
        base_url="https://gateway.example/v1",
        models={"fast": "gpt-x", "balanced": "gpt-x", "reasoning": "gpt-x", "vision": "gpt-x"},
        timeout_s=5.0,
        json_mode=False,
        transport=httpx.MockTransport(handler),
    )


def stream_provider(handler) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        api_key="sk-test-value",
        base_url="https://gateway.example/v1",
        models={"fast": "gpt-x", "balanced": "gpt-x", "reasoning": "gpt-x", "vision": "gpt-x"},
        timeout_s=5.0,
        json_mode=False,
        stream=True,
        transport=httpx.MockTransport(handler),
    )


def quota_body(request: httpx.Request) -> httpx.Response:
    # 当天网关原话（金额就是那一刻的负余额）
    return httpx.Response(
        403,
        json={
            "error": {
                "message": "用户额度不足, 剩余额度: $-0.001488",
                "type": "new_api_error",
                "code": "insufficient_user_quota",
            }
        },
    )


def geo_body(request: httpx.Request) -> httpx.Response:
    return httpx.Response(403, json={"error": {"message": "本站不对您所在的国家及地区进行商业服务"}})


# ── 分类本身 ────────────────────────────────────────────────────────────────


def test_a_non_json_body_degrades_to_the_generic_sentence_without_raising() -> None:
    """网关挂了个 HTML 错误页也要能给人一句话——分类器不许成为第二个故障源。"""
    reason = describe_auth_failure(403, "<html>502 Bad Gateway</html>")
    assert "NEXUS_OPENAI_API_KEY" in reason
    assert "502 Bad Gateway" in reason


def test_exhausted_quota_names_the_code_and_the_cure() -> None:
    reason = describe_auth_failure(403, '{"error":{"message":"用户额度不足, 剩余额度: $-0.001488","code":"insufficient_user_quota"}}')
    assert "额度耗尽" in reason
    assert "insufficient_user_quota" in reason
    assert "换 key 没用" in reason  # 这一句就是这一片存在的理由


def test_geo_block_points_at_the_proxy_not_at_the_key() -> None:
    reason = describe_auth_failure(403, '{"error":{"message":"本站不对您所在的国家及地区进行商业服务"}}')
    assert "代理" in reason
    assert "NEXUS_OPENAI_API_KEY" not in reason


def test_a_plain_bad_token_still_says_check_the_key() -> None:
    reason = describe_auth_failure(401, '{"error":{"message":"Invalid token","code":""}}')
    assert "NEXUS_OPENAI_API_KEY" in reason
    assert "Invalid token" in reason


def test_subject_carries_through_for_the_embeddings_lane() -> None:
    reason = describe_auth_failure(403, '{"error":{"message":"nope","code":""}}', subject="embedding provider")
    assert reason.startswith("embedding provider")


# ── 两条出站路径必须给同一个诊断 ─────────────────────────────────────────────


def _fail_reason(provider: OpenAICompatibleProvider) -> str:
    try:
        provider.complete(model="gpt-x", system="ping", user="ping", json_mode=False)
    except ProviderFailed as exc:
        return str(exc)
    raise AssertionError("网关回 403，complete 不该成功")


def test_sync_and_stream_paths_agree_on_the_same_403() -> None:
    """探测走一条路、真调用走另一条：两条给出两种说法，读数迟早分叉。"""
    sync = _fail_reason(sync_provider(quota_body))
    streamed = _fail_reason(stream_provider(quota_body))
    assert sync == streamed
    assert "额度耗尽" in sync


def test_embeddings_lane_keeps_its_own_subject() -> None:
    """同一句诊断在两条链路上要自称各的：embedding 那一行说"检查 chat 的 key"是串台。"""
    provider = OpenAICompatibleEmbeddingProvider(
        api_key="sk-test-value",
        base_url="https://gateway.example/v1",
        models={"embedding": "embed-x"},
        timeout_s=5.0,
        transport=httpx.MockTransport(quota_body),
    )
    try:
        provider.embed(texts=["ping"], model="embed-x")
    except ProviderFailed as exc:
        assert "embedding provider 额度耗尽" in str(exc)
    else:
        raise AssertionError("网关回 403，embed 不该成功")
