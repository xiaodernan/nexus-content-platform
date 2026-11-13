"""**退避抖动（jitter）**（v684，ADR 0117）。

v681 有界重试 / v682 进程内熔断 / v683 跨实例共享熔断三根柱共同的仍欠：多实例在同一拍
一起重试、一起探测 HALF_OPEN（thundering herd）。`min(base·2^i, cap)` 是**确定性**的：
所有副本算出完全相同的值，于是同时醒来、再次同时打挂上游。抖动把退避时刻打散，削平同步尖峰。

三种 AWS Builders' Library 经典策略 + 一个 `none` 零回归对照：

| strategy | bounds（无 Retry-After） | 语义 |
|---|---|---|
| `full` | `[0, exp]` | 完全打散，抗 herd 最强；首拍可接近 0 |
| `equal` | `[exp/2, exp]` | 保底一半退避，抗 herd 同时留等待 |
| `decorrelated` | `[base, min(cap, prev·3)]` | 有状态（依赖上次 sleep），波动更自然；首拍 `prev=None` 取 base |
| `none` | `[exp, exp]` | 不抖动 = v681 现状，零回归对照 |

`exp = min(base·2^attempt, cap)`（v681 同款指数退避）。

**Retry-After 统一后处理**（服务端指令压过本地策略，ADR 0114）：
jitter 策略把区间抬到 `[max(lo, ra), max(hi, ra·(1+_SPREAD))]`——既保证不早于服务端硬下限
（>= ra），又留出抗 herd 的分散宽度（即便 ra 主导、区间也不塌成 0 宽）。`none` **不加**
spread，有 RA 时精确返回 `max(exp, ra)`，与 v681 `_backoff` 字节级一致。

**判据单一真值（ADR 0095）**：区间计算全在纯函数 `bounds()`，`jittered_backoff()` 只做
最后一脚 `rng(lo, hi)` 采样；门与变异臂共用 `bounds`，不各写一份区间逻辑。

**零生产接线（ADR 0113）**：给 v681 `_backoff` 接 jitter 是跨契约语义（选哪个策略 /
decorrelated 的 prev 怎么跨 attempt 传 / 是否引入全局随机源），尚未定——本片只做可复用
组件 + 门 + 同进程 A/B 实证，接线清单写 ADR 0117 仍欠。

**确定性可复现**：`rng` 注入（签名 `(low, high) -> float`），生产传 `random.uniform`，
门传 `random.Random(seed).uniform`——不读全局随机状态、同 seed 同序列、可 A/B。
"""
from __future__ import annotations

import random
from typing import Callable

STRATEGIES = ("full", "equal", "decorrelated", "none")

# Retry-After 主导时的抗 herd 分散系数。判据**不钉这个字面**（ADR 0094 X4）：
# 改它（如 0.25→0.5）只要仍 >0、区间仍不塌、仍尊重 RA，门就仍绿。
_SPREAD = 0.25

Rng = Callable[[float, float], float]


def _validate(base: float, cap: float, strategy: str, retry_after: float | None) -> None:
    if strategy not in STRATEGIES:
        raise ValueError(f"未知 jitter 策略 {strategy!r}，须是 {STRATEGIES} 之一")
    if base < 0:
        raise ValueError("base 必须 >= 0")
    if cap < 0:
        raise ValueError("cap 必须 >= 0")
    if cap < base:
        raise ValueError("cap 不能小于 base（否则连首拍都放不下）")
    if retry_after is not None and retry_after < 0:
        raise ValueError("retry_after 必须 >= 0")


def bounds(
    attempt: int,
    *,
    base: float,
    cap: float,
    strategy: str,
    prev_sleep: float | None = None,
    retry_after: float | None = None,
) -> tuple[float, float]:
    """退避采样**区间**（纯函数，单一真值）。`jittered_backoff` 与门共用。

    返回 `(lo, hi)`；调用方用 `rng(lo, hi)` 取一个值。`none` 策略返回零宽区间
    `[exp, exp]`（有 RA 则 `[max(exp,ra), max(exp,ra)]`）= 确定性退避。
    """
    _validate(base, cap, strategy, retry_after)
    if attempt < 0:
        raise ValueError("attempt 必须 >= 0")
    exp = min(base * (2 ** attempt), cap)

    if strategy == "none":
        point = max(exp, retry_after or 0.0)  # v681：max(指数, Retry-After)
        return point, point

    if strategy == "full":
        lo, hi = 0.0, exp
    elif strategy == "equal":
        lo, hi = exp / 2, exp
    else:  # decorrelated
        prev = base if prev_sleep is None else prev_sleep
        lo, hi = base, min(cap, prev * 3)
        if hi < lo:  # prev 极小（< base/3）时兜底，保证区间非空
            hi = lo

    # Retry-After 统一后处理：服务端硬下限 + 抗 herd 分散宽度
    if retry_after is not None:
        lo = max(lo, retry_after)
        hi = max(hi, retry_after * (1 + _SPREAD))

    return lo, hi


def jittered_backoff(
    attempt: int,
    *,
    base: float,
    cap: float,
    strategy: str = "full",
    rng: Rng | None = None,
    prev_sleep: float | None = None,
    retry_after: float | None = None,
) -> float:
    """一次退避等待秒数：先由 `bounds` 算区间，再取一脚随机采样。

    `rng=None` 用 `random.uniform`（生产）；注入 `(low,high)->float` 可确定性验证与 A/B。
    """
    lo, hi = bounds(
        attempt, base=base, cap=cap, strategy=strategy,
        prev_sleep=prev_sleep, retry_after=retry_after,
    )
    if lo == hi:
        return lo  # none 策略 / 零宽区间：确定性，连 rng 都不必调
    sample = (rng or random.uniform)(lo, hi)
    # 浮点防御：采样极端落在区间外时夹紧（真 random.uniform 不会，注入的假 rng 可能）
    return min(max(sample, lo), hi)
