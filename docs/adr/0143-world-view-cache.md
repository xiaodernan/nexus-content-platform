# ADR 0143 — 世界文档读路径的 30 秒共享缓存（v710）

- 状态：ACCEPTED（2026-11-14）
- 范围：`apps/web/src/server/cache/worldViewCache.ts`、`apps/web/src/server/domain/worlds.ts`
- 前置：ADR 0076 / 0028（Redis 有界共享）、v670 / ADR 0102（discover 失效总线）、`discoverRedis.ts`（同一驱动形状）

## 背景

`loadWorld()` 是每个世界读路径的必经之路（步行 / 星图 / 编年 / 回廊 / 图志 / Studio 面板 / 知识同步），
每次都跑：一次 SQL（`worlds` 按 `updatedAt desc limit 1`）+ zod（`WorldDocumentSchema.safeParse`）
+ `validateWorld()`（结构完整性）。世界文档是文字为主的小文档，**写频率**（一次 PUT）远低于**读频率**
（每次页面/接口都问）。此前没有任何缓存——/world/* 每次请求都重新付一遍同样的账。

## 决定

1. **缓存的是校验后的 `WorldResult`**（含「没世界」= `null` 这一答案），不是 SQL 行——命中时
   zod 与 validateWorld 直接跳过；驱动分两档：`NEXUS_REDIS_URL` 设了 → Redis（共享键，
   `nexus:world-view:v1:<projectId>`，`PX 30000`），否则 → 进程内 `TtlLru`（64 条上界 + 30s TTL）。
2. **写路径即刻 DEL 键**（`saveWorld` 的两个落点：insert 成功、`applyWorldUpdate` 成功）——
   旧文档没有复活窗口；fixture/直连 SQL 的写不走这条路，30s TTL 是它们的上界（写在注释里，不装作没有）。
3. **Redis 故障 = miss，不是异常，更不是错答**：`get` 返回 `undefined`，读端自己重算；
   `set`/`del` 静默放弃；`driver()` 如实报 `redis-unavailable`。不退回内存、不静默降级。
4. **键里没有任何用户信息**：缓存的是「这份世界长什么样」，不是「你能不能看」；
   可见性（`projectVisibleTo`）在调用方先行判定，与缓存正交。
5. **不做 single-flight / generation 守卫**：discover 那份为全站最热 anon 路径而造；
   世界读 miss 最多多算一次，工程复杂度不划算；写后 DEL 已封住正确性。
6. **契约版本在前缀里**（`v1`）：契约破坏性变更 = 改前缀、自动换代，不做键迁移。

## 验证

- `apps/web/test/world-view-cache.test.ts`：7/7 绿（miss→store→hit 只算一次；
  null 答案可缓存可 DEL；DEL 后必回未命中；盘面 30s 钉死；Redis 不可达时 get/set/del 全部 resolve、
  driver=redis-unavailable；worlds.ts 两落点 DEL 的静态门）。
- `tsc --noEmit` 0；对三个改动/新文件直跑 `eslint` 0。
- 本机 dev server（Turbopack，3101）登录 fixture 后三个世界页（memories / chronicle / atlas）
  全部 200，内容如常——缓存接入对读路径无感。
- fixture 播种/直连 SQL 写在途时，新鲜度上界 30s（契约数字即此）。

## 仍欠（诚实记录）

1. **没有跨实例 Local-Copy**：Redis 驱动每次 get 都问共享键——多实例部署里没有 N 倍放大，
   但也没有 0 次。够用：读是毫秒级 Redis GET。
2. **没有命中率导出到 /healthz**：本 ADR 不扩可观测面；若生产化需要，走一次 admin/observability 的
   独立评审（那是给所有共享缓存统一出口的机会，不是给本缓存开小灶）。
3. **知识同步（`syncProjectKnowledge`）在写后照旧执行**——缓存不覆盖知识派生物，那条链路不动。
4. 直连 SQL 写 fixture 后页面最多 30s 看到旧文档——这是本缓存的已知边界，fixture 维护者应知。
