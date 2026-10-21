import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, like } from 'drizzle-orm';
import { getDb } from '../src/server/db/client';
import { creditLedger, marketplaceItems, marketplacePurchases, marketplaceSplits, users } from '../src/server/db/schema';
import { purchaseMarketplaceItem, settlePurchase } from '../src/server/domain/marketplace';

/**
 * Marketplace 的**钱**那一半（§127-134）：购买扣点与创作者分成。
 *
 * 这一片此前**一条用例都没有**，而它其实一直是坏的——见下面"为什么第一版跑不起来"。
 *
 * ## 这一片量的是不变量，不是实现
 * `purchaseMarketplaceItem` 与 `settlePurchase` 写钱的顺序是同一种形状：
 *   1. SELECT 查重（"买过没有 / 结过没有"）
 *   2. INSERT 写**钱**那一行（`credit_ledger` 的负 / 正 delta）
 *   3. INSERT 写**被唯一索引保护的那一行**（`marketplace_purchases` / `marketplace_splits`）
 * 两步之间**没有事务**。并发时两个请求都能过第 1 步，于是各写一行钱，
 * 第 3 步才被唯一索引拦下——拦下的是记录行，**不是已经动过的钱**。
 * 所以这里要证的是"一笔购买在流水里只能有一行扣点 / 只能分一次账"，
 * 而唯一索引保证的只是"记录行唯一"，两者不是同一件事。
 *
 * ## 为什么第一版跑不起来（值得记）
 * 第一版三条用例全红在 `credit_ledger` 的三个 CHECK 上（kind / source / source_shape），
 * 那**不是用例写错了，是买/分成路径从 0024/0025 落地起就一行都写不进去**：
 * 那两条迁移想"换约束"却写错了旧约束的名字（`..._check` 后缀），`IF EXISTS` 静默没删，
 * 于是旧约束仍然生效、把 `marketplace` 那两个取值挡死。修法是 0029/0030/0031 三条迁移。
 *
 * ## 为什么这里不清理账本与用户
 * `credit_ledger` 是**只追加**的（库里有触发器挡 DELETE），而 `user_id` 又是 `onDelete: cascade`——
 * 所以"造了一个有流水的人"之后就删不掉他了（删他会级联到账本，同样被触发器挡）。
 * 这是账本该有的样子，不是测试的疏漏：**每个用例用自己的买家**，断言按 userId 划范围，
 * 数据留在库里。物品那几行不是只追加的，正常清掉。
 */

const stamp = Date.now().toString(36);
let creatorId: string;
let itemId: string;
const buyers: string[] = [];

const PRICE = 30;
const SHARE = 0.7;

const insertUser = async (handle: string): Promise<string> => {
  const rows = await getDb()
    .insert(users)
    .values({ displayName: handle, email: `${handle}@nexus.test`, handle })
    .returning({ id: users.id });
  return rows[0]!.id;
};

/** 每个用例一个买家：账本删不掉，所以靠"换个人"把范围划开，而不是靠删行 */
const freshBuyer = async (tag: string): Promise<string> => {
  const id = await insertUser(`ms${stamp}${tag}`);
  buyers.push(id);
  return id;
};

const charged = async (buyerId: string): Promise<{ rows: number; total: number }> => {
  const list = await getDb()
    .select({ delta: creditLedger.delta })
    .from(creditLedger)
    .where(and(eq(creditLedger.userId, buyerId), eq(creditLedger.source, 'marketplace_purchase')));
  return { rows: list.length, total: list.reduce((sum, r) => sum + r.delta, 0) };
};

const paidOut = async (): Promise<{ rows: number; total: number }> => {
  const list = await getDb()
    .select({ delta: creditLedger.delta })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.userId, creatorId),
        eq(creditLedger.source, 'marketplace_sale'),
        like(creditLedger.reason, `%${itemId}%`),
      ),
    );
  return { rows: list.length, total: list.reduce((sum, r) => sum + r.delta, 0) };
};

/** 一件只属于这一条用例的物品（价格固定），物品行不是只追加的，跑完能清 */
const freshItem = async (): Promise<string> => {
  const rows = await getDb()
    .insert(marketplaceItems)
    .values({
      creatorId,
      itemType: 'component',
      title: `并发用例的样本 ${stamp}`,
      description: '',
      visibility: 'public',
      priceCredits: PRICE,
    })
    .returning({ id: marketplaceItems.id });
  return rows[0]!.id;
};

beforeAll(async () => {
  creatorId = await insertUser(`ms${stamp}c`);
});

afterAll(async () => {
  if (!creatorId) return;
  // 只清物品：它的外键会带走购买与分成行。账本与用户**故意留着**（只追加 + 级联，见文件头）
  await getDb().delete(marketplaceItems).where(eq(marketplaceItems.creatorId, creatorId));
  await getDb().delete(users).where(eq(users.id, creatorId));
});

describe('买一件东西：钱只能扣一次', () => {
  it('两次串行购买：第二次被"已经买过"挡住，流水只有一行', async () => {
    const buyer = await freshBuyer('s1');
    const item = await freshItem();

    const first = await purchaseMarketplaceItem({ itemId: item, buyerId: buyer });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.pricePaid).toBe(PRICE);
    await expect(purchaseMarketplaceItem({ itemId: item, buyerId: buyer })).resolves.toEqual({
      ok: false,
      reason: 'already_purchased',
    });

    const { rows, total } = await charged(buyer);
    expect(rows, '串行这一路应该只有一行扣点').toBe(1);
    expect(total).toBe(-PRICE);
  });

  it('**并发**买同一件：唯一索引挡得住记录行，钱挡不住——这正是要证的', async () => {
    const buyer = await freshBuyer('s2');
    const item = await freshItem();

    const results = await Promise.allSettled([
      purchaseMarketplaceItem({ itemId: item, buyerId: buyer }),
      purchaseMarketplaceItem({ itemId: item, buyerId: buyer }),
    ]);

    // 记录行那一层是对的：恰好一次成功
    const debug = results.map((r) =>
      r.status === 'fulfilled'
        ? r.value.ok
          ? 'ok:true'
          : `ok:false:${r.value.reason}`
        : `rejected:${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
    );
    expect(results.every((r) => r.status === 'fulfilled'), debug.join(' | ')).toBe(true);
    const outcomes = results.map((r) => (r.status === 'fulfilled' ? r.value : null));
    expect(outcomes.filter((o) => o?.ok === true)).toHaveLength(1);
    expect(outcomes.filter((o) => o?.ok === false && o.reason === 'already_purchased')).toHaveLength(1);
    const purchases = await getDb()
      .select({ id: marketplacePurchases.id })
      .from(marketplacePurchases)
      .where(eq(marketplacePurchases.itemId, item));
    expect(purchases, '购买记录行应该只有一条').toHaveLength(1);

    // 钱这一层
    const { rows, total } = await charged(buyer);
    expect(rows, `一笔购买却写了 ${rows} 行扣点：钱在事务外，唯一索引拦不住它`).toBe(1);
    expect(total).toBe(-PRICE);
  });
});

describe('创作者分成：一笔购买只能分一次', () => {
  it('**并发**结算同一笔：流水里只能有一行正 delta', async () => {
    const buyer = await freshBuyer('s3');
    itemId = await freshItem();
    const purchase = await purchaseMarketplaceItem({ itemId, buyerId: buyer });
    expect(purchase.ok).toBe(true);
    if (!purchase.ok) return;

    const results = await Promise.allSettled([
      settlePurchase({ purchaseId: purchase.purchaseId }),
      settlePurchase({ purchaseId: purchase.purchaseId }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    const splits = await getDb()
      .select({ id: marketplaceSplits.id })
      .from(marketplaceSplits)
      .where(eq(marketplaceSplits.purchaseId, purchase.purchaseId));
    expect(splits, '分成记录行应该只有一条').toHaveLength(1);

    const { rows, total } = await paidOut();
    expect(rows, `一笔购买却分了 ${rows} 次账：钱在事务外，唯一索引拦不住它`).toBe(1);
    expect(total).toBe(Math.floor(PRICE * SHARE));
  });
});
