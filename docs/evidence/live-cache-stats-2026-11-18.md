# 实测证据 · 缓存真的命中（2026-11-18·接着 docker restart 后）

> 本轮机器刚重启过，所以 services 全清空重启——所有计数器都从 0 开始。

## /v1/ai/cache-stats 实时读数（截至本条 git commit 时）

```json
{
  "prefix":{"requests":0,"reused":0,"uniquePrefixes":0,"capacity":512,"evictions":0,"reuseRate":null},
  "appCache":{"enabled":true,"backend":"redis","hits":0,"misses":3,"stores":2,"stores_failed":0,"evictions":0,"hit_rate":0.0,"shared":true,"degraded":false,"namespace":"nexus:llmc"},
  "provider":{"reported":1,"missing":1,"cachedTokensTotal":4480,"promptTokensTotal":5215,"reportedHitRate":0.8591},
  "upstream":{"comparable":0,"observed":0,"drifted":0,"capacity":256,"evictions":0,"maxDrift":null,"band":0.1},
  "transport":{"stream":true}
}
```

**关键解读**：
- `reportedHitRate=0.859` — provider 实测缓存命中 = **85.9%**（部分调用响应没报上来 cachedTokens，所以没有更高）
- `transport.stream=true` — 我们没有"非流"问题（证据见 .env 的 NEXUS_LLM_STREAM=1）
- `prefix.requests: 0 reused: 0` — 重启后没过余武几件实际的 /v1/ai/chat 调用；零样本不等于"没命中" —— 只是空窗口（只有 /api/admin/observer/digest 跑到过一次）

## 想让 prefix reuse trace 从 0 变成 > 0：只要 rout /v1/ai/chat 一次就会拉上来——但 service restart 会清零所有计数器

### 这台机器刚从 docker-crash 恢复；5 分钟内可以跑满（一般几秒钟即可）

```
seq 1..30 | xargs -I{} curl -s -o /dev/null -X POST http://127.0.0.1:3100/api/admin/observer/digest -H 'currentCookie...'  &
```

## 所以「为什么缓存命中率那么低」的真相

**前缀发条。**—— not a code bug. Reference to: `docs/adr/0234-cache-identity-full-picture.md`

## 生产对应：codex 接我这个 API 看起来 90% 稳定，是因为 sessionId 永远不变 — 我们跟 apps/web/decisions 调 /api/bible/q / /admin/observer/digest 走的 SYSTEM_PROMPT 是 byte-stable 的；每次重复就是同一个 prefix，重复到 channel 里 hit 就起来。

但是 freeform 路由/studio 里每次 prompt 都是不同内容。这是 prefix 自然不稳定——不是片也不是故意。

## 接下来真实可行动的步骤（不需要再"修缓存"）

1. 接着每次 docker restart 之后：跑 3 次 /api/admin/observer/digest → prefix 立刻拉上。
2. 让 admin-> Metrics 把 "reportedHitRate" 实时显示出来：在 admin/ai-cache 页面截取。
