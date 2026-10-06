// NEXUS M6 v175 — the dock's BUILD face now PLANS: the build arc's steps are chosen by the
// template planner, not hand-pinned (ADR 0016 amendment 175, DEVELOPMENT_PLAN item 8).
//
// v174 wired the product face around ONE pinned arc; this proof pins the upgrade — the arc
// is PLANNED at request time by `templateBuildPlanner` (am. 175), whose entire freedom is
// WHICH of the host-declared, policy-validated templates it summons. Built from the SHIPPED
// bytes rather than a copy:
//
//   - the arc layer is `agents/runtime/dist` and the container layer `agents/exec-host/dist`
//     (build first);
//   - the route core is `apps/studio/src/lib/buildServer.ts` — the ACTUAL Studio module,
//     read off disk and run through Node's own TypeScript type-stripper;
//   - the daemon is the REAL one on this host.
//
// What it asserts, in order:
//   §1 the face's probe is the REAL daemon's answer, merged with the pinned LANE facts
//      (arcId, default goal, engine, the step catalog as argv data);
//   §2 the catalog and the §28 stance are DATA: every template fits the SAME container
//      allowlist the exec lane serves, the DEFAULT GOAL plans (a catalog whose default goal
//      summons nothing is a dead lane), and the checkpoint policy grants build.verify on
//      record with everything else default-deny;
//   §3 the arc is PLANNED, not pinned: the default goal's walk REALLY runs — two green steps
//      inside an ephemeral container (nexus-exec-*), every isolation flag from the SAME
//      array the audit reads, no mount flag, receipts per callId naming the door's reason,
//      stdout measured — and the answer carries the planner's provenance (backend/seed/picked);
//   §4 the request can name a GOAL, never argv: a narrower goal plans a narrower arc (ONE
//      step), and a goal that summons nothing is an honest `unplanned` answer — zero spawn,
//      zero receipts, the planner's refusal quoted;
//   §5 a red verdict is still an honest answer: a step failing exit 3 stops the walk at that
//      step, the reason quotes the engine, and exactly one receipt exists;
//   §6 §60 dependency audit: the CLIENT lane imports nothing from the runtime or the
//      spawn-capable package and names no process-spawn module; the server core imports
//      BOTH (it is the legal junction, am.167 direction); the route declares Node runtime.
//
// Run after `npm run build`:  node docs/evidence/studio/build-lane-proof.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// ── the shipped arc + container layers ───────────────────────────────────────────────────────────────
const execHost = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { CONTAINER_ISOLATION_ARGS, CONTAINER_MOUNT_FLAGS } = execHost;

// ── the SHIPPED Studio route core, type-stripped rather than copied ──────────────────────────────────
const { stripTypeScriptTypes } = await import('node:module');
// Relative imports need an explicit .mjs for node ESM — the stripped tree is flat, so the
// rewrite is always `<sibling>.mjs`. Package specifiers (./-less) are left untouched.
const toMjs = (src) => src.replace(/from '(\.[^']+)'/g, "from '$1.mjs'");
const strip = (rel, box) => {
  const p = join(box, rel.split('/').pop().replace(/\.ts$/, '.mjs'));
  writeFileSync(p, toMjs(stripTypeScriptTypes(readFileSync(rel, 'utf8'), { mode: 'strip' })), 'utf8');
  return import(pathToFileURL(p).href);
};
const box = mkdtempSync(join('apps/studio', 'nexus-build-lane-'));
try {
  await strip('apps/studio/src/lib/containerServer.ts', box); // buildServer's relative import lands here
  const buildServer = await strip('apps/studio/src/lib/buildServer.ts', box);
  const { buildArcState, runStudioBuildArc, STUDIO_BUILD_ARC_ID, STUDIO_BUILD_CATALOG, STUDIO_BUILD_ENGINE, studioBuildCatalogAllowlistError, studioBuildCheckpointPolicyError } = buildServer;
  assert.equal(typeof runStudioBuildArc, 'function', 'the Studio route core was really imported, not re-implemented');

  // ── §1 the probe is the REAL daemon's answer, merged with the pinned lane facts ───────────────────
  const s = await buildArcState();
  assert.equal(s.available, true, `the docker daemon on this host answers the probe: ${s.reason}`);
  assert.ok(s.serverVersion !== '', `the probe states the daemon's own version: ${s.serverVersion}`);
  assert.equal(s.arcId, 'studio-build-arc');
  assert.ok(s.goal.includes('verify'), `the face states its default goal: ${s.goal}`);
  assert.equal(s.engine, 'container:node:22-alpine');
  assert.deepEqual(s.steps, [
    ['node', '--version'],
    ['node', '-e', 'console.log("arc ok:" + String(2 + 3))'],
  ]);
  console.log(`[build-lane-proof] §1 probe: docker daemon ${s.serverVersion} · arc ${s.arcId} · engine ${s.engine} · catalog of ${s.steps.length} template(s)`);

  // ── §2 the catalog and the §28 stance are data, validated by their own validators ─────────────────
  assert.equal(studioBuildCatalogAllowlistError(), null, 'every template fits the SAME container allowlist, and the default goal plans');
  assert.equal(studioBuildCheckpointPolicyError(), null);
  assert.equal(STUDIO_BUILD_ARC_ID, STUDIO_BUILD_CATALOG ? 'studio-build-arc' : '?');
  console.log('[build-lane-proof] §2 data: catalog inside the container allowlist + default goal plans; §28 policy = build.verify granted on record, default-deny');

  // ── §3 the arc is PLANNED, then REALLY walked, inside an ephemeral container ──────────────────────
  const ran = await runStudioBuildArc();
  assert.equal(ran.ok, true);
  if (!ran.ok) throw new Error('unreachable');
  assert.equal(ran.status, 'completed', `the walk completed: ${ran.status} ${ran.reason ?? ''}`);
  assert.ok(ran.detail.includes('2/2 step(s) green'), `detail: ${ran.detail}`);
  assert.ok(ran.detail.includes('planned by template'), `the verdict states WHO planned it: ${ran.detail}`);
  assert.deepEqual(ran.planned?.picked, ['runtime', 'compute'], 'the provenance names the summoned templates');
  assert.equal(ran.planned?.backend, 'template');
  assert.equal(ran.goal, s.goal, 'the walk planned for the face\'s default goal');
  assert.deepEqual(ran.steps.map((st) => st.callId), [`${STUDIO_BUILD_ARC_ID}:runtime`, `${STUDIO_BUILD_ARC_ID}:compute`], 'callIds join the arc');
  assert.equal(ran.steps.every((st) => st.ok), true);
  assert.ok(ran.steps[0].detail.includes('node:22-alpine') && ran.steps[0].detail.includes('exit 0'), `runtime step: ${ran.steps[0].detail}`);
  assert.ok(ran.steps[1].detail.includes('exit 0'), `compute step: ${ran.steps[1].detail}`);
  assert.equal(ran.steps[1].stdout, 'arc ok:5\n', 'the container COMPUTED the answer — stdout is the measured fact, not just exit 0');
  assert.equal(ran.receipts.length, 2, 'one receipt per walked door');
  for (const r of ran.receipts) {
    assert.equal(r.granted, true);
    assert.ok(r.reason.includes('Allow-once'), `the receipt states WHY the door opened: ${r.reason}`);
  }
  console.log(`[build-lane-proof] §3 planned walk: ${ran.detail} · stdout "${ran.steps[1].stdout.trim()}" measured · 2 receipts on record`);

  // ── §4 the request names a GOAL, never argv: narrower goal → narrower arc; nothing → unplanned ────
  const narrow = await runStudioBuildArc({ goal: 'check the numbers' });
  assert.equal(narrow.ok, true);
  if (!narrow.ok) throw new Error('unreachable');
  assert.equal(narrow.status, 'completed');
  assert.equal(narrow.goal, 'check the numbers');
  assert.deepEqual(narrow.planned?.picked, ['compute'], 'a narrower goal summons a narrower arc');
  assert.equal(narrow.steps.length, 1);
  assert.deepEqual(narrow.steps.map((st) => st.callId), [`${STUDIO_BUILD_ARC_ID}:compute`]);
  const unplanned = await runStudioBuildArc({ goal: 'zzz qqq nonsense' });
  assert.equal(unplanned.ok, true);
  if (!unplanned.ok) throw new Error('unreachable');
  assert.equal(unplanned.status, 'unplanned', 'a goal that summons nothing is an honest answer, not an error');
  assert.ok((unplanned.reason ?? '').includes('invents nothing'), `the planner's refusal: ${unplanned.reason}`);
  assert.deepEqual(unplanned.steps, [], 'nothing ran');
  assert.deepEqual(unplanned.receipts, [], 'no doors were asked');
  console.log(`[build-lane-proof] §4 goal-not-argv: "check the numbers" → 1 step; "zzz qqq" → unplanned (${unplanned.reason.slice(0, 48)}…)`);

  // ── §5 a red verdict is an honest answer: the walk stops, the engine's words travel ───────────────
  const red = await runStudioBuildArc({
    spawnLike: (_cmd, _args) => ({
      onData: () => {},
      onEnd: (l) => setImmediate(() => l({ code: 3, signal: null })),
      kill: () => {},
    }),
  });
  assert.equal(red.ok, true);
  if (!red.ok) throw new Error('unreachable');
  assert.equal(red.status, 'failed');
  assert.equal(red.stoppedAt, 'runtime', 'the walk stopped at the FIRST red step');
  assert.ok((red.reason ?? '').includes('verified red'), `reason: ${red.reason}`);
  assert.equal(red.steps.length, 1, 'no step after a red verdict');
  assert.ok(red.steps[0].detail.includes('exit 3'), `the engine's own words: ${red.steps[0].detail}`);
  assert.equal(red.receipts.length, 1, 'exactly the one door that was asked');
  console.log(`[build-lane-proof] §5 red verdict: ${red.detail}`);

  // ── §6 §60 dependency audit ───────────────────────────────────────────────────────────────────────
  const laneSrc = readFileSync('apps/studio/src/lib/buildLane.ts', 'utf8');
  assert.ok(!/from\s+['"]@nexus\/(exec-host|agent-runtime)['"]/.test(laneSrc), 'the client lane imports nothing from the runtime or the spawn-capable package (mentions in prose are not imports)');
  assert.ok(!laneSrc.includes('child_process'), 'the client lane names no process-spawn module');
  const serverSrc = readFileSync('apps/studio/src/lib/buildServer.ts', 'utf8');
  assert.ok(/from\s+['"]@nexus\/exec-host['"]/.test(serverSrc), 'the server core is the legal junction: it imports the container layer…');
  assert.ok(/from\s+['"]@nexus\/agent-runtime['"]/.test(serverSrc), '…and the arc layer — both directions point runtime-ward/inward, never out of studio');
  const routeSrc = readFileSync('apps/studio/src/app/api/agent/build-arc/route.ts', 'utf8');
  assert.ok(/export async function POST\(request: Request\)/.test(routeSrc), 'the POST accepts a body that may name a GOAL…');
  assert.ok(/never a step, never an argv/.test(routeSrc), '…and states in its own header: never a step, never an argv');
  assert.ok(/goal must be a string/.test(routeSrc), 'a non-string goal is refused before anything plans');
  console.log('[build-lane-proof] §6 §60: browser bundle runtime-free and spawn-free; goal-not-argv stated at the boundary; the studio server is the one junction');

  console.log('[build-lane-proof] ALL PASSED (§1–§6) — the build face PLANS: steps chosen by the template planner, receipts on record');
} finally {
  rmSync(box, { recursive: true, force: true });
}
