// NEXUS M9 — TRAFFIC COUNTED WHERE IT CROSSES: `GET /health/traffic` answers what this process has served
// since it started — how many requests, how many of each status family, and how long they took — read off
// one bounded ledger. This proof builds the service, starts it against a throwaway PostgreSQL, issues a
// DETERMINISTIC sequence of requests and asserts the ledger moved by EXACTLY that sequence, STOPS the
// database and reads traffic again (it must stay 200 and fast — the ledger is in memory), STARTS it, and
// asks psql whether anything was written.
//
// Why this is a separate door and not a field on `/health`:
//   `/health` answers whether this process can SERVE, and a database outage changes that answer. Traffic is
//   a USAGE fact — a count of what already happened. It must keep answering during an outage (an operator
//   wants to know whether requests are still arriving), and a count of 5xx responses must not turn into a
//   503 of its own. Usage facts have their own door, exactly as ADR 0037 established for vitals.
//
// Why the counts can be asserted EXACTLY:
//   The only client of this service is this proof. Its readiness poll uses `/health/live`, and every one of
//   those calls is counted; the first `/health/traffic` read is therefore taken as a BASELINE, and every
//   later assertion is a DELTA from it. No absolute request number is claimed.
//
// What it proves, clause by clause:
//   §0 the tools this proof needs (Java 25, Docker) are present BEFORE anything is started;
//   §1 the service BUILDS and STARTS, and `/health/traffic` answers 200 with exactly nine fields — five
//      status families plus `unclassified`, two duration numbers, and five latency buckets — under
//      `Cache-Control: no-store`;
//   §2 THREE requests are issued (200 live, one framework 404, 200 ready) and the NEXT traffic read reports
//      requests +4, successes +3 and clientErrors +1 — the extra success is the BASELINE READ ITSELF, which
//      ended after its snapshot and before this one, so the status families are the ones the responses
//      actually carried and the self-read rule is already visible; a second read then reports +1 for the
//      read that asked before it (the snapshot does not contain the request that asked for it);
//   §3 the two partitions ADD UP: family counts and latency bucket counts both equal `requests`, on every
//      snapshot, and `durationTotalMs >= durationMaxMs`;
//   §4 the database is STOPPED: `/health/traffic` still answers 200 in under 2 s, and its request count
//      moves by exactly one while its status families do not invent a failure;
//   §5 the database is STARTED again: traffic still answers 200, and psql reads ZERO audit entries, ZERO
//      webhook deliveries and ZERO `health%`/`traffic%` tables — the ledger is heap state, not a table;
//   §6 teardown.
//
// The honest bounds, stated rather than hidden: this is an in-process ledger, not a metrics system. It
// keeps no per-path, per-method or per-tenant breakdown, no percentile, no rolling window, no history and
// no reset; its five fixed buckets are counts, not a histogram with arbitrary edges. Every counter lives in
// this process's heap and dies with it, so a restart starts at zero. The answer is a SNAPSHOT: concurrent
// requests are counted under one lock, but the read that asks for the snapshot has not ended and is not in
// it. `/health/traffic` reads now do not include themselves and DO appear in the next answer.
//
// Requires: Java 25, Maven, and a running Docker daemon. Run:  node docs/evidence/m9/service-traffic-proof.mjs
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
import { javaRecordFields } from './wire-fields.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// THREE levels up: docs/evidence/m9/service-traffic-proof.mjs -> the repository root.
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SERVICE_DIR = process.env.NEXUS_SERVICE_DIR
  ? path.resolve(process.env.NEXUS_SERVICE_DIR)
  : path.join(REPO_ROOT, 'services/nexus-api');
const DB_IMAGE = 'pgvector/pgvector:pg16';
const STAMP = `${Date.now()}-${process.pid}`;
const BUILD_DIR = path.join(tmpdir(), `nexus-traffic-proof-build-${STAMP}`);
const JAR = path.join(BUILD_DIR, 'target/nexus-api-0.1.0-SNAPSHOT.jar');

const DB_CONTAINER = `nexus-traffic-db-${STAMP}`;
const DB_NAME = 'nexus';
const DB_USER = 'nexus';
const DB_PASSWORD = 'nexus';
const PORT_FILE = path.join(tmpdir(), `nexus-traffic-port-${STAMP}.txt`);

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
const TRAFFIC_FIELDS = [
  'clientErrors', 'durationMaxMs', 'durationTotalMs', 'latency',
  'redirects', 'requests', 'serverErrors', 'successes', 'unclassified'
].sort();
const LATENCY_FIELDS = ['over1000Ms', 'upTo1000Ms', 'upTo10Ms', 'upTo250Ms', 'upTo50Ms'].sort();

// §0a static wire contract: the Java DTOs must declare the fields this door expects.
{
  const TRAFFIC_DTO = path.join(SERVICE_DIR, 'src/main/java/dev/nexus/api/status/TrafficDtos.java');
  const trafficWire = javaRecordFields(TRAFFIC_DTO, 'Traffic').map((f) => f.name).sort();
  assert.deepEqual(trafficWire, TRAFFIC_FIELDS, `TrafficDtos.Traffic wire fields ${JSON.stringify(trafficWire)} disagree with expected ${JSON.stringify(TRAFFIC_FIELDS)}`);
  const latencyWire = javaRecordFields(TRAFFIC_DTO, 'Latency').map((f) => f.name).sort();
  assert.deepEqual(latencyWire, LATENCY_FIELDS, `TrafficDtos.Latency wire fields ${JSON.stringify(latencyWire)} disagree with expected ${JSON.stringify(LATENCY_FIELDS)}`);
  console.log(`[§0a] static wire contract: Traffic/Latency DTO fields match the shapes this proof grades (${trafficWire.length}+${latencyWire.length} fields read from source)`);
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
  // The readiness poll goes through `/health/live`, whose calls the ledger COUNTS; the baseline below is
  // taken after this poll, so every later assertion is a delta and no absolute request number is claimed.
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

  /** The ledger's own arithmetic: two partitions of the SAME whole, and a maximum inside the total. */
  function assertTrafficShape(body, clue) {
    assert.ok(body && typeof body === 'object', `${clue}: the body must be a JSON object, got ${JSON.stringify(body)}`);
    assert.deepEqual(Object.keys(body).sort(), TRAFFIC_FIELDS,
        `${clue}: traffic carries exactly ${TRAFFIC_FIELDS.join('/')}, got ${JSON.stringify(Object.keys(body))}`);
    for (const field of ['requests', 'successes', 'redirects', 'clientErrors', 'serverErrors', 'unclassified',
      'durationTotalMs', 'durationMaxMs']) {
      assert.ok(Number.isInteger(body[field]) && body[field] >= 0,
          `${clue}: ${field} must be a non-negative integer, got ${JSON.stringify(body[field])}`);
    }
    const families = body.successes + body.redirects + body.clientErrors + body.serverErrors + body.unclassified;
    assert.equal(families, body.requests,
        `${clue}: the status families must add up to requests, got ${families} vs ${body.requests}`);
    assert.ok(body.latency && typeof body.latency === 'object', `${clue}: latency must be an object`);
    assert.deepEqual(Object.keys(body.latency).sort(), LATENCY_FIELDS,
        `${clue}: latency carries exactly ${LATENCY_FIELDS.join('/')}, got ${JSON.stringify(Object.keys(body.latency))}`);
    const buckets = body.latency.upTo10Ms + body.latency.upTo50Ms + body.latency.upTo250Ms
        + body.latency.upTo1000Ms + body.latency.over1000Ms;
    assert.equal(buckets, body.requests,
        `${clue}: the latency buckets must add up to requests, got ${buckets} vs ${body.requests}`);
    assert.ok(body.durationTotalMs >= body.durationMaxMs,
        `${clue}: the total duration cannot be below the longest request, got ${body.durationTotalMs} < ${body.durationMaxMs}`);
  }

  // ── §1 traffic: nine fields, no-store, a bounded ledger ──────────────────────────────────────────
  const baseline = await call('/health/traffic');
  assert.equal(baseline.status, 200, `a running process must answer traffic 200, got ${baseline.status}: ${baseline.text}`);
  assert.match(baseline.headers.get('content-type') ?? '', /application\/json/, 'traffic answers JSON');
  assert.equal(baseline.headers.get('cache-control'), 'no-store', 'a ledger served from a cache is a past count');
  assertTrafficShape(baseline.body, '§1');
  console.log(`[§1] /health/traffic answered 200 in ${baseline.elapsedMs} ms with exactly nine fields and Cache-Control: no-store — baseline ${baseline.body.requests} requests (the readiness polls this proof itself made), ${baseline.body.successes} success / ${baseline.body.clientErrors} client / ${baseline.body.serverErrors} server`);

  // ── §2 a DETERMINISTIC sequence: 200, 404, 200 — and the next read reports exactly +4 ─────────────
  const live = await call('/health/live');
  assert.equal(live.status, 200);
  const missing = await call('/no-such-door');
  assert.equal(missing.status, 404, `the framework must answer an unknown path with 404, got ${missing.status}: ${missing.text}`);
  const ready = await call('/health/ready');
  assert.equal(ready.status, 200, `readiness must answer 200 while the database is up, got ${ready.status}: ${ready.text}`);

  const afterThree = await call('/health/traffic');
  assert.equal(afterThree.status, 200);
  assertTrafficShape(afterThree.body, '§2');
  // FOUR, not three: the baseline read itself ended after its snapshot and before this one, so it is the
  // first demonstration of the self-read rule §3 pins.
  assert.equal(afterThree.body.requests, baseline.body.requests + 4,
      `three issued requests plus the baseline read must move the count by exactly four: ${baseline.body.requests} → ${afterThree.body.requests}`);
  assert.equal(afterThree.body.successes, baseline.body.successes + 3,
      'the baseline read, the live probe and readiness were 2xx, so successes must move by three');
  assert.equal(afterThree.body.clientErrors, baseline.body.clientErrors + 1,
      'the 404 is one client error; no other family may move');
  assert.equal(afterThree.body.serverErrors, baseline.body.serverErrors,
      'no response in this sequence was 5xx');
  console.log(`[§2] issued GET /health/live (200), GET /no-such-door (404), GET /health/ready (200) · the next read reported requests ${baseline.body.requests} → ${afterThree.body.requests} (+4: the three issued calls and the baseline read), successes +${afterThree.body.successes - baseline.body.successes}, clientErrors +${afterThree.body.clientErrors - baseline.body.clientErrors}, serverErrors +${afterThree.body.serverErrors - baseline.body.serverErrors}`);

  // ── §3 the snapshot is a SNAPSHOT: the read that asked is not in it, and it is in the next ────────
  const selfRead = await call('/health/traffic');
  assert.equal(selfRead.status, 200);
  assertTrafficShape(selfRead.body, '§3');
  assert.equal(selfRead.body.requests, afterThree.body.requests + 1,
      `the earlier traffic read must appear in this answer: ${afterThree.body.requests} → ${selfRead.body.requests}`);
  assert.equal(selfRead.body.successes, afterThree.body.successes + 1,
      'the earlier traffic read answered 2xx, so it is one more success');
  assert.equal(selfRead.body.clientErrors, afterThree.body.clientErrors,
      'asking for the ledger does not create a client error');
  console.log(`[§3] a second read reported requests ${afterThree.body.requests} → ${selfRead.body.requests} (+1: the first read itself), while its own request is not in the answer it returned — the snapshot is taken before the asking request ends`);

  // ── §4 the database STOPS: the ledger is in memory, so traffic does not care ────────────────────
  const stopped = await run('docker', ['stop', DB_CONTAINER]);
  assert.equal(stopped.code, 0, `could not stop the throwaway database: ${stopped.stderr}`);
  const databaseGone = await until(async () => !(await canConnect(dbPort)), { tries: 30, gapMs: 500, label: 'the database port to stop accepting' });
  assert.ok(databaseGone, 'docker stop returned but the host port still accepts a connection');

  const duringOutage = await call('/health/traffic');
  assert.equal(duringOutage.status, 200,
      `traffic must answer 200 while the database is DOWN, got ${duringOutage.status}: ${duringOutage.text}`);
  assert.equal(duringOutage.headers.get('cache-control'), 'no-store');
  assertTrafficShape(duringOutage.body, '§4');
  assert.ok(duringOutage.elapsedMs < 2000,
      `traffic must not wait for the database: measured ${duringOutage.elapsedMs} ms while it was down`);
  assert.equal(duringOutage.body.requests, selfRead.body.requests + 1,
      'the outage read moves the count by exactly one');
  assert.equal(duringOutage.body.serverErrors, selfRead.body.serverErrors,
      'reading the ledger during an outage is not itself a server error');
  const liveDuringOutage = await call('/health/live');
  assert.equal(liveDuringOutage.status, 200, 'the process door still answers while the database is down');
  console.log(`[§4] with the database STOPPED, /health/traffic still answered 200 in ${duringOutage.elapsedMs} ms, requests ${selfRead.body.requests} → ${duringOutage.body.requests} (+1), serverErrors unchanged, and /health/live still answered 200 in ${liveDuringOutage.elapsedMs} ms — the ledger is heap state, not a database read`);

  // ── §5 the database STARTS again, and psql proves the ledger wrote nothing ───────────────────────
  const restartedDb = await run('docker', ['start', DB_CONTAINER]);
  assert.equal(restartedDb.code, 0, `could not restart the throwaway database: ${restartedDb.stderr}`);
  const databaseBack = await until(() => canConnect(dbPort), { tries: 30, gapMs: 500, label: 'the database port to accept again' });
  assert.ok(databaseBack, 'docker start returned but the host port never accepted a connection');

  const afterOutage = await call('/health/traffic');
  assert.equal(afterOutage.status, 200);
  assertTrafficShape(afterOutage.body, '§5');

  assert.equal(await sql('select count(*) from audit_entry'), '0', 'a traffic read records no trail fact');
  assert.equal(await sql('select count(*) from webhook_delivery'), '0', 'a traffic read knocks on nothing');
  assert.equal(await sql("select count(*) from information_schema.tables where table_name like 'health%' or table_name like 'traffic%'"), '0',
      'the ledger stores no state: no traffic table, no bucket history');
  console.log(`[§5] after the database returned, /health/traffic answered 200 again in ${afterOutage.elapsedMs} ms with the same nine fields · psql read ZERO audit entries, ZERO webhook deliveries and ZERO health%/traffic% tables — the ledger keeps no history and writes nothing`);

  // ── §6 teardown ─────────────────────────────────────────────────────────────────────────────────
  await stopService(serviceProcess);
  serviceProcess = null;
  const rm = await run('docker', ['rm', '-f', DB_CONTAINER]);
  assert.equal(rm.code, 0, `could not remove the throwaway database: ${rm.stderr}`);
  dbStarted = false;
  const goneContainer = await run('docker', ['ps', '-a', '--filter', `name=^/${DB_CONTAINER}$`, '--format', '{{.Names}}']);
  assert.equal(goneContainer.stdout.trim(), '', `the throwaway container is still listed: ${goneContainer.stdout.trim()}`);
  console.log(`[§6] teardown: the service process is gone and the throwaway container ${DB_CONTAINER} is removed`);

  console.log('\n[summary] M9: services/nexus-api BUILT and RAN against a real PostgreSQL · /health/traffic answered 200 with exactly nine fields under Cache-Control: no-store, and both partitions (five status families, five latency buckets) added up to requests on every snapshot · three issued requests plus the baseline read moved the ledger by EXACTLY four (three successes and one 404), the next read moved it by exactly one (the earlier read itself) while its own request was not in the answer, and a database outage left traffic at 200 with no invented server error · psql read ZERO audit entries, ZERO webhook deliveries and ZERO traffic tables');
  rmSync(BUILD_DIR, { recursive: true, force: true });
  console.log('[m9-service-traffic-proof] ALL ASSERTIONS PASSED (traffic is what this process HAS SERVED, counted where it crossed the door: bounded counters in the heap, a snapshot that excludes the ask, no history, no write, and a door that a database outage cannot take down)');
} finally {
  if (serviceProcess && serviceProcess.exitCode === null) {
    await stopService(serviceProcess);
  }
  if (dbStarted) await run('docker', ['rm', '-f', DB_CONTAINER]);
}
