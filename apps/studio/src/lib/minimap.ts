import type { AbsRect, Point } from '@nexus/design-model';
import type { Viewport } from './store';

/** world → minimap affine (uniform scale + offset), e.g. mmX = offsetX + worldX * scale. */
export interface MinimapTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Fit a page rect into a box (px), centred, keeping `pad` clear on every side. */
export function fitPage(page: AbsRect, box: { width: number; height: number }, pad = 8): MinimapTransform {
  const w = Math.max(1, box.width - 2 * pad);
  const h = Math.max(1, box.height - 2 * pad);
  const scale = Math.min(w / Math.max(1, page.width), h / Math.max(1, page.height));
  return {
    scale,
    offsetX: pad + (w - page.width * scale) / 2 - page.x * scale,
    offsetY: pad + (h - page.height * scale) / 2 - page.y * scale,
  };
}

export function projectRect(t: MinimapTransform, r: AbsRect): AbsRect {
  return { x: t.offsetX + r.x * t.scale, y: t.offsetY + r.y * t.scale, width: r.width * t.scale, height: r.height * t.scale };
}

export function unprojectPoint(t: MinimapTransform, p: Point): Point {
  return { x: (p.x - t.offsetX) / t.scale, y: (p.y - t.offsetY) / t.scale };
}

/** The world-space region the canvas viewport currently shows (canvas-local screen coords). */
export function viewportWorldRect(v: Viewport, cssW: number, cssH: number): AbsRect {
  return { x: -v.x / v.zoom, y: -v.y / v.zoom, width: cssW / v.zoom, height: cssH / v.zoom };
}

export function intersectRects(a: AbsRect, b: AbsRect): AbsRect | null {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** New viewport that keeps `center` of the world at the middle of the canvas, same zoom. */
export function viewportCenteredAt(current: Viewport, center: Point, cssW: number, cssH: number): Viewport {
  return { zoom: current.zoom, x: cssW / 2 - center.x * current.zoom, y: cssH / 2 - center.y * current.zoom };
}
