# 0013 — 名册的作用域要有执行方，而执行的是"拒收"不是"挂起"

日期：2026-09-26 ｜ 关联：§73 权限、§74 人工审批、§111 批注、§112 Agent 职责、§113 handoff、§159 不做假 API、ADR-0012

## 背景

§112 说"每个 Agent 有自己的职责"，§73 说"越权调用直接失败并记录审计事件，不做静默降级"。
这两句在动手前的实际状态是三样东西对不上账：

1. `agents` 表建库以来**没有写入方**（`db:seed` 里插的是别的东西），也**没有读取方**——`docs/AGENTS.md` 声称
   有一份 `apps/ai-service/**/agents/registry.py` 与 `AgentSpec` 类，**那个文件与那个类全仓库不存在**，
   而 ai-service 按架构纪律 3 根本不连业务库，读不到名册。
2. `agent_tasks.agent_key` 一直有值，但那个值是**意图**（`design-edit` / `research` / …）冒充的：
   请求里没有 Agent 这一栏，`agentKey` 只是 `intent` 的别名。
3. §73 列的能力表（`design.patch` / `code.write` / `publish`…）没有任何代码读过，所以"越权直接失败"
   是一句写在文档里的承诺，界面上没有任何一行行为能证明它。

于是"接名册"有三种做法，保证的东西完全不同：

- **只在界面显示"这一轮由谁负责"**。看得见，但名册仍然是装饰——把 `@qa` 换成 `@design`，
  落地的补丁一模一样。这一条最先被排除：§159 禁止"看起来能用"当成"能用"。
- **在 ai-service 侧做 registry**（`docs/AGENTS.md` 原先描述的那条路）。名册就变成两份：
  Postgres 一份、Python 一份。两份漂移的结果是"提示词说 QA 只能提意见，而门按 Design 放行"，
  并且这种漂移不会红——它只在跨语言那一侧不一致。
- **名册留在库里，判断放在 web 那道门**（选这个）。理由与 ADR-0012 同一条：门要开在执行方自己的收口点，
  而全仓库唯一写终态的地方（同步的 `deliver` / 异步的 `settle()`）都在 web。判在这里，
  同步与异步两条 provider 路绕不过去，真 mock 也绕不过去。

## 决定

- **名册单一写入方 = `scripts/db-seed.mts`**（`npm run db:seed`，13 行幂等 upsert），读取方 = `server/domain/agents.ts`。
  `tools / model_class / max_steps / output` 那四列今天没有读取方，如实写在种子脚本与 `docs/AGENTS.md` 里，
  不假装它们生效。职责随 `AiRequest.agent` 发给 provider（ai-service 的 `_agent_note` 把它拼进系统提示），
  所以 §112 那句"有自己的职责"在模型听到的那一句里也成立。
- **请求方只能提名**：`agentKey` 那一栏或提示词/批注里的 `@xxx`。客户端上传 `agent`（含职责与 capabilities）
  一律 `400 agent_not_allowed` —— 让请求方自报职责，等于让它自己写"我可以改画布"，与 §74 的
  `approvalPolicy`、§68 的 `document` 是同一类问题。
- **`design.patch` 是今天唯一被执行的作用域**，命中条件是"被点名的那位没有它 **且** 结果里有 op"
  （任何 op，不只是删除类——`set` 也在改设计文档）。
- **它触发的是拒收，不是挂起**：`error.code=permission-denied`、`approvals` 保持空、任务行落 `failed`、
  审计写一条 `ai.agent.capability` / `allowed:false`。
- **agent 在提交那一刻解析完就存档**（`agent_tasks.input.agent`），读侧不重算。门读的是
  `input.agent.key`，**不是** `agent_key` 那一栏。

## 为什么"拒收"不能顺手复用挂起

挂起的那一句是"要不要让它落地"。如果越权也走挂起，审批卡片上就会出现一个
**批准之后名册兑不了现**的按钮——"批准 QA 去改画布"。§74 的裁决能改变的是"这一次要不要落地"，
改变不了"这一位有没有权限"。所以两条路各有各的报文与终态：

| | §74 挂起 | §73 拒收 |
| --- | --- | --- |
| `approvals` | 非空 | 空（没什么可批准） |
| `error.code` | `approval-required` | `permission-denied` |
| 行状态 | `awaiting_approval`（不写 `finishedAt`） | `failed`（终态） |
| 结果留档 | 完整那一版存 `result`，批准即交回 | 不存补丁：它本来就不该交回 |
| 审计 | `ai.approval.decide` | `ai.agent.capability`，`allowed:false` |

写成挂起还会留一条**永远等不到裁决**的行：`listPendingApprovals` 里出现一条"有 0 件事要批准"的任务。
这条不是假想——`heldRecord()` 对拒收结果照样能拼出一个形状正确的对象，只有断言
"行不能进等待态"才挡得住。

## 为什么门读 `input.agent` 而不是 `agent_key`

`agent_key` 在没点名时是 `intent` 的别名（历史字段，任务列表按它分组）。而 `research` **既是意图枚举值
又是名册里的 key**：如果门读 `agent_key`，一次谁都没点名的 `research` 请求会突然按 Research Agent 的
权限判定，被拒收；而一次 `@design` 请求在另一个字段上又长得像"没人点名"。
这是同名的两个词撞在一列里，不是哪个字段写错了。所以：
`namedAgentKeyOf(row)` 只认 `input.agent`（只有真解析出来才有），没点名 → `agent=null` → 不做 §73 判定。
`agent_tasks.integration` 与 `ai-jobs.integration` 各钉了一条反面用例。

## 后果

- 得到：@提及真的决定了这一轮谁能落地（`agents.test.ts` 17 条 + `agents.integration.test.ts` 9 条打真库）；
  点错名字/点了不止一个/名册没播种，三种情况各有一句不同的话（`mentionNote`，同步走响应头、异步走 `notes`）；
  名册读不到时不猜（`unknown: ['@fy']`，`findAgent` 不返回"最像的那一个"）；
  职责与权限进了提示词，模型那侧也被告知"没有 design.patch 就 patches 留空"（python 6 条新用例）。
- 付出，而且这条要如实说：**每一次越权仍然白跑一次 provider 调用**。提示词只是"提前告知"，
  它不是拦截——真 provider 不守提示词时，成本已经花了，只是补丁进不了工作区。
  真正的提前拦法要把 capabilities 搬到路由入口（请求还没发给 provider 就拒），
  那一步今天没做，因为"这一轮到底会不会产生 op"在请求阶段还不知道，按 op 数预拒会把纯检查请求也挡掉。
- `resolveAgent` 只解析**一个**负责人（其余进 `ignored`）。多 Agent 编排（§113 的 handoff 链）没实现，
  所以"这一轮由谁负责"目前只是一个标签 + 一份权限，还不是调度。
- 名册要生效必须先播种。空名册不假装认识任何人：`rosterEmpty` 单独一句提示（"还没跑 `npm run db:seed`"），
  而不是与"名册里没有 @xxx"混成一句。
- 变异探针记下两个真实盲区，都已补：`mentionsIn` 把 `match[1]` 写成 `match[2]` 时 TS 不红
  （`noUncheckedIndexedAccess` 让两种下标都合法），而每一次 @提及都会静默失效 → 8/17 单测红；
  `gateResponse` 里把 `opCount > 0` 改成 `opCount > 999`（等于拒收从不触发）→ 45 例里红 6 条，
  同步与异步两条路都抓得到。
