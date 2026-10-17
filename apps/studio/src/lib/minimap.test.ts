import { describe, expect, it } from 'vitest';
import type { AbsRect } from '@nexus/design-model';
import { fitPage, intersectRects, projectRect, unprojectPoint, viewportCenteredAt, viewportWorldRect } from './minimap';

const page: AbsRect = { x: 0, y: 0, width: 800, height: 600 };
const box = { width: 200, height: 160 };

describe('minimap: fitPage', () => {
  it('scales the page to fit the padded box, touching it on the constrained axis', () => {
    const t = fitPage(page, box, 8);
    expect(t.scale).toBeCloseTo(Math.min((200 - 16) / 800, (160 - 16) / 600), 10);
    const p = projectRect(t, page);
    // fully inside the box, one axis exactly fills the padded width (800*0.23=184 > 600*0.24→height binds? check both)
    expect(p.x).toBeGreaterThanOrEqual(8 - 1e-9);
    expect(p.y).toBeGreaterThanOrEqual(8 - 1e-9);
    expect(p.x + p.width).toBeLessThanOrEqual(200 - 8 + 1e-9);
    expect(p.y + p.height).toBeLessThanOrEqual(160 - 8 + 1e-9);
    const fillsX = Math.abs(p.width - (200 - 16)) < 1e-6;
    const fillsY = Math.abs(p.height - (160 - 16)) < 1e-6;
    expect(fillsX || fillsY).toBe(true);
  });

  it('centres the page in the leftover space', () => {
    const t = fitPage(page, box, 8);
    const p = projectRect(t, page);
    // equal slack on both axes
    expect(p.x - 8).toBeCloseTo((200 - 16 - p.width) / 2, 6);
    expect(p.y - 8).toBeCloseTo((160 - 16 - p.height) / 2, 6);
  });

  it('handles an off-origin page (negative authored coords)', () => {
    const shifted: AbsRect = { x: -100, y: -50, width: 800, height: 600 };
    const t = fitPage(shifted, box, 8);
    const p = projectRect(t, shifted);
    expect(p.x).toBeGreaterThanOrEqual(8 - 1e-9);
    expect(p.y).toBeGreaterThanOrEqual(8 - 1e-9);
  });
});

describe('minimap: projection round-trip', () => {
  it('unprojectPoint inverts the transform at rect centres', () => {
    const t = fitPage(page, box, 8);
    const node: AbsRect = { x: 120, y: 40, width: 200, height: 100 };
    const mm = projectRect(t, node);
    const back = unprojectPoint(t, { x: mm.x + mm.width / 2, y: mm.y + mm.height / 2 });
    expect(back.x).toBeCloseTo(node.x + node.width / 2, 8);
    expect(back.y).toBeCloseTo(node.y + node.height / 2, 8);
  });
});

describe('minimap: viewport maths', () => {
  it('maps the visible screen back to world space', () => {
    const v = { x: 100, y: 50, zoom: 2 };
    expect(viewportWorldRect(v, 800, 600)).toEqual({ x: -50, y: -25, width: 400, height: 300 });
  });

  it('clips a viewport larger than the page to the intersection', () => {
    const clipped = intersectRects(page, { x: -100, y: 700, width: 400, height: 300 });
    expect(clipped).toBeNull(); // no overlap at all
    const partial = intersectRects(page, { x: 600, y: 500, width: 400, height: 300 });
    expect(partial).toEqual({ x: 600, y: 500, width: 200, height: 100 });
  });

  it('viewportCenteredAt re-centres without changing zoom', () => {
    const next = viewportCenteredAt({ x: 0, y: 0, zoom: 1 }, { x: 400, y: 300 }, 800, 600);
    expect(next).toEqual({ zoom: 1, x: 0, y: 0 });
    const vr = viewportWorldRect(next, 800, 600);
    expect(vr.x + vr.width / 2).toBeCloseTo(400, 8);
    expect(vr.y + vr.height / 2).toBeCloseTo(300, 8);
    const zoomed = viewportCenteredAt({ x: 0, y: 0, zoom: 2 }, { x: 100, y: 100 }, 800, 600);
    expect(zoomed.zoom).toBe(2);
    expect(zoomed.x).toBe(400 - 200);
  });
});

describe('minimap: degenerate inputs', () => {
  it('survives a zero-size page without dividing by zero', () => {
    const t = fitPage({ x: 0, y: 0, width: 0, height: 0 }, box, 8);
    expect(Number.isFinite(t.scale)).toBe(true);
    expect(t.scale).toBeGreaterThan(0);
    const p = projectRect(t, { x: 0, y: 0, width: 0, height: 0 });
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });

  it('treats rects that only touch at an edge as no intersection', () => {
    expect(intersectRects(page, { x: 800, y: 0, width: 100, height: 100 })).toBeNull();
    expect(intersectRects(page, { x: 0, y: 600, width: 100, height: 100 })).toBeNull();
  });

  it('unproject inverts projectRect at rect corners too', () => {
    const t = fitPage(page, box, 8);
    const corner = projectRect(t, { x: 10, y: 20, width: 0, height: 0 });
    const back = unprojectPoint(t, { x: corner.x, y: corner.y });
    expect(back.x).toBeCloseTo(10, 8);
    expect(back.y).toBeCloseTo(20, 8);
  });
});
