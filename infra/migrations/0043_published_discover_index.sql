-- Migration 0043: 发现页 / trending 的排序索引（§61）
--
-- `social.ts` 的 discover 查询是热读路径：
--   WHERE visibility='public' AND moderation <> 'rejected'
--   ORDER BY published_at DESC LIMIT 200
-- `published_projects` 此前只有 `path`(unique) 与 `project_id` 两个索引，这一句只能
-- 全表扫 + 排序。`(visibility, published_at)` 让 Postgres 直接倒序扫描取前 N 行
-- （`ORDER BY published_at DESC` 走反向索引扫描，不需要 DESC 索引）。
--
-- 只影响读计划，不改任何数据；可重入（IF NOT EXISTS）。

CREATE INDEX IF NOT EXISTS "published_visibility_published_idx"
  ON "published_projects" USING btree ("visibility", "published_at");
