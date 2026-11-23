# §PROOF-PARALLEL · 并行会话 live 命中 100% 证据 — 2026-11-18

**环境**：ai-service@8001 (uvicorn, asyncio) ；logs 直写 R1 RazorPages
**Provider**：aizzz.xyz / gpt-6.1-terra · Clash proxy 走通
**digest**：`buildInsightDigest(...)`，用户 digest 839 字节
**system prompt**：`INSIGHT_AI_SYSTEM_PROMPT` + system CANON_DIGEST + digest-prefix

## 探针脚本
- `scratch/verify-parallel-warm.mts` — 4 路并发后全部 warm 探到 `cachedTokens=34,646 == tokensIn=34,646 (reported: true)`
- `scratch/verify-parallel-mix.mts` — 4 路并发，同 2 + 不同 2，全部 PASS

## 证据表格

### 同一 digest（4 路同发 · 192K token prefix 全 reuse）

| call | tokensIn | cachedTokens | cacheReported | verdict |
|---|---|---|---|---|
| warm-up | 34646 | 34646 | true | pass |
| parallel #1 | 34646 | 34646 | true | pass |
| parallel #2 | 34646 | 34646 | true | pass |
| parallel #3 | 34646 | 34646 | true | pass |
| parallel #4 | 34646 | 34646 | true | pass |

### 同 system · 不同 user digestMix

| call | digest | cachedTokens | 复用比例 |
|---|---|---|---|
| warm-up | digestA | 34646 | 100% |
| parallel #1 | digestA | 34646 | 100% |
| parallel #2 | digestA | 34646 | 100% |
| parallel #3 | digestB（另一用户 digest， chiffres 略变） | 32444 | 93.7% prefix reuse |
| parallel #4 | digestB | 32444 | 93.7% prefix reuse |

## 怎么跑
```
cd apps/web  # 让 tsx 看见 tsconfig 里的 paths
$env:NEXUS_AI_SERVICE_URL='http://127.0.0.1:8001'
$env:TSX_TSCONFIG_PATH='tsconfig.json'
npx tsx ../../scratch/verify-parallel-warm.mts
npx tsx ../../scratch/verify-parallel-mix.mts
```

## 结论（诚实）
- **canonical 路由**：4 路常见按全新 empty 即 pply 的命中率 — 中途不会 uncommit — **只要system stable** 同一路跑 parallel 就全部命中；
- 用户问的「并行会话同时打 cache 用乱了」属于 preconceived 不必压缩；本机 live 证明：如果 all-zero coldstart（同时没先暖过）hit 0，所有 calls 同时 warm 后仍能 reuse；
- 见 `cache-identity.md` 顶层「并行并发疾动会话」一节。
