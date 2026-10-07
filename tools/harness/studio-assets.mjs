/**
 * M3 v153 — the asset surface in a REAL browser (ADR 0017 harness).
 *
 * The unit suite and the headless proof (`docs/evidence/studio/asset-surface-proof.mjs`) both run against
 * the SHIPPED Studio module and both say the same thing about the browser: *not checked here*. This file is
 * that check. It drives the real Studio bundle over CDP and asks the questions only a browser can answer:
 *
 *   1. the 2D canvas is still the DEFAULT, and it still paints;
 *   2. pressing `Assets` mounts `#nexus-assets`, and the Studio moves to that surface — note this surface
 *      COMPOSES ASYNCHRONOUSLY, so the probe waits for a report rather than reading once and hoping;
 *   3. the read-only bridge answers, and what it reports is the library's own state;
 *   4. §60 is on screen as NUMBERS: the mode is named, and every asset's stored byte count reads ZERO;
 *   5. what is ON SCREEN is the same storyboard the bridge reports;
 *   6. NO `<img>` is rendered anywhere — there is no image to render, and an element would imply one.
 *
 * Usage: node tools/harness/studio-assets.mjs [--url http://127.0.0.1:3210] [--out DIR]
 *
 * The Studio must be running first: from `apps/studio`, `NODE_OPTIONS= ../../node_modules/.bin/next dev
 * -p 3210`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './cdp.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const URL_BASE = arg('url', 'http://127.0.0.1:3210');
const OUT_DIR = arg('out', '.scratch/v153');
mkdirSync(OUT_DIR, { recursive: true });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`);
};

const session = await launch({ width: 1440, height: 900 });
const page = await session.newPage('about:blank');

try {
  await page.navigate(`${URL_BASE}/`, { waitForSelector: '#nexus-canvas', waitMs: 700 });

  // 1. the default surface is still the 2D canvas, and it still paints.
  const before = await page.evaluate(
    "(() => ({ surface: document.querySelector('[data-surface]')?.getAttribute('data-surface') ?? null, has2d: !!document.getElementById('nexus-canvas'), hasAssets: !!document.getElementById('nexus-assets') }))()",
  );
  check('the Studio still opens on the 2D canvas', before.surface === '2d' && before.has2d && !before.hasAssets, JSON.stringify(before));
  const beforePx = await page.canvasStats('#nexus-canvas');
  check('the 2D canvas still paints', beforePx && beforePx.nonEmpty > 1000, beforePx ? `${beforePx.nonEmpty}/${beforePx.total} px painted` : 'no canvas');

  // 2. the Assets toggle mounts the asset surface. This one COMPOSES ASYNCHRONOUSLY (it awaits three
  //    generator calls), so the probe waits for the report rather than reading a frame that may not exist.
  const clicked = await page.evaluate(
    "(() => { const b = document.querySelector('[data-surface-toggle=\"assets\"]'); if (!b) return false; b.click(); return true; })()",
  );
  check('the toolbar exposes an Assets toggle', clicked === true, `toggle clicked: ${clicked}`);
  await page.waitForSelector('#nexus-assets', 15000);
  const after = await page.evaluate(
    "(() => ({ surface: document.querySelector('[data-surface]')?.getAttribute('data-surface') ?? null, has2d: !!document.getElementById('nexus-canvas'), hasAssets: !!document.getElementById('nexus-assets') }))()",
  );
  check('pressing Assets swaps the surface (and unmounts the 2D canvas)', after.surface === 'assets' && after.hasAssets && !after.has2d, JSON.stringify(after));

  const report = await page.waitForFunction(
    '(() => { const r = window.__nexusAssets?.assets(); return r && r.assets && r.assets.length > 0 ? r : null; })()',
    { timeout: 20000 },
  );
  check('the read-only bridge answers for the asset surface, once the composition lands', report !== null && typeof report === 'object', JSON.stringify(report)?.slice(0, 200));

  // 3. the report is the library's own state.
  check(
    'the report names the composed assets and the storyboard',
    report?.provenanceMode === 'demo' &&
      Array.isArray(report?.assets) &&
      report.assets.length === 3 &&
      report?.storyboard?.frames?.length === 3 &&
      report.storyboard.frames.every((f) => f.imageRef !== null),
    JSON.stringify({ provenanceMode: report?.provenanceMode, assets: report?.assets?.length, frames: report?.storyboard?.frames?.length }),
  );

  // 4. §60 as NUMBERS on the bridge.
  check(
    '§60: storedBytes is ZERO and every asset reports zero bytes',
    report?.storedBytes === 0 && report.assets.every((a) => a.bytes === 0),
    `storedBytes=${report?.storedBytes} · per-asset ${JSON.stringify(report?.assets?.map((a) => a.bytes))}`,
  );
  check(
    '§60: every frame references an asset the report actually holds',
    report.storyboard.frames.every((f) => report.assets.some((a) => a.id === f.imageRef)),
    JSON.stringify(report.storyboard.frames.map((f) => f.imageRef)),
  );

  // 5. what is on screen is the same storyboard the bridge reports.
  const onScreen = await page.evaluate(
    "(() => ({ mode: document.querySelector('[data-asset-mode]')?.innerText ?? null, rows: [...document.querySelectorAll('[data-asset-list] li')].map((li) => li.innerText.replace(/\\s+/g, ' ').trim()), frameRows: [...document.querySelectorAll('[data-asset-frames] li')].map((li) => li.innerText.replace(/\\s+/g, ' ').trim()), bytes: [...document.querySelectorAll('[data-asset-bytes]')].map((el) => el.innerText.trim()), imgs: document.querySelectorAll('#nexus-assets img').length, stats: [...document.querySelectorAll('[data-asset-stat]')].map((el) => el.getAttribute('data-asset-stat')) }))()",
  );
  check(
    'the surface names its own mode (§60)',
    typeof onScreen.mode === 'string' && onScreen.mode.includes('DEMO MODE') && onScreen.mode.includes('NO pixels'),
    `mode on screen: ${JSON.stringify(onScreen.mode)}`,
  );
  check(
    'the panel renders every asset the bridge reports',
    onScreen.rows.length === report.assets.length,
    `panel rows ${onScreen.rows.length} vs report ${report.assets.length}`,
  );
  check(
    'the panel renders every frame the bridge reports, with its order',
    onScreen.frameRows.length === report.storyboard.frames.length &&
      onScreen.frameRows.every((line, i) => line.startsWith(`#${i}`)),
    JSON.stringify(onScreen.frameRows),
  );
  check(
    '§60 on screen: every rendered byte count reads 0',
    onScreen.bytes.length === report.assets.length && onScreen.bytes.every((b) => b === '0'),
    JSON.stringify(onScreen.bytes),
  );
  check(
    'the panel renders NO <img> — there is no image, and an element would imply one',
    onScreen.imgs === 0,
    `img elements inside the surface: ${onScreen.imgs}`,
  );
  check(
    'the stat tiles are labelled, one per figure the report carries',
    JSON.stringify(onScreen.stats) === JSON.stringify(['assets', 'frames', 'stored bytes', 'provenance']),
    JSON.stringify(onScreen.stats),
  );

  // 6. THE INTERACTION (M3 v159): grow and shrink the library from the panel itself.
  //    The mount-time composition is a demonstration; this is the part a person can actually use. Each step
  //    is checked against the BRIDGE — which reads the live library — and against the DOM, so a UI that
  //    re-rendered without storing anything would fail here.
  const typed = await page.evaluate(
    "(() => { const el = document.querySelector('[data-asset-prompt]'); if (!el) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(el, 'a beat the browser asked for'); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()",
  );
  check('the panel exposes a prompt input the probe can type into', typed === 'a beat the browser asked for', `input value: ${JSON.stringify(typed)}`);

  await page.evaluate("document.querySelector('[data-asset-generate]').click()");
  const grew = await page.waitForFunction(
    `(() => { const r = window.__nexusAssets?.assets(); return r && r.assets.length === ${report.assets.length + 1} ? r : null; })()`,
    { timeout: 15000 },
  );
  check(
    'pressing Generate STORES a new asset in the real library',
    grew !== null && grew.assets.length === report.assets.length + 1,
    `assets ${report.assets.length} → ${grew?.assets?.length}`,
  );
  const fresh = grew?.assets?.find((a) => a.prompt === 'a beat the browser asked for');
  check('the new asset carries the prompt that was typed', Boolean(fresh), JSON.stringify({ prompt: fresh?.prompt, name: fresh?.name }));
  check('§60 on the interactive write: the new asset stored ZERO bytes', fresh?.bytes === 0 && grew?.storedBytes === 0, `bytes=${fresh?.bytes} · storedBytes=${grew?.storedBytes}`);

  const shownAfterGrow = await page.evaluate(
    "(() => ({ rows: document.querySelectorAll('[data-asset-list] li').length, removeButtons: document.querySelectorAll('[data-asset-remove]').length }))()",
  );
  check(
    'the panel renders the new asset AND a remove control for every row',
    shownAfterGrow.rows === grew.assets.length && shownAfterGrow.removeButtons === grew.assets.length,
    JSON.stringify(shownAfterGrow),
  );

  await page.evaluate(`(() => { const b = document.querySelector('[data-asset-remove="${fresh.id}"]'); if (b) b.click(); })()`);
  const shrank = await page.waitForFunction(
    `(() => { const r = window.__nexusAssets?.assets(); return r && r.assets.length === ${report.assets.length} && !r.assets.some((a) => a.id === '${fresh.id}') ? r : null; })()`,
    { timeout: 15000 },
  );
  check(
    'pressing that row’s Remove DELETES it from the real library',
    shrank !== null && shrank.assets.length === report.assets.length,
    `assets ${grew?.assets?.length} → ${shrank?.assets?.length}, the removed id is gone`,
  );
  const storyboardAfter = await page.evaluate('window.__nexusAssets.assets().storyboard.frames.length');
  check(
    'the storyboard is untouched by a library change — the two are separate state',
    storyboardAfter === report.storyboard.frames.length,
    `frames ${report.storyboard.frames.length} → ${storyboardAfter}`,
  );

  // 7. THE VIDEO ASK (M3 v187). The type toggle decides which GENERATOR the ask reaches; the panel's own
  //    `generate` routes on it. Checked against the bridge, so a toggle that only changed a button's
  //    appearance would fail here.
  const armed = await page.evaluate(
    "(() => { const b = document.querySelector('[data-asset-type=\"video\"]'); if (!b) return null; b.click(); return true; })()",
  );
  check('the panel exposes an image/video type toggle', armed === true, `video toggle clicked: ${armed}`);

  const assetsBeforeVideo = (await page.evaluate('window.__nexusAssets.assets()')).assets.length;
  await page.evaluate(
    "(() => { const el = document.querySelector('[data-asset-prompt]'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(el, 'a skiff crossing the harbour'); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()",
  );
  await page.evaluate("document.querySelector('[data-asset-generate]').click()");
  const withFootage = await page.waitForFunction(
    `(() => { const r = window.__nexusAssets?.assets(); return r && r.assets.length === ${assetsBeforeVideo + 1} ? r : null; })()`,
    { timeout: 15000 },
  );
  const footage = withFootage?.assets?.find((a) => a.prompt === 'a skiff crossing the harbour');
  check(
    'a VIDEO ask reaches the video generator and is stored as footage',
    footage?.type === 'video' && footage?.mimeType === 'video/mp4',
    JSON.stringify({ type: footage?.type, mimeType: footage?.mimeType, name: footage?.name }),
  );
  check(
    'the footage reports its DURATION, where a still reports null',
    typeof footage?.duration === 'number' && footage.duration > 0,
    `duration ${JSON.stringify(footage?.duration)} · the composed stills report ${JSON.stringify(withFootage?.assets?.filter((a) => a.type === 'image').map((a) => a.duration))}`,
  );
  check(
    '§60 on the video write: footage stored ZERO bytes too',
    footage?.bytes === 0 && withFootage?.storedBytes === 0,
    `bytes=${footage?.bytes} · storedBytes=${withFootage?.storedBytes}`,
  );
  // And the surface still renders no <img> — footage is metadata here, exactly as a still is.
  const imgsAfterVideo = await page.evaluate("document.querySelectorAll('#nexus-assets img').length");
  check('and the panel still renders no <img> for footage either', imgsAfterVideo === 0, `img elements: ${imgsAfterVideo}`);

  // v188 — the BOARD is editable. The buttons pass the manager's own verbs through; the bridge reports
  // the storyboard the manager actually holds, so a control that only changed the DOM would fail here.
  const frameControls = await page.evaluate(
    "(() => { const ups = [...document.querySelectorAll('[data-frame-up]')]; const downs = [...document.querySelectorAll('[data-frame-down]')]; const removes = [...document.querySelectorAll('[data-frame-remove]')]; return { ups: ups.length, downs: downs.length, removes: removes.length, firstUpDisabled: ups[0]?.disabled ?? null, lastDownDisabled: downs.length ? downs[downs.length - 1].disabled : null }; })()",
  );
  const framesBefore = report.storyboard.frames.length;
  check(
    'every frame row carries move-up, move-down and remove controls, edges disabled',
    frameControls.ups === framesBefore && frameControls.downs === framesBefore && frameControls.removes === framesBefore && frameControls.firstUpDisabled === true && frameControls.lastDownDisabled === true,
    JSON.stringify({ frames: framesBefore, ...frameControls }),
  );

  const firstId = report.storyboard.frames[0].id;
  const secondId = report.storyboard.frames[1].id;
  await page.evaluate(`(() => { const b = document.querySelector('[data-frame-down="${firstId}"]'); if (b) b.click(); })()`);
  const reordered = await page.waitForFunction(
    `(() => { const r = window.__nexusAssets?.assets(); return r && r.storyboard && r.storyboard.frames.length === ${framesBefore} && r.storyboard.frames[0].id === '${secondId}' ? r : null; })()`,
    { timeout: 15000 },
  );
  check(
    'move-down REORDERS the board — the manager rewrote the order to the sequence given',
    reordered !== null && reordered.storyboard.frames[0].id === secondId && reordered.storyboard.frames[1].id === firstId,
    `frame order now ${JSON.stringify(reordered?.storyboard?.frames?.map((f) => f.id))}`,
  );
  const rowsAfterReorder = await page.evaluate(
    "(() => [...document.querySelectorAll('[data-asset-frames] li')].map((li) => li.innerText.replace(/\\s+/g, ' ').trim()))()",
  );
  check(
    'the panel rows follow the reorder — #0 is the frame that moved up',
    rowsAfterReorder.length === framesBefore && rowsAfterReorder[0].startsWith('#0') && rowsAfterReorder[0].includes(reordered.storyboard.frames[0].prompt),
    JSON.stringify(rowsAfterReorder.map((r) => r.slice(0, 60))),
  );

  const middleId = reordered.storyboard.frames[1].id;
  await page.evaluate(`(() => { const b = document.querySelector('[data-frame-remove="${middleId}"]'); if (b) b.click(); })()`);
  const afterRemove = await page.waitForFunction(
    `(() => { const r = window.__nexusAssets?.assets(); return r && r.storyboard && r.storyboard.frames.length === ${framesBefore - 1} && !r.storyboard.frames.some((f) => f.id === '${middleId}') ? r : null; })()`,
    { timeout: 15000 },
  );
  const ordersAfter = afterRemove?.storyboard?.frames?.map((f) => f.order) ?? [];
  check(
    'remove DROPS the frame and the surviving order keeps its honest hole',
    afterRemove !== null && JSON.stringify(ordersAfter) === JSON.stringify([0, 2]),
    `orders now ${JSON.stringify(ordersAfter)} — no silent renumber`,
  );
  const libraryAfterEdit = await page.evaluate('window.__nexusAssets.assets().assets.length');
  check(
    'editing the board never touched the library — the footage and stills are all still there',
    libraryAfterEdit === report.assets.length + 1,
    `assets ${report.assets.length} composed + 1 footage = ${libraryAfterEdit} held`,
  );

  // A pixel screenshot of the surface (§30).
  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  const png = Buffer.from(shot.data, 'base64');
  const shotPath = join(OUT_DIR, 'studio-assets.png');
  writeFileSync(shotPath, png);
  check('a pixel screenshot of the asset surface was captured (§30)', png.length > 5000, `${png.length} bytes → ${shotPath}`);

  // Back to 2D: the toggle must be reversible and the canvas must come back with its pixels.
  await page.evaluate("document.querySelector('[data-surface-toggle=\"2d\"]').click()");
  await page.waitForSelector('#nexus-canvas', 15000);
  const back = await page.canvasStats('#nexus-canvas');
  check('pressing 2D restores the canvas, still painting', back && back.nonEmpty > 1000, back ? `${back.nonEmpty}/${back.total} px painted` : 'no canvas');
  const gone = await page.evaluate("window.__nexusAssets ? window.__nexusAssets.assets() : 'no-bridge'");
  check('the asset surface reports nothing once it is unmounted', gone === null, `assets() → ${JSON.stringify(gone)}`);

  console.log(
    `\n[device] surface=assets · ${report?.assets?.length} assets · ${report?.storyboard?.frames?.length} frames · storedBytes ${report?.storedBytes} · <img> elements ${onScreen.imgs} · screenshot ${png.length} B`,
  );
} finally {
  await page.close().catch(() => {});
  await session.close().catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log(`\n[summary] ${results.length - failed.length}/${results.length} browser assertions passed`);
writeFileSync(join(OUT_DIR, 'asset-browser-probe.json'), JSON.stringify({ results, failed: failed.length }, null, 2));
if (failed.length) {
  console.log('[asset-browser-probe] FAILED');
  process.exit(1);
}
console.log('[asset-browser-probe] ALL ASSERTIONS PASSED (the asset surface is reachable, and it shows metadata rather than pretending to show pictures)');
