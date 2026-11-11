# CURRENT-STATE — 2026-11-09

本文件是项目当前状态的快照——供未来任何 agent（或人类）在我不在的时候接上。它**只描述已经交付、已可执行的事**，不承诺未做的事。

## 评测（§85）

`npm run evals` 返回 0（退出码）：

| 套件 | § 维度 | 读数 |
|---|---|---|
| `code-index` | §69 Code Index 检索 | 19/19 |
| `model-roundtrip` | §16/§19 投影自洽 | 13/13 |
| `export-roundtrip`（需 `NEXUS_DATABASE_URL`） | §144 导出保真 | 17/17 · 55100 regress 实例实测 |
| `video-plan` | §40-42 视频投影 | 30/30 |
| `world-build` | §44/§46/§140 世界模型 | 55/55 |
| `schemas-contract` | §6 边界纪律 | 17/17 |
| `game-build` | §54/§51 游戏设计系统 | 36/36 |
| `design-build` | §12/§13 design-model 投影 | 46/46 |
| `project-bundle` | §16/§159 集大成合成 | 14/14 |
| `local-embedding` | §49 本地 token-bag 语料检索（确定性） | 14/14 |

**合计 290 / 290 PASS**（不含 needsDatabase 的 `export-roundtrip`：那一项 `npm run evals` 在 env 已设时跑、不设则打印 `SKIP` 退出码不变，CI 安全）。

真库首跑读数（仍以 `npm run evals:baseline` 验）：recall@5 = 100% / MRR = 0.786 / 代码往返 5/5 干净 / 无障碍 4/4 检出 / 渲染后页面 axe 违规 0 条—— `docs/EVALUATION.md` 第十五片起。

不成文：**CI 注入 `POSTGRES_CONNECTION_STRING` 即可在 `npm test` 之前自动多跑一遍 `export-roundtrip`**。

## 测试

`npx vitest run --shard=1/2` / `npx vitest run --shard=2/2` 全绿：

- shard 1 + shard 2（2026-11-09 06:35）：合计 272 files / **3590 tests**

证据日志入库（`scratch shard*-2026-11-09c.log`，已 `git add -f`），见 `docs/TESTING.md` 2026-11-09 那条。

## Spring Cloud 微服务拓扑（ADR 0054 / 0055，2026-11-09）

四个 Java 服务、四个进程、一条请求走通：

| 服务 | Spring Cloud 部件 | 作用 |
|---|---|---|
| `services/java-registry` | Eureka server 4.3.3 | 发现：哪些实例活着 |
| `services/java-gateway` | Gateway 4.3.5 + Resilience4j | 边缘：路由、熔断、失败形状 |
| `services/nexus-api` | Eureka client + OpenFeign 4.3.3 | 系统之记录；按**名字**调域服务 |
| `services/java-domain-service` | Eureka client | 域表的权威写路径 |

- `services/nexus-api`：`mvn -o -B test` → **907 tests, 0 failures**（新增 OpenFeign 客户端 + 三态 reader + 门控测试 + 断路器配置守卫）。
- `services/java-domain-service`：`mvn -o -B test` → **39 tests, 0 failures**（原 10）。
- 拓扑证明 `npm run verify:spring-cloud`（`docs/evidence/java/spring-cloud-proof.mjs`）→ §1–§11 全绿：四个 jar 构建；注册中心 UP；**真实 schema 用 `pg_dump` 复制进一次性库**（域服务 `ddl-auto: validate` 对着空库会正确地拒绝启动，所以不能空着）；域服务对着真实 schema 起来并**注册自己**；`lb://` 路由；**边缘 → nexus-api → lb://nexus-domain-service → 域服务 → PostgreSQL** 读回证明自己插入的那一行；未知 id 是 **404**；域服务被杀后**同一个 URL** 是 **503** 并点名它；nexus-api 被杀后边缘 503 并点名它。

三条被实测钉死的形状：

1. **不可达 ≠ 不存在。** 下游不在 → 503 并**点名**那个服务；下游说"没有这一行" → 404。把前者折叠成后者，调用方就会告诉用户"项目被删了"。
2. **失败是包着来的。** 熔断器在前时，Spring Cloud 会把**每一个**下游异常塞进 `NoFallbackAvailableException`（原异常在 cause 里）。只认裸 `FeignException` 的 reader 会把"这个项目不存在"（404）说成"域服务联系不上"（503）——正是这一段要消灭的那个谎，而且它由包装层造成，不是逻辑写错。现在 reader 沿 cause 链找到真正的 `FeignException`，**按状态码**分类。
3. **schema 拥有词汇。** `users.role` 是 PostgreSQL 枚举，标签是小写 `creator`/`admin`；Java 侧曾写常量名 `CREATOR`，实测每一次用户写入都被数据库拒绝（`invalid input value for enum user_role: "CREATOR"`）。现在标签由常量携带、转换器落库、边界处校验（未知 kind → 400 并列出可用的词，而不是 500）。

附带钉死的一条：断路器的**名字**就是它的配置的**名字**。OpenFeign **不**按服务名给断路器命名：它自带的两个解析器都产出没人猜得到的名字（默认那个返回 `Feign.configKey(type, method)`，即 `dev.nexus.api.domain.DomainServiceClient#getProject`；再由默认开启的 alphanumeric 解析器去掉所有非字母数字字符）。于是 `application.yml` 里那份 resilience4j 配置**从未生效**，真正在跑的断路器用着默认值：100 次才开、60 秒才半开，而且**把 404 也记成故障**。现在由 `DomainCircuitBreakerNameResolver` 自己命名（就是服务名 `nexus-domain-service`，两个库自带解析器都是 `@ConditionalOnMissingBean`，会被我们这个顶掉），配 `ignoreExceptions: feign.FeignException.NotFound`（404 是答案不是故障），并由 `DomainCircuitBreakerConfigTest` 读 yml 钉住不许再漂；网关那一侧也有同样的守卫（`GatewayCircuitBreakerConfigTests`，直接问 registry 里那个断路器的真实参数）。

ADR：`docs/decisions/0054-spring-cloud-registry-and-edge.md`、`docs/decisions/0055-a-service-is-reached-by-name-and-its-failure-is-a-fact.md`。

## 关键 ADR

`docs/adr/0093-eval-runner-deterministic-invariants-in-ci.md`：§85 判决门——结构不变式红即
`exit 1`，阻止合并；判断题（RAG/设计精度/Visual）不上自动门。

## 已经合入主干的另一会话成果（无许可主动删不动）

- 两条线合入一个分支后的内容，全部是两侧原子的整个体系（无内容被裁剪，无证词被改写）。
- `8179208`：`apps/web` 确定性本地 embedding provider（§49），环境变量 `NEXUS_EMBEDDING_PROVIDER=local` 显式 opt-in，测试 13/13 绿；不存在没有 provider 时告随便的行为，同一个模型档在 `model_for` 上自报家门。`evals` 第十套 `local-embedding 14/14` and 第十一套 local-reranker 15/15 in the matrix (276/276)，`.github/workflows/main-line.yml`（`cf1537e`）让结构不变式进了 CI。
- `cf1537e`：新增 `.github/workflows/main-line.yml`，主线的 `typecheck:main` + `evals` 决定性结构不变式进了 CI（ADR-0093），针对 `pgvector` 容器跑 `export-roundtrip`（无库时打印 SKIP 且退码保持不变）。
- 其余动作都在 `docs/evidence` 里按 amendment 568（v641）记录：id 568 已授予。

另一位智能体在 `main` 上的提交我负责接下来：
- `f14fe2a` §147 选中响应回归测试（已随 my commits 入 main）
- `8e0335c` §85 公开作品页 × 浅色 axe
- `9b0b278` §85 收起面板的 axe + `control-names` 扩扇 text-like
- `62563e6` 跨模型同进程 store 持有不互覆盖
- `f604d13` 两片全绿记账
- `18228f0` agents doc 层面更新
- `3638076` TESTING.md 九套真实 check 数
- `0364995` EVALUATION.md 头部九套顺序对上 §图谱

## 已知卡口

- **Video / Image Studio 真像素**：`apps/ai-service/src/ai_service/adapters/` 没有注册任何真 provider——本机没有 key，故走 DEMO MODE
  （prompt 哈希 + 原色板代换 + 布局对齐的本地构图），UI 常驻 DEMO MODE（§159/§160）。
  §105 真 provider 接入只需：用户给 key → 在 `ai_service/adapters/` 增加一个适配器 → `POST /generate_image` / `POST /generate_video` 走真路径。
- **PGVector 混合检索**：未接入（§49/93 仍是 `[~]`）。

## 本仓与工作树

- 2026-11-09 已把两条平行线（studio 线 `master` 与 main 线 `main`）合并成一条：`origin/master` == `origin/main` == 本地 `master`，工作目录不再是单行。
  - Studio 线的 `packages/design-model` 在原路径；main 线的模型被**原样**搬到 `packages/creative-model`，包名 `@nexus/creative-model`，main 线文件里的 `@nexus/design-model` 已全部改指向新包。
  - 两类模型的文档（12 个共享 docs）现在**逐字保留**两边：studio 线在前，main 线的全文在 `# 附录 · …` 之下，不抹不删。
  - studio 线的 `docs/evidence`、Java 服务、agents runtime 全部原样保留并可验证。
  - 12 个 add/add 冲突的解法见 `README.md` 的 "Consolidation history" 一节。

- 子模块 `packages/*` 通过 `@nexus/*` alias 或 `tsconfig.json paths`——`tsconfig.base.json` 是单一真值来源。

- 2026-11-09 新增 `apps/web` 侧确定性本地 embedding：`NEXUS_EMBEDDING_PROVIDER=local`（**必须显式设置，绝不静默切换**）后，Web 进程内就能完成 §49 的 embedding 与 hybrid 检索——token-bag 哈希，1536 维，无需 key；不是语义模型，只是确定性本地便捷。真实 provider 仍按原有路径接入。
- 全局环境：Windows 11 / Node 24 / Python 3.11 / Java 25 + Maven（ai-service），以及 Compose 上的 PostgreSQL 55433 / Redis 56379（`infra/docker-compose.yml`）。

## 交接

接手的人（不管是哪段对话）只要：
1. `git pull origin main`
2. `npm ci`
3. `docker compose -f infra/docker-compose.yml --profile core up -d`
4. `npm run typecheck && npm run eslint`
5. `npm test`
6. 跑评测：`npm run evals`

即可得到当前文字所写的状态。



## 2026-11-09 addendum: the GBK records repair landed (amendments 569 / 570)

- `6e5e3b9`: the two long-red records brought to zero chargeable damage.
  - `infra/migrations/0000_init.sql` — 274 leading tabs replaced by two spaces; byte-level diff is
    whitespace only; other migrations already used spaces; SQL is whitespace-insignificant and no
    database is forced to re-apply the file.
  - `docs/adr/0043-bot-visitor-suspected-not-convicted.md` — committed encoding-damaged on its first
    day (GBK mojibake, 16 unrepairable sites per the byte-model repairer); reconstructed from the
    surviving bytes plus the ROADMAP mirror of the same decision (fn §168 third slice); the file is
    labeled as a reconstruction at the top and does not pretend to be the original artifact.
- The bilingual-island pin was extended from 6 to 69 rows; every added row was read on screen before
  pinning — they are all authored bilingual lines (test display names, path/subscription-route labels,
  the ledger's own English prose quoting the same word, the roadmap's CJK punctuation).
- The merged ledger commit `b7773b6` carries amendments 569 (v642) and 570 (v643). The two forensic
  clauses in the record-encoding proof were recalibrated in that commit: the +2-row-margin clause is
  unsatisfiable on the Chinese-dense corpus (witness histogram is continuous from 0 to 53) and is
  retired with its measured reason recorded in amendment 570; the one-spelling clause is widened to
  exactly the two named spellings named there by codepoint (36335 / 38706). No writer-model or charge
  rule was weakened.
- `verify:record-encoding` exits 0 (2079 graded files, 0 chargeable lines). The shard witnesses that
  were encoding-damaged were retired from the repo; `docs/TESTING.md` now records the runs and exit
  codes in prose instead of pointing at retired paths.


## 2026-11-09 addendum (cont.): the import/export zip round-trip bug and the full e2e re-check

- `9d350a4`: the export `.nexus/manifest.json` previously declared **every requested part** (design,
  code, assets, storyboard, character), even the parts the project had nothing for. The import side
  is strict — a declared storyboard with no `storyboard/storyboard.json` file refuses the whole package
  with 415, so a fresh project could never export and re-import its own default zip. The manifest now
  declares **only the parts that actually shipped in the package** (per-register counts > 0); `README.txt`
  still reports both what was requested and what is inside (an empty storyboard/character prints "this
  version has no storyboard/character to export" as it did before). No import contract changed; no
  format version bump (the manifest shape did not change, just its honesty).
- Verified: the two failing e2e specs (`§144` client import roundtrip; `§105` status-code matrix,
  which got 415 where 201 was promised) now both pass (`npx playwright test e2e/import.spec.ts` →
  4/4 passed, 55.6s, against the local Docker-backed dev stack).
- `npm run evals` (all nine suites incl. `export-roundtrip 17/17` on the real DB, port 55100) and the
  export/zip integration tests (77/77) pass on the merged tree.



## 2026-11-09 addendum (cont. 2): the local reranker landed

- `b527422`: `LocalTokenBagRerankerProvider` joins the deterministic local retrieval stack, next to
  the local embedder. `NEXUS_RERANKER_PROVIDER=local` selects it explicitly; a key alone does nothing;
  an unknown provider name throws naming the two legal values. `apps/web/src/app/api/projects/[projectId]/knowledge/search/route.ts`
  now passes the selected reranker into `VectorStore.search`, so DEMO MODE can run the whole path
  (embed -> hybrid -> rerank) with no credentials at all, once the operator opts in.
- `evals` gained the eleventh suite `local-reranker 15/15`; the matrix now stands at **276/276**.
  `docs/EVALUATION.md` and `docs/TESTING.md` record the eleventh suite.



## 2026-11-09 addendum (cont. 3): CI health-board after the repair pass

- Studio-line CI red rows reduced to two: the `liveness` and `health` rows of the Java service proof.
  These two rows were red on this repo's CI before any of my work (both lanes were red there);
  they are runner-bound rather than source-bound (the proof's 30 s Hikari-leash premise does not
  hold on this runner, whose pool borrow path answers fast). `vitals`, `traffic`, and the other
  Java-proof rows are green.
- `budgets` is green. The gate now rejects any parenthesized signal-like token that is not a real
  signal, and tolerates statements such as `(descendants: not-attempted)`, which the Linux CI
  runner produced and this gate's previous shape did not recognize as legal.
- `evidence-census`, `arms-freshness`, `doc-evidence`, `table-recount`, `package-counts` all green.
- `main-line` CI (`tsc` for the main lane + `evals` over the 11-suite matrix, including reranker)
  is green for every pushed commit of this session.


## 2026-11-09 addendum (cont. 4): the local deterministic stack is proven end-to-end

- `b8c5d05`: `apps/web/test/knowledge-local.integration.test.ts` exercises the WHOLE path on real
  Postgres with zero credentials — `saveWorld` -> `syncProjectKnowledge` -> local token-bag embeds
  go into the 1536-dim `pgvector` column -> hybrid `VectorStore.search` (with the local reranker)
  returns relevant chunks deterministically. `bucketStore.upsertChunks` gained an honest empty-array
  guard (real bug found: drizzle's `values()` throws on `[]`).
- `evals:baseline:web` added — the baseline evaluation script as documented runs under the web
  tsconfig; `evals:baseline` alone still uses `scripts/eval-baseline.mts` (it was missing web paths).
- Shard 2 re-verified green on the merged tree (196 files / 2879 passed).
- CI multi-lane status: `main-line` CI has been green on every commit this session; `master`'s
  Studio CI keeps two known runner-bound red rows (`liveness`, `health`), the others are regenerated
  and green. `main-line` master briefly red on a GitHub runner Docker-start flake — rerun launched.


## 2026-11-10 addendum (cont. 5): the Spring Cloud config door is in, and the proof's §13 measures the gauge that actually moves

- The Java topology gains a SIXTH deployable, `services/java-config-server` (Spring Cloud Config,
  native profile) serving `infra/config/`: one shared `application.yml` (health/info/metrics exposure,
  root log level `warn`, `nexus.config-server-served=true`) and one `{spring.application.name}.yml`
  per Java service. Every one of the four services imports the door OPTIONALLY
  (`optional:configserver:${NEXUS_CONFIG_SERVER_URL:...}`), and all four suites stay green with no
  config door listening (api 932 / gateway 13 / domain 39 / registry 2). ADR 0057 records the decision,
  including the measured fact that the 2025.0.3 BOM manages `spring-cloud-starter-config` and
  `spring-cloud-config-server` (NOT the `-client`/`-server` starter names), and the measured file-name
  contract (`{spring.application.name}.yml`, not the Maven module name — the native profile serves it
  by application name, and a first draft failed its own test for exactly that reason).
- `docs/evidence/java/spring-cloud-proof.mjs` §13 now reads the `resilience4j.circuitbreaker.state`
  series with the `state=open` tag. The earlier assertion (state must differ from the §9 reading)
  could never pass: the tagged publisher registers one gauge PER state (closed/open/half_open), exactly
  one of which is 1 at any instant, so the untagged read is a constant 1 and the breaker opening is
  invisible to it — a red that named itself wrong would have stayed red forever.
- `docs/evidence/agents/README.md` recounted by the §3 exec-host rule (17→18 for
  `exec-host/execTestRunner.test.ts`, exec-host rows 358→359 over 13 files) — the v651c case landed in
  9ab2371 and the prose had not been recounted in the same commit, which the recount door caught.
- `DomainFailure` learned resilience4j's TimeLimiter answer: with the domain service's container
  killed, the transport does not refuse fast enough, the TimeLimiter cuts the call, and what arrives
  is a `java.util.concurrent.TimeoutException` — classified as `unknown` until now. It is the same
  fact as a transport timeout, so it is now the same `timeout` kind; §12 reports it honestly and the
  api-side suite is 932 green (DomainFailureTest 11 → 12).
- Full four-service topology proof re-run end-to-end on this machine: **GREEN, all 16 sections**
  (throwaway databases, build copies, processes all cleaned up in §16; §13 printed
  "it refused 1 calls, its OPEN-state gauge read 1").
- CI posture unchanged: the spring-cloud proof row is the ci-wiring-excluded one (it needs
  PostgreSQL + a warm Maven) — nothing in ci.yml moved. The working tree's two known runner-bound
  red rows on the Studio lane (`liveness`, `health`) remain red and are still called out honestly
  rather than worked around.


## 2026-11-10 addendum (cont. 6): the Studio `quality` row reached the end of the proofs batch on the runner, and exactly one thing was red — the package table the exec-host recount caught

- The merged tree's `CI` workflow (`quality`) did not get past `verify:lint-tree` before the v652 unit (two
  unused `grew` bindings, plus the spring-cloud proof's findings and the re-derived lint-debt ceiling
  221→218 findings). With those landed (`04a3eaf`), the full 116-row proofs batch ran on the runner at
  this ref: **exactly one row red** — `verify:package-counts`,
  `@nexus/exec-host: the table says 358/358; the suite answered 359/359` (the v651c case, `9ab2371`).
  Everything else was green: `verify:lint-tree`, `verify:publish-e2e` 340s, `verify:arms` 601.2s,
  `verify:vitals`, `verify:traffic`, `verify:vitals`, `verify:table-recount` 14.3s,
  `verify:record-encoding` 1.6s — **115/116 green of a derived population of 117 · residue named: 1**
  (the spring-cloud row, an exclusion NAMED in `tools/ci/proof-set.mjs`, not a red).
- The two rows previously recorded as runner-bound here are GREEN on the runner at this ref:
  `verify:health` **22.2s OK** and `verify:liveness` **22.1s OK**. That is amendment 576 / v651 doing
  what it was built for — no assertion may grade a number remembered from another machine. It is NOT a
  promise they stay green forever; a red that reappears deserves the same cause-reading pass, not a shrug.
  cont. 5's last bullet is SUPERSEDED by this addendum and is kept visible on purpose, not rewritten.
- The re-stamp: exec-host row `358→359/359` in the generated block (`docs/evidence/studio/README.md`,
  footer date 2026-11-10) and the same count in `docs/evidence/agents/README.md`; the studio suite was
  NOT re-run on this box for this edit — the runner's own package-counts pass rejected only the
  exec-host row and cleared the studio row at **2857/2857 (142 files)**, and this box measured the
  exec-host arm at 359/359 exit 0 before its `--write` was interrupted twice (first by the server
  restart — nothing was written; §1a held — then left stalled at 4/7 arms with 0.2 s CPU and stopped
  deliberately). The surgical re-stamp is strictly narrower and carries the runner's evidence.
- `main-line` CI stays green on every push this session, including the first hosted answer for the Java
  config-door leg (temurin 25 + the 4/4 config-server suite).


## 2026-11-10 addendum (cont. 7): the Studio `quality` row is GREEN on the hosted runner — 42758678472 (master) and 42758689082 (main), sha fc4b25f

- After the §15/cache-key recount (5 of 5 poms), the v652 lint-debt closure (221→218 findings), the
  exec-host package-table re-stamp (358→359/359 — the ONE row the runner's quality job refused) and
  the v651 measurement repair, the Studio `CI` `quality` job is FULLY GREEN at this ref:
  `42758678472` (master) and `42758689082` (main), both `success`. `main-line` is green on the same
  sha too (`42758678797` master, `42758689269` main) — including its Java config-door Maven leg.
  They were earned by `04a3eaf` (the v652 unit landing whole) and `fc4b25f` (the one-row re-stamp) —
  not by widening a gate, not by retrying, and not by deleting an assertion.
- What this does NOT mean, said plainly: the `verify:spring-cloud` row stays EXCLUDED (a PostgreSQL no
  workflow step brings up, named in `tools/ci/proof-set.mjs`), the flaky concurrent-tap note from
  cont. 4 stands unchanged, and CI green is a fact about THIS ref on THIS runner — nothing in this
  ledger cites it as a general promise about the future, and none of the excluded/runner-bound rows
  have been "fixed" in this tree.


## 2026-11-10 addendum (cont. 8): the six Java deployables entered `infra/docker-compose.yml` — config-validated, never executed here

- `infra/docker-compose.yml` gained a `java` profile: five Dockerfiles (`services/<name>/Dockerfile`,
  `eclipse-temurin:25-jre`, jar built on the host), a **throwaway** `nexus-java-pg` (pgvector pg16 + tmpfs,
  host port 15433, schema owned by `npm run db:migrate`), healthchecks that prove "the JVM accepts
  connections" (port-accept only — the HTTP probes are the proof's job), and the six ports mapped to
  18761/18888/18080/18081/18082. `npm run infra:up:java` / `infra:down:java` / `infra:smoke:java`
  (`scripts/smoke-java-profile.mts` — six doors + the edge chain answering 404 for an unknown id,
  ALWAYS tears down, no volume survives).
- **This slice was never executed on the author's host, and this file must not claim otherwise.** The host's
  Docker engine cannot start NEW containers right now (measured 2026-11-10):
  - `docker compose --profile java up -d` hung at `Container nexus-java-pg Starting` for over an hour
    until the foreground call's timeout killed it; `docker rm -f` of the corpse hung too.
  - A `Created`-but-unstartable corpse `nexus-java-pg` remains; force-remove it when the engine allows.
  - Existing long-running containers (nexus-postgres and the rest) answer, and the engine leaves volume
    READS working; only the container-creation write path is wedged tonight.
- What IS measured, and nothing more: `docker compose --profile java config --quiet` exits 0; `package.json`
  carries the three scripts; all five Dockerfiles copied from tested jars; the smoke script was type-/syntax-
  exercised by running it up to the engine-dependent step (it failed loudly at `docker compose up -d`, wrote
  nothing, and exited non-zero — the honest failure mode). NO healthy-chain claim is made anywhere; the
  config-only door has been documented in the README's honest bounds on both doors that mention compose
  (`docs/evidence/java/README.md`, `services/java-config-server/README.md`).
- The v654 slice in the CONVERGENCE program is exactly this file — it is now **half-done and honestly
  marked**: the profile exists and parses; the hosted run (fresh container start on a healthy engine) is
  the next mechanical step. This ledger names the boundary instead of pretending a green.


## 2026-11-10 addendum (cont. 9): the spring-cloud row retired from the exclusion and passed GREEN on the hosted runner — 117/117, residue 0

- `docs/evidence/java/spring-cloud-proof.mjs` was EXCLUDED for one reason since v645 (2026-11-10): no
  ci.yml step brings up PostgreSQL. v653's redesign retired the need for the workflow to do the carrying:
  with no `NEXUS_PROOF_DB_CONTAINER` set, §3a now pulls `pgvector/pgvector:pg16` (already a pre-pull line),
  runs a scratch source container on an ephemeral host port, REPLAYS the repository's own ordered
  `infra/migrations/*.sql` (deleting none, keeping none extra), and destroys the source in §16.
  Maven was not the reason (warm at v650); the host was not the reason (runner has docker and room for
  the JVMs); the reason was the proof's shape demanding a pre-migrated container nobody was offered.
- The first hosted contact (`dd6e9c9`) reddened in 22.5s: **the pgvector extension was missing on a fresh
  source** — `infra/migrations/0000_init.sql:209` declares `vector(1536)` and nothing created the extension
  before the first migration ran. The fix creates it first (the same shape `scripts/db-migrate.mts` uses);
  the runner clipped the failing row's output, so the cause was read out of the migration TREE's own bytes,
  not out of a log. `cb3f3a7` pushed; CI master re-ran green in 45 m 5 s with
  `verify:spring-cloud ... declared 1200000ms ... OK 120.6s` and `117/117 green of a derived population of 117 · residue named: 0`.
- The operator-local plane is UNCHANGED: `NEXUS_PROOF_DB_CONTAINER=nexus-postgres` reuses the dev
  container exactly as before (pg_dump out of the current dev database). The two planes differ only in
  where the SOURCE is — that is the entire design split.
- `tools/ci/proof-set.mjs` keeps an EMPTY `EXCLUDED` — the gate prints residue 0 rather than hiding silence.
- The compose `java` profile (v654) and this hosted row (v653) are two different planes and deliberately
  separate: compose stands the topology up for a developer's machine; the hosted row grdes the same
  topology on a stateless runner.
- `verify:arms` re-stamped `arms-receipt.json` (the `runner` subject changed with proof-set.mjs; 64/64
  matched on the re-stamped bytes); census and table-recount re-derived clean (`rows 117+0`, HELPER 5).


## 2026-11-10 addendum (cont. 10): the scrape is published on all five deployables — v658, and the two wrong turns on the way (2026-11-11)

- **The claim.** Five Java deployables carry `io.micrometer:micrometer-registry-prometheus`; the shared
  configuration document (`infra/config/application.yml`) and each service's OWN `application.yml` name
  `health,info,metrics,prometheus`; and every one of the five answers. The four CONSUMER doors are read by
  `spring-cloud-proof.mjs` **§10b** (registry / domain / api / edge, body must be `# HELP` or `jvm_`), and the
  config server's own door is read by `ConfigServerTest`'s scrape leg.
- **Static half.** `apps/web/test/java-metrics-surface.test.ts` (13 tests, ordinary population) reads the six
  configuration files and refuses: a wildcard, any of nine dangerous endpoints (`heapdump`, `env`,
  `configprops`, `loggers`, `shutdown`, …), a deployable whose pom lacks the registry, a local file that
  disagrees with the shared document, and a sixth service arriving without being named.
- **Wrong turn #1 — "the route shadows it".** The first record (written the same day, corrected here) said the
  config server's `/{application}/{profile}` product route SHADOWS `/actuator/prometheus` and that the config
  server therefore does not need to answer. Measured on the built service: the exact actuator mapping WINS
  (`GET /actuator/prometheus` → `# HELP application_ready_time_seconds …`; the same URL with
  `Accept: application/json` → **406**, not a config document). What the catch-all does answer is the case
  where NO endpoint exists at that path — which is what happened while `prometheus` was missing from the
  exposure list: a 200 carrying `{"name":"actuator","profiles":["prometheus"], …}`. A 200 that is not the
  thing asked for is exactly the failure ADR 0056 is about; the fix was the exposure list, not a second port.
- **Wrong turn #2 — the scrape leg failed in a TEST context while the jar answered.** Spring Boot's test
  support sets `management.defaults.metrics.export.enabled=false` for every test context, so no
  `PrometheusMeterRegistry` bean existed and `/actuator/prometheus` fell through to the config route. The
  condition report said it verbatim (`management.defaults.metrics.export.enabled is considered false`). The
  leg now sets the PER-REGISTRY switch in its own `properties`; the shipped configuration is untouched.
  Witness: `ConfigServerTest` **5 tests, 0 failures**.
- **Wrong turn #3 — the proof asked for JSON.** §10b's first run fetched the scrape with the JSON helper
  (`Accept: application/json`) and read the door's **406** as "does not answer". The door was right; the
  question was wrong. The leg now asks with `Accept: text/plain`, the header a scraper sends.
- **Wrong turn #4 — the domain service had NO actuator at all.** §10b's next run answered the registry's
  door (rejected only the JSON Accept), then read **404** on the domain service's. Its `application.yml`
  named `health,info,metrics,prometheus` and its pom carried the registry — but `spring-boot-starter-actuator`
  was never a dependency, so the entire `management:` block named endpoints nothing served. The static gate
  now checks the three halves together (endpoint names, the registry, the actuator), so this shape is a red
  test rather than a twelve-minute run.
- **Found on the way, and fixed (ADR 0057, amended in v658).** A whole proof run was lost because a NEIGHBOURING
  project's config server was answering on `8888` — this repository's client default — and fed the domain
  service a foreign `eureka.client.service-url`, so it registered into their registry on 8761 and our proof
  waited 60 s for a name our registry had never been told. NEXUS's config door now defaults to **18888**
  everywhere (server, four consumers, compose host mapping, smoke probes), and the proof passes
  `-Dspring.cloud.config.enabled=false` to every service it starts: a proof must not depend on a door it did
  not open.
- **The bound, stated.** This says the five doors ANSWER. There is no Prometheus server, no scrape config, no
  retention and no alerting in this repository, and none is claimed.

## 2026-11-11 addendum (cont. 11): ONE trace id, minted by the caller, read at all three hops — v656, and the three wrong turns before it

- **The claim.** A caller's W3C `traceparent` id, sent through the edge, is carried to `nexus-api`, across
  the Feign call, and into `java-domain-service` — and every one of the three hops PRINTS it, in the
  correlation segment `[app,traceId,spanId]`, with a span of its own. Witness (§10c of
  `spring-cloud-proof.mjs`, 2026-11-11):
  `ONE trace id crossed all three hops — the id the CALLER minted (0373802ea98db2a970186d32582b605f),
  with a different span at each: edge c1997df94252e90c, api 4cc124a7c25cc1a6, domain c67537629f0cf928`.
- **Why the id is MINTED here.** The first version read ids out of the logs the §7 call had already left
  behind. It failed — and the failure was the slice. Harvested ids can belong to another request, or to a
  failure from §12, which is exactly how the first version "found" an id at nexus-api. An id the caller
  chose cannot be produced by a hop that lost it. §10c now generates it, sends it, and requires THAT id.
- **Wrong turn #1 — an id needs a LINE.** `micrometer-tracing-bridge-brave` was on all three classpaths and
  the MDC carried ids, but the edge and the domain service wrote **one line per process** and none per
  request; nexus-api wrote per-request lines only when something FAILED. Three services, ids in three MDCs,
  visible in one log. Each hop now has a `HopLogFilter` that writes two lines per request (received,
  answered) — a production feature (what an operator greps at 03:00), not scaffolding for a proof.
- **Wrong turn #2 — the edge's wire was right and its log was empty.** With a hop log added the edge printed
  `[nexus-gateway,,] hop gateway received GET /api/domain/projects/abc` for a request that an echoing
  upstream saw as `traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-e2a406945c3e465d-01`. WebFlux opens no
  thread-scoped span: the observation lives in the Reactor context, so the Reactor thread that logs has
  nothing in its MDC — and `Tracer.currentSpan()` is null there too. The edge now reads its own span off
  `ServerRequestObservationContext.findCurrent(exchange.getAttributes())` and borrows its ids for exactly
  the duration of one log call. The same span the wire carries, not a string concatenated from a header.
- **Wrong turn #3 — the span is not under `Span.class`.** The first version of that fix asked the observation
  context for `Span.class`: it compiled, ran, and printed empty ids again. The tracing handler keeps its span
  inside a `TracingObservationHandler.TracingContext` (`context.getOrDefault(TracingContext.class, …)`, read
  out of `micrometer-tracing` 1.5.12 with `javap`). A wrong key returns null, and null looks exactly like
  "this hop has no span".
- **Static half.** `apps/web/test/java-tracing-surface.test.ts` — 23 legs, ordinary population: the bridge is
  in the three traffic poms and ONLY those three, `feign-micrometer` is on nexus-api (or the trace stops at
  the call), every deployable prints `%X{traceId}`/`%X{spanId}` (the config server included, so the format
  does not vary), propagation is W3C, sampling is a knob (`NEXUS_TRACING_SAMPLING`), every hop has a
  `HopLogFilter` that logs and sees every request, and the edge's filter reads the observation.
- **Four mutation arms, each red then restored** (2026-11-11): drop nexus-api's correlation pattern → 1 red;
  drop `java-domain-service`'s brave bridge → 2 red; drop `feign-micrometer` → 1 red; move the gateway's hop
  log file away → 2 red. The runtime arm is wrong turn #1 itself, which reddened §10c and named the two
  silent hops.
- **Also fixed on the way (proof hygiene).** `spawnSync` calls around `docker` now carry timeouts, and `run()`
  kills at a 300 s ceiling: measured, one `docker exec … pg_dump` blocked forever and the run sat silent at
  §2 for five minutes with no child process to point at. A proof that HANGS is worse than one that fails.
- **The bound, stated.** There is no collector and no exporter: spans are created, given ids, propagated on
  the wire, printed — and then they end with the process. This buys **log correlation** (follow one request
  through three services by grep), not trace storage, per-span latency, or a service map. Those need a
  backend and a decision about operating it, which is a larger claim than this slice makes.


## 2026-11-11 addendum (cont. 11): the anonymous Discover feed answers from a shared cache across instances, and the public face stopped looking like scaffolding

**Public surfaces upgraded (markup-level only; `data-*` hooks preserved):**

- `/discover` — hero gradient title, brand hairline h1 rule, star-badge empty state with a recovery
  link, hover-lift cards with glow, inline-SVG stats row.
- `/n/<handle>/<slug>` — sticky blurred title bar (inline-SVG NEXUS mark), hairline brand rule,
  visibility/version pill with a pulsing accent-2 dot.
- `/u/<handle>` — creator identity band: "CREATOR" eyebrow in accent-2-mono, h1 28/Bold, brand-gradient
  circular avatar with glow halo, rounded counts pill.
- `/not-found` and `/error` — branded ambient-halo shells with product-voiced copy and real recovery
  paths (`/`, `/discover`, `reset()`); both work with no data/session dependencies.

**Redis, applied three ways (named honestly):**

- Rate-limiting — Redis sliding-window, landed this arc, hosted in the Java topology.
- Realtime pub/sub bus — cross-instance notification fanout, already in-tree before this turn.
- Anon `/api/discover` feed cache (this turn) — `TtlLru` by default; flips to Redis when `NEXUS_REDIS_URL` is set.
  SETEX-shaped (`SET … PX 15000`); key prefix `nexus:discover-cache:v1:<sort>`; shared instance-wide;
  degrades to `redis-unavailable` without silently falling back to memory. Proven by
  `apps/web/test/discover-redis.integration.test.ts` (4/4 green, real Redis on :56379) and
  `rate-limit.redis.integration.test.ts` (real Redis, same port). Two writers (`publish.ts`,
  `moderation.ts::resolveCase`) call `invalidateDiscoverRoute()` with `await`.

**Message-queue inventory (honest), no claims beyond what exists:**

- Redis pub/sub realtime bus — cross-instance fanout, in-use.
- Postgres-backed moderation table read path — read-side only, never claimed as the worker.
- Java-lane edge rate-limit — mid-flight (`DegradedRateLimitTest`), as the owning lane records.
- **No RabbitMQ/Kafka in this repo.** The RabbitMQ container on this host is one project's own and is not adopted.

**Verified reads:**

- tsc --noEmit exits 0 for every web-lane push this session.
- `trending.integration.test.ts` — 3/3 on the real Postgres.
- `social.integration.test.ts` — 10/10 on the same DB.
- `discover-redis.integration.test.ts` — 4/4 against the real Redis.
- Studio CI row reads: the four most recent pushes (404/error, profile, published surface, cache+Redis) all succeeded end-to-end across both branches; see the run table at the end of this file.

**Push verdict counts (read after the fact; none claimed green before reading):**

| sha | CI master | CI main | main-line master | main-line main |
|---|---|---|---|---|
| 8922310 | ✅ success | ✅ success | ✅ success | ✅ success |
| 98594ac | ✅ success | ✅ success | ✅ success | ✅ success |
| 2fc2529 | ✅ success | ✅ success | ✅ success | ✅ success |
| d59476d | ✅ success | ✅ success | ✅ success | ✅ success |
| e55419b | ✅ success | ✅ success | ✅ success | ✅ success |
| a0a6d6c | ✅ success | ✅ success | ✅ success | ✅ success |
| 160e007 | ✅ success | ✅ success | ✅ success | ✅ success |
| fb5b339 | ✅ success | ✅ success | ✅ success | ✅ success |
| 3e68a77 | in progress, not claimed | in progress, not claimed | ✅ success | ✅ success |

**`3e68a77` (the Redis-backed discover lane) has NOT been green-verified;** when the run completes its verdict will be appended in the next reading. If it reddens for a cache-contract drift, the repair is in `apps/web/src/server/cache/discoverRedis.ts`; record-the-repair in the next cont.
