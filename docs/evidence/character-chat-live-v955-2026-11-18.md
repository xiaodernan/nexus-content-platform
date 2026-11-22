# §PROOF-CHARACTER-CHAT · 角色对话 live 端到端实录 · 2026-11-18

**范围**：真模型（`gpt-6.1-terra`）+ Next dev（`:3100`）+ ai-service（`:8001`）走通
「访客注册 → 建项目 → 建角色 → PATCH 档案 → 连续 3 问」全链路；
本次同时落地「对话框显示缓存复用」的服务端透传与前端徽章（见下）。

**环境**：本机 dev 路径（非生产 SLA）；探针脚本 `scratch/proof-character-chat.mts`（cookie jar 手工实现，不落任何 key）。

## 角色（铁板档案）

雾港码头陶人「阿栀」——深蓝围裙、发间别一枝海草；守一盏不灭的灯十多年；寡言认死理；父亲四十年没说话。
写了三条 voice.catchphrases：「记下了」「盐里有数」。

## 两次完整探针实录（两次全新项目，同一 persona 文本）

### 第一次（冷，另一个项目 · 突发 lanes）

| # | 提问 | status | verified | tokensIn | cachedTokens | cacheReported |
|---|---|---|---|---|---|---|
| 1 | 你还记得我么？我五岁没等到回信。 | 200 | true | 4,631 | 0（冷） | false |
| 2 | 同上 | 200 | true | 4,699 | **4,433（94.3%）** | true |
| 3 | 雾港最里屋那一盏常亮的灯，是你和谁点的？ | 200 | true | 4,767 | 0（通道换，没命中） | false |

### 第二次（另一个项目，同一 persona 文本字节）

| # | 提问 | status | verified | tokensIn | cachedTokens | cacheReported |
|---|---|---|---|---|---|---|
| 1 | 你还记得我么？我五岁没等到回信。 | 200 | true | 4,631 | **4,631（100%）** | true |
| 2 | 同上 | 200 | true | 4,699 | **4,699（100%）** | true |
| 3 | 雾港最里屋那盏常亮的灯，是你和谁点的？ | 200 | true | 4,767 | **4,767（100%）** | true |
| 4 | 同上 | 200 | true | 4,853 | **4,431（91.3%）** | true |

**注意 100% 的含义**：tokensIn 整段被缓存 = 应用侧 **L2 精确命中**（`redis_completion_cache`，sha256(model, system, user, json_mode)）——连 tail 都一模一样，不是 provider KV 在复用。
真正的 **provider 前缀复用**（tail 因 §48 记忆行而变）是：94.3%、91.3%、以及 `/bible/ask` / transport lane evidence 里 94.5% 的同形态。
第三问第一次冷启（cachedTokens=0）是在通道/TTL 上游随机轮换，不是 key 乱了；sticky key（system-only 自由文本，ADR-0127 方案）一直是同一个值。

## 模型对人设的兑现（不是复读，是 persona 驱动的答复）

- 回答 Q1/Q2：「**记得。五岁那封信，我没回。** 我把账一笔一笔对过了，唯独这笔拖了四十年。对不起。**记下了。**」——抓住 catchphrases 第一句；直接回应五岁没回信的语境；不渣；不编故事。
- 回答 Q3：「和我父亲。」+「盐里有数。」——第二个 catchphrase 被用出来，且引用档案里「四十年没说过话，灯却没灭」的设定。
- `verified: true`（机检一次通过，boundary 没漏）、三次答复 `nodesVisited: [draft, verify, finalize]`。
- **没有胡编「典籍里没有」的事**：这不是 /bible/ask 的 canon 域，不适用「典籍里没有」横行无阻——而是 persona 域；模型照档案走，没自述「我是 AI」。

## 代码变更（本 evidence 随附）

1. `apps/web/src/app/api/projects/<id>/characters/<id>/chat/route.ts`：响应新增 `usage { tokensIn, tokensOut, cachedTokens, cacheReported }`（原样透传 provider 声明值，不伪造 0）。
2. `apps/web/src/studio/CharacterChat.tsx`：角色消息下显示缓存徽章 `<span className="ch-cache" data-character-chat-cache>`，zh「缓存复用 X / Y tokens」、en「cache reuse X / Y tokens」。
3. `apps/web/src/app/globals.css`：`.ch-cache` 视觉类（mono · fg-3 · 无边框，只当脚注）。
4. `apps/web/test/character-chat-visual-style.test.ts`：SHA 重钉（page → e322795c，className redacted）。
5. `apps/web/test/*`：角色对话相关 28/28 通过；fe-gates 1285/1285。

## 边界（§159）

- 这不是生产负载测试；「100% 命中」含 **L2 精确命中**（应用侧）和 **provider 通道负责人**（同 key 命中同 channel）两种语义，必须分开读。
- provider 端的 K 个通道轮换在弱信号下仍会出现 0 复用（本次第一次跑的第 3 问就是这样）；
  稳定的解药仍是 ADR-0127（system-only 稳定 key），而不是把 user 塞进 system。
- 本 evidence 不含任何 key；provider key 只经 ai-service `.env` 注入。
