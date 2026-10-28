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
| Docker Desktop | 29.1.3（daemon 运行中） | OK |
| Chrome | 已安装 | Playwright 复用系统 Chrome（`channel: 'chrome'`） |
| psql / redis-cli | — | 本机无，仅通过容器访问 |

> **Playwright 约束**：本机网络无法下载 Playwright 自带的 Chromium/headless-shell（`npx playwright install` 失败）。
> 截图与 e2e 一律用系统 Chrome：`chromium.launch({ channel: 'chrome' })`。已实测可渲染并截图成功。

## 已有容器（不属于本项目，禁止复用/删除）

`careeros-postgres`(5432), `careeros-redis`, `careeros-minio`(19000), `nexus-seed-verify`(55432)。

因此 NEXUS 使用**独立端口段**避免冲突：Postgres `55433`、Redis `56379`、MinIO `59000/59001`、AI Service `3200`、Web `3100`。
容器统一前缀 `nexus-`，compose project name 为 `nexus`。

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

### `NEXUS_REDIS_URL`（§162 队列与 §163 实时扇出共用这一串）

- **不设**：实时总线用进程内驱动（本机开发、vitest、e2e 都只有一个 web 进程，这样少一个依赖也少一套失败模式）；
- **设为非空**：换成 Redis pub/sub 扇出驱动，装载那一刻打一行 `[realtime] 驱动=Redis 扇出（线路 nexus:realtime:v1）`。
  空格串算"没设"（`bus.ts` 读的是 `.trim()` 后的值）。连接失败**不会**退回进程内，只让日志、
  `wireErrorCount` 与 `ready=false` 出声——详见 `docs/adr/0028-realtime-redis-fanout.md`。
- 本机跑法：`NEXUS_REDIS_URL=redis://127.0.0.1:56379`；跨实例那层用 `npm run realtime:two-process` 验，
  它只要 Redis、不要数据库，起不来时会先打一句"线路不通"而不是等 25 秒超时。

### ⚠️ 两个库：集成测试打 `nexus_regress`，**e2e 的 dev server 打 `nexus`**（2026-10-22 实测）

本机 Postgres 实际监听 **55100**（`55433` 那条是旧记录，现在没有进程在听）。
同一个实例上有多个库，而它们**各干各的**：

| 谁 | 连哪个库 | 用途 |
| --- | --- | --- |
| 集成测试（`apps/web/test/**.integration.test.ts`） | `postgres://nexus:nexus_dev_only@localhost:55100/nexus_regress` | 打真库、可随时清 |
| e2e（Playwright 起的 dev server） | `postgres://nexus:nexus_dev_only@localhost:55100/nexus` | 浏览器那一寸落数据的地方 |

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
- web 通过 `NEXUS_AI_SERVICE_URL`（本地写在 `apps/web/.env.local`）访问；未设置时首页显示"未配置"，
  设置但连不上显示"不可达"，绝不显示成可用。
- 内存约束：`next dev` + `uvicorn` + Postgres 已接近 2.5GB 空闲上限，Playwright 跑 e2e 时不要另开浏览器。
- **注册限流给 e2e 的节奏设了上限**（2026-10-28 实测）：`POST /api/auth/register` 按 IP 滑动窗口
  限 **10 次/小时**（`apps/web/src/app/api/auth/register/route.ts`），而 e2e 里 10 个文件各自注册一个新账号。
  连着跑两轮浏览器用例，第二轮就会拿到 429，界面上只留一句"认证失败"、`data-auth-identity` 停在 `guest`——
  看上去像用例坏了，其实是名额用光。**不要为了跑测试放宽这道闸**（它是 §SECURITY 的防批量建号）；
  要么等窗口腾名额（每 6 分钟出一个），要么一轮里只挑相关的那几条跑。
- **建项目也有限流，而且比注册那一道更早撞**（同日实测）：`POST /api/projects` 按 IP 限
  **20 次/小时**（`apps/web/src/app/api/projects/route.ts` 的 `ipWriteGate('projects/create', …)`）。
  一条 studio 用例动辄建一个项目，`e2e/studio.spec.ts` 单文件就有 57 处调用，所以**跑这一支的
  中途就会把名额用光**——2026-10-28 实测：storyboard（8 条）+ team + account-deletion 之后，
  studio 那批只剩 4 条能过。界面上只写一句"建项目太频繁了，稍后再试"。
  `createProjectNamed` 现在把这次 POST 的答复接住了：非 2xx 当场带话收场，不再等满 60 秒导航超时，
  并且把服务端算好的 `retryAfterMs` 一起报出来（2026-10-28 实测："还要等 20 分钟"）——照这个数等，别猜。
  同样**不要为测试放宽它**；挑着跑，或等窗口（每 3 分钟出一个名额）。
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

## Playwright e2e 在本机跑不起来：沙箱的批量删除守卫挡住它清 `test-results/`

**现象**：`npx playwright test ...` 一条用例都还没跑就退出，日志里是

```text
Error: [safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED] {"count":105,"threshold":50,"scope":"turn","targets":["...\test-results"],"targetCount":1}
```

**根因**：Playwright 每次启动会先清 `test-results/`，而那一清是一次**递归**删除，
条目数超过沙箱 `node-safe-delete` 垫片的阈值（50）。守卫按**本轮对话**累计计数，
所以同一轮里重试也不会变好。

**手动腾空也没用**：把 `test-results/` 清空之后再跑，守卫照样报同一个数
（它数的是 Playwright 想删的那一整棵，不是当前实际有多少）。

**结论**：这台机器上 e2e 这一路**暂时不可用**。需要真 HTTP 的验证改走脚本：

- 起 `npm run dev`（用工具的 `run_in_background`，`nohup ... &` 会随会话被杀）；
- 再跑 `scripts/` 下对应的探针（如 `npm run probe:413`），或 `curl` / 一段 `node:http`。

已有的先例：`realtime-two-process.mts`、`two-instance-roundtrip.mts`、`import-413-probe.mts`。
e2e 用例仍然要写、要维护（能跑 Playwright 的环境靠它守），只是**不能把"我跑过 e2e"写进本机的凭证**。

同一个守卫还挡过 `next build`（清理 `.next` 时条目数超阈值）——看到
`SAFE_DELETE_BULK_CONFIRM_REQUIRED` 就先想这条，不要先去改代码。
