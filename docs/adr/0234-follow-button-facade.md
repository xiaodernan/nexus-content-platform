# ADR-0234：§FE-81 `FollowButton.tsx` `.fw-` 门面化——§60 关注按钮

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-80 · `apps/web/test/follow-button-visual-style.test.ts` · `docs/evidence/fe-81-follow-button-facade/evidence.md`

## 背景

§60 主页关注按钮：状态从服务端带进来（`initialFollowing`/`initialFollowers`），这里只发请求并显示真实回话。三个裸原子位点：`fw-wrap` 容器、主按钮、error 边注。

## 决定

1. 新增 `.fw-*` 门面族（globals.css，`.pf-pageRoot` 之后）：`fw-wrap/fw-btn/fw-error`。`disabled:opacity-50` → `:disabled`（半透+not-allowed）；`fw-wrap` 用 `inline-flex`（公开页按钮挂在文本流里，不是块级）。
2. **零行为恒等门**（redact）：`64a54814…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：client + csrfHeaders 进门 · 钩子守恒（data-follow-button/error） · 字面类全 fw-* · 零裸 Tailwind · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- 不动 `Number(body.followers ?? followers)` 容错；
- 不加 `:focus-visible`——主按钮是提交性质控件，键盘环由 preflight+brand 现状呈现（同家族节制）；
- 不造 `fw-btnOn/Off` 两个态——当前按钮只显示文字+计数，不需要态类。

## 后果

`FollowButton` 加入门面矩阵。§60 主页控件面推进。
