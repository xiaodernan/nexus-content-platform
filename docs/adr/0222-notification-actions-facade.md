# ADR-0222：§FE-69 `NotificationActions.tsx` `.nd-` 门面化——§164 标记已读按钮

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-68 · `apps/web/test/notification-actions-visual-style.test.ts` · `docs/evidence/fe-69-notification-actions-facade/evidence.md`

## 背景

`NotificationActions.tsx` 导出 `MarkRead`——§164 顶栏"标记已读"按钮：POST `/api/notifications/read`（CSRF header + `all`/`ids` 两种模式），回显"已标记 N 条"原样显示（0 也是一个真数字——要么本来已读，要么这些 id 不是你的收件箱里的）。调用后 `router.refresh()` 让服务端重新渲染。

## 决定

1. 新增 `.nd-*` 门面族（globals.css，`.nb-` 段之后）：`nd-readBtn` + 复用 `.nb-resultInk`（边注字体，不归零名空间但属于同一片）。
   - `.nd-readBtn`：透明底、细边、`:hover:not(:disabled)` 走 `bg-2`、`:focus-visible` 品牌色 outline、`:disabled` 半透+`not-allowed`。
2. **零行为恒等门**（redact）：`ced6592a…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：client + router/csrfHeaders 进门 · 字面类全 nd-/nb- · 零裸 Tailwind · 类名闭环 · 零 hex · token 全声明 · 零新增颜色 token · 零 transition/@media/@keyframes · **SHA256 守恒** · 钩子守恒（data-notification-result）。

## 取舍

- 不动 CSRF/POST/busy/result/router.refresh 六名；不动 `res.json().catch(() => null)` 容错路径。
- `hover` 走 `:not(:disabled)` 修饰而不是 JS `disabled ? …`——CSS 层闭合，与禁用语义一致。
- `focus-visible` 使用 brand outline 而非背景翻转——键盘可见性优先。

## 后果

`NotificationActions` 加入门面矩阵。本族与 `.nb-`（铃铛）、`.np-`（公开分享页）共同构成通知面板家族，三片全部零行为换皮。
