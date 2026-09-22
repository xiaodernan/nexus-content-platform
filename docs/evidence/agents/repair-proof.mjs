// NEXUS M2 v12 — QA→repair closed-loop proof (ADR 0016 amendment 12).
// Synthetic flagged layouts are fed to proposeRepairs; applying the returned moves must
// clear every ERROR flag, the result must be deterministic, and irreducible cases must
// stop honestly with `remaining` instead of looping. Run after `npm run build`:
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

console.log('[repair-proof] ALL ASSERTIONS PASSED (deterministic structural auto-fix loop, honest stopping)');
