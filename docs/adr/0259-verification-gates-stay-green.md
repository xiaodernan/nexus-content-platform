# ADR-0259：验证门的红线归零纪律——gate 只许全绿 push 才考虑新增，修复红线优先于新门面

- 状态：Accepted
- 日期：2026-11-13
- 关联：§A11Y-1（forced-colors-style.test.ts）、§FE-67（.np-→.pub- 改名）、§FE-102（`verify:no-raw-tailwind` / `verify:fe-gates`）、`tsconfig.tools.json`、§ECON-1（packages/economy 提炼，apps/studio shim）

## 背景

2026-11-13 的一次 `npm run test:main` 全量回归里，有 **7321 条绿 / 3 条红（1 个文件）**，唯一红线是
`forced-colors-style.test.ts`：动态发现门扫出 §FE-67 发布页的 `.pub-title`（一个新增的
`color: transparent` + `background-clip: text` 渐变墨字类），却不在 `@media (forced-colors: active)`
回退块里——FE-67 改名时只同步了判据、没同步回退块。同批还有一个 `.pb-*` 陈旧的浏览器 spec（`e2e/published-visual.spec.ts`），FE-6 留下、`FE-67` 后死类残留，真跑即红。

与此同时，`tsconfig.tools.json`（`checkJs: true`）积了 **107 条 pre-existing 类型错误**（9 个 proof/verify `.mts` 脚本），
其中 46+26+12 是隐式 `any` 参数（TS7006/TS7031/TS7034/TS7005），其余是 `catch` 里的 `unknown` 收窄（TS18046/TS2532）与同源的未用变量。

两个事件都是同一形状：**门长期绿 → 门失效（没人跑）→ 静默红 → 误以为门还有效。**

## 决定

1. **红线当天必须回归到全绿再继续堆新内容**：本片接手时就是红的（3 failed），修完（§FE-67 fallout：
   `.pub-title` 独立成组）后，修红顺序优先于任何新 FE 门面/新 SC 片。
2. **新增"透明字渐变墨字"一律是两处联动**：(a) `globals.css` 的 `@media (forced-colors: active)` 回退块；
   (b) `e2e/forced-colors.spec.ts` / `forced-colors-probe.mjs` 的选择器序列（若放进被 `:nth`/整组替换的 8 类组，
   会破 `toContain('.ink {')` 的变异锚点）。**独立成组是惯例**（`.nf-code/.nf-title`、本片的 `.pub-title`
   都这么进回退块），不动 e2e 整组替换的正则锚点；任何要把新类塞进 8 类组的提交，都要先改 e2e 双文件的锚点。
3. **`tsconfig.tools.json` 的目标是 `0 errors` 并保持**：proof/verify 脚本一律是 `.mjs`-可执行形态
   （`node docs/evidence/xxx/proof.mjs`），不转 `.ts`；类型标注用 JSDoc `@type` 断言、收窄 `catch` 的 `e`、
   `rows[0]`/`tasks[0]` 空行判空，不用 TS-only 语法（`as Array<[…]>` 在 `.mjs` 里触发 TS8016）。
4. **验证门不欠债**：接手时即红就当场修，不在 ROADMAP/CURRENT-STATE 里用"已知红、下片修"安放。
   本片之后：`npx tsc -p tsconfig.tools.json --noEmit` → **0 errors**；
   `npx eslint`（含本片修的 6 条 pre-existing）→ **0 errors**（`--max-warnings=0`）；
   `forced-colors-style.test.ts` → **9/9**；`e2e/forced-colors.spec.ts`（@smoke）→ **1 passed**。
5. **死类残留不等于可删**：FE-6 遗留的 `.pb-*` 门面类族（除已证实仍被 `.tsx` 使用的 `.pb-playLink` 等，
   以及 §FE-67 有意保留的 `.pb-variant`）全树零引用，但 ADR-0220 明确保留为"既定发布流候选样式"——
   本 ADR 不改这个决定；将来若清理，必须同时重同步四门（forced-colors 静态名单、e2e 三处正则锚点、
   `published-style.test.ts` 的 `.pub-` 段判据）。

## 后果

- 后人加"渐变墨字"门面类：**要么独立成组进 forced-colors 块 + 更新判据静态名单到"9 类及以上"；
  要么先改 e2e 双文件锚点**，否则 Static gate 红、e2e 假过、style 名单漂移。
- 验证门重新跑全量时（`npm run test:main`），这是可承诺的 exit code 0 的前提；
  本 ADR 记录了遗留未清的 `.pb-*` 死类（ADR-0220 保留），清理条件见第 5 条。
- `tsconfig.tools.json` 允许再有错误进来（未来人犯的错），但 **`main` 上基线是 0**，
  任何引人 107 条的回退 PR 在 review 时即可拒。
- 并轨纪律：并行会话的红灯即本会话的红灯；本 ADR 之后，交接的 CURRENT-STATE 条目必须写明"全量 suite 必须跑到结尾"，
  否则本 ADR 的第 1 条不成立。

未 push。
