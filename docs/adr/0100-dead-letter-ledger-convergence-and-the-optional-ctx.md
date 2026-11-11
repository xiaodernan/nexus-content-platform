# ADR-0100：死信账本收口——用可选 ctx 汇入两类静默 poison，默认路径零开销

- 状态：已接受（2026-11-12）
- 相关：`docs/adr/0099-...`（v667 立下、本片闭环的仍欠③）、`docs/decisions/0066-...`（durable side-effect lane 的原始承诺）、`apps/web/src/server/queue/{jobQueue,deadLetter,handlers,worker,memoryJobQueue,redisStreamJobQueue}.ts`、`apps/web/test/dead-letter-convergence.test.ts`

## 背景：注入了 sink，账本却仍是残缺的

v667 把 `onDeadLetter` sink 接到了**两类**终态：transport 层 poison（`toEnvelope()` 返回 null）与重试耗尽（`kind: 'exhausted'`）。但 ADR 0099 的「仍欠③」如实记下：一个部署方若真的注入了 sink，拿到的账本**仍不完整**——还有两类 poison 只写现场日志、从不进 sink：

| 类别 | 判定点 | v667 行为 | 后果 |
|---|---|---|---|
| handler schema 失败 | `handlers.ts` 的 `buildComplete` → `parseBuildComplete()` 返回 null | `console.error` + `return` | ACK 正确，但账本里没有 |
| worker 未知 type | `worker.ts` 的 dispatch → `JOB_HANDLERS[job.type]` 查不到 | `console.error` + `return` | ACK 正确，但账本里没有 |

两类都是「返回不抛 ⇒ 驱动 XACK」，所以**从不卡 PENDING、从不无限重试**——行为本身是对的，缺的只是「可被部署方观察」这一环。日志轮转后这两类静默失败就消失了，恰是 v667 想消灭的问题的另一半。

## 一个必须守住的反面：不能为了收口改坏默认行为

v667 的硬承诺是「不注入 sink 时行为与 v661 **逐字一致**」。最诱人的收口法是让两类判定点无条件 `consoleDeadLetterSink(...)`——但那会把 v661 原有的两行现场日志换掉，且给**每一次**正常派发都凭空构造一条 `DeadLetterEntry`。对一个默认关闭、advisory 性质的 lane，这是不可接受的静默开销与行为漂移。

## 决定：可选 `ctx` 通道 + dispatch 纯函数化

1. **`JobHandler` 升为双参** `(job, ctx?: JobHandlerContext)`，`JobHandlerContext` 只暴露一个 `reportDeadLetter(entry)`。`handlers.ts` 本地导出的同名 `JobHandler` 同步升为同构双参，两处定义结构一致（tsc 验证通过）。
2. **两驱条件式构造 ctx**：`this.ctx = custom ? { reportDeadLetter: custom } : undefined`，其中 `custom = options?.onDeadLetter`。**缺省时 `ctx` 恒为 undefined**；两类判定点用可选链 `ctx?.reportDeadLetter(...)`，于是默认路径连 `makeDeadLetter` 都不调用、不分配，v661 现场日志逐字保留。既是行为零漂移，也是热路径零分配（OS/硬件层面的实在收益：一个高频循环里少一次对象构造与字符串拼接）。
3. **两类判定点各补一行 report**：都**先保留**原 `console.error` 现场日志，**再**在 ctx 存在时报告一条 `kind: 'poison'`。ACK 语义一字未动——仍是「返回不抛 ⇒ 驱动 XACK」。自定义 `reason`（`schema validation failed` / `no registered handler for job type "…"`）走新增的可选 `makeDeadLetter({ reason })` 参数，不为其捏造 Error 对象；不传时 v667 的默认分流一字不变。
4. **dispatch 从闭包提出为导出纯函数 `dispatchJob(job, ctx, handlers, stats?)`**：这不是为测试而测试——它让「一个作业怎么分派、三类 poison 往哪去」第一次可以被**纯内存真实行为腿**验证，而不必起 queue、连 Redis、碰 `globalThis` 单例。`startJobWorker()` 退化为一行 `.start((job, ctx) => dispatchJob(job, ctx, JOB_HANDLERS, s.stats))`，生产路径与被测路径同源，不存在「测的是副本、跑的是另一份」的漂移。
5. **一个 sink，三类 poison 汇流**：transport（驱动内 `this.sink`）、schema（handler 内 `ctx`）、unknown type（dispatch 内 `ctx`）——当部署方注入同一个 `onDeadLetter` 时，两驱的 `ctx` 就是那个 custom sink 的薄封装，三路记录形状同为 `DeadLetterEntry`。

## 实测读数（measured, not assumed）

- `dead-letter-convergence.test.ts` **13/13**：4 条纯内存行为腿（unknown type 进 sink 且不抛 / schema 失败进 sink 且 emit 未调 / 合法 payload 不进 sink 且 stats 正确 / handler 抛错 rethrow 且**不误报 poison**，保住 v661 retry 语义）；2 条默认行为门（ctx undefined 时现场日志逐字保留、两驱条件式构造 ctx）；4 条静态接线门（start→dispatch→handler 的 ctx 透传、两驱 `await handler(job, this.ctx)`、三类 poison 判定点汇流、旧内联分派已消失）；3 条 `makeDeadLetter({ reason })` 门（覆盖默认、reason 胜 err、不传时 v667 分流不变）。
- **回归 4 文件 35/35**：`dead-letter.test.ts` 11 + `job-queue-deadletter.test.ts` 8 + `job-worker.test.ts` 9 + `job-queue.test.ts` 7（其中 **5 条真 Redis 腿此刻实跑通过**——XREADGROUP 投递、重试、XAUTOCLAIM 认领并 XACK、`MAXLEN ~` 裁剪、驱动选择，证明 dispatch 重构没打断真实 transport）。
- `npx tsc -p apps/web/tsconfig.json --noEmit` **exit 0**（双参 `JobHandler` 两处定义结构兼容正是它验的）。
- **变异臂 + 反向对照 14/14**（纯内存：读真源码字符串副本、变异、复刻门判定，不写生产文件）：9 个断臂全被精确抓住——start 退回内联、dispatch 不透传 ctx、两驱不透传、ctx 无条件构造（默认行为漂移，最隐蔽的一臂）、未知 type/ schema 报告被摘、v667 transport sink 被改断、`JobHandler` 退回单参；4 个合法对照全绿（只加注释、改 poison reason 文案、改现场日志级别与文案、给记录加 `at` 字段）。证的是门分辨"真回归 vs 无害改动"的能力，不重跑 vitest。
- **一次被纠正的环境归因（值得写下来）**：本片中途宿主变紧，连 `node -e`、单文件 `npx eslint`、
  乃至 `npx eslint` 3 文件批都被 SIGTERM，一度归因为"物理内存峰"。但 `node --max-old-space-size=384
  eslint` 报出真 **JS heap OOM**（`Reached heap limit`，非宿主 kill），揭示根因是 **node 默认 heap 上限
  不够载整个 TS type graph**，与文件数无关。把堆提到 `--max-old-space-size=1536` 后：单文件 **exit 0**、
  **7 个 v668 文件一次全扫 exit 0**。所以 SIGTERM 里混着两类——宿主峰是一个，node heap 默认上限是另一个；
  后者用足堆直调 `node_modules/eslint/bin/eslint.js` 就解了。这是 v667「拆 3+3 小批」经验的上位替代：
  对这类载 type graph 的门，**给足 heap 比拆批更对因**。
- **census 仍欠（如实记）**：`node --max-old-space-size=1536 evidence-census-proof.mjs` 仍 SIGTERM——它在
  主堆之外还 spawn 子进程做 30s specifier scan，宿主此刻扛不住子进程峰，足堆也架不住。SIGTERM = 资源峰，
  **不是 census 门红**。静态不漂移可证：census population 只含 `git ls-files -- docs/evidence` 与 `verify:*`
  命令集合（`evidence-census-proof.mjs` L10/L14），本片只新增 `apps/web/test/dead-letter-convergence.test.ts`
  与 `docs/adr/0100`，均不在 population，也未改任何 `verify:*`；上次实测读数 132 modules / 119 rows /
  arms 132/132。提交前若宿主缓解再试一次，仍不过则如实记为仍欠，不谎称本机 census 已绿。

## 仍欠（如实记，不冒充已验）

1. **census 因宿主子进程峰未取到绿读数**——见上（足堆主进程仍被其 spawn 的子进程拖垮）。eslint 已用足堆直调取到 **7 文件 exit 0**；tsc exit 0、两轮 vitest（13 + 35）在同样宿主下跑通。census 的不漂移有静态证明（population 未变），补跑是纪律问题，不是未知风险。
2. **没有对 `onDeadLetter` sink 做真 Redis 端到端行为腿**：三类 poison 汇入同一 sink 的**行为**只在内存驱 + dispatch 纯函数上验证；Redis 侧 transport poison 走 `this.sink`、schema/unknown 走 `ctx`（同一 custom），静态门钉住三者同源，但「一个真 Redis 条目 → 一条账本记录」的整链未在真 Redis 上打过。这与 ADR 0099 仍欠①同源。
3. **sink 仍无持久实现**：`onDeadLetter` 是部署方钩子，默认回退 console 日志；本片不擅自给 advisory lane 引入一张库表或外部系统。真正「可查询账本」需要部署方注入落库/监控实现。
4. **XACK 失败的重复记录边界**沿用 ADR 0099 仍欠④：先 report 后 ACK，ACK 失败重认领会重复记（不漏但可能重），exactly-once 要幂等 sink，属部署方契约。

## 与 v667 的关系

本片是 ADR 0099「仍欠③」的正面闭环，不是推翻：v667 的 `DeadLetterEntry` 形状、`consoleDeadLetterSink` 回退、`handleEntry` 的 poison-first-then-XACK、generation/单飞等一概未动；只是在**判定点的覆盖面**上补齐了 v667 当时明确留给下一片的两类。默认行为、ACK 语义、两驱同形状三条不变量全部保持。
