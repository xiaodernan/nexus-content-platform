# Live 证据 · 全局字节级正典前缀（ADR-0235）· 2026-11-19

环境：Windows 11 · Node 24 · next start（prod build, 3461）· uvicorn ai-service（3200，`.env` 中 `NEXUS_LLM_STREAM=1`、`HTTPS_PROXY=http://127.0.0.1:7897` 走 Clash Verge）
模型：`gpt-6.1-terra` @ `https://api.aizzz.xyz/v1`（直连被上游按国家拦截；经 Clash 7897 代理可稳定 200）

## 1 · Agent 设计通道 `/v1/ai/run` 三连（同项目 `probe-cache-sandbox`）

| 次序 | prompt | tokensIn | cachedTokens | 命中率 | cacheReported |
|---|---|---|---|---|---|
| a1（冷） | 把主按钮放大一点，蓝色加深 | 84,705 | **0** | 0% | false |
| b1（换诉求） | 把标题字号调大到 28px，字距放宽 | 84,708 | **80,245** | **94.7%** | true |
| a2（原样重放） | 把主按钮放大一点，蓝色加深 | 84,705 | **84,705** | **100%** | true |

对比：改动前这条线的 system 是恒定但极小的 ~1.5k 字符 Agent 规则（且还拼了会随 Agent 变的 agentNote，字面失配）；
现在 system = 世界大典 digest（≈61k 字符，tokensIn 从 ~8.9k 涨到 ~84.7k，其中 ~80k 稳定可缓存）。
**b1 换诉求仍然命中 94.7%——缓存摊销的正是正典前缀本身，不是同一条请求的重放。**

## 2 · Web 正典深问 `/api/insight/chat`（口令 123，新路由，与 `/api/bible/q` 共享 SYSTEM_PROMPT 字节常量）

| 次序 | tokensIn | cachedTokens | 命中率 |
|---|---|---|---|
| #1（冷） | 43,458 | **0** | 0% |
| #2 | 43,458 | **43,458** | **100%** |
| #3 | 43,458 | **43,458** | **100%** |
| #4 | 43,458 | **43,458** | **100%** |

`/api/bible/q` 随后两连发：**cachedTokens=43,458 / 43,458（100%，两次）**——深问通道先暖出的桶，问典通道直接复用，无独立冷启。

## 3 · `/api/insight/analyze` 回归

| 次序 | cachedTokens | 结果 |
|---|---|---|
| #1 | 4,480 | 200 · 真模型中文回答 |
| #2 | 5,215 | 200 · 真模型中文回答（stats 漂移时 prefix 之外的变长部分不缓存，正确） |

顺序保证：probe 全程只调真实 provider；无伪造 usage、无 demo 回落（provider 不可达会原样 503）。

## 4 · SSR / 集成

- GET /insight → **200**，HTML 含深问 marker（len 47,437；Unlocked 后正典深问面板可用）
- GET / → **200**
- /api/insight/login → **200**（`{"ok":true}`）
- fe-gates **147/147** · pytest **455/455**（含新 `test_canon_digest.py` 4 条）· verify:world-bible **367/367** · verify:bible-snapshot 一致 · tsc web **0 errors**

## 5 · 边界（不吹）

- 冷启必为 0（新 digest 上线 / 正典更新 / 换项目车道），连发第二次起 94–100%。
- 跨项目不共用 KV 车道（ADR-0126 分桶）；单车道内摊销 ≈ 80k/84k tokens。
- `cacheReported=false` 出现在 a1，是 distributor 首字节冷启动的口径，如实转报，未强改。
