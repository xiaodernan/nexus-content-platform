# CURRENT-STATE — 2026-11-09

本文件是项目当前状态的快照——供未来任何 agent（或人类）在我不在的时候接上。它**只描述已经交付、已可执行的事**，不承诺未做的事。

> **2026-11-11 续（§SC-59 / ADR-0137，最新置顶）**：**Java→Python 这一跳上运维眼前——AiHealthController + Feign 超时钉死**——落 user 本轮点名的 **Spring Cloud 微服务元素**（之前全家桶齐备唯独这梁柱从没呼吸过）。domain-service 有 eureka/config/gateway LB+breaker+bulkhead/Feign，但 `AiServiceClient.healthz()` **从未被 caller 过一次**。**做法（零新依赖）**：`application.yml` 钉死 `feign.client.config.ai-service`（connect 1s / read 3s）；新增 `AiHealthController GET /api/v1/system/ai-health`——上游活→200 body=Python 报文**原样副本**+status:healthy+responseTimeMs（不抹字段、不造字段、不代判绿红），上游死→status:"degraded"+error+message+200——200 不是健康的承诺。未鉴权同 /policy 口径，不写库。**判分面**：`AiHealthControllerTest` **3/3** · AiServiceClientWireTest 1/1 零回归 · java 全套 **129/129**。**live 三笔**（8082+8000）：#1 空 8000 → degraded/RetryableException **93ms**；#2 起 Python → healthy（providers 5 条原样：缺 NEXUS_OPENAI_API_KEY / M2/M5 未实现，queue backend=redis）**306ms**；#3 停 Python → degraded **2ms**——有↔无开关切了两次，都是人眼读到的真值。**诚实边界**：只端 healthz 一跳、主路径 /v1/ai 不受影响；探针只验"端点能表演健康"，缺 key 一律 unavailable 如实如是；超时按同机校准。**仍欠**：ai-health 接 gateway LB+breaker；CI topology job 未含本端点；未经真 push。**补记（2026-11-11）**：`verify:topology`（NEXUS_GATEWAY_PORT=8093）手工跑一次 **PASS**——五个 Java 进程起、config server 出 ratePerSecond=50.0、网关 discovery 列出 domain-service+nexus-api、community policy/billing/permission 全绿、door 200、收尾干净。**未 push**。详见 ADR-0137。

> **2026-11-11 续（§SC-58 / ADR-0136，最新置顶）**：**admin/realtime 下半区看 Java 生产者——两个世界的账，同一张表盘**——落 user 本轮**消息队列的合理运用 + 前后端协同 + Spring Cloud 微服务元素 + 前端登峰造极**。§SC-55 让 Java 生产者有了 `GET /api/v1/realtime/stats`，但没有一个界面能消费它——管理员想知道"Java 那半出去的帧可不可信"只能读代码或猜。**做法（零新增 color token，全用既有原语）**：新门面 `server/realtime/java-wire.ts`——GET `NEXUS_JAVA_WIRE_STATS_URL`（默认 127.0.0.1:8082）；`AbortSignal.timeout(3000)`；只收形状（计数 NaN/负/空 channel 一律 null）；fail-open 即 null，**浏览器从不直接打 Java 端点**。`/api/admin/realtime` additive 响应新增 `javaWire`（`isKnownStats` 考卷只认老字段，老回执缺 key 照旧走"不认识"分支），并补 `no-store`。StatsPanel 下半区：有值印五格（线路/帧上限/已发/超限丢/线路异常），没值画一行"没拿到"（**不是"接了但都是 0"**）。纯函数 `javaWireNote`/`javaWirePanelRows`/`kb` 逐档钉。**判分面（全实跑，含截图）**：`java-wire.test.ts` **5/5** · `realtime-stats-readout.test.ts` 净增 **14**（两文件 34/34）· `admin-realtime.integration.test.ts` **4/4**（真库集成，role=admin）· tsc EXIT=0 · eslint 7 文件 EXIT=0。**真浏览器截图**：`docs/evidence/fe-admin-realtime/java-wire-panel.png`（Chrome + 真 session + 真 8082 + POST /probe 一帧 → publishedTotal 0→1，五格俱全）；截图后该测试 session 已从库删除，明文 token 不留存。**诚实边界**：admin 专属、只这一台 instance、Java 只报计数不带帧内容；无新 E2E（真浏览器检查一次，E2E 待干净窗口）；CI topology job 未被真 push 驯服。**仍欠**：多实例聚合读数；E2E；帧内容样本评估。**未 push**。详见 ADR-0136。

> **2026-11-11 续（§FE-5 / ADR-0135，最新置顶）**：**创作者主页登峰造极——个人门面化 + 静态判据 + 双主题真浏览器看图**——落 user 长期点名最重的**前端美观/魅力登峰造极**。FE-1/2/3/4 已升货架面（`/discover`/`/marketplace`/`/`/`/search`），本片升**人**：`/u/<handle>`（访客从发现页/搜索点进一个作者看到的第一张脸）。改前零语义前缀裸 Tailwind（头像无环/名字纯色/作品卡薄边框/世界角色游戏无样式列表），**只动视觉**：`.pf-` 段与 `.se-` 同 token 语言、守 ADR-0123 六红线，零新增颜色 token（全锚双主题 token + color-mix、零 hex）；hero 微辉光门面卡 + 头像 brand→accent-1 渐变环 + 名字渐变墨字（浅色 fg-1 端不白字写白底）+ handle pill + 粉丝数 tabular-nums badge、分区左竖线 + 世界/角色双栏 panel、作品卡 accent-2 左描边 + hover 抬升/渐显左条、试玩 chip 化 + 设计稿中性 pill + 隐私边界条。**不碰交互**：`FollowButton`/`BlockControl` 一字未改；page.tsx diff 纯 className 替换、21 个 `data-profile-*` 钩子与所有文案/文本节点逐字仍在。**双层判据**：①静态 `profile-style.test.ts` +8（先红 4→8/8）：29 pf 类都有基础定义、零 hex、token 真存在、21 钩子、动效按规则块被 reduced-motion 收口、focus-visible；**四变异臂全红**（删主规则/写死 hex/删 transition:none/删 focus，GOOD 字节级恢复），且臂 A/C 抓出判据自身两处假绿缺口（存在性按"出现过"算→改只认基础选择器；按行扫漏多行声明 transition→改按规则块）并修正，更严非放水；②**真 Chrome `e2e/profile-visual.spec.ts` 深/浅 2 passed（2.4m，非 skip）**——从发现页真公开作品取 handle、量访客视角、验门面/作品卡/双栏/零 console error。**看图（§159，补 FE-4 欠的那一寸）**：深/浅双截图人工 Inspect，hero 辉光/渐变环/墨字名/handle 胶囊/作品卡左描边/双 panel/分区竖线/隐私条全部正确、无错乱，浅色白底名字深色可读；归档 `docs/evidence/fe-profile-elevation/{profile-dark,profile-light}.png`。验证：静态 8/8 + style-tokens 24/24（合并 32/32）、eslint 0、`tsc -p apps/web` 0、`tsc -p e2e` 0。诚实边界：hover 态只 CSS+静态门覆盖、未逐帧看图；全仓真库无干净窗口未硬跑不编绿灯；`profile-tasks.spec.ts`（axe+390）下个干净窗口复跑（本片未改其判据面）。**编号**：ADR 初稿 0134 与会话 SC-57 撞号让位 **0135**。未 push。详见 ADR-0135。

> **2026-11-11 续（§SC-57 / ADR-0134，最新置顶）**：**取消的排队作业从 pending list 真摘掉——/healthz 少一件幽灵 pending**——落 user 本轮**消息队列的合理运用**的一处真缺陷收口。读码发现的：`RedisJobStore.request_cancel` 排队分支把作业落成 `cancelled` 却不动 `pending list`，而 `counts()` 按 `llen` 直报（O(1)）⇒ 一个已死作业永远占一格，`/healthz` pending 虚高、与 memory 后端口径分叉。**做法（手术刀改 2 处）**：`request_cancel` 落状态后 `LREM pending 0 <id>`——claim 抢先则摘零条；`counts()` 注释同步"为什么 LLEN 够用"；**未触 memory 后端一行**。**判据（打真 Redis 127.0.0.1:6380、独立前缀、收尾自扫删键）**：`test_redis_job_store.py` **8/8**——FIFO claim、ttl=1 幽灵被 LPOP 跳过、**取消摘 pending 后 counts=(1,0) 而非 (2,0)**、worker 整份 JSON 写回 progress=0.9 不抹独立 `jobcancel:` 标志、未知 id 拒绝、前缀隔离、完整生命周期归零(0,0)、note 自报真相。**数字**：新判据 8/8；全套 **96/96**（88+8）同一 env 全绿，HTTP/worker 零回归。**诚实边界**：LREM 是低频取消路径 O(n) 的换取 O(1) 高频 claim 的正确取舍；TTL 淘汰绕开 `request_cancel` 时 counts 不保成（claim 照旧跳过）——需 reaper 另立片；两副本并发交错只论证了、没真集群测。**仍欠**：reaper 扫过期认领；worker 取消检查点密度；缺 env 时全文件 skip（文档已写清）；counts SCAN 成本大量作业缩放未实测。**未 push**。详见 ADR-0134。

> **2026-11-11 续（§SC-56 / ADR-0133，最新置顶）**：**MemoryJobStore 裸单测 11 条——MQ 候选①原话"零判据"的一处要修正的读数**——落 user 点名的**消息队列合理运用** + 系统层级合理性。先读码定性：HTTP/worker 间接测了约 **21 条**（不是零）、零判据的是 **store 本体**（FIFO、`_purge` 淘汰边界、counts 迁移、**取消标志与作业本体分离**——worker 的整份 save 会抹取消请求这个被钉下的竞态、`_purge` 只在 enqueue 前触发、提示语必须自报"多副本/重启即失"）。**做法（零生产代码改动、+172 行判据）**：新文件 `tests/test_memory_job_store.py`，裸打 store、stdlib `asyncio.run` 包装。判据：FIFO、counts `(2,0)→(1,1)→(1,0)`、`_purge` 淘汰最旧终结（max_jobs=3 × 5 件完成后入 2 件 → 淘汰 4 件最旧）、排队装载不被淘汰、queued 取消即终态 + claim 跳过、save 不抹取消标志、完成后追加取消终态不覆盖、未知作业诚实、payload 原样、`note` 必须写明"多副本/重启即失"、TERMINAL 词表一致。**数字**：新判据 **11/11 passed**（0.32s）；全套 **88/88**（77+11）同一 env 全绿；生产代码零行改动。**修正记录**：候选①原话"零判据"不是确数，已入 ADR-0133 修正为"间接 21 条走通、store 本体 0→11 补齐"。**仍欠**：RedisJobStore 裸判据；worker 取消检查点粒度；内存后端干掉 CI Redis flag 另评估。**未 push**。详见 ADR-0133。

> **2026-11-11 续（§SC-55 / ADR-0132，最新置顶）**：**发送端帧 64 KiB 护栏——pub/sub 没有背压，大帧只能靠收发端自律**——落 user 点名的**消息队列合理运用**（MQ 候选③）。根上的事：Redis pub/sub 无订阅者名册、无 slow-consumer、无死信；一帧几 MB 的 JSON 会原样复制给每一个订阅连接并撑爆缓冲。**只能在发送端拦**：web `redisBus.ts` `Buffer.byteLength` 在 `pub.publish` 前量真实字节，超限 → 新词条 `countWireError('帧超长')` 后 return——本机半边照常送达、ioredis 从未被调用、『投递』账不污染；**Java `WirePublisher` 同护栏** + `LongAdder` 计数，新端点 **`GET /api/v1/realtime/stats`**（`{wireChannel, maxFrameBytes:65536, publishedTotal, tooLargeDropped, redisFailures}`，与 `/policy` 同敞开——只带计数）。`/probe` 的 `redis_unavailable` 保持不变（SC-53 契约），精确失败种类去 `/stats` 对账。**判分面（全实跑）**：`test/realtime-frame-guard.test.ts` **3/3**（死端口构造证明大帧就地丢、本机送达仍 1 帧）· tsc EXIT=0 · eslint EXIT=0 · 三文件 **30/30** · java 全套 **126/126**（+2）· **live**：8082 up，`GET /stats` 200，`POST /probe` 后 `publishedTotal: 0→1`，随后服务收拢。**诚实边界**：只防大帧不防大量小帧；O(n) 扫描相对 RTT 可忽略；64 KiB 护栏非天花板（agent.plan KB 量级合法值不触界）；`stats` 仅进程生命周期与 web 进程内账同语义；Java/web 两处各自定义常量（不同语言不跨进程共享），调整一起改。未 push。详见 ADR-0132。

> **2026-11-11 续（§PERF-1 / ADR-0131，最新置顶）**：**sim.step 每帧重建 plan 只读索引——按不可变 plan 缓存，构造次数 O(帧数)→O(plan 数)**——落 user 长期点名的**操作系统/数据结构与算法优化运行速度 + 缓存合理运用**。全仓唯一每帧驱动的模型层 `packages/game-model/src/sim.ts:step`（`GamePlay.tsx:414` rAF / `GameCanvas3D.tsx:216` useFrame / `playtest.ts` 14400 帧定步长）改前**每帧**构造 4 个只读 Map + 1 次 filter（60fps≈每秒 240 个短命 Map、一次 60s playtest≈57600 个纯 GC 压力），而 plan 是 `compileGame` 的**不可变产物**、整场模拟同一引用——纯属每帧重算循环不变量。**做法（零行为变化）**：`PlanIndices`/`buildPlanIndices`/`makePlanIndexCache`（`WeakMap<GamePlan,…>` 按对象分键、换引用旧索引自动可收）；`step` 加**第五个可选参数** `cache=defaultPlanIndexCache`，5 处 `new Map`/filter 改 `idx.*`；`builds` 是**注入计数的确定性判据**（对标 SC-51 可注入钟，断言 N 帧 `builds===1`，不拿墙钟量、抢资源机必 flaky）。**判据 +7**（`sim-index-cache.test.ts` 纯内存零真库/零时钟）：600 帧/14400 帧 `builds===1`、换 plan 重建、逐帧与"每帧新建"逐字段相同、内容正确、两 cache 不串味、带攻击输入等价。**两变异臂各有牙**（每帧重建红 5 / 删 `memo.set` 红 6，脚本自动恢复）。**验证（落账前 HEAD 前移 `971cd28b` 后全部复绿重跑）**：三文件 **57/57** · game-model **全包 16 文件 331/331**（含 925 行 parity 逐帧对账）· `eslint` **EXIT=0** · 包级 `tsc` **EXIT=0**；根 `web tsc` 亦 **EXIT=0**（会话 `realtime-frame-guard.test.ts` 的类型红已随会话推进自愈、本片未碰）。**诚实边界**：实体规模小、单帧省微秒+4 分配，**不承诺墙钟毫秒**；价值是确定性"构造次数 4N→1"；`questById` 已知纯冗余但刻意不消除（不引入未证实的 quest id 唯一假设）。全仓真库套件无干净窗口、未硬跑、不编绿灯；未 push。**仍欠**：quest 冗余清理（需先证唯一）、候选 B `rpg.ts`/`playtest.ts` 的 O(E²) `find`（依赖顺序不变量、另立片）、墙钟实测待干净窗口。详见 ADR-0131。

> **2026-11-11 续（§SC-54 / ADR-0130，最新置顶）**：**社区 like/follow 上线路——领域事件 + AFTER_COMMIT，收件箱归 web、线路归大家**——落 user 本轮**消息队列的合理运用 + 前后端协同**。§SC-53 证明 Java 栈"能说探针话"，本片把它接到**真实写路径**：like/follow 提交后，Studio/web 用户频道收到收件箱计划逐字同文的通知（`<actorName> 点赞了《作品》` / `<actorName> 开始关注你`）。**做法**：`CommunityEvents.LikeAdded/FollowAdded`（只发"加"——unlike/unfollow/blocked/拒绝一律不发）；`CommunityService` 发事件、`WireCommunityEventListener` 在 **AFTER_COMMIT** 帧化上线路；**事务回滚 → 不发帧**（实测：随机 UUID actor 撞 FK `likes_user_id_users_id_fk` → HTTP 500 → 回滚 → 线路零动静，不是嘴上说的）；频道复用 web `channels.user(userId)`；文案与 web `lib/notify-plan.ts` 逐字对齐；**Java 不写收件箱表**（"谁写收件箱"仍是 web 独占）。**判分面（全实跑，零虚报）**：`WireCommunityEventListenerTest` **6/6** · `CommunityServiceTest` 19→**25** · java-domain-service 全套 **124/124** · **`npm run realtime:java-community` 7/7 verdicts PASS**（真 public 发布《无障碍弹层夹具mvza9nk2》：like×2 各一帧、follow×2 各一帧、取消静默、`projectId` 逐字匹配、`wireErrorCount=0`） · **库零残留**（likes=0/follows=0 如实查询）。**诚实边界**：线路只是 notification 数据流，帧无 link/actorHandle；web 主路径零改动；无送达保证；`@TransactionalEventListener` 依赖事务同步；中途如实翻车一趟（随机 UUID actor → FK → HTTP 500 → 修为真实零互动 actor 复跑全绿）。**工程教训（入 git）**：PowerShell 5 读写源码不带显式 UTF-8 会把 CJK 二次解码损坏（§SC-53 BOM 同类事故，本片两条注释行逐字恢复并经 git diff 核验）。**仍欠**：真浏览器里 Java 帧→SSE→§164 通知 UI 的 e2e 实证未跑（消费侧现成：`/api/realtime` 本就 subscribe `user:<id>`、web 既有 user 频道 notification 渲染）；`generation.progress` JVM 同构处理；发送端帧大小护栏；双路触发去重；topology job 未含本链路 smoke；**未 push**。详见 ADR-0130。

> **2026-11-11 续（§SC-53 / ADR-0128，最新置顶）**：**Java 域服务开口喊话——notification 帧写上 `nexus:realtime:v1`，跨进程那条腿从哑到通**——落 user 本轮**消息队列的合理运用 + 前后端协同**。真缺口：web/Studio 早有跨进程线路（`redisBus.ts` `WIRE_CHANNEL='nexus:realtime:v1'`，`RealtimeWireFrameSchema` safeParse 把关，`realtime:two-process` 双进程实证过），**Java 侧零生产者**——Spring Cloud 栈对 Studio 永远哑。**做法（2 bean + 2 测试 + 1 脚本 + 1 fix）**：`WirePublisher` 组与 web schema 逐字段对齐的帧（kind=event / origin=java-domain-service 稳定串 / channel min(1) / event.type=notification+level=info+title 必填），**空 channel/title 出线路前就拒**（web 侧必丢、发出去只是排障假象）；线路挂了只记日志返回 null，**绝不抛给业务**（与 web publish 纪律一致）；`RealtimeController` `POST /api/v1/realtime/probe`，`X-Nexus-Subject` 必填 UUID（缺/非法**实测 HTTP 400**），线路拒收回 **503 published:false**，不把失败包装成成功。**判分面（不虚报）**：`WirePublisherFrameShapeTest` **6/6**；`WirePublisherRoundTripTest` **1/1**（`127.0.0.1:56379` 真 Redis 回环——Windows 下 `localhost` 走 `::1` 会假失败；订阅先握手 500ms；Redis 不可达 `assumeTrue` 跳过、绝不假跑）；**`npm run realtime:java-to-web`**（domain-service@8082 + web `RedisRealtimeBus` 作监听子进程）：**PROBE_PUBLISHED / WEB_BUS_DELIVERED（bus 按 channel 路由收到 `java-probe-<ts>` 帧）/ NO_WIRE_ERRORS 三条全 PASS**——web 生产 bus 的 safeParse 门亲手电过一遍 Java 的帧；`java-domain-service` 全套 **112/112**（既有 105 + 本片 7）全绿重跑。**顺手修真 trap**（`fe566b31`）：默认 `NEXUS_DOMAIN_DB_URL=jdbc:postgresql://127.0.0.1:5432/nexus`——本机 5432 是 **careeros-postgres**，fresh `java -jar` 实测在 `JdbcEnvironmentInitiator` 断掉、Tomcat 不起来；按 docs/ENVIRONMENT.md 对齐 55433、`DB_PASSWORD` 默认同步本地 dev 口令。**工程教训（已入 git）**：PowerShell 5 `Set-Content -Encoding UTF8` 会写 BOM，本机 javac 工具链下直接拒编译（误报"注释未闭合"）——源码一律字节级安全写入。**诚实边界**：探针链路**不是业务事件源**（like/follow/publication 等领域事件**尚未**接线）；pub/sub 无送达保证，业务正确性不许依赖它；Studio 收到的是 info 级 notification，醒目与否、如何路由展示是前端自己的事；**未 push**。**仍欠**：真实领域事件（至少 like/publish 之一）接线并被 Studio 消费；发送端帧大小护栏（MQ 候选③）；`projects:probe` 与 Studio 路由约定文档化；多实例 origin 细粒度（当前稳定串够用）；Java→线路 smoke 接入 verify:topology。详见 ADR-0128。

> **2026-11-11 续（§FE-4 / ADR-0129，最新置顶）**：**/search 全平台搜索登峰造极——发现链路第二个公开入口**——落 user 点名最重的**前端美观登峰造极**。FE-1/2/3 已升 `/discover`/`/marketplace`/`/`，本片升 `/search`（§165）：改前标题纯文本、搜索框裸输入+方钮、命中行平块、空态一色字；**只动视觉，搜索逻辑/信息架构/文案/`data-*` 钩子一字未改**（§159）。`.se-` 前缀与 `.dv-`/`.mk-`/`.hp-` 同 token 语言、守 ADR-0123 六红线：**零新增颜色 token**（全锚 tokens.css 既有双主题名 + color-mix、零写死 hex），标题渐变墨字+渐变压边、身份中性 pill、搜索框整块门面+`:focus-within` brand 辉光环、提交键渐变+glow、分组竖线+tabular-nums 计数 badge、命中行 accent-2 左描边+hover 侧移 3px/品牌描边/渐显左条、空态 brand 14% 径向辉光、排法/范围条边界彩、建议列表门面、历史 chip 化；交互保 focus-visible、reduced-motion 关全部动效、渐变墨字 fg-1 端起步（浅色不白字写白底）。**验证**：`style-tokens` **24/24**、eslint（page+SearchBox）**EXIT=0**、`tsc --noEmit -p apps/web` **EXIT=0**、**真 Chrome e2e `e2e/search.spec.ts`（本片新增）深/浅 2 passed**（1.1m，验门面/表单 GET action+method/输入可聚焦/结果空态二选一/`.se-` 钩子/零 console error；浅色验标题计算色非白字）。**看图（§159）**：深色匿名冷启动截图已人工 Inspect，渐变标题/pill 范围/门面搜索框+紫钮/径向辉光空态/边界彩范围条全部正确渲染、无样式错乱。该截图来自修 matcher 前失败现场——我误用 Playwright 不存在的 `toBeFocusable()`（**判据 bug 非页面 bug**），改 `evaluate` 验 activeElement 后 2/2 全绿。**未截到（如实记不编）**：带结果命中行 hover/计数 badge 的深/浅截图因单命令起 Next dev + 双 Chrome 在多 agent 抢资源下 SIGTERM 超时未截到，命中行视觉**未人工看图**、只由 e2e 结构断言+token 门覆盖；e2e 2/2 取自早先 server 稳定运行时。**编号**：ADR 初稿占 0128 与会话 `0128-java-domain-service-speaks-on-the-wire.md` 撞号，让位重编 **ADR-0129**（沿用 SC-51 纪律），会话 Java 文档未动。未 push。**仍欠**：带结果命中行深/浅人工看图；FE-1 `e2e/discover.spec.ts` 此前未跑、下个干净窗口与 search 一并复跑；`/u/[handle]`、`/n/[handle]/[slug]` 可按本片范式继续升。详见 ADR-0129。

> **2026-11-11 续（§SC-50 落地 / ADR-0127，最新置顶）**：**共享缓存"断后永不重连 + 恒报 driver=redis"→有界自愈 + 配置/实况分开说**——落 user 长期点名的 **Redis / 计网 / 缓存 / 前后端协同 / 算法**。承接 ADR-0125 探查定稿的 A+B②：①**修 A**——`makeRedisShared` 的 `retryStrategy:()=>null`（同仓 4 处 Redis 连接里唯一关自愈、断后永久 fail-open 到进程结束）换成纯函数 `sharedRedisRetryStrategy`：指数退避 `min(1000,100·2^(n-1))`、8 次后返 null 放弃（防长期不可达无限空转打日志/CPU）、每步严格正数；短抖自愈、长断退回进程内不比今天更差，`enableOfflineQueue:false`/`maxRetriesPerRequest:1`/`lazyConnect:true` 三条纪律逐字不变、重连期仍即时 fail-open 不拖管理页。②**修 B②**——`describe().shared` 三字段形状不动，新增纯函数 `sharedHealthView` 把"配了"（`driver=redis`）与"连着"分开说：无失败只说"已配置 Redis（看错误/回退计数）"**绝不说已连接健康**（无瞬时权威），`fallbacks>0`/`lastError` 则说"正在回退"+次数+错误；页脚替换原硬编码文案，route 原样透传、前端形状门零改动，坏回执不画 undefined/NaN。③**工程缝** `makeRedisShared(url,ctor?)` 注入假构造器，生产缺省动态 import 真 Redis 逐字不变。**证据**：开 seam 后既有 49/49 零回归；加判据未实现 **7 红 18 绿**（B② 5 条函数不存在 + A 退避/放弃 2 条精准命中旧恒 null）→ 实现后 **25/25**；**三变异臂各有牙**（改回 `()=>null` 红 3 / 去放弃门红 1 / 改"已连接健康"红 1，脚本自动恢复）。5 改动文件 `eslint` EXIT=0（顺带清 `JoinInput` 基线未用 import 1 条）、`tsc --noEmit -p apps/web` EXIT=0。**诚实边界**：判据验的是"喂给 ioredis 的策略契约 + fail-open 契约"，**不等于**真 Redis 断后自愈已在真线路实测（需真 Redis + 网络抖干净窗口，本机多 agent 抢库做不到），列仍欠、不宣称已验证；真库集成套件同样无干净窗口、记推算不编绿灯。未 push。**仍欠**：真线路自愈实测；`describe().shared` 可加派生 `connected`/`degraded`（需同步形状门，另立片）；MQ 候选①（ai-service `MemoryJobStore` 零判据）、③（发送端帧上限护栏）留后续。详见 ADR-0127（承接 ADR-0125）。

> **2026-11-11 续（§SC-52 / §MQ-1 / ADR-0126，最新置顶）**：**失效总线一个坏订阅者吞掉同帧其余人→逐 listener 隔离 + 账本不虚记**——落 user 本轮新增的**消息队列合理运用 + 前后端协同 + 缓存/算法合理性**。真缺口：`InvalidationListeners.dispatch` 裸 `for`，第一个 listener 抛错→同帧后面全静默吞；`makeDispatcher` 整次 `try/catch` 只兜"进程不崩 + errors+1"，兜不住"其余订阅者照常收"——与同仓 `realtime/localBus.ts` 早钉死并测过的隔离纪律**分叉**，而生产 `RedisInvalidationBus` 正走这条、挂多只订阅者（bump `generation` 隐私 + `globalEpoch` 可见性），前者抛错让后者收不到、两世代不同步、退回 15s TTL 自愈。读码顺带确认第二处读数缺口：`applied` 零 listener 也虚记 >0（违自己注释、违 ADR-0115「没接上绝不画四账 0」同类），全抛时 `errors` 只记 1 不记满。**做法（范围钉死 2 文件、零公共 API / 零前端形状变化）**：`dispatch` 改返回 `DispatchOutcome{applied,failed}`、逐个 `try/catch` + 先复制再遍历；`makeDispatcher` 按 outcome 记账——`applied>0` 才累加、每个坏回调各记一笔 `errors`；**语义收紧不改字段**，admin 面板 `errors>0` 分支仍成立、前端零联动，正常路径逐字等价。**判据 +7**（纯内存 hub/假连接，零真 Redis/库/sleep/时钟）：**先红后绿**——先加判据未改实现 **5 红 2 绿**抓准 bug，修复后 **20/20**；**三变异臂各有牙逐条还原**（去隔离红 4 / 去 applied 门红 2 / 去 errors+=failed 红 4），脚本自动恢复。周边纯内存套件 `discover-view`+`realtime` **82/82**；两改动文件 `eslint` **EXIT=0**（顺带清 HEAD 基线各 3 条 lint 遗留：`Redis` type import / `emptyStats` / `Map<string,Function>` 等，零行为变化，从基线红清零）；`tsc --noEmit -p apps/web/tsconfig.json` **EXIT=0**。真库集成 `admin-discover-cache.integration` 本机多 agent 抢同一 Postgres 无干净窗口、未硬跑、记推算待复核不编绿灯。未 push。**仍欠**：`InvalidationBusStats` 注释/admin 标签文案待下片同步；SC-50（ADR-0125）待干净窗口；MQ 候选①（ai-service `MemoryJobStore` 零判据）、③（发送端 `MAX_VIEWERS_PER_FRAME` 护栏）留后续 MQ 片。详见 ADR-0126。

> **2026-11-11 续（§SC-51 / ADR-0124，最新置顶）**：**给默认内存令牌桶装一只可注入的钟**——落 user 点名的 Spring Cloud / 计网 / 算法 / 数据结构 / 缓存合理运用。选片前只读探查**证伪两个错方向**：`nexus-api` 十几处 `PageRequest.of(from/asked)` 看似 offset=ROWS 却按页跳的 bug，逐处读测试注释（Like/Report/Tip/Audit…）确认 `from/asked` 整页翻译是**有意设计、已固化**——不动（修它撕裂十几服务+判据）；`CommunityPolicy` 缓存声明经读码证伪（单例构造只读一次、无热路径）——不动。真缺口：**默认**限流后端 `MemoryRateLimitBackend`（无 Redis 时就在跑）refill 算法**零测试**，而 `RedisRateLimitBackend` 一直有 test；根因 `Bucket.refill()` 硬读 `System.nanoTime()`，不 sleep 就测不了"过 100ms 补 1 token"。**做法（零生产行为变化、只改 1 文件+1 新测试）**：三参构造委托 `System::nanoTime`、新增包私有四参接 `LongSupplier`；锁内多余 `AtomicLong.getAndSet` 化普通 `long`（并发靠判据证明不靠类型）；**时间回退边界是判据跑红抓出的注释/实现分叉**——首版回退把水位拉到过去、下次前进白铸 token，改为水位只在前进时推进（单调生产钟下零变化）。**判据 `MemoryRateLimitBackendTest` 10/10 全绿**（0.645s 纯 new+手摇钟，零上下文/容器）：满桶 burst、10/s 补 1、长等封顶、不足 1 token 拒绝、回退不补不扣、多 client 隔离、rate=0 永不补、并发 40 抢 burst=5 恰好 5 放行、describe、maxClients 有界。**三条变异臂各有牙逐条还原**：除数 1e9→1e6 红 2、删 Math.min 红 1、删 synchronized 并发红。**验证**：基线 EXIT=0、改后 compile EXIT=0、gateway 全模块 **126 tests / 0 failures / BUILD SUCCESS / EXIT=0**（3m11s）。首跑曾报 126/Failures:1，如实定性为 `GatewayCircuitHalfOpenWiringTest` **时序偶发红**（并行会话抢资源、单跑 2/2 全绿、干净全模块全绿、与令牌桶零因果）；另三份失败 `.txt` 是 02:50/10:32 **陈旧报告**（源已被会话删/重构）——既不拿陈旧当本次失败也不掩盖偶发红。全仓 web vitest 本片未复跑（纯 Java 改动与 web 零因果、本机多 agent 抢同一 Postgres 无干净窗口）。**ADR 编号修复**：发现两个 ADR-0123（会话 FE 红线 + 我上轮 SC-50 探查），以 `git mv` 把我那份让位重编 **ADR-0125**、`0124` 归本片，全仓编号恢复唯一；会话 FE 文档未动。**协作**：只 add 我的 2 Java 文件 + ADR-0124 + ADR-0125 重命名 + 三处文档；会话正在改的 `nexus-registry/config application.yml`、`test.yml`、前端文件一概未碰，`BOOT-INF/` 测试副产物已清。**仍欠**：SC-50 待干净窗口（ADR-0125）；offset javadoc 统一须另立片；ROADMAP 第四十八/四十九片各有一份会话叠写重复副本（属会话整理范围，不替它删）。未 push。

> **2026-11-11 续（§FE 第一片 · §SC-48 / §SC-49，最新置顶）**：用户新增侧重"Redis / 计网 / 算法 / 操作系统 / 前端登峰造极 / 前后端协同 / 数据库与缓存"——这些维度在 SC-40–SC-49 已全链铺开、本片不重复开火药。**（1）前端美观登峰造极从公开面 `/discover` 落地**：渐变墨字标题（fg-1→accent-2）+ brand 压边；排序收成分段胶囊（当前格 brand→accent-1 渐变底 + glow + aria-current=page）；卡片渐变底 + 封面 600ms 缓放 + hover 抬升 3px；计数 font-mono + tabular-nums；空态径向辉光、搜索入口 pill——**零新增颜色 token**（全锚 tokens.css 双主题），style-tokens 门 **24/24**、page.tsx eslint exit 0、tsc 通过。**（2）§SC-48 真库 EXPLAIN（零代码改动）**：发现页 popular 查询冷启动假象（297ms→热稳态 1.3ms），拆查询净亏；物化 likes_count 列万级候选才值得（拐点 22.9→2.3ms，合成 ROLLBACK 零污染）。**（3）§SC-49 收底座**：`BoundedCache.clear()` 被 singleflight 在途回写"复活"——generation token + `finally` 不碰修，5 条判据（0 sleep、0 网络）。定向 smoke **37/37**；**全仓 vitest 仍在后台复跑**（本片提交时尚未回显最终数字，但逐文件判据均已实跑）。Java、apps/studio、web 其余入口未动。

> **2026-11-11 续（§SC-49 / ADR-0121 + §SC-48 / ADR-0120，最新置顶）**：两片。**§SC-48（零代码改动 · 真库性能画像）**：发现页 `popular` 排序读码直觉"该优化"（3 个投影 count 子查询 + 排序第 4 个 likes count + `LEFT JOIN snapshots` 取封面），按 ADR-0117/0119 纪律先真库 `EXPLAIN` 再谈——**两条证伪**：①拆成两阶段查询是**冷启动假象**（首次 297ms、`Seq Scan snapshots` 206ms 是首次读 jsonb 进 shared_buffers 的一次性成本；同会话**热稳态现有 popular 仅 1.29–1.42ms**，拆开 B+C≈1.2ms 无收益，反多一次往返/planning、破坏单查询原子性、开读一致性窗口）；②物化 likes 计数器**方向对但欠火候**（真库仅 135 候选、likes 11 行，count 算 159 遍合计约 2ms 非瓶颈，为不存在的规模付三表写路径一致性债不值）。**一个拐点**：`generate_series` 事务内造 2 万候选+7101 likes（同事务 `ROLLBACK` 零污染），相关子查询 **22.9–28.3ms**（`SubPlan loops=20000`）vs 物化列 **2.17–2.33ms**，约 10–12x，**万级候选拐点明确**；触发阈值=候选逼近万级或 popular `maxLoadMs` 持续数十 ms，正确方向=物化三计数+写路径增减，**不是拆 join/加 statement_timeout**。未改 `social.ts`/索引/`db/client.ts`。**§SC-49（代码修复 · 缓存底座正确性）**：`BoundedCache.clear()` 承诺清空却在 singleflight 在途时漏——leader `await load` 挂起→`clear()` 清 map/inflight/计数→loader resolve 后 `fromLoad` 仍 `set()` 回去，`size=1/loads=0` 假账。**范围诚实**：唯一生产入口 `clearCache()` 全仓零调用点，是底座 latent 债非事故；`BoundedCache` 是复用底座，发现页 test reset 走重建实例不受影响。**修复**：单片程单调 `generation`，`clear()`+1、`getOrLoad` 同步段捕 gen、`fromLoad` 写 map 前比对，旧世代**值照交调用者（数据是真的）但不落库不计数**；`finally` 刻意不加 gen——被 clear 时 `inflight.get(k)===load` 已为假（新一发 promise ≠旧），不误删。**零生产行为变化**，不碰 db/网络/discover-cache/公开类型。**验证（不粉饰）**：判据净增 +5（全落 `gateway-pure.test.ts`，可控 deferred 零网络）：leader/follower 不复活、失败不写、正常 clear 不回归、**旧 leader finally 不误删新一发**；首跑判据②红在"同步断言 loaderCalls，但 loader 被 `.then` 推到微任务还没跑"——判据时序错非实现 bug，改用同步 `loads` 验 singleflight+`await Promise.resolve()` 让出，经验：**红先分辨判据错还是实现错**。gateway 两组 **37 passed**、discover-cache 回归+横向门 **90 passed**（style-tokens 24/24 零新增 token）、`npx tsc -p apps/web/tsconfig.json --noEmit` **EXIT=0**；判别实验：在外部并发争抢下单跑 `gateway-pure` 仍 **23/23 秒绿（11.42s）**，证明本片纯内存改动零回归。**全仓 vitest 本轮未单独复跑（不粉饰）**：验证期间有另一个并行会话的 `vitest run`（本仓）与 `D:\终极项目` 的 `vitest run trending.integration.test.ts` 同时打本机同一个 `nexus-postgres`（`max=5` 连接池）与 CPU，两路串行套件互相把 30s hookTimeout 拖爆、主进程 20+ 分钟 CPU 仅 10s 卡在等库；本仓全仓与纯逻辑分卷两度撞车超时（后者 `timeout 300` EXIT=124）。那两个进程非本轮所起、按仓库纪律不 kill。基于 SC-47 已实测基线 **5851 passed | 1 skipped** + 本轮净增 5 条纯测，预期全仓 **5856 passed | 1 skipped**，**此为推算、待干净窗口实测复核**。详见 ADR-0120 / ADR-0121 / ROADMAP §SC 第四十八、四十九片。未 push。
>
> **2026-11-11 续（§SC-47 / ADR-0119，历史）**：SC-46 的 stale 兜底只在 loader `reject` 时生效——上游**永不回答**（慢查询 / 连接池排队 / 锁等待）时 `discover()` 既不 resolve 也不 reject、catch 永远不进，stale 旧值明明在表里却端不出来，首屏焊死（SC-36 网关测过的"连接黑洞"，发现页这条本地 Postgres 链从没量过）。读码确证 `db/client.ts` 只有 `postgres(URL,{max:NEXUS_DB_POOL??5})`、**无任何 query deadline**，全仓 `AbortSignal.timeout` 只在 fetch 出站用。本片**先量再治、只做观测不设闸**（落 数据库性能 / 缓存 / 数据结构环形缓冲 / 操作系统背压 / 前端美学 / 前后端协同），接住 SC-45/46 同一条"观测优先"纪律。**为什么不能直接 `Promise.race` 软超时**：race 不取消底层，hung 查询仍占 singleflight 的 `inflight`、后续同键一起 hang，且每个超时请求各起 race 会让 hung 查询堆积占满 5 连接、把单键慢放大成全站雪崩——在 race 层加超时更糟。**生产（零新 DB 查询 / 零行为变化 / 不碰共享 BoundedCache 与 db/client.ts / 不改 discover 与两入口 / 不改领域类型）**：`loadFromStore` 把注入 loader 包一层 `withLoadTiming(s, epoch, loader)` 量真实打库墙钟。**最关键的一处**：必须包 loader、**不能在加载外层掐表**——`getOrLoad` 的 singleflight 只对 leader 真调 loader、跟随者根本不进包装函数、缓存命中更不调，故包 loader 天然只记真实打库那一次；挪到外层会把一次打库记成 N 次、把"等 leader 的墙钟"误算成查询耗时，**用观测造出"并发越高越慢"的假长尾**（判据 N=5 并发只记 1 次专钉）。波（SC-45 读侧瞬时快照）与耗时（loader 侧墙钟）共用同一注入时钟但采样点刻意分开。**记什么/不记什么（本片最要紧的诚实）**：stats 加 `maxLoadMs`/`slowLoads`/`loadsTimed`/`recentLoads{epoch,durationMs,ok,atMs}`，进程内账只增不减、**不跨 reset**（与波/staleServed 同列的观测快照，与必须保住的 globalEpoch/globalGen 相反）；`slowLoadMs`（默认 1000ms、`NEXUS_DISCOVER_SLOW_LOAD_MS` 可调）**只是分类旋钮不是超时**，超过只 ++slowLoads 不 abort；`recentLoads` 进容量 12 环形缓冲有界、聚合不因淘汰丢。**只记已 settle 的加载**：永不返回的 hung loader 到不了 finally、**不进样本**——故"最慢低于阈值"**不能证明"没有连接黑洞"**；hang 的旁证是 `loads−loadsTimed` 长期为正 + `inFlight` 不归零（SC-45 已接面板），面板 KPI"发起−已计时"与 `loadNote` 明摆给运维，绝不拿低耗时当"没有 hang"的免死金牌（判据用永不 settle 的 loader 钉死 `maxLoadMs=0 但 loads−loadsTimed=1`）。`epoch` 发起时锁定、loader 途中发布仍记旧世代。**面板**：既有链路原样端出四字段（route 本就读数不打库），`DiscoverPanel` 加"加载耗时观测·只记不设闸"节，`loadTimingHeadline(0,…)` 说"尚未观测，不是'没有慢查询/都很快'"、`maxLoadMs=0` 画"—（未测）"不画 0ms，`loadNote` 摆只计真实打库/hang 不进样本看在途差/只 ++ 不拦/有界/真长尾也不在 race 层设闸而是 abandon(key) 或 statement_timeout（后者波及全站须单独评估）/最慢远低于阈值则 deadline 是伪需求；`isKnownReadout` 纳入四新计数 + config 两字段 + recentLoads 逐条四字段（ok 必布尔）。**慢阈值照画毫秒不画秒**（50ms 收窄判据下 `/1000` 会谎报 `0s`，是首跑抓到的面板真 bug）。零新增颜色 token。**验证（不粉饰）**：内核 `discover-cache.test.ts` **+12**（config 回读/受控时钟钉 37ms/超阈值取峰值/慢失败 ok:false/singleflight N=5 只记 1 次不含等待/命中不计/**hang 不进样本靠 loads−loadsTimed 旁证**/有界缓冲+聚合不丢/不跨 reset/途中发布仍记发起世代/JSON 往返/与 SC-46 降级共存）+ 展示判据 `discover-view.test.ts` **+9** + 多实例 **+1**（两台各算各的墙钟）+ 路由层 **+1**（137ms 端到端可见、读数不打库）= **净增 +23 its**，相关 4 文件 **118 passed**；横向门 `style-tokens` **24/24**；`npx tsc -p apps/web/tsconfig.json --noEmit` **EXIT=0**；SC-45/46 零回归。**全仓 vitest 405 files passed（404 + 1 skipped）/ 5851 tests passed | 1 skipped（5852 total）、EXIT=0**（对比 SC-46 基线 404/5828+1 skipped，净增 23 tests = 4 文件 97→118，8m43s）。**首跑真信号**：定向首轮红 4 条——①面板 `slowLoadMs` 画秒致 50ms→`0s` 真 bug（改画毫秒+判据钉死）；②夹具设计错误（让共享 `now()` 抛错会连带搞挂 `BoundedCache.set`，测的不是观测隔离，删掉换成"途中发布仍记发起世代"）；③三条判据凭记忆编文案/单位（"已 settle"、秒数、`loads−loadsTimed` 无中文），SC-46 同一坑重演，全改为逐字取自实现。**仍欠**：确有秒级长尾才上 `BoundedCache.abandon(key)` / Postgres `statement_timeout`（绝不 race 层）、连接层黑洞独立看门狗（SC-36）、SC-45 减载预案待实测、共享权威 gen/epoch 存储、实例粒度 breaker/bulkhead 聚合、CI `topology` job 经真实 push、3 条既存 `.mjs` TS8016。未改 discover 函数体/DB/索引/依赖/两个入口/领域类型。未 push。详见 ADR-0119 / ROADMAP §SC 第四十七片。
>
> **2026-11-11 续（§SC-46 / ADR-0118，历史）**：`BoundedCache.peek()` 声明了很久的"供上游失败时 stale 兜底"、`gateway/client.ts` 早已用成生产事实（失败→端旧值标 stale→无值则 unavailable 绝不画 0），唯独发现页这条同样打 Postgres 的热读链没接——`GET /api/discover` 与 `/discover` 页无 try/catch，`discover()` 一抖就整页 500。本片接上，落 **缓存合理运用 / 数据库性能 / 前后端协同 / 诚实降级**。**本片最隐蔽的一条（SC-41 欠下的隐私债在降级路径暴露）**：SC-41 的失效纪律是 `invalidateDiscoverFor` **只删 viewerGen 表条目、不删 cache 表条目**（旧键带旧 generation、单调水位线保证永不被拼出，正常读路径成立）；但 stale 降级的 `keyRequested` 是 loader 开始前锁定的，若**打库期间**发生 block（generation 条目被删）或 public 发布（epoch+1），缓存表里 `keyRequested` 的旧条目**还在**，`peek` 会成功拿到——那份可能是**拉黑前的视图 / 下架内容还在的那份**，直接端就是隐私/收录回退。**根治：端旧值前重算键比对**——`serveStaleOrThrow` 三条件同时成立才端：①`keyFor(s,input)===keyRequested`（epoch/generation 任一变就不同）、②`peek` 有旧条目、③`old.ageMs<=staleMaxMs`；期间 block 本 viewer / public 发布 → 键变 → **绝不端**（SC-44 即时可见不被破坏）、block 别人 → 键不变 → 可端（不误伤）、无失效 → 可端；否则 `throw cause`，上游原始异常一字不改冒泡，不吞错、不造空 `DiscoverResult`。**一句话**：「缓存里有旧值」与「旧值能端给这个人」是两件事，带隐私过滤的缓存尤其如此。**有界**：`peek` 的 expired 条目 `ageMs` 无上界（键长期没人读会滞留），故 config 加 `staleMaxMs`（默认 `ttlMs*2`、`NEXUS_DISCOVER_STALE_MAX_MS` 可覆盖），超界宁可报错；降级只做**同步 peek**、不重入 `getOrLoad`（避免 SC-41 曾踩的同键 nested singleflight 自等待死锁）。**透明 + 可观测的克制**：**不污染领域类型**——返回仍是纯 `DiscoverResult`、不新增 stale 字段、不改 `route/page`、不改共享 `BoundedCache`（发现页本无"此刻"承诺，读用户照常看卡片、察觉不到降级）；**但运维必须看得见**——`DiscoverCacheStats.staleServed`（进程内累计、只增不减、不跨 reset）如实记账，经既有 `describeDiscoverCache→route→面板` 原样端出，面板加"上游故障降级"节 + `staleNote` 旁注讲清四边界（`0` 只表示"还没抖过"、**不是**"降级没开"，开关是 `staleMaxMs`，同 `null≠0` 家族）；`isKnownReadout` 纳入 `staleServed`/`config.staleMaxMs` 防画 `undefined`/`NaN s`；零新增颜色 token。**验证（不粉饰）**：内核 `discover-cache.test.ts` **+11**（正向降级/无旧值不画空/超界报错/**隐私红线** loader 内 block 本 viewer→不端+恢复后不复活拉黑前视图/**收录红线** loader 内发布→不端/隔离 block 别人→仍可端/并发 N=4 不死锁计数精确/健康路径零影响异常不吞/字段形状不变/账不跨 reset）+ 展示判据 `discover-view.test.ts` **+5** + 路由层 `admin-discover-cache.integration.test.ts` **+1**（真实降级后端到端可见、读数不打库）；SC-46 相关 7 文件（含横向门）**141 passed**；横向门 `style-tokens` **24/24**；`npx tsc -p apps/web/tsconfig.json --noEmit` **EXIT=0**；SC-45 既有判据零回归；**全仓 vitest 404 文件 passed | 1 skipped（405 total）/ 5828 测试 passed | 1 skipped（5829 total）、EXIT=0**（对比 SC-45 基线 404/5812+1 skipped，净增 16 测试；540.60s）。**首跑真信号**：展示判据首版红在**断言与文案字面不一致**（判据凭记忆编了"只读用户…"，文案是"读用户…"），非实现 bug；借机把文案改自然、判据对齐——判据断言必须来自真实文案。未改 `discover` 函数体/DB/索引/依赖/两个入口/领域类型。仍欠：共享权威 gen/epoch 存储、实例粒度 breaker/bulkhead 聚合、连接层黑洞看门狗（SC-36）、CI topology job 经真实 push、3 条既存 .mjs TS8016、SC-45 减载预案待实测。**§SC-47 探查起点（已探查未实现，见 ROADMAP）**：SC-46 stale 兜底只在 loader reject 时触发，上游**永不回答**（慢查询/连接池排队/锁等待）时等不到 reject、首屏焊死；`db/client.ts` 只有 `max=5`、DB 查询链零 deadline。但探查明**不能直接用 `Promise.race` 软 deadline**——singleflight 的 inflight 只在 `fromLoad` finally 清，race 超时后底层 hung promise 仍挂着、后续同键请求复用它一起 hang，且超时请求各起 race 会让 hung 查询堆积占满连接池、把单键慢变成全站雪崩。本轮决定**不仓促加 DB 超时**；下一步先做"loader 耗时观测"（复用 SC-45 受控时钟、只记不拦，`maxLoadMs`/`slowLoads` 进 stats+面板），用真实数字判断 deadline 是否伪需求，再决定要不要 `BoundedCache.abandon(key)` 或 Postgres statement_timeout（后者波及全站、高危）。单 main/单 worktree、无 stash/游离分支、`--no-merged` 空、无可并内容；未 push。详见 ADR-0118 / ROADMAP §SC 第四十六片与 §SC-47 探查起点。
>
> **2026-11-11 续（§SC-45 / ADR-0117，历史）**：ADR-0116 为"新作品即时进发现页"加 `globalEpoch` 段时诚实留了一句边界——**全局失效≈一次冷启动，singleflight 只合并同键不跨键，打库量随活跃 `(viewer,sort,limit)` 组合上升**。本片正面回答"要不要写个跨键并发闸门钉住惊群"，结论**反向：不写，先观测**——落 **缓存 / 数据库性能 / 数据结构（环形缓冲）/ 操作系统（背压与舱壁）/ 算法（采样 vs 锁存）/ 前端美学 / 前后端协同**。**调查三条**：①真实上界是**个位数键**——`limit` 恒 24、一次导航只请求一个 sort、匿名键 ≤4、登录键受 `maxEntries=2048`/`maxViewers=512` 与活跃人数封顶；②**已有三道天然舱壁**——singleflight 同键合并 / **DB 连接池 `max=5` 是物理硬上界**（超出的 SQL 在池里排队、压不穿库）/ 网关 `SemaphoreBulkhead`，"什么都没做"是错的；③通用跨键闸门是**净损失**——permit 泄漏、排队饿死、`inFlight` 读数失真（SC-43 已接面板）、延迟稀释 SC-44 即时承诺、**不减总 SQL**（只摊平并发、对连接池收益≈0），且**无实测尖峰证据**。**生产**：`discover-cache.ts` 加**有界失效波采集**（只记不拦、零新 DB 查询、零行为变化）——每次 `globalEpoch` 跳变记一波，采样窗口（默认 15s）内 `loadsDelta`＝`cache.stats().loads` 差值（**精确**打库数）/ `peakInFlight`＝读后瞬时 inFlight 采样最大（诚实标**非锁存**）/ `firstFillMs`＝首次真打库延迟、无人读为 **`null` 不是 0** / `settled`；读数进 `stats.waves`/`.waveConfig` → route → 面板"发布冷启动波"节原样端出。**最深的一处陷阱被判据钉死**：`getOrLoad` 是 async 但**同步段已完成 `inflight.set`/`loads++`**，若等 `await` 返回才采 `inFlight`，`fromLoad` 的 `finally` 已清掉它 → `peakInFlight` **恒 0**、把惊群谎报成"没有"；正解是 `getOrLoad(...)` 调用**后立刻**采一次 + `await` 收尾再采一次，判据"两键并发卡 gate → `peakInFlight≥2`"专钉此点。**主业隔离**：内核 `bumpEpochAndOpenWave` 先 `epoch+1` 再开波（`try/catch` 兜）；**本机写路径与远端全局帧订阅回调共用该内核**（多实例收到发布帧那台也开自己的波，否则只有发布那台尖峰可见、又一处 `null≠0` 式谎）；两次采样都 `try/catch`，观测抛错绝不破坏失效或吞 loader 异常。**有界**：`waves` 进容量 12 环形缓冲超了丢最旧、波**不跨** reset（与 `globalEpoch` 必须保留**相反**，判据同条钉死）、惰性定格无定时器。**触发阈值与减载预案（刻意未实现，留证据门槛）**：只有实测 `peakInFlight` 持续逼近 `NEXUS_DB_POOL`（默认 5）才启动，优先 O(1) 匿名 `new` 写侧预热 / 满即减载（不同键直接穿透查库、把背压交给连接池），**绝不**在应用层排队稀释 SC-44 即时可见；未实现是克制不是欠账。**面板诚实**：`wavesHeadline([])` 说"还没发布过 public 作品、是尚未触发采样，不是'测过没有惊群'"；`waveNote` 摆三道舱壁/上界/未加闸门理由/触发阈值；`firstFillMs=null` 画"窗口内无人读"不画 0ms；`isKnownReadout` 纳入 `waves`（逐波六字段、`firstFillMs` 允许 null）与 `waveConfig` 形状校验；零新增颜色 token 复用 `.gw-`/`.dc-`。**验证（不粉饰）**：SC-45 相关 6 文件 **101 passed**（内核+10/多实例+1/路由层+1/展示判据+10，对比 SC-44 的 81 净增 20）+ 横向门 `style-tokens` **24/24**（零新增 token）+ `npx tsc -p apps/web/tsconfig.json --noEmit` **EXIT=0**；**全仓 vitest 404 文件 passed | 1 skipped（405 total）/ 5812 测试 passed | 1 skipped（5813 total）、EXIT=0**（对比 SC-44 基线 404/5792+1 skipped，净增 20 测试 = 6 文件 81→101，文件数不变因只在既有文件加用例；539.94s）。未改 `discover` 函数体/DB/索引/依赖/两个入口。仍欠：共享权威 gen/epoch 存储、实例粒度 breaker/bulkhead 聚合、连接层黑洞看门狗（SC-36）、CI topology job 经真实 push、3 条既存 .mjs TS8016、**减载预案待实测逼近池上限再实现**。单 main/单 worktree、无 stash/游离分支、`--no-merged` 空、无可并内容；未 push。详见 ADR-0117 / ROADMAP §SC 第四十五片。
>
> **2026-11-11 续（§SC-44 / ADR-0116，历史）**：SC-41 留下的内容新鲜度边界——`publishProject` 后新作品最多一个 TTL（15s）才进他人发现页——正面收口，落 **Redis / 计网 / 缓存 / 数据库性能 / 前后端协同**。**最关键纠错**：不能靠 `++globalGen` 做全局失效——`globalGen` 是"给新 viewer 分配 generation 的水位线"，匿名恒 0、已缓存 viewer 读缓存值，**都绕过它**，一个现有键都失效不了。正解是独立正交键段 `discover:v1|<globalEpoch>|<generation>|<JSON>`：`globalEpoch`（内容新鲜度，public 发布/下架/rejected +1，含匿名的所有旧键一次作废）与 `generation`（§SC-41 隐私新鲜度，block/follow 只失效一人）**正交**、都跨 reset/热重载保留防旧键复活。**生产**：`invalidateDiscoverGlobally()` 本机 epoch+1 先做再 fire-and-forget 广播；三处写路径精确挂钩——`publishProject` 成功尾部（`public` 或旧版 `public`）、`unpublishProject`（撤下前是 public）、`resolveCase` 判 rejected 且那条是 public；private/unlisted 与 approved 不改收录、刻意不清（避无意义惊群）。**帧格式单向兼容**：`v:1`/频道都不动，加可选 `global?:true`+空 viewerIds；新实例收旧帧、旧实例因空数组撞护栏 fail-safe 丢弃（混部靠 TTL 收敛、升级后自动生效）；不升 v2（会切断双向互收）、不塞全站 id（撞 128 护栏）。**首跑两条真信号没放过**：①正交性判据红在"invalidate 不立即 bump globalGen、generation 是懒分配"——修正断言时机反把实现钉更准；②**下架 `RETURNING` 旧值陷阱**——Postgres `UPDATE ... RETURNING` 给的是更新后值，撤 public 时读到已是 `private`、判断永远 false、epoch 不涨，真库当场抓到生产 bug（7≠8），改"先 select 旧 visibility 再 update"，并诚实记下 select→update 的窄竞态（最坏残留一个 TTL、URL 已即时 404、不丢数据）。**诚实边界（ADR-0116，惊群是核心）**：全局失效≈一次冷启动，singleflight 只合并**同键**不跨键、打库量随活跃 `(viewer,sort,limit)` 组合上升——这是即时可见用性能换新鲜度的**预期代价、不是事故**，admin 面板 `globalEpoch` 读数让频率可见、`epochNote` 把收益与代价摆到运维眼前，根治（跨键闸门/stale-while-revalidate）属更大改动不做不假报；跨实例**全局帧丢影响整台别的实例**（viewer 帧丢只影响一人），最坏退回现状 TTL、本机永远即时。**前端联动**：`DiscoverPanel` 加"内容新鲜度的内存账"显示 epoch + 旁注，`isKnownReadout` 形状门纳入 `globalEpoch`（缺/错挡掉、不画 undefined），零新增 token 复用 `.gw-`/`.dc-`。**验证（不粉饰）**：SC-44 相关 6 文件 **81 passed**（内核+3/帧+4/多实例+4/真库端到端+3/展示判据+2/路由层既有 7，真库三条写路径各验 epoch+1+loads 增长、且发布后屏蔽名单仍不串味）+ publish/moderation/unpublish/social 回归 **46/46** + 横向门 **34/34** + `npx tsc -p apps/web/tsconfig.json --noEmit` EXIT=0；**全仓 vitest 404 文件/5792 测试 passed + 1 skipped、EXIT=0**（对比 SC-43 基线 404/5777+1 skipped，净增 15 测试 = 6 文件 66→81，文件数不变因只在既有文件加用例；542.59s）。未改 `discover` 函数体/DB/索引/依赖/两个入口。仍欠：共享权威 gen/epoch 存储（要强一致时）、实例粒度 breaker/bulkhead 聚合、连接层黑洞看门狗（SC-36）、CI topology job 经真实 push、3 条既存 .mjs TS8016。单 main/单 worktree、无 stash/游离分支、`--no-merged` 空、无可并内容；未 push。详见 ADR-0116 / ROADMAP §SC 第四十四片。
>
> **2026-11-11 续（§SC-43 / ADR-0115，历史）**：SC-41/SC-42 把发现页热读做成本机正确 + 跨实例最终一致，但 `discoverCacheStats()` 与 `InvalidationBusStats` 四账**全仓零消费者**——命中率/水位线/总线接没接上/丢没丢帧只能读代码翻日志。本片把读数接到 `/admin/discover-cache`，落用户点名的 **前端美学 / 前后端协同 / 缓存 / 数据库性能**，核心不是把数字画出来而是**把"没测到""没接上""还没人读"诚实画出来**。**生产**：只读门面 `describeDiscoverCache(): {measuredAt,stats,busAttached,busUrlConfigured}`；`GET /api/admin/discover-cache` 默认拒绝（401/403 一格内部账不外泄）+ **`no-store`**（读数带 `measuredAt`）+ **原样端出不加工**（加工就多一处把 `bus:null` 抹成四账 0）**+ 不打库**（进程内同步账，`stats.loads` 前后不变见证"问读数没变成一次发现页查询"，catch 只兜取数抛错→503）。**四条会读反就说实话的判据**（`discover-view.ts` 纯函数，沿用 `gateway-view.ts` 范式）：`busTag(null)` 单独中性一档、**不画 published/received/errors/applied 四个 0**（没接≠接了但全 0，本片最重要一句）；`hitRate(0,0)` 说"还没有读"**不画 0%**；`pollAllowed('hidden')=false` 后台暂停；`busTag(bus)` errors>0 走 warn 档+"丢帧退回 TTL"、已接也必带"最终一致非瞬时强一致"。**首跑后补严两处诚实**：①`isKnownReadout` 漏校验 `stats.config`（面板拿它做 `size/maxEntries` 分母、`ttlMs/1000` 秒数、`maxViewers` 旁注），坏回执会画 `12/undefined`/`NaN s`——补严三字段必须同时 number、`bus=null` 不被误杀；②`footNote` 的 `scope` 硬编码"每 4 秒"又末尾拼"每 N 秒"、改 `POLL_MS` 就自相矛盾——改为只从 `pollMs` 来、全句一次，判据钉"单一真值源"。**视觉零新增 token**：`/admin/discover-cache` 页（RSC `force-dynamic` 首屏取数降级 + `role=admin` 双拒绝）+ `DiscoverPanel`（4s 轮询/后台暂停/失败保留上一帧/骨架屏/KPI/总线卡/水位线旁注/页脚），全复用 §SC-40 `.gw-` 原语只补 `.dc-*`，颜色间距圆角阴影全走既有 `var(--nexus-*)`、状态色只染圆点与左边条文字用中性 `fg-*`、reduced-motion 归零、零 CSS Module；`AdminNav` 加入口。**验证（不粉饰）**：展示判据 18/18 + 路由层真库集成测 7/7（打真库不 mock `currentUserOrNull`，只 mock cookie 读；bus 已接用 `fakeBus` 注入替身不连真 Redis）+ SC-41/42/43 相关 6 文件 66/66 + 横向门 29/29 + `npx tsc -p apps/web/tsconfig.json --noEmit` EXIT=0 + **全仓 vitest 404 文件/5777 测试 passed + 1 skipped、EXIT=0**（对比 SC-42 基线 402/5752+1 skipped，净增 2 文件/25 测试 = 18 判据 + 7 路由层，吻合；517.88s）。**诚实边界**：只这一台实例的进程内账、多实例各算各的（页脚明说）；`busAttached` 只是"线路此刻挂着"≠"全集群都收到帧"（pub/sub 无订阅者名册、会丢帧，ADR-0114 边界原样成立）；`measuredAt` 与"更新于"是两个时刻分别标不混用；首屏失败与 503 都不画全 0 假账；不设 `NEXUS_REDIS_URL` 的"未接总线"是**默认正确形态**不是待修事故。未改 `discover` 函数体/DB/索引/依赖/两个入口。仍欠：publish 即时进发现页、共享权威 gen 存储、实例粒度 breaker/bulkhead 聚合、连接层黑洞看门狗（SC-36）、CI topology job 经真实 push、3 条既存 .mjs TS8016。未 push。详见 ADR-0115 / ROADMAP §SC 第四十三片。
>
> **2026-11-11 续（§SC-42 / ADR-0114，历史）**：SC-41 诚实留下的最大边界——**跨实例缓存失效**——正面接上，落 Redis 运用 + 计网（发布订阅/最终一致）+ 缓存。**取舍**：pub/sub 广播失效（写路径发一帧、各实例 bump 本地 `globalGen` 派生键、**热读零网络**）**胜过**共享 generation 存储（后者给每次发现页渲染加一跳 Redis GET、把缓存可用性绑死 Redis，推翻 ADR-0113 立论）。**生产**（新增 `server/domain/invalidation-bus.ts`，`discover-cache.ts` 加可选 bus）：三段严格分离——`invalidateDiscoverFor` 本地 `bumpLocal` **永远先做**（fail-open 最后一道）再 `bus?.publish(ids)`（同步 void、不 await/不抛/不阻塞写库），远端帧走**同一个 `bumpLocal`**（内核共用不漂移），`loadDiscoverCached`/`keyFor`/`generationFor` **一行未动**；bus 缺省（不设 `NEXUS_REDIS_URL`）= 与 SC-41 完全相同。双连接骨架复用 `redisBus.ts`（发布侧不排队/单次重试、订阅侧排队/无限重试、构造即订版本频道、origin 回环去重、线路字节过 `parseInvalidationFrame` 条数/长度护栏、常驻 error 监听、`dispose()` 用 `disconnect()` 防 vitest 退出 hang、publish `.catch()`）。globalThis 单例 + `resetDiscoverCacheForTest({bus})` 注入 + 异步建连脏写防护 + 重建前退订；测试工厂 `createIsolatedDiscoverCacheForTest` 造同进程双 store 且**复用生产同一套内核不复制逻辑**。**三版判据（隐私正确性不压在会丢帧的网络上）**：线路/驱动 10/10（假连接）+ **跨实例语义主路径 9/9（内存 hub 双 store）** + 真 Redis 往返 1 条 opt-in（默认 skip）；连 SC-41 既有 16+6 = **41 passed + 1 skipped**，typecheck **14/14**、**全仓 vitest 402 文件/5752 测试 passed + 1 skipped、EXIT=0**（对比 SC-41 基线 400/5733，横向门全过），SC-41 单机语义零回归。**真 Redis 实测（不假报）**：设 `NEXUS_DISCOVER_BUS_LIVE=1` 实跑一次，两实例经 56379 互通、B 的 gen bump 并重查、线路读数 published≥1/received≥1、**328ms 干净退出不 hang**；默认 0 真连接、0.86s skip。**首跑真信号**：多实例判据首版两条不诚实（访问私有 bus 字段、标题承诺却被自认"无脏写可观察"），改用公开 stats 观察 + 重写为可观察判据，判据标题必须真被证到。**诚实边界**：**最终一致非强一致**——pub/sub 丢帧/重连窗口内对方最坏多用一个 TTL（15s）旧 gen 后自愈，拉黑全集群瞬时生效**不是**承诺（要强一致得共享权威存储、代价热读一跳 Redis，已否决）；权威状态在库、帧丢不丢数据；`stats().bus` 只数本实例、查不到远端订阅者名册；混合部署没设 env 的实例靠 TTL 收敛。仍欠：共享权威 gen 存储、命中率/bus 读数进 admin 面板、publish 即时进发现页、实例粒度 breaker/bulkhead 聚合、连接层黑洞看门狗（SC-36）、CI topology job 经真实 push、3 条既存 .mjs TS8016。未 push。详见 ADR-0114 / ROADMAP §SC 第四十二片。
>
> **2026-11-11 续（§SC-41 / ADR-0113，历史）**：SC-40 探针留下的独立片正面收口——发现页热读 `discover()`（RSC `/discover` + route `/api/discover`，`force-dynamic` 每次导航重跑、此前无任何缓存）**第一次按 viewer 分键缓存**，把用户点名的 **缓存 / 数据库性能 / 数据结构与算法 / 前后端协同** 落在"缓存一个随 viewer 私有关系而变的结果"这个真难点上。**生产**（薄包装、单向无环、**未改 `discover` 函数体/DB 查询/索引/依赖**）：新增 `server/domain/discover-cache.ts`，键 = `discover:v1|<generation>|<JSON([viewerId??null,sort,limit??24])>`（JSON 编码防碰撞），复用 ADR-0112 的 `BoundedCache`（有界 TTL+LRU+singleflight；`maxEntries` 2048 / `maxViewers` 512 / TTL 15s，三个 `NEXUS_DISCOVER_CACHE_*` env 可调，单例挂 globalThis），**只 `import type` social**、loader 由 `social.discoverCached` 闭包注入 → 无环；singleflight 按完整键合并：不同 viewer 永不合并（否则即串味）、同 viewer 并发只打一次库。`social.toggleFollow` + `blocks.{setBlock,clearBlock}` 三条**真写路径即时失效**（O(受影响 viewer 数)、无前缀扫描；block 还拆双向关注故连 target 一起失效）——**隐私新鲜度靠主动失效、不靠 TTL**，TTL 只管公有内容（新发布/计数/trending）别太陈旧。**本片方法论核心（写进 ADR-0113）**：generation 若按「每 viewer 从 0 起 + LRU 淘汰」实现，viewer 被淘汰后重置为 0 会**命中它拉黑前的旧缓存、悄悄撤销隐私过滤**；根治用**进程级单调递增水位线 `globalGen`**（跨淘汰/跨 store 重建都不归零），重新分配到 generation 严格大于历史值，旧键永久拼不出来、最坏多查一次库，判据 `maxViewers=2` 强制淘汰钉死"绝不复活 C_before"。**验证（不粉饰）**：纯单测 16/16（键三维/防碰撞/匿名共享/singleflight 跨 viewer 不合并/写后即时失效/淘汰串味陷阱/水位线只增/受控时钟 TTL/双有界）+ 真库集成测 6/6（打真 Postgres、禁 mock：两 viewer 经 `discoverCached` 仍互不串味、三条真写路径即时失效、`stats.loads` 增量证明命中不打库）+ 回归既有隐私套件与网关判据 55/55 + `npm run typecheck` 14/14 + **全仓 vitest 一次全绿 400 文件/5733 测试 passed、EXIT=0**（横向门 route-security/doc-evidence/style-tokens 全过）。**首跑真信号**：真库"降载"用例首版超时 90s——夹具错在 `discoverCached` 外又套 `loadDiscoverCached` 同键嵌套 singleflight 自等待死锁（**测试夹具 bug 非生产路径**），改直走 `discoverCached` + `stats.loads` 后 6/6、8s。**诚实边界**：进程内缓存，多实例各实例不共享，B 实例可能持有该 viewer 最多 15s 旧视图（跨实例即时一致需 Redis 广播失效，本片不做、不假报）；`publishProject` 后新作品最多 15s 才进他人发现页。**流程查证（纠正探查）**：CI ADR 索引门只扫 `docs/decisions/[0-9]*.md`（55 个全已索引、GATE_EXIT=0）、**不扫 `docs/adr/`**，故 0101–0112 从没登记 README 仍绿，本 ADR 按惯例不动 README。仍欠：跨实例共享失效、publish 即时进发现页、发现页缓存命中率进 admin 面板、实例粒度 breaker/bulkhead 聚合、连接层黑洞看门狗（SC-36）、CI topology job 经真实 push、3 条既存 .mjs TS8016。未 push。详见 ADR-0113 / ROADMAP §SC 第四十一片。
>
> **2026-11-11 续（§SC-40 / ADR-0112，历史）**：网关三份运维读数 `/platform/{routes,services,health}`（SC-29→39 产出）**第一次接到前端**——此前全仓零消费者，`admin/observability` 只看得到 web 自己的进程计数器。这一条纵切把用户点名的 **Redis / 计网 / 算法 / 数据结构 / 前端美学 / 前后端协同 / 缓存**各自落在真实坏法上，不是堆砌：**纯 TS 门面 `apps/web/src/server/gateway/`**（零新依赖、全部可注入判据）＝手写归一化（读不出≠有）+ 全抖动退避（防惊群）+ 有界 TTL/LRU/singleflight（防注册中心外部可控键撑爆内存、防 N 个 admin 把 health 扇出打 N 遍）+ `AbortSignal.timeout` 与只重试该重试的（4xx/坏形状不重试）+ `allSettled` 并发扇出 + 失败降级不画 0；`snapshot.ts` 按 `lb://<service>` 抽出的 service id 三表 join，错处（注册了没路由 `unrouted`、有路由没注册 `dangling`、DOWN/UNKNOWN 分列）才是价值，**没测到的列画 `null` 不画 0**，三列 measuredAt 各不同如实登记"非原子快照"。Redis opt-in（`NEXUS_REDIS_URL` 同旋钮）、懒接、fail-open 回进程内。**前端** `/admin/gateway` + `GatewayPanel`（4s 轮询 + 后台标签暂停 + 失败保留上一帧 + 骨架屏 + KPI + 状态灯 + gap 清单 + 三列时刻条），视觉层并入 `globals.css` 的 `.gw-` 类：层次/光晕/呼吸全从已定义 token 派生、**零新增颜色 token**、状态色只染圆点不染文字（浅色也过 AA）、`prefers-reduced-motion` 全归零；展示判据抽 `gateway-view.ts` 纯测不渲染。**诚实边界**：Redis 共享缓存 `ageMs` 近似（以 measuredAt 为准）；`discover()` 热读无缓存但依赖 viewerId、全局缓存会串味，探针定位后记为下一条独立片（本轮没连真库、没 `EXPLAIN ANALYZE`，不凭空加 DB 索引）；`typecheck:main` 聚合命令 3 条 `docs/evidence/**/*.mjs` TS8016 经 `git show HEAD` 核实既存、非本轮，日常门 `npm run typecheck` 14/14。验证：新增 44 判据 + 横向门 = 前端 **116/116**、typecheck **14/14**、网关全套 Java **116/116 BUILD SUCCESS 无 fork 告警**（本轮零 Java 改动做全仓回归）；未 push（main 领先 origin/main 59）。仍欠：discover 按 viewer 分键缓存、实例粒度 breaker/bulkhead 聚合、连接层黑洞看门狗（SC-36）、CI topology job 经真实 push、3 条既存 .mjs TS8016。详见 ADR-0112 / ROADMAP §SC 第四十片。
>
> **2026-11-11 续（§SC-39 / ADR-0111，历史）**：网关路由表第一次**可读**，且**绝不把写面一起交出去**。此前 breaker / bulkhead / registry 都有运维读数，唯独「此刻生效的是哪几条路由」只能读 `GatewayConfig` 源码。新增只读控制器 `GET /platform/routes`，注入与路由管线**同一个** `RouteLocator#getRoutes()`（刻意不用 `RouteDefinitionLocator`——编译期 Java DSL 路由从不注册 `RouteDefinition`，读它会得到空的谎话），只报稳定字段 `id`/`uri`/`order`；`uri`（`lb://<svc>`）与 breaker/bulkhead 读数共享同一 service-id 命名空间。**两个安全决策被第一次坐实成可观测事实**：①探针 + 反编译证明官方 `/actuator/gateway` 是 `@RestControllerEndpoint(enableByDefault=false)`、带 save/delete/refresh **写操作**，误开即路由注入写面，**绝不启用**（exposure 单独开不了它，全 404，测试钉死）；②注册中心 advertise 三服务含 `rogue-service`，读数恰两条命名路由且 `/rogue-service/**` 404 / `rogue.wire=[]`——`GatewayConfig`「有意不开 discovery locator」从 SC-1 的注释变成 wire 事实（受控启用会逼我们把编译期 DSL 复制成运行时字符串配置、制造第二套漂移真值源，故不推翻）。**诚实边界**：predicate/filter 是编译后函数对象，连 Spring Cloud 官方端点都只能 `toString()`，本读数不伪造路径模板/filter 列表；「registry 有而读数无 = 无路由」写成恒真陈述。auth-on 无 token 401 / 带 token 200 / health 开放，既有 `PlatformAuthFilter` 零改动覆盖新 controller。验证：定向 6/6 ×3 轮、网关全套 **116/116 BUILD SUCCESS**（两次独立全套、context 封顶后无 fork 告警）、typecheck 14/14；未 push（main 领先 origin/main 59 前）。仍欠：按实例粒度 breaker/bulkhead 聚合、连接层黑洞看门狗（SC-36）、CI `topology` job 经真实 push。详见 ADR-0111 / ROADMAP §SC 第三十五片。
>
> **2026-11-11 续（§SC-37/38，历史）**：Spring Cloud 弹性四件套收口 + 一个被揪出并根治的测试基础设施缺陷。
> **§SC-37 / ADR-0109（Bulkhead）**：反编译推翻了「Bulkhead 没接」的前提——Spring Cloud reactive 断路器**早就**在每条 route 套了 `SemaphoreBulkhead`（`ReactiveResilience4jBulkheadProvider` auto-config 默认注册，默认 25 并发），只是沉默、无配置、无读数、无 wire 证明。本片把它**显式化**：`application.yml` 两后端各声明 `bulkhead.instances.<svc>.max-concurrent-calls=${NEXUS_GATEWAY_BULKHEAD_MAX_CALLS:25}` + `max-wait-duration:0`（满即减载、不排队），默认仍 25 故行为不变，变的是「谁决定这个值」。新增 `GatewayBulkheadWiringTest`（确定性 `StubUpstream.holdNext/awaitHeld` 占用夹具 + 非阻塞 `WebClient`）钉：满时诚实 503/`cause=BulkheadFullException`、拒绝**在 wire 之前**（不放大）、breaker 全程 CLOSED（容量减载 ≠ `CallNotPermitted` 后端故障）、释放后自愈；actuator 暴露 `bulkheads` 并**诚实记边界**（resilience4j 2.2.0 只给名字列表、`/{id}` 404、无实时并发数）+ auth-on 保护。此前判「并发易 flaky」靠的是 `sleep` 碰运气重叠，今换成 `CountDownLatch` 确定性握手，缺口正面关掉。
> **§SC-38 / ADR-0110（响应中途断开 + context 缓存根治）**：补后端故障第四种形状——`200+headers+部分 body` 后断流。探针实测 caller 得**连接级** `PrematureCloseException DURING response`、**从不**收到截断的成功 200，GET/POST wire 恒 1；`GatewayTruncatedResponseWiringTest` 把它变 wire 不变量，**不改生产**（网关已正确）。诚实边界：caller 看到连接异常而非干净 503，因 200 头已提交（`already committed`），要 503 需全量缓冲 body 的更大改动。**关键基础设施修复**：加 4 个 `@SpringBootTest` 后全套连跑三次**各红一条不同的既存测试**（含 actuator `/actuator/health` 报 503、`ServiceHealthProbeTest` UNKNOWN）+ 稳定 fork 退出告警，但各自单独稳定；对照实验（排除新增类→BUILD SUCCESS）定位真凶＝**21 个 RANDOM_PORT context 全常驻默认 `maxSize=32` 缓存、挤爆 `-Xmx512m` fork**。治本：surefire argLine 加 `-Dspring.test.context.cache.maxSize=4`（属性名字节码核实）让 Spring 淘汰最久未用 context，常驻数不再随测试类增长；代价全套耗时升到 ~3:06，换确定性。顺带把两条被压力揪出的既存过紧断言改语义等价的稳健形式（`awaitPathsAtLeast` 等 floor 再钉上界；domain 腿 `isEmpty`→`doesNotContain(domain 路径)`），**不放宽**。
> **验证**：网关全套 `mvn -o -B test` **110/110 BUILD SUCCESS**（context 封顶后三次独立全套，fork 告警消失；封顶前三次各红不同既存测试），顶层 `npm run typecheck` **14/14**。整仓 eslint 仍是本机内存超时边界（非 lint 报错，本轮零前端文件），如实记。git 开工复核：单 main、无游离分支/worktree/stash、`--no-merged` 空，**无可并内容**；main 领先 origin/main 56（本轮提交前），未 push（无明确指令）。仍欠：多实例 breaker/bulkhead 聚合、连接层黑洞独立看门狗（SC-36）、CI `topology` job 经真实 push 执行。细节见 ADR-0109/0110 与 ROADMAP §SC 第三十三/三十四片。
>
> **2026-11-11 接上须知（历史）**：Spring Cloud 断路由 §SC-28 又向前一段——§SC 第二十五片 /
> ADR-0101 给网关断路由补上了 **HALF_OPEN 闭合回路**：后端恢复能自愈（自动半开→探测成功→CLOSED→
> 流量重新放行）、后端仍坏能被重新屏蔽（探测失败→回 OPEN）。三条从写下起从未被证明的 HALF_OPEN
> 生产设置第一次有 wire 级判据。新增 `GatewayCircuitHalfOpenWiringTest`，网关全套 **64/64**
> （基线 62+2）。桩件 `StubUpstream` 加了可恢复断连 `startDropping`/`stopDropping`。首跑如实红过一次
> （负向腿把「一次逻辑调用」误当「一次 wire 失败」，retry 使其不等价），已改为测平台语义而非库计数，
> 细节与retry/fallback 的 `ServerHttpResponse already committed` 已知边界记在 ADR-0101 与 ROADMAP 第二十五片。
> 本轮开工复核：`git worktree list` 仅 main、无游离分支/stash、`--no-merged` 为空，**git 侧无可并内容**。
> 未推送（无明确指令）。
>
> **2026-11-11 续（§SC-36 / ADR-0108）**：给共享限流器装了**网关自持的命令阶段 deadline**——
> `RedisRateLimitBackend.tryAcquire()` 叠 `.timeout(backendTimeout)`（`nexus.gateway.rate-limit.backend-timeout-ms`，
> 默认 1000ms，构造器 fail-closed 拒绝非正值），把「backend 连上却永不回」在 deadline 上变成 error，交回 SC-12
> 原有 fail-open 链；不改 `RateLimitFilter`。命门是 `onErrorResume` 从前提（backend 最终产生 error）变成承诺。
> **三次一次性探针推翻了初始「全形态自持硬上界」方案，故诚实划界**：真实 Lettuce **connect 阶段**黑洞下
> `.timeout(400ms)` 没先触发（等了 3-4s，由 Lettuce `connect-timeout` 兜底——Reactor timer 中断不了 connect 订阅）；
> 第三支对比探针在清理阶段 hang 住 JVM 退出，主动 kill、不作证据。`.timeout` 真正守的是**连接已建立后命令永不回**
> 的形态（探针① `Flux.never()` 确定性等价）；两者是分工，绝不假报「全形态硬上界」。双判据：单元
> `RedisRateLimitBackendTest` **8/8**（never→界内 TimeoutException、上界可配置、非正值拒绝构造）+ wire
> `GatewayRedisBackendTimeoutWiringTest` **1/1**（受控 `Flux.never()` 经真实过滤器链：门不焊死诚实 200、穿后端
> 恰 1、告警不静默、无 hang，日志坐实 `TimeoutException ... within 400ms in 'map'` 触发 fail-open）。与 SC-35
> 真实 connection-refused 构成完整故障谱。**仍欠**：连接层黑洞的独立看门狗（消除 connect 阶段对 Lettuce 的依赖，
> 属更大生产改动）。详见 ADR-0108 / ROADMAP 第三十二片。
>
> **2026-11-11 续（§SC-35 / ADR-0107）**：共享限流器（`redis` 后端）的 **fail-open** 承诺第一次在
> **真实 Lettuce 连接失败**上被测——此前只有 `RateLimitFilterTest` 的 mock `Mono.error` 单测。配
> `backend=redis` 指向端口 1（无监听、确定性 connection-refused），一次性探针 3 轮实测：caller 全 **200**、
> 后端 stub wire 全 **1**、耗时 **1205ms→22ms→19ms**（首轮冷 Lettuce 失败+重试、失败缓存后快速失败），
> 日志 `backend 'redis' failed; request allowed unthrottled (fail-open): RedisConnectionFailureException`，
> 3 轮故障仅 1 条 WARN（10s 节流）。新增 `GatewayRedisFailOpenWiringTest`（1 条 × 5 轮）钉三条不变式：
> **门不关**（每轮诚实 200）、**请求真穿到后端且只 1 次**（不放大）、**告警被记不静默**（OutputCapture 钉
> 至少一条含 `fail-open`+`redis` 的 WARN）。**刻意不 pin** 浮动耗时（只设 8s 宽松上界兜真 hang）、日志精确
> 条数、异常具体类名。**诚实缺口**：`RedisRateLimitBackend.tryAcquire()` 无显式 `.timeout`，依赖 Lettuce
> 自身超时；blackhole 型依赖的精确延迟未测，显式硬上界是生产改动、另立片评估，本片不越界。**不改生产**
> （SC-12 契约成立）。网关全套 **93 → 94/94**，typecheck 14/14。细节见 ADR-0107 与 ROADMAP §SC 第三十一片。
>
> **2026-11-11 续（§SC-34 / ADR-0106）**：重试 `setExceptions` 的**第二半 `TimeoutException`**
> （后端连着、只是慢到超过 timelimiter）第一次上 wire——resilience4j 四件套里 `timelimiter` 曾是唯一无
> 独立判据的一块，`application.yml` 的 `timeout-duration` 写下起被当背景参数 override。新增
> `GatewayTimeoutWiringTest`（3 条）：**慢 POST × 5 轮 wire 恰 1**（超时路径写也不被重放）、**慢 GET × 5
> 轮 wire∈[1,2]** 诚实 503、**cause 精确 `java.util.concurrent.TimeoutException`**（补强
> `GatewayRoutingTest` 那条 `isNotEqualTo("not-reported")` 弱断言，刻意不改旧测试）。一次性探针先实测：
> **首轮 wire 读成 POST 1,0,0,0,1 / GET 0,0,0,1,0，抓到会说谎的桩**——`HttpServer` 默认**串行**分派，
> 慢请求占住唯一线程后后续进不了 `handle()`，wire 假读 0（真重放也会假绿）。加 `StubUpstream.startConcurrent()`
> （cached pool，**默认 `start()` 一字不动**保既有 90 测试语义）后重测 POST 1,1,1,1,1 / GET 1,2,2,2,2、
> status 全 503、cause 全超时，才是对网关的真实测量。查 `resilience4j-timelimiter` 源码订正：超时抛的就是
> `java.util.concurrent.TimeoutException`（`GatewayConfig` 引的类，异常触发源是活的），叠加 §SC-33 已证的
> `return retryableMethod` 门 → 慢写恒 1 是必然。**刻意不 pin** GET 单轮精确 wire（1/2 是 retry 与 fallback
> 抢写响应的调度竞争，与 ADR-0101 同源）；**不改生产**（无缺陷可修）。工程教训：`HttpServer` 默认串行，
> 凡用 `delay`/长 sleep 又断言 wire 的测试必须在并发桩上跑。仍欠：响应中途断开。
>
> **2026-11-11 续（§SC-30 / ADR-0102）**：网关又补一个 Spring Cloud 元素——**W3C Trace Context**
> （`traceparent`/`tracestate`），与 §SC-14 私有 `X-Request-Id` 并存、各司其职。新增 `TraceContextFilter`
> （ORDER +21，紧跟 correlation +20）：合法入站保留 trace-id/flags 但**换 parent-id**（网关是一跳，原样
> 转发会让整链共用一个 span id），缺失/畸形重新 mint，`tracestate` 逐字透传，provider-free 不采样不导出。
> 新增 `TraceContextFilterTest` 5 + `GatewayTraceContextWiringTest` 4，网关全套 **73/73**（SC-29 的 64 + 9）。
> 首跑红 3 条是测试桩真 bug——`StubUpstream.clearPaths()` 没清 `requestHeaders` 致跨测试读到上一条的请求，
> 已修（记录型集合共生命周期）。Bulkhead 本轮**未接**：其依赖在 gateway 是 runtime scope、并发断言本机易
> flaky，理由与缺口记在 ROADMAP §SC 第二十六片。
>
> **2026-11-11 续（§SC-33 / ADR-0105）**：重试的**第二条触发源**（`setExceptions(IOException,
> TimeoutException)`，后端连接层直接断、不回 503）第一次被测到——此前只有 `setStatuses(503)` 那条有
> wire 判据，而连接重置/进程崩溃恰是最常见真实故障。一次性探针 5 轮实测：**dropped POST wire 恒 1**
> （5/5，写从不被重放）、dropped GET wire 2/1/2/1/2 浮动、status 200/503 浮动。查 `reactor-netty-http`
> 源码订正初判：`PrematureCloseException extends IOException`，故异常触发源是活的；再查
> `RetryGatewayFilterFactory.RetryConfig` 确认 status 与 exception 两条谓词**都套 `setMethods(GET)` 门**，
> 写安全是必然。`GatewayRetryTransportWiringTest`（2 条 × 6 轮）钉住**写永不被重放（wire 恰 1+诚实 503）**
> 与**重试不放大（GET wire≤2、答复必 200/503）**；**刻意不 pin GET 单轮的 wire/status**（filter 抢写响应
> 时序浮动，与 ADR-0101 的 `already committed (503)` 同源，延续「不改生产 route 语义」决定）。桩件新增
> 有界自愈断连夹具 `dropNextConnections`。网关全套 **88 → 90/90**，typecheck 14/14。仍欠：超时型故障、
> 响应中途断开（时序易浮动，需另造不 pin 的判据）。细节见 ADR-0105 与 ROADMAP §SC 第二十九片。
>
> **2026-11-11 续（§SC-32 / ADR-0104）**：两扇认证门（`AuthFilter` 路由 edge + `PlatformAuthFilter`
> 网关自身端点）**从两份复制的拷贝折叠成单一真值源 `AuthPolicy`**：一份白名单、一个「exact 或整路径段」
> 匹配 `isOpen()`、一个 fail-closed `requireSecret()`、一个 401 方言 `refusalBody()`，两门与
> `GatewayConfig` bean 全部委托。**修掉两个真缺陷**：裸 `startsWith("/fallback")` 把 `/fallbackish`
> 也放行（§SC-27 洞的同类变体）、`AuthFilter` 构造器不检查空白 secret 而 `PlatformAuthFilter` 检查。
> 过去「keep the two whitelists in sync」只是注释，现由**双锁**保证：`AuthWhitelistParityTest`（4 条，
> 两门判定/401 body 逐字一致）+ `AuthPolicyTest`（6 条，钉真值源段边界本身，防「两门一起漂移 parity
> 仍绿」）。网关全套 **78 → 88/88**（SC-31 基线 78 + 10），typecheck 14/14；首跑红 2 条从生产语义修，
> 未放宽断言。细节见 ADR-0104 与 ROADMAP §SC 第二十八片。
>
> **2026-11-11 续（§SC-31 / ADR-0103）**：breaker 状态从「只有测试能读」变成**运维读数**——
> `application.yml` 的 `exposure.include` 由 `health` 加到 `health,circuitbreakers`（resilience4j 自带端点，
> 零生产 Java 改动），把 §SC-24/§SC-29 的 OPEN/自愈第一次经 `/actuator/circuitbreakers` 对外可见，
> 并与 `CircuitBreakerRegistry` 真值对账。**刻意不进 auth 白名单**：auth 开着时需 token（无 token 401 /
> 带 token 200，health 仍开放），已由 `CircuitBreakerActuatorAuthTest` 验证 WebFilter 确实覆盖 actuator
> handler（§SC-27 陷阱的变体），暴露端点不开洞。新增 2 个测试类共 5 条，网关全套 **78/78**（SC-30 的 73+5），
> **首次尝试全绿**（先探针实测 JSON 形状再写断言，没猜字段）。多实例聚合未做（各实例各报各的）。

第 3 行下面的所有旧读数中，凡提到 Java 侧测试数的，以 2026-11-10 的为准：**java-domain-service 103/103**
（含新增 BillingControllerTest 7 + PermissionControllerTest 6）。最新一片（§SC-16 / SC-23）详见
`docs/ROADMAP.md` 末尾与 `docs/evidence/sc23-permission-live-proof.md`：

- Permission HTTP 面（`GET /api/v1/permission/check`）已上线并经 `lb://nexus-domain-service` 活体验证；
- **第一次调用真 503**（gateway 5s 上限 vs domain 冷启动）——设计行为，不是 bug；首先由 smoke 预热绕开（§SC-17），随后由 boot 预热对齐到服务端（§SC-18 / ADR-0099，`WarmupRunner`，users=4193）彻底关闭；
- `npm run verify:lb`（`scripts/verify-loadbalance.mts`，§SC-26）：一个 service id 两个域实例 +
  registry/gateway，断言 eureka 持两个、`/platform/services` 列同一 id 两个不同地址、
  `/platform/health` 两者皆 UP（allUp=true）、十连发 200——**LB 的多实例拓扑被测量过了**；
- `npm run verify:topology` 现覆盖**五个**服务（registry / **nexus-config** / domain-service /
  nexus-api / gateway），`NEXUS_*_PORT` 与 DB 侧全可覆盖、stale jar 自动重打包、逐条断言
  community/billing/permission 三面、`/platform/services` discovery 读数，以及 **config server
  往返**（两个后端无 env register 标志也入库；网关启动日志 `ratePerSecond=50.0`）；
  证据 `docs/evidence/sc24-nexus-api-live-proof.md` 与 `sc25-config-roundtrip-live-proof.md`；
- 主线 CI 新增 `topology` job（`.github/workflows/main-line.yml`）：打包三服务 + migrate + `verify:topology`，
  **首个 push 前未经 CI 实跑**——红则为真信号；
- `:8090` 被本仓之外的进程（PID 39424，`com.nexus.NexusApplication`，classpath 指向已不存在的
  `services/platform/target/classes`）占用——功能验证已在 `:8091` 上完成，**未杀该进程**；
- **注册中心默认端口已迁到 8771（2026-11-10，ADR-0100）**——8761 被本机另一项目（`D:\3a大作`）的
  Spring Cloud 栈占用（其 config-server 心跳进来，registry 日志可考）；本仓库的 registry 与所有服务的
  `defaultZone` 现在默认都指向 8771，`/platform/services` 读数只列出本仓库服务；
- **网关自己的地址簿此前公开可读**（§SC-27）：`/platform/services` 无 token 答 200——`GlobalFilter` 不覆盖网关自己的 controller。已修：`PlatformAuthFilter`（WebFilter），同白名单同 secret；修复后本机活体验证 12/12 PASS；**顺带抓到并修了 `@Component` 双构造器导致的 boot 崩溃**（`BeanInstantiationException`）——standalone 单测抓不到，因此新增 `PlatformAuthWiringTest`（真实 wiring 上下文）；
- **CI 的 topology job 现在有三个冒烟步骤（topology / lb / auth），全部从未被 push 真实 CI 执行过**——首个 push 会一次性裁判它们；
- 冒烟 spawned JVM 已加 `-Xmx` 上界（domain 512m / 其他 384m，`NEXUS_SMOKE_HEAP[_DOMAIN]` 可覆盖）；本机内存枯竭的窗口里 `ServiceHealthProbeTest` 曾三条断言变 UNKNOWN——对照实验证实非本次改动、恢复后 4/4 全绿；
- 2026-11-10 起 `npm run eslint` 是"真·0 错误"（此前一例是配置崩溃导致的假绿），见 ADR-0098。
- **断路器 OPEN 态现有 wire 级判据**（§SC-24 / `GatewayCircuitOpenWiringTest`）：4 次后端 refusal（滑窗 4、
  阈值 50%）→ 第 5 次调用被 fallback 直接拒（cause=`CallNotPermitted`，stub 没有收到新请求）——
  一个 breaker 的"快速失败"从此不是一种配置，是一个被读数钉住的事实；
  此前 `GatewayRoutingTest` 只覆盖了"breaker 开火"，没覆盖"开路后失败快"。

## 评测（§85）

`npm run evals` 返回 0（退出码）：

| 套件 | § 维度 | 读数 |
|---|---|---|
| `code-index` | §69 Code Index 检索 | 19/19 |
| `model-roundtrip` | §16/§19 投影自洽 | 13/13 |
| `export-roundtrip`（需 `NEXUS_DATABASE_URL`） | §144 导出保真 | 17/17 · 55100 regress 实例实测 |
| `video-plan` | §40-42 视频投影 | 30/30 |
| `world-build` | §44/§46/§140 世界模型 | 55/55 |
| `schemas-contract` | §6 边界纪律 | 17/17 |
| `game-build` | §54/§51 游戏设计系统 | 36/36 |
| `design-build` | §12/§13 design-model 投影 | 46/46 |
| `project-bundle` | §16/§159 集大成合成 | 14/14 |
| `local-embedding` | §49 本地 token-bag 语料检索（确定性） | 14/14 |

**合计 276 / 276 PASS**（不含 needsDatabase 的 `export-roundtrip`：那一项 `npm run evals` 在 env 已设时跑、不设则打印 `SKIP` 退出码不变，CI 安全）。

真库首跑读数（仍以 `npm run evals:baseline` 验）：recall@5 = 100% / MRR = 0.786 / 代码往返 5/5 干净 / 无障碍 4/4 检出 / 渲染后页面 axe 违规 0 条—— `docs/EVALUATION.md` 第十五片起。

不成文：**CI 注入 `POSTGRES_CONNECTION_STRING` 即可在 `npm test` 之前自动多跑一遍 `export-roundtrip`**。

## 测试

`npx vitest run --shard=1/2` / `npx vitest run --shard=2/2` 全绿：

- shard 1 + shard 2（2026-11-09 06:35）：合计 272 files / **3590 tests**

证据日志入库（`scratch shard*-2026-11-09c.log`，已 `git add -f`），见 `docs/TESTING.md` 2026-11-09 那条。

## 关键 ADR

`docs/adr/0093-eval-runner-deterministic-invariants-in-ci.md`：§85 判决门——结构不变式红即
`exit 1`，阻止合并；判断题（RAG/设计精度/Visual）不上自动门。

## 已经合入主干的另一会话成果（无许可主动删不动）

- 两条线合入一个分支后的内容，全部是两侧原子的整个体系（无内容被裁剪，无证词被改写）。
- `8179208`：`apps/web` 确定性本地 embedding provider（§49），环境变量 `NEXUS_EMBEDDING_PROVIDER=local` 显式 opt-in，测试 13/13 绿；不存在没有 provider 时告随便的行为，同一个模型档在 `model_for` 上自报家门。`evals` 第十套 `local-embedding 14/14` and 第十一套 local-reranker 15/15 in the matrix (276/276)，`.github/workflows/main-line.yml`（`cf1537e`）让结构不变式进了 CI。
- `cf1537e`：新增 `.github/workflows/main-line.yml`，主线的 `typecheck:main` + `evals` 决定性结构不变式进了 CI（ADR-0093），针对 `pgvector` 容器跑 `export-roundtrip`（无库时打印 SKIP 且退码保持不变）。
- 其余动作都在 `docs/evidence` 里按 amendment 568（v641）记录：id 568 已授予。

另一位智能体在 `main` 上的提交我负责接下来：
- `f14fe2a` §147 选中响应回归测试（已随 my commits 入 main）
- `8e0335c` §85 公开作品页 × 浅色 axe
- `9b0b278` §85 收起面板的 axe + `control-names` 扩扇 text-like
- `62563e6` 跨模型同进程 store 持有不互覆盖
- `f604d13` 两片全绿记账
- `18228f0` agents doc 层面更新
- `3638076` TESTING.md 九套真实 check 数
- `0364995` EVALUATION.md 头部九套顺序对上 §图谱

## 已知卡口

- **Video / Image Studio 真像素**：`apps/ai-service/src/ai_service/adapters/` 没有注册任何真 provider——本机没有 key，故走 DEMO MODE
  （prompt 哈希 + 原色板代换 + 布局对齐的本地构图），UI 常驻 DEMO MODE（§159/§160）。
  §105 真 provider 接入只需：用户给 key → 在 `ai_service/adapters/` 增加一个适配器 → `POST /generate_image` / `POST /generate_video` 走真路径。
- **PGVector 混合检索**：未接入（§49/93 仍是 `[~]`）。

## 本仓与工作树

- 2026-11-09 已把两条平行线（studio 线 `master` 与 main 线 `main`）合并成一条：`origin/master` == `origin/main` == 本地 `master`，工作目录不再是单行。
  - Studio 线的 `packages/design-model` 在原路径；main 线的模型被**原样**搬到 `packages/creative-model`，包名 `@nexus/creative-model`，main 线文件里的 `@nexus/design-model` 已全部改指向新包。
  - 两类模型的文档（12 个共享 docs）现在**逐字保留**两边：studio 线在前，main 线的全文在 `# 附录 · …` 之下，不抹不删。
  - studio 线的 `docs/evidence`、Java 服务、agents runtime 全部原样保留并可验证。
  - 12 个 add/add 冲突的解法见 `README.md` 的 "Consolidation history" 一节。

- 子模块 `packages/*` 通过 `@nexus/*` alias 或 `tsconfig.json paths`——`tsconfig.base.json` 是单一真值来源。

- 2026-11-10 全盘并轨盘点（只读，未动任何一字节）：D:\ 顶层 94 个 `nexus-*`/内容创作* 目录中，
  唯一 remote 匹配本仓库的就是本目录（origin=github.com/xiaodernan/nexus-content-platform）——
  **没有未推送游离副本、没有 worktree、没有 stash**；另外 5 个 git 候选全部属于另一项目
  `D:/获客平台` 的本地 remote 线（detached HEAD、shared parent 系），一个（`nexus-headplane-r20`）
  是无 remote 空仓（16 个未跟踪改动、无 commit，性质可疑但不可归类、无可合并内容）；
  两个残留 Java 进程（3a大作 的 discovery-server/config-server，ports 29161/29888）与
  `com.nexus.NexusApplication`（argfile→已不存在的 `services/platform/target/classes`，本仓无此模块、
  git 无此路径历史）全部无主可合。后者自旋重启过两次（PID 39424 → 12952，同一 spring-boot:run 签名），
  始终占着 8090；所有冒烟验证因此固定走 **:8091**（`NEXUS_GATEWAY_PORT=8091`），
  `verify:topology` 在 8090 被占时按设计 fail-fast 并报出端口名、零副作用退出。

- 2026-11-09 新增 `apps/web` 侧确定性本地 embedding：`NEXUS_EMBEDDING_PROVIDER=local`（**必须显式设置，绝不静默切换**）后，Web 进程内就能完成 §49 的 embedding 与 hybrid 检索——token-bag 哈希，1536 维，无需 key；不是语义模型，只是确定性本地便捷。真实 provider 仍按原有路径接入。
- 全局环境：Windows 11 / Node 24 / Python 3.11 / Java 25 + Maven（ai-service），以及 Compose 上的 PostgreSQL 55433 / Redis 56379（`infra/docker-compose.yml`）。

## 交接

接手的人（不管是哪段对话）只要：
1. `git pull origin main`
2. `npm ci`
3. `docker compose -f infra/docker-compose.yml --profile core up -d`
4. `npm run typecheck && npm run eslint`
5. `npm test`
6. 跑评测：`npm run evals`

即可得到当前文字所写的状态。



## 2026-11-09 addendum: the GBK records repair landed (amendments 569 / 570)

- `6e5e3b9`: the two long-red records brought to zero chargeable damage.
  - `infra/migrations/0000_init.sql` — 274 leading tabs replaced by two spaces; byte-level diff is
    whitespace only; other migrations already used spaces; SQL is whitespace-insignificant and no
    database is forced to re-apply the file.
  - `docs/adr/0043-bot-visitor-suspected-not-convicted.md` — committed encoding-damaged on its first
    day (GBK mojibake, 16 unrepairable sites per the byte-model repairer); reconstructed from the
    surviving bytes plus the ROADMAP mirror of the same decision (fn §168 third slice); the file is
    labeled as a reconstruction at the top and does not pretend to be the original artifact.
- The bilingual-island pin was extended from 6 to 69 rows; every added row was read on screen before
  pinning — they are all authored bilingual lines (test display names, path/subscription-route labels,
  the ledger's own English prose quoting the same word, the roadmap's CJK punctuation).
- The merged ledger commit `b7773b6` carries amendments 569 (v642) and 570 (v643). The two forensic
  clauses in the record-encoding proof were recalibrated in that commit: the +2-row-margin clause is
  unsatisfiable on the Chinese-dense corpus (witness histogram is continuous from 0 to 53) and is
  retired with its measured reason recorded in amendment 570; the one-spelling clause is widened to
  exactly the two named spellings named there by codepoint (36335 / 38706). No writer-model or charge
  rule was weakened.
- `verify:record-encoding` exits 0 (2079 graded files, 0 chargeable lines). The shard witnesses that
  were encoding-damaged were retired from the repo; `docs/TESTING.md` now records the runs and exit
  codes in prose instead of pointing at retired paths.


## 2026-11-09 addendum (cont.): the import/export zip round-trip bug and the full e2e re-check

- `9d350a4`: the export `.nexus/manifest.json` previously declared **every requested part** (design,
  code, assets, storyboard, character), even the parts the project had nothing for. The import side
  is strict — a declared storyboard with no `storyboard/storyboard.json` file refuses the whole package
  with 415, so a fresh project could never export and re-import its own default zip. The manifest now
  declares **only the parts that actually shipped in the package** (per-register counts > 0); `README.txt`
  still reports both what was requested and what is inside (an empty storyboard/character prints "this
  version has no storyboard/character to export" as it did before). No import contract changed; no
  format version bump (the manifest shape did not change, just its honesty).
- Verified: the two failing e2e specs (`§144` client import roundtrip; `§105` status-code matrix,
  which got 415 where 201 was promised) now both pass (`npx playwright test e2e/import.spec.ts` →
  4/4 passed, 55.6s, against the local Docker-backed dev stack).
- `npm run evals` (all nine suites incl. `export-roundtrip 17/17` on the real DB, port 55100) and the
  export/zip integration tests (77/77) pass on the merged tree.



## 2026-11-09 addendum (cont. 2): the local reranker landed

- `b527422`: `LocalTokenBagRerankerProvider` joins the deterministic local retrieval stack, next to
  the local embedder. `NEXUS_RERANKER_PROVIDER=local` selects it explicitly; a key alone does nothing;
  an unknown provider name throws naming the two legal values. `apps/web/src/app/api/projects/[projectId]/knowledge/search/route.ts`
  now passes the selected reranker into `VectorStore.search`, so DEMO MODE can run the whole path
  (embed -> hybrid -> rerank) with no credentials at all, once the operator opts in.
- `evals` gained the eleventh suite `local-reranker 15/15`; the matrix now stands at **276/276**.
  `docs/EVALUATION.md` and `docs/TESTING.md` record the eleventh suite.



## 2026-11-09 addendum (cont. 3): CI health-board after the repair pass

- Studio-line CI red rows reduced to two: the `liveness` and `health` rows of the Java service proof.
  These two rows were red on this repo's CI before any of my work (both lanes were red there);
  they are runner-bound rather than source-bound (the proof's 30 s Hikari-leash premise does not
  hold on this runner, whose pool borrow path answers fast). `vitals`, `traffic`, and the other
  Java-proof rows are green.
- `budgets` is green. The gate now rejects any parenthesized signal-like token that is not a real
  signal, and tolerates statements such as `(descendants: not-attempted)`, which the Linux CI
  runner produced and this gate's previous shape did not recognize as legal.
- `evidence-census`, `arms-freshness`, `doc-evidence`, `table-recount`, `package-counts` all green.
- `main-line` CI (`tsc` for the main lane + `evals` over the 11-suite matrix, including reranker)
  is green for every pushed commit of this session.


## 2026-11-09 addendum (cont. 4): the local deterministic stack is proven end-to-end

- `b8c5d05`: `apps/web/test/knowledge-local.integration.test.ts` exercises the WHOLE path on real
  Postgres with zero credentials — `saveWorld` -> `syncProjectKnowledge` -> local token-bag embeds
  go into the 1536-dim `pgvector` column -> hybrid `VectorStore.search` (with the local reranker)
  returns relevant chunks deterministically. `bucketStore.upsertChunks` gained an honest empty-array
  guard (real bug found: drizzle's `values()` throws on `[]`).
- `evals:baseline:web` added — the baseline evaluation script as documented runs under the web
  tsconfig; `evals:baseline` alone still uses `scripts/eval-baseline.mts` (it was missing web paths).
- Shard 2 re-verified green on the merged tree (196 files / 2879 passed).
- CI multi-lane status: `main-line` CI has been green on every commit this session; `master`'s
  Studio CI keeps two known runner-bound red rows (`liveness`, `health`), the others are regenerated
  and green. `main-line` master briefly red on a GitHub runner Docker-start flake — rerun launched.

## 2026-11-10 addendum (cont. 5): whole-repo lint is real now, and the evidence rule it broke is closed

`npm run eslint` 从"跑不起来"到 **0 错误**。本机 16GB（空闲约 4GB）上整仓 type-aware lint 需要超过
Node 默认堆（4288 MB），根脚本现为 `node --max-old-space-size=10240 node_modules/eslint/bin/eslint.js .`
（ADR-0096 / ADR-0098 记选项、后果与证据）。

- 364 条错误 → 0：262 条是「文件不在任何 tsconfig 里」的解析失败（六个包的 `tsconfig.test.json` 被指给
  project service；`docs/evidence/**`、`tools/**` 的 .mjs 并进 `tsconfig.tools.json`；`.mjs` 配 Node 全局），
  102 条是真实规则违反。
- 规则改出的是真 bug：`updateAgentConfig` 空壳（§159 假 API）→ 真门；`onEnd(async …)` 会挂死 →
  同步监听器 + promise 链；`kill: c.kill` 丢 `this` 的真失败（exec-host 测试里）；RAG 查询向量算了不用 →
  `hybridScoreFrom` 一份规则两个调用方，打分结果逐位不变；`vitest.config.ts` 里的零宽空格骗了注释 →
  现写 `<pkg>` 并把原因留在注释里。
- 定向豁免共四处，每处都写了原因（ANSI 必须匹配 ESC、`new Function` 求值、跨闭包循环标志、
  一条测试的主题就是"宿主抛非 Error"）。
- 断言一个没削弱：`LocalTokenBagRerankerProvider` 从未用导入改成 `toBeInstanceOf` 实例身份断言；
  `expect(design.generate).not.toHaveBeenCalled()` 不能改成 `.bind()`（绑出来恒真、测试变谎话），
  改为解构出局部变量，指向同一 mock。
- `npm run typecheck` 14/14；evals exit 0（11 套全 PASS，含 export-roundtrip 真库）；
  studio 测试 2857/2857；shard 1：197 文件 / 2779+1（doc-evidence 的唯一红条，由
  `git add -f .scratch/gateway-rate-lua-live/readings.json` 修掉——该文件被 ROADMAP 点名、
  测试要求被点名的证据入库，修法就写在测试自己的错误信息里）。
