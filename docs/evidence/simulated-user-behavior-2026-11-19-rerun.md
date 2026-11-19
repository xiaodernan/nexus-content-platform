# 证据 · §SIM-3 真实用户行为模拟（合成流量，2026-11-19 · cont.452 · dev:3475）

> 纪律：这是**合成**流量——随机数种子固定（LCG），**不是**从用户身上取的真实用户数据。
> 它只能回答「如果一类真人以这种方式到访，服务器能否保持 2xx」；生产的真实行为要看 /insight（真库聚合 + 7 天走势）。
> 只打公共 GET 路由，不碰任何 /api/、/insight、/admin。

## 探测

- 服务：本地 `:3475`（Next dev · 新 build，含 §DAILY-1 今日潮候、§SHIP-2 canon 前缀注入、/observe AI 深读）
- 端点：`/` · `/discover` · `/studio` · `/marketplace` · `/bible`
- 画像：impatient / rage-clicker / lost-wanderer / deep-reader / bot-ish，每类 12 会话（共 60）

## 计数（本次实测 · 2026-11-19T14:23:58Z）

| 画像 | 会话 | hits | errors | p50 (ms) | p95 (ms) |
|---|---|---|---|---|---|
| impatient | 12 | 24 | 0 | 3,651 | 8,067 |
| rage-clicker | 12 | 62 | 0 | 1,593 | 3,960 |
| lost-wanderer | 12 | 47 | 0 | 2,208 | 4,073 |
| deep-reader | 12 | 36 | 0 | 1,764 | 5,442 |
| bot-ish | 12 | 48 | 0 | 2,361 | 5,758 |
| **合计** | **60** | **217** | **0** | **p50=2,039** | **p95=5,442** |

p99=8,067 · max=9,345 · 0 错误 · 0 `/api/` 触碰（全部是公共 GET 路由）

## 读出的真问题

全部 217 个公共路由请求返回 2xx；本次没有新增崩溃、没有 5xx、没有 i18n 混用见证、没有错误点。
但 p50 相对 prod SSR 首帧慢（dev cold-compile 路径，不是 prod SLA；prod 路数见 `docs/evidence/load-web-ssr-2026-11-18.md`）。

## 实事求是的边界

- 合成流量 ≠ 真实访客；这是"这些画像的真人这样打，服务器不崩"的证据，不是"我们的用户就是这样"。
- 不能替代 prod-e2e、不能替代 /insight 的真库聚合读数、不能证明高并发容量（这是 GET 公共路由，不压鉴权面）。
- 行为指标在 prod 口径下应当从 /insight 与 /pulse 观测大厅读取，而不是用本脚本代替。
