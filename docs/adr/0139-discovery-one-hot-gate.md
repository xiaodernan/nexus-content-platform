# ADR 0139 — Spring Cloud P2：Discovery one-hot gate（pod identity 启动时对账）

- 状态：ACCEPTED（2026-11-14）
- 范围：`services/java-domain-service`（新增 `OneHotVerification` 纯判定 + `DiscoveryOneHotGate` Spring 组件）

## 背景

Spring Cloud Blueprint P2："镜像 one-hot 校验（每次启动的 pod identity + discovery 对账），防"Eureka 过期条目喂旧"。"
目前 `eureka.client.enabled=false` 是默认，服务不 dial 注册中心；但一旦启用，这条门要能说清楚：
- 该 pod 是否被注册；
- 注册中心是否至少持有一个与它身份一致的条目；
- 是否存在多个身份一致条目（死的 twin 挤在活 pod 的位置上）。

没有数据这一侧就无法判断是注册了没、还是 registry 里塞了过期的尸体。

## 决定

1. **`OneHotVerification` 纯判定**：输入 `instanceId`、`registeredIds`、`enabled`、`multipleAllowed`，
   输出 `Report { outcome, totalInstances, exactIdentityCount, message }`。零 I/O、零 Spring。
2. **`DiscoveryOneHotGate`（`ApplicationListener<ContextRefreshedEvent>`）**：仅当
   `eureka.client.enabled=true` 时激活，读取 `DiscoveryClient` 对 `nexus-domain-service` 的注册实例，
   计算 verdict 并记 INFO/ERROR；`nexus.one-hot-gate=hard` 时遇 `unknown_instance` 或
   `ambiguous_identity` 直接 `IllegalStateException` 终止启动（opt-in 硬护栏）。
3. **不改默认路径**：`NEXUS_EUREKA_ENABLED` 未显式 true 时，不 Dial、不对账、不做任何额外操作；
   完全向后兼容。

## 验证（本机）

- `mvn -o test`（services/java-domain-service）：**46 / 46 passed**（`OneHotVerificationTest` 7 条新增）。
- `mvn -o compile` 通过。
- **不冒充真 Eureka 对账**：DiscoveryClient 在本机没有 8761 — 本片验证的是判定纯函数和组件装配，
  不是真实 registry 会话；真实 registry 生命周期由 `verify:spring-cloud` 覆盖（独立 lane，本仓已 GREEN）。

## 仍欠（诚实记录）

1. 端到端的 Eureka 对账证明（启动 java-registry 容器并读出 verdict）不在本片范围——verify:spring-cloud
   的范围内也不包含；那是另一次跑法的成本。
2. `hard` 模式下的生命周期行为（Pod 重启后 twin 残留如何自动被剔）没有测量证据；
   生产部署启用前需实测过 GC 和 Eureka 自我修复的时序。
3. `discoveryClient == null` 时只记 INFO——registry 意外不可达且 hard 模式下应直接 SILENT-FAIL 还是
   报错，是保守与可用的取舍（本版选择可用，因为本服务默认不启用 discovery）。
