# ADR-0045：产物接上第二条链——`ARTIFACT_CHAINS` 成为"这一份带不带引擎"的唯一分派点

- 状态：已采纳（§52 最后一格从"一条链 + 一句披露"变成"两条链 + 一句披露"）
- 日期：2026-10-18
- 关联：§52、§51、§16、§81、§159、ADR-0038（转写与浏览器一致性见证最初立的限度）、ADR-0044（错位**说出来**那一片，本 ADR 修掉它说的那件事）、ADR-0039（链上 code 那格）

## 背景

ADR-0044 的判决是"披露而不是关掉下载"，它留下一句明写的话：**错位只是被说出来，没有被修掉**。
今天这一片去修其中的 `rpg-prototype` 那一型，另外两型（`interactive-story` / `visual-novel`）仍然只被披露。

上一片落地后量到的事实（`docs/ROADMAP.md` §52 × §51 那一节）：

- 平台侧 `rpg.ts` 早就有了：`compileRpg` / `initialRpgState` / `rpgStep` / `rpgSummary` / `xpToNext`，
  试玩页与 HUD 跑的就是它，§53 的 `playtest` 那一格跑的也是它。
- 产物侧只有一段：`engine.js` 是 `sim.ts` 的转写，成长循环（经验、升级、任务发经验、等级门）一个字都没有。
  所以作者下载一份 RPG 原型、双击 `index.html`，打开的仍是一份 2D 俯视关卡——只是页面上多了一句"这不是这一型"。

也就是说 ADR-0044 那句话是**真话**，但真话不是产品。这一格要的是：下载的那一份真的跑出这一型。

## 选项

1. **只做对话那条链**（`story`）：一次把剩下三型都补齐，八型全对得上。
   拒绝：那是两格能力，塞进一片就是 ADR-0044 里被否掉的同一件事——"在这一片里写半条引擎"是 §159 的假生成。
   对话管线要的是正文、选择与分支的播放器，与成长循环没有共用一行代码。
2. **产物里再抄一份 RPG 规则**（照 `sim.ts` 那份模板的样子手写一段成长逻辑）。
   拒绝：`rpg.ts` 已经是这一型的真值，抄第二份就是两个供给点——升级曲线改一处另一处不会跟着红。
   转写（把 `rpg.ts` 的语义写成 ES5 形状、数字从它的导出插进模板）才是 ADR-0038 立的那条律。
3. ** adopted：把"哪条链有引擎"从一句判断变成一张表**（`ARTIFACT_CHAINS`），
   引擎转写、载荷、README 那一行、页面上那句链名、`kindNote` 是否为空，五处都从这张表派生。

## 决定

- `packages/game-model/src/codegen.ts` 多一张表：
  `ARTIFACT_CHAINS = { topdown: {label, dataNote}, rpg: {label, dataNote} }`，键就是 `ArtifactChain`。
  `hasArtifactEngine(pipeline)` 只问"这条管线在不在表里"，`artifactChainOf(document)` 只问
  `compileForKind(document).pipeline` 再落到这张表——**没有第四处**再判断一次"这一型走哪条链"。
- 分派点决定的是**引擎与载荷**，不是文案：`engineSource(chain)` 在 `rpg` 那一路多转一段 `NexusRpg`
  （`initialState` / `step` / `summary`，语义点与 `rpg.ts` 一一对上：击杀发经验、任务发经验、
  升级 while 循环补生命、任务门删 `questDone` 并收回同帧的 `won`），`artifactPayload(chain)`
  在 `rpg` 那一路交 `{...compileRpg(doc).base, notes, growth}`。**成长那些数只出现在 `plan.growth` 里**，
  值由 `rpg.ts` 的导出（`XP_BASE` / `XP_STEP` / `LEVEL_BONUS`）插进同一次序列化，产物代码里不许有第二个字面量。
- `codeKindReadings()` 的 `kindNote` 变成**这张表的读数**：`hasArtifactEngine(kindPipeline)` 为真就是 `null`。
  于是 `rpg-prototype` 这一型今天自动不再念那句错位——文案一行没改，是表多了一个键让它变空。
- 那句"这一份跑的是哪条链"只有一个写法：`artifactChainSentence(chain)`。
  产物页面（`index.html` 的 `#chain-note`）、Studio 面板（`<p data-game-code-chain>`）、
  链上那一格的 `notes` 三处调同一个函数。这是 ADR-0044 那条律（一句话五处共用）的延续：
  面板自己拼一遍，就会和分派点说两套话。
- **限度那一句跟着改口**：`CODEGEN_LIMITS` 第一条不再写"2D 那条链转写 sim.ts"，
  而是"2D 那条链转写 sim.ts，标了 RPG 原型的那一份再多转一段 rpg.ts"。

## 后果

- **正面**：八型里六型（五型 2D + 一型 RPG）拿到的产物就是这一型在平台上跑的那一套；
  `kindNote` 的种群从"三型非空"缩到"两型非空"，而这句话仍然是派生的——补第三条链时它继续自己变空。
- **见证变贵，但这是它该花的钱**：`scripts/game-code-parity.mts` 从一条链变成两条链
  （同一台 Chrome、两个页面、两个 loopback 源路径），判决 13 → 24 条。
  新加的那一臂 `RPG_LAYER_NOT_DECORATIVE` 是**反向控制**：把 `xpReward` 从底稿里剥掉再跑一遍成长 trace，
  两边必须分叉——否则"逐字节相同"这句话跟成长层没关系，见证就是空的。
  `SAME_GEOMETRY_ONLY_GROWTH` 钉的是另一头：这两份底稿除了 `kind` 与那一格 `xpReward` 没有别的差别，
  所以分叉只能来自成长层。（第一版在这里猜错了一次：`compileGame` 会把整坨 `stats` 搬进计划，
  两份 2D 计划因此并不相同——判据改成"剥掉 `xpReward` 之后相同"，而不是放宽比较。）
- **界面那一格多了一条恒在的读数**：`data-game-code-chain` 不是警告而是读数（哪条链），
  所以它对八型都得在；`data-game-code-kind` 仍是只在错位时才有。e2e 里两型各量一遍，
  并把屏上那句与**下载到的** `index.html` 里那句对账（一处拼两遍迟早有一处先过时，这一条量的是"过没过时"）。
- **仍然欠的**：`interactive-story` / `visual-novel` 两型只有披露没有引擎——那需要对话播放器（正文、选择、分支），
  是下一格（`ARTIFACT_CHAINS` 的第三个键）。它落地时 `kindNote` 会再次自己变空，八型全对上。
- **一条环境教训**（写进 `docs/TESTING.md`，不是产品决定）：这一片第一次跑 e2e 时 zip 那一格回 404，
  根因是 Next dev 的 Turbopack 缓存把 `game/code/zip` 这条路由漏掉了——源码、路由清单、集成测试全绿，
  只有真浏览器里点得到。判据：同一个源里另一条嵌套路由（`api/account/api-tokens`）回的是 JSON 而它回的是
  HTML 404 页。把 `.next/dev` 改名（`dev-stale-*`）重启即恢复。**"界面点了没反应"要先问路由有没有注册**，
  别去猜自己的改动。
