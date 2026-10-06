import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { marketplaceItems, assets, projects, snapshots, users } from '../db/schema';
import type { MarketplaceItemType, MarketplaceVisibility } from '../db/schema';

/**
 * §127-128 Marketplace 系统：组件 / 模板 / 设计系统 / 资产 / 世界 / 游戏 / AI 角色的交易与分享。
 *
 * 三条塑造了这里写法的事实：
 * - **创作者经济**（§128）：用户可以出售自己的作品，价格以 Credits 计；下架后收藏者仍能看到但点不开。
 * - **内容安全**（§129）：标题、描述、标签过发布机检同一份红线词表，命中就不让上架。
 * - **软删除纪律**：下架不等于物理删除——`deletedAt` 标记后列表过滤，但已收藏/购买的记录仍能追溯原因。
 */

export interface CreateMarketplaceItemInput {
  creatorId: string;
  itemType: MarketplaceItemType;
  title: string;
  description?: string;
  tags?: string[];
  previewAssetId?: string;
  sourceProjectId?: string;
  snapshotId?: string;
  documentId?: string;
  priceCredits?: number;
  visibility?: MarketplaceVisibility;
}

export interface UpdateMarketplaceItemInput {
  title?: string;
  description?: string;
  tags?: string[];
  previewAssetId?: string;
  priceCredits?: number;
  visibility?: MarketplaceVisibility;
}

export interface MarketplaceItemFilter {
  itemType?: MarketplaceItemType;
  visibility?: MarketplaceVisibility;
  minPrice?: number;
  maxPrice?: number;
  creatorId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listMarketplaceItems(filter: MarketplaceItemFilter) {
  const db = getDb();
  const limit = filter.limit ?? 20;
  const offset = filter.offset ?? 0;

  // 公开物品和免费物品都应该在列表中显示
  const conditions = [
    sql`${marketplaceItems.visibility} IN ('public', 'free')`,
    isNull(marketplaceItems.deletedAt),
  ];

  if (filter.itemType) {
    conditions.push(eq(marketplaceItems.itemType, filter.itemType));
  }

  if (filter.minPrice !== undefined) {
    conditions.push(gte(marketplaceItems.priceCredits, filter.minPrice));
  }

  if (filter.maxPrice !== undefined) {
    conditions.push(sql`${marketplaceItems.priceCredits} <= ${filter.maxPrice}`);
  }

  if (filter.creatorId) {
    conditions.push(eq(marketplaceItems.creatorId, filter.creatorId));
  }

  if (filter.search) {
    // 简单的前缀匹配：标题或描述包含搜索词
    conditions.push(
      sql`(${marketplaceItems.title} ILIKE ${'%' + filter.search + '%'} OR ${marketplaceItems.description} ILIKE ${'%' + filter.search + '%'})`,
    );
  }

  const items = await db
    .select({
      id: marketplaceItems.id,
      creatorId: marketplaceItems.creatorId,
      itemType: marketplaceItems.itemType,
      title: marketplaceItems.title,
      description: marketplaceItems.description,
      tags: marketplaceItems.tags,
      previewAssetId: marketplaceItems.previewAssetId,
      priceCredits: marketplaceItems.priceCredits,
      visibility: marketplaceItems.visibility,
      downloadCount: marketplaceItems.downloadCount,
      createdAt: marketplaceItems.createdAt,
      creatorName: users.displayName,
      creatorHandle: users.handle,
      creatorAvatarUrl: users.avatarUrl,
    })
    .from(marketplaceItems)
    .leftJoin(users, eq(marketplaceItems.creatorId, users.id))
    .where(and(...conditions))
    .orderBy(desc(marketplaceItems.createdAt))
    .limit(limit)
    .offset(offset);

  return items;
}

export async function getMarketplaceItem(itemId: string) {
  const db = getDb();

  const [item] = await db
    .select({
      id: marketplaceItems.id,
      creatorId: marketplaceItems.creatorId,
      itemType: marketplaceItems.itemType,
      title: marketplaceItems.title,
      description: marketplaceItems.description,
      tags: marketplaceItems.tags,
      previewAssetId: marketplaceItems.previewAssetId,
      sourceProjectId: marketplaceItems.sourceProjectId,
      snapshotId: marketplaceItems.snapshotId,
      documentId: marketplaceItems.documentId,
      priceCredits: marketplaceItems.priceCredits,
      visibility: marketplaceItems.visibility,
      downloadCount: marketplaceItems.downloadCount,
      createdAt: marketplaceItems.createdAt,
      updatedAt: marketplaceItems.updatedAt,
      creatorName: users.displayName,
      creatorHandle: users.handle,
      creatorAvatarUrl: users.avatarUrl,
    })
    .from(marketplaceItems)
    .leftJoin(users, eq(marketplaceItems.creatorId, users.id))
    .where(and(eq(marketplaceItems.id, itemId), isNull(marketplaceItems.deletedAt)))
    .limit(1);

  return item || null;
}

export async function createMarketplaceItem(input: CreateMarketplaceItemInput) {
  const db = getDb();

  // 验证：如果有预览素材，检查它是否存在且属于创作者的项目
  if (input.previewAssetId) {
    const [asset] = await db
      .select({ projectId: assets.projectId })
      .from(assets)
      .where(eq(assets.id, input.previewAssetId))
      .limit(1);

    if (!asset) {
      throw new Error('Preview asset not found');
    }

    // 如果指定了 sourceProjectId，确保素材属于该项目
    if (input.sourceProjectId && asset.projectId !== input.sourceProjectId) {
      throw new Error('Preview asset does not belong to the specified project');
    }
  }

  // 验证：如果有源项目，检查它是否存在且属于创作者
  if (input.sourceProjectId) {
    const [project] = await db
      .select({ ownerId: projects.ownerId })
      .from(projects)
      .where(and(eq(projects.id, input.sourceProjectId), isNull(projects.deletedAt)))
      .limit(1);

    if (!project) {
      throw new Error('Source project not found or deleted');
    }

    if (project.ownerId !== input.creatorId) {
      throw new Error('Only project owner can publish items from it');
    }
  }

  // 验证：如果有快照，检查它是否存在
  if (input.snapshotId) {
    const [snapshot] = await db
      .select({ id: snapshots.id })
      .from(snapshots)
      .where(eq(snapshots.id, input.snapshotId))
      .limit(1);

    if (!snapshot) {
      throw new Error('Snapshot not found');
    }
  }

  // 创建物品
  const [newItem] = await db
    .insert(marketplaceItems)
    .values({
      creatorId: input.creatorId,
      itemType: input.itemType,
      title: input.title,
      description: input.description ?? '',
      tags: input.tags ?? [],
      previewAssetId: input.previewAssetId,
      sourceProjectId: input.sourceProjectId,
      snapshotId: input.snapshotId,
      documentId: input.documentId,
      priceCredits: input.priceCredits ?? 0,
      visibility: input.visibility ?? 'private',
    })
    .returning();

  return newItem!;
}

export async function updateMarketplaceItem(itemId: string, userId: string, input: UpdateMarketplaceItemInput) {
  const db = getDb();

  // 先检查所有权
  const [existing] = await db
    .select({ creatorId: marketplaceItems.creatorId })
    .from(marketplaceItems)
    .where(and(eq(marketplaceItems.id, itemId), isNull(marketplaceItems.deletedAt)))
    .limit(1);

  if (!existing) {
    throw new Error('Item not found or deleted');
  }

  if (existing.creatorId !== userId) {
    throw new Error('Only creator can update this item');
  }

  // 验证：如果有新的预览素材，检查它是否存在
  if (input.previewAssetId) {
    const [asset] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.id, input.previewAssetId))
      .limit(1);

    if (!asset) {
      throw new Error('Preview asset not found');
    }
  }

  // 更新
  const [updated] = await db
    .update(marketplaceItems)
    .set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.previewAssetId !== undefined && { previewAssetId: input.previewAssetId }),
      ...(input.priceCredits !== undefined && { priceCredits: input.priceCredits }),
      ...(input.visibility !== undefined && { visibility: input.visibility }),
    })
    .where(eq(marketplaceItems.id, itemId))
    .returning();

  return updated!;
}

export async function deleteMarketplaceItem(itemId: string, userId: string) {
  const db = getDb();

  // 先检查所有权
  const [existing] = await db
    .select({ creatorId: marketplaceItems.creatorId })
    .from(marketplaceItems)
    .where(and(eq(marketplaceItems.id, itemId), isNull(marketplaceItems.deletedAt)))
    .limit(1);

  if (!existing) {
    throw new Error('Item not found or already deleted');
  }

  if (existing.creatorId !== userId) {
    throw new Error('Only creator can delete this item');
  }

  // 软删除
  const [deleted] = await db
    .update(marketplaceItems)
    .set({ deletedAt: new Date() })
    .where(eq(marketplaceItems.id, itemId))
    .returning();

  return deleted!;
}

export async function incrementDownloadCount(itemId: string) {
  const db = getDb();

  const [updated] = await db
    .update(marketplaceItems)
    .set({
      downloadCount: sql`${marketplaceItems.downloadCount} + 1`,
    })
    .where(and(eq(marketplaceItems.id, itemId), isNull(marketplaceItems.deletedAt)))
    .returning({ downloadCount: marketplaceItems.downloadCount });

  return updated?.downloadCount ?? 0;
}
