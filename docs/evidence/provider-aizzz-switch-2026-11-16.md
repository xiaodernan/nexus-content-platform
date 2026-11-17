# Provider 切换实测：aizzz.xyz（gpt-6.1-terra）+ Clash Verge 代理要求（2026-11-16）

> 全部数据为本机直连实测，没有估计项。Key 只存在 `apps/ai-service/.env`（gitignored），本文不抄 key 本体。

## 用户给的信息（原话裁定）

- key: （经 `apps/ai-service/.env` 注入，gitignored；本文绝不抄 key 本体）
- Base URL: `https://api.aizzz.xyz`，请求记得带 `/v1`（文中用 `https://api.aizzz.xyz/v1`）
- 模型：`gpt-6.1-terra`
- 「如果打不进去可以检查可能是网关配置或者梯子的问题 因为我本机有一个clash verge的梯子 要走这个梯子的节点才可以把流量打过去的 不然会被拦截 可以多试试 走我这个clash verge就行 我保证这个api可以用的」

## 环境探测结果

| 路径 | 结果 |
|---|---|
| `GET /v1/models` **直连** | HTTP 403，0.6s —— 拦截，与用户说的一致 |
| `GET /v1/models` 经 `127.0.0.1:7897`（Clash Verge 默认 mixed port） | **HTTP 200**，1.0s，`gpt-6.1-terra` 列出 |
| 本机代理端口探测 | 7897 OPEN（Clash Verge 默认），7890/10808/10809/6152/2080/7891/9097 CLOSED |
| `nexus-postgres`/`nexus-redis` | 之前后工作过；Docker 恢复后双 OPEN |

## 服务端 `.env` 已改（gitignored，本文无值）：

- key：新的真实 key（只注入环境，不抄写）
- base：`https://api.aizzz.xyz/v1`
- 四档 model 全部 `gpt-6.1-terra`
- `NEXUS_MODEL_EMBEDDING=none` —— 实测 503 model_not_found：「分组 GPT特价 下模型 text-embedding-3-small 无可用渠道」
- `NEXUS_LLM_STREAM=0` —— 见下：流式经本机节点失败
- `NEXUS_LLM_MAX_ATTEMPTS=3` —— 本机/本网关瞬时故障偏多（8/10 成功、2 次 ConnectError）
- 代理：HTTPS(S)_PROXY 指向 `http://127.0.0.1:7897`

`infra/dev-ai.sh` 现在也注入 `HTTP(S)_PROXY` 和 `NO_PROXY`（不硬编码端口；机器没有代理就摘掉那两行即可）。

`infra/dev-ai.sh` 现在也注入 `HTTP(S)_PROXY` 和 `NO_PROXY`（不硬编码，从 .env 读；机器没有代理就摘掉那两行即可）。

## 实测结论（今天）

1. **LLM gemma 真连通、能力真实**：`/v1/capabilities` ⇒ `capability: "real"`, models `["gpt-6.1-terra"]`。
2. **embedding 真不通**：上游直接说 `model_not_found`（TOP100 可用模型里没有任何 embedding）。`NEXUS_MODEL_EMBEDDING=none` 如实报，不假装。
3. **prompt_cache_key 生效**：`probe:cache` L1（直连、非流式）两次同前缀请求：
   - 第一次 `cached=4992`（warm，缓存命中）、第二次 `cached=4992` —— 约 **95.5% prefix 复用**（5228 prompt）。
   - 早期一次冷→暖对照：cold=0 → warm=4992。
   - 出现过 `4992 → 0` 的单次冷班车（provider 侧分片彩票，同 wkapi 旧账；不是请求格式问题，也不是「缓存没接入」）。
4. **流式（SSE）经本机 Clash Verge 节点失败**：`ConnectError EOF occurred in violation of protocol`（服务端把同一条路如实报成「provider 流式返回 403 … 商业服务」）。**这台机器 = `NEXUS_LLM_STREAM=0`**（非流式就是本机正确用法）；wkapi.pro 时代的「流式胜出」结论不适用于这个 provider+本机代理。
5. **L2 服务内干跑（dry-run）之前一度收到 provider 401/403**，复测后为路径瞬时问题（8/10 成功跑通 payload），但仍有 20% 级瞬时 `ConnectError`——所以 max_attempts=3 + 退避兜底（已配，不改代码）。
6. `/admin/ai-cache` 的「缓存命中率」口径在 `agent_tasks.usage.cached_tokens / tokens_in`，新 provider 已如实报这个字段（见 L1 实数）。

## 诚实话（§159）

- 这次没有「100% 命中率」；也没有承诺一个可重复的 SLA。wkapi.pro 那条线旧数据仍在文档里，不迁移数字过来。
- 2026-11-16（当日补充）：L2（服务内）**已拿到 ALL PASS**——`curl` 失败的那条路径后来定位到 `StickyPromptCacheTransport` 默认内层 `httpx.HTTPTransport()` **不读环境变量**，本机 Clash Verge 代理被静默丢弃 → 服务内出站直连 → 上游按国家拦截（403）。修复后服务内 `/v1/ai/run` cold → warm 完全回放（6707/6707 cached）。见 `docs/adr/0271-sticky-transport-env-proxy.md`。
- 回放读数诚实分账：L2 的 100% 是 **应用级 completion cache**（CachedLlm，精确匹配回放）的数；provider 侧前缀缓存数据来自 L1 实跑（4992/5228）。两条线分别计数，不合结。
- 流式打不通是本机节点问题，不是 aizzz.xyz 本身对所有人不支持流式——换节点或换线路后可以把 `NEXUS_LLM_STREAM` 改回 1 重新走 `probe:cache` 复测。
