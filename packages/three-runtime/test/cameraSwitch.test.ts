// M5 v224 — `setActiveCamera` validated its argument AFTER committing the edit. The method cleared every
// camera's `active` flag and only then looked the requested id up, so `setActiveCamera(scene, BOGUS)` answered
// `false` — the same answer its no-such-scene branch gives — while leaving the scene with NO active camera at
// all. Measured on the shipped bytes before this file existed: the reported active id went to `null`, no name
// fired on the bus (the refusal has no payload to news, correctly), and because `animate()` renders only when
// `activeCamera` is found, the drawing STOPPED — `backend.stats.calls` grew by 4 over three frames before the
// refusal and by 0 after it. A refusal that edits is the worst shape of refusal: the caller is told nothing
// happened, and everything happened.
//
// The fix is the two lines swapped. These cases are the two halves of that claim: a refusal is a no-op on
// EVERY field it reports, and a success still emits `activeCameraChanged` once, AFTER both flags moved.
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

/** The whole `active` account of one scene, as a sorted list of `name:flag`. A refusal must leave this
 *  string IDENTICAL, which is a stronger claim than "the active id is still X" — it also pins that no OTHER
 *  camera was touched. */
const activeAccount = (runtime: ThreeRuntime, id: ReturnType<typeof sceneId>) =>
  [...(runtime.getScene(id)?.cameras.values() ?? [])].map((c) => `${c.name}:${c.active}`).sort().join(',');

interface SwitchData {
  sceneId: unknown;
  cameraId: unknown;
}

describe('M5 v224 — a refused camera switch moves nothing', () => {
  let runtime: ThreeRuntime;
  let backend: HeadlessBackend;
  let scheduler: ReturnType<typeof manualFrameScheduler>;
  let scene: ReturnType<ThreeRuntime['createScene']>;
  let cam1: ReturnType<ThreeRuntime['createCamera']>;
  let cam2: ReturnType<ThreeRuntime['createCamera']>;
  let switched: SwitchData[];

  beforeEach(() => {
    const h = headlessRuntime();
    runtime = h.runtime;
    backend = h.backend;
    scheduler = h.scheduler;
    scene = runtime.createScene('Switch Scene');
    cam1 = runtime.createCamera(scene.id, 'Cam 1');
    cam2 = runtime.createCamera(scene.id, 'Cam 2');
    switched = [];
    runtime.addEventListener('activeCameraChanged', (data?: unknown) => switched.push(data as SwitchData));
  });

  it('a refusal for an id this scene does not hold leaves the previously active camera ACTIVE', () => {
    expect(cam1.active).toBe(true);

    const answer = runtime.setActiveCamera(scene.id, cameraId('camera-that-does-not-exist'));

    expect(answer).toBe(false);
    expect(cam1.active).toBe(true);
    expect(runtime.getActiveScene()?.cameras.values().next().value?.active).toBe(true);
  });

  it('the refusal leaves EVERY camera flag as it found it, not only the active one', () => {
    // The clear loop used to run over all of them, so "the active one survived" would be too weak a pin.
    runtime.setActiveCamera(scene.id, cam2.id);
    const before = activeAccount(runtime, scene.id);

    runtime.setActiveCamera(scene.id, cameraId('no-such-camera'));

    expect(activeAccount(runtime, scene.id)).toBe(before);
  });

  it('the two refusals are the SAME no-op: a bad scene and a bad camera both move no flag and fire no name', () => {
    const accountBefore = activeAccount(runtime, scene.id);

    const badScene = runtime.setActiveCamera(sceneId('scene-that-does-not-exist'), cam2.id);
    const badCamera = runtime.setActiveCamera(scene.id, cameraId('no-such-camera'));

    expect([badScene, badCamera]).toEqual([false, false]);
    expect(activeAccount(runtime, scene.id)).toBe(accountBefore);
    expect(switched).toEqual([]);
  });

  it("a camera that belongs to ANOTHER scene is refused here, and neither scene's account moves", () => {
    const other = runtime.createScene('Other Scene');
    const otherCam = runtime.createCamera(other.id, 'Other Cam');
    const thisAccount = activeAccount(runtime, scene.id);
    const thatAccount = activeAccount(runtime, other.id);

    const answer = runtime.setActiveCamera(scene.id, otherCam.id);

    expect(answer).toBe(false);
    expect(activeAccount(runtime, scene.id)).toBe(thisAccount);
    expect(activeAccount(runtime, other.id)).toBe(thatAccount);
  });

  it('a successful switch emits activeCameraChanged exactly once, with the pair asked for', () => {
    runtime.setActiveCamera(scene.id, cam2.id);

    expect(switched).toEqual([{ sceneId: scene.id, cameraId: cam2.id }]);
  });

  it('the announcement arrives AFTER both flags moved: a listener sees cam2 active and cam1 not', () => {
    // v211's rule, because `emit` try/CATCHES each listener and would swallow an inline expect: RECORD what
    // the listener read from the SCENE (not from the payload) and assert outside it.
    const seen: string[] = [];
    runtime.addEventListener('activeCameraChanged', () => {
      seen.push(activeAccount(runtime, scene.id));
    });

    runtime.setActiveCamera(scene.id, cam2.id);

    expect(seen).toEqual(['Cam 1:false,Cam 2:true']);
  });

  it('the bus reports ASKS, not deltas: re-asking the active camera emits, and exactly one camera stays active', () => {
    runtime.setActiveCamera(scene.id, cam1.id);

    expect(switched.length).toBe(1);
    expect(activeAccount(runtime, scene.id)).toBe('Cam 1:true,Cam 2:false');
  });

  it('exactly one camera is active after a success, a refusal and a re-ask — the invariant the old order broke', () => {
    runtime.setActiveCamera(scene.id, cam2.id);
    const countActive = () => [...runtime.getScene(scene.id)!.cameras.values()].filter((c) => c.active).length;
    expect(countActive()).toBe(1);

    runtime.setActiveCamera(scene.id, cameraId('no-such-camera'));
    expect(countActive()).toBe(1);

    runtime.setActiveCamera(scene.id, cam2.id);
    expect(countActive()).toBe(1);
  });

  it('the render loop keeps drawing through a refusal: the frame before and the frame after both render', () => {
    // The consequence that made this a bug rather than a style point, measured at the ref: 4 draws over three
    // frames, then 0 — a refusal that stops the picture. `start()` renders once immediately and each `step()`
    // renders once, so the window's draw count is its frame count.
    runtime.start();
    for (let i = 0; i < 3; i += 1) scheduler.step();
    const before = backend.stats.calls;
    expect(before).toBe(4);

    expect(runtime.setActiveCamera(scene.id, cameraId('no-such-camera'))).toBe(false);
    for (let i = 0; i < 3; i += 1) scheduler.step();

    expect(backend.stats.calls - before).toBe(3);
  });

  it('a throwing listener cannot un-apply the switch: the flags move before the emit, and the emit catches', () => {
    runtime.addEventListener('activeCameraChanged', () => {
      throw new Error('a listener that fails');
    });

    expect(() => runtime.setActiveCamera(scene.id, cam2.id)).not.toThrow();
    expect(activeAccount(runtime, scene.id)).toBe('Cam 1:false,Cam 2:true');
  });

  it('the first camera of a scene is active on creation, so the refusal has something to preserve', () => {
    // The census names this write as the OTHER thing `cameraCreated` announces, and it is what a refusal
    // would otherwise erase: a one-camera scene refused on a bad id must still be drawing.
    const solo = runtime.createScene('Solo Scene');
    const only = runtime.createCamera(solo.id, 'Only Cam');
    expect(only.active).toBe(true);

    expect(runtime.setActiveCamera(solo.id, cameraId('no-such-camera'))).toBe(false);

    expect(activeAccount(runtime, solo.id)).toBe('Only Cam:true');
  });
});
