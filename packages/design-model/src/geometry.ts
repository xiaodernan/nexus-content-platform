import type { ContainerNode, DesignDocument, DesignNode, NexusId, Point, Rect } from './types.js';
import { childIdList } from './selectors.js';

export interface AbsRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Pure projection of authored positions + auto-layout into absolute page-space rects.
 * The Design Model stores intent (authored x/y or a `layout`); this resolves them so the
 * canvas renderer, hit-testing and live preview all agree on one geometry (ADR 0005).
 */
export function layoutPage(doc: DesignDocument, pageId: NexusId): Record<NexusId, AbsRect> {
  const out: Record<NexusId, AbsRect> = {};
  const page = doc.nodes[pageId];
  if (!page) return out;
  out[pageId] = { x: 0, y: 0, width: page.width, height: page.height };
  placeChildren(doc, page, { x: 0, y: 0 }, out);
  return out;
}

function placeChildren(doc: DesignDocument, container: DesignNode, origin: Point, out: Record<NexusId, AbsRect>): void {
  const kids = childIdList(container)
    .map((id) => doc.nodes[id])
    .filter((k): k is DesignNode => Boolean(k) && k!.visible);
  const layout = (container as ContainerNode).layout;

  if (layout) {
    const pad = layout.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
    let cx = origin.x + pad.left;
    let cy = origin.y + pad.top;
    const horizontal = layout.mode === 'horizontal' || layout.mode === 'wrap';
    for (const k of kids) {
      const rect: AbsRect = { x: cx, y: cy, width: k.width, height: k.height };
      out[k.id] = rect;
      placeChildren(doc, k, { x: cx, y: cy }, out);
      if (horizontal) cx += k.width + layout.gap;
      else cy += k.height + layout.gap;
    }
  } else {
    for (const k of kids) {
      const rect: AbsRect = { x: origin.x + k.x, y: origin.y + k.y, width: k.width, height: k.height };
      out[k.id] = rect;
      placeChildren(doc, k, { x: rect.x, y: rect.y }, out);
    }
  }
}

function contains(r: AbsRect | Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/** Topmost visible node under a page-space point. */
export function hitTest(doc: DesignDocument, layout: Record<NexusId, AbsRect>, pageId: NexusId, p: Point): NexusId | null {
  const page = doc.nodes[pageId];
  if (!page) return null;
  return hitChildren(doc, layout, page, p);
}

function hitChildren(doc: DesignDocument, layout: Record<NexusId, AbsRect>, container: DesignNode, p: Point): NexusId | null {
  const kids = childIdList(container)
    .map((id) => doc.nodes[id])
    .filter((k): k is DesignNode => Boolean(k) && k!.visible);
  // iterate top-first (last child renders on top)
  for (let i = kids.length - 1; i >= 0; i--) {
    const k = kids[i]!;
    const r = layout[k.id];
    if (!r || !contains(r, p)) continue;
    const deeper = hitChildren(doc, layout, k, p);
    return deeper ?? k.id;
  }
  return null;
}

/** Union rect of a node's subtree (for framing/selection bounds). */
export function boundsOfSubtree(layout: Record<NexusId, AbsRect>, ids: NexusId[]): AbsRect | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const id of ids) {
    const r = layout[id];
    if (!r) continue;
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
