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
| Chrome | 已安装 | Playwright 可复用 |
| psql / redis-cli | — | 本机无，仅通过容器访问 |

## 已有容器（不属于本项目，禁止复用/删除）

`careeros-postgres`(5432), `careeros-redis`, `careeros-minio`(19000), `nexus-seed-verify`(55432)。

因此 NEXUS 使用**独立端口段**避免冲突：Postgres `55433`、Redis `56379`、MinIO `59000/59001`、AI Service `8000`、Web `3000`。
容器统一前缀 `nexus-`，compose project name 为 `nexus`。

## 凭据现状

环境中存在 `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`，它们属于 IDE Agent 运行时的会话凭据，
**不得**挪用为本平台 provider key。真实 provider 由用户通过 `apps/ai-service/.env`（不入库）自行提供；
未配置时系统运行在明确标注的 **DEMO MODE**（§159-160）。

## Git Hooks（重要）

`core.hookspath` 全局指向 `C:/Users/18414/.codex/git-hooks`，仓库本地 hooks 不生效，pre-commit 会：

1. 拦截文件名匹配 `.env`、`.env.*`、`*.key`、`*secret*.json` 等的提交
   → 模板文件必须命名为 **`env.example`**（不带前导点），不能用 `.env.example`
2. 拦截 diff 中疑似密钥内容（provider token 前缀、`OPENAI` 变量赋值形态、私钥块）
3. 对 `.py` 做语法检查；若根 `package.json` 含 `lint` 脚本且 `node_modules` 存在则**执行 lint 并阻断**
   → `npm run lint` 必须始终可通过且够快
4. 禁止使用 `--no-verify` 绕过；hook 失败时修复根因
