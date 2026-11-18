# 对话车道上图 · evidence（2026-11-19 · cont.254）

> 用户要求（2026-11-19）：「注意深度的把大模型api能力完整深度的嵌入项目整体能力……可以通过大模型分析能力实现各种状态的流转和内容的输出」「别忘了用stategraph来优化项目 把它做进项目里面」

## 旧状态（cont.222 之后）

设计通道默认 stategraph；**对话通道仍是线性管线**。潮汐预言、人物对话、骑手分析、insight 分析/chat、tide-cast、deep-read、agent-narrate、批准解释、moderation assist、ship/notifications/pulse/editor-note/discover-interest digest、market picks、bible whisper/q/chapter-digest、game witness、observer digest、tide-wire 页面……共 25 处全部经 `chatWithCharacter` 直连 `/v1/ai/chat`。对话是 LLM 流量之王，却没上图——状态图退化为 showroom。

## 落地（cont.254）

### ai-service（`apps/ai-service/src/ai_service/`）

- 新文件 `chat_stategraph.py`：七节点镜像 design graph
  validate → check_provider → build_prefix → call_llm → cache_read → parse_and_release → assemble；
  - `json_mode=False`（对话不是 JSON 任务，provider 会 400）；
  - `parse_and_release` 只做空回复检测（剥空白、封顶 4000 字）；
  - `build_prefix` digest = `sha256(system)[:16]` → `cache_telemetry().prefix.observe()`（角色 system 是逐字节稳定的前缀，潮汐预言 = TIDE_ORACLE_SYSTEM_PROMPT + canon digest）；
  - 与 `/v1/ai/chat` 逐字节同构（AiChatResponse；usage 形状一致含 reasoningTokens）；
  - 与 design 图相同的 LangGraph 懒编译（首次 ~数十秒，进程内复用）。
- `app.py`：`POST /v1/ai/chat-graph` 路由（与 chat 同级），响应头 `x-nexus-orchestration: stategraph`。
- `tests/test_chat_stategraph.py`：6 臂全绿（happy 200 / 阶段顺序 / 无 provider 503 / 坏载荷 400 / 空回复 502 / json_mode 断言 + 前缀 digest 稳定性）。

### web（`apps/web/src`）

- `server/ai/client.ts` `chatWithCharacter`：新增车道解析（`NEXUS_AI_CHAT_ORCHESTRATION` ?? `NEXUS_AI_ORCHESTRATION`；header 优先、env 次之、默认 stategraph）：
  - stategraph → POST `/v1/ai/chat-graph`；lane-a → POST `/v1/ai/chat`（逃生门，无静默切换）；
  - `AiChatResult` 增 `orchestration: string | null`——ai-service 回的 `x-nexus-orchestration` 原样透出，不猜；
  - 25 个调用方**零改动**全部上图。
- `/api/tide/oracle`：注入 lane → 传入 chatWithCharacter；新增 `nexus_chat_lane_total{lane}` 计数；响应加 `x-nexus-orchestration` 头，前端可如实展示。
- 人物对话 `[characterId]/chat`：同口径 lane 解析 + 响应头回声。
- `/stategraph` 页面（zh/en）：新增「对话车道（cont.254）」行。
- `test/ai-client-chat.test.ts`：默认断言跟随 `/v1/ai/chat-graph` + 2 臂新增（lane-a 逃生门、orchestration 头透出）→ **7/7 绿**。
- `observability.ts`：`nexus_chat_lane_total` counter 登记（lane ∈ {stategraph, lane-a}）。

## 实测（prod build 后，Clash 7897 代理，provider 真接）

```
POST :3200/v1/ai/chat-graph  (fast, system="You are a test. Reply PONG only.", user="ping")
→ 200 · x-nexus-orchestration: stategraph
→ model: gpt-6.1-terra · capability: real · provider: openai-compatible
→ usage: tokensIn=4,399 tokensOut=6 cachedTokens=0 cacheReported=false · latencyMs=4,719

POST 3461/api/tide/oracle  { question: "one journey", locale: "zh" }  (nginx rebuild, 2026-11-19 21:01Z)
→ 200 · x-nexus-orchestration: stategraph
→ model: gpt-6.1-terra · tokensIn=119,884 cachedTokens=119,884 (100.0%) · cacheReported=true
```

## 质控

- fe-gates 147/147 · 1353/1353 · census OK 2967（globals.css 全部有引用）
- web `next build` green（Turbopack 28s compile + TS clean + 2 errors fixed：metric 登记名、test 下标非空断言）
- ADR-0275 · cont.254

## 不做的事（诚实）

- 潮汐预言输出仍是纯文本无约束生成——那是 DeepRead 路线（引文式强约束），另立项；
- cachedTokens=100% 是测出来的、不是承诺；provider 侧首次冷启动 ≈4.8%（cont.252/253 同样口径）。
