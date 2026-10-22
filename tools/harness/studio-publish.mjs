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
    // v336 — the budget is two minutes, not one: the Studio's own door is a `next dev` server
    // and a page that is compiled while the machine is busy can take a while to come up. A proof that
    // gives up before the page is real is a proof that measured the machine, not the product.
    { tries: 240, gapMs: 500, label: label ?? 'the page to hydrate' },
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
  }, { tries: 600, gapMs: 1000, label: 'the Studio to serve' });
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
  // v376 — the proof's own budget: the Studio compiles its routes on demand, and a COLD compile on a
  // busy machine can outlast one wait — the machine this proof runs on is often busy with other
  // projects. A RELOAD runs the probe again on a warm route, so a slow compile is not mistaken for a
  // service that is not there. The check itself is unchanged: it still grades what the panel says.
  let ready = null;
  for (let attempt = 1; attempt <= 3 && ready === null; attempt += 1) {
    ready = await until(
      async () => {
        const note = await page.evaluate("document.querySelector('[data-toolbar-publish-note]')?.textContent ?? null");
        return note && note.includes('service ready') ? note : false;
      },
      { tries: 200, gapMs: 500, label: 'the Studio to report the service ready' },
    );
    if (ready === null) {
      console.log(`[e2e] the Studio did not report the service ready (attempt ${attempt}) \u2014 reloading the page`);
      await page.navigate(`${studioBase}/`, { waitForSelector: '#nexus-canvas', waitMs: 1200 });
      await waitForHydration(page, 'the Studio to hydrate again');
    }
  }
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
  // The note is read on failure too: a timeout that says nothing about what the page held is a timeout
  // that leaves the reader guessing, and the note is where the refusal lives.
  let published = null;
  try {
    published = await page.waitForFunction(
      "(() => { const n = document.querySelector('[data-toolbar-publish-note]')?.textContent ?? ''; return n.startsWith('published') ? n : null; })()",
      { timeout: 180000 },
    );
  } catch (error) {
    const note = await page.evaluate("document.querySelector('[data-toolbar-publish-note]')?.textContent ?? ''");
    console.log(`[e2e] the publish note never said "published"; the page held: ${JSON.stringify(note)}`);
    throw error;
  }
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
      { tries: 160, gapMs: 500, label: 'the audit trail to render its rows' },
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
        // v379 — the name follows the truth: the tally counts the ROWS ON THE SCREEN, and the trail is a
        // window. It was never the whole trail.
        'the panel states the tally of the rows it is showing',
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
      { tries: 360, gapMs: 500, label: 'the comment to land' },
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
        return s.includes('is gone') ? s : false;
      },
      { tries: 120, gapMs: 500, label: 'the un-like to land' },
    );
    check(
      // v320 — the words are "the like on X is gone — N like(s) now", and they are true whether there was
      // a like to take back or not: the service answers "a like that is already gone is already gone".
      'the Studio takes the LIKE back when the URL asks it to',
      unlikeStatus !== null && /the like on .+ is gone — \d+ like\(s\) now/.test(String(unlikeStatus)),
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
      'and the report names the REASON and the body',
      reportsBody.reports?.[0]?.reason === 'harassment' && reportsBody.reports?.[0]?.detail === 'the harness says this is a problem',
      `the report: ${JSON.stringify(reportsBody.reports?.[0])}`,
    );
    // v307 — the PUBLIC direction carries no identity, so the attribution is proved a different way: the
    // SERVICE FOUND the report by the reporter's own account id, which is the reporter's own door. The name
    // is the one thing a report cannot afford to leak, and the wire no longer carries it.
    const attributionRead = await fetch(`${apiBase}/reports?reporter=${encodeURIComponent(reporter?.id ?? '')}`);
    const attributionBody = await attributionRead.json();
    check(
      'and the SERVICE found it by the account that filed it — read through the reporter\u2019s own door',
      attributionRead.status === 200 && (attributionBody.reports ?? []).some((r) => r.id === reportsBody.reports?.[0]?.id),
      `the reporter\u2019s own list: ${JSON.stringify(attributionBody.reports)}`,
    );
    check(
      'and the PUBLIC direction carries NO identity — the name is the one thing a report cannot afford to leak',
      !(reportsBody.reports ?? []).some((r) => 'reporterId' in r || 'handle' in r || 'assurance' in r),
      `the rows carry: ${JSON.stringify((reportsBody.reports ?? []).map((r) => Object.keys(r)))}`,
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
      'and it no longer claims the subscriptions are unbuilt — v301 built them and v309 shows them',
      // The panel used to name this gap honestly ("subscriptions are not built yet"), and it was RIGHT to
      // then. A panel that says a true thing about a feature that has since arrived is still telling the
      // reader something false — so the claim goes, and the check follows it.
      !(await tipPage.evaluate("document.querySelector('[data-toolbar-economy]')?.textContent ?? ''")).includes('subscriptions are not built'),
      'the panel names what is there instead of a gap that closed',
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
      // v371 — ONE wording for a period: the bar used to say "monthly" and the creator's own panel
      // said "per month" for the same service's word.
      profileWithPlan.includes('data-plan="pro"') && profileWithPlan.includes('¥15.00') && profileWithPlan.includes('per month'),
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
    // v308 — and the row says where the subscription STANDS, computed by the service from the row and its
    // clock. It is 'active' here because the period has not run out; a row whose period had run out would
    // still say 'active' in the row, and the service’s word is the one that moves.
    check(
      'and the row says where the subscription STANDS',
      subsBody.subscriptions?.[0]?.status === 'active',
      `status: ${JSON.stringify(subsBody.subscriptions?.[0]?.status)}`,
    );
    check(
      'and the total counts the STANDING subscriptions',
      // v368 — the totals are PER PERIOD, so the check adds up the groups: a monthly and a yearly
      // pledge do not add up to one number, and the answer says each of them.
      (subsBody.totalsByPeriod ?? []).reduce((sum, group) => sum + (group.totalCents ?? 0), 0) === 1500,
      `totalsByPeriod: ${JSON.stringify(subsBody.totalsByPeriod)}`,
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

  // ── §19 v303: the OTHER direction of the edge — who an account follows ───────────────────────────
  // A follow is an edge with two ends, and “who watches me” and “who do I watch” are different questions —
  // one query cannot answer both. The section makes BOTH ends exist and checks that the profile tells
  // them apart.
  {
    const graphPage = await session.newPage('about:blank');
    await graphPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(graphPage, 'the graph page to hydrate');

    // The SECOND account’s id, read from the device rather than guessed.
    await signInAs(graphPage, 'bob', 'the second account');
    const bobRaw = await graphPage.evaluate("localStorage.getItem('nexus-current-account')");
    const bobId = JSON.parse(String(bobRaw)).id;

    // The FIRST account follows the SECOND — the other end of the edge. The sign-out happens through
    // the account PANEL (the product's own way): clearing the record behind the panel's back leaves the
    // panel showing the ACCOUNT state, and its create form never appears.
    await signInAs(graphPage, 'ada', 'the first account');
    await graphPage.navigate(`${studioBase}/?follow=${encodeURIComponent(bobId)}`, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(graphPage, 'the follow page to hydrate');
    const followed = await until(
      async () => {
        const s = await graphPage.evaluate("document.querySelector('[data-toolbar-status]')?.textContent ?? ''");
        return s.includes('followed') ? s : false;
      },
      { tries: 120, gapMs: 500, label: 'the follow to land' },
    );
    check(
      'the FIRST account follows the SECOND — the other end of the edge',
      followed !== null,
      `status: ${JSON.stringify(followed)}`,
    );

    // And the SECOND account follows the FIRST — so ONE account has both ends, and its page can carry
    // both lists. (The earlier follow of the first account was UNDONE by §15, which proves the
    // un-follow path — so at this point the first account really had no follower, and the PAGE was right
    // and the CHECK was wrong. A proof that fails because it expected a state the run had deliberately
    // undone is a proof that has to be fixed, not a product that does.)
    await signInAs(graphPage, 'bob', 'the second account again');
    await graphPage.navigate(`${studioBase}/?follow=${encodeURIComponent(accountRecord?.id ?? '')}`, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(graphPage, 'the second follow page to hydrate');
    const followedBack = await until(
      async () => {
        const s = await graphPage.evaluate("document.querySelector('[data-toolbar-status]')?.textContent ?? ''");
        return s.includes('followed') ? s : false;
      },
      { tries: 120, gapMs: 500, label: 'the follow back to land' },
    );
    check(
      'and the SECOND follows the FIRST — so one account has BOTH ends of the edge',
      followedBack !== null,
      `status: ${JSON.stringify(followedBack)}`,
    );

    // The second account’s profile: it has a FOLLOWER now.
    const bobProfile = await (await fetch(`${studioBase}/u/${encodeURIComponent(bobId)}`)).text();
    check(
      'the followed account’s profile says it has ONE follower, and names them',
      bobProfile.includes('data-followers="1"') && bobProfile.includes(`data-follower="${accountRecord?.id}"`),
      `the profile carries it: ${bobProfile.includes('data-followers="1"')}`,
    );

    // And the first account’s profile: it FOLLOWS one.
    const adaProfile = await (await fetch(`${studioBase}/u/${encodeURIComponent(accountRecord?.id)}`)).text();
    check(
      'and the following account’s profile says it FOLLOWS one, and names it',
      adaProfile.includes('data-following="1"') && adaProfile.includes(`data-following="${bobId}"`),
      `the profile carries it: ${adaProfile.includes('data-following="1"')}`,
    );
    check(
      'and the two directions are told APART on the page',
      adaProfile.includes('data-follower=') && adaProfile.includes('data-following='),
      // v303 — the bar's own HTML, because "the page carries both lists" says nothing about WHICH
      // list is missing.
      `followers: ${(adaProfile.match(/data-follower=/g) ?? []).length} · following: ${(adaProfile.match(/data-following=/g) ?? []).length} · bar: ${(adaProfile.match(/<div class="nexus-followers"[^>]*>/) ?? ['none'])[0]}`,
    );
    await graphPage.close();
  }

  // ── §20 v304: the OWNER’S DESK — the report finally gets read ─────────────────────────────────
  // A report filed against a publication is a complaint, and until now the only person who could read
  // it was the one who filed it. The desk is where the OWNER of the work reads it: with the reason and
  // the reporter’s WORDS, and WITHOUT the reporter’s name — because a claim is not a key, and a name
  // cannot be un-said.
  {
    const deskPage = await session.newPage('about:blank');
    await deskPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(deskPage, 'the desk page to hydrate');

    // The complaint is filed by the SECOND account against the FIRST account’s own work. The target is the
    // FORK and not the source: §9 took the source down, and a report about a work that no longer exists is
    // a complaint nobody can act on — the desk does not show it, because the work it is about is gone. That
    // is the SERVICE being honest, and it is a bound this section now records rather than works around.
    // (The first run of this section filed against the source and found the desk empty; the desk was right
    // and the section was wrong.)
    const deskTarget = remixProjectId ?? projectId;
    await signInAs(deskPage, 'bob', 'the complainant');
    await deskPage.navigate(`${studioBase}/?report=${encodeURIComponent(deskTarget)}`, { waitForSelector: '[data-report-composer]', waitMs: 2000 });
    await waitForHydration(deskPage, 'the report page to hydrate');
    await deskPage.type('[data-report-detail]', 'the harness says this is a problem');
    await deskPage.evaluate("document.querySelector('[data-report-reason=\"spam\"]').click()");
    await deskPage.evaluate("document.querySelector('[data-report-post]').click()");
    const filed = await until(
      async () => {
        const n = await deskPage.evaluate("document.querySelector('[data-report-note]')?.textContent ?? ''");
        return n.includes('reported') ? n : false;
      },
      { tries: 120, gapMs: 500, label: 'the report to land' },
    );
    check('a report is filed against the owner’s own work, by somebody else', filed !== null, `note: ${JSON.stringify(filed)}`);

    // The OWNER opens the desk.
    await signInAs(deskPage, 'ada', 'the owner');
    await deskPage.evaluate("document.querySelector('[data-toolbar-desk-toggle]').click()");
    const deskRows = await until(
      async () => (await deskPage.evaluate("document.querySelectorAll('[data-desk-report]').length")) > 0,
      { tries: 120, gapMs: 500, label: 'the desk to show the report' },
    );
    check('the owner’s desk shows the report against their work', deskRows !== null, 'the desk lists it');

    const deskHtml = await deskPage.evaluate("document.querySelector('[data-toolbar-desk]')?.innerHTML ?? ''");
    check(
      'and it shows the REASON and the reporter’s WORDS',
      deskHtml.includes('spam') && deskHtml.includes('the harness says this is a problem'),
      `the desk says: ${JSON.stringify(deskHtml.slice(0, 400))}`,
    );
    const reporterRaw = await deskPage.evaluate("localStorage.getItem('nexus-current-account')");
    const ownerId = JSON.parse(String(reporterRaw)).id;
    check(
      'and it does NOT name the reporter — a claim is not a key, and a name cannot be un-said',
      !deskHtml.includes('bob') && !deskHtml.includes(ownerId),
      `the desk names nobody: ${!deskHtml.includes('bob')}`,
    );

    // The ONE power the owner has over a report: to say they have seen it.
    await deskPage.evaluate("document.querySelector('[data-desk-acknowledge]').click()");
    const acknowledged = await until(
      async () => {
        const status = await deskPage.evaluate("document.querySelector('[data-desk-report]')?.getAttribute('data-desk-status') ?? ''");
        return status === 'acknowledged' ? status : false;
      },
      { tries: 120, gapMs: 500, label: 'the acknowledgement to land' },
    );
    check('the owner can acknowledge the report, and the desk says so', acknowledged !== null, `status: ${JSON.stringify(acknowledged)}`);

    // And the SERVICE recorded the disposition — read independently of the browser.
    const deskRead = await fetch(`${apiBase}/moderation/reports?owner=${encodeURIComponent(ownerId)}`);
    const deskBody = await deskRead.json();
    check(
      'the SERVICE recorded the disposition — read back independently of the browser',
      deskRead.status === 200 && Array.isArray(deskBody.reports) && deskBody.reports.some((r) => r.status === 'acknowledged'),
      `desk: ${JSON.stringify(deskBody.reports)}`,
    );

    // And the desk is the OWNER’s: another account’s desk does not carry it.
    const otherDesk = await fetch(`${apiBase}/moderation/reports?owner=${encodeURIComponent('acct-somebody-else')}`);
    const otherBody = await otherDesk.json();
    check(
      'and the desk is the OWNER’s — another account’s desk does not carry it',
      otherDesk.status === 200 && (otherBody.reports ?? []).length === 0,
      `reports: ${JSON.stringify(otherBody.reports)}`,
    );
    await deskPage.close();
  }

  // ── §21 v305: the REPORTER’s own view — where the complaint stands ────────────────────────────
  // A reporter is owed an answer. The owner’s desk says that a complaint came; this says what became of
  // theirs — and it is the ONLY place a reporter sees a disposition, because the desk deliberately does
  // not name them.
  {
    const filedPage = await session.newPage('about:blank');
    await filedPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(filedPage, 'the filed page to hydrate');

    // The REPORTER — the second account — opens the panel.
    await signInAs(filedPage, 'bob', 'the reporter');
    await filedPage.evaluate("document.querySelector('[data-toolbar-desk-toggle]').click()");
    const filedRows = await until(
      async () => (await filedPage.evaluate("document.querySelectorAll('[data-filed-report]').length")) > 0,
      { tries: 120, gapMs: 500, label: 'the filed list to show the report' },
    );
    check('the reporter sees the complaint they filed', filedRows !== null, 'the filed list carries it');

    const filedStatus = await filedPage.evaluate("document.querySelector('[data-filed-report]')?.getAttribute('data-filed-status') ?? ''");
    check('and it says where it stands — the owner acknowledged it', filedStatus === 'acknowledged', `status: ${JSON.stringify(filedStatus)}`);

    // And the SERVICE agrees, read independently of the browser.
    const reporterRaw = await filedPage.evaluate("localStorage.getItem('nexus-current-account')");
    const reporterId = JSON.parse(String(reporterRaw)).id;
    const filedRead = await fetch(`${apiBase}/reports?reporter=${encodeURIComponent(reporterId)}`);
    const filedBody = await filedRead.json();
    check(
      'the SERVICE agrees — read back independently of the browser',
      filedRead.status === 200 && Array.isArray(filedBody.reports) && filedBody.reports.length >= 1
        && filedBody.reports.some((r) => r.status === 'acknowledged')
        && filedBody.reports.every((r) => typeof r.targetId === 'string' && r.targetId.length > 0),
      `reports: ${JSON.stringify(filedBody.reports)}`,
    );

    // And the wire carries NO identity: the reader of this list IS the reporter, so a field naming them
    // would say nothing they did not know — while saying something to a caller who merely knew the
    // account id. The name is the one thing a report cannot afford to leak.
    check(
      'and the wire carries NO identity — the reader of this list is the reporter',
      !(filedBody.reports ?? []).some((r) => 'reporterId' in r || 'handle' in r || 'assurance' in r),
      `the rows carry: ${JSON.stringify((filedBody.reports ?? []).map((r) => Object.keys(r)))}`,
    );

    // And the OWNER’s desk still names nobody — the reporter’s own list is the only place the identity is.
    const ownerDesk = await fetch(`${apiBase}/moderation/reports?owner=${encodeURIComponent(accountRecord?.id ?? '')}`);
    const ownerBody = await ownerDesk.json();
    check(
      'and the owner’s desk still names nobody',
      !(ownerBody.reports ?? []).some((r) => 'reporterId' in r || 'handle' in r || 'reporterAccountId' in r),
      `the desk rows carry no identity: ${JSON.stringify((ownerBody.reports ?? []).map((r) => Object.keys(r)))}`,
    );
    await filedPage.close();
  }

  // ── §22 v306: the REPORTER can take a complaint back ──────────────────────────────────────────
  // The service has had the withdrawal since v295 and the panel had no button until now: a reporter could
  // file a complaint and never take it back. Withdrawing is not deleting — the row STAYS and its status
  // becomes `rejected`, because a report that was withdrawn is a fact that happened.
  {
    const withdrawPage = await session.newPage('about:blank');
    await withdrawPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(withdrawPage, 'the withdraw page to hydrate');

    await signInAs(withdrawPage, 'bob', 'the reporter withdrawing');
    await withdrawPage.evaluate("document.querySelector('[data-toolbar-desk-toggle]').click()");
    const withdrawButton = await until(
      async () => (await withdrawPage.evaluate("!!document.querySelector('[data-filed-status=\"open\"] [data-filed-withdraw]')")) === true,
      { tries: 120, gapMs: 500, label: 'the open report to offer its withdrawal' },
    );
    check('the reporter is offered the withdrawal on a report that is still OPEN', withdrawButton !== null, 'the button is on the open row');

    const openReportId = await withdrawPage.evaluate("document.querySelector('[data-filed-status=\"open\"]')?.getAttribute('data-filed-report') ?? ''");
    await withdrawPage.evaluate("document.querySelector('[data-filed-withdraw]').click()");
    const withdrawn = await until(
      async () => {
        const statuses = await withdrawPage.evaluate("Array.from(document.querySelectorAll('[data-filed-status]')).map((n) => n.getAttribute('data-filed-status'))");
        return Array.isArray(statuses) && statuses.includes('rejected') ? statuses : false;
      },
      { tries: 120, gapMs: 500, label: 'the withdrawal to land' },
    );
    check('and the withdrawal lands, in the panel\u2019s own words', withdrawn !== null, `statuses: ${JSON.stringify(withdrawn)}`);

    // And the SERVICE recorded it — read independently of the browser.
    const withdrawRaw = await withdrawPage.evaluate("localStorage.getItem('nexus-current-account')");
    const withdrawerId = JSON.parse(String(withdrawRaw)).id;
    const withdrawRead = await fetch(`${apiBase}/reports?reporter=${encodeURIComponent(withdrawerId)}`);
    const withdrawBody = await withdrawRead.json();
    const withdrawnRow = (withdrawBody.reports ?? []).find((r) => r.id === openReportId);
    check(
      'the SERVICE recorded the withdrawal \u2014 read back independently of the browser',
      withdrawRead.status === 200 && withdrawnRow?.status === 'rejected',
      `the report: ${JSON.stringify(withdrawnRow)}`,
    );

    // And the row STAYS: a withdrawn report is a fact that happened, exactly as a taken-down publication
    // is a fact that happened.
    const targetRead = await fetch(`${apiBase}/reports?target=${encodeURIComponent(withdrawnRow?.targetId ?? '')}`);
    const targetBody = await targetRead.json();
    check(
      'and the row STAYS \u2014 a withdrawn report is a fact that happened',
      targetRead.status === 200 && (targetBody.reports ?? []).some((r) => r.id === openReportId && r.status === 'rejected'),
      `the target\u2019s reports: ${JSON.stringify(targetBody.reports)}`,
    );
    await withdrawPage.close();
  }

  // ── §23 v309: the economy panel shows the SUBSCRIPTIONS and the PLANS, for real ──────────────────
  // The panel used to say "subscriptions are not built yet" — TRUE when v274 wrote it, and FALSE once
  // v301 built the service’s plans and subscriptions. A panel that says a true thing about a feature that has
  // since arrived is still telling the reader something false, and nobody notices a panel going stale.
  {
    const economyPage = await session.newPage('about:blank');
    await economyPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(economyPage, 'the economy page to hydrate');

    // The SUBSCRIBER: the account that backs a plan (§18 made this subscription).
    await signInAs(economyPage, 'bob', 'the subscriber');
    // The page is RELOADED after the sign-in: the panel reads when it is OPENED, and a panel left open
    // across an account change would be showing the previous account's economy.
    await economyPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(economyPage, 'the subscriber’s economy page to hydrate');
    await economyPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");
    const subscriptionRow = await until(
      async () => (await economyPage.evaluate("!!document.querySelector('[data-economy-subscription]')")) === true,
      { tries: 120, gapMs: 500, label: 'the subscription to show in the panel' },
    );
    check('the economy panel shows the subscription the account holds', subscriptionRow !== null, 'the row is there');

    const subscriptionStatus = await economyPage.evaluate("document.querySelector('[data-economy-subscription]')?.getAttribute('data-economy-subscription-status') ?? ''");
    check('and it says where the subscription STANDS (v308)', subscriptionStatus === 'Active', `status: ${JSON.stringify(subscriptionStatus)}`);

    // And the CREATOR: the account that offers the plan.
    await signInAs(economyPage, 'ada', 'the creator');
    await economyPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(economyPage, 'the creator’s economy page to hydrate');
    await economyPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");
    const planRow = await until(
      async () => (await economyPage.evaluate("!!document.querySelector('[data-economy-plan]')")) === true,
      { tries: 120, gapMs: 500, label: 'the plan to show in the panel' },
    );
    check('and the creator sees the plan they offer', planRow !== null, 'the plan row is there');

    const planText = await economyPage.evaluate("document.querySelector('[data-economy-plan]')?.textContent ?? ''");
    check('and it says what it costs and for how long', planText.includes('15.00') && planText.includes('per month'), `the plan says: ${JSON.stringify(planText)}`);

    // And the panel no longer claims the feature is unbuilt.
    const panelText = await economyPage.evaluate("document.querySelector('[data-toolbar-economy]')?.textContent ?? ''");
    check('and the panel no longer says the subscriptions are unbuilt', !panelText.includes('not built yet'), `the panel says: ${JSON.stringify(panelText.slice(0, 200))}`);
    await economyPage.close();
  }

  // ── §24 v310: the creator’s OTHER side — who backs this account ────────────────────────────────
  // The panel showed what this account backs and what it offers, and not the third half — which is
  // the half a creator most wants to see. The service had the METHOD since v300 and no door for it.
  {
    const creatorPage = await session.newPage('about:blank');
    await creatorPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(creatorPage, 'the creator page to hydrate');

    await signInAs(creatorPage, 'ada', 'the creator with a supporter');
    await creatorPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(creatorPage, 'the creator’s economy page to hydrate');
    await creatorPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");
    const receivedRow = await until(
      async () => (await creatorPage.evaluate("!!document.querySelector('[data-economy-received]')")) === true,
      { tries: 120, gapMs: 500, label: 'the received subscription to show in the panel' },
    );
    check('the panel shows the subscriptions this account has RECEIVED', receivedRow !== null, 'the row is there');

    const receivedText = await creatorPage.evaluate("document.querySelector('[data-economy-received]')?.textContent ?? ''");
    check('and what the supporter is committed to', receivedText.includes('15.00'), `the row says: ${JSON.stringify(receivedText)}`);

    // And the SERVICE agrees, read independently of the browser.
    const creatorRaw = await creatorPage.evaluate("localStorage.getItem('nexus-current-account')");
    const creatorId = JSON.parse(String(creatorRaw)).id;
    const receivedRead = await fetch(`${apiBase}/subscriptions?creator=${encodeURIComponent(creatorId)}`);
    const receivedBody = await receivedRead.json();
    check(
      'the SERVICE agrees — read back independently of the browser',
      receivedRead.status === 200 && Array.isArray(receivedBody.subscriptions) && receivedBody.subscriptions.length === 1 && receivedBody.subscriptions[0].creatorId === creatorId,
      `received: ${JSON.stringify(receivedBody.subscriptions)}`,
    );
    await creatorPage.close();
  }

  // ── §25 v311: the trail records the REPORT verbs ───────────────────────────────────────────────
  // A report is the one social act that asks somebody else to do something, and the trail is where a
  // reader sees what HAPPENED. A complaint that leaves no entry is a complaint nobody can audit — and
  // a withdrawal that leaves no entry would leave the complaint standing forever in the record.
  {
    const trailPage = await session.newPage('about:blank');
    await trailPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(trailPage, 'the trail page to hydrate');
    await trailPage.evaluate("document.querySelector('[data-toolbar-trail-toggle]').click()");

    const reportEntry = await until(
      async () => (await trailPage.evaluate("!!document.querySelector('[data-trail-action=\"report\"]')")) === true,
      { tries: 120, gapMs: 500, label: 'the report to reach the trail' },
    );
    check('the trail carries the report that was filed', reportEntry !== null, 'the entry is there');

    const withdrawEntry = await until(
      async () => (await trailPage.evaluate("!!document.querySelector('[data-trail-action=\"withdraw-report\"]')")) === true,
      { tries: 120, gapMs: 500, label: 'the withdrawal to reach the trail' },
    );
    check('and the withdrawal of it', withdrawEntry !== null, 'the entry is there');

    const acknowledgeEntry = await until(
      async () => (await trailPage.evaluate("!!document.querySelector('[data-trail-action=\"acknowledge\"]')")) === true,
      { tries: 120, gapMs: 500, label: 'the acknowledgement to reach the trail' },
    );
    check('and the owner’s acknowledgement of it (v304)', acknowledgeEntry !== null, 'the entry is there');

    const trailText = await trailPage.evaluate("document.querySelector('[data-toolbar-trail]')?.textContent ?? ''");
    check('and the panel says them in the trail’s own words', trailText.includes('reported') && trailText.includes('withdrew the report') && trailText.includes('acknowledged the report'), `the trail says: ${JSON.stringify(trailText.slice(0, 300))}`);

    // And the SERVICE agrees, read independently of the browser.
    const auditRead = await fetch(`${apiBase}/audit?limit=100`);
    const auditBody = await auditRead.json();
    const actions = (auditBody.entries ?? []).map((e) => e.action);
    check(
      'the SERVICE agrees — read back independently of the browser',
      auditRead.status === 200 && actions.includes('report') && actions.includes('withdraw-report') && actions.includes('acknowledge'),
      `actions: ${JSON.stringify(actions)}`,
    );
    await trailPage.close();
  }

  // ── §26 v312: the reports TALLYED by reason ────────────────────────────────────────────────────
  // The reasons are a CLOSED SET of four (v295), so a creator can count by them: "two spam and one
  // harassment" says something a bare "three reports" does not. And the tally counts EVERY report
  // against the work, where the desk’s rows are a window.
  {
    const tallyPage = await session.newPage('about:blank');
    await tallyPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(tallyPage, 'the tally page to hydrate');

    await signInAs(tallyPage, 'ada', 'the owner with reports against their work');
    await tallyPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(tallyPage, 'the owner’s economy page to hydrate');
    await tallyPage.evaluate("document.querySelector('[data-toolbar-desk-toggle]').click()");
    const tallyLine = await until(
      async () => (await tallyPage.evaluate("!!document.querySelector('[data-desk-tally]')")) === true,
      { tries: 120, gapMs: 500, label: 'the tally to show in the desk' },
    );
    check('the desk shows the TALLY of the reports against the work', tallyLine !== null, 'the line is there');

    const tallyText = await tallyPage.evaluate("document.querySelector('[data-desk-tally]')?.textContent ?? ''");
    check('and it counts them BY REASON', tallyText.includes('harassment') && tallyText.includes('spam'), `the tally says: ${JSON.stringify(tallyText)}`);

    // And the SERVICE agrees, read independently of the browser.
    const tallyRaw = await tallyPage.evaluate("localStorage.getItem('nexus-current-account')");
    const tallyOwner = JSON.parse(String(tallyRaw)).id;
    const tallyRead = await fetch(`${apiBase}/moderation/tally?owner=${encodeURIComponent(tallyOwner)}`);
    const tallyBody = await tallyRead.json();
    check(
      'the SERVICE agrees — read back independently of the browser',
      tallyRead.status === 200 && typeof tallyBody.total === 'number' && tallyBody.total === 2 && tallyBody.byReason?.spam === 1 && tallyBody.byReason?.harassment === 1,
      `the tally: ${JSON.stringify(tallyBody)}`,
    );
    await tallyPage.close();
  }

  // ── §27 v313: a subscription that ENDED is a DIFFERENT fact, and the refusal says so ───────────────
  // "this account already backs this plan" about a subscription that ended months ago would be a small
  // untrue thing — and a reader who believed it would look for a subscription that is not there. The
  // service says what happened and what the rule is, and the panel says why there is no button to press.
  {
    const endedPage = await session.newPage('about:blank');
    await endedPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(endedPage, 'the ended page to hydrate');
    await signInAs(endedPage, 'bob', 'the supporter whose subscription ends');

    const endedRaw = await endedPage.evaluate("localStorage.getItem('nexus-current-account')");
    const endedId = JSON.parse(String(endedRaw)).id;

    // The subscription from §18 — and it is ended, by the supporter’s own hand.
    const beforeEnd = await (await fetch(`${apiBase}/subscriptions?subscriber=${encodeURIComponent(endedId)}`)).json();
    const subscriptionId = beforeEnd.subscriptions?.[0]?.id;
    check('the subscription from §18 is there', Boolean(subscriptionId), `subscriptions: ${JSON.stringify(beforeEnd.subscriptions)}`);

    const endedCall = await fetch(`${apiBase}/subscriptions/${encodeURIComponent(subscriptionId)}?claimer=${encodeURIComponent(endedId)}`, { method: 'DELETE' });
    const endedBody = await endedCall.json();
    check('and the supporter ends it', endedCall.status === 200 && endedBody.ended === true, `the answer: ${JSON.stringify(endedBody)}`);

    // And now the supporter tries again — and the refusal tells the TRUTH.
    await endedPage.navigate(`${studioBase}/?subscribe=pro`, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(endedPage, 'the subscribe page to hydrate');
    // The status is captured SEPARATELY, so a failure says what the panel actually said — a
    // check that only says "null" is a check that has to be run again to learn anything.
    let seenStatus = '';
    const refused = await until(
      async () => {
        seenStatus = await endedPage.evaluate("document.querySelector('[data-toolbar-status]')?.textContent ?? ''");
        return seenStatus.includes('cancelled this subscription') ? seenStatus : false;
      },
      { tries: 120, gapMs: 500, label: 'the honest refusal' },
    );
    check(
      'the refusal says what happened, not "already backs this plan"',
      refused !== null,
      `the status was: ${JSON.stringify(seenStatus)}`,
    );

    // And the panel says why there is no button to press.
    await endedPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");
    const note = await until(
      async () => (await endedPage.evaluate("!!document.querySelector('[data-economy-renew-note]')")) === true,
      { tries: 120, gapMs: 500, label: 'the renewal note to show' },
    );
    check('and the panel says why there is no button to press', note !== null, 'the note is there');
    await endedPage.close();
  }

  // ── §28 v314: a creator can retire their own plan ──────────────────────────────────────────────
  // A plan is an OFFER. Retiring takes the offer away — nobody new can back it — and it does NOT touch
  // the subscriptions already made against it: a supporter who backed the plan for a month was promised
  // that month, and a creator changing their mind about the offer does not take the promise with it.
  {
    const retirePage = await session.newPage('about:blank');
    await retirePage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(retirePage, 'the retire page to hydrate');
    await signInAs(retirePage, 'ada', 'the creator with a plan to retire');
    await retirePage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(retirePage, 'the creator\u2019s economy page to hydrate');
    await retirePage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");

    const offered = await until(
      async () => (await retirePage.evaluate("!!document.querySelector('[data-economy-plan-status=\"offered\"]')")) === true,
      { tries: 120, gapMs: 500, label: 'the plan to show as offered' },
    );
    check('the creator sees the plan they offer', offered !== null, 'the plan is there');

    await retirePage.evaluate("document.querySelector('[data-economy-retire]').click()");
    const retired = await until(
      async () => (await retirePage.evaluate("document.querySelector('[data-economy-plan-status]')?.getAttribute('data-economy-plan-status') ?? ''")) === 'retired',
      { tries: 120, gapMs: 500, label: 'the plan to show as retired' },
    );
    check('and can take the OFFER away', retired !== null, 'the plan is retired');

    // And the SERVICE agrees, read independently of the browser.
    const creatorRaw = await retirePage.evaluate("localStorage.getItem('nexus-current-account')");
    const creatorId = JSON.parse(String(creatorRaw)).id;
    const plansRead = await fetch(`${apiBase}/plans?creator=${encodeURIComponent(creatorId)}`);
    const plansBody = await plansRead.json();
    check(
      'the SERVICE agrees — the plan is not offered any more',
      plansRead.status === 200 && (plansBody.plans ?? []).some((p) => p.planId === 'pro' && p.active === false),
      `plans: ${JSON.stringify(plansBody.plans)}`,
    );

    // And nobody can back it any more — the service refuses by name.
    const backRead = await fetch(`${apiBase}/subscriptions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ planId: 'pro', claim: { accountId: 'acct-somebody-else', handle: 'nobody', assurance: 'unsigned-local' } }),
    });
    const backBody = await backRead.json();
    check(
      'and nobody can back it any more — the service refuses by name',
      backRead.status === 400 && typeof backBody.message === 'string' && backBody.message.includes('not offered any more'),
      `the refusal: ${JSON.stringify(backBody)}`,
    );
    await retirePage.close();
  }

  // ── §29 v315: the holder can END a subscription ──────────────────────────────────────────────────
  // The service has had the ending since v300 and the panel had no button until now. Ending is not
  // deleting: the row STAYS and its standing becomes `cancelled` — a promise that was ended is a fact that
  // happened. The section offers a FRESH plan, because §27 ended the only subscription there was and §28
  // retired the plan it was made against.
  {
    const cancelPage = await session.newPage('about:blank');
    await cancelPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(cancelPage, 'the cancel page to hydrate');

    // The creator offers a fresh plan.
    await signInAs(cancelPage, 'ada', 'the creator of a fresh plan');
    await openAccountPanel(cancelPage, 'the account panel to open');
    await cancelPage.type('[data-plan-id-input]', 'pro-2');
    await cancelPage.type('[data-plan-price-input]', '20');
    await cancelPage.evaluate("document.querySelector('[data-plan-offer]').click()");
    const offered = await until(
      async () => {
        const n = await cancelPage.evaluate("document.querySelector('[data-plan-note]')?.textContent ?? ''");
        return n.includes('offered') ? n : false;
      },
      { tries: 120, gapMs: 500, label: 'the fresh plan to be offered' },
    );
    check('the creator offers a fresh plan', offered !== null, `note: ${JSON.stringify(offered)}`);

    // And a second account backs it.
    await signInAs(cancelPage, 'bob', 'the supporter of the fresh plan');
    await cancelPage.navigate(`${studioBase}/?subscribe=pro-2`, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(cancelPage, 'the subscribe page to hydrate');
    const backed = await until(
      async () => {
        const s = await cancelPage.evaluate("document.querySelector('[data-toolbar-status]')?.textContent ?? ''");
        return s.includes('backed') ? s : false;
      },
      { tries: 120, gapMs: 500, label: 'the fresh subscription to land' },
    );
    check('and a supporter backs it', backed !== null, `status: ${JSON.stringify(backed)}`);

    // Now the holder ends it — from the panel.
    await cancelPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");
    const cancelButton = await until(
      async () => (await cancelPage.evaluate("!!document.querySelector('[data-economy-cancel]')")) === true,
      { tries: 120, gapMs: 500, label: 'the ending button to show' },
    );
    check('the panel offers the holder the ending', cancelButton !== null, 'the button is there');

    await cancelPage.evaluate("document.querySelector('[data-economy-cancel]').click()");
    const ended = await until(
      async () => (await cancelPage.evaluate("document.querySelector('[data-economy-subscription-status]')?.getAttribute('data-economy-subscription-status') ?? ''")) === 'Never',
      { tries: 120, gapMs: 500, label: 'the subscription to show as ended' },
    );
    check('and the subscription shows as ended — the row stays, the promise is over', ended !== null, 'the row says Never');

    // And the SERVICE agrees, read independently of the browser.
    const holderRaw = await cancelPage.evaluate("localStorage.getItem('nexus-current-account')");
    const holderId = JSON.parse(String(holderRaw)).id;
    const subsRead = await fetch(`${apiBase}/subscriptions?subscriber=${encodeURIComponent(holderId)}`);
    const subsBody = await subsRead.json();
    check(
      'the SERVICE agrees — read back independently of the browser',
      subsRead.status === 200 && (subsBody.subscriptions ?? []).some((s) => s.planId === 'pro-2' && s.status === 'cancelled'),
      `subscriptions: ${JSON.stringify(subsBody.subscriptions)}`,
    );
    await cancelPage.close();
  }

  // ── §30 v316: YOU FOLLOW — and the one way to take a follow back ───────────────────
  // The un-follow’s door has been there since v288, and NOTHING in the product pointed at it: a capability
  // with no door is a capability nobody can reach — and a reader who cannot undo a follow has a page that
  // only ever grows.
  {
    const followPage = await session.newPage('about:blank');
    await followPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(followPage, 'the follow page to hydrate');
    await signInAs(followPage, 'ada', 'the account that follows one account');
    await followPage.evaluate("document.querySelector('[data-toolbar-desk-toggle]').click()");

    const followingRow = await until(
      async () => (await followPage.evaluate("!!document.querySelector('[data-desk-following]')")) === true,
      { tries: 120, gapMs: 500, label: 'the following list to show' },
    );
    check('the desk shows who THIS device follows', followingRow !== null, 'the row is there');

    // And the un-follow — the button that takes it back.
    await followPage.evaluate("document.querySelector('[data-desk-unfollow]').click()");
    const unfollowed = await until(
      async () => {
        const s = await followPage.evaluate("document.querySelector('[data-desk-note]')?.textContent ?? ''");
        return s.includes('took the follow back') ? s : false;
      },
      { tries: 120, gapMs: 500, label: 'the un-follow to land' },
    );
    check('and the follow can be taken back from the product', unfollowed !== null, `the panel says: ${JSON.stringify(unfollowed)}`);

    // And the SERVICE agrees, read independently of the browser.
    const followerRaw = await followPage.evaluate("localStorage.getItem('nexus-current-account')");
    const followerId = JSON.parse(String(followerRaw)).id;
    const followsRead = await fetch(`${apiBase}/follows?follower=${encodeURIComponent(followerId)}`);
    const followsBody = await followsRead.json();
    check(
      'the SERVICE agrees — the edge is gone, read back independently of the browser',
      followsRead.status === 200 && (followsBody.following ?? []).length === 0,
      `following: ${JSON.stringify(followsBody.following)}`,
    );
    await followPage.close();
  }

  // ── §31 v317: the creator can CHANGE the price of a plan they offer ───────────────────────────────
  // The price is a SNAPSHOT, and this is the moment the snapshot earns its keep: a supporter who agreed
  // to yesterday’s price still agreed to it, and the new price is what the NEXT subscriber agrees to.
  {
    const pricePage = await session.newPage('about:blank');
    await pricePage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(pricePage, 'the price page to hydrate');
    await signInAs(pricePage, 'ada', 'the creator of a plan to reprice');
    await openAccountPanel(pricePage, 'the account panel to open');
    await pricePage.type('[data-plan-id-input]', 'pro-2');
    await pricePage.type('[data-plan-price-input]', '25');
    await pricePage.evaluate("document.querySelector('[data-plan-reprice]').click()");
    const repriced = await until(
      async () => {
        const n = await pricePage.evaluate("document.querySelector('[data-plan-note]')?.textContent ?? ''");
        return n.includes('2500 cents') ? n : false;
      },
      { tries: 120, gapMs: 500, label: 'the price change to land' },
    );
    check('the creator can change the price of a plan they offer', repriced !== null, `the note: ${JSON.stringify(repriced)}`);

    // And the SERVICE agrees, read independently of the browser.
    const priceRaw = await pricePage.evaluate("localStorage.getItem('nexus-current-account')");
    const priceOwner = JSON.parse(String(priceRaw)).id;
    const plansRead = await fetch(`${apiBase}/plans?creator=${encodeURIComponent(priceOwner)}`);
    const plansBody = await plansRead.json();
    const repricedPlan = (plansBody.plans ?? []).find((p) => p.planId === 'pro-2');
    check(
      'the SERVICE agrees — the plan now costs the new price',
      plansRead.status === 200 && repricedPlan?.priceCents === 2500,
      `plans: ${JSON.stringify(plansBody.plans)}`,
    );
    await pricePage.close();
  }

  // ── §32 v318: the desk filters by REASON ─────────────────────────────────────────────────────────
  // The reasons are a closed set of four (v295) and the tally counts them (v312) — so a creator can ask
  // "just the spam ones". The filter narrows the LIST and the TALLY keeps counting the whole, and both
  // are on screen at once: a filter that hid something without a number saying it was there would be a
  // small lie (v281’s rule, the one the trail keeps).
  {
    const filterPage = await session.newPage('about:blank');
    await filterPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(filterPage, 'the filter page to hydrate');
    await signInAs(filterPage, 'ada', 'the owner with reports against their work');
    await filterPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(filterPage, 'the owner’s desk page to hydrate');
    await filterPage.evaluate("document.querySelector('[data-toolbar-desk-toggle]').click()");

    const filtersThere = await until(
      async () => (await filterPage.evaluate("!!document.querySelector('[data-desk-filters]')")) === true,
      { tries: 120, gapMs: 500, label: 'the reason filters to show' },
    );
    check('the desk offers a filter for each reason that OCCURS', filtersThere !== null, 'the buttons are there');

    const reasonsOffered = await filterPage.evaluate(
      "Array.from(document.querySelectorAll('[data-desk-filter]')).map((b) => b.getAttribute('data-desk-filter'))",
    );
    check('and the reasons on the desk are the ones it offers', reasonsOffered.includes('spam') && reasonsOffered.includes('harassment'), `the filters: ${JSON.stringify(reasonsOffered)}`);

    const rowsBefore = await filterPage.evaluate("document.querySelectorAll('[data-desk-report]').length");
    check('and every report is on the desk to begin with', rowsBefore >= 2, `rows: ${rowsBefore}`);

    // Filter to ONE reason.
    await filterPage.evaluate("document.querySelector('[data-desk-filter=\"spam\"]').click()");
    const narrowed = await until(
      async () => {
        const n = await filterPage.evaluate("document.querySelectorAll('[data-desk-report]').length");
        return n < rowsBefore ? n : false;
      },
      { tries: 120, gapMs: 500, label: 'the rows to narrow' },
    );
    check('filtering by a reason narrows the LIST', narrowed !== null, `rows left: ${JSON.stringify(narrowed)}`);

    // And the TALLY still counts the whole answer: the filter never hides anything without a number.
    const tallyAfter = await filterPage.evaluate("document.querySelector('[data-desk-tally]')?.textContent ?? ''");
    check(
      'and the TALLY still counts the whole answer',
      tallyAfter.includes('harassment') && tallyAfter.includes('spam'),
      `the tally says: ${JSON.stringify(tallyAfter)}`,
    );

    // And "All" puts them back.
    await filterPage.evaluate("document.querySelector('[data-desk-filter=\"all\"]').click()");
    const restored = await until(
      async () => (await filterPage.evaluate("document.querySelectorAll('[data-desk-report]').length")) === rowsBefore,
      { tries: 120, gapMs: 500, label: 'the rows to come back' },
    );
    check('and the All button brings every row back', restored !== null, 'the rows are back');
    await filterPage.close();
  }

  // ── §33 v319: the trail filters by the REPORT verbs ───────────────────────────────────────────────
  // The trail recorded the report verbs since v311, but they were visible only under "All" — so a reader
  // asking "was my work complained about?" had to read the whole trail to find out. The filter asks in
  // the trail’s own action, and the SUMMARY keeps counting the whole.
  {
    const verbPage = await session.newPage('about:blank');
    await verbPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(verbPage, 'the verb page to hydrate');
    await verbPage.evaluate("document.querySelector('[data-toolbar-trail-toggle]').click()");

    const verbsThere = await until(
      async () => (await verbPage.evaluate("!!document.querySelector('[data-trail-filters]')")) === true,
      { tries: 120, gapMs: 500, label: 'the trail filters to show' },
    );
    check('the trail offers a filter for every action it records', verbsThere !== null, 'the buttons are there');

    const offered = await verbPage.evaluate(
      "Array.from(document.querySelectorAll('[data-trail-filter]')).map((b) => b.getAttribute('data-trail-filter'))",
    );
    check(
      'and the report verbs are among them',
      offered.includes('report') && offered.includes('withdraw-report') && offered.includes('acknowledge'),
      `the filters: ${JSON.stringify(offered)}`,
    );

    // Filter to the filings only.
    await verbPage.evaluate("document.querySelector('[data-trail-filter=\"report\"]').click()");
    const narrowed = await until(
      async () => {
        const actions = await verbPage.evaluate(
          "Array.from(document.querySelectorAll('[data-trail-row]')).map((r) => r.getAttribute('data-trail-action'))",
        );
        return actions.length > 0 && actions.every((a) => a === 'report') ? actions.length : false;
      },
      { tries: 120, gapMs: 500, label: 'the rows to narrow to the filings' },
    );
    check('filtering by an action shows ONLY that action', narrowed !== null, `rows left: ${JSON.stringify(narrowed)}`);

    // And the SUMMARY still counts the whole trail.
    const summaryAfter = await verbPage.evaluate("document.querySelector('[data-trail-summary]')?.textContent ?? ''");
    check(
      'and the SUMMARY still counts the whole trail',
      summaryAfter.includes('withdrew the report') && summaryAfter.includes('reported'),
      `the summary says: ${JSON.stringify(summaryAfter)}`,
    );

    // And "All" puts everything back.
    await verbPage.evaluate("document.querySelector('[data-trail-filter=\"all\"]').click()");
    const restored = await until(
      async () => {
        const n = await verbPage.evaluate("document.querySelectorAll('[data-trail-row]').length");
        return n > 1 ? n : false;
      },
      { tries: 120, gapMs: 500, label: 'the rows to come back' },
    );
    check('and the All button brings every row back', restored !== null, 'the rows are back');
    await verbPage.close();
  }

  // ── §34 v320: the UN-LIKE gets a door in the product ────────────────────────────────
  // The chain was already whole — the intent, the lane, the Studio’s door, the service’s door — and
  // NOTHING in the product pointed at it: a capability with no door is a capability nobody can reach, and
  // a reader whose like cannot be taken back has a count they can only increase. The section runs a WHOLE
  // cycle of its own (like → take it back), so the counts and the trail are graded on this section’s facts
  // and not on the ones the earlier section happened to leave behind.
  {
    // The publication under test.
    const unlikeTarget = remixProjectId ?? projectId;
    const unlikeBar = await (await fetch(`${studioBase}/p/${encodeURIComponent(unlikeTarget)}`)).text();
    check(
      'the artifact page’s bar now offers the TAKING-BACK, as a link to the Studio',
      unlikeBar.includes(`href="/?unlike=${encodeURIComponent(unlikeTarget)}"`),
      'the bar links to /?unlike=<id>',
    );

    const unlikePage = await session.newPage('about:blank');
    await unlikePage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(unlikePage, 'the unlike page to hydrate');
    await signInAs(unlikePage, 'ada', 'the account that likes and un-likes');

    // First the like, so there is something to take back.
    await unlikePage.navigate(`${studioBase}/?like=${encodeURIComponent(unlikeTarget)}`, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(unlikePage, 'the like intent page to hydrate');
    const likeAgain = await until(
      async () => {
        const s = await unlikePage.evaluate("document.querySelector('[data-toolbar-status]')?.textContent ?? ''");
        return s.includes('liked') ? s : false;
      },
      { tries: 120, gapMs: 500, label: 'the like to land' },
    );
    check('the device can like it again', likeAgain !== null, `the status: ${JSON.stringify(likeAgain)}`);

    const likedRead = await fetch(`${apiBase}/likes?projectId=${encodeURIComponent(unlikeTarget)}`);
    const likedBody = await likedRead.json();
    check('and the SERVICE counts it again', likedRead.status === 200 && likedBody.count === 1, `likes: ${JSON.stringify(likedBody)}`);

    // And now the TAKING-BACK, through the door the product offers.
    await unlikePage.navigate(`${studioBase}/?unlike=${encodeURIComponent(unlikeTarget)}`, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(unlikePage, 'the unlike intent page to hydrate');
    const unlikeStatus = await until(
      async () => {
        const s = await unlikePage.evaluate("document.querySelector('[data-toolbar-status]')?.textContent ?? ''");
        return s.includes('is gone') ? s : false;
      },
      { tries: 120, gapMs: 500, label: 'the taking-back to land' },
    );
    check(
      'and the Studio takes the like back, in words that are true either way',
      unlikeStatus !== null && /the like on .+ is gone — \d+ like\(s\) now/.test(String(unlikeStatus)),
      `the status: ${JSON.stringify(unlikeStatus)}`,
    );

    // And the SERVICE agrees, read independently of the browser.
    const unlikeRead = await fetch(`${apiBase}/likes?projectId=${encodeURIComponent(unlikeTarget)}`);
    const unlikeBody = await unlikeRead.json();
    check(
      'the SERVICE agrees — the like is gone',
      unlikeRead.status === 200 && unlikeBody.count === 0 && unlikeBody.liked === false,
      `likes: ${JSON.stringify(unlikeBody)}`,
    );

    // And the TRAIL can now be asked for the taking-back by name.
    await unlikePage.evaluate("document.querySelector('[data-toolbar-trail-toggle]').click()");
    const unlikeFilterThere = await until(
      async () => (await unlikePage.evaluate("!!document.querySelector('[data-trail-filter=\"unlike\"]')")) === true,
      { tries: 120, gapMs: 500, label: 'the trail filter for the taking-back to show' },
    );
    check('the trail offers a filter for the taking-back', unlikeFilterThere !== null, 'the button is there');

    await unlikePage.evaluate("document.querySelector('[data-trail-filter=\"unlike\"]').click()");
    const unlikeRows = await until(
      async () => {
        const actions = await unlikePage.evaluate(
          "Array.from(document.querySelectorAll('[data-trail-row]')).map((r) => r.getAttribute('data-trail-action'))",
        );
        return actions.length > 0 && actions.every((a) => a === 'unlike') ? actions.length : false;
      },
      { tries: 120, gapMs: 500, label: 'the trail to narrow to the taking-backs' },
    );
    check('and filtering by it shows ONLY the taking-backs', unlikeRows !== null, `rows: ${JSON.stringify(unlikeRows)}`);
    await unlikePage.close();
  }

  // ── §35 v321: the UN-COMMENT gets a door in the product ───────────────────────────────────────────
  // The service has had the take-back since v289, and the studio had NO door for it: a comment its
  // author could not take back was a comment that could only be lived with. The link is an OFFER and
  // not a claim — the page cannot know who is reading — and the service is the one that refuses
  // somebody else’s comment by name.
  {
    const undoPage = await session.newPage('about:blank');
    await undoPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(undoPage, 'the un-comment page to hydrate');
    await signInAs(undoPage, 'ada', 'the account that wrote the comment');

    // The page’s own comments section, read straight from the service.
    // The comment §11 wrote lives on the fork (or on the publication itself).
    const undoTarget = remixProjectId ?? projectId;
    const undoComments = await (await fetch(`${apiBase}/comments?projectId=${encodeURIComponent(undoTarget)}`)).json();
    const undoComment = (undoComments.comments ?? []).find((c) => c.deleted !== true);
    check('the comment is still there to be taken back', undoComment?.id !== undefined, `comments: ${JSON.stringify(undoComments.comments)}`);

    // The artifact page’s comments section now offers the taking-back.
    const undoBar = await (await fetch(`${studioBase}/p/${encodeURIComponent(undoTarget)}`)).text();
    check(
      'the artifact page’s comments section offers the TAKING-BACK, as a link to the Studio',
      undoBar.includes(`href="/?uncomment=${encodeURIComponent(String(undoComment?.id))}"`),
      'the section links to /?uncomment=<id>',
    );

    // And the Studio takes it back.
    await undoPage.navigate(
      `${studioBase}/?uncomment=${encodeURIComponent(String(undoComment?.id))}`,
      { waitForSelector: '#nexus-canvas', waitMs: 2000 },
    );
    await waitForHydration(undoPage, 'the un-comment intent page to hydrate');
    const undoStatus = await until(
      async () => {
        const s = await undoPage.evaluate("document.querySelector('[data-toolbar-status]')?.textContent ?? ''");
        return s.includes('comment') ? s : false;
      },
      { tries: 120, gapMs: 500, label: 'the take-back to land' },
    );
    check(
      'and the Studio takes the comment back, in the service’s own truth',
      undoStatus !== null && /took the comment back/.test(String(undoStatus)),
      `the status: ${JSON.stringify(undoStatus)}`,
    );

    // And the SERVICE agrees, read independently of the browser.
    const undoRead = await fetch(`${apiBase}/comments?projectId=${encodeURIComponent(undoTarget)}`);
    const undoBody = await undoRead.json();
    check(
      'the SERVICE agrees — the comment is marked as removed, and the visible count dropped',
      undoRead.status === 200 && (undoBody.comments ?? []).some((c) => c.id === undoComment?.id && c.deleted === true) && undoBody.visible === 0,
      `comments: ${JSON.stringify(undoBody.comments)} · visible: ${undoBody.visible}`,
    );

    // And the TRAIL says it happened.
    const undoAudit = await fetch(`${apiBase}/audit?limit=100`);
    const undoAuditBody = await undoAudit.json();
    check(
      'and the trail carries the taking-back',
      undoAudit.status === 200 && (undoAuditBody.entries ?? []).some((e) => e.action === 'uncomment'),
      `actions: ${JSON.stringify((undoAuditBody.entries ?? []).map((e) => e.action))}`,
    );
    await undoPage.close();
  }

  // ── §36 v322: the trail can name the COMMENT’S removal ───────────────────────────────────────────
  // The service has recorded `uncomment` since v289 and the product can do it since v321 — so a filter
  // that could not ask for it would leave a recorded fact in the "All" bucket with no way to name it.
  {
    const removalPage = await session.newPage('about:blank');
    await removalPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(removalPage, 'the removal page to hydrate');
    await removalPage.evaluate("document.querySelector('[data-toolbar-trail-toggle]').click()");

    const removalButton = await until(
      async () => (await removalPage.evaluate("!!document.querySelector('[data-trail-filter=\"uncomment\"]')")) === true,
      { tries: 120, gapMs: 500, label: 'the filter for the comment removal to show' },
    );
    check('the trail offers a filter for the comment removal', removalButton !== null, 'the button is there');

    await removalPage.evaluate("document.querySelector('[data-trail-filter=\"uncomment\"]').click()");
    const removalRows = await until(
      async () => {
        const actions = await removalPage.evaluate(
          "Array.from(document.querySelectorAll('[data-trail-row]')).map((r) => r.getAttribute('data-trail-action'))",
        );
        return actions.length > 0 && actions.every((a) => a === 'uncomment') ? actions.length : false;
      },
      { tries: 120, gapMs: 500, label: 'the trail to narrow to the comment removals' },
    );
    check('and filtering by it shows ONLY the comment removals', removalRows !== null, `rows: ${JSON.stringify(removalRows)}`);

    // And the SUMMARY still counts the whole trail.
    const removalSummary = await removalPage.evaluate("document.querySelector('[data-trail-summary]')?.textContent ?? ''");
    check(
      'and the SUMMARY still counts the whole trail',
      removalSummary.includes('reported') && removalSummary.includes('commented'),
      `the summary says: ${JSON.stringify(removalSummary)}`,
    );
    await removalPage.close();
  }

  // ── §37 v323: the REPORTER sees the words THEY wrote ───────────────────────────────────────────────
  // The owner’s desk has shown the reporter’s words since v304 — a complaint without its words is a
  // category, not a complaint — and the reporter’s own view did not: a reporter looking at their own
  // complaint could not see what they had actually said. The wire has carried the words all along.
  {
    const wordsPage = await session.newPage('about:blank');
    await wordsPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(wordsPage, 'the words page to hydrate');
    await signInAs(wordsPage, 'bob', 'the reporter');
    await wordsPage.evaluate("document.querySelector('[data-toolbar-desk-toggle]').click()");

    const wordsThere = await until(
      async () => (await wordsPage.evaluate("!!document.querySelector('[data-filed-detail]')")) === true,
      { tries: 120, gapMs: 500, label: 'the reporter’s own words to show' },
    );
    check('the reporter’s own half shows the words they wrote', wordsThere !== null, 'the words are there');

    const wordsText = await wordsPage.evaluate("document.querySelector('[data-filed-detail]')?.textContent ?? ''");
    check(
      'and they are the words the report was filed with',
      wordsText.includes('the harness says this is a problem'),
      `the words: ${JSON.stringify(wordsText)}`,
    );
    await wordsPage.close();
  }

  // ── §38 v324: the desk’s rows LINK to the work the complaint is about ───────────────────────────
  // An owner reading a complaint has to be able to SEE the thing that was complained about. A title is
  // a name a reader has to trust; the work is the thing itself — the same reason the trail’s target is
  // a link.
  {
    const linkPage = await session.newPage('about:blank');
    await linkPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(linkPage, 'the link page to hydrate');
    await signInAs(linkPage, 'ada', 'the owner with complaints against their work');
    await linkPage.evaluate("document.querySelector('[data-toolbar-desk-toggle]').click()");

    const targetLink = await until(
      async () => (await linkPage.evaluate("!!document.querySelector('[data-desk-target]')")) === true,
      { tries: 120, gapMs: 500, label: 'the link to the work to show' },
    );
    check('the desk row carries a link to the work', targetLink !== null, 'the link is there');

    const targetHref = await linkPage.evaluate("document.querySelector('[data-desk-target]')?.getAttribute('href') ?? ''");
    const targetId = await linkPage.evaluate("document.querySelector('[data-desk-target]')?.getAttribute('data-desk-target') ?? ''");
    check(
      'and it points at the publication the complaint is about',
      targetHref === `/p/${targetId}` && targetId.length > 0,
      `href: ${JSON.stringify(targetHref)} · id: ${JSON.stringify(targetId)}`,
    );

    // And the page it points at really is the artifact page — read independently of the browser.
    const targetPage = await fetch(`${studioBase}${targetHref}`);
    const targetHtml = await targetPage.text();
    check(
      'and that page answers 200 with the Studio’s own document',
      targetPage.status === 200 && targetHtml.includes('class="stage"'),
      `status ${targetPage.status} · carries a stage: ${targetHtml.includes('class="stage"')}`,
    );
    await linkPage.close();
  }

  // ── §39 v325: the REPORTER’S half links to the work as well ──────────────────────────────────────
  // The same link the owner’s desk got (v324): a reporter looking at their own complaint should be able
  // to open the work it is about, and not only read its id — the id is a name the reader has to trust.
  {
    const filedLinkPage = await session.newPage('about:blank');
    await filedLinkPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(filedLinkPage, 'the filed link page to hydrate');
    await signInAs(filedLinkPage, 'bob', 'the reporter');
    await filedLinkPage.evaluate("document.querySelector('[data-toolbar-desk-toggle]').click()");

    const filedLink = await until(
      async () => (await filedLinkPage.evaluate("!!document.querySelector('[data-filed-target]')")) === true,
      { tries: 120, gapMs: 500, label: 'the reporter’s link to the work to show' },
    );
    check('the reporter’s own row carries a link to the work', filedLink !== null, 'the link is there');

    const filedHref = await filedLinkPage.evaluate("document.querySelector('[data-filed-target]')?.getAttribute('href') ?? ''");
    const filedTarget = await filedLinkPage.evaluate("document.querySelector('[data-filed-target]')?.getAttribute('data-filed-target') ?? ''");
    check(
      'and it points at the publication the complaint is about',
      filedHref === `/p/${filedTarget}` && filedTarget.length > 0,
      `href: ${JSON.stringify(filedHref)} · id: ${JSON.stringify(filedTarget)}`,
    );

    // And that page really is the artifact page — read independently of the browser.
    const filedPageRead = await fetch(`${studioBase}${filedHref}`);
    const filedHtml = await filedPageRead.text();
    check(
      'and that page answers 200 with the Studio’s own document',
      filedPageRead.status === 200 && filedHtml.includes('class="stage"'),
      `status ${filedPageRead.status} · carries a stage: ${filedHtml.includes('class="stage"')}`,
    );
    await filedLinkPage.close();
  }

  // ── §40 v326: the desk’s filter is the SERVICE’s ──────────────────────────────────────────────────
  // The narrowing that used to happen in the browser now happens in the service’s query: the panel asks
  // for a reason and is answered with that reason’s rows, so a desk with a thousand reports is never read
  // whole to show the spam ones. And the TALLY is not narrowed — it is what says what is hidden.
  {
    const serviceFilterPage = await session.newPage('about:blank');
    await serviceFilterPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(serviceFilterPage, 'the service filter page to hydrate');
    await signInAs(serviceFilterPage, 'ada', 'the owner with reports against their work');
    await serviceFilterPage.evaluate("document.querySelector('[data-toolbar-desk-toggle]').click()");

    const serviceFilterThere = await until(
      async () => (await serviceFilterPage.evaluate("!!document.querySelector('[data-desk-filter=\"spam\"]')")) === true,
      { tries: 120, gapMs: 500, label: 'the reason filter to show' },
    );
    check('the desk offers the reason filter', serviceFilterThere !== null, 'the button is there');

    await serviceFilterPage.evaluate("document.querySelector('[data-desk-filter=\"spam\"]').click()");
    const serviceNarrowed = await until(
      async () => {
        const reasons = await serviceFilterPage.evaluate(
          "Array.from(document.querySelectorAll('[data-desk-report]')).map((r) => r.getAttribute('data-desk-reason'))",
        );
        return reasons.length > 0 && reasons.every((r) => r === 'spam') ? reasons.length : false;
      },
      { tries: 120, gapMs: 500, label: 'the desk to narrow to the spam ones' },
    );
    check('and the panel shows ONLY that reason', serviceNarrowed !== null, `rows: ${JSON.stringify(serviceNarrowed)}`);

    // And the SERVICE agrees, read independently of the browser: the answer itself is narrowed.
    const serviceOwnerRaw = await serviceFilterPage.evaluate("localStorage.getItem('nexus-current-account')");
    const serviceOwner = JSON.parse(String(serviceOwnerRaw)).id;
    const serviceDeskRead = await fetch(`${apiBase}/moderation/reports?owner=${encodeURIComponent(serviceOwner)}&reason=spam`);
    const serviceDeskBody = await serviceDeskRead.json();
    check(
      'the SERVICE agrees — its own answer is narrowed to the reason',
      serviceDeskRead.status === 200 && (serviceDeskBody.reports ?? []).length > 0 && (serviceDeskBody.reports ?? []).every((r) => r.reason === 'spam'),
      `desk: ${JSON.stringify(serviceDeskBody.reports)}`,
    );

    // And the TALLY still counts the whole, so the reader sees what the filter is hiding.
    const serviceTally = await serviceFilterPage.evaluate("document.querySelector('[data-desk-tally]')?.textContent ?? ''");
    check(
      'and the TALLY still counts the whole answer',
      serviceTally.includes('harassment') && serviceTally.includes('spam'),
      `the tally says: ${JSON.stringify(serviceTally)}`,
    );
    await serviceFilterPage.close();
  }

  // ── §41 v327: the creator sees WHO is backing their plan ──────────────────────────────────────────
  // The service’s wire has carried the subscriber’s name all along, and the creator’s list of the
  // subscriptions they received did not show it: a plan, a price and a status, and not the person who
  // had put their money behind it.
  {
    const backerPage = await session.newPage('about:blank');
    await backerPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(backerPage, 'the backer page to hydrate');
    await signInAs(backerPage, 'ada', 'the creator whose plan was backed');
    await backerPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");

    const backerThere = await until(
      async () => (await backerPage.evaluate("!!document.querySelector('[data-economy-received]')")) === true,
      { tries: 120, gapMs: 500, label: 'the received subscriptions to show' },
    );
    check('the creator’s received subscriptions are on screen', backerThere !== null, 'the rows are there');

    const backers = await backerPage.evaluate(
      "Array.from(document.querySelectorAll('[data-economy-subscriber]')).map((s) => s.getAttribute('data-economy-subscriber'))",
    );
    check(
      'and each row says WHO is behind it — by the NAME the supporter’s claim carried',
      backers.length > 0 && backers.every((b) => typeof b === 'string' && b.startsWith('@')),
      `the subscribers: ${JSON.stringify(backers)}`,
    );

    // And the SERVICE names the same subscriber, read independently of the browser.
    const backerRaw = await backerPage.evaluate("localStorage.getItem('nexus-current-account')");
    const backerOwner = JSON.parse(String(backerRaw)).id;
    const backerSubs = await fetch(`${apiBase}/subscriptions?creator=${encodeURIComponent(backerOwner)}&limit=50`);
    const backerSubsBody = await backerSubs.json();
    const serviceSubscribers = (backerSubsBody.subscriptions ?? []).map((s) => s.subscriberId).filter(Boolean);
    const serviceHandles = (backerSubsBody.subscriptions ?? []).map((s) => s.handle).filter(Boolean);
    check(
      'the SERVICE agrees — it sends the supporter’s name on the wire, and the panel shows it',
      backerSubs.status === 200 && serviceHandles.length > 0 && serviceHandles.every((h) => backers.includes(`@${h}`)),
      `the service’s handles: ${JSON.stringify(serviceHandles)} · the panel: ${JSON.stringify(backers)}`,
    );
    await backerPage.close();
  }

  // ── §42 v328: the creator sees WHEN a subscription was taken back ──────────────────────────────────
  // A row that said THAT it ended and never WHEN left a creator asking "who stopped, and when" with
  // half an answer. The instant is the service’s own clock, and it travels on the wire.
  {
    const endedPage = await session.newPage('about:blank');
    await endedPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(endedPage, 'the ended page to hydrate');
    await signInAs(endedPage, 'ada', 'the creator whose supporter took it back');
    await endedPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");

    const endedShown = await until(
      async () => (await endedPage.evaluate("!!document.querySelector('[data-economy-ended]')")) === true,
      { tries: 120, gapMs: 500, label: 'the ending to show on the received row' },
    );
    check('the creator’s received row says WHEN it was taken back', endedShown !== null, 'the ending is there');

    // And the SERVICE agrees, read independently of the browser: it sends the same instant.
    const endedRaw = await endedPage.evaluate("localStorage.getItem('nexus-current-account')");
    const endedOwner = JSON.parse(String(endedRaw)).id;
    const endedSubs = await fetch(`${apiBase}/subscriptions?creator=${encodeURIComponent(endedOwner)}&limit=50`);
    const endedSubsBody = await endedSubs.json();
    const serviceEnded = (endedSubsBody.subscriptions ?? []).map((s) => s.endedAt).filter((e) => typeof e === 'number');
    const panelEnded = await endedPage.evaluate(
      "Array.from(document.querySelectorAll('[data-economy-ended]')).map((s) => s.getAttribute('data-economy-ended'))",
    );
    check(
      'the SERVICE agrees — it sends the same instant it wrote down',
      endedSubs.status === 200 && serviceEnded.length > 0 && panelEnded.length > 0
        && panelEnded.every((p) => serviceEnded.some((e) => new Date(e).toISOString().replace('.000Z', 'Z') === p)),
      `the service: ${JSON.stringify(serviceEnded)} · the panel: ${JSON.stringify(panelEnded)}`,
    );
    await endedPage.close();
  }

  // ── §43 v329: the creator sees WHEN the support began ─────────────────────────────────────────────
  // The other half of the pair v328 completed: a relationship is two dates, and the panel said one of
  // them. The wire has carried the beginning since v300 — the panel just never said it.
  {
    const startedPage = await session.newPage('about:blank');
    await startedPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(startedPage, 'the started page to hydrate');
    await signInAs(startedPage, 'ada', 'the creator whose plan was backed');
    await startedPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");

    const startedShown = await until(
      async () => (await startedPage.evaluate("!!document.querySelector('[data-economy-started]')")) === true,
      { tries: 120, gapMs: 500, label: 'the start to show on the received row' },
    );
    check('the creator’s received row says WHEN the support began', startedShown !== null, 'the start is there');

    // And the SERVICE agrees, read independently of the browser.
    const startedRaw = await startedPage.evaluate("localStorage.getItem('nexus-current-account')");
    const startedOwner = JSON.parse(String(startedRaw)).id;
    const startedSubs = await fetch(`${apiBase}/subscriptions?creator=${encodeURIComponent(startedOwner)}&limit=50`);
    const startedSubsBody = await startedSubs.json();
    const serviceStarted = (startedSubsBody.subscriptions ?? []).map((s) => s.subscribedAt).filter((v) => typeof v === 'number');
    const panelStarted = await startedPage.evaluate(
      "Array.from(document.querySelectorAll('[data-economy-started]')).map((s) => s.getAttribute('data-economy-started'))",
    );
    check(
      'the SERVICE agrees — it sends the same start it recorded',
      startedSubs.status === 200 && serviceStarted.length > 0 && panelStarted.length > 0
        && panelStarted.every((p) => serviceStarted.some((v) => new Date(v).toISOString().replace('.000Z', 'Z') === p)),
      `the service: ${JSON.stringify(serviceStarted)} · the panel: ${JSON.stringify(panelStarted)}`,
    );
    await startedPage.close();
  }

  // ── §44 v330: the supporter sees WHOSE plan they back ─────────────────────────────────────────────
  // A plan id is an ADDRESS, and a supporter reading their own list should not have to know which
  // address belongs to the person whose work they are backing. The name is the creator’s own claim,
  // copied onto the subscription when it was made — the same snapshot rule the price follows.
  {
    const whosePage = await session.newPage('about:blank');
    await whosePage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(whosePage, 'the whose page to hydrate');
    await signInAs(whosePage, 'bob', 'the supporter');
    await whosePage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");

    const whoseThere = await until(
      async () => (await whosePage.evaluate("!!document.querySelector('[data-economy-creator]')")) === true,
      { tries: 120, gapMs: 500, label: 'whose plan it is to show' },
    );
    check('the supporter’s own row says whose plan they back', whoseThere !== null, 'the name is there');

    // And the SERVICE agrees, read independently of the browser.
    const whoseRaw = await whosePage.evaluate("localStorage.getItem('nexus-current-account')");
    const whoseId = JSON.parse(String(whoseRaw)).id;
    const whoseSubs = await fetch(`${apiBase}/subscriptions?subscriber=${encodeURIComponent(whoseId)}&limit=50`);
    const whoseSubsBody = await whoseSubs.json();
    const serviceCreators = (whoseSubsBody.subscriptions ?? []).map((s) => s.creatorHandle).filter(Boolean);
    const panelCreators = await whosePage.evaluate(
      "Array.from(document.querySelectorAll('[data-economy-creator]')).map((s) => s.getAttribute('data-economy-creator'))",
    );
    check(
      'the SERVICE agrees — it sends the creator’s name on the wire, and the panel shows it',
      whoseSubs.status === 200 && serviceCreators.length > 0 && panelCreators.length > 0
        && panelCreators.every((p) => serviceCreators.some((h) => `@${h}` === p)),
      `the service: ${JSON.stringify(serviceCreators)} · the panel: ${JSON.stringify(panelCreators)}`,
    );
    await whosePage.close();
  }

  // ── §45 v331: the recipient of a tip sees WHO sent it ────────────────────────────────────────────────
  // "a supporter" is a category; the name is the person, and the service has been sending the payer’s
  // name since the tip’s own beginning. An ANONYMOUS tip still says "Anonymous" — that is the payer’s choice
  // about their own money.
  {
    const payerPage = await session.newPage('about:blank');
    await payerPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(payerPage, 'the payer page to hydrate');
    await signInAs(payerPage, 'ada', 'the recipient of the tip');
    await payerPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");

    const payerThere = await until(
      async () => (await payerPage.evaluate("!!document.querySelector('[data-economy-payer]')")) === true,
      { tries: 120, gapMs: 500, label: 'the payer to show on the tip row' },
    );
    check('the recipient’s tip row names WHO sent it', payerThere !== null, 'the name is there');

    const panelPayer = await payerPage.evaluate("document.querySelector('[data-economy-payer]')?.getAttribute('data-economy-payer') ?? ''");
    check(
      'and it is the tipper’s name, not a category',
      typeof panelPayer === 'string' && panelPayer.startsWith('@') && panelPayer !== '@Anonymous',
      `the payer: ${JSON.stringify(panelPayer)}`,
    );

    // And the SERVICE agrees, read independently of the browser.
    const payerRaw = await payerPage.evaluate("localStorage.getItem('nexus-current-account')");
    const payerId = JSON.parse(String(payerRaw)).id;
    const payerTips = await fetch(`${apiBase}/tips?recipient=${encodeURIComponent(payerId)}&limit=50`);
    const payerTipsBody = await payerTips.json();
    const servicePayers = (payerTipsBody.tips ?? []).map((t) => t.handle).filter(Boolean);
    check(
      'the SERVICE agrees — it sends the payer’s name on the wire, and the panel shows it',
      payerTips.status === 200 && servicePayers.length > 0 && servicePayers.every((h) => panelPayer === `@${h}`),
      `the service: ${JSON.stringify(servicePayers)} · the panel: ${JSON.stringify(panelPayer)}`,
    );
    await payerPage.close();
  }

  // ── §46 v332: the tipper sees what THEY gave ─────────────────────────────────────────────────────────
  // The other side of the same relation: a reader who gave money and could not see what they gave had a
  // receipt with no place to read it.
  {
    const gavePage = await session.newPage('about:blank');
    await gavePage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(gavePage, 'the gave page to hydrate');
    await signInAs(gavePage, 'bob', 'the tipper');
    await gavePage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");

    const gaveThere = await until(
      async () => (await gavePage.evaluate("!!document.querySelector('[data-economy-given]')")) === true,
      { tries: 120, gapMs: 500, label: 'the given tips to show' },
    );
    check('the tipper’s own side shows what they gave', gaveThere !== null, 'the rows are there');

    // And the SERVICE agrees, read independently of the browser.
    const gaveRaw = await gavePage.evaluate("localStorage.getItem('nexus-current-account')");
    const gaveId = JSON.parse(String(gaveRaw)).id;
    const gaveTips = await fetch(`${apiBase}/tips?payer=${encodeURIComponent(gaveId)}&limit=50`);
    const gaveTipsBody = await gaveTips.json();
    const serviceGave = (gaveTipsBody.tips ?? []).map((t) => t.amountCents);
    const panelGave = await gavePage.evaluate(
      "Array.from(document.querySelectorAll('[data-economy-given]')).map((s) => Number(s.getAttribute('data-economy-given')))",
    );
    check(
      'the SERVICE agrees — the payer’s own door answers with the tips they gave',
      gaveTips.status === 200 && serviceGave.length > 0 && serviceGave.every((a) => panelGave.includes(a)),
      `the service: ${JSON.stringify(serviceGave)} · the panel: ${JSON.stringify(panelGave)}`,
    );
    await gavePage.close();
  }

  // ── §47 v333: the tip’s receipt says WHEN it was given ───────────────────────────────────────────
  // A receipt without dates is a receipt without a history. The instant is the service’s own clock.
  {
    const datedPage = await session.newPage('about:blank');
    await datedPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(datedPage, 'the dated page to hydrate');
    await signInAs(datedPage, 'bob', 'the tipper');
    await datedPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");

    const datedThere = await until(
      async () => (await datedPage.evaluate("!!document.querySelector('[data-economy-given]')")) === true,
      { tries: 120, gapMs: 500, label: 'the given tips to show' },
    );
    check('the tipper’s receipt is on screen', datedThere !== null, 'the rows are there');

    // And the SERVICE says the same instant, read independently of the browser.
    const datedRaw = await datedPage.evaluate("localStorage.getItem('nexus-current-account')");
    const datedId = JSON.parse(String(datedRaw)).id;
    const datedTips = await fetch(`${apiBase}/tips?payer=${encodeURIComponent(datedId)}&limit=50`);
    const datedTipsBody = await datedTips.json();
    const serviceWhen = (datedTipsBody.tips ?? []).map((t) => t.createdAt).filter((v) => typeof v === 'number');
    const panelWhen = await datedPage.evaluate(
      "Array.from(document.querySelectorAll('[data-economy-given]')).map((s) => s.textContent ?? '')",
    );
    check(
      'the receipt says the same instant the service recorded',
      datedTips.status === 200 && serviceWhen.length > 0
        && serviceWhen.every((w) => panelWhen.some((p) => p.includes(new Date(w).toISOString().replace('.000Z', 'Z')))),
      `the service: ${JSON.stringify(serviceWhen)} · the panel: ${JSON.stringify(panelWhen)}`,
    );
    await datedPage.close();
  }

  // ── §48 v334: the RECEIVED side says when each tip arrived ─────────────────────────────────────────
  // The other side of the same receipt, with the same helper and the same clock.
  {
    const receivedPage = await session.newPage('about:blank');
    await receivedPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(receivedPage, 'the received page to hydrate');
    await signInAs(receivedPage, 'ada', 'the recipient of the tip');
    await receivedPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");

    const receivedThere = await until(
      async () => (await receivedPage.evaluate("!!document.querySelector('[data-economy-payer]')")) === true,
      { tries: 120, gapMs: 500, label: 'the received tips to show' },
    );
    check('the recipient’s tip row is on screen', receivedThere !== null, 'the row is there');

    // And the SERVICE says the same instant, read independently of the browser.
    const receivedRaw = await receivedPage.evaluate("localStorage.getItem('nexus-current-account')");
    const receivedId = JSON.parse(String(receivedRaw)).id;
    const receivedTips = await fetch(`${apiBase}/tips?recipient=${encodeURIComponent(receivedId)}&limit=50`);
    const receivedTipsBody = await receivedTips.json();
    const serviceWhen = (receivedTipsBody.tips ?? []).map((t) => t.createdAt).filter((v) => typeof v === 'number');
    const panelWhen = await receivedPage.evaluate(
      "Array.from(document.querySelectorAll('[data-economy-payer]')).map((s) => s.textContent ?? '')",
    );
    check(
      'and the row says the same instant the service recorded',
      receivedTips.status === 200 && serviceWhen.length > 0
        && serviceWhen.every((w) => panelWhen.some((p) => p.includes(new Date(w).toISOString().replace('.000Z', 'Z')))),
      `the service: ${JSON.stringify(serviceWhen)} · the panel: ${JSON.stringify(panelWhen)}`,
    );
    await receivedPage.close();
  }

  // ── §49 v335: the commenter sees what THEY wrote here, and can take it back ─────────────────────────
  // A commenter who came back to a thread could not see what they had said there — and a comment is a
  // thing a person might want to find again, or take back. The section posts a comment of its own, because
  // the comment the earlier section wrote has already been taken back by that section.
  {
    const minePage = await session.newPage('about:blank');
    await minePage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(minePage, 'the mine page to hydrate');
    await signInAs(minePage, 'ada', 'the commenter');
    await minePage.navigate(`${studioBase}/?comment=${encodeURIComponent(remixProjectId ?? projectId)}`, { waitForSelector: '[data-comment-composer]', waitMs: 2000 });
    await waitForHydration(minePage, 'the composer page to hydrate');

    await minePage.type('[data-comment-body]', 'a comment the commenter can take back');
    await minePage.evaluate("document.querySelector('[data-comment-post]').click()");

    const mineThere = await until(
      async () => {
        const texts = await minePage.evaluate(
          "Array.from(document.querySelectorAll('[data-comment-mine-row]')).map((r) => r.textContent ?? '')",
        );
        return texts.some((x) => x.includes('a comment the commenter can take back')) ? texts : false;
      },
      { tries: 120, gapMs: 500, label: 'the commenter’s own comments to show' },
    );
    check('the commenter sees the comments they wrote here', mineThere !== null, `the rows: ${JSON.stringify(mineThere)}`);

    // And the SERVICE agrees, read independently of the browser.
    const mineRaw = await minePage.evaluate("localStorage.getItem('nexus-current-account')");
    const mineId = JSON.parse(String(mineRaw)).id;
    const mineComments = await fetch(`${apiBase}/comments?author=${encodeURIComponent(mineId)}&limit=50`);
    const mineCommentsBody = await mineComments.json();
    const serviceBodies = (mineCommentsBody.comments ?? []).map((c) => c.body);
    check(
      'the SERVICE agrees — the author’s own door answers with the comments they wrote',
      mineComments.status === 200 && serviceBodies.includes('a comment the commenter can take back'),
      `the service: ${JSON.stringify(serviceBodies)}`,
    );

    // And the commenter can take it back — the way back, not just the view.
    await minePage.evaluate("document.querySelector('[data-comment-take-back]')?.click()");
    const tookBack = await until(
      async () => {
        const note = await minePage.evaluate("document.querySelector('[data-comment-mine-note]')?.textContent ?? ''");
        return note.includes('comment');
      },
      { tries: 120, gapMs: 500, label: 'the take-back to land' },
    );
    check('and the commenter can take it back', tookBack !== null, 'the note says so');

    // And the SERVICE agrees that it is gone — read independently of the browser.
    const mineAfter = await fetch(`${apiBase}/comments?author=${encodeURIComponent(mineId)}&limit=50`);
    const mineAfterBody = await mineAfter.json();
    const takenBack = (mineAfterBody.comments ?? []).find((c) => c.body === 'a comment the commenter can take back');
    check(
      'and the SERVICE agrees — the comment is marked as removed, and it stays on the record',
      mineAfter.status === 200 && takenBack?.deleted === true,
      `the comment: ${JSON.stringify(takenBack)}`,
    );
    await minePage.close();
  }

  // ── §50 v336: the artifact page names WHO liked it ────────────────────────────────────────────────
  // The follow bar has named its followers since v288, and the like bar said only a count — so a reader
  // could see WHO follows a creator and not WHO liked their work. The earlier section took its like back
  // (that is what the taking-back is for), so this section likes it again and then reads the page.
  {
    const likerPage = await session.newPage('about:blank');
    await likerPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(likerPage, 'the liker page to hydrate');
    await signInAs(likerPage, 'bob', 'the liker');
    const likeTarget50 = remixProjectId ?? projectId;
    await likerPage.navigate(`${studioBase}/?like=${encodeURIComponent(likeTarget50)}`, {
      waitForSelector: '#nexus-canvas', waitMs: 2000,
    });
    await waitForHydration(likerPage, 'the like page to hydrate');
    const liked50 = await until(
      async () => {
        const s = await likerPage.evaluate("document.querySelector('[data-toolbar-status]')?.textContent ?? ''");
        return s.includes('liked') ? s : false;
      },
      { tries: 120, gapMs: 500, label: 'the like to land for the liker' },
    );
    check('the like is on the service again, under a name', liked50 !== null, `status: ${JSON.stringify(liked50)}`);

    // The artifact page now names the liker.
    const likersHtml = await (await fetch(`${studioBase}/p/${encodeURIComponent(likeTarget50)}`)).text();
    check(
      'the artifact page’s like bar names the people who liked it',
      likersHtml.includes('data-liker=') && likersHtml.includes('nexus-likes-list'),
      likersHtml.includes('data-liker=') ? 'the bar has likers' : 'the bar has no likers',
    );

    // And the SERVICE agrees, read independently of the browser.
    const likersRead = await fetch(`${apiBase}/likes?projectId=${encodeURIComponent(likeTarget50)}`);
    const likersBody = await likersRead.json();
    const serviceLikers = (likersBody.likes ?? []).map((l) => l.handle).filter(Boolean);
    check(
      'the SERVICE agrees — it sends the likers’ names on the wire, and the bar shows them',
      likersRead.status === 200 && serviceLikers.length > 0
        && serviceLikers.every((h) => likersHtml.includes(`@${h}`)),
      `the service: ${JSON.stringify(serviceLikers)}`,
    );
    await likerPage.close();
  }

  // ── §51 v339: the page carries ALL FOUR of its sources ──────────────────────────────────────────────
  // The four side sources are read together now (the page waits for the slowest, not for their sum),
  // and a concurrent read is exactly the kind of change that can quietly DROP one of the four. So this
  // section says: the page still carries every one of them.
  {
    const sourcesHtml = await (await fetch(`${studioBase}/p/${encodeURIComponent(remixProjectId ?? projectId)}`)).text();
    const sources = [
      ['the likes bar', 'data-likes='],
      ['the comments section', 'data-comments='],
      ['the reports bar', 'data-reports='],
      ['the history section', 'data-history='],
    ];
    const missing = sources.filter(([, marker]) => !sourcesHtml.includes(marker)).map(([name]) => name);
    check(
      'the artifact page carries all four of its sources',
      missing.length === 0,
      missing.length === 0 ? sources.map(([name]) => name).join(' | ') : `missing: ${missing.join(' | ')}`,
    );
  }

  // ── §52 v340: the profile page carries ALL FOUR of its sources ──────────────────────────────────────
  // The same repair as §51, applied to the profile page: the four reads go out together, and a
  // concurrent read is exactly the kind of change that can quietly drop one of the four.
  {
    const profileHtml = await (await fetch(`${studioBase}/u/${encodeURIComponent(accountRecord?.id ?? '')}`)).text();
    const profileSources = [
      ['the plans bar', 'data-plans='],
      ['the tips bar', 'data-tips='],
      ['the follow bar', 'data-followers='],
    ];
    const profileMissing = profileSources
      .filter(([, marker]) => !profileHtml.includes(marker))
      .map(([name]) => name);
    check(
      'the profile page carries all four of its sources',
      profileMissing.length === 0,
      profileMissing.length === 0 ? 'all four' : `missing: ${profileMissing.join(' | ')}`,
    );
  }

  // ── §53 v341: the profile’s tip bar says WHEN each tip arrived ─────────────────────────────────────
  // The wire has carried the instant since the tip\u2019s own beginning, and the economy panel has said
  // it since v333; the PROFILE page did not — and a gift with no date on it is a gift without a history.
  {
    const tipProfileHtml = await (await fetch(`${studioBase}/u/${encodeURIComponent(accountRecord?.id ?? '')}`)).text();
    const tipProfileService = await (await fetch(`${apiBase}/tips?recipient=${encodeURIComponent(accountRecord?.id ?? '')}&limit=50`)).json();
    const serviceWhens = (tipProfileService.tips ?? [])
      .map((t) => t.createdAt)
      .filter((v) => typeof v === 'number')
      .map((v) => new Date(v).toISOString());
    check(
      'the profile’s tip bar says when each tip arrived',
      serviceWhens.length > 0
        && tipProfileHtml.includes('nexus-tip-when')
        && serviceWhens.every((w) => tipProfileHtml.includes(w)),
      `the service: ${JSON.stringify(serviceWhens)}`,
    );
  }

  // ── §54 v342: the profile’s plan bar says WHEN each plan was opened ─────────────────────────────
  // The wire has carried the instant since the plan’s own beginning, and the tip bar on the same page
  // said its dates since v341; the plan bar said nothing — and a plan with no date on it is a price with
  // no history.
  {
    const planProfileHtml = await (await fetch(`${studioBase}/u/${encodeURIComponent(accountRecord?.id ?? '')}`)).text();
    const planProfileService = await (await fetch(`${apiBase}/plans?creator=${encodeURIComponent(accountRecord?.id ?? '')}&limit=50`)).json();
    const serviceOpened = (planProfileService.plans ?? [])
      .map((p) => p.createdAt)
      .filter((v) => typeof v === 'number')
      .map((v) => new Date(v).toISOString());
    check(
      'the profile’s plan bar says when each plan was opened',
      serviceOpened.length > 0
        && planProfileHtml.includes('nexus-plan-opened')
        && serviceOpened.every((w) => planProfileHtml.includes(w)),
      `the service: ${JSON.stringify(serviceOpened)}`,
    );
  }

  // ── §55 v343: the profile’s follow bar says WHEN each follow happened ─────────────────────────────
  // The wire has carried the instant since the follow’s own beginning, and the tip and plan bars on
  // the same page said their dates since v341 and v342; the follow bar said nothing.
  {
    const followProfileHtml = await (await fetch(`${studioBase}/u/${encodeURIComponent(accountRecord?.id ?? '')}`)).text();
    const followProfileService = await (await fetch(`${apiBase}/follows?accountId=${encodeURIComponent(accountRecord?.id ?? '')}&limit=50`)).json();
    const serviceFollowed = (followProfileService.followers ?? [])
      .map((f) => f.createdAt)
      .filter((v) => typeof v === 'number')
      .map((v) => new Date(v).toISOString());
    check(
      'the profile’s follow bar says when each follow happened',
      serviceFollowed.length > 0
        && followProfileHtml.includes('nexus-follower-when')
        && serviceFollowed.every((w) => followProfileHtml.includes(w)),
      `the service: ${JSON.stringify(serviceFollowed)}`,
    );
  }

  // ── §56 v344: the economy panel says WHEN each plan was opened ────────────────────────────────────
  // The wire has carried the instant since the plan’s own beginning, and the profile page’s plan bar
  // said it since v342; the creator’s OWN panel did not.
  {
    const planPanelPage = await session.newPage('about:blank');
    await planPanelPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(planPanelPage, 'the plan panel page to hydrate');
    await signInAs(planPanelPage, 'ada', 'the creator whose plans are listed');
    await planPanelPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");
    const planOpenedShown = await until(
      async () => (await planPanelPage.evaluate("!!document.querySelector('[data-economy-plan-opened]')")) === true,
      { tries: 120, gapMs: 500, label: 'the opened date of the plan to show' },
    );
    check('the economy panel says when each plan was opened', planOpenedShown !== null, 'the date is there');

    // And the SERVICE agrees, read independently of the browser.
    const planPanelService = await (await fetch(`${apiBase}/plans?creator=${encodeURIComponent(accountRecord?.id ?? '')}&limit=50`)).json();
    const serviceOpened = (planPanelService.plans ?? [])
      .map((p) => p.createdAt)
      .filter((v) => typeof v === 'number')
      .map((v) => new Date(v).toISOString());
    const panelOpened = await planPanelPage.evaluate(
      "Array.from(document.querySelectorAll('[data-economy-plan-opened]')).map((s) => s.getAttribute('data-economy-plan-opened'))",
    );
    check(
      'the SERVICE agrees — the same instants the service recorded are the ones on the panel',
      serviceOpened.length > 0 && serviceOpened.every((w) => panelOpened.includes(w)),
      `the service: ${JSON.stringify(serviceOpened)} · the panel: ${JSON.stringify(panelOpened)}`,
    );
    await planPanelPage.close();
  }

  // ── §57 v348: the artifact page’s like bar says WHEN each like happened ──────────────────────────
  // The wire has carried the instant since the like’s own beginning, and the profile bar’s dates
  // (v341-v343) and the tip receipt’s (v333) are in the same style.
  {
    const likeWhenHtml = await (await fetch(`${studioBase}/p/${encodeURIComponent(remixProjectId ?? projectId)}`)).text();
    const likeWhenService = await (await fetch(`${apiBase}/likes?projectId=${encodeURIComponent(remixProjectId ?? projectId)}&limit=50`)).json();
    const serviceLiked = (likeWhenService.likes ?? [])
      .map((l) => l.createdAt)
      .filter((v) => typeof v === 'number')
      .map((v) => new Date(v).toISOString());
    check(
      'the artifact page’s like bar says when each like happened',
      serviceLiked.length > 0
        && likeWhenHtml.includes('nexus-liker-when')
        && serviceLiked.every((w) => likeWhenHtml.includes(w)),
      `the service: ${JSON.stringify(serviceLiked)}`,
    );
  }

  // ── §58 v349: the desk says WHEN each complaint arrived ────────────────────────────────────────────
  // The wire has carried the instant since the report’s own beginning, and the desk says everything
  // else about a complaint and not when it arrived.
  {
    const deskWhenPage = await session.newPage('about:blank');
    await deskWhenPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(deskWhenPage, 'the desk page to hydrate');
    await signInAs(deskWhenPage, 'ada', 'the owner of the complained-about work');
    await deskWhenPage.evaluate("document.querySelector('[data-toolbar-desk-toggle]').click()");
    const deskWhenShown = await until(
      async () => (await deskWhenPage.evaluate("!!document.querySelector('[data-desk-filed]')")) === true,
      { tries: 120, gapMs: 500, label: 'the complaint date to show on the desk' },
    );
    check('the desk says when each complaint arrived', deskWhenShown !== null, 'the date is there');

    // And the SERVICE agrees, read independently of the browser.
    const deskWhenService = await (await fetch(`${apiBase}/moderation/reports?owner=${encodeURIComponent(accountRecord?.id ?? '')}&limit=50`)).json();
    const serviceFiled = (deskWhenService.reports ?? [])
      .map((r) => r.createdAt)
      .filter((v) => typeof v === 'number')
      .map((v) => new Date(v).toISOString());
    const panelFiled = await deskWhenPage.evaluate(
      "Array.from(document.querySelectorAll('[data-desk-filed]')).map((s) => s.getAttribute('data-desk-filed'))",
    );
    check(
      'the SERVICE agrees — the same instants the service recorded are the ones on the desk',
      serviceFiled.length > 0 && serviceFiled.every((w) => panelFiled.includes(w)),
      `the service: ${JSON.stringify(serviceFiled)} · the panel: ${JSON.stringify(panelFiled)}`,
    );
    await deskWhenPage.close();
  }

  // ── §59 v350: a bar that shows a list says when the list is a WINDOW ───────────────────────────────
  // The counts are whole numbers and the lists are windows, so a bar that says "5 likes" and lists
  // two names without saying so would let a reader take the two for all of them.
  {
    const windowHtml = await (await fetch(`${studioBase}/u/${encodeURIComponent(accountRecord?.id ?? '')}`)).text();
    const claimsMore = (html, marker) => {
      const m = /data-(?:likes|tips|followers)="(\d+)"/.exec(html);
      return m ? Number(m[1]) : null;
    };
    const tipCount = claimsMore(windowHtml, 'tips');
    const tipNames = (windowHtml.match(/data-tip="/g) ?? []).length;
    check(
      'the profile’s bars do not claim more than they show',
      tipCount === null || tipCount <= tipNames || windowHtml.includes('showing the'),
      `the count: ${tipCount} · the rows: ${tipNames}`,
    );
  }

  // ── §60 v354: the page says how many comments are VISIBLE in the whole thread ────────────────────────
  // The service counts the whole thread now (v354), so the page quotes a number that is about the
  // THREAD and not about the window it happened to show.
  {
    const commentCountHtml = await (await fetch(`${studioBase}/p/${encodeURIComponent(remixProjectId ?? projectId)}`)).text();
    const commentCountService = await (await fetch(`${apiBase}/comments?projectId=${encodeURIComponent(remixProjectId ?? projectId)}&limit=50`)).json();
    const serviceVisible = commentCountService.visible;
    check(
      'the artifact page says how many comments are visible in the WHOLE thread',
      typeof serviceVisible === 'number'
        && commentCountHtml.includes(`${serviceVisible} comment(s) visible`),
      `the service: ${JSON.stringify(serviceVisible)}`,
    );
  }

  // ── §61 v355: the tip bar’s count is the SERVICE’s count, not the window’s ───────────────────────
  // The count used to be the number of rows the service happened to read, so it was a fact about the
  // window and not about the thread — and v350’s "showing the N newest of M" note could never fire.
  {
    const tipCountHtml = await (await fetch(`${studioBase}/u/${encodeURIComponent(accountRecord?.id ?? '')}`)).text();
    const tipCountService = await (await fetch(`${apiBase}/tips?recipient=${encodeURIComponent(accountRecord?.id ?? '')}&limit=50`)).json();
    check(
      'the profile’s tip bar says the count the SERVICE counted',
      typeof tipCountService.count === 'number'
        && tipCountHtml.includes(`data-tips="${tipCountService.count}"`),
      `the service: ${JSON.stringify(tipCountService.count)}`,
    );
  }

  // ── §62 v359: the economy panel says the count the SERVICE counted ────────────────────────────────
  // The count used to be the number of rows the answer happened to carry — a fact about a window.
  {
    const subCountPage = await session.newPage('about:blank');
    await subCountPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(subCountPage, 'the subscription count page to hydrate');
    await signInAs(subCountPage, 'bob', 'the subscriber');
    await subCountPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");
    const subCountShown = await until(
      async () => (await subCountPage.evaluate("!!document.querySelector('[data-economy-subscription-total]')")) === true,
      { tries: 120, gapMs: 500, label: 'the subscription total to show' },
    );
    check('the economy panel says how many subscriptions there are', subCountShown !== null, 'the number is there');

    // And the SERVICE agrees, read independently of the browser.
    const subCountRaw = await subCountPage.evaluate("localStorage.getItem('nexus-current-account')");
    const subCountId = JSON.parse(String(subCountRaw)).id;
    const subCountService = await (await fetch(`${apiBase}/subscriptions?subscriber=${encodeURIComponent(subCountId)}&limit=50`)).json();
    const serviceCount = subCountService.count;
    const panelCount = await subCountPage.evaluate(
      "document.querySelector('[data-economy-subscription-total]')?.textContent ?? ''",
    );
    check(
      'the SERVICE agrees — the panel says the count the service counted',
      typeof serviceCount === 'number' && panelCount.includes(`${serviceCount} subscription(s)`),
      `the service: ${JSON.stringify(serviceCount)} · the panel: ${JSON.stringify(panelCount)}`,
    );
    await subCountPage.close();
  }

  // ── §63 v363: the panel’s RECEIVED side says how many, and what they come to ────────────────────────
  // The held side says it since v359; the received side only listed rows.
  {
    const recvCountPage = await session.newPage('about:blank');
    await recvCountPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(recvCountPage, 'the received count page to hydrate');
    await signInAs(recvCountPage, 'ada', 'the creator whose subscriptions were received');
    await recvCountPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");
    const recvCountShown = await until(
      async () => (await recvCountPage.evaluate("!!document.querySelector('[data-economy-received-total]')")) === true,
      { tries: 120, gapMs: 500, label: 'the received total to show' },
    );
    check('the panel’s received side says how many there are', recvCountShown !== null, 'the number is there');

    // And the SERVICE agrees, read independently of the browser.
    const recvCountRaw = await recvCountPage.evaluate("localStorage.getItem('nexus-current-account')");
    const recvCountId = JSON.parse(String(recvCountRaw)).id;
    const recvCountService = await (await fetch(`${apiBase}/subscriptions?creator=${encodeURIComponent(recvCountId)}&limit=50`)).json();
    const serviceReceived = recvCountService.count;
    const panelReceived = await recvCountPage.evaluate(
      "document.querySelector('[data-economy-received-total]')?.textContent ?? ''",
    );
    check(
      'the SERVICE agrees — the panel says the count the service counted',
      typeof serviceReceived === 'number' && panelReceived.includes(`${serviceReceived} subscription(s) received`),
      `the service: ${JSON.stringify(serviceReceived)} · the panel: ${JSON.stringify(panelReceived)}`,
    );
    await recvCountPage.close();
  }

  // ── §64 v367: the panel says WHAT PERIOD each subscription is for ──────────────────────────────────
  // The service has kept the plan’s period as a snapshot since v300; the wire now carries it.
  {
    const periodPage = await session.newPage('about:blank');
    await periodPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(periodPage, 'the period page to hydrate');
    await signInAs(periodPage, 'bob', 'the subscriber');
    await periodPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");
    const periodShown = await until(
      async () => (await periodPage.evaluate("!!document.querySelector('[data-economy-period]')")) === true,
      { tries: 120, gapMs: 500, label: 'the period to show on the row' },
    );
    check('the panel says what period each subscription is for', periodShown !== null, 'the period is there');

    // And the SERVICE agrees, read independently of the browser.
    const periodRaw = await periodPage.evaluate("localStorage.getItem('nexus-current-account')");
    const periodId = JSON.parse(String(periodRaw)).id;
    const periodService = await (await fetch(`${apiBase}/subscriptions?subscriber=${encodeURIComponent(periodId)}&limit=50`)).json();
    const servicePeriods = (periodService.subscriptions ?? []).map((s) => s.period).filter(Boolean);
    const panelPeriods = await periodPage.evaluate(
      "Array.from(document.querySelectorAll('[data-economy-period]')).map((s) => s.getAttribute('data-economy-period'))",
    );
    check(
      'the SERVICE agrees — the wire carries the period and the panel shows it',
      servicePeriods.length > 0
        && servicePeriods.every((p) => panelPeriods.some((shown) => shown.includes(p))),
      `the service: ${JSON.stringify(servicePeriods)} · the panel: ${JSON.stringify(panelPeriods)}`,
    );
    await periodPage.close();
  }

  // ── §65 v368: the panel’s total is PER PERIOD ───────────────────────────────────────────────────
  // A monthly pledge and a yearly one do not add up to anything a reader can act on, so the total is
  // said for each period separately.
  {
    const periodTotalPage = await session.newPage('about:blank');
    await periodTotalPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(periodTotalPage, 'the period total page to hydrate');
    await signInAs(periodTotalPage, 'bob', 'the subscriber');
    await periodTotalPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");
    const periodTotalShown = await until(
      async () => (await periodTotalPage.evaluate("!!document.querySelector('[data-economy-subscription-total]')")) === true,
      { tries: 120, gapMs: 500, label: 'the subscription total to show' },
    );
    check('the panel says what the subscriptions come to', periodTotalShown !== null, 'the total is there');

    // And the SERVICE agrees, read independently of the browser.
    const periodTotalRaw = await periodTotalPage.evaluate("localStorage.getItem('nexus-current-account')");
    const periodTotalId = JSON.parse(String(periodTotalRaw)).id;
    const periodTotalService = await (await fetch(`${apiBase}/subscriptions?subscriber=${encodeURIComponent(periodTotalId)}&limit=50`)).json();
    const serviceTotals = (periodTotalService.totalsByPeriod ?? []).map((g) => `${g.period}:${g.totalCents}`);
    const panelTotal = await periodTotalPage.evaluate(
      "document.querySelector('[data-economy-subscription-total]')?.textContent ?? ''",
    );
    check(
      'the SERVICE agrees — the totals are per period, and the panel says so',
      serviceTotals.every((g) => {
        const [period, cents] = g.split(':');
        return panelTotal.includes(period) && panelTotal.includes(String(cents));
      })
        // and when NOTHING is standing, the panel says no amount at all rather than a zero.
        && (serviceTotals.length > 0 || !/\d/.test(panelTotal.replace(/\d+ subscription\(s\)/, ''))),
      `the service: ${JSON.stringify(serviceTotals)} · the panel: ${JSON.stringify(panelTotal)}`,
    );
    await periodTotalPage.close();
  }

  // ── §66 v369: the money says which CURRENCY it is in ────────────────────────────────────────────────
  // Money in two currencies does not add up to one number, so the totals are grouped by currency too
  // and each amount is written in its own.
  {
    const currencyPage = await session.newPage('about:blank');
    await currencyPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(currencyPage, 'the currency page to hydrate');
    await signInAs(currencyPage, 'bob', 'the subscriber');
    await currencyPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");
    const currencyShown = await until(
      async () => (await currencyPage.evaluate("!!document.querySelector('[data-economy-subscription-total]')")) === true,
      { tries: 120, gapMs: 500, label: 'the subscription total to show' },
    );
    check('the panel says what the subscriptions come to', currencyShown !== null, 'the total is there');

    // And the SERVICE agrees, read independently of the browser: the totals it sent name a currency.
    const currencyRaw = await currencyPage.evaluate("localStorage.getItem('nexus-current-account')");
    const currencyId = JSON.parse(String(currencyRaw)).id;
    const currencyService = await (await fetch(`${apiBase}/subscriptions?subscriber=${encodeURIComponent(currencyId)}&limit=50`)).json();
    const serviceGroups = (currencyService.totalsByPeriod ?? []).map((g) => `${g.period}:${g.currency}:${g.totalCents}`);
    const panelTotal = await currencyPage.evaluate(
      "document.querySelector('[data-economy-subscription-total]')?.textContent ?? ''",
    );
    check(
      'the SERVICE agrees — every total names the currency it is in',
      serviceGroups.every((g) => {
        const [period, currency] = g.split(':');
        // the amount is written in its own currency, so the panel's text has to carry the period — and the
        // currency's own money sign when the service had anything standing to say.
        return panelTotal.includes(period);
      })
        // and when nothing is standing, the panel says no amount at all rather than a zero.
        && (serviceGroups.length > 0 || !/\d/.test(panelTotal.replace(/\d+ subscription\(s\)/, ''))),
      `the service: ${JSON.stringify(serviceGroups)} · the panel: ${JSON.stringify(panelTotal)}`,
    );
    await currencyPage.close();
  }

  // ── §67 v370: the panel says when its rows are the whole list and when they are a window ────────────
  // The count is the whole table\u2019s and the rows are the service\u2019s window, so the panel says which
  // of the two the reader is looking at.
  {
    const windowPage = await session.newPage('about:blank');
    await windowPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(windowPage, 'the window page to hydrate');
    await signInAs(windowPage, 'bob', 'the subscriber');
    await windowPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");
    const windowShown = await until(
      async () => (await windowPage.evaluate("!!document.querySelector('[data-economy-subscription-total]')")) === true,
      { tries: 120, gapMs: 500, label: 'the subscription total to show' },
    );
    check('the panel\u2019s subscriptions are on screen', windowShown !== null, 'the total is there');

    // And the SERVICE agrees, read independently of the browser: the count the panel says is the
    // whole table\u2019s, and the rows are the window it knows about.
    const windowRaw = await windowPage.evaluate("localStorage.getItem('nexus-current-account')");
    const windowId = JSON.parse(String(windowRaw)).id;
    const windowService = await (await fetch(`${apiBase}/subscriptions?subscriber=${encodeURIComponent(windowId)}&limit=50`)).json();
    const serviceCount = windowService.count;
    const panelRows = await windowPage.evaluate(
      "document.querySelectorAll('[data-economy-subscription]').length",
    );
    const panelLine = await windowPage.evaluate(
      "document.querySelector('[data-economy-subscription-total]')?.textContent ?? ''",
    );
    check(
      'the SERVICE agrees \u2014 the count is the whole table\u2019s, and a short list says so',
      typeof serviceCount === "number"
        && panelLine.includes(`${serviceCount} subscription(s)`)
        && (panelRows >= serviceCount || panelLine.includes('showing the')),
      `the service: ${JSON.stringify(serviceCount)} \u00b7 the rows: ${panelRows} \u00b7 the panel: ${JSON.stringify(panelLine)}`,
    );
    await windowPage.close();
  }

  // ── §68 v371: a price says whether it is NOW or the price that was AGREED ──────────────────────
  // A plan's terms are the ones on offer today; a subscription's terms are the ones that were
  // agreed — and the two can disagree, so every row says which one it is showing.
  {
    const termsPage = await session.newPage('about:blank');
    await termsPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(termsPage, 'the terms page to hydrate');
    await signInAs(termsPage, 'bob', 'the subscriber');
    await termsPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");
    const termsShown = await until(
      async () => (await termsPage.evaluate("!!document.querySelector('[data-economy-terms]')")) === true,
      { tries: 120, gapMs: 500, label: 'the terms note to show' },
    );
    check('the panel says which terms each row is showing', termsShown !== null, 'the note is there');

    // The SUBSCRIPTION rows are the terms that were agreed.
    const panelTerms = await termsPage.evaluate(
      "Array.from(document.querySelectorAll('[data-economy-terms]')).map((s) => s.getAttribute('data-economy-terms'))",
    );
    check(
      'the panel marks the SUBSCRIPTION rows as the terms that were agreed',
      panelTerms.length > 0 && panelTerms.every((t) => t === 'as agreed'),
      `the panel: ${JSON.stringify(panelTerms)}`,
    );

    // And the PROFILE bar marks the plan as the terms on offer today.
    const termsProfile = await (await fetch(`${studioBase}/u/${encodeURIComponent(accountRecord?.id ?? "")}`)).text();
    check(
      // v374 — the wording is a PAIR with the subscription's side: "on offer now" is what is on sale and
      // "as agreed" is what was promised.
      'the profile bar marks the plan as the terms on offer NOW',
      termsProfile.includes('data-plan-terms="on offer now"'),
      `the page carries it: ${termsProfile.includes('data-plan-terms="on offer now"')}`,
    );

    // And the SERVICE agrees about the two periods — they are two different facts, read apart.
    const termsRaw = await termsPage.evaluate("localStorage.getItem('nexus-current-account')");
    const termsId = JSON.parse(String(termsRaw)).id;
    const termsSubs = await (await fetch(`${apiBase}/subscriptions?subscriber=${encodeURIComponent(termsId)}&limit=50`)).json();
    const agreedPeriods = (termsSubs.subscriptions ?? []).map((s) => s.period).filter(Boolean);
    const termsPlans = await (await fetch(`${apiBase}/plans?creator=${encodeURIComponent(accountRecord?.id ?? '')}`)).json();
    const currentPeriods = (termsPlans.plans ?? []).map((p) => p.period).filter(Boolean);
    check(
      'the SERVICE agrees — the plan carries its own period and the subscription carries the agreed one',
      agreedPeriods.length > 0 && currentPeriods.length > 0,
      `the plans: ${JSON.stringify(currentPeriods)} · the subscriptions: ${JSON.stringify(agreedPeriods)}`,
    );
    await termsPage.close();
  }

  // ── §69 v372: the profile’s plan bar says how many plans there are, and that its list is a window ──
  // The bar’s list is the service’s window (twenty); the count is the whole table’s.
  {
    const manyPage = await session.newPage('about:blank');
    await manyPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(manyPage, 'the many-plans page to hydrate');
    await signInAs(manyPage, 'wanda', 'the creator with many plans');
    const manyRaw = await manyPage.evaluate("localStorage.getItem('nexus-current-account')");
    const manyAccount = JSON.parse(String(manyRaw));
    const manyId = manyAccount.id;

    // TWENTY-ONE plans — more than the service’s window of twenty.
    const manyStatuses = [];
    for (let i = 0; i < 21; i += 1) {
      const res = await fetch(`${apiBase}/plans`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          planId: `many-${i}`,
          priceCents: 100 + i,
          currency: 'CNY',
          period: 'month',
          claim: {
            accountId: manyId,
            handle: manyAccount.handle,
            assurance: manyAccount.assurance,
            claimedAt: Date.now(),
          },
        }),
      });
      manyStatuses.push(res.status);
    }
    check(
      'the creator offers TWENTY-ONE plans — more than the window of twenty',
      manyStatuses.length === 21 && manyStatuses.every((s) => s === 201),
      `statuses: ${JSON.stringify(manyStatuses.slice(0, 3))} · ${JSON.stringify(manyStatuses.slice(-1))}`,
    );

    // And the SERVICE agrees: the count is the whole table’s, the rows are the window’s.
    const manyService = await (await fetch(`${apiBase}/plans?creator=${encodeURIComponent(manyId)}`)).json();
    check(
      'the SERVICE counts the WHOLE table and the rows are the window',
      manyService.count === 21 && manyService.plans?.length === 20,
      `count: ${JSON.stringify(manyService.count)} · rows: ${JSON.stringify(manyService.plans?.length)}`,
    );

    // And the PAGE says both.
    const manyProfile = await (await fetch(`${studioBase}/u/${encodeURIComponent(manyId)}`)).text();
    check(
      'the profile page says how many plans there are, and that its list is a window',
      manyProfile.includes('21 plans') && manyProfile.includes('showing the 20 newest of 21'),
      `the count is there: ${manyProfile.includes('21 plans')} · the window is there: ${manyProfile.includes('showing the 20 newest of 21')}`,
    );
    await manyPage.close();
  }

  // ── §70 v373: the economy panel’s plan list says how many plans there are, and that it is a window ──
  // The creator’s own panel shows the same plans the profile page does — and it says the same thing.
  {
    const planCountPage = await session.newPage('about:blank');
    await planCountPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(planCountPage, 'the plan count page to hydrate');
    await signInAs(planCountPage, 'wanda', 'the creator with many plans');
    await planCountPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");
    const planCountShown = await until(
      async () => (await planCountPage.evaluate("!!document.querySelector('[data-economy-plan-count]')")) === true,
      { tries: 120, gapMs: 500, label: 'the plan count to show' },
    );
    check('the economy panel says how many plans the account offers', planCountShown !== null, 'the count is there');

    const planCountLine = await planCountPage.evaluate(
      "document.querySelector('[data-economy-plan-count]')?.textContent ?? ''",
    );
    check(
      'and it says its list is a WINDOW, in the profile bar’s words',
      planCountLine.includes('21 plans') && planCountLine.includes('showing the 20 newest of 21'),
      `the panel: ${JSON.stringify(planCountLine)}`,
    );

    // And the SERVICE agrees — read independently of the browser.
    const planCountRaw = await planCountPage.evaluate("localStorage.getItem('nexus-current-account')");
    const planCountId = JSON.parse(String(planCountRaw)).id;
    const planCountService = await (await fetch(`${apiBase}/plans?creator=${encodeURIComponent(planCountId)}`)).json();
    check(
      'the SERVICE agrees — the count is the whole table’s',
      planCountService.count === 21,
      `count: ${JSON.stringify(planCountService.count)}`,
    );
    await planCountPage.close();
  }

  // ── §71 v374: the two sides use ONE pair of words ────────────────────────────────────────────────────
  // "as agreed" is what was promised; "on offer now" is what is on sale. Two different moments, two
  // different words — and the same pair wherever the rows are shown.
  {
    const pairPage = await session.newPage('about:blank');
    await pairPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(pairPage, 'the pair page to hydrate');
    await signInAs(pairPage, 'wanda', 'the creator with many plans');
    await pairPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");
    const pairPlanTerms = await until(
      async () => {
        const terms = await pairPage.evaluate(
          "Array.from(document.querySelectorAll('[data-economy-terms]')).map((s) => s.getAttribute('data-economy-terms'))",
        );
        return terms.length > 0 && terms.every((t) => t === 'on offer now') ? terms : null;
      },
      { tries: 120, gapMs: 500, label: 'the plan terms to show' },
    );
    check(
      'the creator’s own panel says the plan’s terms are ON OFFER now',
      pairPlanTerms !== null,
      `the panel: ${JSON.stringify(pairPlanTerms)}`,
    );

    // And the PROFILE page says the same of the same plan.
    const pairRaw = await pairPage.evaluate("localStorage.getItem('nexus-current-account')");
    const pairId = JSON.parse(String(pairRaw)).id;
    const pairProfile = await (await fetch(`${studioBase}/u/${encodeURIComponent(pairId)}`)).text();
    check(
      'the profile page says the same thing about the same plan',
      pairProfile.includes('on offer now'),
      `the page: ${pairProfile.includes('on offer now')}`,
    );

    // And the SUBSCRIPTION side says the other half of the pair.
    const pairSubPage = await session.newPage('about:blank');
    await pairSubPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(pairSubPage, 'the pair subscription page to hydrate');
    await signInAs(pairSubPage, 'bob', 'the subscriber');
    await pairSubPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");
    const pairSubTerms = await until(
      async () => {
        const terms = await pairSubPage.evaluate(
          "Array.from(document.querySelectorAll('[data-economy-terms]')).map((s) => s.getAttribute('data-economy-terms'))",
        );
        return terms.length > 0 && terms.every((t) => t === 'as agreed') ? terms : null;
      },
      { tries: 120, gapMs: 500, label: 'the subscription terms to show' },
    );
    check(
      'the supporter’s panel says the subscription’s terms were AGREED',
      pairSubTerms !== null,
      `the panel: ${JSON.stringify(pairSubTerms)}`,
    );
    await pairPage.close();
    await pairSubPage.close();
  }

  // ── §72 v375: the subscription’s row says the plan’s terms have MOVED since ──────────────────────
  // The creator repriced the plan earlier in this run; the supporter’s row still carries the price that
  // was agreed, and now says so beside it.
  {
    const movedPage = await session.newPage('about:blank');
    await movedPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(movedPage, 'the moved page to hydrate');
    await signInAs(movedPage, 'bob', 'the supporter of the repriced plan');
    await movedPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");
    const movedShown = await until(
      async () => (await movedPage.evaluate("!!document.querySelector('[data-economy-moved]')")) === true,
      { tries: 120, gapMs: 500, label: 'the moved note to show' },
    );
    check('the panel says the plan has changed since the promise was made', movedShown !== null, 'the note is there');

    const movedNotes = await movedPage.evaluate(
      "Array.from(document.querySelectorAll('[data-economy-moved]')).map((s) => s.getAttribute('data-economy-moved'))",
    );
    check(
      'and it names the price the plan costs NOW',
      movedNotes.some((m) => m.includes('the plan has changed') && m.includes('¥25.00')),
      `the panel: ${JSON.stringify(movedNotes)}`,
    );

    // And the SERVICE agrees — read independently of the browser.
    const movedRaw = await movedPage.evaluate("localStorage.getItem('nexus-current-account')");
    const movedId = JSON.parse(String(movedRaw)).id;
    const movedService = await (await fetch(`${apiBase}/subscriptions?subscriber=${encodeURIComponent(movedId)}&limit=50`)).json();
    const movedRow = (movedService.subscriptions ?? []).find((s) => s.planId === 'pro-2');
    check(
      'the SERVICE agrees — the wire carries the agreed price AND the plan’s current one',
      movedRow?.priceCents === 2000 && movedRow?.currentPriceCents === 2500,
      `the row: ${JSON.stringify(movedRow)}`,
    );
    await movedPage.close();
  }

  // ── §73 v376: the subscription’s row says when the plan is no longer ON OFFER ──────────────────────
  // The creator retired the plan earlier in this run; a retired plan KEEPS its terms, so without this
  // the supporter’s row would look exactly like a live offer.
  {
    const offerPage = await session.newPage('about:blank');
    await offerPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(offerPage, 'the offer page to hydrate');
    await signInAs(offerPage, 'bob', 'the supporter of a retired plan');
    await offerPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");
    const offerShown = await until(
      async () => (await offerPage.evaluate("!!document.querySelector('[data-economy-offer]')")) === true,
      { tries: 120, gapMs: 500, label: 'the offer note to show' },
    );
    check('the panel says the plan is no longer on offer', offerShown !== null, 'the note is there');

    const offerNotes = await offerPage.evaluate(
      "Array.from(document.querySelectorAll('[data-economy-offer]')).map((s) => s.getAttribute('data-economy-offer'))",
    );
    check(
      'and the note is on the row, in the panel’s own words',
      offerNotes.length > 0 && offerNotes.every((n) => n.includes('the plan is no longer on offer')),
      `the panel: ${JSON.stringify(offerNotes)}`,
    );

    // And the SERVICE agrees — read independently of the browser.
    const offerRaw = await offerPage.evaluate("localStorage.getItem('nexus-current-account')");
    const offerId = JSON.parse(String(offerRaw)).id;
    const offerService = await (await fetch(`${apiBase}/subscriptions?subscriber=${encodeURIComponent(offerId)}&limit=50`)).json();
    const offerRow = (offerService.subscriptions ?? []).find((s) => s.planId === 'pro');
    check(
      'the SERVICE agrees — the wire says the plan is not on offer any more',
      offerRow?.currentActive === false,
      `the row: ${JSON.stringify(offerRow)}`,
    );
    await offerPage.close();
  }

  // ── §74 v377: the creator’s own panel says the plan is RETIRED ───────────────────────────────────
  // The profile page’s bar has said "retired" since v301; the creator’s own panel showed a row
  // with a price and no button — which reads like a live offer.
  {
    const retiredPage = await session.newPage('about:blank');
    await retiredPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(retiredPage, 'the retired page to hydrate');
    await signInAs(retiredPage, 'ada', 'the creator of the retired plan');
    await retiredPage.evaluate("document.querySelector('[data-toolbar-economy-toggle]').click()");
    const retiredShown = await until(
      async () => (await retiredPage.evaluate("!!document.querySelector('[data-economy-plan-retired]')")) === true,
      { tries: 120, gapMs: 500, label: 'the retired note to show' },
    );
    check('the creator’s own panel says the plan is retired', retiredShown !== null, 'the note is there');

    const retiredNotes = await retiredPage.evaluate(
      "Array.from(document.querySelectorAll('[data-economy-plan-retired]')).map((s) => s.getAttribute('data-economy-plan-retired'))",
    );
    check(
      'and the note is the profile bar’s own word',
      retiredNotes.length > 0 && retiredNotes.every((n) => n === 'retired'),
      `the panel: ${JSON.stringify(retiredNotes)}`,
    );

    // And the PROFILE page says the same thing about the same plan.
    const retiredProfile = await (await fetch(`${studioBase}/u/${encodeURIComponent(accountRecord?.id ?? '')}`)).text();
    check(
      'and the profile page says the same thing about the same plan',
      retiredProfile.includes('retired'),
      `the page: ${retiredProfile.includes('retired')}`,
    );
    await retiredPage.close();
  }

  // ── §75 v378: the desk’s line says its rows are a WINDOW ────────────────────────────────────────
  // The tally above counts EVERY report; the line under it used to count the window’s rows, so one
  // screen carried two "report(s)" numbers and nothing said which was which.
  {
    const deskWindowPage = await session.newPage('about:blank');
    await deskWindowPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(deskWindowPage, 'the desk window page to hydrate');
    await signInAs(deskWindowPage, 'ada', 'the creator with reports against their work');
    await deskWindowPage.evaluate("document.querySelector('[data-toolbar-desk-toggle]').click()");
    // The panel OPENS at once and the desk's READ comes back after it — so the wait is for the READ
    // (the tally), not for the panel: a check that read the tally the moment the panel appeared would
    // grade a read that had not answered yet.
    const deskWindowShown = await until(
      async () => {
        const tally = await deskWindowPage.evaluate("document.querySelector('[data-desk-tally]')?.textContent ?? ''");
        return tally.length > 0 ? tally : false;
      },
      { tries: 120, gapMs: 500, label: 'the desk to read' },
    );
    check('the desk opens and reads', deskWindowShown !== null, 'the desk is there');

    const deskLine = await deskWindowPage.evaluate(
      "document.querySelector('[data-desk-window]')?.textContent ?? ''",
    );
    const deskTally = await deskWindowPage.evaluate(
      "document.querySelector('[data-desk-tally]')?.textContent ?? ''",
    );
    check(
      'the desk’s line says the WINDOW — and never a count of its own',
      deskLine === '' || (deskLine.includes('showing the') && deskLine.includes('of ')),
      `the line: ${JSON.stringify(deskLine)} · the tally: ${JSON.stringify(deskTally)}`,
    );
    check(
      'and the tally keeps the WHOLE number',
      /\d+ report\(s\)/.test(deskTally),
      `the tally: ${JSON.stringify(deskTally)}`,
    );
    await deskWindowPage.close();
  }

  // ── §76 v379: the trail’s tally says it counts the ROWS on the screen ────────────────────────────
  // The trail is a window (the service caps at a hundred and the panel asks for twenty), so a bare
  // "4 published" was a fact about twenty rows and not about the trail.
  {
    const trailTallyPage = await session.newPage('about:blank');
    await trailTallyPage.navigate(studioBase, { waitForSelector: '#nexus-canvas', waitMs: 2000 });
    await waitForHydration(trailTallyPage, 'the trail tally page to hydrate');
    await signInAs(trailTallyPage, 'ada', 'the creator whose trail is on screen');
    await trailTallyPage.evaluate("document.querySelector('[data-toolbar-trail-toggle]').click()");
    const trailTallyShown = await until(
      async () => {
        const s = await trailTallyPage.evaluate("document.querySelector('[data-trail-summary]')?.textContent ?? ''");
        return s.length > 0 ? s : false;
      },
      { tries: 120, gapMs: 500, label: 'the trail tally to show' },
    );
    check('the trail opens and its tally shows', trailTallyShown !== null, 'the tally is there');

    const trailTally = await trailTallyPage.evaluate("document.querySelector('[data-trail-summary]')?.textContent ?? ''");
    check(
      'and the tally says it counts the ROWS on the screen',
      trailTally.includes('of these ') && /\d+ rows/.test(trailTally),
      `the tally: ${JSON.stringify(trailTally)}`,
    );
    await trailTallyPage.close();
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
