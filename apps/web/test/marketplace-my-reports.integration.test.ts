import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import {
  createMarketplaceItem,
  deleteMarketplaceItem,
  flagSuspiciousActivity,
  listReportsByReporter,
  updateMarketplaceItem,
  updateReportStatus,
} from '../src/server/domain/marketplace';
import { getDb } from '../src/server/db/client';
import { marketplaceReports, users } from '../src/server/db/schema';

/**
 * §123/#162 举报人侧的「我的举报」读路。
 *
 * 举报交出去之后，举报人此前只能看到那一句"已提交"；工单后来是成立、驳回还是仍待受理，
 * 没有任何页面回答。这里钉住读路的边界：只回自己的、物品标题与**此刻**状态从 join 现读、
 * 审核员的内部笔记一个字都不出这一页（库里确实有，才证明是读路刻意没选它）。
 */

let reporter: { id: string };
let seller: { id: string };
let other: { id: string };
let admin: { id: string };
let itemKeptId: string;
let itemPrivateId: string;
let itemDeletedId: string;
let reportKeptId: string;
let reportPrivateId: string;
let reportDeletedId: string;
let otherReportId: string;

const ADMIN_NOTE = '审核员内部笔记：已核对付款记录';

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now();
  const rows = await db
    .insert(users)
    .values([
      { displayName: `我的举报-举报人 ${stamp}`, email: `myrep+reporter+${stamp}@nexus.test` },
      { displayName: `我的举报-卖家 ${stamp}`, email: `myrep+seller+${stamp}@nexus.test` },
      { displayName: `我的举报-路人 ${stamp}`, email: `myrep+other+${stamp}@nexus.test` },
      { displayName: `我的举报-审核员 ${stamp}`, email: `myrep+admin+${stamp}@nexus.test` },
    ])
    .returning({ id: users.id });
  reporter = { id: rows[0]!.id };
  seller = { id: rows[1]!.id };
  other = { id: rows[2]!.id };
  admin = { id: rows[3]!.id };

  itemKeptId = (
    await createMarketplaceItem({
      creatorId: seller.id,
      itemType: 'template',
      title: `我的举报-仍在售 ${stamp}`,
      visibility: 'public',
    })
  ).id;
  itemPrivateId = (
    await createMarketplaceItem({
      creatorId: seller.id,
      itemType: 'template',
      title: `我的举报-后来转私密 ${stamp}`,
      visibility: 'public',
    })
  ).id;
  itemDeletedId = (
    await createMarketplaceItem({
      creatorId: seller.id,
      itemType: 'component',
      title: `我的举报-后来下架 ${stamp}`,
      visibility: 'public',
    })
  ).id;

  reportKeptId = (
    await flagSuspiciousActivity({
      reporterId: reporter.id,
      itemId: itemKeptId,
      reason: 'fraud',
      description: '我写的说明',
    })
  ).reportId;
  reportPrivateId = (await flagSuspiciousActivity({ reporterId: reporter.id, itemId: itemPrivateId, reason: 'spam' })).reportId;
  reportDeletedId = (
    await flagSuspiciousActivity({ reporterId: reporter.id, itemId: itemDeletedId, reason: 'other' })
  ).reportId;
  otherReportId = (
    await flagSuspiciousActivity({ reporterId: other.id, itemId: itemKeptId, reason: 'copyright' })
  ).reportId;

  // 处置一条工单并写下内部笔记；另外两件物品在举报之后换了状态
  const resolved = await updateReportStatus({
    reportId: reportKeptId,
    adminId: admin.id,
    status: 'resolved',
    adminNotes: ADMIN_NOTE,
    ip: null,
  });
  expect(resolved.ok).toBe(true);
  await updateMarketplaceItem(itemPrivateId, seller.id, { visibility: 'private' });
  await deleteMarketplaceItem(itemDeletedId, seller.id);
});

afterAll(async () => {
  // 用户级联带走 items → reports（两列外键都是 ON DELETE CASCADE）
  await getDb().delete(users).where(inArray(users.id, [reporter.id, seller.id, other.id, admin.id]));
});

describe('listReportsByReporter：举报人自己的工单', () => {
  it('只回我自己提交的三条，按提交时间倒序', async () => {
    const rows = await listReportsByReporter(reporter.id);
    expect(rows.map((row) => row.id)).toEqual([reportDeletedId, reportPrivateId, reportKeptId]);
    expect(rows.some((row) => row.id === otherReportId)).toBe(false);
  });

  it('别人的举报对别人可见、对我不串门', async () => {
    const rows = await listReportsByReporter(other.id);
    expect(rows.map((row) => row.id)).toEqual([otherReportId]);
    expect(rows[0]?.reason).toBe('copyright');
  });

  it('物品标题与此刻状态从 join 现读：转私密、软删都跟得上', async () => {
    const rows = await listReportsByReporter(reporter.id);
    const byId = new Map(rows.map((row) => [row.id, row]));

    const kept = byId.get(reportKeptId);
    expect(kept?.itemVisibility).toBe('public');
    expect(kept?.itemDeletedAt).toBeNull();
    expect(kept?.itemTitle).toContain('仍在售');

    const priv = byId.get(reportPrivateId);
    expect(priv?.itemVisibility).toBe('private');
    expect(priv?.itemDeletedAt).toBeNull();

    const deleted = byId.get(reportDeletedId);
    expect(deleted?.itemDeletedAt).toBeInstanceOf(Date);
  });

  it('审阅结论可读，内部笔记不出现——库里确实存着它', async () => {
    const rows = await listReportsByReporter(reporter.id);
    const kept = rows.find((row) => row.id === reportKeptId);
    expect(kept?.status).toBe('resolved');
    expect(kept?.resolvedAt).toBeInstanceOf(Date);
    expect(kept?.description).toBe('我写的说明');
    expect(Object.keys(kept ?? {})).not.toContain('adminNotes');

    const [stored] = await getDb()
      .select({ adminNotes: marketplaceReports.adminNotes })
      .from(marketplaceReports)
      .where(eq(marketplaceReports.id, reportKeptId));
    expect(stored?.adminNotes).toBe(ADMIN_NOTE);
  });

  it('limit 只截断条数，不改变顺序；形状不对的举报人回空表', async () => {
    const rows = await listReportsByReporter(reporter.id, 2);
    expect(rows.map((row) => row.id)).toEqual([reportDeletedId, reportPrivateId]);
    await expect(listReportsByReporter('not-a-uuid')).resolves.toEqual([]);
  });
});
