import type { DesignDocument } from './types.js';
import { applyOp, invertBatch, type Op, type OpBatch } from './ops.js';

export interface HistoryEntry {
  batch: OpBatch;
  inverse: Op[];
  /** cheap references (structural sharing keeps this O(1)-ish, not a deep clone) */
  before: DesignDocument;
  after: DesignDocument;
}

/**
 * Linear undo/redo stack over committed batches (ADR 0006). Each entry stores the batch, its
 * precomputed inverse, and references to the before/after documents so navigation is exact and
 * cheap thanks to structural sharing. Snapshots (§35) reuse the same entries.
 */
export class History {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private limit: number;

  constructor(
    public current: DesignDocument,
    limit = 200,
  ) {
    this.limit = Math.max(1, limit);
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
  get depth(): number {
    return this.past.length;
  }

  /** Apply a batch to the current document, pushing it onto history. */
  dispatch(batch: OpBatch): DesignDocument {
    if (batch.ops.length === 0) return this.current;
    const before = this.current;
    let after = before;
    for (const op of batch.ops) after = applyOp(after, op);
    const inverse = invertBatch(before, batch);
    this.past.push({ batch, inverse, before, after });
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    this.current = after;
    return after;
  }

  undo(): DesignDocument | null {
    const entry = this.past.pop();
    if (!entry) return null;
    let doc = this.current;
    for (const op of entry.inverse) doc = applyOp(doc, op);
    this.current = doc;
    this.future.push(entry);
    return doc;
  }

  redo(): DesignDocument | null {
    const entry = this.future.pop();
    if (!entry) return null;
    let doc = this.current;
    for (const op of entry.batch.ops) doc = applyOp(doc, op);
    this.current = doc;
    this.past.push(entry);
    return doc;
  }

  /** A user-visible snapshot reference for the Snapshots panel (§35). */
  snapshots(): { index: number; summary?: string; provenance: string }[] {
    return this.past.map((e, index) => ({
      index,
      summary: e.batch.summary,
      provenance: e.batch.provenance.mode,
    }));
  }
}
