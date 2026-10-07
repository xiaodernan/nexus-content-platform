-- §127-128 Marketplace：购买记录表 + 扩展额度种类以支持 marketplace 消费

BEGIN;

-- 购买记录表：一个用户对一件物品只买一次（幂等）
CREATE TABLE IF NOT EXISTS marketplace_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  price_paid INTEGER NOT NULL CHECK (price_paid >= 0),
  purchased_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(item_id, buyer_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS marketplace_purchases_buyer_idx ON marketplace_purchases(buyer_id);
CREATE INDEX IF NOT EXISTS marketplace_purchases_item_idx ON marketplace_purchases(item_id);
CREATE INDEX IF NOT EXISTS marketplace_purchases_purchased_idx ON marketplace_purchases(purchased_at);

-- 扩展 CREDIT_LEDGER_KINDS CHECK 约束，增加 'marketplace' 种类
-- 注意：这是 text + CHECK 的设计（见 schema.ts L44），加一类只需改约束，不用重建 enum
ALTER TABLE credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_kind_check;
ALTER TABLE credit_ledger ADD CONSTRAINT credit_ledger_kind_check
  CHECK (kind IN ('ai', 'image', 'video', 'compute', 'marketplace'));

COMMIT;
