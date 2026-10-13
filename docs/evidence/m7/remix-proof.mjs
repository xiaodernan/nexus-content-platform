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
  await strip('apps/studio/src/lib/publishLane.ts', box); // remixLane's relative import lands here
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

  // ── §4 the wiring is present in the shipped sources ───────────────────────────────────────────────
  {
    const toolbar = readFileSync('apps/studio/src/components/Toolbar.tsx', 'utf8');
    const store = readFileSync('apps/studio/src/lib/store.ts', 'utf8');
    assert.ok(/data-published-remix=\{row\.projectId\}/.test(toolbar), 'the Published panel carries a remix control per row');
    assert.ok(/import \{ remixProject \} from '@\/lib\/remixLane'/.test(toolbar), 'the panel imports the remix LANE, not the server half');
    assert.ok(/const onRemix = async/.test(toolbar), 'the panel has a remix handler');
    assert.ok(/remixDocument: \(doc, source\) => \{/.test(store), 'the store has a remixDocument action');
    assert.ok(/const forked = forkDocument\(doc\)/.test(store), 'the store action FORKS before it loads');
    assert.ok(/remixDocument: \(doc: DesignDocument, source: string\) => void/.test(store), 'the store action is on the interface');
    console.log('[§4] wiring: remix control per row · panel imports the lane · store forks before load');
  }

  // ── §5 the visitor loop: the artifact page links a visitor back into the Studio ────────────────────
  {
    await strip('apps/studio/src/lib/paint.ts', box);
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
    assert.ok(/remixDocument\(answer\.document, id\)/.test(studio), 'the Studio forks it into a new project');
    assert.ok(/history\.replaceState\(null, '', '\/'\)/.test(studio), 'the one-time intent is dropped once honoured');
    console.log('[§5] visitor loop: artifact carries an encoded remix link · no id → no bar · route names the project · Studio reads the intent, forks, and drops it');
  }

  // ── §6 §60 dependency audit ───────────────────────────────────────────────────────────────────────
  {
    const lane = readFileSync('apps/studio/src/lib/remixLane.ts', 'utf8');
    assert.ok(!/from '\.\/publishServer'/.test(lane), 'the CLIENT lane imports nothing from the server half');
    assert.ok(!/NEXUS_API_URL|process\.env/.test(lane), 'the CLIENT lane holds no service address');
    assert.ok(/import type \{ DesignDocument \}/.test(lane), 'the model import is TYPE-ONLY (erased at compile)');
    const toolbar = readFileSync('apps/studio/src/components/Toolbar.tsx', 'utf8');
    assert.ok(!/from '@\/lib\/publishServer'/.test(toolbar), 'the panel never imports the server half directly');
    console.log('[§6] audit: lane holds no service address and no server import · model import is type-only · panel speaks only to the lane');
  }

  console.log('[remix-proof] ALL SECTIONS PASSED');
} finally {
  rmSync(box, { recursive: true, force: true });
}
