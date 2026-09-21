# NEXUS AI UNIVERSE STUDIO

> Describe it. Design it. Generate it. Build it. Enter it.

AI-native 创作 + 娱乐 + 设计 + 游戏创建平台。把想法变成可以真正运行的数字世界。
完整需求见 `docs/specs/MASTER_DIRECTIVE.original.txt`（§编号在其它文档中被直接引用）。

## 我要先看哪份文档

| 文档 | 内容 |
| --- | --- |
| `docs/PRODUCT.md` | 产品愿景、六大支柱、产品循环、Wow 目标、不可妥协原则 |
| `docs/ARCHITECTURE.md` | 系统分层、目录、边界纪律、Design↔Code 双通道 |
| `docs/ROADMAP.md` | M0–M8 里程碑与当前优先级（**唯一的进度真相**） |
| `docs/STUDIO.md` | Studio 布局、Canvas、属性面板、AI 命令栏、版本/分支 |
| `docs/DESIGN_SYSTEM.md` | NEXUS 自身视觉系统 + 用户侧 Design System 能力 |
| `docs/AGENTS.md` | Agent Runtime、工具注册表、权限、审批门、评测 |
| `docs/RUNTIME.md` | 本地按需启动、预览沙箱、事件、发布、导出 |
| `docs/SECURITY.md` | 硬约束清单：沙箱、SSRF、注入、上传、prompt 注入、内容安全 |
| `docs/TESTING.md` | 测试分层 + M1 Golden Path 12 步验收 |
| `docs/ENVIRONMENT.md` | 本机勘察结论与端口/内存约束 |

## 当前状态

**M0 地基 → M1 Studio 竖向切片**。目标闭环：

```
Create Project → Prompt → AI Design → Canvas → Layers → Properties → Design System
→ AI Edit → Code → Live Preview → Screenshot → Publish
```

## 快速开始（脚手架就绪后可用）

```bash
npm install
npm run infra:up      # Postgres+pgvector (55433) / Redis (56379)
npm run dev           # Web Studio  → http://localhost:3100
npm run dev:ai        # AI Service   → http://localhost:8000
```

未配置真实 AI provider key 时，系统仍可完整使用设计与代码路径，但所有生成结果界面常驻
**DEMO MODE** 标识（§159-160）—— 这是有意为之，不伪装真实生成。
配置方式：`apps/ai-service/env.example` → 复制为本地 env 文件（不入库）填入 base_url 与 key。

## 六根支柱

Explore · Create · **Studio（核心）** · Runtime · Agents · Community

## 仓库结构

```
apps/web           Next.js 15 + React + TS + Tailwind：Studio / 站点 / BFF
apps/ai-service    FastAPI：Agent Runtime + Provider 抽象 + RAG + Playwright QA
packages/design-model   @nexus/design-model：设计对象模型 + Command 事务（纯 TS）
packages/schemas        跨端 zod 契约
infra              docker-compose（pgvector / redis / minio）
docs               上述文档 + adr/
```
