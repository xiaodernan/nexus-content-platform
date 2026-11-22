"""§GRAPH-3 设计补丁自检修订环的判据。

钉的是**失败路径的形状**，不是happy path：审稿坏了不能变成新的单点故障，
修订意见的顺序不能毁掉 53 万字节的前缀缓存，bool/int 不能混为一谈。
"""

from __future__ import annotations

import json

import pytest

from ai_service.design_review import (
    MAX_ISSUES,
    REVIEW_SYSTEM,
    build_review_user,
    build_revision_user,
    parse_review,
    should_revise,
)


def test_review_system_has_no_live_fields() -> None:
    """system 里出现时间/计数/项目名，前缀缓存就会每次失效——把这一点直接钉死。"""
    assert "{{" not in REVIEW_SYSTEM
    assert "{" not in REVIEW_SYSTEM.replace('{"ok"', "").replace('{"ok":', "")
    for marker in ("requestId", "timestamp", "echoes", "digest"):
        assert marker not in REVIEW_SYSTEM


def test_parse_review_accepts_clean_json() -> None:
    ok, issues = parse_review('{"ok": true, "issues": []}')
    assert ok is True and issues == []


def test_parse_review_accepts_fence() -> None:
    ok, issues = parse_review('```json\n{"ok": false, "issues": ["漏了字号"]}\n```')
    assert ok is False and issues == ["漏了字号"]


@pytest.mark.parametrize(
    "text",
    [
        "",
        "模型思考中……",
        "{\"ok\": 1, \"issues\": []}",  # bool 是 int 子类，1 不能当 true
        '{"ok": "false", "issues": []}',
        "[1,2,3]",
        '{"issues": ["漏了字号"]}',  # 缺 ok
    ],
)
def test_parse_review_rejects_bad_shapes_without_throwing(text: str) -> None:
    ok, issues = parse_review(text)
    assert ok is False and issues == [], "坏形状 = 没有可用意见，不是「审稿通过」也不是异常"


def test_parse_review_caps_and_sanitizes_issues() -> None:
    raw = {"ok": False, "issues": ["a" * 500, 42, None, "b", "c", "d", "e"]}
    ok, issues = parse_review(json.dumps(raw, ensure_ascii=False))
    assert ok is False
    assert len(issues) == MAX_ISSUES
    assert len(issues[0]) == 240
    assert all(isinstance(i, str) for i in issues)


def test_should_revise_needs_both_failure_and_actionable_issue() -> None:
    assert should_revise(ok=False, issues=["漏了字号"]) is True
    assert should_revise(ok=False, issues=[]) is False, "没有意见就无从改起，不要空转一轮"
    assert should_revise(ok=True, issues=["瞎写的意见"]) is False, "通过就是终止，别被脏 issues 带偏"


def test_review_user_does_not_carry_the_canon() -> None:
    """审稿只送诉求+补丁摘要。把 53 万字节正典再送一遍是把审稿做成烧钱机。"""
    text = build_review_user(
        prompt="把标题改成 64px",
        reply={"patches": [{"pageId": "p1", "summary": "改字号", "ops": [{"op": "set", "value": 64}]}], "explanation": "ok"},
    )
    assert len(text) < 2000
    assert "把标题改成 64px" in text
    assert '"op":"set"' in text


def test_review_user_summarizes_patch_not_full_document() -> None:
    text = build_review_user(
        prompt="x",
        reply={
            "patches": [
                {"pageId": "p", "summary": "s", "ops": [{"op": "set", "value": 1}]} for _ in range(20)
            ]
        },
    )
    assert "另有 8 组补丁未列出" in text, "超量补丁要留痕，不能静默丢掉——那是§159 的谎"
    assert text.count("页面") == 12


def test_review_user_surfaces_invalid_patch_shape() -> None:
    """形状坏的补丁不能悄悄消失，否则审稿会误报「全部落实」。"""
    text = build_review_user(prompt="x", reply={"patches": ["坏东西"]})
    assert "<形状不对，无法摘要>" in text


def test_revision_user_keeps_original_prefix_byte_for_byte() -> None:
    """原 user 必须逐字节在前——意见插到前面会让整段前缀作废。"""
    original = "诉求原文：改字号\n" * 50
    result = build_revision_user(original_user=original, issues=["漏了字号"])
    assert result.startswith(original), "前缀偏移一位就是整段 KV 缓存归零"
    assert "【审稿意见 · 必须逐条落实】" in result


def test_revision_user_caps_issues_and_rejects_empty() -> None:
    result = build_revision_user(original_user="x", issues=[f"第{i}条" for i in range(9)])
    assert "第0条" in result
    assert "第2条" in result
    assert "第3条" not in result, f"最多 {MAX_ISSUES} 条，多了既烧 token 又让模型抓不住重点"
