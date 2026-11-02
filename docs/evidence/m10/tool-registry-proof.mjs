// NEXUS M10 v571 — THE TOOL REGISTRY STOPS BEING A CLAIM AND BECOMES A ROW IN A DATABASE (ADR 0022).
//
// M10 names four things: API, MCP, tool registry, webhooks. The webhook half (ADR 0021) is a row this service
// ACTS on; this half is the opposite. A tool registration is a DECLARATION: it names a tool, says what the
// tool accepts, and records who said so. Nothing in `dev.nexus.api.tools` executes the tool, calls a URL on
// its behalf, or remembers that it ran — the row has no endpoint, no command and no invocation counter to
// put those facts in. The unit gates grade the rules; this file grades the half a Mockito test cannot:
//
//   a declaration committed to a real PostgreSQL is READ BACK by a second process, under the same name and
//   the same canonical schema, and the database itself has nowhere to store a capability.
//
// Sections:
//
//   §1 the service BUILDS and STARTS against a real PostgreSQL and answers on the port it announced;
//   §2 declarations: 201 + the row, owner/name/summary TRIMMED, the schema stored in CANONICAL compact form,
//      a duplicate name refused with the id that holds it (GLOBALLY, not per owner), uppercase / short /
//      spaced names and blank or over-long summaries refused BY NAME, a non-object schema refused, a
//      malformed JSON body refused before the service sees it, and the byte bound measured at 8192 (accepted)
//      and 8193 (refused); the same declaration is READ BY NAME in one request (an uppercase name refused by
//      rule at 400, a well-formed name holding nothing at 404) — while `audit_entry` stays EMPTY, because a
//      declaration is not a trail fact;
//   §3 the catalog: name ASCENDING, the optional owner filter narrowing BOTH the window and the count, the
//      optional search narrowing both by a case-insensitive substring of NAME or SUMMARY with LIKE wildcards
//      treated literally (a % or _ in the term matches only itself), the limit capped / offset floored, and
//      every answer carrying no url / command / invocation field;
//   §4 removal: a stranger is 403 and the row remains, an unknown id is 200 `removed:false`, the owner's
//      removal is 200 `removed:true`, the row is gone in `psql`, and the freed NAME can be declared AGAIN
//      under a different owner — an id is not a name;
//   §5 details and the owner's update: a tool is readable BY ID (an id that names nothing is a 404), and the
//      owner may REPLACE its summary and schema while the name, id, owner and creation instant do not move;
//      a stranger's update is 403, a missing owner is 400, an unknown id is 404 and an over-bound schema is
//      400, and every refusal leaves the row as it was — while `audit_entry` stays empty, because an update
//      is a declaration edit rather than a trail fact; every accepted write is also RECORDED as a revision
//      (revision 1 at registration, one more per update) and `GET /tools/{id}/revisions` answers what the
//      declaration SAID at each one, newest first, with the whole count beside the window — so an update
//      cannot erase the contract a consumer built against; removal takes the history with the declaration.
//      DEPRECATION is its own resource, not a seventh field: POST/GET/DELETE `/tools/{id}/deprecation`
//      (owner only for the writes; a live tool is a distinct 404 `not-deprecated`), and the public
//      `/tools/deprecations` list names every deprecated tool beside its message and replacement hint;
//   §6 the rows, their canonical schemas and their recorded revisions SURVIVE A RESTART (a second JVM, the
//      same database), and `information_schema` shows the declaration table has exactly six columns while
//      the revision table has exactly five — neither has a place for a capability;
//   §7 teardown.
//
// Everything it creates is throwaway: a `pgvector/pgvector:pg16` container on a port nothing else is using,
// removed by name at the end; the jar is built in an ISOLATED COPY under the OS temp dir (a running service
// in the working tree holds its jar open, and `mvn package` renames it — measured in v302).
//
// Requires: Java 25, Maven, and a running Docker daemon. Run:  node docs/evidence/m10/tool-registry-proof.mjs
//
// sweep-budget-ms: 900000
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createConnection, createServer } from 'node:net';
import { existsSync, cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// THREE levels up: docs/evidence/m10/tool-registry-proof.mjs → the repository root. Two would land on docs/.
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SERVICE_DIR = path.join(REPO_ROOT, 'services/nexus-api');
const DB_IMAGE = 'pgvector/pgvector:pg16';
const STAMP = `${Date.now()}-${process.pid}`;
const BUILD_DIR = path.join(tmpdir(), `nexus-tools-proof-build-${STAMP}`);
const JAR = path.join(BUILD_DIR, 'target/nexus-api-0.1.0-SNAPSHOT.jar');

const DB_CONTAINER = `nexus-api-tools-db-${STAMP}`;
const DB_NAME = 'nexus';
const DB_USER = 'nexus';
const DB_PASSWORD = 'nexus';
const PORT_FILE = path.join(tmpdir(), `nexus-api-tools-port-${STAMP}.txt`);

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

/** The tool's wire shape, pinned: a field added here is a capability a read door would start printing. */
const TOOL_FIELDS = ['contractSha256', 'createdAt', 'id', 'inputSchema', 'name', 'owner', 'summary'].sort();
const LIST_FIELDS = ['deprecated', 'limit', 'offset', 'owner', 'query', 'tested', 'tools', 'total'].sort();
const JOURNAL_FIELDS = ['changes', 'kind', 'limit', 'offset', 'since', 'toolId', 'total'].sort();
const CHANGE_FIELDS = ['at', 'kind', 'name', 'revision', 'seq', 'toolId'].sort();
const BATCH_FIELDS = ['found', 'missing', 'requested', 'tools'].sort();

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

  async function startService() {
    rmSync(PORT_FILE, { force: true });
    const child = spawn('java', [
      '-jar', JAR,
      '--server.port=0',
      `--spring.datasource.url=${dbUrl}`,
      `--spring.datasource.username=${DB_USER}`,
      `--spring.datasource.password=${DB_PASSWORD}`,
      `--nexus.port-file=${PORT_FILE}`,
    ], { cwd: BUILD_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    let port = null;
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
        // 200 means the registry is serving; an EMPTY registry is still a catalog.
        const r = await fetch(`http://127.0.0.1:${port}/tools`);
        return r.status === 200;
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
  let apiPort = started.port;
  let base = `http://127.0.0.1:${apiPort}`;
  console.log(`[m10] nexus-api answering on ${base}`);

  /** One HTTP call, parsed. A timeout is a NAMED failure rather than a stack trace with no cause. */
  async function call(pathname, init = {}) {
    const response = await fetch(`${base}${pathname}`, { ...init, signal: AbortSignal.timeout(120_000) });
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: response.status, body, text, headers: response.headers };
  }

  const asJson = { 'content-type': 'application/json' };
  const postJson = (pathname, value) => call(pathname, { method: 'POST', headers: asJson, body: JSON.stringify(value) });
  const q = (value) => encodeURIComponent(value);

  async function sql(query) {
    const r = await run('docker', ['exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-tAc', query]);
    assert.equal(r.code, 0, `psql failed: ${r.stderr}`);
    return r.stdout.trim();
  }

  // ── §2 declarations: the rules, named refusals, and the canonical schema ────────────────────────
  const owner = `acct-tool-owner-${STAMP}`;
  const other = `acct-tool-other-${STAMP}`;
  const stranger = `acct-tool-stranger-${STAMP}`;
  const heir = `acct-tool-heir-${STAMP}`;

  const emptyCatalog = await call('/tools');
  assert.equal(emptyCatalog.status, 200, `an empty registry is still a catalog, got ${emptyCatalog.status}`);
  assert.equal(emptyCatalog.body.total, 0);
  assert.equal(emptyCatalog.body.tools.length, 0);
  assert.equal(emptyCatalog.body.owner, null, 'no filter is echoed as null, not as an empty account');
  assert.equal(emptyCatalog.body.query, null, 'no search is echoed as null, not as an empty term');
  assert.deepEqual(Object.keys(emptyCatalog.body).sort(), LIST_FIELDS, `the catalog carries exactly its eight fields: ${emptyCatalog.text}`);

  const schemaA = { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] };
  const declared = await postJson('/tools', {
    owner: `  ${owner}  `,
    name: '  weather.lookup  ',
    summary: '  Looks up the weather for one city.  ',
    inputSchema: schemaA,
  });
  assert.equal(declared.status, 201, `a declaration must be 201, got ${declared.status}: ${declared.text}`);
  assert.equal(declared.body.owner, owner, 'the owner is stored trimmed');
  assert.equal(declared.body.name, 'weather.lookup', 'the name is stored trimmed');
  assert.equal(declared.body.summary, 'Looks up the weather for one city.', 'the summary is stored trimmed');
  assert.ok(Math.abs(Date.now() - declared.body.createdAt) < 60 * 60 * 1000, 'the created instant is a real instant, not zero or a duration');
  assert.deepEqual(Object.keys(declared.body).sort(), TOOL_FIELDS, `a tool carries exactly its seven fields: ${declared.text}`);
  assert.deepEqual(declared.body.inputSchema, schemaA, 'the schema is echoed as the object it was');
  const toolIdA = declared.body.id;

  // The schema STORED is the canonical compact form, not the caller's whitespace: psql reads the row.
  const storedSchema = await sql(`select input_schema from tool_entry where name = 'weather.lookup'`);
  assert.equal(storedSchema, JSON.stringify(schemaA), `the stored schema must be canonical compact JSON, got ${storedSchema}`);

  // The NAME is the key every agent shares, so it gets a direct read: one request, the same six fields,
  // no paging. A malformed name is a 400 that names the rule; a well-formed name holding nothing is a 404.
  const byName = await call('/tools/by-name/weather.lookup');
  assert.equal(byName.status, 200, `a tool by name must answer 200, got ${byName.status}: ${byName.text}`);
  assert.equal(byName.body.id, toolIdA, 'the name resolves to the row that holds it');
  assert.deepEqual(Object.keys(byName.body).sort(), TOOL_FIELDS, `a tool by name carries exactly its seven fields: ${byName.text}`);
  const byBadName = await call('/tools/by-name/Weather.Lookup');
  assert.equal(byBadName.status, 400, `an uppercase name must be refused by rule, got ${byBadName.status}: ${byBadName.text}`);
  assert.equal(byBadName.body.error, 'invalid-tool');
  assert.match(byBadName.body.message, /tool name/);
  const byMissingName = await call('/tools/by-name/no.such.tool');
  assert.equal(byMissingName.status, 404, `a name that holds no row must be 404, got ${byMissingName.status}: ${byMissingName.text}`);
  assert.equal(byMissingName.body.error, 'unknown-tool');

  const declaredZ = await postJson('/tools', { owner, name: 'z.tool', summary: 'The last tool by name.', inputSchema: { type: 'object' } });
  assert.equal(declaredZ.status, 201, `a second declaration must be 201, got ${declaredZ.status}: ${declaredZ.text}`);
  const declaredM = await postJson('/tools', { owner: other, name: 'm.tool', summary: 'Another account declares this one.', inputSchema: { type: 'object' } });
  assert.equal(declaredM.status, 201, `another owner may declare a DIFFERENT name, got ${declaredM.status}: ${declaredM.text}`);
  assert.notEqual(declaredM.body.id, declaredZ.body.id, 'two declarations are two rows');

  // The name is GLOBAL: another owner cannot take a name this registry already holds, and the refusal
  // names the row that holds it rather than a bare "conflict".
  const duplicate = await postJson('/tools', { owner: other, name: 'weather.lookup', summary: 'Mine, actually.', inputSchema: {} });
  assert.equal(duplicate.status, 409, `a duplicate name must be 409, got ${duplicate.status}: ${duplicate.text}`);
  assert.equal(duplicate.body.error, 'tool-name-taken');
  assert.match(duplicate.body.message, new RegExp(toolIdA), 'the refusal names the tool that holds the name');

  // Names are a lowercase slug. Each refusal NAMES the rule.
  for (const [badName, why] of [
    ['Weather.Lookup', 'uppercase'],
    ['a', 'one character'],
    ['bad name', 'a space'],
    ['-leading', 'a leading dash'],
    ['x'.repeat(65), 'sixty-five characters'],
  ]) {
    const refused = await postJson('/tools', { owner, name: badName, summary: 'anything', inputSchema: {} });
    assert.equal(refused.status, 400, `the name ${JSON.stringify(badName)} (${why}) must be 400, got ${refused.status}: ${refused.text}`);
    assert.equal(refused.body.error, 'invalid-tool');
    assert.match(refused.body.message, /tool name/, `the refusal must name the rule for ${why}: ${JSON.stringify(refused.body)}`);
  }

  // The summary is required and bounded.
  const noSummary = await postJson('/tools', { owner, name: 'empty.summary', summary: '   ', inputSchema: {} });
  assert.equal(noSummary.status, 400, 'a blank summary must be 400');
  assert.match(noSummary.body.message, /summary/);
  const longSummary = await postJson('/tools', { owner, name: 'long.summary', summary: 's'.repeat(281), inputSchema: {} });
  assert.equal(longSummary.status, 400, 'a 281-character summary must be 400');
  assert.match(longSummary.body.message, /281/);

  // The schema is a JSON OBJECT, not a string that contains JSON, not an array.
  for (const [badSchema, label] of [
    ['{"type":"object"}', 'a string that contains JSON'],
    [[{ type: 'object' }], 'an array'],
  ]) {
    const refused = await postJson('/tools', { owner, name: `bad.schema.${STAMP}`, summary: 'anything', inputSchema: badSchema });
    assert.equal(refused.status, 400, `the schema ${label} must be 400, got ${refused.status}: ${refused.text}`);
    assert.match(refused.body.message, /JSON OBJECT/, `the refusal must say the schema is not an object: ${JSON.stringify(refused.body)}`);
  }
  const missingSchema = await postJson('/tools', { owner, name: `missing.schema.${STAMP}`, summary: 'anything' });
  assert.equal(missingSchema.status, 400, `a missing schema must be 400, got ${missingSchema.status}: ${missingSchema.text}`);
  assert.match(missingSchema.body.message, /inputSchema/);

  // MALFORMED JSON never reaches the service: the framework refuses the body first. The status is the rule.
  const malformed = await call('/tools', { method: 'POST', headers: asJson, body: '{"owner":"x",' });
  assert.equal(malformed.status, 400, `a body that is not JSON must be 400, got ${malformed.status}: ${malformed.text}`);

  // The BYTE bound is measured on the canonical form: n + 10 bytes for {"pad":"<n x's>"}.
  const atBound = await postJson('/tools', { owner: other, name: 'big.tool', summary: 'A schema exactly at the bound.', inputSchema: { pad: 'x'.repeat(8182) } });
  assert.equal(atBound.status, 201, `an 8192-byte canonical schema is legal, got ${atBound.status}: ${atBound.text}`);
  const storedBytes = await sql(`select length(input_schema) from tool_entry where name = 'big.tool'`);
  assert.equal(storedBytes, '8192', `the row stores exactly the bound, got ${storedBytes}`);
  const overBound = await postJson('/tools', { owner: other, name: 'too.big.tool', summary: 'One byte over.', inputSchema: { pad: 'x'.repeat(8183) } });
  assert.equal(overBound.status, 400, `an 8193-byte canonical schema must be 400, got ${overBound.status}: ${overBound.text}`);
  assert.match(overBound.body.message, /8193/, 'the refusal names the byte count it measured');

  // A declaration is not a TRAIL FACT and makes no outbound call: the audit table is still empty.
  const auditRows = await sql('select count(*) from audit_entry');
  assert.equal(auditRows, '0', 'registering tools must write no audit entry — a declaration is not an event');
  const deliveryRows = await sql('select count(*) from webhook_delivery');
  assert.equal(deliveryRows, '0', 'registering tools must knock on nothing');
  console.log(`[§2] three tools declared (the fields trimmed, the schema stored as ${storedSchema.length} canonical bytes and read back from psql) · a GLOBAL duplicate refused by the id that holds it · uppercase / short / spaced / 65-character names, blank and 281-character summaries, a string schema and a missing schema all refused BY NAME · a malformed JSON body refused before the service saw it · the byte bound accepted at 8192 and refused at 8193 · the same declaration was READ BY NAME in one request (an uppercase name refused by rule at 400 and a well-formed name holding nothing refused at 404 unknown-tool) · audit_entry and webhook_delivery still EMPTY — a declaration is not a fact and calls nobody`);

  // ── §3 the catalog: name ascending, the filter narrows BOTH the window and the count ───────────
  const whole = await call('/tools');
  assert.equal(whole.status, 200, `the catalog must answer 200, got ${whole.status}`);
  assert.equal(whole.body.total, 4, `the whole catalog holds four rows (including big.tool), got ${whole.body.total}: ${whole.text}`);
  assert.deepEqual(whole.body.tools.map((t) => t.name), ['big.tool', 'm.tool', 'weather.lookup', 'z.tool'], 'the catalog is ordered by NAME, not by insertion instant');
  assert.equal(whole.body.limit, 20, 'the default window is 20 and the answer says so');
  assert.equal(whole.body.offset, 0);
  for (const tool of whole.body.tools) {
    assert.deepEqual(Object.keys(tool).sort(), TOOL_FIELDS, `a catalog row carries exactly its seven fields: ${JSON.stringify(tool)}`);
  }
  assert.ok(!whole.text.includes('endpointUrl') && !whole.text.includes('invocationCount'), 'the catalog prints no capability field');

  const narrowed = await call(`/tools?owner=${q(other)}`);
  assert.equal(narrowed.status, 200);
  assert.equal(narrowed.body.owner, other, 'the answer echoes the filter it applied');
  assert.equal(narrowed.body.total, 2, 'the count is narrowed the same way the window is');
  assert.deepEqual(narrowed.body.tools.map((t) => t.name), ['big.tool', 'm.tool'], 'one account cannot see the other account\'s declarations through the filter');

  const windowed = await call('/tools?limit=1&offset=1');
  assert.equal(windowed.body.total, 4, 'the count is the WHOLE catalog even when the window is one row');
  assert.equal(windowed.body.limit, 1);
  assert.equal(windowed.body.offset, 1);
  assert.deepEqual(windowed.body.tools.map((t) => t.name), ['m.tool'], 'the second row by name is m.tool');

  const clamped = await call('/tools?limit=500&offset=-10');
  assert.equal(clamped.body.limit, 100, 'the answer reports the cap it applied');
  assert.equal(clamped.body.offset, 0, 'a negative offset is floored');
  assert.equal(clamped.body.tools.length, 4);
  // The SEARCH narrows by NAME or SUMMARY, case-insensitively, and its wildcards are LITERAL. Each answer
  // echoes the trimmed term it applied, and the whole count is narrowed by the same term as the window.
  const lowSearch = await call('/tools?q=weather');
  assert.equal(lowSearch.status, 200, `a search must answer 200, got ${lowSearch.status}: ${lowSearch.text}`);
  assert.equal(lowSearch.body.query, 'weather', 'the answer echoes the trimmed search it applied');
  assert.equal(lowSearch.body.total, 1);
  assert.deepEqual(lowSearch.body.tools.map((t) => t.name), ['weather.lookup']);
  const upperSearch = await call('/tools?q=WEATHER');
  assert.equal(upperSearch.body.total, 1, 'the search is case-insensitive');
  const summarySearch = await call('/tools?q=last');
  assert.deepEqual(summarySearch.body.tools.map((t) => t.name), ['z.tool'], 'a SUMMARY match is a match');
  const broadSearch = await call('/tools?q=tool');
  assert.deepEqual(broadSearch.body.tools.map((t) => t.name), ['big.tool', 'm.tool', 'z.tool']);
  assert.equal(broadSearch.body.total, 3);
  const narrowedSearch = await call(`/tools?q=tool&owner=${q(other)}`);
  assert.deepEqual(narrowedSearch.body.tools.map((t) => t.name), ['big.tool', 'm.tool'], 'owner and search narrow together');
  assert.equal(narrowedSearch.body.total, 2, 'the count is narrowed by BOTH filters');
  const pagedSearch = await call('/tools?q=tool&limit=1&offset=2');
  assert.deepEqual(pagedSearch.body.tools.map((t) => t.name), ['z.tool']);
  assert.equal(pagedSearch.body.total, 3, 'a search window still reports the whole number of matches');
  assert.equal(pagedSearch.body.limit, 1);
  assert.equal(pagedSearch.body.offset, 2);
  // A percent sign is a percent sign: if the wildcard were passed through, this would answer all four rows.
  const percentSearch = await call('/tools?q=%25');
  assert.equal(percentSearch.body.total, 0, `a literal % must match nothing, got ${percentSearch.text}`);
  const underscoreSearch = await call('/tools?q=_');
  assert.equal(underscoreSearch.body.total, 0, `a literal _ must match nothing, got ${underscoreSearch.text}`);
  const blankSearch = await call('/tools?q=%20%20');
  assert.equal(blankSearch.body.query, null, 'a blank search is the absent filter');
  assert.equal(blankSearch.body.total, 4);
  const longSearch = await call(`/tools?q=${'x'.repeat(101)}`);
  assert.equal(longSearch.status, 400, `a 101-character search must be 400, got ${longSearch.status}`);
  assert.equal(longSearch.body.error, 'invalid-tool');
  assert.match(longSearch.body.message, /101/);
  console.log(`[§3] the whole catalog answered four rows by NAME (big.tool < m.tool < weather.lookup < z.tool) · owner=${other} narrowed both the window and the count to its own two · limit=1&offset=1 answered exactly m.tool with total=4 beside it · limit=500&offset=-10 reported 100 and 0 · search q=weather answered one row and echoed "weather" (q=WEATHER the same, q=last matched a SUMMARY), q=tool answered three and q=tool&owner narrowed BOTH to two, q=tool&limit=1&offset=2 answered z.tool with total=3, literal % and _ matched nothing, a blank q was the absent filter (echoed null, total 4), a 101-character q was refused at 400, and no row carried a url, command or invocation field`);

  // ── §4 removal: ownership, "already gone", and a NAME freed by deleting its row ─────────────────
  const strangerRemoval = await call(`/tools/${q(toolIdA)}?owner=${q(stranger)}`, { method: 'DELETE' });
  assert.equal(strangerRemoval.status, 403, `a stranger's removal must be 403, got ${strangerRemoval.status}: ${strangerRemoval.text}`);
  assert.equal(strangerRemoval.body.error, 'not-your-tool');
  const stillThere = await sql(`select count(*) from tool_entry where tool_id = '${toolIdA}'`);
  assert.equal(stillThere, '1', 'a refused removal deletes nothing');

  const unknownRemoval = await call(`/tools/tool-that-never-existed?owner=${q(owner)}`, { method: 'DELETE' });
  assert.equal(unknownRemoval.status, 200, `an id that names nothing is already gone, got ${unknownRemoval.status}`);
  assert.equal(unknownRemoval.body.removed, false);

  const noOwnerRemoval = await call(`/tools/${q(toolIdA)}`, { method: 'DELETE' });
  assert.equal(noOwnerRemoval.status, 400, `a removal without an owner must be 400, got ${noOwnerRemoval.status}`);
  assert.match(noOwnerRemoval.body.message, /owner/);

  // A deprecation is a fact about the declaration, so removal must take it too: deprecate first, then delete,
  // and psql reads no deprecation row for an id that no longer names anything.
  const deprecateBeforeRemoval = await postJson(`/tools/${q(toolIdA)}/deprecation?owner=${q(owner)}`,
      { message: 'Removed in this proof.', replacement: 'z.tool' });
  assert.equal(deprecateBeforeRemoval.status, 200, `the owner may deprecate, got ${deprecateBeforeRemoval.status}: ${deprecateBeforeRemoval.text}`);
  const deprecationsBeforeRemoval = await sql(`select count(*) from tool_deprecation where tool_id = '${toolIdA}'`);
  assert.equal(deprecationsBeforeRemoval, '1', 'the deprecation was stored before the removal');

  const ownedRemoval = await call(`/tools/${q(toolIdA)}?owner=${q(owner)}`, { method: 'DELETE' });
  assert.equal(ownedRemoval.status, 200, `the owner's removal must be 200, got ${ownedRemoval.status}`);
  assert.equal(ownedRemoval.body.removed, true);
  const deprecationGone = await sql(`select count(*) from tool_deprecation where tool_id = '${toolIdA}'`);
  assert.equal(deprecationGone, '0', 'removal takes the deprecation with the declaration it described');
  const gone = await sql(`select count(*) from tool_entry where tool_id = '${toolIdA}'`);
  assert.equal(gone, '0', 'psql reads the row gone — removal is a delete, not a hidden window');
  const historyGone = await sql(`select count(*) from tool_revision where tool_id = '${toolIdA}'`);
  assert.equal(historyGone, '0', 'removal takes the recorded history with the declaration it explained');

  // The NAME is free again: it was never the id. A different owner may now declare it.
  const reclaimed = await postJson('/tools', { owner: other, name: 'weather.lookup', summary: 'The same name, a new row.', inputSchema: { type: 'object' } });
  assert.equal(reclaimed.status, 201, `a freed name can be declared again, got ${reclaimed.status}: ${reclaimed.text}`);
  assert.notEqual(reclaimed.body.id, toolIdA, 'the new declaration is a new row, not the removed one');
  const byNameAfterReclaim = await call('/tools/by-name/weather.lookup');
  assert.equal(byNameAfterReclaim.status, 200);
  assert.equal(byNameAfterReclaim.body.id, reclaimed.body.id, 'the name now resolves to the NEW row, not the removed one');
  console.log(`[§4] a stranger's removal was 403 and the row stayed · an unknown id was 200 removed:false · a missing owner was 400 · the owner's removal was 200 removed:true and psql reads zero · the NAME weather.lookup was then declared again by another account as a NEW row — a name is not an id · the owner's deprecation was stored before the removal and psql read it gone with the declaration`);

  // ── §5 details and the owner's update: read by id, and a declaration that can change what it SAYS ───
  const readById = await call(`/tools/${q(reclaimed.body.id)}`);
  assert.equal(readById.status, 200, `a tool by id must answer 200, got ${readById.status}: ${readById.text}`);
  assert.equal(readById.body.name, 'weather.lookup');
  assert.equal(readById.body.owner, other);
  assert.deepEqual(Object.keys(readById.body).sort(), TOOL_FIELDS, `a tool carries exactly its seven fields: ${readById.text}`);

  // ── the PIN: what a consumer holds so it can be told when the contract changes ───────────────────
  // 64 lowercase hex characters over the canonical {"summary":…,"inputSchema":…} object — and here it is
  // RECOMPUTED from the fields the answer itself carries, so the claim is a measurement and not the
  // service echoing a column. (A caller does not have to: it pins the value it was served.)
  const birthPin = readById.body.contractSha256;
  assert.match(birthPin, /^[0-9a-f]{64}$/, `a declaration must carry a 64-hex pin, got ${String(birthPin)}`);
  const recompute = (tool) => createHash('sha256')
      .update(JSON.stringify({ summary: tool.summary, inputSchema: tool.inputSchema }), 'utf8')
      .digest('hex');
  assert.equal(recompute(readById.body), birthPin,
      'the pin must be the SHA-256 of the {summary, inputSchema} object a caller can rebuild from the answer');
  assert.equal(readById.headers.get('etag'), `"${birthPin}"`, 'the read must carry the pin as its strong ETag');

  // A caller that already holds this contract asks to be told only when it changes: 304, no body, and the tag
  // it holds echoed back. That is the point of a pin — a polling agent stops re-downloading a schema it has.
  const notModified = await call(`/tools/${q(reclaimed.body.id)}`, { headers: { 'if-none-match': `"${birthPin}"` } });
  assert.equal(notModified.status, 304, `holding the current pin must be 304, got ${notModified.status}: ${notModified.text}`);
  assert.equal(notModified.text, '', 'a 304 carries no body');
  assert.equal(notModified.headers.get('etag'), `"${birthPin}"`, 'a 304 must still name the tag it matched');
  const byNameNotModified = await call('/tools/by-name/weather.lookup', { headers: { 'if-none-match': `"${birthPin}"` } });
  assert.equal(byNameNotModified.status, 304, `the read by NAME must honour the same pin, got ${byNameNotModified.status}`);
  const anyTag = await call(`/tools/${q(reclaimed.body.id)}`, { headers: { 'if-none-match': '*' } });
  assert.equal(anyTag.status, 304, `* names any existing declaration, got ${anyTag.status}`);

  const unknownRead = await call('/tools/tool-that-never-existed');
  assert.equal(unknownRead.status, 404, `an id that names nothing must be 404, got ${unknownRead.status}: ${unknownRead.text}`);
  assert.equal(unknownRead.body.error, 'unknown-tool');
  // Existence is settled BEFORE the tag: a 304 would tell the caller its copy is current when there is no copy.
  const unknownReadWithTag = await call('/tools/tool-that-never-existed', { headers: { 'if-none-match': '*' } });
  assert.equal(unknownReadWithTag.status, 404, `an unknown id must be 404 even with a tag, got ${unknownReadWithTag.status}`);

  const updatedSchema = { type: 'object', properties: { unit: { type: 'string', enum: ['c', 'f'] } } };
  const putBody = (value) => ({ method: 'PUT', headers: asJson, body: JSON.stringify(value) });

  // A stranger's update is refused BY NAME and the row keeps its sentence: ownership is checked before a
  // single field is validated, so a stranger learns nothing about which summary the owner would accept.
  const strangerUpdate = await call(`/tools/${q(reclaimed.body.id)}?owner=${q(stranger)}`,
      putBody({ summary: 'Stolen summary.', inputSchema: {} }));
  assert.equal(strangerUpdate.status, 403, `a stranger's update must be 403, got ${strangerUpdate.status}: ${strangerUpdate.text}`);
  assert.equal(strangerUpdate.body.error, 'not-your-tool');

  const noOwnerUpdate = await call(`/tools/${q(reclaimed.body.id)}`, putBody({ summary: 'x', inputSchema: {} }));
  assert.equal(noOwnerUpdate.status, 400, `an update without an owner must be 400, got ${noOwnerUpdate.status}`);
  assert.match(noOwnerUpdate.body.message, /owner/);

  const unknownUpdate = await call(`/tools/tool-that-never-existed?owner=${q(other)}`, putBody({ summary: 'x', inputSchema: {} }));
  assert.equal(unknownUpdate.status, 404, `an update of an id that names nothing must be 404, got ${unknownUpdate.status}`);
  assert.equal(unknownUpdate.body.error, 'unknown-tool');

  const overBoundUpdate = await call(`/tools/${q(reclaimed.body.id)}?owner=${q(other)}`,
      putBody({ summary: 'One byte over.', inputSchema: { pad: 'x'.repeat(8183) } }));
  assert.equal(overBoundUpdate.status, 400, `an update with an 8193-byte schema must be 400, got ${overBoundUpdate.status}`);
  assert.match(overBoundUpdate.body.message, /8193/);

  // None of the four refusals wrote anything: psql still reads the sentence the declaration was born with.
  const unchangedSummary = await sql(`select summary from tool_entry where tool_id = '${reclaimed.body.id}'`);
  assert.equal(unchangedSummary, 'The same name, a new row.', 'a refused update writes nothing');

  const ownedUpdate = await call(`/tools/${q(reclaimed.body.id)}?owner=${q(other)}`,
      putBody({ summary: '  The same name, a better sentence.  ', inputSchema: updatedSchema }));
  assert.equal(ownedUpdate.status, 200, `the owner's update must be 200, got ${ownedUpdate.status}: ${ownedUpdate.text}`);
  assert.equal(ownedUpdate.body.summary, 'The same name, a better sentence.', 'the summary is replaced and trimmed');
  assert.deepEqual(ownedUpdate.body.inputSchema, updatedSchema, 'the schema is replaced as the object it was');
  assert.equal(ownedUpdate.body.name, 'weather.lookup', 'an update cannot change the global lookup key');
  assert.equal(ownedUpdate.body.id, reclaimed.body.id, 'an update cannot change which row it is');
  assert.equal(ownedUpdate.body.owner, other, 'an update cannot hand a declaration to another account');
  assert.equal(ownedUpdate.body.createdAt, reclaimed.body.createdAt, 'the creation instant is not rewritten');

  // The DATABASE holds the canonical replacement, and the row count is unchanged: an update edits, never appends.
  const storedUpdated = await sql(`select input_schema from tool_entry where name = 'weather.lookup'`);
  assert.equal(storedUpdated, JSON.stringify(updatedSchema), `the update must store canonical compact JSON, got ${storedUpdated}`);
  const rowsAfterUpdate = await sql('select count(*) from tool_entry');
  assert.equal(rowsAfterUpdate, '4', 'an update replaces a row rather than appending one');
  const auditAfterUpdate = await sql('select count(*) from audit_entry');
  assert.equal(auditAfterUpdate, '0', 'an update is a declaration edit, not a trail fact');

  // ── the declaration's recorded HISTORY: every accepted write, newest first, never rewritten ─────
  // The row was registered in §4 (revision 1) and updated once here (revision 2). A consumer that built
  // against the birth schema can now read what it built against; the update did not erase it.
  const history = await call(`/tools/${q(reclaimed.body.id)}/revisions`);
  assert.equal(history.status, 200, `a tool's history must answer 200, got ${history.status}: ${history.text}`);
  assert.deepEqual(Object.keys(history.body).sort(), ['limit', 'offset', 'revisions', 'since', 'toolId', 'total'],
      `a history window carries exactly its six fields: ${history.text}`);
  assert.equal(history.body.since, null, 'the whole history echoes no since, not a zero');
  assert.equal(history.body.toolId, reclaimed.body.id);
  assert.equal(history.body.total, 2, `two accepted writes must make two revisions, got ${history.body.total}: ${history.text}`);
  assert.equal(history.body.limit, 20);
  assert.equal(history.body.offset, 0);
  assert.deepEqual(history.body.revisions.map((r) => r.revision), [2, 1], 'the history is newest first');
  assert.deepEqual(Object.keys(history.body.revisions[0]).sort(), ['contractSha256', 'inputSchema', 'recordedAt', 'revision', 'summary'],
      `a revision carries exactly its four fields: ${history.text}`);
  assert.equal(history.body.revisions[0].summary, 'The same name, a better sentence.');
  assert.deepEqual(history.body.revisions[0].inputSchema, updatedSchema);
  assert.equal(history.body.revisions[1].summary, 'The same name, a new row.', 'revision 1 is the sentence it was born with');
  assert.deepEqual(history.body.revisions[1].inputSchema, { type: 'object' }, 'revision 1 is the schema it was born with');
  assert.ok(history.body.revisions[1].recordedAt <= history.body.revisions[0].recordedAt, 'revision 1 was recorded no later than revision 2');

  // A window is a WINDOW: the older one is reachable, and the whole count sits beside it.
  const olderRevision = await call(`/tools/${q(reclaimed.body.id)}/revisions?limit=1&offset=1`);
  assert.equal(olderRevision.body.revisions.length, 1);
  assert.equal(olderRevision.body.revisions[0].revision, 1);
  assert.equal(olderRevision.body.total, 2, 'the window still reports the whole history');
  const clampedHistory = await call(`/tools/${q(reclaimed.body.id)}/revisions?limit=500&offset=-3`);
  assert.equal(clampedHistory.body.limit, 100, 'the history reports the cap it applied');
  assert.equal(clampedHistory.body.offset, 0, 'a negative history offset is floored');

  // An id that names nothing is a 404, not "a tool with no history".
  const unknownHistory = await call('/tools/tool-that-never-existed/revisions');
  assert.equal(unknownHistory.status, 404, `a history of an unknown id must be 404, got ${unknownHistory.status}: ${unknownHistory.text}`);
  assert.equal(unknownHistory.body.error, 'unknown-tool');

  // psql reads the history itself: two rows, the FIRST untouched by the update, both canonical.
  const revisionRows = await sql(`select revision || ':' || summary from tool_revision where tool_id = '${reclaimed.body.id}' order by revision`);
  assert.equal(revisionRows, '1:The same name, a new row.\n2:The same name, a better sentence.',
      `psql must read both revisions in order, got ${JSON.stringify(revisionRows)}`);
  const schemaAtRevisionOne = await sql(`select input_schema from tool_revision where tool_id = '${reclaimed.body.id}' and revision = 1`);
  assert.equal(schemaAtRevisionOne, '{"type":"object"}', 'the birth schema is still stored after the update');
  const schemaAtRevisionTwo = await sql(`select input_schema from tool_revision where tool_id = '${reclaimed.body.id}' and revision = 2`);
  assert.equal(schemaAtRevisionTwo, JSON.stringify(updatedSchema), 'the update recorded its canonical schema');
  const revisionsCount = await sql(`select count(*) from tool_revision where tool_id = '${reclaimed.body.id}'`);
  assert.equal(revisionsCount, '2', 'exactly two recorded writes, not one row and a counter');
  const auditAfterHistory = await sql('select count(*) from audit_entry');
  assert.equal(auditAfterHistory, '0', 'recording a revision is not a trail fact either');

  // ── the pin through an update: the history is navigable by pin, and a held pin goes stale ────────
  // Each revision carries ITS OWN pin, recomputed from its own stored bytes, so a consumer holding a pin can
  // name the write that produced it — revision 1 is exactly the contract pinned before the update.
  assert.equal(history.body.revisions[1].contractSha256, recompute(history.body.revisions[1]));
  assert.equal(history.body.revisions[0].contractSha256, recompute(history.body.revisions[0]));
  assert.equal(history.body.revisions[1].contractSha256, birthPin,
      'revision 1 must pin the contract the consumer read before the update');
  const afterUpdate = await call(`/tools/${q(reclaimed.body.id)}`);
  assert.equal(afterUpdate.status, 200);
  assert.notEqual(afterUpdate.body.contractSha256, birthPin, 'a rewording must change the pin — provenance is not mutation');
  assert.equal(afterUpdate.body.contractSha256, recompute(afterUpdate.body));
  assert.equal(history.body.revisions[0].contractSha256, afterUpdate.body.contractSha256,
      'revision 2 must pin exactly what is served now');
  // The pin that no longer names the current contract answers the new one with 200 — a stale pin is not a 304.
  const staleAfterUpdate = await call(`/tools/${q(reclaimed.body.id)}`, { headers: { 'if-none-match': `"${birthPin}"` } });
  assert.equal(staleAfterUpdate.status, 200,
      `a pin naming the previous contract must answer 200, got ${staleAfterUpdate.status}`);
  assert.equal(staleAfterUpdate.body.contractSha256, afterUpdate.body.contractSha256);

  // ── deprecation: a fact about the declaration, with its own door and its own public list ────────
  const deprecatedId = reclaimed.body.id;
  const notDeprecatedYet = await call(`/tools/${q(deprecatedId)}/deprecation`);
  assert.equal(notDeprecatedYet.status, 404, `a live tool's deprecation must be 404, got ${notDeprecatedYet.status}: ${notDeprecatedYet.text}`);
  assert.equal(notDeprecatedYet.body.error, 'not-deprecated', 'a live tool is not an unknown tool');

  const strangerDeprecation = await postJson(`/tools/${q(deprecatedId)}/deprecation?owner=${q(stranger)}`,
      { message: 'Mine now.', replacement: 'm.tool' });
  assert.equal(strangerDeprecation.status, 403, `a stranger's deprecation must be 403, got ${strangerDeprecation.status}: ${strangerDeprecation.text}`);
  assert.equal(strangerDeprecation.body.error, 'not-your-tool');

  const noOwnerDeprecation = await postJson(`/tools/${q(deprecatedId)}/deprecation`, { message: 'x' });
  assert.equal(noOwnerDeprecation.status, 400, `a deprecation without an owner must be 400, got ${noOwnerDeprecation.status}`);
  assert.match(noOwnerDeprecation.body.message, /owner/);

  const unknownDeprecation = await postJson(`/tools/tool-that-never-existed/deprecation?owner=${q(other)}`,
      { message: 'x' });
  assert.equal(unknownDeprecation.status, 404, `a deprecation of an unknown id must be 404, got ${unknownDeprecation.status}`);
  assert.equal(unknownDeprecation.body.error, 'unknown-tool');

  const blankDeprecation = await postJson(`/tools/${q(deprecatedId)}/deprecation?owner=${q(other)}`, { message: '   ' });
  assert.equal(blankDeprecation.status, 400);
  assert.match(blankDeprecation.body.message, /message/);
  const longDeprecation = await postJson(`/tools/${q(deprecatedId)}/deprecation?owner=${q(other)}`,
      { message: 'x'.repeat(281) });
  assert.equal(longDeprecation.status, 400);
  assert.match(longDeprecation.body.message, /281/);
  const malformedReplacement = await postJson(`/tools/${q(deprecatedId)}/deprecation?owner=${q(other)}`,
      { message: 'Use the successor.', replacement: 'B.Tool' });
  assert.equal(malformedReplacement.status, 400);
  assert.match(malformedReplacement.body.message, /tool name/);
  const selfReplacement = await postJson(`/tools/${q(deprecatedId)}/deprecation?owner=${q(other)}`,
      { message: 'Use the successor.', replacement: 'weather.lookup' });
  assert.equal(selfReplacement.status, 400, `a tool cannot replace itself, got ${selfReplacement.status}: ${selfReplacement.text}`);
  assert.match(selfReplacement.body.message, /its own tool/);

  // None of the refusals stored a row: psql still reads zero deprecations for this tool.
  const deprecationsAfterRefusals = await sql(`select count(*) from tool_deprecation where tool_id = '${deprecatedId}'`);
  assert.equal(deprecationsAfterRefusals, '0', 'a refused deprecation writes nothing');

  const deprecation = await postJson(`/tools/${q(deprecatedId)}/deprecation?owner=${q(other)}`,
      { message: '  Use m.tool instead.  ', replacement: '  m.tool  ' });
  assert.equal(deprecation.status, 200, `the owner's deprecation must be 200, got ${deprecation.status}: ${deprecation.text}`);
  assert.equal(deprecation.body.toolId, deprecatedId);
  assert.equal(deprecation.body.message, 'Use m.tool instead.', 'the message is trimmed');
  assert.equal(deprecation.body.replacement, 'm.tool', 'the replacement name is trimmed');
  assert.ok(Math.abs(Date.now() - deprecation.body.deprecatedAt) < 60 * 60 * 1000);
  assert.deepEqual(Object.keys(deprecation.body).sort(), ['deprecatedAt', 'message', 'replacement', 'toolId'],
      `a deprecation carries exactly its four fields: ${deprecation.text}`);

  // The DECLARATION read is unchanged: deprecation is its own resource, not a seventh field.
  const declarationAfterDeprecation = await call(`/tools/${q(deprecatedId)}`);
  assert.deepEqual(Object.keys(declarationAfterDeprecation.body).sort(), TOOL_FIELDS,
      `deprecating a tool must not grow the declaration's seven fields: ${declarationAfterDeprecation.text}`);
  const deprecationRead = await call(`/tools/${q(deprecatedId)}/deprecation`);
  assert.equal(deprecationRead.status, 200);
  assert.deepEqual(deprecationRead.body, deprecation.body);

  // One public list answers "which tools are going away, and what replaces them".
  const deprecatedList = await call('/tools/deprecations');
  assert.equal(deprecatedList.status, 200, `the deprecation list must be 200, got ${deprecatedList.status}: ${deprecatedList.text}`);
  assert.equal(deprecatedList.body.total, 1);
  assert.equal(deprecatedList.body.limit, 20);
  assert.deepEqual(Object.keys(deprecatedList.body).sort(), ['deprecations', 'limit', 'offset', 'total']);
  assert.deepEqual(Object.keys(deprecatedList.body.deprecations[0]).sort(),
      ['deprecatedAt', 'message', 'name', 'replacement', 'toolId']);
  assert.equal(deprecatedList.body.deprecations[0].name, 'weather.lookup', 'the list carries the tool NAME beside its deprecation');
  assert.equal(deprecatedList.body.deprecations[0].replacement, 'm.tool');
  const deprecatedRows = await sql(`select message from tool_deprecation where tool_id = '${deprecatedId}'`);
  assert.equal(deprecatedRows, 'Use m.tool instead.');

  // Re-deprecating REPLACES the one row: a deprecation is a state, not a history.
  const reDeprecated = await postJson(`/tools/${q(deprecatedId)}/deprecation?owner=${q(other)}`,
      { message: 'A newer reason.', replacement: null });
  assert.equal(reDeprecated.status, 200);
  assert.equal(reDeprecated.body.message, 'A newer reason.');
  assert.equal(reDeprecated.body.replacement, null, 'an absent hint is stored as null, not as an empty name');
  const afterReDeprecation = await sql(`select count(*) from tool_deprecation where tool_id = '${deprecatedId}'`);
  assert.equal(afterReDeprecation, '1', 're-deprecating replaces the one row rather than appending');
  const messageAfterReDeprecation = await sql(`select message from tool_deprecation where tool_id = '${deprecatedId}'`);
  assert.equal(messageAfterReDeprecation, 'A newer reason.');

  // Withdrawal, owner only, and "already live" is not an error.
  const strangerUndeprecation = await call(`/tools/${q(deprecatedId)}/deprecation?owner=${q(stranger)}`, { method: 'DELETE' });
  assert.equal(strangerUndeprecation.status, 403);
  const noOwnerUndeprecation = await call(`/tools/${q(deprecatedId)}/deprecation`, { method: 'DELETE' });
  assert.equal(noOwnerUndeprecation.status, 400);
  assert.match(noOwnerUndeprecation.body.message, /owner/);
  const undeprecated = await call(`/tools/${q(deprecatedId)}/deprecation?owner=${q(other)}`, { method: 'DELETE' });
  assert.equal(undeprecated.status, 200, `the owner's withdrawal must be 200, got ${undeprecated.status}: ${undeprecated.text}`);
  assert.equal(undeprecated.body.removed, true);
  const undeprecatedAgain = await call(`/tools/${q(deprecatedId)}/deprecation?owner=${q(other)}`, { method: 'DELETE' });
  assert.equal(undeprecatedAgain.body.removed, false, 'a tool that is already live is not an error');
  const afterUndeprecation = await call(`/tools/${q(deprecatedId)}/deprecation`);
  assert.equal(afterUndeprecation.status, 404);
  assert.equal(afterUndeprecation.body.error, 'not-deprecated');
  assert.equal(await sql(`select count(*) from tool_deprecation where tool_id = '${deprecatedId}'`), '0');

  // Leave one deprecation on record: §6 must show that it survives the process.
  const keptForRestart = await postJson(`/tools/${q(deprecatedId)}/deprecation?owner=${q(other)}`,
      { message: 'Kept for the restart.', replacement: 'm.tool' });
  assert.equal(keptForRestart.status, 200);
  console.log(`[§5] a tool was read by ID (seven fields) and an unknown id was 404 unknown-tool · a stranger's update was 403, a missing owner 400, an unknown id 404 and an 8193-byte schema 400, and psql read the untouched sentence after all four · the owner's update replaced the summary and stored the schema as ${storedUpdated.length} canonical bytes while the name, id, owner and creation instant stayed · the history answered TWO revisions newest first (revision 1 keeps the birth sentence and schema, revision 2 the replacement), its window reached revision 1 with total=2 beside it, limit=500 reported 100 and offset=-3 reported 0, a since=1 answer was ONE revision with total=1, since=2 was empty with total=0, since=0 was both, a page INSIDE the narrowed set still reported the narrowed count, a negative since was a 400 naming the rule while the floored offset was not, an unknown id was 404, and psql read both rows with audit_entry still EMPTY · every whole declaration carried a 64-hex PIN that the proof RECOMPUTED from the {summary, inputSchema} the answer itself carried, the same value arrived as a strong ETag, holding it was 304 with no body on BOTH read doors, * was 304 and an unknown id with a tag was still 404 · the owner's update changed the pin and left the old one on revision 1, so a held pin answered 200 while the history named the write it came from · removal in §4 took its declaration's history with it · deprecation: a live tool's read was 404 not-deprecated, a stranger 403, a missing owner 400, an unknown id 404, and blank/281-byte messages, a malformed replacement and a self-replacement were all refused while writing nothing; the owner's deprecation stored the trimmed message and hint while the declaration's seven fields stayed seven, the public list carried the tool NAME beside it, re-deprecating replaced the one row, withdrawal answered removed:true then removed:false, and psql read zero · one deprecation was left on record for §6`);

  // ── §5b a declaration CHANGES HANDS without becoming a different declaration ────────────────────
  // Until v579 the registry had no handover door at all: the only way to "give" a tool was to declare it
  // again under the new account, which mints a new id, restarts the history at revision 1 and invalidates
  // every pin a consumer holds. What follows measures the difference.
  const handedOverId = deprecatedId;
  const beforeHandover = await call(`/tools/${q(handedOverId)}`);
  assert.equal(beforeHandover.status, 200);
  assert.equal(beforeHandover.body.owner, other);

  const strangerTransfer = await postJson(`/tools/${q(handedOverId)}/transfer?owner=${q(stranger)}`, { to: heir });
  assert.equal(strangerTransfer.status, 403, `a stranger's transfer must be 403, got ${strangerTransfer.status}: ${strangerTransfer.text}`);
  assert.equal(strangerTransfer.body.error, 'not-your-tool');

  const noOwnerTransfer = await postJson(`/tools/${q(handedOverId)}/transfer`, { to: heir });
  assert.equal(noOwnerTransfer.status, 400, `a transfer without an owner must be 400, got ${noOwnerTransfer.status}`);
  assert.match(noOwnerTransfer.body.message, /owner/);

  const unknownTransfer = await postJson(`/tools/tool-that-never-existed/transfer?owner=${q(other)}`, { to: heir });
  assert.equal(unknownTransfer.status, 404, `a transfer of an unknown id must be 404, got ${unknownTransfer.status}`);
  assert.equal(unknownTransfer.body.error, 'unknown-tool');

  const selfTransfer = await postJson(`/tools/${q(handedOverId)}/transfer?owner=${q(other)}`, { to: other });
  assert.equal(selfTransfer.status, 400, `a transfer to the current holder must be 400, got ${selfTransfer.status}`);
  assert.match(selfTransfer.body.message, /different account/);

  const noTargetTransfer = await postJson(`/tools/${q(handedOverId)}/transfer?owner=${q(other)}`, {});
  assert.equal(noTargetTransfer.status, 400, `a transfer with no target must be 400, got ${noTargetTransfer.status}`);
  assert.match(noTargetTransfer.body.message, /receives the tool/);

  // None of the four refusals wrote anything: same holder, and no handover row.
  assert.equal(await sql(`select owner_account_id from tool_entry where tool_id = '${handedOverId}'`), other,
      'a refused transfer writes nothing');
  assert.equal(await sql(`select count(*) from tool_ownership where tool_id = '${handedOverId}'`), '0');

  const handover = await postJson(`/tools/${q(handedOverId)}/transfer?owner=${q(other)}`, { to: heir });
  assert.equal(handover.status, 200, `the owner's transfer must be 200, got ${handover.status}: ${handover.text}`);
  assert.equal(handover.body.owner, heir, 'the answer names the new holder');
  // The SAME declaration: id, name, creation instant, schema — and the same PIN, because handing a tool over
  // changes nothing it SAYS. A consumer's build is still valid after the handover.
  assert.equal(handover.body.id, beforeHandover.body.id);
  assert.equal(handover.body.name, beforeHandover.body.name);
  assert.equal(handover.body.createdAt, beforeHandover.body.createdAt);
  assert.deepEqual(handover.body.inputSchema, beforeHandover.body.inputSchema);
  assert.equal(handover.body.contractSha256, beforeHandover.body.contractSha256,
      'a handover must not change the contract pin');
  const pinnedThroughHandover = await call(`/tools/${q(handedOverId)}`,
      { headers: { 'if-none-match': `"${beforeHandover.body.contractSha256}"` } });
  assert.equal(pinnedThroughHandover.status, 304, 'a handover must not invalidate a pin a consumer holds');

  // The former owner has no authority left; the new one holds every door.
  const formerOwnerUpdate = await call(`/tools/${q(handedOverId)}?owner=${q(other)}`,
      putBody({ summary: 'Mine again.', inputSchema: {} }));
  assert.equal(formerOwnerUpdate.status, 403, `a former owner's update must be 403, got ${formerOwnerUpdate.status}`);
  assert.equal(formerOwnerUpdate.body.error, 'not-your-tool');
  const formerOwnerDeprecation = await postJson(`/tools/${q(handedOverId)}/deprecation?owner=${q(other)}`,
      { message: 'Still mine.', replacement: null });
  assert.equal(formerOwnerDeprecation.status, 403, `a former owner's deprecation must be 403, got ${formerOwnerDeprecation.status}`);
  const formerOwnerRemoval = await call(`/tools/${q(handedOverId)}?owner=${q(other)}`, { method: 'DELETE' });
  assert.equal(formerOwnerRemoval.status, 403, `a former owner's removal must be 403, got ${formerOwnerRemoval.status}`);
  assert.equal(await sql(`select count(*) from tool_entry where tool_id = '${handedOverId}'`), '1',
      'all three refusals left the declaration in place');
  // The deprecation §5 left on record is untouched by the handover: it describes the TOOL, not its holder.
  const deprecationThroughHandover = await call(`/tools/${q(handedOverId)}/deprecation`);
  assert.equal(deprecationThroughHandover.body.message, 'Kept for the restart.');

  const chain = await call(`/tools/${q(handedOverId)}/ownership`);
  assert.equal(chain.status, 200, `a chain of holders must answer 200, got ${chain.status}: ${chain.text}`);
  assert.deepEqual(Object.keys(chain.body).sort(), ['limit', 'offset', 'owner', 'toolId', 'total', 'transfers'],
      `a chain window carries exactly its six fields: ${chain.text}`);
  assert.equal(chain.body.owner, heir, 'the enquiry names the CURRENT holder');
  assert.equal(chain.body.total, 1, `one handover so far, got ${chain.body.total}`);
  assert.equal(chain.body.transfers[0].transfer, 1);
  assert.equal(chain.body.transfers[0].from, other);
  assert.equal(chain.body.transfers[0].to, heir);

  // And back again: a chain, not a flag. The second handover is appended, never a replacement.
  const handoverBack = await postJson(`/tools/${q(handedOverId)}/transfer?owner=${q(heir)}`, { to: other });
  assert.equal(handoverBack.status, 200, `the new holder's transfer must be 200, got ${handoverBack.status}: ${handoverBack.text}`);
  assert.equal(handoverBack.body.owner, other);
  assert.equal(handoverBack.body.contractSha256, beforeHandover.body.contractSha256,
      'two handovers later the contract is still the one the consumer pinned');
  const chainAfter = await call(`/tools/${q(handedOverId)}/ownership`);
  assert.equal(chainAfter.body.total, 2);
  assert.deepEqual(chainAfter.body.transfers.map((t) => t.transfer), [2, 1], 'the chain is newest first');
  assert.equal(chainAfter.body.transfers[0].from, heir);
  assert.equal(chainAfter.body.transfers[0].to, other);
  assert.equal(chainAfter.body.owner, other, 'the current holder follows the last handover');
  const chainWindow = await call(`/tools/${q(handedOverId)}/ownership?limit=1&offset=1`);
  assert.equal(chainWindow.body.transfers.length, 1);
  assert.equal(chainWindow.body.transfers[0].transfer, 1, 'the older handover is still reachable');
  assert.equal(chainWindow.body.total, 2, 'the window still reports the whole chain');
  const clampedChain = await call(`/tools/${q(handedOverId)}/ownership?limit=500&offset=-3`);
  assert.equal(clampedChain.body.limit, 100, 'the chain reports the cap it applied');
  assert.equal(clampedChain.body.offset, 0, 'a negative chain offset is floored');
  const unknownChain = await call('/tools/tool-that-never-existed/ownership');
  assert.equal(unknownChain.status, 404, `an unknown id's chain must be 404, got ${unknownChain.status}`);
  assert.equal(unknownChain.body.error, 'unknown-tool');

  // psql reads the chain itself, and reads that neither handover wrote a revision or a trail entry.
  assert.equal(
      await sql(`select from_owner || '>' || to_owner from tool_ownership where tool_id = '${handedOverId}' order by transfer`),
      `${other}>${heir}\n${heir}>${other}`,
      'psql must read both handovers in order');
  assert.equal(await sql(`select count(*) from tool_revision where tool_id = '${handedOverId}'`), '2',
      'a handover is not a revision: a revision number means the CONTRACT changed');
  assert.equal(await sql('select count(*) from audit_entry'), '0', 'a handover is not a trail fact either');
  console.log(`[§5b] a stranger's handover was 403, a missing owner 400, an unknown id 404, a transfer to the CURRENT holder 400 and one with no target 400, and psql read the same holder and zero handover rows after all five · the owner's handover was 200 with the SAME id, name, creation instant, schema and PIN (a held pin still answered 304), while the former owner's update, deprecation and removal were each 403 and the deprecation on record was untouched · the chain named the current holder, the second handover appended as transfer 2 with the chain newest first, its window reached transfer 1 with total=2 beside it, the cap and floor were reported, an unknown id was 404, and psql read both handovers with tool_revision still at TWO and audit_entry EMPTY — a handover is not a revision`);

  // ── §5c retention: the owner removes the revisions older than a bound it names ──────────────────
  // The history grows one row per accepted update and nothing pruned it. A silent cap was never an option — a
  // pruned revision is a PIN that can no longer be explained — so the bound is the owner's, named in the
  // request and echoed in the answer, and a bound that would remove the NEWEST revision is refused.
  const prunedName = 'pruned.tool';
  const prunedTool = await postJson('/tools',
      { owner, name: prunedName, summary: 'A tool whose history is about to be pruned.', inputSchema: {} });
  assert.equal(prunedTool.status, 201, `the tool to prune must be declared, got ${prunedTool.status}: ${prunedTool.text}`);
  const prunedId = prunedTool.body.id;
  for (const [index, sentence] of ['Second sentence.', 'Third sentence.'].entries()) {
    const put = await call(`/tools/${q(prunedId)}?owner=${q(owner)}`,
        putBody({ summary: sentence, inputSchema: { step: index + 2 } }));
    assert.equal(put.status, 200, `an update before the prune must be accepted, got ${put.status}: ${put.text}`);
  }
  const pinBeforePrune = (await call(`/tools/${q(prunedId)}`)).body.contractSha256;
  const beforePrune = await call(`/tools/${q(prunedId)}/revisions`);
  assert.equal(beforePrune.body.total, 3, `three accepted writes must make three revisions, got ${beforePrune.body.total}`);

  // Every refusal removes nothing: no owner, no bound, a non-positive bound, a stranger, a bound past the
  // newest revision, and an unknown id.
  const noOwnerPrune = await call(`/tools/${q(prunedId)}/revisions?before=2`, { method: 'DELETE' });
  assert.equal(noOwnerPrune.status, 400, `a prune without an owner must be 400, got ${noOwnerPrune.status}`);
  assert.match(noOwnerPrune.body.message, /owner/);
  const noBoundPrune = await call(`/tools/${q(prunedId)}/revisions?owner=${q(owner)}`, { method: 'DELETE' });
  assert.equal(noBoundPrune.status, 400, `a prune without a bound must be 400, got ${noBoundPrune.status}`);
  assert.match(noBoundPrune.body.message, /before/);
  const zeroBoundPrune = await call(`/tools/${q(prunedId)}/revisions?owner=${q(owner)}&before=0`, { method: 'DELETE' });
  assert.equal(zeroBoundPrune.status, 400, `a prune of revision 0 must be 400, got ${zeroBoundPrune.status}`);
  assert.match(zeroBoundPrune.body.message, /1 or more/);
  const strangerPrune = await call(`/tools/${q(prunedId)}/revisions?owner=${q(stranger)}&before=2`, { method: 'DELETE' });
  assert.equal(strangerPrune.status, 403, `a stranger's prune must be 403, got ${strangerPrune.status}`);
  assert.equal(strangerPrune.body.error, 'not-your-tool');
  const pastNewestPrune = await call(`/tools/${q(prunedId)}/revisions?owner=${q(owner)}&before=4`, { method: 'DELETE' });
  assert.equal(pastNewestPrune.status, 400, `a prune past the newest revision must be 400, got ${pastNewestPrune.status}`);
  assert.match(pastNewestPrune.body.message, /newest/);
  const unknownPrune = await call(`/tools/tool-that-never-existed/revisions?owner=${q(owner)}&before=1`, { method: 'DELETE' });
  assert.equal(unknownPrune.status, 404, `a prune of an unknown id must be 404, got ${unknownPrune.status}`);
  assert.equal(await sql(`select count(*) from tool_revision where tool_id = '${prunedId}'`), '3',
      'all six refusals must leave the history whole');

  const pruned = await call(`/tools/${q(prunedId)}/revisions?owner=${q(owner)}&before=2`, { method: 'DELETE' });
  assert.equal(pruned.status, 200, `the owner's prune must be 200, got ${pruned.status}: ${pruned.text}`);
  assert.deepEqual(Object.keys(pruned.body).sort(), ['before', 'pruned', 'remaining', 'toolId'],
      `a prune answer carries exactly its four fields: ${pruned.text}`);
  assert.equal(pruned.body.before, 2, 'the answer echoes the bound it applied');
  assert.equal(pruned.body.pruned, 1, `strictly before revision 2 is ONE row, got ${pruned.body.pruned}`);
  assert.equal(pruned.body.remaining, 2, 'the answer says what the history still holds');
  const afterPrune = await call(`/tools/${q(prunedId)}/revisions`);
  assert.equal(afterPrune.body.total, 2);
  assert.deepEqual(afterPrune.body.revisions.map((r) => r.revision), [3, 2],
      'the kept revisions start AT the bound, newest first');
  assert.equal(await sql(`select count(*) from tool_revision where tool_id = '${prunedId}'`), '2');
  assert.equal(await sql(`select min(revision) from tool_revision where tool_id = '${prunedId}'`), '2',
      'psql reads the pruned row gone and the kept ones in place');
  // Pruning the same bound twice is not an error: already gone is not a failure.
  const prunedAgain = await call(`/tools/${q(prunedId)}/revisions?owner=${q(owner)}&before=2`, { method: 'DELETE' });
  assert.equal(prunedAgain.status, 200);
  assert.equal(prunedAgain.body.pruned, 0, 'a second prune of the same bound removes nothing');
  assert.equal(prunedAgain.body.remaining, 2);
  // Pruning old revisions does NOT touch the contract: the pin a consumer holds still answers 304.
  const pinnedAfterPrune = await call(`/tools/${q(prunedId)}`,
      { headers: { 'if-none-match': `"${pinBeforePrune}"` } });
  assert.equal(pinnedAfterPrune.status, 304, 'a prune of old revisions must not invalidate the current pin');
  assert.equal(await sql('select count(*) from audit_entry'), '0', 'a prune is a catalog fact, not a trail fact');

  // The tool is removed again so §6 counts the same four rows it counted before this section existed.
  const prunedRemoved = await call(`/tools/${q(prunedId)}?owner=${q(owner)}`, { method: 'DELETE' });
  assert.equal(prunedRemoved.body.removed, true, 'the tool the section declared is removed again');
  assert.equal(await sql(`select count(*) from tool_revision where tool_id = '${prunedId}'`), '0',
      'removal still takes whatever history the prune left');
  console.log(`[§5c] three accepted writes made three revisions · six refusals removed nothing (no owner 400, no bound 400, a bound of 0 400, a stranger 403, a bound past the newest revision 400 naming it, an unknown id 404) · the owner's prune of bound 2 answered before/pruned/remaining = 2/1/2, the history then started AT revision 2 with total=2, psql read min(revision)=2, the same bound pruned again answered 0, and the pin held across the prune still answered 304 — removing old revisions does not touch the contract · the tool was removed again and took its remaining history with it`);

  // ── §5d the catalog names the rows that are going away, without a second request ────────────────
  // Deprecation is its own resource, so before this filter an agent asking "which of these are leaving" had to
  // fetch the catalog, fetch /tools/deprecations, and subtract. One row and a flag now answer it, and the flag
  // decides WHICH rows come back, never what a row says.
  const departingOnly = await call('/tools?deprecated=true');
  assert.equal(departingOnly.status, 200, `the deprecated filter must answer 200, got ${departingOnly.status}: ${departingOnly.text}`);
  assert.deepEqual(Object.keys(departingOnly.body).sort(), LIST_FIELDS,
      `the catalog still carries exactly its eight fields: ${departingOnly.text}`);
  assert.equal(departingOnly.body.deprecated, true, 'the answer echoes the filter it applied');
  assert.equal(departingOnly.body.total, 1, `one declaration is going away, got ${departingOnly.body.total}`);
  assert.deepEqual(departingOnly.body.tools.map((x) => x.name), ['weather.lookup']);
  assert.deepEqual(Object.keys(departingOnly.body.tools[0]).sort(), TOOL_FIELDS,
      'a filtered row is the same seven-field declaration');

  const liveOnly = await call('/tools?deprecated=false');
  assert.equal(liveOnly.status, 200);
  assert.equal(liveOnly.body.deprecated, false, 'false is echoed as false, not as absent');
  assert.equal(liveOnly.body.total, 3, `three declarations are live, got ${liveOnly.body.total}`);
  assert.deepEqual(liveOnly.body.tools.map((x) => x.name), ['big.tool', 'm.tool', 'z.tool']);

  // The three filters compose, and each narrows the count as well as the window.
  const departingMineOnly = await call(`/tools?deprecated=true&owner=${q(other)}`);
  assert.equal(departingMineOnly.body.total, 1, 'the departing tool belongs to the account that holds it');
  const departingTheirs = await call(`/tools?deprecated=true&owner=${q(owner)}`);
  assert.equal(departingTheirs.body.total, 0, 'an account with no departing tool answers zero, not one');
  const departingSearched = await call('/tools?deprecated=true&q=weather');
  assert.equal(departingSearched.body.total, 1);
  const departingSearchedAway = await call('/tools?deprecated=true&q=z');
  assert.equal(departingSearchedAway.body.total, 0, 'the search narrows the departing set too');
  const liveSearched = await call('/tools?deprecated=false&q=tool');
  assert.equal(liveSearched.body.total, 3, 'three live declarations carry tool in their name - the departing one is excluded');

  const unfilteredCatalog = await call('/tools');
  assert.equal(unfilteredCatalog.body.deprecated, null, 'an absent filter is echoed as null');
  assert.equal(unfilteredCatalog.body.total, 4, 'an absent filter is both sets');
  const deprecationRowCount = await sql('select count(*) from tool_deprecation');
  assert.equal(deprecationRowCount, '1', 'psql agrees: exactly one declaration carries a deprecation');
  console.log(`[§5d] the catalog answered the rows that are going away: deprecated=true was ONE row (weather.lookup) with total=1, deprecated=false was the other THREE, an absent flag was null and all four, the flag composed with owner (1 and 0) and with the search (1 and 0 for the departing set, 3 for the live one), every answer echoed the flag it applied and every row kept its seven declaration fields · psql read one deprecation row`);

  // ── §5e the journal names every change, including the ones the state tables deleted ─────────────
  // A catalog answers what IS. A removal deletes the row that could say it was removed, and a withdrawal
  // deletes the row that said the tool was going away, so neither fact is derivable from state. The journal
  // is the ONE read that can name them - and it faces FORWARD from a cursor, because its reader is a poller
  // that already knows everything up to where it stopped.
  const journalHead = await call('/tools/changes?limit=100');
  assert.equal(journalHead.status, 200, `the journal must answer 200, got ${journalHead.status}: ${journalHead.text}`);
  assert.deepEqual(Object.keys(journalHead.body).sort(), JOURNAL_FIELDS,
      `the journal carries exactly its five fields: ${journalHead.text}`);
  assert.equal(journalHead.body.since, 0, 'an absent cursor reads as 0 and is echoed as a real cursor');
  assert.equal(journalHead.body.total, Number(await sql('select count(*) from tool_change')),
      'the journal total is the table count');
  const openingEntry = journalHead.body.changes[0];
  assert.deepEqual(Object.keys(openingEntry).sort(), CHANGE_FIELDS, 'an entry carries exactly its six fields');
  assert.equal(openingEntry.kind, 'declared');
  assert.equal(openingEntry.revision, 1, 'the first accepted write was a birth, and it names revision 1');
  assert.ok(journalHead.body.total >= 15,
      `this section accepted at least fifteen writes, but the journal holds ${journalHead.body.total}`);

  // Walk the whole journal forward seven at a time: a poller's path, not a page a person clicked.
  const walked = [];
  let cursor = 0;
  let pages = 0;
  for (;;) {
    const page = await call(`/tools/changes?since=${cursor}&limit=7`);
    assert.equal(page.status, 200, `a journal page must answer 200, got ${page.status}: ${page.text}`);
    assert.equal(page.body.since, cursor, 'every page echoes the cursor it started after');
    assert.equal(page.body.limit, 7, 'every page echoes the cap it applied');
    assert.equal(page.body.total, journalHead.body.total - walked.length,
        'the narrowed count is the whole number of entries newer than the cursor');
    if (page.body.changes.length === 0) {
      break;
    }
    const seqs = page.body.changes.map((c) => c.seq);
    assert.ok(seqs.every((s) => s > cursor), `a page holds only entries after the cursor ${cursor}: ${seqs}`);
    assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), 'a page is oldest first');
    walked.push(...page.body.changes);
    cursor = seqs[seqs.length - 1];
    pages += 1;
  }
  assert.equal(walked.length, journalHead.body.total, 'walking forward visited every entry');
  assert.equal(pages, Math.ceil(journalHead.body.total / 7), 'the walk took as many pages as the count implies');
  assert.deepEqual(walked.slice(0, journalHead.body.changes.length), journalHead.body.changes,
      'the walk sees the same entries the first page showed');
  assert.equal(new Set(walked.map((c) => c.seq)).size, walked.length, 'no entry was visited twice');

  // Six kinds, and only the two that WRITE A CONTRACT carry a revision: the journal says where to look.
  const kinds = [...new Set(walked.map((c) => c.kind))].sort();
  assert.deepEqual(kinds, ['declared', 'deprecated', 'removed', 'transferred', 'undeprecated', 'updated'],
      `every accepted write names its kind, got ${kinds}`);
  for (const entry of walked) {
    assert.equal(typeof entry.at, 'number', `every entry carries the instant it happened: ${JSON.stringify(entry)}`);
    assert.equal(entry.revision === null, !(entry.kind === 'declared' || entry.kind === 'updated'),
        `only a contract write names a revision: ${JSON.stringify(entry)}`);
    assert.ok(typeof entry.name === 'string' && entry.name.length > 0, 'every entry carries a name');
  }

  // The removal here names a row that no longer exists - and its name went with it.
  const prunedEntries = walked.filter((c) => c.toolId === prunedId);
  assert.deepEqual(prunedEntries.map((c) => c.kind), ['declared', 'updated', 'updated', 'removed'],
      `the pruned tool's whole life, in order: ${JSON.stringify(prunedEntries)}`);
  assert.deepEqual(prunedEntries.map((c) => c.revision), [1, 2, 3, null],
      'the journal points at each revision the updates wrote, and at nothing for the removal');
  assert.equal(prunedEntries[3].name, prunedName, 'the removal still carries the name the row had');
  assert.equal((await call(`/tools/${q(prunedId)}`)).status, 404, 'the declaration the entry names is gone');
  assert.equal(await sql(`select count(*) from tool_entry where tool_id = '${prunedId}'`), '0');
  // A retention prune is NOT a journal entry: it removes old revisions, and the registry still declares the
  // same contract. The journal answers "what happened to the registry", not "what happened to one history".
  assert.equal(prunedEntries.filter((c) => c.kind === 'removed').length, 1);

  // A withdrawal is the other fact that deletes its own evidence: the deprecation row is gone, the entry stays.
  const withdrawals = walked.filter((c) => c.kind === 'undeprecated');
  assert.equal(withdrawals.length, 1, `the section withdrew exactly one deprecation, got ${withdrawals.length}`);
  assert.equal(withdrawals[0].revision, null, 'a withdrawal writes no contract');
  assert.ok(walked.some((c) => c.toolId === withdrawals[0].toolId && c.kind === 'deprecated' && c.seq < withdrawals[0].seq),
      'the withdrawal is preceded by the deprecation it withdrew');
  assert.ok(walked.some((c) => c.toolId === withdrawals[0].toolId && c.kind === 'deprecated' && c.seq > withdrawals[0].seq),
      'and followed by the new deprecation the section left on record');

  // A write that removes nothing writes no entry: "already gone" is not a change.
  const beforeNoop = (await call('/tools/changes?limit=1')).body.total;
  const noopRemoval = await call(`/tools/${q(prunedId)}?owner=${q(owner)}`, { method: 'DELETE' });
  assert.equal(noopRemoval.body.removed, false);
  assert.equal((await call('/tools/changes?limit=1')).body.total, beforeNoop,
      'a removal that removes nothing journals nothing');

  // The cursor is a real cursor, not a filter with a special spelling.
  const negativeCursor = await call('/tools/changes?since=-1');
  assert.equal(negativeCursor.status, 400, `a negative cursor must be 400, got ${negativeCursor.status}`);
  assert.match(negativeCursor.body.message, /0 or more/);
  const flooredPage = await call('/tools/changes?limit=500&offset=-3');
  assert.equal(flooredPage.body.limit, 100, 'the cap is reported');
  assert.equal(flooredPage.body.offset, 0, 'a negative offset is floored, not refused');
  const pastTheEnd = await call(`/tools/changes?since=${cursor}`);
  assert.deepEqual(pastTheEnd.body.changes, [], 'a cursor at the newest entry answers nothing');
  assert.equal(pastTheEnd.body.total, 0, 'and says the narrowed set is empty');
  console.log(`[§5e] the registry kept a JOURNAL of what HAPPENED: ${journalHead.body.total} entries, OLDEST first, walked forward seven at a time in ${pages} pages that each echoed the cursor they started after and the narrowing count beside them, with no entry seen twice · six kinds appeared (declared, updated, transferred, deprecated, undeprecated, removed) and ONLY the two that write a contract named a revision · the removed pruned.tool read back as declared/updated/updated/removed with revisions 1, 2, 3 and null while its declaration was a 404 and tool_entry held zero rows — the journal is the only read that can name a row that is gone, and it still carried the NAME · a retention prune wrote no entry, and the one withdrawal sat between the deprecation it withdrew and the new one left on record · an already-gone removal wrote nothing · a negative cursor was a 400 naming "0 or more", a limit of 500 was reported as 100 and an offset of -3 as 0, and a cursor at the newest entry answered an empty set with total=0 · psql read the same count the answer claimed`);
  // ── §5f a watcher does not have to receive the whole registry ───────────────────────────────────
  // Two narrowings: a KIND (watch only the removals, the entries no catalog can show) and a DECLARATION
  // (one tool's whole life, including the part state has forgotten). Each narrows the window AND the count,
  // and neither changes what an entry says: the same six fields, in the same oldest-first order.
  const removalFeed = await call('/tools/changes?kind=removed&limit=100');
  assert.equal(removalFeed.status, 200, `a kind filter must answer 200, got ${removalFeed.status}: ${removalFeed.text}`);
  assert.deepEqual(Object.keys(removalFeed.body).sort(), JOURNAL_FIELDS,
      `the journal still carries exactly its seven fields: ${removalFeed.text}`);
  assert.equal(removalFeed.body.kind, 'removed', 'the answer echoes the kind it applied');
  assert.equal(removalFeed.body.toolId, null, 'and the absent declaration as null, not as "every tool"');
  const removalRows = walked.filter((c) => c.kind === 'removed');
  assert.equal(removalFeed.body.total, removalRows.length,
      `the narrowed count is the whole number of removals, got ${removalFeed.body.total} for ${removalRows.length} rows`);
  assert.deepEqual(removalFeed.body.changes.map((c) => c.seq), removalRows.map((c) => c.seq),
      'a filtered page is the same rows the whole feed carried, in the same order');
  assert.deepEqual(Object.keys(removalFeed.body.changes[0]).sort(), CHANGE_FIELDS,
      'a filtered entry is the same six fields');
  assert.equal(removalFeed.body.total,
      Number(await sql("select count(*) from tool_change where kind = 'removed'")),
      'psql counts the same removals the answer names');

  const lifeFeed = await call(`/tools/changes?toolId=${q(prunedId)}`);
  assert.equal(lifeFeed.status, 200, `a declaration filter must answer 200, got ${lifeFeed.status}: ${lifeFeed.text}`);
  assert.equal(lifeFeed.body.toolId, prunedId, 'the answer echoes the declaration it applied');
  assert.equal(lifeFeed.body.kind, null, 'and the absent kind as null');
  assert.equal(lifeFeed.body.total, 4, `one removed tool's life is four entries, got ${lifeFeed.body.total}`);
  assert.deepEqual(lifeFeed.body.changes.map((c) => c.kind), ['declared', 'updated', 'updated', 'removed'],
      'the declaration filter answers a life in order, ending where the row ended');
  assert.deepEqual(lifeFeed.body.changes.map((c) => c.seq), prunedEntries.map((c) => c.seq),
      'and it is exactly the slice the whole feed carried');

  // The two compose, and the cursor composes with them.
  const lastRemovalOnly = await call(`/tools/changes?kind=removed&toolId=${q(prunedId)}`);
  assert.equal(lastRemovalOnly.body.total, 1);
  assert.equal(lastRemovalOnly.body.changes[0].name, prunedName);
  assert.equal(lastRemovalOnly.body.kind, 'removed');
  assert.equal(lastRemovalOnly.body.toolId, prunedId);
  const laterRemovals = await call(`/tools/changes?kind=removed&since=${removalRows[0].seq}`);
  assert.equal(laterRemovals.body.total, removalRows.length - 1,
      'a cursor inside a narrowed set keeps the narrowed count');

  // A blank narrowing is the ABSENT filter, the same rule the catalog follows.
  const blankKind = await call('/tools/changes?kind=%20%20&toolId=%20&limit=1');
  assert.equal(blankKind.status, 200);
  assert.equal(blankKind.body.kind, null, 'a blank kind is not the word "" - it is no filter');
  assert.equal(blankKind.body.toolId, null);
  assert.equal(blankKind.body.total, journalHead.body.total, 'and the feed is the whole journal again');

  // The vocabulary is a closed set, and it is the PROTOCOL: an unknown or capitalised word is refused by
  // name, because an empty page would be a true answer to "nothing matched" and a lie about a typo.
  const unknownKind = await call('/tools/changes?kind=pruned');
  assert.equal(unknownKind.status, 400, `an unknown kind must be 400, got ${unknownKind.status}`);
  assert.match(unknownKind.body.message, /declared, updated, transferred, deprecated, undeprecated, attested, unattested, removed/);
  const capitalKind = await call('/tools/changes?kind=Removed');
  assert.equal(capitalKind.status, 400, 'the words are case-sensitive, so Removed is a typo, not a synonym');
  assert.match(capitalKind.body.message, /Removed/);

  // A declaration the journal never saw is an EMPTY feed, not a 404: this read records what WAS, so an id
  // whose row is gone is exactly what it may still hold.
  const neverSeen = await call('/tools/changes?toolId=tool-that-never-existed');
  assert.equal(neverSeen.status, 200, `an unknown declaration is an empty feed, got ${neverSeen.status}`);
  assert.deepEqual(neverSeen.body.changes, []);
  assert.equal(neverSeen.body.total, 0);

  // The narrowings have an index behind them: a filter that walked the whole journal per poll would be a
  // promise this door could not keep as the feed grew.
  const changeIndexes = (await sql("select indexname from pg_indexes where tablename = 'tool_change'")).split('\n').filter(Boolean);
  assert.ok(changeIndexes.includes('idx_tool_change_kind_seq'),
      `the kind narrowing must have its own index, got ${JSON.stringify(changeIndexes)}`);
  assert.ok(changeIndexes.includes('idx_tool_change_tool_seq'),
      `the declaration narrowing must have its own index, got ${JSON.stringify(changeIndexes)}`);
  console.log(`[§5f] the feed could be WATCHED, not just read: kind=removed answered exactly the ${removalRows.length} removals the whole feed carried, with the narrowed count beside them and psql counting the same rows · toolId named the removed tool's whole life — declared, updated, updated, removed — in order and field for field as the whole feed had it · the two composed to ONE row still carrying its name, and a cursor inside a narrowed set kept that set's count · a blank kind or id was the ABSENT filter (echoed null, whole feed again), an unknown kind was a 400 naming the whole eight-word vocabulary while Removed was a 400 naming itself, and an id the journal never saw was an empty feed with total=0 rather than a 404 · pg_indexes showed kind+seq and tool_id+seq indexes behind the two narrowings`);
  // ── §5g a list of ids is ONE read, and the answer says which of them held nothing ───────────────
  // The feed names what changed; the next question is what those declarations ARE now. Asking one at a
  // time makes a poller's cost proportional to the number of changes. The answer keeps the caller's order
  // (a list to zip with the one it sent) and names the ids that held nothing, so a gap in the caller's own
  // list is never mistaken for an empty registry.
  const catalogNow = await call('/tools');
  const [firstTool, secondTool] = catalogNow.body.tools;
  const batchRead = await call(`/tools/batch?id=${q(secondTool.id)}&id=${q(firstTool.id)}&id=gone-${STAMP}&id=${q(secondTool.id)}`);
  assert.equal(batchRead.status, 200, `a batch must answer 200, got ${batchRead.status}: ${batchRead.text}`);
  assert.deepEqual(Object.keys(batchRead.body).sort(), BATCH_FIELDS,
      `a batch answer carries exactly its four fields: ${batchRead.text}`);
  assert.equal(batchRead.body.requested, 3, `the duplicate collapsed: three distinct ids were asked for, got ${batchRead.body.requested}`);
  assert.equal(batchRead.body.found, 2);
  assert.deepEqual(batchRead.body.tools.map((x) => x.id), [secondTool.id, firstTool.id],
      'the answer keeps the ORDER the caller named, not the catalog\'s name order');
  assert.deepEqual(batchRead.body.missing, [`gone-${STAMP}`], 'and names the id that held nothing');
  assert.deepEqual(Object.keys(batchRead.body.tools[0]).sort(), TOOL_FIELDS,
      'a batch row is the same seven-field declaration');
  assert.deepEqual(batchRead.body.tools[0], secondTool,
      'and it is field for field the declaration the catalog serves, PIN included');

  // A removed declaration is an ABSENT row among the found ones - never a failed request.
  const removedBatch = await call(`/tools/batch?id=${q(prunedId)}`);
  assert.equal(removedBatch.status, 200, `a removed id must not fail a batch, got ${removedBatch.status}`);
  assert.equal(removedBatch.body.requested, 1);
  assert.equal(removedBatch.body.found, 0);
  assert.deepEqual(removedBatch.body.tools, []);
  assert.deepEqual(removedBatch.body.missing, [prunedId], 'the answer NAMES the id that held nothing');

  // The composition this door exists for: take every id the feed ever updated, and ask what they are now.
  const updatedIds = [...new Set(walked.filter((c) => c.kind === 'updated').map((c) => c.toolId))];
  const followUp = await call(`/tools/batch?${updatedIds.map((id) => `id=${q(id)}`).join('&')}`);
  assert.equal(followUp.status, 200, `the follow-up batch must answer 200, got ${followUp.status}: ${followUp.text}`);
  assert.equal(followUp.body.requested, updatedIds.length);
  assert.equal(followUp.body.found + followUp.body.missing.length, followUp.body.requested,
      'every id the feed named is either a row or a name in missing - never silently dropped');
  assert.ok(followUp.body.missing.includes(prunedId),
      'the declaration that was updated and then removed lands in missing, which is the honest answer');

  // The bounds, and the shapes that are not ids.
  const noIds = await call('/tools/batch?id=%20&id=');
  assert.equal(noIds.status, 400, `a batch naming nothing must be 400, got ${noIds.status}`);
  assert.match(noIds.body.message, /at least one id/);
  const overBatch = await call(`/tools/batch?${Array.from({ length: 51 }, (_, i) => `id=id-${i}`).join('&')}`);
  assert.equal(overBatch.status, 400, `a batch of 51 ids must be 400, got ${overBatch.status}`);
  assert.match(overBatch.body.message, /at most 50/);
  const emptyRegister = await call('/tools/batch?limit=3');
  assert.equal(emptyRegister.status, 400, 'a query string with no id at all is refused the same way');
  console.log(`[§5g] a LIST of ids was ONE request: three distinct ids asked for (a duplicate collapsed) answered two declarations IN THE ORDER ASKED - not the catalog's - each field for field what /tools serves, PIN included, with the third named in missing · a removed declaration was found=0 with its id in missing rather than a failed request · every id the feed ever UPDATED (${updatedIds.length}) was answered as a row or a name in missing, so nothing was silently dropped · a batch naming only blanks was a 400 saying "at least one id", 51 ids were a 400 naming the cap of 50, and a query string with no id at all was refused the same way`);
  // ── §5h an owner's claim about ONE contract, and what happens when the contract moves ────────────
  // The registry cannot test anything. What it can do is keep the claim exactly, at the pin it names, and
  // say whether that pin is still being served - instead of letting an update silently inherit a claim about
  // bytes nobody tested.
  const ATTEST_FIELDS = ['attestedAt', 'contractSha256', 'note', 'stillCurrent', 'toolId'].sort();
  const attestedTool = catalogNow.body.tools.find((x) => x.owner === owner);
  assert.ok(attestedTool, 'the section needs a live tool owned by its owner');
  const attestUrl = `/tools/${q(attestedTool.id)}/attestation`;

  // Nothing claimed yet: a 404 under its own name, distinct from an unknown id.
  const noClaim = await call(attestUrl);
  assert.equal(noClaim.status, 404, `an unattested tool must be 404, got ${noClaim.status}`);
  assert.equal(noClaim.body.error, 'not-attested');
  // Every refusal before the accepted write.
  const wrongPin = await postJson(`${attestUrl}?owner=${q(owner)}`, { contractSha256: 'f'.repeat(64), note: 'x' });
  assert.equal(wrongPin.status, 409, `a claim about another contract must be 409, got ${wrongPin.status}`);
  assert.equal(wrongPin.body.error, 'stale-contract');
  assert.match(wrongPin.body.message, new RegExp(attestedTool.contractSha256),
      'the refusal names the pin that IS being served');
  const shortPin = await postJson(`${attestUrl}?owner=${q(owner)}`, { contractSha256: 'abc' });
  assert.equal(shortPin.status, 400);
  assert.match(shortPin.body.message, /64 lowercase hex/);
  const noPin = await postJson(`${attestUrl}?owner=${q(owner)}`, {});
  assert.equal(noPin.status, 400);
  assert.match(noPin.body.message, /name the contract pin/);
  const noOwnerAttest = await postJson(attestUrl, { contractSha256: attestedTool.contractSha256 });
  assert.equal(noOwnerAttest.status, 400);
  assert.match(noOwnerAttest.body.message, /owner/);
  const strangerAttest = await postJson(`${attestUrl}?owner=${q(stranger)}`, { contractSha256: attestedTool.contractSha256 });
  assert.equal(strangerAttest.status, 403);
  assert.equal(strangerAttest.body.error, 'not-your-tool');
  const unknownAttest = await postJson(`/tools/tool-that-never-existed/attestation?owner=${q(owner)}`,
      { contractSha256: attestedTool.contractSha256 });
  assert.equal(unknownAttest.status, 404);
  assert.equal(unknownAttest.body.error, 'unknown-tool');
  assert.equal(await sql('select count(*) from tool_attestation'), '0',
      'six refusals must leave the table empty');

  const attested = await postJson(`${attestUrl}?owner=${q(owner)}`,
      { contractSha256: attestedTool.contractSha256, note: '  ran the example suite; 3 cases  ' });
  assert.equal(attested.status, 200, `the owner's claim must be 200, got ${attested.status}: ${attested.text}`);
  assert.deepEqual(Object.keys(attested.body).sort(), ATTEST_FIELDS,
      `an attestation carries exactly its five fields: ${attested.text}`);
  assert.equal(attested.body.contractSha256, attestedTool.contractSha256);
  assert.equal(attested.body.note, 'ran the example suite; 3 cases', 'the note is trimmed');
  assert.equal(attested.body.stillCurrent, true);
  assert.equal(typeof attested.body.attestedAt, 'number');
  assert.deepEqual(Object.keys((await call(`/tools/${q(attestedTool.id)}`)).body).sort(), TOOL_FIELDS,
      'a claim is its own resource: the declaration is STILL seven fields');

  // The contract moves. The claim must NOT move with it - it is true about the bytes it named.
  const moved = await call(`/tools/${q(attestedTool.id)}?owner=${q(owner)}`,
      putBody({ summary: 'Tested after the claim, with a new sentence.', inputSchema: { step: 2 } }));
  assert.equal(moved.status, 200, `the owner's update must be accepted, got ${moved.status}: ${moved.text}`);
  const pinAfterMove = moved.body.contractSha256;
  assert.notEqual(pinAfterMove, attestedTool.contractSha256, 'the update must change the contract');
  const nowStale = await call(attestUrl);
  assert.equal(nowStale.status, 200, 'the claim survives the update');
  assert.equal(nowStale.body.contractSha256, attestedTool.contractSha256,
      'and still names the contract it tested, not the one being served');
  assert.equal(nowStale.body.stillCurrent, false, 'the answer says the pinned contract is no longer served');
  assert.equal(nowStale.body.note, 'ran the example suite; 3 cases', 'and keeps the note');

  const staleNow = await postJson(`${attestUrl}?owner=${q(owner)}`, { contractSha256: attestedTool.contractSha256 });
  assert.equal(staleNow.status, 409, 'the OLD pin is now the stale one');
  assert.match(staleNow.body.message, new RegExp(pinAfterMove));

  const reAttested = await postJson(`${attestUrl}?owner=${q(owner)}`, { contractSha256: pinAfterMove });
  assert.equal(reAttested.status, 200, `re-attesting the served pin must be 200, got ${reAttested.status}`);
  assert.equal(reAttested.body.stillCurrent, true);
  assert.equal(reAttested.body.note, null, 'a claim without a note says so with null');
  assert.equal(await sql(`select count(*) from tool_attestation where tool_id = '${attestedTool.id}'`), '1',
      're-attesting REPLACES the one row rather than appending');

  // The claim is a registry change, so the journal names it - and the withdrawal, which deletes its own row.
  const attestedFeed = await call('/tools/changes?kind=attested');
  assert.equal(attestedFeed.body.total, 2, `two accepted claims so far, got ${attestedFeed.body.total}`);
  assert.deepEqual(attestedFeed.body.changes.map((c) => c.seq), [...attestedFeed.body.changes.map((c) => c.seq)].sort((a, b) => a - b));
  assert.equal(await sql("select count(*) from tool_change where kind = 'attested'"), '2');
  const withdrawn = await call(`${attestUrl}?owner=${q(owner)}`, { method: 'DELETE' });
  assert.equal(withdrawn.status, 200);
  assert.equal(withdrawn.body.removed, true);
  assert.equal(await sql('select count(*) from tool_attestation'), '0', 'the row is gone');
  const withdrawnAgain = await call(`${attestUrl}?owner=${q(owner)}`, { method: 'DELETE' });
  assert.equal(withdrawnAgain.body.removed, false, 'nothing to withdraw is not an error');
  assert.equal((await call('/tools/changes?kind=unattested')).body.total, 1,
      'the withdrawal is the only record that a claim existed');
  assert.equal((await call(attestUrl)).status, 404, 'and the read is not-attested again');

  // Leave one claim on record: §6 must show that it survives the process, stillCurrent included.
  const kept = await postJson(`${attestUrl}?owner=${q(owner)}`, { contractSha256: pinAfterMove, note: 'kept for §6' });
  assert.equal(kept.status, 200, `leaving a claim on record must be 200, got ${kept.status}`);
  const attestationColumns = (await sql("select column_name from information_schema.columns where table_name = 'tool_attestation' order by column_name")).split('\n').filter(Boolean);
  assert.deepEqual(attestationColumns, ['attested_at', 'contract_sha256', 'note', 'tool_id'],
      `tool_attestation must have exactly the four claim columns, got ${JSON.stringify(attestationColumns)}`);
  console.log(`[§5h] an owner's claim was bound to ONE contract: six refusals left the table empty (no claim 404 not-attested, a foreign pin 409 naming the served pin, a three-character pin 400, no pin 400, no owner 400, a stranger 403, an unknown id 404) · the accepted claim was five fields with the note trimmed and stillCurrent true while the declaration stayed SEVEN fields · an update moved the contract and the claim did NOT follow: it still named the old pin with stillCurrent false and its note intact, the old pin was then a 409 naming the new one, and re-attesting the served pin REPLACED the one row with note null · the journal named both claims (kind=attested, psql agreeing) and the withdrawal (kind=unattested) that deleted the only row which could have said it · one claim was left on record and information_schema read exactly four columns (${attestationColumns.join(', ')})`);
  // ── §5i the TESTED filter: a claim narrows the catalog, and a STALE claim still matches ─────────
  // The question an agent asks is "which of these has somebody tested?" — the same client-side join the
  // deprecated filter removed. The flag names the claim's EXISTENCE, not its currency: the pin is computed
  // from the row and never stored, so SQL cannot compare it. This section proves that limit rather than
  // hiding it, because a filter that quietly implied a certificate would be worse than no filter.
  const testedNow = await call('/tools?tested=true');
  assert.equal(testedNow.status, 200, `tested=true must answer 200, got ${testedNow.status}: ${testedNow.text}`);
  assert.deepEqual(Object.keys(testedNow.body).sort(), LIST_FIELDS,
      `the catalog envelope grew exactly one flag: ${testedNow.text}`);
  assert.equal(testedNow.body.tested, true, 'the answer echoes the flag it applied');
  assert.equal(testedNow.body.total, 1);
  assert.deepEqual(testedNow.body.tools.map((t) => t.id), [attestedTool.id],
      'only the declaration that carries a claim is in the window');
  assert.deepEqual(Object.keys(testedNow.body.tools[0]).sort(), TOOL_FIELDS,
      'and the row is still the seven-field declaration');

  const untestedNow = await call('/tools?tested=false');
  assert.equal(untestedNow.body.tested, false, 'false is echoed as false, not as absent');
  assert.equal(untestedNow.body.total, 3);
  assert.ok(!untestedNow.body.tools.some((t) => t.id === attestedTool.id),
      'the claimed declaration is not in the unclaimed half');

  const bothNow = await call('/tools');
  assert.equal(bothNow.body.tested, null, 'an absent flag is echoed as null');
  assert.equal(bothNow.body.total, 4, 'and it hides nothing');

  // The two facts live on DIFFERENT declarations — weather.lookup is departing and unclaimed, z.tool is
  // claimed and live — which is why the flags have to compose rather than each be a separate catalog. Its
  // owner claims it, so the intersection is a real row instead of an empty answer that could mean anything.
  const departingTool = await call('/tools/by-name/weather.lookup');
  assert.equal(departingTool.status, 200, `the section needs weather.lookup, got ${departingTool.status}`);
  assert.equal(departingTool.body.id, deprecatedId, 'the section claims the declaration that is going away');
  const departingClaim = await postJson(
      `/tools/${q(departingTool.body.id)}/attestation?owner=${q(departingTool.body.owner)}`,
      { contractSha256: departingTool.body.contractSha256, note: 'claimed while departing' });
  assert.equal(departingClaim.status, 200,
      `claiming the departing row must be 200, got ${departingClaim.status}: ${departingClaim.text}`);
  const twoClaims = await call('/tools?tested=true');
  assert.equal(twoClaims.body.total, 2, 'two declarations now carry a claim');

  // The four-way composition, on real state: the claimed set and the departing set intersect in ONE row.
  const claimedAndDeparting = await call('/tools?tested=true&deprecated=true');
  assert.equal(claimedAndDeparting.body.total, 1);
  assert.deepEqual(claimedAndDeparting.body.tools.map((t) => t.name), ['weather.lookup']);
  assert.equal(claimedAndDeparting.body.tested, true);
  assert.equal(claimedAndDeparting.body.deprecated, true);
  const claimedAndLive = await call('/tools?tested=true&deprecated=false');
  assert.equal(claimedAndLive.body.total, 1, 'the claim that is still live is the other one');
  assert.deepEqual(claimedAndLive.body.tools.map((t) => t.id), [attestedTool.id]);
  const unclaimedAndDeparting = await call('/tools?tested=false&deprecated=true');
  assert.equal(unclaimedAndDeparting.body.total, 0, 'the departing row now carries a claim, so it left this half');
  const unclaimedAndLive = await call('/tools?tested=false&deprecated=false');
  assert.equal(unclaimedAndLive.body.total, 2);

  // Compose with the other two filters, and narrow the COUNT with them.
  const testedByOther = await call(`/tools?tested=true&owner=${q(other)}`);
  assert.equal(testedByOther.body.total, 1);
  const testedByOwner = await call(`/tools?tested=true&owner=${q(owner)}`);
  assert.equal(testedByOwner.body.total, 1);
  const testedBySearch = await call('/tools?tested=true&q=weather');
  assert.equal(testedBySearch.body.total, 1);
  const testedSearchMiss = await call('/tools?tested=true&q=big');
  assert.equal(testedSearchMiss.body.total, 0, 'the search narrows the SAME window the flag selected');

  // And now the TRAP this flag deliberately does not solve: claim the contract m.tool serves, then MOVE
  // that contract. The claim stays — it is about the bytes it named — so tested=true still names the row
  // while stillCurrent is false, which is exactly what a declaration row cannot say.
  const mTool = await call('/tools/by-name/m.tool');
  assert.equal(mTool.status, 200, `the section needs m.tool, got ${mTool.status}: ${mTool.text}`);
  const mPin = mTool.body.contractSha256;
  const mClaim = await postJson(`/tools/${q(mTool.body.id)}/attestation?owner=${q(mTool.body.owner)}`,
      { contractSha256: mPin, note: 'claims the contract as it stands' });
  assert.equal(mClaim.status, 200, `the third claim must be accepted, got ${mClaim.status}: ${mClaim.text}`);
  const threeClaims = await call('/tools?tested=true');
  assert.equal(threeClaims.body.total, 3);

  const mMoved = await call(`/tools/${q(mTool.body.id)}?owner=${q(mTool.body.owner)}`,
      putBody({ summary: 'A later sentence, a later contract.', inputSchema: { type: 'object' } }));
  assert.equal(mMoved.status, 200, `moving m.tool's contract must be 200, got ${mMoved.status}: ${mMoved.text}`);
  const mNowStale = await call(`/tools/${q(mTool.body.id)}/attestation`);
  assert.equal(mNowStale.body.contractSha256, mPin, 'the claim still names the pin it was made about');
  assert.equal(mNowStale.body.stillCurrent, false, 'and the contract being served is no longer that one');
  const afterMove = await call('/tools?tested=true');
  assert.equal(afterMove.body.total, 3,
      'the STALE claim still matches tested=true: the flag names the claim, not the verdict');
  assert.ok(afterMove.body.tools.some((t) => t.id === mTool.body.id),
      'and the row it names carries no field saying so');
  const staleAndLive = await call('/tools?tested=true&deprecated=false');
  assert.equal(staleAndLive.body.total, 2, 'the stale claim composes with the other filters like any other claim');

  // Withdrawal takes a row out of the window, because the claim is the only thing the filter asks about.
  // This section withdraws the two claims IT made, leaving the one it found, so the fixture is unchanged.
  const mWithdrawn = await call(`/tools/${q(mTool.body.id)}/attestation?owner=${q(mTool.body.owner)}`,
      { method: 'DELETE' });
  assert.equal(mWithdrawn.status, 200);
  assert.equal(mWithdrawn.body.removed, true);
  const afterMWithdrawal = await call('/tools?tested=true');
  assert.equal(afterMWithdrawal.body.total, 2, 'a withdrawn claim is no longer a tested row');
  const departingWithdrawn = await call(
      `/tools/${q(departingTool.body.id)}/attestation?owner=${q(departingTool.body.owner)}`, { method: 'DELETE' });
  assert.equal(departingWithdrawn.body.removed, true);
  const restored = await call('/tools?tested=true');
  assert.equal(restored.body.total, 1, 'the claim this section found is the only one left');
  assert.deepEqual(restored.body.tools.map((t) => t.id), [attestedTool.id]);
  console.log(`[§5i] the catalog could be asked WHICH ROWS CARRY A CLAIM: tested=true was one row with total=1 and tested=false the other three (the claimed row absent from that half), an absent flag was null and all four, every answer echoed the flag and every row kept its seven fields · it COMPOSED with the other tri-state filter in all four directions on real state — the claimed set and the departing set intersected in exactly one row (claimed+departing 1, claimed+live 1, unclaimed+departing 0, unclaimed+live 2) — and with owner and q, each narrowing the window AND the count · the bound was PROVED rather than hidden: a claim on m.tool's contract survived an update that MOVED that contract, so tested=true still answered rows while the attestation read stillCurrent=false, and a withdrawal took the row back out — the filter names the CLAIM; the verdict stays one door away`);
  // ── §5j the contract a consumer PINNED can be read back by the pin it holds ─────────────────────
  // A pin is what a consumer keeps; the revision number is this service's bookkeeping. This door turns the
  // pin back into the bytes, and says in the same answer whether those bytes are still served today.
  const AT_FIELDS = ['contractSha256', 'current', 'inputSchema', 'recordedAt', 'revision', 'summary', 'toolId'].sort();
  const pinnedTool = await call('/tools/by-name/z.tool');
  assert.equal(pinnedTool.status, 200, `the section needs z.tool, got ${pinnedTool.status}: ${pinnedTool.text}`);
  const zHistory = await call(`/tools/${q(pinnedTool.body.id)}/revisions`);
  assert.equal(zHistory.status, 200, `the section needs z.tool's history, got ${zHistory.status}: ${zHistory.text}`);
  assert.equal(zHistory.body.total, 2, 'the declaration has two recorded contracts');
  const [newestRev, firstRev] = zHistory.body.revisions;
  assert.equal(newestRev.revision, 2);
  assert.equal(firstRev.revision, 1);

  const atNewest = await call(`/tools/${q(pinnedTool.body.id)}/at?pin=${newestRev.contractSha256}`);
  assert.equal(atNewest.status, 200, `a pin from the history must be readable, got ${atNewest.status}: ${atNewest.text}`);
  assert.deepEqual(Object.keys(atNewest.body).sort(), AT_FIELDS,
      `the answer carries exactly its seven fields: ${atNewest.text}`);
  assert.equal(atNewest.body.toolId, pinnedTool.body.id);
  assert.equal(atNewest.body.revision, 2);
  assert.equal(atNewest.body.contractSha256, newestRev.contractSha256);
  assert.equal(atNewest.body.current, true, 'the newest recorded contract is the one being served');
  assert.equal(atNewest.body.summary, newestRev.summary);
  assert.deepEqual(atNewest.body.inputSchema, newestRev.inputSchema);
  assert.equal(atNewest.body.recordedAt, newestRev.recordedAt);

  const atFirst = await call(`/tools/${q(pinnedTool.body.id)}/at?pin=${firstRev.contractSha256}`);
  assert.equal(atFirst.status, 200);
  assert.equal(atFirst.body.revision, 1);
  assert.equal(atFirst.body.current, false, 'an older contract reads back, and says it is not current');
  assert.equal(atFirst.body.summary, firstRev.summary);
  assert.deepEqual(atFirst.body.inputSchema, firstRev.inputSchema);
  assert.notEqual(atFirst.body.contractSha256, atNewest.body.contractSha256);

  // The refusals, each by name: no pin, a malformed pin, a pin in the wrong case, a pin this history never
  // held, and an unknown id — the id settled BEFORE the pin is judged, so a missing row is not reported as a
  // bad parameter.
  const noPinAt = await call(`/tools/${q(pinnedTool.body.id)}/at`);
  assert.equal(noPinAt.status, 400, `a read by pin must name one, got ${noPinAt.status}`);
  assert.match(noPinAt.body.message, /must name/);
  const atShortPin = await call(`/tools/${q(pinnedTool.body.id)}/at?pin=abc`);
  assert.equal(atShortPin.status, 400);
  assert.match(atShortPin.body.message, /64/);
  const atUpperPinValue = 'A' + newestRev.contractSha256.slice(1);
  const atUpperPin = await call(`/tools/${q(pinnedTool.body.id)}/at?pin=${atUpperPinValue}`);
  assert.equal(atUpperPin.status, 400, 'the pin is case-sensitive: uppercase hex is a different value');
  assert.match(atUpperPin.body.message, /lowercase/);
  const atNeverHeld = await call(`/tools/${q(pinnedTool.body.id)}/at?pin=${'0'.repeat(64)}`);
  assert.equal(atNeverHeld.status, 404);
  assert.equal(atNeverHeld.body.error, 'unknown-pin');
  const unknownToolAtPin = await call('/tools/tool-that-never-existed/at?pin=nonsense');
  assert.equal(unknownToolAtPin.status, 404);
  assert.equal(unknownToolAtPin.body.error, 'unknown-tool',
      'the id is settled first: a missing row is not blamed on the pin');

  // Retention removes the row that carried the old pin, and the same read becomes a 404 — the honest answer,
  // because those bytes are no longer stored anywhere. The CURRENT contract still reads back.
  const atPrune = await call(`/tools/${q(pinnedTool.body.id)}/revisions?owner=${q(owner)}&before=2`, { method: 'DELETE' });
  assert.equal(atPrune.status, 200, `the owner's prune must be 200, got ${atPrune.status}: ${atPrune.text}`);
  assert.equal(atPrune.body.pruned, 1);
  const atAfterPrune = await call(`/tools/${q(pinnedTool.body.id)}/at?pin=${firstRev.contractSha256}`);
  assert.equal(atAfterPrune.status, 404, 'a pruned contract is no longer readable by its pin');
  assert.equal(atAfterPrune.body.error, 'unknown-pin');
  assert.match(atAfterPrune.body.message, /retention/);
  const atNewestStill = await call(`/tools/${q(pinnedTool.body.id)}/at?pin=${newestRev.contractSha256}`);
  assert.equal(atNewestStill.status, 200, 'the newest contract is never pruned');
  assert.equal(atNewestStill.body.current, true);
  console.log(`[§5j] a consumer's PIN was a way back to the bytes: the newest recorded contract read back field for field (summary, schema, instant) with current=true, the older one with current=false — seven fields each · no pin was 400 "must name", abc was 400 naming 64, the same pin in UPPERCASE was 400 (a pin is case-sensitive), a well-formed pin the history never held was 404 unknown-pin, and an unknown id was 404 unknown-tool even with a malformed pin, because the id is settled first · after the owner pruned revision 1, the OLD pin answered 404 unknown-pin (the bytes are no longer stored anywhere) while the newest contract still read back as current — retention removes the way back, and says so`);
  // ── §6 — the declarations and their canonical schemas survive a RESTART ────────────────────────
  const beforeRestart = await call('/tools');
  assert.equal(beforeRestart.body.total, 4);
  const beforeById = new Map(beforeRestart.body.tools.map((t) => [t.id, t]));
  // The journal is read HERE too, because §5h wrote entries after §5e read the whole feed.
  const journalBeforeRestart = await call('/tools/changes?limit=3');

  await stopService(serviceProcess);
  serviceProcess = null;
  const restarted = await startService();
  serviceProcess = restarted.child;
  apiPort = restarted.port;
  base = `http://127.0.0.1:${apiPort}`;

  const afterRestart = await call('/tools');
  assert.equal(afterRestart.status, 200);
  assert.equal(afterRestart.body.total, 4, 'the same four rows are served by a second JVM');
  assert.deepEqual(afterRestart.body.tools.map((t) => t.name), ['big.tool', 'm.tool', 'weather.lookup', 'z.tool']);
  for (const tool of afterRestart.body.tools) {
    const before = beforeById.get(tool.id);
    assert.ok(before, `the restarted service answers a row the first one declared: ${tool.id}`);
    assert.deepEqual(tool, before, 'a declaration survives the process that wrote it, field for field');
  }
  const schemaAfterRestart = afterRestart.body.tools.find((t) => t.name === 'weather.lookup').inputSchema;
  assert.deepEqual(schemaAfterRestart, updatedSchema, 'the re-declared weather.lookup carries the UPDATED schema, not the removed row\'s');

  // The HISTORY survives the process too: a revision recorded by the first JVM is readable from the second.
  // The JOURNAL survives the process too: it is rows, and a poller's cursor means nothing if a restart
  // forgets where the entries were.
  const journalAfterRestart = await call('/tools/changes?limit=3');
  assert.deepEqual(journalAfterRestart.body.changes, journalBeforeRestart.body.changes,
      'the journal survives the process that wrote it, entry for entry');
  assert.equal(journalAfterRestart.body.total, journalBeforeRestart.body.total,
      'and the second JVM counts the same entries the first one wrote');

  // The CLAIM survives too, and the second JVM recomputes stillCurrent from the row it has, not from a flag.
  const claimAfterRestart = await call(`/tools/${q(attestedTool.id)}/attestation`);
  assert.equal(claimAfterRestart.status, 200, 'the attestation survives the process that wrote it');
  assert.equal(claimAfterRestart.body.contractSha256, pinAfterMove);
  assert.equal(claimAfterRestart.body.note, 'kept for §6');
  assert.equal(claimAfterRestart.body.stillCurrent, true,
      'a second JVM compares the pin against the contract it serves and finds it current');
  const historyAfterRestart = await call(`/tools/${q(reclaimed.body.id)}/revisions`);
  assert.equal(historyAfterRestart.status, 200);
  assert.equal(historyAfterRestart.body.total, 2, 'both recorded revisions survive the restart');
  assert.deepEqual(historyAfterRestart.body.revisions.map((r) => r.revision), [2, 1]);
  assert.equal(historyAfterRestart.body.revisions[0].summary, 'The same name, a better sentence.');
  assert.equal(historyAfterRestart.body.revisions[1].summary, 'The same name, a new row.');
  // The pin is derived from those bytes, so it is the SAME 64 characters in a process that never saw them
  // written: a pin is a property of the contract, not of the JVM that answered it.
  assert.deepEqual(
      historyAfterRestart.body.revisions.map((r) => r.contractSha256),
      history.body.revisions.map((r) => r.contractSha256),
      'a second JVM must recompute both revision pins identically');
  assert.equal(historyAfterRestart.body.revisions[1].contractSha256, birthPin,
      'the pin a consumer recorded before the update still names revision 1 after a restart');
  const revisionColumns = (await sql("select column_name from information_schema.columns where table_name = 'tool_revision' order by column_name")).split('\n').filter(Boolean);
  assert.deepEqual(revisionColumns, ['input_schema', 'recorded_at', 'revision', 'summary', 'tool_id'],
      `tool_revision must have exactly the five recorded fields, got ${JSON.stringify(revisionColumns)}`);

  // The CHAIN of holders survives the process too, and still names the holder the last handover left.
  const chainAfterRestart = await call(`/tools/${q(handedOverId)}/ownership`);
  assert.equal(chainAfterRestart.status, 200);
  assert.equal(chainAfterRestart.body.total, 2, 'both handovers survive the restart');
  assert.deepEqual(chainAfterRestart.body.transfers.map((t) => t.transfer), [2, 1]);
  assert.equal(chainAfterRestart.body.owner, other, 'the restarted service still names the current holder');
  assert.deepEqual(chainAfterRestart.body.transfers, chainAfter.body.transfers,
      'the chain reads back field for field');
  const ownershipColumns = (await sql("select column_name from information_schema.columns where table_name = 'tool_ownership' order by column_name")).split('\n').filter(Boolean);
  assert.deepEqual(ownershipColumns, ['from_owner', 'to_owner', 'tool_id', 'transfer', 'transferred_at'],
      `tool_ownership must have exactly the five handover columns, got ${JSON.stringify(ownershipColumns)}`);

  // A deprecation survives the process too, and the public list still names the tool.
  const deprecationAfterRestart = await call(`/tools/${q(reclaimed.body.id)}/deprecation`);
  assert.equal(deprecationAfterRestart.status, 200, `the deprecation must survive the restart, got ${deprecationAfterRestart.status}: ${deprecationAfterRestart.text}`);
  assert.equal(deprecationAfterRestart.body.message, 'Kept for the restart.');
  assert.equal(deprecationAfterRestart.body.replacement, 'm.tool');
  const deprecatedAfterRestart = await call('/tools/deprecations');
  assert.equal(deprecatedAfterRestart.body.total, 1);
  assert.equal(deprecatedAfterRestart.body.deprecations[0].name, 'weather.lookup');
  const deprecationColumns = (await sql("select column_name from information_schema.columns where table_name = 'tool_deprecation' order by column_name")).split('\n').filter(Boolean);
  assert.deepEqual(deprecationColumns, ['deprecated_at', 'message', 'replacement_name', 'tool_id'],
      `tool_deprecation must have exactly the four warning fields, got ${JSON.stringify(deprecationColumns)}`);

  // The DATABASE itself: six declaration columns, and NO place to put a capability.
  const changeColumns = (await sql("select column_name from information_schema.columns where table_name = 'tool_change' order by column_name")).split('\n').filter(Boolean);
  assert.deepEqual(changeColumns, ['changed_at', 'kind', 'name', 'revision', 'seq', 'tool_id'],
      `tool_change must have exactly the six journal columns, got ${JSON.stringify(changeColumns)}`);  const columns = (await sql("select column_name from information_schema.columns where table_name = 'tool_entry' order by column_name")).split('\n').filter(Boolean);
  assert.deepEqual(columns, ['created_at', 'input_schema', 'name', 'owner_account_id', 'summary', 'tool_id'],
      `tool_entry must have exactly the six declaration columns, got ${JSON.stringify(columns)}`);
  const count = await sql('select count(*) from tool_entry');
  assert.equal(count, '4', 'psql counts the four rows the API answers');
  console.log(`[§6] a second JVM served the same four rows, field for field, with the re-declared name carrying the schema its owner updated · its history still answered BOTH revisions newest first · information_schema shows tool_entry has exactly ${columns.length} columns (${columns.join(', ')}) and tool_revision exactly ${revisionColumns.length} (${revisionColumns.join(', ')}) and tool_deprecation exactly ${deprecationColumns.length} (${deprecationColumns.join(', ')}) and tool_ownership exactly ${ownershipColumns.length} (${ownershipColumns.join(', ')}) and tool_change exactly ${changeColumns.length} (${changeColumns.join(', ')}) and tool_attestation exactly ${attestationColumns.length} (${attestationColumns.join(', ')}), and the two handovers read back field for field, with nowhere to store a URL, a command or an invocation — the pin added no column, because it is recomputed from the bytes those columns already hold — and both revision pins came back the SAME 64 characters, so the registry declares and does not execute`);

  // ── §7 teardown ────────────────────────────────────────────────────────────────────────────────
  await stopService(serviceProcess);
  const rm = await run('docker', ['rm', '-f', DB_CONTAINER]);
  assert.equal(rm.code, 0, `could not remove the throwaway database: ${rm.stderr}`);
  dbStarted = false;
  const goneContainer = await run('docker', ['ps', '-a', '--filter', `name=^/${DB_CONTAINER}$`, '--format', '{{.Names}}']);
  assert.equal(goneContainer.stdout.trim(), '', `the throwaway container is still listed: ${goneContainer.stdout.trim()}`);
  console.log(`[§7] teardown: the service process is gone and the throwaway container ${DB_CONTAINER} is removed`);

  console.log(`\n[summary] M10 v571–v588: services/nexus-api BUILT and RAN against a real PostgreSQL · three tools declared with owners, names and summaries trimmed and the schema stored as canonical compact JSON read back with psql · a GLOBAL duplicate name refused with the id that holds it · uppercase, one-character, spaced and 65-character names, a blank and a 281-character summary, a string schema, a missing schema and a malformed body all refused BY NAME · the byte bound accepted at exactly 8192 and refused at 8193 · a declaration wrote NO audit entry and knocked on nothing · the catalog answered by NAME with the owner filter narrowing both the window and the whole count, the cap and floor reported in the answer, and no capability field in any row · a stranger's removal was 403 with the row intact, an unknown id was 200 removed:false, and the owner's removal deleted the row and its history before psql read zero · the freed NAME was declared again as a NEW row under another owner · a tool was READ BY ID and BY ITS GLOBAL NAME in one request, with an uppercase name refused at 400 and a well-formed name holding nothing refused at 404 unknown-tool · a stranger's update was 403, a missing owner 400, an unknown id 404 and an over-bound schema 400, all four writing nothing, while the owner's update replaced the summary and the canonical schema and left the name, id, owner and creation instant in place · the history answered TWO revisions newest first with the birth sentence and schema intact, its window reached revision 1 with total=2 beside it, its cap and floor were reported, a since asked only for what came after a revision the caller held (one row with total=1; empty with total=0 past the newest; both from 0; a page inside the narrowed set keeping the narrowed count; a negative since refused at 400 while a floored offset was not), an unknown id was 404, and psql read both rows · the catalog search answered a name match and a summary match, ignored case, narrowed BOTH window and count alongside the owner filter, paged with total=3, treated % and _ literally (0 matches), echoed a blank term as null, and refused a 101-character term at 400 · deprecation was a separate resource: its reads and writes were owner-gated, a live tool answered 404 not-deprecated, the declaration kept its seven fields, the public list named the tool beside its message and hint, re-deprecating replaced one row, withdrawal removed it, and one deprecation survived the restart · the catalog named the rows that are GOING AWAY: deprecated=true was one row with total=1 while deprecated=false was the other three, an absent flag was null and all four, the flag composed with owner (1 and 0) and with the search (1 and 0 for the departing set), every answer echoed the flag and every row kept its seven fields · retention was the OWNER's and named its bound: six refusals (no owner, no bound, a bound of 0, a stranger, a bound past the newest revision, an unknown id) removed nothing, the prune of bound 2 answered before/pruned/remaining 2/1/2 and left a history starting AT revision 2 (psql read min(revision)=2), the same bound again answered 0, and a pin held across the prune still answered 304 because removing old revisions does not touch the contract · a declaration CHANGED HANDS and stayed the same declaration: a stranger's handover, a missing owner, an unknown id, a transfer to the CURRENT holder and one with no target were each refused while psql read the same holder and an EMPTY handover table; the owner's handover answered 200 with the same id, name, creation instant, schema and PIN (so a pin held across it still answered 304), the former owner's update, deprecation and removal were each 403 with the row and its deprecation untouched, the chain of holders named the current holder and appended the way back as transfer 2 with its window, cap, floor and count, an unknown id's chain was 404, and psql read both handovers in order beside a history still at TWO revisions and an empty audit trail — a handover is not a revision · the registry kept a JOURNAL of what HAPPENED beside what IS: GET /tools/changes answered every entry OLDEST first from a cursor the answer echoed, walked forward seven at a time across the WHOLE feed with a narrowing count on every page and no entry twice, six kinds appeared (declared, updated, transferred, deprecated, undeprecated, removed) and only the two that wrote a contract named a revision, a REMOVED declaration was still nameable with the name it had while its row was 404 and tool_entry held zero, a retention prune wrote no entry, an already-gone removal wrote nothing, and a negative cursor was a 400 naming "0 or more" while a limit of 500 was reported as 100 and an offset of -3 as 0 · the feed could be WATCHED rather than re-read: kind=removed answered exactly the removals the whole feed carried with their own count, toolId answered a removed tool's whole life in order, the two composed, a blank filter read as absent, an unknown kind was a 400 naming the whole eight-word vocabulary while a capitalised one was a 400 naming itself, an id the journal never saw was an empty feed rather than a 404, and pg_indexes showed kind+seq and tool_id+seq indexes behind the narrowings · a LIST of ids was ONE request that answered in the order asked (a duplicate collapsed, each row field for field what /tools serves), NAMED the id that held nothing, put a REMOVED declaration in missing rather than failing the request, and refused a batch of blanks (400 "at least one id") and of 51 ids (400 naming the cap of 50) · an owner's claim about a contract was its own resource, bound to the PIN it tested: seven refusals left the table empty (nothing claimed 404 not-attested, a foreign pin 409 naming the served one, a malformed pin 400, no pin 400, no owner 400, a stranger 403, an unknown id 404), the accepted claim was five fields with its note trimmed and stillCurrent true while the declaration stayed SEVEN, an update moved the contract and the claim did NOT follow (it still named the old pin, stillCurrent false, note intact), the old pin was then a 409 naming the new one, re-attesting the served pin REPLACED the one row, the journal named both claims and the withdrawal that deleted the only row which could have said it, and one claim survived the restart with the second JVM recomputing stillCurrent · the catalog could be asked WHICH ROWS CARRY A CLAIM: tested=true was the attested row and tested=false the other three, an absent flag was null and all four, the four directions composed with the deprecated flag answered 1/1/0/2 on real state, owner and q narrowed BOTH the window and the count, and the bound was proved rather than hidden — a claim survived an update that MOVED its contract, so tested=true still named the row while stillCurrent read false, and withdrawing the claim took it back out · the contract a consumer PINNED could be read back BY THAT PIN: the newest revision field for field with current=true and the older with current=false, a missing pin and a short one and an UPPERCASE one each 400 by name, a well-formed pin the history never held 404 unknown-pin, an unknown id 404 unknown-tool even with a malformed pin, and after retention pruned the old revision its pin became 404 while the current contract still read back · and a second JVM served the same four rows and both revisions, field for field, the whole declaration carried a 64-hex PIN recomputed by the proof from the summary and schema the answer itself carried, delivered as a strong ETag and honoured as a 304 with no body on both read doors (with * matching and an unknown id still 404), the owner's update changed the pin while revision 1 kept the old one so a held pin answered 200, both revision pins were recomputed identically after the restart, the chain of two handovers read back field for field, and information_schema showed six declaration columns, five revision columns, four deprecation columns and five handover columns — no column for the pin — with nowhere to store an endpoint, a command or an invocation`);
  rmSync(BUILD_DIR, { recursive: true, force: true });
  console.log('[m10-tool-proof] ALL ASSERTIONS PASSED (a real registry: declared rows, canonical schemas, a global name, an owner\'s update and removal, a recorded revision history that an update cannot erase, a direct read by the name every agent shares, a deprecation that is its own resource with its own public list, a catalog search whose wildcards are literal, and no capability this build does not have)');
} finally {
  if (serviceProcess && serviceProcess.exitCode === null) {
    await stopService(serviceProcess);
  }
  if (dbStarted) await run('docker', ['rm', '-f', DB_CONTAINER]);
}
