-- §111 批注的「已解决」：一行时间戳，不是布尔。
--
-- 与 `projects.deleted_at` 同一条纪律：状态由时间的存在性推出来（NULL = 未解决），
-- 存"什么时候解决的"而不是"是不是解决的"——两个字段会漂移，一个字段不会。
--
-- CHECK 把"只有画布批注能进入已解决状态"放在库上：公开评论（§59）的 node_id 为空，
-- 它们的已解决没有意义；服务端 PATCH 按同一条件取行，库是第二道（不是唯一一道）。
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_resolved_at_only_annotations"
  CHECK ("resolved_at" IS NULL OR "node_id" IS NOT NULL);
