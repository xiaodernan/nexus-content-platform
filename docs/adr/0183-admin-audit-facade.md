# ADR-0183：§FE-31 `/admin/audit` `.am-*`/`.tl-*` 门面化——六列审计表，横滚键盘可达进门

- 状态：Accepted
- 日期：2026-11-12
- 关联：ADR-0175 · §80/§84 · `apps/web/test/admin-audit-visual-style.test.ts` · `docs/evidence/fe-31-admin-audit-facade/evidence.md`

## 背景

`/admin/audit` 是 §80/§84 的审计事件页：最近 100 条决定（登录/注册、人工裁决含越权尝试、发布/下架/取消发布、角色变更）。
deny×2 + AdminNav + 六列宽表。390 下横滚 + `role="region"` + `tabIndex={0}` 是 baseline 纪律（第五十一片的截图读数），本片只换皮，不重排列。

## 决定

1. `.am-shellWide`（67.5rem、gap-4）/`.am-detailMin`（min 16rem + max 24rem + break-all + fg-3）/复用 `.tl-tableScroll` `.tl-table` `.tl-thRow` `.tl-tdNowrap`。
   denied×2/summary/scope/empty 全部复用 `.adm-*`/`.am-empty`。
2. **零行为恒等门**：`199d910c…` 与 git HEAD 一致。
3. **判据**（9/9 绿）：server 组件门 · denied×2 + role 闸门 · AdminNav current="audit" ·
   横滚区 `role="region"`+`tabIndex={0}`+aria-label 进门 · 钩子守恒 · 字面类全 adm/am/tl-* ·
   零裸 Tailwind · 类名闭环 · 零 hex · 零新增颜色 token · SHA256 守恒。

## 取舍

- 不动 `listAudit(100)`、DELETED_USER_LABEL、宽表结构与横滚策略（不撑视口）。
- 不补 hover/zebra/stripes（baseline 无）。
- 不做截图：browser 不可用。

## 后果

`/admin/audit` 加入门面矩阵。剩余 admin：access / gateway / discover-cache / observability / rate-limit。
