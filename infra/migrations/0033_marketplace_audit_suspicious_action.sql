-- Migration 0033: 市场审计日志允许 suspicious_purchase（§123）
-- 0026 的 CHECK 只列了交易动作；#156 起风控命中的购买会写一行 suspicious_purchase。

ALTER TABLE marketplace_audit_log
  DROP CONSTRAINT IF EXISTS marketplace_audit_log_action_check;
--> statement-breakpoint

ALTER TABLE marketplace_audit_log
  ADD CONSTRAINT marketplace_audit_log_action_check
  CHECK (action IN ('purchase', 'download', 'settle', 'price_change', 'list', 'delist', 'suspicious_purchase'));
