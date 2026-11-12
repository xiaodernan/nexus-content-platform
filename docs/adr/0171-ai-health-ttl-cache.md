# ADR-0171：§CACHE-1 ai-service `/healthz` 短 TTL 缓存——跨服务能力探测减负 95%

- 状态：Accepted
- 日期：2026-11-12
- 关联：ADR-0168（真 provider 接通）· ADR-0170（§AILIVE-3 判据纪律）· `apps/web/src/lib/env.ts` · `apps/web/src/server/ai/health-cache.ts` · `apps/web/src/server/ai/client.ts` · `apps/web/test/ai-health-cache.test.ts`

## 背景

用户长期点名「缓存合理运用 + 计网知识 + 数据库/性能优化 + 前后端协同」。真 provider 接通后
（§AILIVE-1~6），`getAiCapabilities()` 成为 5 处调用的能力真值来源：

| 调用点 | 路径 | 频次 |
|---|---|---|
| `/api/ai/run/route.ts:120` | AI 生成主入口 | 每次请求 |
| `characters/[characterId]/chat/route.ts:76` | 角色对话 | 每次请求 |
| `server/ai/submit.ts:36` | 提交路径 | 每次请求 |
| `app/page.tsx:36-37` | 首页渲染 | 每次渲染（已 self-prefetch，走快路径） |
| `isDemoMode()` | DEMO MODE 标识 | 按需 |

除首页已 prefetched 外，**其余 4 处每次都经 `fetchAiServiceHealth()` 真发一次跨服务 HTTP
`/healthz`**（`cache: 'no-store'`、1.5s 超时），只为回答「provider 还是 real 吗」。
这是 pure read，却在每次 AI 写请求的 critical path 上白付一次网络往返。

### 先量：延迟基线（真 ai-service :3200，20 次）

```
P50 = 31.0ms   P95 = 1374.1ms   min = 12.5ms   max = 1374.1ms
```

P50 不高，但 **P95 贴近 1.5s 超时上限**——一次长尾抖动能把整个 `/api/ai/run` 拖慢 1.4s，
纯粹耗在能力探测。缓存的价值由此有了硬数据：把这条长尾从「每次请求都可能踩」压到
「TTL 窗口内只有首请求踩一次」。

## 决定

### 一、缓存放在 `getAiCapabilities` 层，不动 `fetchAiServiceHealth` 语义

新增纯模块 `apps/web/src/server/ai/health-cache.ts`，导出
`getCachedAiHealth(fetchImpl, now, ttlMs)`；`getAiCapabilities` 的**无参数路径**改经它，
**prefetched 快路径（含显式 `null`）完全不动**。

这样切的理由：`fetchAiServiceHealth` 保持「真发一次」的原子语义（既有 `ai-client.test.ts`
不受影响、首页 self-prefetch 不被缓存陈旧值干扰）；4 个热路径调用点自动获得缓存，
一处接线、零调用点改动。

### 二、正确性优先于命中率：四条不变量

1. **失败不缓存**：`/healthz` 不可达 / 抛错 / 契约违约（`null`）时**不写缓存**，下一次调用
   立即重试——provider 刚恢复时不会因陈旧缓存继续误判 DEMO，也不会把请求发给已下线
   service（§159 不静默降级、不编造状态）。
2. **并发去重**：同 tick 的 N 个请求共享同一个在途 Promise（`inFlight`），不惊群各发一次；
   结果（含失败）对所有等待者一致，失败后清空 `inFlight` 供重试。
3. **单调时钟防回拨**：默认 `performance.now()`（单调）而非 `Date.now()`（墙钟回拨会让缓存
   永不过期）；`now` 可注入以精确钉 TTL 边界。
4. **短 TTL 可配**：默认 5s，覆盖「一次 AI 请求周期内 provider 状态基本稳定」，又短到
   provider 故障秒级可见。命中路径开销只是两次数值比较。

缓存的是**成功**的 `HealthResponse`（值语义），不缓存 `null`。

### 三、判据自身被判据守着：9 用例 + 5 变异臂

`apps/web/test/ai-health-cache.test.ts` **9/9**：TTL 内命中不再发 HTTP、TTL 到期重取、
失败不缓存、抛错可重试、并发 5 请求只真发 1 次、并发失败清空在途可恢复、
reset 清成功缓存、reset 连在途一起清、默认 TTL 常量。

变异臂（`.git/cache-mutate.mjs`，临时未提交）逐处改坏 `health-cache.ts`，**5/5 KILLED**：

| 臂 | 变异 | 被哪条用例抓 |
|---|---|---|
| A | TTL 命中改「永不过期」 | TTL 到期重取 |
| B | 失败也缓存 | 失败不缓存 |
| C | 去掉并发去重 | 并发去重 |
| D | 成功不写缓存 | TTL 内命中 |
| E | `resetHealthCache` 不清在途 | reset 连在途一起清 |

**变异臂先抓出两个真问题，均已修实**：① 首跑臂 E SURVIVED——原「reset 清空」用例只验
了清 `entry`、没验清 `inFlight`，是**测试覆盖真洞**，补「未决在途后 reset 能立即重发」用例；
② 补用例后臂 E 仍被判 SURVIVED，根因是**变异脚本的期望锚点漂移**（用例标题改了、
匹配前缀没跟上），修锚后 5/5。executor 沿用 `process.execPath` 直调 `vitest.mjs` + JSON
新鲜生成 + 耗时 ≥400ms + 只认真进 failed 集合的用例标题，防 Windows npx ENOENT 假臂与注释假命中。

### 四、真服务 A/B 实测（同一 ai-service :3200，各 20 连发，计数 fetch 包真实 fetch，预热排冷连接）

```
A 无缓存 ×20: 414.5ms 墙钟 · 底层 /healthz 真发 20 次
B 5s TTL ×20:  12.2ms 墙钟 · 底层 /healthz 真发  1 次

真发往返 20 → 1（省 95%）；墙钟 414.5ms → 12.2ms（快 33.9×）
```

这是服务健康（P50≈31ms）的乐观场景；若某次命中前述 P95=1374ms 长尾，缓存把它从
「每个请求都可能付」降到「TTL 窗口内仅首请求付一次」，改善更大。

## 后果

### 正面

- AI 写请求 critical path 上少一次跨服务往返；健康态墙钟快 ~34×，真发往返省 95%。
- 4 个热路径调用点零改动获得缓存；首页 self-prefetch 快路径语义不变。
- 失败不缓存 + 并发去重 + 单调时钟三条不变量，让「加速」不以「provider 故障可见性」为代价。
- 判据有独立单测 + 5 变异臂守着，且变异臂真抓出并修实了两个自身缺陷。

### 诚实边界 / 未解决

- **5s 是折中不是真理**：窗口内 provider 若恰好从 real 掉到 unavailable，web 最多滞后
  <5s 才在下次探测发现；但 `/api/ai/run` 真调 `runAiService` 时 service 不可用会直接报错
  （`result.ok=false` → 503），**不会**因缓存把失败请求伪装成成功——缓存只影响「能力标识」
  与「是否进入真 provider 分支」，不影响真调用的失败传播。
- **进程级单例，非分布式**：多 web 实例各自缓存一份，不做 Redis 共享。单实例部署下收益
  已兑现；多实例时每实例省 95%，只是总往返 = 实例数 × (1/20)。用 Redis 做跨实例失效
  是后继（真 Redis 全套待干净窗口），本片刻意不引入外部依赖，保持零基础设施增量。
- **prefetched 快路径不受缓存保护**：首页每次渲染仍真发一次（它本来就该拿最新状态画首屏），
  不在本片收益范围。
- `env.test.ts` 因缓存单例跨用例泄漏，加了 `afterEach(resetHealthCache)` 隔离——这是测试
  适配新增单例状态的必要改动，未弱化任何判据（原 6 用例断言全保留）。
- 真 Redis / 真 MQ 全套、墙钟压测（并发 N 请求下的 P99）、未 push。

## 协作面

开工 HEAD `2d0b4789`（并行会话已提交 §AILIVE-6 `live:all`，含本片无关的
`package.json` / `scripts/live-all.mts`）。本片只碰 `apps/web/src/lib/env.ts`、
新增 `apps/web/src/server/ai/health-cache.ts` + `apps/web/test/ai-health-cache.test.ts`、
改 `apps/web/test/env.test.ts`，与并行 AI-live 脚本链正交、不碰 `package.json`。
工程门：`tsc -p apps/web` 0 / eslint 4 文件 0 / AI 集成回归 103/103。精确 stage、
避 `.next-dev-archives/`/`test-results-mine*` 与 `.git/` 临时臂；文档只追加。ADR 0171（0170 已占）。
