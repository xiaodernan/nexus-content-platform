# 压测无效尝试记录（2026-11-24）

## 做了什么
用 `scripts/stress-web-burst.mts --n 120` 对当时运行的 web 服务打并发：
`steady` 四条不碰业务库的公开路由，各 120 并发；`burst` `/` 240 并发。

## 结果（如实）
- 5xx：none。
- 但大量请求撞 30s 超时：`steady /` 只 14/120 应答、`/bible` 2/120、`burst /` 50/240；
  p50 高达 59.6s。脚本 verdict：`FAILURES PRESENT`。
- 被打的 dev server 随后退出，3100 出现 ECONNREFUSED，直到重启才恢复 200。
- 同时日志里出现 Redis pub/sub `ECONNABORTED / ECONNRESET` 多次（容器本身仍 healthy）。

## 为什么这次结果**不能**用来判断产品鲁棒性
`stress-web-burst.mts` 文件头明确写：被测的是**已经跑着的 `next start -p 3100` 生产构建**，
本机内存只有 1.3–2.5GB，不能同时拉 dev server + 业务库 + ai-service，否则压垮的是被测系统本身。
本次误把 `next dev`（Turbopack、首编译、HMR、realtime 长连接）当成目标——上面那些超时与崩溃
是**测量工具选错目标**的产物，不是产品在高并发下的真实表现。不要拿它当 SLA 或回归结论。

## 正确做法（下次）
1. `npm run build` 后 `next start -p 3100`（确认 DB/Redis 容器 healthy、无其它进程占 3100）。
2. 再跑同一脚本；把 statusCodes / p50 / p95 / rps 与既有 `docs/evidence/stress-*` 对比。
3. 内存紧张时只保留 web + DB + Redis，不拉 ai-service。

## 已恢复
重启后 `http://127.0.0.1:3100/` 返回 200；Postgres 5433 与 Redis 56379 容器均 healthy。
