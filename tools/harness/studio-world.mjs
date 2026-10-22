/**
 * M4 v162 — the world surface in a REAL browser (ADR 0017 harness).
 *
 * The unit suite and the headless proof (`docs/evidence/studio/world-surface-proof.mjs`) both run against
 * the SHIPPED Studio module and both of them say the same thing about the browser: *not checked here*.
 * This file is that check. It drives the real Studio bundle over CDP and asks the questions only a
 * browser can answer:
 *
 *   1. the 2D canvas is still the DEFAULT, and it still paints — the world surface must not have
 *      displaced the thing every earlier milestone was verified against;
 *   2. pressing `World` mounts `#nexus-world`, and the Studio moves to that surface;
 *   3. the read-only bridge answers, and it describes the world the ENGINE holds — counts, names and
 *      every character's place (v162: FOUR characters, two of them seated together at the ford);
 *   4. what is ON SCREEN is the same world the bridge reports, so the panel is not a second story;
 *   5. v162 — the surface STEPS the world: before any step the relationships section shows its empty
 *      state, one press of `Step ×1` runs the engine's own `tickOnce()` and must reproduce the
 *      deterministic trace the headless proof pinned (4 decisions · 2 actions · the newborn Mira↔Toma
 *      bond listed from BOTH sides at 13), and `Step ×5` pushes the tick counter to 6 with the decay
 *      floor and the band vocabulary still holding;
 *   6. the surface names its own mode (`DEMO MODE`) rather than letting a reader assume a model;
 *   7. v191 — the surface PERSISTS: `save to disk` writes the engine's own save() file through the
 *      server lane and the note reports the byte count, the file is read back off the REAL disk
 *      with node:fs (a world save, at the tick the bridge reported), the disk rows list it, and
 *      loading the row hands the file back to the engine's own load() — a step past the save, then
 *      load, and the bridge counts the SAVED tick again with the bonds restored.
 *
 * Usage: node tools/harness/studio-world.mjs [--url http://127.0.0.1:3210] [--out DIR]
 *
 * The Studio must be running first: from `apps/studio`, `NODE_OPTIONS= ../../node_modules/.bin/next
 * dev -p 3210`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, sleep } from './cdp.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const URL_BASE = arg('url', 'http://127.0.0.1:3210');
const OUT_DIR = arg('out', '.scratch/v162');
mkdirSync(OUT_DIR, { recursive: true });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`);
};

const session = await launch({ width: 1440, height: 900 });
const page = await session.newPage('about:blank');

// The Simulate row's running commentary — read and whitespace-normalized for assertions.
const lastTickExpr = "(() => (document.querySelector('[data-world-last-tick]')?.innerText ?? '').replace(/\\s+/g, ' '))()";
const waitLastTick = async (pred, timeout = 20000) => {
  const end = Date.now() + timeout;
  for (;;) {
    const text = await page.evaluate(lastTickExpr);
    if (pred(text)) return text;
    if (Date.now() > end) throw new Error(`timeout waiting for the last-tick line, last saw: ${JSON.stringify(text)}`);
    await sleep(100);
  }
};
const pairRows = async () =>
  page.evaluate("[...document.querySelectorAll('[data-world-relationships] [data-pair]')].map((li) => li.innerText.replace(/\\s+/g, ' ').trim())");

try {
  await page.navigate(`${URL_BASE}/`, { waitForSelector: '#nexus-canvas', waitMs: 700 });

  // 1. the default surface is still the 2D canvas, and it still paints.
  const before = await page.evaluate(
    "(() => ({ surface: document.querySelector('[data-surface]')?.getAttribute('data-surface') ?? null, has2d: !!document.getElementById('nexus-canvas'), hasWorld: !!document.getElementById('nexus-world') }))()",
  );
  check('the Studio still opens on the 2D canvas', before.surface === '2d' && before.has2d && !before.hasWorld, JSON.stringify(before));
  const beforePx = await page.canvasStats('#nexus-canvas');
  check('the 2D canvas still paints', beforePx && beforePx.nonEmpty > 1000, beforePx ? `${beforePx.nonEmpty}/${beforePx.total} px painted` : 'no canvas');

  // 2. the World toggle mounts the world surface.
  const clicked = await page.evaluate(
    "(() => { const b = document.querySelector('[data-surface-toggle=\"world\"]'); if (!b) return false; b.click(); return true; })()",
  );
  check('the toolbar exposes a World toggle', clicked === true, `toggle clicked: ${clicked}`);
  await page.waitForSelector('#nexus-world', 15000);
  const after = await page.evaluate(
    "(() => ({ surface: document.querySelector('[data-surface]')?.getAttribute('data-surface') ?? null, has2d: !!document.getElementById('nexus-canvas'), hasWorld: !!document.getElementById('nexus-world') }))()",
  );
  check('pressing World swaps the surface (and unmounts the 2D canvas)', after.surface === 'world' && after.hasWorld && !after.has2d, JSON.stringify(after));

  // 3. the bridge answers, and it describes the engine's world — v162 seats FOUR characters.
  const report = await page.evaluate('window.__nexusWorld ? window.__nexusWorld.world() : null');
  check('the read-only bridge answers for the world surface', report !== null && typeof report === 'object', JSON.stringify(report)?.slice(0, 240));
  check(
    'the report names the composed world, its counts and its contents',
    report?.name === 'New World' &&
      report?.genre === 'fantasy' &&
      report?.stats?.locations === 3 &&
      report?.stats?.characters === 4 &&
      report?.stats?.lore === 2 &&
      JSON.stringify(report?.locations?.map((l) => l.name)) === JSON.stringify(['Ashen Ford', 'The Grey Ridge', 'Lowmarch']) &&
      JSON.stringify(report?.characters?.map((c) => c.name)) === JSON.stringify(['Mira', 'Toma', 'Cassian', 'Vane']),
    JSON.stringify({ name: report?.name, stats: report?.stats, characters: report?.characters?.map((c) => c.name) }),
  );

  // 4. every character has a PLACE, and it is a real location's name — the relation the composer
  //    intends and the thing a flat list would hide.
  const places = (report?.characters ?? []).map((c) => c.locationName);
  const locationNames = (report?.locations ?? []).map((l) => l.name);
  check(
    'every character stands in a location the world holds',
    places.length === 4 && places.every((p) => p && locationNames.includes(p)),
    JSON.stringify(report?.characters?.map((c) => `${c.name}@${c.locationName}`)),
  );

  // 5. what is ON SCREEN is the same world the bridge reports — the panel is not a second story.
  const onScreen = await page.evaluate(
    "(() => ({ world: !!document.getElementById('nexus-world'), chars: [...document.querySelectorAll('[data-world-characters] li')].map((li) => li.innerText.replace(/\\s+/g, ' ').trim()), locs: [...document.querySelectorAll('[data-world-locations] li')].map((li) => li.innerText.replace(/\\s+/g, ' ').trim()), mode: document.querySelector('[data-world-mode]')?.innerText ?? null, stats: [...document.querySelectorAll('[data-world-stat]')].map((el) => el.getAttribute('data-world-stat')) }))()",
  );
  check(
    'the panel renders every character the bridge reports',
    onScreen.chars.length === (report?.characters?.length ?? -1) && onScreen.chars.every((line, i) => line.includes(report.characters[i].name)),
    JSON.stringify(onScreen.chars),
  );
  check(
    'the panel renders every location the bridge reports',
    onScreen.locs.length === locationNames.length && onScreen.locs.every((line, i) => line.includes(locationNames[i])),
    JSON.stringify(onScreen.locs),
  );
  check(
    'the surface names its own mode (§60)',
    typeof onScreen.mode === 'string' && onScreen.mode.includes('DEMO MODE'),
    `mode on screen: ${JSON.stringify(onScreen.mode)}`,
  );
  check(
    'the stat tiles are labelled, one per count the report carries',
    JSON.stringify(onScreen.stats) === JSON.stringify(['locations', 'characters', 'lore', 'agents', 'events', 'ticks']),
    JSON.stringify(onScreen.stats),
  );

  // 6. v162 — before any step: the Simulate row exists, nothing has run, and no bond exists.
  const simBefore = await page.evaluate(
    "(() => ({ simulate: !!document.querySelector('[data-world-simulate]'), step1: !!document.querySelector('[data-sim-step=\"1\"]'), step5: !!document.querySelector('[data-sim-step=\"5\"]'), lastTick: (document.querySelector('[data-world-last-tick]')?.innerText ?? '').replace(/\\s+/g, ' ').trim(), emptyState: !!document.querySelector('[data-world-relationships] [data-pairs-none]'), pairs: document.querySelectorAll('[data-world-relationships] [data-pair]').length }))()",
  );
  check(
    'the Simulate row offers both step buttons and admits nothing has run yet',
    simBefore.simulate && simBefore.step1 && simBefore.step5 && simBefore.lastTick === 'not stepped yet',
    JSON.stringify(simBefore),
  );
  check(
    'before any tick the relationships section shows its empty state — bonds form only through simulated dialogue',
    simBefore.emptyState && simBefore.pairs === 0 && (report?.relationships?.length ?? -1) === 0,
    `on screen: ${simBefore.pairs} pairs · bridge: ${JSON.stringify(report?.relationships)}`,
  );

  // 7. v162 — Step ×1 runs the engine's own tickOnce() and reproduces the deterministic trace the
  //    headless proof pinned: 4 decisions, 2 actions, the newborn bond eroded to 13 on BOTH sides.
  const step1 = await page.evaluate("(() => { const b = document.querySelector('[data-sim-step=\"1\"]'); if (!b) return false; b.click(); return true; })()");
  check('pressing Step ×1 dispatches the tick', step1 === true, `clicked: ${step1}`);
  const tick1Text = await waitLastTick((t) => t.startsWith('tick '));
  check(
    'the last-tick line reports the deterministic first tick (4 decisions · 2 actions · 2 bonds eroded)',
    tick1Text.startsWith('tick 1') && tick1Text.includes('4 decisions') && tick1Text.includes('2 actions') && tick1Text.includes('2 bonds eroded'),
    `last-tick: ${JSON.stringify(tick1Text)}`,
  );
  const stepped1 = await page.evaluate('window.__nexusWorld ? window.__nexusWorld.world() : null');
  check(
    'the bridge now counts one tick of engine time',
    stepped1?.stats?.ticks === 1,
    `ticks: ${stepped1?.stats?.ticks}`,
  );
  const rows1 = await pairRows();
  check(
    'the newborn Mira↔Toma bond is listed on screen from BOTH sides, at the post-decay strength',
    JSON.stringify(rows1) === JSON.stringify(['Mira → Toma · neutral · 13', 'Toma → Mira · neutral · 13']),
    JSON.stringify(rows1),
  );
  const rels1 = stepped1?.relationships ?? [];
  check(
    'the bridge’s relationships view agrees with the screen, by NAME',
    JSON.stringify(rels1) ===
      JSON.stringify([
        { from: 'Mira', to: 'Toma', type: 'neutral', strength: 13 },
        { from: 'Toma', to: 'Mira', type: 'neutral', strength: 13 },
      ]),
    JSON.stringify(rels1),
  );

  // 8. v162 — Step ×5 pushes engine time to tick 6; whatever the agents choose, the invariants of the
  //    model hold: two directed rows only, strengths inside [floor, cap], types inside the declared bands.
  const step5 = await page.evaluate("(() => { const b = document.querySelector('[data-sim-step=\"5\"]'); if (!b) return false; b.click(); return true; })()");
  check('pressing Step ×5 dispatches five more ticks', step5 === true, `clicked: ${step5}`);
  await waitLastTick((t) => t.startsWith('tick 6 '));
  const stepped6 = await page.evaluate('window.__nexusWorld ? window.__nexusWorld.world() : null');
  check(
    'the bridge now counts six ticks of engine time',
    stepped6?.stats?.ticks === 6,
    `ticks: ${stepped6?.stats?.ticks}`,
  );
  const rels6 = stepped6?.relationships ?? [];
  const bands = ['enemy', 'neutral', 'friend', 'ally'];
  check(
    'after five more ticks the bonds persist, inside the floor/cap and the declared bands',
    rels6.length === 2 &&
      rels6.every((p) => p.strength >= 10 && p.strength <= 100 && bands.includes(p.type) && p.from && p.to),
    JSON.stringify(rels6),
  );
  const rows6 = await pairRows();
  check(
    'the screen still renders both sides of the bond after six ticks',
    rows6.length === 2 && rows6.every((r) => r.includes('→') && r.includes('Mira') === (r.startsWith('Mira') || r.startsWith('Toma'))),
    JSON.stringify(rows6),
  );

  // 9. v191 — the surface PERSISTS. The engine's own save()/load() are the only story; disk is where
  //    the file rests. Each step is checked against the BRIDGE and the REAL disk, so a UI that
  //    re-rendered without writing anything would fail here.
  const saveNoteText = async () =>
    page.evaluate("(() => (document.querySelector('[data-world-save-note]')?.innerText ?? '').replace(/\\s+/g, ' ').trim())()");
  // Generous timeout: on a cold dev server the POST route is compiled on first hit, which can take
  // longer than a snappy warm save; the note must still appear, we only refuse to wait forever.
  const waitSaveNote = async (pred, timeout = 60000) => {
    const end = Date.now() + timeout;
    for (;;) {
      const text = await saveNoteText();
      if (pred(text)) return text;
      if (Date.now() > end) throw new Error(`timeout waiting for the save note, last saw: ${JSON.stringify(text)}`);
      await sleep(100);
    }
  };

  const persistRow = await page.evaluate(
    "(() => ({ persist: !!document.querySelector('[data-world-persist]'), save: !!document.querySelector('[data-world-save-disk]'), browse: !!document.querySelector('[data-world-browse-disk]'), note: !!document.querySelector('[data-world-save-note]') }))()",
  );
  check(
    'the surface offers the persist row: save to disk, browse disk, and a note that names the disk',
    persistRow.persist && persistRow.save && persistRow.browse && persistRow.note,
    JSON.stringify(persistRow),
  );

  const saveClicked = await page.evaluate("(() => { const b = document.querySelector('[data-world-save-disk]'); if (!b) return false; b.click(); return true; })()");
  check('pressing save to disk dispatches the write', saveClicked === true, `clicked: ${saveClicked}`);
  const savedNote = await waitSaveNote((t) => t.includes('saved') && t.includes('bytes to disk'));
  check(
    'the note reports the engine file landing on disk with its byte count',
    savedNote.includes('saved') && /\d+ bytes to disk as "world-saved"/.test(savedNote),
    `note: ${JSON.stringify(savedNote)}`,
  );

  // The REAL file, read back with node:fs — the thing a store that only re-rendered could not produce.
  const diskPath = join(process.cwd(), 'apps', 'studio', '.nexus', 'world-saves', 'world-saved');
  const raw = readFileSync(diskPath, 'utf8');
  const parsed = JSON.parse(raw);
  const bridgeNow = await page.evaluate('window.__nexusWorld ? window.__nexusWorld.world() : null');
  check(
    'the file on the REAL disk is a world save at the tick the bridge reported',
    typeof parsed?.world === 'object' && parsed?.world !== null && parsed?.currentTick === bridgeNow?.stats?.ticks && bridgeNow?.stats?.ticks === 6,
    `world ${typeof parsed?.world} · currentTick ${parsed?.currentTick} · bridge ticks ${bridgeNow?.stats?.ticks} · ${raw.length} bytes`,
  );

  // The re-probe inside the save flow re-renders the rows; the harness WAITS for the fact instead of
  // reading the DOM a frame too early (and the row also proves the flow released its busy guard).
  const endRows = Date.now() + 15000;
  let diskRows = [];
  for (;;) {
    diskRows = await page.evaluate(
      "[...document.querySelectorAll('[data-world-disk-list] [data-world-disk-save]')].map((li) => li.getAttribute('data-world-disk-save'))",
    );
    if (JSON.stringify(diskRows) === JSON.stringify(['world-saved'])) break;
    if (Date.now() > endRows) throw new Error(`timeout waiting for the disk row, last saw: ${JSON.stringify(diskRows)}`);
    await sleep(100);
  }
  check('the disk rows list the save the server holds', JSON.stringify(diskRows) === JSON.stringify(['world-saved']), JSON.stringify(diskRows));

  // The round trip: one step PAST the save, then load — the bridge must count the SAVED tick again.
  // The step click is only dispatched once the save flow has released its busy guard (the buttons
  // re-enable); a click during busy is swallowed by the surface's own guard, and rightly so.
  const waitStepReady = async (timeout = 15000) => {
    const endWait = Date.now() + timeout;
    for (;;) {
      const disabled = await page.evaluate("document.querySelector('[data-sim-step=\"1\"]')?.disabled ?? true");
      if (!disabled) return;
      if (Date.now() > endWait) throw new Error('timeout waiting for the step button to re-enable');
      await sleep(100);
    }
  };
  await waitStepReady();
  await page.evaluate("(() => { const b = document.querySelector('[data-sim-step=\"1\"]'); if (!b) return false; b.click(); return true; })()");
  await waitLastTick((t) => t.startsWith('tick 7 '));
  const steppedPast = await page.evaluate('window.__nexusWorld ? window.__nexusWorld.world() : null');
  check('the live world was stepped one tick past the save', steppedPast?.stats?.ticks === 7, `ticks: ${steppedPast?.stats?.ticks}`);

  await waitStepReady();
  await page.evaluate("(() => { const row = document.querySelector('[data-world-disk-save=\"world-saved\"]'); if (!row) return false; row.click(); return true; })()");
  const end = Date.now() + 15000;
  let loadedReport = null;
  for (;;) {
    loadedReport = await page.evaluate('window.__nexusWorld ? window.__nexusWorld.world() : null');
    if (loadedReport?.stats?.ticks === 6) break;
    if (Date.now() > end) throw new Error(`timeout waiting for the load, bridge still: ${JSON.stringify(loadedReport?.stats)}`);
    await sleep(100);
  }
  check(
    'loading the disk row hands the file to the engine: the bridge counts the SAVED tick again',
    loadedReport?.stats?.ticks === 6,
    `ticks 7 → ${loadedReport?.stats?.ticks}`,
  );
  const rowsAfterLoad = await pairRows();
  check(
    'the loaded world still holds the bond, listed on screen from both sides',
    rowsAfterLoad.length === 2 && rowsAfterLoad.every((r) => r.includes('Mira') && r.includes('Toma')),
    JSON.stringify(rowsAfterLoad),
  );
  const loadedNote = await saveNoteText();
  check(
    'the note says the live world is now the saved one',
    loadedNote.includes('loaded') && loadedNote.includes('world-saved') && loadedNote.includes('now the saved one'),
    `note: ${JSON.stringify(loadedNote)}`,
  );

  // A pixel screenshot of the surface (§30).
  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  const png = Buffer.from(shot.data, 'base64');
  const shotPath = join(OUT_DIR, 'studio-world.png');
  writeFileSync(shotPath, png);
  check('a pixel screenshot of the world surface was captured (§30)', png.length > 5000, `${png.length} bytes → ${shotPath}`);

  // Back to 2D: the toggle must be reversible and the canvas must come back with its pixels.
  await page.evaluate("document.querySelector('[data-surface-toggle=\"2d\"]').click()");
  await page.waitForSelector('#nexus-canvas', 15000);
  const back = await page.canvasStats('#nexus-canvas');
  check('pressing 2D restores the canvas, still painting', back && back.nonEmpty > 1000, back ? `${back.nonEmpty}/${back.total} px painted` : 'no canvas');
  const gone = await page.evaluate("window.__nexusWorld ? window.__nexusWorld.world() : 'no-bridge'");
  check('the world reports nothing once it is unmounted', gone === null, `world() → ${JSON.stringify(gone)}`);

  console.log(
    `\n[device] surface=world · ${report?.stats?.locations} locations · ${report?.stats?.characters} characters · ${report?.stats?.lore} lore · ticks 0→${stepped6?.stats?.ticks} · bond rows ${rows1.length} · PERSISTED (${raw.length} B on disk, load ${steppedPast?.stats?.ticks}→${loadedReport?.stats?.ticks}) · screenshot ${png.length} B`,
  );
} finally {
  await page.close().catch(() => {});
  await session.close().catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log(`\n[summary] ${results.length - failed.length}/${results.length} browser assertions passed`);
writeFileSync(join(OUT_DIR, 'world-browser-probe.json'), JSON.stringify({ results, failed: failed.length }, null, 2));
if (failed.length) {
  console.log('[world-browser-probe] FAILED');
  process.exit(1);
}
console.log('[world-browser-probe] ALL ASSERTIONS PASSED (the world surface is reachable, steps its engine, persists its world to disk, and the panel and the bridge tell one story)');
