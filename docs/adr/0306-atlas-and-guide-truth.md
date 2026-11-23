# ADR-0306 · 世界全图补齐入口 + 说明书去掉会过期的数字（2026-11-22）

## 状态

已接受（2026-11-22）

## 背景

用户第六点要求「世界无穷大，但要有足够充分的引导，防止迷失」，第八/九点要求内容真实。
两处都出现了真实的缺口：

1. **`/map`（世界全图）漏了入口**：①「大典入口」只列 `/bible`、`/bible/quiz`、
   `/bible/well`、`/bible/ask` 四个，而实际有八个——`/bible/anchors`、`/bible/search`、
   `/bible/whisper`、`/bible/margins` 全部没有出现在图上。潮汐/观察类页面
   （`/tide-oracle`、`/tide-wire`、`/tidewatch`、`/daily`、`/observatory`、`/stategraph`）
   更是完全没列。用户「迷路时回到这里」的那一册图纸，本身漏了半张地图。
2. **说明书里有会过期的硬编码数字**：`guideCopy.ts` 写 `two hundred ten echoes`（2 处，
   实际 215）、`1308 bilingual anchor sentences`（实际 632 条锚句）、`二百一十五回响`。
   这些数字每加一篇回响就过期一次，而它们出现在用户直接读的说明书里。

## 选项

A. 把数字改成当前准确值（215 / 1264）。否——下次加 Echo 又过期，且这类漂移已经发生过多次。
B. 数字改成不会过期的表述，`/map` 补齐入口。采用。

## 决定

1. `/map`：
   - ① 节补 4 个典籍入口（anchors / search / whisper / margins），zh 与 en 同步；
   - 新增 ⑤「潮汐与观星 · 每天的潮都在动」，列 6 个入口（tide-oracle / tide-wire /
     tidewatch / daily / observatory / stategraph）；
   - 原 ⑤「管理与观察」顺延为 ⑥（en 的 5 → 6）；`LABELS` 补 10 个键。
   - 结果：zh 6 节 31 链接，en 6 节 31 链接，逐节对称。
2. `guideCopy.ts`：
   - `two hundred ten echoes` / `two hundred fifteen echoes` → `two hundred–plus echoes`（3 处统一）；
   - `二百一十五回响` → `二百余回响`（2 处）；
   - `1308 句中英锚句` → `全部中英锚句`；`the 1308 bilingual anchor sentences` →
     `every bilingual anchor sentence`。
   理由：说明书承诺的是「逐字回放」这件事，不是某一刻的条数；写死条数只会持续说谎。

## 门禁（实测）

- `test/map-visual-style.test.ts` → **8/8**（该门不钉链接数，补入口不触发基准变更）。
- `test/guide-visual-style.test.ts` + `test/help-drawer-visual-style.test.ts` + map → **24/24**。
- `tsc -p apps/web --noEmit` → exit 0。
- 对称性机检：zh 6 节 / 31 链接，en 6 节 / 31 链接。

## 后果

### 变好的事

- 「迷路时回来」的图纸现在真的画全了：典籍四个角落与潮汐六个入口都在图上。
- 说明书不再出现「210 回响」这类一读就与事实矛盾的数字；`二百余` / `two hundred–plus`
  在很长一段时间内都成立。

### 边界

- 仍然保留「十四章」这个数（正典章节增长远慢于回响，且它现在是准确的）；若将来加章，
  需要人工更新——这是已知的、低频的漂移点，不假装它不存在。
- `/map` 只列「真实存在的页面」；`/bible/[slug]` 这类动态路由不单独列，由 `/bible` 进入。

## 相关

- `apps/web/src/app/map/page.tsx`、`apps/web/src/lib/guideCopy.ts`
- ADR-0299（首页 i18n 去夹杂，同一条「文案必须诚实」的线）

## 补记（2026-11-22 · 并轨之后）

本文把「二百余回响」「two hundred–plus echoes」当成不随时间漂移的稳妥写法。
并轨后正典真值是 **14 章 · 217 回响 · 1311 锚句**——「二百余」依然成立（217 > 200），
但它已经不是最精确的写法。`guideCopy` 里与真值直接相关的几处（章数 / 回响数 / 锚句数）
已经改成确数：十四章、二百一十七回响、1311 句；「二百余」这种模糊说法只保留在不指具体数字的地方。
