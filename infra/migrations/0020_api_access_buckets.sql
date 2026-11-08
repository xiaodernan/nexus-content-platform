-- §188 M8 第三片：公开 API 的读路径终于答得出"哪一枚凭据在什么时候读了哪一份文档"。
-- 第一片只有 `last_used_at`（分钟级、只有一个时间），第二片给写开了账，读那一半还欠着。
--
-- 为什么不写进 §80 那张 `audit_events`：那张表记的是**决定**（放行 / 拒绝），
-- `domain/audit.ts` 开头那条纪律就是"别把每次读都记进去，否则真出事时那几行找不出来"。
-- 这里记的是**用量**：形状不同（带计数）、保留期不同（有天花板）、读者也不同
-- （凭据的主人看自己的用量，审核员看裁决）。两种账混一张表，两边都会变成没法看的那一种。
--
-- 为什么按分钟切桶、而不是每次调用写一行：这样 "读接口不许变成写接口" 那条纪律在开了账之后
-- 依然成立——一次调用最多让"这一分钟的这个（凭据, 端点, 项目）"多一个计数，产生不了新的一行。
-- 新增行的速率因此由读限流封顶（`@nexus/schemas` 的 `API_TOKEN_RATE_LIMITS_PER_MINUTE.read`），
-- 而不是由调用方说了算。
CREATE TABLE IF NOT EXISTS "api_access_buckets" (
  "token_id" uuid NOT NULL,
  "endpoint" text NOT NULL,
  "project_id" text NOT NULL DEFAULT '',
  "bucket" timestamp with time zone NOT NULL,
  "last_seen" timestamp with time zone NOT NULL DEFAULT now(),
  "calls" integer NOT NULL DEFAULT 1
);
--> statement-breakpoint
ALTER TABLE "api_access_buckets" ADD CONSTRAINT "api_access_buckets_pkey"
  PRIMARY KEY ("token_id", "endpoint", "project_id", "bucket");
--> statement-breakpoint
-- 账跟着凭据走：吊销一枚凭据**不**抹掉它读过什么——那正是吊销之后最要查的东西
-- （吊销只打时间戳、行留着，同 0018 那条理由）。但发凭据的人注销了，这本账就没有主人了，
-- 于是与 api_tokens 同一条 ON DELETE CASCADE。
ALTER TABLE "api_access_buckets" ADD CONSTRAINT "api_access_buckets_token_id_fkey"
  FOREIGN KEY ("token_id") REFERENCES "api_tokens"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- 计数只能是正数：一行"这一分钟调用了 0 次"的账本身就是假账。
ALTER TABLE "api_access_buckets" ADD CONSTRAINT "api_access_buckets_calls_positive"
  CHECK ("calls" >= 1);
--> statement-breakpoint
-- 桶必须是整分钟。这条看着像洁癖，其实是这张表唯一一处能挡住"每次调用写一行"的地方：
-- 谁把 `now()` 原样写进 bucket，主键就每次都不一样，行数立刻回到调用次数那个量级——
-- 上面那段"为什么切桶"的理由会被一行代码悄悄作废，而库会替他记住这件事。
ALTER TABLE "api_access_buckets" ADD CONSTRAINT "api_access_buckets_bucket_is_minute"
  CHECK (date_trunc('minute', "bucket") = "bucket");
--> statement-breakpoint
-- 面板按"这枚凭据最近在做什么"读这张表，那是唯一的读法；保留期的清理也走同一个索引。
CREATE INDEX IF NOT EXISTS "api_access_buckets_token_recent_idx"
  ON "api_access_buckets" ("token_id", "last_seen" DESC);
--> statement-breakpoint
COMMENT ON COLUMN "public"."api_access_buckets"."endpoint" IS
  '被访问的端点标签，与路由自己报失败时说的那一句同一个字符串（例如 `GET /api/v1/projects/[projectId]/design`）；项目 id 不混在这里，它在 project_id';
--> statement-breakpoint
COMMENT ON COLUMN "public"."api_access_buckets"."project_id" IS
  '这次读落在哪个项目上；集合类端点没有具体项目，是空串——用空串而不是 NULL 因为它要进主键，而 NULL 在主键里彼此不相等，同一条集合访问会记成无数行';
--> statement-breakpoint
COMMENT ON COLUMN "public"."api_access_buckets"."bucket" IS
  '分钟桶（date_trunc 到分钟，CHECK 挡着）。同一（凭据, 端点, 项目, 桶）只有一行，calls 是这一分钟里的次数';
--> statement-breakpoint
COMMENT ON COLUMN "public"."api_access_buckets"."calls" IS
  '这一分钟里这个端点被这枚凭据调了几次（含第一次）。只在插入那一次写 1，之后每次是 +1 而不是改时间——所以 last_seen 才是"这一分钟最后一次"，bucket 是"哪一分钟"（§188）';
