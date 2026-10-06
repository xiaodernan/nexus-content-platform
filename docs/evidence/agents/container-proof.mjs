// NEXUS M2 v166 — container proof (ADR 0016 amendment 166, ADR 0013 third slice).
// The sandbox gained its first OS-level isolation: a policy-approved plan now runs inside an
// EPHEMERAL container whose argv can carry no host mount, with egress denied, caps enforced and
// a read-only rootfs — every claim below measured against the REAL docker daemon on this host.
// Run after `npm run build` (docker daemon required; the probe says so honestly if absent):
//   node docs/evidence/agents/container-proof.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const hostPkg = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry } = rt;
const {
  CONTAINER_DEFAULTS,
  CONTAINER_ISOLATION_ARGS,
  CONTAINER_MOUNT_FLAGS,
  createContainerExecHost,
  loadContainerAudits,
  planContainerRun,
  probeContainerRuntime,
  registerContainerExecTools,
} = hostPkg;

/** ASYNC spawn only on this host (the sync family is 100% EBUSY — ebusy-proof.mjs, amendment 152). */
function realSpawn(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err += c));
    child.on('error', (e) => resolve({ code: null, signal: null, stdout: out, stderr: err, error: e.message }));
    child.on('close', (code, signal) => resolve({ code, signal, stdout: out, stderr: err, error: '' }));
  });
}

// ── §1 the probe answers the honest question against the REAL daemon ────────────────────────
// 30s: a WSL2-backed Docker Desktop waking from idle can take longer than the default 10s.
const probe = await probeContainerRuntime({ timeoutMs: 30_000 });
if (!probe.available) {
  console.log(`[container-proof] docker daemon unavailable (${probe.reason}) — the isolation slice is honestly UNVERIFIED here, not faked (§60). Everything below is skipped by design.`);
  process.exit(2);
}
console.log(`[container-proof] §1 probe: docker daemon ${probe.serverVersion} answered — the isolation slice is measured, not narrated`);

// ── §1.5 warm the daemon: a WSL2-backed Desktop waking from idle spends its first seconds on
// the VM and the image mount; every budget below assumes the daemon is already awake — stated,
// not hidden. Three tries, then an honest exit like an absent daemon.
for (let attempt = 1; ; attempt += 1) {
  const warm = await realSpawn('docker', ['run', '--rm', 'node:22-alpine', 'node', '-e', 'console.log("warm")']);
  if (warm.code === 0) {
    console.log(`[container-proof] §1.5 warm: the daemon answered a bare container run (attempt ${attempt})`);
    break;
  }
  if (attempt >= 3) {
    console.log(`[container-proof] §1.5 warm FAILED after 3 attempts (exit ${warm.code}, stderr: ${warm.stderr.slice(0, 120) || 'empty'}) — the isolation slice is honestly UNVERIFIED here (§60).`);
    process.exit(2);
  }
}

// ── §2 the plan audit reads the SHIPPED module: isolation as data, mounts impossible ─────────
const POLICY = {
  image: 'node:22-alpine',
  workdirRoot: '/workspace',
  // 60s ceilings: the budgets bound a WARM daemon's runs (~1-2s) with a wide margin; a WAKING
  // WSL2 daemon has been measured to spend >20s on its first container mount (§1.5 warms it).
  allow: [{ argv: ['node', '-e', '*'], timeoutMs: 60_000, maxOutputBytes: 4_096 }, { argv: ['sleep', '*'], timeoutMs: 60_000 }],
  envAllow: ['NEXUS_MARKER'],
  maxTimeoutMs: 60_000,
};
const decision = planContainerRun({ argv: ['node', '-e', 'console.log("plan-ok")'] }, POLICY);
assert.equal(decision.ok, true, 'the policy plans the inner command');
const plan = decision.ok ? decision.plan : null;
for (const flag of CONTAINER_ISOLATION_ARGS) assert.ok(plan.dockerArgs.includes(flag), `isolation flag missing from the spawned argv: ${flag}`);
assert.deepEqual(
  plan.dockerArgs.filter((a) => CONTAINER_MOUNT_FLAGS.includes(a)),
  [],
  'a mount flag (-v/--volume/--mount) appeared in the argv — the no-host-fs guarantee is dead',
);
assert.equal(plan.dockerArgs[plan.dockerArgs.indexOf('--network') + 1], 'none', 'egress must be default-deny');
assert.equal(plan.dockerArgs[plan.dockerArgs.indexOf('--memory') + 1], `${CONTAINER_DEFAULTS.memoryMb}m`);
assert.equal(plan.executes, false, 'planning alone still executes nothing (v29 honesty, inherited)');
console.log(`[container-proof] §2 plan audit: ${CONTAINER_ISOLATION_ARGS.length} isolation flags in the argv · mount flags ${plan.dockerArgs.filter((a) => CONTAINER_MOUNT_FLAGS.includes(a)).length} · caps memory=${CONTAINER_DEFAULTS.memoryMb}m cpus=${CONTAINER_DEFAULTS.cpus} pids=${CONTAINER_DEFAULTS.pidsLimit} · executes:false`);

// ── the host with the REAL SpawnLike and an on-disk audit trail ──────────────────────────────
const scratch = mkdtempSync(join(tmpdir(), 'nexus-container-proof-'));
const auditFile = join(scratch, 'container-audit.jsonl').replaceAll('\\', '/');
const disk = {
  readFileSync: (p) => readFileSync(p, 'utf8'),
  mkdirSync: () => {},
  writeFileSync: (p, d) => writeFileSync(p, d, 'utf8'),
};
const real = createContainerExecHost(POLICY, { journal: { disk, file: auditFile } });
const OK_GATE = { checkpoint: () => true };
const runs = [];

// ── §3 a REAL run: the inner command executes inside the container and its answer returns ────
{
  let r = await real.run({ argv: ['node', '-e', 'console.log("container-alive:" + process.version)'] }, OK_GATE);
  // A Windows docker client that is still waking can die at the spawn layer (exit null); one
  // retry keeps the proof about ISOLATION, not about Desktop's warm-up — the retry is stated.
  if (r.exitCode === null && r.spawnError === '') {
    console.log('[container-proof] §3 note: first attempt returned exit null (docker client died before reporting) — retrying once');
    await new Promise((res) => setTimeout(res, 2_000));
    r = await real.run({ argv: ['node', '-e', 'console.log("container-alive:" + process.version)'] }, OK_GATE);
  }
  runs.push(r);
  assert.equal(r.ran, true, 'the container ran');
  assert.equal(r.exitCode, 0, `exit 0 (spawnError: ${r.spawnError || 'none'}, stderr: ${r.stderr.slice(0, 200) || 'empty'})`);
  assert.ok(r.stdout.includes('container-alive:v'), `the container's answer arrived whole: ${JSON.stringify(r.stdout)}`);
  assert.equal(r.killedByBudget, false);
  assert.equal(r.spawnError, '');
  assert.ok(r.dockerArgs.includes('node:22-alpine'), 'the pinned image crossed into the spawned argv');
  console.log(`[container-proof] §3 real run: node ${r.stdout.trim().split(':')[1]} inside node:22-alpine → exit 0 (pinned image, exec-form argv)`);
}

// ── §4 the isolation is MEASURED: read-only rootfs, /tmp scratch, denied egress, no host fs ──
{
  const ro = await real.run({ argv: ['node', '-e', `const fs=require('fs');try{fs.writeFileSync('/usr/marker','x');console.log('ROOTFS-WRITABLE');process.exit(3)}catch(e){console.log('ROOTFS-READ-ONLY:'+e.code);process.exit(0)}`] }, OK_GATE);
  runs.push(ro);
  assert.equal(ro.exitCode, 0, 'the read-only probe exited cleanly');
  assert.ok(ro.stdout.includes('ROOTFS-READ-ONLY:'), `the rootfs refused the write: ${JSON.stringify(ro.stdout)}`);
  const tmp = await real.run({ argv: ['node', '-e', `const fs=require('fs');fs.writeFileSync('/tmp/scratch','x');console.log('TMP-WRITABLE:'+fs.readFileSync('/tmp/scratch','utf8'))`] }, OK_GATE);
  runs.push(tmp);
  assert.ok(tmp.stdout.includes('TMP-WRITABLE:x'), 'the tmpfs scratch is the writable place');
  const marker = join(scratch, 'host-marker.txt');
  writeFileSync(marker, 'host bytes', 'utf8');
  const hostPath = marker.replaceAll('\\', '/');
  const nofs = await real.run({ argv: ['node', '-e', `const fs=require('fs');console.log(fs.existsSync(${JSON.stringify(hostPath)}) ? 'HOST-FS-VISIBLE' : 'HOST-FS-ABSENT')`] }, OK_GATE);
  runs.push(nofs);
  assert.ok(nofs.stdout.includes('HOST-FS-ABSENT'), `no bind mount exists, so the host path is invisible inside: ${JSON.stringify(nofs.stdout)}`);
  const net = await real.run({ argv: ['node', '-e', `const t=setTimeout(()=>{console.log('NET-TIMEOUT');process.exit(7)},8000);require('http').get('http://93.184.216.34/',r=>{clearTimeout(t);console.log('NET-REACHED');process.exit(0)}).on('error',e=>{clearTimeout(t);console.log('NET-DENIED:'+(e.code||e.message));process.exit(0)})`] }, OK_GATE);
  runs.push(net);
  assert.ok(net.stdout.includes('NET-DENIED:'), `--network none answered at the socket layer: ${JSON.stringify(net.stdout)}`);
  assert.notEqual(net.exitCode, 7, 'the fallback timer never fired — the denial was immediate, not slow');
  console.log(`[container-proof] §4 isolation measured: rootfs ${ro.stdout.trim()} · /tmp ${tmp.stdout.trim()} · host fs ${nofs.stdout.trim()} · egress ${net.stdout.trim().split(':')[0]}`);
}

// ── §5 the wall-clock budget kills the client AND retires the container by name ──────────────
{
  const shortPolicy = { ...POLICY, allow: [{ argv: ['sleep', '*'], timeoutMs: 4_000 }] };
  const short = createContainerExecHost(shortPolicy, { journal: { disk, file: auditFile } });
  const r = await short.run({ argv: ['sleep', '60'] }, OK_GATE);
  runs.push(r);
  assert.equal(r.killedByBudget, true, 'the budget killed the run');
  assert.ok(r.cleanup, 'the kill carries a cleanup record — the retirement was ATTEMPTED, not assumed');
  assert.equal(r.cleanup.removed, true, `docker rm -f reported success: ${r.cleanup.note}`);
  const gone = await realSpawn('docker', ['ps', '-a', '--filter', `name=${r.containerName}`, '--format', '{{.ID}}']);
  assert.equal(gone.stdout.trim(), '', `the container is gone from the daemon: ${gone.stdout.trim()}`);
  console.log(`[container-proof] §5 budget: sleep 60 killed at 4s · ${r.containerName} retired (${r.cleanup.note.split('—')[0].trim()}) · daemon listing empty`);
}

// ── §6 the policy outranks the gate: an unallowlisted command never reaches docker ────────────
{
  const r = await real.run({ argv: ['curl', 'http://evil.test'] }, { checkpoint: () => true });
  runs.push(r);
  assert.equal(r.ran, false);
  assert.equal(r.planned, false);
  assert.deepEqual(r.dockerArgs, []);
  assert.ok(r.reason.includes('default-deny'));
  console.log('[container-proof] §6 refusal: curl is nobody inside this policy — default-deny, no spawn, recorded');
}

// ── §7 the journal: every outcome above, on the record, with the rule that allowed it ─────────
{
  const { records, malformed } = loadContainerAudits(disk, auditFile);
  assert.equal(malformed, 0, 'no malformed audit lines');
  assert.deepEqual(records.map((r) => r.rule), [0, 0, 0, 0, 0, 0, null], 'a rule number EXACTLY when the policy said yes');
  assert.equal(records.at(-1).reason.includes('default-deny'), true, 'the refusal is on the record too');
  assert.equal(records[5].killedByBudget, true, 'the kill is on the record');
  console.log(`[container-proof] §7 journal: ${records.length} outcomes recorded in order, refusals and kills included (seq 1..${records.length})`);
}

// ── §8 the door: container.exec through the §28-gated registry ───────────────────────────────
{
  const registry = new ToolRegistry();
  registerContainerExecTools(registry, real);
  const denied = await registry.invoke({ callId: 'p8a', tool: 'container.exec', args: { argv: ['node', '-e', 'console.log("never")'] } });
  assert.equal(denied.ok, false);
  assert.ok(denied.error.includes('checkpoint required for exec'), 'no gate, no spawn');
  const res = await registry.invoke({ callId: 'p8b', tool: 'container.exec', args: { argv: ['node', '-e', 'console.log("door-open:"+(2+3))'] } }, OK_GATE);
  assert.equal(res.ok, true);
  const out = res.output;
  assert.equal(out.ok, true);
  assert.ok(out.detail.includes('container node:22-alpine'), `the door names image + exit in its own words: ${out.detail}`);
  assert.ok(out.result.stdout.includes('door-open:5'), 'the container computed the answer');
  console.log('[container-proof] §8 door: container.exec is exec-permission, gated at the registry, answered by the container');
}

rmSync(scratch, { recursive: true, force: true });
console.log('[container-proof] ALL ASSERTIONS PASSED (ADR 0013 now has an OS-level wall: the same plan discipline, sealed inside an ephemeral container)');
