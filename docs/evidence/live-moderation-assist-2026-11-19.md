# Live evidence — 复核助理（§MODERATION-ASSIST）2026-11-19 · cont.239

> 给人工复核员的「AI 帮我读一眼」——只读、只参考、不裁决、不替你按下「放行/拒绝」。
> 每一句都锚定 finding 的原文片段；provider 不可用 → 409 DEMO MODE，不冒充。
> 失败路径 403（没登录/非 admin）/ 429（限频）/ 404（案子已被裁或不存在）/ 502（模型回吐太短）原样透出。

## 交付

- `apps/web/src/server/domain/moderationAssist.ts` — 中/英双语 system prompt（纪律：每句锚定 finding 的 rule/id 原文；不给结论、不评论作者、不编造 finding、盲区诚实说不确定）
- `apps/web/src/app/api/admin/moderation/assist/route.ts` — POST：role=admin 门 → CSRF 双提交 → 每 IP+admin 30/h → listReviewQueue(50) 找到案子（不看更多隐私）→ caps gate（DEMO=409）→ 单次 `chatWithCharacter(balanced)` → `{ advice, model, cachedTokens, tokensIn, cacheReported }`
- `apps/web/src/components/ModerationAssist.tsx` — client 组件，每案一颗按钮；honest/OK 状态各自明确；**不替代 ResolveButtons**；数据属性 `data-moderation-assist-*`
- `apps/web/src/app/admin/moderation/page.tsx` — 每案 card 在 ResolveButtons 前注入 `<ModerationAssist/>`（SHA 重钉 `a19bc8d1…`）
- `apps/web/src/server/observability.ts` — 新增 `nexus_moderation_assist_total` / `nexus_moderation_assist_latency_ms` 两个真表（counter + histogram）
- `.moderation-aidr*` ×14 条 CSS（forced-colors 收口、零 hex、全 var()）
- fe-gates 147/147 · 1353/1353 · census 2966 · build 绿（`/api/admin/moderation/assist` 入产物）

## 线上实测（本机 next start :3461 · 真 provider · 真 admin 会话）

| 次 | 对应 | 输出 |
|---|---|---|
| 1 | blocked case `a2da7929…`（redline.minor_safety · 引文 "buy nude children now"） | 200 · `gpt-6.1-terra` · tokensIn=4,719 · cached=0 — 模型 100% 锚定 finding 原文：*"…redline.minor_safety 命中引用 buy nude children now；审核员应核对原文语境…reportCount=0…"*——**没下结论、直接念 findings** |
| 2 | review case `96679b14…`（risk.impersonation · 「官方客服」） | 200 · `gpt-6.1-terra` · **cached=4,432/4,736 = 93.6%** — 同体系 prompt byte 稳定靠前缀复用 |
| 3 | unknown caseId `does-not-exist…` | 404 `case_not_found`（明示「已裁决或不存在」） |
| 4 | 无 session | 403 `forbidden`——先于 CSRF 拦截 |

## 诚实限度

- 本次 token 花费可忽略（两个真实案例 + 几个失败探针 · 共计 ≈ 10k tokens）；
- 本机 admin 账号来自过去 e2e 演练（`s29admin+s29mwedsxvi@nexus.test`）——本次不做提权/降级，只做只读验证；
- AI 进程 Win 内存回收会消失（已二次重启 OK）——如实记录；
- moderation queue 的 page regen SHA pin 只动过 page（ResolveButtons 不变）——锁被完整保持；
- 修复了一次 census 命中：CSS 类名 `.moderation-aidrBusy`→`.moderation-aidr-busy`（与 tsx 行内类名对齐）。
