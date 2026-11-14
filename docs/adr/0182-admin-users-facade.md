# ADR-0182：§FE-30 `/admin/users` `.au-` 门面化——账号与角色 + 过期访客回收，三条 client 路径不动

- 状态：Accepted
- 日期：2026-11-12
- 关联：ADR-0180/0181 · §131 · ADR-0072 · `apps/web/test/admin-users-visual-style.test.ts` · `docs/evidence/fe-30-admin-users-facade/evidence.md`

## 背景

`/admin/users` 是 §131 自助提权收口页：`page.tsx`（server：denial×2 + accounts list + guest reclaim snapshot +
PlanSelect/RoleButton 入口）+ `GuestReclaimPanel.tsx`（client，8/屏、沉默判据、回执服务端算）+
`PlanSelect.tsx`（下拉 + 「改档位」再点一次）+ `RoleButton.tsx`（降为普通/提为审核员）。改角色三条硬规
则判定全在服务端（domain/roles.ts）：不能改自己、guest 不提权、改别人前提是审核员——本片不动。

## 决定

1. **新增 `.au-*` 门面族**（globals.css，`.am-` 段之后）：`.au-shell/.au-row/.au-rowMain/.au-rowName/
   .au-guestTag/.au-actions/.au-select/.au-reclaimRoot/.au-sectionTitle/.au-counts/.au-pickAll/.au-pageRow/
   .au-reclaimRow/.au-navBtn/.au-ghostBtn/.au-applyBtn/.au-notice/.au-list`——双主题 token、零 hex、
   零动效、零 @media；focus-visible/cta-state 全部落环；
   `.au-applyBtn` 锚 accent-2（批量收走 guest 的唯一 CTA），`.au-navBtn` 强边框（翻屏）。
   denied×2 复用 `.adm-*`；按钮复用 `.am-btn`；handle 链接复用 `.am-linkTargetSub`；
   名單 ul 复用 `.am-findingsList`；in-note 按钮复用 `.am-btn`。
2. **零行为恒等门**：四文件剥 className 后 SHA256 与 git HEAD 一致
   （page `ad3ff95d…`，plan `1d403f70…`，role `2701465c…`，reclaim `ffcfd0b0…`）。
   reclaim-state 的 8/屏分页、全选三态（indeterminate 判据）、回执由服务端算——全不动。
3. **判据**（12/12 绿）：server 组件门 · client 指令 ×3 · 字面类全 adm/am/au-* · 零裸 Tailwind ·
   类名闭环 · 成规模（≥10）· 零 hex · token 全在 · 零新增颜色 token · 零 transition/@media ·
   applyBtn/navBtn/select focus 环 · **四文件 SHA256 守恒** · 19+ 钩子守恒。

## 取舍

- 不动 reclaim-state.ts（indeterminate 判据是读屏语义）；不动 aria-label / aria-live=polite。
- 不动三条硬规则判定路径；改角色按钮视觉与改档位主次分明（单按钮 vs 下拉+确认）。
- 不做截图：browser 不可用。

## 后果

`/admin/users` 加入门面矩阵。admin 其余：access/observability/rate-limit/discover-cache/audit/gateway。
