# ADR-0150：结清 §MQ-2 账本文案欠账——出站拒发不甩锅线路，`errors` 是合并总账

- 状态：已采纳（2026-11-12，§MQ-3，承接 ADR-0126 §仍欠 / ADR-0149 §诚实边界第 5 条 / ADR-0115 诚实读数家族）
- 关联：ADR-0149（§MQ-2 给 `errors` 引入"出站超界拒绝"新子类，留下"注释+面板文案同步"欠账）、
  ADR-0126（§MQ-1 把 `applied` 收紧为"至少一次成功处置才记"，但字段注释仍写旧"消息处理回调数"）、
  ADR-0115（没接上绝不画四账 0 / null≠0）、ADR-0127（"配了"与"连着"分开说，同一"读反就撒谎"家族）、
  `apps/web/src/server/domain/invalidation-bus.ts` / `apps/web/src/app/admin/discover-cache/discover-view.ts` /
  `apps/web/src/app/admin/discover-cache/DiscoverPanel.tsx` / `test/invalidation-bus-ledger-wording.test.ts`（本片改动）
- 触发（user 长期点名）：**诚实账本 + 前后端协同 + 缓存可观测**。

## 背景（先量再治：欠账里藏着一句**已经在说谎**的话）

§MQ-2（ADR-0149）让 `InvalidationBusStats.errors` 多了一类「**本机出站超界拒绝**」——超界/坏 id 的帧
根本没让上线路，对端没丢任何东西。但探查 + 读码坐实三处欠账，其中一处不是"未细化"而是**正在说谎**：

1. **（已在说谎）** `discover-view.ts` 的 `busTag`：`errors>0` 时 `headline='已接 · 线路有过错误'`、
   `detail='…错误 N · 处置 M；丢帧的那几台会退回 TTL（15s）自愈。'`。这把**本机拒发**错误归因给
   "线路"故障 + "那几台（对端）"丢帧——运维据此会去查一条没坏的线路、等一批没丢帧的对端。
   `DiscoverPanel` 的 label `线路错误 errors` 同款甩锅。
2. `invalidation-bus.ts` 的 `errors` 字段注释「坏帧 / 线路错误数」**没含**出站拒绝、坏回调、序列化失败
   （ADR-0149 §诚实边界原写"原为坏回调/线路错误/帧序列化失败"，那是**语义事实**与**注释字面**的分叉）。
3. `applied` 字段注释「消息处理回调数（每帧对每个合法 viewerId 算一次本地失效）」与 §MQ-1 收紧后的
   实现读反——实现是"至少一个 listener 成功处置才按 `frame.viewerIds.length` 记一次（全局帧记 1），
   与订阅者个数无关；全抛/零订阅不虚记"，而注释说的"回调数"会被读成"每 listener 一次"。

## 决定（收敛版：只同步注释 + 面板文案，**不分列** `rejected` 字段）

探查给了两版取舍，本片取**方案 B 收敛版**，三条尺子逐条权衡后定：

| 尺子 | 方案 A（加 `rejected` 第五账） | 方案 B（只同步措辞，本片采用） |
|---|---|---|
| footprint | 8–10 文件：counters ×2、拒绝分支 ×2、形状门、前后端契约、4 判据、2 处 tsc 契约报警 | **4 文件**：1 判据 + 3 生产，零 counters / 形状门 / route / discover-cache 联动 |
| 诚实读数 | 入站坏帧 vs 出站拒发分列，能答"我拒发几次" | 三类合并进 `errors` 总账，靠文案说清；运维读不出拒发次数 |
| 判据可验 | 硬（五账 `toEqual` + `rejected+=1` 静态门 + 形状门反例） | 也可硬，但须靠"抽纯函数测返回值 + `errors:0` 反向支"才不假绿 |

**决定性理由**：§MQ-2 自己定性"唯一生产调用方每次 ≤2 个 viewer、碰不到 128"⇒ **出站拒发在真实生产里恒为 0**。
方案 A 多付的 counters/形状门/前后端契约联动，换来的是一个**长期恒显 0 的第五格**（信息量≈0），
却要把 ADR-0115 立下的"形状门护四账 + null≠0"不变量整体搬家一次。ADR-0126/0149 对这条欠账的**首要**
表述都是"注释+面板措辞同步"，"分列读数"是"**可**连同"的可选项。故本片只治**已经在说谎**的文案 +
两处读反的注释，把 `errors` 明确为合并总账；分列留到"真出现 >128 批量失效调用方"时另立片。

**具体改动（4 文件，零字段/零行为/零 counters 变化）**：

1. `invalidation-bus.ts`：`errors` 注释改为"没能正常处置的**总账**：接收侧坏帧/线路错误/坏回调 +
   §MQ-2 出站超界拒绝；出站拒绝是本机没让帧上线路、对端没丢"，并明示"下片若要分列可加 `rejected` 字段"；
   `applied` 注释改为与实现一致的"至少一个 listener 成功处置才按帧 × viewerIds.length 记一次（全局帧记 1）、
   与订阅者个数无关、全抛/零订阅不虚记"。
2. `discover-view.ts`：新增纯函数 `busErrorsNote(errors)` 承载 `errors` 那句旁注（**测返回值、不测文件文本**，
   A11Y-2 教训）；`busTag` 的 warn `headline` 从"线路有过错误"→"**账上有错误**"（不甩锅线路）、
   `detail` 经 `busErrorsNote` 点名"含本机出站拒发、对端没丢、其余真丢帧的对端退回 TTL"；
   **success 档 headline/detail 逐字不动**（零回归，也不在本片 scope 内顺手改"配了≠连着"那条别的欠账）。
3. `DiscoverPanel.tsx`：label `线路错误 errors`→`错误合计 errors`；bus 账块改 fragment，加一行 `.dc-note`
   旁注（复用既有样式、零 CSS）说清"错误合计含本机出站拒发/坏帧/线路错误/坏回调；出站拒发不是线路故障"。
4. 判据 `invalidation-bus-ledger-wording.test.ts`（6 门，纯内存）。

`errors:0` 的 0 支刻意**纯零叙事**——"错误 0 · 还没发生过需要记的错误（0 是'还没发生'，不是'测过都健康'）；
跨实例仍可能丢帧退回 TTL"——**绝不在 0 时提"拒发/拒绝"任何一次**（否则把 0 叙述成一次观测，是 null≠0 家族的新谎）。

## 判据（6 门，纯内存、零浏览器/真库/Redis）

**面板文案（4 门，测 `busTag` 返回值）**：① warn headline 不含"线路有过错误"、dot 仍 warn 不画绿；
② warn detail 点名"出站"、不再含"那几台"甩锅、仍带 TTL 边界；③ **`errors:0` 反向支**——dot success、
headline 含"正常"、detail 含"最终一致"、且**不叙述任何一次"拒/丢过"**、必须说"还没发生"；
④ `errors>0` 仍 warn 档、仍带 TTL、不说"线路正常"（复用 §MQ-1 已有诚实护栏，零回归）。

**字段注释（2 门，绑定声明非整文件含词）**：用 `fieldDoc` 按花括号/字段声明定位 `InvalidationBusStats`
接口内 `errors`/`applied` **紧邻的 JSDoc**（隔真代码即空、跳过缩进残留空行），要求 `errors` 注释含
"出站"+"线路"、`applied` 注释**不含**"消息处理回调数"且与"处置/viewerIds/成功"一致。

- **先红 4 红 2 绿 → 转绿 6/6**：4 红精准命中两处读反注释 + 两句甩锅文案；2 绿是 `errors:0` 反向支
  与 warn 零回归对照（结构对照，证明判据不误伤既有正确行为）。
- **首跑先红抓出判据自身 2 个缺陷，全部修实而非绕过**：
  ① `fieldDoc` 把声明行前的缩进残留空行当"隔代码"提前 break，返回空——改为倒序遍历跳过纯空白行、遇真代码才停；
  ② **臂 B 首跑假绿**（见下）——反向支原写 `not.toContain('拒绝过')`，变异用"拒**发**过 0 帧"绕过；
     改为 `not.toMatch(/拒|丢过|报过错.*实际/)` 单字兜住"拒发/拒绝"两种措辞 + 要求 0 支出现"还没发生"，
     同时把**绿色实现的 0 支也改成纯零叙事**（原"没拒发过帧"含"拒"字，本就不该在 0 时叙述该类别）。

### 变异臂（ADR-0077，三臂各有牙、逐条当场备份 + md5 断言变异真发生 + 恢复后对齐基线、只认退出码）

- **臂 A** warn headline 改回"线路有过错误" → **rc=1 红 1 条**（甩锅线路门）；咬住"出站拒发不归因线路"。
- **臂 B** `errors:0` 支改成"本机拒发过 0 帧" → 首版**假绿**（rc=0），暴露判据措辞漏洞；修判据 + 修绿色
  0 支措辞后重跑 → **rc=1 红 1 条**；咬住"0 是还没发生、不是一次被叙述的观测"。
- **臂 C** `errors` 注释回退旧"坏帧 / 线路错误数" → **rc=1 红 1 条**（注释绑定门）；咬住注释与实现同口径。

三臂恢复后 md5 全部对齐绿色基线（`invalidation-bus.ts`=`727b791f…`、`discover-view.ts`=`a190b24e…`），最终绿 6/6。
**臂 B 的假绿→修实是本片最有价值的教训**：变异臂不只是"证明判据有牙"，更是**判据自身的验伪器**——
一次假绿恰好指出断言写得太窄（只挡"拒绝"没挡"拒发"），当场补严、连绿色实现的措辞一起改到无懈可击。

## 验证

- 起点：`discover-view.test.ts` + `invalidation-bus.test.ts` + `invalidation-bus-outbound-guard.test.ts` 既有全绿。
- 判据：本片 **6/6**；横向纯内存零真库 **172/172**（本片 + `discover-view` + `invalidation-bus` +
  `invalidation-bus-outbound-guard` + `discover-cache` + `discover-cache.multi-instance` + `realtime`，既有 166 零回归）。
- 工程门：四改动文件 `eslint` 各 **EXIT=0**；`tsc --noEmit -p apps/web/tsconfig.json` **EXIT=0**。
  （本机并行会话抢资源、loadavg≈66，组合命令与两次 tsc 曾 SIGTERM 无输出，按纪律**不算绿也不算红**；
  拆单文件重跑 eslint、tsc 限堆 4096 + 长 timeout 后拿到真实退出码 0。）
- **未 push**。

## 诚实边界

1. **不分列 `rejected`**：`errors` 是合并总账，运维**读不出**"本机拒发过几次"（方案 A 的收益、方案 B 的代价）；
   真实生产出站拒绝恒 0，分列的第五格长期无信息量，故本片不付那份 footprint；若将来有批量失效调用方再立片。
2. **只改文案与注释，零行为**：`errors`/`applied` 的计数逻辑、`InvalidationBusStats` 字段形状、形状门
   `isKnownReadout` 的四账 key、route/discover-cache 数据通路**一字未动**；success 档 headline/detail 也逐字未动
   （"已接·线路正常"严格的"配了≠连着"歧义属 ADR-0127 同类另一条欠账，不在本片 scope）。
3. 判据测的是纯函数返回值 + 源码注释绑定声明，**未起真浏览器逐字核面板渲染文本**（纯文案改动、静态+纯内存门已覆盖判据面）。
4. 真库集成 `admin-discover-cache.integration.test.ts` / 真 Redis 线路本机多 agent 抢同一 Postgres、无干净窗口，
   未硬跑、不编绿灯；本片不动 route/形状门/计数，那条通路的既有契约不受影响。
5. 未 push。

## 后果与仍欠

**已交付**：修掉一句把本机拒发甩锅给线路与对端的**已在说谎**文案，让 `errors` 明确为合并总账；
两处读反的字段注释与实现对齐；`errors:0` 纯零叙事（承 null≠0 家族）；6 门判据 + 三变异臂（含一次假绿修实）
硬证据；零字段/零行为/零 counters 变化。

**仍欠**：
- 若真出现 >128 批量失效调用方：加 `rejected` 分列读数 + 形状门第五账 + 前后端契约（另立片）；
- success 档"线路正常"的"配了≠连着"歧义（ADR-0127 同类），可与 admin 面板连接实况读数一起治理；
- 前端登峰造极线 FE-9 `/not-found.tsx` 门面化（下一片）。
