# 真实用户行为模拟 · 2026-11-21

命令：`npx tsx --tsconfig apps/web/tsconfig.json scripts/simulate-user-behavior.mts --sessions 24 --port 3100 --out docs/evidence/simulated-user-behavior-2026-11-21.json`

栈：`next dev` 3100 + `nexus_dev` 5433 + Redis 56379。合成流量（random-seeded），**不是真实访客**；
只打公共 GET，不碰 `/api/`、`/studio`、`/insight`、`/admin`，不烧 provider token。

| persona | sessions | hits | errors |
|---|---:|---:|---:|
| impatient（打开没耐心就关） | 4 | 8 | 0 |
| rage-clicker（不知道去哪就瞎点） | 4 | 21 | 0 |
| lost-wanderer（迷路乱走） | 4 | 16 | 0 |
| deep-reader（认真读） | 4 | 12 | 0 |
| bot-ish（机器人式抓取） | 4 | 16 | 0 |
| **合计** | **20** | **73** | **0** |

`planned=24`，脚本按 5 个 persona 向下取整到每类 4 个 = 20 个实际会话（JSON 里 `sessions_planned` 原样记 24）。

时延：p50 **1,032 ms** · p95 **3,540 ms**。`next dev` 单进程 + 共享主机，不能当生产 SLA。

结论只回答"这类真人来，服务器是不是还 200"——是；**不**声称"我们的用户就是这么用的"。
真用户口径看 `/insight` 的真库聚合。逐笔数据见同目录 JSON。
