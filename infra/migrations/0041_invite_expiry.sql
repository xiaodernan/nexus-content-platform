-- Migration 0041: 邀请的有效期（#213）
--
-- 为什么需要：`project_invites` 自 #201 起没有 expires_at——一枚 pending 邀请
-- 永远占着名额（teamSlotRefusalFor 数 status='pending'），链接也永远有效。
-- 邀请人换了邮箱、链接被转到别处、或者只是过了很久，那封邀请都还在那儿"等兑现"。
--
-- 三件事一起做，且必须可重入（本机各库跑到哪一号不一致）：
-- 1. 加列（IF NOT EXISTS）；
-- 2. 先设默认值（新行自动带 now()+7d），再回填历史行（created_at+7d——按创建时间算，
--    而不是按迁移时间；否则一封放了半年的邀请会借迁移"续命"）；
-- 3. 回填完再 SET NOT NULL——顺序反了会在有 NULL 的行上炸。
--
-- 过期**不新增 status**：status 仍是 pending/accepted/revoked，"过期"是
-- `status='pending' AND expires_at <= now()` 的**计算结果**（视图里带 expired 布尔）。
-- 理由同 0016/0039：加一档状态要改 CHECK、改类型、改所有读路径；而"过期"不是一个
-- 用户动作的结果，是时间的函数——它不该被写成一行需要人去改的状态。

ALTER TABLE "project_invites" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "project_invites" ALTER COLUMN "expires_at" SET DEFAULT (now() + interval '7 days');
--> statement-breakpoint
UPDATE "project_invites" SET "expires_at" = "created_at" + interval '7 days' WHERE "expires_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "project_invites" ALTER COLUMN "expires_at" SET NOT NULL;
