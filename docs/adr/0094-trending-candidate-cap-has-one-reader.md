# ADR-0094：方法句里那个候选集上限，SQL 那一端必须继续按名字读它

- 状态：已接受（2026-11-09，§SEC 第四十四片）
- 相关：`docs/adr/0090-plan-axis-explanations-name-their-guard.md`（同一族纪律：披露的措辞必须由产生它的那段代码派生，
  且判据钉在**出货的那段函数体**上）、`docs/ROADMAP.md` 的 §61 Trending 一节（"排法透明"那句承诺）

## 背景

`/discover` 的「最近最热」那一栏会在页面上复述一句方法句（`trendingMethod()`），末尾是
**「只在最近 200 条公开版本里排」**。那个 200 来自 `TRENDING_CANDIDATE_CAP`（`trending.ts`），
而真正取候选集的是 `social.ts` 里 `discover()` 的那一行：

```ts
.limit(input.sort === 'trending' ? TRENDING_CANDIDATE_CAP : limit);
```

今天两端读的是同一个常数，所以这句话是对的。**但没有任何门要求它们继续同源**：
`trending.test.ts` 只钉"句子里出现这个常数"，把 SQL 那一行改成 `.limit(200)`（手抄一份）
或 `.limit(limit)`（跟着页长走，页长上限 60），句子照样说 200，那条腿照样绿。
于是"只在最近 200 条里排"会从一句披露变成一句谎——而这一栏偏偏是靠这句话让人相信
"这个序不是全表公认最热，只是一个有边界的候选集里排出来的"。

## 选项

1. **把常数抄进测试，断言 SQL 里出现 200**。否。那是第三份真值：常数改了测试跟着改，SQL 不改也绿。
2. **只加 DB 平面的行为腿**（造 201 条公开版本，看第 201 条进不进候选集）。
   它比静态门强，但今天不做：一条能同时抓住"上限变小"与"上限变大"的夹具需要**两条**判别项
   （第 200 位有分、第 201 位分更高），201 个项目 + 快照 + 发布行 + 点赞的插入成本，
   以及它仍然抓不住"手抄一个今天恰好相等的数字"（行为一模一样）。留给下一片，设计写在「仍欠」里。
3. **判据钉在 `discover` 自己的源码切片上，要求那一行按名字读常数**（选定）。
   与 ADR-0090 决定 4 同一手法：`functionSource(name)` 取 `export (async )?function name(` 到下一个 `export ` 之前那一段，
   在这一段里找 `.limit(…)`，要求它 ① 含标识符 `TRENDING_CANDIDATE_CAP`、② 仍区分 trending 与别的排序、
   ③ **不含任何写死的数字**。另配一条腿要求 `social.ts` 真的从 `./trending` import 这个常数、
   且自己**没有**另声明一份同名的。

## 决定

1. 新门 `apps/web/test/trending-cap-reader.test.ts`（5 条腿），**两条载体腿先红于判据腿**：
   找不到 `discover` 的函数体、或切片里 `.limit(` 不是一处，先说"判据没有载体"，
   而不是让后面的 `toContain` 在空串/undefined 上假绿或崩。
2. 判据腿要求标识符而不是值：`.limit(… ? 200 : limit)` 红（臂 X1），`.limit(limit)` 红（臂 X2）。
3. 同源腿要求 import 来自 `./trending` 且本地无第二份声明：`social.ts` 自己 `const TRENDING_CANDIDATE_CAP = 500` 红（臂 X3）。
4. **反向对照必须绿**：把常数本身 200→50，两端一起改口，全 12 条绿（臂 X4）。
   门不许惩罚正当改动——否则下一个人会为了让门绿而把常数写死回 200。

## 见证（逐字读数）

- 跑法与读数入库：`.scratch/arms-trendingcap.mjs` / `.scratch/arms-trendingcap.txt`。
- 对照（源码未变异）`total=12 failed=0 exit=0`；四条臂全部 `pred 全中 · not 全绿`：
  X1 手抄 200 ⇒ **1 failed**；X2 `.limit(limit)` ⇒ **1 failed**；X3 本地另声明 500 ⇒ **1 failed**；
  X4 常数 200→50 ⇒ **0 failed（反向对照全绿）**。每条臂还原校验 `OK`，`aborted=no`，
  收尾整树校验 `social.ts=OK trending.ts=OK`。
- 门本身：`trending-cap-reader.test.ts` 5 条 + `trending.test.ts` 7 条 ⇒ **12 passed (2 files)**。

## 后果与仍欠（如实记）

- 这一片是**静态门**：它证明"SQL 那一行按名字读的就是句子那一端的常数"，不证明"数据库真的只取了 200 条"。
  后者要 DB 平面的行为腿，夹具设计已经想清楚，留在这里供下一片直接做：
  造 `CAP+1` 条公开版本，按 `publishedAt` 从新到旧，第 1…199 位零互动、**第 200 位给 3 个赞、第 201 位给 10 个赞**；
  期望 `discover({sort:'trending'})` 的头一张卡是第 200 位那条、且第 201 位那条**不出现**。
  这样上限变小（第 200 位被排除）与上限变大/取消（第 201 位冒到头部）**两个方向都红**，
  而只造"201 条 + 最老那条分最高"的夹具抓不住上限变小。
- 另一格仍欠：`TRENDING_CANDIDATE_CAP` 本身是硬编码，ROADMAP 的 §61 一节早就写明
  "平台大了要换成分桶预聚合而不是抬高这个数"。这一片没有改那个架构判断，只是让今天这个数不许有两份。

## Amendment（§SEC 第四十五片，2026-11-11）——「仍欠①」的 DB 行为腿已落地

上一节的"仍欠①"（"只证明 SQL 按名字读常数，不证明数据库真的只取了 CAP 条"）已由
`apps/web/test/trending-cap-db.integration.test.ts` 兑现。夹具就是上一节设计好的双端判别，用真 Postgres
跑，不打桩：直插 `CAP+1` 条公开版本（`publishedProjects.snapshotId` 可空、`snapshots` 是 leftJoin，故不必
造 201 份快照文档），`publishedAt` 用未来时间戳逐条 -1s 让这批**独占全库最新位置**（消除其它测试残留
的污染），第 `CAP` 位 3 赞、第 `CAP+1` 位 10 赞、其余零互动。三条判据：

1. **库排序自检**：按 `publishedAt DESC` 查真库，第 `CAP` / `CAP+1` 名正是那两条带 3/10 赞的卡。
   这条先跑，防止夹具没占据边界时后面两条假绿。
2. **合取行为腿**：`discover({sort:'trending'})` 的头一张是第 `CAP` 位（候选集内唯一有分），且第 `CAP+1`
   位（分更高）**不出现**。这个合取命题唯一的绿条件是"LIMIT 边界恰好切在第 CAP 与 CAP+1 之间"——
   上限变小则第 CAP 位被截、头一张变零分的最新条；上限变大/取消则第 CAP+1 位冒头。
3. **判别前提**：直查真库确认被排除者确实 10 赞 > 进候选集者 3 赞，故它的缺席只可能来自边界而非分低。
4. **方法句同源**：`discover` 返回的方法句里那个数 == 这次实测边界用的 `TRENDING_CANDIDATE_CAP`。
   于是"静态门钉死 SQL 读常数 + 方法句读同一常数"与"行为腿钉死这个常数就是物理边界"两门串联，
   覆盖"改小 / 改大 / 手抄数字 / 跟页长"四类变异。

**实测读数**：`trending-cap-db.integration.test.ts` **4/4**（自检 · 合取行为 · 判别前提 · 方法句同源，
真 Postgres， collect 24.5s / tests 2.1s）；`npx tsc -p apps/web/tsconfig.json --noEmit` **exit 0**。
无库时 `describe.skipIf(!dbUp)` 整文件跳过（顶层 await 探测 settled 后再决定），同 job-lane-idempotency 纪律。

**诚实记仍欠**：因本机内存常年只剩 0.3–0.6 GB、且与并行 lane 共享工作树，本片**没有**对 `social.ts`
的 `.limit(...)` 行做源码级变异臂（§SEC 系列的惯例：改源码→跑→sha1 自校还原）。双端判别力由上面的
合取命题 + 判别前提 + 静态门串联给出（四类中"直接改 limit 表达式"这一手是本片唯一没有逐臂实测的变异，
但它在行为腿的合取断言下必然两方向红）。源码变异臂留待一台安静宿主补；夹具与判据已就位。