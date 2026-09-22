// NEXUS M2 v11 — visual-QA proof (ADR 0016 amendments 11 and 24).
// Structural geometry checks only — no pixels, no canvas, no pretending (§60). Feeds
// synthetic rect sets (clean / stacked / off-page) AND a real Studio-style scenario:
// layout the empty document's page rects by hand, then verify the QA verdict the dock
// would show after approving an agent banner. Run after `npm run build`:
//   node docs/evidence/agents/qa-proof.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const dm = await import(pathToFileURL('./packages/design-model/dist/index.js').href);
const { runVisualQa } = rt;

// 1) Synthetic triad, determinism included.
const page = { x: 0, y: 0, width: 1200, height: 800 };
const clean = runVisualQa({ page, rects: { a: { x: 20, y: 20, width: 300, height: 80 }, b: { x: 400, y: 20, width: 300, height: 80 } } });
assert.deepEqual(clean.flags, []);
const stacked = runVisualQa({ page, rects: { a: { x: 20, y: 20, width: 300, height: 80 }, b: { x: 30, y: 25, width: 280, height: 70 } } });
assert.equal(stacked.flags[0].code, 'overlap');
const off = runVisualQa({ page, rects: { gone: { x: 9000, y: 9000, width: 40, height: 40 } } });
assert.equal(off.flags[0].code, 'off-page');
assert.deepEqual(runVisualQa(stacked ? { page, rects: { a: { x: 20, y: 20, width: 300, height: 80 } } } : {}), runVisualQa({ page, rects: { a: { x: 20, y: 20, width: 300, height: 80 } } }));
console.log(`[qa-proof] synthetic: clean ok · overlap ${stacked.flags[0].detail} · off-page ${off.flags[0].code}`);

// 2) Real Design Model scenario via layoutPage (what the Studio dock runs after Approve).
const created = dm.createEmptyDocument('qa proof');
const pageId = created.activePageId;
const sized = dm.applyBatch(created, { id: 's', ops: [dm.ops.updateNode(pageId, { x: 0, y: 0, width: 1200, height: 800 })], provenance: { mode: 'user' }, timestamp: 0 });
const style = { fontFamilyToken: 'font.family.body', sizeToken: 'font.size.base', weight: 400, lineHeight: 1.35, letterSpacing: 0, align: 'left' };
const hero = dm.textNode('Hero', 'big words', style, { id: 'h1', x: 60, y: 60, width: 400, height: 48 });
const banner = dm.textNode('Agent Note', 'AGENT · qa', style, { id: 'b1', x: 24, y: 24, width: 560, height: 28 });
const doc = dm.applyBatch(sized, { id: 'x', ops: [dm.ops.addSubtree(pageId, 0, [hero]), dm.ops.addSubtree(pageId, 1, [banner])], provenance: { mode: 'demo' }, timestamp: 1 });
const layout = dm.layoutPage(doc, pageId);
const pg = layout[pageId];
const rects = Object.fromEntries([hero.id, banner.id].map((id) => [id, (({ x, y, width, height }) => ({ x, y, width, height }))(layout[id])]));
const rep = runVisualQa({ page: { x: pg.x, y: pg.y, width: pg.width, height: pg.height }, rects });
assert.equal(rep.checked, 2);
assert.equal(rep.verdict, 'ok', `banner+hero should be clean, got ${JSON.stringify(rep.flags)}`);
console.log(`[qa-proof] real model: banner+hero on a sized page → verdict=${rep.verdict} (dock would show "visual QA: ok")`);

// 3) Pathological document (zero-height layer) must be flagged, not tolerated.
const zero = dm.rectNode('Flat', { id: 'z1', x: 10, y: 10, width: 100, height: 0 });
const doc2 = dm.applyBatch(sized, { id: 'y', ops: [dm.ops.addSubtree(pageId, 0, [zero])], provenance: { mode: 'user' }, timestamp: 2 });
const l2 = dm.layoutPage(doc2, pageId);
const rep2 = runVisualQa({ page: { x: pg.x, y: pg.y, width: pg.width, height: pg.height }, rects: { z1: (({ x, y, width, height }) => ({ x, y, width, height }))(l2.z1) } });
assert.equal(rep2.flags[0].code, 'zero-size');
// 4) v24 near-miss lints: OFF unless a tolerance is passed; when opted in they flag the
//    measured slip, and rects with stronger flags never collect noise.
const slip = { page, rects: { a: { x: 100, y: 100, width: 200, height: 50 }, b: { x: 101.5, y: 400, width: 200, height: 50 } } };
assert.deepEqual(runVisualQa(slip).flags, [], 'default must stay opt-in: existing hosts gain no flags');
const aligned = runVisualQa({ ...slip, alignTolerance: 2 });
assert.equal(aligned.flags.length, 1);
assert.equal(aligned.flags[0].code, 'near-align');
assert.equal(aligned.flags[0].severity, 'warn');
assert.match(aligned.flags[0].detail, /left 1\.5px apart/);
const centered = runVisualQa({ page, rects: { m: { x: 401, y: 350, width: 399, height: 100 } }, centerTolerance: 2 });
assert.equal(centered.flags[0].code, 'near-center', `1px off horizontal center should lint: ${JSON.stringify(centered.flags)}`);
const noisy = runVisualQa({ page, rects: { z: { x: 100, y: 100, width: 0, height: 50 }, gone: { x: 101.5, y: 9000, width: 100, height: 50 }, a: { x: 100, y: 100, width: 200, height: 50 } }, alignTolerance: 2, centerTolerance: 2 });
assert.deepEqual(noisy.flags.map((f) => f.code).sort(), ['off-page', 'zero-size'], 'zero-size/off-page rects carry their stronger flags, not near-miss noise');
console.log(`[qa-proof] v24 near-miss: opt-in only · ${aligned.flags[0].detail}`);

console.log('[qa-proof] ALL ASSERTIONS PASSED (structural QA on real layout data + v24 near-miss lints, §60 no pixel claims)');
