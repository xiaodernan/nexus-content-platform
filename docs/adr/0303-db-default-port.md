# ADR-0303 · 数据库兜底端口脱离 Hyper-V 保留段（2026-11-21）

## 状态

已接受（2026-11-21）

## 背景

2026-11-19 撞库演练证据（`docs/evidence/login-bruteforce-2026-11-19.md`）记录了一次真实故障：
web 所有 DB 页面静默 500，根因之一是 `NEXUS_DATABASE_URL` 缺失时回落到代码默认
`postgres://...:55433/nexus`，而 **55433 落在 Windows Hyper-V 保留段 55379–55478**，
`nexus-postgres` 容器绑不上该段、已退出。当时把 `.env.local` 与 `.env.example` 改成 5443
（现行 `nexus-postgres-alt`），但**代码里的兜底字面量仍留着坏的 55433**。

后果：任何没配 `NEXUS_DATABASE_URL` 的新环境/干净部署/CI 会静默连一个不可能起来的端口，
DB 页面 500 重演——与同一天修掉的 gpt-4o 默认模型是同类“兜底值过期”问题。

## 选项

A. 只靠 .env 配。否——兜底值错误是故障根因，不能继续留着。
B. 代码默认端口改为 5443，与 `.env.example` 单一真值对齐，并加门。采用。
C. 去掉默认值、强制必须配 env。否——会改变启动契约，影响现有 offline/测试路径；本增量只修值。

## 决定

1. `apps/web/src/server/db/client.ts:8` 兜底 URL 端口 `55433 → 5443`，注释写明保留段根因。
2. 新增 `apps/web/test/db-default-port.test.ts` 三条门：
   - 代码兜底端口 == `.env.example` 端口（防两边漂移）；
   - 兜底端口不在 Hyper-V 保留段 55379–55478，且等于 5443；
   - 兜底 URL 只指向本机 dev 库（不泄漏外部主机）。

## 门禁（实测）

- `NODE_OPTIONS= npx vitest run --root apps/web --no-file-parallelism test/db-default-port.test.ts` → **3/3 passed**。
- 同根 `test/db-performance-surface.test.ts` + `test/admin-health-aggregate.test.ts` → **11/11 passed**。

## 后果

### 变好的事

- 干净环境/新部署不再因兜底端口撞保留段而 DB 页面静默 500。
- 代码默认值与配置样例单一真值，漂移会被测试门抓住。

### 边界

- 未改动生产部署必须配 `NEXUS_DATABASE_URL` 的约定；兜底只是本机 dev 便利值。
- 保留段是本机 Hyper-V 的事实；换台机器段可能不同，本门钉的是“别用已知坏端口 + 与样例一致”，不是通用端口探测。

## 相关

- `docs/evidence/login-bruteforce-2026-11-19.md`（故障首次发现）
- `apps/web/src/server/db/client.ts`、`apps/web/.env.example`
- `apps/web/test/db-default-port.test.ts`
