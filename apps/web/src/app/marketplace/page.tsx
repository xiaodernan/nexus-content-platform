import Link from 'next/link';
import { MARKETPLACE_ITEM_TYPES, type MarketplaceItemType } from '@/server/db/schema';
import {
  MARKETPLACE_DOWNLOAD_LIMIT_PER_HOUR,
  listMarketplaceItems,
  listOwnedMarketplaceItems,
  listReportedItemIds,
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
  // 「已举报」是服务端已知状态：刷新后入口不该又出现，409 只留作并发下的兜底
  const reportedIds = user ? await listReportedItemIds(user.id, items.map((item) => item.id)) : new Set<string>();

  return (
    <main className="mx-auto flex min-h-screen max-w-[980px] flex-col gap-[var(--nexus-space-5)] p-[var(--nexus-space-6)] font-mono">
      <header className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex flex-col gap-1">
          <span className="font-mono text-10 uppercase tracking-[0.22em] text-[var(--nexus-color-accent-2-ink)]">
            MARKET
          </span>
          <h1 className="relative inline-block bg-gradient-to-br from-[#eef1f6] via-[#8b9cf8] to-[var(--nexus-color-accent-1)] bg-clip-text pb-2 text-[var(--nexus-font-size-28)] font-bold tracking-tight text-transparent" data-marketplace-title>
            创作者市场
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--nexus-color-brand)] to-transparent opacity-70"
            />
          </h1>
          <p className="max-w-lg text-13 leading-6 text-fg-2">
            组件 / 模板 / 设计系统 / 素材 / 世界 / 游戏 / AI 角色。列表只显示公开在售与免费的物品。
          </p>
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <Link href="/marketplace/earnings" className="inline-flex min-h-6 items-center whitespace-nowrap rounded px-1 text-accent-2-ink underline" data-marketplace-earnings>
              我的收入
            </Link>
          ) : null}
          {user ? (
            <Link href="/marketplace/purchases" className="inline-flex min-h-6 items-center whitespace-nowrap rounded px-1 text-accent-2-ink underline" data-marketplace-purchases>
              我的购买
            </Link>
          ) : null}
          {user ? (
            <Link href="/marketplace/reports" className="inline-flex min-h-6 items-center whitespace-nowrap rounded px-1 text-accent-2-ink underline" data-marketplace-reports>
              我的举报
            </Link>
          ) : null}
          <Link href="/" className="inline-flex min-h-6 items-center whitespace-nowrap rounded px-1 text-accent-2-ink underline" data-marketplace-back>
            回首页
          </Link>
        </div>
      </header>

      <nav className="flex flex-wrap items-center gap-2 text-12" data-marketplace-type-nav>
        <Link
          href="/marketplace"
          data-marketplace-type="all"
          data-current={itemType ? 'false' : 'true'}
          className={`rounded-full border px-3 py-1 transition-all duration-200 ${
            itemType
              ? 'border-[var(--nexus-color-border-subtle)] text-fg-2 hover:border-[var(--nexus-color-brand)] hover:text-fg-1'
              : 'border-[var(--nexus-color-brand)] bg-[var(--nexus-color-brand)] font-semibold text-[var(--nexus-color-accent-fg)] shadow-[0_0_18px_rgb(91_108_255/0.35)]'
          }`}
        >
          全部
        </Link>
        {MARKETPLACE_ITEM_TYPES.map((t) => {
          const current = itemType === t;
          return (
            <Link
              key={t}
              href={`/marketplace?type=${t}`}
              data-marketplace-type={t}
              data-current={current ? 'true' : 'false'}
              className={`rounded-full border px-3 py-1 transition-all duration-200 ${
                current
                  ? 'border-[var(--nexus-color-brand)] bg-[var(--nexus-color-brand)] font-semibold text-[var(--nexus-color-accent-fg)] shadow-[0_0_18px_rgb(91_108_255/0.35)]'
                  : 'border-[var(--nexus-color-border-subtle)] text-fg-2 hover:border-[var(--nexus-color-brand)] hover:text-fg-1'
              }`}
            >
              {TYPE_LABELS[t]}
            </Link>
          );
        })}
      </nav>

      <section className="flex flex-col gap-2" data-marketplace-list>
        <h2 className="font-mono text-11 uppercase tracking-[0.18em] text-[var(--nexus-color-accent-2-ink)]">在售 · {items.length}</h2>
        {items.length === 0 ? (
          <div
            className="flex flex-col items-start gap-3 rounded-2xl border border-[var(--nexus-color-border-subtle)] bg-gradient-to-br from-bg-1 via-bg-2 to-bg-1 p-8"
            data-marketplace-empty
          >
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--nexus-color-brand)]/40 bg-gradient-to-br from-[var(--nexus-color-brand)]/20 via-bg-2 to-[var(--nexus-color-accent-2)]/20 text-[var(--nexus-color-accent-2-ink)]">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 6h15l-1.5 9a2 2 0 0 1-2 1.7H9a2 2 0 0 1-2-1.7L5 5H3m5 17a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0m8 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0" />
              </svg>
            </span>
            <p className="text-15 font-semibold text-fg-1">这一格还是空的</p>
            <p className="max-w-md text-13 leading-6 text-fg-2">
              这个分类还没有创作者上架真东西。换一个分类试试，或者——你自己可以是第一个。
            </p>
            <Link
              href="/discover"
              className="mt-1 inline-flex min-h-10 items-center rounded-lg bg-[var(--nexus-color-brand)] px-4 py-2 text-13 font-semibold text-[var(--nexus-color-accent-fg)] transition-shadow hover:shadow-[0_0_24px_rgb(91_108_255/0.45)]"
            >
              去看看公开作品 →
            </Link>
          </div>
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
                signedIn={Boolean(user)}
                alreadyReported={reportedIds.has(item.id)}
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
              <h2 className="font-mono text-11 uppercase tracking-[0.18em] text-[var(--nexus-color-accent-2-ink)]">我的物品 · {mine.length}</h2>
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
                    signedIn={Boolean(user)}
                    alreadyReported={reportedIds.has(item.id)}
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
          上架与举报需要先登录（顶栏「账号」）。
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
