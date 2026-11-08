# ADR-0083：实时总线的跨实例线路分成两格读数——「启动那一次的闩」与「此刻两条连接」各说各话

状态：已采纳（2026-11-05）
关联：ADR-0077 仍欠 4、ADR-0081 仍欠 2、ADR-0082 仍欠 2、ROADMAP §SEC 第三十六片 仍欠 ④（同一句欠账挂了四处，这一片去还）、
ADR-0028（跨实例频道与形状门）、ADR-0082 决定 3（"读数由驱动自报，界面不自己算"这条路子本片沿用）、
`apps/web/src/server/realtime/bus.ts`、`redisBus.ts`、`localBus.ts`、
`apps/web/src/app/api/admin/realtime/route.ts`、`apps/web/src/app/admin/realtime/stats-readout.ts`、`StatsPanel.tsx`、
`apps/web/test/realtime.test.ts`、`realtime-stats-readout.test.ts`、`realtime.redis.integration.test.ts`、
`admin-realtime.integration.test.ts`、`e2e/realtime-admin.spec.ts`、`docs/SECURITY.md`「实时通道（§163）」

## 背景

限流那三片一路把"这台实例现在用的是哪个驱动"搬进界面（ADR-0082），欠账里每次都抄了同一句：

> **`realtime/redisBus.ts` 里同一形状的 `connectionReady` 还是"一次 error 判死"**（ADR-0077 仍欠 4）。
> 这一片没改它——那份的 `ready` 有没有同类偶发红，没有读数，也没有门。（ADR-0082 仍欠 2）

这一片去查那句"同类偶发红"到底成不成立，结论比写下来时更具体，也更难看：

1. **功能是对的。** `ready` 落定成 `false` 之后，ioredis 那两条连接照默认策略继续重试
   （`retryStrategy` 无限、`min(times*50, 2000)`），订阅侧带 `enableOfflineQueue: true`，
   线路恢复后已登记的订阅自动重建。也就是说 Redis 比这台进程晚起来时，**跨实例投递随后真的通了**
   （`realtime.redis.integration.test.ts` 用真投递验过）。
2. **坏的是读数。** `stats()` 以前只有 `wireReady`——那份**一次性的闩**。于是界面上永远写着
   "没接上——这台实例收不到别机的事件"，而它早就收得到了。这不是"少一个字段"，是**一句话说反**：
   运维对着这台会去做一件没必要的事（重启那台进程），而重启能改变的只有读数。
3. **`ready` 的语义本身没错。** 它回答的是"构造那一次线建起来了没有"，落定后不再变，
   这是它注释里写明的取向，而测试与"想等头几帧的人"要的正是这个信号。
   本片先 grep 了生产路径：`await bus.ready` 只出现在测试与演练里，运行时无人等待——
   所以把它改成活的**不会**修好任何东西，只会把一份"起点稳定的信号"换成另一份已经存在的信号（现读 `status`）。
4. **同一条教训在几个小时前刚被写进隔壁子系统。** 第三十五片给限流闸加 `describe()` 时，
   `rateLimitRedis.ts:401` 那段注释就是这个决定的正文：
   > `wire` 读的是 `client.status`（连接层的**当下**），不是那个 `ready` promise——
   > 后者在构造时落定一次就不再改，用它回答"现在接上没有"会在断线之后继续说"接上了"，
   > 而那正是这一格唯一要防的读法（`ready` 留给测试与演练当"起点稳定了"的信号，用途不同）。

   实时这一片落到的正是那句"唯一要防的读法"，只是错的方向相反：那边怕闩**卡在 true**（断线了还说接上了），
   这边坏在闩**卡在 false**（通了还说没接上）。两个方向现在各有一条真驱动的见证（`dispose` 与"晚起来"），
   合起来才叫"这两格互相独立"，只证一边等于给推导式实现留了一格盲区。

所以这一片的问句从"要不要修 `connectionReady`"换成"**为什么一格里塞了两句不同的话**"。

## 选项

1. **让 `ready` 可重算（变成活的 Promise，error 后不判死）。** 否。两层理由：
   ① 它的语义是"构造那一次的结论"，改成活的等于删掉那一次的答案，而那是目前唯一能区分
   "这台启动时就没接上"与"启动时接上了、后来断了"的证据；
   ② 一个 Promise 表达不了"此刻通不通"，重算的 Promise 每次读都得新造一份，
   等于绕回选项 3 且更贵。
2. **界面自己推断**（`wireErrorCount > 0` 就当断了、`driver === 'redis'` 就当通了）。否。
   ADR-0082 决定 4 已经否过一次同类写法：那是**第二个写入方**，`setRealtimeBus()` 换单例时它会说出
   与现场不符的答案。而且 `wireErrorCount` 与通不通无关——它是累计断帧数，一帧没断过的坏线路是 `0`。
3. **加一格活的 `wire`，闩原样保留，界面分成两行。** 采纳。谁持有现场谁说（读两条连接的 `status`），
   两句话各自成立，各自有措辞。
4. **只留 `wire`，删掉 `wireReady`。** 否。"启动那一次"和"此刻"合并成一句，就是背景里那个 bug 本身——
   只是换了个方向错（要么把已经通了的这台说成死的，要么把启动时没接上这件事洗掉）。
5. **两行合成一行带括号（"此刻：在；启动那次：没接上"）。** 否。措辞层面它等价，
   DOM 层面它是**一格里的两句话**：`data-realtime-wire` 那个属性没法只带一个值，
   而属性正是这一片要钉的东西（臂 W8/W9 全靠它）。

## 决定

1. **`RealtimeBusStats` 加一格 `wire`**，四档 `'up' | 'pending' | 'down' | 'na'`。
   这套词汇与 ADR-0082 里限流闸那份 `RateLimiterReadout.wire` 是同一套话，两份读表现在
   用同一个词表说"此刻通不通"（`rateLimitRedis.ts:416` 那份仍是单连接的映射，见仍欠 1）。
2. **规则本体是导出的纯函数 `wireFromStatuses(pubStatus, subStatus)`**，`liveWire()` 只是拿现值调它。
   拆出来不是为了整洁：`pub` ready 而 `sub` 还在重连这种**半开状态，打真 Redis 造不出来**
   （两侧连的是同一个端点），而"两个都 ready 才算 up"恰恰是这条规则里唯一有内容的一句。
   不拆出来它就没牙——臂 W1 证的正是这件事（纯函数红、集成全绿）。
3. **`end` / `close` 是终局算 `down`，其余不认识的一律 `pending`。** `wait / preparing / connecting /
   reconnecting` 都是自愈中；把重连报成故障，会让人去做一次没必要的重启。
4. **进程内驱动交 `wire: 'na'`**，与 `wireReady: null` / `wireErrorCount: null` 同一族"不适用"。
   `na` 不许抹成 `down`（给一台单实例判了个故障），两个 `null` 不许抹成 `0`
   （对着进程内驱动宣布"你的 Redis 很健康"）。
5. **界面分成两行，各自一个 `data-` 属性**：`data-realtime-wire`（此刻）与 `data-realtime-wire-boot`（启动那次）。
   措辞从 `StatsPanel.tsx` 挪进 `stats-readout.ts` 成纯函数（`liveTag` / `bootTag` / `errorCountText` / `isKnownStats`），
   理由写在文件头：**这两格的全部价值就在于它们可以合法地不一致**，
   一句合成话的写法在界面上看不出任何毛病，只能把逐档措辞变成可判定的纯函数来钉。
6. **面板只画它认得的回执**（`isKnownStats`：`driver` 是字符串、`subscriberCount` 是数、`wire` 是字符串）。
   认不出来直接说"回执形状不认识"，不拿半截数据渲染一个看起来正常的表盘。
7. **`wire` 的限度写进注释与界面**：它是这个进程里 ioredis 对那条 TCP 的看法，
   **不是**"订阅仍在服务器那边登记着"的证明；后者由真投递用例负责，不靠读数充数。

## 后果

- 改之前那台"Redis 晚起来"的实例在界面上的读数**逐字**是：`跨实例线路 = 没接上——这台实例收不到别机的事件`
  （旧面板只有一行，`data-realtime-wire` 挂的就是闩）。改之后同一台是两行：
  `此刻 = 在（发布与订阅两条连接都 ready）` / `启动那次 = 没接上（此后归连接层自动重连——"现在通不通"看上面那一行）`。
- 旧措辞里其实**已经承认了这半件事**：`up` 那档写的是"已接上（构造那一次；后来断了由连接层自动重连）"。
  括号里那句说的是真话，读到的值却还是那一天的结论——所以 Redis 晚起来那台永远读 `down`，
  而那台是**真的收得到**别机的事件。这句话与那份读数的落差，就是 ADR-0077 仍欠 4 记的那格。
- **`ready` 一字未改**（语义、永不 reject、落定后不再变都保持原样），所以任何依赖它当
  "起点稳定了"的测试与演练不受影响。这一句是决定的前提，不是附带好处：
  读数这一族改动如果动了功能语义，就不叫修读数了。
- **两格可以合法不一致**这件事需要一条专门的见证，因为它是"看起来像 bug"的形状
  （同一页上两句话互相打脸）。`realtime.redis.integration.test.ts` 新增的「线路比这台晚起来」就是它，
  而 `dispose` 那条给的是**反方向**的不一致（闩 `true` 而 `wire` 是 `down`）。
  两个方向都在，任何"从另一格推导这一格"的实现都会同时红一片。
- 界面层多了两个可钉的位置，也多了一条纪律：**以后再有第三句关于线路的话，得是第三行而不是往这两行里塞**。

## 现场怎么造出来的（这一片最有意思的一件）

"Redis 比这台晚起来"不能靠真 Redis 演示——那台容器要么在要么不在，而它不在时
ioredis 连的是"没有端点"，不是"端点后来出现"。做法是**纯字节转发器**：

- 一个 `node:net` 的 server 听在 `LATE_PORT = 56998`，**不认识 RESP**，只把两条 socket 对接；
  上游那半在客户端连上来时才现连真 Redis（`56379`），`close` 事件里互相 `destroy`。
- 总线连的是转发器端口，所以构造时那个端口上没人听 ⇒ 闩落定成 `false`；
  随后 `openLateEndpoint()` 把转发器打开，握手、`subscribe`、自动重订**全部走真 ioredis 与真 Redis**，
  仪器只负责让端点"晚一点出现"。
- 这条用例不止验读数：翻成 `up` 之后它经 `wireConnection()` 发一帧**真事件**，
  本机订阅者收到 1 条。"读数说 up"与"事件真过来"在同一条用例里对上，
  否则这一格就只是第二个自报家门。

## 见证（逐字）

单测与集成（`npx vitest run --no-file-parallelism`，2026-11-05 04:36 那一遍，全绿）：

```
apps/web/test/realtime.test.ts + apps/web/test/realtime-stats-readout.test.ts
 Test Files  2 passed (2)      Tests  31 passed (31)
apps/web/test/realtime.redis.integration.test.ts
 Test Files  1 passed (1)      Tests  9 passed (9)
apps/web/test/admin-realtime.integration.test.ts + apps/web/test/realtime.integration.test.ts
 Test Files  2 passed (2)      Tests  18 passed (18)
```

类型与静态检查：`npx tsc -p apps/web/tsconfig.json --noEmit` 与 `npx tsc -p e2e/tsconfig.json --noEmit` 无输出；
`npx eslint` 对本片 10 个文件无输出；收尾 `grep -rn "MUT " apps/web/src apps/web/test e2e` = **0**。

浏览器（`e2e/realtime-admin.spec.ts`，三段共用一次登录；打的是 3101 那台**没设** `NEXUS_REDIS_URL` 的 dev server）：

```
== §SEC 第三十七片 浏览器读数（真驱动那一台）==
  驱动=in-process 此刻=na 启动那次=na 失败累计=—（没有线路，不适用）

== 晚起来那份回执 ==
  此刻=在（发布与订阅两条连接都 ready）
  启动那次=没接上（此后归连接层自动重连——"现在通不通"看上面那一行）
```

截图：`.scratch/shots/61-admin-realtime-two-rows-in-process.png`（这台自己的回执）与
`.scratch/shots/62-admin-realtime-two-rows-late-redis.png`（晚起来那份，两行各说各话 + `失败累计 3`
下面那句"失败的帧不补发"）。

第三段喂的是 `wire: 'READY'`（不在四档里）：界面上那一行长成 `data-realtime-wire="na"` 并写
"—（这个驱动没有线路）"——猜 `up` 是把没证据的这台画成健康，猜 `down` 是给它判死。

## 臂表（每条＝改坏一处 → 哪条用例红，逐字）

| 臂 | 改坏的地方 | 红在哪（逐字） |
| --- | --- | --- |
| W1 | `wireFromStatuses` 只看发布侧（`pubStatus === 'ready' ? 'up' : 'pending'`，半开也算通） | `realtime.test.ts > wireFromStatuses（此刻通不通那条规则） > 半开不算 up：发布侧 ready 而订阅侧还在重连＝还没订上，答案是不能收`。**同一遍 `realtime.redis.integration.test.ts` 全绿**——半开在真 Redis 上造不出来，这就是纯函数存在的理由 |
| W2 | 摘掉 `end` / `close` 那支（终局算进"还在路上"） | 2 红：`wireFromStatuses > 任何一侧 end / close 都是 down，另一边 ready 也救不回来` + `realtime.redis.integration > stats()：闩与活读数是两格——dispose 之后 wire 变 down，而 wireReady 仍是 true` |
| W3 | `liveWire()` 从闩推导（`this.wireReadyValue === true ? 'up' : 'pending'`） | 首跑 **1 红**：`stats()：闩与活读数是两格——dispose 之后 wire 变 down…`（那时"晚起来"那条还没写） |
| W3b | 同一臂，在"晚起来"用例进来了之后复跑 | **2 红**：`dispose 之后 wire 变 down…` + `线路比这台晚起来 > 端点后来通了：wire 从 pending 翻成 up，而闩落定成 false 就不改口`。这一对是"两格独立"的正反两面 |
| W4 | `localBus` 的 `wire: 'na'` 换成 `'down'` | 2 红：`realtime.test.ts > stats() 自报家门：进程内驱动的线路两格是 null 不是 0（没帧可断），活读数报 na 不是 down` + `admin-realtime > admin → 200，回执形状就是总线自报的那份（null 不被改成 0、na 不被改成 down）` |
| W5 | 面板 `liveTag` 的兜底从 `na` 换成 `up` | `realtime-stats-readout.test.ts > liveTag：现读值只认四档 > 不认识的一律 na，不许猜成 up 或 down` |
| W6 | `isKnownStats` 去掉 `wire` 那一行检查（旧回执也能通过形状门） | `realtime-stats-readout.test.ts > isKnownStats：面板只画它认得的自报家门 > 缺 wire / 缺 driver / 计数不是数 / 空回执都不通过` |
| W7 | 端点二次加工（`/api/admin/realtime` 不原样交出两格） | `admin-realtime.integration.test.ts` **两条全红**：`admin → 200，回执形状就是总线自报的那份…` 与 `读的是单例：换掉总线，回执跟着换（诊断不是某个类的静态属性）` |
| W8 | 界面上摘掉"启动那次"那一行（只剩一行） | e2e **2 failed**（真驱动那台 + 晚起来那段）。首跑这一条**卡了 180 秒才红**：取值用的 `getAttribute` 会等到用例超时。修法是取值前加两条有界 `toBeVisible({timeout:20_000})` 并带上"少了哪一行"的消息——**慢红也算没牙** |
| W9 | "此刻"那一行的文案改用 `BOOT_LABEL[boot]`（两行说同一句话） | **2 failed**（晚起来那段 + 未知档那段），真驱动那台**仍绿**：那一段的牙在"进程内的两格都是 na"，不在别名上。点名见下面没牙第 3 条 |

每条臂单步 Edit 改写、跑完立刻恢复、一次只留一条。

## 没牙的格子，点名

1. **半开状态在真 Redis 上不可构造**（臂 W1 那一遍集成全绿就是这件事的读数）。
   它对只认发布侧的实现有牙，但那份牙只在纯函数这一层，落不到真连接上。
2. **`wire` 与服务器侧名册的关系**：没有任何门能证"读数说 up ⇒ 服务器那边还给我留着订阅"。
   这一格靠的是真投递用例（`realtime.redis.integration.test.ts` 的跨实例投递那几条），
   不是靠 `wire`；写进注释与界面措辞，是为了别拿读数当证据。
3. **`data-realtime-wire-boot` 与 `data-realtime-wire` 在进程内那台上必然同值**（都是 `na`），
   所以臂 W9 那一类"把下面那行写成上面那行的别名"在真驱动那一段抓不到，要靠喂形状那两段。
4. **4 秒轮询周期本身**：没有门（沿用 ADR-0082 同一条没牙的格子，这一片没改它）。
5. **`/admin/realtime` 的门（401 / 403）**：这一片没动它，它由 `admin-realtime.integration.test.ts`
   前三条负责；本文件的臂表只覆盖回执形状那两条。

## 仍欠

1. **`rateLimitRedis.ts:416` 那份单连接映射与 `wireFromStatuses` 是同一条规则的两处写法**。
   现在两份用同一套词表但各有实现：限流闸只有一条命令侧连接，它的 `status==='ready'?'up':(close|end)?'down':'pending'`
   等价于 `wireFromStatuses(s, s)`。要不要合并成一处（`wire` 的词汇抽到共享模块），
   留给下一个真的改这条规则的人——今天两处都有门（R2 与 W1/W2），先不为了整洁制造一次跨子系统的改动。
2. ~~**`ready` 落定成 `false` 这件事现在只有界面上那一句"启动那次"**，`wireErrorCount` 会把
   原因（`发布连接未就绪` / `订阅线路`）打进 stderr，但**没有按原因的计数**进读数。
   限流闸那半边有 `fallbackByReason`，这半边没有对应物。要补就是给 `countWireError` 加一本按原因的账，
   与 `wireErrorCount` 那个总数并存。~~
   **已于 2026-11-06 第三十九片还清**：`WIRE_ERROR_REASONS` 闭合词表 + `wireErrorByReason` 完整账 +
   `Σ 分账 === 总数` + 形状门"两本账同口供"，见 `docs/adr/0087-realtime-wire-error-ledger-by-reason.md`。
   顺带把当时沉默的那格（订阅连接收到别的线路名）变成有数的。
3. **转发器那条用例的端口是钉死的（`56998`）**：同一台机器上并行跑两份这个文件会撞端口。
   今天靠测试串行（`--no-file-parallelism`）盖住；要真并行得换成 0 端口 + 读实际端口，
   而那样一来"构造时那端没人听"要靠时序而不是端口号，得重新设计。
4. **`e2e/realtime-admin.spec.ts` 后两段是 `page.route` 喂的形状**：它们证的是**界面拿到这种形状怎么说人话**，
   不证那台真处于那个现场。为什么不换真驱动跑：`NEXUS_REDIS_URL` 同时管着限流闸，
   不为一张图去改共享 dev server 的环境（真实现场由集成测试负责，两边不互相冒充）。
   （2026-11-06 更新：第三十九片把这条扩成**后三段**，新增那段喂的是"半截回执"。）
