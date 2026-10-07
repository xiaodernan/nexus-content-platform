import Link from 'next/link';
import { MARKETPLACE_ITEM_TYPES, type MarketplaceItemType } from '@/server/db/schema';
import { listMarketplaceItems } from '@/server/domain/marketplace';
import { currentUserOrNull } from '@/server/domain/session';
import { listProjects } from '@/server/domain/projects';
import { MarketplaceCreateForm } from '@/marketplace/MarketplaceCreateForm';
import { MarketplaceItemRow } from '@/marketplace/MarketplaceItemRow';

/**
 * §127/§128 创作者市场（M7）的店面。
 *
 * 列表只出 public / free 两类（domain 层同一个谓词），private 的只属于创作者自己
 * （在「我的物品」里可见、可删）。这一片**没有**接的是：工程文件本体的交付——
 * 「下载」按钮目前只记一次下载计数，条目引用的工程内容（§144 的项目导出包）怎么
 * 走到买家手里还没定，页面上照实说，不装作已经能买到文件。
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
  const mine = user ? items.filter((item) => item.creatorId === user.id) : [];

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
        这一片还没接的：工程文件本体的交付——「下载」当前只记一次下载计数，条目内容怎么走到买家手里
        （项目导出包、credits 结算）是下一片。预览图走的是市场自己的公开路由，与私有素材的取图路径分开。
      </p>
    </main>
  );
}
