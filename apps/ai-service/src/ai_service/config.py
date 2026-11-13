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

# Provider 职责分档（§159）：文本四档归 llm，embedding 档归 embedding provider。
# 两个 provider 各拿自己那一档的表，不再把整张 models 无差别塞给对方——否则
# NEXUS_MODEL_EMBEDDING=none 这个 opt-out 哨兵会被 llm 当成"模型"上报到 /healthz，
# 用户可见的就绪块就会显示一个不存在的模型名。判据钉职责边界，不钉具体模型名。
LLM_MODEL_CLASSES = ("fast", "balanced", "reasoning", "vision")
EMBEDDING_MODEL_CLASSES = ("embedding",)

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
    # gpt-6-sol 推理模型调用 8-18k token 前缀 + 长推理链，实测 agent 路由可超 60s；默认 60s 常超时返 504
    # bump 到 180s（可用 AI_SERVICE_TIMEOUT_S 覆盖）
    request_timeout_s: float = 180.0
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    json_mode: bool = True
    models: Mapping[str, str] = field(default_factory=lambda: dict(DEFAULT_MODELS))
    # embedding 独立门：有些 provider 网关只有 chat 没有 embedding 模型（§159 不谎称能用）。
    # NEXUS_MODEL_EMBEDDING=none 时如实报 unavailable，不创建 embedding 客户端、不给出假的 "real" 就绪。
    embedding_enabled: bool = True
    # 有界出站重试（v681，镜像 Java v669a）：max_attempts=1 默认 pass-through（零回归）；
    # >1 时对 429/5xx/网络抖动做指数退避（base·2^i 封顶 cap，尊重 Retry-After）。
    llm_max_attempts: int = 1
    llm_retry_base_s: float = 0.5
    llm_retry_cap_s: float = 8.0
    # 退避抖动（v685，接 v684 组件，ADR 0117）：默认 "none" = 与 v681 字节级一致（零回归）。
    # 可选 "full"/"equal"/"decorrelated" 打破多实例同拍重试的 thundering herd；"none" 不引入随机源。
    llm_jitter_strategy: str = "none"
    # 出站断路器（v682，镜像 Java Spring Cloud DomainCircuitBreaker，ADR 0115）：
    # 默认 disabled（零回归），显式开启才在 complete() 门卫处拒门。旋钮与 Resilience4j 同名同义。
    llm_circuit_breaker_enabled: bool = False
    llm_cb_sliding_window: int = 20
    llm_cb_minimum_calls: int = 20
    llm_cb_failure_rate_threshold: float = 50.0
    llm_cb_wait_s: float = 10.0
    llm_cb_half_open_calls: int = 2
    # 流式响应（v690，ADR 0123）：**默认 True**（2026-11-13 实测门决定：本 provider 下 SSE 路径
    # 首发即 80%+ prompt 命中，plain 路径冷启 0 命中且按池轮转掉回 0）。
    # 需要 v681/v682/v685 时代的字节级非流行为（确定性、无 SSE 字节流、零回归 v681）：
    # 设 NEXUS_LLM_STREAM=0 立即退回（opt-out），ADR 0123 记下了这条决定和它的实测依据。
    llm_stream: bool = True
    # LLM completion 缓存（v690，ADR 0123）：默认关闭（零回归）；NEXUS_LLM_COMPLETION_CACHE_URL
    # 指向真 Redis 时，注册表构造真缓存层（CachedLlm + RedisLlmCompletionCache v686/ADR 0119），
    # 全集群复用一次完成。连接失败/不可用：如实不启用（不静默伪造命中率）。
    llm_cache_url: str = ""
    llm_cache_namespace: str = "nexus:llmc"
    llm_cache_ttl_s: float = 3600.0
    # 检测到但尚未实现适配器的 key：如实报告为 unavailable，不假装能调用（§159）
    unsupported_text_keys: tuple[str, ...] = ()

    @property
    def has_llm(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def llm_models(self) -> dict[str, str]:
        """只给 llm provider 的文本四档表；embedding 档不进 llm 的模型清单。"""
        return {c: self.models[c] for c in LLM_MODEL_CLASSES if c in self.models}

    @property
    def embedding_models(self) -> dict[str, str]:
        """只给 embedding provider 的档位表；文本四档不进 embedding 的模型清单。"""
        return {c: self.models[c] for c in EMBEDDING_MODEL_CLASSES if c in self.models}

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
            "embedding_enabled": self.embedding_enabled,
            "llm_max_attempts": self.llm_max_attempts,
            "llm_retry_base_s": self.llm_retry_base_s,
            "llm_retry_cap_s": self.llm_retry_cap_s,
            "llm_jitter_strategy": self.llm_jitter_strategy,
            "llm_circuit_breaker_enabled": self.llm_circuit_breaker_enabled,
            "llm_stream": self.llm_stream,
            "llm_cache_url": bool(self.llm_cache_url.strip()),
            "llm_cache_namespace": self.llm_cache_namespace,
            "llm_cache_ttl_s": self.llm_cache_ttl_s,
            "llm_cb_sliding_window": self.llm_cb_sliding_window,
            "llm_cb_minimum_calls": self.llm_cb_minimum_calls,
            "llm_cb_failure_rate_threshold": self.llm_cb_failure_rate_threshold,
            "llm_cb_wait_s": self.llm_cb_wait_s,
            "llm_cb_half_open_calls": self.llm_cb_half_open_calls,
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

    # embedding 单独的旋钮：NEXUS_MODEL_EMBEDDING=none（或 skip）= 该 provider 网关没有 embedding 模型。
    # 这不是"默认关闭"——默认（含 DEFAULT_MODELS 里的 text-embedding-3-small）保持原样。
    embedding_env = (get("NEXUS_MODEL_EMBEDDING", "") or "").strip().lower()
    embedding_enabled = embedding_env not in ("none", "skip")

    return Settings(
        host=get("AI_SERVICE_HOST", "127.0.0.1") or "127.0.0.1",
        port=int(get("AI_SERVICE_PORT", "3200") or "3200"),
        request_timeout_s=float(get("AI_SERVICE_TIMEOUT_S", "180") or "180"),
        openai_api_key=get("NEXUS_OPENAI_API_KEY"),
        openai_base_url=get("NEXUS_OPENAI_BASE_URL", "https://api.openai.com/v1")
        or "https://api.openai.com/v1",
        json_mode=(get("NEXUS_LLM_JSON_MODE", "1") or "1") != "0",
        models=models,
        unsupported_text_keys=unsupported,
        embedding_enabled=embedding_enabled,
        llm_max_attempts=max(1, int(get("NEXUS_LLM_MAX_ATTEMPTS", "1") or "1")),
        llm_retry_base_s=float(get("NEXUS_LLM_RETRY_BASE_S", "0.5") or "0.5"),
        llm_retry_cap_s=float(get("NEXUS_LLM_RETRY_CAP_S", "8") or "8"),
        llm_jitter_strategy=(get("NEXUS_LLM_JITTER_STRATEGY", "none") or "none").strip().lower(),
        llm_circuit_breaker_enabled=(get("NEXUS_LLM_CIRCUIT_BREAKER_ENABLED", "0") or "0") == "1",
    # opt-out 后：NEXUS_LLM_STREAM=0 还原字节级非流（v681/v682/v685 时代一致）
    llm_stream=(get("NEXUS_LLM_STREAM", "1") or "1") != "0",
    llm_cache_url=get("NEXUS_LLM_COMPLETION_CACHE_URL", "") or "",
    llm_cache_namespace=(get("NEXUS_LLM_COMPLETION_CACHE_NAMESPACE", "nexus:llmc") or "nexus:llmc").strip(),
    llm_cache_ttl_s=float(get("NEXUS_LLM_COMPLETION_CACHE_TTL_S", "3600") or "3600"),
        llm_cb_sliding_window=int(get("NEXUS_LLM_CB_SLIDING_WINDOW", "20") or "20"),
        llm_cb_minimum_calls=int(get("NEXUS_LLM_CB_MIN_CALLS", "20") or "20"),
        llm_cb_failure_rate_threshold=float(get("NEXUS_LLM_CB_FAILURE_RATE", "50") or "50"),
        llm_cb_wait_s=float(get("NEXUS_LLM_CB_WAIT_S", "10") or "10"),
        llm_cb_half_open_calls=int(get("NEXUS_LLM_CB_HALF_OPEN_CALLS", "2") or "2"),
    )
