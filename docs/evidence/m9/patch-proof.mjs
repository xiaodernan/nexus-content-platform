// NEXUS M9 — A PATCH IS THE BYTES AN AUTHOR WROTE, ATTACHED TO ONE INCIDENT: `POST /incidents/{id}/patches`
// stores a proposed change, `GET /incidents/{id}/patches` reads the incident's newest window with both
// counts beside it, and `GET /patches/{id}` reads one proposal with its bytes. This proof builds the service,
// starts it against a throwaway PostgreSQL, opens an incident, attaches THREE proposals (one with leading
// context spaces and tabs, one a real unified diff, one minimal), asserts the exact eight-field shape, reads
// the window back and checks its order and both counts, reads one patch byte for byte, refuses an unknown
// parent, a blank title, a whitespace-only diff and a diff over the column, STOPS the service and STARTS it
// again against the same database, and asks psql what the doors wrote.
//
// Why this is the second word of M9's chain and not a patcher:
//   M9's row reads "incident→patch→PR→approve→deploy". A patch here is a RECORD: the service stores the
//   bytes and never parses them, never checks that the diff is well formed, never applies it, and never
//   asks a tree whether it fits. Those are facts about a repository this service does not own. What it
//   can defend is the record: these bytes, this title, this author, this incident, this instant.
//
// Why the diff is not trimmed:
//   A diff's leading spaces are context lines and its trailing newline is part of the format. Trimming
//   would edit the bytes the author vouched for, and a record that silently edits what it records is
//   worse than one that refuses it. The proof sends a diff with leading spaces, a tab, and two trailing
//   newlines, and asserts the read-back is character for character the same string.
//
// Why a patch does not require an open incident:
//   A patch is a proposal, not a transition. The fix for what happened can arrive after the incident was
//   resolved, and refusing it then would make the record's state cheaper than the work. This slice does
//   not read the incident's status at all; the later words (a PR, an approval, a deployment) will.
//
// What it proves, clause by clause:
//   §0 the tools this proof needs (Java 25, Docker) are present BEFORE anything is started;
//   §1 the service BUILDS and STARTS; one incident and three patches are opened (201) with exactly eight
//      fields, status=proposed, and the diff exactly as sent;
//   §2 the listing answers the incident's newest window first with count/total/limit/offset; a second page
//      is rows 3..3 of the same listing; an incident with no patches answers 0 of 0, and an id that names
//      no incident answers 404 unknown-incident rather than an empty window;
//   §3 one patch reads back byte for byte, and an id that names nothing is 404 unknown-patch;
//   §4 an unknown parent is 404 unknown-incident; a blank title, a whitespace-only diff and a diff over the
//      column are 400 invalid-patch with the rule named;
//   §5 the service is STOPPED and STARTED against the same database: the three proposals, their order and
//      the bytes are still there — a patch is a row, not a buffer;
//   §6 psql reads three rows, all proposed, the diff's length intact, ZERO audit entries and ZERO deliveries;
//   §7 teardown.
//
// The honest bounds, stated rather than hidden: no status other than `proposed` is written, so nothing
// here is reviewed, approved or deployed; no patch is applied or validated; no patch may be edited, deleted
// or superseded (a second attempt is simply a second patch); no incident is required to be open; no
// authentication (ADR 0018), so anyone who can reach the door may propose or read. The chain's later words
// are absent on purpose, and a door that looked like them and did nothing would be worse than no door.
//
// Requires: Java 25, Maven, and a running Docker daemon. Run:  node docs/evidence/m9/patch-proof.mjs
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
// THREE levels up: docs/evidence/m9/patch-proof.mjs -> the repository root.
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SERVICE_DIR = process.env.NEXUS_SERVICE_DIR
  ? path.resolve(process.env.NEXUS_SERVICE_DIR)
  : path.join(REPO_ROOT, 'services/nexus-api');
const DB_IMAGE = 'pgvector/pgvector:pg16';
const STAMP = `${Date.now()}-${process.pid}`;
const BUILD_DIR = path.join(tmpdir(), `nexus-patch-proof-build-${STAMP}`);
const JAR = path.join(BUILD_DIR, 'target/nexus-api-0.1.0-SNAPSHOT.jar');

const DB_CONTAINER = `nexus-patch-db-${STAMP}`;
const DB_NAME = 'nexus';
const DB_USER = 'nexus';
const DB_PASSWORD = 'nexus';
const PORT_FILE = path.join(tmpdir(), `nexus-patch-port-${STAMP}.txt`);
const PORT_FILE_SECOND = path.join(tmpdir(), `nexus-patch-port2-${STAMP}.txt`);

const SERVICE_START_TRIES = 180;

const DIFF_ONE = '  context line\n\tdetail line\n\n';
const DIFF_TWO = '--- a/ledger.txt\n+++ b/ledger.txt\n@@ -1 +1 @@\n-drifted\n+clamped\n';
const DIFF_THREE = '+warn "ledger drift" >&2\n';

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
  'author', 'createdAt', 'diff', 'id', 'incidentId', 'status', 'summary', 'title'
].sort();
const LIST_FIELDS = ['count', 'limit', 'offset', 'patches', 'total'].sort();
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
   * The patch's shape, pinned on every answer: eight fields, the bytes a string that is not blank, the
   * status the only word this slice writes, and the incident it names.
   */
  function assertRecordShape(record, clue, expectedIncidentId) {
    assert.ok(record && typeof record === 'object', `${clue}: a patch must be a JSON object, got ${JSON.stringify(record)}`);
    assert.deepEqual(Object.keys(record).sort(), RECORD_FIELDS,
        `${clue}: a patch carries exactly ${RECORD_FIELDS.join('/')}, got ${JSON.stringify(Object.keys(record))}`);
    assert.ok(typeof record.id === 'string' && record.id.length > 0, `${clue}: id must be a non-empty string`);
    assert.ok(typeof record.incidentId === 'string' && record.incidentId.length > 0,
        `${clue}: incidentId must be a non-empty string`);
    if (expectedIncidentId !== undefined) {
      assert.equal(record.incidentId, expectedIncidentId, `${clue}: the patch must name the incident it was filed against`);
    }
    assert.ok(typeof record.title === 'string' && record.title.length > 0, `${clue}: title must be a non-empty string`);
    assert.ok(typeof record.diff === 'string' && record.diff.trim().length > 0,
        `${clue}: diff must be a string with non-whitespace bytes, got ${JSON.stringify(record.diff)}`);
    for (const field of ['summary', 'author']) {
      assert.ok(record[field] === null || typeof record[field] === 'string',
          `${clue}: ${field} must be null or a string, got ${JSON.stringify(record[field])}`);
    }
    assert.equal(record.status, PROPOSED, `${clue}: this slice writes only ${PROPOSED}`);
    assert.ok(Number.isInteger(record.createdAt) && record.createdAt >= 0,
        `${clue}: createdAt must be an epoch-millisecond integer, got ${JSON.stringify(record.createdAt)}`);
  }

  /** Newest first, and the tie-break the repository states: createdAt desc, then patch id desc. */
  function assertNewestFirst(records, clue) {
    for (let i = 1; i < records.length; i++) {
      const newer = records[i - 1];
      const older = records[i];
      assert.ok(newer.createdAt >= older.createdAt,
          `${clue}: row ${i} (${newer.createdAt}) must not be older than row ${i + 1} (${older.createdAt})`);
      if (newer.createdAt === older.createdAt) {
        assert.ok(newer.id > older.id,
            `${clue}: proposals written at the same instant must break the tie by id DESC, got ${newer.id} then ${older.id}`);
      }
    }
  }

  function assertListShape(list, clue) {
    assert.ok(list && typeof list === 'object', `${clue}: a listing must be a JSON object`);
    assert.deepEqual(Object.keys(list).sort(), LIST_FIELDS,
        `${clue}: a listing carries exactly ${LIST_FIELDS.join('/')}, got ${JSON.stringify(Object.keys(list))}`);
    assert.ok(Array.isArray(list.patches), `${clue}: patches must be an array`);
    assert.equal(list.count, list.patches.length, `${clue}: count must be what this answer carried`);
    assert.ok(Number.isInteger(list.total) && list.total >= 0, `${clue}: total must be a non-negative integer`);
    assert.ok(Number.isInteger(list.limit) && list.limit >= 1 && list.limit <= 100,
        `${clue}: limit must be the applied cap in 1..100, got ${JSON.stringify(list.limit)}`);
    assert.ok(Number.isInteger(list.offset) && list.offset >= 0,
        `${clue}: offset must be the applied skip, got ${JSON.stringify(list.offset)}`);
    for (const record of list.patches) assertRecordShape(record, clue);
    assertNewestFirst(list.patches, clue);
  }

  // ── §1 one incident, three proposals, each 201 and eight fields ─────────────────────────────────
  const incidentAnswer = await post('/incidents', {
    title: 'the credits ledger drifted',
    severity: 'high',
    openedBy: 'acct-ada',
  });
  assert.equal(incidentAnswer.status, 201, `the parent incident must be opened, got ${incidentAnswer.status}: ${incidentAnswer.text}`);
  const incidentId = incidentAnswer.body.id;
  assert.ok(typeof incidentId === 'string' && incidentId.length > 0, 'the parent incident must carry an id');

  const secondIncidentAnswer = await post('/incidents', {
    title: 'an incident with no proposals',
    severity: 'low',
  });
  assert.equal(secondIncidentAnswer.status, 201);
  const emptyIncidentId = secondIncidentAnswer.body.id;

  const proposals = [
    {
      body: {
        title: '  clamp the drift at read time  ',
        summary: '  the ledger is corrected when it is read, not rewritten  ',
        diff: DIFF_ONE,
        author: '  acct-ada  ',
      },
      expect: { title: 'clamp the drift at read time', summary: 'the ledger is corrected when it is read, not rewritten', author: 'acct-ada', diff: DIFF_ONE },
    },
    {
      body: {
        title: 'backfill the ledger',
        diff: DIFF_TWO,
        author: 'acct-grace',
      },
      expect: { title: 'backfill the ledger', summary: null, author: 'acct-grace', diff: DIFF_TWO },
    },
    {
      body: { title: 'warn instead of fail', diff: DIFF_THREE },
      expect: { title: 'warn instead of fail', summary: null, author: null, diff: DIFF_THREE },
    },
  ];
  const opened = [];
  for (const proposal of proposals) {
    const answer = await post(`/incidents/${incidentId}/patches`, proposal.body);
    assert.equal(answer.status, 201, `proposing must answer 201, got ${answer.status}: ${answer.text}`);
    assertRecordShape(answer.body, `§1 ${proposal.body.title}`, incidentId);
    for (const field of ['title', 'summary', 'author', 'diff']) {
      assert.equal(answer.body[field], proposal.expect[field], `§1 ${field} must be what the author wrote`);
    }
    opened.push(answer.body);
  }
  console.log(`[§1] one incident opened and three proposals filed with 201 and exactly eight fields each · titles, summaries and authors trimmed; diffs byte-for-byte (leading spaces, a tab and two trailing newlines survived) · ids ${opened.map((row) => row.id.slice(0, 8)).join(' ')}`);

  // ── §2 the window, its order, both counts, and what an empty parent means ───────────────────────
  const all = await call(`/incidents/${incidentId}/patches`);
  assert.equal(all.status, 200, `a listing must answer 200, got ${all.status}: ${all.text}`);
  assertListShape(all.body, '§2 all');
  assert.equal(all.body.total, 3, `the incident holds three proposals, got ${all.body.total}`);
  assert.equal(all.body.limit, 20, 'the default window is twenty');
  assert.equal(all.body.offset, 0, 'no offset was asked for');

  const pageTwo = await call(`/incidents/${incidentId}/patches?limit=2&offset=2`);
  assert.equal(pageTwo.status, 200);
  assertListShape(pageTwo.body, '§2 second page');
  assert.equal(pageTwo.body.count, 1, 'three proposals over a window of two leaves one on the second page');
  assert.equal(pageTwo.body.total, 3, 'the second page still knows the incident holds three');
  assert.equal(pageTwo.body.limit, 2);
  assert.equal(pageTwo.body.offset, 2);
  assert.deepEqual(pageTwo.body.patches.map((row) => row.id), all.body.patches.slice(2).map((row) => row.id),
      'the second page must be the third row of the first listing');

  const empty = await call(`/incidents/${emptyIncidentId}/patches`);
  assert.equal(empty.status, 200, 'an incident with no proposals is still an incident');
  assertListShape(empty.body, '§2 empty');
  assert.equal(empty.body.count, 0, 'no proposals were filed against it');
  assert.equal(empty.body.total, 0);

  const unknownParent = await call('/incidents/not-a-real-id/patches');
  assert.equal(unknownParent.status, 404, `a listing for an unknown incident must be 404, got ${unknownParent.status}: ${unknownParent.text}`);
  assert.equal(unknownParent.body.error, 'unknown-incident');
  console.log(`[§2] GET /incidents/{id}/patches answered 3 of 3 newest first at limit 20 offset 0 · limit=2&offset=2 answered the third row only · the incident with no proposals answered 0 of 0, and an id that names no incident answered 404 ${unknownParent.body.error} instead of an empty window`);

  // ── §3 one patch reads back byte for byte, an id that names nothing is 404 ──────────────────────
  const readBack = await call(`/patches/${opened[0].id}`);
  assert.equal(readBack.status, 200, `reading a patch must answer 200, got ${readBack.status}: ${readBack.text}`);
  assertRecordShape(readBack.body, '§3', incidentId);
  assert.deepEqual(readBack.body, opened[0], 'a proposal must read back exactly as it was written, bytes included');
  assert.equal(readBack.body.diff, DIFF_ONE, 'the leading spaces, the tab and the trailing newlines survive');

  const missing = await call('/patches/not-a-real-id');
  assert.equal(missing.status, 404, `an unknown patch must answer 404, got ${missing.status}: ${missing.text}`);
  assert.equal(missing.body.error, 'unknown-patch');
  console.log(`[§3] GET /patches/${opened[0].id.slice(0, 8)}… answered 200 and the record read back byte for byte (${readBack.body.diff.length} characters, leading spaces and trailing newlines intact) · GET /patches/not-a-real-id answered 404 ${missing.body.error}`);

  // ── §4 refusals: an unknown parent, and three malformed proposals ──────────────────────────────
  const orphan = await post('/incidents/not-a-real-id/patches', { title: 'a fix', diff: '+one\n' });
  assert.equal(orphan.status, 404, `a proposal for an unknown incident must be 404, got ${orphan.status}: ${orphan.text}`);
  assert.equal(orphan.body.error, 'unknown-incident');

  const refusals = [
    { body: { title: '   ', diff: '+one\n' }, clue: 'a blank title', needle: 'title' },
    { body: { title: 'a fix', diff: '  \n\t \n' }, clue: 'a whitespace-only diff', needle: 'proposes nothing' },
    { body: { title: 'a fix', diff: '+'.repeat(20001) }, clue: 'a diff over the column', needle: '20000' },
  ];
  for (const refusal of refusals) {
    const answer = await post(`/incidents/${incidentId}/patches`, refusal.body);
    assert.equal(answer.status, 400, `${refusal.clue} must answer 400, got ${answer.status}: ${answer.text}`);
    assert.equal(answer.body.error, 'invalid-patch', `${refusal.clue} must name the token`);
    assert.ok(answer.body.message.includes(refusal.needle),
        `${refusal.clue} must name the rule (expected "${refusal.needle}"): ${answer.body.message}`);
  }
  const countAfterRefusals = await call(`/incidents/${incidentId}/patches`);
  assert.equal(countAfterRefusals.body.total, 3, 'refused proposals must not be stored');
  console.log(`[§4] a proposal for an unknown incident answered 404 ${orphan.body.error} · a blank title, a whitespace-only diff and a 20001-character diff answered 400 invalid-patch with the rule named · the incident still holds 3 proposals — refusals wrote nothing`);

  // ── §5 restart: the bytes are a row, not a buffer ──────────────────────────────────────────────
  await stopService(serviceProcess);
  serviceProcess = null;
  const second = await startService(PORT_FILE_SECOND);
  base = second.base;
  console.log(`[m9] restarted nexus-api on ${base}`);

  const afterRestart = await call(`/incidents/${incidentId}/patches`);
  assert.equal(afterRestart.status, 200, `a restarted service must answer the listing, got ${afterRestart.status}: ${afterRestart.text}`);
  assertListShape(afterRestart.body, '§5');
  assert.equal(afterRestart.body.total, 3, 'all three proposals survive the restart');
  assert.deepEqual(afterRestart.body.patches.map((row) => row.id), all.body.patches.map((row) => row.id),
      'the same three ids, in the same order, after the restart');
  const survived = await call(`/patches/${opened[0].id}`);
  assert.equal(survived.status, 200);
  assert.equal(survived.body.diff, DIFF_ONE, 'the diff survives the restart byte for byte');
  assert.equal(survived.body.createdAt, opened[0].createdAt, 'the recorded instant survives the restart');
  console.log(`[§5] stopped and started the service against the same database: the listing still answered 3 of 3 with the same ids in the same order, and the patch still carried its ${survived.body.diff.length} characters exactly`);

  // ── §6 psql: three rows, all proposed, the bytes intact, and nothing written elsewhere ─────────
  assert.equal(await sql('select count(*) from incident_patch'), '3', 'three rows must be in the patch table');
  assert.equal(await sql("select count(*) from incident_patch where status = 'proposed'"), '3',
      'this slice writes only proposed');
  assert.equal(await sql(`select length(patch_diff) from incident_patch where patch_id = '${opened[0].id}'`),
      String(DIFF_ONE.length), 'the stored diff is the bytes that were sent, neither trimmed nor padded');
  assert.equal(await sql('select count(*) from audit_entry'), '0', 'a proposal writes no trail fact');
  assert.equal(await sql('select count(*) from webhook_delivery'), '0', 'a proposal knocks on nothing');
  console.log(`[§6] psql read 3 rows in \`incident_patch\` (3 proposed, the first diff's ${DIFF_ONE.length} characters intact), ZERO audit entries and ZERO webhook deliveries — this door writes its own table and nothing else`);

  // ── §7 teardown ─────────────────────────────────────────────────────────────────────────────────
  await stopService(serviceProcess);
  serviceProcess = null;
  const rm = await run('docker', ['rm', '-f', DB_CONTAINER]);
  assert.equal(rm.code, 0, `could not remove the throwaway database: ${rm.stderr}`);
  dbStarted = false;
  const goneContainer = await run('docker', ['ps', '-a', '--filter', `name=^/${DB_CONTAINER}$`, '--format', '{{.Names}}']);
  assert.equal(goneContainer.stdout.trim(), '', `the throwaway container is still listed: ${goneContainer.stdout.trim()}`);
  console.log(`[§7] teardown: the service process is gone and the throwaway container ${DB_CONTAINER} is removed`);

  console.log('\n[summary] M9: services/nexus-api BUILT and RAN against a real PostgreSQL · one incident and three proposals with 201 and exactly eight fields, diffs byte-for-byte with context spaces, a tab and trailing newlines intact · the listing answered 3 of 3 newest-first with count/total/limit/offset, page two = the third row, the empty incident 0 of 0 and an unknown parent 404 unknown-incident · one patch read back byte for byte · a blank title, a whitespace-only diff and a 20001-character diff answered 400 invalid-patch, an orphan proposal 404 unknown-incident, and refusals stored nothing · a STOP/START left all three rows, their order and their bytes in place · psql read 3 patch rows (all proposed, length intact), 0 audit entries and 0 webhook deliveries');
  rmSync(BUILD_DIR, { recursive: true, force: true });
  console.log('[m9-patch-proof] ALL ASSERTIONS PASSED (a patch is the bytes an author wrote, attached to one incident: stored verbatim, refused rather than cut, read in a window that names what it hid — and never applied, parsed or deployed)');
} finally {
  if (serviceProcess && serviceProcess.exitCode === null) {
    await stopService(serviceProcess);
  }
  if (dbStarted) await run('docker', ['rm', '-f', DB_CONTAINER]);
}
