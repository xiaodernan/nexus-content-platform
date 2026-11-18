# ADR-0275 · 角色对话车道登记 StateGraph（cont.254 · 2026-11-19）

## 背景

ADR-0236 把**设计通道**默认翻到 StateGraph（cont.222）。对话通道（`/v1/ai/chat`）仍是顺序管线：潮汐预言、人物对话、正典深问、洞察分析、agent-narrate、审批解释、通知摘要、学生潮汛等 20+ 处全部经 `chatWithCharacter` 直连线性管线。用户明确要求「深度嵌入 LLM 能力 + 用 StateGraph 优化项目、把它做进项目里面」——对话是流量最大的 LLM 通路，留着它不进图，状态图就只是个 showroom。

## 决定

1. **ai-service 新增 `/v1/ai/chat-graph`**（`chat_stategraph.py`）：与设计图同七节点镜像
   （validate → check_provider → build_prefix → call_llm → cache_read → parse_and_release → assemble）。
   与设计图的区别全部是**对话语义必然**：
   - 契约 `ai-chat-request/response.schema.json`（无 patches、无 plans、无 approval-policy）；
   - `json_mode=False`（对话不是 JSON 任务；provider 对 json_object 模式会 400）；
   - `build_prefix` 的 digest = `sha256(system)[:16]`——角色 system 是逐字节稳定的前缀
     （潮汐预言 = TIDE_ORACLE_SYSTEM_PROMPT + canon digest），这是对话通道唯一可自证的前缀摘要，
     喂给 `cache_telemetry().prefix.observe()`；
   - `parse_and_release` 只做空回复检测（剥空白、封顶 4000 字），没有 JSON 解析；
   - 与 `/v1/ai/chat` 逐字节同构（同契约、同失败码、同 usage 形状）。
2. **web 对话客户端默认走图**：`chatWithCharacter` 解析 `NEXUS_AI_CHAT_ORCHESTRATION`
   ?? `NEXUS_AI_ORCHESTRATION`（header 优先、env 次之、默认 stategraph），
   命中 stategraph → POST `/v1/ai/chat-graph`；显式 `lane-a` → 退回 `/v1/ai/chat`。
   逃生门与设计车道同一心智（无静默切换，非法值回落默认）。
   三个入口（`/api/tide/oracle`、人物对话、其他直调方）**零改动**即全部上图——
   `result.orchestration` 携带 ai-service 的 `x-nexus-orchestration` 响应头；
   oracle 与人物对话把该头回声给前端，`/stategraph` 页与说明书据此展示真实车道。
3. **计数**：新增 `nexus_chat_lane_total{lane}`（stategraph|lane-a），`/api/tide/oracle` 每次调用记一次。
4. **测试**：
   - `apps/ai-service/tests/test_chat_stategraph.py` 6 臂（happy 200、阶段顺序、503/400/空回复 502、契约上升面、前缀 digest 稳定性断言）——全绿；
   - `ai-client-chat.test.ts` 新增：lane-a 逃生门回退 `/v1/ai/chat`、`x-nexus-orchestration` 头透出；默认断言跟随为 `/v1/ai/chat-graph`。

## 后果与边界

- 对话流量默认走图：错误分支仍是「条件边直 END」；provider 不可用时两车道同样如实 503。
- 首次调用会编译 LangGraph（~数十秒），进程内复用。
- 回滚 = 一个 env（`NEXUS_AI_CHAT_ORCHESTRATION=lane-a`），无需发版；设计车道可按需 `NEXUS_AI_ORCHESTRATION=lane-a` 独立退回。
- 遥测两本账同构：chat 走图也记 `provider.record` + `prefix.observe`，`/v1/ai/cache-stats` 口径不丢。
- 未覆盖：潮汐预言的输出仍是纯文本无约束生成（DeepRead 路线另立项），本 ADR 只把编排结构做深。
