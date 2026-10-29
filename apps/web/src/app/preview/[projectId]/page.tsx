import { notFound } from 'next/navigation';
import { TokenStore, findPage, resolveLayout, type DesignDocument, type NodeState, type ResolvedNode } from '@nexus/design-model';
import { requireUser } from '@/server/domain/session';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { apiAssetUrl, assetContextFor } from '@/studio/assets';
import { nodeStyle } from '@/studio/render';
import { stateStyleSheetFor } from '@/studio/state-styles';
import { ViewerControls } from '@/studio/ViewerControls';
import { breakpointFromParam, viewerHref, zoomFromParam, type ViewerQuery } from '@/studio/viewer-params';

export const dynamic = 'force-dynamic';

/**
 * §124 / ADR-0063：只有这三种状态靠 `data-state` 属性兑现，所以只读页能演示它们。
 * hover / active / focus 是浏览器伪类，伪造属性不会触发；disabled 要真实表单控件。
 * 链接只列真能演示的三个，不假装其余状态也能在这里"预览"。
 */
const SIMULATED_STATES: NodeState[] = ['loading', 'error', 'success'];

interface Props {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<ViewerQuery>;
}

/** §Preview：模型的只读投影 —— 没有选择框、没有编辑控件，与画布共用同一套几何求解 */
export default async function PreviewPage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const query = await searchParams;
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();
  const document = (await loadDocument(projectId)) as DesignDocument | null;
  if (!document) notFound();

  const page = (query.page ? findPage(document, query.page) : null) ?? findPage(document, document.activePageId) ?? document.pages[0];
  if (!page) notFound();
  // §14 / ADR-0069：预览与公开页吃同一套参数、走同一个断点解析，
  // 这样作者在这里看到的换算就是访客在那里会看到的那个（不另起一条渲染路径）。
  const breakpoint = breakpointFromParam(query.viewport);
  const zoom = zoomFromParam(query.zoom);
  const tokens = new TokenStore(document.tokens);
  const layout = resolveLayout(page, { tokens, mode: document.activeMode ?? null, breakpoint });
  // 预览是同源的鉴权场景：图走作者自己的资产路由（§38）
  const assets = assetContextFor(document, apiAssetUrl);
  // §124 状态层只读投影（ADR-0062）：差量样式表，无状态节点时是空串
  const stateSheet = stateStyleSheetFor(
    layout.paintOrder.map((id) => layout.nodes[id]).filter((r): r is ResolvedNode => Boolean(r)),
    { tokens, mode: document.activeMode ?? null, assets },
  );
  const previewState = SIMULATED_STATES.includes(query.state as NodeState)
    ? (query.state as NodeState)
    : null;

  /** 切状态不该把当前取景框丢掉：page / viewport / zoom 原样带过去（viewerHref 的唯一键序保证 URL 稳定） */
  const stateHref = (value: NodeState | null): string =>
    viewerHref(`/preview/${projectId}`, query, { state: value ?? undefined });

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
      {stateSheet ? (
        <div
          className="flex flex-wrap items-center gap-[var(--nexus-space-2)] border-b border-[var(--nexus-color-border-subtle)] bg-bg-1/70 px-[var(--nexus-space-4)] py-[var(--nexus-space-1)] text-12"
          data-state-preview
        >
          <span className="text-fg-3">状态预览</span>
          {[null, ...SIMULATED_STATES].map((value) => (
            <a
              key={value ?? 'none'}
              href={stateHref(value)}
              data-state-preview-option={value ?? 'none'}
              className={
                previewState === value
                  ? 'rounded-[var(--nexus-radius-sm)] bg-bg-3 px-[var(--nexus-space-2)] py-0.5 text-fg-1'
                  : 'rounded-[var(--nexus-radius-sm)] px-[var(--nexus-space-2)] py-0.5 text-fg-3 hover:bg-bg-2'
              }
            >
              {value ?? '基础态'}
            </a>
          ))}
          <span className="text-fg-3" data-state-preview-note>
            {previewState
              ? `只有定义了 ${previewState} 状态的节点会变；hover / active / focus 要直接在元素上操作。`
              : 'hover / active / focus 直接在元素上操作；这里只演示靠 data-state 兑现的三种。'}
          </span>
        </div>
      ) : null}
      {/* §14 / ADR-0069：与公开页同一排控件——作者在这里看到的断点/缩放就是访客那一份 */}
      <ViewerControls base={`/preview/${projectId}`} query={query} page={page} breakpoint={breakpoint} zoom={zoom} width={layout.width} height={layout.height} />
      <div className="w-full overflow-x-auto p-[var(--nexus-space-6)]">
        {/* 缩放用 transform，版式盒不跟着缩：外面这层按缩后的尺寸占位，
            否则画面"缩小看全"了，页面仍要横向平移一整屏（第十三片量到的就是这个） */}
        <div
          data-preview-scale-box
          style={{ width: layout.width * zoom, height: layout.height * zoom, margin: '0 auto' }}
        >
          <div
            data-preview-frame
            style={{
              position: 'relative',
              width: layout.width,
              height: layout.height,
              transform: zoom === 1 ? undefined : `scale(${zoom})`,
              transformOrigin: 'top left',
              background: typeof page.backgroundColor === 'string' ? page.backgroundColor : 'transparent',
              boxShadow: '0 0 0 1px var(--nexus-color-border-subtle)',
            }}
          >
            {stateSheet ? <style data-nexus-states>{stateSheet}</style> : null}
            {layout.paintOrder.map((id) => {
              const resolved = layout.nodes[id];
              if (!resolved) return null;
              // 只给真的定义了这个状态的节点挂 data-state：别的节点不该因为页面上多一个参数就"看起来变了"
              const simulated =
                previewState && resolved.node.states?.[previewState] ? previewState : undefined;
              return (
                <div key={id} data-node-id={id} data-node-type={resolved.node.type} data-state={simulated} style={nodeStyle(resolved, { tokens, mode: document.activeMode ?? null, assets })}>
                  {resolved.node.text ?? null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
