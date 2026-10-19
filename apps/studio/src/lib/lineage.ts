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
 */
export function readRemixedFrom(document: unknown): string | null {
  if (document === null || typeof document !== 'object') return null;
  const lineage = (document as Record<string, unknown>)._lineage;
  if (lineage === null || typeof lineage !== 'object') return null;
  const source = (lineage as Record<string, unknown>).sourceProjectId;
  return typeof source === 'string' && source.length > 0 ? source : null;
}
