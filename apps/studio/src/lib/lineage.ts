/**
 * M7 v252 — reading a publication's REMIX lineage back out of its document, in one place.
 *
 * The service writes `_lineage { sourceProjectId, remixedAt }` into the document JSON on remix. Two routes
 * read it back (EXPLORE cards and the artifact page), and both were hand-rolling the same guard chain — a
 * chain whose first draft did not typecheck against `DesignDocument` (the key is not in the model; it is a
 * SERVICE-written reservation on top of it), which is how a red `tsc` reached HEAD.
 *
 * The helper takes `unknown`, because that is what a fetched document IS before anyone has proven it a
 * `DesignDocument`: every property access is guarded, and a document that is null, a primitive, a lineage of
 * the wrong shape, or a missing/non-string/empty `sourceProjectId` answers `null` — "this is not a remix",
 * never a throw and never an empty string a UI would render as `remixed from `.
 *
 * **v267 — the WRITING half now lives here too, because the Studio's own remix path never wrote one.** The
 * service's `remix` endpoint records the lineage, and the Studio never called it: the Studio's remix is a
 * FORK IN THE EDITOR, so a publication made that way — the way a person actually remixes — carried no
 * source at all, and the "remixed from" link v251 made clickable could never appear on it. One module now
 * owns both halves of the reservation, and the key is declared in the canonical model
 * (`DesignDocument._lineage`) rather than being a convention three parties kept separately.
 */
import type { DesignDocument } from '@nexus/design-model';

export function readRemixedFrom(document: unknown): string | null {
  if (document === null || typeof document !== 'object') return null;
  const lineage = (document as Record<string, unknown>)._lineage;
  if (lineage === null || typeof lineage !== 'object') return null;
  const source = (lineage as Record<string, unknown>).sourceProjectId;
  return typeof source === 'string' && source.length > 0 ? source : null;
}

/**
 * v267 — stamp a document with the lineage of a remix.
 *
 * Pure: it returns a NEW document and never touches the one it was handed, because the fork it will be
 * applied to is the caller's own and the caller may still be holding it.
 *
 * Two rules, both stated rather than assumed:
 *   - it **OVERWRITES** any lineage the document already carried. A remix of a remix inherits its source's
 *     lineage through the fork (the fork spreads the document), and that inherited value names the WRONG
 *     source: the new copy descends from the copy it was made from, not from what that copy descended from.
 *     The original keeps its own source; this one names its own.
 *   - it **REFUSES** a blank source or a blank instant, by throwing. A lineage that names nothing is a
 *     claim about a provenance that does not exist, and a reader would render it as `remixed from ` — the
 *     same reason `forkDocument` throws for a root it cannot find: a document that cannot say where it came
 *     from is a fact, not a blank.
 */
export function stampLineage(document: DesignDocument, sourceProjectId: string, remixedAt: string): DesignDocument {
  if (typeof sourceProjectId !== 'string' || sourceProjectId.trim().length === 0) {
    throw new Error('stampLineage: the source project id must be a non-empty string; a lineage that names nothing is not a lineage');
  }
  if (typeof remixedAt !== 'string' || remixedAt.trim().length === 0) {
    throw new Error('stampLineage: the instant must be a non-empty string; a lineage that names no instant cannot be read back');
  }
  return { ...document, _lineage: { sourceProjectId, remixedAt } };
}
