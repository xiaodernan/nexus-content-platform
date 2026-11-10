// NEXUS — the Spring Cloud topology, PROVED end to end (ADR 0054, ADR 0055).
//
// The unit suites in `services/java-registry` and `services/java-gateway` prove two contracts each,
// inside one process. This file proves the thing they cannot: that the services work TOGETHER as a
// topology — that a service can find itself, that an edge can find a service it did not have an
// address for, that one service can call another BY NAME, and that the failure shapes survive all of
// it.
//
// What only THIS file can answer:
//
//   §1 the four jars BUILD;
//   §2 the registry answers on a port it was told to use;
//   §3 two THROWAWAY DATABASES inside the repository's own running PostgreSQL — one empty for
//      nexus-api, one carrying the REAL schema, copied out of the platform's own database with
//      pg_dump, because the domain service validates its mapping against that schema and would
//      (correctly) refuse to start against an empty one;
//   §4 the DOMAIN SERVICE starts against the real schema and REGISTERS ITSELF;
//   §5 nexus-api starts against its own database and REGISTERS ITSELF;
//   §6 the edge routes `lb://nexus-api` to it — a name, not an address;
//   §7 the TYPED CALL: the edge → nexus-api → `lb://nexus-domain-service` → the domain service →
//      PostgreSQL, and the row that comes back is the row the proof inserted. This is the whole
//      microservice claim in one request: four processes, two databases, one name;
//   §8 an id the domain service does not hold is a 404 — a fact ABOUT THE PROJECT;
//   §9 the BREAKER SAYS WHAT IT IS DOING. A 503 says "the service could not be reached"; the
//      breaker's own metric says whether the breaker refused the call, refused the network, or
//      never made it — and the metric's `name` tag is the breaker's own name, the same word the
//      configuration file uses. This is what turns a 503 into an answer about WHICH component
//      stopped the call, and it is the end of a trail that began with a configuration file naming
//      a breaker that nothing was using;
//   §10 every service reports its OWN health, on its own door;
//   §11 the REGISTRY DIES and the chain keeps working — the edge routes from what it learned
//      before, and the row still comes back. Discovery is a soft dependency, and this is where
//      that stops being a claim and becomes a measurement;
//   §12 with the DOMAIN SERVICE GONE, the service-to-service door answers 503, NAMES the service,
//      and says WHICH FAILURE it was;
//   §13 the breaker OPENS — and the refusal is attributed: the metric counts the calls it refused,
//      and the answer says `circuit-breaker-open`;
//   §14 with nexus-api gone, the edge answers 503 and names it too;
//   §15 with the EDGE gone, the caller gets a CONNECTION ERROR — because there is no longer
//      anything there to answer, and a 503 would be an invention;
//   §16 everything this file created is gone afterwards.
//
// Everything it creates is throwaway: two throwaway DATABASES inside the repository's own running
// PostgreSQL container, four jars built in ISOLATED COPIES of the services, four port files in the
// same copies, and four child processes. None of them touch the working tree, and none of them
// touch the platform's own data.
//
// Why a throwaway DATABASE and not a throwaway CONTAINER: this host cannot afford another
// container. Measured 2026-11-09: the first run of this proof asked Docker for a fresh
// `pgvector/pgvector:pg16` container and the container stayed in the `Created` state — Docker
// accepted the creation and never started it, and `docker inspect` on it hung. The machine runs
// PostgreSQL, Redis, MinIO and several other projects' containers on 16 GB of RAM with ~2.5 GB
// free (see docs/ENVIRONMENT.md). A database inside the container that is ALREADY running costs
// nothing, and a fresh database is just as isolated as a fresh container for the proof's purpose:
// the service writes to it and the proof drops it afterwards.
//
// Requires: Java 25, Maven, and the repository's PostgreSQL container running
// (`docker compose -f infra/docker-compose.yml --profile core up -d`).
// Run:  node docs/evidence/java/spring-cloud-proof.mjs
//
// sweep-budget-ms: 1200000
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// THREE levels up: this file is docs/evidence/java/spring-cloud-proof.mjs, so '../..' would land on
// docs/ — and a cwd that does not exist makes spawn answer ENOENT, which reads as "the command is
// missing". Measured (the same note as publish-proof.mjs).
const REPO_ROOT = path.resolve(__dirname, '../../..');
const STAMP = `${Date.now()}-${process.pid}`.replace(/[^a-z0-9]/gi, '_').toLowerCase();

/** The repository's own PostgreSQL container, and the port it publishes on (infra/docker-compose.yml). */
const DB_CONTAINER = process.env.NEXUS_PROOF_DB_CONTAINER ?? 'nexus-postgres';
const DB_PORT = Number(process.env.NEXUS_PROOF_DB_PORT ?? 55433);
const DB_USER = process.env.NEXUS_PROOF_DB_USER ?? 'nexus';
const DB_PASSWORD = process.env.NEXUS_PROOF_DB_PASSWORD ?? 'nexus_dev_only';
/** A fresh database inside that container, named for this run and dropped at the end. */
const DB_NAME_API = `nexus_cloud_proof_api_${STAMP}`;
const DB_NAME_DOMAIN = `nexus_cloud_proof_domain_${STAMP}`;
/** The platform's OWN database — the one whose schema is copied, and whose data the proof never touches. */
const DB_PLATFORM = process.env.NEXUS_PROOF_PLATFORM_DB ?? 'nexus';

/** The rows THIS proof owns. It inserts them into its own throwaway database and reads them back. */
const PROOF_USER_ID = randomUUID();
const PROOF_PROJECT_ID = randomUUID();
const PROOF_PROJECT_SLUG = 'cloud-proof-project';

/** The four services, each built in an isolated copy of its own directory. */
const SERVICES = [
  { id: 'registry', dir: 'services/java-registry', jar: 'nexus-registry-0.1.0-SNAPSHOT.jar', heap: '-Xmx256m' },
  { id: 'gateway', dir: 'services/java-gateway', jar: 'nexus-gateway-0.1.0-SNAPSHOT.jar', heap: '-Xmx256m' },
  { id: 'api', dir: 'services/nexus-api', jar: 'nexus-api-0.1.0-SNAPSHOT.jar', heap: '-Xmx384m' },
  { id: 'domain', dir: 'services/java-domain-service', jar: 'domain-service-1.0.0-SNAPSHOT.jar', heap: '-Xmx320m' },
];

// A SIBLING of the repository, not a directory inside it: the copies must not enter the sweeps and
// censuses that walk the repo's own files. And not the OS temp dir either — measured 2026-11-09: a
// run built all four jars (every Maven exit code 0) and §2 then found no registry jar at all, because
// something on this host empties loose `%TEMP%` directories while a run is in progress. A plane has
// to live where nothing sweeps it, so it lives beside the project and carries its port files too.
const PLANE_ROOT = process.env.NEXUS_PROOF_PLANE_ROOT ?? path.resolve(REPO_ROOT, '..', 'nexus-proof-planes');
const BUILD_ROOT = path.join(PLANE_ROOT, `spring-cloud-${STAMP}`);
/** Past this age a plane belongs to a run that was killed — see `pruneAbandonedPlanes`. */
const PLANE_ABANDONED_AFTER_MS = 6 * 60 * 60 * 1000;
const children = [];
const started = [];
/** The services that are RUNNING, so a failure can say what they said. */
const running = new Map();

/** Can this host open a TCP connection to `port`? Proves a published docker port is usable. */
function canConnect(port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const done = (answer) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(answer);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/**
 * Run a command ASYNCHRONOUSLY and resolve with its exit code and output.
 *
 * `opts.input` is written to the child's stdin and then closed — that is how the schema dump reaches
 * `psql` WITHOUT a byte-order mark. Measured: piping the dump through PowerShell's own pipeline put a
 * U+FEFF in front of the first line and PostgreSQL refused it with "syntax error at or near" — which
 * reads as a broken schema when the schema is fine.
 */
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: REPO_ROOT, ...opts });
    let out = '';
    child.stdout?.on('data', (d) => { out += d; });
    child.stderr?.on('data', (d) => { out += d; });
    if (opts.input !== undefined) {
      child.stdin?.end(opts.input);
    }
    child.on('close', (code) => resolve({ code, out }));
    child.on('error', (e) => resolve({ code: -1, out: String(e) }));
  });
}

/**
 * Maven, invoked EXPLICITLY rather than through a shell.
 *
 * Two Windows facts this has to survive, both measured the hard way by this repository's own
 * publish proof (`docs/evidence/m7/publish-proof.mjs`):
 *   1. `mvn` is a `.cmd` shim, and Node refuses to spawn one directly (the CVE-2024-27980 mitigation
 *      answers EINVAL) — which reads as "maven is not installed" when maven is installed and working.
 *      The first run of THIS proof answered `spawn mvn ENOENT`.
 *   2. Asking Node for a shell instead (`shell: true`) answered
 *      `spawn C:////WINDOWS////system32////cmd.exe ENOENT` on this host even though that file exists.
 *
 * So the shim is RESOLVED on PATH and handed to `cmd.exe` by full path with `/c` — the same rule the
 * publish proof uses, so the two proofs cannot drift apart on the one thing that is pure Windows.
 */
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

function runMaven(args, opts = {}) {
  if (process.platform !== 'win32') return run('mvn', args, opts);
  const mvn = findOnPath('mvn');
  assert.ok(mvn, 'maven is not on PATH; the Java services in this repo are built with Maven');
  return run(process.env.ComSpec ?? 'cmd.exe', ['/c', mvn, ...args], opts);
}

/** Poll until `check` returns a truthy value, or the deadline passes. */
async function waitFor(check, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
}

/**
 * Poll a URL until its answer satisfies `accept`, and REPORT what it saw when it does not.
 *
 * <p>The report is the point. Measured on this very file: §8 waited out a whole minute for a 404 that
 * never came, and the timeout said only "timed out" — which is a reader being told that nothing
 * happened, when in fact something answered 200 times. A poll that cannot say what it saw is a poll
 * that makes the next person guess (the same lesson §6's comment carries, learned the hard way).
 */
async function waitForAnswer(url, accept, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  const first = [];
  while (Date.now() < deadline) {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const text = await response.text();
    last = { status: response.status, text };
    if (first.length < 6) first.push(`${response.status} ${text.slice(0, 120)}`);
    if (accept(last)) return last;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(
    `timed out after ${timeoutMs} ms waiting for ${what}. The last answer was `
    + `status ${last?.status}: ${String(last?.text ?? '').slice(0, 600)}\n`
    + `the first answers were:\n  ${first.join('\n  ')}`,
  );
}

/** Read the port a service reported it bound to (the PortAnnouncer's file). */
async function readPortFile(file, timeoutMs = 90_000) {
  return waitFor(async () => {
    if (!existsSync(file)) return null;
    const raw = readFileSync(file, 'utf8').trim();
    return /^\d+$/.test(raw) ? Number(raw) : null;
  }, timeoutMs, `${file} to carry a port`);
}

/** Start one of the built services and wait until it answers on the port it reported. */
async function startService(service, extraArgs) {
  const portFile = path.join(BUILD_ROOT, `nexus-cloud-proof-${service.id}-port-${STAMP}.txt`);
  started.push(portFile);
  const jar = path.join(BUILD_ROOT, service.id, 'target', service.jar);
  assert.ok(existsSync(jar), `the ${service.id} jar was not built: ${jar}`);

  const child = spawn('java', [...extraArgs, service.heap, '-Dserver.port=0', `-Dnexus.port-file=${portFile}`, '-jar', jar], {
    cwd: path.join(BUILD_ROOT, service.id),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });

  const port = await readPortFile(portFile).catch((e) => {
    throw new Error(`${service.id} never reported its port (${e.message}). Its output was:\n${log.slice(-2000)}`);
  });
  assert.ok(await canConnect(port), `${service.id} reported port ${port} but nothing is listening there`);
  const handle = { port, portFile, child, log: () => log };
  running.set(service.id, handle);
  return handle;
}

async function httpJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body, text };
}

/**
 * Read ONE circuit breaker's own metric from a service.
 *
 * <p>The metric names are the library's, read out of the jar rather than guessed
 * (`io.github.resilience4j.micrometer.tagged.CircuitBreakerMetricNames`, resilience4j 2.2.0):
 * `resilience4j.circuitbreaker.state` is the breaker's state as a gauge, and
 * `resilience4j.circuitbreaker.not.permitted.calls` counts the calls the breaker REFUSED. The tag
 * that says which breaker is `name` — the breaker's own name, which is the same word the
 * configuration file uses.
 *
 * <p>The tag-scoped query is used deliberately: the unscoped endpoint answers with the aggregate
 * over every breaker, and an aggregate cannot say what one breaker did.
 *
 * <p>WHAT THE STATE GAUGE ACTUALLY IS (measured 2026-11-10 — a run of this proof reddened on a read
 * that never could have changed): `resilience4j.circuitbreaker.state` is not ONE gauge. The tagged
 * publisher registers one gauge PER state — closed, open, half_open — tagged `state=<state>` with
 * value 1 when the breaker is in that state and 0 otherwise. Exactly one of the three is 1 at any
 * instant, so reading the name-tagged metric aggregates to 1 no matter which state the breaker is in.
 * The tie is broken by asking for the one `state=<x>` series that this question is about.
 * (Resilience4j micrometer 2.2.0, `io.github.resilience4j.micrometer.tagged.AbstractCircuitBreakerMetrics`:
 * `Gauge.builder(names.getStateMetricName(), cb -> cb.getState() == state ? 1 : 0)`.)
 */
async function readBreakerMetric(baseUrl, metricName, breakerName, stateTag) {
  const url = `${baseUrl}/actuator/metrics/${encodeURIComponent(metricName)}`
    + (breakerName ? `?tag=name:${encodeURIComponent(breakerName)}` : '')
    + (stateTag ? `&tag=state:${encodeURIComponent(stateTag)}` : '');
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await response.text();
  if (response.status !== 200) {
    return { status: response.status, value: null, tag: null, names: [], text };
  }
  let body;
  try { body = JSON.parse(text); } catch { return { status: response.status, value: null, tag: null, names: [], text }; }
  // resilience4j reports two measurement shapes: gauges carry statistic "VALUE", counters carry
  // statistic "COUNT". A proof that only knew one would read a counter's 0.0 as "no data", which is
  // exactly what happened in practice — so accept both and fall back to the first one present.
  const measurement =
    (body?.measurements ?? []).find((m) => m.statistic === 'VALUE')
    ?? (body?.measurements ?? []).find((m) => m.statistic === 'COUNT')
    ?? (body?.measurements ?? [])[0];
  const nameTag = (body?.availableTags ?? []).find((t) => t.tag === 'name');
  return {
    status: response.status,
    value: measurement ? measurement.value : null,
    tag: nameTag?.values?.[0] ?? null,
    names: nameTag?.values ?? [],
    text,
  };
}

/** A failure, and everything that caused it, in one line. */
function describeThrown(error) {
  const parts = [];
  for (let current = error; current; current = current.cause) {
    const code = current.code ?? current.errors?.[0]?.code;
    parts.push([current.name, code, current.message].filter(Boolean).join(' '));
    if (parts.length > 6) break;
  }
  return parts.join(' <- ');
}

/** Ask the container's `psql` to run a statement, and report the exit code. */
function psql(database, sql) {
  return spawnSync(
    'docker',
    ['exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', database, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql],
    { maxBuffer: 32 * 1024 * 1024 },
  );
}

/**
 * Delete planes built by PAST runs of this proof that can no longer be running.
 *
 * A plane outlives its run only when that run was killed: a run that reaches its end removes the
 * plane in §16, green or red. Each plane is named with the `Date.now()` of the run that made it, so
 * age is read from the name rather than from a directory mtime that a long Maven build leaves far
 * behind. The bound below is hours, while a run of this proof is minutes, so anything past it is
 * nobody's live run — and this proof is the only thing that would ever reclaim the rest. Measured
 * 2026-11-09: two 180 MB planes left by killed runs sat unreclaimed until deleted by hand.
 */
function pruneAbandonedPlanes() {
  if (!existsSync(PLANE_ROOT)) return [];
  const abandonBefore = Date.now() - PLANE_ABANDONED_AFTER_MS;
  const gone = [];
  for (const name of readdirSync(PLANE_ROOT)) {
    const m = /^spring-cloud-(\d+)_/.exec(name);
    if (!m || Number(m[1]) > abandonBefore) continue;
    const dir = path.join(PLANE_ROOT, name);
    try {
      rmSync(dir, { recursive: true, force: true });
      gone.push(dir);
    } catch { /* could not be deleted — reported below, never silently */ }
  }
  return gone;
}

async function teardown() {
  for (const child of children) {
    try { child.kill(); } catch { /* already gone */ }
  }
  // The throwaway DATABASES go with the proof. Dropping them is best-effort: a database that could
  // not be dropped is a named leftover, and the name says which run it belongs to.
  for (const name of [DB_NAME_API, DB_NAME_DOMAIN]) {
    spawnSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${name}`]);
  }
  rmSync(BUILD_ROOT, { recursive: true, force: true });
  for (const f of started) rmSync(f, { force: true });
}

try {
  // ── §1 the four jars BUILD ───────────────────────────────────────────────────────────────
  const pruned = pruneAbandonedPlanes();
  if (pruned.length > 0) {
    console.log(`[§1] reclaimed ${pruned.length} plane(s) older than any run of this proof could be`);
  }
  mkdirSync(BUILD_ROOT, { recursive: true });
  for (const service of SERVICES) {
    const copy = path.join(BUILD_ROOT, service.id);
    cpSync(path.join(REPO_ROOT, service.dir), copy, { recursive: true });
    const built = await runMaven(['-o', '-B', 'package', '-DskipTests'], { cwd: copy });
    assert.equal(
      built.code,
      0,
      `the ${service.id} service did not build. Its output was:\n${built.out.slice(-3000)}`,
    );
    // An exit code is not an artifact. Measured 2026-11-09, run v643: four Maven commands returned
    // four zeros and §1 printed four "built" lines, and §2 then could not find the registry jar —
    // the directory the jars had been written into was emptied while the run was still going. A
    // green sentence about a build must be paid for by the file the next clause is about to read.
    const jar = path.join(copy, 'target', service.jar);
    assert.ok(
      existsSync(jar),
      `the ${service.id} build exited 0 but left no ${jar}. Its output was:\n${built.out.slice(-3000)}`,
    );
    console.log(`[§1] ${service.id} built: ${service.jar}`);
  }

  // ── §2 the registry answers on a port it was told to use ────────────────────────────────
  const registry = await startService(SERVICES[0], []);
  const registryBase = `http://127.0.0.1:${registry.port}`;
  const health = await httpJson(`${registryBase}/actuator/health`);
  assert.equal(health.status, 200, `the registry did not answer its own health question: ${health.text}`);
  assert.ok(String(health.text).includes('UP'), `the registry is not UP: ${health.text}`);
  console.log(`[§2] the registry answered on port ${registry.port} and reports UP`);

  // ── §3 two throwaway databases, one of them carrying the REAL schema ────────────────────
  // The domain service is the authoritative write path for tables that DRIZZE owns, and it runs with
  // `ddl-auto: validate` — on purpose, so it refuses to start if its mapping disagrees with the
  // schema. That honesty has a cost for a proof: an EMPTY database has no `projects` table, and the
  // service would (correctly) refuse to start against it.
  //
  // So the schema is COPIED, not invented: `pg_dump --schema-only` out of the platform's own database,
  // into a fresh one. The proof therefore runs against the real shape — the real enum types, the
  // real indexes, the real constraints — and it still touches none of the platform's data, because
  // the rows it reads are the rows it inserted.
  const created = await run('docker', [
    'exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', 'postgres',
    '-c', `CREATE DATABASE ${DB_NAME_API}`,
  ]);
  assert.equal(
    created.code,
    0,
    `could not create the throwaway database ${DB_NAME_API} inside ${DB_CONTAINER}. Its answer was:\n${created.out}`,
  );

  const dump = spawnSync(
    'docker',
    ['exec', DB_CONTAINER, 'pg_dump', '-U', DB_USER, '-d', DB_PLATFORM, '--schema-only', '--no-owner', '--no-privileges'],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(dump.status, 0, `pg_dump failed: ${dump.stderr?.toString().slice(-1500)}`);
  assert.ok(dump.stdout.length > 1000, 'pg_dump produced nothing to copy');

  const createdDomain = await run('docker', [
    'exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', 'postgres',
    '-c', `CREATE DATABASE ${DB_NAME_DOMAIN}`,
  ]);
  assert.equal(createdDomain.code, 0, `could not create ${DB_NAME_DOMAIN}: ${createdDomain.out}`);

  const applied = await run(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME_DOMAIN, '-v', 'ON_ERROR_STOP=1', '-q'],
    { input: dump.stdout },
  );
  assert.equal(
    applied.code,
    0,
    `the real schema did not apply to ${DB_NAME_DOMAIN}. Its answer was:\n${applied.out.slice(-2500)}`,
  );

  // The proof's own rows: a user (the project's owner) and a project.
  const seeded = psql(
    DB_NAME_DOMAIN,
    `INSERT INTO users (id, display_name, role, plan, guest, created_at, updated_at) `
    + `VALUES ('${PROOF_USER_ID}', 'cloud proof', 'creator', 'free', false, now(), now()); `
    + `INSERT INTO projects (id, owner_id, slug, name, kind, visibility, created_at, updated_at) `
    + `VALUES ('${PROOF_PROJECT_ID}', '${PROOF_USER_ID}', '${PROOF_PROJECT_SLUG}', 'Cloud Proof Project', `
    + `'website', 'private', now(), now());`,
  );
  assert.equal(seeded.status, 0, `could not seed the proof's own rows: ${seeded.stderr?.toString().slice(-1500)}`);

  await waitFor(() => canConnect(DB_PORT, 2000), 60_000, 'the PostgreSQL container to accept connections');
  console.log(
    `[§3] two throwaway databases: ${DB_NAME_API} (empty) and ${DB_NAME_DOMAIN} (the REAL schema, `
    + `copied with pg_dump — ${dump.stdout.length} bytes)`,
  );

  // ── §4 the DOMAIN SERVICE starts against the real schema and REGISTERS ITSELF ───────────
  const domain = await startService(SERVICES[3], [
    `-Dspring.datasource.url=jdbc:postgresql://127.0.0.1:${DB_PORT}/${DB_NAME_DOMAIN}`,
    `-Dspring.datasource.username=${DB_USER}`,
    `-Dspring.datasource.password=${DB_PASSWORD}`,
    '-DNEXUS_EUREKA_ENABLED=true',
    `-DNEXUS_EUREKA_URL=${registryBase}/eureka/`,
  ]);
  const domainHealth = await waitFor(async () => {
    const answer = await httpJson(`http://127.0.0.1:${domain.port}/health`);
    return answer.status === 200 ? answer : null;
  }, 60_000, 'the domain service to answer its own health question');
  assert.equal(domainHealth.body.service, 'nexus-domain-service');
  assert.equal(domainHealth.body.database.reachable, true, `the domain service cannot see its database: ${domainHealth.text}`);
  console.log(`[§4] the domain service answered on port ${domain.port} and reports its database reachable`);

  const domainListing = await waitFor(async () => {
    const listed = await httpJson(`${registryBase}/eureka/apps`);
    return listed.status === 200 && listed.text.includes('NEXUS-DOMAIN-SERVICE') ? listed : null;
  }, 60_000, 'the domain service to appear in the registry');
  assert.ok(domainListing.text.includes('NEXUS-DOMAIN-SERVICE'));
  console.log('[§4] the registry now NAMES the domain service — it found itself through discovery');

  // ── §5 nexus-api starts against its own database and REGISTERS ITSELF ───────────────────
  const api = await startService(SERVICES[2], [
    `-Dspring.datasource.url=jdbc:postgresql://127.0.0.1:${DB_PORT}/${DB_NAME_API}`,
    `-Dspring.datasource.username=${DB_USER}`,
    `-Dspring.datasource.password=${DB_PASSWORD}`,
    // The discovery client is ON for this run — that is what §5 is about.
    '-DNEXUS_EUREKA_ENABLED=true',
    `-DNEXUS_EUREKA_URL=${registryBase}/eureka/`,
  ]);
  console.log(`[§5] nexus-api answered on port ${api.port} against the throwaway database ${DB_NAME_API}`);

  const registryListing = await waitFor(async () => {
    const listed = await httpJson(`${registryBase}/eureka/apps`);
    return listed.status === 200 && listed.text.includes('NEXUS-API') ? listed : null;
  }, 60_000, 'nexus-api to appear in the registry');
  assert.ok(registryListing.text.includes('NEXUS-API'));
  console.log('[§5] the registry now NAMES nexus-api — the service found itself through discovery');

  // ── §6 the edge routes a NAME, not an address ───────────────────────────────────────────
  const gateway = await startService(SERVICES[1], [
    // `lb://nexus-api` is the whole point of this section: the gateway is given a SERVICE NAME and
    // must learn the address from the registry. A hard-coded URL would make this section prove
    // nothing, so it is deliberately not used.
    '-DNEXUS_GATEWAY_NEXUS_API_URI=lb://nexus-api',
    '-DNEXUS_EUREKA_ENABLED=true',
    `-DNEXUS_EUREKA_URL=${registryBase}/eureka/`,
  ]);
  const gatewayBase = `http://127.0.0.1:${gateway.port}`;

  // The gateway may need a moment to learn the registry's contents; poll rather than sleep.
  //
  // The assertion is on the body NAMES the service that answered (`{"service":"nexus-api",…}`),
  // not merely that the status was 200. A 200 proves the edge is alive; a body naming nexus-api
  // proves the edge sent the request THERE — which is the whole claim of this section. The first
  // draft of this check looked for a `"status"` field, which the health body does not have: it
  // waited out its whole deadline on a request that had in fact SUCCEEDED, and reported a routing
  // failure that was a typo in the assertion.
  const routed = await waitFor(async () => {
    const response = await fetch(`${gatewayBase}/api/health`, { headers: { Accept: 'application/json' } });
    if (response.status !== 200) return null;
    const text = await response.text();
    return text.includes('"service":"nexus-api"') ? { status: response.status, text } : null;
  }, 60_000, 'the gateway to route lb://nexus-api to the live service');
  assert.equal(routed.status, 200);
  console.log(`[§6] the gateway routed lb://nexus-api to the live service, which named itself: ${routed.text.slice(0, 160)}`);

  // ── §7 the TYPED CALL: four processes, two databases, one name ──────────────────────────
  // The whole microservice claim in one request:
  //   the edge → nexus-api → (Feign, BY NAME) → the domain service → PostgreSQL.
  //
  // The assertion is on the ROW: the slug, the kind and the timestamps must be the ones the proof
  // inserted, read back out of the domain service's own database through the service's own
  // mapping. A 200 alone would prove nothing — nexus-api could have answered 200 with a body it
  // invented, and the point of this repository's §159 is that a service must never answer with a
  // fact it did not establish.
  const projectRead = await waitFor(async () => {
    const response = await fetch(`${gatewayBase}/api/domain/projects/${PROOF_PROJECT_ID}`, {
      headers: { Accept: 'application/json' },
    });
    const text = await response.text();
    if (response.status !== 200) return null;
    let body;
    try { body = JSON.parse(text); } catch { return null; }
    return body?.project?.slug === PROOF_PROJECT_SLUG ? { status: response.status, body, text } : null;
  }, 90_000, 'the typed call to reach the domain service and return the row');
  assert.equal(projectRead.status, 200);
  assert.equal(projectRead.body.state, 'found');
  assert.equal(projectRead.body.project.id, PROOF_PROJECT_ID);
  assert.equal(projectRead.body.project.kind, 'website');
  assert.equal(projectRead.body.project.visibility, 'private');
  assert.ok(
    projectRead.body.project.createdAt,
    'the timestamps the client declares must actually arrive; a field that is always null is not a field',
  );
  console.log(
    `[§7] the edge → nexus-api → lb://nexus-domain-service → PostgreSQL chain returned the row the proof `
    + `inserted: ${projectRead.text.slice(0, 220)}`,
  );

  // ── §8 an id the domain service does not hold is a 404 — a fact ABOUT THE PROJECT ───────
  const unknownId = randomUUID();
  const missing = await waitForAnswer(
    `${gatewayBase}/api/domain/projects/${unknownId}`,
    (answer) => answer.status === 404,
    60_000,
    'the typed call to answer 404 for an id the domain service does not hold',
  );
  const missingBody = JSON.parse(missing.text);
  assert.equal(missingBody.state, 'not-found');
  assert.equal(missingBody.project, null, 'a project that is not there is not a project with no fields');
  console.log(`[§8] an id the domain service does not hold answered 404 and said so: ${missing.text.slice(0, 200)}`);

  // ── §9 the BREAKER says what it is doing ────────────────────────────────────────────────
  // A 503 says "the service could not be reached". It does not say WHICH component stopped the
  // call, and "which" is the question an operator asks first.
  //
  // The breaker's own metric answers it — and the metric's `name` tag is the breaker's OWN name.
  // That is worth proving rather than assuming: the trail started with a configuration file that
  // named a breaker (`nexus-domain-service`) which the library was NOT using, so the file looked
  // right while the runtime did something else. Here the runtime's own name is read back out of
  // the running service, and it is the same word.
  const apiBreakerNames = await readBreakerMetric(
    `http://127.0.0.1:${api.port}`, 'resilience4j.circuitbreaker.state', null);
  assert.equal(apiBreakerNames.status, 200,
    `nexus-api must expose its breaker's state; the actuator answered ${apiBreakerNames.status}: ${apiBreakerNames.text.slice(0, 400)}`);
  assert.ok(
    apiBreakerNames.names.includes('nexus-domain-service'),
    `the running breaker must be the one the configuration file names; the running names were: ${JSON.stringify(apiBreakerNames.names)}`,
  );

  const apiBreakerState = await readBreakerMetric(
    `http://127.0.0.1:${api.port}`, 'resilience4j.circuitbreaker.state', 'nexus-domain-service', 'closed');
  const apiNotPermitted = await readBreakerMetric(
    `http://127.0.0.1:${api.port}`, 'resilience4j.circuitbreaker.not.permitted.calls', 'nexus-domain-service');
  assert.equal(apiBreakerState.value, 1,
    `the breaker starts CLOSED; the actuator answered: ${apiBreakerState.text.slice(0, 400)}`);
  // The "calls refused" counter is only published once something HAS been refused — a counter that
  // never incremented is not in the registry, and the endpoint answers 404. Both readings mean the
  // same thing here: nothing has been refused yet. (Measured: the first run of this proof failed
  // here, asserting 0 against a metric that did not exist.)
  assert.ok(
    apiNotPermitted.status === 404 || apiNotPermitted.value === 0,
    'nothing has been refused yet, so the breaker must not have refused anything; the actuator '
      + `answered ${apiNotPermitted.status}: ${apiNotPermitted.text.slice(0, 300)}`,
  );

  const edgeBreakerNames = await readBreakerMetric(
    `${gatewayBase}`, 'resilience4j.circuitbreaker.state', null);
  assert.ok(
    edgeBreakerNames.names.includes('nexusApiCircuitBreaker'),
    `the edge's running breaker must be the one its route table names; the running names were: ${JSON.stringify(edgeBreakerNames.names)}`,
  );
  console.log(
    `[§9] both breakers are visible and are named what the configuration says: nexus-api's `
    + `\`nexus-domain-service\` (closed gauge ${apiBreakerState.value}, ${apiNotPermitted.value} calls refused) and the edge's `
    + `\`nexusApiCircuitBreaker\``,
  );

  // ── §10 every service reports its OWN health ─────────────────────────────────────────────
  // Four services, four doors, four answers — each one about itself, and each one real.
  //
  // Two of them answer in Spring Boot's own shape (`{"status":"UP"}`) and two in this platform's
  // (the service names itself AND says whether its database is reachable). Both shapes are
  // checked for what they actually claim: an actuator that said UP while the database was gone
  // would be worse than no answer at all.
  const actuatorHealth = [
    { who: 'the registry', url: `${registryBase}/actuator/health` },
    { who: 'the edge', url: `${gatewayBase}/actuator/health` },
    { who: 'nexus-api (the operator door)', url: `http://127.0.0.1:${api.port}/actuator/health` },
  ];
  for (const one of actuatorHealth) {
    const answer = await httpJson(one.url);
    assert.equal(answer.status, 200, `${one.who} must answer its own health question; it answered ${answer.status}`);
    assert.equal(answer.body?.status, 'UP', `${one.who} must report itself UP; it said: ${answer.text.slice(0, 300)}`);
  }

  const platformHealth = [
    { who: 'the domain service', url: `http://127.0.0.1:${domain.port}/health`, service: 'nexus-domain-service' },
    { who: 'nexus-api', url: `http://127.0.0.1:${api.port}/health`, service: 'nexus-api' },
  ];
  for (const one of platformHealth) {
    const answer = await httpJson(one.url);
    assert.equal(answer.status, 200, `${one.who} must answer its own health question; it answered ${answer.status}`);
    assert.equal(answer.body?.service, one.service, `${one.who} must name itself; it said: ${answer.text.slice(0, 300)}`);
    assert.equal(
      answer.body?.database?.reachable, true,
      `${one.who} must be able to reach its database — or say that it cannot; it said: ${answer.text.slice(0, 300)}`,
    );
  }
  console.log('[§10] all four services answered their own health question, and said UP about themselves');

  // ── §11 the REGISTRY dies, and the chain keeps working ──────────────────────────────────
  // The interesting half of discovery: a service that has LEARNED where another service lives
  // keeps working when the registry stops answering, because the client holds what it learned.
  //
  // This is asserted immediately after the registry is stopped — the claim is about the topology,
  // not about how long Eureka's lease lasts. How long it lasts is a property of Eureka, so it is
  // MEASURED below rather than promised here.
  registry.child.kill();
  await new Promise((r) => setTimeout(r, 3000));
  assert.ok(!(await canConnect(registry.port)), 'the registry must really be gone for this section to mean anything');

  const afterRegistry = await waitForAnswer(
    `${gatewayBase}/api/domain/projects/${PROOF_PROJECT_ID}`,
    (answer) => answer.status === 200,
    60_000,
    'the four-service chain to keep working with the registry gone',
  );
  const afterRegistryBody = JSON.parse(afterRegistry.text);
  assert.equal(afterRegistryBody.project?.slug, PROOF_PROJECT_SLUG,
    `the row must still be the row the proof inserted; it was: ${afterRegistry.text.slice(0, 300)}`);
  console.log(
    '[§11] with the registry GONE the edge → nexus-api → domain-service → PostgreSQL chain still '
    + `returned the row: ${afterRegistry.text.slice(0, 180)}`,
  );

  // How long that lasts is a MEASUREMENT, not a promise: Eureka's lease and the client's fetch
  // interval decide it, and this section reports what it saw rather than claiming a duration.
  await new Promise((r) => setTimeout(r, 40_000));
  const laterAnswer = await httpJson(`${gatewayBase}/api/domain/projects/${PROOF_PROJECT_ID}`);
  console.log(
    `[§11] 40 s after the registry died (one Eureka fetch interval plus its cache TTL) the same call `
    + `answered ${laterAnswer.status} — measured, not promised: ${String(laterAnswer.text).slice(0, 160)}`,
  );

  // ── §12 with the domain service GONE, the service-to-service door says so ─────────────────
  // This is the section that cannot be faked. The URL is the SAME one that answered 200 a moment
  // ago; the only thing that changed is that the service behind it is gone. The answer must be a
  // 503 that NAMES the domain service — because "the service is down" and "the project does not
  // exist" are different facts, and a caller that received a 404 here would tell a user that
  // their project had been deleted.
  //
  // It is asked of nexus-api DIRECTLY first, because that is the claim this section is about: the
  // service-to-service boundary. The edge's own answer is asked separately below, because the edge
  // has its own breaker and its own honest 503 — and the two layers may answer in either order
  // (measured: with the domain service dead, nexus-api waits for the call to time out, and the
  // edge's breaker may open and answer first).
  domain.child.kill();
  await new Promise((r) => setTimeout(r, 3000));
  const downstreamGone = await waitForAnswer(
    `http://127.0.0.1:${api.port}/domain/projects/${PROOF_PROJECT_ID}`,
    (answer) => answer.status === 503,
    90_000,
    'the typed call to answer 503 once the domain service is gone',
  );
  const goneBody = JSON.parse(downstreamGone.text);
  assert.equal(goneBody.state, 'downstream-unavailable');
  assert.equal(goneBody.project, null, 'an unreachable service must not produce a project, not even an empty one');
  assert.ok(
    String(goneBody.reason ?? '').includes('domain'),
    `the 503 must name the service that could not be reached; its reason was: ${downstreamGone.text}`,
  );
  // WHICH failure it was — the answer has to say it, not just that something was unreachable.
  assert.ok(
    String(goneBody.failure ?? '').length > 0,
    `the 503 must carry the kind of failure; its body was: ${downstreamGone.text}`,
  );
  console.log(
    `[§12] with the domain service gone the service-to-service door answered 503, named it, and said `
    + `which failure it was (${goneBody.failure}): ${downstreamGone.text.slice(0, 220)}`,
  );

  // The same question, asked THROUGH the edge. The answer must be a 503 as well — and the body must
  // say the upstream was unavailable, whichever layer answered: the edge's own fallback names
  // `nexus-api`, and the api's own answer names the domain service. Both are true, and neither is a
  // 200 with an empty body.
  const throughEdge = await waitForAnswer(
    `${gatewayBase}/api/domain/projects/${PROOF_PROJECT_ID}`,
    (answer) => answer.status === 503,
    60_000,
    'the edge to answer 503 for a call whose downstream is gone',
  );
  assert.ok(
    throughEdge.text.includes('unavailable'),
    `the edge's answer must say the upstream was unavailable; it was: ${throughEdge.text}`,
  );
  console.log(`[§12] through the edge the same call answered 503 too: ${throughEdge.text.slice(0, 200)}`);

  // ── §13 the breaker OPENS, and the refusal is attributed ────────────────────────────────
  // §12 proved that the answer is honest. It did NOT prove which component refused the call: a
  // 503 says a service was unreachable, and the refusal could have come from the breaker, from
  // the network, or from the service itself.
  //
  // The breaker answers for itself. Its configuration asks for 20 calls before it may open, so the
  // proof asks 20 times — and then reads the two things that must agree: the metric that counts
  // the calls the breaker REFUSED, and the answer's own `failure` field.
  let breakerRefusal = null;
  const refusals = [];
  for (let attempt = 0; attempt < 40 && !breakerRefusal; attempt += 1) {
    const answer = await httpJson(`http://127.0.0.1:${api.port}/domain/projects/${PROOF_PROJECT_ID}`);
    if (answer.status !== 503) continue;
    const kind = answer.body?.failure ?? null;
    refusals.push(kind);
    if (kind === 'circuit-breaker-open') breakerRefusal = answer;
  }
  assert.ok(
    breakerRefusal,
    `the breaker must open and refuse, and the answer must say so; the kinds it gave were: ${JSON.stringify(refusals)}`,
  );

  const notPermitted = await readBreakerMetric(
    `http://127.0.0.1:${api.port}`, 'resilience4j.circuitbreaker.not.permitted.calls', 'nexus-domain-service');
  assert.ok(
    notPermitted.value !== null && notPermitted.value > 0,
    `the breaker's own metric must count the calls it refused; the actuator said: ${notPermitted.text.slice(0, 400)}`,
  );
  const openState = await readBreakerMetric(
    `http://127.0.0.1:${api.port}`, 'resilience4j.circuitbreaker.state', 'nexus-domain-service', 'open');
  assert.equal(
    openState.value, 1,
    `the breaker's OPEN gauge must read 1 once it opened; the actuator answered: ${openState.text.slice(0, 400)}`,
  );
  console.log(
    `[§13] the breaker opened and took the blame for it: it refused ${notPermitted.value} calls, its OPEN-state gauge read `
    + `${openState.value}, and the answer says "circuit-breaker-open"`,
  );

  // ── §14 with nexus-api gone, the edge says so ──────────────────────────────────────────
  api.child.kill();
  await new Promise((r) => setTimeout(r, 2000));
  const refused = await waitForAnswer(
    `${gatewayBase}/api/health`,
    (answer) => answer.status === 503,
    60_000,
    'the gateway to answer 503 once the service behind it is gone',
  );
  assert.ok(
    refused.text.includes('upstream-unavailable') && refused.text.includes('nexus-api'),
    `the edge's failure answer must NAME the upstream; it was: ${refused.text}`,
  );
  console.log(`[§14] with nexus-api gone the edge answered 503 and named it: ${refused.text.slice(0, 200)}`);

  // ── §15 with the EDGE gone, the caller gets a connection error ─────────────────────────
  // The last honest boundary. §14 and §12 are answers: something was THERE and it said so. This
  // is not an answer — the edge is not there any more, so the caller gets a refused connection.
  //
  // It is worth stating plainly, because the tempting alternative is to keep the edge alive and
  // let it answer 503 for itself: then every failure looks the same, and a caller cannot tell
  // "the edge is gone" from "the service behind the edge is gone". Two different problems, two
  // different fixes, and the difference is visible in what the caller receives.
  gateway.child.kill();
  await new Promise((r) => setTimeout(r, 2000));
  let edgeError = null;
  try {
    const response = await fetch(`${gatewayBase}/api/health`);
    edgeError = `the edge answered ${response.status}: ${(await response.text()).slice(0, 200)}`;
  } catch (error) {
    edgeError = describeThrown(error);
  }
  assert.ok(
    /ECONNREFUSED|ECONNRESET|fetch failed|EPIPE/.test(edgeError),
    `with the edge gone the caller must get a connection error, not an invented answer; it got: ${edgeError}`,
  );
  console.log(`[§15] with the edge gone the caller got a connection error, not an invented answer: ${edgeError}`);

  // ── §16 everything this file created is gone afterwards ─────────────────────────────────
  console.log('[§16] tearing down the throwaway databases, the processes and the build copies');
} catch (error) {
  console.error(`\n[§?] the proof FAILED: ${error?.stack ?? error}`);
  // What the services SAID, not just what the proof saw. Measured on the run that first found the
  // circuit-breaker naming bug: the proof knew only that the answer was a 503, and the reason
  // ("No fallback available.") was in nexus-api's log, where nobody was looking.
  for (const [id, service] of running) {
    const text = service.log();
    if (!text.trim()) continue;
    console.error(`\n--- ${id} said (last 12000 characters) ---\n${text.slice(-12000)}`);
  }
  process.exitCode = 1;
} finally {
  await teardown();
  console.log('[§16] the throwaway databases, the four processes and the build copies are gone');
}
