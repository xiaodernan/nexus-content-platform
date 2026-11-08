-- Migration 0040: §133 + §188（#207）：公开 API 的名册端点，名单里再多一格 `team:read`。
--
-- 形状同 0019 / 0027 / 0028 完全一样（text[] + CHECK），理由不再重写：pg enum 加一格要
-- rewrite 整个列的存储类型，CHECK 换一个约束、已有凭据一行都不动。
--
-- **为什么名册读单独一格**：名册含成员邮箱。`projects:read` 是"项目清单与详情"，
-- 拿来读邮箱名单是顺带的权力；给团队协作用的集成（"谁在这个项目里"）应该是它自己
-- 申请的那一格。least-privilege 同 0028。
--
-- 端点只读：邀请/撤回/移除是 owner 的管理动作，v1 不给（§133：协作者之间不能互相拉人，
-- 公网凭据背后更没有"人"可批）。token 是 secret，名册回执里不出现它——与界面名册同一口径。

ALTER TABLE "api_tokens" DROP CONSTRAINT IF EXISTS "api_tokens_scopes_known";
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_scopes_known"
  CHECK ("scopes" <@ ARRAY['projects:read', 'projects:write', 'publish:write', 'design:read', 'design:write', 'team:read']::text[]);
--> statement-breakpoint
COMMENT ON COLUMN "public"."api_tokens"."scopes" IS
  '这枚凭据能做什么；取值域与 @nexus/schemas 的 API_TOKEN_SCOPES 一致，多一格必须同时有真端点执行它（§159）';
