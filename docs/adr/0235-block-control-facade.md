# ADR-0235：§FE-82 `BlockControl.tsx` `.bc-` 门面化——§132 自助治理

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-81 · `apps/web/test/block-control-visual-style.test.ts` · `docs/evidence/fe-82-block-control-facade/evidence.md`

## 背景

§132 主页自助治理：屏蔽（`mute`：内容/通知/评论列表滤掉他，他照样能留言）与拉黑（`block`：互相不能评论/赞/关注/改编+解除已有关注）两个动作摆明面——藏起来就等于让人凭感觉选更重的动作。本片六处原子。

## 决定

1. 新增 `.bc-*` 门面族（globals.css，`.fw-error` 之后）：`bc-root/bc-row/bc-btn/bc-hint11/bc-note/bc-error`。
2. **零行为恒等门**（redact）：`3825924d…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：client + csrf/router 进门 · `data-block-*` 全钩守恒 · 字面类全 bc-* · 零裸 Tailwind · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- 不动 POST/DELETE 双谓词、`router.refresh()` 语义（屏蔽名单影响已渲染内容）；
- `.bc-note` 保留 `text-align: right` 与 22rem 上限（公开页右对齐边注原样）；
- 不引入"升级为拉黑"的视觉强调——那是产品层跃迁动作，样式克制即可。

## 后果

`BlockControl` 加入门面矩阵。§60 主页自助治理面门面化完成。
