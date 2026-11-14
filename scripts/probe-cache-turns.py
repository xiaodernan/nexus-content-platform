"""§CACHE-2 · 真机 A/B：载荷顺序对 provider 前缀缓存命中率的因果影响。

为什么存在
----------
用户两次报告"缓存命中率低"。已有的 `probe-prompt-cache.py` 用**同一份 payload 连发两次**，
那只证明"网关会报 cached_tokens"，证明不了真实多轮能命中：真实 Studio 里目录不变、
选中节点与诉求每轮都变。

本探针做的是**因果对照**（不是相关性）：
  A（新序）  build_prompt 现在的输出：稳定大目录在前，每轮现场在后
  B（旧序）  同一份内容按旧键序重排：selection / selectionDigest 在目录之前，
            system 里还拼着 agent 说明
两个变体各用**独立的 prompt_cache_key**（避免同 lane 互相污染），各自先发一次
把前缀热进 lane，再发第二轮量 `prompt_tokens_details.cached_tokens`。

同一份内容、同一个模型、同一个网关，唯一变量是字节顺序。

用法：
    python scripts/probe-cache-turns.py --confirm-real

不带 `--confirm-real` 只打印计划、不发请求（防意外计费，与 live smoke 同约定）。
退出码：0=对照成立（新序显著优于旧序），4=新序没有优势，5=网关没报 cached 字段，2=缺 key。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

_here = os.path.dirname(os.path.abspath(__file__))
_dot_env = os.path.normpath(os.path.join(_here, "..", "apps", "ai-service", ".env"))
sys.path.insert(0, os.path.join(_here, "..", "apps", "ai-service", "src"))
sys.path.insert(0, _here)


def _load_dotenv(path: str) -> None:
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            key, sep, value = line.partition("=")
            if sep and key.strip().startswith(("NEXUS_", "AI_SERVICE_")):
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(_dot_env)

from ai_service.design_prompt import SYSTEM_PROMPT, build_prompt  # noqa: E402

# 审计脚本文件名带连字符（与其它 CLI 脚本一致），importlib 按路径加载，不改文件名
import importlib.util as _ilu  # noqa: E402

_spec = _ilu.spec_from_file_location("prompt_prefix_audit", os.path.join(_here, "prompt-prefix-audit.py"))
_audit = _ilu.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_audit)
_request = _audit._request

KEY = os.environ.get("NEXUS_OPENAI_API_KEY")
BASE = os.environ.get("NEXUS_OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
MODEL = os.environ.get("NEXUS_MODEL_BALANCED", "gpt-4o")
LANE_BASE = os.environ.get("NEXUS_OPENAI_PROMPT_CACHE_KEY", "nexus-studio")

# 旧键序（ADR 0123 之前那一版；system 尾部还拼着 agent 说明）
_LEGACY_HEAD = ("modelClass", "viewport", "pageId", "selection", "selectionDigest", "annotations")
_LEGACY_MID = ("recentChanges", "corpus", "contextSource", "indexChars", "budgetChars")
_LEGACY_STABLE = ("pages", "frames", "components", "assets", "interactions", "tokens", "totals", "omissions", "catalogTrimmed", "code")
_LEGACY_TAIL = ("intent", "prompt", "variants")


def legacy_user(payload: dict[str, Any]) -> str:
    """把新序的同一份内容按旧键序重排——只改顺序，不改任何一个字节的内容。"""
    out: dict[str, Any] = {}
    for k in _LEGACY_HEAD:
        if k in payload:
            out[k] = payload[k]
        if k == "annotations" and "annotationsNote" in payload:
            out["annotationsNote"] = payload["annotationsNote"]
    for k in _LEGACY_MID:
        if k in payload:
            out[k] = payload[k]
        if k == "corpus" and "corpusNote" in payload:
            out["corpusNote"] = payload["corpusNote"]
    for k in _LEGACY_STABLE:
        if k in payload:
            out[k] = payload[k]
    for k in _LEGACY_TAIL:
        if k in payload:
            out[k] = payload[k]
    return json.dumps(out, ensure_ascii=False, separators=(",", ":"), default=str)


def _post(client, *, system: str, user: str, lane: str) -> dict[str, Any]:
    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.2,
        "max_tokens": 24,
        "prompt_cache_key": lane,
    }
    r = client.post("chat/completions", json=body)
    if r.status_code >= 400:
        print(f"FAIL: provider {r.status_code}: {r.text[:300]}", file=sys.stderr)
        raise SystemExit(5)
    return r.json()


def _usage(payload: dict[str, Any]) -> tuple[int, int]:
    u = payload.get("usage") or {}
    pin = u.get("prompt_tokens_details") or {}
    cached = pin.get("cached_tokens")
    if cached is None:
        cached = u.get("prompt_cache_hit_tokens")
    return int(u.get("prompt_tokens") or 0), int(cached or 0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--confirm-real", action="store_true", help="真的发请求（会产生费用）")
    ap.add_argument("--min-gain", type=float, default=0.30, help="新序相对旧序的最小命中率提升（绝对值）")
    args = ap.parse_args()

    if not KEY:
        print("FAIL: 找不到 NEXUS_OPENAI_API_KEY（apps/ai-service/.env）", file=sys.stderr)
        return 2

    # 两轮真实形态：目录逐字节不变，只有选中/诉求/批注/近期改动在变
    built_new = [build_prompt(_request(t)) for t in range(2)]
    payloads = [json.loads(u) for _, u in built_new]
    built_old = [
        (f"{SYSTEM_PROMPT}\n{json.loads(u)['agentNote']}", legacy_user(json.loads(u)))
        for _, u in built_new
    ]

    def ratio(hit: int, total: int) -> str:
        return f"{hit}/{total} = {hit / total:.1%}" if total else "0/0"

    print(f"[§CACHE-2] cache-order A/B · model={MODEL} · base={BASE} · key=***")
    print(f"  A 新序 system={len(built_new[0][0])}B user={len(built_new[0][1])}B")
    print(f"  B 旧序 system={len(built_old[0][0])}B user={len(built_old[0][1])}B")

    if not args.confirm_real:
        print("DRY：未发请求。加 --confirm-real 才会真的调用 provider（会产生费用）。")
        return 0

    import httpx

    headers = {"authorization": f"Bearer {KEY}", "content-type": "application/json"}
    results: dict[str, list[tuple[int, int]]] = {"A": [], "B": []}
    with httpx.Client(base_url=BASE, headers=headers, timeout=120.0) as client:
        for label, lane, built in (("A", f"{LANE_BASE}-cache2-new", built_new), ("B", f"{LANE_BASE}-cache2-old", built_old)):
            for turn, (system, user) in enumerate(built):
                payload = _post(client, system=system, user=user, lane=lane)
                total, hit = _usage(payload)
                results[label].append((total, hit))
                print(f"  {label} turn{turn + 1}: prompt={total} cached={hit} ({ratio(hit, total)})")

    a_total, a_hit = results["A"][-1]
    b_total, b_hit = results["B"][-1]
    a_rate = a_hit / a_total if a_total else 0.0
    b_rate = b_hit / b_total if b_total else 0.0
    print()
    print(f"  轮二命中率  A 新序 = {a_rate:.1%}   B 旧序 = {b_rate:.1%}   差 = {a_rate - b_rate:+.1%}")

    if a_total == 0 or b_total == 0:
        print("FAIL: 网关没回 usage.prompt_tokens，无法判定", file=sys.stderr)
        return 5
    if a_rate - b_rate < args.min_gain:
        print(
            f"FAIL: 新序相对旧序提升 {a_rate - b_rate:+.1%} < {args.min_gain:.0%}——顺序不是命中率的主因，别把结论写在错的地方",
            file=sys.stderr,
        )
        return 4
    print(f"PASS: 同一份内容，仅改字节顺序，命中率提升 {a_rate - b_rate:+.1%}（因果，不是相关）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
