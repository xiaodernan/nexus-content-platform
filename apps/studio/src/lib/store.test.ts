import { describe, expect, it, beforeEach } from 'vitest';
import {
  createEmptyDocument,
  rectNode,
  componentNode,
  instanceNode,
  textNode,
  type DesignDocument,
  type TextStyle,
} from '@nexus/design-model';

const STYLE: TextStyle = {
  fontFamilyToken: 'font.family.body',
  sizeToken: 'font.size.base',
  weight: 400,
  lineHeight: 1.2,
  letterSpacing: 0,
  align: 'left',
};
import { useStudio, instanceView } from './store';

/**
 * The STUDIO STORE’s own authoring rules, graded directly.
 *
 * The store has shipped since v132 and has never had a test file of its own: component/instance
 * authoring (ADR 0015), the remix fork (v233) and the lineage stamp (v267) were graded only through
 * the browser harnesses, which need a dev server and a real browser. The actions themselves are
 * plain functions over a plain document — `get()`, a batch of ops, `set()` — so they can be asked
 * directly, headlessly, and a rule that regresses can be caught without launching a browser.
 */

const fresh = (): DesignDocument => {
  const doc = createEmptyDocument('Store Test');
  useStudio.getState().loadDocument(doc);
  return doc;
};

/** Put a rect on the active page of a document that is NOT yet loaded into the store. */
const addRect = (doc: DesignDocument, name: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}) => {
  const pageId = doc.activePageId;
  const r = rectNode(name, { x, y, width: w, height: h, parentId: pageId, ...extra });
  doc.nodes[r.id] = r;
  doc.nodes[pageId]!.childIds.push(r.id);
  return r.id;
};

/** A document with one component master (one text leaf) and one instance of it on the page. */
const withComponent = () => {
  const doc = createEmptyDocument('Store Test');
  const pageId = doc.activePageId;
  const comp = componentNode('Card', { x: 0, y: 0, width: 120, height: 80, parentId: doc.rootId });
  const leaf = textNode('Label', 'HI', STYLE, { x: 0, y: 0, width: 120, height: 40, parentId: comp.id });
  doc.nodes[comp.id] = comp;
  doc.nodes[leaf.id] = leaf;
  comp.childIds.push(leaf.id);
  doc.nodes[doc.rootId]!.childIds.push(comp.id);
  const inst = instanceNode('Card', comp.id, { x: 40, y: 30, width: 120, height: 80, parentId: pageId });
  doc.nodes[inst.id] = inst;
  doc.nodes[pageId]!.childIds.push(inst.id);
  useStudio.getState().loadDocument(doc);
  return { doc, comp, leaf, inst, pageId };
};

beforeEach(() => {
  useStudio.getState().loadDocument(createEmptyDocument('Store Test'));
});

describe('createComponent — a selection becomes a master plus one instance', () => {
  it('moves the selected layers under a new master and leaves an instance where they stood', () => {
    const doc = fresh();
    const a = addRect(doc, 'A', 10, 20, 100, 50);
    const b = addRect(doc, 'B', 130, 20, 40, 50);
    useStudio.getState().loadDocument(doc);
    useStudio.getState().select([a, b]);

    useStudio.getState().createComponent();

    const after = useStudio.getState().doc;
    const comps = Object.values(after.nodes).filter((n) => n.type === 'component');
    expect(comps).toHaveLength(1);
    const comp = comps[0]!;
    expect(comp.parentId).toBe(after.rootId);
    expect(comp.x).toBe(10);
    expect(comp.y).toBe(20);
    expect(comp.width).toBe(160);
    expect(comp.height).toBe(50);
    expect(comp.childIds.sort()).toEqual([a, b].sort());
    // the targets keep their size and are re-based onto the master’s origin
    expect(after.nodes[a]!.x).toBe(0);
    expect(after.nodes[b]!.x).toBe(120);
    const insts = Object.values(after.nodes).filter((n) => n.type === 'instance');
    expect(insts).toHaveLength(1);
    expect(insts[0]!.x).toBe(10);
    expect(insts[0]!.y).toBe(20);
    expect(insts[0]!.parentId).toBe(doc.activePageId);
    expect(useStudio.getState().selection).toEqual([insts[0]!.id]);
  });

  it('refuses with a sentence when nothing is selected, and changes nothing', () => {
    const doc = fresh();
    const before = Object.keys(doc.nodes).length;
    useStudio.getState().select([]);

    useStudio.getState().createComponent();

    expect(useStudio.getState().status).toBe('Select layers on the page to make a component.');
    expect(Object.keys(useStudio.getState().doc.nodes).length).toBe(before);
  });

  it('ignores locked layers and layers that are not on the active page', () => {
    const doc = fresh();
    const locked = addRect(doc, 'Locked', 0, 0, 50, 50, { locked: true });
    const stray = addRect(doc, 'Stray', 0, 100, 50, 50);
    doc.nodes[stray]!.parentId = doc.rootId; // a child of the root, not of the page
    useStudio.getState().loadDocument(doc);
    useStudio.getState().select([locked, stray]);

    useStudio.getState().createComponent();

    expect(useStudio.getState().status).toBe('Select layers on the page to make a component.');
    expect(Object.values(useStudio.getState().doc.nodes).some((n) => n.type === 'component')).toBe(false);
  });
});

describe('insertInstance — a second copy of a master', () => {
  it('places a new instance at a staggered spot, sized from the master', () => {
    const { doc, comp } = withComponent();
    useStudio.getState().select([doc.nodes[doc.activePageId]!.childIds[0]!]);

    useStudio.getState().insertInstance(comp.id);

    const after = useStudio.getState().doc;
    const insts = Object.values(after.nodes).filter((n) => n.type === 'instance');
    expect(insts).toHaveLength(2);
    const made = insts.find((n) => n.id !== after.nodes[doc.activePageId]!.childIds[0])!;
    expect(made.x).toBe(80 + 24);
    expect(made.y).toBe(80 + 24);
    expect(made.width).toBe(comp.width);
    expect(made.height).toBe(comp.height);
    expect(useStudio.getState().selection).toEqual([made.id]);
  });

  it('refuses an unknown component by name and adds nothing', () => {
    const { doc } = withComponent();
    const before = Object.keys(doc.nodes).length;

    useStudio.getState().insertInstance('cmp_does-not-exist');

    expect(useStudio.getState().status).toBe('Unknown component.');
    expect(Object.keys(useStudio.getState().doc.nodes).length).toBe(before);
    expect(useStudio.getState().doc).toBe(doc);
  });
});

describe('detachInstance — an instance becomes plain layers again', () => {
  it('replaces the instance with concrete copies and no live link left', () => {
    const { doc, inst } = withComponent();
    useStudio.getState().select([inst.id]);

    useStudio.getState().detachInstance();

    const after = useStudio.getState().doc;
    expect(after.nodes[inst.id]).toBeUndefined();
    const groupId = useStudio.getState().selection[0]!;
    const group = after.nodes[groupId]!;
    expect(group.type).toBe('group');
    expect(group.x).toBe(inst.x);
    expect(group.y).toBe(inst.y);
    expect(group.childIds.length).toBeGreaterThan(0);
    for (const cid of group.childIds) {
      const child = after.nodes[cid]!;
      expect(child.type).not.toBe('instance');
      expect('componentId' in child).toBe(false);
    }
    const text = after.nodes[group.childIds[0]!]!;
    expect(text.type).toBe('text');
    expect((text as { characters?: string }).characters).toBe('HI');
  });

  it('refuses when the selection holds no instance', () => {
    const doc = fresh();
    const r = addRect(doc, 'Solo', 0, 0, 10, 10);
    useStudio.getState().loadDocument(doc);
    useStudio.getState().select([r]);

    useStudio.getState().detachInstance();

    expect(useStudio.getState().status).toBe('Select an instance to detach.');
    expect(Object.values(useStudio.getState().doc.nodes).some((n) => n.type === 'group')).toBe(false);
  });
});

describe('setInstanceOverride — one leaf of one instance, one op', () => {
  it('writes the patch onto the named master child and leaves the other overrides alone', () => {
    const { doc, inst, leaf } = withComponent();
    useStudio.getState().select([inst.id]);

    useStudio.getState().setInstanceOverride(inst.id, leaf.id, { width: 200, characters: 'YO' });

    const after = useStudio.getState().doc;
    const ov = after.nodes[inst.id]! as unknown as { overrides: Record<string, Record<string, unknown>> };
    expect(ov.overrides[leaf.id]).toEqual({ width: 200, text: 'YO' });
    expect(useStudio.getState().historyLog).toHaveLength(1);
  });

  it('clamps width at 1 and radius at 0 — a square corner is a value, not an absence', () => {
    const { doc, inst, leaf } = withComponent();
    useStudio.getState().loadDocument(doc);
    useStudio.getState().setInstanceOverride(inst.id, leaf.id, { width: -50, cornerRadius: -5 });

    const ov = useStudio.getState().doc.nodes[inst.id]! as unknown as { overrides: Record<string, Record<string, unknown>> };
    expect(ov.overrides[leaf.id]!.width).toBe(1);
    expect(ov.overrides[leaf.id]!.cornerRadius).toBe(0);
  });

  it('an empty patch on an already-empty override removes the key rather than writing noise', () => {
    const { doc, inst, leaf } = withComponent();
    const node = doc.nodes[inst.id]! as unknown as { overrides: Record<string, unknown> };
    node.overrides = { [leaf.id]: {} };
    useStudio.getState().loadDocument(doc);

    useStudio.getState().setInstanceOverride(inst.id, leaf.id, {});

    const ov = useStudio.getState().doc.nodes[inst.id]! as unknown as { overrides: Record<string, unknown> };
    expect(ov.overrides[leaf.id]).toBeUndefined();
  });

  it('an empty patch on a real override leaves it untouched — no accidental deletion', () => {
    const { doc, inst, leaf } = withComponent();
    useStudio.getState().loadDocument(doc);
    useStudio.getState().setInstanceOverride(inst.id, leaf.id, { width: 200 });
    useStudio.getState().setInstanceOverride(inst.id, leaf.id, {});

    const ov = useStudio.getState().doc.nodes[inst.id]! as unknown as { overrides: Record<string, Record<string, unknown>> };
    expect(ov.overrides[leaf.id]).toEqual({ width: 200 });
  });

  it('refuses a node that is not an instance', () => {
    const doc = fresh();
    const r = addRect(doc, 'Solo', 0, 0, 10, 10);
    useStudio.getState().loadDocument(doc);

    expect(() => useStudio.getState().setInstanceOverride(r, 'x', { width: 5 })).not.toThrow();
    expect(useStudio.getState().doc.nodes[r]!.type).toBe('rectangle');
    expect(useStudio.getState().historyLog).toHaveLength(0);
  });
});

describe('remixDocument — a fork, not a load (v233/v267)', () => {
  it('gives the fork a fresh id, so publishing it can never overwrite the source', () => {
    const { doc } = withComponent();
    const sourceId = doc.id;

    useStudio.getState().remixDocument(doc, sourceId, '2026-10-24T00:00:00.000Z');

    expect(useStudio.getState().doc.id).not.toBe(sourceId);
  });

  it('stamps the lineage the service wrote and the public pages read back', () => {
    const { doc } = withComponent();

    useStudio.getState().remixDocument(doc, 'pub-source-1', '2026-10-24T00:00:00.000Z');

    const forked = useStudio.getState().doc as unknown as { _lineage?: { sourceProjectId: string; remixedAt: string } };
    expect(forked._lineage).toEqual({ sourceProjectId: 'pub-source-1', remixedAt: '2026-10-24T00:00:00.000Z' });
  });

  it('says where it came from, and starts a fresh history — the source’s undo log is not inherited', () => {
    const { doc, inst, leaf } = withComponent();
    useStudio.getState().setInstanceOverride(inst.id, leaf.id, { width: 200 });
    expect(useStudio.getState().historyLog.length).toBeGreaterThan(0);

    useStudio.getState().remixDocument(doc, 'pub-source-2', '2026-10-24T00:00:00.000Z');

    expect(useStudio.getState().status).toContain('Remixed pub-source-2');
    expect(useStudio.getState().historyLog).toHaveLength(0);
    expect(useStudio.getState().historyCursor).toBe(0);
  });
});

describe('instanceView — the memoized projection', () => {
  it('returns the identical projection for the same document object', () => {
    const doc = fresh();
    const first = instanceView(doc);
    const second = instanceView(doc);
    expect(second.doc).toBe(first.doc);
    expect(second.meta).toBe(first.meta);
  });

  it('recomputes for a different document, and projects the instance’s clones', () => {
    const { doc, comp, inst, leaf } = withComponent();
    const view = instanceView(doc);
    // the projection names the instance itself AND the clone of the master’s leaf
    const entries = Object.values(view.meta);
    expect(entries).toHaveLength(2);
    expect(view.meta[inst.id]).toEqual({ instanceId: inst.id, masterId: comp.id });
    expect(entries.find((m) => m.masterId === leaf.id)!.instanceId).toBe(inst.id);

    const other = createEmptyDocument('Other');
    expect(instanceView(other).doc).not.toBe(view.doc);
    expect(Object.keys(instanceView(other).meta)).toHaveLength(0);
  });
});
