"""OpenAI 兼容 chat/completions 适配器（真实调用，capability = real）。
§49 embedding 切片：同一接口兼容 OpenAI / Azure / 本地兼容层。

只走 HTTP，不引 SDK；`transport` 参数是给测试注入 httpx.MockTransport 用的。
"""

from __future__ import annotations

import time
from typing import Mapping

import httpx

from .base import Completion, EmbeddingResult, ProviderFailed


class OpenAICompatibleProvider:
    kind = "llm"
    name = "openai-compatible"

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        models: Mapping[str, str],
        timeout_s: float = 60.0,
        json_mode: bool = True,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._models = dict(models)
        self._json_mode = json_mode
        self._client = httpx.Client(
            base_url=base_url,
            timeout=timeout_s,
            transport=transport,
            headers={"authorization": f"Bearer {api_key}"},
        )

    def models(self) -> list[str]:
        return sorted(set(self._models.values()))

    def model_for(self, model_class: str) -> str:
        model = self._models.get(model_class)
        if not model:
            raise ProviderFailed(f"未配置 {model_class} 档模型")
        return model

    def complete(self, *, model: str, system: str, user: str) -> Completion:
        body: dict = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
        }
        if self._json_mode:
            body["response_format"] = {"type": "json_object"}

        started = time.perf_counter()
        try:
            response = self._client.post("chat/completions", json=body)
        except httpx.HTTPError as exc:
            raise ProviderFailed(f"provider 网络失败：{exc.__class__.__name__}") from exc
        latency_ms = (time.perf_counter() - started) * 1000

        if response.status_code in (401, 403):
            raise ProviderFailed("provider 拒绝了凭据（401/403），检查 NEXUS_OPENAI_API_KEY")
        if response.status_code >= 400:
            detail = response.text[:400].replace("\n", " ")
            raise ProviderFailed(f"provider 返回 {response.status_code}：{detail}")

        try:
            payload = response.json()
            choice = payload["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderFailed("provider 响应缺少 choices[0].message.content") from exc

        usage = payload.get("usage") or {}
        return Completion(
            text=choice or "",
            provider=self.name,
            model=payload.get("model") or model,
            tokens_in=int(usage.get("prompt_tokens") or 0),
            tokens_out=int(usage.get("completion_tokens") or 0),
            latency_ms=round(latency_ms, 1),
        )

    def close(self) -> None:
        self._client.close()


class OpenAICompatibleEmbeddingProvider:
    """OpenAI 兼容 embeddings 适配器（§49 embedding 切片）。

    兼容 `/v1/embeddings` 端点，返回 `EmbeddingResult`。"""
    kind = "embedding"
    name = "openai-compatible"

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        models: Mapping[str, str],
        timeout_s: float = 60.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._models = dict(models)
        self._client = httpx.Client(
            base_url=base_url,
            timeout=timeout_s,
            transport=transport,
            headers={"authorization": f"Bearer {api_key}"},
        )

    def models(self) -> list[str]:
        return sorted(set(self._models.values()))

    def model_for(self, model_class: str) -> str:
        model = self._models.get(model_class)
        if not model:
            raise ProviderFailed(f"未配置 {model_class} 档 embedding 模型")
        return model

    def embed(self, *, model: str, texts: list[str]) -> EmbeddingResult:
        if not texts:
            return EmbeddingResult(
                vectors=[],
                provider=self.name,
                model=model,
                tokens_in=0,
                latency_ms=0.0,
            )
        body: dict = {"model": model, "input": texts}
        started = time.perf_counter()
        try:
            response = self._client.post("embeddings", json=body)
        except httpx.HTTPError as exc:
            raise ProviderFailed(f"embedding provider 网络失败：{exc.__class__.__name__}") from exc
        latency_ms = (time.perf_counter() - started) * 1000

        if response.status_code in (401, 403):
            raise ProviderFailed("embedding provider 拒绝了凭据（401/403），检查 NEXUS_OPENAI_API_KEY")
        if response.status_code >= 400:
            detail = response.text[:400].replace("\n", " ")
            raise ProviderFailed(f"embedding provider 返回 {response.status_code}：{detail}")

        try:
            payload = response.json()
            data = payload["data"]
            vectors = [item["embedding"] for item in data]
            usage = payload.get("usage") or {}
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderFailed("embedding provider 响应缺少 data[].embedding") from exc

        return EmbeddingResult(
            vectors=vectors,
            provider=self.name,
            model=payload.get("model") or model,
            tokens_in=int(usage.get("prompt_tokens") or 0),
            latency_ms=round(latency_ms, 1),
        )

    def close(self) -> None:
        self._client.close()
