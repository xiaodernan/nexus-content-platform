// NEXUS M7 v241 — the EXPLORE page: what is published, at a URL a person can browse
// (ADR 0016 amendment 241).
//
// The artifact page (`/p/{id}`) answers "what is THIS one" but needs the id. The service could LIST
// publications since v195, and until v241 nothing but the Studio's own panel consumed it — a visitor had no
// door showing what EXISTS. This proof grades the door, built from the SHIPPED bytes:
//
//   - the pure renderer is `apps/studio/src/lib/explore.ts` (+ `./pageShell`), read off disk and run through
//     Node's own TypeScript type-stripper;
//   - the thumbnail path is the REAL `apps/studio/src/lib/thumbnail.ts` over the built canonical model;
//   - the wiring is the real route, read as source and asserted structurally.
//
// What it asserts, in order:
//   §1 the gallery renders one card per item, with the two doors (open `/p/{id}`, remix `/?remix={id}`), the
//      id ENCODED in both, caller text ESCAPED, a stated cap, an empty state, and a down-service page;
//   §2 the thumbnail is REAL: `docToSvg` draws the built model and `svgToDataUri` wraps it, and the card
//      carries the resulting data URI (a card with no thumbnail shows its REASON, not a blank);
//   §3 the WIRING: the route lists, reads each row, draws, renders, declares Node runtime;
//   §4 §60 audit: the pure renderer imports nothing from the server half and holds no address.
//
// Run after `npm run build`:  node docs/evidence/m7/explore-proof.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const model = await import(pathToFileURL('./packages/design-model/dist/index.js').href);
const { createEmptyDocument, rectNode } = model;

const { stripTypeScriptTypes } = await import('node:module');
const toMjs = (src) => src.replace(/from '(\.[^']+)'/g, "from '$1.mjs'");
const strip = (rel, box) => {
  const p = join(box, rel.split('/').pop().replace(/\.ts$/, '.mjs'));
  writeFileSync(p, toMjs(stripTypeScriptTypes(readFileSync(rel, 'utf8'), { mode: 'strip' })), 'utf8');
  return import(pathToFileURL(p).href);
};
const box = mkdtempSync(join('apps/studio', 'nexus-explore-proof-'));
try {
  await strip('apps/studio/src/lib/pageShell.ts', box);
  // v265 — explore.ts now imports the lineage reader, so that module is stripped into the box too: a
  // missing sibling would be an unresolved import, not a graded failure.
  await strip('apps/studio/src/lib/lineage.ts', box);
  // v270 — the PROFILE module joins the box: it draws the SAME cards as the gallery, and two pages that
  // draw the same card must draw it with the same code or they drift.
  const explore = await strip('apps/studio/src/lib/explore.ts', box);
  // v270 — the PROFILE module joins the box AFTER explore, because it imports the gallery's renderer, and
  // `strip` writes a module and IMPORTS it in the same step: a module's own siblings must already be there.
  const profile = await strip('apps/studio/src/lib/profile.ts', box);
  const { renderExploreHtml, renderExploreUnavailable, toExploreItem } = explore;
  assert.equal(typeof renderExploreHtml, 'function', 'the renderer was really imported, not re-implemented');

  const item = (over = {}) => ({ projectId: 'pub-1', title: 'Harbour', version: 2, publishedAt: '2026-10-01T00:00:00Z', thumbnail: 'data:image/svg+xml,%3Csvg%2F%3E', ...over });

  // ── §1 the gallery's rules ────────────────────────────────────────────────────────────────────────
  {
    const two = renderExploreHtml([item(), item({ projectId: 'pub-2', title: 'Ridge' })], { count: 2, limit: 24 });
    assert.ok(two.includes('data-explore-card="pub-1"') && two.includes('data-explore-card="pub-2"'), 'one card per item');
    assert.ok(two.includes('href="/p/pub-1"'), 'each card opens the artifact');
    assert.ok(two.includes('href="/?remix=pub-1"'), 'each card remixes');
    assert.ok(two.includes('<img src="data:image/svg+xml,%3Csvg%2F%3E"'), 'the thumbnail is rendered');
    assert.ok(two.includes('v2 · 2026-10-01T00:00:00Z'), 'the receipt facts are shown');
    assert.ok(two.includes('caps at 24'), 'the cap is STATED, not implied');

    const encoded = renderExploreHtml([item({ projectId: 'a/b c' })], { count: 1, limit: 24 });
    assert.ok(encoded.includes('href="/p/a%2Fb%20c"') && encoded.includes('href="/?remix=a%2Fb%20c"'), 'the id is encoded in both links');

    const escaped = renderExploreHtml([item({ title: '<script>x</script>', projectId: 'p"1' })], { count: 1, limit: 24 });
    assert.ok(!escaped.includes('<script>x</script>'), 'caller text is escaped');
    assert.ok(escaped.includes('&lt;script&gt;'), 'the escape is visible');

    const noThumb = renderExploreHtml([item({ thumbnail: undefined, note: 'nothing to draw' })], { count: 1, limit: 24 });
    assert.ok(!noThumb.includes('<img'), 'no thumbnail → no img');
    assert.ok(noThumb.includes('nothing to draw'), 'the REASON is shown, not a blank');

    const empty = renderExploreHtml([], { count: 0, limit: 24 });
    assert.ok(empty.includes('Nothing is published yet') && !empty.includes('class="grid"'), 'an empty listing is its own state');

    const down = renderExploreUnavailable('nexus-api unreachable');
    assert.ok(down.includes('Explore is unavailable') && down.includes('nexus-api unreachable'), 'a down service names its cause');
    assert.ok(!down.includes('Nothing is published yet'), 'and is a DIFFERENT page from an empty gallery');
    console.log('[§1] gallery: one card per item · open + remix doors · id encoded · text escaped · cap stated · empty and down are distinct pages');
  }

  // ── §2 the thumbnail is REAL ──────────────────────────────────────────────────────────────────────
  {
    const thumb = await strip('apps/studio/src/lib/thumbnail.ts', box);
    const { docToSvg, svgToDataUri } = thumb;
    const doc = createEmptyDocument('Harbour');
    const pageId = doc.activePageId;
    const rect = rectNode('Box', { id: 'r1', parentId: pageId, x: 20, y: 20, width: 80, height: 40 });
    const page = doc.nodes[pageId];
    const seeded = { ...doc, nodes: { ...doc.nodes, [rect.id]: rect, [pageId]: { ...page, childIds: [...page.childIds, rect.id] } } };
    const svg = docToSvg(seeded, pageId);
    assert.ok(svg.startsWith('<svg'), 'docToSvg draws an SVG from the built model');
    const uri = svgToDataUri(svg);
    assert.ok(uri.startsWith('data:image/svg+xml,'), 'svgToDataUri wraps it as a data URI');
    const card = renderExploreHtml([item({ thumbnail: uri })], { count: 1, limit: 24 });
    assert.ok(card.includes('src="data:image/svg+xml,'), 'the card carries the real data URI');
    console.log(`[§2] thumbnail: docToSvg → ${svg.length}B SVG → svgToDataUri → data URI in the card`);
  }

  // ── §3 the wiring ─────────────────────────────────────────────────────────────────────────────────
  {
    const route = readFileSync('apps/studio/src/app/explore/route.ts', 'utf8');
    assert.ok(/export const runtime = 'nodejs'/.test(route), 'the route declares the Node runtime (the service address stays server-side)');
    assert.ok(/await listPublications\(EXPLORE_LIMIT\)/.test(route), 'the route LISTS publications');
    // v270 — the per-row read-and-draw is the SHARED builder's, because the profile page needs the same
    // fan-out and two copies of it would drift. The route CALLS the builder; the builder does the reading.
    assert.ok(/buildGalleryItems\(/.test(route), 'the route builds its cards with the SHARED builder');
    const gallery = readFileSync('apps/studio/src/lib/gallery.ts', 'utf8');
    assert.ok(/await read\(row\.projectId\)/.test(gallery), 'and the builder reads each row for its document');
    const profileRoute = readFileSync('apps/studio/src/app/u/[accountId]/route.ts', 'utf8');
    assert.ok(/buildGalleryItems\(/.test(profileRoute), 'the PROFILE route builds its cards with the SAME builder');
    assert.ok(/svgToDataUri\(docToSvg\(doc, pageId\)\)/.test(route), 'the route draws the real thumbnail');
    assert.ok(/renderExploreHtml\(items/.test(route), 'the route renders the pure gallery');
    assert.ok(/renderExploreUnavailable\(listing\.reason/.test(route), 'a down service gets its own page');
    assert.ok(/status, headers: \{ 'content-type': 'text\/html/.test(route), 'the answer is HTML');
    // v265 — the route must CALL the pure mapping, not write its own. The owner was dropped once on its way
    // to a page (v263 found the publish lane discarding the listing's owner), and a mapping written in the
    // route is a mapping nothing can assert.
    // v270 — the route delegates to the shared builder, and the BUILDER is the one that calls the pure
    // mapping. The mapping still exists once, in the pure half; it is simply reached through the builder now.
    assert.ok(/toExploreItem\(row, answer, thumbnail\)/.test(gallery), 'the shared builder BUILDS each card with the pure mapping (toExploreItem)');
    assert.ok(!/owner:\s*row\.owner/.test(route), 'and it does not map the owner itself — a second mapping is a second chance to drop it');
    const toolbar = readFileSync('apps/studio/src/components/Toolbar.tsx', 'utf8');
    assert.ok(/data-toolbar-explore/.test(toolbar) && /href="\/explore"/.test(toolbar), 'the Studio links the public explore page (the panel is the author\'s own list)');
    console.log('[§3] wiring: node runtime · list → read each row → draw → render (through the PURE mapping) · down service is its own page · Studio links /explore');
  }

  // ── §5 v265: the BYLINE reaches the page ───────────────────────────────────────────────────────────
  {
    // The renderer could always draw a byline; what was never proven is that the page RECEIVES an owner to
    // draw. The whole path is exercised here: the service's OWN answer shape in, the page's HTML out.
    const { toExploreItem } = explore;
    const ownedRow = {
      projectId: 'pub-owned',
      title: 'Harbour',
      version: 2,
      publishedAt: '2026-10-01T00:00:00Z',
      // The service sends the WHOLE claim; the card shows two fields of it.
      owner: { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 },
    };
    const card = toExploreItem(ownedRow, { ok: true, document: { pages: [] } }, 'data:image/svg+xml,%3Csvg%2F%3E');
    const html = renderExploreHtml([card], { count: 1, limit: 24 });
    assert.ok(html.includes('by ada · unsigned-local'), 'an owned publication reaches the page with its byline');
    assert.ok(html.includes('data-explore-card="pub-owned"'), 'and it is the right card');

    const anonymous = toExploreItem({ ...ownedRow, owner: null }, { ok: true }, 'data:image/svg+xml,%3Csvg%2F%3E');
    assert.ok(!renderExploreHtml([anonymous], { count: 1, limit: 24 }).includes('by '), 'a publication the service recorded NO owner for shows no byline');

    const malformed = toExploreItem({ ...ownedRow, owner: { handle: 'ada', assurance: null } }, { ok: true }, 'data:image/svg+xml,%3Csvg%2F%3E');
    assert.ok(!renderExploreHtml([malformed], { count: 1, limit: 24 }).includes('undefined'), 'a malformed owner shows NO byline rather than a broken one');

    const remixed = toExploreItem(ownedRow, { ok: true, document: { _lineage: { sourceProjectId: 'pub-alpha' } } }, 'data:image/svg+xml,%3Csvg%2F%3E');
    assert.ok(renderExploreHtml([remixed], { count: 1, limit: 24 }).includes('remixed from pub-alpha'), 'a remixed publication still names its source');
    console.log('[§5] the BYLINE reaches the page: the service\'s own answer shape in, the page\'s HTML out — an owned row shows `by ada · unsigned-local`, an unowned row shows no byline, a malformed owner shows none rather than a broken one, and a remix still names its source');
  }

  // ── §5b v270: the BYLINE is an ADDRESS, and the PROFILE page draws the same cards ─────────────
  {
    const owned = toExploreItem(
      { projectId: 'pub-owned', title: 'Harbour', version: 2, publishedAt: '2026-10-01T00:00:00Z',
        owner: { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 } },
      { ok: true, document: { pages: [] } },
      'data:image/svg+xml,%3Csvg%2F%3E',
    );
    const gallery = renderExploreHtml([owned], { count: 1, limit: 24 });
    assert.ok(gallery.includes('href="/u/acct-ada"'), 'the byline is a LINK to that account\'s profile — a name is not an address');
    assert.ok(gallery.includes('by ada · unsigned-local'), 'and it still says who published it');

    // The profile page draws the SAME card.
    const facts = profile.profileFactsOf('acct-ada', [{ owner: { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local' } }], 1, 24);
    assert.equal(facts.handle, 'ada', 'the profile reads the handle off the claims the publications carry');
    assert.equal(facts.assurance, 'unsigned-local', 'and the assurance with it');
    const page = profile.renderProfileHtml(facts, [owned]);
    assert.ok(page.includes('data-explore-card="pub-owned"'), 'the profile draws the same card as the gallery');
    assert.ok(page.includes('@ada'), 'and names the account');
    assert.ok(page.includes('caps at 24'), 'and states the cap');

    // What the service CANNOT know is said on the page rather than left to be discovered.
    const empty = profile.renderProfileHtml(profile.profileFactsOf('acct-ghost', [], 0, 24), []);
    assert.ok(empty.includes('cannot tell an account that has published nothing from one that does not exist'), 'an empty profile says what the service cannot tell');
    assert.ok(!empty.includes('data-explore-card='), 'and shows no card');
    console.log('[§5b] the byline is a LINK to the profile · the profile draws the same cards · it names the account and its assurance · and it says what the service cannot know');
  }

  // ── §4 §60 audit ──────────────────────────────────────────────────────────────────────────────────
  {
    const src = readFileSync('apps/studio/src/lib/explore.ts', 'utf8');
    assert.ok(!/publishServer|NEXUS_API_URL|process\.env/.test(src), 'the pure renderer holds no service address and imports no server half');
    assert.ok(/from '\.\/pageShell'/.test(src), 'the escaper is the SHARED one, not a second copy');
    const artifact = readFileSync('apps/studio/src/lib/artifact.ts', 'utf8');
    assert.ok(/from '\.\/pageShell'/.test(artifact) && !/function escapeHtml/.test(artifact), 'artifact.ts uses the shared escaper too (one rule, two pages)');
    console.log('[§4] audit: the renderer is pure · the escaper is shared with artifact.ts (one rule, not two)');
  }

  console.log('[explore-proof] ALL SECTIONS PASSED');
} finally {
  rmSync(box, { recursive: true, force: true });
}
