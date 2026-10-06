/**
 * M5 v142 — the 3D surface in a REAL browser (ADR 0017 harness).
 *
 * The unit suite and the headless proof (`scene-surface-proof.mjs`) both run against the SHIPPED Studio
 * module, and both of them say the same thing about the browser: *not checked here*. This file is that
 * check. It drives the real Studio bundle over CDP and asks the questions only a browser can answer:
 *
 *   1. the 2D canvas is still the DEFAULT, and it still paints — the 3D surface must not have displaced
 *      the thing every earlier milestone was verified against;
 *   2. pressing `3D` mounts `#nexus-scene3d`, and the Studio moves to that surface;
 *   3. the frame counter ADVANCES while the loop runs (read live through the read-only bridge);
 *   4. the report names the scene the runtime really holds;
 *   5. whichever backend answered is named on screen — `webgl` or the honest `HEADLESS` note — and the
 *      reading is recorded either way, because a headless host proving a GL surface would be a lie.
 *
 * Usage: node tools/harness/studio-scene3d.mjs [--url http://127.0.0.1:3210] [--out DIR]
 *
 * The Studio must be running first: from `apps/studio`, `NODE_OPTIONS= ../../node_modules/.bin/next dev
 * -p 3210`. Measured on this host 2026-09-29 (Chrome 153, `--headless=new`): `backend=webgl` — headless
 * Chrome does provide a software GL context — 878×550 surface, 4 draw calls in the HUD, 11/11
 * assertions, and the screenshot shows four LIT boxes rather than the black frame the v142 defect
 * produced.
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
const OUT_DIR = arg('out', '.scratch/v142');
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
    "(() => ({ surface: document.querySelector('[data-surface]')?.getAttribute('data-surface') ?? null, has2d: !!document.getElementById('nexus-canvas'), has3d: !!document.getElementById('nexus-scene3d') }))()",
  );
  check('the Studio still opens on the 2D canvas', before.surface === '2d' && before.has2d && !before.has3d, JSON.stringify(before));
  const beforePx = await page.canvasStats('#nexus-canvas');
  check('the 2D canvas still paints', beforePx && beforePx.nonEmpty > 1000, beforePx ? `${beforePx.nonEmpty}/${beforePx.total} px painted` : 'no canvas');

  // 2. the 3D toggle mounts the 3D canvas.
  const clicked = await page.evaluate(
    "(() => { const b = document.querySelector('[data-surface-toggle=\"3d\"]'); if (!b) return false; b.click(); return true; })()",
  );
  check('the toolbar exposes a 3D toggle', clicked === true, `toggle clicked: ${clicked}`);
  await page.waitForSelector('#nexus-scene3d', 15000);
  const after = await page.evaluate(
    "(() => ({ surface: document.querySelector('[data-surface]')?.getAttribute('data-surface') ?? null, has2d: !!document.getElementById('nexus-canvas'), has3d: !!document.getElementById('nexus-scene3d') }))()",
  );
  check('pressing 3D swaps the surface (and unmounts the 2D canvas)', after.surface === '3d' && after.has3d && !after.has2d, JSON.stringify(after));

  // 3. the bridge reports the live surface, and the frame count MOVES.
  const first = await page.evaluate('window.__nexusScene3d ? window.__nexusScene3d.scene3d() : null');
  check('the read-only bridge answers for the 3D surface', first !== null && typeof first === 'object', JSON.stringify(first)?.slice(0, 240));
  const advanced = await page.waitForFunction(
    `(() => { const r = window.__nexusScene3d?.scene3d(); return r && r.frames > ${(first?.frames ?? 0) + 2} ? r.frames : null; })()`,
    { timeout: 15000 },
  );
  check('the frame loop advances the surface count', typeof advanced === 'number', `frames ${first?.frames} → ${advanced}`);

  // 4. the report describes the runtime's own scene.
  const report = await page.evaluate('window.__nexusScene3d.scene3d()');
  const scene = report?.scene ?? null;
  check(
    'the report names the composed scene, its bodies and its camera',
    scene?.name === 'Studio Scene' &&
      scene?.entities === 4 &&
      scene?.cameras === 1 &&
      scene?.activeCamera !== null &&
      JSON.stringify(scene?.entityNames) === JSON.stringify(['Ground', 'Cube A', 'Cube B', 'Cube C']),
    JSON.stringify(scene),
  );

  // 5. WHICH backend answered is on screen, and the pixel readback is read the same way for both.
  const hud = await page.evaluate("document.body.innerText.includes('backend:') ? [...document.body.innerText.split('\\n')].filter((l) => l.includes('backend:') || l.includes('frames:') || l.includes('HEADLESS') || l.includes('WebGL')).join(' | ') : null");
  const kind = report?.backend ?? null;
  check('the backend that answered is named in the HUD', kind === 'webgl' || kind === 'headless', `backend=${kind} · ${hud}`);

  // A pixel reading of the 3D surface, taken the way the 2D one is. Under a WEBGL backend this canvas
  // has no 2D context, so `canvasStats` cannot read it — the GL answer is recorded as `null` rather
  // than dressed up as a measurement, and the screenshot below is the visual evidence instead.
  const px3d = await page.canvasStats('#nexus-scene3d');
  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  const png = Buffer.from(shot.data, 'base64');
  const shotPath = join(OUT_DIR, 'studio-scene3d.png');
  writeFileSync(shotPath, png);
  check('a pixel screenshot of the 3D surface was captured (§30)', png.length > 5000, `${png.length} bytes → ${shotPath}`);

  // ── M5 v161: the surface is CONTROLLABLE ─────────────────────────────────────────────────────────
  // Each control is checked against the BRIDGE (which reads the live surface), so a handler that moved a
  // local counter without reaching the runtime would fail here.
  const orbitOf = async () => (await page.evaluate('window.__nexusScene3d.scene3d()'))?.orbit ?? null;
  const orbitBefore = await orbitOf();
  check('the report carries the camera’s orbit', before !== null && typeof orbitBefore.azimuth === 'number', JSON.stringify(orbitBefore));

  // Drag across the canvas to orbit. Chrome turns mouse input into pointer events, which is what the
  // component listens for — so this drives the same path a hand does.
  const box = await page.evaluate(
    "(() => { const c = document.getElementById('nexus-scene3d'); const r = c.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()",
  );
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 5; i++) {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + i * 20, y: box.y + i * 6, button: 'left', buttons: 1 });
  }
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x + 100, y: box.y + 30, button: 'left', buttons: 0, clickCount: 1 });

  const dragged = await orbitOf();
  check(
    'dragging the canvas ORBITS the camera',
    dragged !== null && Math.abs(dragged.azimuth - orbitBefore.azimuth) > 0.05 && Math.abs(dragged.elevation - orbitBefore.elevation) > 0.01,
    `azimuth ${orbitBefore.azimuth?.toFixed(3)} → ${dragged?.azimuth?.toFixed(3)} · elevation ${orbitBefore.elevation?.toFixed(3)} → ${dragged?.elevation?.toFixed(3)}`,
  );
  check(
    'the orbit keeps the camera at its DISTANCE from the target',
    Math.abs(dragged.distance - orbitBefore.distance) < 1e-9,
    `distance ${orbitBefore.distance?.toFixed(3)} → ${dragged?.distance?.toFixed(3)} (unchanged by a turn)`,
  );

  // Wheel to zoom.
  // Scrolling DOWN (deltaY > 0) zooms OUT — the convention every map and every 3D viewer uses. The first
  // draft of this probe asserted the opposite and read the implementation as the defect.
  // A wheel is ONE event, so the read has to WAIT for React to process it — a synchronous read after the
  // dispatch returns the old orbit and reads as "the wheel does nothing". Measured: the event does arrive
  // (a listener on the canvas sees it and the distance moves 8.336 → 9.170), so the first draft's failure
  // was the probe's timing, not the control.
  await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x, y: box.y, deltaX: 0, deltaY: 120 });
  const zoomedOut = await page.waitForFunction(
    `(() => { const o = window.__nexusScene3d?.scene3d()?.orbit; return o && o.distance > ${dragged.distance + 0.01} ? o : null; })()`,
    { timeout: 10000 },
  );
  check('the wheel ZOOMS the camera out', zoomedOut !== null, `distance ${dragged.distance?.toFixed(3)} → ${zoomedOut?.distance?.toFixed(3)}`);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x, y: box.y, deltaX: 0, deltaY: -120 });
  const zoomedBack = await page.waitForFunction(
    `(() => { const o = window.__nexusScene3d?.scene3d()?.orbit; return o && o.distance < ${zoomedOut.distance - 0.01} ? o : null; })()`,
    { timeout: 10000 },
  );
  check('and a wheel the other way zooms back in', zoomedBack !== null, `distance ${zoomedOut?.distance?.toFixed(3)} → ${zoomedBack?.distance?.toFixed(3)}`);

  // Add and remove a body.
  const bodiesBefore = (await page.evaluate('window.__nexusScene3d.scene3d()')).scene.entities;
  await page.evaluate("document.querySelector('[data-scene-add-body]').click()");
  const afterAdd = await page.waitForFunction(
    `(() => { const r = window.__nexusScene3d?.scene3d(); return r && r.scene.entities === ${bodiesBefore + 1} ? r : null; })()`,
    { timeout: 10000 },
  );
  check('pressing “+ body” ADDS a body to the real runtime', afterAdd !== null, `entities ${bodiesBefore} → ${afterAdd?.scene?.entities}`);

  await page.evaluate("document.querySelector('[data-scene-remove-body]').click()");
  const afterRemove = await page.waitForFunction(
    `(() => { const r = window.__nexusScene3d?.scene3d(); return r && r.scene.entities === ${bodiesBefore} ? r : null; })()`,
    { timeout: 10000 },
  );
  check('pressing “− body” REMOVES it again', afterRemove !== null, `entities ${afterAdd?.scene?.entities} → ${afterRemove?.scene?.entities}`);

  // Reset the view.
  await page.evaluate("document.querySelector('[data-scene-reset-view]').click()");
  const reset = await orbitOf();
  const defaultOrbit = await page.evaluate(
    "(() => { const r = window.__nexusScene3d.scene3d(); return r.orbit; })()",
  );
  check(
    'pressing “reset view” returns the camera to the view the surface opened with',
    Math.abs(reset.azimuth - orbitBefore.azimuth) < 1e-9 || Math.abs(defaultOrbit.azimuth - orbitBefore.azimuth) < 1e-9,
    `azimuth ${dragged.azimuth?.toFixed(3)} → ${reset.azimuth?.toFixed(3)}`,
  );


  // Back to 2D: the toggle must be reversible and the canvas must come back with its pixels.
  await page.evaluate("document.querySelector('[data-surface-toggle=\"2d\"]').click()");
  await page.waitForSelector('#nexus-canvas', 15000);
  const back = await page.canvasStats('#nexus-canvas');
  check('pressing 2D restores the canvas, still painting', back && back.nonEmpty > 1000, back ? `${back.nonEmpty}/${back.total} px painted` : 'no canvas');
  const gone = await page.evaluate("window.__nexusScene3d ? window.__nexusScene3d.scene3d() : 'no-bridge'");
  check('the 3D surface reports nothing once it is unmounted', gone === null, `scene3d() → ${JSON.stringify(gone)}`);

  console.log(
    `\n[device] backend=${kind} · scene3d canvas readback=${px3d ? `${px3d.nonEmpty}/${px3d.total} px` : 'not a 2D context (WebGL)'} · frames ${first?.frames} → ${advanced} · screenshot ${png.length} B`,
  );
} finally {
  await page.close().catch(() => {});
  await session.close().catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log(`\n[summary] ${results.length - failed.length}/${results.length} browser assertions passed`);
writeFileSync(join(OUT_DIR, 'scene3d-browser-probe.json'), JSON.stringify({ results, failed: failed.length }, null, 2));
if (failed.length) {
  console.log('[scene3d-browser-probe] FAILED');
  process.exit(1);
}
console.log('[scene3d-browser-probe] ALL ASSERTIONS PASSED (the 3D surface is reachable, live, and honest about its backend)');
