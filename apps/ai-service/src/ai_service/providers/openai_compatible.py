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
        prompt_cache_key: str | None = None,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._models = dict(models)
        self._json_mode = json_mode
        self._prompt_cache_key = prompt_cache_key
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

    def complete(self, *, model: str, system: str, user: str, json_mode: bool | None = None) -> Completion:
        body: dict = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
        }
        want_json = json_mode if json_mode is not None else self._json_mode
        if want_json:
            body["response_format"] = {"type": "json_object"}
        if self._prompt_cache_key:
            # OpenAI 官方 prompt_cache_key：把同一 workload 的补丁式请求钉到同一分片，命中自动提示缓存
            # （wkapi.pro 实测：不给 key 时 cached_tokens 恒为 0；给了后一次调用 5376/5603 tokens 命中）
            body["prompt_cache_key"] = self._prompt_cache_key

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
        prompt_details = usage.get("prompt_tokens_details") or {}
        cached_tokens = (
            prompt_details.get("cached_tokens")
            if isinstance(prompt_details, dict)
            else None
        )
        # DeepSeek 风格的位置：见其官方文档（prompt_cache_hit_tokens）
        cached_tokens = cached_tokens if cached_tokens is not None else usage.get("prompt_cache_hit_tokens")
        return Completion(
            text=choice or "",
            provider=self.name,
            model=payload.get("model") or model,
            tokens_in=int(usage.get("prompt_tokens") or 0),
            tokens_out=int(usage.get("completion_tokens") or 0),
            latency_ms=round(latency_ms, 1),
            cached_tokens=int(cached_tokens or 0),
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
