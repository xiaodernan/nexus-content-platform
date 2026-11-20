# 0296 — 会话级 provider 前缀缓存车道（并行会话不再互挤）

- **日期**: 2026-11-20
- **状态**: Accepted（代码 + 门已落地；真机读数有界，见「实测与边界」）
- **里程碑**: M8 / LLM 基础设施

## 背景

用户报告：同一 API 命中率会「中途突然掉」，怀疑「几个并行会话同时打 API，缓存区分不明显」，
要求参考 codex 的做法妥善处理并行会话；同时把新模型 `gpt-6.2-sol` 用起来。

真机实测（2026-11-20，gpt-6.2-sol，流式 + `prompt_cache_key`，经 Clash Verge）：

- 同一个 system 前缀、同一条车道，交替问题 A/A/B/B/A：
  A 冷 0% → A 暖 94% → B 94% → B 94% → **A 再问掉回 0%**；
- 两条不同车道，各问各的：A 冷 0% → A 暖 94%，B 冷 0% → B 暖 94%，互不影响。

这复现了用户描述的「中途掉缓存」。根因在 `sticky_prompt_cache.py`：自由文本对话的
`stable_material` 只返回 `f"{system}\0"`，同一人设/同一 system 的**所有会话共用一条车道**；
distributor 的 channel-local 前缀缓存容量有限，一条车道上塞进不同会话的尾巴，
后者就把前者挤出。

## 决定

给 chat 契约加**可选**会话级车道 `cacheLane`：

1. `packages/schemas/src/index.ts` 的 `AiChatRequestSchema` 增加
   `cacheLane: z.string().min(1).max(200).optional()`；`contracts/ai-chat-request.schema.json`
   由 `contract:export` 重新导出（只此一份漂移）。
2. 角色对话路由把 `character:<id>:session:<sessionId>` 作为 `cacheLane` 传给
   `runCharacterChatGraph`；没有 sessionId 时**不造随机车道**（否则每轮冷启），
   回落 ai-service 既有的 system sticky 键。
3. ai-service 的 `session_lane_key(cacheLane)` 把会话名哈希成 `nexus-<sha256[:32]>`，
   形状与自动 sticky 键一致；线性 chat 与 chat-stategraph 两条管线都读这个字段。
4. `complete()` 增加可选关键字参数 `prompt_cache_key`（会话级优先、实例级兜底），
   SSE 与非流两条 body 构造路都写它；`StickyPromptCacheTransport` 既有规则尊重
   caller-owned 键、不再按 system 覆盖。
5. **会话车道不进 L2 缓存键**：同一问句跨会话仍共享一次 completion 缓存命中，
   车道只决定 miss 时真调用钉到哪条 provider channel。

缺省 `cacheLane` 时，所有调用形状字节级不变（只在非空时才把新 kwarg 传给 provider），
老 provider / 测试替身零回归。

## 实测与边界（§60，诚实）

**门（确定性，全绿）**：`pytest test_sticky_prompt_cache.py` 28 passed / 1 skipped
（原 24 passed）。新增 4 门钉住：同会话车道稳定、跨会话隔离、空值回落、变异臂逼红；
会话键优先于实例键且流式/非流都覆盖；L2 不把车道折进缓存键。
全量 `pytest apps/ai-service/tests` **471 passed / 18 skipped / 2 failed**——
2 个失败是 `test_world_step_stategraph.py` 的 E180 回响问题，在干净 HEAD 上**同样复现**
（用独立 worktree 验证），与本增量无关，另行登记。

**真机（有界，不下保证）**：gpt-6.2-sol 经 Clash 代理，两条会话车道交错 A/A/B/B/A/A，
A 的暖调用读到 94%，但末次又掉回 0%（中间一次 `curl` schannel 握手失败）。
因此本增量**不宣称稳定 90%**：它消除的是「一条车道被多会话尾巴互挤」这一个已测原因，
provider 的 channel 轮转、TTL 淘汰、Clash 出口抖动仍在（ADR 0125 三条观察不变）。
应用侧 L2 缓存 + single-flight 仍是命中率的主要来源，会话车道是补充。

## 相关

- `apps/ai-service/src/ai_service/sticky_prompt_cache.py`（`session_lane_key`）
- `apps/ai-service/src/ai_service/providers/{base,openai_compatible}.py`
- `apps/ai-service/src/ai_service/completion_cache.py`
- `apps/ai-service/src/ai_service/{execution,chat_stategraph}.py`
- `packages/schemas/src/index.ts` + `contracts/ai-chat-request.schema.json`
- `apps/web/src/server/ai/characterChatGraph.ts` + 角色对话路由
- ADR 0123/0125/0126/0127/0128/0129、docs/CACHE-IDENTITY.md

## 顺带修复（独立缺陷）

`apps/web/src/server/ai/canonGraph.ts` 顶部块注释缺少 `*/`，导致 `tsc -p apps/web`
把 import 当注释内容解析、报 5 个 TS1011/TS1128；补上闭合后 web 类型检查 0 错误。
