# 撞库 robustness 演练 · evidence（2026-11-19 · cont.357）

> 用户总指令 §十一：「在长久持续开发的同时，做压力测试：模拟海量用户、高并发、瞬间大数据量去冲击系统（比如撞库之类的场景）。测试系统的高并发、高可用、容灾能力、鲁棒性，看系统会不会崩溃、能不能容纳大量用户和数据流。」
> 本轮针对最暴露的公开入口：`/api/insight/login`（洞察台口令 123 · 任何人可进）做撞库场景实测。

## 实测（web on `127.0.0.1:3461` · prod build · Redis db=3 滑动窗口）

```
A  预热 1 条错误口令  → 401 {"ok":false,"error":"wrong-password"}            (22 ms)
B  连续 34 条错误口令  → 401 × 29（第 30 次起） → 429 × 5
   first 429 at attempt #30 · retryAfterMs≈297,905（≈5 分钟窗口）
C  锁定期内打真口令 123 → 429 {"ok":false,"error":"rate-limited"} (6 ms)
D  未认证 POST /api/admin/moderation/assist → 403 {"error":"forbidden"}（复核助理只对审核员开放）
E  GET /admin/observe → 200 · 含「观察站」字样（只读口令 123，公开文档明确"不给它包装成安全边界"）
```

计数总账：3 阶段穷举 35 次 → **29 次放行并如实回 401（不泄露是否接近正确）· 6 次被限（429）**。30/5min/IP 滑动窗口按设计生效，valid 口令同样被锁（防爆破设计语义一致，如实记录）。

## 意外发现 & 修复（同日顺带）

演练中发现 web 进程所有 DB 页面 500（`/admin/observe`、`/api/admin/*`）：根因是三个配置漂移：
1. `apps/web/.env.local` 的 `NEXUS_AI_SERVICE_URL=http://127.0.0.1:3212`——**指向一个根本没跑 ai-service 的端口**。页面只会安静地退回 DEMO MODE（§160 诚实，但用户会以为系统弱）。已改为 `:3200`（uvicorn 实跑口）。
2. `NEXUS_DATABASE_URL` 缺失 → 回落到代码默认 `localhost:55433`；而 **55433 落进 Windows Hyper-V 保留端口段 `55379–55478`**（`netsh int ipv4 show excludedportrange protocol=tcp` 可见），`nexus-postgres` 容器无法绑定该段——它已退出 3 小时，数据已迁移到 `nexus-postgres-alt`（同一 `nexus-pgdata` volume · TCP `5443` · 数据库/用户 `nexus` · 口令 `nexus_dev_only`）。已为 web 显式配置 `NEXUS_DATABASE_URL=postgres://nexus:nexus_dev_only@localhost:5443/nexus`；并跑 `ALTER DATABASE nexus REFRESH COLLATION VERSION` 消掉 2.36→2.41 排序规则错位。
3. 修复验证：moderation assist 未认证 **500 → 403 forbidden**；`/admin/observe` **500 → 200**。

维护备忘（环境侧）：`nexus-postgres`（exited，55433）与本机保留端口冲突，**不要再把它拉起来占用保留段**；`nexus-postgres-alt`（5443）是本机现行 NEXUS dev DB。`netsh` 保留段扩容/重启后可能变化，如改端口请同步 `.env.local`。

## 不做的事（诚实边界）

- 本演练只覆盖 `insight/login` 一个入口；其余写入入口（`auth/register` 等）限流逻辑在 `rateLimit.ts` 同一实现，不逐一复跑；
- 公网侧 X-Forwarded-For 伪造导致按 IP 分桶失效的风险已在 ADR-0070 记录（取右端 trusted hop 口径）；
- Redis 限流窗口为 5 分钟滑动（`insight/login`），lockout 期间真用户也进不去——这是防爆破语义的直接推论，产品层如需豁免应走「口令 + user-id 双闸」而不是放宽 IP 限。
