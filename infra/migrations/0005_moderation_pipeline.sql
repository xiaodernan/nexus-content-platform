-- §131/§132 发布审核与举报：published_projects.moderation 这一列从项目开始起就一直是 'pending'，
-- 因为平台没有审核管线——把它写成 'approved' 就是假状态（docs/SECURITY.md 里也这么记着）。
-- 这两张表把那条链补上：机检扫过每一次发布（moderation_cases），社区能从公开页举报（abuse_reports），
-- 而真正把它改成 approved / rejected 的只能是人工裁决。
--
-- 为什么机检结果不直接写进 published_projects.moderation：
-- 词表扫描只能说"没查出台词红线"，不能说"审核通过"。所以机检只会产出 clear / review / blocked 三档，
-- 其中 review 与 blocked 立案进队列；moderation 保持 'pending'，直到有人（role='admin'）裁决。
CREATE TYPE "moderation_case_decision" AS ENUM('clear', 'review', 'blocked');
--> statement-breakpoint
CREATE TYPE "report_reason" AS ENUM('minor_safety', 'intimate_nonconsensual', 'impersonation', 'illegal', 'ip', 'spam', 'other');
--> statement-breakpoint
CREATE TYPE "report_status" AS ENUM('open', 'reviewing', 'closed');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "moderation_cases" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL,
  -- 被机检挡下的那次发布根本没有 publication 行
  "publication_id" uuid,
  "publication_version" integer NOT NULL,
  "visibility" "visibility" NOT NULL,
  "decision" "moderation_case_decision" NOT NULL,
  -- 只有需要人看的案子才进队列，clear 不淹没它
  "review_required" boolean NOT NULL DEFAULT false,
  "findings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- 哪一版规则扫的：规则会改，旧案要能说清当时看到什么
  "rules_version" text NOT NULL,
  "resolved_by" uuid,
  "resolution" "moderation_status",
  "resolution_note" text,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_publication_id_published_projects_id_fk"
  FOREIGN KEY ("publication_id") REFERENCES "public"."published_projects"("id") ON DELETE SET NULL ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_resolved_by_users_id_fk"
  FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moderation_case_project_idx" ON "moderation_cases" USING btree ("project_id", "created_at");
--> statement-breakpoint
-- 人工队列就是这条索引查出来的：待看 + 没裁决完的
CREATE INDEX IF NOT EXISTS "moderation_case_queue_idx" ON "moderation_cases" USING btree ("review_required", "resolved_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "abuse_reports" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "publication_id" uuid NOT NULL,
  -- 举报是按 URL 进来的；取消发布后这行仍要能复盘，所以路径冗余存一份
  "path" text NOT NULL,
  "reason" "report_reason" NOT NULL,
  "detail" text,
  "reporter_id" uuid,
  "status" "report_status" NOT NULL DEFAULT 'open',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_publication_id_published_projects_id_fk"
  FOREIGN KEY ("publication_id") REFERENCES "public"."published_projects"("id") ON DELETE CASCADE ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_reporter_id_users_id_fk"
  FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "abuse_report_publication_idx" ON "abuse_reports" USING btree ("publication_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "abuse_report_status_idx" ON "abuse_reports" USING btree ("status");
