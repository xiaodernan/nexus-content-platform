-- §60 创作者主页要 Bio，§59 的作品页要 Save。两样都是"表里还没有的地方"，
-- 所以这里加的是最小的一份，不是先建一张大 profile 表再往里塞东西。
--
-- bio 直接放 users：它就是主页上那一段自我介绍，没有版本、没有归属争议，
-- 单开一张 1:1 表只会让"读一个主页"变成两次查询 + 一处会不同步的外键。
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" text;
--> statement-breakpoint
-- 收藏：§59 的 Save。存的是"我收下了这一版公开页"，所以挂 publication_id 而不是 project_id——
-- 作者重新发布之后旧链接还在，收藏不该跟着悄悄换内容。
CREATE TABLE IF NOT EXISTS "saves" (
  "user_id" uuid NOT NULL,
  "publication_id" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "saves" ADD CONSTRAINT "saves_pkey" PRIMARY KEY ("user_id", "publication_id");
--> statement-breakpoint
ALTER TABLE "saves" ADD CONSTRAINT "saves_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "saves" ADD CONSTRAINT "saves_publication_id_published_projects_id_fk"
  FOREIGN KEY ("publication_id") REFERENCES "public"."published_projects"("id") ON DELETE CASCADE ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saves_user_idx" ON "saves" USING btree ("user_id", "created_at");
