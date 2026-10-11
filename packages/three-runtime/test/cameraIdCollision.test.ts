// M5 v225 — the two `create*` seams that take an explicit id answered a TAKEN one with `Map.set`, so the
// live record was evicted and replaced with nothing said.
//
// The camera half was measured on the shipped bytes before this file existed, by a probe that called
// `createCamera(scene, 'Cam A REPLACED', 'perspective', {}, a.id)` on a scene holding `Cam A` (ACTIVE) and
// `Cam B`. It printed:
//
//   PROBE OVERWRITE   threw=null
//                     size 2 -> 2
//                     account Cam A:true,Cam B:false -> Cam A REPLACED:false,Cam B:false
//                     activeNow=NULL
//                     cameraCreated fired 1x: <the new camera>
//                     activeCameraChanged fired 0x
//
// So the restore named the scene's ACTIVE camera and the scene came back holding two cameras with
// `active=false` on BOTH — nothing to draw from — while the bus announced a create and never mentioned the
// seat that had just been vacated. The solo probe (`Cam A` the only camera) came back `active=true`, because
// the `size === 1` branch fires on the replacement; so the bug only bites when a SECOND camera exists, which
// is exactly the state a cinematic restore arrives in.
//
// The rule this codebase already states four times ("a restore never overwrites live state" — restoreEntity,
// loadSaveFile, restoreNPC, restorePlayer) is now followed by both create* verbs, and these cases pin the two
// halves of it: a taken id is REFUSED, and a refusal leaves every field it reports exactly as found.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  ThreeRuntime,
  createHeadlessBackend,
  manualFrameScheduler,
  cameraId,
  sceneId,
  type HeadlessBackend,
} from '../src/index.js';

const CONFIG = {
  renderer: { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'default' as const, stencil: false, depth: false, logarithmicDepthBuffer: false },
  shadowMap: { enabled: false, type: THREE.BasicShadowMap, autoUpdate: false },
  toneMapping: THREE.NoToneMapping,
  toneMappingExposure: 1,
  colorSpace: 'srgb' as const,
  maxLights: 100,
  frustumCulling: true,
  sortObjects: true,
};

const mockCanvas = { width: 800, height: 600, style: {}, addEventListener() {}, removeEventListener() {}, getContext: () => null } as unknown as HTMLCanvasElement;

function headlessRuntime() {
  let backend: HeadlessBackend | null = null;
  const scheduler = manualFrameScheduler();
  const runtime = new ThreeRuntime(CONFIG, {
    backend: () => {
      backend = createHeadlessBackend(CONFIG);
      return backend;
    },
    scheduler,
  });
  runtime.initialize(mockCanvas);
  return { runtime, scheduler, backend: backend! };
}

/** The whole `active` account of one scene, as a sorted list of `name:flag`. The refusal must leave this
 *  string IDENTICAL — stronger than "the active camera is still A", because it also pins that no other
 *  camera was touched and that the roster is the same size. */
const activeAccount = (runtime: ThreeRuntime, id: ReturnType<typeof sceneId>) =>
  [...(runtime.getScene(id)?.cameras.values() ?? [])].map((c) => `${c.name}:${c.active}`).sort().join(',');

describe('M5 v225 — a create* seam refuses an id the live record already holds', () => {
  let runtime: ThreeRuntime;
  let backend: HeadlessBackend;
  let scene: ReturnType<ThreeRuntime['createScene']>;

  beforeEach(() => {
    const h = headlessRuntime();
    runtime = h.runtime;
    backend = h.backend;
    scene = runtime.createScene('Collision Scene');
  });

  it('the probe case, inverted: naming the ACTIVE camera is refused, and the active seat survives', () => {
    // The exact pre-fix scenario: two cameras, the first active, and a create naming the active one's id.
    const a = runtime.createCamera(scene.id, 'Cam A');
    runtime.createCamera(scene.id, 'Cam B');
    const before = activeAccount(runtime, scene.id);
    expect(before).toBe('Cam A:true,Cam B:false');

    expect(() => runtime.createCamera(scene.id, 'Cam A REPLACED', 'perspective', {}, a.id))
      .toThrow(`createCamera: camera ${a.id} is already in scene ${scene.id}; a restore never overwrites live state`);

    // The defect's symptom is what this asserts: before the fix the scene ended up with NO active camera.
    expect(activeAccount(runtime, scene.id)).toBe(before);
    expect(a.active).toBe(true);
    expect(a.name).toBe('Cam A');
  });

  it('the refused camera is not merely un-flagged — it is the SAME object, untouched', () => {
    // An overwrite could satisfy the account above by re-creating the camera with the right name and flag.
    // This pins identity: the live record is not replaced at all.
    const a = runtime.createCamera(scene.id, 'Cam A', 'perspective', { fov: 41 });
    const threeCamera = a.threeCamera;

    expect(() => runtime.createCamera(scene.id, 'Cam A REPLACED', 'perspective', { fov: 90 }, a.id)).toThrow();

    const still = runtime.getScene(scene.id)!.cameras.get(a.id)!;
    expect(still).toBe(a);
    expect(still.threeCamera).toBe(threeCamera);
    expect((still.threeCamera as THREE.PerspectiveCamera).fov).toBe(41);
  });

  it('the refusal moves NO name on the bus: neither cameraCreated nor activeCameraChanged', () => {
    // The bus is where the old behaviour lied — it announced a create and said nothing about the seat that
    // was vacated. A refusal now announces nothing at all, like every other refusal in this class.
    const a = runtime.createCamera(scene.id, 'Cam A');
    runtime.createCamera(scene.id, 'Cam B');
    const heard: string[] = [];
    runtime.addEventListener('cameraCreated', () => heard.push('created'));
    runtime.addEventListener('activeCameraChanged', () => heard.push('changed'));

    expect(() => runtime.createCamera(scene.id, 'Wrong', 'perspective', {}, a.id)).toThrow();

    expect(heard).toEqual([]);
  });

  it('the refusal does not wedge the scene: a FRESH id in the same scene still works', () => {
    const a = runtime.createCamera(scene.id, 'Cam A');
    expect(() => runtime.createCamera(scene.id, 'Wrong', 'perspective', {}, a.id)).toThrow();

    const fresh = runtime.createCamera(scene.id, 'Allowed', 'perspective');

    expect(runtime.getScene(scene.id)!.cameras.size).toBe(2);
    expect(activeAccount(runtime, scene.id)).toBe('Allowed:false,Cam A:true');
    expect(fresh.id).not.toBe(a.id);
  });

  it('an id the scene ALREADY holds from another scene is allowed — the map is per-scene', () => {
    // Camera ids address one scene's camera set (`defineCinematic` refuses a shot naming a camera the scene
    // lacks), so the collision is scoped to the scene: the same id in a second scene is a DIFFERENT camera.
    const here = runtime.createCamera(scene.id, 'Here', 'perspective', {}, 'shared-id');
    const other = runtime.createScene('Other Scene');
    const there = runtime.createCamera(other.id, 'There', 'perspective', {}, 'shared-id');

    expect(here.id).toBe('shared-id');
    expect(there.id).toBe('shared-id');
    expect(runtime.getScene(other.id)!.cameras.get('shared-id' as ReturnType<typeof cameraId>)!.name).toBe('There');
    expect(runtime.getScene(scene.id)!.cameras.get('shared-id' as ReturnType<typeof cameraId>)!.name).toBe('Here');
  });
});

describe('M5 v225 — createScene refuses a taken id the same way', () => {
  let runtime: ThreeRuntime;
  let stage: ReturnType<ThreeRuntime['createScene']>;

  beforeEach(() => {
    runtime = headlessRuntime().runtime;
    stage = runtime.createScene('Stage', 'stage');
  });

  it('a taken scene id is refused, naming the id and the rule', () => {
    expect(() => runtime.createScene('Stage Again', 'stage'))
      .toThrow('createScene: scene stage is already in this graph; a restore never overwrites live state');
  });

  it('the live scene is not evicted: its bodies, cameras and active seat all survive', () => {
    // The scene half of the same `Map.set` bug: an overwritten scene took every entity, camera and animation
    // with it, and when it held the active seat the graph went on naming an id whose contents had been
    // swapped underneath it.
    const camera = runtime.createCamera(stage.id, 'Stage Cam');
    runtime.createEntity(stage.id, 'Cube', 'mesh');
    const entityCount = runtime.getScene(stage.id)!.entities.size;
    const active = runtime.getSceneGraph().activeSceneId;

    expect(() => runtime.createScene('Stage Again', 'stage')).toThrow();

    const after = runtime.getScene('stage' as ReturnType<typeof sceneId>)!;
    expect(after).toBe(stage);
    expect(after.name).toBe('Stage');
    expect(after.entities.size).toBe(entityCount);
    expect(after.cameras.get(camera.id)).toBe(camera);
    expect(runtime.getSceneGraph().activeSceneId).toBe(active);
  });

  it('no sceneCreated is announced by the refusal', () => {
    const heard: string[] = [];
    runtime.addEventListener('sceneCreated', () => heard.push('created'));

    expect(() => runtime.createScene('Stage Again', 'stage')).toThrow();

    expect(heard).toEqual([]);
  });

  it('the restore wedge the loader depends on still works: a saved id in a FRESH graph', () => {
    // `loadSaveFile` refuses to invent the scene a file describes, so the documented protocol is
    // createScene(name, savedId) -> loadSaveFile. That protocol must survive the refusal, and it does,
    // because it names an id the fresh graph does not hold.
    const body = runtime.createEntity(stage.id, 'Cube', 'mesh');
    const cam = runtime.createCamera(stage.id, 'Cam', 'perspective', {}, 'shotcam');
    runtime.defineCinematic(stage.id, {
      id: 'seq',
      name: 'Seq',
      shots: [{ id: 's1', cameraId: cam.id, startTime: 0, endTime: 1, transition: 'cut', transitionDuration: 0 }],
    });
    const file = runtime.buildSaveFile(stage.id, 0);

    const target = headlessRuntime().runtime;
    const rebuilt = target.createScene('Rebuilt', stage.id);
    target.createCamera(rebuilt.id, 'Cam again', 'perspective', {}, cam.id);
    const report = target.loadSaveFile(file, stage.id);

    expect(report.sceneId).toBe(stage.id);
    expect(report.entities).toEqual([body.id]);
    expect(report.sequences).toEqual(['seq']);
    // And the restored scene is a DIFFERENT graph's record: the writer's own scene is untouched.
    expect(runtime.getScene(stage.id)!.entities.get(body.id)).toBe(body);
  });

  it('an id held by another runtime is not a collision here — the graph is per-instance', () => {
    const other = headlessRuntime().runtime;

    const twin = other.createScene('Twin', 'stage');

    expect(twin.id).toBe('stage');
    expect(other.getScene('stage' as ReturnType<typeof sceneId>)!.name).toBe('Twin');
    expect(runtime.getScene(stage.id)!.name).toBe('Stage');
  });
});
