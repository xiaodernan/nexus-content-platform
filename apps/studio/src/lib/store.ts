'use client';
import { create } from 'zustand';
import {
  History,
  boundsOfSubtree,
  createEmptyDocument,
  diffFromBatch,
  expandComponentInstances,
  layoutPage,
  ops,
  subtreeIds,
  childIdList,
  newId,
  pageNode,
  rectNode,
  ellipseNode,
  frameNode,
  groupNode,
  textNode,
  componentNode,
  instanceNode,
  type DesignDocument,
  type DesignNode,
  type DiffSummary,
  type InstanceMeta,
  type InstanceNode,
  type Op,
  type OpBatch,
  type Paint,
  type Point,
} from '@nexus/design-model';
import { ModelRouter } from '@nexus/ai-providers';
import { boundsOf, computeAlign, computeDistribute, type AlignMode, type DistributeAxis } from './align';
import { subtreeRotatePlan } from './rotate';

export type Tool = 'select' | 'frame' | 'rectangle' | 'ellipse' | 'text';

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export type Interaction =
  | { type: 'idle' }
  | { type: 'pan'; start: Point; startViewport: Viewport }
  | { type: 'move'; start: Point; applied: Point }
  | {
      type: 'resize';
      id: string;
      corner: 'nw' | 'ne' | 'sw' | 'se';
      startRect: { x: number; y: number; width: number; height: number };
      start: Point;
    }
  | { type: 'marquee'; start: Point; current: Point };

export interface LiveGeom {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Guides {
  xs: number[];
  ys: number[];
}

/** A single, cached mirror-log entry for the History panel (§35 UI over the op log). */
export interface HistoryLogEntry {
  summary: string;
  provenance: 'user' | 'demo' | 'live';
  diff: DiffSummary;
  /** Page snapshots for the visual before/after diff (ADR 0005 geometry → §36 thumbnail). */
  before: DesignDocument;
  after: DesignDocument;
  pageId: string;
}

interface StudioState {
  doc: DesignDocument;
  activePageId: string;
  selection: string[];
  hoverId: string | null;
  editingId: string | null;
  viewport: Viewport;
  tool: Tool;
  interaction: Interaction;
  liveGeom: Record<string, LiveGeom>;
  guides: Guides;
  /** Transient live-rotate preview (node id → degrees) shown while dragging the rotate grip. */
  rotations: Record<string, number>;
  /** Instance drilled into for sub-selection; hit-testing keeps projected clone ids while set. */
  focusedInstanceId: string | null;
  previewOpen: boolean;
  aiBusy: boolean;
  lastDiff: DiffSummary | null;
  lastBefore: DesignDocument | null;
  lastPageId: string | null;
  historyLog: HistoryLogEntry[];
  historyCursor: number;
  mode: 'demo' | 'live';
  status: string;

  setTool: (t: Tool) => void;
  setHover: (id: string | null) => void;
  setEditing: (id: string | null) => void;
  setViewport: (v: Viewport) => void;
  zoomAt: (factor: number, screenPt: Point) => void;
  select: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;
  toggleInSelection: (id: string) => void;
  selectAllOnPage: () => void;

  commitOps: (ops: Op[], summary: string, provenance?: OpBatch['provenance']) => void;
  dispatch: (batch: OpBatch) => void;
  undo: () => void;
  redo: () => void;
  restoreTo: (cursor: number) => void;

  addShape: (kind: Tool, at: Point) => void;
  moveSelectionBy: (dx: number, dy: number) => void;
  resizeTo: (id: string, g: LiveGeom) => void;
  updateNode: (id: string, patch: Record<string, unknown>) => void;
  /** Rigid rotation: turns a node's whole subtree about its centre as one reversible op (§8). */
  rotateSubtree: (id: string, deg: number) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  bringForward: () => void;
  sendBackward: () => void;
  align: (mode: AlignMode) => void;
  distribute: (axis: DistributeAxis) => void;

  addPage: () => void;
  switchPage: (id: string) => void;

  createComponent: () => void;
  insertInstance: (componentId: string) => void;
  detachInstance: () => void;
  setInstanceOverride: (
    instanceId: string,
    masterId: string,
    patch: { x?: number; y?: number; width?: number; height?: number; visible?: boolean; rotation?: number; characters?: string; cornerRadius?: number; fills?: Paint[] },
  ) => void;

  setInteraction: (i: Interaction) => void;
  setLiveGeom: (g: Record<string, LiveGeom>) => void;
  clearLiveGeom: () => void;
  setGuides: (g: Guides) => void;
  setRotations: (r: Record<string, number>) => void;
  setFocused: (id: string | null) => void;
  setPreview: (open: boolean) => void;
  setStatus: (s: string) => void;

  loadDocument: (doc: DesignDocument) => void;
  generate: (prompt: string) => Promise<void>;
  editSelection: (instruction: string) => Promise<void>;
  newProject: () => void;
}

let history = new History(createEmptyDocument('My First World'));
export const router = new ModelRouter();

// Memoized component→instance projection (ADR 0015). Recomputes only when the
// canonical document object changes identity, so the rAF render loop stays cheap.
// It is a pure superset: instance/page rects are unchanged, only clone nodes are added.
let projCache: { src: DesignDocument; doc: DesignDocument; meta: Record<string, InstanceMeta> } | null = null;
export function instanceView(doc: DesignDocument): { doc: DesignDocument; meta: Record<string, InstanceMeta> } {
  if (projCache && projCache.src === doc) return { doc: projCache.doc, meta: projCache.meta };
  const out = expandComponentInstances(doc);
  projCache = { src: doc, doc: out.doc, meta: out.meta };
  return { doc: out.doc, meta: out.meta };
}

const uid = () => 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const userProvenance: OpBatch['provenance'] = { mode: 'user' };

function mkBatch(opsList: Op[], summary: string, provenance: OpBatch['provenance'] = userProvenance): OpBatch {
  return { id: uid(), ops: opsList, provenance, timestamp: Date.now(), summary };
}

/** Resolve a usable page id, guarding against a stale id after undo removes the current page. */
function safePage(doc: DesignDocument, preferred: string | undefined): string {
  if (preferred && doc.nodes[preferred]?.type === 'page') return preferred;
  const pages = childIdList(doc.nodes[doc.rootId]!);
  return pages.find((p) => doc.nodes[p]?.type === 'page') ?? doc.activePageId;
}

/** Deep-clone a subtree with fresh ids, offset by (dx,dy); returns ordered top-first nodes. */
function cloneSubtree(doc: DesignDocument, rootId: string, dx: number, dy: number): DesignNode[] {
  const ids = subtreeIds(doc, rootId); // children-before-parent order
  const idMap = new Map<string, string>();
  for (const id of ids) idMap.set(id, `${id}_c${Math.random().toString(36).slice(2, 6)}`);
  const clones: DesignNode[] = ids.map((id) => {
    const n = doc.nodes[id]!;
    const c = JSON.parse(JSON.stringify(n)) as DesignNode;
    c.id = idMap.get(id)!;
    if (n.parentId) c.parentId = idMap.get(n.parentId) ?? null;
    if ('childIds' in c) c.childIds = (n as { childIds: string[] }).childIds.map((k) => idMap.get(k) ?? k);
    if ('pageIds' in c) c.pageIds = (n as { pageIds: string[] }).pageIds.map((k) => idMap.get(k) ?? k);
    c.x += dx;
    c.y += dy;
    return c;
  });
  clones.sort((a, b) => depthOf(doc, a.id) - depthOf(doc, b.id));
  return clones.map((c) => (c.id === idMap.get(rootId) ? { ...c, parentId: doc.nodes[rootId]!.parentId } : c));
}

function depthOf(doc: DesignDocument, id: string): number {
  let d = 0;
  let cur: DesignNode | undefined = doc.nodes[id];
  while (cur && cur.parentId) {
    d++;
    cur = doc.nodes[cur.parentId];
  }
  return d;
}

export const useStudio = create<StudioState>((set, get) => ({
  doc: history.current,
  activePageId: history.current.activePageId,
  selection: [],
  hoverId: null,
  editingId: null,
  viewport: { x: 60, y: 48, zoom: 0.55 },
  tool: 'select',
  interaction: { type: 'idle' },
  liveGeom: {},
  guides: { xs: [], ys: [] },
  rotations: {},
  focusedInstanceId: null,
  previewOpen: false,
  aiBusy: false,
  lastDiff: null,
  lastBefore: null,
  lastPageId: null,
  historyLog: [],
  historyCursor: 0,
  mode: router.mode,
  status: 'Ready',

  setTool: (t) => set({ tool: t }),
  setHover: (id) => set({ hoverId: id }),
  setEditing: (id) => set({ editingId: id }),
  setViewport: (v) => set({ viewport: v }),

  zoomAt: (factor, screenPt) => {
    const { viewport } = get();
    const newZoom = Math.min(8, Math.max(0.05, viewport.zoom * factor));
    const wx = (screenPt.x - viewport.x) / viewport.zoom;
    const wy = (screenPt.y - viewport.y) / viewport.zoom;
    set({ viewport: { zoom: newZoom, x: screenPt.x - wx * newZoom, y: screenPt.y - wy * newZoom } });
  },

  select: (ids, additive) =>
    set((s) => ({ selection: additive ? Array.from(new Set([...s.selection, ...ids])) : ids })),
  clearSelection: () => set({ selection: [] }),
  selectAllOnPage: () => {
    const { doc, activePageId } = get();
    const page = safePage(doc, activePageId);
    const kids = childIdList(doc.nodes[page]!).filter((id) => doc.nodes[id]?.visible);
    set({ selection: kids });
  },
  toggleInSelection: (id) =>
    set((s) => ({ selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id] })),

  commitOps: (opsList, summary, provenance) => get().dispatch(mkBatch(opsList, summary, provenance)),

  dispatch: (b) => {
    const before = history.current;
    let next: DesignDocument;
    try {
      next = history.dispatch(b);
    } catch (e) {
      set({ status: 'Blocked: ' + (e instanceof Error ? e.message : 'invalid operation') });
      return;
    }
    const summary = diffFromBatch(before, next, b);
    const removed = new Set(summary.removed);
    const state = get();
    // selection/editing may reference projected clone ids, so liveness is checked on the instance view
    const alive = instanceView(next).doc.nodes;
    const selection = state.selection.filter((id) => alive[id] && !removed.has(id));
    // truncate any redo tail, then append this batch to the mirror log
    const log = state.historyLog.slice(0, state.historyCursor);
    log.push({ summary: b.summary ?? 'Edit', provenance: b.provenance.mode, diff: summary, before, after: next, pageId: safePage(next, state.activePageId) });
    set({
      doc: next,
      activePageId: safePage(next, state.activePageId),
      lastDiff: summary,
      lastBefore: before,
      lastPageId: safePage(next, state.activePageId),
      selection,
      editingId: state.editingId && alive[state.editingId] ? state.editingId : null,
      historyLog: log,
      historyCursor: log.length,
      mode: router.mode,
    });
  },

  undo: () => {
    if (!history.canUndo) return;
    history.undo();
    const next = history.current;
    const alive = instanceView(next).doc.nodes;
    set((s) => ({
      doc: next,
      activePageId: safePage(next, s.activePageId),
      selection: s.selection.filter((id) => alive[id]),
      historyCursor: Math.max(0, s.historyCursor - 1),
      lastDiff: null,
      lastBefore: null,
      lastPageId: null,
    }));
  },
  redo: () => {
    if (!history.canRedo) return;
    history.redo();
    const next = history.current;
    const alive = instanceView(next).doc.nodes;
    set((s) => {
      const cursor = Math.min(s.historyLog.length, s.historyCursor + 1);
      return {
        doc: next,
        activePageId: safePage(next, s.activePageId),
        selection: s.selection.filter((id) => alive[id]),
        historyCursor: cursor,
        lastDiff: s.historyLog[cursor - 1]?.diff ?? null,
        lastBefore: s.historyLog[cursor - 1]?.before ?? null,
        lastPageId: s.historyLog[cursor - 1]?.pageId ?? null,
      };
    });
  },
  restoreTo: (cursor) => {
    const target = Math.max(0, Math.min(get().historyLog.length, cursor));
    let guard = 0;
    while (get().historyCursor > target && guard++ < 1000) get().undo();
    while (get().historyCursor < target && guard++ < 1000) get().redo();
  },

  addShape: (kind, at) => {
    const { doc, activePageId } = get();
    const page = safePage(doc, activePageId);
    const base = { x: Math.round(at.x), y: Math.round(at.y) };
    let node: DesignNode | undefined;
    if (kind === 'rectangle') node = rectNode('Rectangle', { ...base, width: 160, height: 120, cornerRadius: 10, fills: [{ kind: 'token', ref: 'color.surfaceAlt' }] });
    else if (kind === 'ellipse') node = ellipseNode('Ellipse', { ...base, width: 140, height: 140, fills: [{ kind: 'token', ref: 'color.accent' }] });
    else if (kind === 'frame') node = frameNode('Frame', undefined, { ...base, width: 240, height: 180, fills: [{ kind: 'token', ref: 'color.surface' }] });
    else if (kind === 'text')
      node = textNode('Text', 'Type something', { fontFamilyToken: 'font.family.body', sizeToken: 'font.size.lg', weight: 500, lineHeight: 1.3, letterSpacing: 0, align: 'left' }, { ...base, width: 220, height: 32, fills: [{ kind: 'token', ref: 'color.text' }] });
    if (!node) return;
    get().commitOps([ops.addSubtree(page, childIdList(doc.nodes[page]!).length, [node])], `Add ${node.name}`);
    set({ selection: [node.id], tool: 'select', editingId: kind === 'text' ? node.id : null });
  },

  moveSelectionBy: (dx, dy) => {
    const { doc, selection } = get();
    const { meta } = instanceView(doc);
    const opList: Op[] = [];
    // selected projected clones have no authored node — their move becomes accumulated x/y overrides
    const cloneDeltas = new Map<string, Map<string, { x: number; y: number }>>();
    for (const id of selection) {
      const m = meta[id];
      if (m && m.instanceId !== id) {
        const byMaster = cloneDeltas.get(m.instanceId) ?? new Map();
        const cur = byMaster.get(m.masterId) ?? { x: 0, y: 0 };
        byMaster.set(m.masterId, { x: cur.x + dx, y: cur.y + dy });
        cloneDeltas.set(m.instanceId, byMaster);
        continue;
      }
      const n = doc.nodes[id];
      if (!n || n.locked) continue;
      opList.push(ops.updateNode(id, { x: Math.round(n.x + dx), y: Math.round(n.y + dy) }));
    }
    for (const [instanceId, byMaster] of cloneDeltas) {
      const inst = doc.nodes[instanceId];
      if (!inst || inst.type !== 'instance' || inst.locked) continue;
      const next: InstanceNode['overrides'] = { ...inst.overrides };
      for (const [masterId, d] of byMaster) {
        const geom = { ...(next[masterId] ?? {}) };
        geom.x = Math.round((geom.x ?? 0) + d.x);
        geom.y = Math.round((geom.y ?? 0) + d.y);
        next[masterId] = geom;
      }
      opList.push(ops.updateNode(instanceId, { overrides: next }));
    }
    if (opList.length) get().commitOps(opList, `Move ${opList.length} node(s)`);
  },

  resizeTo: (id, g) => {
    const { doc, activePageId } = get();
    const { doc: view, meta } = instanceView(doc);
    const m = meta[id];
    if (m && m.instanceId !== id) {
      const inst = doc.nodes[m.instanceId];
      const clone = view.nodes[id];
      // g arrives in absolute page-layout space (Canvas liveGeom), so compare against the
      // clone's *layout* rect, not its node coords — the difference is the instance offset.
      const layout = layoutPage(view, activePageId);
      const cur = layout[id];
      if (!inst || inst.type !== 'instance' || inst.locked || !clone || !cur) return;
      const next: InstanceNode['overrides'] = { ...inst.overrides };
      const geom = { ...(next[m.masterId] ?? {}) };
      geom.x = Math.round((geom.x ?? 0) + (g.x - cur.x));
      geom.y = Math.round((geom.y ?? 0) + (g.y - cur.y));
      geom.width = Math.round(Math.max(1, g.width));
      geom.height = Math.round(Math.max(1, g.height));
      next[m.masterId] = geom;
      get().commitOps([ops.updateNode(m.instanceId, { overrides: next })], `Resize ${clone.name}`);
      return;
    }
    const n = doc.nodes[id];
    if (!n || n.locked) return;
    get().commitOps([ops.updateNode(id, { x: Math.round(g.x), y: Math.round(g.y), width: Math.round(g.width), height: Math.round(g.height) })], `Resize ${n.name}`);
  },

  updateNode: (id, patch) => get().commitOps([ops.updateNode(id, patch)], `Edit ${get().doc.nodes[id]?.name ?? 'node'}`),

  rotateSubtree: (id, deg) => {
    const { doc, activePageId } = get();
    const n = doc.nodes[id];
    if (!n || n.locked) return;
    // an instance rotates as a unit: the projection bake (ADR 0005 amendment 3) turns its clones
    if (n.type === 'instance') {
      get().commitOps([ops.updateNode(id, { rotation: deg })], `Rotate ${n.name}`);
      return;
    }
    const { doc: view } = instanceView(doc);
    const layout = layoutPage(view, activePageId);
    const delta = deg - n.rotation;
    const opList: Op[] = [ops.updateNode(id, { rotation: deg })];
    if (layout[id] && delta) {
      const plan = subtreeRotatePlan(view, layout, id, delta);
      for (const [pid, p] of Object.entries(plan)) {
        const a = doc.nodes[pid];
        if (!a?.parentId) continue; // projected clone: the instance bake reproduces the preview
        const anchor = plan[a.parentId] ?? layout[a.parentId];
        if (!anchor) continue;
        opList.push(
          ops.updateNode(pid, {
            x: Math.round(p.x - anchor.x),
            y: Math.round(p.y - anchor.y),
            rotation: Math.round(p.rotation),
          }),
        );
      }
    }
    get().commitOps(opList, `Rotate ${n.name}`);
  },

  deleteSelection: () => {
    const { doc, selection } = get();
    const targets = selection.filter((id) => {
      const n = doc.nodes[id];
      return n && n.parentId !== null && n.type !== 'page' && !hasSelectedAncestor(doc, id, selection);
    });
    if (!targets.length) return;
    get().commitOps(targets.map((id) => ops.removeSubtree(id)), `Delete ${targets.length} node(s)`);
    set({ selection: [] });
  },

  duplicateSelection: () => {
    const { doc, selection } = get();
    if (!selection.length) return;
    const opList: Op[] = [];
    const created: string[] = [];
    for (const id of selection) {
      const n = doc.nodes[id];
      if (!n?.parentId || n.type === 'page') continue;
      const clones = cloneSubtree(doc, id, 24, 24);
      const idx = childIdList(doc.nodes[n.parentId]!).indexOf(id) + 1;
      opList.push(ops.addSubtree(n.parentId, idx, clones));
      if (clones[0]) created.push(clones[0].id);
    }
    if (opList.length) get().commitOps(opList, `Duplicate ${selection.length}`);
    set({ selection: created });
  },

  bringForward: () => reorderSelection(get, 'max'),
  sendBackward: () => reorderSelection(get, 'min'),

  align: (mode) => {
    const { doc, selection, activePageId } = get();
    const page = safePage(doc, activePageId);
    const layout = layoutPage(doc, page);
    const items = selection
      .map((id) => ({ id, rect: layout[id] }))
      .filter((x) => x.rect && isAlignable(doc, x.id));
    if (!items.length) return;
    const pageRect = layout[page];
    const ref = items.length === 1 && pageRect ? pageRect : boundsOf(items.map((i) => ({ id: i.id, rect: i.rect! })));
    if (!ref) return;
    const deltas = computeAlign(items.map((i) => ({ id: i.id, rect: i.rect! })), ref, mode);
    commitDeltas(get, deltas, `Align ${mode}`);
  },

  distribute: (axis) => {
    const { doc, selection, activePageId } = get();
    const page = safePage(doc, activePageId);
    const layout = layoutPage(doc, page);
    const items = selection
      .map((id) => ({ id, rect: layout[id] }))
      .filter((x): x is { id: string; rect: NonNullable<typeof x.rect> } => Boolean(x.rect) && isAlignable(doc, x.id));
    if (items.length < 3) {
      set({ status: 'Distribute needs three or more selected layers.' });
      return;
    }
    const deltas = computeDistribute(items, axis);
    commitDeltas(get, deltas, `Distribute ${axis}`);
  },

  addPage: () => {
    const { doc } = get();
    const rootKids = childIdList(doc.nodes[doc.rootId]!);
    const pageCount = rootKids.filter((id) => doc.nodes[id]?.type === 'page').length;
    const page = pageNode(`Page ${pageCount + 1}`, { x: 0, y: 0, width: 1440, height: 900 });
    get().commitOps([ops.addSubtree(doc.rootId, rootKids.length, [page])], `Add ${page.name}`);
    set({ activePageId: page.id, selection: [] });
  },
  switchPage: (id) => {
    if (get().doc.nodes[id]?.type === 'page') set({ activePageId: id, selection: [], editingId: null });
  },

  createComponent: () => {
    const { doc, selection, activePageId } = get();
    const page = safePage(doc, activePageId);
    const targets = selection.filter((id) => doc.nodes[id]?.parentId === page && !doc.nodes[id]?.locked);
    if (!targets.length) {
      set({ status: 'Select layers on the page to make a component.' });
      return;
    }
    const layout = layoutPage(doc, page);
    const bb = boundsOfSubtree(layout, targets);
    if (!bb) return;
    const compId = newId('cmp');
    const instId = newId('ins');
    const name = doc.nodes[targets[0]!]?.name ?? 'Component';
    const comp = componentNode(name, {
      id: compId,
      x: Math.round(bb.x),
      y: Math.round(bb.y),
      width: Math.round(bb.width),
      height: Math.round(bb.height),
      fills: [],
    });
    const rootKids = childIdList(doc.nodes[doc.rootId]!);
    const pageKids = childIdList(doc.nodes[page]!);
    const opList: Op[] = [ops.addSubtree(doc.rootId, rootKids.length, [comp])];
    targets.forEach((id, i) => {
      const n = doc.nodes[id]!;
      opList.push(ops.reparent(id, compId, i));
      opList.push(ops.updateNode(id, { x: Math.round(n.x - bb.x), y: Math.round(n.y - bb.y) }));
    });
    const inst = instanceNode(name, compId, {
      id: instId,
      x: Math.round(bb.x),
      y: Math.round(bb.y),
      width: Math.round(bb.width),
      height: Math.round(bb.height),
    });
    opList.push(ops.addSubtree(page, pageKids.length, [inst]));
    get().commitOps(opList, `Create component ${name}`);
    set({ selection: [instId] });
  },

  insertInstance: (componentId) => {
    const { doc, activePageId } = get();
    const page = safePage(doc, activePageId);
    const comp = doc.nodes[componentId];
    if (!comp || comp.type !== 'component') {
      set({ status: 'Unknown component.' });
      return;
    }
    const id = newId('ins');
    const onPage = childIdList(doc.nodes[page]!).length;
    const inst = instanceNode(comp.name, componentId, {
      id,
      x: 80 + onPage * 24,
      y: 80 + onPage * 24,
      width: comp.width,
      height: comp.height,
    });
    get().commitOps([ops.addSubtree(page, onPage, [inst])], `Insert ${comp.name}`);
    set({ selection: [id] });
  },

  detachInstance: () => {
    const { doc, selection, activePageId } = get();
    const instId = selection.find((id) => doc.nodes[id]?.type === 'instance');
    if (!instId) {
      set({ status: 'Select an instance to detach.' });
      return;
    }
    const page = safePage(doc, activePageId);
    const { doc: view } = instanceView(doc);
    const inst = view.nodes[instId];
    if (!inst) return;
    const ir = layoutPage(view, page)[instId] ?? { x: inst.x, y: inst.y };
    const groupId = newId('grp');
    const group = groupNode(inst.name, {
      id: groupId,
      x: Math.round(ir.x),
      y: Math.round(ir.y),
      width: Math.round(inst.width),
      height: Math.round(inst.height),
    });
    const collected: DesignNode[] = [group];
    const convert = (cid: string, parentId: string): string => {
      const src = view.nodes[cid]!;
      const nid = newId(src.type.slice(0, 2));
      const copy = JSON.parse(JSON.stringify(src)) as DesignNode;
      copy.id = nid;
      copy.parentId = parentId;
      if (copy.type === 'instance') {
        // detach keeps concrete geometry, not a live sub-instance
        const g = copy as unknown as Record<string, unknown>;
        g.type = 'group';
        g.clipContent = false;
        delete g.componentId;
        delete g.overrides;
      }
      copy.childIds = src.childIds.map((k) => convert(k, nid));
      collected.push(copy);
      return nid;
    };
    group.childIds = inst.childIds.map((cid) => convert(cid, groupId));
    const pageKids = childIdList(doc.nodes[page]!);
    const idx = Math.max(0, pageKids.indexOf(instId));
    get().commitOps(
      [ops.addSubtree(page, idx, collected), ops.removeSubtree(instId)],
      `Detach ${inst.name}`,
    );
    set({ selection: [groupId] });
  },

  setInstanceOverride: (instanceId, masterId, patch) => {
    const { doc } = get();
    const n = doc.nodes[instanceId];
    if (!n || n.type !== 'instance') return;
    const next: InstanceNode['overrides'] = { ...n.overrides };
    const geom: { x?: number; y?: number; width?: number; height?: number; visible?: boolean; rotation?: number; cornerRadius?: number; fills?: Paint[] } = { ...(next[masterId] ?? {}) };
    let touched = false;
    if (patch.x !== undefined) { geom.x = Math.round(patch.x); touched = true; }
    if (patch.y !== undefined) { geom.y = Math.round(patch.y); touched = true; }
    if (patch.width !== undefined) { geom.width = Math.round(Math.max(1, patch.width)); touched = true; }
    if (patch.height !== undefined) { geom.height = Math.round(Math.max(1, patch.height)); touched = true; }
    if (patch.visible !== undefined) { geom.visible = patch.visible; touched = true; }
    if (patch.rotation !== undefined) { geom.rotation = Math.round(patch.rotation); touched = true; }
    // Radius clamps at 0 rather than 1: a square corner is a value, not an absence (unlike width).
    if (patch.cornerRadius !== undefined) { geom.cornerRadius = Math.round(Math.max(0, patch.cornerRadius)); touched = true; }
    if (patch.fills !== undefined) { geom.fills = [...patch.fills]; touched = true; }
    if (!touched) {
      const isEmpty = geom.x === undefined && geom.y === undefined && geom.width === undefined && geom.height === undefined && geom.visible === undefined && geom.rotation === undefined && geom.cornerRadius === undefined && geom.fills === undefined;
      if (isEmpty) delete next[masterId];
    } else {
      next[masterId] = geom;
    }
    if (patch.characters !== undefined) next.text = { ...(next.text ?? {}), [masterId]: patch.characters };
    get().commitOps([ops.updateNode(instanceId, { overrides: next })], 'Set instance override');
  },

  setInteraction: (i) => set({ interaction: i }),
  setLiveGeom: (g) => set({ liveGeom: g }),
  clearLiveGeom: () => set({ liveGeom: {}, guides: { xs: [], ys: [] }, rotations: {} }),
  setGuides: (g) => set({ guides: g }),
  setRotations: (r) => set({ rotations: r }),
  setFocused: (id) => set({ focusedInstanceId: id }),
  setPreview: (open) => set({ previewOpen: open }),
  setStatus: (s) => set({ status: s }),

  loadDocument: (doc) => {
    history = new History(doc);
    set({ doc, activePageId: safePage(doc, doc.activePageId), selection: [], editingId: null, focusedInstanceId: null, lastDiff: null, lastBefore: null, lastPageId: null, historyLog: [], historyCursor: 0, status: 'Restored from local snapshot' });
  },

  generate: async (prompt) => {
    if (!prompt.trim()) return;
    set({ aiBusy: true, status: 'Composing design (DEMO MODE)…' });
    try {
      const res = await router.generateDesign({ prompt, document: history.current });
      const before = history.current;
      const after = history.dispatch(res.batch);
      const summary = diffFromBatch(before, after, res.batch);
      const state = get();
      const log = state.historyLog.slice(0, state.historyCursor);
      log.push({ summary: res.batch.summary ?? 'Generate', provenance: 'demo', diff: summary, before, after, pageId: after.activePageId });
      set({
        doc: after,
        activePageId: safePage(after, after.activePageId),
        aiBusy: false,
        mode: router.mode,
        lastDiff: summary,
        lastBefore: before,
        lastPageId: after.activePageId,
        historyLog: log,
        historyCursor: log.length,
        status: `${res.usage.model} → ${res.batch.summary}`,
      });
    } catch (e) {
      set({ aiBusy: false, status: 'Generation failed: ' + (e instanceof Error ? e.message : '') });
    }
  },

  editSelection: async (instruction) => {
    if (!instruction.trim()) return;
    if (!get().selection.length) {
      set({ status: 'Select one or more layers, then give an edit instruction.' });
      return;
    }
    set({ aiBusy: true, status: 'Applying AI edit (DEMO MODE)…' });
    try {
      const res = await router.editDesign({ instruction, document: history.current, selectedNodeIds: get().selection });
      const before = history.current;
      const after = history.dispatch(res.batch);
      const summary = diffFromBatch(before, after, res.batch);
      const state = get();
      const log = state.historyLog.slice(0, state.historyCursor);
      log.push({ summary: res.batch.summary ?? 'AI edit', provenance: 'demo', diff: summary, before, after, pageId: after.activePageId });
      set({ doc: after, aiBusy: false, mode: router.mode, lastDiff: summary, lastBefore: before, lastPageId: after.activePageId, historyLog: log, historyCursor: log.length, status: res.batch.summary ?? 'AI edit applied' });
    } catch (e) {
      set({ aiBusy: false, status: 'Edit failed: ' + (e instanceof Error ? e.message : '') });
    }
  },

  newProject: () => {
    history = new History(createEmptyDocument('Untitled Project'));
    const d = history.current;
    set({ doc: d, activePageId: d.activePageId, selection: [], editingId: null, focusedInstanceId: null, lastDiff: null, lastBefore: null, lastPageId: null, historyLog: [], historyCursor: 0, status: 'New project' });
  },
}));

// ---- helpers -------------------------------------------------------------
function isAlignable(doc: DesignDocument, id: string): boolean {
  const n = doc.nodes[id];
  return !!n && !n.locked && n.parentId !== null && n.type !== 'page' && n.type !== 'document';
}
function commitDeltas(get: () => StudioState, deltas: Record<string, { dx: number; dy: number }>, summary: string): void {
  const { doc } = get();
  const opList: Op[] = [];
  for (const [id, { dx, dy }] of Object.entries(deltas)) {
    const n = doc.nodes[id];
    if (!n) continue;
    const nx = Math.round(n.x + dx);
    const ny = Math.round(n.y + dy);
    if (nx !== n.x || ny !== n.y) opList.push(ops.updateNode(id, { x: nx, y: ny }));
  }
  if (opList.length) get().commitOps(opList, summary);
}
function hasSelectedAncestor(doc: DesignDocument, id: string, selection: string[]): boolean {
  let cur = doc.nodes[id]?.parentId;
  while (cur) {
    if (selection.includes(cur)) return true;
    cur = doc.nodes[cur]?.parentId;
  }
  return false;
}
function reorderSelection(get: () => StudioState, dir: 'min' | 'max'): void {
  const { doc, selection } = get();
  const opList: Op[] = [];
  for (const id of selection) {
    const n = doc.nodes[id];
    if (!n?.parentId) continue;
    const sibs = childIdList(doc.nodes[n.parentId]!);
    const target = dir === 'max' ? sibs.length - 1 : 0;
    if (sibs[target] !== id) opList.push(ops.reorder(id, n.parentId, target));
  }
  if (opList.length) get().commitOps(opList, dir === 'max' ? 'Bring forward' : 'Send backward');
}
