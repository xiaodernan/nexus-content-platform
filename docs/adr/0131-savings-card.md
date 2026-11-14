# ADR 0131 — 用户侧「AI 节省账单」（/tasks/<项目> 缓存复用卡，v699）

- 状态：ACCEPTED（2026-11-14）
- 上游：ADR 0125（prefix-cache 实测）、ADR 0126/0129/0130（计数与台账）、v692（TasksLedgerLive 展示 cachedTokens）
- 范围：`lib/savings.ts`（纯计算）+ `server/domain/savings.ts`（owner-gated 聚合）+
  `SavingsCard.tsx`（client 动画卡）+ `TasksLedgerLive` 插槽 + /tasks/[projectId] 页

## 背景

provider 的前缀缓存（wkapi.pro gpt-6-sol）与应用级 Redis 完成缓存，此前全部是**运维视角**
（/healthz、admin/observability、Prometheus /metrics）。用户侧唯一可见的是 /tasks 行里
"· 缓存 N" 一个小字。用户反复问"为什么命中率这么低/能不能省"——答案不在他们的眼前。

## 决定

1. **卡片放在 /tasks/<项目> 页顶部**：那是账本页（用户自己看任务消耗的地方），不是实验页；
   同一批数据（`agent_tasks.usage`），不建新表、不建新接口、不引入价格表。
2. **口径只认 provider 前缀缓存**：`usage.cachedTokens`（prompt_tokens_details），
   tokensIn ≈ prompt_tokens 含缓存部分；命中率 = cached / tokensIn ∈ [0, 1]。
   应用级 Redis 完成缓存（整条回放）不产生 usage，本卡**不算进来**——那份数在 /healthz（ADR 0130）。
   两者不同口径，界面上写在脚注里，不混。
3. **SQL 聚合**（count/sum/filter in Postgres），不落内存、不二次扫描；任何脏数据异常 →
   `null` → 页面该格不渲染（§3：读不到不装读到），绝不 500。
4. **owner 门**：与 `listProjectTasks` 同一道门（projects.ownerId = actor，isNull deletedAt），
   且 `isUuid` 提前挡形状不对的 id（同 22P02 防线）。未授权/不存在/异常统一返回 null。
5. **诚实 UI**：空态（0 轮）说"还没有跑过任何一轮"；tokensIn=0 时命中率渲染 '—' 而不是 0%；
   legacyRows（v692 之前的行，usage 无 cachedTokens 键）单独报出不混进新行；
   不写美元金额（本仓无价格表，§159）。
6. **动画只发生一次**：~1.1s count-up（easeOutExpo）+ bar 宽度 transition；
   prefers-reduced-motion 直接落终值。字体 font-mono tabular-nums；品牌渐变只用于
   大数字（text-gradient-brand，与全页品牌标题同一笔法）。

## 验证（本机，诚实）

- `savings.test.ts`：7 用例（命中率上限收敛、null 口径、legacyRows 不负、NaN 收敛、空态）。
- tsc `apps/web` 0 error；eslint 6 文件 0 输出；vitest 三个相关 suites 31/31。
- dev server（本仓树，127.0.0.1:3101，临时实例，验后即停）：
  `/tasks/<stranger-uuid>` 编译通过且 404（owner 门生效，无编译错）。
- **真实 DB 端到端**（docker psql 55433）：cache-probe 项目
  （3df1a14c-8981-4455-936d-186238e40c78）3 轮真调用：rows_with_usage=3/cache_field=3，
  tokensIn=28240，cached=20842，hitRate=73.8%；stranger actor → null；bad id → null；
  drizzle 路径（.savings_harness，临时，未入库）owner/stranger/bad-id 全通。
- 像素级渲染**未验证**（浏览器截图通道本环境 operation_failed）；以编译 + tsc + 单测 +
  真实数据全链路替代，UI 结构为既有 token 组合，风险点已在剩余（见下）。

## 仍欠（诚实记录）

1. 像素级/a11y 浏览器实测（需 playwright 或可截图环境）。
2. 应用级 Redis 完成缓存对用户可见的价值面（ADR 0130 在 admin；用户侧无对象可展示，
   因为它不进 usage——如需用户侧，需要新写入侧口径，另议）。
3. /tasks 分页后卡片是**全量 SUM**（不止当前 50 行），大项目请观察 SQL 计划；当前 444 行
   量级无索引压力，SQL 全走 agent_tasks_project_idx。
