-- §188 M8 第八片：公开 API 有了"发布/下架"，所以名单里再多一格 `publish:write`。
--
-- 形状同 0019 / 0027 完全一样（text[] + CHECK），理由不再重写：pg enum 加一格要 rewrite
-- 整个列的存储类型，CHECK 换一个约束、已有凭据一行都不动。
--
-- **为什么发布单独一格、没有并进 `projects:write`**：发布把一页内容放到公网上
-- （哪怕只是 unlisted 也拿到了 URL），与"建一个空项目"、"删一个自己的项目"是三种
-- 不同的风险。合成一格的话，一枚为了建项目签的凭据就顺带着学会了发布——least-privilege
-- 是这一列的设计前提（0019 的注释演过三遍：读写分开 → 项目与设计分开 → 发布独立）。
--
-- 这一格的限度也写在端点里而不是只写在这里：v1 只接受 unlisted / private，
-- public 必须回平台界面（§131 的机检与人工裁决在人的路径上，凭据背后没有人可批）。
ALTER TABLE "api_tokens" DROP CONSTRAINT IF EXISTS "api_tokens_scopes_known";
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_scopes_known"
  CHECK ("scopes" <@ ARRAY['projects:read', 'projects:write', 'publish:write', 'design:read', 'design:write']::text[]);
--> statement-breakpoint
COMMENT ON COLUMN "public"."api_tokens"."scopes" IS
  '这枚凭据能做什么；取值域与 @nexus/schemas 的 API_TOKEN_SCOPES 一致，多一格必须同时有真端点执行它（§159）';
