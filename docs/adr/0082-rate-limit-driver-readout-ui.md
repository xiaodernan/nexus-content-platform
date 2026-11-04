# ADR-0082：限流闸"装的哪个驱动、名额钉在几、有没有正在退回"进界面——读数由驱动自报，两本按原因的账仍从 counters 读

状态：已采纳（2026-11-05）
关联：ADR-0076 仍欠 2（2026-10-31 写下，这一片去还）、ADR-0077 仍欠 1、ADR-0081 仍欠 1（同一句欠账挂了三份文件）、
`apps/web/src/server/security/rateLimit.ts`、`rateLimitMemory.ts`、`rateLimitRedis.ts`、
`apps/web/src/app/api/admin/rate-limit/route.ts`、`apps/web/src/app/admin/rate-limit/`、
`apps/web/test/rate-limit-readout.test.ts`、`apps/web/test/admin-rate-limit.integration.test.ts`、
`e2e/ratelimit-admin.spec.ts`、`docs/SECURITY.md`「认证与授权」限流那条、`docs/ENVIRONMENT.md` 的 Redis 与部署口径两条

## 背景

ADR-0076 收尾时把自己那格欠账写得很直白：

> **"这台实例现在用的是哪个驱动"没有界面位。** `RealtimeBus` 有 `stats()`，`RateLimiter` 没有——
> 加它要动接口，两个驱动都得实现，留给下一个真的要看这个数的人。
> 今天的答案只有启动那一行日志（`[rateLimit] 驱动=…`）与 `nexus_rate_limit_driver_fallbacks_total` 有没有数。

"留给下一个真的要看这个数的人"这一句，两个后续 ADR 又各抄了一遍（ADR-0077 仍欠 1、ADR-0081 仍欠 1）。
这一片就是那个人来的，而且它不是装饰，理由有两条：

1. **不设 `NEXUS_REDIS_URL` 时，限额那句话逐字换主语。** "登录 10 次/15 分钟/邮箱"变成"每台各 10 次"。
   看得见部署的人（复核台、后台）没有一个会去 grep 那台进程的 stdout，而 ADR-0081 之后又多了一格
   同样只有日志会说的话：`{reason="over-cap"}` 说的是**名额用完**，不是** Redis 坏了**——对调用方两者
   同形（都是本机窗口给的判定），差别只在运维要不要去动那台 Redis。
2. **这一片在开发期间就用界面抓到了两次只有 counters 里才看得见的退回**（下面"后果"里逐字）。
   如果那两次是靠 `curl /api/metrics` 手跑的，它们就不会成为见证——"手跑的见证等于没有见证"。

## 选项

1. **只加一个 Prometheus 抓取口，不写界面。** 否。`/api/metrics` 早就带着那两个 counter，问题从来不是
   "读不到"，是"没人会去读"。欠账写的是**界面位**。
2. **让 `GET /api/admin/realtime` 顺手多带几个字段。** 否。两个子系统一份回执，将来任何一方改字段
   都要动另一方的门；`RealtimeBus.stats()` 那份的形状（`wireReady` / `wireErrorCount`）也不该被当成
   限流那一份的模板——它们的"不适用"位置不一样。
3. **驱动自报一份 `describe()`，界面读它。** 采纳。与 `RealtimeBus.stats()` 同一条既有路子：谁持有现场谁说。
4. **界面自己算**（读环境变量 + 按"设了就是 Redis"推断）。否。那是**第二个写入方**：`setRateLimiter()`
   换过单例时（测试、将来的多驱动装配）它会说出一个和现场不符的答案，而且没人知道为什么。

## 决定

1. **`RateLimiter` 接口加 `describe(): RateLimiterReadout`**（`rateLimit.ts:82`），两个驱动各实现
   （`rateLimitMemory.ts:148` / `rateLimitRedis.ts:408`）。它是**同步**的，这是刻意的：一个诊断读数
   不许为了"数得更准"去打网络，也不许把 250ms 那套每请求预算搬到页面上。
2. **三个"不适用"用 `null` / `'na'`，不许抹成 0 / `'up'`**：进程内那一份的 `keyPrefix`、`fallbackCount`
   是 `null`，`wire` 是 `'na'`。每一格都是一句"这个驱动没有这个东西"，抹平之后界面会说谎
   （"前缀是空的"读起来像配置丢了，而不是"这里没有键空间"）。
3. **`wire` 读 `client.status`（live），不读那个一次性的 `ready` promise。** `ready` 只在第一次落定，
   之后断开、重连、`disconnect()` 它都不改主意；用它做线路格子会永远说"通着"。
4. **`bucketsTracked` 两个驱动同名、不同权威**：进程内＝那张 `Map` 自己（它就是权威）；
   Redis＝**这台最近一次判定带回的**名册条数，权威是那台 Redis 的 `ZCARD`，长时间没流量时它是旧的。
   这句限度写在页面的文案里（`StatsPanel.tsx` 那一行的括号），不只写在注释里——注释不给读页面的人看。
5. **`deployment.redisUrlConfigured` 与 `driver` 分开交**：一句是"**该装哪个**"（按环境变量），
   一句是"**现在在跑哪个**"（按现场）。合成一句就看不出"变量没设 ⇒ 每台各数各的"那句代价，
   也看不出"这台装的不是按变量该装的那个"。
6. **两本按原因的账（`fallbackByReason` / `bucketsPrunedByReason`）从 `snapshot()` 现读**
   （`route.ts:23` 的 `counterByReason`），**不让驱动自报**。同一句话只允许一个写入方：驱动说"退过 3 次"
   而 counters 说 0 时，这一页必须说出 counters 那一句。
7. **门与复核台、实时总线同一句口径**：默认拒绝（没登录 401，`role!=='admin'` 403 且一个字段都不给）。
   交出的是"整台实例的闸怎么装的"，含键前缀与上界数字——不是每个人的机密，但也不是每个人的事。

## 后果

- 好：`{reason="over-cap"}` 与 `{reason="command-failed"}` 在界面上是两句话（后者写"命令失败（Redis 没答上）"，
  前者写"桶键名额用完（不是 Redis 坏了）"），ADR-0081 那条"拒的是键的数目不是请求"第一次有了落点。
- 好：这一页**只回答这台实例**。页脚与口径脚注都写了"多实例部署下每台各算各的，回答这次请求的那台会说话，
  别台不会"——诊断页最容易犯的错是把一台的数说成全局的数。
- 代价：`RateLimiter` 多一个方法 ⇒ 任何假实现都得补 `describe()`。本片自己就撞到两处
  （`admin-rate-limit.integration.test.ts:138`、`rate-limit-readout.test.ts:133`）。以后加第三个驱动同样要补。
- 代价：`describe()` 同步 ⇒ Redis 那份的 `bucketsTracked` 天生可能是旧的。这是决定 4 的另一面，
  用文案承认它，而不是用一次 `ZCARD` 掩盖它。
- **新事实（界面抓到的，之前只有 counter 知道）**：两轮 dev 启动各有 **1 次 `command-failed` 退回**，
  而且形状不同——
  ```
  第一轮（pid 33652 之前那次启动，日志）：
    [rateLimit] redis 驱动退回进程内计数（第 1 次；…原因=command-failed…）：
      Stream isn't writeable and enableOfflineQueue options is false
  第二轮（pid 33652，页面"最近一次连接报错"那一格）：
    Command timed out
  ```
  也就是说**启动之后的第一笔判定有实打实的概率落进本机窗口**：连接还没 ready 时 `enableOfflineQueue:false`
  让它立刻失败（第一种形状），或者第一笔 Lua 往返过了 250ms（第二种形状）。这一片**没有**改它——
  改法要么是第一笔有界等 `ready`（动的是每请求排队预算），要么是接受它并把这句话写进部署文档。
  记进仍欠 1，不假装看见过了就算处理过了。

## 见证（逐字）

- 单测 + 两份集成合跑（`--no-file-parallelism`，真 Redis 56379 / 真 Postgres 55433）：
  ```
  Test Files  3 passed (3)
       Tests  44 passed (44)
    Duration  29.39s
  ```
  （`rate-limit-readout.test.ts` 12 条 / `rate-limit.redis.integration.test.ts` 26 条 /
  `admin-rate-limit.integration.test.ts` 6 条。）
- e2e **进程内**那一轮（dev server 不设 `NEXUS_REDIS_URL`，pid 33900）：`2 passed (52.8s)`，页面读数逐字：
  ```
  驱动=in-process 窗口=this-process 线路=na 上界=50000 部署=unset
  键前缀=—（这个驱动没有键空间）
  数到的桶=1 只（这张表里的条数，就是权威）
  交给本机窗口判=—（进程内驱动没有"本该共享却退回"这回事）
  ```
- e2e **Redis** 那一轮（`NEXUS_REDIS_URL=redis://127.0.0.1:56379`，pid 33652）：`2 passed (57.2s)`，读数逐字：
  ```
  驱动=redis 窗口=shared-across-instances 线路=up 上界=50000 部署=configured
  键前缀=nexus:ratelimit:v1:
  数到的桶=2 只（这台最近一次判定带回的名册条数；权威是那台 Redis 的 ZCARD，长时间没流量时它是旧的）
  交给本机窗口判=1 次：命令失败（Redis 没答上） 1
  ```
- 两张截图各留各的（文件名带驱动，否则后跑那轮会盖掉前一轮的凭证）：
  `.scratch/shots/60-admin-rate-limit-in-process.png` / `.scratch/shots/60-admin-rate-limit-redis.png`。
- 中途两次红，都不是靠放宽闸修的：
  ① Redis 那轮首跑 `1 failed | 1 passed`——`游客与 member` 那条撞了 Playwright 默认 30 秒超时，
  而 dev 冷编译一次 `POST /api/auth/login` 就 9.9s、一次 `/admin/rate-limit` 11.8s（日志里两次 login 都是 **200**，
  不是 429）。改的是**这条用例自己的** `test.setTimeout(120_000)`，429 那一支另有话术（"等窗口过去再来，
  别为了跑过这一张放宽那道闸"）。
  ② Redis 那轮的截图只有"正在问这台实例…"——从导航点过来会重新挂载表盘，于是补一条
  `data-ratelimit-stats="ready"` 再等一次，图里才有读数。
- `npx tsc -p apps/web/tsconfig.json --noEmit` 干净；`npx eslint` 覆盖本片 11 个文件 rc=0。

## 臂表（每条＝改坏一处 → 哪条用例红，逐字）

| 臂 | 改坏的地方 | 红在哪（逐字） |
| --- | --- | --- |
| R1 | `rateLimitMemory.ts` 自报 `windowScope: 'shared-across-instances'` | `进程内驱动的自报 > 每一格都是"这台进程的内存"那一侧的说法，三个不适用不被抹平`（1 failed / 11 passed） |
| R2 | `rateLimitRedis.ts` 的 `wire` 恒为 `'up'` | `线路没接上时报 down/pending，绝不报 up` + `dispose 之后绝不谎报 up…`（2 failed / 10 passed） |
| R3 | `bucketCeiling` 从常量 `DEFAULT_MAX_BUCKET_KEYS` 抄，不读这台构造参数 | `共享窗口那句、键前缀与上界都来自构造参数，而不是常量猜测` → `expected 50000 to be 11` |
| R4 | 进程内 `bucketsTracked` 报 0 | `bucketsTracked 跟着这张表走…` → `expected +0 to be 2`；`洪水把表压到上界时…` → `expected +0 to be 3` |
| R5 | `redisUrlConfigured` 少了 `.trim()` | `空格串算"没设"…` → `expected true to be false` |
| R6 | `counterByReason` 把所有原因并进 `over-cap` 一本账 | `按原因的账来自 metrics…` → `expected 0 to be greater than 0`（`command-failed` 那格空了） |
| R7 | 门放宽到非 admin（第一版写成 `role !== 'member'`，**全绿**——`UserRole` 只有 `creator｜admin`，那是条惰性臂；换成 `creator` 才红） | `不是 role=admin → 403，连一个字段都不给` → `expected 200 to be 403` |
| R8 | `getRateLimiter()` 每次现造（不再认被换上的单例） | 3 条同时红：`部署那句与现场那句分开交…`、`按原因的账来自 metrics…`、`门面端出的就是单例那份现场 > 换掉单例，回执跟着换` |
| R9 | Redis `bucketsTracked` 报 `maxBucketKeys` | 4 条同时红，含集成侧 `线路在时报 up，且 bucketsTracked 就是那台名册的条数` → `expected 50000 to be 3` 与 `没流量时 bucketsTracked 停在最后一次往来看到的数` → `expected 50000 to be 1` |
| R10 | `reset()` 顺手把 `bucketKeysTracked` 归零（抹掉"它是旧的"那句） | `没流量时 bucketsTracked 停在最后一次往来看到的数…` → `expected 0 to be greater than 0`（同臂还多点红了一条 `正常路径下 fallbackCount 一直是 0`；恢复后单文件 26/26 复绿，见仍欠 1——那条红与启动期第一笔退回是同一件事） |
| R11 | `StatsPanel` 把 `keyPrefix ?? '—（这个驱动没有键空间）'` 缩成 `'—'` | e2e `admin：表盘真的动起来…` → `expect(prefixText).toContain('—（这个驱动没有键空间）')` 红（只有浏览器层抓得到） |

每条臂单步 Edit 改写、跑完立刻恢复、一次只留一条；收尾 `grep -rn "MUT " apps/web/src apps/web/test e2e` = **0**。

## 没牙的格子，点名

- **4 秒轮询周期本身**：没有门。改成 40 秒这些用例照样绿（`data-ratelimit-updated` 那句会跟着变，
  而它只钉文案里的"这只回答"）。
- **`deployment.pid` 的具体值**：只钉 `typeof === 'number'`。
- **界面这一层的 `over-cap` 文案**：两轮 dev 都没造出 over-cap 事件（要满 50 000 只键才出），
  所以"桶键名额用完（不是 Redis 坏了）"这一句**在浏览器里没有真数据喂过**。它由 ADR-0081 的集成测与演练覆盖，
  界面这一层没覆盖——点名，别当成覆盖了。
- **`AdminNav` 里这一项的位置**（排在 realtime 之后）：没有门；只有"点得到 + `aria-current='page'"。
- **拒绝页的文案**（"这个页面对 Guest Creator（role=creator）不开放…"）：钉的是 `[data-admin-denied]` 在位
  与计数字段为 0，没钉那句话本身逐字。

## 仍欠

1. **启动后第一笔判定的那次退回**（上面"新事实"）：要么第一笔有界等 `ready`（会动 250ms 那套预算，
   轻易不做），要么把"第一笔可能由本机窗口判"写进 `docs/ENVIRONMENT.md` 的部署口径。
   —— **走的是第二条，已还**（2026-11-05，第三十六片顺带）：`docs/ENVIRONMENT.md` 的部署口径里新增了
   「设了 `NEXUS_REDIS_URL` 的那台，启动后第一笔判定可能是本机窗口给的」整段，含两句关键限定：
   这是**有界退化不是免检**，读数在 `fallbackByReason{reason="command-failed"}` 与"线路"那格的 `pending`。
   口径更正：这一片**没有**新做决定——`rateLimitRedis.ts:360-372` 早就写下"`hit` 从来不等它"并给了理由
   （把业务请求排在一次建连接后面等于把闸做成故障放大器）。第三十五片新增的是**它现在能被看见**，
   而"写进部署文档"这半今天才补上。第一笔去等 `ready` 那一支仍然不做。
2. **`realtime/redisBus.ts` 里同一形状的 `connectionReady` 还是"一次 error 判死"**（ADR-0077 仍欠 4 /
   ADR-0081 仍欠 2 原样）。这一片给它加的是**读数**（实时总线那一页本来就有 `stats()`），不是修复。
3. **`scripts/rate-limit-two-process.mts` 没读 `describe()`**：它读 counters 与判定结果，跨进程形状仍靠
   它自己那**19** 条判据（2026-11-05 第三十六片从 16 扩到 19）。界面这一层是**一台**的现场，
   两份东西各自成立，没有互相冒充。
4. **`over-cap` 那一格在界面上没有真事件**（见没牙那条）。要补就在演练里加一组"两进程同时撞满额"，
   那也正是 ADR-0081 仍欠 4 的同一格。
   —— **演练那半已还**（2026-11-05，第三十六片 `④″`：两台同时撞同一只建不出来的键，
   退回原因两台的 `{"over-cap":3}` 是**真事件**了，见 ADR-0081「第三十六片补的那一组」）。
   **界面那半仍欠**：`/admin/rate-limit` 上"桶键名额用完（不是 Redis 坏了）"那一句还是没有真数据喂过——
   界面上要出现它得让那台驱动真的满 50 000 只键，而演练用的是 2。这条没牙的格子不改。
