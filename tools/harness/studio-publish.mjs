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
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';
import { sweepLeftoverDatabases } from './leakSweep.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const SERVICE_DIR = join(REPO_ROOT, 'services/nexus-api');
const STUDIO_DIR = join(REPO_ROOT, 'apps/studio');
const DB_IMAGE = 'pgvector/pgvector:pg16';
const STAMP = `${Date.now()}-${process.pid}`;
/**
 * v281 — the build happens in an ISOLATED COPY of the service, not in the working tree.
 *
 * Why: `mvn package` ends with spring-boot's `repackage`, which RENAMES the jar it just built. On
 * Windows a jar that a RUNNING service has open cannot be renamed — and a developer (or a parallel lane)
 * running `java -jar target/nexus-api-0.1.0-SNAPSHOT.jar` holds exactly that file open. The symptom is a
 * build that fails for a reason that has nothing to do with the code:
 *
 *   Unable to rename '…\nexus-api-0.1.0-SNAPSHOT.jar' to '…\nexus-api-0.1.0-SNAPSHOT.jar.original'
 *
 * Building a copy sidesteps it entirely, and it is also more honest: the harness runs the jar it just
 * BUILT rather than whichever one happens to be lying in the working tree. The service has no relative
 * paths and its only resource (application.yml) travels inside the jar, so a copy of `pom.xml` + `src` is
 * a complete build.
 */
const BUILD_DIR = join(tmpdir(), `nexus-publish-e2e-build-${STAMP}`);
const JAR = join(BUILD_DIR, 'target/nexus-api-0.1.0-SNAPSHOT.jar');

const DB_CONTAINER = `nexus-publish-e2e-db-${STAMP}`;
const PORT_FILE = join(tmpdir(), `nexus-publish-e2e-port-${STAMP}.txt`);
const DB_USER = 'nexus';
const DB_PASSWORD = 'nexus';
const DB_NAME = 'nexus';

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

/**
 * v294 — wait until a page has HYDRATED.
 *
 * The server-rendered HTML is on the page long before React has attached its handlers, and a click on a
 * button whose handler does not exist yet does NOTHING — silently, with no error and no event. A harness
 * that clicks into a half-hydrated page is testing a page that is not there.
 *
 * The Studio installs its bridge (`window.__nexus`) from a mount effect, so the bridge’s presence is the
 * honest signal that the app is alive — not the presence of the canvas, which is in the server-rendered
 * HTML from the first byte.
 */
async function waitForHydration(page, label) {
  const ready = await until(
    async () => (await page.evaluate('!!window.__nexus')) === true,
    { tries: 120, gapMs: 500, label: label ?? 'the page to hydrate' },
  );
  assert.ok(ready, `the page never hydrated (${label ?? 'the page'}) — its handlers were never attached`);
}

/**
 * v294 — open the account panel, IF it is not already open.
 *
 * The account panel TOGGLES: the toolbar button flips `showAccount`, and creating an account LEAVES the
 * panel open. So a harness that always clicks the button closes a panel that was already open, and the
 * next step then looks for an input that is not on the page. The state is read first, and the button is
 * only clicked when the panel needs opening.
 */
async function openAccountPanel(page, label) {
  const open = await page.evaluate("document.querySelectorAll('[data-toolbar-account]').length");
  if (open > 0) return;
  await page.evaluate(`document.querySelector('button[title="Account"]').click()`);
  const ready = await until(
    async () => (await page.evaluate("document.querySelectorAll('[data-toolbar-account]').length")) === 1,
    { tries: 30, gapMs: 300, label: label ?? 'the account panel to open' },
  );
  assert.ok(ready, `the account panel did not open (${label ?? 'the account panel'})`);
}

/**
 * v294 — set the device’s account, the way a person would.
 *
 * The account panel shows ONE of two forms: the ACCOUNT state (with a sign-out button) when an account is
 * set, and the CREATE form when it is not. So a harness that wants a different account has to sign the
 * old one out first — otherwise it looks for a create button that the panel is not showing, and clicks
 * null.
 */
async function signInAs(page, handle, label) {
  const hasAccount = await page.evaluate("!!localStorage.getItem('nexus-current-account')");
  if (hasAccount) {
    await openAccountPanel(page, `${label}: the account panel`);
    await page.evaluate("document.querySelector('[data-account-signout]')?.click()");
    const out = await until(
      async () => (await page.evaluate("localStorage.getItem('nexus-current-account')")) === null,
      { tries: 20, gapMs: 200, label: `${label}: the account to be signed out` },
    );
    assert.ok(out, `the account was not signed out (${label})`);
  }
  await openAccountPanel(page, `${label}: the account panel`);
  await page.type('[data-account-handle-input]', handle);
  await page.evaluate("document.querySelector('[data-account-create]').click()");
  const set = await until(
    async () => (await page.evaluate("localStorage.getItem('nexus-current-account')")) !== null,
    { tries: 20, gapMs: 200, label: `${label}: the account to be set` },
  );
  assert.ok(set, `the account was not set (${label})`);
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

// v294 — the servers' own output, declared OUTSIDE the try so the failure path (which lives after it)
// can print it. Declared inside, they were scoped away and the feature printed nothing.
let serviceLog = '';
let studioLog = '';

try {
  // ── §1 stand up all three layers ────────────────────────────────────────────────────────────────
  const javaVersion = await run('java', ['-version']);
  assert.equal(javaVersion.code, 0, `java is not runnable: ${javaVersion.stderr}`);
  const dockerVersion = await run('docker', ['version', '--format', '{{.Server.Version}}']);
  assert.equal(dockerVersion.code, 0, `the docker daemon is not reachable: ${dockerVersion.stderr}`);

  // ── §1a retire what a PREVIOUS run left RUNNING (M7 v222) ───────────────────────────────────────
  // This proof's own `finally` removes its container on every exit it can see, but it cannot see a HARD KILL,
  // and `docker run --rm` only removes a container that STOPS. Measured 2026-10-10: one had been Up 2 days,
  // holding a published port and a PostgreSQL instance. The sweep runs BEFORE this run takes a port, so a
  // corpse cannot make this run's port choice look busy. It retires by OWNER (the name carries the pid), so a
  // concurrent run's container is left alone — see `leakSweep.mjs` for the decision table.
  const sweep = await sweepLeftoverDatabases(run, { log: (line) => console.log(line) });
  if (!sweep.listed) {
    console.log(`[§1a] could not list leftovers (${sweep.reason}); continuing — a sweep is a courtesy, not a gate`);
  } else {
    console.log(`[§1a] leftovers: ${sweep.seen} named container(s), ${sweep.retired.length} retired`);
  }

  // v281 — build a COPY, so a running service holding the working tree's jar cannot fail this build.
  rmSync(BUILD_DIR, { recursive: true, force: true });
  mkdirSync(BUILD_DIR, { recursive: true });
  cpSync(join(SERVICE_DIR, 'pom.xml'), join(BUILD_DIR, 'pom.xml'));
  cpSync(join(SERVICE_DIR, 'src'), join(BUILD_DIR, 'src'), { recursive: true });
  const build = await runMaven(['-B', '-q', 'package', '-DskipTests'], { cwd: BUILD_DIR, timeoutMs: 600_000 });
  assert.equal(build.code, 0, `mvn package failed:\n${build.stdout}\n${build.stderr}`);

  const dbPort = await freePort();
  const startDb = await run('docker', [
    'run', '-d', '--rm', '--name', DB_CONTAINER,
    '-e', `POSTGRES_USER=${DB_USER}`, '-e', `POSTGRES_PASSWORD=${DB_PASSWORD}`, '-e', `POSTGRES_DB=${DB_NAME}`,
    '-p', `127.0.0.1:${dbPort}:5432`, DB_IMAGE,
  ]);
  assert.equal(startDb.code, 0, `could not start the throwaway database: ${startDb.stderr}`);
  dbStarted = true;
  // Ready means TWO things. `pg_isready` runs INSIDE the container, so it proves postgres is up but says
  // nothing about the HOST port mapping — and it is the host mapping the service connects through. A `-p`
  // that lost a race for the port passes the inside check and then leaves the service hanging on a datasource
  // it can never reach, which reads as "the service is broken". (Found the hard way in `publish-proof.mjs`,
  // whose first version had this same hole; this probe had it too.)
  const inside = await until(
    async () => (await run('docker', ['exec', DB_CONTAINER, 'pg_isready', '-U', DB_USER, '-d', DB_NAME])).code === 0,
    { tries: 60, gapMs: 1000, label: 'postgres to accept connections inside its container' },
  );
  assert.ok(inside, 'the throwaway database never became ready');
  const reachableFromHost = await until(() => canConnect(dbPort), { tries: 30, gapMs: 500, label: `the database to be reachable on 127.0.0.1:${dbPort}` });
  assert.ok(
    reachableFromHost,
    `the database answers inside its container but 127.0.0.1:${dbPort} does not accept a connection — the published port is not usable from this host`,
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
  ], { cwd: BUILD_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
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
  }, { tries: SERVICE_START_TRIES, gapMs: 1000, label: 'nexus-api to answer' });
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
  await waitForHydration(page, 'the Studio to hydrate');

  // ── §2 the Studio reports the service as ready ──────────────────────────────────────────────────
  // Waited for with a REPORTING failure rather than `waitForFunction`, whose timeout says only that a
  // condition was not met. The Studio compiles its routes on demand, so the first request to `/api/publish`
  // in a dev server can take a while — and if the note says something else entirely, that is the fact worth
  // printing.
  const ready = await until(
    async () => {
      const note = await page.evaluate("document.querySelector('[data-toolbar-publish-note]')?.textContent ?? null");
      return note && note.includes('service ready') ? note : false;
    },
    { tries: 200, gapMs: 500, label: 'the Studio to report the service ready' },
  );
  const noteNow = await page.evaluate("document.querySelector('[data-toolbar-publish-note]')?.textContent ?? null");
  check('the Studio probes the service on mount and reports it ready', ready !== null, `note: ${JSON.stringify(noteNow)}`);
  const probe = await page.evaluate("fetch('/api/publish').then((r) => r.json())");
  check(
    'the Studio’s own route answers for the service',
    probe?.available === true && probe?.apiBase === apiBase,
    JSON.stringify(probe),
  );

  // ── §3 DRAW SOMETHING FIRST, so the artifact has content to render ──────────────────────────────
  // A fresh Studio document is a root and an empty page, so publishing it and finding an empty stage would
  // prove the plumbing and nothing about the rendering. One rectangle is enough to make the artifact page's
  // "the document is drawn" a claim about a drawing.
  const nodesBefore = await page.evaluate('window.__nexus.snapshot().nodeCount');
  const drew = await page.evaluate(
    "(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('title') || '').startsWith('Rectangle')); if (!b) return false; b.click(); return true; })()",
  );
  assert.ok(drew, 'the toolbar exposes the Rectangle tool');
  const canvasBox = await page.evaluate(
    "(() => { const r = document.getElementById('nexus-canvas').getBoundingClientRect(); return { x: Math.round(r.left + 90), y: Math.round(r.top + 90) }; })()",
  );
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: canvasBox.x, y: canvasBox.y, button: 'left', buttons: 1, clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: canvasBox.x + 170, y: canvasBox.y + 110, button: 'left', buttons: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: canvasBox.x + 170, y: canvasBox.y + 110, button: 'left', buttons: 0, clickCount: 1 });
  const nodesAfter = await page.waitForFunction(
    `(() => { const n = window.__nexus.snapshot().nodeCount; return n > ${nodesBefore} ? n : null; })()`,
    { timeout: 10000 },
  );
  check('the document has something in it before it is published', nodesAfter !== null, `nodes ${nodesBefore} → ${nodesAfter}`);

  // ── §3.5 v266: set an ACCOUNT first, so the publication can be OWNED ─────────────────────────────
  // The account is set BEFORE the publish, because the claim rides on the publish: a publication made with
  // no account is ownerless, and an ownerless publication cannot show a byline, cannot refuse a take-down,
  // and cannot be taken over — the whole ownership story is only reachable with an account in place.
  const accountHandle = 'ada';
  // The account record is read in §4.5 too, so it is declared out here rather than inside the block below.
  let accountRecord = null;
  {
    await openAccountPanel(page, 'the account panel to open');
    check('the account panel opens on the toolbar control', true, 'the account face is reachable from the product');
    await page.type('[data-account-handle-input]', accountHandle);
    await page.evaluate("document.querySelector('[data-account-create]').click()");
    const record = await until(
      async () => {
        const raw = await page.evaluate("localStorage.getItem('nexus-current-account')");
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
      },
      { tries: 20, gapMs: 200, label: 'the account record to land in storage' },
    );
    accountRecord = record;
    check(
      'the account is set on this device — unsigned-local, no signed-in badge anywhere',
      record?.handle === accountHandle && record?.assurance === 'unsigned-local' && typeof record?.id === 'string',
      `record: ${JSON.stringify(record)}`,
    );
    const badgeish = /signed\s*in/i.test(await page.evaluate('document.body.innerText'));
    check('and the page carries no "signed in" badge (ADR 0018)', !badgeish, badgeish ? 'the page says "signed in"' : 'no badge');
    await page.evaluate("document.querySelector('[data-account-close]').click()");
  }

  // ── §4 pressing Publish puts a ROW in the database ──────────────────────────────────────────────
  // The project id is taken from the URL the SERVICE returned, not from the bridge: `window.__nexus` is a
  // frozen read-only snapshot and deliberately exposes no document id, and the URL is the authoritative
  // statement of what was published anyway.
  await page.evaluate("document.querySelector('[data-toolbar-publish]').click()");
  const published = await page.waitForFunction(
    "(() => { const n = document.querySelector('[data-toolbar-publish-note]')?.textContent ?? ''; return n.startsWith('published') ? n : null; })()",
    { timeout: 60000 },
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

  // ── §4.5 v266: the publication is OWNED — the service recorded the claim ───────────────────────
  // This is the whole point of the account: the publish carried this device's claim, so the row names an
  // owner. Read through the SERVICE, independently of the browser, so the claim is a fact about the row
  // and not about what the panel said.
  check(
    'the SERVICE recorded the OWNER of the publication — the claim rode on the publish',
    publication?.owner?.accountId === accountRecord?.id
      && publication?.owner?.handle === accountHandle
      && publication?.owner?.assurance === 'unsigned-local',
    `owner: ${JSON.stringify(publication?.owner)}`,
  );
  // The claim's instant is the moment of the PUBLISH, not the moment the account was created — the first
  // version of this assertion compared the two and was wrong. What matters is the UNIT: the value must be a
  // number in the client's milliseconds, and it must read as a real instant. Read as epoch SECONDS it would
  // be the same digits but the year 55840, and a service that answered an ISO string would fail the type.
  const claimedAt = publication?.owner?.claimedAt;
  const claimedAsDate = typeof claimedAt === 'number' ? new Date(claimedAt) : null;
  check(
    "and the claim's INSTANT is the client's own millisecond value — a real instant, not the same number read as seconds",
    typeof claimedAt === 'number'
      && claimedAsDate.getUTCFullYear() >= 2020
      && Math.abs(Date.now() - claimedAt) < 60 * 60 * 1000,
    `claimedAt ${JSON.stringify(claimedAt)} reads as ${claimedAsDate ? claimedAsDate.toISOString() : 'not a number'}`,
  );

  // ── §5 the URL the Studio shows is the SERVICE's ────────────────────────────────────────────────
  check(
    'the URL the Studio shows is the one the service returned',
    typeof published === 'string' && published.includes(`${apiBase}/projects/`),
    `the note contains ${apiBase}/projects/… : ${published?.includes(`${apiBase}/projects/`)}`,
  );

  // ── §6 publishing again UPDATES ─────────────────────────────────────────────────────────────────
  await page.evaluate("document.querySelector('[data-toolbar-publish]').click()");
  const republished = await page.waitForFunction(
    "(() => { const n = document.querySelector('[data-toolbar-publish-note]')?.textContent ?? ''; return n.includes('published v2') ? n : null; })()",
    { timeout: 60000 },
  );
  check('pressing Publish again reports version 2', republished !== null, `note: ${JSON.stringify(republished)}`);

  const countRows = await run('docker', ['exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-tAc',
    `select count(*) from published_project where project_id = '${projectId}'`]);
  check(
    'the DATABASE holds exactly one row for it — a re-publish UPDATED rather than inserted',
    countRows.stdout.trim() === '1',
    `rows: ${countRows.stdout.trim()}`,
  );

  // ── §7 the document that reached the database is the Studio's OWN ───────────────────────────────
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

  // ── §7.5 v266: the BYLINE is on the public page ────────────────────────────────────────────────
  // The byline is the whole point of an owned publication: it is what tells a VISITOR who made the thing.
  // It is read here over HTTP from the Studio's own `/explore` route, which lists the service and renders
  // the cards — the same page a person opens, reached through the same route, with the same mapping.
  const exploreUrl = `${studioBase}/explore`;
  const explore = await fetch(exploreUrl);
  const exploreHtml = await explore.text();
  check(
    'the public gallery answers 200 with HTML',
    explore.status === 200 && (explore.headers.get('content-type') ?? '').includes('text/html'),
    `status ${explore.status} · content-type ${explore.headers.get('content-type')}`,
  );
  check(
    'and the card for this publication carries its BYLINE — `by <handle> · <assurance>`',
    exploreHtml.includes(`by ${accountHandle} · unsigned-local`),
    `the gallery mentions "by ${accountHandle} · unsigned-local": ${exploreHtml.includes(`by ${accountHandle} · unsigned-local`)}`,
  );
  // v270 — the byline is an ADDRESS: it links to that account's profile, and the profile lists what
  // that account published. A name that leads nowhere is a name, not an address.
  check(
    'the byline is a LINK to the author\'s profile',
    exploreHtml.includes(`href="/u/${encodeURIComponent(accountRecord?.id ?? '')}"`),
    `the gallery links /u/${accountRecord?.id}: ${exploreHtml.includes(`href="/u/${encodeURIComponent(accountRecord?.id ?? '')}"`)}`,
  );

  const profileUrl = `${studioBase}/u/${encodeURIComponent(accountRecord?.id ?? '')}`;
  const profilePage = await fetch(profileUrl);
  const profileHtml = await profilePage.text();
  check(
    'the PROFILE page answers 200 and lists that account\'s publications',
    profilePage.status === 200 && profileHtml.includes(`data-explore-card="${projectId}"`),
    `status ${profilePage.status} · the profile carries this publication: ${profileHtml.includes(`data-explore-card="${projectId}"`)}`,
  );
  check(
    'and it names the account and the assurance its claims carry',
    profileHtml.includes(`@${accountHandle}`) && profileHtml.includes('unsigned-local'),
    `the profile names @${accountHandle} · unsigned-local: ${profileHtml.includes(`@${accountHandle}`) && profileHtml.includes('unsigned-local')}`,
  );

  check(
    'and the card is the right one — the gallery names this project',
    exploreHtml.includes(`data-explore-card="${projectId}"`),
    `the gallery carries this project: ${exploreHtml.includes(`data-explore-card="${projectId}"`)}`,
  );

  // ── §8 the ARTIFACT PAGE — a URL a PERSON can open (v196) ───────────────────────────────────────
  // Everything above reaches the publication through an API. This is the half M1 deferred: a browser opens
  // the URL and the DOCUMENT is drawn.
  const artifactUrl = `${studioBase}/p/${encodeURIComponent(projectId)}`;
  const artifact = await fetch(artifactUrl);
  const artifactHtml = await artifact.text();
  check(
    'the artifact page answers 200 with HTML',
    artifact.status === 200 && (artifact.headers.get('content-type') ?? '').includes('text/html'),
    `status ${artifact.status} · content-type ${artifact.headers.get('content-type')}`,
  );
  check(
    'and it is the DOCUMENT — the Studio’s own preview renderer, stage and all',
    artifactHtml.includes('class="stage"') && artifactHtml.startsWith('<!doctype html>'),
    `html is ${artifactHtml.length} bytes; carries a stage: ${artifactHtml.includes('class="stage"')}`,
  );

  // Opened in the BROWSER, because "a URL a person can open" is a claim about a browser and not about fetch.
  const artifactPage = await session.newPage('about:blank');
  await artifactPage.navigate(artifactUrl, { waitForSelector: '.stage', waitMs: 500 });
  const rendered = await artifactPage.evaluate(
    "(() => ({ stage: !!document.querySelector('.stage'), body: document.body.innerText.length, boxes: document.querySelectorAll('.stage *').length }))()",
  );
  check(
    'a real browser renders it: the stage is there and it has content',
    rendered.stage === true && rendered.boxes > 0,
    JSON.stringify(rendered),
  );

  // The two failure pages, and they must be DISTINGUISHABLE: "nothing here" and "the service is down" send a
  // reader to different places.
  const missingPage = await fetch(`${studioBase}/p/never-published-${STAMP}`);
  const missingHtml = await missingPage.text();
  check(
    'an id nothing was published under answers 404 with its OWN page',
    missingPage.status === 404 && missingHtml.includes('Nothing published here'),
    `status ${missingPage.status}`,
  );
  check(
    'and that page is NOT the “service is down” page',
    !missingHtml.includes('The publication service is not answering'),
    'the two failures say different things',
  );
  await artifactPage.close();




  // ── §8.5 v268: a REMIX records its LINEAGE, end to end ───────────────────────────────────────────
  // v267 gave the remix a lineage: the fork is stamped with the reserved `_lineage`, and the key is part
  // of the canonical model. What was still missing is the WHOLE path — a person remixing a publication in
  // the real Studio, the fork published, the SERVICE storing the lineage, and the public gallery naming
  // the source. Half a story being proven is not the story being proven: the seam is where the owner was
  // already dropped once (v263), and where the lineage was never written at all (v267).
  let remixProjectId = null;
  {
    await page.evaluate("document.querySelector('[data-toolbar-published-toggle]').click()");
    const remixRow = await until(
      async () => (await page.evaluate("document.querySelectorAll('[data-published-remix]').length")) > 0,
      { tries: 40, gapMs: 500, label: 'the published list to render its remix controls' },
    );
    check('the published row offers a remix control', remixRow, 'the community loop has its second door');

    await page.evaluate(`document.querySelector('[data-published-remix="${projectId}"]').click()`);
    const remixed = await until(
      async () => {
        const note = await page.evaluate("document.querySelector('[data-toolbar-publish-note]')?.textContent ?? ''");
        return note.includes('remixed') ? note : false;
      },
      { tries: 30, gapMs: 300, label: 'the remix to land' },
    );
    check('remixing it in the Studio forks it into a NEW project', remixed !== null, `note: ${JSON.stringify(remixed)}`);

    // Publish the FORK. Its project id is read from the note the SERVICE's URL put there — the same way
    // the source's was — because `window.__nexus` deliberately exposes no document id.
    await page.evaluate("document.querySelector('[data-toolbar-publish]').click()");
    const forkPublished = await until(
      async () => {
        const note = await page.evaluate("document.querySelector('[data-toolbar-publish-note]')?.textContent ?? ''");
        return note.startsWith('published') ? note : false;
      },
      { tries: 120, gapMs: 500, label: 'the fork to be published' },
    );
    const forkUrl = /→\s*(\S+\/projects\/[^\s]+)$/.exec(String(forkPublished));
    remixProjectId = forkUrl ? decodeURIComponent(forkUrl[1].slice(forkUrl[1].lastIndexOf('/projects/') + '/projects/'.length)) : null;
    check('publishing the fork creates a NEW publication under a NEW id', remixProjectId && remixProjectId !== projectId, `fork id: ${JSON.stringify(remixProjectId)} (the source was ${projectId})`);

    // Read the fork back through the SERVICE: the lineage is a fact about the STORED DOCUMENT, not about
    // what the editor happened to hold.
    const forkRead = await fetch(`${apiBase}/projects/${encodeURIComponent(remixProjectId)}`);
    const forkBody = forkRead.status === 200 ? await forkRead.json() : null;
    check('the SERVICE stored the LINEAGE — the fork names the publication it was remixed from',
      forkBody?.document?._lineage?.sourceProjectId === projectId,
      `lineage: ${JSON.stringify(forkBody?.document?._lineage)}`);
    check('and the fork is OWNED by this device — the claim rode on its publish too',
      forkBody?.owner?.accountId === accountRecord?.id && forkBody?.owner?.handle === accountHandle,
      `owner: ${JSON.stringify(forkBody?.owner)}`);

    // And the public gallery names the source, with a link to it — the thing v251 made clickable and the
    // thing a remix published the way a PERSON makes one could never show.
    const exploreAfter = await (await fetch(`${studioBase}/explore`)).text();
    check(
      'the public gallery names the SOURCE — the remix card links back to the publication it came from',
      exploreAfter.includes(`remixed from ${projectId}`) && exploreAfter.includes(`href="/p/${encodeURIComponent(projectId)}"`),
      `the gallery says "remixed from ${projectId}": ${exploreAfter.includes(`remixed from ${projectId}`)}`);
    check(
      'and the remix has its OWN card — the gallery is not showing somebody else\'s byline',
      exploreAfter.includes(`data-explore-card="${remixProjectId}"`),
      `the gallery carries the fork's card: ${exploreAfter.includes(`data-explore-card="${remixProjectId}"`)}`);
  }


  // ── §8.6 v269: the VISITOR's remix — a URL, not a button ────────────────────────────────────────
  // v234 gave the artifact page a remix bar so someone who has only the URL can take the work, and the
  // Studio reads that intent on mount. It had never been driven in a REAL browser: the remix proof grades
  // the lane and the WIRING by reading the shipped source, and a source can be perfectly correct while
  // the mount effect does nothing.
  {
    const visitorPage = await session.newPage('about:blank');
    await visitorPage.navigate(`${studioBase}/?remix=${encodeURIComponent(projectId)}`, { waitForSelector: '#nexus-canvas', waitMs: 1500 });
    await waitForHydration(visitorPage, 'the visitor page to hydrate');

    // The intent is read on MOUNT and dropped once honoured: a URL that kept its query would remix again
    // on every reload, which is a remix nobody asked for twice.
    const dropped = await until(
      async () => (await visitorPage.evaluate('window.location.search')) === '',
      { tries: 40, gapMs: 500, label: 'the one-time remix intent to be dropped' },
    );
    check('the visitor remix DROPS the query once it has been honoured', dropped, 'the URL is clean again');

    // And the fork really happened — with NO button pressed. The status is the Studio's own word for it.
    const visitorStatus = await until(
      async () => {
        const s = await visitorPage.evaluate("document.querySelector('[data-toolbar-status]')?.textContent ?? ''");
        return s.includes('Remixed') ? s : false;
      },
      { tries: 40, gapMs: 500, label: 'the visitor remix to land in the editor' },
    );
    check('the visitor remix forked the publication into a new project, with no button pressed', visitorStatus !== null, `status: ${JSON.stringify(visitorStatus)}`);

    // Publish what the visitor was given, and check the service stored the lineage — the same proof the
    // panel path gets, on the path a person with only a URL takes.
    await visitorPage.evaluate("document.querySelector('[data-toolbar-publish]').click()");
    const visitorPublished = await until(
      async () => {
        const note = await visitorPage.evaluate("document.querySelector('[data-toolbar-publish-note]')?.textContent ?? ''");
        return note.startsWith('published') ? note : false;
      },
      { tries: 40, gapMs: 500, label: 'the visitor fork to be published' },
    );
    const visitorUrl = /→\s*(\S+\/projects\/[^\s]+)$/.exec(String(visitorPublished));
    const visitorId = visitorUrl ? decodeURIComponent(visitorUrl[1].slice(visitorUrl[1].lastIndexOf('/projects/') + '/projects/'.length)) : null;
    check('the visitor publishes their own NEW publication, under a new id', visitorId && visitorId !== projectId, `visitor id: ${JSON.stringify(visitorId)}`);

    const visitorRead = visitorId ? await fetch(`${apiBase}/projects/${encodeURIComponent(visitorId)}`) : null;
    const visitorBody = visitorRead && visitorRead.status === 200 ? await visitorRead.json() : null;
    check('and the SERVICE stored the LINEAGE for the visitor\'s remix too',
      visitorBody?.document?._lineage?.sourceProjectId === projectId,
      `lineage: ${JSON.stringify(visitorBody?.document?._lineage)}`);
    await visitorPage.close();
  }

  // ── §9 the published LIST, and taking one down (v195) ───────────────────────────────────────────
  await page.evaluate("document.querySelector('[data-toolbar-published-toggle]').click()");
  // Wait for the ROWS, not for the panel: the panel renders immediately with "asking the service…" and a
  // wait on the element alone would pass before the service had answered.
  const rowsAppeared = await until(
    async () => (await page.evaluate("document.querySelectorAll('[data-published-row]').length")) > 0,
    { tries: 40, gapMs: 500, label: 'the published list to render rows' },
  );
  const panelText = await page.evaluate("document.querySelector('[data-toolbar-published]')?.innerText ?? null");
  check('opening the published list asks the SERVICE and renders its rows', rowsAppeared, `panel says: ${JSON.stringify(panelText)}`);

  const rowIds = await page.evaluate("[...document.querySelectorAll('[data-published-row]')].map((el) => el.getAttribute('data-published-row'))");
  check('the published row for this project is in the list', rowIds.includes(projectId), `rows: ${JSON.stringify(rowIds)}`);

  // v266 — the row says WHO owns it, because the service will REFUSE a take-down by anybody else and a
  // refusal the user cannot explain is a refusal the user cannot act on.
  const ownerLine = await page.evaluate(`document.querySelector('[data-published-owner="${projectId}"]')?.textContent ?? null`);
  check(
    'the row names its owner, and says it is yours',
    typeof ownerLine === 'string' && ownerLine.includes(`by ${accountHandle}`) && ownerLine.includes('yours'),
    `owner line: ${JSON.stringify(ownerLine)}`,
  );

  // v266 — SIGN OUT, and the take-down is REFUSED: the publication is owned, and a device with no account
  // is nobody, and "named nobody" is the same as "named the wrong person" to the service's owner rule.
  await page.evaluate("document.querySelector('button[title=\"Account\"]').click()");
  await page.evaluate("document.querySelector('[data-account-signout]').click()");
  await page.evaluate("document.querySelector('[data-account-close]').click()");
  const signedOut = await until(
    async () => (await page.evaluate("localStorage.getItem('nexus-current-account')")) === null,
    { tries: 20, gapMs: 200, label: 'the account record to be gone' },
  );
  check('the device signed out — no account, so no claimer', signedOut, 'the account record is gone');

  await page.evaluate(`document.querySelector('[data-published-unpublish="${projectId}"]').click()`);
  const refused = await until(
    async () => {
      const note = await page.evaluate("document.querySelector('[data-toolbar-publish-note]')?.textContent ?? ''");
      return note.includes('not taken down') ? note : false;
    },
    { tries: 30, gapMs: 300, label: 'the take-down to be refused' },
  );
  check(
    // The panel shows the service's OWN WORDS: the route keeps the service's `message`, so the rule reaches
    // the user as prose ("a caller that is not that account may not take it down") rather than as the
    // service's error code. The rule is named either way, and the prose is the more useful of the two.
    'a signed-out device CANNOT take down an owned publication — the service refuses it by name',
    refused !== null && String(refused).includes('not taken down') && String(refused).includes('may not take it down'),
    `note: ${JSON.stringify(refused)}`,
  );
  const stillThere = await fetch(`${apiBase}/projects/${encodeURIComponent(projectId)}`);
  check('and the refused take-down took NOTHING down', stillThere.status === 200, `GET answered ${stillThere.status}`);

  // Sign back in, and the OWNER can take their own publication down.
  await page.evaluate("document.querySelector('button[title=\"Account\"]').click()");
  await page.type('[data-account-handle-input]', accountHandle);
  await page.evaluate("document.querySelector('[data-account-create]').click()");
  const backIn = await until(
    async () => (await page.evaluate("localStorage.getItem('nexus-current-account')")) !== null,
    { tries: 20, gapMs: 200, label: 'the account to be set again' },
  );
  check('the device signs back in — the SAME handle yields the SAME account', backIn, 'the account record is back');

  await page.evaluate(`document.querySelector('[data-published-unpublish="${projectId}"]').click()`);
  const rowGone = await page.waitForFunction(
    `(() => { const el = document.querySelector('[data-toolbar-published]'); return el && !el.querySelector('[data-published-row="${projectId}"]') ? true : null; })()`,
    { timeout: 60000 },
  );
  check('pressing “take down” removes the row from the list', rowGone === true, 'the row is no longer rendered');

  // And the ROW is really gone from the database — the list is the service's answer, not a local edit.
  const afterUnpublish = await fetch(`${apiBase}/projects/${encodeURIComponent(projectId)}`);
  check('and the publication is gone from the SERVICE', afterUnpublish.status === 404, `GET answered ${afterUnpublish.status}`);

  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  const png = Buffer.from(shot.data, 'base64');
  const shotPath = join(REPO_ROOT, '.scratch', 'v194', 'studio-publish.png');
  mkdirSync(join(REPO_ROOT, '.scratch', 'v194'), { recursive: true });
  writeFileSync(shotPath, png);
  check('a pixel screenshot of the published Studio was captured (§30)', png.length > 5000, `${png.length} bytes → ${shotPath}`);

  // ── §9.5 v272: the AUDIT TRAIL — what the service recorded HAPPENING ───────────────────────────────
  // v271 gave the service a trail; this is the first time anyone can SEE it. The point of the section is
  // the last two checks: the publication was taken down in §9 and the SERVICE answers 404 for it — but its
  // entries are still there, because the trail is a table that is APPENDED while a publication is a table
  // that is REPLACED. A trail that lost the row it witnessed would witness nothing.
  {
    const toggle = await page.evaluate("!!document.querySelector('[data-toolbar-trail-toggle]')");
    check('the toolbar carries a TRAIL control — a trail nobody can read is a table nobody audits', toggle, 'the reading half has a door');

    await page.evaluate("document.querySelector('[data-toolbar-trail-toggle]').click()");
    const trailRows = await until(
      async () => {
        const rows = await page.evaluate(
          "Array.from(document.querySelectorAll('[data-trail-row]')).map(n => ({ id: n.getAttribute('data-trail-row'), text: n.textContent ?? '', href: n.querySelector('a')?.getAttribute('href') ?? null, actor: n.querySelector('[data-trail-actor]')?.textContent ?? null }))",
        );
        return rows.length > 0 ? rows : false;
      },
      { tries: 40, gapMs: 500, label: 'the audit trail to render its rows' },
    );
    check('opening it asks the service and renders what it recorded', trailRows !== null, `${trailRows === null ? 0 : trailRows.length} entr(y/ies)`);
    // A failed read leaves the marker FALSE above; every later check then sees an EMPTY trail rather than a thrown
    // TypeError, so the section reports its failures instead of killing the run.
    const rows = trailRows === null ? [] : trailRows;

    // The publication §9 took down answers 404 on the service right now (asserted above). Its ENTRIES are
    // still here — the trail outlives the row.
    const gone = rows.filter((r) => r.href === `/p/${encodeURIComponent(projectId)}`);
    check(
      'the trail still names the publication that is no longer on the service',
      gone.length >= 2,
      `${gone.length} entr(y/ies) for a row that answers 404`,
    );
    check(
      'and the take-down is one of them',
      gone.some((r) => r.text.includes('took down')),
      `actions for it: ${JSON.stringify(gone.map((r) => r.text.slice(0, 40)))}`,
    );
    check(
      'naming the ACCOUNT that did it, with the assurance its claim carried',
      gone.some((r) => r.actor === `${accountRecord?.id} · unsigned-local`),
      `actors: ${JSON.stringify(gone.map((r) => r.actor))}`,
    );

    // The target is a LINK: an audit row that named a publication nobody could reach would be a row you
    // could only take on trust.
    check(
      'every row links to the thing its entry happened to',
      rows.every((r) => typeof r.href === 'string' && r.href.startsWith('/p/')),
      `hrefs: ${JSON.stringify(rows.slice(0, 3).map((r) => r.href))}`,
    );

    // v281 — THREE numbers, because there are three different questions: what is SHOWN (the filter
    // admits), what could be RENDERED (the reading half accepted), and what the SERVICE says it carried.
    const footer = await page.evaluate("document.querySelector('[data-toolbar-trail]')?.textContent ?? ''");
    const stated = /(\d+) shown · (\d+) renderable · the service carried (\d+) · the service caps at (\d+)/.exec(footer);
    check(
      'the trail states the service’s count beside what it rendered',
      // group 2 = rows the reading half accepted, group 3 = the count the SERVICE reported: renderable can
      // never exceed it, and a smaller number is exactly the discrepancy this footer exists to expose.
      stated !== null && Number(stated[2]) <= Number(stated[3]) && Number(stated[4]) >= 1,
      `${stated ? stated[0] : JSON.stringify(footer.slice(-140))}`,
    );

    // §9.6 v281 — the trail’s FILTERS and its TALLY.
    {
      const summary = await page.evaluate("document.querySelector('[data-trail-summary]')?.textContent ?? ''");
      check(
        'the panel states the tally of the whole answer',
        /\d+ published · \d+ took down/.test(summary),
        `summary: ${JSON.stringify(summary)}`,
      );

      // The take-down filter must narrow the list to the take-downs — and NOTHING else.
      await page.evaluate("document.querySelector('[data-trail-filter=\"unpublish\"]').click()");
      const downOnly = await until(
        async () => {
          const actions = await page.evaluate(
            "Array.from(document.querySelectorAll('[data-trail-row]')).map(n => n.getAttribute('data-trail-action'))",
          );
          return actions.length > 0 ? actions : false;
        },
        { tries: 20, gapMs: 300, label: 'the take-down filter to narrow the rows' },
      );
      const downActions = downOnly === false ? [] : downOnly;
      check(
        'the take-down filter shows ONLY take-downs',
        downActions.length > 0 && downActions.every((a) => a === 'unpublish'),
        `actions: ${JSON.stringify(downActions)}`,
      );
      check(
        'and it shows FEWER rows than the whole trail did — a filter that shows everything is not a filter',
        downActions.length < rows.length,
        `${downActions.length} of ${rows.length}`,
      );

      // The publish filter is the other half of the same rule.
      await page.evaluate("document.querySelector('[data-trail-filter=\"publish\"]').click()");
      const pubOnly = await until(
        async () => {
          const actions = await page.evaluate(
            "Array.from(document.querySelectorAll('[data-trail-row]')).map(n => n.getAttribute('data-trail-action'))",
          );
          return actions.length > 0 ? actions : false;
        },
        { tries: 20, gapMs: 300, label: 'the publish filter to narrow the rows' },
      );
      const pubActions = pubOnly === false ? [] : pubOnly;
      check(
        'the publish filter shows ONLY publishes',
        pubActions.length > 0 && pubActions.every((a) => a === 'publish'),
        `actions: ${JSON.stringify(pubActions)}`,
      );

      // And ‘All’ puts every row back: a filter that could not be undone would be a trap.
      await page.evaluate("document.querySelector('[data-trail-filter=\"all\"]').click()");
      const allBack = await until(
        async () => {
          const actions = await page.evaluate(
            "Array.from(document.querySelectorAll('[data-trail-row]')).map(n => n.getAttribute('data-trail-action'))",
          );
          return actions.length === rows.length ? actions : false;
        },
        { tries: 20, gapMs: 300, label: 'the ‘All’ filter to restore every row' },
      );
      check(
        '‘All’ puts every row back — a filter that could not be undone would be a trap',
        allBack !== null,
        `${allBack === null ? 0 : allBack.length} row(s) vs ${rows.length}`,
      );
    }
  }

  // ── §9.7 v280: the ARTIFACT PAGE’s own HISTORY — the trail, read at the thing it records ───────────
  // The panel above shows the WHOLE trail. This section asks the narrower question a reader of a
  // publication actually has: what happened to THIS one? The page is server-rendered and reads the trail
  // through the same server-side hop the publication itself came through.
  {
    const forkPage = remixProjectId ? await fetch(`${studioBase}/p/${encodeURIComponent(remixProjectId)}`) : null;
    const forkHtml = forkPage ? await forkPage.text() : '';
    check(
      'the artifact page carries a HISTORY section',
      forkPage !== null && forkPage.status === 200 && forkHtml.includes('data-history="rows"'),
      `status ${forkPage?.status}; carries rows: ${forkHtml.includes('data-history="rows"')}`,
    );
    check(
      'and the history names the publication it is on',
      forkHtml.includes('data-history-row=') && forkHtml.includes('published'),
      'the section lists a publish entry',
    );
    check(
      'and it names the ACCOUNT that published it, with the assurance its claim carried',
      forkHtml.includes(`${accountRecord?.id} · unsigned-local`),
      `the actor is on the page: ${forkHtml.includes(`${accountRecord?.id} · unsigned-local`)}`,
    );
    // The filter is EXACT. By now the trail holds: the source published TWICE, the source taken down
    // ONCE, and the fork published ONCE. A history whose filter was loose would put the source’s three
    // entries on the fork’s page too — four rows where there is one. The row COUNT is the sharp check,
    // because the source’s id legitimately appears elsewhere on the page (the “remixed from” line).
    const historyRows = (forkHtml.match(/data-history-row=/g) ?? []).length;
    check(
      'and it carries EXACTLY this publication’s entries — the source’s take-down is not on it',
      historyRows === 1,
      `rows on the page: ${historyRows} (the fork was published once)`,
    );
  }

  // ── §10 v284: LIKES — the artifact page’s bar, and the Studio’s intent behind it ─────────
  // The artifact page is SERVER-RENDERED and cannot act: it does not know who the device is (ADR 0018).
  // So the page shows the COUNT and links to the Studio, which is where the account lives — exactly the
  // way the remix bar links. The proof drives the whole loop against the real service and the real
  // database: the bar, the intent, the row, and the refusal for a device with no account.
  {
    // The FORK is the publication under test: the source was taken down in §9, and a like is a fact
    // that outlives the row it happened to (the service does not cascade).
    const likeTarget = remixProjectId ?? projectId;
    const barPage = await fetch(`${studioBase}/p/${encodeURIComponent(likeTarget)}`);
    const barHtml = await barPage.text();
    check(
      'the artifact page carries a LIKES bar',
      barPage.status === 200 && barHtml.includes('data-likes='),
      `status ${barPage.status}; carries the bar: ${barHtml.includes('data-likes=')}`,
    );
    check(
      'and it states a count of ZERO for a publication nobody has liked — a fact, not a failure',
      barHtml.includes('data-likes="0"'),
      `the bar says: ${/data-likes="(\d+)"/.exec(barHtml)?.[0] ?? 'no count'}`,
    );
    check(
      'and the bar offers the like, as a link to the Studio',
      barHtml.includes(`href="/?like=${encodeURIComponent(likeTarget)}"`),
      'the bar links to /?like=<id>',
    );

    // Now the Studio does it. A NEW page, so the main page’s state is untouched.
    const likePage = await session.newPage('about:blank');
    await likePage.navigate(`${studioBase}/?like=${encodeURIComponent(likeTarget)}`, { waitForSelector: '#nexus-canvas', waitMs: 1500 });
    await waitForHydration(likePage, 'the like page to hydrate');
    const likeStatus = await until(
      async () => {
        const s = await likePage.evaluate("document.querySelector('[data-toolbar-status]')?.textContent ?? ''");
        return s.includes('liked') ? s : false;
      },
      { tries: 40, gapMs: 500, label: 'the like to land in the Studio' },
    );
    check(
      'the Studio likes the publication when the URL asks it to',
      likeStatus !== null,
      // v294 — the page's OWN status, not only the wait's verdict: a lane that refused says WHY, and
      // the reason is the fact worth printing.
      `status: ${JSON.stringify(likeStatus ?? (await likePage.evaluate("document.querySelector('[data-toolbar-status]')?.textContent ?? null")))}`,
    );
    check(
      'and it says so in the Studio’s own words, with the count',
      typeof likeStatus === 'string' && /liked .+ — \d+ like\(s\)/.test(likeStatus),
      `status: ${JSON.stringify(likeStatus)}`,
    );
    check(
      'the one-time intent is DROPPED once honoured — a URL that kept its query would like again on every reload',
      (await likePage.evaluate('window.location.search')) === '',
      'the URL is clean again',
    );

    // And the SERVICE recorded it — read independently of the browser, from the real database.
    const likeRead = await fetch(`${apiBase}/likes?projectId=${encodeURIComponent(likeTarget)}`);
    const likeBody = await likeRead.json();
    check(
      'the SERVICE recorded the like — read back independently of the browser',
      likeRead.status === 200 && likeBody.count === 1,
      `count: ${likeBody.count} · likes: ${JSON.stringify(likeBody.likes)}`,
    );
    check(
      "and the like names the ACCOUNT that made it, with the assurance its claim carried",
      Array.isArray(likeBody.likes) && likeBody.likes.length === 1 && likeBody.likes[0].accountId === accountRecord?.id && likeBody.likes[0].assurance === 'unsigned-local',
      `the like: ${JSON.stringify(likeBody.likes?.[0])}`,
    );

    // And the page now says so — the count moved because the SERVICE moved it, not because the page
    // was told.
    const barAfter = await (await fetch(`${studioBase}/p/${encodeURIComponent(likeTarget)}`)).text();
    check(
      'and the artifact page now says ONE like',
      barAfter.includes('data-likes="1"'),
      `the bar says: ${/data-likes="(\d+)"/.exec(barAfter)?.[0] ?? 'no count'}`,
    );

    // LAST, because it clears the device’s account: a device with NO account has no claim, and the
    // service refuses an accountless like by name. The client does NOT invent an actor to make it work.
    await likePage.evaluate("localStorage.removeItem('nexus-current-account')");
    await likePage.navigate(`${studioBase}/?like=${encodeURIComponent(likeTarget)}`, { waitForSelector: '#nexus-canvas', waitMs: 1500 });
    await waitForHydration(likePage, 'the like page to hydrate');
    const noAccount = await until(
      async () => {
        const s = await likePage.evaluate("document.querySelector('[data-toolbar-status]')?.textContent ?? ''");
        return s.includes('no account') ? s : false;
      },
      { tries: 30, gapMs: 500, label: 'the accountless like to be refused' },
    );
    check(
      'a device with NO account is refused — the client does not invent an actor to make the like work',
      noAccount !== null,
      `status: ${JSON.stringify(noAccount)}`,
    );
    const likeAfterRefusal = await (await fetch(`${apiBase}/likes?projectId=${encodeURIComponent(likeTarget)}`)).json();
    check(
      'and the refused like changed NOTHING — the count is still one',
      likeAfterRefusal.count === 1,
      `count: ${likeAfterRefusal.count}`,
    );

    // The accountless check above CLEARED the device's account, and the sections that follow need a
    // device that HAS one: a section that ran without an account would be proving the refusal instead
    // of the thing it is named after. So the account goes back — the same handle yields the same
    // account, which is the rule §3.5 established.
    await likePage.evaluate("document.querySelector('button[title=\"Account\"]').click()");
    await until(
      async () => (await likePage.evaluate("document.querySelectorAll('[data-toolbar-account]').length")) === 1,
      { tries: 20, gapMs: 200, label: 'the account panel to open' },
    );
    await likePage.type('[data-account-handle-input]', accountHandle);
    await likePage.evaluate("document.querySelector('[data-account-create]').click()");
    const backIn = await until(
      async () => (await likePage.evaluate("localStorage.getItem('nexus-current-account')")) !== null,
      { tries: 20, gapMs: 200, label: 'the account to be set again' },
    );
    check(
      'the account is BACK on the device — the sections that follow need one',
      backIn !== null,
      'the account record is back',
    );
    await likePage.close();
  }

  // ── §11 v286: COMMENTS — the page lists them, the Studio writes them ─────────────────────────
  // The artifact page is SERVER-RENDERED and cannot act (ADR 0018: the account lives in the browser),
  // so the page LISTS the comments and links to the Studio, which opens a composer over it. The proof
  // drives the whole loop: the section, the composer, the row, and the accountless refusal.
  {
    const commentTarget = remixProjectId ?? projectId;
    const commentsPage = await fetch(`${studioBase}/p/${encodeURIComponent(commentTarget)}`);
    const commentsHtml = await commentsPage.text();
    check(
      'the artifact page carries a COMMENTS section',
      commentsPage.status === 200 && commentsHtml.includes('data-comments='),
      `status ${commentsPage.status}; carries the section: ${commentsHtml.includes('data-comments=')}`,
    );
    check(
      'and it says the thread is empty, and why it is not a one-click thing',
      commentsHtml.includes('No comments yet') && commentsHtml.includes('needs an account'),
      'the empty state explains itself',
    );
    check(
      'and it offers the composer, as a link to the Studio',
      commentsHtml.includes(`href="/?comment=${encodeURIComponent(commentTarget)}"`),
      'the section links to /?comment=<id>',
    );

    // The Studio opens a composer over the intent.
    const commentPage = await session.newPage('about:blank');
    await commentPage.navigate(`${studioBase}/?comment=${encodeURIComponent(commentTarget)}`, { waitForSelector: '[data-comment-composer]', waitMs: 2000 });
    await waitForHydration(commentPage, 'the comment page to hydrate');
    check(
      'the Studio opens a COMMENT composer over the intent',
      (await commentPage.evaluate("!!document.querySelector('[data-comment-composer]')")) === true,
      'the composer is on the page',
    );

    await commentPage.type('[data-comment-body]', 'this is a comment from the harness');
    await commentPage.evaluate("document.querySelector('[data-comment-post]').click()");
    // The FIRST request to a brand-new route in `next dev` pays the route's compile, and a wait that is
    // too short reads as a failure that is not one. The budget here is deliberately generous, and the
    // diagnostic below says what the page held when the wait gave up — a timeout that says nothing is a
    // timeout that teaches nothing.
    const commentNote = await until(
      async () => {
        const n = await commentPage.evaluate("document.querySelector('[data-comment-note]')?.textContent ?? ''");
        return n.includes('commented') ? n : false;
      },
      { tries: 120, gapMs: 500, label: 'the comment to land' },
    );
    if (commentNote === null) {
      const why = await commentPage.evaluate(
        "({ note: document.querySelector('[data-comment-note]')?.textContent ?? null, value: document.querySelector('[data-comment-body]')?.value ?? null, status: document.querySelector('[data-toolbar-status]')?.textContent ?? null })",
      );
      console.log('[e2e] the comment did not land; the page held:', JSON.stringify(why));
    }
    check(
      'and posting a comment says so in the Studio’s own words',
      commentNote !== null,
      `note: ${JSON.stringify(commentNote)}`,
    );

    // And the SERVICE recorded it — read independently of the browser, from the real database.
    const commentsRead = await fetch(`${apiBase}/comments?projectId=${encodeURIComponent(commentTarget)}`);
    const commentsBody = await commentsRead.json();
    check(
      'the SERVICE recorded the comment — read back independently of the browser',
      commentsRead.status === 200 && Array.isArray(commentsBody.comments) && commentsBody.comments.length === 1,
      `comments: ${JSON.stringify(commentsBody.comments)}`,
    );
    check(
      'and the comment names the ACCOUNT that wrote it, with the assurance its claim carried',
      commentsBody.comments?.[0]?.accountId === accountRecord?.id && commentsBody.comments?.[0]?.assurance === 'unsigned-local',
      `the comment: ${JSON.stringify(commentsBody.comments?.[0])}`,
    );
    check(
      'and the body is what was typed',
      commentsBody.comments?.[0]?.body === 'this is a comment from the harness',
      `body: ${JSON.stringify(commentsBody.comments?.[0]?.body)}`,
    );

    // And the page now shows it.
    const commentsAfter = await (await fetch(`${studioBase}/p/${encodeURIComponent(commentTarget)}`)).text();
    check(
      'and the artifact page now lists the comment, with its author',
      commentsAfter.includes('data-comments="1"') && commentsAfter.includes('this is a comment from the harness') && commentsAfter.includes(`@` + accountRecord?.handle),
      `the page carries it: ${commentsAfter.includes('this is a comment from the harness')}`,
    );

    // LAST, because it clears the device’s account: a comment with no author is unattributable, and the
    // client does NOT invent one.
    await commentPage.evaluate("localStorage.removeItem('nexus-current-account')");
    await commentPage.navigate(`${studioBase}/?comment=${encodeURIComponent(commentTarget)}`, { waitForSelector: '[data-comment-composer]', waitMs: 2000 });
    await waitForHydration(commentPage, 'the comment page to hydrate');
    await commentPage.type('[data-comment-body]', 'a comment with no account');
    await commentPage.evaluate("document.querySelector('[data-comment-post]').click()");
    const noAccountNote = await until(
      async () => {
        const n = await commentPage.evaluate("document.querySelector('[data-comment-note]')?.textContent ?? ''");
        return n.includes('no account') ? n : false;
      },
      { tries: 30, gapMs: 500, label: 'the accountless comment to be refused' },
    );
    check(
      'a device with NO account is refused — the client does not invent an author',
      noAccountNote !== null,
      `note: ${JSON.stringify(noAccountNote)}`,
    );
    const commentsAfterRefusal = await (await fetch(`${apiBase}/comments?projectId=${encodeURIComponent(commentTarget)}`)).json();
    check(
      'and the refused comment changed NOTHING — there is still exactly one',
      commentsAfterRefusal.comments?.length === 1,
      `comments: ${commentsAfterRefusal.comments?.length}`,
    );
    await commentPage.close();
  }

  // ── §12 v288: FOLLOWS — the profile page’s bar, and a SECOND account behind it ───────────────────
  // A follow is the one social act that needs TWO accounts: the service refuses a self-follow by name
  // (a self-follow is a no-op dressed as a relation), so the device signs in as a second account before
  // following the one that published. That is the shape of the feature, not a trick of the proof.
  {
    const followedId = accountRecord?.id;
    const profilePage = await fetch(`${studioBase}/u/${encodeURIComponent(followedId)}`);
    const profileHtml = await profilePage.text();
    check(
      'the profile page carries a FOLLOWERS bar',
      profilePage.status === 200 && profileHtml.includes('data-followers='),
      `status ${profilePage.status}; carries the bar: ${profileHtml.includes('data-followers=')}`,
    );
    check(
      'and it states a count of ZERO for an account nobody follows — a fact, not a failure',
      profileHtml.includes('data-followers="0"'),
      `the bar says: ${/data-followers="(\d+)"/.exec(profileHtml)?.[0] ?? 'no count'}`,
    );
    check(
      'and it offers the follow, as a link to the Studio',
      profileHtml.includes(`href="/?follow=${encodeURIComponent(followedId)}"`),
      'the bar links to /?follow=<id>',
    );

    // A SECOND account on the device: the follow has to come from somebody else.
    const followPage = await session.newPage('about:blank');
    await followPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(followPage, 'the follow page to hydrate');
    await openAccountPanel(followPage, 'the account panel to open');
    await signInAs(followPage, 'bob', 'the second account');
    const bob = await until(
      async () => {
        const raw = await followPage.evaluate("localStorage.getItem('nexus-current-account')");
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
      },
      { tries: 30, gapMs: 300, label: 'the second account record to land' },
    );
    check(
      'a SECOND account is set on the device — a self-follow is a no-op the service refuses',
      bob !== null && bob.id !== followedId,
      `the second account: ${JSON.stringify(bob)}`,
    );

    // Now the follow.
    await followPage.navigate(`${studioBase}/?follow=${encodeURIComponent(followedId)}`, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(followPage, 'the follow page to hydrate');
    const followStatus = await until(
      async () => {
        const s = await followPage.evaluate("document.querySelector('[data-toolbar-status]')?.textContent ?? ''");
        return s.includes('followed') ? s : false;
      },
      { tries: 120, gapMs: 500, label: 'the follow to land' },
    );
    check(
      'the Studio follows the account when the URL asks it to',
      followStatus !== null,
      `status: ${JSON.stringify(followStatus)}`,
    );
    check(
      'and it says so in the Studio’s own words, with the count',
      typeof followStatus === 'string' && /followed .+ — \d+ follower\(s\)/.test(followStatus),
      `status: ${JSON.stringify(followStatus)}`,
    );

    // And the SERVICE recorded it — read independently of the browser, from the real database.
    const followRead = await fetch(`${apiBase}/follows?accountId=${encodeURIComponent(followedId)}&viewer=${encodeURIComponent(bob?.id ?? "")}`);
    const followBody = await followRead.json();
    check(
      'the SERVICE recorded the follow — read back independently of the browser',
      followRead.status === 200 && followBody.followerCount === 1,
      `followerCount: ${followBody.followerCount} · following: ${followBody.following}`,
    );
    check(
      'and it says the VIEWER is among the followers',
      followBody.following === true,
      `following: ${followBody.following}`,
    );

    // And the profile page now says one follower.
    const profileAfter = await (await fetch(`${studioBase}/u/${encodeURIComponent(followedId)}`)).text();
    check(
      'and the profile page now says ONE follower',
      profileAfter.includes('data-followers="1"'),
      `the bar says: ${/data-followers="(\d+)"/.exec(profileAfter)?.[0] ?? 'no count'}`,
    );
    // v292 — and it LISTS the follower, by the name the claim carried, as a LINK to their own profile:
    // an account id is an address, and a list of addresses with no links is a list nobody can act on.
    check(
      'and it LISTS the follower, by name, as a link to their profile',
      profileAfter.includes(`data-follower="${bob?.id}"`) && profileAfter.includes(`href="/u/${bob?.id}"`) && profileAfter.includes('@bob'),
      `the follower is on the page: ${profileAfter.includes(`data-follower="${bob?.id}"`)}`,
    );

    // LAST, because it clears the device’s account: a follow with no follower has no edge to draw, and
    // the client does NOT invent one.
    await followPage.evaluate("localStorage.removeItem('nexus-current-account')");
    await followPage.navigate(`${studioBase}/?follow=${encodeURIComponent(followedId)}`, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(followPage, 'the follow page to hydrate');
    const noAccount = await until(
      async () => {
        const s = await followPage.evaluate("document.querySelector('[data-toolbar-status]')?.textContent ?? ''");
        return s.includes('no account') ? s : false;
      },
      { tries: 40, gapMs: 500, label: 'the accountless follow to be refused' },
    );
    check(
      'a device with NO account is refused — the client does not invent a follower',
      noAccount !== null,
      `status: ${JSON.stringify(noAccount)}`,
    );
    const followAfterRefusal = await (await fetch(`${apiBase}/follows?accountId=${encodeURIComponent(followedId)}`)).json();
    check(
      'and the refused follow changed NOTHING — there is still exactly one follower',
      followAfterRefusal.followerCount === 1,
      `followerCount: ${followAfterRefusal.followerCount}`,
    );
    await followPage.close();
  }

  // ── §13 v289: the SOCIAL verbs in the AUDIT TRAIL ───────────────────────────────────────────────
  // The trail is the service’s record of what happened to the PUBLICATIONS, and a like and a comment are
  // things that happen to a publication. The section re-opens the panel (so it RE-READS the service) and
  // grades that the trail now carries the social verbs, that the tally names them, and that the filters
  // narrow to them.
  {
    const wasOpen = await page.evaluate("!!document.querySelector('[data-toolbar-trail]')");
    if (wasOpen) await page.evaluate("document.querySelector('[data-toolbar-trail-toggle]').click()");
    await page.evaluate("document.querySelector('[data-toolbar-trail-toggle]').click()");
    const socialSummary = await until(
      async () => {
        const s = await page.evaluate("document.querySelector('[data-trail-summary]')?.textContent ?? ''");
        return s.includes('liked') ? s : false;
      },
      { tries: 60, gapMs: 500, label: 'the trail to carry the social verbs' },
    );
    check(
      'the trail now carries the LIKES and the COMMENTS',
      socialSummary !== null,
      `summary: ${JSON.stringify(socialSummary)}`,
    );
    check(
      'and the tally names them — a like is not \u2018other\u2019',
      typeof socialSummary === 'string' && socialSummary.includes('liked') && socialSummary.includes('commented'),
      `summary: ${JSON.stringify(socialSummary)}`,
    );

    // The rows themselves: the trail’s rows carry the social actions, with the service’s own words.
    const socialActions = await page.evaluate("Array.from(document.querySelectorAll('[data-trail-row]')).map(n => n.getAttribute('data-trail-action'))");
    check(
      'and the rows carry the social actions',
      socialActions.includes('like') && socialActions.includes('comment'),
      `actions: ${JSON.stringify(socialActions)}`,
    );

    // And the filters narrow to them, like they do for the publication verbs.
    await page.evaluate("document.querySelector('[data-trail-filter=\"like\"]').click()");
    const likedOnly = await until(
      async () => {
        const actions = await page.evaluate("Array.from(document.querySelectorAll('[data-trail-row]')).map(n => n.getAttribute('data-trail-action'))");
        return actions.length > 0 ? actions : false;
      },
      { tries: 20, gapMs: 300, label: 'the like filter to narrow the rows' },
    );
    const likeActions = likedOnly === null ? [] : likedOnly;
    check(
      'the Liked filter shows ONLY likes',
      likeActions.length > 0 && likeActions.every((a) => a === 'like'),
      `actions: ${JSON.stringify(likeActions)}`,
    );
  }

  // ── §14 v290: the SEARCH door — a term that is only in the DOCUMENT finds the forks ──────────────
  // The search reaches into the document as well as the title, and the forks carry the SOURCE\u2019s id in
  // their lineage. So a term that appears in NO title finds exactly the publications whose documents
  // mention it — which is the sharp check: a title-only search would find nothing at all.
  {
    const term = projectId; // the source\u2019s own id — it is in the forks\u2019 lineage and in no title
    const found = await (await fetch(`${studioBase}/explore?q=${encodeURIComponent(term)}`)).text();
    check(
      'the SEARCH finds the forks by a term that is only in the DOCUMENT',
      found.includes(`data-explore-card="${remixProjectId}"`),
      `the gallery carries the fork: ${found.includes(`data-explore-card="${remixProjectId}"`)}`,
    );
    check(
      'and it EXCLUDES the publication that does not mention the term — the filter really filters',
      !found.includes(`data-explore-card="${projectId}"`),
      `the gallery carries the source: ${found.includes(`data-explore-card="${projectId}"`)}`,
    );
    const none = await (await fetch(`${studioBase}/explore?q=zzz-nothing-mentions-this`)).text();
    check(
      'a term that matches NOTHING gives an EMPTY gallery, not the whole one',
      !none.includes('data-explore-card='),
      `the gallery carries ${(none.match(/data-explore-card=/g) ?? []).length} card(s)`,
    );
  }

  // ── §15 v294: the UN-VERBS — the paths the typed-routes check found broken, and no proof exercised ──
  // The un-like and the un-follow were wired to flat routes that read a path parameter, so the URLs the
  // client calls matched nothing. The TYPE CHECKER found it; a proof had not, because nothing un-liked.
  // This section un-does both, for real.
  {
    // The targets are recomputed HERE: `likeTarget` and `followedId` are block-scoped in their own
    // sections, and a section that reached across a block boundary would be reading a name that is not
    // there. (The browser says so: `ReferenceError: likeTarget is not defined`.)
    const likeTarget = remixProjectId ?? projectId;
    const followedId = accountRecord?.id;
    // The un-LIKE: the device that liked it takes the like back.
    const undoPage = await session.newPage('about:blank');
    await undoPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(undoPage, 'the undo page to hydrate');
    await openAccountPanel(undoPage, 'the account panel to open');
    await signInAs(undoPage, 'ada', 'the account for the un-like');
    await undoPage.navigate(`${studioBase}/?unlike=${encodeURIComponent(likeTarget)}`, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(undoPage, 'the un-like page to hydrate');
    const unlikeStatus = await until(
      async () => {
        const s = await undoPage.evaluate("document.querySelector('[data-toolbar-status]')?.textContent ?? ''");
        return s.includes('took the like back') ? s : false;
      },
      { tries: 120, gapMs: 500, label: 'the un-like to land' },
    );
    check(
      'the Studio takes the LIKE back when the URL asks it to',
      unlikeStatus !== null,
      `status: ${JSON.stringify(unlikeStatus)}`,
    );
    const likesAfter = await (await fetch(`${apiBase}/likes?projectId=${encodeURIComponent(likeTarget)}`)).json();
    check(
      'and the SERVICE recorded it — the like is gone',
      likesAfter.count === 0,
      `count: ${likesAfter.count}`,
    );

    // The un-FOLLOW: the SECOND account (the one that followed) takes the edge back.
    await openAccountPanel(undoPage, 'the account panel to open again');
    await signInAs(undoPage, 'bob', 'the second account for the un-follow');
    await undoPage.navigate(`${studioBase}/?unfollow=${encodeURIComponent(followedId)}`, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(undoPage, 'the un-follow page to hydrate');
    const unfollowStatus = await until(
      async () => {
        const s = await undoPage.evaluate("document.querySelector('[data-toolbar-status]')?.textContent ?? ''");
        return s.includes('took the follow back') ? s : false;
      },
      { tries: 120, gapMs: 500, label: 'the un-follow to land' },
    );
    check(
      'the Studio takes the FOLLOW back when the URL asks it to',
      unfollowStatus !== null,
      `status: ${JSON.stringify(unfollowStatus)}`,
    );
    const followsAfter = await (await fetch(`${apiBase}/follows?accountId=${encodeURIComponent(followedId)}`)).json();
    check(
      'and the SERVICE recorded it — the edge is gone',
      followsAfter.followerCount === 0,
      `followerCount: ${followsAfter.followerCount}`,
    );
    await undoPage.close();
  }

  // ── §16 v296: REPORTS — the page shows the count, the Studio files the report ──────────────────
  // The report is the one social act that asks somebody else to do something, so the section grades the
  // three facts that matter: the page states the count WITHOUT naming the reporter, the report is filed
  // with a reason and a body, and a device with no account is refused (a report with no reporter cannot
  // be followed up).
  {
    // `likeTarget` is block-scoped in its own section, so it is recomputed here rather than reached for
    // across a block boundary (the browser says so: `ReferenceError: likeTarget is not defined`).
    const reportTarget = remixProjectId ?? projectId;
    const reportPage = await fetch(`${studioBase}/p/${encodeURIComponent(reportTarget)}`);
    const reportHtml = await reportPage.text();
    check(
      'the artifact page carries a REPORTS bar',
      reportPage.status === 200 && reportHtml.includes('data-reports='),
      `status ${reportPage.status}; carries the bar: ${reportHtml.includes('data-reports=')}`,
    );
    check(
      'and it states a count of ZERO for a publication nobody reported',
      reportHtml.includes('data-reports="0"'),
      `the bar says: ${/data-reports="(\d+)"/.exec(reportHtml)?.[0] ?? 'no count'}`,
    );
    check(
      'and it offers the report, as a link to the Studio',
      reportHtml.includes(`href="/?report=${encodeURIComponent(reportTarget)}"`),
      'the bar links to /?report=<id>',
    );

    // The Studio opens a composer over the intent.
    const reportComposerPage = await session.newPage('about:blank');
    await reportComposerPage.navigate(`${studioBase}/?report=${encodeURIComponent(reportTarget)}`, { waitForSelector: '[data-report-composer]', waitMs: 2000 });
    await waitForHydration(reportComposerPage, 'the report page to hydrate');
    check(
      'the Studio opens a REPORT composer over the intent',
      (await reportComposerPage.evaluate("!!document.querySelector('[data-report-composer]')")) === true,
      'the composer is on the page',
    );

    await reportComposerPage.type('[data-report-detail]', 'the harness says this is a problem');
    await reportComposerPage.evaluate("document.querySelector('[data-report-reason=\"harassment\"]').click()");
    await reportComposerPage.evaluate("document.querySelector('[data-report-post]').click()");
    const reportNote = await until(
      async () => {
        const n = await reportComposerPage.evaluate("document.querySelector('[data-report-note]')?.textContent ?? ''");
        return n.includes('reported') ? n : false;
      },
      { tries: 120, gapMs: 500, label: 'the report to land' },
    );
    check(
      'and posting a report says so in the Studio’s own words, with the reason',
      typeof reportNote === 'string' && reportNote.includes('harassment'),
      `note: ${JSON.stringify(reportNote)}`,
    );

    // And the SERVICE recorded it — read independently of the browser, from the real database.
    const reportsRead = await fetch(`${apiBase}/reports?target=${encodeURIComponent(reportTarget)}`);
    const reportsBody = await reportsRead.json();
    check(
      'the SERVICE recorded the report — read back independently of the browser',
      reportsRead.status === 200 && Array.isArray(reportsBody.reports) && reportsBody.reports.length === 1,
      `reports: ${JSON.stringify(reportsBody.reports)}`,
    );
    // The REPORTER is whoever the device is signed in as at this point — the previous section ended
    // signed in as the second account, so the report is filed by THAT account and not by the publisher.
    const reporterRaw = await reportComposerPage.evaluate("localStorage.getItem('nexus-current-account')");
    let reporter = null;
    try {
      reporter = reporterRaw ? JSON.parse(reporterRaw) : null;
    } catch {
      reporter = null;
    }
    check(
      'and the report names the REASON and the body, and the account that filed it',
      reportsBody.reports?.[0]?.reason === 'harassment' && reportsBody.reports?.[0]?.detail === 'the harness says this is a problem' && reportsBody.reports?.[0]?.reporterId === reporter?.id,
      `the report: ${JSON.stringify(reportsBody.reports?.[0])} · the device: ${JSON.stringify(reporter)}`,
    );

    // And the page now says one report — and it does NOT name the reporter.
    const reportAfter = await (await fetch(`${studioBase}/p/${encodeURIComponent(reportTarget)}`)).text();
    check(
      'and the artifact page now says ONE report',
      reportAfter.includes('data-reports="1"'),
      `the bar says: ${/data-reports="(\d+)"/.exec(reportAfter)?.[0] ?? 'no count'}`,
    );
    check(
      'and it does NOT name the REPORTER — the count is the fact, the identity is the moderator\u2019s business',
      // The page carries the OWNER\u2019s byline (\u201cby ada\u2026\u201d), so the check is about the REPORTER\u2019s name
      // and not about the string \u201cada\u201d in general.
      !reportAfter.includes(reporter?.handle ?? '\u0000'),
      `the page names the reporter (${reporter?.handle}): ${reportAfter.includes(reporter?.handle ?? '\u0000')}`,
    );

    // LAST, because it clears the device’s account: a report with no reporter cannot be followed up, and
    // the client does NOT invent one.
    await reportComposerPage.evaluate("localStorage.removeItem('nexus-current-account')");
    await reportComposerPage.navigate(`${studioBase}/?report=${encodeURIComponent(reportTarget)}`, { waitForSelector: '[data-report-composer]', waitMs: 2000 });
    await waitForHydration(reportComposerPage, 'the accountless report page to hydrate');
    await reportComposerPage.evaluate("document.querySelector('[data-report-post]').click()");
    const noAccount = await until(
      async () => {
        const n = await reportComposerPage.evaluate("document.querySelector('[data-report-note]')?.textContent ?? ''");
        return n.includes('no account') ? n : false;
      },
      { tries: 40, gapMs: 500, label: 'the accountless report to be refused' },
    );
    check(
      'a device with NO account is refused — the client does not invent a reporter',
      noAccount !== null,
      `note: ${JSON.stringify(noAccount)}`,
    );
    const reportsAfterRefusal = await (await fetch(`${apiBase}/reports?target=${encodeURIComponent(reportTarget)}`)).json();
    check(
      'and the refused report changed NOTHING — there is still exactly one',
      reportsAfterRefusal.reports?.length === 1,
      `reports: ${reportsAfterRefusal.reports?.length}`,
    );
    await reportComposerPage.close();
  }

  // ── §17 v298: TIPS — a tip is for an ACCOUNT, so the bar is on the profile ───────────────────────
  // The device is signed in as the SECOND account (the previous section left it there), and it tips the
  // PUBLISHER’s profile — so the tip goes from one account to another, which is the shape of the feature.
  {
    const tipTo = accountRecord?.id;
    const profileForTips = await fetch(`${studioBase}/u/${encodeURIComponent(tipTo)}`);
    const profileHtml = await profileForTips.text();
    check(
      'the profile page carries a TIPS bar',
      profileForTips.status === 200 && profileHtml.includes('data-tips='),
      `status ${profileForTips.status}; carries the bar: ${profileHtml.includes('data-tips=')}`,
    );
    check(
      'and it states a count of ZERO for an account nobody has tipped',
      profileHtml.includes('data-tips="0"'),
      `the bar says: ${/data-tips="(\d+)"/.exec(profileHtml)?.[0] ?? 'no count'}`,
    );
    check(
      'and it offers the tip, as a link to the Studio',
      profileHtml.includes(`href="/?tip=${encodeURIComponent(tipTo)}"`),
      'the bar links to /?tip=<id>',
    );

    const tipPage = await session.newPage('about:blank');
    // The device signs in FIRST: the previous section ended by clearing the account (its own
    // accountless check), and a tip with no payer is refused by name — so a tipper that has no account
    // would be testing the refusal instead of the tip.
    await tipPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(tipPage, 'the tipper page to hydrate');
    await signInAs(tipPage, 'bob', 'the tipper');
    await tipPage.navigate(`${studioBase}/?tip=${encodeURIComponent(tipTo)}`, { waitForSelector: '[data-tip-composer]', waitMs: 2000 });
    await waitForHydration(tipPage, 'the tip page to hydrate');
    check(
      'the Studio opens a TIP composer over the intent',
      (await tipPage.evaluate("!!document.querySelector('[data-tip-composer]')")) === true,
      'the composer is on the page',
    );

    await tipPage.evaluate("(() => { const el = document.querySelector('[data-tip-amount]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set; if (setter) setter.call(el, '5'); el.dispatchEvent(new Event('input', { bubbles: true })); })()");
    await tipPage.type('[data-tip-message]', 'the harness tips you');
    await tipPage.evaluate("document.querySelector('[data-tip-post]').click()");
    const tipNote = await until(
      async () => {
        const n = await tipPage.evaluate("document.querySelector('[data-tip-note]')?.textContent ?? ''");
        return n.includes('tipped') ? n : false;
      },
      { tries: 120, gapMs: 500, label: 'the tip to land' },
    );
    check(
      'and posting a tip says so in the Studio’s own words, with the amount',
      typeof tipNote === 'string' && tipNote.includes('500'),
      // v294 — the composer’s OWN note, not only the wait’s verdict: a lane that refused says WHY, and
      // the reason is the fact worth printing.
      `note: ${JSON.stringify(tipNote ?? (await tipPage.evaluate("document.querySelector('[data-tip-note]')?.textContent ?? null")))}`,
    );

    // And the SERVICE recorded it — read independently of the browser, from the real database.
    const tipsRead = await fetch(`${apiBase}/tips?recipient=${encodeURIComponent(tipTo)}`);
    const tipsBody = await tipsRead.json();
    check(
      'the SERVICE recorded the tip — read back independently of the browser',
      tipsRead.status === 200 && Array.isArray(tipsBody.tips) && tipsBody.tips.length === 1,
      `tips: ${JSON.stringify(tipsBody.tips)}`,
    );
    check(
      'and the tip names the amount, the message and the account that gave it',
      tipsBody.tips?.[0]?.amountCents === 500 && tipsBody.tips?.[0]?.message === 'the harness tips you' && tipsBody.tips?.[0]?.payerId !== tipTo,
      `the tip: ${JSON.stringify(tipsBody.tips?.[0])}`,
    );
    check(
      'and the total is what the DATABASE summed',
      tipsBody.totalCents === 500,
      `totalCents: ${tipsBody.totalCents}`,
    );

    // And the profile now says one tip — and it does NOT name the payer.
    const profileAfter = await (await fetch(`${studioBase}/u/${encodeURIComponent(tipTo)}`)).text();
    check(
      'and the profile page now says ONE tip',
      profileAfter.includes('data-tips="1"'),
      `the bar says: ${/data-tips="(\d+)"/.exec(profileAfter)?.[0] ?? 'no count'}`,
    );
    check(
      'and the total is on the page — ¥5.00',
      profileAfter.includes('¥5.00'),
      `the bar carries the total: ${profileAfter.includes('¥5.00')}`,
    );

    // And the CREATOR’s own view: the device signs in as the PUBLISHER (the one who was tipped) and opens
    // the Studio’s Economy panel — which used to say ‘the economy door is not built’ and now says what was
    // given.
    await tipPage.evaluate("localStorage.removeItem('nexus-current-account')");
    await tipPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(tipPage, 'the creator page to hydrate');
    await signInAs(tipPage, 'ada', 'the creator');
    await tipPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");
    const economyNote = await until(
      async () => {
        const n = await tipPage.evaluate("document.querySelector('[data-toolbar-economy]')?.textContent ?? ''");
        return n.includes('¥5.00') ? n : false;
      },
      { tries: 60, gapMs: 500, label: 'the economy panel to show the tip' },
    );
    check(
      'the Studio’s Economy panel shows the tip the account was given',
      economyNote !== null,
      `the panel says: ${JSON.stringify(economyNote)}`,
    );
    check(
      'and it says what has NOT been built — the subscriptions need a plan catalog',
      (await tipPage.evaluate("document.querySelector('[data-toolbar-economy]')?.textContent ?? ''")).includes('subscriptions are not built'),
      'the panel names the gap instead of faking an empty feature',
    );

    // LAST, because it clears the device’s account: a tip with no payer is not a fact anyone can act on.
    await tipPage.evaluate("localStorage.removeItem('nexus-current-account')");
    await tipPage.navigate(`${studioBase}/?tip=${encodeURIComponent(tipTo)}`, { waitForSelector: '[data-tip-composer]', waitMs: 2000 });
    await waitForHydration(tipPage, 'the accountless tip page to hydrate');
    await tipPage.evaluate("document.querySelector('[data-tip-post]').click()");
    const noAccount = await until(
      async () => {
        const n = await tipPage.evaluate("document.querySelector('[data-tip-note]')?.textContent ?? ''");
        return n.includes('no account') ? n : false;
      },
      { tries: 40, gapMs: 500, label: 'the accountless tip to be refused' },
    );
    check(
      'a device with NO account is refused — the client does not invent a payer',
      noAccount !== null,
      `note: ${JSON.stringify(noAccount)}`,
    );
    const tipsAfterRefusal = await (await fetch(`${apiBase}/tips?recipient=${encodeURIComponent(tipTo)}`)).json();
    check(
      'and the refused tip changed NOTHING — there is still exactly one',
      tipsAfterRefusal.tips?.length === 1,
      `tips: ${tipsAfterRefusal.tips?.length}`,
    );
    await tipPage.close();
  }

  // ── §18 v301: PLANS and SUBSCRIPTIONS — the creator offers, the supporter backs ─────────────────────
  // The price is a SNAPSHOT: the subscription records the plan’s price AS IT WAS, and the proof checks that
  // by changing the plan’s price afterwards and showing that the subscription did not move.
  {
    const creator = accountRecord?.id;
    const planPage = await session.newPage('about:blank');
    await planPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(planPage, 'the creator page to hydrate');
    await signInAs(planPage, 'ada', 'the creator');
    // The panel TOGGLES, and signing in leaves it OPEN — so the helper reads the state and only
    // clicks when the panel needs opening. A manual click here would CLOSE it.
    await openAccountPanel(planPage, 'the account panel to open');
    await planPage.type('[data-plan-id-input]', 'pro');
    await planPage.type('[data-plan-price-input]', '15');
    await planPage.evaluate("document.querySelector('[data-plan-offer]').click()");
    const planNote = await until(
      async () => {
        const n = await planPage.evaluate("document.querySelector('[data-plan-note]')?.textContent ?? ''");
        return n.includes('offered') ? n : false;
      },
      { tries: 120, gapMs: 500, label: 'the plan to be offered' },
    );
    check(
      'the creator offers a plan from their own account face',
      typeof planNote === 'string' && planNote.includes('1500 cents') && planNote.includes('month'),
      `note: ${JSON.stringify(planNote)}`,
    );

    // And the SERVICE recorded it.
    const plansRead = await fetch(`${apiBase}/plans?creator=${encodeURIComponent(creator)}`);
    const plansBody = await plansRead.json();
    check(
      'the SERVICE recorded the plan — read back independently of the browser',
      plansRead.status === 200 && plansBody.plans?.length === 1 && plansBody.plans[0].priceCents === 1500 && plansBody.plans[0].period === 'month',
      `plans: ${JSON.stringify(plansBody.plans)}`,
    );

    // And the profile page shows it, with the price a supporter would pay.
    const profileWithPlan = await (await fetch(`${studioBase}/u/${encodeURIComponent(creator)}`)).text();
    check(
      'and the profile page shows the plan with its price',
      profileWithPlan.includes('data-plan="pro"') && profileWithPlan.includes('¥15.00') && profileWithPlan.includes('monthly'),
      `the page carries it: ${profileWithPlan.includes('data-plan="pro"')}`,
    );

    // Now a SECOND account backs it.
    await planPage.evaluate("localStorage.removeItem('nexus-current-account')");
    await planPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(planPage, 'the supporter page to hydrate');
    await signInAs(planPage, 'bob', 'the supporter');
    // The account id is GENERATED, so it is read from the device's own record rather than guessed.
    const bobRaw = await planPage.evaluate("localStorage.getItem('nexus-current-account')");
    const bobId = JSON.parse(String(bobRaw)).id;
    await planPage.navigate(`${studioBase}/?subscribe=pro`, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(planPage, 'the subscribe page to hydrate');
    const subscribeStatus = await until(
      async () => {
        const s = await planPage.evaluate("document.querySelector('[data-toolbar-status]')?.textContent ?? ''");
        return s.includes('backed') ? s : false;
      },
      { tries: 120, gapMs: 500, label: 'the subscription to land' },
    );
    check(
      'a supporter backs the plan when the URL asks it to',
      typeof subscribeStatus === 'string' && subscribeStatus.includes('1500'),
      `status: ${JSON.stringify(subscribeStatus)}`,
    );

    const subsRead = await fetch(`${apiBase}/subscriptions?subscriber=${encodeURIComponent(bobId)}`);
    const subsBody = await subsRead.json();
    check(
      'and the SERVICE recorded the subscription, with the price it was agreed at',
      subsBody.subscriptions?.length === 1 && subsBody.subscriptions[0].priceCents === 1500 && subsBody.subscriptions[0].planId === 'pro',
      `subscriptions: ${JSON.stringify(subsBody.subscriptions)}`,
    );

    // And a device with NO account cannot back it: a subscription with no holder is not a commitment.
    await planPage.evaluate("localStorage.removeItem('nexus-current-account')");
    await planPage.navigate(`${studioBase}/?subscribe=pro`, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(planPage, 'the accountless subscribe page to hydrate');
    const noAccount = await until(
      async () => {
        const s = await planPage.evaluate("document.querySelector('[data-toolbar-status]')?.textContent ?? ''");
        return s.includes('no account') ? s : false;
      },
      { tries: 40, gapMs: 500, label: 'the accountless subscription to be refused' },
    );
    check(
      'a device with NO account is refused — the client does not invent a subscriber',
      noAccount !== null,
      `status: ${JSON.stringify(noAccount)}`,
    );
    const subsAfter = await (await fetch(`${apiBase}/subscriptions?subscriber=${encodeURIComponent(bobId)}`)).json();
    check(
      'and the refused subscription changed NOTHING — there is still exactly one',
      subsAfter.subscriptions?.length === 1,
      `subscriptions: ${subsAfter.subscriptions?.length}`,
    );
    await planPage.close();
  }

  // ── §10 teardown ─────────────────────────────────────────────────────────────────────────────────
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
  // v281 — the isolated BUILD dir goes too: it is this run's, and a copy of the service left in the temp
  // dir is litter that grows with every run.
  rmSync(BUILD_DIR, { recursive: true, force: true });
  console.log('[§10] teardown: Studio, service, the throwaway database and the build copy are all gone');
} finally {
  // v294 — a CRASHED run says what the servers said too, not only a run that reached its summary. The
  // harness's own failures (a null element, a timeout) are symptoms; the cause is usually in the Studio's
  // own output, and a harness that swallows it makes the reader go and guess.
  if (typeof studioLog === 'string' && studioLog.length > 0 && !results.some((r) => !r.ok)) {
    console.log('\n[e2e] the Studio own output (the tail):\n' + studioLog.slice(-3000));
  }
  if (page) await page.close().catch(() => {});
  if (session) await session.close().catch(() => {});
  if (studioProcess) await stop(studioProcess);
  if (serviceProcess) await stop(serviceProcess);
  if (dbStarted) await run('docker', ['rm', '-f', DB_CONTAINER]);
  rmSync(BUILD_DIR, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n[summary] ${results.length - failed.length}/${results.length} end-to-end assertions passed`);
if (failed.length) {
  // v294 — a failing run says what the SERVERS said. A check that fails because the Studio threw a
  // TypeError is a check whose cause is in the Studio own output, and a harness that swallows that
  // output makes the reader go and guess. The tail is short on purpose: enough to see the error, not so
  // much that the failure drowns in it.
  if (typeof studioLog === 'string' && studioLog.length > 0) {
    console.log('\n[e2e] the Studio own output (the tail):\n' + studioLog.slice(-4000));
  }
  if (typeof serviceLog === 'string' && serviceLog.length > 0) {
    console.log('\n[e2e] the service own output (the tail):\n' + serviceLog.slice(-2000));
  }
  console.log('[studio-publish-e2e] FAILED');
  process.exit(1);
}
console.log('[studio-publish-e2e] ALL ASSERTIONS PASSED (a Studio document reached a real service, became a row in a real database, and came back unchanged)');
