# ADR-0258：§FE-104 判据守恒/段抽取/§90 扫描缺口——三处静默守恒测试恢复 + 一个 AA 违例

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-102/§FE-103 · `apps/web/test/*-visual-style.test.ts` · `apps/web/test/style-tokens.test.ts` · `apps/web/src/app/globals.css:.ap-badgeWarn` · `docs/evidence/fe-104-test-gate-fixes/evidence.md`

## 背景

FE-37…102 之后，全树 className 已切换到 token 门面族；多处静默守恒/段抽取/§90 扫描类
测试是在门面化之前照旧建造的——随着集体换皮，它们要么变成**stale 不断报红**（SHA 守恒的 `expect(head).toContain("import { cn }")`），要么**死区段**（`.nf-`/`.notif-` 段抽取横跨到后续 §FE-52 `.sk-paper` 的 `#fff`），要么**空集**（§90 只扫 `.tsx` 的原子 span 配对），或者**空过（真 AA 违例犹在底下但没人看见）**。一次收官复查发现。

## 决定

### 1. `.nf-`/`.notif-` 段抽取写错横幅，守护范围被过度扩张，从"横幅止"改成"下一个 `/* ── §` 横幅止"，**同 §FE-103 的其它门面片同一纪律**：
- `not-found.test.ts`（§FE-9）由"`@media forced-colors` 止"改为"下一个 `/* ── §` 止"。
- `notifications.test.ts`（§FE-17）由"`§FE-15` marker 止"改为"下一个 `/* ── §` 止"。

### 2. §SHA256 守恒门保留 byte 相等断言，删除 stale 前置条件：
`assets-panel` / `character-chat` / `export-panel` / `retrieve-panel` 四片。删除
`expect(head).toContain("import { cn } from '@/lib/cn';")` 与 `expect(carved).not.toContain(...)`——HEAD 已落库移除该行，守恒本身一字不动。

### 3. §90 强调面上的文字 ≥4.5 扫描门补强：

只扫 `.tsx` 里的 `bg-accent-2 text-fg-x` 原子 span 配对 → 永远空扫。现在并行扫描
`globals.css` 基础规则里 `background: var(--nexus-color-<SATURATED>)` + `color: var(--nexus-color-<...>)` 的配对（必须是 `SATURATED` 底 + token 文本颜色）。

**过程中抓出真违例**：`AppsPanel` §FE-53 `.ap-badgeWarn`「DEMO」徽章 `bg-warn` × `bg-0` 浅色 AA = 1.91——改为 `warn-ink` 文本 + 透明底 + `warn-ink` 边框，两个主题都过 4.5。

### 4. `tools/ci/fe-gates.mjs`（§FE-103）的对待说明

FE-102/103 已提交；FE-104 正好证明它是必须的——否则视而不见的是下一轮苦难现场。

## 取舍

- 判据守恒不削弱——只删除过时前置条件；
- `.nf-`/`.notif-` 段抽取缩窄后，not-found 和 notifications 测试的注释（`.nf-`/`.notif-` 段只由本 section 拥有）守恒成立，其余后续 §FE-xx 不再被误收；
- `style-tokens.test.ts` 的 tsx 扫描 + css 扫描两个都保留：互为补充，都不是完备矩阵，因为跨 §FE 门面命名空间的选择器互不冲突，两边都覆盖同一 AA 规则。

## 后果

全树静默判据从"后门守恒"恢复到"真实判据"。
`visual-style` 全量：94 files / 969 tests green（2026-11-13 本地实跑）。

## 如实边界

- `storyboards.integration.test.ts` 在最后一次 full-suite 里出现一次 30s 超时，本轮重跑 9/9——本片没有再次出现，但风险并未移除（集成测试依赖本机 Postgres）；
- `.ap-badgeWarn` 的 AA 违例在本片修正为 `warn-ink` 方案，但它也依赖 `--nexus-color-warn-ink` 在双主题下同时过 AA——tokens.css 注释给了证明，#f5a623 暗主题 vs bg-0..3 最低 5.31，#7a4f00 浅色主题也能承受背景值所判；
- §f104 没有测 not-found.tsx 渲染的实际 DOM，构造判据仍是文件级判据——零行为门不代表零渲染取证。
