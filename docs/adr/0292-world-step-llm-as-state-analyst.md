# ADR-0292 · 潮候步进（world-step）：LLM 作为世界状态流转的分析层（2026-11-19 · §WS-1）

## 状态：已接受（2026-11-19；与 cont.418–423 双线收敛同时落地）

## 背景

用户（2026-11-19）再次点名："大模型不能只做答一句的接口——要通过大模型分析能力实现各种状态的流转和内容的输出，把项目的大模型能力完整深度嵌入，状态图要做进项目里面"。此前的 StateGraph 两条线（design-lane：`stategraph.py`、chat-lane：`chat_stategraph.py`）只是"线性管线 ↔ 图"的**结构镜像**，LLM 没有参与任何决定世界如何改变的推理——它仍是黑盒直答。

同期真实 provider 侧实测（2026-11-19 两条车道）：`/v1/ai/chat-graph` 与 `/v1/ai/world-step` 走 `gpt-6.2-sol`（经本机 Clash Verge `127.0.0.1:7897` 出网；直连 HTTP 403「本站不对您所在的国家及地区进行商业服务」），stream=True 且 digest 前缀稳定后，KV 命中稳定在 **89% 上下**，与用户对 Codex 的约 90% 观感同一量级。

## 选项

A. 只加一张新的"编译图镜像"（/v1/ai/world-graph，同输入同输出，仅编排结构）——
   能交差"用 LangGraph"这句话，但状态流转的智能仍是 0；不符合用户的迫切期望。
B. 让 LLM 每步直答大文本，web 侧正则抽取酌情——
   低质量结构化输出不可信（§159：绝不拿假结果冒充真数据）。
C. **编译出的职责图 + 本地硬校验**（采用）：
   - analyze（真 LLM · 微小前缀 · 读局：intent/stakes/hooks JSON）：便宜、无 digest 负焦，约 3% 成本
   - retrieve（纯本地 · zh 锚句 BM25-lite · 零 token/零缓存压力）：topK=4，滚雪球式诚实
   - narrate（真 LLM · canon digest 稳定前缀）：KV 复用约 99%
   - canon_guard（纯本地）：每条引用逐字核验（非逐字剔除）、unlocks 回响号必须是 digest 真实存在的、数字夹紧至 [-3,+3]
   - assemble：契约组装，失败直达 END；响应带 `x-nexus-orchestration: stategraph`
   - web 侧：localStorage 状态权威（不写库、不引入第三份状态），delta 交 UI/世界引擎渲染

## 决定

采用 C。具体落点：

- 契约：`packages/schemas` 新增 `WorldStepState`/`AiWorldStepRequest`/`WorldStepDelta`/`WorldStepCitation`/`AiWorldStepResponse`（zod 唯一权威 → `contracts/*.schema.json` → ai-service 运行期校验，web 经 `@nexus/schemas` import 同名定义）
- 服务端：`apps/ai-service/src/ai_service/world_step_stategraph.py`；路由 `POST /v1/ai/world-step`
- web：`/api/ai/world-step`（CSRF 双提交 · IP 限流 10/h · `nexus-insight=1` 口令 123 · 真 provider 缺席时响 409 如实拒）；`/tidewatch` 公开页双语，状态随 `localStorage`
- 可观测：`nexus_world_step_total`/`nexus_world_step_latency_ms`（闭集标签，不允许自由标签）

## 证据（真 provider，2026-11-19）

- 契约导出：`contracts/ai-world-step-{request,response}.schema.json` 两份均由 `npm run contract:export` 生成，契约对账 17/17 绿
- pytest：新增 test_world_step_stategraph.py 8 臂全绿；ai-service 全套 **469 passed / 18 skipped** 无回归
- 真 provider（经 Clash，:3217 临时实例）HTTP 200 · 20.0s 冷启动（2 次 provider 调用）· `tokensIn=315,805` `cachedTokens=281,247`（**89.1% KV 命中**）· `toolCalls=2` · 中文潮回四联（delta、risk）· canon_guard 当面剔除一条虚构引用（citations=[] 如实呈现，绝不伪造引经据典）
- verify:world-bible **990/990** · verify:bible-snapshot 一致 · fe-gates **152/152 · 1386/1386 · census 3043**

## 后果

### 变好的事

- LLM 第一次**真正驱动**世界的状态变迁：模型提议、契约约束、本地逐字核验——没有任何一条"显得智慧"的虚构通不过落账这关；
- 世界时钟/旅人Vigor/潮位/印记/回响解锁全部结构化可播种、可签、可重放；
- digest 前缀的 KV 摊销直接生效，一步≈两次 provider、首 token 延迟仍可接受；检索零 token；
- web 状态权威唯一（localStorage），不引入第四个真值、不引入迁移即风险；
- "大模型分析能力实现状态流转与内容输出"首次在本仓库落地为可被世界引擎直接消费的协议格式（`delta`/`citations`）。

### 变差的事

- 两次 provider 成本/延迟比 chat lane 高（≈2×）——价值决定，不改；budget 的节制在闸（IP 10/h + JSON 模式）
- 时序要求 web 携带完整状态（含 memory）入契约：一步≈600KB？否——state ≤ 数 KB，无虞；
- canon_guard 的逐字核验会拒绝"部分正确"的引用（错一个字也剔）——按 §TIDE-ORACLE-VERIFY 同一政策执行，宁缺毋滥；
- 该端点状态语义本身不落库：检索/审计视角仍用缓存账（prefix/upstream/provider 三账）兜底，写库留给 web 层任务系统（v661 流）。

### 能撤销

删 `world_step_stategraph.py` + 两条契约 + `.tw-*` CSS + `/tidewatch` + `/api/ai/world-step` + `rateLimit` 桶与 observability 两项即可回退，零数据迁移。

## 相关

- ADR-0275（chat lane stategraph）、ADR-0286（BIG-CTX digest 配额）、ADR-0291（origin/master 陈旧引用，"两线收敛"纪律的收益与代价）
- 并行线 cont.416–423（#159–#163 echo、IO 头像/github-stats/I18N 修复）——世界时钟方向的回响分配才是共享同一语序

## Addendum（2026-11-19 · cont.425）

真弹复测见 `docs/evidence/singleflight-concurrent-proof-2026-11-19.md`：

- 8 路相同 HTTP POST → 8 路同为 HTTP 200 · 同窗口 ~32.3s
- cache-stats：`provider.reportedHitRate = 0.8892` · `prefix.reuseRate = 0.875` · `transport.stream = true` · `upstream.drifted = 0`
- 结论：single-flight + sticky lane + 流式 是当前范式下并发 KV 稳定的答案；在现阶段证据集下不再需要「奇偶 0/88.1」场景。
