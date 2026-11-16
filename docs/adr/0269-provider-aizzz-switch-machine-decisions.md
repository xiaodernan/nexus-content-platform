# ADR-0269：provider 切换到 aizzz.xyz gpt-6.1-terra 的四条环境决定（2026-11-16）

## 状态

已决定并实测（本机实测数据见 `docs/evidence/provider-aizzz-switch-2026-11-16.md`）。

## 背景

用户 2026-11-16 提供新的、可用的真实 provider（Superseding wkapi.pro 线）：

- key 走 `apps/ai-service/.env`（gitignored），本文与任何 tracked 文件**不写 key**；
- 模型：`gpt-6.1-terra`；请求地址必须带 `/v1`；
- 用户随后明确：出口流量必须走本机 **Clash Verge**（`127.0.0.1:7897`），否则被该服务拦截（实测直连 HTTP 403，经代理 HTTP 200，证词一致）。

## 决定

1. **非流式为本机默认（`NEXUS_LLM_STREAM=0`）**。流式 SSE 经 Clash Verge 静态节点返回 `ConnectError EOF occurred in violation of protocol`（服务侧把同一路线如实报成「流式 403」）。aizzz.xyz 这台机器上「流式胜出」不成立；wkapi.pro 时代 `llm_stream=True` 的实测优于这里的非流式。
2. **`prompt_cache_key` 保留 `nexus-studio`**（4224–4992/5228 前缀 ≈ 95.5% 缓存命中实测，两次对照都成立）。缓存 key 构造与进程内 single-flight、`NEXUS_LLM_STICKY_CACHE_KEY=1` 不动。
3. **embedding 即 `none`**：本 provider 直接 `503 model_not_found`，没有提示词 embedding 渠道。RAG 的 vector 泳道保持 `vectorAvailable=false` 如实报，不假装。
4. **`NEXUS_LLM_MAX_ATTEMPTS=3`**（退避重试，瞬时 429/5xx/网络抖动）。本路径瞬时失败率 ~20%（8/10 成），retry 是正确取向；deterministic 4xx（401/403/400）仍不重试，重试只买瞬时抖动。

## 后果

- 任何人启动本地 AI service 前，先确认 `127.0.0.1:7897`（Clash Verge）在线；直连 aizzz.xyz 会 403。
- 换回 wkapi.pro 或其它 provider 时，把 `NEXUS_LLM_STREAM` 按那个 provider 的实测重新决定，不要照抄 `=0`（wkapi.pro 实测流式胜出）。
- `/admin/savings` 的「缓存命中率」口径不变（usage.cached_tokens / tokens_in），只换了来源 provider，报表无需改代码。
- ENVIRONMENT.md 增补：本机 aizzz.xyz 必须经 Clash Verge 出网；EMBEDDING=none；`NEXUS_LLM_STREAM=0`。
