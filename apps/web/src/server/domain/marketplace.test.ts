import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '../db/client';
import { users, projects, marketplaceItems } from '../db/schema';
import { eq } from 'drizzle-orm';
import {
  listMarketplaceItems,
  createMarketplaceItem,
  updateMarketplaceItem,
  deleteMarketplaceItem,
  incrementDownloadCount,
  getMarketplaceItem,
} from './marketplace';

describe('marketplace domain', () => {
  let testUser: typeof users.$inferSelect;

  beforeEach(async () => {
    const db = getDb();

    // Clean up marketplace items
    await db.delete(marketplaceItems);

    // Create test user
    const timestamp = Date.now();
    const [user] = await db
      .insert(users)
      .values({
        displayName: 'Test Marketplace User',
        handle: `test-market-${timestamp}`,
        email: `market-${timestamp}@test.com`,
        passwordHash: 'dummy',
      })
      .returning();
    testUser = user!;
  });

  describe('createMarketplaceItem', () => {
    it('creates a new marketplace item', async () => {
      const item = await createMarketplaceItem({
        creatorId: testUser.id,
        itemType: 'component',
        title: 'Test Component',
        description: 'A test component',
        tags: ['ui', 'button'],
        priceCredits: 100,
        visibility: 'public',
      });

      expect(item).toBeDefined();
      expect(item.title).toBe('Test Component');
      expect(item.itemType).toBe('component');
      expect(item.creatorId).toBe(testUser.id);
      expect(item.priceCredits).toBe(100);
    });

    it('rejects invalid preview asset', async () => {
      // 当预览素材不存在时，数据库查询会返回空结果
      await expect(
        createMarketplaceItem({
          creatorId: testUser.id,
          itemType: 'template',
          title: 'Test Template',
          previewAssetId: 'non-existent-asset-id',
        }),
      ).rejects.toThrow();
    });

    it('rejects if source project does not belong to creator', async () => {
      const db = getDb();
      const otherTimestamp = Date.now() + 1;
      const [otherUser] = await db
        .insert(users)
        .values({
          displayName: 'Other User',
          handle: `other-${otherTimestamp}`,
          email: `other-${otherTimestamp}@test.com`,
          passwordHash: 'dummy',
        })
        .returning();

      const [otherProject] = await db
        .insert(projects)
        .values({
          name: 'Other Project',
          slug: `other-project-${otherTimestamp}`,
          ownerId: otherUser!.id,
        })
        .returning();

      await expect(
        createMarketplaceItem({
          creatorId: testUser.id,
          itemType: 'world',
          title: 'Test World',
          sourceProjectId: otherProject!.id,
        }),
      ).rejects.toThrow('Only project owner can publish items from it');
    });
  });

  describe('listMarketplaceItems', () => {
    beforeEach(async () => {
      // Create some test items
      await createMarketplaceItem({
        creatorId: testUser.id,
        itemType: 'component',
        title: 'Public Component',
        visibility: 'public',
        priceCredits: 50,
      });

      await createMarketplaceItem({
        creatorId: testUser.id,
        itemType: 'template',
        title: 'Private Template',
        visibility: 'private',
      });

      await createMarketplaceItem({
        creatorId: testUser.id,
        itemType: 'asset',
        title: 'Free Asset',
        visibility: 'free',
        priceCredits: 0,
      });
    });

    it('lists only public items by default', async () => {
      const items = await listMarketplaceItems({});
      expect(items).toHaveLength(2); // public + free, but not private
      expect(items.every((item) => item.visibility === 'public' || item.visibility === 'free')).toBe(true);
    });

    it('filters by item type', async () => {
      const items = await listMarketplaceItems({ itemType: 'component' });
      expect(items).toHaveLength(1);
      expect(items[0]!.itemType).toBe('component');
    });

    it('filters by price range', async () => {
      const items = await listMarketplaceItems({ minPrice: 0, maxPrice: 60 });
      expect(items).toHaveLength(2); // public (50) + free (0)
    });

    it('searches by title', async () => {
      const items = await listMarketplaceItems({ search: 'Component' });
      expect(items).toHaveLength(1);
      expect(items[0]!.title).toContain('Component');
    });
  });

  describe('updateMarketplaceItem', () => {
    let itemId: string;

    beforeEach(async () => {
      const item = await createMarketplaceItem({
        creatorId: testUser.id,
        itemType: 'game',
        title: 'Original Title',
        visibility: 'private',
      });
      itemId = item.id;
    });

    it('updates item metadata', async () => {
      const updated = await updateMarketplaceItem(itemId, testUser.id, {
        title: 'New Title',
        description: 'New description',
        priceCredits: 200,
      });

      expect(updated.title).toBe('New Title');
      expect(updated.description).toBe('New description');
      expect(updated.priceCredits).toBe(200);
    });

    it('rejects non-creator updates', async () => {
      const db = getDb();
      const otherTimestamp = Date.now() + 2;
      const [otherUser] = await db
        .insert(users)
        .values({
          displayName: 'Other User',
          handle: `other-update-${otherTimestamp}`,
          email: `other-update-${otherTimestamp}@test.com`,
          passwordHash: 'dummy',
        })
        .returning();

      await expect(updateMarketplaceItem(itemId, otherUser!.id, { title: 'Hacked' })).rejects.toThrow(
        'Only creator can update this item',
      );
    });

    it('rejects updates to deleted items', async () => {
      await deleteMarketplaceItem(itemId, testUser.id);

      await expect(updateMarketplaceItem(itemId, testUser.id, { title: 'Still trying' })).rejects.toThrow(
        'Item not found or deleted',
      );
    });
  });

  describe('deleteMarketplaceItem', () => {
    let itemId: string;

    beforeEach(async () => {
      const item = await createMarketplaceItem({
        creatorId: testUser.id,
        itemType: 'character',
        title: 'To Delete',
        visibility: 'public',
      });
      itemId = item.id;
    });

    it('soft deletes an item', async () => {
      await deleteMarketplaceItem(itemId, testUser.id);

      const item = await getMarketplaceItem(itemId);
      expect(item).toBeNull();

      // Verify it's soft deleted, not hard deleted
      const db = getDb();
      const [row] = await db
        .select({ deletedAt: marketplaceItems.deletedAt })
        .from(marketplaceItems)
        .where(eq(marketplaceItems.id, itemId))
        .limit(1);

      expect(row!.deletedAt).not.toBeNull();
    });

    it('rejects non-creator deletion', async () => {
      const db = getDb();
      const otherTimestamp = Date.now() + 3;
      const [otherUser] = await db
        .insert(users)
        .values({
          displayName: 'Other User',
          handle: `other-delete-${otherTimestamp}`,
          email: `other-delete-${otherTimestamp}@test.com`,
          passwordHash: 'dummy',
        })
        .returning();

      await expect(deleteMarketplaceItem(itemId, otherUser!.id)).rejects.toThrow(
        'Only creator can delete this item',
      );
    });
  });

  describe('incrementDownloadCount', () => {
    let itemId: string;

    beforeEach(async () => {
      const item = await createMarketplaceItem({
        creatorId: testUser.id,
        itemType: 'design_system',
        title: 'Downloadable Item',
        visibility: 'public',
      });
      itemId = item.id;
    });

    it('increments download count', async () => {
      const count1 = await incrementDownloadCount(itemId);
      expect(count1).toBe(1);

      const count2 = await incrementDownloadCount(itemId);
      expect(count2).toBe(2);

      const item = await getMarketplaceItem(itemId);
      expect(item?.downloadCount).toBe(2);
    });

    it('does not increment for deleted items', async () => {
      await deleteMarketplaceItem(itemId, testUser.id);

      const count = await incrementDownloadCount(itemId);
      expect(count).toBe(0);
    });
  });
});
