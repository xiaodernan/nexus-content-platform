import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  createEmptyDocument,
  DEFAULT_PAGE_SIZE,
  diffFromBatch,
  ellipseNode,
  frameNode,
  History,
  hitTest,
  layoutPage,
  ops,
  rectNode,
  resolveToken,
  rigidRotateRect,
  rotatePointAbout,
  solid,
  textNode,
  OpValidationError,
  type DesignDocument,
  type OpBatch,
} from '../src/index.js';

function userBatch(opsList: OpBatch['ops'], summary = 'test'): OpBatch {
  return { id: 'b', ops: opsList, provenance: { mode: 'user' }, timestamp: 0, summary };
}
function demoBatch(opsList: OpBatch['ops'], summary = 'demo'): OpBatch {
  return { id: 'b', ops: opsList, provenance: { mode: 'demo' }, timestamp: 0, summary };
}

function pageId(doc: DesignDocument): string {
  return doc.activePageId;
}

describe('design model: creation', () => {
  it('makes a valid empty document with one page', () => {
    const doc = createEmptyDocument('Test');
    expect(doc.nodes[doc.rootId]?.type).toBe('document');
    expect(doc.nodes[pageId(doc)]?.type).toBe('page');
    expect(doc.schemaVersion).toBe(1);
  });

  it('the empty page is a full canvas, not the generic 100×100 node default', () => {
    // The bug this pins: `base()` sizes every node 100×100, so a page that takes no explicit size is a
    // 100px chip. Everything that renders a page (preview, export, the published artifact) would collapse
    // the drawing into that chip while the Studio's own "+" makes 1440×900 pages.
    const doc = createEmptyDocument('Test');
    const page = doc.nodes[pageId(doc)]!;
    expect([page.width, page.height]).toEqual([DEFAULT_PAGE_SIZE.width, DEFAULT_PAGE_SIZE.height]);
    expect([page.width, page.height]).toEqual([1440, 900]);
  });
});

describe('design model: operations', () => {
  it('adds a subtree and rewires the parent', () => {
    let doc = createEmptyDocument();
    const frame = frameNode('Card');
    const r = rectNode('bg');
    r.parentId = frame.id;
    r.fills = [solid({ r: 0.1, g: 0.2, b: 0.3, a: 1 })];
    frame.childIds = [r.id];
    doc = applyBatch(doc, userBatch([ops.addSubtree(pageId(doc), 0, [frame, r])]));
    expect(doc.nodes[frame.id]).toBeTruthy();
    expect((doc.nodes[pageId(doc)] as { childIds: string[] }).childIds).toContain(frame.id);
    expect(doc.nodes[r.id]?.parentId).toBe(frame.id);
  });

  it('updateNode changes only the touched node (structural sharing)', () => {
    let doc = createEmptyDocument();
    const beforeNodeCount = Object.keys(doc.nodes).length;
    const r = rectNode('bg');
    doc = applyBatch(doc, userBatch([ops.addSubtree(pageId(doc), 0, [r])]));
    const docRefBefore = doc.nodes[pageId(doc)];
    doc = applyBatch(doc, userBatch([ops.updateNode(r.id, { width: 420 })]));
    expect(doc.nodes[r.id]?.width).toBe(420);
    // untouched page node object identity preserved
    expect(doc.nodes[pageId(doc)]).toBe(docRefBefore);
    expect(Object.keys(doc.nodes).length).toBe(beforeNodeCount + 1);
  });

  it('removeSubtree drops descendants too', () => {
    let doc = createEmptyDocument();
    const frame = frameNode('F');
    const child = ellipseNode('E');
    child.parentId = frame.id;
    frame.childIds = [child.id];
    doc = applyBatch(doc, userBatch([ops.addSubtree(pageId(doc), 0, [frame, child])]));
    doc = applyBatch(doc, userBatch([ops.removeSubtree(frame.id)]));
    expect(doc.nodes[frame.id]).toBeUndefined();
    expect(doc.nodes[child.id]).toBeUndefined();
    expect((doc.nodes[pageId(doc)] as { childIds: string[] }).childIds).not.toContain(frame.id);
  });
});

describe('design model: history (undo/redo)', () => {
  it('undo and redo round-trip an edit', () => {
    const doc0 = createEmptyDocument();
    const h = new History(doc0);
    const r = rectNode('bg');
    const afterAdd = h.dispatch(userBatch([ops.addSubtree(pageId(doc0), 0, [r])], 'add'));
    expect(afterAdd.nodes[r.id]).toBeTruthy();
    h.dispatch(userBatch([ops.updateNode(r.id, { x: 55 })], 'move'));
    expect(h.current.nodes[r.id]?.x).toBe(55);

    const undidMove = h.undo();
    expect(undidMove?.nodes[r.id]?.x).toBe(0);
    const undidAdd = h.undo();
    expect(undidAdd?.nodes[r.id]).toBeUndefined();
    // redo back to the add state then move state
    h.redo();
    const redid = h.redo();
    expect(redid?.nodes[r.id]?.x).toBe(55);
  });
});

describe('design model: AI-diff + lock guard (§36, §9)', () => {
  it('summarizes a batch', () => {
    let doc = createEmptyDocument();
    const r = rectNode('bg');
    const b1 = userBatch([ops.addSubtree(pageId(doc), 0, [r])]);
    doc = applyBatch(doc, b1);
    const b2 = userBatch([ops.updateNode(r.id, { width: 10 })]);
    const next = applyBatch(doc, b2);
    const diff = diffFromBatch(doc, next, b2);
    expect(diff.modified[0]?.id).toBe(r.id);
    expect(diff.modified[0]?.keys).toContain('width');
  });

  it('rejects an AI batch that touches a locked node', () => {
    let doc = createEmptyDocument();
    const r = rectNode('protected');
    r.locked = true;
    doc = applyBatch(doc, userBatch([ops.addSubtree(pageId(doc), 0, [r])]));
    expect(() => applyBatch(doc, demoBatch([ops.updateNode(r.id, { width: 1 })]))).toThrow(
      OpValidationError,
    );
  });

  it('allows a user batch to edit a locked node', () => {
    let doc = createEmptyDocument();
    const r = rectNode('x');
    r.locked = true;
    doc = applyBatch(doc, userBatch([ops.addSubtree(pageId(doc), 0, [r])]));
    expect(() => applyBatch(doc, userBatch([ops.updateNode(r.id, { width: 2 })]))).not.toThrow();
  });
});

describe('design model: geometry + layout', () => {
  it('auto-layouts children horizontally with gap', () => {
    let doc = createEmptyDocument();
    const frame = frameNode('Row', {
      mode: 'horizontal',
      gap: 10,
      padding: { top: 8, right: 8, bottom: 8, left: 8 },
      primaryAxis: 'start',
      counterAxis: 'start',
    });
    frame.width = 400;
    frame.height = 80;
    const a = rectNode('a'),
      b = rectNode('b');
    a.width = a.height = 20;
    b.width = b.height = 20;
    a.parentId = b.parentId = frame.id;
    frame.childIds = [a.id, b.id];
    doc = applyBatch(doc, userBatch([ops.addSubtree(pageId(doc), 0, [frame, a, b])]));
    const layout = layoutPage(doc, pageId(doc));
    expect(layout[frame.id]).toEqual({ x: 0, y: 0, width: 400, height: 80 });
    expect(layout[a.id]?.x).toBe(8);
    expect(layout[b.id]?.x).toBe(38); // 8 + 20 + 10
    expect(layout[a.id]?.y).toBe(8);
  });

  it('layoutPage is cycle-safe on a corrupt document (degrades, never hangs)', () => {
    let doc = createEmptyDocument();
    const frame = frameNode('Loop');
    frame.x = 0; frame.y = 0; frame.width = 50; frame.height = 50;
    doc = applyBatch(doc, userBatch([ops.addSubtree(pageId(doc), 0, [frame])]));
    const page = doc.nodes[pageId(doc)]! as { childIds: string[] };
    // Hand-corrupt: make the frame its own descendant via the page.
    doc.nodes[frame.id] = { ...doc.nodes[frame.id]!, childIds: [pageId(doc)] } as never;
    const layout = layoutPage(doc, pageId(doc));
    expect(layout[pageId(doc)]).toBeDefined();
    expect(layout[frame.id]).toBeDefined();
    expect(Object.keys(layout).length).toBeLessThan(10);
  });

  it('layoutPage places a node reachable twice only once (no exponential blowup)', () => {
    let doc = createEmptyDocument();
    const a = frameNode('A');
    const b = frameNode('B');
    const shared = rectNode('shared');
    shared.x = 1; shared.y = 1; shared.width = 5; shared.height = 5;
    a.childIds = [shared.id];
    b.childIds = [shared.id];
    a.parentId = b.parentId = pageId(doc);
    doc = applyBatch(doc, userBatch([ops.addSubtree(pageId(doc), 0, [a, b, shared])]));
    const layout = layoutPage(doc, pageId(doc));
    expect(layout[shared.id]).toBeDefined();
    // First placement (under A at 0,0) wins rather than being re-placed under B.
    expect(layout[shared.id]).toEqual({ x: 1, y: 1, width: 5, height: 5 });
  });

  it('hit-tests the topmost node', () => {
    let doc = createEmptyDocument();
    const bg = rectNode('bg');
    bg.x = 0; bg.y = 0; bg.width = 100; bg.height = 100;
    const fg = rectNode('fg');
    fg.x = 20; fg.y = 20; fg.width = 20; fg.height = 20;
    const page = doc.nodes[pageId(doc)]!;
    bg.parentId = fg.parentId = page.id;
    doc = applyBatch(doc, userBatch([ops.addSubtree(pageId(doc), 0, [bg])]));
    doc = applyBatch(doc, userBatch([ops.addSubtree(pageId(doc), 1, [fg])]));
    const layout = layoutPage(doc, pageId(doc));
    expect(hitTest(doc, layout, pageId(doc), { x: 25, y: 25 })).toBe(fg.id);
    expect(hitTest(doc, layout, pageId(doc), { x: 90, y: 90 })).toBe(bg.id);
    expect(hitTest(doc, layout, pageId(doc), { x: 500, y: 500 })).toBeNull();
  });

  it('hit-tests rotated nodes by their rotated shape, not the AABB', () => {
    let doc = createEmptyDocument();
    const bar = rectNode('bar');
    bar.x = 100; bar.y = 100; bar.width = 200; bar.height = 40;
    bar.rotation = 90; // stands up: occupies x∈[180,220], y∈[0,240] about centre (200,120)
    bar.parentId = pageId(doc);
    doc = applyBatch(doc, userBatch([ops.addSubtree(pageId(doc), 0, [bar])]));
    const layout = layoutPage(doc, pageId(doc));
    // layout stays the authored AABB
    expect(layout[bar.id]).toEqual({ x: 100, y: 100, width: 200, height: 40 });
    // inside the rotated shape (was outside the flat AABB)
    expect(hitTest(doc, layout, pageId(doc), { x: 200, y: 20 })).toBe(bar.id);
    // vacated AABB corner now misses
    expect(hitTest(doc, layout, pageId(doc), { x: 110, y: 105 })).toBeNull();
    // centre always hits
    expect(hitTest(doc, layout, pageId(doc), { x: 200, y: 120 })).toBe(bar.id);
  });

  it('a 0° node hit-tests exactly like the plain AABB (regression)', () => {
    let doc = createEmptyDocument();
    const r = rectNode('r');
    r.x = 0; r.y = 0; r.width = 50; r.height = 50;
    r.rotation = 0;
    r.parentId = pageId(doc);
    doc = applyBatch(doc, userBatch([ops.addSubtree(pageId(doc), 0, [r])]));
    const layout = layoutPage(doc, pageId(doc));
    expect(hitTest(doc, layout, pageId(doc), { x: 49, y: 49 })).toBe(r.id);
    expect(hitTest(doc, layout, pageId(doc), { x: 51, y: 49 })).toBeNull();
  });

  it('children of a rotated container keep their own unrotated hit region (individual rotation)', () => {
    let doc = createEmptyDocument();
    const frame = frameNode('Box');
    frame.x = 0; frame.y = 0; frame.width = 100; frame.height = 100;
    frame.rotation = 45;
    const kid = rectNode('kid');
    kid.x = 10; kid.y = 10; kid.width = 20; kid.height = 20;
    kid.parentId = frame.id;
    frame.childIds = [kid.id];
    doc = applyBatch(doc, userBatch([ops.addSubtree(pageId(doc), 0, [frame, kid])]));
    const layout = layoutPage(doc, pageId(doc));
    // a point inside the kid is also inside the rotated frame's body → kid wins (topmost)
    expect(hitTest(doc, layout, pageId(doc), { x: 20, y: 20 })).toBe(kid.id);
    // the frame's AABB corner region is chopped away by the 45° rotation
    expect(hitTest(doc, layout, pageId(doc), { x: 1, y: 1 })).toBeNull();
  });

  it('rotatePointAbout turns clockwise (y-down) and is identity at 0°', () => {
    const a = rotatePointAbout({ x: 1, y: 0 }, { x: 0, y: 0 }, 0);
    expect(a.x).toBe(1);
    expect(a.y).toBe(0);
    const q = rotatePointAbout({ x: 1, y: 0 }, { x: 0, y: 0 }, 90);
    expect(q.x).toBeCloseTo(0);
    expect(q.y).toBeCloseTo(1);
    const h = rotatePointAbout({ x: 3, y: 5 }, { x: 1, y: 1 }, 180);
    expect(h.x).toBeCloseTo(-1);
    expect(h.y).toBeCloseTo(-3);
  });

  it('rigidRotateRect keeps size and moves the centre on a circle about the pivot', () => {
    const r = { x: 0, y: 0, width: 100, height: 40 };
    const self = rigidRotateRect(r, { x: 50, y: 20 }, 90); // pivot at its own centre → (near) fixed point
    expect(self.x).toBeCloseTo(0);
    expect(self.y).toBeCloseTo(0);
    expect(self.width).toBe(100);
    expect(self.height).toBe(40);
    // centre (50,20) about origin → (−20,50) → top-left (−70,30)
    const t = rigidRotateRect(r, { x: 0, y: 0 }, 90);
    expect(t.x).toBeCloseTo(-70);
    expect(t.y).toBeCloseTo(30);
    expect(t.width).toBe(100);
    expect(t.height).toBe(40);
  });
});

describe('design model: text + tokens', () => {
  it('stores text nodes with token-bound styles', () => {
    let doc = createEmptyDocument();
    const t = textNode('Title', 'Hello', {
      fontFamilyToken: 'font.family.body',
      sizeToken: 'font.size.xl',
      weight: 700,
      lineHeight: 1.2,
      letterSpacing: 0,
      align: 'left',
    });
    doc = applyBatch(doc, userBatch([ops.addSubtree(pageId(doc), 0, [t])]));
    expect(doc.nodes[t.id]?.type).toBe('text');
    expect(resolveToken(doc.tokens, 'font.size.xl')?.$value).toBe('28px');
  });
});
