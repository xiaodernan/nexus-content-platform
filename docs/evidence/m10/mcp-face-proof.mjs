// NEXUS M10 (docs/evidence/m10) — THE MCP FACE: a registry's declarations, advertised over JSON-RPC 2.0, with
// `tools/call` refused BY NAME. This proof builds the service, starts it against a throwaway PostgreSQL,
// declares tools over the REST door, and then speaks MCP to the same registry over POST /mcp.
//
// M10 names four things: API, MCP, tool registry, webhooks. ADR 0021 built webhooks, ADR 0022 the registry,
// and ADR 0023/0024 gave the registry details, an update and a history. This is the fourth: the face that
// lets an agent DISCOVER the registry. It deliberately stops at discovery — `tools/call` is not implemented
// and the proof asserts the refusal, because a silent omission would look like a bug and an implementation
// would be execution, which ADR 0022 says this build never does.
//
// What it proves, clause by clause:
//   §0 the tools this proof needs (Java 25, Docker) are present BEFORE anything is started;
//   §1 the service BUILDS and STARTS against a real PostgreSQL and answers on the port it announced;
//   §2 two tools are declared over the REST door — the MCP face has no separate registration path;
//   §3 `initialize` names the protocol, the ONE capability (`tools.listChanged=false`) and the refusal the
//      server carries; `ping` answers `{}`; a notification is accepted with 202 and no body;
//   §4 `tools/list` advertises the declarations name-ascending, each with exactly name/description/
//      inputSchema, no url/command/execution field, and the description/schema the REST catalog serves;
//   §5 the cursor reaches the second page and then stops: 101 declarations answer 100 + `nextCursor`, then
//      the last one with no cursor;
//   §6 `tools/call` is refused `-32601`; an unknown method, a batch, a wrong version and a missing method are
//      `-32600`; a malformed body is Spring's 400; an ordinary method sent as a notification is `-32600`; and
//      psql reads ZERO audit entries, ZERO webhook deliveries and ZERO tables named `mcp%` — the face stores
//      nothing;
//   §7 a SECOND JVM answers the same `initialize` and the same pages, because the face is a read of the
//      registry, not a session;
//   §8 teardown.
//
// Requires: Java 25, Maven, and a running Docker daemon. Run:  node docs/evidence/m10/mcp-face-proof.mjs
//
// sweep-budget-ms: 900000
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
import { existsSync, cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { javaRecordFields } from '../../m9/wire-fields.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// THREE levels up: docs/evidence/m10/mcp-face-proof.mjs -> the repository root.
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SERVICE_DIR = path.join(REPO_ROOT, 'services/nexus-api');
const DB_IMAGE = 'pgvector/pgvector:pg16';
const STAMP = `${Date.now()}-${process.pid}`;
const BUILD_DIR = path.join(tmpdir(), `nexus-mcp-proof-build-${STAMP}`);
const JAR = path.join(BUILD_DIR, 'target/nexus-api-0.1.0-SNAPSHOT.jar');

const DB_CONTAINER = `nexus-api-mcp-db-${STAMP}`;
const DB_NAME = 'nexus';
const DB_USER = 'nexus';
const DB_PASSWORD = 'nexus';
const PORT_FILE = path.join(tmpdir(), `nexus-api-mcp-port-${STAMP}.txt`);

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

/** `mvn` is a `.cmd` shim on Windows, which Node refuses to spawn directly. */
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

/** Async `spawn`, never `spawnSync` — the synchronous family measured EBUSY under concurrency here. */
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

/**
 * The descriptor's own shape, pinned: a field added here is a capability the advertisement would start
 * claiming. The registry has no url, command or execution counter, so the MCP row must not invent one.
 */
const DESCRIPTOR_FIELDS = ['description', 'inputSchema', 'name'].sort();

// §0a static wire contract: the descriptor and the capability are read from the Java source, so a field
// added to either fails here before a database or a jar is built. The advertised protocol string is checked
// the same way — the proof asserts '2025-06-18' below, and the DTO must be the place that says it.
{
  const MCP_DTO = path.join(SERVICE_DIR, 'src/main/java/dev/nexus/api/mcp/McpDtos.java');
  const descriptor = javaRecordFields(MCP_DTO, 'ToolDescriptor').map((f) => f.name).sort();
  assert.deepEqual(descriptor, DESCRIPTOR_FIELDS, `McpDtos.ToolDescriptor wire fields ${JSON.stringify(descriptor)} disagree with the pinned ${JSON.stringify(DESCRIPTOR_FIELDS)}`);
  const capability = javaRecordFields(MCP_DTO, 'ToolsCapability').map((f) => f.name);
  assert.deepEqual(capability, ['listChanged'], `McpDtos.ToolsCapability must advertise exactly listChanged, got ${JSON.stringify(capability)}`);
  const src = readFileSync(MCP_DTO, 'utf8');
  const protocol = /PROTOCOL_VERSION\s*=\s*"([^"]+)"/.exec(src);
  assert.ok(protocol, `McpDtos.PROTOCOL_VERSION was not found in ${MCP_DTO} — the protocol this proof asserts has MOVED`);
  assert.equal(protocol[1], '2025-06-18', `McpDtos.PROTOCOL_VERSION is ${protocol[1]}, but §3 asserts 2025-06-18`);
  console.log('[§0a] static wire contract: ToolDescriptor ({name,description,inputSchema}) and ToolsCapability ({listChanged}) match the source · PROTOCOL_VERSION is 2025-06-18');
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

  /** One JSON-RPC request to the MCP door. */
  const rpc = (method, params = null, id = 1) => postJson('/mcp', { jsonrpc: '2.0', id, method, params });

  // ── §2 declarations: the registry is filled over the REST door, not a second path ────────────────
  const owner = `acct-mcp-owner-${STAMP}`;
  const schemaA = { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] };
  const alpha = await postJson('/tools', {
    owner, name: 'alpha.tool', summary: 'Looks up the weather for one city.', inputSchema: schemaA,
  });
  assert.equal(alpha.status, 201, `a declaration must be 201, got ${alpha.status}: ${alpha.text}`);
  const zulu = await postJson('/tools', {
    owner, name: 'zulu.tool', summary: 'Writes nothing at all.', inputSchema: { type: 'object' },
  });
  assert.equal(zulu.status, 201, `a second declaration must be 201, got ${zulu.status}: ${zulu.text}`);
  const restCatalog = await call('/tools');
  assert.equal(restCatalog.body.total, 2, `the REST catalog must see both declarations, got ${restCatalog.text}`);
  console.log('[§2] two tools declared over REST (alpha.tool and zulu.tool) — the MCP face has no registration path of its own');

  // ── §3 initialize, ping, notification: what the server says about itself ────────────────────────
  const init = await rpc('initialize', {}, 7);
  assert.equal(init.status, 200, `initialize must answer 200, got ${init.status}: ${init.text}`);
  assert.equal(init.body.jsonrpc, '2.0');
  assert.equal(init.body.id, 7, 'the answer echoes the id exactly');
  assert.equal(init.body.result.protocolVersion, '2025-06-18');
  assert.deepEqual(init.body.result.capabilities, { tools: { listChanged: false } },
      `the only advertised capability is a static tool list, got ${JSON.stringify(init.body.result.capabilities)}`);
  assert.equal(init.body.result.serverInfo.name, 'nexus-api');
  assert.match(init.body.result.instructions, /does not execute tools/);
  assert.equal(init.body.error, undefined, 'initialize is not an error answer');

  const ping = await rpc('ping', null, 'p1');
  assert.equal(ping.status, 200);
  assert.equal(ping.body.id, 'p1');
  assert.deepEqual(ping.body.result, {}, 'ping answers an empty object and nothing else');

  const notification = await call('/mcp', {
    method: 'POST', headers: asJson,
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
  assert.equal(notification.status, 202, `a notification must be 202, got ${notification.status}: ${notification.text}`);
  assert.equal(notification.text, '', 'a notification has no body to read');
  console.log('[§3] initialize named protocol 2025-06-18, ONE capability (tools.listChanged=false) and the refusal it carries · ping answered {} · a notification was 202 with no body');

  // ── §4 tools/list: the declarations, and no capability the registry does not have ───────────────
  const list = await rpc('tools/list', null, 2);
  assert.equal(list.status, 200, `tools/list must answer 200, got ${list.status}: ${list.text}`);
  assert.equal(list.body.result.tools.length, 2);
  assert.deepEqual(list.body.result.tools.map((t) => t.name), ['alpha.tool', 'zulu.tool'],
      `tools/list is name-ascending like the catalog, got ${JSON.stringify(list.body.result.tools.map((t) => t.name))}`);
  assert.equal(list.body.result.nextCursor, undefined, 'two of two declarations is the whole list');
  const alphaRow = list.body.result.tools[0];
  assert.deepEqual(Object.keys(alphaRow).sort(), DESCRIPTOR_FIELDS,
      `an advertised tool carries exactly name/description/inputSchema, got ${JSON.stringify(Object.keys(alphaRow))}`);
  assert.equal(alphaRow.description, restCatalog.body.tools[0].summary,
      'the description is the SAME sentence the REST catalog serves');
  assert.deepEqual(alphaRow.inputSchema, schemaA,
      'the advertised schema is the declaration stored over REST, parsed back');
  for (const forbidden of ['url', 'endpoint', 'command', 'invocationCount', 'execution']) {
    assert.equal(alphaRow[forbidden], undefined, `the advertisement must not carry ${forbidden}`);
  }
  console.log(`[§4] tools/list advertised ${list.body.result.tools.length} declarations name-ascending, each exactly ${DESCRIPTOR_FIELDS.join('/')} — the description and schema are the ones the REST catalog serves, with no url, command or execution field`);

  // ── §5 the cursor reaches the second page and then stops ────────────────────────────────────────
  for (let i = 0; i < 99; i++) {
    const name = `tool.${String(i).padStart(3, '0')}`;
    const declared = await postJson('/tools', {
      owner, name, summary: `Generated tool ${i}.`, inputSchema: { type: 'object' },
    });
    assert.equal(declared.status, 201, `generated declaration ${name} must be 201, got ${declared.status}: ${declared.text}`);
  }
  const pageOne = await rpc('tools/list', null, 3);
  assert.equal(pageOne.body.result.tools.length, 100, 'the first page is the registry cap, 100');
  assert.equal(pageOne.body.result.nextCursor, '100', 'the cursor names the offset of the next page');
  assert.equal(pageOne.body.result.tools[0].name, 'alpha.tool');
  const pageTwo = await rpc('tools/list', { cursor: pageOne.body.result.nextCursor }, 4);
  assert.equal(pageTwo.body.result.tools.length, 1, `the second page holds the one row left, got ${pageTwo.body.result.tools.length}`);
  assert.equal(pageTwo.body.result.tools[0].name, 'zulu.tool');
  assert.equal(pageTwo.body.result.nextCursor, undefined, 'the last page carries no cursor');
  const catalogueTotal = await call('/tools?limit=1');
  assert.equal(catalogueTotal.body.total, 101, 'the REST catalog counts the same 101 declarations');
  console.log('[§5] 101 declarations answered 100 + nextCursor "100", then the LAST one (zulu.tool) with no cursor · the REST catalog counted the same 101');

  // ── §6 the refusals: execution by name, and every malformed request by its code ──────────────────
  const callTool = await rpc('tools/call', { name: 'alpha.tool', arguments: { city: 'Paris' } }, 5);
  assert.equal(callTool.status, 200, 'a refused call is a protocol answer at HTTP 200');
  assert.equal(callTool.body.result, undefined);
  assert.equal(callTool.body.error.code, -32601);
  assert.match(callTool.body.error.message, /does not execute/);
  assert.equal(callTool.body.id, 5, 'the refusal still echoes the id that caused it');

  const unknown = await rpc('resources/list', null, 6);
  assert.equal(unknown.body.error.code, -32601);
  assert.match(unknown.body.error.message, /resources\/list/);

  const batch = await call('/mcp', { method: 'POST', headers: asJson, body: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'ping' }]) });
  assert.equal(batch.status, 200);
  assert.equal(batch.body.error.code, -32600);
  assert.equal(batch.body.id, null, 'an answer about a batch has no legal id, so it is null');

  const wrongVersion = await call('/mcp', { method: 'POST', headers: asJson, body: JSON.stringify({ jsonrpc: '1.0', id: 1, method: 'ping' }) });
  assert.equal(wrongVersion.body.error.code, -32600);
  assert.match(wrongVersion.body.error.message, /2\.0/);

  const noMethod = await call('/mcp', { method: 'POST', headers: asJson, body: JSON.stringify({ jsonrpc: '2.0', id: 1 }) });
  assert.equal(noMethod.body.error.code, -32600);
  assert.match(noMethod.body.error.message, /method/);

  const malformed = await call('/mcp', { method: 'POST', headers: asJson, body: '{"jsonrpc":' });
  assert.equal(malformed.status, 400, `a body that is not JSON fails before the protocol, got ${malformed.status}: ${malformed.text}`);

  const ordinaryAsNotification = await call('/mcp', { method: 'POST', headers: asJson, body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list' }) });
  assert.equal(ordinaryAsNotification.status, 200);
  assert.equal(ordinaryAsNotification.body.error.code, -32600);
  assert.equal(ordinaryAsNotification.body.id, null);

  // A refusal is not a write: the registry's own counters stay empty, and the face has no table at all.
  assert.equal(await sql('select count(*) from audit_entry'), '0', 'the MCP face records no trail fact');
  assert.equal(await sql('select count(*) from webhook_delivery'), '0', 'the MCP face knocks on nothing');
  assert.equal(await sql("select count(*) from information_schema.tables where table_name like 'mcp%'"), '0',
      'the MCP face stores no session, cursor or message');
  console.log(`[§6] tools/call was refused -32601 (the registry does not execute) · resources/list -32601 · a batch / a wrong version / a missing method / an ordinary method sent as a notification all -32600 · a malformed body was HTTP 400 · psql read ZERO audit entries, ZERO webhook deliveries and ZERO mcp% tables`);

  // ── §7 a second JVM answers the same questions: the face is a read, not a session ────────────────
  await stopService(serviceProcess);
  const restarted = await startService();
  serviceProcess = restarted.child;
  apiPort = restarted.port;
  base = `http://127.0.0.1:${apiPort}`;
  const initAfterRestart = await rpc('initialize', {}, 8);
  assert.equal(initAfterRestart.status, 200);
  assert.equal(initAfterRestart.body.result.protocolVersion, '2025-06-18');
  const listAfterRestart = await rpc('tools/list', null, 9);
  assert.equal(listAfterRestart.body.result.tools.length, 100);
  assert.equal(listAfterRestart.body.result.nextCursor, '100');
  const secondPageAfterRestart = await rpc('tools/list', { cursor: '100' }, 10);
  assert.equal(secondPageAfterRestart.body.result.tools.length, 1);
  assert.equal(secondPageAfterRestart.body.result.tools[0].name, 'zulu.tool');
  const callAfterRestart = await rpc('tools/call', { name: 'alpha.tool' }, 11);
  assert.equal(callAfterRestart.body.error.code, -32601, 'execution is refused by every process, not by a lucky one');
  console.log('[§7] a second JVM answered the same initialize, the same 100+1 pages and the SAME -32601 refusal for tools/call — the face reads the registry and keeps no session');

  // ── §8 teardown ────────────────────────────────────────────────────────────────────────────────
  await stopService(serviceProcess);
  const rm = await run('docker', ['rm', '-f', DB_CONTAINER]);
  assert.equal(rm.code, 0, `could not remove the throwaway database: ${rm.stderr}`);
  dbStarted = false;
  const goneContainer = await run('docker', ['ps', '-a', '--filter', `name=^/${DB_CONTAINER}$`, '--format', '{{.Names}}']);
  assert.equal(goneContainer.stdout.trim(), '', `the throwaway container is still listed: ${goneContainer.stdout.trim()}`);
  console.log(`[§8] teardown: the service process is gone and the throwaway container ${DB_CONTAINER} is removed`);

  console.log('\n[summary] M10: services/nexus-api BUILT and RAN against a real PostgreSQL · tools were declared over REST and advertised over POST /mcp · initialize named protocol 2025-06-18 with ONE capability (tools.listChanged=false) · tools/list served the same name-ascending declarations with name/description/inputSchema only and no url, command or execution field · 101 declarations answered 100 + cursor "100", then the last row with no cursor · tools/call was refused -32601 by name, resources/list -32601, and a batch / wrong version / missing method / ordinary-method-as-notification all -32600 · a malformed body was HTTP 400 · no audit entry, no webhook delivery and no mcp% table was written · and a second JVM answered the same pages and the same refusal, because the face is a read of the registry, not a session');
  rmSync(BUILD_DIR, { recursive: true, force: true });
  console.log('[m10-mcp-proof] ALL ASSERTIONS PASSED (a real MCP face: declarations advertised over JSON-RPC 2.0, pagination with a cursor that stops, and execution refused by name — the registry declares, and this build still does not execute)');
} finally {
  if (serviceProcess && serviceProcess.exitCode === null) {
    await stopService(serviceProcess);
  }
  if (dbStarted) await run('docker', ['rm', '-f', DB_CONTAINER]);
}
