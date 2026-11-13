# ADR 0118 — 把 v684 抖动组件接进生产重试路径（v685）

- 状态：ACCEPTED（2026-11-12）
- 上游：ADR 0117（抖动组件）/ 0114（有界重试）/ 0115（进程内熔断）/ 0116（跨实例共享熔断）
- 范围：`apps/ai-service`（纯新增接线 + 旋钮，零生产回归）

## 背景

v681 把 `min(base·2^i, cap)` 的指数退避接进了 `complete()`。v684 造了可复用的
`jitter.py`（full / equal / decorrelated / none 四策略），但**只做了组件 + 门 + 同进程 A/B
实证，没有接生产**——接线清单写在 ADR 0117 的"仍欠"。

不接线的代价：重试/熔断三根柱共同的 thundering herd 风险（多实例同一拍算出完全相同的退避，
同时醒来、再次打挂上游）始终没在生产真正缓解。`none` 是确定性算法，集群里每个副本都按同一
公式睡眠，抖动组件成了"摆设而非能力"——这正是 Java v669a 记过的同类 trap（ADR 0095：配了
却没人取用）。

## 决策

把 `jittered_backoff` 接进 `OpenAICompatibleProvider._backoff`：

1. **默认 `jitter_strategy="none"` 字节级零回归**：`none` 策略区间零宽 `[exp, exp]`，
   直接返回 `max(exp, Retry-After)`，**根本不调 rng**——生产默认路径与 v681 完全一致，
   不引入任何随机源、不改变异常/延迟语义。
2. **opt-in 开启**：`NEXUS_LLM_JITTER_STRATEGY=full|equal|decorrelated` 从配置经
   `Settings` → `Registry` → provider 构造参数真注入（ADR 0095：旋钮必须真变成运行实例，
   不是摆设）。默认 `none`，生产环境不主动开（避免未经压测就改线上退避行为）。
3. **decorrelated 的 prev 跟踪**：`_backoff` 每次采样后存 `self._last_sleep`，下一拍复用；
   `complete()` 开头重置（一次逻辑请求重新起步），语义正确。
4. **判据升级（关键纪律）**：`_judge_backoff_shape` 改为复用 `jitter.bounds()` 单一真值
   （ADR 0095），`strategy` 入参；**Retry-After 语义严格保留**——真实场景中只有"带头的那一拍"
   响应带 `Retry-After`，后续拍回指数退避，故标量 `retry_after` 在判据里视为**仅第 0 拍生效**，
   RA 校验前置（`waits[0] >= ra`），且不钉单调不减（[0.05, 0.02, 0.03] 正当）。
5. **退化诚实**：`bounds()` 对非法策略/参数抛 `ValueError`，接线层不吞；`rng` 注入失败由
   调用方负责（生产传 `random.uniform`，不读全局随机状态）。

## 后果

- 重试柱现在是**真正可削峰**的：opt-in 开 `full` 后，集群级退避从"同拍尖峰"变成"打散的雨"。
  同进程 A/B（ADR 0117）已实证 64 实例碰撞对数从 2016 降到 269（13.3%）。
- **零回归**：CI 全套 209 passed / 9 skipped（v684 基线 205/8 → +4 门），`none` 路径与 v681
  字节级一致，全部既有重试门（含 RA 尊重、404 豁免）原样通过。
- **真线路实证**：opt-in 全套 217 passed / 1 skipped，新增 `test_live_jitter_enabled_*
  ` 在真 `wkapi.prov/v1`（`gpt-6-sol`）上确认开抖动不破坏健康路径、偶发退避也落在区间内。

## 仍欠（诚实记录，不为没做的造门）

1. **生产默认仍 `none`**：抖动能力已就绪但需压测评估后再默认开启；CLI/部署文档未写
   `NEXUS_LLM_JITTER_STRATEGY` 推荐值。
2. **embedding provider 未接抖动**：`OpenAICompatibleEmbeddingProvider.embed` 是单发调用、
   重试语义不同（embedding 网关 `503` 在 wkapi 上未实测），暂未接——避免未验证就改；
   若后续给 embed 加重试，同款接线可复用。
3. **v683 跨实例共享熔断的半开探测协调**仍未做（ADR 0116 仍欠），抖动只缓解重试同拍，
   不解决共享 breaker 的 HALF_OPEN 跨进程探测计数；两者正交，单独排期。
