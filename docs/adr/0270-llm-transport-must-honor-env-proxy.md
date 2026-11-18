# ADR 0270 — LLM 出站必须显式认环境代理：Client 的 env 代理挂载不覆盖自定义 transport

- 日期：2026-11-17（cont. 150）
- 状态：Accepted
- 关联：ADR 0127（StickyPromptCacheTransport）、ADR 0269（流式不是命中率低的证据）、ADR 0123（SSE / 非流分叉）
- 触发者：用户授权 2026-11-17 把 LLM 网关换成 `https://api.aizzz.xyz/v1`（model=`gpt-6.1-terra`，经本机 Clash Verge `127.0.0.1:7897` 出网），并要求用新 API 实测跑通

## 背景

`api.aizzz.xyz` 对中国大陆直连返回 HTTP 403「本站不对您所在的国家及地区进行商业服务」。
用户明确指示：本机有 Clash Verge，走它出网即可，"我保证这个 api 可以用的"。

接入后发现：
- 裸 `httpx.Client(base_url=...)` + 同机 `HTTPS_PROXY=http://127.0.0.1:7897` → **200**
- 裸 `httpx.Client` + 同机**无**代理 env（直连）→ **403**
- **provider 的内部 `_client` → 恒 403**

同一台机器、同一 URL、同一密钥、同一 body，唯一差别是 `httpx.Client` 是否传了自定义 transport。

## 根因

httpx 的环境变量代理（`HTTPS_PROXY`/`HTTP_PROXY`/`ALL_PROXY`，`NO_PROXY` 除外）只在 **Client 为自己构造默认 transport 时**通过 Mount/ProxyMap 落实；
一旦调用方传入自定义 `transport=`（`StickyPromptCacheTransport` 就是这个角色），Client 不再为它挂载代理，直连出站——在本例里即被地理拦截。
曾误导排查半小时的现象：同一 key、同一 URL，打一百次一百次 403；而 fresh client 一百次里 80%+ 200。

## 决定

1. `StickyPromptCacheTransport` 默认内层 transport（`_default_inner()`）**显式读取环境代理**并构造 `httpx.HTTPTransport(proxy=...)`：
   `HTTPS_PROXY` → `https_proxy` → `HTTP_PROXY` → `http_proxy` → `ALL_PROXY` → `all_proxy`，取第一个非空值；未登记代理时退化为零回归的 `httpx.HTTPTransport()`。
2. `NO_PROXY` 无法在 transport 构造期按目标主机粒度豁免（transport 看不到 base_url）。本进程唯一出站口就是 provider 网关，把代理给它是显式意愿；
   需要按主机豁免时，调用方显式传 `inner=`（如 `StickyPromptCacheTransport(inner=httpx.HTTPTransport())`）。
3. 不在代码中硬编码任何代理地址；Clash Verge 端口（7897）只存在于用户本机 `.env`（gitignored）。

## 实测（2026-11-17，Clash Verge 7897）

- `POST /v1/ai/run`，`dryRun: true`（全链路：web 契约语义 → ai-service → Redis → gpt-6.1-terra）：
  - 首个真调用：tokensIn 6712 / cached **5248（78.2%）** / provider-reported 是（cacheReported=true）/ latencyMs 3281
  - 冷 prompt 变体（fresh e2e marker）再次真调用：tokensIn 6726 / cached **6528（97.1%）** / latencyMs 5016
- 应用级 completion cache 复用（同 request）：`cachedTokens=6712`、latency 0–15ms
- `/v1/ai/design-graph`，同 body：200，`x-nexus-orchestration: stategraph` 响应头正确（StateGraph 编排，响应体与 execute_ai_request 逐字节同构）
- UI 侧 healthz：`capability: "real"`（注意：此读数仍是**配置形态**推断，不是一次真调用；§59 的语义硬化见「后续」）

## 后果

- 代理环境下新 provider 真链路打通；缓存命中率（provider-side sticky prefix）实测 78%→97%。
- 无代理报错场景仍会 403（直连被拒），报文映射为 ProviderFailed(401/403)——这是如实的外部语义，不掩盖。
- 任何回归在自建 `inner=` 注入下都可隔离本装饰器行为；`test_sticky_prompt_cache.py` 全套（含既有 MockTransport 臂）86/86 绿。

## 后续

- `/healthz` 的 `capability: "real"` 仍是「有 key」的配置推断，不是活探针。**cont. 151 已兑现为新增字段 `llmLive: { state, reason, probes }`**（additive、schema 默认 null）：探测只打真网关的内层 provider；unknown ≠ 可用；测试桩不触发探测；`test_llm_liveness.py` 12 臂；health.schema.json 按 zod 单一真值重导出，web 侧消费向前兼容。
- `NO_PROXY` 按主机豁免（放到 `_build_llm`：读 base_url host 与 no_proxy 列表做匹配再决定是否传 inner）。
- Clash 出口节点质量观察到间歇性 `httpx.ConnectError: EOF occurred in violation of protocol`（HTTPS 握手被节点强断）；
  已有 `NEXUS_LLM_MAX_ATTEMPTS=3` + backoff 兜底，live 复测中 10/10 成功；与本解耦。
