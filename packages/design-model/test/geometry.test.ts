import { describe, expect, it } from 'vitest';
import { createEmptyDocument, pageNode, rectNode, type DesignDocument } from '../src/index.js';
import {
  boundsOfSubtree,
  containsRotated,
  hitTest,
  layoutPage,
  rigidRotateRect,
  rotatePointAbout,
  type AbsRect,
} from '../src/geometry.js';

// `geometry.ts` was only *incidentally* covered (via design-model.test.ts / instances.test.ts).
// `containsRotated` and `boundsOfSubtree` had no direct test at all; this file pins the
// rotation-aware hit-testing + selection-bounds contracts the canvas relies on.

function makeDoc(): DesignDocument {
  const doc = createEmptyDocument('T');
  const rect = rectNode('R', { id: 'r1', parentId: 'page1', x: 10, y: 20, width: 50, height: 40 });
  const page1 = pageNode('Page 1', { id: 'page1', parentId: doc.rootId, width: 1440, height: 900, childIds: ['r1'] });
  const docNode = doc.nodes[doc.rootId]!;
  (docNode as { pageIds: string[] }).pageIds = ['page1'];
  doc.nodes = { [doc.rootId]: docNode, page1, r1: rect };
  doc.activePageId = 'page1';
  return doc;
}

describe('containsRotated', () => {
  const r: AbsRect = { x: 0, y: 0, width: 20, height: 10 };
  it('with 0° equals the axis-aligned test', () => {
    expect(containsRotated(r, 0, { x: 5, y: 5 })).toBe(true);
    expect(containsRotated(r, 0, { x: 21, y: 5 })).toBe(false);
  });
  it('honors rotation: a point inside the rotated frame but outside the AABB', () => {
    // rect 20×10 centred at (10,5); rotated 90° it spans x∈[5,15], y∈[-5,15].
    expect(containsRotated(r, 90, { x: 10, y: 13 })).toBe(true);
    expect(containsRotated({ x: 0, y: 0, width: 20, height: 10 }, 0, { x: 10, y: 13 })).toBe(false);
  });
});

describe('rotatePointAbout', () => {
  it('is identity at 0°', () => {
    expect(rotatePointAbout({ x: 3, y: 7 }, { x: 1, y: 1 }, 0)).toEqual({ x: 3, y: 7 });
  });
  it('turns clockwise in y-down screen space', () => {
    const q = rotatePointAbout({ x: 1, y: 0 }, { x: 0, y: 0 }, 90);
    expect(q.x).toBeCloseTo(0, 10);
    expect(q.y).toBeCloseTo(1, 10);
  });
  it('flips through 180° about an arbitrary pivot', () => {
    const p = rotatePointAbout({ x: 3, y: 5 }, { x: 1, y: 1 }, 180);
    expect(p.x).toBeCloseTo(-1, 10);
    expect(p.y).toBeCloseTo(-3, 10);
  });
});

describe('rigidRotateRect', () => {
  const r: AbsRect = { x: 0, y: 0, width: 20, height: 10 };
  it('is the same rect at 0°', () => {
    expect(rigidRotateRect(r, { x: 10, y: 5 }, 0)).toEqual(r);
  });
  it('keeps its size and moves the centre when rotated about a non-centre pivot', () => {
    // rect 20×10 centred at (10,5); rotated 90° about the origin the centre lands at (-5,10),
    // so the AABB (same 20×10 size) sits at x=-15, y=5.
    const moved = rigidRotateRect(r, { x: 0, y: 0 }, 90);
    expect(moved.width).toBe(20);
    expect(moved.height).toBe(10);
    expect(moved.x).toBeCloseTo(-15, 10);
    expect(moved.y).toBeCloseTo(5, 10);
  });
});

describe('boundsOfSubtree', () => {
  const layout: Record<string, AbsRect> = {
    a: { x: 0, y: 0, width: 10, height: 10 },
    b: { x: 10, y: 0, width: 10, height: 10 },
  };
  it('returns the union of the given ids', () => {
    expect(boundsOfSubtree(layout, ['a', 'b'])).toEqual({ x: 0, y: 0, width: 20, height: 10 });
  });
  it('returns a single rect unchanged', () => {
    expect(boundsOfSubtree(layout, ['a'])).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });
  it('ignores ids absent from the layout', () => {
    expect(boundsOfSubtree(layout, ['a', 'ghost'])).toEqual(layout.a);
  });
  it('returns null when no listed id resolves', () => {
    expect(boundsOfSubtree(layout, ['ghost'])).toBeNull();
  });
});

describe('layoutPage + hitTest (regression over the project geometry)', () => {
  it('resolves authored positions and hit-tests the topmost node', () => {
    const doc = makeDoc();
    const layout = layoutPage(doc, 'page1');
    expect(layout['r1']).toEqual({ x: 10, y: 20, width: 50, height: 40 });
    expect(hitTest(doc, layout, 'page1', { x: 35, y: 40 })).toBe('r1');
    expect(hitTest(doc, layout, 'page1', { x: 5, y: 5 })).toBeNull();
  });
  it('hit-test is rotation-aware (point outside the AABB but inside the rotated frame)', () => {
    const doc = makeDoc();
    (doc.nodes['r1'] as { rotation: number }).rotation = 90;
    const layout = layoutPage(doc, 'page1');
    // AABB is the unrotated 50×40 at (10,20); the rotated frame admits (35,63) but not (35,10).
    expect(hitTest(doc, layout, 'page1', { x: 35, y: 63 })).toBe('r1');
    expect(hitTest(doc, layout, 'page1', { x: 35, y: 10 })).toBeNull();
  });
});
