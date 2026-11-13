"""Provider 注册表：配置决定"有没有适配器"，探测决定"这条模型真的在不在"，绝不把"没验证"说成"能用"（§159）。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ..cache_telemetry import CacheTelemetry
from ..config import Settings
from ..resilience import BreakerConfig, CircuitBreaker
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
        # §CACHE-2：缓存读数挂在 Registry 上而不是模块全局——每个 app 一份，测试之间天然隔离。
        # 两个数：前缀复用率（我们自己的字节算的）与 provider 报账覆盖度（报没报 cached）。
        self._cache_telemetry = CacheTelemetry()
        # v682 断路器：默认 disabled（不构造、零回归）；显式开启才建实例并真注入 provider，
        # 让 complete() 的门卫真的读它——避开 Java 坑①"配了 YAML 却没人取用、静默跑默认值"。
        # Settings 旋钮经 BreakerConfig 真变成运行实例，不是摆设（ADR 0095 声称必须有门读）。
        breaker = (
            CircuitBreaker(
                BreakerConfig(
                    name="llm-upstream",
                    sliding_window_size=settings.llm_cb_sliding_window,
                    minimum_number_of_calls=settings.llm_cb_minimum_calls,
                    failure_rate_threshold=settings.llm_cb_failure_rate_threshold,
                    wait_duration_in_open_state_s=settings.llm_cb_wait_s,
                    permitted_calls_in_half_open=settings.llm_cb_half_open_calls,
                )
            )
            if settings.llm_circuit_breaker_enabled
            else None
        )
        self._breaker = breaker
        if llm is _UNSET:
            self._llm = self._build_llm(settings, breaker) if settings.has_llm else None
        else:
            self._llm = llm  # type: ignore[assignment]
        if embedding is _UNSET:
            self._embedding = (
                OpenAICompatibleEmbeddingProvider(
                    api_key=settings.openai_api_key or "",
                    base_url=settings.openai_base_url,
                    models=settings.embedding_models,
                    timeout_s=settings.request_timeout_s,
                )
                if settings.has_llm and settings.embedding_enabled
                else None
            )
        else:
            self._embedding = embedding  # type: ignore[assignment]
        self._embedding_disabled_reason = (
            "NEXUS_MODEL_EMBEDDING=none -- 该 provider 网关没有 embedding 模型（§159 不谎称可用）"
            if not settings.embedding_enabled
            else "缺少 NEXUS_OPENAI_API_KEY"
        )

    @staticmethod
    def _build_llm(settings: Settings, breaker) -> OpenAICompatibleProvider:
        provider = OpenAICompatibleProvider(
            api_key=settings.openai_api_key or "",
            base_url=settings.openai_base_url,
            models=settings.llm_models,
            timeout_s=settings.request_timeout_s,
            json_mode=settings.json_mode,
            prompt_cache_key=settings.openai_prompt_cache_key,
            max_attempts=settings.llm_max_attempts,
            base_s=settings.llm_retry_base_s,
            cap_s=settings.llm_retry_cap_s,
            jitter_strategy=settings.llm_jitter_strategy,
            breaker=breaker,
            stream=settings.llm_stream,
        )
        url = settings.llm_cache_url.strip()
        if not url:
            return provider
        # opt-in 真 Redis 缓存（ADR 0119 / v686）：CachedLlm 只在 miss 时调内层真 provider；
        # 命中不再花钱也不进 usage（如响应报文的 usage 契约保持 exactly-not-谎称）。
        # 连接失效：fail-open——缓存故障不许打挂 provider 路径（ADR 0119 降级纪律）。
        try:
            import redis as _redis

            from ..completion_cache import CachedLlm
            from ..redis_completion_cache import RedisLlmCompletionCache

            client = _redis.from_url(url, decode_responses=True)
            cache = RedisLlmCompletionCache(
                client,
                namespace=settings.llm_cache_namespace,
                ttl_s=settings.llm_cache_ttl_s,
                max_entries=512,
            )
            return CachedLlm(provider, cache)  # type: ignore[return-value]
        except Exception as exc:  # noqa: BLE001 - 缓存组件失败必须不影响主路径
            print(f"[registry] LLM completion cache 未启用：无法连接 {url}（{exc.__class__.__name__}）")
            return provider

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
            infos.append(ProviderInfo("embedding", "openai-compatible", "unavailable", [], self._embedding_disabled_reason))
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

    def cache_telemetry(self) -> CacheTelemetry:
        """§CACHE-2 的缓存读数（前缀复用 + provider 报账覆盖度）。

        它不进 `/healthz`：healthz 有 1.5s 预算、被 web 每次探测，读数属于运维面，
        放独立端点 `/v1/ai/cache-stats`，由需要的人来读。
        """
        return self._cache_telemetry

    def llm_cache_state(self) -> dict[str, Any] | None:
        """应用级 LLM 完成缓存的报文状态（可观测性面板读用）。

        缓存由 `CachedLlm` 装在内部 provider 前面；`cache` 属性暴露。
        没启用缓存 → `None`；`/healthz` 据此报 `null`。
        """
        cache = getattr(self._llm, "cache", None) if self._llm is not None else None
        if cache is None:
            return None
        stats_fn = getattr(cache, "stats", None)
        if not callable(stats_fn):
            return None
        try:
            s = stats_fn()
        except Exception:
            return {"enabled": True, "degraded": True}
        #  both backends expose hits/misses/stores/evictions and hit_rate;
        #  Redis 版额外带 stores_failed/expirations/corruptions/shared/namespace/max_entries/ttl_s；内存版没有
        state: dict[str, Any] = {
            "enabled": True,
            "backend": "redis" if "redis" in type(cache).__name__.lower() else "memory",
            "hits": int(getattr(s, "hits", 0)),
            "misses": int(getattr(s, "misses", 0)),
            "stores": int(getattr(s, "stores", 0)),
            "stores_failed": int(getattr(s, "stores_failed", 0)),
            "evictions": int(getattr(s, "evictions", 0)),
            "hit_rate": float(getattr(s, "hit_rate", 0.0)),
            "shared": bool(getattr(s, "shared", False)),
            "degraded": bool(getattr(s, "degraded", False)),
            "namespace": str(getattr(s, "namespace", "")),
        }
        return state
