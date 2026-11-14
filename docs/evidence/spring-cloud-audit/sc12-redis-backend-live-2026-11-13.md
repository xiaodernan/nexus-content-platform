# §SC-12 · 网关 `backend=redis` 限流 — 真线验证（2026-11-13）

## 先说清楚这件事的前人工作（防止把重复验证写成首创）

- **ADR-0095 第 229 行起（2026-11-09，§SC-12 第十片）**已经记过真 HTTP 双实例见证：registry 8761 +
  api 8081 + 网关 8092/8093（`rate=0 burst=2`）——8092 两次 200/200，从未碰本地桶的 8093 第三次 **429 + Retry-After: 1**；
  Redis `nexus:gateway:rate:127.0.0.1` 读数 `tokens=0`、TTL 3588；指向死端口的 8094 连续两次 200 且日志逐字
  `gateway rate limit backend 'redis' failed; request allowed unthrottled (fail-open)`。
- **2026-11-10 第十一片**又把 Lua 桶脚本下沉成脚本级判据（`scripts/gateway-rate-lua-live.mts`，
  `npm run ratelimit:gateway-lua`）：同一只键上多个调用方就是多个实例，不需要多个 JVM。
- **本文件**补的是"重演一次 ADR-0095 的承诺"：本机同一套 bits、真 Lettuce、真 Redis（56379）、
  **新的 KEY_PREFIX**（`nexus:gateway:verify:`，不写 `nexus:gateway:rate:` 默认桶）、**新的端口/新的客户端 IP**、
  且顺手直读 Lua 落地的 `tokens`/`ts`/`PTTL`（ADR-0095 那轮记了 tokens=0 与 TTL≈3588，没逐字记 hash 全文）。
  它不是新片，也不是首创；它是"这条纪律今天依然成立"的一份复现字节。

关联：§SC-12（ADR-0095）、§SC-36（ADR-0107 fail-open 线上纪律）、§SC-72（`verify:actuator` 线上 JVM 探测）。

## 环境

- `nexus-redis` 容器（docker，healthy），宿主 56379 → 容器 6379
- `services/nexus-gateway` 打包产物 `target/nexus-gateway-0.1.0-SNAPSHOT.jar`（Build timestamp 见 jar `META-INF/MANIFEST.MF`；Maven `build-info` goal 已开启）
- 启动命令（heap 限 384m，符合 16GB 盒子纪律）：

```
JAVA_TOOL_OPTIONS=-Xmx384m \
NEXUS_GATEWAY_RATE_LIMIT_BACKEND=redis \
NEXUS_GATEWAY_RATE_LIMIT_RATE=1 \
NEXUS_GATEWAY_RATE_LIMIT_BURST=2 \
NEXUS_GATEWAY_RATE_LIMIT_KEY_PREFIX=nexus:gateway:verify: \
NEXUS_GATEWAY_PORT=8097 \
NEXUS_GATEWAY_REGISTER=false \
NEXUS_CONFIG_ENABLED=false \
java -jar services/nexus-gateway/target/nexus-gateway-0.1.0-SNAPSHOT.jar
```

## 实际回执（原始字节）

**1. 启动行自报后端（不是默认值，是真选了 redis）**

```
2026-11-13T14:31:33.415+08:00  INFO ... dev.nexus.gateway.GatewayConfig
  : gateway rate limit: enabled=true backend=redis ratePerSecond=1.0 burst=2 maxClients=10000 backendTimeout=PT1S
```

**2. `/actuator/health` → 200 `{"status":"UP"}`**（`show-details: never` 契约未破）。

**3. `/platform/health` → 200**（注意：门控制器路径，见下）；`source:"Composite Discovery Client"`、`services:[]`——本次 eureka 在 8771 拒连（见"诚实边界"），注册表为空时网关如实报 `allUp:false`，没有伪造实例。

**4. 限流真生效（路由路径）**：`curl -H "X-Forwarded-For: 203.0.113.99" http://127.0.0.1:8097/domain/api/v1/permission/check?resourceType=project&resourceId=6fef79cf-a5f7-4d27-9e7e-30309e567dad&action=read`

```
req#1 -> 503  {"error":"service_unavailable","service":"nexus-domain-service","cause":"org.springframework.cloud.gateway.support.NotFoundException", ...}   （后端没起 —— 503 是路由没后端，不是"被限")
req#2 -> 503  （同上）
req#3 -> 429  {"error":"rate_limited","note":"per-client bucket shared by the gateway deployment; Retry-After is seconds"}
req#4 -> 429  （同上）
req#5 -> 429  （同上）
req#6 -> 429  （同上）
```

503 的原因：domain-service **没有启动**（本次只验证限流通路，不拉起后端链）。被限的 429 与 503 的区别：429 根本没有 reach 路由/后端。**RateLimitFilter 在拒绝时拦在门口。**

**5. Redis 侧字节证据**：对第二个 XFF 客户端 `203.0.113.100` 打 3 次（fresh bucket，burst=2）：

```
KEYS "nexus:gateway:verify:*"  → nexus:gateway:verify:203.0.113.100
HGETALL nexus:gateway:verify:203.0.113.100 →
    tokens     0.084799289703369
    ts         1794551547.873
PTTL                                                  → 2642 ms
```

读数解读：桶从 capacity=2 起，3 次请求消费约 2 个 token（第 3 次被 429 时 tokens≈0.08 且无可扣减）；`ts` 是 Redis `TIME` 的秒时间戳（1794551547 ≈ 2026-11-13T14:32:27Z），与本回运行时间吻合；`PTTL=2642ms` 证明 Lua 里 `PEXPIRE` 生效。键按 TTL 自清，未留任何测试垃圾在 Redis。

**6. 收尾**：gateway FYI 又请求了 203.0.113.100 之后键自过期；`redis-cli DEL nexus:gateway:verify:203.0.113.99 nexus:gateway:verify:203.0.113.100 nexus:gateway:verify:127.0.0.1` → `0`（全部已过期，无残留）。gateway 进程（pid 11852）已停止。

## 双端一致的证据链

| 层 | 证据 |
|---|---|
| HTTP 429 | req#3–#6，首个客户端（复现 ADR-0095 的 door 429 序列） |
| Redis Lua 真执行 | HGETALL/PTTL 真实字节（补 ADR-0095 未记的 hash 全文） |
| 后端选择 | 启动行 `backend=redis` |
| Fail-open 未误触发 | 本次无 `gateway rate limit backend 'redis' failed` warn——失败打开路径一直闲着，符合预期 |

## 诚实边界

1. **429 只对路由路径生效**：`/platform/health`、`/actuator/health` 是门控制器，在 WebFlux 分数前就答了，不走网关路由 GlobalFilter——本测里 6 连击全 200 如实如此，不是限流失效。
2. **429 只对被配为可路由的路径生效**：本测用 `/domain/**`（domain-service 未起，503 也可入门）。租户直连不经网关直连后端则完全不经过这个桶。
3. **eureka 本次 8771 拒连**——与本验证无关（限流不依赖 eureka）；`/platform/health` 如实报 `services:[]` 而非伪造实例。
4. **ratePerSecond=1、burst=2 是刻意设小**以便 <1s 内可复现 429 序列；默认配置（100 rps / burst 200）按设计不会被本测打出 429。
5. 只证明"Lua 桶脚本在真 Redis 上工作 + 首个客户端被限"，没有复现多实例竞争同一桶（1 个 gateway 进程），也没有触发 fail-open（没做过 Redis blackhole）。
6. 测试键前缀独立（`nexus:gateway:verify:`）且全部自过期，线上共享 Redis 无残留。
