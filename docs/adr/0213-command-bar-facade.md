# ADR-0213：§FE-61 `CommandBar.tsx` `.cb-` 门面化——§7 底部 AI 命令栏

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-60 · `apps/web/test/command-bar-visual-style.test.ts` · `docs/evidence/fe-61-command-bar-facade/evidence.md`

## 背景

`CommandBar.tsx` 是 §7 的底部 AI 命令栏：输入 → Agent Plan → 执行 → Activity → 一次事务落地 → AI Diff → 可整体撤销。
`DEMO MODE` / `LIVE PROVIDER` 两 chip 只 toggle 两色板（§160）——DEMO→warn / LIVE→success；真 provider 才从 studio.live 切；
未接时显示离线面板——不假装 AI。
本片只换皮；plan 派发 / APPROVAL_TTL_MS 流 / aiObservation 回读路径——一字不动。

## 决定

1. **新增 `.cb-*` 门面族**（globals.css，`.tp-` 段之后）：35 定义——`mtHint/sendBar/suggestionChip/intentBox/wrap2Mt1/textarea/mono11/footBadge/primary/row2/row2Faint/rowFull/stackPad/trunc/w150Input/ink12/wrapCenter2/warnChip/warningBanner/infoChip/accentInk2/underLink/under/rowEnd2/rowFrozen/wrapCenter/dangerMb1/demoFlag/flagWarn/flagLive/segPill/segOn/segIdle`，+ 复用 `.sb-*`/`.wd-*`/`.hi-*`/`.cp-*`/`.ap-*`/`.ds-*`。
2. **零行为恒等门**（redact）：page `d86846b8…` 与 HEAD 字节一致。
3. **判据**（10/10 绿）：client + csrfHeaders/studio(flushBeforeAi/applyAiTransaction) 进门 · 字面类全 cb-/复用族（含 cn 三元分支）· 零裸原子（hidden state sigils）· 类名闭环 · 段成规模 ≥30 · 零 hex · token 全声明 · 零新增颜色 token · 零 transition/@media/@keyframes · **SHA256 守恒** · 钩子守恒（data-demo-mode / data-ai- 系列）。
4. cn 三元统一映射：`demoMode ? 'cb-flagWarn' : 'cb-flagLive'`（LIVE PROVIDER 切 warn/success）· `mode selected ? 'cb-segOn' : 'cb-segIdle'`。

## 取舍

- 不动 `MODES`/`EXAMPLES` 常量、`studio.plan` 派发签名、`ttlLabel()` 通知签名、`studio.applyAiTransaction()` 的 sequencer 内部；
- `.cb-textarea` 的 `max-h-[120px]` → `max-height: 7.5rem`（120px=7.5rem），`min-h-[34px]` → `min-height: 2.125rem`，`h-[34px]` → `height: 2.125rem`，`h-6` → `1.5rem`，`h-[26px]` → `1.625rem`，`max-w-[150px]` → `9.375rem`，`px-[var(--nexus-space-4)]` → `--nexus-space-4`，`px-[var(--nexus-space-5)]` → `--nexus-space-5` ——全部等价量化，不新增 token 档；
- `.cb-primary` 是品牌主 CTA，`:disabled` 昏暗 .4（与 §FE-17 ink faint 口径一致）；
- 不做截图：browser 不可用。

## 后果

`CommandBar` 加入门面矩阵。Studio 剩余 ≈4 面板继续（AgentPanel/ExportPanel/GameCodeExport/CanvasStage/ViewerControls）。
