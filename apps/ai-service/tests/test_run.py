from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ai_service.app import create_app
from ai_service.config import Settings
from ai_service.providers.registry import Registry
from conftest import CONTRACTS, FakeProvider, ai_request, client_for


def _validate(name: str, payload: dict) -> None:
    from jsonschema import Draft202012Validator

    schema = json.loads((CONTRACTS / name).read_text(encoding="utf-8"))
    errors = sorted(Draft202012Validator(schema).iter_errors(payload), key=lambda e: list(e.path))
    assert not errors, [f"{list(e.path)}: {e.message}" for e in errors]


def patch_reply(op: dict | None = None) -> str:
    op = op or {"op": "set", "nodeId": "n_headline", "path": "typography.fontSize", "value": 72}
    return json.dumps(
        {
            "patches": [{"pageId": "pg_1", "summary": "标题放大", "ops": [op]}],
            "explanation": "已把 Headline 字号改为 72。",
            "labels": ["方案 A"],
        },
        ensure_ascii=False,
    )


def test_run_requires_a_provider() -> None:
    client = TestClient(create_app(Settings(), registry=Registry(Settings())))
    response = client.post("/v1/ai/run", json=ai_request())
    assert response.status_code == 503
    body = response.json()
    _validate("ai-error.schema.json", body)
    assert body["code"] == "provider-unavailable"


def test_run_rejects_out_of_contract_request() -> None:
    client = client_for(patch_reply())
    response = client.post("/v1/ai/run", json=ai_request(prompt=""))
    assert response.status_code == 400
    assert response.json()["code"] == "validation-failed"


def test_run_returns_provider_patches() -> None:
    provider = FakeProvider(patch_reply())
    client = TestClient(create_app(Settings(), registry=Registry(Settings(), llm=provider)))
    response = client.post("/v1/ai/run", json=ai_request())
    assert response.status_code == 200
    body = response.json()
    _validate("ai-response.schema.json", body)
    assert body["capability"] == "real"
    assert body["usage"]["demoMode"] is False
    assert body["patches"][0]["ops"][0]["value"] == 72
    assert body["labels"] == ["方案 A"]
    # 上下文摘要必须真的进入提示，否则模型只能瞎猜节点
    assert "n_headline" in provider.calls[0]["user"]
    assert "color.primary" in provider.calls[0]["user"]


def test_run_fails_when_provider_returns_noise() -> None:
    client = client_for("我要开始写散文了，不是 JSON。")
    response = client.post("/v1/ai/run", json=ai_request())
    assert response.status_code == 502
    assert response.json()["code"] == "provider-failed"


def test_run_rejects_unknown_op_shape() -> None:
    client = client_for(patch_reply({"op": "explode", "nodeId": "n_headline"}))
    response = client.post("/v1/ai/run", json=ai_request())
    assert response.status_code == 502
    body = response.json()
    assert body["code"] == "validation-failed"
    assert "ops" in body["hint"] or "op" in body["hint"]


def test_dry_run_strips_patches() -> None:
    client = client_for(patch_reply())
    response = client.post("/v1/ai/run", json=ai_request(dryRun=True))
    assert response.status_code == 200
    body = response.json()
    _validate("ai-response.schema.json", body)
    assert body["patches"] == []
    assert body["explanation"].startswith("（试运行")


def test_destructive_ops_park_behind_approval() -> None:
    client = client_for(patch_reply({"op": "remove", "nodeId": "n_headline"}))
    response = client.post("/v1/ai/run", json=ai_request(approvalPolicy=["delete"]))
    assert response.status_code == 200
    body = response.json()
    _validate("ai-response.schema.json", body)
    assert body["patches"] == []
    assert body["approvals"][0]["action"] == "delete"
    assert body["error"]["code"] == "approval-required"


def test_unsupported_model_class_is_not_faked() -> None:
    client = client_for(patch_reply())
    response = client.post("/v1/ai/run", json=ai_request(modelClass="image"))
    assert response.status_code == 503
    assert response.json()["code"] == "provider-unavailable"


def test_oversized_body_rejected(tmp_path: Path) -> None:
    client = client_for(patch_reply())
    big = ai_request()
    big["context"]["document"]["pages"][0]["nodes"]["n_root"]["name"] = "x" * (7 * 1024 * 1024)
    response = client.post("/v1/ai/run", json=big)
    assert response.status_code == 413


def test_plans_from_provider_are_sanitised() -> None:
    reply = json.dumps(
        {
            "patches": [],
            "explanation": "需要两步",
            "plans": [
                {
                    "goal": "改标题",
                    "tasks": [{"id": "t1", "title": "改字号"}, {"broken": True}],
                }
            ],
        },
        ensure_ascii=False,
    )
    client = client_for(reply)
    body = client.post("/v1/ai/run", json=ai_request()).json()
    _validate("ai-response.schema.json", body)
    assert body["plans"][0]["goal"] == "改标题"
    assert [t["id"] for t in body["plans"][0]["tasks"]] == ["t1"]


@pytest.mark.parametrize("bad", [None, 42, "text"])
def test_non_object_body(bad: object) -> None:
    client = client_for(patch_reply())
    response = client.post(
        "/v1/ai/run",
        content=json.dumps(bad),
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 400
