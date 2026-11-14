# §FE-17 · /notifications 收件箱 `.notif-` 门面化（2026-11-12）

## 改的是什么（三样，我的切片内）

- `apps/web/src/app/notifications/page.tsx`：className 全数换为 `.notif-*`（罗列 ↓），**文案、data 钩子、注册表现算、组件一个字没动**。
- `apps/web/src/app/globals.css`：新增 `.notif-` 家族 29 个类（tokens-only，`@media (min-width: 40rem)` 的双列 footer）。
- `apps/web/test/notifications-visual-style.test.ts`：12 例静态门（见 ADR-0165）。

## 类名映射与语义色纪律

| 语义角色 | 类 | 锚 token |
|---|---|---|
| 页壳/h1/lede（anonymous） | `.notif-page / .notif-anonymous / .notif-h1 / .notif-anonymousLede / .notif-anonymousLink` | `fg-1/fg-2/fg-3`, `accent-2-ink` |
| 通知铃行 + 全部标已读 | `.notif-bellrow / .notif-markreadAll` | flex 对齐 |
| 空态卡 | `.notif-empty` | border-subtle + bg-1 |
| 列表 + 行 | `.notif-list / .notif-row` | `border-subtle`, `last-of-type` 去底边 |
| kind 徽章 | `.notif-kind` | fg-3/bg-2 |
| **标题 已读/未读** | `.notif-titleMuted`(fg-3) / `.notif-titleLive`(fg-1) | 沉没/亮起两态 |
| 正文 `.notif-body` / 时间 `.notif-time` | fg-3 | 同上 |
| 链接去处 | `.notif-link` | accent-2-ink（双主题 AA） |
| 不可跳转 | `.notif-unavail` | **warn-ink**（黄，不等于红） |
| 翻页 prev/next | `.notif-prev`(bg-2/fg-2) / `.notif-next`(accent-1/accent-fg，hover: accent-2) | 双主题 AA |
| 双列 footer 40rem | `.notif-grid2` | sm=40rem（**不是** .cr- 的 48rem） |
| 清单三档 | `.notif-bulletList / .notif-h2 / .notif-kindName / .notif-panel / .notif-panelNote / .notif-foot` | fg-2/fg-3/fg-1 |

## 判分面（已实跑）

- `vitest run apps/web/test/notifications-visual-style.test.ts` → **12/12**
- `tsc -p apps/web --noEmit` exit 0
- `eslint page.tsx + test --max-warnings=0` exit 0
- dev 3100 活着；/notifications 路由可达（首请求慢编译时长、零 console error）；**未取得稳定截图**——
  宿主 Next dev 处于多 agent 并发写文件 + 慢编译抖动，浏览器上的 readyState='loading' 持续波动，本片**不编造**"真渲染效果完美"的证明。

## 诚实边界

- client 组件（NotificationBell / MarkRead / NotificationSettings）的渲染未做离线注入（无法保真）、也未做真 Chrome 垂直验证；
  视觉确认归下一个干净窗口 + a11y-internal.spec.ts 一类。
- 本机 dev 抖动不是本片引入（global 重写文件并发 + 首请求编译），Zero 本片行为代码副作用。
- 通知页不入 CI/e2e 门（唯一两个可跑路径 a11y-internal 需要夹具）。
- Axe 级判定：不属于本片。
