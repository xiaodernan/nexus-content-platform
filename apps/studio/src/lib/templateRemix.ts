/**
 * M8 — the TEMPLATE REMIX handoff: where the marketplace's ownership meets the product's fork.
 *
 * <p>The credits ledger (`credits.ts`) records WHO owns WHAT (a buyer's `spend` entry carries the
 * template id in its `ref`), and the template catalog (`templateCatalog.ts`) records WHAT is for
 * sale. This module is the ONE place those two facts become a new project: a viewer who may remix
 * a template has its saved Design Document forked into a fresh one via the design-model's
 * `forkDocument`, which mints a new document id so the remix can never overwrite the source's
 * publication.
 *
 * <p>Three rules keep the handoff honest (§60):
 * <ul>
 *   <li><b>Ownership is DERIVED, not stored.</b> "May this viewer remix?" is answered by reading the
 *       ledger and the catalog — never a second, marketplace-specific "owner" list that could
 *       disagree with the ledger. A free template (`priceCents === 0`) is remixable by anyone; a
 *       paid one is remixable by its author or by a viewer who HOLDS it — `spend` minus `refund` per
 *       ref (`heldRefsOf`), so a refunded purchase stops being a right to remix.</li>
 *   <li><b>The fork is the product's job.</b> This module calls `forkDocument` and reports its
 *       outcome; it invents no document identity of its own, so a remix and a copy are the same
 *       primitive and cannot drift.</li>
 *   <li><b>A bad source is a fact, not a blank.</b> `forkDocument` throws when the document names a
 *       `rootId` its `nodes` do not hold; this module catches that and returns the reason by name
 *       rather than letting the throw escape into a caller's render path.</li>
 * </ul>
 *
 * <p>What this module is NOT: it does not resolve a `templateId` to its saved Design Document (a
 * store concern — the caller hands in the document it already resolved), and it moves NO credits
 * (a remix is free once you own the template). Both are stated bounds, not oversights.
 *
 * <p>v547 — THE FORK NOW SAYS WHERE IT CAME FROM. The M7 lane made `_lineage` the one way a document
 * records its source, and v267 taught the EDITOR's fork to write it; this handoff forked without one, so
 * a project remixed from the marketplace could never show as "remixed from" anything. The stamp names
 * the TEMPLATE id, because that is the identity a shelf, a buyer and an explore card can all resolve —
 * a source id, not necessarily a publication. The instant is the HOST's (ADR 0010): the model reads no
 * clock, so a remix without one is refused by name rather than dated by guesswork.
 */

import { forkDocument, type DesignDocument } from '@nexus/design-model';

import { heldRefsOf, type CreditLedger } from './credits';
import { stampLineage } from './lineage';
import { templateById, type TemplateCatalog } from './templateCatalog';

/** Whether this viewer may remix this template, and on what basis. Derived; decides nothing. */
export type RemixRight =
  | { ok: true; basis: 'free' | 'owned' }
  | { ok: false; reason: string };

/**
 * May this viewer remix this template into a new project? Free templates are open to anyone; paid
 * ones are open to the author or to a viewer with a `spend` entry whose `ref` names the template.
 */
export function remixRightFor(catalog: TemplateCatalog, ledger: CreditLedger, viewerId: string, templateId: string): RemixRight {
  const listing = templateById(catalog, templateId);
  if (!listing) return { ok: false, reason: `no template is listed under id "${templateId}"` };
  if (typeof viewerId !== 'string' || viewerId === '') return { ok: false, reason: 'a remix needs the viewerId it is requested by' };
  if (listing.priceCents === 0) return { ok: true, basis: 'free' };
  if (listing.authorId === viewerId) return { ok: true, basis: 'owned' };
  const owns = heldRefsOf(ledger, viewerId).has(templateId);
  if (owns) return { ok: true, basis: 'owned' };
  return { ok: false, reason: `${viewerId} does not hold "${listing.title}" — only the owner may remix a paid template` };
}

/** The outcome of forking a template into a new project, or the reason it could not be done. */
export type RemixResult =
  | { ok: true; document: DesignDocument; basis: 'free' | 'owned' }
  | { ok: false; reason: string };

/** The host's terms for a remix (ADR 0010): the instant it happened at, and the new project's name. */
export interface RemixOptions {
  /** When the host made this remix. Stamped into `_lineage.remixedAt`; a blank instant is refused. */
  remixedAt: string;
  /** The new project's name; the fork's own default is `<source name> (remix)`. */
  name?: string;
}

/**
 * Spin a NEW project from a template this viewer may remix. The caller resolves `templateId` to its
 * saved `sourceDoc` (a store concern, out of scope here) and passes that in. The fork mints a fresh
 * document id, so the returned project shares the template's graph but can never overwrite it — and it
 * carries a `_lineage` naming THIS template and the host's instant (v547).
 */
export function remixTemplateToProject(
  sourceDoc: DesignDocument,
  catalog: TemplateCatalog,
  ledger: CreditLedger,
  viewerId: string,
  templateId: string,
  options: RemixOptions,
): RemixResult {
  const right = remixRightFor(catalog, ledger, viewerId, templateId);
  if (!right.ok) return { ok: false, reason: right.reason };
  const remixedAt = options?.remixedAt;
  if (typeof remixedAt !== 'string' || remixedAt.trim() === '') {
    return { ok: false, reason: 'a remix needs the instant it was made at (remixedAt) — a fork that cannot say when is not a lineage' };
  }
  let forked: DesignDocument;
  try {
    forked = forkDocument(sourceDoc, options.name);
  } catch (err) {
    return { ok: false, reason: `the template document could not be forked: ${(err as Error).message}` };
  }
  // `templateId` came from the catalog (non-empty), and `remixedAt` was checked above, so the stamp's own
  // two refusals cannot fire here; it is still the ONE owner of the reservation, never a literal written here.
  return { ok: true, document: stampLineage(forked, templateId, remixedAt), basis: right.basis };
}
