# SC-19 — Spring Cloud 拓扑真机活验证（2026-11-10）

三个 Java 服务真起来，网关按 service discovery 路由，correlation id 贯穿，全部读数留在这里。
这是"加了 Spring Cloud 元素"的实体判据：不是配了几个 pom 依赖，而是注册中心里真的有它、
网关真的按它路由、请求头真的一路回响应。

## 启动顺序（本机，2026-11-10 16:37–16:42）

```
nexus-registry  :8761   (Eureka, 独立 jar)
java-domain-service :8082  (NEXUS_DOMAIN_REGISTER=true, NEXUS_DOMAIN_DB_URL=jdbc:postgresql://127.0.0.1:55433/nexus, DB_PASSWORD=nexus_dev_only)
nexus-gateway   :8090   (lb://nexus-domain-service, /domain/**)
```

## 读数

**1. domain-service 注册进 Eureka（HTTP 200）**

```xml
<name>NEXUS-DOMAIN-SERVICE</name>
<status>UP</status>   <ipAddr>192.168.1.5</ipAddr>   <port>8082</port>
<vipAddress>nexus-domain-service</vipAddress>
registrationTimestamp 令 1794299962142
```

**2. 直接打域服务：`GET /api/v1/community/policy` → HTTP 200**
（返回 `community-policy.json`，source 字段自报 `contracts/community-policy.json`）

**3. 经 gateway 打同一路：`GET /domain/api/v1/community/policy`, 请求头 `X-Request-Id: proof-sc19-001` → HTTP 200，响应头 `X-Request-Id: proof-sc19-001` 原样回显**

这条把两个事实钉住了：
- 网关确实解析到了注册中心里的 `NEXUS-DOMAIN-SERVICE`（`192.168.1.5:8082`，非 127.0.0.1；platform/services 读数印证），不是硬编码地址；
- SC-14 的 correlation id 从入口到响应完整回显，网关在 Path `/domain/**` 上的过滤链没吃掉它。

**4. `GET :8090/platform/services` 读数**

```json
{"measuredAt":"2026-11-10T08:41:31.825Z","source":"Composite Discovery Client",
 "services":[{"id":"nexus-gateway","instances":1,"addresses":["http://192.168.1.5:8090"]},
             {"id":"nexus-domain-service","instances":1,"addresses":["http://192.168.1.5:8082"]}],
 "total":2,"note":"addresses are what the registry holds, not a health check this gateway performed"}
```

## 这次运行抓到的真 bug（不是"差点漏了"）

`mvn test` 全绿 ≠ jar 能启动。测试用 `target/classes`（编译即新），`java -jar` 用 jar 里的类——而
`domain-service-1.0.0-SNAPSHOT.jar` 是在社区 Controller 加入**之前**打包出的，community 包里只有
`CommunityService.class`。首次 `java -jar` 直接 HTTP 404，网关路由一度被怀疑，实际是后端的类根本没进包。
修复：`mvn -o -DskipTests package` 重打包（BOOT-INF 里 community 下 15 个 class 全部落地，含
CommunityController/CommunityPolicy/Follow/Like/UserBlock/Publication…）。

**教训（已写入 README 的待办而非"顺手忘了"）**：任何 `java -jar` 部署前先 `package`，不许拿
`target/classes` 的存在当"服务是好的"的证据。这条和本仓库"证明必须真跑、不能脑补"是同一件事。

## 本次未做（如实记）

- 没让 nexus-api 也注册进来开两路对照——nexus-api 的 Eureka 客户端存在但默认关，开它需要它自己的
  端口与库的明确选择，这是部署决定，不是缺陷。
- 没让 gateway 指向 config server——`NEXUS_CONFIG_ENABLED=false`（SC-9/SC-11 明确：配置中心是
  可选项，不是默认）。
- 没做持久化验证，policy 端点本来就不碰库，重启容器不影响。

## 接下来的一步（不是承诺，是顺序）

1. 把 `mvn package` → `java -jar` 的部署冒烟作为 CI 的一步：服务过不了自己包就别算"绿"——
   本次的 404 就是测试层看不到的差距。
2. 把本页的 curl 命令固化为 `scripts/verify-topology.mts`（可重复跑、带当前时间戳）。
3. domain-service 的 permission/billing 服务目前"真服务、无控制器"，下一步接线：网关加
   `lb://nexus-domain-service` 的 billing 面并写一条和 community 一样的活验证。
