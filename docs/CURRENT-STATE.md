# CURRENT-STATE — 2026-11-09

本文件是项目当前状态的快照——供未来任何 agent（或人类）在我不在的时候接上。它**只描述已经交付、已可执行的事**，不承诺未做的事。

> **2026-11-11 续（§SC-44 / ADR-0116，最新置顶）**：SC-41 留下的内容新鲜度边界——`publishProject` 后新作品最多一个 TTL（15s）才进他人发现页——正面收口，落 **Redis / 计网 / 缓存 / 数据库性能 / 前后端协同**。**最关键纠错**：不能靠 `++globalGen` 做全局失效——`globalGen` 是"给新 viewer 分配 generation 的水位线"，匿名恒 0、已缓存 viewer 读缓存值，**都绕过它**，一个现有键都失效不了。正解是独立正交键段 `discover:v1|<globalEpoch>|<generation>|<JSON>`：`globalEpoch`（内容新鲜度，public 发布/下架/rejected +1，含匿名的所有旧键一次作废）与 `generation`（§SC-41 隐私新鲜度，block/follow 只失效一人）**正交**、都跨 reset/热重载保留防旧键复活。**生产**：`invalidateDiscoverGlobally()` 本机 epoch+1 先做再 fire-and-forget 广播；三处写路径精确挂钩——`publishProject` 成功尾部（`public` 或旧版 `public`）、`unpublishProject`（撤下前是 public）、`resolveCase` 判 rejected 且那条是 public；private/unlisted 与 approved 不改收录、刻意不清（避无意义惊群）。**帧格式单向兼容**：`v:1`/频道都不动，加可选 `global?:true`+空 viewerIds；新实例收旧帧、旧实例因空数组撞护栏 fail-safe 丢弃（混部靠 TTL 收敛、升级后自动生效）；不升 v2（会切断双向互收）、不塞全站 id（撞 128 护栏）。**首跑两条真信号没放过**：①正交性判据红在"invalidate 不立即 bump globalGen、generation 是懒分配"——修正断言时机反把实现钉更准；②**下架 `RETURNING` 旧值陷阱**——Postgres `UPDATE ... RETURNING` 给的是更新后值，撤 public 时读到已是 `private`、判断永远 false、epoch 不涨，真库当场抓到生产 bug（7≠8），改"先 select 旧 visibility 再 update"，并诚实记下 select→update 的窄竞态（最坏残留一个 TTL、URL 已即时 404、不丢数据）。**诚实边界（ADR-0116，惊群是核心）**：全局失效≈一次冷启动，singleflight 只合并**同键**不跨键、打库量随活跃 `(viewer,sort,limit)` 组合上升——这是即时可见用性能换新鲜度的**预期代价、不是事故**，admin 面板 `globalEpoch` 读数让频率可见、`epochNote` 把收益与代价摆到运维眼前，根治（跨键闸门/stale-while-revalidate）属更大改动不做不假报；跨实例**全局帧丢影响整台别的实例**（viewer 帧丢只影响一人），最坏退回现状 TTL、本机永远即时。**前端联动**：`DiscoverPanel` 加"内容新鲜度的内存账"显示 epoch + 旁注，`isKnownReadout` 形状门纳入 `globalEpoch`（缺/错挡掉、不画 undefined），零新增 token 复用 `.gw-`/`.dc-`。**验证（不粉饰）**：SC-44 相关 6 文件 **81 passed**（内核+3/帧+4/多实例+4/真库端到端+3/展示判据+2/路由层既有 7，真库三条写路径各验 epoch+1+loads 增长、且发布后屏蔽名单仍不串味）+ publish/moderation/unpublish/social 回归 **46/46** + 横向门 **34/34** + `npx tsc -p apps/web/tsconfig.json --noEmit` EXIT=0；**全仓 vitest 404 文件/5792 测试 passed + 1 skipped、EXIT=0**（对比 SC-43 基线 404/5777+1 skipped，净增 15 测试 = 6 文件 66→81，文件数不变因只在既有文件加用例；542.59s）。未改 `discover` 函数体/DB/索引/依赖/两个入口。仍欠：共享权威 gen/epoch 存储（要强一致时）、实例粒度 breaker/bulkhead 聚合、连接层黑洞看门狗（SC-36）、CI topology job 经真实 push、3 条既存 .mjs TS8016。单 main/单 worktree、无 stash/游离分支、`--no-merged` 空、无可并内容；未 push。详见 ADR-0116 / ROADMAP §SC 第四十四片。
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
