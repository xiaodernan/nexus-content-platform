# ADR-0275：问典走 StateGraph 管线（§GRAPH-1）—— StateGraph 第一次接进真实用户路径

## 状态
已实现并通过单测 + 一次真实 provider 实测（2026-11-17 · `canon-answer-graph.test.ts` 13/13 · 24/24 同组回归 · 实测证据 §PROVED-19）。

## 背景

用户长期指令：「别忘了用 stategraph 来优化项目，把它做进项目里面」。
本仓早在 ADR-0270 就把 LangGraph StateGraph 的核心语义（State + channel reducer + BSP super-step + recursionLimit + conditional edge）翻成 TS 落在 `@nexus/agent-runtime`，并有 11 个单测——但从来没有一条真实用户路径用过它（agents/runtime 的调用方只在 studio 任务流里，问典始终是单次 `chatWithCharacter`）。

export 出去当库 ≠ 做进项目。本 ADR 记录「把它接进真实用户路径」的决定。

## 决定

1. **问典（`/api/bible/q`）从单次 chat 改为 StateGraph 管线**（`apps/web/src/server/ai/canonGraph.ts`）：

   ```
   analyze（LLM · 短提示 · 不带 digest）
     → retrieve（纯算法：字符二元组 Jaccard + 锚句覆盖加分，top-3 段落）
     → draft（LLM · system=CANON_DIGEST 字节级稳定前缀，KV 命中与旧路径同源）
     → verify（机检·确定性：空答案 / 发明不存在的章回响 / 引用超界锚句 [n]）
          ├─ 通过 → finalize
          └─ 未用尽修订上限 → revise（LLM · system 不变 · user 带机检意见）→ verify
   ```

2. **analyze 不带 digest**：检索词抽取用短提示（约 300 tokens），避免两次 24k 前缀调用；
   draft/revise 的 system 仍是 `CANON_DIGEST`（`apps/web/src/lib/bibleAsk.ts` 单例，§CACHE-4 字节级稳定）。
3. **机检是机械判据，不是语义安全结论**：空答案 / 发明章回响（正典只有 5 章 + 36 回响，无 E37/第六章）/ 超界锚句编号。它拦不住「没依据但看起来对」的话，只拦住「结构性编造」。语义依据仍由 draft 阶段 pin 在 digest 上。
4. **usage 的缓存账只数 digest 绑定调用**（draft/revise）：analyze 是短提示不走前缀复用，
   把它的 0 计进 cachedTokens 会谎报命中率（§CACHE-3 同一条纪律：没报 ≠ 报了 0，不报的源头不该稀释账本）。
5. **analyze 失败不断链**：解析不出 TERMS 就退回问题本身的二元组检索；
   draft 失败才按 provider-unavailable 503 透传（§159，绝不用模板拼答案）。
6. **verify 每轮对当前 draft 重算**：旧一轮的机检意见不带进下一轮（否则合格的修订稿会被上一轮的影子判成 fail —— 单测抓到的真 bug，见 §GRAPH-1 的 "机检不通过 → revise → 再机检通过" 用例）。
7. **未采用 Python LangGraph**：venv 里临时装过后立即卸载。本仓已有的 TS StateGraph 是 ADR-0270 的决定，再引入一套 Python 图引擎只会让两条运行时各说各话。

## 代价

- 每次问典多一次 analyze 调用（~300 tokens，不走 digest 缓存，约 1–3s）。用户可见延迟增加。
- draft/revise 的 usage 口径与 web 旧路径一致，但 `tokensIn` 现在含 analyze 的少量输入（约 +300）。

## 后果

- 问典的 token 消耗与幻觉面都有了结构化回路：retrieve 给模型指路、verify 把「发明章回响」这类结构性编造拦下来。
- `agents/runtime` 的 StateGraph 从「有测试的库」变成「问典用户路径上的引擎」；后续（如 Studio 生成流程）可复用同一机制。
- 机检意见可继续增强（例如 style/verbatim 锚句逐字核对），下次迭代 E37 顺便做。
