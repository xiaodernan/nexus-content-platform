-- §128 Marketplace：创作者分账记录表 + 扩展额度来源以支持 marketplace 收入

BEGIN;

-- 分账记录表：一次购买只记一次分成（幂等）
CREATE TABLE IF NOT EXISTS marketplace_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES marketplace_purchases(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  split_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(purchase_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS marketplace_splits_creator_idx ON marketplace_splits(creator_id);
CREATE INDEX IF NOT EXISTS marketplace_splits_purchase_idx ON marketplace_splits(purchase_id);

-- 扩展 CREDIT_LEDGER_SOURCES CHECK 约束，增加 'marketplace_sale' 种类
ALTER TABLE credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_source_check;
ALTER TABLE credit_ledger ADD CONSTRAINT credit_ledger_source_check
  CHECK (source IN ('plan_grant', 'generation', 'adjust', 'marketplace_purchase', 'marketplace_sale'));

COMMIT;
