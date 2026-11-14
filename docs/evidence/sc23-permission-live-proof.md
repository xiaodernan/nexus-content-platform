# SC-23 — Permission 面：只读、有入口、经 gateway、经 service discovery（2026-11-10）

SC-17 给了社区一扇门，SC-20 给了账单一扇门，这一片给了权限一扇门——**而且把"第一下请求直接 503"也如实
录下来了**：不是所有读数都是绿的，绿的也得有证据。

## 交付物

| 面 | 文件 | 内容 |
|---|---|---|
| Controller | `services/java-domain-service/.../permission/PermissionController.java` | `GET /api/v1/permission/check?resourceType&resourceId&action=read`；X-Nexus-Subject 缺省 → 400；非 UUID subject → 400；未知 resourceType → 400（PermissionService 的句子透出）；用户 id 不存在 → 400（`User not found: …`） |
| 测试 | `.../permission/PermissionControllerTest.java` | 6 条无 Spring 上下文 MVC 测试：形状、write 非主人被拒、无 subject 拒绝、非 UUID 拒绝、未知 type 句子、资源 id 不合法句子 |

读数：`mvn -B test` = **103/103**（含新增 6）BUILD SUCCESS。

## 真跑（三机服务：registry :8761 / domain :8082 / gateway :8091，NEXUS_GATEWAY_PORT=8091）

> 端口说明：默认 :8090 被一个不属于本仓的进程（PID 39424，`com.nexus.NexusApplication`，spring-boot:run，
> argfile 的 classpath 指向已不存在的 `services/platform/target/classes`）占着，本片不与它抢；gateway 改用
> :8091 跑同一套路由。**不杀、不抢、不碰它。**

| 请求（经 gateway `/domain/**` → `lb://nexus-domain-service`） | 状态 | 读数 |
|---|---|---|
| `permission/check?resourceType=project&resourceId=6fef…&action=write`, subject=d6442…（真主人）**首次调用** | **503** | `{"error":"service_unavailable","service":"nexus-domain-service","cause":"java.util.concurrent.TimeoutException","note":"the gateway did not reach a result for this call; an empty list would mean something else"}` —— 网关 5s 上限（`NEXUS_GATEWAY_TIMEOUT` 默认 5s），domain 服务冷启动（Hibernate metamodel + Hikari 首连）超过 5s |
| 同上，第二次调用（warm） | **200** | `{"allowed":true,"isAdmin":false,"caller":"d6442aa2-…","action":"write","authority":"ROLE_creator"}` |
| 同上参数，subject=383ff…（陌生人）action=**write** | **200** | `{"allowed":false,…,"authority":"ROLE_creator"}` —— 陌生人写被拒（在回答里，不在异常里） |
| 同上参数，subject=383ff…（陌生人）action=**read** | **200** | `{"allowed":true,…}` —— legacy"stranger 可读"契约如实保留 |
| 同上参数，resourceId=`00000000-0000-4000-8000-000000000000`（鬼资源） | **200** | `{"allowed":false,…}` —— 解析不到的资源什么都不给 |
| `resourceType=moon`（真实存在的用户） | **400** | `{"error":"Unknown resource type: moon"}` —— PermissionService 的句子 |
| 无 `X-Nexus-Subject` | **400** | 网关之后、领域之前拒绝（policy: 不是猜身份，是没有门就没有请求） |
| 哨兵 subject `aaaaaaaa-…`（库里没有此用户）经 `verify:topology` | **400** | `{"error":"User not found: aaaaaaaa-…"}` + 响应头 `X-Request-Id: verify-topology-perm-001` 原样回显 |

## 抓到的真问题（如实记）

**第一次 503 是真读数，不是 flaky**：gateway 的 5s response timeout 是**设计行为**（第八片立下的
"快速失败、不挂住请求"），domain 冷启动超过它。它暴露的不是 bug 而是欠账：**gateway→domain 的
first-hit 体感**——给路由加 connect/response timeout 的语义没错，错的是没被 smoke 覆盖到这条路径上。
修法不是把 timeout 调大（那会伤门的 fail-fast 设计），而是让 smoke 真正覆盖"冷"路径，或 domain 服务
预热（已有 `/actuator/health` 就绪等待，但 JPA 首查仍在第一次业务请求才触发）。这一项记入欠账，
不在本片内用调参消音。

## verify:topology 同步扩面

`npm run verify:topology`（`NEXUS_GATEWAY_PORT=8091`）现在额外断言：
- permission 检查：哨兵 subject → **400 + "User not found" 句子 + X-Request-Id 回显**；
- permission 无 subject → **400**；
- 三个端口可经 `NEXUS_REGISTRY_PORT` / `NEXUS_DOMAIN_PORT` / `NEXUS_GATEWAY_PORT` 覆盖（:8090 不归本仓时用 :8091）；
- stale jar 自动 `mvn -o -DskipTests package`（jar 比最新 .java 新才用旧包，否则先打包）；
  Windows 下走 `mvn.cmd` + `shell: true`（execFile 不能直接跑 .cmd）。

读数：port 8091 上 **PASS**（eureka 应答 → domain 注册 → policy 200 → billing balance 0 + X-Request-Id
回显 → 无 subject 400 → permission 拒绝句 + X-Request-Id 回显 → 无 subject permission 400 → 自动停三服务）。

## 如实的边界

- 只读。角色变更（grantRole/revokeRole）刻意不存在（提权原语）。
- 陌生人 `read` → allowed:true 是 legacy 契约，不是本片新造的规则；可见性收紧是另一片。
- `X-Request-Id` 在这条路径上（拒绝分支）也回显了——SC-14 correlation 在网关的每个 backend Path 过滤器上都成立。
