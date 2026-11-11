"""RedisJobStore 的裸判据（§SC-57）——打**真 Redis**，不 mock，走 `NEXUS_REDIS_URL` 通道。

遵照 §163 的纪律：跨进程队列唯一要证的是"两条独立连接对得上同一批作业"，
mock 掉线路就等于把要测的东西测了个空。缺 env 则整文件 skipping（不假跑）。
每次测试用独一无二的前缀（`nexus:test:sc57:<uuid>`），收尾 `scan_iter` 清掉自己的键，
不留测试垃圾、不碰别的前缀。

写法说明：aioredis 的连接池绑定创建它的事件循环——每个测试用**同一个**
`asyncio.run(scenario())` 包整个场景（断言、清理全在一个 loop 里），绝不每条指令一个 loop。

关键场景：
- FIFO claim + 取消排队作业 → 从 pending list **真摘掉**（否则 counts 永远多一件）
- TTL 过期的旧 id 从 LPOP 被跳过（claim 链不卡住）
- 取消 running 的标志独立于作业本体 JSON（worker 整份写回不抹取消）
- counts 两边口径一致（memory 同）
- 前缀隔离：不同前缀的 store 谁也看不见谁
"""

from __future__ import annotations

import asyncio
import os
import time
import uuid

import pytest

from ai_service.jobs import RedisJobStore

REDIS_URL = os.environ.get("NEXUS_REDIS_URL", "").strip()
pytestmark = pytest.mark.skipif(not REDIS_URL, reason="未设置 NEXUS_REDIS_URL：RedisJobStore 裸判据这一轮没跑")


async def purge_keys(store: RedisJobStore) -> None:
    async for key in store._r.scan_iter(match=f"{store._prefix}:*", count=100):
        await store._r.delete(key)


async def fresh_store(ttl: int = 60) -> RedisJobStore:
    return await RedisJobStore.connect(REDIS_URL, prefix=f"nexus:test:sc57:{uuid.uuid4().hex[:12]}", ttl_s=ttl)


def test_fifo_enqueue_and_claim():
    async def scenario() -> None:
        store = await fresh_store()
        try:
            a = await store.enqueue({"requestId": "fifo-a"})
            b = await store.enqueue({"requestId": "fifo-b"})
            c = await store.enqueue({"requestId": "fifo-c"})

            claimed = [(await store.claim()).requestId for _ in range(3)]

            assert claimed == ["fifo-a", "fifo-b", "fifo-c"]
            assert await store.claim() is None
            pending, running = await store.counts()
            assert (pending, running) == (0, 3)
        finally:
            await purge_keys(store)
            await store.close()

    asyncio.run(scenario())


def test_expired_job_key_is_skipped_not_claimed_as_ghost():
    async def scenario() -> None:
        store = await fresh_store(ttl=1)
        try:
            await store.enqueue({"requestId": "expired-victim"})
            # ttl=1：1.2s 后作业键消失，只剩 pending list 里的游魂
            time.sleep(1.2)

            claimed = await store.claim()

            assert claimed is None  # claim 走过 LPOP 弹了死 id，照样回 None，而不是卡住/假作业
        finally:
            await purge_keys(store)
            await store.close()

    asyncio.run(scenario())


def test_cancelled_queued_job_is_removed_from_pending_list():
    async def scenario() -> None:
        store = await fresh_store()
        try:
            a = await store.enqueue({"requestId": "cancel-a"})
            b = await store.enqueue({"requestId": "cancel-b"})

            result = await store.request_cancel(a.id)
            assert result is not None and result.status == "cancelled"

            pending, running = await store.counts()
            assert (pending, running) == (1, 0)  # 已摘，别多算 a

            claimed = await store.claim()
            assert claimed is not None and claimed.id == b.id
            assert await store.claim() is None
        finally:
            await purge_keys(store)
            await store.close()

    asyncio.run(scenario())


def test_cancel_running_job_flag_is_independent_of_job_body():
    async def scenario() -> None:
        store = await fresh_store()
        try:
            await store.enqueue({"requestId": "flag-a"})
            claimed = await store.claim()
            assert claimed is not None

            result = await store.request_cancel(claimed.id)
            assert result is not None

            # worker 常做的事：整份 JSON 写回（含 progress 变化）
            claimed.progress = 0.9
            claimed.status = "running"
            await store.save(claimed)

            assert await store.is_cancel_requested(claimed.id) is True
            snapshot = await store.get(claimed.id)
            assert snapshot is not None and snapshot.status == "running"
        finally:
            await purge_keys(store)
            await store.close()

    asyncio.run(scenario())


def test_unknown_cancel_is_honest():
    async def scenario() -> None:
        store = await fresh_store()
        try:
            assert await store.request_cancel("job_nope") is None
            assert await store.is_cancel_requested("job_nope") is False
        finally:
            await purge_keys(store)
            await store.close()

    asyncio.run(scenario())


def test_prefix_isolation():
    async def scenario() -> None:
        store_a = await fresh_store()
        store_b = await fresh_store()
        try:
            await store_a.enqueue({"requestId": "iso-a"})
            await store_b.enqueue({"requestId": "iso-b"})

            assert (await store_a.claim()).requestId == "iso-a"
            assert (await store_b.claim()).requestId == "iso-b"
            pending_a, _ = await store_a.counts()
            pending_b, _ = await store_b.counts()
            assert (pending_a, pending_b) == (0, 0)
        finally:
            await purge_keys(store_a)
            await purge_keys(store_b)
            await store_a.close()
            await store_b.close()

    asyncio.run(scenario())


def test_redis_backend_note_tells_the_truth():
    async def scenario() -> None:
        store = await fresh_store()
        try:
            assert "Redis" in store.note
            assert "多副本" in store.note
        finally:
            await purge_keys(store)
            await store.close()

    asyncio.run(scenario())


def test_full_cycle_enqueue_to_completion_counts_land_at_zero_zero():
    async def scenario() -> None:
        store = await fresh_store()
        try:
            await store.enqueue({"requestId": "cycle-a"})
            await store.enqueue({"requestId": "cycle-b"})
            assert await store.counts() == (2, 0)

            first = await store.claim()
            assert await store.counts() == (1, 1)
            first.status = "completed"
            first.finishedAt = "2026-11-11T00:00:00.000Z"
            await store.save(first)

            assert await store.counts() == (1, 0)
            second = await store.claim()
            second.status = "completed"
            second.finishedAt = "2026-11-11T00:00:01.000Z"
            await store.save(second)
            assert await store.counts() == (0, 0)
        finally:
            await purge_keys(store)
            await store.close()

    asyncio.run(scenario())
