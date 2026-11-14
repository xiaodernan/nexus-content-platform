# ADR-0268 — 死信两条读路径并存：v689 直读 Redis（人向）+ v738 服务原生（机器向）

- 状态：两片均已落地（v689 @349dd6c8 = /admin/dead-letters 直读 Redis，本片 v738 = ai-service 原生端点）且 semantics 对齐
- 日期：2026-11-15
- 关联：ADR-0121（死信有界 LTRIM）· ADR-0122（v689 死信巡检器）· ADR-0262（三层账）· v687/v692 并轨纪录

## 背景

ai-service 把耗尽重试的毒消息 LPUSH 到 Redis（`nexus:ai:dead`，LPUSH 头=最新，LTRIM 有界）。
2026-11-13 v689 落地 web 侧只读巡检页 `/admin/dead-letters`：web 进程直接 ioredis 连 Redis 读
`nexus:ai:dead`（cursor 分页、JSON/NDJSON 导出、耐毒 parseEntry）。理由当时成立：运维要的
是"一眼扫一眼"，ai-service 不该为运维面增开端口。

问了一个新问题：**机器消费方**（e2e fixture、admin API 探针、未来的审计导出/合流工具）
要读死信时没有服务原生路径——web 页顶格 100/页、给人看、形状是 `DeadLetterPublic`；
而外部消费方若也直连 Redis，等于把 `nexus:ai:dead` 的 key 形状变成跨进程公共契约（§16 的
同一份真值不能有 N 个出口的纪律）。

## 决定

**两条都留，职责收窄：**

1. **v689（web 直读）保留且仍是唯一的人向页面**：`/admin/dead-letters` 不改——
   它早已支持 0 条空态/各降级面/NDJSON 导出，改写路线等价于回归用户功能。
2. **v738（ai-service 原生）新增 `GET /v1/ai/jobs/dead-letters?limit=`**：只读、
   `limit` 缺省 50 上限 200、`total` 报裁剪前真实总数、内容全部来自 `Job.public()`
   （payload 提示词原文**结构上不可能外泄**）；非 lifespan 启动如实 503；
   窗口按 `job.finishedAt` 降序归一——内存后端（append）与 Redis（LPUSH）语义一致，
   不再靠后端的"尾部/头部"假设选边。无 key 改动、无写路径。

**semantics 对齐（验至字节）：** 两条读得到同一批条目、同一条目形状（v689 的
`malformed` 容错保留不变；v738 的 `payload` 剔除走 `Job.public()` 单一出口）、
同一排序（新在前）。

## 代价与已知边界（如实写）

- `nexus:ai:dead` 的 key 形状仍是**跨进程公共契约**（v689 已在明了这一点上 ADR-0122 立约）；
  v738 是它的第一份规范化读法，将来若 key 变更，两条一起迁移。归一真值： ai-service 是唯一真值 owner。
- 两份实现各自一个贡献者（v689 并轨他线），互不替对方——**这是有意的**，不是漏改：
  v689 给人看的 UI 面（NDJSON 导出、LPUSH 说明、空态），v738 给程序消费的机器面（有界窗口、total 原样报）。
- 本机内存锯齿下不跑 verify:spring-cloud 全套；本片不触 Java 侧（无新 maven 依赖），
  不触任何现网队列写入路径——ai-service 端点只读，RedisList 一条都不删（本片测试毒消息如数清理，DB15 隔离验证过）。
- 坑一则（记录）：ai-service 有自己的 .env，`NEXUS_REDIS_URL` 自动指向共享 Redis——
  本片测试用 DB15 + monkeypatch 隔离，绝不往 `nexus:ai:dead` 写一条测试消息；确定跑了生命周期回收后验证残留 0。
