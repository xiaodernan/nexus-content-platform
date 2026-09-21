import { beforeEach, describe, expect, it } from 'vitest';
import type { InstanceNode } from '@nexus/design-model';
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
