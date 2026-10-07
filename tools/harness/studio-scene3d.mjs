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
 *      reading is recorded either way, because a headless host proving a GL surface would be a lie;
 *   6. (v163) save records the live scene in the runtime's own format, load restores it into a FRESH
 *      scene while the demo keeps running, and the authored bodies are filed into the canonical Design
 *      Document as a real addSubtree — read back through the `__nexus` editor bridge.
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

  // ── M5 v181: the surface PANS — WASD/arrows walk it, shift-drag grabs the ground ─────────────────
  // Pan is read through the same bridge orbit is: a handler that moved a local counter without reaching
  // the runtime would fail here. Direction checks lean on the reset above restoring the DEFAULT azimuth:
  // facing into the screen, W walks forward and D strafes to the view's right.
  const panAfterReset = await orbitOf();
  check(
    'the default orbit carries no pan (the opening view is unchanged)',
    panAfterReset.panX === 0 && panAfterReset.panZ === 0,
    `pan ${panAfterReset.panX}/${panAfterReset.panZ}`,
  );

  const pressKey = async (key, code, vk) => {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text: key });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  };
  for (let i = 0; i < 4; i++) await pressKey('w', 'KeyW', 87);
  const walkedIn = await page.waitForFunction(
    `(() => { const o = window.__nexusScene3d?.scene3d()?.orbit; return o && o.panX < -0.3 && o.panZ < -0.3 ? o : null; })()`,
    { timeout: 10000 },
  );
  check(
    'pressing W pans INTO the screen (camera-relative, not a world axis)',
    walkedIn !== null,
    `pan ${panAfterReset.panX}/${panAfterReset.panZ} → ${walkedIn?.panX?.toFixed(3)}/${walkedIn?.panZ?.toFixed(3)}`,
  );

  for (let i = 0; i < 2; i++) await pressKey('d', 'KeyD', 68);
  const strafed = await page.waitForFunction(
    `(() => { const o = window.__nexusScene3d?.scene3d()?.orbit; return o && o.panX > ${walkedIn.panX} + 0.2 ? o : null; })()`,
    { timeout: 10000 },
  );
  check('and pressing D strafes toward the view’s right', strafed !== null, `panX ${walkedIn.panX?.toFixed(3)} → ${strafed?.panX?.toFixed(3)}`);

  await page.evaluate("document.querySelector('[data-scene-reset-view]').click()");
  const clearedPan = await page.waitForFunction(
    `(() => { const o = window.__nexusScene3d?.scene3d()?.orbit; return o && o.panX === 0 && o.panZ === 0 ? o : null; })()`,
    { timeout: 10000 },
  );
  check('pressing “reset view” clears the pan too', clearedPan !== null, `pan ${strafed?.panX?.toFixed(3)}/${strafed?.panZ?.toFixed(3)} → 0/0`);

  // Shift-drag = grab the ground. The discriminator is the AZIMUTH: panning never turns the camera, so
  // pan moved + azimuth frozen is a pan — pan moved + azimuth moved would be an orbit wearing its name.
  const azBeforeShift = (await orbitOf()).azimuth;
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1, modifiers: 8 });
  for (let i = 1; i <= 5; i++) {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + i * 12, y: box.y + i * 8, button: 'left', buttons: 1, modifiers: 8 });
  }
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x + 60, y: box.y + 40, button: 'left', buttons: 0, clickCount: 1, modifiers: 8 });
  const shiftPanned = await page.waitForFunction(
    `(() => { const o = window.__nexusScene3d?.scene3d()?.orbit; return o && (Math.abs(o.panX) > 0.3 || Math.abs(o.panZ) > 0.3) ? o : null; })()`,
    { timeout: 10000 },
  );
  const azAfterShift = (await orbitOf()).azimuth;
  check(
    'shift-drag PANS the ground without turning the camera',
    shiftPanned !== null && Math.abs(azAfterShift - azBeforeShift) < 1e-9,
    `pan ${clearedPan.panX}/${clearedPan.panZ} → ${shiftPanned?.panX?.toFixed(3)}/${shiftPanned?.panZ?.toFixed(3)} · az ${azBeforeShift?.toFixed(3)} → ${azAfterShift?.toFixed(3)}`,
  );

  // Leave the camera where the Studio opened for everything that follows.
  await page.evaluate("document.querySelector('[data-scene-reset-view]').click()");
  await page.waitForFunction(
    `(() => { const o = window.__nexusScene3d?.scene3d(); return o && o.orbit.panX === 0 && o.orbit.panZ === 0 ? o : null; })()`,
    { timeout: 10000 },
  );

  // ── M5 v182: the surface NAMES what a click touches — the per-body picker ───────────────────────
  // The probe (`.scratch/v182/probe-pick.mjs`) measured where the demo bodies project on the default
  // view: Cube A's center sits at NDC (-0.1082, 0.0764), Cube C's at (0.1316, -0.0287). Those two are
  // the pinned targets because their hit margin is the whole half-box (~0.5 world units): the demo's
  // frame loop drifts every body's y by `bob·0.01` per frame — a slow random walk in a long-running
  // page — and the view center (whose margin to Cube B is only ~0.16) cannot carry a stable answer.
  // Which exact body sits under the CENTER pixel is pinned deterministically in `scene3dSurface.test.ts`
  // instead, where no frame loop runs. A and C naming DIFFERENT bodies is also what proves spatial
  // discrimination: a picker that answered one name for every pixel would fail exactly here.
  const selectedOf = async () => (await page.evaluate('window.__nexusScene3d.scene3d()'))?.selected ?? null;
  const rect = await page.evaluate(
    "(() => { const r = document.getElementById('nexus-scene3d').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })()",
  );
  // NDC → pixel: x = (ndc+1)/2·W, y = (1−ndc)/2·H (pixel y points DOWN).
  const clickNdc = async (nx, ny, label) => {
    const px = Math.round(rect.left + ((1 + nx) / 2) * rect.width);
    const py = Math.round(rect.top + ((1 - ny) / 2) * rect.height);
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', buttons: 1, clickCount: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', buttons: 0, clickCount: 1 });
    // An EMPTY label means the click is expected to MISS — wait for the report to CLEAR instead.
    // (`'—'` is the HUD's fallback text, never a report value, so it can never be waited on here.)
    const cond = label
      ? `(() => { const r = window.__nexusScene3d?.scene3d(); return r && r.selected && r.selected.name === '${label}' ? r : null; })()`
      : `(() => { const r = window.__nexusScene3d?.scene3d(); return r && r.selected === null ? r : null; })()`;
    await page.waitForFunction(cond, { timeout: 10000 });
  };

  await clickNdc(-0.1082, 0.0764, 'Cube A');
  const hudPickedA = await page.evaluate("document.querySelector('[data-scene3d-picked]')?.textContent ?? null");
  check(
    'clicking where Cube A stands names Cube A, and the HUD agrees',
    (await selectedOf())?.name === 'Cube A' && hudPickedA !== null && hudPickedA.includes('Cube A'),
    `${JSON.stringify(await selectedOf())} · HUD ${JSON.stringify(hudPickedA)}`,
  );

  await clickNdc(0.1316, -0.0287, 'Cube C');
  check(
    'and clicking where Cube C stands names a DIFFERENT body — the pick is spatial, not a constant',
    (await selectedOf())?.name === 'Cube C',
    JSON.stringify(await selectedOf()),
  );

  // Empty sky at the top-left: a miss, and the report clears — the HUD answers with an honest dash.
  await clickNdc(-0.84, 0.88, ''); // the click is expected to MISS: clickNdc waits for the report to clear
  const hudPickedEmpty = await page.evaluate("document.querySelector('[data-scene3d-picked]')?.textContent ?? null");
  check(
    'clicking empty sky CLEARS the selection, and the HUD shows an honest dash',
    (await selectedOf()) === null && hudPickedEmpty !== null && hudPickedEmpty.includes('—'),
    `${JSON.stringify(await selectedOf())} · HUD ${JSON.stringify(hudPickedEmpty)}`,
  );

  // ── M5 v163: the scene SURVIVES the surface — save, load, and the document door ─────────────────
  // Save records the LIVE scene in the runtime's own format; load restores it into a FRESH scene (the
  // demo scene and its loop are never touched); send-to-document files the AUTHORED bodies into the
  // canonical Design Document as a real addSubtree — asserted against the `__nexus` editor bridge, so
  // a handler that only moved local state would fail here.

  // One authored body first: the composer's four demo bodies are deliberately NOT authored, and a send
  // with none would be refused — the surface does not file a frame about nothing.
  await page.evaluate("document.querySelector('[data-scene-add-body]').click()");
  await page.waitForFunction(
    `(() => { const r = window.__nexusScene3d?.scene3d(); return r && r.scene.entities === ${bodiesBefore + 1} ? r : null; })()`,
    { timeout: 10000 },
  );

  // `__nexus` is a bridge of READERS (snapshot()/nodeCount()), not a snapshot — call snapshot() and read
  // the plain fields off it.
  const docBefore = await page.evaluate(
    'window.__nexus ? ((s) => ({ nodes: s.nodeCount, cursor: s.history.cursor }))(window.__nexus.snapshot()) : null',
  );
  check('the editor bridge answers while the 3D surface is up', docBefore !== null, JSON.stringify(docBefore));

  await page.evaluate("document.querySelector('[data-scene-save]').click()");
  const savedNote = await page.waitForFunction(
    `(() => { const n = document.querySelector('[data-scene3d-save-note]'); return n && n.textContent.includes('saved 5 bodies') ? n.textContent : null; })()`,
    { timeout: 10000 },
  );
  check(
    'pressing “save” records the live scene in the runtime’s own save format',
    savedNote !== null && savedNote.includes('nexus-three-runtime-save'),
    savedNote,
  );

  await page.evaluate("document.querySelector('[data-scene-load]').click()");
  const loadedNote = await page.waitForFunction(
    `(() => { const n = document.querySelector('[data-scene3d-save-note]'); return n && n.textContent.includes('restored 5 bodies') ? n.textContent : null; })()`,
    { timeout: 10000 },
  );
  check(
    'pressing “load” restores into a FRESH scene — two scenes, demo untouched',
    loadedNote !== null && loadedNote.includes('2 scenes'),
    loadedNote,
  );
  const stillDemo = await page.evaluate('window.__nexusScene3d.scene3d()');
  check(
    'the visible scene after the restore is still the demo scene',
    stillDemo?.scene?.name === 'Studio Scene' && stillDemo?.scene?.entities === bodiesBefore + 1 && stillDemo?.scenes === 2,
    JSON.stringify(stillDemo?.scene),
  );

  await page.evaluate("document.querySelector('[data-scene-send-doc]').click()");
  const sentNote = await page.waitForFunction(
    `(() => { const n = document.querySelector('[data-scene3d-save-note]'); return n && n.textContent.includes('sent 1 authored bodies') ? n.textContent : null; })()`,
    { timeout: 10000 },
  );
  check('pressing “send to doc” answers with the addSubtree it filed', sentNote !== null && sentNote.includes('addSubtree of 2 nodes'), sentNote);

  const docAfter = await page.evaluate(
    `(() => { const s = window.__nexus.snapshot(); const f = s.nodes.find((n) => n.type === 'frame' && n.name.startsWith('Scene: ')); return { nodes: s.nodeCount, cursor: s.history.cursor, frame: f ? { name: f.name, children: f.childCount } : null }; })()`,
  );
  check(
    'the document really holds the filed scene frame (a real addSubtree of 2 nodes)',
    docAfter !== null && docAfter.frame?.children === 1 && docAfter.cursor > docBefore.cursor && docAfter.nodes === docBefore.nodes + 2,
    JSON.stringify(docAfter),
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
console.log('[scene3d-browser-probe] ALL ASSERTIONS PASSED (the 3D surface is reachable, live, honest about its backend — and its scene survives the surface)');
