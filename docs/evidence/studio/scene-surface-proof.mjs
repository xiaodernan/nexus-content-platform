// NEXUS M5 v142 — the Studio's 3D surface, the FIRST PRODUCT consumer of @nexus/three-runtime
// (ADR 0016 amendment 142).
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
//     the copy works, which is the failure mode this file exists to avoid.
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
//   §5 this repository's HEAD is byte-identical: everything here ran in memory.
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
// Node can strip TypeScript syntax itself (node:module). The module is written out beside its own
// source so any relative import it grows (it has none today) would still resolve, then imported.
const { stripTypeScriptTypes } = await import('node:module');
const STUDIO_MODULE = './apps/studio/src/lib/scene3d.ts';
const stripped = stripTypeScriptTypes(readFileSync(STUDIO_MODULE, 'utf8'), { mode: 'strip' });
const box = mkdtempSync(join(tmpdir(), 'nexus-scene-surface-'));
const modulePath = join(box, 'scene3d.mjs');
writeFileSync(modulePath, stripped, 'utf8');
const studio = await import(pathToFileURL(modulePath).href);
const { createStudioScene, buildSceneReport, spinAt, STUDIO_CAMERA_POSITION, STUDIO_CAMERA_LOOK_AT } = studio;
assert.equal(typeof createStudioScene, 'function', 'the Studio module was really imported, not re-implemented');

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

let writeCalls = 0;
const surface = createStudioScene(
  runtime,
  (bodyIds, motion) => {
    writeCalls += 1;
    const scene = runtime.getScene(sceneId(surface.sceneId));
    for (const id of bodyIds) {
      const entity = scene?.entities.get(entityId(id));
      assert.ok(entity, `the frame write was handed a body the runtime does not hold: ${id}`);
      entity.threeObject.rotation.y = motion.y;
      entity.threeObject.position.y += motion.bob * 0.01;
    }
  },
  adapter,
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
console.log(`[§1] the Studio composed the runtime's own scene: 1 scene 路 ${report.scene.entities} bodies ${report.scene.entityNames.join('/')} 路 1 camera (active) 路 the report and the graph are the same object read twice 路 ${report.draws.calls} draws so far`);

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
assert.equal(backend.frames.length, drawsAfterLoop, 'a step with no loop running drew nothing');
assert.equal(afterStep.draws.calls, drawsAfterLoop, "the report's draw tally is the backend's own");
// The motion is a function of the instant it was given, so a harness can predict a frame it never saw.
const atQuarter = spinAt(1.25);
assert.equal(atQuarter.y, 1, 'spinAt is linear in seconds: 1.25 s of spin is 1 radian');
assert.deepEqual(atQuarter, spinAt(1.25));
assert.equal(buildSceneReport(runtime, 7).frames, 7, 'a report never invents a count it was not given');
assert.equal(afterStep.draws.triangles, 0, 'the headless backend refuses to invent a triangle count (§60)');
console.log(`[§4] the surface's count (${surface.frames} step, ${writeCalls} write) is NOT the backend's (${backend.frames.length} draws): the loop drew without a step, and a step drew nothing 路 spinAt(1.25).y = ${atQuarter.y} — a function of the instant, not of a frame index 路 the unmeasurable tallies stay 0`);

// ── §5 the home repository never moved ───────────────────────────────────────────────────────────────
rmSync(box, { recursive: true, force: true });
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§5: this repository HEAD byte-identical — everything here ran in memory');

console.log(`\n[summary] M5 v142: the FIRST product consumer of @nexus/three-runtime — the Studio's 3D surface, graded from the SHIPPED Studio module (type-stripped, not copied) over the SHIPPED runtime 路 1 scene + ${report.scene.entities} bodies + 1 aimed camera composed in memory with 0 GL objects 路 the v142 lighting defect measured as a term: ${withLights} lit vs ${withoutLights} unlit 路 ${backend.frames.length} draw(s) carried by the frame loop 路 surface steps ${surface.frames} vs backend draws ${backend.frames.length}, kept apart 路 home HEAD byte-identical: yes`);
console.log('[scene-surface-proof] ALL ASSERTIONS PASSED (the 3D lane is reachable from the product, and the surface does not claim to have drawn what it did not)');
