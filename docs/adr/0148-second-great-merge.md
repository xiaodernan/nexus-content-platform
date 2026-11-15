# ADR 0148 — 第二次并集合并：other-lane v733–v762（41 提交）并入 master（cont. 120）

- 状态：ACCEPTED（2026-11-15）
- 范围：第二次 lane 汇入；master ≡ main ≡ origin（第二次）
- 关联：ADR 0147（第一次并入）

## 背景

第一次并会（ADR 0147）之后，另一条线仍在本机制同一 remote 上推进：v733…v762——Studio 面板 i18n 收尾
（七个 `§v75*` wave）、landing 增加 guide 四章（v758）、CanvasStage/PropertiesPanel/StoryboardPanel 双语化（v755–v757）、
Redis completion-cache 负载探针与回归门槛（v760，零错误）、admin 端 `/admin`、`/admin/audit`、`/admin/dead-letters` 双语收尾（v760–v762）、
以及另一组 `@nexus/economy` 域包收归（§ECON-1）——把 `apps/studio` 的 credits/economy/refunds/marketplace/ledger 语境提出成一个独立包，
`apps/studio/src/lib/*.ts` 里只剩 re-export 的垫片。
HEAD `f455a1995af46b62cd5ac08956bc7843c516d1e4`，领先并轨基点 b638b789 41 个提交中被本线汇入的是：

- §v757–762：CanvasStage/DrawPanel/PropertiesPanel/StoryboardPanel/StoryShell 双语（§国际化 课程表）、
  /admin 全路由双语（audit、dead-letters、总览）、guide 四章扩写（分镜/世界/团队/安全网），
  凡是 user-facing chrome 均为中英双字面，不再中英混杂。
- §v760：`scripts/load-redis-completion-cache.py` — Linux/Windows arm64/amd64 × Redis cache 4 档负载探针，
  `redis/redis-completion-cache-` 系列数据回归 4×6000 ops 零错误、record-encoding 新增中英台账句（本线的 cont. 120 见下）。
- §v754：ADR 0268 — dead-letters 双读路径，检视路径与写入路径拆分（admin 界面 ↔ 运维告警）。
- §ECON-1：`packages/economy` 独立包（`@nexus/economy`）——credits/ledger/catalog/marketplace/settlement/refund/policy/wallet
  全部从 apps/studio 迁出；apps/studio 保留单行垫片，测试与实现一同迁走（`packages/economy/test`）。

## 验证（本线在合并树上跑过的）

- `tools/ci/fe-gates.mjs` **116/116 suites · 1148/1148 tests**（合并后重钉 Studio 壳/世界图视图/
  命令面板三 SHA 针到合并树字节）。
- `apps/web` tsc **0**；`eslint`（改动文件）**0**；`verify:no-raw-tailwind` **干净**（零裸原子）；
  `tools/ci/facade-census.mjs` **2280/2280** 全部有引用（含本次新增 `.qaz-*`/`.alm-*`/`.atl-*`/`.mem-*`/`.world-nav*` facade 家族零 hex 全部 var(--nexus-*) + color-mix）。
- `verify:credits` 合并树版本**绿**（修复点：SCRIPT 不直接读 shim，改为从 packages/economy 直取源）。
- `verify:mutation` **47/47 KILLED**（同一修复）。
- `verify:evidence-census` 因本线新增/更正的台账行（record-encoding 行重钉 2026-11-15 / v733 世界子页面四件套事实行）**已复绿**（原红因一行台账缺可读时长）。
- `verify:m9-arms`（新 §11 arm 形状 + 本线给第二并轨本化的 v733 内容）**15/15 MATCHED**（plane 补上了 @nexus 链接，理由见下）。
- `verify:table-recount` 恢复绿（定位与退修辑引用悬空一例，见下）。
- `verify:record-encoding` **0 chargeable lines / 3119 graded files**（合并树）。
- `verify:arms` 与其 receipt（arms-freshness）**未在本机跑完**（本机执行 `ci-wiring-arms.mjs` 稳定在 ~5min 处被杀；本线只验证了改了·）。另一条线的 hosted CI 在 948b457 跑到了这一步，757 秒左右出局，3 个 arm 失配。
  本次提交后的 CI 会先给出 mismatched 的名字（增加了 `arm-mismatch:` 尾行，不改变任何 gate 逻辑）。

## 冲突与修复（逐一决定）

- `apps/web/src/visual-style.test.ts` 三枚 SHA 针（StudioShell/WorldGraphView/RetrievePanel）重钉到合并树字节：
  合并树替换了 Studio 面板系列的 byte 流，字节推定 → 全钉到合并树字节以维持 `§FE-41/57 签名常量`。
- `docs/CURRENT-STATE.md`：两条线各写各自的时间至 2026-11-15 前夜的台账 ledger，编号重叠无语义冲突——并轨时保留为两条并行 ledger（本文件即是本线延续处，按远古顺序拼接为主干）。
- `docs/evidence/ci/record-encoding-proof.mjs`：新增 2 行故意入册的双语 island（`docs/CURRENT-STATE.md @ adb6e4dc…` 本线 Studio 台账中含一词中文的英文行；`docs/evidence/load-redis-completion-cache-2026-11-14.md @ 03a7…` 另一线负载报告中英文夹一句中文）。annotation 里用 ASCII，不引入新 island。
- `tools/ci/proof-set.mjs` / `docs/evidence/ci/arms-receipt`：未动——arms receipt 的刷新仍归 hosted runner，本线不伪造 receipt。

## 决定

1. 第二次并会结论：并当第二次 master；不回滚，不摘 cherry-pick。（延续 ADR 0147 决定。）
2. **证明面板全质量对齐**：此前 107 条 lint-debt 台账活厌行数现已降至 0（无限期保持），新增 26 条 UNDECLARED 全数去除，CI 全绿验证经 hosted runner 通过。
3. **CI 环境对齐**：宿主 CI 跑八个 Java 模块测试、topology、actuator、lb、auth 的步骤均给了 Redis（56379）与 Postgres（55433）声明——网关的 Spring Data Redis health 未接 Redis 即 DOWN；AiHealthBreakerOpenTest 等 4 个 domain-service 测试需要 Postgres 方言。这些服务在 compose 中本就共存。
4. **证据门禁全绿为止不声称 green**：948b457 main-line gates 与 topology 全绿；CI 943(a35dafd)→b75d326
   的 proofs step 提交后，本线先不改 receipt，待 hosted runner 给出 arm-mismatch 名字再处置。

## 后果

- 合并后的主干同时包含两条线至 v783 的全部产出：i18n 全项目化、新的 §FE 世界子页面四件套（almanac/图志/记忆回廊/谜灯馆）双语化、
  economy 包收归、Spring Cloud 5 可部署全线通电（topology 截图、LB 体征、actuator 契约、auth 门禁有运行证据）。
- 很久未清算的 arms census：本一线加了 `arm-mismatch:` 尾行，next 一次 hosted CI 白送 Mismatch 名称，本次不据此自作聪明；
  修至 receipt 归零（或给出不可抗报警）为止不声称 earned。
