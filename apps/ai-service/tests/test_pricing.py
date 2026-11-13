"""§COST-1 单价表判据。

这一组判据守的核心只有一句：**「未计价」不等于「免费」，也绝不假设折扣存在。**

具体到代码里那是三件事：
1. 没配价目表 → `price_for()` 返回 `None`（不是返回一个 0 价）；
2. `cachedIn` 缺省 → 缓存段按 `in` 计（不因为"缓存应该便宜"就给它打折）；
3. 脏数据（`cached > tokens_in`、负价、字符串价、bool 价）→ 要么夹住、要么跳过，
   绝不算出一个看起来合理的错数。
"""

from __future__ import annotations

import json

import pytest

from ai_service.pricing import EMPTY_PRICE_TABLE, Price, PriceTable


def table(raw: str | None) -> PriceTable:
    return PriceTable.from_env_value(raw)


# ── 空 / 坏配置：一律空表，绝不退化成"免费" ──────────────────────────────


@pytest.mark.parametrize("raw", [None, "", "   ", "\n"])
def test_absent_config_yields_empty_table(raw: str | None) -> None:
    t = table(raw)
    assert not t
    assert t.price_for("gpt-6-sol") is None


def test_malformed_json_is_empty_not_crash() -> None:
    # 价格表是一块附加读数，坏了不该让整个服务起不来
    assert not table("{not json")


def test_top_level_must_be_object() -> None:
    assert not table("[1, 2, 3]")
    assert not table('"0.000003"')


def test_empty_table_never_prices_anything() -> None:
    assert EMPTY_PRICE_TABLE.price_for("anything") is None


# ── 查表：精确 / 前缀 / 最长前缀 ─────────────────────────────────────


def test_exact_model_hit() -> None:
    t = table(json.dumps({"gpt-6-sol": {"in": 0.000003, "out": 0.000012}}))
    price = t.price_for("gpt-6-sol")
    assert price is not None
    assert price.per_input == pytest.approx(0.000003)
    assert price.per_output == pytest.approx(0.000012)


def test_prefix_glob_covers_dated_variants() -> None:
    t = table(json.dumps({"gpt-4o*": {"in": 0.0000025, "out": 0.00001}}))
    assert t.price_for("gpt-4o-2024-08-06") is not None
    assert t.price_for("gpt-4o") is not None
    # 不匹配别的模型
    assert t.price_for("gpt-6-sol") is None


def test_longest_prefix_wins() -> None:
    t = table(
        json.dumps(
            {
                "gpt-*": {"in": 0.1, "out": 0.1},
                "gpt-4o*": {"in": 0.0000025, "out": 0.00001},
            }
        )
    )
    price = t.price_for("gpt-4o-mini")
    assert price is not None
    # 落在更具体的 gpt-4o* 上，而不是 gpt-*
    assert price.per_input == pytest.approx(0.0000025)


def test_exact_name_beats_equal_length_prefix() -> None:
    # `gpt-4o` 精确名与 `gpt-4o*` 前缀长度相同——精确名更具体，该赢
    t = table(
        json.dumps(
            {
                "gpt-4o": {"in": 1.0, "out": 1.0},
                "gpt-4o*": {"in": 0.0000025, "out": 0.00001},
            }
        )
    )
    price = t.price_for("gpt-4o")
    assert price is not None
    assert price.per_input == pytest.approx(1.0)


# ── 计价：缓存段怎么算 ───────────────────────────────────────────


def test_cached_defaults_to_input_rate_when_no_cached_price() -> None:
    """没给 cachedIn 就按 in 计——**不假设折扣存在**。

    这是本文件最重要的一条：如果这里悄悄打折（比如 * 0.1），
    所有未配置缓存价的部署都会**低报成本**，而且没人看得出来。
    """
    price = Price(per_input=0.000003, per_output=0.000012)
    cost = price.cost(tokens_in=1000, tokens_out=100, cached_tokens=800)
    # 1000 全部按 0.000003 计（缓存那 800 不打折）
    assert cost == pytest.approx(1000 * 0.000003 + 100 * 0.000012)


def test_cached_price_applied_only_to_cached_segment() -> None:
    price = Price(per_input=0.000003, per_output=0.000012, per_cached_input=0.0000003)
    cost = price.cost(tokens_in=1000, tokens_out=100, cached_tokens=800)
    assert cost == pytest.approx(200 * 0.000003 + 800 * 0.0000003 + 100 * 0.000012)


def test_tokens_in_includes_cached_so_cache_is_not_double_counted() -> None:
    """`tokens_in` 含 `cached_tokens`（OpenAI 的 prompt_tokens 就这么报）。

    把两段都按 in 计 = 缓存被算两遍；这里钉住"普通输入那段先减掉缓存"。
    """
    price = Price(per_input=1.0, per_output=0.0)
    assert price.cost(tokens_in=1000, tokens_out=0, cached_tokens=400) == pytest.approx(1000.0)


def test_cached_larger_than_tokens_in_is_clamped() -> None:
    """脏数据：网关抖动时见过 cached 比 prompt 还大（ADR 0262 的 L4）。

    照算会得出一个负数段的成本——比自己还便宜。夹到 tokens_in。
    """
    price = Price(per_input=0.000003, per_output=0.000012, per_cached_input=0.0000003)
    cost = price.cost(tokens_in=100, tokens_out=0, cached_tokens=999)
    assert cost == pytest.approx(100 * 0.0000003)
    assert cost >= 0


def test_negative_segments_are_clamped_to_zero() -> None:
    price = Price(per_input=0.000003, per_output=0.000012)
    assert price.cost(tokens_in=-5, tokens_out=-5, cached_tokens=-5) == 0.0


# ── 脏条目：跳过坏的，留住好的 ───────────────────────────────────


def test_string_price_is_skipped() -> None:
    """`{"in": "0.000003"}` 不认。

    字符串要贴一个"它是什么单位"的假设（每千 token？每百万？），
    猜错单位会差三个数量级——比不给价更糟。
    """
    t = table(json.dumps({"a": {"in": "0.000003", "out": "0.000012"}}))
    assert not t
    assert t.price_for("a") is None


def test_negative_price_is_skipped() -> None:
    assert not table(json.dumps({"a": {"in": -1, "out": 0.1}}))


def test_bool_price_is_skipped() -> None:
    """`bool` 是 `int` 的子类：不挡住的话 `{"in": true}` 会变成 1 USD/token。"""
    assert not table(json.dumps({"a": {"in": True, "out": 0.1}}))


def test_bad_entry_does_not_poison_good_entries() -> None:
    t = table(
        json.dumps(
            {
                "good": {"in": 0.000003, "out": 0.000012},
                "bad": {"in": "nope", "out": 0.1},
            }
        )
    )
    assert t.price_for("good") is not None
    assert t.price_for("bad") is None


def test_bad_cached_price_falls_back_to_input_rate() -> None:
    """缓存价坏了不该让整条价目作废——退回"按输入价计"，不比缺省更差。"""
    t = table(json.dumps({"a": {"in": 0.000003, "out": 0.000012, "cachedIn": "cheap"}}))
    price = t.price_for("a")
    assert price is not None
    assert price.per_cached_input is None
    cost = price.cost(tokens_in=1000, tokens_out=0, cached_tokens=500)
    assert cost == pytest.approx(1000 * 0.000003)


def test_empty_prefix_key_is_dropped() -> None:
    """`{"*": ...}` 的前缀是空串——空串能匹配一切，但它不是"最具体"，
    留着会让任何模型的查找都命中它，掩盖掉真正的漏配。"""
    t = table(json.dumps({"*": {"in": 1, "out": 1}, "gpt-6-sol": {"in": 0.000003, "out": 0.000012}}))
    price = t.price_for("unknown-model")
    assert price is None
    assert t.price_for("gpt-6-sol") is not None
