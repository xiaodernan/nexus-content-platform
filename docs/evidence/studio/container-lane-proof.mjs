// NEXUS M2 v172 — the Studio dock's container lane: the agent's exec door is BORN in the
// container (ADR 0016 amendment 172, DEVELOPMENT_PLAN queue item 7).
//
// v166 built the wall (createContainerExecHost, real-daemon proof §1–§8) — and proved that
// nobody was behind it: every exec-host register* had ZERO production consumers. This proof
// pins the FIRST product consumer: the Studio dock's container route. Built from the SHIPPED
// bytes rather than a copy:
//
//   - the container layer is `agents/exec-host/dist` (build first);
//   - the route core is `apps/studio/src/lib/containerServer.ts` — the ACTUAL Studio module,
//     read off disk and run through Node's own TypeScript type-stripper;
//   - the daemon is the REAL one on this host.
//
// What it asserts, in order:
//   §1 the lane's probe is the REAL daemon's answer, merged with the pinned policy facts;
//   §2 the policy the route serves is data: pinned image, container workdir root, a two-rule
//      allowlist, and it validates against exec-host's own validator;
//   §3 the route refuses BEFORE any spawn: argv the allowlist never named, an absolute host
//      cwd, a malformed body — each with its reason stated, never a silent success;
//   §4 the self-check REALLY runs: an ephemeral container (nexus-exec-*), the spawned argv
//      carries every isolation flag from the SAME array the audit reads, no mount flag the
//      builder can emit, exit 0, and the detail line names image + exit in its own words;
//   §5 §28 keeps its teeth server-side too: no checkpoint → refused, a denying checkpoint →
//      refused (the dock panel's Allow-once is the human gate the route trusts);
//   §6 §60: the CLIENT half of the lane imports nothing from @nexus/exec-host and names no
//      process-spawn module — the browser bundle stays spawn-free by construction.
//
// Run after `npm run build`:  node docs/evidence/studio/container-lane-proof.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// ── the shipped container layer ──────────────────────────────────────────────────────────────────────
const execHost = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { CONTAINER_ISOLATION_ARGS, CONTAINER_MOUNT_FLAGS, CONTAINER_NAME_PREFIX } = execHost;

// ── the SHIPPED Studio route core, type-stripped rather than copied ──────────────────────────────────
const { stripTypeScriptTypes } = await import('node:module');
const strip = (rel, box) => {
  const p = join(box, rel.split('/').pop().replace(/\.ts$/, '.mjs'));
  writeFileSync(p, stripTypeScriptTypes(readFileSync(rel, 'utf8'), { mode: 'strip' }), 'utf8');
  return import(pathToFileURL(p).href);
};
const box = mkdtempSync(join('apps/studio', 'nexus-container-lane-'));
try {
  const containerServer = await strip('apps/studio/src/lib/containerServer.ts', box);
  const { containerLaneState, createStudioContainerHost, runContainerExec, STUDIO_CONTAINER_IMAGE, STUDIO_CONTAINER_POLICY, studioContainerPolicyError } = containerServer;
  assert.equal(typeof runContainerExec, 'function', 'the Studio route core was really imported, not re-implemented');

  // ── §1 the probe is the REAL daemon's answer, merged with the pinned facts ────────────────────────
  const s = await containerLaneState();
  assert.equal(s.available, true, `the docker daemon on this host answers the probe: ${s.reason}`);
  assert.ok(s.serverVersion !== '', `the probe states the daemon's own version: ${s.serverVersion}`);
  assert.equal(s.image, 'node:22-alpine');
  assert.equal(s.workdirRoot, '/workspace');
  console.log(`[container-lane-proof] §1 probe: docker daemon ${s.serverVersion} · pin ${s.image} @ ${s.workdirRoot}`);

  // ── §2 the policy is data, and it validates against exec-host's own validator ────────────────────
  assert.equal(studioContainerPolicyError(), null);
  assert.equal(STUDIO_CONTAINER_POLICY.image, STUDIO_CONTAINER_IMAGE);
  assert.deepEqual(STUDIO_CONTAINER_POLICY.allow.map((r) => r.argv), [['node', '-e', '*'], ['node', '--version']]);
  assert.deepEqual(STUDIO_CONTAINER_POLICY.envAllow, [], 'envAllow stays [] (nothing passes through)');
  console.log('[container-lane-proof] §2 policy: pinned image + container root + 2-rule allowlist + empty env allow, validator null');

  // ── §3 refusals happen BEFORE any spawn, each with a stated reason ────────────────────────────────
  const refusedArgv = await runContainerExec({ argv: ['ls', '-la'] });
  assert.equal(refusedArgv.ok, true);
  assert.equal(refusedArgv.ran, false);
  assert.ok(refusedArgv.detail.includes('no allowlist rule matches'), refusedArgv.detail);
  const refusedCwd = await runContainerExec({ argv: ['node', '-e', '1'], cwd: 'C:/Windows' });
  assert.equal(refusedCwd.ran, false);
  assert.ok(refusedCwd.detail.includes('cwd refused'), refusedCwd.detail);
  const malformed = await runContainerExec({ argv: 'node -e 1' });
  assert.equal(malformed.ok, false);
  assert.ok(malformed.reason.includes('argv must be'), malformed.reason);
  console.log('[container-lane-proof] §3 refusals: unnamed argv · absolute host cwd · malformed body — all stated, none executed');

  // ── §4 the self-check REALLY runs, in an ephemeral container, under the audited argv ─────────────
  const ran = await runContainerExec({ argv: ['node', '-e', 'console.log("jail ok")'] });
  assert.equal(ran.ok, true);
  assert.equal(ran.ran, true, `the route ran: ${ran.ok && !ran.ran ? ran.detail : ''}`);
  const r = ran.result;
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, 'jail ok\n');
  assert.equal(r.image, 'node:22-alpine');
  assert.equal(r.workdir, '/workspace');
  assert.ok((r.containerName ?? '').startsWith(CONTAINER_NAME_PREFIX), `ephemeral name: ${r.containerName}`);
  for (const flag of CONTAINER_ISOLATION_ARGS) assert.ok(r.dockerArgs.includes(flag), `isolation flag ${flag} present`);
  for (const flag of CONTAINER_MOUNT_FLAGS) assert.ok(!r.dockerArgs.includes(flag), `mount flag ${flag} absent`);
  assert.ok(ran.detail.includes('node:22-alpine') && ran.detail.includes('exit 0'), `detail: ${ran.detail}`);
  assert.deepEqual(Object.keys(ran).sort(), ['detail', 'ok', 'ran', 'result'], 'the route answer states exactly its four keys');
  console.log(`[container-lane-proof] §4 real run: ${ran.detail} (container ${r.containerName}, ${CONTAINER_ISOLATION_ARGS.length} isolation flags, 0 mount flags)`);

  // ── §5 §28 keeps its teeth server-side ────────────────────────────────────────────────────────────
  const host = createStudioContainerHost();
  const noGate = await host.run({ argv: ['node', '-e', '1'] });
  assert.equal(noGate.ran, false);
  assert.ok(noGate.reason.includes('checkpoint required'), noGate.reason);
  const denied = await host.run({ argv: ['node', '-e', '1'] }, { checkpoint: () => false });
  assert.equal(denied.ran, false);
  assert.equal(denied.reason, 'checkpoint denied');
  console.log('[container-lane-proof] §5 §28: no gate → refused; denying gate → refused (the panel Allow-once is the human gate)');

  // ── §6 §60: the CLIENT half of the lane stays spawn-free by construction ──────────────────────────
  const laneSrc = readFileSync('apps/studio/src/lib/containerLane.ts', 'utf8');
  assert.ok(!/from\s+['"]@nexus\/exec-host['"]/.test(laneSrc) && !laneSrc.includes("import('@nexus/exec-host')"), 'the client lane imports nothing from the spawn-capable package (mentions in prose are not imports)');
  assert.ok(!laneSrc.includes('child_process'), 'the client lane names no process-spawn module');
  const routeSrc = readFileSync('apps/studio/src/app/api/agent/container/route.ts', 'utf8');
  assert.ok(routeSrc.includes("runtime = 'nodejs'"), 'the route declares the Node runtime explicitly');
  console.log('[container-lane-proof] §6 §60: browser bundle spawn-free; the one spawn-capable package lives server-side only');

  console.log('[container-lane-proof] ALL PASSED (§1–§6) — the dock exec lane is born in the container, not on the host');
} finally {
  rmSync(box, { recursive: true, force: true });
}