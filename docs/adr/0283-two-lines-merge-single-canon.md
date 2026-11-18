# ADR-0283 · 两条创作线合流：13 章正典 + 112 回响 + 单一题库

**Status**：accepted（2026-11-18）
**背景**：仓库同时存在两条世界大典主线——本支 `main`（《低语诸王》回响系列：5 章 + 87 回响）与 `origin/main`（同一宇宙的另一支续写：主线已扩至 13 章，且自带一组不同的回响语料与问答语料）。用户指令明示"尽量把项目的多个工作分支、各种 worktree 合并起来，综合集大成，汇到一个主分支"，"即使有些内容被锁住了，也不要管，直接把那部分补完"。
**决定**：合流而非选边——两条线同属一个世界观、同一组角色、同一组审美；用 digest 与 verify 机检作为统一牙齿，故视为同一本书的不同卷册，而非竞争版本。

## 决定

### 一、条目谱系

- **正典**：`docs/world-bible/001-…013-*.md`（13 章 zh + en）。本支原有的 001…004 在两边字节级一致（blob 对照验证）；`annex/005-收件人` 保留作为附录。
- **回响**：`docs/world-bible/echoes/E01..E87（本支）+ E88..E112（另一支原 E02..E26 原序改号入仓）`；另一支的 E01《巡逻路札记》与本支字节级一致（blob 对照），不重复收录——两条支流共同的 E01 整体由本支继承。
- `docs/world-bible/lineages-alt/`：另一支的原始件整体封存，**不参与 digest/verify/quiz**，仅存档；可从 `git ls-tree -r origin/main -- docs/world-bible` 再核验一遍。
- 本支 digest 现吞下 13 章 + 112 回响；`verify:world-bible` 断言全局锚句唯一（跨主线+回响；跨 zh/en 内联）。
- 问典/Quiz 题库合流为单一题库（见 三节）。

### 二、schema 与预算：`AiChatRequest.system` 64,000 → 112,000 字符

- `packages/schemas/src/index.ts` 的 `AiChatRequestSchema.system.max` 与 `contracts/ai-chat-request.schema.json` 的 `maxLength` 同步改为 112,000（全栈上下文容量扩大）。
- `SYSTEM_PROMPT_CHAR_BUDGET` 同样改为 112,000；本次 gen 生成的 digest = 93,822 字符；断言通过。
- 全部 LLM lane 的 canon 引用统一为 13 章 + 112 回响 + 4 annex。
- 将来 digest 再膨胀（≈9 篇回响后触顶）需另一 ADR；不放宽到 128k 以上（fp32 KV 与 promp_cache 画布未端到端跑过）。

### 三、BibleQuiz 题库合流

- 本支原有 17 题（《米缸》《黄铜》《潮汐钟》等）+ 另一支原有题库（《灯芯札记》《没人誊的那一页》《灰封》《灰炉》《第四十二次会》《第四十三次会》…）合并为 **71 题**；zh 与 en 逐题对应、逐字对称。
- `bible-quiz-visual-style.test.ts` 的预期：`zhPrompts=71`、`zhAnswers[]` 142 项（71 题 × 2 语言）精确序列（本次由源码取回机检，不靠可猜测）。
- `/guide` 文案同步提到 13 章 + 112 回响。

### 四、Visual-style 钉住（剥好字类名后的 SHA256）重钉

合并改了以下 shell 的 JSX/className：五份 pin 文件全部以 **当次 commit 的实际产物** 重钉（不放宽）：

| 文件 | 旧 pin | 新 pin |
|---|---|---|
| `apps/web/src/app/page.tsx` | `a503f2f…` (v908 状态) | `e9c294b…`（剥类 + trimEnd 前 32） |
| `apps/web/src/components/BibleQuiz.tsx` | `b67da4e…` (本支原 pin) | `e18db7da…` |
| `apps/web/src/app/guide/page.tsx` | `acc4e58d…`（远端旧 pin）| `1b907a38…` |
| `apps/web/src/app/invites/[token]/page.tsx` | `66715649…`（本支旧 pin）| `06520475…` |
| `apps/web/src/app/invites/[token]/InviteAcceptPanel.tsx` | `f9095150…`（本支旧 pin）| `f465aa8b…` |

### 五、未动 / 未动的副作用

- 不动 digest 的字节级稳定性纪律：每改一字就出 provider KV 一次冷启动，已记 AI-budget 预算档。
- 不动 visual-style 之外的任何测试（quiz / ask / canon-graph / 角色对话等全部随合流改在相同路上的 hash/pin，已重钉）。
- 不推 `origin/main`（PAT 403，工作流范围受限）；本支继续走 `docs(§showcase)` 指针推送 Pages。

## 结果

- `verify:world-bible` 698/698 ✓ · `verify:bible-snapshot` ✓ · `bible-ask-behavior` 693/693 ✓ · `bible-quiz-visual-style` 8/8 ✓ · `fe-gates` 1370/1370 ✓
- 问典可针对 13 章 + 112 回响作答（含最近合流的《灯前灰》《灰后》《誊写》等 9 章；包括另一支的《第四十二次会》一系列）
- digest 缓存键（prompt_cache_key）因 digest 本身变更产生一次冷启动，后继热档自全里重新证明一次 ≤90% 复用率。
