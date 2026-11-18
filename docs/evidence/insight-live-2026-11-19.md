# §VERIFY-INSIGHT-LIVE · 观察哨⑧ 大模型解读 · 真实 LLM 全链路活证据 + Sticky Lane 出站审计 — 2026-11-19

环境：web dev 3100 · ai-service 8001（provider=real · gpt-6.1-terra · 流式 ON · sticky per-lane）· Clash Verge · `nexus-postgres-alt` 正常运行。

## 一、粘性车道出站审计（§CACHE-6-AUDIT · 代码级）

要求：确认所有对 aizzz/兼容网关的出站请求都走 `StickyPromptCacheTransport`。

| 出口 | 覆盖 | 证据 |
|---|---|---|
| ai-service `providers/openai_compatible.py` | **是** — registry 注入 transport（HTTP/SSE 两条 body 构造共用） | `registry.py:93` `llm_sticky_cache_key` gate；`sticky_prompt_cache.py:34-236` |
| ai-service 内其余 httpx/aiohttp | 无 — 仅此一个 OpenAICompatible 客户端构造 httpx.Client | grep `import httpx` 在 src 下的命中只有 `sticky_prompt_cache.py`(注入点) + `providers/openai_compatible.py`(唯一出站) |
| web → provider | **无直连** — web 仅 fetch ai-service（`/v1/ai/chat`·`chat-graph`）；`server/ai/embedding.ts` 的 OpenAIEmbedder 无 key（nvidia embed 端点无 embedding 模型 → 运行期未启用，healthz：`NEXUS_MODEL_EMBEDDING=none`） | grep `aizzz.xyz|api.openai.com` in apps/web → 仅 embedding.ts 默认值（未启用） |
| embedding / rerank 模型 | aizzz 网关无 embedding 模型，`NEXUS_MODEL_EMBEDDING=none`，未启用 | healthz providers 段：`embedding: unavailable ("NEXUS_MODEL_EMBEDDING=none")` |

**结论**：没有任何绕过粘性车道的 LLM 出站路径。并行会话打的是一条 lane（`nexus-<sha256(system)>`），互不污染。

## 二、⑧「大模型解读（潮汐模型现读）」浏览器直测

解锁口令 123（公共，公开）后点击「让大模型看看这些数字」，页面回显：

- badge：`gpt-6.1-terra · cached 7191 tokens`
- 正文（逐字转录）：

> ① 现象：增长目前最受限于有效访客不足；总打开量看似可观，但大多来自机器人。 ② 证据：近 30 天打开 757 次，其中机器人打开 660 次；机器人占比 87.2%。互动率为 2.9%。 ③ 动作：在本站发布作品页增加"真人打开"统计，并按真人打开数排序公开作品列表，减少机器人流量对曝光排序的干扰。以机器人打开占比下降、公开作品获得更多真人打开作为成效信号。

- 机检：`机检通过（现象/证据 + 数字，三段式）` — verify 节点 PASS（数字三段式约束满足）。
- 数字是 DB 实时聚合（3,435 账号 · 2,227 游客 · 1,315 项目 · 140 发布 · 267 AI 调用/30d）→ **{aggregate-only 直达模型} · 无个人字段**。

## 三、⑧ 的建议本身（做了什么？为什么这条值得做）

模型自己指出的瓶颈：**87.2% 打开是机器人**（660/757）——这是真的账，不是编的：DB 的 botOpens 列就是 Cloudflare/指纹爬虫判定落库。模型给的动作可落地的：作品公开列表按「真人打开」排序 + 再降 bot 占比。

> 这条建议涉及真机排序逻辑，落地需要 review 页面排名。记录在 §INSIGHT-BOTS 条目，下一片实现。

## 四、check：StateGraph 复用

`runInsightAnalysisGraph` = draft → verify → (revise → verify) → finalize（`insightGraph.ts`）；本轮 cached 7191 = 冷 lane（digest 潮沙盘拿到 KV 侧 7K 级“prefix 中文字符已被缓存”第一梯队，与 cont.373 seq-1 同型）；热 lane 稳态请见 §PROOF-V992。
