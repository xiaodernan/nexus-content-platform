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
//      limit capped / offset floored, and every answer carrying no url / command / invocation field;
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
const TOOL_FIELDS = ['createdAt', 'id', 'inputSchema', 'name', 'owner', 'summary'].sort();
const LIST_FIELDS = ['limit', 'offset', 'owner', 'tools', 'total'].sort();

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
    return { status: response.status, body, text };
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

  const emptyCatalog = await call('/tools');
  assert.equal(emptyCatalog.status, 200, `an empty registry is still a catalog, got ${emptyCatalog.status}`);
  assert.equal(emptyCatalog.body.total, 0);
  assert.equal(emptyCatalog.body.tools.length, 0);
  assert.equal(emptyCatalog.body.owner, null, 'no filter is echoed as null, not as an empty account');
  assert.deepEqual(Object.keys(emptyCatalog.body).sort(), LIST_FIELDS, `the catalog carries exactly its five fields: ${emptyCatalog.text}`);

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
  assert.deepEqual(Object.keys(declared.body).sort(), TOOL_FIELDS, `a tool carries exactly its six fields: ${declared.text}`);
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
  assert.deepEqual(Object.keys(byName.body).sort(), TOOL_FIELDS, `a tool by name carries exactly its six fields: ${byName.text}`);
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
    assert.deepEqual(Object.keys(tool).sort(), TOOL_FIELDS, `a catalog row carries exactly its six fields: ${JSON.stringify(tool)}`);
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
  console.log(`[§3] the whole catalog answered four rows by NAME (big.tool < m.tool < weather.lookup < z.tool) · owner=${other} narrowed both the window and the count to its own two · limit=1&offset=1 answered exactly m.tool with total=4 beside it · limit=500&offset=-10 reported 100 and 0 · no row carried a url, command or invocation field`);

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
  assert.deepEqual(Object.keys(readById.body).sort(), TOOL_FIELDS, `a tool carries exactly its six fields: ${readById.text}`);

  const unknownRead = await call('/tools/tool-that-never-existed');
  assert.equal(unknownRead.status, 404, `an id that names nothing must be 404, got ${unknownRead.status}: ${unknownRead.text}`);
  assert.equal(unknownRead.body.error, 'unknown-tool');

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
  assert.deepEqual(Object.keys(history.body).sort(), ['limit', 'offset', 'revisions', 'toolId', 'total'],
      `a history window carries exactly its five fields: ${history.text}`);
  assert.equal(history.body.toolId, reclaimed.body.id);
  assert.equal(history.body.total, 2, `two accepted writes must make two revisions, got ${history.body.total}: ${history.text}`);
  assert.equal(history.body.limit, 20);
  assert.equal(history.body.offset, 0);
  assert.deepEqual(history.body.revisions.map((r) => r.revision), [2, 1], 'the history is newest first');
  assert.deepEqual(Object.keys(history.body.revisions[0]).sort(), ['inputSchema', 'recordedAt', 'revision', 'summary'],
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
      `deprecating a tool must not grow the declaration's six fields: ${declarationAfterDeprecation.text}`);
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
  console.log(`[§5] a tool was read by ID (six fields) and an unknown id was 404 unknown-tool · a stranger's update was 403, a missing owner 400, an unknown id 404 and an 8193-byte schema 400, and psql read the untouched sentence after all four · the owner's update replaced the summary and stored the schema as ${storedUpdated.length} canonical bytes while the name, id, owner and creation instant stayed · the history answered TWO revisions newest first (revision 1 keeps the birth sentence and schema, revision 2 the replacement), its window reached revision 1 with total=2 beside it, limit=500 reported 100 and offset=-3 reported 0, an unknown id was 404, and psql read both rows with audit_entry still EMPTY · removal in §4 took its declaration's history with it · deprecation: a live tool's read was 404 not-deprecated, a stranger 403, a missing owner 400, an unknown id 404, and blank/281-byte messages, a malformed replacement and a self-replacement were all refused while writing nothing; the owner's deprecation stored the trimmed message and hint while the declaration's six fields stayed six, the public list carried the tool NAME beside it, re-deprecating replaced the one row, withdrawal answered removed:true then removed:false, and psql read zero · one deprecation was left on record for §6`);

  // ── §6 the declarations and their canonical schemas survive a RESTART ──────────────────────────
  const beforeRestart = await call('/tools');
  assert.equal(beforeRestart.body.total, 4);
  const beforeById = new Map(beforeRestart.body.tools.map((t) => [t.id, t]));

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
  const historyAfterRestart = await call(`/tools/${q(reclaimed.body.id)}/revisions`);
  assert.equal(historyAfterRestart.status, 200);
  assert.equal(historyAfterRestart.body.total, 2, 'both recorded revisions survive the restart');
  assert.deepEqual(historyAfterRestart.body.revisions.map((r) => r.revision), [2, 1]);
  assert.equal(historyAfterRestart.body.revisions[0].summary, 'The same name, a better sentence.');
  assert.equal(historyAfterRestart.body.revisions[1].summary, 'The same name, a new row.');
  const revisionColumns = (await sql("select column_name from information_schema.columns where table_name = 'tool_revision' order by column_name")).split('\n').filter(Boolean);
  assert.deepEqual(revisionColumns, ['input_schema', 'recorded_at', 'revision', 'summary', 'tool_id'],
      `tool_revision must have exactly the five recorded fields, got ${JSON.stringify(revisionColumns)}`);

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
  const columns = (await sql("select column_name from information_schema.columns where table_name = 'tool_entry' order by column_name")).split('\n').filter(Boolean);
  assert.deepEqual(columns, ['created_at', 'input_schema', 'name', 'owner_account_id', 'summary', 'tool_id'],
      `tool_entry must have exactly the six declaration columns, got ${JSON.stringify(columns)}`);
  const count = await sql('select count(*) from tool_entry');
  assert.equal(count, '4', 'psql counts the four rows the API answers');
  console.log(`[§6] a second JVM served the same four rows, field for field, with the re-declared name carrying the schema its owner updated · its history still answered BOTH revisions newest first · information_schema shows tool_entry has exactly ${columns.length} columns (${columns.join(', ')}) and tool_revision exactly ${revisionColumns.length} (${revisionColumns.join(', ')}) and tool_deprecation exactly ${deprecationColumns.length} (${deprecationColumns.join(', ')}), with nowhere to store a URL, a command or an invocation — the registry declares and does not execute`);

  // ── §7 teardown ────────────────────────────────────────────────────────────────────────────────
  await stopService(serviceProcess);
  const rm = await run('docker', ['rm', '-f', DB_CONTAINER]);
  assert.equal(rm.code, 0, `could not remove the throwaway database: ${rm.stderr}`);
  dbStarted = false;
  const goneContainer = await run('docker', ['ps', '-a', '--filter', `name=^/${DB_CONTAINER}$`, '--format', '{{.Names}}']);
  assert.equal(goneContainer.stdout.trim(), '', `the throwaway container is still listed: ${goneContainer.stdout.trim()}`);
  console.log(`[§7] teardown: the service process is gone and the throwaway container ${DB_CONTAINER} is removed`);

  console.log(`\n[summary] M10 v571–v575: services/nexus-api BUILT and RAN against a real PostgreSQL · three tools declared with owners, names and summaries trimmed and the schema stored as canonical compact JSON read back with psql · a GLOBAL duplicate name refused with the id that holds it · uppercase, one-character, spaced and 65-character names, a blank and a 281-character summary, a string schema, a missing schema and a malformed body all refused BY NAME · the byte bound accepted at exactly 8192 and refused at 8193 · a declaration wrote NO audit entry and knocked on nothing · the catalog answered by NAME with the owner filter narrowing both the window and the whole count, the cap and floor reported in the answer, and no capability field in any row · a stranger's removal was 403 with the row intact, an unknown id was 200 removed:false, and the owner's removal deleted the row and its history before psql read zero · the freed NAME was declared again as a NEW row under another owner · a tool was READ BY ID and BY ITS GLOBAL NAME in one request, with an uppercase name refused at 400 and a well-formed name holding nothing refused at 404 unknown-tool · a stranger's update was 403, a missing owner 400, an unknown id 404 and an over-bound schema 400, all four writing nothing, while the owner's update replaced the summary and the canonical schema and left the name, id, owner and creation instant in place · the history answered TWO revisions newest first with the birth sentence and schema intact, its window reached revision 1 with total=2 beside it, its cap and floor were reported, an unknown id was 404, and psql read both rows · deprecation was a separate resource: its reads and writes were owner-gated, a live tool answered 404 not-deprecated, the declaration kept its six fields, the public list named the tool beside its message and hint, re-deprecating replaced one row, withdrawal removed it, and one deprecation survived the restart · and a second JVM served the same four rows and both revisions, field for field, while information_schema showed six declaration columns, five revision columns and four deprecation columns with nowhere to store an endpoint, a command or an invocation`);
  rmSync(BUILD_DIR, { recursive: true, force: true });
  console.log('[m10-tool-proof] ALL ASSERTIONS PASSED (a real registry: declared rows, canonical schemas, a global name, an owner\'s update and removal, a recorded revision history that an update cannot erase, a direct read by the name every agent shares, a deprecation that is its own resource with its own public list, and no capability this build does not have)');
} finally {
  if (serviceProcess && serviceProcess.exitCode === null) {
    await stopService(serviceProcess);
  }
  if (dbStarted) await run('docker', ['rm', '-f', DB_CONTAINER]);
}
