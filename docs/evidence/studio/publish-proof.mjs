// NEXUS M8 — the PUBLISH handoff proof: a canonical Design Document becomes a template listing, or is
// refused by name. This is the catalog's missing PRODUCER, exercised over the SHIPPED Studio modules
// rather than a copy.
//
// The modules are read off disk and run through Node's own TypeScript type-stripper (the mechanism the
// credits proof uses), written into a temp dir INSIDE the repo so the one bare specifier
// (`@nexus/design-model`) resolves through the workspace's node_modules.
//
// What it asserts, in order:
//   §1 a valid design becomes a listing that CLONES it (documentId, normalized tags, host instant);
//   §2 the published listing is a VALID catalog entry — publishing cannot drift from adding;
//   §3 an inconsistent design graph is refused, naming the missing child;
//   §4 the catalog's own rules still apply (blank title, negative price, unknown category);
//   §5 a published listing LANDS: the local-first catalog store persists it, refuses a corrupt record
//      and refuses two listings under one id;
//   §6 publishing INTO an existing shelf is ONE decision (v546): the shelf gains the listing in order,
//      the inputs are untouched, and an id the withdrawal record still holds is refused by name — the
//      overlap `catalogStore` refuses to save cannot be built from this side either;
//   §7 HEAD is byte-identical: everything ran in memory.
//
// Run:  node docs/evidence/studio/publish-proof.mjs

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { execFileSync } from '../lib/syncproc.mjs';

const REPO = process.cwd();
const MODULES = ['publish', 'templateCatalog', 'catalogStore'];
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const box = mkdtempSync(join(REPO, '.nexus-publish-proof-'));
const libDir = join(box, 'lib');
mkdirSync(libDir, { recursive: true });

try {
  for (const name of MODULES) {
    let stripped = stripTypeScriptTypes(
      readFileSync(join(REPO, 'apps', 'studio', 'src', 'lib', `${name}.ts`), 'utf8'),
      { mode: 'strip' },
    );
    for (const dep of MODULES) {
      stripped = stripped.replaceAll(`from './${dep}'`, `from './${dep}.mjs'`);
      stripped = stripped.replaceAll(`from "./${dep}"`, `from "./${dep}.mjs"`);
    }
    writeFileSync(join(libDir, `${name}.mjs`), stripped, 'utf8');
  }

  const publish = await import(pathToFileURL(join(libDir, 'publish.mjs')).href);
  const catalogMod = await import(pathToFileURL(join(libDir, 'templateCatalog.mjs')).href);
  const catalogStore = await import(pathToFileURL(join(libDir, 'catalogStore.mjs')).href);
  const design = await import('@nexus/design-model');
  assert.equal(typeof publish.publishTemplate, 'function', 'publishTemplate was not imported');
  assert.equal(typeof design.createEmptyDocument, 'function', 'createEmptyDocument was not imported');

  const doc = () => JSON.parse(JSON.stringify({ ...design.createEmptyDocument('My Design'), id: 'doc-pub' }));
  const input = {
    id: 'tpl-pub', title: 'Published Landing', description: 'A landing page.', authorId: 'author-1',
    priceCents: 500, category: 'landing', tags: ['Landing', 'NEW', 'landing'], now: 1_700_000_000_000,
  };

  // ── §1 a valid design becomes a listing ──────────────────────────────────────────────────────────
  console.log('§1 a valid design becomes a listing that clones it');
  const published = publish.publishTemplate(doc(), input);
  assert.equal(published.ok, true, `a valid design was refused: ${published.reason}`);
  assert.equal(published.listing.documentId, 'doc-pub', 'the listing does not clone the design');
  assert.deepEqual(published.listing.tags, ['landing', 'new'], 'tags were not normalized');
  assert.equal(published.listing.createdAt, input.now, 'the host instant was not used');
  console.log(`  published "${published.listing.title}" -> document ${published.listing.documentId}, price ${published.listing.priceCents}`);

  // ── §2 the published listing is a valid catalog entry ────────────────────────────────────────────
  console.log('§2 the published listing is a valid catalog entry');
  const added = catalogMod.addTemplate(catalogMod.emptyTemplateCatalog(), published.listing);
  assert.equal(added.ok, true, `the published listing was refused by the catalog: ${added.reason}`);
  console.log(`  addTemplate accepted it; the catalog holds ${added.catalog.listings.length}`);

  // ── §3 an inconsistent design is refused by name ─────────────────────────────────────────────────
  console.log('§3 an inconsistent design graph is refused, naming the missing child');
  const broken = doc();
  broken.nodes[broken.activePageId].childIds = ['ghost'];
  const refused = publish.publishTemplate(broken, input);
  assert.equal(refused.ok, false, 'a broken graph was published');
  assert.match(refused.reason, /not publishable/);
  assert.match(refused.reason, /ghost/);
  console.log(`  refused: ${refused.reason}`);

  // ── §4 the catalog rules still apply ─────────────────────────────────────────────────────────────
  console.log('§4 the catalog rules still apply to a published listing');
  for (const [label, over, pattern] of [
    ['blank title', { title: '   ' }, /title/],
    ['negative price', { priceCents: -1 }, /price/],
    ['unknown category', { category: 'nope' }, /category/],
  ]) {
    const res = publish.publishTemplate(doc(), { ...input, ...over });
    assert.equal(res.ok, false, `${label} was published`);
    assert.match(res.reason, pattern);
    console.log(`  ${label} -> ${res.reason}`);
  }

  // ── §5 a published listing can LAND: the local-first catalog store ──────────────────────────────
  console.log('§5 the local-first catalog store persists a published listing, and refuses a bad record');
  const mem = new Map();
  const kv = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, v); } };
  const emptyLoad = catalogStore.loadCatalog(kv);
  assert.equal(emptyLoad.ok, true, 'an absent key was treated as an error');
  assert.equal(emptyLoad.source, 'empty');

  const withPublished = catalogMod.addTemplate(catalogMod.emptyTemplateCatalog(), published.listing);
  assert.equal(withPublished.ok, true, withPublished.reason);
  const saved = catalogStore.saveCatalog(kv, withPublished.catalog);
  assert.equal(saved.ok, true, `the catalog was refused by save: ${saved.reason}`);
  const reloaded = catalogStore.loadCatalog(kv);
  assert.equal(reloaded.ok, true, `the saved catalog did not load: ${reloaded.reason}`);
  assert.equal(reloaded.source, 'stored');
  assert.deepEqual(reloaded.catalog.listings, withPublished.catalog.listings);

  mem.set(catalogStore.CATALOG_STORAGE_KEY, '{not json');
  const corrupt = catalogStore.loadCatalog(kv);
  assert.equal(corrupt.ok, false, 'a corrupt catalog was silently emptied');
  assert.match(corrupt.reason, /not JSON/);

  const duplicate = catalogStore.deserializeCatalog(JSON.stringify({ version: 1, listings: [published.listing, published.listing] }));
  assert.equal(duplicate.ok, false, 'a catalog with a duplicate id was loaded');
  assert.match(duplicate.reason, /already listed/);
  console.log(`  absent -> empty; ${withPublished.catalog.listings.length} listing saved (${saved.bytes} bytes) and reloaded; a corrupt record and a duplicate id are refused`);

  // ── §6 publishing INTO a shelf is one decision (v546) ───────────────────────────────────────────
  console.log('§6 publishing into an existing shelf is one decision, and the withdrawal record owns its ids');
  const seeded = catalogMod.addTemplate(catalogMod.emptyTemplateCatalog(), {
    id: 'tpl-seed', title: 'Seed Listing', description: 'Already on the shelf.', authorId: 'author-2',
    priceCents: 200, category: 'landing', tags: ['seed'], documentId: 'doc-seed', createdAt: 1_700_000_000_000,
  });
  assert.equal(seeded.ok, true, `the seed listing was refused: ${seeded.reason}`);
  const shelfBefore = JSON.stringify(seeded.catalog);

  const joined = publish.publishListing(seeded.catalog, [], doc(), input);
  assert.equal(joined.ok, true, `a valid design was refused by the shelf: ${joined.reason}`);
  assert.deepEqual(joined.catalog.listings.map((l) => l.id), ['tpl-seed', 'tpl-pub'], 'the publish did not join the shelf in order');
  assert.equal(JSON.stringify(seeded.catalog), shelfBefore, 'publishListing mutated the input catalog');

  const onShelf = publish.publishListing(seeded.catalog, [], doc(), { ...input, id: 'tpl-seed' });
  assert.equal(onShelf.ok, false, 'a publish reused an id the shelf already lists');
  assert.match(onShelf.reason, /tpl-seed/);

  // The withdrawn listing is NOT on the shelf, so only the RECORD forbids this id — the exact overlap
  // `catalogStore` refuses to write, which a hand-rolled publish would only discover at save time.
  const withdrawnOnly = [{ ...seeded.listing, id: 'tpl-gone' }];
  const inRecord = publish.publishListing(seeded.catalog, withdrawnOnly, doc(), { ...input, id: 'tpl-gone' });
  assert.equal(inRecord.ok, false, 'a publish reused an id the withdrawal record still holds');
  assert.match(inRecord.reason, /withdrawal record/);
  assert.deepEqual(seeded.catalog.listings.map((l) => l.id), ['tpl-seed'], 'a refused publish moved the shelf');
  console.log(`  shelf [seed, pub]; a live id and a withdrawn-only id are both refused by name`);
} finally {
  rmSync(box, { recursive: true, force: true });
}

// ── §7 HEAD is byte-identical ────────────────────────────────────────────────────────────────────────
const after = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(after, head, 'the repository HEAD moved while the proof ran');
console.log(`§7 HEAD unchanged (${head.slice(0, 12)})`);
console.log('ALL SECTIONS PASSED');
