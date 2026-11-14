#!/usr/bin/env python3
"""NEXUS — Redis completion-cache 压力/容量探针（v734）。

模拟 `RedisLlmCompletionCache`（apps/ai-service/src/ai_service/redis_completion_cache.py，
v690 / ADR-0123）在生产里的**真实 Redis 操作形状**：

  get hit  → GET entry:{digest}  + ZADD lru {now_ms} digest
  get miss → GET entry:{digest}  （不写库） → 调用方会 store
  store    → SET entry:{digest} {payload} EX 3600 + ZADD lru + ZREMRANGEBYRANK（裁员）

命名空间硬隔离：DB **15** + 前缀 `nexus:loadtest:llmc:`，全程只碰这一个前缀；
结束后把本脚本创建的全部 key 精确删除（按本次写出的 digest 清单逐个 DEL / ZREM），
最后再 SCAN 一次验证残留为 0。**绝不 FLUSHDB、绝不触碰 nexus:llmc 与生产命名空间。**

用法：
  python scripts/load-redis-completion-cache.py [--ops 6000] [--out docs/evidence/xxx.json]

不依赖 redis-py；纯标准库 asyncio + 裸 RESP2 协议，便于在任何机器只装了 Python 3 就能跑。
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import math
import random
import sys
import time

HOST = "127.0.0.1"
PORT = 56379
DB = 15
NS = "nexus:loadtest:llmc"
ENTRY = f"{NS}:entry"
LRU = f"{NS}:lru"
_PAYLOAD_BYTES = 1500  # 近似 _encode 出来的 completion JSON 体积


def encode_payload(i: int) -> bytes:
    obj = {
        "v": 1,
        "completion": {
            "text": f"负载测试回包样本 #{i} — 这是一段约 {_PAYLOAD_BYTES} 字节的补全文本，用于让 SET 更接近真实载荷。" + "字" * (_PAYLOAD_BYTES - 60),
            "provider": "loadtest",
            "model": "loadtest-model",
            "tokens_in": 1200 + i % 500,
            "tokens_out": 300 + i % 200,
            "latency_ms": 800 + i % 1500,
            "cached_tokens": 900 + i % 400,
            "reasoning_tokens": 0,
        },
    }
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def digest_for(model: str, system: str, user: str, json_mode: str) -> str:
    h = hashlib.sha256()
    h.update(model.encode("utf-8"))
    h.update(b"\0")
    h.update(system.encode("utf-8"))
    h.update(b"\0")
    h.update(user.encode("utf-8"))
    h.update(b"\0")
    h.update(json_mode.encode("utf-8"))
    return h.hexdigest()


class RespReader(asyncio.StreamReader):  # pragma: no cover - 仅类型标注
    pass


async def read_reply(reader: asyncio.StreamReader):
    prefix = await reader.readexactly(1)
    line = (await reader.readline()).rstrip(b"\r\n")
    p = prefix.decode()
    if p == "+":
        return ("str", line.decode("utf-8", "replace"))
    if p == "-":
        return ("err", line.decode("utf-8", "replace"))
    if p == ":":
        return ("int", int(line))
    if p == "$":
        n = int(line)
        if n == -1:
            return ("bulk", None)
        body = await reader.readexactly(n)
        await reader.readexactly(2)  # CRLF
        return ("bulk", body)
    if p == "*":
        n = int(line)
        if n == -1:
            return ("arr", None)
        items = []
        for _ in range(n):
            items.append(await read_reply(reader))
        return ("arr", items)
    raise ValueError(f"unknown RESP prefix {prefix!r}")


def encode_cmd(*parts: object) -> bytes:
    out = [f"*{len(parts)}\r\n".encode()]
    for part in parts:
        data = part if isinstance(part, (bytes, bytearray)) else str(part).encode("utf-8")
        out.append(b"$" + str(len(data)).encode() + b"\r\n" + bytes(data) + b"\r\n")
    return b"".join(out)


async def call(reader: asyncio.StreamReader, writer: asyncio.StreamWriter, *parts: object):
    writer.write(encode_cmd(*parts))
    await writer.drain()
    return await read_reply(reader)


async def worker(
    wid: int,
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
    work: asyncio.Queue,
    stats: dict,
    created: list[tuple[str, int]],
    stop_at: float,
):
    """一个 worker 一对 TCP 连接，每次取一个虚拟 LLM 请求项。"""
    while time.monotonic() < stop_at:
        try:
            item = work.get_nowait()
        except asyncio.QueueEmpty:
            return
        model, system, user, json_mode, idx = item
        digest = digest_for(model, system, user, json_mode)
        t0 = time.perf_counter()
        try:
            r_type, r_val = await call(reader, writer, "GET", f"{ENTRY}:{digest}")
            latency_ms = (time.perf_counter() - t0) * 1000.0
            stats["ops"] += 1
            stats["durations_ms"].append(latency_ms)
            if r_type == "err":
                stats["errors"] += 1
                stats["error_samples"].append(str(r_val))
                continue
            hit = r_type == "bulk" and r_val is not None
            if hit:
                stats["hits"] += 1
                now_ms = int(time.time() * 1000)
                r_type, r_val = await call(reader, writer, "ZADD", LRU, str(now_ms), digest)
                if r_type == "err":
                    stats["errors"] += 1
                    stats["error_samples"].append(str(r_val))
            else:
                stats["misses"] += 1
                payload = encode_payload(idx)
                for cmd in (
                    ("SET", f"{ENTRY}:{digest}", payload, "EX", "3600"),
                    ("ZADD", LRU, str(int(time.time() * 1000)), digest),
                    ("ZREMRANGEBYRANK", LRU, "0", "-257"),
                ):
                    r_type, r_val = await call(reader, writer, *cmd)
                    if r_type == "err":
                        stats["errors"] += 1
                        if len(stats["error_samples"]) < 5:
                            stats["error_samples"].append(str(r_val))
                created.append((digest, int(time.time() * 1000)))
        except (asyncio.IncompleteReadError, ConnectionResetError, TimeoutError, OSError) as exc:
            stats["errors"] += 1
            if len(stats["error_samples"]) < 5:
                stats["error_samples"].append(f"{type(exc).__name__}: {exc}")
        finally:
            latency_ms = (time.perf_counter() - t0) * 1000.0
            if latency_ms > 5000:
                stats["slow_ops"] += 1


def percentile(sorted_values: list[float], pct: float) -> float:
    if not sorted_values:
        return 0.0
    k = max(0, math.ceil(pct / 100.0 * len(sorted_values)) - 1)
    return sorted_values[k]


async def connect() -> tuple[asyncio.StreamReader, asyncio.StreamWriter]:
    return await asyncio.open_connection(HOST, PORT, limit=2**20)


async def run_stage(connections: int, ops: int, rng: random.Random, hot_keys: list[str], cold_pool_size: int) -> dict:
    work: asyncio.Queue = asyncio.Queue()
    now_ms = int(time.time() * 1000)
    for i in range(ops):
        if rng.random() < 0.8:
            # 80% 打热集：高缓存命中段（模拟流量的幂律头部）
            digest_hint = hot_keys[i % len(hot_keys)]
            model, system, user, jm = "gpt-6-sol", f"sys:{digest_hint}", f"user:{digest_hint}", "off"
        else:
            # 20% 打冷集：首次见到的 key，走 miss→store 路径
            k = rng.randrange(cold_pool_size)
            model, system, user, jm = "gpt-6-sol", "sys:cold", f"user:cold:{k}:{now_ms}:{i}", "off"
        await work.put((model, system, user, jm, i))

    stats = {"ops": 0, "hits": 0, "misses": 0, "errors": 0, "slow_ops": 0, "durations_ms": [], "error_samples": []}
    created: list[tuple[str, int]] = []

    conns = [await connect() for _ in range(connections)]
    # 选择 DB15（不动 DB8 的 llmc 命名空间）
    for reader, writer in conns:
        await call(reader, writer, "SELECT", str(DB))
    stop_at = time.monotonic() + 120.0
    t0 = time.perf_counter()
    await asyncio.gather(*(worker(i, r, w, work, stats, created, stop_at) for i, (r, w) in enumerate(conns)))
    wall_s = time.perf_counter() - t0
    for _, writer in conns:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass

    durs = sorted(stats.pop("durations_ms"))
    result = {
        "connections": connections,
        "ops_target": ops,
        "ops_done": stats["ops"],
        "hits": stats["hits"],
        "misses": stats["misses"],
        "errors": stats["errors"],
        "error_samples": stats["error_samples"],
        "slow_ops_over_5s": stats["slow_ops"],
        "wall_s": round(wall_s, 3),
        "throughput_ops_s": round(stats["ops"] / wall_s, 1) if wall_s > 0 else 0.0,
        "hit_ratio": round(stats["hits"] / max(1, stats["hits"] + stats["misses"]), 4),
        "p50_ms": round(percentile(durs, 50), 3),
        "p95_ms": round(percentile(durs, 95), 3),
        "p99_ms": round(percentile(durs, 99), 3),
        "max_ms": round(durs[-1], 3) if durs else 0.0,
    }
    return result, created


async def prefill_hot(reader: asyncio.StreamReader, writer: asyncio.StreamWriter, n: int) -> list[str]:
    hot = []
    now_ms = int(time.time() * 1000)
    for i in range(n):
        digest = digest_for("gpt-6-sol", f"sys:hot:{i}", f"user:hot:{i}", "off")
        hot.append(f"hot:{i}")
        r_type, r_val = await call(reader, writer, "SET", f"{ENTRY}:{digest}", encode_payload(i), "EX", "3600")
        assert r_type != "err", f"hot prefill SET failed: {r_val}"
        await call(reader, writer, "ZADD", LRU, str(now_ms), digest)
    return hot


async def cleanup(created_all: list[tuple[str, int]]) -> dict:
    reader, writer = await connect()
    try:
        await call(reader, writer, "SELECT", str(DB))
        digests = {d for d, _ in created_all} | {digest_for("gpt-6-sol", f"sys:hot:{i}", f"user:hot:{i}", "off") for i in range(16)}
        removed = 0
        for d in digests:
            r_type, r_val = await call(reader, writer, "DEL", f"{ENTRY}:{d}")
            if r_type == "int":
                removed += r_val
        r_type, r_val = await call(reader, writer, "DEL", LRU)
        if r_type == "int":
            removed += r_val
        # SCAN 验证前缀残留（MATCH 枚举，不用 KEYS）
        residue = 0
        cursor = "0"
        while True:
            r_type, items = await call(reader, writer, "SCAN", cursor, "MATCH", f"{NS}:*", "COUNT", "200")
            if r_type != "arr" or items is None:
                residue = -1  # 测量失败，绝不冒充 0
                break
            cursor = items[0][1].decode()
            page = items[1][1] if items[1] and items[1][0] == "arr" else []
            residue += len(page)
            if cursor == "0":
                break
        return {"entries_deleted": removed, "namespace_residue": residue}
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass


async def amain() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ops", type=int, default=6000, help="每个并发档位的操作数")
    ap.add_argument("--stages", type=str, default="16,64,128,256", help="逗号分隔的并发连接数档位")
    ap.add_argument("--out", type=str, default="", help="把完整结果写到这个 JSON 文件")
    args = ap.parse_args()

    reader, writer = await connect()
    await call(reader, writer, "SELECT", str(DB))
    pong = await call(reader, writer, "PING")
    print(f"PING -> {pong}", flush=True)
    hot_keys = await prefill_hot(reader, writer, 16)
    writer.close()
    await writer.wait_closed()

    rng = random.Random(20261114)
    created_all: list[tuple[str, int]] = []
    stages = []
    for conns in [int(x) for x in args.stages.split(",") if x.strip()]:
        result, created = await run_stage(conns, args.ops, rng, hot_keys, cold_pool_size=5000)
        stages.append(result)
        created_all.extend(created)
        print(json.dumps(result, ensure_ascii=False), flush=True)

    verify = await cleanup(created_all)
    print(f"cleanup -> {json.dumps(verify, ensure_ascii=False)}", flush=True)

    report = {
        "target": f"{HOST}:{PORT} DB{DB} namespace={NS}",
        "pattern": "llmc get-hit/zadd + get-miss→set/zadd/zremrangebyrank (v690 ADR-0123 同形状)",
        "payload_bytes": _PAYLOAD_BYTES,
        "hot_keys": 16,
        "stages": stages,
        "cleanup": verify,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)
        print(f"written -> {args.out}", flush=True)
    return 0 if (all(s["errors"] == 0 for s in stages) and verify["namespace_residue"] == 0) else 2


if __name__ == "__main__":
    sys.exit(asyncio.run(amain()))
