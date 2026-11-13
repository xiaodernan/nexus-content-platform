# ADR-0112：Map 操作计数门的盲区——非零锚，与一条从未写下的门间前提耦合

- 状态：accepted
- 日期：2026-11-12
- 版本片：v679
- 关联：ADR 0095（门读它声称的那件事；别让门留在"今天恰好等于成本、明天恒 0"的代理量上）、
  ADR 0094 X4（门不许惩罚正当改动）、ADR 0104（v671，Map 操作计数门的来源与该代理量射程边界）、
  ADR 0105（v672，单 Map 源码静态门）、ADR 0108（v675，把"代理量随实现换掉恒 0 假绿"升为通用纪律）、
  `apps/web/test/ds-complexity-contract.test.ts`

## 背景：通用纪律立了，却没对 Map 门自己再算一遍

ADR 0108（v675）把一条方法论钉成通用纪律：**门读的代理量会随实现换掉而失效**——它当年实算
"v673 数 `Array.prototype.filter` 回调，v675 把 filter 换成 head 游标后那个计数恒 0、三句判据全绿却
不再读成本"，并用变异臂 M9 证明。ADR 0104 也记过 Map 操作计数门"抓得住混进 O(n) 扫描、抓不住常数
因子退化"。但**两处都没有对 v671 自己的 Map 操作计数门（`mapOpCounter`）做同一件同构检查**：

> 若 `TtlLru` / `MemoryRateLimiter` 的实现从 `Map` 换成**任意非 Map 的 O(1) 结构**
> （扁平数组 + 开放寻址、plain Object、`Map` 换 `WeakMap`…——可能是正当的缓存局部性 / 硬件适配
> 优化，正是用户长期要求里"通过数据结构分析让代码更适配硬件"那一类），`mapOpCounter` 数的
> `Map.prototype.get/set/delete/[Symbol.iterator]` **全部恒 0**。

本片把这件同构失效**实算出来**，并补上真正有牙的锚，而不是停在"纪律说要注意"。

## 探针实测（只读，不碰生产）

用纯 Node 复刻门1（`ds-complexity-contract.test.ts` 61-77 行）的三条判据，喂"恒 0 输入"：

| 输入 | `Number.isInteger(opsPerHit)` | `opsPerHit ≤ 8` | `cap8 === cap8192` | 门1 总判 |
|---|---|---|---|---|
| 现状单 Map（命中 3 次） | true | true | true | 绿（对） |
| **换非 Map 实现（计数恒 0）** | true（0 是整数） | true（0≤8） | true（0===0） | **绿（假绿）** |

三条数值判据**单独看确实全绿**，门不再读任何成本。这就是 ADR 0108 通用纪律在 Map 门上的同构实例。

同时对照 `MemoryRateLimiter` 的两条门（129-172 行）：它们也数 Map 操作，恒 0 时"零方差 / ≤16"
也绿，但第 146 行有一条 `expect(atCap[0]).toBeGreaterThan(perHit[1])`（"顶到上界应比未到上界多付
一笔淘汰成本"）——恒 0 时 `0 > 0` 为假 ⇒ **这条正向对照断言把恒 0 抓住了**，相对免疫。

## 一条从未写下的门间前提耦合

那为什么 `TtlLru` 的命中门今天没出假绿？**因为 v672 的源码静态门**（`ds-complexity-contract.test.ts`
119-125 行：`ttlLru.ts` 里 `new Map<` 恰好 1 处、类型 `Map<K, TtlEntry<V>>`、无独立 expiry 表）
**钉死了"实现必须是单 Map"这个前提**。换非 Map 会先撞静态门红，动态计数门才有意义。

这是一条**门与门之间的隐含依赖**，两份 ADR、门文件注释里都从没把它俩摆在一起说过：
- 动态计数门（门1/门2）的可信度**依赖**静态门先把实现锁在 Map 上；
- 静态门若以"正当优化"名义被连同实现一起放宽，动态门会**静默失明**——而且因为三条判据对恒 0
  全绿，连 CI 都不会响。

## 决定：非零锚上锁 + 诚实诊断固化耦合（零生产源码改动）

只动 `apps/web/test/ds-complexity-contract.test.ts`，新增 2 条门，**不碰任何生产源码**
（`ttlLru.ts` / `rateLimitMemory.ts` 一字未改），census population 不变（门在 `apps/web/test/*`，
不在 `git ls-files -- docs/evidence`；不动 `complexity-arms.mjs` 的臂数，不碰 132 arms 计数），
零漂移（ADR 0090 一族反复验证过的安全形状）：

1. **非零锚门（真正有牙、补上 TtlLru 缺的那条正向断言）**：用真 `TtlLru` 实例实测——
   32 次命中的 Map 操作数 `> 0` 且 `> 16`，64 次命中必须是 32 次的**恰好 2 倍**（代理量与命中数
   同阶、线性）。它钉的是"**代理量锚在生产真走的那条路上、且随成本增长**"，**不钉"恰 3 次"**：
   换回双 Map（命中 6 次）仍绿、不惩罚正当结构变化（ADR 0094 X4）；只有"恒 0（换非 Map）"或
   "与命中数脱钩（恒定）"才红。这正是 `MemoryRateLimiter` 门第 146 行 `>` 正向对照的同一手法，
   补到 TtlLru 门上，把两条门的免疫形状对齐。
2. **诚实诊断臂（把假绿与耦合钉成可复跑事实，不伪装有牙）**：复刻三条数值判据喂恒 0，断言
   "**确实全绿**"（`expect(integer && bounded && capacityInvariant).toBe(true)`），并断言
   `ttlLru.ts` 源码此刻仍 `new Map<`——把"恒 0 是真假绿、靠静态门 + 非零锚兜底"显式写进门里。
   将来谁若移除静态门/换非 Map，这条前提断言与非零锚至少有一个会红。

**判据有牙性**（纯逻辑对照，不在共享树做"改生产→跑→还原"变异臂，避免 SIGTERM 污染 lane）：
非零锚判据 `ops32>0 && ops32>16 && ops64>ops32 && ops64===ops32*2` 对
`现状(96,192)=绿`、`恒 0(0,0)=红`、`脱钩恒定(3,3)=红`——两侧分离坐实。

## 验证（本机 2026-11-12）

- `apps/web/test/ds-complexity-contract.test.ts` **11/11**（原 9 + 新 2），零回归。
- 判据有牙对照：真实现绿 / 恒 0 红 / 脱钩红（见上）。
- eslint（足堆，单文件）exit 0；`verify:record-encoding` exit 0，**0 chargeable lines over 2247
  graded files**（新 CJK 注释未引入未 pin 的 ISLAND 行；population 2245→2247 = 本片门文件入扫）。
- census 不漂移：零新增 `docs/evidence/*`、零新增 `verify:*`、不动 `complexity-arms.mjs` 的 M 数；
  population = `git ls-files -- docs/evidence` 未变，132 arms / disposition 表不动。
- **共享树边界**：本片动手时 `HEAD=c7a4bb9`（我的 v678）→ 期间 lane 推 `de812b8`（publish preflight
  AI readiness，三 ref 对齐已推）；v676 前端 3 文件 + ADR 0109 是 lane 未提交领地，本片不碰、不 add。
  状态补记自包含在本 ADR + ROADMAP（`CURRENT-STATE.md` 工作区混 lane 在飞字节，不碰）。

## 仍欠（如实记）

1. **非零锚只补在 `TtlLru`**：`MemoryRateLimiter` 的门已靠第 146 行 `>` 免疫恒 0，本片未改它
   （无需改）；但如果将来有人删掉那句正向断言，没有独立门看着"它必须存在"——同类耦合仍在，只是
   当前免疫。记为下一轮审计候选，不为没发生的事预造门。
2. **换非 Map 的正当优化仍会撞 v672 静态门**（`new Map<` 恰好 1）——这是**已知的设计约束**，不是
   缺陷：本 ADR 不改它。若真要做开放寻址 LRU，正解是**先改 ADR 0105 的设计决策 + 同时换静态门与
   非零锚的锚点**（从数 Map 改成数新结构的代理量），而不是绕过门；本片把这条迁移路径写清。
3. hosted Studio CI verdict for this push PENDING；mainline 门绿是快信号。
