// NEXUS M7 v233–v234 — a publication can be REMIXED: someone else's published document becomes a NEW project
// (ADR 0016 amendments 233 and 234). v233 wired remix into the Studio's own Published panel; v234 lets a
// VISITOR reach it from the artifact page, so the community loop is complete: publish → open → remix.
//
// Until v233 the Studio could PUBLISH but never read a publication back in its own UI — a stated M7 bound.
// `readPublished` existed in `publishLane.ts` and had NO consumer. This proof grades the four pieces that
// close it, built from the SHIPPED bytes rather than a copy:
//
//   - the pure VALIDATOR and the client lane are `apps/studio/src/lib/remixLane.ts`, read off disk and run
//     through Node's own TypeScript type-stripper (with its `./publishLane` dependency stripped alongside);
//   - the FORK is `packages/design-model/dist` — the built canonical model;
//   - the WIRING is the real `Toolbar.tsx` and `store.ts`, read as source and asserted structurally.
//
// What it asserts, in order:
//   §1 the validator is PURE and NAMES the field: a well-formed document passes; a service that is DOWN and
//      a publication with NO document are DIFFERENT refusals; each malformed field is refused by name;
//   §2 the lane really runs end to end over a STUBBED transport: `remixProject` → `readPublished` → fetch →
//      the document, with a down service surfacing as an ordinary `ok:false` answer, never a throw;
//   §3 the fork RE-IDS the document (a fresh project id, the same node graph, no mutation of the source) —
//      which is what stops a remix from re-publishing OVER the publication it came from;
//   §4 the WIRING is present: the Published panel carries a remix control per row, and the store action
//      forks before it loads;
//   §5 the VISITOR loop: the artifact page (`/p/{id}`) carries an encoded `?remix=` link (v234), the route
//      names the project, and the Studio reads the intent, forks, and drops it;
//   §6 §60 dependency audit: the CLIENT lane imports nothing from the server half (`publishServer`) and the
//      panel imports the lane, not the server — the same one-way rule every lane in this repo follows.
//
// Run after `npm run build`:  node docs/evidence/m7/remix-proof.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// ── the built canonical model (the fork lives here) ──────────────────────────────────────────────────
const model = await import(pathToFileURL('./packages/design-model/dist/index.js').href);
const { createEmptyDocument, forkDocument, rectNode } = model;

// ── the SHIPPED Studio lane, type-stripped rather than copied ────────────────────────────────────────
const { stripTypeScriptTypes } = await import('node:module');
const toMjs = (src) => src.replace(/from '(\.[^']+)'/g, "from '$1.mjs'");
const strip = (rel, box) => {
  const p = join(box, rel.split('/').pop().replace(/\.ts$/, '.mjs'));
  writeFileSync(p, toMjs(stripTypeScriptTypes(readFileSync(rel, 'utf8'), { mode: 'strip' })), 'utf8');
  return import(pathToFileURL(p).href);
};
const box = mkdtempSync(join('apps/studio', 'nexus-remix-proof-'));
try {
  // v263 — publishLane.ts has a VALUE import of accounts.ts (it builds the claim), so the box needs it
  // beside it. The ORDER matters: `strip` writes a module and IMPORTS it in the same step, so a
  // module's own siblings must already be in the box — an unresolved import is not a graded failure.
  // v263 — publishLane.ts gained a VALUE import of accounts.ts (it builds the claim) and of
  // currentAccount.ts (it reads the device's account), so the box needs both. The ORDER matters:
  // `strip` writes a module and IMPORTS it in the same step, so a module's own siblings must
  // already be in the box — an unresolved import is not a graded failure.
  await strip('apps/studio/src/lib/accounts.ts', box);
  await strip('apps/studio/src/lib/currentAccount.ts', box);
  await strip('apps/studio/src/lib/publishLane.ts', box); // remixLane's relative import lands here
  // v263 — publishLane.ts has a VALUE import of accounts.ts (it builds the claim), so the box needs it
  // beside it: a module that imports a sibling the box does not hold is an unresolved import, not a
  // graded failure, which is why the loader is part of the record.
  const remixLane = await strip('apps/studio/src/lib/remixLane.ts', box);
  const { extractRemixDocument, remixProject } = remixLane;
  assert.equal(typeof extractRemixDocument, 'function', 'the validator was really imported, not re-implemented');
  assert.equal(typeof remixProject, 'function', 'the lane was really imported, not re-implemented');

  // ── §1 the validator is PURE and names the field ──────────────────────────────────────────────────
  {
    const good = createEmptyDocument('Published');
    assert.deepEqual(extractRemixDocument({ ok: true, document: good }), { ok: true, document: good }, 'a well-formed document passes');
    assert.deepEqual(extractRemixDocument(null), { ok: false, reason: 'the read answer is not an object' });
    assert.deepEqual(
      extractRemixDocument({ ok: false, reason: 'nexus-api is not reachable' }),
      { ok: false, reason: 'nexus-api is not reachable' },
      'a DOWN service surfaces its own reason',
    );
    assert.deepEqual(
      extractRemixDocument({ ok: true }),
      { ok: false, reason: 'the publication carries no document' },
      'a publication with NO document is a DIFFERENT refusal from a down service',
    );
    const base = good;
    const named = [
      [{ ...base, id: '' }, 'the document has no string id'],
      [{ ...base, rootId: 7 }, 'the document has no string rootId'],
      [{ ...base, nodes: undefined }, 'the document has no nodes object'],
      [{ ...base, activePageId: '' }, 'the document has no string activePageId'],
    ];
    for (const [doc, reason] of named) {
      assert.deepEqual(extractRemixDocument({ ok: true, document: doc }), { ok: false, reason }, `a malformed field is refused by name: ${reason}`);
    }
    console.log('[§1] validator: well-formed passes · service-down and no-document are distinct · 4 malformed fields each refused by name');
  }

  // ── §2 the lane runs end to end over a STUBBED transport ──────────────────────────────────────────
  {
    const doc = createEmptyDocument('Remix me');
    const realFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => ({ ok: true, projectId: 'pub-1', document: doc }) };
    };
    try {
      const out = await remixProject('pub-1');
      assert.equal(out.ok, true, 'the lane answered a document');
      if (out.ok) assert.equal(out.document.id, doc.id, 'the lane handed back the SERVICE\'s document unchanged');
      assert.equal(calls.length, 1, 'exactly one fetch');
      assert.equal(calls[0].url, '/api/publish', 'the lane speaks to the publish route');
      assert.deepEqual(calls[0].body, { action: 'read', projectId: 'pub-1' }, 'the request is a `read` for the named project');

      // a DOWN service is an ordinary answer, not a throw
      globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ ok: false, reason: 'nexus-api unreachable' }) });
      const down = await remixProject('pub-2');
      assert.deepEqual(down, { ok: false, reason: 'nexus-api unreachable' }, 'a down service is an answer, not an exception');

      // a transport that THROWS is caught by the lane and reported, never propagated
      globalThis.fetch = async () => { throw new Error('ECONNREFUSED'); };
      const thrown = await remixProject('pub-3');
      assert.equal(thrown.ok, false, 'a throwing transport is caught');
      assert.match(thrown.reason, /unreachable/, 'and reported as unreachable');
    } finally {
      globalThis.fetch = realFetch;
    }
    console.log('[§2] lane: read request is `{action:"read"}` · document passed through · down service and throwing transport both answer ok:false');
  }

  // ── §3 the fork RE-IDS the document ───────────────────────────────────────────────────────────────
  {
    const src = createEmptyDocument('Source');
    const pageId = src.activePageId;
    const rect = rectNode('Box', { id: 'r1', parentId: pageId });
    const page = src.nodes[pageId];
    const seeded = { ...src, nodes: { ...src.nodes, [rect.id]: rect, [pageId]: { ...page, childIds: [...page.childIds, rect.id] } } };
    const before = JSON.stringify(seeded);
    const fork = forkDocument(seeded);
    assert.notEqual(fork.id, seeded.id, 'the fork gets a FRESH document id (the publish projectId)');
    assert.equal(fork.rootId, fork.id, 'rootId follows the new id');
    assert.equal(fork.nodes[fork.id]?.id, fork.id, 'the root node carries the new id');
    assert.equal(fork.nodes[seeded.rootId], undefined, 'the source root key is gone from the fork');
    assert.equal(fork.nodes['r1'], seeded.nodes['r1'], 'the untouched subtree is shared by reference');
    assert.equal(Object.keys(fork.nodes).length, Object.keys(seeded.nodes).length, 'the graph is the same size');
    assert.equal(JSON.stringify(seeded), before, 'the source document was NOT mutated');
    assert.equal(fork.name, 'Source (remix)', 'the name says where it came from');
    console.log('[§3] fork: fresh document id · same node graph · source unmutated · name suffixed "(remix)"');
  }

  // ── §3b v267: the LINEAGE is written, and it names the source ─────────────────────────────────────
  // The service's remix endpoint has always recorded the lineage; the Studio's OWN remix (fork in the
  // editor, publish the fork) never did — so a publication made the way a person actually remixes carried
  // no source at all, and the "remixed from" link the pages draw could never appear on it.
  {
    const lineage = await strip('apps/studio/src/lib/lineage.ts', box);
    const src = createEmptyDocument('Source');
    const stamped = lineage.stampLineage(src, 'pub-source', '2026-10-20T00:00:00.000Z');
    assert.equal(stamped._lineage.sourceProjectId, 'pub-source', 'the stamp names the source');
    assert.equal(stamped._lineage.remixedAt, '2026-10-20T00:00:00.000Z', 'and the instant it was made');
    assert.equal(src._lineage, undefined, 'the source document was NOT mutated');
    assert.equal(lineage.readRemixedFrom(stamped), 'pub-source', 'and the reader the pages use reads it back');

    // A remix of a remix: the fork SPREADS the document, so the copy inherits the lineage it was made
    // from — and that inherited value names the WRONG source. The stamp must replace it.
    const middle = { ...stamped, id: 'doc-middle' };
    const second = lineage.stampLineage(middle, 'pub-middle', '2026-10-21T00:00:00.000Z');
    assert.equal(lineage.readRemixedFrom(second), 'pub-middle', 'a remix of a remix names its OWN source');
    assert.equal(lineage.readRemixedFrom(middle), 'pub-source', 'and the copy it was made from keeps its own');

    // A lineage that names nothing is a claim about a provenance that does not exist.
    assert.throws(() => lineage.stampLineage(src, '', 'now'), /source project id/, 'a blank source is refused by name');
    assert.throws(() => lineage.stampLineage(src, 'pub-source', ''), /instant/, 'a blank instant is refused by name');
    console.log('[§3b] lineage: the stamp names the source and the instant · the source document is unmutated · a remix of a remix names its OWN source · a blank source or instant is refused by name');
  }

  // ── §4 the wiring is present in the shipped sources ───────────────────────────────────────────────
  {
    const toolbar = readFileSync('apps/studio/src/components/Toolbar.tsx', 'utf8');
    const store = readFileSync('apps/studio/src/lib/store.ts', 'utf8');
    assert.ok(/data-published-remix=\{row\.projectId\}/.test(toolbar), 'the Published panel carries a remix control per row');
    assert.ok(/import \{ remixProject \} from '@\/lib\/remixLane'/.test(toolbar), 'the panel imports the remix LANE, not the server half');
    assert.ok(/const onRemix = async/.test(toolbar), 'the panel has a remix handler');
    assert.ok(/remixDocument: \(doc, source, remixedAt\) => \{/.test(store), 'the store has a remixDocument action');
    assert.ok(/const forked = stampLineage\(forkDocument\(doc\), source, remixedAt\)/.test(store), 'the store action FORKS before it loads — and stamps the lineage onto the fork');
    assert.ok(/remixDocument: \(doc: DesignDocument, source: string, remixedAt: string\) => void/.test(store), 'the store action is on the interface');
    // v267 — the store STAMPS the lineage onto the fork, and the CALLER names the instant (the store owns no clock).
    assert.ok(/stampLineage\(forkDocument\(doc\), source, remixedAt\)/.test(store), 'the store action STAMPS the lineage onto the fork');
    assert.ok(/import \{ stampLineage \} from '\.\/lineage'/.test(store), 'and it stamps through the one module that owns the reserved key');
    assert.ok(/remixDocument\(answer\.document, projectId, new Date\(\)\.toISOString\(\)\)/.test(toolbar), 'the panel names the instant');
    assert.ok(/remixDocument\(answer\.document, id, new Date\(\)\.toISOString\(\)\)/.test(readFileSync('apps/studio/src/components/Studio.tsx', 'utf8')), 'and so does the visitor path');
    console.log('[§4] wiring: remix control per row · panel imports the lane · store forks before load AND stamps the lineage · the caller names the instant');
  }

  // ── §5 the visitor loop: the artifact page links a visitor back into the Studio ────────────────────
  {
    await strip('apps/studio/src/lib/paint.ts', box);
    // v293 — preview.ts clips through the shared `./clip` module, so it joins the box before preview does:
    // a missing sibling is an unresolved import that crashes the proof, not a graded failure.
    await strip('apps/studio/src/lib/clip.ts', box);
    // v295 — preview.ts now escapes through the SHARED `./pageShell` escaper, so it inherits the same rule
    // that made artifact.ts wait for it: `strip` writes a module and IMPORTS it in the same step, so a
    // module's own siblings must already be in the box. Measured before this line moved:
    // ERR_MODULE_NOT_FOUND pageShell.mjs imported from preview.mjs.
    await strip('apps/studio/src/lib/pageShell.ts', box);
    await strip('apps/studio/src/lib/preview.ts', box);
    const artifact = await strip('apps/studio/src/lib/artifact.ts', box);
    const { injectRemixBar, renderArtifactHtml } = artifact;
    const doc = createEmptyDocument('Harbour');
    const withBar = renderArtifactHtml({ projectId: 'my pub/1', document: doc });
    assert.ok(withBar.includes('Remix in NEXUS Studio'), 'the artifact carries a remix link');
    assert.ok(withBar.includes('href="/?remix=my%20pub%2F1"'), 'the link names the project, encoded');
    assert.ok(withBar.includes('class="stage"'), 'the drawing is still there');
    assert.ok(withBar.indexOf('nexus-remix') < withBar.indexOf('</body>'), 'the bar is injected before </body>');
    assert.ok(!renderArtifactHtml({ document: doc }).includes('nexus-remix'), 'no project named → no bar');
    assert.equal(injectRemixBar('<div>x</div>', 'p1'), '<div>x</div>', 'no </body> → returned unchanged');

    const route = readFileSync('apps/studio/src/app/p/[projectId]/route.ts', 'utf8');
    assert.ok(/projectId: decodeURIComponent\(projectId\)/.test(route), 'the route passes the projectId to the renderer');
    const studio = readFileSync('apps/studio/src/components/Studio.tsx', 'utf8');
    assert.ok(/remixIdFromSearch\(window\.location\.search\)/.test(studio), 'the Studio reads the remix intent from the URL');
    assert.ok(/remixProject\(id\)/.test(studio), 'the Studio fetches the publication');
    assert.ok(/remixDocument\(answer\.document, id, new Date\(\)\.toISOString\(\)\)/.test(studio), 'the Studio forks it into a new project — and names the instant the remix happened');
    assert.ok(/history\.replaceState\(null, '', '\/'\)/.test(studio), 'the one-time intent is dropped once honoured');
    console.log('[§5] visitor loop: artifact carries an encoded remix link · no id → no bar · route names the project · Studio reads the intent, forks, and drops it');
  }

  // ── §6 §60 dependency audit ───────────────────────────────────────────────────────────────────────
  {
    const lane = readFileSync('apps/studio/src/lib/remixLane.ts', 'utf8');
    assert.ok(!/from '\.\/publishServer'/.test(lane), 'the CLIENT lane imports nothing from the server half');
    assert.ok(!/NEXUS_API_URL|process\.env/.test(lane), 'the CLIENT lane holds no service address');
    // v267 — this arm used to assert that the lane's WHOLE model import was `import type`, which was
    // never true: the lane calls `validateDocument` (v243's deep graph check) as a VALUE. The TYPE is the
    // part that must be erased — `DesignDocument` is a type, and importing it as one keeps it out of the
    // bundle's value layer. The assertion now says that, instead of a thing that was never true.
    assert.ok(/type DesignDocument/.test(lane), 'the DesignDocument TYPE is imported type-only (erased at compile)');
    assert.ok(/validateDocument/.test(lane), 'and the lane calls validateDocument as a VALUE — the deep graph check is real');
    const toolbar = readFileSync('apps/studio/src/components/Toolbar.tsx', 'utf8');
    assert.ok(!/from '@\/lib\/publishServer'/.test(toolbar), 'the panel never imports the server half directly');
    console.log('[§6] audit: lane holds no service address and no server import · the DesignDocument TYPE is type-only · the panel speaks only to the lane');
  }

  console.log('[remix-proof] ALL SECTIONS PASSED');
} finally {
  rmSync(box, { recursive: true, force: true });
}
