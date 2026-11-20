"""§GRAPH-3 自检修订环接进设计管线后的端到端判据。

钉的是**整条链的账**和**失败不阻塞**：审稿多打的那几次 token 必须进 usage，
审稿自己坏了却不能把一次本来成功的设计请求变成 502。
"""

from __future__ import annotations

import json
from functools import partial
from typing import Any

import anyio

from ai_service.config import Settings
from ai_service.execution import execute_ai_request
from ai_service.providers.base import Completion
from ai_service.providers.registry import Registry
from conftest import ai_request

DRAFT_OK = json.dumps(
    {
        "patches": [{"pageId": "pg_1", "summary": "把字号设为 56", "ops": [{"op": "set", "nodeId": "n_headline", "path": "typography.fontSize", "value": 56}]}],
        "explanation": "第一稿",
        "labels": [],
    },
    ensure_ascii=False,
)
DRAFT_REVISED = DRAFT_OK.replace("56", "72").replace("第一稿", "按审稿意见重做")
REVIEW_PASS = json.dumps({"ok": True, "issues": []}, ensure_ascii=False)
REVIEW_FAIL = json.dumps({"ok": False, "issues": ["诉求要求 72px，补丁仍是 56px"]}, ensure_ascii=False)


class ScriptedLLM:
    """按序吐出预设文本；记录每次调用的 system/user，便于核对前缀与顺序。"""

    kind = "llm"
    name = "scripted"

    def __init__(self, replies: list[str], *, fail_on: int | None = None) -> None:
        self.replies = list(replies)
        self.fail_on = fail_on
        self.calls: list[dict[str, Any]] = []

    def models(self) -> list[str]:
        return ["m"]

    def model_for(self, model_class: str) -> str:
        return "m"

    def complete(self, *, model: str, system: str, user: str, json_mode: bool | None = None) -> Completion:
        index = len(self.calls)
        self.calls.append({"model": model, "system": system, "user": user})
        if index == self.fail_on:
            from ai_service.providers.base import ProviderFailed

            raise ProviderFailed("审稿网关抖动")
        return Completion(
            text=self.replies[index],
            provider=self.name,
            model=model,
            tokens_in=100 + index,
            tokens_out=10 + index,
            latency_ms=5.0,
            cache_reported=True,
            cached_tokens=50 + index,
        )


def run(payload: dict[str, Any], llm: ScriptedLLM, *, review: bool) -> tuple[int, dict[str, Any]]:
    settings = Settings(llm_design_review=review)
    registry = Registry(settings, llm=llm)
    return anyio.run(partial(execute_ai_request, payload, registry=registry))


def test_review_disabled_is_byte_identical_to_legacy_path() -> None:
    """默认关闭：一次调用、账不变、没有 review 活动。零回归不是口号。"""
    llm = ScriptedLLM([DRAFT_OK])
    status, body = run(ai_request(), llm, review=False)
    assert status == 200
    assert len(llm.calls) == 1
    assert body["usage"]["toolCalls"] == 1
    assert body["usage"]["tokensIn"] == 100
    assert all(a["stage"] != "review" for a in body["activities"])


def test_review_pass_adds_second_call_and_accounts_it() -> None:
    """审稿通过也要如实多记一次 token——不记账的增强等于偷偷降价。"""
    llm = ScriptedLLM([DRAFT_OK, REVIEW_PASS])
    status, body = run(ai_request(), llm, review=True)
    assert status == 200
    assert len(llm.calls) == 2
    assert body["usage"]["toolCalls"] == 2
    assert body["usage"]["tokensIn"] == 201, "100 + 101，不是只报第一稿"
    assert body["usage"]["tokensOut"] == 21
    assert body["usage"]["cachedTokens"] == 101
    assert body["usage"]["latencyMs"] == 10.0
    assert body["activities"][-1]["stage"] == "review"
    assert "审稿通过" in body["activities"][-1]["summary"]
    # 原稿仍然是交付稿
    assert body["patches"][0]["ops"][0]["value"] == 56


def test_review_fail_triggers_revision_with_original_prefix() -> None:
    """修订轮 system 必须是原 system（正典前缀），user 必须以原 user 逐字节开头。"""
    llm = ScriptedLLM([DRAFT_OK, REVIEW_FAIL, DRAFT_REVISED, REVIEW_PASS])
    status, body = run(ai_request(), llm, review=True)
    assert status == 200
    assert len(llm.calls) == 4, "草稿 + 审稿 + 修订 + 终审"
    assert body["usage"]["toolCalls"] == 4
    assert body["usage"]["tokensIn"] == 406
    assert body["patches"][0]["ops"][0]["value"] == 72, "修订稿才是交付稿"
    assert llm.calls[2]["system"] == llm.calls[0]["system"], "换 system = 53 万字节前缀白买一遍"
    assert llm.calls[2]["user"].startswith(llm.calls[0]["user"]), "意见必须排在原文之后"
    assert "72px" in llm.calls[2]["user"]
    stages = [a["stage"] for a in body["activities"]]
    assert stages == ["provider", "review", "revise", "review"]


def test_review_short_system_does_not_carry_canon() -> None:
    llm = ScriptedLLM([DRAFT_OK, REVIEW_PASS])
    run(ai_request(), llm, review=True)
    assert len(llm.calls[1]["system"]) < 4000, "审稿 system 不能复制正典——那是对 token 的浪费"
    assert len(llm.calls[0]["system"]) > 100_000, "生成 system 确实带着正典（对照物）"


def test_review_failure_does_not_block_success() -> None:
    """审稿调用炸了：原稿照常交付，失败如实记在 activities 里。"""
    llm = ScriptedLLM([DRAFT_OK], fail_on=1)
    status, body = run(ai_request(), llm, review=True)
    assert status == 200
    assert body["patches"][0]["ops"][0]["value"] == 56
    assert body["usage"]["toolCalls"] == 1
    assert body["activities"][-1]["status"] == "failed"


def test_review_limit_is_bounded() -> None:
    """审稿一直不满意也只修订配置的上限次——不能是无限循环。"""
    llm = ScriptedLLM([DRAFT_OK, REVIEW_FAIL, DRAFT_REVISED, REVIEW_FAIL, DRAFT_REVISED])
    settings = Settings(llm_design_review=True, llm_design_review_max_revisions=1)
    registry = Registry(settings, llm=llm)
    status, body = anyio.run(partial(execute_ai_request, ai_request(), registry=registry))
    assert status == 200
    # 一稿 + 一审 + 一修 + 对修订稿的终审；终审是验证不是第二次修订
    assert len(llm.calls) == 4
    assert [a["stage"] for a in body["activities"]].count("revise") == 1


def test_partial_reporting_is_not_marked_as_fully_reported() -> None:
    """有一轮没报 cached 就不能说整条链都报了——把缺席写成 0 是同一条老谎。"""
    llm = ScriptedLLM([DRAFT_OK, REVIEW_PASS])
    status, body = run(ai_request(), llm, review=True)
    assert status == 200
    assert body["usage"]["cacheReported"] is True  # 夹具全报；下一例改一个
    # 单独构造：第二通不报
    llm2 = ScriptedLLM([DRAFT_OK, REVIEW_PASS])
    original = llm2.complete

    def flaky(**kwargs: Any) -> Completion:
        result = original(**kwargs)
        if len(llm2.calls) == 2:
            return Completion(
                text=result.text,
                provider=result.provider,
                model=result.model,
                tokens_in=result.tokens_in,
                tokens_out=result.tokens_out,
                latency_ms=result.latency_ms,
                cache_reported=False,
            )
        return result

    llm2.complete = flaky  # type: ignore[method-assign]
    status, body = run(ai_request(), llm2, review=True)
    assert status == 200
    assert body["usage"]["cacheReported"] is False
