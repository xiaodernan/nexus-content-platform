# ADR-0046：产物接上第三条链——对话管线（`story`）转写进 `engine.js`

- 状态：**草稿（实现中）** —— 定稿条件：codegen 侧转写落地 + parity 见证 + 真浏览器那一格走过
- 日期：2026-10-20
- 关联：§52、§51、§16、§81、§159、ADR-0038（转写与浏览器一致性见证）、ADR-0044（错位说出来）、ADR-0045（`ARTIFACT_CHAINS` 成为唯一分派点）、ADR-0039（链上 code 那格）

## 背景

ADR-0045 把"这一份带不带引擎"从一句判断变成一张表（`ARTIFACT_CHAINS`），并给 `rpg-prototype` 补了第二条链。
那张表今天只有两个键：`topdown` 与 `rpg`。于是八型里**还有两型**（`interactive-story` / `visual-novel`）
在产物侧仍然只被披露——它们在平台上跑的是 `story` 管线，而产物里没有对话引擎。

平台侧其实早就有对话管线：`packages/game-model/src/story.ts` 的 `compileStory`，
输入只有 §54 的 `dialogue` 实体（正文来自 `notes`，选择来自指向其它对话的引用，起点取"没有被任何对话指向的第一条"，
允许成环并由播放器标记重复段落），试玩页与公开试玩页跑的就是它。
产物侧没有对应的一段：`engine.js` 里要么是 `NexusSim`（2D），要么是 `NexusSim` + `NexusRpg`（RPG），
**没有正文、没有选择、没有分支**。所以作者下载一份互动故事，双击打开，看到的是一份开不了场的 2D 关卡，
外加一句"这一型在平台上跑的不是这一条链"。

按 ADR-0045 立下的那条律，正确的做法不是手抄一份对话规则，而是**转写**——把 `story.ts` 的语义写成 ES5 形状，
数据由它的投影序列化进同一次 `plan.json`，产物代码里不许有第二个真值。

## 选项

1. **继续只披露**（现状）。`kindNote` 说"这一型在平台上跑的是对话管线，那条链在这份产物里没有引擎"。
   拒绝：这句话现在只对两型说；ADR-0044 之所以选"说出来"，是因为**没有引擎**才只能说出来。
   有了引擎还只说，等于明知能做而不做。
2. **在产物里手抄一份对话规则**（照 `sim.ts` 的样子另写一段）。
   拒绝：两个供给点——正文取哪个字段、起点怎么定、成环怎么处理，改一处另一处不会跟着红。
   这正是 ADR-0045 否掉的同一件事。
3. **转写 `story.ts` 的语义进 `engine.js`，并把 `story` 加进 `ARTIFACT_CHAINS`**（采纳）。

## 决定

- `ARTIFACT_CHAINS` 多一个键 `story`（`label` 与 `dataNote` 两句话），表类型里那句
  `Exclude<NonNullable<GameProjection["pipeline"]>, "story">` 随之去掉——
  **"有没有引擎"的答案仍然只有那一张表**，没有第二处判断。
- `engineSource("story")` 多转一段 `NexusStory`，语义点与 `story.ts` 一一对上：
  - `initialState(plan)`：起点 = `plan.story.startId`（编译期已按"未被任何对话指向的第一条"取好，产物里不再猜）；
  - `step(plan, state, choiceId)`：选一项就跳到目标 beat，并把走过的段落记进 `visited`；
  - `summary(plan, state)`：已走段落、成环的段落标出来（模型允许成环，播放器负责标，不是禁止）。
- `artifactPayload("story")` 交 `{...compileStory(doc), notes}`，形状与产物里的其它两段载荷平级。
- **画法是三套，不是一套**：2D 与 RPG 走同一张 canvas（HUD 不同），对话那两型没有场地也没有判定，
  用 DOM 呈现（正文一段 + 选项若干）。产物页面的模板要能按链选渲染器——
  **同一个 `index.html` 走三套画法，不另出一个 `story.html`**（另出一个文件就是"产物有两种形状"，
  README、面板、链上那一格都要跟着多认一种）。
  具体落法（2026-10-20 读源码定）：`htmlSource()` 在 `chain === "story"` 时输出
  `<div id="story">` 而**不是** `<canvas id="arena">`（对话没有场地，画一块空画布只会让人以为坏了）；
  `main.js` 的引擎分派从 `plan.growth ? NexusRpg : NexusSim` 变成先认 `plan.story`：
  `plan.story ? NexusStory : (plan.growth ? NexusRpg : NexusSim)`，
  渲染器同样分两路（story 路渲染正文与选项按钮，点击调 `NexusStory.step`；其余走今天的 canvas 路）。
- **判定只在编译期，产物只播放**：`compileStory` 已经把起点（未被任何对话指向的第一条）、
  悬空引用、指向非对话的引用、空正文、终点、成环提示全都判完并写进 `plan.story`；
  **产物里一个都不许重做**——重做就是第二个供给点（ADR-0045 否掉的那件事）。
  产物只做三件事：显示当前 beat 的正文（`textEmpty` 时说"作者没写正文"）、列出选项、选一个跳到目标；
  外加把走过的段落记进 `visited`，重复走过就标出来（模型允许成环，播放器负责标，不是禁止）。
- `kindNote` 随之变空：`hasArtifactEngine("story")` 为真，八型**全部**不再念那句错位。
  文案一个字不用改——是表多了一个键让它变空（ADR-0045 那条律的延续）。
- 限度同步改口：`CODEGEN_LIMITS` 要说清"对话那两型读的是 dialogue 实体（正文/选择/分支），
  其它十类实体不读（投影里已报数）"。

## 后果

- **正面**：八型全部对上——每一型下载到的产物，跑的就是它在平台上跑的那一套；
  `kindNote` 的种群归零，而它仍然是派生的。
- **见证更贵**：`scripts/game-code-parity.mts` 从两条链变三条链（同一台 Chrome、三个页面、三条 loopback 源路径），
  判决 24 → 30 条上下；对话那一条要量的是"点一个选项，正文换一段"与"成环被标出来"。
  **这一格的见证清单（实现时逐条对账，缺一条就不算完）**：
  ① `STORY_PAGE_LOADS`：story 产物页在浏览器里加载，pageerror 累计 0；
  ② `STORY_CHAIN_NOTE`：页上 `#chain-note` 是 story 那句（与 `artifactChainSentence("story")` 逐字相同）；
  ③ `STORY_PLAN_MATCHES`：页里 `plan.story` 与主机侧 `compileStory(doc)` 的结果逐字节相同；
  ④ `STORY_CHOICE_ADVANCES`：点一个选项 → 正文换成目标 beat 的正文（不是同一段）；
  ⑤ `STORY_LOOP_MARKED`：走一段成环 → 摘要里出现"成环"那句；
  ⑥ `STORY_NOT_DECORATIVE`（**反向控制**）：改 `plan.story` 里一个 beat 的正文 → 浏览器侧显示跟着变——
     不变就说明页面写死了正文，③④⑤ 全是空转；
  ⑦ `STORY_NO_EGRESS`：story 页面不发起任何离开产物源的请求（CSP `connect-src 'none'`）。
  单测侧（`codegen.test.ts`）另加：`ARTIFACT_CHAINS` 三键齐全、`artifactChainOf` 对两型对话型返回 `story`、
  `kindNote` 对这两型**为空**、story 链产物**没有** `<canvas id="arena">`、载荷里含 `story` 段。
- **画布不再是唯一画法**：产物页面第一次要按链选渲染器。这是必要的复杂度，
  但它必须长在**一张表**上——分派点仍然是 `ARTIFACT_CHAINS`。
- **文档侧**：README 那一行、`#chain-note`、面板的 `data-game-code-chain`、链上 code 那格的 notes
  四处都读同一张表，不用改（这是 ADR-0045 留的红利）。
- **仍然欠的**：这之后 `ARTIFACT_CHAINS` 覆盖了 `GameProjection["pipeline"]` 的全部三个键
  （`topdown` / `story` / `rpg`），**没有第四种管线**；将来若加管线，仍是这张表多一个键。
