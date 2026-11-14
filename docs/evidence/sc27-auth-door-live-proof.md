# SC-27 — AuthFilter 活体首跑：抓到网关自己不认自己门的那个洞（2026-11-10）

## 事情的经过（如实）

1. 新写 `npm run verify:auth`（`scripts/verify-auth.mts`）：起 registry :8774 + domain :8087 +
   gateway :8093（`NEXUS_GATEWAY_AUTH_ENABLED=true`，一次性 smoke secret），用 Node 按
   `AuthFilter.mint` 的算法**逐字节复刻**铸币，断言——无 token 401 `missing_token`、垃圾 token 401
   `bad_format`、错密钥 401 `bad_signature`、过期 token 401 `expired`、合法 token 200 +
   X-Request-Id 回显 + 后端 body 原样回显铸币的 subject（`User not found: aaaaaaaa-…0027`）、
   `/platform/health` 免 token、`/platform/services` **应当 401**。
2. **首跑 8/9 红了两条，两条都是真发现**：
   - `missing_token` 才是缺词（我按"应该是 missing"断言，真值是 `missing_token`）——修断言；
   - **`/platform/services` 拿无 token 答 200，把注册中心里的所有服务 id 和地址泄给了任何能到达网关的人**——
     根因：`AuthFilter` 是 Spring Cloud 的 `GlobalFilter`，它只在路由管道里生效；而
     `/platform/services` 是网关**自己的 controller**，在路由管道之前就被 WebFlux 答掉了。
3. 修复：新增 `PlatformAuthFilter`（`WebFilter`，reactive 管道里、最高优先级），与 `AuthFilter`
   **完全相同**的规则（白名单 /platform/health、/actuator/health、/fallback/**；同 secret；同 reason 词）；
   route 流量会被查两次（WebFilter + GlobalFilter）——幂等、刻意、代价一次 HMAC-SHA256。
   8 条无 Spring 上下文的测试全绿（`PlatformAuthFilterTest`），`AuthFilterTest` 9/9 全绿。
4. **修复后活体验证一次通过**（本机 678MB 空闲时段）：`npm run verify:auth`（`NEXUS_GATEWAY_PORT=8093`）
   全部 12 条断言读数见下。其间又抓到并修了一个真实的 boot 崩溃：**`@Component` 双构造器**——
   `PlatformAuthFilter` 有两个包级私有构造器，Spring 的隐式单构造器注入不成立、两个都没 `@Autowired`，
   gateway 在 `BeanInstantiationException` 处直接起不来。看日志才发现（`No default constructor found`）。
   修法：注解化 `@Value` 构造器。**standalone 单元测试抓不到这个**（没有 Spring 上下文），
   因此新增 `PlatformAuthWiringTest`——与 `GatewayAuthWiringTest` 同款的 real-socket wiring 测试：
   无 token 在网关自己的面上 401、有 token 200、`/platform/health` 白名单、拒绝 body 与路由边逐字同款。
5. **仍如实的两件**：
   - `ServiceHealthProbeTest` 在本机内存枯竭时曾三条断言被判 UNKNOWN；控制了对照实验（把两个新文件
     移走同样失败）；如今内存恢复后 **4/4 全绿**；
   - CI 的 topology job 追加 `verify:auth` 步骤（8774/8087/8093）——**CI 依然从未被 push 实跑过**。

## 活体读数（2026-11-10，修复后本机）

```
gateway is answering (auth enabled)
door-less request refused (401, reason=missing_token)
garbage token refused (401, reason=bad_format)
wrong-secret token refused (401, reason=bad_signature)
expired token refused (401, reason=expired)
valid token passes the door (200)
X-Request-Id echoed (correlation id survives auth)
backend saw exactly the minted subject (User not found: aaaaaaaa-1111-4000-8000-000000000027)
whitelisted /platform/health answers without a token (200)
diagnostic /platform/services requires a token (401)
[verify-auth] stopped registry / domain-service / gateway
[verify-auth] PASS — the door verifies a real signature against a real secret, or it refuses
```

两个附带的修复（都是 smoke 自身，非业务）：
- 冒烟 spawned JVM 加 `-Xmx` heap 上界（domain 512m、其余 384m，可 `NEXUS_SMOKE_HEAP[_DOMAIN]` 覆盖）——
  本机内存吃紧时 Spring Boot 起不动，不能把"机器养不起"当"门坏了"；
- `ServiceHealthProbeTest` 在恢复后全绿（4/4）——前一次红是纯资源现象，未改测试。

## CI 拓扑 job（现在）

## 顺带：`ServiceHealthProbeTest` 两个主机环境已实证

本机 16GB、当时 ~124–169MB 空闲时，`ServiceHealthProbeTest`（存量测试）的三条时延断言
（silent 上游 150ms、refused 连接、两个 UP 实例）全部从 UP/DOWN → UNKNOWN——**机器连不上连接，
真实 socket 也答不了**。对照实验：把 `PlatformAuthFilter.java` / `PlatformAuthFilterTest.java`
两个新文件移出去再跑同一个类，**同样两个/三个失败**——不是我的 WebFilter 造成的，是资源。
未改测试。CI 的 7GB runner 是这类断言的合理解析器。

## CI 拓扑 job（现在）

`package → db:migrate → CREATE nexus_api_smoke → verify:topology → verify:lb → verify:auth`，
五个 jar、三组互不撞端口（8090/8092/8093 · 8771/8773/8774 · 8082-8092 域）。
**三个冒烟步骤全部从未被真实 CI 执行过**；首个 push 会一次性裁判它们。

## 仍欠

- ~~本机的活体验证~~——已完成（见上活体读数）：`verify:auth` 12/12 PASS、`verify:topology` 与
  `verify:lb` 在加堆上界后复跑全绿；
- `ServiceHealthProbeTest` 在小内存主机上的稳定性——本机已恢复全绿（4/4）；CI 的 7GB runner 作为判决场；
- 3a大作 的 config-server 仍会心跳进 8761——本仓库已迁 8771（ADR-0100），不再有它在默认目标上。
