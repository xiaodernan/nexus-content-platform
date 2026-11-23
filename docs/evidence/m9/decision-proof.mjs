// NEXUS v869 (ADR 0016 amendment 578) — M9: this module is the evidence that record points at; the claim is:
// NEXUS M9 — A DECISION IS A VERDICT, NOT A MERGE: `POST /pull-requests/{id}/decisions` records one
// approved/rejected verdict on one OPEN request and moves the chain's cursor in the SAME transaction — the
// request's status becomes the verdict word, the patch becomes `approved` (or goes back to `proposed` on a
// rejection, free to be resubmitted), and one decision row is written. This proof builds the service, starts
// it against a throwaway PostgreSQL, opens an incident and two patches, submits two review requests,
// APPROVES the first and REJECTS the second, asserts the six-field shape, proves every status moved, refuses
// a second verdict with 409 already-decided, proves a rejected patch can be resubmitted (its open gate is
// free again), refuses malformed verdicts, STOPS and STARTS the service against the same database, and asks
// psql what the doors wrote.
//
// Why the verdict gate is an UPDATE and not a count:
//   v868's one-open gate is a count-then-insert and its ADR records that race as a bound. A verdict is
//   worse to double: two decisions would be two reviewers' words with no rule to pick one. So the predicate
//   `status = 'open'` lives INSIDE the UPDATE (`closeIfOpen`), and the answer is the moved-row count: 1 for
//   the caller who closed it, 0 for everyone else. Two concurrent decisions cannot both win.
//
// Why a rejection returns the patch to `proposed`:
//   A rejected patch is not under review and not approved. Leaving it `submitted` would describe a review
//   that is no longer happening, and would also keep the one-open gate closed forever. `proposed` says the
//   honest thing: this is a proposal, and it may be revised and resubmitted through the same doors.
//
// What it proves, clause by clause:
//   §0 the tools this proof needs (Java 25, Docker) are present BEFORE anything is started;
//   §1 the service BUILDS and STARTS; one incident, two patches, two review requests (201 each);
//   §2 an APPROVAL answers 201 with exactly six fields and moves BOTH records: the request reads `approved`
//      and the patch reads `approved`;
//   §3 a second verdict on the same request answers 409 already-decided, stores nothing, and leaves the
//      request and patch where the first verdict put them; the listing answers 1 of 1 and reports the cap
//      and floor it applied;
//   §4 a REJECTION answers 201 and moves the request to `rejected` and the patch BACK to `proposed`; a NEW
//      review request on that patch then answers 201 — the gate is free because the first request closed;
//   §5 an unknown request is 404 unknown-pull-request; a blank verdict, an off-vocabulary `Approved` and a
//      reason over the column are 400 invalid-decision with the rule named; refusals wrote nothing;
//   §6 one decision reads back unchanged, and an id that names nothing is 404 unknown-decision;
//   §7 the service is STOPPED and STARTED against the same database: two decisions, one approved patch and
//      one resubmitted patch are still there;
//   §8 psql reads TWO decision rows, the request statuses approved/rejected/open, the patch statuses
//      approved/submitted, ZERO audit entries and ZERO deliveries;
//   §9 teardown.
//
// The honest bounds, stated rather than hidden: nothing is merged, applied or deployed; a decision does not
// check that the patch's bytes fit any tree; a reviewer may not change their mind on the same request (a
// different verdict is a different request, by design); no authentication (ADR 0018), so anyone who can
// reach the door may decide. The chain's fifth word is absent on purpose.
//
// Requires: Java 25, Maven, and a running Docker daemon. Run:  node docs/evidence/m9/decision-proof.mjs
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
// THREE levels up: docs/evidence/m9/decision-proof.mjs -> the repository root.
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SERVICE_DIR = process.env.NEXUS_SERVICE_DIR
  ? path.resolve(process.env.NEXUS_SERVICE_DIR)
  : path.join(REPO_ROOT, 'services/nexus-api');
const DB_IMAGE = 'pgvector/pgvector:pg16';
const STAMP = `${Date.now()}-${process.pid}`;
const BUILD_DIR = path.join(tmpdir(), `nexus-decision-proof-build-${STAMP}`);
const JAR = path.join(BUILD_DIR, 'target/nexus-api-0.1.0-SNAPSHOT.jar');

const DB_CONTAINER = `nexus-decision-db-${STAMP}`;
const DB_NAME = 'nexus';
const DB_USER = 'nexus';
const DB_PASSWORD = 'nexus';
const PORT_FILE = path.join(tmpdir(), `nexus-decision-port-${STAMP}.txt`);
const PORT_FILE_SECOND = path.join(tmpdir(), `nexus-decision-port2-${STAMP}.txt`);

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
const RECORD_FIELDS = ['decidedAt', 'decidedBy', 'id', 'pullRequestId', 'reason', 'verdict'].sort();
const LIST_FIELDS = ['count', 'decisions', 'limit', 'offset', 'total'].sort();
const APPROVED = 'approved';
const REJECTED = 'rejected';
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

  /** The decision's shape, pinned on every answer: six fields, the verdict, the request it names. */
  function assertRecordShape(record, clue, expectedRequestId, expectedVerdict) {
    assert.ok(record && typeof record === 'object', `${clue}: a decision must be a JSON object, got ${JSON.stringify(record)}`);
    assert.deepEqual(Object.keys(record).sort(), RECORD_FIELDS,
        `${clue}: a decision carries exactly ${RECORD_FIELDS.join('/')}, got ${JSON.stringify(Object.keys(record))}`);
    assert.ok(typeof record.id === 'string' && record.id.length > 0, `${clue}: id must be a non-empty string`);
    assert.ok(typeof record.pullRequestId === 'string' && record.pullRequestId.length > 0,
        `${clue}: pullRequestId must be a non-empty string`);
    if (expectedRequestId !== undefined) {
      assert.equal(record.pullRequestId, expectedRequestId, `${clue}: the decision must name the request it decided`);
    }
    assert.ok([APPROVED, REJECTED].includes(record.verdict),
        `${clue}: the verdict must be one of the two words, got ${JSON.stringify(record.verdict)}`);
    if (expectedVerdict !== undefined) {
      assert.equal(record.verdict, expectedVerdict, `${clue}: the verdict must be the one that was sent`);
    }
    for (const field of ['reason', 'decidedBy']) {
      assert.ok(record[field] === null || typeof record[field] === 'string',
          `${clue}: ${field} must be null or a string, got ${JSON.stringify(record[field])}`);
    }
    assert.ok(Number.isInteger(record.decidedAt) && record.decidedAt >= 0,
        `${clue}: decidedAt must be an epoch-millisecond integer, got ${JSON.stringify(record.decidedAt)}`);
  }

  function assertListShape(list, clue) {
    assert.ok(list && typeof list === 'object', `${clue}: a listing must be a JSON object`);
    assert.deepEqual(Object.keys(list).sort(), LIST_FIELDS,
        `${clue}: a listing carries exactly ${LIST_FIELDS.join('/')}, got ${JSON.stringify(Object.keys(list))}`);
    assert.ok(Array.isArray(list.decisions), `${clue}: decisions must be an array`);
    assert.equal(list.count, list.decisions.length, `${clue}: count must be what this answer carried`);
    assert.ok(Number.isInteger(list.total) && list.total >= 0, `${clue}: total must be a non-negative integer`);
    assert.ok(Number.isInteger(list.limit) && list.limit >= 1 && list.limit <= 100,
        `${clue}: limit must be the applied cap in 1..100, got ${JSON.stringify(list.limit)}`);
    assert.ok(Number.isInteger(list.offset) && list.offset >= 0,
        `${clue}: offset must be the applied skip, got ${JSON.stringify(list.offset)}`);
    for (const record of list.decisions) assertRecordShape(record, clue);
  }

  // ── §1 one incident, two patches, two review requests ───────────────────────────────────────────
  const incidentAnswer = await post('/incidents', {
    title: 'the credits ledger drifted',
    severity: 'high',
    openedBy: 'acct-ada',
  });
  assert.equal(incidentAnswer.status, 201, `the parent incident must be opened, got ${incidentAnswer.status}: ${incidentAnswer.text}`);
  const incidentId = incidentAnswer.body.id;

  const patches = [];
  for (const proposal of [
    { title: 'clamp the drift at read time', diff: DIFF_ONE },
    { title: 'backfill the ledger', diff: '+backfill\n' },
  ]) {
    const answer = await post(`/incidents/${incidentId}/patches`, { ...proposal, author: 'acct-ada' });
    assert.equal(answer.status, 201, `the patch must be proposed, got ${answer.status}: ${answer.text}`);
    patches.push(answer.body);
  }

  const requests = [];
  for (const patch of patches) {
    const answer = await post(`/patches/${patch.id}/pull-requests`, { title: `review “${patch.title}”`, openedBy: 'acct-grace' });
    assert.equal(answer.status, 201, `the review request must open, got ${answer.status}: ${answer.text}`);
    assert.equal(answer.body.status, OPEN);
    requests.push(answer.body);
  }
  console.log(`[§1] one incident with two patches and two open review requests (${requests.map((row) => row.id.slice(0, 8)).join(' ')}), each 201 and ${OPEN}`);

  // ── §2 an approval moves BOTH records ───────────────────────────────────────────────────────────
  const approval = await post(`/pull-requests/${requests[0].id}/decisions`, {
    verdict: 'approved',
    reason: '  it is the smallest change that stops the drift  ',
    decidedBy: '  acct-ada  ',
  });
  assert.equal(approval.status, 201, `an approval must answer 201, got ${approval.status}: ${approval.text}`);
  assertRecordShape(approval.body, '§2', requests[0].id, APPROVED);
  assert.equal(approval.body.reason, 'it is the smallest change that stops the drift', 'the reason is trimmed');
  assert.equal(approval.body.decidedBy, 'acct-ada', 'the reviewer is trimmed');

  const approvedRequest = await call(`/pull-requests/${requests[0].id}`);
  assert.equal(approvedRequest.body.status, APPROVED, 'the request status must become the verdict word');
  const approvedPatch = await call(`/patches/${patches[0].id}`);
  assert.equal(approvedPatch.body.status, APPROVED, 'the patch must move to approved in the same transaction');
  console.log(`[§2] POST /pull-requests/${requests[0].id.slice(0, 8)}…/decisions approved answered 201 with exactly six fields · the request read back ${APPROVED} and the patch read back ${APPROVED} — both moved`);

  // ── §3 a second verdict is refused by the atomic close ──────────────────────────────────────────
  const secondVerdict = await post(`/pull-requests/${requests[0].id}/decisions`, { verdict: 'rejected' });
  assert.equal(secondVerdict.status, 409, `a second verdict must answer 409, got ${secondVerdict.status}: ${secondVerdict.text}`);
  assert.equal(secondVerdict.body.error, 'already-decided');
  assert.ok(secondVerdict.body.message.includes('no longer open'), `the refusal must name the state: ${secondVerdict.body.message}`);

  const oneDecision = await call(`/pull-requests/${requests[0].id}/decisions`);
  assert.equal(oneDecision.status, 200);
  assertListShape(oneDecision.body, '§3');
  assert.equal(oneDecision.body.count, 1, 'the refused second verdict stored nothing');
  assert.equal(oneDecision.body.total, 1);
  assert.equal(oneDecision.body.decisions[0].verdict, APPROVED, 'the first verdict is still the only one');

  const skipped = await call(`/pull-requests/${requests[0].id}/decisions?limit=1000&offset=150`);
  assert.equal(skipped.status, 200);
  assertListShape(skipped.body, '§3 cap and floor');
  assert.equal(skipped.body.count, 0);
  assert.equal(skipped.body.total, 1);
  assert.equal(skipped.body.limit, 100, 'the asked 1000 is capped to 100');
  assert.equal(skipped.body.offset, 100, 'the asked 150 is floored to the page boundary 100');

  const stillApprovedPatch = await call(`/patches/${patches[0].id}`);
  assert.equal(stillApprovedPatch.body.status, APPROVED, 'the refused verdict must not move the patch');
  console.log(`[§3] a second verdict on the same request answered 409 ${secondVerdict.body.error} · the listing answered 1 of 1 · limit=1000&offset=150 answered 0 rows and reported cap 100 / skip 100 · the patch stayed ${APPROVED}`);

  // ── §4 a rejection returns the patch to proposed, and the gate frees ────────────────────────────
  const rejection = await post(`/pull-requests/${requests[1].id}/decisions`, {
    verdict: 'rejected',
    reason: 'the drift is upstream, not here',
    decidedBy: 'acct-grace',
  });
  assert.equal(rejection.status, 201, `a rejection must answer 201, got ${rejection.status}: ${rejection.text}`);
  assertRecordShape(rejection.body, '§4', requests[1].id, REJECTED);

  const rejectedRequest = await call(`/pull-requests/${requests[1].id}`);
  assert.equal(rejectedRequest.body.status, REJECTED, 'the request status must become rejected');
  const revisedPatch = await call(`/patches/${patches[1].id}`);
  assert.equal(revisedPatch.body.status, PROPOSED,
      'a rejected patch goes back to proposed — the review is over and the proposal remains');

  const resubmission = await post(`/patches/${patches[1].id}/pull-requests`, {
    title: 'review the revised backfill',
    openedBy: 'acct-grace',
  });
  assert.equal(resubmission.status, 201,
      `a rejected patch must be resubmittable through the same door, got ${resubmission.status}: ${resubmission.text}`);
  const resubmittedPatch = await call(`/patches/${patches[1].id}`);
  assert.equal(resubmittedPatch.body.status, SUBMITTED, 'the new request moved the patch back to submitted');
  console.log(`[§4] the second request was REJECTED with 201 · the request read back ${REJECTED}, the patch went back to ${PROPOSED} · a NEW review request on that patch then answered 201 and the patch read ${SUBMITTED} — the gate is free because the first request closed`);

  // ── §5 refusals: an unknown request, and three malformed verdicts ──────────────────────────────
  const orphan = await post('/pull-requests/not-a-real-id/decisions', { verdict: 'approved' });
  assert.equal(orphan.status, 404, `a decision about an unknown request must be 404, got ${orphan.status}: ${orphan.text}`);
  assert.equal(orphan.body.error, 'unknown-pull-request');

  const refusals = [
    { body: { verdict: '   ' }, clue: 'a blank verdict', needle: 'needs a verdict' },
    { body: { verdict: 'Approved' }, clue: 'an off-vocabulary verdict', needle: 'matched exactly' },
    { body: { verdict: 'approved', reason: 'r'.repeat(2001) }, clue: 'a reason over the column', needle: '2000' },
  ];
  for (const refusal of refusals) {
    const answer = await post(`/pull-requests/${resubmission.body.id}/decisions`, refusal.body);
    assert.equal(answer.status, 400, `${refusal.clue} must answer 400, got ${answer.status}: ${answer.text}`);
    assert.equal(answer.body.error, 'invalid-decision', `${refusal.clue} must name the token`);
    assert.ok(answer.body.message.includes(refusal.needle),
        `${refusal.clue} must name the rule (expected "${refusal.needle}"): ${answer.body.message}`);
  }
  const decisionsAfterRefusals = await sql('select count(*) from pull_request_decision');
  assert.equal(decisionsAfterRefusals, '2', 'refused verdicts must not be stored');
  const requestAfterRefusals = await call(`/pull-requests/${resubmission.body.id}`);
  assert.equal(requestAfterRefusals.body.status, OPEN, 'a refused verdict must not close the request');
  console.log(`[§5] a decision about an unknown request answered 404 ${orphan.body.error} · a blank verdict, an off-vocabulary \`Approved\` and a 2001-character reason answered 400 invalid-decision with the rule named · the table still held 2 decisions and the resubmitted request stayed ${OPEN}`);

  // ── §6 one decision reads back unchanged, an unknown id is 404 ─────────────────────────────────
  const readBack = await call(`/decisions/${approval.body.id}`);
  assert.equal(readBack.status, 200, `reading a decision must answer 200, got ${readBack.status}: ${readBack.text}`);
  assertRecordShape(readBack.body, '§6', requests[0].id, APPROVED);
  assert.deepEqual(readBack.body, approval.body, 'a decision must read back exactly as it was written');

  const missing = await call('/decisions/not-a-real-id');
  assert.equal(missing.status, 404, `an unknown decision must answer 404, got ${missing.status}: ${missing.text}`);
  assert.equal(missing.body.error, 'unknown-decision');
  console.log(`[§6] GET /decisions/${approval.body.id.slice(0, 8)}… answered 200 and the six values read back unchanged · GET /decisions/not-a-real-id answered 404 ${missing.body.error}`);

  // ── §7 restart: the verdicts are rows, not buffers ─────────────────────────────────────────────
  await stopService(serviceProcess);
  serviceProcess = null;
  const second = await startService(PORT_FILE_SECOND);
  base = second.base;
  console.log(`[m9] restarted nexus-api on ${base}`);

  const decisionsAfterRestart = await call(`/pull-requests/${requests[0].id}/decisions`);
  assert.equal(decisionsAfterRestart.status, 200);
  assert.equal(decisionsAfterRestart.body.total, 1, 'the approval survives the restart');
  assert.equal(decisionsAfterRestart.body.decisions[0].id, approval.body.id, 'the same decision id after the restart');
  const approvedAfterRestart = await call(`/patches/${patches[0].id}`);
  assert.equal(approvedAfterRestart.body.status, APPROVED, 'the approved patch survives the restart');
  const resubmittedAfterRestart = await call(`/patches/${patches[1].id}`);
  assert.equal(resubmittedAfterRestart.body.status, SUBMITTED, 'the resubmitted patch survives the restart');
  const rejectedAfterRestart = await call(`/pull-requests/${requests[1].id}`);
  assert.equal(rejectedAfterRestart.body.status, REJECTED, 'the rejected request survives the restart');
  console.log(`[§7] stopped and started the service against the same database: the approval and the rejection are still there, patch A still ${APPROVED}, patch B still ${SUBMITTED}, request 2 still ${REJECTED}`);

  // ── §8 psql: two decisions, the moved statuses, and nothing written elsewhere ──────────────────
  assert.equal(await sql('select count(*) from pull_request_decision'), '2', 'two decisions must be in the table');
  assert.equal(await sql(`select count(*) from pull_request_decision where verdict = 'approved'`), '1',
      'one approval');
  assert.equal(await sql(`select count(*) from pull_request_decision where verdict = 'rejected'`), '1',
      'one rejection');
  assert.equal(await sql(`select status from patch_pull_request where pull_request_id = '${requests[0].id}'`), APPROVED,
      'the approved request row carries the verdict word');
  assert.equal(await sql(`select status from patch_pull_request where pull_request_id = '${requests[1].id}'`), REJECTED,
      'the rejected request row carries the verdict word');
  assert.equal(await sql(`select status from incident_patch where patch_id = '${patches[0].id}'`), APPROVED,
      'the approved patch row carries its word');
  assert.equal(await sql(`select status from incident_patch where patch_id = '${patches[1].id}'`), SUBMITTED,
      'the resubmitted patch row carries its word');
  assert.equal(await sql('select count(*) from audit_entry'), '0', 'a decision writes no trail fact');
  assert.equal(await sql('select count(*) from webhook_delivery'), '0', 'a decision knocks on nothing');
  console.log(`[§8] psql read 2 decisions (1 approved / 1 rejected), the request statuses ${APPROVED}/${REJECTED}, the patch statuses ${APPROVED}/${SUBMITTED}, ZERO audit entries and ZERO webhook deliveries`);

  // ── §9 teardown ─────────────────────────────────────────────────────────────────────────────────
  await stopService(serviceProcess);
  serviceProcess = null;
  const rm = await run('docker', ['rm', '-f', DB_CONTAINER]);
  assert.equal(rm.code, 0, `could not remove the throwaway database: ${rm.stderr}`);
  dbStarted = false;
  const goneContainer = await run('docker', ['ps', '-a', '--filter', `name=^/${DB_CONTAINER}$`, '--format', '{{.Names}}']);
  assert.equal(goneContainer.stdout.trim(), '', `the throwaway container is still listed: ${goneContainer.stdout.trim()}`);
  console.log(`[§9] teardown: the service process is gone and the throwaway container ${DB_CONTAINER} is removed`);

  console.log('\n[summary] M9: services/nexus-api BUILT and RAN against a real PostgreSQL · one incident, two patches, two review requests · an APPROVAL with 201 and exactly six fields moved the request AND the patch to approved · a second verdict refused 409 already-decided, storing nothing and moving nothing, the listing 1 of 1, cap/skip 100/100 applied to a 150 skip · a REJECTION with 201 moved the request to rejected and the patch BACK to proposed, and a NEW review request on that patch answered 201 · an unknown request 404 unknown-pull-request, a blank/off-vocabulary verdict and a 2001-character reason 400 invalid-decision, an unknown decision 404 unknown-decision · a STOP/START left both verdicts and every status in place · psql read 2 decisions, the moved request and patch statuses, 0 audit entries and 0 deliveries');
  rmSync(BUILD_DIR, { recursive: true, force: true });
  console.log('[m9-decision-proof] ALL ASSERTIONS PASSED (a decision is a VERDICT, not a merge: one atomic close per request, the patch moves beside it — approved, or back to proposed for revision — and nothing is applied, merged or deployed)');
} finally {
  if (serviceProcess && serviceProcess.exitCode === null) {
    await stopService(serviceProcess);
  }
  if (dbStarted) await run('docker', ['rm', '-f', DB_CONTAINER]);
}
