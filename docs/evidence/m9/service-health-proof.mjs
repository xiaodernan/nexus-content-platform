// NEXUS M9 — THE HEALTH DOOR: a process that answers is not a process that can serve. This proof builds the
// service, starts it against a throwaway PostgreSQL, reads `GET /health`, STOPS the database under the
// running process, reads the 503, RESTARTS the database, and reads the recovery — all without restarting
// the service, so the uptime and the `startedAt` instant are the same process's.
//
// Why this door exists, stated the way M9 requires: until now "is it up?" had no answer that was not a guess.
// A port that accepts says the JVM is running; it says nothing about whether the database behind it answers.
// The status code therefore carries the SECOND fact (200 reachable / 503 not) while the body still carries
// the FIRST (service, version, startedAt, uptime) — so a caller can tell "down" from "gone".
//
// What it proves, clause by clause:
//   §0 the tools this proof needs (Java 25, Docker) are present BEFORE anything is started;
//   §1 the service BUILDS and STARTS, and `/health` answers 200 with exactly the declared shape: the
//      service name, the version the POM declares (read from the packaged jar, not hard-coded), an ISO
//      instant that agrees with the uptime, a reachable database with a non-negative latency, NO `detail`,
//      and `Cache-Control: no-store`;
//   §2 psql reads ZERO audit entries, ZERO webhook deliveries and ZERO `health%` tables — a health read is
//      not a fact the service writes;
//   §3 the database is STOPPED under the running process: `/health` answers 503, `reachable` is false, the
//      reason is a SHORT token (an exception's simple name or `invalid-connection`), the latency is still
//      measured, and the body carries no JDBC URL, no host, no password, no message and no stack trace;
//   §4 the database is STARTED again: `/health` returns to 200 with `detail` gone, the SAME `startedAt` and an
//      uptime PROVEN to advance (never-go-backwards, still derived from that `startedAt`, then a bounded poll
//      until the whole-second counter steps up) — the service was never restarted — and psql still reads zero
//      audit entries, zero deliveries and zero health tables, because even a FAILED probe wrote nothing;
//   §5 teardown.
//
// The honest bound, stated rather than hidden: this service adds no timer of its own. When the pool holds no
// usable connection the borrow waits for the pool, and how LONG that takes is a fact about the box rather
// than about this door — a clean refusal returns in milliseconds, a pooled socket held open by a proxy hangs
// to the pool's own bound. The proof therefore claims no duration it cannot read from the service's own
// `database.latencyMs`. What it refuses to allow is a door that raced the pool with its own deadline, or
// answered "down" without asking: the envelope and the measurement inside it must be one and the same wait.
// The probe checks THIS service's database only: it does not call other services, run a deep query or return
// a boolean total.
//
// Requires: Java 25, Maven, and a running Docker daemon. Run:  node docs/evidence/m9/service-health-proof.mjs
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
import { okPredicates, planeBoundClaims, planeBoundRuleIsLive } from './plane-bound-claims.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// THREE levels up: docs/evidence/m9/service-health-proof.mjs -> the repository root.
const REPO_ROOT = path.resolve(__dirname, '../../..');
// This repository's worktree is shared by concurrent lanes; when another lane is mid-edit, set
// NEXUS_SERVICE_DIR to a clean snapshot of services/nexus-api to grade THAT tree instead of the dirty one.
const SERVICE_DIR = process.env.NEXUS_SERVICE_DIR
  ? path.resolve(process.env.NEXUS_SERVICE_DIR)
  : path.join(REPO_ROOT, 'services/nexus-api');
const DB_IMAGE = 'pgvector/pgvector:pg16';
const STAMP = `${Date.now()}-${process.pid}`;
const BUILD_DIR = path.join(tmpdir(), `nexus-health-proof-build-${STAMP}`);
const JAR = path.join(BUILD_DIR, 'target/nexus-api-0.1.0-SNAPSHOT.jar');

const DB_CONTAINER = `nexus-health-db-${STAMP}`;
const DB_NAME = 'nexus';
const DB_USER = 'nexus';
const DB_PASSWORD = 'nexus';
const PORT_FILE = path.join(tmpdir(), `nexus-health-port-${STAMP}.txt`);

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

/** The response's shape, pinned: a field added here is a fact this door would start claiming. */
const HEALTH_FIELDS = ['database', 'service', 'startedAt', 'uptimeSeconds', 'version'].sort();
const REACHABLE_DATABASE_FIELDS = ['latencyMs', 'reachable'].sort();

// §0a static wire contract: the Java DTOs must declare the fields this proof expects.
{
  const HEALTH_DTO = path.join(SERVICE_DIR, 'src/main/java/dev/nexus/api/status/HealthDtos.java');
  const healthWire = javaRecordFields(HEALTH_DTO, 'Health').map((f) => f.name).sort();
  assert.deepEqual(healthWire, HEALTH_FIELDS, `HealthDtos.Health wire fields ${JSON.stringify(healthWire)} disagree with expected ${JSON.stringify(HEALTH_FIELDS)}`);
  const dbWire = javaRecordFields(HEALTH_DTO, 'Database').map((f) => f.name).sort();
  const DB_WIRE_FIELDS = ['detail', 'latencyMs', 'reachable'].sort();
  assert.deepEqual(dbWire, DB_WIRE_FIELDS, `HealthDtos.Database wire fields ${JSON.stringify(dbWire)} disagree with expected ${JSON.stringify(DB_WIRE_FIELDS)}`);
  console.log(`[§0a] static wire contract: Health/Database DTO fields match the shape this proof grades (${healthWire.length}+${dbWire.length} fields read from source)`);
}
// §0b a record that declares a field twice cannot be read: the reader keeps both, the pinned list would
// mis-grade, and a rename would silently land on the second declaration. The same defect class the trail
// and traffic lanes caught, now over every record the health family owns.
{
  const HEALTH_DTO = path.join(SERVICE_DIR, 'src/main/java/dev/nexus/api/status/HealthDtos.java');
  for (const record of ['Health', 'Database', 'Liveness', 'Readiness', 'Vitals']) {
    const dupes = javaRecordDuplicateFields(HEALTH_DTO, record);
    assert.deepEqual(dupes, [], `HealthDtos.${record} declares duplicate field(s): ${dupes.join(', ')} — the reader keeps both and the pinned list would mis-grade`);
  }
  console.log('[§0b] HealthDtos declares no duplicated field names across its five records');
}

// §0c the shape that reddened this row hosted is now refused by the row itself. `uptime must have grown`
// compared two reads of an integer-second counter, so the verdict was a coin flip on the runner's clock; the
// repair (amendment 576) is graded here on planted assertions BEFORE anything is started, and then against
// this proof's own bytes. The rule tries itself first, both directions, so a guard that went blind reddens
// instead of clearing the tree quietly.
{
  const ruleVerdict = planeBoundRuleIsLive();
  const ownBytes = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const own = planeBoundClaims(ownBytes);
  assert.deepEqual(own, [], `this proof asserts a plane-bound claim: ${JSON.stringify(own, null, 1)} — a measured field floored against a remembered constant, or two reads of one whole-second counter compared strictly, decides its own verdict by the machine that ran it`);
  console.log(`[§0c] ${ruleVerdict}; this proof's own ${okPredicates(ownBytes).length} assert.ok predicate(s) carry 0 plane-bound claims`);
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
  console.log(`[m9] the POM declares version ${projectVersion} — the door is expected to answer THAT, not a literal`);

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
      const r = await fetch(`http://127.0.0.1:${apiPort}/health`);
      return r.status === 200;
    } catch {
      return false;
    }
  }, { tries: SERVICE_START_TRIES, gapMs: 1000, label: 'the service to answer /health' });
  if (!up) {
    throw new Error(`the service never answered /health. Its output was:\n${log.slice(-4000)}`);
  }
  const base = `http://127.0.0.1:${apiPort}`;
  console.log(`[m9] nexus-api answering on ${base}`);

  /** One HTTP call, parsed, with the headers a cache rule is read from. */
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

  async function sql(query) {
    const r = await run('docker', ['exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-tAc', query]);
    assert.equal(r.code, 0, `psql failed: ${r.stderr}`);
    return r.stdout.trim();
  }

  const first = await call('/health');
  assert.equal(first.status, 200, `a reachable database must answer 200, got ${first.status}: ${first.text}`);
  assert.match(first.headers.get('content-type') ?? '', /application\/json/, 'the door answers JSON');
  assert.equal(first.headers.get('cache-control'), 'no-store', 'an uptime served from a cache is a past fact');
  assert.ok(first.body && typeof first.body === 'object', `the body must be a JSON object, got: ${first.text}`);
  assert.deepEqual(Object.keys(first.body).sort(), HEALTH_FIELDS,
      `the answer carries exactly ${HEALTH_FIELDS.join('/')}, got ${JSON.stringify(Object.keys(first.body))}`);
  assert.equal(first.body.service, 'nexus-api');
  assert.equal(first.body.version, projectVersion,
      `the packaged jar must answer the version the POM declares, not "unknown" or a literal — got ${JSON.stringify(first.body.version)}`);
  assert.match(first.body.startedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
      `startedAt must be an ISO-8601 UTC instant, got ${first.body.startedAt}`);
  assert.ok(Number.isFinite(Date.parse(first.body.startedAt)), 'startedAt must parse');
  assert.ok(Date.parse(first.body.startedAt) <= Date.now(), 'startedAt cannot be in the future');
  assert.ok(Number.isInteger(first.body.uptimeSeconds) && first.body.uptimeSeconds >= 0,
      `uptimeSeconds must be a whole, non-negative number, got ${first.body.uptimeSeconds}`);
  const uptimeFromWall = Math.floor((Date.now() - Date.parse(first.body.startedAt)) / 1000);
  assert.ok(Math.abs(uptimeFromWall - first.body.uptimeSeconds) <= 3,
      `uptimeSeconds (${first.body.uptimeSeconds}) must agree with startedAt (${first.body.startedAt}) — wall says ${uptimeFromWall}`);
  assert.equal(first.body.database.reachable, true, 'the database the service is connected to answers');
  assert.ok(Number.isInteger(first.body.database.latencyMs) && first.body.database.latencyMs >= 0,
      `latencyMs must be a whole, non-negative number, got ${first.body.database.latencyMs}`);
  assert.deepEqual(Object.keys(first.body.database).sort(), REACHABLE_DATABASE_FIELDS,
      `a reachable database carries no detail, got ${JSON.stringify(Object.keys(first.body.database))}`);
  console.log(`[§1] /health answered 200: service "nexus-api" · version "${first.body.version}" (the POM's own) · startedAt ${first.body.startedAt} · uptime ${first.body.uptimeSeconds}s · database reachable in ${first.body.database.latencyMs} ms with NO detail · Cache-Control: no-store`);

  // ── §2 a health READ is not a fact the service writes ───────────────────────────────────────────
  assert.equal(await sql('select count(*) from audit_entry'), '0', 'a health read records no trail fact');
  assert.equal(await sql('select count(*) from webhook_delivery'), '0', 'a health read knocks on nothing');
  assert.equal(await sql("select count(*) from information_schema.tables where table_name like 'health%'"), '0',
      'the door stores no state: no health table, no probe history');
  console.log('[§2] psql read ZERO audit entries, ZERO webhook deliveries and ZERO health% tables — the door writes nothing');

  // ── §3 the database STOPS under the running process: 503, a short reason, no leak ─────────────────
  const stopped = await run('docker', ['stop', DB_CONTAINER]);
  assert.equal(stopped.code, 0, `could not stop the throwaway database: ${stopped.stderr}`);
  const databaseGone = await until(async () => !(await canConnect(dbPort)), { tries: 30, gapMs: 500, label: 'the database port to stop accepting' });
  assert.ok(databaseGone, 'docker stop returned but the host port still accepts a connection');

  const outage = await call('/health');
  assert.equal(outage.status, 503, `a process whose database is down must answer 503, got ${outage.status}: ${outage.text}`);
  assert.equal(outage.headers.get('cache-control'), 'no-store', 'a failure is no more cacheable than a success');
  assert.ok(outage.body && typeof outage.body === 'object', `the 503 still carries a JSON body, got: ${outage.text}`);
  assert.deepEqual(Object.keys(outage.body).sort(), HEALTH_FIELDS,
      `the failing answer keeps the same shape, got ${JSON.stringify(Object.keys(outage.body))}`);
  assert.equal(outage.body.service, 'nexus-api', 'the process itself is still answering');
  assert.equal(outage.body.version, first.body.version);
  assert.equal(outage.body.startedAt, first.body.startedAt, 'the same process answered both reads');
  assert.ok(outage.body.uptimeSeconds >= first.body.uptimeSeconds, 'uptime cannot go backwards');
  assert.equal(outage.body.database.reachable, false);
  assert.ok(Number.isInteger(outage.body.database.latencyMs) && outage.body.database.latencyMs >= 0,
      `a failure is still a measurement, got ${outage.body.database.latencyMs}`);
  const detail = outage.body.database.detail;
  assert.ok(typeof detail === 'string' && detail.length > 0, `a failure must name a reason, got ${JSON.stringify(detail)}`);
  // The producer declares TWO shapes for this token (HealthService.INVALID_CONNECTION = "invalid-connection",
  // or an exception's simple name) and the refusal sentence below says so; the class this row shipped
  // admitted only the second, so it was green on the box that saw a PSQLException and RED on the runner that
  // saw the constant. A reader that refuses a value its own message names is the defect this lane exists to
  // catch, so the class now carries the hyphen, and the length bound makes "short" a measurement too.
  assert.match(detail, /^[A-Za-z_$][A-Za-z0-9_$.-]*$/,
      `the reason must be a short token (an exception's simple name or invalid-connection), got ${JSON.stringify(detail)}`);
  assert.ok(detail.length <= 64, `the reason is ${detail.length} characters, not a short token: ${JSON.stringify(detail)}`);
  for (const forbidden of ['jdbc:', 'postgresql', '127.0.0.1', 'password', 'connection refused', 'message', 'stack', ' at ']) {
    assert.equal(outage.text.includes(forbidden), false,
        `the unauthenticated body must not carry ${JSON.stringify(forbidden)}: ${outage.text}`);
  }
  console.log(`[§3] with the database stopped, /health answered 503: reachable=false · detail "${detail}" (a token, not a message) · latency ${outage.body.database.latencyMs} ms · same service/version/startedAt · the body carried no JDBC URL, host, password, message or stack trace`);

  // ── §4 the database STARTS again: the same process recovers ─────────────────────────────────────
  const restartedDb = await run('docker', ['start', DB_CONTAINER]);
  assert.equal(restartedDb.code, 0, `could not restart the throwaway database: ${restartedDb.stderr}`);
  const databaseBack = await until(() => canConnect(dbPort), { tries: 30, gapMs: 500, label: 'the database port to accept again' });
  assert.ok(databaseBack, 'docker start returned but the host port never accepted a connection');

  let recovered = null;
  const back = await until(async () => {
    const answer = await call('/health');
    if (answer.status === 200) {
      recovered = answer;
      return true;
    }
    return false;
  }, { tries: 10, gapMs: 1000, label: '/health to return to 200 without restarting the service' });
  assert.ok(back && recovered, 'the health door never recovered after the database returned');

  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.database.reachable, true);
  assert.deepEqual(Object.keys(recovered.body.database).sort(), REACHABLE_DATABASE_FIELDS,
      `recovery carries no detail, got ${JSON.stringify(Object.keys(recovered.body.database))}`);
  assert.ok(recovered.body.database.latencyMs >= 0);
  assert.equal(recovered.body.startedAt, first.body.startedAt,
      'the service was NOT restarted: the startedAt instant is the same process');
  // v651a (ADR 0016 amendment 576): this row used to compare two INTEGER-second readings with `>`, which is a
  // bet on where the second boundary fell, not a property of the contract. It passed by luck wherever recovery
  // happened to take more than a second and reddened on a runner whose outage read and recovery read landed in
  // the SAME second — a green-or-red verdict decided by the clock rather than by the service. The fact the row
  // is reaching for is "this process was never restarted, and it has been up longer since". Three clauses
  // carry it on every plane: uptime never goes backwards, the recovery reading is still DERIVED from the
  // startedAt the clause above just proved identical (a re-based or remembered counter would agree with
  // nothing), and the growth is POLLED FOR, bounded, instead of demanded from a single read — the field
  // cannot speak a step smaller than one second, so the poll is given that step plus the round trips to show it.
  assert.ok(recovered.body.uptimeSeconds >= outage.body.uptimeSeconds,
      `uptime never goes backwards inside one process (${outage.body.uptimeSeconds}s -> ${recovered.body.uptimeSeconds}s)`);
  const recoveryFromWall = Math.floor((Date.now() - Date.parse(recovered.body.startedAt)) / 1000);
  assert.ok(Math.abs(recoveryFromWall - recovered.body.uptimeSeconds) <= 3,
      `the recovery uptime is still the same derivation from startedAt, not a counter that reset: uptime ${recovered.body.uptimeSeconds}s, wall ${recoveryFromWall}s`);
  let growthTries = 0;
  const growthBegan = Date.now();
  let grown = null;
  const grew = await until(async () => {
    growthTries++;
    const answer = await call('/health');
    if (answer.status === 200 && answer.body.uptimeSeconds > recovered.body.uptimeSeconds) {
      grown = { from: recovered.body.uptimeSeconds, to: answer.body.uptimeSeconds, startedAt: answer.body.startedAt };
      return true;
    }
    return false;
  }, { tries: 12, gapMs: 500, label: 'uptimeSeconds to advance while the same process keeps answering 200' });
  assert.ok(grown, `uptime never advanced past ${recovered.body.uptimeSeconds}s in ${growthTries} reads over ${Date.now() - growthBegan} ms — either the counter is stuck or this is not the process that started`);
  assert.equal(grown.startedAt, first.body.startedAt, 'the read that showed the growth names the SAME process');

  assert.equal(await sql('select count(*) from audit_entry'), '0', 'even a failed probe records no trail fact');
  assert.equal(await sql('select count(*) from webhook_delivery'), '0', 'even a failed probe knocks on nothing');
  assert.equal(await sql("select count(*) from information_schema.tables where table_name like 'health%'"), '0',
      'the door still stores no state');
  console.log(`[§4] after the database returned, /health answered 200 again: reachable in ${recovered.body.database.latencyMs} ms, NO detail, the SAME startedAt ${recovered.body.startedAt}, uptime ${outage.body.uptimeSeconds}s -> ${recovered.body.uptimeSeconds}s (never backwards, ${recoveryFromWall}s by the wall clock from that startedAt) and PROVEN to advance to ${grown.to}s in ${growthTries} reads / ${Date.now() - growthBegan} ms — the process never restarted · and psql still read ZERO audit entries, ZERO deliveries and ZERO health tables`);

  // ── §5 teardown ────────────────────────────────────────────────────────────────────────────────
  await stopService(serviceProcess);
  serviceProcess = null;
  const rm = await run('docker', ['rm', '-f', DB_CONTAINER]);
  assert.equal(rm.code, 0, `could not remove the throwaway database: ${rm.stderr}`);
  dbStarted = false;
  const goneContainer = await run('docker', ['ps', '-a', '--filter', `name=^/${DB_CONTAINER}$`, '--format', '{{.Names}}']);
  assert.equal(goneContainer.stdout.trim(), '', `the throwaway container is still listed: ${goneContainer.stdout.trim()}`);
  console.log(`[§5] teardown: the service process is gone and the throwaway container ${DB_CONTAINER} is removed`);

  console.log('\n[summary] M9: services/nexus-api BUILT and RAN against a real PostgreSQL · /health answered 200 with service/version (the POM\'s own)/startedAt/uptimeSeconds and a reachable database with a non-negative latency and NO detail, under Cache-Control: no-store · psql read ZERO audit entries, ZERO webhook deliveries and ZERO health tables · with the database stopped under the running process the door answered 503, reachable=false and a short reason token, with no JDBC URL, host, password, message or stack trace · with the database started again the SAME process answered 200 with detail gone and an uptime PROVEN to advance — never backwards, still derived from the original startedAt, then polled for the whole-second step instead of betting one read against another — and still wrote nothing');
  rmSync(BUILD_DIR, { recursive: true, force: true });
  console.log('[m9-service-health-proof] ALL ASSERTIONS PASSED (a health door that separates "the process answers" from "the database can serve", states the failure without describing the machine, and survives an outage without being restarted)');
} finally {
  if (serviceProcess && serviceProcess.exitCode === null) {
    await stopService(serviceProcess);
  }
  if (dbStarted) await run('docker', ['rm', '-f', DB_CONTAINER]);
}
