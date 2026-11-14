# ADR-0185：§FE-33 `/admin/rate-limit` `.rl-` 门面化——限流闸诊断表盘，table 双列装法原样

- 状态：Accepted
- 日期：2026-11-12
- 关联：ADR-0183 · §SEC 第三十五片 · `apps/web/test/admin-rate-limit-visual-style.test.ts` · `docs/evidence/fe-33-admin-rate-limit-facade/evidence.md`

## 背景

`/admin/rate-limit` 是 §SEC 第三十五片的诊断入口：`page.tsx`（denied×2 + scope）+ `StatsPanel.tsx`（client，4s 轮询 `/api/admin/rate-limit`）。核心两格装法不变——驱动装法（in-process|redis）与 windowScope 共享口径；`wire` 三态 na/up/pending/down；`fallbackCount` 双态（null="没在退回"）；IP_RATE_RULES 原样两列对齐。

## 决定

1. **新增 `.rl-*` 门面族**（globals.css，`.gw-` 段之后）：`.rl-dl`（11rem label）· `.rl-trackedNote`（说明 11px fg-3）· `.rl-rulesBox`（细 border 框）· `.rl-rulesList`（grid 1fr auto/gap 2px·3）· `.rl-ruleRoute`（mono fg-2）· `.rl-rulesItem`（display:contents）。
2. 复用：errorNote/muted/root/dt/num（`.ar-*`）、shellNarrow/headBaseline/denied×2/capNote（`.adm-*`）、warnNote（`.am-warnNote`）。
3. **零行为恒等门**：`page.tsx` `a7cff6c8…`、`StatsPanel.tsx` `6cc9b0b4…` 与 git HEAD 一致；redact 前 EOL 归一。
4. **判据**（12/12 绿）：server 组件门 · client 指令 + 4s 轮询进门 · 字面类全 adm/am/ar/rl-* · 零裸 Tailwind · 类名闭环 · 零 hex · token 全声明 · 零新增颜色 token · 零 transition/@media · **双文件 SHA256 守恒** · 19 钩子守恒。

## 取舍

- 不动 wire 判读（WIRE_LABEL）、REASON_LABEL 六档、rules 排序（localeCompare zh-CN）、形式 shape 守卫。
- 不动失败不清空/stale 口径；4s 轮询照旧。
- 不做截图：browser 不可用。

## 后果

`/admin/rate-limit` 加入门面矩阵。admin 剩余：access / observability / discover-cache。
