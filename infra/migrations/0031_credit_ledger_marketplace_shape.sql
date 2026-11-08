-- §134 / §127：给 `credit_ledger_source_shape` 补上 marketplace 那两个来源的分支。
--
-- 这一条是 0029 / 0030 的第三关，也是**最后一道**挡着买/分成路径的闸。
-- 与前两条不同，这一条**不是名字写错**——0016 建它的时候 marketplace 还不存在，
-- 它的形状是"按 source 逐个列举"：
--
--     plan_grant  → period 非空 且 delta > 0
--     generation  → delta < 0
--     adjust      → 不约束
--
-- 0025 只改了**成员表**（`credit_ledger_source_check`），没动**形状表**，
-- 于是 'marketplace_purchase' / 'marketplace_sale' 落进这个 CHECK 时三个分支全不匹配 → 违反。
--
-- 补的两支沿用同一条纪律（钱的方向由 source 决定，而不是靠调用方自觉）：
--   · 买 → delta < 0（买家扣点）
--   · 分账 → delta > 0（创作者收入）
-- 特意**不**要求 period：0024/0025 那两处写入都带了 period，但"必须带"不是这一格要管的事，
-- 加了就等于顺手给未来改调用方的人埋一条他没读过的约束。
--
-- 三关都过完之后才谈得上 0024/0025 想做的事。**这三条是一组，分开修任何一条都不够**，
-- 所以守卫测试（`apps/web/test/credit-ledger-kind.integration.test.ts`）是一次把
-- credit_ledger 上**所有** CHECK 与常量对齐，而不是只盯 kind。
ALTER TABLE "credit_ledger" DROP CONSTRAINT IF EXISTS "credit_ledger_source_shape";
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_source_shape" CHECK (
  ("source" = 'plan_grant' AND "period" IS NOT NULL AND "delta" > 0)
  OR ("source" = 'generation' AND "delta" < 0)
  OR ("source" = 'adjust')
  OR ("source" = 'marketplace_purchase' AND "delta" < 0)
  OR ("source" = 'marketplace_sale' AND "delta" > 0)
);
