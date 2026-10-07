-- Migration 0026: marketplace_audit_log + marketplace_reports
-- Purpose: 为市场交易添加审计追踪与可疑行为检测能力（§123）

CREATE TABLE IF NOT EXISTS marketplace_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 操作主体
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 操作类型：purchase / download / settle / price_change / list / delist
  action TEXT NOT NULL CHECK (action IN ('purchase', 'download', 'settle', 'price_change', 'list', 'delist')),
  -- 关联的物品 ID
  item_id UUID NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
  -- 额外元数据（JSONB，记录价格、数量、IP 等上下文）
  metadata JSONB DEFAULT '{}'::jsonb,
  -- 发生时间
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  -- 客户端 IP（用于风控）
  ip_address TEXT
);

-- 索引：按物品查所有操作、按用户查所有操作、按时间范围查
CREATE INDEX marketplace_audit_item_idx ON marketplace_audit_log(item_id);
CREATE INDEX marketplace_audit_actor_idx ON marketplace_audit_log(actor_id);
CREATE INDEX marketplace_audit_occurred_idx ON marketplace_audit_log(occurred_at);

-- 举报表：用户可举报可疑交易或物品
CREATE TABLE IF NOT EXISTS marketplace_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 举报人
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 被举报的物品
  item_id UUID NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
  -- 举报原因：fraud / spam / copyright / inappropriate / other
  reason TEXT NOT NULL CHECK (reason IN ('fraud', 'spam', 'copyright', 'inappropriate', 'other')),
  -- 详细描述
  description TEXT,
  -- 状态：pending / reviewing / resolved / dismissed
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  -- 管理员备注
  admin_notes TEXT,
  -- 创建时间
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  -- 处理时间
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- 索引：按状态查待处理举报、按物品查历史举报
CREATE INDEX marketplace_reports_status_idx ON marketplace_reports(status);
CREATE INDEX marketplace_reports_item_idx ON marketplace_reports(item_id);
CREATE INDEX marketplace_reports_created_idx ON marketplace_reports(created_at);

-- 唯一约束：同一用户对同一物品只能举报一次（避免重复举报）
CREATE UNIQUE INDEX marketplace_reports_unique_reporter_item ON marketplace_reports(reporter_id, item_id);
