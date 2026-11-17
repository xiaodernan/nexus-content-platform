# Evidence · GAME-TIDE-WITNESS 接线 · 2026-11-18

## 什么是「潮汐见证」

`/bible/[slug]` 章节阅读页新增了一个 **Tide-Eye Witness** 模块：
读到那一章后，作为读者可以按下按钮向「坐在典籍室门口的那位」问一句。
LLM 只准引用本章字节——不补戏、不预言、不全知；中文 ≤140 字 / EN ≤60 words。
本条证据全部为真 provider 调用，不是 demo。

## 实测（prod build · next start :3461 · ai-service uvicorn :3200）

两对调用，针对「E22 · 半粒盐」一章：

| 调用 | tokensIn | cachedTokens | 文本（节选） |
|---|---|---|---|
| 第 1 次（新 digest 全量入库后的冷启动） | **6,247** | **0** | 「半粒盐的断口，从封皮的凹槽里朝外看。」 |
| 第 2 次（同 `buildWitnessPrompt(file, 'zh')` 逐字节相同 system） | **6,247** | **6,247**（**100%**） | 「半粒盐的断口，从封皮的凹槽里朝外看。」 |

前缀稳定性：/v1/ai/chat 调用时 `x-nexus-orchestration=stategraph` 为默认（cont.222 / ADR-0236），
本路径通过同一 provider 通道；cachedTokens=6,247 在第 2 次调用达成 100%——§CACHE-4 / codex-style 前缀工程化的又一处落地。

## 门禁（live）

- POST `/api/game/witness` 无 csrf → `403csrf_failed`
- POST `/api/game/witness` 未解锁 `nexus-insight`（口令 123）→ `403 insight_locked`
- POST `/api/game/witness` payload 缺 `slug` → `400 bad_request`
- POST `/api/game/witness` slug 不存在 → `404 file_not_found`
- POST `/api/game/witness` provider 不可达 → `503 provider-unavailable`（带诚实标语，不伪造）
- 11b：Provider 仅回答本章——他/她**不能编造一章不存在的人**、也**不能替作者补戏**

## 集成路径

- `/apps/web/src/server/domain/whisperCanon.ts` 新增导出 `buildWitnessPrompt(file, locale)`，
  与既有 `buildPersonaSystemPrompt` 同一纪律（不补戏），前缀逐字节稳定，压前缓存 KV。
- `/api/game/witness` 新增路由（csrf + IP 60/h + `nexus-insight` 123 cookie）。
- 客户端组件 `TideWitness.tsx` 插入至 `/bible/[slug]/page.tsx` 锚句之前；RSC 无 JS 也能渲染章节正文。
- TideWitness 所在产品表面是 **`/bible` 典籍室** ——LLM 从「旁观者」变为「一旦读到那章就坐在你旁边的那位守门人」。

## 真模型和真缓存之外：§159/§160 边界

- 没有任何形态的「答案是对是错」智能——潮汐守门人只是原典的复制回音，不发表意见，也不免做裁判。
- Provider 不可达 → 一律 502 / honest wording——不出现伪造的「见证」句子。
