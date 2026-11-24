# 中英模式真浏览器审计（2026-11-24）

## 环境
- `next dev -p 3100`，Playwright Chromium headless，1440×900
- 英文模式通过 cookie `NEXUS_LOCALE=en` 注入；零 provider、零模型调用

## 中文模式（12 页）
`/` `/guide` `/discover` `/about-nexus` `/bible` `/map` `/onboarding`
`/analytics` `/api-tokens` `/tide-oracle` `/observatory` `/stategraph`

| 项 | 结果 |
|---|---|
| 无名按钮（无 title / aria-label / 文字） | 0 |
| 横向溢出 | 0 |
| pageerror / console error | 0 |

审计中抓到并修复：
- `/bible` 出现「一百undefined」——页面内中文数字 helper 只处理到 199，219 回响越界。
  抽成 `cnNumeral` 纯函数并加 5 条门；真浏览器确认显示「二百一十九 / 二百一十八」，无 undefined。
- 英文标题与描述中英夹杂：`/onboarding`（标题去掉「/ Onboarding」）、首页（新增
  `generateMetadata`，hero 副标题进双语字典）。

## 英文模式（14 页）
上列 12 页加 `/pulse`、`/insight`。

| 项 | 结果 |
|---|---|
| 正文汉字数 | 每页恰好 1 个（语言切换按钮的目标字「中」，有意保留） |
| 标题 | 全部英文，`/bible` 为 `World Bible · The Whispers' Kings — NEXUS` |
| 横向溢出 | 0 |
| pageerror | 0 |

结论：中英两种模式都没有非预期的跨语言泄漏；本轮修复已经真浏览器复核。
