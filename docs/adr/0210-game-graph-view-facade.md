# ADR-0210：§FE-58 `GameGraphView.tsx` `.wg-` 复用——§52 游戏图视图（零新增 CSS）

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-57 · `apps/web/test/game-graph-view-visual-style.test.ts` · `docs/evidence/fe-58-game-graph-view-facade/evidence.md`

## 背景

`GameGraphView.tsx` 是 §52 Game Design System 的图视图（§44 世界图同一SVG 系列）：游戏实体的有向 SVG 投影；拖拽、删除、点击派发全部与 WorldGraphView 同路径。
`GAME_KIND_FILL`（10 个实体本色常量，#2f4b63 等）是**用户本色数据**，不是样式——与 KIND_FILL 一同保留原样。

## 决定

1. **零新增 CSS 定义**——全部映射回 §FE-57 的 `.wg-*`：`wg-rootCol/head/emptyState/emptyLead/terrainInput/btnFaintHover/ghostDanger/axis10/11/12/warnCell/dangerCell/pointerHint/rowFaintPad/block/clickable` 连同复用 `.gp-*`/`.sb-*`/`.wd-*`/`.ap-*`。
2. **唯一代码变更**：`ml-auto font-mono text-11` cn 三元切换为 `.wd-monoFaintEnd` + `.wd-dangerText`（error→danger-ink / else→fg-3），§FE-57 同型重钉。
3. **零行为恒等门**（redact）：page `75c1fd00…` 与 改前 redact 字节一致。
4. **判据**（8/8 绿）：client + svg hooks 进门 · 字面类全 wg-/复用族 · 零裸原子（`fill-`/`text-[`/`w-[` 都不存在）· 类名闭环 · 零 hex（CSS，JS KIND_FILL 保留）· token 全声明（`.wg-*` 同属 §FE-57）· 零 transition/@media/@keyframes · **SHA256 守恒** · 钩子守恒（`data-game-graph-selection`）。

## 取舍

- 不动 `GAME_KIND_FILL`/`#20242e`（未知 kind 回落）/`setDragging`/`d3-drag` 正交函数；
- 不重排图节点 or entity 装载顺序；
- 不做截图：browser 不可用。

## 后果

`GameGraphView` 加入门面矩阵（`.wg-*` 双消费方）。Studio 剩余 ≈8 面板继续（WorldGraphView/GameGraphView 已清 / RetrievePanel done）。
