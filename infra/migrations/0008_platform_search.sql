-- §165 全平台搜索。中文没有空格分词，to_tsvector 的 default/simple 配置都切不出"王城"这种词，
-- 所以走 trigram 子串匹配：ILIKE 的语义 + GIN 索引，中英文一视同仁，也不引入分词器依赖。
-- 代价是索引比 btree 大、写入多一点——搜索是读多写少的路径，这个方向上的开销放得下。
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_name_trgm_idx" ON "projects" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_description_trgm_idx" ON "projects" USING gin ("description" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_display_name_trgm_idx" ON "users" USING gin ("display_name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_handle_trgm_idx" ON "users" USING gin ("handle" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worlds_name_trgm_idx" ON "worlds" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worlds_summary_trgm_idx" ON "worlds" USING gin ("summary" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "games_name_trgm_idx" ON "games" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "games_summary_trgm_idx" ON "games" USING gin ("summary" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "characters_name_trgm_idx" ON "characters" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pages_name_trgm_idx" ON "pages" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "design_nodes_name_trgm_idx" ON "design_nodes" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "components_name_trgm_idx" ON "components" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "components_description_trgm_idx" ON "components" USING gin ("description" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_name_trgm_idx" ON "assets" USING gin ("name" gin_trgm_ops);
