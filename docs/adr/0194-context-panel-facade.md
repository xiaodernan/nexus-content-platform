# ADR-0194：§FE-42 `ContextPanel.tsx` `.cx-` 门面化——§66-71 Context Engine 首片

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-37 · `apps/web/test/context-panel-visual-style.test.ts` · `docs/evidence/fe-42-context-panel-facade/evidence.md`

## 背景

`ContextPanel.tsx` 是 §66-71 Context Engine 的面板：把"Agent 每次该知道的那些事"摊开给人看。面板原本同时是 Studio 里对不上 token 体系的面板：
`.token-less.white-alpha(bg-white/[0.03])`、纯 `white-100/40` 原子、inline 任意 font-size atom。整面前文用数百行 `rgb(255+...)` 和 `white/[level]` 拼出来——不过已全数等价换双主题 token。本次零行为恒等（`9a24d764…` 与 HEAD 字节一致）。

## 决定

1. **新增 `.cx-*` 门面族**（globals.css，`.se-` 段之后）：
   - 根/header h2/reload/lede/error/card/totals/num/codeLine/budgetRow/input/trimmed/echo/row/head/body/pill(.pillIndexed/Partial/Unset)/note/mono/miniBtn/block/blockText/dangerText/muted，共 40 条定义；
   - 逐行平移：`text-white/45` → fg-3；`text-white/60` → fg-2；`bg-white/[0.03]/[0.02]` → `var(--nexus-color-bg-1)`；`border-white/10` → `border-subtle`；`white/15` → `border-strong`；`bg-black/30` → `bg-bg-0`；`red-*` → color-mix 进 success/warn mix 的 success/danger tokens（AA 双主题）。
2. **零行为恒等**：strip juncture `{@}/cn()` 两次替换与 HEAD 严格一致（`9a24d764…`，`.replace(/className=("@"|\{@\})/g, 'className=@')` 顺序齐定双门）。
3. **判据**（10/10 绿）：heading 主线（'use client' + useStudioReady）· 字面类全 cx-* · 零 Tailwind（cx- 外）· 零裸 Tailwind/Tailwind arbitrary value · 成规模段 ≥ 40 条 · 三态 pill 定义齐全 · 零 transition/@media/@keyframes/hex · token 全声明 · **SHA256 守恒** · 钩子守恒。

## 取舍

- 不动 `useStudioReady`/load(null) 引导路径、不动预算 0=关闭裁剪 的线、不动 3 处白底 atom 的语义。
- 不动 §49 整块语料库整数组的 load/query 流程。
- 不做截图：browser 不可用。

## 后果

`ContextPanel` 加入门面矩阵。Studio 27+ 面板继续按同一纪律推进。
