"""§COST-1 单价表：把 token 折算成钱。

## 为什么不内置任何默认价格

单价随模型、供应商、折扣、账期变化。内置一个数就等于**对外承诺一个可能过期的金额**——
用户看到 "$0.0021" 会当真，而那个数可能早就不成立了。

没配置时：`costUsd = 0` 且 `costBasis = "unknown"`，界面说「未计价」。
**「未计价」是「不知道」，不是「免费」。** 这两件事在界面上必须是两种东西
（与 ADR 0262 那条「没报 ≠ 报了 0」同一条纪律，只是换了个字段）。

## 配置格式

`NEXUS_LLM_PRICES` 是一个 JSON 对象，单位 **USD / token**：

    {"gpt-6-sol": {"in": 0.000003, "out": 0.000012, "cachedIn": 0.0000003}}

- `in`：普通输入 token 单价
- `out`：输出 token 单价
- `cachedIn`：**命中前缀缓存**的输入单价。缺省时按 `in` 计——
  **不假设折扣存在**。\"缓存便宜一个数量级\" 是某些供应商的促销，不是普遍事实；
  按 `in` 计至少不会低报成本。
- 键支持两种形态：精确模型名；以及 `*` 结尾的前缀（如 `"gpt-4o*"`），
  用来兜住带日期后缀的模型名（`gpt-4o-2024-08-06`）。**最长前缀优先**，无前缀长度并列时才看精确名。

## 容错

JSON 坏了、某条价目形状不对、数值是负数——一律**跳过那一条**并留一条 warning，
其余照常生效。价格表坏了不该让整个服务起不来：它只是一块附加读数，不是主链路。
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Mapping

_log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Price:
    """一条价目。单位 USD / token。"""

    per_input: float
    per_output: float
    # None = 没有单独的缓存价，按 per_input 计（不假设折扣）
    per_cached_input: float | None = None

    def cost(self, *, tokens_in: int, tokens_out: int, cached_tokens: int) -> float:
        """
        一次调用的成本。

        `tokens_in` **含** `cached_tokens`（OpenAI 的 prompt_tokens 就是这么报的），
        所以普通输入那一段要先减掉缓存那一段，否则缓存会被算两遍。

        `cached_tokens > tokens_in` 是脏数据（网关抖动时会给出比 prompt 还大的 cached，
        ADR 0262 的 L4 实验见过类似形状）。这里**夹到 tokens_in**而不是照算：
        照算会得出一个比自己还贵的负数段。
        """
        cached = max(0, min(int(cached_tokens), int(tokens_in)))
        normal_in = max(0, int(tokens_in) - cached)
        cached_rate = self.per_cached_input if self.per_cached_input is not None else self.per_input
        return (
            normal_in * self.per_input
            + cached * cached_rate
            + max(0, int(tokens_out)) * self.per_output
        )


class PriceTable:
    """
    只读价目表。`from_env_value()` 是唯一入口——刻意不提供"默认表"构造器，
    因为一个不来自配置的价目表就是编的。
    """

    __slots__ = ("_exact", "_prefix")

    def __init__(self, exact: Mapping[str, Price], prefix: Mapping[str, Price]) -> None:
        self._exact = dict(exact)
        # 前缀键去掉结尾的 `*`，查表时按长度倒序试
        self._prefix = dict(prefix)

    def __bool__(self) -> bool:
        return bool(self._exact or self._prefix)

    def price_for(self, model: str) -> Price | None:
        """
        最长前缀优先，其次精确名。

        为什么前缀优先：`gpt-4o*` 与 `gpt-4o` 同时存在时，用户写 `gpt-4o*`
        通常是想兜住所有变体；但若模型名恰好等于 `gpt-4o`，精确名更具体。
        两者长度相同时精确名赢（见最后的 fallback），长度不同时长者更具体。
        """
        best_key = ""
        best: Price | None = None
        for key, price in self._prefix.items():
            if model.startswith(key) and len(key) > len(best_key):
                best_key = key
                best = price
        exact = self._exact.get(model)
        # 精确名与最长前缀长度相等时精确名胜出；否则前缀更长说明它更具体
        if exact is not None and len(model) >= len(best_key):
            return exact
        return best

    @classmethod
    def from_env_value(cls, raw: str | None) -> "PriceTable":
        """从 `NEXUS_LLM_PRICES` 的值构造。空/缺省 → 空表（不是"免费"）。"""
        text = (raw or "").strip()
        if not text:
            return cls({}, {})
        try:
            parsed: Any = json.loads(text)
        except json.JSONDecodeError as exc:
            _log.warning("NEXUS_LLM_PRICES 不是合法 JSON（%s），按未配置处理", exc)
            return cls({}, {})
        if not isinstance(parsed, Mapping):
            _log.warning("NEXUS_LLM_PRICES 顶层必须是对象，实际是 %s", type(parsed).__name__)
            return cls({}, {})

        exact: dict[str, Price] = {}
        prefix: dict[str, Price] = {}
        for raw_key, raw_price in parsed.items():
            if not isinstance(raw_key, str) or not isinstance(raw_price, Mapping):
                continue
            price = _parse_price(raw_price)
            if price is None:
                _log.warning("NEXUS_LLM_PRICES[%r] 形状不对，已跳过", raw_key)
                continue
            key = raw_key.strip()
            if not key:
                continue
            if key.endswith("*"):
                stem = key[:-1]
                if stem:
                    prefix[stem] = price
            else:
                exact[key] = price
        return cls(exact, prefix)


def _parse_price(raw: Mapping[str, Any]) -> Price | None:
    """
    单条价目。**只认数字，不认字符串**：`{"in": "0.000003"}` 会被跳过。

    为什么这么严：字符串要贴一个"它是什么单位"的假设（每千 token？每百万？），
    而猜错单位会差三个数量级——比不给价更糟。
    """
    per_input = raw.get("in")
    per_output = raw.get("out")
    if not isinstance(per_input, (int, float)) or not isinstance(per_output, (int, float)):
        return None
    if isinstance(per_input, bool) or isinstance(per_output, bool):
        # bool 是 int 的子类，不挡住的话 {"in": true} 会变成 1 USD/token
        return None
    if per_input < 0 or per_output < 0:
        return None
    cached = raw.get("cachedIn")
    if cached is not None:
        if not isinstance(cached, (int, float)) or isinstance(cached, bool) or cached < 0:
            # 缓存价坏了不影响主价：退回"按输入价计"，不比缺省更差
            cached = None
    return Price(
        per_input=float(per_input),
        per_output=float(per_output),
        per_cached_input=None if cached is None else float(cached),
    )


EMPTY_PRICE_TABLE = PriceTable({}, {})
