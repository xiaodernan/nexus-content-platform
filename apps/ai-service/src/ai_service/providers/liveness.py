"""embeddings 的存活判定：能力状态要由真调用得出，不由"配了 key"推出（§159/§160）。

为什么单开一个模块：`has_llm` 只证明"环境里有一串密钥"，不证明"这个网关上有 embeddings 这条模型"。
按密钥存在就说 real，读数就会对不上事实——本项目实测过一例：中转网关只放行 chat 模型，
`text-embedding-3-small` 直接 `model_not_found`，而 `/healthz` 一直报 embedding=real。

这里把"探过一次、结果如何、什么时候再探"收成一个对象，注册表只读它的结论，不做 I/O；
真正的网络调用在 EmbeddingProber 里，测试用假传输喂它，不联网。
"""

from __future__ import annotations

import threading
import time
from typing import Callable

from .base import ProviderFailed

# 一次探测 ≈ 一个 8 token 的输入；TTL 设长一点，够把"网关今天加没加这个模型"这类变化接住。
DEFAULT_TTL_S = 900.0


class EmbeddingLiveness:
    """最近一次探测的结论。unknown 不等于可用——报告时按不可用处理。"""

    def __init__(self, *, ttl_s: float = DEFAULT_TTL_S, clock: Callable[[], float] = time.monotonic) -> None:
        self.ttl_s = ttl_s
        self._clock = clock
        self.state = "unknown"
        self.reason = ""
        self.checked_at = float("-inf")
        self.probes = 0
        self._lock = threading.Lock()
        self._in_flight = False

    def is_stale(self) -> bool:
        if self.state == "unknown":
            return True
        return (self._clock() - self.checked_at) >= self.ttl_s

    def record(self, ok: bool, reason: str = "") -> None:
        with self._lock:
            self.state = "ok" if ok else "failed"
            self.reason = "" if ok else reason
            self.checked_at = self._clock()
            self.probes += 1

    def claim_refresh(self) -> bool:
        """拿到 True 才去探：两个 healthz 同时读到过期，也只发一次网络请求。"""
        with self._lock:
            if self._in_flight:
                return False
            self._in_flight = True
            return True

    def release_refresh(self) -> None:
        with self._lock:
            self._in_flight = False


class EmbeddingProber:
    """拿一个真输入打一次 embeddings，把结果翻译成 (ok, reason)。"""

    def __init__(self, provider, *, model_class: str = "embedding", sample: str = "probe") -> None:
        self._provider = provider
        self._model_class = model_class
        self._sample = sample

    def probe(self) -> tuple[bool, str]:
        try:
            model = self._provider.model_for(self._model_class)
        except ProviderFailed as exc:
            return False, str(exc)
        try:
            result = self._provider.embed(model=model, texts=[self._sample])
        except ProviderFailed as exc:
            return False, str(exc)
        except Exception as exc:  # 探测绝不把异常抛回 healthz：结论未知就是未知
            return False, f"embedding 探测异常：{exc.__class__.__name__}"
        if not result.vectors or not result.vectors[0]:
            return False, f"embedding provider 对 {model} 返回了空向量"
        return True, ""


def refresh_in_background(liveness: EmbeddingLiveness, prober: EmbeddingProber) -> bool:
    """过期就起一个守护线程去探，本次调用不等网络——healthz 的预算是毫秒级。

    返回是否真的起了线程。探测结果落在 liveness 上，下一次 healthz 读到的是最近一次结论。
    """
    if not liveness.is_stale() or not liveness.claim_refresh():
        return False

    def run() -> None:
        try:
            ok, reason = prober.probe()
            liveness.record(ok, reason)
        finally:
            liveness.release_refresh()

    threading.Thread(target=run, name="embedding-liveness", daemon=True).start()
    return True
