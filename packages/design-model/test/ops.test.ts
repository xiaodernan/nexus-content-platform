import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  childIdList,
  createEmptyDocument,
  frameNode,
  getNode,
  invertBatch,
  ops,
  pageNode,
  rectNode,
  subtreeIds,
  type DesignDocument,
  type OpBatch,
} from '../src/index.js';

// `ops.ts` core (`applyOp`, `OpValidationError`) is exercised by validate.test.ts, but the
// inverse machinery + helpers it relies on (invertOp/invertBatch, subtreeIds, getNode, the
// applyBatch AI-lock guard) had no direct unit coverage. These pin the undo contract + the
// "AI may not touch locked nodes" rule (§9).

function makeDoc(): DesignDocument {
  const doc = createEmptyDocument('T');
  const rect1 = rectNode('R1', { id: 'rect1', parentId: 'frame1', width: 10, height: 10 });
  const rect2 = rectNode('R2', { id: 'rect2', parentId: 'frame1', width: 10, height: 10 });
  const frame1 = frameNode('F1', undefined, {
    id: 'frame1',
    parentId: 'page1',
    width: 100,
    height: 100,
    childIds: ['rect1', 'rect2'],
  });
  const page1 = pageNode('P1', { id: 'page1', parentId: doc.rootId, width: 1440, height: 900, childIds: ['frame1'] });
  const docNode = doc.nodes[doc.rootId]!;
  (docNode as { pageIds: string[] }).pageIds = ['page1'];
  doc.nodes = { [doc.rootId]: docNode, page1, frame1, rect1, rect2 };
  doc.activePageId = 'page1';
  return doc;
}

function batch(opsList: ReturnType<typeof ops.addSubtree>[], mode: 'user' | 'demo' | 'live'): OpBatch {
  return { id: 'b', ops: opsList, provenance: { mode }, timestamp: 0 };
}

describe('getNode', () => {
  const doc = makeDoc();
  it('returns the node by id or undefined', () => {
    expect(getNode(doc, 'rect1')?.id).toBe('rect1');
    expect(getNode(doc, 'ghost')).toBeUndefined();
  });
});

describe('subtreeIds', () => {
  const doc = makeDoc();
  it('returns the node and all descendants in post-order', () => {
    expect(subtreeIds(doc, 'frame1')).toEqual(['rect1', 'rect2', 'frame1']);
  });
  it('returns just the node when it is a leaf', () => {
    expect(subtreeIds(doc, 'rect1')).toEqual(['rect1']);
  });
});

describe('invertBatch round-trip', () => {
  it('addSubtree inverts to removeSubtree and round-trips exactly', () => {
    const before = makeDoc();
    const b = batch([ops.addSubtree('page1', 0, [rectNode('New', { id: 'new1', parentId: 'page1' })])], 'user');
    const after = applyBatch(before, b);
    expect(after.nodes['new1']).toBeDefined();
    const inverse = invertBatch(before, b);
    expect(inverse).toHaveLength(1);
    expect(inverse[0]!.type).toBe('removeSubtree');
    const back = applyBatch(after, { ...b, ops: inverse });
    expect(back.nodes['new1']).toBeUndefined();
  });

  it('updateNode inverts to the prior field values and round-trips', () => {
    const before = makeDoc();
    const b = batch([ops.updateNode('rect1', { name: 'Renamed', width: 99 })], 'user');
    const after = applyBatch(before, b);
    expect(after.nodes['rect1']!.name).toBe('Renamed');
    const inverse = invertBatch(before, b);
    expect(inverse[0]!.type).toBe('updateNode');
    const patch = (inverse[0] as { patch: Record<string, unknown> }).patch;
    expect(patch.name).toBe('R1');
    expect(patch.width).toBe(10);
    const back = applyBatch(after, { ...b, ops: inverse });
    expect(back.nodes['rect1']!.name).toBe('R1');
    expect(back.nodes['rect1']!.width).toBe(10);
  });

  it('reorder inverts to the prior index and round-trips', () => {
    const before = makeDoc();
    const withTwo = applyBatch(before, batch([ops.addSubtree('page1', 0, [rectNode('X', { id: 'x1', parentId: 'page1' })])], 'user'));
    expect(childIdList(withTwo.nodes['page1']!)).toEqual(['x1', 'frame1']);
    const b = batch([ops.reorder('frame1', 'page1', 0)], 'user');
    const after = applyBatch(withTwo, b);
    expect(childIdList(after.nodes['page1']!)).toEqual(['frame1', 'x1']);
    const inverse = invertBatch(withTwo, b);
    expect(inverse[0]!.type).toBe('reorder');
    const back = applyBatch(after, { ...b, ops: inverse });
    expect(childIdList(back.nodes['page1']!)).toEqual(['x1', 'frame1']);
  });
});

describe('applyBatch — AI lock guard (§9)', () => {
  it('refuses to modify a locked node for non-user provenance', () => {
    const doc = makeDoc();
    const lockedDoc: DesignDocument = { ...doc, nodes: { ...doc.nodes, rect1: { ...doc.nodes['rect1']!, locked: true } } };
    const b = batch([ops.updateNode('rect1', { name: 'hacked' })], 'demo');
    expect(() => applyBatch(lockedDoc, b)).toThrow();
  });
  it('allows user batches to modify locked nodes', () => {
    const doc = makeDoc();
    const lockedDoc: DesignDocument = { ...doc, nodes: { ...doc.nodes, rect1: { ...doc.nodes['rect1']!, locked: true } } };
    const b = batch([ops.updateNode('rect1', { name: 'ok' })], 'user');
    expect(() => applyBatch(lockedDoc, b)).not.toThrow();
    expect(applyBatch(lockedDoc, b).nodes['rect1']!.name).toBe('ok');
  });
});
