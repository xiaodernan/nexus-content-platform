"""有界死信（v688；ADR 0121）。

ADR 0120 落下了"毒消息到死信查得见"，但留下一格：`dead_letters()` 的列表只随 TTL 失效、
**没有容量上限**——一个长期失败的上游会把 dead 列表撑成第二存储，运维导出/巡检都要多看
一遍历史。本片把"死信有界"做成可复用能力并直接接到两个后端：

- **Redis 后端**：`route_to_dead_letter` 的 LPUSH 之后 `LTRIM <dead> 0 N-1`（保留最新的 N 条）
  —— LPUSH 往头部放，LTRIM 0..N-1 恰好留最新 N 条，**最老的从尾巴掉出去**。
- **内存后端**：append 后裁掉左侧最老的，同 N 纪律。
- **`max_dead_letters = 0` 表示不限**（回到 ADR 0120 的旧行为，strictly opt-out，零回退）。
- 默认 **500**（`AI_SERVICE_DEAD_LETTER_MAX` 从 env 解析；非数字 / 负数 → 默认 500；
  显式 `0` → 不限；"never shrink below zero"）。
- **不改判定路径**：只在归档后裁一刀，不改 attempts 计数、不改 4xx/5xx 分支、
  不改 4xx-is-failure 语义；正确性（可见性）不因容量裁剪而变差（容量是 guardrail 不是门）。
- **竞态诚实**：并发 LPUSH + LTRIM 之间存在窗口，两条同时越界只可能让一条本该在的条目
  被多裁 1 条——容量纪律误差，不是正确性边界（与 v683/v686 同款竞态纪律）。
"""
from __future__ import annotations

import inspect
import os
from typing import Mapping

DEFAULT_MAX_DEAD_LETTERS = 500


def parse_max_dead_letters(env: Mapping[str, str] | None = None) -> int:
    """`AI_SERVICE_DEAD_LETTER_MAX`：非数字/负数 → 默认 500；0 → 不限；正数原样采纳。"""
    source = env if env is not None else os.environ
    raw = source.get("AI_SERVICE_DEAD_LETTER_MAX", str(DEFAULT_MAX_DEAD_LETTERS))
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_MAX_DEAD_LETTERS
    return max(0, n)


def trim_list(items: list, max_len: int) -> int:
    """原地把列表左侧最老的裁到 max_len。返回裁掉的条数（≥0）。

    纯函数（除原地改动 items）——内存后端与门/arm 共用这一真值，避免双漂移。
    max_len<=0 表示不限，返回 0。
    """
    if max_len <= 0 or len(items) <= max_len:
        return 0
    dropped = len(items) - max_len
    del items[:dropped]
    return dropped


async def trim_command(client, key: str, max_len: int) -> bool:
    """Redis LTRIM 的薄封装（**async**：对 sync/fake client 与 async redis-py 都正确）。

    max_len<=0 → 不限、不调用；没有 ltrim 能力的 client 静默 False。
    调用方决定异常（本组件不吞：调用方按 dead-letter 旁路纪律 best-effort）。"""
    if max_len <= 0:
        return False
    ltrim = getattr(client, "ltrim", None)
    if ltrim is None:
        return False
    result = ltrim(key, 0, max_len - 1)
    if inspect.isawaitable(result):
        result = await result
    return bool(result)
