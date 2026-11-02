-- §40 × §56：发布那一刻钉住的分镜文档。
--
-- 与 game_document 同一口径（迁移 0012 / ADR-0009）：公开页读这一列，不读作者工作稿，
-- 否则昨天分享的链接今天会换镜头。NULL 有两种来源（这一版没有分镜 / 此行早于本迁移），
-- 都不回填——回填等于替历史宣布"当时发布的就是现在这份工作稿"。
ALTER TABLE "published_projects" ADD COLUMN IF NOT EXISTS "storyboard_document" jsonb;
