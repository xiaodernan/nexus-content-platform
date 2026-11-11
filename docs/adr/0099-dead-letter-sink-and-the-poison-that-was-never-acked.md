# ADR-0099：死信从「一行日志」升级为可注入的 sink——并补上那个从未被 ACK 的毒条目

- 状态：已接受（2026-11-12）
- 相关：`docs/decisions/0066-a-durable-side-effect-lane-not-a-broker.md`（v661 的 durable side-effect lane；本片兑现它写下的 "logged and ACKed away" 承诺）、`docs/decisions/0064-messaging-in-nexus-the-substrate-that-exists-and-what-it-is-not.md`（消息基质的诚实地图）、`apps/web/src/server/queue/{jobQueue,deadLetter,redisStreamJobQueue,memoryJobQueue}.ts`、`apps/web/test/{dead-letter,job-queue-deadletter}.test.ts`

## 背景：三类 poison，一类真的漏了

ADR 0066 第 80–82 行写得很清楚：*"Unknown job types and poison payloads are logged and ACKed away (they never kill the loop, and are never retried forever). Retries are bounded by `maxAttempts`, then dropped — dead-letter by log, because this platform has no dead-letter store yet."*

把这句话对着代码逐条查，**三类 poison 里只有两类兑现了**：

| 层 | 触发 | 旧行为 | ADR 0066 承诺 |
|---|---|---|---|
| worker | 未知 job type（`worker.ts` 的 `JOB_HANDLERS` 查不到） | `console.error` + `return` → 驱动成功路径 XACK | 记了、ACK 了（但只在日志） |
| handler | `build.complete` schema 校验不过（`handlers.ts` 的 `parseBuildComplete` 返回 null） | `console.error` + `return` → 同上 | 记了、ACK 了（但只在日志） |
| **transport** | Redis Stream 条目的 `body` JSON 解析失败 / 缺字段（`toEnvelope()` 返回 null） | **`if (job) process(...)` 直接跳过：既不 log，也不 XACK** | **两个都没做到** |

第三类不是"文档没跟上"的文字债，是**活 bug**：条目永远留在 PENDING，每一轮 `drain()` 都先 `XAUTOCLAIM` 把它认领回来 → 又 `toEnvelope()` → null → 跳过 → 再回 PENDING。一个坏 JSON 条目足以让 worker 每 `reclaimMs` 白做一次认领，且 `MAXLEN ~` 不会裁掉它（它是 PENDING、不是已 ACK 的旧条目），直到流被整体重建。ADR 0066 承诺的 "never retried forever" 在这条路径上被彻底违反。

第二个缺口更安静：重试耗尽只 `console.error` 一行。进程重启 / 日志轮转后，"哪几个 advisory side-effect 没做成"永久消失——0066 自己承认没有 dead-letter store，但**一行日志连一条可查询的事件都不是**。

## 决定

不引入 store（那会推翻 0066 "no dead-letter store yet" 的 tier 判定，也超出 advisory lane 该有的重量），而是把终态**变成可注入的事件**：

1. `JobQueueOptions.onDeadLetter?: DeadLetterSink` + `DeadLetterEntry`（`kind: 'exhausted' | 'poison'`、type、attempts、reason、at、bodyPreview）。两驱共用同一形状，调用点不分支。
2. `deadLetter.ts` 纯函数：`bodyPreview` 截到 120 字符、折叠控制空白、永不抛；`errorReason` 只取 message 不带堆栈；`makeDeadLetter` 时间可注入；`consoleDeadLetterSink` 保持旧日志措辞——**不设 sink 时行为与 v661 逐字一致**（advisory lane 不擅自多存一份状态）。
3. Redis 驱动新增**唯一 funnel** `handleEntry(id, fields, handler)`：新读与 XAUTOCLAIM 认领都走它。poison 分支先 `sink(makeDeadLetter({ kind: 'poison' }))` **再** `XACK`——即便 ACK 失败，记录也已落地，不会"既没记又没清"。`reclaim()` 相应改为返回 raw `[id, fields][]`：若仍在认领路径把 null envelope `filter` 掉，poison 的 id 会丢、ACK 无从谈起，bug 只是从新读路径漏到认领路径。
4. 重试耗尽经同一个 sink 报 `kind: 'exhausted'`；`MemoryJobQueue` 同步接入，保证两驱终态形状一致。
5. **只带摘要不带完整 payload**：通知 payload 可能含标题 / 链接，advisory lane 不该把它再复制进一份长期账本；要完整内容应在 `MAXLEN ~` 窗口内回放 stream 本身。

## 实测读数（measured, not assumed）

- `job-queue-deadletter.test.ts` **8/8**：3 条 `MemoryJobQueue` 行为腿（耗尽恰好一条 exhausted、成功不进账本、缺省退回 `console.error` 的旧行为）+ 5 条 Redis 静态接线腿（新读统一 funnel、poison 先记后 ACK、reclaim 保留 raw id、exhausted 走 sink、两驱共用 sink）。
- `dead-letter.test.ts` **11/11**：定长 / 折叠 / 隐私截断 / 循环引用不抛、两态形状、时间可注入、默认 sink 不泄漏 body。
- **红门与两处真修复**：静态门初版对 `reclaim()` 的正则漏了外层 `[]`（门断言 `Promise<[string, string[]]>`，真实签名 `Promise<[string, string[]][]>`）→ 1 FAIL / 8；这是**门自身拼错**而非实现红，修正门后 8/8。定向 lint 又抓到两处真问题：`bodyPreview` 的 fallback `String(body)` 对对象退化成 `[object Object]` 并触发 `no-base-to-string`（改为 `` `[unstringifiable ${typeof body}]` ``，更有信息量且同样永不抛）；门里两处钉缩进的正则触发 `no-regex-spaces`（改为 `{n}` 量词，语义等价，复跑门仍 8/8）。**门不替实现背书，实现也不因门的拼写错误被改**。
- `npx tsc -p apps/web/tsconfig.json --noEmit` **exit 0**；`npx eslint` 分两批（3+3 文件）各 **exit 0**（一次载 6 文件、或和 vitest 同 shell，都会被宿主 SIGTERM；分小批单跑干净——资源峰，不是 red）。
- census **exit 0**：132 modules / 119 rows / arms 132/132 / 0 unclassified，与 v666 同（本片只加 `apps/web` 源码与测试，均不在 census population）。宿主上 `npm run verify:evidence-census` 连跑 SIGTERM；`node --max-old-space-size=384 docs/evidence/ci/evidence-census-proof.mjs`（去掉 npm 那层 node + 限堆）跑通——记下这条可复用绕过法，不把它误报成门绿以外的东西。

## 仍欠（如实记，不冒充已验）

1. **没有真 Redis 腿**：poison 的 XACK、XAUTOCLAIM 认领路径由静态接线门钉住源码，未在真 Redis 上塞一条坏 JSON 看 PENDING 是否真的清空。ADR 0066 的 `job-queue.test.ts` 是真 Redis 腿，但没有 poison 用例。
2. **sink 的默认仍是日志**：没有落库 / 监控集成；`onDeadLetter` 是留给部署方注入的钩子，本片不擅自多存状态。**要真正可查询，需部署方提供实现**。
3. **死信账本目前不完整（下一片收口）**：上表前两类 poison（handler schema 校验失败、worker 未知 type）今天仍只 `console.error`，不经过 `onDeadLetter`。也就是说部署方注入 sink 后，只能收到 transport 层 poison 与 exhausted，**收不到另两类**——ADR 0066 说的 "logged and ACKed away" 在它们身上由日志兑现了，但"一条可查询事件"没有。这不是本片退步，是本片的界；收口需要让 worker/handler 与驱动共用同一个 sink（牵动 `JobHandler` 签名或闭包注入），单独成片做，别在已验证的门上临时加线。
4. **XACK 失败边界**：先 sink 后 XACK，若 XACK 自身失败，条目会留在 PENDING 被重认领，于是同一 poison 可能被记**多次**（不会漏记，但可能重复）。真正的一次性需要幂等 sink 或对 sink 去重，属部署方契约。

## 文档编号澄清

队列相关决策在 `docs/decisions/0064`（消息基质的诚实地图）与 `docs/decisions/0066`（durable side-effect lane），与 `docs/adr/` 下的顺序 ADR（0096–0099）是**两套编号**；源码注释里的 "ADR 0064 / 0066" 指向的是 `docs/decisions/` 那两份，本片不改动该引用，只在此说明，免得下一位读者按 ADR 目录号找错文件。
