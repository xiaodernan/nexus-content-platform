-- Migration 0037: games / worlds “一个项目一份”补上建库约束（#168）
-- 这两张表的“一个项目一份”一直只是应用层 read-then-insert 的约定：两个并发创建
-- （双击「接受草稿」、两个标签页各存一次）都查不到已有行 → 都 insert → 库里两份。
-- storyboards 的 project_id 一早就有 .unique()（schema.ts），games / worlds 漏了。
-- 先按 updated_at 收敛历史上可能并发双发插出来的重复行（每个项目留最新的一条，
-- updated_at 相同时用 id 断律），再加约束。

DELETE FROM games g
WHERE g.project_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM games n
    WHERE n.project_id = g.project_id
      AND (n.updated_at > g.updated_at OR (n.updated_at = g.updated_at AND n.id > g.id))
  );
--> statement-breakpoint

DELETE FROM worlds w
WHERE w.project_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM worlds n
    WHERE n.project_id = w.project_id
      AND (n.updated_at > w.updated_at OR (n.updated_at = w.updated_at AND n.id > w.id))
  );
--> statement-breakpoint

ALTER TABLE games ADD CONSTRAINT games_project_id_unique UNIQUE (project_id);
--> statement-breakpoint

ALTER TABLE worlds ADD CONSTRAINT worlds_project_id_unique UNIQUE (project_id);
