"""§CACHE-2 / §CACHE-4 · 缓存读数：前缀复用率 + provider 报账覆盖度 + 上游漂移。

为什么需要这三个数
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

第三个数（§CACHE-4）是**上游漂移**：同一段稳定前缀在不同轮次被数成了多少 token。
§CACHE-2 之后本地字节前缀复用率已经能到 96%，可真机 `cached_tokens` 只报 39.7%——
差的那 56 个百分点不在提示词里，在后端。见 `UpstreamDriftTracker` 的注释：
2026-11-13 用同一份 25586 字节量到 8852 / 13215 / 27294 三个数。

存储纪律：只留摘要（十六进制串），**不留 prompt 正文**；有界 LRU，进程内，
重启即失——不声称跨实例。
"""

from __future__ import annotations

from collections import OrderedDict
from typing import Any

from .providers.base import Completion

# 同一份稳定前缀在不同轮次的 `tokens_in` 允许的自然差异上限。
#
# 稳定块逐字节相同，但整份 prompt **不是**：每轮的 selection / annotations / 诉求都排在
# 稳定块之后，会让 `tokens_in` 自然浮动个位数百分比（真机实测 13215 → 13220，+0.04%）。
# 这个带宽要留够，否则每轮都会被判成"上游换了"——一个天天报警的检测器等于没有检测器。
#
# 而真正换后端时差多少？2026-11-13 真机同一份 25586 字节分别数出 8852 / 13215 / 27294，
# 最大差 208%。10% 与 208% 之间没有模糊地带。
DRIFT_BAND = 0.10


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


class UpstreamDriftTracker:
    """同一份稳定前缀，在不同轮次被数成了多少 token。

    为什么需要它
    ------------
    §CACHE-2 之后我们已经能把"我们的前缀变没变"自证清楚（`PrefixReuseTracker`）。
    但真机读数仍然会抖，而抖的方向**不是**我们能控制的：2026-11-13 用同一份 25586 字节
    的提示连续真调，`tokens_in` 分别拿到 8852 / 13215 / 27294——**同样的字节，三个数**。
    唯一能让同一串字节数出不同 token 数的东西，是**背后换了推理后端**（各家 tokenizer 不同）。

    这件事必须和"缓存坏了"分开说：

    | 现象 | 归因 | 该做什么 |
    |---|---|---|
    | 同一 digest 的 tokens_in 一致、cached 低 | 我们的前缀真在变 | 改提示词顺序 |
    | 同一 digest 的 tokens_in 差一个数量级 | 上游换人了 | 什么也别改，读数不可比 |

    没有这一维，两种情形在面板上是同一个"命中率 40%"，而正确的处置完全相反——
    会让人去优化一个本来就没坏的东西。

    存储纪律与 `PrefixReuseTracker` 同：只留 16 位摘要与三个整数，**不留提示正文**；有界 LRU。
    """

    __slots__ = ("_capacity", "_seen", "_drifted", "_max_drift", "_observed", "_evictions")

    def __init__(self, capacity: int = 256) -> None:
        if capacity <= 0:
            raise ValueError("capacity 必须为正数：0 容量等于永远观察不到漂移")
        self._capacity = int(capacity)
        # digest -> [count, min_tokens, max_tokens]；只留极值，中间值对判定没有用
        self._seen: "OrderedDict[str, list[int]]" = OrderedDict()
        self._drifted = 0
        self._max_drift = 0.0
        self._observed = 0
        self._evictions = 0

    def observe(self, digest: str, tokens_in: int) -> float | None:
        """记一次调用；返回这次的漂移倍数（`max/min`），首次见到该摘要时返回 None。"""
        tokens = int(tokens_in)
        if tokens <= 0:
            # provider 没报 token 数：不是"0 个 token"，是不参与判定
            return None
        self._observed += 1
        slot = self._seen.get(digest)
        if slot is None:
            self._seen[digest] = [1, tokens, tokens]
            if len(self._seen) > self._capacity:
                self._seen.popitem(last=False)
                self._evictions += 1
            return None
        slot[0] += 1
        crossed_before = _drift_of(slot) > DRIFT_BAND
        slot[1] = min(slot[1], tokens)
        slot[2] = max(slot[2], tokens)
        drift = _drift_of(slot)
        if drift > DRIFT_BAND and not crossed_before:
            self._drifted += 1
        self._max_drift = max(self._max_drift, drift)
        self._seen.move_to_end(digest)
        return drift

    def stats(self) -> dict[str, Any]:
        return {
            # 被观察到两次以上的前缀个数——只有这些才可能看出漂移
            "comparable": sum(1 for slot in self._seen.values() if slot[0] > 1),
            "observed": self._observed,
            "drifted": self._drifted,
            "capacity": self._capacity,
            "evictions": self._evictions,
            # 没有可比的样本时给 null，不给 0.0：0 会被读成"比过、没漂"
            "maxDrift": round(self._max_drift, 4) if self._max_drift > 0 else None,
            "band": DRIFT_BAND,
        }


def _drift_of(slot: list[int]) -> float:
    """`(max - min) / min`；min 为 0 时不算（脏数据不该变成一次漂移）。"""
    low = slot[1]
    if low <= 0:
        return 0.0
    return (slot[2] - low) / low


class CacheTelemetry:
    """一个进程一份：前缀复用 + provider 报账 + 上游漂移。挂在 Registry 上，随实例隔离（测试友好）。"""

    def __init__(self, *, prefix_capacity: int = 512) -> None:
        self.prefix = PrefixReuseTracker(capacity=prefix_capacity)
        self.provider = ProviderCacheLedger()
        self.upstream = UpstreamDriftTracker()

    def snapshot(self) -> dict[str, Any]:
        return {
            "prefix": self.prefix.stats(),
            "provider": self.provider.stats(),
            "upstream": self.upstream.stats(),
        }
