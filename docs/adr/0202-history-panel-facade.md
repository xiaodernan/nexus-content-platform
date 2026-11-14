# ADR-0202：§FE-50 `HistoryPanel.tsx` `.hi-` 门面化——§27/§108 用户项目历史（Snapshot）

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-49 · `apps/web/test/history-panel-visual-style.test.ts` · `docs/evidence/fe-50-history-panel-facade/evidence.md`

## 背景

`HistoryPanel.tsx` 是 §27/§108 的**用户项目历史**面板（与本地 Command 撤销栈、开发 git 历史三件事分开看，AGENTS.md §108）+ §28 分支 + §27 Duplicate。
组成：快照列表 + source chip（manual/ai/import/publish/branch）+ compare/restore 双键 + 分支切换 + jumpTo 派发。
行里内联 diff 是 §151 AI Diff（只列安全简洁的工作结果，不显示模型思维过程）。

本片只换皮；restore 二次确认流、jumpTo/DiffRow 派生——一字不动。

## 决定

1. **新增 `.hi-*` 门面族**（globals.css，`.gp-` 段之后）：64 定义——布局（rootCol/sideHeader/headRow/headRowTight/headBordered/listScroll/listMeta/diffRow/diffHead/cellFaint(B)/cellPad(12)/cellWarn/warnCell/warnInk/railToggle/search84/growSearch(12)/wrapCenter1/flex2Scroll/flex3Col/row2gap/row2mono/entryRow/entryRow:hover/entryCurrent/stretch/monoBreak/monoTrunc/monoTruncFaint/monoFaintShrink/truncFaint/trunc12/trunc12color/faint12/ink/cursorRow/listMeta/listScroll/diffList/diffListCapped）、
   排序/筛选/按 kind 色码 chip（chipSm/antOn/antOff/restoreWarn/branchTab/diffBadge/badgeRemoved|Added|Idle/sourceChip/sourceChip2/sourceAi/sourceIdle/chipGhost）。
2. **cn 三元统一映射**：kind badge → `.hi-diffBadge + .hi-badgeRemoved/hi-badgeAdded/hi-badgeIdle`（removed=warn、added=success、其余 Idle；两枚中文 label 等价 KND_LABEL）；source chip → `.hi-sourceChip2 + .hi-sourceAi | .hi-sourceIdle`；compare/restore 共用 `.hi-chipSm`（`:disabled` 昏暗 .5），分别按 `hi-antOn`(cmp selected)/`hi-antOff`(else)/`hi-restoreWarn`(pending) 分档；entry current row → `.hi-entryCurrent`。
3. **零行为恒等门**（redact）：page `3a3f9d02…` 与 HEAD 字节一致（cn(…) 整体归一后比对）。
4. **判据**（10/10 绿）：client + studio(compareSnapshot/createSnapshot/restoreSnapshot/jumpTo/switchBranch/createBranch) 进门 · 字面类全 hi-*/wd-*/gp-*/pp-* · 零裸原子 · 类名闭环 · 段成规模 · 零 hex · token 全声明 · 零新增颜色 token · 零 transition/@media/@keyframes · **SHA256 守恒** · 钩子守恒（data-history-diff/entry/diff-list/current 系列 + data-snapshot-compare/restore + data-branch-*）。

## 取舍

- 不动 `STATE_TEXT`、jumpTo/duplicateProject/switchBranch 的调用顺序；
- `space-y-[2px]` 转换为 `display:flex + flex-direction:column + gap:2px`——同一行距 token，不引入 Tailwind 工具类；
- `.hi-diffListCapped` 只在 `entry.diff.length > 0` 时加——`max-height: 15rem` ≈ 240px（max-h-[240px]）；
- `accent-[var(--nexus-color-brand)]` → 复用 `.pp-checkBrand`（FE-45 同一族单行，不新开 hi- 支线）。

## 后果

`HistoryPanel` 加入门面矩阵。Studio 余 14 面板继续。
