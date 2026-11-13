"""前缀缓存友好序门（v690，ADR 0123）。

同项目连续几轮的 prompt 前缀（SYSTEM_PROMPT + 整份目录摘要）可以被 provider
前缀缓存整段命中——前提是 JSON 报文里"稳定现场"在前、"本轮诉求"在后。
本门钉住 build_prompt 的键插入序：stable 在前、volatile 在尾。
"""
import json

from ai_service.design_prompt import build_prompt


def _fixture_request() -> dict:
    import pathlib

    p = pathlib.Path(__file__).resolve().parents[3] / "contracts" / "fixtures" / "ai-request-with-index.json"
    return json.loads(p.read_text(encoding="utf-8"))


def test_volatile_keys_are_last() -> None:
    """诉求/意图/组合数必须在 JSON 对象末尾；catalog 必须在 intent 之前。"""
    request = _fixture_request()
    request["prompt"] = "把 Hero 的标题改成 64px"
    _, user = build_prompt(request)
    payload = json.loads(user)
    keys = list(payload.keys())
    assert keys[-3:] == ["intent", "prompt", "variants"], f"volatile keys must be last, got {keys[-5:]}"
    assert keys.index("selectionDigest") < keys.index("intent"), "catalog must precede intent"
    assert keys.index("tokens") < keys.index("prompt"), "tokens table must precede prompt"
    assert "promptTruncated" not in payload
