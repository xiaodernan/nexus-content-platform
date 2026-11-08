-- §164 NOTIFICATIONS：原文列了四类（Generation / Build / Agent task / Publish complete）。
-- 本表只装**今天真的有终态事件**的那几类：发布完成、人工裁决结果、别人对你的作品做了动作。
-- 前三类里 Generation 与 Agent task 在 web 侧没有可订阅的终态（AI 请求是同步回话、
-- agent_tasks 表全库没有写入方），Build 这个操作本身还不存在——
-- 给它们建行等于凭空造通知，所以这三类在界面上列成"没有真实来源"，不进这张表（§159）。
--
-- 为什么要有 dedupe_key：like / follow 是开关式的，一个人反复点五次不该堆五条通知；
-- 有唯一键之后 emit 就是 INSERT ... ON CONFLICT DO NOTHING，重试也不会翻倍。
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  -- 收件人：一条通知只属于一个人，读与标记都按这一列判定
  "user_id" uuid NOT NULL,
  -- 造成这件事的人；发布与人工裁决没有"别人"，审核裁决那类另有 admin_id 在案卷里
  "actor_id" uuid,
  -- 取值由 src/lib/notify-plan.ts 那一侧联合类型把住（唯一的写入方），没有用 pg enum：
  -- §162 的作业队列接上之后要多一类 generation，改表的类型不该是加一类通知的前提
  "kind" text NOT NULL,
  "title" text NOT NULL,
  -- 摘录（评论正文等），写入前已按上限裁短；不把整段用户输入当标题挂出去
  "body" text,
  -- 站内相对地址；没有能跳的地方（例如对方账号没有 handle）就是 null，不编一个 404 地址
  "link" text,
  -- 指针留着是为了在读取时判断"目标还在不在"，不是为了拼地址
  "project_id" uuid,
  "publication_id" uuid,
  "dedupe_key" text NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE no action;
--> statement-breakpoint
-- actor 注销后通知要留着：那是"我曾经收到过一条消息"的历史，不是那个人的资产
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk"
  FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL ON UPDATE no action;
--> statement-breakpoint
-- 这里刻意用 SET NULL 而不是 CASCADE：作者下架（DELETE publication）或换版本
-- 会把收件箱里的历史一起删掉，那等于让别人的通知取决于作者的一次点击。
-- 行留着、指针空着，读取时就能明说"这一版已经不公开了"。
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_publication_id_published_projects_id_fk"
  FOREIGN KEY ("publication_id") REFERENCES "public"."published_projects"("id") ON DELETE SET NULL ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_dedupe_key" ON "notifications" USING btree ("dedupe_key");
--> statement-breakpoint
-- 收件箱按时间倒序取一页，未读数用同一索引的 user_id 前缀过滤 read_at is null
CREATE INDEX IF NOT EXISTS "notification_inbox_idx" ON "notifications" USING btree ("user_id", "created_at");
