-- §46 角色档案：characters 原来的 profile / visual / voice 三列都是没被读过的 jsonb 杂物袋。
-- 档案现在有一份契约（@nexus/world-model 的 CharacterProfile），合成一列 profile 存，
-- 视觉与声音是档案的字段而不是另两张皮。开发库里这三列都没有数据，所以不搬迁。
ALTER TABLE "characters" DROP COLUMN IF EXISTS "visual";
--> statement-breakpoint
ALTER TABLE "characters" DROP COLUMN IF EXISTS "voice";
