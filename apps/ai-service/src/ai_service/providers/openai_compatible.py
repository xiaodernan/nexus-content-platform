"""OpenAI 兼容 chat/completions 适配器（真实调用，capability = real）。
§49 embedding 切片：同一接口兼容 OpenAI / Azure / 本地兼容层。

只走 HTTP，不引 SDK；`transport` 参数是给测试注入 httpx.MockTransport 用的。
"""

from __future__ import annotations

import json
import random
import time
from typing import Any, Callable, Mapping

import httpx

from ..jitter import jittered_backoff
from ..latency_meter import LLM_LATENCY
from .base import Completion, EmbeddingResult, ProviderFailed

# 有界重试（v681，镜像 Java v669a DomainServiceRetry）：只有这些**瞬时**状态值得再问一次。
# 401/403 凭据、400/404/422 请求本身错都**不在**此列——"404 is an answer"，重试只浪费配额、
# 放大攻击面。429 限流与 5xx 服务端抖动是真瞬时；网络类异常单独在重试循环里判。
_RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


class TransientProviderFailed(ProviderFailed):
    """**瞬时**失败（重试耗尽的 429/5xx/网络）——断路器据此 `record_failure`（v682）。

    确定性失败（401/403/400/404/422、畸形 payload）仍抛基类 `ProviderFailed`，
    断路器走 `record_ignored`——"404 is an answer"，健康服务不该被自己的答案熔断。
    子类让"哪类失败算熔断"由**类型**表达，门与臂共用同一个判别，不靠解析错误文本。
    """


def _retry_after_seconds(value: str | None) -> float | None:
    """解析 Retry-After（秒）；无效/缺省返回 None，交给指数退避，不因坏头崩掉。"""
    if not value:
        return None
    try:
        seconds = float(value.strip())
    except (TypeError, ValueError):
        return None
    return seconds if seconds >= 0 else None


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
        max_attempts: int = 1,
        base_s: float = 0.5,
        cap_s: float = 8.0,
        sleep: Callable[[float], None] | None = None,
        clock: Callable[[], float] | None = None,
        breaker=None,
        jitter_strategy: str = "none",
        rng: Callable[[float, float], float] | None = None,
        stream: bool = False,
    ) -> None:
        """`max_attempts=1`（默认）= pass-through，与 v681 前字节级一致（零回归）。
        >1 时启用有界指数退避：`base_s·2^i` 封顶 `cap_s`，429 的 `Retry-After` 优先。
        `sleep`/`clock` 可注入，供门确定性验证退避与总墙钟，生产不传。

        `breaker`（v682，可选）：注入 `CircuitBreaker` 才启用拒门；默认 `None` 时
        `complete()` 与 v681 字节级一致（不建门、不上报、不改变异常类型）——零回归。
        用鸭子类型而非 import 以避免 providers↔resilience 的循环依赖。

        `jitter_strategy`（v685，接 v684 组件，ADR 0117）：默认 `"none"` = 确定性退避，
        与 v681 字节级一致（不引入随机源）；`"full"/"equal"/"decorrelated"` 把退避时刻打散，
        打破多实例同拍重试的 thundering herd。`rng` 可注入（签名 `(lo,hi)->float`）以确定性
        验证；生产传 `None` 用 `random.uniform`。`decorrelated` 跨 attempt 跟踪上次 sleep。
        """
        if max_attempts < 1:
            raise ValueError("max_attempts 必须 >= 1（1=不重试，pass-through）")
        self._models = dict(models)
        self._json_mode = json_mode
        self._max_attempts = max_attempts
        self._base_s = base_s
        self._cap_s = cap_s
        self._sleep = sleep or time.sleep
        self._clock = clock or time.monotonic
        self._breaker = breaker
        self._jitter_strategy = jitter_strategy
        self._rng = rng
        self._stream = bool(stream)
        self._last_sleep = None
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

    def _backoff(self, attempt: int, retry_after: str | None) -> float:
        """第 attempt 次失败后的等待：指数退避封顶；429 的 Retry-After 优先（取较大者）。

        v685：改走 v684 的 `jittered_backoff` 单一真值——`jitter_strategy="none"` 时返回
        `max(指数, Retry-After)`（与 v681 字节级一致，零回归）；其余策略把区间按 bounds()
        抬到 `[lo,hi]` 并随机采样，打散同拍重试。`decorrelated` 需要上次 sleep 作为 prev，
        故每次采样后存 `self._last_sleep`，下一拍复用（一个 `complete()` 是一次逻辑请求，
        故 `complete()` 开头重置）。
        """
        server = _retry_after_seconds(retry_after)
        value = jittered_backoff(
            attempt,
            base=self._base_s,
            cap=self._cap_s,
            strategy=self._jitter_strategy,
            rng=self._rng or random.uniform,
            prev_sleep=self._last_sleep,
            retry_after=server,
        )
        self._last_sleep = value
        return value

    @staticmethod
    def _usage_details(usage: Mapping[str, Any] | None) -> tuple[int, int]:
        """provider 自己报的 cached / reasoning token 数（可能都不报，都取 0）。"""
        u = usage or {}
        pin = u.get("prompt_tokens_details") or {}
        cout = u.get("completion_tokens_details") or {}
        cached = pin.get("cached_tokens") if isinstance(pin, Mapping) else 0
        reasoning = cout.get("reasoning_tokens") if isinstance(cout, Mapping) else 0
        try:
            cached_n = int(cached or 0)
        except (TypeError, ValueError):
            cached_n = 0
        try:
            reasoning_n = int(reasoning or 0)
        except (TypeError, ValueError):
            reasoning_n = 0
        return cached_n, reasoning_n

    def _complete_via_sse(self, *, model: str, system: str, user: str, json_mode: bool, body_options: dict) -> Completion:
        """流式路径（SSE）：用 `stream_options.include_usage=true` 把 provider 自己报的
        prompt-cached/reasoning token 数也拿出来。一次逻辑请求一次流，不做重试（流已开始
        就不能重放），失败如实抛；整段流程包在断路器门卫内（同一伤口、同一 breaker）。"""
        started = self._clock()
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        body.update(body_options)

        if self._breaker is not None:
            self._breaker.before_call()

        text_parts: list[str] = []
        usage: Mapping[str, Any] | None = None
        actual_model = model
        try:
            with self._client.stream("POST", "chat/completions", json=body) as response:
                if response.status_code >= 400:
                    detail = response.read().decode("utf-8", errors="replace")[:400].replace("\n", " ")
                    if response.status_code in _RETRYABLE_STATUS:
                        if self._breaker is not None:
                            self._breaker.record_failure()
                        raise TransientProviderFailed(f"provider 流式返回 {response.status_code}：{detail}")
                    if self._breaker is not None:
                        self._breaker.record_ignored()
                    raise ProviderFailed(f"provider 流式返回 {response.status_code}：{detail}")

                for raw_line in response.iter_lines():
                    if not raw_line:
                        continue
                    line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else raw_line
                    if not line.startswith("data:"):
                        continue  # SSE comment/keepalive/field-line：忽略非 data 行
                    payload = line[5:].strip()
                    if not payload or payload == "[DONE]":
                        if payload == "[DONE]":
                            break
                        continue
                    try:
                        event = json.loads(payload)
                    except json.JSONDecodeError as exc:
                        if self._breaker is not None:
                            self._breaker.record_ignored()
                        raise ProviderFailed("provider 流式 payload 不是合法 JSON") from exc
                    model_name = event.get("model")
                    if isinstance(model_name, str) and model_name:
                        actual_model = model_name
                    for choice in event.get("choices") or []:
                        delta = (choice or {}).get("delta") or {}
                        content = delta.get("content")
                        if isinstance(content, str):
                            text_parts.append(content)
                    u = event.get("usage")
                    if isinstance(u, Mapping):
                        usage = u
        except httpx.HTTPError as exc:
            if self._breaker is not None:
                self._breaker.record_failure()
            raise TransientProviderFailed(f"provider 流式网络失败：{exc.__class__.__name__}") from exc

        latency_ms = (self._clock() - started) * 1000
        if self._breaker is not None:
            self._breaker.record_success()

        usage_map = usage or {}
        cached, reasoning = self._usage_details(usage_map)
        return Completion(
            text="".join(text_parts),
            provider=self.name,
            model=actual_model,
            tokens_in=int(usage_map.get("prompt_tokens") or 0),
            tokens_out=int(usage_map.get("completion_tokens") or 0),
            latency_ms=round(latency_ms, 1),
            cached_tokens=cached,
            reasoning_tokens=reasoning,
        )

    def complete(self, *, model: str, system: str, user: str, json_mode: bool | None = None) -> Completion:
        """ADR 0126：只统计真实 provider 往返（cache（CachedLlm）在本层之上，replay 不计入）。"""
        started = self._clock()
        try:
            result = self._complete_impl(model=model, system=system, user=user, json_mode=json_mode)
        except Exception:  # noqa: BLE001 - 熔断/重试之后的最终失败，含 httpx 与契约解析
            LLM_LATENCY.record(self._clock() - started, failed=True)
            raise
        LLM_LATENCY.record(self._clock() - started, failed=False)
        return result

    def _complete_impl(self, *, model: str, system: str, user: str, json_mode: bool | None = None) -> Completion:
        self._last_sleep = None  # 一次逻辑请求：decorrelated 的 prev 从 base 重新起步
        use_json = self._json_mode if json_mode is None else json_mode
        if self._stream:
            return self._complete_via_sse(model=model, system=system, user=user, json_mode=use_json, body_options={})
        body: dict = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
        }
        if use_json:
            body["response_format"] = {"type": "json_object"}

        # v682 断路器门卫（坑①：真接进调用链）：OPEN 时抛 CircuitOpen，一次 HTTP 都不发。
        # 默认 breaker=None 时整段跳过，与 v681 字节级一致（零回归）。
        if self._breaker is not None:
            self._breaker.before_call()

        # 有界重试：总墙钟（含退避）如实计入 latency_ms，不把重试等待藏起来（§159 计量诚实）。
        started = self._clock()
        response: httpx.Response | None = None
        for attempt in range(self._max_attempts):
            try:
                response = self._client.post("chat/completions", json=body)
            except httpx.HTTPError as exc:
                # 网络抖动（ConnectError/TimeoutException/...）属瞬时，可重试；耗尽后统一抛。
                if attempt + 1 >= self._max_attempts:
                    if self._breaker is not None:
                        self._breaker.record_failure()
                    raise TransientProviderFailed(
                        f"provider 网络失败：{exc.__class__.__name__}"
                    ) from exc
                self._sleep(self._backoff(attempt, None))
                continue

            if response.status_code not in _RETRYABLE_STATUS:
                break  # 成功、或确定性失败（401/403/400/404/422）——都不重试
            if attempt + 1 >= self._max_attempts:
                break  # 重试耗尽，交给下方按状态码抛
            self._sleep(self._backoff(attempt, response.headers.get("retry-after")))

        assert response is not None  # 循环至少跑一次（max_attempts>=1）
        latency_ms = (self._clock() - started) * 1000

        if response.status_code in (401, 403):
            if self._breaker is not None:
                self._breaker.record_ignored()
            raise ProviderFailed("provider 拒绝了凭据（401/403），检查 NEXUS_OPENAI_API_KEY")
        if response.status_code >= 400:
            detail = response.text[:400].replace("\n", " ")
            if response.status_code in _RETRYABLE_STATUS:
                # 瞬时（429/5xx）重试耗尽 = 上游此刻不健康 → 计失败（与网络耗尽同口径）
                if self._breaker is not None:
                    self._breaker.record_failure()
                raise TransientProviderFailed(f"provider 返回 {response.status_code}：{detail}")
            # 400/404/422 等确定性答案 = 请求本身错，豁免（坑②：404 is an answer）
            if self._breaker is not None:
                self._breaker.record_ignored()
            raise ProviderFailed(f"provider 返回 {response.status_code}：{detail}")

        try:
            payload = response.json()
            choice = payload["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            # 200 但 payload 畸形 = 确定性解析错，豁免（重试/熔断都不会让它变好）
            if self._breaker is not None:
                self._breaker.record_ignored()
            raise ProviderFailed("provider 响应缺少 choices[0].message.content") from exc

        # 一条逻辑请求一条 success：重试的物理多次 attempt 只算一次逻辑结果（组合语义）
        if self._breaker is not None:
            self._breaker.record_success()

        usage = payload.get("usage") or {}
        cached, reasoning = self._usage_details(usage)
        return Completion(
            text=choice or "",
            provider=self.name,
            model=payload.get("model") or model,
            tokens_in=int(usage.get("prompt_tokens") or 0),
            tokens_out=int(usage.get("completion_tokens") or 0),
            latency_ms=round(latency_ms, 1),
            cached_tokens=cached,
            reasoning_tokens=reasoning,
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
