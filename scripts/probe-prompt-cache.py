"""§AILIVE-4 prompt caching 的**可复检判据**（脱敏，可入 CI）。

Run:  python scripts/probe-prompt-cache.py [--service http://127.0.0.1:3200] [--direct-only]

为什么存在：2026-11-13 发现 wkapi.pro（OpenAI 兼容网关）在**不传 prompt_cache_key 时**
的 `usage` **不携带 prompt caching 字段**；而接入 OpenAI 官方 `prompt_cache_key` 参数后
**立刻返回 `prompt_tokens_details.cached_tokens`**。本脚本就是这条事实的可执行判据，
防止任何人在保持"零计账"的同时测出来"缓存没有"。

两层：
  L1  direct provider chat/completions，两段**字节一致**的大前缀消息
      —— 断言冷/暖两次调用的 `prompt_tokens_details.cached_tokens`（字段存在 + 暖 ≥ 1024）
  L2  ai-service /v1/ai/run（dryRun），两段字节一致的设计请求
      —— 断言 usage.cachedTokens（字段存在 + 暖 ≥ 1024）

配置从进程 env 读，缺省回落 apps/ai-service/.env（被 .gitignore 隔离）：
  NEXUS_OPENAI_API_KEY / NEXUS_OPENAI_BASE_URL / NEXUS_MODEL_BALANCED
  NEXUS_AI_SERVICE_URL（L2 目标，默认 http://127.0.0.1:3200）

**绝不打印 key**：只报 model / tokens / latency / cached_tokens / PASS-FAIL。

退出码：无 key → 2；L1 网络错 → 3；L1 契约违约 → 4；L2 不可达 → 5；L2 契约违约 → 6。
加 --direct-only 只跑 L1。
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
import time

try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
except Exception:
    pass

_here = os.path.dirname(os.path.abspath(__file__))
_dot_env = os.path.normpath(os.path.join(_here, "..", "apps", "ai-service", ".env"))


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

KEY = os.environ.get("NEXUS_OPENAI_API_KEY")
BASE = os.environ.get("NEXUS_OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
MODEL = os.environ.get("NEXUS_MODEL_BALANCED", "gpt-4o")
CACHE_KEY = os.environ.get("NEXUS_OPENAI_PROMPT_CACHE_KEY", "nexus-studio")
SERVICE = os.environ.get("NEXUS_AI_SERVICE_URL", "http://127.0.0.1:3200").rstrip("/")

_fail = lambda code, msg: (print(f"FAIL: {msg}", file=sys.stderr), sys.exit(code))
_pass = lambda msg: print(f"PASS: {msg}")

if not KEY:
    _fail(2, "NEXUS_OPENAI_API_KEY not found in env or apps/ai-service/.env "
             "(fill apps/ai-service/.env, see apps/ai-service/.env.example)")

import httpx  # noqa: E402

_provider_headers = {"authorization": f"Bearer {KEY}", "content-type": "application/json"}

# 稳定的大前缀（>1024 tokens）：这一段是"同 payload"的核心——字节一致才能缓存。
INVARIANT = (
    "Below is an invariant context document used by the NEXUS Studio agents on every turn.\n"
    "It lists the current framework conventions, the audience expectations, the tone of voice,\n"
    "and the set of layout rules the output must follow. Do not deviate. Do not refuse.\n\n"
    + "The controller renders pages deterministically; assistants only emit patch plans against\n"
      "typed slots provided by the canvas; a human approves structural changes before they land.\n"
      "The patch language is strictly literal JSON with an ordered ops list; order matters;\n"
      "the first op in the list drives the diff renderer in the Studio. Re-states are ignored.\n"
      "Explanations are one short sentence per patch, never longer than the evidence.\n\n"
    + "Deterministic facts (do not restate, do use):\n"
    + "- canvas width is viewport-bound, not document-bound;\n"
    + "- every node has a stable id of the form type_xxxx where xxxx is the first 12 bytes of sha256 of content;\n"
    + "- token naming is namespace-prefixed (color / font / space);\n"
    + "- a node of type text carries children; a node of type button carries label and action;\n"
    + "- pages reference nodes by node id; a missing referenced id is a bug; never invent one.\n\n"
    + "When the task is a critique, answer only with a short JSON patch list against the nodes shown.\n"
    + "When the task is a generate, propose a minimal skeleton first; never a finished page.\n"
) * 3  # ~1800-2500 tokens once repeated thrice

USER_INSTRUCTION = "Reply with exactly: pong."


def l1_direct_provider() -> int:
    body = {
        "model": MODEL,
        "prompt_cache_key": CACHE_KEY,
        "messages": [
            {"role": "system", "content": INVARIANT},
            {"role": "user", "content": USER_INSTRUCTION},
        ],
        "max_tokens": 8,
        "temperature": 0,
    }
    latencies = []
    cached = []
    for i in range(2):
        t0 = time.perf_counter()
        try:
            r = httpx.post(f"{BASE}/chat/completions", headers=_provider_headers, json=body, timeout=90)
        except httpx.HTTPError as exc:
            _fail(3, f"L1 provider 网络失败：{exc.__class__.__name__}")
        ms = (time.perf_counter() - t0) * 1000
        latencies.append(ms)
        if r.status_code in (401, 403):
            _fail(4, f"L1 provider 拒绝凭据（HTTP {r.status_code}）——检查 NEXUS_OPENAI_API_KEY")
        if r.status_code != 200:
            _fail(4, f"L1 provider 非 200：HTTP {r.status_code}")
        try:
            payload = r.json()
            usage = payload["usage"]
            details = usage.get("prompt_tokens_details") or {}
            hit = details.get("cached_tokens")
        except (ValueError, KeyError, AttributeError) as exc:
            _fail(4, f"L1 usage 违约：缺 prompt_tokens_details / cached_tokens（{exc.__class__.__name__}）")
        cached.append(int(hit) if isinstance(hit, (int, float)) else 0)
        print(f"  L1 call#{i + 1}: model={payload.get('model')} · {ms:.0f}ms · "
              f"prompt={usage.get('prompt_tokens')} · cached={int(hit or 0)}")
    if cached[-1] < 1024:
        _fail(4, f"暖调用 cached_tokens={cached[-1]} < 1024 —— 网关没命中/没报，prompt caching 未生效")
    _pass(f"L1 prompt caching: cold={cached[0]} → warm={cached[-1]}（≥1024）")
    return cached[-1]


def l2_service_run() -> int:
    run_body = {
        "requestId": "probe-prompt-cache-run",
        "intent": "design-edit",
        "prompt": "把主标题字号设为 32px。",
        "modelClass": "balanced",
        "dryRun": True,
        "approvalPolicy": [],
        "context": {
            "projectId": "probe-prompt-cache",
            "selection": ["tex_header"],
            "recentChanges": [],
        },
    }
    cached = []
    for i in range(2):
        t0 = time.perf_counter()
        try:
            r = httpx.post(f"{SERVICE}/v1/ai/run", headers={"content-type": "application/json"},
                           json=run_body, timeout=120)
        except httpx.HTTPError as exc:
            _fail(5, f"L2 /v1/ai/run 不可达：{exc.__class__.__name__}")
        ms = (time.perf_counter() - t0) * 1000
        if r.status_code != 200:
            _fail(6, f"L2 /v1/ai/run 非 200：HTTP {r.status_code} · body={r.text[:200]}")
        try:
            usage = r.json()["usage"]
            hit = usage["cachedTokens"]
        except (ValueError, KeyError) as exc:
            _fail(6, f"L2 usage 违约：缺 cachedTokens（{exc.__class__.__name__}）")
        if not isinstance(hit, int):
            _fail(6, f"L2 cachedTokens 必须是 int，得到 {hit!r}")
        cached.append(hit)
        print(f"  L2 call#{i + 1}: model={usage.get('model')} · {ms:.0f}ms · "
              f"tokens_in={usage.get('tokensIn')} · cachedTokens={hit}")
    if cached[-1] < 1024:
        _fail(6, f"暖调用 cachedTokens={cached[-1]} < 1024 —— provider 链路没命中/没报")
    _pass(f"L2 ai-service /v1/ai/run: cold={cached[0]} → warm={cached[-1]}（≥1024）")
    return cached[-1]


def main() -> None:
    global SERVICE
    ap = argparse.ArgumentParser(description="§AILIVE-4 prompt caching wire 级可复检判据（脱敏）")
    ap.add_argument("--service", default=SERVICE, help="ai-service 地址（默认读 NEXUS_AI_SERVICE_URL）")
    ap.add_argument("--direct-only", action="store_true", help="只跑 L1（不依赖 ai-service 启动）")
    args = ap.parse_args()
    SERVICE = args.service.rstrip("/")

    print(f"[§AILIVE-4] prompt-caching probe · base={BASE} · model={MODEL} · key=*** · cache_key=***")
    l1_direct_provider()
    if not args.direct_only:
        l2_service_run()
    print("[§AILIVE-4] ALL PASS —— prompt caching 已接通且可读数（不编数字、不编缓存）")


if __name__ == "__main__":
    main()
