# 证据 · Provider 渠道更换与 gpt-6.1-sol 实测 — 2026-11-19

> 纪律（§159/§160）：这一页只记真实探测结果。
> 时间线：本会话此前（约 06:30）provider 曾真通（`READY.` / `GRAPH-OK`，见并行线 cont.399）；
> 10:00 后直连与代理皆 503；进本片时再次从本机（Clash 7897）复测仍为 503。

## 1. 故障复测（本会话 12:43）

```
POST /v1/chat/completions
{"error":{"code":"model_not_found","message":"分组 GPT特价 下模型 gpt-6.1-terra 无可用渠道（distributor） (request id: 202611190448419663174518268d9d65EL8iSht)","type":"new_api_error"}}
```

## 2. /v1/models（200 · 真 Clash 7897）

key 落在 **sub2api** 组，可见模型只有这几个：

```
codex-auto-review · gpt-5.6-sol · gpt-5.6-terra · gpt-6-astra · gpt-6-sol
gpt-6.1-sol · gpt-6.2-astra · gpt-6.2-sol
```

**`gpt-6.1-terra` 不在此组**（gpt-6.1-sol 同名后缀 `-sol` 在）。

## 3. 各模型实测（tiny completion · max_tokens=12 · 同一把 key）

| 模型 | 状态 | tokensIn | cached | 备注 |
|---|---|---|---|---|
| gpt-5.6-terra | **200** | 4,392 | 4,180 | 95.2% cached（terra 一代） |
| **gpt-6.1-sol** | **200** | 4,392 | 4,180 | 95.2% cached（6.1 同代，本片采用） |
| gpt-6-sol | **200** | 4,392 | 4,180 | 95.2% cached |
| gpt-6.2-sol | 403 | — | — | Service temporarily unavailable |
| gpt-6.1-terra | 503 | — | — | model_not_found（distributor 已撤渠道） |

## 4. 采用的决定（自主拍板，§一）

- 默认 `NEXUS_MODEL_*` = **`gpt-6.1-sol`**（保 6.1 同代；`gpt-5.6-terra` 同样可用，如需 terra 一代改 `.env` 四行即可，无需改代码）。
- `.env` 为 gitignored 本地文件，**未提交、不入库**；被跟踪的源码里没有运行期硬编码的 `gpt-6.1-terra`（`grep` 全树仅见测试 fixture 字符串——模型名在测试中只是 opaque 字符串）。

## 5. 全 digest（240,482 chars · tokensIn≈155K）两轮实测

**直连探针（Clash proxy + sticky `prompt_cache_key=nexus-<sha256(digest)>`）**：

| 轮 | ms | tokensIn | cached | 命中率 |
|---|---|---|---|---|
| 冷启动 #1 | 14,380 | 155,151 | 7,388 | 4.8%（新 lane） |
| 暖车 #2 | **5,628** | 155,151 | **141,082** | **91.0%** |
| 暖车 #3 | 第三轮超时转后台 | 155,151 | （未取到最终数） | — |

**web → ai-service 全链路（`POST /v1/ai/chat` · capability=real）**：

| 轮 | status | ms | tokensIn | cachedTokens | cacheReported |
|---|---|---|---|---|---|
| 冷 #1 | 200 | 11,309 | 155,151 | 7,388 | true |
| 暖 #2 | 200 | 14,912 | 155,151 | **141,082** | true |

回答示例（#2）：「守灵人守着盐灯；见回响《盐灯守灵日记》。」

## 6. 服务生命周期记录

- 旧实例（globs：14468 + 20424）已于本片起手时被本会话替换；
- 新实例（本片起手）：先**未带代理** → 启动失败（Redis 56379 拒绝连接 + 直连 provider 必挂）；
  再按 ADR-0274 用 `AI_SERVICE_ALLOW_DEGRADED_STORE=1` 明牌 DEGRADED-BOOT + `HTTPS_PROXY=http://127.0.0.1:7897` 启动，pid 34348 → healthz 正常，LLM `status: real · models: ["gpt-6.1-sol"]`；
  为了让 StickyPromptCacheTransport 的 proxy 在场，随后以**带代理**重启动（pid 见 ps/this note）。
- `/v1/ai/cache-stats`：`transport.stream = true` ✓；`provider.reported=2`（缓存报表上报数）；`appCache` 因 Redis 不可用 → `degraded:true · stores_failed:2`（按纪律 fail-closed，未假装命中）。

## 7. 仍未解（用户侧，§80）

- **服务商后台**：「GPT特价」分组下 `gpt-6.1-terra` 的渠道已被撤；若确实想继续用 terra 一代，选 `gpt-5.6-terra`（实测 200）；若要恢复 gpt-6.1-terra，需要渠道方重新上架或改分组。
- **Redis 56379**：Docker Desktop 引擎一直 500 → 作业队列走 DEGRADED-BOOT 内存态（ADR-0274 明牌）；恢复后 `ai-service` 重启即回 Redis 后端。
- embedding/image/video/speech：本机仍然 unavailable（无 provider；未配置真实密钥——按 §159 不假装）。
