# ADR-0226：§FE-73 `PublicationActions.tsx` `.pu-` 门面化——§59 作品页互动

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-72 · `apps/web/test/publication-actions-visual-style.test.ts` · `docs/evidence/fe-73-publication-actions-facade/evidence.md`

## 背景

`PublicationActions.tsx` 是渲染在公开发布页底部的互动条：Like / Follow / Remix / Save / Share / Comment，全走 POST（`/api/published/interact`、`/api/follow`，CSRF），notice 如实显示服务端回话（机检卡评论时写"这条没发出去 + 为什么"——不糊"发送失败"）。Remix 分叉一份改编（§58）、Save 收的是"这一版"（冻结快照）。

## 决定

1. 新增 `.pu-*` 门面族（globals.css）：`pu-root/pu-row/pu-btn/pu-hint/pu-authorLink/pu-shareBtn/pu-commentRow/pu-input/pu-submitBtn/pu-commentList/pu-commentItem/pu-commentAuthor`；`pu-shareBtn:hover` 整段换皮。
2. **零行为恒等门**（redact）：`23a9bb10…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：client + csrfHeaders/router 进门 · 14 个数据钩子守恒 · 字面类全 pu-* · 零裸 Tailwind · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · 零 transition/@media/@keyframes · **SHA256 守恒**。

## 取舍

- 不动 busy gating、idempotency、`navigator.clipboard.writeText` 失败时的外推文案；
- textarea 不补 `resize`/`outline` 定制——本片节制（focus 走 preflight/brand default styles）；
- `disabled:opacity-50` → `:not(:disabled)`/`:disabled` 配对在 `.pu-btn`/`.pu-submitBtn` 内闭合，不搞 JS 状态分支。

## 后果

发布页互动条加入门面矩阵——`/n/...` 公开页所有 className 全部 token 化（`.np-`·`.is-`·`.pu-`）。
