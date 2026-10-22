import { and, desc, eq, gte, inArray, isNull, lte, notInArray, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { marketplaceItems, assets, projects, snapshots, users, marketplacePurchases, creditLedger, marketplaceSplits, marketplaceAuditLog, marketplaceReports } from '../db/schema';
import type { MarketplaceItemType, MarketplaceVisibility } from '../db/schema';
import { monthPeriod } from './credits';
import { isUuid } from './ids';
import { recordAudit } from './audit';

/**
 * §127-128 Marketplace 系统：组件 / 模板 / 设计系统 / 资产 / 世界 / 游戏 / AI 角色的交易与分享。
 *
 * 三条塑造了这里写法的事实：
 * - **创作者经济**（§128）：用户可以出售自己的作品，价格以 Credits 计；下架后买过的人仍在
 *   「我的购买」看到状态与下架时间，但详情、预览、交付都点不开（详情 GET 的文档曾写反，#153 改掉了）。
 * - **内容安全**（§129）：标题、描述、标签过发布机检同一份红线词表，命中就不让上架。
 * - **软删除纪律**：下架不等于物理删除——`deletedAt` 标记后店面、详情、预览、交付一律当作不存在；
 *   购买记录仍在（「我的购买」带着下架时间），但没有"下架原因"这一列，谁也看不到原因。
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

/**
 * 「我的物品」：创作者自己的条目——**包含 private 草稿**，不包含已下架。
 *
 * 店面列表（上面那个函数）只出 public/free，而店面页此前是拿店面结果按 creatorId 过滤出
 * 「我的物品」的 ⇒ 私密草稿在那一块里根本不存在，可页面自己写着"私密在那里可见、可删"——
 * 一句没有实现在支撑的承诺（#154）。这是**所有者视角**的读路：过滤条件只有归属与软删，
 * 没有可见性。下架的仍然不出现（下架就是不在；店面测试按"下架后消失"断言）。
 */
export async function listOwnedMarketplaceItems(
  creatorId: string,
  options: { itemType?: MarketplaceItemType; limit?: number } = {},
) {
  // 形状不对的 id 按"一件都没有"处理：eq(uuid 列, 非 uuid) 会撞 22P02 变 500（domain/ids.ts）
  if (!isUuid(creatorId)) return [];
  const db = getDb();
  const conditions = [eq(marketplaceItems.creatorId, creatorId), isNull(marketplaceItems.deletedAt)];
  if (options.itemType) {
    conditions.push(eq(marketplaceItems.itemType, options.itemType));
  }

  return db
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
    .limit(options.limit ?? 100);
}

export async function getMarketplaceItem(itemId: string) {
  // 形状不对的 id 按"没有这个物品"处理：eq(marketplaceItems.id, …) 会撞 22P02 变 500（domain/ids.ts）。
  // 详情、预览图、内容交付三条读路共用这一处——此前交付门在路由里各挡了一道，另外两条直接 500
  if (!isUuid(itemId)) return null;
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

type MarketplaceItemRow = typeof marketplaceItems.$inferSelect;

/**
 * 更新/删除的拒绝原因：路由按它翻状态码（404/403/400），不再靠解析一句英文正文。
 * 此前两种拒绝都抛普通 Error、路由一律回 400，客户端拿到的是内部句子（§26）。
 */
export type UpdateMarketplaceItemResult =
  | { ok: true; item: MarketplaceItemRow }
  | { ok: false; reason: 'not_found' | 'forbidden' | 'preview_asset_not_found' };

export type DeleteMarketplaceItemResult =
  | { ok: true; item: MarketplaceItemRow }
  | { ok: false; reason: 'not_found' | 'forbidden' };

export async function updateMarketplaceItem(
  itemId: string,
  userId: string,
  input: UpdateMarketplaceItemInput,
): Promise<UpdateMarketplaceItemResult> {
  // 形状不对的 id 按"没有这个物品"处理：eq(marketplaceItems.id, …) 会撞 22P02 变 500（domain/ids.ts）
  if (!isUuid(itemId)) return { ok: false, reason: 'not_found' };
  const db = getDb();

  // 先检查所有权
  const [existing] = await db
    .select({ creatorId: marketplaceItems.creatorId, visibility: marketplaceItems.visibility })
    .from(marketplaceItems)
    .where(and(eq(marketplaceItems.id, itemId), isNull(marketplaceItems.deletedAt)))
    .limit(1);

  if (!existing) {
    return { ok: false, reason: 'not_found' };
  }

  if (existing.creatorId !== userId) {
    // 私有条目对外根本不存在：与详情、预览同一口径。回 403 等于告诉陌生人「这个 id 存在」
    return { ok: false, reason: existing.visibility === 'private' ? 'not_found' : 'forbidden' };
  }

  // 验证：如果有新的预览素材，检查它是否存在
  if (input.previewAssetId) {
    const [asset] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.id, input.previewAssetId))
      .limit(1);

    if (!asset) {
      return { ok: false, reason: 'preview_asset_not_found' };
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

  return { ok: true, item: updated! };
}

export async function deleteMarketplaceItem(
  itemId: string,
  userId: string,
): Promise<DeleteMarketplaceItemResult> {
  // 形状不对的 id 按"没有这个物品"处理：eq(marketplaceItems.id, …) 会撞 22P02 变 500（domain/ids.ts）
  if (!isUuid(itemId)) return { ok: false, reason: 'not_found' };
  const db = getDb();

  // 先检查所有权
  const [existing] = await db
    .select({ creatorId: marketplaceItems.creatorId, visibility: marketplaceItems.visibility })
    .from(marketplaceItems)
    .where(and(eq(marketplaceItems.id, itemId), isNull(marketplaceItems.deletedAt)))
    .limit(1);

  if (!existing) {
    return { ok: false, reason: 'not_found' };
  }

  if (existing.creatorId !== userId) {
    // 与 update 同一口径：私有条目对外不存在
    return { ok: false, reason: existing.visibility === 'private' ? 'not_found' : 'forbidden' };
  }

  // 软删除
  const [deleted] = await db
    .update(marketplaceItems)
    .set({ deletedAt: new Date() })
    .where(eq(marketplaceItems.id, itemId))
    .returning();

  return { ok: true, item: deleted! };
}

/**
 * 「下载（N）」那个数字一小时能涨几次——按一个人正常用是个位数定的，给到 60 已经很宽松。
 *
 * 写成一处常量（不是路由里那个字面量）：交付门要拿它挡人，界面那句限度要念它，
 * 见证测试要按它算第 61 次必然被拒——各写一遍就会有一处先过时。
 */
export const MARKETPLACE_DOWNLOAD_LIMIT_PER_HOUR = 60;

/**
 * `downloadCount` 唯一的写入方是内容交付那一道门（`GET /api/marketplace/[id]/content`），
 * 而且只在 ZIP 真建出来之后调这里。曾经还有第二条只记数不交付的路由（`POST /[id]/download`），
 * 那让"数字"与"交付过的次数"变成两回事，已随 #120 之后界面改走交付门一并删掉。
 */
export async function incrementDownloadCount(itemId: string) {
  // 形状不对的 id 当作"没有行被改"：返回 0 与"条目不存在/已下架"同义（domain/ids.ts）
  if (!isUuid(itemId)) return 0;
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

/**
 * §127-128 Marketplace 购买：用 credits 结算一次购买。
 *
 * 三条纪律：
 * - **幂等**：同一用户对同一物品只买一次（库里的 `UNIQUE(item_id, buyer_id)` 挡着）；
 * - **余额是派生的**：扣点走 `credit_ledger` 的 `SUM(delta)`，没有"当前余额"可写；
 * - **没有支付**（§159）：额度只有档位发放与代码调整两个来源，界面上不许出现"充值"按钮。
 *
 * 被拒绝的购买走判别式结果（与 update/delete 同一套），**不再抛一句英文让路由比对文本**：
 * 句子是内部措辞，改一个词就会悄悄改掉 HTTP 状态码。未知异常（库坏了）仍然 throw——
 * "买家不该买"和"系统出错"不是同一件事，路由分别回 4xx 与 500。
 */
export interface PurchaseMarketplaceItemInput {
  buyerId: string;
  itemId: string;
}

export type PurchaseResult =
  | {
      ok: true;
      /** 购买记录 id */
      purchaseId: string;
      /** 这次扣了多少点 */
      pricePaid: number;
    }
  | { ok: false; reason: 'not_found' | 'free_item' | 'own_item' | 'already_purchased' };

export async function purchaseMarketplaceItem(
  input: PurchaseMarketplaceItemInput,
): Promise<PurchaseResult> {
  // 形状不对的 id 与"不存在或已下架"同一答案：事务都不用开（domain/ids.ts）
  if (!isUuid(input.itemId)) return { ok: false, reason: 'not_found' };
  const db = getDb();

  try {
    return await db.transaction(async (tx) => {
      // 先查物品：必须存在、未下架、公开或免费
      const [item] = await tx
        .select({
          id: marketplaceItems.id,
          creatorId: marketplaceItems.creatorId,
          priceCredits: marketplaceItems.priceCredits,
          visibility: marketplaceItems.visibility,
        })
        .from(marketplaceItems)
        .where(and(eq(marketplaceItems.id, input.itemId), isNull(marketplaceItems.deletedAt)))
        .limit(1);

      if (!item) return { ok: false, reason: 'not_found' };

      // 免费物品不用买
      if (item.visibility === 'free') return { ok: false, reason: 'free_item' };

      // 私有草稿不在市面上：凭 id 直接买一份没上架的商品，等于把作者还没决定公开的
      // 东西卖出去（预览路由对 private 只放创作者，购买与它同一口径，见 [id]/preview）。
      // 默认价格是 0 的草稿尤其致命：pricePaid=0 时不写扣点流水，购买"免费成交"，
      // 之后 content 路由的 hasPurchased 就为任何人放行未公开草稿的完整导出包。
      // 复用 `not_found`：对买家来说"没上架"与"不存在"是同一个答案，
      // 不留下"存在但不给你买"那种可分辨的差别
      if (item.visibility === 'private') return { ok: false, reason: 'not_found' };

      // 不能买自己的东西
      if (item.creatorId === input.buyerId) return { ok: false, reason: 'own_item' };

      // 检查是否已经买过（幂等）
      const [existing] = await tx
        .select({ id: marketplacePurchases.id })
        .from(marketplacePurchases)
        .where(
          and(
            eq(marketplacePurchases.itemId, input.itemId),
            eq(marketplacePurchases.buyerId, input.buyerId),
          ),
        )
        .limit(1);

      if (existing) return { ok: false, reason: 'already_purchased' };

      // 价格 > 0 才扣点；价格为 0 的物品直接记一笔购买记录
      const pricePaid = item.priceCredits;

      // **先**记购买行：`(item_id, buyer_id)` 上有唯一索引，并发的第二个请求在这一行被挡下，
      // 事务回滚，扣点一行都不会写。原来这里是"先扣点再记购买行"且没有事务，
      // 并发时买家会被扣两次（与 settlePurchase 是同一个形状，见那个函数头）。
      const [purchase] = await tx
        .insert(marketplacePurchases)
        .values({
          itemId: input.itemId,
          buyerId: input.buyerId,
          pricePaid,
        })
        .returning({ id: marketplacePurchases.id });

      if (!purchase) {
        throw new Error('Failed to record purchase');
      }

      if (pricePaid > 0) {
        // 扣点：往 credit_ledger 写一行负的 delta
        // 注意：这里不预查余额——负余额在流水里看得见，预扣需要把 provider 调用包进事务（今天没有）
        const [ledgerRow] = await tx
          .insert(creditLedger)
          .values({
            userId: input.buyerId,
            kind: 'marketplace',
            delta: -pricePaid,
            reason: `购买物品 ${input.itemId}，扣 ${pricePaid} 点`,
            source: 'marketplace_purchase',
            period: monthPeriod(new Date()),
          })
          .returning({ id: creditLedger.id });

        if (!ledgerRow) {
          throw new Error('Failed to charge credits');
        }
      }

      return { ok: true as const, purchaseId: purchase.id, pricePaid };
    });
  } catch (error) {
    // 并发时唯一索引挡下的第二个请求：事务已回滚，钱一行都没写——这是"已经买过"的正常结局
    if (isUniqueViolation(error)) return { ok: false, reason: 'already_purchased' };
    throw error;
  }
}

/**
 * 检查某个用户是否已经购买了某件物品（用于下载端点的鉴权）。
 */
export async function hasPurchased(itemId: string, userId: string): Promise<boolean> {
  // 形状不对的 id 按"没买过"处理（domain/ids.ts）：交付门只会因此走"未购买"那条路，
  // 而不是把整个请求变成 500
  if (!isUuid(itemId)) return false;
  const db = getDb();

  const [row] = await db
    .select({ id: marketplacePurchases.id })
    .from(marketplacePurchases)
    .where(
      and(
        eq(marketplacePurchases.itemId, itemId),
        eq(marketplacePurchases.buyerId, userId),
      ),
    )
    .limit(1);

  return !!row;
}

export interface BuyerPurchaseRow {
  itemId: string;
  title: string;
  itemType: MarketplaceItemType;
  visibility: MarketplaceVisibility;
  pricePaid: number;
  purchasedAt: Date;
  creatorId: string;
  creatorName: string | null;
  creatorHandle: string | null;
  /** 软删除时间；非空表示条目已下架——购买记录仍在，但交付门现在不给（页面上要说清） */
  delistedAt: Date | null;
}

/**
 * 买家侧的「我买过什么」。购买行不随软删除消失，所以这里是**唯一**会把已下架条目
 * 读出来的地方：店面列表过滤 deletedAt，交付门对已下架也回 404。
 * 状态口径由调用方按 `delistedAt` / `visibility` 翻成人话，域里不再造第二套枚举。
 */
export async function listBuyerPurchases(buyerId: string, limit = 100): Promise<BuyerPurchaseRow[]> {
  const db = getDb();
  return db
    .select({
      itemId: marketplaceItems.id,
      title: marketplaceItems.title,
      itemType: marketplaceItems.itemType,
      visibility: marketplaceItems.visibility,
      pricePaid: marketplacePurchases.pricePaid,
      purchasedAt: marketplacePurchases.purchasedAt,
      creatorId: marketplaceItems.creatorId,
      creatorName: users.displayName,
      creatorHandle: users.handle,
      delistedAt: marketplaceItems.deletedAt,
    })
    .from(marketplacePurchases)
    .innerJoin(marketplaceItems, eq(marketplacePurchases.itemId, marketplaceItems.id))
    .leftJoin(users, eq(marketplaceItems.creatorId, users.id))
    .where(eq(marketplacePurchases.buyerId, buyerId))
    .orderBy(desc(marketplacePurchases.purchasedAt))
    .limit(limit);
}

/**
 * §128 Marketplace 创作者分成：一次购买后，把价格的一部分记成创作者收入。
 *
 * 三条纪律：
 * - **幂等**：一次购买只记一次分成（库里的 `UNIQUE(purchase_id)` 挡着）；
 * - **余额是派生的**：收入走 `credit_ledger` 的正 delta，没有"当前余额"可写；
 * - **没有真支付**（§159）：额度只有档位发放与代码调整两个来源，界面上不许出现"充值"按钮。
 *
 * 默认分成比例：70% 给创作者，30% 留平台（今天只是记账，没有提现链路）。
 */
export interface SettlePurchaseInput {
  purchaseId: string;
  /** 分成比例（0-1），默认 0.7 */
  creatorShare?: number;
}

/**
 * 结算的结局是判别式结果（与购买 / update / delete 同一套）：被拒绝的结局不抛句子，
 * 调用方按 reason 决定是"正常重复 / 无收入可分"还是"该记一条错误"。
 * 只有真正的异常（库坏了、写不进去）才 throw。
 */
export type SettleResult =
  | {
      ok: true;
      splitId: string;
      amount: number;
    }
  | { ok: false; reason: 'purchase_not_found' | 'item_not_found' | 'already_settled' | 'no_revenue' };

/**
 * Postgres 的唯一约束冲突（`23505`）。
 *
 * 写钱那两条路（买 / 分账）都靠"唯一索引 + 事务"做并发守卫，而唯一索引报出来的是
 * 一个 `23505` 的驱动错误，不是业务语义。把它翻译成调用方认的那个 reason，
 * 否则并发的第二个请求会以 500 的形状出现。
 *
 * drizzle 会在驱动错误外面包一层 `DrizzleQueryError`（message 是 "Failed query: …"），
 * `code` 在 **cause 链**上而不在顶层——只看顶层等于这个函数从来没生效过（#151 实测：
 * 并发重复购买的输家一路抛到路由）。所以沿 cause 走几步，别只读第一层。
 */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current !== null && depth < 5; depth += 1) {
    if (typeof current === 'object' && (current as { code?: string }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * 结算一笔购买：给创作者分账。
 *
 * ## 2026-10-09 修：钱必须在事务里，而且**先写被唯一索引保护的那一行**
 * 原来这里的顺序是"查重 → 写 ledger（钱）→ 写 splits（被唯一索引保护）"，三步之间没有事务。
 * 并发时两个请求都能过查重，于是各写一行 ledger，第二步才被唯一索引拦下——
 * **拦下的是记录行，不是已经动过的钱**：创作者被分两次账，而 splits 只有一条，
 * 事后对账看不出来。`marketplace-settle.integration.test.ts` 里那一条并发用例
 * 实测复现了"一笔购买分了 2 次账"。
 *
 * 两处改动缺一不可：
 * 1. **整个写路径进一个事务**——任何一步失败，钱与记录一起回滚；
 * 2. **把 splits 挪到 ledger 前面**——并发的第二个请求在写第一行时就被唯一索引挡下，
 *    事务立刻回滚，**一个字节的钱都还没写**。顺序反了的话，事务虽然也能回滚，
 *    但要先把钱写进去再回滚，白白多一次写与一次锁等待。
 *
 * 唯一索引的冲突在这里翻译回 `{ok:false,reason:'already_settled'}`：调用方（`purchase/route.ts`）
 * 按 reason 区分"正常重复"与"真出错"，直接把 Postgres 的 23505 抛出去会让它记一条假错误日志。
 */
export async function settlePurchase(input: SettlePurchaseInput): Promise<SettleResult> {
  const db = getDb();
  const creatorShare = input.creatorShare ?? 0.7;

  try {
    return await db.transaction(async (tx) => {
  // 先查购买记录
  const [purchase] = await tx
    .select({
      id: marketplacePurchases.id,
      itemId: marketplacePurchases.itemId,
      buyerId: marketplacePurchases.buyerId,
      pricePaid: marketplacePurchases.pricePaid,
    })
    .from(marketplacePurchases)
    .where(eq(marketplacePurchases.id, input.purchaseId))
    .limit(1);

  if (!purchase) {
    return { ok: false, reason: 'purchase_not_found' };
  }

  // 查物品拿创作者
  const [item] = await tx
    .select({ creatorId: marketplaceItems.creatorId })
    .from(marketplaceItems)
    .where(eq(marketplaceItems.id, purchase.itemId))
    .limit(1);

  if (!item) {
    return { ok: false, reason: 'item_not_found' };
  }

  // 检查是否已经分过账（快路：把常见情况说清楚；真正的并发守卫是下面那条唯一索引）
  const [existing] = await tx
    .select({ id: marketplaceSplits.id })
    .from(marketplaceSplits)
    .where(eq(marketplaceSplits.purchaseId, input.purchaseId))
    .limit(1);

  if (existing) {
    return { ok: false, reason: 'already_settled' };
  }

  // 算分成金额（向下取整，避免小数）
  const amount = Math.floor(purchase.pricePaid * creatorShare);

  // 价格为 0 的物品不分成
  if (amount === 0) {
    return { ok: false, reason: 'no_revenue' };
  }

  // **先**记分账记录：`marketplace_splits` 上有 `purchase_id` 的唯一索引，
  // 并发的第二个请求在这一行就被挡下（见函数头那段）。写在这里而不是写在 ledger 后面，
  // 是为了让"挡下"发生在钱之前。
  const [split] = await tx
    .insert(marketplaceSplits)
    .values({
      purchaseId: input.purchaseId,
      creatorId: item.creatorId,
      amount,
    })
    .returning({ id: marketplaceSplits.id });

  if (!split) {
    throw new Error('Failed to record split');
  }

  // 再写 ledger 正 delta（创作者收入）。这一步失败会连上面那行 split 一起回滚——
  // 这正是它必须在同一个事务里的原因：留着一条"分过账"的记录却没有钱，比什么都没写更糟。
  const [ledgerRow] = await tx
    .insert(creditLedger)
    .values({
      userId: item.creatorId,
      kind: 'marketplace',
      delta: amount,
      reason: `物品 ${purchase.itemId} 的销售分成（${Math.round(creatorShare * 100)}%），收入 ${amount} 点`,
      source: 'marketplace_sale',
      period: monthPeriod(new Date()),
    })
    .returning({ id: creditLedger.id });

  if (!ledgerRow) {
    throw new Error('Failed to record income');
  }

      return { ok: true as const, splitId: split.id, amount };
    });
  } catch (error) {
    // 唯一索引的冲突翻译回调用方认的那个 reason，别把 23505 直接抛出去
    if (isUniqueViolation(error)) return { ok: false, reason: 'already_settled' };
    throw error;
  }
}

/**
 * §128 Marketplace 创作者收入明细：查分账记录与 ledger，按天聚合。
 */
export interface CreatorEarningsInput {
  creatorId: string;
  /** 可选的时间范围过滤 */
  startDate?: Date;
  endDate?: Date;
}

export interface DailyEarnings {
  date: string; // YYYY-MM-DD
  totalAmount: number;
  salesCount: number;
}

export interface CreatorEarningsSummary {
  totalEarned: number;
  totalSales: number;
  dailyBreakdown: DailyEarnings[];
}

export async function getCreatorEarnings(input: CreatorEarningsInput): Promise<CreatorEarningsSummary> {
  const db = getDb();

  // 基础查询条件
  const conditions = [eq(marketplaceSplits.creatorId, input.creatorId)];

  // 日期范围用 drizzle 的 gte/lte 算子而不是裸 sql 模板：裸模板把 Date 当字符串传，
  // postgres.js 对 timestamptz 参数抛 ERR_INVALID_ARG_TYPE——任何带日期的调用都会 500
  // （路由不传日期所以一直是潜伏的；marketplace-earnings 集成测试钉住了这一条）
  if (input.startDate) {
    conditions.push(gte(marketplaceSplits.splitAt, input.startDate));
  }

  if (input.endDate) {
    conditions.push(lte(marketplaceSplits.splitAt, input.endDate));
  }

  // 查分账记录
  const splits = await db
    .select({
      amount: marketplaceSplits.amount,
      splitAt: marketplaceSplits.splitAt,
    })
    .from(marketplaceSplits)
    .where(and(...conditions))
    .orderBy(desc(marketplaceSplits.splitAt));

  // 按天聚合
  const byDay = new Map<string, { total: number; count: number }>();
  let totalEarned = 0;
  let totalSales = 0;

  for (const split of splits) {
    const date = split.splitAt.toISOString().split('T')[0]!;
    const existing = byDay.get(date) || { total: 0, count: 0 };
    existing.total += split.amount;
    existing.count += 1;
    byDay.set(date, existing);
    totalEarned += split.amount;
    totalSales += 1;
  }

  const dailyBreakdown: DailyEarnings[] = Array.from(byDay.entries())
    .map(([date, data]) => ({
      date,
      totalAmount: data.total,
      salesCount: data.count,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    totalEarned,
    totalSales,
    dailyBreakdown,
  };
}

/**
 * §123 Marketplace：审计日志动作类型。
 */
/**
 * 审计动作的运行时名单：迁移 0033 的 CHECK、路由的查询校验都从这里取。
 * 此前路由手抄了一份六项名单，0016/0033 加动作时不会跟着变——
 * #156 写进去的 `suspicious_purchase` 在管理员按它筛选时被 400 拒，就是手抄的代价。
 */
export const AUDIT_ACTIONS = [
  'purchase',
  'download',
  'settle',
  'price_change',
  'list',
  'delist',
  'suspicious_purchase',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditMarketplaceActionInput {
  actorId: string;
  action: AuditAction;
  itemId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * §123 记录一次市场操作到审计日志（自动调用，不对外暴露）。
 */
export async function auditMarketplaceAction(input: AuditMarketplaceActionInput): Promise<void> {
  const db = getDb();
  await db.insert(marketplaceAuditLog).values({
    actorId: input.actorId,
    action: input.action,
    itemId: input.itemId,
    metadata: input.metadata ?? {},
    ipAddress: input.ipAddress,
  });
}

export interface FlagSuspiciousActivityInput {
  reporterId: string;
  itemId: string;
  reason: 'fraud' | 'spam' | 'copyright' | 'inappropriate' | 'other';
  description?: string;
}

export interface FlagResult {
  reportId: string;
  isDuplicate: boolean;
}

/**
 * §123 标记可疑活动（用户举报或系统自动检测）。
 * 同一用户对同一物品只能举报一次（幂等）。
 */
export async function flagSuspiciousActivity(input: FlagSuspiciousActivityInput): Promise<FlagResult> {
  const db = getDb();

  // 检查是否已举报过
  const existing = await db
    .select()
    .from(marketplaceReports)
    .where(and(eq(marketplaceReports.reporterId, input.reporterId), eq(marketplaceReports.itemId, input.itemId)))
    .limit(1);

  if (existing.length > 0) {
    const first = existing[0];
    if (!first) throw new Error('Unexpected empty result');
    return { reportId: first.id, isDuplicate: true };
  }

  // 插入新举报
  const [report] = await db
    .insert(marketplaceReports)
    .values({
      reporterId: input.reporterId,
      itemId: input.itemId,
      reason: input.reason,
      description: input.description,
    })
    .returning({ id: marketplaceReports.id });

  if (!report) {
    throw new Error('Failed to create report');
  }

  return { reportId: report.id, isDuplicate: false };
}

/**
 * 店面渲染用：这一页里**我已经举报过**的物品 id。
 *
 * `MarketplaceItemRow` 只能记住本次会话里点过的那一次提交；刷新之后按钮又出现，
 * 买家必须再点一次提交才从 409 知道「已经举报过」。读这一条把已知状态交给界面，
 * 与页面同一次渲染（不另开接口）。传进来的 id 是当前页的物品集合：一次 `inArray`，
 * 不扫全表；形状不对的 id 直接丢掉（与 `listOwnedMarketplaceItems` 同一个 22P02 口径）。
 */
export async function listReportedItemIds(reporterId: string, itemIds: string[]): Promise<Set<string>> {
  if (!isUuid(reporterId)) return new Set();
  const ids = [...new Set(itemIds.filter(isUuid))];
  if (!ids.length) return new Set();

  const rows = await getDb()
    .select({ itemId: marketplaceReports.itemId })
    .from(marketplaceReports)
    .where(and(eq(marketplaceReports.reporterId, reporterId), inArray(marketplaceReports.itemId, ids)));

  return new Set(rows.map((row) => row.itemId));
}

export interface GetAuditLogInput {
  itemId?: string;
  actorId?: string;
  action?: AuditAction;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  action: AuditAction;
  itemId: string;
  metadata: Record<string, unknown>;
  occurredAt: Date;
  ipAddress: string | null;
}

/**
 * §123 查询审计日志（管理员用）。
 */
export async function getAuditLog(input: GetAuditLogInput): Promise<AuditLogEntry[]> {
  const db = getDb();
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;

  let query = db.select().from(marketplaceAuditLog).orderBy(desc(marketplaceAuditLog.occurredAt));

  const conditions = [];
  if (input.itemId) conditions.push(eq(marketplaceAuditLog.itemId, input.itemId));
  if (input.actorId) conditions.push(eq(marketplaceAuditLog.actorId, input.actorId));
  if (input.action) conditions.push(eq(marketplaceAuditLog.action, input.action));
  if (input.startDate) conditions.push(gte(marketplaceAuditLog.occurredAt, input.startDate));
  // 右端是"这一刻及以前"：同一对字段里 start 用 gte、end 却用 gte，时间窗就会变成
  // "晚于 end 的那些行"——管理员筛 6 月，拿回的是 12 月。
  if (input.endDate) conditions.push(lte(marketplaceAuditLog.occurredAt, input.endDate));

  if (conditions.length > 0) {
    // @ts-expect-error drizzle-orm 的类型推导在这里不够聪明
    query = query.where(and(...conditions));
  }

  const rows = await query.limit(limit).offset(offset);

  return rows.map((row) => ({
    id: row.id,
    actorId: row.actorId,
    action: row.action as AuditAction,
    itemId: row.itemId,
    metadata: (row.metadata as Record<string, unknown>) || {},
    occurredAt: row.occurredAt,
    ipAddress: row.ipAddress,
  }));
}

/**
 * 举报工单的状态名单：迁移的 CHECK、路由的查询与处置校验都从这里取，
 * 不再各抄一份（#157 已经为审计动作付过一次手抄的代价）。
 */
export const REPORT_STATUSES = ['pending', 'reviewing', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * 终态：结案（成立）或驳回（不成立）。结案记录是审计证据，
 * 不是可以反复覆盖的草稿，所以终态不再接受任何写入。
 */
export const REPORT_CLOSED_STATUSES = ['resolved', 'dismissed'] as const;
export type ReportClosedStatus = (typeof REPORT_CLOSED_STATUSES)[number];

/** 处置只能往这三个状态推进；`pending` 是初始态，不是可回退的目标。 */
export const REPORT_TRANSITION_STATUSES = ['reviewing', ...REPORT_CLOSED_STATUSES] as const;
export type ReportTransitionStatus = (typeof REPORT_TRANSITION_STATUSES)[number];

export interface GetReportsInput {
  status?: ReportStatus;
  itemId?: string;
  limit?: number;
  offset?: number;
}

export interface ReportEntry {
  id: string;
  reporterId: string;
  itemId: string;
  reason: string;
  description: string | null;
  status: ReportStatus;
  adminNotes: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

function toReportEntry(row: typeof marketplaceReports.$inferSelect): ReportEntry {
  return {
    id: row.id,
    reporterId: row.reporterId,
    itemId: row.itemId,
    reason: row.reason,
    description: row.description,
    status: row.status as ReportStatus,
    adminNotes: row.adminNotes,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  };
}

/**
 * §123 查询举报列表（管理员用）。
 */
export async function getReports(input: GetReportsInput): Promise<ReportEntry[]> {
  const db = getDb();
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;

  let query = db.select().from(marketplaceReports).orderBy(desc(marketplaceReports.createdAt));

  const conditions = [];
  if (input.status) conditions.push(eq(marketplaceReports.status, input.status));
  if (input.itemId) conditions.push(eq(marketplaceReports.itemId, input.itemId));

  if (conditions.length > 0) {
    // @ts-expect-error drizzle-orm 的类型推导在这里不够聪明
    query = query.where(and(...conditions));
  }

  const rows = await query.limit(limit).offset(offset);

  return rows.map(toReportEntry);
}

export interface UpdateReportStatusInput {
  reportId: string;
  adminId: string;
  status: ReportTransitionStatus;
  adminNotes?: string;
  ip?: string | null;
}

export type UpdateReportStatusResult =
  | { ok: true; report: ReportEntry }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'already_closed'; status: ReportStatus };

/**
 * §123 审核员处置一个举报工单（#158）。`marketplace_reports.status` 此前没有写入方：
 * 举报只能提交、只能列出，`GET ?status=resolved` 永远拿回空数组——一个只会积压的收件箱。
 *
 * 终态不可改写（结案记录是证据），且判定写在 UPDATE 的 WHERE 里而不是先读再写：
 * 两位审核员同时点"结案 / 驳回"时，后来者会拿到 0 行而不是覆盖前一位的结论。
 * 0 行时再读一次，用"行不存在"和"已经结案"两个不同的答复说清楚发生了什么。
 */
export async function updateReportStatus(input: UpdateReportStatusInput): Promise<UpdateReportStatusResult> {
  if (!isUuid(input.reportId)) return { ok: false, reason: 'not_found' };

  const db = getDb();
  const patch: { status: ReportTransitionStatus; adminNotes?: string; resolvedAt?: Date } = {
    status: input.status,
  };
  // 不传备注就保留原备注：处置状态与复核笔记是两件事，改状态不该顺手清掉上一次的记录
  if (input.adminNotes !== undefined) patch.adminNotes = input.adminNotes;
  if (input.status !== 'reviewing') patch.resolvedAt = new Date();

  const [updated] = await db
    .update(marketplaceReports)
    .set(patch)
    .where(
      and(
        eq(marketplaceReports.id, input.reportId),
        notInArray(marketplaceReports.status, [...REPORT_CLOSED_STATUSES]),
      ),
    )
    .returning();

  if (updated) {
    // 处置一个工单是"审核员对一件被举报的内容下了结论"：谁、何时、结论为何，
    // 与人工裁决同一份口径留进 audit_events，而不是只活在那一次 HTTP 响应里
    await recordAudit({
      actorId: input.adminId,
      action: 'marketplace.report.update',
      targetType: 'marketplace_report',
      targetId: input.reportId,
      allowed: true,
      detail: { status: input.status, hasNotes: input.adminNotes !== undefined },
      ip: input.ip,
    });
    return { ok: true, report: toReportEntry(updated) };
  }

  const [existing] = await db
    .select()
    .from(marketplaceReports)
    .where(eq(marketplaceReports.id, input.reportId))
    .limit(1);
  if (!existing) return { ok: false, reason: 'not_found' };
  // 改写结案记录同样要留痕：那不是"查询没命中"，是有人在试图推翻一个已经落下的结论
  await recordAudit({
    actorId: input.adminId,
    action: 'marketplace.report.update',
    targetType: 'marketplace_report',
    targetId: input.reportId,
    allowed: false,
    detail: { reason: 'already_closed', current: existing.status, wanted: input.status },
    ip: input.ip,
  });
  return { ok: false, reason: 'already_closed', status: existing.status as ReportStatus };
}

/**
 * §123 风控规则。`fired` 为空即这一笔没踩线。
 */
export type SuspiciousRule = 'repeat_same_item_1h' | 'self_purchase' | 'purchase_volume_24h';

export interface SuspiciousDetection {
  fired: SuspiciousRule[];
  /**
   * 每条规则的读数，随审计行一起落库。`self_purchase` 是 0/1。
   *
   * 今天只有 24 小时总量够得着：
   * - `repeat_same_item_1h`：同一买家同一物品只有一行（唯一索引 + already_purchased），
   *   计数永远 ≤ 1，阈值 3 走不到；
   * - `self_purchase`：自购在 `purchaseMarketplaceItem` 里先被 own_item 拒绝，走不到检测；
   * - `purchase_volume_24h`：>50 笔/24h，包含刚插入的这一笔。
   * 前两条留着，是因为约束一旦放宽（可重复购买 / 所有权转移）它们就该自己起作用；
   * "今天够不着"写在这里，不假装它们在拦什么。
   */
  counts: Record<SuspiciousRule, number>;
}

/**
 * §123 检测可疑行为模式（系统自动风控）。
 * 返回命中规则与读数而不是 boolean：路由把这份证据写进 `marketplace_audit_log`，
 * 只回 boolean 的话窗口一关就查不到"因为哪条规则、读数多少"。
 */
export async function detectSuspiciousPatterns(
  itemId: string,
  buyerId: string,
): Promise<SuspiciousDetection> {
  const db = getDb();
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 规则 1：一小时内同一买家对同一物品购买超过 3 次
  const [recentPurchasesBySameBuyer] = await db
    .select({ count: sql<number>`count(*)` })
    .from(marketplacePurchases)
    .where(
      and(
        eq(marketplacePurchases.itemId, itemId),
        eq(marketplacePurchases.buyerId, buyerId),
        gte(marketplacePurchases.purchasedAt, oneHourAgo),
      ),
    );
  const repeatSameItemInHour = Number(recentPurchasesBySameBuyer?.count ?? 0);

  // 规则 2：创作者给自己购买（自刷）
  const [item] = await db
    .select({ creatorId: marketplaceItems.creatorId })
    .from(marketplaceItems)
    .where(eq(marketplaceItems.id, itemId))
    .limit(1);
  const selfPurchase = item?.creatorId === buyerId ? 1 : 0;

  // 规则 3：24 小时内该买家总购买次数异常多（> 50 次）
  const [totalRecentPurchases] = await db
    .select({ count: sql<number>`count(*)` })
    .from(marketplacePurchases)
    .where(and(eq(marketplacePurchases.buyerId, buyerId), gte(marketplacePurchases.purchasedAt, twentyFourHoursAgo)));
  const purchaseVolume24h = Number(totalRecentPurchases?.count ?? 0);

  const fired: SuspiciousRule[] = [];
  if (repeatSameItemInHour > 3) fired.push('repeat_same_item_1h');
  if (selfPurchase === 1) fired.push('self_purchase');
  if (purchaseVolume24h > 50) fired.push('purchase_volume_24h');

  return {
    fired,
    counts: {
      repeat_same_item_1h: repeatSameItemInHour,
      self_purchase: selfPurchase,
      purchase_volume_24h: purchaseVolume24h,
    },
  };
}

