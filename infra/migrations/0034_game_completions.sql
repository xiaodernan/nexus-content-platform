-- §168：游戏侧的"通关"事件（此前只有页面的滚动完成度，没有游戏本身通关的记录）。
--
-- 粒度：**一个访客在一个发布版本上通关一次**
-- （unique (publication_id, visitor_key)）⇒ 计的是"**通关过多少人**"，不是"通关了几次"。
-- 界面上那一句必须跟着这个粒度走（§159）：把"一个人玩了五遍"说成"通关了五次"，
-- 那是在拿一个数冒充另一个数。
--
-- 为什么要自己一张表，而不是挂在 publication_visits 上：
-- publication_visits.completion_pct 是**滚动比例**（这一页滚到哪儿），
-- 而"通关"是**另一回事**（玩到了结局）⇒ 混进同一行会把两个口径搅在一起：
-- "完成度 100%"里混着"通关"，那一句就谁也不说了。
--
-- 爬虫/自动化另计（与 publication_visits 同一条纪律）：判定是纯函数 classifyVisit，
-- 这一列只存**当时的结论**（历史行不补判）；可疑的照收，但不进真人那一格。
CREATE TABLE IF NOT EXISTS "game_completions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "publication_id" uuid NOT NULL REFERENCES "published_projects" ("id") ON DELETE CASCADE,
  "visitor_key" text NOT NULL,
  "user_id" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  "suspected_bot" boolean NOT NULL DEFAULT false,
  "completed_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "game_completions_once" ON "game_completions" ("publication_id", "visitor_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_completions_pub_idx" ON "game_completions" ("publication_id");
