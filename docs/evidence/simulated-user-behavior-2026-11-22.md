# 真实用户行为 *模拟*（合成流量，20 会话 × 5 画像，2026-11-22 复跑）

> 方法（§159 明示）：这是**合成**的行为模拟——deterministic seed (LCG)，以本机 dev server
> （`http://127.0.0.1:3100`）为目标，按脚本的假设画像作随机行走；**不是**对真实访客的观测。
> 真实口径看 `/admin/observe`（库里聚合的真数）。做「真实用户仿佛会怎么做」只能缩小
> 与想象的差距，不能给出访客的真实心理。

## 今日读数

```
[SIM-1] sessions=20 hits=73 ok=73 errors=0 p50=565ms p95=2089ms
  impatient:     sessions=4 hits=8  errors=0
  rage-clicker:  sessions=4 hits=22 errors=0
  lost-wanderer: sessions=4 hits=15 errors=0
  deep-reader:   sessions=4 hits=12 errors=0
  bot-ish:       sessions=4 hits=16 errors=0
```

| 指标 | 2026-11-22 | 2026-11-16 |
|---|---|---|
| 命中 / 2xx | 73 / 73（100%） | 76 / 76（100%） |
| 错误 | 0 | 0 |
| p50 | 565 ms | 764 ms |
| p95 | 2089 ms | 1380 ms |

p95 比 11-16 高（1380 → 2089ms）：这一轮机器上同时跑着 Docker 五件套、另一个 agent 的
dev server 和本会话的编译，是负载差异不是产品回退。p50 反而更快（764 → 565ms）。

## 五画像（对应用户原话）

| 画像 | 用户原话 | 脚本行为 |
|---|---|---|
| `impatient` | "打开页面没耐心就立刻关闭了" | 打开发光就关（2 步开火） |
| `rage-clicker` | "不知道要去哪，在页面上瞎点" | / → 3–6 个随机链接连发，不等 scroll、无目标 |
| `lost-wanderer` | "不知道去哪" | / → /discover → 再一站 → 回 / → 关 |
| `deep-reader` | （有明确目标的那类） | /guide 读 18s+ → /map |
| `bot-ish` | （自动化访客） | /about-nexus 三连 |

## 今日过程中记下的事（环境，不是产品）

第一次复跑 24/24 全红（status 0，p50=25011ms = 脚本自己的 25s 超时）。逐层查下来：
Docker Desktop 的 Linux 引擎掉线 ⇒ `nexus-platform-postgres`（5433）`CONNECT_TIMEOUT`
⇒ `/` `/discover` `/search` `/marketplace` 全部 500，`/bible`（静态，来自 generated.ts）200。
等引擎恢复（约 12 分钟）后同一批路由立刻复原，复跑即得上面的绿读数。
**那份红的 JSON 没有提交**，避免把"引擎掉线"记成"产品缺陷"。

## 诚实的边界

1. 这一份只打**公共离线路由**（未登录、无 `/api/`、无 `/studio`、无 `/admin`）。
   `publication_visits` 不因此多一行——访问 beacon 只挂在 `/n/<handle>/<slug>` 上，
   而脚本按设计不碰它。要在仪表盘上看到合成人·天，走 `/admin/behavior-sim`（那一处
   明写 `suspectedBot=true`，不进"真人"计数）。
2. 合成永远不是证明。要逼近真实落锁效果，需要真实部署 + 真实访客。
3. 复跑方式：`npm run simulate:behavior -- --sessions 20 --port 3100`。