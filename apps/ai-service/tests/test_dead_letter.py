"""**有界死信**门（v688；ADR 0121）。

ADR 0120 落下了有界重试 + 死信，但留下一格：死信列表只随 TTL 失效、**无容量上限**，
长期失败的上游会把死信撑成第二存储。v688 把容量裁剪做成可复用小组件（`dead_letter.py`）
并直连接到两个后端：内存后端在 append 后先裁左侧最老；Redis 后端 LPUSH 后紧跟 LTRIM。

纪律（与 v681-v687 同款）：
- `AI_SERVICE_DEAD_LETTER_MAX`：非数字/负数 → 默认 500；`0` = 不限（严格回到 ADR 0120 的旧行为）。
- 判定/attempts 路径**一行不改**：裁剪只在归档尾巴裁一条刀。
- 并发 LPUSH+LTRIM 之间存在窗口——容量纪律误差、不是正确性边界（与 v683/v686 同款竞态纪律）。
- 不引入新 keyspace 族：死信仍在 `nexus:ai:dead`。
"""
from __future__ import annotations

import asyncio
import os

import pytest

from ai_service.dead_letter import (
    DEFAULT_MAX_DEAD_LETTERS,
    parse_max_dead_letters,
    trim_command,
    trim_list,
)
from ai_service.jobs import Job, MemoryJobStore


# ── 判据（钉性质不钉字面）────────────────────────────────────────────────


def _judge_bounded_keeps_newest(obs: dict) -> None:
    assert obs["len"] == obs["max_dead_letters"], (
        f"超出容量后死信必须正好是 {obs['max_dead_letters']} 条，实测 {obs['len']}"
    )
    assert obs["reasons"].count("oldest") == 0, "超出容量后最老的那一条必须被裁掉"
    assert "newest" in obs["reasons"], "最新的那一条必须留下"


# ── parse / 纯函数 ───────────────────────────────────────────────────────


def test_parse_default_is_500():
    assert parse_max_dead_letters({}) == DEFAULT_MAX_DEAD_LETTERS == 500


def test_parse_zero_means_unlimited():
    assert parse_max_dead_letters({"AI_SERVICE_DEAD_LETTER_MAX": "0"}) == 0


def test_parse_negative_means_unlimited_not_crash():
    assert parse_max_dead_letters({"AI_SERVICE_DEAD_LETTER_MAX": "-3"}) == 0


def test_parse_garbage_falls_back_to_default():
    assert parse_max_dead_letters({"AI_SERVICE_DEAD_LETTER_MAX": "soon, maybe, probably"}) == 500


def test_parse_custom_value_passthrough():
    assert parse_max_dead_letters({"AI_SERVICE_DEAD_LETTER_MAX": "12"}) == 12


def test_trim_list_no_drop_within_cap():
    items = [1, 2, 3]
    assert trim_list(items, 3) == 0 and items == [1, 2, 3]
    assert trim_list(items, 10) == 0 and items == [1, 2, 3]


def test_trim_list_drops_oldest_on_overflow():
    items = ["a", "b", "c", "d", "e"]
    assert trim_list(items, 2) == 3
    assert items == ["d", "e"]


def test_trim_list_zero_unlimited():
    items = ["a", "b", "c"]
    assert trim_list(items, 0) == 0 and items == ["a", "b", "c"]


# ── the judge pair (v683/v686 同款) ─────────────────────────────────────


def test_arm_bounded_without_guard_goes_red():
    # 假场景：没做容量修剪，reasons 里既有最老也有最新但 len 仍超界
    obs = {"len": 5, "max_dead_letters": 2, "reasons": ["oldest", "b", "c", "d", "newest"]}
    with pytest.raises(AssertionError):
        _judge_bounded_keeps_newest(obs)


def test_arm_bounded_with_guard_stays_green():
    obs = {"len": 2, "max_dead_letters": 2, "reasons": ["d", "newest"]}
    _judge_bounded_keeps_newest(obs)


# ── memory backend：毒消息走完有界重试后死信被容量约束 ─────────────────────


def test_memory_dead_letters_kept_bounded():
    async def scenario() -> None:
        store = MemoryJobStore(max_dead_letters=2)

        async def poison(tag: str) -> None:
            j = Job(id=f"job_mem_{tag}", requestId=f"req_{tag}", status="failed",
                    backend="memory", queuedAt="2026-11-13T00:00:00.000Z")
            j.attempts = 3
            await store.route_to_dead_letter(j, reason=f"毒消息#{tag}")

        for tag in ["first", "second", "third"]:
            await poison(tag)
        dead = await store.dead_letters()
        assert len(dead) == 2, f"超容量后死信必须正好留最新 2 条，实测 {len(dead)}"
        kept_ids = [d["job"]["jobId"] for d in dead]
        assert "job_mem_first" not in kept_ids, "最老的那一条必须先被裁掉"
        assert "job_mem_third" in kept_ids, "最新的那一条必须留着"
        _judge_bounded_keeps_newest({
            "len": len(dead),
            "max_dead_letters": 2,
            "reasons": ["newest"],
        })

    asyncio.run(scenario())


def test_memory_dead_letters_zero_unlimited():
    async def scenario() -> None:
        store = MemoryJobStore(max_dead_letters=0)

        async def poison(tag: str) -> None:
            j = Job(id=f"job_un_{tag}", requestId=f"req_{tag}", status="failed",
                    backend="memory", queuedAt="2026-11-13T00:00:00.000Z")
            await store.route_to_dead_letter(j, reason=f"毒消息#{tag}")

        for tag in ["a", "b", "c"]:
            await poison(tag)
        assert len(await store.dead_letters()) == 3

    asyncio.run(scenario())


# ── fake redis 腿：trim_command LTRIM 真落到 key、max_len<=0 不发网络 ──────


class _LtrimFakeRedis:
    def __init__(self) -> None:
        self.calls: list[tuple[str, int, int]] = []
        self.ok = True

    def ltrim(self, key: str, start: int, end: int):
        if not self.ok:
            raise ConnectionError("fake redis is down")
        self.calls.append((key, start, end))
        return True


def test_trim_command_issues_exact_ltrim_range():
    async def scenario():
        client = _LtrimFakeRedis()
        assert await trim_command(client, "nexus:ai:dead", 500) is True
        assert client.calls == [("nexus:ai:dead", 0, 499)]

    asyncio.run(scenario())


def test_trim_command_zero_never_calls_network():
    async def scenario():
        client = _LtrimFakeRedis()
        assert await trim_command(client, "nexus:ai:dead", 0) is False
        assert client.calls == []

    asyncio.run(scenario())


def test_trim_command_missing_ltrim_is_false_not_exception():
    class NoLtrim:
        pass

    async def scenario():
        assert await trim_command(NoLtrim(), "nexus:ai:dead", 10) is False

    asyncio.run(scenario())


def test_redis_store_records_ltrim_after_archive():
    class _FakeDeadRedis(_LtrimFakeRedis):
        def __init__(self):
            super().__init__()
            self.kv: dict[str, str] = {}
            self.lists: dict[str, list[str]] = {}

        async def _aenter(self):
            return self

        async def set(self, key, value, ex=None):
            self.kv[key] = value
            return True

        async def lpush(self, key, value):
            self.lists.setdefault(key, []).insert(0, value)
            return len(self.lists[key])

        async def expire(self, key, seconds):
            return True

        async def lrange(self, key, start, end):
            return list(self.lists.get(key, []))

    async def scenario() -> None:
        import json
        from ai_service.jobs import RedisJobStore

        client = _FakeDeadRedis()
        store = RedisJobStore(client, prefix="nexus:test", ttl_s=60, max_dead_letters=2)
        job = Job(id="job_1", requestId="r", status="failed", backend="redis", queuedAt="2026-11-13T00:00:00.000Z")
        job.attempts = 3
        await store.route_to_dead_letter(job, reason="毒消息")
        assert client.calls == [("nexus:test:dead", 0, 1)], "route_to_dead_letter 后必须 LTRIM 留最新 2 条"

    asyncio.run(scenario())


# ── 真 Redis opt-in 腿 ─────────────────────────────────────────────────────

_LIVE_SKIP = pytest.mark.skipif(
    not (os.environ.get("NEXUS_DL_REDIS_LIVE") == "1" and os.environ.get("NEXUS_DL_REDIS_URL")),
    reason="real-redis bounded-dead-letter leg opt-in: set NEXUS_DL_REDIS_LIVE=1 + NEXUS_DL_REDIS_URL",
)


@_LIVE_SKIP
def test_live_redis_dead_letters_kept_bounded_on_real_server():
    import uuid
    import redis.asyncio as aioredis

    async def scenario() -> None:
        url = os.environ["NEXUS_DL_REDIS_URL"].strip()
        prefix = f"nexus:dl:live:{uuid.uuid4().hex[:8]}"
        client = aioredis.from_url(url, decode_responses=True)

        from ai_service.jobs import RedisJobStore

        store = RedisJobStore(client, prefix=prefix, ttl_s=120, max_dead_letters=2)
        try:
            for i in range(4):
                job = Job(
                    id=f"job_dl_{i}", requestId="r", status="failed", backend="redis",
                    queuedAt="2026-11-13T00:00:00.000Z",
                )
                job.attempts = 3
                await store.route_to_dead_letter(job, reason=f"毒消息#{i}")
            raw = await client.lrange(f"{prefix}:dead", 0, -1)
            assert len(raw) == 2, f"LTRIM 之后死信只应留最新 2 条，实测 {len(raw)}"
            bodies = [r for r in raw]
            joined = " ".join(bodies)
            assert "毒消息#3" in joined and "毒消息#2" in joined
            assert "毒消息#0" not in joined and "毒消息#1" not in joined
        finally:
            await client.delete(f"{prefix}:dead")
            await client.aclose()

    asyncio.run(scenario())
