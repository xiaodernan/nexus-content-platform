# ADR-0132：发送端帧 64 KiB 护栏——pub/sub 没有背压，大帧只能靠收发端自律

- 状态：已采纳（2026-11-11，§SC-55，承接 §ADR-0126/ADR-0127 的 "MQ 候选③"）
- 关联：`apps/web/src/server/realtime/redisBus.ts`、`wireErrors.ts`（新词条『帧超长』）、
  `services/java-domain-service/.../WirePublisher.java`（LongAdder + stats）、
  ADR-0028（realtime redis fanout）、ADR-0025、ADR-0126/0127（MQ 候选清单）、
  ADR-0128/0130（§SC-53/54——线路探针与领域事件，本片是同一条线路的发送端侧）
- 触发（user 本轮点名）：**消息队列的合理运用**。

## 背景

Redis pub/sub 是这条跨进程线路的唯一传输。它**没有订阅者名册、没有 slow-consumer 信号、
没有死信队列**：一帧几 MB 的 JSON 会被内存里的每一个订阅连接原样缓冲——web 侧 ioredis、
Studio/Node 监听、Java 侧 RedisMessageListenerContainer，谁也缓冲不住；而且帧本质上是
"最好有、丢了无所谓"（权威状态在库里），没有任何补发语义。结论是：**这一帧能不能上线路，
唯一的决定点是发送端**——Redis 帮不上，订阅方不知情，业务不依赖。

## 决定

1. **64 KiB 字节护栏在发送端单边上。**  web：`MAX_FRAME_BYTES = 64*1024`；
   `send()` 中 `JSON.stringify` 后、`pub.publish` 前用 `Buffer.byteLength` 量真实字节
   （非字符数），超限 → `countWireError('帧超长')` 后直接 return；本机半边在这之前已经送达，
   ioredis 从未被调用——『投递』账里不留一笔，账分列。Java：`MAX_FRAME_BYTES = 65536`，
   `frameJson` 之后、`convertAndSend` 之前量 UTF-8 字节，超限 → `tooLargeDropped++` + warn + return null。
2. **新词条『帧超长』进闭合词表**（`WIRE_ERROR_REASONS`）。admin 面板按
   `Record<string, number>` 通用渲染超限帧计数、零前端改动；`emptyWireErrorLedger` 由词表 map 生成——
   没有手写 sidecars、没有硬编码副本。
3. **Java 侧补一个计数端点** `GET /api/v1/realtime/stats`：`{wireChannel, maxFrameBytes, publishedTotal,
   tooLargeDropped, redisFailures}`。不打库、只带计数；不鉴权（同 `/policy`）——
   不带内容、不泄字段，只泄"进出了多少帧、失败分几种"。
4. **`/probe` 的 503 保留 `redis_unavailable` 契约**（SC-53 已发布文档的 smoke 判据依赖它），
   精确失败种类去 `/stats` 对账。不改动旧契约，往后向加 `note` 字段（兼容消费者忽略多余字段）。
5. **64 KiB 是护栏不是天花板**：`agent.plan` 等合法大报文在 KB 量级、碰不到护栏；
   本片针对的是"整份 plan/整段代码/base64 图片灌 JSON"这类生产事故，不是日常业务报文。

## 后果与证据

- web：`test/realtime-frame-guard.test.ts` **3/3**（死端口构造——护栏在 `ioredis` 之前，
  死端口恰好证明"送不到线路也不依赖线路"）：本地送达仍 1 帧、『帧超长』=1、『投递』=0、
  双发累加 2、边界不误伤；`eslint` EXIT=0；`tsc --noEmit -p apps/web/tsconfig.json` EXIT=0；
  `realtime-stats-readout` + `realtime.redis.integration` + `realtime-frame-guard` **30/30**
  （`WIRE_ERROR_REASONS` 零硬编码影响面）。
- Java：全套 **126/126**（124 + 本片 2 判据：超限就地丢+计数、stats 形状）。
- live（127.0.0.1:8082，服务已收拢）：`GET /api/v1/realtime/stats` → **200**
  `{publishedTotal:0,…}`；`POST /api/v1/realtime/probe?channel=projects:sc55` → `published:true`；
  随后 stats → `publishedTotal:1` —— 计数链路在同一进程全链路实测。

## 诚实边界

- 护栏**只防大帧**，不防"大量小帧"（rate limit 是另一格——网关 rate limit 已在别处）。
- `Buffer.byteLength` 是 O(n) 顺序扫描——64 KiB 量级多花微秒级时间，相对 ioredis 的 RTT
  可忽略；扫描本就是 `send()` 里唯一的额外成本。
- Java `/stats` 与 SC-53 的 proof-run 无共同消费者；本片不接 CI topology smoke
  （判分写在单测里，链路写在手实测里）——接入 topology 需要决定 8082 的健康谓词形状。
- `MAX_FRAME_BYTES` 在 web/java **两处独立定义**（不同语言发行版、不能跨进程常量共享），
  本片按契约钉在 65536；如要调整，两个数一起改，改前先确认 Studio 侧能否吃大帧。

## 仍欠

- 发送端背压/丢弃的通知窗口（`"订阅者侧"` 是否需要心跳回执）——pub/sub 没有成员名册，
  要真觉察只能引入 Redis `CLIENT LIST` 类轮询，成本与收益另立片评估；
- web『帧超长』与『投递』在 admin 面板的可视化排序（当前按计数 desc 平铺——不是缺陷，够用）；
- Java `/stats` 计入**进程生命周期**而非跨重启持久（与 web 进程内账同语义）；想要权威数字要再等真 push + topology job；
- `agent.plan` 里若真含 base64 图片 payload，应按字段裁剪而非整帧改写——另立片。
