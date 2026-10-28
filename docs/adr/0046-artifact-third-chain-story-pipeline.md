# ADR-0046：产物接上第三条链——对话管线（`story`）转写进 `engine.js`

- 状态：**已采纳**（2026-10-20：片 1 实现落地 + 片 2 浏览器见证 31 条全绿 + 片 3 真浏览器那一格走过；2026-10-24：播放语义收回模型层，见文末补记）
- 日期：2026-10-20
- 关联：§52、§51、§16、§81、§159、ADR-0038（转写与浏览器一致性见证）、ADR-0044（错位说出来）、ADR-0045（`ARTIFACT_CHAINS` 成为唯一分派点）、ADR-0039（链上 code 那格）
- 落地记录：`eb7cddf`（片 1 实现）· `475935e`（两个坑的返工）· `a992277`（片 2 见证 24→31 条 + 一份不依赖浏览器的 vm 见证）

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
  **注意这一条的后果**：story 那条链的产物计划**就是** `StoryPlan` 本身（`startId / beats / playable /
  blockers / notes` 直接在顶层），**不是** `{ story: StoryPlan }`。
  所以引擎里读的是 `plan`（`var story = plan;`）而不是 `plan.story`——
  读错的后果是 `undefined.startId`，页面一打开就崩，**而只看字节的单测照样全绿**。
- **两个坑（2026-10-20 实现时实测抓出来的，都已钉成单测）**：
  ① 上面那条载荷形状：引擎读 `plan.story` → undefined → 页面崩；
  ② **起点也是走过的一段**：起点若不记进 `visited`，绕回起点的那一步认不出是环（要绕两圈才标得出来）——
     "成环"这件事被推迟了一整圈。
  抓出它们的是一份**不依赖浏览器**的见证：用 Node 的 `vm` 直接跑产物 `engine.js` 里的 `NexusStory`
  （它是纯逻辑，不碰 `document` / `window`），于是**机器内存紧、Chrome 起不来**的时候，
  "转写语义对不对"这件事仍然有凭证——这是这次能连续推进的原因，值得记一笔。
- **载荷类型改成判别联合**（这一条是实现时最容易被忽略的连锁点）：
  今天 `ArtifactPlan = GamePlan & { growth? }`，而 `compileStory` 的结果**没有** `arena / player / enemies /
  triggers / quests` 这些字段（有的是 `startId / beats / playable / blockers`）——
  硬塞进 `GamePlan` 就要造一堆假字段（§159），所以改成带 tag 的联合：
  `{ chain: "topdown" } & GamePlan` / `{ chain: "rpg" } & GamePlan & { growth }` / `{ chain: "story" } & StoryPlan`。
  **那个 `chain` tag 顺带解决两件事**：产物自己知道跑哪条链（`main.js` 的分派不再靠"有没有 `growth` 字段"猜），
  而 `documentNotes` / `htmlSource` / `mainSource` 那几处**必须按链分支**的地方，类型会逼着它们显式分支，
  不会漏掉一处（漏了就是 TS 报错，不是运行时白屏）。
  产物字节因此变一次（`plan.json` 多一个 `chain` 字段）——产物没有稳定字节契约，
  变的只是"同一份文档两次编译仍然逐字节相同"这条（仍然成立）。
- **画法是三套，不是一套**：2D 与 RPG 走同一张 canvas（HUD 不同），对话那两型没有场地也没有判定，
  用 DOM 呈现（正文一段 + 选项若干）。产物页面的模板要能按链选渲染器——
  **同一个 `index.html` 走三套画法，不另出一个 `story.html`**（另出一个文件就是"产物有两种形状"，
  README、面板、链上那一格都要跟着多认一种）。
  具体落法（2026-10-20 读源码定）：`htmlSource()` 在 `chain === "story"` 时输出
  `<div id="story">` 而**不是** `<canvas id="arena">`（对话没有场地，画一块空画布只会让人以为坏了）；
  `main.js` 的引擎分派从 `plan.growth ? NexusRpg : NexusSim` 变成先认 `plan.chain`：
  `plan.chain === "story" ? NexusStory : (plan.chain === "rpg" ? NexusRpg : NexusSim)`，
  而且**分流必须在碰画布之前**（对话那一页里根本没有 `<canvas id="arena">`，
  `getElementById` 拿到 null，`null.getContext` 会抛 TypeError）；
  渲染器同样分两路（story 路渲染正文与选项按钮，点击调 `NexusStory.step`；其余走今天的 canvas 路）。
- **判定只在编译期，产物只播放**：`compileStory` 已经把起点（未被任何对话指向的第一条）、
  悬空引用、指向非对话的引用、空正文、终点、成环提示全都判完并写进那份载荷；
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

## 补记：播放语义回到模型层（2026-10-24）

上面三片把对话引擎送进了产物，但播放语义仍只活在 `StoryPlay.tsx` 的 React 状态里：
`currentId` 加一个 `path` 数组，跳到哪一段、走过几次都由组件自己算；产物那段 `NexusStory`
另有一张 `visited` 布尔表。两处都是"播放器"，却没有一处能被平台页与转写同时引用（§16）。

这一片补的是 ADR-0045 留下的第一格：

- `story.ts` 新增 `StoryState` / `storyInitial` / `storyStep` / `storySummary`，与 `sim.ts` 的
  `step`、`rpg.ts` 的 `rpgStep` 同形：纯函数、不改传入的 state、同一输入跑出同一结果。
  "走过几次"记成计数（`visited: Record<string, number>`）并保留 `trail`——平台的面包屑与
  "第 N 次走到这里"都从这两个字段现算，不再各留一份。
- 起点在开场就算走过一次（本文档第二个坑的延续）：`storyInitial` 同时写 `visited[startId] = 1`
  与 `trail = [startId]`，绕回起点当步就认得出环。
- 打不中的选择返回**同一个** state，不是拷贝："点下去没反应"就该真的没反应。
- 产物转写跟着改成同一组字段：`NexusStory` 的 `visited` 由布尔改成计数、补 `trail`，
  空场那句拒绝语从 `story.ts` 的导出插进产物，不在模板里重打一遍。
- 见证：`scripts/story-engine-proof.mts` 新增两条——同一串 5 步（含重访与一次打不中）之后，
  模型与 `NexusStory` 的状态 `JSON.stringify` 逐字段相同、摘要逐字相同；
  `story.test.ts` 新增 8 条钉住计数、成环、no-op、事件上限与摘要；
  `codegen.test.ts` 那条"起点记进 visited"改成检查计数写法。
- **仍然欠的**：产物侧是转写，不是 import——`story.ts` 改逻辑而产物不重新生成仍会分叉。
  这条限度留在 `CODEGEN_LIMITS` 里，浏览器见证对三条链各跑一段 scripted 输入。

## 补记：对话那一段的浏览器 scripted 见证（2026-10-24）

上一节最后一句当时还是**许愿**：`scripts/game-code-parity.mts` 里 story 只有页面级判决，
没有"同一串选择 → 同一串状态"的逐字节比对。这一片把它补上，顺手抓到一个转写分叉。

- 三条链各一段 scripted trace；story 那一段 6 步：起点 → 第二段 → 起点（成环）→
  两个打不中（不存在的 id / 别段的选择 id）→ 再绕一圈。Node 参照直接调 `storyStep`。
- 审计出的分叉：`storyStep` 打不中时返回**同一个 state**（`story.test.ts` 用 `toBe(state)` 钉住），
  而 `NexusStory` 先构造 `next` 再 `return next`。JSON 一样、引用不同——页面若依赖
  `setState` 的引用相等来跳过重渲染，两者行为就分叉。转写改成四个 guard 在构造之前
  `return state`，成功那一步才造新对象；`codegen.test.ts` 加静态钉子
  （`return next;` 只允许出现一次，且在 `var next = {` 之后）。
- 新增判决：`STORY_STATE_TRACE_PARITY`、`STORY_SUMMARY_PARITY`、`STORY_NOOP_IS_A_NOOP`、
  `STORY_LOOP_EXERCISED`、`STORY_ENDING_PARITY`（末段没有出边）、`STORY_UNPLAYABLE_REFUSAL`
  （一条对话都没有）、`STORY_CONTROL_MUTATED_SCRIPT`；parity 31 → 38。
- **先量后修**：改转写之前跑同一份见证，38 条里恰好 2 条红（no-op 身份与空故事拒绝），
  其余（含 1208 字节的 trace）全绿；修后 38/38。
- 仍然欠的：产物是转写，不是 import；这条没有变，只是现在三条链的转写都各有一段活见证。

## 补记：那条"仍然欠的"进门了（2026-10-29，评估第十四片）

上一节的"活见证"住在一个**没有 npm script、不进 vitest include** 的手跑脚本里
（`scripts/story-engine-proof.mts`）——门砌好了，没人踢就不会响：`story.ts` 改了重访计数或成环
判定而产物转写没跟上，`npm test` 全绿。

现在对账住在 `packages/game-model/test/story-parity.test.ts`，跑在 `npm test` 里，并且从
"一串 5 步"扩成十条线（直线到终点 / 绕回起点 / 自指一步成环 / 三岔汇合成环 / 正文留空 /
悬空引用与指着非对话的引用 / 全都互指没有天然入口 / 两条互不相连的线 / 一条对话都没有 /
`visual-novel` 同一条链）。比的不止状态逐字段：还比**字段集合**（模型加字段而转写漏了会精确报出
`模型独有 [x]`）、比**摘要**、比**打不中时两边"动没动"是否一致**（值相同而引用不同只有这里抓得到）。
三条变异臂各红一次：模型成环判定改一格 → 6 条红；模型状态多带一个字段 → 11 条红；
转写打不中那支改成返回等值拷贝 → 10 条红。手跑脚本随之删除，11 条逐条另有归宿。

**"产物是转写不是 import"这句仍然成立**——`CODEGEN_LIMITS` 里那条限度没有变，变的是它现在会被测。
`topdown` 与 `rpg` 两条链仍在那扇门外面：只有浏览器 scripted 见证 + "数字由同一处供给"的静态闸。
