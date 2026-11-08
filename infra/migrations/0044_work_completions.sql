-- §167/§168：**互动作品（非游戏）的 completion**。
--
-- 两件事在这一次迁移里：
-- 1. `published_projects.interactive`：发布那一刻钉住的设计稿里有没有"点击就换页"的可走通流程。
--    分析页靠它把「互动完成」那一格分成"数"与"不适用（—）"：
--    给一份没有互动流程的作品显示 0，会被读成"没人走完"，而事实是"没有可走的东西"（§159）。
-- 2. `work_completions`：一个访客在一个发布版本上走到终点只记一次
--    （unique (publication_id, visitor_key)）⇒ 计的是"**多少人走通过**"，不是"走了几次"。
--
-- 与 `game_completions` 分开存：两个事件来源的判定规则不同（那边是玩到了结局，
-- 这边是走到了没有下一跳的页），将来任一规则要改时不必在混合表里猜每一行来自哪套规则。
-- 与 `publication_visits.completion_pct` 依旧分开：那个说"这一页滚到哪儿"。
--
-- 历史行回填：`interactive` 按快照文档里真实的页面/节点/交互关系算，
-- 断链与自指的交互不算（点下去哪儿也不去）；这次判定与发布新行时用的是同一条语义。
ALTER TABLE "published_projects" ADD COLUMN IF NOT EXISTS "interactive" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

UPDATE "published_projects" p
SET "interactive" = true
FROM "snapshots" s
WHERE s."id" = p."snapshot_id"
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(s."document" -> 'pages', '[]'::jsonb)) AS page
    WHERE EXISTS (
      SELECT 1
      FROM jsonb_each(COALESCE(page -> 'nodes', '{}'::jsonb)) AS node
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(node.value -> 'interactions', '[]'::jsonb)) AS interaction
      WHERE interaction ->> 'trigger' = 'click'
        AND interaction ->> 'action' = 'navigate'
        AND interaction ->> 'target' IS NOT NULL
        AND interaction ->> 'target' <> page ->> 'id'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(s."document" -> 'pages', '[]'::jsonb)) AS target
          WHERE target ->> 'id' = interaction ->> 'target'
        )
    )
  );
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_completions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "publication_id" uuid NOT NULL REFERENCES "published_projects" ("id") ON DELETE CASCADE,
  "visitor_key" text NOT NULL,
  "user_id" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  "page_id" text NOT NULL,
  "suspected_bot" boolean NOT NULL DEFAULT false,
  "completed_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "work_completions_once" ON "work_completions" ("publication_id", "visitor_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_completions_pub_idx" ON "work_completions" ("publication_id");
