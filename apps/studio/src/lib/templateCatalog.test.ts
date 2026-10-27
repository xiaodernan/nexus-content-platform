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
  emptyTemplateCatalog,
  freeListings,
  listingsByAuthor,
  listingsByCategory,
  normalizeTags,
  queryTokens,
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
