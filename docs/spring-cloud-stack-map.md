# Spring Cloud 栈面（2026-11-11，现状实读）

记录 Java Spring Cloud 家族**实装的**与**仅 scaffold 的**部分，来源皆为已落地的 smoke/测试/ADR——本篇不新写声称，只交叉查询事实。

## 端口（只在本机有效）

| 端口 | 服务 | 状态 | 备注 |
|---|---|---|---|
| 8082 | `services/java-domain-service`（domain-service，SC-6） | 实装 | 独立 jar，JPA→Postgres 55433`; full test suite green |
| 8084 | `services/nexus-api`（SC-52 M7 controller） | 实装 | verify:auth 12/12 走它；smoke 不启动 |
| 8771 | `services/nexus-registry`（Eureka） | 实装 | 本机独有，不抢 8761（3a大作栈在占） |
| 8888 | `services/nexus-config`（Config Server, native） | 实装 | `ratePerSecond=50.0` 力证 config 轮→gateway 生效果 |
| 8090 | `services/nexus-gateway` | 实装（门） | 8084→80 smoke 带舱壁+熔断+限流 |
| 8091/8092/8093 | gateway 烟测口 | 脚本专用 | verify:topology / verify:auth 跑时用这个 |

## 发现链（验证过）

**真相传播**：`nexus-registry`（独立 jar，注册中心）→ `nexus-config/nexus-domain-service.yml` 声明 `register-with-eureka: true` → domain-service 不再靠 env，**只靠 config server** → 注册成功后 Eureka 列表里出现实例 → 网关按 `lb://nexus-domain-service` 路由；

**相关文件**：
- `services/nexus-config/src/main/resources/nexus-config/nexus-domain-service.yml`（native 配置源）
- `services/nexus-config/src/main/resources/nexus-config/nexus-api.yml`（native 配置源）
- `services/nexus-config/src/main/resources/nexus-config/nexus-gateway.yml`（native 配置源）
- `scripts/verify-topology.mts`（`npm run verify:topology`；端口可 NEXUS_*_PORT 覆盖；fresh jar 重打后两度 PASS）
- `scripts/verify-loadbalance.mts`（双实例 LB 路由验证）
- `scripts/verify-auth.mts`（SC-27 door-close；12/12 PASS）
- `services/nexus-gateway/.../GatewayConfig.java`、`services/nexus-gateway/.../PlatformAuthFilter.java`

## 门禁现状（SC-27/28）

- `AuthFilter`（GlobalFilter）+ `PlatformAuthFilter`（WebFilter）= 双门关闭——匿名来者 400 `缺 Door`；
- Gateway rate-limit Lua 存/is 过 NEXUS_GATEWAY_RATELIMIT_BACKEND（redis || NeRF-redis 协同）：memory 与 Redis 两个 backend；`redis backend round trip` 已 live 验证。
- `PlatformAuthFilter` 已关闭 `/api/**` 的未授权路径；verify:auth 12/12 全绿。

## 无 Java→Python 的"假衬"

- Python `ai-service`（端口 3200 默认，方评测用）被 java-domain-service 称 `Feign ai-service client`；
- `Java→Python healthz` ping 在 Feign breaker 闭启开关时被关闭过熔（SC-60），现在只有**半边门**必要时开；HALL ok。
- requirement.txt =? fresh-solve: **ai-service 不参与 全 topology smoke**——wireJava→web 端到端的脚步由 `scripts/realtime-java-to-web.mts` 专门跑。

## 探针门（§SC-61）

- `POST /api/v1/realtime/probe`（探针 of "probe"）现在要求`X-Nexus-Operator-Token`；
- `GET /api/v1/realtime/stats` 仍敞开只读 `publishedTotal / tooLargeDropped / redisFailures`；
- 主体 of frame 固定：`channel=projects:probe`、`title="probe event"`、`notification`（不带 body）屏蔽调用方定制；
- `published=true` 标志 byte 是非空 EventFrame；web-bus wireErrorCount 计数器**已知 0**（wire safeParse 路径）。

## 网关配置中心 override 读数（记入 ADR-0099/0125）

| key | 值 | 性质 |
|---|---|---|
| `ratePerSecond` | `50.0` | config 显式注入 gateway 生效（default=100） |
| `tokenLife` | `300` 秒 | 可配置，`nexus.auth.token-life-seconds=300` |
| `maxViewers` | `512` | discover-cache 软限，参考 `discover-cache.ts` |

## 仍债（SC-61 之后）

- Java side: `verify:topology` 未接入 `probe` 必经断言（SC-61）；
- Gateway rate-limit 的 Redis backend Lua 在断开的情况下有 `NOAUTH` 跟 `NOPERM` 行（EPoll: multilayer fallback）——需要 verify 注释；
- 多个 Java instance LB 时 `spring.cloud.gateway.route.domain.openfeign` 的 `timeout` 5s 断开的 120ms timeout 吞掉；
- Config server 只覆盖 gateway 的 rate-limit defeat-`only`（permitted range of checks）；读写组合成证据还没一次看清。

## Foreign 架构警惕区（不要动）

- `com.nexus.NexusApplication` 埠 PID = 39424→12952 是别的项目  Spring @AutoWire (not mine)；
- `careeros-*` Docker 容器、`3a大作` Spring Cloud stack 在 8761/29161/29888：**不杀不进**
- 停机 `192.168.1.5` 的实际多。

## 读数清单（mini）

- `npm run verify:topology` — PASS ×2（fresh jars 重打后每次都是首绿）
- `npm run verify:lb` — PASS（两个 domain-service 实例 LB 路由成功）
- `npm run evals` — exit 0（export-roundtrip 17/17）
- Java 全套 — 137/137
- `realtime-java-to-web` — 探针全 PASS（SC-53→SC-61）
