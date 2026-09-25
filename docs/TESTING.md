# TESTING

开发闭环本身（§158/§192）：
`OBSERVE → PLAN → IMPLEMENT → RUN → TEST → SCREENSHOT → INSPECT → FIX → RETEST → COMMIT`

**没有跑过、没有看过的功能不算完成。** 类型检查与单测只证明代码正确，不证明功能可用。

## 分层

| 层 | 工具 | 范围 | 何时跑 |
| --- | --- | --- | --- |
| 单元 | Vitest | design-model 布局求解、Command 事务、token 解析、codegen IR、schema | 每次改动 |
| 契约 | Vitest + `contracts/*.schema.json` | web ↔ ai-service 报文：zod 为权威，导出 JSON Schema 供 Python 运行期校验，测试保证导出文件不漂移 | 每次改动 |
| 服务 | pytest（`apps/ai-service/tests`） | 契约校验、Model Router、provider 成功/失败/噪声、审批门、dryRun、体积上限 | ai-service 改动 |
| 集成 | Vitest + 真 Postgres(容器) | 项目 CRUD、snapshot/branch、publish、usage | 每里程碑 |
| 端到端 | Playwright | Studio 全流程竖向切片（见下 Golden Path） | 每里程碑 + 发布前 |
| 视觉 | Playwright screenshot + Visual Benchmark | 渲染快照、AI Diff 前后对比、参考图 vs 生成图 | Studio/渲染器改动 |
| Agent 评测 | `evals/` | design accuracy / code correctness / tool selection / RAG / accessibility | ai-service 改动 |

禁止 mock 数据库做集成测试（真实容器实例）；provider 在测试里用 Mock Provider，但必须显式标注 DEMO MODE 断言。

## Golden Path（M1 必须端到端通过）

```
1  打开 / （未登录）→ 输入一句 prompt → 60s 内 Canvas 出现设计（§137-138）
2  点击元素 → 右面板改 padding/color → 画布即时更新 → 刷新后仍在（§15-16）
3  拖动 + 缩放 + 框选多选 + Ctrl+Z/Ctrl+Shift+Z（§8/§148）
4  AI 命令栏："Make the hero 30% taller." → Plan 可见 → Activity 流式 → AI Diff → 一次 Ctrl+Z 全回滚（§7/§25-26/§149-151）
5  Layers 重命名/显隐/锁定/拖拽改父级
6  设计系统：改 color.primary token → 所有绑定节点更新 → Ctrl+Z 回滚（§12/§13，已覆盖）
7  Code 页 → 生成的 React 可编译；改一处代码 → 画布同步；不可映射片段标为 code-only（§19）
8  Preview iframe 只读渲染 + Mobile/Tablet/Desktop/Wide 切换无横向溢出（§14）
9  Screenshot 出图并出现在 Activity 与视觉 QA 结果里（§33/§87）
10 保存项目 → Snapshot 创建/比较/恢复 → 开分支并来回切换 → Duplicate 成新项目（§27/§28，已覆盖）
10b 生成 4 条方案 → 并排比较 → "A 的布局 + C 的视觉"合成 → 采纳才换画布（§29，已覆盖）
10c 真实 provider 生成方案方向（现在是确定性配方，UI 常驻 DEMO MODE）
11  Publish 过 Quality Gate → /n/<user>/<slug> 可访问（private/unlisted/public 语义正确，§56-57/§179）
12 导出 ZIP 含 .nexus/ 结构，能在干净实例导入还原（§102-104/§144）
```

## 质量门禁（§179，Publish 前必须全绿）

`Build` · `Tests` · `Security`（无高危审计项）· `Performance`（LCP/CLS/INP/bundle，§91）·
`Accessibility`（对比度 + 键盘 + ARIA，§90）· `Visual QA`（无回归，§33）。
任一未达标 → Publish 阻塞并列出原因，不允许静默跳过。

当前实现状态（如实）：`packages/design-model/src/health.ts` 的 `analyzeHealth()` 一次算出七行，
Studio「健康」页签、Publish 弹层与服务端 `runPublishGate()` 用的是同一个函数（§16）。
Build（`validateDocument`）· Accessibility（对比度/alt/按钮名称/点击目标）· Performance（**静态预算**：
节点数、树深、位图字节、缺尺寸图片、动效数——不是 LCP/CLS/INP 实测）· Visual QA（token 绑定、栅格、
越出画布、零尺寸）· Security（模型内可查：疑似明文凭据、code 节点危险写法、http 外链——不是漏洞扫描）。
分数线：Accessibility 80 · Performance 70 · Visual QA 60；Build 与 Security 有一条 error 即挡。
**Tests 与 AI QA 没有本地可算信号，状态是 `not-run`、显示"未评估"、不参与门禁**——
不是待补的空位，而是"这里还没被检查过"的可见表达（§159）。审核管线同样未接入
（`published_projects.moderation` 停在 `pending`）。唯一刻意放行的是切成 `private`：下架不该被挡。

回归锁在哪里：`health.test.ts` 断言七行齐全、未评估行 `score = null` 且 `gating = false`、
门槛两侧（3 条 warning 82 通过 / 4 条 76 挡住）、error 一票否决、40 条截断后 `omitted` 计数与全量扣分、
凭据发现脱敏（整份报告 JSON 里查不到原文）、localhost 不算明文外链；
`publish.integration.test.ts` 断言挡住时不写发布记录也不留快照、同一份坏文档切私有放行；
e2e 断言面板把"未运行的检查"列出来，而不是显示全绿。

## 性能测试（§146-147）

设计文档规模基准：100 / 1000 / 10000 节点。度量并记录：首帧渲染时间、pan/zoom 帧率（目标 ≥55fps）、
选中响应 <16ms、属性写入到画布更新 <50ms、内存峰值。回归即视为 bug。

## 约定

- 测试文件与被测文件同目录 `*.test.ts` / `tests/test_*.py`
- 不因"难测"跳过；难测处优先重构出纯函数（design-model 就是为此存在）
- 截图对比失败时**必须人眼看图**再决定更新基线，不允许盲目 approve
- 生成的代码要用真实编译器验证：`codegen.test.ts` 用 `ts.transpileModule` 断言零语法诊断；
  e2e 断言代码视图与画布同源（选中节点 → 高亮它对应的那一行）
- Code → Design 的双向不变量：`code-parse.test.ts` 断言 `parse(generate(page))` 零补丁零 unmapped（往返恒等），
  并逐条断言结构性改动**只报告不回写**；e2e 断言改类名 → 应用 → 画布与属性面板同步 → 一次 Ctrl+Z 全回滚
- Snapshot 的不变量（§27/§108）：恢复必须真的改到库里（e2e 恢复后 `reload()` 仍是恢复值），
  恢复前后各留一条快照，且"当前 == 目标"时不多写安全快照 —— `snapshots.integration.test.ts` 直接打真实 Postgres，
  因为 jsonb 会重排对象键顺序，任何用 `JSON.stringify` 判等的实现只有在真库里才会露出来
- Compare 的不变量（§27/§151）：`diff.test.ts` 断言同一份文档零差异、键顺序不同零差异、
  差异停在最浅的不同层、结构改动归为 added/removed/moved、超限如实截断
- Branch 的不变量（§28）：`branches.integration.test.ts` 打真实 Postgres 断言——当前分支只能由
  `projects.currentSnapshotId` 推出（每条分支各自持有 head 快照）、分支来回切换后各自的现场必须还在原分支上、
  内容没变时反复切换不堆噪音快照（切换本身仍留一条历史）、从历史快照开分支起点是那份快照、
  老项目自动补 main 并收养无主快照、同名分支在不同项目间互不影响
- Duplicate 的不变量（§27）：`duplicate.test.ts` 断言副本页面/组件全部换号而节点 id 不变，
  且 `activePageId`、`component.pageId`、变量 `refId`、交互 `target` 都指向副本而不是源项目；
  e2e 断言复制后 URL 的项目 id 真的变了（不能用 `/studio/[^/]+` 匹配，副本同样满足）、
  当前视觉方向被带走、副本只有一条 main 分支和一份初始快照、源项目不受影响
- 资产的不变量（§38/§80/§182）：`image-safety.test.ts` 用手搓的合法容器断言——只认 magic bytes（扩展名/Content-Type 不算数）、
  四种格式的 EXIF/XMP/IPTC/注释段都被剥掉且**剥完仍能读出原宽高**（WebP 还要断言 RIFF 声明长度被重写对）、
  截断的 PNG 宁可抛错也不存坏图；`assets.integration.test.ts` 打真库+独占临时存储目录，断言识别→剥离→落库、
  非位图被拒、同项目重复上传复用同一行、作者能取非作者返回 null、公开取字节要"发布行 + 钉住快照确实引用"两条都满足、
  删本人成功删他人拒绝、`copyProjectAssets` 让副本各持自己的行与字节（删源不影响副本）；
  `remapAssetIds`（`duplicate.test.ts`）断言清单与 paint 引用一起换号且不动源文档。
  e2e 守的是投影同源：上传后画布节点的计算样式里有真实资产 URL、面板缩略图 `naturalWidth>0`
  （证明**剥离后的字节真能被浏览器解码**，而不是只挂了个 URL）、一次上传撤销后图片层与清单条目一起消失、
  预览路由看到同一份投影
- 认证的不变量（§137/§80）：`password.test.ts` 断言哈希非明文且带 `$2` 前缀、正确/错误口令、同口令两次哈希不同（有盐）、
  过短口令拒绝、stored 为 null 也返回 false（游客/未注册走这条路）；`rateLimit.test.ts` 用假时钟断言窗口内放行到上限、
  **被挡下的请求不计入窗口**（否则限流会加速自锁）、窗口滑过后名额放出、不同桶键互不影响；
  `auth.integration.test.ts` 打真实 Postgres 断言注册**就地升级**（同一 user id 换成真实账号、名下项目 ownerId 不动从而被认领、
  写 claimed_at、口令存哈希不存明文）、提权时**旧会话 token 被吊销 + 换发新 token**（防会话固定）、邮箱唯一索引拒重复注册且不写坏已存在账号、
  口令错误与邮箱不存在返回同一 `invalid_credentials`（不泄露是否存在）；
  e2e 守用户可见结果：游客建项目 → 注册后项目仍在名下且回执显示"已认领 1" → 登出落到全新游客（项目列表清空）→
  重新登录同一邮箱项目找回
- 多方案的不变量（§29）：`concepts.test.ts` 断言两个轴各自搬得动——视觉语言只改 token 不碰节点、
  结构方向只改节点不碰 token、同一份输入两次生成得到同一组方向（没有随机数）、每条方案仍是合法文档；
  `variants.integration.test.ts` 打真实 Postgres 断言生成与合成**不推进工作区指针**、
  重复生成自动加序号不撞名、合成结果的结构等于布局来源而配色等于视觉来源、来源不存在时如实拒绝
- 比较板上的卡是投影不是图片：e2e 断言每张卡里能查到 `[data-node-id]`，
  并且"采纳才换画布"（生成后画布仍是 8 个节点，切到左右分栏那条才变 11 个）
- 打真库的用例共用一个 Postgres，整套并行时一条往返会排在别人的连接后面，
  所以 `vitest.config.ts` 把 `testTimeout` 提到 30s（默认 5s 会把这种排队误报成超时失败）
- 发布的不变量（§56/§57）：`publish.integration.test.ts` 打真实 Postgres 断言——公开 URL 锁的是
  发布那一刻的快照（改完工作区再解析仍是旧内容）、重新发布就地换版本不多出一行、
  private 的 URL 对任何人都不通、取消发布立刻解析不到而历史快照留着、门禁挡住时既不写发布记录也不留快照；
  e2e 用第二个标签页验证"访客看到的"和"作者改的"是两回事，并断言面板把"未运行的门禁"列出来
- 设计系统的不变量（§12/§13）：e2e 断言"改一个 token，绑定它的节点全线跟随"（取计算样式而不是看 DOM 属性）、
  改 token 与改节点一样在撤销栈里（Ctrl+Z 后按钮回到原色）、引用计数按花括号绑定统计
  （按裸 key 数会满屏"未使用"，而画布明明在用）、内置 token 不可删、自定义 token 只在 0 引用时可删、
  新增的 token 刷新后仍在库里
- 上下文装配的不变量（§66-71）：`code-index.test.ts` 不连库，断言目录**说的是真话**——
  符号种类从 AST 节点判（组件要真的返回 JSX 才算 component）、参数名保留解构形状（`{minutes}` 不是 `_a`）、
  解析失败的文件计入 `unreadableFiles` 而不是报"0 个符号"、CSS 这类不做语法解析的文件 `syntaxErrors` 是 null 不是 0、
  `totals` 永远来自未裁的那一份、同一份文档两次构建字节相同。
  `ai-assemble.integration.test.ts` 守的是**线上传输的边界**：选中某个 code-only 区域时它排第一且理由写着「选中节点」，
  线上那份含符号名 `CouponCountdown` 但**不含区域正文**（`十分钟后可领` / `60_000` / `return <b>`），
  什么都没命中时发空目录并说明"没有任何文件命中"，而不是把整份目录塞过去凑数。
  e2e 断言面板上 Code 分支写「已索引 … 真实 AST」、代码目录那行有真实文件/符号数、
  且"代码正文取不到"这条仍在 `unavailable` 列表里（做完前半截不许顺手划掉后半截的账）
- 提示词真的吃到目录（§68/§69 的另一半）：`npm run contract:export` 除了导出 JSON Schema，
  还会用**同一套装配代码**生成 `contracts/fixtures/ai-request-with-index.json`（构造在 `scripts/ai-request-fixture.ts`，
  id 已固定化，两次导出字节相同）。`apps/web/test/contract-fixture.test.ts` 钉这份文件**没有过期**：
  磁盘上那份必须与当前代码算出来的字节相同，"改了装配忘了重跑导出"会当场红
  （反向验证：往夹具尾部加一个字符，4 条里 3 条立刻失败）。
  Python 侧 `test_prompt.py` 消费这份 fixture，断言 `contextSource` 是 `designIndex`、
  frames / tokens / omissions / totals 与那份真实目录一一对应、代码摘要里的 `path` 进了提示，
  且提示里**没有** tree 分支——§68 把 `context.document` 挡在线上之后，模型能看到的只有目录。
  `document-fallback` 与 `none` 两条回落都必须在 payload 里自报门牌，不许静默降级。
  反向实验：整段换回旧 `build_prompt` 时 9 条里 6 条立刻红；这一轮只把 payload 里那行 digest 拿掉，
  新增的 2 条也当场红——说明测试咬的是新契约而不是夹具自己
- "这一轮的现场"只能由服务端回答（§68 第三笔）：`packages/design-model/test/context-index.test.ts` 里
  `buildSelectionDigest` 那 10 条钉的是三种不漂亮的结果都要如实出去——认不出的 id 进 `missing`（不是静默丢）、
  文档里有但走不到的进 `unreachable` 且 `depth: null`（说"不存在"就是谎报）、超出 12 条的进 `dropped` 而
  `requested` 仍是全部；条目顺序由"当前页优先 + 文档位置"定，客户端把 selection 倒着发结果逐字节相同；
  尺寸/字号给的是模型里的意图值（`fill` / `hug` / `{typography.h1}`），token 引用与目录同一套 `collectTokenRefs`。
  `ai-assemble.integration.test.ts` 钉边界两端：上传 `selectionDigest` / `designSystemDigest` 一律 400
  （用的是一份**形状合法**的假摘要——形状不对的话 zod 先拦，测不到这条边界本身），
  而 wire 上那份 digest 的 `entries[0].name` 必须等于文档里那个节点的名字、谎报的 id 落在 `missing`。
  e2e 那一侧截真实请求体：三个服务端字段一个都不许出现，只有 `selection` 的 id。
  反向实验三次都咬住：`assemble.ts` 去掉两条拒绝 → 那条 400 测试红；`buildSelectionDigest` 去掉排序 →
  顺序相关的 2 条红；把 `missing.push` 改成静默 `continue` → 谎报那条红；`build_prompt` 不再带 digest →
  Python 侧新增的 2 条红
- 作业队列（§162）：`apps/ai-service/tests/test_jobs.py` 钉的是四件事，而不只是"能不能返回 202"：
  ① 同一份请求，作业 `result` 与同步 `/v1/ai/run` 的响应体**逐字段相同**（异步路径漏做任何一步校验都会红）；
  ② 失败要留在作业里 —— 没配 provider 时 `status: failed` + `error.code: provider-unavailable` 且**没有** `result` 字段，
  不许出现"看起来完成了但什么都没带"；③ `progress` 全程为 `null`（没有真进度来源就不给刻度），
  而里程碑（排队 / 领取 / 结束）三条都在；④ 并发上限是真的 —— `capacity=1` 时用一个会卡的 provider
  测出 `max_in_flight == 1`。
  `/healthz.queue` 的 `pending`/`running` 现在带**正向对照**：先证明计数器能到非零，
  才允许用"这里仍是 0"去说"非法请求没进队列"（否则就是一条空断言）。
  Redis 后端要连真服务测（假客户端只会测到我给自己写的假行为）：
  `NEXUS_REDIS_URL=redis://127.0.0.1:6380/0 python -m pytest apps/ai-service/tests/test_jobs.py -q`
  → 9/9 通过（含"换一个 store 仍然读得到"这条内存后端做不到的事）；不设这个变量时那一条**显式 skip**，
  跳过理由打在 pytest 输出里，不是静默通过。
  反向实验两次：计数器改回写死 0 → 非法请求那条红；worker 改成"无论 HTTP 什么都算 completed" → 失败作业那条红
- 发布审核（§131/§132）：`apps/web/test/moderation.integration.test.ts` 16 条，钉的是四条会被含糊掉的边界，
  不是"能不能算出个对象"：① 命中红线时**真的没有** publication 行、但 `moderation_cases` 留了一行
  `decision='blocked'`（挡下也要可追溯）；② `review` 档照发，而 `moderation` 仍是 `pending` —— 机检不许替人认证；
  ③ `rejected` 之后 `resolvePublishedPath` 返回 null（裁决要真能撤下内容），同案不能裁两次；
  ④ 切成 private 时红线文档也发得出去（下架永远可行）且不立案。
  词表那几条带**正向对照**：`Kid-friendly lesson plan for ages 6-10` 必须 clear（证明规则不是"出现 kid 就挡"）、
  图层名里有红线词但访客看不到必须 clear（只有 node.text / node.alt 参与判定）、
  项目里存着上传图但这一版没引用也必须 clear。举报侧钉去重：已有待复核案时同类举报不再开第二条
  （否则队列会被同一件事灌满）。
  e2e 那一条（`@smoke 发布机检与公开页举报`）在真浏览器里走完"发布 → 面板显示机检结论与 limits →
  访客在公开页举报并看到'不会立刻撤下内容' → 改成红线文案再发布 → 面板说清被挡下并列出命中证据"，
  截图在 `screenshots/publish-scan-*.png` 与 `published-report.png`
- 审计与角色（§80 授权 / §84 审计 / §131 提权收口）：`apps/web/test/audit.integration.test.ts` 8 条 +
  `publish.integration.test.ts` 里那条取消发布的留痕断言。测的不是"能不能写进表"，是三条纪律有没有被守住：
  ① **写失败不改变请求结果**——故意用一个不存在的 actorId 触发外键失败，`recordAudit` 必须返回 `false`
  而不是把这次请求带崩（反向验证：把 catch 去掉立刻红）；
  ② **不记隐私**——失败的登录尝试只记原因码，`detail` 里不许出现邮箱，测试直接断言序列化后的字符串里没有它；
  ③ **没发生的事不记**——没发布过再取消（删行数为 0）不许留审计行。
  取消发布那条钉的是"删行之后证据还在"：`targetId` 指向那条**已经被删掉**的 publication，
  URL 从这一刻起 404，但"谁撤的、撤的是哪一条"必须还能查——这条用例在本轮之前是**确定性红**的
  （不是下面那些并行争用的偶发：它 100% 失败），因为实现里的审计调用被包在 `if (false) { … }` 里，
  是**新接上的 ESLint 规则集**（`no-constant-condition`）把它指出来的，typecheck 看不见。
  角色判定（`domain/roles.ts`）的边界：非 admin 一律拒、不能改自己、未认领 guest 不给提权、
  重复裁决留痕；被拒的每一次也进审计。**没有**"最后一个审核员不能降权"那条规则，
  因为它是够不着的（能改别人的只有审核员，审核员改自己被挡住）——测试与页面文案都不假装它存在。
- 删除项目的审批门（§74）：`apps/web/test/project-delete.integration.test.ts` 16 条打真库。
  钉的第一件事是**审批挡在写入之前**：确认词打错时 `deleted_at` 必须还是 null、项目还在列表里、
  审计里恰好一行 `allowed:false` 且没有 `allowed:true`（反向对照放在同一个用例的下一步：换成逐字的项目名，
  这一次真的删掉了，两行审计各归各）。第二件事是**软删的语义完整**：删完之后
  §165 搜不到、§61 发现与个人主页看不到、创作数据不再数它、§166 sitemap 不再列它、
  公开页 `resolvePublishedPath` 与互动接口认的 `publicRefByPath` 一起返回 null，而 `snapshots` 条数与 `published_projects.id` 一个都没变——
  恢复之后同一批答案全部翻回来，这一句才是"软"这个字的证据。
  收件箱（§164）钉的是第三种口径：通知**行留着**（那是作者的事件历史）、链接收走、
  理由写成"项目已经不存在"，恢复后同一条又点得开，不需要重发。
  两条边界也钉住：别人的项目与不存在的项目是同一个答案（`not_found`，且别人的行一个字没动）、
  没删过的项目不能"恢复"（返回 null，否则界面上会留下一句假的已恢复）。
  四次反向实验：把审批判定短路 → **2 条红**（都红在"返回值应是 approval_required"那一句）；
  把软删改成 `db.delete` → **8 条红**，其中"快照条数不变"从 2 变 0；
  去掉 `publicRefByPath` 里新加的 `deletedAt` 谓词 → 恰好 1 条红（公开页那条，它同时断言删除前后各打一次）；
  把 `notifications.ts` 里 `projectDeleted` 的判定写成常量 `false` → 恰好 1 条红，
  红在"删除之后 link 应为 null"那一句（`unavailable` 那一句排在其后，一个用例只报第一条）。
  e2e `@smoke §74` 测的是只有浏览器能测的那两件事：**绕过界面直接打接口**（无 CSRF 头 403、
  带齐身份但确认词打错 400 `approval_required`、项目仍在列表里），以及**路人这一侧的关门**——
  同一个陌生 context 在删除前点赞收 200、删除后同一个接口收 404、公开页 404、恢复后又回到 200。
  这里踩过一个坑值得记下：`new URL(href).pathname` 会把中文 slug 百分号编码，而库里存的 `path` 是原样，
  于是那条"删除前应该 200"的对照先红了——**测试自己拼 path 才会犯的错**，界面上的按钮发的是服务端给的 `state.path`。
- AI 那条路的审批门（§74 agent 侧）：`apps/web/test/ai-approvals.integration.test.ts` 15 条打真库。
  钉的第一件事是**扣下发生在服务端而不是界面上**：用例直接调 `gateResponse`，断言交出去的那份 `patches` 是空数组、
  完整那一份在 `held` 里，再过 `holdForApproval` 落库——一条 `set` 不被扣（反向对照：四种破坏性 op 各扣各的，
  非破坏性的那条 `delivered === response` 逐对象相同）。第二件事是**读侧不泄露**：卡片里有"几处要决定"和理由，
  而整份 JSON 里既没有 `"ops"` 也没有 `"patches"`，被扣下的那个 nodeId 一个字都不出现。
  第三件事是**第一次决定算数**：`Promise.all` 里同时裁决两次，恰好一个成功、审计里恰好一行 `allowed:true`；
  批准那次交回的 `held` 与挂起时逐字节相同（不是重新生成），放弃之后那一行是 `cancelled` 且 `approved_by/at` 都是 null。
  两条归属边界与一条状态边界：别人的任务 `not_found` 并留下 `allowed:false`，主人的下一次仍然批准得动；
  已经终态的行不能被挂起（`holdForApproval` 返回 false，否则账本上会出现"先成功后等审批"的回溯记录）。
  理由里必须报名字：`removePage` 的 `pageId` 早先是裸 uuid（`describe()` 的取值链漏了这一支），
  现在 `nodeNamer` 对 token / 资产 / 组件 / 页 / 页根各给一个可读标签，用例按标签断言。
  跨语言那一半由机器对齐：`test_run.py::test_destructive_op_set_matches_the_web_gate` 读 web 侧源码里的
  `DESTRUCTIVE_OPS` 与 python 那份比集合——**两边靠注释保持一致的地方，注释改了代码不会红**。
  五处行为性反向实验（每次都跑整份 16 条，未变异的对照同样 16 条全绿）：
  把 `holdForApproval` 里 `status='running'` 那个条件去掉 → **1 条红**，红在"终态行不许被回溯成等审批"；
  把裁决语句的 `status='awaiting_approval'` 去掉（只按 id 更新）→ **1 条红**，红在并发那条
  （`Promise.all` 的两次都返回 ok——早退的那个 `if` 挡不住真并发，CAS 才挡得住）；
  把 web 侧扫描从并集里摘掉、只信 provider 自报 → **6 条红**，其中包括真路径那条
  "DEMO 的删除指令被门拦下"——**provider 压根不填 `approvals` 这一栏时，门是整扇开着的**，这条最贵；
  把 `describe()` 取值链里的 `op.pageId` 去掉 → **1 条红**（`removePage` 的理由退回裸 id）；
  把活动流里 provider 写的那句"1 个 op 已落地"留着不改 → **1 条红**，红在新加的那条"不许说已落地"上。
  最后这处是看截图看出来的：同一屏上"画布还没有被改动"与"1 个补丁、1 个 op 已落地"同时存在，
  前者是门说的、后者是 provider 的活动流按"补丁已应用"写的——集成用例与 e2e 各钉一层
  （模型层断言 `delivered.activities`，浏览器层断言 `main` 里那句话出现而"已落地"不出现）。
  e2e `@smoke §74` 补的是只有浏览器能给的三件事：**绕过界面直接打接口**（自己填 `approvalPolicy: []`，
  仍被服务端覆盖成 `['delete']`，响应里补丁为空、`error.code = approval-required`）；
  **刷新之后卡片从账本找回**（画布节点数一个字没变，任务页那一行写的是"等审批"）；
  **批准之后一次 Ctrl+Z 回到 AI 动手之前**——这一步是 §149 与 §74 的接缝，也正是它把
  `invertPatch` 那个"撤销只回来一半节点"的老缺陷暴露出来（`packages/design-model/test/patch-commands.test.ts`
  现在用真实的起始文档钉住"节点、父子关系、兄弟顺序与删之前逐项相同"）。
  两条计时事实记在这里以免被误读成竞态：开发模式下这条路由的首个 POST 实测 8~9 秒（默认 5 秒断言会稳定误报"按钮没反应"），
  整条用例要跑两次生成 + 四次载入 + 三次裁决，预算提到 300 秒——180 秒时报的是 timeout 而不是某句断言。
- 作业队列的 web 侧消费者（§162 第一片）：`apps/web/test/ai-jobs.integration.test.ts` 11 条打真库，
  外加一台**本地假 ai-service**（`node:http`，只负责"照我说的报状态"）。分工要说清楚：
  队列本身能不能跑是 `apps/ai-service/tests/test_jobs.py` 那 9 条的事，这里测的是
  **web 拿到一份状态之后做对了什么**——终态只在真终态时写、`completed` 带着 provider 的 `error` 要记 failed、
  作业查不到才落成 failed 并写明原因、问不到（非 404）时一行都不动、通知靠 `generation:<taskId>` 的幂等键只有一条、
  别人的 jobId 在这里**连去问都没问**（断言假服务的 GET 计数没动——先判归属再取数据，反过来就已经把别人的提示词摘要取回自己进程里了）。
  提交那条还钉了 §68 的边界对异步路径同样成立：假服务收到的报文里 `intent` 与 `context.projectId` 必须在（正向对照），
  而整份 `document` 不许出现——先证明"该带的带了"，"不该带的没带"才不是一条空断言。
  两处坑值得记下，都是测试自己造的：① stub 必须过 `AiJobStatusResponseSchema` 的校验，
  `usage: null` / `patches: [{id}]` 这种"看着差不多"的形状会以"契约违约"的形态红，
  而那条红与"镜像逻辑写错了"长得一模一样，所以 `okResponse()` 是照必填字段写全的；
  ② 假服务的 jobId 计数器不能在 `afterEach` 归零，否则第二个用例起就撞 `provider_job_id` 的唯一索引——
  那条红是真的，但报的是错误的原因。两次反向实验：把"completed 就是成功"改成不看 `error` → 1 条红
  （同一用例下一步的反向对照保证这不是改严就算数）；把"已终态不再写"的守卫换掉 → 1 条红（两次观察之间 `finishedAt` 挪了 32ms）。
  活动翻译那一条钉三种命运：`started/completed` 出 `agent.step`、`info` 出 `agent.activity`
  （`agent.step` 的枚举里没有 info，硬塞就是编出一条不存在的过程）、同一批活动第二次观察一条都不许再发。
  **这一片当时**没测到的：`POST /api/ai/jobs` 在 DEMO MODE 下那句 409 拒绝（要起真服务才打得到），界面上也还没有提交入口——
  **两条都在同日补掉**，见下面 §162 × §74 那一条。
- 异步作业也走同一道审批门（§162 × §74）：`apps/web/test/ai-jobs.integration.test.ts` 从 11 条长到 17 条，
  新增的那 6 条只钉一件事：**provider 交回来的结果，先过门才交回浏览器**。
  这一件事在这之前不存在——异步那一路把整份 `AiResponse` 原样存进 `agent_tasks.result`，
  谁问就给谁，于是"绕过审批"只需要在界面上多勾一个"异步"。所以用例的基准不是"能不能拦住"，
  而是**同步那条路拦住的，异步这条也拦住，而且给的是同一份理由**：
  ① 删掉项目文档里真实存在的那个节点（`victimNode()` 现读文档取第一个非 root 节点，
  不写死名字，否则文档一改测试就在测一个不存在的元素）→ 任务是 `awaiting_approval`、
  reason 里带着那个节点**自己的名字**、`response.patches` 为空、`error.code` 是 `approval-required`、
  库里 `held.patches` 长度 1、`finishedAt` 仍为 null、**通知一条都没有**（挂起不是完成）；
  ② 反向对照换成一个非破坏性 op（`{op:'set', path:'name'}`）→ succeeded、补丁回来了、通知恰好 1 条，
  保证①的红不是"异步路径永远拿不到补丁"；③ 批准后重新观察 → 真 op 交回且 `approvedBy` 是裁决人；
  ④ 拒绝后重新观察 → `jobStatus` 还是队列那份 `completed`，但 `response` 为 null 且 note 说明被放弃
  （队列不知道门的存在，这两份状态不一致是**设计如此**，注释里写明白）；
  ⑤ 同一次挂起轮询两次 → `delivered` 逐字节相同（理由重算会漂移，所以存进去而不是每次现算，见 ADR-0012）；
  ⑥ nodeId 指向不存在的节点 → reason 退回那个 id 本身，绝不是"某个元素"这种含糊话。
  两次行为性变异：把 `settle` 里那道门的判断整个关掉 → 新 6 条 **5 红 1 绿**
  （绿的恰好是②那条非破坏性对照，它本来就该绿——这证明变异抓的是门而不是测试环境）；
  把交回的那一份从 `delivered` 换成 `held` → 2 红（把补丁给了没批准的人）。
  e2e `@smoke §162 异步作业入口` 只测浏览器能测的那两件事：DEMO MODE 下勾选"异步作业"提交，
  界面原样带出服务端那句 409（"异步作业要有一个接上真 provider 的 AI Service…"），
  **没有**假出现一条"在跑的作业"、没有审批卡、画布节点数不变（截图 `ai-async-refused.png`）；
  取消勾选的同一条 prompt 走同步，审批卡照旧出现且写着"画布还没有被改动"，拒绝后
  `[data-approval-note]` 说"删除也没有发生"。**仍然没有测到**：真 provider 下的异步落地
  （要一台接上 key 的 ai-service + worker，本机 DEMO MODE 到不了那一步），
  以及 Redis 队列的跨实例游标（现在还是进程内内存队列，刷新即查不到，这一点在报文 `backend` 里就带着）。
- 社区与发现（§59/§61）：`apps/web/test/social.integration.test.ts` 9 条，最要紧的是分叉那两条 ——
  作者发布后再往工作区加一段没公开的草稿，Remix 出来的副本必须**不含**那段草稿而含发布那一版的文字，
  且副本归点 Remix 的人、原作品一行未动、`remixes` 记下来源；下架（private）之后的版本分叉不出来。
  评论那条钉的是"命中红线连一行都不入库"与限度随回执给出（`没命中不等于内容合规`）。
  发现列表钉的是排序各自说的那件事（Popular 按浏览+赞、New 按发布时间、Following 只含关注的人、
  Trending 按折了时间衰减的互动分，见上面 §61 那条）、
  private 不出现、以及 `unavailable` 里 AI Picks 带着理由在（Trending 已经从这张单子上摘掉了）。
  e2e `@smoke 社区：公开页能点赞…` 在真浏览器里走完点赞→评论→红线评论被挡→Remix 进副本→
  发现页看到这张卡的真实计数，断言只盯自己那张卡（`[data-discover-card="<path>"]`），
  不假设这台开发库的公开列表是空的
- 收藏与创作者主页（§59/§60）：`apps/web/test/profile.integration.test.ts` 7 条，重心在"不该出现的没出现"——
  未发布与已下架的作品不在主页上、被人工拒绝的不在、世界文档里塞一段只该存在于项目里的文字后
  `JSON.stringify(profile)` 必须不含它（反向实验：把 document 一起 select 出来，这条立刻红）。
  另外钉收藏是开关、下架后收藏仍列出且带 `作者已下架` 原因、简介超长截到 500 且空白等于清空。
  e2e 那段在社区用例里：公开页点收藏 → 首页收藏列表看到它 → 写简介 → `/u/<handle>` 读得到简介与作品 →
  红线简介提示"没保存"且主页内容不变（截图 `profile-saved.png`、`creator-profile.png`）
- 全平台搜索（§165）：`apps/web/test/search.integration.test.ts` 11 条打真库，测的是**可见性**而不是查询语法——
  每条"搜不到"都配一条"换个人就搜得到"的反向断言（搜不到有两种原因：规则挡的 / 数据压根没建成功，
  断言必须分得开）。钉住的：别人的私有项目搜不到而本人搜得到、public 发布版本对匿名访客可见且链到发布路径、
  人工驳回的那条不再出现但作者本人仍在、软删除的项目不在、无 handle / guest / 已注销的账号不进用户组、
  内容六组只搜自己的项目且无会话时全空、`%` 与 `_` 当字面量（转义失效时 `分%达成` 会连 `百分X达成` 一起命中，
  去掉 `likeTerm` 的转义这条立刻红）、每组截断时报 `capped` 而不是谎报总数。
  e2e `@smoke 全平台搜索` 在浏览器里走：命中的链接点得开（结果 → 编辑器）、画布元素名进 designs 组并带页面名、
  一个字符不发查询、同一个关键词换一个没有会话的浏览器上下文就一无所获
- SEO（§166）：规则写在纯函数里，所以两层测试各测一半。`seo.test.ts` 10 条不碰库不读头，逐条钉住
  "爬虫看到什么"：public 才 `index`、unlisted 必 `noindex`；没有 origin 时 canonical / og:url / og:image
  **整条省略**（`JSON.stringify(metadata)` 里不许出现 `/api/public/`）且 `omitted` 说清为什么；
  封面必须"这一版真的画到"（只在清单里挂着的不算、svg 不算）、作者没 handle 时图片地址不成立；
  description 三级回落各钉一条；摘要按字号取句且短于 6 字的按钮文案不进（这条是**整串等值**断言，
  顺序、过滤、拼接任一改动都会红）；JSON-LD 字段白名单（出现 `aggregateRating` / `keywords` 即红）；
  项目名写 `</script><img src=x onerror=alert(1)>` 时正文里不得残留 `<` `>`，U+2028 也要转义。
  `seo.integration.test.ts` 6 条打真库，测的是 sitemap 与 `resolvePublishedPath` **口径一致**：
  public 在列、unlisted 不在（同一条里反向断言这一行 resolve 仍非 null——"不在 sitemap"有两种原因，
  不能拿"数据没建成功"蒙过去）、人工驳回的掉出去且留一条对照组、软删项目掉出去、取消发布掉出去且
  `lastmod` 恰是 `publishedAt`。e2e `@smoke §166` 在真浏览器 + 真 HTTP 里走 head、JSON-LD 可 parse、
  `/robots.txt`、`/sitemap.xml`，再把同一个项目改 unlisted 重新发布：`noindex` 生效、路径从 sitemap 消失，
  而页面本身仍然打开得到、canonical 一字未变（截图 `published-seo-public.png`）。
  反向实验：删封面谓词 / 转义正则缩到 `[&]` / robots 恒 index / 去掉 `visibility='public'` 或
  `ne(moderation,'rejected')`，每次都只红预期的那几条——两条 sitemap 谓词彼此独立生效。
- 创作数据（§168）：这一条的口径全在纯算术里，所以采集与展示分开测。`visit-meter.test.ts` 13 条不碰 DOM：
  可见时长只在页面可见时累加、上报前截到 60 秒（`MAX_SAMPLE_MS < FLUSH_INTERVAL_MS` 也钉住，
  否则攒不满一次采样窗口这件事会悄悄变成"没人来过"）、合并一行时 opens 累加而 completion 取最大值不是平均值、
  归属日按 UTC 切（`2026-09-25T00:30+08:00` 属于 09-24）、visitorKey 形状不对就不上报。
  `analytics.integration.test.ts` 14 条打真库，重心是**每个数都得能追到"真有人做过这件事"**：
  同人同天两次心跳只算 1 位访客（`count(distinct visitor_key)` 是靠这条被证伪才补上的——
  原先每条用例只有一行，distinct 去掉也全绿）；跨天留两行而 `visitorsToday` 归 0；
  visitorKey 非法时**一行都不写**，且同一次里用合法 key 再写一遍做反向对照（"没写进去"有两种原因）；
  匿名后来登录，归属并到登录用户；"来过但一秒没攒到"显示 0 秒而不是"未采集"（这条是修出来的：
  原先 `sum` 为 0 时返 null，等于把真实访客说成没数据）；完成度均值排除 0% 的那位；
  likes / remixes 记在项目上而 followers 记在作者上；别人的项目查不到且不报错；
  软删项目从列表消失但历史计数仍在。e2e `@smoke §168` 是唯一一条**真访客参与**的：
  无登录态的 context 打开公开页 → 心跳真的进库 → 作者那一页才有非零数，
  中间任何一环造假都会露馅（假采集器不发请求，假展示面等不到 `visitors=1`）。
  顺手把两条边界钉成断言：同一个 POST 不带 `x-csrf-token` 是 403、带了是 200（第一次跑就是 403 才发现的，
  于是把 mistake 变成断言而不是删掉）；不存在的公开路径 404 且不给任何一行加数；
  作者切成私有重新发布之后上报 404、已有计数一格不加，页面上这一行改口成「已停」。
  页面上还印着六条口径本身（"这台浏览器 × 这一天"），没有登录态的人整页只有 `data-analytics-denied`、
  一个 `[data-analytics-value]` 都不许出现。未采集的两项在 e2e 里第一次是断言"未采集"文案，
  而不是跳过——跳过等于承认这两列没人看。
- 通知中心（§164）：规则在 `notify-plan.test.ts` 19 条纯单测里，库里那三件事在
  `notifications.integration.test.ts` 14 条里，两层的分界就是"这条断言能不能不起服务测"。
  纯函数这层钉的是会不会说谎：自己对自己做的事返回 null（反向对照是同一种事件只换收件人就必须出声）、
  项目名和评论摘录过 `clip`（标题逐字相等，不是 `toContain`——否则上限算错一位也能绿）、
  `private` 那次发布的链接指向 `/studio/<id>` 而不是必然 404 的 `/n/...`、
  没 handle 的关注不给链接、没来源的那两类原样列在 `UNBACKED_NOTIFICATIONS` 里（Generation complete 已经不在那张单子上：
  §112 那笔落地后它有真写入方，用例同时断言"它不在"与"另两类还在"，少一边都算红）。
  打真库那层的重心是**"没有通知"必须能分得清原因**：`emit` 返回 `created / duplicate / suppressed` 三态，
  所以 dedupe 那条既能证"同一件事反复发生只留一条"，也能证"换个作品就是两条"（否则唯一键写错也全绿）。
  收件箱不互相漏是两个人各自有一份才测得出来；标已读用别人的 id 返回 0 **且对方未读数不变**（只断言前者，
  一个恒返回 0 的实现也能过）；取消发布后通知行还在、只是改口"这一版已经不公开了"，
  这条同时钉住了 `publication_id` 为什么是 `SET NULL` 而不是 CASCADE。手工插一条 `kind='abuse_report'`
  读回 `other`：未知类型不许回落到某个已知类型显示。
  e2e `@smoke §164` 用**两个 context**（同一个 context 的多个 page 共用那份 guest 会话，
  拿它自赞自评只会测出"自己给自己发通知"这条规则没生效）：访客真点赞/评论/关注 → 作者铃铛 1 变 4 →
  逐条标已读只动一条 → 全部标完未读归零而总数仍是 4（标的是"读过"不是删行）。
  两处口径不靠界面文本取证：标已读那句回话会被 `router.refresh()` 收掉，所以从网络响应里读 `marked`；
  访客是没认领过的 guest，关注那条在页面上显示"没有可跳转的页面"而不是给一个 404 链接。
  反向实验挑的是最像对的那个写法：把失效判定从"链接以 `/n/` 开头"改成"这行挂了 publicationId"——
  **两条断言同时红，而且红得各有原因**：下架那条因为 FK 是 `SET NULL`，publicationId 已经变 null，
  按它判定等于把这条规则专门为它存在的那个场景整份关掉（死链又回来了）；
  切成私有的那条发布通知反而被判成"点不开"（它指向 `/studio/`，本来一直打得开）。
  也就是说这个错误实现不是"少测一点"，而是同时犯两个方向相反的错。
- 实时通道（§163）：分三层，每层只测自己那层能测的东西。
  `realtime.test.ts` 12 条纯单测测总线与连接计数——**不碰网络也不碰库**：
  同一频道多个订阅者都收到、跨频道一条不漏、订阅者抛异常不能连累同频道其他人更不能连累发布方
  （实时是加速器不是业务前提）、在回调里退订自己不会漏掉后面的人（先复制再遍历）、
  退订幂等且只摘自己、空频道被清掉不留一堆空 Set、驱动可替换（换 Redis 时生产者不动）。
  连接计数那三条钉的是"到上限就拒、释放后能进、多释放一次不会变负数把人永久挡在门外"——
  `abort` 与 `cancel` 都会走收尾，所以幂等是必需而不是一种洁癖。
  `realtime.integration.test.ts` 10 条打真库 + **记账假驱动**：要验的不是"事件能不能过网络"（那是 e2e 的事），
  而是"该发的时候发了、不该发的时候一条都没有"，所以断言的是 (频道, 事件) 这一对：
  通知只走收件人自己的用户频道（`channel.startsWith('project:')` 为假，因为一条写给 A 的通知
  推到项目频道就会送进 B 的连接）、`duplicate` 与 `suppressed` 一条都不推、
  没有项目的任务不推（没有频道可发就不编一个）、收尾一个不存在的任务 `updated=false` 也不推。
  假驱动在 `beforeEach` 装、不在用例末尾恢复——中途失败时末尾那行不会执行，
  后面的用例就会"莫名其妙什么都没收到"，那种红最难查（本轮真踩过一次，于是把教训写成了 setup 的形状）。
  e2e `@smoke §163` 测的是唯一能测"真的过了网络"的那一层，而且**全程不 reload 作者的页面**：
  访客点赞后铃铛自己从 1 变 2，同时数 `/api/notifications` 的请求条数——只多了一次（实时推一次、客户端查一次），
  再等 4 秒确认它不涨。这条断言存在的全部理由：**轮询也能让未读数变对**，只看数分不出这两件事。
  Studio 那一段跑两次真 AI 请求：Mock 认得的指令推出"完成"，认不得的那条推出"失败：provider-unavailable"，
  两条都从 `[data-generation-progress]` 上读——这一行只由事件流写、不由 HTTP 响应写。
  边界也从线上取：别人的项目频道 404、匿名 401、POST 405。
  顺手修掉一处会污染终态的假象：provider 带 `error` 返回 200 以前记 `succeeded` + "生成完成"，
  现在账本 / 通知 / 实时进度三处都判失败，`@smoke §164` 因此换成一条 Mock 真实现的指令
  （拿一条它不实现的指令去断言"生成完成"，测的正是刚修掉的那个假终态）。
- 头像与项目简介（§60 / §49）：`avatar.integration.test.ts` 9 条打真库 + **真存储目录**（用例独占，跑完删），
  断言里有一半在数磁盘：`objectsOf(userId)` 直接 `readdirSync`，所以"换一张之后旧字节不在了""同一份字节交两次只有一份"
  这两件事不是读接口读出来的，是看文件系统看出来的。元数据剥离用**字节序列**取证（原始字节里有 `GPS:`、
  落盘的字节里没有），不是只看 `removed` 数组自说自话；体积上限那条真造了一个 10MB+ 的合法 PNG 头。
  `project-meta.integration.test.ts` 8 条里最值钱的是最后一条：先确认那句话搜不到（此时列还是 null），
  写进简介之后同一次搜索命中并且把简介当 detail 带出来——§165 那条 `ilike(description)` 从此不再是空转。
  **这一条抓到过一个真问题**：把 `openAvatar` 的"文件名必须对得上库里的行"缩成"有头像就行"，
  当时 8 条全绿——旧对象已经被删了，`getStorage().get` 返回 null 让断言因错误的原因通过。
  补的测试是手工往存储目录写一个库里不引用的孤儿对象再读它（`avatar-deadbeef.png`），
  这才对上那条规则真正防的场景：删旧字节是 best-effort，失败时旧地址也不能再被摸到。
  e2e 用 `setInputFiles({ name, mimeType, buffer })` 交**真字节**（假字节那条必须被拒并且头像仍然是空），
  上传后从 `data-avatar-url` 里读出地址、用 `request.get` 核对 `content-type` / `public immutable` / `nosniff`，
  摘掉之后**同一个地址 404** 而公开主页回到首字母——反向对照是简介那段还在，
  免得 404 分不清是规则挡的还是页面坏了。
- 拉黑与屏蔽（§132）：这一片的断言形状被一条规则决定——**"没有发生"有三个完全不同的原因**
  （被关系挡住 / 被 dedupe 挡住 / 那条规则根本没跑），所以 `blocks.integration.test.ts` 11 条里
  每一条负面断言都配一个"同一种数据、换一种关系"的对照：`relationOf` 恒返回 null 会让"评论被挡、
  通知被抑制、发现页少一张卡"全部同时变绿，只有"换个收件人就必须出声""换个查看者卡片还在"
  这类对照能抓住它。通知那条还特意先把 dedupe 那一层跑出来（同一件事第二次是 `duplicate` 不是
  `suppressed`），再删掉这一类行、断言**增量**而不是绝对总数——前面的用例每次发布都自带一条
  通知，断言绝对数会让红出现在和本次无关的旧行上。
  库内约束单独测：绕过 domain 直接 `insert` 自己拉黑自己、`kind='follow'` 都必须被拒，
  并且配一个"按 domain 的写法插一行是成功的"对照——否则两条 reject 只是因为表根本写不进去。
  e2e `@smoke §132` 用**三个视角**（作者 / 被拉黑的访客 / 匿名旁观者）：旁观者那一侧评论仍然在、
  点赞仍然能发、作者的收件箱仍然收到他那条（第 4 条），这三件事同时成立才说明挡住的是一个人而不是整个功能；
  作者这一侧断言 `[data-comment]` 归零 **且** `[data-hidden-comments]` 写着"另有 1 条"——
  只断言前者，"全站删帖"这个错误实现也算通过。访客要能被打断，前提是他也有 handle，
  而 handle 是首次发布时补的（§56），所以访客必须先发布一件自己的作品，这条路径才真的存在。
  四个反向实验：`canInteract` 恒放行 → 3 红；`hiddenAuthorIds` 恒空 → 5 红；
  `setBlock` 不拆关注 → 7 红；`emit` 不看关系 → 2 红。红数不同是因为这四条规则覆盖面不同，
  不是因为某一条没测到。
- 可玩投影（§50）：规则与渲染分开测，是因为**混在一起就没法测**。
  `packages/game-model/test/{play,sim}.test.ts` 共 20 条纯单测钉住会说谎的那几处：
  同一份计划 + 同一段输入必须得出完全相同的状态（可复现是 Playtest 的前提，而这条断言配了
  "输入不同就必须不同"的反向对照，否则 `step` 什么都不做也能通过）；`step` 不改传入的 state；
  接触伤害按冷却结算而不是每帧（2 秒 = 3 次而不是 126 次）；玩家没有伤害来源时 `damageDealt` 恒为 0
  并且页面上有那句"只能躲、不能打"；任务不可判定时永远 `won` 不了。
  e2e `@smoke §50` 走的是另一件事：**同一份真值的两面**。在面板里填数值 → 新标签打开 `/game/<id>` →
  按住方向键与空格真的打死敌人、捡到物品、看到「通关」，然后把敌人 `health` 从 10 改成 999、刷新试玩页，
  同一套按键就打不死它了——这一条比任何"我们没写第二份数据"的声明都硬。
  三个反向实验：`pick()` 恒返回 `design` → 2 红；任务 `judgeable` 恒真 → 3 红；胜利条件恒真 → 2 红。
- Playtest 报告（§53）：`playtest.test.ts` 9 条测的是**报告会不会说谎**，不是模拟器对不对（那在 sim 那边）。
  每种说法都配一个反方向的用例：能通的时候"0 种通关不等于不可能"这句不能出现，
  判不出条件的时候必须说"不是难度问题"而不是"太难"；到时间上限的那一条 `status` 仍是 `playing`
  且 `outcome` 是 null（不许把"没结束"写成"失败"）。可复现钉两头——同一份设计两次报告 `toEqual`，
  换种子的随机游走**终点坐标必须不同**（否则 `rand` 根本没参与，"定种子可复现"是空话）。
  随机游走这里踩过一个真问题：一开始每帧换一次方向，20 秒下来人还在原地，两个种子的结果一模一样；
  改成每 0.4 秒换向后才有可测的差异。e2e `@smoke §50` 里点一次「跑四种走法」，
  断言 beeline 那行是「通关」、idle 那行是「跑到时间上限」、限度那句「不是穷举」在页面上。
- Trending（§61）：这一条的测试重点是**它不能和累计数同义**。`trending.integration.test.ts` 造三份公开版本：
  2 个赞在今天、4 个赞在五天前、6 个赞在窗口外，断言 trending 的顺序是"今天 > 五天前 > 窗口外"、
  窗口外那条分数**正好是 0**，然后同一份数据下断言 `popular` 给出相反的顺序——
  少了后半个对照，"新加了个热度榜"可以靠把 trending 实现成 `popular` 的别名通过全部断言。
  纯算术那 7 条钉的是会说谎的边界：空桶 0 分（不补底数）、半衰期把三天前折成一半、
  窗口外与未来时间戳都不计（后者不给负权重抬分）、方法句里必须出现真的常数值
  （改窗口或半衰期时这条会红，提醒页面那句话跟着改）。
  还钉一条容易被忽略的：**两次刷新顺序必须一致**，且同分卡片按发布时间倒序——
  否则"榜在动"会被读成热度在变，而实际只是数据库返回行的顺序。
- Agent 任务账本（§112 / §164 的 Generation complete）：`agent-tasks.integration.test.ts` 钉的是
  "会不会有一行假装自己跑完了"——`finishTask` 对一个不存在的 id 必须回 `updated:false`（不然任何一次
  收尾都像成功了）；没跑完的任务 `durationMs` 必须是 null（拿"到现在为止"冒充耗时是另一种谎）；
  失败没给原因时落的是兜底文案而不是空着。归属那条是双向的：别人的项目返回 null，同一次调用里
  自己的项目确实列得出来——只测一半的话，"永远返回 null"的实现也能通过。
  纯规则 5 条（notify-plan）钉的是措辞的可核对性：`real` 与 `demo` 的标题必须不同、
  时长为 null 时标题里不许出现"秒"、摘要为 null 时正文不许凭空长出一句、
  以及"没有来源"那张单子必须精确等于剩下的两类（多挂一条是过期信息，少挂一条是假装覆盖了）。
  e2e 在 §164 那条的**末尾**跑一次真 AI 请求：任务号出现在命令栏、`/tasks/<项目>` 恰好一行、
  收件箱从 4 条变 5 条。放在末尾是有意的——前面那些"共 4 条 / 未读 4 条"测的是访客那三件事，
  插在前面会让每条计数都跟着这次请求改。踩到过的一次真错误：任务号那行一开始写在
  `result?.plans?.length ?` 那个条件里面，Mock 返回没有 plans 时整块都不渲染，
  于是"跑完一次请求"在浏览器里什么都看不到——账本行渲染在结果之外才对。
- 公开可玩钉住那一版（§50 / ADR-0009）：`game-publish.integration.test.ts` 的核心是中间那一步——
  作者改完工作稿**不重新发布**，公开那一份必须一个字节不动。这一步之前所有断言
  （发布后有、版本号往前走、private 之后不可达）在"直接读 games 工作稿"的错误实现下全都成立，
  只有"改了没发布"这一刻才分得清。反向对照配了两处：重新发布之后确实换成新值；
  以及把钉住的文档写坏之后，同一个解析入口换回合法文档仍然出得来关卡
  （否则"永远解析失败"也能通过"坏了"那条断言）。
  e2e 这边记下两个自己踩过的坑，都值得下次直接照做：
  ① **发布是异步的**，第二次点完提交后 `[data-publish-url]` 会立刻可见（面板还留着上一次的地址），
  拿它当"发布完成"的信号会让访客读到旧版本——要等顶栏那枚徽章变成 `已发布 v2` 再去 goto；
  ② 让访客"走过去边打边杀"是靠不上的：玩家 170px/s 掠过 32px 的接触窗口，按键卡在不在窗口里全凭运气。
  改成把敌人写成会追击（`speed 60 / detectionRange 900 / damage 0`）之后，
  同一套空格按键变成确定事件，测试也从 5 分钟缩到 48 秒。
  反向实验：把 `gameDocument` 从"换版本时更新"那一支删掉 → 集成测试正好红在"重新发布才换"那一条。
- 画布批注（§111）：`apps/web/test/annotations.integration.test.ts` 8 条 —— 写入时定位由服务端查文档
  （回来的 `nodeName` / `pageName` 必须来自文档而不是客户端传的）、节点不存在就不写、
  别人的项目既写不进也列不出、节点被删后批注仍在但标明悬空、删除只对自己的项目有效；
  上线那半边钉的是**客户端上传 `annotations` / `annotationsNote` 一律 400**（与 `document` 同一纪律），
  以及 wire 里那份是服务端从库里读+按文档核对的（悬空那条不带，note 里说清少了几条）。
  Python 侧 `test_prompt.py` 两条：批注连同定位进提示、`annotationsNote` 进提示，
  且 SYSTEM_PROMPT 里有"不是要照抄进设计的文案 / 别把没看见当成没有"这两句界。
  e2e 一条走真浏览器：点元素 → 写批注 → 角标出现 → 刷新后角标与列表仍在 →
  面板打开时点画布元素仍能选中（去掉面板的 stopPropagation，这条立刻红）
- 游戏设计系统模型（§54）：`packages/game-model/test/game.test.ts` 39 条，纯函数、不碰数据库。
  11 类实体**照原文逐字核对**（防止"改着改着少了一类"），类清单与中文名表一一对应（没有漏译或多译）；
  模板骨架钉的是**"不编内容"**——11 类各一个空实体，`notes` / `stats` / `refs` / `tags` 一律为空，
  `fleshedOutCount` 为 0，且只改名字不算"填过内容"（§159 对设计内容同样成立）。
  CRUD 全部按**不可变**验：返回新文档、原文档不动，`tags` 是复制进去的（外部数组后续 push 不渗进去）。
  数值拒六种非法输入（`NaN` / `±Infinity` / `'100'` / `true` / `null`）且文档原样返回，
  空键名被拒，`0` 与负数合法（是有限数就该收）。
  引用四类非法情形各自钉住：自引用、端点不存在、同一对重复的同一关系、以及**同对多条不同关系要能并存**
  （所以摘除按引用 id 而不是按"从哪到哪"）。
  删实体那条测的是与 world-model 的关键差别：引用挂在实体自己身上，所以**两头都要清**——
  自己发出的引用随它消失、别人指向它的引用也要摘掉，否则留悬空引用；顺带钉住被摘入边的实体
  `updatedAt` 会更新（把时间戳人为压到 2020 再删，断言它变了）。
  投影与校验的分工也各有一条：`referenceGraph` 把指向已删实体的边自然丢掉，
  而 `validateGame` 同时报 `missing-ref-target`——渲染层不该看到画不出来的东西，校验必须知道它存在。
- 3D 世界（§140）：`packages/world-model/test/scene.test.ts` 12 条测的是投影而不是渲染——
  摆过的坐标原样用、没摆过的按文档顺序排环且两次投影**逐字节相同**（防随机）、第 9 个换圈半径更大、
  同类不同正文长度颜色一样（防"按长度编等级"）、只有一端有位置的连线**不画也不计成画了**、
  外接框包住 fallback 的环、空世界仍是合法场景、`limits` 三条硬话（同心环 / 碰撞 / 占位几何体）都在。
  走近那条也钉了：半径内按距离排序、同距按 id 排（顺序不随调用漂）、阈值是导出的同一个数。
  e2e 在真浏览器里跑 WebGL，并且把 §45→§140 的连续性当成人来验：
  **在世界图上拖一个节点 → 等 `data-graph-pending=false` → 进 3D**，HUD 必须从
  "0 个来自你摆过的坐标"变成"1 个 / 8 个按顺序排"，且那个条目的标签 `data-placed="authored"`。
  图例按类别计数、点标签展开的是那条正文本身；截图 `screenshots/world3d.png` 与 `world3d-focus.png`。
  第一次跑就发现相机朝向反了（进场看见一片空地）—— 是靠看图发现的，测试当时是绿的
- 画布视口裁剪（§147）：`packages/design-model/test/viewport.test.ts` 6 条，每条都对着一种"会让用户误判"的失败——
  小文档不裁（DOM 有没有节点是可观察行为）、过阈值才裁且**根框永远留着**（裁了页面背景就没了）、
  视口外扩一圈余量、视口还没量到时宁可不裁（否则首帧一片空白）、paintOrder 里有幽灵 id 要丢掉而不是抛、
  裁剪不许打乱叠放次序。压测脚本自己核对三件事：图层树行数（文档侧证据）、画布 DOM 数、裁剪徽标在不在，
  对不上就抛错——**某一档首帧量不到时改成记下"没测到 + 原因"并继续**，
  免得一个档超时把前面所有档的数字一起丢掉
- 残缺节点不许白屏（§146 压测撞出来的）：`packages/design-model/test/malformed-node.test.ts` 5 条 ——
  `lintDesign` / `resolveLayout` 遇到缺 `style.cornerRadius` / `layout.padding` 的节点**不抛**
  （读路径崩了用户看到的是整页白屏，而不是"这个节点有问题"），`validateDocument` 按 error 报出节点名；
  `apps/web/test/projects.integration.test.ts` 再加两条：`parseDocument` 挡下这种文档（PUT 就是拿它当门）、
  完整节点照常写得进（门不能顺手把正常文档挡住）。
  压测脚本自己也加了回归性质的自检：写完从服务端读回节点数、再数画布 DOM 里的节点数，
  对不上就抛错。**上一版这张表里的"N 节点"数字就是因为没人做这一步而整批作废过**
- 每个里程碑一次 commit 前至少跑：`npm run lint && npm test && npm run test:e2e:smoke`
- `npm run lint` = `typecheck && eslint .`。typecheck 覆盖 6 个 package + `e2e/` + `tsconfig.tools.json`
  （`scripts/*.mts` 与根配置），所以测试与压测脚本也在类型门禁里；`eslint .` 跑 `eslint.config.mjs` 的
  真规则集（异步误用与类型误用为主），刻意关掉的规则逐条在配置里写了原因。
  **这两道门在 2026-09-24 之前是空的**：`lint` 只是 typecheck 的别名，而 package 的 `test/**` 与
  `scripts/*.mts` 不在任何 tsconfig 的 include 里，等于从来没被检查过。第一次真跑就捞出两处产品级缺陷
  （AI Diff 里"undefined 个节点"、属性面板色标永远显示黑色），后者现在有 @smoke 兜着：
  `e2e/studio.spec.ts` 的「属性面板的色标显示 token 解析后的真色」拿画布真实背景色当基准，
  把 `resolveColor` 的入参换回裸 key 就会红（已反向验过一次）
- **CSS 变量拼错不会报错，只会静默失效**——所以有一道专门扫它的门：`apps/web/test/style-tokens.test.ts`
  扫界面源码里每个 `var(--nexus-*)`，凡 `tokens.css` 没定义即红。它诞生于 §54 游戏图：世界图"选中节点"
  的描边写的是 `var(--nexus-color-accent)`，而设计系统只有 `accent-1` / `accent-2`，于是"选中"这个状态
  在屏幕上等于把描边去掉，用户点了看不出变化、测试还全绿（断言的是文字不是颜色）。同一趟还捞出 4 个页面
  h1 用了不存在的 `--nexus-font-size-20`（字号梯度是 …18/21…，没有 20），那几处 h1 其实一直在按继承字号渲染。
  这类"看起来对、其实属性根本没生效"的 bug，颜色/字号单测很难穷举，源码级扫描一次挡住一整类
- 文档类面板（世界 / 游戏 / 角色）的 @smoke 一律以**刷新后重读**收尾：reload 会把面板清成"库里那份"，
  所以"只活在内存里的编辑"到这里必然红——这条断言自带正向对照，不用另外造。
  §54 那次还做了反向实验：把 `GET /api/projects/[id]/game` 改成永远返回 null，
  用例确实失败在刷新后的第一条断言上（改回即绿）。新加"刷新仍在"类断言时值得照这个套路先证它会红
- 改了 `packages/schemas` 必须重跑 `npm run contract:export`，否则契约漂移测试会红
- 动了 ai-service 再加：`npm run test:ai-service`（Windows 控制台建议前置 `PYTHONUTF8=1`）
- **已知偶发**（2026-09-24 记一次，别把它当成回归）：整套 smoke 并行跑时
  「server snapshot is created and restored」曾在恢复后的属性面板上超时（默认 expect 5s），
  单独重跑 12.8s 通过、同日整套重跑 23/23 通过。判断依据是失败点前后的断言都过了，只有面板渲染那一步慢——
  同一台机器上还跑着别的项目的容器。**处理方式不是把超时调到 20s**：那会把"恢复后现场真的回来了"
  这条不变量糊过去。再出现一次且能稳定复现，就查恢复之后 selection 与面板重绘的先后，而不是先改测试。
  **2026-09-25 又出现一次**（31 条整套跑，1 红 30 绿；单跑 37.4s 通过）：这次红的断言换成恢复后的
  快照列表那一行（`[data-snapshot-item]:has-text("恢复到「…」")`，默认 5s），而它前面的
  "画布回到 8 个节点"已经过了——同一个签名：恢复本身成功、面板慢。仍不改测试也不调超时；
  两次的共同点是"整套并行 + 这台机器同时跑着别的项目的容器"，单独跑都是绿的。
- **已知偶发（第二笔）**：`branches.integration.test.ts` 的「内容没变时反复切换不会堆噪音快照」整套并行时
  失败过一次，单独连跑三次 8/8 通过，同日整套重跑全绿。失败时只有"新增快照条数"那条断言红，
  同一测试里"切到 X 前的现场 == 0"和"切换到 == 2"都过——多出来的那条不是切换标记，而是别处写进来的一条。
  原来的断言只比长度，报错信息是 `expected 5 to be 4`，看不出是谁。已改成按 label 分类断言，
  **没有**改成 `toBeGreaterThanOrEqual` 之类的宽松比较：噪音快照正是这条测试要抓的东西。
  2026-09-24 又出现一次，这次改过的断言立刻给出了名字：多出来的是 `切到「…」前的现场`，
  也就是 `stashCurrent` 写的那一条 —— 它只在"分支头快照缺失或与当前现场不同"时才写。
  断言里现在同时打出切换后各分支的头状态（`main:有头 / design-v2:无头` 这种），
  下次再现就能直接判定是头没写上还是 documentsMatch 判成了不同。**仍未定位，也没复现稳定**（约 8 次跑 1 次）。
- **已知偶发（第三笔）**：2026-09-24 加 §131 那次，两套各出现过一次"整套并行时 1 条失败、单跑与重跑全绿"：
  ① e2e 的「§49 检索：世界条目进索引」在 24 条并行 smoke 里失败一次，单独跑 3.9s 通过，
  随后整套重跑 24/24；② `npm test`（45 文件 / 479 条）同一小时内失败一次，
  但那次输出被截断，**没能记下是哪一条**——随后连跑四次全绿。
  两条都不改断言、不放宽超时：②尤其要说白——"抓不到名字"就是当时的事实，
  下次再遇到必须先把 `FAIL` 那一行留在日志里再动手（`npx vitest run > /tmp/vt.log 2>&1`）。
  怀疑方向与第一笔相同：这台机器同时跑着别的项目的容器，并行时是 CPU 争用而不是逻辑变了。
  **2026-09-25 再现（§166 那次 32 条整套）**：同一套跑两遍，第一遍 3 红 29 绿、第二遍 1 红 31 绿（7.3m vs 14.1m，
  慢的一遍就是争用的一遍）。第一遍的三条红分别是：① snapshot 恢复（第一笔的老签名，第三次）、
  ②「publish pins the released snapshot」与 ③「§166 SEO」都红在**重新发布那一步**
  （`[data-publish-result]` 30s 内没等到"第 2 版"，面板里既没有新版本也没有 `publishError`——
  是请求还没回来，不是被挡住）。两条单独跑都绿（1.8m / 26.4s），第二遍整套也都绿。
  §49 检索那条也在慢的一遍里红、单跑 33.8s 绿（平时 8s）——**同一遍里所有失败都是超时型**。
  仍然不调超时、不改断言；要查的是"整套 + 别的容器"下 dev server 的排队，而不是把 30s 改成 60s。
  **2026-09-25 又抓到一次同一签名（§168 单跑，不是整套）**：把项目切成私有重新发布，
  `[data-publish-result]` 30s 内没等到新版本；失败快照里触发按钮已经写着「已停 v2」——
  也就是说**请求最终回来了、发布真的成功了，只是慢过 30 秒**（`store.publish()` 发布前要先
  `flushSave()` + `save()`，慢的是那一次 PUT，与第三笔里"面板既没新版本也没 publishError"完全一致）。
  这条用例改成等触发按钮并给 60s：断言换到一个"下架之后本来就该消失"的块上没意义，
  而超时数字这一笔是**测出来的**不是猜的，仍然没有动那两条老 publish 用例。
