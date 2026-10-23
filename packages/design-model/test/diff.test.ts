/**
 * Direct, branch-complete coverage for `diffFromBatch` (packages/design-model/src/diff.ts).
 *
 * design-model.test.ts asserted only ONE branch (a single updateNode → modified[0].id/keys). The
 * other five op-type branches (addSubtree/removeSubtree/reorder/reparent/setTokens), the
 * same-id multi-update MERGE, and the before/after node counts were never asserted. diffFromBatch
 * feeds the AI Diff panel (§36), so each bucket is worth locking. Per house discipline an
 * untested branch *is* the next increment.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, createEmptyDocument, defaultTokens, diffFromBatch, ops, rectNode, type DesignDocument, type OpBatch } from '../src/index.js';

function userBatch(opsList: OpBatch['ops'], summary = 'test'): OpBatch {
  return { id: 'b', ops: opsList, provenance: { mode: 'user' }, timestamp: 0, summary };
}
const pageId = (d: DesignDocument): string => d.activePageId;

describe('diffFromBatch — one bucket per op type', () => {
  it('addSubtree fills `added` with every added node id', () => {
    const before = createEmptyDocument();
    const a = rectNode('a');
    const b = rectNode('b');
    const diff = diffFromBatch(before, before, userBatch([ops.addSubtree(pageId(before), 0, [a, b])]));
    expect(diff.added).toEqual([a.id, b.id]);
    expect(diff.removed).toEqual([]);
    expect(diff.tokensChanged).toBe(false);
  });

  it('removeSubtree fills `removed`', () => {
    const d = createEmptyDocument();
    const diff = diffFromBatch(d, d, userBatch([ops.removeSubtree('n1')]));
    expect(diff.removed).toEqual(['n1']);
  });

  it('updateNode fills `modified` with id, keys and the merged patch', () => {
    const d = createEmptyDocument();
    const diff = diffFromBatch(d, d, userBatch([ops.updateNode('n1', { width: 100 })]));
    expect(diff.modified).toEqual([{ id: 'n1', keys: ['width'], patch: { width: 100 } }]);
  });

  it('MERGES repeated updateNode ops on the same id (keys unioned, patch merged)', () => {
    const d = createEmptyDocument();
    const diff = diffFromBatch(d, d, userBatch([ops.updateNode('n1', { width: 100 }), ops.updateNode('n1', { height: 50, x: 5 }), ops.updateNode('n1', { width: 999 })]));
    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0]!.id).toBe('n1');
    expect([...diff.modified[0]!.keys].sort()).toEqual(['height', 'width', 'x']);
    expect(diff.modified[0]!.patch).toEqual({ width: 999, height: 50, x: 5 }); // last write wins per key
  });

  it('reorder and reparent both land in `moved`', () => {
    const d = createEmptyDocument();
    const diff = diffFromBatch(d, d, userBatch([ops.reorder('n1', 'p1', 2), ops.reparent('n2', 'p2', 0)]));
    expect(diff.moved).toEqual(expect.arrayContaining(['n1', 'n2']));
  });

  it('setTokens flips tokensChanged', () => {
    const d = createEmptyDocument();
    const diff = diffFromBatch(d, d, userBatch([ops.setTokens(defaultTokens())]));
    expect(diff.tokensChanged).toBe(true);
  });
});

describe('diffFromBatch — counts and empties', () => {
  it('nodeCountBefore/After come from the two documents, not the batch', () => {
    const before = createEmptyDocument();
    const afterDoc = createEmptyDocument();
    const after = applyBatch(afterDoc, userBatch([ops.addSubtree(afterDoc.activePageId, 0, [rectNode('r')])]));
    const diff = diffFromBatch(before, after, userBatch([]));
    expect(diff.nodeCountBefore).toBe(Object.keys(before.nodes).length);
    expect(diff.nodeCountAfter).toBe(Object.keys(after.nodes).length);
    expect(diff.nodeCountAfter).toBeGreaterThan(diff.nodeCountBefore);
  });

  it('an empty batch yields every bucket empty and tokensChanged false', () => {
    const d = createEmptyDocument();
    expect(diffFromBatch(d, d, userBatch([]))).toMatchObject({ added: [], removed: [], moved: [], modified: [], tokensChanged: false });
  });

  it('a mixed batch populates every bucket at once', () => {
    const d = createEmptyDocument();
    const r = rectNode('r');
    const diff = diffFromBatch(
      d,
      d,
      userBatch([ops.addSubtree('p', 0, [r]), ops.removeSubtree('gone'), ops.updateNode('n1', { width: 1 }), ops.reorder('n2', 'p', 0), ops.reparent('n3', 'p2', 0), ops.setTokens(defaultTokens())]),
    );
    expect(diff.added).toEqual([r.id]);
    expect(diff.removed).toEqual(['gone']);
    expect(diff.modified.map((m) => m.id)).toEqual(['n1']);
    expect(diff.moved).toEqual(expect.arrayContaining(['n2', 'n3']));
    expect(diff.tokensChanged).toBe(true);
  });
});
