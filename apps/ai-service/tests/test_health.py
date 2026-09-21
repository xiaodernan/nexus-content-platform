from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ai_service.app import create_app
from ai_service.config import Settings, load_settings
from conftest import CONTRACTS, FakeProvider
from ai_service.providers.registry import Registry


def _validate(name: str, payload: dict) -> None:
    from jsonschema import Draft202012Validator

    schema = json.loads((CONTRACTS / name).read_text(encoding="utf-8"))
    errors = sorted(Draft202012Validator(schema).iter_errors(payload), key=lambda e: list(e.path))
    assert not errors, [f"{list(e.path)}: {e.message}" for e in errors]


def test_healthz_matches_contract() -> None:
    client = TestClient(create_app(Settings(), registry=Registry(Settings())))
    body = client.get("/healthz").json()
    _validate("health.schema.json", body)
    assert body["capability"] == "unavailable"
    assert body["queue"] == {"pending": 0, "running": 0}
    llm = [p for p in body["providers"] if p["kind"] == "llm"][0]
    assert llm["status"] == "unavailable"
    assert "NEXUS_OPENAI_API_KEY" in llm["reason"]


def test_healthz_reports_configured_provider_as_real() -> None:
    settings = Settings(openai_api_key="sk-test")
    client = TestClient(create_app(settings, registry=Registry(settings, llm=FakeProvider("{}"))))
    body = client.get("/healthz").json()
    _validate("health.schema.json", body)
    assert body["capability"] == "real"


def test_healthz_marks_detected_but_unsupported_keys_unavailable() -> None:
    settings = Settings(unsupported_text_keys=("NEXUS_ANTHROPIC_API_KEY",))
    client = TestClient(create_app(settings, registry=Registry(settings)))
    names = {p["name"] for p in client.get("/healthz").json()["providers"]}
    assert "NEXUS_ANTHROPIC_API_KEY" in names


def test_settings_repr_masks_key() -> None:
    assert "sk-secret" not in repr(Settings(openai_api_key="sk-secret"))
    assert "'***'" in repr(Settings(openai_api_key="sk-secret"))


def test_load_settings_reads_env() -> None:
    settings = load_settings(
        {
            "NEXUS_OPENAI_API_KEY": "sk-from-env",
            "NEXUS_MODEL_BALANCED": "custom-model",
            "NEXUS_ANTHROPIC_API_KEY": "sk-anthropic",
            "AI_SERVICE_PORT": "3300",
        }
    )
    assert settings.has_llm is True
    assert settings.models["balanced"] == "custom-model"
    assert settings.port == 3300
    # 检测到但没适配器的 key 必须被如实登记
    assert settings.unsupported_text_keys == ("NEXUS_ANTHROPIC_API_KEY",)


def test_missing_contract_file_fails_loudly(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_CONTRACT_DIR", str(tmp_path))
    import ai_service.contract as contract

    contract.validator.cache_clear()
    with pytest.raises(contract.ContractMissing):
        contract.issues("ai-request.schema.json", {})
    contract.validator.cache_clear()
