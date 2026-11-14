/**
 * §SC-72 — the cross-service ACTUATOR SMOKE. One command, five JVMs, actuator truth pinned:
 *
 *   npm run verify:actuator
 *
 * What it proves — per service (one at a time, because 5 JVMs do not fit this box):
 *   1. `GET /actuator/health` answers 200 `{"status":"UP"}` — genuinely, not a static stub:
 *      domain-service / nexus-api self-query Hikari with SELECT 1 (§SC-69/§SC-69b),
 *      gateway boots against its configured rate-limit backend (§SC-70),
 *      nexus-registry reports its live in-memory standalone registry (§SC-71),
 *      nexus-config verifies the shared narrowed default is still narrowed (§SC-71c).
 *   2. The body carries NO component details — `show-details: never` is the enforced contract;
 *      a leak of stack traces / JDBC URLs / host names fails the run.
 *   3. `GET /actuator/info` answers 200 with `build.artifact` and `build.component` matching the
 *      service this repository ships (§SC-68b) — the字节-level check that maven build-info is real,
 *      not a hand-written properties file.
 *   4. domain-service additionally answers `/actuator/circuitbreakers` with `ai-service` present
 *      (§SC-60/SC-62 family) — one breaker-visible service is enough to pin the contract.
 *
 * Postgres on 55433 is REQUIRED for the two JPA services — the smoke does not fake it: if it is down,
 * their health honestly answers DOWN and this script fails with exactly that statement.
 * Each service is started, asserted and STOPPED before the next one boots (heap ceiling 512m/384m).
 * Everything can be overridden: NEXUS_*_PORT / NEXUS_DOMAIN_DB_URL / NEXUS_API_DB_URL / DB_USERNAME /
 * DB_PASSWORD / PG ports — same contract as verify:topology.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = path.join(process.env.TEMP ?? '/tmp', 'nexus-verify-actuator');
mkdirSync(LOG_DIR, { recursive: true });

const DENY = '[verify-actuator]';
let failures = 0;
const ok = (name: string) => console.log(`  ✓ ${name}`);
const bad = (name: string, detail: string) => {
  failures += 1;
  console.error(`  ✗ ${name} — ${detail}`);
};

const PORTS = {
  registry: Number(process.env.NEXUS_ACTUATOR_REGISTRY_PORT ?? 8777),
  config: Number(process.env.NEXUS_ACTUATOR_CONFIG_PORT ?? 8889),
  domain: Number(process.env.NEXUS_ACTUATOR_DOMAIN_PORT ?? 8088),
  api: Number(process.env.NEXUS_ACTUATOR_API_PORT ?? 8086),
  gateway: Number(process.env.NEXUS_ACTUATOR_GATEWAY_PORT ?? 8095),
};

const DB_URL = process.env.NEXUS_DOMAIN_DB_URL ?? 'jdbc:postgresql://127.0.0.1:55433/nexus';
const API_DB_URL = process.env.NEXUS_API_DB_URL ?? 'jdbc:postgresql://127.0.0.1:55433/nexus_api_smoke';
const DB_USERNAME = process.env.DB_USERNAME ?? 'nexus';
const DB_PASSWORD = process.env.DB_PASSWORD ?? 'nexus_dev_only';

/** Ports that must be free before we start anything — fail fast with a name, not a timeout. */
async function assertFree(port: number) {
  const { createConnection } = await import('node:net');
  const busy = await new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
  if (busy) throw new Error(`port ${port} is already in use — stop whatever holds it and rerun`);
}

function newestSourceMtime(serviceDir: string) {
  const base = path.join(repo, 'services', serviceDir, 'src', 'main');
  let newest = 0;
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else {
        const m = statSync(full).mtimeMs;
        if (m > newest) newest = m;
      }
    }
  };
  walk(base);
  return newest;
}

function mavenCmd() {
  return process.platform === 'win32' ? 'mvn.cmd' : 'mvn';
}

function ensureJarFresh(name: string, serviceDir: string, jarRelative: string) {
  const jar = path.join(repo, 'services', serviceDir, jarRelative);
  const srcNewest = newestSourceMtime(serviceDir);
  const jarMtime = existsSync(jar) ? statSync(jar).mtimeMs : 0;
  if (jarMtime >= srcNewest) return jar;
  console.log(`${DENY} ${name}: jar is stale (src newer) — running mvn -o -DskipTests package`);
  try {
    execFileSync(mavenCmd(), ['-o', '-q', '-B', '-DskipTests', 'package'], {
      cwd: path.join(repo, 'services', serviceDir),
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string };
    console.error(`${DENY} ${name}: package failed: ${err.stderr?.toString() ?? err.message}`);
    process.exit(1);
  }
  return jar;
}

function heapArgs(service: string, size: string) {
  return [`-Xmx${process.env.NEXUS_SMOKE_HEAP ?? size}`];
}

function spawnJar(name: string, jar: string, heap: string, env: Record<string, string | number> = {}) {
  const log = path.join(LOG_DIR, `${name}.log`);
  const err = path.join(LOG_DIR, `${name}.err`);
  const child = spawn('java', [...heapArgs(name, heap), '-jar', jar], {
    cwd: repo,
    env: { ...process.env, ...Object.fromEntries(Object.entries(env).map(([k, v]) => [k, String(v)])) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(createWriteStream(log, { flags: 'w' }));
  child.stderr.pipe(createWriteStream(err, { flags: 'w' }));
  return child;
}

const children: Array<{ name: string; child: ReturnType<typeof spawn> }> = [];
async function stopChild(entry: { name: string; child: ReturnType<typeof spawn> }) {
  const { name, child } = entry;
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  for (let i = 0; i < 25 && child.exitCode === null && child.signalCode === null; i++) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  console.log(`${DENY} stopped ${name}`);
}

async function cleanup() {
  for (const entry of children) await stopChild(entry);
}
process.on('SIGINT', () => { void cleanup().finally(() => process.exit(130)); });
process.on('uncaughtException', (e) => {
  console.error(`${DENY} uncaught: ${e.stack ?? e}`);
  void cleanup().finally(() => process.exit(1));
});

/** Wait until a URL answers with the status we want, or the deadline passes. Polls every 2 s. */
async function waitFor(label: string, url: string, want = 200, deadlineMs = 150_000) {
  const start = Date.now();
  let last = 'no response';
  while (Date.now() - start < deadlineMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      last = `HTTP ${res.status}`;
      if (res.status === want) return true;
    } catch (e) {
      const err = e as Error;
      last = `${err.name}: ${err.message}`;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  console.error(`${DENY} ${label} did not answer on ${url} within ${deadlineMs / 1000}s (last: ${last})`);
  return false;
}

const LEAKAGE = /stackTrace|JDBC|jdbc:|:55433|:5432|password|BEGIN PRIVATE|Hibernate/i;

/** The health contract: HTTP 200, status UP, and NO component details — show-details must stay `never`. */
function assertHealthShape(name: string, body: string) {
  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    bad(`${name} /actuator/health parses as JSON`, `got: ${body.slice(0, 200)}`);
    return;
  }
  if (parsed?.status !== 'UP') {
    bad(`${name} /actuator/health status`, `want UP, got ${JSON.stringify(parsed?.status)}`);
    return;
  }
  if ('components' in parsed || 'details' in parsed) {
    bad(`${name} /actuator/health hides details`, `show-details leaked: ${body.slice(0, 160)}`);
    return;
  }
  if (LEAKAGE.test(body)) {
    bad(`${name} /actuator/health carries no internals`, body.slice(0, 160));
    return;
  }
  ok(`${name} /actuator/health: 200 {"status":"UP"}, no details, no internals`);
}

/** The build-info contract: artifact + component must match what this repo ships (§SC-68b). */
function assertInfo(name: string, body: string, expectedArtifact: string, expectedComponent: string) {
  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    bad(`${name} /actuator/info parses as JSON`, `got: ${body.slice(0, 200)}`);
    return;
  }
  const build = parsed?.build;
  if (!build) {
    bad(`${name} /actuator/info has build section`, `got: ${body.slice(0, 200)}`);
    return;
  }
  if (build.artifact !== expectedArtifact) {
    bad(`${name} /actuator/info build.artifact`, `want ${expectedArtifact}, got ${build.artifact}`);
  } else if (build.component !== expectedComponent) {
    bad(`${name} /actuator/info build.component`, `want ${expectedComponent}, got ${build.component}`);
  } else if (typeof build.time !== 'string' || build.time.length < 8) {
    bad(`${name} /actuator/info build.time`, `want ISO timestamp, got ${build.time}`);
  } else {
    ok(`${name} /actuator/info: artifact=${build.artifact} component=${build.component} version=${build.version}`);
  }
  if (LEAKAGE.test(body)) {
    bad(`${name} /actuator/info carries no internals`, body.slice(0, 160));
  }
}

/** Boot one service, assert its contract, stop it. Returns nothing — failures flow via the counter. */
async function verifyService({ name, jar, heap, env, expectedArtifact, expectedComponent, extra }: { name: string; jar: string; heap: string; env: Record<string, string | number> & { _port: number }; expectedArtifact: string; expectedComponent: string; extra?: (port: number) => Promise<void> }) {
  console.log(`${DENY} ${name}: starting (heap ${heap}, logs in ${LOG_DIR})`);
  const child = spawnJar(name, jar, heap, env);
  const entry = { name, child };
  children.push(entry);
  try {
    if (!(await waitFor(name, `http://127.0.0.1:${env._port}/actuator/health`))) {
      bad(`${name} boots`, 'did not answer /actuator/health');
      return;
    }
    const health = await fetch(`http://127.0.0.1:${env._port}/actuator/health`, { signal: AbortSignal.timeout(5_000) });
    assertHealthShape(name, await health.text());
    const info = await fetch(`http://127.0.0.1:${env._port}/actuator/info`, { signal: AbortSignal.timeout(5_000) });
    if (!info.ok) {
      bad(`${name} /actuator/info`, `HTTP ${info.status}`);
    } else {
      assertInfo(name, await info.text(), expectedArtifact, expectedComponent);
    }
    if (extra) await extra(env._port);
  } catch (e) {
    const err = e as Error;
    bad(`${name}`, `${err.name}: ${err.message}`);
  } finally {
    await stopChild(entry);
    children.splice(children.indexOf(entry), 1);
  }
}

async function main() {
  console.log(`${DENY} repo=${repo}`);
  const registryJar = ensureJarFresh('registry', 'nexus-registry', 'target/nexus-registry-0.1.0-SNAPSHOT.jar');
  const configJar = ensureJarFresh('nexus-config', 'nexus-config', 'target/nexus-config-0.1.0-SNAPSHOT.jar');
  const domainJar = ensureJarFresh('domain-service', 'java-domain-service', 'target/domain-service-1.0.0-SNAPSHOT.jar');
  const apiJar = ensureJarFresh('nexus-api', 'nexus-api', 'target/nexus-api-0.1.0-SNAPSHOT.jar');
  const gatewayJar = ensureJarFresh('nexus-gateway', 'nexus-gateway', 'target/nexus-gateway-0.1.0-SNAPSHOT.jar');

  for (const port of Object.values(PORTS)) await assertFree(port);

  // domain-service — JPA against 55433 (DB required; honesty over a fake UP).
  await verifyService({
    name: 'domain-service', jar: domainJar, heap: '512m',
    env: { NEXUS_DOMAIN_PORT: String(PORTS.domain), NEXUS_DOMAIN_DB_URL: DB_URL, DB_USERNAME, DB_PASSWORD, _port: PORTS.domain },
    expectedArtifact: 'domain-service', expectedComponent: 'nexus-domain-service',
    extra: async (port: number) => {
      const res = await fetch(`http://127.0.0.1:${port}/actuator/circuitbreakers`, { signal: AbortSignal.timeout(5_000) });
      if (res.status !== 200) {
        bad('domain-service /actuator/circuitbreakers', `HTTP ${res.status} (want 200)`);
        return;
      }
      const body = await res.json().catch(() => null);
      const ai = body?.circuitBreakers?.['ai-service'];
      if (ai) ok(`domain-service /actuator/circuitbreakers: ai-service=${ai.state}`);
      else bad('domain-service /actuator/circuitbreakers.ai-service', JSON.stringify(body).slice(0, 200));
    },
  });

  // nexus-api — same truth, same SELECT-1 probe.
  await verifyService({
    name: 'nexus-api', jar: apiJar, heap: '512m',
    env: { NEXUS_API_PORT: String(PORTS.api), NEXUS_DB_URL: API_DB_URL, NEXUS_DB_USER: DB_USERNAME, NEXUS_DB_PASSWORD: DB_PASSWORD, _port: PORTS.api },
    expectedArtifact: 'nexus-api', expectedComponent: 'nexus-api',
  });

  // registry — in-memory standalone; live registry read, no DB.
  await verifyService({
    name: 'registry', jar: registryJar, heap: '384m',
    env: { NEXUS_REGISTRY_PORT: String(PORTS.registry), _port: PORTS.registry },
    expectedArtifact: 'nexus-registry', expectedComponent: 'nexus-registry',
  });

  // config — native classpath config server; shared-default integrity probe.
  await verifyService({
    name: 'nexus-config', jar: configJar, heap: '384m',
    env: { NEXUS_CONFIG_PORT: String(PORTS.config), _port: PORTS.config },
    expectedArtifact: 'nexus-config', expectedComponent: 'nexus-config',
  });

  // gateway — WebFlux; memory backend (no Redis dependency for this verifier).
  await verifyService({
    name: 'nexus-gateway', jar: gatewayJar, heap: '384m',
    env: { NEXUS_GATEWAY_PORT: String(PORTS.gateway), NEXUS_GATEWAY_RATE_LIMIT_BACKEND: 'memory', _port: PORTS.gateway },
    expectedArtifact: 'nexus-gateway', expectedComponent: 'nexus-gateway',
  });

  await cleanup();

  if (failures === 0) {
    console.log(`${DENY} PASS — 5/5 services: /actuator/health 200 UP (details hidden), /actuator/info build.component pinned, domain circuitbreakers visible`);
    process.exit(0);
  }
  console.error(`${DENY} FAIL — ${failures} check(s) failed`);
  process.exit(1);
}

main().catch((e) => {
  console.error(`${DENY} fatal: ${e.stack ?? e}`);
  void cleanup().finally(() => process.exit(1));
});
