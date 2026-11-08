# 0029 — 断线之后不重放帧，重开连接时重读权威

日期：2026-10-06 ｜ 关联：§163 实时通道、§164 通知中心、ADR-0010（SSE 而非 WS）、ADR-0028（跨实例扇出，把补发列为唯一剩余欠账）

## 背景

ADR-0028 落地时写过："§163 那一格剩下的欠账只剩补发这一件……要补发得另立 ADR 选 Stream。"
这一篇就是那篇 ADR。结论先说出来：**不补发帧**，改成"连接断过又接回来的那一刻，界面对自己显示的东西回库里重读一次"。

先说清楚"断线"在这里是什么形状。传输是 SSE（ADR-0010），浏览器 `EventSource` 掉了会自动重连，
但服务端**不为一条断开的连接留任何东西**——断的那段时间里过来的事件，一帧都没有。
今天的界面在重开之后不会自己追：`useRealtime` 只是把 state 从 `connecting` 改回 `open`，
铃铛上的数字停在断线前那一刻，直到下一条事件恰好过来，或者用户自己刷新。
页面上那句"实时：已断开，以刷新后的数据为准"说的就是这个，可重开之后它已经变成"已连接"了，
而数据并没有回来——那句话于是变成一句过期承诺。

要定的事：补发到底补什么、由谁补，以及那条"以刷新后的数据为准"的兜底要不要从"叫用户动手"改成"系统自己动"。

## 选项

1. **Redis Streams + 消费位点做帧重放**（否决）。要每用户/每项目一条流、`MAXLEN` 裁剪策略、
   每条连接的读位点，还要把 SSE 的 `Last-Event-ID` 翻译成流里的 entry id。ADR-0028 已经为 pub/sub
   定过一次"不为还不要的语义背上流管理"，这里再加一层流，代价一样，而收益被下面第 2 条的实测砍掉一半。
2. **服务端按 `Last-Event-ID` 从库里重建通知帧**（否决，这一条是靠测量否掉的，不是靠口味）。
   看着最"正统"：通知本来就落库，重连时把 `created_at > cursor` 的行查出来重新发一遍即可。三处挡路：
   - **补不出 `level`**。`notifications` 表没有这一列（`db/schema.ts:942` 起的列清单里只有
     kind/title/body/link/projectId/publicationId/时间戳们），而 `emit()` 在插库之前就把
     `plan.level` 摘掉了（`domain/notifications.ts:39`，注释写得很明白："表里的列"不存在）。
     于是重建只能走 `levelOf(kind)` 的兜底，而它对 `build` / `agent` / `generation` / `publish`
     一律回 `success`（同文件 71-95 行）。**结果是：一次失败的构建补发回来是绿色的"成功"**——
     正是 §159 禁的那类假象，而且只在断线之后出现，测试环境里不重连就看不见。
   - **事件本身没有可当游标的东西**。`RealtimeEventSchema` 七个分支里没有任何 id/时间戳字段，
     要做游标得先动契约（web↔web 也要跟一份帧格式版本）。
   - **历史行补不回来**。为了让重建成立而加一列 `level`，就是一次迁移 + 回填，
     而回填的那批值今天已经不可考——填进去的每个 level 都是编的。
3. **项目频道的进度帧重放**（否决）。`generation.progress` / `build.status` / `preview.status`
   是过程刻度，权威在任务行与 publication 行；把它们补发一遍只是"把进度条倒带重演"，
   用户要的"现在到底到哪一步了"由那两行回答。ADR-0010 后果第 4 条早就定了这条纪律：
   **实时只当加速器，权威状态一律读库**。
4. **重开连接时让界面重读权威**（选这个）。铃铛的未读数本来就是一次 `GET /api/notifications?limit=1`，
   重读代价一个请求，而且天然跨实例——不依赖哪台进程留着帧，因为读的是库。

## 决定

- 客户端 seam：`useRealtime` 多一个 `onReconnect`，**只在"这条连接断过又接回来"时触发**，首连不触发
  （首连时页面刚挂载，权威已经读过一遍，再发一次就是多发一个没有对象的请求）。
- "第几次 open"做成 `createOpenTracker()`，每次开连接新建一份。这不是为了可测而发明的对象：
  换 `projectId` 会让 effect 重跑并开一条新连接，那时首连必须重新算——
  如果记成一个模块级布尔，切项目那一刻就会白白发一次读数，而那次连接根本没断过。
- 这一片只接了 **NotificationBell** 一处。它的权威就是一个数（未读），重读就是那次 `limit=1`。
  Studio 那三个消费者（`AgentPanel` / `CommandBar` / `PublishPanel`）没有接：
  它们的权威是任务行、活动游标与发布结果，各自要决定"重开时读哪一份"，
  接同一个 `refresh()` 会把过程面板接成刷新器。这句话写在这里而不是先接一根假线。
- 界面上那句"以刷新后的数据为准"保留，但它现在说的是**兜底**而不是**唯一出路**：
  连接回来了，数据就跟着回来；连接真断了（`closed`）才轮到用户动手。

## 后果

1. 断线期间过来的通知，在连接重开的那一次读数里追平，**不需要 reload，也没有轮询**。
   这一片能钉死的是"重读被发了几次"（一次重开恰好一次，首连零次）；
   "重读只花一个请求、不是变成轮询"这一句的凭证在**推送**那一侧的真浏览器用例里
   （`e2e/studio.spec.ts` §163：未读数在 no-reload 下 1→2，`/api/notifications?limit=1` 恰好 `+1`，
   之后静置 4 秒不再涨）。重开那一侧的同样测量还没做——连接在真浏览器里断不掉，见验证一节。
2. 仍然没有逐帧重现：Studio 里断线期间跑过的那几步 `agent.step` 不会在重开后逐格重演，
   要看那几步得回读任务的活动（§162 那侧按游标读）。这一片补的是"数"，不是"过程"。
3. 页面得开着才有"重开"可言：连接从未建立（没挂载、`enabled=false`、没有会话）时无从谈起。
   这一条是这一片与真补发的实质差别，别把它读成"断线不丢数据了"。
4. 服务端一行没改，Redis 驱动与 `RealtimeEventSchema` 都没动，契约不需要重导。
   ADR-0028 那句"要补发得另立 ADR 选 Stream"由这一篇回答：**选了不选 Stream**。
5. 如果将来真要把通知帧补出来，先决条件不是消息中间件，而是**把 `level` 存进库里**——
   那是一次带回填的迁移，而且要回答"历史行的 level 从哪来"。这一篇把这句话钉在这里，
   免得下一个会话以为"加个 Last-Event-ID 就行了"。

## 验证（落点与实测）

**落点**：生产代码里开连接只有 `openRealtimeStream` 一条路径（`useRealtime` 调它，默认 transport 是
`browserSource`），"第几次 open 算重开"只在 `createOpenTracker` 一处判断。用例驱动的就是这两个导出的东西，
不是另写一份可测的平行实现；`FakeSource` 顶掉的只有 transport 那一层。

**8 条纯单测**（`apps/web/test/realtime-reconnect.test.ts`）：
`npx vitest run apps/web/test/realtime-reconnect.test.ts` ⇒ `Test Files 1 passed (1) / Tests 8 passed (8)`。
前 6 条覆盖连接本身：首开只报状态不发重读、`open→error(1)→open` 恰好一次重读且中间那次算"还在重连"、
反复断连三次就算三次重开（第一次永不算）、`readyState=CLOSED` 才报 closed、
报文照样过契约（合法一条送到、非 JSON 与缺字段各丢掉一条）、`close()` 只关一次。
后 2 条覆盖**接线**——那 6 条只证明信号会发，不证明有人听：把 `NotificationBell` 里那句
`onReconnect` 删掉，前 6 条一条都不会红。这一组从源文件里平衡括号扫出 `useRealtime(...)` 的选项对象，
问它"有没有这个键"和"这个键指向的那段代码调不调 `refresh`"。

**六条变异臂**（每臂跑完立刻从 pristine 还原；还原后 `diff -q` 报 byte-identical、sha256 前缀
`0824bed662c4bcda`（`useRealtime.ts`）与 `f77c8b9aaead3273`（`NotificationBell.tsx`）、控制跑回到 8 passed）：

| 变异 | 动了哪一句 | 我的预测 | 实测 |
| --- | --- | --- | --- |
| A 每次 open 都发重读 | `if (opened.observe() === 'reconnect') handlers.onReconnect();` → `handlers.onReconnect();` | 只有"首连不发"那条红 | **4 红 / 4 绿** |
| B tracker 永远算首连 | `const kind = opened ? 'reconnect' : 'first';` → `const kind = 'first';` | 三条重开用例红 | **2 红 / 6 绿** |
| C 拆掉契约门 | `if (!result.success) return;` 置否 + `onEvent(result.data)` → `onEvent(parsed as never)` | 只有契约那条红 | **1 红 / 7 绿** |
| D 删掉整行 `onReconnect` | `NotificationBell` 的那一行 | 接线组第 2 条红 | **1 红 / 7 绿** |
| E 接成空函数 | `onReconnect: () => void refresh(),` → `onReconnect: () => {},` | 同上 | **1 红 / 7 绿** |
| F 接错线 | `onReconnect: () => void refresh(),` → `onReconnect: () => setSignedOut(false),` | 同上 | **1 红 / 7 绿** |

A 那一格是我预测错的，留在文档里：重读记账不是只被一条用例看着，而是散在 4 条用例的断言里
（首连那条 + 三条各自数 `reconnects` 的用例，每条都恰好多 1）。"预测红几条"和"实测红几条"对不上
本身就是信息——这一格被多少双眼睛看着，数不出来。B 反过来教我：`"但第一次永远不算"`那半句与
首连用例同体，不会独立变红，所以真断言"重开要发重读"的用例只有 2 条。C 干净：只红该红的那一条。
D/E/F 三条各红在接线那一条上，说明这一组盯的是"接的是哪根线"而不是"有没有这个键"——
只查键的存在（E 就会绿过去），或者只查有没有 `refresh` 这个词（把注释留着、代码删掉就绿过去），
都不足以拦住"信号发给了一个空函数"。

**真浏览器断线：这一格没拿到，作为限度记在这里，不冒充。** 我确实写过一条 Playwright 用例
（`e2e/realtime-reconnect.spec.ts`，我自己新加的文件，已删），用 CDP
`Network.emulateNetworkConditions({ offline: true })` 让页面离线，等 `data-realtime` 离开 `open`。
实测红在机制本身，不是红在代码：
```
expect(locator).not.toHaveAttribute(...)  Received: "open"
62 × <span data-realtime="open">        （30 秒轮询窗口内自始至终是 open）
```
离线模拟**不打断已经建立的 SSE 连接**，浏览器根本没走重连路径，所以"重开时重读"在真浏览器里
用这条路造不出来。要补这一格得从服务端把流关掉（或让第二个实例给每条流一个有界寿命），
这笔欠账挂在 ROADMAP §163 与任务 #92 上。换句话说：本 ADR 证明的是**判断逻辑**（第几次 open 才算重开、
契约门在不在）与**接线**（`NotificationBell` 的 `onReconnect` 指向 `refresh`，由两条用例加 D/E/F
三条变异臂盯着），
没有证明**真浏览器里断一次线之后未读数会自己追平**。
