import { describe, expect, it } from 'vitest';
import { createEmptyDocument, History, ops, rectNode, type DesignDocument, type OpBatch } from '../src/index.js';

// `history.ts` (the undo/redo `History` class, ADR 0006) had no direct unit coverage before
// this file. These tests pin the stack semantics the editor's undo/redo and the Snapshots
// panel (§35) rely on.

let counter = 0;
function batch(opsList: ReturnType<typeof ops.addSubtree>[], mode: 'user' | 'demo' | 'live', summary?: string): OpBatch {
  return {
    id: `b${++counter}`,
    ops: opsList,
    provenance: { mode },
    timestamp: Date.now(),
    ...(summary ? { summary } : {}),
  };
}

function freshDoc(): { doc: DesignDocument; pageId: string } {
  const doc = createEmptyDocument('T');
  return { doc, pageId: doc.activePageId };
}

describe('History — dispatch', () => {
  it('applies a batch to current and opens the undo stack', () => {
    const { doc, pageId } = freshDoc();
    const h = new History(doc);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.depth).toBe(0);

    const after = h.dispatch(batch([ops.addSubtree(pageId, 0, [rectNode('R', { id: 'r1', parentId: pageId, width: 10, height: 10 })])], 'user'));
    expect(after.nodes['r1']).toBeDefined();
    expect(after.nodes['r1']!.parentId).toBe(pageId);
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);
    expect(h.depth).toBe(1);
  });

  it('is a no-op for an empty batch (no history entry)', () => {
    const { doc } = freshDoc();
    const h = new History(doc);
    const same = h.dispatch(batch([], 'user'));
    expect(same).toBe(doc);
    expect(h.canUndo).toBe(false);
    expect(h.depth).toBe(0);
  });
});

describe('History — undo / redo', () => {
  it('undo restores the before document; redo re-applies', () => {
    const { doc, pageId } = freshDoc();
    const h = new History(doc);
    h.dispatch(batch([ops.addSubtree(pageId, 0, [rectNode('R', { id: 'r1', parentId: pageId, width: 10, height: 10 })])], 'user'));

    const undone = h.undo();
    expect(undone!.nodes['r1']).toBeUndefined();
    expect(h.current.nodes['r1']).toBeUndefined();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);
    expect(h.depth).toBe(0);

    const redone = h.redo();
    expect(redone!.nodes['r1']).toBeDefined();
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);
  });

  it('undo/redo on an empty stack return null and leave current untouched', () => {
    const { doc } = freshDoc();
    const h = new History(doc);
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
    expect(h.current).toBe(doc);
  });

  it('a new dispatch clears the redo stack', () => {
    const { doc, pageId } = freshDoc();
    const h = new History(doc);
    h.dispatch(batch([ops.addSubtree(pageId, 0, [rectNode('A', { id: 'r1', parentId: pageId })])], 'user'));
    h.undo();
    expect(h.canRedo).toBe(true);

    h.dispatch(batch([ops.addSubtree(pageId, 0, [rectNode('B', { id: 'r2', parentId: pageId })])], 'user'));
    expect(h.canRedo).toBe(false);
    expect(h.depth).toBe(1);
    expect(h.current.nodes['r1']).toBeUndefined(); // undone entry is gone after the new action
    expect(h.current.nodes['r2']).toBeDefined();
  });

  it('reverts a property edit via the captured inverse (updateNode)', () => {
    const { doc, pageId } = freshDoc();
    const h = new History(doc);
    h.dispatch(batch([ops.addSubtree(pageId, 0, [rectNode('R', { id: 'r1', parentId: pageId, width: 10, height: 10 })])], 'user'));
    h.dispatch(batch([ops.updateNode('r1', { name: 'Renamed', width: 99 })], 'user'));
    expect(h.current.nodes['r1']!.name).toBe('Renamed');
    expect(h.current.nodes['r1']!.width).toBe(99);

    h.undo();
    expect(h.current.nodes['r1']!.name).toBe('R');
    expect(h.current.nodes['r1']!.width).toBe(10);
  });
});

describe('History — depth / multi-step', () => {
  it('tracks multiple entries and walks back and forth', () => {
    const { doc, pageId } = freshDoc();
    const h = new History(doc);
    for (const id of ['r1', 'r2', 'r3']) {
      h.dispatch(batch([ops.addSubtree(pageId, 0, [rectNode(id, { id, parentId: pageId })])], 'user'));
    }
    expect(h.depth).toBe(3);
    expect(Object.keys(h.current.nodes).filter((k) => k.startsWith('r'))).toHaveLength(3);

    h.undo();
    expect(h.depth).toBe(2);
    expect(h.current.nodes['r3']).toBeUndefined();
    h.undo();
    expect(h.depth).toBe(1);
    expect(h.current.nodes['r2']).toBeUndefined();

    h.redo();
    expect(h.depth).toBe(2);
    expect(h.current.nodes['r2']).toBeDefined();
  });

  it('caps the past stack at the constructor limit (oldest entry dropped, but its effect stays)', () => {
    const { doc, pageId } = freshDoc();
    const h = new History(doc, 2);
    for (const id of ['r1', 'r2', 'r3']) {
      h.dispatch(batch([ops.addSubtree(pageId, 0, [rectNode(id, { id, parentId: pageId })])], 'user'));
    }
    expect(h.depth).toBe(2); // limit reached
    const u1 = h.undo();
    expect(u1!.nodes['r3']).toBeUndefined(); // most recent undone first
    expect(u1!.nodes['r2']).toBeDefined();
    expect(u1!.nodes['r1']).toBeDefined(); // the dropped oldest entry can't be undone, but its effect stays
    const u2 = h.undo();
    expect(u2!.nodes['r2']).toBeUndefined();
    expect(u2!.nodes['r1']).toBeDefined(); // cannot rewind past the dropped entry
    expect(h.undo()).toBeNull(); // stack now empty
  });
});

describe('History — snapshots()', () => {
  it('reports one entry per past action with summary + provenance', () => {
    const { doc, pageId } = freshDoc();
    const h = new History(doc);
    h.dispatch(batch([ops.addSubtree(pageId, 0, [rectNode('A', { id: 'r1', parentId: pageId })])], 'user', 'Add A'));
    h.dispatch(batch([ops.addSubtree(pageId, 0, [rectNode('B', { id: 'r2', parentId: pageId })])], 'demo', 'Add B'));
    const snaps = h.snapshots();
    expect(snaps).toHaveLength(2);
    expect(snaps[0]).toEqual({ index: 0, summary: 'Add A', provenance: 'user' });
    expect(snaps[1]).toEqual({ index: 1, summary: 'Add B', provenance: 'demo' });
  });
});
