'use client';
import { create } from 'zustand';
import {
  History,
  createEmptyDocument,
  diffFromBatch,
  ops,
  subtreeIds,
  rectNode,
  ellipseNode,
  frameNode,
  textNode,
  childIdList,
  type DesignDocument,
  type DesignNode,
  type DiffSummary,
  type Op,
  type OpBatch,
  type Point,
} from '@nexus/design-model';
import { ModelRouter } from '@nexus/ai-providers';

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

interface StudioState {
  doc: DesignDocument;
  selection: string[];
  hoverId: string | null;
  viewport: Viewport;
  tool: Tool;
  interaction: Interaction;
  liveGeom: Record<string, LiveGeom>;
  previewOpen: boolean;
  aiBusy: boolean;
  lastDiff: DiffSummary | null;
  mode: 'demo' | 'live';
  status: string;

  setTool: (t: Tool) => void;
  setHover: (id: string | null) => void;
  setViewport: (v: Viewport) => void;
  zoomAt: (factor: number, screenPt: Point) => void;
  select: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;
  toggleInSelection: (id: string) => void;

  commitOps: (ops: Op[], summary: string, provenance?: OpBatch['provenance']) => void;
  dispatch: (batch: OpBatch) => void;
  undo: () => void;
  redo: () => void;

  addShape: (kind: Tool, at: Point) => void;
  moveSelectionBy: (dx: number, dy: number) => void;
  resizeTo: (id: string, g: LiveGeom) => void;
  updateNode: (id: string, patch: Record<string, unknown>) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  bringForward: () => void;
  sendBackward: () => void;

  setInteraction: (i: Interaction) => void;
  setLiveGeom: (g: Record<string, LiveGeom>) => void;
  clearLiveGeom: () => void;
  setPreview: (open: boolean) => void;
  setStatus: (s: string) => void;

  generate: (prompt: string) => Promise<void>;
  editSelection: (instruction: string) => Promise<void>;
  newProject: () => void;
}

let history = new History(createEmptyDocument('My First World'));
export const router = new ModelRouter();

const uid = () => 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const userProvenance: OpBatch['provenance'] = { mode: 'user' };

function mkBatch(opsList: Op[], summary: string, provenance: OpBatch['provenance'] = userProvenance): OpBatch {
  return { id: uid(), ops: opsList, provenance, timestamp: Date.now(), summary };
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
  // return top-first so addSubtree wires correctly
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
  selection: [],
  hoverId: null,
  viewport: { x: 60, y: 48, zoom: 0.55 },
  tool: 'select',
  interaction: { type: 'idle' },
  liveGeom: {},
  previewOpen: false,
  aiBusy: false,
  lastDiff: null,
  mode: router.mode,
  status: 'Ready',

  setTool: (t) => set({ tool: t }),
  setHover: (id) => set({ hoverId: id }),
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
    const selection = get().selection.filter((id) => next.nodes[id] && !removed.has(id));
    set({ doc: next, lastDiff: summary, selection, mode: router.mode });
  },

  undo: () => {
    history.undo();
    set((s) => ({ doc: history.current, selection: s.selection.filter((id) => history.current.nodes[id]), lastDiff: null }));
  },
  redo: () => {
    history.redo();
    set((s) => ({ doc: history.current, selection: s.selection.filter((id) => history.current.nodes[id]), lastDiff: null }));
  },

  addShape: (kind, at) => {
    const { doc } = get();
    const page = doc.activePageId;
    const base = { x: Math.round(at.x), y: Math.round(at.y) };
    let node: DesignNode | undefined;
    if (kind === 'rectangle') node = rectNode('Rectangle', { ...base, width: 160, height: 120, cornerRadius: 10, fills: [{ kind: 'token', ref: 'color.surfaceAlt' }] });
    else if (kind === 'ellipse') node = ellipseNode('Ellipse', { ...base, width: 140, height: 140, fills: [{ kind: 'token', ref: 'color.accent' }] });
    else if (kind === 'frame') node = frameNode('Frame', undefined, { ...base, width: 240, height: 180, fills: [{ kind: 'token', ref: 'color.surface' }] });
    else if (kind === 'text')
      node = textNode('Text', 'Type something', { fontFamilyToken: 'font.family.body', sizeToken: 'font.size.lg', weight: 500, lineHeight: 1.3, letterSpacing: 0, align: 'left' }, { ...base, width: 220, height: 32, fills: [{ kind: 'token', ref: 'color.text' }] });
    if (!node) return;
    get().commitOps([ops.addSubtree(page, childIdList(doc.nodes[page]!).length, [node])], `Add ${node.name}`);
    set({ selection: [node.id], tool: 'select' });
  },

  moveSelectionBy: (dx, dy) => {
    const { doc, selection } = get();
    const opList: Op[] = [];
    for (const id of selection) {
      const n = doc.nodes[id];
      if (!n || n.locked) continue;
      opList.push(ops.updateNode(id, { x: Math.round(n.x + dx), y: Math.round(n.y + dy) }));
    }
    if (opList.length) get().commitOps(opList, `Move ${opList.length} node(s)`);
  },

  resizeTo: (id, g) => {
    const n = get().doc.nodes[id];
    if (!n || n.locked) return;
    get().commitOps([ops.updateNode(id, { x: Math.round(g.x), y: Math.round(g.y), width: Math.round(g.width), height: Math.round(g.height) })], `Resize ${n.name}`);
  },

  updateNode: (id, patch) => get().commitOps([ops.updateNode(id, patch)], `Edit ${get().doc.nodes[id]?.name ?? 'node'}`),

  deleteSelection: () => {
    const { doc, selection } = get();
    const targets = selection.filter((id) => {
      const n = doc.nodes[id];
      return n && n.parentId !== null && !hasSelectedAncestor(doc, id, selection);
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
      if (!n?.parentId) continue;
      const clones = cloneSubtree(doc, id, 24, 24);
      const idx = childIdList(doc.nodes[n.parentId]!).indexOf(id) + 1;
      opList.push(ops.addSubtree(n.parentId, idx, clones));
      if (clones[0]) created.push(clones[0].id);
    }
    if (opList.length) get().commitOps(opList, `Duplicate ${selection.length}`);
    set({ selection: created });
  },

  bringForward: () => reorderSelection(get, set, 'max'),
  sendBackward: () => reorderSelection(get, set, 'min'),

  setInteraction: (i) => set({ interaction: i }),
  setLiveGeom: (g) => set({ liveGeom: g }),
  clearLiveGeom: () => set({ liveGeom: {} }),
  setPreview: (open) => set({ previewOpen: open }),
  setStatus: (s) => set({ status: s }),

  generate: async (prompt) => {
    if (!prompt.trim()) return;
    set({ aiBusy: true, status: 'Composing design (DEMO MODE)…' });
    try {
      const res = await router.generateDesign({ prompt, document: history.current });
      const before = history.current;
      const after = history.dispatch(res.batch);
      set({
        doc: after,
        aiBusy: false,
        mode: router.mode,
        lastDiff: diffFromBatch(before, after, res.batch),
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
      set({ doc: after, aiBusy: false, mode: router.mode, lastDiff: diffFromBatch(before, after, res.batch), status: res.batch.summary ?? 'AI edit applied' });
    } catch (e) {
      set({ aiBusy: false, status: 'Edit failed: ' + (e instanceof Error ? e.message : '') });
    }
  },

  newProject: () => {
    history = new History(createEmptyDocument('Untitled Project'));
    set({ doc: history.current, selection: [], lastDiff: null, status: 'New project' });
  },
}));

// ---- helpers -------------------------------------------------------------
function hasSelectedAncestor(doc: DesignDocument, id: string, selection: string[]): boolean {
  let cur = doc.nodes[id]?.parentId;
  while (cur) {
    if (selection.includes(cur)) return true;
    cur = doc.nodes[cur]?.parentId;
  }
  return false;
}
function reorderSelection(get: () => StudioState, set: (p: Partial<StudioState>) => void, dir: 'min' | 'max'): void {
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
  void set;
}
