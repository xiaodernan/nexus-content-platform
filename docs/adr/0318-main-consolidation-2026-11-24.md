# ADR 0318 · 2026-11-24 主线并轨：隔离工作树、逐文件判侧、证据按现状重分类

- 日期：2026-11-24
- 状态：accepted
- 相关：ADR-0307（scratch 证据名册）、ADR-0319/0315（前两次并轨，0319 原号 0313）、ADR-0317（provider 关闭后的诚实降级）

## 背景

本次开工时，本地 `main` 与 `origin/main` 已再次分叉：

- 本地 `main` = `f531ad5d`，独有 15 个提交；
- `origin/main` = `cb5407c5`，独有 22 个提交；
- 主工作区 `D:\内容创作平台` 同时有另一会话未提交的搜索支线（源码、测试、迁移、ADR 与证据），
  不能把它的在途字节扫进本次提交，也不能为了并轨覆盖或清理它。

两边各自跑绿过自己的门，但合并树没有。直接 rebase 会重放 15 个提交并反复制造生成物冲突；
在主工作区 merge 又会把他人未提交工作卷进索引。采用一次真实三方合并，但放在独立工作树里做。

## 决定

1. **独立工作树合并，不 rebase、不 cherry-pick。** 在 `D:\nexus-sync-20261124` 建立
   `consolidate/main-20261124`，从 `f531ad5d` 执行 `git merge --no-commit --no-ff origin/main`。
   依赖使用物理本地平面，workspace junction 全部指回隔离树；主工作区及其未提交搜索支线保持不动。
2. **九处冲突逐文件判侧，不整文件选边。** 通知页保留远端更严的同行选表门；观察站保留本地
   JSX 强调；指南取并集并采用较新的正典计数；头像证据保留本地 2026-11-22 实测；展示事实包
   暂留远端值，合并提交后再由生成器重导。
3. **ADR 撞号按来客后移。** 远端已有 `0313-config-ops-surface-stays-read-only.md`，本地 provider
   关闭决策改号为 `0317-provider-closed-honest-degradation.md`；原 `0313-merge-origin-main-into-one-main-line.md`
   改号为 `0319-merge-origin-main-into-one-main-line.md`，文首保留原号说明；本次并轨记录使用 ADR-0318。
4. **视觉 SHA 按合并后字节重钉。** 万象脉络页合并了 locale metadata 与中文 kicker，WorldPanel
   合并后去掉未使用的 `fillableKinds` import；两处都先看测试实算值，再更新 pin，不硬选旧线。
   隐藏的 Markdown 文件输入补 `aria-label`，保留触发按钮的可访问名称。
5. **在途搜索支线不冒充主线能力。** `docs/ROADMAP.md` 的 §DB-perf 第二片改为“未落地”，
   删除本树中不存在的脚本、迁移、测试和证据路径声明。该支线落地时必须重新取号：
   ADR-0315 与迁移 0048 均已被占用。
6. **证据名册按合并后事实重分类。** 原 35 行 `lost` 中，29 行实际已有磁盘字节并入册，改为
   `tracked` 并由门校验“普通文件存在且版本库有”；另 6 行已被本地线以 `.scratch/` 正常点名，
   从名册移除。外部 `clone` 在干净克隆中可以缺席，门只禁止其进入版本库；本机存在时仍校验 `.git`。
7. **展示同步只认唯一主线。** `.github/workflows/showcase-sync.yml` 的 `NEXUS_FACT_REF`
   从 `master` 改为 `main`，删除“main 是陈旧内容线”的过期注释。
8. **provider 关闭的文档与代码语义一致。** README、环境文档、ai-service 文档与示例统一写明：
   外部模型 API 按用户要求关闭；离线 DEMO 是当前正常路径；`capability=real` 必须由成功真实探活证明；
   `unknown` / `failed` / 未配置一律不可用；历史缓存命中读数只作为注明日期的快照。本轮不调用该 API。
9. **Next 16 的 Node/Edge 边界按编译产物修。** app-local Next 16.4.6 是唯一验证版本，根目录遗留的
   extraneous Next 15 不参与验证。`ioredis` 加入 `serverExternalPackages`，instrumentation 改成正向
   `NEXT_RUNTIME === 'nodejs'` 条件块，让 Edge 编译产物静态剪枝 Node-only worker，而不是只靠提前 return。
10. **隔离树的 Turbopack 限制不伪装成产品回归。** Next 16 Turbopack 的 SWC realpath 指向主工作区，
    超出隔离树 configured roots；浏览器验收改用 `--webpack`，不改产品配置来迁就一次性目录。
11. **非强制推送，不动主工作区。** 合并提交以 `origin/main` 为第二父提交，推送只做 fast-forward；
    不 force、不改写历史、不移动仍带他人未提交工作的主工作区 `main`。

## 验证

合并树已完成：

- 冲突相关与证据门：50/50；其中 `doc-evidence` 5/5；
- `npx tsc -p apps/web/tsconfig.json --noEmit`：通过；`npm run typecheck`：14/14 任务通过；
- `TURBO_CONCURRENCY=1 npm run lint`：7/7 任务通过；
- `verify:bible-snapshot`、`verify:world-bible`、`verify:anchor-echo`：通过；
- `verify:census`、`verify:evidence-census`、`verify:record-encoding`：通过；
- `nexus-api` Maven：1063 tests，0 failures / errors / skips；
- 六个需要 dist 的 workspace 强制重建成功，workspace 解析全部落在隔离树；
- Next 16 webpack 在 3101 真实启动，`/about-nexus` 首次编译 HTTP 200；Node instrumentation 保持
  `ioredis` external，Edge instrumentation 产物为 `if (false) {}`，无 `ScanStream`/worker 实际依赖；
- Playwright Chrome 对 `/about-nexus`、`/guide`、`/onboarding` 的中英六页验收：六页均 HTTP 200、
  控制台无错误；截图存于 `.scratch/shots/2026-11-24-consolidation/`，六张均已目验；
- queue 降级回归：2/2；文档、证据、i18n 与运行时聚焦组：8 files / 56 tests；
- 最终非集成 Vitest：561 files passed / 1 skipped，7485 tests passed / 4 skipped，exit 0（695.18s）；
- `verify:lint-tree`：20 areas，0 finding，0 parse error，0 crash；
- `verify:fe-gates`：158 suites / 1439 tests 全通过；facade census 3270 类全部有引用方；
- 冲突标记扫描：0；未解决索引路径：0；暂存内容凭据模式扫描：无匹配。

环境限度：Docker API 不可达，PostgreSQL/Redis 真实 integration 与 live provider 套件未冒充通过；
全量 Vitest 明确排除 `**/*.integration.test.ts`、`**/*.live.test.ts`、直连 Redis 的 `job-queue.test.ts`
及依赖真实数据库的 `marketplace.test.ts`。日志里的 Redis `ECONNREFUSED` 属于该环境事实，不是断言失败。

## 后果

- 本地与远端两条主线合并为可快进的一条历史，保留真实 merge commit 作为审计边界。
- 主工作区的搜索支线仍是独立在途工作；本次不承诺它已交付，也不吞掉它的文件。
- 证据门不再把“已入册”误报成“失踪”，也不再要求干净克隆复制外部 GitHub Pages 工作区。
- `/about-nexus` 与 `/guide` 明示 DEMO 语义；`/onboarding` 是静态教学页，不发起生成，不新增 provider
  状态徽标；真正 AI 入口继续使用既有常驻 DEMO 标识。
- provider API 仍按用户约束关闭；后续开发继续走可验证的离线路径，不伪造 live 结果。
- 展示事实包从落地后的唯一 `main` ref 重导并单独提交，避免把生成物混进合并判侧。
