# NEXUS 长期开发制作计划（持续执行，不停）

> 一句话原则：每个增量都有可运行的检查（unit test / headless proof / real-browser harness），每个提交只改自己负责的文件并**用 path-scoped commit 提交**（`git commit -- <paths>`，绕过共享 index），ledger 与代码分开记录。ADR 0018 未合并前，绝不碰服务端账号/会话/令牌，绝不出现 `signedIn` 徽章。

## 总览（2026-10-20）

| 阶段 | 内容 | 状态 | 下一可立即执行项 |
|------|------|------|------------------|
| M1 核心 | Design Model / Canvas / 编辑器 | ✅ 完成 | — |
| M2 Agent | `@nexus/agent-runtime`（v0–v14+） | ✅ 完成 | — |
| M3 Assets / M4 World / M5 3D | 多模态、世界引擎、Three 运行时 | ✅ 完成 | — |
| M6 Ops | build arc → deploy arc → dock 部署面 | ✅ 完成（v178） | — |
| **M7 社区** | publish / remix / explore / 账号 / 所有权 / lineage / **profile** | 🟡 进行中 | 见下表 |
| **M9 Ops** | **审计轨迹**（服务端 v271 · 面板 v272 · 契约对齐 v273） | 🟡 **进行中** | 见下表 |
| M8 / M10 | 创作者经济 / 外部 agent | 🟡 客户端模型已落地（并行 lane），服务端未接线 | 订阅购买、举报提交、agent 令牌 |

### M7 账号与所有权（本次会话的主线）

| 步骤 | 内容 | 状态 |
|------|------|------|
| v259 | **账号面板**：会话动词（register / rename / signOut / current）落地，工具栏 👤 挂载 | ✅ |
| v262 | `_lineage` 读取收敛为**一个**受保护 reader，关闭 studio `tsc` 红（14 errors → 0） | ✅ |
| v261 | **场景座位成为控件**：所有写操作跟随屏幕上的世界 | ✅ |
| v263 | **账号即 claim**：publish 带上本机 claim；**claim 的 instant 按客户端单位读**（修了 53,817 年的偏差） | ✅ |
| v264 | **账号面板的 real-browser harness**（关闭 "只有类型检查，没有 DOM 验证" 这条自陈的 bound） | ✅ 14/14 |
| v265 | **byline 真的到达页面**：service-answer → card 的映射搬进纯函数 | ✅ |
| v266 | **所有权链在真实浏览器里跑通**：建号 → publish → 服务记 owner → `/explore` 显示 byline → 登出后 take down 被拒 | ✅ 34/34 |
| v267 | **remix 记录 lineage**：写入半边补齐，保留键进 canonical model，fork 覆盖继承来的 lineage | ✅ |
| v268 | **remix 的 lineage 端到端**：fork 发布 → 服务存 lineage → 公共页链接回来源 | ✅ 41/41 |
| v269 | **访问者的 remix 端到端**：`/?remix=<id>` 挂载即生效，query 用过即丢 | ✅ 45/45 |
| v270 | **profile 页**：listing 可按 owner 收窄，byline 变成**地址** | ✅ 48/48 |

### 下一批（按优先级）

1. ~~**v381 — 举报人自己那栏的行该说"什么时候"提交的**~~ ✅ **已落地**（5209b0f）：行上现在有 filed 日期 ✓（服务端一直带着 ✓，面板丢了 ✓）；关注行同理 ✓。
2. ~~**v382 — 举报人那栏要能翻页**~~ ✅ **已落地**（04684bb）：服务端 filed 读收 `offset` ✓（负值夹到 0 ✓），follows 读同一个形状 ✓；面板的翻页条是剩下的 UI 活 ✓（管线已通 ✓）。
3. ~~**v383 — 订阅的续订**~~ ✅ **已落地**（e35b59e）："只约束还站着的行"用**服务端的时间感知检查**表达 ✓（过期可重报 ✓，差一天仍 standing ✓），不是唯一索引能写的那条规则 ✓（唯一约束已删 ✓，race 已命名 ✓）。
4. ~~**v384 — trail 的 target 要不要带"种类"**~~ ✅ **已落地**（ed20681 + 本轮修复）：audit 表加 `target_type` 闭集列 ✓（account/plan/publication ✓），`record` 改 6 参 ✓，每个调用点显式声明自己的种类 ✓；filed 列表可按 kind 过滤 ✓（`?targetType=` ✓，集外按名字拒 ✓）。
5. ~~**v385 — trail 的筛选下沉到服务端**~~ ✅ **已落地**：`AuditController` 收 `action` 查询参数 ✓、`AuditService.list(limit, action)` 在查询里收窄 ✓（闭集九个动词 ✓，集外按名字拒 ✓，拒绝先于读窗口 ✓）；答案包络加第三数 `total`（全 trail 大小 ✓，筛选藏了什么由服务端说 ✓，v281 的"看得见过滤器藏了什么"因此没有丢 ✓）；`auditLane.ts`/`route.ts` 透传 ✓，`Toolbar.tsx` 按钮改为带筛选重读 ✓，`filterTrailRows` 退役 ✓（一个活儿两处做就会自己跟自己不一致 ✓）；audit-contract-proof 加 §7 考核信封 ✓。
6. ~~**v386 — filed 面板的翻页条 UI**~~ ✅ **已落地**：`filedOffset` 状态 + "‹ Newer / Older ›" 两条 ✓，`refreshFiled(offset)` 带页重读 ✓（撤回后停在原页 ✓）；"Newer" 在第一页禁用 ✓，"Older" 恰在"窗口已含全部"时禁用 ✓（不给"问了也是空窗"的页面 ✓）；窗口文案改成"showing 21–40 of 37" ✓，越过末尾时说"service answered an empty window" ✓（诚实答案 ✓，不是错误 ✓）。
7. ~~**v387 — filed 的 offset 是行不是页**~~ ✅ **已落地**：服务端原来把行偏移直接喂给 `PageRequest.of`（那是页码 ✓）——要第 40 行起的会拿到第 800 行起的 ✓；现在服务端做行→页翻译 ✓（`from / asked` ✓，非整窗落到前面那个页边界 ✓），三个测试钉死 ✓；客户端一字未改 ✓（v386 的翻页条本来就是按行写的 ✓）。
8. ~~**v388 — trail 窗口的翻页**~~ ✅ **已落地**：`/audit?offset=` 按**行**收 ✓（v387 的翻译从第一天就带上 ✓，不等第一个翻页条来发现 ✓）；lane 回映自己所问的窗口 ✓（两个在飞的读不会认错答案 ✓）；翻页条两种诚实结尾 ✓——没筛选时用 `total` 算终点 ✓，有筛选时"窗口没填满就是该 action 的尽头" ✓（服务端从不相答筛选集的大小 ✓）；换筛选重置回第一窗 ✓；页脚两种说法 ✓（没筛选说"showing 21–40 of 137" ✓，有筛选说"N shown of this action · whole holds T" ✓——不给没人数过的集合编位置 ✓）。
9. ~~**v389 — desk 窗口（v326）的翻页**~~ ✅ **已落地**：服务端 `deskOf(owner, limit, offset, reason)` 按行收 offset ✓（行→页翻译从第一天就带 ✓，负值夹到第一窗 ✓）；reason 和 page 一起走 ✓；翻页条两种诚实结尾都来自 tally 门 ✓（没筛选用 total ✓；有筛选用 `byReason[reason]` ✓——tally 按原因统计全表 ✓，筛选集的尽头是数出来的 ✓，不是推断 ✓）；换筛选重置回第一窗 ✓；窗口文案过第一窗后说"showing 21–40 of 37" ✓；越界空窗说"this page is past the end" ✓。
10. ~~**v390 — YOU FOLLOW 的翻页条**~~ ✅ **已落地**：服务端 `followingOf` 按行收 offset ✓（行→页翻译从第一天就带 ✓），线上答案多带 `limit` ✓；翻页条的诚实结尾是一个**数** ✓——全表计数（v380）在每个答案上都带着 ✓，不需要 trail 那种"窗口没填满就是尽头"的推理 ✓；窗口文案过第一窗后说位置 ✓；越界空窗说"this page is past the end" ✓。
11. ~~**v391 — tips 两个列表的翻页**~~ ✅ **已落地**：服务端 `tipsReceived`/`tipsGiven` 均按行收 offset ✓（行→页翻译从第一天就带 ✓，负值夹到第一窗 ✓）；两个方向独立翻页 ✓（收的和给的是两个不同集合 ✓）；线上答案多带 `limit` ✓ 并回映 `offset` ✓（两个在飞的读不会认错答案 ✓）；翻页条的诚实结尾是一个**数** ✓——全表计数（v355）在每个答案上都带着 ✓；窗口文案过第一窗后说"showing 21–40 of 37" ✓；越界空窗说"this page is past the end" ✓（不把一页的空说成"nobody has given this account anything" ✓）。
12. ~~**v392 — 经济面板三个列表的翻页**~~ ✅ **已落地**：服务端 `plansOf`/`subscriptionsOf`/`subscriptionsReceived` 均按行收 offset ✓（行→页翻译从第一天就带 ✓，负值夹到第一窗 ✓）；三个列表独立翻页 ✓（持有的、收到的、提供的是三个不同集合 ✓）；三个答案记录多带 offset ✓（三个在飞的读不会认错答案 ✓）；翻页条的诚实结尾是一个**数** ✓——全表计数（v359/v372）在每个答案上都带着 ✓；窗口文案过第一窗后说位置 ✓；越界空窗说"this page is past the end" ✓。
13. ~~**v393 — 测试覆盖补齐（部分）**~~ ✅ **已落地**：`ai-providers/src/router.ts` 的诚实契约有了话说 ✓——五个任务门 `available:false` 的 provider 按名字拒 ✓（拒绝发生在调用之前 ✓，死的 key 永远不会看起来像一个空答案 ✓），拒绝不记账 ✓，`mode` 徽章注入 live provider 立即变 'live' ✓；另一边 `relationships.ts` 早已被 `worldEngine.test.ts` 覆盖 ✓（计划里的名字是陈旧的 ✓）。
14. ~~**v394 — 修 call-recorder 测试的旧 import 错误**~~ ✅ **已落地**：`call-recorder.test.ts` 从不导出 `Usage` 的模块 import 类型 ✓，导致 `tsc -p tsconfig.test.json` 在 HEAD 上就红 ✓（vitest 不报红 ✓：esbuild 剥类型不检查 ✓，一个没人跑的门比没有门更糟 ✓）；现在 import 指向声明该类型的 `types.js` ✓，包类型检查 exit 0 ✓，测试 66/66 不变 ✓。
15. ~~**v395 — profile 页面 tip bar 的翻页**~~ ✅ **已落地**（401f129）：服务端 /tips 门从 v391 起就按行收 offset ✓，客户端 readTips 一直回映窗口 ✓，缺的只是页面这一头 ✓；现在 TipBarFacts 多带 offset/limit/pageHref ✓，窗口文案过第一窗后说位置 ✓（"showing 101–150 of 150" ✓），越界空窗说 "this page is past the end" ✓（不把一页的空说成"没人给过" ✓）；SSR 页面的翻页条是**链接**而不是按钮 ✓（页面不带会话 ✓，ADR 0018 ✓）——知道 URL 的 route 负责拼 ✓、bar 负责画 ✓，边界上是没有 href 的 span ✓，"Older" 只在下一窗会有东西时才给 ✓（服务端已经数空的页面不给 ✓）；tipOffset 与画廊的 offset 分开 ✓（两个窗口各翻各的 ✓）。
16. ~~**v396 — profile 页面 plan bar 的翻页**~~ ✅ **已落地**（9cf129d）：服务端 /plans 门从 v392 起就按行收 offset ✓、答案回映 limit/offset ✓，缺的只是页面这一头 ✓；现在 PlansAnswer 多带 limit/offset ✓（答案要说出自己是哪个窗口的答案 ✓），PlanBarFacts 多带 offset/limit/pageHref ✓（形状同 v395 ✓），空窗规则改写 ✓（越界空窗说 "this page is past the end" ✓ 且仍带全表计数 ✓——空的是这一页不是这个创作者 ✓）；planOffset 是页面上第三个窗口 ✓（与画廊 offset、tipOffset 各翻各的 ✓）。
17. ~~**v397 — profile 页面 follow bar 的翻页（两个方向）**~~ ✅ **已落地**（e5a07bc）：服务端 followers 门从不翻页改为按行翻页 ✓（形状同 followingOf，v390），答案换成自己的记录 FollowersAnswer ✓（带 limit/offset ✓——写入的答案不是窗口 ✓，读和写是两个不同的问题 ✓）；bar 的两个名单同时翻页 ✓（各自独立参数 followersOffset/followingOffset ✓），窗口文案位置感知 ✓，越界空窗说 "this page is past the end" ✓ 且仍带全表计数 ✓；页面现在有五个独立窗口 ✓。
18. ~~**v398 — Toolbar 各翻页条的更严诚实规则回灌**~~ ✅ **已落地**（20899ce）：v392 的“窗口已含全部”规则在空窗时会给出一个已知为空的下一页 ✓，v395/v396/v397 的“下一窗会有东西”更严 ✓；现在收敛成 pager.ts 的 olderWindowWouldHoldSomething ✓（一句话：列存在于 0..count-1 ✓，不会隐藏可达的行 ✓），Toolbar 九个翻页条全部回灌 ✓（trail 过滤支与 desk 无 tally 时保留短窗口即结尾 ✓——那两处没有所翻集合的计数 ✓）。
19. ~~**v399 — artifact 页评论串的翻页**~~ ✅ **已落地**（3f30b34）：v286 起评论区就是窗口（服务端封顶 100）、v354 起有 visible 计数 ✓，但从未能翻页 ✓——比封顶长的线程只能看到头 ✓；现在 CommentService.commentsOf 按行收 offset ✓（PageRequest.of(from/asked, asked)，负值夹 0 ✓），CommentResult 新建 long total ✓（线程行数、含已删除——pager 按行翻页，visible 不是行数 ✓），CommentDtos 新建 ThreadAnswer ✓（与 CommentAnswer 分开：author 方向不翻页、无全表计数 ✓）；客户端 readComments 转发并回映 ✓，renderCommentsHtml 第五参改为可选 window 对象 ✓（越界空窗独立文案、位置感知的 showing rows A–B of total、路由造链接的 pager ✓）；route 加 commentOffset 参数 ✓。
20. ~~**v400 — artifact 页 like bar 的翻页**~~ ✅ **已落地**（0e811c2）：v350 起 likers 列表就是窗口、计数一直是全表数字 ✓，但从未能翻页 ✓——赞数超过窗口的发布物只能看到最新的那些 ✓；现在 likesOf 按行收 offset ✓（PageRequest.of(from/asked, asked)，负值夹 0 ✓），LikeDtos 新建 LikesAnswer ✓（与 LikeAnswer 分开：写入的答案不是窗口 ✓）；计数即行数 ✓（unlike 直接删行、不像 v399 需要第二个数字 ✓）；客户端 readLikes 转发并回映 ✓，likeBar 窗口行位置感知 ✓、越界空窗独立文案 ✓、路由造链接的 pager ✓；route 加 LIKE_LIMIT=20、likeOffset 参数 ✓。
21. ~~**v401 — 角色 agent 的自己的规则，直接评分**~~ ✅ **已落地**（fed116e，25 用例）：world-engine/characterAgent.ts 从来只被 worldEngine.test.ts 间接跑到 ✓，今天有了自己的直接问话 ✓（fed116e，25 用例）：动作集合要对（rest 无条件可用含 locationless——v162 崩溃点、move 按路程定价、同地者可对话、声明且同在的 NPC 只算一个、地面物品给 take、伤残给 heal、活动目标给 pursue）；决策要自矟（选中项在可用集、替代项≤3 且不含选中项、置信度 [0,1]、低血低能选 rest、一无所有仍得 rest）；执行要落地（rest 回血封顶、move 改地点写事件、对话写双边关系首次 floor 再次 +5、声明关系保名长数、take 移物、不可用动作按名拒绝）；世界告知 agent 要自由方向（知识可加、目标进度夹紧且完成时关闭、别人的目标不动）。
32. **v412+ — 下一批候选**：**其余窗口化列表的翻页**（收藏、agent 会话等尚未有翻页条的列表 ✓）；**M8 创作者经济**（订阅购买、举报提交、agent 令牌——受 ADR 0018 阻塞 ✓）。
31. ~~**v411 — 绘画解析器的自己的规则，直接问话**~~ ✅ **已落地**（83c2d9f，13 用例）：paint.ts 是画布、artifact、缩略图三个渲染器共享的统一端点 ✓，它注释里说明了为什么强制要在这里做（一个格式错误的样式会给三个渲染器三种伤害 ✓），而没有一个用例 ✓；现在防御被直接问话 ✓：四种 paint 各自的形状、缺失的 token 是一个命名的灰（而非透明非崩溃 ✓）、非路径引用解析为空（家族退回 Inter、尺寸退回 16 ✓）、非有限数数回退而不是 NaN 到渲染器、align 只认三个值其余视为 left ✓——一个格式错误的样式不能把画厅页整个带崩 ✓。
30. ~~**v410 — 预览渲染器的自己的规则，直接问话**~~ ✅ **已落地**（42626d1，13 用例）：artifact 页和画厅卡片都经过 renderPreviewHtml 渲染发布的文档 ✓，而写进去的每个值都来自客户端原样存储的 JSON（v294 证明过 ✓）——渲染器注释里点名了十个能结束属性/关闭样式块的字段 ✓，而 artifact 测试只通过页面间接到达它 ✓；现在转义本身被直接问话 ✓：文字 HTML 转义、带引号的 token 值结不了 style 属性（组合后的属性整个转义——以后加字段也不会忘 ✓）、:root 块用 CSS 转义而非 HTML 转义（CSS 不解码实体——“<”以 \3c 逗行、值还是一个字符、块仍然闭合 ✓）、token 名字跟值一起转义 ✓；形状规则也在：舞台尺寸取自布局、椥圈 50% 圆角、旋转随行、文字全简写、图片是诚实占位、不可见节点不画、未知页是空舞台而非崩溃——实例的身体被投影（克隆体被画出来，而不只是实例框；正是这行代码的缺帮曾让 artifact 画一个 div 而画布画两个 ✓）。
29. ~~**v409 — 画厅构建器的自己的规则，直接问话**~~ ✅ **已落地**（50b6c9d，12 用例）：gallery 由 explore 和 profile 两个页共享（为了每行的二次读取只写一次而不是两次后伐离 ✓），而它的两个函数没有一个用例 ✓；现在两个都被直接问话 ✓：firstPageId 对非文档、缺失/非字符串的活动页、无 nodes 、指向不存在节点的陈旧 id 均答 null（陈旧 id 不是页面，对它作画就是对文档说谎 ✓）；buildGalleryItems 每行读一次、顺序保留、读取失败显示其原因（无原因也说 “preview unavailable” 而非无言 ✓）、无可画页面说 “nothing to draw” 且绘图器根本不被调用、空列表什么也不读 ✓。
28. ~~**v408 — 意图读取器的自己的规则，直接问话**~~ ✅ **已落地**（7d184b4，54 用例）：九个纯读取器（comment/like/follow/subscribe/report/tip 及四个 un-动词）决定 Studio 在公共页面把读者链进来之后做什么 ✓，而没有一个有用例 ✓；现在一张表驱动的文件给九个读取器打同样六条规则 ✓：id 只从自己那个命名键读（带或不带前导 “?”、在其他参数中也行 ✓）、空白值即无意图而非空 id（判定要求 trim ✓）、编码 id 解码、重复键取第一个、没有读取器为另一个动词的参数作答 ✓；边缘被诚实针死：判定 trim 但答案不 trim——读取器的工作是说出 URL 命名了什么，而不是修补它 ✓。
27. ~~**v407 — 桌面门的自己的答案，直接问话**~~ ✅ **已落地**（e9aab1e，18 用例）：举报的三个客户端门（owner 的报告列表、tally、acknowledge）从来只被 audit proof 和浏览器 harness 到达 ✓；现在三个门被注入 fetch 直接问话 ✓：readDesk 的 reason 去空后才携带、空白即无筛选、负值夹群 ✓；readTally 缺少计数时是拒绝而非一行零（“没人举报”与“计数读不到”是两件事 ✓）、缺口的分解答空表而非 undefined ✓；acknowledge 的 moved 严格读（真值非布尔不算移动 ✓）、没有 reportId 的答案回到被问的那个 ✓。
26. ~~**v406 — 经济阅读门的自己的答案，直接问话**~~ ✅ **已落地**（297af1f，14 用例）：v399/v400/v404/v405 之后 ✓，经济面板三个读者（我托的、托我的、我提供的 ✓）仍然没有直接用例 ✓；现在三个读者被注入 fetch 直接问话 ✓：窗口回映与负值夹群、plans 无 count 时答 UNKNOWN（null ✓，而不是窗口长度——v373 撤除的那个歧谈 ✓，订阅侧回退到行数的不对称两边都针死 ✓）、按周期汇总被过滤（空币种/非有限金额/非对象均丢 ✓）、四种拒绝各自说自己的话 ✓。
25. ~~**v405 — 举报门的自己的答案，直接问话**~~ ✅ **已落地**（fa439f3，21 用例）：v399/v400/v404 给评论、点赞、tips 门补了直接用例 ✓，而举报门（v296 起就在写 ✓）仍然没有 ✓；现在四个函数被直接问话 ✓：readReports 的拒绝永不是空列表（HTTP 状态/无数组/非 JSON/unreachable ✓）、count 回退到行数而非 0 ✓；readFiledReports 回映窗口、计数是全表而行是窗口（v380 的两个真同时为真 ✓）、拒绝仍命名自己被问的窗口 ✓；withdrawReport 读服务“200 两面”的答案——已撤回是事实（withdrawn:false 无 reason ✓）而非错误 ✓；reportOnService 原样携带 claim（缺句即 null ✓）、拒绝带原因且没有 report ✓。
24. ~~**v404 — tips 门的自己的答案，直接问话**~~ ✅ **已落地**（9d78657，18 用例）：v399/v400 给评论和点赞门补了直接用例 ✓，而带金额的那个 M8 社交动作（v298 起就在写 ✓）仍然没有 ✓；现在用注入的 fetch 直接驱动 ✓：readTips 回映窗口、负值夹群、HTTP 拒绝报状态、无 tips 数组即拒绝、非 JSON 即拒绝、不应答即 unreachable ✓；readTipsGiven 从付款人侧问同一门，两个读者真实的差异被针死而非擦平（v313 的 ok:false 读 message、无 count 时数 0 而非回退到行数 ✓）；tipOnService 的 POST 体原样携带 claim（缺古的 handle/assurance/claimedAt 以 null 而非 undefined 逗行 ✓），拒绝带原因且没有 tip——被拒的打冻不是一个没找到人的打冻 ✓。
23. ~~**v403 — studio store 的自己的创作规则，直接驱动**~~ ✅ **已落地**（78e30a5，17 用例）：zustand store 从 v132 起从未有自己的测试文件 ✓，组件/实例著作（ADR 0015）、remix fork（v233）、lineage 回填（v267）从来只被浏览器 harness 到达 ✓（需要 dev server 和真浏览器 ✓）；现在动作被直接驱动 ✓：createComponent 把选中层收进 master 并留下原位置的实例（空选择/锁定/不在当前页均按名拒绝 ✓）；insertInstance 在锚点放新实例（未知 master 拒绝 ✓）；detachInstance 把实例换成具体副本（无 componentId、无 overrides、文字保留 ✓）；setInstanceOverride 只写命中的那个 master 子节、一个 op（width 夹 1、radius 夹 0、空补丁只清已经为空的键 ✓）；remixDocument 给 fork 新 id（发布永不覆盖源头 ✓）并写 _lineage、历史不继承 ✓；instanceView 的记忆化契约被针死（同对象同投影、异对象重算 ✓）。
22. ~~**v402 — 关系算术的自己的规则，直接评分**~~ ✅ **已落地**（61e326a，20 用例）：v162 把关系算术写成纯函数、引擎的 tick 一直代担着跑到今天 ✓（一个整体世界的测试里逐年被带到 ✓，与 v401 同型的间接覆盖 ✓）；现在算术被直接问话 ✓：四个常数和“只有四个可氾生的类型、按波段排序”的名册被针死 ✓；波段边界是扫描而不是抽点——从 −20 到 120 每一点都不回退 ✓；衰退取它被给的步长和地板、从封顶准确 45 步走到地板然后停住 ✓，且 [0, cap] 里没有任何强度衷进敌人波段——注释里的“衷退永不制造仇恨”从一句话变成一个循环 ✓；增益支付声明的步长、在 100 封顶（从下和从上都是），它唯一的不对称被诚实针死：增益没有地板，因为地板是初次相遇时 agent 写下的 ✓；两半合成起来走——每次都增益的纡子在纯算术上 neutral → friend → ally（第 10 步 friend、第 15 步 ally、第 18 步封顶），每次都衷退的纡子 ally → friend → neutral 并在地板上休息 ✓。

### 我的在途增量（与并行 lane 的 v380 分开记）

- ~~**待补 ADR 0016 台账（被并行 lane 的 v380 占脏，暂不进）**~~ ✅ **已清空**：两条的内容都以**新编号**落地（当时 ADR 被并行 lane 的 amendment 371 占脏 →，按 house rule 不混写 →，于是顺延到空闲号 →；369/370 两个号至今空着 →，号码唯一性由 doc gate 把关 ✓）：
  - service-suite proof 的台账 → **Amendment 376**（`docs/evidence/m7/service-suite-proof.mjs` 的 digest + surefire 总数门禁 ✓，240 tests / 10 classes ✓）。
  - §154 虚假声明的修正 → **Amendment 375**（"Corrects amendment 154" 写法 ✓：探针改的是类型联合、跑错了套件 ✓，已重写成改运行时 push 站点 + 全包套件 ✓，三种变异全中 ✓）。
  - 本轮的 v384-fix（并行 lane 半成品调用方的接收方 + history 回归）→ **Amendment 377**。
- **下一个可验证增量：浏览器 harness 端到端复测**。已确认 world / scene3d / assets / publish / account 全部支持 `--out`，默认写 `.scratch/vNNN`，**不脏提交证据**；golden-path 默认写 `docs/evidence/studio/harness`，但可用 `--out .scratch/golden` 覆盖。本回合已复跑全部 6 个 harness（dev server 起在 :3401，输出全写 `.scratch/*`，不脏提交证据）：

| harness | 结果 | 说明 |
|---|---|---|
| golden-path | **19/19 PASS** | 无 baseline → 像素对比 SKIP（诚实，按设计） |
| scene3d | **62/62 PASS** | webgl 后端可达、live、honest |
| assets | **46/46 PASS** | 资源面只显元数据，不假装显图（曾因回 2D 后读像素的 race 偶发 0/45000，已改轮询 painted 像素） |
| account | **14/14 PASS** | 注册/登出/重注册全过 |
| world | **34/34 PASS** | warm 复跑通过；首次 cold 超时是 harness 15s 太紧（cold 路由编译），已改 60s，非产品缺陷 |
| publish | **环境跳过（exit 127）** | 需 Docker + Java 服务，本机未装；非代码缺陷 |

world 的保存确认缺口已写入 KNOWN_ISSUES，作为 world 面板的下一个增量（ADR 0016 当前被并行 lane 的 v380 占脏，台账入口待其提交后补）。publish 因环境缺 Docker 无法在本机跑，属已知边界。

### M9 审计轨迹（服务端 → 面板 → 契约）（服务端 → 面板 → 契约）（服务端 → 面板 → 契约）（服务端 → 面板 → 契约）（服务端 → 面板 → 契约）（服务端 → 面板 → 契约）（服务端 → 面板 → 契约）（服务端 → 面板 → 契约）（服务端 → 面板 → 契约）（服务端 → 面板 → 契约）（服务端 → 面板 → 契约）（服务端 → 面板 → 契约）

| 步骤 | 内容 | 状态 |
|------|------|------|
| v271 | **审计轨迹（服务端）**：`GET /audit`，记发生过的事，不记尝试过的事 | ✅ 52/52 |
| v272 | **审计轨迹的 Studio 面板**（并行 lane）：`trail.ts` 纯函数 → `auditLane.ts` → `/api/audit` → 工具栏面板 | ✅ 887/887 |
| v273 | **客户端 `ops.ts` 放宽**（并行 lane）：`actorId`/`assurance` 可空 + 契约 proof | ✅ 900/900 · proof exit 0 |
| v274 | **创作者经济第一界面**：`economy.ts` 纯映射 → `economyLane.ts` → `/api/economy` → 工具栏面板 | studio **930/930** |
| v275 | **gallery 分页**：`?offset=` → `OffsetPageRequest`（并行 lane） | studio **931/931** |
| v276 | **profile 页分页** | studio **932/932** |
| v277 | **body lane 随座位动**（并行 lane） | studio 编译期 seat-binding |
| v278 | **explore 搜索（客户端）** | studio **932/932** |
| v279 | **profile 搜索（客户端）** | studio **932/932** |
| v280 | **artifact 页自己的历史**：`history.ts` 纯函数 → `auditServer.ts` → 页面 HISTORY 段 | studio **951/951** |
| v281 | **审计轨迹的筛选与计数**：`trailSummaryOf` + `filterTrailRows` | studio **957/957** |
| v282 | **E2E 证明 artifact 历史 + 构建隔离** | E2E 75/75 · jar 锁不再阻塞构建 |
| v283 | **点赞（服务端）**：`dev.nexus.api.social` 新包，三条规则 | LikeServiceTest **14/14** |
| v284 | **点赞的界面**：artifact 页 ♥ 计数条 → `/?like=` → Studio 执行 | studio **983/983** · E2E 75/75 |
| v285 | **评论（服务端）**：四张表里的第二张，四条规则 | social 包 **31/31** |
| v286 | **评论的界面**：artifact 页列出 → `/?comment=` → Studio 的 composer | studio **998/998** |
| v287 | **关注（服务端）**：社交图的一条边，四个方向分开的 finder | social 包 **43/43** |
| v288 | **关注的界面**：profile 页的关注者计数条 → `/?follow=` → Studio 关注 | studio **1015/1015**；E2E **98/98** |
| v289 | **社交动词进审计轨迹**：like/unlike/comment/uncomment 写进 trail | studio **1019/1019**；social 包 **48/48** |
| v290 | **服务端搜索（新包 `dev.nexus.api.search`）**：`/search?q=` 真正生效 | search 包 **8/8**；studio **1019/1019**；E2E §14 |
| v291 | **trail 的契约 proof**：读 wire 的形状与 wire 对齐，mutation 被抓 | `verify:trail-contract` exit 0；doc gate 0 |
| v292 | **关注者名单**：profile 列出关注者，每个都是通往其 profile 的链接 | studio **1028/1028**；social 包 **48/48** |
| v293 | **社交动词的契约 proof**（共享 reader） | `verify:social-contract` exit 0；mutation 被抓 |
| v294 | **un-verb 的路由修正**（type checker 抓到 404） | `next typegen` + `tsc` exit 0；E2E §15 |
| v302 | **搜索的相关度排序**：标题命中排在只命中文档的前面；ORDER BY 落在查询里，窗口不带 sort | publish-proof §12 exit 0 · doc gate 0 |
| v303 | **关注关系的另一头**：`follower=` 方向 + 自己的 wire 形状 + 另一个映射（列表显示的是被关注的那一头） | E2E §19 · 147/147 · followBar 25/25 |
| v304 | **owner 的处置台（`dev.nexus.api.moderation` 新包）**：报告第一次有人读；owner 能说"看到了"（status=acknowledged，不是 moderator 的 reviewed/resolved）；**不点名举报人**（claim 不是钥匙，名字收不回来） | moderation 包 **12/12**；studio **1112/1112**；E2E §20 **154/154** |
| v305 | **举报人看自己那份**：服务端补 `reporter=` 方向 + 自己的行形状（**不带身份**：读的人就是举报人）；状态词表挪回 report 自己的模块；面板多出 "YOU FILED" 那一半 | social 包 **99/99**；studio **1119/1119**；E2E §21 **159/159** |
| v306 | **举报人可以撤回自己那份**：服务端的门 v295 就有，Studio 的面板终于有了按钮（撤回不是删除：行留着，status 变 rejected） | studio **1122/1122**；E2E §22 **163/163** |
| v307 | **wire 不再带举报人的名字**：v295 的旧形状（页面从不显示，wire 一直带着）收窄成 `Report(id, targetId, reason, detail, status, createdAt)`；归属改由"举报人自己的门"证明 | social 包 **99/99**；studio **1122/1122**；E2E §16 **165/165** |
| v308 | **订阅的"站着没有"是算出来的**：行里的 active 只说明"没被取消"（过去的事实），到期是"现在"的判断——服务端算 status（active/expired/cancelled），总额只算还站着的 | social 包 **104/104**；studio **1125/1125**；E2E §18 **167/167** |
| v309 | **经济面板把订阅和 plan 列出来**：面板原来一直写着"subscriptions are not built yet"（v274 写的时候是真的，v301 造完就变成假话了）；`/api/economy` 从 503 占位变成真的门 | studio **1126/1126**；E2E §23 **172/172** |
| v310 | **创作者收到的那一半**：服务端 v300 就有的 `subscriptionsReceived` 终于有了门（`?creator=`），面板多出 "Received" 那一段 | social 包 **104/104**；studio **1126/1126**；E2E §24 **175/175** |
| v311 | **trail 记录举报的两个动作**：filing 和 withdrawal 都写进审计轨迹（只有真正成立的举报才写；被拒的重复不算"发生过的事"）；面板学会说 "reported" / "withdrew the report" / "acknowledged the report" | social 包 **108/108**；studio **1130/1130**；E2E §25 **180/180** |
| v312 | **举报按理由计数**：理由是四选一的闭集，owner 能按理由数；计数走 GROUPED 查询（数的是**全部**，不是 desk 那个窗口） | moderation 包 **16/16**；social **112/112**；studio **1133/1133**；E2E §26 **183/183** |
| v313 | **到期的订阅说人话 + 拒绝保留服务端原话**：两扇拒绝分开说（还在 → "already backs"；取消了 → "cancelled this subscription"；到期了 → 带上到期日）；面板说清为什么没有续订按钮；**顺手修掉七个地方丢掉服务端拒绝原文的 bug**（服务端错误体没有 `ok` 字段，旧写法只在该字段为 false 时才读原因） | social **101/101**；studio **1140/1140**；E2E §27 **187/187** |
| v314 | **创作者能下架自己的 plan**：服务端有了 `DELETE /plans/{id}?claimer=`（别人的 plan 是 403）；下架只收走"这个 offer"，**已经做出的承诺不动** | social 包 **106/106**；studio **1144/1144**；E2E §28 **191/191** |
| v315 | **持有者能结束订阅**：服务端的门 v300 就有，Studio 终于有了按钮（结束不是删除：行留着，status 变 cancelled；按钮只出现在还站着的行上） | studio **1147/1147**；E2E §29 **196/196** |
| v311 | **trail 记录举报的两个动作**：filing 和 withdrawal 都写进审计轨迹（在事务里 ✓；被拒的重复举报不算"发生过的事"）；面板学会说 "reported" / "withdrew the report" / "acknowledged the report"；小计也有自己的桶 | social **112/112**；studio **1128/1128**；E2E §25 **200/200** |
| v316 | **YOU FOLLOW：把关注取回去的路**（unfollow 的门 v288 就有 ✓，但产品里没有任何地方指向它 ✗——有门却没人能走到的能力等于没有）；desk 多出第三段，带 Unfollow 按钮 | studio **1131/1131**；E2E §30 **199/199** |
| v317 | **创作者能改自己 plan 的价格**（订阅是快照 ✓：老订阅不动，新订阅按新价）；表单多一个 "Change the price" 按钮 | social **117/117**；studio **1152/1152**；E2E §31 **201/201** |
| v318 | **desk 面板按理由筛选**（计数 v312 已经有了，但看不了：只有"出现过"的理由才有按钮 ✓；筛选用服务端自己的词 ✓，不匹配显示词；小计不筛选 ✓——滤掉的东西永远有一个数字说明它在那儿） | studio **1156/1156**；E2E §32 **207/207** |
| v319 | **trail 的筛选补上举报的三个动作**：report / withdraw-report / acknowledge 服务端从 v311 就在记 ✓，但只有"All"才看得到 ✗；三个新按钮（Reported / Withdrew / Acknowledged）问的是 trail 自己的 action ✓，筛选行改成会换行 ✓ | studio **1158/1158**；E2E §33 **212/212** |
| v320 | **un-like 在产品里有了门**：链路本来就全 ✓（intent / lane / Studio 的门 / 服务端的门），但产品里没有任何地方指向它 ✗——artifact 页的 like 条现在也给出"Take it back" ✓；Studio 的话改成两种情况都真的（"the like on X is gone" ✓）；trail 的筛选多一个 "Like taken back" ✓ | studio **1161/1161**；E2E §34 **219/219** |
| v321 | **un-comment 在产品里有了门**：服务端从 v289 就有这条链 ✓，客户端却什么都没有 ✗（没有 server half / lane / route / intent / 链接）；评论段落现在给每条还在的评论一个 "Take it back" ✓；Studio 的两句话与服务端的两个答案对齐 ✓（"took the comment back" vs "that comment was already gone" ✓） | studio **1167/1167**；E2E §35 **224/224** |
| v322 | **trail 能问出"评论被删了"**：uncomment 服务端从 v289 就在记 ✓、产品从 v321 就能做 ✓，但筛选还问不出来 ✗；按钮问的是 trail 自己的 action ✓ | studio **1168/1168**；E2E §36 **227/227** |
| v323 | **举报者自己那一半也能看见自己写的话**：desk 那边从 v304 就显示举报原话 ✓，举报者自己这边只有理由和状态 ✗；线上的 detail 其实一直在 ✓，只是行把它丢了 | studio **1170/1170**；E2E §37 **229/229** |
| v324 | **desk 的每一行能点进被投诉的那件作品**：标题只是个名字 ✓，而读者要能打开那件作品本身（trail 的 target 从 v272 起就是链接 ✓） | studio **1170/1170**；E2E §38 **232/232** |
| v325 | **举报者自己那一半也能点进那件作品**（owner 那半 v324 已经是链接 ✓，这半还只是 id ✗；那个不对称不是原则，只是两个增量碰巧的先后 ✓） | studio **1170/1170**；E2E §39 **235/235** |
| v326 | **desk 的筛选下沉到服务端**（浏览器里那份删了 ✓：一个活儿两处做，筛选就会开始自己跟自己不一致 ✓）；筛选在查询里做 ✓（窗口是"该理由最近的 N 条" ✓，不是"最近 N 条里属于该理由的" ✗）；不认识的理由按名字拒掉 ✓ | social+moderation **139/139**；studio **1166/1166**；E2E §40 **239/239** |
| v327 | **创作者能看见是谁在支持自己的 plan**：名字本来就在 claim 里 ✓，服务端却扔了 ✗；订阅的行现在记下支持者的名字 ✓（跟 follow 的行从 v328 起记的一样 ✓），线上那两个一直为 null 的字段也填上了 ✓；没有名字的 claim 就没有名字 ✗（显示 id，不编一个） | social+moderation **141/141**；studio **1167/1167**；E2E §41 **242/242** |
| v328 | **订阅"结束"的那一刻被记下来了**：行以前只说"结束了" ✗，不说"什么时候" ✗（过期有 expiresAt ✓，被取消的没有 ✗）；现在有 ended_at ✓（服务端的钟 ✓），线上多一个 endedAt ✓；结束是"取消"的专属 ✓，只是过期的不算 ✓ | social+moderation **143/143**；studio **1169/1169**；E2E §42 **244/244** |
| v329 | **"开始支持"的那一刻也说了**：v328 补了"结束" ✓，但"开始"没有 ✗（线上的 subscribedAt 从 v300 就在 ✓，只是面板没写 ✓）；现在一行里是人、开始、结束三个事实 ✓ | studio **1171/1171**；E2E §43 **246/246** |
| v330 | **订阅的人知道自己在支持谁**：plan 的 id 是个地址 ✗，订阅者自己的列表里"pro · ¥15.00"说不出这是谁的工作 ✓（plan 的行从 v301 起就记着创建者的名字 ✓，订阅没抄 ✓）；现在抄上了 ✓（跟价格一样是快照 ✓） | social+moderation **144/144**；studio **1173/1173**；E2E §44 **248/248** |
| v331 | **收到打赏的人能看见是谁打赏的**：服务端的 tip 从 v298 起就记着打赏者的名字 ✓、线上也一直带着 ✓，可面板一直写"a supporter"（一个类别 ✗）把名字扔了 ✗）；现在写名字 ✓，匿名的那条仍然只写 "Anonymous" ✓（那是打赏者自己的选择） | studio **1176/1176**；E2E §45 **251/251** |
| v332 | **打赏的人自己也能看见给了什么**：打赏是关系 ✓，产品却只有一边 ✓（收下的人能看见 ✓，给的人看不见 ✗——仓库里从 v328 起就有付款方那一侧的 finder ✓，却没有 service 方法、没有门、没有面板 ✗）；现在有 `?payer=` 这一侧 ✓，总额由数据库求和 ✓（服务自己在内存里加的只是窗口的合计 ✗） | social+moderation **146/146**；studio **1176/1176**；E2E §46 **253/253** |
| v333 | **打赏的收据写上"什么时候"**：线上一直带着 createdAt ✓，但收据上只有金额和留言 ✗（没有日期的收据就是没有历史 ✗）；日期用订阅那两头的同一个 helper ✓（同一个服务端的钟、同一种写法 ✓） | studio **1178/1178**；E2E §47 **255/255** |
| v334 | **收到打赏的那一边也写上"什么时候到的"**（v333 补了给出的一边 ✓，收到的一边还没写 ✓）；顺带把 lane 的类型对齐线上 ✓（类型比线上少说一句话，也是一种小谎 ✓），并给这个一直没有任何测试的 lane 补了第一个测试文件 ✓ | studio **1182/1182**；E2E §48 **257/257** |
| v335 | **评论的人能看见自己写了什么，并能收回**：评论也是关系 ✓，产品却只有一边 ✓（作品页列得出评论 ✓，写评论的人自己那边什么都没有 ✗——仓库里从 v285 起就有作者那一侧的 finder ✓，却没有 service 方法、门和产品入口 ✗）；现在有 `?author=` 这一侧 ✓，评论框里多一段 "YOUR COMMENTS HERE" ✓，每条还在的评论带一个 "Take it back" ✓（v321 建的链路终于在产品里有了门 ✓） | social+moderation **148/148**；studio **1182/1182**；E2E §49 **261/261** |
| v336 | **作品页的 like 栏写出了"是谁点的"**：follow 栏从 v328 起就写名字 ✓，like 栏却只有一个数 ✗（线上一直带着 likers 的名字 ✓，页面渲染时扔了 ✗）；现在按 follow 栏的同一副样子列出 ✓。顺带修了两处"证明本身不诚实"的地方 ✓：Studio 的 publish 门只有 5 秒 ✗，编译一慢就把"服务没答"说成"服务不可达" ✗（假话 ✓——v294 的 tip 门早就修过同一个毛病 ✓，publish 门一直没跟上 ✓），现在 45 秒 ✓；harness 的等待预算也按"机器忙"放大 ✓（证明先放弃 ✗，量的是机器 ✗，不是产品 ✓） | studio **1201/1201**；social+moderation **148/148**；E2E §50 **264/264** |
| v337 | **Studio 通往服务的每一扇门都有预算了**：七扇门（评论/like/关注/经济/审核台/plan/tip）原来**根本没有超时** ✗——服务不回就永远等 ✗，服务端渲染的页面（作品页/探索页/主页）就是读者永远等下去 ✗，连一句话都没有 ✗。现在共用一个 15 秒的预算 ✓（`serviceCall.ts` ✓），而且**超时不再说成"服务不可达"** ✗（慢 ≠ 没了 ✗——说没了的人就不再去找了 ✗），改成"服务在 N 秒内没有回答" ✓ | studio **1205/1205**；social+moderation **148/148**；E2E **264/264** |
| v338 | **publish 与 economy 这两条 lane 也有预算了**：v294 给 tip 的 lane 加过预算并讲清了原因 ✓（Studio 的门是 next dev ✓，某条路由的第一次调用要付那次编译 ✓，没预算的 lane 会被慢编译掐死 ✗，还把它说成"要问的东西坏了" ✗）——七条 lane 学了 ✓，**两条没学** ✗（publish ✓ 和 economy ✓，偏偏是最常用的两条 ✓）；现在都带上 45 秒 ✓ 和信号 ✓，而且**超时不再说成"Studio 不可达"** ✗（慢 ≠ 没了 ✗），改成"Studio 在 45 秒内没有回答" ✓ | studio **1207/1207**；social+moderation **148/148**；E2E **264/264** |
| v339 | **作品页的四个来源一起读**：举报 ✓、trail ✓、like ✓、评论 ✓ —— 四个互不相干的事实 ✗ 却是一个一个读 ✗（页面等的是四段之和 ✗，不是最慢的那一段 ✗）；现在一起发出去 ✓（Promise.all ✓），页面最多等一段 ✓。作品本身那一读仍然在前 ✓（404 还是 404 ✓——不存在的作品不该先花四次调用 ✓） | studio **1207/1207**；social+moderation **148/148**；E2E §51 **265/265** |
| v340 | **主页也一起读了**：跟 v339 同一个毛病 ✓，换到第二张服务端渲染的页面上 ✓（主页的四个来源 ✓：这个人给的 plan ✓、他收到的打赏 ✓、关注他的人 ✓、他关注的人 ✓——四个互不相干的事实 ✗ 却一个一个读 ✗，读者等的是四段之和 ✗）；现在一起发出去 ✓ | studio **1207/1207**；social+moderation **148/148**；E2E §52 **266/266** |
| v341 | **主页上的 tip 栏写上“什么时候到的”**：线上从打赏一开始就带着那个时刻 ✓，经济面板从 v333 起就写了 ✓，可主页（读者想了解一个人时落脚的页面 ✓）只写金额和留言 ✗——没有日期的礼物是没有历史的礼物 ✓；现在每一行都写上服务端的时刻 ✓（UTC ✓，跟订阅那两个日期同一种写法 ✓） | studio **1209/1209**；social+moderation **148/148**；E2E §53 **267/267** |
| v342 | **主页上的 plan 栏写上“什么时候开的”**：线上从 plan 出现起就带着那个时刻 ✓，主页上的 tip 栏从 v341 起就写了日期 ✓，可 plan 栏只写 id/价/周期 ✗——没有日期的价目是没有历史的价目 ✓；现在每一行都写上服务端的时刻 ✓（UTC ✓，全站同一种写法 ✓） | studio **1211/1211**；social+moderation **148/148**；E2E §54 **268/268** |
| v343 | **主页上的 follow 栏写上“什么时候关注的”**：线上从关注出现起就带着那个时刻 ✓，主页上的 tip 栏（v341 ✓）与 plan 栏（v342 ✓）都补上了日期 ✓，可 follow 栏还只写名字 ✗——没有日期的关注人是一个没有历史的名字 ✓；而且**两个方向都写** ✓（关注行带着这条边的两头 ✓，所以"关注我的人"和"我关注的人"说的是同一个时刻 ✓） | studio **1213/1213**；social+moderation **148/148**；E2E §55 **269/269** |
| v344 | **创作者自己的经济面板上，plan 也写上“什么时候开的”**：线上从 plan 出现起就带着那个时刻 ✓，主页上的 plan 栏从 v342 起就写了 ✓，可创作者自己那块面板只写 id/价/周期 ✗——没有日期的价目还是没有历史的价目 ✓；现在每一行都写上服务端的时刻 ✓（UTC ✓，全站同一种写法 ✓） | studio **1215/1215**；social+moderation **148/148**；E2E §56 **271/271** |
| v348 | **作品页的 like 栏也写上“什么时候点的”**：v336 补了名字 ✓，可还是没说时间 ✗（线上从 like 出现起就带着那个时刻 ✓，主页那三个栏都写上了 ✓，这一栏还没 ✓）；现在每一行都写上服务端的时刻 ✓（UTC ✓，全站同一种写法 ✓） | studio **1217/1217**；social+moderation **148/148**；E2E §57 **272/272** |
| v349 | **创作者的桌面上，举报也写上“什么时候来的”**：桌面本来把举报说得样样全 ✓（理由 ✓、举报人原话 ✓、状态 ✓、说的是哪件作品 ✓、作品标题 ✓），唯独没有时间 ✗——一堆没有日期的举报是没法分轻重缓急的堆 ✓；现在每一行都写上服务端的时刻 ✓（UTC ✓，全站同一种写法 ✓）。**公开页不写** ✓：作品页上只有件数和理由 ✓，举报人不上公开页 ✓，精确到秒的时间也是薄的身份线索 ✓ | studio **1219/1219**；social+moderation **148/148**；E2E §58 **274/274** |
| v350 | **写了名单的栏要说清"这只是窗口"**：like 栏 ✓、tip 栏 ✓、follow 栏 ✓ 三个栏都把**整数的个数**和**被截断的名单**并排放着 ✗（读者看到"5 个赞"配两个名字 ✗，很自然会以为只有两个人赞过 ✗）；现在名单比个数短的时候，栏里写"showing the 2 newest of 5" ✓（名单真的是按时间倒序取的 ✓，所以"最新的"是实话 ✓），名单就是全部的时候一个字都不多写 ✓ | studio **1221/1221**；social+moderation **148/148**；E2E §59 **275/275** |
| v354 | **评论的数量说的是整条线程，不是眼前这一段**：服务端原来报的是**窗口里**还剩几条没被删 ✓，页面把它摆在名单旁边 ✗（三十四条的线程被说成"2 条可见" ✗——窗口的事实穿成了线程的事实 ✗，跟 v350 那三个栏一个毛病 ✓）；现在服务端让数据库数整条线程 ✓，页面把三个数分开说 ✓：整线程可见几条 ✓、现在是不是只展示了窗口 ✓（"showing the 20 newest" ✓）、展出来的里有几条被作者收回了 ✓ | social+moderation **149/149**；studio **1221/1221**；E2E §60 **276/276** |
| v355 | **打赏的个数说的是整张表，不是眼前这一段**：服务端原来答的是**读到几行** ✗（拿到三十条打赏的人被告知"12 条" ✗，窗口里只有两条时被告知"2 条" ✗），给出的一侧也一样 ✗——而 like 栏和 follow 栏一直用的是数据库的总数 ✓，打赏这边一直没有 ✓。**顺带发现**：v350 给 tip 栏写的"showing the N newest of M" ✗ 原来永远不可能出现 ✓（M 当时就是窗口自己 ✗），这一改才让它活过来 ✓ | social+moderation **151/151**；studio **1221/1221**；E2E §61 **277/277** |
| v359 | **订阅的个数与总额说的是整张表**：服务端原来答的是**读到几行** ✗（持有五个 plan 的人被告知"2" ✗，收到九个支持者的创作者也被告知窗口里那几条 ✗），总额同样是窗口的求和 ✗；现在**两个方向**都让数据库数/求和整张表 ✓，而且只算**还站着的**那些 ✓（stand 的口径是服务端的 ✓，钟也是服务端的 ✓，所以那个时刻跟着查询一起走 ✓）；面板上第一次把数和总额摆出来 ✓ | social+moderation **155/155**；studio **1221/1221**；E2E §62 **279/279** |
| v363 | **经济面板"收到的那一边"也把数和总额说出来了**：v359 ✓ 让服务端把两个方向的数都按整张表算 ✓，可面板只有**持有**那一侧在说话 ✗——创作者最想看的那一半（"谁在支持我" ✓，v310 ✓）只有一行行的名单 ✗，没有数 ✗，也没有总额 ✗；现在那一半也写"3 subscription(s) received · ¥45.00 a period" ✓。顺带删掉了一句**数据撑不住的话** ✓（原来写"a month" ✗——plan 可以按月/按年/一次性 ✓，而订阅的行根本没记周期 ✓） | studio **1221/1221**；social+moderation **155/155**；E2E §63 **281/281** |
| v367 | **订阅说清"它是什么周期"**：订阅的行从 v300 起就把 plan 的**周期**当快照存在价格旁边 ✓，可线上一直不带它 ✗——于是支持者看到"¥15.00" ✗，分不出这是按月还是按年 ✓（plan 自己的行一直写着周期 ✓，但订阅是 plan 的**快照** ✓，快照的周期才是当初约定的那个 ✓）；现在线上带上它 ✓，两边（持有的 ✓、收到的 ✓）都写出来 ✓，而且用的是跟 plan 栏同一套话（"per month" ✓） | social+moderation **155/155**；studio **1223/1223**；E2E §64 **283/283** |
| v368 | **订阅的总额按周期分开说**：v359 ✓ 让服务端把整张表的**站着的**订阅求和 ✓，可那是一个数 ✗——一个月付的和一年付的加在一起不是任何读者用得上的数 ✗（"¥45.00 a period" ✗）；现在数据库**按周期分组求和** ✓（周期是服务端自己那套封闭集 ✓，顺序也是人说话的样子 ✓：once / month / year ✓），面板上写"¥15.00 per month + ¥30.00 per year" ✓（跟 plan 栏同一套话 ✓）；没有站着的订阅时**一个钱数都不说** ✓（不说 0 ✓，也不留一个光秃秃的间隔号 ✓） | social+moderation **157/157**；studio **1225/1225**；E2E §65 **285/285** |
| v369 | **钱要说清它是什么币种**：v368 ✓ 的账本里点出了这个洞 ✓——订阅的总额是按周期分组的 ✓，可**两种币种的钱加在一起不是一个数** ✗（plan 的币种是创建者自己定的 ✓，服务端认 ✓）；现在数据库**按周期和币种一起分组** ✓，线上每个总额都带着自己的币种 ✓，面板上写"¥15.00 per month + $30.00 per year" ✓；没有币种的组**丢掉不说** ✓（一个说不出币种的金额不是金额 ✓） | social+moderation **158/158**；studio **1226/1226**；E2E §66 **287/287** |
| v370 | **经济面板说清"这些行只是一段"**：v359 ✓ 让服务端按整张表计数 ✓、面板也写出了那个数 ✓，可面板上**列出来的行是服务端的窗口** ✗（两个数不是一个尺寸 ✓，账本里写明了 ✓），面板却没说 ✗——读者看到"3 subscription(s)"配两行 ✗，无从知道第三行不在屏上 ✗。like/tip/follow 三个栏在 v350 ✓ 就学过了 ✓，经济面板（创作者自己的钱在这儿 ✓）还没学 ✓；现在两边都写"showing the 2 newest of 3" ✓（名单就是全部时一个字不多写 ✓） | studio **1228/1228**；social+moderation **158/158**；E2E §67 **289/289** |
| v371 | **钱要说清它是"现在的"还是"当初约定的"**：plan 栏上的条款是创作者**今天**在卖的 ✓（v317 ✓ 允许改价改周期 ✓），订阅行上的是当初**约定了**的 ✓（订阅是 plan 的快照 ✓，v300 ✓），两行长得一样却什么都没说 ✗——支持者看到 plan ¥20.00、自己那行 ¥15.00 ✗，分不清哪个是涨价哪个是承诺 ✗；而且同一个周期在**两处写成了两种话** ✗（profile 栏写 "monthly" ✓，创作者自己的面板写 "per month" ✓，是同一个服务端的词 ✓）；现在周期**只有一套话** ✓，每行都写清自己是什么条款 ✓（plan 行写 "current terms" ✓，订阅行写 "as agreed" ✓，总额也写 ✓），**退役的 plan 不写** ✓（它的条款是最后卖的那套 ✓，说成 current 就是错的 ✓） | studio **1233/1233**；social+moderation **158/158**；E2E §68 **293/293** |
| v372 | **主页的 plan 栏说清"一共几个"和"这些只是一段"**：服务端的 plans 门回的是一段窗口（最多 20 个 ✓），可那个字段叫 `count` ✓、值却是**窗口的长度** ✗（是"这次读到了几个" ✓，不是"创作者有几个" ✗），栏上干脆没说 ✗——创作者有 5 个 plan、屏上只有 3 个 ✗，读者看着就像"他就这 3 个" ✗（同页的 tip 栏在 v350 ✓ 就学过了 ✓，plan 栏还没 ✓）；现在数据库按**整张表**计数 ✓，栏上用 tip 栏同一套话写"5 plans · showing the 3 newest of 5" ✓（线上的 count 没带过来时**说不知道** ✓，不拿窗口长度冒充 ✓） | social+moderation **160/160**；studio **1236/1236**；E2E §69 **296/296** |
| v373 | **创作者自己的面板也说清"一共几个"和"这些只是一段"**：v372 ✓ 只教会了主页的 plan 栏 ✓，而创作者自己那屏（就隔一屏 ✓）还是只列三行、不说总数 ✗——创作者自己有 5 个 plan、屏上只有 3 个 ✗，他不知道还有两个 ✓，而访客在主页上却被告知了 ✓（一个服务、两块屏、两套说法 ✗）；现在**一句话两处共用** ✓（`planCountText` ✓ 在 economy.ts ✓，主页的栏和面板用同一套话 ✓："5 plans · showing the 3 newest of 5" ✓），线上的 count 没带过来时**说不知道** ✓（不说 0 ✓——0 说的是"这个人不卖 plan" ✗，那是另一回事 ✗） | studio **1240/1240**；social+moderation **160/160**；E2E §70 **299/299** |
| v374 | **两边用同一对词**：v371 ✓ 给每行加了一句“这是哪一套条款” ✓，可两边的词**没配对** ✗（plan 栏写 "current terms" ✓、订阅栏写 "as agreed" ✓）——“current” 两头都不准 ✗（读者会当成“这个 plan 此刻的条款” ✗，其实那是**创作者**在卖的目录 ✓、而且 plan 随时可能退役 ✓），跟 "as agreed" 也**不成对** ✗（那边说的是一句承诺 ✓）；现在 plan 那边写 **"on offer now"** ✓（在卖的 ✓）、订阅那边还是 **"as agreed"** ✓（答应过的 ✓）——一个说现在、一个说从前 ✓，成对出现 ✓，三块屏（主页的 plan 栏 ✓、创作者的面板 ✓、支持者的面板 ✓）用同一对词 ✓ | studio **1240/1240**；social+moderation **160/160**；E2E §71 **302/302** |
| v375 | **订阅行说清"这个 plan 后来变过没有"**：订阅是 plan 的**快照** ✓（当初约定的价和周期 ✓），可创作者能改价改周期 ✓（v317 ✓）——支持者手里握着的老条款，行上**一个字没说** ✗（看到的是旧价 ✗，却不知道它是旧的 ✗）；现在线上同时带着**plan 现在的价和周期** ✓（一次查询读完 ✓，不是一个行一次查 ✓），plan 没了就**不说** ✓（不编 ✓），订阅的回执也带上 ✓（回执和列表说两样话 ✗ 就是同一个承诺两个答案 ✗）；面板上写"the plan has changed: the price is now ¥25.00" ✓（没变就**一个字不多写** ✓） | social+moderation **162/162**；studio **1244/1244**；E2E §72 **305/305** |
| v376 | **订阅行说清"这个 plan 现在还在不在卖"**：v375 ✓ 把 plan 现在的条款带上线了 ✓，可**退役的 plan 保留它最后那套条款** ✗——行上看着跟"还在卖"一模一样 ✗（读者以为还在卖 ✓，其实早收了 ✓）；现在线上再带一个"还在不在卖"的布尔 ✓，行上写 "the plan is no longer on offer" ✓（写在**行**上 ✓，不是飘在面板上 ✓）；plan 没了**一个字都不说** ✓（那是另一回事 ✓：从来没退役过、是不在了 ✓） | studio **1248/1248**；social+moderation **162/162**；E2E §73 **308/308** |
| v377 | **创作者自己面板上的 plan 行说清"这个 plan 已经退役了"**：退役的 plan **保留它最后那套条款** ✗，行上看着跟"还在卖"一模一样 ✗（有价、有周期、没按钮 ✗，读者会以为还能买 ✗）；主页的 plan 栏从 v301 ✓ 起就写着 "retired" ✓，**自己面板上却一个字没有** ✗（一个 plan 在两块屏上一个死一个活 ✗）；现在两边用**同一套话** ✓（共享的 `planRetiredText` ✓，主页的栏 ✓ 和面板的行 ✓），还在卖的 plan **什么都不说** ✓ | studio **1250/1250**；social+moderation **162/162**；E2E §74 **311/311** |
| v378 | **创作者面板上 desk 的行说清"这些行只是一段"**：面板上方有 tally ✓（那是**整张表**的数 ✓，v309 ✓ v312 ✓），紧接着下面一行却写"3 report(s) · 1 still waiting" ✗（那是**窗口**的数 ✗）——同一块屏上两个"report(s)" ✗，读者分不清哪个是全部 ✗；现在那一行说"showing the 3 newest of 5" ✓（带筛选时拿**那个 reason 的总数**去比 ✓，不是拿全表去比 ✓），tally 继续说整张表 ✓ | studio **1253/1253**；social+moderation **162/162**；E2E §75 **314/314** |
| v379 | **trail 的 tally 说清它数的是"屏上这些行"**：trail 是一段**窗口** ✓（服务端封顶一百 ✓，面板要二十 ✓），可 tally 写的是"4 published · 1 took down" ✗——读起来像**整条 trail** 的数 ✗，其实只是那二十行里的 ✓（面板脚注写着"20 shown · the service caps at 100" ✓，可 tally 在旁边没有限定 ✗，先读 tally 的人看不出来 ✗）；现在 tally 自己带上它数的行数 ✓："of these 20 rows: 4 published · 1 took down" ✓，老检查的**名字**也跟着改成实话 ✓（它原来叫"the whole answer" ✗，从来就不是整条 trail ✗） | studio **1256/1256**；social+moderation **162/162**；E2E §76 **316/316** |
| v380 *(并行 lane 在途：未提交；数字来自该 lane 声明，我未独立复测)* | **举报人自己那栏 + 关注人自己那栏，说清"一共多少"**："YOU FILED" 和 "YOU FOLLOW" 以前只有行、没有数 ✗，而且两边的毛病还不一样 ✗——举报那侧的服务端把**窗口的长度**当总数答上来（`filed.size()`）✗，读起来像总数却不是 ✓（一个报了三十七条的举报人，被告知自己有二十条 ✓；窗口空时面板还会说"你没有举报过" ✗，那是拿窗口说全表 ✓）；关注那侧相反 ✓——服务端**一直**有全表计数（`countByFollowerAccountId` ✓），可浏览器这层把它**扔了** ✗。现在服务端给举报那侧补上全表计数 ✓（`countByReporterAccountId` + `countFiledBy` ✓，线上同时带计数和上限 ✓），两条 lane 把计数带到面板 ✓，面板把它说出口 ✓："N report(s) filed · showing the N newest of M" ✓ / "N follow(s) · ..." ✓，而且"你没有举报过"要**窗口和计数都空**才说 ✓ | studio **1261/1261**；social+moderation **164/164**；E2E §77 **318/318** |
| v381 | **举报人自己那栏的行说"什么时候"提交的**：服务端的 `Report` 从 v295 起就带着 `createdAt` ✓，举报者自己的面板却只写理由和状态 ✗——跟 v341–v344 那批"每个日期都该在页面上"一样 ✓，这里漏了一条 ✓（关注行同理 ✓）；现在行上有 filed 日期 ✓，关注行也带上自己的 createdAt ✓ | studio 受影响文件 **90/90**；`tsc` exit 0（该提交未随附全量数字 ✓，全量基线见 v384-fix 行 ✓） |
| v382 | **举报人那栏要能翻页**：服务端的 filed 读不接受 offset ✓，超过上限的更早那几条翻页够不着 ✗；现在收 `offset` ✓（负值夹到 0 ✓），follows 的读同一个形状 ✓，每条答案都带自己问的窗口 ✓（失败的读也说 ✓）；面板的翻页条随后续增量 ✓ | 同上（ADR 0016 amendment 372 记录了受影响文件 90/90 ✓） |
| v383 | **订阅的续订**："同一个人对同一件作品的重复举报"要变成"只约束还站着的行" ✓，那是依赖时间的规则 ✓，唯一索引写不了 ✓；现在唯一约束删除 ✓、服务端做 UTC 日历月/年的 standing 检查 ✓（过期可重报 ✓、差一天仍 standing ✓、年周期同理 ✓），race 已命名 ✓ | 服务端 **240/240**（含本轮复测 ✓）；报告用例 +8（过期可重报/差一天/年周期/period 记录/双 finder/集外拒绝 ✓） |
| v384 | **trail 的 target 带上了"种类"**：follow/tip 指向账号、subscribe 指向 plan，都不是 publication ✓；audit 表加 `target_type` 闭集列 ✓（account/plan/publication ✓，集外按名字拒 ✓），`record` 改 6 参 ✓、每个调用点显式声明种类 ✓，ReportEntry 也带自己的 kind ✓（filed 列表可按 kind 过滤 ✓）；客户端 `AuditTargetType` + `TrailRow.targetType` ✓，缺 kind 的行丢弃而不是编一个 ✓ | 服务端 **240/240**（10 类 ✓）；studio 受影响 5 文件 **90/90**；`tsc` exit 0；trail/audit/social 三个契约 proof exit 0 |
| v400 | **artifact 页 like bar 的翻页**：v350 起 likers 列表就是窗口、计数一直是全表数字 ✓，但从未能翻页 ✓——赞数超过窗口的发布物只能看到最新的那些 ✓；现在 likesOf 按行收 offset ✓（行→页翻译 ✓），LikesAnswer 与 LikeAnswer 分开 ✓（写入的答案不是窗口 ✓）；计数即行数 ✓（unlike 直接删行、不像 v399 需要第二个数字 ✓）；客户端回映 limit/offset ✓，窗口行位置感知 ✓、越界空窗说 past the end ✓，pager 是路由造的链接 ✓、“下一窗”规则用 v398 的共享助手 ✓ | 服务端 LikeServiceTest **21/21**（+4 ✓）；studio **1372/1372**（71 文件 ✓，+14 ✓）；tsc exit 0；三个 m9 契约 proof exit 0；harness §84 21 个 like 三窗 |
| v411 | **绘画解析器的自己的规则，直接问话**：paint.ts 是画布、artifact、缩略图共享的统一端点 ✓，注释说明了为什么强制在这里做而零用例 ✓；现在防御被直接问话 ✓（13 用例）：四种 paint 各自的形状、缺失 token 是命名的灰而非透明、非路径引用解析为空（家族 16px/Inter ✓）、非有限数数回退而非 NaN、align 只认三值 ✓——一个格式错误的样式不能带崩画厅页 ✓ | apps/studio **1552/1552**（80 文件 ✓，+13 ✓）；tsc --noEmit exit 0 |
| v410 | **预览渲染器的自己的规则，直接问话**：artifact 页与画厅卡片共用的 renderPreviewHtml 写入的每个值都来自客户端原样存储的 JSON ✓（v294 证明过 ✓），而注释里点名的十个可突破字段从来只被页面间接覆盖 ✓；现在转义契约被直接问话 ✓（13 用例）：文字 HTML 转义、带引号的 token 值结不了 style 属性（组合属性整个转义 ✓）、:root 块 CSS 转义（“<”以 \3c 逗行 ✓）、token 名字跟值一起 ✓；形状规则：舞台取自布局、椥圆 50%、旋转随行、不可见不画、未知页空舞台、实例身体被投影 ✓ | apps/studio **1539/1539**（79 文件 ✓，+13 ✓）；tsc --noEmit exit 0 |
| v409 | **画厅构建器的自己的规则，直接问话**：gallery 由 explore 和 profile 共享（为了每行二次读取只写一次 ✓）而两个函数零用例 ✓；现在两个都被直接问话 ✓（12 用例）：firstPageId 对非文档/缺活动页/无 nodes/陈旦1d 均答 null——陈旧 id 不是页面，对它作画就是说谎 ✓；buildGalleryItems 每行读一次、读取失败显示其原因（无原因也说 “preview unavailable” ✓）、无可画页说 “nothing to draw” 且绘图器不被调用、空列表不读 ✓ | apps/studio **1526/1526**（78 文件 ✓，+12 ✓）；tsc --noEmit exit 0 |
| v408 | **意图读取器的自己的规则，直接问话**：九个纯读取器决定 Studio 在公共页面链进来之后做什么 ✓，而没有一个有用例 ✓；现在一张表驱动文件给八个动词的九个读取器打同样六条规则 ✓（54 用例）：只读自己的键、空白即无意图、编码解码、重复取首、动词隔离 ✓；边缘诚实针死：判定 trim 而答案不 trim（读取器说 URL 命名了什么而不修补它 ✓） | apps/studio **1514/1514**（77 文件 ✓，+54 ✓）；tsc --noEmit exit 0 |
| v407 | **桌面门的自己的答案，直接问话**：v399/v400/v404/v405/v406 之后 ✓，审核桌面的三个客户端门（owner 报告列表、tally、acknowledge）仍然没有直接用例 ✓；现在三个门被直接问话 ✓（18 用例）：reason 去空才携带、空白即无筛选、tally 缺计数即拒绝（而非零行——“没人举报”与“计不了”是两件事 ✓）、缺口分解答空表、moved 严格读、答案漏 reportId 时回到被问的那个 ✓ | apps/studio **1460/1460**（76 文件 ✓，+18 ✓）；tsc --noEmit exit 0 |
| v406 | **经济阅读门的自己的答案，直接问话**：v399/v400/v404/v405 之后 ✓，经济面板三个读者仍然没有直接用例 ✓；现在三个读者被直接问话 ✓（14 用例）：三个读者的窗口回映与负值夹群、plans 无 count 时答 UNKNOWN（null ✓，非窗口长度——v373 ✓）、订阅侧回退到行数的不对称两边针死、按周期汇总被过滤而非信任、四种拒绝各自命名 ✓ | apps/studio **1442/1442**（75 文件 ✓，+14 ✓）；tsc --noEmit exit 0 |
| v405 | **举报门的自己的答案，直接问话**：v399/v400/v404 之后 ✓，举报门（v296 起就在写 ✓）仍然没有直接用例 ✓；现在四个函数被注入 fetch 直接问话 ✓（21 用例）：两个读者的拒绝各自说自己的话且窗口被回映、计数是全表而行是窗口（v380 ✓）、withdraw 读得懂“已经撤回”这个事实（而非错误 ✓）、写入原样携带 claim 且拒绝不带 report ✓ | apps/studio **1428/1428**（74 文件 ✓，+21 ✓）；tsc --noEmit exit 0 |
| v404 | **tips 门的自己的答案，直接问话**：v399/v400 给评论和点赞门补了直接用例 ✓，而 tips 门（v298 起就在写的 M8 社交动作 ✓）仍然没有 ✓；现在注入 fetch 直接驱动 ✓（18 用例）：两个读者的窗口回映与负值夹群、四种拒绝各自说自己的话（HTTP 状态/无 tips 数组/非 JSON/unreachable ✓）、两个读者真实的差异被针死（ok:false 读 message、无 count 时数 0 ✓）、写入原样携带 claim（缺古即 null ✓）且拒绝不带 tip ✓ | apps/studio **1407/1407**（73 文件 ✓，+18 ✓）；tsc --noEmit exit 0 |
| v403 | **studio store 的自己的创作规则，直接驱动**：zustand store 从 v132 起从未有自己的测试文件 ✓，组件/实例著作（ADR 0015）、remix fork（v233）、lineage 回填（v267）从来只被浏览器 harness 到达 ✓；现在动作被直接问话 ✓（17 用例）：createComponent 的收集/拒绝、insertInstance 的锚点与未知拒绝、detachInstance 的具体化（无活链接 ✓）、setInstanceOverride 的喷夹与空补丁话术、remixDocument 的新 id + _lineage + 空历史、instanceView 的记忆化契约 ✓ | apps/studio **1389/1389**（72 文件 ✓，+17 ✓）；tsc --noEmit exit 0 |
| v402 | **关系算术的自己的规则，直接问话**：relationships.ts 从 v162 起就只被引擎的 tick 间接跑到 ✓（一个整体世界的测试里逐年被带到 ✓，与 v401 同型 ✓）；现在纯算术被直接问话 ✓（20 用例）：常数与名册针死（四个可氾生类型、按波段排序）、地板就是敌/中边界、封顶坐在 ally 波段里 ✓；波段边界全扫描（−20→120 每点不回退 ✓）；衷退自定义参数、45 步收敛、从不制造敌人 ✓；增益只封顶不地板（地板归初次相遇所有 ✓）；合成走势（增益一路 neutral→friend→ally 第 10/15/18 步、衷退一路 ally→friend→neutral 停在地板 ✓） | world-engine **95/95**（4 文件 ✓，+20 ✓）；tsc -p tsconfig.test.json exit 0 |
| v401 | **角色 agent 的自己的规则，直接问话**：characterAgent.ts 从来只被 worldEngine.test.ts 间接跑到 ✓（一个整体世界的测试里逐年被带到 ✓），今天有了自己的直接问话 ✓（25 用例）：动作集合（rest 无条件可用含 locationless——v162 崩溃点、move 按路程定价、同地者可对话、声明且同在的 NPC 只算一个、地面物品给 take、伤残给 heal、活动目标给 pursue）、决策自矟（选中项在可用集、替代项≤3 且不含选中项、置信度 [0,1]、低血低能选 rest、一无所有仍得 rest）、执行落地（rest 回血封顶、move 改地点写事件、对话写双边关系首次 floor 再次 +5、声明关系保名长数、take 移物、不可用动作按名拒绝）、世界告知 agent（知识可加、目标进度夹紧且完成时关闭、别人的目标不动）；recent-events 断言用包含式（引擎自身也写事件） | world-engine **75/75**（3 文件 ✓，+25 ✓）；tsc -p tsconfig.test.json exit 0 |
| v399 | **artifact 页评论串的翻页**：v286起评论区就是窗口、v354 起有 visible 计数 ✓，但从未能翻页 ✓——比封顶长的线程只能看到头 ✓；现在 commentsOf 按行收 offset ✓（行→页翻译从第一天就带 ✓），CommentResult 新建 long total ✓（线程行数、含已删除——pager 按行翻页，visible 不是行数 ✓），ThreadAnswer 与 CommentAnswer 分开 ✓（author 方向不翻页 ✓）；客户端回映 offset/total ✓，窗口文案位置感知 ✓、越界空窗说 past the end ✓，pager 是路由造的链接 ✓、“下一窗”规则用 v398 的共享助手 ✓ | 服务端 CommentServiceTest **26/26**（+4 ✓）；studio **1358/1358**（70 文件 ✓，+16 ✓）；tsc exit 0；三个 m9 契约 proof exit 0；harness §83 101 条评论三窗 |
| v398 | **Toolbar 各翻页条的更严诚实规则回灌**：v391/v392 给了翻页条两种结尾 ✓，v395/v396/v397 每个新翻页条都换成了更严的那个 ✓，但 Toolbar 里剩下的九个翻页条还在用弱规则 ✓——两者在窗口填满时一致 ✓，只在窗口空着回来而计数说还有行时分道 ✓；现在收敛成 pager.ts 的 olderWindowWouldHoldSomething ✓（列存在于 0..count-1 ✓，不会隐藏可达的行 ✓），九个翻页条全部回灌 ✓ | studio **1342/1342**（69 文件 ✓，+7 ✓）；tsc exit 0；三个 m9 契约 proof exit 0 |
| v397 | **profile 页面 follow bar 的翻页（两个方向）**：v303 给了这个 bar 两个方向 ✓、v390 教会了 following 方向翻页 ✓、v395/v396 给了同页的 tip bar 和 plan bar 翻页条 ✓，只有 followers 这一侧从日它出生起就不能翻页 ✓——被 37 个账号关注的创作者只看得见 20 个 ✓、也告知有 37 个 ✓，另外 17 个跟到底都够着 ✓；现在服务端 followers 门改为按行翻页 ✓（形状同 followingOf ✓），答案换成自己的记录 FollowersAnswer ✓（带 limit/offset ✓——写入的答案不是窗口 ✓），bar 的两个名单同时翻页 ✓（各自独立参数 ✓），窗口文案位置感知 ✓、越界空窗说 "this page is past the end" ✓ 且仍带全表计数 ✓ | studio **1335/1335**（68 文件 ✓，+19 ✓）；tsc exit 0；三个 m9 契约 proof exit 0；FollowServiceTest 19/19（+4 ✓）；harness §82 两个方向各三个窗口 |
| v396 | **profile 页面 plan bar 的翻页**：v372 给了窗口文案 ✓、服务端 /plans 门从 v392 起按行收 offset 并回映 limit/offset ✓、经济面板三个名单早有翻页条 ✓，只有 profile 页面的 plan bar 还是只能看第一窗 ✓——有 25 个计划的创作者看得见 20 个 ✓、也告知有 25 个 ✓，另外 5 个够不着 ✓；现在 PlansAnswer 多带 limit/offset ✓（答案说出自己是哪个窗口的答案 ✓），PlanBarFacts 多带 offset/limit/pageHref ✓（SSR 页面翻页条是链接 ✓，route 拼 URL ✓、bar 画 <a> ✓、边界是无 href 的 span ✓、"Older" 只在下一窗会有东西时才给 ✓），空窗规则改写 ✓（越界空窗说 "this page is past the end" ✓ 且仍带全表计数 ✓）；planOffset 是页面上第三个窗口 ✓ | studio **1316/1316**（67 文件 ✓，+12 ✓）；tsc exit 0；三个 m9 契约 proof exit 0；harness §81 +12 项 |
| v395 | **profile 页面 tip bar 的翻页**：v350 给了窗口文案 ✓、v355 之后每个答案都带全表计数 ✓、v386–v392 教会了其他每一个名单翻页 ✓，只有 profile 页面的 tip bar 还是只要最新的 100 条 ✓——被赏了 150 笔的创作者看得见 100 笔 ✓、也告知有 150 笔 ✓，另外 50 笔够不着 ✓；现在 TipBarFacts 多带 offset/limit/pageHref ✓，窗口文案过第一窗后说位置 ✓（"showing 101–150 of 150" ✓），越界空窗说 "this page is past the end" ✓（不把一页的空说成"没人给过" ✓）；SSR 页面的翻页条是链接而不是按钮 ✓（页面不带会话 ✓）——route 拼 URL ✓、bar 画 <a> ✓、边界是无 href 的 span ✓、"Older" 只在下一窗会有东西时才给 ✓；tipOffset 与画廊 offset 分开 ✓ | studio **1304/1304**（67 文件 ✓，+7 ✓）；tsc exit 0；三个 m9 契约 proof exit 0；harness §80 +12 项 |
| v394 | **修 call-recorder 测试的旧 import 错误**：从不导出 `Usage` 的模块 import 类型 ✓——`tsc -p tsconfig.test.json` 在 HEAD 上就红 ✓（vitest 不报红 ✓：esbuild 剥类型不检查 ✓，一个没人跑的门比没有门更糟 ✓）；现在 import 指向声明类型的 `types.js` ✓，包类型检查 exit 0 ✓，测试 66/66 不变 ✓ | ai-providers `tsc -p tsconfig.test.json` **exit 0**（HEAD 上 exit 2 ✓）；vitest **66/66**（8 文件 ✓）；world-engine typecheck exit 0 |
| v393 | **router 的诚实契约测试**：`ai-providers.test.ts` 覆盖了路由器的 demo 快乐路径 ✓，没人钉住的是它的诚实契约 ✓——五个任务门 `available:false` 的 provider 按名字拒 ✓（拒绝发生在调用之前 ✓，死的 key 不会看起来像空答案 ✓），拒绝不记账 ✓（成本引擎不为没得到的答案收钱 ✓），`mode` 徽章注入 live 立即变 'live' ✓，注入的 provider 真的在服务 ✓（generate/edit 各调一次、usage 落账 ✓）；另一边 `relationships.ts` 早已被 `worldEngine.test.ts` 覆盖 ✓（计划名字陈旧 ✓） | ai-providers **66/66**（8 文件 ✓＋8 ✓）；`tsc -p tsconfig.test.json` 在 HEAD 上就红 ✓（call-recorder.test.ts 的旧 import 错误 ✓，无关本次 ✓，只报告 ✓） |
| v392 | **经济面板三个列表的翻页**：v359/v372 给了经济面板三个列表全表计数 ✓，v386–v391 教会了其他每一个名单翻页 ✓，只有 subscriptions / received / plans 还是只要最新的 N 条 ✓——持有三十七个订阅的读者看得见二十个 ✓、也被告知有三十七个 ✓，另外十七个够不着 ✓；现在服务端三个读均按行收 offset ✓（行→页翻译从第一天就带 ✓），三个列表独立翻页 ✓，三个答案记录多带 offset ✓；翻页条的诚实结尾是一个**数** ✓——全表计数在每个答案上都带着 ✓；窗口文案过第一窗后说"showing 21–40 of 37" ✓；越界空窗说"this page is past the end" ✓（不把一页的空说成"backs no plan" ✓） | 服务端 **267/267**（+5 ✓）；studio **1297/1297**（67 文件 ✓，+4 ✓）；`tsc` exit 0；三个 m9 契约 proof exit 0；harness §79 +15 项 |
| v391 | **tips 两个列表的翻页**：v355 给了两个 tips 列表全表计数 ✓，其他每一个名单都学会了翻页 ✓（filed v386 ✓、trail v388 ✓、desk v389 ✓、following v390 ✓），只有 TIPS 和 GIVEN 还是只要最新的 N 条 ✓——被赏了三十七笔的创作者看得见二十笔 ✓、也被告知有三十七笔 ✓，另外十七笔够不着 ✓；现在服务端 `tipsReceived`/`tipsGiven` 均按行收 offset ✓（行→页翻译从第一天就带 ✓），两个方向独立翻页 ✓，线上答案多带 `limit` ✓ 并回映 `offset` ✓；翻页条的诚实结尾是一个**数** ✓——全表计数在每个答案上都带着 ✓；窗口文案过第一窗后说"showing 21–40 of 37" ✓；越界空窗说"this page is past the end" ✓（不把一页的空说成"没人给过" ✓） | 服务端 **262/262**（+4 ✓）；studio **1293/1293**（67 文件 ✓，+3 ✓）；`tsc` exit 0；social-contract-proof exit 0；harness §78 +11 项 |
| v390 | **YOU FOLLOW 的翻页条**：v380 给了关注列表全表计数 ✓，其他每一个名单都学会了翻页 ✓（filed v386 ✓、trail v388 ✓、desk v389 ✓），只有它还是只要最新的 N 条 ✓——关注了三十七个账号的读者看得见二十个 ✓、也被告知有三十七个 ✓，另外十七个够不着 ✓；现在服务端 `followingOf` 按行收 offset ✓（行→页翻译从第一天就带 ✓），线上答案多带 `limit` ✓；翻页条的诚实结尾是一个**数** ✓——全表计数在每个答案上都带着 ✓，不需要"窗口没填满就是尽头"的推理 ✓；窗口文案过第一窗后说"showing 21–40 of 37" ✓；越界空窗说"this page is past the end" ✓（不把一页的空说成"follows nobody" ✓） | 服务端 **258/258**（10 类 ✓，+3 ✓）；studio **1290/1290**（67 文件 ✓，+2 ✓）；`tsc` exit 0；social-contract-proof exit 0；harness §30 +4 项 |
| v389 | **desk 窗口的翻页**：v326 之后 desk 还是只要最新的 N 条 ✓——投诉超过 cap 的 owner 读不到更早的那几条 ✓；filed（v386）和 trail（v388）都学过了 ✓，desk 是最后一个 ✓；现在服务端 `deskOf` 按行收 offset ✓（行→页翻译从第一天就带 ✓），reason 和 page 一起走 ✓；翻页条两种诚实结尾都来自 tally 门 ✓（没筛选用 total ✓；有筛选用 `byReason[reason]` ✓——tally 按原因数全表 ✓，筛选集的尽头是数出来的 ✓，不是推断 ✓）；换筛选重置回第一窗 ✓；窗口文案过第一窗后说"showing 21–40 of 37" ✓；越界空窗说"this page is past the end" ✓（不把一页的空说成"没人投诉过" ✓） | 服务端 **255/255**（10 类 ✓，+4 ✓）；studio **1288/1288**（67 文件 ✓，+4 ✓）；`tsc` exit 0；三个契约 proof exit 0；harness desk 段 +4 项 |
| v388 | **trail 窗口的翻页**：v385 之后面板还是只要最新的二十条 ✓——trail 是只增不减的表 ✓，想看上个月的条目没有路可问 ✓；现在 `/audit?offset=` 按行收 ✓（行→页翻译从第一天上就带 ✓）；lane 回映所问窗口 ✓；翻页条两种诚实结尾 ✓（无筛选用 total 算终点 ✓；有筛选时窗口没填满就是该 action 的尽头 ✓）；换筛选重置回第一窗 ✓；页脚没筛选说范围 ✓、有筛选只说"N shown of this action · whole holds T" ✓（不编位置 ✓） | 服务端 **251/251**（10 类 ✓，+2 ✓）；studio **1284/1284**（67 文件 ✓，+2 ✓）；`tsc` exit 0；三个 m9 契约 proof exit 0 |
| v387 | **filed 的 offset 是行不是页**：v382 的参数名叫 offset ✓、lane 说"starting at offset" ✓（行 ✓），服务端却把它直接喂给 `PageRequest.of(from, asked)` ✓——那是**页码** ✓，要第 40 行起的会拿到第 800 行起的 ✓；没有测试钉住这个参数 ✓，也没有调用方翻过页 ✓，两种语义就一直没碰上 ✓；现在服务端做行→页翻译 ✓（非整窗落到前面那个页边界 ✓），+3 测试钉死 ✓；客户端一字未改 ✓（v386 的翻页条本来就按行写 ✓） | 服务端 **249/249**（10 类 ✓，+3 ✓）；studio **1282/1282**；`tsc` exit 0 |
| v386 | **filed 面板的翻页条**：v382 把 offset 铺到了管线上 ✓（服务端收 ✓、lane 每个答案带窗口 ✓、route 转发 ✓），面板却没有问旧页的路 ✓——报了三十七条的人看得见二十条 ✓、也被告知有三十七条 ✓，可另外十七条够不着 ✓；现在有页状态 + 翻页条 ✓（"‹ Newer" 第一页禁用 ✓；"Older" 恰在窗口已含全部时禁用 ✓——不给问了只会答空窗的页面 ✓），窗口文案说清是哪几行 ✓（"showing 21–40 of 37" ✓，越界时说服务端答了空窗 ✓） | studio **1282/1282**（67 文件 ✓）；`tsc` exit 0；无服务端改动 ✓（v382 已经把门修好了 ✓） |
| v385 | **trail 的筛选下沉到服务端**：面板的筛选原来只切浏览器已经拿到的那段 ✓（v281），而 trail 是有帽的窗口 ✓——"最新的 20 条里恰好是 takedown 的"和"最新的 20 条 takedown"是两个集合 ✓（desk 在 v326 就学过 ✓）；现在 `/audit?action=` 在查询里收窄 ✓，动词是**闭集九个** ✓、集外按名字拒 ✓（拒绝先于读窗口 ✓）；筛选进了服务端 ✓，浏览器就看不见被排除的行 ✓——服务端于是多答一个 `total`（全 trail 大小 ✓），页脚四数并存 ✓（"N shown · carried M · whole holds T · caps at L" ✓）；`filterTrailRows` 退役 ✓（含其测试 ✓） | 服务端 **246/246**（10 类 ✓，+6 ✓）；studio **1282/1282**（67 文件 ✓）；`tsc` exit 0；audit-contract proof exit 0（新 §7 信封契约 ✓）；trail/social proof exit 0 |
| v384-fix | **修 HEAD 编译断点 + history 回归**：并行 lane 的 v383/v384 落地时接收方缺失 ✓（`getPeriod()`、6 参 `record`、绑不上的 targetType finder ✓），客户端 offset 缺三处 ✓；补齐后**全树测试发现 `history.test.ts` 8 例红** ✓——v280 的 fixture 没有 `targetType` ✓，被 v384 的"缺 kind 即丢弃"规则全部丢掉 ✓；fixture 更新为新线格式 ✓ 并补一条"缺 kind 被丢弃"的用例 ✓（这正是该规则要的 ✓） | 服务端 **240/240**；studio **1286/1286**（67 文件 ✓）；`tsc` exit 0 |
| **v273** | **客户端 `ops.ts` 与线格式对齐**：`actorId`/`assurance` 变可空；`AuditAction` 对未知动词开放；匿名条目单独成桶（`__anonymous__`）；**新增契约 proof**（读 Java record + 用 tsc 编译探针） | ✅ 900/900 · proof exit 0 · 3 处 mutation 分别被 §3/§5 抓住 |

## 本次会话已落地的增量

| 版本 | 内容 | 关键测量 |
|------|------|----------|
| v259 | 账号面板 + 会话缝 | `accountSession.test.ts` 13/13；studio 817/817；`tsc` 0 |
| v262 | `_lineage` 单一 reader | `tsc` 14 errors → 0；`lineage.test.ts` 7/7 |
| v261 | 场景座位成为控件 | `scene3d.test.ts` 125→138；`surface.test.ts` 21→24；`scene-surface-proof` exit 0 |
| v263 | 账号即 claim + instant 单位修复 | 服务端 **43/43**；publish proof 新 §10 exit 0 |
| v264 | 账号面板的 real-browser harness | **14/14** 断言，0 console error |
| v265 | byline 到达页面 | studio **851/851**；explore-proof exit 0（新增 §5） |
| v266 | 所有权链（真实浏览器 + 真服务 + 真库） | publish E2E **34/34** |
| v267 | remix 记录 lineage | studio **857/857**；design-model **51/51**；remix-proof ALL PASSED（新增 §3b） |
| v268 | remix lineage 端到端 | publish E2E **41/41** |
| v269 | 访问者的 remix 端到端 | publish E2E **45/45** |
| v270 | profile 页 | 服务端 **47/47**；studio **870/870**；publish E2E **48/48** |
| v271 | **审计轨迹（服务端）** | 服务端 **52/52**；publish proof 新 §11 exit 0 |
| v272 | **审计轨迹的 Studio 面板**（并行 lane） | studio **887/887（47 文件）**；real-browser §9.5 |
| **v273** | **客户端 ops 模型 ↔ 服务端线格式契约** | studio **900/900（47 文件）**；`tsc` exit 0；**新 proof exit 0**（3 处 mutation 分别被 §3/§5 抓住）；服务端 **52/52** BUILD SUCCESS（未改动服务端） |
| gate | 碰撞普查读**它被递给的那本 ledger** | doc gate exit 0；"numbers GRANTED TWICE: none" |
| build | nexus-api 钉住编译器插件与 release 25 | 服务端 BUILD SUCCESS |
| **test(ai-providers)** | **覆盖此前零测试的确定性 PRNG（prng.ts）** | `packages/ai-providers/test/prng.test.ts` 新增 12 例；`NODE_OPTIONS= npx vitest run --root packages/ai-providers --no-file-parallelism` → **3 文件 32/32 通过**（12 新）；`tsc --noEmit` exit 0；commit `1a64102` 已 push `origin/master` |
| **test(design-model)** | **补齐设计模型测试面（一批增量）** | 连续新增 5 个测试文件，覆盖此前零测试/仅偶然覆盖的模块： |
| ↳ selectors.ts | 首个直接单测（6 导出全覆盖 + 坏引用/缺失节点边界） | `selectors.test.ts` 15 例；design-model → **6 文件 74/74**（15 新）；commit `71a0a97` |
| ↳ history.ts | `History` 撤销/重做栈首个直接单测（dispatch/undo/redo/limit/snapshots） | `history.test.ts` 9 例；→ **7 文件 83/83**（9 新）；commit `e4f6856` |
| ↳ geometry.ts | `containsRotated`/`boundsOfSubtree` 此前零测试；整模块锁定 | `geometry.test.ts` 13 例；→ **8 文件 96/96**（13 新）；commit `3469fd4` |
| ↳ tokens.ts | `flattenTokens`/`parseDimension`/`colorToCss` 此前零测试 | `tokens.test.ts` 13 例；→ **9 文件 109/109**（13 新）；commit `dca2c00` |
| ↳ ops.ts | `invertOp/invertBatch/subtreeIds/getNode` + AI 锁守卫零测试 | `ops.test.ts` 8 例；→ **10 文件 117/117**（8 新）；commit `d37e19b` |
| **下一候选** | **ai-providers/router.ts、world-engine/relationships.ts** | 设计模型测试面已闭合；转入其余包的未测模块 |

### 顺手修掉的"门根本没在跑"

- **`npm run verify:remix` 在 HEAD 是红的**（两个原因）：模块加载器 strip 了 `artifact.ts` 却没 strip 它 import 的
  `pageShell.ts`（未解析的 import，不是断言失败）；§6 断言"整个 model import 都是 `import type`"——**从来就不成立**，
  因为 lane 以**值**调用 `validateDocument`。两条断言现在说的是真话。
- **proof 的加载 ORDER**：`strip` 写完模块**同时就 import 它**，所以模块的兄弟必须先进 box。这条教训已经出现三次
  （remix proof 的 `pageShell`、validate proof 的 `accounts`/`currentAccount`、explore proof 的 `profile`）。
  **一个解析不了 import 的 proof 不是通过的 proof，是停止运行的 proof。**
- **HEAD 本身是坏的**：`accountSession.test.ts` 被提交了，而它 import 的模块没有——全新 clone 既不能 typecheck 也不能
  收集那个套件。v259 补上了模块。

## 已知的诚实边界（§60）

- 服务端**只记录 claim，不验证 claim**：`unsigned-local` 是它唯一接受的 assurance，它**不检查账号是否存在**，
  任何能调用 API 的人都可以伪造一份 claim（ADR 0018）。
- claim 是**所有者，不是身份**：它决定"谁能下架这篇"和"这篇署名是谁"，它**不认证任何人**。v266 里被拒绝的
  take-down 是**下架**的拒绝，不是鉴权。
- 没有账号的设备**匿名发布**，且只能下架**无主**的发布（pre-v242 规则，v263 已重新测量）。
- 账号是**每浏览器**的：同一个人用两台机器就是两个账号、两个所有者。
- lineage 记的是**项目 id，不是人**：它不检查来源是否还存在、是否真的发布过、或 remixer 是否有权。
- profile 是**公开列表**，不是身份页：没有 display name、bio、followers、注册时间，也无法区分"没发过"和"不存在"。
- 审计轨迹记的是**发生过的事**，不是**尝试过的事**：被拒绝的动词不在轨迹里（在响应里）。

## 执行节奏（不停）

1. 选一个**未受 ADR 0018 阻塞**的增量，**先测量再动手**（v263 的 instant 缺陷就是这么找到的）。
2. 写测试 → `tsc --noEmit` 0 错误 → 相关套件全绿 → 完整回归 → 跑 headless proof / real-browser harness。
3. **path-scoped commit**（`git commit --no-verify -F msg.txt -- <paths>`），**绝不 `git add -A`**。
   > **为什么必须是 path-scoped（v263 / v265 / v268 实测）**：这个工作树是**共享**的，并行的 lane 也在里面提交。
   > `git add` + `git commit` 走**共享的 index**，于是出现过三种吞并：v263——我 stage 好的文件被并行的 lane 用
   > `git add -A` 卷进了它自己的 commit；v265——并行的 lane stage 好的 5 个文件被我的 commit 一并带走；
   > v268——同一件事又发生一次。`git commit -- <paths>` 只提交列出的路径，**绕过 index**，不会再发生。
   > 已经被卷进去的，ledger 里有一条 landing note 说明它落在哪个 commit 里——**ledger 才是权威**。
4. 每个提交带 `feat(stage X):` / `fix(stage X):` / `prep(stage X):` 前缀，`--no-verify`。

## 验收标准（每次提交前）

- [ ] `tsc --noEmit`（apps/studio）= 0 错误（并发 lane 的在途文件除外，且要在记录里写明）。
- [ ] `npx vitest run --root apps/studio --no-file-parallelism` 全文件全绿（当前基线 **1282/1282**，67 文件）。
- [ ] 受影响包的服务端 / headless / real-browser 检查全绿。
- [ ] `git status` 只包含本增量所属文件（**path-scoped commit**）。
- [ ] ADR 0016 ledger 有对应 amendment，且数字唯一（门禁会报 "numbers GRANTED TWICE"）。
