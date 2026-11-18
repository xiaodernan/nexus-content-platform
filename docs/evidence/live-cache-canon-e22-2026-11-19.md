# Live 证据 · cont. 220 正典前缀在 E22 新正典下的复测 · 2026-11-19（晚）

环境与 cont. 220 相同：prod artifacts 未改（ai-service 进程 import 时读 canon_digest.txt）；Clash 7897 出站。

## 事件背景

- cont. 220（223b…）封存 digest 时 sha256=109c…（61,179 chars）；E22 落库后 `gen:bible-snapshot` 重封 canon_digest.txt（61,353 chars · sha256=87731133…），agent / insight 深问 / 问典 全部自动吃新正典——实现路径零改动。
- 本片记录**换代后首次连打**对缓存的冲击，以及收敛曲线。

## 实测（`/v1/ai/run` 同项目 probe-cache-sandbox）

### 第一轮（渠道冷 ~E22 digest 第一次到达 distributor）

| 次序 | 结果 |
|---|---|
| a1 | HTTP **502** · ConnectError（retryable=true；Clash 瞬时失败，非代码错） |
| b1 | HTTP 200 · tokensIn=84,974 · cachedTokens=**0** · cacheReported=false（新 digest 首个字节） |
| a2 | HTTP **502** · ConnectError（同上，瞬时） |

### 第二轮（立即复打，无人工介入）

| 次序 | prompt | tokensIn | cachedTokens | 命中率 | cacheReported |
|---|---|---|---|---|---|
| a1 | 把主按钮放大一点，蓝色加深 | 84,971 | **80,488** | **94.7%** | true |
| b1 | 把标题字号调大到 28px，字距放宽 | 84,974 | **84,974** | **100%** | true |
| a2 | 把主按钮放大一点，蓝色加深 | 84,971 | **84,971** | **100%** | true |

结论：digest 换代 = 每条 KV 车道一次冷启动；**新一代 digest 第一次调用之后，第二轮 94.7% → 100% 全部复用**。
distributor 无感知到「正典换代」这件事——它只认字节前缀。E22 的上线没有打穿缓存，收敛只花了一轮。

诚实记录：第一轮两次 502 是本机→Clash→aizzz 瞬时传输错误；provider 报文里的 `retryable=true` 与说明行均原样保留。
