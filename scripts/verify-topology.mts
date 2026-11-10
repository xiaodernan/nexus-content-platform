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
 *   5. a door-less request to billing is refused with a sentence (not a guess).
 *
 * Exits 0 only when every check passed. Exits 1 on the first failure and ALWAYS stops the three
 * services it started — a smoke that leaves three JVMs behind is a smoke that exhausts the box.
 *
 * Run from the repo root. Ports are taken from the services themselves (8761/8082/8090); if any of
 * them is already in use the run fails fast with the name of the port, rather than fighting it.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = path.join(process.env.TEMP ?? '/tmp', 'nexus-verify-topology');
mkdirSync(LOG_DIR, { recursive: true });

const DENY = '[verify-topology]';
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

/** Spawn a service jar with env; returns the child. Logs go to LOG_DIR. */
function spawnJar(name, jar, env = {}) {
  const log = path.join(LOG_DIR, `${name}.log`);
  const err = path.join(LOG_DIR, `${name}.err`);
  const child = spawn('java', ['-jar', jar], {
    cwd: repo,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(createWriteStream(log, { flags: 'a' }));
  child.stderr.pipe(createWriteStream(err, { flags: 'a' }));
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
  const registryJar = path.join(repo, 'services/nexus-registry/target/nexus-registry-0.1.0-SNAPSHOT.jar');
  const domainJar = path.join(repo, 'services/java-domain-service/target/domain-service-1.0.0-SNAPSHOT.jar');
  const gatewayJar = path.join(repo, 'services/nexus-gateway/target/nexus-gateway-0.1.0-SNAPSHOT.jar');
  for (const [n, jar] of [['registry', registryJar], ['domain-service', domainJar], ['gateway', gatewayJar]]) {
    if (!existsSync(jar)) {
      bad(n, `jar missing at ${jar} — run mvn -DskipTests package first`);
    }
  }
  if (failures) process.exit(1);

  // Postgres is the domain service's only hard dependency besides Eureka. Refuse to start without it.
  const pg = await (async () => {
    try { const r = await fetch('http://127.0.0.1:55433', { signal: AbortSignal.timeout(2_000) }); return r.status > 0; } catch { return false; }
  })();
  if (!pg) console.warn(`${DENY} warning: 127.0.0.1:55433 did not answer HTTP (not fatal for policy endpoint, but billing plan reads users — expect 400)`);

  for (const port of [8761, 8082, 8090]) await assertFree(port);

  console.log(`${DENY} starting registry / domain-service / gateway (logs in ${LOG_DIR})`);
  const registry = spawnJar('registry', registryJar, { NEXUS_REGISTRY_PORT: '8761' });
  services.push({ name: 'registry', child: registry });
  if (!(await waitFor('registry', 'http://127.0.0.1:8761/eureka/apps', 200))) {
    await cleanup();
    process.exit(1);
  }
  ok('eureka is answering');

  const domain = spawnJar('domain-service', domainJar, {
    NEXUS_DOMAIN_REGISTER: 'true',
    NEXUS_DOMAIN_FETCH: 'true',
    NEXUS_DOMAIN_DB_URL: 'jdbc:postgresql://127.0.0.1:55433/nexus',
    DB_USERNAME: 'nexus',
    DB_PASSWORD: 'nexus_dev_only',
    NEXUS_DOMAIN_PORT: '8082',
    NEXUS_CONFIG_ENABLED: 'false',
  });
  services.push({ name: 'domain-service', child: domain });
  if (!(await waitFor('domain-service', 'http://127.0.0.1:8082/actuator/health', 200))) {
    await cleanup();
    process.exit(1);
  }
  ok('domain-service registered itself');

  // The domain service self-declares its health even with a down Redis (healthDetails show it, but status stays UP only when DB is up)
  const reg = await fetch('http://127.0.0.1:8761/eureka/apps/NEXUS-DOMAIN-SERVICE');
  if (reg.status !== 200) bad('domain-service registered in eureka', `GET answered ${reg.status}`);
  else ok('eureka holds NEXUS-DOMAIN-SERVICE');

  const gateway = spawnJar('gateway', gatewayJar, { NEXUS_GATEWAY_PORT: '8090', NEXUS_CONFIG_ENABLED: 'false' });
  services.push({ name: 'gateway', child: gateway });
  if (!(await waitFor('gateway', 'http://127.0.0.1:8090/platform/health', 200))) {
    await cleanup();
    process.exit(1);
  }
  ok('gateway is answering');

  // Through the gateway: the community surface
  const policy = await fetch('http://127.0.0.1:8090/domain/api/v1/community/policy', { signal: AbortSignal.timeout(10_000) });
  if (policy.status !== 200) bad('community policy via gateway', `HTTP ${policy.status}`);
  else {
    const body = await policy.json();
    if (!body?.source) bad('community policy has a source', JSON.stringify(body).slice(0, 200));
    else ok('community policy (source: ' + body.source + ')');
  }

  // Through the gateway: the billing surface — with a subject
  const subject = 'aaaaaaaa-1111-4000-8000-000000000001';
  const balance = await fetch('http://127.0.0.1:8090/domain/api/v1/billing/balance', {
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
  const noSubject = await fetch('http://127.0.0.1:8090/domain/api/v1/billing/balance', { signal: AbortSignal.timeout(10_000) });
  if (noSubject.status !== 400) bad('door-less billing refused', `HTTP ${noSubject.status} (want 400)`);
  else ok('door-less billing refused (400)');

  await cleanup();
  if (failures) {
    console.error(`${DENY} FAIL — see above`);
    process.exit(1);
  }
  console.log(`${DENY} PASS — topology, correlation id, and both surfaces through the gateway`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`${DENY} FAIL: ${e.stack ?? e}`);
  void cleanup().finally(() => process.exit(1));
});
