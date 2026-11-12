# ADR-0165：收件箱 /notifications 页 `.notif-` 门面化（FE-17）

- 状态：Accepted
- 日期：2026-11-12
- 关联：ADR-0123（六红线）· ADR-0154（静态判据真代码纪律）· ADR-0158~0164（FE-10~16 门面化序列）

## 背景 / 缺口

`/notifications` 是通知中心——按人存放的 feed、`§164` 由注册表现算的清单、翻页、未读亮起/已读沉没、
链接/不可跳转、三档空白态。它一直在跑，但只有一套裸 Tailwind 原子类在撑（`flex flex-wrap items-baseline`、
`border-b last:border-b-0`、`w-full`、`sm:grid-cols-2`），跟 FE-10~16 家族差了一整截。本片把它的 className 归
`.notif-*`，**文案 / data 钩子 / 注册表读路径 / 组件（NotificationBell/MarkRead/NotificationSettings）一字不改**。

## 决定

1. `notif-*` 家族（29 个类）锚既有双主题 token；零新增颜色 token、零 hex、零 `var(--nexus-color-*)` 之外的色源。
2. **响应式分档对账**：Tailwind v4 默认 sm = **40rem**，md = 48rem（不是 .cr- 那片的 48rem）；
   双列 footer 原 `sm:grid-cols-2` 真编译到 `@media (min-width: 40rem)`，故 `.notif-grid2` 用 **40rem**。
3. **语义色纪律**：未读 `notif-titleLive` = `fg-1`（亮起），已读 `notif-titleMuted` = `fg-3`（沉没）；
   链接 `notif-link` = `accent-2-ink`（双主题 AA）；不可跳转 `notif-unavail` = `warn-ink`（黄，不等于红——
   "这一格没法跳" 不是错，§164）；kind 徽章锚 fg-3/bg-2（石板底，不抢标题）。
4. 零 hover 动效、零 transition/animation → 不设 reduced-motion 假门（无动效可被 reduced-motion 管）。

## 验证（如实记，不编）

- **`vitest run apps/web/test/notifications-visual-style.test.ts` → 12/12 GREEN**（去注释判据：
  零 client 指令 / 匿名分支不挂 client 组件 / 钩子闭环 / `.notif-*` 基础定义闭环 / 注释物理隔离的 segment 断言
  48rem 不出现、40rem 出现 / 语义色 `-ink` 真落 / 零 transition / 零裸原子 / 档位钩子在）。
- **`tsc -p apps/web --noEmit` exit 0** · **`eslint page.tsx + test --max-warnings=0` exit 0**。
- **零行为变更**：page.tsx 只换 className 字面值（数据流、搜索参数语义、注册表现算、钩子名不动）。
- **浏览器那一寸不在本片范围**：NotificationBell/MarkRead/NotificationSettings 均为 client 组件，
  `page.setContent` 离线注入的真实结构可被渲染成静态近似但不等于 React 真挂载；
  且本机 Next dev 处于多 agent 并发写文件 + 服务器资源竞争状态，页面一直处于慢编译/编译中抖动
  （`readyState='loading'`、generation 爬升），**未取得稳定的真 Chrome 截图**。
  视觉侧确认留给干净窗口 + `a11y-internal.spec.ts` 一类套件；axe/判绿不编造。

## 后果

- 收件箱 `/notifications` 至此与 FE-10~16 家族视觉同级（server 展示页全数 `.notif-/.cr-/.me-/.mr-/.mi-/.mp-/.an-/.tc-/.nf-` 化）；
  剩余裸 Tailwind 密集页如实点清，不谎称全库归零。
- 通知页的渲染契约（注册表现算、empty/anonymous/unbacked 三档、pagination、语义色沉没/亮起）以 `.notif-*` 锚定——
  之后任何"换皮"必须先过 `notifications-visual-style` 的 12 个静态门。
