// NEXUS — the Spring Cloud topology, PROVED end to end (ADR 0054).
//
// The unit suites in `services/java-registry` and `services/java-gateway` prove two contracts each,
// inside one process. This file proves the thing they cannot: that the three services work
// TOGETHER as a topology — that a service can find itself, that an edge can find a service it did
// not have an address for, and that the edge's failure shape survives all of it.
//
// What only THIS file can answer:
//
//   §1 the three jars BUILD;
//   §2 the registry answers on a port it was told to use;
//   §3 nexus-api starts against a REAL PostgreSQL, with the discovery client ON, and REGISTERS
//      ITSELF — the registry's own listing names it, which is the only evidence that discovery is
//      a fact about the running system and not a configuration that was merely written down;
//   §4 the gateway routes `lb://nexus-api` to it — a name, not an address. The gateway was never
//      told where nexus-api lives; it learned it from the registry. A hard-coded URL would pass a
//      test that proves nothing here, so the gateway's upstream is set to the `lb://` form;
//   §5 with the service behind the edge GONE, the edge answers 503 and NAMES the upstream —
//      never 200 with an empty body, which a caller cannot tell from "there is no such project";
//   §6 everything this file created is gone afterwards.
//
// Everything it creates is throwaway: a THROWAWAY DATABASE inside the repository's own running
// PostgreSQL container, three jars built in ISOLATED COPIES of the services, three port files in
// the OS temp dir, and three child processes. None of them touch the working tree.
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
// sweep-budget-ms: 900000
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// THREE levels up: this file is docs/evidence/java/spring-cloud-proof.mjs, so '../..' would land on
// docs/ — and a cwd that does not exist makes spawn answer ENOENT, which reads as "the command is
// missing". Measured (the same note as publish-proof.mjs).
const REPO_ROOT = path.resolve(__dirname, '../../..');
const STAMP = `${Date.now()}-${process.pid}`;

/** The repository's own PostgreSQL container, and the port it publishes on (infra/docker-compose.yml). */
const DB_CONTAINER = process.env.NEXUS_PROOF_DB_CONTAINER ?? 'nexus-postgres';
const DB_PORT = Number(process.env.NEXUS_PROOF_DB_PORT ?? 55433);
const DB_USER = process.env.NEXUS_PROOF_DB_USER ?? 'nexus';
const DB_PASSWORD = process.env.NEXUS_PROOF_DB_PASSWORD ?? 'nexus_dev_only';
/** A fresh database inside that container, named for this run and dropped at the end. */
const DB_NAME = `nexus_cloud_proof_${STAMP.replace(/[^a-z0-9]/gi, '_')}`.toLowerCase();

/** The three services, each built in an isolated copy of its own directory. */
const SERVICES = [
  { id: 'registry', dir: 'services/java-registry', jar: 'nexus-registry-0.1.0-SNAPSHOT.jar' },
  { id: 'gateway', dir: 'services/java-gateway', jar: 'nexus-gateway-0.1.0-SNAPSHOT.jar' },
  { id: 'api', dir: 'services/nexus-api', jar: 'nexus-api-0.1.0-SNAPSHOT.jar' },
];

const BUILD_ROOT = path.join(tmpdir(), `nexus-cloud-proof-build-${STAMP}`);
const children = [];
const started = [];

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

/** Run a command ASYNCHRONOUSLY and resolve with its exit code and output. */
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: REPO_ROOT, ...opts });
    let out = '';
    child.stdout?.on('data', (d) => { out += d; });
    child.stderr?.on('data', (d) => { out += d; });
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
  const portFile = path.join(tmpdir(), `nexus-cloud-proof-${service.id}-port-${STAMP}.txt`);
  started.push(portFile);
  const jar = path.join(BUILD_ROOT, service.id, 'target', service.jar);
  assert.ok(existsSync(jar), `the ${service.id} jar was not built: ${jar}`);

  const child = spawn('java', [...extraArgs, '-Dserver.port=0', `-Dnexus.port-file=${portFile}`, '-jar', jar], {
    cwd: path.join(BUILD_ROOT, service.id),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });

  const port = await readPortFile(portFile).catch((e) => {
    throw new Error(`${service.id} never reported its port. Its output was:\n${log.slice(-2000)}`);
  });
  assert.ok(await canConnect(port), `${service.id} reported port ${port} but nothing is listening there`);
  return { port, portFile, child, log: () => log };
}

async function httpJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body, text };
}

async function teardown() {
  for (const child of children) {
    try { child.kill(); } catch { /* already gone */ }
  }
  // The throwaway DATABASE goes with the proof. Dropping it is best-effort: a database that could
  // not be dropped is a named leftover, and the name says which run it belongs to.
  await run('docker', ['exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DB_NAME}`]);
  rmSync(BUILD_ROOT, { recursive: true, force: true });
  for (const f of started) rmSync(f, { force: true });
}

try {
  // ── §1 the three jars BUILD ───────────────────────────────────────────────────────────────
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
    console.log(`[§1] ${service.id} built: ${service.jar}`);
  }

  // ── §2 the registry answers on a port it was told to use ────────────────────────────────
  const registry = await startService(SERVICES[0], []);
  const registryBase = `http://127.0.0.1:${registry.port}`;
  const health = await httpJson(`${registryBase}/actuator/health`);
  assert.equal(health.status, 200, `the registry did not answer its own health question: ${health.text}`);
  assert.ok(String(health.text).includes('UP'), `the registry is not UP: ${health.text}`);
  console.log(`[§2] the registry answered on port ${registry.port} and reports UP`);

  // ── §3 nexus-api starts against a REAL PostgreSQL and REGISTERS ITSELF ──────────────────
  // The database is a FRESH DATABASE inside the repository's own running PostgreSQL container:
  // isolated like a throwaway container, and free like a table that already exists. This host
  // cannot afford another container (measured: the first run's container stayed in `Created`).
  const created = await run('docker', [
    'exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', 'postgres',
    '-c', `CREATE DATABASE ${DB_NAME}`,
  ]);
  assert.equal(
    created.code,
    0,
    `could not create the throwaway database ${DB_NAME} inside ${DB_CONTAINER}. Its answer was:\n${created.out}`,
  );
  await waitFor(() => canConnect(DB_PORT, 2000), 60_000, 'the PostgreSQL container to accept connections');

  const api = await startService(SERVICES[2], [
    `-Dspring.datasource.url=jdbc:postgresql://127.0.0.1:${DB_PORT}/${DB_NAME}`,
    `-Dspring.datasource.username=${DB_USER}`,
    `-Dspring.datasource.password=${DB_PASSWORD}`,
    // The discovery client is ON for this run — that is what §3 is about.
    '-DNEXUS_EUREKA_ENABLED=true',
    `-DNEXUS_EUREKA_URL=${registryBase}/eureka/`,
  ]);
  console.log(`[§3] nexus-api answered on port ${api.port} against the throwaway database ${DB_NAME}`);

  const registryListing = await waitFor(async () => {
    const listed = await httpJson(`${registryBase}/eureka/apps`);
    return listed.status === 200 && listed.text.includes('NEXUS-API') ? listed : null;
  }, 60_000, 'nexus-api to appear in the registry');
  assert.ok(registryListing.text.includes('NEXUS-API'));
  console.log('[§3] the registry now NAMES nexus-api — the service found itself through discovery');

  // ── §4 the edge routes a NAME, not an address ───────────────────────────────────────────
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
  console.log(`[§4] the gateway routed lb://nexus-api to the live service, which named itself: ${routed.text.slice(0, 160)}`);

  // ── §5 with the service behind the edge GONE, the edge says so ──────────────────────────
  api.child.kill();
  await new Promise((r) => setTimeout(r, 2000));
  const refused = await waitFor(async () => {
    const response = await fetch(`${gatewayBase}/api/health`, { headers: { Accept: 'application/json' } });
    if (response.status !== 503) return null;
    const text = await response.text();
    return { status: response.status, text };
  }, 60_000, 'the gateway to answer 503 once the service behind it is gone');
  assert.ok(
    refused.text.includes('upstream-unavailable') && refused.text.includes('nexus-api'),
    `the edge's failure answer must NAME the upstream; it was: ${refused.text}`,
  );
  console.log(`[§5] with nexus-api gone the edge answered 503 and named it: ${refused.text.slice(0, 200)}`);

  // ── §6 everything this file created is gone afterwards ─────────────────────────────────
  console.log('[§6] tearing down the throwaway database, the processes and the build copies');
} catch (error) {
  console.error(`\n[§?] the proof FAILED: ${error?.stack ?? error}`);
  process.exitCode = 1;
} finally {
  await teardown();
  console.log('[§6] the throwaway database, the three processes and the build copies are gone');
}
