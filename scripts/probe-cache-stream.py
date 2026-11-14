#!/usr/bin/env python3
"""
同 digest 流式 vs 非流缓存复用率实测（§CACHE-4-AB）。

做法：复用 scripts/probe-cache-warm.py 的目录/digest 构造，发同一份字节包，
只改一件事——这次改成 `stream: true` + `stream_options: {include_usage: true}`，
走 SSE 把末尾那条 usage 块捞出来，读 cached_tokens。

非流基线（同 lane、同 digest、同 max_tokens=1）：turn2-4 ≈ 80/83/82%（2026-11-14 同机实测）。
若流式同 lane 第二轮起 ≈ 96%+，就是用户肉眼看到的"流好多了"的来源——
证明调整没必要动架构，只需确认链路真正走 stream。
"""
import json
import sys
from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
_spec = spec_from_file_location("probe_warm", Path(__file__).resolve().parent / "probe-cache-warm.py")
_mod = module_from_spec(_spec)
_spec.loader.exec_module(_mod)

MODEL = _mod.MODEL
BASE = _mod.BASE
KEY = _mod.KEY
build_prompt = _mod.build_prompt
_request = _mod._request
stable_block_digest = _mod.stable_block_digest


def _read_sse_usage(response) -> tuple[int, int, bool]:
    """从 SSE 文本末尾找 usage.completion_tokens/prompt_tokens/prompt_tokens_details.cached_tokens。"""
    last_usage = None
    for raw in response.iter_lines():
        line = raw if isinstance(raw, str) else raw.decode("utf-8", "replace")
        if not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if payload == "[DONE]":
            continue
        try:
            obj = json.loads(payload)
        except json.JSONDecodeError:
            continue
        u = obj.get("usage")
        if isinstance(u, dict):
            last_usage = u
    if not last_usage:
        return 0, 0, False
    total = int(last_usage.get("prompt_tokens") or 0)
    pin = last_usage.get("prompt_tokens_details")
    cached = None
    if isinstance(pin, dict) and "cached_tokens" in pin:
        cached = pin.get("cached_tokens")
    elif "prompt_cache_hit_tokens" in last_usage:
        cached = last_usage.get("prompt_cache_hit_tokens")
    return total, int(cached or 0), cached is not None


def main() -> int:
    import httpx

    lane = sys.argv[1] if len(sys.argv) > 1 else "nexus-cache-stream"
    turns = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    system, user = build_prompt(_request(0))
    req = _request(0)
    digest = stable_block_digest(req)

    print(f"[§CACHE-4-AB] stream-vs-nonstream · model={MODEL} · base={BASE} · lane={lane}")
    print(f"  system={len(system)}B  user={len(user)}B  stableDigest={digest}")
    if len(sys.argv) <= 3 or sys.argv[3] != "--confirm-real":
        print("DRY: 不发真实请求。加 --confirm-real 才会付费调用 provider。")
        return 0

    headers = {"authorization": f"Bearer {KEY}", "content-type": "application/json"}
    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.2,
        "max_tokens": 1,
        "prompt_cache_key": lane,
        "stream": True,
        "stream_options": {"include_usage": True},
    }

    hits: list[int] = []
    with httpx.Client(timeout=180.0) as client:
        for turn in range(1, turns + 1):
            try:
                with client.stream("POST", f"{BASE}/chat/completions", headers=headers, json=body) as resp:
                    if resp.status_code >= 400:
                        print(f"FAIL: provider {resp.status_code}: {resp.read().decode()[:300]}", file=sys.stderr)
                        return 5
                    prompt_tokens, cached, reported = _read_sse_usage(resp)
            except httpx.HTTPError as exc:
                print(f"FAIL: 网络错误 {exc.__class__.__name__}", file=sys.stderr)
                return 3
            if prompt_tokens == 0:
                print(f"turn{turn}: 网关未在 SSE 末尾报 usage，无法判定")
                hits.append(-1)
                continue
            hits.append(cached)
            rate = cached / prompt_tokens if prompt_tokens else 0.0
            flag = "" if reported else "（SSE 末尾未见 cache 字段）"
            print(f"  turn{turn}: prompt={prompt_tokens} cached={cached} ({rate:.1%}){flag}")

    warm = [h for h in hits[1:] if h >= 0]
    if warm:
        best = max(warm)
        first = hits[0]
        print(f"  汇总: 冷启动={first} · 稳态={warm} · 最佳命中={best}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
