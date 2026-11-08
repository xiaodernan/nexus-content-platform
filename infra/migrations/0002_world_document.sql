-- §44 世界文档：worlds.lore 那列是一个从没被读过的 jsonb 杂物袋，九类内容需要一份有契约的文档。
-- 换成 document（存 @nexus/world-model 的 WorldDocument 序列化），读写都过 zod。
-- 开发库里 lore 从来没有数据，所以不做搬迁：直接换列，旧列删掉，不留"看起来还在其实没人读"的列。
ALTER TABLE "worlds" ADD COLUMN IF NOT EXISTS "document" jsonb;
--> statement-breakpoint
ALTER TABLE "worlds" DROP COLUMN IF EXISTS "lore";
