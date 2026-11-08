from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from ai_service.app import create_app
from ai_service.config import Settings
from ai_service.providers.registry import Registry
from conftest import CONTRACTS, FakeProvider, client_for


def _validate(name: str, payload: dict) -> None:
    from jsonschema import Draft202012Validator

    schema = json.loads((CONTRACTS / name).read_text(encoding="utf-8"))
    errors = sorted(Draft202012Validator(schema).iter_errors(payload), key=lambda e: list(e.path))
    assert not errors, [f"{list(e.path)}: {e.message}" for e in errors]


def chat_request(**overrides) -> dict:
    payload = {
        "requestId": "req_chat_test",
        "system": "你是守夜人。请完全沉浸在这个角色中，用第一人称回复。",
        "user": "今晚的山口安静吗？",
        "modelClass": "balanced",
    }
    payload.update(overrides)
    return payload


def chat_client(reply: str) -> TestClient:
    provider = FakeProvider(reply)
    app = create_app(Settings(), registry=Registry(Settings(), llm=provider))
    return TestClient(app)


def test_chat_requires_a_provider() -> None:
    client = TestClient(create_app(Settings(), registry=Registry(Settings())))
    response = client.post("/v1/ai/chat", json=chat_request())
    assert response.status_code == 503
    body = response.json()
    assert body["code"] == "provider-unavailable"


def test_chat_rejects_out_of_contract_request() -> None:
    client = chat_client("守夜人答道：山口安静。")
    response = client.post("/v1/ai/chat", json=chat_request(user=""))
    assert response.status_code == 400
    assert response.json()["code"] == "validation-failed"


def test_chat_returns_provider_text() -> None:
    provider = FakeProvider("山口安静，风里没有马蹄声。")
    app = create_app(Settings(), registry=Registry(Settings(), llm=provider))
    client = TestClient(app)
    response = client.post("/v1/ai/chat", json=chat_request())
    assert response.status_code == 200
    body = response.json()
    _validate("ai-chat-response.schema.json", body)
    assert body["capability"] == "real"
    assert body["text"] == "山口安静，风里没有马蹄声。"
    assert body["usage"]["demoMode"] is False
    # 人设与用户消息必须真的进入提示，否则模型只能瞎猜角色
    assert "守夜人" in provider.calls[0]["system"]
    assert "山口安静吗" in provider.calls[0]["user"]


def test_chat_fails_when_provider_returns_empty() -> None:
    client = chat_client("   ")
    response = client.post("/v1/ai/chat", json=chat_request())
    assert response.status_code == 502
    assert response.json()["code"] == "provider-failed"


def test_chat_rejects_unknown_model_class() -> None:
    client = chat_client("不该被调用到的回复")
    response = client.post("/v1/ai/chat", json=chat_request(modelClass="embedding"))
    assert response.status_code == 503
    assert response.json()["code"] == "provider-unavailable"
