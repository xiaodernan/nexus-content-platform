# ADR-0313 · 并回 `origin/main`：两条线并成一条主线，冲突逐文件解、生成物一律重导（2026-11-23）

## 状态

已接受（2026-11-23）

## 背景

P1 要求「所有分支 / worktree 并成一条主线」。本仓库长期是两条线各写各的：

- 合并基（merge base）实测 `3433207c`；`master`（`22c0995b`）相对 `origin/main`（`f7bd23eb`）
  独有 **56** 个提交，`origin/main` 独有 **94** 个提交；
- 两边都在 `docs/ROADMAP.md` / `docs/CURRENT-STATE.md` 尾部追加记录，都往正典
  （`docs/world-bible/`）里添回响，都改 `apps/web/src/app/globals.css` 与
  `apps/web/src/lib/guideCopy.ts`，都各自重生成 `generated.ts` / `canon_digest.*` /
  `docs/showcase/latest.json`；
- 三方合并实测 **14** 个文件冲突（用 `git merge-tree --write-tree` 当场复算，不凭记忆）：
  `canon_digest.sha256`、`canon_digest.txt`、`globals.css`、`guideCopy.ts`、
  `world-bible/generated.ts`、`bible-ask-behavior.test.ts`、`canon-answer-graph.test.ts`、
  `home-visual-style.test.ts`、`docs/CURRENT-STATE.md`、`docs/ROADMAP.md`、
  `docs/evidence/simulated-user-behavior-2026-11-22.{json,md}`、`docs/showcase/latest.json`、
  `scripts/gen-bible-snapshot.mts`。

两条线各自都跑绿过自己的门——但**合并后的树从来没被任何一边测过**。这正是本文要登记的重点。

## 选项

A. `git rebase` 把 master 的 56 个提交重放到 main 上。否：14 个冲突要在 150 次重放里各解一遍，
   生成物（digest / snapshot / latest）每一步都红，红到没人能读出哪一次是真错。
B. 只 cherry-pick main 的「净新增」。否：那 94 个提交里大半是彼此依赖的正典追加与台账追加，
   挑着拿会造出「文档说做过、代码里没有」的行——§159 禁止的头一种。
C. **采用**：一次三方合并落地，冲突逐文件判侧或取并集，生成物不手解而是重新导出，
   合并后整棵树重跑一遍门，跑不过的地方逐条找根因。

## 决定

1. **正典编号撞车走本仓库自己的先例**：两边都写了「E210」，且各自编号不同（master 到 E215、
   纪元「冬潮月第 140 年」；main 的 E210/E211 属 143/144 年）。按 `lineages-alt/` 已有处置，
   main 那 4 个文件逐字节归档进 `docs/world-bible/lineages-alt/echoes-2026-11-22-alt/`，
   标「原样保留 · 不为官典 · 不入 digest」。编号只有一个真值，别的文本都还留着，
   且 `digest` 的字节稳定前缀（§CACHE-4）不因并线而变——provider KV 前缀与 quire-cache 证明继续有效。
2. **生成物重导，不手解**：`canon_digest.*`、`apps/web/src/world-bible/generated.ts` 由
   `npm run gen:bible-snapshot` 从并线后的 `docs/world-bible/` 重新导出，
   `verify:bible-snapshot` 复测 ✓；`docs/showcase/latest.json` 里是「相对某个 commit 的计数」，
   留到合并提交落地之后用 `npm run gen:latest` 重导（它描述的 HEAD 必须是它所在的那个提交）。
3. **`guideCopy.ts` 取并集**：main 的新入口文案（`/world/<id>/network` 万象脉络、
   `/bible/threads` 回响线索索引、`/search` 站外维基百科那一块、Studio 的 AI 续写编年段、
   i18n 审计注释块）并入 master 的正典人口写法与 `/bible/margins` 页边批注行；
   过期的「1254 句」不再抄回来。zh / en 两个平面都核对过同一句话都在。
4. **`globals.css` 取并集，再按事实删死码**：`.cr-*`（master）与 `.nw-*`（main）两族都留；
   并完之后 `verify:census` 报 6 个零引用门面类（`.et-empty` `.et-link` `.et-linkEcho`
   `.et-linkJoin` `.et-linkList` `.et-linkMotifs`）。实测这 6 个在 **origin/main 自己**上就零引用
   （两侧用的是同一份 `tools/ci/facade-census.mjs`），`.et-note` 仍在
   `apps/web/src/app/bible/threads/page.tsx:149,167` 活着——于是按 ADR-0260 的手术刀流程删死留活。
   删后门复测：`globals.css 定义 3197 个类，全部有引用方`。
5. **字节钉（SHA pin）逐条判真假，不批量放行**：并线后 `verify:fe-gates` 红 5 条，逐条量过：
   - `/search`、`/bible` 目录页、`/bible/[slug]` 阅读页、`/studio` CharacterChat 这四处
     是 main 真功能带进来的字节（站外检索段、回响线索段、`canonPrefixChars` 徽章段），
     且合并基与 master 两侧原本都自洽 → **显式重钉**，前值留在测试标题里；
   - `/admin/savings` 那一处不一样：main 把钉改成 `35cde635…`，而这个值在**任何 ref 的任何提交**
     里都对不上那份页面字节（`git log --all -- <页面>` 共 10 个提交，逐个算过，0 命中）。
     基线与 master 的 `4d170d44…` 才与字节自洽 → **取 master 侧**，把「钉死了一份不存在的字节」登记在案。
6. **main 带过来的 12 条 `.scratch` 点名从未入册**：`git log --all -- .scratch/<token>` 逐个实测 0 个提交，
   `git ls-tree -r origin/main -- .scratch` 也查不到 → 按 ADR-0307 决定 3 走名册声明（kind=`lost`），
   不重造读数、不把「查无此物」写成门没牙。ADR-0307 的名册与人口复测一并更新。
7. **两侧追加记录都保留**：`docs/ROADMAP.md`、`docs/CURRENT-STATE.md` 按日期序并入。
   实测（标题级逐字比）：master∪main 两个文档的所有标题在并后树里 **0 个丢失**
   （ROADMAP 425 ∪ 444 → 451；CURRENT-STATE 590 ∪ 592 → 593）。
8. **陈旧 ref 只点名、不删**（删除是破坏性动作，等用户点头）：

   | ref | 独有提交（相对并线前的 master） | 处置 |
   | --- | --- | --- |
   | `origin/main` = `f7bd23eb` | 94 | 本次合并吃掉，并后应为 0 |
   | `main` = `0cacbbd8` | 0（其内容已在 master） | 保留，别再当第二主线 |
   | `refs/heads/origin/master` = `e9c4ba8f` | 0 | 名字会遮蔽 `refs/remotes/origin/master`，保留但点名 |
   | `refs/remotes/origin/master` = `ccb3ebdb` | 0 | 落后 master 9 个提交 |
   | `other/master13/14/15` = `dc20411a` | 各 0 | 三个 remote 指同一提交，保留 |
   | `local-clone/main` = `6218077d`（本文写作期间 `git fetch local-clone` 之后） | 137 | **不是重复指针，是第三条线**：见决定 9 |
   | `backup/echo168-169-duplicate` = `00b7d611` | 1 | 那份 E168/E169 已在 master 落地，属重复备份，保留 |
   | `backup/pre-merge-origin-main` = `22c0995b` | 0 | 本次合并的回滚点，保留 |
   | `stash@{0}: On master: e157-uncommitted` | — | 不是我造的，不动 |

9. **P1 还剩第二条要并的线，本文如实记下它存在**：写这份 ADR 时用
   `git fetch local-clone`（只读，不动工作树）才发现 `D:\内容创作平台` 不是个陈旧指针，
   而是**第三条线**：它的 `main` 已推进到 `6218077d`，相对 `origin/main` 独有 **90** 个提交
   （2026-11-22/23，含 E218–E220 正典、i18n 去夹杂、第九类委托「星图独行」、
   成本账第五本、管理台窄视口、`ADR 0308–0312` 那批编号在它那边），相对并线前的 master
   独有 **137** 个提交、落后 9 个；`git cherry -v` 实测 133 个连补丁都不等价。
   它的 `next dev -p 3100` 此刻正占着本机 3100（PID 30600，`D:\内容创作平台\apps\web`）。
   处置：本次合并**只吃 `origin/main`**——`master..local-clone/main` 那 137 个提交要在这一版
   落地并全树复测之后，单独再来一次同样的流程（解冲突 → 重导生成物 → 重跑门），
   不与本批混成一个没人能复核的巨型提交。P1 在那次合并之后才算完。
   那一次的冲突面在**本合并落地之后重量**（`git merge-tree --write-tree`，只读、不动索引也不动工作树）：
   **16 个文件**——`apps/ai-service/src/ai_service/canon_digest.{sha256,txt}`、
   `apps/web/src/world-bible/generated.ts`、`scripts/gen-bible-snapshot.mts`、`docs/showcase/latest.json`
   （这一族与本文决定 2 完全同形：生成物不手解，落地后重导）、
   `apps/web/src/app/globals.css` 与 `apps/web/src/lib/guideCopy.ts`（取并集，同决定 3-4）、
   五份字节钉/行为测试 `bible-visual-style` / `bible-ask-behavior` / `canon-answer-graph` /
   `observer-deepread-visual-style` / `search-page-visual-style`（同一套显式重钉纪律，逐条判真假）、
   `docs/ROADMAP.md` 与 `docs/CURRENT-STATE.md`（两边各自追加，按日期序都留）、
   `docs/evidence/simulated-user-behavior-2026-11-22.md`（就是本文「后果」里那条 md/json 数字不一致）、
   以及 `.scratch/gateway-rate-lua-live/readings.json`（**add/add**）。
   本批落地前曾记过「冲突面 = 4 个文件」，那个数是**两个错因叠出来的**：一是读法错——
   当时把 `git merge-tree` 的输出接了 `tail -20`，被切掉的正是字母序在前的 `.scratch/**` 与
   `apps/ai-service/**` 那几条（枚举本身就是发现时，必须写文件再 `grep -c`，不能 head/tail）；
   二是参照点动了——按并线前的 `master` 量本来就和按 `d2ed638c` 量不是同一件事。
   `local-clone/main` 现在相对
   新 `master` 只剩 **43 个独有提交、落后 10 个**（原本是 137 / 9），冲突面也因此从 4 长成 16——
   派生计数随参照点移动，规划要用**当下重算**的那一份。更要紧的是**它是一条活的线**：
   本文写完几分钟后再次 `git fetch local-clone`，它已从 `6218077d` 推进到 `11efbc1c`
   （独有提交 43 → **45**，它自己的工作树还有 16 个未提交路径）。所以第二次并线的动手条件是
   「fetch 之后当场重量 ahead/behind 与 merge-tree 冲突面」，任何写进文档的数都只是那一刻的快照。
   那份 add/add 的 `readings.json` 要写清楚再动：两侧各是一轮**真跑**的读数（本线 2026-11-19 `runId=mwnqcmbn-57220`、
   它线 2026-11-09 `runId=mw9lz2cl-30360`，同一枚 `luaSha256=8db0f4043dd7`），
   而本线原名那个路径被 **9 份文档**点名（`CURRENT-STATE`、台账 0016、`ROADMAP`、ADR 0307、
   `evidence/stress-2026-11-19.md` 等），`doc-evidence` 逐字节比的就是这个名字——
   所以**本线那一份留在原名**，它线那轮换一个带日期的名字并登记进 ADR 0307 的名册，
   两轮的读数都不许丢（丢一轮就是"把一次失败的读取说成没有数据"）。
10. **编号为什么跳到 0313**：ADR 号扫的是**所有 ref** 的 `docs/adr` 文件名，不只是本线——
    实测上界 `0312`（在 `local-clone/main` 里），于是本文取 **0313**，把 `0309–0312` 留给那条线，
    免它并过来时要改名。但同号不同文**不止一处，而是从 `0307` 就连撞两处**（2026-11-23 复扫
    `docs/adr` 文件名对比）：本线 `0307-scratch-evidence-retracked-and-loss-rostered.md`
    对 `local-clone/main` 的 `0307-observer-ai-advice-boundary.md`；本线
    `0308-db-fk-parity-and-restored-foreign-keys.md` 对它的 `0308-world-quests.md`。
    ADR 号表达的是**批准顺序**而不是内容身份，两条线各自往自己的下一个空号写，撞号是并线的常态。
    并那条线时的规矩：把**来客**（编号小于等于本线已用最大号的那几份）改到当时下一个空号，
    并在其文首留一句「原号 NNNN，因与本线的 <标题> 撞号而后移」，本线的文件不迁就。
11. **整树跑出来的三条红，各自归位**。合并树第一次 `npx vitest run` 是
    `Test Files 2 failed | 669 passed | 3 skipped (674)` / `Tests 2 failed | 8600 passed | 6 skipped (8608)`，
    两条红都是**并线新造**的，不是对面或本线单独能红出来的形状：
    ① `route-security-gate` 点名 `api/admin/observer/advice/route.ts`——这条路由是 main 侧
    `dcc7f087`（§ADMIN-LLM-2）新加的写入口，用 `currentUserOrNull()` 的 cookie 身份却没有 `csrfOk`；
    它对面那条同族兄弟 `observer/digest` 早就有这道门，所以这不是"main 忘了"，是**master 的 CSRF 收口批（v1096）
    立了闸、main 那边还在按立闸前的世界写代码**。修法照 digest 的既有形状：口令门之后紧接
    `csrfOk(req)` → `403 csrf_failed`，客户端按钮展开 `csrfHeaders()`，并在
    `observer-advice-audit` 补一条"两头都接上"的源码级腿——闸只有结构门会红一次，
    而接线纪律红过的东西不该等下一次事故。
    ② `style-tokens` 点名 `globals.css:5858` 的 `var(--nexus-color-border)`：main 写的是
    `var(--nexus-color-border-subtle, var(--nexus-color-border))` 这种"以防万一"的兜底链，
    而 `--nexus-color-border` 在本线的 `tokens.css` 里从来不存在（只有 `-subtle` / `-strong`）。
    兜底那半永远不生效，于是删掉它——字节变了，渲染不变，门从红转绿。
    ③ `npm run typecheck` 红 9 处，全在 `apps/web/test/db-fk-parity.integration.test.ts`，
    而那个文件**不在合并差异里**（`git diff --cached` 不含它，`git log -1` 指向本线 `59403812`）：
    这是 v1097 落门时只跑了 `vitest`、没跑 `tsc` 留下的本线 HEAD 红——`noUncheckedIndexedAccess`
    要求正则捕获组显式收窄，另有一处 `expect(list, []).toEqual([])` 把消息位写成了数组，
    运行时被忽略、类型上藏不住。假绿的不是门，是"这道门跑过 = 这个包编译过"这句没写下来的默认。
12. **`verify:arms-freshness` 在合并后的字节上红，根因是派生人口涨了**：收据 `arms-receipt.json`
    写在 2026-11-21 的一次全量绿跑，而合并把对面那 4 条 M9 证明带进了它要比对的人口——
    `verify:chain` / `verify:decisions` / `verify:deployments` / `verify:pull-requests`，
    每条都带 `sweep-budget-ms: 900000` 的预算标记，§3 于是拒收并逐条点名（实测
    `+ 4 条 / - 0 条`，前两条腿 §1 收据存在、§2 八个主体哈希全部 MATCHED 都先过了）。
    这不是"并坏了"，恰恰是 v542 那道门存在的理由：**改接线的人要么重跑 arms，要么让构建红**，
    靠记忆过渡才是以前会漏的那条路。处置是 `npm run verify:arms` 重出收据，而新收据**作为它自己的一次提交**
    落在合并之后（与决定 2 同类：生成物由它的生成者重导，收据不手改；不混进 155 文件的合并，
    好让一份重导的派生物单独可复核）。于是本合并提交里那一份仍是 2026-11-21 的旧收据，
    `verify:arms-freshness` 在那一刻红——这是登记在案的 outstanding 红，不是被漏掉的红。
13. **不 push**。远端仍是合并前的样子。

## 后果

- 一条主线：`master` 现在含 `origin/main` 全部 94 个提交，`git rev-list --count master..origin/main` = 0，
  从此不需要「先问这句在不在另一条线上」。
- **「两边各自绿过」不等于「合并绿」**：本次实测合并后先是 `verify:census` 红（6 个死类），
  再是 `verify:fe-gates` 红 5 条（4 条真字节移动 + 1 条对面带来的假钉），
  外加本线 ADR 0307（`scratch-evidence-retracked-and-loss-rostered`，即证据名册那一份，
  不是并 `local-clone/main` 时会同号撞上的那一份）第 3 腿红 12 处点名。
  全都指向同一条纪律：并线之后必须整棵树重跑。
- **门与门之间有缝**：`verify:fe-gates` 不含 `typecheck`，vitest 也不做全量类型检查，
  于是 v1097 新增的那份测试文件带着 9 处 `noUncheckedIndexedAccess` 红在本线躺了一次提交，
  直到并线后的 `npm run typecheck` 才露头。落笔的规矩：**新增/改动 `apps/web/**.ts` 的那一批要跑
  `npm run typecheck`**，与"新增一条写路由要过结构门"是同一类纪律。
- main 那条线上的 `simulated-user-behavior-2026-11-22.md` 写的是 79 命中那一轮，
  同名的 `.json` 却是 73 命中那一轮（master 侧另有一轮 75 命中）。**本次不改写任何证据字节**，
  这个缺口要靠并线后的真跑补齐（需要 3100 上的 dev server），已列为下一批的待办。
- 本机环境事实进了判据：占着 `next dev -p 3100` 的不是别的项目，而是**本仓库的第二份工作副本**
  `D:\内容创作平台`（PID 30600，见决定 9），旁边还有它的 proof 在跑，空闲内存只剩约 1.9 GB；
  第一次整树跑在跑到集成族时 worker 被 `ERR_IPC_CHANNEL_CLOSED` 打断（exit 1，**不是判据**），
  复跑把并发压到 `--maxWorkers=4`。以后在这台机器上跑整树要按并发上限来读，
  而要看 3100 上的 NEXUS 界面，得先给本仓库另起一个端口。

## 验证（2026-11-23 实测）

- 冲突解完后暂存树相对 `22c0995b`：**155 个文件改动，+9700 / −278**。合并提交落地时是
  **157 个文件，+9875 / −288**——多出的两处是 `apps/web/test/db-fk-parity.integration.test.ts`
  的 9 处 tsc 修（它本来不在合并差异里）与台账 0016 的 amendment 584；其余三条红的修与另三份记录
  本来就在那 155 个文件里，只是字节变了。
- 冲突标记残留：`git show :<path>` 逐个读 154 个暂存文件，`<<<<<<<` / `>>>>>>>` / 裸 `=======`
  **0 处**（第一次扫因为 CJK 路径被 git 加了引号而 4 个文件没读到，改用 `-z` + `core.quotePath=false` 后全读到）。
- `node tools/ci/facade-census.mjs` → **OK**（3197 类全有引用方）。
- `npm run verify:bible-snapshot` → **✓ bible snapshot 与 docs/world-bible/ 一致**。
- `npx vitest run apps/web/test/doc-evidence.test.ts` → **5 passed**（ADR-0307 五腿）。
- `npm run verify:evidence-census` → **exit 0**，且它的人口是**派生的**：并线之后从 116 个模块
  （104 行）长成 **140 个模块 = 124 行 + 5 helper + 3 swept + 8 tool**，arms 132/132 MATCHED——
  对面那条线新加的 `verify:*` 脚本自己把行数抬上去了，README 的表与散文被同一个量具核对成一致，
  这正是"合并之后不改表也能对上"的那道门。
- 新写的三份记录（本文、ROADMAP v1098 格、台账 584）过 `doc-evidence` → **5 passed**。
- `npm run verify:fe-gates` → **Test Files 154 passed (154) / Tests 1410 passed (1410)**。
- 重钉后的四处单独复跑：4 个套件 **38 passed**；`/admin/savings` 用 master 侧钉，同批绿。
- 第一次整树：`Test Files 2 failed | 669 passed | 3 skipped (674)` / `Tests 2 failed | 8600 passed | 6 skipped (8608)`，
  2496.51s（`--maxWorkers=4`，与别的项目的 proof 同机争抢；本轮另有 1 条 `Timeout calling "onTaskUpdate"`
  的 worker 超时，属测量噪声，两条红是断言级的、单独复跑同样红）——两条红与 9 处 `tsc` 红的处置见决定 11。
- 三条修的单独复跑：`npx vitest run apps/web/test/{route-security-gate,style-tokens,observer-advice-audit}.test.ts`
  → **Test Files 3 passed / Tests 48 passed**（含新加的那条 CSRF 腿）。
- `npx tsc -p apps/web/tsconfig.json --noEmit` → **exit 0**（修前 9 处，全在 `db-fk-parity.integration.test.ts`）。
- 修后 `npm run verify:fe-gates` 复跑 → **154 passed / 1410 passed**，`verify:census` 仍报
  **globals.css 定义 3197 个类，全部有引用方**。
- 修后整树（第二次）：`npx vitest run --reporter=dot --maxWorkers=4` → **exit 1**，
  `Test Files 2 failed | 669 passed | 3 skipped (674)` / `Tests 2 failed | 8601 passed | 6 skipped (8609)`，
  2699.71s。**两条红都不是断言红**：`ai-approvals.integration` 的「DEMO 的删除指令确实产出删除 op」与
  `credits-why-guards` 的「被点名的门都真有调用点」同为 `Error: Test timed out in 30000ms`，
  外加同一次 `Timeout calling "onTaskUpdate"` 的 worker RPC 超时（上一条用例的 `expect(csrf)…` 那两条真红
  在这次已经不在失败名单里）。后一条是同步源码扫描，单独跑整族只用 13.42s 就绿，却在 30s 处超时 =
  CPU/内存被同机别处的 proof 抽干，属测量面；单独复证 `npx vitest run apps/web/test/{ai-approvals.integration,credits-why-guards}.test.ts`
  → **Test Files 2 passed / Tests 53 passed（24.39s，打真实 Postgres 那条也过）**。
  于是本树在**断言面**全绿，唯一的红是并发争抢造成的超时——把它写成"整树绿"是假的，写成"门没牙"也是假的。
- 决定 12 的收据重导已落地（合并之后独立一次提交）：`npm run verify:arms` 在并线后的字节上
  **64/64 arms matched（41 条门 + 控制位，23 条 runner）**，临时平面 `D:\nexus-ci-arms-plane-38488` 自清；
  新 `arms-receipt.json` 戳 **64 条臂 / 8 个主体哈希 / 124 条派生行**，
  `npm run verify:arms-freshness` → **exit 0，9/9 fixture arms matched**。并线带进来的那 4 条 M9 证明
  从此在收据里有名有姓，决定 12 登记的那条 outstanding 红关闭。
- 决定 8 那张 ref 表在并完之后逐条复量（`git rev-list --count`，两个方向）：`origin/main` 独有 **0** ✓（表里
  预言的"并后应为 0"成立）、`main` **0** ✓、`refs/heads/origin/master` **0** ✓、`refs/remotes/origin/master` **0** ✓、
  `other/master13/14/15` 各 **0** ✓、`backup/echo168-169-duplicate` **1** ✓（与表一致）、
  `backup/pre-merge-origin-main` **0**（它现在就是 master 的祖先，正是它作为回滚点的定义）、
  `local-clone/main` **45**（活的第三条线）、`stash@{0}: On master: e157-uncommitted` 原样未动 ✓。
  只有"master 独有"那一列整体变大（`refs/remotes/origin/master` 从 9 → 106），因为 94 个提交现在在 master 这一侧——
  这不是新事实，是同一件事的反方向读数。
- 版本标签前沿并线后重扫（扫 `--all`，含刚 fetch 进来的 `local-clone/main`）：提交标题轴到 **1097**，
  本批取 **v1098**（`v1098` / `v1099` 两个平面都实测未占用）；台账尾号 583 → 本批 584；
  ADR 号上界 0312 → 本文 0313。
