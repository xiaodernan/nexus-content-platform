# §FE-104 · 修预先存在的判据守恒测试 + 段抽取跨界——验收记录

## 这次做了什么

`npx vitest run visual-style` 全量收官复查（94 文件）时发现的失败全部定位、修复：

| 文件 | 失败判据 | 根因 | 修法 |
|---|---|---|---|
| `apps/web/test/assets-panel-visual-style.test.ts` | SHA256 守恒 | 测试假设 `git HEAD` 仍含 `import { cn } …`——该前提随各自 FE 提交落库即失效 | 删除 stale 的 `expect(head).toContain(...)`；SHA256 比较本身不动 |
| `apps/web/test/character-chat-visual-style.test.ts` | 同上 | 同上 | 同上 |
| `apps/web/test/export-panel-visual-style.test.ts` | 同上 | 同上 | 同上 |
| `apps/web/test/retrieve-panel-visual-style.test.ts` | 同上 | 同上 | 同上 |
| `apps/web/test/not-found-visual-style.test.ts` | `.nf- 段` 里 no-hex B 段跨过后续 §FE-52 `.sk-paper` 的 `#fff`（segment 抽取写错了，`forced-colors` 在 Sketch 段之后，切错了位置） | 改 §FE-9 段边界为“下一张 `/* ── §` 横幅止”，与 FE-103 门面片同一纪律 |
| `apps/web/test/notifications-visual-style.test.ts` | 同上一类跨段（`§FE-15` 并非和 `§FE-9` 一样的下一横幅）：`#ffffff` / `#fff` / `.sk-paper` / `transition` / `48rem` 都来自后续 §FE-段 | 同上 |
| `apps/web/test/style-tokens.test.ts` | `§90 强调面上的文字 ≥4.5`——只扫 tsx 的 `bg-x text-y` 原子串，门面化后零配对，门在骗人 | 并行扫 globals.css 的 facade 规则里 `background: var(--nexus-color-<SATURATED>)` + `color: var(--nexus-color-<...>)` 的规则配对；修出一个真 AA 错误：`.ap-badgeWarn`（DEMO 徽章）`bg-warn` × `bg-0` 在浅色下只有 1.91:1——改 `border + warn-ink 文本 + 透明底` |
| `apps/web/src/app/globals.css` | `.ap-badgeWarn` AA | 同上 | 同上 |
| `apps/web/test/storyboards.integration.test.ts` | 首跑 30s 超时 | 每次通过，怀疑 pg 给繁重 SQL（或池过小）换 TIMEOUT 字

## 验证（本地实跑，2026-11-13）

```
node tools/ci/fe-gates.mjs                                 → 94 files / 969 tests green（test:main 的 15 条里 14 条随本片修复后）
npx vitest run apps/web/test/style-tokens.test.ts          → 24/24 加强规则后全绿（含 facade rule pair 抽取）
npx vitest run apps/web/test/storyboards.integration.test.ts → 9/9 绿（过去一次 30s 超时未可复现；首次跑不稳，本片未动代码）
npx tsc --noEmit -p apps/web/tsconfig.json                 → TSC_EXIT=0
```

## 边界（如实）

- 判据守恒被修的是**测试写法**，不是断言力度——红绿相等的契约没削；
- `storyboards.integration.test.ts` 本轮重跑绿；起初报告的超时未可复现；若再次 timeout，按其 timeout 字段处理（本片不改集成测试代码）；
- `style-tokens.test.ts` 的 facade rule 扫描是本片新实现的判据——它之前漏掉了全树 70+ 片门面化**补给了配对的文件**里的 4.5 差距（`ap-badgeWarn` 就是被它抓住的）。
