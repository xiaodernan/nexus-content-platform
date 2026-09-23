"""§162 作业队列：Queue → Worker → Progress → Result。

这一片最重要的不是"能不能异步"，而是**异步与同步走的是同一条管线**：
两条路各写一遍的话，队列里那份早晚不校验补丁、不挂审批，而测试还是两边都绿。
所以核心断言是"同一个请求，`/v1/ai/run` 的响应体与作业 `result` 逐字段相同"。

进度那条也在其列：单次 LLM 调用没有可观测的中间态，`progress` 就一直是 null，
而不是编一个 0.2 → 0.9 的假刻度（§159）。
"""

from __future__ import annotations

import json
import os
import threading
import time

import pytest
from conftest import FakeProvider, ai_request
from fastapi.testclient import TestClient

from ai_service.app import create_app
from ai_service.config import Settings
from ai_service.contract import issues as contract_issues
from ai_service.providers.base import Completion
from ai_service.providers.registry import Registry

REPLY = json.dumps(
    {
        "patches": [{"pageId": "pg_1", "ops": [{"op": "set", "nodeId": "n_headline", "path": "typography.fontSize", "value": 72}]}],
        "explanation": "已改标题",
        "labels": ["A"],
    },
    ensure_ascii=False,
)


class GatedProvider:
    """能卡住的 provider：用来证明并发上限是真的，而不是看起来只有一个在跑。"""

    name = "gated"

    def __init__(self, *, hold_s: float = 0.35) -> None:
        self.hold_s = hold_s
        self.models_list = ["gated-model"]
        self.in_flight = 0
        self.max_in_flight = 0
        self.started = threading.Event()
        self.release = threading.Event()
        self._lock = threading.Lock()

    def models(self) -> list[str]:
        return self.models_list

    def model_for(self, model_class: str) -> str:
        return "gated-model"

    def complete(self, *, model: str, system: str, user: str) -> Completion:
        with self._lock:
            self.in_flight += 1
            self.max_in_flight = max(self.max_in_flight, self.in_flight)
        self.started.set()
        self.release.wait(timeout=5)
        time.sleep(self.hold_s / 10)
        with self._lock:
            self.in_flight -= 1
        return Completion(text=REPLY, provider=self.name, model=model, tokens_in=3, tokens_out=4, latency_ms=9.0)


def queue_client(provider: object | None, *, monkeypatch: pytest.MonkeyPatch | None = None) -> TestClient:
    """带 lifespan 的客户端：队列与 worker 只有走上下文管理器才会起来。"""
    if monkeypatch is not None:
        # 内存后端是本机默认；机器上真设了 NEXUS_REDIS_URL 时不让测试被它影响
        monkeypatch.delenv("NEXUS_REDIS_URL", raising=False)
    registry = Registry(Settings(), llm=provider)  # type: ignore[arg-type]
    return TestClient(create_app(Settings(), registry=registry))


def wait_for_terminal(client: TestClient, job_id: str, *, timeout_s: float = 8.0) -> dict:
    deadline = time.monotonic() + timeout_s
    last: dict = {}
    while time.monotonic() < deadline:
        response = client.get(f"/v1/ai/jobs/{job_id}")
        assert response.status_code == 200, response.text
        last = response.json()
        if last["status"] in {"completed", "failed"}:
            return last
        time.sleep(0.05)
    raise AssertionError(f"作业 {job_id} 在 {timeout_s}s 内没有结束，最后一次状态：{last.get('status')}")


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch):
    with queue_client(FakeProvider(REPLY), monkeypatch=monkeypatch) as test_client:
        yield test_client


def submit(client: TestClient, **overrides) -> dict:
    response = client.post("/v1/ai/jobs", json=ai_request(**overrides))
    assert response.status_code == 202, response.text
    accepted = response.json()
    assert not contract_issues("ai-job-accepted.schema.json", accepted)
    return accepted


class TestQueueAndResult:
    def test_submit_is_accepted_and_the_queue_reports_itself(self, client: TestClient) -> None:
        before = client.get("/healthz").json()["queue"]
        assert before["backend"] == "memory"
        assert before["pending"] == 0 and before["running"] == 0
        assert before["capacity"] >= 1

        accepted = submit(client)
        assert accepted["status"] == "queued"
        assert accepted["requestId"] == "req_test"
        # 内存后端的限制写在报文里，不能等用户刷新页面才发现
        assert "重启即失" in accepted["note"]

        done = wait_for_terminal(client, accepted["jobId"])
        assert done["status"] == "completed"
        assert done["backend"] == "memory"

    def test_async_result_is_the_same_pipeline_as_the_sync_route(self, client: TestClient) -> None:
        """同请求 → 同响应体。这两份不一样的地方，就是异步路径漏做的校验。"""
        sync = client.post("/v1/ai/run", json=ai_request())
        assert sync.status_code == 200, sync.text
        accepted = submit(client)
        done = wait_for_terminal(client, accepted["jobId"])

        assert done["result"] == sync.json()
        assert not contract_issues("ai-response.schema.json", done["result"])
        # 补丁真的在里面：不是"作业完成了但什么都没带"
        assert done["result"]["patches"][0]["ops"][0]["op"] == "set"

    def test_progress_stays_null_because_nothing_measures_it(self, client: TestClient) -> None:
        accepted = submit(client)
        seen = []
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            body = client.get(f"/v1/ai/jobs/{accepted['jobId']}").json()
            seen.append(body["progress"])
            if body["status"] in {"completed", "failed"}:
                break
            time.sleep(0.05)
        assert set(seen) == {None}, "没有真进度来源就不该出现 0.2 / 0.9 这种编出来的刻度"
        # 里程碑仍然要有：排队、领取、结束，各说一句话
        stages = [a["stage"] for a in body["activities"]]
        assert stages[0] == "queue"
        assert any(a["summary"].startswith("worker 已领取") for a in body["activities"])
        assert any("作业结束" in a["summary"] for a in body["activities"])

    def test_failed_job_keeps_the_error_instead_of_looking_done(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """没配 provider：同步路径给 503，异步路径必须把同一个错误放进作业里并标失败。"""
        with queue_client(None, monkeypatch=monkeypatch) as no_llm:
            accepted = submit(no_llm)
            done = wait_for_terminal(no_llm, accepted["jobId"])
            assert done["status"] == "failed"
            assert "result" not in done, "失败的作业不能顺手带上一份看起来能用的结果"
            assert done["error"]["code"] == "provider-unavailable"
            assert done["finishedAt"] is not None

    def test_invalid_request_never_enters_the_queue(self, client: TestClient) -> None:
        response = client.post("/v1/ai/jobs", json={"requestId": "req_x"})
        assert response.status_code == 400
        assert "AiRequest 不符合契约" in response.json()["message"]
        # 正向对照：计数器能到非零，"这里仍是 0"才是结论而不是空断言
        gated = GatedProvider()
        with queue_client(gated, monkeypatch=None) as busy:
            busy.post("/v1/ai/jobs", json=ai_request())
            deadline = time.monotonic() + 5
            counts = busy.get("/healthz").json()["queue"]
            while counts["pending"] + counts["running"] == 0 and time.monotonic() < deadline:
                time.sleep(0.05)
                counts = busy.get("/healthz").json()["queue"]
            assert counts["pending"] + counts["running"] > 0, "队列计数器一直是 0 —— 那 §162 什么也没测到"
            gated.release.set()

    def test_unknown_job_says_where_it_would_have_been(self, client: TestClient) -> None:
        response = client.get("/v1/ai/jobs/job_不存在")
        assert response.status_code == 404
        body = response.json()
        assert "job_不存在" in body["message"]
        assert "后端" in body["hint"]


class TestWorkerConcurrency:
    def test_capacity_one_does_not_run_two_jobs_at_once(self, monkeypatch: pytest.MonkeyPatch) -> None:
        gated = GatedProvider()
        with queue_client(gated, monkeypatch=monkeypatch) as busy:
            first = submit(busy, requestId="req_a")
            second = submit(busy, requestId="req_b")
            assert gated.started.wait(timeout=5), "worker 没开始跑第一件活"
            # 第一件还卡在 provider 里时，第二件只能是 queued
            assert busy.get(f"/v1/ai/jobs/{second['jobId']}").json()["status"] == "queued"
            gated.release.set()
            assert wait_for_terminal(busy, first["jobId"])["status"] == "completed"
            assert wait_for_terminal(busy, second["jobId"])["status"] == "completed"
            assert gated.max_in_flight == 1, f"上限是 1，却同时跑了 {gated.max_in_flight} 件"

    def test_capacity_config_is_read_and_reported(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from ai_service.jobs import job_capacity

        monkeypatch.setenv("AI_SERVICE_JOB_CONCURRENCY", "3")
        assert job_capacity() == 3
        monkeypatch.setenv("AI_SERVICE_JOB_CONCURRENCY", "不像是数字")
        # 读不懂的配置按 1 处理，同时 /healthz 报的是真数而不是"3"
        assert job_capacity() == 1


class TestRedisBackend:
    """Redis 后端要连真服务测：假客户端只会测到我给自己写的那套假行为。

    默认跳过，跳过原因会打在 pytest 输出里（不是静默通过）。跑法：
        NEXUS_REDIS_URL=redis://127.0.0.1:6380/0 python -m pytest apps/ai-service/tests/test_jobs.py
    测试用的是 `nexus:ai:test:<随机>` 前缀 + 60 秒 TTL，跑完靠过期清掉，不碰别人的 key。
    """

    @pytest.mark.skipif(not os.environ.get("NEXUS_REDIS_URL"), reason="未设置 NEXUS_REDIS_URL：Redis 后端这一轮没跑")
    def test_jobs_survive_a_second_reader(self) -> None:
        import asyncio

        from ai_service.jobs import build_store

        env = {
            "NEXUS_REDIS_URL": os.environ["NEXUS_REDIS_URL"],
            "AI_SERVICE_JOB_TTL_S": "60",
        }
        prefix = f"nexus:ai:test:{uuid4()}"

        async def scenario() -> None:
            store = await build_store(env, prefix=prefix)
            assert store.backend == "redis"
            # 换一个 store：模拟"提交打到一台、轮询打到另一台"，内存后端就是在这里崩的
            reader = await build_store(env, prefix=prefix)
            try:
                job = await store.enqueue(ai_request())
                assert job.backend == "redis"
                assert await store.counts() == (1, 0)

                claimed = await store.claim()
                assert claimed is not None and claimed.id == job.id
                assert claimed.status == "running"
                # 同一个 id 不会被第二个 worker 再领走一次
                assert await store.claim() is None

                claimed.status = "completed"
                claimed.result = {"requestId": "req_test"}
                await store.save(claimed)

                fetched = await reader.get(job.id)
                assert fetched is not None and fetched.status == "completed"
                assert fetched.payload["requestId"] == "req_test"
                assert fetched.result == {"requestId": "req_test"}
                assert await reader.counts() == (0, 0)
            finally:
                await store.close()
                await reader.close()

        asyncio.run(scenario())


def uuid4() -> str:
    from uuid import uuid4 as _uuid4

    return _uuid4().hex[:8]
