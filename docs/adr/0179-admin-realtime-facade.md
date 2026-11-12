# ADR-0179：§FE-27 `/admin/realtime` `.ar-` 门面化——诊断表盘四分格零裸 Tailwind，本片不动判据

- 状态：Accepted
- 日期：2026-11-12
- 关联：§SC-79（ai capability 段）· ADR-0028（wire 语义）· `apps/web/test/admin-realtime-visual-style.test.ts` · `docs/evidence/fe-27-admin-realtime-facade/evidence.md`

## 背景

`/admin/realtime` 是 §163 的诊断入口：`page.tsx` 走 denied×2 + 诊断页（多实例口径写死在 summary/scope），
`StatsPanel.tsx`（client）轮询 `/api/admin/realtime`（no-store、4s、`isKnownStats` 守卫），
分四格展示 wire（此刻/启动那次分行）/ java 生产者 / actuator circuitbreakers / ai-service capability（§SC-79）。

## 决定

1. **新增 `.ar-*` 门面族**（globals.css，`.adm-` 系列之后）：`.ar-errorNote/.ar-muted/.ar-root/
   .ar-dl/.ar-dlSmall/.ar-breakersGrid/.ar-dt/.ar-section/.ar-sectionTitle/.ar-breakerName/
   .ar-breakerState/.ar-num/.ar-capabilityReal/.ar-note`——双主题 token、tabular-nums 落
   `font-variant-numeric`、`capability=real` 那格锚 `--nexus-color-success`；零 hex；零 @media；零动效。
   - 同时在 `.adm-*` 族补三个共用类（`.adm-shellNarrow` / `.adm-headBaseline` / `.adm-capNote`），
     供本页 denied×2 + ok 分支同用（denied 分支本来复用 `.adm-denied/.adm-deniedTitle/.adm-deniedText`）。
   - 诊断表盘**没有 hover/transition 诉求**，段内零 transition；scroll/overflow 未动。
2. **零行为恒等门**：两文件剥 className 后 SHA256 与 git HEAD 一致（page `09b484f7…`、panel `f66b4716…`）。
   轮询节奏（4000ms）、`isKnownStats` 契约、`guard` 文案、四分格行号判据一字不改。
3. **判据**（13/13 绿）：server 组件门 · client 指令保留 · `setInterval 4000` + `isKnownStats` +
   `no-store` 进门 · 字面类全 adm/ar-* · 零裸 Tailwind · 双家族类名闭环 · 成规模（≥14）· 零 hex ·
   token 全在 · 零新增颜色 token · `ar-capabilityReal = success` · **双文件 SHA256 守恒** · 钩子守恒
   （20+ data 钩子：realtime 统计 / java wire / actuator row / ai capability）。

## 取舍

- capability=real 用绿是语义直译（§SC-79）；"missing ≠ healthy ≠ 闭合"的语义在 stats-readout.ts，
  本片不动判据本身。
- 不重排分格顺序（wire→java→breakers→actuator→ai）；不动 javaBreakers 4 列宽 `10rem`。
- 不做截图：browser 不可用。

## 后果

`/admin/realtime` 加入门面矩阵。admin 其余文件（marketplace/moderation/access/observability/
rate-limit/discover-cache/users×4/audit/gateway）按 §FE-28.. 继续。
