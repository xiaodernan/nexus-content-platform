-- §48 记忆必须"可查看和删除"，而可查看的前提是知道它属于谁。
-- memories 原来只有 scope + subject_id：任何人拿到 id 就能读能删，按项目也列不出自己的那批。
-- 补两列归属：owner_id 是硬边界（谁的记忰谁能看/删），project_id 让项目面板能列出自己这批
-- （user / session 两类不属于任何项目，留 null）。
-- 表目前是空的（此前没有任何代码写过它），所以 owner_id 直接 NOT NULL，不留"无主记忆"这种状态。
ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "project_id" uuid;
--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "owner_id" uuid NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "memories" ADD CONSTRAINT "memories_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "memories" ADD CONSTRAINT "memories_owner_id_users_id_fk"
    FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_owner_idx" ON "memories" USING btree ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_project_idx" ON "memories" USING btree ("project_id");
