import type { AbsRect } from '@nexus/design-model';

export interface SnapResult {
  /** Delta to add to the moving selection so its nearest anchor aligns (0 when no snap). */
  dx: number;
  dy: number;
  /** Guide lines to render, in page-space, for the axis that snapped. */
  xs: number[];
  ys: number[];
}

function unionRect(rects: AbsRect[]): AbsRect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Left / center / right anchors on one axis of a rect. */
function xAnchors(r: AbsRect): number[] {
  return [r.x, r.x + r.width / 2, r.x + r.width];
}
function yAnchors(r: AbsRect): number[] {
  return [r.y, r.y + r.height / 2, r.y + r.height];
}

function bestOffset(anchors: number[], candidates: number[], threshold: number): { offset: number; line: number } | null {
  let best: { abs: number; offset: number; line: number } | null = null;
  for (const a of anchors) {
    for (const c of candidates) {
      const offset = c - a;
      const abs = Math.abs(offset);
      if (abs <= threshold && (!best || abs < best.abs)) best = { abs, offset, line: c };
    }
  }
  return best ? { offset: best.offset, line: best.line } : null;
}

/**
 * Snap a moving group to the nearest alignment line among page edges/centers and sibling
 * anchors, within `threshold` (page-space). Pure and side-effect free so it is unit-testable
 * without a DOM (§59 headless verification loop).
 */
export function computeSnap(moving: AbsRect[], others: AbsRect[], page: AbsRect, threshold: number): SnapResult {
  const none: SnapResult = { dx: 0, dy: 0, xs: [], ys: [] };
  const u = unionRect(moving);
  if (!u) return none;

  const candidateXs = new Set<number>([page.x, page.x + page.width / 2, page.x + page.width]);
  const candidateYs = new Set<number>([page.y, page.y + page.height / 2, page.y + page.height]);
  for (const o of others) {
    for (const x of xAnchors(o)) candidateXs.add(x);
    for (const y of yAnchors(o)) candidateYs.add(y);
  }

  const bx = bestOffset(xAnchors(u), [...candidateXs], threshold);
  const by = bestOffset(yAnchors(u), [...candidateYs], threshold);
  return {
    dx: bx?.offset ?? 0,
    dy: by?.offset ?? 0,
    xs: bx ? [bx.line] : [],
    ys: by ? [by.line] : [],
  };
}

/**
 * Snap just the dragged edge of a resize to the nearest candidate line. Returns the corrected
 * width/height delta (0 when nothing is within threshold). Lighter than full-move snapping.
 */
export function computeResizeSnap(
  axis: 'x' | 'y',
  edge: number,
  candidates: number[],
  threshold: number,
): { delta: number; line: number } | null {
  let best: { abs: number; delta: number; line: number } | null = null;
  for (const c of candidates) {
    const delta = c - edge;
    const abs = Math.abs(delta);
    if (abs <= threshold && (!best || abs < best.abs)) best = { abs, delta, line: c };
  }
  void axis;
  return best ? { delta: best.delta, line: best.line } : null;
}
