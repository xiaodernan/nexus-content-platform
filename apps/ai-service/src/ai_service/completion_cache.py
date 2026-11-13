"""LLM completion 缓存（v680，进程内 opt-in 组件）。

§159 诚实边界（本文件最重要的一条）：缓存命中**不是一次新的 provider 调用**。
因此本组件只做一件事——把 `(model, system, user, json_mode)` → `Completion` 的映射缓存起来，
并如实统计 hits/misses/stores/evictions/expirations；它**不接近** `usage`，也不改响应
形状。为什么：契约 `contracts/ai-*-response.schema.json` 是 `additionalProperties=false`、
web `TaskUsageSchema` 是精确 zod 形状，要表达"这次命中了缓存、没有真的花钱/耗延迟"
必须同时改契约 + web 账本 + skill 消费方，属跨模块语义决策（见 ADR 0113）。语义未定之前，
**不拦截、不抄自己接进生产调用链**。组件先做对、做全、可复用、可测。

设计取舍：
- 纯组件 + 装饰器：`CachedLlm` 实现 `LLMProvider` 协议，套在任意 provider 上。
  `registry.llm.complete(...)` 那条生产路径**一行不改**——启用时只需构造处 opt-in 包一层。
- 键 = `(model, system, user, json_mode)`：四个都影响模型输出，缺一个就会窜台（门有自检）。
  `json_mode` 是 v695 补上的第四维：`response_format=json_object` 与纯文本是**两种不同形状的
  回复**（chat 路由显式传 False，run 路由用默认），旧键漏了它，同一份 (model, system, user)
  的 chat 可能拿到 run 缓存下来的 JSON 对象——这是正确的缓存键不该允许的事。
  不含 `temperature`：当前适配器硬编码 0.2（openai_compatible.py:56），是 provider 的既定
  语义，不是调用方变量；若将来开放 temperature，必须同步进键（ADR 0113 仍欠顶）。
- TTL + LRU：`OrderedDict`，命中移到末尾，超过 `max_entries` 淘汰最久未用；TTL 用
  `time.monotonic()`（不受系统时钟回拨影响）。两者都是**进程内**、重启即失，绝不声称跨实例。
- 失败不缓存：`complete` 只在成功返回后才 `store`；`ProviderFailed` 直接抛出，不留毒条目。
- 并发（v696 / ADR 0128）：`CachedLlm` 可注入 `SingleFlight`，同 key 并发 miss 只放一个
  leader 打真 provider，其余等同一个结果；失败传播同一异常、等待有界、超时自己补打真调用。
  **默认 `flight=None` = 字节级零回归**（旧调用点一行不改）；生产由 `Registry` 接线。
  这是进程内合并，不声称跨实例（ADR 0113 仍欠 ① 由此关闭）。
"""
from __future__ import annotations

import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, replace
from typing import Protocol

from .providers.base import Completion, LLMProvider
from .single_flight import FlightLike

# None = 由 provider 默认（不是"未指定就随便"）；三态必须分开，否则 chat 与 run 会串台。
JsonModeKey = str  # "default" | "json" | "text"
CacheKey = tuple[str, str, str, JsonModeKey]  # (model, system, user, json_mode)


def json_mode_key(json_mode: bool | None) -> JsonModeKey:
    """键维度的单一真值：门与组件共用。None/True/False 三态不能折叠成两态。"""
    if json_mode is None:
        return "default"
    return "json" if json_mode else "text"


@dataclass(frozen=True)
class CacheStats:
    """缓存的可观测量。命中不是新调用——这些数字就是"省了几次真调用"的诚实账本。"""

    hits: int = 0
    misses: int = 0
    stores: int = 0
    evictions: int = 0
    expirations: int = 0

    @property
    def requests(self) -> int:
        return self.hits + self.misses

    @property
    def hit_rate(self) -> float:
        return self.hits / self.requests if self.requests else 0.0


class _Clock:
    """可注入时钟：门用假时钟验 TTL，生产用 monotonic。"""

    def __call__(self) -> float:
        return time.monotonic()


class LlmCompletionCache:
    """TTL + LRU 的 completion 缓存。纯数据结构，不依赖任何 provider / 网络。

    `now` 可注入（默认 monotonic）只为让 TTL 门确定性可测；生产不需要传。
    所有公开方法都只碰本实例状态，可被多个 `CachedLlm` 共享（也可以不共享）。
    """

    def __init__(
        self,
        *,
        ttl_s: float,
        max_entries: int = 256,
        now: _Clock | None = None,
    ) -> None:
        if ttl_s <= 0:
            raise ValueError("ttl_s 必须为正数：非正 TTL 等于永远过期，是配置错误而非'关闭'")
        if max_entries <= 0:
            raise ValueError("max_entries 必须为正数：0 容量等于永远不缓存，是配置错误")
        self._ttl_s = float(ttl_s)
        self._max_entries = int(max_entries)
        self._now = now or _Clock()
        self._entries: OrderedDict[CacheKey, tuple[Completion, float]] = OrderedDict()
        # v696：`execution.py` 的 to_thread 会让 N 路同 key 请求**同时**走到 get()。
        # 无锁时 两个线程同时看到同一过期条目、各自 del"会抛 KeyError（真宕掉，不只是
        # 计数多记一次）；LRU move_to_end 也会掐上被别人删掉的键。锁只护本实例状态，
        # 不跨 provider 调用、不跨网络，热路径成本是一次无争用 Lock 获取。
        self._lock = threading.Lock()
        self._hits = 0
        self._misses = 0
        self._stores = 0
        self._evictions = 0
        self._expirations = 0

    @staticmethod
    def key(*, model: str, system: str, user: str, json_mode: bool | None = None) -> CacheKey:
        """键的单一真值：门与组件共用，避免"组件漏一个维度 + 门也漏"的假绿。

        `json_mode` 默认 None 保持旧调用点零改动，但语义上就是 "default" 这一态。
        """
        return (model, system, user, json_mode_key(json_mode))

    def get(self, key: CacheKey) -> Completion | None:
        """命中移到 LRU 末尾；TTL 过期的条目当场清除并计 expiration，按 miss 处理。"""
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                self._misses += 1
                return None
            completion, stored_at = entry
            if self._now() - stored_at >= self._ttl_s:
                del self._entries[key]
                self._expirations += 1
                self._misses += 1
                return None
            self._entries.move_to_end(key)
            self._hits += 1
            return completion

    def store(self, key: CacheKey, completion: Completion) -> None:
        """成功调用后写入。同键覆盖（重新计时 + 刷新内容），超限淘汰最久未用。"""
        with self._lock:
            self._entries[key] = (completion, self._now())
            self._entries.move_to_end(key)
            self._stores += 1
            if len(self._entries) > self._max_entries:
                self._entries.popitem(last=False)
                self._evictions += 1

    def stats(self) -> CacheStats:
        with self._lock:
            return CacheStats(
                hits=self._hits,
                misses=self._misses,
                stores=self._stores,
                evictions=self._evictions,
                expirations=self._expirations,
            )

    def __len__(self) -> int:
        with self._lock:
            return len(self._entries)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


class CachedLlm:
    """`LLMProvider` 装饰器：命中返回缓存的 Completion，未命中透传并写入。

    实现协议的全部面（`kind`/`name`/`models`/`model_for`/`complete`），所以可以无缝替换
    `registry.llm`——但**本片不替换**，启用是 ADR 0113 语义决策后的 opt-in 接线。
    """

    kind = "llm"

    def __init__(
        self, inner: LLMProvider, cache: LlmCompletionCache, *, flight: FlightLike | None = None
    ) -> None:
        self._inner = inner
        self._cache = cache
        self._flight = flight
        self.name = inner.name

    @property
    def inner(self) -> LLMProvider:
        return self._inner

    @property
    def cache(self) -> LlmCompletionCache:
        return self._cache

    def models(self) -> list[str]:
        return self._inner.models()

    def model_for(self, model_class: str) -> str:
        return self._inner.model_for(model_class)

    def complete(self, *, model: str, system: str, user: str, json_mode: bool | None = None) -> Completion:
        key = LlmCompletionCache.key(model=model, system=system, user=user, json_mode=json_mode)
        started = time.monotonic()
        cached = self._cache.get(key)
        if cached is not None:
            lookup_ms = round((time.monotonic() - started) * 1000, 3)
            # §CACHE-2 诚实记账：命中**不是**一次 provider 调用。
            # 直接返回当初那份 Completion，会让账本把"没花掉的 token、没等过的 1.6 秒"
            # 再报一遍（延迟数字尤其狡猾：它看起来像这次真的等了那么久）。命中时如实改成：
            #   cached_tokens = 整段输入（这一段 token 一个都没再发给 provider，复用率 100%）
            #   latency_ms    = 这次查缓存真实耗掉的时间（通常 <1ms，与真调用三个数量级）
            # tokens_in/out 保留原值：那是这份答卷的**体量**，界面拿它显示上下文大小；
            # 真正的花费由 cached_tokens 表达，不靠把 tokens_in 改成 0 来暗示（那会让 UI 显示"空"）。
            return replace(cached, cached_tokens=cached.tokens_in, latency_ms=lookup_ms, cache_reported=True)

        def work() -> Completion:
            # 失败（ProviderFailed）从这里原样抛出，绝不 store 毒条目。
            completion = self._inner.complete(model=model, system=system, user=user, json_mode=json_mode)
            self._cache.store(key, completion)
            return completion

        if self._flight is None:
            return work()
        # 同 key 并发只放一个 work 过去；缓存命中不进 flight（命中不是"合并"，不虚报 coalesced）。
        return self._flight.run(key, work)
