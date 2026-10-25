/**
 * M8 — the TEMPLATE catalog: the creator economy's inventory, as a PURE model.
 *
 * <p>M8 names marketplace, templates, credits and subscriptions. Subscriptions, tips and plans are
 * built (service + studio) and the credits ledger now exists (`credits.ts`); the thing a creator
 * would actually BROWSE did not. This is that half: an append-only catalog of listings whose every
 * view — by author, by category, by price band, by search — is DERIVED from the listings and never
 * stored beside them, the same discipline `credits.ts` and `validateDocument` follow.
 *
 * <p>Search is deliberately HONEST about what it is (§60): exact token matching over the title,
 * description and tags, scored by how many fields a token lands in. It is not semantic, it does not
 * understand synonyms, and a query that matches nothing answers an empty list rather than a
 * fuzzy "did you mean". The score is a ranking aid, not a claim about relevance.
 *
 * <p>What this module is NOT: it holds no persistence, no service call and no upload path. A
 * listing's `documentId` (the Design Model it would clone) is an opaque string here — turning a
 * listing into a project is the remix lane's job, not the catalog's.
 */

export type TemplateCategory = 'landing' | 'dashboard' | 'mobile' | 'social' | 'print' | 'other';

const CATEGORIES: ReadonlySet<TemplateCategory> = new Set<TemplateCategory>(['landing', 'dashboard', 'mobile', 'social', 'print', 'other']);

/** One listing in the catalog. */
export interface TemplateListing {
  id: string;
  title: string;
  description: string;
  /** The account that published it (the shape `accounts.ts` mints). */
  authorId: string;
  /** Whole cents. 0 is a FREE template — a price is never negative. */
  priceCents: number;
  category: TemplateCategory;
  /** Lowercased, de-duplicated, non-empty. The catalog normalizes on add; it never rewrites one in place. */
  tags: readonly string[];
  /** Opaque id of the Design Document this listing clones (the remix lane's subject). */
  documentId: string;
  /** Epoch milliseconds, host-supplied — the catalog never reads a clock. */
  createdAt: number;
}

export interface TemplateCatalog {
  readonly listings: readonly TemplateListing[];
}

export type TemplateAddDecision = { ok: true; catalog: TemplateCatalog; listing: TemplateListing } | { ok: false; reason: string };

export function emptyTemplateCatalog(): TemplateCatalog {
  return { listings: [] };
}

/** Normalize tags: lowercase, trim, drop empties, de-duplicate, keep first-seen order. */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const t = raw.trim().toLowerCase();
    if (t === '' || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** The query's own tokens: lowercased, split on non-alphanumerics, length >= 2, de-duplicated. */
export function queryTokens(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2))];
}

/**
 * Add one listing, or refuse it BY NAME. The listing's tags are normalized into the stored copy;
 * the caller's array is never mutated and never aliased.
 */
export function addTemplate(catalog: TemplateCatalog, listing: TemplateListing): TemplateAddDecision {
  if (typeof listing.id !== 'string' || listing.id === '') return { ok: false, reason: 'a template needs a non-empty id' };
  if (catalog.listings.some((l) => l.id === listing.id)) return { ok: false, reason: `template id "${listing.id}" is already listed` };
  if (typeof listing.title !== 'string' || listing.title.trim() === '') return { ok: false, reason: 'a template needs a non-empty title — a listing nobody can read is not a listing' };
  if (typeof listing.description !== 'string' || listing.description.trim() === '') return { ok: false, reason: 'a template needs a non-empty description' };
  if (typeof listing.authorId !== 'string' || listing.authorId === '') return { ok: false, reason: 'a template needs the authorId it was published under' };
  if (typeof listing.documentId !== 'string' || listing.documentId === '') return { ok: false, reason: 'a template needs the documentId it clones' };
  if (typeof listing.priceCents !== 'number' || !Number.isInteger(listing.priceCents) || listing.priceCents < 0) {
    return { ok: false, reason: `a template price must be a whole number of cents, zero or more — got ${String(listing.priceCents)}` };
  }
  if (!CATEGORIES.has(listing.category)) return { ok: false, reason: `unknown template category "${String(listing.category)}" — the declared set is ${[...CATEGORIES].join(', ')}` };
  if (typeof listing.createdAt !== 'number' || !Number.isFinite(listing.createdAt)) return { ok: false, reason: 'a template needs a finite createdAt (the host supplies the instant)' };
  const stored: TemplateListing = { ...listing, title: listing.title.trim(), description: listing.description.trim(), tags: normalizeTags(listing.tags) };
  return { ok: true, catalog: { listings: [...catalog.listings, stored] }, listing: stored };
}

export function templateById(catalog: TemplateCatalog, id: string): TemplateListing | null {
  return catalog.listings.find((l) => l.id === id) ?? null;
}

export function listingsByAuthor(catalog: TemplateCatalog, authorId: string): TemplateListing[] {
  return catalog.listings.filter((l) => l.authorId === authorId);
}

export function listingsByCategory(catalog: TemplateCatalog, category: TemplateCategory): TemplateListing[] {
  return catalog.listings.filter((l) => l.category === category);
}

export function freeListings(catalog: TemplateCatalog): TemplateListing[] {
  return catalog.listings.filter((l) => l.priceCents === 0);
}

/**
 * Search: every query token must land in at least one of title / description / tags (AND
 * semantics), and the score is the number of (token, field) hits — a ranking aid, not a claim.
 * Results are ordered by score desc, then createdAt desc, then id asc, so the answer is
 * deterministic for a given catalog and query.
 */
export function searchTemplates(catalog: TemplateCatalog, query: string): { listing: TemplateListing; score: number }[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const scored: { listing: TemplateListing; score: number }[] = [];
  for (const l of catalog.listings) {
    const title = l.title.toLowerCase();
    const desc = l.description.toLowerCase();
    let score = 0;
    let matchedAll = true;
    for (const t of tokens) {
      let hits = 0;
      if (title.includes(t)) hits++;
      if (desc.includes(t)) hits++;
      if (l.tags.some((tag) => tag.includes(t))) hits++;
      if (hits === 0) { matchedAll = false; break; }
      score += hits;
    }
    if (matchedAll) scored.push({ listing: l, score });
  }
  scored.sort((a, b) => b.score - a.score || b.listing.createdAt - a.listing.createdAt || (a.listing.id < b.listing.id ? -1 : a.listing.id > b.listing.id ? 1 : 0));
  return scored;
}

/** A stable price sort (ascending); ties keep catalog order. */
export function sortByPriceAsc(catalog: TemplateCatalog): TemplateListing[] {
  return catalog.listings.map((l, i) => [l, i] as const).sort((a, b) => a[0].priceCents - b[0].priceCents || a[1] - b[1]).map(([l]) => l);
}

/** Newest first; ties keep catalog order. */
export function sortByNewest(catalog: TemplateCatalog): TemplateListing[] {
  return catalog.listings.map((l, i) => [l, i] as const).sort((a, b) => b[0].createdAt - a[0].createdAt || a[1] - b[1]).map(([l]) => l);
}
