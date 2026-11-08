-- §12 主题 mode：文档的 activeMode 与 metadata.modes 以前只活在浏览器会话里，
-- 保存-重载就退回默认值（快照恢复同样带不回来）。库里补两列，读写都收口到 projects。
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "active_mode" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "modes" jsonb;
