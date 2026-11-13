# §CACHE-2 · 前缀缓存命中率与 token 效率：一页证据（2026-11-13 UTC+8）

关联：ADR 0262 · `npm run audit:prompt-prefix` · `npm run probe:cache-turns` · `npm run probe:cache`
真机：`wkapi.pro/v1` · `gpt-6-sol`（key 只在 `apps/ai-service/.env`，本文件不含 key）

## 1. 重排前：字节前缀复用率 0.45%

```
$ npm run audit:prompt-prefix

[§CACHE-2] prompt prefix audit（零 API 成本）
  system 字节           = 3485
  system 跨轮逐字节稳定 = True
  system 跨 Agent 稳定  = False
  user 字节/轮          = [24628, 24628, 24634]
  同 payload 重发前缀率 = 100.00%   ← 旧证据量的这个
  真实连续多轮前缀率    = ['0.45%', '0.45%']   ← 用户真正遇到的
回执：FAIL（exit 4）
```

## 2. 重排后：96.05%

```
$ npm run audit:prompt-prefix

[§CACHE-2] prompt prefix audit（零 API 成本）
  system 字节           = 3719
  system 跨轮逐字节稳定 = True
  system 跨 Agent 稳定  = True
  user 字节/轮          = [24779, 24779, 24785]
  同 payload 重发前缀率 = 100.00%
  真实连续多轮前缀率    = ['96.05%', '96.04%']
PASS: 连续多轮前缀复用率达标（稳定目录在动态字段之前）
回执：exit 0
```

## 3. 真机 A/B：网关自报数**打脸**了「顺序决定读数」

同一份内容，新旧键序各用独立 lane：

```
$ npm run probe:cache-turns -- --confirm-real

  A 新序 turn1: prompt=13234 cached=0    (0.0%)
  A 新序 turn2: prompt=13239 cached=5248 (39.6%)
  B 旧序 turn1: prompt=13720 cached=0    (0.0%)
  B 旧序 turn2: prompt=13799 cached=5471 (39.6%)
  轮二命中率  A 新序 = 39.6%   B 旧序 = 39.6%   差 = -0.0%
回执：exit 4（新序没有优势 → 探针按设计判 FAIL，不粉饰）
```

四实验定位网关行为：

```
L1 same,same   P0: prompt=13772 cached=None
               P0: prompt=13695 cached=10865   (79.3%)
L2 same,tail40 P0: prompt=13234 cached=None
               P0': prompt=13222 cached=13056  (98.7%)   ← 前缀缓存是真的
L3 turn0,turn1 P0: prompt=13234 cached=None
               P1: prompt=13239 cached=5248    (39.6%)
L4 P0,other    P0: prompt=13234 cached=None
               Q : prompt=21425 cached=5248    (24.5%)   ← 内容零重叠也报 5248
```

**判定**：L4 不可能成立（第 2 字节就分叉，前缀为 0），故 `cached_tokens` 不可作为精密仪器；
L2 vs L3 又证明前缀缓存机制本身有效。故本项目只把**字节前缀复用率**当对外指标。

## 4. 流式有 usage；`cached_tokens` 是「冷前缀不报」不是「流式不报」

```
[non-stream] status=200  usage = {"prompt_tokens": 21494, "completion_tokens": 36, "total_tokens": 21530}
[stream]     status=200  sse_data_frames = 34
             text = '前缀缓存会按字节匹配输入内容的开头，并复用已缓存的相同前缀数据…'
             usage frame = {"prompt_tokens": 7663, "completion_tokens": 36, "total_tokens": 7699}
```

**上面那一轮是冷前缀，所以没有 `prompt_tokens_details`。它不是「流式的普遍行为」。**
本文件初稿把这一句写成了「流式缺 cached 一项」，随后用同一段前缀连发两轮流式推翻：

```
stream call1 (冷) usage = {"prompt_tokens": 7410, "completion_tokens": 29, "total_tokens": 7439}
stream call2 (暖) usage = {"prompt_tokens": 7410, "completion_tokens": 29, "total_tokens": 7439,
                           "prompt_tokens_details": {"cached_tokens": 7168}}
```

第二轮同一前缀已在池里，**流式一样把 `cached_tokens` 送回来（7168 / 7410 = 96.7%）**。
与第 3 节「byte 前缀复用率 96%」吻合。归因改成：**冷前缀 / 首轮 / 短 prompt 不报**，
而不是「流式不报」。仍然成立的那条只剩「没报 ≠ 报了 0」。

## 4b. 三层读数端点（`GET /v1/ai/cache-stats`）

同一进程内两轮真调用之后：

```
"prefix"  : {requests: 2, reused: 1, uniquePrefixes: 1, capacity: 512, reuseRate: 0.5}
"appCache": {enabled: true, backend: "redis", hits: 1, misses: 1, hit_rate: 0.5,
             shared: true, degraded: false, namespace: "nexus:llmc"}
"provider": {reported: 2, missing: 0, cachedTokensTotal: 43362,
             promptTokensTotal: 45692, reportedHitRate: 0.949}
```

`missing: 0` 就是上面那句话的账本形态：两次都报了账，其中一次是流式。
`reportedHitRate` 的分母**只算报过账的样本**（45692），不是全部请求的 token。

## 5. token 剔空

```
契约夹具 contracts/fixtures/ai-request-with-index.json
  剔空前 8486 B  →  剔空后 7691 B（省 795 B，9.4%）
目录内部结构（重排前）：
  tokens 4138 B / 34 条 = 122 B/条；每条都带 "group":null（34 × 11 B）、18 条空 "via":[]
```

## 6. 应用级 completion 缓存端到端（Redis 真启用）

```
$ curl 同一条 AiRequest 连发两次（/v1/ai/run）

call1: wall= 8689.0ms tokensIn=22846 tokensOut=306 cached=0     latencyMs=6735.0 demo=False
       patches=1 explanation=已将 Hero 主标题从 56px 调整为 64px；…
call2: wall=   71.4ms tokensIn=22846 tokensOut=306 cached=22846 latencyMs=31.0   demo=False

healthz.llmCache = {"enabled":true,"backend":"redis","hits":1,"misses":1,"stores":1,
                    "hit_rate":0.5,"shared":true,"degraded":false,"namespace":"nexus:llmc"}
```

墙钟 **8689ms → 71.4ms（122×）**；`cached = tokensIn` 表示这一段输入一个 token 都没再发出去。

## 7. 判据与回归

```
apps/ai-service: 296 passed, 11 skipped
  tests/test_prompt_order.py    4 条（前缀率 ≥90% / system 跨 Agent 恒等 / 键序结构 / 重建字节相同）
  tests/test_prompt.py         25 条（含 agent 名册改走载荷后的 6 条改写）
  tests/test_completion_cache.py 新增「命中如实记账」1 条
```

## 8. 未做到的（如实）

- 网关 `cached_tokens` 抖动且会给出与内容无关的值，**不**用于任何对外命中率承诺；
- provider 的 `cached_tokens` **只在冷前缀/首轮/短 prompt 时缺席**（实测第二轮流式报 7168），
  ai-service 侧已加 `cache_reported` 分开「没报」与「0」；但 **web 契约 `UsageSchema.cachedTokens`
  仍是 `default(0)`**，跨服务那一维还没接上；
- `cachedTokens` 尚未在 UI 渲染（只进账本）；
- 前缀复用率 96% 的剩下 4% 是每轮必然变的现场与诉求，属信息本身；
- 未 push。
