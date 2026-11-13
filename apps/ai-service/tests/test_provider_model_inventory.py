"""Provider 模型清单的职责不变量门（承接 ADR 0110「观察到但未钉门」的 none 哨兵）。

§159 不谎称能用：/healthz 会把每个 provider 的 `models` 原样交给 web 的就绪块渲染
（`apps/web/src/app/page.tsx` 的 `p.models.join(' / ')`）。如果 llm provider 把它不负责的
档位模型名也列进去——典型是 `NEXUS_MODEL_EMBEDDING=none` 这个 **opt-out 哨兵**——用户就会
在 "Provider readiness" 里看到 `llm · openai-compatible · gpt-6-sol / none`，把一个不存在的
模型谎列成可用。本门钉职责不变量，不钉今天恰好相等的字面值（ADR 0090/0094 X4）：

 - **职责分离**：llm provider 的模型集合 ⊆ 文本四档（fast/balanced/reasoning/vision）实际
   配置；embedding provider 的模型集合 ⊆ embedding 档。谁也不该上报对方的档位。
 - **哨兵不外泄**：任何 opt-out 哨兵（`none` / `skip`，大小写不敏感）都不该出现在 real
   provider 的上报清单里——它表示"没有这个模型"，不是模型名。

判据不钉"等于 gpt-6-sol"或"恰好 N 个"：将来换模型、加一个 chat 档、网关真支持 embedding，
只要职责不混就仍绿。变异臂用假 registry 注入越界清单，证明判据真会红（非恒绿空门）。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

import pytest
from fastapi.testclient import TestClient

from ai_service.app import create_app
from ai_service.config import DEFAULT_MODELS, Settings, load_settings
from ai_service.providers.registry import Registry

TEXT_CLASSES = ("fast", "balanced", "reasoning", "vision")
EMBEDDING_CLASS = "embedding"
OPT_OUT_SENTINELS = {"none", "skip"}


def _providers(settings: Settings, registry: Registry | None = None) -> dict[str, dict[str, Any]]:
    client = TestClient(create_app(settings, registry=registry or Registry(settings)))
    body = client.get("/healthz").json()
    return {p["kind"]: p for p in body["providers"]}


def _text_inventory(settings: Settings) -> set[str]:
    """文本四档实际配置的模型名集合（真值来源，不是门里硬编的字面）。"""
    return {str(settings.models[c]) for c in TEXT_CLASSES}


def _judge_no_opt_out_sentinel(models: list[str]) -> None:
    """任何 opt-out 哨兵都不该混入 real provider 的上报清单。"""
    leaked = [m for m in models if str(m).strip().lower() in OPT_OUT_SENTINELS]
    assert not leaked, f"opt-out 哨兵被当成模型名上报：{leaked!r}（§159 不谎称能用）"


def _judge_llm_scope(models: list[str], settings: Settings) -> None:
    """llm 上报的模型必须都来自文本四档，不得混入 embedding 等其他档位。"""
    inventory = _text_inventory(settings)
    out_of_scope = [m for m in models if m not in inventory]
    assert not out_of_scope, (
        f"llm provider 上报了非文本档模型：{out_of_scope!r}；文本档清单={sorted(inventory)}"
    )


def _judge_embedding_scope(models: list[str], settings: Settings) -> None:
    """embedding 上报的模型必须来自 embedding 档。"""
    inventory = {str(settings.models[EMBEDDING_CLASS])}
    out_of_scope = [m for m in models if m not in inventory]
    assert not out_of_scope, f"embedding provider 上报了非 embedding 档模型：{out_of_scope!r}"


# ── 真值门：用项目真实 /healthz 形状，覆盖"哨兵 opt-out"与"默认全开"两种配置 ──

def _llm_models_under(env: dict[str, str]) -> tuple[list[str], Settings]:
    settings = load_settings(env)
    reg = Registry(settings)
    infos = _providers(settings, reg)
    return infos["llm"]["models"], settings


def test_llm_inventory_excludes_opt_out_sentinel() -> None:
    """该网关无 embedding（NEXUS_MODEL_EMBEDDING=none）：llm 清单不得混入 none 哨兵。"""
    models, settings = _llm_models_under({
        "NEXUS_OPENAI_API_KEY": "synthetic-credential",
        "NEXUS_MODEL_BALANCED": "chat-model-x",
        "NEXUS_MODEL_EMBEDDING": "none",
    })
    assert settings.has_llm and not settings.embedding_enabled  # 前提
    _judge_no_opt_out_sentinel(models)
    _judge_llm_scope(models, settings)


def test_llm_inventory_excludes_skip_sentinel() -> None:
    """skip 是 none 的同义 opt-out，同样不得外泄（钉语义类，不钉单个字面）。"""
    models, settings = _llm_models_under({
        "NEXUS_OPENAI_API_KEY": "synthetic-credential",
        "NEXUS_MODEL_BALANCED": "chat-model-x",
        "NEXUS_MODEL_EMBEDDING": "skip",
    })
    _judge_no_opt_out_sentinel(models)


def test_llm_inventory_scope_when_embedding_enabled() -> None:
    """默认（含真实 embedding 档）时：llm 仍只上报文本档，不混入 embedding 模型名。"""
    models, settings = _llm_models_under({
        "NEXUS_OPENAI_API_KEY": "synthetic-credential",
        "NEXUS_MODEL_BALANCED": "chat-model-x",
        "NEXUS_MODEL_EMBEDDING": "embedding-model-y",
    })
    assert settings.embedding_enabled is True  # 前提
    _judge_no_opt_out_sentinel(models)
    _judge_llm_scope(models, settings)


def test_embedding_inventory_scope() -> None:
    """embedding provider（当启用时）只上报 embedding 档模型名。"""
    settings = load_settings({
        "NEXUS_OPENAI_API_KEY": "synthetic-credential",
        "NEXUS_MODEL_BALANCED": "chat-model-x",
        "NEXUS_MODEL_EMBEDDING": "embedding-model-y",
    })
    reg = Registry(settings)
    assert reg.embedding is not None  # 前提
    models = [p.models for p in reg.providers() if p.kind == "embedding"][0]
    _judge_embedding_scope(models, settings)


# ── 变异臂（恒跑，证明判据有牙；注入越界清单，不改生产）──────────────────

def test_arm_sentinel_in_inventory_goes_red() -> None:
    """臂1：清单里混进 none 哨兵 → 哨兵判据必须红。"""
    with pytest.raises(AssertionError, match="哨兵"):
        _judge_no_opt_out_sentinel(["chat-model-x", "none"])


def test_arm_llm_reports_embedding_model_goes_red() -> None:
    """臂2：llm 混入 embedding 档模型（职责串台）→ 职责判据必须红。"""
    settings = load_settings({
        "NEXUS_OPENAI_API_KEY": "synthetic-credential",
        "NEXUS_MODEL_BALANCED": "chat-model-x",
        "NEXUS_MODEL_EMBEDDING": "embedding-model-y",
    })
    with pytest.raises(AssertionError, match="非文本档"):
        _judge_llm_scope(["chat-model-x", "embedding-model-y"], settings)


def test_arm_legitimate_rename_stays_green() -> None:
    """正向对照：换一个合法 chat 模型名（清单随配置变）→ 职责判据仍绿，门不钉字面。"""
    settings = load_settings({
        "NEXUS_OPENAI_API_KEY": "synthetic-credential",
        "NEXUS_MODEL_BALANCED": "a-brand-new-chat-model",
        "NEXUS_MODEL_EMBEDDING": "none",
    })
    _judge_llm_scope(["a-brand-new-chat-model"], settings)  # 不红 = 门不惩罚正当改名
