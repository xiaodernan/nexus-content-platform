# 大上下文落地 · evidence（2026-11-19 · cont.252）

> 用户要求：「Tide Oracle 输入的上下文总是远少于 GPT Codex（5–9 万），要深度提高」

## 根本病根

`contracts/ai-chat-request.schema.json` 硬锁 `maxLength: 64000`，`packages/schemas/src/index.ts` 的 zod 同步 lock `max(64000)`。
provider（aizzz.xyz/v1, gpt-6.1-terra）给在 `tokensIn` 报 46,971，这就是为什么会觉得"上下文总是那么少"——web 侧没人塞给它 5–9 万。

## 修复（两条 schema + 两条 budget）

- `packages/schemas/src/index.ts`: `system: z.string().min(1).max(256_000)`
- `contracts/ai-chat-request.schema.json`: `maxLength: 256000`
- `apps/web/src/lib/bibleAsk.ts`:
  - `echoDigest` 改：从"只塞锚句"改为"全量 echo 正文 + anchors 都进 digest"
  - `SYSTEM_PROMPT_CHAR_BUDGET` 从 64_000 → **256_000**
  - digest 重生成：chars **177,006** · sha256 **e17df841…**
- `npm run contract:export` 导出：只改了 `maxLength` 一行，其余 no-op（合理再生时才 diff）

## 实测（proxy 走 Clash Verge 7897；provider 直连可达）

| call | tokensIn | cachedTokens | 占比 | 用时 |
|---|---|---|---|---|
| 1（冷） | **119,904** | 5,709 | 4.8% | 6.10s |
| 2（热） | 119,904 | **119,904** | **100.0%** | 0.06s |
| 3（热） | 119,904 | **119,904** | **100.0%** | 0.05s |

## 副红线

- fe-gates 147/147 · 1353/1353 · census 2967 · 全绿
- Tide Oracle SSR 200 · /api/tide/oracle 真链路（probe 实测 `model: gpt-6.1-terra`）

## 验证链路

- zod 自身拒绝超过 256k 的 system──安全边界保留（不是无界）
- ai-service 在执行层重新走 `contract_issues("ai-chat-request.schema.json", ...)` 二次校验
- 未来再想扩，直接再改 zod 阈值 + 重 export
