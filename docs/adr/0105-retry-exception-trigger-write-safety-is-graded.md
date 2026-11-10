# ADR-0105：重试的第二条触发源也能挡住写重放——钉住连接层故障下的 GET-only 承诺

- 状态：已接受（2026-11-11）
- 相关：`services/nexus-gateway/src/main/java/dev/nexus/gateway/GatewayConfig.java`（`edgePolicy` 的
  `.retry(...)`：两条触发源 `setStatuses(503)` 与 `setExceptions(IOException, TimeoutException)`，均受
  `setMethods(GET)` 约束）、
  `services/nexus-gateway/src/test/java/dev/nexus/gateway/GatewayRetryTransportWiringTest.java`（新增，
  连接层断连 wire 判据）、
  `services/nexus-gateway/src/test/java/dev/nexus/gateway/GatewayEdgePolicyTest.java`（既有，status 触发
  wire 判据）、`services/nexus-gateway/src/test/java/dev/nexus/gateway/StubUpstream.java`（新增有界断连
  夹具 `dropNextConnections`）、`docs/adr/0101`（同源的 `already committed (503)` 已知边界）、
  `docs/ROADMAP.md` §SC 第二十九片。

## 背景

网关每条后端路由的重试策略有**两条独立的触发源**，都在 `GatewayConfig.edgePolicy()` 里声明：

```java
.retry(c -> c.setRetries(1)
        .setMethods(HttpMethod.GET)                          // 安全承诺：只重放读，不重放写
        .setSeries()
        .setStatuses(HttpStatus.BAD_GATEWAY, HttpStatus.SERVICE_UNAVAILABLE)   // 触发源一：状态
        .setExceptions(IOException.class, TimeoutException.class))             // 触发源二：异常
```

`GatewayEdgePolicyTest` 已经把**触发源一**钉在 wire 上：后端回 503 时，GET 收到 2 次（重试一次）、
POST 只收到 1 次（不重放）。但**触发源二**——后端在连接层直接断掉、根本没回 503——从没被测过。而这
恰恰是最常见的真实故障形态（连接被重置、后端进程崩了、TLS 握手后断开）。策略注释把「只重放 GET」
当成一条安全承诺，理由是「a proxy that repeats a write is how one click becomes two publications」。
如果这条方法门在**异常触发路径**上不生效，一次网络抖动就会把一次投稿变成两次——这是数据级事故，
不是性能问题。用户本轮继续要求「集大成 / 持续演进」，把这条承诺在没被测的那一半补齐，是分内之事。

## 决定

**先实测、再落判据；不改生产。** 一条一次性探针（跑完即删）接真实 socket，让后端对前 N 个请求
`exchange.close()`（无响应字节），分别用 GET / POST 连打 5 轮，读 wire 计数与 caller 状态。

### 实测读数（不粉饰）

| 触发源二：连接层断连 | 后端 wire 次数（5 轮） | caller status（5 轮） |
|---|---|---|
| **POST（写）** | **1, 1, 1, 1, 1** —— 5/5 稳定 | 503, 503, 503, 503, 503 |
| **GET（读）** | 2, **1**, 2, **1**, 2 —— 不稳定 | 503, 503, **200**, 503, **200** |

日志同时抓到 `reactor.netty.http.client.PrematureCloseException: Connection prematurely closed BEFORE
response` 与 ADR-0101 已记的 `ServerHttpResponse already committed (503)` 噪声。

### 源码订正（先猜后查，猜错即改）

初判以为 Netty 的 `PrematureCloseException` 是 `RuntimeException`、匹配不上 `setExceptions(IOException)`，
GET 的重放只能靠「异常被映射成 503 → 触发源一兜底」。**查 `reactor-netty-http` 源码后订正**：
`public final class PrematureCloseException extends IOException`——它**就是** `IOException`，所以触发源二
是活的，GET 的 wire=2 走的是异常重试本身。再查 `RetryGatewayFilterFactory.RetryConfig`：status 谓词
是 `retryableMethod && retryableStatusCode`，exception 谓词在异常命中后 `return retryableMethod`——
**两条触发源都套同一个 `setMethods(GET)` 门**。所以 POST 的 wire 恒 1 不是侥幸，是方法门在异常路径
上确实生效。这条订正本身记在这里，免得未来 agent 再凭异常类名猜继承关系。

### 落地的稳定判据（`GatewayRetryTransportWiringTest`，2 条 × 6 轮）

1. **写永不被重放**：dropped POST 每轮都只到后端 **1 次**、caller 得诚实 **503**。`hasSize(1)` 一举证明
   两件事——请求确实打到 wire（不是被门挡在门外）、且没有第二次尝试。6 轮把「稳定性」本身编进断言，
   不是一次侥幸。
2. **重试不放大、答复必诚实**：dropped GET 每轮后端 wire ∈ [1, 2]（重试上限 = 1，不放大成雪崩），
   caller status ∈ {200, 503}（要么自愈、要么 fallback 诚实失败，绝不是未处理 500 / 429 / 挂死）。

**刻意不 pin**：GET 单轮的精确 wire 数和最终 status。它们是 Reactor Netty 断连、breaker fallback
抢先 commit 503、retry 争着重放三者时序交叠的结果（日志里的 `already committed` 就是显式证据），
跨轮在 wire=1/2、status=200/503 间浮动。钉死任何一个都是 flaky 的假绿。GET「能重试且只重试一次」
的**确定性**证明归 `GatewayEdgePolicyTest` 的 status 触发腿（那里后端回 503，时序可控，wire 恒 2）；
本类只负责异常触发腿的**写安全**证明。两者合起来，方法门在两条触发源上都成立。

## 后果

### 为什么不修生产

触发源二的**配置本身是活的、正确的**：`PrematureCloseException` 命中 `setExceptions(IOException)`，
GET 因此重试，POST 被方法门挡住——安全承诺成立，没有缺陷要修。GET 的 status 浮动源于
`retry` 与 `circuit-breaker` 两个 filter 在失败路径上抢着写响应（fallback 先 commit 503，retry 的
重放要么赶上自愈 200、要么撞上已提交响应），这正是 **ADR-0101 已决定「不改生产 route 语义」的同源
噪声**（那里是 HALF_OPEN 半开失败路径，这里是 exception 重试路径）。修它要动 filter 编排顺序或
fallback 语义，会扰动 §SC-24/§SC-29 已验证的 breaker 行为，风险远大于收益。决定：**延续 ADR-0101，
记为已知边界，不为一条测试好看而改 route 语义。**

### 夹具

`StubUpstream` 新增 `dropNextConnections(int)`：前 N 个请求在 `paths.add()` **之后** `exchange.close()`
（无响应字节），之后自动恢复正常。有界、自愈，所以单个测试能同时观察「故障触发重试」与「恢复后
重试能成功」。`reset()` 清零。它补上桩件第三种失败形态：此前 `failNextRequests` 是「回一个 5xx」，
`startDropping` 是「手动永久断连」，都不适合测有界自愈的异常重试。

### 验证读数

- 单类 `GatewayRetryTransportWiringTest` = **2/2 PASS**（含 12 次真实断连请求的重复采样）。
- 网关全套 `mvn -o -B test -f services/nexus-gateway/pom.xml` = **90/90 BUILD SUCCESS**
  （SC-32 基线 88 + 本片 2）。
- 顶层 `npm run typecheck` = **14/14 PASS**。本片改动仅 `.java` / `.md`，零前端文件；
  整仓 `npm run eslint` 仍是本机内存下的超时边界（非 lint 报错），如实记，不假报绿。

### 诚实边界

- 本片测的是**方法门**（写不重放、重试上限），不证明「每条连接断连都能自愈」——GET 有 2/5 的轮次
  最终是 503，这是既定行为（诚实失败），不是缺陷。
- 断连夹具模拟的是**响应前关闭连接**（`PrematureCloseException`）；超时型故障（`TimeoutException`）
  与「响应中途断开」是另外的形状，本片未覆盖，记入 ROADMAP 缺口，将来若要钉需另造慢响应夹具
  （`StubUpstream.delay` 已在，但 timeout 与 retry 的时序同样易浮动，需谨慎设计不 pin 的判据）。
- breaker 在本测试里被刻意保持 CLOSED（窗口 100、minimum-calls 100），故 wire 计数只反映方法门，
  不含 breaker OPEN 后的快速失败；breaker 开合由 §SC-24/§SC-29 各自负责。
- 未推送（无明确指令）；既存未跟踪目录 `test-results-mine*` 非本轮产物，未触碰。

## 结论

重试的「只重放读、不重放写」承诺此前只有一半（`setStatuses`）被 wire 级证明，而真实故障更常走
另一半（`setExceptions`）。SC-33 用真实 socket 的重复采样证明：**连接层断连下写请求恰好到后端一次、
从不被重放，读请求最多重试一次**，把数据级事故的那道闸钉死在测试里；同时如实记录 GET 结果因
filter 编排时序浮动、`already committed` 噪声同源复发，延续 ADR-0101 不改生产的决定。承诺从注释
变成了两侧触发源都有判据的不变式。
