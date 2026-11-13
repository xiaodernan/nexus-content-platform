"""跨进程 single-flight 门（v697 / ADR 0129，ADR 0128 仍欠 ①）。

被测对象：`distributed_flight.DistributedSingleFlight` / `CompositeFlight` /
`lock_key` / `done_key`，以及 `Registry._build_flight` 的旋钮接线。

为什么需要：v696 的进程内合并解决不了**多副本**——A/B 两个实例同时 miss 共享的
Redis completion cache，仍会各打一次真 LLM。本片用 `SET NX EX` 租约 + 本轮 token
专属 done 标记 + peek 共享缓存，把跨进程并发 miss 合成一次。

门纪律（ADR 0090/0094/0095/0110/0112/0114）：
- **判据纯函数 `_judge_*` 单一真值**，真组件场景、正向对照臂、变异臂共用。
- **钉性质不钉字面**：钉 `work_calls == 1`（与实例数无关）、`coalesced == requests-1`、
  `distinct_lock_names == key_count`（正向锚，防代理量恒 0 假绿）。
- **确定性并发**：两实例用 Barrier 同时起步，leader 的 work 被 Event 门住，主线程等
  `joined >= 1` 才放行；不靠 sleep 猜调度。轮询 sleep 是组件自身行为，不是门在猜。
- **真线路函数级 skipif**（ADR 0110）：真 Redis 双实例腿、真网关双实例腿各自 opt-in，
  无凭据时各自 skip，离线门与变异臂恒跑。
- **判据不钉延迟/token 字面值**：distributor 通道会变，只钉"真网关只被打了 1 次"等不变量。
"""
from __future__ import annotations

import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable

import httpx
import pytest

from ai_service import distributed_flight as df
from ai_service.completion_cache import CachedLlm
from ai_service.config import load_settings
from ai_service.distributed_flight import (
    CompositeFlight,
    DistributedSingleFlight,
    done_key,
    lock_key,
)
from ai_service.providers.base import Completion, ProviderFailed
from ai_service.providers.openai_compatible import OpenAICompatibleProvider
from ai_service.providers.registry import Registry
from ai_service.single_flight import SingleFlight

_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
ORACLE_SYSTEM = "You are a JSON oracle. Reply with a single JSON object only, no prose."
ORACLE_USER = 'Reply with exactly {"pong": true}. No markdown, no explanation.'
_GATE_S = 5.0
KEY: tuple[str, str, str, str] = ("m", "sys", "usr", "default")
NS = "nexus:test:df"


# ── 判据（单一真值：真组件场景 / 正向对照臂 / 变异臂共用）────────────────────

def _judge_cross_process_coalesced(obs: dict[str, Any]) -> None:
    """两个独立实例并发同 key：只一个真调用，另一个从共享结果读到同一个东西。"""
    n = obs["instances"]
    assert n >= 2
    assert obs["work_calls"] == 1, "两个实例都打了真 provider —— 跨进程合并没生效"
    assert obs["leaders_total"] == 1 and obs["joined_total"] == n - 1
    assert obs["coalesced_total"] == n - 1, "省下的真调用数必须随实例数增长（ADR 0112 正向锚）"
    assert obs["timeouts_total"] == 0
    assert obs["real_calls_total"] == 1, "DFlightStats.real_calls 必须等于实际真调用数"
    assert obs["results_identical"] is True, "follower 必须拿到 leader 的同一份结果"
    assert obs["peek_hits"] >= 1, "follower 必须真从共享层 peek 到结果，而不是自己造"


def _judge_leader_failure_no_fake_result(obs: dict[str, Any]) -> None:
    """leader 失败：不写 done 标记，follower 超时自补，绝不返回伪造结果。"""
    assert obs["leader_errors"] == 1
    assert obs["done_marker_written"] is False, "失败路径写了成功标记 = 会骗 follower 去读空缓存"
    assert obs["coalesced_total"] == 0
    assert obs["timeouts_total"] == 1
    assert obs["work_calls"] == 2, "leader 打了一次 + follower 超时自补一次"
    assert obs["real_calls_total"] == 2, "诚实账本不得把失败抹掉"


def _judge_fail_open(obs: dict[str, Any]) -> None:
    """Redis 故障：每次都自己打真调用，绝不打挂主路径，也绝不谎报合并。"""
    n = obs["requests"]
    assert obs["work_calls"] == n
    assert obs["lock_failures"] == n, "Redis 故障次数没如实记"
    assert obs["coalesced_total"] == 0
    assert obs["real_calls_total"] == n


def _judge_no_stale_marker(obs: dict[str, Any]) -> None:
    """done 标记必须绑定本轮 token：上一轮的旧标记不得让新一轮 miss 直接"命中"。"""
    assert obs["coalesced"] == 0, "读到了上一轮的旧 done 标记（串台）"
    assert obs["peek_calls"] == 0, "根本不该 peek：本轮 leader 还没完工"
    assert obs["timeouts"] == 1 and obs["work_calls"] == 1, "应超时后自己补打一次"


def _judge_peek_miss_self_serves(obs: dict[str, Any]) -> None:
    """done 到了但共享缓存读不到：如实计 peek_misses 并补打，不返回 None。"""
    assert obs["peek_misses"] == 1
    assert obs["coalesced"] == 0
    assert obs["work_calls"] == 1
    assert obs["result_is_none"] is False, "不得把 None 当结果返回"


def _judge_lock_key_shape(obs: dict[str, Any]) -> None:
    assert obs["same_key_stable"] is True, "同一 CacheKey 必须算出同一个锁名（跨进程前提）"
    assert obs["distinct_names"] == obs["key_count"], "不同 key 的锁名必须不同（正向锚）"
    assert obs["namespace_isolated"] is True, "不同命名空间不得互相踩锁"


def _judge_composite_layers(obs: dict[str, Any]) -> None:
    """CompositeFlight：本进程 N 路先合成 1 次，只有 1 次去抢跨进程锁。"""
    n = obs["requests"]
    assert obs["remote_calls"] == 1, "本进程没先合并，N 路都去打了 Redis"
    assert obs["work_calls"] == 1
    assert obs["local_coalesced"] == n - 1, "进程内合并没生效"
    assert obs["distinct_remote_runs"] == 1


# ── 假 Redis（实现 SET NX EX / GET 的最小语义，供离线门确定性验证）──────────

class _FakeRedis:
    def __init__(self, *, now: Callable[[], float]) -> None:
        self._now = now
        self._data: dict[str, tuple[str, float]] = {}
        self._lock = threading.Lock()
        self.set_calls = 0
        self.get_calls = 0
        self.fail_on_set = False

    def _purge(self) -> None:
        t = self._now()
        for name, (_, expire) in list(self._data.items()):
            if expire <= t:
                del self._data[name]

    def set(self, name: str, value: Any, *, nx: bool = False, ex: int | None = None):
        with self._lock:
            self.set_calls += 1
            if self.fail_on_set:
                raise RuntimeError("synthetic redis failure")
            self._purge()
            if nx and name in self._data:
                return None
            self._data[name] = (str(value), self._now() + float(ex or 0))
            return True

    def get(self, name: str) -> str | None:
        with self._lock:
            self.get_calls += 1
            self._purge()
            item = self._data.get(name)
            return item[0] if item else None

    def seed(self, name: str, value: str, *, ex: int = 60) -> None:
        with self._lock:
            self._data[name] = (value, self._now() + ex)

    def keys(self) -> list[str]:
        with self._lock:
            return list(self._data)


class _FakeClock:
    def __init__(self, t: float = 1000.0) -> None:
        self.t = t
        self._lock = threading.Lock()

    def __call__(self) -> float:
        return self.t

    def advance(self, seconds: float) -> None:
        with self._lock:
            self.t += seconds


def _completion(text: str = '{"pong":true}') -> Completion:
    return Completion(text=text, provider="fake", model="m",
                      tokens_in=11, tokens_out=3, latency_ms=1.0)


def _wait_until(predicate: Callable[[], bool], timeout_s: float = _GATE_S) -> bool:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.001)
    return False


def _flight(client, *, peek, namespace=NS, wait_timeout_s=3.0,
            poll_interval_s=0.01, lease_s=10.0, token=None,
            now=None, sleep=None) -> DistributedSingleFlight:
    kwargs: dict[str, Any] = {}
    if token is not None:
        kwargs["token_factory"] = lambda: token
    if now is not None:
        kwargs["now"] = now
    if sleep is not None:
        kwargs["sleep"] = sleep
    return DistributedSingleFlight(
        client, peek=peek, namespace=namespace,
        wait_timeout_s=wait_timeout_s, poll_interval_s=poll_interval_s,
        lease_s=lease_s, marker_ttl_s=lease_s, **kwargs,
    )


def _two_instance_scenario(*, require_join: bool = True,
                           peek_result: Completion | None = None) -> dict[str, Any]:
    """两个独立 DistributedSingleFlight 实例共享一个假 Redis，真并发跑同 key。"""
    clock = _FakeClock()
    client = _FakeRedis(now=clock)
    shared: dict[str, Completion | None] = {"result": peek_result or _completion()}
    peek_calls = [0]
    work_calls = [0]
    guard = threading.Lock()
    started = threading.Event()
    release = threading.Event()
    errors: list[BaseException] = []
    results: list[str] = []

    def make_work(tag: str) -> Callable[[], Completion]:
        def work() -> Completion:
            started.set()
            if not release.wait(_GATE_S):
                raise TimeoutError("门：leader 未被放行")
            with guard:
                work_calls[0] += 1
                shared["result"] = _completion('{"from":"%s"}' % tag)
            return shared["result"]
        return work

    def make_peek() -> Callable[[Any], Completion | None]:
        def peek(key: Any) -> Completion | None:
            with guard:
                peek_calls[0] += 1
            return shared.get("result")
        return peek

    # token 固定，便于断言 done 标记；两个实例必须是不同实例、不同 token 无所谓。
    flights = [
        _flight(client, peek=make_peek(), token="tok-a"),
        _flight(client, peek=make_peek(), token="tok-b"),
    ]
    works = [lambda f=f: f.run(KEY, make_work("leader")) for f in flights]

    with ThreadPoolExecutor(max_workers=2) as pool:
        barrier = threading.Barrier(2, timeout=_GATE_S)
        futures = []

        def wrapped(run: Callable[[], Any]) -> None:
            barrier.wait()
            try:
                result = run()
            except BaseException as exc:
                with guard:
                    errors.append(exc)
            else:
                with guard:
                    results.append(result.text if hasattr(result, "text") else str(result))

        futures = [pool.submit(wrapped, run) for run in works]
        assert started.wait(_GATE_S), "leader 没进入 work"
        # 等 follower 真的 join 了再放行，否则测的是串行执行而不是并发合并。
        if require_join:
            assert _wait_until(lambda: sum(f.stats().joined for f in flights) >= 1, 1.5)
        release.set()
        for future in futures:
            future.result(timeout=_GATE_S * 2)

    markers = [k for k in client.keys() if ":done:" in k]
    stats = [f.stats() for f in flights]
    return {
        "instances": 2,
        "work_calls": work_calls[0],
        "leaders_total": sum(s.leaders for s in stats),
        "joined_total": sum(s.joined for s in stats),
        "coalesced_total": sum(s.coalesced for s in stats),
        "timeouts_total": sum(s.timeouts for s in stats),
        "real_calls_total": sum(s.real_calls for s in stats),
        "results_identical": len(results) == 2 and len(set(results)) == 1,
        "peek_hits": peek_calls[0],
        "leader_errors": len(errors),
        "done_marker_written": bool(markers),
    }


# ── 离线门（恒跑，不碰网络）───────────────────────────────────────────────

def test_two_instances_coalesce_to_one_real_call():
    _judge_cross_process_coalesced(_two_instance_scenario())


def test_leader_failure_writes_no_marker_and_follower_serves_itself():
    """leader 抛异常：不写 done，follower 等到上限自己补打（假时钟，无真实等待）。

    单线程确定性做法：leader 真抢到锁（SET NX 成功）并失败；锁按设计**不 DEL**，
    所以随后启动的 follower 看到的是"有人持锁但永远没有 done 标记"，只能超时自补。
    """
    clock = _FakeClock()
    client = _FakeRedis(now=clock)

    def fast_sleep(seconds: float) -> None:
        clock.advance(seconds)

    leader = _flight(client, peek=lambda k: None, token="leader-tok",
                     wait_timeout_s=0.05, poll_interval_s=0.01, lease_s=1.0,
                     now=clock, sleep=fast_sleep)
    follower = _flight(client, peek=lambda k: None, token="follower-tok",
                       wait_timeout_s=0.05, poll_interval_s=0.01, lease_s=1.0,
                       now=clock, sleep=fast_sleep)
    errors: list[BaseException] = []
    work_calls = [0]

    def leader_work() -> Completion:
        work_calls[0] += 1
        raise ProviderFailed("synthetic leader failure")

    def follower_work() -> Completion:
        work_calls[0] += 1
        return _completion("self-served")

    with pytest.raises(ProviderFailed) as caught:
        leader.run(KEY, leader_work)
    errors.append(caught.value)
    assert leader.stats().leaders == 1, "第一个实例必须真的抢到锁成为 leader"
    got = follower.run(KEY, follower_work)
    assert got.text == "self-served", "follower 应拿到自己补打的结果"
    markers = [k for k in client.keys() if ":done:" in k]
    ls, fs = leader.stats(), follower.stats()
    _judge_leader_failure_no_fake_result({
        "leader_errors": len(errors),
        "done_marker_written": bool(markers),
        "coalesced_total": ls.coalesced + fs.coalesced,
        "timeouts_total": ls.timeouts + fs.timeouts,
        "work_calls": work_calls[0],
        "real_calls_total": ls.real_calls + fs.real_calls,
    })


def test_redis_failure_fails_open_without_lying():
    clock = _FakeClock()
    client = _FakeRedis(now=clock)
    client.fail_on_set = True
    calls = [0]

    def work() -> Completion:
        calls[0] += 1
        return _completion()

    n = 3
    flights = [_flight(client, peek=lambda k: None) for _ in range(n)]
    for f in flights:
        f.run(KEY, work)
    total = sum(f.stats().lock_failures for f in flights)
    _judge_fail_open({
        "requests": n, "work_calls": calls[0], "lock_failures": total,
        "coalesced_total": sum(f.stats().coalesced for f in flights),
        "real_calls_total": sum(f.stats().real_calls for f in flights),
    })


def test_stale_done_marker_from_previous_round_is_never_reused():
    """本片最容易被简化掉的坑：done 若不带 token，上一轮标记会让新一轮直接 peek 串台。"""
    clock = _FakeClock()
    client = _FakeRedis(now=clock)
    lk = lock_key(NS, KEY)
    client.seed(lk, "current-owner", ex=60)
    client.seed(done_key(lk, "previous-owner"), "1", ex=60)  # 上一轮留下的旧标记
    peek_calls = [0]
    work_calls = [0]

    def peek(key: Any) -> Completion | None:
        peek_calls[0] += 1
        return _completion("STALE")

    def work() -> Completion:
        work_calls[0] += 1
        return _completion("fresh")

    f = _flight(client, peek=peek, token="new-caller",
                wait_timeout_s=0.05, poll_interval_s=0.01, lease_s=1.0,
                now=clock, sleep=lambda s: clock.advance(s))
    f.run(KEY, work)
    s = f.stats()
    _judge_no_stale_marker({"coalesced": s.coalesced, "peek_calls": peek_calls[0],
                            "timeouts": s.timeouts, "work_calls": work_calls[0]})


def test_current_owner_marker_coalesces_immediately():
    """正向对照：本轮 owner 的 done 标记在，follower 就该立刻 peek 到结果。"""
    clock = _FakeClock()
    client = _FakeRedis(now=clock)
    lk = lock_key(NS, KEY)
    client.seed(lk, "owner-tok", ex=60)
    client.seed(done_key(lk, "owner-tok"), "1", ex=60)
    work_calls = [0]
    expected = _completion("from-leader")
    f = _flight(client, peek=lambda k: expected, token="follower-tok",
                wait_timeout_s=0.5, poll_interval_s=0.01, lease_s=2.0)
    got = f.run(KEY, lambda: work_calls.__setitem__(0, work_calls[0] + 1))
    assert work_calls[0] == 0
    assert got is expected
    assert f.stats().coalesced == 1 and f.stats().real_calls == 0


def test_peek_miss_serves_itself_instead_of_returning_none():
    clock = _FakeClock()
    client = _FakeRedis(now=clock)
    lk = lock_key(NS, KEY)
    client.seed(lk, "owner-tok", ex=60)
    client.seed(done_key(lk, "owner-tok"), "1", ex=60)
    work_calls = [0]

    def work() -> Completion:
        work_calls[0] += 1
        return _completion("self-served")

    f = _flight(client, peek=lambda k: None, token="follower-tok",
                wait_timeout_s=0.5, poll_interval_s=0.01, lease_s=2.0)
    got = f.run(KEY, work)
    s = f.stats()
    _judge_peek_miss_self_serves({"peek_misses": s.peek_misses, "coalesced": s.coalesced,
                                  "work_calls": work_calls[0], "result_is_none": got is None})


def test_lock_key_is_stable_across_processes_and_separates_keys():
    keys = [("m", "s", f"u{i}", "default") for i in range(8)]
    names = [lock_key(NS, k) for k in keys]
    _judge_lock_key_shape({
        "same_key_stable": lock_key(NS, KEY) == lock_key(NS, KEY),
        "distinct_names": len(set(names)),
        "key_count": len(keys),
        "namespace_isolated": lock_key(NS, KEY) != lock_key(NS + "2", KEY),
    })


def test_invalid_coordination_config_is_rejected():
    # ADR 0114：显式拒绝无效策略，别静默退化成"永不合并"或"无限挂住"。
    for bad in (
        {"wait_timeout_s": 0},
        {"poll_interval_s": 0},
        {"poll_interval_s": 5.0, "wait_timeout_s": 1.0},
        {"lease_s": 1.0, "wait_timeout_s": 5.0},
        {"marker_ttl_s": 0},
    ):
        opts: dict[str, Any] = {"wait_timeout_s": 5.0, "poll_interval_s": 0.05,
                                "lease_s": 10.0, "marker_ttl_s": 10.0}
        opts.update(bad)
        with pytest.raises(ValueError):
            DistributedSingleFlight(_FakeRedis(now=_FakeClock()), peek=lambda k: None, **opts)


def test_composite_flight_merges_locally_before_touching_redis():
    """进程内 N 路先合成 1 次，只有 1 次去抢跨进程锁（省 Redis RTT）。"""
    clock = _FakeClock()
    client = _FakeRedis(now=clock)
    remote_runs = [0]
    work_calls = [0]
    started = threading.Event()
    release = threading.Event()
    n = 4

    class _CountingRemote:
        def run(self, key: Any, work: Callable[[], Any]) -> Any:
            remote_runs[0] += 1
            return work()

    def work() -> Completion:
        started.set()
        assert release.wait(_GATE_S), "门：leader 未被放行"
        work_calls[0] += 1
        return _completion()

    local = SingleFlight(wait_timeout_s=3.0)
    composite = CompositeFlight(local, _CountingRemote())
    with ThreadPoolExecutor(max_workers=n) as pool:
        barrier = threading.Barrier(n, timeout=_GATE_S)
        futures = []

        def wrapped() -> None:
            barrier.wait()
            composite.run(KEY, work)

        futures = [pool.submit(wrapped) for _ in range(n)]
        assert started.wait(_GATE_S)
        assert _wait_until(lambda: local.stats().joined >= n - 1, 1.5)
        release.set()
        for future in futures:
            future.result(timeout=_GATE_S * 2)
    _judge_composite_layers({
        "requests": n, "remote_calls": remote_runs[0], "work_calls": work_calls[0],
        "local_coalesced": local.stats().coalesced,
        "distinct_remote_runs": remote_runs[0],
    })


def test_config_knobs_reach_registry_and_invalid_config_is_not_swallowed(monkeypatch):
    """ADR 0095：旋钮声称"经 Registry 生效"必须有门真读那条构造链。"""
    import redis

    clock = _FakeClock()
    fake = _FakeRedis(now=clock)
    monkeypatch.setattr(redis, "from_url", lambda *a, **k: fake)
    base = {
        "NEXUS_OPENAI_API_KEY": "fake-oracle-credential-for-test",
        "NEXUS_OPENAI_BASE_URL": "http://127.0.0.1:1/v1",
        "NEXUS_MODEL_EMBEDDING": "none",
        "NEXUS_LLM_COMPLETION_CACHE_URL": "redis://127.0.0.1:1/0",
        "NEXUS_LLM_STICKY_CACHE_KEY": "0",
        "AI_SERVICE_TIMEOUT_S": "1",  # 让 4s 租约合法；默认 180s 由下面的不变量门单独钉
    }
    # ADR 0095：注释声称"默认租约覆盖最坏真调用时长"必须有门真读默认值。
    defaults = load_settings({})
    assert defaults.llm_distributed_flight_lease_s >= defaults.request_timeout_s
    assert defaults.llm_distributed_flight_lease_s >= defaults.llm_distributed_flight_wait_s
    off = load_settings(base)
    on = load_settings({**base, "NEXUS_LLM_DISTRIBUTED_SINGLE_FLIGHT": "1",
                        "NEXUS_LLM_DISTRIBUTED_FLIGHT_WAIT_S": "2",
                        "NEXUS_LLM_DISTRIBUTED_FLIGHT_POLL_S": "0.02",
                        "NEXUS_LLM_DISTRIBUTED_FLIGHT_LEASE_S": "4"})
    assert off.llm_distributed_single_flight is False
    assert on.llm_distributed_single_flight is True
    assert "llm_distributed_single_flight=True" in repr(on)
    assert "fake-oracle-credential-for-test" not in repr(on), "repr 不得泄漏 key"

    flights = []
    for s in (off, on):
        built = Registry._build_llm(s, None)
        flights.append(getattr(built, "_flight", None))
        close = getattr(getattr(built, "inner", None), "close", None)
        if callable(close):
            close()
    assert isinstance(flights[0], SingleFlight), "默认必须只有进程内 flight（零回归）"
    assert isinstance(flights[1], CompositeFlight), "opt-in 后必须叠上跨进程层"
    assert isinstance(flights[1].local, SingleFlight)
    assert isinstance(flights[1].remote, DistributedSingleFlight)
    assert flights[1].remote._wait_timeout_s == pytest.approx(2.0)
    assert flights[1].remote._lease_s == pytest.approx(4.0)

    # 配置错误必须显式抛，不许被"缓存连接失败就 fail-open"的 except 吞掉。
    bad = load_settings({**base, "NEXUS_LLM_DISTRIBUTED_SINGLE_FLIGHT": "1",
                         "NEXUS_LLM_DISTRIBUTED_FLIGHT_WAIT_S": "5",
                         "NEXUS_LLM_DISTRIBUTED_FLIGHT_POLL_S": "9"})
    with pytest.raises(ValueError):
        Registry._build_llm(bad, None)

    # 租约短于 provider 超时 = 锁会先于真调用结束而过期（双花），必须显式拒绝。
    short_lease = load_settings({**base, "AI_SERVICE_TIMEOUT_S": "180",
                                 "NEXUS_LLM_DISTRIBUTED_SINGLE_FLIGHT": "1",
                                 "NEXUS_LLM_DISTRIBUTED_FLIGHT_WAIT_S": "5",
                                 "NEXUS_LLM_DISTRIBUTED_FLIGHT_LEASE_S": "10"})
    with pytest.raises(ValueError, match="LEASE_S"):
        Registry._build_llm(short_lease, None)


# ── 恒跑变异臂：证明判据有牙 ──────────────────────────────────────────────

def _good_coalesced_obs() -> dict[str, Any]:
    return {"instances": 2, "work_calls": 1, "leaders_total": 1, "joined_total": 1,
            "coalesced_total": 1, "timeouts_total": 0, "real_calls_total": 1,
            "results_identical": True, "peek_hits": 1}


def test_arm_two_real_calls_goes_red():
    obs = {**_good_coalesced_obs(), "work_calls": 2, "coalesced_total": 0,
           "real_calls_total": 2, "peek_hits": 0}
    with pytest.raises(AssertionError, match="两个实例都打了真 provider"):
        _judge_cross_process_coalesced(obs)


def test_arm_fake_peek_goes_red():
    with pytest.raises(AssertionError, match="peek"):
        _judge_cross_process_coalesced({**_good_coalesced_obs(), "peek_hits": 0})


def test_arm_failure_writing_marker_goes_red():
    with pytest.raises(AssertionError, match="成功标记"):
        _judge_leader_failure_no_fake_result({"leader_errors": 1, "done_marker_written": True,
                                              "coalesced_total": 0, "timeouts_total": 1,
                                              "work_calls": 2, "real_calls_total": 2})


def test_arm_constant_lock_names_goes_red():
    with pytest.raises(AssertionError, match="正向锚|不同"):
        _judge_lock_key_shape({"same_key_stable": True, "distinct_names": 1,
                               "key_count": 8, "namespace_isolated": True})


def test_arm_stale_marker_reuse_goes_red():
    with pytest.raises(AssertionError, match="旧 done 标记"):
        _judge_no_stale_marker({"coalesced": 1, "peek_calls": 1,
                                "timeouts": 0, "work_calls": 0})


def test_arm_peek_miss_returning_none_goes_red():
    # 只退化一件事：把 None 当结果返回。其余字段保持正确，确保红的是那条判据本身。
    with pytest.raises(AssertionError, match="None"):
        _judge_peek_miss_self_serves({"peek_misses": 1, "coalesced": 0,
                                      "work_calls": 1, "result_is_none": True})


def test_arm_fail_open_lying_about_coalescing_goes_red():
    with pytest.raises(AssertionError):
        _judge_fail_open({"requests": 3, "work_calls": 3, "lock_failures": 3,
                          "coalesced_total": 3, "real_calls_total": 3})


def test_arm_composite_touching_redis_n_times_goes_red():
    with pytest.raises(AssertionError, match="本进程没先合并"):
        _judge_composite_layers({"requests": 4, "remote_calls": 4, "work_calls": 4,
                                 "local_coalesced": 0, "distinct_remote_runs": 4})


def test_arm_correct_observations_are_green():
    """正向对照：判据不惩罚正确实现（ADR 0094 X4）。"""
    _judge_cross_process_coalesced(_good_coalesced_obs())
    _judge_no_stale_marker({"coalesced": 0, "peek_calls": 0, "timeouts": 1, "work_calls": 1})
    _judge_composite_layers({"requests": 4, "remote_calls": 1, "work_calls": 1,
                             "local_coalesced": 3, "distinct_remote_runs": 1})


def test_arm_real_component_without_distributed_run_goes_red(monkeypatch):
    """真组件退化：把 DistributedSingleFlight.run 换成直通，双实例场景必须红。"""
    monkeypatch.setattr(DistributedSingleFlight, "run", lambda self, key, work: work())
    obs = _two_instance_scenario(require_join=False)
    with pytest.raises(AssertionError):
        _judge_cross_process_coalesced(obs)


def test_arm_dropping_token_from_done_key_reintroduces_stale_marker(monkeypatch):
    """真组件退化：done key 去掉 token，旧标记必须重新被读到（门必须红）。"""
    monkeypatch.setattr(df, "done_key", lambda lock, token: f"{lock}:done")
    clock = _FakeClock()
    client = _FakeRedis(now=clock)
    lk = lock_key(NS, KEY)
    client.seed(lk, "current-owner", ex=60)
    client.seed(f"{lk}:done", "1", ex=60)  # 旧标记落在常量 key 上
    work_calls = [0]
    peek_calls = [0]

    def peek(key: Any) -> Completion | None:
        peek_calls[0] += 1
        return _completion("STALE")

    def work() -> Completion:
        work_calls[0] += 1
        return _completion("fresh")

    f = _flight(client, peek=peek, token="new-caller",
                wait_timeout_s=0.05, poll_interval_s=0.01, lease_s=1.0,
                now=clock, sleep=lambda s: clock.advance(s))
    f.run(KEY, work)
    s = f.stats()
    with pytest.raises(AssertionError):
        _judge_no_stale_marker({"coalesced": s.coalesced, "peek_calls": peek_calls[0],
                                "timeouts": s.timeouts, "work_calls": work_calls[0]})


# ── 真线路 opt-in 腿（函数级 skipif；无凭据/无 Redis 时各自 skip，不假绿）────

def _redis_live() -> bool:
    return bool(
        (os.environ.get("NEXUS_DFLIGHT_REDIS_LIVE", "") or "").strip() == "1"
        and (os.environ.get("NEXUS_DFLIGHT_REDIS_URL", "") or "").strip()
    )


def _live_ready() -> bool:
    if (os.environ.get("NEXUS_LIVE_LLM", "") or "").strip() != "1":
        return False
    from dotenv import load_dotenv
    load_dotenv(_ENV_FILE, override=False)
    return bool(os.environ.get("NEXUS_OPENAI_API_KEY", "").strip()
                and os.environ.get("NEXUS_OPENAI_BASE_URL", "").strip())


_REDIS_SKIP = pytest.mark.skipif(
    not _redis_live(),
    reason="real-redis distributed-flight leg opt-in: NEXUS_DFLIGHT_REDIS_LIVE=1 + URL",
)
_BOTH_SKIP = pytest.mark.skipif(
    not (_redis_live() and _live_ready()),
    reason="real-gateway + real-redis two-instance leg needs both opt-ins",
)


@_REDIS_SKIP
def test_live_two_independent_caches_share_one_result_over_real_redis():
    """两个独立 RedisLlmCompletionCache（模拟两个进程）共享 Redis：只有 1 次 work。

    这条同时把 ADR 0102/0107 "多进程真 OS 字节往返"从仍欠变成有实证：
    A 写进去的 Completion 由 B 经真 Redis 反序列化读回，不是内存里传对象。
    """
    import redis
    from ai_service.redis_completion_cache import RedisLlmCompletionCache

    url = os.environ["NEXUS_DFLIGHT_REDIS_URL"].strip()
    ns = f"nexus:test:df:{uuid.uuid4().hex[:12]}"
    client_a = redis.from_url(url, decode_responses=True)
    client_b = redis.from_url(url, decode_responses=True)
    cache_a = RedisLlmCompletionCache(client_a, namespace=ns, ttl_s=60)
    cache_b = RedisLlmCompletionCache(client_b, namespace=ns, ttl_s=60)
    flights = [
        DistributedSingleFlight(client_a, peek=cache_a.get, namespace=ns,
                                wait_timeout_s=8.0, poll_interval_s=0.02, lease_s=15.0),
        DistributedSingleFlight(client_b, peek=cache_b.get, namespace=ns,
                                wait_timeout_s=8.0, poll_interval_s=0.02, lease_s=15.0),
    ]
    key = ("m", "live-system", "live-user", "json")
    expected = _completion('{"from":"leader"}')
    work_calls = [0]
    started = threading.Event()
    release = threading.Event()
    guard = threading.Lock()
    texts: list[str] = []

    def make_work(cache: RedisLlmCompletionCache) -> Callable[[], Completion]:
        def work() -> Completion:
            started.set()
            assert release.wait(_GATE_S), "门：leader 未被放行"
            with guard:
                work_calls[0] += 1
            cache.store(key, expected)
            return expected
        return work

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            barrier = threading.Barrier(2, timeout=_GATE_S)
            futures = []

            def wrapped(f: DistributedSingleFlight, cache: RedisLlmCompletionCache) -> None:
                barrier.wait()
                got = f.run(key, make_work(cache))
                with guard:
                    texts.append(got.text)

            futures = [pool.submit(wrapped, flights[0], cache_a),
                       pool.submit(wrapped, flights[1], cache_b)]
            assert started.wait(_GATE_S)
            assert _wait_until(lambda: sum(f.stats().joined for f in flights) >= 1, 2.0)
            release.set()
            for future in futures:
                future.result(timeout=_GATE_S * 3)

        assert work_calls[0] == 1, f"两个实例共打了 {work_calls[0]} 次 work"
        assert len(texts) == 2 and len(set(texts)) == 1
        assert sum(f.stats().coalesced for f in flights) == 1
        # 关键：B 的缓存命中是**真的**跨进程 Redis 读回，不是本进程内存命中。
        read_back = cache_b.get(key)
        assert read_back is not None and read_back.text == expected.text
        assert cache_b.stats().hits >= 1
        print(f"[v697 live redis] work_calls={work_calls[0]} "
              f"coalesced={sum(f.stats().coalesced for f in flights)} "
              f"cache_b_hits={cache_b.stats().hits} namespace={ns}")
    finally:
        # 测试清理用 cache.clear()（走 LRU 索引定点删，不用 KEYS/SCAN）；
        # 锁与 done 标记靠各自 EX 自然过期，不伪造"释放锁"的语义。
        try:
            cache_a.clear()
            client_a.delete(lock_key(ns, key))
        except Exception:
            pass


class _CountingTransport(httpx.BaseTransport):
    """包住真实 HTTP transport，每次真发网络 +1；不改 provider、不改生产。"""

    def __init__(self, inner: httpx.BaseTransport) -> None:
        self._inner = inner
        self.calls = 0
        self._lock = threading.Lock()

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        with self._lock:
            self.calls += 1
        return self._inner.handle_request(request)


@_BOTH_SKIP
def test_live_two_instances_share_one_real_gateway_call():
    """端到端：两个完整"实例"（各自己的 provider/client/cache/flight）并发同 prompt，
    真网关只该收到 **1** 次请求。真调用延迟（秒级）天然给 follower 留出 join 窗口。
    """
    import redis
    from dotenv import load_dotenv
    from ai_service.redis_completion_cache import RedisLlmCompletionCache

    load_dotenv(_ENV_FILE, override=False)
    url = os.environ["NEXUS_DFLIGHT_REDIS_URL"].strip()
    ns = f"nexus:test:df:{uuid.uuid4().hex[:12]}"
    instances = []
    try:
        for _ in range(2):
            counting = _CountingTransport(httpx.HTTPTransport())
            provider = OpenAICompatibleProvider(
                api_key=os.environ["NEXUS_OPENAI_API_KEY"].strip(),
                base_url=os.environ["NEXUS_OPENAI_BASE_URL"].strip(),
                models={"balanced": "gpt-6-sol"},
                transport=counting,
            )
            client = redis.from_url(url, decode_responses=True)
            cache = RedisLlmCompletionCache(client, namespace=ns, ttl_s=120)
            remote = DistributedSingleFlight(
                client, peek=cache.get, namespace=ns,
                wait_timeout_s=90.0, poll_interval_s=0.05, lease_s=120.0,
            )
            flight = CompositeFlight(SingleFlight(wait_timeout_s=90.0), remote)
            instances.append((provider, counting, cache, remote, flight,
                              CachedLlm(provider, cache, flight=flight)))

        kw = {"model": "gpt-6-sol", "system": ORACLE_SYSTEM, "user": ORACLE_USER}
        texts: list[str] = []
        guard = threading.Lock()

        def one(llm: CachedLlm) -> None:
            c = llm.complete(**kw)
            with guard:
                texts.append(c.text)

        with ThreadPoolExecutor(max_workers=2) as pool:
            barrier = threading.Barrier(2, timeout=_GATE_S)
            futures = []

            def wrapped(llm: CachedLlm) -> None:
                barrier.wait()
                one(llm)

            futures = [pool.submit(wrapped, inst[5]) for inst in instances]
            for future in futures:
                future.result(timeout=180.0)

        gateway_calls = sum(inst[1].calls for inst in instances)
        coalesced = sum(inst[3].stats().coalesced for inst in instances)
        leaders = sum(inst[3].stats().leaders for inst in instances)
        assert gateway_calls == 1, f"真网关被打了 {gateway_calls} 次，跨进程合并没生效"
        assert leaders == 1 and coalesced == 1
        assert len(texts) == 2 and len(set(texts)) == 1, "两实例必须拿到同一份回复"
        assert sum(inst[2].stats().hits for inst in instances) >= 1, \
            "该有一次真实的跨进程缓存命中"
        print(f"[v697 live] instances=2 gateway_calls={gateway_calls} "
              f"leaders={leaders} coalesced={coalesced}")
    finally:
        if instances:
            try:
                instances[0][2].clear()
            except Exception:
                pass
        for inst in instances:
            inst[0].close()


@_BOTH_SKIP
def test_live_without_distributed_flight_two_instances_make_two_gateway_calls():
    """反事实臂（ADR 0112/0128 方法）：只装进程内 flight 时，两个实例各打一次真网关。

    没有这条，"上一条腿的 1 次"可能来自网关去重或共享缓存，归因不成立。
    """
    import redis
    from dotenv import load_dotenv
    from ai_service.redis_completion_cache import RedisLlmCompletionCache

    load_dotenv(_ENV_FILE, override=False)
    url = os.environ["NEXUS_DFLIGHT_REDIS_URL"].strip()
    ns = f"nexus:test:df:{uuid.uuid4().hex[:12]}"
    instances = []
    try:
        for _ in range(2):
            counting = _CountingTransport(httpx.HTTPTransport())
            provider = OpenAICompatibleProvider(
                api_key=os.environ["NEXUS_OPENAI_API_KEY"].strip(),
                base_url=os.environ["NEXUS_OPENAI_BASE_URL"].strip(),
                models={"balanced": "gpt-6-sol"},
                transport=counting,
            )
            client = redis.from_url(url, decode_responses=True)
            cache = RedisLlmCompletionCache(client, namespace=ns, ttl_s=120)
            instances.append((provider, counting, cache,
                              CachedLlm(provider, cache,
                                        flight=SingleFlight(wait_timeout_s=90.0))))

        kw = {"model": "gpt-6-sol", "system": ORACLE_SYSTEM, "user": ORACLE_USER}

        def one(llm: CachedLlm) -> None:
            llm.complete(**kw)

        with ThreadPoolExecutor(max_workers=2) as pool:
            barrier = threading.Barrier(2, timeout=_GATE_S)

            def wrapped(llm: CachedLlm) -> None:
                barrier.wait()
                one(llm)

            futures = [pool.submit(wrapped, inst[3]) for inst in instances]
            for future in futures:
                future.result(timeout=180.0)

        gateway_calls = sum(inst[1].calls for inst in instances)
        assert gateway_calls == 2, (
            f"关掉跨进程层后网关只收到 {gateway_calls} 次；"
            "若 < 2，上一条腿的 1 次不能归因给 distributed single-flight"
        )
        print(f"[v697 live A/B] distributed=off instances=2 gateway_calls={gateway_calls}")
    finally:
        if instances:
            try:
                instances[0][2].clear()
            except Exception:
                pass
        for inst in instances:
            inst[0].close()
