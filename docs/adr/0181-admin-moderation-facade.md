# ADR-0181：§FE-29 `/admin/moderation` `.am-` 门面化——人工复核台，两个核决按钮不动

- 状态：Accepted
- 日期：2026-11-12
- 关联：ADR-0180 · §131 · `apps/web/test/admin-moderation-visual-style.test.ts` · `docs/evidence/fe-29-admin-moderation-facade/evidence.md`

## 背景

`/admin/moderation` 是人工复核台：`page.tsx`（server，listReviewQueue()，denied×2，MODERATION_LIMITS
覆盖不到的部分明写）+ `ResolveButtons.tsx`（client，放行 / 拒绝并撤下——审核链上唯一能写下
approved/rejected 的地方；拒绝会让公开 URL 当场 404）。本片只换皮；listReviewQueue、
isKnownStats 无关、MODERATION_LIMITS 原样、rejected→404 语义不动。两文件形状与 §FE-28 高度复用
`.am-*`+`.adm-*`（denied 系 / scopeBox / reportCard / dangerNote 新增）。

## 决定

1. **`.am-*` 族补小件**（globals.css，`.am-` 段内）：`.am-shellDenied/.am-shellMid/.am-limitsList/
   .am-findingsList/.am-findingText/.am-ruleMono/.am-findingWhere/.am-dangerNote/.am-linkTargetSub`。
   denied 分支宽与基线逐字：匿名/not-admin=45rem，ok 主区=61.25rem、gap space-6。
2. 判据纪律同 §FE-28：字面类全 adm/am-*、零 Tailwind、类名闭环、零 hex、token 全在、
   零新增颜色 token、零 transition/@media、.btnDanger 锚 danger。
3. **零行为恒等门**：page `585733e5…`、resolve `1917a942…` 与 git HEAD 一致。
4. **判据**（11/11 绿）：server 组件门 · client 指令保留 · 两态 `resolve()` POST 进门 ·
   字面类全 adm/am-* · 零裸 Tailwind · 类名闭环 · 零 hex · token 全在 · 零新增颜色 token ·
   零 transition/@media · btnDanger/POST/danger 语义守恒 · **双文件 SHA256 守恒** · 钩子守恒。

## 取舍

- 不动规则版本（MODERATION_RULES_VERSION）、MODERATION_LIMITS 列表、machine-narrow 的 decision chip 语义。
- 不动 findings 的 rule mono、where 块的位置呈现。
- 不做截图：browser 不可用。

## 后果

`/admin/moderation` 加入门面矩阵。admin 其余：access/observability/rate-limit/discover-cache/
users×4/audit/gateway/observability。
