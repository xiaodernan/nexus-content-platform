# ADR-0299 · 首页门面文案去中英夹杂 + 可机检守卫（2026-11-21）

## 状态

已接受（2026-11-21；本增量连续修掉三次假红中的第三次，并顺带做首页 i18n 清理）

## 背景

用户第八点反复强调：中文模式全中文、英文模式全英文，不许中英夹杂。首页
`apps/web/src/app/page.tsx` 的 `HOME_TXT` 是登录后的第一屏门面，其中两处 kicker 写成：

- 中文：`quickStartKicker: '快速上手 · QUICK START'`
- 英文：`quickStartKicker: 'QUICK START · 快速上手'`

这是两种语言用 `·` 并列——用户一进首页就能看到，直接违反该纪律。同时，
`apps/web/test/canon-answer-graph.test.ts` 的 digest 段落数断言第三次因正典增长假红
（历史 163 → 205 → 210，本次已到 210），每次新回响都要手工改数字，掩盖真正回归。

## 选项

A. 只改文案，不加守卫。否——没有机检门，下次合流或并行 lane 又会带回夹杂。
B. 改文案 + 加 i18n 文案门 + 修 canon 假红。采用。

## 决定

1. 两处 kicker 各只留一种语言：中文 `'快速上手'`，英文 `'QUICK START'`。
2. 新增 `apps/web/test/i18n-no-mix.test.ts`，机检两条不变量：
   - en 块零 CJK 字符；
   - 两块都不出现「中文 · English」/`English · 中文` 对照式夹杂。
   合法保留项（Ctrl+K、Mac、Provider、healthz、Studio、Agent、Mock、端点名等技术标识）
   在测试注释里显式列出，不把它们误判为夹杂。
3. `canon-answer-graph.test.ts` 的段落数断言改为从 `BIBLE_CHAPTERS.length` /
   `BIBLE_ECHOES.length` 动态派生，并断言 `segments.length == chapters + echoes`——
   彻底终结 163→205→210 的手工追数字循环。
4. `home-visual-style.test.ts` 的 `STRIP_CLASS_SHA256` 基准随文案字节更新，并在常量旁
   登记这是「§I18N-NO-MIX 有意文案变更」，不是行为溢出。

## 门禁（实测，本机）

- `NODE_OPTIONS= npx vitest run --root apps/web --no-file-parallelism test/i18n-no-mix.test.ts test/home-visual-style.test.ts` → **2 files / 15 tests passed**。
- 同上加 `test/canon-answer-graph.test.ts`（修断言前后各一次）→ 13/13 passed。
- `--no-file-parallelism` 是本机必需：默认并行池会静默少报测试文件。

## 后果

### 变好的事

- 首页第一屏不再中英夹杂；该纪律从「靠自觉」变成「有门」。
- 正典增长（E211、E212……）不再让 canon-answer-graph 假红，维护成本归零。

### 边界

- 合法技术标识仍保留英文，这是产品通行做法，非遗漏。
- 本 ADR 只覆盖首页 `HOME_TXT`；其他页面的 i18n 门是各自测试，不在此增量范围。
- `--no-file-parallelism` 门只在本地跑过；CI 的 vitest 配置另算，不冒充。

## 相关

- 用户第八点（全量中英文切换、不夹杂）
- `apps/web/test/i18n-no-mix.test.ts`、`apps/web/test/home-visual-style.test.ts`
- `apps/web/test/canon-answer-graph.test.ts`（正典增长动态派生）
