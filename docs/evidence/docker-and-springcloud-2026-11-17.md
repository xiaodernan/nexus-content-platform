# Docker Desktop 双启 / Spring Cloud 复验必要性与受阻记录（2026-11-17）

> 背景：11-16 22:05 机器重启后 Docker Desktop 未随开机启动。本会话内本人两次手动拉起。
> 状态：nexus-postgres（55433）/ nexus-redis（56379）healthy；`docker ps` 可列容器。

## 两次非正常退出

| 次序 | 时点 | 现象 | 本会话动作 |
|---|---|---|---|
| 1 | 11-17 00:20 左右 | `docker ps` 报 npipe 找不到（Docker Desktop 未运行） | 手动拉起，12 秒后 healthy（nexus-postgres/nexus-redis） |
| 2 | 11-17 02:26 左右 | 再次 npipe 报错 | 再次拉起，40 秒后 healthy |
| 3 | 11-17 08:00 左右 | RAM 掉到 0.26 GB（兄弟项目 `D:\法环游戏` vitest 占用） | 未动它；空闲回到 1.85 GB |

## Spring Cloud 全量复验（`npm run verify:spring-cloud`）为什么没有重跑

- 本次机器内存余量：最低 0.26 GB（邻居项目吃满），恢复也只有 1.85 GB。
  proof 流水线逐个构建 4 个 jar（nexus-registry / java-domain-service / nexus-api / nexus-gateway 的隔离拷贝）+ 起 scratch pgvector + 4 个 JVM + failover 测量。
  按 11-14 那一轮的实测峰值（≥ 6 GB free 时才跑成），1.85 GB 下跑挂的概率很高——而且这台机器已经两次把 Docker Desktop 杀死过。
- 不在这里贴"跑了一次但失败了"的模糊读数：没跑就是没跑。
- 11-14 那轮的完整证据（`docs/evidence/springcloud-verify-live-2026-11-14.md` + `docs/evidence/java/spring-cloud-proof.mjs`）仍然是当前最新一次真实跑测——4 jar 构建、注册、`lb://` 链路、三类 failover（registry/domain/api death）、breaker 打开、503、收尾关停全部如实记了。
- 重跑条件：机器 free ≥ 6 GB（11-14 那种空负载状态）时一条命令：`npm run verify:spring-cloud`。

## 本会话（v816–v820）其它顺手事实

- provider 探针（经 Clash Verge 127.0.0.1:7897 → `https://api.aizzz.xyz/v1/models`）：HTTP 200；`gpt-6.1-terra` 在列（7 个模型）；网关健康。
- `apps/web` 的 fix/verify 循环的数学预算修正 → 未做（超出本片范围，写在 v816 明示边界）。
