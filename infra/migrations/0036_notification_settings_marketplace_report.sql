-- Migration 0036: 通知偏好允许 marketplace_report（§123 × §164）
-- 0022 的 CHECK 是手写名单，只列了十类；#163 起举报工单进入终态会通知举报人，
-- 收件箱与通知偏好都多出这一类。不改这条约束，用户一保存这一类的开关就是 23514。

ALTER TABLE notification_settings
  DROP CONSTRAINT IF EXISTS notification_settings_kind_check;
--> statement-breakpoint

ALTER TABLE notification_settings
  ADD CONSTRAINT notification_settings_kind_check
  CHECK (kind IN (
    'publish', 'moderation', 'like', 'comment', 'follow',
    'remix', 'generation', 'agent', 'approval', 'build',
    'marketplace_report'
  ));
