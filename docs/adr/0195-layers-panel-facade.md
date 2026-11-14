# ADR-0195：§FE-43 `LayersPanel.tsx` `.ly-` 门面化——§5 图层树首片

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-42 · `apps/web/test/layers-panel-visual-style.test.ts` · `docs/evidence/fe-43-layers-panel-facade/evidence.md`

## 背景

`LayersPanel.tsx` 是 Studio 的 §5 图层树：重命名 / 显隐 / 锁定 / 拖拽改父级 / 多选 / 搜索 / 按类型过滤。 ROW_H=24 固定 + 窗口化渲染 + ResizeObserver 对齐可见区，以及无过滤时根本不算 `matches`。门面化只换皮，结构性行为一字不动。

## 决定

1. **新增 `.ly-*` 门面族**（globals.css，`.cx-` 之后）：`.ly-root/.ly-header/.ly-search/.ly-filter/.ly-addBtn/.ly-drop/.ly-dropItem/.ly-pageTabs/.ly-pageBtn/.ly-pageBtnActive/.ly-pageAdd/.ly-rel/.ly-scroller/.ly-spacer/.ly-rowShell/.ly-empty/.ly-row/.ly-rowSelected/.ly-rename/.ly-typeChip/.ly-name/.ly-iconBtn/.ly-danger/.ly-warn`——零 hex、零动效、双主题 token 锚定。
   - 行 `.ly-row` 仍 `color: fg-2` / 悬浮 fg-hover；选中态 `.ly-rowSelected` 仍 `bg-bg-3 + fg-1`。
   - typeChip 宽 52px 与原 `w-[52px]`；两条锁/显控制按钮用同样的 min-h-6/w-6 视觉后缀。
2. **零行为恒等门**：剥 className 后 SHA256 与改前（git HEAD）一致（`a3ae9c9b…`）。
3. **判据**（10/10 绿）：'use client' 保留 + studio.rename/addNode/reparentNode 进门 · 字面类全 ly-* · 零裸 Tailwind · 类名闭环 · 零 hex · token 全声明 · 零新增颜色 token · 零 transition/@media/@keyframes · **SHA256 守恒** · 钩子守恒（6+ 类全语料）。
4. 不动：add dropdown 内嵌 add 过程、ROW_H 守恒、ResizeObserver 窗口、拖拽 effectAllowed、
   切换 collapsed 时的 setCollapsed(merge)、"无过滤时不算 matches" 的性能纪律。

## 取舍

- 不动 `flattenLayers` 派生、不动 windowing 与 scroll handler；
- 不加 focus retention，不做行高动态，不改选中快捷键；
- 不做截图：browser 不可用。

## 后果

`LayersPanel` 加入门面矩阵。Studio 24+ 面板未完——跳至 VariantsBoard/TeamPanel/WorldPanel/DesignSystemPanel 后继。
