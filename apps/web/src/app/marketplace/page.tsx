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
import { MarketplacePicks } from '@/components/MarketplacePicks';
import { getLocale, type Locale } from '@/lib/i18n';

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
 *
 * 双语（2026-11-15）：getLocale() 由 RSC 透传，TYPE/VISIBILITY 标签与界面文案本地化；
 * 物品内容（title/description/creatorName）原样下发。
 */
const TYPE_LABELS: Record<Locale, Record<MarketplaceItemType, string>> = {
  zh: {
    component: '组件',
    template: '模板',
    design_system: '设计系统',
    asset: '素材',
    world: '世界',
    game: '游戏',
    character: 'AI 角色',
  },
  en: {
    component: 'Component',
    template: 'Template',
    design_system: 'Design system',
    asset: 'Asset',
    world: 'World',
    game: 'Game',
    character: 'AI character',
  },
};

const VISIBILITY_LABELS: Record<Locale, Record<string, string>> = {
  zh: {
    public: '在售',
    free: '免费',
    private: '私密',
  },
  en: {
    public: 'For sale',
    free: 'Free',
    private: 'Private',
  },
};

const COPY: Record<Locale, {
  title: string;
  subtitle: string;
  myEarnings: string;
  myPurchases: string;
  myReports: string;
  backHome: string;
  navAria: string;
  all: string;
  onSale: (n: number) => string;
  nothingOnShelf: string;
  mine: (n: number) => string;
  signinHint: string;
  downloadLimits: (limit: number) => string;
}> = {
  zh: {
    title: '创作者市场',
    subtitle: '组件 / 模板 / 设计系统 / 素材 / 世界 / 游戏 / AI 角色。列表只显示公开在售与免费的物品。',
    myEarnings: '我的收入',
    myPurchases: '我的购买',
    myReports: '我的举报',
    backHome: '回首页',
    navAria: '市场类型',
    all: '全部',
    onSale: (n) => `在售（${n}）`,
    nothingOnShelf: '还没有这一类的物品在售。',
    mine: (n) => `我的物品（${n}）`,
    signinHint: '上架与举报需要先登录（顶栏、账号）。',
    downloadLimits: (limit) => `交付已经接上了，这一格的边界是这些：下载拿到的是条目源项目的设计文档 + 代码两份（§144 导出包的形状），不含素材字节；项目没挂源项目就下不出来。“下载（N）”里的 N 是成功交付的次数——包没建成不计数，同一个人对同一个条目一小时最多拿 ${limit} 份；匿名下载免费物品不留审计（那一格记的是身份）。预览图走的市场自己的公开路由，与私有素材的取图路分开。`,
  },
  en: {
    title: 'Creator marketplace',
    subtitle: 'Components / templates / design systems / assets / worlds / games / AI characters. Only public, for-sale and free items are listed.',
    myEarnings: 'My earnings',
    myPurchases: 'My purchases',
    myReports: 'My reports',
    backHome: 'Home',
    navAria: 'Marketplace type',
    all: 'All',
    onSale: (n) => `On sale (${n})`,
    nothingOnShelf: 'No items of this type are on sale yet.',
    mine: (n) => `My items (${n})`,
    signinHint: 'Listing or reporting requires signing in first (top bar, account).',
    downloadLimits: (limit) => `Delivery is wired up; the honest boundaries are these: downloading gets you the design document + code of the item’s source project (the §144 export shape), not the asset bytes themselves; an item without a source project can’t be downloaded. The N in “Download (N)” counts successful deliveries — an unbuilt bundle is never counted; a person can take at most ${limit} of the same item per hour; anonymous downloads of free items leave no audit (that slot records identity). Preview images ride the marketplace’s own public route, split from the private-asset fetch path.`,
  },
};

export const dynamic = 'force-dynamic';

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const [{ type }, locale] = await Promise.all([searchParams, getLocale()]);
  const c = COPY[locale];
  const typeLabels = TYPE_LABELS[locale];
  const visibilityLabels = VISIBILITY_LABELS[locale];
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
    <main className="mk-pageRoot">
      <header className="mk-header">
        <div>
          <h1 className="mk-title" data-marketplace-title>{c.title}</h1>
          <p className="mk-subtitle">{c.subtitle}</p>
        </div>
        <div className="mk-actions">
          {user ? (
            <Link href="/marketplace/earnings" className="dv-searchPill" data-marketplace-earnings>
              {c.myEarnings}
            </Link>
          ) : null}
          {user ? (
            <Link href="/marketplace/purchases" className="dv-searchPill" data-marketplace-purchases>
              {c.myPurchases}
            </Link>
          ) : null}
          {user ? (
            <Link href="/marketplace/reports" className="dv-searchPill" data-marketplace-reports>
              {c.myReports}
            </Link>
          ) : null}
          <Link href="/" className="dv-searchPill" data-marketplace-back>
            {c.backHome}
          </Link>
        </div>
      </header>

      <nav className="mk-typeRow" data-marketplace-type-nav aria-label={c.navAria}>
        <Link
          href="/marketplace"
          data-marketplace-type="all"
          data-current={itemType === undefined ? 'true' : 'false'}
          className={`mk-type ${itemType === undefined ? 'mk-typeActive' : ''}`}
          aria-current={itemType === undefined ? 'page' : undefined}
        >
          {c.all}
        </Link>
        {MARKETPLACE_ITEM_TYPES.map((t) => (
          <Link
            key={t}
            href={`/marketplace?type=${t}`}
            data-marketplace-type={t}
            data-current={itemType === t ? 'true' : 'false'}
            className={`mk-type ${itemType === t ? 'mk-typeActive' : ''}`}
            aria-current={itemType === t ? 'page' : undefined}
          >
            {typeLabels[t]}
          </Link>
        ))}
      </nav>

      <section className="mk-col2" data-marketplace-list>
        <h2 className="mk-h16">{c.onSale(items.length)}</h2>
        {items.length > 0 ? (
          <MarketplacePicks
            locale={locale}
            items={items.slice(0, 3).map((item) => ({
              id: item.id,
              title: item.title,
              itemType: item.itemType,
              priceCredits: item.priceCredits,
              downloadCount: item.downloadCount,
            }))}
          />
        ) : null}
        {items.length === 0 ? (
          <div className="dv-empty" data-marketplace-empty>
            <p>{c.nothingOnShelf}</p>
          </div>
        ) : (
          <ul className="mk-grid">
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
                typeLabel={typeLabels[item.itemType] ?? item.itemType}
                visibilityLabel={visibilityLabels[item.visibility] ?? item.visibility}
                locale={locale}
              />
            ))}
          </ul>
        )}
      </section>

      {user ? (
        <section className="mk-sectionTop">
          <MarketplaceCreateForm
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
            locale={locale}
          />
          {mine.length ? (
            <div className="mk-mt4" data-marketplace-mine>
              <h2 className="mk-h16">{c.mine(mine.length)}</h2>
              <ul className="mk-mineList">
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
                    typeLabel={typeLabels[item.itemType] ?? item.itemType}
                    visibilityLabel={visibilityLabels[item.visibility] ?? item.visibility}
                    locale={locale}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : (
        <p className="mk-sectionTop mk-hint12" data-marketplace-signin-hint>
          {c.signinHint}
        </p>
      )}

      <p className="mk-hint11" data-marketplace-limits>
        {c.downloadLimits(MARKETPLACE_DOWNLOAD_LIMIT_PER_HOUR)}
      </p>
    </main>
  );
}
