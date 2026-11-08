-- §40-42 分镜表（Storyboard）。一个项目一份，v1 与 worlds / games 同一口径：
-- 面板、镜头参考图（§38/§39 那条链）、时间线（§41）都从这一份出发，
-- 所以这里不预备"一个项目多份分镜"的形状——真需要那天再加，别提前造概念。
--
-- document 存 @nexus/video-model 序列化出来的 Storyboard（{ id,title,source,shots,notes }）。
-- 时间戳只放进行列、不塞进文档：那份包是纯函数，同一句 prompt 两次投影要得到逐字节相同的文档（§16 可重放），
-- 把 updatedAt 混进 JSON 就等于让"存了几次"出现在内容里。
CREATE TABLE IF NOT EXISTS "storyboards" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL,
  "owner_id" uuid NOT NULL,
  "title" text NOT NULL,
  "document" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "storyboards" ADD CONSTRAINT "storyboards_pkey" PRIMARY KEY ("id");
--> statement-breakpoint
-- 项目删了分镜就该跟着走；写这份分镜的人注销则不该抹掉项目的历史，所以 restrict
ALTER TABLE "storyboards" ADD CONSTRAINT "storyboards_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "storyboards" ADD CONSTRAINT "storyboards_owner_id_users_id_fk"
  FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE no action;
--> statement-breakpoint
-- "一个项目一份"写进库，而不是只写在读法里（读最新一行）：
-- 没有这条，两次并发建档会留下两行都算数的分镜，界面上只显示其中一份，另一份成了没人知道的影子。
ALTER TABLE "storyboards" ADD CONSTRAINT "storyboards_project_id_key" UNIQUE ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storyboards_owner_idx" ON "storyboards" USING btree ("owner_id");
