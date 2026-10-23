-- Migration 0038: 批注的「已解决」状态（§111）
--
-- 一行时间戳，不是布尔。与 `projects.deleted_at` 同一条纪律：状态由时间的存在性推出来
-- （NULL = 未解决），存"什么时候解决的"而不是"是不是解决的"——两个字段会漂移，一个字段不会。
-- 顺带白拿一样东西：重新打开再标一次，第二次的时间盖掉第一次，
-- 于是"这条被反复开关过"在数据里留得下痕迹（布尔只有一个位，做不到）。
--
-- CHECK 把"只有画布批注能进入已解决状态"放在库上：公开评论（§59）的 node_id 为空，
-- 它们的"已解决"没有意义——没有人会去"解决"一句公开发言。服务端 PATCH 按同一条件取行，
-- 库是第二道门，不是唯一一道：客户端到不了这里，直接连库的人到得了。
--
-- 用 DO $$ 包住是因为 PG 没有 `ADD CONSTRAINT IF NOT EXISTS`。迁移必须可重入：
-- 本机每个库各自跑到哪一号不一致（回归库 0037、开发库可能更旧），
-- 漏跑一次再补跑不该炸在半路。

ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_resolved_at_only_annotations') THEN
    ALTER TABLE "comments"
      ADD CONSTRAINT "comments_resolved_at_only_annotations"
      CHECK ("resolved_at" IS NULL OR "node_id" IS NOT NULL);
  END IF;
END $$;
