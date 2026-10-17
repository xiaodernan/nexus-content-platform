// NEXUS v243 — `validateDocument`: the internal-consistency check the normalized graph always claimed
// (ADR 0016 amendment 243).
//
// Every path that brings a document into the model from outside (a remix, a snapshot, an AI batch, edited
// JSON) handed it straight to the store and the renderer; a malformed graph draws something subtly wrong
// rather than crashing. This proof grades the check, built from the SHIPPED bytes:
//
//   - `validateDocument` is `packages/design-model/dist` — the built canonical model;
//   - the "good" documents are built through the SHIPPED ops (`addSubtree`/`applyOp`), so what is accepted
//     is what the model actually produces, not a hand-written ideal;
//   - the CONSUMER is `apps/studio/src/lib/remixLane.ts`, type-stripped with its `./publishLane` dependency.
//
// What it asserts, in order:
//   §1 ACCEPTS what the model produces (empty; a rect on a page; a component MASTER under the root, which
//      lands in the root node's `pageIds` — the quirk is TOLERATED, not asserted against; a second page);
//   §2 REFUSES each malformed shape BY CODE — a named problem per defect, never a throw;
//   §3 is TOTAL (garbage never throws) and does not mutate its input;
//   §4 the CONSUMER refuses a graph-inconsistent document — the shallow shape checks pass, the deep check
//      catches it (v243 wired `validateDocument` into the remix lane).
//
// Run after `npm run build`:  node docs/evidence/design-model/validate-proof.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const m = await import(pathToFileURL('./packages/design-model/dist/index.js').href);
const { applyOp, componentNode, createEmptyDocument, ops, pageNode, rectNode, validateDocument } = m;
assert.equal(typeof validateDocument, 'function', 'validateDocument is exported from the built model');

const clone = (d) => JSON.parse(JSON.stringify(d));
const codes = (d) => (validateDocument(d).ok ? [] : validateDocument(d).problems.map((p) => p.code));
const withRect = () => {
  const d = createEmptyDocument('V');
  return applyOp(d, ops.addSubtree(d.activePageId, 0, [rectNode('R', { id: 'r1', parentId: d.activePageId, x: 0, y: 0, width: 10, height: 10 })]));
};

// ── §1 accepts what the model produces ───────────────────────────────────────────────────────────────
{
  assert.equal(validateDocument(createEmptyDocument('e')).ok, true, 'an empty document is valid');
  assert.equal(validateDocument(withRect()).ok, true, 'a document with a rect is valid');
  const c0 = createEmptyDocument('c');
  const c = applyOp(c0, ops.addSubtree(c0.rootId, 1, [componentNode('C', { id: 'cmp1' })]));
  assert.equal(validateDocument(c).ok, true, 'a component master under the root is valid (pageIds holds masters — the quirk is tolerated)');
  const p0 = createEmptyDocument('p');
  const two = applyOp(p0, ops.addSubtree(p0.rootId, 1, [pageNode('Page 2', { id: 'pg2' })]));
  assert.equal(validateDocument(two).ok, true, 'a second page is valid');
  console.log('[§1] accepts: empty · rect · component master under the root · second page');
}

// ── §2 refuses each malformed shape, by code ─────────────────────────────────────────────────────────
{
  const cases = [];
  const mk = (mut) => { const d = clone(withRect()); mut(d); return d; };
  cases.push(['root-missing', mk((d) => { d.rootId = 'ghost'; })]);
  cases.push(['root-not-document', mk((d) => { d.rootId = d.activePageId; })]);
  cases.push(['root-has-parent', mk((d) => { d.nodes[d.rootId].parentId = d.activePageId; })]);
  cases.push(['document-child-ids-used', mk((d) => { d.nodes[d.rootId].childIds = ['r1']; })]);
  cases.push(['node-id-key-mismatch', mk((d) => { d.nodes['r1'].id = 'other'; })]);
  cases.push(['node-without-parent', mk((d) => { d.nodes['r1'].parentId = null; })]);
  cases.push(['parent-missing', mk((d) => { d.nodes['r1'].parentId = 'ghost'; })]);
  cases.push(['child-missing', mk((d) => { d.nodes[d.activePageId].childIds.push('ghost'); })]);
  cases.push(['child-parent-disagrees', mk((d) => { d.nodes['r1'].parentId = d.rootId; })]);
  cases.push(['duplicate-child', mk((d) => { d.nodes[d.activePageId].childIds.push('r1'); })]);
  cases.push(['self-child', mk((d) => { d.nodes[d.activePageId].childIds.push(d.activePageId); })]);
  cases.push(['active-page-missing', mk((d) => { d.activePageId = 'ghost'; })]);
  cases.push(['active-not-page', mk((d) => { d.activePageId = 'r1'; })]);
  cases.push(['parent-does-not-list-child', mk((d) => { d.nodes[d.activePageId].childIds = []; })]);
  for (const [code, doc] of cases) {
    assert.ok(codes(doc).includes(code), `the check must name \`${code}\` (got ${JSON.stringify(codes(doc))})`);
  }
  // a node nobody can reach is named too
  assert.ok(codes(mk((d) => { d.nodes[d.activePageId].childIds = []; })).includes('unreachable'), 'a stranded node is named unreachable');
  console.log(`[§2] refuses ${cases.length} malformed shapes by code + unreachable · each names its defect`);
}

// ── §3 total and non-mutating ────────────────────────────────────────────────────────────────────────
{
  for (const bad of [null, undefined, 42, 'doc', [1, 2], {}, { nodes: {} }]) {
    assert.doesNotThrow(() => validateDocument(bad), 'validateDocument never throws');
    assert.equal(validateDocument(bad).ok, false, 'garbage is not valid');
  }
  const d = withRect();
  const before = JSON.stringify(d);
  validateDocument(d);
  assert.equal(JSON.stringify(d), before, 'the document is not mutated');
  console.log('[§3] total (garbage never throws) · non-mutating');
}

// ── §4 the CONSUMER refuses a graph-inconsistent document ────────────────────────────────────────────
{
  const { stripTypeScriptTypes } = await import('node:module');
  const toMjs = (src) => src.replace(/from '(\.[^']+)'/g, "from '$1.mjs'");
  const strip = (rel, box) => {
    const p = join(box, rel.split('/').pop().replace(/\.ts$/, '.mjs'));
    writeFileSync(p, toMjs(stripTypeScriptTypes(readFileSync(rel, 'utf8'), { mode: 'strip' })), 'utf8');
    return import(pathToFileURL(p).href);
  };
  const box = mkdtempSync(join('apps/studio', 'nexus-validate-proof-'));
  try {
    await strip('apps/studio/src/lib/publishLane.ts', box);
    const remixLane = await strip('apps/studio/src/lib/remixLane.ts', box);
    const { extractRemixDocument } = remixLane;
    // a valid document passes
    assert.equal(extractRemixDocument({ ok: true, document: createEmptyDocument('X') }).ok, true, 'a valid document is accepted');
    // SHAPE is fine (rootId is a non-empty string), but the graph is broken
    const broken = clone(createEmptyDocument('X'));
    broken.rootId = 'ghost';
    const out = extractRemixDocument({ ok: true, document: broken });
    assert.equal(out.ok, false, 'a graph-inconsistent document is refused');
    assert.match(out.reason, /not a consistent graph/, 'and the refusal says so');
    console.log('[§4] consumer: the remix lane accepts a valid document and REFUSES a graph-inconsistent one by name');
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
}

console.log('[validate-proof] ALL SECTIONS PASSED');
