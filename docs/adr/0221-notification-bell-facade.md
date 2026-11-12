# ADR-0221：§FE-68 `NotificationBell.tsx` `.nb-` 门面化——§164 顶栏铃铛

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-67 · `apps/web/test/notification-bell-visual-style.test.ts` · `docs/evidence/fe-68-notification-bell-facade/evidence.md`

## 背景

`NotificationBell.tsx` 是公开页/Studio 顶栏共用的铃铛：只报"查没查到"和"几条没读"。fetch 失败走 failed 分支、无会话（401）返回空、只有真查到数才写数。
§163 落地后加了实时订阅：真的推来一条 notification 就重新查一次数，**不**把事件里的标题累加到未读数（按库为准；断线时不累计——ADR-0010 后果第 4 条）。

## 决定

1. 新增 `.nb-*` 门面族（globals.css）：`nb-faint/nb-row/nb-link`。`.nb-link` 只设 `color: accent-2-ink` + underline（无 hover、无 transition、无新颜色 token）。
2. **零行为恒等门**（redact）：page `4e478645…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：client + useRealtime/onReconnect 进门 · 字面类全 nb-/复用族 · 零裸原子（含 `hover:text-fg-1` 当场改为 `.nb-link` 本色）· 类名闭环 · 零 hex · token 全声明 · 零新增颜色 token · 零 transition/@media/@keyframes · **SHA256 守恒** · 钩子守恒（data-notification-bell/ready/failed/loading/unread + data-realtime）。
4. 结构化归位：`text-11 text-fg-3` → `.nb-faint` · `flex flex-wrap items-center gap-2` → `.nb-row` · `text-accent-2-ink underline` → `.nb-link`。

## 取舍

- 不动 `useRealtime`/`REALTIME_TEXT`/refresh 调用顺序；不动签名态 `enabled: summary !== null && !signedOut`；不动三态渲染（failed → text "没读到"）。
- 不引入 AGENTS 标记（data-notification-bell 三态自给：failed/loading/ready + unread + realtime）。
- 不做截图：browser 不可用。

## 后果

`NotificationBell` 加入门面矩阵。`Studio 门面化`=`public 门面化`，头部一行共用。
