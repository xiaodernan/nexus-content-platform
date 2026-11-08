-- §50 公开可玩：把"发布那一版"的游戏设计钉在 publication 行上（ADR-0009）。
--
-- 为什么不直接读 games 工作稿：那等于让昨天分享出去的链接今天换玩法。
-- §57 对设计文档已经定了规矩——发布锁定快照，公开页读的是那一版；游戏文档走同一条路。
-- 为什么单独一列而不是塞进 snapshots.document：快照的契约就是"设计文档"，
-- 一份 jsonb 有两种解释会让历史 / Compare / 分支 / 恢复每条读路径都要加分支判断。
ALTER TABLE "published_projects" ADD COLUMN IF NOT EXISTS "game_document" jsonb;
--> statement-breakpoint
-- 没有游戏行的项目这列就是 NULL。注意 NULL 的两种来源要能区分开：
-- "这个项目本来就没有游戏设计" 与 "这条发布行早于本次迁移"（老行不回填，见 ADR-0009 的后果一节）。
COMMENT ON COLUMN "public"."published_projects"."game_document" IS
  '发布时从 games.document 原样钉下来的 §54 游戏设计文档；NULL 表示这一版没有可玩内容，不回填历史行';
