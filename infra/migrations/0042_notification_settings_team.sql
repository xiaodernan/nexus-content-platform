-- Migration 0042: 通知偏好允许 team（§133 × §164）
--
-- 0036 的 CHECK 是手写名单（十一类）；#213 之后邀请被兑现会通知项目 owner，
-- 收件箱与通知偏好都多出这一类。不改这条约束，用户一保存这一类的开关就是 23514。
--
-- 注意：只改 `notification_settings`。`notifications` 表的 kind 是纯 text，
-- 取值由 `lib/notify-plan.ts` 的联合类型把住（唯一写入方），不需要 CHECK。

ALTER TABLE notification_settings
  DROP CONSTRAINT IF EXISTS notification_settings_kind_check;
--> statement-breakpoint

ALTER TABLE notification_settings
  ADD CONSTRAINT notification_settings_kind_check
  CHECK (kind IN (
    'publish', 'moderation', 'like', 'comment', 'follow',
    'remix', 'generation', 'agent', 'approval', 'build',
    'marketplace_report', 'team'
  ));
