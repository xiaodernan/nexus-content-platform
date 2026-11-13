# ADR-0260：SUPERSEDES ADR-0220 第 2 条——FE-6 遗留 `.pb-*` 死类族删除（除 `.pb-variant`）

- 状态：Accepted
- 日期：2026-11-13
- 关联：ADR-0220 §2 · `apps/web/src/app/globals.css` · `apps/web/test/forced-colors-style.test.ts` · `e2e/forced-colors.spec.ts` · `e2e/forced-colors-probe.mjs` · §FE-102（`verify:no-raw-tailwind`）

## 背景

ADR-0220（2026-11-13 §FE-67）在把发布页门面族统一到 `.pub-*` 后，写入一条决定（第 2 条）：

> **保留 `.pb-` 共享类**（pb-root/pb-variant 等）用作既定发布流的候选样式与 pb-publisher 历史传承——不动 §FE-3/0141 承诺的 pb-芽屏。

同日核验派生的事实（本轮全树检索，范围 `apps/web/src`、`packages/`、`apps/studio/`）：

- FE-6 遗留的 14 个 `.pb-*` 类（`.pb-root/.pb-header/.pb-title/.pb-meta/.pb-headerAside/.pb-brand/.pb-actions/.pb-stage/.pb-note/.pb-entry/.pb-entryHint/.pb-notice/.pb-playLink/.pb-storyboardLink`）**全树零引用**（含测试/e2e/scripts/fixtures）；
- `.pb-variant` 仍被 `apps/web/src/app/n/[handle]/[slug]/page.tsx:167` 使用（裱框的唯一活类）；
- Studio 自己的 `.pb-` popout 族（`.pb-publishBtn/.pb-popPanel/…`）完全是另一件事，与本族同名不同类，owner 是 PublishPanel/§FE-54。

以此判断：FE-6 死类族不是"既定发布流的候选样式储备"，而是 `.np-→.pub-` 改名（§FE-67）后遗留的未清理代码；保留它与 §FE-102 的"全树零未使用 facade 类"纪律冲突，也会持续污染"透明字渐变墨字"动态发现门（`.pb-title` 曾强迫所有写 `color:transparent + clip:text` 的审阅者扫一个死类）。

## 决定

1. **删除** `globals.css` 的整段 §FE-6 遗留 `.pb-*` 规则块（含 `.pb-stage`/`.pb-note`/`.pb-playLink`/`.pb-storyboardLink`/`.pb-notice`/`.pb-title`/`.pb-meta`/`.pb-root`/`.pb-header{,::after}`/`.pb-headerAside`/`.pb-brand`/`.pb-actions`/`.pb-entry`/`.pb-entryHint`/`.pb-stage`/`.pb-pc?` 的所有子选择器与其 `@media (prefers-reduced-motion:reduce)` 残项）。
2. **保留** `.pb-variant`(+`.pb-variant:hover`+其 reduced-motion 规则)——发布页唯一仍用的 `.pb-*`（§FE-67 有意的保留）。
3. **回退块 8 类序列**：`@media (forced-colors:active)` 首组选择器 `.pf-name, .pb-title, .pp-title, .ss-title` → `.pf-name, .pp-title, .ss-title`；`e2e/forced-colors.spec.ts` 与 `e2e/forced-colors-probe.mjs` 中按该序列整组替换的正则锚点同步删除 `.pb-title,\s*`；`apps/web/test/forced-colors-style.test.ts` 的 `pb-title` 点名与计数注释同步（8 vs 9）。
4. **§FE-7/§FE-8/§FE-9 与 Studio §FE-54 的注释/规则中提到 `.pb-` 处**（"同一套 token 语言"一族），全部改为 `.pub-`；Studio 自己的 `.pb-` popout 段一字未动。
5. **删除的只是 CSS**：`page.tsx`、`§FE-6 判据`（`published-style.test.ts` 的 `.pub-` 段扫描）不受影响——它们扫的是 `.pub-`；`.pb-title` 曾是透明字渐变墨字发现门的死成员，删除后该门更准（动态发现不再命中它）。

## 后果

- 全树 `.pb-` 前缀只剩两个 Owner：发布页 `.pb-variant`（FE-67 保留）与 Studio PublishPanel popout 族（FE-54 拥有）；命名空间不再共享。
- forced-colors 回退块少一个死类；e2e 整组替换锚点变为 7 类序列，行为一致（`.ink {` 断言保留）。
- 任何将来再引入 `.pb-*` 的第三方（发布链老分支/实验分支）将在 `verify:fe-gates` / dynamic-gate 处被迫找人核对 —— 正确方向（否则新类悄悄契约成"默认候选样式"）。

## 诚实边界

- 本 ADR 删除 CSS 规则，不删除 `PublicationActions`/`VisitMeter`/`ReportControl`——它们与本族无交集（ADR-0220 第 5 条提到的 `.pb-… 哨兵` 产物自 §FE-73 起早已在 CSS 中按 `.pu-`/自身命名空间落地，删除前已无任何引用，逐文件确认过）。
- `.pb-` 删除**不会**影响 §FE-67 的 SHA 守恒门（锚的是 `page.tsx` 字节，不是 CSS 段）。
- `.pb-variant` 长期会否继续存在不在本 ADR 决议范围；它死掉当天再按同流程删。
