from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ai_service.app import create_app
from ai_service.config import Settings, load_settings
from conftest import CONTRACTS, FakeProvider
from ai_service.providers.llm_liveness import LlmLiveness
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
    # §162：队列没启动就如实报 none + capacity 0，并说清同步路径不受影响。
    # 以前这里是一个写死的 {"pending": 0, "running": 0} —— 等于宣称"有一个永远为空的队列"
    queue = body["queue"]
    assert queue["backend"] == "none"
    assert queue["capacity"] == 0
    assert (queue["pending"], queue["running"]) == (0, 0)
    assert "作业队列未启动" in queue["note"]
    llm = [p for p in body["providers"] if p["kind"] == "llm"][0]
    assert llm["status"] == "unavailable"
    assert "NEXUS_OPENAI_API_KEY" in llm["reason"]


def test_healthz_queue_reports_the_started_worker(monkeypatch: pytest.MonkeyPatch) -> None:
    """走 lifespan（uvicorn 正常启动就是这样）之后，backend / capacity 必须变成真的那一份。"""
    monkeypatch.delenv("NEXUS_REDIS_URL", raising=False)
    settings = Settings()
    with TestClient(create_app(settings, registry=Registry(settings, llm=FakeProvider("{}")))) as client:
        queue = client.get("/healthz").json()["queue"]
    assert queue["backend"] == "memory"
    assert queue["capacity"] >= 1
    assert "重启即失" in queue["note"]


def test_healthz_degrades_when_queue_counts_explode(monkeypatch: pytest.MonkeyPatch) -> None:
    """真实故障窗口：服务启动时 Redis 正常，跑几分钟之后 Redis 断了。

    此时 `/healthz` 是 web 每 1.5s 探测一次的热路径——Redis 抛异常绝不允许它 500，
    必须 200 + note 显式标注 counts-unavailable，pending/running 如实填 0（不编造计数）。
    """
    monkeypatch.delenv("NEXUS_REDIS_URL", raising=False)
    settings = Settings()
    app = create_app(settings, registry=Registry(settings, llm=FakeProvider("{}")))
    with TestClient(app) as client:
        state = app.state.nexus  # _State 实例（lifespan 里装配的真队列）

        async def boom() -> tuple[int, int]:
            raise ConnectionError("redis is gone")

        state.store.counts = boom  # 实例级覆盖类方法，模拟「启动时正常、现在断了」
        response = client.get("/healthz")
        assert response.status_code == 200
        queue = response.json()["queue"]
    assert (queue["pending"], queue["running"]) == (0, 0)
    assert "counts-unavailable" in queue["note"]
    assert "ConnectionError" in queue["note"]


def test_healthz_reports_probed_ok_provider_as_real() -> None:
    """llm 行是 real 的前提是"探测说网关答过"，不是"环境里有一串 key"（§AILIVE-4）。

    这里的 llm 是 FakeProvider 桩，真探测永远不会落地（`llm_prober()` 只认
    OpenAICompatibleProvider），所以把结论直接写进 liveness：
    这一臂管的是"证据成立时那一行怎么渲染"，不管"证据从哪来"（那是 test_llm_liveness.py）。
    """
    settings = Settings(openai_api_key="sk-test")
    liveness = LlmLiveness()
    liveness.record(True, "")
    client = TestClient(
        create_app(settings, registry=Registry(settings, llm=FakeProvider("{}"), llm_liveness=liveness))
    )
    body = client.get("/healthz").json()
    _validate("health.schema.json", body)
    assert body["capability"] == "real"
    llm = next(p for p in body["providers"] if p["kind"] == "llm")
    assert llm["status"] == "real"
    assert llm["reason"] == ""
    assert llm["models"]  # 探过了才把模型名报出去


def test_healthz_does_not_call_an_unprobed_llm_real() -> None:
    """钉住 2026-11-22 的读数事故：key 在、链路已死，那一行却还写 real。

    桩 provider 拿不到探测结论，所以它只能停在"未验证"——把未知写成可用，
    就是同一份 payload 里 llm=real 与 llmLive.state=failed 各说各话的那种现场。
    """
    settings = Settings(openai_api_key="sk-test")
    registry = Registry(settings, llm=FakeProvider("{}"))
    body = TestClient(create_app(settings, registry=registry)).get("/healthz").json()
    _validate("health.schema.json", body)
    llm = next(p for p in body["providers"] if p["kind"] == "llm")
    assert llm["status"] == "unavailable"
    assert "未验证" in llm["reason"]
    assert llm["models"] == []
    assert registry.text_status() == "unavailable"
    assert registry.capability() != "real"


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
