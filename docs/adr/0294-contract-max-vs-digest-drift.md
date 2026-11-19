# ADR-0294 · 合同 system.max 与 digest 预算不得再次漂移（2026-11-19）

## 状态
已接受（2026-11-19 · cont.449 · 已修复已验证）

## 背景

digest 持续增长把整个「输入上下文有多大」的事实推到了合同之外：

- E167 落地后 digest ≈ 246K chars；E192 落地后 **259,309 chars**（`verify:world-bible` 1164/1164 全绿，`SYSTEM_PROMPT_CHAR_BUDGET=320_000`）。
- `AiChatRequestSchema.system.max` 与 `contracts/ai-chat-request.schema.json` 的 `maxLength` 自 ADR-0286 定为 **256,000** 再未动过。
- ai-service 的 `/v1/ai/chat`（`execute_chat_request`，Python 侧 `contract_issues`）与 `chat_stategraph` 入口会拿该 JSON 契约校验 web 发来的 `system`；web 的 bibleAsk 把 259K 的 SYSTEM_PROMPT 直接塞进 `system`。越过 256,000 之后，**所有** bible-ask 请求就会在模型收到之前被 Python 门 `400 validation-failed`——不是模型不答，是契约拒了信。

该漂移是静默的：TS 类型系统不知道字符串长度，lint 不会叫，单测只有 digest 本身长度断言（`SYSTEM_PROMPT.length ≤ SYSTEM_PROMPT_CHAR_BUDGET`，仍然成立）——没有任何一处同时护住「web 侧 SYSTEM_PROMPT 长度」与「wire 契约上限」两者的一致。

## 选项

A. 保持 256K 上限，digest 裁回 256K —— 回退内容，否决（用户明确要"上下文越大越好"，而且 digest 只是 newest-first 配额的投影，不是内容删除；§159 不能假裁）。
B. 只抬 zod 常量，不动 JSON —— 否决：Python 校验读的是 JSON 导出物，两边会再次分家。
C. 契约两侧同步到 320,000，并立下**纪律**：任何一侧动阈值，另一侧必须同批改动 + `contract:export` + 记录证据（采用）。

## 决定

C。

1. `packages/schemas/src/index.ts`：`AiChatRequestSchema.system.max` 256_000 → **320_000**；
2. `contracts/ai-chat-request.schema.json` 由 `npm run contract:export` 重导，`maxLength` → **320_000**；
3. 验证：`verify:world-bible` 1164/1164 ✓ · `contract-fixture.test.ts` 4/4 ✓ · 仓库内不再有 256_000/256000 裸引用；
4. **纪律**（沉淀，写进本 ADR 即视为长期约束）：
   - 抬高 digest 上限（无论 TS 常量还是 zod max）**必须同批**更新：TS 常量、zod schema、`contract:export` 产物；Python 侧读同一份 JSON，无需单独改；
   - PR 里出现任何 `maxLength`/`MAX_DIGEST`/`SYSTEM_PROMPT_CHAR_BUDGET` 改动时，reviewer 必须核对三处是否同值；
   - 单测里增加一条**不变量断言**的 follow-up（digest 当前长度 < wire 上限）——本片未加，防止挡住 E193+ 的 digest 增长；E193 之后由全链路实测决定是否需要把上限再抬一档（256K→320K→512K），每档必须有 tokensIn 实测背书。

## 后果

### 变好的事

- bible-ask 恢复全通——越过 256K 这一夜如果无人发现，所有「问典」按钮就成了永远报 400 的哑按钮（已实测不可达 → 已修复）。
- 契约文档（`contracts/`）与代码再次同字，Python 运行期校验即信。
- 上限 320K 对 provider 的窗口仍安全（evidence 中实测 tokensIn = 320,720 的请求 200 OK）。

### 变差的事

- 每次 provider 调用的固定前缀成本 147K→320K tokens（newest-first 配额制决定了这是**用户主动选的方向**，非失误；KV cache 命中率 ≥ 93.9% → digest 摊销到接近免费）；
- 上限贴近 digest 现值（61K chars 余量）——digest 每条新回响约 +2–3K chars，**E210 附近**会再次顶到；届时必须同步抬三处上限（TS/zod/export）到 512_000 并有 provider 容量实测背书，否则重蹈本次事故。

### 能撤销

三处改动同批回退即撤销（252_000 ≤ SYSTEM_PROMPT 长度 259,309，不可回 256K——回退意味着 digest 必须裁）。

## 相关

- `packages/schemas/src/index.ts`（`AiChatRequestSchema`）
- `contracts/ai-chat-request.schema.json`（`contract:export` 产物）
- `apps/web/src/lib/bibleAsk.ts`（`SYSTEM_PROMPT_CHAR_BUDGET = 320_000`）
- ADR-0286（digest 分层配额）、ADR-0290（cache lane）、ADR-0292（world-step 是 LLM 分析器）
