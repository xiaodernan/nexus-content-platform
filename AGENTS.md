# NEXUS — Agent 工作守则（仓库根）

这是给在此仓库长期工作的 AI Agent 的操作手册。需求原文：`docs/specs/MASTER_DIRECTIVE.original.txt`。

## 开工顺序（每次都执行）

1. 读 `docs/ROADMAP.md` 找当前未完成项（`[ ]`/`[~]`），不要重新发明已完成的东西
2. 读相关模块文档（`STUDIO.md` / `ARCHITECTURE.md` / `AGENTS.md` / `SECURITY.md`）
3. `git log --oneline -15` 了解最近动作
4. 动手前先跑最小验证（`npm run lint`、相关单测），确认起点是绿的
5. 实现 → `Run` → `Test` → `Screenshot` → `Inspect` → `Fix` → `Retest` → `Commit`（§158）

## 自主性（§193-194）

- 无阻塞时**不等用户**：从 ROADMAP / TODO / BUGS 取最高优先级继续做
- 只在以下情况停下来问：需要 secret、需要付费 provider 授权、破坏性操作、法律/商业决策、明确要求人工审批的高危动作
- 其余一切（技术选型细节、重构、依赖、测试补齐）自己决定并推进，决策落到 `docs/adr/`

## 绝对禁止（§159）

- 禁止假 API / 假生成 / 假发布 / 假 AI / 假 payment / `TODO` 冒充可用
- 禁止"写了代码但没运行没看图就说完成"
- 禁止用 `--no-verify`、`SKIP_HOOKS=1` 绕过 git hooks；hook 失败要修根因
- 禁止把整个 repo 塞进模型上下文（§68）；用检索 + 摘要 + 索引
- 禁止挪用 IDE 运行时凭据（`ANTHROPIC_*` 环境变量）作为平台 provider key
- 禁止修改全局 git config

## 架构纪律（违反即返工）

1. **设计模型是唯一真值**（§16）。渲染、代码、预览都是投影
2. **所有编辑走 Command**（execute/undo/redo，§150）；一次 AI 操作 = 一个可撤销事务（§149）
3. **AI Service 不写业务库**，只返回计划与补丁；持久化在 web 层
4. **Provider 必须可替换**（§76-79），业务代码不得直接 import 具体 SDK
5. **生成代码不得在主机执行**（§81），预览走 `docs/SECURITY.md` 允许的路径
6. 跨端报文只能用 `packages/schemas` 的 zod 定义
7. 未配置真实 provider 时，UI 必须常驻 `DEMO MODE` 标识（§160）

## Git 约定

- 每个可验证的里程碑一次 commit；commit message 用 `type(scope): 做了什么 / 为什么`，中文正文可
- 本机 git 无全局身份，提交用：`git -c user.name="NEXUS Dev" -c user.email="dev@nexus.local" commit ...`
- 不 push（无远端）；除非用户要求
- 不删容器/卷/文件前先确认是自己的产物；本机有其它项目的 `careeros-*` / `nexus-seed-verify` 容器，**不要动**

## 环境事实（详见 `docs/ENVIRONMENT.md`）

Windows 11 / Node 24 / npm workspaces（无 pnpm）/ Python 3.11 / Java 25 + Maven / Docker Desktop 运行中 /
16GB 内存**空闲仅约 2.5GB** → 服务按需启动，别同时拉起全部栈。
端口：web 3000 · ai 8000 · postgres 55433 · redis 56379 · minio 59000/59001。

## 记录

- 决策与取舍 → `docs/adr/NNNN-title.md`（背景、选项、决定、后果）
- 用户项目历史用 Snapshot，开发历史用 Git，两者不要混（§108）
