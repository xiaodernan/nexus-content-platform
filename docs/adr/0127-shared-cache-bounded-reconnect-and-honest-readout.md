# ADR-0127：共享缓存"断后永不重连 + 恒报 driver=redis"——有界自愈 + 配置/实况分开说

- 状态：已采纳（2026-11-11，§SC-50）
- 关联：**ADR-0125（本片的探查定稿，A+B② 方向在此落地）**、ADR-0114（Redis pub/sub 双连接骨架）、
  ADR-0115（没接上绝不画成四账 0）、ADR-0077（变异臂各有牙）、
  `apps/web/src/server/gateway/{index,client}.ts`、`apps/web/src/app/admin/gateway/{gateway-view,GatewayPanel}.ts`、
  `apps/web/test/gateway-redis-shared.test.ts`（本片新增）、`gateway-view.test.ts`（本片补）
- 触发（user 长期点名）：**Redis 运用 + 计网知识 + 缓存合理运用 + 前后端协同 + 算法/数据结构合理性**。

## 背景（承接 ADR-0125）

ADR-0125 已把缺口钉死、方向定 dead：网关态势的 Redis 共享缓存 opt-in 层（`NEXUS_REDIS_URL`）
有两处与"诚实读数"纪律相悖——

1. `makeRedisShared` 里 `retryStrategy: () => null` 显式关掉 ioredis 重连：这条连接一旦断开
   （Redis 重启 / 网络抖 / 启动瞬间没连上且 `lazyConnect:true`），**永久不再自愈**，`enableOfflineQueue:false`
   让断线期读写即时抛错、`client.ts` 的 `readShared`/`writeShared` fail-open 吞错退回进程内缓存，
   于是共享缓存静默失效到进程结束。这是同仓 4 处 Redis 连接（网关共享缓存 / 失效总线 / 实时总线 /
   共享限流）里**唯一**关掉自愈的——另外三处都靠 ioredis 默认重连自愈。
2. `client.ts:275` `driver: shared ? 'redis' : 'in-process'` 构造时按"配没配"定死，恒报 `'redis'`，
   **与连接此刻是否健康无关**；面板页脚据此写"共享缓存 Redis"，看着像"跨实例共享已接、健康"。

诚实收窄（ADR-0125 已确认）：断线**并非完全无观测**——`sharedProbeState` 每次 get/set 抛错都记
`lastError`/`fallbacks`。真问题是两条：①`driver` 单字段会误导（报的是"配没配"不是"连没连上"）；
②`retryStrategy:()=>null` 让"配了却断了"永不自愈。

**本片兑现 ADR-0125 定下的 A+B② 修法**。之前"待干净全仓窗口"的克制，回看其真正阻塞不是抢 Postgres
（本片 5 条判据**全部零真库**，注入假构造器即可），而是"makeRedisShared 不可注入"这一工程缝——
本片先把缝开干净，再逐支验电，不碰真 Redis/真库。

## 决定

### 1. 修 A：有界自愈（替代永不自愈）

把写死的 `retryStrategy: () => null` 换成纯函数 `sharedRedisRetryStrategy(attempt, cfg)`，可独立验电：

- **指数退避、封顶 1000ms**：`min(capMs, baseMs * 2^(attempt-1))`，`base=100/cap=1000/maxAttempts=8`；
- **每步严格正数**：ioredis 把返回值当毫秒，0 / 负数 / NaN / 非整数都是错误配置，一律返回 `null` 放弃；
- **8 次后返回 `null` 放弃**：ADR-0125 明列的风险——Redis 长期不可达时不能无限空转打日志/CPU；
  放弃后保持既有 fail-open（退回进程内缓存），**不比今天更差**；
- 短抖（≤8 次、约 5s 窗口）能自愈；长断退回进程内，等下一次 `getGatewayClient()` 生命周期重建。

**重连期读写仍即时 fail-open**：`enableOfflineQueue:false` / `maxRetriesPerRequest:1` / `lazyConnect:true`
三条连接纪律逐字不变——管理页不被拖住，原设计的"总线不能比它服务的业务更脆弱"不破。

### 2. 修 B②：配置意图与连接实况分开说（不改 `driver` 取值语义）

- `client.ts` 的 `describe().shared` **字段形状不动**（`driver`/`lastError`/`fallbacks` 三个既有字段）；
  `driver='redis'` 的语义正式界定为**「已配置」而非「已连接」**。
- 新增纯函数 `sharedHealthView({driver, fallbacks, lastError}) → {label, detail, active}`（在 `gateway-view.ts`）：
  - `in-process`（及任何未知/坏值）→ "共享缓存：进程内（单实例）"，中性、不亮生效灯；
  - `redis` 且 `fallbacks=0` 且 `lastError=null` → "已配置 Redis（连接实况看错误/回退计数）"，
    **绝不说"已连接健康/正常"**（此刻可能正断着，或 lazyConnect 还没发过第一条命令，面板无瞬时权威）；
  - `fallbacks>0` 或 `lastError≠null` → label 明说"正在回退"，detail 摆出回退次数 + 最近错误。
- 页脚（`GatewayPanel.tsx`）用它替换原硬编码 `driver==='redis'?'Redis':'进程内'`。**前端形状门零改动**
  （没新增字段、没改 `driver` 取值），route.ts 的 `{...snapshot, driver}` 原样透传不变。
- **坏回执不崩**：driver 非两种已知值按中性处理、fallbacks 非数当 0、lastError 非串当 null，
  返回文案绝不出现 `undefined`/`NaN`（线路/API 字节不可信的同一纪律）。

### 3. 工程缝：可注入假构造器（判据得以零真 Redis）

`makeRedisShared(url, ctor?)` 第二参是 `RedisCtor` 最小表面（new + on/get/set），生产缺省动态
`import('ioredis')` 的真 `Redis`——**生产路径逐字不变**；判据注入假构造器捕获 options、可让 get/set 抛错、
可手动触发 error 监听。这是判据缝，不是公共 API 变化（无既有调用点受影响）。

### 4. 为什么这次能落代码、且不违反 ADR-0125 的克制

ADR-0125 拒绝"无充分验证就动共享机制"。本片满足充分验证：①缝开后先跑 seam 零回归（既有 49 判据绿）；
②加判据针对旧 `retryStrategy:()=>null` **先红**（红在"退避样本数 0 / 第 1 次就 null"，精准命中缺口）；
③实现后 25/25 绿；④三变异臂各有牙（下详）。**唯一谨慎点如实保留**：判据验的是"喂给 ioredis 的
策略契约 + fail-open 契约"，**不等于**已在真 Redis 线路上验证"断后真的自愈"——那需真 Redis + 网络抖动
的干净窗口，本机多 agent 抢库做不到，列为仍欠，不宣称已实测。

## 判据（A 8 条 + B② 5 条，全部零真 Redis / 零真库 / 零 sleep / 零真重连）

`gateway-redis-shared.test.ts`（假构造器）：retryStrategy 可注入且三条连接纪律仍在；断后第 1 次返正数、
第 2 次更长（指数退避）；每步正数或 null、单调不减、封顶 ≤1000ms；超过 maxAttempts 返 null 放弃且不反弹；
断线期 wrapped.get 把 ECONNREFUSED 如实抛上（fail-open 归 client，不在这层吞）；get miss 返 null、set 走
PX 毫秒 TTL 且下界夹紧 ≥1；error 监听常驻且 swallow 不抛；ctor 构造抛错返回 null（退回进程内）。
`gateway-view.test.ts`（纯函数）：driver=redis 只说已配置、不说健康；in-process 不提 Redis；fallbacks>0
摆出次数+错误并说回退；只有 lastError 也点出；坏回执不崩不画 undefined。

## 变异臂（ADR-0077，三臂各有牙、逐条还原、脚本自动恢复两文件）

- 臂 A `retryStrategy → () => null` → 精确红 3 条（自愈 / 退避 / 放弃上限）；
- 臂 B 去掉 `attempt > maxAttempts` 放弃门 → 精确红 1 条（放弃上限）；
- 臂 C 把"已配置"文案改成"已连接健康" → 精确红 1 条（诚实文案）。

先红后绿铁证：加判据未实现时 **7 红 18 绿**（B② 5 条函数不存在 + A 的退避/放弃 2 条命中旧恒 null），
实现后 **25/25**。

## 验证

- 起点：gateway 三套既有 **49/49**；开 seam（默认行为不变）后复跑仍 **49/49**（零回归）。
- 判据：`gateway-redis-shared` + `gateway-view` **25/25**；gateway-client/pure 既有未回归（前轮 61 passed 内）。
- 工程门：5 改动文件 `eslint` **EXIT=0**（顺带清 `gateway-view.test.ts` 的 `JoinInput` 基线未用 import 1 条，
  零行为变化）；`tsc --noEmit -p apps/web/tsconfig.json` **EXIT=0**。
- **未实测（诚实边界）**：真 Redis 断线自愈（需真线路 + 网络抖动）；真库集成套件本机多 agent 抢同一
  Postgres 无干净窗口，未硬跑、记推算待复核、不编绿灯。未 push。

## 后果与仍欠

**已交付**：兑现 ADR-0125 的 A+B②——这条唯一关自愈的 Redis 连接改为有界退避自愈（短抖自愈、长断放弃
不空转、重连期仍 fail-open 不拖管理页）；面板把"配了"与"连着"分开说，不再让 `driver=redis` 冒充
"连接健康"；可注入缝让连接策略首次可零真 Redis 逐支验电；坏回执防御；三变异臂硬证据。

**仍欠**：
- **真线路断线自愈实测**（干净真 Redis + 网络抖动窗口）——本片只验契约，不宣称已实测；
- `describe().shared` 可加派生 `connected`/`degraded`（由连续失败推导）做更细的实况读数，需与 route/面板
  形状门同步，另立片；
- ADR-0125 的候选 sister 缺口（共享限流 `retryStrategy` 已默认自愈、无需改）已盘点在内，无新增欠账。
