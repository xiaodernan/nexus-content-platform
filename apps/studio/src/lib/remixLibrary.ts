/**
 * M8 v548 — THE REMIX LIBRARY: the forks a store already holds, read back as a list.
 *
 * <p>v547 gave the remix handoff both halves it had been missing — a SOURCE (the design store keeps the
 * document a listing's `documentId` names) and a PROVENANCE (`_lineage`, stamped with the template id and
 * the host's instant) — and then REPORTED the fork without keeping it: the note beside the store said
 * what had been forked, and a reload forgot it. A fork nobody can find again is a demonstration, not a
 * project (§60). This module is the READING half of that gap: given the documents a store holds and the
 * shelf that named their sources, it answers WHICH of those documents are forks and WHERE each came
 * from.
 *
 * <p>Three rules, stated rather than assumed:
 * <ul>
 *   <li><b>A fork is a document with a READABLE lineage, not a document in a fork list.</b> There is no
 *       second index that could disagree with the documents themselves — the same discipline the ledger
 *       follows for ownership (rights are derived, never stored). `readLineage` is the ONE guard chain;
 *       a document it cannot read is a draft, and a draft is not a fork.</li>
 *   <li><b>The source is named even when the shelf has stopped listing it.</b> A take-down decides what
 *       is FOR SALE, not what was remixed (v540/v542), so `sourceTitle` is `null` for a source the
 *       catalog no longer holds and the fork stays a row. Reporting the fork as sourceless would be the
 *       shelf's absence deleting the record's fact.</li>
 *   <li><b>Order is the store's order.</b> Documents arrive in the order they were saved, and this module
 *       does not re-sort by `remixedAt`: the model reads no clock (ADR 0010) and a string sort would be a
 *       chronology it invented.</li>
 * </ul>
 *
 * <p>What this is NOT: it is not a project list, an opener or a version history. It reads the current
 * bytes of documents a caller already loaded; it does not resolve ids to documents (a store concern),
 * and it never writes.
 */

import type { DesignDocument } from '@nexus/design-model';

import { readLineage } from './lineage';
import { templateById, type TemplateCatalog } from './templateCatalog';

/** One stored document that carries a lineage: the fork, its origin, and what the shelf says about it. */
export interface ForkRow {
  /** The fork's own document id — what a store would be asked to open. */
  documentId: string;
  /** The fork's name, as the document says it. */
  name: string;
  /** The template id the fork was stamped with (a source, resolved by the shelf when it can). */
  sourceProjectId: string;
  /** The host's instant, as stamped at fork time (never a clock read here). */
  remixedAt: string;
  /** The source listing's title while the shelf still lists it; `null` once it is gone. */
  sourceTitle: string | null;
}

/**
 * Which of these documents are forks, in store order — each naming its source and whether the shelf
 * still lists it. A document with no readable lineage is skipped: it is a draft, and calling it a fork
 * would invent a provenance the bytes do not carry.
 */
export function forksOf(designs: readonly DesignDocument[], catalog: TemplateCatalog): ForkRow[] {
  const rows: ForkRow[] = [];
  for (const document of designs) {
    const lineage = readLineage(document);
    if (lineage === null) continue;
    const source = templateById(catalog, lineage.sourceProjectId);
    rows.push({
      documentId: document.id,
      name: document.name,
      sourceProjectId: lineage.sourceProjectId,
      remixedAt: lineage.remixedAt,
      sourceTitle: source === null ? null : source.title,
    });
  }
  return rows;
}

/** One fork said in a sentence: what it is, where it came from, when, and which document it is. */
export function forkLine(row: ForkRow): string {
  const source =
    row.sourceTitle === null
      ? `${row.sourceProjectId} (no longer listed)`
      : `${row.sourceProjectId} ("${row.sourceTitle}")`;
  return `"${row.name}" ← ${source} · remixed ${row.remixedAt} · doc ${row.documentId}`;
}
