import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  createEmptyDocument,
  diffFromBatch,
  ellipseNode,
  frameNode,
  History,
  hitTest,
  layoutPage,
  ops,
  rectNode,
  resolveToken,
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
