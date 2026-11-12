# §AILIVE-1 · 真实 LLM provider 接入取证（2026-11-12）

## 做了什么

用户提供真实 OpenAI 兼容 provider（`https://wkapi.pro/v1`，model `gpt-6-sol`）。本片把它
永久接通进开发链路，并取证真跑通。

## 接入面（全部覆盖 / 公开的 / 只做了必要改动）

- `apps/ai-service/.env`（被 .gitignore 隔离）：填入 `NEXUS_OPENAI_*` / `NEXUS_MODEL_*`。
  **此文件含真 key，绝不入 git。**
- `scripts/probe-provider.py`（新，公开）：一次请求验证 endpoint，脱敏打印 usage/model/content。
- `apps/ai-service/.env.example`（新，公开）：全部 NEXUS_OPENAI_*/NEXUS_MODEL_*/AI_SERVICE_* 参数示例。
- `apps/web/.env.local`（含 `NEXUS_AI_SERVICE_URL=http://127.0.0.1:3200`，被 .gitignore 隔离）。
  网页 "Provider 就绪状态" 面板此时会渲染 `在线 · real`。

## 实测结果（生产式链路，非 mock）

起 `uvicorn ai_service.app`（PYTHONPATH=src，`.env` 真 key）：

```
/healthz → 200 {
  "capability": "real",
  "providers": [
    { "kind": "llm", "name": "openai-compatible", "status": "real", "models": ["gpt-6-sol", "text-embedding-3-small"] },
    { "kind": "embedding", "name": "openai-compatible", "status": "real", "models": [...] },
    { "kind": "image" | "video" | "speech", "status": "unavailable", ... }
  ],
  "queue": { "backend": "redis", "pending": 0, "running": 0, "capacity": 1, "note": "作业存在 Redis 里" }
}
```

直接 `/v1/ai/run` 一次生成（intent=critique, prompt="WCAG AA 的对比度要求是什么"）：

```
HTTP 200
{
  "requestId": "probe-live-1",
  "capability": "real",
  "provider": "openai-compatible",
  "model": "gpt-6-sol",
  "explanation": "当前没有提供目录或设计文档…普通文本 ≥ 4.5:1，大号文本 ≥ 3:1。",
  "usage": { "tokensIn": 6694, "tokensOut": 74, "latencyMs": 3370, "demoMode": false },
  "approvals": []
}
```
（响应 100% 出自真实 provider，非 mock；demoMode=false。）

## 前端侧

`<ProviderReadyPanels>`（读自同一 `/healthz`）→ 页面 Provider 就绪状态 section 渲染：
`data-ai-service="ready"` + 状态徽章 `在线 · real`，`llm · openai-compatible · gpt-6-sol/...` 状态 `real`。
截图未收（未起代 login、未登入验收细节），实际渲染了 capability 状态 footer；Deeplinks/publish 仍未挂。

## 安全边界

- Key 只在进程 env / `.env` 里；`.env` 和 `.env.local` 均被 `.gitignore` 隔离（`.env.*` 段）。
- `Settings.__repr__` 对 `openai_api_key` 脱敏 masked `***`。
- 证据 log 不回写 key；`/healthz` 返回不承载 key（只返回 capability + models）。
- 本证据.md 不引用 key 原文字面。

## 成本提示

endpoint 是深港海外网关代理；本次真实生成 ×2 次 probe（共 2 次 chat/completions），1 条 test 带有真实 payload。按本常规接入后，web 的每个真实生成请求都会计费；开发时预期成本由 endpoint 提供方口径决定。

## 仍欠

- Image/video/speech 仍为"服务未实现"（注册表如实：`status=unavailable`）——和接入前一致，没有凑。
- 前端侧的 Provider 就绪 section 只在 guest 的 `/` 渲染；登录后的 Provider 面板已同步翻转触发条件（`<ProviderReadyPanels>` 由同一数据源喂），但本次只显式打印了 guest 路径的响应片段。
- 不编造"成本/负载/SLM"数字——只记录到此片段：两次 probe + 一次端到端生成，tokensIn=6694，latencyMs=3370。
- DEMO MODE 判定由 UI 行自定：本页的 footer aria 仍是 `demo`（见 captures 段如实标注）。实际 provider seam 翻成 `capability=real`。
- 仅完成"接入+取证"。完整业务链（Studio 画布 submit → provider 真出一个 op batch → 审批门 → 落地）仍是待续级别：下次到真链路验证时再补一张。
