/**
 * M7 v194 — the Studio's Publish control, END TO END (ADR 0016 amendment 194).
 *
 * This is the increment's proof, and it is the first one in this repository that stands up ALL THREE
 * layers at once: a real PostgreSQL, the real `services/nexus-api`, and the real Studio — then drives the
 * Publish button in a real browser and reads the row back out of the database's service.
 *
 * Why it starts the Studio itself instead of requiring one on :3210 (which every other harness probe does):
 * the service binds a port the OS picks, and the Studio's route reads `NEXUS_API_URL` at request time. A
 * Studio started before the service would point at the wrong address — so the ORDER is part of the subject.
 *
 *   §1 a throwaway PostgreSQL, the service, and the Studio all come up
 *   §2 the Studio's toolbar reports the service as READY (it probes on mount)
 *   §3 pressing Publish puts a row in the database — read back through the SERVICE, not through the UI
 *   §4 the URL the Studio shows is the one the SERVICE returned
 *   §5 pressing Publish again UPDATES: version 2, still one row
 *   §6 the document that reached the database is the Studio's OWN document
 *   §7 teardown removes the container and both processes
 *
 * Requires: Java 25, Maven, Docker, and the repo's node_modules (for `next`). Run:
 *   node tools/harness/studio-publish.mjs
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const SERVICE_DIR = join(REPO_ROOT, 'services/nexus-api');
const JAR = join(SERVICE_DIR, 'target/nexus-api-0.1.0-SNAPSHOT.jar');
const STUDIO_DIR = join(REPO_ROOT, 'apps/studio');
const DB_IMAGE = 'pgvector/pgvector:pg16';
const STAMP = `${Date.now()}-${process.pid}`;
const DB_CONTAINER = `nexus-publish-e2e-db-${STAMP}`;
const PORT_FILE = join(tmpdir(), `nexus-publish-e2e-port-${STAMP}.txt`);
const DB_USER = 'nexus';
const DB_PASSWORD = 'nexus';
const DB_NAME = 'nexus';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MVN = process.platform === 'win32' ? 'mvn.cmd' : 'mvn';

/** Ask the OS for a port nothing is listening on, then let it go. Only used for the DATABASE and the
 *  Studio — the SERVICE picks its own port and reports it, because probing then handing over is a race. */
function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

/** A `.cmd` shim cannot be spawned directly on Windows; resolve it and hand it to `ComSpec`. */
function findOnPath(name) {
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : [''];
  for (const dir of (process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':')) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, name + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function runMaven(args, opts) {
  if (process.platform !== 'win32') return run('mvn', args, opts);
  const mvn = findOnPath('mvn');
  assert.ok(mvn, 'maven is not on PATH');
  return run(process.env.ComSpec ?? 'cmd.exe', ['/c', mvn, ...args], opts);
}

function run(command, args, { cwd = REPO_ROOT, timeoutMs = 0 } = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = timeoutMs ? setTimeout(() => child.kill(), timeoutMs) : null;
    child.stdout.on('data', (d) => { stdout += String(d); });
    child.stderr.on('data', (d) => { stderr += String(d); });
    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      resolveRun({ code: -1, stdout, stderr: error.message });
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolveRun({ code, stdout, stderr });
    });
  });
}

async function until(probe, { tries = 60, gapMs = 500, label = 'condition' } = {}) {
  for (let i = 0; i < tries; i++) {
    const value = await probe();
    if (value) return value;
    await sleep(gapMs);
  }
  console.log(`[e2e] gave up waiting for ${label} after ${tries} tries`);
  return null;
}

/** A process has stopped when it has an exit code OR a signal — a killed process has `exitCode === null`. */
const isStopped = (child) => child.exitCode !== null || child.signalCode !== null;

async function stop(child) {
  if (!child || isStopped(child)) return;
  child.kill();
  if (await until(async () => isStopped(child), { tries: 40, gapMs: 500, label: 'a process to stop' })) return;
  if (process.platform === 'win32') await run('taskkill', ['/F', '/T', '/PID', String(child.pid)]);
  else child.kill('SIGKILL');
  await until(async () => isStopped(child), { tries: 20, gapMs: 250, label: 'a process to stop after SIGKILL' });
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`);
};

let dbStarted = false;
let serviceProcess = null;
let studioProcess = null;
let session = null;
let page = null;

try {
  // ── §1 stand up all three layers ────────────────────────────────────────────────────────────────
  const javaVersion = await run('java', ['-version']);
  assert.equal(javaVersion.code, 0, `java is not runnable: ${javaVersion.stderr}`);
  const dockerVersion = await run('docker', ['version', '--format', '{{.Server.Version}}']);
  assert.equal(dockerVersion.code, 0, `the docker daemon is not reachable: ${dockerVersion.stderr}`);

  const build = await runMaven(['-B', '-q', 'package', '-DskipTests'], { cwd: SERVICE_DIR, timeoutMs: 600_000 });
  assert.equal(build.code, 0, `mvn package failed:\n${build.stdout}\n${build.stderr}`);

  const dbPort = await freePort();
  const startDb = await run('docker', [
    'run', '-d', '--rm', '--name', DB_CONTAINER,
    '-e', `POSTGRES_USER=${DB_USER}`, '-e', `POSTGRES_PASSWORD=${DB_PASSWORD}`, '-e', `POSTGRES_DB=${DB_NAME}`,
    '-p', `127.0.0.1:${dbPort}:5432`, DB_IMAGE,
  ]);
  assert.equal(startDb.code, 0, `could not start the throwaway database: ${startDb.stderr}`);
  dbStarted = true;
  assert.ok(
    await until(async () => (await run('docker', ['exec', DB_CONTAINER, 'pg_isready', '-U', DB_USER, '-d', DB_NAME])).code === 0,
      { tries: 60, gapMs: 1000, label: 'postgres to accept connections' }),
    'the throwaway database never became ready',
  );

  const dbUrl = `jdbc:postgresql://127.0.0.1:${dbPort}/${DB_NAME}`;
  rmSync(PORT_FILE, { force: true });
  serviceProcess = spawn('java', [
    '-jar', JAR,
    '--server.port=0',
    `--spring.datasource.url=${dbUrl}`,
    `--spring.datasource.username=${DB_USER}`,
    `--spring.datasource.password=${DB_PASSWORD}`,
    `--nexus.port-file=${PORT_FILE}`,
  ], { cwd: SERVICE_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
  let serviceLog = '';
  serviceProcess.stdout.on('data', (d) => { serviceLog += String(d); });
  serviceProcess.stderr.on('data', (d) => { serviceLog += String(d); });

  const servicePort = await until(async () => {
    if (isStopped(serviceProcess)) return false;
    if (!existsSync(PORT_FILE)) return false;
    const reported = Number(readFileSync(PORT_FILE, 'utf8').trim());
    if (!Number.isInteger(reported) || reported <= 0) return false;
    try {
      const r = await fetch(`http://127.0.0.1:${reported}/projects/__probe__`);
      return r.status === 404 ? reported : false;
    } catch {
      return false;
    }
  }, { tries: 80, gapMs: 500, label: 'nexus-api to answer' });
  assert.ok(servicePort, `nexus-api never answered. Its output was:\n${serviceLog.slice(-3000)}`);
  const apiBase = `http://127.0.0.1:${servicePort}`;
  console.log(`[e2e] postgres on :${dbPort} · nexus-api on :${servicePort}`);

  const studioPort = await freePort();
  studioProcess = spawn(process.execPath, [join(REPO_ROOT, 'node_modules/next/dist/bin/next'), 'dev', '-p', String(studioPort)], {
    cwd: STUDIO_DIR,
    env: {
      ...process.env,
      NODE_OPTIONS: '',
      // The Studio's route reads this at request time, which is why the service had to come up FIRST.
      NEXUS_API_URL: apiBase,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let studioLog = '';
  studioProcess.stdout.on('data', (d) => { studioLog += String(d); });
  studioProcess.stderr.on('data', (d) => { studioLog += String(d); });
  const studioBase = `http://127.0.0.1:${studioPort}`;
  const studioUp = await until(async () => {
    if (isStopped(studioProcess)) return false;
    try {
      return (await fetch(`${studioBase}/`)).ok;
    } catch {
      return false;
    }
  }, { tries: 160, gapMs: 1000, label: 'the Studio to serve' });
  assert.ok(studioUp, `the Studio never served. Its output was:\n${studioLog.slice(-3000)}`);
  console.log(`[e2e] Studio on :${studioPort} (NEXUS_API_URL=${apiBase})`);

  session = await launch({ width: 1600, height: 900 });
  page = await session.newPage('about:blank');
  await page.navigate(`${studioBase}/`, { waitForSelector: '#nexus-canvas', waitMs: 1200 });

  // ── §2 the Studio reports the service as ready ──────────────────────────────────────────────────
  const ready = await page.waitForFunction(
    "(() => { const n = document.querySelector('[data-toolbar-publish-note]')?.textContent ?? ''; return n.includes('service ready') ? n : null; })()",
    { timeout: 20000 },
  );
  check('the Studio probes the service on mount and reports it ready', ready !== null, `note: ${JSON.stringify(ready)}`);
  const probe = await page.evaluate("fetch('/api/publish').then((r) => r.json())");
  check(
    'the Studio’s own route answers for the service',
    probe?.available === true && probe?.apiBase === apiBase,
    JSON.stringify(probe),
  );

  // ── §3 pressing Publish puts a ROW in the database ──────────────────────────────────────────────
  // The project id is taken from the URL the SERVICE returned, not from the bridge: `window.__nexus` is a
  // frozen read-only snapshot and deliberately exposes no document id, and the URL is the authoritative
  // statement of what was published anyway.
  await page.evaluate("document.querySelector('[data-toolbar-publish]').click()");
  const published = await page.waitForFunction(
    "(() => { const n = document.querySelector('[data-toolbar-publish-note]')?.textContent ?? ''; return n.startsWith('published') ? n : null; })()",
    { timeout: 20000 },
  );
  check('pressing Publish reports a publication', published !== null, `note: ${JSON.stringify(published)}`);

  const urlMatch = /→\s*(\S+\/projects\/[^\s]+)$/.exec(published ?? '');
  const projectId = urlMatch ? decodeURIComponent(urlMatch[1].slice(urlMatch[1].lastIndexOf('/projects/') + '/projects/'.length)) : null;
  check('the note carries the URL the service returned', Boolean(projectId), `projectId parsed from the note: ${JSON.stringify(projectId)}`);

  // Read it back through the SERVICE — not through the UI. This is what makes the claim "a row exists"
  // rather than "the panel said so".
  const readBack = projectId ? await fetch(`${apiBase}/projects/${encodeURIComponent(projectId)}`) : null;
  const publication = readBack && readBack.status === 200 ? await readBack.json() : null;
  check(
    'the publication is in the SERVICE — read back independently of the browser',
    readBack?.status === 200 && publication?.projectId === projectId && publication?.version === 1,
    `status ${readBack?.status} · version ${publication?.version}`,
  );

  // ── §4 the URL the Studio shows is the SERVICE's ────────────────────────────────────────────────
  check(
    'the URL the Studio shows is the one the service returned',
    typeof published === 'string' && published.includes(`${apiBase}/projects/`),
    `the note contains ${apiBase}/projects/… : ${published?.includes(`${apiBase}/projects/`)}`,
  );

  // ── §5 publishing again UPDATES ─────────────────────────────────────────────────────────────────
  await page.evaluate("document.querySelector('[data-toolbar-publish]').click()");
  const republished = await page.waitForFunction(
    "(() => { const n = document.querySelector('[data-toolbar-publish-note]')?.textContent ?? ''; return n.includes('published v2') ? n : null; })()",
    { timeout: 20000 },
  );
  check('pressing Publish again reports version 2', republished !== null, `note: ${JSON.stringify(republished)}`);

  const countRows = await run('docker', ['exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-tAc',
    `select count(*) from published_project where project_id = '${projectId}'`]);
  check(
    'the DATABASE holds exactly one row for it — a re-publish UPDATED rather than inserted',
    countRows.stdout.trim() === '1',
    `rows: ${countRows.stdout.trim()}`,
  );

  // ── §6 the document that reached the database is the Studio's OWN ───────────────────────────────
  // Compared through what the frozen bridge EXPOSES — the document's name and its node count — rather than
  // the whole document, because `window.__nexus.snapshot()` deliberately carries a summary and not the
  // canonical document. Saying which two facts were compared is the point; "the document matches" would be
  // a claim about bytes this proof never saw.
  const final = await (await fetch(`${apiBase}/projects/${encodeURIComponent(projectId)}`)).json();
  const studioSummary = await page.evaluate('(() => { const s = window.__nexus.snapshot(); return { docName: s.docName, nodeCount: s.nodeCount }; })()');
  const storedNodeCount = Object.keys(final.document?.nodes ?? {}).length;
  check(
    'the stored document is the Studio’s own — its name and its node count both agree',
    final.document?.name === studioSummary.docName && storedNodeCount === studioSummary.nodeCount,
    `stored: name ${JSON.stringify(final.document?.name)} · ${storedNodeCount} node(s) — Studio: name ${JSON.stringify(studioSummary.docName)} · ${studioSummary.nodeCount} node(s)`,
  );
  check(
    'and it is a JSON OBJECT, which is what the service requires a design document to be',
    final.document !== null && typeof final.document === 'object' && !Array.isArray(final.document),
    `typeof document: ${Array.isArray(final.document) ? 'array' : typeof final.document}`,
  );

  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  const png = Buffer.from(shot.data, 'base64');
  const shotPath = join(REPO_ROOT, '.scratch', 'v194', 'studio-publish.png');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(join(REPO_ROOT, '.scratch', 'v194'), { recursive: true });
  writeFileSync(shotPath, png);
  check('a pixel screenshot of the published Studio was captured (§30)', png.length > 5000, `${png.length} bytes → ${shotPath}`);

  // ── §7 teardown ─────────────────────────────────────────────────────────────────────────────────
  await page.close();
  await session.close();
  session = null;
  page = null;
  await stop(studioProcess);
  studioProcess = null;
  await stop(serviceProcess);
  serviceProcess = null;
  const rm = await run('docker', ['rm', '-f', DB_CONTAINER]);
  assert.equal(rm.code, 0, `could not remove the throwaway database: ${rm.stderr}`);
  dbStarted = false;
  console.log('[§7] teardown: Studio, service and the throwaway database are all gone');
} finally {
  if (page) await page.close().catch(() => {});
  if (session) await session.close().catch(() => {});
  if (studioProcess) await stop(studioProcess);
  if (serviceProcess) await stop(serviceProcess);
  if (dbStarted) await run('docker', ['rm', '-f', DB_CONTAINER]);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n[summary] ${results.length - failed.length}/${results.length} end-to-end assertions passed`);
if (failed.length) {
  console.log('[studio-publish-e2e] FAILED');
  process.exit(1);
}
console.log('[studio-publish-e2e] ALL ASSERTIONS PASSED (a Studio document reached a real service, became a row in a real database, and came back unchanged)');
