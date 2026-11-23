from __future__ import annotations

from fastapi.testclient import TestClient

from ai_service.app import create_app
from ai_service.config import Settings, load_settings
from conftest import FakeProvider
from ai_service.providers.llm_liveness import LlmLiveness
from ai_service.providers.registry import Registry


def test_embedding_none_gate_marks_embedding_unavailable_honestly() -> None:
    """NEXUS_MODEL_EMBEDDING=none: embedding 必须如实报 unavailable，不谎称 real。"""
    settings = Settings(openai_api_key="sk-test", embedding_enabled=False)
    # llm 那一行要 real 得有探测结论背书（§AILIVE-4）；这一臂的主角是 embedding 行，
    # 所以把 llm 的证据直接写好，免得两条链路的读数在同一臂里互相遮掩。
    llm_liveness = LlmLiveness()
    llm_liveness.record(True, "")
    body = TestClient(
        create_app(
            settings,
            registry=Registry(settings, llm=FakeProvider("{}"), llm_liveness=llm_liveness),
        )
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
