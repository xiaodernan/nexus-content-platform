import { beforeEach, describe, expect, it } from 'vitest';
import { hitTest, layoutPage, type InstanceNode } from '@nexus/design-model';
import { instanceView, useStudio } from './store';

const st = () => useStudio.getState();
const count = (type: string) => Object.values(st().doc.nodes).filter((n) => n.type === type).length;
const firstOf = (type: string) => Object.values(st().doc.nodes).find((n) => n.type === type);

function twoShapesOnPage() {
  st().newProject();
  st().addShape('rectangle', { x: 100, y: 100 });
  const a = st().selection[0]!;
  st().addShape('ellipse', { x: 220, y: 100 });
  const b = st().selection[0]!;
  return { a, b };
}

beforeEach(() => {
  st().newProject();
});

describe('store: create component', () => {
  it('wraps the selection into a master + one instance, losslessly', () => {
    const { a, b } = twoShapesOnPage();
    st().select([a, b]);
    st().createComponent();

    expect(count('component')).toBe(1);
    expect(count('instance')).toBe(1);
    const inst = firstOf('instance')!;
    // the shapes are no longer page children; the instance projects them as clones
    const { doc: view } = instanceView(st().doc);
    expect(view.nodes[inst.id]!.childIds.length).toBe(2);
    expect(st().doc.nodes[a]!.parentId).toBe(firstOf('component')!.id);
    expect(st().selection).toEqual([inst.id]);
  });

  it('undo restores the two page shapes and drops the master + instance', () => {
    const { a, b } = twoShapesOnPage();
    st().select([a, b]);
    st().createComponent();
    st().undo();
    expect(count('component')).toBe(0);
    expect(count('instance')).toBe(0);
    expect(st().doc.nodes[a]!.parentId).toBe(st().activePageId);
    expect(st().doc.nodes[b]!.parentId).toBe(st().activePageId);
    st().redo();
    expect(count('component')).toBe(1);
    expect(count('instance')).toBe(1);
  });
});

describe('store: insert + share instances', () => {
  it('a second instance of one component gets disjoint materialized ids', () => {
    const { a, b } = twoShapesOnPage();
    st().select([a, b]);
    st().createComponent();
    const compId = firstOf('component')!.id;
    const firstInst = firstOf('instance')!.id;
    st().insertInstance(compId);
    expect(count('instance')).toBe(2);
    const { doc: view } = instanceView(st().doc);
    const i1 = view.nodes[firstInst]!.childIds;
    const i2 = Object.values(view.nodes).find((n) => n.type === 'instance' && n.id !== firstInst)!.childIds;
    expect(i1.length).toBe(2);
    expect(i2.length).toBe(2);
    expect(i1.some((id) => i2.includes(id))).toBe(false);
  });
});

describe('store: detach instance', () => {
  it('replaces the instance with a concrete group of editable layers, keeping the master', () => {
    const { a, b } = twoShapesOnPage();
    st().select([a, b]);
    st().createComponent();
    const compId = firstOf('component')!.id;
    st().detachInstance();
    expect(count('instance')).toBe(0);
    const group = firstOf('group');
    expect(group).toBeTruthy();
    expect(group!.childIds.length).toBe(2);
    expect(group!.parentId).toBe(st().activePageId);
    expect(count('component')).toBe(1); // master survives for other instances
    st().undo();
    expect(count('instance')).toBe(1);
    expect(count('group')).toBe(0);
    expect(st().doc.nodes[compId]).toBeTruthy();
  });
});

describe('store: instance overrides', () => {
  function madeOneComponent() {
    st().newProject();
    st().addShape('rectangle', { x: 100, y: 100 });
    const a = st().selection[0]!;
    st().addShape('text', { x: 100, y: 240 });
    const textId = st().selection[0]!;
    st().setEditing(null);
    st().select([a, textId]);
    st().createComponent();
    const instId = st().selection[0]!;
    return { a, textId, instId };
  }
  const inst = (id: string) => st().doc.nodes[id] as InstanceNode;

  it('a width override changes the projected clone, not the master', () => {
    const { a, instId } = madeOneComponent();
    st().setInstanceOverride(instId, a, { width: 300 });
    const { doc: view } = instanceView(st().doc);
    expect(view.nodes[`${instId}::${a}`]!.width).toBe(300);
    expect(inst(instId).overrides[a]!.width).toBe(300);
    expect(st().doc.nodes[a]!.width).toBe(160); // master untouched
  });

  it('merges a later visible override without dropping the width key', () => {
    const { a, instId } = madeOneComponent();
    st().setInstanceOverride(instId, a, { width: 250 });
    st().setInstanceOverride(instId, a, { visible: false });
    expect(inst(instId).overrides[a]).toEqual({ width: 250, visible: false });
  });

  it('a text override lands in the text map and reverses on undo', () => {
    const { a, textId, instId } = madeOneComponent();
    st().setInstanceOverride(instId, textId, { characters: 'Hello' });
    expect(inst(instId).overrides.text?.[textId]).toBe('Hello');
    const { doc: view } = instanceView(st().doc);
    expect((view.nodes[`${instId}::${textId}`] as { characters?: string }).characters).toBe('Hello');
    st().undo();
    expect(inst(instId).overrides[a]).toBeUndefined();
    expect(inst(instId).overrides.text?.[textId]).toBeUndefined();
  });
});

describe('store: rotation', () => {
  it('committing rotation through updateNode is reversible end to end', () => {
    st().addShape('rectangle', { x: 100, y: 100 });
    const id = st().selection[0]!;
    const before = st().doc.nodes[id]!.rotation ?? 0;
    st().updateNode(id, { rotation: 30 });
    expect(st().doc.nodes[id]!.rotation).toBe(30);
    st().undo();
    expect(st().doc.nodes[id]!.rotation ?? 0).toBe(before);
    st().redo();
    expect(st().doc.nodes[id]!.rotation).toBe(30);
  });

  it('the transient rotations map previews and is cleared with live geometry', () => {
    st().addShape('rectangle', { x: 100, y: 100 });
    const id = st().selection[0]!;
    st().setRotations({ [id]: 45 });
    expect(st().rotations[id]).toBe(45);
    st().clearLiveGeom();
    expect(st().rotations).toEqual({});
    expect(st().doc.nodes[id]!.rotation ?? 0).toBe(0); // preview never touches the doc
  });
});

describe('store: sub-selection (drill-in editing via overrides)', () => {
  function drilledIn() {
    st().newProject();
    st().addShape('rectangle', { x: 100, y: 100 });
    const rectId = st().selection[0]!;
    st().addShape('ellipse', { x: 300, y: 100 });
    st().select([rectId]);
    st().createComponent();
    const instId = st().selection[0]!;
    const cloneId = `${instId}::${rectId}`;
    return { rectId, instId, cloneId };
  }
  const overridesOf = (instId: string, masterId: string) => (st().doc.nodes[instId] as InstanceNode).overrides[masterId];

  it('moving a selected clone commits accumulated x/y overrides on its instance', () => {
    const { rectId, instId, cloneId } = drilledIn();
    st().select([cloneId]);
    st().moveSelectionBy(5, 7);
    expect(overridesOf(instId, rectId)).toEqual({ x: 5, y: 7 });
    st().moveSelectionBy(2, 0);
    expect(overridesOf(instId, rectId)!.x).toBe(7);
    st().moveSelectionBy(0, 2);
    expect(overridesOf(instId, rectId)!.y).toBe(9);
    const { doc: view } = instanceView(st().doc);
    const authored = st().doc.nodes[rectId]!;
    expect(view.nodes[cloneId]!.x).toBe(authored.x + 7);
    expect(view.nodes[cloneId]!.y).toBe(authored.y + 9);
    expect(authored.x).toBe(0); // createComponent rebased the master; it stays untouched
  });

  it('one move with a clone + an authored node is a single reversible step', () => {
    const { rectId, instId, cloneId } = drilledIn();
    st().addShape('rectangle', { x: 0, y: 300 });
    const plain = st().selection[0]!;
    st().select([cloneId, plain]);
    const beforeX = st().doc.nodes[plain]!.x;
    st().moveSelectionBy(10, 0);
    expect(st().doc.nodes[plain]!.x).toBe(beforeX + 10);
    expect(overridesOf(instId, rectId)).toEqual({ x: 10, y: 0 });
    st().undo();
    expect(st().doc.nodes[plain]!.x).toBe(beforeX);
    expect(overridesOf(instId, rectId)).toBeUndefined();
  });

  it('resizeTo on a clone bakes absolute width/height plus an x/y delta into overrides', () => {
    const { rectId, instId, cloneId } = drilledIn();
    st().select([cloneId]);
    // g is in absolute page-layout space; the clone sits at the instance position (100,100)
    st().resizeTo(cloneId, { x: 100, y: 100, width: 220, height: 60 });
    expect(overridesOf(instId, rectId)).toEqual({ x: 0, y: 0, width: 220, height: 60 });
    const { doc: view } = instanceView(st().doc);
    expect(view.nodes[cloneId]!.width).toBe(220);
    expect(st().doc.nodes[rectId]!.width).toBe(160); // master untouched
    st().undo();
    expect(overridesOf(instId, rectId)).toBeUndefined();
  });

  it('resizing a clone of a moved instance does not jump (layout-space deltas)', () => {
    const { rectId, instId, cloneId } = drilledIn();
    st().updateNode(instId, { x: 150, y: 150 });
    const before = layoutPage(instanceView(st().doc).doc, st().activePageId)[cloneId]!;
    st().resizeTo(cloneId, { x: before.x, y: before.y, width: 200, height: 50 });
    expect(overridesOf(instId, rectId)).toEqual({ x: 0, y: 0, width: 200, height: 50 });
    const after = layoutPage(instanceView(st().doc).doc, st().activePageId)[cloneId]!;
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
  });

  it('a rotation override is absolute, reversible, and hit-tested on the clone', () => {
    const { rectId, instId, cloneId } = drilledIn();
    st().setInstanceOverride(instId, rectId, { rotation: 45 });
    expect(overridesOf(instId, rectId)).toEqual({ rotation: 45 });
    st().setInstanceOverride(instId, rectId, { rotation: 90 });
    expect(overridesOf(instId, rectId)).toEqual({ rotation: 90 });
    const view = instanceView(st().doc).doc;
    expect(view.nodes[cloneId]!.rotation).toBe(90);
    expect(st().doc.nodes[rectId]!.rotation ?? 0).toBe(0); // master untouched
    const layout = layoutPage(view, st().activePageId);
    // clone AABB (100,100,160,120) turned 90° stands at x∈[120,240], y∈[80,240] about (180,160)
    expect(hitTest(view, layout, st().activePageId, { x: 180, y: 160 })).toBe(cloneId);
    // vacated AABB corner: the clone is skipped, the click falls through to the instance body
    expect(hitTest(view, layout, st().activePageId, { x: 105, y: 105 })).toBe(instId);
    st().undo();
    st().undo();
    expect(overridesOf(instId, rectId)).toBeUndefined();
  });

  it('focus state is set, guarded against staleness by Canvas, and reset by newProject', () => {
    const { instId } = drilledIn();
    expect(st().focusedInstanceId).toBeNull();
    st().setFocused(instId);
    expect(st().focusedInstanceId).toBe(instId);
    st().newProject();
    expect(st().focusedInstanceId).toBeNull();
  });

  it('an x override composes with the instance position in layout', () => {
    const { rectId, instId, cloneId } = drilledIn();
    st().updateNode(instId, { x: 40, y: 50 });
    st().setInstanceOverride(instId, rectId, { x: 10 });
    const layout = layoutPage(instanceView(st().doc).doc, st().activePageId);
    expect(layout[cloneId]!.x).toBe(40 + st().doc.nodes[rectId]!.x + 10);
  });
});
