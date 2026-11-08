// NEXUS M9 — LIVENESS IS NOT READINESS: one process fact, one pool fact, two doors. This proof builds the
// service, starts it against a throwaway PostgreSQL, reads `/health/live` and `/health/ready`, STOPS the
// database under the running process, and measures BOTH doors in the same outage: `/health/live` must keep
// answering 200 in well under a second, while `/health/ready` answers 503 after the pool's own borrow bound
// (Hikari's 30 s connectionTimeout). Then it starts the database again and reads the recovery.
//
// Why the split is a separate fact and not a URL alias:
//   a supervisor that restarts a process when the DATABASE is down restarts a healthy process and repairs
//   nothing. `/health` (v582) answers both facts with one status code, which is right for a caller asking
//   "can I use this service?" and wrong for a supervisor asking "is this process alive?". `/health/live`
//   therefore NEVER borrows a connection — its absence of a `database` field is the claim — and
//   `/health/ready` carries the measurement and the operator's `ready` word.
//
// What it proves, clause by clause:
//   §0 the tools this proof needs (Java 25, Docker) are present BEFORE anything is started;
//   §1 the service BUILDS and STARTS, and `/health/live` answers 200 with exactly the process shape —
//      service, the version the POM declares (read from the packaged jar), startedAt, uptimeSeconds — NO
//      `database` field, and `Cache-Control: no-store`;
//   §2 `/health/ready` answers 200 with `ready=true` and a reachable database (no `detail`), the same
//      `startedAt` as `/health/live`, and `/health` still answers 200 — the doors agree on the process;
//   §3 the database is STOPPED under the running process: `/health/live` still answers 200 in under 2 s
//      with the same `startedAt`, while `/health/ready` answers 503 with `ready=false` and a SHORT reason
//      token after the pool's own bound — measured, not assumed — and neither body carries a JDBC URL,
//      host, password, message or stack trace;
//   §4 the database is STARTED again: `/health/ready` returns to 200 with `detail` gone and `ready=true`,
//      `/health/live` still answers the SAME `startedAt` with a larger uptime, and psql reads ZERO audit
//      entries, ZERO webhook deliveries and ZERO `health%` tables — the split added no state and no write;
//   §5 teardown.
//
// The honest bound, stated rather than hidden: liveness proves the HTTP stack and this bean run; it does
// NOT prove the JVM's threads are healthy, that memory is available or that a request needing the database
// can succeed — that is readiness's job. Readiness still waits for Hikari's `connectionTimeout` when the
// pool holds no usable connection: the proof measures that wait instead of racing it with a second timer.
//
// Requires: Java 25, Maven, and a running Docker daemon. Run:  node docs/evidence/m9/service-liveness-proof.mjs
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
import { javaRecordFields, javaRecordDuplicateFields } from './wire-fields.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// THREE levels up: docs/evidence/m9/service-liveness-proof.mjs -> the repository root.
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SERVICE_DIR = process.env.NEXUS_SERVICE_DIR
  ? path.resolve(process.env.NEXUS_SERVICE_DIR)
  : path.join(REPO_ROOT, 'services/nexus-api');
const DB_IMAGE = 'pgvector/pgvector:pg16';
const STAMP = `${Date.now()}-${process.pid}`;
const BUILD_DIR = path.join(tmpdir(), `nexus-liveness-proof-build-${STAMP}`);
const JAR = path.join(BUILD_DIR, 'target/nexus-api-0.1.0-SNAPSHOT.jar');

const DB_CONTAINER = `nexus-liveness-db-${STAMP}`;
const DB_NAME = 'nexus';
const DB_USER = 'nexus';
const DB_PASSWORD = 'nexus';
const PORT_FILE = path.join(tmpdir(), `nexus-liveness-port-${STAMP}.txt`);

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

/** The shapes, pinned: a field added here is a fact these doors would start claiming. */
const LIVENESS_FIELDS = ['service', 'startedAt', 'uptimeSeconds', 'version'].sort();
const READINESS_FIELDS = ['database', 'ready'].sort();
const REACHABLE_DATABASE_FIELDS = ['latencyMs', 'reachable'].sort();
const UNREACHABLE_DATABASE_FIELDS = ['detail', 'latencyMs', 'reachable'].sort();

// §0a static wire contract: the Java DTOs must declare the fields these doors expect.
{
  const HEALTH_DTO = path.join(SERVICE_DIR, 'src/main/java/dev/nexus/api/status/HealthDtos.java');
  const liveWire = javaRecordFields(HEALTH_DTO, 'Liveness').map((f) => f.name).sort();
  assert.deepEqual(liveWire, LIVENESS_FIELDS, `HealthDtos.Liveness wire fields ${JSON.stringify(liveWire)} disagree with expected ${JSON.stringify(LIVENESS_FIELDS)}`);
  const readyWire = javaRecordFields(HEALTH_DTO, 'Readiness').map((f) => f.name).sort();
  assert.deepEqual(readyWire, READINESS_FIELDS, `HealthDtos.Readiness wire fields ${JSON.stringify(readyWire)} disagree with expected ${JSON.stringify(READINESS_FIELDS)}`);
  const dbWire = javaRecordFields(HEALTH_DTO, 'Database').map((f) => f.name).sort();
  assert.deepEqual(dbWire, UNREACHABLE_DATABASE_FIELDS, `HealthDtos.Database wire fields ${JSON.stringify(dbWire)} disagree with expected ${JSON.stringify(UNREACHABLE_DATABASE_FIELDS)}`);
  console.log(`[§0a] static wire contract: Liveness/Readiness/Database DTO fields match the shapes this proof grades (${liveWire.length}+${readyWire.length}+${dbWire.length} fields read from source)`);
}
// §0b a record that declares a field twice cannot be read: the reader keeps both, the pinned list would
// mis-grade, and a rename would silently land on the second declaration. The same defect class the trail,
// traffic and health lanes caught, now over the readiness family's records.
{
  const HEALTH_DTO = path.join(SERVICE_DIR, 'src/main/java/dev/nexus/api/status/HealthDtos.java');
  for (const record of ['Liveness', 'Readiness', 'Database']) {
    const dupes = javaRecordDuplicateFields(HEALTH_DTO, record);
    assert.deepEqual(dupes, [], `HealthDtos.${record} declares duplicate field(s): ${dupes.join(', ')} — the reader keeps both and the pinned list would mis-grade`);
  }
  console.log('[§0b] HealthDtos readiness-family records declare no duplicated field names');
}

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
  console.log(`[m9] the POM declares version ${projectVersion} — liveness is expected to answer THAT, not a literal`);

  rmSync(BUILD_DIR, { recursive: true, force: true });
  mkdirSync(BUILD_DIR, { recursive: true });
  cpSync(path.join(SERVICE_DIR, 'pom.xml'), path.join(BUILD_DIR, 'pom.xml'));
  cpSync(path.join(SERVICE_DIR, 'src'), path.join(BUILD_DIR, 'src'), { recursive: true });
  const build = await runMaven(['-B', '-q', 'package', '-DskipTests'], { cwd: BUILD_DIR, timeoutMs: 600_000 });
  assert.equal(build.code, 0, `mvn package failed:\n${build.stdout}\n${build.stderr}`);
  assert.ok(existsSync(JAR), `the build produced no jar at ${JAR}`);
  console.log(`[m9] built ${path.relative(REPO_ROOT, JAR)}`);

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

  rmSync(PORT_FILE, { force: true });
  const child = spawn('java', [
    '-jar', JAR,
    '--server.port=0',
    `--spring.datasource.url=jdbc:postgresql://127.0.0.1:${dbPort}/${DB_NAME}`,
    `--spring.datasource.username=${DB_USER}`,
    `--spring.datasource.password=${DB_PASSWORD}`,
    `--nexus.port-file=${PORT_FILE}`,
  ], { cwd: BUILD_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
  serviceProcess = child;
  let log = '';
  child.stdout.on('data', (d) => { log += String(d); });
  child.stderr.on('data', (d) => { log += String(d); });

  let apiPort = null;
  const up = await until(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return false;
    if (apiPort === null) {
      if (!existsSync(PORT_FILE)) return false;
      const reported = Number(readFileSync(PORT_FILE, 'utf8').trim());
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
  const base = `http://127.0.0.1:${apiPort}`;
  console.log(`[m9] nexus-api answering on ${base}`);

  /** One HTTP call, parsed, with the headers a cache rule is read from and the wall time it took. */
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

  async function sql(query) {
    const r = await run('docker', ['exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-tAc', query]);
    assert.equal(r.code, 0, `psql failed: ${r.stderr}`);
    return r.stdout.trim();
  }

  // ── §1 liveness: the process fact, and the ABSENCE of the database fact ──────────────────────────
  const live = await call('/health/live');
  assert.equal(live.status, 200, `a running process must answer liveness 200, got ${live.status}: ${live.text}`);
  assert.match(live.headers.get('content-type') ?? '', /application\/json/, 'liveness answers JSON');
  assert.equal(live.headers.get('cache-control'), 'no-store', 'an uptime served from a cache is a past fact');
  assert.ok(live.body && typeof live.body === 'object', `the body must be a JSON object, got: ${live.text}`);
  assert.deepEqual(Object.keys(live.body).sort(), LIVENESS_FIELDS,
      `liveness carries exactly ${LIVENESS_FIELDS.join('/')}, got ${JSON.stringify(Object.keys(live.body))}`);
  assert.equal(live.body.service, 'nexus-api');
  assert.equal(live.body.version, projectVersion,
      `the packaged jar must answer the version the POM declares, not "unknown" or a literal — got ${JSON.stringify(live.body.version)}`);
  assert.match(live.body.startedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
      `startedAt must be an ISO-8601 UTC instant, got ${live.body.startedAt}`);
  assert.ok(Number.isFinite(Date.parse(live.body.startedAt)), 'startedAt must parse');
  assert.ok(Date.parse(live.body.startedAt) <= Date.now(), 'startedAt cannot be in the future');
  assert.ok(Number.isInteger(live.body.uptimeSeconds) && live.body.uptimeSeconds >= 0,
      `uptimeSeconds must be a whole, non-negative number, got ${live.body.uptimeSeconds}`);
  const uptimeFromWall = Math.floor((Date.now() - Date.parse(live.body.startedAt)) / 1000);
  assert.ok(Math.abs(uptimeFromWall - live.body.uptimeSeconds) <= 3,
      `uptimeSeconds (${live.body.uptimeSeconds}) must agree with startedAt (${live.body.startedAt}) — wall says ${uptimeFromWall}`);
  console.log(`[§1] /health/live answered 200 in ${live.elapsedMs} ms: service "nexus-api" · version "${live.body.version}" (the POM's own) · startedAt ${live.body.startedAt} · uptime ${live.body.uptimeSeconds}s · NO database field · Cache-Control: no-store`);

  // ── §2 readiness and the combined door, with the database up ────────────────────────────────────
  const ready = await call('/health/ready');
  assert.equal(ready.status, 200, `a reachable database must answer readiness 200, got ${ready.status}: ${ready.text}`);
  assert.equal(ready.headers.get('cache-control'), 'no-store', 'readiness is no more cacheable than liveness');
  assert.ok(ready.body && typeof ready.body === 'object', `the body must be a JSON object, got: ${ready.text}`);
  assert.deepEqual(Object.keys(ready.body).sort(), READINESS_FIELDS,
      `readiness carries exactly ${READINESS_FIELDS.join('/')}, got ${JSON.stringify(Object.keys(ready.body))}`);
  assert.equal(ready.body.ready, true, 'the database the service is connected to answers');
  assert.equal(ready.body.database.reachable, true);
  assert.ok(Number.isInteger(ready.body.database.latencyMs) && ready.body.database.latencyMs >= 0,
      `latencyMs must be a whole, non-negative number, got ${ready.body.database.latencyMs}`);
  assert.deepEqual(Object.keys(ready.body.database).sort(), REACHABLE_DATABASE_FIELDS,
      `a reachable database carries no detail, got ${JSON.stringify(Object.keys(ready.body.database))}`);

  const combined = await call('/health');
  assert.equal(combined.status, 200, `the combined door still answers 200, got ${combined.status}`);
  assert.equal(combined.body.startedAt, live.body.startedAt, 'the doors name the SAME process');
  console.log(`[§2] /health/ready answered 200: ready=true · database reachable in ${ready.body.database.latencyMs} ms with NO detail · /health still 200 · both doors name startedAt ${live.body.startedAt}`);

  // ── §3 the database STOPS: liveness stays fast, readiness fails slowly, and neither leaks ─────────
  const stopped = await run('docker', ['stop', DB_CONTAINER]);
  assert.equal(stopped.code, 0, `could not stop the throwaway database: ${stopped.stderr}`);
  const databaseGone = await until(async () => !(await canConnect(dbPort)), { tries: 30, gapMs: 500, label: 'the database port to stop accepting' });
  assert.ok(databaseGone, 'docker stop returned but the host port still accepts a connection');

  // ORDER MATTERS: liveness is measured FIRST, so it cannot be excused by a warm failure path.
  const liveDuringOutage = await call('/health/live');
  assert.equal(liveDuringOutage.status, 200,
      `liveness must answer 200 while the database is DOWN, got ${liveDuringOutage.status}: ${liveDuringOutage.text}`);
  assert.equal(liveDuringOutage.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys(liveDuringOutage.body).sort(), LIVENESS_FIELDS,
      `the outage changes nothing about liveness's shape, got ${JSON.stringify(Object.keys(liveDuringOutage.body))}`);
  assert.equal(liveDuringOutage.body.startedAt, live.body.startedAt, 'the same process answered both reads');
  assert.ok(liveDuringOutage.body.uptimeSeconds >= live.body.uptimeSeconds, 'uptime cannot go backwards');
  // The claim that makes the split worth two doors: liveness did not wait behind the pool's 30 s borrow.
  assert.ok(liveDuringOutage.elapsedMs < 2000,
      `liveness must NOT wait for the pool: measured ${liveDuringOutage.elapsedMs} ms while the database was down`);
  console.log(`[§3a] with the database STOPPED, /health/live still answered 200 in ${liveDuringOutage.elapsedMs} ms (no borrow, no database field, the SAME startedAt) — a supervisor reads THIS door`);

  const outage = await call('/health/ready');
  assert.equal(outage.status, 503,
      `readiness must answer 503 while the database is down, got ${outage.status}: ${outage.text}`);
  assert.equal(outage.headers.get('cache-control'), 'no-store', 'a failure is no more cacheable than a success');
  assert.deepEqual(Object.keys(outage.body).sort(), READINESS_FIELDS,
      `the failing answer keeps the same shape, got ${JSON.stringify(Object.keys(outage.body))}`);
  assert.equal(outage.body.ready, false);
  assert.equal(outage.body.database.reachable, false);
  assert.ok(Number.isInteger(outage.body.database.latencyMs) && outage.body.database.latencyMs >= 0,
      `a failure is still a measurement, got ${outage.body.database.latencyMs}`);
  assert.deepEqual(Object.keys(outage.body.database).sort(), UNREACHABLE_DATABASE_FIELDS,
      `an unreachable database must NAME its reason, got ${JSON.stringify(Object.keys(outage.body.database))}`);
  const detail = outage.body.database.detail;
  assert.ok(typeof detail === 'string' && detail.length > 0, `a failure must name a reason, got ${JSON.stringify(detail)}`);
  // Same reader defect as service-health-proof: the producer declares two token shapes ("invalid-connection",
  // or an exception's simple name) and only the second was admitted, so this row passed on the box that saw a
  // PSQLException and reddened on the runner that saw the constant. ASCII-only comment, because the writer
  // channel this repository's records damage through is the one verify:record-encoding grades.
  assert.match(detail, /^[A-Za-z_$][A-Za-z0-9_$.-]*$/,
      `the reason must be a short token (an exception's simple name or invalid-connection), got ${JSON.stringify(detail)}`);
  assert.ok(detail.length <= 64, `the reason is ${detail.length} characters, not a short token: ${JSON.stringify(detail)}`);
  for (const forbidden of ['jdbc:', 'postgresql', '127.0.0.1', 'password', 'connection refused', 'message', 'stack', ' at ']) {
    assert.equal(outage.text.includes(forbidden), false,
        `the unauthenticated body must not carry ${JSON.stringify(forbidden)}: ${outage.text}`);
  }
  assert.ok(outage.elapsedMs >= 25_000,
      `readiness is bounded by the pool's OWN borrow, measured >= 25 s; this call returned in ${outage.elapsedMs} ms, which would mean a second timer answered instead`);
  assert.ok(outage.elapsedMs < 120_000, `readiness must not exceed the proof's own ceiling, took ${outage.elapsedMs} ms`);
  console.log(`[§3b] with the database STOPPED, /health/ready answered 503 after ${outage.elapsedMs} ms (Hikari's own borrow bound): ready=false · reachable=false · detail "${detail}" (a token, not a message) · no JDBC URL, host, password, message or stack trace — a load balancer reads THIS door`);

  // ── §4 the database STARTS again: the same process recovers, and nothing was written ─────────────
  const restartedDb = await run('docker', ['start', DB_CONTAINER]);
  assert.equal(restartedDb.code, 0, `could not restart the throwaway database: ${restartedDb.stderr}`);
  const databaseBack = await until(() => canConnect(dbPort), { tries: 30, gapMs: 500, label: 'the database port to accept again' });
  assert.ok(databaseBack, 'docker start returned but the host port never accepted a connection');

  let recovered = null;
  const back = await until(async () => {
    const answer = await call('/health/ready');
    if (answer.status === 200) {
      recovered = answer;
      return true;
    }
    return false;
  }, { tries: 10, gapMs: 1000, label: '/health/ready to return to 200 without restarting the service' });
  assert.ok(back && recovered, 'readiness never recovered after the database returned');
  assert.equal(recovered.body.ready, true);
  assert.equal(recovered.body.database.reachable, true);
  assert.deepEqual(Object.keys(recovered.body.database).sort(), REACHABLE_DATABASE_FIELDS,
      `recovery carries no detail, got ${JSON.stringify(Object.keys(recovered.body.database))}`);

  const liveAfter = await call('/health/live');
  assert.equal(liveAfter.status, 200);
  assert.equal(liveAfter.body.startedAt, live.body.startedAt,
      'the service was NOT restarted: the startedAt instant is the same process');
  assert.ok(liveAfter.body.uptimeSeconds > liveDuringOutage.body.uptimeSeconds,
      `uptime must have grown through the outage (${liveDuringOutage.body.uptimeSeconds}s → ${liveAfter.body.uptimeSeconds}s)`);
  assert.ok(liveAfter.elapsedMs < 2000, `recovered liveness must still be fast, took ${liveAfter.elapsedMs} ms`);

  assert.equal(await sql('select count(*) from audit_entry'), '0', 'the split records no trail fact');
  assert.equal(await sql('select count(*) from webhook_delivery'), '0', 'the split knocks on nothing');
  assert.equal(await sql("select count(*) from information_schema.tables where table_name like 'health%'"), '0',
      'the split stores no state: no health table, no probe history');
  console.log(`[§4] after the database returned, /health/ready answered 200 again (ready=true, NO detail) and /health/live still answered the SAME startedAt ${live.body.startedAt}, uptime ${liveDuringOutage.body.uptimeSeconds}s → ${liveAfter.body.uptimeSeconds}s in ${liveAfter.elapsedMs} ms — the process never restarted · psql read ZERO audit entries, ZERO deliveries and ZERO health tables`);

  // ── §5 teardown ────────────────────────────────────────────────────────────────────────────────
  await stopService(serviceProcess);
  serviceProcess = null;
  const rm = await run('docker', ['rm', '-f', DB_CONTAINER]);
  assert.equal(rm.code, 0, `could not remove the throwaway database: ${rm.stderr}`);
  dbStarted = false;
  const goneContainer = await run('docker', ['ps', '-a', '--filter', `name=^/${DB_CONTAINER}$`, '--format', '{{.Names}}']);
  assert.equal(goneContainer.stdout.trim(), '', `the throwaway container is still listed: ${goneContainer.stdout.trim()}`);
  console.log(`[§5] teardown: the service process is gone and the throwaway container ${DB_CONTAINER} is removed`);

  console.log('\n[summary] M9: services/nexus-api BUILT and RAN against a real PostgreSQL · /health/live answered 200 with service/version (the POM\'s own)/startedAt/uptimeSeconds and NO database field · /health/ready answered 200 with ready=true and a reachable database with no detail · with the database stopped under the running process, /health/live still answered 200 in under 2 s while /health/ready answered 503 after Hikari\'s own 30 s borrow with ready=false and a short token, neither leaking a JDBC URL, host, password, message or stack trace · with the database started again the SAME process recovered (ready=true, detail gone, the same startedAt, a larger uptime) and wrote nothing');
  rmSync(BUILD_DIR, { recursive: true, force: true });
  console.log('[m9-service-liveness-proof] ALL ASSERTIONS PASSED (liveness is not readiness: the process fact answers during the outage and does not wait behind the pool, the pool fact fails slowly and names why, and both doors name the same process)');
} finally {
  if (serviceProcess && serviceProcess.exitCode === null) {
    await stopService(serviceProcess);
  }
  if (dbStarted) await run('docker', ['rm', '-f', DB_CONTAINER]);
}
