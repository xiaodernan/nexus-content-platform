# ADR-0168：真实 LLM provider 接入复核——零生产代码改动兑现 §160，判据从一次性 curl 升为三层可复检

- 状态：Accepted
- 日期：2026-11-12
- 关联：ADR-0010（DEMO MODE）· ADR-0123（六红线）· §76-79（Provider 可替换）· §159（禁假 AI）· §160（DEMO MODE 常驻）· §162（AI 作业管线）· `docs/evidence/ai-provider-live/evidence.md` · §AILIVE-1 (`909fdd0d`)

## 背景

用户为本轮提供真实 OpenAI 兼容 provider（`https://wkapi.pro/v1`，model `gpt-6-sol`），要求"真实跑通并测试功能"。
项目此前按 §160 常驻 `DEMO MODE`（`getAiCapabilities().live=false`），因为从未配置真实 provider。
并行会话已提交 `909fdd0d`（§AILIVE-1）完成主体接通：`.env` 真 key、`/healthz capability=real`、
`/v1/ai/run` 真生成一条、`apps/ai-service/.env.example`、evidence.md；但留下三处欠账：

1. `/v1/ai/chat`（§47 角色对话）那一寸未验，evidence 明写"仍欠"；
2. 根 `env.example` 仍写旧名 `OPENAI_API_KEY` / "ModelRouter"，与 `Settings` 实际读的 `NEXUS_OPENAI_*` 不符——**照它配会静默留 DEMO**；
3. `scripts/probe-provider.py` 被改到一半（工作树 M，加了 dotenv 回落），尚非可复检判据。

## 决定

### 一、接入层零改动——这是 §76-79 架构纪律的兑现，不是意外

复核确认：真实 provider 接通**不需要改一行生产代码**。`apps/ai-service` 已有完整可替换层：
`Settings`（只从进程 env 读 key，`__repr__` 脱敏）→ `Registry`（按 `has_llm` 决定 `real/unavailable`，
不把"没实现"说成能用）→ `OpenAICompatibleProvider`（纯 HTTP、无 SDK、带 `response_format=json_object`）。
web 侧 `getAiCapabilities()` 读 ai-service `/healthz` 的 `capability`，`real` → `live=true` → 首页
`data-ai-service="ready"` + `LIVE PROVIDER`。**key 只活在 ai-service 进程**，web 永不持有（docs/SECURITY.md）。
只需填 `apps/ai-service/.env`（.gitignore 隔离）与 `apps/web/.env.local`，即翻 LIVE。

### 二、判据从"一次性 curl"升为"三层可复检 harness"

`scripts/probe-provider.py` 收尾为三层判据，每层断言真契约、任一层失败非 0 退出（§159 不假绿）：

| 层 | 验什么 | 失败码 |
|---|---|---|
| L1 | direct provider `/chat/completions` + JSON mode 真返回可解析对象、model 回显、usage 有 token | 3/4 |
| L2 | ai-service `/healthz` `capability=real` + llm provider `status=real` | 5/6 |
| L3 | `/v1/ai/run`(dryRun) + `/v1/ai/chat`：`capability=real`、`usage.demoMode=false`、真 model/token、chat 非空 | 5/6 |

- **脱敏**：key 全程只显示 `***`；无 key → exit 2 并给出填充指引；`--direct-only` 只跑 L1（不依赖服务启动）。
- **可复检**：`python scripts/probe-provider.py` 一条命令复验整条真链路，可入 CI（有 key 时）。

### 三、修真洞：根 `env.example` 变量名漂移

把误导性的 `OPENAI_API_KEY` / "ModelRouter" 段改为指向权威 `apps/ai-service/.env.example` 的
`NEXUS_OPENAI_*` / `NEXUS_MODEL_*`，并显式警告"旧名不会被 `load_settings` 读取、静默留 DEMO"。
其它服务段（Spring Boot `DATABASE_URL`、storage `S3_*`）原样不动。

### 四、诚实边界（写进 evidence，不假装完美）

- 真 `/v1/ai/run` 在无设计文档/页面/pageId 时如实回 **0 补丁**——是诚实模型行为，不凭空编 op batch；
  完整视觉补丁仍取决于 prompt 管线。**后续口径更新（并行 `44bfc613` §AILIVE-2）**：web API 层的端到端
  live smoke 已真走通（`npm run live:ai-smoke -- --confirm-real`：`GET /` 签 CSRF → 注册 → 建项目 →
  `/api/ai/run` → real provider，HTTP 200 / capability=real / tokensIn=9217 / demoMode=false，默认不带
  `--confirm-real` 拒绝执行以防意外计费）；**仍欠**浏览器 UI 层真点流程（Studio→AI agent 的
  Run→Screenshot）、`/api/ai/jobs` 异步路径、以及"真出一个 op batch → 审批 → 落地"那一刀——
  即 API 链路活着 ≠ 视觉补丁生成能力已验。
- `/v1/ai/chat` 真生成时模型自称"我是小纳，GPT，由 OpenAI 开发"——**真 provider 接进 ≠ 角色人设稳**，
  system 提示对底层身份压制有限，属内容层 prompt 工程，非接入层缺陷。
- Image/Video/Speech 仍 `unavailable`；`costUsd=0`（计费未知，不造数字）；未 push。

### 五、证伪一次自我误判（不把猜测写进项目当真问题）

接手初用自由格式 prompt 要求类型化 JSON 被模型填 `null`，一度怀疑 `response_format=json_object`
语义漂移。L1 用标准 JSON mode（system 限定 + `response_format`）实跑稳定返回可解析对象。
**撤销该怀疑**：null 是内容层对该自由 prompt 的取值选择，JSON mode 本身完好。

## 验证

- 三层 harness 全链路 `ALL PASS`（`FULL_EXIT=0`）：L1 2561ms / L2 capability=real / L3 run 7459ms + chat 10630ms，均 `demoMode=false`。
- 无 key 降级：`NOKEY_EXIT=2` + 填充指引（诚实，不假绿）。
- **3 变异臂全 KILLED**：B（L2 期望 real→demo）越过 L1 后 exit6；C（L3 接受 demoMode=true）越过 L1/L2 后 exit6；
  D（L1 JSON 断言反转）exit4。第一版臂复制到无 `.env` 目录导致 exit2 假臂（未打到断言本体），已按 FE-16 S12 教训重做为显式注入 key、确认到达目标层再判 KILLED。
- 并行 FE-18 静态门 12/12、e2e 3/3 复验绿（本片不改 web 视觉）。

## 后果

- **正面**：§160 从"未配置所以 DEMO"变成"配置即真 LIVE"有了一条命令级可复检证据；`env.example` 旧名漂移这个会让人白配 key 的洞被堵；接入层再次证明无需为换 provider 改业务代码。
- **代价 / 后续**：probe 全链路要真花钱（每次 L1+L3 共 4 次 completion），故 CI 仅在有 key 时跑；
  角色人设、完整视觉补丁、真实计费是内容层/业务层欠账，各自另片；未 push。
