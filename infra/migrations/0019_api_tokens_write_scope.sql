-- §188 第二片：公开 API 有了写端点，所以名单里多一格 `design:write`。
--
-- 为什么用 text[] + CHECK 而不是 pg enum：这条在 0018 已经写过一次，这里是它第一次被真的用到——
-- 加一格只需要换一个约束，不用重建类型，已有凭据一行都不动。
--
-- 约束换掉而不是追加：`<@` 的语义是"整串都在名单里"，两条 CHECK 同时存在时旧那条会把新值挡死，
-- 所以必须先 DROP 再 ADD。顺序反了不会留下"看起来加了其实没加"的中间态——DROP 失败则整个迁移失败。
--
-- 名单本身在 `@nexus/schemas` 的 API_TOKEN_SCOPES。两边必须是同一份：
-- `apps/web/test/api-tokens.test.ts` 从所有迁移文件里取**最后一条**定义这条约束的 SQL（也就是生效的那一条），
-- 与常量比；`api-tokens.integration.test.ts` 再从库的 pg_catalog 里把生效约束读回来比一次。
ALTER TABLE "api_tokens" DROP CONSTRAINT IF EXISTS "api_tokens_scopes_known";
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_scopes_known"
  CHECK ("scopes" <@ ARRAY['projects:read', 'design:read', 'design:write']::text[]);
--> statement-breakpoint
COMMENT ON COLUMN "public"."api_tokens"."scopes" IS
  '这枚凭据能做什么；取值域与 @nexus/schemas 的 API_TOKEN_SCOPES 一致，多一格必须同时有真端点执行它（§159）';
