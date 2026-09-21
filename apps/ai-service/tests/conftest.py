"""ai-service 测试夹具。契约文件由 `npm run contract:export` 生成，测试直接消费仓库里的那份。"""

from __future__ import annotations

import copy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ai_service.app import create_app
from ai_service.config import Settings
from ai_service.providers.base import Completion
from ai_service.providers.registry import Registry

REPO_ROOT = Path(__file__).resolve().parents[3]
CONTRACTS = REPO_ROOT / "contracts"


@pytest.fixture(scope="session", autouse=True)
def require_exported_contracts() -> None:
    if not CONTRACTS.exists():
        pytest.fail(f"缺少 {CONTRACTS}，请先运行 npm run contract:export")


class FakeProvider:
    """实现 LLMProvider 协议；用来替代真实网络调用，不改变被测代码路径。"""

    kind = "llm"
    name = "fake"

    def __init__(self, reply: str) -> None:
        self.reply = reply
        self.calls: list[dict] = []

    def models(self) -> list[str]:
        return ["fake-model"]

    def model_for(self, model_class: str) -> str:
        return "fake-model"

    def complete(self, *, model: str, system: str, user: str) -> Completion:
        self.calls.append({"model": model, "system": system, "user": user})
        return Completion(
            text=self.reply,
            provider=self.name,
            model=model,
            tokens_in=11,
            tokens_out=7,
            latency_ms=12.0,
        )


def ai_request(**overrides) -> dict:
    payload = {
        "requestId": "req_test",
        "intent": "design-edit",
        "prompt": "把 Hero 的主标题改成 72px",
        "modelClass": "balanced",
        "variants": 1,
        "context": {
            "projectId": "prj_test",
            "pageId": "pg_1",
            "viewport": "desktop",
            "selection": ["n_headline"],
            "selectionDigest": [{"nodeId": "n_headline", "type": "text", "name": "Headline"}],
            "designSystemDigest": {
                "tokens": [{"key": "color.primary", "type": "color", "value": "#7c5cff"}],
                "components": [],
            },
            "document": {
                "id": "doc_1",
                "schemaVersion": 1,
                "activePageId": "pg_1",
                "pages": [
                    {
                        "id": "pg_1",
                        "name": "Home",
                        "rootId": "n_root",
                        "width": 1440,
                        "height": 900,
                        "nodes": {
                            "n_root": {
                                "id": "n_root",
                                "type": "frame",
                                "name": "Home",
                                "size": {"width": 1440, "height": 900},
                                "children": ["n_headline"],
                                "style": {"fills": [{"kind": "solid", "color": "{color.background}"}]},
                            },
                            "n_headline": {
                                "id": "n_headline",
                                "type": "text",
                                "name": "Headline",
                                "text": "从一句话到一个可发布的产品",
                                "size": {"width": "hug", "height": "hug"},
                                "children": [],
                                "style": {"fills": [{"kind": "solid", "color": "{color.text}"}]},
                                "typography": {"fontSize": 56, "fontWeight": 700},
                            },
                        },
                    }
                ],
            },
            "recentChanges": [],
        },
        "references": [],
        "approvalPolicy": [],
        "dryRun": False,
    }
    payload.update(copy.deepcopy(overrides))
    return payload


def client_for(reply: str, *, settings: Settings | None = None) -> TestClient:
    app = create_app(settings or Settings(), registry=Registry(Settings(), llm=FakeProvider(reply)))
    return TestClient(app)
