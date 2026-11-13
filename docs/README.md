# docs/README.md — 文档导览（入口索引）

> 本文件是 docs/ 的一张**可导航地图**，不是状态摘抄；状态在 `CURRENT-STATE.md`，路线在 `ROADMAP.md`，每个子目录自己的 `README` 才是权威

- **环境与本机** · `ENVIRONMENT.md`（硬约束、工具链、端口表、真实 LLM 接入记录、Cache 接通纪律）
- **状态** · `CURRENT-STATE.md`（当前快照，只描述**已交付**；顶部最新）
- **路线** · `ROADMAP.md`（目标/进度/已完成的大件；`[x]` 齐，`[~]` 谨慎半程，没有 `[ ]` 未开项）
- **架构** · `ARCHITECTURE.md`（整体分层 + 跨层契约；前后端协同的权威说明）
- **工作室（Studio）** · `STUDIO.md`（设计/代码代际模型 + 门面化词条）
- **安全** · `SECURITY.md`（鉴权、密钥、运行时隔离、不泄露约定；gateway-level live 证据在 `docs/evidence/`）
- **性能** · `PERFORMANCE.md`（§146/§147/§49 三件实测：热路径/prompt caching/pgvector + 历次基准）
- **测试** · `TESTING.md`（vitest/Playwright 关注点与门禁；所有图样请依实在证据）
- **长期计划** · `LONG_TERM_PLAN.md`（Studio/main 线早期水合的长期计划，已并轨后参考仅用于对照；当前事实以 `CURRENT-STATE` 和 `ROADMAP` 为准）
- **已知问题** · `KNOWN_ISSUES.md`（本机/环境疑难与缓解）
- **公开 API v1** · `api/public-api-v1.md`（Bearer nexus_pat_*；作用域；真接通的端点与真拒绝样本）
- **环境：3200 端口归属** · `environment/port-3200-ai-service-owner.md`（谁 hold 住 ai-service；停 / 查 / 不要误杀的 ping 指引）

## 子目录速查

| 目录 | 里面是 | 何时看 |
|---|---|---|
| `adr/` | 决策记录（0001…0261），决定与后果 | 为什么这样实现时 |
| `evidence/` | **判化证据**：运行脚本/截图/探针/drop-in 报告（真跑、真库、真日志） | 想复现或反驳某个结论时 |
| `api/` | 公开 API v1 参考（Bearer nexus_pat_*） | 外部 Agent/脚本接入时 |
| `environment/` | 机器/端口/进程归属等环境面（如 `port-3200-ai-service-owner.md`） | 启停或排查端口冲突时 |
| `specs/` | 早期规格/协议文档 | 考古 |
| `decisions/` | 早期决策页（__consolidate 之前） | 仅考古 |

## 词条（术语→位置）

- §AGENTS / §159 / §60 DEMO MODE：`AGENTS.md`（诚实门禁、诚实标注、永不冒充）
- `prompt_cache_key`（LLM 命中）纪律：§AILIVE-4 / ADR-0261 / `evidence/ailive-4-cache-2026-11-13.md`
- HNSW / pgvector 语料：`evidence/pgvector-wire-bench-2026-11-13.md` + `ROADMAP.md §49`
- forced-colors 硬约束：§A11Y-1 / ADR-0146（回退块在 `apps/web/src/app/globals.css` 尾端，静态门 `apps/web/test/forced-colors-style.test.ts`、e2e `e2e/forced-colors.spec.ts`）
- 门面矩阵 & 零裸 Tailwind：§FE-1…§FE-104 / `tools/ci/fe-gates.mjs` & `tools/ci/no-raw-tailwind.mjs` & `tools/ci/facade-census.mjs`
- Spring Cloud 微服务：`adr/0095-microservice-topology-registry-gateway.md` / `evidence/spring-cloud-audit/`
- 真 provider vs DEMO：`ENVIRONMENT.md §2026-11-12`（含 §AILIVE-4 prompt caching §2026-11-13）
- 整套接口真通（web→Python→DB→真 LLM）：`evidence/ai-provider-live/evidence.md`

## 分支与"集大成"

- 仅 `main` 一个 worktree；`.gitignore` 之外的长期草稿都读本仓；
- `origin/master ⊂ origin/main`；未 push；`main` 领先 `origin/main` 大量 commit——推送是另一个单独的决定。
