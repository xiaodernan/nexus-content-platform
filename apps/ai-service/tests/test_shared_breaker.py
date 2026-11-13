"""**跨实例共享断路器**门（v683，Redis 后端；ADR 0116）。

v682 的 `CircuitBreaker` 是**进程内**的：多副本部署时每个实例各记各的失败率，
上游真挂了也要等每个实例各自攒够样本才熔断。本片把"上游此刻不健康"做成**跨进程共享
的事实**：用 Redis 原子命令（INCR 天然原子 + pipeline 事务快照 + 幂等 SET phase EX）
让所有实例共享同一个 count-based 失败窗口与 OPEN 期。这是微服务容错柱的完成态，
也是 Redis 在"分布式熔断"上的真实运用（计网：共享状态 / 竞态 / TTL 自动机）。

**为什么纯新增、不替换 v682 的生产 breaker**（v680 / ADR 0113 同款纪律）：
"同步 `complete()` 何时切到共享后端"涉及**跨契约语义**——Redis 断连时 fail-open 还是
fail-closed、窗口边界突发、每次请求是否同步等 Redis（延迟 / 可用性耦合）——尚未定。
按 ADR 0090/0094 X4 **语义未定就不定门、不接线、记 ADR 仍欠**：本片只做可复用组件
+ 门 + 真 Redis 两进程字节往返实证，零生产接线、零回归。降级**策略由构造参数注入**，
门只钉"如实标注 degraded、不谎称共享"，不钉该选哪个策略。

**关键反漂移设计（ADR 0095）**：熔断判定抽成纯函数 `should_open(failures, total, *,
minimum, threshold)`，生产 record 与门/臂**共用这一个真值**——不做 Lua，避免
"Lua 一份 / Python 一份"两套判定漂移。原子性由 Redis 命令语义（INCR / pipeline）
保证，不由判定代码位置保证。

复杂度（ADR 0112）：判定 O(1) 常数次 Redis 命令，不随窗口大小增长；正向锚 + 两档
相等 + 静态前提耦合（仍走 INCR 原子计数、判定仍调纯函数，无 KEYS/SCAN 全量遍历）。

沿用 ADR 0110 三段式：真值门 + 恒跑变异臂 + 真 Redis opt-in 腿（函数级 skipif，
无 URL 不发网络、不假绿；设了却连不上**报错**而非 skip）。
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import pytest

from ai_service.resilience import BreakerConfig, CircuitOpen

_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


# ── 判据（单一真值：真值门与变异臂共用；钉性质不钉字面）──────────────────

def _judge_cross_instance(obs: dict[str, Any]) -> None:
    """实例 A 的失败必须被**实例 B** 看到（共享真相，不是各自局部分数）。"""
    assert obs["b_sees_a_failures"] >= obs["a_recorded_failures"], (
        f"实例 B 没看到实例 A 的失败（各记各的=没共享）：B 见 {obs['b_sees_a_failures']}, "
        f"A 记 {obs['a_recorded_failures']}"
    )
    assert obs["b_rejected"] is True, "实例 A 把 breaker 打开后，实例 B 的 before_call 应被拒"


def _judge_ignored_not_shared(obs: dict[str, Any]) -> None:
    """坑②跨实例：404/确定性错不进共享窗口，健康服务不被自己（或别人）的 404 熔断。"""
    assert obs["shared_failures"] == 0, f"豁免结果不该进共享失败计数，实测 {obs['shared_failures']}"
    assert obs["b_state"] != "open", f"404 不该让实例 B 看到 OPEN，实测 {obs['b_state']}"


def _judge_open_expires_to_probe(obs: dict[str, Any]) -> None:
    """坑③：OPEN 期由 Redis TTL 到点自动放行（无后台线程、跨进程可见）。"""
    assert obs["during_wait"] == "open", f"等待期内应仍 OPEN，实测 {obs['during_wait']}"
    assert obs["after_wait"] == "probe", f"TTL 到点应自动放行探测，实测 {obs['after_wait']}"


def _judge_degrade_honest(obs: dict[str, Any]) -> None:
    """Redis 断连降级必须**如实标注**，绝不谎称仍在共享。钉性质，不钉选哪个策略。"""
    assert obs["shared"] is False, "断连时 stats().shared 必须为 False（不谎称共享）"
    assert obs["degraded"] is True, "断连时必须标注 degraded"
    assert obs["not_silent"] is True, "降级不能静默——调用方要能从 stats 读到"


def _judge_shared_when_healthy(obs: dict[str, Any]) -> None:
    """Redis 健康时如实标注 shared=True、degraded=False（与降级对照）。"""
    assert obs["shared"] is True and obs["degraded"] is False


def _judge_o1_redis_ops(obs: dict[str, Any], *, m: int) -> None:
    """单次 record 的 Redis 命令数恒定（与窗口/失败数无关）；正向锚 >0。"""
    assert obs["redis_ops"] == m, (
        f"O(1) 更新应每次 record 恰好恒定步数代理量，实测 {obs['redis_ops']} vs {m}"
    )
    assert obs["redis_ops"] > 0, "正向锚：代理量必须 >0，否则换实现恒 0 全绿假绿（ADR 0112）"


def _judge_o1_source(src: str) -> None:
    """静态前提耦合：判定仍调纯函数 should_open、计数仍走 INCR 原子，无 KEYS/SCAN。"""
    assert "should_open(" in src, "熔断判定必须调纯函数 should_open（单一真值，ADR 0095）"
    assert "incr(" in src, "失败/成功计数必须走 Redis INCR 原子命令"
    assert "pipeline" in src, "计数快照必须走 pipeline 事务，避免多进程读到撕裂值"
    for banned in ("keys(", "scan_iter(", "smembers("):
        assert banned not in src, f"出现全量遍历 {banned}，O(1) 判定不成立"


def _judge_should_open(judgement: dict[str, Any]) -> None:
    """纯判据：样本达 minimum 且失败率越阈值 → OPEN；样本不足绝不开（防小样本误熔断）。"""
    assert judgement["open"] is True, (
        f"样本({judgement['total']})达 minimum({judgement['minimum']}) 且失败率"
        f"({judgement['rate_pct']})越阈值({judgement['threshold']}) 应 OPEN"
    )


# ── Fake Redis（纯内存，恒跑；支持本组件用到的原子命令与 pipeline）────────

class _Pipe:
    def __init__(self, store: dict[str, str], ttls: dict[str, float], clock) -> None:
        self._s, self._t, self._clock = store, ttls, clock
        self._ops: list[tuple] = []

    def incr(self, key: str) -> "_Pipe":
        self._ops.append(("incr", key))
        return self

    def get(self, key: str) -> "_Pipe":
        self._ops.append(("get", key))
        return self

    def ttl(self, key: str) -> "_Pipe":
        self._ops.append(("ttl", key))
        return self

    def execute(self) -> list[Any]:
        out: list[Any] = []
        for op, key in self._ops:
            if op == "incr":
                self._expire_if_needed(key)
                val = int(self._s.get(key, "0")) + 1
                self._s[key] = str(val)
                out.append(val)
            elif op == "get":
                self._expire_if_needed(key)
                out.append(self._s.get(key))
            elif op == "ttl":
                self._expire_if_needed(key)
                exp = self._t.get(key)
                out.append(-1 if exp is None else max(0, int(exp - self._clock())))
        return out

    def _expire_if_needed(self, key: str) -> None:
        exp = self._t.get(key)
        if exp is not None and self._clock() >= exp:
            self._s.pop(key, None)
            self._t.pop(key, None)


class FakeRedis:
    """多实例共享同一个 store + ttl = 同一 Redis 服务器；断连可注入。

    注意 ttl 也必须共享：真实场景里 A 实例 SET EX 的过期时间，B 实例 GET 时同样要能看到
    （两个 client 连的是同一台服务器）。只共享 s 不共享 t 会让"跨实例 TTL 自动半开"假红。
    """

    def __init__(self, shared: dict | None = None, clock=None, shared_ttl: dict | None = None) -> None:
        self.s = shared if shared is not None else {}
        self.t = shared_ttl if shared_ttl is not None else {}
        self.clock = clock or (lambda: 0.0)
        self.down = False
        self.ops = 0  # 代理量：每次原子命令 +1

    def _check(self) -> None:
        if self.down:
            raise ConnectionError("fake redis is down")

    def incr(self, key: str) -> int:
        self._check(); self.ops += 1
        pipe = _Pipe(self.s, self.t, self.clock); return pipe.incr(key).execute()[0]

    def get(self, key: str) -> str | None:
        self._check(); self.ops += 1
        return _Pipe(self.s, self.t, self.clock).get(key).execute()[0]

    def set(self, key: str, value: str, *, ex: float | None = None) -> None:
        self._check(); self.ops += 1
        self.s[key] = value
        if ex is not None:
            self.t[key] = self.clock() + ex

    def expire(self, key: str, ttl: float) -> None:
        self._check(); self.ops += 1
        self.t[key] = self.clock() + ttl

    def ttl(self, key: str) -> int:
        self._check(); self.ops += 1
        return _Pipe(self.s, self.t, self.clock).ttl(key).execute()[0]

    def delete(self, *keys: str) -> None:
        self._check()
        for k in keys:
            self.s.pop(k, None); self.t.pop(k, None)

    def pipeline(self) -> _Pipe:
        self._check()
        return _Pipe(self.s, self.t, self.clock)


class _Clock:
    def __init__(self, t: float = 1000.0) -> None:
        self.t = t

    def __call__(self) -> float:
        return self.t

    def advance(self, s: float) -> None:
        self.t += s


# ── 装置（延迟 import 组件：先红阶段组件不存在，判据臂仍恒跑）───────────

def _shared_cls():
    from ai_service.shared_breaker import SharedCircuitBreaker
    return SharedCircuitBreaker


def _cfg(**over) -> BreakerConfig:
    base = dict(name="llm-upstream", sliding_window_size=20, minimum_number_of_calls=3,
                failure_rate_threshold=50.0, wait_duration_in_open_state_s=10.0,
                permitted_calls_in_half_open=1)
    base.update(over)
    return BreakerConfig(**base)


def _pair(clock: _Clock, **over):
    SharedCircuitBreaker = _shared_cls()
    shared: dict[str, str] = {}
    shared_ttl: dict[str, float] = {}  # 两台 client 连同一台 Redis → store 与 ttl 都共享
    a = SharedCircuitBreaker(_cfg(**over), client=FakeRedis(shared, clock, shared_ttl), namespace="t", clock=clock)
    b = SharedCircuitBreaker(_cfg(**over), client=FakeRedis(shared, clock, shared_ttl), namespace="t", clock=clock)
    return a, b, shared


# ── 真值门（离线恒跑，Fake Redis 共享 store）─────────────────────────────

def test_failures_in_instance_a_are_seen_and_reject_instance_b():
    """跨实例共享：A 记失败到 OPEN，B 的 before_call 被同一 OPEN 拒门。"""
    clock = _Clock()
    a, b, _ = _pair(clock)
    for _ in range(3):
        a.record_failure()
    b_stats = b.stats()
    b_rejected = False
    try:
        b.before_call()
    except CircuitOpen:
        b_rejected = True
    _judge_cross_instance({
        "a_recorded_failures": a.stats()["shared_failures"],
        "b_sees_a_failures": b_stats["shared_failures"],
        "b_rejected": b_rejected,
    })


def test_ignored_404_does_not_trip_the_other_instance():
    """坑②跨实例：A 连续 404（ignored）不进共享窗口，B 看到的失败仍为 0、不熔断。"""
    clock = _Clock()
    a, b, _ = _pair(clock)
    for _ in range(20):
        a.record_ignored()
    _judge_ignored_not_shared({
        "shared_failures": b.stats()["shared_failures"],
        "b_state": b.stats()["state"],
    })


def test_open_expires_via_redis_ttl_and_lets_b_probe():
    """坑③：OPEN 带 TTL；等待期内 B 仍被拒，到点 Redis key 自动消失、B 得放行探测。"""
    clock = _Clock()
    a, b, _ = _pair(clock, wait_duration_in_open_state_s=5)
    for _ in range(3):
        a.record_failure()
    during = b.stats()["state"]
    rejected_during = False
    try:
        b.before_call()  # 等待期内：应抛
    except CircuitOpen:
        rejected_during = True
    assert during == "open" and rejected_during, "等待期内实例 B 应看到 OPEN 且被拒"
    clock.advance(5)  # Redis TTL 到点
    b.before_call()  # 到点：应放行（不抛）
    probe = "probe"
    _judge_open_expires_to_probe({"during_wait": during, "after_wait": probe})


def test_degrade_is_honest_not_silent():
    """Redis 断连：stats 如实标 shared=False / degraded=True，不谎称共享。"""
    SharedCircuitBreaker = _shared_cls()
    clock = _Clock()
    client = FakeRedis({}, clock)
    br = SharedCircuitBreaker(_cfg(), client=client, namespace="t", clock=clock)
    client.down = True
    br.record_success()  # 断连下降级，不抛、不谎称
    s = br.stats()
    _judge_degrade_honest({
        "shared": s["shared"], "degraded": s["degraded"], "not_silent": "degraded" in s,
    })


def test_healthy_redis_is_reported_shared():
    clock = _Clock()
    a, _, _ = _pair(clock)
    a.record_success()
    s = a.stats()
    _judge_shared_when_healthy({"shared": s["shared"], "degraded": s["degraded"]})


def test_redis_ops_are_o1_across_window_sizes():
    """复杂度：窗口 3 vs 300 各跑 M 次 record，Redis 命令数相等且 >0（正向锚）。"""
    SharedCircuitBreaker = _shared_cls()
    m = 40
    ops: dict[int, int] = {}
    for width in (3, 300):
        clock = _Clock()
        client = FakeRedis({}, clock)
        # 用高阈值+大样本门避免中途 OPEN，纯测更新成本
        br = SharedCircuitBreaker(
            _cfg(sliding_window_size=width, minimum_number_of_calls=width,
                 failure_rate_threshold=100.0),
            client=client, namespace="t", clock=clock,
        )
        for _ in range(m):
            br.record_success()
        ops[width] = br.stats()["record_ops"]
    assert ops[3] == ops[300], f"两档窗口单次 record 成本应相等（O(1)），实测 {ops}"
    _judge_o1_redis_ops({"redis_ops": ops[3], "m": m}, m=m)


def test_source_stays_o1_and_single_truth():
    """静态前提耦合：判定仍调 should_open、计数仍 INCR+pipeline、无全量遍历。"""
    import importlib
    src = Path(importlib.import_module("ai_service.shared_breaker").__file__).read_text(encoding="utf-8")
    _judge_o1_source(src)


def test_should_open_pure_judge_gate():
    """纯判据真值门：样本够 + 失败率越阈值 → open=True。"""
    from ai_service.shared_breaker import should_open
    j = should_open(6, 10, minimum=5, threshold=50.0)
    _judge_should_open({"open": j, "total": 10, "minimum": 5, "rate_pct": 60.0, "threshold": 50.0})


# ── 恒跑变异臂（证明判据有牙；离线纯 dict/源码，不改生产）────────────────

def test_arm_no_cross_instance_goes_red():
    with pytest.raises(AssertionError, match="没共享"):
        _judge_cross_instance({"a_recorded_failures": 3, "b_sees_a_failures": 0, "b_rejected": False})


def test_arm_ignored_pollutes_window_goes_red():
    with pytest.raises(AssertionError, match="共享失败计数"):
        _judge_ignored_not_shared({"shared_failures": 5, "b_state": "closed"})


def test_arm_open_never_expires_goes_red():
    with pytest.raises(AssertionError, match="TTL 到点"):
        _judge_open_expires_to_probe({"during_wait": "open", "after_wait": "open"})


def test_arm_degrade_lying_about_shared_goes_red():
    with pytest.raises(AssertionError, match="不谎称共享"):
        _judge_degrade_honest({"shared": True, "degraded": False, "not_silent": True})


def test_arm_small_sample_opens_goes_red():
    """反向：should_open 若在小样本就开是**判据自身**的红——这里证明纯判据钉了样本门。"""
    from ai_service.shared_breaker import should_open
    assert should_open(1, 1, minimum=5, threshold=50.0) is False, "样本不足 minimum 绝不该 OPEN"


def test_arm_on_redis_ops_goes_red():
    with pytest.raises(AssertionError, match="代理量"):
        _judge_o1_redis_ops({"redis_ops": 0, "m": 40}, m=40)


def test_arm_on_source_rewrite_goes_red():
    with pytest.raises(AssertionError, match="should_open"):
        _judge_o1_source("def record(self):\n    all = self.client.keys('*')\n    ...")


def test_arm_correct_and_renamed_configs_stay_green():
    """正向对照（ADR 0094 X4）：换 minimum/threshold/wait/name，判据不钉字面仍绿。"""
    _judge_cross_instance({"a_recorded_failures": 7, "b_sees_a_failures": 7, "b_rejected": True})
    _judge_ignored_not_shared({"shared_failures": 0, "b_state": "closed"})
    _judge_open_expires_to_probe({"during_wait": "open", "after_wait": "probe"})
    _judge_degrade_honest({"shared": False, "degraded": True, "not_silent": True})
    _judge_shared_when_healthy({"shared": True, "degraded": False})
    _judge_o1_redis_ops({"redis_ops": 51, "m": 51}, m=51)
    _judge_o1_source(
        "def record(self):\n    p = self.client.pipeline()\n    p.incr(k)\n"
        "    if should_open(...): self.client.set(phase, 'open', ex=wait)\n"
    )


# ── 真 Redis opt-in 腿（函数级 skipif；两独立 client = 两"进程"字节往返）──

def _live_ready() -> bool:
    if (os.environ.get("NEXUS_CB_REDIS_LIVE", "") or "").strip() != "1":
        return False
    from dotenv import load_dotenv
    load_dotenv(_ENV_FILE, override=False)
    return bool((os.environ.get("NEXUS_CB_REDIS_URL", "") or "").strip())


_LIVE_SKIP = pytest.mark.skipif(
    not _live_ready(),
    reason="real-redis shared-breaker leg opt-in: set NEXUS_CB_REDIS_LIVE=1 + NEXUS_CB_REDIS_URL",
)


@_LIVE_SKIP
def test_live_two_processes_share_open_state_over_real_redis():
    """真 56379：两独立 Redis client（模拟两进程）共享 OPEN 事实，TTL 到点自动放行。"""
    import time as _time
    import uuid
    import redis as redis_lib
    from dotenv import load_dotenv
    load_dotenv(_ENV_FILE, override=False)
    url = os.environ["NEXUS_CB_REDIS_URL"].strip()
    SharedCircuitBreaker = _shared_cls()
    ns = f"nexus:cb:live:{uuid.uuid4().hex[:8]}"
    cfg = _cfg(minimum_number_of_calls=3, failure_rate_threshold=50.0,
               wait_duration_in_open_state_s=2)
    a = SharedCircuitBreaker(cfg, client=redis_lib.from_url(url, decode_responses=True), namespace=ns)
    b = SharedCircuitBreaker(cfg, client=redis_lib.from_url(url, decode_responses=True), namespace=ns)
    try:
        for _ in range(3):
            a.record_failure()
        assert a.stats()["state"] == "open"
        assert b.stats()["shared_failures"] >= 3, "进程 B 应经真 Redis 看到进程 A 的失败"
        b_rejected = False
        try:
            b.before_call()
        except CircuitOpen:
            b_rejected = True
        assert b_rejected, "进程 B 的 before_call 应被共享的 OPEN 拒门"
        _time.sleep(2.2)  # 等 Redis phase key 的 TTL 真过期
        b.before_call()  # 到点应放行（不抛）
        assert b.stats()["state"] != "open", "TTL 到点后 OPEN 应消失"
    finally:
        for br in (a, b):
            try:
                br._delete_all()
            except Exception:
                pass
