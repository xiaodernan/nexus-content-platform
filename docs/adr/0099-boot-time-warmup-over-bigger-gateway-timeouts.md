# ADR-0099：冷启动要对齐「boot 时预热」，而不是放宽网关的 5s 上限
- 状态：已接受（2026-11-10）
- 相关：`services/java-domain-service/src/main/java/com/nexus/domain/WarmupRunner.java`（新）、
  `scripts/verify-topology.mts`（预热段）、`.github/workflows/main-line.yml`（topology job）、
  `services/nexus-gateway/.../GatewayConfig.java`（`NEXUS_GATEWAY_TIMEOUT`，默认 5s）

## 背景

2026-11-10 的活体验证：domain-service 冷启动后的**第一下**
`GET /api/v1/billing/plan` 经 gateway 得到 503 ——
`{"error":"service_unavailable","service":"nexus-domain-service","cause":"java.util.concurrent.TimeoutException"}`。
第二次起 ~100ms 200。当时机器负载高（十几个 JVM 共 2.5 GB 空闲内存），但本质不是负载：
Hibernate metamodel 与 Hikari 连接池的首连成本落在了**第一次业务请求**的头上，而 gateway 的
5s response bound（SC 早期立的 fail-fast 设计：黑洞式后端必须「无应答」快速返回，不许挂住每个请求）
覆盖不了这一段。

Smoke（`verify-topology.mts`）随后加入预热段（plan GET 重试至非 503，≤120s），但预热只
**教会了 smoke 绕开**，没有消灭真调用方同样会撞到的那第一下 503。

## 选项

1. **把网关 `NEXUS_GATEWAY_TIMEOUT` 调大（如 30s）**：5s 是门的设计语义，放宽它解决的是
   一个症状（这次 429 太慢），削弱的是所有调用方共享的「快速失败」契约。否——门的语义不因
   一扇门背后的启动慢而改变。
2. **调用方重试**（smoke 已做）：治标。每个真调用方都得自己记账第一下 503。否。
3. **boot 时预热**（选定）：`WarmupRunner`（`ApplicationRunner`）在 context 起来时跑一次
   `users.count()`。这一条准备语句把 Hibernate metamodel/Hikari 的首连成本移到 boot，
   对**所有**调用方生效，而不是只对本仓的 smoke。

## 决定

- 新增 `WarmupRunner`：`@Component` 实现 `ApplicationRunner`，`users.count()`，
  成功打 INFO（`warmup: shared schema reachable, users=…`，本机实测 4193），
  失败打 WARN（`…not reachable at boot…`）**不抛**——boot 不因此失败；DB 在 boot 是 down
  的话，健康端点与部署层负责，这条 bean 不抢那件事。
- 网关 5s 上限**原样保留**；smoke 的预热段保留（防御 boot 预热被配置关掉的场合，如
  `NEXUS_DOMAIN_*` 指向一个空库或 DB 遅い于 runner 时点）。
- CI 的 `topology` job 经 `npm run db:migrate` 建好共享 schema，domain-service boot 时的 `count()`
  真真实实发到 PG；空表也不会红（`users` 表存在，count=0 即可）。

## 后果与证据

- `mvn -B test`：103/103 BUILD SUCCESS（无 context 测试，新增 bean 不改变测试面）。
- `verify:topology` 在 8091 上 PASS 全程 <2 分钟；domain-service 日志里有真实行
  `WarmupRunner : warmup: shared schema reachable, users=4193`。
- 前两次（先前两次活跑的同一栈）出现的首次 503 那一路径，现在在 boot 层被前置。
- 并未验证的：空表 + 生产级连接池的极端慢 DB 下 boot 预热是否足够——那种场景下 smoke 预热
  段仍是第二道防线；若未来把 "DB 慢" 做成 CI SLO，这一条要重新量。
