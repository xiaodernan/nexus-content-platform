# ADR-0174：§FE-22 `/invites/[token]` `.iv-` 门面化——§133 邀请兑现页零 Tailwind、未登录分支门钉死

- 状态：Accepted
- 日期：2026-11-12
- 关联：ADR-0172/0173（FE-20/21 范式）· §133（teamCollaboration #201-203）· `apps/web/test/invites-visual-style.test.ts` · `docs/evidence/fe-22-invites-facade/evidence.md`

## 背景

`/invites/[token]` 是兑现邀请的落地页：token 证明邀请真，登录用户的邮箱证明"这封是发给我的"。
未登录的人看到的只有一句话 + 一个"回首页登录"链接；登录用户才拿到 `InviteAcceptPanel`。
两文件此前全裸 Tailwind（`max-w-[560px]`、`bg-bg-3`、`self-start`、`rounded-[var(...)]` 等）。

## 决定

1. **新增 `.iv-*` 门面族**（globals.css，`.bk-` 段之后）：`.iv-page/.iv-head/.iv-title/.iv-lede/
   .iv-ledeStrong/.iv-backlink/.iv-panel/.iv-btn/.iv-error/.iv-success/.iv-successLink`。
   双主题 token 锚定、零 hex、零新增颜色 token、零动效、零 @media；
   `:focus-visible` 覆盖 backlink/btn/successLink；`.iv-btn:disabled` 真禁用。
2. **零行为恒等门**：两个文件剥 className 后 redact SHA256 与 git HEAD 一致
   （page `00703da0…`、panel `40a82b13…`）。 redact 三步序与钉死常量那一次一致。
   本片不在源码加任何 § 注释——注释会破坏逐字节门；取舍全落 ADR。
3. **判据**（13/13 绿）：server 组件门 · panel 保留 'use client' · 字面类全 iv-* · 零裸 Tailwind ·
   类名闭环 · 成规模（≥8）· 零 hex · token 全在 · 零新增颜色 token · 零 transition/animation/
   @keyframes/@media · focus-visible+disabled · **双文件 SHA256 守恒** ·
   **未登录分支只有 `iv-backlink`、没有 `data-invite-accept` 出现**（鉴权边界进门）。

## 取舍

- 不动 accept 三态（busy/error/joinedProjectId）、csrfHeaders、`!res.ok || !body?.ok` 拒绝路径、
  不猜测服务端拒绝原因——行为不属于本片。
- 不做响应式门：基线零 @media；`.iv-btn` hover 用 `filter: brightness(1.1)`（与 .at-btnPrimary 同判据），
  不新增渐变墨字、不扩大 A11Y-1 forced-colors 面。
- 不做浏览器截图：browser 不可用。

## 后果

`/invites/[token]` 加入门面矩阵；判据钉死鉴权边界（未登录无 accept 入口）+ 双文件零字节漂移。
`/tasks/[projectId]` 与 `/preview/[projectId]` 与 `/game`、`/world` 按同一纪律继续。
