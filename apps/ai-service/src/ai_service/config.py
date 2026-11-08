"""ai-service 运行配置：只从进程环境读取，key 永不入库、永不进日志（docs/SECURITY.md）。"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Mapping

MODEL_CLASS_ENV = {
    "fast": "NEXUS_MODEL_FAST",
    "balanced": "NEXUS_MODEL_BALANCED",
    "reasoning": "NEXUS_MODEL_REASONING",
    "vision": "NEXUS_MODEL_VISION",
    "embedding": "NEXUS_MODEL_EMBEDDING",
}

DEFAULT_MODELS = {
    "fast": "gpt-4o-mini",
    "balanced": "gpt-4o",
    "reasoning": "gpt-4o",
    "vision": "gpt-4o",
    "embedding": "text-embedding-3-small",
}


@dataclass(frozen=True, repr=False)
class Settings:
    service: str = "nexus-ai-service"
    version: str = "0.1.0"
    host: str = "127.0.0.1"
    port: int = 3200
    max_body_bytes: int = 6 * 1024 * 1024
    request_timeout_s: float = 60.0
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    json_mode: bool = True
    models: Mapping[str, str] = field(default_factory=lambda: dict(DEFAULT_MODELS))
    # 检测到但尚未实现适配器的 key：如实报告为 unavailable，不假装能调用（§159）
    unsupported_text_keys: tuple[str, ...] = ()

    @property
    def has_llm(self) -> bool:
        return bool(self.openai_api_key)

    def __repr__(self) -> str:
        # 配置可能被写进日志：key 一律脱敏（docs/SECURITY.md）
        masked = "***" if self.openai_api_key else None
        fields = {
            "service": self.service,
            "version": self.version,
            "host": self.host,
            "port": self.port,
            "max_body_bytes": self.max_body_bytes,
            "request_timeout_s": self.request_timeout_s,
            "openai_base_url": self.openai_base_url,
            "json_mode": self.json_mode,
            "models": dict(self.models),
            "unsupported_text_keys": self.unsupported_text_keys,
            "openai_api_key": masked,
        }
        inner = ", ".join(f"{key}={value!r}" for key, value in fields.items())
        return f"Settings({inner})"


def load_settings(environ: Mapping[str, str] | None = None) -> Settings:
    env = os.environ if environ is None else environ

    def get(name: str, default: str | None = None) -> str | None:
        value = env.get(name)
        return value.strip() if isinstance(value, str) and value.strip() else default

    models = dict(DEFAULT_MODELS)
    for model_class, var in MODEL_CLASS_ENV.items():
        configured = get(var)
        if configured:
            models[model_class] = configured

    unsupported = tuple(
        name for name in ("NEXUS_ANTHROPIC_API_KEY", "NEXUS_GOOGLE_GEMINI_API_KEY") if get(name)
    )

    return Settings(
        host=get("AI_SERVICE_HOST", "127.0.0.1") or "127.0.0.1",
        port=int(get("AI_SERVICE_PORT", "3200") or "3200"),
        request_timeout_s=float(get("AI_SERVICE_TIMEOUT_S", "60") or "60"),
        openai_api_key=get("NEXUS_OPENAI_API_KEY"),
        openai_base_url=get("NEXUS_OPENAI_BASE_URL", "https://api.openai.com/v1")
        or "https://api.openai.com/v1",
        json_mode=(get("NEXUS_LLM_JSON_MODE", "1") or "1") != "0",
        models=models,
        unsupported_text_keys=unsupported,
    )
