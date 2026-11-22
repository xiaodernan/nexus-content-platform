// NEXUS v871 (ADR 0016 amendment 580) — M9: this module is the evidence that record points at; the claim is:
// NEXUS M9 — THE CHAIN READS BACK AS ONE TREE: `GET /incidents/{id}/chain` answers the incident, its patches,
// each patch's review requests, and each request's decisions and deployments — nested values are the SAME
// record shapes the five writing doors answer with, every level carries its total beside its window, and the
// read writes nothing. This proof builds the service, starts it against a throwaway PostgreSQL, runs the
// whole chain twice (one approved+deployed, one rejected), reads the tree, asserts the nesting and every
// status, refuses an unknown incident, proves the read is read-only with psql before/after, STOPS and STARTS
// the service, and reads the same tree again.
//
// Why a read model at all:
//   Five doors wrote five tables and a reader had to walk them one hop at a time. The view is a lens, not a
//   sixth record: it reads through the services that OWN each table, so it cannot see a row its own door
//   would refuse, and it nests the same record types, so a field cannot diverge.
//
// Why every level carries a total:
//   A window without a total cannot say whether it is the whole set. `total > list.size()` is the reader's
//   honest signal that something was left out; the proof pins it with the real totals.
//
// What it proves, clause by clause:
//   §0 the tools this proof needs (Java 25, Docker) are present BEFORE anything is started;
//   §1 the service BUILDS and STARTS; the chain runs twice — one patch approved then deployed, one request
//      rejected — and the tree answers 200 with two patches, each with one request;
//   §2 every level's shape is the writing doors' own: incident 11 fields, patch 8, request 7, decision 6,
//      deployment 10, and the three view levels carry exactly their documented fields;
//   §3 the statuses are all visible in one read: patch A `deployed`, request A `approved` with a succeeded
//      deployment, patch B `proposed`, request B `rejected` with a rejected decision;
//   §4 an unknown incident is 404 unknown-incident;
//   §5 the read is read-only: psql row counts of all five tables are identical before and after, and the
//      audit / delivery tables stay at zero;
//   §6 the service is STOPPED and STARTED: the same tree reads back with the same ids and statuses;
//   §7 psql reads the five tables' counts and ZERO audit / delivery rows;
//   §8 teardown.
//
// The honest bounds: the view is bounded at 100 children per level (the listing cap), and a truncated level
// is visible only by comparing its total with its list; the view is not paginated, cached or permissioned —
// no authentication (ADR 0018), so anyone who can reach the door may read the whole chain.
//
// Requires: Java 25, Maven, and a running Docker daemon. Run:  node docs/evidence/m9/chain-proof.mjs
// This repository's worktree is shared by concurrent lanes; when another lane is mid-edit, set
// NEXUS_SERVICE_DIR to a clean snapshot of services/nexus-api to grade THAT tree instead of the dirty one.
//
// sweep-budget-ms: 900000
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
import { existsSync, cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// THREE levels up: docs/evidence/m9/chain-proof.mjs -> the repository root.
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SERVICE_DIR = process.env.NEXUS_SERVICE_DIR
  ? path.resolve(process.env.NEXUS_SERVICE_DIR)
  : path.join(REPO_ROOT, 'services/nexus-api');
const DB_IMAGE = 'pgvector/pgvector:pg16';
const STAMP = `${Date.now()}-${process.pid}`;
const BUILD_DIR = path.join(tmpdir(), `nexus-chain-proof-build-${STAMP}`);
const JAR = path.join(BUILD_DIR, 'target/nexus-api-0.1.0-SNAPSHOT.jar');

const DB_CONTAINER = `nexus-chain-db-${STAMP}`;
const DB_NAME = 'nexus';
const DB_USER = 'nexus';
const DB_PASSWORD = 'nexus';
const PORT_FILE = path.join(tmpdir(), `nexus-chain-port-${STAMP}.txt`);
const PORT_FILE_SECOND = path.join(tmpdir(), `nexus-chain-port2-${STAMP}.txt`);

const SERVICE_START_TRIES = 180;

function canConnect(port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const done = (answer) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(answer);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** `mvn` is a `.cmd` shim on Windows, which Node refuses to spawn directly. */
function findOnPath(name) {
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : [''];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function runMaven(args, opts) {
  if (process.platform !== 'win32') return run('mvn', args, opts);
  const mvn = findOnPath('mvn');
  assert.ok(mvn, 'maven is not on PATH; ADR 0011 builds nexus-api with Maven');
  return run(process.env.ComSpec ?? 'cmd.exe', ['/c', mvn, ...args], opts);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Async `spawn`, never `spawnSync` — the synchronous family measured EBUSY under concurrency here. */
function run(command, args, { cwd = REPO_ROOT, env = {}, timeoutMs = 0 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = timeoutMs ? setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs) : null;
    child.stdout.on('data', (d) => { stdout += String(d); });
    child.stderr.on('data', (d) => { stderr += String(d); });
    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}${error.message}`, spawnError: error.code ?? 'unknown' });
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

async function until(probe, { tries = 60, gapMs = 500, label = 'condition' } = {}) {
  for (let i = 0; i < tries; i++) {
    const value = await probe();
    if (value) return value;
    await sleep(gapMs);
  }
  console.log(`[m9] gave up waiting for ${label} after ${tries} tries`);
  return null;
}

async function stopService(child) {
  if (!child || (child.exitCode !== null || child.signalCode !== null)) return;
  child.kill();
  const stopped = await until(async () => (child.exitCode !== null || child.signalCode !== null), { tries: 40, gapMs: 500, label: 'the service to stop' });
  if (stopped) return;
  if (process.platform === 'win32') {
    await run('taskkill', ['/F', '/T', '/PID', String(child.pid)]);
  } else {
    child.kill('SIGKILL');
  }
  await until(async () => (child.exitCode !== null || child.signalCode !== null), { tries: 20, gapMs: 250, label: 'the service to stop after a forced kill' });
}

/** The shapes, pinned: the view's three levels and the five records it nests. */
const VIEW_FIELDS = ['incident', 'patchTotal', 'patches'].sort();
const PATCH_LEVEL_FIELDS = ['patch', 'pullRequests', 'requestTotal'].sort();
const REQUEST_LEVEL_FIELDS = ['decisionTotal', 'decisions', 'deploymentTotal', 'deployments', 'request'].sort();
const RECORD_SIZES = { incident: 11, patch: 8, request: 7, decision: 6, deployment: 10 };
const DEPLOYED = 'deployed';
const APPROVED = 'approved';
const REJECTED = 'rejected';
const PROPOSED = 'proposed';
const SUCCEEDED = 'succeeded';

let serviceProcess = null;
let dbStarted = false;

try {
  // ── §0 the tools this proof needs, checked BEFORE anything is started ────────────────────────────
  const javaVersion = await run('java', ['-version']);
  assert.equal(javaVersion.code, 0, `java is not runnable: ${javaVersion.stderr}`);
  const javaLine = `${javaVersion.stdout}${javaVersion.stderr}`.split('\n')[0];
  assert.match(javaLine, /version "25/, `ADR 0011 pins Java 25; this host reports: ${javaLine}`);
  const dockerVersion = await run('docker', ['version', '--format', '{{.Server.Version}}']);
  assert.equal(dockerVersion.code, 0, `the docker daemon is not reachable: ${dockerVersion.stderr}`);
  console.log(`[m9] tools: ${javaLine.trim()} · docker server ${dockerVersion.stdout.trim()}`);

  // ── §1 build the jar, start a throwaway database, start the service against it ───────────────────
  const pom = readFileSync(path.join(SERVICE_DIR, 'pom.xml'), 'utf8');
  const projectVersion = pom.match(/<artifactId>nexus-api<\/artifactId>\s*<version>([^<]+)<\/version>/)?.[1];
  assert.ok(projectVersion, 'the POM must name nexus-api and its version');

  rmSync(BUILD_DIR, { recursive: true, force: true });
  mkdirSync(BUILD_DIR, { recursive: true });
  cpSync(path.join(SERVICE_DIR, 'pom.xml'), path.join(BUILD_DIR, 'pom.xml'));
  cpSync(path.join(SERVICE_DIR, 'src'), path.join(BUILD_DIR, 'src'), { recursive: true });
  const build = await runMaven(['-B', '-q', 'package', '-DskipTests'], { cwd: BUILD_DIR, timeoutMs: 600_000 });
  assert.equal(build.code, 0, `mvn package failed:\n${build.stdout}\n${build.stderr}`);
  assert.ok(existsSync(JAR), `the build produced no jar at ${JAR}`);
  console.log(`[m9] built ${path.relative(REPO_ROOT, JAR)} (POM version ${projectVersion})`);

  const dbPort = await freePort();
  const startDb = await run('docker', [
    'run', '-d', '--name', DB_CONTAINER,
    '-e', `POSTGRES_USER=${DB_USER}`, '-e', `POSTGRES_PASSWORD=${DB_PASSWORD}`, '-e', `POSTGRES_DB=${DB_NAME}`,
    '-p', `127.0.0.1:${dbPort}:5432`,
    DB_IMAGE,
  ]);
  assert.equal(startDb.code, 0, `could not start the throwaway database: ${startDb.stderr}`);
  dbStarted = true;

  const inside = await until(async () => {
    const r = await run('docker', ['exec', DB_CONTAINER, 'pg_isready', '-U', DB_USER, '-d', DB_NAME]);
    return r.code === 0;
  }, { tries: 60, gapMs: 1000, label: 'postgres to accept connections inside its container' });
  assert.ok(inside, 'the throwaway database never became ready');
  const reachableFromHost = await until(() => canConnect(dbPort), { tries: 30, gapMs: 500, label: `the database to be reachable on 127.0.0.1:${dbPort}` });
  assert.ok(reachableFromHost, `the database answers inside its container but 127.0.0.1:${dbPort} does not accept a connection`);
  console.log(`[m9] throwaway ${DB_IMAGE} up and reachable on 127.0.0.1:${dbPort} (container ${DB_CONTAINER})`);

  /** Start the service on a free port and wait for the port file and `/health/live`. */
  async function startService(portFile) {
    rmSync(portFile, { force: true });
    const child = spawn('java', [
      '-jar', JAR,
      '--server.port=0',
      `--spring.datasource.url=jdbc:postgresql://127.0.0.1:${dbPort}/${DB_NAME}`,
      `--spring.datasource.username=${DB_USER}`,
      `--spring.datasource.password=${DB_PASSWORD}`,
      `--nexus.port-file=${portFile}`,
    ], { cwd: BUILD_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
    serviceProcess = child;
    let log = '';
    child.stdout.on('data', (d) => { log += String(d); });
    child.stderr.on('data', (d) => { log += String(d); });

    let apiPort = null;
    const up = await until(async () => {
      if (child.exitCode !== null || child.signalCode !== null) return false;
      if (apiPort === null) {
        if (!existsSync(portFile)) return false;
        const reported = Number(readFileSync(portFile, 'utf8').trim());
        if (!Number.isInteger(reported) || reported <= 0) return false;
        apiPort = reported;
      }
      try {
        const r = await fetch(`http://127.0.0.1:${apiPort}/health/live`);
        return r.status === 200;
      } catch {
        return false;
      }
    }, { tries: SERVICE_START_TRIES, gapMs: 1000, label: 'the service to answer /health/live' });
    if (!up) {
      throw new Error(`the service never answered /health/live. Its output was:\n${log.slice(-4000)}`);
    }
    return { child, base: `http://127.0.0.1:${apiPort}`, log: () => log };
  }

  const first = await startService(PORT_FILE);
  let base = first.base;
  console.log(`[m9] nexus-api answering on ${base}`);

  /** One HTTP call, parsed, with the status a rule is read from. */
  async function call(pathname, init = {}) {
    const response = await fetch(`${base}${pathname}`, { ...init, signal: AbortSignal.timeout(120_000) });
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: response.status, body, text, headers: response.headers };
  }

  function post(pathname, body) {
    return call(pathname, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function sql(query) {
    const r = await run('docker', ['exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-tAc', query]);
    assert.equal(r.code, 0, `psql failed: ${r.stderr}`);
    return r.stdout.trim();
  }

  // ── §1 the chain runs twice: one approved then deployed, one rejected ────────────────────────────
  const incidentAnswer = await post('/incidents', { title: 'the credits ledger drifted', severity: 'high', openedBy: 'acct-ada' });
  assert.equal(incidentAnswer.status, 201, `the incident must open: ${incidentAnswer.text}`);
  const incidentId = incidentAnswer.body.id;

  async function propose(title, diff) {
    const answer = await post(`/incidents/${incidentId}/patches`, { title, diff, author: 'acct-ada' });
    assert.equal(answer.status, 201, `the patch must be proposed: ${answer.text}`);
    return answer.body;
  }

  const patchA = await propose('clamp the drift at read time', '  context\n\tdetail\n');
  const requestA = await post(`/patches/${patchA.id}/pull-requests`, { title: 'review the clamp', openedBy: 'acct-grace' });
  assert.equal(requestA.status, 201);
  const decisionA = await post(`/pull-requests/${requestA.body.id}/decisions`, { verdict: 'approved', reason: 'smallest fix' });
  assert.equal(decisionA.status, 201);
  const deploymentA = await post(`/pull-requests/${requestA.body.id}/deployments`, { environment: 'staging', requestedBy: 'acct-ada' });
  assert.equal(deploymentA.status, 201);
  const completeA = await post(`/deployments/${deploymentA.body.id}/complete`, { status: 'succeeded', outcome: 'the probe is green', reportedBy: 'acct-grace' });
  assert.equal(completeA.status, 200);

  const patchB = await propose('backfill the ledger', '+backfill\n');
  const requestB = await post(`/patches/${patchB.id}/pull-requests`, { title: 'review the backfill' });
  assert.equal(requestB.status, 201);
  const decisionB = await post(`/pull-requests/${requestB.body.id}/decisions`, { verdict: 'rejected', reason: 'the drift is upstream' });
  assert.equal(decisionB.status, 201);

  const tree = await call(`/incidents/${incidentId}/chain`);
  assert.equal(tree.status, 200, `the chain must answer 200, got ${tree.status}: ${tree.text}`);
  assert.deepEqual(Object.keys(tree.body).sort(), VIEW_FIELDS,
      `the chain carries exactly ${VIEW_FIELDS.join('/')}, got ${JSON.stringify(Object.keys(tree.body))}`);
  assert.ok(Array.isArray(tree.body.patches), 'patches must be an array');
  assert.equal(tree.body.patches.length, 2, 'both patches must be in the tree');
  assert.equal(tree.body.patchTotal, 2, 'the total must match the whole set');
  for (const level of tree.body.patches) {
    assert.deepEqual(Object.keys(level).sort(), PATCH_LEVEL_FIELDS,
        `a chain patch carries exactly ${PATCH_LEVEL_FIELDS.join('/')}`);
    assert.ok(Array.isArray(level.pullRequests), 'pullRequests must be an array');
    assert.equal(level.requestTotal, 1, 'each patch holds one request');
  }
  console.log(`[§1] the chain ran twice (approved→deployed, rejected) and GET /incidents/${incidentId.slice(0, 8)}…/chain answered 200 with 2 patches, each carrying 1 request`);

  // ── §2 every level is the writing doors' own shape ──────────────────────────────────────────────
  assert.equal(tree.body.incident.id, incidentId, 'the head of the tree is the incident asked for');
  const byPatch = new Map(tree.body.patches.map((level) => [level.patch.id, level]));
  const levelA = byPatch.get(patchA.id);
  const levelB = byPatch.get(patchB.id);
  assert.ok(levelA && levelB, 'both patch ids must appear in the tree');
  const shapes = [
    ['incident', tree.body.incident],
    ['patch', levelA.patch],
    ['request', levelA.pullRequests[0].request],
    ['decision', levelA.pullRequests[0].decisions[0]],
    ['deployment', levelA.pullRequests[0].deployments[0]],
  ];
  for (const [name, record] of shapes) {
    assert.equal(Object.keys(record).length, RECORD_SIZES[name],
        `the nested ${name} must be the door's own ${RECORD_SIZES[name]}-field record, got ${JSON.stringify(Object.keys(record))}`);
  }
  for (const level of tree.body.patches) {
    assert.equal(Object.keys(level.pullRequests[0]).sort().join('/'), REQUEST_LEVEL_FIELDS.join('/'),
        'a chain request carries exactly its five fields');
  }
  console.log(`[§2] the four nested records kept the writing doors' sizes — incident ${RECORD_SIZES.incident}, patch ${RECORD_SIZES.patch}, request ${RECORD_SIZES.request}, decision ${RECORD_SIZES.decision}, deployment ${RECORD_SIZES.deployment} — and the view's three levels carried exactly their documented fields`);

  // ── §3 every status is visible in one read ──────────────────────────────────────────────────────
  assert.equal(levelA.patch.status, DEPLOYED, 'patch A must read deployed');
  assert.equal(levelA.pullRequests[0].request.status, APPROVED, 'request A must read approved');
  assert.equal(levelA.pullRequests[0].decisions[0].verdict, APPROVED, 'the decision must read approved');
  assert.equal(levelA.pullRequests[0].deployments[0].status, SUCCEEDED, 'the deployment must read succeeded');
  assert.equal(levelB.patch.status, PROPOSED, 'patch B must read proposed after the rejection');
  assert.equal(levelB.pullRequests[0].request.status, REJECTED, 'request B must read rejected');
  assert.equal(levelB.pullRequests[0].decisions[0].verdict, REJECTED, 'the decision must read rejected');
  assert.equal(levelB.pullRequests[0].deployments.length, 0, 'a rejected request has no deployment');
  console.log(`[§3] one read showed the whole story: patch A ${DEPLOYED} / request A ${APPROVED} / decision ${APPROVED} / deployment ${SUCCEEDED}; patch B ${PROPOSED} / request B ${REJECTED} / decision ${REJECTED} / no deployment`);

  // ── §4 an unknown incident is the incident door's own 404 ───────────────────────────────────────
  const missing = await call('/incidents/not-a-real-id/chain');
  assert.equal(missing.status, 404, `an unknown incident must answer 404, got ${missing.status}`);
  assert.equal(missing.body.error, 'unknown-incident');
  console.log(`[§4] GET /incidents/not-a-real-id/chain answered 404 ${missing.body.error}`);

  // ── §5 the read is read-only: the five tables' counts do not move ───────────────────────────────
  const tables = ['incident', 'incident_patch', 'patch_pull_request', 'pull_request_decision', 'deployment'];
  const before = [];
  for (const table of tables) before.push(await sql(`select count(*) from ${table}`));
  await call(`/incidents/${incidentId}/chain`);
  await call(`/incidents/${incidentId}/chain`);
  const after = [];
  for (const table of tables) after.push(await sql(`select count(*) from ${table}`));
  assert.deepEqual(after, before, `a read must write nothing; before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
  assert.equal(await sql('select count(*) from audit_entry'), '0', 'a read writes no trail fact');
  assert.equal(await sql('select count(*) from webhook_delivery'), '0', 'a read knocks on nothing');
  console.log(`[§5] two more chain reads left every table's count identical (${before.join('/')}) and wrote nothing anywhere`);

  // ── §6 restart: the tree is rows, not a cache ───────────────────────────────────────────────────
  await stopService(serviceProcess);
  serviceProcess = null;
  const second = await startService(PORT_FILE_SECOND);
  base = second.base;
  console.log(`[m9] restarted nexus-api on ${base}`);

  const treeAfterRestart = await call(`/incidents/${incidentId}/chain`);
  assert.equal(treeAfterRestart.status, 200);
  assert.deepEqual(treeAfterRestart.body, tree.body, 'the same tree must read back after a restart');
  console.log(`[§6] stopped and started the service: the same tree read back byte-identical — the view is a lens over rows, not a cache`);

  // ── §7 psql: the five tables and nothing written elsewhere ─────────────────────────────────────
  assert.equal(await sql('select count(*) from incident'), '1');
  assert.equal(await sql('select count(*) from incident_patch'), '2');
  assert.equal(await sql('select count(*) from patch_pull_request'), '2');
  assert.equal(await sql('select count(*) from pull_request_decision'), '2');
  assert.equal(await sql('select count(*) from deployment'), '1');
  assert.equal(await sql('select count(*) from audit_entry'), '0');
  assert.equal(await sql('select count(*) from webhook_delivery'), '0');
  console.log('[§7] psql read 1 incident, 2 patches, 2 requests, 2 decisions, 1 deployment, ZERO audit entries and ZERO deliveries — the view added no sixth table and no summary row');

  // ── §8 teardown ─────────────────────────────────────────────────────────────────────────────────
  await stopService(serviceProcess);
  serviceProcess = null;
  const rm = await run('docker', ['rm', '-f', DB_CONTAINER]);
  assert.equal(rm.code, 0, `could not remove the throwaway database: ${rm.stderr}`);
  dbStarted = false;
  const goneContainer = await run('docker', ['ps', '-a', '--filter', `name=^/${DB_CONTAINER}$`, '--format', '{{.Names}}']);
  assert.equal(goneContainer.stdout.trim(), '', `the throwaway container is still listed: ${goneContainer.stdout.trim()}`);
  console.log(`[§8] teardown: the service process is gone and the throwaway container ${DB_CONTAINER} is removed`);

  console.log('\n[summary] M9: services/nexus-api BUILT and RAN against a real PostgreSQL · the chain ran twice (approved→deployed, rejected) · GET /incidents/{id}/chain answered 200 with 2 patches, 2 requests, 2 decisions, 1 deployment, nested in the writing doors\' own record shapes and carrying every total · patch A read deployed/approved/succeeded, patch B proposed/rejected/no-deployment in ONE read · an unknown incident 404 unknown-incident · two extra reads moved no row count and wrote no audit or delivery · a STOP/START read back the same tree byte-identical · psql read the five tables and ZERO audit / ZERO deliveries');
  rmSync(BUILD_DIR, { recursive: true, force: true });
  console.log('[m9-chain-proof] ALL ASSERTIONS PASSED (the five-word chain reads back as one tree: every nested value is the door\'s own record, every level carries its total, and the read writes nothing)');
} finally {
  if (serviceProcess && serviceProcess.exitCode === null) {
    await stopService(serviceProcess);
  }
  if (dbStarted) await run('docker', ['rm', '-f', DB_CONTAINER]);
}
