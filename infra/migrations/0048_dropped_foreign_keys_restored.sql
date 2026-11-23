-- 0048 · 把丢掉的外键补回来：一条迁移声明过、库里却没有的外键，就是漂移，不是"还没用到"。
--
-- 怎么发现的：`apps/web/test/db-fk-parity.integration.test.ts` 拿 `infra/migrations/*.sql` 里声明的
-- 外键名单去比 `pg_constraint`。2026-11-23 首次运行点名 8 条——全在开发库 `nexus` 上，
-- 而按同一批迁移从零建起来的库（`nexus_regress`）99 条一条不差、动作也全部一致。
-- 丢外键的后果不是"少个约束"那么安静：
--   * `credit_ledger_task_id_agent_tasks_id_fk` 不在，删掉一行 agent_tasks 就不再置空账本的 task_id，
--     `credits.integration` 那条用例于是红成"只追加触发器把外键动作也挡了"——真正的原因是库不按迁移长；
--   * `sessions_user_id_users_id_fk` 不在，删用户不会带走他的 session，
--     `visual-benchmark` 就把自己上一轮留下的那行 `token_hash`（全表 UNIQUE）留了下来，第二次跑必红。
-- 为什么会丢：`npm run db:push`（drizzle-kit push）是**按 schema.ts 把库推平**的，它不看迁移史；
-- 一旦从一份还没有这些引用的 schema 推一次，库里对应的外键就被删掉了。而 runner 只认
-- `nexus_meta.schema_migrations` 里的版本号，0000 与 0016 早记成"已应用"，永远不会自己补回来。
--
-- 为什么一律 NOT VALID：这些库面积累的行里，指向已经不存在的父行的行非常多（2026-11-23 实测，
-- branches 4947/6197、design_nodes 133/219897、knowledge_chunks 9253/12621、pages 4799/6045、
-- sessions 365/3295、credit_ledger user 1314 / task 702 / project 695，共 2613 行账）。
-- 直接 ADD CONSTRAINT 会 23503 失败；要清掉这些行就是删别人的开发数据，不该由一条迁移替谁决定。
-- NOT VALID 的语义正好是这件事要的：旧行不动，**新写的与之后的改动一律照外键走**——
-- 包括删父行时该发生的 SET NULL / CASCADE，所以上面两条红确实是这条迁移治的。
-- 全新建的库走不到这里：外键本就在，`IF NOT EXISTS` 守卫直接跳过， validated 状态不受影响。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branches_project_id_projects_id_fk') THEN
    ALTER TABLE "branches"
      ADD CONSTRAINT "branches_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id")
      ON DELETE cascade ON UPDATE no action NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'design_nodes_page_id_pages_id_fk') THEN
    ALTER TABLE "design_nodes"
      ADD CONSTRAINT "design_nodes_page_id_pages_id_fk"
      FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id")
      ON DELETE cascade ON UPDATE no action NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_chunks_project_id_projects_id_fk') THEN
    ALTER TABLE "knowledge_chunks"
      ADD CONSTRAINT "knowledge_chunks_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id")
      ON DELETE cascade ON UPDATE no action NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pages_project_id_projects_id_fk') THEN
    ALTER TABLE "pages"
      ADD CONSTRAINT "pages_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id")
      ON DELETE cascade ON UPDATE no action NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_users_id_fk') THEN
    ALTER TABLE "sessions"
      ADD CONSTRAINT "sessions_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE cascade ON UPDATE no action NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_ledger_user_id_users_id_fk') THEN
    ALTER TABLE "credit_ledger"
      ADD CONSTRAINT "credit_ledger_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE CASCADE ON UPDATE no action NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_ledger_task_id_agent_tasks_id_fk') THEN
    ALTER TABLE "credit_ledger"
      ADD CONSTRAINT "credit_ledger_task_id_agent_tasks_id_fk"
      FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id")
      ON DELETE SET NULL ON UPDATE no action NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_ledger_project_id_projects_id_fk') THEN
    ALTER TABLE "credit_ledger"
      ADD CONSTRAINT "credit_ledger_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id")
      ON DELETE SET NULL ON UPDATE no action NOT VALID;
  END IF;
END $$;
