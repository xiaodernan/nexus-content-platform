import { notFound } from 'next/navigation';
import { TokenStore, findPage, resolveLayout, type BreakpointName, type DesignDocument } from '@nexus/design-model';
import { requireUser } from '@/server/domain/session';
import { loadDocument, projectBelongsTo } from '@/server/domain/projects';
import { apiAssetUrl, assetContextFor } from '@/studio/assets';
import { nodeStyle } from '@/studio/render';

export const dynamic = 'force-dynamic';

const VIEWPORTS: Record<string, BreakpointName> = {
  mobile: 'mobile',
  tablet: 'tablet',
  desktop: 'desktop',
  wide: 'wide',
};

interface Props {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ page?: string; viewport?: string; zoom?: string }>;
}

/** §Preview：模型的只读投影 —— 没有选择框、没有编辑控件，与画布共用同一套几何求解 */
export default async function PreviewPage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const query = await searchParams;
  const user = await requireUser();
  if (!(await projectBelongsTo(projectId, user.id))) notFound();
  const document = (await loadDocument(projectId)) as DesignDocument | null;
  if (!document) notFound();

  const page = (query.page ? findPage(document, query.page) : null) ?? findPage(document, document.activePageId) ?? document.pages[0];
  if (!page) notFound();
  const breakpoint = VIEWPORTS[query.viewport ?? ''] ?? null;
  const tokens = new TokenStore(document.tokens);
  const layout = resolveLayout(page, { tokens, mode: document.activeMode ?? null, breakpoint: breakpoint ?? undefined });
  const zoom = Math.min(1, Math.max(0.25, Number(query.zoom ?? 1) || 1));
  // 预览是同源的鉴权场景：图走作者自己的资产路由（§38）
  const assets = assetContextFor(document, apiAssetUrl);

  return (
    <main className="min-h-screen w-full overflow-auto bg-bg-0 pb-[var(--nexus-space-10)]" data-preview-root data-page={page.name}>
      <header className="sticky top-0 z-10 flex items-center gap-[var(--nexus-space-3)] border-b border-[var(--nexus-color-border-subtle)] bg-bg-1/95 px-[var(--nexus-space-4)] py-[var(--nexus-space-2)] backdrop-blur">
        <a href={`/studio/${projectId}`} className="text-13 text-fg-2 underline decoration-dotted">
          回到 Studio
        </a>
        <span className="font-mono text-12 text-fg-3">
          {document.name} · {page.name} · {layout.width}×{layout.height}
          {breakpoint ? ` · ${breakpoint}` : ''}
        </span>
      </header>
      <div className="flex justify-center p-[var(--nexus-space-6)]">
        <div
          data-preview-frame
          style={{
            position: 'relative',
            width: layout.width,
            height: layout.height,
            transform: zoom === 1 ? undefined : `scale(${zoom})`,
            transformOrigin: 'top center',
            background: typeof page.backgroundColor === 'string' ? page.backgroundColor : 'transparent',
            boxShadow: '0 0 0 1px var(--nexus-color-border-subtle)',
          }}
        >
          {layout.paintOrder.map((id) => {
            const resolved = layout.nodes[id];
            if (!resolved) return null;
            return (
              <div key={id} data-node-id={id} data-node-type={resolved.node.type} style={nodeStyle(resolved, { tokens, mode: document.activeMode ?? null, assets })}>
                {resolved.node.text ?? null}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
