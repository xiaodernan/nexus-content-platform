"""ADR 0274 — 启机期 Redis 降级档（opt-in）。

纪律：
- 默认：NEXUS_REDIS_URL 配置了但连不上 → ai-service 启动失败（原行为，不改）；
- opt-in：AI_SERVICE_ALLOW_DEGRADED_STORE=1 → 启动，但 store 是 MemoryJobStore，
  且 note 明牌【DEGRADED-BOOT】（healthz 的 note 字段会带出来）；
- 两种档位都不静默：note 绝不伪装成健康读数。
"""

from __future__ import annotations

import asyncio
import os

import pytest

from ai_service.jobs import MemoryJobStore, build_store


def test_default_raises_on_unreachable_redis():
    async def scenario():
        with pytest.raises(Exception):
            await build_store({
                "NEXUS_REDIS_URL": "redis://127.0.0.1:1/0",
                "AI_SERVICE_JOB_TTL_S": "60",
            })

    asyncio.run(scenario())


def test_opt_in_degrades_to_memory_with_loud_note():
    async def scenario():
        store = await build_store({
            "NEXUS_REDIS_URL": "redis://127.0.0.1:1/0",
            "AI_SERVICE_ALLOW_DEGRADED_STORE": "1",
            "AI_SERVICE_JOB_TTL_S": "60",
        })
        assert isinstance(store, MemoryJobStore)
        assert store.backend == "memory"
        assert "DEGRADED-BOOT" in store.note

    asyncio.run(scenario())


def test_unset_redis_url_is_plain_memory_not_degraded():
    async def scenario():
        store = await build_store({})
        assert isinstance(store, MemoryJobStore)
        assert "DEGRADED-BOOT" not in store.note

    asyncio.run(scenario())
