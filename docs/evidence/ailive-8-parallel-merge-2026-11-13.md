# §AILIVE-8 · 双线并轨：`D:\终极项目` 的 master（162 commits）并入主线（2026-11-13 / 14 UTC+8）

关联：`merge-parallel-line` 分支 → `main` · merge-base `7cc6bb74` · 并轨源 `D:\终极项目`
（`git fetch "D:\终极项目" master:refs/remotes/other/master`）

## 背景

本仓曾出现**两条从同一基点 `7cc6bb74` 分叉的并行线**：

- **本线**（`main`，334 commits ahead）：§AILIVE 真 provider 验证、prompt_cache_key 接线、
  §FE 门面族、`.ge-*/.ash-*/.dl-*` 之前的全部门面工作、Java 拓扑（actuator/topology/auth/LB 直播 smoke）。
- **并行线**（`D:\终极项目` 的 `master`/`origin/main`，162 commits ahead）：`feat`×25 / `fix`×9 /
  `docs`×40 / `test`×others —— v681–v690：有界重试（v681）、跨实例熔断（v682/v683）、
  jitter（v684/v685）、Redis completion cache（v686/v687）、死信巡检 v689、brand-title 渐变
  （v687/v688）、admin 八页 brand lift（cont. 52–57，"lifted to the brand language"）、
  LLM streaming 默认 ON（v690）、Lighthouse 100/100/100（cont. 81）。

用户指示：「尽量把项目的多个工作分支、各种 worktree 之类的合并起来，综合集大成，合并到
一个主分支；并轨的内容可能那边没有在做了，可以直接接手帮他把剩下的内容做完。」

**并行发生的并行线会话（诚实记账）**：本合并分支上，另一条并行会话（同仓同工作树）在我解决
冲突的同时，**把已经全部解决完的合并索引提交成了 `e64ed9ee`（2026-11-13 23:37，提交信息
正是本合并的 -m 原文）**，随后又在本树上连下 7 个提交（`0e7adda1`→`467a68e5`）：提示词载荷
重排（真实多轮前缀复用率 0.45%→96%）、`Completion.cache_reported` + `GET /v1/ai/cache-stats`、
`/admin/ai-cache` 缓存读数面板、`§CP-1` ⌘K 命令面板。截至当前，`main` 与 `merge-parallel-line`
同为 `467a68e5`，**本线与并行线已在一棵树上**。本文记录的是那次合并本身的裁决与判据；
并行会话自己那 7 个提交不属于本文，但其产物（新 deps、root layout 中的 `<CommandPalette />`、
`AdminNav` 12→14 含 dead-letters + ai-cache）全部在合并树里。

本窗口在并行会话收工后留下 16 个未提交文件：都是合并收官必需的修实（Java 三个测试钉合并后
事实、discover-route-cache 两条静态门钉合并后接线、`AdminNav` 去重后的 14 格、§AILIVE-8 账目、
mock/fixture 补 `cachedTokens`/`llmCache`、PublishPanel/dead-letters/u/error 门面化、`CURRENT-STATE`
§AILIVE-8 记账 + evidence）——它们是另一半并行没有覆盖到的尾巴。

## 合并方式与冲突取舍（57 个冲突文件）

**判定原则**：功能/逻辑/部署接线取**超集**；视觉皮层一律守**本线的 §FE 门面族**（零裸原子），
因为对方的 "brand lift" 是裸 Tailwind 原子，本仓 `verify:no-raw-tailwind` 对其 335 处命中（现零）。

**机制说明**：本次合并在 `merge-parallel-line` 分支上完成冲突裁决（全部 57 个文件人工过目），
之后由同树并行会话把已解决完的索引提交为 `e64ed9ee`（23:37）并在本树连下 7 个提交至
`467a68e5`——截至本文，`main` 与 `merge-parallel-line` 同一棵树。本窗口后续 16 个未提交文件
（门面化三个整页 + PublishPanel + fixture/Java 测试钉死 + CURRENT-STATE/evidence 记账）是合并
收官的未提交尾巴。

| 类别 | 取舍 |
|---|---|
| Java 服务（domain/nexus-api/config/gateway） | **双方超集**：对方版本对齐 3.5.16/Java 25（我们原本就有）、`ddl-auto: validate` 作为 env 可选严格契约（默认 `none` 不变）、小池 Hikari + prepareThreshold 计划缓存（并入默认 URL）、`port-file` 机制、18888 config door（8888 被邻项目占用，ADR 0057 amendment 658）。本线保留：`SecurityConfig`（permitAll + 注释边界）、`WirePublisher`（Redis pub/sub 实时帧）、`circuitbreakers`+`metrics`+`prometheus` 三端点、55433 Postgres 默认。`ProjectServiceTest/ProjectControllerTest` 取对方（词汇表/ResourceNotFoundException 语义）+ 并入本线的两个用例（软删除不可读 / by-owner 列表 / delete 204）。`User.java` 取对方（label 随常量 + `fromLabel` Jackson 工厂），本线 `UserRoleConverter`/`UserPlanConverter` 及其测试删除（对方 `UserVocabularyTest` 全覆盖）。**NoFabricatedAnswersTest 重写为"答案即仓库返回值"守卫**（原前提"三服务全部拒答"在本线把读路径做实后失效）。 |
| Node 共享契约（`@nexus/schemas`、eslint.config、Dockerfile 链 `main-line.yml`） | **并集**：`UsageSchema`/`HealthResponseSchema(llmCache 段)` 双方各自扩展，合并为 `cachedTokens`+`reasoning_tokens`+`llmCache`；workflow 里对方新增 `java-config-server` 测试步（路径存在，闸门语义有效）保留，本线的 `verify:actuator`/`verify:topology`/`verify:lb`/`verify:auth` job 保留；`55100→55433`（对方修过的双映射）按对方来。 |
| ai-service（Python） | **超集**：双方缓存实现并存且各自生效——本线的 `prompt_cache_key=nexus-studio`（wkapi.pro 侧前缀缓存，`cachedTokens` 入 Usage/契约）+ 对方 v681–v690 的 `Retry-After/settle/backoff jitter/breaker/SSE 默认 ON/Redis completion cache/DLQ/cross-instance invalidation`；`CachedLlm` 装在真 provider 前面时 usage 照常上报（不谎称命中）；chat 路径保持 `json_mode=False`（本线 §47 修复）。`_usage_details` 并入本线 DeepSeek 兜底（`prompt_cache_hit_tokens` 顶层，OpenAI 路径 `prompt_tokens_details.cached_tokens` 优先）。 |
| 前端 `.tsx` 30 页（admin/users, marketplace, audit, …） | **取本线**（§FE 门面 + 强制高对比度回退 + 94 套 visual-style 判据守恒）；对方的原子版已判不可入库。**例外**：`admin/observability/page.tsx` 并入对方 §AILIVE-7「AI 就绪」面板（/healthz 实问 text/image/video/live + cache backend/hits/misses/hit rate/degraded），用本线 `am-tableNarrow`/`am-monoCell`/`adm-capNote` 呈现，data-* 钩子一字保留；`admin/dead-letters/page.tsx`、`app/u/page.tsx`、`app/error.tsx` 三个对方新增整页，整体移植并**门面化**（新增 `.dl-*`/`.ash-*`/`.ge-*` 族 + `BrandTitle` 改零原子 `.brand-title`，强制高对比度段补 `.brand-title` 回退）；`app/notifications/page.tsx` 取本线（`searchParams` Promise 修复双线各自带了，一字不差）。 |
| 样式/tokens | `.text-gradient-brand`（v687 单一来源渐变）并入 `.brand-title`；`--nexus-font-size-9/11` 保留双档；`v676` 11px 孤儿档问题按对方注释保留（`style-tokens` 引用门有效）。 |
| docs（CURRENT-STATE/ROADMAP/PERFORMANCE/AGENTS） | **双段并存**（同 `docs/AGENTS.md` 惯例）：本线 addendum 在前、对方 cont. 79–81 在后，均标注来源。 |

## 判据（对方 162 个 commit 的全部产物，逐项实测，不因合并而略）

- `mvn -o test` `java-domain-service` → **168/168**（含本次修正的 `@Import(SecurityConfig.class)`
  ——对方 `@WebMvcTest` 未加载 plain `@Configuration`，默认链 401；以及 `ActuatorShapeTest` 钉 `health,info,metrics,circuitbreakers,prometheus`）
- `mvn -o test` `nexus-api` → **953/953** · `java-config-server` → **5/5**（对方 CI 那条步进本线现也跑）
- `python -m pytest` → **291 passed / 11 skipped**（本线 117 + 对方新增的 retry/breaker/SSE/cache/DLQ 套件）
- `npm run typecheck:main` → **EXIT=0**
- `verify:no-raw-tailwind` → **0 issues**（对方 335 → 门面化后零）
- `verify:census` → **1774 defined facade classes，全部有引用方**（本窗口收官后复跑）
- `style-tokens` 29/29 · `forced-colors-style` ✓ · `discover-route-cache` ✓（两条静态门钉合并后的接线）·
  `admin-observability-visual-style` 12/12（SHA256 更新为合并后字节 25766451…，新增 §AILIVE-7 面板钩子门）
- `verify:fe-gates` 分片 A → **48/48（535/535）**；分片 B 被拆成 4 个小片串行补验，结论见文末后记

## 如实边界

- **对方线上 brand "悬浮钮/辉光/hover shadow" 视觉**：门面化移植时未全量复刻像素级质感（例如
  `shadow-[0_0_30px_rgb(91_108_255/0.45)]` 全部写成了 facade `:hover` 规则或舍弃）；视觉质感的
  「登峰入化境」仍需一个后续 §FE 片系统性加固，预算外。
- **`.text-gradient-brand` 删除**：census 不收零引用类；`.brand-title` 为唯一的渐变墨字入口。
- **对方 `llmCache` 契约段**：web 侧 `HealthResponseSchema` 现必有 `llmCache: {...} | null`，
  本线既存 fixture 已全部补齐 `llmCache: null`（契约是必填，§159）。
- 合并分支 **`merge-parallel-line`**；main 快进合入后本地 ahead origin/main 保持未推送。

未 push。

## 后记（2026-11-14 凌晨）

并行会话（同树同工作树）先于本窗口提交收官：`e64ed9ee`（2026-11-13 23:37，合并落库，提交说明即本
合并的 `-m` 原文）后连下 7 个提交（`0e7adda1`→`467a68e5`：提示词载荷重排、`Completion.cache_reported` +
`GET /v1/ai/cache-stats`、`/admin/ai-cache`、`§CP-1` ⌘K 面板）。截至本文提交时点 `main` 与
`merge-parallel-line` 同为 `467a68e5`。

**本窗口在 `467a68e5` 上又补的尾巴（即 `fix(§AILIVE-9)` 提交）**：`467a68e5` 自身红——Java 三测试
（ProjectControllerTest 401 / ActuatorShapeTest 缺 metrics / NoFabricatedAnswersTest 前提失效）、
BrandTitle 依赖的 `.text-gradient-brand` 实体已被删除（死类 + 门禁红）、三个整页裸原子、三个 fixture
契约缺字段、discover-route-cache 静态门钉旧接线。全部在该提交内修实。

未 push。
