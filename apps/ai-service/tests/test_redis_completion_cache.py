"""**跨实例共享 LLM completion 缓存**门（v686，Redis 后端；ADR 0119）。

v680 的 `LlmCompletionCache` 是进程内组件；本片把 "(model, system, user) → Completion" 做成
跨进程共享的可复用组件：多副本部署时一次真调用、全集群复用命中（缓存命中**不是**新调用，
不进 usage、不计费）。v686 沿用 ADR 0110 三段式：真值门 + 恒跑变异臂 + 真 Redis opt-in 腿

（函数级 skipif；两个独立 client = 两个“进程”的字节往返；未设环境不发网络、不假绿；设了却
连不上**报错**而非 skip）。集群共享事实由 Redis 自己提供（SET EX / ZADD / TTL 到点自动消失），
LRU 索引是独立一个 zset，store 顺手摊销修剪（过期成员数 k 决定成本，非缓存总条数）。

"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest

from ai_service.completion_cache import LlmCompletionCache
from ai_service.providers.base import Completion
from ai_service.redis_completion_cache import RedisLlmCompletionCache

_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class _Clock:
    """epoch ms 可行进时钟：TTL/LRU/修剪三条腿共用它，门才确定性。"""

    def __init__(self) -> None:
        self.t = 1_000_000.0  # epoch ms 本体（浮点足够整数用）

    def __call__(self) -> int:
        return int(self.t)

    def advance(self, ms: float) -> None:
        self.t += ms


def _completion(text: str = "答案", **kw: Any) -> Completion:
    base = dict(
        text=text,
        provider="openai-compatible",
        model="gpt-6-sol",
        tokens_in=12,
        tokens_out=34,
        latency_ms=456.0,
    )
    base.update(kw)
    return Completion(**base)


class FakeRedis:
    """多实例共享同一个 dict/zset = 同一个 Redis 服务器；断连可注入。

    TTL 与 zset 都必须共享：真实场景里 A 实例 SET EX 的过期时间，B 实例 GET 时也要能看到
    （两个 client 连的是同一台服务器）。只共享 s 不共享 t/z 会让跨实例腿假红。
    """

    def __init__(self, shared: dict | None = None, shared_z: dict | None = None,
                 clock: _Clock | None = None) -> None:
        self.s = shared if shared is not None else {}
        self.t = {}          # key -> epoch seconds (float)
        self.z = shared_z if shared_z is not None else {}
        self.clock = clock or _Clock()
        self.down = False
        self.ops = 0

    def _check(self) -> None:
        if self.down:
            raise ConnectionError("fake redis is down")

    def _expire_if_needed(self, key: str) -> None:
        exp = self.t.get(key)
        if exp is not None and self.clock.t >= exp:
            self.s.pop(key, None)
            self.t.pop(key, None)

    def get(self, key: str):
        self._check()
        self.ops += 1
        self._expire_if_needed(key)
        return self.s.get(key)

    def set(self, key: str, value: str, ex: int | None = None):
        self._check()
        self.ops += 1
        self.s[key] = value
        if ex is not None:
            self.t[key] = self.clock.t + ex * 1000.0  # ex 是秒；clock 是毫秒
        return True

    def delete(self, *keys: str):
        self._check()
        self.ops += 1
        n = 0
        for k in keys:
            self._expire_if_needed(k)
            if k in self.s:
                self.s.pop(k, None)
                n += 1
            self.t.pop(k, None)
            if k in self.z:
                self.z.pop(k, None)
                n += 1
        return n

    def zadd(self, key: str, mapping: dict):
        self._check()
        self.ops += 1
        self._expire_if_needed(key)
        zs = self.z.setdefault(key, {})
        for member, score in mapping.items():
            zs[member] = float(score)
        return len(mapping)

    def zcard(self, key: str):
        self._check()
        self.ops += 1
        self._expire_if_needed(key)
        return len(self.z.get(key, {}))

    def zrange(self, key: str, start: int, stop: int):
        self._check()
        self.ops += 1
        self._expire_if_needed(key)
        members = sorted(self.z.get(key, {}).items(), key=lambda kv: (kv[1], kv[0]))
        keys = [m for m, _ in members]
        n = len(keys)
        if stop == -1:
            stop = n - 1
        if stop < 0:
            stop = n + stop
        if start < 0:
            start = n + start
        return keys[start:stop + 1]

    def zrangebyscore(self, key: str, min_: str, max_: str):
        self._check()
        self.ops += 1
        self._expire_if_needed(key)

        def bound(b):
            b = str(b)
            if b == "-inf":
                return float("-inf")
            if b == "+inf":
                return float("inf")
            return float(b)

        lo, hi = bound(min_), bound(max_)
        members = sorted(
            ((m, s) for m, s in self.z.get(key, {}).items() if lo <= s <= hi),
            key=lambda kv: (kv[1], kv[0]),
        )
        return [m for m, _ in members]

    def zrem(self, key: str, *members: str):
        self._check()
        self.ops += 1
        self._expire_if_needed(key)
        zs = self.z.get(key, {})
        n = 0
        for m in members:
            if m in zs:
                zs.pop(m)
                n += 1
        return n

    def exists(self, key: str):
        self._check()
        self.ops += 1
        self._expire_if_needed(key)
        return 1 if key in self.s else 0


def _cache(client: FakeRedis, *, ns: str = "nexus:llmc", ttl_s: float = 60.0,
           max_entries: int = 256):
    return RedisLlmCompletionCache(
        client, namespace=ns, ttl_s=ttl_s, max_entries=max_entries,
        now_ms=client.clock,
    )


_KEY = LlmCompletionCache.key(model="gpt-6-sol", system="你是编辑", user="写一句：你好")


# ── 判据（钉性质不钉字面）────────────────────────────────────────────────

def _judge_eviction(obs: dict[str, Any]) -> None:
    """LRU 触碰过的成员必须得到保护：新来者挤掉最久未用的，不是挤掉最近用过的。"""
    assert obs["evicted"] == "b", f"该被淘汰的是没触碰过的 b，实测 {obs['evicted']}"
    assert obs["a_survives"] is True, "触碰过的 a 被误淘汰"


def _judge_degrade_honest(obs: dict[str, Any]) -> None:
    """断连降级必须如实标注，绝不谎称仍共享。"""
    assert obs["shared"] is False, "断连时 stats().shared 必须为 False（不谎称共享）"
    assert obs["degraded"] is True, "断连时必须标注 degraded"
    assert obs["miss_not_crash"] is True, "断连时 get 必须回 None（按 miss），不许把异常抛给调用方"


def _judge_isolation(obs: dict[str, Any]) -> None:
    """命名空间隔离：A 写入、B 读不到；B 的 clear 也删不到 A 的条目。"""
    assert obs["b_saw_a"] is False, "命名空间泄漏：B 读到了 A 的缓存"
    assert obs["a_survived_b_clear"] is True, "命名空间泄漏：B 的 clear 删掉了 A 的条目"


# ── 真值腿 ─────────────────────────────────────────────────────────────────


def test_store_then_get_roundtrip():
    c = FakeRedis()
    cache = _cache(c, ttl_s=60.0, max_entries=8)
    cache.store(_KEY, _completion())
    got = cache.get(_KEY)
    assert got is not None
    assert got.text == "答案"
    assert got.tokens_in == 12 and got.tokens_out == 34
    assert got.latency_ms == 456.0 and got.model == "gpt-6-sol" and got.provider == "openai-compatible"
    stats = cache.stats()
    assert stats.hits == 1 and stats.misses == 0 and stats.stores == 1
    assert stats.shared is True and stats.degraded is False


def test_unknown_key_misses():
    c = FakeRedis()
    cache = _cache(c)
    assert cache.get(_KEY) is None
    assert cache.stats().misses == 1


def test_ttl_expiry_via_redis_ttl_and_lru_prune():
    c = FakeRedis()
    cache = _cache(c, ttl_s=10.0, max_entries=8)
    cache.store(_KEY, _completion())
    c.clock.advance(11_000)  # 过 10s TTL
    assert cache.get(_KEY) is None  # Redis TTL 到点，条目已消失
    # 未命中不顺手修 zset（O(1) 纪律）；len 先摊销修剪再报数，过期成员计 expirations
    assert len(cache) == 0
    assert cache.stats().expirations == 1
    assert cache.stats().misses == 1


def test_lru_eviction_removes_oldest_entry_and_zset_member():
    from ai_service.redis_completion_cache import _digest
    c = FakeRedis()
    cache = _cache(c, ttl_s=60.0, max_entries=2)
    k1 = LlmCompletionCache.key(model="m", system="s", user="u1")
    k2 = LlmCompletionCache.key(model="m", system="s", user="u2")
    k3 = LlmCompletionCache.key(model="m", system="s", user="u3")
    cache.store(k1, _completion("one"))
    c.clock.advance(1000)
    cache.store(k2, _completion("two"))
    c.clock.advance(1000)
    cache.store(k3, _completion("three"))  # k1 溢出被淘汰
    assert cache.get(k1) is None
    assert cache.get(k2) is not None and cache.get(k3) is not None
    assert cache.stats().evictions == 1
    # 被淘汰的 entry 不许留孤儿字节；zset 里也不许留成员
    assert f"nexus:llmc:e:{_digest(k1)}" not in c.s
    assert _digest(k1) not in c.z.get("nexus:llmc:lru", {})


def test_lru_touch_on_hit_protects_from_eviction():
    c = FakeRedis()
    cache = _cache(c, ttl_s=60.0, max_entries=2)
    k1 = LlmCompletionCache.key(model="m", system="s", user="a")
    k2 = LlmCompletionCache.key(model="m", system="s", user="b")
    k3 = LlmCompletionCache.key(model="m", system="s", user="c")
    cache.store(k1, _completion("a"))
    c.clock.advance(1000)
    cache.store(k2, _completion("b"))
    c.clock.advance(1000)
    assert cache.get(k1) is not None  # 触碰 k1，k2 现在是最久未用
    c.clock.advance(1000)
    cache.store(k3, _completion("c"))  # 淘汰最久未用的 k2
    _judge_eviction({"evicted": "b" if cache.get(k2) is None else "a",
                     "a_survives": cache.get(k1) is not None})


def test_corrupt_payload_is_miss_and_self_heals():
    c = FakeRedis()
    cache = _cache(c, ttl_s=60.0, max_entries=8)
    cache.store(_KEY, _completion())
    digest = _ekey_of(cache, _KEY)
    assert digest in c.s
    c.s[digest] = "这不是 JSON"  # 直接写毒字节
    assert cache.get(_KEY) is None
    assert cache.stats().corruptions == 1
    assert digest not in c.s  # 顺手删，自愈


def test_corrupt_bool_tokens_are_rejected():
    c = FakeRedis()
    cache = _cache(c, ttl_s=60.0, max_entries=8)
    cache.store(_KEY, _completion())
    digest = _ekey_of(cache, _KEY)
    c.s[digest] = json.dumps({"v": 1, "completion": {
        "text": "x", "provider": "p", "model": "m",
        "tokens_in": True, "tokens_out": 1, "latency_ms": 1,  # bool 不算 int
    }})
    assert cache.get(_KEY) is None
    assert cache.stats().corruptions == 1


def test_overwrite_refreshes_ttl_window():
    c = FakeRedis()
    cache = _cache(c, ttl_s=10.0, max_entries=8)
    cache.store(_KEY, _completion("第一版"))
    c.clock.advance(6000)
    cache.store(_KEY, _completion("第二版"))  # 重存刷新 TTL 起点
    c.clock.advance(6000)  # 距第二次写入 6s，仍在窗口内
    got = cache.get(_KEY)
    assert got is not None and got.text == "第二版"


def test_redis_outage_fails_open_and_reports_degraded():
    c = FakeRedis()
    cache = _cache(c, ttl_s=60.0, max_entries=8)
    cache.store(_KEY, _completion())
    c.down = True
    assert cache.get(_KEY) is None  # 断连 = miss，不抛
    stats = cache.stats()
    assert stats.shared is False and stats.degraded is True
    cache.store(_KEY, _completion("别存"))  # 静默吞掉
    assert cache.stats().stores_failed == 1
    c.down = False
    assert cache.get(_KEY) is not None  # 恢复后真相回到 shared
    assert cache.stats().shared is True and cache.stats().degraded is False


def test_namespace_isolation_between_caches_on_same_client():
    c = FakeRedis()
    a = _cache(c, ns="nexus:llmc-a")
    b = _cache(c, ns="nexus:llmc-b")
    a.store(_KEY, _completion("A 的内容"))
    b_saw_a = b.get(_KEY) is not None
    b.clear()
    obs = {"b_saw_a": b_saw_a, "a_survived_b_clear": a.get(_KEY) is not None}
    _judge_isolation(obs)


def test_clear_empties_namespace():
    c = FakeRedis()
    cache = _cache(c, ttl_s=60.0, max_entries=8)
    cache.store(_KEY, _completion())
    cache.clear()
    assert cache.get(_KEY) is None
    assert len(cache) == 0


def test_get_ops_stay_constant_regardless_of_fill():
    c = FakeRedis()
    cache = _cache(c, ttl_s=3600.0, max_entries=300)
    keys = [LlmCompletionCache.key(model="m", system="s", user=f"u{i}") for i in range(150)]
    for k in keys:
        cache.store(k, _completion())
    base = c.ops
    cache.get(keys[0])
    delta = c.ops - base
    assert delta <= 4, f"get 的 Redis 命令数随填充量变大了（{delta}）——O(1) 纪律破了"


def test_store_ops_stay_constant_regardless_of_fill():
    c = FakeRedis()
    cache = _cache(c, ttl_s=3600.0, max_entries=300)
    keys = [LlmCompletionCache.key(model="m", system="s", user=f"u{i}") for i in range(150)]
    for k in keys[:149]:
        cache.store(k, _completion())
    base = c.ops
    cache.store(keys[-1], _completion())
    delta = c.ops - base
    # SET + ZADD + ZRANGEBYSCORE + ZCARD（<=上限时无 ZRANGE/DEL）= 4
    assert delta <= 8, f"store 的 Redis 命令数随填充量变大了（{delta}）——O(1) 纪律破了"


def test_payload_with_wrong_version_is_rejected():
    c = FakeRedis()
    cache = _cache(c, ttl_s=60.0, max_entries=8)
    cache.store(_KEY, _completion())
    digest = _ekey_of(cache, _KEY)
    c.s[digest] = json.dumps({"v": 999, "completion": {}})
    assert cache.get(_KEY) is None
    assert cache.stats().corruptions == 1


def test_all_redis_keys_live_inside_namespace():
    c = FakeRedis()
    cache = _cache(c, ttl_s=60.0, max_entries=8)
    cache.store(_KEY, _completion())
    cache.get(_KEY)
    for k in c.s:
        assert k.startswith("nexus:llmc:"), f"entry key 逃逸出命名空间: {k}"
    for k in c.z:
        assert k == "nexus:llmc:lru", f"zset 逃逸出命名空间: {k}"
    assert set(c.t) == {k for k in c.s}, "TTL 账本与 entry 键必须一一对应"


def test_arm_lru_touch_missing_makes_judge_red():
    # 假场景：触碰被弄丢，k2（最久未用仍被当“最近用过”）
    obs = {"evicted": "a", "a_survives": False}
    with pytest.raises(AssertionError):
        _judge_eviction(obs)


def test_arm_degrade_lying_makes_judge_red():
    obs = {"shared": True, "degraded": False, "miss_not_crash": True}
    with pytest.raises(AssertionError):
        _judge_degrade_honest(obs)


def test_arm_isolation_breach_makes_judge_red():
    obs = {"b_saw_a": True, "a_survived_b_clear": True}
    with pytest.raises(AssertionError):
        _judge_isolation(obs)


def _ekey_of(cache, key):
    from ai_service.redis_completion_cache import _digest
    return cache._ekey(_digest(key))


_LIVE_SKIP = pytest.mark.skipif(
    not (os.environ.get("NEXUS_LLMC_REDIS_LIVE") == "1" and os.environ.get("NEXUS_LLMC_REDIS_URL")),
    reason="real-redis completion-cache leg opt-in: set NEXUS_LLMC_REDIS_LIVE=1 + NEXUS_LLMC_REDIS_URL",
)


@_LIVE_SKIP
def test_live_two_processes_share_completion_over_real_redis():
    """56379：两个独立 client（模拟两“进程”）共享同一份 completion。"""
    import time as _time
    import uuid
    import redis as redis_lib
    url = os.environ["NEXUS_LLMC_REDIS_URL"].strip()
    ns = f"nexus:llmc:live:{uuid.uuid4().hex[:8]}"
    a = RedisLlmCompletionCache(
        redis_lib.from_url(url, decode_responses=True), namespace=ns, ttl_s=30.0, max_entries=16)
    b = RedisLlmCompletionCache(
        redis_lib.from_url(url, decode_responses=True), namespace=ns, ttl_s=30.0, max_entries=16)
    key = LlmCompletionCache.key(model="gpt-6-sol", system="你是编辑", user=f"live {uuid.uuid4().hex}")
    try:
        a.store(key, _completion("跨实例实锤"))
        got = b.get(key)
        assert got is not None, "实例 B 没读到实例 A 写入的 completion（没共享）"
        assert got.text == "跨实例实锤"
        assert got.tokens_in == 12 and got.tokens_out == 34
        assert b.stats().hits == 1
    finally:
        a.clear()
        b.clear()


@_LIVE_SKIP
def test_live_ttl_expiry_removes_entry_on_real_redis():
    import time as _time
    import uuid
    import redis as redis_lib
    url = os.environ["NEXUS_LLMC_REDIS_URL"].strip()
    ns = f"nexus:llmc:live:{uuid.uuid4().hex[:8]}"
    cache = RedisLlmCompletionCache(
        redis_lib.from_url(url, decode_responses=True), namespace=ns, ttl_s=1.0, max_entries=16)
    key = LlmCompletionCache.key(model="gpt-6-sol", system="s", user=f"live {uuid.uuid4().hex}")
    try:
        cache.store(key, _completion("稍后消失"))
        assert cache.get(key) is not None
        _time.sleep(1.5)  # Redis TTL 到点
        assert cache.get(key) is None
    finally:
        cache.clear()
