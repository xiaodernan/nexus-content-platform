// NEXUS M9 — THE PROCESS'S OWN NUMBERS: `GET /health/vitals` reports what the JVM says about itself, as a
// SAMPLE rather than a history. This proof builds the service, starts it against a throwaway PostgreSQL,
// pins the six-number shape, STOPS the database under the running process and reads vitals again (it must
// stay 200 and fast — it reads no database), STARTS the database, and reads psql for writes.
//
// Why this is a separate door and not a field on `/health`:
//   `/health` answers whether this process can SERVE — a fact about the world. Vitals answers what this
//   process IS USING — a fact about the JVM. A serving decision must not depend on a heap number (a nearly
//   full heap is an alert, not a 503), and a heap number must not be withheld because the database is down.
//   The two facts therefore have different doors, different status rules and different audiences.
//
// What it proves, clause by clause:
//   §0 the tools this proof needs (Java 25, Docker) are present BEFORE anything is started;
//   §1 the service BUILDS and STARTS, and `/health/vitals` answers 200 with exactly six integers — heap
//      used/committed/max, live/peak threads, processors — under `Cache-Control: no-store`, with the
//      invariants the JDK promises (used and committed non-negative, max positive or -1, peak >= live,
//      processors >= 1);
//   §2 the database is STOPPED under the running process: `/health/vitals` still answers 200 in under 2 s
//      with the same shape — it borrows no connection — while `/health/live` still answers 200; psql cannot
//      be asked (the database is down), which is the point;
//   §3 the database is STARTED again: `/health/vitals` still answers 200, psql reads ZERO audit entries,
//      ZERO webhook deliveries and ZERO `health%` tables — vitals added no state and no write; teardown.
//
// The honest bounds, stated rather than hidden: these are JVM facts, not service metrics. There is no
// request count, no latency histogram, no GC count, no percentile and no history — each call is one sample
// from `MemoryMXBean`/`ThreadMXBean`/`Runtime`. `heapMaxBytes` is -1 when the JVM defines no maximum, and
// the door serves that value rather than inventing zero. Nothing about the database can make this door fail.
//
// Requires: Java 25, Maven, and a running Docker daemon. Run:  node docs/evidence/m9/service-vitals-proof.mjs
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
// THREE levels up: docs/evidence/m9/service-vitals-proof.mjs -> the repository root.
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SERVICE_DIR = process.env.NEXUS_SERVICE_DIR
  ? path.resolve(process.env.NEXUS_SERVICE_DIR)
  : path.join(REPO_ROOT, 'services/nexus-api');
const DB_IMAGE = 'pgvector/pgvector:pg16';
const STAMP = `${Date.now()}-${process.pid}`;
const BUILD_DIR = path.join(tmpdir(), `nexus-vitals-proof-build-${STAMP}`);
const JAR = path.join(BUILD_DIR, 'target/nexus-api-0.1.0-SNAPSHOT.jar');

const DB_CONTAINER = `nexus-vitals-db-${STAMP}`;
const DB_NAME = 'nexus';
const DB_USER = 'nexus';
const DB_PASSWORD = 'nexus';
const PORT_FILE = path.join(tmpdir(), `nexus-vitals-port-${STAMP}.txt`);

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
const VITALS_FIELDS = [
  'heapCommittedBytes', 'heapMaxBytes', 'heapUsedBytes',
  'liveThreads', 'peakThreads', 'processors'
].sort();

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
      const r = await fetch(`http://127.0.0.1:${apiPort}/health/vitals`);
      return r.status === 200;
    } catch {
      return false;
    }
  }, { tries: SERVICE_START_TRIES, gapMs: 1000, label: 'the service to answer /health/vitals' });
  if (!up) {
    throw new Error(`the service never answered /health/vitals. Its output was:\n${log.slice(-4000)}`);
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

  /** The invariants the JDK promises for these six numbers. */
  function assertVitalsShape(body, clue) {
    assert.ok(body && typeof body === 'object', `${clue}: the body must be a JSON object, got ${JSON.stringify(body)}`);
    assert.deepEqual(Object.keys(body).sort(), VITALS_FIELDS,
        `${clue}: vitals carries exactly ${VITALS_FIELDS.join('/')}, got ${JSON.stringify(Object.keys(body))}`);
    for (const field of ['heapUsedBytes', 'heapCommittedBytes', 'heapMaxBytes']) {
      assert.ok(Number.isInteger(body[field]), `${clue}: ${field} must be an integer, got ${JSON.stringify(body[field])}`);
    }
    assert.ok(body.heapUsedBytes >= 0, `${clue}: heapUsedBytes cannot be negative, got ${body.heapUsedBytes}`);
    assert.ok(body.heapCommittedBytes >= 0, `${clue}: heapCommittedBytes cannot be negative, got ${body.heapCommittedBytes}`);
    assert.ok(body.heapMaxBytes === -1 || body.heapMaxBytes > 0,
        `${clue}: heapMaxBytes must be -1 (undefined) or positive, got ${body.heapMaxBytes}`);
    if (body.heapMaxBytes > 0) {
      assert.ok(body.heapUsedBytes <= body.heapMaxBytes, `${clue}: used heap cannot exceed the maximum`);
      assert.ok(body.heapCommittedBytes <= body.heapMaxBytes, `${clue}: committed heap cannot exceed the maximum`);
    }
    assert.ok(Number.isInteger(body.liveThreads) && body.liveThreads > 0,
        `${clue}: a running JVM has at least one live thread, got ${JSON.stringify(body.liveThreads)}`);
    assert.ok(Number.isInteger(body.peakThreads) && body.peakThreads >= body.liveThreads,
        `${clue}: peakThreads must be at least liveThreads, got ${body.peakThreads} < ${body.liveThreads}`);
    assert.ok(Number.isInteger(body.processors) && body.processors >= 1,
        `${clue}: processors must be at least one, got ${JSON.stringify(body.processors)}`);
  }

  // ── §1 vitals: six integers, one sample, no cache ───────────────────────────────────────────────
  const vitals = await call('/health/vitals');
  assert.equal(vitals.status, 200, `a running process must answer vitals 200, got ${vitals.status}: ${vitals.text}`);
  assert.match(vitals.headers.get('content-type') ?? '', /application\/json/, 'vitals answers JSON');
  assert.equal(vitals.headers.get('cache-control'), 'no-store', 'a sampled number served from a cache is a past fact');
  assertVitalsShape(vitals.body, '§1');
  console.log(`[§1] /health/vitals answered 200 in ${vitals.elapsedMs} ms: heap ${vitals.body.heapUsedBytes}/${vitals.body.heapCommittedBytes} bytes of ${vitals.body.heapMaxBytes < 0 ? 'an undefined maximum' : `${vitals.body.heapMaxBytes} bytes`} · ${vitals.body.liveThreads} live / ${vitals.body.peakThreads} peak threads · ${vitals.body.processors} processors · exactly six fields · Cache-Control: no-store`);

  // ── §2 the database STOPS: vitals does not read the database, so it does not care ────────────────
  const stopped = await run('docker', ['stop', DB_CONTAINER]);
  assert.equal(stopped.code, 0, `could not stop the throwaway database: ${stopped.stderr}`);
  const databaseGone = await until(async () => !(await canConnect(dbPort)), { tries: 30, gapMs: 500, label: 'the database port to stop accepting' });
  assert.ok(databaseGone, 'docker stop returned but the host port still accepts a connection');

  const vitalsDuringOutage = await call('/health/vitals');
  assert.equal(vitalsDuringOutage.status, 200,
      `vitals must answer 200 while the database is DOWN, got ${vitalsDuringOutage.status}: ${vitalsDuringOutage.text}`);
  assert.equal(vitalsDuringOutage.headers.get('cache-control'), 'no-store');
  assertVitalsShape(vitalsDuringOutage.body, '§2');
  assert.ok(vitalsDuringOutage.elapsedMs < 2000,
      `vitals must not wait for the database: measured ${vitalsDuringOutage.elapsedMs} ms while it was down`);
  const liveDuringOutage = await call('/health/live');
  assert.equal(liveDuringOutage.status, 200, 'the process door still answers while the database is down');
  console.log(`[§2] with the database STOPPED, /health/vitals still answered 200 in ${vitalsDuringOutage.elapsedMs} ms with the same six fields, and /health/live still answered 200 in ${liveDuringOutage.elapsedMs} ms — vitals reads no database and borrows no connection`);

  // ── §3 the database STARTS again, and psql proves vitals wrote nothing ───────────────────────────
  const restartedDb = await run('docker', ['start', DB_CONTAINER]);
  assert.equal(restartedDb.code, 0, `could not restart the throwaway database: ${restartedDb.stderr}`);
  const databaseBack = await until(() => canConnect(dbPort), { tries: 30, gapMs: 500, label: 'the database port to accept again' });
  assert.ok(databaseBack, 'docker start returned but the host port never accepted a connection');

  const vitalsAfter = await call('/health/vitals');
  assert.equal(vitalsAfter.status, 200);
  assertVitalsShape(vitalsAfter.body, '§3');

  assert.equal(await sql('select count(*) from audit_entry'), '0', 'a vitals read records no trail fact');
  assert.equal(await sql('select count(*) from webhook_delivery'), '0', 'a vitals read knocks on nothing');
  assert.equal(await sql("select count(*) from information_schema.tables where table_name like 'health%'"), '0',
      'vitals stores no state: no sample table, no probe history');
  console.log(`[§3] after the database returned, /health/vitals answered 200 again in ${vitalsAfter.elapsedMs} ms with the same six fields · psql read ZERO audit entries, ZERO webhook deliveries and ZERO health% tables — vitals keeps no history and writes nothing`);

  // ── §4 teardown ────────────────────────────────────────────────────────────────────────────────
  await stopService(serviceProcess);
  serviceProcess = null;
  const rm = await run('docker', ['rm', '-f', DB_CONTAINER]);
  assert.equal(rm.code, 0, `could not remove the throwaway database: ${rm.stderr}`);
  dbStarted = false;
  const goneContainer = await run('docker', ['ps', '-a', '--filter', `name=^/${DB_CONTAINER}$`, '--format', '{{.Names}}']);
  assert.equal(goneContainer.stdout.trim(), '', `the throwaway container is still listed: ${goneContainer.stdout.trim()}`);
  console.log(`[§4] teardown: the service process is gone and the throwaway container ${DB_CONTAINER} is removed`);

  console.log('\n[summary] M9: services/nexus-api BUILT and RAN against a real PostgreSQL · /health/vitals answered 200 with exactly six integers (heap used/committed/max, live/peak threads, processors) under Cache-Control: no-store, with the JDK invariants checked · with the database STOPPED it still answered 200 in under 2 s with the same shape, and /health/live still answered 200 · with the database started again it still answered 200 and psql read ZERO audit entries, ZERO webhook deliveries and ZERO health tables');
  rmSync(BUILD_DIR, { recursive: true, force: true });
  console.log('[m9-service-vitals-proof] ALL ASSERTIONS PASSED (vitals is the process\'s own sample, not a serving fact: it does not read the database, does not cache, does not store a history, and does not turn a number into a status threshold it does not own)');
} finally {
  if (serviceProcess && serviceProcess.exitCode === null) {
    await stopService(serviceProcess);
  }
  if (dbStarted) await run('docker', ['rm', '-f', DB_CONTAINER]);
}
