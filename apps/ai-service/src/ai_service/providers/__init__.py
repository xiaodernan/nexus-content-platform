"""Provider 抽象与实现。业务代码只依赖 base.LLMProvider / base.EmbeddingProvider 协议（§76-79, §49）。"""

from .base import (
    ProviderUnavailable,
    ProviderFailed,
    Completion,
    EmbeddingResult,
    LLMProvider,
    EmbeddingProvider,
)
from .openai_compatible import OpenAICompatibleProvider, OpenAICompatibleEmbeddingProvider

__all__ = [
    "ProviderUnavailable",
    "ProviderFailed",
    "Completion",
    "EmbeddingResult",
    "LLMProvider",
    "EmbeddingProvider",
    "OpenAICompatibleProvider",
    "OpenAICompatibleEmbeddingProvider",
]