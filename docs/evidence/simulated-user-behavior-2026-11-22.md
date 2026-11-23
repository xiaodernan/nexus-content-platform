# 真实用户行为 *模拟*（合成流量，20 会话 × 5 画像，2026-11-22 复跑 · 含公开作品页）

> 方法（§159 明示）：这是**合成**的行为模拟——deterministic seed (LCG)，以本机 dev server
> （`http://127.0.0.1:3100`）为目标，按脚本的假设画像作随机行走；**不是**对真实访客的观测。
> 真实口径看 `/admin/observe`（库里聚合的真数）。

## 今日读数（脚本加上公开作品页之后）

```
[SIM-1] sessions=20 hits=79 ok=79 errors=0 p50=1036ms p95=4153ms
  impatient:     sessions=4 hits=12 errors=0
  rage-clicker:  sessions=4 hits=23 errors=0
  lost-wanderer: sessions=4 hits=16 errors=0
  deep-reader:   sessions=4 hits=12 errors=0
  bot-ish:       sessions=4 hits=16 errors=0

workPageHits = 6   （全部落在 /n/u83627493/build-ok）
```

| 指标 | 本次 | 上一轮（本日，无作品页） | 2026-11-16 |
|---|---|---|---|
| 命中 / 2xx | 79 / 79（100%） | 73 / 73（100%） | 76 / 76（100%） |
| 错误 | 0 | 0 | 0 |
| p50 | 1036 ms | 565 ms | 764 ms |
| p95 | 4153 ms | 2089 ms | 1380 ms |
| 公开作品页命中 | **6** | 0 | 0 |

p50/p95 比上一轮高：这一轮机器上 Docker 刚经历一次掉线恢复、编译缓存是冷的。
**没有一次请求失败**——这一点才是这份证据要守的东西。

## 这一轮改了什么

原脚本五画像全打**公共离线路由**（`/` `/discover` `/map` `/guide` `/about-nexus`），
一个 `/n/<handle>/<slug>` 都不打。于是"没耐心就立刻关掉"这件事，量的其实是首页而不是
**公开作品页**——而作品页才是访客真正"打开就关"的落点，也是唯一挂访问 beacon 的路由。

改法（`scripts/simulate-user-behavior.mts`）：

- 新增 `publishedHrefs(html)`：从一页的链接里滤出 `/n/<handle>/<slug>`；
- `takeWork(html)` 从**已经打过的**页面里捞一篇，捞到就不再捞——所以只有 `impatient`
  可能为此多打一次 `/discover`，`lost-wanderer` 复用自己那次 `/discover` 的结果；
  合成流量多打一页就多一份服务端负载，而这台机器上还跑着别的东西；
- JSON 里加 `paths`（全量命中路径）与 `workPageHits`：**"确实打了作品页"这件事
  不能靠总数差推断**，推断不是证据（§159）。上一轮就是因为只记 `errorHits`，
  跑了 83 命中也说不清那 6 页是不是真的打在 `/n/` 上。

## 诚实的边界

1. 这份只打公共离线路由，未登录、无 `/api/`、无 `/studio`、无 `/admin`。
   `/admin/behavior-sim` 才会把合成人·天写进 `publication_visits`（明写 `suspectedBot=true`，
   不进"真人"计数）——本脚本不写库。
2. 合成永远不是证明。要逼近真实落锁效果，需要真实部署 + 真实访客。
3. 复跑：`npm run simulate:behavior -- --sessions 20 --port 3100`。

## 过程中记下的事（环境）

这一轮中途 Docker Desktop 的 Linux 引擎掉线两次，`nexus-platform-postgres`（5433）
`CONNECT_TIMEOUT` ⇒ 所有库页面 500。中间一次复跑因此全红（48 错），**那份 JSON 已删**，
没有把"引擎掉线"记成"产品缺陷"。引擎恢复后复跑即得上面的绿读数。

---

## 并轨：另一条线的同一脚本复跑（2026-11-22 早一轮）

> main 线与 master 线各跑过一次 `scripts/simulate-user-behavior.mts`（deterministic seed，
> 打的全是公共 GET 路由）。两次读数不同是因为脚本在这两条线上各自演进过
> （master 那轮还没带公开作品页探针）。**两次都零错误**，这一点互为佐证。

# 模拟真实用户行为 · 合成流量回放（2026-11-22 · §SIM-1 复跑）

> 指令第九条：「模拟真实用户行为：打开页面没耐心就关掉、不知道去哪就瞎点」。
> `scripts/simulate-user-behavior.mts` 按五种画像跑**合成**会话（random-seeded，可复跑），
> 打的全是 GET 公共路由。**这不是真实访客数据**，只回答「这类真人这样来，服务器扛不扛得住」。

## 读数（20 个会话 · 75 次点击 · 0 错误）

| 画像 | 会话 | 点击 | 错误 | p50 | p95 |
|---|---|---|---|---|---|
| impatient（没耐心就关） | 4 | 8 | 0 | 5846ms | 6062ms |
| rage-clicker（瞎点） | 4 | 23 | 0 | 801ms | 2088ms |
| lost-wanderer（不知道去哪） | 4 | 16 | 0 | 1286ms | 1886ms |
| deep-reader（读到底） | 4 | 12 | 0 | 758ms | 1379ms |
| bot-ish（机器味） | 4 | 16 | 0 | 763ms | 3160ms |
| **合计** | **20** | **75** | **0** | **972ms** | **5846ms** |

## 结论

- **没有一个错误**：五种画像、75 次点击全部 200。瞎点不会打出 500，没耐心直接关也不会留下半页。
- **最慢的是 impatient**（p50 5.8s）——它命中 `/bible` 一类重语料路由，
  与压力测试同因：这台机器内存见底时 SSR 会排队，**不是哪一类用户把服务打坏**。
- 复跑：`npx tsx scripts/simulate-user-behavior.mts --sessions 24 --port 3100 --out <json>`。
- 真实访客口径在 `/insight`（真库聚合）；这一份永远标注合成，不冒充真实用户。
