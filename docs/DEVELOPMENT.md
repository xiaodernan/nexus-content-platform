# DEVELOPMENT — 这个仓库是两件事，不是一件

2026-11-09 之前这里有两条历史不相交的开发线；现在它们是一条。这份文档讲
每一半是谁、在哪、怎么跑、改了哪里就多跑什么。

## 两半

| 半 | 产品 | 门的样子 | 继续干什么 |
| --- | --- | --- | --- |
| **studio 线** | `apps/studio`（工作台）、`services/nexus-api`（Java 25 后端）、`agents/`（TS 智能体运行时）、`docs/evidence/` 下的证据制度 + `docs/decisions/` | `npm run verify:*` 行、`verify:proofs`（CI）、`docs/evidence/**` 的 amendments | 复现、扩展或加固门；改线上行为时按 amendment 记录 |
| **main 线** | `apps/web`（Web Studio）、`apps/mcp-server`、`apps/ai-service`、`packages/{creative-model,schemas,world-model,game-model,video-model}`、`docs/adr/` + 评测编排（`evals/`） | `npm run typecheck:main`、`npm run evals`（CI 里以 `main-line.yml` 运行，ADR-0093）、vitest 双分片 | 评测、age 里的 `[ ]` 条目、Studio 界面切片 |

共同的交叉点、同一份真值规则（`docs/specs/MASTER_DIRECTIVE.original.txt`，§ 号在两边文档里都被
直接引用），但**两边的机制各自为政**：主管 Studio 线的证据进它的 `verify:*`，主管 main 线的
结构不变式进它的 `evals/`。

## 两个模型，互为镜像

| | `@nexus/design-model` | `@nexus/creative-model` |
| --- | --- | --- |
| 住在 | `packages/design-model/` | `packages/creative-model/` |
| 被谁用 | `apps/studio`、studio 的 `docs/evidence` 门 | `apps/web`、`apps/mcp-server`、`scripts/` |
| 怎么加载 | tsc 构建到 `dist/`，按包名引入 | 以 **源码** 提供（`exports: ./src/index.ts`），由 alias/路径解析 |
| 怎么测 | `npm run test -w @nexus/design-model` | `npx vitest run packages/creative-model/test` |

它们是同一件事的两个实现（内容不同的类型、不同的命令集），**永远不要试图靠文本手工
merge 它们**——它们各自的消费者能编译通过、两边 475/169 条测试各自绿着就已经足够。

## 新贡献者速查

```bash
# 安装（两侧工作区一起装）
npm ci || npm install

# studio 线
npm run dev              # turbo dev（studio）
npm test                 # turbo test
npm run verify:ci-wiring
npm run verify:validate
npm run verify:audit-contract

# main 线
npm run dev:web          # apps/web    → :3100   （新模式是：一边会话 + Docker postgres）
npm run dev:ai           # apps/ai-service → :8000
npm run typecheck:main   # both models + web + mcp + e2e + tsx tools，全过才有资格说“类型对了”
npm run test:main        # main 线的 vitest（串行 + 真库 fixture 提示）

# 双线共用
npm run evals            # §85 决定性结构不变式；全部 PASS 才合
```

## 改什么、多跑什么

- 改 `packages/design-model/` → `npm run verify:validate`（studio 门）+ `npm run typecheck`（studio 线）
- 改 `packages/creative-model/` → `npm run typecheck:main`（整条都过）+ `npm run evals`（投影自洽）
- 改 `apps/web/` → `npm run typecheck:main` + `npx vitest run apps/web/test/<相关文件>`；如果是
  涉及结构不变式的新面板/派生/投影，必须加一条 evals 或在 evals 里登记
- 改 `agents/` → `npm test -w @nexus/agent-runtime` + `npm run typecheck`
- 改 `services/nexus-api/` → `npm run verify:api-tests` + 对应 wire-contract 证明（`m9/m10`）
- 改任一条 `verify:*` 行的 .mjs → `npm run verify:proofs`（会被 `verify:ci-wiring` §5 人口约束）

## CI 的分工

- `.github/workflows/ci.yml`：studio 线的门。12 步序列（安装 / ADR 索引完整 / typecheck / lint /
  test / build / warm Maven / evidence proofs）。**别动它**——census 按字节评它（`verify:ci-wiring`）。
- `.github/workflows/main-line.yml`：main 线的门。`typecheck:main` + `evals`（ADR-0093），
  pgvector 容器通过 `NEXUS_DATABASE_URL` 喂 `export-roundtrip`；无 DB 时打印 SKIP 且退码不变。

## 事实层

`docs/CURRENT-STATE.md` 是最近一次见证到的 state，读它就是对上一次交付的接上；
`docs/specs/MASTER_DIRECTIVE.original.txt` 是所有 § 号的归属；任何一句“已经测过了”
都必须能写出是哪个门、哪条跑出来的——证据不通则一律按未测。

## 不成文的事（本仓自己的边界）

- `.scratch/` 下的 `.log/.json/.mts` 是**main 线的证据见证**，随仓库一起走；在本仓里不算垃圾，
  删之前先证明它在哪条 ADR/什么记录里被引用过。
- `packages/creative-model` 里不要再放 `@nexus/design-model` 形式的引用——那个包是 studio 线的。
- 两个线的各自证据目录里都有中文长文，不是垃圾——是另一人的账本，不许把它们删掉“清爽一下”。
