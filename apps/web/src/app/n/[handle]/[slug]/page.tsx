import { notFound } from 'next/navigation';
import { TokenStore, findPage, resolveLayout } from '@nexus/design-model';
import { recordView, resolvePublishedPath } from '@/server/domain/publish';
import { nodeStyle } from '@/studio/render';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ handle: string; slug: string }>;
  searchParams: Promise<{ page?: string }>;
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
  const found = await resolvePublishedPath(`/n/${decodeURIComponent(handle)}/${decodeURIComponent(slug)}`);
  if (!found) notFound();
  const { publication, document, ownerName, projectName } = found;

  const page =
    (query.page ? findPage(document, query.page) : null) ??
    findPage(document, document.activePageId) ??
    document.pages[0];
  if (!page) notFound();

  const tokens = new TokenStore(document.tokens);
  const mode = document.activeMode ?? null;
  const layout = resolveLayout(page, { tokens, mode });
  await recordView(publication.id).catch(() => undefined);

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
        <span className="ml-auto font-mono text-11 text-fg-3">Built with NEXUS</span>
      </header>
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
              <div key={id} data-node-id={id} data-node-type={resolved.node.type} style={nodeStyle(resolved, { tokens, mode })}>
                {resolved.node.text ?? null}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
