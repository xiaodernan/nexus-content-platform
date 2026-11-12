"""**跨实例共享 LLM completion 缓存**（v686，Redis 后端；ADR 0119）。

v680 的 `LlmCompletionCache` 是**进程内**的：重启即失，副本各缓存各的。多副本部署下同一
提示词在 A 实例打完真调用后，B/C 实例再拿到同一份请求还是得各打一次——缓存省不了集群级
调用，只省了单实例内热点。本片把"(model, system, user) → Completion"做成**跨进程共享
的可复用组件**：所有副本读同一个 Redis keyspace，一次真调用、全集群复用。

**§159 诚实边界（本文件最重要的一条）**：
- 缓存命中**不是一次新的 provider 调用**。命中时不进 `usage`、不计费、不写任务行，
  调用方若需要这些账必须自己据 `stats()` 如实读——本组件不替任何人说"这次真的跑了"。
- **零生产接线**（v680/v683 同款纪律）：同步 `complete()` 何时把 `CachedLlm` 换成本
  后端，是契约级语义决策（字节形状、账务口径、Redis 延迟耦合、降级策略选型），ADR 0119
  仍欠，**语义未定不定门、不接线**。
- **失败降级 = 按缓存完全失效处理**：Redis 断连时 `get` 一律回 `None`（按 miss 记账）、
  `store` 静默吞掉（记 `stores_failed`）——缓存是加速器，不是门，断连绝不让 provider 调用
  失败。`stats()` 如实标注 `shared=False, degraded=True`（与降级对照，不谎称共享）。
- **不声称跨实例强一致**：zset LRU 索引与 entry 键之间的回收/裁剪不是事务，可能少保留一
  两个本该在的条目；这只是缓存容量纪律，不是正确性边界。过期由 **Redis TTL** 权威实现
  （到点 key 消失），zset 兜底修剪，两者不一致时以 TTL 为准。

**设计取舍**：
- 键 = `sha256(model \0 system \0 user)`，与 `completion_cache.LlmCompletionCache.key`
  共用单一真值（`LlmCompletionCache.key`）——换前缀再哈希会串台，两处必须一处定义。
  TTL 与 entry 生命周期由 Redis `SET ... EX` 权威实现；LRU 索引是独立一个 zset（
  member=摘要，score=epoch 毫秒），`store` 时顺手修剪过期成员与超限成员。
- **不写 Lua**（v683 同款纪律）：所有顺序写只有单一 Python 真值，任何判定都不漂移；
  原子性由 Redis 命令语义提供（SET EX / ZADD 单命令原子），多步之间的竞态是
  “多删一条或少删一条”的缓存级良性竞态，不破坏正确性，如实记账（`evictions` 只计真删
  的成员数）。
- LRU 触碰 = `get` 命中时 `ZADD` 刷新 member 的 score（epoch ms）。
- 复杂度（ADR 0112）：`get`/`store` 均为 **O(1) 定点 Redis 命令**（store 的修剪工是
  过期成员数 k，非缓存总条目数）；不 `KEYS`/`SCAN` 全量遍历。
- 序列化：`Completion`（frozen dataclass）↔ JSON（判别式 `v=1` payload；字段宽松拒绝
  布尔假装 int 的串台，未知/丢失字段 → 毒条目 → 当 miss 处理 + 顺手 `DEL` 自愈）。
"""
from __future__ import annotations

import hashlib
import json
import math
import time
from typing import Any, Callable

from .completion_cache import CacheKey, LlmCompletionCache
from .providers.base import Completion

_ENTRY_PREFIX = "e"
_LRU_SUFFIX = "lru"
_PAYLOAD_VERSION = 1


class RedisCompletionStats:
    """跨实例缓存的可观测量。命中不是新调用——这些数字就是“省了几次真调用”的诚实账本。"""

    def __init__(
        self,
        *,
        hits: int,
        misses: int,
        stores: int,
        stores_failed: int,
        evictions: int,
        expirations: int,
        corruptions: int,
        shared: bool,
        degraded: bool,
        namespace: str,
        max_entries: int,
        ttl_s: float,
    ) -> None:
        self.hits = hits
        self.misses = misses
        self.stores = stores
        self.stores_failed = stores_failed
        self.evictions = evictions
        self.expirations = expirations
        self.corruptions = corruptions
        self.shared = shared
        self.degraded = degraded
        self.namespace = namespace
        self.max_entries = max_entries
        self.ttl_s = ttl_s

    @property
    def requests(self) -> int:
        return self.hits + self.misses

    @property
    def hit_rate(self) -> float:
        return self.hits / self.requests if self.requests else 0.0

    def as_dict(self) -> dict[str, Any]:
        return {
            "namespace": self.namespace,
            "shared": self.shared,
            "degraded": self.degraded,
            "hits": self.hits,
            "misses": self.misses,
            "stores": self.stores,
            "stores_failed": self.stores_failed,
            "evictions": self.evictions,
            "expirations": self.expirations,
            "corruptions": self.corruptions,
            "requests": self.requests,
            "hit_rate": self.hit_rate,
            "max_entries": self.max_entries,
            "ttl_s": self.ttl_s,
        }


def _default_now_ms() -> int:
    return int(time.time() * 1000)


def _digest(key: CacheKey) -> str:
    model, system, user = key
    # NUL 分隔：model/system/user 内部可以任意字符，哈希里唯一
    h = hashlib.sha256()
    h.update(model.encode("utf-8"))
    h.update(b"\0")
    h.update(system.encode("utf-8"))
    h.update(b"\0")
    h.update(user.encode("utf-8"))
    return h.hexdigest()


class RedisLlmCompletionCache:
    """Redis 后端的 (model, system, user) → Completion 缓存。注入 client（redis-py 或测试 fake）。

    `now_ms` 可注入（默认真 epoch ms）只为让 TTL/LRU/修剪门确定性可测；生产不需要传。
    所有方法对 Redis 故障 **fail-open**：get 回 None（miss）、store 吞掉（stores_failed），
    绝不让缓存故障打挂 provider 调用；`stats()` 如实标注 `shared/degraded`。
    """

    def __init__(
        self,
        client: Any,
        *,
        namespace: str = "nexus:llmc",
        ttl_s: float = 3600.0,
        max_entries: int = 256,
        now_ms: Callable[[], int] | None = None,
    ) -> None:
        if ttl_s <= 0:
            raise ValueError("ttl_s 必须为正数：非正 TTL 等于永远过期，是配置错误而非'关闭'")
        if max_entries <= 0:
            raise ValueError("max_entries 必须为正数：0 容量等于永远不缓存，是配置错误")
        self._client = client
        self._ns = namespace.rstrip(":")
        self._ttl_s = float(ttl_s)
        self._max_entries = int(max_entries)
        self._now_ms = now_ms or _default_now_ms

        self._hits = 0
        self._misses = 0
        self._stores = 0
        self._stores_failed = 0
        self._evictions = 0
        self._expirations = 0
        self._corruptions = 0
        self._shared = True
        self._degraded = False

    # ── key 命名空间（定点，不用 KEYS/SCAN）──────────────────────────────

    def _ekey(self, digest: str) -> str:
        return f"{self._ns}:{_ENTRY_PREFIX}:{digest}"

    def _lru(self) -> str:
        return f"{self._ns}:{_LRU_SUFFIX}"

    # ── 序列化 ───────────────────────────────────────────────────────────

    @staticmethod
    def _encode(completion: Completion) -> str:
        return json.dumps(
            {
                "v": _PAYLOAD_VERSION,
                "completion": {
                    "text": completion.text,
                    "provider": completion.provider,
                    "model": completion.model,
                    "tokens_in": completion.tokens_in,
                    "tokens_out": completion.tokens_out,
                    "latency_ms": completion.latency_ms,
                },
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )

    @staticmethod
    def _decode(raw: Any) -> Completion | None:
        """严格校验：类型不符一律毒条目（调用方自己 DEL）。bool 不算 int（防串台）。"""
        if isinstance(raw, bytes):
            try:
                raw = raw.decode("utf-8")
            except UnicodeDecodeError:
                return None
        if not isinstance(raw, str):
            return None
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if not isinstance(obj, dict) or obj.get("v") != _PAYLOAD_VERSION:
            return None
        c = obj.get("completion")
        if not isinstance(c, dict):
            return None
        try:
            text = c["text"]
            provider = c["provider"]
            model = c["model"]
            tokens_in = c["tokens_in"]
            tokens_out = c["tokens_out"]
            latency_ms = c["latency_ms"]
        except KeyError:
            return None
        for name, value in (("text", text), ("provider", provider), ("model", model)):
            if not isinstance(value, str):
                return None
        for name, value in (("tokens_in", tokens_in), ("tokens_out", tokens_out)):
            if not isinstance(value, int) or isinstance(value, bool):
                return None
        if not isinstance(latency_ms, (int, float)) or isinstance(latency_ms, bool):
            return None
        return Completion(
            text=text,
            provider=provider,
            model=model,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            latency_ms=float(latency_ms),
        )

    # ── 主路径（一切 Redis 故障 fail-open）────────────────────────────────

    def get(self, key: CacheKey) -> Completion | None:
        """命中：解码成功 → 返回并刷新 LRU score；未命中/过期/毒条目：miss。"""
        try:
            digest = _digest(key)
            raw = self._client.get(self._ekey(digest))
            if raw is None:
                self._misses += 1
                self._shared, self._degraded = True, False
                return None
            completion = self._decode(raw)
            if completion is None:
                # 毒条目：计数、当 miss、顺手删（自愈）。删失败也不影响主路径。
                self._corruptions += 1
                try:
                    self._client.delete(self._ekey(digest))
                    self._client.zrem(self._lru(), digest)
                except Exception:
                    pass
                self._misses += 1
                return None
            self._client.zadd(self._lru(), {digest: self._now_ms()})
            self._hits += 1
            self._shared, self._degraded = True, False
            return completion
        except Exception:
            self._on_degrade()
            self._misses += 1
            return None

    def store(self, key: CacheKey, completion: Completion) -> None:
        """成功后写入。同键覆盖 + 刷新 LRU score；顺手修剪过期/超限成员。"""
        try:
            digest = _digest(key)
            self._client.set(
                self._ekey(digest),
                self._encode(completion),
                ex=max(1, math.ceil(self._ttl_s)),  # ceil：够覆盖 TTL 窗口
            )
            self._client.zadd(self._lru(), {digest: self._now_ms()})
            self._prune_expired()
            self._trim_lru()
            self._stores += 1
            self._shared, self._degraded = True, False
        except Exception:
            self._stores_failed += 1
            self._on_degrade()

    def __len__(self) -> int:
        try:
            self._prune_expired()
            return int(self._client.zcard(self._lru()))
        except Exception:
            self._on_degrade()
            return 0

    def clear(self) -> None:
        """定点清本命名空间全部 entry + LRU 索引。O(max_entries)；运维动作，不进主路径。"""
        try:
            members = self._client.zrange(self._lru(), 0, -1)
            if members:
                self._client.delete(*[self._ekey(m.decode("utf-8") if isinstance(m, bytes) else m) for m in members])
            self._client.delete(self._lru())
            self._shared, self._degraded = True, False
        except Exception:
            self._on_degrade()

    # ── 修剪（摊销；过期成员数 k 决定成本，非缓存总条数）──────────────────

    def _prune_expired(self) -> None:
        now = self._now_ms()
        cutoff = now - int(self._ttl_s * 1000)
        members = self._client.zrangebyscore(self._lru(), "-inf", cutoff)
        if not members:
            return
        digests = [m.decode("utf-8") if isinstance(m, bytes) else m for m in members]
        self._client.delete(*[self._ekey(d) for d in digests])
        self._client.zrem(self._lru(), *digests)
        # zset member 过期窗 = entry 已不可能有效；这些成员就是“到期该消失”的诚实计数
        self._expirations += len(digests)

    def _trim_lru(self) -> None:
        size = int(self._client.zcard(self._lru()))
        if size <= self._max_entries:
            return
        drop = size - self._max_entries
        victims = self._client.zrange(self._lru(), 0, drop - 1)
        if not victims:
            return
        digests = [m.decode("utf-8") if isinstance(m, bytes) else m for m in victims]
        self._client.delete(*[self._ekey(d) for d in digests])
        self._client.zrem(self._lru(), *digests)
        self._evictions += len(digests)

    # ── 降级 / 观测 ──────────────────────────────────────────────────────

    def _on_degrade(self) -> None:
        self._shared, self._degraded = False, True

    def stats(self) -> RedisCompletionStats:
        return RedisCompletionStats(
            hits=self._hits,
            misses=self._misses,
            stores=self._stores,
            stores_failed=self._stores_failed,
            evictions=self._evictions,
            expirations=self._expirations,
            corruptions=self._corruptions,
            shared=self._shared,
            degraded=self._degraded,
            namespace=self._ns,
            max_entries=self._max_entries,
            ttl_s=self._ttl_s,
        )

    # ── 兼容 v680 构造参数形状（两组件可同构替换，语义不同见 ADR 0119）────

    @staticmethod
    def key(*, model: str, system: str, user: str) -> CacheKey:
        return LlmCompletionCache.key(model=model, system=system, user=user)
