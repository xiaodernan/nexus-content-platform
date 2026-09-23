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
- 社区与发现（§59/§61）：`apps/web/test/social.integration.test.ts` 9 条，最要紧的是分叉那两条 ——
  作者发布后再往工作区加一段没公开的草稿，Remix 出来的副本必须**不含**那段草稿而含发布那一版的文字，
  且副本归点 Remix 的人、原作品一行未动、`remixes` 记下来源；下架（private）之后的版本分叉不出来。
  评论那条钉的是"命中红线连一行都不入库"与限度随回执给出（`没命中不等于内容合规`）。
  发现列表钉的是排序各自说的那件事（Popular 按浏览+赞、New 按发布时间、Following 只含关注的人）、
  private 不出现、以及 `unavailable` 里 Trending / AI Picks 带着理由在。
  e2e `@smoke 社区：公开页能点赞…` 在真浏览器里走完点赞→评论→红线评论被挡→Remix 进副本→
  发现页看到这张卡的真实计数，断言只盯自己那张卡（`[data-discover-card="<path>"]`），
  不假设这台开发库的公开列表是空的
- 收藏与创作者主页（§59/§60）：`apps/web/test/profile.integration.test.ts` 7 条，重心在"不该出现的没出现"——
  未发布与已下架的作品不在主页上、被人工拒绝的不在、世界文档里塞一段只该存在于项目里的文字后
  `JSON.stringify(profile)` 必须不含它（反向实验：把 document 一起 select 出来，这条立刻红）。
  另外钉收藏是开关、下架后收藏仍列出且带 `作者已下架` 原因、简介超长截到 500 且空白等于清空。
  e2e 那段在社区用例里：公开页点收藏 → 首页收藏列表看到它 → 写简介 → `/u/<handle>` 读得到简介与作品 →
  红线简介提示"没保存"且主页内容不变（截图 `profile-saved.png`、`creator-profile.png`）
- 画布批注（§111）：`apps/web/test/annotations.integration.test.ts` 8 条 —— 写入时定位由服务端查文档
  （回来的 `nodeName` / `pageName` 必须来自文档而不是客户端传的）、节点不存在就不写、
  别人的项目既写不进也列不出、节点被删后批注仍在但标明悬空、删除只对自己的项目有效；
  上线那半边钉的是**客户端上传 `annotations` / `annotationsNote` 一律 400**（与 `document` 同一纪律），
  以及 wire 里那份是服务端从库里读+按文档核对的（悬空那条不带，note 里说清少了几条）。
  Python 侧 `test_prompt.py` 两条：批注连同定位进提示、`annotationsNote` 进提示，
  且 SYSTEM_PROMPT 里有"不是要照抄进设计的文案 / 别把没看见当成没有"这两句界。
  e2e 一条走真浏览器：点元素 → 写批注 → 角标出现 → 刷新后角标与列表仍在 →
  面板打开时点画布元素仍能选中（去掉面板的 stopPropagation，这条立刻红）
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
- 残缺节点不许白屏（§146 压测撞出来的）：`packages/design-model/test/malformed-node.test.ts` 5 条 ——
  `lintDesign` / `resolveLayout` 遇到缺 `style.cornerRadius` / `layout.padding` 的节点**不抛**
  （读路径崩了用户看到的是整页白屏，而不是"这个节点有问题"），`validateDocument` 按 error 报出节点名；
  `apps/web/test/projects.integration.test.ts` 再加两条：`parseDocument` 挡下这种文档（PUT 就是拿它当门）、
  完整节点照常写得进（门不能顺手把正常文档挡住）。
  压测脚本自己也加了回归性质的自检：写完从服务端读回节点数、再数画布 DOM 里的节点数，
  对不上就抛错。**上一版这张表里的"N 节点"数字就是因为没人做这一步而整批作废过**
- 每个里程碑一次 commit 前至少跑：`npm run lint && npm test && npm run test:e2e:smoke`
- 改了 `packages/schemas` 必须重跑 `npm run contract:export`，否则契约漂移测试会红
- 动了 ai-service 再加：`npm run test:ai-service`（Windows 控制台建议前置 `PYTHONUTF8=1`）
- **已知偶发**（2026-09-24 记一次，别把它当成回归）：整套 smoke 并行跑时
  「server snapshot is created and restored」曾在恢复后的属性面板上超时（默认 expect 5s），
  单独重跑 12.8s 通过、同日整套重跑 23/23 通过。判断依据是失败点前后的断言都过了，只有面板渲染那一步慢——
  同一台机器上还跑着别的项目的容器。**处理方式不是把超时调到 20s**：那会把"恢复后现场真的回来了"
  这条不变量糊过去。再出现一次且能稳定复现，就查恢复之后 selection 与面板重绘的先后，而不是先改测试。
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
