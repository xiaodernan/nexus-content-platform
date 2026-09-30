# AGENTS — Nexus Agent Runtime

## 编排器职责（§23）

`apps/ai-service` 内的 Agent Runtime 负责：task planning · agent selection · tool selection ·
context management · memory · retries · permissions · cost tracking · evaluation。

**"唯一能调用 provider 的进程"这一条今天不成立，写在这是为了别把它读成已经成立**：
今天 provider 有两条路——真 provider 走 ai-service（它不连业务库，只拿 web 装配好的目录，架构纪律 3），
而 DEMO MODE 的确定性 mock 跑在 **web 进程内**（`server/ai/mock.ts`），它读的是服务端的权威文档，
并且它的结果同样要过 web 侧那道门（§74/§73）。工具执行也分两处：ai-service 侧有 sandbox/截图工具，
web 侧有落盘与设计模型读写。谁都不是"另一个的自觉"——所以权限与审批判断一律放在 web 这一侧收口。

## Agent 清单（§24）

Product · Design · Coding · Research · Image · Video · 3D · Game · QA · Security · SEO · Content · Growth

这 13 位今天的**唯一写入方**是 `scripts/db-seed.mts`（`npm run db:seed`，幂等 upsert），
落到 Postgres 的 `agents` 表：`key / name / responsibilities / capabilities / tools / model_class / max_steps / output`。
读取方是 `apps/web/src/server/domain/agents.ts`（`loadRoster` + `resolveAgent`）——
**没有 `agents/registry.py`，也没有 `AgentSpec` 这个类**：早先这份文档写着它们在 ai-service 里，
而那个进程今天既不读名册也不连业务库。名册的真实形状：

```ts
// 每一行随请求发给 provider 的那一份（`AiRequest.agent`）长这样：
{ key: "design", name: "Design Agent",
  responsibilities: ["理解设计请求并分析现有设计", "理解设计系统后再动手", "规划并修改设计模型", …],  // §112
  capabilities: ["design.read", "design.patch", "token.write", "asset.generate"] }  // §73
```

名册为什么放在库里而不是代码里：职责要随请求进提示词（否则 §112 那句"每个 Agent 有自己的职责"
只是 TS 里一份、Python 里一份的抄写），而"谁能改画布"是权限判断——两处必须读同一份现场。
`tools / model_class / max_steps / output` 那四列**今天没有读取方**（没有 tool-calling 运行时，
Model Router 看请求那一栏），留着是历史形状，别读成"这些权限已经生效了"。

## Agent Plan（§25）

复杂任务必须先出计划，结构固定：

```
Goal / Constraints / Tasks[] / Dependencies / Risks / Validation
```

计划对用户可见、可确认、可打断。任务图中每个节点声明它产出什么 artifact，便于 handoff（§113）。

## Activity Feed（§26）

只输出安全、简洁的工作状态与结果，例如：
`Thinking about layout…` `Created 12 components` `Generated 4 assets` `Modified Hero.tsx`
`Running tests…` `Opening browser…` `Screenshot captured…` `Detected alignment issue…` `Fixing…`

**禁止**输出模型隐藏 chain-of-thought。事件里只允许 `stage / status / summary / counts / artifactRef`，
禁止透传原始模型文本推理内容。

## 工具注册表（§72）

统一 `ToolRegistry`，每个工具有 JSON Schema、权限标签、成本标签、超时与幂等标记：

```
read_file write_file search_code search_design modify_design run_command run_test
open_browser click type screenshot generate_image generate_video query_database
search_web retrieve_rag create_component publish
```

`run_command` / `write_file` / `publish` 属高危：受沙箱 + 审批门双控。

## 权限（§73）

Design Agent → design + asset tools；Coding Agent → code + browser tools；Research Agent → web；
Publishing Agent → publish。越权调用直接失败并记录审计事件，不做静默降级。

**今天哪一条是真的**：`design.patch` 是名册里唯一被代码执行的作用域，执行点在
`server/ai/approvals.ts` 的 `gateResponse`（同步 `/api/ai/run` 与异步作业结算共用同一次判断）。
被点名的那位没有这个作用域而结果里又有 op（**任何** op，不只是删除）→ **拒收而不是挂起**：
`patches` 抽走、`error.code=permission-denied`、`approvals` 保持空，任务行落 `failed`，
并写一条 `ai.agent.capability` / `allowed:false` 的审计。
为什么是拒不是挂：挂起要问"要不要让它落地"，而名册说的是"这一位不能落地"——
问那一句等于默认批准之后 QA 就能改画布，那是名册没给的承诺（详见 `docs/adr/0013-*`）。
其余作用域（`code.write` / `asset.generate` / `publish`…）今天**没有对应的可执行动作**，
所以判了也没东西可挡；写一份没人执行的权限表看起来像管控，其实是装饰。

## 人工审批门（§74 / §177）

以下动作必须 `requires_approval=true` 并在 UI 出现明确确认卡：
删除项目、公开发布、消耗 credits、对外发送消息、生产部署、支付。
用户可配置审批策略（"Ask before: production deploy / public publish / spend credits / delete / payment"）。
未获批准时 Agent 停在 checkpoint 并保持可恢复，而不是绕过。

**今天哪一格是真的**：`删除项目` 已在人的路径上落地（2026-09-26）——
`DELETE /api/projects/[id]` 要求 `confirm` 逐字等于项目名，判定在 `softDeleteProject` 里做，
不匹配就一条都不写并落一行 `allowed:false` 的审计；删除是软的（`deleted_at` 置时间戳，快照与发布行留着，
回收站可恢复）。**这条门不依赖界面上的弹窗**：绕开 UI 直接打接口同样挡得住，e2e 里就是这么测的。

`delete` 也已经在 Agent 路径上落地（同日，两次提交）：`agent_tasks.requires_approval` 与状态
`awaiting_approval` 这两列从 0000 建库起就没有写入方，现在有了——门在 `gateResponse`，
它读补丁里的 op（不只是 provider 自报的 `approvals`，取并集），命中就把 `patches` 抽走、
`error.code=approval-required`、把"已落地"那类说法改成实际发生的那一句，
而**完整那一版**存进任务行（批准的凭据是"看过这一版"，所以重新生成一份不算）。
裁决走 `decideApproval`（CAS 只认等待态：两个标签页都点批准只有一次真的写下去），
Studio 的审批卡片与任务列表读的是同一份现场。同步 `/api/ai/run` 与异步作业（§162）过的是同一道门：
异步那一路"跑完"不发完成通知，等待不是终态（不写 `finished_at`）。
挂起也不是无限的（2026-10-01，ADR-0022）：`awaiting_since` 记下挂起那一刻，
超过 `APPROVAL_TTL_MS`（`packages/schemas`，24 小时，界面上说的是同一个数）没人裁决就**作废**——
读取时收敛成 `cancelled`（ADR-0011 同口径，四个入口都收敛），不写批准人、不发完成通知、不扣点，
过期之后再点批准会拿到 `not_pending` 加一行 `allowed:false` 的审计。
作废那一次**会出声**（同日补的第二片，接 §164）：只有 CAS 赢家那一路 `emit` 一条 `approval` 通知，
键挂在任务行上（`approval:<taskId>`），所以四条读路径同时读到过期也只会进收件箱一次；
实时事件推给**创建者自己的用户频道**（不是项目频道，别的项目的人不该看见这条），
收件人取自任务行的 `created_by`——不是"当时碰巧打开面板的那个人"，查不到创建者或项目就一条都不写。
"扣下几处"那个数从被扣下的那一版里读，读不出来就**不说个数**（不是报 0）。

**还没实现**：公开发布走的是 §131 门禁而不是审批卡；credits / 外发消息 / 生产部署 / 支付随 M7-M8 落地；
"用户可配置审批策略"今天是服务端常量 `WEB_APPROVAL_POLICY`（客户端在报文里填的那一栏一律被改写）；
到期只进站内收件箱并推一条实时事件，没有邮件或浏览器推送那一路。

## Design ↔ Coding 协作（§22 / §112-114）

```
User → Design Agent → Design Model → Coding Agent → Code → Browser → Screenshot → Visual QA → Fix
```
Handoff 载荷必须包含：task · context · artifacts · changes · results（§113）。
Coding Agent 只接受"设计版本引用"，不接受自然语言转述，避免语义漂移。

## 失败与自我改进（§157 / §161）

失败路径：`failure → root cause → fix → evaluation`，同类错误重复出现时把根因写入 `docs/adr/`。
Provider 故障走 failover 链（A → B → fallback），并在 Activity Feed 里明说降级为 DEMO MODE 或 unavailable。

## 成本与观测（§75 / §84 / §156）

每次调用记录：`tokens_in / tokens_out / model / latency_ms / cost_estimate / tool_calls / agent / task_id`。
汇总进 `usage` 表 + 结构化日志 + trace（agent trace 关联 task_id 与 screenshot refs）。
用户侧可见 "AI Usage" 页（§75），Agent 侧可见 benchmark 视图（§156：task success / visual quality / code quality / latency / cost）。

## 评测（§85-86）

`evals/` 下按能力分套件：design accuracy · code correctness · visual quality · agent task completion ·
tool selection · RAG accuracy · hallucination · accessibility · performance。
Visual Benchmark 用参考截图 vs 生成截图，指标为 layout similarity / spacing / alignment / color /
typography / component correctness —— **不用 pixel-perfect 单一判据**。

## 上下文引擎（§66-70）

Agent 必须拿到而不是每次重推：current selection · current page · viewport · design system ·
project files · assets · user request（§66）。
大型项目禁止整 repo 塞进模型（§68）：用 semantic retrieval + file summaries + symbol index +
dependency graph + recent changes + design graph 组装上下文窗口。
索引：Code Index（File/Symbol/Function/Class/Component/Dependency，§69）、
Design Index（Page/Frame/Component/Asset/Token/Interaction，§70），合成 Project Graph（§71）。
