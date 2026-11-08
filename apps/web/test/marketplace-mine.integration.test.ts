import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import {
  createMarketplaceItem,
  deleteMarketplaceItem,
  listOwnedMarketplaceItems,
} from '../src/server/domain/marketplace';
import { getDb } from '../src/server/db/client';
import { users } from '../src/server/db/schema';

/**
 * §127「我的物品」是所有者视角的读路（#154）。
 *
 * 店面列表只出 public/free，而店面页此前拿店面结果按 creatorId 过滤出「我的物品」——
 * 私密草稿（创建表单的第三个选项，也是 API 与域层的缺省值）在那一块里根本不存在：
 * 创建成功却在任何界面都找不到，「改价格/可见性」与「下架」两个按钮永远碰不到它。
 * 页面自己的文档却写着"私密在那里可见、可删"。本套件钉住新读路的边界：
 * **归属 + 未下架**，不看可见性。
 */

let creator: { id: string; name: string };
let stranger: { id: string };
let publicId: string;
let privateId: string;
let freeId: string;
let delistedId: string;
let strangerPrivateId: string;

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now();
  const name = `我的物品-作者 ${stamp}`;
  const rows = await db
    .insert(users)
    .values([
      { displayName: name, email: `mktmine+creator+${stamp}@nexus.test`, role: 'creator' },
      { displayName: `我的物品-路人 ${stamp}`, email: `mktmine+stranger+${stamp}@nexus.test`, role: 'creator' },
    ])
    .returning({ id: users.id });
  creator = { id: rows[0]!.id, name };
  stranger = { id: rows[1]!.id };

  publicId = (
    await createMarketplaceItem({
      creatorId: creator.id,
      itemType: 'component',
      title: `我的-公开 ${stamp}`,
      visibility: 'public',
      priceCredits: 5,
    })
  ).id;
  // 不传 visibility ⇒ 域层缺省 private（创建表单上那一项也是可选项，不是死配置）
  privateId = (
    await createMarketplaceItem({ creatorId: creator.id, itemType: 'component', title: `我的-私密 ${stamp}` })
  ).id;
  freeId = (
    await createMarketplaceItem({
      creatorId: creator.id,
      itemType: 'template',
      title: `我的-免费 ${stamp}`,
      visibility: 'free',
    })
  ).id;
  delistedId = (
    await createMarketplaceItem({
      creatorId: creator.id,
      itemType: 'component',
      title: `我的-已下架 ${stamp}`,
      visibility: 'public',
    })
  ).id;
  const del = await deleteMarketplaceItem(delistedId, creator.id);
  if (!del.ok) throw new Error(`准备数据失败：下架样本没删成（${del.reason}）`);
  strangerPrivateId = (
    await createMarketplaceItem({ creatorId: stranger.id, itemType: 'component', title: `路人-私密 ${stamp}` })
  ).id;
});

afterAll(async () => {
  // 用户级联带走 sessions → items（外键 ON DELETE CASCADE）
  await getDb().delete(users).where(inArray(users.id, [creator.id, stranger.id]));
});

describe('listOwnedMarketplaceItems：「我的物品」包含私密草稿', () => {
  it('私密草稿出现在自己的列表里（修复前：任何界面都找不到它）', async () => {
    const rows = await listOwnedMarketplaceItems(creator.id);
    const draft = rows.find((row) => row.id === privateId);
    expect(draft, '缺省可见性就是 private，创建完就必须能在「我的物品」里找到').toBeTruthy();
    expect(draft?.visibility).toBe('private');
  });

  it('列表 = 自己的 + 未下架：不含已下架，也不含别人的私密草稿', async () => {
    const ids = (await listOwnedMarketplaceItems(creator.id)).map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining([publicId, privateId, freeId]));
    expect(ids).not.toContain(delistedId);
    expect(ids).not.toContain(strangerPrivateId);
  });

  it('带上界面要用的字段：归属、创作者名、价格、下载计数', async () => {
    const row = (await listOwnedMarketplaceItems(creator.id)).find((r) => r.id === publicId);
    expect(row).toBeTruthy();
    expect(row?.creatorId).toBe(creator.id);
    expect(row?.creatorName).toBe(creator.name);
    expect(row?.priceCredits).toBe(5);
    expect(row?.downloadCount).toBe(0);
  });

  it('类型过滤与店面导航同一个语义', async () => {
    const templates = await listOwnedMarketplaceItems(creator.id, { itemType: 'template' });
    expect(templates.map((row) => row.id)).toContain(freeId);
    expect(templates.map((row) => row.id)).not.toContain(publicId);
  });

  it('非 uuid 的 creatorId 回空表，而不是撞 22P02 变 500', async () => {
    await expect(listOwnedMarketplaceItems('not-a-uuid')).resolves.toEqual([]);
  });
});
