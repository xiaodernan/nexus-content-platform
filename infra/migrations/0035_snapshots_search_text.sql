-- §168/格12：文档正文检索。
-- 为 snapshots 表添加 search_text 文本列 + trigram GIN 索引，
-- 用于在全平台搜索中匹配文档正文内容（标题、页面名、节点文字、visualDna 描述等）。
-- 中文没有空格分词，trigram 子串匹配（ILIKE %q%）是既中文又英文一视同仁的选择，
-- 代价是索引体积稍大、写入略多——搜索是读多写少的路径。

CREATE EXTENSION IF NOT EXISTS pg_trgm;

--> statement-breakpoint
ALTER TABLE "snapshots" ADD COLUMN IF NOT EXISTS "search_text" text;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "snapshots_search_text_trgm_idx" ON "snapshots" USING gin ("search_text" gin_trgm_ops);