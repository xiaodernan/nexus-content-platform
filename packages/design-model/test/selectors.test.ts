import { describe, expect, it } from 'vitest';
import { createEmptyDocument, frameNode, pageNode, rectNode, type DesignDocument } from '../src/index.js';
import {
  buildTree,
  childIdList,
  childrenOf,
  isContainer,
  isDescendant,
  nodePathNames,
} from '../src/selectors.js';

// `selectors.ts` had NO direct unit coverage before this file (only incidental use via
// geometry/layout). These tests pin the tree-walking contracts the canvas and editor rely on.

function makeDoc(): DesignDocument {
  const doc = createEmptyDocument('T');
  const frame1 = frameNode('Frame 1', undefined, {
    id: 'frame1',
    parentId: 'page1',
    width: 200,
    height: 200,
    childIds: ['rect1', 'rect2'],
  });
  const rect1 = rectNode('Rect 1', { id: 'rect1', parentId: 'frame1', width: 50, height: 50 });
  const rect2 = rectNode('Rect 2', { id: 'rect2', parentId: 'frame1', width: 50, height: 50 });
  const page1 = pageNode('Page 1', {
    id: 'page1',
    parentId: doc.rootId,
    width: 1440,
    height: 900,
    childIds: ['frame1'],
  });
  const docNode = doc.nodes[doc.rootId]!;
  (docNode as { pageIds: string[] }).pageIds = ['page1'];
  doc.nodes = { [doc.rootId]: docNode, page1, frame1, rect1, rect2 };
  doc.activePageId = 'page1';
  return doc;
}

describe('isContainer', () => {
  const doc = makeDoc();
  it('is true for frame / group / page / component', () => {
    expect(isContainer(doc.nodes['frame1']!)).toBe(true);
    expect(isContainer(doc.nodes['page1']!)).toBe(true);
  });
  it('is false for leaves and the document node', () => {
    expect(isContainer(doc.nodes['rect1']!)).toBe(false);
    expect(isContainer(doc.nodes[doc.rootId]!)).toBe(false);
  });
});

describe('childIdList', () => {
  const doc = makeDoc();
  it('returns pageIds for the document node', () => {
    expect(childIdList(doc.nodes[doc.rootId]!)).toEqual(['page1']);
  });
  it('returns childIds for containers', () => {
    expect(childIdList(doc.nodes['page1']!)).toEqual(['frame1']);
    expect(childIdList(doc.nodes['frame1']!)).toEqual(['rect1', 'rect2']);
  });
  it('returns an empty list for leaf nodes', () => {
    expect(childIdList(doc.nodes['rect1']!)).toEqual([]);
  });
});

describe('childrenOf', () => {
  const doc = makeDoc();
  it('resolves child ids to ordered nodes', () => {
    const kids = childrenOf(doc, 'frame1');
    expect(kids.map((k) => k.id)).toEqual(['rect1', 'rect2']);
  });
  it('returns [] for a missing node', () => {
    expect(childrenOf(doc, 'ghost')).toEqual([]);
  });
  it('skips child ids that do not resolve (broken reference)', () => {
    const frame = doc.nodes['frame1']!;
    (frame as { childIds: string[] }).childIds = ['rect1', 'ghost'];
    expect(childrenOf(doc, 'frame1').map((k) => k.id)).toEqual(['rect1']);
    (frame as { childIds: string[] }).childIds = ['rect1', 'rect2'];
  });
});

describe('isDescendant', () => {
  const doc = makeDoc();
  it('walks the parent chain upward', () => {
    expect(isDescendant(doc, 'rect1', 'frame1')).toBe(true);
    expect(isDescendant(doc, 'rect1', 'page1')).toBe(true);
    expect(isDescendant(doc, 'rect1', doc.rootId)).toBe(true);
  });
  it('is false when the link is missing or reversed', () => {
    expect(isDescendant(doc, 'page1', 'rect1')).toBe(false);
    expect(isDescendant(doc, 'rect1', 'rect1')).toBe(false);
    expect(isDescendant(doc, doc.rootId, 'page1')).toBe(false);
  });
  it('is false for a missing node', () => {
    expect(isDescendant(doc, 'ghost', 'page1')).toBe(false);
  });
});

describe('buildTree', () => {
  const doc = makeDoc();
  it('rebuilds the subtree from the root', () => {
    const tree = buildTree(doc)!;
    expect(tree.node.id).toBe(doc.rootId);
    expect(tree.children).toHaveLength(1);
    const pageTree = tree.children[0]!;
    expect(pageTree.node.id).toBe('page1');
    const frameTree = pageTree.children[0]!;
    expect(frameTree.node.id).toBe('frame1');
    expect(frameTree.children.map((c) => c.node.id)).toEqual(['rect1', 'rect2']);
  });
  it('returns null for a missing root', () => {
    expect(buildTree(doc, 'ghost')).toBeNull();
  });
});

describe('nodePathNames', () => {
  const doc = makeDoc();
  it('collects names from the node up to (but excluding) the document', () => {
    expect(nodePathNames(doc, 'rect1')).toEqual(['Page 1', 'Frame 1', 'Rect 1']);
    expect(nodePathNames(doc, 'page1')).toEqual(['Page 1']);
  });
  it('returns [] for the document itself or a missing node', () => {
    expect(nodePathNames(doc, doc.rootId)).toEqual([]);
    expect(nodePathNames(doc, 'ghost')).toEqual([]);
  });
});
