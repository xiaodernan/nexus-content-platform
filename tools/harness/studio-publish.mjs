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
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';
import { sweepLeftoverDatabases } from './leakSweep.mjs';

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
  // Waited for with a REPORTING failure rather than `waitForFunction`, whose timeout says only that a
  // condition was not met. The Studio compiles its routes on demand, so the first request to `/api/publish`
  // in a dev server can take a while — and if the note says something else entirely, that is the fact worth
  // printing.
  const ready = await until(
    async () => {
      const note = await page.evaluate("document.querySelector('[data-toolbar-publish-note]')?.textContent ?? null");
      return note && note.includes('service ready') ? note : false;
    },
    { tries: 60, gapMs: 500, label: 'the Studio to report the service ready' },
  );
  const noteNow = await page.evaluate("document.querySelector('[data-toolbar-publish-note]')?.textContent ?? null");
  check('the Studio probes the service on mount and reports it ready', ready !== false && ready !== null, `note: ${JSON.stringify(noteNow)}`);
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
    await page.evaluate("document.querySelector('button[title=\"Account\"]').click()");
    const panelUp = await until(
      async () => (await page.evaluate("document.querySelectorAll('[data-toolbar-account]').length")) === 1,
      { tries: 20, gapMs: 200, label: 'the account panel to open' },
    );
    check('the account panel opens on the toolbar control', panelUp, 'the account face is reachable from the product');
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
    check('remixing it in the Studio forks it into a NEW project', remixed !== false, `note: ${JSON.stringify(remixed)}`);

    // Publish the FORK. Its project id is read from the note the SERVICE's URL put there — the same way
    // the source's was — because `window.__nexus` deliberately exposes no document id.
    await page.evaluate("document.querySelector('[data-toolbar-publish]').click()");
    const forkPublished = await until(
      async () => {
        const note = await page.evaluate("document.querySelector('[data-toolbar-publish-note]')?.textContent ?? ''");
        return note.startsWith('published') ? note : false;
      },
      { tries: 40, gapMs: 500, label: 'the fork to be published' },
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
    check('the visitor remix forked the publication into a new project, with no button pressed', visitorStatus !== false, `status: ${JSON.stringify(visitorStatus)}`);

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
    refused !== false && String(refused).includes('not taken down') && String(refused).includes('may not take it down'),
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
    { timeout: 20000 },
  );
  check('pressing “take down” removes the row from the list', rowGone === true, 'the row is no longer rendered');

  // And the ROW is really gone from the database — the list is the service's answer, not a local edit.
  const afterUnpublish = await fetch(`${apiBase}/projects/${encodeURIComponent(projectId)}`);
  check('and the publication is gone from the SERVICE', afterUnpublish.status === 404, `GET answered ${afterUnpublish.status}`);

  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  const png = Buffer.from(shot.data, 'base64');
  const shotPath = join(REPO_ROOT, '.scratch', 'v194', 'studio-publish.png');
  const { mkdirSync, writeFileSync } = await import('node:fs');
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
    check('opening it asks the service and renders what it recorded', trailRows !== false, `${trailRows === false ? 0 : trailRows.length} entr(y/ies)`);
    // A failed read leaves the marker FALSE above; every later check then sees an EMPTY trail rather than a thrown
    // TypeError, so the section reports its failures instead of killing the run.
    const rows = trailRows === false ? [] : trailRows;

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

    // The service's OWN count beside what was rendered — so a row the reading half dropped is visible as a
    // discrepancy rather than invisible.
    const footer = await page.evaluate("document.querySelector('[data-toolbar-trail]')?.textContent ?? ''");
    const stated = /(\d+) of (\d+) entry\(ies\) shown · the service caps at (\d+)/.exec(footer);
    check(
      'the trail states the service’s count beside what it rendered',
      // group 1 = rows rendered, group 2 = the count the SERVICE reported: rendered can never exceed it,
      // and a smaller number is exactly the discrepancy the two-number footer exists to expose.
      stated !== null && Number(stated[1]) <= Number(stated[2]) && Number(stated[3]) >= 1,
      `${stated ? stated[0] : JSON.stringify(footer.slice(-120))}`,
    );
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
  console.log('[§10] teardown: Studio, service and the throwaway database are all gone');
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
