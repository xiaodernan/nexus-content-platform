# ADR-0093：§85 evaluation runner——结构不变式进 CI；数字靠人比对

日期：2026-11-09
依据：`evals/run.mts`、`evals/suites/*.mts`、`docs/AGENTS.md` §85、`docs/EVALUATION.md` 第十五～二十二片、`scripts/eval-baseline.mts`。

## Context

`docs/AGENTS.md` §85 一开始写着"`evals/` 下按能力分套件"，但仓库里只有 `scripts/eval-baseline.mts` 一段长脚本：

- 要真 PostgreSQL、真 provider，只能在本机跑；
- 跑完打印一圈数字，**没有「不变式红即 exit 1」的退出码**——它是给人比对着的、不是给 CI 用的门。

现实中这两个用例互斥：

- **结构不变式**（计数、序点、往返全等、覆盖数）——纯模型层、不依赖网络 / 库 / 时钟 / provider，是能放进自动门的：只要退了就立即能分红。
- **判断题**（RAG recall@5、设计精度、Visual benchmark）——必须接真 provider 或至少接真库，只能由能跑这场仗的本地跑过一轮给人看，不能每次 PR 都复读。

让它继续兼负两职：CI 跑不动它，人又看不见显眼的退回——回归靠"人会不会注意到"在运转。

## Options

**A. 把 eval-baseline 整段拆进 `npm test`**
- 代价：vitest 不 `find` 它，Node 跑 integration test 需要 Docker 起停，CI 触发每次因库的可用性决定成败——门不稳。
- 结论：否。

**B. 拆成两个独立目录 / 两个独立命令——选定。**
- `evals/`（确定性）：9 套全绿即 `exit 0`；任一结构不变式红 `exit 1`。不需要 Docker、不需要 provider。可在 pre-commit 跑。
- `scripts/eval-baseline.mts` 保留为 `npm run evals:baseline`：本机偶尔跑、记一份 EVALUATION 数字给人看，不是 PR 门。
- 两套命令、两种退出码语义。CI 跑的是第一条。

**C. 单一命令内部分支跳过需要 DB 的用例**
- 代价：退出码语义丢失（红是"代码坏了"还是"Docker 没起"说不清），CI 看到 exit 1 不知道哪段红。
- 结论：否。

## Decision

**B**。`evals/` 是 §85 在 pre-commit / CI 上的确定性片面；判断题留给 `scripts/eval-baseline.mts`，本机偶尔跑、人眼读数、记在 `docs/EVALUATION.md`。两者不再互相挡道。

## Consequences

- §85 具备"红就是退回"的判别力——CI 可以拦截回归。
- 任何人（含任何 AI 子会话）改投影 / 解析 / 发射器之类逻辑都会立刻被门打回。
- 新增一项评测 = 新建 `evals/suites/<name>.mts`（实现 `EvalSuite`）+ `run.mts` 注册一行 + `evals/README.md` 补一行 + `docs/EVALUATION.md` 补一片。这一模式已被九套全部跟上（同提交 2026-11-09）。
- 判断题的人仍保留下来看：`eval-baseline.mts` 跑出来的 recall@5、MRR、a11y 检出 4/4、坐标、往返干净数——都还在，只是不再作为自动门。
