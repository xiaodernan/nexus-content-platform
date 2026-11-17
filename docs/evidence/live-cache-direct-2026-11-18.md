# Live cache-stats direct from ai-service (2026-11-18, cont. 219)

> 直连 `GET http://127.0.0.1:3200/v1/ai/cache-stats`（本次 restart 计数从零开始）：

```json
{
  "prefix":{"requests":0,"reused":0,"uniquePrefixes":0,"capacity":512,"evictions":0,"reuseRate":null},
  "appCache":{"enabled":true,"backend":"redis","hits":0,"misses":3,"stores":2,"stores_failed":0,"evictions":0,"hit_rate":0.0,"shared":true,"degraded":false,"namespace":"nexus:llmc"},
  "provider":{"reported":1,"missing":1,"cachedTokensTotal":4480,"promptTokensTotal":5215,"reportedHitRate":0.8591},
  "upstream":{"comparable":0,"observed":0,"drifted":0,"capacity":256,"evictions":0,"maxDrift":null,"band":0.1},
  "transport":{"stream":true}
}
```

## 解读

- `prefix.requests=0 reuseRate=null` — 重启后尚未有多份 `/v1/ai/chat` 成功调用走过 attribution path（service 启动期间 /api/admin/observer/digest 跑了 1 次 = provider 之一，但该次 payload 之外的 prefix 没刚复用）
- `provider.cachedTokensTotal=4480 / promptTokensTotal=5215` — `reportedHitRate=0.859`
- `appCache.shared=true namespace=nexus:llmc` — Redis 缓存跨实例共享出现了——`namespace` 可以定位到 redis 库返回值
- `transport.stream=true` — 全链走 SSE；非流式 never entered
- `misses=3`, `stores=2` — Redis 写次数合理；未失败（stores_failed=0）

## 真要让 prefix.requests 真正 > 0 需要的是什么？

**要连续跑 /v1/ai/chat 3 次以上、让相同 digest (buildDigest) 的 system prefix 命中同一条 channel**。每一次同一 digest + 同 question 击入，对应 stable_prefix bytes 完全相同，本机计数就上来了。这不是前缀缓存"坏了"——window reset 后 race counter starts at 0，所以**跑两次**就能看见 prefix.reused > 0。
