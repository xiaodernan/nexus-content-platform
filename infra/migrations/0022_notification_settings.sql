-- §164 NotificationSettings：用户对每一类通知的开关。
-- 一行 = 一个用户对某一类通知的偏好；没有行就用默认值（全开）。
-- kind 的取值域与 lib/notify-plan.ts 的 NotificationKind 一致。

CREATE TABLE IF NOT EXISTS notification_settings (
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL,
  enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, kind),
  CONSTRAINT notification_settings_kind_check
    CHECK (kind IN (
      'publish', 'moderation', 'like', 'comment', 'follow',
      'remix', 'generation', 'agent', 'approval', 'build'
    ))
);

CREATE INDEX IF NOT EXISTS notification_settings_user_idx
  ON notification_settings (user_id);
