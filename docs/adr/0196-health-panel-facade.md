# ADR-0196：§FE-44 `HealthPanel.tsx` `.hp-` 门面化——§178 项目健康 / §180 发布门禁

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-43 · `apps/web/test/health-panel-visual-style.test.ts` · `docs/evidence/fe-44-health-panel-facade/evidence.md`

## 背景

`HealthPanel.tsx` 是 §178 的读数面板——Studio 左侧常驻一栏 + 发布弹层共用同一份渲染，
数字由 `analyzeHealth` 算（§179 与发布门禁是同一个函数）；没测行不显示绿勾（§159），
§147 起重算搬进 worker（`health-client.ts`），面板只读 ready 态 + 三个只读标记。
门面化只换皮：换 className，文案/aria/data 钩子原样。

## 决定

1. **新增 `.hp-*` 门面族**（globals.css，`.ly-` 段之后）：`.hp-root/.hp-summary/.hp-ul/.hp-blockers/.hp-blocker/.hp-notRun/.hp-railRoot/.hp-railHead/.hp-railTitle/.hp-railStatePass/.hp-railStateFail/.hp-railPending/.hp-railBody/.hp-railWait/.hp-row/.hp-rowFail/.hp-summaryRow/.hp-staticRow/.hp-inkPass/.hp-inkFail/.hp-inkWarn/.hp-label/.hp-score/.hp-chip/.hp-findings/.hp-basis/.hp-metrics/.hp-findingList/.hp-finding/.hp-sevError/.hp-sevWarn/.hp-sevNeutral/.hp-omitted/.hp-faint/.hp-railTide`——零 hex、零 @media、零动效、双主题 token 锚定。
   - chip 字号字面量 0.625rem——token 尺度没有 10px 档（FE-37/FE-42 记账口径）；
   - `.hp-rowFail` 用 color-mix(danger/10%) 遮罩、不走实底 danger（与 cx-error/warnBox 同纪律）；
   - pass 行底色走 `.hp-row`（bg-2），fail 行由 `.hp-rowFail` 同优先级重写（顺序在 `.hp-row` 之后）。
2. **零行为恒等门**：剥 className 后 SHA256 与改前（git HEAD）一致（`d3a649c245bc0ca89cbd30ca52e3c1983ce6568221fefe492739419bd69df54d`；
   redact = EOL+空白归一 + className 任意形态归一 + cn()整体归一 + `className=@` 归一）。
3. **判据**（10/10 绿）：'use client' + health-client 依赖链进门 · 字面类全 hp-* · 零裸 Tailwind · 类名闭环 · 段成规模（≥28 条）· 零 hex · token 全声明 · 零新增颜色 token · 零 transition/@media/@keyframes · **SHA256 守恒** · focus-visible 锚（.hp-summaryRow）。

## 取舍

- 不动 STATE_MARK 的 `✓/✗/—` 语义、不动 `data-health-*` 钩子集、不动 expand/regulatory 分支；
- 不引入动效：`hp-` 面板是读数，不是运动（aria-live 兜底使用者侧体验）；
- 不做截图：browser 不可用。

## 后果

`HealthPanel` 加入门面矩阵。Studio 剩余（VariantsBoard/TeamPanel/WorldPanel/StoryboardPanel/…）按同一纪律继续。
