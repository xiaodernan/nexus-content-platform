/**
 * M8 — the LOCAL-FIRST catalog store: the catalog's persistence seam, and the place a published
 * listing can actually LAND.
 *
 * <p>`publishTemplate` turns a design into a listing and `addTemplate` puts it in a catalog — but a
 * catalog lived only in memory (the `/credits` page still composes a demo one). `creditsStore` gave the
 * LEDGER a local-first home; this gives the INVENTORY the same home, over the same minimal storage seam
 * (`getItem`/`setItem`) that `localStorage` and a Map-backed double satisfy. It is deliberately its own
 * seam type rather than an import of the credits store's: the two stores are independent, and neither
 * should have to exist for the other to compile.
 *
 * <p>Three rules keep it honest (§60):
 * <ul>
 *   <li><b>Absence and corruption are DIFFERENT facts.</b> A key that is not there is an EMPTY catalog
 *       (`source: 'empty'`) — a new install lists nothing, which is not an error. A key that is there
 *       but unreadable is REFUSED with the reason; silently emptying it would delete an inventory.</li>
 *   <li><b>Every listing is re-validated, and duplicates are caught.</b> Each stored listing goes back
 *       through `addTemplate` against the catalog built SO FAR, so a record with two listings under one
 *       id is refused — not just each listing's own fields.</li>
 *   <li><b>What is saved can be loaded.</b> `saveCatalog` rebuilds the catalog through the same rules
 *       BEFORE writing, so the store cannot persist an inventory its own loader would reject.</li>
 * </ul>
 *
 * <p>What this is NOT: it is not a service, an authority or a moderation layer. It does not decide who
 * may publish, what a listing is worth, or whether a listing should be visible; a key is only as
 * trustworthy as the storage that holds it.
 */

import { addTemplate, emptyTemplateCatalog, type TemplateCatalog, type TemplateListing } from './templateCatalog';

/** The only format this build reads or writes. A bump is a new ADR-worthy decision. */
export const CATALOG_FORMAT_VERSION = 1;

/** The one key this build writes, namespaced away from the credits ledger's. */
export const CATALOG_STORAGE_KEY = 'nexus.catalog.v1';

export interface CatalogEnvelope {
  version: number;
  listings: TemplateListing[];
}

/** The storage seam: the shape `localStorage` and a Map-backed double both satisfy. */
export interface CatalogKv {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Deterministic: the same catalog writes the same bytes. Tags are copied, never aliased. */
export function serializeCatalog(catalog: TemplateCatalog): string {
  const envelope: CatalogEnvelope = {
    version: CATALOG_FORMAT_VERSION,
    listings: catalog.listings.map((listing) => ({ ...listing, tags: [...listing.tags] })),
  };
  return JSON.stringify(envelope);
}

export type CatalogLoad = { ok: true; catalog: TemplateCatalog; source: 'stored' | 'empty' } | { ok: false; reason: string };
export type CatalogParse = { ok: true; catalog: TemplateCatalog } | { ok: false; reason: string };

/**
 * Parse and validate wire text into a catalog, or refuse it BY NAME. The envelope's version is checked
 * first; then each listing is added to the catalog built so far, which is what makes a DUPLICATE id a
 * refusal rather than two rows a reader would have to notice.
 */
export function deserializeCatalog(text: string): CatalogParse {
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, reason: 'the catalog text is empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, reason: `the catalog text is not JSON: ${(err as Error).message}` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, reason: 'the catalog envelope is not an object' };

  const envelope = parsed as { version?: unknown; listings?: unknown };
  if (envelope.version !== CATALOG_FORMAT_VERSION) {
    return { ok: false, reason: `unsupported catalog format version ${String(envelope.version)} — this build reads ${CATALOG_FORMAT_VERSION}` };
  }
  if (!Array.isArray(envelope.listings)) return { ok: false, reason: 'the catalog envelope carries no listings array' };

  let catalog = emptyTemplateCatalog();
  for (const [index, raw] of envelope.listings.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: `listing ${index} is not an object` };
    const listing = raw as Partial<TemplateListing>;
    if (!Array.isArray(listing.tags) || listing.tags.some((tag) => typeof tag !== 'string')) {
      return { ok: false, reason: `listing ${String(listing.id)} has a tag list that is not an array of strings` };
    }
    const added = addTemplate(catalog, listing as TemplateListing);
    if (!added.ok) return { ok: false, reason: `listing ${String(listing.id)}: ${added.reason}` };
    catalog = added.catalog;
  }
  return { ok: true, catalog };
}

/** Load the catalog. An ABSENT key is an empty catalog; a PRESENT but unreadable key is a refusal. */
export function loadCatalog(kv: CatalogKv, key: string = CATALOG_STORAGE_KEY): CatalogLoad {
  const raw = kv.getItem(key);
  if (raw === null) return { ok: true, catalog: emptyTemplateCatalog(), source: 'empty' };
  const loaded = deserializeCatalog(raw);
  if (!loaded.ok) return { ok: false, reason: loaded.reason };
  return { ok: true, catalog: loaded.catalog, source: 'stored' };
}

export type CatalogSave = { ok: true; bytes: number } | { ok: false; reason: string };

/**
 * Save the catalog. Rebuilds it through `addTemplate` FIRST (so what is saved can be loaded), reports a
 * storage failure by name, and returns the byte count written.
 */
export function saveCatalog(kv: CatalogKv, catalog: TemplateCatalog, key: string = CATALOG_STORAGE_KEY): CatalogSave {
  let rebuilt = emptyTemplateCatalog();
  for (const listing of catalog.listings) {
    const added = addTemplate(rebuilt, listing);
    if (!added.ok) return { ok: false, reason: `refusing to save an invalid catalog: ${added.reason}` };
    rebuilt = added.catalog;
  }
  const text = serializeCatalog(rebuilt);
  try {
    kv.setItem(key, text);
  } catch (err) {
    return { ok: false, reason: `the storage refused the write: ${(err as Error).message}` };
  }
  return { ok: true, bytes: text.length };
}
