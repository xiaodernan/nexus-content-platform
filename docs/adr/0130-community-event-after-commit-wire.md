# ADR-0130：社区 like/follow 上线路——领域事件 + AFTER_COMMIT，收件箱归 web、线路归大家

- 状态：已采纳（2026-11-11，§SC-54）
- 关联：ADR-0128（§SC-53 线路探针那一片，本片是它的"真实事件源"兄弟）、ADR-0028（realtime redis fanout）、
  ADR-0126（§SC-52/MQ-1，同一"消息队列合理运用"点名下一同落地）、
  `scripts/realtime-java-community.mts`、ADR-0009/0012（发布快照与社区 policy 家族）
- 触发（user 本轮点名）：**消息队列的合理运用 + 前后端协同**。

## 背景

§SC-53 让 Java 栈学会了"说线路上的话"，但只发了一帧探针——**没有什么是被点赞/被关注时真的会说话的**。
社区 like/follow 的真实写路径在 `CommunityService.toggleLike/toggleFollow`（AFTER the web's interact route took the same jobs)：
提交后 Studio/web 任何一边都收不到动静——用户对着一条线路鼓掌，没人听见。
web 侧有进程内总线 + inbox 通知（`emit()` → notifications 表 + `channels.user(userId)` 上一帧 notification）。
JVM 侧刻意 silence 的理由（"两个发信者 = 两份事实来源"）针对的是**收件箱表**，不是线路。

## 决定

1. **领域事件 + AFTER_COMMIT。** `CommunityEvents.LikeAdded / FollowAdded`（Java record），
   由 `CommunityService` 经 `ApplicationEventPublisher` 发出；`WireCommunityEventListener`
   以 `@TransactionalEventListener(phase = AFTER_COMMIT)` 消费。事务回滚 → 不发；
   线路不可达 → 记 warn 返回 null。线路永远不宣告没发生的事。
2. **只发"加"。** unlike/unfollow（toggle 到 off）、blocked、拒绝一律不发——
   与 web 收件箱"取消点赞不是新消息"同构，且总帧数可精确到事件次数。
3. **帧 = web schema 已认识的 `notification`。** 频道复用 web `channels.user(userId)` 约定：
   like 帧落 project owner 频道（附 `projectId`），follow 帧落靶用户频道。
   文案与 web `lib/notify-plan.ts` 的 like/follow 逐字对齐——
   `<actorName> 点赞了《<projectName>》` / `<actorName> 开始关注你`；
   收件箱没听见 JVM 的话，但 Studio 按频道订阅就能听见，且**不产生 inbox 行**。
4. **Java 不写收件箱表。** "谁写收件箱"仍是 web 独占——两个写入者就是两个事实来源，
   这条线不动。JVM 只说话不做账。
5. **actorName 查一次库**（`users.findById`），空白/缺失兜底"有人"；超长 clip 到 140
  （与 web TITLE_MAX 同级护栏）。
6. **判分面五件事**（全部实跑）：6/6 监听器单测（频道/标题逐字/clip/兜底）·
   CommunityServiceTest 19→25（三态 × like/follow 的事件契约）· 全套 124/124 ·
   `npm run realtime:java-community` 7/7 verdicts（like×2 各一帧、follow×2 各一帧、
   取消静默、`projectId` 逐字对齐、`wireErrorCount=0`）· 库零残留（likes=0, follows=0）。
   中途如实翻车一趟：随机 UUID actor 撞 FK → HTTP 500（业务正确：回滚 → 不发帧），
   修为真实零互动 actor 后复跑全绿。

## 后果与证据

- Studio/web 对社区动作从此有**在线**的听觉：频道按 userId 订阅，醒目程度/路由前端自决。
- `like/follow` 的语义被钉死在"提交后才宣告"，回滚 → 不发帧是机制保证不是约定。
- inbox 表无新增写入方，web 收件箱的内容不受本片影响。
- 诚实边界（不粉饰）：
  1. 线路无送达保证；业务正确性不许依赖它（同 §SC-53）。
  2. 帧里没有 link/actorHandle/actorId 轮廓——Studio 如需完整通知语义，仍须走 web 收件箱
     （JVM 路径不替代 web 主路径）。
  3. `@TransactionalEventListener` 只在 Spring 的事务同步内生效；本片未验证"直接绕开事务"的调用方。
  4. 轮廓帧的 displayName 是快照时刻值——用户改名后旧帧不回收。
- 工程教训（已入 git history）：本片在 IDE 外手写 CJK 源码一度被 PowerShell 5 的
  ANSI 误读+写回损坏（§SC-53 的 BOM 事故同类）；已恢复两条注释行并对照 git 核对逐字一致。

## 仍欠

- Studio 真订阅 `user:<id>` 频道渲染这类帧并展示红点——前端消费侧还没写；
- `generation.progress` 同构处理（AI 生成任务的 JVM 侧进度帧）——下一条 MQ 候选；
- 发送端帧大小护栏（与 MQ 候选③ 合并评估）；
- AFTER_COMMIT 与 "web 收件箱 emit()" 双路触发同一频道的去重策略（web 不补、不抄，边界清晰）；
- CI topology job 从未经真实 push 跑过；topology smoke 未含本条链路 smoke。
