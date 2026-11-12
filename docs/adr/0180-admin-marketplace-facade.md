# ADR-0180：§FE-28 `/admin/marketplace` `.am-` 门面化——举报工单与审计表，三个处置按钮不动

- 状态：Accepted
- 日期：2026-11-12
- 关联：ADR-0178/0179 · §123/#158/#159 · `apps/web/test/admin-marketplace-visual-style.test.ts` · `docs/evidence/fe-28-admin-marketplace-facade/evidence.md`

## 背景

`/admin/marketplace` 是市场举报工单队列 + 最近 50 条市场审计日志：`page.tsx`（server，
getReports({status, limit:100}) + getAuditLog({limit:50})，denied×2）+ `TriageButtons.tsx`（client，
受理/结案/驳回）。页上明写「结案/驳回落的是工单结论、不撤内容」——本片只换皮，不动
REPORT_STATUSES 过滤、getReports/getAuditLog、行内提示并排展示（不动 outcome 三元）、
409 服务端语原样念。

## 决定

1. **新增 `.am-*` 门面族**（globals.css，`.ar-` 段之后）：`.am-shell/.am-scopeBox/.am-summary/.am-lede/
   .am-note/.am-note2/.am-linkInline/.am-linkTarget/.am-backlink/.am-filters/.am-filterChip/.am-filterIdle/
   .am-empty/.am-reportCard/.am-reportHead/.am-reportReason/.am-metaMono/.am-statusLabel/.am-closed/
   .am-audit/.am-auditTitle/.am-table/.am-thRow/.am-monoCell/.am-detailCell/.am-triage*/.am-noteInput/
   .am-btn/.am-btnDanger/.am-triageError`——双主题 token、零 hex、零动效、零 @media；
   focus-visible 覆盖所有交互件；`.am-noteInput` **补上了基线没有的 focus 环**
   （六红线：全控件可见聚焦环）；`.am-btnDanger` 锚 danger（驳回=举报不成立，
   accent-fg 墨字）+ `:disabled` 真禁用。
   - denied×2 完全复用 `.adm-denied/.adm-deniedTitle/.adm-deniedText`（§FE-26）。
   - 审计表不补 padding/border/hover（基线 Default-境，1:1 一致）。
2. **零行为恒等门**：`page.tsx` `84052785…`、`TriageButtons.tsx` `03379155…` 与 git HEAD 一致。
3. **判据**（13/13 绿）：server 组件门 · client 指令保留 · 三态 `send()` 原样进门 · 字面类全 adm/am-* ·
   零裸 Tailwind · 类名闭环 · 成规模（≥25）· 零 hex · token 全在 · 零新增颜色 token ·
   零 transition/@media · `.am-btnDanger` 锚 danger · **双文件 SHA256 守恒** · 钩子守恒
   （filter all+四态×2 + 六钩 + triage 5 钩）。

## 取舍

- 不动处置三态文案与 done 语义；不动 `router.refresh()`；不动 409 措辞。
- 不补 hover/transition——基线没有。
- 不做截图：browser 不可用。

## 后果

`/admin/marketplace` 加入门面矩阵。admin 其余：moderation（page+ResolveButtons）、
users×4、audit、observability、rate-limit、discover-cache、gateway、access。
