# ADR 0126 — /healthz 暴露真实 provider 往返延迟（v694）

- 状态：ACCEPTED（2026-11-14）
- 上游：ADR 0113（应用级完成缓存）、ADR 0123/0124/0125（缓存字段与在线探针）、SPRINGCLOUD-BLUEPRINT（P0："在观测页暴露这些数，不造指标"）
- 范围：ai-service latency_meter + /healthz llmLatency 块 · contracts · web env.ts · admin/observability 两行 · env.test

## 背景

Blueprint P0 要求"量化 p95、错误率；在观测页暴露这些数（不造指标）"。此前 /healthz 只有 llmCache
（命中数）没有时序；探针（ADR 0125）是手工一次性测量，不能驱动面板。

## 决定

1. **meter 挂在 provider 层，不挂在 route 层**：`CachedLlm` 在本 meter 之上——完成缓存回放（数毫秒）
   不计入；只有真实 `OpenAICompatibleProvider.complete` 往返（成功或最终异常）被统计。
   execution.py 的插装已移除（else 分支全部还原）。
2. **窗口 = 最近 1024 次往返**（内存 ring），p50/p95/max/avg 在该窗口上**精确**计算
   （≤1024 个样本排序后取 nearest-rank），不做直方桶近似、不外推。
3. **进程级、重启即零**：不冒充全局 SLO；面板行注明口径（与进程计数器同款说明）。
4. **错误口径** = provider 往返抛出异常（httpx 网络失败 / 5xx 重试耗尽 / 契约解析失败）。
   我们自己对 provider 输出的 502 校验失败不计入 errors（那是"provider 成功、我们拒绝"）。
5. 不引入新依赖：httpx 已在；meter 纯stdlib（deque + lock + math）。

## 验证（本机）

- `tests/test_latency_meter.py`（新增 4 条）：空窗零、百分位 nearest-rank、窗口上限、非有限样本忽略。
  ai-service 253 passed / 14 skipped（本片前 249）。
- 真实 provider 往返实测：一次真实 /v1/ai/chat 后 `/healthz.llmLatency.calls` 递增，
  `errors` 与窗口内异常一致；重启后清零（进程级）✓。
- web 端：HealthResponseSchema + 契约已再导出（contract:export）；admin/observability
  两行新数据（calls/errors、p50/p95）；env.test.ts 透传用例 + 既有用例全绿（6/6）。

## 发现（诚实记录）

1. **本机出现两个 ai-service 部署并存**：opencode 侧（本仓 working tree + 本仓 .env，
   NEXUS_MODEL_EMBEDDING=none → 如实报 embedding unavailable）与 WorkBuddy/PortableGit
   侧（00:04 起占用 127.0.0.1:3200；其 /healthz 报的是真实 provider 503 探针
   model_not_found——说明其 env 配置不同）。两者抢占同一端口，后启动者胜；本仓
   dev-ai.sh 无自动重试，抢占结果由外部调度决定。**本仓不杀他人进程**（与 careeros-*
   同纪律）；v694 面板渲染依赖 /healthz 的 schema 形状而非部署方实现，两种部署
   对本片消费方行为一致。
2. provider 级 meter 与 route 级 meter 的语义差（含 cache replay vs 真实往返）
   在这条链上被实测验证：route 级 calls=8（含 1 次 app 缓存命中 111ms），
   改 provider 级后 replay 不再计入。
3. 错误通道泄露被避免：meter 不记录任何 prompt/凭据，只记时长与失败位。

## 仍欠（诚实记录）

1. 两个部署并存期间，"面板上的 llmLatency" 是 WorkBuddy 侧那一实例的（窗口从其启动时间算）。
   本仓 working tree 的实例验证过但默认不占端口——部署纪律写回 ROADMAP v694：
   **端口抢占属部署决策，需人工裁决保留哪一份**。消费方（web admin/observability）对
   无 `llmLatency` 的部署照样成立：schema 该字段 optional default null，UI 渲染 '—'，
   不崩、不冒充有数。
2. embedding 通道现状如实：wkapi.pro 该组对 text-embedding-3-small 返回 503 model_not_found；
   不谎称语义检索可用（ADR 0125 已记录）。
3. 跨实例聚合（多副本 SLO）属 M9 观测拓扑，不在本片。
