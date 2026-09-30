import { describe, expect, it } from 'vitest';
import {
  applyOp,
  childIdList,
  createEmptyDocument,
  frameNode,
  ops,
  textNode,
  type DesignDocument,
} from '@nexus/design-model';
import { buildSnapshot, installBridge, installSceneBridge, type ObservableState } from './observability';

const pageOf = (doc: DesignDocument): string => childIdList(doc.nodes[doc.rootId]!)[0]!;

function baseState(doc = createEmptyDocument('Test World')): ObservableState {
  return {
    doc,
    activePageId: pageOf(doc),
    selection: [],
    tool: 'select',
    viewport: { x: 0, y: 0, zoom: 1 },
    historyCursor: 0,
    historyLog: [],
    mode: 'demo',
    status: 'ready',
    previewOpen: false,
    aiBusy: false,
    lastDiff: null,
    focusedInstanceId: null,
  };
}

/** Attach a frame with one text child, through the real op path so the doc stays canonical. */
function withHero(doc: DesignDocument): { doc: DesignDocument; frameId: string; textId: string } {
  const frame = frameNode('Hero', undefined, { x: 0, y: 0, width: 400, height: 200 });
  const text = textNode(
    'Headline',
    'Hi',
    {
      fontFamilyToken: 'font.family.body',
      sizeToken: 'font.size.lg',
      weight: 500,
      lineHeight: 1.3,
      letterSpacing: 0,
      align: 'left',
    },
    { x: 10, y: 10, width: 200, height: 40 },
  );
  let next = applyOp(doc, ops.addSubtree(pageOf(doc), 0, [frame]));
  next = applyOp(next, ops.addSubtree(frame.id, 0, [text]));
  return { doc: next, frameId: frame.id, textId: text.id };
}

describe('buildSnapshot', () => {
  it('reports an empty document as document+page roots and no content nodes', () => {
    const snap = buildSnapshot(baseState());
    expect(snap.schema).toBe(1);
    expect(snap.mode).toBe('demo');
    expect(snap.pageIds).toHaveLength(1);
    expect(snap.nodeCount).toBe(2); // document root + page root
    expect(snap.activePageNodeCount).toBe(0); // roots are not "content"
    expect(snap.nodeTypes).toEqual(['document', 'page']);
  });

  it('walks nested children depth-first and records parentage', () => {
    const doc = createEmptyDocument('Nested');
    const { doc: full, frameId, textId } = withHero(doc);
    const snap = buildSnapshot(baseState(full));

    expect(snap.nodeCount).toBe(4); // document, page, frame, text
    const ids = snap.nodes.map((n) => n.id);
    expect(ids.indexOf(frameId)).toBeLessThan(ids.indexOf(textId)); // depth-first
    expect(snap.nodes[0]!.type).toBe('document');
    expect(snap.nodes.find((n) => n.id === frameId)!.parentId).toBe(pageOf(full));
    expect(snap.nodes.find((n) => n.id === frameId)!.childCount).toBe(1);
    expect(snap.nodes.find((n) => n.id === textId)!.parentId).toBe(frameId);
    expect(snap.nodeTypes).toEqual(['document', 'frame', 'page', 'text']);
  });

  it('derives rects from layoutPage, so geometry is model-derived not DOM-derived', () => {
    const doc = createEmptyDocument('Geom');
    const frame = frameNode('Box', undefined, { x: 24, y: 32, width: 300, height: 120 });
    const full = applyOp(doc, ops.addSubtree(pageOf(doc), 0, [frame]));

    const snap = buildSnapshot(baseState(full));
    const box = snap.nodes.find((n) => n.id === frame.id)!;
    expect(box.rect).toEqual({ x: 24, y: 32, width: 300, height: 120 });
    expect(snap.activePageNodeCount).toBe(1);
  });

  it('marks invisible nodes with a null rect and excludes them from the page count', () => {
    const doc = createEmptyDocument('Hidden');
    const frame = frameNode('Ghost', undefined, { x: 0, y: 0, width: 100, height: 100 });
    let full = applyOp(doc, ops.addSubtree(pageOf(doc), 0, [frame]));
    full = applyOp(full, ops.updateNode(frame.id, { visible: false }));

    const snap = buildSnapshot(baseState(full));
    const ghost = snap.nodes.find((n) => n.id === frame.id)!;
    expect(ghost.visible).toBe(false);
    expect(ghost.rect).toBeNull();
    expect(snap.activePageNodeCount).toBe(0);
  });

  it('is JSON-serialisable and free of cycles (safe to ship over a CDP boundary)', () => {
    const doc = createEmptyDocument('Serialise');
    const { doc: full } = withHero(doc);
    const snap = buildSnapshot(baseState(full));
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });

  it('survives a malformed document that contains a cycle, without hanging', () => {
    const doc = createEmptyDocument('Cyclic');
    const pageId = pageOf(doc);
    const frame = frameNode('Loop', undefined, { x: 0, y: 0, width: 10, height: 10 });
    const full = applyOp(doc, ops.addSubtree(pageId, 0, [frame]));
    // Hand-corrupt: point the page back at itself.
    full.nodes[pageId] = { ...full.nodes[pageId], childIds: [pageId, frame.id] } as never;
    const snap = buildSnapshot(baseState(full));
    expect(snap.nodeCount).toBeLessThan(10); // terminates
  });

  it('carries history and view state through verbatim', () => {
    const state = baseState();
    state.selection = ['n1', 'n2'];
    state.tool = 'frame';
    state.viewport = { x: -40, y: 12, zoom: 1.5 };
    state.historyCursor = 2;
    state.historyLog = [
      { summary: 'Add Hero', provenance: 'user' },
      { summary: 'Agent Note', provenance: 'demo' },
    ];
    state.status = 'composed 16 nodes';
    state.previewOpen = true;
    state.lastDiff = { added: 16, removed: 0, changed: 0 };

    const snap = buildSnapshot(state);
    expect(snap.selection).toEqual(['n1', 'n2']);
    expect(snap.tool).toBe('frame');
    expect(snap.viewport).toEqual({ x: -40, y: 12, zoom: 1.5 });
    expect(snap.history).toEqual({
      cursor: 2,
      length: 2,
      entries: [
        { summary: 'Add Hero', provenance: 'user' },
        { summary: 'Agent Note', provenance: 'demo' },
      ],
    });
    expect(snap.status).toBe('composed 16 nodes');
    expect(snap.previewOpen).toBe(true);
    expect(snap.lastDiff).toEqual({ added: 16, removed: 0, changed: 0 });
  });
});

describe('installBridge', () => {
  it('exposes read-only helpers that always read current state', () => {
    const target: Record<string, unknown> = {};
    let state = baseState();
    const bridge = installBridge(() => state, target);

    expect(target.__nexus).toBe(bridge);
    expect(bridge.version).toBe('nexus-studio-bridge/1');
    expect(bridge.nodeCount()).toBe(2);

    const { doc } = withHero(createEmptyDocument('Grown'));
    state = baseState(doc);
    expect(bridge.nodeCount()).toBe(4);
    expect(bridge.activePageNames()).toEqual(['Hero', 'Headline']);
  });

  it('is frozen so verification cannot mutate the product through the bridge', () => {
    const bridge = installBridge(() => baseState(), {});
    expect(Object.isFrozen(bridge)).toBe(true);
    expect(() => {
      'use strict';
      (bridge as unknown as Record<string, unknown>).snapshot = () => null;
    }).toThrow();
  });
});

describe('installSceneBridge (M5 v142)', () => {
  it('reads the 3D surface LIVE, and answers null when no surface is mounted', () => {
    const target: Record<string, unknown> = {};
    let report: unknown = null;
    const bridge = installSceneBridge(() => report, target);

    expect(target.__nexusScene3d).toBe(bridge);
    expect(bridge.version).toBe('nexus-studio-scene3d/1');
    // No surface yet: the honest answer is "nothing is running", not an empty scene.
    expect(bridge.scene3d()).toBeNull();

    report = { schema: 1, backend: 'headless', frames: 3 };
    expect(bridge.scene3d()).toEqual({ schema: 1, backend: 'headless', frames: 3 });
    report = { schema: 1, backend: 'headless', frames: 4 };
    expect((bridge.scene3d() as { frames: number }).frames).toBe(4);
  });

  it('is frozen, so a harness cannot drive the runtime through the reader', () => {
    const bridge = installSceneBridge(() => null, {});
    expect(Object.isFrozen(bridge)).toBe(true);
    expect(() => {
      'use strict';
      (bridge as unknown as Record<string, unknown>).scene3d = () => null;
    }).toThrow();
  });
});
