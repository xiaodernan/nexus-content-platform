"""§CACHE-PARALLEL - 并行会话缓存干扰的可复检判据（2026-11-22 - 用户点名问题）。

Run:  python scripts/probe-parallel-cache.py [--parallel 4]

为什么存在：用户第二次报告「并行会话同时打 API 导致缓存互相干扰、命中混乱」。
2026-11-19 的 docs/evidence/cache-ab-parallel-2026-11-19.md 已经在**直连 provider** 层
量到「4 路同毫秒齐发 => 全部 0 KV」，并给出库内解法（分布式 single-flight）。
但那条结论停在 provider 层 - 生产真正走的是 web -> ai-service -> provider，
中间还隔着 StickyPromptCacheTransport（per-lane prompt_cache_key）、
CachedLlm（应用层 Redis 缓存）、进程内 single-flight 三层。三层各自会不会把
"同毫秒并发"合成一次、会不会把前缀 lane 打散，此前没有一条可复检的判据。

本脚本量的是**生产路径本身**：POST /v1/ai/chat（system 由调用方拼，与
角色对话同一形状），四组读数：

  P0 预热      2 发顺序同 system 同 user      - 冷 -> 暖，建立这条 lane 的 KV
  P1 并发异文  4 发同 system、不同 user       - 真实并行会话的形状（同前缀、不同问题）
  P2 并发同文  4 发字节完全相同               - 进程内 single-flight 该合并的形状
  P3 收敛      并发后再 1 发顺序              - 被打散之后能不能自己回来

判据（PASS/FAIL）：
  A. 预热第 2 发 cached/tokensIn >= 0.5       - lane 建得起来
  B. P1 至少一半并发发的 cached/tokensIn >= 0.5 - 同前缀并发不互相打散
  C. P2 的平均延迟 < P1 的中位延迟             - 同文并发被合并/回放，不是各打一次
  D. P3 的 cached/tokensIn >= 0.5              - 缓存不"掉了回不来"

配置从进程 env 读，缺省回落 apps/ai-service/.env（.gitignore 隔离）。
绝不打印 key；只报 model / tokens / cached / 命中率 / 延迟。
"""

from __future__ import annotations

import argparse
import asyncio
import io
import os
import statistics
import sys
import time

try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
except Exception:  # pragma: no cover
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

SERVICE = os.environ.get("NEXUS_AI_SERVICE_URL", "http://127.0.0.1:3200").rstrip("/")
MODEL = os.environ.get("NEXUS_MODEL_BALANCED", "gpt-6.2-sol")

# 前缀体量取一个"够证明 lane 成立、又不至于把 token 烧穿"的档位：
# 24k 字符的中文设定文本。真实生产里问典/世界步进走的是 15 万 token 的 canon digest
# （见 docs/evidence/cache-digest-live-full-2026-11-19.md），本脚本只验证
# "并发形状下 lane 稳不稳"这一件事，不在体量上重复烧钱。
_PREFIX_BLOCK = (
    "【低语诸王 - 潮候院设定】\n"
    "抄本房坐落在潮候院第三进，屋内常年点着一盏不写名的灯。灯不是人，不能被称作任何什么，"
    "所以谁也不敢拿它去承诺。灯晚上自己会亮，没有谁专门照料它。\n"
    "祠殿南廊尽头有一本盐账，永远只欠最后一格。两位铜匠试过复制守库人的夜钥匙："
    "第一把三次没响，第二把两次后断了齿。\n"
    "雾港旧信物库里有一枚潮印，没有沾过海水却自己泛了绿，只刻着一个字：潮。\n"
    "崖顶烽火台边立着一面旧旌，只替风记账。汐塔下有一位守塔人，守了二十年不肯下灯。\n"
    "第四十四次大会召开那天，抄本师把十七份「等」装订成书，封面只写了一个字：等。\n"
)


def _system_prefix(target_chars: int = 24_000) -> str:
    """把同一段设定重复到目标体量 - 重复段之间逐字节一致，lane 才稳。"""
    out: list[str] = []
    total = 0
    index = 0
    while total < target_chars:
        out.append(f"\n—— 卷第{index:04d} ——\n{_PREFIX_BLOCK}")
        total += len(out[-1])
        index += 1
    return "".join(out)


SYSTEM = _system_prefix()


class Probe:
    def __init__(self, service: str) -> None:
        self.service = service

    async def call(self, tag: str, user: str) -> dict[str, object]:
        import httpx

        body = {
            "requestId": f"probe-{tag}-{int(time.time() * 1000)}-{os.getpid() % 1000}",
            "system": SYSTEM,
            "user": user,
            "modelClass": "balanced",
        }
        started = time.perf_counter()
        async with httpx.AsyncClient(timeout=httpx.Timeout(180.0)) as client:
            response = await client.post(f"{self.service}/v1/ai/chat", json=body)
        elapsed = time.perf_counter() - started
        if response.status_code != 200:
            return {"tag": tag, "ok": False, "status": response.status_code, "body": response.text[:200]}
        usage = response.json().get("usage") or {}
        tokens_in = int(usage.get("tokensIn") or 0)
        cached = int(usage.get("cachedTokens") or 0)
        return {
            "tag": tag,
            "ok": True,
            "status": 200,
            "tokensIn": tokens_in,
            "cached": cached,
            "cacheReported": bool(usage.get("cacheReported")),
            "rate": (cached / tokens_in) if tokens_in else 0.0,
            "latency": elapsed,
        }


def _fmt(row: dict[str, object]) -> str:
    if not row.get("ok"):
        return f"{row['tag']}: HTTP {row['status']} {str(row.get('body'))[:120]}"
    reported = "reported" if row["cacheReported"] else "NOT-reported"
    return (
        f"{row['tag']}: {row['latency']:.2f}s tokensIn={row['tokensIn']} "
        f"cached={row['cached']} ({row['rate'] * 100:.1f}%, {reported})"
    )


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--parallel", type=int, default=4)
    parser.add_argument("--service", default=SERVICE)
    args = parser.parse_args()

    probe = Probe(args.service)
    n = args.parallel
    failures: list[str] = []

    print("== CACHE-PARALLEL 生产路径并行缓存探针 ==")
    print(f"service={args.service} model={MODEL} systemChars={len(SYSTEM)} parallel={n}")

    cold = await probe.call("P0/cold", "潮候院那盏灯是谁点的？")
    warm = await probe.call("P0/warm", "潮候院那盏灯是谁点的？")
    print(f"  {_fmt(cold)}")
    print(f"  {_fmt(warm)}")
    if not warm.get("ok"):
        failures.append(f"P0 预热失败：{warm.get('status')}")
    else:
        if not warm["cacheReported"]:
            failures.append("A0: 服务端 usage 不报 cacheReported=true - 命中率无从判断（这是用户「命中率低」的读数来源之一）")
        if float(warm["rate"]) < 0.5:
            failures.append(f"A: 预热第 2 发命中 {float(warm['rate']) * 100:.1f}% < 50% - lane 建不起来")

    users = [
        "盐账欠的最后一格记的是什么？",
        "夜钥匙为什么复制不出来？",
        "潮印上那个字是什么？",
        "旧旌替风记的是什么账？",
        "守塔人守了几年？",
        "第四十四次大会装订成的书封面写的什么？",
    ][:n]
    parallel = await asyncio.gather(*[probe.call(f"P1/{i}", u) for i, u in enumerate(users)])
    for row in parallel:
        print(f"  {_fmt(row)}")
    ok_rows = [r for r in parallel if r.get("ok")]
    hits = [r for r in ok_rows if float(r["rate"]) >= 0.5]
    if not ok_rows:
        failures.append("P1 全部并发请求失败")
    elif len(hits) * 2 < len(ok_rows):
        failures.append(f"B: P1 并发异文只有 {len(hits)}/{len(ok_rows)} 发命中 >=50% - 同前缀并发被打散")

    before_latency = statistics.median([float(r["latency"]) for r in ok_rows]) if ok_rows else 0.0
    same = await asyncio.gather(*[probe.call(f"P2/{i}", "潮候院那盏灯是谁点的？") for i in range(n)])
    for row in same:
        print(f"  {_fmt(row)}")
    same_latency = statistics.median([float(r["latency"]) for r in same if r.get("ok")]) if all(r.get("ok") for r in same) else None
    if same_latency is None:
        failures.append("P2 有并发请求失败")
    elif same_latency >= before_latency:
        failures.append(
            f"C: 同文并发中位延迟 {same_latency:.2f}s 没有低于异文并发的 {before_latency:.2f}s - 没有被合并/回放"
        )

    back = await probe.call("P3/recover", "潮候院那盏灯是谁点的？")
    print(f"  {_fmt(back)}")
    if back.get("ok"):
        if not back["cacheReported"]:
            failures.append("D0: 收敛一发不报 cacheReported=true")
        if float(back["rate"]) < 0.5:
            failures.append(f"D: 并发后缓存回不来（{float(back['rate']) * 100:.1f}%）- 中途掉缓存")

    if failures:
        print("\nFAIL:")
        for item in failures:
            print(f"  - {item}")
        return 1
    print("\nPASS: 并行会话下 lane 稳定、同文并发被合并、并发后缓存收敛")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))