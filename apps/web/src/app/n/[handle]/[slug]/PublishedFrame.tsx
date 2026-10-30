import type { Page as DesignPage, ResolvedLayout, TokenStore } from '@nexus/design-model';
import type { AssetUrlContext } from '@/studio/assets';
import { nodeStyle } from '@/studio/render';
import { stateStyleSheetFor } from '@/studio/state-styles';
import { InteractiveHotspots, type Hotspot } from './InteractiveSurface';

/**
 * 公开页的**一份投影**：按某一档断点解出来的画框 + 热点。
 *
 * 抽出来是因为自动选档（§85 第三十一片）要同时铺四份——四份必须长得一模一样，
 * 只有 layout 不同；两处手抄的话，"热点在缩放盒里还是外面"这种细节迟早漂开。
 */
export function PublishedFrame({
  layout,
  page,
  tokens,
  mode,
  assets,
  zoom,
  hotspots,
  publicationPath,
  keepParams,
}: {
  layout: ResolvedLayout;
  page: DesignPage;
  tokens: TokenStore;
  mode: string | null;
  assets: AssetUrlContext;
  zoom: number;
  hotspots: Hotspot[];
  publicationPath: string;
  keepParams: Record<string, string>;
}) {
  const stateSheet = stateStyleSheetFor(
    layout.paintOrder.map((id) => layout.nodes[id]).filter((node): node is NonNullable<typeof node> => Boolean(node)),
    { tokens, mode, assets },
  );
  return (
    <div
      data-published-scale-box
      style={{ width: layout.width * zoom, height: layout.height * zoom, margin: '0 auto' }}
    >
      <div
        data-published-frame
        data-published-frame-width={layout.width}
        style={{
          position: 'relative',
          width: layout.width,
          height: layout.height,
          transform: zoom === 1 ? undefined : `scale(${zoom})`,
          transformOrigin: 'top left',
          background: typeof page.backgroundColor === 'string' ? page.backgroundColor : undefined,
          boxShadow: '0 0 0 1px var(--nexus-color-border-subtle)',
        }}
      >
        {stateSheet ? <style data-nexus-states>{stateSheet}</style> : null}
        {layout.paintOrder.map((id) => {
          const resolved = layout.nodes[id];
          if (!resolved) return null;
          return (
            <div key={id} data-node-id={id} data-node-type={resolved.node.type} style={nodeStyle(resolved, { tokens, mode, assets })}>
              {resolved.node.text ?? null}
            </div>
          );
        })}
        <InteractiveHotspots path={publicationPath} hotspots={hotspots} keepParams={keepParams} />
      </div>
    </div>
  );
}
