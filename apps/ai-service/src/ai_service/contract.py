"""加载 `contracts/*.schema.json`（由 `npm run contract:export` 从 zod 导出）做运行期校验。

契约的权威定义在 `packages/schemas`；Python 侧不重复定义形状，只消费导出文件，
这样 web 与 ai-service 不可能各自漂移（docs/ARCHITECTURE.md 边界纪律 4）。
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

REPO_CONTRACTS = Path(__file__).resolve().parents[4] / "contracts"


class ContractMissing(Exception):
    """导出文件缺失：说明忘了跑 `npm run contract:export`，必须显式失败而不是跳过校验。"""


def contract_dir() -> Path:
    override = os.environ.get("AI_CONTRACT_DIR")
    return Path(override) if override else REPO_CONTRACTS


@lru_cache(maxsize=None)
def validator(name: str) -> Draft202012Validator:
    path = contract_dir() / name
    if not path.exists():
        raise ContractMissing(f"缺少契约文件 {path}，请运行 npm run contract:export")
    schema = json.loads(path.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def issues(name: str, payload: Any) -> list[str]:
    """返回人类可读的校验错误列表；空列表代表通过。"""
    out: list[str] = []
    for error in sorted(validator(name).iter_errors(payload), key=lambda e: list(e.path)):
        location = "/".join(str(p) for p in error.path) or "body"
        out.append(f"{location}: {error.message}")
    return out[:20]


def is_valid(name: str, payload: Any) -> bool:
    return not issues(name, payload)
