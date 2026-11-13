# ADR 0125 — LLM 路径在线压测（live probe，2026-11-13）

- 状态：ACCEPTED（2026-11-13）
- 上游：ADR 0123 / 0124（cached/reasoning tokens 端到端）+ ADR 0113（应用级 Redis 完成缓存）
- 范围：scripts/llm-path-live-probe.mts（新）+ package.json `perf:llm-live`；零产品代码改动

## 背景

SPRINGCLOUD-BLUEPRINT 的 P0："LLM 路径的完整集成压测（ai-service + 真 gpt-6-sol），量化 p95、错误率；
在观测页暴露这些数（不造指标）。" 此前只有零散实测；这片把它做成可重复跑的脚本。

## 实测环境

ai-service：本机 uvicorn 127.0.0.1:3200（capability=real，providers: llm openai-compatible real
（models: gpt-6-sol），embedding unavailable（provider 报 model_not_found：text-embedding-3-small
在该 distributor 组无可用通道——如实记录）；NEXUS_LLM_COMPLETION_CACHE_URL=redis://localhost:56379/8
已启用（namespace nexus:llmc，backend redis，shared=true，非 degraded）。

## 实测结果（三轮，共 27 次真实调用，错误率 0/27 = 0.0%）

第一轮（旧实例，未带完成缓存 env）：p50≈5.5s，p95≈14.5s；同 prefix 连续调用
第 2~6 次 cached=18722/18778（≈99.7% prefix 命中）。app 缓存未启用，B 组 warm-repeat 第二次真实
调用 5.94s。

第二轮（重启实例，app 缓存已启用）：p50≈6.9s，p95≈40.7s（distributor 通道失败切换的尾延迟）；
in ∈ {323, 4267, 4433, 4882, 18780}（通道轮转，usage 报数不一致），cached=0；app 缓存命中
B#2=17ms（/healthz 计数 delta 恰为 +1 hit / +7 miss）。

第三轮（同实例）：p50≈2.85s，p95≈5.87s，min≈2.78s（draw 到了健康的通道池）；
in ∈ {4699, 4876, 4906, 18779}；cached=0；app 缓存 B#2=9ms。

## 发现（如实，不是猜测）

1. **app 级 Redis 完成缓存是唯一确定性能**：同 (model, system, user) 第二次 9~17ms（vs 冷调
   2.8~10.5s），全集群共享，/healthz 计数器可观测（每轮恰 +1 hit/+7 miss，与探针构造自洽）。
2. **provider prefix 缓存由 distributor 通道轮转决定**：同前缀的连续调用在一些 draw 上
   99.7% 命中、换通道后 0%。客户端不可控，不应视为可依赖的优化；观测页只称"计数器"不称"省钱保证"。
3. **该 distributor（wkapi.pro "gpt-特价" 组）各后端 usage 报数不一致**：同一文本
   prompt_tokens 在不同通道上报 {323, 4699, 4876, 4433, 18778} 不等。推断该组注入了不同长度的
   隐藏前缀或各通道估算口径不同；本仓无法核实，**不**把任何一种解释写成事实。
4. p50 波动 2.8s↔6.9s 完全由通道 draw 决定；长尾来自通道失败切换（40s+，仍 200）。
   客户端重试（agent 路径已有 bounded retry + jitter，v685）是正确的对冲，chat 路径保持最小。

## 决定

- 保留 SSE 默认（ADR 0123）；不在客户端引入"强行命中 prefix"的实现（无法引入，也不值得）。
- 完成缓存保持 `NEXUS_LLM_COMPLETION_CACHE_URL` opt-out 部署纪律（缺失时 degraded 如实标注）。
- 探针脚本不做断言（比人 eye-ball 平均数更弱但更诚实）：数字落 ADR / CURRENT-STATE；
  任何阈值化都会变成 flaky 或被改小卡门（§146/§147 的 same lesson）。
- /healthz 的 llmCache 块已被 admin/observability 渲染（cont. 79+），本轮不重复发明展示面。

## 仍欠（诚实记录）

1. Embedding 通道在该 distributor 上 503（model_not_found）；web 侧走确定性嵌入兜底——如实记录，
   不谎称语义检索可用。
2. 第三轮 p50 2.85s 而第二轮 13s 量级：同一代码、同一 env，全是 draw。周期采样需要长跑，
   本片以三轮为界，不外推"稳定 p50"。
3. 真正的"通道固定"（channel pinning / 专用组）属 wkapi.pro 侧开通事项，本仓不代选供应商。
