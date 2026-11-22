// NEXUS v870 (ADR 0016 amendment 579) — M9: this module is the evidence that record points at; the claim is:
// NEXUS M9 — A DEPLOYMENT IS A RECORD, NOT AN ACTION: `POST /pull-requests/{id}/deployments` records a
// deployment REQUEST against an APPROVED review request (anything else is 409 not-approved), and
// `POST /deployments/{id}/complete` records what a deployer REPORTS (succeeded / failed) with their own name.
// This service owns no cluster and deploys nothing; the report is a claim and `reportedBy` says whose. This
// proof builds the service, starts it against a throwaway PostgreSQL, runs the whole chain five words deep
// twice — once to a reported success, once to a reported failure — asserts the ten-field shape, refuses a
// deployment of an open and of a rejected request, asserts the patch's cursor moves only on success, refuses
// a second completion, STOPS and STARTS the service against the same database, and asks psql what the doors
// wrote.
//
// Why the approval gate exists:
//   A deployment of a request with no yes would skip the fourth word. An open request has no verdict yet; a
//   rejected one has a verdict that says no. The gate reads the request's status and answers 409, not 400:
//   the body may be perfectly well formed.
//
// Why a failed report leaves the patch approved:
//   The approval is still true. A failed deployment is a fact about an attempt, not about the patch; the
//   retry is a NEW deployment record, so the history of attempts is not overwritten.
//
// Why completion is one conditional UPDATE:
//   Two deployers reporting on the same record would be two claims with no rule to pick one. The predicate
//   `status = 'requested'` lives inside the UPDATE, and 0 moved rows is 409 already-completed.
//
// What it proves, clause by clause:
//   §0 the tools this proof needs (Java 25, Docker) are present BEFORE anything is started;
//   §1 the service BUILDS and STARTS; the chain runs to an APPROVED request (incident → patch → request →
//      decision), and two more requests are prepared: one open, one rejected;
//   §2 a deployment of the approved request answers 201 with exactly ten fields, status=requested, and
//      finishedAt/reportedBy/outcome all null — nothing that has not happened is invented;
//   §3 deploying the OPEN request and the REJECTED request both answer 409 not-approved, and nothing is
//      stored;
//   §4 a reported success answers 200 with status=succeeded, a real finishedAt, the reporter and the
//      outcome, and moves the patch to deployed; a second report answers 409 already-completed; the listing
//      answers 1 of 1 and reports the cap/floor it applied;
//   §5 a second chain is approved, deployed to production and reported FAILED: the record reads failed and
//      the patch stays approved — the retry is a new record;
//   §6 an unknown request is 404 unknown-pull-request, an unknown deployment 404 unknown-deployment, a blank
//      and an off-vocabulary environment 400 invalid-deployment, a blank completion status 400; refusals
//      wrote nothing;
//   §7 the service is STOPPED and STARTED: both records and every status are still there;
//   §8 psql reads TWO deployment rows (succeeded / failed), the patch statuses deployed / approved, ZERO
//      audit entries and ZERO webhook deliveries;
//   §9 teardown.
//
// The honest bounds, stated rather than hidden: nothing is deployed — the outcome is the reporter's claim;
// no artifact, image, digest or host is recorded or checked; the environment vocabulary is closed
// (staging / production) and this service does not contact either; no authentication (ADR 0018), so anyone
// who can reach the door may request or report. The chain ends here, and this is what its last word can
// honestly be.
//
// Requires: Java 25, Maven, and a running Docker daemon. Run:  node docs/evidence/m9/deployment-proof.mjs
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
// THREE levels up: docs/evidence/m9/deployment-proof.mjs -> the repository root.
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SERVICE_DIR = process.env.NEXUS_SERVICE_DIR
  ? path.resolve(process.env.NEXUS_SERVICE_DIR)
  : path.join(REPO_ROOT, 'services/nexus-api');
const DB_IMAGE = 'pgvector/pgvector:pg16';
const STAMP = `${Date.now()}-${process.pid}`;
const BUILD_DIR = path.join(tmpdir(), `nexus-deployment-proof-build-${STAMP}`);
const JAR = path.join(BUILD_DIR, 'target/nexus-api-0.1.0-SNAPSHOT.jar');

const DB_CONTAINER = `nexus-deployment-db-${STAMP}`;
const DB_NAME = 'nexus';
const DB_USER = 'nexus';
const DB_PASSWORD = 'nexus';
const PORT_FILE = path.join(tmpdir(), `nexus-deployment-port-${STAMP}.txt`);
const PORT_FILE_SECOND = path.join(tmpdir(), `nexus-deployment-port2-${STAMP}.txt`);

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
  'environment', 'finishedAt', 'id', 'outcome', 'patchId', 'pullRequestId',
  'reportedBy', 'requestedAt', 'requestedBy', 'status'
].sort();
const LIST_FIELDS = ['count', 'deployments', 'limit', 'offset', 'total'].sort();
const REQUESTED = 'requested';
const SUCCEEDED = 'succeeded';
const FAILED = 'failed';
const DEPLOYED = 'deployed';
const APPROVED = 'approved';

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

  /** The record's shape, pinned on every answer: ten fields, three nullable, status from two words. */
  function assertRecordShape(record, clue, expectedRequestId) {
    assert.ok(record && typeof record === 'object', `${clue}: a deployment must be a JSON object, got ${JSON.stringify(record)}`);
    assert.deepEqual(Object.keys(record).sort(), RECORD_FIELDS,
        `${clue}: a deployment carries exactly ${RECORD_FIELDS.join('/')}, got ${JSON.stringify(Object.keys(record))}`);
    assert.ok(typeof record.id === 'string' && record.id.length > 0, `${clue}: id must be a non-empty string`);
    assert.ok(typeof record.pullRequestId === 'string' && record.pullRequestId.length > 0,
        `${clue}: pullRequestId must be a non-empty string`);
    if (expectedRequestId !== undefined) {
      assert.equal(record.pullRequestId, expectedRequestId, `${clue}: the record must name the request it was cut from`);
    }
    assert.ok(typeof record.patchId === 'string' && record.patchId.length > 0,
        `${clue}: patchId must be a non-empty string`);
    assert.ok(['staging', 'production'].includes(record.environment),
        `${clue}: environment must be one of the two words, got ${JSON.stringify(record.environment)}`);
    assert.ok([REQUESTED, SUCCEEDED, FAILED].includes(record.status),
        `${clue}: status must be requested/succeeded/failed, got ${JSON.stringify(record.status)}`);
    assert.ok(Number.isInteger(record.requestedAt) && record.requestedAt >= 0,
        `${clue}: requestedAt must be an epoch-millisecond integer`);
    for (const field of ['requestedBy', 'reportedBy', 'outcome']) {
      assert.ok(record[field] === null || typeof record[field] === 'string',
          `${clue}: ${field} must be null or a string`);
    }
    assert.ok(record.finishedAt === null || (Number.isInteger(record.finishedAt) && record.finishedAt >= 0),
        `${clue}: finishedAt must be null or an epoch-millisecond integer`);
    if (record.status === REQUESTED) {
      assert.equal(record.finishedAt, null, `${clue}: a requested record has no finish time`);
      assert.equal(record.reportedBy, null, `${clue}: a requested record has no reporter`);
    } else {
      assert.ok(Number.isInteger(record.finishedAt), `${clue}: a completed record must carry its finish time`);
    }
  }

  function assertListShape(list, clue) {
    assert.ok(list && typeof list === 'object', `${clue}: a listing must be a JSON object`);
    assert.deepEqual(Object.keys(list).sort(), LIST_FIELDS,
        `${clue}: a listing carries exactly ${LIST_FIELDS.join('/')}, got ${JSON.stringify(Object.keys(list))}`);
    assert.ok(Array.isArray(list.deployments), `${clue}: deployments must be an array`);
    assert.equal(list.count, list.deployments.length, `${clue}: count must be what this answer carried`);
    assert.ok(Number.isInteger(list.total) && list.total >= 0, `${clue}: total must be a non-negative integer`);
    assert.ok(Number.isInteger(list.limit) && list.limit >= 1 && list.limit <= 100,
        `${clue}: limit must be the applied cap in 1..100`);
    assert.ok(Number.isInteger(list.offset) && list.offset >= 0, `${clue}: offset must be the applied skip`);
    for (const record of list.deployments) assertRecordShape(record, clue);
  }

  /** Run the chain as far as an APPROVED request, returning the request. */
  async function chainToApprovedRequest(title, diff) {
    const incident = await post('/incidents', { title: `incident for ${title}`, severity: 'medium' });
    assert.equal(incident.status, 201, `the incident must open: ${incident.text}`);
    const patch = await post(`/incidents/${incident.body.id}/patches`, { title, diff });
    assert.equal(patch.status, 201, `the patch must be proposed: ${patch.text}`);
    const request = await post(`/patches/${patch.body.id}/pull-requests`, { title: `review ${title}` });
    assert.equal(request.status, 201, `the request must open: ${request.text}`);
    return { patch: patch.body, request: request.body };
  }

  // ── §1 the chain, five words deep, and two more requests to refuse against ──────────────────────
  const main = await chainToApprovedRequest('clamp the drift at read time', DIFF_ONE);
  const approval = await post(`/pull-requests/${main.request.id}/decisions`, {
    verdict: 'approved',
    reason: 'it is the smallest change that stops the drift',
    decidedBy: 'acct-ada',
  });
  assert.equal(approval.status, 201, `the approval must land: ${approval.text}`);
  const approvedRequest = await call(`/pull-requests/${main.request.id}`);
  assert.equal(approvedRequest.body.status, APPROVED, 'the request must be approved before a deployment may be cut');

  const openChain = await chainToApprovedRequest('backfill the ledger', '+backfill\n');
  const rejectedChain = await chainToApprovedRequest('warn instead of fail', '+warn\n');
  const rejection = await post(`/pull-requests/${rejectedChain.request.id}/decisions`, { verdict: 'rejected' });
  assert.equal(rejection.status, 201, `the rejection must land: ${rejection.text}`);
  console.log(`[§1] the chain ran to an APPROVED request (incident → patch ${main.patch.id.slice(0, 8)}… → request ${main.request.id.slice(0, 8)}… → approved) · two more requests prepared: one open, one rejected`);

  // ── §2 a deployment of the approved request: 201, ten fields, three nulls ───────────────────────
  const deploymentAnswer = await post(`/pull-requests/${main.request.id}/deployments`, {
    environment: 'staging',
    requestedBy: '  acct-ada  ',
  });
  assert.equal(deploymentAnswer.status, 201, `a deployment request must answer 201, got ${deploymentAnswer.status}: ${deploymentAnswer.text}`);
  assertRecordShape(deploymentAnswer.body, '§2', main.request.id);
  assert.equal(deploymentAnswer.body.environment, 'staging');
  assert.equal(deploymentAnswer.body.status, REQUESTED);
  assert.equal(deploymentAnswer.body.requestedBy, 'acct-ada', 'the requester is trimmed');
  assert.equal(deploymentAnswer.body.patchId, main.patch.id, 'the record names the patch it was cut from');
  const deployment = deploymentAnswer.body;
  console.log(`[§2] POST /pull-requests/${main.request.id.slice(0, 8)}…/deployments answered 201 with exactly ten fields · status ${REQUESTED}, finishedAt/reportedBy/outcome all null — nothing that has not happened was invented`);

  // ── §3 an open request and a rejected request may not be deployed ──────────────────────────────
  const openAttempt = await post(`/pull-requests/${openChain.request.id}/deployments`, { environment: 'staging' });
  assert.equal(openAttempt.status, 409, `deploying an open request must answer 409, got ${openAttempt.status}: ${openAttempt.text}`);
  assert.equal(openAttempt.body.error, 'not-approved');
  assert.ok(openAttempt.body.message.includes('open'), `the refusal must name the state: ${openAttempt.body.message}`);

  const rejectedAttempt = await post(`/pull-requests/${rejectedChain.request.id}/deployments`, { environment: 'staging' });
  assert.equal(rejectedAttempt.status, 409, `deploying a rejected request must answer 409, got ${rejectedAttempt.status}: ${rejectedAttempt.text}`);
  assert.equal(rejectedAttempt.body.error, 'not-approved');
  assert.ok(rejectedAttempt.body.message.includes('rejected'), `the refusal must name the state: ${rejectedAttempt.body.message}`);
  assert.equal(await sql('select count(*) from deployment'), '1', 'refused deployments must not be stored');
  console.log(`[§3] deploying the OPEN request and the REJECTED request both answered 409 ${openAttempt.body.error}, naming their states · the table still held 1 record — refusals stored nothing`);

  // ── §4 a reported success moves the patch; a second report is refused ──────────────────────────
  const success = await post(`/deployments/${deployment.id}/complete`, {
    status: 'succeeded',
    outcome: '  the staging probe is green  ',
    reportedBy: '  acct-grace  ',
  });
  assert.equal(success.status, 200, `a completion must answer 200, got ${success.status}: ${success.text}`);
  assertRecordShape(success.body, '§4', main.request.id);
  assert.equal(success.body.status, SUCCEEDED);
  assert.ok(Number.isInteger(success.body.finishedAt), 'a completed record must carry its finish time');
  assert.equal(success.body.reportedBy, 'acct-grace', 'the reporter is trimmed and named');
  assert.equal(success.body.outcome, 'the staging probe is green', 'the outcome is trimmed');

  const patchAfterSuccess = await call(`/patches/${main.patch.id}`);
  assert.equal(patchAfterSuccess.body.status, DEPLOYED, 'a reported success must move the patch to deployed');

  const secondReport = await post(`/deployments/${deployment.id}/complete`, { status: 'failed' });
  assert.equal(secondReport.status, 409, `a second report must answer 409, got ${secondReport.status}: ${secondReport.text}`);
  assert.equal(secondReport.body.error, 'already-completed');

  const listing = await call(`/pull-requests/${main.request.id}/deployments`);
  assert.equal(listing.status, 200);
  assertListShape(listing.body, '§4');
  assert.equal(listing.body.count, 1);
  assert.equal(listing.body.total, 1);

  const skipped = await call(`/pull-requests/${main.request.id}/deployments?limit=1000&offset=150`);
  assert.equal(skipped.status, 200);
  assertListShape(skipped.body, '§4 cap and floor');
  assert.equal(skipped.body.count, 0);
  assert.equal(skipped.body.total, 1);
  assert.equal(skipped.body.limit, 100, 'the asked 1000 is capped to 100');
  assert.equal(skipped.body.offset, 100, 'the asked 150 is floored to the page boundary 100');
  console.log(`[§4] the reported SUCCESS answered 200 with the finish time, reporter and outcome · the patch read back ${DEPLOYED} · a second report answered 409 ${secondReport.body.error} · the listing answered 1 of 1 and reported cap/skip 100/100`);

  // ── §5 a failed report leaves the approval standing ────────────────────────────────────────────
  const openApproval = await post(`/pull-requests/${openChain.request.id}/decisions`, { verdict: 'approved' });
  assert.equal(openApproval.status, 201);
  const failing = await post(`/pull-requests/${openChain.request.id}/deployments`, {
    environment: 'production',
    requestedBy: 'acct-ada',
  });
  assert.equal(failing.status, 201, `the production deployment must open: ${failing.text}`);
  const failure = await post(`/deployments/${failing.body.id}/complete`, {
    status: 'failed',
    outcome: 'the readiness probe never went green',
    reportedBy: 'acct-grace',
  });
  assert.equal(failure.status, 200, `a failed report must answer 200: ${failure.text}`);
  assert.equal(failure.body.status, FAILED);
  const patchAfterFailure = await call(`/patches/${openChain.patch.id}`);
  assert.equal(patchAfterFailure.body.status, APPROVED,
      'a failed deployment leaves the patch approved — the retry is a new record');
  console.log(`[§5] a second chain was approved, deployed to production and reported FAILED · the record read ${FAILED} and the patch stayed ${APPROVED} — the approval is still true`);

  // ── §6 refusals: unknown parent, unknown record, and malformed requests ────────────────────────
  const orphan = await post('/pull-requests/not-a-real-id/deployments', { environment: 'staging' });
  assert.equal(orphan.status, 404, `a deployment of an unknown request must be 404, got ${orphan.status}: ${orphan.text}`);
  assert.equal(orphan.body.error, 'unknown-pull-request');

  const unknownRecord = await call('/deployments/not-a-real-id');
  assert.equal(unknownRecord.status, 404, `an unknown deployment must answer 404, got ${unknownRecord.status}`);
  assert.equal(unknownRecord.body.error, 'unknown-deployment');

  const refusals = [
    { path: `/pull-requests/${openChain.request.id}/deployments`, body: { environment: '   ' }, clue: 'a blank environment', needle: 'needs an environment' },
    { path: `/pull-requests/${openChain.request.id}/deployments`, body: { environment: 'Production' }, clue: 'an off-vocabulary environment', needle: 'matched exactly' },
    { path: `/deployments/${deployment.id}/complete`, body: { status: '   ' }, clue: 'a blank completion status', needle: 'needs a status' },
  ];
  for (const refusal of refusals) {
    const answer = await post(refusal.path, refusal.body);
    assert.equal(answer.status, 400, `${refusal.clue} must answer 400, got ${answer.status}: ${answer.text}`);
    assert.equal(answer.body.error, 'invalid-deployment', `${refusal.clue} must name the token`);
    assert.ok(answer.body.message.includes(refusal.needle),
        `${refusal.clue} must name the rule (expected "${refusal.needle}"): ${answer.body.message}`);
  }
  assert.equal(await sql('select count(*) from deployment'), '2', 'refusals must not be stored');
  console.log(`[§6] an unknown request 404 ${orphan.body.error} and an unknown record 404 ${unknownRecord.body.error} · a blank environment, an off-vocabulary \`Production\` and a blank completion status answered 400 invalid-deployment with the rule named · the table still held 2 records`);

  // ── §7 restart: the records and every status are rows, not buffers ─────────────────────────────
  await stopService(serviceProcess);
  serviceProcess = null;
  const second = await startService(PORT_FILE_SECOND);
  base = second.base;
  console.log(`[m9] restarted nexus-api on ${base}`);

  const recordsAfterRestart = await call(`/pull-requests/${main.request.id}/deployments`);
  assert.equal(recordsAfterRestart.status, 200);
  assert.equal(recordsAfterRestart.body.total, 1, 'the success survives the restart');
  assert.equal(recordsAfterRestart.body.deployments[0].status, SUCCEEDED, 'the same status after the restart');
  const mainPatchAfterRestart = await call(`/patches/${main.patch.id}`);
  assert.equal(mainPatchAfterRestart.body.status, DEPLOYED, 'the deployed patch survives the restart');
  const failedAfterRestart = await call(`/deployments/${failing.body.id}`);
  assert.equal(failedAfterRestart.body.status, FAILED, 'the failed record survives the restart');
  const approvedAfterRestart = await call(`/patches/${openChain.patch.id}`);
  assert.equal(approvedAfterRestart.body.status, APPROVED, 'the approved patch survives the restart');
  console.log(`[§7] stopped and started the service against the same database: the success and the failure are still there, patch A still ${DEPLOYED}, patch B still ${APPROVED}`);

  // ── §8 psql: two records, the moved statuses, and nothing written elsewhere ────────────────────
  assert.equal(await sql('select count(*) from deployment'), '2', 'two records must be in the table');
  assert.equal(await sql(`select count(*) from deployment where status = 'succeeded'`), '1', 'one success');
  assert.equal(await sql(`select count(*) from deployment where status = 'failed'`), '1', 'one failure');
  assert.equal(await sql(`select environment from deployment where deployment_id = '${failing.body.id}'`), 'production',
      'the environment is what was asked for');
  assert.equal(await sql(`select count(*) from deployment where finished_at is null`), '0',
      'both records were completed');
  assert.equal(await sql(`select status from incident_patch where patch_id = '${main.patch.id}'`), DEPLOYED,
      'the successful patch carries the last word');
  assert.equal(await sql(`select status from incident_patch where patch_id = '${openChain.patch.id}'`), APPROVED,
      'the failed patch still carries its approval');
  assert.equal(await sql('select count(*) from audit_entry'), '0', 'a deployment writes no trail fact');
  assert.equal(await sql('select count(*) from webhook_delivery'), '0', 'a deployment knocks on nothing');
  console.log(`[§8] psql read 2 deployments (1 succeeded / 1 failed, both finished, the production one on production), the patch statuses ${DEPLOYED}/${APPROVED}, ZERO audit entries and ZERO webhook deliveries`);

  // ── §9 teardown ─────────────────────────────────────────────────────────────────────────────────
  await stopService(serviceProcess);
  serviceProcess = null;
  const rm = await run('docker', ['rm', '-f', DB_CONTAINER]);
  assert.equal(rm.code, 0, `could not remove the throwaway database: ${rm.stderr}`);
  dbStarted = false;
  const goneContainer = await run('docker', ['ps', '-a', '--filter', `name=^/${DB_CONTAINER}$`, '--format', '{{.Names}}']);
  assert.equal(goneContainer.stdout.trim(), '', `the throwaway container is still listed: ${goneContainer.stdout.trim()}`);
  console.log(`[§9] teardown: the service process is gone and the throwaway container ${DB_CONTAINER} is removed`);

  console.log('\n[summary] M9: services/nexus-api BUILT and RAN against a real PostgreSQL · the chain ran five words deep twice — incident, patch, review request, decision, deployment · a deployment of the APPROVED request answered 201 with exactly ten fields and three nulls · an OPEN and a REJECTED request both refused 409 not-approved, storing nothing · a reported SUCCESS answered 200 with finish time/reporter/outcome and moved the patch to deployed, a second report refused 409, the listing 1 of 1 with cap/skip 100/100 · a reported FAILURE left the patch approved · an unknown request 404 unknown-pull-request, an unknown record 404 unknown-deployment, three malformed bodies 400 invalid-deployment · a STOP/START left both records and every status in place · psql read 2 deployments, the moved patch statuses, 0 audit entries and 0 deliveries');
  rmSync(BUILD_DIR, { recursive: true, force: true });
  console.log('[m9-deployment-proof] ALL ASSERTIONS PASSED (a deployment is a RECORD, not an action: only an approved request may be cut, only one report may complete it, success moves the patch to deployed — and nothing here deploys)');
} finally {
  if (serviceProcess && serviceProcess.exitCode === null) {
    await stopService(serviceProcess);
  }
  if (dbStarted) await run('docker', ['rm', '-f', DB_CONTAINER]);
}
