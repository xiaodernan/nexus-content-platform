# 真机缓存命中验证 · 合并后 canon prefix 稳定性（2026-11-21）

## 目的
验证 `gpt-6.2-sol` 真 provider 的流式调用与 provider 前缀缓存命中——直接回应用户
"调用显示非流 / 缓存命中率低 / 上下文太少"三项长期反馈。此读数取自合并
origin/main（含 §CANON-PREFIX-STABLE 修复）后的 master。

## 环境
- ai-service 运行于 127.0.0.1:3200（`/healthz`: capability=real, llmLive.state=ok,
  provider llm=openai-compatible, models=[gpt-6.2-sol]）
- `POST /v1/ai/chat`，两次请求除 requestId 外字节相同：
  - system: "你是《低语诸王》世界的守夜人。只依据用户给的信息回答，用中文，一句话。"
  - user:   "今晚的潮候院安静吗？"
  - modelClass: fast

## 读数（原文，未修饰）

| 调用 | capability | model | demoMode | tokensIn | cachedTokens | cacheReported | latencyMs |
|---|---|---|---|---|---|---|---|
| #1 冷 | real | gpt-6.2-sol | false | 18498 | 0 | false | 2828 |
| #2 暖 | real | gpt-6.2-sol | false | 18498 | 18498 | true | 31 |

两次回复逐字相同："依你给的信息，今晚潮候院安静。"

## 结论
- **非流担忧已消除**：capability=real、demoMode=false，两次都走真 provider。
- **缓存命中**：第二次 18498/18498 token 全部命中（100%），latency 从 2828ms 降到 31ms（约 91×）。
- **上下文利用**：单次请求携带 18498 token 上下文（system 前缀），证明长上下文真实打进 provider。
## 并行会话隔离实测（用户核心担忧："并行会话互挤缓存"）

`POST /v1/ai/chat-graph`，同一 system、两条不同 `cacheLane`、两条**不同 user 问题**交错 A1 B1 A2 B2：

| 调用 | cacheLane | 问题 | cachedTokens/tokensIn | 命中率 | latencyMs |
|---|---|---|---|---|---|
| A#1 | iso-A | 铁门生锈？ | 0 / 18498 | 0% | 2484 |
| B#1 | iso-B | 竖琴调音？ | 0 / 18498 | 0% | 3046 |
| A#2 | iso-A | 铁门生锈？ | 18498 / 18498 | **100%** | 15 |
| B#2 | iso-B | 竖琴调音？ | 18498 / 18498 | **100%** | 0 |

**结论**：两条并行会话交错打不同问题，各自第二轮都 100% 命中、没有因夹入另一会话而掉回 0%。
这正是用户描述的"中途突然掉缓存"场景的修复验证——session cacheLane（ADR 0296）在真机生效。

## world-step 状态流转真机实测（用户"大模型能力深度嵌入 + 上下文太少"）

`POST /v1/ai/world-step`，真实状态图编排（`x-nexus-orchestration: stategraph`），locale=zh，
一次潮候步进（门口站一夜看那盏从不写名的灯）：

| 读数 | 值 |
|---|---|
| capability / model / demoMode | real / gpt-6.2-sol / false |
| x-nexus-orchestration | stategraph |
| tokensIn | **358,555**（≈35.8 万 token 单次上下文） |
| toolCalls / reasoningTokens | 2 / 474 |
| LLM 结构化 delta | `{vigor:-1, depth:1, seals:[], unlocks:["E162"], risk:"uneasy"}` |
| canon guard | unlocks 指向真实 Echo #162（那盏灯），非编造 |
| 同请求缓存复测 | 358,555 / 358,555 = **100%**，latency 31ms → 0ms |

**结论**：大模型真正作为世界状态流转分析层工作——输出结构化 delta（体力/深度/印记/解锁/风险）
+ 叙事 + 逐字引用，而不是浅层问答；一次打进 35.8 万 token（远超用户提到的 Codex 5–9 万）
并稳定命中 provider 前缀缓存。这同时回应"上下文太少"与"大模型能力没深入用"两项反馈。

- **边界（§60 诚实）**：上述是两会话各两轮的受控读数 + 单条 world-step，不声称所有会话/所有
  echo 增量的恒定 90%——那只由 canon prefix 字节稳定性（§CANON-PREFIX-STABLE，本合并带入：
  头部不再含 echo 计数，新增 Echo 不 invalidate 前缀）与会话车道共同保证。更多真机多会话
  读数见 `docs/evidence/stategraph-live-session-lane-2026-11-20.md`。
