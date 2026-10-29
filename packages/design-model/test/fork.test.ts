import { describe, expect, it } from 'vitest';
import { createEmptyDocument, forkDocument, rectNode, validateDocument, type DesignDocument } from '../src/index.js';

/** A document with one real child on its page, so "the graph is preserved" is a claim with content. */
function withRect(): DesignDocument {
  const doc = createEmptyDocument('Source');
  const pageId = doc.activePageId;
  const rect = rectNode('Box', { id: 'r1', parentId: pageId });
  const page = doc.nodes[pageId]!;
  return {
    ...doc,
    nodes: { ...doc.nodes, [rect.id]: rect, [pageId]: { ...page, childIds: [...page.childIds, rect.id] } },
  };
}

describe('forkDocument (M7 v233)', () => {
  it('gives the document a NEW id while keeping the node graph', () => {
    const src = withRect();
    const fork = forkDocument(src);
    expect(fork.id).not.toBe(src.id);
    expect(fork.rootId).toBe(fork.id);
    expect(fork.nodes[fork.id]?.id).toBe(fork.id);
    // the SOURCE's root key is gone from the fork; every other node survives by its own id
    expect(fork.nodes[src.rootId]).toBeUndefined();
    expect(fork.nodes['r1']).toBeDefined();
    expect(Object.keys(fork.nodes).length).toBe(Object.keys(src.nodes).length);
  });

  it('does not mutate the source document', () => {
    const src = withRect();
    const before = JSON.stringify(src);
    forkDocument(src);
    expect(JSON.stringify(src)).toBe(before);
    expect(src.nodes[src.rootId]?.id).toBe(src.rootId);
  });

  /**
   * v548 — the bug the first SAVED fork found: renaming the root alone left each page's `parentId` naming a
   * node the fork no longer holds, so `validateDocument` refused every fork this function made. Nothing had
   * written one to a store before, which is why four versions stayed green.
   */
  it('moves the ROOT\'S CHILDREN with it, so the fork is a document the model accepts', () => {
    const src = withRect();
    const fork = forkDocument(src);
    const page = fork.nodes[fork.activePageId]!;
    expect(page.parentId).toBe(fork.rootId);
    expect(page.parentId).not.toBe(src.rootId);
    // The deeper subtree is untouched: its parent is the PAGE, whose id did not change.
    expect(fork.nodes['r1']?.parentId).toBe(fork.activePageId);
    const verdict = validateDocument(fork);
    expect(verdict.ok, verdict.ok ? '' : verdict.problems.map((problem) => problem.detail).join('; ')).toBe(true);
  });

  it('still accepts the SOURCE it forked from — re-parenting happens on a copy, never in place', () => {
    const src = withRect();
    forkDocument(src);
    expect(src.nodes[src.activePageId]?.parentId).toBe(src.rootId);
    expect(validateDocument(src).ok).toBe(true);
  });

  it('defaults the name to "<name> (remix)" and honours an explicit name', () => {
    const src = withRect();
    expect(forkDocument(src).name).toBe('Source (remix)');
    expect(forkDocument(src, 'My Remix').name).toBe('My Remix');
  });

  it('preserves the page set, the active page, and the page child list', () => {
    const src = withRect();
    const fork = forkDocument(src);
    expect(fork.activePageId).toBe(src.activePageId);
    const page = fork.nodes[fork.activePageId]!;
    expect(page.childIds).toEqual(['r1']);
  });

  it('shares the untouched subtrees by reference (a fork is not a deep clone)', () => {
    const src = withRect();
    const fork = forkDocument(src);
    expect(fork.nodes['r1']).toBe(src.nodes['r1']);
  });

  it('throws when the document names a rootId its own nodes do not hold', () => {
    const broken = { ...withRect(), rootId: 'nope' };
    expect(() => forkDocument(broken)).toThrow(/rootId nope/);
  });
});
