# ADR-0128：Java 域服务开口喊话——notification 帧写上 `nexus:realtime:v1`，跨进程那条腿从哑到通

- 状态：已采纳（2026-11-11，§SC-53）
- 关联：`scripts/realtime-two-process.mts`（web↔web 双进程实证，既有）、ADR-0028（realtime redis fanout）、
  `packages/schemas/src/index.ts`（`RealtimeWireFrameSchema` —— 线路上的字节与浏览器发的一样不可信，先 safeParse）、
  ADR-0126（§SC-52/MQ-1，失效总线——同一"消息队列合理运用"点名下的另一半）、
  ADR-0113/0114（发现页失效总线——Java 将来要兑现"哪条缓存该死"也走这条线路）
- 触发（user 本轮点名）：**消息队列的合理运用 + 前后端协同 + 全栈联通**。

## 背景

web/Studio 侧早有一条跨进程实时线路：`apps/web/src/server/realtime/redisBus.ts` 的
`WIRE_CHANNEL = 'nexus:realtime:v1'`，订阅帧由 `packages/schemas` 的 `RealtimeWireFrameSchema`
safeParse 把关，不合法的帧记 `wireErrorCount` 后丢弃，绝不落到本机订阅者。双进程实证
`npm run realtime:two-process` 早就把 web↔web 的送达、回环去重、close 跨进程全跑通了。

**缺的是 Java 侧的生产者。** Spring Cloud 栈（registry@8771、domain-service@8082）对 Studio 完全
是哑的：没有人能从 Java 向 web 订阅者说话。user 把"消息队列的合理运用"列为本轮重点，这条缝
就是最真实的一处——否则所谓"微服务"只是 web 的高可用内饰，Java 的业务事件（将来 like/publish
落库后通知 Studio、失效某条发现页缓存）永远没有嘴可以说话。

## 决定

1. **组帧对齐 web schema，不多一个字。** `WirePublisher`（`@Component`）产出
   `{"kind":"event","origin":"java-domain-service","channel":"<逻辑通道>",
   "event":{"type":"notification","level":"info","title":"…"[,"body"][,"projectId"]}}`——
   `kind` 只有 `event` 一种（不发 `close`）；`origin` 恒为稳定串 `java-domain-service`（web 用 origin
   跳过**自身**回环的帧；Java 源不订阅、稳定串足够让 Studio 辨认"这是 Java 侧的话"）；
   `channel` 是逻辑路由键，`min(1)`；`event.type` 只发 web schema 已认识的 `notification`；
   `level` 只用 `info`。
2. **验证在出线路之前做。** 空/白 `channel` 或空/白 `title` 直接抛 `IllegalArgumentException`——
   web 侧这两个字段都是 `min(1)`/必填，发一帧注定被 safeParse 丢的"消息"不是宽容，是给排障制造
   假象。控制器把 `IllegalArgumentException` 映射成 400 + `error` 字段。
3. **总线不能比业务更脆弱。** Redis 拒收/不可达：只记 `warn` 日志、返回 `null`；控制器回
   **503 + `{published:false, error:"redis_unavailable"}`**——不把"没发出去"包装成 200。
   与 web `publish` 不抛异常的纪律一致：帧丢无所谓，业务绝不因此失败。
4. **门纪律不破例。** `POST /api/v1/realtime/probe` 要求 `X-Nexus-Subject` 合法 UUID；
   缺 header → 400、非法 UUID → 400（实测）。探针只发 notification、不碰库、不读请求体以外的状态。
5. **判分面如实列举，一条都不虚报：**
   - `WirePublisherFrameShapeTest` **6/6**：帧逐字段对齐 schema（kind/origin/channel/type/level/title）、
     转义（引号/反斜杠/换行/控制符）、拒绝路径（空 channel×3、空 title×2）、Redis 不可达 → `null`；
   - `WirePublisherRoundTripTest` **1/1**：`127.0.0.1:56379` 真 Redis 回环（127.0.0.1 而非 localhost——
     Windows 下 `::1` 连不通会假失败）：订阅先握手 500ms（pub/sub 送达窗口从 SUBSCRIBE 生效起算），
     5s 内收到同字节；Redis 不可达则整测 `assumeTrue` 跳过、绝不假装跑过；
   - **`npm run realtime:java-to-web`**（`scripts/realtime-java-to-web.mts`，与 `realtime:two-process`
     同构）：domain-service 在 8082、web 的 `RedisRealtimeBus` 作监听子进程，**PROBE_PUBLISHED /
     WEB_BUS_DELIVERED / NO_WIRE_ERRORS 三条全 PASS**——这等于让 web **生产代码**的 safeParse 门
     亲手电了一遍 Java 的帧（帧非法会被 bus 丢且 `wireErrorCount>0`，两条判据同时摁死）；
   - `java-domain-service` 全套 **112/112**（既有 105 + 本片 7），全绿重跑过；
   - 触发命令：`POST /api/v1/realtime/probe?channel=…&title=…`（默认 `projects:probe` / `probe event`）。
6. **顺手修了一个被本片暴露的真 trap**（单独 commit `fe566b31`）：domain-service 默认
   `NEXUS_DOMAIN_DB_URL=jdbc:postgresql://127.0.0.1:5432/nexus`——本机 5432 是 **careeros-postgres**，
   而本项目的 Postgres 在 55433。默认指向别人的库，stand-alone `java -jar` 实测在
   `JdbcEnvironmentInitiator` 直接断掉、Tomcat 不起来。默认值按 `docs/ENVIRONMENT.md` 对齐 55433、
   `DB_PASSWORD` 默认同步为本地 dev 口令 `nexus_dev_only`（此口令在 e2e/ENVIRONMENT.md 里本就明文存在）。

## 后果与证据

- Java 栈第一次能被 Studio 的听觉器官听见：`channel` 决定 web 端按哪个逻辑通道路由（订阅方约定，
  当前只有 `project:java-probe` 被实测消费；`projects:probe` 是默认频道）。
- 生产路径零行为变化：两个新 bean 只新增端点与一个 publish 调用；domain-service 其余控制器、
  web 侧零改动；common case（没人订阅）下帧被丢弃，无副作用。
- 诚实边界（不粉饰）：
  1. **这是探针链路，不是业务事件源**——`like/follow/publication` 等领域事件**尚未**接到这条线路；
     §下片才有"真实领域事件 → 线路 → Studio"。
  2. pub/sub **无送达保证**：没有订阅者名册、帧可丢，任何业务正确性不许依赖它（同 ADR-0114 边界）。
  3. Studio 收到的是 `level:info` 的 notification——是否醒目、如何路由展示是前端自己的事，本片不包揽。
  4. 跨实例 fanout 只到 Redis 线路为止；web 侧 `RedisRealtimeBus` 自己的 origin 回环去重照旧生效。
- 工程教训（已写进 git history）：PowerShell 5 的 `Set-Content -Encoding UTF8` 会写 BOM，本机 javac
  工具链下直接拒编译（误报成"注释未闭合"）——源码一律用字节级安全的写入方式；sed 类整文件重写前先确认编码。

## 仍欠

- 真实领域事件（至少 like/publish 之一）接到线路上并被 Studio 消费——本片只证明"能说"，不证明
  "有话可说"；
- 发送端帧大小护栏（`MAX_FRAME_BYTES`）——与 web 已记的 MQ 候选③ 合并评估；
- `projects:probe` 频道与前端路由约定文档化（前端要不要展示 Java 源通知）；
- 多 Java 实例下 origin 是否需要更细粒度（当前稳定串够用，studio 不需要区分哪台 domain-service）；
- CI topology job 从未经真实 push 执行过——本片端点也没进 verify:topology（Java→线路的 smoke 目前
  手工跑 `realtime:java-to-web`，接入 topology 待干净窗口）。
