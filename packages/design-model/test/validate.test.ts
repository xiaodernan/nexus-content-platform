import { describe, expect, it } from 'vitest';
import {
  applyOp,
  componentNode,
  createEmptyDocument,
  ops,
  pageNode,
  rectNode,
  validateDocument,
  type DesignDocument,
} from '../src/index.js';

/** A real document with a rect on its active page, built through the canonical op path. */
function withRect(): DesignDocument {
  const d = createEmptyDocument('V');
  const page = d.activePageId;
  return applyOp(d, ops.addSubtree(page, 0, [rectNode('R', { id: 'r1', parentId: page, x: 0, y: 0, width: 10, height: 10 })]));
}
const codes = (doc: unknown) => (validateDocument(doc).ok ? [] : validateDocument(doc).problems.map((p) => p.code));
const clone = (d: DesignDocument): DesignDocument => JSON.parse(JSON.stringify(d));

describe('validateDocument (M7 v243)', () => {
  it('accepts the documents the model actually produces', () => {
    expect(validateDocument(createEmptyDocument('e')).ok).toBe(true);
    expect(validateDocument(withRect()).ok).toBe(true);
    // a component MASTER lives under the root and lands in the root node's pageIds — the quirk is tolerated,
    // not asserted against ("every pageIds entry is a page" is FALSE)
    const c0 = createEmptyDocument('c');
    const c = applyOp(c0, ops.addSubtree(c0.rootId, 1, [componentNode('C', { id: 'cmp1' })]));
    expect(validateDocument(c).ok).toBe(true);
    // a second page
    const p0 = createEmptyDocument('p');
    const two = applyOp(p0, ops.addSubtree(p0.rootId, 1, [pageNode('Page 2', { id: 'pg2' })]));
    expect(validateDocument(two).ok).toBe(true);
  });

  it('is TOTAL: garbage never throws', () => {
    for (const bad of [null, undefined, 42, 'doc', [1, 2], {}]) {
      expect(() => validateDocument(bad)).not.toThrow();
      expect(validateDocument(bad).ok).toBe(false);
    }
    expect(codes(null)).toContain('not-an-object');
    expect(codes({})).toContain('bad-nodes');
  });

  it('names a broken root', () => {
    const d = clone(withRect());
    d.rootId = 'ghost';
    expect(codes(d)).toContain('root-missing');

    const notDoc = clone(withRect());
    notDoc.rootId = notDoc.activePageId; // point the root at a page
    expect(codes(notDoc)).toContain('root-not-document');

    const parented = clone(withRect());
    parented.nodes[parented.rootId]!.parentId = parented.activePageId;
    expect(codes(parented)).toContain('root-has-parent');
  });

  it('flags the document DEAD childIds field being used', () => {
    const d = clone(withRect());
    (d.nodes[d.rootId] as unknown as { childIds: string[] }).childIds = ['r1'];
    expect(codes(d)).toContain('document-child-ids-used');
  });

  it('flags a node stored under the wrong key, or with no parent', () => {
    const mismatched = clone(withRect());
    mismatched.nodes['r1']!.id = 'other';
    expect(codes(mismatched)).toContain('node-id-key-mismatch');

    const orphan = clone(withRect());
    orphan.nodes['r1']!.parentId = null;
    expect(codes(orphan)).toContain('node-without-parent');
  });

  it('flags a parent that is not there', () => {
    const d = clone(withRect());
    d.nodes['r1']!.parentId = 'ghost';
    expect(codes(d)).toContain('parent-missing');
  });

  it('flags a child that is not there, a disagreement, a duplicate and a self-child', () => {
    const ghost = clone(withRect());
    ghost.nodes[ghost.activePageId]!.childIds.push('ghost');
    expect(codes(ghost)).toContain('child-missing');

    const disagree = clone(withRect());
    disagree.nodes['r1']!.parentId = disagree.rootId; // page still lists r1
    expect(codes(disagree)).toContain('child-parent-disagrees');

    const dup = clone(withRect());
    dup.nodes[dup.activePageId]!.childIds.push('r1');
    expect(codes(dup)).toContain('duplicate-child');

    const self = clone(withRect());
    self.nodes[self.activePageId]!.childIds.push(self.activePageId);
    expect(codes(self)).toContain('self-child');
  });

  it('flags the active page', () => {
    const missing = clone(withRect());
    missing.activePageId = 'ghost';
    expect(codes(missing)).toContain('active-page-missing');

    const notPage = clone(withRect());
    notPage.activePageId = 'r1'; // a rect
    expect(codes(notPage)).toContain('active-not-page');
  });

  it('flags a parent that does not list its child, and an unreachable node', () => {
    const stranded = clone(withRect());
    // r1's parentId still says the page, but the page no longer lists r1
    stranded.nodes[stranded.activePageId]!.childIds = [];
    const c = codes(stranded);
    expect(c).toContain('parent-does-not-list-child');
    expect(c).toContain('unreachable');
  });

  it('does not mutate the document it is handed', () => {
    const d = withRect();
    const before = JSON.stringify(d);
    validateDocument(d);
    expect(JSON.stringify(d)).toBe(before);
  });

  it('a verdict lists EVERY problem, not just the first', () => {
    const d = clone(withRect());
    d.rootId = 'ghost';
    d.activePageId = 'also-ghost';
    const c = codes(d);
    expect(c).toContain('root-missing');
    expect(c).toContain('active-page-missing');
  });
});

// v426 — the GEOMETRY axis. The graph checker said `ok: true` about a document whose `x` was the string
// "040" (measured on HEAD), and `layoutPage` then handed the three renderers three different pictures of
// the same box (plan §6: `left:040px`, `x="0"`, `moveTo("0400")`). The renderer's own answer to a value it
// cannot place is SILENCE, so this is the only place a person can learn why the canvas is empty.
describe('validateDocument geometry axis (M7 v426)', () => {
  /** The same bytes a POST brings in: the declared `number` is a promise JSON.parse never kept. */
  function withGeom(id: string, geom: Record<string, unknown>): DesignDocument {
    const d = clone(withRect());
    Object.assign(d.nodes[id] as unknown as Record<string, unknown>, geom);
    return d;
  }
  const details = (doc: unknown) => (validateDocument(doc).ok ? [] : validateDocument(doc).problems.map((p) => p.detail));

  it('refuses a document whose geometry is not a number, naming node, field and type', () => {
    const d = withGeom('r1', { x: '040' });
    expect(codes(d)).toContain('geometry-not-a-number');
    expect(details(d).join('\n')).toContain('r1 (a rectangle) has non-finite x (string)');
  });

  it('names each bad field of one node, and nothing that is a number', () => {
    const d = withGeom('r1', { x: null, width: [1] });
    const line = details(d).find((t) => t.startsWith('r1'))!;
    // read the field LIST, not a substring: 'y' lives inside 'array' and 'renderer'
    const named = /has non-finite ([^(]+) \(([^)]+)\)/.exec(line);
    expect(named![1]!.split(', ')).toEqual(['x', 'width']);
    expect(named![2]!.split(', ')).toEqual(['null', 'array']);
  });

  it('accepts the geometry the model actually authors — including 0, negatives and fractions', () => {
    const d = withGeom('r1', { x: -20.5, y: 0, width: 0, height: 1 / 3 });
    expect(validateDocument(d).ok).toBe(true);
  });

  it('says what a corrupt ACTIVE PAGE costs: the page draws empty', () => {
    const d = clone(withRect());
    Object.assign(d.nodes[d.activePageId] as unknown as Record<string, unknown>, { width: '1440' });
    const line = details(d).find((t) => t.includes('active page'))!;
    expect(line).toContain('falls back to 0');
    expect(line).toContain('width');
  });

  it('names a corrupt auto-layout gap or padding entry', () => {
    const d = clone(withRect());
    const pageId = d.activePageId;
    const frame = pageNode('F', { id: 'fr', parentId: pageId, childIds: ['r1'], layout: { mode: 'vertical', gap: '10', padding: { top: NaN, right: 0, bottom: 0, left: 0 }, primaryAxis: 'start', counterAxis: 'start' } } as never);
    d.nodes['fr'] = frame;
    (d.nodes[pageId] as unknown as { childIds: string[] }).childIds = ['fr'];
    d.nodes['r1']!.parentId = 'fr';
    const c = codes(d);
    expect(c).toContain('layout-not-a-number');
    expect(c.filter((x) => x === 'layout-not-a-number')).toHaveLength(2); // gap AND padding.top
    expect(details(d).join('\n')).toContain('layout.gap (string)');
    expect(details(d).join('\n')).toContain('top: number');
  });

  it('reports the TYPE of an offending value, never its bytes', () => {
    const d = withGeom('r1', { y: '<img src=x onerror=alert(1)>' });
    const all = JSON.stringify(validateDocument(d));
    expect(all).not.toContain('onerror');
    expect(all).not.toContain('<img');
    expect(details(d).join('\n')).toContain('(string)');
  });

  it('does not charge the document root, whose own geometry is read by nothing', () => {
    const d = clone(withRect());
    Object.assign(d.nodes[d.rootId] as unknown as Record<string, unknown>, { x: 'oops' });
    expect(codes(d)).not.toContain('geometry-not-a-number');
  });
});
