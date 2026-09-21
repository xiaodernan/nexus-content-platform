"""Provider 注册表：按配置决定能力状态，绝不把"没实现"说成"能用"（§159）。"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..config import Settings
from .openai_compatible import OpenAICompatibleProvider


@dataclass(frozen=True)
class ProviderInfo:
    kind: str
    name: str
    status: str  # real | demo | unavailable
    models: list[str] = field(default_factory=list)
    reason: str = ""


class Registry:
    def __init__(self, settings: Settings, *, llm: OpenAICompatibleProvider | None = None) -> None:
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

    @property
    def llm(self) -> OpenAICompatibleProvider | None:
        return self._llm

    def text_status(self) -> str:
        return "real" if self._llm else "unavailable"

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
        infos.append(ProviderInfo("embedding", "none", "unavailable", [], "RAG 切片未实现"))
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
