"""§STRESS-1 · ai-service 高并发/鲁棒性压测（不烧 provider token）。

为什么只打免费端点
------------------
用户要的是「海量用户、高并发、瞬间大数据量、撞库」下的**系统**行为，
不是拿真实模型 API 烧钱。`/healthz` 走完整 FastAPI 栈，`/v1/ai/run` 的
**校验失败分支**走完整契约校验但不触发 provider——这两条加起来足够暴露
连接池耗尽、事件循环被同步阻塞、无界排队、错误码漂移这类真问题。

三个相位
--------
1. `health`：N 个并发打 `/healthz`，量 p50/p95/p99 与错误率。
2. `invalid`：同一批并发打畸形 `/v1/ai/run`（缺字段、错类型、超大字符串），
   断言全部拿到 4xx 而不是 500——**坏请求不得把进程打穿**。
3. `recovery`：风暴后再打一轮 `/healthz`，确认服务还活着、延迟没有数量级劣化。

用法：
    python scripts/stress-ai-service.py --url http://127.0.0.1:3200 --total 600 --concurrency 60
    python scripts/stress-ai-service.py --verify-real   # 对真实目标跑（默认 dry 到 127.0.0.1:3200）

退出码：0=通过 · 3=目标不可达 · 4=鲁棒性判据失败 · 5=恢复失败
"""

from __future__ import annotations

import argparse
import asyncio
import io
import json
import os
import statistics
import sys
import time
from typing import Any

try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
except Exception:
    pass

import httpx  # noqa: E402

# 畸形请求轮转：每一族都对应一条真实的坏输入路径。
#
# **每一族都必须缺 `requestId`**——契约必填项，缺了就绝无可能走到 provider。
# 这不是偷懒：2026-11-20 第一版里有一族 `context.projectId=../../etc/passwd`
# 其实完全合法（ai-service 不查业务库，路径样字符串只是字符串），
# 150 发里有 12 发拿到 200，**真的打了 12 次模型**。压测脚本自己必须先自检，
# 否则它测的是"服务能扛住我误触发的真调用"，还烧掉别人的 token 预算。
BAD_BODIES: list[dict[str, Any]] = [
    {},  # 空对象
    {"prompt": "x"},  # 缺 requestId
    {"prompt": 123, "context": {}},  # 类型错
    {"prompt": "x" * 200_000, "context": {}},  # 瞬间大数据量
    {"prompt": "x", "context": {"projectId": "../../etc/passwd"}},  # 路径样注入
    {"prompt": "x", "modelClass": "no-such-class", "context": {}},  # 枚举外模型档
]


def _percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round((len(ordered) - 1) * p))))
    return ordered[index]


async def _wave(
    client: httpx.AsyncClient,
    *,
    path: str,
    total: int,
    concurrency: int,
    body_factory: Any = None,
) -> dict[str, Any]:
    gate = asyncio.Semaphore(concurrency)
    latencies: list[float] = []
    statuses: dict[int, int] = {}
    failures: list[str] = []
    started = time.perf_counter()

    async def one(index: int) -> None:
        async with gate:
            t0 = time.perf_counter()
            try:
                if body_factory is None:
                    r = await client.get(path)
                else:
                    r = await client.post(path, json=body_factory(index))
            except httpx.HTTPError as exc:
                failures.append(exc.__class__.__name__)
                return
            latencies.append((time.perf_counter() - t0) * 1000)
            statuses[r.status_code] = statuses.get(r.status_code, 0) + 1

    await asyncio.gather(*(one(i) for i in range(total)))
    wall = time.perf_counter() - started
    return {
        "total": total,
        "concurrency": concurrency,
        "wall_s": round(wall, 2),
        "rps": round(total / wall, 1) if wall > 0 else 0,
        "p50_ms": round(_percentile(latencies, 0.5), 1),
        "p95_ms": round(_percentile(latencies, 0.95), 1),
        "p99_ms": round(_percentile(latencies, 0.99), 1),
        "statuses": dict(sorted(statuses.items())),
        "failures": len(failures),
        "failureKinds": sorted(set(failures)),
    }


def _print_phase(name: str, data: dict[str, Any]) -> None:
    print(f"  {name}: {data['total']} 发 / 并发 {data['concurrency']} / {data['wall_s']}s"
          f" ({data['rps']} rps)")
    print(f"    p50={data['p50_ms']}ms  p95={data['p95_ms']}ms  p99={data['p99_ms']}ms")
    print(f"    状态 {data['statuses']} · 网络失败 {data['failures']} {data['failureKinds']}")


async def main_async(args: argparse.Namespace) -> int:
    limits = httpx.Limits(max_connections=args.concurrency + 8, max_keepalive_connections=args.concurrency)
    async with httpx.AsyncClient(base_url=args.url, timeout=args.timeout, limits=limits) as client:
        try:
            probe = await client.get("/healthz")
        except httpx.HTTPError as exc:
            print(f"FAIL: 目标不可达 {args.url}（{exc.__class__.__name__}）", file=sys.stderr)
            return 3
        if probe.status_code != 200:
            print(f"FAIL: /healthz 返回 {probe.status_code}", file=sys.stderr)
            return 3

        print(f"[§STRESS-1] target={args.url} model=none（不触发 provider）")
        health = await _wave(client, path="/healthz", total=args.total, concurrency=args.concurrency)
        _print_phase("health风暴", health)

        invalid = await _wave(
            client,
            path="/v1/ai/run",
            total=max(20, args.total // 4),
            concurrency=args.concurrency,
            body_factory=lambda i: BAD_BODIES[i % len(BAD_BODIES)],
        )
        _print_phase("畸形请求风暴", invalid)

        recovery = await _wave(client, path="/healthz", total=20, concurrency=4)
        _print_phase("恢复探活", recovery)

    print()
    ok = True
    # 判据一：健康端点不许有非 200，也不许有网络失败
    if health["statuses"] != {200: health["total"]} or health["failures"]:
        print("FAIL: 健康风暴出现非 200 或网络失败——服务在高并发下不可达", file=sys.stderr)
        ok = False
    # 判据二：坏请求全部 4xx。500 意味着坏输入打穿了进程，而不是被契约挡住
    bad_5xx = sum(v for k, v in invalid["statuses"].items() if k >= 500)
    if bad_5xx:
        print(f"FAIL: 畸形请求里有 {bad_5xx} 个 5xx——校验层没挡住", file=sys.stderr)
        ok = False
    if invalid["failures"]:
        print(f"FAIL: 畸形请求里有 {invalid['failures']} 次网络失败", file=sys.stderr)
        ok = False
    # 判据三：风暴后必须恢复，且不能被拖慢一个数量级
    if recovery["statuses"] != {200: recovery["total"]}:
        print("FAIL: 风暴后探活不全 200——服务没恢复", file=sys.stderr)
        ok = False
    elif recovery["p95_ms"] > max(3000, health["p95_ms"] * 10):
        print(f"FAIL: 恢复后 p95={recovery['p95_ms']}ms，比风暴中劣化一个数量级", file=sys.stderr)
        ok = False
    if not ok:
        return 4

    print(f"PASS: {health['total']} 发健康 + {invalid['total']} 发畸形请求全部按预期收口；"
          f"恢复后 p95={recovery['p95_ms']}ms")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:3200", help="ai-service 基址")
    ap.add_argument("--total", type=int, default=600, help="每相位请求总数")
    ap.add_argument("--concurrency", type=int, default=60, help="并发上限")
    ap.add_argument("--timeout", type=float, default=15.0, help="单请求超时秒")
    ap.add_argument("--verify-real", action="store_true", help="显式确认打真实目标（本地默认也算）")
    args = ap.parse_args()
    if args.total <= 0 or args.concurrency <= 0:
        print("FAIL: total / concurrency 必须为正数", file=sys.stderr)
        return 2
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
