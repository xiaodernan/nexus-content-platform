"""Provider 注册表：按配置决定能力状态，绝不把"没实现"说成"能用"（§159）。"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..config import Settings
from .openai_compatible import OpenAICompatibleProvider, OpenAICompatibleEmbeddingProvider


@dataclass(frozen=True)
class ProviderInfo:
    kind: str
    name: str
    status: str  # real | demo | unavailable
    models: list[str] = field(default_factory=list)
    reason: str = ""


class Registry:
    def __init__(
        self,
        settings: Settings,
        *,
        llm: OpenAICompatibleProvider | None = None,
        embedding: OpenAICompatibleEmbeddingProvider | None = None,
    ) -> None:
        self._settings = settings
        self._llm = llm or (
            OpenAICompatibleProvider(
                api_key=settings.openai_api_key or "",
                base_url=settings.openai_base_url,
                models=settings.models,
                timeout_s=settings.request_timeout_s,
                json_mode=settings.json_mode,
            )
            if settings.has_llm
            else None
        )
        self._embedding = embedding or (
            OpenAICompatibleEmbeddingProvider(
                api_key=settings.openai_api_key or "",
                base_url=settings.openai_base_url,
                models=settings.models,
                timeout_s=settings.request_timeout_s,
            )
            if settings.has_llm
            else None
        )

    @property
    def llm(self):
        return self._llm

    @property
    def embedding(self):
        return self._embedding

    def text_status(self) -> str:
        return "real" if self._llm else "unavailable"

    def embedding_status(self) -> str:
        return "real" if self._embedding else "unavailable"

    def providers(self) -> list[ProviderInfo]:
        infos: list[ProviderInfo] = []
        if self._llm:
            infos.append(
                ProviderInfo("llm", self._llm.name, "real", self._llm.models(), "")
            )
        else:
            infos.append(ProviderInfo("llm", "openai-compatible", "unavailable", [], "缺少 NEXUS_OPENAI_API_KEY"))
        for name in self._settings.unsupported_text_keys:
            infos.append(
                ProviderInfo("llm", name, "unavailable", [], "检测到 key，但尚未实现该 provider 适配器")
            )
        if self._embedding:
            infos.append(ProviderInfo("embedding", self._embedding.name, "real", self._embedding.models(), ""))
        else:
            infos.append(ProviderInfo("embedding", "openai-compatible", "unavailable", [], "缺少 NEXUS_OPENAI_API_KEY"))
        infos.append(ProviderInfo("image", "none", "unavailable", [], "M2 图像切片未实现"))
        infos.append(ProviderInfo("video", "none", "unavailable", [], "M5 视频切片未实现"))
        infos.append(ProviderInfo("speech", "none", "unavailable", [], "未实现"))
        return infos

    def capability(self) -> str:
        statuses = {p.status for p in self.providers()}
        if "real" in statuses:
            return "real"
        if "demo" in statuses:
            return "demo"
        return "unavailable"
