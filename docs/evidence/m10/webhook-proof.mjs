// NEXUS M10 v561–v563, v569–v570 — webhooks stop being a claim and start being a ROW IN A DATABASE (ADR 0021).
//
// ADR 0021 shipped four slices (v557 subscribe + sign, v558 the owner's ping, v559 the after-commit fan-out,
// v560 the delivery receipts). v561 added this live run, which closed the sentence those slices all ended
// with: *"Not graded yet: no proof against a live PostgreSQL exercises these rows, and no proof observes a
// delivery"*; v562 added the owner's key rotation; v563 the owner's REDELIVERY of one recorded attempt and the
// delivery id every knock now carries. Every gate that shipped was a UNIT gate — Mockito collaborators,
// annotations read back off the class, a socket the test itself owned. Those are real checks; none of them can
// say the thing this milestone is about:
//
//   a recorded fact, committed to a real database, causes this service to CALL OUT, and the attempt is written
//   down in a row that outlives the process that wrote it.
//
// That is what only THIS file answers. It builds the service, starts a throwaway PostgreSQL, starts the real
// jar against it, subscribes two endpoints, publishes a real project, takes it down, pings one endpoint, reads
// the receipt log back over HTTP, counts the rows with psql, removes a subscription, ROTATES the remaining
// subscription's signing key, REDELIVERS one of its receipts, and restarts the service against the same
// database. Sections:
//
//   §1 the service BUILDS and STARTS against a real PostgreSQL and answers on the port it announced;
//   §2 two endpoints are subscribed, the events are CANONICALIZED to the trail's order, the secret is 64 hex
//      and readable exactly once, no read answer carries it, a private literal and a duplicate are refused;
//   §3 a REAL publish commits → the AFTER_COMMIT fan-out POSTs to BOTH endpoints → TWO receipts, event
//      `publish`, target = the project, outcome `unreachable` (the name is RFC 6761 and cannot resolve),
//      and the receipt's `eventAt` is the AUDIT ENTRY's instant — one fact, two knocks;
//   §4 a real unpublish fans out to the endpoints that ASKED for that verb — one more receipt, because the
//      second endpoint subscribed to publish only — and the trail still holds exactly one entry per verb;
//   §5 the owner's ping writes ONE receipt (and no receipt for the endpoint it was not addressed to), the
//      answer names that receipt's id, and a ping refused for ownership, absence or a missing subscriber
//      writes NOTHING;
//   §6 the log's rules over HTTP: subscriber required, narrowing IN the query, the cap, the window, newest
//      first, and a stranger's account answers an EMPTY log rather than somebody else's receipts;
//   §7 the DATABASE itself: four rows in `webhook_delivery`, no `secret` column in it, the secret the one-time
//      answer gave is the 64-character value `webhook_subscription` stores, and no read door prints it;
//   §8 removing the subscription does NOT erase its receipts — a take-down removes the instruction, not the
//      record of having called it;
//   §9 the owner ROTATES the remaining subscription's signing key (the new secret is 64 hex and readable once,
//      the row's other fields are untouched, psql shows the OLD key is not retained, and a rotation — refused
//      or not — writes no receipt because it delivers nothing), then REDELIVERS one recorded attempt: a NEW
//      receipt repeating the SAME fact (event, target, eventAt) under a NEW id that names the attempt it
//      repeats, with 400/403/404 refusals of their own that write nothing;
//   §10 the receipts and the rotated key SURVIVE A RESTART: a new JVM, the same database, the same FIVE rows
//      with the same instants — which is the whole difference between `REQUIRES_NEW` committing and merely
//      being visible;
//   §11 the owner's HEALTH: one subscription's receipts answer its outcome counts, its newest attempt and the
//      attempts since its newest delivery — derived, never stored; a removed subscription whose receipts
//      remain is 404, and a missing owner / a stranger / an unknown id is refused by name;
//   §12 the owner's RETENTION: a prune removes every receipt attempted strictly BEFORE the instant it names,
//      optionally narrowed to one subscription, and its answer is the arithmetic it performed; a missing
//      owner, a missing instant or a future instant is refused and deletes nothing; a stranger's prune is an
//      honest zero; and taking the log to zero rows leaves the SUBSCRIPTION itself in place;
//   §13 teardown.
//
// Stated limit: no delivery in this run reaches a socket (see the `.invalid` note below), so the
// `X-Nexus-Delivery-Id` header and the fresh signature of a redelivery are graded by the unit gates, not
// here; this run grades the REDELIVERY'S ROW — the id the answer named, the source id it repeats, and the
// fact columns that are copied rather than re-typed.
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
import { javaRecordFields } from '../m9/wire-fields.mjs';

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
const RECEIPT_FIELDS = ['attemptedAt', 'detail', 'event', 'eventAt', 'id', 'outcome', 'redeliveryOf', 'status', 'targetId', 'webhookId'].sort();

// ── §0a static wire contract: the Java DTO must declare exactly the fields these doors print.
{
  const WEBHOOK_DTO = path.join(SERVICE_DIR, 'src/main/java/dev/nexus/api/webhooks/WebhookDtos.java');
  const wireOf = (recordName) => javaRecordFields(WEBHOOK_DTO, recordName).map((f) => f.name).sort();
  const check = (recordName, pinned, label) => {
    const wire = wireOf(recordName);
    assert.deepEqual(wire, pinned, `WebhookDtos.${recordName} ${label} fields ${JSON.stringify(wire)} disagree with the pinned ${JSON.stringify(pinned)}`);
  };
  check('DeliveryRecord', RECEIPT_FIELDS, 'a receipt');
  check('DeliveryAnswer', ['at', 'delivered', 'deliveryId', 'detail', 'outcome', 'status', 'url', 'webhookId'], 'a delivery answer');
  check('SubscribeRequest', ['events', 'subscriberId', 'url'], 'the subscribe request');
  check('WebhookSecret', ['createdAt', 'events', 'id', 'note', 'secret', 'url'], 'the subscribe answer');
  check('WebhookList', ['limit', 'offset', 'subscriberId', 'total', 'webhooks'], 'the subscription window');
  check('WebhookDeliveryList', ['deliveries', 'limit', 'offset', 'subscriberId', 'total'], 'the delivery window');
  check('PruneAnswer', ['before', 'pruned', 'remaining', 'subscriberId', 'webhookId'], 'a prune answer');
  check('WebhookHealth', ['attemptsSinceLastDelivery', 'createdAt', 'delivered', 'events', 'lastAttemptAt', 'lastDeliveredAt', 'lastDetail', 'lastOutcome', 'lastStatus', 'refused', 'subscriberId', 'totalAttempts', 'unreachable', 'url', 'webhookId'], 'a health answer');
  console.log(`[§0a] static wire contract: every pinned WebhookDtos record agrees with its pinned field array, read from source`);
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

  const asJson = (_value) => ({ 'content-type': 'application/json' });
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
  // Kept so §9 can prove the ROTATION minted a new key rather than echoing the one this answer gave.
  const secretB = subscribedB.body.secret;

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
    assert.deepEqual(Object.keys(receipt).sort(), RECEIPT_FIELDS, `a receipt carries exactly its ten fields: ${JSON.stringify(receipt)}`);
    assert.equal(receipt.event, 'publish', `the fan-out delivers the trail's verb, got ${receipt.event}`);
    assert.equal(receipt.targetId, projectId, `the fan-out names what the event happened to, got ${receipt.targetId}`);
    // v563: a FIRST knock repeats nothing, and the field says so instead of being absent.
    assert.equal(receipt.redeliveryOf, null, `a fan-out knock is not a repeat of anything, got ${JSON.stringify(receipt.redeliveryOf)}`);
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
  // v563 — the answer names the receipt it just wrote, so an owner can point at that row without guessing.
  assert.equal(typeof ping.body.deliveryId, 'string', `the ping answer must name its receipt, got ${JSON.stringify(ping.body)}`);
  assert.ok(ping.body.deliveryId.length > 0);

  const afterPing = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}`);
  assert.equal(afterPing.body.total, 4, `the ping adds exactly ONE receipt, got ${afterPing.body.total}`);
  const pingReceipts = afterPing.body.deliveries.filter((r) => r.event === 'ping');
  assert.equal(pingReceipts.length, 1, `one ping is one receipt, got ${pingReceipts.length}`);
  assert.equal(pingReceipts[0].webhookId, webhookIdA, 'the receipt names the endpoint the ping was ADDRESSED to');
  assert.equal(pingReceipts[0].targetId, webhookIdA, "a ping's target is the subscription it proves");
  assert.equal(pingReceipts[0].eventAt, ping.body.at, "the receipt's eventAt is the instant the ping answer named");
  assert.equal(pingReceipts[0].id, ping.body.deliveryId, 'the receipt the answer named IS the row the log holds — one knock, one identity');
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

  // ── §9 the owner ROTATES the remaining subscription's signing key ──────────────────────────────
  const rotated = await call(`/webhooks/${q(webhookIdB)}/rotate?subscriber=${q(subscriber)}`, { method: 'POST' });
  assert.equal(rotated.status, 200, `an owner's rotation answers 200, got ${rotated.status}: ${rotated.text}`);
  assert.equal(rotated.body.id, webhookIdB, 'the answer names the same subscription');
  assert.equal(rotated.body.url, endpointB, 'rotation does not move the endpoint');
  assert.deepEqual(rotated.body.events, ['publish'], 'rotation changes the KEY, not the instruction');
  assert.equal(rotated.body.createdAt, subscribedB.body.createdAt, 'rotation does not rewrite the creation instant');
  assert.match(rotated.body.secret, /^[0-9a-f]{64}$/, `a rotated secret is still 32 bytes of lowercase hex, got ${JSON.stringify(rotated.body.secret)}`);
  assert.notEqual(rotated.body.secret, secretB, 'a rotation must MINT a new key, not echo the one the subscription answer gave');
  assert.match(rotated.body.note, /only time this secret is readable/, `the rotation answer restates the once-only rule: ${JSON.stringify(rotated.body.note)}`);

  const afterRotation = await call(`/webhooks?subscriber=${q(subscriber)}`);
  assert.equal(afterRotation.status, 200, `the listing must answer after a rotation, got ${afterRotation.status}`);
  assert.equal(afterRotation.body.total, 1, 'still one subscription — rotation is not a second row');
  assert.equal(afterRotation.body.webhooks[0].id, webhookIdB);
  assert.ok(!('secret' in afterRotation.body.webhooks[0]), `the listing still carries NO secret field: ${JSON.stringify(afterRotation.body.webhooks[0])}`);
  assert.ok(!afterRotation.text.includes(rotated.body.secret), 'the listing must not print the key the rotation answered with');

  // One secret column, overwritten in place: the value the database signs with is the NEW key, and the old
  // one is not retained anywhere — a receiver still holding it will fail its own verification from now on.
  const storedRotated = await sql(`select secret from webhook_subscription where webhook_id = '${webhookIdB}'`);
  assert.equal(storedRotated, rotated.body.secret, 'the database stores the NEW key the one-time answer gave');
  assert.notEqual(storedRotated, secretB, 'the OLD key is not retained anywhere — rotation overwrites the single secret column');

  // Rotation is a management door, not an attempt: it delivers nothing, so it may not write a receipt.
  const afterRotationLog = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}`);
  assert.equal(afterRotationLog.body.total, 4, `a rotation writes NO receipt, got ${afterRotationLog.body.total}`);

  // Three refusals, and NONE of them may mint a key behind the caller's back.
  const rotateNoSubscriber = await call(`/webhooks/${q(webhookIdB)}/rotate`, { method: 'POST' });
  assert.equal(rotateNoSubscriber.status, 400, `a rotation with no subscriber is refused, got ${rotateNoSubscriber.status}`);
  assert.equal(rotateNoSubscriber.body.error, 'invalid-webhook');

  const rotateByStranger = await call(`/webhooks/${q(webhookIdB)}/rotate?subscriber=${q(stranger)}`, { method: 'POST' });
  assert.equal(rotateByStranger.status, 403, `a stranger must not rotate another subscriber's key, got ${rotateByStranger.status}`);
  assert.equal(rotateByStranger.body.error, 'not-your-webhook');

  const rotateMissing = await call(`/webhooks/no-such-${STAMP}/rotate?subscriber=${q(subscriber)}`, { method: 'POST' });
  assert.equal(rotateMissing.status, 404, `an id that names nothing is 404, got ${rotateMissing.status}`);
  assert.equal(rotateMissing.body.error, 'no-such-webhook');

  const storedAfterRefusals = await sql(`select secret from webhook_subscription where webhook_id = '${webhookIdB}'`);
  assert.equal(storedAfterRefusals, rotated.body.secret, 'a refused rotation must not have minted a key');

  // ── v563: ONE recorded attempt can be REPEATED, and the new row names the one it repeats ────────
  // Endpoint B's publish knock is the source: B still exists (rotated above), so the door has an endpoint and
  // the CURRENT key to sign a new knock with.
  const sourceReceipt = afterRotationLog.body.deliveries.find(
    (r) => r.webhookId === webhookIdB && r.event === 'publish');
  assert.ok(sourceReceipt, `endpoint B's publish receipt must exist to redeliver, got ${JSON.stringify(afterRotationLog.body.deliveries.map((r) => r.event))}`);

  const redelivered = await call(`/webhooks/deliveries/${q(sourceReceipt.id)}/redeliver?subscriber=${q(subscriber)}`, { method: 'POST' });
  assert.equal(redelivered.status, 200, `an owner's redelivery answers 200, got ${redelivered.status}: ${redelivered.text}`);
  assert.equal(redelivered.body.webhookId, webhookIdB, 'the redelivery knocks on the subscription the receipt came from');
  assert.equal(redelivered.body.url, endpointB, 'and on the same endpoint');
  assert.equal(redelivered.body.delivered, false, 'nothing was reached, so delivered is false');
  assert.equal(redelivered.body.outcome, 'unreachable');
  assert.equal(redelivered.body.status, null);
  assert.equal(typeof redelivered.body.detail, 'string');
  // The FACT is the source's: the body carries the original instant (the answer repeats it), not this clock.
  assert.equal(redelivered.body.at, sourceReceipt.eventAt, 'a redelivery repeats the fact instant, it does not invent a new one');
  assert.equal(typeof redelivered.body.deliveryId, 'string');
  assert.notEqual(redelivered.body.deliveryId, sourceReceipt.id, 'a redelivery is a NEW knock, not a re-print of the receipt it repeats');

  const afterRedelivery = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}`);
  assert.equal(afterRedelivery.body.total, 5, `the redelivery adds exactly ONE receipt, got ${afterRedelivery.body.total}`);
  const repeated = afterRedelivery.body.deliveries.find((r) => r.id === redelivered.body.deliveryId);
  assert.ok(repeated, `the answer's deliveryId must name a row the log holds, got ${JSON.stringify(afterRedelivery.body.deliveries.map((r) => r.id))}`);
  assert.equal(repeated.redeliveryOf, sourceReceipt.id, 'the new receipt NAMES the attempt it repeats');
  assert.equal(repeated.event, 'publish', 'the fact is copied from the source, not re-typed');
  assert.equal(repeated.targetId, projectId);
  assert.equal(repeated.eventAt, sourceReceipt.eventAt);
  assert.ok(repeated.attemptedAt >= sourceReceipt.attemptedAt, 'the repeat cannot predate the attempt it repeats');
  assert.equal(repeated.outcome, 'unreachable');
  assert.equal(repeated.status, null);
  assert.equal(afterRedelivery.body.deliveries.filter((r) => r.redeliveryOf !== null).length, 1, 'exactly ONE row is a repeat — the other four are first knocks');

  // Four refusals, and NONE of them may knock: the log stays at five rows.
  const redeliverNoSubscriber = await call(`/webhooks/deliveries/${q(sourceReceipt.id)}/redeliver`, { method: 'POST' });
  assert.equal(redeliverNoSubscriber.status, 400, `a redelivery with no subscriber is refused, got ${redeliverNoSubscriber.status}`);
  assert.equal(redeliverNoSubscriber.body.error, 'invalid-webhook');

  const redeliverByStranger = await call(`/webhooks/deliveries/${q(sourceReceipt.id)}/redeliver?subscriber=${q(stranger)}`, { method: 'POST' });
  assert.equal(redeliverByStranger.status, 403, `a stranger must not repeat another subscriber's attempt, got ${redeliverByStranger.status}`);
  assert.equal(redeliverByStranger.body.error, 'not-your-webhook');

  const redeliverMissing = await call(`/webhooks/deliveries/no-such-${STAMP}/redeliver?subscriber=${q(subscriber)}`, { method: 'POST' });
  assert.equal(redeliverMissing.status, 404, `a receipt id that names nothing is 404, got ${redeliverMissing.status}`);
  assert.equal(redeliverMissing.body.error, 'no-such-delivery');

  // The receipt outlives the subscription it was addressed to (§8), but a redelivery needs the endpoint AND a
  // key. A is gone, so its receipt is a 404 that NAMES the reason rather than a knock into nothing.
  const removedReceiptId = aReceiptsAfterRemoval.body.deliveries[0].id;
  const redeliverRemoved = await call(`/webhooks/deliveries/${q(removedReceiptId)}/redeliver?subscriber=${q(subscriber)}`, { method: 'POST' });
  assert.equal(redeliverRemoved.status, 404, `a receipt whose subscription was removed is 404, got ${redeliverRemoved.status}`);
  assert.equal(redeliverRemoved.body.error, 'no-such-webhook');
  assert.match(redeliverRemoved.body.message, /gone/, `the refusal must NAME why: ${JSON.stringify(redeliverRemoved.body.message)}`);

  const afterRedeliveryRefusals = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}`);
  assert.equal(afterRedeliveryRefusals.body.total, 5, `a refused redelivery is not an attempt — still five rows, got ${afterRedeliveryRefusals.body.total}`);

  // The DATABASE agrees with the wire: the column exists, ONE row names its source, and the first knocks do not.
  const redeliveryColumn = await sql("select count(*) from information_schema.columns where table_name = 'webhook_delivery' and column_name = 'redelivery_of'");
  assert.equal(redeliveryColumn, '1', 'webhook_delivery must carry the redelivery_of column');
  const storedRedeliveryOf = await sql(`select redelivery_of from webhook_delivery where delivery_id = '${redelivered.body.deliveryId}'`);
  assert.equal(storedRedeliveryOf, sourceReceipt.id, 'psql reads back the source id the answer and the log named');
  const repeatsInDb = await sql(`select count(*) from webhook_delivery where subscriber_account_id = '${subscriber}' and redelivery_of is not null`);
  assert.equal(repeatsInDb, '1', 'exactly one stored row is a repeat');
  const sourceIsFirstKnock = await sql(`select redelivery_of from webhook_delivery where delivery_id = '${sourceReceipt.id}'`);
  assert.equal(sourceIsFirstKnock, '', 'the source row itself repeats nothing — redelivery_of is NULL there');

  console.log(`[§9] rotated endpoint B's key → a NEW 64-hex secret shown once (the old one is gone from the row, psql agrees), url/events/createdAt unchanged · the listing still prints no secret · the log still held 4 rows because a rotation delivers nothing · 400/403/404 rotations left the stored key untouched · REDELIVERED B's publish receipt → a 5th row with a NEW id naming ${sourceReceipt.id} as the attempt it repeats, the SAME event/target/eventAt and a later attemptedAt (psql agrees: redelivery_of is set on one row and NULL on the source) · 400/403/404 redeliveries — including A's receipt whose subscription is gone — wrote NOTHING`);

  // ── §10 the receipts and the rotated key SURVIVE A RESTART ─────────────────────────────────────
  const beforeRestart = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}`);
  assert.equal(beforeRestart.body.total, 5);
  const snapshot = beforeRestart.body.deliveries.map((r) => JSON.stringify(r));
  const pidBefore = serviceProcess.pid;

  await stopService(serviceProcess);
  assert.ok(serviceProcess.exitCode !== null || serviceProcess.signalCode !== null, 'the service must actually stop before the restart means anything');

  const restarted = await startService(apiPort);
  serviceProcess = restarted.child;
  assert.equal(restarted.port, apiPort, 'the restart binds the same port, or every receipt URL would have moved');

  const afterRestart = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}`);
  assert.equal(afterRestart.status, 200, `the log must answer after a restart, got ${afterRestart.status}`);
  assert.equal(afterRestart.body.total, 5, `five receipts must survive, got ${afterRestart.body.total}`);
  assert.deepEqual(
    afterRestart.body.deliveries.map((r) => JSON.stringify(r)),
    snapshot,
    'the restarted service must answer the SAME receipts (ids, instants, outcomes and details) — a REQUIRES_NEW row that never committed would be visible before the restart and gone after it');

  const subscriptionsAfterRestart = await call(`/webhooks?subscriber=${q(subscriber)}`);
  assert.equal(subscriptionsAfterRestart.body.total, 1, 'the removal also survived the restart');
  assert.ok(!('secret' in subscriptionsAfterRestart.body.webhooks[0]), 'the read door still prints no secret after the restart');

  // The rotated key is the row's value, not a copy the old process held in memory: psql, read by a NEW JVM's
  // database, must answer the secret the rotation gave once.
  const storedKeyAfterRestart = await sql(`select secret from webhook_subscription where webhook_id = '${webhookIdB}'`);
  assert.equal(storedKeyAfterRestart, rotated.body.secret, 'the rotated key survived the restart');
  console.log(`[§10] process ${pidBefore} was killed and a new JVM served the SAME five receipts from the same database, identical in id, instants, outcome, detail and the source id the repeat names, with the ROTATED key still the stored one — the delivery log is a system of record, not a cache, and REQUIRES_NEW really committed`);

  // ── §11 the owner's HEALTH: the receipt log answers for its subscription, not a stored summary ─────
  // Endpoint B is the remaining subscription: its log holds the publish knock and the repeat, both
  // unreachable. The health door must count them over the subscription's WHOLE log — endpoint A's three
  // receipts are not B's — and name the NEWEST attempt rather than a page's first row by luck.
  const health = await call(`/webhooks/${q(webhookIdB)}/health?subscriber=${q(subscriber)}`);
  assert.equal(health.status, 200, `the owner's health door must answer, got ${health.status}: ${health.text}`);
  assert.equal(health.body.webhookId, webhookIdB);
  assert.equal(health.body.subscriberId, subscriber);
  assert.equal(health.body.url, endpointB);
  assert.deepEqual(health.body.events, ['publish'], 'the health answer restates the instruction it is about');
  const bRows = afterRestart.body.deliveries.filter((r) => r.webhookId === webhookIdB);
  assert.equal(bRows.length, 2, `endpoint B must hold two receipts, got ${bRows.length}`);
  assert.equal(health.body.totalAttempts, bRows.length, 'the count is endpoint B\'s OWN log, not the account\'s');
  assert.equal(health.body.delivered, 0, 'nothing reached hooks.invalid: delivered is zero');
  assert.equal(health.body.refused, 0, 'an unresolvable name is unreachable, not refused');
  assert.equal(health.body.unreachable, bRows.length, 'every attempt of B was unreachable');
  assert.equal(health.body.lastDeliveredAt, null, 'nothing delivered yet, so there is no delivery instant');
  assert.equal(health.body.attemptsSinceLastDelivery, bRows.length,
      'with no delivery ever, every attempt is "since the last delivery" — not an invented zero');
  assert.equal(health.body.lastAttemptAt, bRows[0].attemptedAt, 'the newest attempt is the repeat, and the log\'s order says so');
  assert.equal(health.body.lastOutcome, 'unreachable');
  assert.equal(health.body.lastStatus, null);
  assert.equal(typeof health.body.lastDetail, 'string');
  assert.ok(!('secret' in health.body), 'a health answer must never print the secret');

  // A's receipts survive A's subscription (§8), but HEALTH is about the INSTRUCTION: A is gone, so the
  // door is a 404 that names absence rather than an empty "healthy" record built from orphan rows.
  const healthGone = await call(`/webhooks/${q(webhookIdA)}/health?subscriber=${q(subscriber)}`);
  assert.equal(healthGone.status, 404, `a removed subscription has no health record, got ${healthGone.status}`);
  assert.equal(healthGone.body.error, 'no-such-webhook');

  const healthNoSubscriber = await call(`/webhooks/${q(webhookIdB)}/health`);
  assert.equal(healthNoSubscriber.status, 400, `a health check without an owner is refused, got ${healthNoSubscriber.status}`);
  assert.equal(healthNoSubscriber.body.error, 'invalid-webhook');
  assert.match(healthNoSubscriber.body.message, /subscriber/, 'the refusal must name the missing owner');

  const healthStranger = await call(`/webhooks/${q(webhookIdB)}/health?subscriber=${q(stranger)}`);
  assert.equal(healthStranger.status, 403, `a stranger must not read another subscriber's health, got ${healthStranger.status}`);
  assert.equal(healthStranger.body.error, 'not-your-webhook');

  const healthMissing = await call(`/webhooks/no-such-${STAMP}/health?subscriber=${q(subscriber)}`);
  assert.equal(healthMissing.status, 404, `an id that names nothing is 404, got ${healthMissing.status}`);
  assert.equal(healthMissing.body.error, 'no-such-webhook');

  // A read is not an attempt: four health asks wrote no receipt, so the log stays at five.
  const afterHealth = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}`);
  assert.equal(afterHealth.body.total, 5, `a health check must write nothing, got ${afterHealth.body.total}`);

  console.log(`[§11] the owner's health door answered endpoint B's OWN record: ${health.body.totalAttempts} attempts, 0 delivered / 0 refused / ${health.body.unreachable} unreachable, no delivery instant, all ${health.body.attemptsSinceLastDelivery} attempts since the last delivery, newest ${health.body.lastOutcome} at ${health.body.lastAttemptAt} — derived from the receipts, not stored · A's removed subscription is a 404 while its receipts remain · 400/403/404 for a missing owner, a stranger and an unknown id, and the four reads wrote NO receipt`);

  // ── §12 the owner's RETENTION: a cutoff deletes what it EXCLUDES, and only that ─────────────────
  // The two newest receipts after the restart are the boundary: the ping (oldest of the two) is the instant
  // the prune names, and everything STRICTLY before it goes. The ping's own row survives because the cutoff
  // is exclusive — this is the difference between "delete through" and "delete before".
  const [survivor, boundary] = afterRestart.body.deliveries;
  assert.ok(survivor && boundary, 'the log must hold at least two receipts for a cutoff to divide them');
  const cutoff = boundary.attemptedAt;
  assert.ok(cutoff > 0, 'the boundary receipt must name an instant a prune can use');

  // A NARROWED prune reaches only the subscription it names — even after that subscription is gone (§8):
  // endpoint A's three receipts are on file, its two OLDER ones are below the cutoff, and its ping IS the
  // boundary. Endpoint B's two receipts must not move.
  const aLogBeforePrune = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}&webhook=${q(webhookIdA)}`);
  const aPrunable = aLogBeforePrune.body.deliveries.filter((r) => r.attemptedAt < cutoff).length;
  const narrowed = await call(
      `/webhooks/deliveries?subscriber=${q(subscriber)}&webhook=${q(webhookIdA)}&before=${cutoff}`,
      { method: 'DELETE' });
  assert.equal(narrowed.status, 200, `the owner's narrowed prune must answer, got ${narrowed.status}`);
  assert.equal(narrowed.body.subscriberId, subscriber, 'the answer names the account the prune belonged to');
  assert.equal(narrowed.body.webhookId, webhookIdA, 'and the ONE subscription it was narrowed to');
  assert.equal(narrowed.body.before, cutoff, 'and the instant it kept');
  assert.equal(narrowed.body.pruned, aPrunable, 'the narrowed prune removes endpoint A\'s receipts below the cutoff');
  assert.equal(narrowed.body.remaining, aLogBeforePrune.body.total - aPrunable,
      'the remaining count is endpoint A\'s OWN log, not the account\'s');
  const wholeAfterNarrowed = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}`);
  assert.equal(wholeAfterNarrowed.body.total, afterRestart.body.total - aPrunable,
      'the narrowed prune must not touch endpoint B\'s receipts');

  // The WHOLE log, same cutoff: the rows below it go, the rows at or above it stay, and the answer is the
  // arithmetic — pruned + remaining = the log that existed before the knock.
  const kept = wholeAfterNarrowed.body.deliveries.filter((r) => r.attemptedAt >= cutoff);
  const expectedPruned = wholeAfterNarrowed.body.total - kept.length;
  const pruned = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}&before=${cutoff}`, { method: 'DELETE' });
  assert.equal(pruned.status, 200, `the owner's prune must answer, got ${pruned.status}`);
  assert.equal(pruned.body.webhookId, null, 'a prune with no webhook named is the whole log, and it says so');
  assert.equal(pruned.body.pruned, expectedPruned, 'the prune removes every receipt attempted strictly before the cutoff');
  assert.equal(pruned.body.remaining, kept.length, 'and it answers what the log still holds');
  assert.equal(pruned.body.pruned + pruned.body.remaining, wholeAfterNarrowed.body.total,
      'the answer accounts for every row that existed before the prune');

  const afterPrune = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}`);
  assert.equal(afterPrune.body.total, kept.length, 'the read door agrees with the prune\'s answer');
  assert.deepEqual(afterPrune.body.deliveries.map((r) => r.id), kept.map((r) => r.id),
      'what remains is exactly the receipts the cutoff kept, newest first — not a guess, not a window');

  // A prune must NAME what it keeps. Three asks cannot: no owner, no instant, an instant in the future.
  const pruneNoSubscriber = await call(`/webhooks/deliveries?before=${cutoff}`, { method: 'DELETE' });
  assert.equal(pruneNoSubscriber.status, 400, `a prune without an owner must be refused, got ${pruneNoSubscriber.status}`);
  assert.equal(pruneNoSubscriber.body.error, 'invalid-webhook');
  assert.match(pruneNoSubscriber.body.message, /subscriber/, 'the refusal must name the missing owner');

  const noInstant = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}`, { method: 'DELETE' });
  assert.equal(noInstant.status, 400, `a prune without an instant must be refused, got ${noInstant.status}`);
  assert.equal(noInstant.body.error, 'invalid-webhook');
  assert.match(noInstant.body.message, /before/, 'the refusal must name the missing instant');

  const future = await call(
      `/webhooks/deliveries?subscriber=${q(subscriber)}&before=${Date.now() + 60_000}`, { method: 'DELETE' });
  assert.equal(future.status, 400, `a prune naming a future instant must be refused, got ${future.status}`);
  assert.equal(future.body.error, 'invalid-webhook');
  assert.match(future.body.message, /future/, 'the refusal must say why — it would delete rows that do not exist yet');

  const afterPruneRefusals = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}`);
  assert.equal(afterPruneRefusals.body.total, kept.length, 'none of the three refusals removed a row');

  // A stranger's prune is an honest ZERO rather than a refusal: there is nothing of theirs to remove, and
  // the owner's log cannot be named by somebody else's account.
  const strangerPrune = await call(
      `/webhooks/deliveries?subscriber=${q(stranger)}&before=${Date.now()}`, { method: 'DELETE' });
  assert.equal(strangerPrune.status, 200, `a stranger's prune is an empty result, not a refusal, got ${strangerPrune.status}`);
  assert.equal(strangerPrune.body.subscriberId, stranger);
  assert.equal(strangerPrune.body.pruned, 0, 'a stranger removes nothing');
  assert.equal(strangerPrune.body.remaining, 0, 'and their own log is empty');
  const ownerAfterStranger = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}`);
  assert.equal(ownerAfterStranger.body.total, kept.length, 'the owner still holds every receipt the cutoff kept');

  // Take the log to ZERO through the same door: the receipts go, the SUBSCRIPTION stays, and psql agrees —
  // the prune is a delete, not a window that hides rows.
  const all = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}&before=${Date.now()}`, { method: 'DELETE' });
  assert.equal(all.status, 200, `the owner's final prune must answer, got ${all.status}`);
  assert.equal(all.body.pruned, kept.length, 'every receipt the cutoff kept is older than now');
  assert.equal(all.body.remaining, 0, 'the log is empty');
  const emptied = await call(`/webhooks/deliveries?subscriber=${q(subscriber)}`);
  assert.equal(emptied.body.total, 0, 'the read door answers an empty log');
  const rowsLeft = await sql(`select count(*) from webhook_delivery where subscriber_account_id = '${subscriber}'`);
  assert.equal(rowsLeft, '0', 'psql reads zero rows — the prune deleted them, it did not hide them');
  const subscriptionsLeft = await sql(`select count(*) from webhook_subscription where subscriber_account_id = '${subscriber}'`);
  assert.equal(subscriptionsLeft, '1', 'a prune removes RECEIPTS, not the instruction that produced them');

  console.log(`[§12] the owner pruned endpoint A's ${aPrunable} receipts below the cutoff through the NARROWED door (its remaining count was A's own log, and endpoint B's receipts were untouched) · then pruned the WHOLE log at the same cutoff: ${expectedPruned} below it went, ${kept.length} at or above it stayed, and the answer was the arithmetic · 400 for a missing owner, a missing instant and a future instant — none removed a row · a stranger's prune was an honest 0/0 while the owner kept everything · a final prune at now took the log to ZERO rows in psql and left the SUBSCRIPTION itself in place — retention belongs to the owner, and a receipt is not an instruction`);

  // ── §13 teardown ────────────────────────────────────────────────────────────────────────────────
  await stopService(serviceProcess);
  const rm = await run('docker', ['rm', '-f', DB_CONTAINER]);
  assert.equal(rm.code, 0, `could not remove the throwaway database: ${rm.stderr}`);
  dbStarted = false;
  const gone = await run('docker', ['ps', '-a', '--filter', `name=^/${DB_CONTAINER}$`, '--format', '{{.Names}}']);
  assert.equal(gone.stdout.trim(), '', `the throwaway container is still listed: ${gone.stdout.trim()}`);
  console.log(`[§13] teardown: the service process is gone and the throwaway container ${DB_CONTAINER} is removed`);

  console.log('\n[summary] M10 v561–v563, v569–v570: services/nexus-api BUILT and RAN against a real PostgreSQL · two endpoints subscribed with the events canonicalized to the trail\'s order and a secret readable once · a real publish committed and the AFTER_COMMIT fan-out knocked on BOTH endpoints, each knock recorded with the TRAIL\'s instant · a real unpublish fanned out the same way while the trail kept one entry per verb · the owner\'s ping wrote one receipt and the other endpoint got none · a refused ping wrote nothing · a stranger\'s account answers an empty log · psql counted five receipts, found no secret column, and read back the 64-character key the subscription answer gave once · an unpublish knocked only on the endpoint that asked for that verb · removing the subscription left its receipts intact · the owner ROTATED the remaining key, the old one was not retained anywhere, and the listing kept printing no secret · the owner REDELIVERED one recorded attempt into a NEW row that repeats the same fact and names its source, with 400/403/404 refusals that knocked on nothing · and a NEW JVM served the SAME five rows WITH the rotated key — the delivery log outlives the process that wrote it · and the OWNER read its HEALTH off those receipts: endpoint B\'s own two attempts, all unreachable, no delivery instant, every attempt since the last delivery, the newest outcome and instant named — derived, never stored — while A\'s removed subscription was a 404 and a missing owner / a stranger / an unknown id were refused without writing a receipt · and the OWNER pruned it: a narrowed cutoff removed endpoint A\'s older rows and kept the boundary receipt, the whole-log cutoff answered exactly the arithmetic while the kept rows stayed, a missing owner / a missing instant / a future instant deleted nothing, a stranger\'s prune was 0/0, and a final prune took the log to zero rows in psql with the SUBSCRIPTION still in place');
  rmSync(BUILD_DIR, { recursive: true, force: true });
  console.log('[m10-webhook-proof] ALL ASSERTIONS PASSED (a real backend service, a real database, one committed fact, a key its owner can rotate, receipts that outlive their writer, a log its owner can prune, and a health read derived from those receipts)');
} finally {
  if (serviceProcess && serviceProcess.exitCode === null) {
    await stopService(serviceProcess);
  }
  if (dbStarted) await run('docker', ['rm', '-f', DB_CONTAINER]);
}
