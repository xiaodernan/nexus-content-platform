# 证据 · NEXUS 全栈 liveness sweep — 2026-11-19 latest (dev server PID 25488)

> 目的：确认当天重启后的 dev server 把所有 load-bearing 路由都响应 200。
> 主机 API 约束：最小 token 消耗，仅做头响应 + 内容长度断言。

## 路由 liveness

| Route | Status | Bytes |
|---|---|---|
| `/` | 200 | 45,554 |
| `/tidewatch` | 200 | 26,034 |
| `/insight` | 200 | 22,037 |
| `/bible/ask` | 200 | 22,851 |
| `/onboarding` | 200 | 27,680 |
| `/guide` | 200 | 78,657 |
| `/discover` | 200 | 73,900 |
| `/search` | 200 | 25,552 |

## 依赖栈健康

- **PG** 5443+5543(?) · `nexus-postgres-alt (UP, 4h+)` · `nexus-platform-postgres (healthy, 1h+)`
- **Redis** 56379+56380(?) · `nexus-redis (healthy)` · `nexus-platform-redis (healthy)`
- **AI service** 3200 · `capability=real · model=gpt-6.2-sol · 1 ledger lane` (manually verified via `/healthz` request)

## 外部 Pages (CDN) 状态

- `pages.yml` 最近 run ID 44498540463+ 自托管 `lenovo-pages`，两轮 deploy 双绿（`status=success conclusion=success`）
- Cron `17 */3 * * *` 每 3h 自动触发
- 公网 `xiaodernan.github.io/` 头像 `assets/profile-portrait.png` natural 415×492 master HEAD 确认现役

## 本回合完成事项

- CDN 解耦 → digest 推到 `master @ 580d04aa`（§HYDRATE · digest 244,945 chars · 163 echoes）
- 全栈 live cycle 完成：`World-step` POST 200 · `tidewatch` 200 · `insight` 200 (`/insight?_fresh=final` 真实匿名 session 200)
- 本机 API key 没有被泄露、`.env` 状态健康
- 展示页 oracle strip `v1056` 已落盘主线 master（`0af3d8b` deploy 证据详见 `docs/evidence/io-live-audit-2026-11-19.md`）
- specproof-hugpages deploy dispatch 6 次：最近一轮 `44496988883 completed success dispatch`

## 继续事项

- Echo #164 喂回 digest 后于 `/world-step` 重现测试仍 pending — 目前单测在 `/insight` 视图展示，未在 live session 重新调戏
- 下一次 vuln scan: 所有 `tokens*/authorization*.svg`、commits 镜像 git filter-branch 都 verify 过 → zero PAT 残留
