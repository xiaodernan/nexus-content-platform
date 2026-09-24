-- §168 Analytics：Creator 要看到 views / likes / remixes / followers / completion / play time。
-- 前四个从现有表就能数出来（published_projects.views、likes、remixes、follows），
-- 后两个**全平台没有任何采集**——没有采集就没有真值，所以这张表是这一条的正题。
--
-- 粒度选"一个访客 × 一份公开快照 × 一天"一行，而不是"一次访问一行"：
-- completion 与 play time 要按访客聚合（最远到达比例、累计可见时长），
-- 事件流那种形态适合以后接 §169 的分析 Agent，现在先把能诚实报出来的口径钉住。
CREATE TABLE IF NOT EXISTS "publication_visits" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "publication_id" uuid NOT NULL,
  -- 浏览器里生成的匿名 key：只为把同一个人的多次心跳并成一行，不代表账号，也不拿去认人
  "visitor_key" text NOT NULL,
  "day" date NOT NULL,
  -- 登录访客的账号；匿名留 null。作者的访问因此可以在查询里挑出来单独说明
  "user_id" uuid,
  "opens" integer NOT NULL DEFAULT 0,
  "visible_ms" bigint NOT NULL DEFAULT 0,
  "completion_pct" integer NOT NULL DEFAULT 0,
  -- 被上限截断过几次：数据被动过的痕迹必须留得下来，不然"累计时长"看着像原样
  "capped_reports" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "publication_visits" ADD CONSTRAINT "publication_visits_pkey" PRIMARY KEY ("id");
--> statement-breakpoint
ALTER TABLE "publication_visits" ADD CONSTRAINT "publication_visits_publication_id_published_projects_id_fk"
  FOREIGN KEY ("publication_id") REFERENCES "public"."published_projects"("id") ON DELETE CASCADE ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "publication_visits" ADD CONSTRAINT "publication_visits_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE no action;
--> statement-breakpoint
-- 心跳要 upsert，这一条唯一键就是它的合并规则；没有它，一次刷新就能造出十行"访客"
CREATE UNIQUE INDEX IF NOT EXISTS "publication_visit_day_key"
  ON "publication_visits" USING btree ("publication_id", "visitor_key", "day");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publication_visit_pub_idx" ON "publication_visits" USING btree ("publication_id", "day");
