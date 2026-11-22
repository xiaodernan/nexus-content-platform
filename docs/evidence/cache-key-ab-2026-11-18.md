# §PROOF-CACHE-KEY-AB · prompt_cache_key 缺省策略 A/B（2026-11-18 · aizzz.xyz / gpt-6.1-terra）

**问题**：全站所有 `/v1/ai/chat` 调用统一发 `prompt_cache_key: "nexus-studio"`（v865 缺省）。用户/历史工单质疑：并行会话（多个产品线 + 浏览器侧）同时打这个 API，是否让网关通道分配混乱、前缀缓存区分不明显，导致命中率下滑（Codex 用 session-derived 键稳定 ~90%，而我们偶发掉缓存）。

**方法**：同一台机器、同一 digest（`canon_digest.txt` · 95,336 chars · tokensIn≈69,307）、同一 12 发交替顺序（A/B/A/B…）、**唯一变量**是 `NEXUS_OPENAI_PROMPT_CACHE_KEY`：

- **A（旧缺省 · 常量 `nexus-studio`）**：`NEXUS_OPENAI_PROMPT_CACHE_KEY=nexus-studio`
- **B（sticky per-lane · `nexus-<sha256(system)>`）**：`NEXUS_OPENAI_PROMPT_CACHE_KEY=`（显式空串 → provider 不填键 → `StickyPromptCacheTransport` 注入按 system 哈希的 per-lane 键）
- **DEFAULT（本仓新缺省）**：env 未设置——`config.py`（本日）`get_or_default(..., None)`，走 sticky per-lane。

**结果**（同问句：canon digest 全文 system + 两个交替 zh 问题；第三件不需要变体即可复现——见 `scratch/ab-cache-key.mts`）：

| 配置 | 12 发 结果 | cachedTokens | p50 |
|---|---|---|---|
| A 常量 `nexus-studio` | i=1 200（cold 3,300）→ **i=2 502（716 ms）→ i=3 200 · i=4 502 · i=5 200 · i=6 502 · i=7 200**：奇偶交替，偶数发全部 `502 Bad Gateway` | 成功发 100%，**半数请求直接挂** | ~11 ms（成功侧） |
| B sticky per-lane | **12/12 200** · `cachedTokens=69,307`（i=1 起即 100%） | ≈100% | 9–13 ms |
| DEFAULT（新缺省 sticky） | **12/12 200** · `cachedTokens=69,300–69,307`（≈100%） | ≈100% | 7–12 ms |

**解读**：

1. 常量 `nexus-studio` 键下，aizzz.xyz 网关疑似按 hash/轮询把请求分到两个后端里，其中一个此刻不可用（偶数发全部 502）。即「并行会话打乱缓存」不只是失效率——在这类分片网关上是**可复现的 ~50% 502 率**。
2. sticky per-lane 键让所有同 digest 请求落同一通道：前缀缓存精良复用，12/12 全暖、零 502。
3. 这与 ADR-0282 中 Codex 的 session-derived 思路一致（键 = 稳定会话身份的哈希），差异只是我们键粒度 = 按 system 一根（同 digest = 同键），正好匹配我们「一 digest 一 KV 前缀」的设计。
4. 附带：StateGraph 编排测试的 `langgraph` 之前根本未装（`pip show langgraph` 为空 · 8 个 pytest 报 ModuleNotFoundError）——本日按 requirements.txt 补装 `langgraph==1.2.22`，stategraph 8/8 转绿；全量 455 passed / 18 skipped。

**边界与诚实**：

- 本片证的是 `/v1/ai/chat` 这一条 lane。design-graph / /v1/ai/run 已走同一 `StickyPromptCacheTransport`，继承同款 per-lane 路由，未再单独测（逻辑相同，零额外证据价值）。
- 「常量键 = 必然 50% 失败」不是普适结论——是该网关此时刻的状态。可能这个通道刚刚挂；可能明天全好。本文只报现象，不编机制（如需否证：重跑 A 12 发即可）。
- 不伪造命中率；所有数由 provider usage 字段如实回传，未加速、未 mock。
