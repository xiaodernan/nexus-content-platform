# ADR-0100：注册中心专用端口 8771（8761 已被本机另一项目的 Spring Cloud 栈证明在占用）
- 状态：已接受（2026-11-10）
- 相关：`services/nexus-registry/src/main/resources/application.yml`、`scripts/verify-topology.mts`
  （`NEXUS_REGISTRY_PORT` 默认 8761→8771）、`docs/ENVIRONMENT.md`、四个服务的 `defaultZone` 默认、
  `services/nexus-registry` 等 README（文档口径同步）、`docs/adr/0095-*`（SC-1–SC-3 记录的是当时的 8761，本 ADR 部分覆盖之）

## 背景

2026-11-10 上午，`verify:topology` 的 `/platform/services` 断言里突然多出一个服务 `config-server`。
当时没有任何环境变量决定这件事，也没有任何本仓库代码写死这个 id。追查到 registry 的日志确证（19:59–20:00 探针，registry 自身打印）：

```
DS: Registry: lease doesn't exist, registering resource: CONFIG-SERVER - host.docker.internal:config-server:28889
InstanceResource : Not Found (Renew): CONFIG-SERVER - host.docker.internal:config-server:28889
```

`D:\3a大作` 的 Spring Cloud 栈（discovery-server :29161 / config-server :29888 常驻进程）的
**config-server 正在心跳进一个跑在 8761 的 registry**——8761 是 Eureka 的框架默认端口，
两个项目共享了同一台机器上的同一个默认值。本仓库在 ENVIRONMENT.md 里早就有过同类事故的叙述
（2026-11-09：外部项目的 `FOOTBALL-EDGE` 出现在 `/eureka/apps` 里）。

**与 56379 对 6379 是同一类陷阱**：默认值指向"别人家的服务"就不是默认，是陷阱。

## 选项

1. **继续 8761 + 文档警告**：`/platform/services` 会列出别人家的服务；网关无此路由所以不可打穿，
   但"注册中心是本仓库的服务目录"这件事被污染了。否。
2. **把 `NEXUS_REGISTRY_ZONE` 默认改成 8771，但保留 registry 自身 8761**：不一致，且 registry 自身
   仍被外来心跳打。否。
3. **专用端口 8771：registry 自身与所有服务的 `defaultZone` 默认**（选定）：机械可验证，
   本仓库与 3a大作 从此在网络层面分开；两个项目各自用默认值，谁也不会注册进谁。

## 决定

- `NEXUS_REGISTRY_PORT` 默认 8761→**8771**（registry），所有服务的 `eureka.client.service-url.defaultZone`
  默认改为 `http://127.0.0.1:8771/eureka/`；`services/nexus-config` 的注释、README、
  ENVIRONMENT.md 口径同步。
- `docs/evidence/*` 与 2026-11-09/10 的 ROADMAP 片保留 8761 的记录——**它们记录的是当时的真值，不抹不改**；
  本 ADR 与下一个 ROADMAP 片是"这个默认改了"的记录。
- 8761 留给 3a大作；8771 空闲且已在本机验证可用。
- 网关 :8090 被另一外部进程占用的事实不变：本仓库继续用 `NEXUS_GATEWAY_PORT=8091` 验证。

## 后果与证据

- `npm run verify:topology`（`NEXUS_GATEWAY_PORT=8091`，registry 用新默认 8771）= **PASS**：
  eureka 应答、domain/api 注册、`/platform/services` 只列出 `nexus-domain-service, nexus-api`
  （**没有任何外部服务**——本片对该污染的判据）、config 往返、全部 surface 断言通过。
- 首跑如实失败一次：改的是 `src/main/resources/application.yml`，`ensureJarFresh` 当时只算 `.java`
  的 mtime，jar 被当"新"而没重打包 → registry 在一个 8761 起的旧 jar 上听、smoke 在 8771 等 →
  fail-fast 90s 超时。**资源文件也让 jar 过期**，已把 `ensureJarFresh` 改成扫描整个 `src/main/`；
  这一条是这次事故里最值钱的教训（第二个 stale-jar 类的坑，第一个是 `java -jar ≠ mvn test`）。
- `scripts/verify-topology.mts` 的 8761→8771、`README`/`ENVIRONMENT` 口径同步、poms 注释同步。
- 未验证：3a大作 是否会注意到 8761 变"空"——不是本仓库的责任；本仓库已不再出现在它们的目标上。
