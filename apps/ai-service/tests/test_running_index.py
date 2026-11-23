"""§STRESS-2 —— running 是一笔**带租约的账**，不是一次全键空间扫描。

为什么有这一片（实测，2026-11-23，本机 nexus-redis 独立 db）：旧 `counts()` 是
`LLEN + SCAN(prefix:job:*) + 每个命中一次 GET`。命令条数（不是时间——时间在这台机器上有
并行会话污染）随键空间线性涨：100 个作业键 102 条、5000 个 5026 条、21.3s；而 20000 个
**别的前缀**的键也要 101 条 SCAN——MATCH 是先遍历再过滤，不是按索引取。
`/healthz` 只给这次读数 0.35s，作业本体 TTL 又是 3600s，所以代价随**吞吐×TTL**积累：
跑过几十件作业之后队列读数就永久退化成 `counts-unavailable`，恰好在用户最多的时候。

改成 `{prefix}:jobs:running` 这个 ZSET（score=租约到期时刻）之后读数固定三条命令。
租约由 worker 心跳续（`Worker._heartbeat`），崩掉的 worker 到点自己出账。

纪律与 `test_redis_job_store.py` 同款：打**真 Redis**（`NEXUS_REDIS_URL`，缺则整文件 skipping），
每个测试独一无二前缀，收尾扫自己的前缀清干净。
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from typing import Any

import pytest

from ai_service.jobs import Job, MemoryJobStore, RedisJobStore

REDIS_URL = os.environ.get("NEXUS_REDIS_URL", "").strip()
pytestmark = pytest.mark.skipif(not REDIS_URL, reason="未设置 NEXUS_REDIS_URL：running 索引的裸判据这一轮没跑")


class CommandCounted:
    """按命令条数取证——这一条判据不许依赖时间。

    包在**实例属性**上而不是外面套一层代理：要被推翻的旧实现里 `counts()` 走的是
    `scan_iter`，它内部调 `self.scan(...)`，外层代理看不见那些往返，会把"扫了 25 轮"数成 1 条。
    """

    WATCHED = ("get", "scan", "llen", "zadd", "zrem", "zcard", "zremrangebyscore", "set", "hgetall", "mget")

    def __init__(self, client) -> None:
        self.client = client
        self.calls: dict[str, int] = {}
        for name in self.WATCHED:
            original = getattr(client, name)

            def make(original=original, name=name):
                async def counted(*args, **kwargs):
                    self.calls[name] = self.calls.get(name, 0) + 1
                    return await original(*args, **kwargs)

                return counted

            setattr(client, name, make())

    def reset(self) -> None:
        self.calls = {}

    @property
    def total(self) -> int:
        return sum(self.calls.values())


async def purge(store: RedisJobStore) -> None:
    async for key in store._r.scan_iter(match=f"{store._prefix}:*", count=200):
        await store._r.delete(key)


async def fresh(lease_s: float | None = None, ttl_s: int = 3600) -> RedisJobStore:
    return await RedisJobStore.connect(
        REDIS_URL, prefix=f"nexus:test:runidx:{uuid.uuid4().hex[:12]}", ttl_s=ttl_s, lease_s=lease_s
    )


def make_job(store: RedisJobStore, job_id: str, status: str) -> Job:
    return Job(id=job_id, requestId="r", status=status, backend=store.backend, queuedAt="2026-11-23T00:00:00.000Z")


# ── 臂 1：读数与键空间大小无关（这条就是用来推翻旧实现的）────────────────────


def test_counts_issues_a_fixed_number_of_commands_regardless_of_keyspace():
    async def scenario() -> None:
        store = await fresh()
        counted = CommandCounted(store._r)
        store._r = counted.client
        try:
            # 500 件作业本体 + 500 个别的键：旧写法在这里要发 ~1000 条命令
            for i in range(500):
                await store._r.set(
                    store._key(f"seed{i}"),
                    json.dumps({"id": f"seed{i}", "status": "running" if i % 2 else "done"}),
                    ex=120,
                )
            for i in range(500):
                await store._r.set(f"{store._prefix}:noise:{i}", "x", ex=120)

            await store.save(make_job(store, "live-1", "running"))

            counted.reset()
            pending, running = await store.counts()
            assert counted.total == 3, f"读数必须是常数条命令，实测 {counted.total} 条 {counted.calls}"
            assert running == 1 and pending == 0, (
                f"1000 个键里只有 1 件真在跑，实测 pending={pending} running={running}"
            )
            assert "get" not in counted.calls, f"读数不该再逐个读本体：{counted.calls}"
        finally:
            await purge(store)

    asyncio.run(scenario())


# ── 臂 2：租约到点自己出账（worker 崩了不把 running 永久抬高）──────────────────


def test_an_unrenewed_lease_lapses_and_the_job_stops_counting_as_running():
    async def scenario() -> None:
        store = await fresh(lease_s=0.3, ttl_s=3600)
        try:
            await store.save(make_job(store, "crashed", "running"))
            assert (await store.counts())[1] == 1, "刚记上就在跑"
            await asyncio.sleep(0.45)
            assert (await store.counts())[1] == 0, "没人续租=那个 worker 已经死了，还报在跑就是虚账"
            assert await store._r.exists(store._key("crashed")) == 1, (
                "出账只该摘索引：作业本体还在，GET /v1/ai/jobs/{id} 仍答得出来"
            )
        finally:
            await purge(store)

    asyncio.run(scenario())


# ── 臂 3：迟到的心跳不能把终态作业复活（选 xx=True 的理由）─────────────────────


def test_a_late_heartbeat_cannot_resurrect_a_finished_job():
    async def scenario() -> None:
        store = await fresh(lease_s=30.0, ttl_s=3600)
        try:
            job = make_job(store, "racing", "running")
            await store.save(job)
            # 心跳与落终态是两条独立的路：这一拍在路上时，作业已经写完了 completed
            await store.save(make_job(store, "racing", "completed"))
            await store.renew_lease("racing")
            assert (await store.counts())[1] == 0, (
                "续租用了普通 ZADD 的话，这里会凭空多一件在跑的——账上就再也分不清真假"
            )
        finally:
            await purge(store)

    asyncio.run(scenario())


# ── 臂 4：还在跑的作业靠心跳活着（租约短才不会虚报，前提是这个）─────────────────


def test_the_heartbeat_extends_a_still_running_job_past_its_lease():
    async def scenario() -> None:
        store = await fresh(lease_s=0.4, ttl_s=3600)
        from ai_service.jobs import Worker

        worker = Worker(store, None, capacity=1, poll_s=0.05)  # type: ignore[arg-type]
        try:
            await store.save(make_job(store, "slow", "running"))
            # 只借心跳这一段：_loop 要真跑 provider，而这一臂要证的恰好与执行无关
            worker._inflight.add("slow")
            beat = asyncio.create_task(worker._heartbeat())
            await asyncio.sleep(0.9)  # 跨过两个租约周期
            assert (await store.counts())[1] == 1, "心跳一直在续，长跑的作业不该从 running 里掉出去"
        finally:
            worker._stopping.set()
            await beat
            await purge(store)

    asyncio.run(scenario())


# ── 臂 5：两个后端口径一致（status==running 只有一套定义）─────────────────────


def test_memory_and_redis_backends_agree_on_the_same_lifecycle():
    async def finish(store: Any, job: Job, status: str) -> Job:
        job.status = status
        await store.save(job)
        return job

    async def scenario() -> None:
        redis_store = await fresh(lease_s=60.0, ttl_s=3600)
        memory = MemoryJobStore()

        async def step(expected: tuple[int, int], label: str) -> None:
            got_redis = await redis_store.counts()
            got_memory = await memory.counts()
            assert got_redis == got_memory == expected, (
                f"{label}：redis 报 {got_redis}、memory 报 {got_memory}、应为 {expected}"
            )

        try:
            claimed: list[tuple[Job, Job]] = []
            for i in range(3):
                await redis_store.enqueue({"requestId": f"r{i}", "prompt": "x"})
                await memory.enqueue({"requestId": f"r{i}", "prompt": "x"})
            await step((3, 0), "三件排队")

            for _ in range(2):
                pair = (await redis_store.claim(), await memory.claim())
                assert pair[0] is not None and pair[1] is not None
                claimed.append(pair)
            await step((1, 2), "领走两件")

            # 一件跑完、一件回队重试：running 必须跟着掉，且不许同时出现在 pending 里
            await finish(redis_store, claimed[0][0], "completed")
            await finish(memory, claimed[0][1], "completed")
            await step((1, 1), "一件完成")

            await redis_store.requeue(await finish(redis_store, claimed[1][0], "queued"))
            await memory.requeue(await finish(memory, claimed[1][1], "queued"))
            await step((2, 0), "一件回队重试")
            assert redis_store.lease_s > 0 and memory.lease_s == 0.0, "内存后端不该假装自己有租约可续"
        finally:
            await purge(redis_store)

    asyncio.run(scenario())


# ── 臂 6：终态一律摘账；重试回队也不许同时算两件 ──────────────────────────────


def test_every_terminal_path_clears_the_index_and_a_retry_is_not_double_counted():
    async def scenario() -> None:
        store = await fresh(lease_s=60.0, ttl_s=3600)
        try:
            for status in ("completed", "failed", "cancelled"):
                await store.save(make_job(store, f"t-{status}", "running"))
                assert (await store.counts())[1] == 1
                await store.save(make_job(store, f"t-{status}", status))
                assert (await store.counts()) == (0, 0), f"{status} 之后还在跑就是没摘干净"

            # 重试：running → queued 回队，这一件只能出现在 pending 里一次
            await store.save(make_job(store, "retry-1", "running"))
            await store.requeue(make_job(store, "retry-1", "queued"))
            pending, running = await store.counts()
            assert (pending, running) == (1, 0), f"一件事记两次：pending={pending} running={running}"

            # 死信归档也是终态：它绕过过 save 的历史路径，必须同样摘账
            await store.save(make_job(store, "poison", "running"))
            poison = make_job(store, "poison", "failed")
            poison.attempts = 3
            await store.route_to_dead_letter(poison, reason="毒消息")
            assert (await store.counts())[1] == 0, "路由死信后还在跑，等于同一件失败作业永远占着容量"
        finally:
            await purge(store)

    asyncio.run(scenario())


# ── 臂 7：租约不许比本体活得久（构造期就把永久虚账挡掉）───────────────────────


def test_a_lease_longer_than_the_body_ttl_is_refused_at_construction():
    for bad in (3600.0, 7200.0, 0.0, -1.0):
        with pytest.raises(ValueError):
            RedisJobStore(object(), prefix="nexus:test:invariant", ttl_s=3600, lease_s=bad)  # type: ignore[arg-type]
    # 不点名时默认值必须自己满足这条：默认值违约等于每个部署都带着隐患
    store = RedisJobStore(object(), prefix="nexus:test:invariant", ttl_s=3600)  # type: ignore[arg-type]
    assert 0 < store.lease_s < 3600
    short = RedisJobStore(object(), prefix="nexus:test:invariant", ttl_s=1)  # type: ignore[arg-type]
    assert 0 < short.lease_s < 1, "短 TTL 的部署（测试里 1s 过期）也必须构造得出来"


# ── 臂 8：索引键不许混进作业本体的命名空间 ──────────────────────────────────


def test_the_index_key_is_not_shaped_like_a_job_body():
    async def scenario() -> None:
        store = await fresh(lease_s=60.0, ttl_s=3600)
        try:
            import fnmatch

            await store.save(make_job(store, "x", "running"))
            keys = [k async for k in store._r.scan_iter(match=f"{store._prefix}:*", count=200)]
            index = store._running_key
            assert index in keys, "索引没建出来，前面几条臂量的都是空账"
            assert not fnmatch.fnmatch(index, f"{store._prefix}:job:*"), (
                "索引键混进 `job:*` 的话，任何按本体前缀找作业的逻辑都会把一个 ZSET 当 JSON 读"
            )
        finally:
            await purge(store)

    asyncio.run(scenario())


# ── 臂 9：账是跨连接可见的（这才是把它放进 Redis 的全部理由）──────────────────


def test_a_second_connection_reads_the_running_index_written_by_the_first():
    async def scenario() -> None:
        writer = await fresh(lease_s=60.0, ttl_s=3600)
        try:
            await writer.save(make_job(writer, "cross", "running"))
            reader = await RedisJobStore.connect(
                REDIS_URL, prefix=writer._prefix, ttl_s=3600, lease_s=60.0
            )
            try:
                assert (await reader.counts())[1] == 1, (
                    "换一个连接读不到，多副本部署时轮询打到另一台就报 0——那和内存后端没区别"
                )
            finally:
                await reader.close()
        finally:
            await purge(writer)

    asyncio.run(scenario())


# ── 臂 10：读数把过期租约清干净，不留垃圾键 ─────────────────────────────────


def test_reading_the_queue_also_reclaims_the_lapsed_entries():
    async def scenario() -> None:
        store = await fresh(lease_s=0.2, ttl_s=3600)
        try:
            for i in range(20):
                await store.save(make_job(store, f"ghost-{i}", "running"))
            await asyncio.sleep(0.35)
            await store.counts()
            # ZREMRANGEBYSCORE 摘空整个集合后键本身必须消失：留下一个空 ZSET 是没人回收的常驻内存
            assert await store._r.exists(store._running_key) == 0, "过期条目只是读不出来，没被真正回收"
        finally:
            await purge(store)

    asyncio.run(scenario())


# ── 臂 11：心跳由 start() 起，且只在有租约的后端起 ─────────────────────────


def test_start_only_launches_the_heartbeat_when_there_is_a_lease_to_renew():
    """第四臂是手工把 `_heartbeat()` 提成任务的，所以它证明不了**生产路径**起了心跳。

    这一臂补的就是那一格：`Worker.start()` 在 Redis 后端必须多一个任务，在内存后端必须一个
    都不多（`lease_s == 0`，起个空转任务只是噪声）。忘了起心跳的失败模式最难看见：长跑作业
    到点自己掉账，`/healthz` 把"正在跑"报成 0，数字看着完全正常，只是少了。
    """
    async def scenario() -> None:
        from ai_service.jobs import Worker

        store = await fresh(lease_s=0.4, ttl_s=3600)
        redis_worker = Worker(store, None, capacity=2, poll_s=0.05)  # type: ignore[arg-type]
        memory_worker = Worker(MemoryJobStore(), None, capacity=2, poll_s=0.05)  # type: ignore[arg-type]
        try:
            await redis_worker.start()
            await memory_worker.start()
            assert len(redis_worker._tasks) == 3, (
                f"Redis 后端该是 2 个领作业的 + 1 个心跳，实测 {len(redis_worker._tasks)}"
            )
            assert len(memory_worker._tasks) == 2, (
                f"内存后端没有租约可续，多起的任务只会空转：实测 {len(memory_worker._tasks)}"
            )
            assert not memory_worker._inflight and not redis_worker._inflight, (
                "还没领到作业就在 _inflight 里记了 id，心跳会给不存在的作业续租"
            )
        finally:
            await purge(store)
            await redis_worker.stop()
            await memory_worker.stop()

    asyncio.run(scenario())
