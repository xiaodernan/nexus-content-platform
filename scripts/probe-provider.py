"""One-shot probe of the OpenAI-compatible provider the user just handed us.

Run: python scripts/probe-provider.py

NEVER prints the API key. Only sends one tiny chat completion and prints the
model's reply + token counts to prove the endpoint is real and usable.
"""
from __future__ import annotations

import json
import os
import sys
import time

# 显式环境变量优先；缺省回落到 apps/ai-service/.env（被 .gitignore 隔离的本地开发文件）。
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
BASE = os.environ.get("NEXUS_OPENAI_BASE_URL", "https://wkapi.pro/v1")
MODEL = os.environ.get("NEXUS_MODEL_BALANCED", "gpt-6-sol")

if not KEY:
    print("NEXUS_OPENAI_API_KEY not found in env or apps/ai-service/.env", file=sys.stderr)
    print("Fill apps/ai-service/.env (see apps/ai-service/.env.example) or export the variable.", file=sys.stderr)
    sys.exit(2)

import httpx

body = {
    "model": MODEL,
    "messages": [
        {"role": "system", "content": "You reply only in JSON."},
        {"role": "user", "content": 'Reply with exactly this JSON object: {"ok": true, "origin": "nexus probe"}'},
    ],
    "temperature": 0.2,
    "response_format": {"type": "json_object"},
}

started = time.perf_counter()
try:
    r = httpx.post(
        f"{BASE}/chat/completions",
        headers={"authorization": f"Bearer {KEY}", "content-type": "application/json"},
        json=body,
        timeout=60,
    )
except httpx.HTTPError as exc:
    print(f"provider network error: {exc.__class__.__name__}", file=sys.stderr)
    sys.exit(3)

elapsed_ms = (time.perf_counter() - started) * 1000
print(f"HTTP {r.status_code} · {elapsed_ms:.0f}ms")
try:
    payload = r.json()
    print(f"model: {payload.get('model')}")
    print(f"content: {payload['choices'][0]['message']['content']}")
    usage = payload.get("usage") or {}
    print(f"usage: prompt_tokens={usage.get('prompt_tokens')} completion_tokens={usage.get('completion_tokens')}")
except Exception as exc:
    print("non-JSON body:", r.text[:400])
    sys.exit(4)
