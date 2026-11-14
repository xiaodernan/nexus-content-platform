# ADR-0173：§FE-21 `/blocks` `.bk-` 门面化——§132 黑名单页零 Tailwind、零行为双锚

- 状态：Accepted
- 日期：2026-11-12
- 关联：§FE-20（ADR-0172 /api-tokens）· §132（黑名单设计）· `apps/web/test/blocks-visual-style.test.ts` · `docs/evidence/fe-21-blocks-facade/evidence.md`

## 背景

`/blocks`（§132）是"我自己拉黑/屏蔽了谁"的账号侧清单页，外加唯一的交互面
`UnblockButton.tsx`（解除关系）。两文件此前全裸 Tailwind（`max-w-[720px]`、`min-w-0`、`truncate` 等），
是公开账号页最后几张未门面化的页面之一。本片只换 className、零行为：文案、`listBlocks` 读路径、
`requireUser` 守卫、data 钩子、CSRF/router.refresh 逻辑一字不改。

## 决定

1. **新增 `.bk-*` 门面族**（globals.css，`.at-` 段之后）：`.bk-page/.bk-head/.bk-title/.bk-backlink/
   .bk-lede/.bk-sectionTitle/.bk-sectionEmpty/.bk-list/.bk-row/.bk-rowMain/.bk-rowName/.bk-handle/
   .bk-rowMeta/.bk-btnWrap/.bk-btn/.bk-error`——双主题 token 锚定、零 hex、零新增颜色 token、
   零动效、零 @media；`:focus-visible` 环覆盖 backlink/handle/btn；`.bk-btn:disabled` 真禁用（busy）。
   - **零行为两红线**：段内**不放任何 danger 系按钮**——本页的动作都是"解禁"（可逆、记录保留），
     不配红色；`handle` 链接=accent-2-ink（双主题 AA）；两个 `<section>` **不加类**（保持 block 流式
     布局 1:1 对齐基线，避免容器引入新 flex 上下文改变子渲染）。
2. **零行为恒等门**：`page.tsx` 与 `UnblockButton.tsx` 剥 className 后 redact SHA256 与
   `git HEAD` 改前一致（page `05890c4b…`、button `6b50e8c5…`；redact 三步序与钉死常量那一次一致）。
   本片**不新增任何源码行**（未在 jsdoc 加 § 注释——注释会破坏逐字节门；"只换 className"写进 ADR 而非源码）。
3. **判据**（14/14 绿，`blocks-visual-style.test.ts`）：server 组件/client 保留 · 字面类全 bk-*
   · 零裸 Tailwind · 类名闭环 · 成规模（≥12）· 零 hex · token 全在 · 零新增颜色 token ·
   零 transition · 零 @media · focus-visible+disabled · **双文件 SHA256 守恒** · 钩子守恒（page 9 + button 2）。

## 取舍

- 不碰路由级 auth 语义（`requireUser` 抛/重定向）；不动 `router.refresh()` 节流——两个都是行为，不是样式。
- 不做响应式门：页面基线零 `@media`，不引入新断点。
- 不做浏览器截图：browser 不可用；如实记录在 evidence。

## 后果

`/blocks` 与平台门面矩阵同源；判据覆盖双文件 SHA256，任何人改这两处非 className 字节都必须 bump 常量+ADR。
账号页最后几张（/invites、/tasks、/game、/world、/preview）按同一纪律继续。
