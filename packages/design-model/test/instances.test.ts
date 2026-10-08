import { describe, expect, it } from 'vitest';
import {
  componentNode,
  createEmptyDocument,
  expandComponentInstances,
  hitTest,
  instanceNode,
  layoutPage,
  ownerInstanceId,
  rectNode,
  textNode,
  type DesignDocument,
  type DesignNode,
  type InstanceNode,
  type Paint,
  type TextNode,
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
    // `DesignNode` is a union and `characters` belongs to `TextNode` alone, so the projection is narrowed
    // before reading it — the same shape the `i1 as InstanceNode` cast above uses. (v204: this package's type
    // gate did not read `test/` until then, so an unnarrowed access here was never checked.)
    expect((out.nodes['i1::cmp::label'] as TextNode | undefined)?.characters).toBe('Save');

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
    // The cast is the SAME ONE `readOverrides` makes in `src/instances.ts`, and it is here for a real reason:
    // `InstanceNode['overrides']` is `Record<NexusId, Partial<Pick<NodeBase, …>>> & { text?: Record<NexusId, string> }`,
    // so an object literal's `text` key has to satisfy the INDEX SIGNATURE as well as the named field — and
    // `{ 'cmp::label': 'Clicked' }` cannot. No correctly-typed code can write a text override. Found by v204's
    // widened gate; NOT fixed here, because the fix is a canonical-model decision (the format also lets a master
    // child whose id is literally `text` be unreachable for geometry patches, since `readOverrides` skips that
    // key). Filed as its own increment in `docs/DEVELOPMENT_PLAN.md`.
    inst.overrides = {
      'cmp::rect': { width: 300 },
      text: { 'cmp::label': 'Clicked' },
    } as InstanceNode['overrides'];
    doc = seed(doc, doc.activePageId, inst);
    const { doc: out } = expandComponentInstances(doc);
    expect(out.nodes['i2::cmp::rect']?.width).toBe(300);
    expect((out.nodes['i2::cmp::label'] as TextNode | undefined)?.characters).toBe('Clicked');
    // untouched master stays as authored
    expect((doc.nodes['cmp::label'] as TextNode | undefined)?.characters).toBe('Save');
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

  it('applies rotation overrides as an absolute replacement, hit-tested rotated', () => {
    let doc = createEmptyDocument();
    const { cmp, r, t } = buttonMaster();
    doc = seed(doc, doc.rootId, cmp, r, t);
    const inst = instanceNode('B', 'cmp', { id: 'i3', x: 0, y: 0, width: 140, height: 140 });
    inst.overrides = { 'cmp::rect': { rotation: 90 }, 'cmp::label': { visible: false } };
    doc = seed(doc, doc.activePageId, inst);
    const { doc: out } = expandComponentInstances(doc);
    const clone = out.nodes['i3::cmp::rect']!;
    expect(clone.rotation).toBe(90);
    expect(doc.nodes['cmp::rect']?.rotation ?? 0).toBe(0); // master untouched
    // the renderer's hit path agrees: the turned body hits, a vacated AABB corner misses
    const layout = layoutPage(out, doc.activePageId);
    const box = layout['i3::cmp::rect']!; // 120x40 at (0,0) → turned occupies x∈[40,80], y∈[-40,80]
    expect(box).toEqual({ x: 0, y: 0, width: 120, height: 40 });
    expect(hitTest(out, layout, doc.activePageId, { x: 60, y: 70 })).toBe(clone.id);
    // the vacated AABB corner falls through the clone to the instance body (unit selection)
    expect(hitTest(out, layout, doc.activePageId, { x: 5, y: 5 })).toBe('i3');
  });
});

describe('instances: rigid rotation bake (ADR 0005 amendment 3)', () => {
  it('a rotated instance turns its whole clone subtree about its centre', () => {
    let doc = createEmptyDocument();
    const { cmp, r, t } = buttonMaster();
    doc = seed(doc, doc.rootId, cmp, r, t);
    const inst = instanceNode('B', 'cmp', { id: 'i5', x: 0, y: 0, width: 140, height: 140, rotation: 90 });
    inst.overrides = { 'cmp::label': { visible: false } };
    doc = seed(doc, doc.activePageId, inst);
    const { doc: out } = expandComponentInstances(doc);
    const clone = out.nodes['i5::cmp::rect']!;
    // master rect 120×40 at (0,0): local centre (60,20) about pivot (70,70) turns to (120,60)
    expect(clone.rotation).toBe(90);
    expect(clone.x).toBeCloseTo(60);
    expect(clone.y).toBeCloseTo(40);
    // masters are never touched
    expect(doc.nodes['cmp::rect']!.x).toBe(0);
    expect(doc.nodes['cmp::rect']!.rotation ?? 0).toBe(0);
    // hit-testing follows the turned body: (120,90) is outside the clone AABB (y>80) but inside
    // the rotated rect — only a rigid bake + composed rotation can produce this
    const layout = layoutPage(out, doc.activePageId);
    expect(hitTest(out, layout, doc.activePageId, { x: 120, y: 90 })).toBe('i5::cmp::rect');
  });

  it('the bake composes with x/y deltas and keeps overrides local', () => {
    let doc = createEmptyDocument();
    const { cmp, r, t } = buttonMaster();
    doc = seed(doc, doc.rootId, cmp, r, t);
    const inst = instanceNode('B', 'cmp', { id: 'i6', x: 0, y: 0, width: 140, height: 140, rotation: 90 });
    inst.overrides = { 'cmp::rect': { x: 10 }, 'cmp::label': { rotation: 30 } };
    doc = seed(doc, doc.activePageId, inst);    const { doc: out } = expandComponentInstances(doc);
    const clone = out.nodes['i6::cmp::rect']!;
    // delta applied first (local centre (70,20)), then the bake: → centre (120,70), top-left (60,50)
    expect(clone.x).toBeCloseTo(60);
    expect(clone.y).toBeCloseTo(50);
    expect(clone.rotation).toBe(90);
    // a per-clone rotation override stays *local*: the instance angle composes on top of it
    const label = out.nodes['i6::cmp::label']!;
    expect(label.rotation).toBe(120);
    // the authored override record is untouched by the bake
    expect(inst.overrides['cmp::rect']).toEqual({ x: 10 });
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

describe('instances: style overrides (ADR 0015 amendment 4)', () => {
  /** A two-child master, two instances of it, and a fill+radius patch on the first one. */
  function twoInstances() {
    let doc = createEmptyDocument();
    const { cmp, r, t } = buttonMaster();
    doc = seed(doc, doc.rootId, cmp, r, t);
    doc = seed(
      doc,
      doc.activePageId,
      instanceNode('Btn1', 'cmp', { id: 'i1', x: 0, y: 0, width: 120, height: 40 }),
      instanceNode('Btn2', 'cmp', { id: 'i2', x: 0, y: 60, width: 120, height: 40 }),
    );
    const paint: Paint = { kind: 'solid', color: { r: 1, g: 0, b: 0, a: 1 } };
    const patched: DesignDocument = {
      ...doc,
      nodes: {
        ...doc.nodes,
        i1: { ...(doc.nodes['i1'] as InstanceNode), overrides: { [r.id]: { fills: [paint], cornerRadius: 12 } } },
      },
    };
    return { doc: patched, paint };
  }

  it("replaces a clone's fill and corner radius, leaving the master and the unpatched sibling alone", () => {
    const { doc, paint } = twoInstances();
    const masterFills = doc.nodes['cmp::rect']!.fills;
    const masterRadius = doc.nodes['cmp::rect']!.cornerRadius;

    const { doc: out } = expandComponentInstances(doc);

    expect(out.nodes['i1::cmp::rect']!.fills).toEqual([paint]);
    expect(out.nodes['i1::cmp::rect']!.cornerRadius).toBe(12);
    // The instance that overrode nothing reads the master's own values…
    expect(out.nodes['i2::cmp::rect']!.fills).toEqual(masterFills);
    expect(out.nodes['i2::cmp::rect']!.cornerRadius).toBe(masterRadius);
    // …and the canonical document is untouched in both halves: this is a view-time projection.
    expect(doc.nodes['cmp::rect']!.fills).toEqual(masterFills);
    expect(doc.nodes['cmp::rect']!.cornerRadius).toBe(masterRadius);
  });

  it('hands the clone a COPY of the override array, so a renderer cannot write back into the document', () => {
    const { doc, paint } = twoInstances();
    const patch = (doc.nodes['i1'] as InstanceNode).overrides['cmp::rect']!;
    const { doc: out } = expandComponentInstances(doc);
    const clone = out.nodes['i1::cmp::rect']!;

    expect(clone.fills).toEqual([paint]);
    expect(clone.fills, 'the array is a copy, not the patch object the document holds').not.toBe(patch.fills);
    clone.fills.push({ kind: 'token', ref: 'color.brand' });
    expect(patch.fills, 'a push on the projected clone must not reach the document').toHaveLength(1);
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
