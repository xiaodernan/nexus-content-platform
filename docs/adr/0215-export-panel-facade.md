# ADR-0215：§FE-63 `ExportPanel.tsx` `.pb-*` 复用 + `.pb-popPanel360` / `.pb-runBtn` 新增——§58 Export 面板

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-62 · `apps/web/test/export-panel-visual-style.test.ts` · `docs/evidence/fe-63-export-panel-facade/evidence.md`

## 背景

`ExportPanel.tsx` 是 §58 导出面板：打包（多 part SE 上升/打包过程） → 触发下载。Submit 按钮走 `.pb-runBtn`（accent-2 实底 accent-fg）；popover 与 PublishPanel 结构一致但 360px 略小。
独有：**SUBMIT 按钮的 `text-left` 设计**把按钮做成导出摘要文本框（而不是表单提交钮）；360px popPanel 是 FE-54 既有化 FE-54 400px 的近似（不是新增 token，只是把既有 anatomy 复用并对宽度参数命名）。

## 决定

1. **§FE-54 `.pb-popPanel` 既存族驯化**——本片新增 `.pb-popPanel360`（360 档）+ `.pb-runBtn`（accent-2 实底 + `:disabled` .5 昏暗）。
2. **零行为恒等门**（redact）：page `8cf979c5…` 与 HEAD carved（删 `import { cn }` 一行）redact 字节一致；测试内嵌雕刻判据。
3. **判据**（10/10 绿）：client 指令 + POST 子路径进门 · 字面类全 pb-/复用族 · 零裸原子 · 类名闭环 · **.pb-popPanel360/.pb-runBtn 是本片固定的固定形** · 零 hex · token 全声明 · 零新增颜色 token · 零 transition/@media（除 520px popPanel 仅一档）· **SHA256 守恒** · 钩子守恒（data-export-run）。

## 取舍

- 不动 PARTS 表 / SUBMIT 按钮文本内容；不动 `useCallback`/`useState` 解构；
- `.pb-popPanel360` 保留 520px 的两档位置（`fixed; left/right: 12px; top: 52px; width: auto`），原 `max-[520px]:` 播进来；
- 不做截图：browser 不可用。

## 后果

`ExportPanel` 加入门面矩阵（`.pb-*` 四消费者）。Studio 剩余 3 面板（GameCodeExport 18 / CanvasStage 6 / ViewerControls 4）。
