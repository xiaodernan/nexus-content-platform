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
 * <p>v542 — THE SHELF REMEMBERS WHAT IT WITHDREW. A take-down used to be a plain removal: the listing
 * vanished from the saved record, and nothing could put it back because nothing remembered it. Format 2
 * adds a `withdrawn` list beside `listings` — the SAME listing records, kept apart from the shelf — so a
 * retire is a move rather than a delete, and a put-back is a move back. The two lists are one inventory:
 * an id in both is refused by name, exactly as two listings under one id are.
 *
 * <p>The document version is 2; documents written by this build's predecessor (version 1) are MIGRATED,
 * not rejected, because their absence of a withdrawal record is truthful — nothing had been remembered
 * yet. The STORAGE KEY stays `nexus.catalog.v1`: renaming it to match the format would orphan every
 * shelf already written under it, and the key is a namespace, not the document's version.
 *
 * <p>What this is NOT: it is not a service, an authority or a moderation layer. It does not decide who
 * may publish, what a listing is worth, or whether a listing should be visible; a key is only as
 * trustworthy as the storage that holds it.
 */

import { addTemplate, emptyTemplateCatalog, type TemplateCatalog, type TemplateListing } from './templateCatalog';

/** The format this build writes. It still READS 1, as a migration — see `deserializeCatalog`. */
export const CATALOG_FORMAT_VERSION = 2;

/** The one key this build writes, namespaced away from the credits ledger's. */
export const CATALOG_STORAGE_KEY = 'nexus.catalog.v1';

export interface CatalogEnvelope {
  version: number;
  listings: TemplateListing[];
  withdrawn: TemplateListing[];
}

/** The storage seam: the shape `localStorage` and a Map-backed double both satisfy. */
export interface CatalogKv {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Deterministic: the same shelf writes the same bytes. Tags are copied, never aliased. */
export function serializeCatalog(catalog: TemplateCatalog, withdrawn: readonly TemplateListing[] = []): string {
  const copy = (listing: TemplateListing): TemplateListing => ({ ...listing, tags: [...listing.tags] });
  const envelope: CatalogEnvelope = {
    version: CATALOG_FORMAT_VERSION,
    listings: catalog.listings.map(copy),
    withdrawn: withdrawn.map(copy),
  };
  return JSON.stringify(envelope);
}

export type CatalogLoad =
  | { ok: true; catalog: TemplateCatalog; withdrawn: TemplateListing[]; source: 'stored' | 'empty' }
  | { ok: false; reason: string };
export type CatalogParse =
  | { ok: true; catalog: TemplateCatalog; withdrawn: TemplateListing[] }
  | { ok: false; reason: string };

type ShelfRead = { ok: true; catalog: TemplateCatalog } | { ok: false; reason: string };

/** One stored record read as a listing, or refused by name. `label` names the list it came from. */
function readListing(raw: unknown, index: number, label: string): { ok: true; listing: TemplateListing } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: `${label} ${index} is not an object` };
  const listing = raw as Partial<TemplateListing>;
  if (!Array.isArray(listing.tags) || listing.tags.some((tag) => typeof tag !== 'string')) {
    return { ok: false, reason: `${label} ${String(listing.id)} has a tag list that is not an array of strings` };
  }
  return { ok: true, listing: listing as TemplateListing };
}

/**
 * Rebuild a list of stored records through `addTemplate` against the shelf built SO FAR, which is what
 * makes a DUPLICATE id a refusal rather than two rows a reader would have to notice.
 */
function readShelf(entries: unknown[], label: string): ShelfRead {
  let catalog = emptyTemplateCatalog();
  for (const [index, raw] of entries.entries()) {
    const read = readListing(raw, index, label);
    if (!read.ok) return read;
    const added = addTemplate(catalog, read.listing);
    if (!added.ok) return { ok: false, reason: `${label} ${String(read.listing.id)}: ${added.reason}` };
    catalog = added.catalog;
  }
  return { ok: true, catalog };
}

/**
 * Parse and validate wire text into a shelf (and its withdrawal record), or refuse it BY NAME. The
 * envelope's version is checked first; a version-1 document is migrated (no withdrawals were
 * remembered), while a version-2 document must carry both arrays and cannot name one id twice across
 * them — a listing that is both for sale and withdrawn is a contradiction, not a state.
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

  const envelope = parsed as { version?: unknown; listings?: unknown; withdrawn?: unknown };
  if (envelope.version !== 1 && envelope.version !== CATALOG_FORMAT_VERSION) {
    return {
      ok: false,
      reason: `unsupported catalog format version ${String(envelope.version)} — this build reads 1 (as a migration) and ${CATALOG_FORMAT_VERSION}`,
    };
  }
  if (!Array.isArray(envelope.listings)) return { ok: false, reason: 'the catalog envelope carries no listings array' };

  const listed = readShelf(envelope.listings, 'listing');
  if (!listed.ok) return listed;

  // Version 1 predates remembered take-downs. Its missing array is the MIGRATION, not corruption: an
  // empty withdrawal record is the truthful reading of a document written before any were kept.
  if (envelope.version === 1) return { ok: true, catalog: listed.catalog, withdrawn: [] };

  if (!Array.isArray(envelope.withdrawn)) return { ok: false, reason: 'the catalog envelope carries no withdrawn array' };
  const withdrawn = readShelf(envelope.withdrawn, 'withdrawn listing');
  if (!withdrawn.ok) return withdrawn;

  const listedIds = new Set(listed.catalog.listings.map((entry) => entry.id));
  for (const entry of withdrawn.catalog.listings) {
    if (listedIds.has(entry.id)) return { ok: false, reason: `template ${entry.id} is both listed and withdrawn` };
  }
  return { ok: true, catalog: listed.catalog, withdrawn: [...withdrawn.catalog.listings] };
}

/** Load the shelf. An ABSENT key is an empty shelf; a PRESENT but unreadable key is a refusal. */
export function loadCatalog(kv: CatalogKv, key: string = CATALOG_STORAGE_KEY): CatalogLoad {
  const raw = kv.getItem(key);
  if (raw === null) return { ok: true, catalog: emptyTemplateCatalog(), withdrawn: [], source: 'empty' };
  const loaded = deserializeCatalog(raw);
  if (!loaded.ok) return { ok: false, reason: loaded.reason };
  return { ok: true, catalog: loaded.catalog, withdrawn: loaded.withdrawn, source: 'stored' };
}

export type CatalogSave = { ok: true; bytes: number } | { ok: false; reason: string };

/**
 * Save the shelf and its withdrawal record. Rebuilds BOTH lists through `addTemplate` FIRST (so what is
 * saved can be loaded), refuses an id that appears on both sides, reports a storage failure by name,
 * and returns the byte count written.
 */
export function saveCatalog(
  kv: CatalogKv,
  catalog: TemplateCatalog,
  withdrawn: readonly TemplateListing[] = [],
  key: string = CATALOG_STORAGE_KEY,
): CatalogSave {
  let rebuilt = emptyTemplateCatalog();
  for (const listing of catalog.listings) {
    const added = addTemplate(rebuilt, listing);
    if (!added.ok) return { ok: false, reason: `refusing to save an invalid catalog: ${added.reason}` };
    rebuilt = added.catalog;
  }
  const listedIds = new Set(rebuilt.listings.map((entry) => entry.id));
  let rebuiltWithdrawn = emptyTemplateCatalog();
  for (const listing of withdrawn) {
    const added = addTemplate(rebuiltWithdrawn, listing);
    if (!added.ok) return { ok: false, reason: `refusing to save an invalid catalog: the withdrawn record names ${listing.id} twice` };
    if (listedIds.has(listing.id)) return { ok: false, reason: `refusing to save an invalid catalog: ${listing.id} is both listed and withdrawn` };
    rebuiltWithdrawn = added.catalog;
  }
  const text = serializeCatalog(rebuilt, rebuiltWithdrawn.listings);
  try {
    kv.setItem(key, text);
  } catch (err) {
    return { ok: false, reason: `the storage refused the write: ${(err as Error).message}` };
  }
  return { ok: true, bytes: text.length };
}
