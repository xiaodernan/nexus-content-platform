"""MemoryJobStore 的直接判据（MQ 候选①/§SC-56）——裸打 store，不经 HTTP 与 worker。

现有 `test_jobs.py` 通过 HTTP + worker 间接证明了队列行为，但 "store 本体" 这一层没有判据：
FIFO 顺序、`_purge` 淘汰边界、取消标志与作业本体分离（worker 的 save 不抹取消请求）、
counts 的状态迁移——今天全靠读代码判断。

纪律：纯内存、同步包装（本仓不引入 pytest-asyncio，stdlib `asyncio.run` 足够），
不碰 Redis / 网络 / 时钟之外的本机状态。
"""

from __future__ import annotations

import asyncio
from typing import Any

from ai_service.jobs import MemoryJobStore, TERMINAL


def run(coro):
    return asyncio.run(coro)


def enqueue(store: MemoryJobStore, request_id: str, **extra) -> Any:
    return run(store.enqueue({"requestId": request_id, **extra}))


def claim(store: MemoryJobStore):
    return run(store.claim())


def save(store: MemoryJobStore, job) -> None:
    return run(store.save(job))


def get(store: MemoryJobStore, job_id: str):
    return run(store.get(job_id))


def counts(store: MemoryJobStore) -> tuple[int, int]:
    return run(store.counts())


def cancel(store: MemoryJobStore, job_id: str):
    return run(store.request_cancel(job_id))


def is_cancel(store: MemoryJobStore, job_id: str) -> bool:
    return run(store.is_cancel_requested(job_id))


def test_fifo_claim_order():
    store = MemoryJobStore()
    a, b, c = (enqueue(store, rid) for rid in ("req-fifo-a", "req-fifo-b", "req-fifo-c"))

    claimed = [claim(store).requestId for _ in range(3)]

    assert claimed == ["req-fifo-a", "req-fifo-b", "req-fifo-c"]
    assert claim(store) is None
    # 全部已经过 queued
    assert counts(store) == (0, 3)


def test_counts_track_queued_running_completed():
    store = MemoryJobStore()
    j1, j2 = enqueue(store, "m1"), enqueue(store, "m2")
    assert counts(store) == (2, 0)

    job = claim(store)
    assert job.id == j1.id
    assert counts(store) == (1, 1)

    job.status = "completed"
    job.finishedAt = "2026-11-11T00:00:00.000Z"
    save(store, job)
    assert counts(store) == (1, 0)

    claim(store)  # j2
    assert counts(store) == (0, 1)


def test_purge_evicts_oldest_terminal_first():
    store = MemoryJobStore(max_jobs=3)
    ids = [enqueue(store, f"purge-{i}").id for i in range(5)]
    finished_at = [f"2026-11-{day:02d}T00:00:00.000Z" for day in (1, 2, 3, 4, 5)]
    for index, job_id in enumerate(ids):
        job = get(store, job_id)
        job.status = "completed"
        job.finishedAt = finished_at[index]
        save(store, job)

    # 第 6、7 件触发 _purge：len(7) > max(3) → 淘汰 4 个最旧终结作业
    e6, e7 = enqueue(store, "purge-6").id, enqueue(store, "purge-7").id

    remaining = set(store._jobs)
    assert ids[0] not in remaining and ids[1] not in remaining and ids[2] not in remaining and ids[3] not in remaining
    assert ids[4] in remaining
    assert e6 in remaining and e7 in remaining
    assert counts(store) == (2, 0)


def test_purge_keeps_queued_jobs_when_over_capacity():
    store = MemoryJobStore(max_jobs=5)
    enqueued_ids = [enqueue(store, f"keep-{i}").id for i in range(5)]

    # 纯排队的 5 件全在上限内，不应被淘汰
    for job_id in enqueued_ids:
        assert get(store, job_id) is not None

    claimed = [claim(store).id for _ in range(5)]
    assert claimed == enqueued_ids


def test_cancelled_queued_job_is_skipped_by_claim():
    store = MemoryJobStore()
    a, b = enqueue(store, "cancel-a"), enqueue(store, "cancel-b")

    copy = cancel(store, a.id)
    assert copy is not None
    assert copy.status == "cancelled"

    # claim 跳过已落终态的 a，先给 b
    claimed = claim(store)
    assert claimed.id == b.id
    assert is_cancel(store, a.id) is True


def test_cancel_flag_survives_worker_save():
    store = MemoryJobStore()
    enqueue(store, "flag-a")
    claimed = claim(store)

    cancel(store, claimed.id)
    # worker 的 save 会整份写回 job——取消标志若与作业本体同存，会被这次写回抹掉
    claimed.status = "running"
    claimed.progress = 0.5
    save(store, claimed)

    assert is_cancel(store, claimed.id) is True


def test_cancel_after_completion_stays_terminal_but_flag_set():
    store = MemoryJobStore()
    enqueue(store, "done-a")
    claimed = claim(store)
    claimed.status = "completed"
    claimed.finishedAt = "2026-11-11T00:00:00.000Z"
    save(store, claimed)

    copy = cancel(store, claimed.id)
    assert copy is not None
    assert copy.status == "completed"  # 终态不被覆盖
    assert is_cancel(store, claimed.id) is True  # 标志照记——worker 已返回的路径靠 worker 查


def test_unknown_job_cancel_and_flag_are_honest():
    store = MemoryJobStore()
    assert cancel(store, "job_does_not_exist") is None
    assert is_cancel(store, "job_does_not_exist") is False


def test_payload_survives_until_claim():
    store = MemoryJobStore()
    enqueue(store, "payload-a", **{"kind": "image", "projectId": "p-123"})

    claimed = claim(store)
    assert claimed.payload["kind"] == "image"
    assert claimed.payload["projectId"] == "p-123"


def test_memory_backend_note_admits_multi_replica_blindness():
    store = MemoryJobStore()
    assert "多副本" in store.note
    assert "重启即失" in store.note


def test_terminal_set_is_what_the_store_recognizes():
    assert "completed" in TERMINAL and "failed" in TERMINAL and "cancelled" in TERMINAL
