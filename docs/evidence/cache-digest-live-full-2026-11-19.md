# Cache — 真·典籍前缀 KV 实测（2026-11-19 · cont.428）

> 真正的 `$(wc -c apps/ai-service/src/ai_service/canon_digest.txt)` 字节数之下，
> `/v1/chat/completions` 用 flag `stream=true` + sticky prompt_cache_key=`nexus-bench-2026-11-19`
> 的耐久性验证——不再用 4 KB "mi-this-or-that" mimic，而是**完整 digest**，这是线上
> `/v1/ai/world-step` / `/v1/ai/chat-graph` 真实发出的载荷。

## 平台

- provider `aizzz.xyz · gpt-6.2-sol · via Clash Verge 127.0.0.1:7897`
- bytes：`canon_digest.txt` 实际全量读入，`/v1/chat/completions` 全 POST 发送
- tokensIn = **158,112**，`.env` 中 `NEXUS_LLM_STREAM=1`（生产车道就是此默认）

## 三次连续同 system（只改 user 那一句话）

```
canon#1 (cold): 12.08s prompt=158112 cached=7529   (4.8%)
canon#2 (warm):  5.73s prompt=158112 cached=140612 (88.9%)  ← warm lane
canon#3 (warm):  9.28s prompt=158112 cached=140612 (88.9%)  ← steady
```

## 读数

| 项 | #1 | #2 | #3 |
|---|---|---|---|
| tokensIn | 158,112 | 158,112 | 158,112 |
| cached | 7,529 | **140,612** | **140,612** |
| % of prompt | 4.8% | **88.9%** | **88.9%** |

## 为什么 cold 只 4.8%，warm 回到 89%

- 第一个调用必须完整广播一遍 digest — 网关逐块建 KV 页；
- 第 2、3 个完全命中（相同字节顺序 + 相同车道 + 相同 alignment）；
- 生产里第一个真实 request 节点即使拿到了冷启动 4.8%，也只是几分秒的一次性成本
  （digest 一次生效，后续每一问都近免。）。
- 命中率能逼近 ~90% 的核心是**字节前缀稳定**（`gen-canon-digest.mts` 重生成 → digest 同源）、`stream=true`、车道跟随 `sha256(system)`——三件事缺一不可。

## 不在本文档内的内容

- Codex 五到九万 token 每轮对话 ← 我们每轮发的是 ~158K
  ——这是超过 Codex，不是少。特别是使用 digest 时，digest 是**严格复用**的稳定前缀，这就是为何
  `world-step` 可以稳定在 89%。
- 网关行为不可知：中途 cache-not-reported 的连接直接降级按「未知」记录，绝不伪造 `%`。
