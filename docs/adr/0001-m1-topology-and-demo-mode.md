# ADR-0001: M1 采用 Next.js + FastAPI 双端，Java 服务后置；AI provider 未配置时以 DEMO MODE Mock 交付

日期：2026-09-22
状态：已接受

## 背景

需求 §96-100 指定前端 Next.js/React/TS/Tailwind、后端 Java Spring Boot + PostgreSQL + Redis、AI 服务 Python FastAPI。
同时 §190 要求 `BUILD SMALL → VALIDATE → EXPAND`，§181 的第一里程碑是 Studio 竖向切片。

本机实际约束（`docs/ENVIRONMENT.md`）：16GB 内存，空闲仅约 2.5GB，Docker Desktop 常驻占用 ~2.1GB。
同时常驻 Next.js dev + Spring Boot + FastAPI + Postgres + Redis + MinIO + Playwright 不现实，
且第一切片的核心难点在**设计模型 + Canvas 交互 + Design↔Code 双向**，与后端语言无关。

用户决策：M1 用 Next.js + FastAPI 先行，Java 后置；provider key 待用户提供，期间用明确标注的 Mock。

## 决定

1. M1–M5：`apps/web`（Next.js App Router，含 route handlers 作为 BFF 与领域读写，Drizzle → Postgres）
   + `apps/ai-service`（FastAPI，Agent Runtime / Provider 抽象 / 截图评测）。
2. `apps/api`（Spring Boot）在 **M6 Community/Publish/权限/计费** 落地，成为这些领域的权威写入服务；
   web 届时改为通过它读写。为此现在保留的边界：
   - 领域读写只集中在 web 的 `src/server/domain/*`（一层薄 repository/service），便于整体替换为 HTTP 客户端
   - Schema 由 Drizzle 管理，但表名/字段命名保持 Java 侧 JPA 可直接映射（snake_case、无 ORM 特化技巧）
   - 认证签发在 web 层，会话校验抽象成 `SessionProvider` 接口，Java 侧可接管
3. AI 能力：`Provider` 五类抽象 + Model Router；无 key 时注册 Mock Provider，返回确定性结果，
   并且 `capability_status` 字段随响应返回 `demo|real|unavailable`，UI 顶部常驻标识（§159-160）。
   生成类能力（图像/视频）在无 provider 时**显示 unavailable**，不用假图充数。

## 后果

- 正面：切片能在数天内跑通真实闭环；迭代集中在两种语言；内存可控；符合 §190
- 代价：M6 需把领域读写从 web 迁到 Java，存在一次数据/接口迁移；需在 M2–M5 期间避免在 web 层堆积无结构业务代码
- 风险控制：`packages/schemas` 契约先定，Java 侧复用同一份 JSON 契约做校验；每个里程碑末做一次"边界自检"（domain 层是否泄漏）
