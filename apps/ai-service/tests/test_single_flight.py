"""completion cache single-flight 门（v696 / ADR 0128，镜像 Spring `@Cacheable(sync=true)`）。

被测对象：`single_flight.SingleFlight` 与 `completion_cache.CachedLlm` 注入 flight 后的行为。
为什么需要：`execution.py` 用 `anyio.to_thread.run_sync` 调 `registry.llm.complete()`，
N 个并发同 prompt 请求会**同时 miss** 缓存、同时打 N 次真 LLM——token 与上游连接双浪费。
ADR 0113 仍欠 ④ 记的正是这条：宁可多花一次钱也不返回半条毒缓存；本片用"只放一个 leader
过去、其余等同一结果"补上，且保留四条诚实边界（见 `single_flight.py` 模块 docstring）。

门纪律（沿用 ADR 0090/0094/0095/0110/0112/0114）：
- **判据纯函数 `_judge_*` 是单一真值**：真组件路径、正向对照臂、变异臂都调同一份判据，
  杜绝"改判据忘改臂"。
- **钉性质不钉字面**：钉 `real_calls == 1`（与请求数 N 无关）、`coalesced == requests-1`
  （随成本增长）、`inflight_peak == requests`（正向锚，防代理量恒 0 假绿），
  不钉"恰好 6 次"这种今天的字面值。
- **并发确定性**：不用 `sleep` 猜调度。leader 在假 provider 里被 Event 门住，主线程等
  `flight.stats().joined == N-1` 才放行；需要"所有线程同时在 provider 内"的臂用
  `threading.Barrier`，少来一个就 BrokenBarrierError（比静默串行化诚实）。
- **失败不缓存 / 不伪造**：leader 抛异常时所有 follower 收到**同一个异常对象**；
  缓存 stores 必须为 0，inflight 表必须清空。
- **合并 ≠ 命中**：`cache.stats().hits` 不得因 coalescing 增加；`coalesced` 单独记账。
  这是本片最容易被"优化"掉的诚实边界。
- **真线路函数级 skipif**（ADR 0110）：`test_live_*` 无 `NEXUS_LIVE_LLM=1` + 真 key 时
  各自 skip，绝不发网络、绝不假绿；所有离线门与变异臂恒跑。
"""
from __future__ import annotations

import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable

import httpx
import pytest

from ai_service.completion_cache import CachedLlm, LlmCompletionCache
from ai_service.config import load_settings
from ai_service.providers.base import Completion, ProviderFailed
from ai_service.providers.openai_compatible import OpenAICompatibleProvider
from ai_service.providers.registry import Registry
from ai_service.single_flight import SingleFlight

_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
ORACLE_SYSTEM = "You are a JSON oracle. Reply with a single JSON object only, no prose."
ORACLE_USER = 'Reply with exactly {"pong": true}. No markdown, no explanation.'
REQUESTS = 6
_GATE_TIMEOUT_S = 5.0


# ── 判据（单一真值：真组件路径 / 正向对照臂 / 变异臂共用）────────────────────

def _judge_coalesced_miss(obs: dict[str, Any]) -> None:
    """同 key 并发 miss：只一个真调用，其余等同一结果；合并绝不冒充缓存命中。"""
    n = obs["requests"]
    assert n >= 2, "至少两路并发才有合并可言"
    assert obs["real_calls"] == 1, "并发同 key 打了不止一次真 provider —— single-flight 没生效"
    assert obs["leaders"] == 1, "leader 应只有一个"
    assert obs["joined"] == n - 1, "其余请求应全部 join 同一个 flight"
    assert obs["coalesced"] == n - 1, "省下的真调用数必须随并发数线性增长（ADR 0112 正向锚）"
    assert obs["timeouts"] == 0 and obs["failures"] == 0, "成功路径不该有超时/失败"
    assert obs["inflight_after"] == 0, "leader 收尾必须清掉在飞表，不留悬挂项"
    assert obs["texts_are_identical"] is True, "合并的 follower 必须拿到同一个 Completion 内容"
    assert obs["cache_stores"] == 1, "只有 leader 写缓存"
    assert obs["cache_hits"] == 0, "coalesced 不是 cache hit：不得把合并虚报成命中率"
    assert obs["stats_real_calls"] == 1, "FlightStats.real_calls 是诚实账本，必须等于实际真调用数"


def _judge_no_cross_key_coalescing(obs: dict[str, Any]) -> None:
    """不同 key 各走各的 leader；在飞表项数随并发数增长（防止代理量恒 0 的假绿）。"""
    n = obs["requests"]
    assert obs["real_calls"] == n, "不同 key 被错误合并了 —— 会把 A 的答案返回给 B"
    assert obs["leaders"] == n, "每个不同 key 都该有自己的 leader"
    assert obs["coalesced"] == 0, "不同 key 不该省真调用"
    assert obs["inflight_peak"] == n, "在飞表项数没有随并发增长：门读到的代理量是死的"
    assert obs["distinct_texts"] == n, "每个 key 应拿到各自的 Completion"


def _judge_failure_propagates(obs: dict[str, Any]) -> None:
    """leader 失败：所有人收到同一个异常，无静默重试、无毒缓存、无悬挂 flight。"""
    n = obs["requests"]
    assert obs["error_count"] == n, "有 follower 没收到异常（可能返回了伪造结果）"
    assert obs["same_exception_object"] is True, "follower 应收到 leader 抛出的同一个异常对象"
    assert obs["real_calls"] == 1, "失败被静默重试了"
    assert obs["failures"] == 1, "失败计数不对"
    assert obs["cache_stores"] == 0, "失败绝不写缓存（毒条目）"
    assert obs["inflight_after"] == 0, "失败路径也必须清掉在飞表"


def _judge_timeout_self_serves(obs: dict[str, Any]) -> None:
    """等待超时：follower 自己补打真调用，如实计 timeouts，绝不伪造命中/合并。"""
    assert obs["real_calls"] == 2, "超时 follower 必须自己打一次真调用"
    assert obs["timeouts"] == 1, "超时次数没记上"
    assert obs["coalesced"] == 0, "超时不该被算成合并省下的调用"
    assert obs["cache_hits"] == 0, "超时不该被算成缓存命中"
    assert obs["distinct_texts"] == 2, "两次真调用应各自产生内容（不得回放第一个）"
    assert obs["waits_recorded"] >= 1, "follower 根本没走等待路径"
    assert obs["wait_bounded"] is True, "等待上限未透传给 Event.wait —— 可能无限挂住"


def _judge_disabled_is_old_behavior(obs: dict[str, Any]) -> None:
    """flight=None 的零回归对照：并发同 key 仍各打各的，不合并、不省调用。"""
    n = obs["requests"]
    assert obs["real_calls"] == n, "禁用时不应减少真调用（必须保持 v695 行为）"
    assert obs["cache_hits"] == 0, "Barrier 保证所有线程同时进 provider，不该有中途命中"


# ── 确定性假 provider（纯内存，不改被测组件路径）────────────────────────────

class _GatedProvider:
    """前 `gate_calls` 次真调用被 Event 门住，让主线程确认所有 follower 已 join。"""

    kind = "llm"
    name = "gated"

    def __init__(self, *, fail: bool = False, gate_calls: int = 1) -> None:
        self._lock = threading.Lock()
        self.calls: list[tuple[str, str, str]] = []
        self.fail = fail
        self.gate_calls = gate_calls
        self._seq = 0
        self.started = threading.Event()
        self.release = threading.Event()

    def models(self) -> list[str]:
        return ["m"]

    def model_for(self, model_class: str) -> str:
        return "m"

    def complete(self, *, model: str, system: str, user: str, json_mode: bool | None = None) -> Completion:
        with self._lock:
            self.calls.append((model, system, user))
            self._seq += 1
            seq = self._seq
        if seq <= self.gate_calls:
            self.started.set()
            if not self.release.wait(_GATE_TIMEOUT_S):
                raise TimeoutError("门：leader 未被放行，死锁保护触发")
        if self.fail:
            raise ProviderFailed("synthetic provider failure")
        return Completion(
            text='{"ok":true,"seq":%d}' % seq,
            provider=self.name,
            model=model,
            tokens_in=10 + seq,
            tokens_out=3,
            latency_ms=15.0,
        )


class _BarrierProvider:
    """强制 N 路同时进入 complete()：少来一路就 BrokenBarrierError，绝不静默串行化。"""

    kind = "llm"
    name = "barrier"

    def __init__(self, parties: int, probe: Callable[[], None] | None = None) -> None:
        self.barrier = threading.Barrier(parties, timeout=_GATE_TIMEOUT_S)
        self.probe = probe
        self._lock = threading.Lock()
        self.calls: list[tuple[str, str, str]] = []
        self._seq = 0

    def models(self) -> list[str]:
        return ["m"]

    def model_for(self, model_class: str) -> str:
        return "m"

    def complete(self, *, model: str, system: str, user: str, json_mode: bool | None = None) -> Completion:
        with self._lock:
            self.calls.append((model, system, user))
            self._seq += 1
            seq = self._seq
        self.barrier.wait()
        if self.probe is not None:
            self.probe()
        return Completion(
            text='{"ok":true,"seq":%d}' % seq,
            provider=self.name,
            model=model,
            tokens_in=10 + seq,
            tokens_out=3,
            latency_ms=15.0,
        )


def _fresh_cache() -> LlmCompletionCache:
    return LlmCompletionCache(ttl_s=60.0, max_entries=64)


def _wait_until(predicate: Callable[[], bool], timeout_s: float = _GATE_TIMEOUT_S) -> bool:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.001)
    return False


def _run_threads(n: int, task: Callable[[], None]) -> None:
    """所有线程先过 Barrier 再执行，保证是**真并发**而非依次跑完。"""
    start = threading.Barrier(n, timeout=_GATE_TIMEOUT_S)
    errors: list[BaseException] = []

    def wrapped() -> None:
        start.wait()
        try:
            task()
        except BaseException as exc:  # 收集后统一抛出，避免线程内静默失败
            errors.append(exc)

    with ThreadPoolExecutor(max_workers=n) as pool:
        futures = [pool.submit(wrapped) for _ in range(n)]
        for future in futures:
            future.result(timeout=_GATE_TIMEOUT_S * 2)
    if errors:
        raise errors[0]


# ── 真组件场景（离线恒跑）──────────────────────────────────────────────────

def _scenario_same_key(
    *, requests: int = REQUESTS, fail: bool = False,
    wait: Callable[[threading.Event, float], bool] | None = None,
    wait_timeout_s: float = 30.0, require_join: bool = True,
) -> dict[str, Any]:
    cache = _fresh_cache()
    inner = _GatedProvider(fail=fail, gate_calls=1)
    flight = SingleFlight(wait_timeout_s=wait_timeout_s, wait=wait)
    cached = CachedLlm(inner, cache, flight=flight)
    kw = {"model": "m", "system": "s", "user": "u"}
    texts: list[str] = []
    errs: list[BaseException] = []
    guard = threading.Lock()

    def one() -> None:
        try:
            c = cached.complete(**kw)
        except BaseException as exc:
            with guard:
                errs.append(exc)
        else:
            with guard:
                texts.append(c.text)

    with ThreadPoolExecutor(max_workers=requests) as pool:
        start = threading.Barrier(requests, timeout=_GATE_TIMEOUT_S)
        futures = []
        for _ in range(requests):
            def wrapped() -> None:
                start.wait()
                one()
            futures.append(pool.submit(wrapped))
        if require_join:
            assert _wait_until(lambda: flight.stats().joined >= requests - 1), \
                "follower 没有在 leader 完成前 join（调度没达到并发前提）"
        else:
            assert inner.started.wait(_GATE_TIMEOUT_S), "leader 没有进入 provider"
        inner.release.set()
        for future in futures:
            future.result(timeout=_GATE_TIMEOUT_S * 2)

    s = flight.stats()
    cs = cache.stats()
    return {
        "requests": requests,
        "real_calls": len(inner.calls),
        "leaders": s.leaders,
        "joined": s.joined,
        "coalesced": s.coalesced,
        "timeouts": s.timeouts,
        "failures": s.failures,
        "inflight_after": flight.inflight,
        "texts_are_identical": bool(texts) and len(set(texts)) == 1 and len(texts) == requests,
        "cache_stores": cs.stores,
        "cache_hits": cs.hits,
        "stats_real_calls": s.real_calls,
        "error_count": len(errs),
        "same_exception_object": bool(errs) and all(e is errs[0] for e in errs),
        "distinct_texts": len(set(texts)),
    }


def _scenario_distinct_keys(requests: int = 4) -> dict[str, Any]:
    cache = _fresh_cache()
    flight = SingleFlight(wait_timeout_s=30.0)
    peaks: list[int] = []
    inner = _BarrierProvider(requests, probe=lambda: peaks.append(flight.inflight))
    cached = CachedLlm(inner, cache, flight=flight)
    texts: list[str] = []
    guard = threading.Lock()
    keys = [{"model": "m", "system": "s", "user": f"u{i}"} for i in range(requests)]

    def one(kw: dict[str, str]) -> None:
        c = cached.complete(**kw)
        with guard:
            texts.append(c.text)

    with ThreadPoolExecutor(max_workers=requests) as pool:
        start = threading.Barrier(requests, timeout=_GATE_TIMEOUT_S)
        futures = []
        for kw in keys:
            def wrapped(kw: dict[str, str] = kw) -> None:
                start.wait()
                one(kw)
            futures.append(pool.submit(wrapped))
        for future in futures:
            future.result(timeout=_GATE_TIMEOUT_S * 2)
    s = flight.stats()
    return {
        "requests": requests,
        "real_calls": len(inner.calls),
        "leaders": s.leaders,
        "coalesced": s.coalesced,
        "inflight_peak": max(peaks, default=0),
        "distinct_texts": len(set(texts)),
    }


def _scenario_disabled(requests: int = REQUESTS) -> dict[str, Any]:
    cache = _fresh_cache()
    inner = _BarrierProvider(requests)
    cached = CachedLlm(inner, cache, flight=None)
    with ThreadPoolExecutor(max_workers=requests) as pool:
        start = threading.Barrier(requests, timeout=_GATE_TIMEOUT_S)
        futures = []

        def wrapped() -> None:
            start.wait()
            cached.complete(model="m", system="s", user="u")

        futures = [pool.submit(wrapped) for _ in range(requests)]
        for future in futures:
            future.result(timeout=_GATE_TIMEOUT_S * 2)
    return {"requests": requests, "real_calls": len(inner.calls), "cache_hits": cache.stats().hits}


def _scenario_timeout() -> dict[str, Any]:
    waits: list[float] = []

    def never_ready(ev: threading.Event, timeout: float) -> bool:
        waits.append(timeout)
        return False

    obs = _scenario_same_key(requests=2, wait=never_ready, wait_timeout_s=0.25)
    obs["waits_recorded"] = len(waits)
    obs["wait_bounded"] = bool(waits) and all(w == pytest.approx(0.25) for w in waits)
    return obs


# ── 离线门（恒跑，不碰网络）───────────────────────────────────────────────

def test_concurrent_same_key_miss_coalesces_to_one_real_call():
    _judge_coalesced_miss(_scenario_same_key())


def test_distinct_keys_never_share_a_flight():
    _judge_no_cross_key_coalescing(_scenario_distinct_keys())


def test_leader_failure_propagates_the_same_exception_and_poisons_nothing():
    _judge_failure_propagates(_scenario_same_key(fail=True))


def test_follower_wait_is_bounded_and_serves_its_own_honest_call():
    _judge_timeout_self_serves(_scenario_timeout())


def test_flight_disabled_is_byte_level_old_behavior():
    _judge_disabled_is_old_behavior(_scenario_disabled())


def test_invalid_wait_timeout_is_rejected():
    # 0/负数等于"永不合并"或"无限挂住"的反面，是配置错误而非关闭开关。
    for bad in (0, -1.0):
        with pytest.raises(ValueError):
            SingleFlight(wait_timeout_s=bad)


def test_sequential_calls_after_a_flight_do_not_reuse_stale_inflight():
    """flight 收尾后同 key 再调用应走**缓存命中**（不是又 join 一个悬挂 flight）。"""
    cache = _fresh_cache()
    inner = _GatedProvider(gate_calls=0)
    flight = SingleFlight()
    cached = CachedLlm(inner, cache, flight=flight)
    kw = {"model": "m", "system": "s", "user": "u"}
    cached.complete(**kw)
    cached.complete(**kw)
    assert len(inner.calls) == 1, "第二次应命中缓存，不该再真调"
    assert flight.inflight == 0, "成功收尾后不留悬挂项"
    assert cache.stats().hits == 1 and flight.stats().coalesced == 0, \
        "缓存命中不得被记成 coalesced"


class _FakeClock:
    def __init__(self, t: float = 1000.0, *, parties: int = 0) -> None:
        self.t = t
        # 变异臂用：让每个调用者都停在 `_entries.get()` 之后、`del` 之前，
        # 把"两个线程同时看见同一过期条目"从概率事件变成确定性事件。
        self.barrier = threading.Barrier(parties, timeout=_GATE_TIMEOUT_S) if parties else None

    def __call__(self) -> float:
        if self.barrier is not None:
            self.barrier.wait()
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += seconds


class _NoopLock:
    """变异臂：把锁退化成直通，证明确实是锁在挡住过期删除竞态，而不是别的机制。"""

    def __enter__(self) -> "_NoopLock":
        return self

    def __exit__(self, *args: Any) -> bool:
        return False


def _completion(seq: int = 1) -> Completion:
    return Completion(text='{"ok":true,"seq":%d}' % seq, provider="fake", model="m",
                      tokens_in=11, tokens_out=3, latency_ms=1.0)


def _concurrent_get(cache: LlmCompletionCache, key: Any, n: int) -> list[BaseException]:
    errors: list[BaseException] = []
    guard = threading.Lock()

    def one() -> None:
        try:
            cache.get(key)
        except BaseException as exc:
            with guard:
                errors.append(exc)

    with ThreadPoolExecutor(max_workers=n) as pool:
        start = threading.Barrier(n, timeout=_GATE_TIMEOUT_S)
        futures = []

        def wrapped() -> None:
            start.wait()
            one()

        futures = [pool.submit(wrapped) for _ in range(n)]
        for future in futures:
            future.result(timeout=_GATE_TIMEOUT_S * 2)
    return errors


def test_concurrent_expired_entry_is_deleted_once_and_never_raises():
    """v696 并发前提下的真 bug：N 路同时 get 一个过期条目，旧版会 KeyError 崩请求。

    这不是统计误差，是 `del self._entries[key]` 对同一键执行 N 次。缓存必须加锁护住
    "读条目 → 判过期 → 删/移动 + 计数"这整段，且只清一次过期、只记一次 expiration。
    """
    clock = _FakeClock()
    cache = LlmCompletionCache(ttl_s=10.0, now=clock)
    key = LlmCompletionCache.key(model="m", system="s", user="u")
    cache.store(key, _completion())
    clock.advance(10.0)
    errors = _concurrent_get(cache, key, 8)
    assert not errors, f"并发过期读取抛异常：{errors[:2]}"
    assert cache.stats().expirations == 1, "过期条目只能被清点一次"
    assert len(cache) == 0, "过期条目必须清干净"
    assert cache.stats().misses == 8, "每路都该按 miss 记账（不谎报命中）"


def test_arm_removing_the_cache_lock_reintroduces_the_expiry_race(monkeypatch):
    """变异臂：把锁换成直通 + 让所有线程在删之前汇合，旧竞态必须复现。"""
    clock = _FakeClock()
    cache = LlmCompletionCache(ttl_s=10.0, now=clock)
    key = LlmCompletionCache.key(model="m", system="s", user="u")
    cache.store(key, _completion())
    clock.advance(10.0)
    n = 6
    monkeypatch.setattr(cache, "_lock", _NoopLock())
    monkeypatch.setattr(cache, "_now", _FakeClock(clock.t, parties=n))
    errors = _concurrent_get(cache, key, n)
    assert any(isinstance(e, KeyError) for e in errors), (
        "锁没被拆掉或竞态没复现：这个臂若恒绿，上一条门就是假的"
    )


def test_config_knobs_reach_the_real_registry_construction(monkeypatch):
    """ADR 0095：注释声称"旋钮经 Registry 生效"必须有门真去读那条构造链。"""
    import redis

    monkeypatch.setattr(redis, "from_url", lambda *a, **k: object())
    base = {
        "NEXUS_OPENAI_API_KEY": "fake-oracle-credential-for-test",
        "NEXUS_OPENAI_BASE_URL": "http://127.0.0.1:1/v1",
        "NEXUS_MODEL_EMBEDDING": "none",
        "NEXUS_LLM_COMPLETION_CACHE_URL": "redis://127.0.0.1:1/0",
        "NEXUS_LLM_SINGLE_FLIGHT_WAIT_S": "0.25",
        "NEXUS_LLM_STICKY_CACHE_KEY": "0",
    }
    on = load_settings(base)
    off = load_settings({**base, "NEXUS_LLM_SINGLE_FLIGHT": "0"})
    assert on.llm_single_flight is True and off.llm_single_flight is False
    assert on.llm_single_flight_wait_s == pytest.approx(0.25)
    assert "llm_single_flight=True" in repr(on), "repr 脱敏同时要如实暴露旋钮"
    assert "fake-oracle-credential-for-test" not in repr(on), "repr 不得泄漏 key"

    built_on = Registry._build_llm(on, None)
    built_off = Registry._build_llm(off, None)
    try:
        f_on = getattr(built_on, "_flight", None)
        f_off = getattr(built_off, "_flight", None)
        assert isinstance(f_on, SingleFlight), "旋钮 True 时 Registry 必须真装上 SingleFlight"
        assert f_on is not None and f_on._wait_timeout_s == pytest.approx(0.25), \
            "等待上限旋钮必须真传进组件，不是摆设"
        assert f_off is None, "旋钮 =0 时必须 byte-level 还原（不装 flight）"
    finally:
        for built in (built_on, built_off):
            close = getattr(getattr(built, "inner", None), "close", None)
            if callable(close):
                close()


# ── 恒跑变异臂：证明判据有牙（离线，纯 dict / 真组件退化，不碰真网关）──────

def _good_coalesced_obs() -> dict[str, Any]:
    return {"requests": 4, "real_calls": 1, "leaders": 1, "joined": 3, "coalesced": 3,
            "timeouts": 0, "failures": 0, "inflight_after": 0, "texts_are_identical": True,
            "cache_stores": 1, "cache_hits": 0, "stats_real_calls": 1}


def test_arm_no_coalescing_goes_red():
    obs = {**_good_coalesced_obs(), "real_calls": 4, "coalesced": 0,
           "cache_stores": 4, "stats_real_calls": 4}
    with pytest.raises(AssertionError, match="不止一次真 provider"):
        _judge_coalesced_miss(obs)


def test_arm_coalesced_misreported_as_cache_hit_goes_red():
    obs = {**_good_coalesced_obs(), "cache_hits": 3}
    with pytest.raises(AssertionError, match="不.*命中|命中率"):
        _judge_coalesced_miss(obs)


def test_arm_constant_proxy_quantity_goes_red():
    obs = {"requests": 4, "real_calls": 4, "leaders": 4, "coalesced": 0,
           "inflight_peak": 1, "distinct_texts": 4}
    with pytest.raises(AssertionError, match="代理量|随并发增长"):
        _judge_no_cross_key_coalescing(obs)


def test_arm_cross_key_coalescing_goes_red():
    obs = {"requests": 4, "real_calls": 1, "leaders": 1, "coalesced": 3,
           "inflight_peak": 1, "distinct_texts": 1}
    with pytest.raises(AssertionError):
        _judge_no_cross_key_coalescing(obs)


def test_arm_distinct_follower_exceptions_goes_red():
    obs = {"requests": 4, "error_count": 4, "same_exception_object": False,
           "real_calls": 1, "failures": 1, "cache_stores": 0, "inflight_after": 0}
    with pytest.raises(AssertionError, match="同一个异常"):
        _judge_failure_propagates(obs)


def test_arm_timeout_faked_as_coalesced_goes_red():
    obs = {"real_calls": 1, "timeouts": 0, "coalesced": 1, "cache_hits": 0,
           "distinct_texts": 1, "waits_recorded": 1, "wait_bounded": True}
    with pytest.raises(AssertionError):
        _judge_timeout_self_serves(obs)


def test_arm_unbounded_wait_goes_red():
    obs = {"real_calls": 2, "timeouts": 1, "coalesced": 0, "cache_hits": 0,
           "distinct_texts": 2, "waits_recorded": 1, "wait_bounded": False}
    with pytest.raises(AssertionError, match="无限挂住"):
        _judge_timeout_self_serves(obs)


def test_arm_disabled_but_still_coalesced_goes_red():
    with pytest.raises(AssertionError, match="禁用时不应减少真调用"):
        _judge_disabled_is_old_behavior({"requests": 4, "real_calls": 1, "cache_hits": 0})


def test_arm_correct_observations_are_green():
    """正向对照：判据不惩罚正确实现（ADR 0094 X4）。"""
    _judge_coalesced_miss(_good_coalesced_obs())
    _judge_no_cross_key_coalescing({"requests": 4, "real_calls": 4, "leaders": 4,
                                    "coalesced": 0, "inflight_peak": 4, "distinct_texts": 4})
    _judge_failure_propagates({"requests": 4, "error_count": 4, "same_exception_object": True,
                               "real_calls": 1, "failures": 1, "cache_stores": 0,
                               "inflight_after": 0})


def test_arm_real_component_without_flight_run_goes_red(monkeypatch):
    """判据真连着生产组件：把 SingleFlight.run 退化成直通，真组件场景必须红。"""
    monkeypatch.setattr(SingleFlight, "run", lambda self, key, work: work())
    obs = _scenario_same_key(require_join=False)
    with pytest.raises(AssertionError):
        _judge_coalesced_miss(obs)


# ── 真线路 opt-in 腿（函数级 skipif，无 key 则 skip、不假绿）────────────────

def _live_ready() -> bool:
    if (os.environ.get("NEXUS_LIVE_LLM", "") or "").strip() != "1":
        return False
    from dotenv import load_dotenv
    load_dotenv(_ENV_FILE, override=False)
    return bool(
        os.environ.get("NEXUS_OPENAI_API_KEY", "").strip()
        and os.environ.get("NEXUS_OPENAI_BASE_URL", "").strip()
    )


_LIVE_SKIP = pytest.mark.skipif(
    not _live_ready(),
    reason="real-gateway single-flight leg opt-in: set NEXUS_LIVE_LLM=1 + .env with real key",
)


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


@_LIVE_SKIP
def test_live_concurrent_same_prompt_uses_one_real_gateway_call():
    """真 gpt-6-sol：N 路并发同 prompt，single-flight 应只放 1 个请求到网关。

    用生产 `OpenAICompatibleProvider` + 生产 `CachedLlm` + 生产 `SingleFlight`；
    计数在 transport 层（SSE 与非流两条 body 路径的共同出站点，ADR 0127）。
    不钉延迟/token 字面值——供应商通道会变；只钉"真网关只被打了 1 次"这个不变量。
    """
    from dotenv import load_dotenv
    load_dotenv(_ENV_FILE, override=False)
    counting = _CountingTransport(httpx.HTTPTransport())
    provider = OpenAICompatibleProvider(
        api_key=os.environ["NEXUS_OPENAI_API_KEY"].strip(),
        base_url=os.environ["NEXUS_OPENAI_BASE_URL"].strip(),
        models={"balanced": "gpt-6-sol"},
        transport=counting,
    )
    cache = _fresh_cache()
    flight = SingleFlight(wait_timeout_s=90.0)
    cached = CachedLlm(provider, cache, flight=flight)
    texts: list[str] = []
    completions: list[Completion] = []
    guard = threading.Lock()
    requests = 3

    def one() -> None:
        c = cached.complete(model="gpt-6-sol", system=ORACLE_SYSTEM, user=ORACLE_USER)
        with guard:
            texts.append(c.text)
            completions.append(c)

    try:
        _run_threads(requests, one)
        assert counting.calls == 1, f"真网关被打了 {counting.calls} 次，single-flight 未合并"
        assert len(texts) == requests and len(set(texts)) == 1, "follower 必须拿到同一个 Completion"
        assert flight.stats().coalesced == requests - 1
        assert flight.stats().real_calls == 1
        assert cache.stats().hits == 0, "合并不得虚报成缓存命中"
        # 真的拿回了模型回复，而不是把一次失败/空响应合并给了三路（ADR 0110 正向锚）。
        import json
        first = completions[0]
        assert first.tokens_in > 0 and first.tokens_out > 0, "首次不像真调用"
        assert json.loads(first.text).get("pong") is True, "真网关回复应仍是合法 JSON mode 响应"
        print(
            f"[v696 live] requests={requests} gateway_calls={counting.calls} "
            f"coalesced={flight.stats().coalesced} real_calls={flight.stats().real_calls} "
            f"cache_hits={cache.stats().hits} tokens_in={first.tokens_in} "
            f"tokens_out={first.tokens_out} latency_ms={first.latency_ms:.0f}"
        )
    finally:
        provider.close()


@_LIVE_SKIP
def test_live_disabled_flight_makes_n_real_gateway_calls():
    """同进程反事实臂（ADR 0112）：关掉 flight，同样 3 路并发必须真的打 3 次网关。

    这条不是"猜省了多少"，而是把上一条腿的 1 次和这里的 N 次放在**同一个真 provider**上
    对照，证明省下的调用来自 single-flight 而不是缓存/网关去重。两条腿都用同一 ORACLE
    prompt 和独立 cache，互不污染。
    """
    from dotenv import load_dotenv
    load_dotenv(_ENV_FILE, override=False)
    counting = _CountingTransport(httpx.HTTPTransport())
    provider = OpenAICompatibleProvider(
        api_key=os.environ["NEXUS_OPENAI_API_KEY"].strip(),
        base_url=os.environ["NEXUS_OPENAI_BASE_URL"].strip(),
        models={"balanced": "gpt-6-sol"},
        transport=counting,
    )
    cache = _fresh_cache()
    cached = CachedLlm(provider, cache, flight=None)
    requests = 3

    def one() -> None:
        cached.complete(model="gpt-6-sol", system=ORACLE_SYSTEM, user=ORACLE_USER)

    try:
        _run_threads(requests, one)
        assert counting.calls == requests, (
            f"禁用 flight 后网关只收到 {counting.calls} 次；若 < {requests}，"
            "说明省调用另有来源，上一条腿的 1 次不能归因给 single-flight"
        )
        assert cache.stats().hits == 0, "Barrier 保证并发同时进 provider，不该有中途命中"
        print(f"[v696 live A/B] flight=off requests={requests} gateway_calls={counting.calls}")
    finally:
        provider.close()
