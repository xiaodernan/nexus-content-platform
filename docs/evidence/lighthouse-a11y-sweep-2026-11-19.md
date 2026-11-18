# Live evidence — Lighthouse a11y 全线全绿（2026-11-19 · cont.241）

> 用 in-app Chromium 在 `next start` 生产形态对 10 个关键页面跑 Lighthouse（accessibility / best-practices / SEO）。
> 所有页面在第三到第四轮探账的迭代后 **a11y 1.0 · best-practices 1.0 · SEO 1.0 · 失败项 0**。

## 起点（cont.241 之前）

首页 a11y **0.93**：
- `color-contrast` 全部落在为本人 §FE-QUICKSTART 设计的快开始 strip（`hp-quickStartKicker` / `hp-quickStartNum` / `hp-quickStartLink` 都用了 contrast ≈ 2.9:1 的 `--nexus-color-accent-mix`）
- `label-content-name-mismatch` 在 `cp-chip`（"打开命令面板" 的 aria-label 与可见的 "命令" 不一致）
- `target-size`：右侧底部主题 FAB 与键盘速览 FAB（kb-fab transition y bottom 12px + 36/40px box）完全重叠——真叠在 z-60 下的主题按钮不可点

## fix 1 · 双 FAB 竖排（真·实体块互相遮盖）

`kb-fab` 的 `bottom` 从 `max(space-4, env(safe-area-bottom, space-4))` 改为
`calc(space-3 + 6rem + env(safe-area-inset-bottom, 0px))` —— 主题 FAB（space-3）与语种 FAB（+3.75rem → +3rem？两次 refactor 后落地为 `calc(space-3 + 3.75rem)`）与键盘速览 FAB（+6rem）严丝合缝，12px 间隙，零遮挡、`z-60` 分层不再互盖。

## fix 2 · quickStart strip 对比度

`hp-quickStartKicker` / `hp-quickStartNum` / `hp-quickStartLink` 的颜色从 `--nexus-color-accent-mix`（light-theme ≈ 2.9:1，WCAG AA 失败）切到 `--nexus-color-accent-2-ink`（light ≈ 4.98:1 per token 注释，dark ≈ 10.9:1）。

## fix 3 · cp-chip 可访问名对齐

`chip: '命令'/'Cmd'` 改为 `'命令面板'/'Palette'`，aria-label 与可见文本一致——`role=button` 可读名确定。

## fix 4 · 结构核实 & 修复

通过对 globals.css 做 depth 扫描 + 浏览器端 `getComputedStyle` 交叉验证，确认 Tide-* 组合目前都在文件根级别（depth 0），且 colors/sizes 与 .web build 一致；fc 段仅保留 forced-colors 回退收口。实际渲染：chip 28.5px 高、11px mono、forced-colors 兼容。census 2967 / fe-gates 1353 全绿。

## fix 5 · aria-progressbar-name

/bible/quiz 的 bb-quiz progressbar 缺失可访问名——加 `aria-label={c.progressLabel}`（zh「本轮进度」/ en「Progress」）。§FE quiz SHA 重钉 `2afda47e…`。

## 终态（全部 1.0 / 1.0 / 1.0 · 0 失败）

- `/tide-oracle` · `/tide-wire` · `/bible` · `/bible/quiz` · `/bible/echo-026-the-forty-third-convocation`
- `/guide` · `/onboarding` · `/stategraph` · `/pulse` · `/onboarding` · `/discover`
- `/`（home）1.0/1.0/1.0（首探 exit 0 失败时为 0.93；修复后归零）

## 纪律

- 零 mock、零绕过 forced-400；所有改动零 Hex、零原子 Tailwind（census 验证至 class 定义）。
- 不碰 git hooks。SHA pin 只重钉过真的意图变更（home page strip、quiz 组件）；合格全绿后提交。
