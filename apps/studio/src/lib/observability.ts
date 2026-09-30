/**
 * Studio observability bridge (§56 observability, §57 evaluation, §32 proof-of-work).
 *
 * Why this exists: every earlier milestone had to verify the Studio by scraping rendered
 * text out of the DOM, which is brittle and cannot express "how many nodes are in the
 * canonical Design Model right now". This module exposes a **strictly read-only**,
 * JSON-serialisable snapshot of editor state on `window.__nexus` so that:
 *
 *   - the verification harness (tools/harness) can assert against real state, not markup;
 *   - the §57 Evaluation Framework has a machine-readable observation surface;
 *   - a human can open devtools and see exactly what the model holds.
 *
 * It deliberately exposes NO mutators: verification must not be able to drive the product
 * through a back door, and the bridge must never become a second source of truth.
 *
 * The snapshot builder is a pure function of a plain state slice, so it is unit-testable
 * without React, Zustand or a DOM.
 */
import { childIdList, layoutPage, type DesignDocument } from '@nexus/design-model';

/** The slice of Studio state the bridge reports. Structural typing keeps this decoupled. */
export interface ObservableState {
  doc: DesignDocument;
  activePageId: string;
  selection: string[];
  tool: string;
  viewport: { x: number; y: number; zoom: number };
  historyCursor: number;
  historyLog: { summary: string; provenance: string }[];
  mode: 'demo' | 'live';
  status: string;
  previewOpen: boolean;
  aiBusy: boolean;
  lastDiff: unknown;
  focusedInstanceId: string | null;
}

export interface NodeSummary {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  childCount: number;
  visible: boolean;
  locked: boolean;
  /** Finite, positive laid-out rect, or null when the node does not lay out on the page. */
  rect: { x: number; y: number; width: number; height: number } | null;
}

export interface StudioSnapshot {
  /** Bumped when the shape of this snapshot changes, so consumers can detect drift. */
  schema: 1;
  mode: 'demo' | 'live';
  status: string;
  docName: string;
  rootId: string;
  pageIds: string[];
  activePageId: string;
  /** Total nodes in the canonical document, including the document root and page roots. */
  nodeCount: number;
  /** Nodes that lay out on the active page (excludes the document/page roots). */
  activePageNodeCount: number;
  nodes: NodeSummary[];
  /** Distinct node types present — a cheap "is the composer parameterised" signal. */
  nodeTypes: string[];
  selection: string[];
  focusedInstanceId: string | null;
  tool: string;
  viewport: { x: number; y: number; zoom: number };
  history: { cursor: number; length: number; entries: { summary: string; provenance: string }[] };
  previewOpen: boolean;
  aiBusy: boolean;
  lastDiff: unknown;
}

/** Walk the document depth-first from its root, recording parentage. Cycle-safe. */
function walk(doc: DesignDocument, id: string, parentId: string | null, out: NodeSummary[]): void {
  const node = doc.nodes[id];
  if (!node) return;
  if (out.some((n) => n.id === id)) return; // defensive: malformed doc must not hang the bridge
  const kids = childIdList(node);
  out.push({
    id,
    name: node.name,
    type: node.type,
    parentId,
    childCount: kids.length,
    visible: node.visible !== false,
    locked: node.locked === true,
    rect: null,
  });
  for (const kid of kids) walk(doc, kid, id, out);
}

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * Build a plain, JSON-safe snapshot of the editor.
 *
 * `layoutPage` is the same geometry the canvas paints from, so `activePageNodeCount` and the
 * per-node rects are model-derived rather than DOM-derived — exactly what §8 asks for, and
 * what makes the snapshot usable as visual-QA evidence (§30).
 */
export function buildSnapshot(state: ObservableState): StudioSnapshot {
  const summaries: NodeSummary[] = [];
  walk(state.doc, state.doc.rootId, null, summaries);

  const laid = layoutPage(state.doc, state.activePageId);
  for (const s of summaries) {
    const r = laid[s.id];
    if (!r) continue;
    if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
    if (!Number.isFinite(r.width) || !Number.isFinite(r.height)) continue;
    if (r.width <= 0 || r.height <= 0) continue;
    s.rect = { x: round(r.x), y: round(r.y), width: round(r.width), height: round(r.height) };
  }

  const docNode = state.doc.nodes[state.doc.rootId];
  const pageIds = docNode ? childIdList(docNode) : [];
  const structural = new Set([state.doc.rootId, ...pageIds]);

  return {
    schema: 1,
    mode: state.mode,
    status: state.status,
    docName: state.doc.name,
    rootId: state.doc.rootId,
    pageIds,
    activePageId: state.activePageId,
    nodeCount: summaries.length,
    // Content nodes that actually lay out on the active page — excludes the document root,
    // page roots, and anything parked off-page (component masters, ADR 0015).
    activePageNodeCount: summaries.filter((s) => s.rect !== null && !structural.has(s.id)).length,
    nodes: summaries,
    nodeTypes: [...new Set(summaries.map((s) => s.type))].sort(),
    selection: [...state.selection],
    focusedInstanceId: state.focusedInstanceId,
    tool: state.tool,
    viewport: { ...state.viewport },
    history: {
      cursor: state.historyCursor,
      length: state.historyLog.length,
      entries: state.historyLog.map((e) => ({ summary: e.summary, provenance: e.provenance })),
    },
    previewOpen: state.previewOpen,
    aiBusy: state.aiBusy,
    lastDiff: state.lastDiff ?? null,
  };
}

export interface NexusBridge {
  /** Read-only snapshot of the current editor state. */
  snapshot: () => StudioSnapshot;
  /** Convenience: the canonical node count. */
  nodeCount: () => number;
  /** Convenience: names of content nodes on the active page, in document order. */
  activePageNames: () => string[];
  /** Identifies the bridge so a consumer can assert it is the real one. */
  readonly version: string;
}

/**
 * M5 v142 — the read-only side of the 3D surface, on the same bridge.
 *
 * The 3D scene is NOT part of the Design Document: it is a runtime the Studio composes and drives, so
 * it cannot ride `snapshot()`. It gets its own installed reader instead of a second, parallel global,
 * and it keeps the rule this file is built on — a snapshot function over a live source, no mutators,
 * nothing invented. `Scene3D.tsx` registers the live surface; a component that is not mounted
 * registers nothing, so `scene3d()` answering `null` means "no 3D surface is running", which is true.
 */
export interface Scene3DBridge {
  /** The live scene report, read at call time. `null` when no 3D surface is mounted. */
  scene3d: () => unknown;
  /** Identifies the reader so a consumer can assert it is the real one. */
  readonly version: string;
}

export function installSceneBridge(
  read: () => unknown,
  target: Record<string, unknown> = globalThis as unknown as Record<string, unknown>,
): Scene3DBridge {
  const bridge: Scene3DBridge = Object.freeze({
    version: 'nexus-studio-scene3d/1',
    scene3d: () => read(),
  });
  target.__nexusScene3d = bridge;
  return bridge;
}


/**
 * Install the bridge. `getState` is called lazily on every read so the snapshot is always
 * current, and the object is frozen to make accidental mutation loud rather than silent.
 */
export function installBridge(
  getState: () => ObservableState,
  target: Record<string, unknown> = globalThis as unknown as Record<string, unknown>,
): NexusBridge {
  const bridge: NexusBridge = Object.freeze({
    version: 'nexus-studio-bridge/1',
    snapshot: () => buildSnapshot(getState()),
    nodeCount: () => buildSnapshot(getState()).nodeCount,
    activePageNames: () => {
      const snap = buildSnapshot(getState());
      const structural = new Set([snap.rootId, ...snap.pageIds]);
      return snap.nodes.filter((n) => n.rect !== null && !structural.has(n.id)).map((n) => n.name);
    },
  });
  target.__nexus = bridge;
  return bridge;
}
