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

/**
 * The query's own tokens: lowercased, split on anything that is not a LETTER or NUMBER in ANY script,
 * de-duplicated. A token is kept when it is 2+ characters OR carries a non-ASCII character.
 *
 * <p>Both halves of that rule are deliberate. `\p{L}`/`\p{N}` keep non-Latin text: the previous
 * `[^a-z0-9]` split DELETED every CJK character, so a Chinese query tokenized to nothing and the
 * catalog could not be searched in Chinese at all — a real defect for a Chinese-facing product. The
 * 2-character floor is an ASCII heuristic (single Latin letters are noise), and the non-ASCII
 * exemption exists because in CJK a single character IS a word: "图" must be searchable.
 */
export function queryTokens(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length >= 2 || /[^\x00-\x7F]/.test(t)),
    ),
  ];
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

/** What a retire decided: the NEW catalog, the listing it withdrew, or a refusal by name. */
export type TemplateRetireDecision =
  | { ok: true; catalog: TemplateCatalog; listing: TemplateListing }
  | { ok: false; reason: string };

/**
 * Withdraw one listing, or refuse BY NAME (v539).
 *
 * <p>Until now the catalog could only ADD: a listing was immortal once it landed, so an author could
 * not take one down and the surface had no producer for "a listing that left the catalog" — the
 * situation `refundPairing` learned to reverse from the record in v538 could only be reached by
 * hand-built fixtures. This is the missing verb, and it is a WINDOW operation, not an eraser: the
 * catalog is what is FOR SALE now, while what was BOUGHT is the ledger's record (`credits.ts`), which
 * this function never touches. A retire therefore removes a listing from the shelf, not a purchase
 * from history — the wallet keeps owning a retired ref the record shows was sold (`walletView.ts`),
 * and a buyer can still be made whole for it (`refund.ts`).
 *
 * <p>A second retire of the same id is REFUSED rather than silently idempotent: naming a listing the
 * catalog no longer carries is an error the caller should see, and the refusal is what lets a
 * take-down command report "already withdrawn" instead of pretending it acted. A retired id may be
 * ADDED again — as the same listing or under a different author — because the catalog is a window
 * that can reopen; the previous purchase history stays with whichever account was actually paid.
 */
export function retireTemplate(catalog: TemplateCatalog, id: string): TemplateRetireDecision {
  if (typeof id !== 'string' || id === '') return { ok: false, reason: 'a retire needs the id of the listing to withdraw' };
  const listing = templateById(catalog, id);
  if (!listing) return { ok: false, reason: `the catalog lists no template "${id}" to retire` };
  return { ok: true, catalog: { listings: catalog.listings.filter((l) => l.id !== id) }, listing };
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
