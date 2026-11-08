-- Migration 0039: §133 teamCollaboration 那一格的落点——项目协作者与邀请（#201）
--
-- 两张表，因为"已成事实"与"未兑现的承诺"生命周期不同：
-- - project_members：邀请被接受后才有一行。unique(projectId, userId) 挡的是两个标签页
--   同时接受同一枚邀请——没有它，那种并发会插出两行成员，而名额门的计数从此虚高。
-- - project_invites：pending 占名额（否则可以无限发邀请绕过长位上限），accepted / revoked 是终态。
--   token 是邀请链接的 secret，不参与任何鉴权 cookie——它只证明"这枚邀请是真的"。
--
-- owner 自己不是成员行：PLAN_LIMITS.teamMembers 数的是"除 owner 外还能拉几个人"。
-- 把 owner 也算进去，free 档（1）就连自己都装不下了——那不是限制，是有毛病。
--
-- CHECK 把角色与状态钉在库上：text 而不是 pg enum，理由同 0016（加一档只改约束，不重建类型）。
--
-- 用 IF NOT EXISTS / DO $$ 包住：迁移必须可重入，本机各库跑到哪一号不一致
-- （回归库 0038、开发库可能更旧），漏跑一次再补跑不该炸在半路。

CREATE TABLE IF NOT EXISTS "project_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'editor',
  "invited_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "project_members_role_check" CHECK ("role" IN ('editor', 'viewer'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_members_unique" ON "project_members" ("project_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_members_user_idx" ON "project_members" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "role" text NOT NULL DEFAULT 'editor',
  "token" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "invited_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "accepted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "project_invites_role_check" CHECK ("role" IN ('editor', 'viewer')),
  CONSTRAINT "project_invites_status_check" CHECK ("status" IN ('pending', 'accepted', 'revoked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_invites_token_key" ON "project_invites" ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_invites_project_idx" ON "project_invites" ("project_id");
