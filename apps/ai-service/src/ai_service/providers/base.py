"""Provider 抽象（§76-79）：业务代码只依赖这个接口，不直接 import 任何 SDK。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


class ProviderUnavailable(Exception):
    """没有凭据 / 未实现该 provider：调用方必须报 unavailable，不得回落到 Mock 冒充真实结果（§159）。"""


class ProviderFailed(Exception):
    """远端报错或返回不可解析内容。"""


@dataclass(frozen=True)
class Completion:
    text: str
    provider: str
    model: str
    tokens_in: int
    tokens_out: int
    latency_ms: float
    # v690 增，零回归：provider 自己报的"这次命中多少已缓存的 prompt"与"推理用掉了多少 token"。
    # 默认 0：旧构造点/旧读法不感知两个新字段，解析失败或对端不报都取 0。
    cached_tokens: int = 0
    reasoning_tokens: int = 0


@dataclass(frozen=True)
class EmbeddingResult:
    vectors: list[list[float]]
    provider: str
    model: str
    tokens_in: int
    latency_ms: float


class LLMProvider(Protocol):
    kind: str
    name: str

    def models(self) -> list[str]: ...

    def complete(self, *, model: str, system: str, user: str, json_mode: bool | None = None) -> Completion: ...


class EmbeddingProvider(Protocol):
    kind: str
    name: str

    def models(self) -> list[str]: ...

    def embed(self, *, model: str, texts: list[str]) -> EmbeddingResult: ...
