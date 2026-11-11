# 共享库运行时统计审计（2026-11-12，只读）

**方法**：`scripts/audit-db-stats.mts`——对 local Postgres 55433 的 `pg_stat_user_tables` /
`pg_stat_user_indexes` 做纯只读查询。没有改动一个字节、没有建表、没有 `CREATE INDEX`。
本目录是"差点做的优化及其为何不做"的完整记录。

## 输出摘录

### 顺序读消耗 Top-15（seq_tup_read）

| 表 | rows | seq_scan | idx_scan | seq_tup_read |
|---|---|---|---|---|
| audit_events | 71 | 38 | 233 | 1,449,100 |
| snapshots | 1346 | 576 | 1469 | 775,611 |
| credit_ledger | 944 | 752 | 723 | 710,663 |
| notifications | 414 | 1611 | 409 | 668,870 |
| users | 14 | 61 | 7907 | 261,861 |
| moderation_cases | 282 | 859 | 753 | 242,238 |
| likes | 11 | 3422 | 397 | 236,858 |
| characters | 0 | 879 | 240 | 180,576 |
| agent_tasks | 384 | 443 | 1807 | 170,611 |
| assets | 464 | 207 | 1851 | 96,048 |
| api_tokens | 48 | 569 | 4 | 29,330 |

### 未使用索引（>1MB，自上次重启以来 idx_scan = 0）

`design_tokens_project_key_key`（10.2MB）、`design_nodes_name_trgm_idx`（9.8MB）、
`knowledge_chunks_tsv_idx`（8.6MB）、`design_tokens_pkey`（4.0MB）、
`design_nodes_parent_idx`（3.6MB）、`audit_events_pkey`（1.1MB）。

### >1000 行但 idx_scan = 0 的表

无。

### 最大表

`design_nodes` 220 MB / **8 行**（TOAST 大块：巨 JSON/文档）；`design_tokens` 27 MB / 31,650 行。

## 判读

1. **小表顺序扫描是对的**：likes/users/notifications/audit_events/moderation_cases/api_tokens
   全部小于 ~1000 行。PostgreSQL 在这种量级下顺序扫描**本来就是**索引最优路径；
   "seq_scan 高所以要加索引"在这里每个都是误判。
2. **idx_scan = 0 只说明自重启以来没人读**，不说明"它一辈子没用"。这些是较冷的搜索/设计期索引；
   没有更长观测窗时删除 = 盲删，§159 不允许。列出不修。
3. **design_nodes 220MB/8 行**是唯一真实异常：问题不在索引，在**载荷量级**——TOAST JSONB 文档
   不进缓存友好读法。它是 schema/设计模型存储决策，不是一条 migration 能讲完的事；留给 ADR
   决策（迁移/分片/归档），不在本次运维审计里动。
4. **moderation_cases seq>idx（859 vs 753）**是唯一边际案例——可能是它的开放工单查询按某个
   状态列过滤。加索引之前必须先读代码确认过滤列，否则会制造一个没有读流量的索引
   （想加 `status` 复合索引之前，先让它被 `EXPLAIN` 证明。§SC-75 收口：不迁）。
5. 本库统计自**最近一次 Postgres 重启**起算；`idx_scan` 不是累计值，横向对比时要按"观察窗"理解。

## 结论

**没有可落地的 migration。** 本次交付是：

- `scripts/audit-db-stats.mts`——可重跑的只读审计（运维周检/复盘都能用）；
- 本证据与判读，以及给下一位动它的人指出的两条具体线索（moderation_cases 的 `status`-过滤、
  design_nodes 的 TOAST 载荷）——任何一条落地之前，都要先读代码与 EXPLAIN，不现在编造。

未 push。
