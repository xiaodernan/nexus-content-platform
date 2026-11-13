from __future__ import annotations

from fastapi.testclient import TestClient

from ai_service.app import create_app
from ai_service.config import Settings, load_settings
from conftest import FakeProvider
from ai_service.providers.registry import Registry


def test_embedding_none_gate_marks_embedding_unavailable_honestly() -> None:
    """NEXUS_MODEL_EMBEDDING=none: embedding 必须如实报 unavailable，不谎称 real。"""
    settings = Settings(openai_api_key="sk-test", embedding_enabled=False)
    body = TestClient(
        create_app(settings, registry=Registry(settings, llm=FakeProvider("{}")))
    ).get("/healthz").json()

    emb = [p for p in body["providers"] if p["kind"] == "embedding"][0]
    assert emb["status"] == "unavailable"
    assert "没有 embedding 模型" in emb["reason"]

    # 能力面汇总时 embedding 不出场，但 llm 就绪仍是 real（web 按 llm 决定 real/demo）
    llm = [p for p in body["providers"] if p["kind"] == "llm"][0]
    assert llm["status"] == "real"
    assert body["capability"] == "real"


def test_embedding_unavailable_env_flip_actually_reaches_settings() -> None:
    settings = load_settings(
        {
            "NEXUS_OPENAI_API_KEY": "sk-from-env",
            "NEXUS_MODEL_EMBEDDING": "none",
        }
    )
    assert settings.embedding_enabled is False
    assert settings.has_llm is True


def test_embedding_default_stays_enabled_when_knob_absent() -> None:
    settings = load_settings({"NEXUS_OPENAI_API_KEY": "sk-from-env"})
    assert settings.embedding_enabled is True
