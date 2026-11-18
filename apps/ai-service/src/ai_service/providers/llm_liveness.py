"""LLM 的存活判定：能力状态由真调用得出，不由"配了 key"得出（§59/§160）。

与 `liveness.py`（embedding）同一手法，单独成模块：
`has_llm` 只证明环境里有一串密钥，不证明网关对 gpt 这类模型有可用通道——密钥可能过期、
模型可能下架、Clash 节点可能抖动。按"有 key"就报 real，读数与事实对不上（本仓 embeddings
曾实测踩过 `model_not_found`）。这里把"最近一次探测"与"何时再探"收成两个对象，
注册表只读结论、不做 I/O；真网络在 LlmProber 里，测试用假 transport 喂它，不联网。
"""

from __future__ import annotations

import threading
import time
from typing import Callable

from .base import ProviderFailed

# 一次探测 = 一句 ping + 一个 token 级应答；TTL 设长一点，跨重启也只付一次网络往返
DEFAULT_TTL_S = 900.0


class LlmLiveness:
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


class LlmProber:
    """拿 system=ping / user=ping / json_mode=False 打一次真聊天补全，翻译成 (ok, reason)。

    探测必须**绕过完成缓存**——缓存命中不花网络、也不证明网关还活着；
    所以这里拿到的是注册表内层 provider，不是 CachedLlm 外壳。
    """

    def __init__(self, provider, *, model_class: str = "fast", sample: str = "ping") -> None:
        self._provider = provider
        self._model_class = model_class
        self._sample = sample

    def probe(self) -> tuple[bool, str]:
        try:
            model = self._provider.model_for(self._model_class)
        except ProviderFailed as exc:
            return False, str(exc)
        try:
            result = self._provider.complete(model=model, system=self._sample, user=self._sample, json_mode=False)
        except ProviderFailed as exc:
            return False, str(exc)
        except Exception as exc:  # 探测绝不把异常抛出去：结论未知就是未知
            return False, f"llm 探测异常：{exc.__class__.__name__}"
        if not (result.text or "").strip():
            return False, f"llm provider 对 {model} 返回了空回复"
        return True, ""


def refresh_llm_in_background(liveness: LlmLiveness, prober: LlmProber) -> bool:
    """过期就起一个守护线程去探，本次调用不等网络——healthz 的预算是毫秒级。
    返回是否真的起了线程。探测结果落在 liveness 上，下一轮 healthz 读到的就是最近一次结论。
    """
    if not liveness.is_stale() or not liveness.claim_refresh():
        return False

    def run() -> None:
        try:
            ok, reason = prober.probe()
            liveness.record(ok, reason)
        finally:
            liveness.release_refresh()

    threading.Thread(target=run, name="llm-liveness", daemon=True).start()
    return True
