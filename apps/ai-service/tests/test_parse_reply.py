from __future__ import annotations

from ai_service.design_prompt import parse_reply

import pytest


def test_parse_reply_clean_json_single_object() -> None:
    assert parse_reply('{"patches":[],"explanation":"e","labels":[]}')["patches"] == []


def test_parse_reply_provider_wraps_in_code_fence_then_prose() -> None:
    text = "```json\n{\"patches\":[{\"pageId\":\"p\",\"summary\":\"s\",\"ops\":[]}],\"explanation\":\"e\",\"labels\":[]}\n```\ndone."
    out = parse_reply(text)
    assert out["explanation"] == "e"


def test_parse_reply_takes_first_balanced_object_when_prose_contains_braces() -> None:
    text = '{"patches":[{"pageId":"p","summary":"s","ops":[]}],"explanation":"working","labels":[]} trailing prose with } braces {noise: true}'
    out = parse_reply(text)
    assert out["explanation"] == "working"
    assert out["patches"][0]["pageId"] == "p"


def test_parse_reply_json_with_braces_inside_strings_is_parsed() -> None:
    text = '{"patches":[],"explanation":"text with {braces} and \\"quotes\\" inside","labels":[]}'
    out = parse_reply(text)
    assert out["explanation"].startswith("text with {braces}")


def test_parse_reply_garbage_raises_value_error_not_noise() -> None:
    with pytest.raises(ValueError):
        parse_reply("absolutely not json")


def test_parse_reply_extra_junk_after_balanced_block_is_dropped() -> None:
    text = '{"patches":[],"explanation":"ok","labels":["A-label"]} trailing garbage here }'
    assert parse_reply(text)["labels"] == ["A-label"]
