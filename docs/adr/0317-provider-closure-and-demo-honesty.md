# ADR-0316 — Provider 关闭后的开发纪律：DEMO 诚实、证据冻结、确定性验证

- 日期：2026-11-24
- 状态：accepted
- 背景：用户通知"由于成本和用量控制原因，大模型 API 已经关闭，后续开发可能无法调用这个大模型 API"

## 背景

本项目此前用真实 provider（`gpt-6.2-sol` via aizzz.xyz）完成了六重实测：缓存 18498/18498、
跨会话 A2/B2 双 100%、358K token 世界推进的结构化状态流转与逐字引用、343K token 设计图上的
诚实 op 边界拒绝（`patches=[]`）、i18n 浏览器检查、轻量前缀数字与语言纪律；并在 358K 前缀上做了
跨会话交错缓存证明（B#1 89.9%、A#2/B#2 100%）。这些证据保存在
`docs/evidence/live-cache-hit-2026-11-21.md`，是在 provider 仍可用时真实采集的，不因关闭而失效。

## 决定

1. **不再发起真实 provider 调用**。后续所有验证走确定性/DEMO 路径；任何"实测通过"的说法必须能
   在关掉网络的状态下重放，否则不得写成当前可复现的结论。
2. **证据冻结而非抹除**。已采集的真机证据保留原样，并明确标注采集时间与"provider 现已关闭"，
   不用它冒充当前可复现的结果，也不因为 API 关闭而删除历史。
3. **§160 DEMO MODE 继续常驻**。未配置 provider 时 UI 必须显示 DEMO MODE；`capability` 只在
   provider 确实响应后才写 `real`（各 route 的 `result.ok` 成功分支），失败一律 503
   `provider-unavailable`，不伪造回答、不把未计价写成 `$0`。既有测试
   （`test_liveness.py`、`test_provider_live.py`、`test_auth_failure_classification.py` 等）已覆盖
   "缺少 `NEXUS_OPENAI_API_KEY`"的降级，无需重复造测试。
4. **后续功能以内容、确定性算法与本地验证为主**：世界回响语料、生成器流水线、缓存与拓扑判据、
   压测与行为模拟都不需要真实 provider，继续按既有门禁推进。

## 后果

- 用户"把大模型能力深度用起来"的要求由已完成的真机证据 + 现有的 StateGraph/缓存/长上下文实现兑现；
  关闭后不再产生新的真机读数，这一点在记录中如实说明。
- 任何未来声称"真 provider 验证"的证据都必须先恢复 provider 并重新采集，否则视为无效。
