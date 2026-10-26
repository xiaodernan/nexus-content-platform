# ADR-0064：§147 的增量重解与虚拟化裁剪——从「没接上电」到三层防线齐落

- 状态：**已定案（2026-10-26；浏览器级实测待 perf probe 重跑）**
- 日期：2026-10-26
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
  率仍然是 0（收益主要来自测量缓存）；浏览器端真实帧率 / 首节点时延的最终数字仍待
  `scripts/perf-browser.mts` 在 1000/4000 节点档上重跑（本机 Docker 引擎当前不可达，待启动后补）。
- **未完成**：e2e 对 `data-canvas-virtualized` 的浏览器断言尚未落（脚本层有徽标校验，e2e 层
  缺一环）；Video Studio 真 provider 一锤子落（§194 暂停条件）。

## 决策记录

- 2026-10-24：`77404ed` 落地布局缓存命中判据修法 1（`gen` 代数），`studio-layout-cache.test.ts`
  三条帧回归（只改选区命中 / 事务内半程不交旧布局 / 换视口重算）+ 换文档帧钉（第四个护栏），
  `studio-incremental-layout*.test.ts` 与 `packages/design-model` 增量单测全绿。
- 2026-10-25：`f4fb179` §124 states clipboard；`6248106` unset op；`fbf4243` AI approvals 门禁
  单测；`98bbfe9` 画布 surface `overflow-clip`。
- 2026-10-26：本 ADR 定案；ROADMAP §147 记账。

## 未完待续

1. 浏览器级 perf 探针重跑（1000 / 4000 节点档）→ `docs/PERFORMANCE.md` 补最新数字；
2. e2e 加 `data-canvas-virtualized` 徽标断言（脚本已有，e2e 缺）；
3. Video Studio 真 provider（§194）——暂停条件未满足前不推进假生成。
