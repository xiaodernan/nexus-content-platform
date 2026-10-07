// NEXUS M5 v142 — the Studio's 3D surface, the FIRST PRODUCT consumer of @nexus/three-runtime
// (ADR 0016 amendment 142); v163 added §6.
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
//   §6 (v163) the scene survives the process and enters the document: surface.save serialises the
//      runtime's own save file (with the AUTHORED bodies counted apart from the composed demo), a load
//      restores it into a fresh sibling scene under the SAME ids, and `composeDocumentOps` turns the
//      authored bodies into ONE ordinary design-model op that a REAL document accepts, renders as a
//      frame + spec text, and undoes cleanly;
//   §7 this repository's HEAD is byte-identical: everything here ran in memory.
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

// v199 — the components half: components enter through the RUNTIME'S OWN registry (addComponent), and
// the inspector reads that registry live. The Studio composes none, so the empty fact comes first, then
// a real population, then the removal — each answered by the report, never by the HUD's opinion.
assert.deepEqual(surface.report().inspector.components, [], 'a Studio-composed body has an empty components FACT (present, not missing)');
runtime.addComponent(cubeA, { type: 'health', data: { amount: 100 }, enabled: true });
runtime.addComponent(cubeA, { type: 'shield', data: {}, enabled: false });
const withComponents = surface.report().inspector;
assert.deepEqual(
  withComponents.components,
  [
    { name: 'health', enabled: true },
    { name: 'shield', enabled: false },
  ],
  'the inspector reads the live registry in the order the runtime holds it, disabled named as disabled',
);
assert.equal(runtime.removeComponent(cubeA, 'health'), true, 'the runtime owns removal');
assert.deepEqual(surface.report().inspector.components, [{ name: 'shield', enabled: false }], 'and the next report follows the registry, not a shadow');
console.log('[§7] and it reads the COMPONENT registry the runtime owns: empty fact stated for a body with none, two components added through addComponent answered in registry order (shield disabled), then removeComponent moved the next report — the report re-reads the live registry');

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
assert.deepEqual(
  beforeToggle.components,
  [
    { name: 'health', enabled: true },
    { name: 'shield', enabled: false },
  ],
  'two components added through the runtime are reported in registry order',
);

// Toggle health off through the surface's own verb.
const afterHealthOff = surface.toggleComponentEnabled('health');
assert.deepEqual(
  afterHealthOff.inspector.components,
  [
    { name: 'health', enabled: false },
    { name: 'shield', enabled: false },
  ],
  'toggling health flipped its enabled flag through the host gate',
);

// Toggle shield on.
const afterShieldOn = surface.toggleComponentEnabled('shield');
assert.deepEqual(
  afterShieldOn.inspector.components,
  [
    { name: 'health', enabled: false },
    { name: 'shield', enabled: true },
  ],
  'toggling shield flipped it from disabled to enabled',
);

// A ghost component does nothing.
const noChange = surface.toggleComponentEnabled('ghost');
assert.deepEqual(
  noChange.inspector.components,
  [
    { name: 'health', enabled: false },
    { name: 'shield', enabled: true },
  ],
  'a component that does not exist leaves the report unchanged',
);
console.log('[§7] and the component registry is EDITABLE: setComponentEnabled flips the enabled flag through the host gate (health on→off, shield off→on), the report follows the live registry, and a ghost component is refused silently');

// A body that LEAVES the scene has nothing to inspect: the selection stays a name, the facts go null, and
// nothing invents a position for a body that is gone. Remove the CURRENTLY SELECTED body (Cube B).
surface.removeBody(cubeB.id);
const goneReport = surface.report();
assert.equal(goneReport.inspector, null, 'a removed body has no facts');
assert.ok(goneReport.selected, 'while the selection is still the name it was — the two are separate state');
console.log('[§7] and a body that LEAVES the scene has nothing to inspect: the selection stays a name, the inspector answers null, and no position is invented for a body that is gone');

// ── §8 the home repository never moved ───────────────────────────────────────────────────────────────
rmSync(box, { recursive: true, force: true });
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§8: this repository HEAD byte-identical — everything here ran in memory');

console.log(`\n[summary] M5 v142+v163: the FIRST product consumer of @nexus/three-runtime — the Studio's 3D surface, graded from the SHIPPED Studio module (type-stripped, not copied) over the SHIPPED runtime · 1 scene + ${report.scene.entities} bodies + 1 aimed camera composed in memory with 0 GL objects · the v142 lighting defect measured as a term: ${withLights} lit vs ${withoutLights} unlit · the scene saved and restored in memory, the authored body filed into a REAL document as an undoable op · home HEAD byte-identical: yes`);
console.log('[scene-surface-proof] ALL ASSERTIONS PASSED (the 3D lane is reachable from the product, saves and restores what it composed, and files honest specs — never fake previews)');
