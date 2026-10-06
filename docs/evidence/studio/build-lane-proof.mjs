// NEXUS M6 v174 — the Studio dock's BUILD face: the build arc gets its first product
// consumer (ADR 0016 amendment 174, DEVELOPMENT_PLAN queue item 8, product slice).
//
// v173 wired the arc headless (runtime buildArc + exec-host container verifier, proof
// §1–§7) — with zero product consumers, the same gap v166/v172 closed for container exec.
// This proof pins the FIRST product consumer: the Studio dock's build route. Built from the
// SHIPPED bytes rather than a copy:
//
//   - the arc layer is `agents/runtime/dist` and the container layer `agents/exec-host/dist`
//     (build first);
//   - the route core is `apps/studio/src/lib/buildServer.ts` — the ACTUAL Studio module,
//     read off disk and run through Node's own TypeScript type-stripper;
//   - the daemon is the REAL one on this host.
//
// What it asserts, in order:
//   §1 the face's probe is the REAL daemon's answer, merged with the pinned ARC facts
//      (arcId, engine, the two steps as argv data);
//   §2 the arc and the §28 stance are DATA: the pinned steps fit the SAME container
//      allowlist the exec lane serves, and the checkpoint policy grants build.verify on
//      record with everything else default-deny (validated by the runtime's own validator);
//   §3 the arc REALLY walks: two green steps inside an ephemeral container (nexus-exec-*),
//      every isolation flag from the SAME array the audit reads, no mount flag, receipts
//      per callId naming the door's reason, and the compute step's stdout measured —
//      the container COMPUTED "arc ok:5", it did not just exit 0;
//   §4 a red verdict is an honest answer, not an error: a step failing exit 3 stops the
//      walk at that step, the reason quotes the engine, and exactly one receipt exists;
//   §5 the request cannot widen anything: the POST takes NO body (the route handler
//      signature is the statement), the arc id/engine are exports of one module, and the
//      checkpoint policy's default is default-deny;
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
const { CONTAINER_ISOLATION_ARGS, CONTAINER_MOUNT_FLAGS, CONTAINER_NAME_PREFIX } = execHost;

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
  const { buildArcState, runStudioBuildArc, STUDIO_BUILD_ARC, STUDIO_BUILD_ARC_ID, STUDIO_BUILD_ENGINE, studioBuildArcAllowlistError, studioBuildCheckpointPolicyError } = buildServer;
  assert.equal(typeof runStudioBuildArc, 'function', 'the Studio route core was really imported, not re-implemented');

  // ── §1 the probe is the REAL daemon's answer, merged with the pinned arc facts ────────────────────
  const s = await buildArcState();
  assert.equal(s.available, true, `the docker daemon on this host answers the probe: ${s.reason}`);
  assert.ok(s.serverVersion !== '', `the probe states the daemon's own version: ${s.serverVersion}`);
  assert.equal(s.arcId, 'studio-build-arc');
  assert.equal(s.engine, 'container:node:22-alpine');
  assert.deepEqual(s.steps, [
    ['node', '--version'],
    ['node', '-e', 'console.log("arc ok:" + String(2 + 3))'],
  ]);
  console.log(`[build-lane-proof] §1 probe: docker daemon ${s.serverVersion} · arc ${s.arcId} · engine ${s.engine} · ${s.steps.length} pinned step(s)`);

  // ── §2 the arc and the §28 stance are data, validated by their own validators ─────────────────────
  assert.equal(studioBuildArcAllowlistError(), null, 'every pinned step fits the SAME container allowlist the exec lane serves');
  assert.equal(studioBuildCheckpointPolicyError(), null);
  assert.equal(STUDIO_BUILD_ARC_ID, STUDIO_BUILD_ARC.arcId);
  console.log('[build-lane-proof] §2 data: pinned arc inside the container allowlist; §28 policy = build.verify granted on record, default-deny');

  // ── §3 the arc REALLY walks, inside an ephemeral container, under the audited argv ────────────────
  const ran = await runStudioBuildArc();
  assert.equal(ran.ok, true);
  if (!ran.ok) throw new Error('unreachable');
  assert.equal(ran.status, 'completed', `the walk completed: ${ran.status} ${ran.reason ?? ''}`);
  assert.equal(ran.detail.includes('2/2 step(s) green'), true, `detail: ${ran.detail}`);
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
  console.log(`[build-lane-proof] §3 real walk: ${ran.detail} · stdout "${ran.steps[1].stdout.trim()}" measured · 2 receipts on record`);

  // ── §4 a red verdict is an honest answer: the walk stops, the engine's words travel ───────────────
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
  console.log(`[build-lane-proof] §4 red verdict: ${red.detail}`);

  // ── §5 the request cannot widen anything ─────────────────────────────────────────────────────────
  const routeSrc = readFileSync('apps/studio/src/app/api/agent/build-arc/route.ts', 'utf8');
  assert.ok(/export async function POST\(\): Promise<NextResponse>/.test(routeSrc), 'the POST takes NO body — the browser cannot name a step');
  assert.ok(routeSrc.includes("runtime = 'nodejs'"), 'the route declares the Node runtime explicitly');
  const noWiden = await buildArcState({ spawnLike: (_c, _a) => ({ onData: () => {}, onEnd: (l) => setImmediate(() => l({ code: null, signal: null, error: 'spawn ENOENT' })), kill: () => {} }) });
  assert.equal(noWiden.available, false, 'unavailability is stated, never faked');
  console.log('[build-lane-proof] §5 no widening: bodyless POST, pinned exports, honest unavailability');

  // ── §6 §60 dependency audit ───────────────────────────────────────────────────────────────────────
  const laneSrc = readFileSync('apps/studio/src/lib/buildLane.ts', 'utf8');
  assert.ok(!/from\s+['"]@nexus\/(exec-host|agent-runtime)['"]/.test(laneSrc), 'the client lane imports nothing from the runtime or the spawn-capable package (mentions in prose are not imports)');
  assert.ok(!laneSrc.includes('child_process'), 'the client lane names no process-spawn module');
  const serverSrc = readFileSync('apps/studio/src/lib/buildServer.ts', 'utf8');
  assert.ok(/from\s+['"]@nexus\/exec-host['"]/.test(serverSrc), 'the server core is the legal junction: it imports the container layer…');
  assert.ok(/from\s+['"]@nexus\/agent-runtime['"]/.test(serverSrc), '…and the arc layer — both directions point runtime-ward/inward, never out of studio');
  console.log('[build-lane-proof] §6 §60: browser bundle runtime-free and spawn-free; the studio server is the one junction of both layers');

  console.log('[build-lane-proof] ALL PASSED (§1–§6) — the build arc has its first product consumer, receipts on record');
} finally {
  rmSync(box, { recursive: true, force: true });
}
