-- §188 M8（MCP / 外部 Agent / 公开 API）的第一块地基：给平台外的调用方一枚它自己管得住的凭据。
--
-- 为什么只存哈希（与 sessions 同一口径，§80）：这张表如果被拖走，明文 token 跟着一起没了就等于
-- 没有泄露；而 hint 只留随机段的前 8 位，够人在列表里认出"哪一把是 CI 那把"，不够拼回凭据。
--
-- 为什么不用 pg enum 装 scopes：加一格 scope 要重建类型，而 text[] + CHECK 只改约束——
-- 与 §133 的 users.plan 同一个理由。名单本身在 @nexus/schemas 的 API_TOKEN_SCOPES，
-- 那边多一格必须同时有真端点执行它（§159），所以这里的 CHECK 与那份名单是同一件事的两处写法。
CREATE TABLE IF NOT EXISTS "api_tokens" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "token_hash" text NOT NULL,
  "hint" text NOT NULL,
  "scopes" text[] NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_used_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id");
--> statement-breakpoint
-- 凭据跟着人走：这个人注销，他发的 token 没有理由还留着能读他的数据
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_name_length" CHECK (char_length("name") BETWEEN 1 AND 60);
--> statement-breakpoint
-- 空 scope 的 token 什么都读不到，却照样能过鉴权那一关——那种凭据只会让人以为"配好了"。
-- 所以在门口就拒，而不是等它每次调用都拿一个 403。
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_scopes_not_empty" CHECK (array_length("scopes", 1) IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_scopes_known"
  CHECK ("scopes" <@ ARRAY['projects:read', 'design:read']::text[]);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_tokens_hash_key" ON "api_tokens" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_tokens_user_idx" ON "api_tokens" ("user_id");
--> statement-breakpoint
COMMENT ON COLUMN "public"."api_tokens"."token_hash" IS
  '明文凭据的 SHA-256（十六进制）。库里从不保存明文，所以丢了只能重发，不能找回';
--> statement-breakpoint
COMMENT ON COLUMN "public"."api_tokens"."hint" IS
  '随机段前 8 位，只用于在列表里认出是哪一把；不足以拼回凭据';
--> statement-breakpoint
COMMENT ON COLUMN "public"."api_tokens"."last_used_at" IS
  '最后一次通过鉴权的时间；写入有分钟级节流（domain/api-tokens.ts），别让读接口变成写接口';
--> statement-breakpoint
COMMENT ON COLUMN "public"."api_tokens"."revoked_at" IS
  '吊销时间。行留着：那是"这枚凭据在某个时间之前存在过"的账，抹掉行就没法解释一次 401';
