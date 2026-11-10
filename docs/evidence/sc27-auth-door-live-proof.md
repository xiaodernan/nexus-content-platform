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
4. **活体验证本轮没能跑完**（如实）：修复后本机只有 ~169MB 空闲物理内存（vmmemWSL 3GB、
   msedge 2.4GB、docker 907MB——全部不是本仓库的进程，不动），gateway 在 150 秒内起不来，
   `npm run verify:auth` 以非零退出、三个 JVM 全部清干净。**不是门坏了，是机器没内存了。**
   - CI `main-line.yml` 的 topology job 已追加 `verify:auth` 步骤（8774/8087/8093）——CI 的 7GB
     runner 才是这扇门的真正验收场；一次真实 push 之前，它依然从未被 CI 实跑过。
   - 单元层的事实：WebFilter 与 GlobalFilter 走同一个 `AuthFilter.verify`——网关自己的面与后端的面
     现在过同一把锁。

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

- 本机的活体验证（等内存窗口：verify:auth 重跑 + verify:topology / verify:lb 复跑）；
- `ServiceHealthProbeTest` 在小内存主机上的稳定性——应在 CI 跑出真判决，本机不改测试去迁就环境；
- 3a大作 的 config-server 仍会心跳进 8761——本仓库已迁 8771（ADR-0100），不再有它在默认目标上。
