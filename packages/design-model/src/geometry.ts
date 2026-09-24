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
 *
 * Robustness: the walk is cycle-safe and visit-once. `ops` validation already rejects
 * cyclic documents, but `layoutPage` is also fed persisted/deserialised state, so a
 * corrupt snapshot must degrade rather than blow the stack or hang the render loop.
 * First placement wins for a node reachable by more than one path.
 */
export function layoutPage(doc: DesignDocument, pageId: NexusId): Record<NexusId, AbsRect> {
  const out: Record<NexusId, AbsRect> = {};
  const page = doc.nodes[pageId];
  if (!page) return out;
  out[pageId] = { x: 0, y: 0, width: page.width, height: page.height };
  placeChildren(doc, page, { x: 0, y: 0 }, out, new Set([pageId]));
  return out;
}

function placeChildren(
  doc: DesignDocument,
  container: DesignNode,
  origin: Point,
  out: Record<NexusId, AbsRect>,
  visited: Set<NexusId>,
): void {
  const kids = childIdList(container)
    .map((id) => doc.nodes[id])
    .filter((k): k is DesignNode => Boolean(k) && k!.visible && !visited.has(k!.id));
  const layout = (container as ContainerNode).layout;

  if (layout) {
    const pad = layout.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
    let cx = origin.x + pad.left;
    let cy = origin.y + pad.top;
    const horizontal = layout.mode === 'horizontal' || layout.mode === 'wrap';
    for (const k of kids) {
      const rect: AbsRect = { x: cx, y: cy, width: k.width, height: k.height };
      out[k.id] = rect;
      visited.add(k.id);
      placeChildren(doc, k, { x: cx, y: cy }, out, visited);
      if (horizontal) cx += k.width + layout.gap;
      else cy += k.height + layout.gap;
    }
  } else {
    for (const k of kids) {
      const rect: AbsRect = { x: origin.x + k.x, y: origin.y + k.y, width: k.width, height: k.height };
      out[k.id] = rect;
      visited.add(k.id);
      placeChildren(doc, k, { x: rect.x, y: rect.y }, out, visited);
    }
  }
}

function contains(r: AbsRect | Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/**
 * Hit test honoring the node's authored `rotation` (degrees, clockwise y-down — the same
 * convention the canvas renderer turns nodes about their own centre). The point is
 * inverse-rotated into the node's local frame, then the axis-aligned test applies.
 * `layoutPage` still emits the unrotated AABB; only picking is rotation-aware (ADR 0005).
 */
export function containsRotated(r: AbsRect, rotationDeg: number, p: Point): boolean {
  if (!rotationDeg) return contains(r, p);
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const rad = (rotationDeg * Math.PI) / 180;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const lx = cos * dx + sin * dy;
  const ly = -sin * dx + cos * dy;
  return Math.abs(lx) <= r.width / 2 && Math.abs(ly) <= r.height / 2;
}

/** Rotate a point clockwise (y-down screen convention) about a pivot by `deg` degrees. */
export function rotatePointAbout(p: Point, pivot: Point, deg: number): Point {
  if (!deg) return { x: p.x, y: p.y };
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  return { x: pivot.x + cos * dx - sin * dy, y: pivot.y + sin * dx + cos * dy };
}

/**
 * Rigid one-node step of a subtree rotation: keep the node's own size, move its centre on a
 * circle around `pivot`, so the returned rect is where its AABB must sit once the whole group
 * has been turned by `deg`. A node's drawn rotation is composed separately (`rotation + deg`).
 */
export function rigidRotateRect(r: AbsRect, pivot: Point, deg: number): AbsRect {
  const c = rotatePointAbout({ x: r.x + r.width / 2, y: r.y + r.height / 2 }, pivot, deg);
  return { x: c.x - r.width / 2, y: c.y - r.height / 2, width: r.width, height: r.height };
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
    if (!r || !containsRotated(r, k.rotation ?? 0, p)) continue;
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
