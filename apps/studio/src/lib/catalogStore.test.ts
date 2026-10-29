import { describe, expect, it } from 'vitest';

import { addTemplate, emptyTemplateCatalog, retireTemplate, type TemplateCatalog, type TemplateListing } from './templateCatalog';
import {
  CATALOG_STORAGE_KEY,
  deserializeCatalog,
  loadCatalog,
  saveCatalog,
  serializeCatalog,
  type CatalogKv,
} from './catalogStore';

function kvOf(initial: Record<string, string> = {}): CatalogKv & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => { map.set(key, value); },
  };
}

const listing = (over: Partial<TemplateListing> = {}): TemplateListing => ({
  id: 't1',
  title: 'SaaS Landing Page',
  description: 'A hero, three features and a pricing table.',
  authorId: 'author-1',
  priceCents: 4900,
  category: 'landing',
  tags: ['SaaS', 'Hero', 'Pricing'],
  documentId: 'doc-1',
  createdAt: 1_000,
  ...over,
});

function build(...entries: TemplateListing[]): TemplateCatalog {
  let catalog = emptyTemplateCatalog();
  for (const entry of entries) {
    const added = addTemplate(catalog, entry);
    if (!added.ok) throw new Error(`fixture: ${added.reason}`);
    catalog = added.catalog;
  }
  return catalog;
}

describe('catalogStore: load', () => {
  it('an ABSENT key is an empty catalog, not an error', () => {
    const loaded = loadCatalog(kvOf());
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.source).toBe('empty');
    expect(loaded.catalog.listings).toEqual([]);
  });

  it('a PRESENT but unreadable key is REFUSED with the reason (not silently emptied)', () => {
    const loaded = loadCatalog(kvOf({ [CATALOG_STORAGE_KEY]: '{not json' }));
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.reason).toContain('not JSON');
  });

  it('an unknown format version is refused', () => {
    const loaded = loadCatalog(kvOf({ [CATALOG_STORAGE_KEY]: JSON.stringify({ version: 99, listings: [] }) }));
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.reason).toContain('unsupported catalog format version');
  });

  it('reads a custom key when one is given', () => {
    const kv = kvOf({ other: serializeCatalog(build(listing())) });
    const loaded = loadCatalog(kv, 'other');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.source).toBe('stored');
    expect(loaded.catalog.listings).toHaveLength(1);
  });
});

describe('catalogStore: save', () => {
  it('round-trips a catalog through the seam and reports the bytes written', () => {
    const kv = kvOf();
    const catalog = build(listing(), listing({ id: 't2', title: 'Mobile Kit', category: 'mobile' }));
    const saved = saveCatalog(kv, catalog);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.bytes).toBe(serializeCatalog(catalog).length);

    const loaded = loadCatalog(kv);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.source).toBe('stored');
    expect(loaded.catalog.listings).toEqual(catalog.listings);
  });

  it('normalizes tags into the stored copy', () => {
    const kv = kvOf();
    saveCatalog(kv, build(listing({ tags: ['SaaS', 'saas', ' Hero ', ''] })));
    const loaded = loadCatalog(kv);
    if (!loaded.ok) throw new Error('unreachable');
    expect(loaded.catalog.listings[0]!.tags).toEqual(['saas', 'hero']);
  });

  it('REFUSES to save an invalid catalog (a duplicate id) and does not write it', () => {
    const kv = kvOf();
    const duplicated: TemplateCatalog = { listings: [listing(), listing()] };
    const saved = saveCatalog(kv, duplicated);
    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.reason).toContain('refusing to save an invalid catalog');
    expect(kv.map.has(CATALOG_STORAGE_KEY)).toBe(false);
  });

  it('reports a storage failure by name instead of pretending the save landed', () => {
    const throwing: CatalogKv = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
    const saved = saveCatalog(throwing, build(listing()));
    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.reason).toContain('the storage refused the write');
    expect(saved.reason).toContain('QuotaExceededError');
  });
});

describe('catalogStore: refusals on a stored record', () => {
  it('refuses two listings under one id, naming the duplicate', () => {
    const record = JSON.stringify({ version: 1, listings: [listing(), listing()] });
    const parsed = deserializeCatalog(record);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toContain('already listed');
  });

  it('refuses a tag list that is not an array of strings', () => {
    const record = JSON.stringify({ version: 1, listings: [{ ...listing(), tags: [1] }] });
    const parsed = deserializeCatalog(record);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toContain('not an array of strings');
  });

  it('refuses an entry that is not an object', () => {
    const parsed = deserializeCatalog(JSON.stringify({ version: 1, listings: ['nope'] }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toContain('not an object');
  });
});

describe('catalogStore: a RETIRED shelf round-trips (v541)', () => {
  it('saves the catalog a retire left behind and loads it back unchanged', () => {
    const shelf = build(listing({ id: 't1' }), listing({ id: 't2', createdAt: 2_000 }));
    const retired = retireTemplate(shelf, 't1');
    if (!retired.ok) throw new Error(retired.reason);
    const kv = kvOf();
    const saved = saveCatalog(kv, retired.catalog);
    expect(saved.ok).toBe(true);
    const loaded = loadCatalog(kv);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.source).toBe('stored');
    expect(loaded.catalog.listings.map((entry) => entry.id)).toEqual(['t2']);
    // The shelf the page renders and the shelf it reads back are ONE fact, not two.
    expect(loaded.catalog).toEqual(retired.catalog);
  });
});

describe('catalogStore: a take-down is remembered (v542)', () => {
  it('round-trips the shelf AND what it withdrew, and writes format 2', () => {
    const shelf = build(listing({ id: 't1' }), listing({ id: 't2', createdAt: 2_000 }));
    const retired = retireTemplate(shelf, 't1');
    if (!retired.ok) throw new Error(retired.reason);
    const kv = kvOf();
    const saved = saveCatalog(kv, retired.catalog, [retired.listing]);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const written = JSON.parse(kv.getItem(CATALOG_STORAGE_KEY)!) as { version: number; listings: unknown[]; withdrawn: unknown[] };
    expect(written.version).toBe(2);
    expect(written.listings).toHaveLength(1);
    expect(written.withdrawn).toHaveLength(1);

    const loaded = loadCatalog(kv);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.source).toBe('stored');
    expect(loaded.catalog.listings.map((entry) => entry.id)).toEqual(['t2']);
    expect(loaded.withdrawn.map((entry) => entry.id)).toEqual(['t1']);
    // What was withdrawn is kept WHOLE: a put-back must have the listing to put back.
    expect(loaded.withdrawn[0]).toEqual(retired.listing);
  });

  it('MIGRATES a version-1 document: its shelf loads and it remembers no withdrawals', () => {
    const legacy = JSON.stringify({ version: 1, listings: [listing({ id: 't1' })] });
    const loaded = loadCatalog(kvOf({ [CATALOG_STORAGE_KEY]: legacy }));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.source).toBe('stored');
    expect(loaded.catalog.listings.map((entry) => entry.id)).toEqual(['t1']);
    expect(loaded.withdrawn).toEqual([]);
  });

  it('refuses a document that says one id is BOTH listed and withdrawn', () => {
    const record = JSON.stringify({ version: 2, listings: [listing()], withdrawn: [listing()] });
    const parsed = deserializeCatalog(record);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toContain('both listed and withdrawn');
  });

  it('refuses two withdrawn records under one id, naming the list and the duplicate', () => {
    const record = JSON.stringify({ version: 2, listings: [], withdrawn: [listing(), listing()] });
    const parsed = deserializeCatalog(record);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toContain('withdrawn listing t1');
    expect(parsed.reason).toContain('already listed');
  });

  it('REFUSES to save a document its own loader would refuse, and writes nothing', () => {
    const kv = kvOf();
    const saved = saveCatalog(kv, build(listing()), [listing()]);
    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.reason).toContain('both listed and withdrawn');
    expect(kv.map.has(CATALOG_STORAGE_KEY)).toBe(false);
  });
});