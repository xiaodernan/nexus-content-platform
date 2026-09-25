# ADR-0010：实时通道用 SSE 而不是 WebSocket（§163 的有意偏离）

日期：2026-09-25 · 状态：已采纳 · 关联：§163、§94、§164、§162、`docs/ARCHITECTURE.md`

## 背景

§163 要求一条实时通道，用 **WebSocket** 显示四类进度：`generation progress` / `agent status` /
`build status` / `preview status`。§94 把 `realtime` 划给 Redis。

现状：`RealtimeEventSchema` 早在 `packages/schemas` 里定义好了（七种事件，覆盖上面四类，
另加 `agent.plan` / `agent.step` / `notification`），也导出成了契约 `contracts/realtime-event.schema.json`
——**但没有任何代码发过这些事件**。界面上的进度全靠轮询或一次性回话。

要做的取舍：Next.js App Router 的 route handler **拿不到底层 socket 的 upgrade**，
所以"照 §163 字面做 WebSocket"只有两条路——加一个独立 WS 进程，或者换一个自托管 server。
ROADMAP 明确写了这个取舍**要先写 ADR，不能默默改掉 §163 写的"WebSocket"**。

## 选项

1. **独立 WS 进程**（Node `ws` server + Redis pub/sub）。字面满足 §163。
2. **SSE**（`text/event-stream`，App Router 的 route handler 就能承载）+ 一条可替换的事件总线。
3. **维持轮询**，等真有需要再动。

## 决定

选 **2**，并把偏离写清楚。理由是这三条，而不是"SSE 更省事"：

- **这四类进度是单向的**。`generation progress` / `build status` / `preview status` / `agent status`
  全是服务端 → 浏览器的通知，客户端不需要往上说话。WebSocket 的双工能力在这里用不上，
  却要换来一个新的进程、新的端口、一套独立的鉴权与会话处理、以及一个独立的部署单元。
  §163 要的是"实时看到进度"，不是"双向通道"这个手段本身。
- **鉴权与会话必须复用同一条路**。这个平台的每个读写入口都过会话 cookie + 项目所有权
  （`projectBelongsTo`）。SSE 走普通 HTTP，这套中间件原样生效；独立 WS 进程要重新实现一遍，
  而"实时通道是唯一一条没走所有权检查的路"正是最不该出现的东西。
- **本机环境撑不起多拉起一个常驻进程**。16GB 内存空闲约 2.5GB，`AGENTS.md` 明确写了
  "服务按需启动，别同时拉起全部栈"。为一个单向通知通道多养一个进程，代价与收益不成比例。

**多实例扇出**：总线做成 `RealtimeBus` 接口，当前驱动是**进程内**（单实例足够，与
`server/security/rateLimit.ts` 里同一个取舍、同一句说明）。多实例部署时加 Redis pub/sub 驱动，
`publish` / `subscribe` 的签名不变——这是 §94 说的 `realtime` 该落在哪里，也留成了唯一的替换点。

**报文不变**：事件形状继续用 `packages/schemas` 的 `RealtimeEventSchema`（已经是契约），
传输方式与报文解耦。将来真要加 WS 传输，**生产者一行都不用改**——这正是先定报文再定传输的好处。

## 后果

- 好处：实时通道与既有鉴权/所有权/CSRF 边界同源；不引入新进程与新端口；生产者与传输解耦。
- **代价与限度（如实记，不假装是完整的 §163）**：
  1. 传输不是 WebSocket。若将来出现真正双向的需求（例如协作编辑、客户端上行控制），
     需要重新评估并可能补一个 WS 进程——那时这份 ADR 要标为"被取代"，而不是被悄悄改掉。
  2. 单实例扇出。多实例部署下每个实例只推自己进程内产生的事件，**跨实例的事件收不到**，
     直到接上 Redis 驱动。这与限流今天的限度是同一类问题，不是"已经支持多实例"。
  3. 浏览器对同源 HTTP/1.1 连接有约 6 条的上限，一条 SSE 长连接占一条。开发环境（HTTP/1.1）
     下同时开多个标签页可能触发排队；生产走 HTTP/2 时是单连接多路复用，不受此限。
  4. 断线重连由浏览器 `EventSource` 自动处理，但**没有** `Last-Event-ID` 补发——
     断开期间的事件会丢。所以实时通道只用来"让界面快点看到"，**权威状态仍然读库**：
     任何一类进度在刷新后都必须能从服务端重新读到，实时只是加速，不是唯一来源。
