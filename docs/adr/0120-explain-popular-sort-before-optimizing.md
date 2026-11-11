# ADR-0120：发现页 popular 排序先真库 EXPLAIN 再谈优化——拆查询是冷启动假象，物化计数器欠火候

- 状态：Accepted
- 日期：2026-11-11
- 相关：ADR-0117（观测优先、无实测尖峰不加闸门）、ADR-0119（加 deadline 前先量 loader 墙钟）、§SC 第四十八片

## 背景：一个"看起来该优化"的热点

`discover()` 主查询（`server/domain/social.ts:417`）在投影里带 3 个相关子查询计 likes / comments / remixes，`popular` 排序又嵌第 4 个 likes `count(*)`：

```sql
ORDER BY published_projects.views
       + (select count(*) from likes where likes.project_id = published_projects.project_id) DESC
LIMIT 24
```

读码直觉有两条"明显该改"：①相关子查询对每行求值、 likes 被算两遍；② `LEFT JOIN snapshots` 为了取封面 document，把整张快照表拖进排序。按 ADR-0117/0119 的纪律，本片**不动查询**、先在真库上量，用数字回答"到底是不是热点、该往哪改"。

真库环境：`nexus-postgres`（localhost:55433）健康，测试库实测 `published_projects=151 / likes=11 / comments=8 / remixes=2 / snapshots=1335`。索引齐备：`likes_project_idx`、`comments_project_idx(project_id,created_at)`、`remixes_source_idx`、`published_visibility_published_idx(visibility,published_at)`。

## 决定：三条实测，两条证伪，一个拐点

### 1. 冷启动数字是假象——297ms 的 `snapshots Seq Scan` 不能当卖点

首次 `EXPLAIN (ANALYZE, BUFFERS)` 跑 `popular` 得 Execution **297ms**，其中 `Seq Scan on snapshots`（1335 行含大 jsonb document）独占 **206ms（69%）**，看着像"排序逼出整表 hash、首屏被拖垮"。但这是**首次把 jsonb 从磁盘读进 shared_buffers 的一次性成本**。

同一 psql 会话内热缓存连跑 3 次（本 ADR 的 bench 脚本在 `test-results-mine/sc48-bench.sql`，辅助目录不提交），稳态数字完全不同：

| 查询（热缓存 Execution，第 2/3 次）| 耗时 | Planning |
|---|---|---|
| A 现有 `popular`（含 snapshots join + document）| **1.29 / 1.42 ms** | 0.51 / 0.57 |
| B 阶段1（去掉 snapshots join，只取 24 行 + count）| 0.88 / 1.34 ms | 0.36 |
| C 阶段2（主键 `= ANY(ids)` 补 24 份 document）| 0.29 / 0.38 ms | 0.09 / 0.19 |
| D 现有 `new`（对照组，索引倒扫提前停）| 0.35 / 0.48 ms | 0.50 / 0.69 |

**结论：现有 `popular` 热缓存本身 ~1.3ms。** 把它拆成"阶段1 查 24 行 + 阶段2 补 document"是**净亏的伪优化**：B+C 约 1.2ms 无实质收益，却多一次 DB 往返、多一次 planning、破坏 `discover` 单一查询的原子性，并在"阶段1 拿 24 行 → 阶段2 补 document"之间开一个读一致性窗口（期间若下架/改可见性，两阶段能拼出单查询永远拼不出的混合快照）。冷启动那 206ms 应在连接预热 / 缓存回填里解决，不是改查询结构。

> 这正是 ADR-0119 已在 loader 墙钟上钉过的同一条：**没分清冷/热就下结论，等于用观测亲手造一份假热点**。

### 2. 物化 likes 计数器：方向对，但对当前体量欠火候

`new` 排序走 `published_visibility_published_idx` 倒扫、`LIMIT 24` 提前停，22ms 冷 / 0.4ms 热，从不扫全表；`popular` 的排序键含相关子查询，优化器无法用索引提前停，必须对所有候选行算出 `views + likes_count` 再 top-N 排序，故执行计划里 `SubPlan 4` 的 `loops` = 候选行数（真库 135），投影 `SubPlan 1` 又对最终 24 行重算一遍——**同一个 likes count 算 159 遍**。这是真实的 O(候选行数) 结构。

但真库只有 135 个候选，likes 表 11 行，每次 `Seq Scan likes` 仅 0.016ms，159 遍合计约 2ms，**根本不是当前瓶颈**。若为此引入三张互动表的冗余计数列（likes/comments/remixes），就要在 `toggleLike` / `addComment` / `remixPublication` 等所有写路径维护计数器，并处理并发增减、删除回滚、历史回填的一致性债——为一个不存在的规模付真实复杂度，得不偿失。这与 ADR-0117"无实测尖峰不加并发闸门"是同一判断。

### 3. 拐点实测：逼近万级候选时，正确方向是物化计数列

为把"什么时候才值得改"钉成数据而非拍脑袋，用 `generate_series` 在事务内造 **20000 个候选 publication + 7101 行 likes**（唯一合成数据、同事务 `ROLLBACK`、零污染真库；脚本 `test-results-mine/sc48-scale.sql`），热缓存连跑 2 次对比：

| 20000 候选下的排序形态 | Execution | `SubPlan` 调用 |
|---|---|---|
| 当前相关子查询 `ORDER BY views + (count…)` | **22.9 / 28.3 ms** | 排序 `loops=20000` + 投影 `loops=24` |
| 物化 `likes_count` 列后 `ORDER BY (views + likes_count)` | **2.17 / 2.33 ms** | 0（纯列 top-N 排序）|

**约 10–12x 差距，拐点在万级候选已经明确**：此时 O(N) 相关子查询从 ~1ms 涨到 ~25ms，而物化列几乎不随候选数增长。故记下数据驱动的触发阈值与正确方向（供将来证据到位时执行，本片不做）：

- **触发阈值**：`published_visibility='public'` 的候选数逼近万级（或 `popular` 的 `maxLoadMs` / `recentLoads` 出现持续数十 ms 且 `sort=popular` 占比高），再评估物化。
- **正确方向**：在 `published_projects`（或专用计数表）物化 likes/comments/remixes 计数，写路径事务内增减；**不是**拆 join、**不是**微调相关子查询、**更不是**给共享 `db/client.ts` 加全局 `statement_timeout`。
- **仍未解**：即便物化计数，`popular` 排序仍是 O(N log N) 全量排序、`LIMIT` 无法提前停；万级以下无感，十万级需另议（keyset + 预计算榜单），但那更要等真实流量证据。

## 后果与仍欠

**本片零代码改动**（`social.ts` 主查询、索引、`db/client.ts` 一律未碰），交付的是一份可复现的真库画像与决策门槛：把"要不要优化发现页查询"从读码直觉变成 297ms 冷启动假象 vs 1.3ms 热稳态、135 候选 vs 2 万候选拐点的实证，防止将来有人拿冷启动数字或"相关子查询看起来慢"去拆查询 / 加计数器。

**仍欠（都要等证据，属克制非欠账）**：

- 候选数逼近万级时的物化计数列方案（写路径一致性、历史回填、判据）；
- 连接预热 / 缓存回填策略（解决冷启动 206ms，而非改查询）——与 `db/client.ts` 连接层看门狗（ADR-0119 仍欠）同属连接生命周期范畴；
- 十万级 `popular` 的 keyset / 预计算榜单。

## 验证（不粉饰）

- 真库 `EXPLAIN (ANALYZE, BUFFERS)`：现有 `popular` 冷 297ms（snapshots 206ms）/ 热稳态 1.29–1.42ms；阶段1/阶段2 热 0.3–1.3ms；`new` 热 0.35–0.48ms。12 次热缓存采样，取第 2/3 次稳态。
- 2 万候选合成拐点：相关子查询 22.9–28.3ms（`SubPlan loops=20000`）vs 物化列 2.17–2.33ms，2 次各；合成数据同事务 `ROLLBACK`，真库行数前后不变。
- **本片无判据净增、无 typecheck / 全仓 vitest 变化**（零代码改动）。SC-49 的全仓数字见 ADR-0121 与 ROADMAP §SC 第四十九片。
- bench 脚本置于 `test-results-mine/`（辅助未跟踪目录，按惯例不提交）；本 ADR 内联关键数字与表结构，读者可复跑。
