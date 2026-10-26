# ADR-0064：§147 的增量重解与虚拟化裁剪——从「没接上电」到三层防线齐落

- 状态：**已定案（2026-10-26；2026-10-27 补浏览器级实测与 e2e 断言）**
- 日期：2026-10-26（实测补充 2026-10-27）
- 关联：§147、§16、§146、§150、§159、ADR-0048（首屏那一刀）、ADR-0049（三处根因）、ADR-0050（节点树遍历）、`docs/PERFORMANCE.md`

## 背景

§147（选中响应 + 增量重解 + 虚拟化裁剪）这一年从 2026-09-27 开工到今天的 `77404ed`，
在**代码层面**已经走完了很长的路，但 ADR-0049 写得清清楚楚：**2026-10-21 前，增量重解
（runLayoutIncremental）从未在编辑器里真正跑过**——全部收益数字都是在一条"没接上电"的线上量
出来的。今天（2026-10-24/25）补齐了最后一块根因 1，今天（2026-10-26）把虚拟化裁剪这条线也
端到浏览器徽标上做真件检验。

## 决策

1. **命中判据三层防线**（`apps/web/src/studio/store.ts` 的 `layoutCache` + design-model 的
   `derivedCache` / `runLayoutIncremental`）：
   - derivedCache：按**文档对象身份**缓存（事务内半程提交文档变、revision 不跳，身份判据
     才不会被 key 漏掉）；
   - layoutCache：key 带 `revision | gen | docId | pageId | viewport | mode`，且命中还要
     **文档代数 `gen`** 与**文档对象身份**同时对上（`77404ed` 把"代数"补上、`gen` 从整份
     替换时 +1 只跳、补丁时不变；`applyPatch` 写时拷贝、每次返新对象，旧的"对象身份"
     判据对纯选中帧本来就该恒等，所以换成 `gen` 等价且防半程事务）。
   - token/测量缓存：`tokensSignature` 把 token 指纹进测量签名（`ADR-0050` batch）。
2. **虚拟化裁剪**：`CANVAS_VIRTUALIZATION_THRESHOLD = 400`（首屏 8 节点走全量，>400 才开裁剪），
   `VIEWPORT_CULL_MARGIN = 256`，`visiblePaintOrder` 只给视口内节点 paint order，画布徽标
   `data-canvas-virtualized` 暴露「N / M」。
3. **浏览器级证据**：`scripts/perf-browser.mts` 已内嵌徽标断言（`active > 400 && badge === 0`
   → throw），即"裁剪生效"有机器可读的验收口。

## 后果

- **正面**：§147 从"全链路没接上电"到"三层防线齐落"——选中响应的派生缓存、增量重解、
  测量缓存 token 指纹、虚拟化裁剪全部有代码+单测+（徽标层）脚本级护栏。
- **负面（必须说清）**：增量对**首屏**仍零帮助（ADR-0048）；>400 节点的文档里增量的位置复用
  率仍然是 0（收益主要来自测量缓存）。
- **浏览器级实测（2026-10-27，dev 口径 `dev-f6ec3b5`，有头真 Chrome）**：1000 / 4000 两档
  画布 DOM 都只有 **34 个**节点、图层树 DOM **39 行**（`data-layer-total` 报 999 / 3999）——
  虚拟化在真浏览器里成立，文档规模涨 4 倍 DOM 不涨；pan >33ms 帧 0/262 与 1/255 量级。
  首帧 515.7 / 1392.4ms，4000 档里 1221–1683ms 花在"脚本到手 → 首帧"（水合 + 首屏求解）。
  **dev 的绝对延迟不拿去判生产目标**（生产 4000 档属性写入仍无读数）。明细见
  `docs/PERFORMANCE.md` 2026-10-27 一节。
- **未完成**：Video Studio 真 provider 一锤子落（§194 暂停条件）；生产构建 4000 档的
  首帧 / 属性写入 / 选中仍无读数（要另起 prod 构建）。

## 决策记录

- 2026-10-24：`77404ed` 落地布局缓存命中判据修法 1（`gen` 代数），`studio-layout-cache.test.ts`
  三条帧回归（只改选区命中 / 事务内半程不交旧布局 / 换视口重算）+ 换文档帧钉（第四个护栏），
  `studio-incremental-layout*.test.ts` 与 `packages/design-model` 增量单测全绿。
- 2026-10-25：`f4fb179` §124 states clipboard；`6248106` unset op；`fbf4243` AI approvals 门禁
  单测；`98bbfe9` 画布 surface `overflow-clip`。
- 2026-10-26：本 ADR 定案；ROADMAP §147 记账。
- 2026-10-27：两笔欠账还上——① 有头真 Chrome 重跑 1000 / 4000 档（`dev-f6ec3b5`），
  数字与"dev 口径不判生产目标"的边界写进 `docs/PERFORMANCE.md`；② `e2e/studio.spec.ts`
  新增 500 档徽标断言（8 节点对照 + 徽标两个数 + 画布 DOM 等于显示数 + 图层树全量/窗口化），
  并用阈值变异（400→100000）证明它红在 `toBeVisible`，恢复后逐字节一致、复跑绿。

## 未完待续

1. ~~浏览器级 perf 探针重跑（1000 / 4000 节点档）~~ ✓ 2026-10-27，见 `docs/PERFORMANCE.md`；
2. ~~e2e 加 `data-canvas-virtualized` 徽标断言~~ ✓ 2026-10-27，`@smoke §147 500 节点…`；
3. Video Studio 真 provider（§194）——暂停条件未满足前不推进假生成；
4. 生产构建的 4000 档（首帧 / 属性写入 / 选中）读数——dev 替代不了，需要一次 `next build` + `next start` 的 perf 跑。
