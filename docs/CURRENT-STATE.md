# CURRENT-STATE — 2026-11-09

本文件是项目当前状态的快照——供未来任何 agent（或人类）在我不在的时候接上。它**只描述已经交付、已可执行的事**，不承诺未做的事。

## 评测（§85）

`npm run evals` 返回 0（退出码）：

| 套件 | § 维度 | 读数 |
|---|---|---|
| `code-index` | §69 Code Index 检索 | 19/19 |
| `model-roundtrip` | §16/§19 投影自洽 | 13/13 |
| `export-roundtrip`（需 `NEXUS_DATABASE_URL`） | §144 导出保真 | 17/17 · 55100 regress 实例实测 |
| `video-plan` | §40-42 视频投影 | 30/30 |
| `world-build` | §44/§46/§140 世界模型 | 55/55 |
| `schemas-contract` | §6 边界纪律 | 17/17 |
| `game-build` | §54/§51 游戏设计系统 | 36/36 |
| `design-build` | §12/§13 design-model 投影 | 46/46 |
| `project-bundle` | §16/§159 集大成合成 | 14/14 |
| `local-embedding` | §49 本地 token-bag 语料检索（确定性） | 14/14 |

**合计 261 / 261 PASS**（不含 needsDatabase 的 `export-roundtrip`：那一项 `npm run evals` 在 env 已设时跑、不设则打印 `SKIP` 退出码不变，CI 安全）。

真库首跑读数（仍以 `npm run evals:baseline` 验）：recall@5 = 100% / MRR = 0.786 / 代码往返 5/5 干净 / 无障碍 4/4 检出 / 渲染后页面 axe 违规 0 条—— `docs/EVALUATION.md` 第十五片起。

不成文：**CI 注入 `POSTGRES_CONNECTION_STRING` 即可在 `npm test` 之前自动多跑一遍 `export-roundtrip`**。

## 测试

`npx vitest run --shard=1/2` / `npx vitest run --shard=2/2` 全绿：

- shard 1 + shard 2（2026-11-09 06:35）：合计 272 files / **3590 tests**

证据日志入库（`scratch shard*-2026-11-09c.log`，已 `git add -f`），见 `docs/TESTING.md` 2026-11-09 那条。

## 关键 ADR

`docs/adr/0093-eval-runner-deterministic-invariants-in-ci.md`：§85 判决门——结构不变式红即
`exit 1`，阻止合并；判断题（RAG/设计精度/Visual）不上自动门。

## 已经合入主干的另一会话成果（无许可主动删不动）

- 两条线合入一个分支后的内容，全部是两侧原子的整个体系（无内容被裁剪，无证词被改写）。
- `8179208`：`apps/web` 确定性本地 embedding provider（§49），环境变量 `NEXUS_EMBEDDING_PROVIDER=local` 显式 opt-in，测试 13/13 绿；不存在没有 provider 时告随便的行为，同一个模型档在 `model_for` 上自报家门。`evals` 第十套 `local-embedding 14/14` 进矩阵（261/261），`.github/workflows/main-line.yml`（`cf1537e`）让结构不变式进了 CI。
- `cf1537e`：新增 `.github/workflows/main-line.yml`，主线的 `typecheck:main` + `evals` 决定性结构不变式进了 CI（ADR-0093），针对 `pgvector` 容器跑 `export-roundtrip`（无库时打印 SKIP 且退码保持不变）。
- 其余动作都在 `docs/evidence` 里按 amendment 568（v641）记录：id 568 已授予。

另一位智能体在 `main` 上的提交我负责接下来：
- `f14fe2a` §147 选中响应回归测试（已随 my commits 入 main）
- `8e0335c` §85 公开作品页 × 浅色 axe
- `9b0b278` §85 收起面板的 axe + `control-names` 扩扇 text-like
- `62563e6` 跨模型同进程 store 持有不互覆盖
- `f604d13` 两片全绿记账
- `18228f0` agents doc 层面更新
- `3638076` TESTING.md 九套真实 check 数
- `0364995` EVALUATION.md 头部九套顺序对上 §图谱

## 已知卡口

- **Video / Image Studio 真像素**：`apps/ai-service/src/ai_service/adapters/` 没有注册任何真 provider——本机没有 key，故走 DEMO MODE
  （prompt 哈希 + 原色板代换 + 布局对齐的本地构图），UI 常驻 DEMO MODE（§159/§160）。
  §105 真 provider 接入只需：用户给 key → 在 `ai_service/adapters/` 增加一个适配器 → `POST /generate_image` / `POST /generate_video` 走真路径。
- **PGVector 混合检索**：未接入（§49/93 仍是 `[~]`）。

## 本仓与工作树

- 2026-11-09 已把两条平行线（studio 线 `master` 与 main 线 `main`）合并成一条：`origin/master` == `origin/main` == 本地 `master`，工作目录不再是单行。
  - Studio 线的 `packages/design-model` 在原路径；main 线的模型被**原样**搬到 `packages/creative-model`，包名 `@nexus/creative-model`，main 线文件里的 `@nexus/design-model` 已全部改指向新包。
  - 两类模型的文档（12 个共享 docs）现在**逐字保留**两边：studio 线在前，main 线的全文在 `# 附录 · …` 之下，不抹不删。
  - studio 线的 `docs/evidence`、Java 服务、agents runtime 全部原样保留并可验证。
  - 12 个 add/add 冲突的解法见 `README.md` 的 "Consolidation history" 一节。

- 子模块 `packages/*` 通过 `@nexus/*` alias 或 `tsconfig.json paths`——`tsconfig.base.json` 是单一真值来源。

- 2026-11-09 新增 `apps/web` 侧确定性本地 embedding：`NEXUS_EMBEDDING_PROVIDER=local`（**必须显式设置，绝不静默切换**）后，Web 进程内就能完成 §49 的 embedding 与 hybrid 检索——token-bag 哈希，1536 维，无需 key；不是语义模型，只是确定性本地便捷。真实 provider 仍按原有路径接入。
- 全局环境：Windows 11 / Node 24 / Python 3.11 / Java 25 + Maven（ai-service），以及 Compose 上的 PostgreSQL 55433 / Redis 56379（`infra/docker-compose.yml`）。

## 交接

接手的人（不管是哪段对话）只要：
1. `git pull origin main`
2. `npm ci`
3. `docker compose -f infra/docker-compose.yml --profile core up -d`
4. `npm run typecheck && npm run eslint`
5. `npm test`
6. 跑评测：`npm run evals`

即可得到当前文字所写的状态。
