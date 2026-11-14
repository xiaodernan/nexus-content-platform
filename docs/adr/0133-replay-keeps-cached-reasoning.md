# ADR 0133 — 应用级完成缓存回放必须原样带回 provider 的 cached/reasoning 账（v701）

- 状态：ACCEPTED（2026-11-14）
- 上游：ADR 0113（应用级完成缓存）、ADR 0125/0126/0130（计数与可观测）
- 范围：ai-service `redis_completion_cache.py`（encode/decode）+ 3 条单测

## 背景（实证发现）

2026-11-14 06:17 实测一条链上最隐蔽的账：同一浏览器会话、同一项目、**完全相同的两次**真实
`/api/ai/run`（同 8838 tokens in），返回的两行 usage 里 `reasoningTokens` 一行 405、下一行 0，
latency 完全一致（5766ms 毫秒级同值）。`/healthz` 同时显示 `llmCache.hits` 递增、
`llmLatency.calls=0`——第二次是缓存回放，不是模型调用。
原因：Redis 完成缓存 `_encode`/`_decode` 只序列化六个字段（text/provider/model/tokens_in/
tokens_out/latency_ms），**把 `cached_tokens` 和 `reasoning_tokens` 扔掉了**。冻结 dataclass
没有部分序列化，回放时少两个参数直接丢账——账本越用越省，因为 "省下" 的部分根本没记进去。

## 决定

1. encode 多写两个字段；decode 双侧同款校验（int、非 bool、非负；**缺失 → 0**，v1 存量条目
   照常可读，不当毒条目删——兼容窗口，不做强制过期）。
2. 回放行携带**存储时的那份账**（cached/reasoning），不发明数字：这与非回放路径对同一报文
   的报告完全一致（"这次如果真的发出去，会看到什么"）。
3. 不改 payload 版本号（additive、可缺省）；in-memory `LlmCompletionCache` 无序列化，无需动。

## 验证（本机，真实链路）

- 新单测 3 条：回放保留 cached/reasoning；缺字段 legacy 条目解码为 0；`True/-1/'12'/3.5`
  等毒条目一律拒。ai-service **329 passed / 20 skipped**（本片只新增 3 条；
  253 基线之后的增量其余来自 v694 本 lane 与同届 sibling lane 的 v695-v698）。
- **端到端实测**（本机，真实模型）：cache-fresh 项目（855b25b8）两次相同请求——
  第 1 次真调用：tin=8838 / out=195 / ms=5766 / reasoning=123 / cached=0（冷）；
  第 2 次 Redis 回放：两行九个数全部一致（毫秒级同 latency），`/healthz.llmCache.hits=2`，
  `llmLatency.calls=1`（提供商只被真打了一次）——回放保留下来的账就是 123。
- 前序发现的对照：修复前回放行 reasoningTokens 一律 0（call 2、call 3 两行对照在案）。

## 仍欠（诚实记录）

1. 旧写入但从未回放过的条目：首次回放报 0，第二次回放前先经过新编码——无法 "补历史"，不伪造。
2. 分发型网关（wkapi.pro）前缀缓存仍走通道轮转（call-1 cached=0 是通道 draw 的事实，不是本 bug）。
3. provider 重试（v681 bounded retry）在 409/429 尾部长尾上自身会再打一次真模型，缓存照样
   不去动重试语义——与本片无关，单独记录在 ADR 0130 的仍欠项里。
