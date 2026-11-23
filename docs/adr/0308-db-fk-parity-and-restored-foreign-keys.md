# ADR-0308 · 库可以不按迁移长：一条 parity 门把这种漂移变成看得见的红（2026-11-23）

## 状态

已接受（2026-11-23）

## 背景

v871 的全量跑里两条用例红，看起来都不像"库的问题"：

- `credits.integration` 的「删掉一行 agent_tasks → 账本里指着的 `task_id` 被置空」红成
  `expected '7349d46e-…' to be null`。这句话在主视图里读起来像那个只追加触发器把外键动作也挡了——
  而它旁边那条反向对照（直接 `update … set task_id = null` 必须被 `只追加` 挡下）却是绿的。
- `visual-benchmark` 在 `beforeAll` 就炸：`duplicate key … sessions_token_hash_key`。它的 fixture
  把 token 写死成 `'vb-token'`，`afterAll` 删项目删用户，**从不删自己那行 session**——
  第一次跑侥幸过，第二次起每次都撞自己留下的行。

查下去，两件事是同一个根：**本机开发库 `nexus` 上少了 8 条外键**，而且都是已入库的迁移声明过的：

| 缺的外键 | 出处 | 该是什么动作 |
| --- | --- | --- |
| `branches_project_id_projects_id_fk` | `0000_init.sql` | CASCADE |
| `design_nodes_page_id_pages_id_fk` | `0000_init.sql` | CASCADE |
| `knowledge_chunks_project_id_projects_id_fk` | `0000_init.sql` | CASCADE |
| `pages_project_id_projects_id_fk` | `0000_init.sql` | CASCADE |
| `sessions_user_id_users_id_fk` | `0000_init.sql` | CASCADE |
| `credit_ledger_user_id_users_id_fk` | `0016_credit_ledger.sql` | CASCADE |
| `credit_ledger_task_id_agent_tasks_id_fk` | `0016_credit_ledger.sql` | SET NULL |
| `credit_ledger_project_id_projects_id_fk` | `0016_credit_ledger.sql` | SET NULL |

`sessions_user_id_users_id_fk` 不在，删用户就不带走 session——上面那条 `visual-benchmark` 的
自撞尸体正是它留下的；`credit_ledger_task_id_agent_tasks_id_fk` 不在，删任务自然没人置空指针——
上面那条红不是触发器的错，是**这台库早已不是这些迁移建出来的那台**。

为什么会这样而没人知道：`npm run db:push`（`drizzle-kit push`）按 `schema.ts` 把库**推平**，
它不看迁移史，一份还没有某条引用的 schema 推一次，库里对应的外键就被删；而
`scripts/db-migrate.mts` 只认 `nexus_meta.schema_migrations` 里的版本号——0000 与 0016 早记成
"已应用"，永远不会自己把外键补回来。两边没有任何一处把"库 = 迁移的结果"这句话钉住。

同一台容器里按迁移从零建起来的库（`nexus_regress`、`nexus_two_instance_b`）是好的：
`credit_ledger` 三条外键都在、99 条全 validated。**丢东西的只有日常在用的那一台**，
也就是测试默认连的那一台（`apps/web/src/server/db/client.ts` 的 `…:5443/nexus`）。

## 决策

1. **加一道 parity 门**：`apps/web/test/db-fk-parity.integration.test.ts` 从
   `infra/migrations/*.sql` **派生**外键名单（两种写法都读：`ALTER … ADD CONSTRAINT … FOREIGN KEY`，
   以及 `CREATE TABLE` 里列内的 `REFERENCES`——后者 Postgres 自动命名 `<表>_<列>_fkey`，实测 22 条），
   再和 `pg_constraint` 比。比的是四件事，各自一条腿：
   声明了库里没有（漂移）／库里多了没声明的（有人手工改库）／删除动作不一致（SET NULL 被换成 NO ACTION
   也是漂移）／同名挂错列。另加一条人口下限腿，防止解析器哪天什么都不产出、于是"比对了个空"而假绿。
2. **用一条守卫式迁移补回来**：`infra/migrations/0048_dropped_foreign_keys_restored.sql`，
   照 `0038` 已有的 `DO $$ IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = …) $$` 写法。
   它在全新库上是**实测 no-op**（按 49 条迁移从零建库后仍 99 条、0 条未验证），只在缺的地方补。
3. **补回来的外键一律 `NOT VALID`，不清数据**。这些开发表面积累了大量指向已删父行的旧行
   （2026-11-23 实测：`branches` 4947/6197、`knowledge_chunks` 9253/12621、`pages` 4799/6045、
   `sessions` 365/3295、`credit_ledger` user 1314 / task 702 / project 695，共 2613 行账）。
   直接 `ADD CONSTRAINT` 会 23503 失败；要让它成功就得删这些行——**那是别人的开发数据，
   不该由一次修 bug 的顺手操作决定**。`NOT VALID` 的语义正好是要的：旧行不动，之后的写入与改动
   一律照外键走，**包括删父行时的 SET NULL / CASCADE**，所以两条红确实由它治。
   parity 门因此只断言"在不在、动作对不对、挂在哪一列"，不断言 `convalidated`。
4. **出处归第一次声明**。解析时同名外键以**最早那条迁移**为准，后来的同名声明只用来查动作是否一致。
   理由在实测里：让 0048 覆盖 0016，缺失清单就会把责任报给"修复它的那条迁移"而不是"当初立它的那条"，
   红话就变成假话。同名两种声明这一情形本身也升格成一条腿（`conflicts`）。
5. **fixture 自己扫自己的尸体**：`visual-benchmark` 的 token 改成每次运行一枚
   （`vb-token-<uuid>`），`afterAll` 先删 session 再删用户。不靠外键的 CASCADE 替它收尾——
   一条用例的清洁不该依赖另一条迁移有没有被跑过。

## 备选与否决

- **每次测试前重建库**：慢，而且把漂移**藏起来**而不是命名；CI 与本机从此永远不一致。
- **只在 `docs/ENVIRONMENT.md` 写一句"记得跑 db:migrate"**：这句本来就是真的，缺的是让人发现它没用的东西。
- **删掉孤儿行以恢复 validated 外键**：见决策 3，毁的是别人的数据。
- **让 `credits` 用例自己兜底**（查不到外键就跳过）：把一个库的问题写成代码的容错，
  正是这条链路上最不该出现的假绿。

## 后果

- 好消息：`push` 抹掉一条外键之后，**下一次跑测试就会点名**，而不是等某个依赖外键动作的用例
  以"功能坏了"的姿态红；缺哪条、哪条迁移声明的、该是什么动作，一次说全。
- 开发库 `nexus` 现在带 8 条 `NOT VALID` 外键。它们是**真的约束**（新行受管），只是不追溯旧孤儿；
  谁要是把这些孤儿清了，`VALIDATE CONSTRAINT` 就能补上，门不会因此变红。
- `db:push` 仍然是可达的路径，本 ADR 不去禁它——它禁不掉（`package.json` 里有，别的 lane 会用）。
  门是它的对照物：推平一次，只要结果不等于迁移史，红就在下一次 `npx vitest run` 里等着。
- 这条门需要库；库不在就整族跳过（与 `job-lane-idempotency` 同一纪律），所以无库环境不会因为
  "读不到库"而被误报成"库不对"——这是 read-failure 那条纪律在这一族的落点。

## 验证（2026-11-23 实测）

- 修复前：`nexus` 91 条外键、缺 8 条 → 门红，逐条点名（含出处与动作）；`credits` 1 红；`visual-benchmark` 1 红。
- 从零建一台 `nexus_fk048_proof`（49 条迁移全跑）→ 99 条、0 条未验证、门 6 passed，
  证明 0048 在正确库上是 no-op。
- `npm run db:migrate`（对 `nexus`，补 0047+0048）后：门 6 passed，`credits` 绿，`visual-benchmark` 绿，
  三个套件合跑 `Test Files 3 passed / Tests 23 passed`。
- 落库前的全树复跑（这次修复的落地证据）：`npx vitest run --reporter=dot` →
  **`Test Files 657 passed | 2 skipped (659)` / `Tests 8443 passed | 5 skipped (8448)`，exit 0，719s**。
  相对 v871 基线（658 文件 / 8442 用例、2 文件红）的增减就是这道新门的 6 条腿；
  8 条新受管的外键没有让任何别的套件变红。参照库同日复测：`nexus_regress`、`nexus_two_instance_b`
  各 99 条外键、0 条未验证、`credit_ledger` 三条都在；`nexus` 修后 99 条，其中补回的 8 条为 `NOT VALID`。
- 走查桩 6 条，每条都 refused / named / restored 齐过（在一次性库上打桩，不碰 `nexus`）：
  P1 少一条外键（并检查点名指的是 `0000_init.sql` 这个出处）、P2 删除动作被换、P3 同名挂错列、
  P4 库里多一条没迁移声明的、P5 把解析器改瞎（人口腿必须红）、P6 同名两条声明动作不一致；
  每个桩跑完都把库与原字节恢复，并复测回绿。
