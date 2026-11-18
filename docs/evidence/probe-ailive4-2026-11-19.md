# §AILIVE-4 (Codex-parity 探针) · 2026-11-19 · digest 234,795 前提下 design lane 缓存直打的活证

环境：Clash Verge 节点 · ai-service 8001（provider=real · gpt-6.1-terra · 流式 ON · sticky per-lane）。
探针：`scripts/probe-prompt-cache.py --service http://127.0.0.1:8001`（python@ai-service .venv · httpx 走 Clash 代理 7897）。

## L1 — 直连 provider（同前缀 ×2）

```
call#1: prompt=5,226 · cached=0      (cold)
call#2: prompt=5,226 · cached=4,939  (warm · 94.5%)
PASS L1
```

## L2 — ai-service /v1/ai/run（dryRun · 空 stub designIndex）

```
call#1: tokens_in=299,393 · cachedTokens=0        (cold · 69.3 s)
call#2: tokens_in=299,393 · cachedTokens=299,393  (warm · 103 ms · 100%)
PASS L2
```

## 读数与边界（如实）

- **L1 = 直连**：网关 KV 层确认 prompt caching 在直连形态下生效（cold 0 → warm 4939）。
- **L2 = 主产品线（Studio design lane）的 prompt caching 路径**：同前缀 ×2 直打，
  cold 0 → warm **299,393/299,393 cached**（warm 103 ms）。Sticky lane（`nexus-<sha256(system)>`）按字节前缀路由，
  首字节之外的全部落到同一片 KV。
- **tokens_in=299,393 ≈ digest 的两倍量**：设计车道 `SYSTEM_PROMPT = CANON_PREFIX + SYSTEM_RULES`，
  而这里的用户载荷是空 stub（几 KB）——**本次唯一能撑出 299K 的就是 system**。
  上游对该前缀口径的数归结为 prompt_tokens = 299,393（sticky 字节口径把 system 的字节数放进了 input 账目；
  网关/模型对同一字节前缀的计数口径与我的直逼 estimate 口径差；但 L1 cold/warm 差分说明缓存确实在 KV 层起了作用）。
- **和 150,309（ask lane）的关系**：model/gpt-6.1-terra 对相同 system 的 input 口径随车道路径不同而不同；
  实测值记录原样，不做换算加工（§159）。
- 仍待核验：真实 Studio 设计会话的 cached_tokens 分布（需要在带真实 designIndex 的环境细测；本次探针是 dryRun）。
