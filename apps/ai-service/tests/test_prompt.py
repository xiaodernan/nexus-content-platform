"""§68 的最后一公里：发给模型的提示吃的是**服务端装配的目录**，不是整份文档。

夹具来自 `npm run contract:export` 导出的 `contracts/fixtures/ai-request-with-index.json`——
那一份是 web 侧真的用 `buildDesignIndex` + `buildCodeIndex` 装配出来的请求。
不在这里手抄一份目录的形状：手抄的夹具会和 TS 侧漂移，
漂移的结果是"Python 测试全绿而真实请求读不到东西"，正是这一片曾经的实际状态。
"""

from __future__ import annotations

import json

from conftest import CONTRACTS, FakeProvider, ai_request
from ai_service.design_prompt import MAX_TOKENS_IN_PROMPT, build_prompt

FIXTURE = CONTRACTS / "fixtures" / "ai-request-with-index.json"


def _fixture_request() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def _user_payload(request: dict) -> dict:
    _, user = build_prompt(request)
    return json.loads(user)


def test_fixture_itself_carries_no_document() -> None:
    """§68：线上不该再有整份文档。夹具里如果混进 document，这一片测试的前提就没了。"""
    assert "document" not in _fixture_request()["context"]


def test_catalog_reaches_the_model() -> None:
    request = _fixture_request()
    payload = _user_payload(request)
    index = request["context"]["designIndex"]

    assert payload["contextSource"] == "designIndex"
    # 目录里的框与段必须逐个进提示：模型只能引用它看得见的 id
    frame_ids = {frame["id"] for frame in index["frames"]}
    assert frame_ids and frame_ids <= {frame["id"] for frame in payload["frames"]}
    assert payload["pages"], "页面摘要没进提示"
    assert any(token["key"] == "color.primary" for token in payload["tokens"])
    # 目录没带什么也要一起发出去，否则模型会把"没列出来"当成"项目里没有"
    assert payload["omissions"] == index["omissions"]
    assert payload["totals"] == index["totals"]
    # §69 的代码摘要并列发出，正文一个字符都不在
    assert payload["code"]["files"][0]["path"] == "components/nexus/Home.tsx"
    assert "tree" not in payload, "有目录时不该再走整份文档的节点表"


def test_selection_ids_survive_into_the_prompt() -> None:
    request = _fixture_request()
    payload = _user_payload(request)
    assert payload["selection"] == request["context"]["selection"]
    assert payload["selectionDigest"] == request["context"]["selectionDigest"]


def test_missing_catalog_falls_back_to_document_and_says_so() -> None:
    """旧客户端仍可能发 document。能读，但要把降级写在脸上，不能静默。"""
    request = ai_request()
    payload = _user_payload(request)
    assert payload["contextSource"] == "document-fallback"
    assert "n_headline" in {node["nodeId"] for node in payload["tree"]}
    assert "不该出现在正常请求里" in payload["note"]


def test_nothing_at_all_is_reported_as_nothing() -> None:
    """既没目录也没文档：提示里要明说这一轮看不到项目内容，而不是给一个空表假装看到了。"""
    request = ai_request()
    del request["context"]["document"]
    request["context"]["selectionDigest"] = []
    payload = _user_payload(request)
    assert payload["contextSource"] == "none"
    assert "看不到项目内容" in payload["note"]
    assert "tree" not in payload and "frames" not in payload


def test_this_process_adds_no_cut_to_a_normal_request() -> None:
    """服务端按预算裁过之后，这一层不该再动一份正常目录。动了就要说，不许静默变短。"""
    payload = _user_payload(_fixture_request())
    assert "promptTruncated" not in payload


def test_token_cap_is_reported_not_silent() -> None:
    request = _fixture_request()
    tokens = request["context"]["designIndex"]["tokens"]
    padded = tokens + [
        {"key": f"color.extra{i}", "type": "color", "value": "#000000"} for i in range(MAX_TOKENS_IN_PROMPT)
    ]
    request["context"]["designIndex"]["tokens"] = padded
    payload = _user_payload(request)
    assert len(payload["tokens"]) == MAX_TOKENS_IN_PROMPT
    assert f"token 表从 {len(padded)} 条裁到 {MAX_TOKENS_IN_PROMPT} 条" in payload["promptTruncated"]


def test_char_budget_cut_is_reported() -> None:
    request = _fixture_request()
    frames = request["context"]["designIndex"]["frames"]
    request["context"]["designIndex"]["frames"] = frames + [
        {"id": f"fx_pad{i}", "type": "frame", "name": "垫" * 40, "pageId": "fx001", "width": 100, "height": 100}
        for i in range(3000)
    ]
    payload = _user_payload(request)
    assert len(payload["frames"]) < 3000 + len(frames)
    assert "提示超过" in payload["promptTruncated"] and "frames" in payload["promptTruncated"]
    # 裁的是列表条目，totals 仍然说真话（少给条目不少报数）
    assert payload["totals"] == request["context"]["designIndex"]["totals"]


def test_run_endpoint_accepts_a_real_assembled_request() -> None:
    """整条路走一遍：契约校验收下真装配 → 模型真的收到目录内容。

    这一条才是防漂移的关键：前面几条直接调 build_prompt，绕过了 HTTP 与 `contract_issues`。
    """
    from fastapi.testclient import TestClient

    from ai_service.app import create_app
    from ai_service.config import Settings
    from ai_service.providers.registry import Registry

    provider = FakeProvider(json.dumps({"patches": [], "explanation": "看到了", "labels": []}, ensure_ascii=False))
    client = TestClient(create_app(Settings(), registry=Registry(Settings(), llm=provider)))
    request = _fixture_request()
    response = client.post("/v1/ai/run", json=request)
    assert response.status_code == 200, response.text

    user = provider.calls[0]["user"]
    assert '"contextSource":"designIndex"' in user
    for frame in request["context"]["designIndex"]["frames"]:
        assert frame["id"] in user
    assert "color.primary" in user
    assert "components/nexus/Home.tsx" in user
