// NEXUS M7 v193 — "hosted publish" stops being deferred (ADR 0016 amendment 193).
//
// Every milestone before this one ended with the same bound, written down every time: M1 deferred hosted
// publish to M7, and the M6 deploy face's own record says *"deploy means RECORDS on this server — not a
// push, not a publish, not a release"*. This proof is the first thing in this repository that RUNS A REAL
// BACKEND SERVICE against a REAL DATABASE and reads back what it stored.
//
// It is deliberately not a unit test. `services/nexus-api/src/test` already checks the four rules
// `PublishService` owns, with no Spring context and no database. What only THIS file can answer is:
//
//   §1 the service BUILDS and STARTS against a real PostgreSQL, and answers on a port it was told to use;
//   §2 publishing creates version 1 and answers 201 with a URL that names THIS server;
//   §3 the publication reads back with its document as JSON — not as an escaped string, which is the
//      double-encoding bug a record service gets wrong;
//   §4 re-publishing UPDATES the row: same id, version 2, and still exactly ONE row in the table;
//   §5 a refusal is a 400 that names the rule, and an unpublished id is a 404 rather than an empty 200;
//   §6 the publication SURVIVES A SERVICE RESTART — which is the whole difference between a system of
//      record and a cache, and the one claim a test with an in-memory fake cannot make;
//   §7 the throwaway database and the service process are gone afterwards.
//
// Everything it creates is throwaway: a `pgvector/pgvector:pg16` container on a port nothing else is using,
// removed by name at the end; the jar is built into the service's own `target/`, which is gitignored.
//
// Requires: Java 25, Maven, and a running Docker daemon. Run:  node docs/evidence/m7/publish-proof.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// THREE levels up: this file is docs/evidence/m7/publish-proof.mjs, so '../..' would land on docs/ — and a
// cwd that does not exist makes spawn answer ENOENT, which reads as "the command is missing". Measured.
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SERVICE_DIR = path.join(REPO_ROOT, 'services/nexus-api');
const JAR = path.join(SERVICE_DIR, 'target/nexus-api-0.1.0-SNAPSHOT.jar');
const DB_IMAGE = 'pgvector/pgvector:pg16';
const STAMP = `${Date.now()}-${process.pid}`;
const DB_CONTAINER = `nexus-api-proof-db-${STAMP}`;
const DB_NAME = 'nexus';
const DB_USER = 'nexus';
const DB_PASSWORD = 'nexus';
// The service writes the port it bound here. A THROWAWAY path under the OS temp dir, removed in teardown.
const PORT_FILE = path.join(tmpdir(), `nexus-api-proof-port-${STAMP}.txt`);

/** Can this host open a TCP connection to `port`? Proves a PUBLISHED docker port is usable. */
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

/**
 * How long a Spring Boot JVM gets to answer, in seconds.
 *
 * MEASURED, and the number is not the happy path: this service starts in ~12s on an idle machine and took
 * **40.4s** while the same machine was running containers and dev servers. The first version of these
 * proofs waited 40s and failed intermittently for a reason that had nothing to do with the code under test
 * — a proof whose timeout sits at the median is a proof that flakes.
 */
const SERVICE_START_TRIES = 180;

/**
 * Maven, invoked EXPLICITLY rather than through a shell.
 *
 * Two Windows facts this has to survive, both measured the hard way while writing this proof:
 *   1. `mvn` is a `.cmd` shim, and Node refuses to spawn one directly (the CVE-2024-27980 mitigation answers
 *      EINVAL) — which reads as "maven is not installed" when maven is installed and working.
 *   2. Asking Node for a shell instead (`shell: true`) answered `spawn C:////WINDOWS////system32////cmd.exe ENOENT`
 *      on this host even though that file exists and `ComSpec` points at it.
 *
 * So the shim is RESOLVED on PATH and handed to `cmd.exe` by full path with `/c`. No shell widening, no
 * assumption about where maven lives, and the failure mode is a named path rather than an errno.
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

function runMaven(args, opts) {
  if (process.platform !== 'win32') return run('mvn', args, opts);
  const mvn = findOnPath('mvn');
  assert.ok(mvn, 'maven is not on PATH; ADR 0011 builds nexus-api with Maven');
  return run(process.env.ComSpec ?? 'cmd.exe', ['/c', mvn, ...args], opts);
}

/** Ask the OS for a port nothing is listening on, then let it go. The proof owns the port it uses. */
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

/**
 * Run a command ASYNCHRONOUSLY and resolve with its exit code and output.
 *
 * Async `spawn` and never `spawnSync`: the synchronous family is unusable on this host (ADR 0016 amendment
 * 152 measured 100% EBUSY for `spawnSync` and 0% for async `spawn` at 8-way concurrency).
 */
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

/** Poll until `probe()` is truthy or the budget runs out. Returns the value or null. */
async function until(probe, { tries = 60, gapMs = 500, label = 'condition' } = {}) {
  for (let i = 0; i < tries; i++) {
    const value = await probe();
    if (value) return value;
    await sleep(gapMs);
  }
  console.log(`[m7] gave up waiting for ${label} after ${tries} tries`);
  return null;
}

/**
 * Stop the service and WAIT until the process is really gone.
 *
 * `child.kill()` alone is not enough here: measured while writing this proof, a Spring Boot JVM did not
 * exit within ten seconds of it (it has shutdown hooks, and Windows has no SIGTERM to deliver). So the
 * polite kill is followed by a forced one by PID, and the wait is long enough for a JVM that is shutting
 * down properly. A restart that began while the old process still held the port would fail for a reason
 * that has nothing to do with the code under test.
 */
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
  console.log(`[m7] tools: ${javaLine.trim()} · docker server ${dockerVersion.stdout.trim()}`);

  // ── §1 build the jar, start a throwaway database, start the service against it ───────────────────
  const build = await runMaven(['-B', '-q', 'package', '-DskipTests'], { cwd: SERVICE_DIR, timeoutMs: 600_000 });
  assert.equal(build.code, 0, `mvn package failed:\n${build.stdout}\n${build.stderr}`);
  assert.ok(existsSync(JAR), `the build produced no jar at ${JAR}`);
  console.log(`[m7] built ${path.relative(REPO_ROOT, JAR)}`);

  const dbPort = await freePort();
  const startDb = await run('docker', [
    'run', '-d', '--rm', '--name', DB_CONTAINER,
    '-e', `POSTGRES_USER=${DB_USER}`, '-e', `POSTGRES_PASSWORD=${DB_PASSWORD}`, '-e', `POSTGRES_DB=${DB_NAME}`,
    '-p', `127.0.0.1:${dbPort}:5432`,
    DB_IMAGE,
  ]);
  assert.equal(startDb.code, 0, `could not start the throwaway database: ${startDb.stderr}`);
  dbStarted = true;

  // Ready means TWO things, and the first version of this proof only checked one of them: `pg_isready`
  // runs INSIDE the container, so it proves postgres is up but says nothing about the HOST port mapping —
  // and it is the host mapping the service actually connects through. A `-p` that lost a race for the port
  // passes the inside check and then leaves the service hanging on a datasource it can never reach, which
  // reads as "the service is broken". So the host socket is polled too.
  const inside = await until(async () => {
    const r = await run('docker', ['exec', DB_CONTAINER, 'pg_isready', '-U', DB_USER, '-d', DB_NAME]);
    return r.code === 0;
  }, { tries: 60, gapMs: 1000, label: 'postgres to accept connections inside its container' });
  assert.ok(inside, 'the throwaway database never became ready');
  const reachableFromHost = await until(() => canConnect(dbPort), { tries: 30, gapMs: 500, label: `the database to be reachable on 127.0.0.1:${dbPort}` });
  assert.ok(
    reachableFromHost,
    `the database answers inside its container but 127.0.0.1:${dbPort} does not accept a connection — the published port is not usable from this host`,
  );
  console.log(`[m7] throwaway ${DB_IMAGE} up and reachable on 127.0.0.1:${dbPort} (container ${DB_CONTAINER})`);

  const dbUrl = `jdbc:postgresql://127.0.0.1:${dbPort}/${DB_NAME}`;

  /**
   * Start the service and wait until it answers, returning the child AND the port it actually bound.
   *
   * The port is NOT chosen here. Asking the OS for a free port and then handing it to another process is a
   * race — measured while writing this proof, where a pre-allocated port was taken between the probe and
   * Tomcat's bind. So the service is told port 0 ("pick one") and the port it reports in its OWN port file
   * is the one this proof uses. That number comes from the process holding the socket, which is the only
   * answer that cannot be stale.
   *
   * CONFIGURATION CROSSES AS ARGUMENTS, NOT AS ENVIRONMENT. The first version exported `NEXUS_API_PORT` and
   * `NEXUS_DB_URL`, and the service ignored them: it bound a constant 61212 that this host's own tooling
   * holds. Measured with `--debug` — `--server.port=18099` on the command line took effect while the same
   * value in the environment did not, which is what a `SERVER_PORT` injected into child processes looks
   * like (it outranks a yml placeholder). Command-line arguments outrank environment properties in Spring
   * Boot, so they are what this proof uses: a proof must not be at the mercy of the ambient environment.
   */
  async function startService(fixedPort = 0) {
    // A STALE port file from a previous start would be read as this one's port, so it goes first.
    rmSync(PORT_FILE, { force: true });
    const child = spawn('java', [
      '-jar', JAR,
      `--server.port=${fixedPort}`,
      `--spring.datasource.url=${dbUrl}`,
      `--spring.datasource.username=${DB_USER}`,
      `--spring.datasource.password=${DB_PASSWORD}`,
      `--nexus.port-file=${PORT_FILE}`,
    ], {
      cwd: SERVICE_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    // A FIXED port is known before the process starts; port 0 has to be read out of the port file.
    let port = fixedPort === 0 ? null : fixedPort;
    const onChunk = (d) => { log += String(d); };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);

    const up = await until(async () => {
      if ((child.exitCode !== null || child.signalCode !== null)) return false; // it died; stop waiting
      if (port === null) {
        // The service WRITES the port it bound. Parsing "Tomcat started on port N" out of the log was the
        // first attempt and it failed, because the service's own logging config sets `root: warn` and that
        // line is INFO — a proof that depends on a log level breaks when someone tunes logging.
        if (!existsSync(PORT_FILE)) return false;
        const reported = Number(readFileSync(PORT_FILE, 'utf8').trim());
        if (!Number.isInteger(reported) || reported <= 0) return false;
        port = reported;
      }
      try {
        // Any HTTP answer means the port is serving. 404 is the EXPECTED answer for an unpublished id.
        const r = await fetch(`http://127.0.0.1:${port}/projects/__probe__`);
        return r.status === 404 || r.ok;
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
  console.log(`[m7] nexus-api answering on ${base}`);

  // ── §2 publishing creates version 1 ─────────────────────────────────────────────────────────────
  const projectId = `doc-${STAMP}`;
  const document = { pages: [{ id: 'p1', name: 'Cover' }, { id: 'p2', name: 'Story' }], version: 3, tokens: { color: '#0b0d11' } };
  const first = await fetch(`${base}/projects/${projectId}/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Harbour at dusk', document }),
  });
  const firstBody = await first.json();
  assert.equal(first.status, 201, `a first publish must be 201, got ${first.status}: ${JSON.stringify(firstBody)}`);
  assert.equal(firstBody.projectId, projectId);
  assert.equal(firstBody.title, 'Harbour at dusk');
  assert.equal(firstBody.version, 1);
  assert.equal(firstBody.url, `${base}/projects/${projectId}`, 'the URL must name THIS server, built from the request that asked');
  assert.ok(!('document' in firstBody), 'a receipt must NOT echo the document back');
  console.log(`[§2] published "${firstBody.title}" as version ${firstBody.version} → ${firstBody.url} (201, receipt carries no document)`);

  // ── §3 the publication reads back with its document as JSON ─────────────────────────────────────
  const readBack = await fetch(firstBody.url);
  assert.equal(readBack.status, 200, `reading a published project must be 200, got ${readBack.status}`);
  const publication = await readBack.json();
  assert.equal(publication.version, 1);
  // Deep equality against the object that was sent: this is what catches double-encoding, where the
  // document would come back as a STRING containing JSON rather than as JSON.
  assert.deepEqual(publication.document, document, 'the document must round-trip as JSON, not as an escaped string');
  assert.equal(typeof publication.document, 'object', 'the document must be an object, not a string');
  assert.equal(publication.publishedAt, firstBody.publishedAt, 'the read-back instant must be the one the receipt named');
  console.log(`[§3] read back at ${publication.url}: version ${publication.version}, ${publication.document.pages.length} page(s), document deep-equal to what was sent`);

  // ── §4 re-publishing UPDATES: same id, version 2, still ONE row ─────────────────────────────────
  const changed = { ...document, pages: [{ id: 'p1', name: 'Cover, revised' }] };
  const second = await fetch(`${base}/projects/${projectId}/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Harbour at dusk (revised)', document: changed }),
  });
  const secondBody = await second.json();
  assert.equal(second.status, 200, `a re-publish must be 200 (the id already had a publication), got ${second.status}`);
  assert.equal(secondBody.version, 2, 'a re-publish must increment the version');
  assert.equal(secondBody.projectId, projectId, 'and it must be the SAME project id');
  const afterRepublish = await (await fetch(firstBody.url)).json();
  assert.equal(afterRepublish.version, 2);
  assert.deepEqual(afterRepublish.document, changed, 'the row now holds the NEW document');
  assert.equal(afterRepublish.title, 'Harbour at dusk (revised)');

  // ONE row, counted in the database itself rather than trusted from the API.
  const countRows = await run('docker', ['exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-tAc',
    `select count(*) from published_project where project_id = '${projectId}'`]);
  assert.equal(countRows.code, 0, `could not count rows: ${countRows.stderr}`);
  assert.equal(countRows.stdout.trim(), '1', `re-publishing must UPDATE, not insert; the table holds ${countRows.stdout.trim()} row(s)`);
  console.log(`[§4] re-published: version 1 → ${secondBody.version}, same id, and the DATABASE holds exactly ${countRows.stdout.trim()} row for it`);

  // ── §5 refusals name their rule; an unpublished id is a 404 ─────────────────────────────────────
  // A JSON STRING is well-formed JSON, so the rule it breaks is the shape rule, and the refusal says which
  // shape arrived. (This is the case that corrected the first draft of this section, which expected the
  // malformed-JSON wording here: `"not json at all"` parses perfectly.)
  const badDocument = await fetch(`${base}/projects/${projectId}/publish`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 't', document: 'not an object' }),
  });
  const badBody = await badDocument.json();
  assert.equal(badDocument.status, 400, 'a JSON string must be a 400');
  assert.equal(badBody.error, 'invalid-publication');
  assert.match(badBody.message, /must be a JSON object, got string/, `the refusal must name the shape that arrived: ${JSON.stringify(badBody)}`);

  // A body that is not JSON AT ALL is refused by Jackson before any handler runs, so it does NOT carry this
  // service's error shape. That is the honest split: the service's "malformed JSON" rule is enforced for a
  // SERVICE caller (and is unit-tested there); over HTTP the parser gets there first.
  const unparseable = await fetch(`${base}/projects/${projectId}/publish`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: '{"title": "t", "document": {',
  });
  assert.equal(unparseable.status, 400, 'an unparseable body must be a 400');
  const unparseableBody = await unparseable.json();
  assert.notEqual(unparseableBody.error, 'invalid-publication', 'Jackson refused it, not this service — the shapes differ and the proof says so');
  assert.equal(unparseableBody.status, 400);

  const blankTitle = await fetch(`${base}/projects/${projectId}/publish`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '   ', document }),
  });
  assert.equal(blankTitle.status, 400, 'a blank title must be a 400');
  assert.match((await blankTitle.json()).message, /title must not be blank/);

  const notAnObject = await fetch(`${base}/projects/${projectId}/publish`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 't', document: 42 }),
  });
  assert.equal(notAnObject.status, 400, 'a JSON number is not a design document');
  assert.match((await notAnObject.json()).message, /must be a JSON object, got number/);

  const missing = await fetch(`${base}/projects/never-published-${STAMP}`);
  assert.equal(missing.status, 404, 'an unpublished id must be a 404, not an empty 200');
  console.log('[§5] refusals named their rule (a JSON string and a JSON number both named by their shape · a blank title) · an unparseable body was refused by Jackson with its own shape · an unpublished id answered 404');

  // ── §6 v195: what is published, newest first, capped, and WITHOUT documents ──────────────────────────
// A second project so "newest first" has something to order. It is published with a title the listing can
// be recognised by, and it is the one taken down in §7 — the §2 publication is left alone because §8 reads
// it back across a restart.
const secondId = `doc-second-${STAMP}`;
const secondPublish = await fetch(`${base}/projects/${secondId}/publish`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'A second publication', document: { pages: [] } }),
});
assert.equal(secondPublish.status, 201, `publishing a second project must be 201, got ${secondPublish.status}`);

const listed = await fetch(`${base}/projects`);
assert.equal(listed.status, 200, `the listing must be 200, got ${listed.status}`);
const listing = await listed.json();
assert.ok(Array.isArray(listing.publications), 'the listing carries an array of publications');
assert.equal(listing.limit, 20, 'the default limit is 20 and the answer says so');
assert.equal(listing.count, listing.publications.length, 'count is how many this answer carries');
assert.ok(listing.count >= 2, `both publications must be listed, got ${listing.count}`);

// NEWEST FIRST — the order the repository promises, checked against the instants rather than assumed.
const stamps = listing.publications.map((p) => Date.parse(p.publishedAt));
assert.deepEqual(stamps, [...stamps].sort((a, b) => b - a), 'publications come back newest first');
// The second publication was made after the first, so it must lead.
assert.equal(listing.publications[0].projectId, secondId, 'the newest publication is first');

// A listing entry carries the RECEIPT's facts and NO document: 100 entries must not mean 100 documents.
const entry = listing.publications[0];
for (const forbidden of ['document', 'documentJson']) {
  assert.equal(forbidden in entry, false, `a listing entry must not carry "${forbidden}"`);
}
assert.ok(entry.url.endsWith(`/projects/${secondId}`), `the entry names a URL that serves it: ${entry.url}`);
assert.equal(typeof entry.version, 'number');

// The cap is CLAMPED rather than refused, and the answer reports the cap it applied.
const capped = await (await fetch(`${base}/projects?limit=10000`)).json();
assert.equal(capped.limit, 100, 'a limit above the cap is clamped to it, and the answer says which cap was used');
const refusedLimit = await fetch(`${base}/projects?limit=0`);
assert.equal(refusedLimit.status, 400, 'a non-positive limit is refused — there is no honest reading of it');
assert.match((await refusedLimit.json()).message, /limit must be a positive number/);
console.log(`[§6] the listing answers newest first and capped: ${listing.count} publication(s) at limit ${listing.limit} (asking for 10000 reports the ${capped.limit} cap), entries carry no document, and a limit of 0 is a 400 naming the rule`);

// ── §7 v195: taking one down ────────────────────────────────────────────────────────────────────────
const removed = await fetch(`${base}/projects/${secondId}`, { method: 'DELETE' });
assert.equal(removed.status, 200, `unpublish must be 200, got ${removed.status}`);
const removal = await removed.json();
assert.equal(removal.projectId, secondId);
assert.equal(removal.removed, true, 'a publication that existed was removed');

const takenDown = await fetch(`${base}/projects/${secondId}`);
assert.equal(takenDown.status, 404, 'the taken-down publication is gone');
const rowsLeft = await run('docker', ['exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-tAc',
  `select count(*) from published_project where project_id = '${secondId}'`]);
assert.equal(rowsLeft.stdout.trim(), '0', `the row is gone from the DATABASE, got ${rowsLeft.stdout.trim()} row(s)`);

// Taking down what is already down is a caller's mistake, not a corrupt store: `removed: false`, not a throw.
const again = await fetch(`${base}/projects/${secondId}`, { method: 'DELETE' });
assert.equal(again.status, 200, 'unpublishing something already down is still 200');
assert.equal((await again.json()).removed, false, 'and it answers removed:false');

// The §2 publication is untouched — a removal must take down ONE thing.
assert.equal((await fetch(firstBody.url)).status, 200, 'the other publication is still there');
console.log('[§7] unpublish took the row out of the DATABASE (404 afterwards, 0 rows), a second DELETE answered removed:false rather than throwing, and the other publication was left alone');

// ── §8 the publication SURVIVES A RESTART ───────────────────────────────────────────────────────
  // The claim a fake repository cannot make. The process that wrote the row is killed, a NEW process is
  // started against the same database, and the row is read back through HTTP.
  const beforeRestartPid = serviceProcess.pid;
  await stopService(serviceProcess);
  assert.ok(serviceProcess.exitCode !== null || serviceProcess.signalCode !== null, 'the service must actually stop before the restart means anything');

  // The restart binds the SAME port on purpose. A published URL that changed on every restart would make
  // "the URL names the address that serves it" true only until the next deploy — and this section is the
  // one that checks the row survived, so it must not quietly also change the address.
  const restarted = await startService(apiPort);
  serviceProcess = restarted.child;
  assert.equal(restarted.port, apiPort, 'the restart must bind the same port, or the published URL would have moved');
  const survived = await fetch(firstBody.url);
  assert.equal(survived.status, 200, `the publication must survive a restart; got ${survived.status}`);
  const survivedBody = await survived.json();
  assert.equal(survivedBody.version, 2, 'and it must still be version 2');
  assert.deepEqual(survivedBody.document, changed, 'with the document the re-publish stored');
  assert.equal(survivedBody.publishedAt, secondBody.publishedAt, 'and the instant that re-publish recorded');
  console.log(`[§8] the publication SURVIVED A RESTART: process ${beforeRestartPid} was killed, a new process served version ${survivedBody.version} from the same database — this is a system of record, not a cache`);

  // ── §10 v263: the OWNER CHAIN — a claim attached, recorded, and enforced ─────────────────────────
  // The Studio's OWN claim shape, exactly as `accounts.ts` builds it: `kind`, the account id, the handle,
  // the assurance, and the instant as a NUMBER of milliseconds since the epoch.
  const ownerAccountId = 'acct-ada-000000000000000000';
  const otherAccountId = 'acct-grace-000000000000000000';
  const claimedAtMs = 1_700_000_000_000;
  const adaClaim = {
    kind: 'owner-claim',
    accountId: ownerAccountId,
    handle: 'ada',
    assurance: 'unsigned-local',
    claimedAt: claimedAtMs,
  };
  const ownedId = `doc-owned-${STAMP}`;

  // 1. A publish carrying a claim is OWNED, and the receipt names the owner.
  const owned = await fetch(`${base}/projects/${ownedId}/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Owned by Ada', document, owner: adaClaim }),
  });
  const ownedBody = await owned.json();
  assert.equal(owned.status, 201, `a publish carrying a claim must be 201, got ${owned.status}: ${JSON.stringify(ownedBody)}`);
  assert.ok(ownedBody.owner, 'the receipt must name the owner the claim carried');
  assert.equal(ownedBody.owner.accountId, ownerAccountId, 'and it must be the account the CLAIM named');
  assert.equal(ownedBody.owner.handle, 'ada', 'and the handle that came with it');
  assert.equal(ownedBody.owner.assurance, 'unsigned-local', 'and the assurance travels WITH the name, so a reader is told what it is worth');

  // 2. The claim's INSTANT — the half nobody had ever exercised, because the Studio had never sent a
  //    claim. The client states it as epoch MILLISECONDS; the service's own field is an Instant. What the
  //    service RECORDED is measured here, not assumed: a number read as seconds is off by three orders of
  //    magnitude, and a stored fact that is wrong is worse than a stored fact that is absent.
  const sentInstant = new Date(claimedAtMs).toISOString();
  const recordedRaw = ownedBody.owner.claimedAt;
  console.log(`[§10] MEASURED the claim's instant: the client sent ${claimedAtMs} (${sentInstant}) and the service answered ${JSON.stringify(recordedRaw)} (typeof ${typeof recordedRaw})`);
  const recordedInstant = (() => {
    try {
      return new Date(recordedRaw).toISOString();
    } catch {
      return `NOT A DATE (${typeof recordedRaw})`;
    }
  })();
  assert.equal(
    recordedInstant,
    sentInstant,
    `the service recorded the claim's instant as ${JSON.stringify(recordedRaw)} (${recordedInstant}), but the client sent ${claimedAtMs} (${sentInstant}) — the two sides of the wire do not agree on the unit`,
  );

  // 3. The LISTING carries the owner, so a panel can say whose row it is without a GET per row.
  const ownedListing = await (await fetch(`${base}/projects?limit=100`)).json();
  const ownedRow = ownedListing.publications.find((p) => p.projectId === ownedId);
  assert.ok(ownedRow, 'the owned publication is in the listing');
  assert.ok(ownedRow.owner, 'and the listing entry carries its owner');
  assert.equal(ownedRow.owner.accountId, ownerAccountId, 'the same account the claim named');

  // 4. A TAKE-DOWN by somebody else is refused, and the refusal names the rule.
  const byOther = await fetch(`${base}/projects/${ownedId}?claimer=${otherAccountId}`, { method: 'DELETE' });
  assert.equal(byOther.status, 403, `a take-down by a non-owner must be 403, got ${byOther.status}`);
  const byOtherBody = await byOther.json();
  assert.equal(byOtherBody.error, 'not-the-owner', 'and the refusal says which rule was broken');
  assert.match(byOtherBody.message, /may not take it down/, 'in the service\'s own words');
  assert.equal((await fetch(`${base}/projects/${ownedId}`)).status, 200, 'and the publication is STILL there — a refused take-down takes nothing down');

  // 5. A take-down by NOBODY is refused too, for an owned row: "named nobody" is the same as "named the
  //    wrong person" here, and a device with no account is exactly that case.
  const byNobody = await fetch(`${base}/projects/${ownedId}`, { method: 'DELETE' });
  assert.equal(byNobody.status, 403, `a take-down naming nobody must be 403 on an owned row, got ${byNobody.status}`);

  // 6. A take-down by the OWNER works.
  const byOwner = await fetch(`${base}/projects/${ownedId}?claimer=${ownerAccountId}`, { method: 'DELETE' });
  assert.equal(byOwner.status, 200, `the owner must be able to take their own publication down, got ${byOwner.status}`);
  assert.equal((await byOwner.json()).removed, true, 'and the row is removed');

  // 7. The TAKEOVER rule: a second account may not take a publication over, and the same account may.
  const takeoverId = `doc-takeover-${STAMP}`;
  const firstOwner = await fetch(`${base}/projects/${takeoverId}/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Ada\'s', document, owner: adaClaim }),
  });
  assert.equal(firstOwner.status, 201, 'the first publish of the takeover row is 201');
  const stolen = await fetch(`${base}/projects/${takeoverId}/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Grace\'s', document, owner: { ...adaClaim, accountId: otherAccountId, handle: 'grace' } }),
  });
  assert.equal(stolen.status, 403, `a re-publish under a different account must be 403, got ${stolen.status}`);
  assert.equal((await stolen.json()).error, 'owner-taken', 'and it says the owner was taken');
  const againByAda = await fetch(`${base}/projects/${takeoverId}/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Ada\'s, again', document, owner: adaClaim }),
  });
  assert.equal(againByAda.status, 200, `a re-publish by the SAME account is the ordinary path and must be 200, got ${againByAda.status}`);
  assert.equal((await againByAda.json()).version, 2, 'and it increments the version rather than creating a second row');

  // 8. A publish naming NOBODY stays ownerless, and an ownerless row stays open to anybody — the
  //    pre-v242 rule, which this section must not quietly break.
  const anonymousId = `doc-anon-${STAMP}`;
  const anonymous = await fetch(`${base}/projects/${anonymousId}/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Anonymous', document }),
  });
  assert.equal(anonymous.status, 201, 'a publish naming nobody is still a publish');
  assert.equal((await anonymous.json()).owner, null, 'and the receipt names NO owner');
  const anonRow = (await (await fetch(`${base}/projects?limit=100`)).json()).publications.find((p) => p.projectId === anonymousId);
  assert.equal(anonRow.owner, null, 'and the listing says the same');
  const anonRemoved = await fetch(`${base}/projects/${anonymousId}`, { method: 'DELETE' });
  assert.equal(anonRemoved.status, 200, 'an ownerless row is still open to anybody, exactly as before');
  assert.equal((await anonRemoved.json()).removed, true, 'and it is removed');

  console.log(`[§10] the OWNER CHAIN over the real service: a publish carrying a claim is OWNED (receipt and listing both name ${ownerAccountId}, assurance ${ownedBody.owner.assurance}, instant ${recordedRaw} — the client's own millisecond value); a take-down by another account is 403 not-the-owner, a take-down naming nobody is 403 too, and the OWNER's take-down is 200; a re-publish under a different account is 403 owner-taken while the same account's re-publish is 200/version 2; and a publish naming nobody stays ownerless and open to anybody, the pre-v242 rule intact`);

  // ── §9 teardown ─────────────────────────────────────────────────────────────────────────────────
  await stopService(serviceProcess);
  const rm = await run('docker', ['rm', '-f', DB_CONTAINER]);
  assert.equal(rm.code, 0, `could not remove the throwaway database: ${rm.stderr}`);
  dbStarted = false;
  const gone = await run('docker', ['ps', '-a', '--filter', `name=^/${DB_CONTAINER}$`, '--format', '{{.Names}}']);
  assert.equal(gone.stdout.trim(), '', `the throwaway container is still listed: ${gone.stdout.trim()}`);
  console.log(`[§9] teardown: the service process is gone and the throwaway container ${DB_CONTAINER} is removed`);

  console.log('\n[summary] M7 v193+v195: services/nexus-api BUILT and RAN against a real PostgreSQL · a publish created version 1 (201) and a re-publish updated it to version 2 (200) with the DATABASE counted at exactly one row · the document round-tripped as JSON rather than as an escaped string · refusals answered 400 naming their rule and an unpublished id answered 404 · the LISTING answered newest-first and capped with no documents in its entries · UNPUBLISH took the row out of the database and a second DELETE answered removed:false · and the publication SURVIVED A SERVICE RESTART');
  console.log('[m7-publish-proof] ALL ASSERTIONS PASSED (a real backend service, a real database, and a row that outlives the process that wrote it)');
} finally {
  // Teardown runs even on a failed assertion: a proof that leaves a database container behind is a proof
  // that fails the next run for a reason unrelated to the code.
  if (serviceProcess && serviceProcess.exitCode === null) {
    await stopService(serviceProcess);
  }
  if (dbStarted) await run('docker', ['rm', '-f', DB_CONTAINER]);
}
