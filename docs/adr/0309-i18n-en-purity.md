# ADR 0309 — 英文模式的「零中文」是一条可执行的门，不是口号

日期：2026-11-22
状态：已采纳

## 背景

用户第八点要求「中文模式全中文、英文模式全英文，不许中英夹杂」。
现有门只守了首页 `HOME_TXT`（`i18n-no-mix.test.ts`），其余页面的 `en` 文案无人巡检。
2026-11-22 全 src 扫了一遍，英文界面里真实漏着三类中文：

1. 书名号：`「${name}」’s world document …`（world 的 quests / digest / integrity /
   network / tide，以及 ChronicleView / ConstellationPanel），共 7 处；
2. 挂牌：`THE ATLAS · 世界全图`、`THE TIDE WIRE · 今日潮声`、`THE TIDE ORACLE · 潮语`；
3. 全角符号：CharacterPanel 的 `＋ 选一个世界条目…`；
另有两处 `localeToggleHint` 是**从未被引用的死键**（discover / search，中英各一）。

## 选项

- **A. 只改发现的几行**：英文界面这一轮干净了，下一轮新页面又漏；没有可复检的读数。
- **B. 全 src AST 扫描 + 静态门**：把「`en:` 块的值里不许出现 CJK 字符与中文标点」
  做成判据，每次 fe-gates 都跑；允许中英通用的 `·` `—` `…`。
- **C. 只查首页，其余靠人工**：现状，已知会漏。

## 决定

选 **B**，理由是可复检：门在 `apps/web/test/i18n-en-purity.test.ts`，覆盖 `apps/web/src`
全部 300+ 个 ts/tsx 文件。实现细节：

- 用 TypeScript AST 找所有 `en: { … }` 对象字面量，**只扫值**（string / template /
  数组 / 函数返回值 / 三元与二元表达式）。对象的 key 不扫——`discover` 的
  `unavailableReason` 用中文原因做查表键、值是英文译文，这是查表而不是界面文案。
- CJK 标点按 U+3000–303F 与 U+FF00–FFEF 判；`·`(U+00B7)、`—`(U+2014)、`…`(U+2026)
  中英通用，放行。
- 明确豁免：`components/BibleQuiz.tsx`——题库问的就是「正典里出现过哪个汉字」，
  汉字是题面本身（`走 (gone / to leave)`），不是漏翻。豁免写在门的注释里，不静默跳过。
- LocaleToggle 的可见字只写目标语言名（`EN` / `中`）；aria/title 跟随**当前**界面语言：
  中文界面 `切换到英文`，英文界面 `Switch to Chinese`。删掉 discover / search 的
  `localeToggleHint` 死键（两文件、两种语言各一处）。

## 后果

- 英文模式的中文标点/汉字漏翻会红，且报出 `file:line` 与具体字符。
- 中文模式是否夹英文（`世界全图 · THE ATLAS` 这类挂牌）不在这道门里；中文侧的品牌名
  是否保留需要一案一议，另开一片扫描，不与本门混在一起。
- 5 个视觉门的 SHA 因真实文案变更重钉（CharacterPanel / ChronicleView /
  ConstellationPanel / discover / search），钉值在门里注明本轮原因。
- 已做变异臂：把 `THE ATLAS · WORLD MAP` 改回 `THE ATLAS · 世界全图`，门红且定位到
  `app/map/page.tsx:94`；改回即绿。
