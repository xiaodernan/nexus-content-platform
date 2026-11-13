"""§CACHE-2 · 缓存读数：前缀复用率 + provider 报账覆盖度。

为什么需要这两个数
------------------
`provider` 自报的 `cached_tokens` **不可作为精密仪器**。真机四实验（ADR 0262）里，
两份**内容零重叠**的请求也报了同一个 `cached=5248`，同一份内容两次请求的
`prompt_tokens` 还能差 500。拿它算"命中率 X%"是给一个抖动数字编故事。

应用缓存的 `hits/misses` 也只说明"同一个键被问过两次"，说不了
"我们的提示词本身可不可缓存"——而后者才是这次要修的东西。

于是只剩一个能自证的量：**同一段稳定前缀被重复请求了多少次**。
它由我们自己的字节算出（`design_prompt.stable_block_digest`），与网关心情无关：

    reuseRate = reused / requests

1.0 表示每一轮都建立在同一段前缀上——provider 只要做前缀缓存就必然命中；
0 表示每轮前缀都在变，再好的 provider 也救不了。

第二个数是**报账覆盖度**：provider 到底报没报 `cached_tokens`。
`cached=0` 与"没报"是两件事，缺一维就会把"缺席"写成"确定的 0 命中"。

存储纪律：只留摘要（十六进制串），**不留 prompt 正文**；有界 LRU，进程内，
重启即失——不声称跨实例。
"""

from __future__ import annotations

from collections import OrderedDict
from typing import Any

from .providers.base import Completion


class PrefixReuseTracker:
    """有界 LRU：记住最近见过的稳定前缀摘要，命中即"复用"。"""

    def __init__(self, capacity: int = 512) -> None:
        if capacity <= 0:
            raise ValueError("capacity 必须为正数：0 容量等于永远不复用，是配置错误")
        self._capacity = int(capacity)
        self._seen: OrderedDict[str, None] = OrderedDict()
        self._requests = 0
        self._reused = 0
        self._evictions = 0

    def observe(self, digest: str) -> bool:
        """记一次请求；返回 True = 这段前缀之前见过（可被 provider 前缀缓存命中）。"""
        self._requests += 1
        if digest in self._seen:
            self._reused += 1
            self._seen.move_to_end(digest)
            return True
        self._seen[digest] = None
        if len(self._seen) > self._capacity:
            self._seen.popitem(last=False)
            self._evictions += 1
        return False

    def stats(self) -> dict[str, Any]:
        return {
            "requests": self._requests,
            "reused": self._reused,
            "uniquePrefixes": len(self._seen),
            "capacity": self._capacity,
            "evictions": self._evictions,
            # 一次都没有时说 null，不说 0%：0% 是一句具体的谎，它暗示"试过但全没命中"
            "reuseRate": round(self._reused / self._requests, 4) if self._requests else None,
        }


class ProviderCacheLedger:
    """provider 报账覆盖度：报了多少次、缺席多少次、报上来的命中 token 合计。"""

    def __init__(self) -> None:
        self._reported = 0
        self._missing = 0
        self._cached_total = 0
        self._prompt_total = 0

    def record(self, completion: Completion) -> None:
        if completion.cache_reported:
            self._reported += 1
            self._cached_total += max(0, int(completion.cached_tokens))
            self._prompt_total += max(0, int(completion.tokens_in))
        else:
            self._missing += 1

    def stats(self) -> dict[str, Any]:
        return {
            "reported": self._reported,
            "missing": self._missing,
            "cachedTokensTotal": self._cached_total,
            "promptTokensTotal": self._prompt_total,
            # 只有真有报账样本时才给比例；没有样本给 null（不画 0%）
            "reportedHitRate": (round(self._cached_total / self._prompt_total, 4) if self._prompt_total else None),
        }


class CacheTelemetry:
    """一个进程一份：前缀复用 + provider 报账。挂在 Registry 上，随实例隔离（测试友好）。"""

    def __init__(self, *, prefix_capacity: int = 512) -> None:
        self.prefix = PrefixReuseTracker(capacity=prefix_capacity)
        self.provider = ProviderCacheLedger()

    def snapshot(self) -> dict[str, Any]:
        return {"prefix": self.prefix.stats(), "provider": self.provider.stats()}
