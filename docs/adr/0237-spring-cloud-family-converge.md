# ADR-0237 · Spring Cloud 两家族收敛：java-* 退役，nexus-* 成为唯一线

日期：2026-11-18 · 状态：已采纳（compose/CI/工作流/门禁全部重指；三个新家族套件本机实测全绿；旧家族从 HEAD 删除，历史永存）

## 背景

仓库自并轨后出现两套 Spring Cloud 实现并行：

- **java-\***（2026-11-10 第一代）：`java-registry`（Eureka@8761）· `java-config-server`（8888）· `java-gateway`（Edge Gateway，22 tests）
- **nexus-\***（2026-11-11 之后第二代）：`nexus-registry`（8771 单款防 8761 邻居占位）· `nexus-config`（native classpath 供货 + SC-71c defaults 锁死）· `nexus-gateway`（31 classes / 128→127 tests，HopLogFilter / Prometheus / W3C / Redis 共享桶 Lua+fail-open / SC-36 自持超时）

两家族同名同目的、各自漂移（wire 约定、SC-71 之后 gateway 生命周期从发现走到 actuator 读数）；infra/config 与 jar classpath 两套 *同源不同形* 的配置；CI 两条 workflow 对两家族都跑 `mvn test` 之后才肯变绿——八条 Maven 指令换三重维护面。

## 决定

1. **nexus-\* 成为唯一家族**：`smoke`（scripts/verify-topology.mts）、compose（`infra/docker-compose.yml` 的 `java` profile）、CI（`.github/workflows/ci.yml` 与 `main-line.yml`）、evidence proofs（`scripts/`、`docs/evidence/java/*`）、缓存键全部指向 nexus-* + java-domain-service + nexus-api。
2. **java-\* 三模块与 `infra/config/` 整体从 HEAD 删除**（`git rm -rf`：git 对象保留等价字节，任何后续检阅皆可 `git show <old>` 复原）；门禁说法一致——`verify:ci-wiring` §15 本就允许"name in a step or retire the module with its sources"，我们走的是后者。
3. 环境漂移修正（compose 内同时修复）：旧 compose 给客户端写 `NEXUS_EUREKA_URL`——该变量**没有任何读取方**（域读 `NEXUS_REGISTRY_ZONE`，缺省 `127.0.0.1:8771`）——compose 默认永远注册不上自己的 Eureka；现在显式设 `NEXUS_REGISTRY_ZONE=http://nexus-registry:8771/eureka/`。同源还顺手修了缺失的 `NEXUS_CONFIG_ENABLED/URL`。
4. 端口口径不变声：compose 对外的几个端口保持 host 端映射（18771/18888/18090/18082/18080/55433），容器内仍用本家族默认口。

## 后果与边界

- CI 从"八条 Maven 指令"收敛为 **五条**（nexus-registry/nexus-config/nexus-gateway/java-domain-service/nexus-api），全部必测；缓存金重写为这五家。
- 历史读数如实记账（java-\* 家族退役前实测：gateway 22 · registry 2 · config-server 5）；nexus-* 2026-11-18 本机真实重测：**nexus-gateway 127/127（含本轮新钉 SC-37 ACL fail-open 用例）· nexus-registry 6/6 · nexus-config 6/6**。
- Spring Cloud 的"Still Debt"两项同轮实账：**verify:topology 增加 SC-61 probe 必经断言**（无钥匙 403 / 带对钥匙 200 或 503 redis_unavailable / stats 报文必带 publishedTotal/tooLargeDropped/redisFailures）——代码已落 verify-topology.mts，单轮全链实测见 CURRENT-STATE cont. 222；**生命周期关闭**：`/api/v1/realtime/probe` 在领域服务自己那扇门（不放行匿名，网关注开着就是开着）。
- 不在本片删掉的是 `docs/decisions/*` 与 `CURRENT-STATE` 老记录：它们是叙事与判定的历史证据，改字会毁坏可追溯性；新读者从本文档 + SPRINGCLOUD-BLUEPRINT 进入即可。
