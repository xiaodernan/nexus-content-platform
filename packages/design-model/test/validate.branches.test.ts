/**
 * Branch-deepening for `validateDocument` (packages/design-model/src/validate.ts).
 *
 * validate.test.ts already covers most problem codes, but SEVEN defensive branches were never
 * triggered — a regression in any of them would pass silently. Per house discipline an untested
 * branch *is* the next increment. Covers: bad-doc-id, bad-root-id, bad-active-page,
 * node-not-object, child-list-not-array, bad-child-id, and the cycle detector.
 */
import { describe, expect, it } from 'vitest';
import { applyOp, createEmptyDocument, ops, rectNode, validateDocument, type DesignDocument } from '../src/index.js';

function withRect(): DesignDocument {
  const d = createEmptyDocument('V');
  const page = d.activePageId;
  return applyOp(d, ops.addSubtree(page, 0, [rectNode('R', { id: 'r1', parentId: page, x: 0, y: 0, width: 10, height: 10 })]));
}
const codes = (doc: unknown): string[] => (validateDocument(doc).ok ? [] : validateDocument(doc).problems.map((p) => p.code));
const clone = (d: DesignDocument): DesignDocument => JSON.parse(JSON.stringify(d));

describe('validateDocument — the seven uncovered problem codes', () => {
  it('bad-doc-id: a document with no non-empty string id', () => {
    const d = clone(withRect());
    d.id = '';
    expect(codes(d)).toContain('bad-doc-id');
  });

  it('bad-root-id: a document with no non-empty string rootId skips the root checks', () => {
    const d = clone(withRect());
    d.rootId = '';
    expect(codes(d)).toContain('bad-root-id');
    // with rootId unusable, the root/reachability blocks are skipped (never throws)
    expect(() => validateDocument(d)).not.toThrow();
  });

  it('bad-active-page: a document with no non-empty string activePageId', () => {
    const d = clone(withRect());
    d.activePageId = '';
    expect(codes(d)).toContain('bad-active-page');
  });

  it('node-not-object: a nodes entry that is not an object', () => {
    const d = clone(withRect());
    (d.nodes as Record<string, unknown>)['junk'] = null;
    expect(codes(d)).toContain('node-not-object');
  });

  it('child-list-not-array: a node whose child array is missing/not an array', () => {
    const d = clone(withRect());
    (d.nodes[d.activePageId] as unknown as { childIds: unknown }).childIds = { not: 'an array' };
    expect(codes(d)).toContain('child-list-not-array');
  });

  it('bad-child-id: a child list entry that is not a non-empty string', () => {
    const d = clone(withRect());
    d.nodes[d.activePageId]!.childIds.push(123 as unknown as string);
    expect(codes(d)).toContain('bad-child-id');
  });

  it('cycle: two nodes listing each other form a cycle the walker detects', () => {
    const d = clone(withRect());
    const page = d.activePageId;
    // page already lists r1 and r1.parentId is page; make r1 list the page and the page's parent r1,
    // so the forward and reverse checks AGREE (no disagreement) — only the cycle remains.
    (d.nodes['r1'] as unknown as { childIds: string[] }).childIds = [page];
    d.nodes[page]!.parentId = 'r1';
    expect(codes(d)).toContain('cycle');
    expect(validateDocument(d).ok).toBe(false);
  });
});
