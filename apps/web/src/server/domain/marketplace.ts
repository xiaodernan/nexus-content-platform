import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { marketplaceItems, assets, projects, snapshots, users, marketplacePurchases, creditLedger, marketplaceSplits, marketplaceAuditLog, marketplaceReports } from '../db/schema';
import type { MarketplaceItemType, MarketplaceVisibility } from '../db/schema';
import { monthPeriod } from './credits';
import { isUuid } from './ids';

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
  // 形状不对的 id 按"没有这个物品"处理：eq(marketplaceItems.id, …) 会撞 22P02 变 500（domain/ids.ts）
  if (!isUuid(itemId)) throw new Error('Item not found or deleted');
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
  // 形状不对的 id 按"没有这个物品"处理：eq(marketplaceItems.id, …) 会撞 22P02 变 500（domain/ids.ts）
  if (!isUuid(itemId)) throw new Error('Item not found or deleted');
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

/**
 * §127-128 Marketplace 购买：用 credits 结算一次购买。
 *
 * 三条纪律：
 * - **幂等**：同一用户对同一物品只买一次（库里的 `UNIQUE(item_id, buyer_id)` 挡着）；
 * - **余额是派生的**：扣点走 `credit_ledger` 的 `SUM(delta)`，没有"当前余额"可写；
 * - **没有支付**（§159）：额度只有档位发放与代码调整两个来源，界面上不许出现"充值"按钮。
 */
export interface PurchaseMarketplaceItemInput {
  buyerId: string;
  itemId: string;
}

export interface PurchaseResult {
  /** 购买记录 id */
  purchaseId: string;
  /** 这次扣了多少点 */
  pricePaid: number;
}

export async function purchaseMarketplaceItem(input: PurchaseMarketplaceItemInput): Promise<PurchaseResult> {
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

  if (!item) {
    throw new Error('Item not found or deleted');
  }

  // 免费物品不用买
  if (item.visibility === 'free') {
    throw new Error('Free items do not require purchase');
  }

  // 私有草稿不在市面上：凭 id 直接买一份没上架的商品，等于把作者还没决定公开的
  // 东西卖出去（预览路由对 private 只放创作者，购买与它同一口径，见 [id]/preview）。
  // 默认价格是 0 的草稿尤其致命：pricePaid=0 时不写扣点流水，购买"免费成交"，
  // 之后 content 路由的 hasPurchased 就为任何人放行未公开草稿的完整导出包。
  // 复用"不存在或已下架"这一句：对买家来说"没上架"与"不存在"是同一个答案，
  // 不留下"存在但不给你买"那种可分辨的差别
  if (item.visibility === 'private') {
    throw new Error('Item not found or deleted');
  }

  // 不能买自己的东西
  if (item.creatorId === input.buyerId) {
    throw new Error('Cannot purchase your own item');
  }

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

  if (existing) {
    throw new Error('Already purchased');
  }

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

      return { purchaseId: purchase.id, pricePaid };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error('Already purchased', { cause: error });
    throw error;
  }
}

/**
 * 检查某个用户是否已经购买了某件物品（用于下载端点的鉴权）。
 */
export async function hasPurchased(itemId: string, userId: string): Promise<boolean> {
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

export interface SettleResult {
  splitId: string;
  amount: number;
}

/**
 * Postgres 的唯一约束冲突（`23505`）。
 *
 * 写钱那两条路（买 / 分账）都靠"唯一索引 + 事务"做并发守卫，而唯一索引报出来的是
 * 一个 `23505` 的驱动错误，不是业务语义。把它翻译成调用方认的那句话，
 * 否则 `purchase/route.ts` 会把它当成"真出错"记一条日志（它按消息文本区分正常重复与故障）。
 */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
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
 * 唯一索引的冲突在这里翻译回 `Already settled`：调用方（`purchase/route.ts`）
 * 按这句话区分"正常重复"与"真出错"，直接把 Postgres 的 23505 抛出去会让它记一条假错误日志。
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
    throw new Error('Purchase not found');
  }

  // 查物品拿创作者
  const [item] = await tx
    .select({ creatorId: marketplaceItems.creatorId })
    .from(marketplaceItems)
    .where(eq(marketplaceItems.id, purchase.itemId))
    .limit(1);

  if (!item) {
    throw new Error('Item not found');
  }

  // 检查是否已经分过账（快路：把常见情况说清楚；真正的并发守卫是下面那条唯一索引）
  const [existing] = await tx
    .select({ id: marketplaceSplits.id })
    .from(marketplaceSplits)
    .where(eq(marketplaceSplits.purchaseId, input.purchaseId))
    .limit(1);

  if (existing) {
    throw new Error('Already settled');
  }

  // 算分成金额（向下取整，避免小数）
  const amount = Math.floor(purchase.pricePaid * creatorShare);

  // 价格为 0 的物品不分成
  if (amount === 0) {
    throw new Error('No revenue to split');
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

      return { splitId: split.id, amount };
    });
  } catch (error) {
    // 唯一索引的冲突翻译回调用方认的那句话，别把 23505 直接抛出去
    if (isUniqueViolation(error)) throw new Error('Already settled', { cause: error });
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
export type AuditAction = 'purchase' | 'download' | 'settle' | 'price_change' | 'list' | 'delist';

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
  if (input.endDate) conditions.push(gte(marketplaceAuditLog.occurredAt, input.endDate));

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

export interface GetReportsInput {
  status?: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
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
  status: string;
  adminNotes: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
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

  return rows.map((row) => ({
    id: row.id,
    reporterId: row.reporterId,
    itemId: row.itemId,
    reason: row.reason,
    description: row.description,
    status: row.status,
    adminNotes: row.adminNotes,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  }));
}

/**
 * §123 检测可疑行为模式（系统自动风控）。
 * 规则：
 * - 短时间内同一买家对同一物品多次购买（刷量）
 * - 创作者给自己刷量（buyerId === creatorId）
 * - 短时间内大量购买行为（可能是机器人）
 */
export async function detectSuspiciousPatterns(itemId: string, buyerId: string): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 规则 1：一小时内同一买家对同一物品购买超过 3 次
  const recentPurchasesBySameBuyer = await db
    .select({ count: sql<number>`count(*)` })
    .from(marketplacePurchases)
    .where(
      and(
        eq(marketplacePurchases.itemId, itemId),
        eq(marketplacePurchases.buyerId, buyerId),
        gte(marketplacePurchases.purchasedAt, oneHourAgo),
      ),
    );

  if ((recentPurchasesBySameBuyer[0]?.count ?? 0) > 3) {
    return true;
  }

  // 规则 2：创作者给自己购买（自刷）
  const item = await db
    .select({ creatorId: marketplaceItems.creatorId })
    .from(marketplaceItems)
    .where(eq(marketplaceItems.id, itemId))
    .limit(1);

  if (item.length > 0) {
    const first = item[0];
    if (first && first.creatorId === buyerId) {
      return true;
    }
  }

  // 规则 3：24 小时内该买家总购买次数异常多（> 50 次）
  const totalRecentPurchases = await db
    .select({ count: sql<number>`count(*)` })
    .from(marketplacePurchases)
    .where(and(eq(marketplacePurchases.buyerId, buyerId), gte(marketplacePurchases.purchasedAt, twentyFourHoursAgo)));

  if ((totalRecentPurchases[0]?.count ?? 0) > 50) {
    return true;
  }

  return false;
}

