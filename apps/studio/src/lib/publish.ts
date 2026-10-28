/**
 * M8 — PUBLISHING a design as a template: the catalog's missing producer, as a PURE handoff.
 *
 * <p>The template catalog could be searched, priced, bought and remixed, but nothing in the tree could
 * PUT a listing into it except a hand-written fixture. That is the creator's entry point, and without
 * it "creator economy" means "a catalog someone typed". This module is that entry point: it takes a
 * canonical Design Document and an author's terms, and answers either a VALID listing or a refusal.
 *
 * <p>Two rules keep it honest (§60):
 * <ul>
 *   <li><b>A listing clones a document that is actually publishable.</b> The document goes through
 *       `validateDocument` — the model's own graph-and-geometry verdict — before anything is built. A
 *       document whose graph draws something subtly wrong must not become a product a buyer opens.</li>
 *   <li><b>The catalog's rules are not restated here.</b> The listing is validated by `addTemplate`
 *       against an EMPTY catalog, so "what a listing must be" has one owner (trimmed title, whole-cent
 *       price, declared category, normalized tags) and publishing cannot drift from adding.</li>
 * </ul>
 *
 * <p>What this is NOT: it does not write a catalog, mint a listing id, or charge anyone. The host
 * supplies the id, the terms and the instant (ADR 0010); persistence is `catalogStore`'s or a
 * service's business, and the price is arithmetic until a payment exists (ADR 0018).
 */

import { validateDocument, type DesignDocument } from '@nexus/design-model';

import { addTemplate, emptyTemplateCatalog, type TemplateListing } from './templateCatalog';

/** The author's terms. `now` is host-supplied; the model never reads a clock (ADR 0010). */
export interface PublishTemplateInput {
  id: string;
  title: string;
  description: string;
  authorId: string;
  priceCents: number;
  category: TemplateListing['category'];
  tags: string[];
  now: number;
}

export type PublishDecision = { ok: true; listing: TemplateListing } | { ok: false; reason: string };

/**
 * Turn a design into a listing, or refuse it by name. Pure: the document and the input are never
 * mutated, and the returned listing is the NORMALIZED copy the catalog would store.
 */
export function publishTemplate(doc: DesignDocument, input: PublishTemplateInput): PublishDecision {
  const verdict = validateDocument(doc);
  if (!verdict.ok) {
    const [first, ...rest] = verdict.problems;
    return { ok: false, reason: `the design is not publishable: ${first!.detail}${rest.length ? ` (+${rest.length} more)` : ''}` };
  }

  const added = addTemplate(emptyTemplateCatalog(), {
    id: input.id,
    title: input.title,
    description: input.description,
    authorId: input.authorId,
    priceCents: input.priceCents,
    category: input.category,
    tags: input.tags,
    documentId: doc.id,
    createdAt: input.now,
  });
  if (!added.ok) return { ok: false, reason: added.reason };
  return { ok: true, listing: added.listing };
}
