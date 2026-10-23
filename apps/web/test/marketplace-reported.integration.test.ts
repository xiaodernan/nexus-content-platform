import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql as rawSql } from 'drizzle-orm';
import { createMarketplaceItem, flagSuspiciousActivity, listReportedItemIds } from '../src/server/domain/marketplace';
import { getDb } from '../src/server/db/client';
import { marketplaceReports, users } from '../src/server/db/schema';

/**
 * §123/#161：店面行上的「已举报」是**服务端已知状态**，不是只活在这一个标签页里的回忆。
 *
 * #160 的入口只有本地 state：提交成功留下徽标，刷新之后行又变成「举报」，
 * 买家必须再点一次提交、从 409 才知道自己举报过。页面渲染时按当前这一页的物品集合
 * 读一次「我举报过哪些」，把答案交给行组件。这里钉住读路的四条边界：
 * 只算自己的、只回答传进来的这一页、形状不对不 500、空列表不查库。
 */

let buyer: { id: string };
let seller: { id: string };
let other: { id: string };
let reportedItemId: string;
let otherReportedItemId: string;

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now();
  const rows = await db
    .insert(users)
    .values([
      { displayName: `举报-买家 ${stamp}`, email: `mktrep+buyer+${stamp}@nexus.test` },
      { displayName: `举报-卖家 ${stamp}`, email: `mktrep+seller+${stamp}@nexus.test` },
      { displayName: `举报-路人 ${stamp}`, email: `mktrep+other+${stamp}@nexus.test` },
    ])
    .returning({ id: users.id });
  buyer = { id: rows[0]!.id };
  seller = { id: rows[1]!.id };
  other = { id: rows[2]!.id };

  reportedItemId = (
    await createMarketplaceItem({
      creatorId: seller.id,
      itemType: 'template',
      title: `举报-我报过 ${stamp}`,
      visibility: 'public',
    })
  ).id;
  otherReportedItemId = (
    await createMarketplaceItem({
      creatorId: seller.id,
      itemType: 'template',
      title: `举报-别人报过 ${stamp}`,
      visibility: 'public',
    })
  ).id;

  await flagSuspiciousActivity({ reporterId: buyer.id, itemId: reportedItemId, reason: 'fraud' });
  await flagSuspiciousActivity({ reporterId: other.id, itemId: otherReportedItemId, reason: 'spam' });
});

afterAll(async () => {
  // 用户级联带走 items → reports（两列外键都是 ON DELETE CASCADE）
  await getDb().delete(users).where(inArray(users.id, [buyer.id, seller.id, other.id]));
});

describe('listReportedItemIds：店面自己知道「我举报过什么」', () => {
  it('只回我举报过的那件，别人举报的同一页物品不算在我头上', async () => {
    const ids = await listReportedItemIds(buyer.id, [reportedItemId, otherReportedItemId]);
    expect(ids).toEqual(new Set([reportedItemId]));
  });

  it('只回答传进来的这一页：我举报的物品不在这一页时就不出现', async () => {
    const ids = await listReportedItemIds(buyer.id, [otherReportedItemId]);
    expect(ids.size).toBe(0);
  });

  it('形状不对的 id 不撞 22P02：非 UUID 物品被丢掉，非 UUID 举报人当没有', async () => {
    const mixed = await listReportedItemIds(buyer.id, ['not-a-uuid', reportedItemId, reportedItemId]);
    expect(mixed).toEqual(new Set([reportedItemId]));
    await expect(listReportedItemIds('not-a-uuid', [reportedItemId])).resolves.toEqual(new Set());
  });

  it('并发双发举报：库挡下第二条，照样答"已经举报过"而不是 23505（#172）', async () => {
    const db = getDb();
    const stamp = Date.now();
    const [sellerRow] = await db
      .insert(users)
      .values({ displayName: `举报并发-卖家 ${stamp}`, email: `mktrep+race+seller+${stamp}@nexus.test` })
      .returning({ id: users.id });
    const itemId = (
      await createMarketplaceItem({
        creatorId: sellerRow!.id,
        itemType: 'template',
        title: `举报并发-物品 ${stamp}`,
        visibility: 'public',
      })
    ).id;

    // 真实竞态：另一个会话已经把这条举报插进去、还没提交——"已举报过"预检看不见未提交行，
    // 于是照样往下走。后到者阻塞在唯一索引上，等那个事务落地后才发现插重了。
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let landed!: () => void;
    const inserted = new Promise<void>((resolve) => {
      landed = resolve;
    });
    const other = db.transaction(async (tx) => {
      await tx.insert(marketplaceReports).values({ reporterId: buyer.id, itemId, reason: 'spam' });
      landed();
      await gate;
    });
    await inserted;
    const pending = flagSuspiciousActivity({ reporterId: buyer.id, itemId, reason: 'fraud' });
    // 等到这一发真的把 insert 发了出去（说明已过预检、正阻塞在那个未提交行上）再放开那个事务：
    // 竞态窗口由此钉死，不靠 sleep 碰时序。
    let issued = false;
    for (let i = 0; i < 400 && !issued; i += 1) {
      const rows = await db.execute(
        rawSql`select 1 as hit from pg_stat_activity
               where pid <> pg_backend_pid() and state = 'active'
                 and query like '%insert into "marketplace_reports"%' limit 1`,
      );
      issued = rows.length > 0;
      if (!issued) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(issued, 'flagSuspiciousActivity 没能走到 insert——竞态窗口没造出来').toBe(true);
    release();
    const raced = await pending;
    await other;

    expect(raced.isDuplicate, '并发举报该答"已经举报过"，而不是 23505').toBe(true);
    const rows = await db
      .select({ id: marketplaceReports.id })
      .from(marketplaceReports)
      .where(and(eq(marketplaceReports.reporterId, buyer.id), eq(marketplaceReports.itemId, itemId)));
    expect(rows).toHaveLength(1);
    expect(raced.reportId).toBe(rows[0]!.id);

    await db.delete(users).where(eq(users.id, sellerRow!.id));
  });
});
