"""**跨实例共享断路器**（v683，Redis 后端；ADR 0116）。

v682 的 `CircuitBreaker` 是进程内的：多副本部署时每个实例各记各的失败率，上游真挂了
也要等每个实例各自攒够样本才熔断。本组件把"上游此刻不健康"做成**跨进程共享的事实**：
所有实例共用同一个 count-based 失败窗口与 OPEN 期，一个实例攒够失败，全体立即拒门。

实现只用 **Redis 原生原子命令**，不写 Lua：
- 计数走 `INCR`（天然原子）+ `pipeline` 事务拿一致快照——多进程同时 `record` 不会漏开；
  重复判定只会**幂等**地 `SET phase = open`，无害。
- **熔断判定抽成纯函数 `should_open(failures, total, *, minimum, threshold)`**：
  生产 `record` 与门/变异臂**共用这一个真值**（ADR 0095）——不做 Lua，避免"Lua 一份 /
  Python 一份"两套判定漂移。原子性由 Redis 命令语义保证，不由判定代码位置保证。
- OPEN 期用 `SET phase open EX wait`：**Redis TTL 到点 key 自动消失**，下一 `before_call`
  即放行探测——坑③"OPEN 必须自动回 HALF_OPEN"由 Redis 自身实现，无需后台线程，
  且**跨进程可见**（任一实例看到的都是同一份 TTL）。
- 404 / 确定性错走 `record_ignored()`，**不进共享窗口**（坑②跨实例仍成立）。

**零生产接线（v680/ADR 0113 同款纪律）**：本组件是**可复用的分布式熔断决策器**，但
"同步 `complete()` 何时切到共享后端"涉及跨契约语义（断连 fail-open/closed/本地、窗口边界
突发、每次请求是否同步等 Redis 的延迟与可用性耦合），尚未定。按 ADR 0090/0094 X4
**语义未定就不定门、不接线、记 ADR 仍欠**；降级**策略由构造参数注入**，门只钉"如实标注
degraded、不谎称共享"，不钉该选哪个策略。

数据结构复杂度：`record` 每次发**固定条数**原子命令（与窗口大小、失败数无关），
`record_ops` 如实计逻辑更新步数供复杂度门读（ADR 0112）；不 `KEYS`/`SCAN` 全量遍历。

§159 诚实：跨进程 HALF_OPEN 的**并发探测协调**（累计 N 次成功才闭合）仍欠——当前
"phase 到期即放行、一次成功探测即闭合"是最小镜像；见 ADR 0116 仍欠。
"""
from __future__ import annotations

from typing import Any, Callable

from .resilience import BreakerConfig, CircuitOpen, CircuitBreaker

# 固定 4 个 Redis key 后缀（定点 delete，不用 KEYS/SCAN——既不 O(n)，也不误删别的命名空间）
_K_TOTAL = "total"
_K_FAIL = "fail"
_K_OK = "ok"
_K_PHASE = "phase"
_K_PROBE = "probe"
_KEY_SUFFIXES = (_K_TOTAL, _K_FAIL, _K_OK, _K_PHASE, _K_PROBE)


def should_open(
    failures: int, total: int, *, minimum: int, threshold: float
) -> bool:
    """熔断判定**唯一真值**：样本达 minimumNumberOfCalls 且失败率越阈值 → OPEN。

    纯函数、无副作用、无 Redis 依赖。生产 `record` 与门 / 变异臂共用，杜绝
    "改判据忘改臂"或"Lua 与 Python 两份实现漂移"（ADR 0095）。
    """
    if total < minimum:
        return False  # 小样本绝不开——防健康服务被头几次抖动误熔断
    return (failures * 100.0 / total) >= threshold


class SharedCircuitBreaker:
    """Redis 共享真相的断路器。注入 `client`（redis-py 同步客户端或测试 fake 均可）。

    `degraded` 取 `"local"`（退回进程内 `CircuitBreaker`，默认，零行为突变）/
    `"open"`（fail-closed，拒门）/ `"closed"`（fail-open，放行）。**语义未定**：门不钉
    该选哪个，只钉降级时 `stats()` 如实标注 `shared=False`、`degraded=True`。

    `namespace` 隔离不同上游/不同 breaker；所有 key = `namespace:suffix`。
    """

    def __init__(
        self,
        config: BreakerConfig,
        *,
        client: Any,
        namespace: str = "nexus:cb",
        degraded: str = "local",
        clock: Callable[[], float] | None = None,
        window_ttl_s: float = 60.0,
    ) -> None:
        if degraded not in ("local", "open", "closed"):
            raise ValueError("degraded 必须是 'local' / 'open' / 'closed' 之一")
        if window_ttl_s <= 0:
            raise ValueError("window_ttl_s 必须 > 0")
        self._cfg = config
        self._client = client
        self._ns = namespace.rstrip(":")
        self._degraded_mode = degraded
        self._clock = clock or (lambda: 0.0)
        self._window_ttl = int(window_ttl_s)
        self._record_ops = 0

        # 降级真相（诚实账本，不含 key）
        self._degraded = False
        self._shared = True
        # 本地兜底 breaker：仅 degraded="local" 且 Redis 断连时启用
        self._local: CircuitBreaker | None = (
            CircuitBreaker(config, clock=self._clock) if degraded == "local" else None
        )

    # ── key 命名空间（定点，不用通配）─────────────────────────────────────

    def _k(self, suffix: str) -> str:
        return f"{self._ns}:{suffix}"

    # ── 门卫 / 结果上报 ────────────────────────────────────────────────────

    def before_call(self) -> None:
        """调用前门卫：共享 OPEN 期拒门（跨进程），到点自动放行探测；断连按策略降级。"""
        try:
            phase = self._client.get(self._k(_K_PHASE))
            if phase == "open":
                remaining = self._client.ttl(self._k(_K_PHASE))
                raise CircuitOpen(self._cfg.name, max(0.0, float(remaining)))
            self._shared, self._degraded = True, False
        except CircuitOpen:
            raise  # 熔断拒门是正常信号，不是 Redis 故障
        except Exception:
            self._on_degrade()
            if self._degraded_mode == "open":
                raise CircuitOpen(self._cfg.name, 0.0)
            if self._degraded_mode == "local" and self._local is not None:
                self._local.before_call()
            # degraded="closed"：fail-open，直接放行
            return

    def record_success(self) -> None:
        """一条逻辑请求成功。若处于"phase 已过期待探测"态，一次成功即闭合（最小镜像）。"""
        self._record(failed=False)

    def record_failure(self) -> None:
        """一条**瞬时**逻辑请求失败（429/5xx/网络）——计入共享窗口。"""
        self._record(failed=True)

    def record_ignored(self) -> None:
        """确定性"答案"（404/凭据/请求错）——**不进共享窗口**，健康服务不被自己熔断。"""
        try:
            # 只读一次 phase 以刷新 shared/degraded 真相；**不 INCR 任何计数字段**（不进窗口）
            self._client.get(self._k(_K_PHASE))
            self._shared, self._degraded = True, False
        except Exception:
            self._on_degrade()
            if self._degraded_mode == "local" and self._local is not None:
                self._local.record_ignored()

    def _record(self, *, failed: bool) -> None:
        """固定条数原子命令更新共享窗口；判定调纯函数 should_open（单一真值）。"""
        try:
            # pipeline 事务：拿 total 与（fail 或 ok）的一致快照。两分支都恰好 2 条 INCR，
            # 失败/成功路径成本相同（与窗口大小无关 → O(1)）。
            pipe = self._client.pipeline()
            pipe.incr(self._k(_K_TOTAL))
            pipe.incr(self._k(_K_FAIL if failed else _K_OK))
            total = int(pipe.execute()[0])

            # 首次写入带 TTL 兜底，防窗口永久累积（count-based 主判据是 total/fail 计数）
            self._client.expire(self._k(_K_TOTAL), self._window_ttl)
            self._client.expire(self._k(_K_FAIL if failed else _K_OK), self._window_ttl)

            fail_raw = self._client.get(self._k(_K_FAIL))
            failures = int(fail_raw) if fail_raw is not None else 0

            # 处于"phase 已过期、待探测"态且这次成功 → 清探针回 CLOSED（最小镜像）
            phase = self._client.get(self._k(_K_PHASE))
            if phase is None and not failed:
                self._client.delete(self._k(_K_PROBE))

            if should_open(
                failures, total,
                minimum=self._cfg.minimum_number_of_calls,
                threshold=self._cfg.failure_rate_threshold,
            ):
                # 幂等 SET：多进程同时越阈值也只会把同一 phase 设成 open，无害
                self._client.set(self._k(_K_PHASE), "open", ex=int(self._cfg.wait_duration_in_open_state_s))
                self._client.set(self._k(_K_PROBE), "1")

            self._shared, self._degraded = True, False
            self._record_ops += 1
        except Exception:
            self._on_degrade()
            if self._degraded_mode == "local" and self._local is not None:
                (self._local.record_failure if failed else self._local.record_success)()
            self._record_ops += 1  # 降级路径也是一次逻辑 record，成本仍恒定

    # ── 降级 / 观测 ────────────────────────────────────────────────────────

    def _on_degrade(self) -> None:
        self._degraded, self._shared = True, False

    @property
    def state(self) -> str:
        """共享状态快照：OPEN（phase 在）/ HALF_OPEN（phase 过期但探针在）/ CLOSED。"""
        try:
            phase = self._client.get(self._k(_K_PHASE))
            if phase == "open":
                return "open"
            probe = self._client.get(self._k(_K_PROBE))
            if probe == "1":
                return "half_open"
            return "closed"
        except Exception:
            self._on_degrade()
            if self._degraded_mode == "local" and self._local is not None:
                return self._local.state
            return "closed"

    def stats(self) -> dict[str, Any]:
        """只读可观测快照（§159：诚实标注是否仍共享，不含任何 credential）。"""
        try:
            fail_raw = self._client.get(self._k(_K_FAIL))
            failures = int(fail_raw) if fail_raw is not None else 0
            st = self.state
            if not self._degraded:
                self._shared = True
        except Exception:
            self._on_degrade()
            failures = 0
            st = "closed"
        return {
            "name": self._cfg.name,
            "namespace": self._ns,
            "state": st,
            "shared_failures": failures,
            "shared": self._shared,
            "degraded": self._degraded,
            "degraded_mode": self._degraded_mode,
            "record_ops": self._record_ops,
            "minimum_number_of_calls": self._cfg.minimum_number_of_calls,
            "failure_rate_threshold": self._cfg.failure_rate_threshold,
            "wait_duration_in_open_state_s": self._cfg.wait_duration_in_open_state_s,
        }

    def _delete_all(self) -> None:
        """定点删本命名空间下全部 key（真腿清理用）。不用 KEYS/SCAN，避免 O(n) 与误删。"""
        self._client.delete(*[self._k(s) for s in _KEY_SUFFIXES])
