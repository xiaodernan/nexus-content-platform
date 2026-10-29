/**
 * M8 — direct coverage for the template catalog (src/lib/templateCatalog.ts).
 *
 * The creator economy's inventory had no model before this module. These pin the rules a
 * marketplace is browsed through: an append-only catalog whose views are all DERIVED, add-time
 * refusals BY NAME (a listing nobody can read is not a listing), honest exact-token search with
 * AND semantics and a deterministic order, and stable sorts.
 */
import { describe, expect, it } from 'vitest';
import {
  addTemplate,
  discardWithdrawn,
  emptyTemplateCatalog,
  freeListings,
  listingsByAuthor,
  listingsByCategory,
  normalizeTags,
  queryTokens,
  relistTemplate,
  retireTemplate,
  searchTemplates,
  sortByNewest,
  sortByPriceAsc,
  templateById,
  type TemplateCatalog,
  type TemplateListing,
} from './templateCatalog';

const listing = (over: Partial<TemplateListing> = {}): TemplateListing => ({
  id: 't1',
  title: 'SaaS Landing Page',
  description: 'A hero, three features and a pricing table.',
  authorId: 'acc-1',
  priceCents: 4900,
  category: 'landing',
  tags: ['SaaS', 'Hero', 'Pricing'],
  documentId: 'doc-1',
  createdAt: 1_000,
  ...over,
});

function build(...entries: TemplateListing[]): TemplateCatalog {
  let c = emptyTemplateCatalog();
  for (const e of entries) {
    const d = addTemplate(c, e);
    if (!d.ok) throw new Error(`fixture listing refused: ${d.reason}`);
    c = d.catalog;
  }
  return c;
}

describe('templateCatalog: adding', () => {
  it('accepts a listing and normalizes its tags into the stored copy', () => {
    const d = addTemplate(emptyTemplateCatalog(), listing({ tags: ['SaaS', 'saas', ' Hero ', ''] }));
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.listing.tags).toEqual(['saas', 'hero']); // lowercased, trimmed, de-duplicated, empties dropped
    expect(d.catalog.listings).toHaveLength(1);
  });

  it('never mutates the catalog it is handed', () => {
    const before = build(listing());
    const d = addTemplate(before, listing({ id: 't2' }));
    expect(d.ok).toBe(true);
    expect(before.listings).toHaveLength(1);
    if (!d.ok) return;
    expect(d.catalog).not.toBe(before);
    expect(d.catalog.listings).toHaveLength(2);
  });

  it('refuses a duplicate id, a blank title/description/author/document, and a bad price or category', () => {
    const c = build(listing());
    const reason = (l: TemplateListing) => { const d = addTemplate(c, l); expect(d.ok).toBe(false); return d.ok ? '' : d.reason; };
    expect(reason(listing())).toContain('already listed');
    expect(reason(listing({ id: 'x', title: '  ' }))).toContain('non-empty title');
    expect(reason(listing({ id: 'x', description: '' }))).toContain('non-empty description');
    expect(reason(listing({ id: 'x', authorId: '' }))).toContain('authorId');
    expect(reason(listing({ id: 'x', documentId: '' }))).toContain('documentId');
    expect(reason(listing({ id: 'x', priceCents: -1 }))).toContain('zero or more');
    expect(reason(listing({ id: 'x', priceCents: 4.5 }))).toContain('whole number of cents');
    expect(reason(listing({ id: 'x', category: 'nope' as never }))).toContain('declared set is');
    expect(reason(listing({ id: 'x', createdAt: Number.NaN }))).toContain('finite createdAt');
  });

  it('a free template (price 0) is accepted', () => {
    const c = build(listing({ priceCents: 0 }));
    expect(freeListings(c)).toHaveLength(1);
  });
});

describe('templateCatalog: derived views', () => {
  const c = build(
    listing({ id: 't1', category: 'landing', priceCents: 4900, createdAt: 100 }),
    listing({ id: 't2', category: 'mobile', priceCents: 0, createdAt: 300, authorId: 'acc-2', tags: ['app'] }),
    listing({ id: 't3', category: 'landing', priceCents: 1200, createdAt: 200, tags: ['startup', 'hero'] }),
  );

  it('finds by id, and answers null for an unknown one', () => {
    expect(templateById(c, 't2')?.title).toBe('SaaS Landing Page');
    expect(templateById(c, 'nope')).toBeNull();
  });

  it('filters by author, by category, and by the free band', () => {
    expect(listingsByAuthor(c, 'acc-2').map((l) => l.id)).toEqual(['t2']);
    expect(listingsByCategory(c, 'landing').map((l) => l.id)).toEqual(['t1', 't3']);
    expect(freeListings(c).map((l) => l.id)).toEqual(['t2']);
  });

  it('sorts by price ascending, stably', () => {
    expect(sortByPriceAsc(c).map((l) => l.priceCents)).toEqual([0, 1200, 4900]);
  });

  it('sorts newest first, stably', () => {
    expect(sortByNewest(c).map((l) => l.id)).toEqual(['t2', 't3', 't1']);
  });
});

describe('templateCatalog: search is honest exact-token AND', () => {
  const c = build(
    listing({ id: 't1', title: 'SaaS Landing Page', description: 'A hero, three features and a pricing table.', tags: ['saas', 'hero'] }),
    listing({ id: 't2', title: 'Mobile App Shell', description: 'A tabbed shell with a hero header.', tags: ['app'] }),
  );

  it('an empty or token-free query answers nothing rather than everything', () => {
    expect(searchTemplates(c, '')).toEqual([]);
    expect(searchTemplates(c, 'a')).toEqual([]); // single-char tokens are dropped
  });

  it('requires EVERY token to land somewhere (AND), and scores by field hits', () => {
    const both = searchTemplates(c, 'hero saas');
    expect(both.map((r) => r.listing.id)).toEqual(['t1']); // only t1 has both
    const hero = searchTemplates(c, 'hero');
    expect(hero.map((r) => r.listing.id)).toEqual(['t1', 't2']); // both mention hero
    expect(hero[0]!.score).toBeGreaterThan(0);
  });

  it('is deterministic for the same catalog and query', () => {
    expect(searchTemplates(c, 'hero')).toEqual(searchTemplates(c, 'hero'));
  });

  it('a query that matches nothing answers an empty list, not a fuzzy guess', () => {
    expect(searchTemplates(c, 'quantum blockchain')).toEqual([]);
  });

  it('finds a CJK-titled listing by a CJK query (the tokenizer must not delete non-Latin text)', () => {
    const zh = build(listing({ id: 't-zh', title: '仪表盘模板', description: '一个数据仪表盘。', tags: ['仪表盘'], category: 'dashboard' }));
    expect(searchTemplates(zh, '仪表盘').map((r) => r.listing.id)).toEqual(['t-zh']);
  });
});

describe('templateCatalog: the pure helpers', () => {
  it('normalizeTags lowercases, trims, de-duplicates and drops empties, keeping first-seen order', () => {
    expect(normalizeTags(['B', 'a', 'A', ' b ', '', 'c'])).toEqual(['b', 'a', 'c']);
  });

  it('queryTokens lowercases, splits on non-alphanumerics, drops 1-char tokens and de-duplicates', () => {
    expect(queryTokens('Hero, HERO pricing! a b2b')).toEqual(['hero', 'pricing', 'b2b']);
  });

  it('queryTokens keeps non-Latin letters, and still drops a 1-char ASCII token', () => {
    expect(queryTokens('仪表盘 SaaS')).toEqual(['仪表盘', 'saas']);
    expect(queryTokens('图')).toEqual(['图']); // a single CJK character is meaningful
    expect(queryTokens('a')).toEqual([]); // a single ASCII character is not
  });
});

describe('templateCatalog: retiring (v539)', () => {
  it('withdraws the listing and returns it, keeping the others in order — and never mutates the catalog it was handed', () => {
    const c = build(listing({ id: 'a' }), listing({ id: 'b' }), listing({ id: 'c' }));
    const r = retireTemplate(c, 'b');
    if (!r.ok) throw new Error(`retire refused: ${r.reason}`);
    expect(r.listing.id).toBe('b');
    expect(r.catalog.listings.map((l) => l.id)).toEqual(['a', 'c']);
    expect(templateById(r.catalog, 'b')).toBeNull();
    expect(c.listings.map((l) => l.id)).toEqual(['a', 'b', 'c']); // the input is untouched
  });

  it('refuses an unknown id, an empty id and a SECOND retire by name — a retire that acts twice must be visible', () => {
    const c = build(listing({ id: 'a' }));
    const once = retireTemplate(c, 'a');
    if (!once.ok) throw new Error('the first retire was refused');
    const twice = retireTemplate(once.catalog, 'a');
    expect(twice.ok).toBe(false);
    if (twice.ok) return;
    expect(twice.reason).toContain('lists no template "a" to retire');
    const unknown = retireTemplate(c, 'ghost');
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.reason).toContain('lists no template "ghost" to retire');
    const empty = retireTemplate(c, '');
    expect(empty.ok).toBe(false);
    if (empty.ok) return;
    expect(empty.reason).toMatch(/needs the id/);
  });

  it('a retired id can be listed AGAIN — the window reopens, and the new listing names its own author', () => {
    const c = build(listing({ id: 'a' }));
    const gone = retireTemplate(c, 'a');
    if (!gone.ok) throw new Error('the retire was refused');
    const again = addTemplate(gone.catalog, listing({ id: 'a', authorId: 'acc-2' }));
    if (!again.ok) throw new Error(`re-listing refused: ${again.reason}`);
    expect(templateById(again.catalog, 'a')?.authorId).toBe('acc-2');
  });
});
describe('templateCatalog: a withdrawn listing has TWO exits (v543)', () => {
  it('relist MOVES the listing back to the shelf and out of the record in one decision', () => {
    const listed = build(listing({ id: 'a' }), listing({ id: 'b', createdAt: 2_000 }));
    const gone = retireTemplate(listed, 'a');
    if (!gone.ok) throw new Error(gone.reason);
    const withdrawn = [gone.listing];
    const back = relistTemplate(gone.catalog, withdrawn, 'a');
    if (!back.ok) throw new Error(back.reason);
    expect(back.catalog.listings.map((entry) => entry.id)).toEqual(['b', 'a']);
    expect(back.withdrawn).toEqual([]);
    // Purity: the inputs are untouched, and the listing returned is the one that left.
    expect(gone.catalog.listings.map((entry) => entry.id)).toEqual(['b']);
    expect(withdrawn.map((entry) => entry.id)).toEqual(['a']);
    expect(back.listing).toEqual(gone.listing);
  });

  it('refuses a put-back BY NAME when the record does not hold the id, or the shelf already does', () => {
    const listed = build(listing({ id: 'a' }));
    const missing = relistTemplate(listed, [], 'a');
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.reason).toContain('lists no template "a" to put back');

    const gone = retireTemplate(listed, 'a');
    if (!gone.ok) throw new Error(gone.reason);
    const already = relistTemplate(listed, [gone.listing], 'a');
    expect(already.ok).toBe(false);
    if (already.ok) return;
    expect(already.reason).toContain('already listed');
  });

  it('discard FORGETS a withdrawn listing deliberately, and refuses an id the record does not hold', () => {
    const a = listing({ id: 'a' });
    const kept = listing({ id: 'b', createdAt: 2_000 });
    const dropped = discardWithdrawn([a, kept], 'a');
    if (!dropped.ok) throw new Error(dropped.reason);
    expect(dropped.withdrawn.map((entry) => entry.id)).toEqual(['b']);

    const missing = discardWithdrawn([kept], 'a');
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.reason).toContain('lists no template "a" to discard');
  });
});