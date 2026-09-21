from __future__ import annotations

import json

import httpx
import pytest

from ai_service.providers.base import ProviderFailed
from ai_service.providers.openai_compatible import OpenAICompatibleProvider

MODELS = {"fast": "small", "balanced": "gpt-x", "reasoning": "gpt-x"}


def make(handler, **overrides) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        api_key="sk-test-value",
        base_url="https://provider.example/v1",
        models=MODELS,
        transport=httpx.MockTransport(handler),
        **overrides,
    )


def test_complete_posts_chat_completions_and_maps_usage() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "model": "gpt-x-2026",
                "choices": [{"message": {"content": '{"patches":[]}'}}],
                "usage": {"prompt_tokens": 5, "completion_tokens": 6},
            },
        )

    completion = make(handler).complete(model="gpt-x", system="sys", user="usr")
    assert seen["url"] == "https://provider.example/v1/chat/completions"
    assert seen["auth"] == "Bearer sk-test-value"
    assert seen["body"]["response_format"] == {"type": "json_object"}
    assert [m["role"] for m in seen["body"]["messages"]] == ["system", "user"]
    assert completion.text == '{"patches":[]}'
    assert completion.model == "gpt-x-2026"
    assert (completion.tokens_in, completion.tokens_out) == (5, 6)


def test_json_mode_can_be_disabled() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})

    make(handler, json_mode=False).complete(model="gpt-x", system="s", user="u")
    assert "response_format" not in seen["body"]


def test_auth_failure_message_never_leaks_the_key() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text="bad key")

    with pytest.raises(ProviderFailed) as exc:
        make(handler).complete(model="gpt-x", system="s", user="u")
    assert "sk-test-value" not in str(exc.value)
    assert "401" in str(exc.value)


def test_server_error_detail_is_truncated() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="x" * 5000)

    with pytest.raises(ProviderFailed) as exc:
        make(handler).complete(model="gpt-x", system="s", user="u")
    assert len(str(exc.value)) < 600


def test_malformed_success_payload_is_a_provider_failure() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": []})

    with pytest.raises(ProviderFailed):
        make(handler).complete(model="gpt-x", system="s", user="u")


def test_network_error_is_a_provider_failure() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom")

    with pytest.raises(ProviderFailed):
        make(handler).complete(model="gpt-x", system="s", user="u")


def test_model_for_rejects_unknown_class() -> None:
    provider = make(lambda request: httpx.Response(200))
    assert provider.model_for("balanced") == "gpt-x"
    with pytest.raises(ProviderFailed):
        provider.model_for("image")
