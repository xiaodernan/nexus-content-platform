# ADR 0140 — 为什么没有上 RabbitMQ（Redis 有界死信 vs Spring Cloud Stream / RabbitMQ）

- 状态：ACCEPTED（2026-11-14）
- 范围：Spring Cloud Blueprint P1（`docs/SPRINGCLOUD-BLUEPRINT.md`）
- 前置：v688 / ADR 0121（Redis 死信有界化）、v689 / ADR 0122（admin /dead-letters 面板）

## 背景

"作业平面目前是 Redis 队列 + 死信；没有 Kafka/RabbitMQ 实装的证据，"消息队列真跑通了"不成立"。
用户的需求是一句话：**毒消息不能无限堆，送错的人要能看见它**。§159 不许我们写一个"看起来跑通"但
实际上只是 demo 的 RabbitMQ。约束条件：
- 单宿主 Compose（这台 16GB 的机器），不是分布式部署；
- 现有五个 Spring Cloud 服务已在 lb/Eureka/Config/Actuator 上全绿，不需要再给死信多一个
  有状态故障面（RabbitMQ 本身需要持久化队列管理、保活、镜像策略、重启恢复——都是分布式系统问题，
  现阶段没有运维人）；
- 死信的真实需求体量：本地 + 生产级推测 ≤ 几十条/秒，LTRIM 一 cap 就能解决；当前已跑
  `nexus:ai:dead` 上限 500，admin 面板可只读检视/导出；
- 从来没有两个以上的真实独立消费者需要广播/主题分发。

## 决定

1. **保留 Redis 有界死信。** 不移植 Spring Cloud Stream / RabbitMQ Binder 到本仓。
2. **触发"重新评估 RabbitMQ"的条件铁律**（满足任一才开始选型）：
   - 真实后端连续 7 天 p99 enqueue latency 超过 250ms（当前 `verify:perf-jobs` 测出 < 5ms）；
   - 两个以上独立进程需要消费同一队列（广播/主题）；
   - `nexus:ai:dead` 被 LTRIM 挤掉超过 3 条合法死信（500 足够，说明消费压力失配）；
   - 运维团队有能力接入镜像队列 + 保活 + 备份。
3. **在满足以上条件之前，任何人提"太简陋，上 RabbitMQ"一律回复：没有消费方需求，不写装饰性代码。** §159。

## 验证（本仓现有）

- `verify:dead-letter-*`：dead_letter cap 真实 LTRIM 动作由 r/dedicated Redis 实例上 db7 实测过；
- `/admin/dead-letters`：admin 可只读检视/导出；
- `ai-service/resilience.py`：bounded retry 接了 jitter break，重试耗尽后真进 dead-letter；
- `verify:service`：整套服务套件全绿。

## 仍欠（诚实记录）

1. 如果评估条件满足（主题分发/fan-out 需求出现），本 ADR 需升级到 Spring Cloud Stream RabbitMQ binder
   的完整选型记录。今天没有这种需求，因此不写。
2. 死信检视 UI 没有"批量修复 → 重新入队"动作：当前设计是只读 + 导出，够用；真要批量修复，
   那是一次新的安全评审，不是一次重构。
