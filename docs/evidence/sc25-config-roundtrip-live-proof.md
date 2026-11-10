# SC-25 — Config Server 不只是 pom：配置中心往返经网关自己的启动日志证明（2026-11-10）

前四片证明了注册中心、discovery、网关路由与领域门面。config server（Spring Cloud Config，`native`
profile，SC-9/SC-10）一直被"配置客户端已接线、默认关"盖着——**没有人证明过配置真的从 8888
流进了服务**。这一片把它变成 smoke 的第五条腿。

## 布置（全部由 verify:topology 自己起）

```
registry :8761 → nexus-config :8888 (native, classpath:/nexus-config)
             → domain-service :8082 (NEXUS_CONFIG_ENABLED=true，无 NEXUS_DOMAIN_REGISTER/FETCH)
             → nexus-api      :8084 (NEXUS_CONFIG_ENABLED=true，无 NEXUS_API_REGISTER/FETCH)
             → gateway        :8090 (NEXUS_CONFIG_ENABLED=true，无 rate-limit env)
```

配置文件（`services/nexus-config/src/main/resources/nexus-config/*.yml`，均已生效）：

| 文件 | 关键事实 |
|---|---|
| `nexus-gateway.yml` | `nexus.gateway.rate-limit.rate-per-second: 50`（本地打包默认 100）——网关启动行打印哪个数，就是 config 有没有赢 |
| `nexus-domain-service.yml` | `eureka.client.register-with-eureka: true`——本地默认 false，"无 env 标志却出现在注册中心里"只能从这里来 |
| `nexus-api.yml` | 同上 |
| `application.yml` | management.health.exposure=health（所有客户端共有项） |

## 实跑读数（port 8091，2026-11-10；五服务全由脚本启动、断言、清理）

```
eureka is answering
config server is answering
eureka holds NEXUS-DOMAIN-SERVICE (via config server, no env flags)
eureka holds NEXUS-API (via config server, no env flags)
gateway is answering
config server served nexus-gateway.yml (ratePerSecond=50.0)   ← 网关启动日志原文：
                                                              gateway rate limit: enabled=true backend=memory ratePerSecond=50.0 ...
domain-service answers through the door (warm-up)
gateway discovery lists nexus-domain-service, nexus-api
community policy (source: contracts/community-policy.json)
billing balance 0 (X-Request-Id echoed verbatim)
door-less billing refused (400)
permission check refused (User not found, X-Request-Id echoed)
door-less permission refused (400)
nexus-api answers through the gateway /api/health (200, {"service":"nexus-api","version":"0.1.0-SNAPSHOT",...})
[verify:topology] stopped registry / nexus-config / domain-service / nexus-api / gateway
[verify:topology] PASS — registry, gateway, domain-service and nexus-api, all through service discovery
```

**这一次证明的是"配置往返"，不是"配置客户端已接线"**：注册标志两个都没走 env，网关限流打的是 50 不是 100——
两个独立判据都只指向 nexus-config 一条路径。

## 三处如实的修正（smoke 本身）

1. **日志改成每次截断（`flags: 'w'` 而非 `'a'`）**：此前日志跨跑追加——**昨天的
   `ratePerSecond=50.0` 完全可以在今天"满足"今天的断言**。这是和"stale jar 被当成新"
   同类的坑，修掉了。
2. **domain/nexus-api 的就绪等待 90s → 150s**：首跑在本机内存吃紧（5 JVM + Docker 栈）时
   domain 从启动到 Tomcat 就绪花了 111s，90s 等待线把活活健康的服务判成死的。起因如实是
   本机负载，不是 config 客户端——本次复跑全绿证明。
3. **eureka 存在性检查改成轮询**（`waitForUrl`，30s）：注册是异步的，单次 GET 不可靠。

## 如实的边界

- config server 是 `native`（classpath 配置，不连 Git）——生产形态（Git/Vault/K8s）未验证；
  但客户端协议、合并优先级、本片的三条判据在 Git backend 下同样成立（Spring Cloud Config 的契约）。
- 首跑（vt-run5.log）真失败：domain 90s 未就绪，smoke 正确退出非零并清干净了全部进程——
  **失败门是工作的，这次是判据被负载打爆，不是 config 有问题**。
- CI `topology` job 同步打包 nexus-config 第五个 jar；**CI 仍未被 push 实跑过**，红了是真信号。
- native 配置文件都进了 jar；`optional:configserver:` import 在 config 挂掉时才会回退到打包默认值——
  所以这条链在 CI 里是硬依赖：config 没起来，脚本直接非零退出，不会假绿。
