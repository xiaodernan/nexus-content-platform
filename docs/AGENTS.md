# AGENTS — Nexus Agent Runtime

## 编排器职责（§23）

`apps/ai-service` 内的 Agent Runtime 负责：task planning · agent selection · tool selection ·
context management · memory · retries · permissions · cost tracking · evaluation。
它是**唯一**能调用 provider 与工具的进程；web 侧只发起请求与接收事件。

## Agent 清单（§24）

Product · Design · Coding · Research · Image · Video · 3D · Game · QA · Security · SEO · Content · Growth

每个 Agent 定义为一个声明对象（`agents/registry.py`）：

```python
AgentSpec(
  name="design",
  capabilities=["design.read", "design.patch", "asset.generate", "token.write"],  # §73
  tools=["search_design", "modify_design", "create_component", "generate_image"],
  model_class="reasoning",        # §76 Model Router 选择具体模型
  max_steps=12,
  output="design_patch",
)
```

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

## 人工审批门（§74 / §177）

以下动作必须 `requires_approval=true` 并在 UI 出现明确确认卡：
删除项目、公开发布、消耗 credits、对外发送消息、生产部署、支付。
用户可配置审批策略（"Ask before: production deploy / public publish / spend credits / delete / payment"）。
未获批准时 Agent 停在 checkpoint 并保持可恢复，而不是绕过。

**今天哪一格是真的**：`删除项目` 已在人的路径上落地（2026-09-26）——
`DELETE /api/projects/[id]` 要求 `confirm` 逐字等于项目名，判定在 `softDeleteProject` 里做，
不匹配就一条都不写并落一行 `allowed:false` 的审计；删除是软的（`deleted_at` 置时间戳，快照与发布行留着，
回收站可恢复）。**这条门不依赖界面上的弹窗**：绕开 UI 直接打接口同样挡得住，e2e 里就是这么测的。
其余几格（公开发布走的是 §131 门禁而不是审批卡、credits / 外发消息 / 部署 / 支付随 M7-M8 落地）
以及 Agent 侧的 `agent_tasks.requires_approval`（全库无人置真）、可配置审批策略，都还没有实现。

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
