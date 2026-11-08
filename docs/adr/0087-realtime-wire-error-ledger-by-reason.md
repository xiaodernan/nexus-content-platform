# ADR-0087：线路失败按原因分账——一本闭合的账、总数与分账必须同口供、界面不认字只照读

状态：已采纳（2026-11-06）
关联：ADR-0083 仍欠 ②（同一句欠账，本片去还）、ADR-0082 决定 3（读数由驱动自报）、
ADR-0028（跨实例频道与形状门）、`94d7cfe`（把分账写进 `stats()` 却没改那两条严格 `toEqual` 的那次提交）、
`apps/web/src/server/realtime/wireErrors.ts`（新增）、`redisBus.ts`、`bus.ts`、
`apps/web/src/app/admin/realtime/stats-readout.ts`、`StatsPanel.tsx`、`apps/web/src/app/api/admin/realtime/route.ts`、
`apps/web/test/{realtime,realtime-stats-readout,realtime.redis.integration,admin-realtime.integration,realtime.integration,agent-orchestration.integration,publish-build-status.integration,storyboard-render-build-status.integration}.test.ts`、
`e2e/realtime-admin.spec.ts`、`docs/SECURITY.md`「实时通道（§163）」

## 背景

第三十七片把线路读数改成两格之后，欠账里留了一句（ADR-0083 仍欠 ②）：

> **`ready` 落定成 `false` 这件事现在只有界面上那一句"启动那次"**，`wireErrorCount` 会把原因…打进 stderr，
> 但**没有按原因的计数**进读数。限流闸那半边有 `fallbackByReason`，这半边没有对应物。
> 要补就是给 `countWireError` 加一本按原因的账，与 `wireErrorCount` 那个总数并存。

去查这句话时先撞上的不是欠账，是**一条已经红着的门**。`94d7cfe`（一条英文单行提交，没跑门就把工作区状态收进去）
已经给 `RedisRealtimeBus.stats()` 加了 `wireErrorByReason`，但没动 `realtime.redis.integration.test.ts` 里那两条
严格 `toEqual`——于是这个文件从那次起一直是红的：

```
AssertionError: expected { driver: 'redis', …(6) } to deeply equal { driver: 'redis', …(5) }
+   "wireErrorByReason": {},
```

这条红比"少一个字段"更难看的地方在于：**它红在形状上，而不是红在语义上**。那两条 `toEqual` 是全片最硬的门
（整份回执逐字段比），它们抓到了新增的 key，却没有抓到"这个 key 里的数是谁写的、总数与分账对不对得上、
词会不会漂"——门只说"形状变了"，不说"这本账有没有牙"。

再查那本已经存在的账，四处都是软的：

1. **类型是 `Partial<Record<string, number>>`**，于是"这一格没出过事"与"这一格没人数"同形；
2. **写侧的原因是一句随手写的中文**（`countWireError('投递', …)`），没有任何地方钉住词表——
   同一个意思写成 `发送失败`，账就碎成两行各说一半，而**总数还是对的**；
3. **有一格根本不记账**：订阅连接上收到**别的线路名**的帧（正常配置下永远为 0，非 0 就等于有人改错了订阅集合），
   那里以前是一个光秃秃的 `return`——最难发现的一类错恰好是唯一没有读数的格子；
4. **界面只有总数**，运维看到"断过 3 帧"分辨不出该去看 Redis、去看发帧那段代码，还是去看订阅配置——
   这三件事的第一反应不一样，所以只给总数等于不给建议；
5. **形状门 `isKnownStats` 不认这本账**：喂一份没有 `wireErrorByReason` 的回执照样通过，
   于是界面上同屏出现"失败累计 3"与"—（没有线路，不适用）"而没有任何东西响。第 5 条正是 `94d7cfe`
   那次能悄悄进来的门缝。

## 选项

1. **只补界面（把 `wireErrorByReason` 印出来），不动写侧。** 否。词会漂、账会缺格、有一格永远为 0——
   印出来的那句话本身没被任何门证过，等于把一句不可信的话搬到界面上并给它加了一次曝光。
2. **原因用自由字符串 + `Partial`。** 否。①"没出过事"与"没人数"同形，运维读不出差别；
   ②错别字（`投递` vs `发送失败`）不报错、不红门，只让账变碎；③类型层抓不到"新增一格忘了在界面说人话"。
3. **词表放进 `redisBus.ts`，让 `bus.ts` 与测试从那里 import。** 否。`bus.ts` 定义 `RealtimeBusStats`，
   `redisBus.ts` 实现它——词表放实现侧就成了**类型依赖实现**，`localBus.ts` 也得跟着 import 一个它用不上的东西，
   而测试想逐字断言词表时又得穿过整个驱动。单独一个文件、谁都不 import，是三处共享同一批字的最低成本做法。
4. **闭合词表 + 完整账（每一格都在，没出过事的是 `0`）+ 总数与分账同口供 + 界面照读不认字。** 采纳。
   下面逐条说为什么每一条都对应一次具体的红。
5. **界面也维护一份原因白名单（只印它认识的词）。** 否。那是把"词表"变成两处写法，
   而且漂移的方向是**静默少印**：服务端加一格、界面不认识就不画，总数照涨——臂 W7 证的正是这个形状。

## 决定

1. **`wireErrors.ts` 里钉一份闭合词表** `WIRE_ERROR_REASONS`（10 格：`发布连接 / 订阅连接 / 发布连接未就绪 /
   订阅线路 / 订阅回执形状不认识 / 线路名不认识 / 帧序列化 / 投递 / 收到的帧不是 JSON / 收到的帧不合契约`）。
   这个文件不 import 任何东西，`countWireError` 的第一个参数类型 `WireErrorReason` 由它导出——
   **写错一个字编译不过**，这是"词不漂"的第一道牙（比运行期断言便宜，且不给"生产环境才发现"留机会）。
2. **账是闭合完整的**：`emptyWireErrorLedger()` 从词表生成，每一格都在、初值 `0`；
   `RealtimeBusStats.wireErrorByReason` 从 `Partial<Record<string, number>> | null` 改成
   **必填** 的 `Record<WireErrorReason, number> | null`。必填这一刀立刻产生 9 处编译错（7 个测试替身 + 2 处类型），
   那些就是它要的牙：**没有哪个驱动能只报总数、不报分账**。
3. **`stats()` 交出的是副本**（`{ ...this.wireErrorByReason }`），端点原样转交、不做二次加工（臂 W8）。
4. **总数与分账同口供**，钉在形状门里：`return (value.wireErrorCount === null) === (ledger === null)`，
   并且 `wireErrorByReason === undefined` 直接算不认识（**缺格 ≠ 不适用**）。
   这条规则拦的是 `94d7cfe` 那一类提交：只加一本账、不加这条，喂一份缺 key 的回执就能渲染出自相矛盾的表盘。
5. **驱动词只有两个**（`in-process` / `redis`）。第三个词会被 `StatsPanel` 那句
   `driver === 'redis' ? … : '进程内（单实例默认）'` 画成"这台没有线路"——对着一台真有线路的机器宣布它没有线路，
   是最难看出来的一种读反。
6. **界面不认字，只照读**：`errorReasonList` 收 `Record<string, number>`（**不是** `WireErrorReason` 那个联合），
   把驱动写下的字原样印出来。配套一条门：喂**整个词表**各 1 次，断言每一格都出现在文案里、
   且 `split(' · ')` 的长度等于词表长度——服务端加一格，界面不改也印得出来，改了反而会被这条门问一句为什么。
7. **`线路名不认识` 从沉默变成有数**：帧照旧丢掉（别的名字上的字节不是这台总线的契约），但这一格记账并出声。
   它的见证用**真 Redis** 复现：把总线自己那条 `sub` 连接再订一个线路名（订阅模式下一条连接可订多个频道），
   从另一侧往那个名字发帧——不是 `emit` 模拟。同一条用例里另有对照：同一时刻往**正确的** `WIRE_CHANNEL`
   发一帧，本机订阅者收到 1 条，所以"没送达"不是一句空断言。
8. **`Σ 分账 === 总数` 是常驻不变量**，写进三条用例（坏帧、线路名不认识、端点连不上），
   不是只在"新加那格"里查一次。

## 后果

- 界面上多一行「失败按原因」。真驱动那台（进程内）逐字是 `—（没有线路，不适用）`；
  喂一份 Redis 回执（`wireErrorCount: 3`，分账 `{投递: 2, 收到的帧不合契约: 1}`）逐字是 `投递 2 · 收到的帧不合契约 1`。
- **`94d7cfe` 留下的那条红修好了**，而且修法不是把 `toEqual` 放宽：那两条严格比较现在逐字段写着
  `wireErrorByReason: zeroLedger()`，而 `zeroLedger()` 在测试里**由词表就地构造**，
  故意不 import `emptyWireErrorLedger()`——否则实现与断言读同一份函数，账变了两边一起变，门就成了自证。
- 一处"看起来正常"的半截回执从此画不出表盘：e2e 第四段喂 `{...receipt({wireErrorCount: 3}), wireErrorByReason: undefined}`，
  界面上只有"拉取失败（回执形状不认识）"，`[data-realtime-errors]` 与 `[data-realtime-wire]` 两个选择器 `toHaveCount(0)`。
  注意 `JSON.stringify` 会丢掉 `undefined`——那正是真实世界里"驱动没带这一格"的形状。
- 新增的那一格（`线路名不认识`）在生产里非 0 就说明**有人改错了订阅集合**，
  这一句现在既是 stderr 里的一句话，也是界面上的一个数。
- 类型层的连带效果：`bus.ts` 只 import 类型（`import type { WireErrorReason }`），
  `redisBus.ts` 才 import 值（`emptyWireErrorLedger`）——否则 `bus.ts ↔ redisBus.ts` 会绕成一个运行时环。
- 一条纪律被再次确认：**惰性变异＝没测**。这本账在 `94d7cfe` 之前就"存在"了三个字段宽度的时间，
  没有任何门说过它对不对——存在但没被断言的读数，与没有它，在事故里是同一个东西。

## 见证（逐字）

起点（本片第一个动作，未改任何代码）：`realtime.redis.integration.test.ts` **1 failed | 8 passed**，
红项是上面那条 `+ "wireErrorByReason": {}`。

收尾（2026-11-06 03:2x，全部八条臂恢复之后重跑）：

```
apps/web/test/realtime.test.ts + apps/web/test/realtime-stats-readout.test.ts
 Test Files  2 passed (2)      Tests  37 passed (37)
apps/web/test/realtime.redis.integration.test.ts
 Test Files  1 passed (1)      Tests  10 passed (10)
apps/web/test/admin-realtime.integration.test.ts
 Test Files  1 passed (1)      Tests  4 passed (4)
本片五个文件合跑
 Test Files  5 passed (5)      Tests  65 passed (65)
三个替身文件（agent-orchestration / publish-build-status / storyboard-render-build-status）
 Test Files  3 passed (3)      Tests  32 passed (32)
```

类型与静态检查：`npx tsc -p apps/web/tsconfig.json --noEmit` 与 `npx tsc -p e2e/tsconfig.json --noEmit` 无输出；
`npx eslint` 对本片文件无输出；收尾 `grep -rn "MUT " apps/web/src apps/web/test e2e` = **0**。

浏览器（`e2e/realtime-admin.spec.ts`，四段共用一次登录，`NEXUS_WEB_URL=http://localhost:3100`）：

```
== §SEC 第三十七片 浏览器读数（真驱动那一台）==
  驱动=in-process 此刻=na 启动那次=na 失败累计=—（没有线路，不适用） 失败按原因=—（没有线路，不适用）

== 晚起来那份回执 ==
  此刻=在（发布与订阅两条连接都 ready）
  启动那次=没接上（此后归连接层自动重连——"现在通不通"看上面那一行）
  失败按原因=投递 2 · 收到的帧不合契约 1

  1 passed (2.7m)
```

截图：`61-admin-realtime-two-rows-in-process.png`（进程内那台，两格都是不适用）、
`62-admin-realtime-two-rows-late-redis.png`（新那一行「失败按原因 投递 2 · 收到的帧不合契约 1」在
「线路失败累计 3」下面，两行各说各话）、
`63-admin-realtime-half-receipt.png`（半截回执：整页只有"拉取失败（回执形状不认识）"，表盘一个字段都没画）。

**仪器的一次自伤**：这一片第一次跑 e2e 用了 `--no-file-parallelism`（那是 node:test 的旗标，Playwright 不认），
命令立刻 `error: unknown option` 退出；换成 `--workers=1` 后又让后台一份、前台一份同时跑，
两份共用同一个 `test-results/` 目录，后台那份在 `browserContext.close` 时报
`ENOENT … .playwright-artifacts-0/traces/….trace` 而判红——**四条断言其实全过了**（读数逐字都在输出里）。
结论记进纪律：e2e 一次只跑一份，别把并行的仪器红当成产品的红，也别用退出码代替读数。

## 臂表（每条＝改坏一处 → 哪条用例红，逐字）

| 臂 | 改坏的地方 | 红在哪（逐字） |
| --- | --- | --- |
| W1 | `线路名不认识` 那一格不记账（订阅消息处理退回光秃秃的 `if (wireChannel !== WIRE_CHANNEL) return;`） | `realtime.redis.integration.test.ts > 线路名不认识的帧：丢掉、记在自己那一格、不落本机订阅者`：**1 failed \| 9 passed**，`expected 0 to be greater than or equal to 1` |
| W2 | 不分原因，全记在 `投递` 上（`countWireError` 里把 `context` 换成字面量） | **3 failed \| 7 passed**：`expected +0 to be 1`（坏帧那两条逐格增量）、`expected 0 to be greater than or equal to 1`（线路名不认识） |
| W3 | 只涨总数，分账不动（摘掉 `this.wireErrorByReason[context] = …` 那一行） | **3 failed \| 7 passed**，同那三条 |
| W4 | 形状门不要求同口供、缺格也放行（`wireErrorByReason === undefined` 那行与末句 `(count===null)===(ledger===null)` 一起摘） | `realtime-stats-readout.test.ts > isKnownStats… > 两本线路账同口供：总数有数而分账缺席，就是半截回执`：**1 failed \| 16 passed**，`expected true to be false` |
| W5 | 驱动词不钉（`driver !== 'in-process' && driver !== 'redis'` 换成 `typeof driver !== 'string'`，第三个词也放行） | `… > 驱动只认两个词：第三个词会被面板那句三元画成"进程内（单实例默认）"`：**1 failed \| 16 passed**，`expected true to be false` |
| W6 | 开局空账而不是闭合零账（字段初值 `emptyWireErrorLedger()` 换成 `{}`） | **3 failed \| 7 passed**，逐字 `expected NaN to be 1`（`1 - undefined`）与 `expected { driver: 'redis', …(6) } to deeply equal { driver: 'redis', …(6) }`。**这一臂是 W2/W3 那三条红的另一种错法**：账不闭合时增量算得出 NaN 而不是 0，读数会骗人 |
| W7 | 界面自己维护一份原因白名单（`errorReasonList` 只印它认识的词） | `realtime-stats-readout.test.ts > errorReasonList… > 词表里每一格都印得出来：界面不认字，只照读`：**1 failed \| 16 passed**，`expected '发布连接 1 · 发布连接未就绪 1 · 帧序列化 1 · 投递 1 · …' to contain '线路名不认识'` |
| W8 | 端点自己加工一层，把分账丢掉（`/api/admin/realtime` 不原样交出） | `admin-realtime.integration.test.ts` **2 failed \| 2 passed**：`expected false to be true`（形状那格）与 `expected undefined to deeply equal { '发布连接': +0, '订阅连接': +0, …(8) }`（"回执就是总线自报的那份"） |

每条臂单步 Edit 改写、跑完立刻恢复、一次只留一条。W4→W5 换臂时我自己在一次 Edit 里多摘掉了账本那一段
（`isKnownStats` 一度没有 `return`），是读回函数时发现的——**臂的恢复也要验，不然红项会留下永久伤疤**。

## 没牙的格子，点名

1. **`Σ 分账 === 总数` 只在集成层查**（三条用例），端点与界面都不查它——`isKnownStats` 钉的是"两本账同不同口供"，
   不是"分账加得对不对"。要让界面也钉，得先决定不一致时说什么（"账目不合"？），那是另一片的措辞设计。
2. **词表漂移的编译期牙只覆盖服务端**。测试替身与 e2e 喂的是字面量对象，写错一个原因名不会编译错，
   只会在逐格增量那条用例红——那两条用例存在，但 `errorReasonList` 对 UI 是 `Record<string, number>`，
   所以"界面拿到一个词表里没有的名字"是**合法形状**（照读并印出来），不是错。
3. **`线路名不认识` 的见证靠的是把总线自己的 `sub` 连接多订一个名字**，这是对 ioredis 内部字段的定向访问
   （`(bus as unknown as { sub: Redis }).sub`）。它能红（W1），但它不是"生产里订阅集合被谁改错了"的那条路径——
   真生产形态要靠配置错误才出现，今天没有那样的用例。
4. **进程内驱动没有这本账**（`null`），所以"两本账同口供"那条门对 `localBus` 只验到 `null/null` 那一支。
5. **4 秒轮询周期本身**、**`/admin/realtime` 的门（401/403）**：沿用 ADR-0083 点名的两条没牙格子，本片没动。

## 仍欠

1. **界面上不查 `Σ 分账 === 总数`**（上面没牙第 1 条）。补法要先定措辞——那一格是"账目不合"这种
   指向仪器自身的话，还是把总数改成由分账现算（后者会推翻"驱动自报"的 ADR-0082 决定 3）。
2. **`rateLimitRedis.ts` 那份单连接 `wire` 映射与 `wireFromStatuses` 仍是同一条规则的两处写法**（ADR-0083 仍欠 1），
   本片没碰；词表这一族倒是给了个现成的样子：共享一个不 import 任何东西的小模块。
3. **`WireErrorReason` 与界面 `Record<string, number>` 之间没有运行时校验**：端点交出的 key 若不在词表里，
   今天照印。要不要在 `isKnownStats` 里加"key 必须都在词表内"，取决于运维是否宁愿看到"不认识的原因"而不是
   一个被吞掉的数——我倾向后者（吞数比生词危险），但那意味着界面要重新认识词表，与决定 6 相冲，留给下一次。
4. **转发器端口钉死 56998**、**e2e 后三段是 `page.route` 喂的形状**：两条照旧（ADR-0083 仍欠 3/5）。
5. **e2e 一次只能跑一份**（`test-results/` 是共享目录）：这次撞上的那份假红值得在 `docs/TESTING.md` 里立一条，
   那个文件归并行会话所有，本片不改。
