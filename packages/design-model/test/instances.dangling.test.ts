/**
 * Defensive-branch coverage for `expandComponentInstances` (packages/design-model/src/instances.ts).
 *
 * instances.test.ts is thorough but seeds only WELL-FORMED components, so the dangling-reference
 * guards were never triggered: an instance whose componentId names no node, a master whose childIds
 * list a missing id, and an instance with an empty componentId. A malformed document must degrade
 * gracefully (childless instance, skipped child) rather than crash or invent phantom clones (§60).
 * Per house discipline an untested branch *is* the next increment.
 */
import { describe, expect, it } from 'vitest';
import { componentNode, createEmptyDocument, expandComponentInstances, instanceNode, rectNode, type DesignDocument, type DesignNode, type InstanceNode } from '../src/index.js';

function seed(doc: DesignDocument, parentId: string | null, ...nodes: DesignNode[]): DesignDocument {
  const next: DesignDocument = { ...doc, nodes: { ...doc.nodes } };
  for (const n of nodes) {
    next.nodes[n.id] = n;
    if (parentId) {
      const parent = next.nodes[parentId]!;
      parent.childIds = [...(parent.childIds ?? []), n.id];
    }
  }
  if (parentId) for (const n of nodes) next.nodes[n.id] = { ...n, parentId };
  return next;
}

describe('expandComponentInstances — dangling references degrade, never crash', () => {
  it('an instance whose componentId names no node stays childless (no throw, no phantom clones)', () => {
    let doc = createEmptyDocument();
    doc = seed(doc, doc.activePageId, instanceNode('Bad', 'ghost-component', { id: 'i1' }));
    let out: DesignDocument;
    expect(() => {
      out = expandComponentInstances(doc).doc;
    }).not.toThrow();
    const i1 = out!.nodes['i1'] as InstanceNode;
    expect(i1.childIds).toEqual([]);
    // nothing was materialized under the instance's namespace
    expect(Object.keys(out!.nodes).filter((k) => k.startsWith('i1::'))).toEqual([]);
  });

  it('a master whose childIds list a missing id clones only the children that exist', () => {
    let doc = createEmptyDocument();
    const cmp = componentNode('C', { id: 'cmp' });
    const r = rectNode('bg', { id: 'cmp::rect' });
    r.parentId = 'cmp';
    cmp.childIds = ['cmp::rect', 'cmp::MISSING']; // second entry names no node
    doc = seed(doc, doc.rootId, cmp, r);
    doc = seed(doc, doc.activePageId, instanceNode('B', 'cmp', { id: 'i1' }));

    const { doc: out } = expandComponentInstances(doc);
    const i1 = out.nodes['i1'] as InstanceNode;
    expect(i1.childIds).toEqual(['i1::cmp::rect']); // the missing child is skipped, the rest clone
    expect(out.nodes['i1::cmp::MISSING']).toBeUndefined();
    expect(out.nodes['i1::cmp::rect']?.type).toBe('rectangle');
  });

  it('an instance with an empty componentId stays childless', () => {
    let doc = createEmptyDocument();
    const inst = instanceNode('Empty', '', { id: 'i1' });
    doc = seed(doc, doc.activePageId, inst);
    const { doc: out } = expandComponentInstances(doc);
    expect((out.nodes['i1'] as InstanceNode).childIds).toEqual([]);
  });
});
