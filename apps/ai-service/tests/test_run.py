from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ai_service.app import create_app
from ai_service.config import Settings
from ai_service.execution import DESTRUCTIVE_OPS
from ai_service.providers.registry import Registry
from conftest import CONTRACTS, REPO_ROOT, FakeProvider, ai_request, client_for


def _validate(name: str, payload: dict) -> None:
    from jsonschema import Draft202012Validator

    schema = json.loads((CONTRACTS / name).read_text(encoding="utf-8"))
    errors = sorted(Draft202012Validator(schema).iter_errors(payload), key=lambda e: list(e.path))
    assert not errors, [f"{list(e.path)}: {e.message}" for e in errors]


def patch_reply(op: dict | None = None) -> str:
    op = op or {"op": "set", "nodeId": "n_headline", "path": "typography.fontSize", "value": 72}
    return json.dumps(
        {
            "patches": [{"pageId": "pg_1", "summary": "标题放大", "ops": [op]}],
            "explanation": "已把 Headline 字号改为 72。",
            "labels": ["方案 A"],
        },
        ensure_ascii=False,
    )


def test_run_requires_a_provider() -> None:
    client = TestClient(create_app(Settings(), registry=Registry(Settings())))
    response = client.post("/v1/ai/run", json=ai_request())
    assert response.status_code == 503
    body = response.json()
    _validate("ai-error.schema.json", body)
    assert body["code"] == "provider-unavailable"


def test_run_rejects_out_of_contract_request() -> None:
    client = client_for(patch_reply())
    response = client.post("/v1/ai/run", json=ai_request(prompt=""))
    assert response.status_code == 400
    assert response.json()["code"] == "validation-failed"


def test_run_returns_provider_patches() -> None:
    provider = FakeProvider(patch_reply())
    client = TestClient(create_app(Settings(), registry=Registry(Settings(), llm=provider)))
    response = client.post("/v1/ai/run", json=ai_request())
    assert response.status_code == 200
    body = response.json()
    _validate("ai-response.schema.json", body)
    assert body["capability"] == "real"
    assert body["usage"]["demoMode"] is False
    assert body["patches"][0]["ops"][0]["value"] == 72
    assert body["labels"] == ["方案 A"]
    # 上下文摘要必须真的进入提示，否则模型只能瞎猜节点
    assert "n_headline" in provider.calls[0]["user"]
    assert "color.primary" in provider.calls[0]["user"]


def test_run_fails_when_provider_returns_noise() -> None:
    client = client_for("我要开始写散文了，不是 JSON。")
    response = client.post("/v1/ai/run", json=ai_request())
    assert response.status_code == 502
    assert response.json()["code"] == "provider-failed"


def test_run_rejects_unknown_op_shape() -> None:
    client = client_for(patch_reply({"op": "explode", "nodeId": "n_headline"}))
    response = client.post("/v1/ai/run", json=ai_request())
    assert response.status_code == 502
    body = response.json()
    assert body["code"] == "validation-failed"
    assert "ops" in body["hint"] or "op" in body["hint"]


def test_dry_run_strips_patches() -> None:
    client = client_for(patch_reply())
    response = client.post("/v1/ai/run", json=ai_request(dryRun=True))
    assert response.status_code == 200
    body = response.json()
    _validate("ai-response.schema.json", body)
    assert body["patches"] == []
    assert body["explanation"].startswith("（试运行")


def test_non_destructive_ops_do_not_park_behind_approval() -> None:
    """反向对照：门不是"凡是补丁都要审批"，否则真该拦的那一条会被淹掉"""
    client = client_for(patch_reply({"op": "set", "nodeId": "n_headline", "path": "size.height", "value": 480}))
    response = client.post("/v1/ai/run", json=ai_request(approvalPolicy=["delete"]))
    assert response.status_code == 200
    body = response.json()
    assert body["approvals"] == []
    assert body["patches"] != []


# §74 说"删除"，五家op都带走东西；removeAsset 曾在两边口径里漏着
APPROVAL_OPS = [
    ({"op": "remove", "nodeId": "n_headline"}, "n_headline"),
    ({"op": "removePage", "pageId": "pg_1"}, "pg_1"),
    ({"op": "removeToken", "key": "color.primary"}, "color.primary"),
    ({"op": "removeAsset", "assetId": "a_logo"}, "a_logo"),
    ({"op": "removeComponent", "componentId": "c_button"}, "c_button"),
]


@pytest.mark.parametrize("op,needle", APPROVAL_OPS)
def test_destructive_ops_park_behind_approval(op: dict, needle: str) -> None:
    client = client_for(patch_reply(op))
    response = client.post("/v1/ai/run", json=ai_request(approvalPolicy=["delete"]))
    assert response.status_code == 200
    body = response.json()
    _validate("ai-response.schema.json", body)
    # 挂起是"不交回补丁"，不是"删掉补丁"：整份结果还在，只是过不了这道门
    assert body["patches"] == []
    assert body["approvals"][0]["action"] == "delete"
    # 理由要指得出删的是哪一处（裸 id 也算，界面上还带页面前缀）
    assert needle in body["approvals"][0]["reason"]
    assert body["error"]["code"] == "approval-required"
    assert "已挂起" in body["explanation"]


@pytest.mark.parametrize("op,needle", APPROVAL_OPS)
def test_destructive_ops_pass_when_policy_is_empty(op: dict, needle: str) -> None:
    """反向对照：策略是请求方带来的，空策略就不该拦（web 侧永远送 ['delete']）"""
    client = client_for(patch_reply(op))
    response = client.post("/v1/ai/run", json=ai_request(approvalPolicy=[]))
    assert response.status_code == 200
    body = response.json()
    assert body["approvals"] == []
    assert body["patches"][0]["ops"][0]["op"] == op["op"]


def test_destructive_op_set_matches_the_web_gate() -> None:
    """两侧各扫各的补丁，口径不一致就等于没有门：这条把那句注释变成机检。

    web 的 `server/ai/approvals.ts` 是门真正开着的这一侧（provider 忘了自查也拦得住），
    它那份清单如果与这里不同，多出来的那一档就是"provider 侧不拦、web 侧才拦"，
    少掉的那一档则是两边都不拦——所以直接读那个文件，不在这儿抄第二份常量。
    """
    import re

    source = (REPO_ROOT / "apps/web/src/server/ai/approvals.ts").read_text(encoding="utf-8")
    match = re.search(r"DESTRUCTIVE_OPS = \[([^\]]*)\]", source)
    assert match, "web 侧的 DESTRUCTIVE_OPS 清单读不到（改名或换行式了？）"
    web_ops = set(re.findall(r"'([^']+)'", match.group(1)))
    assert web_ops == DESTRUCTIVE_OPS, f"web={sorted(web_ops)} vs ai-service={sorted(DESTRUCTIVE_OPS)}"


def test_unsupported_model_class_is_not_faked() -> None:
    client = client_for(patch_reply())
    response = client.post("/v1/ai/run", json=ai_request(modelClass="image"))
    assert response.status_code == 503
    assert response.json()["code"] == "provider-unavailable"


def test_oversized_body_rejected(tmp_path: Path) -> None:
    client = client_for(patch_reply())
    big = ai_request()
    big["context"]["document"]["pages"][0]["nodes"]["n_root"]["name"] = "x" * (7 * 1024 * 1024)
    response = client.post("/v1/ai/run", json=big)
    assert response.status_code == 413


def test_plans_from_provider_are_sanitised() -> None:
    reply = json.dumps(
        {
            "patches": [],
            "explanation": "需要两步",
            "plans": [
                {
                    "goal": "改标题",
                    "tasks": [{"id": "t1", "title": "改字号"}, {"broken": True}],
                }
            ],
        },
        ensure_ascii=False,
    )
    client = client_for(reply)
    body = client.post("/v1/ai/run", json=ai_request()).json()
    _validate("ai-response.schema.json", body)
    assert body["plans"][0]["goal"] == "改标题"
    assert [t["id"] for t in body["plans"][0]["tasks"]] == ["t1"]


@pytest.mark.parametrize("bad", [None, 42, "text"])
def test_non_object_body(bad: object) -> None:
    client = client_for(patch_reply())
    response = client.post(
        "/v1/ai/run",
        content=json.dumps(bad),
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 400
