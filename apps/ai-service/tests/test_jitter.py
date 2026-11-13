"""**抖动（jitter）**门（v684，ADR 0117）。

v681 有界重试 / v682 进程内熔断 / v683 跨实例共享熔断三根容错柱**共同记下**的仍欠：
"无 jitter——多实例在同一拍一起重试 / 一起探测 HALF_OPEN"（thundering herd）。真网关
持续 503 时，所有副本按 `min(base·2^i, cap)` 算出**完全相同**的退避，于是同时醒来、
再次同时打挂上游；共享 breaker 转 HALF_OPEN 时所有实例也同时探测。抖动把退避时刻打散，
削平这个同步尖峰。

**零生产接线（v680/v683 / ADR 0113 纪律）**：给 v681 `_backoff` 接入 jitter 是**跨契约
语义**——选哪种策略（full/equal/decorrelated，延迟 vs 抗 herd 权衡）、decorrelated 的
有状态 prev 怎么跨 attempt 传、Retry-After 与抖动如何叠加——尚未定。按 ADR 0090/0094 X4
**语义未定就不定门、不接线、记 ADR 仍欠**。本片只做可复用组件 + 门 + 同进程 A/B 实证。

**判据单一真值（ADR 0095）**：区间计算抽成纯函数 `bounds(...)`，`jittered_backoff` 只做
最后一脚 rng 采样；门与变异臂共用 `bounds` 与 `_judge_*`，不各写一份区间逻辑。

**判据钉性质不钉字面（ADR 0090/0094 X4）**：钉有界 / 有下限 / 尊重 Retry-After / 分散度 /
统计形状 / 确定性可复现，**不钉**"恰好等 X ms"或 SPREAD 常数——改这些正当值门仍绿。

**同进程 A/B（项目最可复用方法论，ADR 0105）**：实测指标是**离散度**（M 个实例退避落点
占用多少时间桶 / 碰撞对数），不是墙钟倍数——离散度是与 JIT/GC 无关的确定性统计量，
所以不需要交替 A/B 抵消热身噪声；但仍**多轮取 p50 中位数**防单次 rng 采样波动。
**绝不**用跨进程 before/after 墙钟（本宿主曾伪造出 +695%/8×，见 ADR 0105）。

沿用 ADR 0110 三段式：真值门 + 恒跑变异臂 + 正向对照（`"none"` 正当无抖动路径仍绿）。
"""
from __future__ import annotations

import math
import statistics
from typing import Any, Callable

import pytest


# ── 判据（单一真值：真值门与变异臂共用）────────────────────────────────────

def _judge_bounded(obs: dict[str, Any]) -> None:
    """抖动输出必须落在 bounds() 声明的区间内（不越界、不为负）。"""
    lo, hi = obs["lo"], obs["hi"]
    assert all(lo - 1e-9 <= s <= hi + 1e-9 for s in obs["samples"]), (
        f"抖动越界：区间 [{lo}, {hi}]，样本 {obs['samples'][:6]}..."
    )


def _judge_has_floor(obs: dict[str, Any]) -> None:
    """equal/decorrelated 等策略的退避下限（不全压到 0，保底一段等待）。"""
    assert all(s >= obs["floor"] - 1e-9 for s in obs["samples"]), (
        f"该策略应保底 >= {obs['floor']}，实测最小 {min(obs['samples'])}"
    )


def _judge_retry_after_respected(obs: dict[str, Any]) -> None:
    """服务端 Retry-After 是硬下限：抖动不得早于它（ADR 0114 服务端指令压过本地策略）。"""
    ra = obs["retry_after"]
    assert all(s >= ra - 1e-9 for s in obs["samples"]), (
        f"抖动早于 Retry-After={ra}，实测最小 {min(obs['samples'])}"
    )


def _judge_spreads(obs: dict[str, Any]) -> None:
    """抗 herd 根本性质：同一 attempt 下多实例落点必须**分散**（不是全相等）。"""
    distinct = len(set(round(s, 6) for s in obs["samples"]))
    assert distinct > 1, (
        f"抖动没打散——{len(obs['samples'])} 个实例全落在同一个值（= 又同拍了）"
    )


def _judge_deterministic(obs: dict[str, Any]) -> None:
    """同 seed ⇒ 同序列（可复现、可 A/B；不依赖全局 random 状态）。"""
    assert obs["seq_a"] == obs["seq_b"], f"同 seed 序列不一致：{obs['seq_a'][:3]} vs {obs['seq_b'][:3]}"


def _judge_invalid_rejected(obs: dict[str, Any]) -> None:
    """显式拒绝无效策略/参数（不静默退化成"没抖动"或"无限等待"）。"""
    assert obs["raised"] is True and obs["exc"] == "ValueError", (
        f"无效配置应抛 ValueError，实测 raised={obs['raised']} {obs['exc']}"
    )


def _judge_stat_shape(obs: dict[str, Any]) -> None:
    """full jitter 统计形状：均值收敛到区间中点（容差内）、方差 > 0（确实在抖）。"""
    samples = obs["samples"]
    mid = (obs["lo"] + obs["hi"]) / 2
    mean = statistics.fmean(samples)
    var = statistics.pvariance(samples)
    tol = obs["hi"] * obs["tol_frac"]
    assert abs(mean - mid) <= tol, f"均值 {mean:.3f} 偏离区间中点 {mid:.3f} 超过容差 {tol:.3f}"
    assert var > 0, "方差为 0 = 恒等常数，没真抖动"


def _judge_herd_reduced(obs: dict[str, Any]) -> None:
    """同进程 A/B 离散度裁决：有 jitter 的时间桶占用与碰撞对数都显著优于无抖动。"""
    k = obs["buckets"]
    no = obs["no_jitter"]
    jit = obs["with_jitter"]
    assert no["unique"] <= 1, f"无抖动应全落 1 个桶（同拍），实测 {no['unique']}"
    assert jit["unique"] >= k * 0.5, (
        f"有 jitter 应散到 >= 半数桶({k} 桶的 {k*0.5})，实测 p50={jit['unique']}"
    )
    assert jit["collisions"] < no["collisions"] * 0.35, (
        f"有 jitter 碰撞对数应降到无抖动的 35% 以下，实测 {jit['collisions']} vs {no['collisions']}"
    )


# ── 测试装置（延迟 import 组件：先红阶段组件不存在，判据臂仍恒跑）─────────

def _jitter_cls():
    from ai_service.jitter import STRATEGIES, bounds, jittered_backoff
    return STRATEGIES, bounds, jittered_backoff


def _rng(seed: int) -> Callable[[float, float], float]:
    import random
    return random.Random(seed).uniform


# 基准指数退避（v681 同款）：min(base·2^i, cap)
def _exp(attempt: int, base: float, cap: float) -> float:
    return min(base * (2 ** attempt), cap)


def _samples(strategy: str, n: int, *, seed: int = 7, attempt: int = 3,
             base: float = 0.5, cap: float = 8.0, **kw: Any) -> list[float]:
    _, _, jb = _jitter_cls()
    out: list[float] = []
    for i in range(n):
        out.append(jb(attempt, base=base, cap=cap, strategy=strategy, rng=_rng(seed + i), **kw))
    return out


# ── 真值门（离线恒跑）──────────────────────────────────────────────────────

def test_full_jitter_is_bounded_and_spreads():
    """full：落在 [0, exp]，且多实例落点分散（抗 herd）。"""
    exp = _exp(3, 0.5, 8.0)
    s = _samples("full", 40)
    _judge_bounded({"samples": s, "lo": 0.0, "hi": exp})
    _judge_spreads({"samples": s})


def test_equal_jitter_has_half_floor():
    """equal：保底 >= exp/2（不全压到 0），上界 exp。"""
    exp = _exp(3, 0.5, 8.0)
    s = _samples("equal", 40)
    _judge_bounded({"samples": s, "lo": exp / 2, "hi": exp})
    _judge_has_floor({"samples": s, "floor": exp / 2})
    _judge_spreads({"samples": s})


def test_decorrelated_jitter_uses_previous_sleep():
    """decorrelated：上界随 prev_sleep 变（有状态），且首拍 prev=None 有确定初值。"""
    _, bounds, _ = _jitter_cls()
    b_first = bounds(0, base=0.5, cap=8.0, strategy="decorrelated", prev_sleep=None)
    b_small = bounds(1, base=0.5, cap=8.0, strategy="decorrelated", prev_sleep=1.0)
    b_big = bounds(1, base=0.5, cap=8.0, strategy="decorrelated", prev_sleep=4.0)
    assert b_small[1] > b_first[1], "prev 更大应抬高上界（有状态）"
    assert b_big[1] > b_small[1], "prev 越大上界越高"
    assert b_big[1] <= 8.0, "decorrelated 上界须封顶 cap"
    s = _samples("decorrelated", 40, prev_sleep=2.0)
    _judge_bounded({"samples": s, "lo": 0.5, "hi": min(8.0, 2.0 * 3)})
    _judge_has_floor({"samples": s, "floor": 0.5})
    _judge_spreads({"samples": s})


def test_retry_after_is_respected_by_all_jitter_strategies():
    """Retry-After 是硬下限：三种 jitter 采样都不得早于它。"""
    ra = 3.0
    for strategy in ("full", "equal", "decorrelated"):
        s = _samples(strategy, 40, retry_after=ra, prev_sleep=2.0)
        _judge_retry_after_respected({"samples": s, "retry_after": ra})
        _judge_spreads({"samples": s})


def test_retry_after_still_leaves_room_to_spread():
    """即便 Retry-After 主导（>= 指数退避），也要留出抗 herd 的分散宽度。"""
    _, bounds, _ = _jitter_cls()
    lo, hi = bounds(0, base=0.01, cap=8.0, strategy="full", retry_after=5.0)
    assert lo >= 5.0, "下限不得早于 Retry-After"
    assert hi > lo, "Retry-After 主导时区间也不能塌成 0 宽（否则又同拍）"


def test_none_strategy_is_exact_v681_backoff_zero_regression():
    """`none` = v681 现状 `min(base·2^i, cap)`，有 RA 取 max —— 零回归对照。"""
    exp = _exp(3, 0.5, 8.0)
    s = _samples("none", 10)
    assert all(abs(v - exp) < 1e-9 for v in s), f"none 应恒等于指数退避 {exp}"
    _, _, jb = _jitter_cls()
    # none + RA = v681 同款 max(exp, Retry-After)：钉死精确语义，不放宽成恒绿
    with_ra = jb(0, base=0.5, cap=8.0, strategy="none", rng=_rng(1), retry_after=3.0)
    assert abs(with_ra - 3.0) < 1e-9, f"none+RA 应 = max(exp, RA)=3.0，实测 {with_ra}"


def test_same_seed_reproduces_sequence():
    """可复现：同 seed 两次采样序列完全一致（不读全局 random 状态）。"""
    a = _samples("full", 20, seed=99)
    b = _samples("full", 20, seed=99)
    _judge_deterministic({"seq_a": a, "seq_b": b})


def test_full_jitter_statistical_shape():
    """统计形状：full 均值收敛到 exp/2、方差 > 0（大样本 + 宽松容差，不 flaky）。"""
    exp = _exp(2, 0.5, 8.0)
    s = _samples("full", 400, attempt=2, seed=2026)
    _judge_stat_shape({"samples": s, "lo": 0.0, "hi": exp, "tol_frac": 0.06})


@pytest.mark.parametrize("bad", [
    {"strategy": "bogus"},
    {"base": -1.0},
    {"cap": -1.0},
    {"cap_below_base": True},
    {"retry_after": -0.5},
])
def test_invalid_config_rejected(bad: dict[str, Any]):
    _, bounds, _ = _jitter_cls()
    kw: dict[str, Any] = {"base": 0.5, "cap": 8.0, "strategy": "full"}
    if bad.get("cap_below_base"):
        kw["cap"] = 0.1
    else:
        for key in ("strategy", "base", "cap", "retry_after"):
            if key in bad:
                kw[key] = bad[key]
    raised, exc = False, None
    try:
        bounds(1, **kw)
    except Exception as e:  # noqa: BLE001
        raised, exc = True, type(e).__name__
    _judge_invalid_rejected({"raised": raised, "exc": exc})


def test_bounds_is_pure_function_single_truth():
    """判据单一真值：jittered_backoff 的采样必落在 bounds 区间内（二者不各算一遍）。"""
    _, bounds, jb = _jitter_cls()
    for strategy in ("full", "equal", "decorrelated"):
        lo, hi = bounds(3, base=0.5, cap=8.0, strategy=strategy, prev_sleep=2.0)
        for i in range(12):
            s = jb(3, base=0.5, cap=8.0, strategy=strategy, prev_sleep=2.0, rng=_rng(i))
            _judge_bounded({"samples": [s], "lo": lo, "hi": hi})


# ── 同进程 A/B：离散度裁决（多轮取 p50，非墙钟）──────────────────────────

def _bucket_stats(samples: list[float], cap: float, buckets: int) -> dict[str, int]:
    """把落点分进 K 个时间桶，返回占用桶数与碰撞对数（同桶即同拍）。"""
    counts = [0] * buckets
    for s in samples:
        idx = min(buckets - 1, max(0, int(s / cap * buckets)))
        counts[idx] += 1
    unique = sum(1 for c in counts if c > 0)
    collisions = sum(c * (c - 1) // 2 for c in counts)
    return {"unique": unique, "collisions": collisions}


def test_ab_multi_instance_herd_collision_reduced():
    """A/B（9 轮、M=64 实例、K=16 桶、取 p50）：有 jitter 的离散度显著优于无抖动。"""
    m, k, rounds = 64, 16, 9
    cap = 8.0
    no_unique, no_coll = [], []
    jit_unique, jit_coll = [], []
    # 多轮、每轮换 seed；反转先后（先有 jitter 再无抖动，抵消任何采样顺序效应）
    for r in range(rounds):
        jit = _samples("full", m, seed=1000 + r, attempt=3, base=0.5, cap=cap)
        js = _bucket_stats(jit, cap, k)
        jit_unique.append(js["unique"]); jit_coll.append(js["collisions"])
        # 无抖动：全部算出同一个 exp（= 同拍）
        exp = _exp(3, 0.5, cap)
        ns = _bucket_stats([exp] * m, cap, k)
        no_unique.append(ns["unique"]); no_coll.append(ns["collisions"])
    obs = {
        "buckets": k,
        "no_jitter": {"unique": int(statistics.median(no_unique)),
                      "collisions": int(statistics.median(no_coll))},
        "with_jitter": {"unique": int(statistics.median(jit_unique)),
                        "collisions": int(statistics.median(jit_coll))},
    }
    # 正向锚：无抖动碰撞对数 > 0（否则裁决无意义——同 ADR 0112 的代理量>0）
    assert obs["no_jitter"]["collisions"] > 0, "无抖动臂必须确实产生碰撞（正向锚）"
    _judge_herd_reduced(obs)


# ── 恒跑变异臂（证明判据有牙；纯 dict，不改生产）──────────────────────────

def test_arm_no_spread_goes_red():
    with pytest.raises(AssertionError, match="又同拍"):
        _judge_spreads({"samples": [1.0] * 8})


def test_arm_out_of_bounds_goes_red():
    with pytest.raises(AssertionError, match="越界"):
        _judge_bounded({"samples": [9.0], "lo": 0.0, "hi": 8.0})


def test_arm_ignore_retry_after_goes_red():
    with pytest.raises(AssertionError, match="早于 Retry-After"):
        _judge_retry_after_respected({"samples": [2.0, 2.5], "retry_after": 3.0})


def test_arm_equal_no_floor_goes_red():
    with pytest.raises(AssertionError, match="保底"):
        _judge_has_floor({"samples": [0.1, 0.2], "floor": 4.0})


def test_arm_invalid_not_rejected_goes_red():
    with pytest.raises(AssertionError, match="ValueError"):
        _judge_invalid_rejected({"raised": False, "exc": None})


def test_arm_herd_not_reduced_goes_red():
    # 只违反"碰撞对数未降"这一条：桶占用够分散（>=k*0.5），但碰撞仍与无抖动一样多
    with pytest.raises(AssertionError, match="碰撞对数"):
        _judge_herd_reduced({
            "buckets": 16,
            "no_jitter": {"unique": 1, "collisions": 2016},
            "with_jitter": {"unique": 14, "collisions": 2016},
        })


def test_arm_stat_flat_goes_red():
    with pytest.raises(AssertionError, match="方差"):
        _judge_stat_shape({"samples": [1.0] * 100, "lo": 0.0, "hi": 2.0, "tol_frac": 0.06})


def test_arm_correct_and_none_strategy_stay_green():
    """正向对照（ADR 0094 X4）：`none` 正当无抖动不该被"分散/统计"门惩罚——
    分散门只对 jitter 策略要求；none 只需不越界、尊重 RA。门不钉该选哪个策略。"""
    _judge_bounded({"samples": [4.0, 4.0], "lo": 4.0, "hi": 4.0})
    _judge_retry_after_respected({"samples": [3.0, 3.1], "retry_after": 3.0})
    _judge_deterministic({"seq_a": [1, 2], "seq_b": [1, 2]})
    _judge_invalid_rejected({"raised": True, "exc": "ValueError"})
    _judge_herd_reduced({
        "buckets": 16,
        "no_jitter": {"unique": 1, "collisions": 2016},
        "with_jitter": {"unique": 14, "collisions": 90},
    })
