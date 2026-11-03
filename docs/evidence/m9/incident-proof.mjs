// NEXUS M9 — AN INCIDENT IS A RECORD WITH A LIFE: `POST /incidents` opens one, `GET /incidents` reads the
// newest window with both counts beside it, `GET /incidents/{id}` reads one, and `POST /incidents/{id}/resolve`
// closes it — once. This proof builds the service, starts it against a throwaway PostgreSQL, opens FOUR
// incidents with different severities and targets, asserts the exact field shape of every answer, reads the
// window back and checks its order and both counts, narrows it by status and severity, refuses words the
// vocabulary does not hold, resolves one and refuses the second resolve, then STOPS the service and STARTS
// it again against the same database to prove the record is a table rather than heap state, and finally asks
// psql what the door wrote.
//
// Why this is the first word of M9's chain and not the whole chain:
//   M9's row reads "incident→patch→PR→approve→deploy". This slice builds the first word only. There is no
//   detection, no assignment, no comment, no patch, no pull request, no approval and no deployment door —
//   and saying which words are absent is part of what this proof is allowed to claim. A record that can be
//   opened, read and closed is the thing every later word would attach to; inventing the later words now
//   would be a flow nobody asked for, graded against a policy nobody wrote.
//
// Why "resolve" is one-way and refuses the second time:
//   A resolved incident keeps the resolver who closed it and the instant the service recorded. A second
//   resolve would overwrite a fact that already happened, so the door answers 409 `already-resolved` and
//   leaves the first resolve intact. The proof reads the record back after the refusal and asserts that the
//   first resolver is still there.
//
// Why the listing carries two counts and the values it applied:
//   The filter runs IN THE QUERY, so the caller never sees the rows it excluded. `count` is what the answer
//   carried; `total` is what the whole narrowed table holds — the one number that can still say a filter is
//   hiding something. `limit` and `offset` are the values the query actually used (the cap, the floor and
//   the whole-page skip), so a clamped request is visible in its own answer rather than guessed from the
//   window's length.
//
// What it proves, clause by clause:
//   §0 the tools this proof needs (Java 25, Docker) are present BEFORE anything is started;
//   §1 the service BUILDS and STARTS, four incidents are opened (201), and every answer carries exactly
//      eleven fields with the words the opener typed — trimmed, and `resolvedAt` present-and-null;
//   §2 the listing answers the newest window first with `count`/`total`/`limit`/`offset`, an offset reads
//      the page that contains it, and `status`/`severity` narrow BOTH the window and the total;
//   §3 one id reads back the record it named, and an id that names nothing is 404 `unknown-incident`;
//   §4 one resolve answers 200 with the resolved record, the second is 409 `already-resolved` and the first
//      resolver survives it, and each broken rule is a 400 `invalid-incident` that names it;
//   §5 the service is STOPPED and STARTED against the same database: the four records and the one resolve
//      are still there — the incident is a table, not heap state;
//   §6 psql reads four rows, one resolved, ZERO audit entries and ZERO webhook deliveries — this door
//      writes its own table and nothing else;
//   §7 teardown.
//
// The honest bounds, stated rather than hidden: severity is a CLAIM the opener makes, drawn from four fixed
// words and never re-graded against evidence; a target is a pair of opaque strings this service never
// dereferences or checks for existence; nobody is assigned, nobody is notified, nothing may be commented on,
// no incident may be reopened, and there is no automatic detection anywhere in this build. There is exactly
// one transition, open→resolved, and it is idempotent only in its REFUSAL: the second call is a 409, not a
// silent success. No authentication (ADR 0018): anyone who can reach the door may open, read or resolve.
//
// Requires: Java 25, Maven, and a running Docker daemon. Run:  node docs/evidence/m9/incident-proof.mjs
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
// THREE levels up: docs/evidence/m9/incident-proof.mjs -> the repository root.
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SERVICE_DIR = process.env.NEXUS_SERVICE_DIR
  ? path.resolve(process.env.NEXUS_SERVICE_DIR)
  : path.join(REPO_ROOT, 'services/nexus-api');
const DB_IMAGE = 'pgvector/pgvector:pg16';
const STAMP = `${Date.now()}-${process.pid}`;
const BUILD_DIR = path.join(tmpdir(), `nexus-incident-proof-build-${STAMP}`);
const JAR = path.join(BUILD_DIR, 'target/nexus-api-0.1.0-SNAPSHOT.jar');

const DB_CONTAINER = `nexus-incident-db-${STAMP}`;
const DB_NAME = 'nexus';
const DB_USER = 'nexus';
const DB_PASSWORD = 'nexus';
const PORT_FILE = path.join(tmpdir(), `nexus-incident-port-${STAMP}.txt`);
const PORT_FILE_SECOND = path.join(tmpdir(), `nexus-incident-port2-${STAMP}.txt`);

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

/** The shape, pinned: a field added here is a fact this door would start claiming. */
const RECORD_FIELDS = [
  'id', 'openedAt', 'openedBy', 'resolvedAt', 'resolvedBy',
  'severity', 'status', 'summary', 'targetId', 'targetKind', 'title'
].sort();
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'resolved'];
const LIST_FIELDS = ['count', 'incidents', 'limit', 'offset', 'severity', 'status', 'total'].sort();

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

  /** One HTTP call, parsed, with the headers a rule is read from and the wall time it took. */
  async function call(pathname, init = {}) {
    const began = Date.now();
    const response = await fetch(`${base}${pathname}`, { ...init, signal: AbortSignal.timeout(120_000) });
    const text = await response.text();
    const elapsedMs = Date.now() - began;
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: response.status, body, text, headers: response.headers, elapsedMs };
  }

  /** A JSON POST, including the empty body a resolve is allowed to send. */
  function post(pathname, body) {
    if (body === undefined) {
      return call(pathname, { method: 'POST' });
    }
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
   * The record's shape, pinned on every answer: eleven fields, the vocabulary's words, and the resolution
   * pair that is null TOGETHER — an open record may not carry one half of a resolve.
   */
  function assertRecordShape(record, clue) {
    assert.ok(record && typeof record === 'object', `${clue}: a record must be a JSON object, got ${JSON.stringify(record)}`);
    assert.deepEqual(Object.keys(record).sort(), RECORD_FIELDS,
        `${clue}: an incident carries exactly ${RECORD_FIELDS.join('/')}, got ${JSON.stringify(Object.keys(record))}`);
    assert.ok(typeof record.id === 'string' && record.id.length > 0, `${clue}: id must be a non-empty string`);
    assert.ok(typeof record.title === 'string' && record.title.length > 0, `${clue}: title must be a non-empty string`);
    assert.ok(SEVERITIES.includes(record.severity),
        `${clue}: severity must be one of ${SEVERITIES}, got ${JSON.stringify(record.severity)}`);
    assert.ok(STATUSES.includes(record.status),
        `${clue}: status must be one of ${STATUSES}, got ${JSON.stringify(record.status)}`);
    assert.ok(Number.isInteger(record.openedAt) && record.openedAt >= 0,
        `${clue}: openedAt must be an epoch-millisecond integer, got ${JSON.stringify(record.openedAt)}`);
    for (const field of ['summary', 'targetKind', 'targetId', 'openedBy', 'resolvedBy']) {
      assert.ok(record[field] === null || typeof record[field] === 'string',
          `${clue}: ${field} must be null or a string, got ${JSON.stringify(record[field])}`);
    }
    assert.ok(record.resolvedAt === null || (Number.isInteger(record.resolvedAt) && record.resolvedAt >= 0),
        `${clue}: resolvedAt must be null or an epoch-millisecond integer, got ${JSON.stringify(record.resolvedAt)}`);
    if (record.status === 'open') {
      assert.equal(record.resolvedAt, null, `${clue}: an open record cannot carry a resolvedAt`);
      assert.equal(record.resolvedBy, null, `${clue}: an open record cannot carry a resolvedBy`);
    } else {
      assert.ok(Number.isInteger(record.resolvedAt), `${clue}: a resolved record must carry its resolvedAt`);
    }
  }

  /** Newest first, and the tie-break the repository states: openedAt desc, then id desc. */
  function assertNewestFirst(records, clue) {
    for (let i = 1; i < records.length; i++) {
      const newer = records[i - 1];
      const older = records[i];
      assert.ok(newer.openedAt >= older.openedAt,
          `${clue}: row ${i} (${newer.openedAt}) must not be older than row ${i + 1} (${older.openedAt})`);
      if (newer.openedAt === older.openedAt) {
        assert.ok(newer.id > older.id,
            `${clue}: rows opened at the same instant must break the tie by id DESC, got ${newer.id} then ${older.id}`);
      }
    }
  }

  function assertListShape(list, clue) {
    assert.ok(list && typeof list === 'object', `${clue}: a listing must be a JSON object`);
    assert.deepEqual(Object.keys(list).sort(), LIST_FIELDS,
        `${clue}: a listing carries exactly ${LIST_FIELDS.join('/')}, got ${JSON.stringify(Object.keys(list))}`);
    assert.ok(Array.isArray(list.incidents), `${clue}: incidents must be an array`);
    assert.equal(list.count, list.incidents.length, `${clue}: count must be what this answer carried`);
    assert.ok(Number.isInteger(list.total) && list.total >= 0, `${clue}: total must be a non-negative integer`);
    assert.ok(Number.isInteger(list.limit) && list.limit >= 1 && list.limit <= 100,
        `${clue}: limit must be the applied cap in 1..100, got ${JSON.stringify(list.limit)}`);
    assert.ok(Number.isInteger(list.offset) && list.offset >= 0,
        `${clue}: offset must be the applied skip, got ${JSON.stringify(list.offset)}`);
    for (const record of list.incidents) assertRecordShape(record, clue);
    assertNewestFirst(list.incidents, clue);
  }

  // ── §1 four records, each 201, each eleven fields ───────────────────────────────────────────────
  const opened = [];
  const openings = [
    {
      body: {
        title: '  the deploy lane is red  ',
        summary: '  the runner never finished; two proofs were cut off  ',
        severity: 'critical',
        targetKind: '  tool  ',
        targetId: '  tool-registry  ',
        openedBy: '  acct-ada  ',
      },
      expect: {
        title: 'the deploy lane is red',
        summary: 'the runner never finished; two proofs were cut off',
        targetKind: 'tool',
        targetId: 'tool-registry',
        openedBy: 'acct-ada',
      },
    },
    {
      body: { title: 'the publish lane timed out', severity: 'high', openedBy: 'acct-grace' },
      expect: { title: 'the publish lane timed out', summary: null, targetKind: null, targetId: null },
    },
    {
      body: { title: 'a delivery was refused', severity: 'medium' },
      expect: { title: 'a delivery was refused', openedBy: null },
    },
    {
      body: { title: 'the credits ledger drifted', severity: 'low', openedBy: 'acct-lin' },
      expect: { title: 'the credits ledger drifted' },
    },
  ];
  for (const opening of openings) {
    const answer = await post('/incidents', opening.body);
    assert.equal(answer.status, 201, `opening must answer 201, got ${answer.status}: ${answer.text}`);
    assertRecordShape(answer.body, `§1 ${opening.body.title}`);
    assert.equal(answer.body.status, 'open', 'a new record is open');
    assert.equal(answer.body.severity, opening.body.severity, 'the severity is the word the opener named');
    if (opening.expect.title) assert.equal(answer.body.title, opening.expect.title, 'the title is trimmed');
    for (const field of ['summary', 'targetKind', 'targetId', 'openedBy']) {
      if (Object.prototype.hasOwnProperty.call(opening.expect, field)) {
        assert.equal(answer.body[field], opening.expect[field], `§1 ${field} must be what the opener typed`);
      }
    }
    opened.push(answer.body);
  }
  console.log(`[§1] four incidents opened with 201 and exactly eleven fields each · titles and targets trimmed, resolvedAt present-and-null · severities ${opened.map((row) => row.severity).join('/')} · ids ${opened.map((row) => row.id.slice(0, 8)).join(' ')}`);

  // ── §2 the window, its order, both counts, and the values actually applied ───────────────────────
  const all = await call('/incidents');
  assert.equal(all.status, 200, `a listing must answer 200, got ${all.status}: ${all.text}`);
  assertListShape(all.body, '§2 all');
  assert.equal(all.body.total, 4, `the whole table holds four records, got ${all.body.total}`);
  assert.equal(all.body.limit, 20, 'the default window is twenty');
  assert.equal(all.body.offset, 0, 'no offset was asked for');
  assert.equal(all.body.status, null, 'no status filter was applied');
  assert.equal(all.body.severity, null, 'no severity filter was applied');

  const pageTwo = await call('/incidents?limit=2&offset=2');
  assert.equal(pageTwo.status, 200);
  assertListShape(pageTwo.body, '§2 second page');
  assert.equal(pageTwo.body.count, 2);
  assert.equal(pageTwo.body.total, 4, 'the second page still knows the whole table holds four');
  assert.equal(pageTwo.body.limit, 2);
  assert.equal(pageTwo.body.offset, 2, 'an offset of two rows in a window of two reads from row two');
  assert.deepEqual(pageTwo.body.incidents.map((row) => row.id), all.body.incidents.slice(2).map((row) => row.id),
      'the second page must be rows three and four of the first listing');

  const criticalOnly = await call('/incidents?severity=critical');
  assert.equal(criticalOnly.status, 200);
  assertListShape(criticalOnly.body, '§2 critical');
  assert.equal(criticalOnly.body.count, 1, 'exactly one incident claimed critical');
  assert.equal(criticalOnly.body.total, 1, 'the total must be narrowed by the same filter, not the whole table');
  assert.equal(criticalOnly.body.severity, 'critical');

  const openOnly = await call('/incidents?status=open');
  assert.equal(openOnly.status, 200);
  assert.equal(openOnly.body.count, 4, 'all four records are open before any resolve');
  assert.equal(openOnly.body.total, 4);
  assert.equal(openOnly.body.status, 'open');
  console.log(`[§2] GET /incidents answered ${all.body.count} of ${all.body.total} with limit ${all.body.limit} and offset ${all.body.offset}, newest first · limit=2&offset=2 answered rows ${pageTwo.body.offset + 1}..${pageTwo.body.offset + pageTwo.body.count} of 4 (the third and fourth of the first listing) · severity=critical answered 1 of 1 and status=open answered 4 of 4 — both counts narrowed together`);

  // ── §3 one id reads back, an id that names nothing is 404 ───────────────────────────────────────
  const readBack = await call(`/incidents/${opened[0].id}`);
  assert.equal(readBack.status, 200, `reading a record must answer 200, got ${readBack.status}: ${readBack.text}`);
  assertRecordShape(readBack.body, '§3');
  assert.deepEqual(readBack.body, opened[0], 'a record must read back exactly as it was written');

  const missing = await call('/incidents/not-a-real-id');
  assert.equal(missing.status, 404, `an unknown id must answer 404, got ${missing.status}: ${missing.text}`);
  assert.equal(missing.body.error, 'unknown-incident');
  console.log(`[§3] GET /incidents/${opened[0].id.slice(0, 8)}… answered 200 and the record read back byte for byte · GET /incidents/not-a-real-id answered 404 ${missing.body.error}`);

  // ── §4 resolve: one 200, a second 409, and the first resolver survives it ───────────────────────
  const resolve = await post(`/incidents/${opened[1].id}/resolve`, { resolvedBy: '  grace  ' });
  assert.equal(resolve.status, 200, `the first resolve must answer 200, got ${resolve.status}: ${resolve.text}`);
  assertRecordShape(resolve.body, '§4 resolve');
  assert.equal(resolve.body.status, 'resolved');
  assert.equal(resolve.body.resolvedBy, 'grace', 'the resolver is trimmed');
  assert.ok(Number.isInteger(resolve.body.resolvedAt), 'a resolve stamps the service instant');

  const secondResolve = await post(`/incidents/${opened[1].id}/resolve`, { resolvedBy: 'lin' });
  assert.equal(secondResolve.status, 409, `the second resolve must answer 409, got ${secondResolve.status}: ${secondResolve.text}`);
  assert.equal(secondResolve.body.error, 'already-resolved');

  const afterRefusal = await call(`/incidents/${opened[1].id}`);
  assert.equal(afterRefusal.status, 200);
  assert.equal(afterRefusal.body.resolvedBy, 'grace', 'the refused second resolve must not replace the first resolver');
  assert.equal(afterRefusal.body.resolvedAt, resolve.body.resolvedAt, 'the refused second resolve must not move the instant');

  const emptyBodyResolve = await post(`/incidents/${opened[1].id}/resolve`);
  assert.equal(emptyBodyResolve.status, 409, 'a body-less second resolve is still a second resolve');

  const resolvedOnly = await call('/incidents?status=resolved');
  assert.equal(resolvedOnly.status, 200);
  assert.equal(resolvedOnly.body.count, 1, 'exactly one record is resolved');
  assert.equal(resolvedOnly.body.total, 1);
  const openAfterResolve = await call('/incidents?status=open');
  assert.equal(openAfterResolve.body.count, 3, 'the resolve moved one record out of the open window');
  assert.equal(openAfterResolve.body.total, 3);
  const resolvedHigh = await call('/incidents?status=resolved&severity=high');
  assert.equal(resolvedHigh.status, 200);
  assert.equal(resolvedHigh.body.count, 1, 'the resolved record claimed high');
  const openHigh = await call('/incidents?status=open&severity=high');
  assert.equal(openHigh.body.count, 0, 'no open record claims high any more');
  assert.equal(openHigh.body.total, 0, 'an empty narrowed set says zero in both counts');

  const resolveUnknown = await post('/incidents/not-a-real-id/resolve', { resolvedBy: 'ada' });
  assert.equal(resolveUnknown.status, 404, 'resolving an unknown id is 404, not a create');
  assert.equal(resolveUnknown.body.error, 'unknown-incident');

  const refusals = [
    { body: { title: 'red lane', severity: 'High' }, clue: 'a capitalized severity' },
    { body: { title: '   ', severity: 'low' }, clue: 'a blank title' },
    { body: { title: 'red lane' }, clue: 'a missing severity' },
    { body: { title: 'red lane', severity: 'low', targetKind: 'tool' }, clue: 'a kind with no id' },
    { body: { title: 'red lane', severity: 'low', targetId: 'tool-1' }, clue: 'an id with no kind' },
  ];
  for (const refusal of refusals) {
    const answer = await post('/incidents', refusal.body);
    assert.equal(answer.status, 400, `${refusal.clue} must answer 400, got ${answer.status}: ${answer.text}`);
    assert.equal(answer.body.error, 'invalid-incident', `${refusal.clue} must name the token`);
  }
  const badFilter = await call('/incidents?severity=HIGH');
  assert.equal(badFilter.status, 400, 'a severity outside the vocabulary is refused, never answered empty');
  assert.equal(badFilter.body.error, 'invalid-incident');
  const blankFilter = await call('/incidents?status=');
  assert.equal(blankFilter.status, 400, 'a blank filter is a typo, not an absence');
  console.log(`[§4] POST /incidents/${opened[1].id.slice(0, 8)}…/resolve answered 200 with status=resolved, resolvedBy=grace and a service instant · the second resolve answered 409 ${secondResolve.body.error} and the read-back still named grace · status=open moved 4 → 3 while status=resolved answered 1 · resolved&severity=high answered 1 and open&severity=high answered 0 of 0 · five openings and two filters were refused as 400 ${badFilter.body.error} with the rule named`);

  // ── §5 restart: the record is a table, not heap state ───────────────────────────────────────────
  await stopService(serviceProcess);
  serviceProcess = null;
  const second = await startService(PORT_FILE_SECOND);
  base = second.base;
  console.log(`[m9] restarted nexus-api on ${base}`);

  const afterRestart = await call('/incidents');
  assert.equal(afterRestart.status, 200, `a restarted service must answer the listing, got ${afterRestart.status}: ${afterRestart.text}`);
  assertListShape(afterRestart.body, '§5');
  assert.equal(afterRestart.body.total, 4, 'all four records survive the restart');
  assert.deepEqual(afterRestart.body.incidents.map((row) => row.id), all.body.incidents.map((row) => row.id),
      'the same four ids, in the same order, after the restart');
  const survivedResolve = await call(`/incidents/${opened[1].id}`);
  assert.equal(survivedResolve.body.status, 'resolved', 'the resolve survives the restart');
  assert.equal(survivedResolve.body.resolvedBy, 'grace');
  assert.equal(survivedResolve.body.resolvedAt, resolve.body.resolvedAt, 'the resolve instant survives the restart');
  console.log(`[§5] stopped and started the service against the same database: the listing still answered 4 of 4 with the same ids in the same order, and the resolved record still named grace at the same instant — the incident is a row, not a counter in the heap`);

  // ── §6 psql: four rows, one resolved, and nothing written anywhere else ─────────────────────────
  assert.equal(await sql('select count(*) from incident'), '4', 'four rows must be in the incident table');
  assert.equal(await sql("select count(*) from incident where status = 'resolved'"), '1',
      'exactly one row is resolved');
  assert.equal(await sql(`select resolved_by from incident where incident_id = '${opened[1].id}'`), 'grace',
      'the resolver survived the harness, not just the JPA cache');
  assert.equal(await sql('select count(*) from audit_entry'), '0', 'an incident writes no trail fact');
  assert.equal(await sql('select count(*) from webhook_delivery'), '0', 'an incident knocks on nothing');
  console.log(`[§6] psql read 4 rows in \`incident\` (1 resolved, resolved_by=grace), ZERO audit entries and ZERO webhook deliveries — this door writes its own table and nothing else`);

  // ── §7 teardown ─────────────────────────────────────────────────────────────────────────────────
  await stopService(serviceProcess);
  serviceProcess = null;
  const rm = await run('docker', ['rm', '-f', DB_CONTAINER]);
  assert.equal(rm.code, 0, `could not remove the throwaway database: ${rm.stderr}`);
  dbStarted = false;
  const goneContainer = await run('docker', ['ps', '-a', '--filter', `name=^/${DB_CONTAINER}$`, '--format', '{{.Names}}']);
  assert.equal(goneContainer.stdout.trim(), '', `the throwaway container is still listed: ${goneContainer.stdout.trim()}`);
  console.log(`[§7] teardown: the service process is gone and the throwaway container ${DB_CONTAINER} is removed`);

  console.log('\n[summary] M9: services/nexus-api BUILT and RAN against a real PostgreSQL · four incidents opened with 201 and exactly eleven fields, trimmed and open · the listing answered newest-first with count/total/limit/offset, an offset read the page that contains it, and status/severity narrowed BOTH counts (4→3 open, 1 resolved, 1 high-resolved, 0 of 0 open-high) · one id read back byte for byte and an unknown id answered 404 unknown-incident · one resolve answered 200, the second 409 already-resolved with the first resolver intact, and five broken openings plus two broken filters answered 400 invalid-incident · a STOP/START left all four rows and the one resolve in place · psql read 4 incident rows, 0 audit entries and 0 webhook deliveries');
  rmSync(BUILD_DIR, { recursive: true, force: true });
  console.log('[m9-incident-proof] ALL ASSERTIONS PASSED (an incident is a record with a life: opened with the opener\'s words, read in a window that names what it hid, closed once — and a second close is refused, not a silent overwrite)');
} finally {
  if (serviceProcess && serviceProcess.exitCode === null) {
    await stopService(serviceProcess);
  }
  if (dbStarted) await run('docker', ['rm', '-f', DB_CONTAINER]);
}
