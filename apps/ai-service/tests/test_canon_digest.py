"""canon_digest：设计编排路径的字节级系统前缀契约。

为什么这份测试存在（§CACHE-4 / ADR-0126 / v694）：
  provider 的前缀 KV 缓存按**字节前缀**命中。`design_prompt.SYSTEM_PROMPT` 是整条前缀的
  第一段，必须逐字节不变；一旦有人动了 canon_digest.txt 却没重新生成（或手改），
  四万多 token 的摊销就会悄悄归零 —— 缓存读数会从 ~100% 掉到 ~0，而没人看见（§159）。

纪律：canon_digest.txt 与 canon_digest.sha256 都由 `npm run gen:canon-digest` 生成并入库；
      两边漂移 → 本测试红。
"""
from __future__ import annotations

import hashlib
import os

import pytest

from ai_service import design_prompt

_DIR = os.path.dirname(design_prompt.__file__)
TXT = os.path.join(_DIR, "canon_digest.txt")
SHA = os.path.join(_DIR, "canon_digest.sha256")

# 低语诸王 · 世界大典 digest 的体量下限：护栏 = "不可能是空 digest 也能过"。
# 当前实测 ≈ 61,179 字符（4.3 万 tokens，与 /api/bible/q 同一套 SYSTEM_PROMPT 字节）。
MIN_CANON_CHARS = 40_000


def test_canon_digest_txt_and_sha_exist_and_match():
    with open(TXT, "rb") as fh:
        raw = fh.read()
    with open(SHA, "r", encoding="utf-8") as fh:
        recorded = fh.read().strip()
    assert len(raw.decode("utf-8")) >= MIN_CANON_CHARS, (
        f"canon_digest.txt 只有 {len(raw)} 字节，低于护栏 {MIN_CANON_CHARS}——"
        "重新运行 `npm run gen:canon-digest`。"
    )
    actual = hashlib.sha256(raw).hexdigest()
    assert actual == recorded, "canon_digest.txt 与 canon_digest.sha256 漂移了——两者必须同时由生成脚本产出。"


def test_system_prompt_starts_with_canon_prefix():
    with open(TXT, "r", encoding="utf-8", newline="") as fh:
        digest = fh.read()
    assert design_prompt.CANON_PREFIX == digest
    assert design_prompt.SYSTEM_PROMPT.startswith(digest), (
        "SYSTEM_PROMPT 必须以 canon_digest.txt 为前缀；任何在前面插入内容的改动都会摧毁字节前缀缓存。"
    )


def test_system_prompt_is_byte_constant_across_requests():
    """不同轮次、不同 Agent、不同诉求 —— system 一律逐字节相同。"""
    req_plain = {"prompt": "把按钮放大一点", "context": {}, "intent": "", "modelClass": "fast"}
    req_named_agent = {
        "prompt": "叙述语气更史诗",
        "context": {"pageId": "page-1", "selection": ["n1"]},
        "intent": "edit",
        "modelClass": "balanced",
        "agent": {
            "name": "执笔者",
            "responsibilities": ["写叙事段落"],
            "capabilities": ["design.patch"],
        },
    }
    req_no_catalog = {
        "prompt": "什么都不带",
        "context": {"designIndex": {"pages": []}},
        "intent": "inspect",
        "modelClass": "reasoning",
    }
    systems = {
        design_prompt.build_prompt(req_plain)[0],
        design_prompt.build_prompt(req_named_agent)[0],
        design_prompt.build_prompt(req_no_catalog)[0],
    }
    assert len(systems) == 1, "三轮 build_prompt 的 system 不一致——系统前缀不可能随请求波动（§CACHE-2）。"
    assert systems.pop() == design_prompt.SYSTEM_PROMPT


def test_canon_prefix_contains_world_anchors():
    """前缀里必须是真正的世界大典锚点，不是空壳文本。"""
    digest = design_prompt.CANON_PREFIX
    for anchor in ("THE WORLD BIBLE", "END OF DIGEST", "Chapter 001"):
        assert anchor in digest, f"canon digest 里找不到锚点 {anchor!r}——内容不对，不是体量问题。"


if __name__ == "__main__":  # pragma: no cover
    import sys

    sys.exit(pytest.main([__file__, "-v"]))
