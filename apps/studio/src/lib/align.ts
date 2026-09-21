import type { AbsRect } from '@nexus/design-model';

export interface AlignItem {
  id: string;
  rect: AbsRect;
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type DistributeAxis = 'x' | 'y';

/** Per-node translation (page-space delta). Translation-invariant, so it applies correctly to
 *  nested nodes regardless of their authored (parent-relative) coordinates. */
export type Deltas = Record<string, { dx: number; dy: number }>;

export function boundsOf(items: AlignItem[]): AbsRect | null {
  if (!items.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { rect } of items) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Align every item against a reference box (the page, or the selection bounds).
 * Returns zero deltas for the axis the mode does not touch.
 */
export function computeAlign(items: AlignItem[], ref: AbsRect, mode: AlignMode): Deltas {
  const out: Deltas = {};
  for (const { id, rect } of items) {
    let dx = 0;
    let dy = 0;
    switch (mode) {
      case 'left':
        dx = ref.x - rect.x;
        break;
      case 'hcenter':
        dx = ref.x + ref.width / 2 - (rect.x + rect.width / 2);
        break;
      case 'right':
        dx = ref.x + ref.width - (rect.x + rect.width);
        break;
      case 'top':
        dy = ref.y - rect.y;
        break;
      case 'vcenter':
        dy = ref.y + ref.height / 2 - (rect.y + rect.height / 2);
        break;
      case 'bottom':
        dy = ref.y + ref.height - (rect.y + rect.height);
        break;
    }
    out[id] = { dx, dy };
  }
  return out;
}

/**
 * Equalize the gaps between consecutive items along one axis, pinning the two extremes so the
 * overall span is preserved (Figma-style "tidy up"). Requires >= 3 items; otherwise a no-op.
 */
export function computeDistribute(items: AlignItem[], axis: DistributeAxis): Deltas {
  const out: Deltas = {};
  for (const { id } of items) out[id] = { dx: 0, dy: 0 };
  if (items.length < 3) return out;

  const start = (r: AbsRect) => (axis === 'x' ? r.x : r.y);
  const end = (r: AbsRect) => (axis === 'x' ? r.x + r.width : r.y + r.height);
  const size = (r: AbsRect) => (axis === 'x' ? r.width : r.height);

  const sorted = [...items].sort((a, b) => start(a.rect) - start(b.rect));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const span = end(last.rect) - start(first.rect);
  const totalSize = sorted.reduce((acc, it) => acc + size(it.rect), 0);
  const gap = (span - totalSize) / (sorted.length - 1);

  let cursor = start(first.rect);
  for (const it of sorted) {
    const cur = start(it.rect);
    const delta = cursor - cur;
    out[it.id] = axis === 'x' ? { dx: delta, dy: 0 } : { dx: 0, dy: delta };
    cursor += size(it.rect) + gap;
  }
  return out;
}
