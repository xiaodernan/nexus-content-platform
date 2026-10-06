// NEXUS M5 v140 — the FIRST consumer of @nexus/three-runtime (ADR 0016 amendment 140); v163 added §6.
//
// Every M5 grant so far has had to write the same bound: "no consumer imports `@nexus/three-runtime`;
// the roadmap's M5 entry is still a runtime with tests, not a feature a user can open." v138 gave the
// package a combat record and v139 gave it a package face, and the bound survived both. This proof
// closes the AGENT half of it: `agents/runtime`'s `scene.*` tool family, driven through the registry's
// own §28 checkpoint, with the REAL `ThreeRuntime` behind the `SceneDriver` seam.
//
// Why the seam and not an import: `agents/runtime` does not depend on `@nexus/three-runtime`. It declares
// the narrow interface it needs and the HOST supplies the implementation — the shape `browserTools` uses
// for `BrowserDriver`. A fake driver would prove the family's own rules (that is what the vitest suite
// does); only wiring the REAL package proves the seam is the right width. That is this file's job.
//
// What it asserts, in order:
//   §1 the real runtime answers the seam — every tool result is checked against the RUNTIME's own state,
//      not against the tool's echo of it;
//   §2 the family composes a scene WITHOUT rendering — the headless backend received ZERO draws, and the
//      same backend receives one the moment the frame loop is stepped, so "no frames" is a measurement
//      rather than a claim about an unused object;
//   §3 the §28 gate is the registry's and it is the only one — an unapproved call reaches the driver zero
//      times, and the same call with an approval reaches it exactly once;
//   §4 the refusals are spoken by the side that knows the fact, and the runtime's state is untouched by a
//      refused call;
//   §6 (v163) the scene survives the process: scene.save serialises the runtime's own save file through
//      the door, scene.load reads it back into a fresh scene with the SAME body ids, the runtime's
//      anti-overwrite rule refuses a live target, and a file that is not a save-file object is refused
//      before the driver is asked anything;
//   §7 this repository's HEAD is byte-identical: everything here ran in memory.
// Run after `npm run build`:  node docs/evidence/agents/scene-tools-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync } from '../lib/syncproc.mjs';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const { ToolRegistry, registerSceneTools, SCENE_TOOL_SPECS } = rt;
const three = await import(pathToFileURL('./packages/three-runtime/dist/index.js').href);
const { createThreeRuntime, createHeadlessBackend, manualFrameScheduler } = three;
// `@nexus/three-runtime` exports its OWN modules, not three.js's classes — the seam converts a plain
// triple into the Vector3 the package's `createEntity` expects, so this proof imports three.js directly
// rather than expecting the package to re-export a library it only uses internally.
const THREE = await import(pathToFileURL('./node_modules/three/build/three.module.js').href);

const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

// ── the real runtime, driven headlessly ──────────────────────────────────────────────────────────────
const scheduler = manualFrameScheduler();
const backend = createHeadlessBackend({
  renderer: { antialias: true, alpha: false, preserveDrawingBuffer: false, powerPreference: 'default', stencil: true, depth: true, logarithmicDepthBuffer: false },
  shadowMap: { enabled: true, type: 2, autoUpdate: true },
  toneMapping: 4,
  toneMappingExposure: 1,
  colorSpace: 'srgb',
  maxLights: 100,
  frustumCulling: true,
  sortObjects: true,
});
const runtime = createThreeRuntime({}, { backend: () => backend, scheduler });
runtime.initialize({ width: 800, height: 600, style: {} });

// ── the seam: a SceneDriver over the REAL ThreeRuntime ───────────────────────────────────────────────
// Every method delegates to the package's own public API and converts only at the boundary (a triple
// becomes the runtime's own Vector3). Nothing here re-implements a scene graph.
const driver = {
  engine: 'three-runtime',
  createScene: (name) => runtime.createScene(name).id,
  addEntity: (sceneId, spec) => {
    const position = spec.position ? new THREE.Vector3(...spec.position) : undefined;
    return runtime.createEntity(sceneId, spec.name, spec.kind, undefined, undefined, position).id;
  },
  removeEntity: (sceneId, entityId) => runtime.removeEntity(sceneId, entityId),
  addCamera: (sceneId, name) => runtime.createCamera(sceneId, name).id,
  setActiveCamera: (sceneId, cameraId) => runtime.setActiveCamera(sceneId, cameraId),
  summarize: (sceneId) => {
    const scene = runtime.getScene(sceneId);
    if (!scene) return undefined;
    const active = [...scene.cameras.values()].find((c) => c.active);
    return {
      sceneId,
      name: scene.name,
      entities: scene.entities.size,
      cameras: scene.cameras.size,
      animations: scene.animations.size,
      entityNames: [...scene.entities.values()].map((e) => e.name),
      cameraNames: [...scene.cameras.values()].map((c) => c.name),
      activeCamera: active ? active.id : null,
    };
  },
  // v163 — persistence delegates to the runtime's own save file; the driver paraphrases nothing.
  saveScene: (sceneId, savedAt) => runtime.buildSaveFile(sceneId, savedAt),
  loadScene: (sceneId, file) => runtime.loadSaveFile(file, sceneId),
};

const registry = registerSceneTools(new ToolRegistry(), driver);
let checkpointCalls = 0;
const gate = { checkpoint: () => { checkpointCalls += 1; return true; } };
let callSeq = 0;
const invoke = (tool, args = {}, opts = gate) =>
  registry.invoke({ callId: `scene-proof-${++callSeq}`, tool, args }, opts);

// ── §1 the real runtime answers the seam ─────────────────────────────────────────────────────────────
const created = await invoke('scene.create', { name: 'Arena' });
assert.equal(created.ok, true, `scene.create failed: ${created.error}`);
const sceneId = created.output.sceneId;
assert.equal(created.output.engine, 'three-runtime', 'the answer names the engine that answered');
assert.equal(runtime.getScene(sceneId).name, 'Arena', 'the RUNTIME holds the scene the tool reported');

const cube = await invoke('scene.entity.add', { sceneId, name: 'Cube', kind: 'mesh', x: 1, y: 2, z: 3 });
assert.equal(cube.ok, true, `scene.entity.add failed: ${cube.error}`);
const cubeId = cube.output.entityId;
assert.deepEqual(cube.output.position, [1, 2, 3], 'the report carries the position it was given');

// Read back through the RUNTIME, not through the tool: the body exists, at the place that was named.
const realEntity = runtime.getEntity(sceneId, cubeId);
assert.ok(realEntity, 'the runtime holds the body the tool reported');
assert.equal(realEntity.name, 'Cube');
assert.equal(realEntity.threeObject.position.x, 1);
assert.equal(realEntity.threeObject.position.y, 2);
assert.equal(realEntity.threeObject.position.z, 3);
console.log(`[§1] real runtime behind the seam: scene "${runtime.getScene(sceneId).name}" (${sceneId}) · body "${realEntity.name}" at (${realEntity.threeObject.position.toArray().join(', ')}) · engine reported as "${created.output.engine}"`);

// The runtime's own graph is the source of truth for the summary the tool returns.
const inspected = await invoke('scene.inspect', { sceneId });
assert.equal(inspected.ok, true, `scene.inspect failed: ${inspected.error}`);
assert.equal(inspected.output.entities, runtime.getScene(sceneId).entities.size, 'the summary counts what the runtime holds');
assert.equal(inspected.output.entityNames.includes('Cube'), true);

const cam = await invoke('scene.camera.add', { sceneId, name: 'Main' });
assert.equal(cam.ok, true, `scene.camera.add failed: ${cam.error}`);
assert.equal(cam.output.activeCamera, cam.output.cameraId, 'the first camera a scene gets is its active one');
assert.equal([...runtime.getScene(sceneId).cameras.values()].find((c) => c.active).id, cam.output.cameraId, 'and the RUNTIME agrees about which one is active');

const removed = await invoke('scene.entity.remove', { sceneId, entityId: cubeId });
assert.equal(removed.ok, true);
assert.equal(removed.output.removed, true);
assert.equal(runtime.getEntity(sceneId, cubeId), undefined, 'the body is gone from the runtime too');

// ── §2 the family composes WITHOUT rendering ─────────────────────────────────────────────────────────
// This is the §60 assertion the family exists to be able to make: a door that could answer with a
// picture would be `browserTools`' `base64-screenshot-placeholder` defect in a new costume. "No frames"
// is measured, and the SAME backend proves it can receive one — otherwise a broken frame loop would
// look exactly like a family that renders nothing.
assert.equal(backend.frames.length, 0, 'no tool call rendered a frame');
assert.equal(SCENE_TOOL_SPECS.some((s) => /screenshot|render|image|picture/i.test(s.name)), false, 'and no door is even NAMED like one');
for (const spec of SCENE_TOOL_SPECS) {
  assert.equal(/screenshot|base64|pixel/i.test(spec.description), false, `${spec.name}'s own description promises no picture`);
}

await invoke('scene.entity.add', { sceneId, name: 'Watched', kind: 'mesh' });
const afterCompose = backend.frames.length;
runtime.start(); // `start()` draws ONE frame synchronously, then schedules the next
const afterStart = backend.frames.length;
scheduler.step(); // the scheduled frame
const afterStep = backend.frames.length;
runtime.stop();
assert.equal(afterCompose, 0, 'composing a scene through the tools drew nothing');
assert.equal(afterStart, 1, 'start() drew exactly one frame');
assert.equal(afterStep, 2, 'and the stepped frame drew exactly one more — so the zero above is a measurement, not an idle backend');
console.log(`[§2] composing drew ${afterCompose} frame(s); the same backend drew ${afterStart} on start() and ${afterStep} after one step — the family composes, it does not render`);

// ── §3 the §28 gate is the registry's, and it is the only one ────────────────────────────────────────
const scenesBefore = runtime.getSceneGraph().scenes.size;
const before = checkpointCalls;
const denied = await invoke('scene.create', { name: 'Denied' }, {});
assert.equal(denied.ok, false, 'an unapproved write door is refused');
assert.match(denied.error, /checkpoint/i, 'and the refusal names the gate');
assert.equal(runtime.getSceneGraph().scenes.size, scenesBefore, 'the runtime did not move: no scene was created');
assert.equal(checkpointCalls, before, 'the gate was never even consulted — no checkpoint function was supplied');

const allowed = await invoke('scene.create', { name: 'Allowed' });
assert.equal(allowed.ok, true);
assert.equal(runtime.getSceneGraph().scenes.size, scenesBefore + 1, 'the approved call did create one');
assert.equal(checkpointCalls, before + 1, 'exactly one checkpoint for exactly one write');
console.log(`[§3] §28: 1 refused write moved the graph by 0 and asked the gate 0 times · 1 approved write moved it by 1 and asked once · registry is the only gate`);

// ── §4 refusals are spoken by the side that knows the fact ───────────────────────────────────────────
const noScene = await invoke('scene.entity.add', { sceneId: 'scene-nope', name: 'Ghost', kind: 'mesh' });
assert.equal(noScene.ok, false);
assert.match(noScene.error, /no scene scene-nope is held by the three-runtime driver/, 'the driver names the missing scene');

const partial = await invoke('scene.entity.add', { sceneId, name: 'Half', kind: 'mesh', x: 1, z: 3 });
assert.equal(partial.ok, false);
assert.match(partial.error, /position needs all three of x, y and z, or none/, 'a partial triple is refused rather than defaulted');

const entitiesBefore = runtime.getScene(sceneId).entities.size;
const badKind = await invoke('scene.entity.add', { sceneId, name: 'Torus', kind: 'torus' });
assert.equal(badKind.ok, false);
assert.match(badKind.error, /the declared kinds are mesh, group, sprite, points, line, skinnedMesh/);
assert.equal(runtime.getScene(sceneId).entities.size, entitiesBefore, 'three refused calls moved the runtime by 0 bodies');

const missingArg = await invoke('scene.create', {});
assert.equal(missingArg.ok, false);
assert.match(missingArg.error, /missing required/, 'the registry names a missing argument before any body runs');
console.log(`[§4] 4 refusals, each naming its own fact, and the runtime moved by 0 bodies: scene-missing · partial triple · unknown kind · missing arg`);

// ── §6 the scene survives the process (M5 v163) ──────────────────────────────────────────────────────
const vault = await invoke('scene.create', { name: 'Vault' });
const vaultId = vault.output.sceneId;
await invoke('scene.entity.add', { sceneId: vaultId, name: 'Kept A', kind: 'mesh', x: 1, y: 2, z: 3 });
await invoke('scene.entity.add', { sceneId: vaultId, name: 'Kept B', kind: 'mesh' });

const namedInstant = 54321;
const save = await invoke('scene.save', { sceneId: vaultId, savedAt: namedInstant });
assert.equal(save.ok, true, `scene.save failed: ${save.error}`);
assert.equal(save.output.savedAt, namedInstant, 'the instant the CALLER named is what the file carries — the runtime owns no wall clock');
assert.equal(save.output.entities, 2, 'the door reports the file’s structure, not a paraphrase of it');
assert.equal(save.output.rendered, false, 'and saving rendered nothing');
const savedFile = save.output.file;
assert.equal(savedFile.format, 'nexus-three-runtime-save', 'the file is the runtime’s own format');
assert.ok(savedFile.carries.includes('entities'), 'the file states what it carries');
assert.deepEqual(JSON.parse(JSON.stringify(savedFile)), savedFile, 'the file survives JSON round-for-round — the runtime’s own disk-safety claim, measured');

// Into a FRESH scene, through the JSON text, exactly as a caller over the registry would send it.
const fresh = await invoke('scene.create', { name: 'Fresh' });
const freshId = fresh.output.sceneId;
const load = await invoke('scene.load', { sceneId: freshId, file: JSON.stringify(savedFile) });
assert.equal(load.ok, true, `scene.load failed: ${load.error}`);
assert.equal(load.output.entities, 2, 'the door answers the driver’s own restore report');
// Cross-checked against the RUNTIME: the restored bodies exist, under the SAME ids the file carried.
const firstKeptId = savedFile.entities[0][0];
const restoredEntity = runtime.getEntity(freshId, firstKeptId);
assert.ok(restoredEntity, 'the runtime holds the restored body');
assert.equal(restoredEntity.name, 'Kept A', 'under the name the file carried');
const freshInspect = await invoke('scene.inspect', { sceneId: freshId });
assert.deepEqual([...freshInspect.output.entityNames].sort(), ['Kept A', 'Kept B'], 'and inspect — through the same door — sees both');

// Anti-overwrite: back into the LIVE vault, the driver refuses — a restore never overwrites live state.
const live = await invoke('scene.load', { sceneId: vaultId, file: JSON.stringify(savedFile) });
assert.equal(live.ok, false, 'loading a scene’s file back into that live scene is refused');
assert.match(live.error, /already in scene/, 'and the refusal is the driver’s own reason, intact');
assert.equal(runtime.getScene(vaultId).entities.size, 2, 'the live scene was not touched by the refused call');

// Garbage is refused by the DOOR, before the driver is asked anything.
const badJson = await invoke('scene.load', { sceneId: freshId, file: '{nope' });
assert.equal(badJson.ok, false);
assert.match(badJson.error, /not JSON a loader can read/, 'malformed JSON names itself');
const bare = await invoke('scene.load', { sceneId: freshId, file: '17' });
assert.equal(bare.ok, false);
assert.match(bare.error, /parses to number, not a save-file object/, 'a bare value names what it is');
const noSuchScene = await invoke('scene.load', { sceneId: 'scene-nope', file: '{}' });
assert.equal(noSuchScene.ok, false);
assert.match(noSuchScene.error, /no scene scene-nope is held/, 'a missing target is named before any file is read');
console.log(`[§6] the scene survives the process: scene.save carried the caller's instant (${namedInstant}) and 2 bodies through JSON unchanged · scene.load restored them into a fresh scene under the SAME ids (runtime-verified) · the live scene refused its own file (a restore never overwrites) · 3 garbage files refused by the door: not-JSON · bare number · missing target`);

// ── §7 the home repository never moved ───────────────────────────────────────────────────────────────
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§7: this repository HEAD byte-identical — everything here ran in memory');

console.log(`\n[summary] the FIRST consumer of @nexus/three-runtime: ${SCENE_TOOL_SPECS.length} scene.* doors over a driver seam (compose, inspect, and now save/load), driven through the registry's §28 gate, with the REAL package behind it · scenes composed AND restored in memory with 0 frames drawn by the tool calls · every tool answer cross-checked against the runtime's own graph · home HEAD byte-identical: yes`);
console.log('[scene-tools-proof] ALL ASSERTIONS PASSED (the 3D lane now composes, inspects, AND survives the process — without pretending to render)');
