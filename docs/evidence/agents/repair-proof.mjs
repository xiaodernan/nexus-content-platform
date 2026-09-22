// NEXUS M2 v12+v25+v27 — QA→repair closed-loop proof (ADR 0016 amendments 12, 25 and 27).
// Synthetic flagged layouts are fed to proposeRepairs; applying the returned moves must
// clear every ERROR flag, the result must be deterministic, and irreducible cases must
// stop honestly with `remaining` instead of looping. v25 section: the near-miss lints
// (amendment 24) gain opt-in alignment nudges — deterministic mover, stated px, and
// still only proposals: nothing moves until a human approves (§28).
// Run after `npm run build`:
//   node docs/evidence/agents/repair-proof.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const { proposeRepairs, runVisualQa } = rt;

const page = { x: 0, y: 0, width: 1200, height: 800 };

// 1) Three problems at once: off-page, stacked pair, zero-size.
const broken = {
  hero: { x: 60, y: 60, width: 400, height: 60 },
  banner: { x: 70, y: 70, width: 380, height: 40 }, // overlaps hero
  ghost: { x: 9000, y: 10, width: 120, height: 40 }, // off-page
  flat: { x: 300, y: 500, width: 90, height: 0 }, // zero-size
};
const preQa = runVisualQa({ page, rects: broken });
assert.ok(preQa.flags.length >= 3, `expected >=3 flags, got ${preQa.flags.length}`);

const res = proposeRepairs({ page, rects: broken });
assert.ok(res.repairs.length >= 3);
assert.deepEqual(res.repairs.map((p) => p.targetId), [...res.repairs.map((p) => p.targetId)].sort(), 'one deduped repair per node, sorted');
const applied = { ...broken };
for (const p of res.repairs) applied[p.targetId] = p.to;
const postQa = runVisualQa({ page, rects: applied });
assert.deepEqual(postQa.flags.filter((f) => f.severity === 'error'), [], `errors remain: ${JSON.stringify(postQa.flags)}`);
console.log(`[repair-proof] ${preQa.flags.length} flags → ${res.repairs.length} repairs → errors ${postQa.flags.filter((f) => f.severity === 'error').length}, remaining verdict: ${res.remaining.verdict}`);

// 2) Determinism: identical inputs → byte-identical repairs.
assert.deepEqual(proposeRepairs({ page, rects: broken }), res);

// 3) Honest stop: an unsolvable stack (two full-page nodes) must not spin; repairs
//    proposed, progress halts, remaining reports what is left (§60 no infinite fixing).
const impossible = { a: { x: 0, y: 0, width: 1200, height: 800 }, b: { x: 0, y: 0, width: 1200, height: 800 } };
const imp = proposeRepairs({ page, rects: impossible });
assert.ok(imp.passes >= 1 && imp.passes <= 3);
console.log(`[repair-proof] unsolvable stack: passes=${imp.passes}, repairs=${imp.repairs.length}, remaining=${imp.remaining.flags.map((f) => f.code).join(',') || 'ok'}`);

// 4) v25 near-miss nudges: opt-in, deterministic, and still only proposals.
const TOL = { alignTolerance: 2, centerTolerance: 2 };
const slips = {
  hero: { x: 60, y: 60, width: 400, height: 60 },
  slip: { x: 61.5, y: 300, width: 300, height: 40 }, // 1.5px left-edge slip vs hero
  solo: { x: 401, y: 100, width: 399, height: 50 }, // 1px off horizontal center
  drift: { x: 200, y: 500, width: 300, height: 40 }, // 140px away — beyond any lint, must stay untouched
};

// 4a) Honest default: even when the host's QA sees the lints, proposeRepairs without
//     { alignRepairs: true } must not invent nudges.
const off = proposeRepairs({ page, rects: slips, ...TOL });
assert.deepEqual(off.repairs, [], 'nudges must not appear without the opt-in');
assert.deepEqual(off.remaining.flags.map((f) => f.code).sort(), ['near-align', 'near-center']);

// 4b) Opt-in: smaller-area layer snaps to exact, center slip snaps to the page mid-line,
//     and the beyond-tolerance node is left alone.
const on = proposeRepairs({ page, rects: slips, ...TOL }, { alignRepairs: true });
assert.deepEqual(on.repairs.map((p) => p.targetId), ['slip', 'solo'], 'one nudge per flagged node, sorted');
const [slipNudge, soloNudge] = on.repairs;
assert.equal(slipNudge.action, 'align-nudge');
assert.equal(slipNudge.to.x, 60); // exact match with hero's left edge
assert.equal(slipNudge.to.y, 300); // only the flagged axis moves
assert.match(slipNudge.reason, /near-align with hero: 1\.5px left slip snapped to exact/);
assert.equal(soloNudge.action, 'center-nudge');
assert.equal(soloNudge.to.x, 400.5); // (1200 − 399) / 2
assert.equal(soloNudge.to.y, 100);
assert.match(soloNudge.reason, /centered horizontally \(1\.0px\)/);
assert.ok(!on.repairs.some((p) => p.targetId === 'drift'), 'a 140px gap is not a lint and gets no nudge');

// 4c) The loop closes: applying all proposed nudges leaves zero flags at the same tolerances.
const snapped = { ...slips };
for (const p of on.repairs) snapped[p.targetId] = p.to;
assert.deepEqual(runVisualQa({ page, rects: snapped, ...TOL }).flags, []);

// 4d) §28 and determinism: the input rects are never mutated (proposals ≠ application),
//     and identical inputs produce byte-identical nudges.
assert.equal(slips.slip.x, 61.5, 'proposeRepairs must not move anything itself');
assert.deepEqual(proposeRepairs({ page, rects: slips, ...TOL }, { alignRepairs: true }), on);
console.log(`[repair-proof] v25 nudges: default-off ${off.remaining.flags.length} lints unprompted → opt-in ${on.repairs.length} proposals (slip 1.5px→exact, solo 1px→center, drift untouched)`);

// 5) v27 edge-snap: the near-edge lint rides the SAME opt-in machinery — default-off
//    proposes nothing; with alignRepairs the flusher snaps to the page edge (fixed order:
//    a corner snaps left first and stops honestly with the top still reported).
const EDGE = { edgeTolerance: 2 };
const flushIn = { page, rects: { c: { x: 1, y: 1, width: 200, height: 50 } }, ...EDGE };
assert.deepEqual(proposeRepairs(flushIn).repairs, [], 'near-edge must not be repaired without the opt-in');
const snap = proposeRepairs(flushIn, { alignRepairs: true });
assert.equal(snap.repairs.length, 1);
assert.equal(snap.repairs[0].action, 'edge-snap');
assert.equal(snap.repairs[0].to.x, 0); // left first
assert.equal(snap.repairs[0].to.y, 1); // top still 1px off — remaining reports it, no infinite chase
assert.match(snap.repairs[0].reason, /left edge 1\.0px off the page, snapped flush/);
assert.deepEqual(snap.remaining.flags.map((f) => f.code), ['near-edge']);
const twoOff = { page, rects: { n1: { x: 1.5, y: 300, width: 200, height: 50 }, n2: { x: 1050, y: 100, width: 148.5, height: 50 } }, ...EDGE };
const both = proposeRepairs(twoOff, { alignRepairs: true });
assert.deepEqual(both.repairs.map((p) => p.targetId), ['n1', 'n2']);
const landed = { ...twoOff.rects };
for (const p of both.repairs) landed[p.targetId] = p.to;
assert.deepEqual(runVisualQa({ page, rects: landed, ...EDGE }).flags, []);
assert.deepEqual(proposeRepairs(twoOff, { alignRepairs: true }), both);
console.log(`[repair-proof] v27 edge-snap: default-off quiet · corner snaps left first (top stated in remaining) · ${both.repairs.length} flush proposals, apply-all → zero flags`);

console.log('[repair-proof] ALL ASSERTIONS PASSED (deterministic structural auto-fix loop, honest stopping, gated v25/v27 nudges)');
