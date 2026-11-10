# ADR-0090：每格解释带上它说的是哪道门——门按地址取来、在句子声称的那条边界上问一次

- 状态：已接受（2026-11-08，§SEC 第四十三片）
- 相关：`docs/adr/0089-ui-counted-copy-generated-from-one-table.md`（它的「仍然没牙的那格」就是本片要补的）、
  `docs/adr/0014-credits-are-derived-and-only-one-plan-axis-bites.md`（"哪一格真会拦人"）、
  `docs/adr/0087-realtime-wire-error-ledger-by-reason.md`（同一族纪律：披露的措辞必须由产生它的那段代码派生）

## 背景

ADR-0089 把 `/credits` 那句话收成一份表（件数、名单、解释同源），并在结尾如实记下一格没牙：

> `ENFORCED_PLAN_AXE_WHY` 里每格那句解释**本身**对不对，没有任何门能验。

这一片把那句话兑现，第一遍就跑出三句与门不符的解释——三句都是**曾经真过**、后来门改了口径而句子没跟着改口的：

| 格子 | 句子原来怎么说 | 门今天实际怎么做 | 证据 |
| --- | --- | --- | --- |
| aiUsage | 「额度为 0 时新的 AI 任务被挡下」 | `refusalFor` 比的是 `balance >= cost`。image 类一次 2 点，余额 1 点**不是 0**，照样拒 | `refusalFor({kind:'image',cost:2,balance:1})` 返回一句话 |
| storage | 「存储写满时新的素材会被拒绝」 | `refusalForStorage` 比的是 `used + incoming <= limit`。198MB 已用、上限 200MB 时传 4MB 被拒——**没写满也拒**；反过来"写满了"这句话也并不能解释它拒什么 | 边界腿 `limit-1 / incoming=2` |
| teamCollaboration | 「pending 邀请也占名额」 | #213 之后 `teamSlotRefusalFor` 数 pending 邀请时带上 `gt(projectInvites.expiresAt, new Date())`：**过期的那封不占**，否则人会被永久堵在门外 | `credit-ledger.ts` 里那句过滤 |

另两格（generation 的点数、publishing 的"达到上限"）方向对但同样没读者：句子说"渲染额度为 0 时挡下"，
真门 `refusalForRun` 走的还是 `refusalFor` 那条点数线。

**这里有个必须先量的东西**：解释与门都是代码，谁能知道句子说的是哪道门？
如果测试自己 `import { refusalForPublishSlot }` 再问边界，那它测的是"测试抄的那道门"，
名册里把 publishing 与 teamCollaboration 的名字对调，页面两句话都说错了对象，而边界腿**一条都不会红**。
所以这一片不是"加几条用例"，而是先把「哪句话 ↔ 哪道门」这份对应关系写成代码里的一份地址。

## 选项

1. **只加静态门**：盯着句子措辞里不许出现那三句旧口径的原话。
   否。它能拦住"再说一遍已经知道是错的那句"，拦不住任何一句新的谎；而且它不产生"这三句今天为什么错"的证据。
2. **每格带上门函数的名字，测试按名字问行为**（选定）。
   `module` + `guard` 两个字符串是那道门的地址。测试从命名空间按地址取真函数，在句子声称的那条边界上问一次：
   地址解析不出函数 ⇒ 红；取到的门在边界上不按句子答 ⇒ 红；门只导出没人调用 ⇒ 红。
3. **把每格解释写成一段可执行的规格（DSL），句子由规格渲染**。
   否。五格三条边界，为了少写三个 assert 引入一门小语言，读的人反而要先学它。今天这份表 + 一个测试文件已经够窄。

## 决定

1. **`ENFORCED_PLAN_AXE_GUARDS`**（`apps/web/src/server/domain/credits.ts`）取代原来那份纯字符串表，
   每格 `{ module, guard, why }`；`ENFORCED_PLAN_AXE_WHY` 保留，但只能由它 `Object.fromEntries` 摊平出来
   （界面那一列的读者不变，句子的写入方仍只有一个）。
   类型是 `as const satisfies Record<EnforcedPlanAxis, …>`：加一格忘写拦截方 = 编译错误。
2. **点数不手抄**：aiUsage 与 generation 两句里的点数由 `${GENERATION_COST.ai}` / `${GENERATION_COST.image}` /
   `${GENERATION_COST.video}` 拼；另配一条腿把句子里出现的整数逐个抠出来与常量表对照
   （`why` 改成写死的"1 点 2 点 5 点"再改成本 ⇒ 那条腿红，而边界腿仍绿——见臂 W4）。
   storage / publishing / teamCollaboration 三句**不许带数字**：上限在页面另有一列，句子只说形状。
3. **边界腿一律走地址**（`credits-why-guards.test.ts` 的 `guardFromTable(axis)`），不 import 具体门名。
   这是对调臂 W7 唯一能响的原因。generation 那格点名的 `refusalForRun` 要读库，单元平面跑不动：
   它的"数"仍由纯 `refusalFor` 钉（同源同一份常量），"它确实把这三个数交给 refusalFor"由**读函数体那一段**钉。
4. **声称行为的句子钉在它点名的那个函数自己的那一段上**，不是"整个 src 里搜得到这个 token"：
   `gt(projectInvites.expiresAt` 同时出现在 `credit-ledger.ts` 的名额 SQL 与 `team.ts` 的邀请视图里，
   删掉前者而全树搜索的写法照样绿（臂 W6 量到的正是这个洞，改成 `functionSource(file, name)` 切片才响）。
5. **旧口径的句子双端禁**：`STALE = ['pending 邀请也占名额', '额度为 0 时新的 AI 任务', '渲染额度为 0', '存储写满时']`
   既不许出现在页面端出去的那句话里，也不许出现在 `credits.ts` 的散文里（注释还在讲旧口径同样是两份真相）。

## 后果

- 三句解释改口了，判据一行没动。改的是措辞而不是门——门的口径由 #191/#199/#211/#213 那几片落定时就定了，
  今天没有任何一条证据说它们该改。
- 现在改门会有人来敲门：把 `refusalFor` 的 `>=` 改成 `>`、把名额 SQL 的过滤删掉、给门改名，都会红在
  **对应那一格的名字**上，而不是红在某条与它无关的用例里。
- 代价：名册多了一列必须维护的地址，且 `NAMESPACES` 那两行是手写的登记处——
  新增一个模块的门要先在那里登记，否则红话说"写在没登记的模块里"。这是想要的摩擦。
- **仍然没牙的那格**（如实记）：地址只证明"这道门存在、装在链上、在我问的那条边界上按句子答"。
  句子若声称一件**我没写用例去问**的行为（例如"撤回即释放名额"），门仍不会被任何腿问一次——
  那需要往 DB 平面要一条真邀请，`team.integration.test.ts` ⑥ 有形状，但它不读 `why`。
- **ROADMAP 那一行当时没写**（如实记，2026-11-09 已还）：落地那一刻 `docs/ROADMAP.md` 是另一条会话的在飞路径
  （工作树里有它未提交的改动），按路径提交会把别人的半成品混进这一笔，所以第四十三片的账先只记在这份 ADR 里。
  那条会话的改动已进主干（工作树干净）之后，`docs/ROADMAP.md` 文末补上了 `## §SEC 第四十三片` 一节，
  并把第四十二片「仍欠 ①」那句就地改成已还——**欠账清偿的日期与清偿时的 HEAD 都写在那一节里**。

## 见证（逐字读数）

- 门本身：`apps/web/test/credits-why-guards.test.ts` 17 条腿；连同 `credits-enforced-copy.test.ts`（8 条）与
  `credits.test.ts`（26 条）三个文件一起跑 ⇒ **51 passed**（电池对照臂与电池收尾各跑一次，两次同数；
  这三份就是 `.scratch/arms-creditswhy.mjs` 里 `TESTS` 那三行，臂评的人口与对照的人口是同一份）。
- 变异电池：`.scratch/arms-creditswhy.mjs`（跑法 `node .scratch/arms-creditswhy.mjs`，
  读数逐字落在 `.scratch/arms-creditswhy.txt`）。七条臂**每条都先写预测红名单与预测绿名单再跑**，
  结果七条全部 `pred 全中 · not 全绿`：

  | 臂 | 变异（改的是真值那一侧，不是测试） | 预测红 | 实测 failed |
  | --- | --- | --- | --- |
  | 对照 | 无 | — | 0（total=51，exit=0） |
  | W1 | generation 的 `module` 从 `credit-ledger` 写成 `credits`（地址指错模块） | 解析 / generation 函数体 | 2 |
  | W2 | storage 的 `guard` 改成一个不存在的名字（门改名，句子还说它拦着） | 解析 / 调用点 / storage 边界 | 3 |
  | W3 | `refusalFor` 的 `balance >= cost` 收紧成 `>`（刚好够也不放行） | aiUsage 边界 / generation 同源 | 3 |
  | W4 | aiUsage 那句点数改回手抄，同时 `GENERATION_COST.image` 2→3 | 只有"数字不许有第二份"那条 | 1 |
  | W5 | teamCollaboration 那句改回旧口径「pending 邀请也占名额」 | 旧措辞双端 / 过期口径 | 4 |
  | W6 | 删掉 `teamSlotRefusalFor` 里的 `expiresAt` 过滤 | 只有"过期不占名额"那条 | 1 |
  | W7 | publishing 与 teamCollaboration 的 `guard` 名字对调（两门都在、都有调用点） | 两格边界腿 | 2 |

  W4 与 W7 是这一片区别于"加几条用例"的证据：W4 里边界腿全绿而数字腿独红（成本变了、句子没改口），
  W7 里名册腿全绿而两格边界腿红（门都在，只是句子说错了对象）——静态门与"测试自己 import 门名"的写法都看不见这两种。
- 两条**不在预测里的另红**，如实记而不是事后补预测：W3 多红 `§134 余额、发放与拒绝 点不够就不许跑，且拒绝的话里带着两个数字`
  （它读的是同一道 `refusalFor`，边界收紧当然连它一起红）；W5 多红 `今天这一页端出来的那句话，逐字与生成函数一致`
  （页面读的是 `planEnforcementReadout()`，表改口它就跟着改口，逐字门先响）。两条都是同源连坐，不是门的漏洞。
- 还原：电池自己按 sha1 校验两个被改的文件回到臂前字节 ⇒ `credits.ts=OK credit-ledger.ts=OK`，`aborted=no`。
  中途一次人为停跑把树留在 W3 的变异上（`balance > cost`），按已知那一条 splice 反向改回 `>=`，
  **没有用 `git checkout --`**（那会连未提交的表一起抹掉），改回后 `git diff` 逐行确认只剩本片 intended 的改动。
- 界面：`@smoke §134 跑一次生成…` **1 passed (1.1m)**；`screenshots/credits-enforced-copy.png` 逐字看过
  （该目录在 `.gitignore` 里，截图是本地凭证不是入库证据，故这一条只记读数不记路径为证）。
- 静态门：`npm run typecheck` 与 `npm run eslint` 各 exit 0。
- 全量：本片进主干后由另一条会话的两片重跑覆盖到（`f604d13`，272 文件 / 3590 条，两次 exit 0）；
  `git merge-base --is-ancestor eb809df f604d13` 为真，即那次全量跑的人口里**有**这一片的三个文件。
  本会话自己起的那次全量后台跑被会话重启截断（输出只有 40 行、没有 summary），**不作为证据引用**。
