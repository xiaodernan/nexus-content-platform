// NEXUS M6 v177 — the dock's DEPLOY face: the deploy arc's FIRST PRODUCT CONSUMER
// (ADR 0016 amendment 177, DEVELOPMENT_PLAN item 8). v176 gave the runtime the deploy
// arc — `planDeployArc`, the ONE `deploy.record` write door, `DeploySink` as a host-injected
// seam. This proof pins the product face around it, built from the SHIPPED bytes:
//
//   - the arc layer is `agents/runtime/dist` and the container layer `agents/exec-host/dist`
//     (build first);
//   - the route core is `apps/studio/src/lib/deployServer.ts` — the ACTUAL Studio module,
//     read off disk and run through Node's own TypeScript type-stripper;
//   - the daemon is the REAL one on this host, and the records file is a real file on disk
//     (a temp box the proof cleans up — the production default `.nexus/deployments.jsonl`
//     is asserted via §1's cross-check and §6's gitignore audit, never written here).
//
// What it asserts, in order:
//   §1 the face's probe is the REAL daemon's answer, merged with the deploy facts (records
//      path + a record count that equals what is actually on file);
//   §2 the §28 stance and the sink are DATA + SEAM: deploy.record granted on record with
//      everything else default-deny (validated), and the sink writes the engine's own words
//      verbatim to the file, refusing loudly when the write fails;
//   §3 a REAL green build arc deploys: two facts — the container's own `node --version` and
//      the computed `arc ok:5` — land as two JSONL lines, one §28 receipt per fact, callIds
//      joining `:deploy:` to the arc;
//   §4 the request names a GOAL, never argv: a narrower goal deploys exactly its own arc's
//      one fact, and a goal that plans nothing is an honest `unplanned` answer — zero doors,
//      the file untouched;
//   §5 nothing deploys from a red arc (not-green, zero writes), and a sink that cannot write
//      ends the walk `failed` at the first unrecorded fact — exactly one receipt;
//   §6 §60 dependency audit: the CLIENT lane imports nothing from the runtime or the
//      spawn-capable package and names no process-spawn module; the server core is the legal
//      junction (runtime + the build face it deploys from); the route declares Node runtime
//      and states goal-not-argv; the records path is gitignored on purpose.
//
// Run after `npm run build`:  node docs/evidence/studio/deploy-lane-proof.mjs
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// ── the shipped arc + container layers ───────────────────────────────────────────────────────────────
await import(pathToFileURL('./agents/exec-host/dist/index.js').href);

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
const box = mkdtempSync(join('apps/studio', 'nexus-deploy-lane-'));
try {
  await strip('apps/studio/src/lib/containerServer.ts', box); // buildServer's relative import lands here
  await strip('apps/studio/src/lib/buildServer.ts', box); // deployServer's relative import lands here
  const deployServer = await strip('apps/studio/src/lib/deployServer.ts', box);
  const {
    createStudioDeploySink,
    deployArcState,
    nodeDeployFs,
    runStudioDeployArc,
    studioDeployCheckpointPolicyError,
    studioDeployRecordCount,
    STUDIO_DEPLOY_CHECKPOINT_POLICY,
    STUDIO_DEPLOY_RECORDS_PATH,
  } = deployServer;
  const { STUDIO_BUILD_ARC_ID, STUDIO_BUILD_ENGINE, STUDIO_BUILD_GOAL } = await import(pathToFileURL(join(box, 'buildServer.mjs')).href);
  assert.equal(typeof runStudioDeployArc, 'function', 'the Studio route core was really imported, not re-implemented');

  // ── §1 the probe is the REAL daemon's answer, merged with the deploy records facts ────────────────
  const s = await deployArcState();
  assert.equal(s.available, true, `the docker daemon on this host answers the probe: ${s.reason}`);
  assert.ok(s.serverVersion !== '', `the probe states the daemon's own version: ${s.serverVersion}`);
  assert.equal(s.arcId, 'studio-build-arc', 'deploy stands on the BUILD arc — one arcId joins build and deploy');
  assert.equal(s.engine, 'container:node:22-alpine');
  assert.deepEqual(s.steps, [
    ['node', '--version'],
    ['node', '-e', 'console.log("arc ok:" + String(2 + 3))'],
  ]);
  assert.equal(s.recordsPath, '.nexus/deployments.jsonl', 'the face states where records land');
  const onFile = existsSync(STUDIO_DEPLOY_RECORDS_PATH)
    ? readFileSync(STUDIO_DEPLOY_RECORDS_PATH, 'utf8').split('\n').filter((l) => l.trim() !== '').length
    : 0;
  assert.equal(s.recordCount, onFile, `the stated record count is the file's actual line count (${onFile})`);
  console.log(`[deploy-lane-proof] §1 probe: docker daemon ${s.serverVersion} · arc ${s.arcId} · records → ${s.recordsPath} · ${s.recordCount} on file`);

  // ── §2 the §28 stance is validated data; the sink writes verbatim and refuses loudly ──────────────
  assert.equal(studioDeployCheckpointPolicyError(), null);
  assert.equal(STUDIO_DEPLOY_CHECKPOINT_POLICY.rules[0].tool, 'deploy.record');
  assert.equal(STUDIO_DEPLOY_CHECKPOINT_POLICY.default.grant, false, 'everything else default-deny');
  const sinkPath = join(box, 'sink.jsonl');
  const { sink } = createStudioDeploySink({ fs: nodeDeployFs, recordsPath: sinkPath, arcId: 'a1', goal: 'g', engine: 'e' });
  const ok = await sink({ arcId: 'a1', stepId: 's1', fact: 'arc ok:5\n' });
  assert.equal(ok.ok, true, `the sink records: ${ok.detail}`);
  const line = JSON.parse(readFileSync(sinkPath, 'utf8').split('\n')[0]);
  assert.deepEqual(line, { at: line.at, arcId: 'a1', goal: 'g', stepId: 's1', fact: 'arc ok:5\n', engine: 'e' });
  assert.equal(studioDeployRecordCount({ fs: nodeDeployFs, recordsPath: sinkPath }), 1);
  const brokenSink = createStudioDeploySink({
    fs: { appendFileSync: () => { throw new Error('disk full'); }, readFileSync: () => { throw new Error('no file'); } },
    recordsPath: sinkPath,
    arcId: 'a1',
    goal: 'g',
    engine: 'e',
  });
  const refused = await brokenSink.sink({ arcId: 'a1', stepId: 's2', fact: 'x' });
  assert.equal(refused.ok, false);
  assert.ok(refused.detail.includes('the record did not land') && refused.detail.includes('disk full'), `refusal names the cause: ${refused.detail}`);
  console.log('[deploy-lane-proof] §2 data: deploy.record granted on record + default-deny (validated); the sink writes the fact verbatim and refuses loudly');

  // ── §3 a REAL green build arc deploys its measured facts ──────────────────────────────────────────
  const recordsPath = join(box, 'deployments.jsonl');
  const a = await runStudioDeployArc({ recordsPath });
  assert.equal(a.ok, true);
  if (!a.ok) throw new Error('unreachable');
  assert.equal(a.status, 'recorded', `the walk recorded: ${a.status} ${a.reason ?? ''}`);
  assert.equal(a.goal, STUDIO_BUILD_GOAL, 'the deploy stands on the face\'s default build goal');
  assert.equal(a.build.status, 'completed', 'the BUILD verdict it stands on is stated');
  assert.ok(a.detail.includes('2 fact(s) recorded'), `detail: ${a.detail}`);
  assert.deepEqual(a.facts.map((f) => f.stepId), ['runtime', 'compute'], 'the facts arrive in door order');
  assert.equal(a.facts[1].stdout, 'arc ok:5\n', 'the container COMPUTED the answer — stdout verbatim, byte for byte');
  assert.ok(a.facts[0].stdout.trim() !== '', `the runtime step's own words: ${a.facts[0].stdout.trim()}`);
  assert.deepEqual(a.unmeasured, [], 'every green step measured something');
  assert.deepEqual(a.deployReceipts.map((r) => r.callId), [`${STUDIO_BUILD_ARC_ID}:deploy:runtime`, `${STUDIO_BUILD_ARC_ID}:deploy:compute`], 'callIds join the arc through :deploy:');
  assert.equal(a.deployReceipts.every((r) => r.granted), true);
  for (const r of a.deployReceipts) assert.ok(r.reason.includes('Allow-once'), `the receipt states WHY the write door opened: ${r.reason}`);
  const stored = readFileSync(recordsPath, 'utf8').split('\n').filter((l) => l.trim() !== '');
  assert.equal(stored.length, 2, 'the records file holds exactly the two facts');
  const r0 = JSON.parse(stored[0]);
  assert.deepEqual(r0, {
    at: r0.at,
    arcId: STUDIO_BUILD_ARC_ID,
    goal: STUDIO_BUILD_GOAL,
    stepId: 'runtime',
    fact: a.facts[0].stdout,
    engine: STUDIO_BUILD_ENGINE,
  });
  assert.equal(JSON.parse(stored[1]).fact, 'arc ok:5\n');
  console.log(`[deploy-lane-proof] §3 real deploy: ${a.detail} · facts verbatim ("${a.facts[0].stdout.trim()}", "arc ok:5") · 2 receipts on record`);

  // ── §4 the request names a GOAL, never argv: narrower → one fact; nonsense → unplanned ────────────
  const narrow = await runStudioDeployArc({ recordsPath, goal: 'check the numbers' });
  assert.equal(narrow.ok, true);
  if (!narrow.ok) throw new Error('unreachable');
  assert.equal(narrow.status, 'recorded');
  assert.equal(narrow.goal, 'check the numbers');
  assert.deepEqual(narrow.facts, [{ stepId: 'compute', stdout: 'arc ok:5\n' }], 'a narrower goal deploys exactly its own arc\'s fact');
  assert.equal(studioDeployRecordCount({ fs: nodeDeployFs, recordsPath }), 3, 'deploys ACCUMULATE on the file');
  const unplanned = await runStudioDeployArc({ recordsPath, goal: 'zzz qqq nonsense' });
  assert.equal(unplanned.ok, true);
  if (!unplanned.ok) throw new Error('unreachable');
  assert.equal(unplanned.status, 'unplanned', 'a goal that plans no arc is an honest answer, not an error');
  assert.ok(unplanned.detail.includes('nothing deployed'), `detail: ${unplanned.detail}`);
  assert.deepEqual(unplanned.facts, []);
  assert.deepEqual(unplanned.deployReceipts, [], 'no write door was asked');
  assert.equal(studioDeployRecordCount({ fs: nodeDeployFs, recordsPath }), 3, 'the unplanned walk wrote nothing');
  console.log(`[deploy-lane-proof] §4 goal-not-argv: "check the numbers" → 1 fact (3 on file); "zzz qqq" → unplanned, the file untouched`);

  // ── §5 a red arc deploys NOTHING; a sink that cannot write fails the walk at that fact ────────────
  const red = await runStudioDeployArc({
    recordsPath,
    spawnLike: (_cmd, _args) => ({
      onData: () => {},
      onEnd: (l) => setImmediate(() => l({ code: 3, signal: null })),
      kill: () => {},
    }),
  });
  assert.equal(red.ok, true);
  if (!red.ok) throw new Error('unreachable');
  assert.equal(red.status, 'not-green', 'a build arc that did not complete deploys nothing');
  assert.ok(red.detail.includes('did not complete (failed)'), `detail: ${red.detail}`);
  assert.equal(red.build.status, 'failed', 'the BUILD verdict the deploy refused to stand on is stated');
  assert.deepEqual(red.facts, []);
  assert.equal(red.recordsPath, undefined, 'no recordsPath on a walk that recorded nothing');
  assert.equal(studioDeployRecordCount({ fs: nodeDeployFs, recordsPath }), 3, 'zero appends for a red arc');
  const broken = await runStudioDeployArc({
    recordsPath,
    fs: { appendFileSync: () => { throw new Error('disk full'); }, readFileSync: () => { throw new Error('no file'); } },
  });
  assert.equal(broken.ok, true);
  if (!broken.ok) throw new Error('unreachable');
  assert.equal(broken.status, 'failed', 'a refused record is the walk\'s honest answer');
  assert.ok((broken.reason ?? '').includes('disk full'), `reason: ${broken.reason}`);
  assert.deepEqual(broken.facts, [], 'the fact did not land, so it is not presented as deployed');
  assert.deepEqual(broken.deployReceipts.map((r) => r.callId), [`${STUDIO_BUILD_ARC_ID}:deploy:runtime`], 'exactly the ONE door that was asked');
  console.log(`[deploy-lane-proof] §5 honest refusals: red arc → not-green (file still 3); unrecordable fact → failed at runtime, 1 receipt`);

  // ── §6 §60 dependency audit ───────────────────────────────────────────────────────────────────────
  const laneSrc = readFileSync('apps/studio/src/lib/deployLane.ts', 'utf8');
  assert.ok(!/from\s+['"]@nexus\/(exec-host|agent-runtime)['"]/.test(laneSrc), 'the client lane imports nothing from the runtime or the spawn-capable package (mentions in prose are not imports)');
  assert.ok(!laneSrc.includes('child_process'), 'the client lane names no process-spawn module');
  const serverSrc = readFileSync('apps/studio/src/lib/deployServer.ts', 'utf8');
  assert.ok(/from\s+['"]@nexus\/agent-runtime['"]/.test(serverSrc), 'the server core is the legal junction: it imports the arc layer…');
  assert.ok(/from\s+['"]\.\/buildServer['"]/.test(serverSrc), '…and deploys FROM the build face — one walk, one owner of the build semantics');
  const routeSrc = readFileSync('apps/studio/src/app/api/agent/deploy/route.ts', 'utf8');
  assert.ok(/runtime = 'nodejs'/.test(routeSrc), 'the route declares Node runtime — the records file is server-side');
  assert.ok(/never a step, never an argv, never\s+\*?\s*a fact/.test(routeSrc), 'the boundary states it: a GOAL, never argv, never a fact');
  assert.ok(/goal must be a string/.test(routeSrc), 'a non-string goal is refused before anything plans');
  const gitignore = readFileSync('.gitignore', 'utf8');
  assert.ok(/^\.nexus\/$/m.test(gitignore), 'the records path is gitignored on purpose — deploy records are this server\'s, not the repo\'s');
  console.log('[deploy-lane-proof] §6 §60: browser bundle runtime-free and spawn-free; deployServer is the one junction; goal-not-argv at the boundary; .nexus/ untracked');

  console.log('[deploy-lane-proof] ALL PASSED (§1–§6) — the deploy face records a green arc\'s measured facts through the ONE write door');
} finally {
  rmSync(box, { recursive: true, force: true });
}
