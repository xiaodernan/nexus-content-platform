import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { createMarketplaceItem, flagSuspiciousActivity, listReportedItemIds } from '../src/server/domain/marketplace';
import { getDb } from '../src/server/db/client';
import { users } from '../src/server/db/schema';

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

  it('空列表直接回空集（不查库也不报错）', async () => {
    await expect(listReportedItemIds(buyer.id, [])).resolves.toEqual(new Set());
  });
});
