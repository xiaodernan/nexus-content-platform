// NEXUS M5 v142 — the Studio's 3D surface, the FIRST PRODUCT consumer of @nexus/three-runtime
// (ADR 0016 amendment 142); v163 added §6, v260 added §5b and v261 added §9.
//
// Every M5 grant before this one ended with the same bound, and it was written down every time:
// "nothing in the Studio imports `@nexus/three-runtime`; the roadmap's M5 entry is still a runtime with
// tests, not a feature a user can open." v140 closed the AGENT half (`scene.*` tools over a driver
// seam). This proof closes the PRODUCT half, and it is deliberately built out of the SHIPPED bytes:
//
//   - the runtime is `packages/three-runtime/dist` (build it first), driven on the headless seam v108
//     added, so no GPU and no browser are involved;
//   - the surface is `apps/studio/src/lib/scene3d.ts` — the ACTUAL Studio module, read off disk and
//     run through Node's own TypeScript type-stripper. A copy of its functions here would prove that
//     the copy works, which is the failure mode this file exists to avoid. (Since v163 the module
//     imports `@nexus/design-model`, so the stripped copy is written INSIDE the workspace — under
//     apps/studio — where Node can resolve that bare specifier to the package's SHIPPED dist.)
//
// What it asserts, in order:
//   §1 the Studio's composed scene IS the runtime's: every body id it reports is a registered
//      `ThreeEntity`, and the report describes the scene the graph names as active;
//   §2 the v142 defect is measurable rather than described — the two declared lights are IN the scene
//      the meshes are in, every demo body is a `MeshStandardMaterial`, and the package's own lighting
//      arithmetic returns a NON-ZERO lit colour with them and EXACTLY zero without them (that zero is
//      what "the scene rendered black" means);
//   §3 the camera the surface hands back is a real `THREE.Camera`, and the aim the component performs
//      changes its world matrix; a frame then reaches the backend carrying THAT camera and THAT scene;
//   §4 the frame count is the SURFACE's, not the renderer's — the loop can draw without the surface
//      counting, and a `step()` counts without a draw (the two are different questions);
//   §5 the surface is CONTROLLABLE, over the REAL runtime and a REAL THREE.Camera (v161);
//   §5b the ACTIVE SEAT is one of those controls, and the aim follows the camera the frame DRAWS (v260);
//   §6 (v163) the scene survives the process and enters the document: surface.save serialises the
//      runtime's own save file (with the AUTHORED bodies counted apart from the composed demo), a load
//      restores it into a fresh sibling scene under the SAME ids, and `composeDocumentOps` turns the
//      authored bodies into ONE ordinary design-model op that a REAL document accepts, renders as a
//      frame + spec text, and undoes cleanly;
//   §7 (v192) the selected body's INSPECTOR over the REAL runtime: what a pick names is read from the LIVE
//      scene at report time, so the section checks both halves — that a pick produces facts, and that the
//      facts FOLLOW the scene instead of being cached at the moment of the pick;
//   §9 (v261) the SCENE seat is one of those controls, one level above v260's camera seat: the world the
//      panel reads is the world it writes. Every scene row is walked once, switching re-aims the new world's
//      own camera and the next frame carries THAT scene, and pick/camera/light/save all address it — while
//      the body pair stays on the composed scene as the recorded bound;
//   §8 this repository's HEAD is byte-identical: everything here ran in memory.
//
// Run after `npm run build`:  node docs/evidence/studio/scene-surface-proof.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from '../lib/syncproc.mjs';

// ── the shipped runtime, and three.js itself ─────────────────────────────────────────────────────────
const three = await import(pathToFileURL('./packages/three-runtime/dist/index.js').href);
const { ThreeRuntime, createHeadlessBackend, manualFrameScheduler, entityId, sceneId } = three;
const THREE = await import(pathToFileURL('./node_modules/three/build/three.module.js').href);

// ── the SHIPPED Studio module, type-stripped rather than copied ──────────────────────────────────────
// Node can strip TypeScript syntax itself (node:module). The module is written out INSIDE the studio
// workspace so the bare `@nexus/design-model` import it grew in v163 resolves — to the package's own
// SHIPPED dist, not to a copy — and then imported.
const { stripTypeScriptTypes } = await import('node:module');
const STUDIO_MODULE = './apps/studio/src/lib/scene3d.ts';
const stripped = stripTypeScriptTypes(readFileSync(STUDIO_MODULE, 'utf8'), { mode: 'strip' });
const box = mkdtempSync(join('apps/studio', 'nexus-scene-surface-'));
// §8's `rmSync` runs only on a green walk. A red run aborts mid-file and leaves its stripped copy of
// `scene3d.mjs` inside `apps/studio`, where every file-walking census in this repository counts it as shipped
// code — so cleanup is bound to EXIT, not to the last section.
process.on('exit', () => rmSync(box, { recursive: true, force: true }));
const modulePath = join(box, 'scene3d.mjs');
writeFileSync(modulePath, stripped, 'utf8');
const studio = await import(pathToFileURL(modulePath).href);
const { createStudioScene, buildSceneReport, composeDocumentOps, spinAt, STUDIO_CAMERA_POSITION, STUDIO_CAMERA_LOOK_AT } = studio;
assert.equal(typeof createStudioScene, 'function', 'the Studio module was really imported, not re-implemented');
assert.equal(typeof composeDocumentOps, 'function', 'and the document composer came with it');

// The document side of §6 is the SHIPPED design model, the same dist the stripped module resolves to.
const dm = await import(pathToFileURL('./packages/design-model/dist/index.js').href);

const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

// ── the real runtime, on the headless seam, in memory ────────────────────────────────────────────────
const CONFIG = {
  renderer: { antialias: true, alpha: false, preserveDrawingBuffer: false, powerPreference: 'default', stencil: true, depth: true, logarithmicDepthBuffer: false },
  shadowMap: { enabled: true, type: 2, autoUpdate: true },
  toneMapping: 0,
  toneMappingExposure: 1,
  colorSpace: 'srgb',
  sortObjects: true,
};
const scheduler = manualFrameScheduler();
const backend = createHeadlessBackend(CONFIG);
let initialised = 0;
const runtime = new ThreeRuntime(CONFIG, {
  backend: () => {
    initialised += 1;
    return backend;
  },
  scheduler,
});
const mockCanvas = { width: 800, height: 600, style: {}, addEventListener() {}, removeEventListener() {}, getContext: () => null };
runtime.initialize(mockCanvas);

// The component's adapter, written the way the component writes it: the ONLY conversion from the
// module's plain `{x,y,z}` into what the package declares.
const adapter = {
  placeCamera: (scene, camera, position, lookAt) => {
    const found = runtime.getScene(sceneId(scene));
    const target = found?.cameras.get(camera);
    if (!target) return false;
    target.threeCamera.position.set(position.x, position.y, position.z);
    target.threeCamera.lookAt(new THREE.Vector3(lookAt.x, lookAt.y, lookAt.z));
    target.threeCamera.updateMatrixWorld(true);
    return true;
  },
};

// v192 — the pick seam, deterministic on purpose. The real raycaster needs a GL context and lives in the
// component; what this proof exercises is the INSPECTOR, so the adapter answers whichever body
// `pickTarget` names (null = a miss, which must clear the selection).
let pickTarget = null;
adapter.pickAt = (sid, _nx, _ny) => {
  const scene = runtime.getScene(sceneId(sid));
  const target = [...(scene?.entities.values() ?? [])].find((e) => e.name === pickTarget);
  return target ? { entityId: target.id, name: target.name, distance: 1 } : null;
};

// The component's saver (v163), written the same way: the ONLY place the runtime's real save file and
// the surface's structural one meet. What passes through is unparaphrased.
const saver = {
  buildSaveFile: (sid, savedAt) => runtime.buildSaveFile(sceneId(sid), savedAt),
  loadSaveFile: (file, sid) => runtime.loadSaveFile(file, sceneId(sid)),
};

let writeCalls = 0;
// M5 v277 — the surface now HANDS the frame writer the world it is animating, so what this harness records is
// the pair it was given. Resolving `surface.sceneId` inside the writer (as this file did until now) was the
// host half of the bug: a writer that ignored its first argument would still have spun the composed bodies.
const frameWrites = [];
const surface = createStudioScene(
  runtime,
  (writtenSceneId, bodyIds, motion) => {
    writeCalls += 1;
    frameWrites.push({ sceneId: writtenSceneId, ids: [...bodyIds], motion });
    const scene = runtime.getScene(sceneId(writtenSceneId));
    for (const id of bodyIds) {
      const entity = scene?.entities.get(entityId(id));
      assert.ok(entity, `the frame write was handed a body the HANDED world does not hold: ${id} in ${writtenSceneId}`);
      entity.threeObject.rotation.y = motion.y;
      entity.threeObject.position.y += motion.bob * 0.01;
    }
  },
  adapter,
  0,
  saver,
);

// ── §1 the Studio's scene IS the runtime's ───────────────────────────────────────────────────────────
const report = surface.report();
assert.equal(report.schema, 1);
assert.equal(report.backend, 'headless', 'the headless backend is the one that answered');
assert.equal(report.scenes, 1, 'exactly one scene was composed');
assert.equal(report.activeSceneId, surface.sceneId, 'the graph names the scene the surface built as ACTIVE');
assert.equal(report.scene.name, 'Studio Scene');
assert.deepEqual(report.scene.entityNames, ['Ground', 'Cube A', 'Cube B', 'Cube C']);
assert.deepEqual(report.scene.cameraNames, ['Studio Camera']);
assert.equal(report.scene.activeCamera, surface.cameraId, 'the camera the surface returns is the ACTIVE one');
const composed = runtime.getScene(sceneId(surface.sceneId));
for (const id of surface.bodyIds) assert.ok(composed.entities.has(entityId(id)), `body ${id} is registered`);
assert.equal(report.scene.entities, surface.bodyIds.length);
assert.equal(report.draws.calls, 0, 'nothing has been drawn yet — composing is not rendering');
console.log(`[§1] the Studio composed the runtime's own scene: 1 scene · ${report.scene.entities} bodies ${report.scene.entityNames.join('/')} · 1 camera (active) · the report and the graph are the same object read twice · ${report.draws.calls} draws so far`);

// ── §2 the v142 defect, measured ─────────────────────────────────────────────────────────────────────
// The claim is NOT "there are two lights in a config" — that was true while every mesh rendered black.
// It is: the lights are in the SCENE the meshes are in, the meshes depend on light for their colour, and
// the package's own lighting arithmetic therefore changes the answer.
const attached = composed.threeScene.children.filter((c) => c.isLight === true);
assert.equal(attached.length, 2, 'both declared lights are children of the scene');
for (const light of composed.lighting.lights) {
  assert.ok(composed.threeScene.children.includes(light.threeLight), `the ${light.type} light is not merely declared`);
}
const litMaterials = surface.bodyIds.map((id) => composed.entities.get(entityId(id)).threeObject.material);
for (const material of litMaterials) {
  assert.ok(material.isMeshStandardMaterial === true, 'every demo body is a MeshStandardMaterial — a LIT material');
}
// The dependency is stated where three.js states it rather than asserted from a guess: a standard
// material is PBR, its colour is a function of the lights in its scene, and there is no switch on the
// material that could make it self-lit. `emissive` is the only route to colour without light, and it
// is black on every body the Studio composes.
for (const material of litMaterials) {
  assert.equal(material.emissive.getHex(), 0x000000, 'no body carries emission, so its colour can only come from light');
}
// The package's own arithmetic, over the package's own light objects: Lambert-free, but exactly what
// makes the difference between "black" and "not black" — the term the renderer multiplies the material
// colour by. Ambient contributes `ambientIntensity`; the directional light contributes
// `intensity * max(0, dot(normal, direction))`.
const shade = (lights) => {
  let term = 0;
  for (const light of lights) {
    if (light.isAmbientLight === true) term += light.intensity;
    else if (light.isDirectionalLight === true) {
      const direction = light.position.clone().normalize();
      term += light.intensity * Math.max(0, direction.dot(new THREE.Vector3(0, 1, 0)));
    }
  }
  return term;
};
const withLights = shade(attached);
const withoutLights = shade([]);
assert.ok(withLights > 0, `a scene with its declared lights is lit (term ${withLights})`);
assert.equal(withoutLights, 0, 'the same arithmetic over NO lights is exactly 0 — which is what "renders black" means');
assert.equal(attached.length, composed.lighting.lights.length, 'nothing declared is left out of the scene');
// What the two lights contribute, named separately so the number above is not a coincidence.
assert.equal(Math.round(shade(attached.filter((l) => l.isAmbientLight)) * 100) / 100, 0.5, 'the ambient light is half the term');
assert.ok(shade(attached.filter((l) => l.isDirectionalLight)) > 0, 'the directional light adds to it on an up-facing surface');
console.log(`[§2] the two declared lights are IN the scene (${attached.map((l) => l.type).join(' + ')}), every body is a light-dependent MeshStandardMaterial, and the package's own lighting term is ${withLights} with them vs ${withoutLights} without: the "renders black" defect is a number, not a sentence`);

// ── §3 the camera is real, the aim is real, and a frame reaches the backend ──────────────────────────
const camera = composed.cameras.get(surface.cameraId);
assert.ok(camera.threeCamera instanceof THREE.Camera, 'the camera the surface hands back is a THREE.Camera');
// The compose already aimed it (that is what the adapter argument is for). To prove the AIM is what
// moved it rather than the construction, the camera is put back at the origin first — the exact state
// `createCamera` leaves it in — and the aim is then shown to change the world matrix.
camera.threeCamera.position.set(0, 0, 0);
camera.threeCamera.lookAt(new THREE.Vector3(0, 0, -1));
camera.threeCamera.updateMatrixWorld(true);
const atOrigin = camera.threeCamera.matrixWorld.clone();
assert.equal(atOrigin.determinant(), 1, 'a camera at the origin looking down -Z has an identity world matrix');
assert.equal(adapter.placeCamera(surface.sceneId, surface.cameraId, STUDIO_CAMERA_POSITION, STUDIO_CAMERA_LOOK_AT), true, 'the adapter could aim it');
assert.deepEqual(camera.threeCamera.position.toArray(), [STUDIO_CAMERA_POSITION.x, STUDIO_CAMERA_POSITION.y, STUDIO_CAMERA_POSITION.z]);
assert.notDeepEqual(camera.threeCamera.matrixWorld.elements, atOrigin.elements, 'aiming CHANGED the camera world matrix');
assert.notEqual(camera.threeCamera.matrixWorld.determinant(), 0);

runtime.start();
const stepped = scheduler.step();
runtime.stop();
assert.equal(stepped, 1, 'the manual scheduler ran exactly one frame');
const frames = backend.frames;
const drawn = frames[frames.length - 1];
assert.equal(drawn.camera, camera.threeCamera, 'the backend was handed the camera the Studio aimed');
assert.equal(drawn.scene, composed.threeScene, 'the backend was handed the scene the Studio composed');
assert.ok(drawn.objects >= 4, `the frame carried the bodies (${drawn.objects} objects traversed)`);
console.log(`[§3] the camera is a real THREE.Camera, aiming it moved it off the identity world matrix, and the frame the loop produced carried THAT camera and THAT scene into the backend (${drawn.objects} objects traversed, ${frames.length} draw recorded)`);

// ── §4 the frame count belongs to the surface, the draws belong to the backend ───────────────────────
const drawsAfterLoop = backend.frames.length;
assert.equal(surface.frames, 0, 'the LOOP drawing does not advance the surface count — a draw is not a step');
const afterStep = surface.step(1.25);
assert.equal(afterStep.frames, 1, 'a step counts exactly once');
assert.equal(writeCalls, 1, 'and it performed exactly one frame write');
// The pair the writer was handed, recorded rather than inferred. Here the seat is at home, so the two halves
// of v277 agree — §9 is where the world on screen and the world the surface composed are different, and this
// record is what lets that section name what was handed instead of what the host happened to look up.
assert.equal(frameWrites[0].sceneId, surface.sceneId, 'the write is handed the world it is animating');
assert.deepEqual(frameWrites[0].ids, surface.bodyIds, 'and that world\'s body ids, not a list the host assembled');
assert.equal(backend.frames.length, drawsAfterLoop, 'a step with no loop running drew nothing');
assert.equal(afterStep.draws.calls, drawsAfterLoop, "the report's draw tally is the backend's own");
// The motion is a function of the instant it was given, so a harness can predict a frame it never saw.
const atQuarter = spinAt(1.25);
assert.equal(atQuarter.y, 1, 'spinAt is linear in seconds: 1.25 s of spin is 1 radian');
assert.deepEqual(atQuarter, spinAt(1.25));
assert.equal(buildSceneReport(runtime, 7).frames, 7, 'a report never invents a count it was not given');
assert.equal(afterStep.draws.triangles, 0, 'the headless backend refuses to invent a triangle count (§60)');
console.log(`[§4] the surface's count (${surface.frames} step, ${writeCalls} write) is NOT the backend's (${backend.frames.length} draws): the loop drew without a step, and a step drew nothing · spinAt(1.25).y = ${atQuarter.y} — a function of the instant, not of a frame index · the unmeasurable tallies stay 0`);

// ── §5 the surface is CONTROLLABLE, over the REAL runtime and a REAL THREE.Camera (M5 v161) ─────────
// v161 turned the camera from a placement written once into an orbit. The pure suite asserts the arithmetic;
// THIS asserts the part only the real package can answer — that orbiting through the surface actually moves
// the runtime's own THREE.Camera, and that add/remove move the runtime's own graph.
const surfaceCamera = runtime.getScene(surface.sceneId)?.cameras.get(surface.cameraId);
assert.ok(surfaceCamera, "the real runtime holds the surface's camera");
const matrixBefore = surfaceCamera.threeCamera.matrixWorld.elements.slice();
const orbitBefore = surface.orbit;
const positionBefore = surfaceCamera.threeCamera.position.clone();

const orbited = surface.orbitBy({ azimuth: 0.6, elevation: 0.15 });
assert.notDeepEqual(surface.orbit, orbitBefore, "the surface's orbit moved");
// The REAL camera's world matrix changed — which is what "the camera turned" means, and what a surface that
// only updated its own numbers would fail.
assert.notDeepEqual(surfaceCamera.threeCamera.matrixWorld.elements, matrixBefore, "the runtime camera's world matrix moved with the orbit");
assert.notEqual(surfaceCamera.threeCamera.position.x, positionBefore.x, 'and its position is not the one it had');
// Distance is preserved: an orbit turns the camera, it does not also move it closer.
const distanceTo = (p) => Math.hypot(p.x, p.y + 0.2, p.z);
assert.ok(
  Math.abs(distanceTo(surfaceCamera.threeCamera.position) - distanceTo(positionBefore)) < 1e-6,
  'the camera kept its distance from the target',
);
// Turning the camera is not a frame, and the report says so.
assert.equal(orbited.frames, surface.frames, 'orbiting did not advance the frame count');
// Captured HERE, before the reset below: printing the position after the reset would show two identical
// numbers and read as "nothing moved" — the number a reader checks has to be the orbited one.
const orbitedX = surfaceCamera.threeCamera.position.x;
assert.deepEqual(orbited.orbit, surface.orbit, 'and the report carries the orbit the surface holds');

// Reset returns it to the view the surface opened with — checked on the real camera again.
surface.resetOrbit();
assert.deepEqual(surface.orbit, orbitBefore, 'reset restored the opening orbit');
assert.ok(Math.abs(surfaceCamera.threeCamera.position.x - positionBefore.x) < 1e-9, 'and the real camera is back at its opening position');

// Add and remove a body, checked against the RUNTIME's graph rather than the surface's array.
const graphBefore = runtime.getScene(surface.sceneId).entities.size;
const added = surface.addBody('Cube D', 'mesh');
assert.ok(added, 'addBody produced a body');
assert.equal(runtime.getScene(surface.sceneId).entities.size, graphBefore + 1, 'the RUNTIME holds one more entity');
assert.ok(runtime.getEntity(surface.sceneId, added.bodyId), 'and it is retrievable from the runtime by id');
assert.equal(surface.removeBody(added.bodyId), true);
assert.equal(runtime.getScene(surface.sceneId).entities.size, graphBefore, 'the runtime is back to its original size');
assert.equal(runtime.getEntity(surface.sceneId, added.bodyId), undefined, 'and the entity is gone from the runtime too');
assert.equal(surface.removeBody(added.bodyId), false, 'removing it twice answers false');
console.log(`[§5] the controls over the REAL runtime: orbiting moved the THREE.Camera's world matrix (x ${positionBefore.x.toFixed(3)} → ${orbitedX.toFixed(3)} orbited → ${surfaceCamera.threeCamera.position.x.toFixed(3)} after reset) without changing its distance · the frame count did not move · add/remove moved the runtime's own graph ${graphBefore} → ${graphBefore + 1} → ${graphBefore}`);

// ── §5b the SEAT is a control, and the aim follows the camera that DRAWS (M5 v260) ──────────────────
// v161 turned the camera into an orbit; v244 let the surface author cameras; neither made the ACTIVE row —
// the one `animate` renders from (threeRuntime.ts:2799), `pickAt` casts its ray from (:1497) and
// `activeCameraYaw` walks the player against (:2895) — controllable. Measured on the shipped bytes before
// this leg existed: with the seat moved out-of-band to a second camera, one drag wrote the FIRST one (the
// probe's `aimed camera-6, drawn camera-7`), so every orbit, wheel and pan landed on a camera nobody
// renders; and the only row the panel could not take out was the one holding the seat, because v244's
// refusal told the user to `call setActiveCamera first` — a call the UI could not make.
//
// Everything below is over the REAL runtime and REAL `THREE.Camera` objects, and it restores the scene to
// the one §5 left: one camera, the composed row holding the seat.
const aims = [];
const aimForReal = adapter.placeCamera;
adapter.placeCamera = (sid, camId, position, lookAt) => {
  aims.push(camId);
  return aimForReal(sid, camId, position, lookAt);
};

const seatScene = runtime.getScene(surface.sceneId);
const seatStart = [...seatScene.cameras.values()].find((c) => c.active);
assert.equal(seatStart.id, surface.cameraId, 'going in, the composed camera holds the seat');

const second = surface.addCamera('Proof Cam');
assert.ok(second, 'the surface authored a second camera');
assert.equal(seatScene.cameras.size, 2, 'the RUNTIME holds two cameras');
const freshCam = seatScene.cameras.get(second.cameraId);
assert.equal(freshCam.active, false, 'adding a camera does not grab the seat');
assert.deepEqual(freshCam.threeCamera.position.toArray(), [0, 0, 0], 'and does not aim it: createCamera leaves it at the origin looking down -Z');

surface.orbitBy({ azimuth: 0.5 });
assert.deepEqual(aims, [surface.cameraId], 'with the seat still on the composed row, the aim names the composed row');
assert.notDeepEqual(seatStart.threeCamera.position.toArray(), [0, 0, 0], 'the row being looked through moved with the drag');
assert.deepEqual(freshCam.threeCamera.position.toArray(), [0, 0, 0], 'the row nobody looks through stayed at the origin');
surface.resetOrbit();

const handed = surface.activateCamera(second.cameraId);
assert.equal(handed.ok, true, 'the surface handed the seat over');
assert.equal(handed.activeCamera, second.cameraId, 'and answered the seat the RUNTIME now names, not its own guess');
assert.deepEqual([...seatScene.cameras.values()].filter((c) => c.active).map((c) => c.id), [second.cameraId], 'exactly one row is active — v225 invariant held');
// The handover is part of the verb: the camera that was at the origin two lines ago now carries the SAME
// view the old seat held — same position, same orientation — so switching seats does not jump the picture.
const viewBefore = { position: seatStart.threeCamera.position.toArray(), quaternion: seatStart.threeCamera.quaternion.toArray() };
assert.deepEqual(freshCam.threeCamera.position.toArray(), viewBefore.position, 'the new seat was aimed with the orbit the user already held');
assert.deepEqual(freshCam.threeCamera.quaternion.toArray(), viewBefore.quaternion, 'and pointed the same way, not down -Z from the origin');
assert.deepEqual(aims.slice(-1), [second.cameraId], 'the aim that handover performed names the SEAT');
// PRE-FIX RED: before v260 the last aim was `surface.cameraId` whatever the seat was, and `seatStart` is
// `surface.cameraId`, so this line is the defect stated as data rather than as prose.
assert.notEqual(aims[aims.length - 1], surface.cameraId, 'the surface no longer aims a camera nobody draws from');

runtime.start();
assert.equal(scheduler.step(), 1, 'the manual scheduler ran one frame');
runtime.stop();
const drawnSeat = backend.frames[backend.frames.length - 1];
const drawnId = [...seatScene.cameras.values()].find((c) => c.threeCamera === drawnSeat.camera)?.id;
assert.equal(drawnId, second.cameraId, 'the frame was RENDERED from the camera the surface just aimed');
assert.equal(drawnId, aims[aims.length - 1], 'aimed === drawn: the same id is the last thing pointed at and the thing that drew');

// And the drag AFTER the handover moves the seat, leaving the displaced row alone.
aims.length = 0;
const displaced = seatStart.threeCamera.position.toArray();
const seatWasAt = freshCam.threeCamera.position.toArray();
surface.orbitBy({ azimuth: 0.4 });
assert.deepEqual(aims, [second.cameraId], 'one drag, one aim, aimed at the seat');
assert.notDeepEqual(freshCam.threeCamera.position.toArray(), seatWasAt, 'the seat moved');
assert.deepEqual(seatStart.threeCamera.position.toArray(), displaced, 'the camera that lost the seat is not being aimed any more');

// v244's refusal, over the production runtime, in the runtime's OWN words — and the unlock it names is a
// control the panel now has, so the sentence is an instruction rather than a dead end.
const blocked = surface.removeCamera(second.cameraId);
assert.equal(blocked.ok, false, 'the live seat refuses removal');
assert.equal(blocked.why, 'blocked', 'and the surface says so in data');
assert.match(blocked.reason, /call setActiveCamera first/, 'the refusal is the runtime\'s own sentence, unparaphrased');
assert.ok(blocked.reason.includes(second.cameraId), 'it names the camera it refused');
assert.equal(seatScene.cameras.size, 2, 'the refusal edited nothing');

const third = surface.addCamera('Third Cam');
assert.ok(surface.activateCamera(third.cameraId).ok, 'the seat moved again — the verb the refusal names');
assert.equal(surface.removeCamera(second.cameraId).ok, true, 'the row that LOST the seat is now removable: the instruction is reachable');

// Restore the scene §5 handed over: the composed camera holds the seat and nothing else is in the registry.
assert.ok(surface.activateCamera(seatStart.id).ok, 'the seat came back to the composed camera');
// The claim belongs HERE, not beside the paragraph above: `third` held the seat until that hand-back, and a
// row holding it is refused. Removing it after the seat moved off is the same reachability proof with no
// false claim attached to it.
assert.equal(surface.removeCamera(third.cameraId).ok, true, 'a row that only ever lost the seat is removable');
assert.equal(seatScene.cameras.size, 1, 'the runtime is back to one camera');
assert.equal([...seatScene.cameras.values()][0].active, true, 'and that row holds the seat');
surface.resetOrbit();
assert.equal(seatScene.cameras.has(second.cameraId), false, 'the authored rows are gone from the registry the report reads');
assert.equal(surface.report().scene.activeCamera, seatStart.id, 'the SURFACE agrees: the report reads the seat it restored');
console.log(`[§5b] the seat is a control over the REAL runtime: authored row ${second.cameraId} took the seat, the handover aimed it from ${viewBefore.position.map((n) => n.toFixed(3)).join(',')} (the displaced camera's own opening position, so the view did not jump) and the very next frame DREW it · every aim after the handover named the seat and never fell back to ${surface.cameraId} · the runtime's refusal of the live seat carries "call setActiveCamera first" and switching seats is what makes that row removable · scene restored to 1 camera, ${seatStart.id} active`);

// ── §6 the scene survives the process, and enters the document (M5 v163) ─────────────────────────────
// The file is the runtime's OWN save format, reached through the surface; the bodies it carries are
// counted apart from the composed demo; a restore lands in a FRESH sibling scene under the SAME ids;
// and the authored bodies become ONE ordinary design-model op — which a real document applies, reads
// back, and undoes like any other edit.
assert.deepEqual(surface.authoredBodyIds, [], 'before anyone authors, the authored list is empty — the four composed bodies are the demo, not user content');
const authored = surface.addBody('Cube D', 'mesh');
assert.ok(authored, 'a body was authored');
assert.deepEqual(surface.authoredBodyIds, [authored.bodyId], 'and the authored list holds exactly it');

const namedInstant = 777;
const file = surface.save(namedInstant);
assert.equal(file.savedAt, namedInstant, 'the instant the CALLER named is what the file carries');
assert.equal(file.format, 'nexus-three-runtime-save', 'the file is the runtime’s own format, unparaphrased');
assert.equal(file.entities.length, 5, 'the file carries all five bodies the runtime holds (4 composed + 1 authored)');
assert.ok(file.carries.includes('entities'), 'and states what it carries');
assert.deepEqual(JSON.parse(JSON.stringify(file)), file, 'and survives JSON round-for-round — the disk-safety claim, measured');

const restored = surface.load(file);
assert.equal(runtime.getSceneGraph().scenes.size, 2, 'the restore landed in a FRESH scene — the runtime now holds two');
assert.notEqual(restored.sceneId, surface.sceneId, 'and that scene is not the surface’s own');
const restoredScene = runtime.getScene(sceneId(restored.sceneId));
assert.equal(restoredScene.entities.size, 5, 'the restored scene holds all five bodies');
const keptId = file.entities[0][0];
assert.ok(restoredScene.entities.has(entityId(keptId)), 'under the SAME ids the file carried');
assert.equal(runtime.getEntity(sceneId(restored.sceneId), entityId(authored.bodyId)).name, 'Cube D', 'the authored body is among them, by name');
// The surface's own scene — and its loop — are exactly what they were.
assert.equal(surface.report().scene.entities, 5, 'the demo scene is untouched by the load');
assert.equal(surface.report().activeSceneId, surface.sceneId, 'and the surface still reports its own scene as active');

// The document half: the AUTHORED bodies become one ordinary op, applied to a REAL document.
const doc = dm.createEmptyDocument();
const facts = surface.authoredBodyIds.map((id) => {
  const entity = runtime.getScene(sceneId(surface.sceneId)).entities.get(entityId(id));
  const p = entity.threeObject.position;
  return { id, name: entity.name, kind: entity.type, position: { x: p.x, y: p.y, z: p.z } };
});
assert.equal(facts.length, 1, 'one authored body is filed — not the four composed ones');
const opsList = composeDocumentOps({ pageId: doc.activePageId, index: 0, sceneName: 'Studio Scene', bodies: facts });
assert.equal(opsList.length, 1, 'the scene becomes ONE op');
const op = opsList[0];
assert.equal(op.type, 'addSubtree', 'and that op is the document’s own addSubtree — nothing new was invented');
const applied = dm.applyOp(doc, op);
const frame = Object.values(applied.nodes).find((n) => n.name === 'Scene: Studio Scene');
assert.ok(frame, 'a real document accepted it, and the frame is there');
assert.equal(frame.childIds.length, facts.length, 'with one child per authored body');
const label = applied.nodes[frame.childIds[0]];
assert.match(label.characters, /mesh · \(/, 'the child is a SPEC of the body — name, kind and position — not a fake preview (§60)');
// Ring slot 1 (§5's add/remove already used slot 0): the position is the one the body was authored at.
assert.match(label.characters, /1\.3, 0, 2\.25/, 'and the position is the ring placement the body was authored at');
// It undoes like any other edit, because it IS any other edit.
const undone = dm.applyOp(applied, dm.invertOp(applied, op));
assert.equal(undone.nodes[frame.id], undefined, 'inverting the op removes the frame');
assert.equal(Object.values(undone.nodes).filter((n) => n.parentId === frame.id).length, 0, 'and every node filed under it');
// The refusals are the composer's own: nothing to file, no place to file it.
assert.throws(() => composeDocumentOps({ pageId: doc.activePageId, index: 0, sceneName: 'Studio Scene', bodies: [] }), /about nothing/, 'an empty scene is refused rather than filed');
assert.throws(() => composeDocumentOps({ pageId: '', index: 0, sceneName: 'S', bodies: facts }), /has to land somewhere/, 'and so is a frame with no parent');
console.log(`[§6] the scene survives the process and enters the document: save carried the caller's instant (${namedInstant}) and 5 bodies through JSON unchanged · a load restored them into a fresh scene under the same ids while the demo scene stayed active and untouched · the 1 AUTHORED body became one addSubtree of ${op.nodes.length} nodes a real document applied, read back as a spec, and undid cleanly`);

// ── §7 the selected body's INSPECTOR, over the REAL runtime (M5 v192) ────────────────────────────────
// The facts are read from the LIVE scene at report time (the lighting rule), so this section checks both
// halves: that a pick produces facts, and that those facts FOLLOW the scene rather than being cached at the
// moment of the pick.
//
// The selection is made through the surface's OWN `pickAt`, not by reaching into it — but the raycaster is
// this proof's: the real one lives in the component and needs a GL context, and a raycaster's accuracy is
// v182's subject, not this section's. `pickTarget` is what the deterministic adapter below answers.
runtime.resize(800, 600);
assert.equal(surface.report().inspector, null, 'nothing selected means nothing to inspect');

pickTarget = 'Cube A';
surface.pickAt(400, 300);
const picked = surface.report();
assert.ok(picked.selected, 'the pick recorded a selection');
assert.equal(picked.selected.name, 'Cube A');

const inspectorFacts = picked.inspector;
assert.ok(inspectorFacts, 'a selected body has an inspector');
assert.equal(inspectorFacts.id, picked.selected.id);
assert.equal(inspectorFacts.name, 'Cube A');
assert.equal(inspectorFacts.kind, 'mesh', 'the kind is the RUNTIME’s own, not a label this module chose');
assert.equal(inspectorFacts.visible, true);
assert.ok(inspectorFacts.position, 'and a position, because this host declares one');
// Compared against the runtime's OWN object rather than a constant: the controller pins
// `transform.position === threeObject.position`, so agreeing with it means the inspector read the live
// source. A hard-coded -1.6/0/0 here would pass even if the inspector invented its numbers.
const cubeA = [...runtime.getScene(surface.sceneId).entities.values()].find((e) => e.name === 'Cube A');
assert.ok(cubeA, 'the real runtime holds Cube A');
assert.ok(
  Math.abs(inspectorFacts.position.x - cubeA.threeObject.position.x) < 1e-9 &&
    Math.abs(inspectorFacts.position.y - cubeA.threeObject.position.y) < 1e-9 &&
    Math.abs(inspectorFacts.position.z - cubeA.threeObject.position.z) < 1e-9,
  'the position is the one the runtime holds',
);
console.log(`[§7] the inspector reads the LIVE scene: "${inspectorFacts.name}" is a ${inspectorFacts.kind}, ${inspectorFacts.visible ? 'visible' : 'hidden'}, at (${inspectorFacts.position.x}, ${inspectorFacts.position.y}, ${inspectorFacts.position.z}) — the runtime's own position, not a constant`);

// MOVE the body through the runtime and the inspector follows. A report that cached the facts at pick time
// would answer the OLD position here, which is exactly the failure this check exists to catch.
const movedBy = 3;
cubeA.threeObject.position.x += movedBy;
const movedInspector = surface.report().inspector;
assert.ok(movedInspector, 'the inspector is still there after the body moved');
assert.ok(
  Math.abs(movedInspector.position.x - (inspectorFacts.position.x + movedBy)) < 1e-9,
  `the inspector followed the live body: expected ${inspectorFacts.position.x + movedBy}, got ${movedInspector.position.x}`,
);
console.log(`[§7] and it FOLLOWS the scene: moving the body +${movedBy} moved the reported x ${inspectorFacts.position.x} → ${movedInspector.position.x} with no re-pick — the facts are read at report time, not remembered from the pick`);

// A pick that hits nothing CLEARS the selection, and a cleared selection has no inspector.
pickTarget = null;
surface.pickAt(400, 300); // the pick that MISSES — without it the selection is untouched, which is the
// first draft of this section's bug: it read the report and expected a clearing that no call had performed.
const cleared = surface.report();
assert.equal(cleared.selected, null, 'a pick into empty space clears the selection');
assert.equal(cleared.inspector, null, 'and leaves no inspector behind');
pickTarget = 'Cube A';
surface.pickAt(400, 300);

// A body that LEAVES the scene has nothing to inspect: the selection stays a name, the facts go null, and
// nothing invents a position for a body that is gone.
// (the v199 components block below re-picks first, so the removed body here is asserted before it)

// v255 — every registry state below is graded through THIS one helper. Production answers a selected body's
// components with TWO fields derived from ONE ordered registry (`selectionFactsOf` returns `components` = the
// enabled rows and `disabledComponents` = the rest, both in the order the runtime holds them), and the clauses
// this file carried before v255 pinned NEITHER half: they expected `components` to CONTAIN a disabled row,
// which stopped being true the day v207 added the second field, and nothing re-ran this proof, so it died at
// its first registry assertion while everything below it went unmeasured. Deriving both expectations from the
// registry the caller believes it is keeps the pair honest together: the clause goes red the day production's
// split changes, which is exactly the day the sentence about the split has to change too.
const gradedRegistries = [];
const registryFacts = (inspector, where, registry) => {
  gradedRegistries.push(registry);
  assert.ok(inspector, `${where}: the report carries an inspector to read`);
  assert.deepEqual(inspector.components, registry.filter((c) => c.enabled), `${where}: components is the ENABLED half, in the order the runtime holds it`);
  assert.deepEqual(inspector.disabledComponents, registry.filter((c) => !c.enabled), `${where}: disabledComponents is the DISABLED half, in the same order`);
};

// v199 — the components half: components enter through the RUNTIME'S OWN registry (addComponent), and
// the inspector reads that registry live. The Studio composes none, so the empty fact comes first, then
// a real population, then the removal — each answered by the report, never by the HUD's opinion.
registryFacts(surface.report().inspector, 'state 1 (a body the Studio composed has no components)', []);
runtime.addComponent(cubeA, { type: 'health', data: { amount: 100 }, enabled: true });
runtime.addComponent(cubeA, { type: 'shield', data: {}, enabled: false });
registryFacts(surface.report().inspector, 'state 2 (health enabled, then shield disabled, on Cube A)', [
  { name: 'health', enabled: true },
  { name: 'shield', enabled: false },
]);
// v255 — the SECOND stale defect in this section: `ThreeRuntime.removeComponent` takes
// `(sceneId, entity, componentType)`, and this call passed the entity where the id belongs and the type where
// the entity belongs. It threw `Cannot read properties of undefined (reading 'get')` inside the runtime — a
// crash, not a red assertion — which is why nobody noticed: the file had already died three lines above it,
// so this line was never reached, and a proof that dies early looks like a proof that is merely late.
assert.equal(runtime.removeComponent(surface.sceneId, cubeA, 'health'), true, 'the runtime owns removal');
registryFacts(surface.report().inspector, 'state 3 (the next report follows the registry, not a shadow)', [
  { name: 'shield', enabled: false },
]);
console.log('[§7] and it reads the COMPONENT registry the runtime owns: an empty fact stated for a body with none, two components added through addComponent answered in registry order (shield disabled), then removeComponent moved the next report — both halves derived, never hand-pinned');

// v200 — the component registry becomes EDITABLE: `setComponentEnabled` is a write verb over the same
// registry the inspector reads. The surface's `toggleComponentEnabled` calls through this gate; what
// passes through is unparaphrased.
pickTarget = 'Cube B';
surface.pickAt(400, 300);
const cubeB = [...runtime.getScene(surface.sceneId).entities.values()].find((e) => e.name === 'Cube B');
assert.ok(cubeB, 'the real runtime holds Cube B');
runtime.addComponent(cubeB, { type: 'health', data: { amount: 100 }, enabled: true });
runtime.addComponent(cubeB, { type: 'shield', data: {}, enabled: false });
const beforeToggle = surface.report().inspector;
registryFacts(beforeToggle, 'state 4 (Cube B holds health enabled and shield disabled)', [
  { name: 'health', enabled: true },
  { name: 'shield', enabled: false },
]);

// Toggle health off through the surface's own verb.
const afterHealthOff = surface.toggleComponentEnabled('health');
registryFacts(afterHealthOff.inspector, 'state 5 (the surface\'s own verb flipped health off)', [
  { name: 'health', enabled: false },
  { name: 'shield', enabled: false },
]);

// Toggle shield on.
const afterShieldOn = surface.toggleComponentEnabled('shield');
registryFacts(afterShieldOn.inspector, 'state 6 (and flipped shield on)', [
  { name: 'health', enabled: false },
  { name: 'shield', enabled: true },
]);

// A ghost component does nothing.
const noChange = surface.toggleComponentEnabled('ghost');
registryFacts(noChange.inspector, 'state 7 (a component that does not exist leaves the report unchanged)', [
  { name: 'health', enabled: false },
  { name: 'shield', enabled: true },
]);
console.log('[§7] and the component registry is EDITABLE: setComponentEnabled flips the enabled flag through the host gate (health on→off, shield off→on), both halves of the report follow the live registry, and a ghost component is refused silently');

// v201 — enabled gates query participation: `getEnabledComponents` returns only enabled components.
// Disabled ones are stored but invisible to iteration — the flag gates queries, not storage or rendering.
const entity = runtime.getEntity?.(surface.sceneId, cubeA.id);
assert.ok(entity, 'the real runtime holds Cube A for the query test');
// Re-add health (removed in v199) so we have three components to test with.
runtime.addComponent(entity, { type: 'health', data: { amount: 100 }, enabled: true });
runtime.addComponent(entity, { type: 'stamina', data: { current: 50 }, enabled: true });
assert.equal(entity.components.size, 3, 'three components are stored on the entity (shield from v199 + health re-added + stamina)');

const enabledBefore = runtime.getEnabledComponents?.(entity);
assert.ok(enabledBefore, 'getEnabledComponents exists');
assert.equal(enabledBefore.length, 2, 'only two are visible to queries — shield is disabled');
assert.deepEqual(
  enabledBefore.map((c) => c.type),
  ['health', 'stamina'],
  'enabled components returned in registry order',
);

// v255 — the SAME registry read back through the inspector, in the three states this block already creates.
// Two of them are states this proof had never visited: a body whose ENABLED half holds more than one row.
// That is the only thing that can pin the ORDER of `components`, and before v255 no graded state had two
// enabled rows to order, which is the hole the arms of this grant measured.
pickTarget = 'Cube A';
surface.pickAt(400, 300);
registryFacts(surface.report().inspector, 'state 8 (Cube A holds three rows, two of them enabled)', [
  { name: 'shield', enabled: false },
  { name: 'health', enabled: true },
  { name: 'stamina', enabled: true },
]);

// Disable stamina — now only health is queryable.
runtime.setComponentEnabled?.(surface.sceneId, cubeA.id, 'stamina', false);
const afterStaminaOff = runtime.getEnabledComponents?.(entity);
assert.equal(afterStaminaOff.length, 1, 'disabling stamina leaves one queryable');
assert.equal(afterStaminaOff[0].type, 'health', 'and it is health');
registryFacts(surface.report().inspector, 'state 9 (one enabled row, TWO disabled rows to order)', [
  { name: 'shield', enabled: false },
  { name: 'health', enabled: true },
  { name: 'stamina', enabled: false },
]);

// Re-enable shield — back to two queryable.
runtime.setComponentEnabled?.(surface.sceneId, cubeA.id, 'shield', true);
const afterShieldReenabled = runtime.getEnabledComponents?.(entity);
assert.equal(afterShieldReenabled.length, 2, 're-enabling shield brings it back to queries');
assert.deepEqual(
  afterShieldReenabled.map((c) => c.type),
  ['shield', 'health'],
  'registry order preserved: shield(first), health(second) — stamina disabled',
);
registryFacts(surface.report().inspector, 'state 10 (a row re-enabled at the head of the registry leads the enabled half)', [
  { name: 'shield', enabled: true },
  { name: 'health', enabled: true },
  { name: 'stamina', enabled: false },
]);
console.log('[§7] and enabled gates query participation: getEnabledComponents filters out disabled components (3 stored → 2 queryable → disable stamina → 1 → re-enable shield → 2), the flag gates queries not storage, and the inspector reports the same three states as two halves in the runtime\'s own order');

// The selection goes back to Cube B, which is the body the removal below takes out of the scene.
pickTarget = 'Cube B';
surface.pickAt(400, 300);

// A body that LEAVES the scene has nothing to inspect: the selection stays a name, the facts go null, and
// nothing invents a position for a body that is gone. Remove the CURRENTLY SELECTED body (Cube B).
surface.removeBody(cubeB.id);
const goneReport = surface.report();
assert.equal(goneReport.inspector, null, 'a removed body has no facts');
assert.ok(goneReport.selected, 'while the selection is still the name it was — the two are separate state');
console.log('[§7] and a body that LEAVES the scene has nothing to inspect: the selection stays a name, the inspector answers null, and no position is invented for a body that is gone');

// The population the helper walked is itself a claim, so it is read from what the helper RECORDED rather than
// from a sentence about it. `deepEqual` over an array is order-sensitive, but order is only witnessed where a
// half has two rows to put in an order: measured over the ten states above, the widest enabled half is 2 and
// the widest disabled half is 2, and a mutation that reverses either half is caught by a named state. Before
// v255 the widest enabled half was 1 (no graded state had two enabled rows), so reversing the enabled half in
// production survived every clause in this file — the hole these two assertions are the floor for.
const widest = (rows, keep) => Math.max(...rows.map((r) => r.filter(keep).length));
assert.ok(widest(gradedRegistries, (c) => c.enabled) >= 2, `${gradedRegistries.length} registry states graded and the widest ENABLED half holds ${widest(gradedRegistries, (c) => c.enabled)} row(s), so the order of \`components\` is pinned by nothing — a state with two enabled rows is the only thing that can name which one comes first`);
assert.ok(widest(gradedRegistries, (c) => !c.enabled) >= 2, `${gradedRegistries.length} registry states graded and the widest DISABLED half holds ${widest(gradedRegistries, (c) => !c.enabled)} row(s), so the order of \`disabledComponents\` is pinned by nothing`);
assert.equal(gradedRegistries.length, 10, 'ten registry states are graded through registryFacts — one empty, two from Cube A\'s first pair, three from the surface\'s own toggle verb, three from the query-participation block; a red here means a state stopped walking the one derivation, which is how this section lost its meaning once already');
console.log(`[§7] population of graded registry states: ${gradedRegistries.length} · widest enabled half ${widest(gradedRegistries, (c) => c.enabled)} rows · widest disabled half ${widest(gradedRegistries, (c) => !c.enabled)} rows — each half's ORDER is witnessed by a state that has two of them to order`);

// ── §9 the SCENE seat is a control, and every write follows the world on screen (M5 v261, body lane v277) ──
// v260 made the camera the renderer draws from a control; one level up, the SCENE it draws was still fixed.
// `buildSceneReport` has read the graph's active row since v142 and `animate` renders that row
// (threeRuntime.ts:2799), while every WRITE this surface performed named `built.sceneId`. The two agree only
// while nobody moves the seat — which is why 60 grants of green never saw the disagreement. Measured on the
// shipped bytes before this leg existed: with a second scene made active out-of-band, one drag aimed the
// COMPOSED scene's camera while the frame drew a camera in a different scene, the panel's camera buttons
// refused the rows that very panel had just listed, `save()` wrote the demo bodies while the person was
// looking at a world of one, and `setLight` changed a light no report was reading.
//
// The graph now holds THREE worlds: the composed demo, the sibling §6's load created, and a fresh one
// authored below. This section is LAST because the runtime has no scene-deletion verb (neither `removeScene`
// nor `deleteScene` exists in threeRuntime.ts), so a world added here stays in the graph for the rest of the
// run — and §6 pins `scenes.size === 2`, which an earlier world would break. The seat goes back to the
// composed scene before §8.
const sibling = runtime.createScene('Sibling World');
assert.equal(runtime.getSceneGraph().activeSceneId, surface.sceneId, 'creating a world does NOT move the seat: only the first scene of an empty graph takes it (threeRuntime.ts:1240)');
assert.equal(surface.report().activeSceneId, surface.sceneId, 'and the surface\'s own walk agrees — a new row appears while the active row stays put');

const worldRows = surface.report().sceneRows;
assert.deepEqual(worldRows.map((r) => r.id), [surface.sceneId, restored.sceneId, sibling.id], 'the walk visits every scene the graph holds, in the graph\'s own order — the population is named, not assumed');
assert.equal(surface.report().scenes, worldRows.length, 'scenes === sceneRows.length: the count the panel prints is read off the list the panel draws');
assert.deepEqual(worldRows.filter((r) => r.active).map((r) => r.id), [surface.sceneId], 'exactly one row is marked active, and it is the row the graph names');
for (const row of worldRows) assert.equal(row.entities, runtime.getScene(row.id).entities.size, `the row "${row.name}" counts the bodies its OWN scene holds`);
assert.equal(worldRows.find((r) => r.id === sibling.id).entities, 0, 'the new world holds nothing yet — switching to it shows an empty scene, which is an honest answer rather than an error');

const siblingBody = runtime.createEntity(sibling.id, 'Sibling Body', 'mesh');
const freshWorldCam = runtime.createCamera(sibling.id, 'Sibling Cam');
assert.equal(freshWorldCam.active, true, 'a scene\'s FIRST camera takes that scene\'s own seat (threeRuntime.ts:2630), so the new world has a view of its own');
assert.deepEqual(freshWorldCam.threeCamera.position.toArray(), [0, 0, 0], 'and nothing has aimed it: createCamera leaves it at the origin looking down -Z');

// The two refusals come first, because each must be a NO-OP — the defect this grant replaces was a silent
// action on the wrong subject, and a refusal that edits is the same failure wearing a red message.
aims.length = 0;
const noWorld = surface.activateScene('scene-not-in-the-graph');
assert.equal(noWorld.ok, false, 'a world the graph does not hold is refused');
assert.equal(noWorld.why, 'absent', 'and the refusal is data, not only prose');
assert.match(noWorld.reason, /scene-not-in-the-graph/, 'it names the world it could not find');
assert.deepEqual(aims, [], 'a refusal performs no aim');
assert.equal(runtime.getSceneGraph().activeSceneId, surface.sceneId, 'and moves nothing');

runtime.setActiveScene = undefined;
const blindHost = surface.activateScene(sibling.id);
assert.equal(blindHost.ok, false, 'a host with no scene-switch verb is refused rather than claimed');
assert.equal(blindHost.why, 'unsupported', 'and says which half it is missing — the runtime here is a host WITHOUT the verb, and the surface will not pretend');
assert.match(blindHost.reason, /no scene-switch verb/);
assert.deepEqual(aims, [], 'the refusal is a no-op here too');
assert.equal(runtime.getSceneGraph().activeSceneId, surface.sceneId, 'the seat never moved while the surface was saying it could not move it');
delete runtime.setActiveScene;
assert.equal(typeof runtime.setActiveScene, 'function', 'the shadow was this leg\'s fixture — the host\'s own verb answers again');

// THE HANDOVER. While the composed world is on screen, the person holds a view; switching worlds re-aims the
// NEW world's seat with it, so the picture does not jump to the origin a fresh `createCamera` left it at.
const homeCam = runtime.getScene(surface.sceneId).cameras.get(surface.cameraId);
assert.equal(homeCam.active, true, 'going in, the composed camera holds the composed scene\'s seat — the state §5b restored');
surface.resetOrbit();
surface.orbitBy({ azimuth: 0.7, elevation: 0.2 });
const heldView = { position: homeCam.threeCamera.position.toArray(), quaternion: homeCam.threeCamera.quaternion.toArray() };
// The composed world's lane, read off the surface while the seat is still home. §5 authored and removed one
// body (so it is back to what it composed), §6 authored one that is still there, §7 removed Cube B — which is
// why this is a derived length rather than the four the demo started with.
const homeLaneBeforeAway = [...surface.bodyIds];
assert.equal(homeLaneBeforeAway.length, runtime.getScene(surface.sceneId).entities.size, 'at home the lane and the runtime\'s own world are the same bodies');
assert.deepEqual(surface.authoredBodyIds, [authored.bodyId], 'and the authored list holds the one body this surface made in THIS world');
aims.length = 0;

const toSibling = surface.activateScene(sibling.id);
assert.equal(toSibling.ok, true, 'the surface switched the world it reads AND the world it writes');
assert.equal(toSibling.activeSceneId, sibling.id, 'and answered from the graph, not from the scene it happens to have been composed under');
assert.equal(toSibling.aimed, true, 'the new world has a camera, so the handover had something to point');
assert.deepEqual(aims, [freshWorldCam.id], 'one aim, and it names the camera the NEW world draws from');
assert.notEqual(aims[0], surface.cameraId, `PRE-FIX: before v261 this was ${surface.cameraId} — the composed scene's camera — while the frame drew ${freshWorldCam.id} in another world`);
assert.deepEqual(freshWorldCam.threeCamera.position.toArray(), heldView.position, 'the handover aimed the new seat with the view the person already held');
assert.deepEqual(freshWorldCam.threeCamera.quaternion.toArray(), heldView.quaternion, 'and pointed it the same way, not down -Z from the origin');
assert.deepEqual(homeCam.threeCamera.position.toArray(), heldView.position, 'the displaced camera keeps its own transform — switching worlds does not dispose of them');

// aimed === drawn, one level up: the frame the LOOP produces carries the OTHER world and its seat.
runtime.start();
assert.equal(scheduler.step(), 1, 'the manual scheduler ran one frame');
runtime.stop();
const drawnWorld = backend.frames[backend.frames.length - 1];
assert.equal(drawnWorld.scene, runtime.getScene(sibling.id).threeScene, 'the backend was handed the world the surface switched to, not the one it was composed under');
assert.equal(drawnWorld.camera, freshWorldCam.threeCamera, 'and the camera inside it is the one the handover aimed');
assert.equal(aims[aims.length - 1], freshWorldCam.id, 'aimed === drawn: the last thing pointed at is the thing that drew');

// A pick casts a ray in the world on screen. `Cube A` exists in the demo scene and NOWHERE in this one, so
// while the sibling is live it must MISS — before v261 it hit, and the inspector reported a body of a scene
// the panel was not showing.
pickTarget = 'Cube A';
surface.pickAt(400, 300);
assert.equal(surface.report().selected, null, 'a pick in the sibling misses the demo scene\'s bodies: the ray is cast in the world on screen');
assert.equal(surface.report().inspector, null, 'and leaves no inspector behind for a body it cannot see');
pickTarget = 'Sibling Body';
surface.pickAt(400, 300);
const worldPick = surface.report();
assert.equal(worldPick.selected.name, 'Sibling Body', 'while the body this world does hold is named');
assert.equal(worldPick.inspector.name, 'Sibling Body', 'and the inspector reads the same live scene the pick was cast in');
assert.deepEqual(worldPick.inspector.position, {
  x: siblingBody.threeObject.position.x,
  y: siblingBody.threeObject.position.y,
  z: siblingBody.threeObject.position.z,
}, 'from that scene\'s own object — the numbers are the runtime\'s, not a copy of a body in another world');

// The camera pair follows the switch, and so does the refusal sentence.
const worldRow = surface.addCamera('World Row');
assert.ok(worldRow, 'the panel\'s add-camera control authored a row while another world was live');
assert.equal(runtime.getScene(sibling.id).cameras.has(worldRow.cameraId), true, 'it landed in the world on screen');
assert.equal(runtime.getScene(surface.sceneId).cameras.has(worldRow.cameraId), false, 'not in the demo scene every camera verb used to name');
assert.equal(worldRow.count, 2, 'and the answer counts the LIVE world\'s rows');
const awayRow = surface.removeCamera(surface.cameraId);
assert.equal(awayRow.ok, false, 'the demo scene\'s camera is not a row this surface can take out while it is looking elsewhere');
assert.equal(awayRow.why, 'absent', 'refused as absent rather than edited — the pre-v261 bug was this call reaching into another scene');
assert.ok(awayRow.reason.includes(sibling.id), 'and the refusal names the world the surface is acting on, which is the sentence a user needs');
assert.equal(runtime.getScene(surface.sceneId).cameras.size, 1, 'the refusal edited nothing');
assert.equal(surface.removeCamera(worldRow.cameraId).ok, true, 'a row in the world on screen is removable');
assert.equal(runtime.getScene(sibling.id).cameras.size, 1, 'and the sibling is back to its own one camera');

// Lighting, too: the write and the report must agree about WHICH world's light they changed.
const homeAmbientBefore = runtime.getScene(surface.sceneId).lighting.lights.find((l) => l.id === 'ambient').threeLight.intensity;
const litReport = surface.setLight('ambient', { intensity: 0.4 });
assert.equal(litReport.scene.lighting.find((l) => l.id === 'ambient').intensity, 0.4, 'the report reads the light it just changed');
assert.equal(runtime.getScene(sibling.id).lighting.lights.find((l) => l.id === 'ambient').threeLight.intensity, 0.4, 'and the change landed in the world on screen');
assert.equal(runtime.getScene(surface.sceneId).lighting.lights.find((l) => l.id === 'ambient').threeLight.intensity, homeAmbientBefore, `the demo scene's light still answers ${homeAmbientBefore} — before v261 the write went there and the report read here`);

// The file a save button writes is the world the person is looking at.
const worldFile = surface.save(1234);
assert.equal(worldFile.entities.length, runtime.getScene(sibling.id).entities.size, 'the file carries the world on screen, body for body');
assert.deepEqual(worldFile.entities.map(([, record]) => record.name), ['Sibling Body'], `PRE-FIX: before v261 this filed the demo scene's ${runtime.getScene(surface.sceneId).entities.size} bodies while the panel showed one body nobody could name`);

// THE BODY LANE MOVES WITH THE SEAT (M5 v277). The block this one replaces MEASURED the bound and wrote it
// down: `addBody`/`removeBody` stayed on the COMPOSED scene because the host resolved its frame writer and its
// document send against `surface.sceneId`. Measured on the shipped bytes again before this leg: with the sibling
// live, `step()` handed the writer the composed world's bodies, so the world on screen stood perfectly still
// while an off-screen one spun; `addBody` filed a body nobody could see; `removeBody` accepted a body of the
// other world and answered `false` about the body under the cursor; and the store write beside `save()` named
// the composed scene, so one press wrote two worlds. The surface keeps a list PER WORLD now, and hands the
// frame writer the address it is animating, so a wrong-world write is not something a host expresses by accident.
const homeWorld = runtime.getScene(surface.sceneId);
const homeSpinBefore = [...homeWorld.entities.values()].map((e) => e.threeObject.rotation.y);
const composedCountBefore = homeWorld.entities.size;
const writesBefore = writeCalls;
assert.deepEqual(surface.bodyIds, [], 'the lane for this world is empty: `Sibling Body` was made by the host, not through this surface');
assert.deepEqual(surface.authoredBodyIds, [], 'and nothing has been authored here yet');
surface.step(1);
assert.equal(writeCalls, writesBefore + 1, 'a step while another world is on screen still performs exactly one frame write');
const awayWrite = frameWrites[frameWrites.length - 1];
assert.equal(awayWrite.sceneId, sibling.id, 'and it is HANDED the world on screen — pre-v277 this named the composed scene');
assert.deepEqual(awayWrite.ids, [], 'with only that world\'s bodies from this surface\'s lane');
assert.deepEqual([...homeWorld.entities.values()].map((e) => e.threeObject.rotation.y), homeSpinBefore, `the ${homeSpinBefore.length} bodies of the world nobody is looking at did not move — pre-v277 every frame wrote them`);

const worldBody = surface.addBody('World Body', 'mesh');
assert.ok(worldBody, 'the body control answers while another world is live');
assert.equal(runtime.getScene(sibling.id).entities.has(entityId(worldBody.bodyId)), true, 'and it lands in the world on screen — the bound v261 recorded, closed');
assert.equal(runtime.getScene(surface.sceneId).entities.has(entityId(worldBody.bodyId)), false, 'not in the composed scene');
assert.equal(homeWorld.entities.size, composedCountBefore, 'the composed world gained nothing');
assert.equal(worldBody.count, 1, 'and the answer counts the LIVE world\'s lane, not a global list');
assert.deepEqual(surface.bodyIds, [worldBody.bodyId], 'the lane the loop writes is this world\'s');
assert.deepEqual(surface.authoredBodyIds, [worldBody.bodyId], 'the authored list is per world too: the composed scene\'s authored body stays filed under the composed scene');
assert.equal(surface.report().scene.entities, 2, 'the report counts the world on screen, body plus the one just authored');

// THE ASYMMETRY, both directions. Pre-v277 the domain was ONE list for every world, so the button could take
// out a body of another world and refused the one in the world the person was looking at.
assert.equal(surface.removeBody(authored.bodyId), false, 'a body of the composed scene is not in this surface\'s domain while it looks elsewhere');
assert.equal(runtime.getScene(surface.sceneId).entities.has(entityId(authored.bodyId)), true, 'the refusal edited nothing');
assert.equal(surface.removeBody(siblingBody.id), true, 'a body the HOST made in the world on screen IS removable — the seat decides, not the list');
assert.equal(runtime.getScene(sibling.id).entities.has(entityId(siblingBody.id)), false, 'and it is gone from the runtime');
assert.deepEqual(surface.bodyIds, [worldBody.bodyId], 'removing a host body leaves the lane, which never held it, untouched');
assert.equal(surface.report().inspector, null, 'the selection named Sibling Body; a body that left the world on screen has no facts to report');

// The seat comes home, and everything §9 added to the graph stays there — the runtime cannot take a world
// back out, which is why this section is last.
aims.length = 0;
const backHome = surface.activateScene(surface.sceneId);
assert.equal(backHome.ok, true, 'the seat comes back to the composed scene');
assert.equal(backHome.activeSceneId, surface.sceneId, 'answered from the graph again');
assert.equal(backHome.aimed, true, 'and the composed world has a camera to aim');
assert.deepEqual(aims, [surface.cameraId], 'the aim follows the seat home: the composed world\'s own active row');
const homeReport = surface.report();
assert.equal(homeReport.activeSceneId, surface.sceneId, 'the report reads the demo scene again');
assert.deepEqual(homeReport.sceneRows.filter((r) => r.active).map((r) => r.id), [surface.sceneId], 'one row is marked active, and it is this one');
assert.equal(homeReport.scenes, worldRows.length, `the population is the same ${worldRows.length} worlds — switching adds and removes nothing, because there is no scene-deletion verb`);
assert.equal(homeReport.selected, null, 'the pick made in the sibling did not survive the switch: a selection is a body in a scene, and this scene does not hold it');
assert.equal(runtime.getScene(sibling.id).cameras.size, 1, 'the sibling keeps its own aimed camera, unused');
assert.equal(runtime.getScene(sibling.id).entities.size, 1, 'and one body — the one this surface authored while this world was on screen');

// THE LANE COMES BACK WITH THE SEAT. Every assertion above about the away world was about the LIST it owns;
// this is the other half of v277: switching worlds does not move a body between lists, and the loop resumes
// writing the world the person is looking at.
assert.deepEqual(surface.bodyIds, homeLaneBeforeAway, 'the composed world\'s lane is exactly what it was going out — in the order this surface made it');
assert.deepEqual(surface.authoredBodyIds, [authored.bodyId], 'and its authored list holds the body authored HERE, not the one filed under the sibling');
const homeWriteBefore = writeCalls;
surface.step(1);
assert.equal(writeCalls, homeWriteBefore + 1, 'a step back home performs one frame write');
assert.equal(frameWrites[frameWrites.length - 1].sceneId, surface.sceneId, 'handed the composed world this time');
assert.deepEqual(frameWrites[frameWrites.length - 1].ids, homeLaneBeforeAway, 'with exactly its bodies');
assert.notDeepEqual([...homeWorld.entities.values()].map((e) => e.threeObject.rotation.y), homeSpinBefore, `the ${homeSpinBefore.length} bodies on screen moved — the frames the away world could not spend are spent here`);

// THE DERIVATION, on the one state where this grant's two reads could disagree — and the shipped runtime
// cannot itself reach it, because it has no scene-deletion verb: a graph whose active id names a world the
// map does not hold. `SceneGraph` is plain data a HOST builds (`getSceneGraph` hands out the runtime's own
// object, threeRuntime.ts:4359), so the derivation has to answer it. Pre-v261, `scenes` came from
// `scenes.size` and `activeSceneId` was copied from `graph.activeSceneId`, which printed an active world and
// a list beside it that did not contain it — an address the panel could draw no row for.
const realGraph = runtime.getSceneGraph();
assert.equal(realGraph, runtime.getSceneGraph(), 'the runtime hands out its OWN graph object — this injection is a host editing its own data, not a copy of one');
const seatBeforeGhost = realGraph.activeSceneId;
realGraph.activeSceneId = 'a-world-the-runtime-never-held';
const ghostReport = buildSceneReport(runtime, 0);
assert.equal(ghostReport.sceneRows.filter((r) => r.active).length, 0, 'the walk lists what exists and marks NONE active: the address is read FROM the rows, never handed to them');
assert.equal(ghostReport.activeSceneId, null, 'PRE-FIX: two reads named a world the same report\'s own list did not hold');
assert.equal(ghostReport.scene, null, 'and a world that is not in the graph has no summary to invent');
assert.equal(ghostReport.scenes, ghostReport.sceneRows.length, 'the count is still the list it shows');

// THE SAME BROKEN SEAT, ASKED AS A CONTROL RATHER THAN A REPORT. A graph naming a world the runtime does not
// hold is un-reportable above; v277 makes it un-WRITEABLE too, because the runtime's answer to authoring into
// an unknown scene is a THROW (`Scene … not found`, threeRuntime.ts:1416) — which is the Add-a-body button
// crashing, and the world the person was looking at gaining a body one frame after a refusal.
const ghostSeatBodies = runtime.getScene(surface.sceneId).entities.size;
let ghostAuthorThrew = false;
let ghostAuthor = { threw: true };
try {
  ghostAuthor = surface.addBody('Ghost Author', 'mesh');
} catch {
  ghostAuthorThrew = true;
}
assert.equal(ghostAuthorThrew, false, 'authoring into a seat the runtime does not hold is a refusal, not a crash');
assert.equal(ghostAuthor, null, 'and the refusal is data — the surface claims no body');
let ghostRemoveThrew = false;
let ghostRemoved = true;
try {
  ghostRemoved = surface.removeBody('entity-no-world-holds');
} catch {
  ghostRemoveThrew = true;
}
assert.equal(ghostRemoveThrew, false, 'and taking one back out answers rather than throwing');
assert.equal(ghostRemoved, false, 'an id no world holds is refused in the same voice');
assert.equal(runtime.getScene(surface.sceneId).entities.size, ghostSeatBodies, `the world the person left behind still holds exactly ${ghostSeatBodies} bodies — the refusal created nothing anywhere`);
realGraph.activeSceneId = seatBeforeGhost;
assert.equal(runtime.getSceneGraph().activeSceneId, surface.sceneId, 'the seat is exactly where the injection found it');
surface.resetOrbit();
pickTarget = null;
console.log(`[§9] the scene seat is a control over the REAL runtime: ${worldRows.length} worlds in the graph, walked once, each row counting its own ${worldRows.map((r) => r.entities).join('/')} bodies · an unknown world and a host without the verb are both refused as no-ops (0 aims, seat unmoved) · switching aimed ${freshWorldCam.id} with the held view (${heldView.position.map((n) => n.toFixed(3)).join(',')}) and the very next frame carried THAT scene and THAT camera to the backend · a pick in the sibling missed ${worldRows[0].name}'s Cube A and hit Sibling Body · the camera and light writes and the saved file (${worldFile.entities.length} body) all landed in the world on screen · v277 moved the BODY LANE with the seat: the away write was handed ${sibling.id} with ${awayWrite.ids.length} ids and the composed world's ${homeSpinBefore.length} bodies stood still, authoring landed in the world on screen (its lane holds ${worldBody.count}) and the body filed into the other world was refused, while the host's body in THIS world was removable · the lane came back home as ${surface.bodyIds.length} ids and the next write named ${frameWrites[frameWrites.length - 1].sceneId} · a graph naming a world it does not hold answers activeSceneId null rather than an address its own ${ghostReport.sceneRows.length} rows do not list · that same broken seat refuses the body pair (${String(ghostAuthor)} / ${ghostRemoved}, ${ghostAuthorThrew + ghostRemoveThrew} throws, its world's ${ghostSeatBodies} bodies intact) · seat restored to ${surface.sceneId}, ${homeReport.scene.entities} bodies still drawn`);

// ── §8 the home repository never moved ───────────────────────────────────────────────────────────────
rmSync(box, { recursive: true, force: true });
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§8: this repository HEAD byte-identical — everything here ran in memory');

console.log(`\n[summary] M5 v142+v163: the FIRST product consumer of @nexus/three-runtime — the Studio's 3D surface, graded from the SHIPPED Studio module (type-stripped, not copied) over the SHIPPED runtime · 1 scene + ${report.scene.entities} bodies + 1 aimed camera composed in memory with 0 GL objects · the v142 lighting defect measured as a term: ${withLights} lit vs ${withoutLights} unlit · the scene saved and restored in memory, the authored body filed into a REAL document as an undoable op · home HEAD byte-identical: yes`);
console.log('[scene-surface-proof] ALL ASSERTIONS PASSED (the 3D lane is reachable from the product, saves and restores what it composed, and files honest specs — never fake previews)');
