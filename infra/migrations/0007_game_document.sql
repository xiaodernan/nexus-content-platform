-- §54 游戏设计系统接进存储。games 这张表从 0000_init 起就有，但除了创作者主页数过行数
-- （profile.ts：「游戏工作台还没开工，这一栏现在是空的」），entities / scene 两列从没被任何代码读过。
-- 换成一份有契约的 document（@nexus/game-model 的 GameDocument 序列化），读写都过 zod + validateGame。
-- 和 0002 对 worlds.lore 做的事一样：不搬迁、不保留没人读的列。开发库里 games 零行（迁移前已核对），
-- 所以 owner_id 直接以 not null 加；哪个库里真有行，这条语句会失败并说明原因，而不是悄悄留一堆 null。
ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "document" jsonb;
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "summary" text;
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "owner_id" uuid NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "games" ADD CONSTRAINT "games_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "games_owner_idx" ON "games" USING btree ("owner_id");
--> statement-breakpoint
ALTER TABLE "games" DROP COLUMN IF EXISTS "entities";
--> statement-breakpoint
ALTER TABLE "games" DROP COLUMN IF EXISTS "scene";
--> statement-breakpoint
-- game_kind 一并去掉：§51 的七种类型（2D / 2.5D / 3D / Interactive Story / RPG / Puzzle / Visual Novel）
-- 现在在 game-model 里还没有对应字段。留一列没人写、没人读的 '2d' 就是下一轮要删的那种东西；
-- 等类型选择真进了模型，再随模型一起加回来。
ALTER TABLE "games" DROP COLUMN IF EXISTS "game_kind";
--> statement-breakpoint
-- title 与 document.name 是同一件事的两个说法（worlds 也这样：行上的 name/summary 是给列表用的投影）
ALTER TABLE "games" RENAME COLUMN "title" TO "name";
