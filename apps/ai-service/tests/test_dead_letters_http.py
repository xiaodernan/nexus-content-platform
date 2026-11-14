"""§162 / ADR-0120 / ADR-0121 死信 HTTP 可读面（只读、有界窗口）——端口级证据。

真实走 TestClient + lifespan（不是手动塞状态）。ai-service 有自己的 .env 会自动
把 NEXUS_REDIS_URL 指向共享实例；本测试**覆盖到 DB15**（本项目专属探测库），
绝不往生产死信列表（nexus:ai:dead）写一条测试毒消息；测完把 job_dl_* 假作业一点欠账删干净。
"""

from __future__ import annotations

import asyncio

import pytest
import redis as redis_lib
from fastapi.testclient import TestClient

from ai_service.app import create_app
from ai_service.config import Settings
from ai_service.jobs import Job, RedisJobStore, MemoryJobStore
from ai_service.providers.base import Completion
from ai_service.providers.registry import Registry

PROBE_URL = "redis://localhost:56379/15"


class FakeProvider:
    kind = "llm"
    name = "fake"

    def models(self) -> list[str]:
        return ["fake-model"]

    def model_for(self, model_class: str) -> str:
        return "fake-model"

    def complete(self, *, model: str, system: str, user: str, json_mode: bool | None = None) -> Completion:
        return Completion(
            text='{"pong":true}',
            provider=self.name,
            model=model,
            tokens_in=11,
            tokens_out=7,
            latency_ms=12.0,
        )


@pytest.fixture()
def probe_redis(monkeypatch):
    monkeypatch.setenv("NEXUS_REDIS_URL", PROBE_URL)
    yield
    # 测完把假作业/死信一条欠账都不留（DB15 是本项目探测库，但不留痕迹）
    client = redis_lib.from_url(PROBE_URL, decode_responses=True)
    try:
        raws = client.lrange("nexus:ai:dead", 0, -1)
        for raw in raws:
            if "job_dl_" in raw:
                client.lrem("nexus:ai:dead", 0, raw)
        for job_key in ("nexus:ai:job:job_dl_one", "nexus:ai:job:job_dl_two"):
            client.delete(job_key)
    finally:
        client.aclose() if hasattr(client, "aclose") else client.close()


def _app():
    settings = Settings()
    registry = Registry(settings, llm=FakeProvider())
    return create_app(settings, registry=registry)


def _job(tag: str) -> Job:
    job = Job(
        id=f"job_dl_{tag}",
        requestId=f"req_dl_{tag}",
        status="failed",
        backend="redis",
        queuedAt="2026-11-14T00:00:00.000Z",
    )
    job.payload = {"prompt": "用户写的秘密内容", "model": "gpt-6-sol"}
    job.attempts = 2
    return job


def test_dead_letters_without_lifespan_reports_503():
    client = TestClient(_app())  # 没有 with：lifespan 不跑
    res = client.get("/v1/ai/jobs/dead-letters")
    assert res.status_code == 503
    assert res.json()["code"] == "internal"


def test_dead_letters_empty_with_lifespan(probe_redis):
    app = _app()
    with TestClient(app) as client:
        res = client.get("/v1/ai/jobs/dead-letters")
    assert res.status_code == 200
    body = res.json()
    assert body == {"total": 0, "limit": 50, "items": []}


def test_dead_letters_seeded_entries_are_readable_and_payload_free(probe_redis):
    app = _app()
    with TestClient(app) as client:
        state = app.state.nexus

        async def seed() -> None:
            for tag in ("one", "two"):
                await state.store.route_to_dead_letter(_job(tag), reason=f"毒消息#{tag}")

        client.portal.call(seed)

        res = client.get("/v1/ai/jobs/dead-letters")
        assert res.status_code == 200
        body = res.json()
        assert body["total"] == 2
        # 路由按 finishedAt 降序归一（顺序断言用相对关系，避免亚毫秒打点的抖动）
        stamps = [item["job"]["finishedAt"] for item in body["items"]]
        assert stamps == sorted(stamps, reverse=True)
        assert {item["job"]["jobId"] for item in body["items"]} == {"job_dl_one", "job_dl_two"}
        assert {item["reason"] for item in body["items"]} == {"毒消息#one", "毒消息#two"}
        assert {item["attempts"] for item in body["items"]} == {2}
        # payload（用户提示词原文）绝不外泄
        assert all("payload" not in item["job"] for item in body["items"])
        assert "秘密内容" not in res.text

        res = client.get("/v1/ai/jobs/dead-letters?limit=1")
        body = res.json()
        # 有界窗口：限一条且 total 报裁剪前真实总数，不少报数
        assert len(body["items"]) == 1
        assert body["total"] == 2

        res = client.get("/v1/ai/jobs/dead-letters?limit=1000")
        assert res.json()["limit"] == 200
