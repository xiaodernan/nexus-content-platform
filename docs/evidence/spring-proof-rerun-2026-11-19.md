# 证据 · Spring Cloud 单机证明（Java domain-service）— 2026-11-19 复跑

> 纪律（§III/§159）：这一页只记录真跑、真通过的证据。迁移脚本、依赖下载、JDK 版本、内存上限都在这儿说清楚——不再靠"2026-11-18 的 16/16 PASS 没重跑"来搪塞。

## 环境
- Java 25.0.1 (Eclipse Adoptium, `jdk-25.0.1.8-hotspot`) · Maven 3.9.15 · 本机 Windows 11
- 模块：`services/java-domain-service`（Spring Cloud Gateway child service · domain-compose Spring Boot app）
- 内存约束：`-DargLine="-Xmx768m -XX:MaxMetaspaceSize=192m"`（宿主空闲 < 2.5 GB，刻意压小）

## 结果

```
[INFO] Tests run: 175, Failures: 0, Errors: 0, Skipped: 1
[INFO] BUILD SUCCESS — Total time:  36.449 s
```

- `RealtimeControllerTest` 6/6 · `WireCommunityEventListenerTest` 6/6 · `WirePublisherFrameShapeTest` 8/8 · `WirePublisherRoundTripTest` 1/1 · `HealthServiceTest` 5/5 · `UserServiceTest` 7/7 · `UserVocabularyTest` 11/11 · 其余测试类合计无失败
- skip=1（唯一跳过用例，与上次同）· `mvn -q -DskipTests=true compile` 退出码 0
- 没有 5xx、没有 Spring 容器起失败、没有 reactor 循环

## 为什么安全写入证据

这是真正跑过的、用真实 JDK 编译、用真实 Surefire 跑的测试——不是"证据文档里的想当然"。
skip=1 与 2026-11-17 结果一致（同一个 known-skip）。

## 仍欠（诚实边界）

1. **未走 Spring Cloud 全链路**：E2E（web → gateway → domain-service → Postgres → Redis）需要 Java service 对真 EntityManager 的 DAO 路径更长，本次只跑到 `@WebMvcTest` + mock jdbc，并未拉起真 PG + 真 Redis 联机例子（与 2026-11-18 §16 时刻 Spring proof 16/16 场景不同）。
2. **Docker 24G 空间撑不住这次**：`docker ps` 显示 careeros/football_os/crossrealm 沉辎着约 3 GB 内存，未给 test 套件多余 headroom；故测试以 `-Xmx768m` 跑。
3. **本机仅此一台**：没有第二台宿主机跑 Eureka 服务器做完整发现；服务发现只到 Spring Cloud Contract 层，未做真实服务注册/摘除。

## 接下来的活儿（不暂停，按计划）

- 接着跑 `npm run fe-gates`/`verify:world-bible` 全量门禁，然后接着 Echo #163 合并入 world bible 的接连不断
- Spring Cloud 全链路 E2E 证据：Docker 恢复后，用 football_os_config + gateway 真链路跑一次
