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

脚本自身的判据（本地/远程的 trust_env、NO_PROXY 清洗、对照腿、畸形轮转必须碰不到 provider）
钉在 `apps/ai-service/tests/test_stress_harness_env.py`——仪器坏了不会自己报错，只会安静地量错东西。

退出码：0=通过 · 3=目标不可达 · 4=鲁棒性判据失败 · 5=恢复失败
"""

from __future__ import annotations

import argparse
import asyncio
import io
import os
import sys
import time
import urllib.parse
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Any

try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
except Exception:
    pass

import httpx  # noqa: E402

# 清洗 NO_PROXY 的判断只留一份真值：从被测服务里 import，不在压测脚本里再抄一遍
# （分叉的两把尺子量出来的数没法和运维读数对齐）。
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "apps" / "ai-service" / "src"))
from ai_service.config import sanitize_no_proxy  # noqa: E402

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

# 对照腿：一个不存在的路由，只走 ASGI 栈，用来把发压端与传输层的账扣掉。
# 提到模块级是为了让测试能拿它和真路由表对一次——它哪天变成一条真路由，
# 归因扣掉的就是服务自己的账，每一轮读数都会系统性偏低。
DEFAULT_CONTROL_PATH = "/no-such-route"


def _lease_note(queue: dict[str, Any] | None = None, env: dict[str, str] | None = None) -> str:
    """把 running 的**虚报上界**说清楚：它是租约长度，不是作业本体 TTL，也不随已存作业数量涨。

    为什么写在压测输出里而不是文档里：这一片的读数是"队列有多长"，而读者真正要判断的是
    "这个数字最多能滞后多久"。没有后者，一个偏低的 running 会被读成"没人在跑"。

    诚实边界：`/healthz` 不上报租约与 TTL，所以下面两个数只能从**发压进程自己的 env** 推——
    它只有在"和被测服务同一台机器同一份 env"时才对得上。因此一律标成"按本机 env 推"，
    绝不写成目标的配置。`queue.backend` 的取值来自契约枚举 `none|memory|redis`
    （`contracts/health.schema.json`）：`none` 是"队列压根没启动"，那时谈租约就是凭空给口径。
    """
    backend = (queue or {}).get("backend")
    if backend == "memory":
        return ("running 口径：目标是内存后端——账就在**目标进程**自己的字典里，"
                "没有租约也没有跨副本读数；虚报上界为 0，但多副本时打到另一台就是查不到")
    if backend != "redis":
        return (f"WARN: /healthz 报的 queue.backend={backend!r} 不是 redis"
                f"（none=队列没启动；未知值=契约漂移）——没有 running 账本可谈，这一轮不给口径")
    source = env if env is not None else dict(os.environ)
    ttl = float(max(60, int(source.get("AI_SERVICE_JOB_TTL_S", "3600") or "3600")))
    raw = source.get("AI_SERVICE_JOB_LEASE_S", "") or ""
    lease = float(raw) if raw else min(180.0, max(0.05, ttl / 4.0))
    if not 0 < lease < ttl:
        return (f"WARN: 本机 AI_SERVICE_JOB_LEASE_S={raw} 不在 (0, ttl={ttl:.0f}) 里——"
                f"同配置启动的服务会拒绝建队列，这一轮的 running 读数没有意义")
    return (f"running 口径（backend={backend}）：读数由三条 Redis 命令得出，与已存作业数量无关"
            f"【本仓库当前实现，目标进程版本更早时不成立】；"
            f"虚报上界=租约，按本机 env 推 {lease:g}s 且服务未上报；worker 心跳按 lease/3 续，"
            f"崩掉的 worker 到点自己出账；作业本体 TTL 同样按本机 env 推 {ttl:.0f}s")


def _percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round((len(ordered) - 1) * p))))
    return ordered[index]


def _repair_no_proxy() -> list[tuple[str, str, str]]:
    """清洗进程环境里的 `NO_PROXY`，返回被改动的项——**判据不重写，直接用服务端那一份**。

    本机实测（2026-11-23）：`NO_PROXY=localhost,.localhost,127.0.0.1,127.0.0.0/8,[::1],::1`
    让 `httpx.AsyncClient(...)` 在**构造阶段**就抛 `InvalidURL: Invalid port: ':1]'`——压测脚本
    一发请求都发不出去，那条记在 ROADMAP 上的 60 并发读数再也复现不出来。

    根因和第一眼的判断相反：裸 `::1` httpx 认（拼成合法的 `all://[::1]`），**带方括号的 `[::1]`**
    才不被认成 IPv6，落到兜底分支拼成 `all://*[::1]`，再当 URL 拆就得到端口 `:1]`。这个坑
    `ai_service.config.sanitize_no_proxy` 在 §AILIVE-3 踩过并钉了牙（`test_config_no_proxy.py`
    里有一条专证"httpx 见到 `[::1]` 确实炸"）。脚本原来自己抄了一份清洗，两份判断一旦分叉，
    脚本量的就和服务跑的不是同一件事，所以改成 import 那一份：同一把尺子。

    崩溃只跟 `trust_env` 有关、跟压的是谁无关（构造时就把整条 NO_PROXY 铺成挂载表），
    所以指远程目标（`--verify-real` 指向真 provider）也照崩，不能只给本地目标绕。
    只动本进程的环境，不动系统配置；`HTTP_PROXY` 里带凭据，任何路径都不许把它打印或落盘。
    """
    return sanitize_no_proxy(os.environ)



def _client_kwargs(url: str) -> dict[str, Any]:
    """压测客户端的环境选择——本地目标必须脱离进程环境里的代理设置。

    为什么要脱离：开发者机器上挂着系统代理时，`HTTP_PROXY` 会把发往 `127.0.0.1:3200` 的请求
    绕进代理再兜回来，p95 量到的是代理的排队时间而不是服务的排队时间——而本片存在的理由恰恰是
    "服务的哪一段在排队"。

    远程目标反过来：`trust_env` 保留——真 provider 在用户这台机器上必须走节点才出得去，
    把它关掉等于换个故障原因（NO_PROXY 那条崩溃由 `_repair_no_proxy` 单独解决）。判据由
    `apps/ai-service/tests/test_stress_harness_env.py` 钉住。
    """
    host = (urllib.parse.urlsplit(url).hostname or "").lower()
    loopback = (
        host == "localhost"
        or host == "::1"
        or host.endswith(".localhost")
        or host.startswith("127.")
    )
    return {"trust_env": not loopback}


async def _wave(
    url: str,
    *,
    path: str,
    total: int,
    concurrency: int,
    posts: bool = False,
    timeout_s: float = 15.0,
) -> dict[str, Any]:
    """一个分片的负载：自己开客户端、自己数延迟，返回可直接合并的原始量。

    `posts=True` 时打畸形体（BAD_BODIES 轮转）；分片之间不共用连接池——共用了就等于让
    一个 asyncio 事件循环去解 N 条 HTTP，那正是这一片要排除掉的测量误差。
    """
    limits = httpx.Limits(max_connections=concurrency + 8, max_keepalive_connections=concurrency)
    gate = asyncio.Semaphore(concurrency)
    latencies: list[float] = []
    statuses: dict[int, int] = {}
    failures: list[str] = []
    async with httpx.AsyncClient(
            base_url=url, timeout=timeout_s, limits=limits, **_client_kwargs(url)
        ) as client:
        started = time.perf_counter()

        async def one(index: int) -> None:
            async with gate:
                t0 = time.perf_counter()
                try:
                    if not posts:
                        r = await client.get(path)
                    else:
                        r = await client.post(path, json=BAD_BODIES[index % len(BAD_BODIES)])
                except httpx.HTTPError as exc:
                    failures.append(exc.__class__.__name__)
                    return
                latencies.append((time.perf_counter() - t0) * 1000)
                statuses[r.status_code] = statuses.get(r.status_code, 0) + 1

        await asyncio.gather(*(one(i) for i in range(total)))

    return {
        "total": total,
        "concurrency": concurrency,
        "wall_s": time.perf_counter() - started,
        "latencies": latencies,
        "statuses": statuses,
        "failures": failures,
    }


def _run_shard(spec: tuple[str, str, int, int, bool, float]) -> dict[str, Any]:
    """进程池入口（必须是模块级函数才 picklable）：一个分片 = 一个进程 = 一个事件循环。"""
    url, path, total, concurrency, posts, timeout_s = spec
    return asyncio.run(
        _wave(url, path=path, total=total, concurrency=concurrency, posts=posts, timeout_s=timeout_s)
    )


def _merge(raw: list[dict[str, Any]], *, procs: int) -> dict[str, Any]:
    """合并分片：百分位在**全量延迟**上算，不把各片的 p95 平均（那会系统性低估长尾）。"""
    latencies: list[float] = []
    statuses: dict[int, int] = {}
    failures: list[str] = []
    total = 0
    for shard in raw:
        latencies.extend(shard["latencies"])
        for code, count in shard["statuses"].items():
            statuses[code] = statuses.get(code, 0) + count
        failures.extend(shard["failures"])
        total += shard["total"]
    wall = max((shard["wall_s"] for shard in raw), default=0.0)
    return {
        "total": total,
        "concurrency": sum(shard["concurrency"] for shard in raw),
        "procs": procs,
        "wall_s": round(wall, 2),
        "rps": round(total / wall, 1) if wall > 0 else 0,
        "p50_ms": round(_percentile(latencies, 0.5), 1),
        "p95_ms": round(_percentile(latencies, 0.95), 1),
        "p99_ms": round(_percentile(latencies, 0.99), 1),
        "statuses": dict(sorted(statuses.items())),
        "failures": len(failures),
        "failureKinds": sorted(set(failures)),
    }


def run_wave(
    url: str,
    *,
    path: str,
    total: int,
    concurrency: int,
    procs: int,
    posts: bool = False,
    timeout_s: float = 15.0,
) -> dict[str, Any]:
    """把一批请求切给 `procs` 个进程发。

    为什么必须分进程（2026-11-23 实测）：单进程 60 并发打一个**返回 404 的空路由**只有
    56.7 rps、p95 3527ms；同样的总并发拆成 4 个进程就变成 243.9 rps、p95 1046ms——
    **4.3 倍全是压测客户端自己的事件循环 + 纯 Python h11 解析**。也就是说 §STRESS-1 记的
    "60 并发下 health p95 1531ms"量的主要是发压脚本，不是 ai-service。
    """
    procs = max(1, min(procs, total))
    base, extra = divmod(total, procs)
    specs = [
        (url, path, base + (1 if i < extra else 0), max(1, concurrency // procs), posts, timeout_s)
        for i in range(procs)
    ]
    if procs == 1:
        return _merge([_run_shard(specs[0])], procs=1)
    with ProcessPoolExecutor(max_workers=procs) as pool:
        shards = list(pool.map(_run_shard, specs))
    return _merge(shards, procs=procs)


def _print_phase(name: str, data: dict[str, Any]) -> None:
    print(f"  {name}: {data['total']} 发 / 总并发 {data['concurrency']}"
          f"（{data['procs']} 进程）/ {data['wall_s']}s ({data['rps']} rps)")
    print(f"    p50={data['p50_ms']}ms  p95={data['p95_ms']}ms  p99={data['p99_ms']}ms")
    print(f"    状态 {data['statuses']} · 网络失败 {data['failures']} {data['failureKinds']}")


def run_all(args: argparse.Namespace) -> int:
    """三相位 + 一条对照腿。同步：每个分片自带事件循环，主线程只管切分与合并。"""
    for name, _before, _after in _repair_no_proxy():
        print(f"[env] {name} 里有 httpx 解析不了的带括号 IPv6 条目，已在进程内摘掉方括号后继续。")

    try:
        probe = httpx.get(
            args.url.rstrip("/") + "/healthz", timeout=args.timeout, **_client_kwargs(args.url)
        )
    except httpx.HTTPError as exc:
        print(f"FAIL: 目标不可达 {args.url}（{exc.__class__.__name__}）", file=sys.stderr)
        return 3
    if probe.status_code != 200:
        print(f"FAIL: /healthz 返回 {probe.status_code}", file=sys.stderr)
        return 3
    # 口径行排在探活之后：它要说的是**这个目标**的队列后端（memory 还是 redis），
    # 没探活之前只能说本机 env，那是在报自己进程的配置而不是被测进程的配置。
    print(f"[口径] {_lease_note((probe.json() or {}).get('queue'))}")

    common = {
        "total": args.total,
        "concurrency": args.concurrency,
        "procs": args.procs,
        "timeout_s": args.timeout,
    }
    print(f"[§STRESS-1] target={args.url} model=none（不触发 provider） "
          f"procs={args.procs} 总并发={args.concurrency}")

    # 对照腿先跑：它不进任何 handler、不碰 Redis，只走 ASGI 栈。
    # 有了它，后面每一个数都能问一句"这是服务的墙还是发压端的墙"。
    control = run_wave(args.url, path=args.control_path, **common)
    _print_phase("对照（不存在的路由）", control)

    health = run_wave(args.url, path="/healthz", **common)
    _print_phase("health风暴", health)

    invalid = run_wave(args.url, path="/v1/ai/run", total=max(20, args.total // 4),
                       concurrency=args.concurrency, procs=args.procs, posts=True,
                       timeout_s=args.timeout)
    _print_phase("畸形请求风暴", invalid)

    recovery = run_wave(args.url, path="/healthz", total=20, concurrency=4, procs=1)
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

    # 判据四（新）：读数必须能归因。healthz 和"什么都不做的 404"打平时，
    # 这个 p95 说的是传输层/发压端，不是这条路由的代码——§STRESS-1 就是栽在这里。
    if control["p95_ms"] >= health["p95_ms"] * 0.67:
        print(f"WARN: 对照腿 p95={control['p95_ms']}ms 已接近 /healthz 的 {health['p95_ms']}ms——"
              f"这一轮的延迟主要由传输层与发压端决定，不许写进 ROADMAP 当作服务读数")
    else:
        print(f"归因：/healthz p95={health['p95_ms']}ms 对 对照腿 {control['p95_ms']}ms，"
              f"差值 {round(health['p95_ms'] - control['p95_ms'], 1)}ms 才是这条路由自己的账")
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
    ap.add_argument(
        "--procs",
        type=int,
        default=min(4, os.cpu_count() or 1),
        help="发压进程数（单进程会把发压端自己的事件循环量成服务的墙，见 run_wave 文档）",
    )
    ap.add_argument(
        "--control-path",
        default=DEFAULT_CONTROL_PATH,
        help="对照腿：一个不存在的路由，只走 ASGI 栈，用来把发压端与传输层的账扣掉",
    )
    args = ap.parse_args()
    if args.total <= 0 or args.concurrency <= 0:
        print("FAIL: total / concurrency 必须为正数", file=sys.stderr)
        return 2
    return run_all(args)


if __name__ == "__main__":
    raise SystemExit(main())
