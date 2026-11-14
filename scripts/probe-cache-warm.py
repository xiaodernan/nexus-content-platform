"""§CACHE-4 · 网关前缀缓存**天花板**的口径探针（真机，会产生费用）。

为什么需要它
------------
`scripts/prompt-prefix-audit.py` 在**本地字节层**量出连续两轮前缀复用率 96.05%；
`scripts/probe-cache-turns.py` 在**同一份载荷**上让网关自己报出 `cached_tokens`，
轮二只有 39.7%。两个数差了 56 个百分点——这段差距不是我们能靠"再排一次序"补上的，
它落在网关那一侧。**不知道它是什么，就没法判断还该不该继续优化顺序。**

三个互斥假设，一次实验分开：

  H1 上限（cap）      网关只缓存前 N 个 token，N 之外无论多稳定都不进缓存
                      → 稳态 cached 恒等于同一个数，且 < 稳定块长度
  H2 预热（warmup）   缓存写入是异步的，轮二太早，轮三/轮四才满
                      → cached 单调上升
  H3 抖动（flaky）    网关按通道轮询，同一 lane 会落到不同上游分片
                      → cached 在 0 与上限之间来回跳

做法：**同一条 `prompt_cache_key` 车道，同一份字节完全相同的载荷，连发 N 次**，
每次只让模型吐 1 个 token（`max_tokens=1`）——我们要的是 `usage`，不是回答。
唯一变量是"第几次"，所以任何读数差异都不能归因于载荷本身。

用法：
    python scripts/probe-cache-warm.py --confirm-real [--turns 5] [--lane nexus-cache4]

不带 `--confirm-real` 只打印计划、不发请求（防意外计费，与 live smoke 同约定）。

退出码：0=判定完成 · 2=缺 key · 3=网络错 · 5=网关没回 usage · 6=载荷太小无法判定
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import sys
from typing import Any

_here = os.path.dirname(os.path.abspath(__file__))
_dot_env = os.path.normpath(os.path.join(_here, "..", "apps", "ai-service", ".env"))
sys.path.insert(0, os.path.join(_here, "..", "apps", "ai-service", "src"))


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

import importlib.util  # noqa: E402

from ai_service.design_prompt import build_prompt, stable_block_digest  # noqa: E402
_spec = importlib.util.spec_from_file_location(
    "prompt_prefix_audit", os.path.join(_here, "prompt-prefix-audit.py")
)
_audit = importlib.util.module_from_spec(_spec)  # type: ignore[arg-type]
assert _spec is not None and _spec.loader is not None
_spec.loader.exec_module(_audit)
_request = _audit._request

KEY = os.environ.get("NEXUS_OPENAI_API_KEY")
BASE = os.environ.get("NEXUS_OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
MODEL = os.environ.get("NEXUS_MODEL_BALANCED", "gpt-4o")


def _usage(payload: dict[str, Any]) -> tuple[int, int, bool]:
    """(prompt_tokens, cached_tokens, 网关是否报了 cache 字段)。"""
    u = payload.get("usage") or {}
    pin = u.get("prompt_tokens_details")
    cached: Any = None
    reported = False
    if isinstance(pin, dict) and "cached_tokens" in pin:
        reported = True
        cached = pin.get("cached_tokens")
    elif "prompt_cache_hit_tokens" in u:
        reported = True
        cached = u.get("prompt_cache_hit_tokens")
    return int(u.get("prompt_tokens") or 0), int(cached or 0), reported


def _verdict(hits: list[int]) -> tuple[str, str]:
    """把读数序列翻译成一个可证伪的结论。判据顺序就是假设的排他顺序。

    本实验每一轮发的**是同一份字节**，所以"可缓存的那一半"就是整份 prompt；
    `prompt_tokens` 既是分母也是理论上限，不需要再单独估稳定块长度。
    """
    total = hits[0]
    warm = hits[1:]
    if not warm:
        return "inconclusive", "只有一轮，分不开任何假设"
    cap = max(warm)
    if cap == 0:
        return "no-cache", "轮二起一次都没命中——车道隔离或网关没开前缀缓存"
    # H1：轮二起所有读数都等于同一个值，且明显低于整份 prompt
    if len(set(warm)) == 1 and cap < total * 0.95:
        return "cap", f"稳态恒为 {cap} / {total} token，上限落在网关上"
    # H2：单调不减且末轮明显高于轮二
    if warm == sorted(warm) and warm[-1] > warm[0]:
        return "warmup", f"从 {warm[0]} 爬到 {warm[-1]}——缓存写入是异步的，轮次够才满"
    # H3：出现过回落到上限一半以下的轮次
    if min(warm) < cap * 0.5:
        return "flaky", f"在 {min(warm)}~{cap} 之间跳——同一 lane 未必落在同一上游分片"
    # 全都接近整份 prompt：没有天花板
    if cap >= total * 0.95:
        return "full", f"稳态 {cap} / {total}——前缀基本全进缓存"
    return "partial", f"稳态 {cap} / {total}，读数稳定但没到顶"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--confirm-real", action="store_true", help="真的发请求（会产生费用）")
    ap.add_argument("--turns", type=int, default=4, help="同一份载荷发几次（含冷启动那次）")
    ap.add_argument("--lane", default="nexus-cache4", help="prompt_cache_key 车道名")
    args = ap.parse_args()

    if not KEY:
        print("FAIL: 找不到 NEXUS_OPENAI_API_KEY（apps/ai-service/.env）", file=sys.stderr)
        return 2

    system, user = build_prompt(_request(0))
    request = _request(0)
    digest = stable_block_digest(request)

    print(f"[§CACHE-4] cache-warm · model={MODEL} · base={BASE} · key=***")
    print(f"  system={len(system)}B  user={len(user)}B  stableDigest={digest}  lane={args.lane}")
    print(f"  计划：同一份字节连发 {args.turns} 次，每次 max_tokens=1")

    if not args.confirm_real:
        print("DRY：未发请求。加 --confirm-real 才会真的调用 provider（会产生费用）。")
        return 0

    import httpx

    headers = {"authorization": f"Bearer {KEY}", "content-type": "application/json"}
    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.2,
        "max_tokens": 1,  # 只要 usage，不要回答
        "prompt_cache_key": args.lane,
    }

    hits: list[int] = []
    with httpx.Client(base_url=BASE, headers=headers, timeout=180.0) as client:
        for turn in range(1, args.turns + 1):
            try:
                r = client.post("chat/completions", json=body)
            except httpx.HTTPError as exc:
                print(f"FAIL: 网络错误 {exc.__class__.__name__}", file=sys.stderr)
                return 3
            if r.status_code >= 400:
                print(f"FAIL: provider {r.status_code}: {r.text[:300]}", file=sys.stderr)
                return 5
            prompt_tokens, cached, reported = _usage(r.json())
            if prompt_tokens == 0:
                print("FAIL: 网关没回 usage.prompt_tokens，无法判定", file=sys.stderr)
                return 5
            hits.append(cached)
            flag = "" if reported else "（网关未报 cache 字段）"
            rate = cached / prompt_tokens
            print(f"  turn{turn}: prompt={prompt_tokens} cached={cached} ({rate:.1%}){flag}")

    # 每一轮发的都是同一份字节：prompt 既是分母也是理论可缓存上限
    kind, why = _verdict(hits)
    print()
    print(f"  判定 = {kind}：{why}")
    print(f"  逐轮 cached 序列 = {hits}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
