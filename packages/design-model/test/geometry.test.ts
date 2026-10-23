import { describe, expect, it } from 'vitest';
import { createEmptyDocument, frameNode, pageNode, rectNode, type AutoLayout, type DesignDocument, type DesignNode } from '../src/index.js';
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

// v426 — `layoutPage` is the ONE number all three renderers read, and the bytes it is handed are not
// always the type it declares: a published document is JSON a client POSTed, a local snapshot is a file
// read back off disk. Measured on HEAD before this block existed: one authored `x: "40"` came out as
// `left:040px` in the artifact, `x="0"` in the SVG card and `moveTo("0400", …)` on the canvas — and
// concatenated itself down a whole subtree on the way (`kid` at x=5 became "0405"). So: four finite
// numbers or NO RECT AT ALL, which is the only answer the three renderers already share.
describe('layoutPage refuses geometry that is not a number (M7 v426)', () => {
  /** Geometry written AFTER the factory built it — the op path would refuse to author these bytes. */
  function raw(node: DesignNode, geom: Record<string, unknown>): DesignNode {
    Object.assign(node as unknown as Record<string, unknown>, geom);
    return node;
  }

  function docOnPage(all: DesignNode[], pageGeom: Record<string, unknown> = {}): DesignDocument {
    const doc = createEmptyDocument('G');
    const page = raw(pageNode('P', { id: 'pg', parentId: doc.rootId, width: 1440, height: 900, childIds: all.filter((n) => n.parentId === 'pg').map((n) => n.id) }), pageGeom);
    const nodes: Record<string, DesignNode> = { [doc.rootId]: doc.nodes[doc.rootId]!, pg: page };
    for (const n of all) nodes[n.id] = n;
    (nodes[doc.rootId] as unknown as { pageIds: string[] }).pageIds = ['pg'];
    return { ...doc, nodes, activePageId: 'pg' };
  }

  /** A rect on the page (id = parentId by default) with whatever geometry the bytes brought. */
  const rect = (id: string, geom: Record<string, unknown>): DesignNode => raw(rectNode(id, { id, parentId: 'pg', x: 0, y: 0, width: 10, height: 10 }), geom);

  /** The whole claim in one sentence: whatever comes out, a renderer can do arithmetic with it. */
  const allFinite = (layout: Record<string, AbsRect>) => {
    for (const r of Object.values(layout)) {
      for (const v of [r.x, r.y, r.width, r.height]) expect(typeof v).toBe('number');
      expect(Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.width) && Number.isFinite(r.height)).toBe(true);
    }
  };

  it('a numeric string is NOT a number: the node gets no rect, its honest sibling keeps its own', () => {
    const layout = layoutPage(docOnPage([rect('good', { x: 10, y: 20, width: 100, height: 40 }), rect('str', { x: '40' })]), 'pg');
    expect(layout['good']).toEqual({ x: 10, y: 20, width: 100, height: 40 });
    expect(layout['str']).toBeUndefined();
    expect(Object.keys(layout)).toEqual(['pg', 'good']);
  });

  it('names every non-number spelling the same way: no rect', () => {
    const spellings: Array<[string, Record<string, unknown>]> = [
      ['string-number', { x: '40' }],
      ['string-unit', { y: '20px' }],
      ['string-word', { x: 'abc' }],
      ['null', { width: null }],
      ['undefined', { height: undefined }],
      ['boolean', { x: true }],
      ['array', { x: [5] }],
      ['NaN', { x: NaN }],
      ['Infinity', { x: Infinity }],
    ];
    const kids = spellings.map(([id, geom]) => rect(id, geom));
    const layout = layoutPage(docOnPage(kids), 'pg');
    for (const [id] of spellings) expect(layout[id], `${id} must not be placed`).toBeUndefined();
    expect(Object.keys(layout)).toEqual(['pg']);
  });

  it('the subtree of an unplaceable node goes with it (no rect can be derived through a parent with none)', () => {
    const frame = raw(frameNode('F', undefined, { id: 'f', parentId: 'pg', x: 0, y: 0, width: 200, height: 200, childIds: ['k'] }), { x: '40' });
    const kid = rect('k', { x: 5, y: 5, width: 50, height: 50, parentId: 'f' });
    const doc = docOnPage([frame, kid]);
    // the omission must be the guard's doing, not a node that was never in the document
    expect(doc.nodes['k']).toBeDefined();
    const layout = layoutPage(doc, 'pg');
    expect(layout['f']).toBeUndefined();
    expect(layout['k']).toBeUndefined();
  });

  it('auto-layout owns the position, so a corrupt authored x/y does not drop the child', () => {
    const layout = { mode: 'vertical', gap: 10, padding: { top: 8, right: 0, bottom: 0, left: 4 }, primaryAxis: 'start', counterAxis: 'start' } as AutoLayout;
    const frame = frameNode('F', layout, { id: 'f', parentId: 'pg', width: 300, height: 300, childIds: ['a', 'b'] });
    const a = rect('a', { x: '999', y: null, width: 20, height: 20, parentId: 'f' });
    const b = rect('b', { width: 20, height: 30, parentId: 'f' });
    const out = layoutPage(docOnPage([frame, a, b]), 'pg');
    expect(out['a']).toEqual({ x: 4, y: 8, width: 20, height: 20 }); // its own x/y are the layout's to ignore
    expect(out['b']).toEqual({ x: 4, y: 38, width: 20, height: 30 });
    allFinite(out);
  });

  it('auto-layout: a corrupt SIZE drops only that child, and the cursor keeps its stride', () => {
    const layout = { mode: 'vertical', gap: 10, padding: { top: 0, right: 0, bottom: 0, left: 0 }, primaryAxis: 'start', counterAxis: 'start' } as AutoLayout;
    const frame = frameNode('F', layout, { id: 'f', parentId: 'pg', width: 300, height: 300, childIds: ['a', 'bad', 'c'] });
    const a = rect('a', { width: 20, height: 20, parentId: 'f' });
    const bad = rect('bad', { width: 20, height: '50', parentId: 'f' });
    const c = rect('c', { width: 20, height: 30, parentId: 'f' });
    const out = layoutPage(docOnPage([frame, a, bad, c]), 'pg');
    expect(out['a']).toEqual({ x: 0, y: 0, width: 20, height: 20 });
    expect(out['bad']).toBeUndefined();
    // one bad sibling may not poison the row: c lands where it would have with bad occupying nothing
    expect(out['c']).toEqual({ x: 0, y: 30, width: 20, height: 30 });
    allFinite(out);
  });

  it('auto-layout: a corrupt gap or padding is 0, never a cursor that stops meaning position', () => {
    const layout = { mode: 'horizontal', gap: '20', padding: { top: '8px', right: 0, bottom: 0, left: 6 }, primaryAxis: 'start', counterAxis: 'start' } as unknown as AutoLayout;
    const frame = frameNode('F', layout, { id: 'f', parentId: 'pg', width: 300, height: 300, childIds: ['a', 'b'] });
    const a = rect('a', { width: 20, height: 20, parentId: 'f' });
    const b = rect('b', { width: 20, height: 20, parentId: 'f' });
    const out = layoutPage(docOnPage([frame, a, b]), 'pg');
    expect(out['a']).toEqual({ x: 6, y: 0, width: 20, height: 20 });
    expect(out['b']).toEqual({ x: 26, y: 0, width: 20, height: 20 });
    allFinite(out);
  });

  it('auto-layout: each padding entry the cursor reads is its own witness, and right/bottom are read by nothing', () => {
    // The previous case corrupts `top` (which the horizontal cursor does read) with `left` honest, so an
    // implementation that took `pad.left` raw passed it. Each of the two terms the walk adds gets its own
    // corrupt value here, and the two entries it never reads are proven unread by producing the same layout.
    const padded = (padding: Record<string, unknown>) => {
      const layout = { mode: 'horizontal', gap: 10, padding, primaryAxis: 'start', counterAxis: 'start' } as unknown as AutoLayout;
      const frame = frameNode('F', layout, { id: 'f', parentId: 'pg', width: 300, height: 300, childIds: ['a', 'b'] });
      return layoutPage(docOnPage([frame, rect('a', { width: 20, height: 20, parentId: 'f' }), rect('b', { width: 20, height: 20, parentId: 'f' })]), 'pg');
    };
    const corrupt = padded({ top: 4, right: 'oops', bottom: null, left: '12px' });
    // 0 + "12px" is the string "012px" and 0 + undefined is NaN: either one reaches the canvas as text.
    expect(corrupt['a']).toEqual({ x: 0, y: 4, width: 20, height: 20 });
    expect(corrupt['b']).toEqual({ x: 30, y: 4, width: 20, height: 20 });
    allFinite(corrupt);
    expect(corrupt).toEqual(padded({ top: 4, right: 0, bottom: 0, left: '12px' }));
  });

  it('the page rect always exists, and a corrupt page size falls back to 0', () => {
    const doc = docOnPage([rect('a', { x: 10, y: 10, width: 50, height: 50 })], { width: '1440' });
    const out = layoutPage(doc, 'pg');
    expect(out['pg']).toEqual({ x: 0, y: 0, width: 0, height: 900 });
    // the page is not a drawing that can be skipped: the artifact's stage, the card's background and the
    // canvas clip all read it, and 0 is what "we do not know the size" looks like to all three
    expect(out['a']).toEqual({ x: 10, y: 10, width: 50, height: 50 });
    allFinite(out);
  });

  it('hitTest cannot pick what layoutPage refused', () => {
    const doc = docOnPage([rect('good', { x: 100, y: 100, width: 50, height: 50 }), rect('str', { x: '10', y: 10, width: 50, height: 50 })]);
    const layout = layoutPage(doc, 'pg');
    expect(hitTest(doc, layout, 'pg', { x: 120, y: 120 })).toBe('good');
    expect(hitTest(doc, layout, 'pg', { x: 20, y: 20 })).toBeNull();
  });

  it('a document whose geometry IS numbers lays out exactly as it always did', () => {
    const doc = makeDoc();
    expect(layoutPage(doc, 'page1')).toEqual({ page1: { x: 0, y: 0, width: 1440, height: 900 }, r1: { x: 10, y: 20, width: 50, height: 40 } });
  });
});
