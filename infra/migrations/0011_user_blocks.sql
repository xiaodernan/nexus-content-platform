-- §132 社区治理的四件里，report（abuse_reports）与 moderation（moderation_cases）先落了，
-- block / mute 一直没有承载处——被骚扰的人除了举报没有任何自助手段。这张表补的就是那两件。
--
-- 为什么一条关系只有一行（而不是 block、mute 各一行）：block 的效果包含 mute
-- （拉黑了这个人，自然也不想再看到他的内容），"既拉黑又屏蔽"不是一个第三种状态。
-- 所以从 mute 升到 block 是改 kind，取消是删行；判定只看"有没有行 + 行是什么"。
CREATE TABLE IF NOT EXISTS "user_blocks" (
  "blocker_id" uuid NOT NULL,
  "blocked_id" uuid NOT NULL,
  -- 'block'：双向挡住互动（他碰不到我，我也碰不到他）+ 不再收到他的通知 + 他的内容不再出现
  -- 'mute'：只做可见性过滤，**不**限制对方互动，也不解除已有关注
  "kind" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id", "blocked_id");
--> statement-breakpoint
-- 两边都是 CASCADE：账号注销之后这条关系没有意义（不像通知那样是"我收到过什么"的历史），
-- 留下一行指向不存在的用户只会让列表显示一个查不到的人
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk"
  FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk"
  FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE no action;
--> statement-breakpoint
-- 拉黑自己会写出一行"我永远看不到我自己"，而界面上任何人都能点这个按钮（guest 也算）。
-- 挡在库里而不是只挡在调用方：与 §49 把所有权写进 SQL 的 where 同一条纪律
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_not_self" CHECK ("blocker_id" <> "blocked_id");
--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_kind" CHECK ("kind" IN ('block', 'mute'));
--> statement-breakpoint
-- "谁把我拉黑了"是排查骚扰时的第一问，也是唯一按 blocked_id 查的方向
CREATE INDEX IF NOT EXISTS "user_blocks_blocked_idx" ON "user_blocks" USING btree ("blocked_id");
