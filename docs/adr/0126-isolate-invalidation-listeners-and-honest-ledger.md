# ADR-0126：失效总线一个坏订阅者吞掉同帧其余人——逐 listener 隔离，且不让账本虚记

- 状态：已采纳（2026-11-11，§SC-52 / §MQ-1）
- 关联：ADR-0114（Redis pub/sub 双连接失效总线骨架）、ADR-0115（没接上绝不画成四账 0）、
  ADR-0077（变异臂各有牙）、`realtime/localBus.ts` 的逐 listener 隔离纪律与其判据 `realtime.test.ts`、
  `invalidation-bus.ts` / `invalidation-bus.test.ts`（本片改动）、ADR-0125（SC-50 共享缓存，同一"诚实读数"家族的另一副面孔）
- 触发（user 长期点名）：**消息队列的合理运用 + 前后端协同 + 缓存合理运用 + 算法/数据结构合理性**。

## 背景

发现页缓存的跨实例失效总线（`invalidation-bus.ts`）用 pub/sub 把「某 viewer 私有关系变了」或
「全局世代变了」广播给别的进程。`subscribe()` 公开支持**多个**订阅者（生产里至少两只：一只 bump
本地 `generation`、一只 bump `globalEpoch`），两种驱动（`MemoryInvalidationBus` 测试用 /
`RedisInvalidationBus` 生产用）共用同一个 `InvalidationListeners.dispatch` 与同一个 `makeDispatcher`。

读码确证一处真 bug，与同仓已固化纪律分叉：

```ts
// invalidation-bus.ts dispatch（修复前）
dispatch(viewerIds, global?) {
  for (const listener of [...this.listeners]) listener(viewerIds, global);  // 第一个抛错，后面全不执行
}
```

`makeDispatcher` 的 `try/catch` 只包住**整次** `onInvalidate(...)`：某个 listener 抛错时，它记
`errors += 1`，但同一帧排在它后面的 listener **一个都收不到**（静默吞帧），`applied` 也停在 0。
而同仓 `realtime/localBus.ts:22-29` 早在 §163 就钉死并测过相反纪律——"一个订阅者出错不能影响
同一频道的其他人"。**同一类 pub/sub 扇出、两套相反行为**，且失效总线的注释 `:160` 还写着
"某个回调抛错由调用方（dispatcher）兜住"——兜住了"进程不崩"，没兜住"其余订阅者照常收"。

后果不是抽象的：在发现页语境下，bump `generation`（隐私）的 listener 若抛错，排在它后面的
bump `globalEpoch`（新作品可见性）的 listener 就收不到那一帧，两个世代从此不同步，对方进程要
退回 15s TTL 自愈。而生产 `RedisInvalidationBus` 走的就是这条 dispatch，从不缺多订阅者场景。

### 顺带确认的第二个读数缺口（同样来自这次读码）

`makeDispatcher` 把 `applied` 无条件按 `frame.viewerIds.length` 累加，只要 `onInvalidate` 不抛——
哪怕**零个 listener 在册**（无人处置）也记 `applied>0`。这违反接口注释自己写的
"消息处理回调数（每帧对每个合法 viewerId 算一次本地失效）"，也与 ADR-0115「没接上绝不画成四账 0」
同源：**没有真实处置却报了处置**。全 listener 都抛错时，`errors` 也只记 1（整次 catch 一次），
而非"几个坏回调记几笔"。

## 决定

### 1. 逐 listener 隔离，成败如实返回（不改接口、不吞失败）

`dispatch` 从 `void` 改为返回 `DispatchOutcome { applied, failed }`：逐个 `try/catch` 每个 listener，
先复制 `[...this.listeners]` 再遍历（回调里退订不漏后面的人，抄 `localBus` 的既有正确性），
一个抛错只 `failed += 1`，继续下一个。不打 `console.error`：线路异常已在 `counters` 与 admin
面板可见，逐帧打日志反而是可被一条坏帧刷屏的日志风暴面。

### 2. dispatcher 按 outcome 诚实记账（收紧两处读数，不动前端）

- `applied`：**只有 `outcome.applied > 0`（至少一个 listener 成功处置）才累加**，仍按
  "帧 × viewerIds.length"（全局帧记 1）记一次，与订阅者个数无关（幂等 bump，多订阅者收同帧也是
  一次失效）。全抛 / 零订阅 → `applied` 不虚增。
- `errors`：**每个抛错的 listener 各记一笔**（`+= outcome.failed`），而非整帧笼统 1 笔。
- `onInvalidate` 本身崩了（不该发生，它已逐个隔离）——整帧记 1 笔 error、不让线路崩（保留防御）。
- **不改 `InvalidationBusStats` 字段形状**：admin 面板 `DiscoverPanel` 两行照旧读 `bus.errors` /
  `bus.applied`，`discover-view.busTag` 的 `bus.errors > 0` 分支仍成立；语义是**收紧**（虚记变不记、
  漏记变记全），不是改字段，故前端零联动。

**正常路径（无坏回调、有订阅者）逐字等价**：`outcome.applied=N>0` → `applied += viewerIds.length`、
`errors += 0`，与修复前一致。生产行为只在异常/空订阅边界变诚实。

### 3. 为什么这不是"给不可能输入加机制"

"一个订阅者回调抛错"是真的会发生的事：回调里 bump 本地世代、读缓存、触发再入，任一处都能抛；
`realtime` 总线早已为同一场景付过隔离成本。而 `subscribe` 公开允许多订阅者、生产确实挂多只，
"排在坏的那只后面的收不到"是**数据丢失**，不是防御性假设。零 listener 也不是虚构：写路径
`publish` 是 fire-and-forget，订阅者可能在进程启动/热重载窗口尚未登记。

## 判据（7 条新增，纯内存 hub + 假连接，零真 Redis / 零真库 / 零 sleep / 零时钟）

全部并入 `invalidation-bus.test.ts` 的 `describe('订阅者异常隔离（§MQ-1：内存与 Redis 双驱动共用同一 dispatch）')`：

1. 第一个 listener 抛错，同帧后续照常收到（**修复前必红**：后续 `seen=[]`）；四账 `received=1/applied=1/errors=1`；
2. 中间 listener 抛错，前后两个都收到；
3. **诚实读数**：全部 listener 都抛错 → `applied=0`（不虚增）、`errors=2`（两个坏回调记满）、`received=1`；
4. **诚实读数**：零 listener → 帧到达 `received=1`、`applied=0`（不虚记）、`errors=0`；
5. 零回归：两个正常 listener 各收一遍，`applied` 按帧记 `2=viewerIds.length`、不因双订阅翻成 4；
6. 坏 listener 退订后不再拖累账本（`errors=0`）；
7. 生产 `RedisInvalidationBus` 走真实 `message` handler 同样隔离（证明两种驱动共用同一 dispatch 都修好）。

### 变异臂（ADR-0077 纪律，三臂各有牙、逐条还原）

- 臂 A 去掉逐 listener `try/catch`（恢复裸循环）→ 精确红 4 条（全部隔离判据）；
- 臂 B 去掉 `outcome.applied > 0` 门（无条件累加）→ 精确红 2 条（两条"不虚记 applied"判据）；
- 臂 C 删掉 `counters.errors += outcome.failed` → 精确红 4 条（所有带 errors 断言的判据）。

证明 7 条判据不是惰性断言，各自咬住一个真实不变量。

## 验证

- 起点：`invalidation-bus.test.ts` 基线 **13/13** 全绿。
- 先加 7 条判据、未改实现：**5 红 2 绿**，精准命中（隔离 2 条 + 账本 2 条 + Redis 1 条红；
  两条零回归对照绿）——先证明判据抓得住 bug，再写修复。
- 修复后：`invalidation-bus.test.ts` **20/20**；周边纯内存零真库套件
  `discover-view` + `realtime` 合并 **82/82**（`admin-discover-cache.integration` 为真库集成，
  本机多 agent 抢同一 Postgres 无干净窗口，未硬跑、如实记为推算待复核，不编绿灯）。
- 工程门：改动两文件 `eslint` **EXIT=0**（顺带清掉这两文件 HEAD 基线各 3 条 lint 遗留：
  生产文件未用的 `Redis` type import / `emptyStats` / publish catch 未用的 `error` 参数；测试文件
  `fakeRedis` 的 `Map<string, Function>` → 显式 `WireHandler`——均零行为变化，交付文件 lint 从
  "基线各 3 红"变"0 红"）；`tsc --noEmit -p apps/web/tsconfig.json` **EXIT=0**。
- 未 push。

## 后果与仍欠

**已交付**：修掉一处会丢帧的真 bug，让失效总线的异常隔离纪律与同仓 `realtime` 总线对齐；
顺带收紧两处读数诚实（全抛/零订阅不虚记 applied、坏回调记满 errors）；零公共 API / 零前端形状变化；
7 条纯内存判据 + 三变异臂硬证据；两改动文件 lint 从基线红清零。

**仍欠**：
- `applied` / `errors` 的**语义措辞**在 `InvalidationBusStats`（`invalidation-bus.ts`）与 admin 面板标签
  仍是旧文案（"消息处理回调数" / "坏帧 / 线路错误数"）——现已被收紧为"至少一次成功处置才记" /
  "含每个坏回调"，下一片可同步注释与面板 tooltip，本片只改行为不改文案以免扩大 footprint；
- SC-50 共享缓存 `retryStrategy` 断后永不重连 + 恒报 `driver=redis`（ADR-0125）仍待干净全仓窗口；
- 候选 1（ai-service `MemoryJobStore._purge`/`claim`/`request_cancel` 默认内存作业后端零判据）、
  候选 3（`publish` 不守 `MAX_VIEWERS_PER_FRAME`，当前调用方最多 2 个 viewer 到不了上限）
  已从只读探查记录，按优先级留待后续 MQ 片。
