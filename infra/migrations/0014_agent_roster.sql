-- §112 要求"每个 Agent 有自己的职责"。名册本身早就有写入方（`scripts/db-seed.mts` 的 AGENTS 表：
-- 13 个 Agent 连同 capabilities / tools / model_class / output 一起播种），缺的是**职责这句话存在哪儿**——
-- 现有列里没有一列是干这个的（capabilities 是权限作用域、output 是产出类型），所以补这一列。
--
-- 这一列不是存档字段：装配 AI 请求时它被读走、随报文发给 provider
-- （真那一路进提示词，DEMO 那一路进活动流），所以"名册改了 → 模型听到的话就跟着变"。
-- 播种那份文案在 `scripts/db-seed.mts`，这里只建列与索引——名册只有一处写，两处写就会漂移。
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "responsibilities" text[] NOT NULL DEFAULT '{}';
--> statement-breakpoint
-- 提及解析按 key 查在册的那几个。key 的唯一索引本来就建在表上（agents_key_key），
-- 这里补的是"停用（enabled=false）的 Agent 不该还能被 @ 到"这一条查询路径，
-- 而不是查全表再在代码里过滤——过滤写在代码里，等于同一件事两处各判一次。
CREATE INDEX IF NOT EXISTS "agents_enabled_key_idx" ON "agents" ("key") WHERE "enabled";
