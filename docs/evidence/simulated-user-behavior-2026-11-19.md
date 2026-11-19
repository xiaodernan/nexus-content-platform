# 证据 · §SIM-2 真实用户行为模拟（合成，非真实用户）— 2026-11-19

> 纪律：这是**合成流量**——随机数种子确定性 LCG；**不是**从用户身上取的真实数据；只回答「如果这类好像真人这样到访，服务器能不能 200」。
> 生产的真实行为看 /insight（真库聚合 + SimMode + 7 天走势）。
> 探测路径；`scripts/simulate-user-behavior.mts --sessions 60 --port 3100`。

## 探测布局

- 服务：本机 `:3100`（Next dev；3000 之上这一点不重要，能复现即可）
- 端点：`/` · `/discover` · `/studio` · `/marketplace` · `/bible`（仅 GET 公共路由，dev 实现）
- 画像：impatient（没耐心就走）· rage-clicker（瞎点）· lost-wanderer（找不到去哪瞎走）· deep-reader（整本翻）· bot-ish（机器指纹）

## 计数板（本次：60 会话 / 5 画像各 12）

| 画像 | 会话 | hits | errors | p50 (ms) | p95 (ms) |
|---|---|---|---|---|---|
| impatient | 12 | 24 | 0 | 1,875 | 4,166 |
| rage-clicker | 12 | 63 | 0 | 652 | 1,541 |
| lost-wanderer | 12 | 48 | 0 | 1,194 | 1,898 |
| deep-reader | 12 | 36 | 0 | 1,384 | 3,010 |
| bot-ish | 12 | 48 | 0 | 1,067 | 6,932 |
| **合计** | **60** | **219** | **0** | **p50=1,085** | **p95=3,568** |

p99=6,932 · max=8,468 · 0 错误 · 0 `/api/` 触碰（全部是公共页 GET 路由）。

## 读出的真问题

没有新增的崩点/502/500，也没有 i18n 混用见证；公共路由能挺过 rage-clicker 画像的连续重复点击（63 hits, 63×200, 零响应体差异不为证）。

## 实事求是的边界

- 这是**合成**流量——sample = `sessions_planned=60, sessions_done=60, hits_total=219, errors=0`。
- page-load ms 比 prod SSR 首帧慢——这是 `next dev` 的 cold-compile 路径，prod 的历史数据见 `docs/evidence/load-web-ssr-2026-11-18.md`（30/60×4 lane，60×200，零 5xx）。
- 这个证据不能证明系统对"更多用户"是安全的；只证明"这次探测的 219 次 GET 全部 2xx"。
- 不能和 prod-e2e 画面混为一谈——`scripts/simulate-user-behavior.mts` 的原注释也明说过：只走公共热路径，不测鉴权面。
