# ADR-0235 · 全局字节级正典前缀：把 agent 通道钉上世界大典（codex 式缓存放大）

日期：2026-11-19 · 状态：已采纳（代码+测试+实测三段落盘）

## 背景

ADR-0234 实测显示：`/api/bible/q` 这类**system = 全局恒定**的调用，连发命中 100%（cachedTokens = tokensIn = 43458）；而自由生成路径（design graph / `/api/ai/run`）的 "system" 由 `design_prompt.build_prompt` 现拼，
表面上是恒定的 `SYSTEM_PROMPT`，实际却被**拼在尾部的一段 `_agent_note(request)` 污染**——`本轮没有点名任何 Agent` 恒定时看似无害，一旦点名 Agent，system 就每 Agent 一车道（见 test_prompt.py 当时的断言）。

更根本的缺陷：**恒定的 system 体量太小**（≈1.5k 字符的 Agent 规则）。稳定段这么短，摊销掉的缓存就少；
codex 系应用能持续 ~90% 命中，是因为**整段巨型 system 前缀**（代码、工具、规范）逐字节恒定，KV 缓存沿字节前缀命中。

## 决定（三个钉子，缺一不可）

1. **正典前缀入库**：`scripts/gen-canon-digest.mts` 把 TS 侧唯一真值
   `bibleAsk.SYSTEM_PROMPT`（= 低语诸王·世界大典 digest ≈61k 字符，来源 docs/world-bible/）原样写出
   `apps/ai-service/src/ai_service/canon_digest.txt`（+ `.sha256` 指纹），`gen:bible-snapshot` 与之串联；
   ai-service 进程启动时读它，**缺文件即崩**（不静默退回"无正典"——缓存会无声归零，§159）。
2. **ai-service 的 SYSTEM_PROMPT = CANON_PREFIX + SYSTEM_RULES**（字节恒定，无任何每轮可变内容）；
   `build_prompt` 的返回值改为只回这个恒定段，** agentNote 不再拼进 system**（它本来就重复出现在载荷的
   `agent` / `agentNote` 里，留在 system = 前缀每 Agent 失配一次）。
3. **观察坞开放直问通道**：新增 `/api/insight/chat`（口令 123 + CSRF + IP 闸，模型只看到正典 + 你这句问题），
   与 `/api/bible/q` **共享同一个 SYSTEM_PROMPT 字节常量** → 两条线共享同一份 provider 前缀缓存，
   多人多轮共用一个热 KV 通道。页面内新增「正典深问」面板实时显示 `cached n/m tokens`。

## 细节与边界

- `sticky_prompt_cache.stable_material` 不动：dict 载荷的 per-project 车道（ADR-0126）**保留**——
  同项目连发 ≈43k/52k tokens 缓存命中（~84%+），跨项目不合并车道（这是当年真机分测结论）。
  正典前缀入 system 后，**每个车道内部**的可缓存体量从 ~1.5k 涨到 ~61k 字符。
- `prompt_cache_key` 不变（`nexus-` sha256），不新增轮换轴、不碰分发桶逻辑。
- 正典更新 → `gen:bible-snapshot` 重新生成 txt + sha → pytest `test_canon_digest.py`（4 条 + 既有 455）锁字节一致；
  sha256 录在 txt 旁，任何手改立即可见。
- token 成本：每次调用注入 ≈43k 字节缓存读（命中后约按缓存价计）+ ~9k 新现场 + 输出；
  代价换来：agent 调用永远锚定整部正典（设计语气、命名、史诗口径统一），且缓存命中率预期 84–95%。
- 不做的事：不改 `.env`（`NEXUS_LLM_STREAM=1` 保持）、不动 Clash 代理、不给 provider 伪造缓存数字、不伪造 usage。

## 后果

- zh/en 全站文案：/insight 新增面板遵守 Insight 门面纪律（.insg-* 类、强制色彩、zh/en COPY、禁散 hex）。
- 新测试：`test_canon_digest.py`（4 条）+ 2 条既有测试按 §CACHE-2 改钉（system 全局恒定）；
  fe-gates 147/147、pytest 455/455、verify:world-bible 367/367、verify:bible-snapshot 一致——全部实测落账。
- 待办边界：跨项目 KV 复用仍受 ADR-0126 车道分桶约束；要不要全局单车道留作独立决策（涉及分发桶倾斜风险）。
