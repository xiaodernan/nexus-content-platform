"""Provider 注册表：配置决定"有没有适配器"，探测决定"这条模型真的在不在"，绝不把"没验证"说成"能用"（§159）。"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..config import Settings
from .liveness import EmbeddingLiveness, EmbeddingProber
from .openai_compatible import OpenAICompatibleProvider, OpenAICompatibleEmbeddingProvider


@dataclass(frozen=True)
class ProviderInfo:
    kind: str
    name: str
    status: str  # real | demo | unavailable
    models: list[str] = field(default_factory=list)
    reason: str = ""


from typing import Final

_UNSET: Final = object()  # ⊥：调用方没传这一项（保持按 key 自动构造）；显式 None = 故意不要适配器


class Registry:
    def __init__(
        self,
        settings: Settings,
        *,
        llm: OpenAICompatibleProvider | None | object = _UNSET,
        embedding: OpenAICompatibleEmbeddingProvider | None | object = _UNSET,
        liveness: EmbeddingLiveness | None = None,
    ) -> None:
        self._settings = settings
        self._liveness = liveness or EmbeddingLiveness()
        self._llm = (
            (
                OpenAICompatibleProvider(
                    api_key=settings.openai_api_key or "",
                    base_url=settings.openai_base_url,
                    models=settings.models,
                    timeout_s=settings.request_timeout_s,
                    json_mode=settings.json_mode,
                    prompt_cache_key=settings.openai_prompt_cache_key,
                )
                if settings.has_llm
                else None
            )
            if llm is _UNSET
            else llm  # type: ignore[assignment]
        )
        self._embedding = (
            (
                OpenAICompatibleEmbeddingProvider(
                    api_key=settings.openai_api_key or "",
                    base_url=settings.openai_base_url,
                    models=settings.models,
                    timeout_s=settings.request_timeout_s,
                )
                if settings.has_llm
                else None
            )
            if embedding is _UNSET
            else embedding  # type: ignore[assignment]
        )

    @property
    def llm(self):
        return self._llm

    @property
    def embedding(self):
        return self._embedding

    @property
    def liveness(self) -> EmbeddingLiveness:
        """探测结论的所有者：app 在启动时与 /healthz 里刷新它，报告只读它。"""
        return self._liveness

    def embedding_prober(self) -> EmbeddingProber | None:
        if not self._embedding:
            return None
        return EmbeddingProber(self._embedding)

    def text_status(self) -> str:
        return "real" if self._llm else "unavailable"

    def embedding_status(self) -> str:
        """
        配了 key 只说明适配器能构造出来，不说明这条模型在网关上活着。
        所以这里三档：探到过 → real；探到失败 → unavailable（带网关原话）；没探过 → unavailable，
        并写明"未验证"——把未知说成可用，就是 healthz 对着一个 model_not_found 报 real 的那种读数。
        """
        if not self._embedding:
            return "unavailable"
        return "real" if self._liveness.state == "ok" else "unavailable"

    def embedding_reason(self) -> str:
        if not self._embedding:
            return "缺少 NEXUS_OPENAI_API_KEY"
        if self._liveness.state == "unknown":
            return "未验证：还没对真实 embeddings 探过一次"
        return self._liveness.reason

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
            infos.append(
                ProviderInfo(
                    "embedding",
                    self._embedding.name,
                    self.embedding_status(),
                    self._embedding.models() if self.embedding_status() == "real" else [],
                    self.embedding_reason(),
                )
            )
        else:
            infos.append(ProviderInfo("embedding", "openai-compatible", "unavailable", [], self.embedding_reason()))
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
