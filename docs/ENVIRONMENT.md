# NEXUS — 环境勘察（§191 STEP 1）

勘察时间：2026-09-22。这台机器是开发主环境，架构决策必须尊重这些事实。

## 硬件

| 项 | 值 |
| --- | --- |
| OS | Windows 11 Home, 10.0.26200, x64 |
| CPU | 12th Gen Intel i5-12500H, 12 cores / 16 threads |
| RAM | 15.8 GB 总量，**空闲仅约 2.5 GB**（Docker Desktop/WSL vmmem 常驻 ~2.1 GB） |
| GPU | NVIDIA RTX 3060 Laptop 6 GB |
| 磁盘 | C: 70 GB 空闲，D: 43 GB 空闲 |

**关键约束：内存。** 不能同时常驻 Next.js dev server + FastAPI + Spring Boot + Postgres + Redis + MinIO + Playwright。
所有本地服务必须支持"按需启动"，并在 `docs/RUNTIME.md` 中给出最小可运行组合。
2026-11-10 实测：`scripts/verify-topology|loadbalance|auth.mts` 启动的 JVM 全部带 `-Xmx` heap 上界
（**domain 512m，其余 384m**，用 `NEXUS_SMOKE_HEAP` / `NEXUS_SMOKE_HEAP_DOMAIN` 覆盖）——
本机空闲只剩 ~150MB 时 Spring Boot 默认堆会让服务在 150 秒内起不来；把"内存吃紧"当"服务坏了"是误诊。

## 工具链

| 工具 | 版本 | 状态 |
| --- | --- | --- |
| Node | v24.15.0 | OK |
| npm | 11.12.1 | OK |
| pnpm | — | 未安装（暂用 npm workspaces，不引入额外变量） |
| Git | 2.52.0 | OK（无全局 user.name/email，提交用 `-c` 内联身份） |
| Java | Temurin 25.0.1 | OK |
| Maven | 3.9.15 | OK |
| Python | 3.11.1 + pip 25.3 | OK |
| Docker Desktop | 29.9.3（2026-11-12 重启后实测；2026-09-22 勘察为 29.1.3） | OK |
| Chrome | 已安装 | Playwright 复用系统 Chrome（`channel: 'chrome'`） |
| psql / redis-cli | — | 本机无，仅通过容器访问 |

> **Playwright 约束**：本机网络无法下载 Playwright 自带的 Chromium/headless-shell（`npx playwright install` 失败）。
> 截图与 e2e 一律用系统 Chrome：`chromium.launch({ channel: 'chrome' })`。已实测可渲染并截图成功。

### 2026-11-12 真实 LLM provider 接入（§AILIVE-1）

本机开发从此日期起默认接入真实 LLM provider（wkapi.pro 的 `gpt-6-sol`）：`apps/ai-service/.env`
含 key（gitignored，详见 `apps/ai-service/.env.example`），`NEXUS_OPENAI_BASE_URL`、`NEXUS_MODEL_*`、`NEXUS_LLM_JSON_MODE` 亦同。
因此核心 AI 依赖不再是纯 mock（§160 §AGENTS）；

- `/healthz` capability 现为 `real`（providers: `llm`/`embedding` openai-compatible REAL；
  `image`/`video`/`speech` 仍如实 `unavailable`）。
- web 的 Provider 就绪页盖 `在线 · real` 布尔真，不再是 `未配置`。
- `scripts/probe-provider.py` 一次请求验证 endpoint（无需手动导环境变量，读 apps/ai-service/.env）。
- 真实调用产生真实费用：每个真实 generation 请求都向 endpoint 计费；`demoMode=false`。
  开发时不想产生费用就别触开发 AI 路径（或删 .env 里的 key）；healthz 会退回 mock，
  `DEMO MODE` 标志真显示，§AGENTS 纪律仍有效。

### 2026-11-13 LLM 通路接入 prompt caching（§AILIVE-4）

`wkapi.pro`（OpenAI 兼容网关）的 `usage` 对象默认**不带 prompt caching 字段**（只给 `prompt_tokens/completion_tokens/total_tokens`）；stream SSE 结尾直接 `[DONE]`、没有 usage 帧——stream 不是"坏"，充其量是"报不了数"。

2026-11-13 修：OpenAICompatibleProvider 发 `prompt_cache_key`（缺省 `nexus-studio`，env `NEXUS_OPENAI_PROMPT_CACHE_KEY`，显式空串关闭）；`usage` 新增 `cachedTokens`（default 0），契约三件套同步。实测：同 payload 第二次起 `cached_tokens=6272/6449（97.2%）`；经 `POST /v1/ai/run` 完整 HTTP 路径 cold 0 → warm 6272（**97.8%**）。`/healthz` 依旧 `real`；成本仍只看网关的 truth（`costUsd=0`，不编）。

进程归属与停机纪律见 `docs/environment/port-3200-ai-service-owner.md`（3200 现由本仓 patched 实例持有）。

## 已有容器（不属于本项目，禁止复用/删除）

`careeros-postgres`(5432), `careeros-redis`, `careeros-minio`(19000), `nexus-seed-verify`(55432)。

### 2026-11-12 重启后清点（实测）

OpenCode/Docker 一次同机重启让全部容器掉线。重启 Docker Desktop 后：
- **`nexus-postgres`**（55433）和 **`nexus-redis`**（56379）自动回到 Healthy（其 compose restart 策略把它们拉回）；
- `nexus-admin`, `nexus-gateway`, `nexus-java-pg`, `nexus-eureka`, `nexus-config`、
  若干 `nexus-health-db-*` / `caesura-*` 仍是 **`Created`（从未 start）**——本机没有常驻 Spring Cloud
  五件套，Java 侧一律由 `npm run verify:topology` / `verify:lb` / `verify:actuator` 按需拉起；
- `specproof-*`、careeros-\*、football_os-\* 保持原状（其中 careeros-\* 掉线前后一视同仁、未动）；
- **根因/症状**：网页当时 `GET /` 的 500 是 "the database system is starting up"（Postgres 57P03），
  不是前端、不是后端逻辑坏了——startDockerDesktop 后分钟级自愈；重启前看日志必须先分清这是
  "容器没起来"还是"服务代码病了"。

因此 NEXUS 使用**独立端口段**避免冲突：Postgres `55433`、Redis `56379`、MinIO `59000/59001`、AI Service `3200`、Web `3100`。
容器统一前缀 `nexus-`，compose project name 为 `nexus`。

Spring Cloud 三件（2026-11-09 起，SC-1–SC-3）：注册中心 **`8771`**（2026-11-10 起专用端口，
原 8761 已被本机另一项目（`D:\3a大作`）的 Spring Cloud 栈占用——其 config-server 会心跳进一个
在 8761 起的 registry，实测见 `docs/adr/0100`）、网关 `8090`（被占挡用 8091，`NEXUS_GATEWAY_PORT`）、
`nexus-api` 默认 `8080`。
三个都可被环境变量覆盖：`NEXUS_REGISTRY_PORT` / `NEXUS_GATEWAY_PORT` / `NEXUS_API_PORT`，后端用
`NEXUS_API_REGISTER=true` 才会注册。

SC-6 起第四个进程：`java-domain-service` 默认 `8082`（`NEXUS_DOMAIN_PORT`），用
`NEXUS_DOMAIN_REGISTER=true` 注册；数据库用 `NEXUS_DOMAIN_DB_URL` + `DB_USERNAME` / `DB_PASSWORD`，
Redis 用 `REDIS_HOST` / `REDIS_PORT`。它映射的是 web 层的 schema，`ddl-auto` 固定 `none`。

SC-7 起网关的边界参数也可覆盖：`NEXUS_GATEWAY_MAX_REQUEST_BYTES`（默认 1048576）、
`NEXUS_GATEWAY_RATE_LIMIT`（默认 `true`）、`NEXUS_GATEWAY_RATE_LIMIT_RATE`（默认 100 每秒）、
`NEXUS_GATEWAY_RATE_LIMIT_BURST`（默认 200）、`NEXUS_GATEWAY_RATE_LIMIT_CLIENTS`（默认 10000）。
SC-12 起限流后端可选：`NEXUS_GATEWAY_RATE_LIMIT_BACKEND`（`memory` 默认 / `redis` 共享计数）、
**SEO**：`NEXUS_SITE_ORIGIN`（可选，绝对域名如 `https://nexus.example.com`，结尾不带 `/`；未配置时 `/sitemap.xml`
返回空集、`robots.txt` 省略 Sitemap 行——不生成协议非法的相对 URL，公开页集合由 `apps/web/test/sitemap-robots-contract.test.ts` 钉死）。
`NEXUS_GATEWAY_RATE_LIMIT_KEY_PREFIX`（默认 `nexus:gateway:rate:`）、`NEXUS_REDIS_HOST` /
`NEXUS_REDIS_PORT`（默认 `127.0.0.1` / **56379**，不是本机别人的 6379）、
`NEXUS_GATEWAY_REDIS_CONNECT_TIMEOUT` / `NEXUS_GATEWAY_REDIS_TIMEOUT`（各 1 秒）。`memory` 桶按**实例**
计；`redis` 桶由所有实例共享，后端不可达时 **fail-open**（放行 + WARN，限流不阻断门）。

SC-8 起网关的 `/platform/health` 会逐个实例探测 `/actuator/health`，单实例超时用
`NEXUS_GATEWAY_HEALTH_TIMEOUT_MS`（默认 1500）。注意本机 6379 被另一项目的 specproof-redis 占用且要
AUTH：`java-domain-service` 的 Redis 默认端口已改成 **56379**（nexus-redis，SC-10 修复），只有显式
`REDIS_PORT` 才会改走别处。

SC-9 起可选第五个进程：`nexus-config` 默认 `8888`（`NEXUS_CONFIG_PORT`），native 模式读自身 classpath
的 `nexus-config/`。**三个服务（gateway / nexus-api / java-domain-service）都默认不连它**；要看集中配置
生效，启动时加 `NEXUS_CONFIG_ENABLED=true` 与 `NEXUS_CONFIG_URL=http://127.0.0.1:8888`（SC-11 把客户端接到
api 与 domain）。配置中心不注册 Eureka，`8888` 不要和别的项目混用。

> `8761` 是 Eureka 的默认端口，**本机别的项目注册到这里是常态**：2026-11-09 联调时
> `/eureka/apps` 里同时有外部项目的 `FOOTBALL-EDGE`；2026-11-10 再实测，`D:\3a大作` 的
> config-server 心跳打进一个跑在 8761 的 registry（registry 日志 `Not Found (Renew): CONFIG-SERVER -
> host.docker.internal:config-server:28889`），`/platform/services` 会老实把它列出来。这是读数在说真话，
> 不是串台——所以 **2026-11-10 注册中心默认端口迁到 `8771`**（所有服务的 `defaultZone` 与
> `NEXUS_REGISTRY_PORT` 默认都指向 8771；8761 留给 3a大作）。要回退只需重新设回两个环境变量。

> 同一天实测 `8080` 与 `8090` 都被机器上的外部进程占着（不是本仓库的服务，**不要终止**）。
> 联调改用 `--server.port=8081`（api）与 `NEXUS_GATEWAY_PORT=8091`（网关）；注册中心按服务 id 找到
> 8081，所以网关不需要知道这个数字。

> 端口 `3000` 已被机器上另一个项目的 Next dev server 占用（`D:\求职平台\frontend`，属外部进程，禁止终止），
> 因此 NEXUS Web 固定使用 **3100**，e2e / 预览 / 截图脚本都以 `http://localhost:3100` 为基准。

> 2026-09-24 这里记过一次"Redis 端口不一致"：说当时在跑的 `nexus-redis` 映射的是 `127.0.0.1:6380`。
> **那条把两台容器看混了**（2026-10-06 实测更正）：`docker port nexus-redis` 现在给的是
> `6379/tcp -> 0.0.0.0:56379`，而 `127.0.0.1:6380` 属于**另一个项目**的 `nexus-platform-redis`
> （`nexus-platform-*` 那一组容器不归本项目动，见仓库根 AGENTS.md）。
> 按那条旧记录去设 `NEXUS_REDIS_URL=…:6380` 会把本项目的事件发到别人家的 Redis 上——
> 界面照样亮、测试照样绿，因为对面确实有个能用的 Redis。所以这一串端口以 `docker port <容器名>` 为准，
> 不要从 `docker ps` 那一列里按"看着像"的那行抄。
>
> 还有一个更阴的：**Docker 引擎死了之后，发布出来的端口会继续 LISTENING**（本机 2026-10-05 实测过一次，
> 表现是"数据库全线红"）。所以判断服务在不在，先用 `docker version` 确认引擎活着，再打一条真命令
> （`redis-cli ping` / `psql -Atc "select 1"`）；只 `netstat` 看端口会读到假绿。

### `NEXUS_REDIS_URL`（§162 队列、§163 实时扇出与 §64 限流窗口共用这一串）

- **不设**：实时总线用进程内驱动，限流闸用进程内滑动窗口（本机开发、vitest、e2e 都只有一个 web 进程，
  这样少一个依赖也少一套失败模式）。**但多实例部署下不设它等于把限额那句话改成"每台各数各的"**——
  `10 次/15 分钟/邮箱` 在两台前端下是 20 次，而且没有读数会说这句变了；
- **设为非空**：实时总线换成 Redis pub/sub 扇出驱动，限流闸换成 Redis 有序集滑动窗口，
  装载那一刻各打一行日志说清装的是哪个（`[realtime] 驱动=…` / `[rateLimit] 驱动=…`）。
  空格串算"没设"（两边读的都是 `.trim()` 后的值）。
  **两边的失败取向是相反的**，这是刻意的：总线连接失败**不会**退回进程内，只让日志、
  `wireErrorCount` 与 `ready=false` 出声（`docs/adr/0028-realtime-redis-fanout.md`）；
  限流闸**会**退回进程内并且记账 `nexus_rate_limit_driver_fallbacks_total`——退回之后仍在挡单机暴力破解，
  代价是退回期间那一台的额度是它自己看到的次数（`docs/adr/0076-rate-limit-redis-sliding-window.md`）。
- 本机跑法：`NEXUS_REDIS_URL=redis://127.0.0.1:56379`；跨实例那层用 `npm run realtime:two-process` 验，
  它只要 Redis、不要数据库，起不来时会先打一句"线路不通"而不是等 25 秒超时。
  限流那一层的跨实例同样有一条：`npm run ratelimit:two-process`（2026-11-03 起 **18 个真进程、16 条判据**；
  2026-11-05 第三十六片加满额那两台后是 **22 个真进程、19 条判据**，
  判据读的是父进程自己 `ZRANGE`/`SCAN` 出来的那两条集合与那个前缀下的键数，不采信孩子进程的自述）。

### `NEXUS_JOB_QUEUE`（v661 / ADR 0066：持久副作用作业通道的开关，与上面的 URL 分工不同）

- **不设（默认）**：这条 lane 完全不在场。`getJobQueue()` 是一个真 no-op，**不开任何 Redis 连接**，
  导出通知照旧在下载响应路径上同步 `emit`。只想用 Redis 做实时扇出/限流的部署不会意外多出一个
  常驻消费者——这是把"开关"与"驱动"拆成两个旋钮的全部理由。
- **设为 `1` / `true` / `on`**：Next `nodejs` 服务器在 `instrumentation.register()` 里起一个进程内
  XREADGROUP 消费者，把导出的 `build.complete` 通知甩到 Redis Stream 上；响应不再等那次写库 + 推送。
  此时 `NEXUS_REDIS_URL` **只负责选驱动**：设了 → Redis Stream（durable、跨实例、能 XAUTOCLAIM 回收
  崩溃 worker 的 pending）；没设 → 进程内存队列，并**打一行警告**说"你点了 durable，拿到的是随进程
  消失的内存"——静默地在内存里跑副作用是一种持久性谎言，所以必须出声。
- 幂等锚点由**生产方**铸造、`notifications.dedupe_key` 的 UNIQUE 索引兜底：worker 在 `emit` 之后、
  `XACK` 之前崩溃会被重投，重投复用同一个 `exportId`，`ON CONFLICT DO NOTHING` 把第二次写合并掉。
  真库实测 `created` → `duplicate` → 收件箱一行（`job-lane-idempotency.integration.test.ts`）。
- 这一格不是 broker、不发客户端、不保证顺序、没有死信库（到 `maxAttempts` 就记日志丢弃）。边界与
  授权见 `docs/decisions/0066-a-durable-side-effect-lane-not-a-broker.md`；ADR 0064 加了 amendment
  指向它，免得"现有四种机制"被读成账本到此为止。

### ⚠️ 这台 `nexus-redis` 实测没有容量上限，所以上界写在应用里（2026-11-03 实测）

```
docker exec nexus-redis redis-cli config get maxmemory maxmemory-policy
→ maxmemory 0 / maxmemory-policy noeviction
docker exec nexus-redis redis-cli info stats → evicted_keys 0、expired_keys 247
docker inspect nexus-redis --format '{{.HostConfig.Memory}}' → 0（容器也没设内存上限）
```

这三行合起来是本节最要紧的一条运维事实：**Redis 侧一个字节都没被限住**。所以限流闸的键空间
只能由闸自己钉住（`maxBucketKeys` 默认 50 000，`docs/adr/0081-…`），指望那台机器兜底是不成立的——
`noeviction` 之下写不进去的是**所有共用它的子系统**（总线发布、审计游标、并行会话的 e2e 窗口），
而涨的是限流的键。反过来若哪天给它设了 `maxmemory` + `allkeys-lru`，被逐出的就是限流窗口本身，
**方向是更松**，且读数在 Redis 的 `evicted_keys` 里、不在应用日志里——换策略时要连带把这句话重读一遍。

- 部署口径（ADR-0077 仍欠 5 那一格，现在写在这里）：**不设 `NEXUS_REDIS_URL`** 的那台进程
  （dev / vitest / e2e / 小规模生产都是）最多留 50 000 只桶，顶满后从最久没被碰的一头淘汰，
  被淘汰的那个身份下一次命中重新变空（`nexus_rate_limit_buckets_pruned_total{reason="cap"}` 在涨）；
  **设了**的那台把窗口挪进 Redis，键数由这条驱动自己钉住（`{reason="over-cap"}` 在涨说的是名额用完，
  不是 Redis 坏了）。两种形状都不等于"没有上界"，也都不等于"做了容量规划"。
- **设了 `NEXUS_REDIS_URL` 的那台，启动后第一笔判定可能是本机窗口给的**（§SEC 第三十五片实测到的，
  ADR-0082 仍欠 1 走的是这里这条"写进部署口径"，不是"第一笔去等 `ready`"——后者要动每请求排队预算）：
  连接是异步建的，而 `hit` 从来不等它（`rateLimitRedis.ts` 里 `ready` 那一段明写这是有界的退化，
  不是免检），所以刚起来那几笔走进程内窗口，最多多放 `limit` 次。读数在哪：`/admin/rate-limit` 的
  `fallbackByReason` 里 `command-failed` 那一格（启动期那笔的形状是 `Stream isn't writeable and
  enableOfflineQueue options is false` 或一次 `Command timed out`），以及"线路"那格在刚起来时可能是
  `pending`。**这不是 bug 的口径，是部署要知道的事**：一台冷启动实例在头几笔上等同"不设变量的那台"。

- **限流闸诊断页的 e2e 有两种形状，一轮只测一种**（§SEC 第三十五片，2026-11-05）：
  `e2e/ratelimit-admin.spec.ts` 里 `driver` 由 **dev server 的环境**决定，不由 spec 决定——所以
  "两种驱动各跑一轮"才是完整覆盖，任何一轮单独绿都不算测了两台。两轮的确切跑法：
  ```
  # 第一轮：Redis 驱动（页面应读 driver=redis / wire=up / 键前缀 nexus:ratelimit:v1:）
  cd apps/web && NEXUS_REDIS_URL=redis://127.0.0.1:56379 npx next dev -p 3101
  NEXUS_WEB_URL=http://localhost:3101 npx playwright test e2e/ratelimit-admin.spec.ts

  # 第二轮：进程内驱动（三格"不适用"要长成 —（…）那句话，而不是 0）
  cd apps/web && npx next dev -p 3101        # 同一个 shell 里先 unset，别带着上一轮的变量
  NEXUS_WEB_URL=http://localhost:3101 npx playwright test e2e/ratelimit-admin.spec.ts
  ```
  两张截图按驱动分别落盘（`60-admin-rate-limit-redis.png` / `-in-process.png`），后跑的不会盖掉前一轮的凭证。
  两条本机才有的坑：
  ① **3100 今天被外部项目的进程占着**，本仓库的 dev server 要显式换端口（`-p 3101`）并同步给
  `NEXUS_WEB_URL`；Next 16.3.5 端口被占**不会**自动 +1，直接 `EADDRINUSE` 退出。
  ② `playwright.config.ts` 的 `webServer` 是 `reuseExistingServer: true`，但它把 **5xx 当成"还没起来"**：
  如果 dev server 活着而 Postgres 容器停了（页面 500），Playwright 会另起一个 `next dev` 并撞上
  "Another next dev server is already running" 而整轮失败。先 `docker ps` 看 `nexus-postgres` / `nexus-redis`
  再怀疑测试本身。

### ⚠️ 两个库：集成测试打 `nexus_regress`，**e2e 的 dev server 打 `nexus`**（2026-10-22 实测）

本机 Postgres 容器**同时**转发 `55100` 与 `55433`（`infra/docker-compose.yml` 双映射，同一实例）：`55100` 是既有集成测试脚本使用的别名，`55433` 是代码里的默认值。两个端口指向同一个库实例，别只改其中一个。
同一个实例上有多个库，而它们**各干各的**：

| 谁 | 连哪个库 | 用途 |
| --- | --- | --- |
| 集成测试（`apps/web/test/**.integration.test.ts`） | `postgres://nexus:nexus_dev_only@localhost:55100/nexus_regress` | 打真库、可随时清 |
| e2e（Playwright 起的 dev server） | `postgres://nexus:nexus_dev_only@localhost:55433/nexus`（代码默认；显式设成 55100 也行） | 浏览器那一寸落数据的地方 |
| nexus-api 冒烟（2026-11-10，`npm run verify:topology`） | `jdbc:postgresql://127.0.0.1:55433/nexus_api_smoke` | nexus-api 自带 ddl-auto:update 的一次性演示库；CI 每次跑前显式 `CREATE DATABASE nexus_api_smoke` |

> 2026-11-10 部署冒烟把 **nexus-api 也纳入了拓扑**：它注册进同一个注册中心（2026-11-10 时为 8761；同日迁往 8771 后为 8771，`NEXUS_API_REGISTER=true`），
> 网关 `/api/** → lb://nexus-api` 真的走 service discovery 打进去；它**连的是自己的一次性库**
> `nexus_api_smoke`，不是 e2e 的 `nexus` 库——两个库的写入者都不许互相污染。

⇒ ⇒ **所以：加一条新迁移，两个库都要打**（`npm run db:migrate` 跑两遍，第二个库改一下 `NEXUS_DATABASE_URL`）。
只打一个的后果很具体（今天踩过）：集成测试全绿（它打的那张表存在），
而 e2e 里那一格 500，报的是 `Failed query: insert into "game_completions"`——
**看上去像代码错了，其实是那个库里没有这张表**。

> 还有一层：`reuseExistingServer: true` ⇒ Playwright 会**复用已经在跑的 dev server**，
> 那个进程连的是**它启动时**的库 ⇒ 你在命令行里改 `NEXUS_DATABASE_URL` 对它无效。
> 排查"e2e 里的数与库里对不上"时，先问一句"这个 dev server 启动时连的是哪个库"。

## 凭据现状

环境中存在 `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`，它们属于 IDE Agent 运行时的会话凭据，
**不得**挪用为本平台 provider key。真实 provider 由用户通过 `apps/ai-service/.env`（不入库）自行提供；
未配置时系统运行在明确标注的 **DEMO MODE**（§159-160）。

## AI Service（FastAPI）本地运行

```
npm run dev:ai            # infra/dev-ai.sh：建 venv → 装依赖 → uvicorn 127.0.0.1:3200
curl http://127.0.0.1:3200/healthz
npm run test:ai-service   # pytest（26 项）
npm run contract:export   # 改了 packages/schemas 后必须重跑，导出 contracts/*.json
```

- 依赖装在 `apps/ai-service/.venv`（gitignore 已排除），版本钉在 `requirements.txt`。
- 契约来自仓库根 `contracts/`：Python 侧运行期用 `jsonschema` 校验，
  `packages/schemas/test/contract.test.ts` 保证导出文件与 zod 定义不漂移。
- Windows 控制台跑 pytest 建议 `PYTHONUTF8=1`，否则中文断言输出会乱码（源码本身按 UTF-8 读，无影响）。
  `npm run test:ai-service` 里的 venv 可执行文件路径写成反斜杠：npm 在 Windows 上用 cmd.exe 执行脚本，
  而 cmd 会把 `apps/ai-service/...python.exe` 当成命令 `apps` 加一堆参数（报"'apps' 不是内部或外部命令"）。
  这条曾经让 26 项契约测试**根本没人跑得动**，只能靠手敲 venv 路径——文档写着"能跑"而实际跑不了，比报错更糟。
- web 通过 `NEXUS_AI_SERVICE_URL` 访问 AI Service。**2026-11-06 核对：本机现在没有这个文件**
  （`ls apps/web/.env.local` ⇒ No such file；它被 `.gitignore:18` 的 `.env.local` 挡着，所以不在版本库里，
  原来这一行写的"本地写在 `apps/web/.env.local`"是过期话）。同一时刻 `netstat` 里 **8000 端口没有 LISTENING**，
  即 ai-service 也没起。两者一致 ⇒ 界面上"未配置"那一档是**当前真实形状**，产品各处常驻 DEMO MODE（§160）。
  要接真 provider 时才需要新建这个文件；不设它也能跑全部现有门，只是走的是 DEMO 合成器那条路。
- 内存约束：`next dev` + `uvicorn` + Postgres 已接近 2.5GB 空闲上限，Playwright 跑 e2e 时不要另开浏览器。
- **注册限流给 e2e 的节奏设了上限**（2026-10-28 实测）：`POST /api/auth/register` 按 IP 滑动窗口
  限 **10 次/小时**（`apps/web/src/app/api/auth/register/route.ts`），而 e2e 里 10 个文件各自注册一个新账号。
  连着跑两轮浏览器用例，第二轮就会拿到 429，界面上只留一句"认证失败"、`data-auth-identity` 停在 `guest`——
  看上去像用例坏了，其实是名额用光。**不要为了跑测试放宽这道闸**（它是 §SECURITY 的防批量建号）；
  要么等窗口腾名额（每 6 分钟出一个），要么一轮里只挑相关的那几条跑。
- **建项目也有限流，而且比注册那一道更早撞**（同日实测）：`POST /api/projects` 按 IP 限
  **20 次/小时**（`apps/web/src/app/api/projects/route.ts` 的 `ipWriteGate('projects/create', …)`）。
  一条 studio 用例动辄建一个项目，`e2e/studio.spec.ts` 单文件就有 **58 处**建项目调用（口径同下：
  `createProject(page,` 57 + `createProjectNamed(page,` 1；把第一实参不是 `page` 的那处也算上——
  `e2e/studio.spec.ts:2854` 的 `createProject(visitor, …)`——就是 **59 处**，57 条用例里有一条建两次），
  所以**跑这一支的中途就会把名额用光**——2026-10-28 实测：storyboard（8 条）+ team + account-deletion 之后，
  studio 那批只剩 4 条能过。界面上只写一句"建项目太频繁了，稍后再试"。
  `createProjectNamed` 现在把这次 POST 的答复接住了：非 2xx 当场带话收场，不再等满 60 秒导航超时，
  并且把服务端算好的 `retryAfterMs` 一起报出来（2026-10-28 实测："还要等 20 分钟"）——照这个数等，别猜。
  同样**不要为测试放宽它**；挑着跑，或等窗口（每 3 分钟出一个名额）。
- **跑整份 studio 用 `npm run e2e:paced`，不是 `npx playwright test e2e/studio.spec.ts`**（§SEC 第四十片，2026-11-06）。
  上面的算术写清了为什么：57 条用例、58 处建项目，20 次/小时 ⇒ **一次跑到底必然中途撞闸**，
  而撞了闸的那一次读回来是 `18 passed / 37 failed`，37 条同一成因是 429，**不是回归**。
  这个跑法把"一次发起多少条"与"等多久"分开管：每片只发几条，片间睡的是**服务端自己算的那个数**
  （报错里那句"还要等 X 分钟"），不是我估的分钟数。
  两件顺手记下来的事实：
  ① **Playwright 的 `--shard` 按文件分配，单文件拆不开**——`--shard=1/5` 对 `e2e/studio.spec.ts` 是
  第一片 57 条、2–5 片各 0 条（`--list` 逐字读回），所以"分五片慢慢跑"这种想法在它上面会得到
  四行空绿；脚本改成自己按**行号 filter** 点名（`e2e/studio.spec.ts:85 …:100`，多个 filter 是并集）。
  ② `expect.timeout` 在这台机器上是 **20 秒**（`playwright.config.ts` 里有整段理由）：默认 5 秒会在这个
  负载下产生假红（冷编译 + Postgres 在 Docker bind mount 上），而假红的代价是让人去查一个不存在的故障。
  **性能不靠这个旋钮说话**，那是 `npm run perf:browser` 与 `scripts/*-cost.mts` 的账。
  取舍、臂表与逐字读数见 `docs/adr/0088-paced-e2e-line-filter-sharding.md`。
  **数字不再手抄（2026-11-06，§SEC 第四十一片）**：每条 IP 窗口闸的 `limit/windowMs` 收进
  `IP_RATE_RULES`（`apps/web/src/server/security/rateLimit.ts`，唯一真值）；`/api/admin/rate-limit` 端出
  `rules`，`/admin/rate-limit` 表盘直接列这张装法表。
- **其余 e2e 文件要不要 paced：核对了 `e2e/*.spec.ts` 全部 44 个（2026-11-06，§SEC 第四十片顺手的欠账）**。
  口径：`rg -c 'createProject\(page,|createProjectNamed\(page,' e2e --glob "*.spec.ts"`
  （辅助函数的**定义**写的是 `page:`，不会计入）。结果 **21 个文件共 97 处**建项目
  （`studio` 58 处 ⇒ 必须 paced；其余同属一只 IP 桶，连跑也会互相吃名额，单次全目录跑同样要 5 个窗口分批）：
  `a11y-internal 1 · a11y 2 · account-deletion 3 · agent 4 · analytics 2 · api-tokens 1 · auth 1 ·
  character-chat 1 · character-fields 1 · character-scene 1 · components-panel 1 · game-completion 2 ·
  image-studio 3 · import 4 · interactive-work 2 · keyboard-a11y 1 · search-relevance 4 · storyboard 2 ·
  studio 58 · team 1 · world-talk 2`。
  其中 `agent/api-tokens/auth/character-*`、`search-relevance` 等很多用例其实只走一次，
  但**一次也占一个桶位**，所以口径是"建了几次就是几次"，不看用例长短。
  **这条口径自己有个洞（2026-11-07 补记查实）**：它只认第一实参写 `page` 的调用，
  而 `e2e/studio.spec.ts:2854` 写的是 `createProject(visitor, …)`（访客那条 ctx 自己建的桶），
  换成别的变量名的调用今天一律数不到。把这条洞补上重新数（`grep -rnoE 'createProject(Named)?\([A-Za-z_$][A-Za-z0-9_$]*,'`）：
  **21 个文件共 98 处**、`studio` 59 处 ⇒ 上面那句"97 / 58"是这条口径下的下限，不是实况。
  **另外 23 个文件零建项目——不吃这道闸，可在任意窗口跑**：
  `a11y-light · a11y-opened · admin-tables · analytics-narrow · game-keyboard · guest-reclaim ·
  health-worker · keyboard-surfaces · mobile-layout · narrow-surfaces · observability · popover-mobile ·
  profile-tasks · publish-review · ratelimit-admin · realtime-admin · responsive-authoring ·
  search-suggest · search-suggest-pause · smoke · studio-inspector-fold · theme-toggle · viewer-breakpoint`。
  它们多数走的是公共页 / 游客或登录后的只读读数（`reusableMemberWithProject` 建一次后复用，
  见 `e2e/support/auth-session.ts`），所以一栉无关活动也不吃名额。
  注：`/api/projects/import` 不经过 `ipWriteGate('projects/create')`——那道闸只挂在
  `POST /api/projects` 上；导入端点走 CSRF + 登录 + 413/415 这几道门，包里字节落地时还过资产摄入门
  （`uploadImageAsset` / `uploadVideoAsset` → `refusalForStorage`，storage 配额），
  所以 import.spec 里对它的调用**不占** 20 次/小时的建项目桶。
- **这两道按 IP 的闸在本机为什么是"一台机器一个桶"**（2026-10-30 第二十六片查实）：闸按谁的 IP 限，
  读的是 `x-forwarded-for` 的**可信链右端**；而 Next 只在**这一行头缺席时**才拿 socket 地址填它
  （`node_modules/next/dist/server/base-server.js:612` 是 `??=`）。本机没有反代，浏览器不写这一行头，
  所以每个 e2e 请求填进去的都是同一个 `::1`——**同一台机器上的全部浏览器用例共用一份名额**，
  两个会话并行跑 e2e 时尤其明显（不是互相抢 cookie，是同一个 IP 桶）。
  前置了反代的部署要把 `NEXUS_TRUSTED_PROXY_COUNT` 按真实跳数写进 env（默认 1 = 一级会追加的反代；
  CDN → LB → 本机就是 2）。取左端还是右端不是风格问题：旧读法取最左端，等于任何客户端加一行
  `x-forwarded-for: 随便写` 就换一个新桶，这两道闸当场空转——判决见
  `docs/adr/0070-forwarded-ip-take-rightmost-trusted-hop.md`，证据在 `apps/web/test/client-ip.test.ts`
  与 `apps/web/test/guest-write-gate.integration.test.ts` 的后两条。
- **前置只写 RFC 7239 的 `Forwarded:` 时，闸是按"前置自己"限的**（同日第二十八片活体查实）：
  读头的那段代码原来只认 `x-forwarded-for` 与 `x-real-ip` 两行，`Forwarded: for=...` 一行都不读——
  处理器直接调用那种形状下这是免限流（臂 B4 的读数是五个 `'201'`）。但**真 HTTP 路上走不到那一支**：
  Next 会先把 socket 对端填进缺席的 `x-forwarded-for`（`base-server.js:612` 是 `??=`），而 XFF 优先。
  实测两站（`.scratch/s28-forwarded-live-probe2.mts`）：`198.51.100.92` 写进 `Forwarded` → **429**
  （桶是已经被灌满的 `::1`）；同一个地址串改写进 `x-forwarded-for` → **404**（全新一只桶）。
  **部署要求因此多一行：前置必须追加写 `x-forwarded-for`**（nginx 的
  `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`）——只给 `Forwarded` 的那台前置会把自己
  变成一整群用户共用的一只桶。对本机浏览器用例的影响是零（本机没有前置，Next 填的仍是
  `x-forwarded-for: ::1`，"同一台机器一个桶"那条口径照旧）。
  判决与限度见 `docs/adr/0071-forwarded-rfc7239-header-read-and-precedence.md`。
- **"扫很多张界面"的用例改用夹具账号，别再消耗这两道闸**（同日第七片落地）：
  `e2e/support/auth-session.ts` 的 `reusableMemberWithProject(page, email, password, 首建项目名)`
  先登固定邮箱（登录那道是按**邮箱** 10 次/15 分钟，`login/route.ts`，不是按 IP），登不上才注册；
  名下已有项目就直接用（读 `GET /api/projects`，按会话、不限流），一个也不建。
  夹具账号 `kbd-walk+fixture@nexus.test`（口令同 e2e 惯例 `e2e-secret-123`）名下那个项目就是
  `e2e/keyboard-surfaces.spec.ts` 的载体。**这不是绕开闸**：闸照旧生效，只是不再为"每次都想要新的空项目"
  这种并不需要的诉求重复花名额。用之前想清楚一件事——夹具会被上一轮留下的状态污染
  （项目里会有已发布/已改过的痕迹），所以只有**与内容无关**的读数（tab 序、axe、焦点）才适合走这条路。
- **"身份还是 guest"有第二种成因，别一上来就怪限流**（同日实测）：这些界面是 SSR 出来的，HTML 一 attach
  就能 `fill`／`click`，可那一刻 React 的委托监听还没挂上，**点击会静默丢掉**——POST 压根没发出去。
  分辨只看答复码：`0` = 点击被吞（水合没到），`429` = 限流。屏障不能用 `waitForSelector('[data-auth-tab=…]')`
  （它等的是 HTML 不是水合），要用"点下去之后 DOM 真的按状态变了"——已封装在 `e2e/support/auth-session.ts`
  的 `registerMember`／`createProjectNamed` 里，新写的浏览器用例请直接用。
- **管理员界面的浏览器用例：先跑用例，再 `npm run e2e:admin-fixture`**（同日第十一片落地）：
  注册接口没有"第一个账号当管理员"这条路，所以 `/admin/*` 那几张页在 e2e 里读不到，除非把某个
  夹具账号提成 admin。那个脚本**只 `UPDATE role`，绝不插用户**——口令因此仍来自真注册路径，
  测试里没有第二个"约定的哈希"。顺序是刻意的：先跑 `e2e/observability.spec.ts`（它注册
  `obs-admin+fixture@nexus.test`），脚本才认得这个人；反过来跑它退出 1 并告诉你先跑哪条。
  URL 里没有 `nexus_dev_only` 时它直接拒绝执行，别拿它连生产库。

## Git Hooks（重要）

`core.hookspath` 全局指向 `C:/Users/18414/.codex/git-hooks`，仓库本地 hooks 不生效，pre-commit 会：

1. 拦截文件名匹配 `.env`、`.env.*`、`*.key`、`*secret*.json` 等的提交
   → 模板文件必须命名为 **`env.example`**（不带前导点），不能用 `.env.example`
2. 拦截 diff 中疑似密钥内容（provider token 前缀、`OPENAI` 变量赋值形态、私钥块）
3. 对 `.py` 做语法检查；若根 `package.json` 含 `lint` 脚本且 `node_modules` 存在则**执行 lint 并阻断**
   → `npm run lint` 必须始终可通过且够快
4. 禁止使用 `--no-verify` 绕过；hook 失败时修复根因

## Docker 引擎掉了一半时的假红形状（2026-10-02 实录）

现象（一次全量 `npm test`）：**49 个文件红，且 49 个全是 `*.integration.test.ts`**，唯一的报错是
`Hook timed out in 30000ms`（95 次），一条断言失败都没有；而非打库的 64 个文件全绿。
`Duration 2940s`（平时约三分之一）。这形状本身就是判据：**全红组恰好等于"要打库的那一组"时，
先怀疑引擎，不要怀疑代码。**

带外探测（三个信号，按顺序看）：

1. `netstat -ano | grep 55433` → 端口在 LISTENING。**端口在不代表库活着**：那是 `com.docker.backend.exe`
   留下的转发，后端已经不再转发到容器。
2. `docker version --format '{{.Server.Version}}'` → `Error response from daemon: Docker Desktop is unable to start`，
   退出码 1。这一条才是权威结论。
3. `.scratch/dbprobe.mjs`（直接用 `postgres` 连 `NEXUS_DATABASE_URL` 的默认值）→
   `select 1` 也 `write CONNECT_TIMEOUT localhost:55433`，10 秒超时。TCP 连上、写不进去，
   与首页那次 e2e 失败（`write CONNECT_TIMEOUT localhost:55433` + `Timed out waiting 120000ms from config.webServer`）
   是同一件事的两个面。

引擎掉的时候 `Start-Process 'Docker Desktop.exe'` 未必能救回来（这次等了 4 分钟仍是 "unable to start"）。
**不要**用 `wsl --shutdown` / 删 distro 去硬复位：同一台机上有别的项目的容器与卷（见上"已有容器"），
那是别人在跑的东西，复位属于要人来做决定的动作。

**2026-10-16 另一条同族坑：引擎回来了，端口却不给绑了。** 当天 `docker version` 29.8.2 正常、
容器 `Up`，但 `nexus-postgres` 起来以后 `docker port` 是**空的**——55433 根本没转发出来。
`npm run infra:up` 报 "Container nexus-postgres Running"（它没重建容器，所以不觉得有问题），
`--force-recreate` 才把真原因吐出来：`ports are not available: exposing port TCP 0.0.0.0:55433 -> …
bind: An attempt was made to access a socket in a way forbidden by its access permissions`。
根因量出来了：`netsh int ipv4 show excludedportrange protocol=tcp` 当天列出 55245–55344、55345–55444、
55445–55544、55545–55644、55645–55744 —— **Windows 这次开机把 55433 整段保留了**（Hyper-V/WinNAT 的随机保留段，
每次开机不同）。两条当时走过的弯路记下来免得再走：
① 用 compose `override` 换端口（`ports: !reset ['55100:5432']`，compose v5.6.0 支持 `!reset`）
   → 结果是**一个绑定都没有**（`{"5432/tcp": null}`），比原样更糟；
② 换端口要绕开 compose 直接 `docker run -d --name nexus-postgres -p 127.0.0.1:55100:5432 …`
   **复用同一个具名卷 `nexus-pgdata`**，数据一字未动，`TCP 55100 OPEN`。
   `infra/docker-compose.yml` 里那行 55433 **故意不改**：那是本机这次开机的临时状态，
   不是仓库的约定（写进受版本控制的配置等于把一次 WinNAT 抽签固化成所有人的默认值）。
需要打库的那一套（集成测试、dev server）当天一律带 `NEXUS_DATABASE_URL=postgres://nexus:nexus_dev_only@localhost:55100/nexus`
——`server/db/client.ts` 读的就是这个变量，默认值仍是 55433。判据一句话：**容器 Up 不等于端口在，
`docker port` 与一次真 `select 1` 才算数**。

顺带一条同源坑：dev server 被中途杀掉会把生成物写坏 —— `apps/web/.next/dev/types/routes.d.ts`
留下半截 JSDoc 拼进代码，`npm run lint` 报 `TS1109` × 5 + `TS1160 Unterminated template literal`，
全部指向这个 gitignore 掉的缓存文件（`git check-ignore -v` 能确认）。把 `apps/web/.next/dev/types`
移走（不是删）lint 就跳过它，下一次 dev/build 会重新生成。看到"源码一行没改，lint 突然红在
`.next/` 里"，先按这一条查。

## Playwright e2e 与沙箱的批量删除守卫：会挡住的是"清 `test-results/`"那一步，不是 e2e 本身

**现象**（2026-10 中旬实录）：`npx playwright test ...` 一条用例都还没跑就退出，日志里是

```text
Error: [safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED] {"count":105,"threshold":50,"scope":"turn","targets":["...\test-results"],"targetCount":1}
```

**根因**：Playwright 每次启动会先清 `test-results/`，而那一清是一次**递归**删除，
条目数超过沙箱 `node-safe-delete` 垫片的阈值（50）。守卫按**本轮对话**累计计数，
所以同一轮里重试也不会变好。

**手动腾空也没用**：把 `test-results/` 清空之后再跑，守卫照样报同一个数
（它数的是 Playwright 想删的那一整棵，不是当前实际有多少）。

**当时写下的结论是"这台机器上 e2e 这一路暂时不可用"——那句现在与事实相反，改掉**。
2026-11-06 本机逐字读数：

```text
$ NEXUS_WEB_URL=http://localhost:3100 npx playwright test e2e/health-worker.spec.ts --workers=1
Running 1 test using 1 worker
  ok 1 [chrome] › e2e\health-worker.spec.ts:46:5 › §147 体检在 worker 里算… (8.0s)
  1 passed (12.6s)

$ … node node_modules/tsx/dist/cli.mjs scripts/e2e-paced.mts --shards 5 --only 1 --out .scratch/pw-paced-studio
Running 12 tests using 1 worker
  12 passed (3.9m)
```

守卫描述的机制没变（它确实会在"清一棵超阈值的 `test-results/`"时下手），**变的是绕法**：

1. **`--output` 指到别处**（本机现行做法）。Playwright 清的是它自己那次的 output 目录，
   指到 `.scratch/…` 下就不会去碰工作区根上那棵。`scripts/e2e-paced.mts` 每一片都带
   `--output <out>/artifacts-i`，连 `--list` 那一步也带（见 `docs/adr/0088`）。
2. **`test-results/` 保持空**。上面那次单条跑没带 `--output` 也过了，因为工作区根上那棵是空的
   （`ls test-results | wc -l` ⇒ `0`）——条目数没超阈值，守卫不动手。
   这一条**不要依赖**：跑过带 trace/screenshot 的失败用例以后那棵就胖了，所以 1 才是常规做法。

**结论**：e2e 在本机可用，凭证照写。真 HTTP 的验证也仍可走 `scripts/` 下的探针
（`realtime-two-process.mts`、`two-instance-roundtrip.mts`、`import-413-probe.mts` 是先例），
但那是**分工**，不再是"e2e 跑不了"的替代品。

同一个守卫还挡过 `next build`（清理 `.next` 时条目数超阈值）——看到
`SAFE_DELETE_BULK_CONFIRM_REQUIRED` 就先想这条，不要先去改代码。

## 两件在这台机器上会让"运行证据"假死的事：`fs.cpSync` 与 `docker run`（2026-11-10 实测）

**一、工具链自带的 Node 22.22.2，`fs.cpSync` 会让进程静默死掉（退出码 127）。**

```text
$ node --version
v22.22.2
$ node -e "require('fs').cpSync('./probe-aaa','./probe-bbb',{recursive:true});console.log('OK')"
$ echo $?
127                      # 没有异常、没有堆栈、没有输出——进程直接没了
$ "/c/Program Files/nodejs/node.exe" --version
v24.15.0
$ "/c/Program Files/nodejs/node.exe" -e "require('fs').cpSync('./probe-aaa','./probe-bbb',{recursive:true});console.log('OK')"
OK                       # 系统 Node 24 正常
```

`PATH` 上第一个 `node` 是 `C:/Users/18414/.workbuddy/binaries/node/versions/22.22.2-6/node.exe`，
它的 `cpSync` 在这台机器上不可用（不是路径长度、不是权限、不是沙箱：同一个目录在工作区内复制、
目录里只有 15 个文件、最长路径 90 字符，仍然 127）。**任何用 `cpSync` 复制整棵目录的证明脚本
（`docs/evidence/java/spring-cloud-proof.mjs` §1 就是）都必须用系统 Node 跑**：

```bash
"/c/Program Files/nodejs/node.exe" docs/evidence/java/spring-cloud-proof.mjs
```

否则现象是"脚本只打印了第一行就退出 0/127"，而任务管理器里 **node 和它的子进程还活着**——
上一轮的证明进程因此挂了一整晚（2026-11-10）。

**二、Docker 引擎只剩 `exec` 能用：`run` / `rm` 会挂死，`exec` 正常。**

| 命令 | 2026-11-10 读数 |
|---|---|
| `docker ps` / `docker exec nexus-postgres psql …` | 正常，秒回 |
| `docker run -d --name … pgvector/pgvector:pg16` | 挂住不返回（`timeout 25` 124） |
| `docker rm -f <name>` | 挂住不返回（`timeout 25` 124） |
| `docker compose --profile java up -d` | 挂在 `Container nexus-java-pg Starting`（更早的读数） |

所以本机跑 `verify:spring-cloud` **必须**用"已有的库"这条路，而不是让证明自己拉一个 scratch 源：

```bash
export NEXUS_PROOF_SOURCE=nexus-postgres NEXUS_PROOF_DB_PORT=55433
"/c/Program Files/nodejs/node.exe" docs/evidence/java/spring-cloud-proof.mjs
```

注意用 `export` 而不是行内 `VAR=… cmd`——本机这套 shell 包装会把行内赋值丢掉，证明会退回
"自己起 scratch 容器"那条路，然后卡死在 `docker run` 上（2026-11-10 两次实跑都是这个形状）。
两个遗留的 `Created` 尸体容器（`nexus-java-pg`、`nexus-proof-source-…`）就是这类中断的痕迹，
引擎允许时再 `docker rm -f`。

**`exec` 也会挂**（2026-11-11 实测）：一次 `docker exec nexus-postgres pg_dump …` 通过 `spawnSync`
调用时永久阻塞——证明进程活着、日志停在 §2、`ps` 里**看不到任何子进程**，五分钟后只能手工杀掉。
`spawnSync` 没有默认超时，所以"挂住"和"还在算"在同一份日志里长得一模一样。现在证明里每个
`spawnSync('docker', …)` 都带显式 `timeout`，`run()` 也在 300 s 处杀子进程并回报是哪一条命令；
`docker exec` 本身仍然是这台机器上最可靠的那条路，但"最可靠"不等于"一定回话"。
