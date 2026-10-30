// NEXUS M10 v561 — webhooks stop being a claim and start being a ROW IN A DATABASE (ADR 0021).
//
// ADR 0021 shipped four slices (v557 subscribe + sign, v558 the owner's ping, v559 the after-commit fan-out,
// v560 the delivery receipts) and ended with the same sentence every slice before it ended with: *"Not graded
// yet: no proof against a live PostgreSQL exercises these rows, and no proof observes a delivery"*. Every gate
// that shipped was a UNIT gate — Mockito collaborators, annotations read back off the class, a socket the test
// itself owned. Those are real checks; none of them can say the thing this milestone is about:
//
//   a recorded fact, committed to a real database, causes this service to CALL OUT, and the attempt is written
//   down in a row that outlives the process that wrote it.
//
// That is what only THIS file answers. It builds the service, starts a throwaway PostgreSQL, starts the real
// jar against it, subscribes two endpoints, publishes a real project, takes it down, pings one endpoint, reads
// the receipt log back over HTTP, counts the rows with psql, removes a subscription, and restarts the service
// against the same database. Sections:
//
//   §1 the service BUILDS and STARTS against a real PostgreSQL and answers on the port it announced;
//   §2 two endpoints are subscribed, the events are CANONICALIZED to the trail's order, the secret is 64 hex
//      and readable exactly once, no read answer carries it, a private literal and a duplicate are refused;
//   §3 a REAL publish commits → the AFTER_COMMIT fan-out POSTs to BOTH endpoints → TWO receipts, event
//      `publish`, target = the project, outcome `unreachable` (the name is RFC 6761 and cannot resolve),
//      and the receipt's `eventAt` is the AUDIT ENTRY's instant — one fact, two knocks;
//   §4 a real unpublish fans out to the endpoints that ASKED for that verb — one more receipt, because the
//      second endpoint subscribed to publish only — and the trail still holds exactly one entry per verb;
//   §5 the owner's ping writes ONE receipt (and no receipt for the endpoint it was not addressed to), and a
//      ping refused for ownership, absence or a missing subscriber writes NOTHING;
//   §6 the log's rules over HTTP: subscriber required, narrowing IN the query, the cap, the window, newest
//      first, and a stranger's account answers an EMPTY log rather than somebody else's receipts;
//   §7 the DATABASE itself: four rows in `webhook_delivery`, no `secret` column in it, the secret the one-time
//      answer gave is the 64-character value `webhook_subscription` stores, and no read door prints it;
//   §8 removing the subscription does NOT erase its receipts — a take-down removes the instruction, not the
//      record of having called it;
//   §9 the receipts SURVIVE A RESTART: a new JVM, the same database, the same four rows with the same
//      instants — which is the whole difference between `REQUIRES_NEW` committing and merely being visible.
//
// The endpoint is `https://hooks.invalid/...`: RFC 6761 reserves `.invalid` and a resolver must not answer it,
// so the delivery path runs ALL of its rules — ownership, resolution, receipt — and fails at the last step
// with a name that cannot resolve. A local endpoint is impossible BY DESIGN (the service refuses every
// loopback and private address at subscription time and again at delivery time); that refusal is asserted in
// §2 rather than worked around here.
//
// Everything it creates is throwaway: a `pgvector/pgvector:pg16` container on a port nothing else is using,
// removed by name at the end; the jar is built in an ISOLATED COPY under the OS temp dir (a running service in
// the working tree holds its jar open, and `mvn package` renames it — measured in v302).
//
// Requires: Java 25, Maven, and a running Docker daemon. Run:  node docs/evidence/m10/webhook-proof.mjs
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
// THREE levels up: docs/evidence/m10/webhook-proof.mjs → the repository root. Two would land on docs/.
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SERVICE_DIR = path.join(REPO_ROOT, 'services/nexus-api');
const DB_IMAGE = 'pgvector/pgvector:pg16';
const STAMP = `${Date.now()}-${process.pid}`;
const BUILD_DIR = path.join(tmpdir(), `nexus-webhook-proof-build-${STAMP}`);
const JAR = path.join(BUILD_DIR, 'target/nexus-api-0.1.0-SNAPSHOT.jar');

const DB_CONTAINER = `nexus-api-webhook-db-${STAMP}`;
const DB_NAME = 'nexus';
const DB_USER = 'nexus';
const DB_PASSWORD = 'nexus';
const PORT_FILE = path.join(tmpdir(), `nexus-api-webhook-port-${STAMP}.txt`);

/** The service's own answer a readiness probe accepts: any HTTP status means the port is serving. */
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

/** `mvn` is a `.cmd` shim on Windows, which Node refuses to spawn directly (CVE-2024-27980 mitigation). */
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

/** Async `spawn`, never `spawnSync`: the synchronous family measured 100% EBUSY at 8-way concurrency here. */
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
  console.log(`[m10] gave up waiting for ${label} after ${tries} tries`);
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

/** The receipt's wire shape, pinned: a field added here is a field a read door would start printing. */
const RECEIPT_FIELDS = ['attemptedAt', 'detail', 'event', 'eventAt', 'id', 'outcome', 'status', 'targetId', 'webhookId'].sort();

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
  console.log(`[m10] tools: ${javaLine.trim()} · docker server ${dockerVersion.stdout.trim()}`);

  // ── §1 build the jar, start a throwaway database, start the service against it ───────────────────
  rmSync(BUILD_DIR, { recursive: true, force: true });
  mkdirSync(BUILD_DIR, { recursive: true });
  cpSync(path.join(SERVICE_DIR, 'pom.xml'), path.join(BUILD_DIR, 'pom.xml'));
  cpSync(path.join(SERVICE_DIR, 'src'), path.join(BUILD_DIR, 'src'), { recursive: true });
  const build = await runMaven(['-B', '-q', 'package', '-DskipTests'], { cwd: BUILD_DIR, timeoutMs: 600_000 });
  assert.equal(build.code, 0, `mvn package failed:\n${build.stdout}\n${build.stderr}`);
  assert.ok(existsSync(JAR), `the build produced no jar at ${JAR}`);
  console.log(`[m10] built ${path.relative(REPO_ROOT, JAR)}`);

  const dbPort = await freePort();
  const startDb = await run('docker', [
    'run', '-d', '--rm', '--name', DB_CONTAINER,
    '-e', `POSTGRES_USER=${DB_USER}`, '-e', `POSTGRES_PASSWORD=${DB_PASSWORD}`, '-e', `POSTGRES_DB=${DB_NAME}`,
    '-p', `127.0.0.1:${dbPort}:5432`,
    DB_IMAGE,
  ]);
  assert.equal(startDb.code, 0, `could not start the throwaway database: ${startDb.stderr}`);
  dbStarted = true;

  // Both halves of "ready": postgres inside the container AND the published host port, because it is the
  // host mapping the service connects through (a `-p` that lost a race passes the inside check alone).
  const inside = await until(async () => {
    const r = await run('docker', ['exec', DB_CONTAINER, 'pg_isready', '-U', DB_USER, '-d', DB_NAME]);
    return r.code === 0;
  }, { tries: 60, gapMs: 1000, label: 'postgres to accept connections inside its container' });
  assert.ok(inside, 'the throwaway database never became ready');
  const reachableFromHost = await until(() => canConnect(dbPort), { tries: 30, gapMs: 500, label: `the database to be reachable on 127.0.0.1:${dbPort}` });
  assert.ok(reachableFromHost, `the database answers inside its container but 127.0.0.1:${dbPort} does not accept a connection`);
  console.log(`[m10] throwaway ${DB_IMAGE} up and reachable on 127.0.0.1:${dbPort} (container ${DB_CONTAINER})`);

  const dbUrl = `jdbc:postgresql://127.0.0.1:${dbPort}/${DB_NAME}`;

  async function startService(fixedPort = 0) {
    rmSync(PORT_FILE, { force: true });
    const child = spawn('java', [
      '-jar', JAR,
      `--server.port=${fixedPort}`,
      `--spring.datasource.url=${dbUrl}`,
      `--spring.datasource.username=${DB_USER}`,
      `--spring.datasource.password=${DB_PASSWORD}`,
      `--nexus.port-file=${PORT_FILE}`,
    ], { cwd: BUILD_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    let port = fixedPort === 0 ? null : fixedPort;
    const onChunk = (d) => { log += String(d); };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    const up = await until(async () => {
      if (child.exitCode !== null || child.signalCode !== null) return false;
      if (port === null) {
        if (!existsSync(PORT_FILE)) return false;
        const reported = Number(readFileSync(PORT_FILE, 'utf8').trim());
        if (!Number.isInteger(reported) || reported <= 0) return false;
        port = reported;
      }
      try {
        // 200 or 400 both mean the port is serving; this door answers 400 without a subscriber.
        const r = await fetch(`http://127.0.0.1:${port}/webhooks`);
        return r.status === 200 || r.status === 400;
      } catch {
        return false;
      }
    }, { tries: SERVICE_START_TRIES, gapMs: 1000, label: 'the service to answer' });
    if (!up) {
      child.kill();
      throw new Error(`the service never answered. Its output was:\n${log.slice(-4000)}`);
    }
    return { child, port };
  }

  const started = await startService();
  serviceProcess = started.child;
  const apiPort = started.port;
  const base = `http://127.0.0.1:${apiPort}`;
  console.log(`[m10] nexus-api answering on ${base}`);

  /** One HTTP call, parsed. A timeout is a NAMED failure rather than a stack trace with no cause. */
  async function call(pathname, init = {}) {
    const response = await fetch(`${base}${pathname}`, { ...init, signal: AbortSignal.timeout(150_000) });
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: response.status, body, text };
  }

  const asJson = (value) => ({ 'content-type': 'application/json' });
  const postJson = (pathname, value) => call(pathname, { method: 'POST', headers: asJson(value), body: JSON.stringify(value) });
  const q = (value) => encodeURIComponent(value);

  async function sql(query) {
    const r = await run('docker', ['exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-tAc', query]);
    assert.equal(r.code, 0, `psql failed: ${r.stderr}`);
    return r.stdout.trim();
  }

  // ── §2 two endpoints, canonical events, a secret shown once, the refusals named ─────────────────
  const subscriber = `acct-hook-owner-${STAMP}`;
  const stranger = `acct-hook-stranger-${STAMP}`;
  const endpointA = 'https://hooks.invalid/nexus-a';
  const endpointB = 'https://hooks.invalid/nexus-b';

  // The events are sent OUT of the vocabulary's order ON PURPOSE: the stored row must be a fact about the
  // SET, so two subscriptions to the same events compare byte for byte.
  const subscribedA = await postJson('/webhooks', { subscriberId: subscriber, url: endpointA, events: ['unpublish', 'publish'] });
  assert.equal(subscribedA.status, 201, `subscribing must be 201, got ${subscribedA.status}: ${subscribedA.text}`);
  assert.equal(subscribedA.body.url, endpointA, 'the answer echoes the endpoint');
  assert.deepEqual(subscribedA.body.events, ['publish', 'unpublish'], `the events must be stored in the trail's order, got ${JSON.stringify(subscribedA.body.events)}`);
  assert.match(subscribedA.body.secret, /^[0-9a-f]{64}$/, `the secret is 32 bytes of lowercase hex, got ${JSON.stringify(subscribedA.body.secret)}`);
  assert.ok(Math.abs(Date.now() - subscribedA.body.createdAt) < 60 * 60 * 1000, 'the created instant is a real instant, not zero or a duration');
  assert.match(subscribedA.body.note, /only time this secret is readable/, `the answer must say the secret is shown once: ${JSON.stringify(subscribedA.body.note)}`);

  const subscribedB = await postJson('/webhooks', { subscriberId: subscriber, url: endpointB, events: ['publish'] });
  assert.equal(subscribedB.status, 201, `the second endpoint must be 201, got ${subscribedB.status}: ${subscribedB.text}`);
  assert.notEqual(subscribedB.body.secret, subscribedA.body.secret, 'two subscriptions are signed with two DIFFERENT keys');

  const webhookIdA = subscribedA.body.id;
  const webhookIdB = subscribedB.body.id;

  // A private LITERAL is refused at subscription time — this service would POST to it on its own initiative.
  const privateLiteral = await postJson('/webhooks', { subscriberId: subscriber, url: 'https://127.0.0.1:19999/hook', events: ['publish'] });
  assert.equal(privateLiteral.status, 400, `a loopback endpoint must be refused, got ${privateLiteral.status}`);
  assert.equal(privateLiteral.body.error, 'invalid-webhook');
  assert.match(privateLiteral.body.message, /loopback or private address/, `the refusal must name the rule: ${JSON.stringify(privateLiteral.body)}`);

  // One endpoint, one subscription — the duplicate names the row that already holds it.
  const duplicate = await postJson('/webhooks', { subscriberId: subscriber, url: endpointA, events: ['publish'] });
  assert.equal(duplicate.status, 409, `a duplicate endpoint must be 409, got ${duplicate.status}`);
  assert.equal(duplicate.body.error, 'webhook-already-subscribed');
  assert.match(duplicate.body.message, new RegExp(webhookIdA), 'the refusal names the existing subscription');

  const listed = await call(`/webhooks?subscriber=${q(subscriber)}`);
  assert.equal(listed.status, 200, `the listing must be 200, got ${listed.status}`);
  assert.equal(listed.body.total, 2, `the subscriber holds two subscriptions, got ${listed.body.total}`);
  assert.equal(listed.body.webhooks.length, 2);
  assert.equal(listed.body.limit, 20, 'the default window is 20 and the answer says so');
  assert.equal(listed.body.offset, 0);
  for (const row of listed.body.webhooks) {
    assert.ok(!('secret' in row), `a subscription row must carry NO secret field: ${JSON.stringify(row)}`);
  }
  assert.ok(!listed.text.includes(subscribedA.body.secret), 'the listing must not print the secret it was given once');
  console.log(`[§2] two endpoints subscribed for publish+unpublish (sent out of order, stored ["${subscribedA.body.events.join('","')}"] · the secret is ${subscribedA.body.secret.length} hex chars, shown once, absent from the listing) · a loopback literal and a duplicate endpoint both refused BY NAME`);

  // ── §3 a REAL publish fans out AFTER THE COMMIT, and both knocks are written down ───────────────
  const projectId = `hook-doc-${STAMP}`;
  const document = { pages: [{ id: 'p1', name: 'Cover' }], version: 2, tokens: { color: '#0b0d11' } };
  const published = await postJson(`/projects/${q(projectId)}/publish`, { title: 'A webhook is a promise', document });
  assert.equal(published.status, 201, `the publish must be 201, got ${published.status}: ${published.text}`);
  assert.equal(published.body.version, 1);

  const afterPublish = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}`);
  assert.equal(afterPublish.status, 200, `the receipt log must answer 200, got ${afterPublish.status}: ${afterPublish.text}`);
  assert.equal(afterPublish.body.total, 2, `ONE publish must knock on TWO endpoints, got ${afterPublish.body.total} receipt(s): ${afterPublish.text}`);
  assert.equal(afterPublish.body.deliveries.length, 2);
  assert.ok(!afterPublish.text.includes(subscribedA.body.secret), 'the receipt log must not print the secret either');

  const publishReceipts = afterPublish.body.deliveries;
  assert.deepEqual(
    publishReceipts.map((r) => r.webhookId).sort(),
    [webhookIdA, webhookIdB].sort(),
    `the two knocks must name the two subscriptions, got ${JSON.stringify(publishReceipts.map((r) => r.webhookId))}`);
  for (const receipt of publishReceipts) {
    assert.deepEqual(Object.keys(receipt).sort(), RECEIPT_FIELDS, `a receipt carries exactly its nine fields: ${JSON.stringify(receipt)}`);
    assert.equal(receipt.event, 'publish', `the fan-out delivers the trail's verb, got ${receipt.event}`);
    assert.equal(receipt.targetId, projectId, `the fan-out names what the event happened to, got ${receipt.targetId}`);
    // `hooks.invalid` is RFC 6761: a resolver must not answer it. Nothing was sent, so there is no status,
    // and the outcome is `unreachable` with the failure's own name rather than a bare `false`.
    assert.equal(receipt.outcome, 'unreachable', `an unresolvable endpoint is unreachable, got ${JSON.stringify(receipt)}`);
    assert.equal(receipt.status, null, 'nothing answered, so there is no status to report');
    assert.equal(typeof receipt.detail, 'string', `unreachable names WHY, got ${JSON.stringify(receipt.detail)}`);
    assert.ok(receipt.detail.length > 0, 'the detail is a failure name, not an empty string');
    assert.equal(typeof receipt.id, 'string');
    assert.ok(receipt.attemptedAt >= receipt.eventAt, `the knock cannot predate the fact: ${receipt.eventAt} → ${receipt.attemptedAt}`);
  }

  // The trail records the FACT once; the fan-out makes TWO knocks. A receipt whose `eventAt` was its own
  // clock would be a second fact wearing the trail's name.
  const publishTrail = await call('/audit?action=publish&limit=100');
  assert.equal(publishTrail.status, 200);
  const publishEntries = publishTrail.body.entries.filter((e) => e.targetId === projectId);
  assert.equal(publishEntries.length, 1, `one publish is ONE trail entry, got ${publishEntries.length}`);
  assert.equal(publishEntries[0].action, 'publish');
  const trailInstant = publishEntries[0].createdAt;
  for (const receipt of publishReceipts) {
    assert.equal(receipt.eventAt, trailInstant, `the receipt's eventAt must be the TRAIL's instant ${trailInstant}, got ${receipt.eventAt} — the after-commit fan-out announces the committed fact, not its own clock`);
  }
  console.log(`[§3] published "${published.body.title}" → the AFTER_COMMIT fan-out knocked on BOTH endpoints (${publishReceipts.length} receipts, event publish, target ${projectId}) · both unreachable with detail "${publishReceipts[0].detail}" · both eventAt = the single audit entry's instant ${trailInstant}`);

  // ── §4 a real unpublish fans out too — and only to the rows that ASKED for that verb ───────────
  const unpublished = await call(`/projects/${q(projectId)}`, { method: 'DELETE' });
  assert.equal(unpublished.status, 200, `the take-down must be 200, got ${unpublished.status}: ${unpublished.text}`);
  assert.equal(unpublished.body.removed, true);

  const afterUnpublish = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}`);
  // Endpoint B asked for `publish` ONLY, and the fan-out is filtered by the SUBSCRIPTION's own event set
  // (v559's first rule) — so the take-down knocks on A alone. Live, this is the filter that a mocked
  // dispatcher can only assert it was told about.
  assert.equal(afterUnpublish.body.total, 3, `publish (2 endpoints) + unpublish (1 endpoint only) must be three knocks, got ${afterUnpublish.body.total}`);
  const unpublishReceipts = afterUnpublish.body.deliveries.filter((r) => r.event === 'unpublish');
  assert.equal(unpublishReceipts.length, 1, `the take-down is delivered ONLY to the endpoint that asked for it, got ${unpublishReceipts.length}`);
  assert.equal(unpublishReceipts[0].webhookId, webhookIdA, 'that endpoint is A, the one subscribed to publish AND unpublish');
  assert.equal(
    afterUnpublish.body.deliveries.filter((r) => r.webhookId === webhookIdB && r.event === 'unpublish').length,
    0,
    'endpoint B asked for publish only, so the unpublish fan-out must not knock on it');
  for (const receipt of unpublishReceipts) {
    assert.equal(receipt.targetId, projectId);
    assert.equal(receipt.outcome, 'unreachable');
    assert.equal(receipt.status, null);
  }
  const unpublishTrail = await call('/audit?action=unpublish&limit=100');
  const unpublishEntries = unpublishTrail.body.entries.filter((e) => e.targetId === projectId);
  assert.equal(unpublishEntries.length, 1, `one take-down is ONE trail entry, got ${unpublishEntries.length}`);
  for (const receipt of unpublishReceipts) {
    assert.equal(receipt.eventAt, unpublishEntries[0].createdAt, "the unpublish receipts carry the take-down's own instant");
  }
  assert.equal(afterUnpublish.body.deliveries.filter((r) => r.event === 'publish').length, 2, 'the publish receipts are still there — a receipt is never overwritten');
  console.log(`[§4] took the publication down → ONE more receipt (event unpublish, target ${projectId}) because endpoint B never asked for that verb — the fan-out's own filter, live · the trail still holds exactly ONE entry per verb · the two publish receipts were not overwritten`);

  // ── §5 the ping: ONE receipt, addressed to ONE endpoint, and a REFUSED ping writes nothing ─────
  const ping = await call(`/webhooks/${q(webhookIdA)}/ping?subscriber=${q(subscriber)}`, { method: 'POST' });
  assert.equal(ping.status, 200, `an owner's ping answers 200 in every stated outcome, got ${ping.status}: ${ping.text}`);
  assert.equal(ping.body.webhookId, webhookIdA);
  assert.equal(ping.body.url, endpointA);
  assert.equal(ping.body.delivered, false, 'nothing was reached, so delivered is false');
  assert.equal(ping.body.outcome, 'unreachable');
  assert.equal(ping.body.status, null);
  assert.equal(typeof ping.body.detail, 'string');
  assert.equal(typeof ping.body.at, 'number');

  const afterPing = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}`);
  assert.equal(afterPing.body.total, 4, `the ping adds exactly ONE receipt, got ${afterPing.body.total}`);
  const pingReceipts = afterPing.body.deliveries.filter((r) => r.event === 'ping');
  assert.equal(pingReceipts.length, 1, `one ping is one receipt, got ${pingReceipts.length}`);
  assert.equal(pingReceipts[0].webhookId, webhookIdA, 'the receipt names the endpoint the ping was ADDRESSED to');
  assert.equal(pingReceipts[0].targetId, webhookIdA, "a ping's target is the subscription it proves");
  assert.equal(pingReceipts[0].eventAt, ping.body.at, "the receipt's eventAt is the instant the ping answer named");
  assert.equal(afterPing.body.deliveries.filter((r) => r.webhookId === webhookIdB && r.event === 'ping').length, 0, 'the endpoint that was NOT addressed got no ping receipt');

  // Three ways a ping can be refused, and NONE of them is an attempt: nothing may be written down.
  const pingNoSubscriber = await call(`/webhooks/${q(webhookIdA)}/ping`, { method: 'POST' });
  assert.equal(pingNoSubscriber.status, 400, `a ping with no subscriber is refused, got ${pingNoSubscriber.status}`);
  assert.equal(pingNoSubscriber.body.error, 'invalid-webhook');

  const pingByStranger = await call(`/webhooks/${q(webhookIdA)}/ping?subscriber=${q(stranger)}`, { method: 'POST' });
  assert.equal(pingByStranger.status, 403, `a stranger must not aim this service at another subscriber's URL, got ${pingByStranger.status}`);
  assert.equal(pingByStranger.body.error, 'not-your-webhook');

  const pingMissing = await call(`/webhooks/no-such-${STAMP}/ping?subscriber=${q(subscriber)}`, { method: 'POST' });
  assert.equal(pingMissing.status, 404, `an id that names nothing is 404, got ${pingMissing.status}`);
  assert.equal(pingMissing.body.error, 'no-such-webhook');

  const afterRefusals = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}`);
  assert.equal(afterRefusals.body.total, 4, `a refused ping is not an attempt, so the log still holds four rows, got ${afterRefusals.body.total}`);
  console.log(`[§5] the owner's ping wrote ONE receipt (event ping, target ${webhookIdA}, eventAt = the answer's instant) and the other endpoint got none · a missing subscriber (400), a stranger (403) and an unknown id (404) wrote NOTHING — still four rows`);

  // ── §6 the log's rules, over HTTP ───────────────────────────────────────────────────────────────
  const noSubscriber = await call('/webhooks/deliveries');
  assert.equal(noSubscriber.status, 400, `the log needs an account, got ${noSubscriber.status}`);
  assert.equal(noSubscriber.body.error, 'invalid-webhook');
  assert.match(noSubscriber.body.message, /belongs to an account/);

  const strangerLog = await call(`/webhooks/deliveries?subscriber=${q(stranger)}`);
  assert.equal(strangerLog.status, 200, 'a stranger is answered, not refused — with an EMPTY log');
  assert.equal(strangerLog.body.total, 0, `a stranger's log is empty, got ${strangerLog.body.total} — receipts are the owner's`);
  assert.deepEqual(strangerLog.body.deliveries, []);

  const narrowedA = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}&webhook=${q(webhookIdA)}`);
  assert.equal(narrowedA.body.total, 3, `endpoint A holds publish + unpublish + ping, got ${narrowedA.body.total}`);
  assert.equal(narrowedA.body.deliveries.every((r) => r.webhookId === webhookIdA), true, 'the narrowing happens IN the query, so no other subscription is in the window');

  const narrowedB = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}&webhook=${q(webhookIdB)}`);
  assert.equal(narrowedB.body.total, 1, `endpoint B holds the publish knock only and NO ping, got ${narrowedB.body.total}`);

  const narrowedNone = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}&webhook=not-a-webhook-${STAMP}`);
  assert.equal(narrowedNone.body.total, 0, 'a webhook id that names nothing narrows to nothing');

  const capped = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}&limit=10000`);
  assert.equal(capped.body.limit, 100, 'a limit above the cap is clamped to it, and the answer says which cap was used');
  assert.equal(capped.body.deliveries.length, 4, 'the cap is above the four rows, so all four are in the window');

  const windowed = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}&limit=1`);
  assert.equal(windowed.body.deliveries.length, 1, 'the window is a window');
  assert.equal(windowed.body.limit, 1);
  assert.equal(windowed.body.total, 4, 'and the WHOLE count travels beside the window');

  // Newest first, checked against the instants rather than assumed. The tie-break is the receipt id.
  const stamps = capped.body.deliveries.map((r) => r.attemptedAt);
  for (let i = 1; i < stamps.length; i++) {
    assert.ok(stamps[i] <= stamps[i - 1], `receipts must read newest first: ${JSON.stringify(stamps)}`);
  }
  console.log(`[§6] the log needs an account (400) · a stranger's account answers an EMPTY log (total 0) · narrowing by endpoint answered 3 and 1 and 0 IN the query · the cap reported 100 and the window 1 with total 4 · newest first`);

  // ── §7 the DATABASE: four rows, no secret column, and the stored key is the one that was shown ──
  const rowCount = await sql(`select count(*) from webhook_delivery where subscriber_account_id = '${subscriber}'`);
  assert.equal(rowCount, '4', `the receipt table must hold four rows for this subscriber, got ${rowCount}`);
  const subscriberCount = await sql(`select count(*) from webhook_subscription where subscriber_account_id = '${subscriber}'`);
  assert.equal(subscriberCount, '2', `the subscription table must hold two rows, got ${subscriberCount}`);
  const secretColumns = await sql("select count(*) from information_schema.columns where table_name = 'webhook_delivery' and column_name = 'secret'");
  assert.equal(secretColumns, '0', 'webhook_delivery must have NO secret column — a receipt is not a key store');
  const storedSecret = await sql(`select secret from webhook_subscription where webhook_id = '${webhookIdA}'`);
  assert.equal(storedSecret, subscribedA.body.secret, 'the key the database signs with is the key the one-time answer gave');
  assert.equal(storedSecret.length, 64);
  const outcomes = await sql(`select outcome from webhook_delivery where subscriber_account_id = '${subscriber}' group by outcome`);
  assert.equal(outcomes, 'unreachable', `every attempt in this proof is unreachable, got ${JSON.stringify(outcomes)}`);
  console.log(`[§7] psql counted ${rowCount} receipt rows and ${subscriberCount} subscription rows · webhook_delivery has NO secret column · the stored key is the 64 characters the subscription answer gave once · every attempt is unreachable`);

  // ── §8 removing the subscription does NOT erase its receipts ────────────────────────────────────
  const removed = await call(`/webhooks/${q(webhookIdA)}?subscriber=${q(subscriber)}`, { method: 'DELETE' });
  assert.equal(removed.status, 200, `a removal is 200, got ${removed.status}`);
  assert.equal(removed.body.removed, true);

  const afterRemoval = await call(`/webhooks?subscriber=${q(subscriber)}`);
  assert.equal(afterRemoval.body.total, 1, `the removed subscription is gone from the list, got ${afterRemoval.body.total}`);
  assert.equal(afterRemoval.body.webhooks[0].id, webhookIdB);

  const aReceiptsAfterRemoval = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}&webhook=${q(webhookIdA)}`);
  assert.equal(aReceiptsAfterRemoval.body.total, 3, `the removed subscription's receipts are STILL readable, got ${aReceiptsAfterRemoval.body.total} — a take-down removes the instruction, not the record`);
  const survivingIds = aReceiptsAfterRemoval.body.deliveries.map((r) => r.id).sort();
  const earlierIds = narrowedA.body.deliveries.map((r) => r.id).sort();
  assert.deepEqual(survivingIds, earlierIds, 'and they are the SAME rows, not new ones');
  console.log(`[§8] removed endpoint A → the subscription list dropped to 1 and A's ${survivingIds.length} receipt(s) were still there, byte-identical to the ones read before the removal`);

  // ── §9 the receipts SURVIVE A RESTART ──────────────────────────────────────────────────────────
  const beforeRestart = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}`);
  assert.equal(beforeRestart.body.total, 4);
  const snapshot = beforeRestart.body.deliveries.map((r) => JSON.stringify(r));
  const pidBefore = serviceProcess.pid;

  await stopService(serviceProcess);
  assert.ok(serviceProcess.exitCode !== null || serviceProcess.signalCode !== null, 'the service must actually stop before the restart means anything');

  const restarted = await startService(apiPort);
  serviceProcess = restarted.child;
  assert.equal(restarted.port, apiPort, 'the restart binds the same port, or every receipt URL would have moved');

  const afterRestart = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}`);
  assert.equal(afterRestart.status, 200, `the log must answer after a restart, got ${afterRestart.status}`);
  assert.equal(afterRestart.body.total, 4, `four receipts must survive, got ${afterRestart.body.total}`);
  assert.deepEqual(
    afterRestart.body.deliveries.map((r) => JSON.stringify(r)),
    snapshot,
    'the restarted service must answer the SAME receipts (ids, instants, outcomes and details) — a REQUIRES_NEW row that never committed would be visible before the restart and gone after it');

  const subscriptionsAfterRestart = await call(`/webhooks?subscriber=${q(subscriber)}`);
  assert.equal(subscriptionsAfterRestart.body.total, 1, 'the removal also survived the restart');
  console.log(`[§9] process ${pidBefore} was killed and a new JVM served the SAME four receipts from the same database, identical in id, instants, outcome and detail — the delivery log is a system of record, not a cache, and REQUIRES_NEW really committed`);

  // ── §10 teardown ───────────────────────────────────────────────────────────────────────────────
  await stopService(serviceProcess);
  const rm = await run('docker', ['rm', '-f', DB_CONTAINER]);
  assert.equal(rm.code, 0, `could not remove the throwaway database: ${rm.stderr}`);
  dbStarted = false;
  const gone = await run('docker', ['ps', '-a', '--filter', `name=^/${DB_CONTAINER}$`, '--format', '{{.Names}}']);
  assert.equal(gone.stdout.trim(), '', `the throwaway container is still listed: ${gone.stdout.trim()}`);
  console.log(`[§10] teardown: the service process is gone and the throwaway container ${DB_CONTAINER} is removed`);

  console.log('\n[summary] M10 v561: services/nexus-api BUILT and RAN against a real PostgreSQL · two endpoints subscribed with the events canonicalized to the trail\'s order and a secret readable once · a real publish committed and the AFTER_COMMIT fan-out knocked on BOTH endpoints, each knock recorded with the TRAIL\'s instant · a real unpublish fanned out the same way while the trail kept one entry per verb · the owner\'s ping wrote one receipt and the other endpoint got none · a refused ping wrote nothing · a stranger\'s account answers an empty log · psql counted four receipts, found no secret column, and read back the 64-character key the subscription answer gave once · an unpublish knocked only on the endpoint that asked for that verb · removing the subscription left its receipts intact · and a NEW JVM served the SAME four rows — the delivery log outlives the process that wrote it');
  rmSync(BUILD_DIR, { recursive: true, force: true });
  console.log('[m10-webhook-proof] ALL ASSERTIONS PASSED (a real backend service, a real database, one committed fact, and receipts that outlive their writer)');
} finally {
  if (serviceProcess && serviceProcess.exitCode === null) {
    await stopService(serviceProcess);
  }
  if (dbStarted) await run('docker', ['rm', '-f', DB_CONTAINER]);
}
