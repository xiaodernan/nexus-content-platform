-- §127-128 Marketplace：可交易物品表
-- 支持七类物品：组件 / 模板 / 设计系统 / 资产 / 世界 / 游戏 / AI 角色

BEGIN;

CREATE TABLE IF NOT EXISTS marketplace_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('component', 'template', 'design_system', 'asset', 'world', 'game', 'character')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  preview_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  source_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  snapshot_id UUID REFERENCES snapshots(id) ON DELETE SET NULL,
  document_id UUID,
  price_credits INTEGER NOT NULL DEFAULT 0 CHECK (price_credits >= 0),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'free', 'private')),
  download_count INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS marketplace_items_creator_idx ON marketplace_items(creator_id);
CREATE INDEX IF NOT EXISTS marketplace_items_type_idx ON marketplace_items(item_type);
CREATE INDEX IF NOT EXISTS marketplace_items_visibility_idx ON marketplace_items(visibility);
CREATE INDEX IF NOT EXISTS marketplace_items_price_idx ON marketplace_items(price_credits);
CREATE INDEX IF NOT EXISTS marketplace_items_created_idx ON marketplace_items(created_at);

-- 更新触发器：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_marketplace_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marketplace_items_updated_at
  BEFORE UPDATE ON marketplace_items
  FOR EACH ROW
  EXECUTE FUNCTION update_marketplace_items_updated_at();

COMMIT;
