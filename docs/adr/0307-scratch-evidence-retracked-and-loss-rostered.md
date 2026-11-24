# ADR-0307 · 文档点名的 scratch 证据：取得回的逐字节入册，取不回的集中登记（2026-11-22）

## 状态

已接受（2026-11-22）

## 背景

`apps/web/test/doc-evidence.test.ts` 有四条腿，判据是「文档里每句『见证：`.scratch/<路径>`』都当场查得到，
而且跟仓库一起走」。v871 起这门是红的，实测三条腿断：

1. **入册被打断。** 2026-11-16 的 `49dec689 chore(repo): untrack .scratch/ (already in .gitignore)`
   把当时在版本库里的 128 个证据文件全部 `git rm --cached`，却没有同步改掉任何一句声称。
   门第 4 腿（入册人口 ≥ 100、点名必入册）从那天起一直红着。
2. **磁盘也没了。** 本机 scratch 之后又被清理过一轮。2026-11-22 实测：docs 里 110 个点名 token，
   磁盘上只剩 2 个。其中 127 个曾在版本库里的文件都能从 `49dec689^` 逐字节取回（合计约 1.38 MB），
   只有 1 个例外：`gateway-rate-lua-live/readings.json` 磁盘上是**更新且与历史不同**的字节
   （它被 `docs/CURRENT-STATE.md:619`、`docs/ROADMAP.md:11912`、`docs/ROADMAP.md:12051`、
   `docs/evidence/stress-2026-11-19.md:46,62` 点名，而 `docs/CURRENT-STATE.md:619` 早就写明修法是
   `git add -f`）。
3. **23 个 token 从未入册。** 都是 2026-11-16 之后写在 scratch 里的 live 探针 / 演练工具
   （`verify-parallel-warm.mts`、`stress-batteria.mjs`、`bible-qa-live-eval.py` 这类），
   历史里没有它们的字节。它们要么打的是外部模型 API（用户 2026-11-22 告知**已关闭**），
   要么依赖当时的实时栈，今天无法诚实重跑，因此也无法诚实重造。
4. **一个点名指的不是证据。** `docs/CURRENT-STATE.md:8075` 把 `scratch/showcase-site/site` 当见证写着，
   但那台目录是 `xiaodernan/xiaodernan.github.io` 的克隆工作副本（含 `.git`，展开 5051 个文件），
   不是一份读数。按目录腿去入册就是把别人的仓库塞进本仓库。

## 选项

A. 把第 3、4 腿改成「缺失就忽略」。否——那正是这门存在的理由，改完门就没牙了。
B. 37 处引用各写一句失踪说明。否——同一句话抄 37 遍，日后必然漂，也把正文弄脏。
C. **采用**：逐字节能取回的就取回并入册；取不回的一次性登记在本文，文档用**另一种拼写**声明它，
   门新增一条腿把「声明」和「名册」双向交叉核对。

## 决定

1. **恢复**：`git checkout 49dec689^ -- .scratch/<127 个路径>` 把磁盘上已失踪、历史里有的 127 个文件
   取回并同步入册；`gateway-rate-lua-live/readings.json` 保留本机更新的字节并 `git add -f`。
   入册人口因此是 128（≥ 100 成立）。2026-11-23 复测：docs 里带点的点名 token 共 86 个，86 个都解得出，
   且每一个解析出的路径（含 glob 与目录展开）都在版本库里；另有 24 个 token 改走名册声明（23 个 lost
   加 1 个 clone）。86 + 24 = 改口之前的 110。
   同日并回 `origin/main`（94 个独有提交）之后，整棵树的口径变成：带点点名 88 个唯一 token / 119 处，
   门逐个解得出且解析出的路径都入册；走名册声明的 36 个唯一 token / 51 处。入册人口仍是 128——
   main 那条线没有新增任何被点名的 scratch 字节。
2. **克隆改口**：`docs/CURRENT-STATE.md:8075` 的见证改成已入册的
   `docs/evidence/showcase-deploy-verify-2026-11-19.md`；克隆本体以 `scratch/showcase-site/site`
   声明，kind=`clone`。
3. **失踪名册**：下表 35 行 kind=`lost`（v1095 那批 23 行，加 2026-11-23 并回 `origin/main` 时按同一
   规矩追加的 12 行——那 12 个工具在**任何 ref 的任何提交里都没有字节**，`git log --all -- .scratch/<tok>`
   实测全空，因此既取不回也不该重造）。v1095 那批改口 37 处，并回时又改口 12 处，文档里同一写法
   （少一个点，正好落在抓取器的正则之外；实测：被改的那批文档里带点点名从 40 处降到 3 处），
   语义是「这是当时的 scratch 工具，未入册，读数只在正文里」。
4. **门新增第 5 腿**（派生，不手填）：
   - docs 里出现的每个 `scratch/<tok>` 声明必须在下面的名册里有一行；
   - 名册每一行必须在 docs 里至少被声明一次（不许留尸体行）；
   - kind=`lost` 的行必须仍然解不出：磁盘上没有、`git ls-files` 里也没有——
     所以「声明失踪」不能用来藏一个其实存在、本该入册的文件；
   - kind=`clone` 的行必须仍是含 `.git` 的目录，且其内部文件不入册；
   - 名册行数与声明数两侧都非空（人口判据，防空转假绿）。
5. **不再重造 live 读数**：外部模型 API 已关闭，凡本名册里的读数都以文档正文为权威存档；
   要恢复某一行，只允许真跑一次并把新字节入册，然后把那句声称改回 `.scratch/<tok>` 拼写。

## 名册（kind · token · 点名处）

2026-11-24 并轨校正：本地主线已逐字节入册并在文档中以 `.scratch/` 点名的 6 个文件不再是失踪项，
故从下表移除 `ask-page-sha2.mts`、`home-page-sha.mts`、`profile-portrait-display.html`、
`verify-canon-inject-live.mts`、`verify-creator-canon-live.mts`、`verify-creator-graph-live.mts`。
当前名册为 29 行 `tracked` + 1 行 `clone`；下文保留的历史普查数字只描述当时状态。
`clone` 只登记外部工作副本：干净克隆可以没有该目录，门只要求它不进版本库；本机若存在，仍校验 `.git`。

| kind | token | 点名处（docs） |
| --- | --- | --- |
| tracked | `ab-cache-key.mts` | `docs/CURRENT-STATE.md:7279`, `docs/evidence/cache-key-ab-2026-11-18.md:11` |
| tracked | `bible-qa-live-eval-answers.json` | `docs/evidence/bible-qa-live-eval-2026-11-19.md:9` |
| tracked | `bible-qa-live-eval.py` | `docs/evidence/bible-qa-live-eval-2026-11-19.md:9` |
| tracked | `cjk-sweep.py` | `docs/evidence/i18n-sweep-2026-11-19.md:1` |
| tracked | `live-ask-probe.mjs` | `docs/evidence/live-qapi-v945-2026-11-18.md:21` |
| tracked | `probe-ask.mts` | `docs/CURRENT-STATE.md:7194`, `docs/evidence/post-merge-live-2026-11-18.md:7` |
| tracked | `probe-e151-clash.py` | `docs/adr/0290-provider-cache-proxy-map.md:37`, `docs/CURRENT-STATE.md:7862` |
| tracked | `probe-v1001.mts` | `docs/evidence/probe-v1001-2026-11-19.md:37` |
| tracked | `proof-burst-12.mts` | `docs/evidence/burst-interleave-12-2026-11-18.md:5` |
| tracked | `proof-character-chat.mts` | `docs/evidence/character-chat-live-v955-2026-11-18.md:7` |
| tracked | `proof-studio-lane.mts` | `docs/CURRENT-STATE.md:6890`, `docs/evidence/studio-lane-cache-2026-11-18.md:5` |
| tracked | `proof-transport-cache.mts` | `docs/evidence/transport-cache-v947-2026-11-18.md:8` |
| tracked | `stress-batteria.mjs` | `docs/CURRENT-STATE.md:6273,6287`, `docs/PERFORMANCE.md:1935,1949` |
| tracked | `stress-ip-window.mjs` | `docs/CURRENT-STATE.md:6273,6287`, `docs/PERFORMANCE.md:1935,1949` |
| tracked | `verify-canon-multiprobe.mts` | `docs/evidence/canon-multiprobe-2026-11-18.md:8` |
| tracked | `verify-parallel-mix.mts` | `docs/evidence/parallel-cache-2026-11-18.md:10,40` |
| tracked | `verify-parallel-warm.mts` | `docs/CURRENT-STATE.md:6554`, `docs/evidence/parallel-cache-2026-11-18.md:9,39` |
| clone | `showcase-site/site` | `docs/CURRENT-STATE.md:8075` |
| tracked | `review-e2e.mjs` | `docs/evidence/design-review-live-2026-11-21.md:18` |
| tracked | `review-ui-e2e.mjs` | `docs/evidence/design-review-ui-2026-11-21.md:15` |
| tracked | `e2e-chat3.mjs` | `docs/evidence/llmctx-canon-prefix-2026-11-22.md:67` |
| tracked | `onboarding-e2e2.mjs` | `docs/evidence/onboarding-e2e-2026-11-21.md:15` |
| tracked | `stress.mjs` | `docs/evidence/stress-live-2026-11-21.md:19` |
| tracked | `bulk-e2e.mjs` | `docs/evidence/world-bulk-fill-2026-11-21.md:17` |
| tracked | `chronicle-e2e.mjs` | `docs/evidence/world-chronicle-live-2026-11-21.md:20` |
| tracked | `fate-e2e.mjs` | `docs/evidence/world-fate-2026-11-21.md:16` |
| tracked | `final-link2.mjs` | `docs/evidence/world-link-live-2026-11-21.md:25` |
| tracked | `echo-e2e.mjs` | `docs/evidence/world-memory-echo-2026-11-21.md:18` |
| tracked | `rag-e2e.mjs` | `docs/evidence/world-rag-lite-2026-11-21.md:15` |
| tracked | `typo-audit3.mjs` | `docs/evidence/zh-typo-audit-2026-11-21.md:11` |

## 后果

- 门重新有牙，而且比原来更严：以前只能靠「磁盘上有」蒙过去，现在「声明失踪」也要与名册双向对上。
- 版本库多背约 1.4 MB 的 scratch 读数。这是刻意的取舍：证据链的可复核性优先于仓库体积。
- `49dec689` 那次 untrack 的动机（scratch 人口膨胀）仍然成立，但只该对**没被文档点名的**文件动手。
  下一次再清理 scratch 之前，先跑这门：门红就是「这批里有点名在用的证据」的信号。
- 名册里的 35 行 lost 如果哪天能真跑重测，允许整行删掉并把声称改回 `.scratch/<tok>`——门会因为
  「声明少了」而红一次，提醒把字节入册，这是预期摩擦。

## 验证（2026-11-22 实测）

- 门本身：`npx vitest run apps/web/test/doc-evidence.test.ts` → **5 passed**（原来是 3 红 2 绿）。
- 恢复动作：`git checkout 49dec689^ -- <127 paths>` 后 `git ls-files -c -- .scratch` = **128**；
  点名 token 从「磁盘只剩 2/110」回到「当场解得出」：改口把 24 个（23 lost + 1 clone）挪到名册拼写之后，
  2026-11-23 复测剩下的 86 个带点点名**86 个全部解得出、且解析出的每一个路径都入了册**。
- 第 5 腿的三个走查桩（每个都先看红话、再把原字节写回、再跑一次确认回到 5 passed）：
  - A1 名册多一行 `arm-not-declared.mts` 而 docs 不再声明它 → 红，话是「ADR-0307 名册里有尸体行」；
  - A2 磁盘上造一个名册说失踪的 `ab-cache-key.mts` → 红，话是「名册说失踪，磁盘上却有」；
  - A3 在 `docs/TESTING.md` 写一个没登记的 `scratch/arm-unrostered.mjs` → 红，话是「声明没有名册行」。
  三个都 refused/named/restored 齐过，所以这条腿确实在读名册、读磁盘、读 docs，而不是恒真。

## 验证（2026-11-23 并回 `origin/main` 之后复测）

- 并进来的是 main 那条线 12 份 2026-11-21 的 evidence，它们各自点名一个当日的一次性工具
  （`review-e2e.mjs`、`fate-e2e.mjs`、`typo-audit3.mjs` 这类）。这 12 个 token 与 v1095 那批不同：
  **不是 untrack 弄丢的，是从来没入过册**——`git log --all -- .scratch/<tok>` 逐个实测 0 个提交，
  `git ls-tree -r origin/main -- .scratch` 也查不到，所以既取不回字节、也无法在不重跑的前提下诚实重造。
- 处置照本文决定 3：12 处声称改成 `scratch/<tok>` 拼写、名册加 12 行 kind=`lost`（表尾），
  门 `npx vitest run apps/web/test/doc-evidence.test.ts` → **5 passed**。
- 复测人口（并回之后整棵树）：带点点名 88 个唯一 token / 119 处，全部门都解得出；
  名册声明 36 个唯一 token / 51 处（35 lost + 1 clone）；`.scratch` 入册文件仍 128 个——
  main 那条线没有带来任何新的被点名证据字节，只是带来了 12 个新的、诚实的「查无此物」。
