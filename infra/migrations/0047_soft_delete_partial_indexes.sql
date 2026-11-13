-- Migration 0047: 软删除热读路径的「局部索引」补全（§DB-perf, 2026-11-11）
--
-- `ProjectRepository` 的四个查询都带 `deleted_at IS NULL`（软删除）：
--   findByOwnerIdAndDeletedAtIsNull                -> (owner_id)
--   findByOwnerIdAndSlugAndDeletedAtIsNull         -> (owner_id, slug)  [已有唯一索引覆盖]
--   findByVisibilityAndDeletedAtIsNull             -> (visibility)      [0000 已有局部索引]
--   findByForkOfAndDeletedAtIsNull                 -> (fork_of)
--
-- 0000_init 已经为 owner_id / fork_of 建了「全量」索引，但软删除查询永远只看「未删除」那一半。
-- 全量索引把已删除行也留在页里，缓存命中的是永远不会被读到的尸体行——在 2.5GB 空闲内存的机器上，
-- 这是实实在在的物理浪费。把这两列补成「WHERE deleted_at IS NULL」的局部索引，索引更小、更热、
-- 更贴合实际 WHERE；规划器对软删除查询也会优先选它（比全量索引少扫一半以上的叶子）。
--
-- 不删除旧的全量索引：admin / 审计类查询需要扫含已删除行的全量视图，它们仍走全量索引。
-- 可重入（IF NOT EXISTS），只改读计划，不碰任何数据。

CREATE INDEX IF NOT EXISTS "projects_owner_live_idx"
  ON "projects" USING btree ("owner_id") WHERE "projects"."deleted_at" is null;

CREATE INDEX IF NOT EXISTS "projects_fork_of_live_idx"
  ON "projects" USING btree ("fork_of") WHERE "projects"."deleted_at" is null;
