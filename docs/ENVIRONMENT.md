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

顺带一条同源坑：dev server 被中途杀掉会把生成物写坏 —— `apps/web/.next/dev/types/routes.d.ts`
留下半截 JSDoc 拼进代码，`npm run lint` 报 `TS1109` × 5 + `TS1160 Unterminated template literal`，
全部指向这个 gitignore 掉的缓存文件（`git check-ignore -v` 能确认）。把 `apps/web/.next/dev/types`
移走（不是删）lint 就跳过它，下一次 dev/build 会重新生成。看到"源码一行没改，lint 突然红在
`.next/` 里"，先按这一条查。
