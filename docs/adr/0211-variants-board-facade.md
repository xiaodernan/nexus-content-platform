# ADR-0211：§FE-59 `VariantsBoard.tsx` `.vb-` 门面化——§29 多方案的并排比较板

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-58 · `apps/web/test/variants-board-visual-style.test.ts` · `docs/evidence/fe-59-variants-board-facade/evidence.md`

## 背景

`VariantsBoard.tsx` 是 §29 多方案并排比较板；真 provider 才启动 4 条线生成；DEMO 不假装出现。
人工点「切到这个方向」才走 §28 分支切换——候选不动工作区。

## 决定

1. **新增 `.vb-*` 门面族**（globals.css，`.wg-` 段之后）：40 定义——`fieldSm/dangerMt2/warnMt2/warnBadge/accent/grid/w160/primary/toolbar/thead2/row1/row2pad/rowEnd/mono12/mono12ink/accentPill/cardPreview/relOverflow/cardWrap/scroll/cardBody/pickBtn/pickOn/pickIdle/adoptBtn/adoptLive/adoptCurrent`，+ 复用 `.hi-*`/`.wd-*`/`.sb-*`/`.cp-*`/`.ds-*`。
2. **零行为恒等门**（redact）：page `7d791e49…` 与 HEAD 字节一致。
3. **判据**（10/10 绿）：client + studio.switchBranch 进门 · 字面类全 vb-*/复用族 · 零裸原子 · 类名闭环 · 段成规模 · 零 hex · token 全声明 · 零 transition/@media/@keyframes · **SHA256 守恒** · 钩子守恒（data-variant-pick-layout/visual/adopt/desc 派系）· `grid grid-template-columns:repeat(auto-fill,minmax(360px,1fr))` 逐字节保留（CSS 表达原任意值原子）。
4. cn 三元统一映射：(布局/视觉) pick → `.vb-pickBtn` + `.vb-pickOn/Idle`；(adopt) → `.vb-adoptBtn` + `.vb-adoptLive/adoptCurrent`。

## 取舍

- `.vb-grid` 保留 CSS custom-grid-template 任意值语义（`grid auto-fill minmax(360px,1fr)`）——className→token 不可能（Tailwind 任意值同时含多个复合）；保留原始布局语义。
- `.vb-accentPill` 对应 `bg-accent-2 px-[5px] py-[1px]`——字面量在 1px/5px（与 FE-42 口径一致，不补 px gap token）；
- 不动 studio.switchBranch(layout provider)；不动 §28 的 data-*-dispatch；
- 不做截图：browser 不可用。

## 后果

`VariantsBoard` 加入门面矩阵。Studio 剩余 ≈6 面板继续（TeamPanel/CommandBar/AgentPanel/ExportPanel*/GameCodeExport/CanvasStage/ViewerControls 等）。
