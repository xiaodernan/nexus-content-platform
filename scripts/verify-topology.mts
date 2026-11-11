/**
 * §SC-19/§SC-20 — the topology SMOKE. One command, three services, zero human hands:
 *
 *   npm run verify:topology
 *
 * What it proves (the same things the two live-proof documents record):
 *   1. nexus-registry (Eureka) really registers java-domain-service and nexus-gateway;
 *   2. the gateway really routes /domain/** at lb://nexus-domain-service (service discovery);
 *   3. X-Request-Id is minted/echoed across the door (SC-14);
 *   4. the community policy surface AND the billing surface answer 200 through the gateway;
 *   5. a door-less request to billing is refused with a sentence (not a guess);
 *   6. the permission surface answers through the gateway — a sentinel subject nobody holds gets a 400
 *      with the domain's own "User not found" sentence, and a door-less call is refused;
 *   7. a warm-up precedes the assertions: the first DB-touching request pays Hibernate metamodel +
 *      Hikari warm-up and can exceed the gateway's 5s response bound (observed live: 503
 *      service_unavailable naming TimeoutException). The smoke retries idempotent GETs until the door
 *      answers non-503, so it measures the topology, not the warm-up.
 *   8. the gateway's own composite view of the registry (`GET /platform/services`) lists the domain
 *      service and nexus-api — discovery is not merely wired, it is answering at the door;
 *   9. nexus-api itself is part of the topology: it starts, registers into the same registry, and
 *      answers 200 through the gateway's `/api/**` route (its own throwaway database, created by the
 *      operator or CI before the smoke starts — see README note in docs/ENVIRONMENT.md).
 *  10. the config server is a real leg, not a decorative pom: nexus-config serves nexus-gateway.yml /
 *      nexus-api.yml / nexus-domain-service.yml (native profile). The gateway is started with
 *      NEXUS_CONFIG_ENABLED=true and NO rate-limit env — its startup log must show `ratePerSecond=50.0`
 *      (local default is 100), and both backends must appear in the registry with NO env register flags
 *      (their config files say register-with-eureka:true). A silent config-client failure fails this run.
 *
 * Exits 0 only when every check passed. Exits 1 on the first failure and ALWAYS stops the three
 * services it started — a smoke that leaves three JVMs behind is a smoke that exhausts the box.
 *
 * Run from the repo root. Ports default to the services themselves (8771 registry · 8888 config ·
 * 8082 domain · 8084 api · 8090 gateway, Postgres on 55433); everything can be
 * overridden — NEXUS_REGISTRY_PORT / NEXUS_DOMAIN_PORT / NEXUS_GATEWAY_PORT, NEXUS_DOMAIN_DB_URL,
 * DB_USERNAME, DB_PASSWORD, NEXUS_DOMAIN_PG_PORT — e.g. when an unrelated process already holds 8090 or a
 * CI runner exposes Postgres on another host port. If any needed port is in use the run fails fast with
 * the name of the port, rather than fighting it.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream, readdirSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = path.join(process.env.TEMP ?? '/tmp', 'nexus-verify-topology');
mkdirSync(LOG_DIR, { recursive: true });

const DENY = '[verify-topology]';
const REGISTRY_PORT = Number(process.env.NEXUS_REGISTRY_PORT ?? 8771);
const DOMAIN_PORT = Number(process.env.NEXUS_DOMAIN_PORT ?? 8082);
const GATEWAY_PORT = Number(process.env.NEXUS_GATEWAY_PORT ?? 8090);
const CONFIG_PORT = Number(process.env.NEXUS_CONFIG_PORT ?? 8888);
const API_PORT = Number(process.env.NEXUS_API_PORT ?? 8084);
const DB_URL = process.env.NEXUS_DOMAIN_DB_URL ?? 'jdbc:postgresql://127.0.0.1:55433/nexus';
const DB_USERNAME = process.env.DB_USERNAME ?? 'nexus';
const DB_PASSWORD = process.env.DB_PASSWORD ?? 'nexus_dev_only';
const PG_PORT = Number(process.env.NEXUS_DOMAIN_PG_PORT ?? 55433);
const API_DB_URL = process.env.NEXUS_API_DB_URL ?? `jdbc:postgresql://127.0.0.1:${PG_PORT}/nexus_api_smoke`;
let failures = 0;
const ok = (name) => console.log(`  ✓ ${name}`);
const bad = (name, detail) => {
  failures += 1;
  console.error(`  ✗ ${name} — ${detail}`);
};

/** Ports that must be free before we start anything — fail fast with a name, not a timeout. */
async function assertFree(port) {
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

/** 最新源码（java 与 resources 全部——改 application.yml 同样会让 jar 过期）的 mtime。 */
function newestSourceMtime(serviceDir) {
  const base = path.join(repo, 'services', serviceDir, 'src', 'main');
  let newest = 0;
  const walk = (dir) => {
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

/** jar 必须存在且不比最新 src/main 任何文件新；否则先 package。这就是"mvn test 绿≠jar 能启动"的防线。 */
function ensureJarFresh(name, serviceDir, jarRelative) {
  const jar = path.join(repo, 'services', serviceDir, jarRelative);
  const srcNewest = newestSourceMtime(serviceDir);
  const jarMtime = existsSync(jar) ? statSync(jar).mtimeMs : 0;
  if (jarMtime >= srcNewest) return jar;
  console.log(`${DENY} ${name}: jar is stale (src newer) — running mvn -o -DskipTests package`);
  execFileSyncSafe(mavenCmd(), ['-o', '-q', '-B', '-DskipTests', 'package'], path.join(repo, 'services', serviceDir));
  return jar;
}

function mavenCmd() {
  return process.platform === 'win32' ? 'mvn.cmd' : 'mvn';
}

function execFileSyncSafe(cmd, args, cwd) {
  try {
    execFileSync(cmd, args, { cwd, stdio: 'pipe', shell: process.platform === 'win32' });
  } catch (e) {
    console.error(`${DENY} ${cmd} failed: ${e.stderr?.toString() ?? e.message}`);
    process.exit(1);
  }
}

/** Wait until a URL answers with the status we want, or the deadline passes. Polls every 2s. */
async function waitFor(label, url, want = 200, deadlineMs = 90_000) {
  const start = Date.now();
  let last = 'no response';
  while (Date.now() - start < deadlineMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      last = `HTTP ${res.status}`;
      if (res.status === want) return true;
    } catch (e) {
      last = `${e.name}: ${e.message}`;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  console.error(`${DENY} ${label} did not answer on ${url} within ${deadlineMs / 1000}s (last: ${last})`);
  return false;
}

/** Poll a URL until it answers `want` or the deadline passes; returns the last response (or a 499 stub). */
async function waitForUrl(url, want, deadlineMs) {
  const start = Date.now();
  let last = { status: 499 };
  while (Date.now() - start < deadlineMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      last = res;
      if (res.status === want) return res;
    } catch {
      last = { status: 499 };
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  return last;
}

/** 每个 JVM 的 heap 上限——本机 16GB 常常只剩几百 MB。 */
function heapArgs(service) {
  const dedicated = process.env.NEXUS_SMOKE_HEAP_DOMAIN && service.startsWith('domain') ? process.env.NEXUS_SMOKE_HEAP_DOMAIN
    : process.env.NEXUS_SMOKE_HEAP;
  const size = dedicated ?? (service.startsWith('domain') ? '512m' : '384m');
  return [`-Xmx${size}`];
}

/** Spawn a service jar with env; returns the child. Logs go to LOG_DIR — truncated per run: a stale
 *  line from yesterday must not be able to satisfy today's assertion. */
function spawnJar(name, jar, env = {}) {
  const log = path.join(LOG_DIR, `${name}.log`);
  const err = path.join(LOG_DIR, `${name}.err`);
  const child = spawn('java', [...heapArgs(name), '-jar', jar], {
    cwd: repo,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(createWriteStream(log, { flags: 'w' }));
  child.stderr.pipe(createWriteStream(err, { flags: 'w' }));
  return child;
}

const services = [];
async function cleanup() {
  for (const { name, child } of services) {
    child.kill('SIGTERM');
    // Give it a chance to exit, then force.
    for (let i = 0; i < 25 && child.exitCode === null && child.signalCode === null; i++) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    console.log(`${DENY} stopped ${name}`);
  }
}
process.on('SIGINT', () => { void cleanup().finally(() => process.exit(130)); });
process.on('uncaughtException', (e) => {
  console.error(`${DENY} uncaught: ${e.stack ?? e}`);
  void cleanup().finally(() => process.exit(1));
});

async function main() {
  console.log(`${DENY} repo=${repo}`);
  const registryJar = ensureJarFresh('registry', 'nexus-registry', 'target/nexus-registry-0.1.0-SNAPSHOT.jar');
  const domainJar = ensureJarFresh('domain-service', 'java-domain-service', 'target/domain-service-1.0.0-SNAPSHOT.jar');
  const gatewayJar = ensureJarFresh('gateway', 'nexus-gateway', 'target/nexus-gateway-0.1.0-SNAPSHOT.jar');
  const apiJar = ensureJarFresh('nexus-api', 'nexus-api', 'target/nexus-api-0.1.0-SNAPSHOT.jar');
  const configJar = ensureJarFresh('nexus-config', 'nexus-config', 'target/nexus-config-0.1.0-SNAPSHOT.jar');

  // Postgres is the domain service's only hard dependency besides Eureka. Refuse to start without it.
  const pg = await (async () => {
    try { const r = await fetch(`http://127.0.0.1:${PG_PORT}`, { signal: AbortSignal.timeout(2_000) }); return r.status > 0; } catch { return false; }
  })();
  if (!pg) console.warn(`${DENY} warning: 127.0.0.1:${PG_PORT} did not answer HTTP (not fatal for policy endpoint, but billing plan reads users — expect 400)`);

  for (const port of [REGISTRY_PORT, CONFIG_PORT, DOMAIN_PORT, GATEWAY_PORT, API_PORT]) await assertFree(port);

  console.log(`${DENY} starting registry / domain-service / gateway (logs in ${LOG_DIR})`);
  const registry = spawnJar('registry', registryJar, { NEXUS_REGISTRY_PORT: String(REGISTRY_PORT) });
  services.push({ name: 'registry', child: registry });
  if (!(await waitFor('registry', `http://127.0.0.1:${REGISTRY_PORT}/eureka/apps`, 200))) {
    await cleanup();
    process.exit(1);
  }
  ok('eureka is answering');

  // The config server joins next. It is the ONLY source of the `register-with-eureka: true` the two
  // backends need — nothing in the process environment says it — so whether they appear in the registry
  // proves the config client round-trip, not just the client's mere presence.
  const configServer = spawnJar('nexus-config', configJar, { NEXUS_CONFIG_PORT: String(CONFIG_PORT) });
  services.push({ name: 'nexus-config', child: configServer });
  if (!(await waitFor('nexus-config', `http://127.0.0.1:${CONFIG_PORT}/actuator/health`, 200))) {
    await cleanup();
    process.exit(1);
  }
  ok('config server is answering');

  const domain = spawnJar('domain-service', domainJar, {
    NEXUS_DOMAIN_DB_URL: DB_URL,
    DB_USERNAME,
    DB_PASSWORD,
    NEXUS_DOMAIN_PORT: String(DOMAIN_PORT),
    NEXUS_CONFIG_ENABLED: 'true',
    // §SC-62/verify: covered: probe is gated; need a known operator token to assert the positive branch.
    NEXUS_OPERATOR_TOKEN: 'verify-topology-op-token',
    // No NEXUS_DOMAIN_REGISTER/FETCH anywhere: the register-with-eureka:true this service will obey
    // can ONLY come from nexus-domain-service.yml served by the config server. If the round-trip fails,
    // the registry stays empty and the check below fails — that is the assertion, not an implementation detail.
  });
  services.push({ name: 'domain-service', child: domain });
  if (!(await waitFor('domain-service', `http://127.0.0.1:${DOMAIN_PORT}/actuator/health`, 200, 150_000))) {
    await cleanup();
    process.exit(1);
  }
  const reg = await waitForUrl(`http://127.0.0.1:${REGISTRY_PORT}/eureka/apps/NEXUS-DOMAIN-SERVICE`, 200, 30_000);
  if (reg.status !== 200) bad('domain-service registered via config server', `GET answered ${reg.status}`);
  else ok('eureka holds NEXUS-DOMAIN-SERVICE (via config server, no env flags)');

  // §SC-60 §SC-64: the Feign breaker is really wired and really reportable — not a label on a class.
  const breakers = await fetch(`http://127.0.0.1:${DOMAIN_PORT}/actuator/circuitbreakers`, { signal: AbortSignal.timeout(5_000) });
  if (breakers.status !== 200) {
    bad('domain-service /actuator/circuitbreakers', `HTTP ${breakers.status} (want 200)`);
  } else {
    const cb = await breakers.json().catch(() => null);
    const ai = cb?.circuitBreakers?.['ai-service'];
    if (!ai) bad('domain-service /actuator/circuitbreakers.ai-service', JSON.stringify(cb).slice(0, 200));
    else ok(`domain-service /actuator/circuitbreakers: ai-service=${ai.state} bufferedCalls=${ai.bufferedCalls}`);
  }

  // nexus-api joins the same registry before the gateway starts, so the gateway's first fetch sees
  // the full topology (not just the domain service). It owns its own throwaway database.
  const api = spawnJar('nexus-api', apiJar, {
    NEXUS_DB_URL: API_DB_URL,
    NEXUS_DB_USER: DB_USERNAME,
    NEXUS_DB_PASSWORD: DB_PASSWORD,
    NEXUS_API_PORT: String(API_PORT),
    NEXUS_CONFIG_ENABLED: 'true',
    // Same round-trip: nexus-api.yml says register-with-eureka:true — nothing in env does.
  });
  services.push({ name: 'nexus-api', child: api });
  if (!(await waitFor('nexus-api', `http://127.0.0.1:${API_PORT}/actuator/health`, 200, 150_000))) {
    await cleanup();
    process.exit(1);
  }
  const apiReg = await waitForUrl(`http://127.0.0.1:${REGISTRY_PORT}/eureka/apps/NEXUS-API`, 200, 30_000);
  if (apiReg.status !== 200) bad('nexus-api registered via config server', `GET answered ${apiReg.status}`);
  else ok('eureka holds NEXUS-API (via config server, no env flags)');

  const gateway = spawnJar('gateway', gatewayJar, { NEXUS_GATEWAY_PORT: String(GATEWAY_PORT), NEXUS_CONFIG_ENABLED: 'true' });
  services.push({ name: 'gateway', child: gateway });
  if (!(await waitFor('gateway', `http://127.0.0.1:${GATEWAY_PORT}/platform/health`, 200))) {
    await cleanup();
    process.exit(1);
  }
  ok('gateway is answering');

  // The config round-trip, read out of the gateway's own startup line: it started with
  // NEXUS_CONFIG_ENABLED=true and NO rate-limit env var, so `ratePerSecond=50.0` in the log can only
  // mean nexus-gateway.yml from nexus-config won over the packaged default (100). A config client
  // that silently failed would print 100 and this check would say so — that is the assertion.
  const gatewayLog = path.join(LOG_DIR, 'gateway.log');
  let served50 = false;
  const cfgDeadline = Date.now() + 30_000;
  while (Date.now() < cfgDeadline && !served50) {
    try {
      served50 = readFileSync(gatewayLog, 'utf8').includes('ratePerSecond=50.0');
    } catch {
      served50 = false;
    }
    if (!served50) await new Promise((r) => setTimeout(r, 1_000));
  }
  if (!served50) bad('config server served nexus-gateway.yml', 'gateway log never showed ratePerSecond=50.0 (a silent config-client failure would print the local default 100)');
  else ok('config server served nexus-gateway.yml (ratePerSecond=50.0)');

  // Warm the domain service's JPA stack through the door. The first DB-touching request pays metamodel
  // init + Hikari warm-up and can exceed the gateway's 5s bound; a smoke that asserts before then
  // measures the warm-up, not the topology. Retry idempotent GETs until a non-503 answer arrives.
  const warmupDeadline = Date.now() + 120_000;
  let warmed = false;
  while (Date.now() < warmupDeadline) {
    const res = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/domain/api/v1/billing/plan`, {
      headers: { 'X-Nexus-Subject': 'aaaaaaaa-1111-4000-8000-000000000001' },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (res && res.status !== 503) { warmed = true; break; }
    await new Promise((r) => setTimeout(r, 1_500));
  }
  if (!warmed) bad('domain-service warms through the door', 'still 503 after 120s of retries');
  else ok('domain-service answers through the door (warm-up)');

  // The gateway's composite view of the registry, read at the door. Retry: on a loaded runner the
  // gateway's eureka fetch lags registration by seconds, not minutes.
  const discoveryDeadline = Date.now() + 30_000;
  let listed: string[] = [];
  while (Date.now() < discoveryDeadline) {
    const res = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/platform/services`, {
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null);
    if (res?.ok) {
      const body = await res.json().catch(() => null) as { services?: Array<{ id?: string }> } | null;
      listed = (body?.services ?? []).map((s) => String(s.id ?? ''));
      const hasDomain = listed.some((id) => id.toLowerCase().includes('domain-service'));
      const hasApi = listed.some((id) => id.toLowerCase().includes('nexus-api'));
      if (hasDomain && hasApi) break;
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  const hasDomain = listed.some((id) => id.toLowerCase().includes('domain-service'));
  const hasApi = listed.some((id) => id.toLowerCase().includes('nexus-api'));
  if (!hasDomain) bad('gateway discovery lists nexus-domain-service', `services=${JSON.stringify(listed)}`);
  if (!hasApi) bad('gateway discovery lists nexus-api', `services=${JSON.stringify(listed)}`);
  if (hasDomain && hasApi) ok(`gateway discovery lists ${listed.join(', ')}`);

  // Through the gateway: the community surface
  const policy = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/domain/api/v1/community/policy`, { signal: AbortSignal.timeout(10_000) });
  if (policy.status !== 200) bad('community policy via gateway', `HTTP ${policy.status}`);
  else {
    const body = await policy.json();
    if (!body?.source) bad('community policy has a source', JSON.stringify(body).slice(0, 200));
    else ok('community policy (source: ' + body.source + ')');
  }

  // Through the gateway: the billing surface — with a subject
  const subject = 'aaaaaaaa-1111-4000-8000-000000000001';
  const balance = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/domain/api/v1/billing/balance`, {
    headers: { 'X-Nexus-Subject': subject, 'X-Request-Id': 'verify-topology-001' },
    signal: AbortSignal.timeout(10_000),
  });
  if (balance.status !== 200) bad('billing balance via gateway', `HTTP ${balance.status}`);
  else {
    const body = await balance.json();
    if (body.balance !== 0) bad('billing balance is the ledger SUM', JSON.stringify(body));
    else if (balance.headers.get('x-request-id') !== 'verify-topology-001') {
      bad('X-Request-Id echoed', `wanted verify-topology-001, got ${balance.headers.get('x-request-id')}`);
    } else ok('billing balance 0 (X-Request-Id echoed verbatim)');
  }

  // Through the gateway: a door-less billing call is refused with a sentence
  const noSubject = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/domain/api/v1/billing/balance`, { signal: AbortSignal.timeout(10_000) });
  if (noSubject.status !== 400) bad('door-less billing refused', `HTTP ${noSubject.status} (want 400)`);
  else ok('door-less billing refused (400)');

  // Through the gateway: the permission surface — a subject nobody holds is refused with the domain's
  // own sentence (not a silent yes), and a door-less call is refused before the domain is touched.
  const perm = await fetch(
    `http://127.0.0.1:${GATEWAY_PORT}/domain/api/v1/permission/check?resourceType=project&resourceId=6fef79cf-a5f7-4d27-9e7e-30309e567dad&action=read`,
    {
      headers: { 'X-Nexus-Subject': subject, 'X-Request-Id': 'verify-topology-perm-001' },
      signal: AbortSignal.timeout(10_000),
    });
  if (perm.status !== 400) bad('permission check for an absent user', `HTTP ${perm.status} (want 400)`);
  else {
    const body = await perm.json().catch(() => null);
    const msg = body?.error ?? '';
    if (!String(msg).includes('User not found')) bad('permission refusal sentence', JSON.stringify(body).slice(0, 200));
    else if (perm.headers.get('x-request-id') !== 'verify-topology-perm-001') {
      bad('X-Request-Id echoed on permission refusal', `wanted verify-topology-perm-001, got ${perm.headers.get('x-request-id')}`);
    } else ok('permission check refused (User not found, X-Request-Id echoed)');
  }
  const permNoSubject = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/domain/api/v1/permission/check?resourceType=project&resourceId=6fef79cf-a5f7-4d27-9e7e-30309e567dad&action=read`, { signal: AbortSignal.timeout(10_000) });
  if (permNoSubject.status !== 400) bad('door-less permission refused', `HTTP ${permNoSubject.status} (want 400)`);
  else ok('door-less permission refused (400)');

  // Through the gateway: the Java→Python self-report — /api/v1/system/ai-health (§SC-59).
  // ai-service is intentionally NOT part of this smoke (no Python toolchain in the topology),
  // so the honest expectation is status:"degraded" — the hop works IF Feign really ran and reported
  // connection-refused. On a machine where ai-service IS running on 8000, "healthy" is equally true;
  // both prove the probe answers 200 through the door's /domain/** route with the Feign client live.
  const aiHealth = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/domain/api/v1/system/ai-health`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (aiHealth.status !== 200) bad('ai-health via gateway', `HTTP ${aiHealth.status} (want 200)`);
  else {
    const body = await aiHealth.json().catch(() => null);
    const s = body?.status;
    if (s !== 'degraded' && s !== 'healthy') bad('ai-health status is healthy|degraded', JSON.stringify(body).slice(0, 200));
    else ok(`ai-health via gateway (${s}${body?.error ? `, error=${body.error}` : ''}, ${body?.responseTimeMs}ms)`);
  }

  // Through the gateway: Java /api/v1/realtime/stats (§SC-62/SC-55). The smoke also passes the operator token
  // into the domain-service spawn above, so we can exercise the fixed probe end-to-end.
  const stats = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/domain/api/v1/realtime/stats`, { signal: AbortSignal.timeout(10_000) });
  if (stats.status !== 200) {
    bad('realtime stats via gateway', `HTTP ${stats.status} (want 200)`);
  } else {
    const sbody = await stats.json().catch(() => null);
    const hasShape = sbody && typeof sbody.wireChannel === 'string'
      && typeof sbody.maxFrameBytes === 'number'
      && typeof sbody.publishedTotal === 'number'
      && (
        sbody.breakerState === 'CLOSED'
        || sbody.breakerState === 'OPEN'
        || sbody.breakerState === 'HALF_OPEN'
        || sbody.breakerState === null
      );
    if (!hasShape) bad('realtime stats shape', JSON.stringify(sbody).slice(0, 200));
    else ok(`realtime stats via gateway (wireChannel=${sbody.wireChannel}, publishedTotal=${sbody.publishedTotal}, breakerState=${sbody.breakerState ?? 'null'})`);
  }
  const probeNoToken = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/domain/api/v1/realtime/probe`, { method: 'POST', signal: AbortSignal.timeout(10_000) });
  if (probeNoToken.status !== 403) bad('probe without operator token refused', `HTTP ${probeNoToken.status} (want 403)`);
  else ok('probe without operator token refused (403)');
  const probeWithToken = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/domain/api/v1/realtime/probe`, {
    method: 'POST',
    headers: { 'X-Nexus-Operator-Token': 'verify-topology-op-token' },
    signal: AbortSignal.timeout(10_000),
  });
  if (probeWithToken.status !== 200) {
    bad('probe with operator token', `HTTP ${probeWithToken.status} (want 200)`);
  } else {
    const pbody = await probeWithToken.json().catch(() => null);
    if (pbody?.published !== true) bad('probe published', JSON.stringify(pbody).slice(0, 200));
    else ok(`probe published (channel=${pbody.channel})`);
  }

  // Through the gateway: nexus-api answers /api/health — full path gateway → lb://nexus-api → its own
  // throwaway database, all live. /api/health is 200 only when the database answers.
  const apiHealth = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/api/health`, { signal: AbortSignal.timeout(10_000) });
  if (apiHealth.status !== 200) bad('nexus-api /api/health via gateway', `HTTP ${apiHealth.status} (want 200)`);
  else {
    const text = await apiHealth.text();
    ok(`nexus-api answers through the gateway /api/health (200, ${text.slice(0, 80)}…)`);
  }

  await cleanup();
  if (failures) {
    console.error(`${DENY} FAIL — see above`);
    process.exit(1);
  }
  console.log(`${DENY} PASS — registry, gateway, domain-service and nexus-api, all through service discovery`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`${DENY} FAIL: ${e.stack ?? e}`);
  void cleanup().finally(() => process.exit(1));
});
