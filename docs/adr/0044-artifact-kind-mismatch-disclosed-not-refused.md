# ADR-0044：产物与类型的错位**说出来**，而不是把下载关掉——一句话由分派点派生，五处共用

- 状态：已采纳（§52 最后一格的 README / index.html / HTTP 响应 / Studio 面板 / 链上那一格同时改口）
- 日期：2026-10-17
- 关联：§52、§51、§16、§81、§159、ADR-0038（那一格最初立的限度）、ADR-0039（链上 code 那格）、ADR-0042（playtest 与 code 并列）

## 背景

`generateGameCode()` 只有一条投影链：`compileGame()` 排出来的是 **2D 俯视关卡计划**，
产物里的 `engine.js` 也只跑得动这一种。而 §51 的类型表今天有八型，其中三型在平台上跑的**不是**这一条：

| 型 | `compileForKind().pipeline` | 试玩页跑的东西 | 产物里的东西 |
| --- | --- | --- | --- |
| `rpg-prototype` | `rpg` | 战斗 step + **成长循环**（经验、升级、任务发经验） | 只有俯视关卡，没有成长 |
| `interactive-story` | `story` | **对话管线**（正文来自对话实体说明，选择来自引用） | 一个没有玩家、开不了场的场子 |
| `visual-novel` | `story` | 同上 | 同上 |

错位一直存在，README 里那句话把它盖住了。2026-10-17 用 `tsx` 各跑一份实测（没有猜）：

- `kind: 'rpg-prototype'` 那份 → `compileForKind` 报 `rpg`，`generateGameCode` 交出 7 个文件 / 27276 字节，
  README 写着"**界面上的画布读的就是这一份**"——产物里根本没有成长循环，这句在这一型上是假的。
- `kind: 'visual-novel'`（两条对话实体）那份 → `compileForKind` 报 `story`，
  `compileGame` 自己给出阻塞项"没有玩家实体……开不了场"，产物照样 7 个文件 / 19088 字节，
  `index.html` 里读不到那两条对话的正文。

也就是说：作者从界面上点"生成可玩产物"、解压、双击 `index.html`，打开的**不是**这个类型在试玩页跑的那一种，
而产物里那句话告诉他两边是同一份。这是 §159 明令禁止的那类谎（不是"能力没做到"，是"话说是了而实际不是"）。

## 选项

**A. 非 `topdown` 的类型拒绝生成。** 一句谎都不留，最干净。
但 §52 的链把自己草稿标成 `rpg-prototype`（`gameDraft` 里写死），所以链上第五格每次都变成 failed——
为了界面诚实把一条已经跑通的链弄红，代价与收益不对等；而且下载入口从此对三型消失，
用户手上那份 2D 产物（对 5 个型是**真的**）也一起没了。

**B. 给产物补一条 RPG / 对话引擎。** 根治，但那是新的一格能力（要引擎、要试玩、要一轮 e2e），
不是这一片能验完的范围；在这一片里写半条引擎就是 §159 说的"假生成"。

**C. 把错位说出来：那句话由分派点派生，五处共用同一句。** 下载照旧，
但 README、`index.html`、HTTP 响应、Studio 面板、链上那一格都念同一句"这一格只有一条投影链……
你打开的不是这个类型在试玩页跑的那一种"。

## 决定

选 **C**，并加两条约束：

1. **那句话必须是派生的，不许有一处手抄。** `codeKindReadings(document)` 读 `compileForKind(document).pipeline`
   与 `GAME_KIND_STATUS[document.kind].note` 拼出来；README 行、`index.html` 段落、路由字段、
   面板 `<p data-game-code-kind>`、链上那格的 `notes/summary/counts.kindMismatch` 全吃这一个返回值。
   证据不是"这句话今天相等"（抄的那份也相等）：单测在跑之前把 `GAME_KIND_STATUS['visual-novel'].note`
   换成哨兵串，产物的那句话必须跟着变，`finally` 还原后再量一遍它不含哨兵。
2. **对得上时一个字都不印。** `pipeline === 'topdown'` → `kindNote = null`，界面上没有那段、
   README 保留那句真话。恒真的警告与恒无的警告一样没人信。
   这一条有反向见证：链上注入一份 `kind:'2d'` 的草稿时，`notes` 里不含八型状态表中的任何一句、
   `counts.kindMismatch === 0`。

`kindPipeline` 一起进响应，因为链上那句摘要要说"这份设计标的是 rpg"，而那个数不能是界面猜的。

## 后果

- 三型的作者现在在下载前就看得见错位，产物文件里也带着同一句——转述给别人时两边对得上。
- **错位本身没有被修掉**，只是被说出来。这一片明确留下一格欠账：给产物真的 RPG 成长循环
  与对话管线引擎（选项 B），那时 `kindNote` 应随分派点自动变空——不需要改这句文案，
  因为它读的本来就是 `compileForKind`。
- `pipeline: null` 那条分支今天走不到（八型全接了），所以这一片**没有**为它写测试；
  #139 若接链上草稿的 `kind`，要挑的是可达的接缝，不是这一格。
- 面板那句警告是新增的可见文案，占一处版面；用琥珀色边框而不是红色，因为它说的是"这一型与产物不同链"，
  不是"这份产物坏了"。

## 凭证

- `packages/game-model/test/codegen.test.ts`：八型表驱动（`kindNote` 为空 **当且仅当** 这一型读的是产物那条链，
  并给非空种群下限）、同一句在 README 与 `index.html` 里逐字节相同、对话型同时说出错位与"这个场子开不了"、
  两型两句话而文件清单相同、哨兵串那一条（23 tests，本片前是 18）。
- `apps/web/test/game-code.integration.test.ts`：响应里的 `kindPipeline/kindNote` 与第二次
  `codeKindReadings(design)` 调用相等；`kind:'2d'` 时 `kindNote === null` 且 `index.html` 里没有 `kind-note`，
  反向对照换 `rpg-prototype` 那句话回来。
- `apps/web/test/agent-orchestration.integration.test.ts`：链上第五格念这句、`kindMismatch === 1`、
  摘要里"这份设计标的是 rpg"；外加注入 `kind:'2d'` 草稿那句话与该计数一起消失。
- `e2e/studio.spec.ts` §52 Code 那一支：2D 时界面 `[data-game-code-kind]` 数为 0 → 换视觉小说（立刻写库、
  等"库里正在写"自己消失）→ 那句出现、含三个可判别片段、`toBeInViewport()`、下载 README 里
  **含有屏上这一整句**且不含那句只对该得时才成立的老文案 → 换回 2D 那句自己消失、README 老文案回来。
  截图 `screenshots/game-code-kind-mismatch.png`。
- 变异电池 7 臂（`.scratch/arms-140.mjs`，起点 50/50 绿）：
  A 绕过分派点 → 9 红；B README 那一行不分叉 → 4 红；C 页面少了那句 → 2 红；
  D 链上那格不念 → 1 红；E 路由丢字段 → 2 红；F `kindMismatch` 写死 1 → 1 红（正中新加的那条 2D 见证）；
  G 摘要里的管线名写死 → 1 红。每臂红的用例名都点名它自己拆掉的那处供给，收尾三份文件逐字节还原。
  （G 第一版拼串用了双引号，`${'$'}` 不展开 → 命中 0 次判 INTERFERED，改成反引号后重跑才作数。）
  一处对不上的地方记在这里免得日后找不到：电池跑完后把那条"两型两句话"的单测标题改准了
  （原标题说"改了状态表里的管线"，而它的正文比的是两型之间那句话不同、文件清单相同；
  真正改表格的是哨兵串那一条）。断言一个字没动，所以电池里那几行的**用例名**读起来与现在差一条标题。
