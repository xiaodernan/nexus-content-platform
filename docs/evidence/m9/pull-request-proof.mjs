// NEXUS v868 (ADR 0016 amendment 577) — M9: this module is the evidence that record points at; the claim is:
// NEXUS M9 — A PULL REQUEST IS A REQUEST FOR REVIEW, NOT A MERGE: `POST /patches/{id}/pull-requests` records
// one open request against one patch and moves that patch `proposed → submitted` in the SAME transaction;
// `GET /patches/{id}/pull-requests` reads the patch's newest window with both counts; `GET
// /pull-requests/{id}` reads one request. This proof builds the service, starts it against a throwaway
// PostgreSQL, opens an incident and two patches, submits ONE request, asserts the exact seven-field shape,
// proves the patch's own status moved, refuses a second request with 409 already-open, proves the refusal
// stored nothing and moved nothing, reads the window and one request back, refuses an unknown patch and two
// malformed requests, STOPS and STARTS the service against the same database, and asks psql what the doors
// wrote.
//
// Why the diff is NOT in this record:
//   The patch row is the bytes' only home. A copy here would be two answers to one question — the first
//   read right, the second drifting. The request names `patchId`; a reader follows it one hop.
//
// Why one OPEN request per patch:
//   Two open requests would make "which one is being reviewed" a question with no answer. The gate reads the
//   request table's own count, not the patch's status word, so the invariant is local to its owner. The
//   refusal is 409, not 400: the request may be perfectly well formed; the STATE is what conflicts.
//
// Why the patch's status moves in the same transaction:
//   A request that exists against a patch still marked `proposed` would be two records disagreeing about
//   whether review started. One transaction writes both, so the disagreement cannot be observed.
//
// What it proves, clause by clause:
//   §0 the tools this proof needs (Java 25, Docker) are present BEFORE anything is started;
//   §1 the service BUILDS and STARTS; one incident and two patches are opened; ONE review request answers
//      201 with exactly seven fields, status=open, and no diff; the patch's own status is now submitted;
//   §2 a second request for the same patch answers 409 already-open, and both the request count and the
//      patch's status are untouched; the listing answers 1 of 1, and limit=1000&offset=150 reports the cap
//      and the floored skip it applied; a patch with no request answers 0 of 0 and stays proposed;
//   §3 one request reads back with the same seven values, and an id that names nothing is 404
//      unknown-pull-request;
//   §4 an unknown patch is 404 unknown-patch; a blank title and a summary over the column are 400
//      invalid-pull-request with the rule named; refusals wrote nothing and moved nothing;
//   §5 the service is STOPPED and STARTED against the same database: the request and the patch's submitted
//      status are still there — the request is a row, not a buffer;
//   §6 psql reads ONE row in `patch_pull_request` (open), the patch's status `submitted`, ZERO audit entries
//      and ZERO deliveries;
//   §7 teardown.
//
// The honest bounds, stated rather than hidden: no request is approved, rejected, merged or deployed, and a
// request may never be closed in this build — the chain's fourth and fifth words are absent on purpose; the
// bytes are never copied here and never applied; no authentication (ADR 0018), so anyone who can reach the
// door may ask for a review. Two concurrent submissions racing the count could both pass it; this slice
// documents that gap rather than claiming a database constraint it does not have (ADR 0067).
//
// Requires: Java 25, Maven, and a running Docker daemon. Run:  node docs/evidence/m9/pull-request-proof.mjs
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
// THREE levels up: docs/evidence/m9/pull-request-proof.mjs -> the repository root.
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SERVICE_DIR = process.env.NEXUS_SERVICE_DIR
  ? path.resolve(process.env.NEXUS_SERVICE_DIR)
  : path.join(REPO_ROOT, 'services/nexus-api');
const DB_IMAGE = 'pgvector/pgvector:pg16';
const STAMP = `${Date.now()}-${process.pid}`;
const BUILD_DIR = path.join(tmpdir(), `nexus-pr-proof-build-${STAMP}`);
const JAR = path.join(BUILD_DIR, 'target/nexus-api-0.1.0-SNAPSHOT.jar');

const DB_CONTAINER = `nexus-pr-db-${STAMP}`;
const DB_NAME = 'nexus';
const DB_USER = 'nexus';
const DB_PASSWORD = 'nexus';
const PORT_FILE = path.join(tmpdir(), `nexus-pr-port-${STAMP}.txt`);
const PORT_FILE_SECOND = path.join(tmpdir(), `nexus-pr-port2-${STAMP}.txt`);

const SERVICE_START_TRIES = 180;

const DIFF_ONE = '  context line\n\tdetail line\n\n';

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

/** The shape, pinned: a field added here is a fact this door would start claiming. */
const RECORD_FIELDS = [
  'id', 'openedAt', 'openedBy', 'patchId', 'status', 'summary', 'title'
].sort();
const LIST_FIELDS = ['count', 'limit', 'offset', 'pullRequests', 'total'].sort();
const OPEN = 'open';
const SUBMITTED = 'submitted';
const PROPOSED = 'proposed';

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

  /**
   * The request's shape, pinned on every answer: seven fields, no diff, the status this slice writes, and
   * the patch it names.
   */
  function assertRecordShape(record, clue, expectedPatchId) {
    assert.ok(record && typeof record === 'object', `${clue}: a review request must be a JSON object, got ${JSON.stringify(record)}`);
    assert.deepEqual(Object.keys(record).sort(), RECORD_FIELDS,
        `${clue}: a review request carries exactly ${RECORD_FIELDS.join('/')}, got ${JSON.stringify(Object.keys(record))}`);
    assert.ok(typeof record.id === 'string' && record.id.length > 0, `${clue}: id must be a non-empty string`);
    assert.ok(typeof record.patchId === 'string' && record.patchId.length > 0,
        `${clue}: patchId must be a non-empty string`);
    if (expectedPatchId !== undefined) {
      assert.equal(record.patchId, expectedPatchId, `${clue}: the request must name the patch it reviews`);
    }
    assert.ok(typeof record.title === 'string' && record.title.length > 0, `${clue}: title must be a non-empty string`);
    for (const field of ['summary', 'openedBy']) {
      assert.ok(record[field] === null || typeof record[field] === 'string',
          `${clue}: ${field} must be null or a string, got ${JSON.stringify(record[field])}`);
    }
    assert.equal(record.status, OPEN, `${clue}: this slice writes only ${OPEN}`);
    assert.ok(Number.isInteger(record.openedAt) && record.openedAt >= 0,
        `${clue}: openedAt must be an epoch-millisecond integer, got ${JSON.stringify(record.openedAt)}`);
    assert.equal(Object.hasOwn(record, 'diff'), false,
        `${clue}: the bytes live in the patch row; a copy here would be a second answer`);
  }

  function assertListShape(list, clue) {
    assert.ok(list && typeof list === 'object', `${clue}: a listing must be a JSON object`);
    assert.deepEqual(Object.keys(list).sort(), LIST_FIELDS,
        `${clue}: a listing carries exactly ${LIST_FIELDS.join('/')}, got ${JSON.stringify(Object.keys(list))}`);
    assert.ok(Array.isArray(list.pullRequests), `${clue}: pullRequests must be an array`);
    assert.equal(list.count, list.pullRequests.length, `${clue}: count must be what this answer carried`);
    assert.ok(Number.isInteger(list.total) && list.total >= 0, `${clue}: total must be a non-negative integer`);
    assert.ok(Number.isInteger(list.limit) && list.limit >= 1 && list.limit <= 100,
        `${clue}: limit must be the applied cap in 1..100, got ${JSON.stringify(list.limit)}`);
    assert.ok(Number.isInteger(list.offset) && list.offset >= 0,
        `${clue}: offset must be the applied skip, got ${JSON.stringify(list.offset)}`);
    for (const record of list.pullRequests) assertRecordShape(record, clue);
  }

  // ── §1 one incident, two patches, one review request, and the patch's own status moves ──────────
  const incidentAnswer = await post('/incidents', {
    title: 'the credits ledger drifted',
    severity: 'high',
    openedBy: 'acct-ada',
  });
  assert.equal(incidentAnswer.status, 201, `the parent incident must be opened, got ${incidentAnswer.status}: ${incidentAnswer.text}`);
  const incidentId = incidentAnswer.body.id;

  const firstPatchAnswer = await post(`/incidents/${incidentId}/patches`, {
    title: 'clamp the drift at read time',
    summary: 'the ledger is corrected when it is read',
    diff: DIFF_ONE,
    author: 'acct-ada',
  });
  assert.equal(firstPatchAnswer.status, 201, `the patch must be proposed, got ${firstPatchAnswer.status}: ${firstPatchAnswer.text}`);
  const patchId = firstPatchAnswer.body.id;
  assert.equal(firstPatchAnswer.body.status, PROPOSED, 'a fresh patch starts proposed');

  const secondPatchAnswer = await post(`/incidents/${incidentId}/patches`, {
    title: 'backfill the ledger',
    diff: '+backfill\n',
    author: 'acct-grace',
  });
  assert.equal(secondPatchAnswer.status, 201);
  const unrequestedPatchId = secondPatchAnswer.body.id;

  const requestAnswer = await post(`/patches/${patchId}/pull-requests`, {
    title: '  review the read-time clamp  ',
    summary: '  it is the smallest change that stops the drift  ',
    openedBy: '  acct-grace  ',
  });
  assert.equal(requestAnswer.status, 201, `a review request must answer 201, got ${requestAnswer.status}: ${requestAnswer.text}`);
  assertRecordShape(requestAnswer.body, '§1', patchId);
  assert.equal(requestAnswer.body.title, 'review the read-time clamp', 'the title is trimmed');
  assert.equal(requestAnswer.body.summary, 'it is the smallest change that stops the drift', 'the summary is trimmed');
  assert.equal(requestAnswer.body.openedBy, 'acct-grace', 'the opener is trimmed');
  const request = requestAnswer.body;

  const patchAfterSubmit = await call(`/patches/${patchId}`);
  assert.equal(patchAfterSubmit.status, 200);
  assert.equal(patchAfterSubmit.body.status, SUBMITTED,
      'the patch\'s own status must move proposed → submitted in the same transaction that wrote the request');
  assert.equal(patchAfterSubmit.body.diff, DIFF_ONE, 'the bytes did not move: they still live in the patch row');
  console.log(`[§1] incident ${incidentId.slice(0, 8)} opened; two patches proposed; ONE review request on patch ${patchId.slice(0, 8)} answered 201 with exactly seven fields and no diff · the patch's own status read back ${SUBMITTED}, set beside the request`);

  // ── §2 one open request per patch, the window, and the cap/floor it applied ─────────────────────
  const secondAttempt = await post(`/patches/${patchId}/pull-requests`, {
    title: 'review it again',
  });
  assert.equal(secondAttempt.status, 409, `a second open request must answer 409, got ${secondAttempt.status}: ${secondAttempt.text}`);
  assert.equal(secondAttempt.body.error, 'already-open');
  assert.ok(secondAttempt.body.message.includes('already has an open review request'),
      `the refusal must name the conflict: ${secondAttempt.body.message}`);

  const listing = await call(`/patches/${patchId}/pull-requests`);
  assert.equal(listing.status, 200, `the listing must answer 200, got ${listing.status}: ${listing.text}`);
  assertListShape(listing.body, '§2');
  assert.equal(listing.body.count, 1, 'the refused second request stored nothing');
  assert.equal(listing.body.total, 1, 'exactly one request is open for this patch');
  assert.equal(listing.body.limit, 20, 'the default window is twenty');
  assert.equal(listing.body.offset, 0);

  const skipped = await call(`/patches/${patchId}/pull-requests?limit=1000&offset=150`);
  assert.equal(skipped.status, 200);
  assertListShape(skipped.body, '§2 cap and floor');
  assert.equal(skipped.body.count, 0, 'a skip past the only row carries nothing');
  assert.equal(skipped.body.total, 1, 'the skip still knows the patch holds one');
  assert.equal(skipped.body.limit, 100, 'the asked 1000 is capped to 100');
  assert.equal(skipped.body.offset, 100, 'the asked 150 is floored to the page boundary 100');

  const unrequested = await call(`/patches/${unrequestedPatchId}/pull-requests`);
  assert.equal(unrequested.status, 200, 'a patch that was never reviewed is still a patch');
  assertListShape(unrequested.body, '§2 unrequested');
  assert.equal(unrequested.body.count, 0);
  assert.equal(unrequested.body.total, 0);
  const unrequestedPatch = await call(`/patches/${unrequestedPatchId}`);
  assert.equal(unrequestedPatch.body.status, PROPOSED, 'a patch with no request stays proposed');
  console.log(`[§2] a second request for the same patch answered 409 ${secondAttempt.body.error} and stored nothing · the listing answered 1 of 1 · limit=1000&offset=150 answered 0 rows, total 1, and reported the applied cap 100 / skip 100 · the unreviewed patch answered 0 of 0 and stayed ${PROPOSED}`);

  // ── §3 one request reads back with the same seven values; an unknown id is 404 ───────────────────
  const readBack = await call(`/pull-requests/${request.id}`);
  assert.equal(readBack.status, 200, `reading a request must answer 200, got ${readBack.status}: ${readBack.text}`);
  assertRecordShape(readBack.body, '§3', patchId);
  assert.deepEqual(readBack.body, request, 'a request must read back exactly as it was written');

  const missing = await call('/pull-requests/not-a-real-id');
  assert.equal(missing.status, 404, `an unknown request must answer 404, got ${missing.status}: ${missing.text}`);
  assert.equal(missing.body.error, 'unknown-pull-request');
  console.log(`[§3] GET /pull-requests/${request.id.slice(0, 8)}… answered 200 and the seven values read back unchanged · GET /pull-requests/not-a-real-id answered 404 ${missing.body.error}`);

  // ── §4 refusals: an unknown patch, a blank title, a summary over the column ─────────────────────
  const orphan = await post('/patches/not-a-real-id/pull-requests', { title: 'review this' });
  assert.equal(orphan.status, 404, `a request for an unknown patch must be 404, got ${orphan.status}: ${orphan.text}`);
  assert.equal(orphan.body.error, 'unknown-patch');

  const refusals = [
    { patch: unrequestedPatchId, body: { title: '   ' }, clue: 'a blank title', needle: 'needs a title' },
    { patch: unrequestedPatchId, body: { title: 'review', summary: 's'.repeat(2001) }, clue: 'a summary over the column', needle: '2000' },
  ];
  for (const refusal of refusals) {
    const answer = await post(`/patches/${refusal.patch}/pull-requests`, refusal.body);
    assert.equal(answer.status, 400, `${refusal.clue} must answer 400, got ${answer.status}: ${answer.text}`);
    assert.equal(answer.body.error, 'invalid-pull-request', `${refusal.clue} must name the token`);
    assert.ok(answer.body.message.includes(refusal.needle),
        `${refusal.clue} must name the rule (expected "${refusal.needle}"): ${answer.body.message}`);
  }
  const afterRefusals = await call(`/patches/${unrequestedPatchId}/pull-requests`);
  assert.equal(afterRefusals.body.total, 0, 'refused requests must not be stored');
  const unrequestedAfterRefusals = await call(`/patches/${unrequestedPatchId}`);
  assert.equal(unrequestedAfterRefusals.body.status, PROPOSED, 'a refused request must not move its patch');
  console.log(`[§4] a request for an unknown patch answered 404 ${orphan.body.error} · a blank title and a 2001-character summary answered 400 invalid-pull-request with the rule named · the patch still holds 0 requests and is still ${PROPOSED} — refusals wrote nothing and moved nothing`);

  // ── §5 restart: the request and the patch's status are rows, not buffers ────────────────────────
  await stopService(serviceProcess);
  serviceProcess = null;
  const second = await startService(PORT_FILE_SECOND);
  base = second.base;
  console.log(`[m9] restarted nexus-api on ${base}`);

  const afterRestart = await call(`/patches/${patchId}/pull-requests`);
  assert.equal(afterRestart.status, 200, `a restarted service must answer the listing, got ${afterRestart.status}: ${afterRestart.text}`);
  assertListShape(afterRestart.body, '§5');
  assert.equal(afterRestart.body.total, 1, 'the request survives the restart');
  assert.equal(afterRestart.body.pullRequests[0].id, request.id, 'the same request id, after the restart');
  const patchAfterRestart = await call(`/patches/${patchId}`);
  assert.equal(patchAfterRestart.status, 200);
  assert.equal(patchAfterRestart.body.status, SUBMITTED, 'the patch is still submitted after the restart');
  assert.equal(patchAfterRestart.body.diff, DIFF_ONE, 'the bytes survive the restart in their only home');
  console.log(`[§5] stopped and started the service against the same database: the listing still answered 1 of 1 with request ${request.id.slice(0, 8)}…, the patch still ${SUBMITTED}, and its ${DIFF_ONE.length} characters were still in the patch row`);

  // ── §6 psql: one open request, the submitted patch, and nothing written elsewhere ───────────────
  assert.equal(await sql('select count(*) from patch_pull_request'), '1', 'one request must be in the table');
  assert.equal(await sql("select count(*) from patch_pull_request where status = 'open'"), '1',
      'this slice writes only open');
  assert.equal(await sql(`select count(*) from patch_pull_request where patch_id = '${patchId}'`), '1',
      'the request names the patch it reviews');
  assert.equal(await sql(`select status from incident_patch where patch_id = '${patchId}'`), SUBMITTED,
      'the patch row carries the chain cursor the request moved');
  assert.equal(await sql('select count(*) from audit_entry'), '0', 'a review request writes no trail fact');
  assert.equal(await sql('select count(*) from webhook_delivery'), '0', 'a review request knocks on nothing');
  console.log(`[§6] psql read 1 row in \`patch_pull_request\` (open, naming patch ${patchId.slice(0, 8)}…), the patch's status \`${SUBMITTED}\`, ZERO audit entries and ZERO webhook deliveries — these doors write their own two tables and nothing else`);

  // ── §7 teardown ─────────────────────────────────────────────────────────────────────────────────
  await stopService(serviceProcess);
  serviceProcess = null;
  const rm = await run('docker', ['rm', '-f', DB_CONTAINER]);
  assert.equal(rm.code, 0, `could not remove the throwaway database: ${rm.stderr}`);
  dbStarted = false;
  const goneContainer = await run('docker', ['ps', '-a', '--filter', `name=^/${DB_CONTAINER}$`, '--format', '{{.Names}}']);
  assert.equal(goneContainer.stdout.trim(), '', `the throwaway container is still listed: ${goneContainer.stdout.trim()}`);
  console.log(`[§7] teardown: the service process is gone and the throwaway container ${DB_CONTAINER} is removed`);

  console.log('\n[summary] M9: services/nexus-api BUILT and RAN against a real PostgreSQL · one incident with two patches, ONE review request with 201 and exactly seven fields and no diff, and the patch\'s own status moved proposed → submitted in the same transaction · a second request refused 409 already-open, storing nothing and moving nothing · the listing answered 1 of 1 and reported the cap 100 / skip 100 it applied to a 150 skip · one request read back unchanged; an unknown patch 404 unknown-patch, a blank title and a 2001-character summary 400 invalid-pull-request, an unknown request 404 unknown-pull-request · a STOP/START left the request and the submitted status in place · psql read 1 open request, the submitted patch row, 0 audit entries and 0 deliveries');
  rmSync(BUILD_DIR, { recursive: true, force: true });
  console.log('[m9-pr-proof] ALL ASSERTIONS PASSED (a pull request is a request for REVIEW, not a merge: one open per patch, the patch moves proposed→submitted in the same transaction, the bytes stay in the patch row — and nothing is approved, merged or deployed)');
} finally {
  if (serviceProcess && serviceProcess.exitCode === null) {
    await stopService(serviceProcess);
  }
  if (dbStarted) await run('docker', ['rm', '-f', DB_CONTAINER]);
}
