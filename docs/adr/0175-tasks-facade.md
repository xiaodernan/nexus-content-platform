# ADR-0175：§FE-23 `/tasks/[projectId]` `.tl-` 门面化——§112 任务账本活半页，键盘可达滚动区进门

- 状态：Accepted
- 日期：2026-11-12
- 关联：§FE-22（ADR-0174）· §112/§162/§75 · `apps/web/test/tasks-visual-style.test.ts` · `docs/evidence/fe-23-tasks-facade/evidence.md`

## 背景

`/tasks/[projectId]` 是 §112 的账本视图：路由 page.tsx 零样式（server 直读库渲染第一屏后
交给 client 组件），真表在 `components/TasksLedgerLive.tsx`（'use client'，订阅
`generation.progress` 重读、`onReconnect` 兜底），每行的重试按钮在 `TaskRetryButton.tsx`
（§162 重试开新行 attempt+1）。此前全裸 Tailwind（`max-w-[1080px]`、`min-w-[880px]`、
`min-h-6`、`whitespace-nowrap` 等）。

## 决定

1. **新增 `.tl-*` 门面族**（globals.css，`.iv-` 段之后）：`.tl-page/.tl-head/.tl-title/.tl-summary/
   .tl-tools/.tl-realtime/.tl-back/.tl-note/.tl-scope/.tl-empty/.tl-tableScroll/.tl-table/.tl-thRow/
   .tl-tdMuted/.tl-tdNowrap/.tl-retryWrap/.tl-retryBtn/.tl-retryNote`——双主题 token 锚定、
   零 hex、零新增颜色 token、零动效、零 @media。
   - **表格默认间距 1:1 守恒**：基线无 `border-collapse`（`border-separate` + 2px 间距）、无单元格
     padding——本段一律不补，视觉与基线一致。
   - `.tl-back` 保留 `min-height`（WCAG 2.5.8 触控下限），`underline-offset`。
2. **零行为恒等门**：三文件剥 className 后 redact SHA256 与 git HEAD 一致
   （live `1e7aa68d…`、retry `b90012c2…`、page `bd7e0e61…`；redact 三步序与钉死常量那次一致）。
   page.tsx 本片零改动（本来就没有 className）。
3. **判据**（13/13 绿）：server 组件门（零 className 进门）· client 保留 ×2 · 字面类全 tl-* ·
   零裸 Tailwind · 类名闭环 · 成规模（≥15）· 零 hex · token 全在 · 零新增颜色 token ·
   零 transition/animation/@keyframes/@media · focus-visible+disabled ·
   **横滚区 `role="region"` + `tabIndex={0}` + `aria-label` 守恒**（axe: scrollable-region-focusable）·
   数据钩子守恒（live 13 + retry 2）· **三文件 SHA256 守恒**。

## 取舍

- 不动实时订阅/重读判据（generation.progress 单一事件源、onReconnect 兜底、250ms 合流）——行为。
- 不动用量三档（§75：real/demo/missing）、不动 STATUS_TEXT 六态、`suppressHydrationWarning`、
  `usageKind`/`usageText` 纯函数——行为。
- 不做浏览器截图：browser 不可用。Browser golden 未跑。
- 不做响应式门：基线零 @media；横滚区 + `min-width: 55rem` 的策略（表格自滚、不压缩列）原样保留。

## 后果

`/tasks` 加入门面矩阵；判据覆盖到键盘可达滚动区。其余未门面化页：/game、/world（运行时壳，
共享 none/broken/ok 三态）、/preview、/blocks 之后的 /studio 30+ 面板（进行中/大块）。
