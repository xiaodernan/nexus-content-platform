# ADR-0209：§FE-57 `WorldGraphView.tsx` `.wg-` 门面化——§45 世界图视图（SVG）

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-56 · `apps/web/test/world-graph-view-visual-style.test.ts` · `docs/evidence/fe-57-world-graph-view-facade/evidence.md`

## 背景

`WorldGraphView.tsx` 是 §45 的图视图：§44 World Builder 世界文档的 SVG 投影；有向图 + 圆形台下拖动（拖圆台高度 / 坡高）+ 台子删除。
SVG 文本标签（`fill-fg-*` + `text-[NNpx]`）是 attribute-over-className 的语义，换成门面类不会画蛇添足——本片把 `fill-*` 映射到 `.wg-axis10/11/12`；长串 Tailwind (`items-start justify-center`) 全局化。

## 决定

1. **新增 `.wg-*` 门面族**（globals.css，`.rp-` 段之后）：33 定义——`ghostDanger/linkFaint/dangerCell/warnCell/rowFaintPad/pointerHint/axis10/axis11/axis12/rootCol/head/emptyState/emptyLead/terrainInput/btnFaintHover/w14Input/segBtn/selOn/selIdle/block/crosshair/clickable/grab/grabbing`，+ 复用 `.gp-*`/`.sb-*`/`.wd-*`/`.cp-*`/`.mm-*`/`.rp-*`/`.ds-*`/`.ap-*`/`.hi-*`。
2. **零行为恒等门**（redact）：`e8728bcd…` 与 HEAD 字节一致；JS 里的 `KIND_FILL` 顶点本色常量（`#3b2f63` etc, 9 类世界实体）与 `#20242e` 未知 kind 回落——**用户本色数据**，不是样式；判据放开 `#3b2f63/20242e` 子集到 code，hex 判据只拦 CSS 段。
3. **判据**（10/10 绿）：client + svg hooks 进门 · 字面类全 wg-/复用族 · 零裸原子 · 类名闭环 · 段成规模 · 零 hex（CSS：JS 本色数据放行）· token 全声明 · 零新增颜色 token · 零 transition/@media/@keyframes · **SHA256 守恒**。
4. cn() 三元统一映射：terrainMode 开关 → `.wg-segBtn` + `.wg-selOn`（accent-2+accent-fg）/ `.wg-selIdle`；跨区 `cursor-` 前缀各类半独立门（wg-block/crosshair/clickable/grab/grabbing）。

## 取舍

- 不动 SVG 的 pointer 捕获链 / 拖拽数学（`plateauFromDrag`）；不动 `KIND_FILL` 本色常量（9 类世界本色）；
- 不动 `wg-emptyLead` 的 `max-w-[420px]` → 26.25rem 一步到（`<420px` 向下边世界图缩 13px margins）；
- 不做截图：browser 不可用。

## 后果

`WorldGraphView` 加入门面矩阵。Studio 剩余 ≈9 面板继续。
