/**
 * §SC-26 — the LoadBalancer smoke: TWO instances of the domain service, one service id, one gateway.
 *
 *   npm run verify:lb
 *
 * What it proves (all locally, no cloud, no keys — the same stack as verify:topology):
 *   1. two `nexus-domain-service` instances (ports A/B, default 8085/8086) register into one registry
 *      under the SAME service id with distinct instance ids;
 *   2. the discovery view (`/platform/services`) shows BOTH (instances: 2, two distinct addresses);
 *   3. the measured health view (`/platform/health`) probes BOTH and reports UP/UP with allUp=true;
 *   4. ten sequential requests through the gateway's `/domain/**` route all answer 200.
 *
 * What it deliberately does NOT prove: lease eviction or retry-on-dead-instance behaviour — eureka
 * leases live up to 90s and the gateway's lb cache refreshes on its own clock, so a failover assertion
 * is a timeout, not a property. verify:topology owns liveness; this owns CAPACITY/balance.
 *
 * Run from the repo root. Harmless to point at any free ports — everything is env-overridable:
 *   NEXUS_REGISTRY_PORT (8773), NEXUS_DOMAIN_A/B_PORT (8085/8086), NEXUS_GATEWAY_PORT (8092).
 *
 * Exits 0 only when every check passed. Always stops the JVMs it started.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createConnection } from 'node:net';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = path.join(process.env.TEMP ?? '/tmp', 'nexus-verify-lb');
mkdirSync(LOG_DIR, { recursive: true });

const DENY = '[verify-lb]';
const REGISTRY_PORT = Number(process.env.NEXUS_REGISTRY_PORT ?? 8773);
const DOMAIN_A = Number(process.env.NEXUS_DOMAIN_A_PORT ?? 8085);
const DOMAIN_B = Number(process.env.NEXUS_DOMAIN_B_PORT ?? 8086);
const GATEWAY_PORT = Number(process.env.NEXUS_GATEWAY_PORT ?? 8092);
const DB_URL = process.env.NEXUS_DOMAIN_DB_URL ?? 'jdbc:postgresql://127.0.0.1:55433/nexus';
const DB_USERNAME = process.env.DB_USERNAME ?? 'nexus';
const DB_PASSWORD = process.env.DB_PASSWORD ?? 'nexus_dev_only';

let failures = 0;
const ok = (name: string) => console.log(`  ✓ ${name}`);
const bad = (name: string, detail: string) => {
  failures += 1;
  console.error(`  ✗ ${name} — ${detail}`);
};

async function assertFree(port: number) {
  const busy = await new Promise<boolean>((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
  if (busy) throw new Error(`port ${port} is already in use — stop whatever holds it and rerun`);
}

async function waitFor(label: string, url: string, want = 200, deadlineMs = 150_000) {
  const start = Date.now();
  let last = 'no response';
  while (Date.now() - start < deadlineMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      last = `HTTP ${res.status}`;
      if (res.status === want) return true;
    } catch (e) {
      last = `${e instanceof Error ? e.name : 'Error'}: ${e instanceof Error ? e.message : String(e)}`;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  console.error(`${DENY} ${label} did not answer on ${url} within ${deadlineMs / 1000}s (last: ${last})`);
  return false;
}

async function waitForUrl(url: string, want: number, deadlineMs: number) {
  const start = Date.now();
  let last = { status: 499 } as Response | { status: number };
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
function heapArgs(service: string) {
  const dedicated = process.env.NEXUS_SMOKE_HEAP_DOMAIN && service.startsWith('domain') ? process.env.NEXUS_SMOKE_HEAP_DOMAIN
    : process.env.NEXUS_SMOKE_HEAP;
  const size = dedicated ?? (service.startsWith('domain') ? '512m' : '384m');
  return [`-Xmx${size}`];
}

function spawnJar(name: string, jar: string, env: Record<string, string> = {}) {
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

function ensureJarFresh(name: string, serviceDir: string, jarRelative: string) {
  const jar = path.join(repo, 'services', serviceDir, jarRelative);
  const srcNewest = newestSourceMtime(serviceDir);
  const jarMtime = existsSync(jar) ? statSync(jar).mtimeMs : 0;
  if (jarMtime >= srcNewest) return jar;
  console.log(`${DENY} ${name}: jar is stale (src newer) — running mvn -o -DskipTests package`);
  try {
    execFileSync(process.platform === 'win32' ? 'mvn.cmd' : 'mvn', ['-o', '-q', '-B', '-DskipTests', 'package'], {
      cwd: path.join(repo, 'services', serviceDir),
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });
  } catch (e) {
    console.error(`${DENY} mvn failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  return jar;
}

const services: Array<{ name: string; child: ReturnType<typeof spawnJar> }> = [];

async function cleanup() {
  for (const { name, child } of services) {
    child.kill('SIGTERM');
    for (let i = 0; i < 25 && child.exitCode === null && child.signalCode === null; i++) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    console.log(`${DENY} stopped ${name}`);
  }
}
process.on('SIGINT', () => { void cleanup().finally(() => process.exit(130)); });
process.on('uncaughtException', (e) => {
  console.error(`${DENY} uncaught: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
  void cleanup().finally(() => process.exit(1));
});

/** Start one domain-service instance with a distinct port. */
function spawnDomain(name: string, port: number, jar: string) {
  return spawnJar(name, jar, {
    NEXUS_DOMAIN_REGISTER: 'true',
    NEXUS_DOMAIN_FETCH: 'true',
    NEXUS_DOMAIN_DB_URL: DB_URL,
    DB_USERNAME,
    DB_PASSWORD,
    NEXUS_DOMAIN_PORT: String(port),
    NEXUS_CONFIG_ENABLED: 'false',
    NEXUS_REGISTRY_ZONE: `http://127.0.0.1:${REGISTRY_PORT}/eureka/`,
  });
}

async function main() {
  console.log(`${DENY} repo=${repo}`);
  const registryJar = ensureJarFresh('registry', 'nexus-registry', 'target/nexus-registry-0.1.0-SNAPSHOT.jar');
  const domainJar = ensureJarFresh('domain-service', 'java-domain-service', 'target/domain-service-1.0.0-SNAPSHOT.jar');
  const gatewayJar = ensureJarFresh('gateway', 'nexus-gateway', 'target/nexus-gateway-0.1.0-SNAPSHOT.jar');

  for (const port of [REGISTRY_PORT, DOMAIN_A, DOMAIN_B, GATEWAY_PORT]) await assertFree(port);

  console.log(`${DENY} starting registry :${REGISTRY_PORT} / domain A :${DOMAIN_A} / domain B :${DOMAIN_B} / gateway :${GATEWAY_PORT}`);
  services.push({ name: 'registry', child: spawnJar('registry', registryJar, { NEXUS_REGISTRY_PORT: String(REGISTRY_PORT) }) });
  if (!(await waitFor('registry', `http://127.0.0.1:${REGISTRY_PORT}/eureka/apps`, 200))) return void (await cleanup(), process.exit(1));
  ok('eureka is answering');

  for (const [name, port] of [['domain-a', DOMAIN_A], ['domain-b', DOMAIN_B]] as const) {
    services.push({ name, child: spawnDomain(name, port, domainJar) });
    if (!(await waitFor(name, `http://127.0.0.1:${port}/actuator/health`, 200, 150_000))) {
      await cleanup();
      process.exit(1);
    }
    ok(`${name} is healthy on :${port}`);
  }

  const apps = await waitForUrl(`http://127.0.0.1:${REGISTRY_PORT}/eureka/apps/NEXUS-DOMAIN-SERVICE`, 200, 30_000);
  const appsText = apps.text ? await apps.text() : '';
  const instanceCount = (appsText.match(/<status>UP<\/status>/g) ?? []).length;
  const hasA = appsText.includes(String(DOMAIN_A));
  const hasB = appsText.includes(String(DOMAIN_B));
  if (!hasA || !hasB || instanceCount < 2) {
    bad('eureka holds both domain instances', `A=${hasA} B=${hasB} UP-markers=${instanceCount}`);
  } else ok('eureka holds both domain instances (A and B)');

  services.push({ name: 'gateway', child: spawnJar('gateway', gatewayJar, {
    NEXUS_GATEWAY_PORT: String(GATEWAY_PORT),
    NEXUS_CONFIG_ENABLED: 'false',
    NEXUS_REGISTRY_ZONE: `http://127.0.0.1:${REGISTRY_PORT}/eureka/`,
  }) });
  if (!(await waitFor('gateway', `http://127.0.0.1:${GATEWAY_PORT}/platform/health`, 200))) {
    await cleanup();
    process.exit(1);
  }
  ok('gateway is answering');

  // Discovery view: BOTH instances listed under one service id.
  const servicesRes = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/platform/services`, { signal: AbortSignal.timeout(10_000) });
  const servicesBody = await servicesRes.json() as { services?: Array<{ id?: string; instances?: number; addresses?: string[] }> };
  const domainRow = (servicesBody.services ?? []).find((s) => (s.id ?? '').toLowerCase().includes('domain-service'));
  if (!domainRow) bad('discovery lists domain-service', JSON.stringify(servicesBody).slice(0, 200));
  else {
    const twoPorts = (domainRow.addresses ?? []).every((a) => a.includes(String(DOMAIN_A)) || a.includes(String(DOMAIN_B)));
    const distinct = new Set(domainRow.addresses ?? []).size;
    if (domainRow.instances !== 2 || !twoPorts || distinct < 2) {
      bad('discovery shows 2 distinct instances', `instances=${domainRow.instances} addresses=${JSON.stringify(domainRow.addresses)}`);
    } else ok(`discovery shows 2 distinct instances (${(domainRow.addresses ?? []).join(', ')})`);
  }

  // Measured health view: both probed UP.
  const healthRes = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/platform/health`, { signal: AbortSignal.timeout(10_000) });
  const healthBody = await healthRes.json() as { services?: Array<{ id?: string; instances?: Array<{ uri?: string; status?: string }> }>; allUp?: boolean };
  const healthRow = (healthBody.services ?? []).find((s) => (s.id ?? '').toLowerCase().includes('domain-service'));
  const rows = healthRow?.instances ?? [];
  const upCount = rows.filter((r) => r.status === 'UP').length;
  if (!healthBody.allUp) bad('allUp is true with two backends', JSON.stringify(healthBody).slice(0, 240));
  else if (upCount !== 2) bad('both instances probed UP', JSON.stringify(rows).slice(0, 240));
  else ok('both instances probed UP (allUp=true)');

  // Ten sequential requests through the door — the lb path exercised under two registered instances.
  let all200 = true;
  for (let i = 0; i < 10; i++) {
    const r = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/domain/api/v1/community/policy`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!r || r.status !== 200) { all200 = false; bad(`request ${i + 1}/10 through the door`, r ? `HTTP ${r.status}` : 'no response'); }
  }
  if (all200) ok('10/10 sequential requests through /domain/** answered 200');

  await cleanup();
  if (failures) {
    console.error(`${DENY} FAIL — see above`);
    process.exit(1);
  }
  console.log(`${DENY} PASS — one service id, two instances, one gateway, all measured`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`${DENY} FAIL: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
  void cleanup().finally(() => process.exit(1));
});
