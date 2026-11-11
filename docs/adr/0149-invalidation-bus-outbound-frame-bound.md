# ADR-0149：失效总线发送侧也守同一界——`published` 记的每帧都必须是接收侧认的合法帧

- 状态：已采纳（2026-11-12，§MQ-2，承接 ADR-0126 留白的 "MQ 候选③"条数维度 / ADR-0132 的发送端自律纪律）
- 关联：ADR-0114（Redis pub/sub 双连接失效总线骨架 / 最终一致 / 丢帧退回 TTL 自愈）、
  ADR-0126（§MQ-1 逐 listener 隔离 + 诚实账本，留白明列「候选③ `publish` 不守 `MAX_VIEWERS_PER_FRAME`」）、
  ADR-0127（共享缓存有界自愈 + 配置/实况分开说）、ADR-0132（§SC-55 realtime redisBus **64 KiB 字节**护栏，本片同纪律的另一维度）、
  ADR-0115（没接上绝不画四账 0）、ADR-0077（变异臂各有牙）、
  `apps/web/src/server/domain/invalidation-bus.ts` / `test/invalidation-bus-outbound-guard.test.ts`（本片改动）、
  `discover-cache.ts`（`invalidateInStore` 本地先 bump 再 publish 的顺序承诺）、`blocks.ts` / `social.ts`（唯一生产调用方）
- 触发（user 长期点名）：**消息队列的合理运用 + Redis + 缓存 + 算法/数据结构合理性 + 前后端协同 + 诚实账本**。

## 背景（先量再治，先分清哪些已被别片做掉）

发现页跨实例失效总线 `invalidation-bus.ts` 的**接收侧**早有硬护栏：`parseInvalidationFrame` 只认
`1 ≤ viewerIds.length ≤ MAX_VIEWERS_PER_FRAME(128)`、每个 id `1..MAX_VIEWER_ID_LENGTH(128)` 字符的定向帧，
外加 `global:true` 空 viewerIds 的全局帧；坏帧记 `errors` 丢弃、绝不落到 generation 变更。

开工前先做编号/占用核对，避免重复造轮子：

1. **ADR-0126 留白的 "MQ 候选③"** 原文即「`publish` 不守 `MAX_VIEWERS_PER_FRAME`，当前调用方最多 2 个 viewer 到不了上限」——本片正面接的正是它。
2. **ADR-0132 / §SC-55 虽自称"承接候选③"，实做在另一条线路**（`realtime/redisBus.ts`）、**另一维度**（64 KiB **字节**护栏，防整份 plan/base64 灌 JSON）。它不是本片：文件不同、常量不同（`MAX_FRAME_BYTES` vs `MAX_VIEWERS_PER_FRAME`）、维度不同（字节 vs viewerId 条数/长度）。但它钉下的**纪律**正是本片要对齐的——**pub/sub 没有背压/名册/死信，坏帧只能发送端自律不上线路，超限就地丢 + 独立记账、不污染"投递"账**。

读码确认缺口真实（当前 HEAD `invalidation-bus.ts`）：

```ts
// MemoryInvalidationBus.publish / RedisInvalidationBus.publish（修复前，两处同构）
if (global !== true && viewerIds.length === 0) return;   // 只挡空集
const payload = serializeFrame(
  global === true ? { v:1, origin, viewerIds: [], global: true }
                  : { v:1, origin, viewerIds: [...viewerIds] },  // 超界/坏 id 照原样序列化
);
if (payload === null) { this.counters.errors += 1; return; }
this.counters.published += 1;                            // ← 记了"发布成功"
this.hub.emit(payload, this.origin);                     // / void this.pub.publish(...)
```

后果不是抽象的：一条 129 个 viewerId 的定向帧，发布侧 `published += 1` 报成功，而**每一个**对端进程收到后
`parseInvalidationFrame` 返回 `null` → `makeDispatcher` 记 `errors += 1`、`received/applied` 不增。账本于是出现
「**发布侧记成功、每个对端必然丢弃**」的谎——与 ADR-0115「没接上绝不画四账 0」同一个"读数不配实况"家族，
只不过这次错在**发送侧**。同一维度还有两个同源坏输入：单个 id 超 `MAX_VIEWER_ID_LENGTH`、空字符串 id，
接收侧都拒，发送侧都照发照记成功。

**定性（不夸大）**：唯一生产调用链 `discover-cache.ts:441` `invalidateInStore` → `blocks.ts`（最多 actor+target 两人）/
`social.ts`（actor 一人）每次最多 **2 个** viewer，碰不到 128。所以这是 **public 接口（`publish(viewerIds)`）
与 rest 参数（`invalidateDiscoverFor(...viewerIds)`）的 latent 契约缺口**，不是正在发生的事故——与 ADR-0121
「`BoundedCache.clear()` 全仓零调用点，是底座 latent 债非事故」同类。修它是在**将来有人批量失效、或业务直接调公共接口
超界之前**，先把账本与线路焊死，而不是宣称修了一个线上 bug。

## 决定

### 1. 新增一个共享纯函数 `isValidOutboundFrame(viewerIds, global?): boolean`

与 `parseInvalidationFrame` 的**定向帧护栏逐字同构**：全局帧（`global===true`）由 publish 固定序列化成空
viewerIds、恒放行；定向帧要求 `1..MAX_VIEWERS_PER_FRAME` 条、每个 id `1..MAX_VIEWER_ID_LENGTH` 字符。
**纯函数**：只判形状、返回 boolean、不碰 `counters`（记账统一在 publish 的拒绝分支，单一归口）。
两种驱动共用它，杜绝各写一份护栏漂移（§MQ-1 已用 `InvalidationListeners`/`makeDispatcher` 立过"双驱动共用内核"先例）。

### 2. 两个 `publish` 在序列化前过守界，就地拒绝 + 诚实记账

```ts
if (!isValidOutboundFrame(viewerIds, global)) {
  this.counters.errors += 1;   // 记 error：这一帧没能上线路
  return;                      // 不 serialize、不 published += 1、不 emit / 不挨 ioredis
}
```

- `published` **只记真正上线路的帧**（账本-线路逐帧恒等）；超界帧从不记 published、从不 emit/publish。
- `errors` 记这一笔出站拒绝；admin 面板 `discover-view.ts` 的 `bus.errors > 0` 分支原样成立（措辞"丢帧退回 TTL"
  对出站拒绝同样成立——只是这次丢在自己这端），**不改 `InvalidationBusStats` 字段形状、前端零联动**，
  与 §MQ-1 同一"语义收紧、字段零变"口径。
- **本地即时失效不破**：`invalidateInStore` 的顺序是 `bumpLocal(s, ids)` **先做**（本机隐私即时生效，fail-open
  最后一道），`s.bus?.publish(ids)` 在后；出站拒绝只让**别的实例**收不到这一帧，对方最坏多用一个 TTL（默认 15s）
  旧 generation 后自愈——ADR-0114 的最终一致边界原样成立，不新增隐私承诺、也不假装瞬时强一致。
- 为什么**拒绝**而非**分片**（改成多帧 ≤128）：① 当前调用方最多 2 个 viewer，分片路径永不可达，为不可能输入
  加复杂度违反"先量再治"；② 分片要重定义 `published` 记帧数还是 viewer 数、要处理分片 origin 一致性与对端
  `applied` 合计覆盖，牵动账本语义与更多边界；③ 语义正确的批量失效应调方分批（每次 ≤128 调多次 publish），
  或在真有该需求时另立片论证，而不是在总线底层默默分片。故本片取**最小、fail-safe、与 ADR-0132 同纪律**的拒绝。

### 3. 为什么不改 `parseInvalidationFrame` / `discover-cache` / 前端

接收侧护栏本就正确（正因为它拒坏帧，才暴露发送侧记了谎账）；本片只补发送侧，让"发送侧 `published` 记的每一帧
都必然被接收侧认"成为不变量。改接收侧会动 ADR-0126/0127 已固化的单向兼容与坏帧语义；改 `discover-cache`
顺序会动本机 fail-open 承诺；改前端形状会牵动 admin 形状门。三者皆不必要，footprint 钉死在 2 个文件
（生产 1 + 判据 1）。

## 判据（`invalidation-bus-outbound-guard.test.ts` 18 门，零真 Redis / 零真库 / 零 sleep / 零时钟）

核心不变式一句话：**发送侧 `published` 记的每一帧，都必须是接收侧 `parseInvalidationFrame` 认的合法帧。**

- **内存驱动 9 门**：超界(MAX+1)就地拒绝（published=0/errors=1/对端 received=0 且 errors=0、零 seen）；
  恰好 MAX 合法帧放行逐字等价（零回归对照）；单个 id 超长、空字符串 id 各整帧拒绝；空集 no-op 不记 published
  **也不记 error**（正常 no-op 非坏帧）；全局帧照常收发（applied 记 1 不记 0）；**穷举 1/2/MAX/MAX+1/MAX×2
  档条数**钉 `published+1 ⇔ 对端 received+1 且 errors 不增`；**账本-线路恒等**（hub 中枢抓包：2 帧合法上线路
  ⇒ `wireFrames=2=published`，超界不上线路、全局照上、不重复不漏记）；dispose 后叠加守界零回归。
- **Redis 驱动 5 门**：用**两条不同 origin 的 bus**（模拟两进程）手工把发方上线路的帧投给收方 message handler——
  走过生产真实收发路径，避开自发自收被 origin 去重吞掉；超界帧**不挨 ioredis**（`pubA.published` 长度 0，
  对齐 ADR-0132"ioredis 从未被调用"）、published 不虚记、errors 记 1；恰好 MAX 帧上线路且被 parse 认、
  对端 applied 满额；单个 id 超长同样拒绝；全局帧带 `global:true` 投递成立；线路 publish 失败仍是失败账
  （不抛、errors 增、published 不冒充成功）。
- **源码声明绑定门 4 门**（`strip` 先剔注释与字符串字面量，防"注释里出现合法 token"式假绿，A11Y-2 教训）：
  ① 两个驱动 `publish` 都调用**同一个** `isValidOutboundFrame`（防只改一个、防各写一份漂移）；
  ② 守界是纯函数、绑定 `MAX_VIEWERS_PER_FRAME` + `MAX_VIEWER_ID_LENGTH` 两条常量、有 `return false` 拒绝出口、
  自身**不碰** `published`/`errors`；③ 拒绝分支在 `published += 1` **之前** return 且就地记 errors；
  ④ 接收侧 `parseInvalidationFrame` 两条护栏一字未松（本片只加发送侧，不动接收侧契约）。
- **先红 10 红 / 8 绿 → 转绿 18/18**：先加判据未改实现时，10 红精准命中缺口（超界/超长/空串仍记 published、
  对端背锅 errors、不变量与账本恒等破、静态门找不到守界函数），8 绿全是我刻意标记的**零回归结构对照**
  （MAX 边界、空集 no-op、全局帧、dispose、线路 publish 失败、Redis MAX、Redis 全局、接收侧护栏未松）——
  证明判据抓的是 bug 本身、没有假红，也没把既有正确行为一起打红。

### 变异臂（ADR-0077 纪律，四臂各有牙、逐条当场备份 + md5 断言变异真发生 + 恢复后 md5 对齐绿色基线 `f718b798…`、红绿只认 vitest 退出码）

- **臂 A** 删内存驱动守界调用 → **rc=1 红 7 条**（内存超界/超长/空串 + 穷举 + 账本恒等 + 静态双驱动绑定），Redis 侧仍绿；咬住"内存驱动必须守界"与"双驱动共用"。
- **臂 B** 删 Redis 驱动守界调用 → **rc=1 红 4 条**（Redis 超界/超长 + 静态双驱动绑定），内存侧仍绿；对称证明两驱动各自被独立咬住。
- **臂 C** 发送侧条数护栏放宽到 `MAX*2`（收发漂移）→ **rc=1 红 4 条**（内存/Redis 超界 + 穷举 + 账本恒等）；咬住"发送侧必须与接收侧同一界"，放宽即制造"自己认、对端丢"的谎账。
- **臂 D** 拒绝路径仍谎记 `published += 1`（账本缺口复活但不发帧）→ **rc=1 红 6 条**（内存三类 + 穷举 + 账本恒等 + 静态"纯函数不碰账/拒绝分支在记账前 return"）；咬住"published 只记上线路的帧"这一诚实核心。

臂 D 收尾 vitest 曾报 `close timed out after 10000ms`（变异态下退出告警，rc 仍=1 红，不影响判定）；四臂恢复后 md5 全部对齐 `f718b798…`，最终绿复跑 18/18。

## 验证

- 起点：`invalidation-bus.test.ts` 基线 **20/20** 全绿（§MQ-1 起点干净）。
- 判据：本片 `invalidation-bus-outbound-guard.test.ts` **18/18**。
- 横向纯内存零真库回归：本片 + `invalidation-bus`(20) + `discover-cache` + `discover-cache.multi-instance` +
  `discover-view` + `realtime` 合并 **148/148**，既有 128 条零回归。
- 工程门：两改动文件 `eslint` 各 **EXIT=0**；`tsc --noEmit -p apps/web/tsconfig.json` **EXIT=0**。
  （组合 eslint 一度被 SIGTERM 打断、无输出，按纪律不算绿也不算红，拆单文件重跑各自拿真退出码 0。）
- **未 push**。

## 诚实边界

1. **latent 契约缺口，非线上事故**：当前唯一生产调用链每次 ≤2 个 viewer、碰不到 128；本片守的是 public 接口
   将来被批量调用时的账本诚实，不宣称修了正在发生的数据丢失。
2. **出站拒绝 = 那一帧的跨实例失效确实没广播**：对方最坏多用一个 TTL（15s）旧 generation 后自愈（ADR-0114 边界），
   本机 `bumpLocal` 先做、即时生效不破。**不是**"批量失效瞬时全集群生效"——要那个得走调用方分批或分片（另立片）。
3. **选拒绝不选分片**：见决定 §2 ③；若将来真出现 >128 的批量失效需求，须另立片论证分片下的 `published` 语义、
   origin 一致性与对端 applied 合计覆盖，本片不预支那份复杂度。
4. **判据全纯内存 + 源码静态门**，零真 Redis 往返、零真库集成；假连接验的是"发送端自律 + 账本恒等 + 双驱动同口径"
   的契约，**不等于**已在真 Redis 集群上压过超界帧（那条需干净真线路窗口，本机多 agent 抢库做不到，不编绿灯）。
5. `errors` 语义**新增一类出站拒绝**（原为坏回调/线路错误/帧序列化失败）；admin 面板措辞"丢帧退回 TTL"对它也成立，
   但**语义措辞未同步细化**（ADR-0126 留的同类欠账：`InvalidationBusStats` 注释 / admin tooltip 仍是旧文案），
   下片可连同 + 一条"出站拒绝"分列读数一起治理，本片只改行为不改文案以免扩大 footprint。
6. 未改 `InvalidationBusStats` 字段形状、未动 `discover-cache`/前端；真库/真 Redis 大套件与墙钟性能实测仍待干净窗口。

## 后果与仍欠

**已交付**：给失效总线发送侧焊上与接收侧同构的有界护栏，两种驱动共用一个纯函数；`published` 从此只记真正
上线路的合法帧，超界/坏 id 就地记 error 拒绝，消灭"发布成功、对端必丢"的谎账；零字段/零前端/零调用方变化；
18 门判据 + 四变异臂硬证据 + 148 横向零回归。

**仍欠**：
- `InvalidationBusStats` 注释 + admin 面板 tooltip 的语义措辞同步（把"出站拒绝"与"坏回调/线路错误"分列说清，
  可与 ADR-0126 留白合并成一片）；
- 若将来出现 >128 批量失效需求：调用方分批策略 or 总线分片（另立片论证）；
- 真 Redis 线路上的超界帧端到端（需干净 opt-in 窗口，本片只假连接验契约）；
- MQ 序列下一片候选：A11Y 系列 `AgentPanel` 豁免拆除给真实 id、`not-found.tsx` 门面化、`aria-live` 异步状态播报治理等
  （前端登峰造极线），或 ai-service `RedisJobStore` reaper 扫 pending 幽灵（ADR-0134 留白）。
