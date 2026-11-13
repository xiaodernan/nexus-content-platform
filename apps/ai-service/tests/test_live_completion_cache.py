"""Live-cache leg (opt-in): real provider, first call misses, second hits app-level cache.

The user's original question: "why is the cache too low and always non-stream?"
The provider cache (wkapi.pro prefix cache) needs a warm-up, but
the app-level RedisLlmCompletionCache is deterministic: same (model, system, user) gets
the exact same Completion, forever, ~10ms.

This test proves that truth: turn one warm call into two identical calls, verify the
second is served from Redis and the provider is NOT contacted. Runtime context: set
NEXUS_LIVE_LLM=1 + NEXUS_LLM_COMPLETION_CACHE_URL=redis://... before running.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import pytest

_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


def _live_creds() -> dict | None:
    if (os.environ.get("NEXUS_LIVE_LLM", "") or "").strip() != "1":
        return None
    from dotenv import load_dotenv

    load_dotenv(_ENV_FILE, override=False)
    key = os.environ.get("NEXUS_OPENAI_API_KEY", "").strip()
    base = os.environ.get("NEXUS_OPENAI_BASE_URL", "").strip()
    url = (os.environ.get("NEXUS_LLM_COMPLETION_CACHE_URL", "") or "").strip()
    if not key or not base or not url:
        return None
    return {
        "NEXUS_OPENAI_API_KEY": key,
        "NEXUS_OPENAI_BASE_URL": base,
        "NEXUS_LLM_COMPLETION_CACHE_URL": url,
        "NEXUS_LLM_COMPLETION_CACHE_NAMESPACE": f"nexus:llmc:live-cache-proof:{os.getpid()}",
        "NEXUS_LLM_COMPLETION_CACHE_TTL_S": "600",
        "NEXUS_LLM_JSON_MODE": "1",
    }


_LIVE = _live_creds()
_LIVE_SKIP = pytest.mark.skipif(
    _LIVE is None,
    reason="live-cache leg opt-in: set NEXUS_LIVE_LLM=1 + NEXUS_OPENAI_API_KEY/BASE_URL/CACHE_URL",
)


@_LIVE_SKIP
def test_live_app_level_completion_cache_hits_on_repeat() -> None:
    """一次真实 provider 调用后，同 key 第二次必须从 Redis 命中（不再请求 provider）。"""
    import time
    import redis as redis_lib

    from ai_service.config import load_settings
    from ai_service.providers.registry import Registry

    settings = load_settings(_LIVE)
    reg = Registry(settings)
    llm = reg.llm
    assert llm is not None, "Registry 没构建 provider？"

    payload: dict[str, Any] = {
        "requestId": "req_live_cache_proof",
        "system": "You are a terse assistant. Reply with a single short sentence.",
        "user": "Name the single property that rendering, code and preview all project from.",
        "modelClass": "balanced",
    }

    def ask() -> tuple[float, Any]:
        start = time.monotonic()
        completion = llm.complete(model="gpt-6-sol", system=payload["system"], user=payload["user"], json_mode=False)
        return time.monotonic() - start, completion

    # warm call (first, cache-miss expected) — real provider hit
    dt_first, c_first = ask()
    assert c_first.tokens_in > 0
    assert c_first.tokens_out > 0

    # capture namespace + stats after the first call
    r = redis_lib.Redis.from_url(_LIVE["NEXUS_LLM_COMPLETION_CACHE_URL"], decode_responses=True)
    ns = _LIVE["NEXUS_LLM_COMPLETION_CACHE_NAMESPACE"]
    keys_after_first = sorted(r.keys(f"{ns}:*"))
    assert keys_after_first, "cache miss without any entry written — registry unwrap lost?"

    dt_second, c_second = ask()
    # second call must be served from Redis instantly — orders of magnitude faster
    assert dt_second < dt_first / 4.0, (
        f"refused to pass as cache-hit: dt_second={dt_second:.3f}s dt_first={dt_first:.3f}s "
        f"— ratio {dt_second/dt_first:.2f}"
    )
    # completion must be the *same* object content
    assert c_second.text == c_first.text
    assert c_second.tokens_out == c_first.tokens_out
