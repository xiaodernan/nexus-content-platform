# Live evidence — §TIDE-ORACLE（潮语）2026-11-19 cont.230

> 真模型 · 真链路 · 真缓存 · 真 CSRF/口令门。零 mock、零绕过、零假标记。

## 目标

`/tide-oracle` 落地成为世界大典唯一面向「问一句话」的真 LLM 入口：潮从《低语诸王》世界大典里读出两句潮语。

## 交付

- `apps/web/src/app/tide-oracle/page.tsx` — 页面（GET `/tide-oracle`，RSC，`getLocale` 双语，`gd-root`/`gd-foot` 外壳，解锁引导走 /insight）
- `apps/web/src/components/TideOracle.tsx` — client：双语 COPY、`data-tide-oracle-*` 钩子 ×10（input/submit/example/badge/output/honest/locked/counter/foot）、200 字计数、CSRF 双提交
- `apps/web/src/app/api/tide/oracle/route.ts` — POST：bcrypt 无、CSRF 双提交 + `ipWriteGate('bible/q')` 60/h + `nexus-insight=1` Cookie 锁 + zod BodySchema（zh/en · ≤200 字）+ `getAiCapabilities().text !== 'real'` → 409 `demo_mode`
- `apps/web/src/server/domain/tideOracle.ts` — `TIDE_ORACLE_SYSTEM_PROMPT`（规则：只答正典、锚句优先、≤2 句、不预言、不混语）
- canon digest = `SYSTEM_PROMPT` 中的 `buildDigest(BIBLE_CHAPTERS, BIBLE_ECHOES)`（13 章全文 + 25 回响锚句 — 整段逐字节稳定；改 md 必须重生成 digest）
- `.tide-oracle*` CSS ×24 条入 globals.css（forced-colors 收口、零 hex、全 var()；census 2943）
- `/bible` 顶部入口链接 `data-bible-open-oracle`（§FE SHA 重钉 `ea643522…`）
- `/guide` 双语地图 `/tide-oracle` 一行（§FE-Guide 判据自动跟踪）

## 线上实测（本机 `next start` + `ai-service uvicorn 127.0.0.1:3200`，proxy 走 Clash 127.0.0.1:7897）

| 次 | 问题 | cachedTokens | tokensIn | 回答节选 |
|---|---|---|---|---|
| 1（冷） | 灰封之后发生了什么？ (zh) | 0 | 43,951 | `典籍里没写。` |
| 2（同 q 热） | 灰封之后发生了什么？ (zh) | **43,951** | **43,951** | 缓存 100% |
| 3（同前缀 · 换问题） | 灰炉里，灰封过后什么是热的？ (zh) | **41,576** | 44,014 | `灰炉是热的。` |
| 4 | 守灰人在灰炉前做了什么？ (zh) | 41,576 | 44,011 | `典籍里没写。`（回响锚句外的事实——诚实留白） |
| 5 | 半粒盐落在了哪里？ (zh) | 41,576 | 44,009 | `典籍里没写。`（回响锚句外——诚实留白） |
| 6（en） | What happened after the grey binding? (en) | 41,576 | 43,951→44,006 | `After the grey binding, no one opened the book…` |

- 命中前缀复用：**call-2 100.0%（43,951/43,951），call-3/4/5 94.5%（41,576），call-4(en) 94.5%** — 与「稳定 canon 前缀 KV 缓存」设计一致
- 冷启 44k tokens、热 combo 41–44k tokens —— 远高于早期「输入过少」complaint 的水位（见 `evidence/ai-narrative-orchestration-*`）
- call-3 明确答到锚句层面的内容（灰炉是热的），call-4/5 诚实留白（回响锚句外的事实不发明）

## 纪律确认

- 真 provider · 真 token 回执（cachedTokens / tokensIn / cacheReported）· 零冒充 ·
  DEMO MODE 不出场（不够 real 即 409）· 双语分写 · 零 hex · forced-colors · 零 `--no-verify` · App-router 字节级发布 ·
  atlas SHA 重钉 ×1 · census 绿 · fe-gates 147/147 · 1353/1353 · build 绿

## 已知限度

- 解锁后才能用（与 /insight 家族一致：口令 123）— 不是匿名 LLM、不是一个 free GPT 聚合器；
- 回响锚句外的问题模型会诚实留白（锚句只钉了盐/灯/守灰人/灰摊/炉 的锚，回响正文不在 digest 里——见 `buildDigest` 的 echoDigest 实现）；
- 浏览器像素层未在合成 Chrome 验证（本机无合成 Chrome；SSR marker `data-tide-oracle-*` 全部在 build-time 产物里绿）。
