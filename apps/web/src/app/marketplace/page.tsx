import Link from 'next/link';
import { MARKETPLACE_ITEM_TYPES, type MarketplaceItemType } from '@/server/db/schema';
import {
  MARKETPLACE_DOWNLOAD_LIMIT_PER_HOUR,
  listMarketplaceItems,
  listOwnedMarketplaceItems,
} from '@/server/domain/marketplace';
import { currentUserOrNull } from '@/server/domain/session';
import { listProjects } from '@/server/domain/projects';
import { MarketplaceCreateForm } from '@/marketplace/MarketplaceCreateForm';
import { MarketplaceItemRow } from '@/marketplace/MarketplaceItemRow';

/**
 * §127/§128 创作者市场（M7）的店面。
 *
 * 列表只出 public / free 两类（domain 层同一个谓词），private 的只属于创作者自己
 * （在「我的物品」里可见、可改可见性、可下架）——那一块走**所有者视角**的读路
 * （`listOwnedMarketplaceItems`），不受店面可见性过滤；此前它从店面结果里过滤，
 * 私密草稿于是谁的界面里都不出现（#154）。已下架的仍不在其中（下架就是不在）。
 * 工程文件本体的交付**已经接上了**（#120）：
 * 「下载」走 `GET /api/marketplace/<id>/content`，拿到的就是条目源项目的那一份导出包，
 * 页面上那句限度念的是这一格今天真实的边界（交付哪两档、数字怎么来的、匿名不留审计）。
 */

const TYPE_LABELS: Record<MarketplaceItemType, string> = {
  component: '组件',
  template: '模板',
  design_system: '设计系统',
  asset: '素材',
  world: '世界',
  game: '游戏',
  character: 'AI 角色',
};

const VISIBILITY_LABELS: Record<string, string> = {
  public: '在售',
  free: '免费',
  private: '私密',
};

export const dynamic = 'force-dynamic';

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const itemType = MARKETPLACE_ITEM_TYPES.includes(type as MarketplaceItemType)
    ? (type as MarketplaceItemType)
    : undefined;

  const [user, items] = await Promise.all([
    currentUserOrNull(),
    listMarketplaceItems({ itemType, limit: 60 }),
  ]);
  const projects = user ? await listProjects(user.id) : [];
  // 我的物品是所有者视角：包含私密草稿，但仍是同一个类型过滤（导航上的筛选项跟着走）
  const mine = user ? await listOwnedMarketplaceItems(user.id, { itemType }) : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-[980px] flex-col gap-[var(--nexus-space-5)] p-[var(--nexus-space-6)] font-mono">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-[var(--nexus-font-size-28)] font-semibold tracking-tight">创作者市场</h1>
          <p className="text-[var(--nexus-font-size-12)] text-fg-2">
            组件 / 模板 / 设计系统 / 素材 / 世界 / 游戏 / AI 角色。列表只显示公开在售与免费的物品。
          </p>
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <Link href="/marketplace/earnings" className="text-accent-2 underline" data-marketplace-earnings>
              我的收入
            </Link>
          ) : null}
          {user ? (
            <Link href="/marketplace/purchases" className="text-accent-2 underline" data-marketplace-purchases>
              我的购买
            </Link>
          ) : null}
          <Link href="/" className="text-accent-2 underline" data-marketplace-back>
            回首页
          </Link>
        </div>
      </header>

      <nav className="flex flex-wrap items-center gap-2 text-12" data-marketplace-type-nav>
        <Link
          href="/marketplace"
          data-marketplace-type="all"
          className="rounded bg-bg-2 px-2 py-1 hover:bg-bg-3"
        >
          全部
        </Link>
        {MARKETPLACE_ITEM_TYPES.map((t) => (
          <Link
            key={t}
            href={`/marketplace?type=${t}`}
            data-marketplace-type={t}
            className="rounded bg-bg-2 px-2 py-1 hover:bg-bg-3"
          >
            {TYPE_LABELS[t]}
          </Link>
        ))}
      </nav>

      <section className="flex flex-col gap-2" data-marketplace-list>
        <h2 className="text-[var(--nexus-font-size-16)] font-medium">在售（{items.length}）</h2>
        {items.length === 0 ? (
          <p className="text-12 text-fg-3" data-marketplace-empty>
            还没有这一类的物品在售。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <MarketplaceItemRow
                key={item.id}
                item={{
                  id: item.id,
                  title: item.title,
                  description: item.description,
                  itemType: item.itemType,
                  priceCredits: item.priceCredits,
                  visibility: item.visibility,
                  creatorName: item.creatorName,
                  downloadCount: item.downloadCount,
                  previewAssetId: item.previewAssetId,
                }}
                mine={Boolean(user && item.creatorId === user.id)}
                typeLabel={TYPE_LABELS[item.itemType] ?? item.itemType}
                visibilityLabel={VISIBILITY_LABELS[item.visibility] ?? item.visibility}
              />
            ))}
          </ul>
        )}
      </section>

      {user ? (
        <section className="border-t border-[var(--nexus-color-border-subtle)] pt-[var(--nexus-space-4)]">
          <MarketplaceCreateForm
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          />
          {mine.length ? (
            <div className="mt-[var(--nexus-space-4)]" data-marketplace-mine>
              <h2 className="text-[var(--nexus-font-size-16)] font-medium">我的物品（{mine.length}）</h2>
              <ul className="mt-2 flex flex-col gap-2">
                {mine.map((item) => (
                  <MarketplaceItemRow
                    key={item.id}
                    item={{
                      id: item.id,
                      title: item.title,
                      description: item.description,
                      itemType: item.itemType,
                      priceCredits: item.priceCredits,
                      visibility: item.visibility,
                      creatorName: item.creatorName,
                      downloadCount: item.downloadCount,
                      previewAssetId: item.previewAssetId,
                    }}
                    mine
                    typeLabel={TYPE_LABELS[item.itemType] ?? item.itemType}
                    visibilityLabel={VISIBILITY_LABELS[item.visibility] ?? item.visibility}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : (
        <p className="border-t border-[var(--nexus-color-border-subtle)] pt-[var(--nexus-space-4)] text-12 text-fg-3" data-marketplace-signin-hint>
          上架需要先登录（顶栏「账号」）。
        </p>
      )}

      <p className="text-11 text-fg-3" data-marketplace-limits>
        交付已经接上了，这一格的边界是这些：下载拿到的是条目源项目的<strong>设计文档 + 代码</strong>两档
        （§144 导出包的形状），不含素材字节；条目没挂源项目就下不出来。「下载（N）」里的 N 是
        <strong>成功交付的次数</strong>——包没建成不计数，同一个人对同一个条目一小时最多拿
        {MARKETPLACE_DOWNLOAD_LIMIT_PER_HOUR} 份；匿名下载免费物品不留审计行（那一格记的是身份）。
        预览图走的是市场自己的公开路由，与私有素材的取图路径分开。
      </p>
    </main>
  );
}
