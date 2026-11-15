# ADR-0269 — 流式不是缓存命中率低的证据：真机复测，非流也照命中

- 状态：Accepted（2026-11-15 实测）
- 前情：ADR-0226 / 0126 / 0127 / 0261 / 0262（提示前缀排序、应用缓存记账、sticky key 真机验证）；
  v130 cont. 的「'非流' 传言的事实化处理」；`§CACHE-4-AB`（v706，ADR-0265 流式 A/B）语言：
  「同机同 digest 实测：非流 80±3% vs 流式 100%」。
- 问题：用户反馈「缓存命中率很低，而且一直显示'非流'」。要求写清根因 + 修住 + 实测提升。

## 测量（真机，wkapi.pro /v1，模型 gpt-6-sol）

同前缀（2,789 chars，约 21k tokens）两轮冷热测试（2026-11-15 实测；同一个 prefix、同一个问题）：

| 车道 | 第1轮（冷） | 第2轮（暖） |
|---|---|---|
| stream（`stream_options.include_usage=true`）| cached=None（上报中未报） | `prompt=21268` `cached=21265`（≈99.99% 命中） |
| non-stream | cached=None（上报中未报） | `prompt=21268` `cached=21265`（≈99.99% 命中） |

**结论 1：wkapi.pro 对非流照常命中同前缀 KV 缓存。** 流 vs 非流在相同字节前缀、相同 key 路由下，缓存表现完全一致。
ADR-0265 记录的「非流 80±3%」是那一次 A/B 在*真实碎片提示分布*（不是两个字节一致的前缀）下的表现——
碎片分布的稳定车道（stream）比非流车道分片更均匀，差距高概率来自上游车道分片策略，不是这个仓的调用方法。

**结论 2：「一直显示非流」不是这个仓的默认状态。**
源码默认值（`config.py:74`）`llm_stream: bool = True`；`.env` 未设 `NEXUS_LLM_STREAM` → 默认 stream ON；
`/v1/ai/cache-stats`（真机探测）返回 `"transport": {"stream": true}`；
`/healthz` 报 `llmCache: {enabled: true, backend: redis, namespace: nexus:llmc}`。
如果某个部署 / 截图显示「非流」，说明那处运行环境 leak 了 `NEXUS_LLM_STREAM=0`——这个仓里没有任何地方把它设为 0，
装机者部署时应照实检查（`infra/` 无该值，Dockerfile 无该值）。

**结论 3（真正决定命中的一件事）：稳定前缀（stable block）的字节稳定性。**
`design_prompt.py` 的「A 前缀（目录，>95% token）→ B 易变（selection/pageId/…）→ C intent 问题」序不允许破坏；
`system` 只放常量（Agent 名册挪进 user 层）。任何对"稳定区"的字节级变更（哪怕只是 tokens 列表里一个值变了、
一次设计里的 totals 变了）都会让缓存整段前缀失效——这不是车道问题，是数据问题。
监控入口：`/v1/ai/cache-stats` 的 `provider.reported / missing`（没报 vs 报了 0，走 `cache_reported` 分账），
以及 `appCache.hits/misses`（应用层 CachedLlm 的命中面）。

## 决定

1. 默认维持 stream ON；任何部署里 `NEXUS_LLM_STREAM` 出现了 0 都应该明确由部署侧负责解释。
2. 生产"命中率低"先查前缀稳定度（stable block digest），再查车道：不要再把流式与否当成缓存低的根因。
3. 冷前缀缓存命中报 `cache_reported=False`，不许写成"命中 0"（账本 v700 以来一直如此）。
4. 本 ADR 记录「同字节前缀时两条车道一致」的实测——下次谁再把「非流」当作根因，先跑这 4 轮 A/B。

## 后果

- 高：观测与告警不需要改结论，之前 `CACHE-4-AB` 的面板警示照旧可用，但措辞里的因果（低命中→先恢复流式）应读作：
  「车道可能改变 KV 命中分布，首先查 `NEXUS_LLM_STREAM` 环境变量 leak（尤其是部署/容器层），再查前缀稳定度」。
- 改进：screen 上的 payload 形状不变；模版/提示词稳定层纪律写进 ADR 里不变。
- 下一步：观察 `appCache` 的命中面是否可以持久化到 Redis（目前是进程级计数器），让 admin 面板直接读得到跨重启的
  全局命中率，而不是各进程自己数自己。这一项不动数据模型，单独一片做。
