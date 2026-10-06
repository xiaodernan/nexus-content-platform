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
 *   6. the surface names its own mode (`DEMO MODE`) rather than letting a reader assume a model.
 *
 * Usage: node tools/harness/studio-world.mjs [--url http://127.0.0.1:3210] [--out DIR]
 *
 * The Studio must be running first: from `apps/studio`, `NODE_OPTIONS= ../../node_modules/.bin/next
 * dev -p 3210`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
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
    `\n[device] surface=world · ${report?.stats?.locations} locations · ${report?.stats?.characters} characters · ${report?.stats?.lore} lore · ticks 0→${stepped6?.stats?.ticks} · bond rows ${rows1.length} · screenshot ${png.length} B`,
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
console.log('[world-browser-probe] ALL ASSERTIONS PASSED (the world surface is reachable, steps its engine, and the panel and the bridge tell one story)');
