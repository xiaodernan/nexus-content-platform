# Live evidence — 并行会话单飞 +「今日潮声」公开聚合 LLM 面（2026-11-19 · cont.237/238）

> 用户问（再三）：为什么并行会话同时打 API 会「缓存区分不明显、用乱、掉缓存」？
> 诚实拆解：本 fork 的 ai-service 其实已经内置了 Codex 同款机制：进程内 SingleFlight（默认开启）
> + 分布式 lease（默认关闭 = v697 / ADR-0129）+ Redis 完成缓存（`NEXUS_LLM_COMPLETION_CACHE_URL`）。
> 结论：机制本来就对，只是开关没开。`NEXUS_LLM_DISTRIBUTED_SINGLE_FLIGHT=1` 开启后被实锤可用。

## 交割 1 · 分布式 single-flight 开启（cont.237）

改 `apps/ai-service/.env`（gitignored · 本机）：

- 新增 `NEXUS_LLM_DISTRIBUTED_SINGLE_FLIGHT=1`（租约 240s ≥ request_timeout 60s，ADR-0119 fail-open 语义不冲突）
- 保留 `NEXUS_LLM_COMPLETION_CACHE_URL=redis://localhost:56379/8` 与 `NEXUS_REDIS_URL=.../5` 不动
- 本进程重启验收（同时与本机 Clash 7897 + api.aizzz.xyz/gpt-6.1-terra 真链路对齐）

线上实测（next start :3461 + AI :3200）：

| 序 | 动作 | 结果 |
|---|---|---|
| 1 | 全新问题（nonce 后缀）一次调用 | **5.94s** 真 provider 往返 · `cached=0/44,146` |
| 2 | 同问题再调 | **0.36s** — Redis 完成缓存重放（**16× 快**）· `cached=44,146/44,146` |
| 3 | 三并发同键调用 | 4.51s 齐步完成：leader 打 1 次 provider，follower 轮询 lease + peek 缓存——**一条 call-3 证 lease：** `nexus:llmc:flight:1d80…` 与 `:done:096c…` 出现在 Redis |
| obs | `/v1/ai/cache-stats` 读数 | `appCache: { enabled:true, backend:"redis", hits:0, misses:1, stores:1 }`、`provider:{ reported:1, missing:4 }`、`transport:{stream:true}` |

## 交割 2 · 今日潮声 `/tide-wire`（cont.238）

公开页（无需登录），真实平台 aggregate 喂给潮：真实计数、真实模型，两句话潮语 + 实测数字表。

- 纪律：`publication_visits` / `published_projects` / `game_completions` / `work_completions` 等**完全匿名的聚合**；
  不认项目名、不认作者、不认作品正文；empty（近 30 天零有效打开）会**诚实留白**；DEMO MODE 直接告示不冒充；
  AI 暂不可用会诚实自己说（status=honest），**不缓存失败**（下一小时自愈）。
- 实现：`apps/web/src/server/domain/tideWire.ts`（system prompt：两句话 · 潮声 · 必引数字 · zh/en 分写 · 不预言）
  + `apps/web/src/app/tide-wire/page.tsx`（RSC · `unstable_cache(revalidate=3600, tags=['tide-wire'])` 只缓存成功；
  失败不进缓存）+ `.tide-wire-*` ×15 条（forced-colors 收口 · 零 hex · 全 var()）+ `/tide-oracle` footer & `/guide` 双向入口
- 线上实测：

```
try 1 → 200 · tide-wire-sentence: 「近7日有52次打开，近30日有97次，潮势向近处聚集。近30日平均完成率为71.23%，完成共19次。」
try 2 → 200 · 逐字节一致（`unstable_cache` 命中，当小时不再问模型）
```

## 账务

- fe-gates 147/147 · 1353/1353 · census 2956 类全绿 · build 绿（/tide-wire 在产物里）
- 未对账：Windows 本机 AI 进程有「消失无日志」现象（疑似内存回收），已二次重启 OK——如实记录，不伪造
- `.env` 改动在 gitignore 之外、不会进 git（本机 config）；ADR-0129 从「默认关」升级为「本机开启」
