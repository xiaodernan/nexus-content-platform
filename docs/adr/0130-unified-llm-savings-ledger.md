# ADR 0130 — 统一 LLM 省钱账本：`/healthz` + `/metrics` + admin 观测卡

- 状态：已落地（v698）
- 日期：2026-11-14
- 关联：ADR 0128（进程内 single-flight，仍欠 ②）、ADR 0129（跨进程 single-flight，仍欠 ②）、
  ADR 0119（Redis completion cache）、ADR 0123/0126（`llmCache` / `llmLatency` 既有字段）、
  ADR 0095（声称必须有门读）、ADR 0114（显式拒绝无效值）、ADR 0094 X4（不惩罚正当改动）
- 关闭：ADR 0128 仍欠 ②、ADR 0129 仍欠 ②（省钱账本进 `/healthz` + Prometheus）

## 1. 背景

v690/v694 已把 completion cache 状态与 provider 往返延迟接到 `/healthz` 和 admin
观测卡，但 v696/v697 新增的两层 single-flight **只有进程内账本，运维完全看不见**：
`FlightStats.coalesced` / `DFlightStats.lock_failures` / `peek_misses` 没有任何出口。
用户关心的"缓存命中率 / token 利用效率"于是缺了最关键的一块——**省下的真调用数**。

同时 ai-service 之前没有 `/metrics`，Prometheus 侧只能看到 web 的进程内计数器。

## 2. 决定

### 2.1 后端：单一真值 + 纯渲染

- `Registry.llm_flight_state()` 把 `SingleFlight` / `CompositeFlight` 的读数整理成
  `/healthz` 的 `llmFlight`；没装 flight → `null`（不编造"省了 0 次"的假账本）。
- `metrics.render_llm_metrics(service, cache, flight, latency)` 是**纯函数**：
  吃 `/healthz` 同一份 dict、只产 Prometheus 文本，不读全局、不发网络，门可直接对拍。
- `/metrics` 返回 `text/plain; version=0.0.4`，与 `/healthz` 同源，没有第二份计数。

### 2.2 契约与前端（前后端协同）

- `HealthResponseSchema` 新增 `llmFlight`（`null | 精确 zod 形状`），
  `npm run contract:export` 重生成 `contracts/health.schema.json`（**只此一个契约文件变化**）。
  既有字段不动；`default(null)` 让旧报文仍能被 web 解析。
- `apps/web/src/lib/env.ts` 的 `AiFlightState` 如实透传两层账本；
  `admin/observability/page.tsx` 增加四行：mode、local/cross-process coalesced、
  本进程 provider 调用数、timeouts / lock failures；未接线显示 `—`，并明确写
  "dash 表示该层没接线，不是省了 0 次"。

### 2.3 五条诚实边界（全部有门）

1. **`coalesced ≠ cache hit`**：合并省下的是一次重复调用，不是缓存命中。
   Prometheus 里 `nexus_llm_cache_hits_total` 与 `nexus_llm_flight_*_coalesced_total`
   是两个独立 family，判据逐项对拍，禁止把 coalesced 加进 hits 粉饰命中率。
2. **两层 flight 分别计账、绝不相加**：`local.real_calls` 是"本地 leader 执行下一层"
   的次数（装了跨进程层时下一层可能只是 peek），**不等价于真 provider 调用**。
   `provider_calls` 只取自最后接触 provider 的那一层；判据显式断言它
   `!= local.real_calls + distributed.real_calls`，防"总省了多少"的假总数。
3. **未启用就报 0，不编造流量**：`cache=None` / `flight=None` 时只发 `*_enabled 0`，
   不发任何看起来像"有流量"的 counter。
4. **进程内、重启清零**：HELP 文本、文件头、admin 卡说明都写明不是集群 SLO。
5. **标签转义 + 显式拒绝脏值**：服务名 / backend / namespace 按 Prometheus 规则转义
   `\\` / `"` / 换行（计网侧输入校验，防标签注入伪造样本行）；
   `NaN`/`Inf`/负数/`bool` 一律抛 `ValueError`，不当成 0 静默吞掉（ADR 0114）。

## 3. 门

`apps/ai-service/tests/test_llm_flight_ledger.py`（23 条，与 `test_health.py` 合跑）：

- 判据纯函数 `_judge_*` 单一真值，真渲染器 / `/metrics` 端点 / 正向对照臂 /
  变异臂共用；纯函数可直接对拍字符串。
- 覆盖：账本逐项等于输入真值、未启用报 0、非有限/负数/bool 显式拒绝、
  标签引号与换行注入、`/healthz` 契约校验（`local` 与 `local+redis` 参数化）、
  `/metrics` 与 `/healthz` 同源对拍、默认无 flight 报 `null`。
- **真组件退化臂**：把 `ai_service.app.render_llm_metrics` 换成"永远报 0"的渲染器，
  `/metrics` 必须被判据判红——证明端点真的走被测纯函数，不是另一份手抄。
- 6 个恒跑变异臂：coalesced 灌进 hits、两层相加、缺进程内声明、非有限值、
  未启用却伪造流量、标签注入；另 1 个正向对照臂证明判据不惩罚正确实现。
- 前端：`apps/web/test/env.test.ts` 新增 `llmFlight` 透传门（7/7 绿）。
- 结果：ai-service 相关 23 passed；离线 ai-service 全套 326 passed / 20 skipped；
  `npx vitest run packages/schemas/test/contract.test.ts apps/web/test/env.test.ts` 20 passed；
  `tsc -p packages/schemas` 与 `tsc -p apps/web` 零错误；四个改动 TS/TSX 文件 eslint 零 finding。
- **未完成的验证（如实记）**：全量 `npx vitest run` 在本宿主跑了 21 分钟无输出后被停掉
  （常年仅 0.3–0.6GB 物理内存，全量套件起不来/跑不完是已知宿主限制，见
  `docs/PERFORMANCE.md` 与本仓长期笔记）。**不把它当绿、也不谎称全树绿**；
  针对本片改动面的定向门全绿，全量 vitest 仍欠。

## 4. 仍欠

- **本机无法渲染验证 admin 观测卡**（`next start` 在这台宿主起不来），
  前端只做到类型检查 + vitest + eslint + 源码级 data 标记；像素/视觉验证仍欠。
- `/metrics` 只报 ai-service 自己的计数；没有 scrape 配置、没有跨副本聚合，
  也没有把 `llmFlight` 的 Prometheus family 接进仓库现有告警规则。
- 计数器都是进程内累计值，`provider_calls` 与 `llm_latency_calls_total`
  口径刻意不同（后者排除缓存回放、含失败；前者只算真调用），未做统一 cross-check 门。
- admin 卡里 `timeouts / lock failures` 取的是 local.timeouts 与
  distributed.lock_failures；若只想看一层，需要更细的筛选 UI。

## 5. 复用价值

- **"省钱"这类指标最容易被做成虚荣指标**：合并 / 命中 / 真调用三种口径必须拆成
  独立 family 并用判据逐项对拍；判据里直接写 `!= 两层之和` 比写注释有用。
- **分层优化后的账本不要相加**：内层计数的是"执行下一层"，不是"打 provider"。
  只有最后接触外部资源的那一层才有资格报真实调用数。
- 新增可观测字段走完整链路（zod → JSON Schema → Python `/healthz` → web zod 解析 →
  UI 行），并用 `contract:export` 保证单一真值；`default(null)` 让旧报文仍可解析，
  是零回归的关键。
- 纯渲染函数让 Prometheus 输出能被门直接对拍；标签转义既是格式问题也是
  **输入校验**问题（换行能伪造样本行）。
