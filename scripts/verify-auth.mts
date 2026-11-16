/**
 * §SC-27 — the AuthFilter, live: a running gateway with auth ON, minted by us, checked by it.
 *
 *   npm run verify:auth
 *
 * Until now the gateway's authentication door had 49 unit tests and zero live ones. This proves, against a
 * running gateway and a running backend, that:
 *   1. a request with NO Authorization header gets 401 and never reaches a backend;
 *   2. a garbage token gets 401 (bad_encoding/bad_format);
 *   3. a token signed with the WRONG secret gets 401 (bad_signature);
 *   4. an EXPIRED token gets 401 (expired);
 *   5. a VALID token passes the door and the backend sees exactly the minted subject
 *      (X-Nexus-Subject round-trip, visible in the billing plan body, which names the id it looked up);
 *   6. X-Request-Id survives auth + forwarding (SC-14) end to end;
 *   7. the whitelisted probe (/platform/health) answers without a token, and /platform/services
 *      does not (a diagnostic door is not an open door when auth is on).
 *
 * Token minting mirrors AuthFilter.mint byte-for-byte (HMAC-SHA256 over the ASCII payload,
 * base64url without padding, "payload.signature"). The secret is a throwaway smoke value, not a credential.
 *
 * Run from the repo root. Ports default to 8774 (registry) / 8087 (domain) / 8093 (gateway) — env-overridable.
 * Exits 0 only when every check passed. Always stops the JVMs it started.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync, createWriteStream, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createConnection } from 'node:net';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = path.join(process.env.TEMP ?? '/tmp', 'nexus-verify-auth');
mkdirSync(LOG_DIR, { recursive: true });

const DENY = '[verify-auth]';
const REGISTRY_PORT = Number(process.env.NEXUS_REGISTRY_PORT ?? 8774);
const DOMAIN_PORT = Number(process.env.NEXUS_DOMAIN_PORT ?? 8087);
const GATEWAY_PORT = Number(process.env.NEXUS_GATEWAY_PORT ?? 8093);
const DB_URL = process.env.NEXUS_DOMAIN_DB_URL ?? 'jdbc:postgresql://127.0.0.1:55433/nexus';
const DB_USERNAME = process.env.DB_USERNAME ?? 'nexus';
const DB_PASSWORD = process.env.DB_PASSWORD ?? 'nexus_dev_only';
/** Throwaway smoke secret. NOT a credential, NOT used anywhere else. */
const SMOKE_SECRET = 'sc27-verify-auth-smoke-secret-throwaway';
/** Sentinel subject that exists in no users table. */
const SUBJECT = 'aaaaaaaa-1111-4000-8000-000000000027';

let failures = 0;
const ok = (name: string) => console.log(`  ✓ ${name}`);
const bad = (name: string, detail: string) => {
  failures += 1;
  console.error(`  ✗ ${name} — ${detail}`);
};

function base64url(data: Buffer | string) {
  return Buffer.from(data).toString('base64url');
}

/** Mint EXACTLY like AuthFilter.mint: compact JSON, base64url, "payload.sig". */
function mint(subject: string, scopes: string[], secret: string, ttlSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const payload = `{"sub":"${subject}","scp":[${scopes.map((s) => `"${s}"`).join(',')}],"iat":${now},"exp":${now + ttlSeconds}}`;
  const sig = createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
  return `${base64url(payload)}.${sig}`;
}

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

/** 每个 JVM 的 heap 上限——本机 16GB 常常只剩几百 MB，默认 1/4 RAM 的堆让 Spring Boot 起不动。 */
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

async function get(pathname: string, token?: string) {
  const headers: Record<string, string> = { 'X-Request-Id': 'verify-auth-001' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`http://127.0.0.1:${GATEWAY_PORT}${pathname}`, { headers, signal: AbortSignal.timeout(10_000) })
    .catch(() => null);
}

async function expectRefusal(name: string, res: Awaited<ReturnType<typeof get>>, wantReason: string) {
  if (!res) return bad(name, 'no response');
  if (res.status !== 401) return bad(name, `HTTP ${res.status} (want 401)`);
  const body = await res.json().catch(() => null) as { error?: string; reason?: string } | null;
  if (body?.reason !== wantReason) return bad(name, `reason=${JSON.stringify(body)} (want ${wantReason})`);
  ok(`${name} (401, reason=${wantReason})`);
}

async function main() {
  console.log(`${DENY} repo=${repo}`);
  const registryJar = ensureJarFresh('registry', 'nexus-registry', 'target/nexus-registry-0.1.0-SNAPSHOT.jar');
  const domainJar = ensureJarFresh('domain-service', 'java-domain-service', 'target/domain-service-1.0.0-SNAPSHOT.jar');
  const gatewayJar = ensureJarFresh('gateway', 'nexus-gateway', 'target/nexus-gateway-0.1.0-SNAPSHOT.jar');

  for (const port of [REGISTRY_PORT, DOMAIN_PORT, GATEWAY_PORT]) await assertFree(port);

  console.log(`${DENY} starting registry :${REGISTRY_PORT} / domain :${DOMAIN_PORT} / gateway :${GATEWAY_PORT} (auth ENABLED)`);
  services.push({ name: 'registry', child: spawnJar('registry', registryJar, { NEXUS_REGISTRY_PORT: String(REGISTRY_PORT) }) });
  if (!(await waitFor('registry', `http://127.0.0.1:${REGISTRY_PORT}/eureka/apps`, 200))) {
    await cleanup();
    process.exit(1);
  }
  ok('eureka is answering');

  services.push({ name: 'domain-service', child: spawnJar('domain-service', domainJar, {
    NEXUS_EUREKA_ENABLED: 'true',
    NEXUS_DOMAIN_REGISTER: 'true',
    NEXUS_DOMAIN_FETCH: 'true',
    NEXUS_DOMAIN_DB_URL: DB_URL,
    DB_USERNAME,
    DB_PASSWORD,
    NEXUS_DOMAIN_PORT: String(DOMAIN_PORT),
    NEXUS_CONFIG_ENABLED: 'false',
    NEXUS_REGISTRY_ZONE: `http://127.0.0.1:${REGISTRY_PORT}/eureka/`,
  }) });
  if (!(await waitFor('domain-service', `http://127.0.0.1:${DOMAIN_PORT}/actuator/health`, 200))) {
    await cleanup();
    process.exit(1);
  }
  ok('domain-service is healthy');

  services.push({ name: 'gateway', child: spawnJar('gateway', gatewayJar, {
    NEXUS_GATEWAY_PORT: String(GATEWAY_PORT),
    NEXUS_CONFIG_ENABLED: 'false',
    NEXUS_GATEWAY_AUTH_ENABLED: 'true',
    NEXUS_GATEWAY_AUTH_SECRET: SMOKE_SECRET,
    NEXUS_REGISTRY_ZONE: `http://127.0.0.1:${REGISTRY_PORT}/eureka/`,
    NEXUS_EUREKA_ENABLED: 'true',
  }) });
  if (!(await waitFor('gateway', `http://127.0.0.1:${GATEWAY_PORT}/platform/health`, 200))) {
    await cleanup();
    process.exit(1);
  }
  ok('gateway is answering (auth enabled)');

  // 1. no token — the gateway answers missing_token (verified against the live door and the source:
  //    AuthFilter.Verification.missing() carries "missing_token")
  await expectRefusal('door-less request refused', await get('/domain/api/v1/community/policy'), 'missing_token');
  // 2. garbage token
  await expectRefusal('garbage token refused', await get('/domain/api/v1/community/policy', 'not-a-token'), 'bad_format');
  // 3. wrong-secret token
  await expectRefusal('wrong-secret token refused', await get('/domain/api/v1/community/policy', mint(SUBJECT, ['write'], 'other-secret-entirely', 300)), 'bad_signature');
  // 4. expired token
  await expectRefusal('expired token refused', await get('/domain/api/v1/community/policy', mint(SUBJECT, ['write'], SMOKE_SECRET, -60)), 'expired');
  // 5/6. valid token — reaches the backend, subject round-trips verbatim, correlation id echoed
  const valid = mint(SUBJECT, ['write'], SMOKE_SECRET, 300);
  const policy = await get('/domain/api/v1/community/policy', valid);
  if (!policy || policy.status !== 200) {
    bad('valid token passes the door', policy ? `HTTP ${policy.status}` : 'no response');
  } else {
    ok('valid token passes the door (200)');
    if (policy.headers.get('x-request-id') !== 'verify-auth-001') {
      bad('X-Request-Id echoed through the authenticated door', String(policy.headers.get('x-request-id')));
    } else ok('X-Request-Id echoed (correlation id survives auth)');
  }
  const plan = await get('/domain/api/v1/billing/plan', valid);
  const planBody = plan ? await plan.json().catch(() => null) as { error?: string } | null : null;
  if (plan?.status === 400 && String(planBody?.error ?? '').includes(SUBJECT)) {
    ok(`backend saw exactly the minted subject (User not found: ${SUBJECT})`);
  } else {
    bad('backend saw the minted subject', `status=${plan?.status} body=${JSON.stringify(planBody)?.slice(0, 120)}`);
  }
  // 7. whitelist vs diagnostic
  const health = await get('/platform/health');
  if (health?.status === 200) ok('whitelisted /platform/health answers without a token (200)');
  else bad('/platform/health whitelisted', health ? `HTTP ${health.status}` : 'no response');
  const diag = await get('/platform/services');
  if (diag?.status === 401) ok('diagnostic /platform/services requires a token (401)');
  else bad('/platform/services requires a token', diag ? `HTTP ${diag.status}` : 'no response');

  await cleanup();
  if (failures) {
    console.error(`${DENY} FAIL — see above`);
    process.exit(1);
  }
  console.log(`${DENY} PASS — the door verifies a real signature against a real secret, or it refuses`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`${DENY} FAIL: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
  void cleanup().finally(() => process.exit(1));
});
