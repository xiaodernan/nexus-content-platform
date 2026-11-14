# ADR 0134 — 「AI 节省总账」/admin/savings（v702，operator 视角的 prompt 缓存复用汇总）

- 状态：ACCEPTED（2026-11-14）
- 上游：ADR 0131（用户侧节省卡口径）、ADR 0130（admin 保存账本）、ADR 0133（回放账语义）
- 范围：`server/domain/llm-savings-admin.ts`（SQL 聚合）+ `lib/llmSavingsAdmin.ts`（纯函数）
  + `app/admin/savings/page.tsx`（新 admin 页）+ AdminNav 增加 "AI 节省" 入口

## 背景

/tasks 的节省卡解决的是"用户自己项目里省了多少"。operator 的问题不同：**整个库里哪些项目是
prompt 缓存复用的主力、总共复用了多少 token**。此前 admin/observability 只看得到进程内计数器，
看不到数据面累计，answered by 这一页。

## 决定

1. **口径与 v699 完全同源**：provider prompt_tokens_details.cached_tokens；tokensIn ≈ prompt_tokens
   （含缓存部分）；命中率 cached / tin；tin=0 → '—'（不写 0%）；加权命中率 = Σcached/Σtin。
   旧行（usage 无 cachedTokens 键）一律按 0 计——页面上写明，不伪造成命中。
2. **只读、聚合在库里做**：`count(*)::text` + `sum((usage->>...)::float8)` 经 drizzle；
   join projects + left join users（owner 邮箱）；group by project，order by cached desc，limit 50。
   不落内存、不扫出库；单条 projects 出错 → 页面一句"读不到账本"，不画假表（§3）。
3. **只对 role=admin**（同 dead-letters / observability 口径）；未登录/非 admin 各给一句拒绝。
4. **不写美元金额**（§159 无价格表）；"缓存复用"≠"省钱"，页面措辞说清。
5. **列项目名链回 /tasks/<id>**：operator 发现热点项目后能一跳看到该项目的请求账。

## 验证（本机，端到端实测）

- 单元：`llmSavingsAdmin.test.ts` 7 用例（封顶/null 口径/加权/格式化）；tsc 0；eslint 0。
- **真实库实测**（docker psql 55433 + 本地 dev 实例）：该库目前只有一个老项目
  （cache-probe 1794562346513，3 轮真调用），全库加权命中率 5%、复用合计 2.1 万 tokens；
  表按 cachedTokens 降序 —— cache-probe 行首列（20,842 / 28,240 / 74% / 紫色渐变条）
  与 v699 页面所见一致。50 行渲染 + 空态不写假数字。
- 浏览器实测（playwright + 新 admin 夹具账号，promote via SQL，与 e2e-admin-fixture 同款纪律）：
  登录 → /admin/savings → 50 行 + 4 tile 全部渲染；AdminNav 当前项为"AI 节省"。
  截图留存于本轮回复（不入库）。
- 未该做的没做：不加价格字段、不改 admin 权限模型、不顺手重排别的 admin 页面。

## 仍欠（诚实记录）

1. ~~只按项目、不按用户维度切片~~：v702.2 已加「按用户」段（GROUP BY owner，按 cached desc
   排序，前 25 位；同口径同封顶同脚注语义）。owner 行缺失的行不计入用户维度——不猜归属。
2. 全库只有一行真缓存数据；命中率 5% 是真实数字，不代表典型分布，需真跑一周后再看。
3. 页面以 `force-dynamic` 渲染，管理员反复刷新没有缓存——数据面没有建物化视图的必要
   （当前量级）；若项目行数破万再考虑 mview。
