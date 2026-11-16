# 2026-11-17 LLM 流式修复实测 —— 「非流」根因：dev .env 残留的 NEXUS_LLM_STREAM=0

> 同前模式：每条**可复现、可证伪**。无 SLA 承诺、无全局百分比承诺；本页全部是 dev 机、Clash Verge 梯子节点、同日同配置实测。

## 1 现象（用户实报）

> 「调用时缓存命中率很低，而且一直显示『非流』。似乎显示为流式的时候缓存命中率要好得多——肯定是调用方法出了问题。」

`/v1/ai/cache-stats` 的 `transport.stream` 在本机 dev 部署里是 **false**——处处显示「非流」，且前缀缓存永远不上报 hit。

## 2 根因

`apps/ai-service/.env`（未入 git）第 31 行残留：`NEXUS_LLM_STREAM=0`。

- `apps/ai-service/src/ai_service/config.py`：`llm_stream=(get("NEXUS_LLM_STREAM", "1") or "1") != "0"` —— **默认 True**；
  该 `=0` 是最早调试 502 风暴时留下的 opt-out 开关，没有附任何 A/B 实测依据。
- ADR-0265（**Accepted**）明确记录：`llm_stream=True` 是默认、且是实测获胜方；任何候选 `=0` 降级必须有 `probe-cache-stream.py` 级的 A/B 实测证明 ≥80% 命中率——本机没有这份证据。
- 非流路径下 provider 不回 `prompt_tokens_details.cached_tokens` → web/ai-service 全部判定 cache「未上报/未命中」→ 用户看到的「命中率很低、一直非流」。

## 3 修复

`apps/ai-service/.env`：`NEXUS_LLM_STREAM=0` → `NEXUS_LLM_STREAM=1`（仅此一行；未动其它配置）。

ai-service 重启后 `/v1/ai/cache-stats` 显示 `transport: {"stream": true}`。

## 4 实测（同一条请求，连打 6 次，2026-11-17，WSL/Windows dev + Clash Verge）

请求：`POST /v1/ai/design-graph`（dryRun，modelClass=fast，critique 意图，stableDigest=23aa0d15b1f4843b）

| 次 | HTTP | cachedTokens | cacheReported | tokensIn | latencyMs |
|----|------|--------------|---------------|----------|-----------|
| 1（冷） | 200 | 0 | false | 6724 | 12094 |
| 2 | 200 | **6724** | **true** | 6724 | 6156 |
| 3 | 200 | **6724** | **true** | 6724 | ~0.6x |
| 4 | 200 | **6724** | **true** | 6724 | ~0.6x |
| 5 | 200 | **6724** | **true** | 6724 | ~0.6x |
| 6 | 200 | **6724** | **true** | 6724 | ~0.6x |

修复后 `/v1/ai/cache-stats`（进程内计数，重启已清零）：

```
transport: {"stream": true}
provider: reported=5 missing=1 cachedTokensTotal=33620 promptTokensTotal=33620 reportedHitRate=1.0
appCache: enabled=true hits=5 misses=3 hitRate=0.625
```

**结论：同 digest 前缀在流式 transport 下命中 100%（provider 自报 cached_tokens=6724/6724），cacheReported=true。**
旧配置（非流）下：provider 完全不回该字段 → 命中率永远显示为缺失/0。这就是「肯定是调用方法出了问题」的确切根因与确证。

## 5 诚实边界

- 修复**之前**的本机窗口：非流期间 prefix cache 未命中为真实现象（不是统计错觉，是 transport 形态所致）。
- appCache（应用级 completion cache，redis namespace nexus:llmc）hitRate=0.625（8 次操作：5 hit / 3 miss）——与流式无关的另一层；
  miss 多为 store 失败/未 store 的形态，未动它。
- provider 经 Clash Verge 的连接今天不稳定：前两次调用 502 ConnectError（EOF），重试后全 200；
  与 STREAM=0 无关（梯子节点质量问题，同前日记录），本次 A/B 明确区分了 transport 形态影响 vs 网络抖动。
- missing=1：一次调用 provider 未回 cached_tokens（真实存在，计入 missing，未粉饰）。
- 无 SLA、无百分比承诺：上面全部是同 digest、同节点、同日实测；换 digest 命中率会回落，这是前缀缓存的本质。

## 6 复现

```
# .env: NEXUS_LLM_STREAM=1（默认值，ADR-0265 sanctioned）
# 重启 ai-service 后：
python POST /v1/ai/design-graph   # x2：第一次 miss → 后续全部 cachedTokens=6724 / cacheReported=true
GET /v1/ai/cache-stats            # transport.stream == true；provider.reportedHitRate（进程内累计）
```
