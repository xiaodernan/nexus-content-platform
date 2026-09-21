import { describe, expect, it } from 'vitest';
import {
  componentNode,
  createEmptyDocument,
  expandComponentInstances,
  instanceNode,
  layoutPage,
  ownerInstanceId,
  rectNode,
  textNode,
  type DesignDocument,
  type DesignNode,
  type InstanceNode,
  type TextStyle,
} from '../src/index.js';

const style: TextStyle = {
  fontFamilyToken: 'font.family.body',
  sizeToken: 'font.size.base',
  weight: 400,
  lineHeight: 1.2,
  letterSpacing: 0,
  align: 'left',
};

/** Add nodes into a fresh document's node store and parent them under `parentId`. */
function seed(
  doc: DesignDocument,
  parentId: string | null,
  ...nodes: DesignNode[]
): DesignDocument {
  const next: DesignDocument = { ...doc, nodes: { ...doc.nodes } };
  for (const n of nodes) {
    next.nodes[n.id] = n;
    if (parentId) {
      const parent = next.nodes[parentId]!;
      parent.childIds = [...(parent.childIds ?? []), n.id];
    }
  }
  if (parentId) {
    for (const n of nodes) next.nodes[n.id] = { ...n, parentId };
  }
  return next;
}

function buttonMaster(id = 'cmp'): { cmp: DesignNode; r: DesignNode; t: DesignNode } {
  const cmp = componentNode('Button', { id });
  const r = rectNode('bg', { id: `${id}::rect` });
  r.width = 120;
  r.height = 40;
  r.parentId = id;
  const t = textNode('label', 'Save', style, { id: `${id}::label` });
  t.width = 120;
  t.height = 40;
  t.parentId = id;
  cmp.childIds = [r.id, t.id];
  return { cmp, r, t };
}

describe('instances: single expansion', () => {
  it('materializes master children under the instance and keeps layout consistent', () => {
    let doc = createEmptyDocument();
    const { cmp, r, t } = buttonMaster();
    doc = seed(doc, doc.rootId, cmp, r, t);
    const inst = instanceNode('Btn1', 'cmp', { id: 'i1', x: 20, y: 30, width: 120, height: 40 });
    doc = seed(doc, doc.activePageId, inst);

    const { doc: out } = expandComponentInstances(doc);
    const i1 = out.nodes['i1'] as InstanceNode;
    expect(i1.childIds).toEqual(['i1::cmp::rect', 'i1::cmp::label']);
    expect(out.nodes['i1::cmp::rect']?.parentId).toBe('i1');
    expect(out.nodes['i1::cmp::rect']?.type).toBe('rectangle');
    expect(out.nodes['i1::cmp::label']?.characters).toBe('Save');

    const layout = layoutPage(out, doc.activePageId);
    expect(layout['i1']).toEqual({ x: 20, y: 30, width: 120, height: 40 });
    expect(layout['i1::cmp::rect']?.x).toBe(20);
    expect(layout['i1::cmp::rect']?.y).toBe(30);
  });

  it('does not mutate the canonical document (purity)', () => {
    let doc = createEmptyDocument();
    const { cmp, r, t } = buttonMaster();
    doc = seed(doc, doc.rootId, cmp, r, t);
    doc = seed(doc, doc.activePageId, instanceNode('Btn', 'cmp', { id: 'i1' }));
    const beforeChildIds = (doc.nodes['i1'] as InstanceNode).childIds.length;
    const { doc: out } = expandComponentInstances(doc);
    expect((doc.nodes['i1'] as InstanceNode).childIds.length).toBe(beforeChildIds);
    expect(out).not.toBe(doc);
    expect(doc.nodes['cmp']?.childIds).toEqual(['cmp::rect', 'cmp::label']);
  });
});

describe('instances: multiple + overrides', () => {
  it('gives two instances of one component disjoint clone ids', () => {
    let doc = createEmptyDocument();
    const { cmp, r, t } = buttonMaster();
    doc = seed(doc, doc.rootId, cmp, r, t);
    doc = seed(doc, doc.activePageId, instanceNode('A', 'cmp', { id: 'i1' }));
    doc = seed(doc, doc.activePageId, instanceNode('B', 'cmp', { id: 'i2' }));
    const { doc: out } = expandComponentInstances(doc);
    expect(out.nodes['i1::cmp::rect']).toBeTruthy();
    expect(out.nodes['i2::cmp::rect']).toBeTruthy();
    expect(out.nodes['i1::cmp::rect']).not.toBe(out.nodes['i2::cmp::rect']);
  });

  it('applies text and width overrides by master id', () => {
    let doc = createEmptyDocument();
    const { cmp, r, t } = buttonMaster();
    doc = seed(doc, doc.rootId, cmp, r, t);
    const inst = instanceNode('B', 'cmp', { id: 'i2' });
    inst.overrides = {
      'cmp::rect': { width: 300 },
      text: { 'cmp::label': 'Clicked' },
    };
    doc = seed(doc, doc.activePageId, inst);
    const { doc: out } = expandComponentInstances(doc);
    expect(out.nodes['i2::cmp::rect']?.width).toBe(300);
    expect(out.nodes['i2::cmp::label']?.characters).toBe('Clicked');
    // untouched master stays as authored
    expect(doc.nodes['cmp::label']?.characters).toBe('Save');
  });

  it('applies x/y overrides as deltas off the master authored position', () => {
    let doc = createEmptyDocument();
    const { cmp, r, t } = buttonMaster();
    doc = seed(doc, doc.rootId, cmp, r, t);
    const masterRect = doc.nodes['cmp::rect']!;
    const inst = instanceNode('B', 'cmp', { id: 'i2', x: 20, y: 30 });
    inst.overrides = { 'cmp::rect': { x: 10, y: -5, width: 300 } };
    doc = seed(doc, doc.activePageId, inst);
    const { doc: out } = expandComponentInstances(doc);
    const clone = out.nodes['i2::cmp::rect']!;
    expect(clone.x).toBe(masterRect.x + 10);
    expect(clone.y).toBe(masterRect.y - 5);
    expect(clone.width).toBe(300); // composes with absolute size overrides
    // master untouched; the authored instance node carries no clone geometry
    expect(doc.nodes['cmp::rect']!.x).toBe(masterRect.x);
    // layout places the shifted clone relative to the instance origin
    const layout = layoutPage(out, doc.activePageId);
    expect(layout['i2::cmp::rect']!.x).toBe(20 + masterRect.x + 10);
  });
});

describe('instances: nesting + cycles + meta', () => {
  it('expands a nested instance one level deep', () => {
    let doc = createEmptyDocument();
    // inner component: an ellipse
    const inner = componentNode('Dot', { id: 'inner' });
    const dot = rectNode('dot', { id: 'inner::dot' });
    dot.parentId = 'inner';
    inner.childIds = ['inner::dot'];
    // outer component: contains an *instance* of inner
    const outer = componentNode('Card', { id: 'outer' });
    const nin = instanceNode('inner-slot', 'inner', { id: 'outer::nin' });
    nin.parentId = 'outer';
    outer.childIds = ['outer::nin'];
    doc = seed(doc, doc.rootId, inner, dot, outer, nin);
    doc = seed(doc, doc.activePageId, instanceNode('Card1', 'outer', { id: 'i1' }));

    const { doc: out } = expandComponentInstances(doc);
    const nested = out.nodes['i1::outer::nin'] as InstanceNode;
    expect(nested?.type).toBe('instance');
    expect(nested?.childIds).toEqual(['i1::outer::nin::inner::dot']);
    expect(out.nodes['i1::outer::nin::inner::dot']?.type).toBe('rectangle');
  });

  it('terminates on a component cycle, leaving the guarded instance childless', () => {
    let doc = createEmptyDocument();
    const a = componentNode('A', { id: 'a' });
    const ia = instanceNode('toB', 'b', { id: 'a::ia' });
    a.childIds = ['a::ia'];
    const b = componentNode('B', { id: 'b' });
    const ib = instanceNode('toA', 'a', { id: 'b::ib' });
    b.childIds = ['b::ib'];
    doc = seed(doc, null, a, b, ia, ib);
    // wire masters' children parentage manually
    doc.nodes['a::ia'] = { ...doc.nodes['a::ia']!, parentId: 'a' };
    doc.nodes['b::ib'] = { ...doc.nodes['b::ib']!, parentId: 'b' };
    doc = seed(doc, doc.activePageId, instanceNode('X', 'a', { id: 'x' }));

    const { doc: out } = expandComponentInstances(doc);
    const first = out.nodes['x::a::ia'] as InstanceNode; // expands b
    expect(first?.childIds).toEqual(['x::a::ia::b::ib']);
    const guarded = out.nodes['x::a::ia::b::ib'] as InstanceNode; // a is already on the stack
    expect(guarded?.childIds).toEqual([]);
  });

  it('maps every clone back to its top-level owning instance', () => {
    let doc = createEmptyDocument();
    const { cmp, r, t } = buttonMaster();
    doc = seed(doc, doc.rootId, cmp, r, t);
    doc = seed(doc, doc.activePageId, instanceNode('Btn', 'cmp', { id: 'i1' }));
    const { meta } = expandComponentInstances(doc);
    expect(ownerInstanceId(meta, 'i1::cmp::rect')).toBe('i1');
    expect(ownerInstanceId(meta, 'i1')).toBe('i1');
    expect(ownerInstanceId(meta, 'cmp')).toBeNull();
  });
});

describe('instances: no-op when absent', () => {
  it('returns a structurally identical document with object identity preserved', () => {
    const doc = createEmptyDocument();
    const pageBefore = doc.nodes[doc.activePageId];
    const { doc: out } = expandComponentInstances(doc);
    expect(out.nodes[doc.activePageId]).toBe(pageBefore);
  });
});
