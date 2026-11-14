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

## 追加复核 §AILIVE-1b/1c/1d（同日，接手并行切片）

并行会话交付 `909fdd0d` 后，接手方独立复验并补齐三处，不 rewrite 上文：

1. **独立复跑 `/v1/ai/run`（design-generate / dryRun）** —— 又一次 200 / `capability=real` /
   `gpt-6-sol` / tokensIn=6611 tokensOut=124 / `demoMode=false`。模型对"没有设计文档/页面/pageId
   就造一个居中标题"如实回了 **0 个补丁** + 理由"当前没有提供设计文档…无法创建"。
   这是**诚实模型行为**（不凭空编 op batch），也实证了上文"完整视觉补丁取决于 prompt 管线"的边界。
2. **补 `/v1/ai/chat` 那一寸**（上文仍欠、本次补上）—— system="角色小纳" / user 自我介绍：
   200 / `capability=real` / `gpt-6-sol` / tokensIn=868 tokensOut=560 / 3995ms / `demoMode=false`，
   回真实中文角色文本。**诚实边界**：模型自称"我是小纳，GPT，由 OpenAI 开发"——真 provider 接进
   ≠ 角色人设稳，system 提示对底层模型身份的压制有限，属内容层待优化，不假装完美。
3. **三层可复检判据 `scripts/probe-provider.py`（收尾半途 M 文件）** —— 从单层一次性 probe 升级为
   三层 harness：L1 direct provider JSON mode / L2 `/healthz` capability=real / L3 `/v1/ai/run`+
   `/v1/ai/chat` 契约 + `demoMode=false`。**脱敏**（key 只显示 `***`）、**无 key exit 2**、
   网络错 exit 3、契约违约 exit 4/6。全链路实跑 `ALL PASS`（L1 2561ms / L3 run 7459ms chat 10630ms）。
   根 `env.example` 同步修正旧名漂移（`OPENAI_API_KEY` → 指向 `apps/ai-service/.env.example` 的
   `NEXUS_OPENAI_*`）——照旧名配会 `has_llm=false` 静默留 DEMO，是真洞。

**证伪一次自我误判**：接手初曾用自由格式 prompt 要求 `{"real": true, ...}` 被模型回成
`{"real": null, ...}`，一度怀疑 provider 的 `response_format=json_object` 语义漂移。三层 harness 的
L1 用**标准 JSON mode**（system 限定 only-JSON + `response_format`）实跑，稳定返回
`{"ok":true,"origin":"nexus probe"}` 并可 `json.loads`。结论：JSON mode 本身完好，先前的 null 是
**内容层对该自由 prompt 的取值选择**，不是模式缺陷——据实撤销该怀疑，不写进项目当真问题。

**判据有牙（3 变异臂，全 KILLED）**：B 把 L2 期望 `real→demo` → 越过 L1 后 L2 FAIL exit6；
C 把 L3 接受 `demoMode=true` → 越过 L1/L2 后 L3 FAIL exit6；D 把 L1 JSON 断言反转 → L1 FAIL exit4。
臂脚本显式注入 key 确保打穿到被测断言本体（第一版复制到无 `.env` 目录导致 exit2 假臂，已弃用重做——
沿用 FE-16 S12 教训：臂必须先证明确实到达目标断言，再谈 KILLED）。

**仍欠（不编造）**：① 真业务链 Studio submit → 真 op batch → 审批 → 落地仍未走；② 角色人设对
底层模型身份的压制是内容层 prompt 工程，非接入层；③ 成本 `costUsd=0`（计费未知，不造数字）；
④ Image/Video/Speech 仍 unavailable；⑤ 未 push。key 仅在 `apps/ai-service/.env`（.gitignore 隔离），
本证据与所有提交文件均不含 key 原文。
