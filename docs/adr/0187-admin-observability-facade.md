# ADR-0187：§FE-35 `/admin/observability` `.am-*` 门面化——两张故意不合并的表，@media 48rem 逐字平移

- 状态：Accepted
- 日期：2026-11-12
- 关联：ADR-0186 · `apps/web/test/admin-observability-visual-style.test.ts` · `docs/evidence/fe-35-admin-observability-facade/evidence.md`

## 背景

`/admin/observability` 是 观测读侧补回来的一页：上半进程内计数器（本实例、重启清零）+ 下半库里的三本账
（审计决定/生成任务/API 调用，跨重启）——故意不合并，页面明写这一句。denied×2，AdminNav current="observability"。
本片只换皮；snapshot()/readLedger(24)/ledger 映射逐字节一致。

## 决定

1. **`.am-*` 族补件**：`.am-shellGapXl`（67.5rem、gap-5）`.am-tableNarrow`（min-520px 成形表）`.am-monoMuted`（mono fg-3）
   `.am-headRowTight`（flex-wrap/g-3/g-1）`.am-ledgerTitle`（11px 600 fg-2）`.am-ledgerGrid`（→48rem×3col 逐字平移 Tailwind md:grid-cols-3）。
   两张表复用 `.tl-tableScroll`/`.tl-table`/`.tl-thRow`；empty/sections 复用 `.adm-capNote`/`.am-audit`/`.am-sectionHeadSm`；
   ledger 首列三元 `j === 0 ? 'am-monoCell' : undefined`。
2. **零行为恒等门**：`de5043a1…` 与 git HEAD 一致。
3. **判据**（11/11 绿）：server 组件门 · snapshot/readLedger 进门 · role="region"+tabIndex 进门 ·
   字面类全 adm/am/tl-* · 零裸 Tailwind · 类名闭环 · 零 hex · 零新增颜色 token ·
   `.am-ledgerGrid` @media 48rem 逐字平移 · **SHA256 守恒** · 钩子守恒。

## 取舍

- 不动 snapshot()/readLedger(24) 的语义；不将三张账据合并。
- 不动横滚 region 纪律（role="region"+tabIndex={0}）。
- 响应式断点 md=48rem 逐字保留（不是 nil-media；baseline 原本就有）。
- 不做截图：browser 不可用。

## 后果

`/admin/observability` 加入门面矩阵。admin 剩余：discover-cache（.gw- 族家族化）。
