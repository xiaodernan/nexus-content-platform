import type { DesignDocument, NexusId } from './types.js';
import type { NodePatch, OpBatch } from './ops.js';

/** Semantic before/after summary for the AI Diff panel (§36). Derived from the batch's ops. */
export interface DiffSummary {
  added: NexusId[];
  removed: NexusId[];
  moved: NexusId[];
  modified: { id: NexusId; keys: string[]; patch: NodePatch }[];
  tokensChanged: boolean;
  nodeCountBefore: number;
  nodeCountAfter: number;
}

export function diffFromBatch(before: DesignDocument, after: DesignDocument, batch: OpBatch): DiffSummary {
  const added = new Set<NexusId>();
  const removed = new Set<NexusId>();
  const moved = new Set<NexusId>();
  const modified = new Map<NexusId, { keys: Set<string>; patch: NodePatch }>();
  let tokensChanged = false;

  for (const op of batch.ops) {
    switch (op.type) {
      case 'addSubtree':
        for (const n of op.nodes) added.add(n.id);
        break;
      case 'removeSubtree':
        removed.add(op.id);
        break;
      case 'updateNode': {
        const entry = modified.get(op.id) ?? { keys: new Set<string>(), patch: {} };
        for (const k of Object.keys(op.patch)) {
          entry.keys.add(k);
          entry.patch[k] = op.patch[k];
        }
        modified.set(op.id, entry);
        break;
      }
      case 'reorder':
      case 'reparent':
        moved.add(op.id);
        break;
      case 'setTokens':
        tokensChanged = true;
        break;
    }
  }
  return {
    added: [...added],
    removed: [...removed],
    moved: [...moved],
    modified: [...modified.entries()].map(([id, v]) => ({ id, keys: [...v.keys], patch: v.patch })),
    tokensChanged,
    nodeCountBefore: Object.keys(before.nodes).length,
    nodeCountAfter: Object.keys(after.nodes).length,
  };
}
