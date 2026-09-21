/**
 * Reversible operations (ADR 0006). Undo/redo, snapshots, AI-diff and version lineage all
 * derive from this single primitive: every change is a named, pure `Op` applied by `applyOp`,
 * and `invertOp(model, op)` returns the exact op that undoes it against the *current* model.
 *
 * Ops never mutate: they return a new `DesignDocument` with structural sharing (only the
 * touched node objects and the nodes map container are recreated).
 */
import type { DesignDocument, DesignNode, NexusId, TokenGroup } from './types.js';

/** A shallow property patch for a node. Kept loose because nodes are a discriminated union. */
export type NodePatch = Record<string, unknown>;

export type Op =
  | { type: 'addSubtree'; parentId: NexusId; index: number; nodes: DesignNode[] }
  | { type: 'removeSubtree'; id: NexusId }
  | { type: 'updateNode'; id: NexusId; patch: NodePatch }
  | { type: 'reorder'; id: NexusId; parentId: NexusId; toIndex: number }
  | { type: 'reparent'; id: NexusId; toParentId: NexusId; toIndex: number }
  | { type: 'setTokens'; tokens: TokenGroup };

export interface OpBatch {
  id: string;
  ops: Op[];
  provenance: { mode: 'user' | 'demo' | 'live'; provider?: string; label?: string };
  timestamp: number;
  /** Human/AI description used in the AI Diff panel (§36). */
  summary?: string;
}

export class OpValidationError extends Error {
  constructor(message: string, public readonly op?: Op) {
    super(message);
    this.name = 'OpValidationError';
  }
}

export function getNode(doc: DesignDocument, id: NexusId): DesignNode | undefined {
  return doc.nodes[id];
}

function withNodes(doc: DesignDocument, nodes: Record<NexusId, DesignNode>): DesignDocument {
  return { ...doc, nodes };
}

function withNode(doc: DesignDocument, id: NexusId, next: DesignNode): DesignDocument {
  return withNodes(doc, { ...doc.nodes, [id]: next });
}

/** Collect an id and all descendant ids (post-order, safe for removal). */
export function subtreeIds(doc: DesignDocument, id: NexusId): NexusId[] {
  const out: NexusId[] = [];
  const walk = (nid: NexusId) => {
    const n = doc.nodes[nid];
    if (!n) return;
    for (const c of n.childIds) walk(c);
    out.push(nid);
  };
  walk(id);
  return out;
}

function setChildIds(doc: DesignDocument, parentId: NexusId, childIds: NexusId[]): DesignDocument {
  const parent = doc.nodes[parentId];
  if (!parent) throw new OpValidationError(`parent not found: ${parentId}`);
  const patch = parent.type === 'document' ? { pageIds: childIds } : { childIds };
  return withNode(doc, parentId, { ...parent, ...patch } as DesignNode);
}

function childIdsOf(doc: DesignDocument, parentId: NexusId): NexusId[] {
  const p = doc.nodes[parentId];
  if (!p) throw new OpValidationError(`parent not found: ${parentId}`);
  return p.type === 'document' ? p.pageIds : p.childIds;
}

export function applyOp(doc: DesignDocument, op: Op): DesignDocument {
  switch (op.type) {
    case 'addSubtree': {
      const inserted = op.nodes[0];
      if (!inserted) throw new OpValidationError('addSubtree needs at least one node', op);
      if (doc.nodes[inserted.id]) throw new OpValidationError(`node exists: ${inserted.id}`, op);
      // insert all nodes of the subtree; the top node is wired to `parentId` by the reducer
      let next = withNodes(doc, { ...doc.nodes });
      for (const n of op.nodes) next = withNodes(next, { ...next.nodes, [n.id]: n });
      next = withNode(next, inserted.id, { ...inserted, parentId: op.parentId } as DesignNode);
      // wire into parent at index
      const ids = childIdsOf(next, op.parentId).slice();
      const idx = Math.max(0, Math.min(op.index, ids.length));
      ids.splice(idx, 0, inserted.id);
      next = setChildIds(next, op.parentId, ids);
      return next;
    }
    case 'removeSubtree': {
      const target = doc.nodes[op.id];
      if (!target) throw new OpValidationError(`node not found: ${op.id}`, op);
      if (target.parentId == null) throw new OpValidationError('cannot remove a root', op);
      const ids = new Set(subtreeIds(doc, op.id));
      const remaining: Record<NexusId, DesignNode> = {};
      for (const [k, v] of Object.entries(doc.nodes)) if (!ids.has(k)) remaining[k] = v;
      let next = withNodes(doc, remaining);
      const sibs = childIdsOf(next, target.parentId).filter((c) => c !== op.id);
      next = setChildIds(next, target.parentId, sibs);
      return next;
    }
    case 'updateNode': {
      const node = doc.nodes[op.id];
      if (!node) throw new OpValidationError(`node not found: ${op.id}`, op);
      return withNode(doc, op.id, { ...node, ...op.patch } as DesignNode);
    }
    case 'reorder': {
      const ids = childIdsOf(doc, op.parentId).filter((c) => c !== op.id);
      const idx = Math.max(0, Math.min(op.toIndex, ids.length));
      ids.splice(idx, 0, op.id);
      return setChildIds(doc, op.parentId, ids);
    }
    case 'reparent': {
      if (op.toParentId === op.id) throw new OpValidationError('cannot reparent into self', op);
      if (subtreeIds(doc, op.id).includes(op.toParentId))
        throw new OpValidationError('cannot reparent into own subtree', op);
      const src = doc.nodes[op.id]?.parentId;
      let next = doc;
      if (src) {
        const sibs = childIdsOf(next, src).filter((c) => c !== op.id);
        next = setChildIds(next, src, sibs);
      }
      const dst = childIdsOf(next, op.toParentId).slice();
      const idx = Math.max(0, Math.min(op.toIndex, dst.length));
      dst.splice(idx, 0, op.id);
      next = setChildIds(next, op.toParentId, dst);
      const moved = next.nodes[op.id];
      if (moved) next = withNode(next, op.id, { ...moved, parentId: op.toParentId } as DesignNode);
      return next;
    }
    case 'setTokens':
      return { ...doc, tokens: op.tokens };
    default:
      throw new OpValidationError('unknown op', op as Op);
  }
}

/**
 * Invert a single op **against the document as it was *before* the op ran**. Callers build a
 * batch inverse by computing every op's inverse from the pre-batch document and replaying them
 * in reverse order. (For the common, non-overlapping batches this is exact; see KNOWN_ISSUES
 * for the edge case of many ops mutating one parent's child order.)
 */
export function invertOp(before: DesignDocument, op: Op): Op {
  switch (op.type) {
    case 'addSubtree': {
      const top = op.nodes[0];
      if (!top) throw new OpValidationError('addSubtree has no root node', op);
      return { type: 'removeSubtree', id: top.id };
    }
    case 'removeSubtree': {
      const target = before.nodes[op.id];
      if (!target) throw new OpValidationError(`node not found: ${op.id}`, op);
      const parentId = target.parentId as NexusId;
      const nodes = subtreeIds(before, op.id)
        .reverse()
        .map((id) => before.nodes[id])
        .filter((n): n is DesignNode => Boolean(n))
        // normalize so the top node is first while descendants follow their parents
        .sort((a, b) => depth(before, a.id) - depth(before, b.id));
      const index = childIdsOf(before, parentId).indexOf(op.id);
      return { type: 'addSubtree', parentId, index, nodes };
    }
    case 'updateNode': {
      const node = before.nodes[op.id];
      if (!node) throw new OpValidationError(`node not found: ${op.id}`, op);
      const patch: NodePatch = {};
      for (const key of Object.keys(op.patch)) {
        patch[key] = (node as unknown as Record<string, unknown>)[key];
      }
      return { type: 'updateNode', id: op.id, patch };
    }
    case 'reorder': {
      const fromIndex = childIdsOf(before, op.parentId).indexOf(op.id);
      return { type: 'reorder', id: op.id, parentId: op.parentId, toIndex: fromIndex };
    }
    case 'reparent': {
      const moved = before.nodes[op.id];
      const oldParent = (moved?.parentId ?? op.toParentId) as NexusId;
      const oldIndex = childIdsOf(before, oldParent).indexOf(op.id);
      return { type: 'reparent', id: op.id, toParentId: oldParent, toIndex: Math.max(0, oldIndex) };
    }
    case 'setTokens':
      return { type: 'setTokens', tokens: before.tokens };
    default:
      throw new OpValidationError('cannot invert op', op as Op);
  }
}

function depth(doc: DesignDocument, id: NexusId): number {
  let d = 0;
  let cur = doc.nodes[id];
  while (cur && cur.parentId) {
    d++;
    cur = doc.nodes[cur.parentId];
  }
  return d;
}

/** Build the inverse op list that rewinds `batch` from the pre-batch document. */
export function invertBatch(before: DesignDocument, batch: OpBatch): Op[] {
  return batch.ops.map((op) => invertOp(before, op)).reverse();
}

/** Apply a batch with the §9 "never destroy user code silently" guard. */
export function applyBatch(doc: DesignDocument, batch: OpBatch): DesignDocument {
  let next = doc;
  const ai = batch.provenance.mode !== 'user';
  for (const op of batch.ops) {
    if (ai) guardLocked(next, op);
    next = applyOp(next, op);
  }
  return next;
}

/** AI/demo batches may not modify `locked` nodes (protects code-only / locked regions). */
function guardLocked(doc: DesignDocument, op: Op): void {
  const touches = (id: NexusId): void => {
    const n = doc.nodes[id];
    if (n && n.locked)
      throw new OpValidationError(`AI batch cannot modify locked node '${id}' (${n.name})`, op);
  };
  if (op.type === 'updateNode' || op.type === 'removeSubtree' || op.type === 'reorder' || op.type === 'reparent')
    touches(op.id);
  if (op.type === 'reparent') touches(op.toParentId);
  if (op.type === 'addSubtree') touches(op.parentId);
}

/** Convenience constructors used by UI + composers. */
export const ops = {
  addSubtree: (parentId: NexusId, index: number, nodes: DesignNode[]): Op => ({
    type: 'addSubtree',
    parentId,
    index,
    nodes,
  }),
  removeSubtree: (id: NexusId): Op => ({ type: 'removeSubtree', id }),
  updateNode: (id: NexusId, patch: NodePatch): Op => ({ type: 'updateNode', id, patch }),
  reorder: (id: NexusId, parentId: NexusId, toIndex: number): Op => ({
    type: 'reorder',
    id,
    parentId,
    toIndex,
  }),
  reparent: (id: NexusId, toParentId: NexusId, toIndex: number): Op => ({
    type: 'reparent',
    id,
    toParentId,
    toIndex,
  }),
  setTokens: (tokens: TokenGroup): Op => ({ type: 'setTokens', tokens }),
};
