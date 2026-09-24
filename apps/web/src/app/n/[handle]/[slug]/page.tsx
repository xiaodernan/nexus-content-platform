import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { TokenStore, findPage, resolveLayout } from '@nexus/design-model';
import { getPublishedPage, recordView } from '@/server/domain/publish';
import { buildPublishedSeo } from '@/server/domain/seo';
import { requestOrigin } from '@/lib/origin';
import { publicationState } from '@/server/domain/social';
import { currentUserOrNull } from '@/server/domain/session';
import { assetContextFor, publicAssetUrl } from '@/studio/assets';
import { nodeStyle } from '@/studio/render';
import { ReportControl } from './ReportControl';
import { PublicationActions } from './PublicationActions';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ handle: string; slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

/** 公开的 path 由数据库里那一行给出，params 只用来拼查询串（不信任URL片段本身） */
function publishedPath(handle: string, slug: string): string {
  return `/n/${decodeURIComponent(handle)}/${decodeURIComponent(slug)}`;
}

/**
 * §166：公开页的 head。抓取端多数不执行 JS，所以这些标签必须服务端出——
 * 好在 §56 这一页本来就是服务端渲染的，缺的只是标签本身。
 * unlisted 会被写成 noindex：它的语义是"只认精确链接"，不是"随便收"。
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, slug } = await params;
  const found = await getPublishedPage(publishedPath(handle, slug));
  if (!found) return {};
  const { origin } = await requestOrigin();
  return buildPublishedSeo(found, origin).metadata;
}

/**
 * §56 分享链接 `/n/<handle>/<slug>`：公开访问的是**发布那一刻的快照**，
 * 不是作者手上正在改的那一份——所以这里读 published_projects.snapshot_id，
 * 作者之后怎么改都不会把已经发出去的链接换掉。
 *
 * 不要求登录：unlisted / public 的意义就是别人点开就能看到。
 */
export default async function PublishedPage({ params, searchParams }: Props) {
  const { handle, slug } = await params;
  const query = await searchParams;
  const found = await getPublishedPage(publishedPath(handle, slug));
  if (!found) notFound();
  const { publication, document, ownerName, projectName } = found;
  // JSON-LD 与 generateMetadata 读同一份解析结果（React cache），不为爬虫再查一次库
  const { origin } = await requestOrigin();
  const seo = buildPublishedSeo(found, origin);

  const page =
    (query.page ? findPage(document, query.page) : null) ??
    findPage(document, document.activePageId) ??
    document.pages[0];
  if (!page) notFound();

  const tokens = new TokenStore(document.tokens);
  const mode = document.activeMode ?? null;
  const layout = resolveLayout(page, { tokens, mode });
  // 匿名访客的图走公共资产路由：可见性由"这一版发布确实引用了它"决定（§57）
  const assets = assetContextFor(document, (assetId) => publicAssetUrl(decodeURIComponent(handle), assetId));
  await recordView(publication.id).catch(() => undefined);
  // 访客身份只读不签发：这里用 currentUserOrNull 而不是 requireUser，
  // 否则每一个点开链接的人都会在库里造出一个 guest 用户
  const viewer = await currentUserOrNull();
  const actions = await publicationState(publication.path, viewer?.id ?? null);

  return (
    <main className="min-h-screen w-full bg-bg-0 text-fg-1" data-published-root data-published-path={publication.path}>
      <header className="flex flex-wrap items-center gap-[var(--nexus-space-3)] border-b border-[var(--nexus-color-border-subtle)] bg-bg-1 px-[var(--nexus-space-4)] py-[var(--nexus-space-2)]">
        <span className="font-mono text-13 text-fg-1" data-published-title>
          {ownerName} / {projectName}
        </span>
        <span className="font-mono text-12 text-fg-3" data-published-meta>
          第 {publication.version} 版 ·{' '}
          {publication.visibility === 'public' ? '公开' : '仅链接可见'} ·{' '}
          {new Date(publication.publishedAt).toLocaleString('zh-CN', { hour12: false })}
        </span>
        {/* §132：公开页要有人能举报，否则 §129 的红线只能靠作者自觉 */}
        <span className="ml-auto flex items-center gap-2">
          <ReportControl path={publication.path} />
          <span className="font-mono text-11 text-fg-3">Built with NEXUS</span>
        </span>
      </header>
      {actions ? (
        <div className="w-full px-[var(--nexus-space-4)] pt-[var(--nexus-space-2)]">
          <PublicationActions state={actions} />
        </div>
      ) : null}
      <div className="w-full overflow-x-auto p-[var(--nexus-space-4)]">
        <div
          data-published-frame
          style={{
            position: 'relative',
            width: layout.width,
            height: layout.height,
            margin: '0 auto',
            background: typeof page.backgroundColor === 'string' ? page.backgroundColor : undefined,
            boxShadow: '0 0 0 1px var(--nexus-color-border-subtle)',
          }}
        >
          {layout.paintOrder.map((id) => {
            const resolved = layout.nodes[id];
            if (!resolved) return null;
            return (
              <div key={id} data-node-id={id} data-node-type={resolved.node.type} style={nodeStyle(resolved, { tokens, mode, assets })}>
                {resolved.node.text ?? null}
              </div>
            );
          })}
        </div>
      </div>
      {/* §166 JSON-LD：正文已经服务端渲染，结构化数据让抓取端不用猜哪是标题哪是作者。
          字符串在 seo.ts 里把 < > & 转过义，项目名再怎么写也闭合不了这个脚本块 */}
      <script type="application/ld+json" data-seo-jsonld dangerouslySetInnerHTML={{ __html: seo.jsonLd }} />
    </main>
  );
}
