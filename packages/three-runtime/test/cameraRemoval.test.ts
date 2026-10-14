// M5 v239 - the camera registry learns to shrink.
//
// Until this verb `scene.cameras` had exactly three writes - `new Map()` at createScene, `set` at
// createCamera, `delete` nowhere - which is why the surface's camera leg could honestly say "there is no
// third name to consider, because there is no third write" (scene3d.ts, v224's census). The registry could
// therefore only ever grow inside a live scene: the only way a camera left was `dispose()`, which takes the
// whole graph with it. A host that aims a shot, then retires the camera, has one remaining move - edit the
// Map from outside - and that move is what these cases pin the verb refusing.
//
// WHAT THE TWO REFUSALS PROTECT, MEASURED RATHER THAN ASSERTED. The active-seat rule is v225's: a `Map.set`
// that evicted the ACTIVE camera left the scene holding cameras with `active=false` on all of them, and
// because `animate()` draws only when it finds an active camera, the picture went silent (the v224 probe
// counted it: 4 draws over three frames, then 0). A removal that took the active camera would produce the
// same scene state through a different door, so this verb refuses it and says which call to make first. The
// shot rule is v118's: `updateCinematics` reads `scene.cameras.get(shot.cameraId)` with a non-null assertion
// and then writes through `camera.threeCamera` every frame (threeRuntime.ts:2952-2957). The last two cases in
// the fourth block bypass the verb and delete the out-of-band way, to show that refusal has two faces: a shot
// that MOVES the camera crashes the next frame, and a plain cut does not crash at all - it advances
// `currentShot` onto a camera the scene no longer holds while the active seat stays where it was.
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

/** The whole camera account of one scene: every roster name with its `active` flag, sorted. Every refusal in
 *  this file must leave this string IDENTICAL to the value taken before the call, which is a stronger claim
 *  than "the camera is still there" - it pins that no OTHER camera was touched and that the roster did not
 *  move. */
const cameraAccount = (runtime: ThreeRuntime, id: ReturnType<typeof sceneId>) =>
  [...(runtime.getScene(id)?.cameras.values() ?? [])].map((c) => `${c.name}:${c.active}`).sort().join(',');

interface RemovedData {
  sceneId: unknown;
  cameraId: unknown;
}

const shot = (id: string, cameraIdValue: ReturnType<typeof cameraId>, startTime: number, endTime: number) =>
  ({ id, cameraId: cameraIdValue, startTime, endTime, transition: 'cut' as const, transitionDuration: 0 });

describe('M5 v239 - a removable camera leaves the scene and the bus says so', () => {
  let runtime: ThreeRuntime;
  let backend: HeadlessBackend;
  let scheduler: ReturnType<typeof manualFrameScheduler>;
  let scene: ReturnType<ThreeRuntime['createScene']>;
  let active: ReturnType<ThreeRuntime['createCamera']>;
  let spare: ReturnType<ThreeRuntime['createCamera']>;
  let removed: RemovedData[];

  beforeEach(() => {
    const h = headlessRuntime();
    runtime = h.runtime;
    backend = h.backend;
    scheduler = h.scheduler;
    scene = runtime.createScene('Removal Scene');
    active = runtime.createCamera(scene.id, 'Cam Active');
    spare = runtime.createCamera(scene.id, 'Cam Spare');
    removed = [];
    runtime.addEventListener('cameraRemoved', (data?: unknown) => removed.push(data as RemovedData));
  });

  it('the non-active camera goes, the active seat is untouched, and cameraRemoved fires once with the pair', () => {
    expect(runtime.removeCamera(scene.id, spare.id)).toBe(true);

    const after = runtime.getScene(scene.id)!.cameras;
    expect(after.size).toBe(1);
    expect(after.has(spare.id)).toBe(false);
    expect(cameraAccount(runtime, scene.id)).toBe('Cam Active:true');
    expect(removed).toEqual([{ sceneId: scene.id, cameraId: spare.id }]);
  });

  it('the announcement arrives AFTER the delete: the listener reads the scene, not the payload', () => {
    // v211's rule, because `emit` try/CATCHES each listener and would swallow an inline expect: RECORD what
    // the listener read and assert outside it. A name emitted before the `delete` would tell a listener the
    // camera was gone while the report still carried it, which is the shape this leg exists to avoid.
    const seen: string[] = [];
    runtime.addEventListener('cameraRemoved', () => {
      const cameras = runtime.getScene(scene.id)!.cameras;
      seen.push(`${cameras.has(spare.id)}:${cameraAccount(runtime, scene.id)}`);
    });

    runtime.removeCamera(scene.id, spare.id);

    expect(seen).toEqual(['false:Cam Active:true']);
  });

  it('removal touches no other camera record: the survivor is the same object with the same THREE camera', () => {
    const threeCamera = active.threeCamera;

    runtime.removeCamera(scene.id, spare.id);

    const kept = runtime.getScene(scene.id)!.cameras.get(active.id)!;
    expect(kept).toBe(active);
    expect(kept.threeCamera).toBe(threeCamera);
  });

  it('the removed camera is the one asked for, not the one that happened to be last', () => {
    // A `delete` of the insertion-order tail would satisfy the size and the active account above.
    const third = runtime.createCamera(scene.id, 'Cam Third');

    runtime.removeCamera(scene.id, spare.id);

    const names = [...runtime.getScene(scene.id)!.cameras.values()].map((c) => c.name).sort();
    expect(names).toEqual(['Cam Active', 'Cam Third']);
    expect(runtime.getScene(scene.id)!.cameras.get(third.id)).toBe(third);
  });

  it('removal is invisible to the scene\'s bodies: an entity stays exactly where it was', () => {
    // The camera set and the entity set are one scene record; a removal that reached past its own Map would
    // be a second verb in disguise.
    const body = runtime.createEntity(scene.id, 'Cube', 'mesh');

    runtime.removeCamera(scene.id, spare.id);

    expect(runtime.getScene(scene.id)!.entities.get(body.id)).toBe(body);
  });

  it('the deletion is real, not a flag: defineCinematic refuses a shot naming the removed camera', () => {
    runtime.removeCamera(scene.id, spare.id);

    expect(() => runtime.defineCinematic(scene.id, {
      id: 'late-seq',
      name: 'Late Sequence',
      shots: [shot('s1', spare.id, 0, 1)],
    })).toThrow(`shot s1 names camera ${spare.id}, which is not in scene ${scene.id}`);
  });

  it('removing down to the last camera leaves exactly one ACTIVE camera, which is the invariant kept', () => {
    const third = runtime.createCamera(scene.id, 'Cam Third');

    runtime.removeCamera(scene.id, spare.id);
    runtime.removeCamera(scene.id, third.id);

    expect(runtime.getScene(scene.id)!.cameras.size).toBe(1);
    expect(cameraAccount(runtime, scene.id)).toBe('Cam Active:true');
    expect(removed.length).toBe(2);
  });

  it('the picture keeps drawing after a removal: three frames before and three after all render', () => {
    // The consequence that made v225's overwrite a defect rather than a bookkeeping note, re-measured through
    // the opposite door: taking a camera out must not be a way to stop the render loop. `start()` renders once
    // immediately and each `step()` renders once, so the window's draw count is its frame count.
    runtime.start();
    for (let i = 0; i < 3; i += 1) scheduler.step();
    const before = backend.stats.calls;
    expect(before).toBe(4);

    runtime.removeCamera(scene.id, spare.id);
    for (let i = 0; i < 3; i += 1) scheduler.step();

    expect(backend.stats.calls - before).toBe(3);
  });

  it('a throwing listener cannot un-apply the removal: the delete happens, then the emit catches', () => {
    const seen: string[] = [];
    runtime.addEventListener('cameraRemoved', () => {
      seen.push(cameraAccount(runtime, scene.id));
      throw new Error('a listener that fails');
    });

    expect(() => runtime.removeCamera(scene.id, spare.id)).not.toThrow();
    expect(seen).toEqual(['Cam Active:true']);
    expect(cameraAccount(runtime, scene.id)).toBe('Cam Active:true');
  });
});

describe('M5 v239 - the unknown-subject refusals answer false and move nothing', () => {
  let runtime: ThreeRuntime;
  let scene: ReturnType<ThreeRuntime['createScene']>;
  let active: ReturnType<ThreeRuntime['createCamera']>;
  let spare: ReturnType<ThreeRuntime['createCamera']>;
  let removed: RemovedData[];

  beforeEach(() => {
    runtime = headlessRuntime().runtime;
    scene = runtime.createScene('Refusal Scene');
    active = runtime.createCamera(scene.id, 'Cam Active');
    spare = runtime.createCamera(scene.id, 'Cam Spare');
    removed = [];
    runtime.addEventListener('cameraRemoved', (data?: unknown) => removed.push(data as RemovedData));
  });

  it('a scene the graph does not hold answers false and fires no name', () => {
    expect(runtime.removeCamera(sceneId('scene-that-does-not-exist'), spare.id)).toBe(false);
    expect(cameraAccount(runtime, scene.id)).toBe('Cam Active:true,Cam Spare:false');
    expect(removed).toEqual([]);
  });

  it('a camera this scene does not hold answers false, keeps the roster and fires no name', () => {
    const before = cameraAccount(runtime, scene.id);

    expect(runtime.removeCamera(scene.id, cameraId('camera-that-does-not-exist'))).toBe(false);

    expect(runtime.getScene(scene.id)!.cameras.size).toBe(2);
    expect(cameraAccount(runtime, scene.id)).toBe(before);
    expect(removed).toEqual([]);
  });

  it('the two refusals are the SAME no-op: a bad scene and a bad camera both answer false and change nothing', () => {
    // `false` is one answer, so it has to mean one state change - none. v224 established this shape for
    // `setActiveCamera`, whose old order cleared every flag before it refused.
    const accountBefore = cameraAccount(runtime, scene.id);
    const sizeBefore = runtime.getScene(scene.id)!.cameras.size;

    const badScene = runtime.removeCamera(sceneId('no-such-scene'), spare.id);
    const badCamera = runtime.removeCamera(scene.id, cameraId('no-such-camera'));

    expect([badScene, badCamera]).toEqual([false, false]);
    expect(runtime.getScene(scene.id)!.cameras.size).toBe(sizeBefore);
    expect(cameraAccount(runtime, scene.id)).toBe(accountBefore);
    expect(removed).toEqual([]);
  });

  it("a camera that belongs to ANOTHER scene is refused here, and that scene keeps every camera it had", () => {
    // The id is a key in ONE scene's Map (v225's cross-scene case established that the same id in two scenes
    // is two cameras), so naming it in the wrong scene is an unknown subject, not a remote delete.
    const other = runtime.createScene('Other Scene');
    const there = runtime.createCamera(other.id, 'There Cam');
    const thatAccount = cameraAccount(runtime, other.id);

    expect(runtime.removeCamera(scene.id, there.id)).toBe(false);

    expect(cameraAccount(runtime, other.id)).toBe(thatAccount);
    expect(cameraAccount(runtime, scene.id)).toBe('Cam Active:true,Cam Spare:false');
    expect(removed).toEqual([]);
  });

  it('the refusal does not wedge the scene: a removable camera asked for afterwards still goes', () => {
    runtime.removeCamera(scene.id, cameraId('no-such-camera'));

    expect(runtime.removeCamera(scene.id, spare.id)).toBe(true);
    expect(cameraAccount(runtime, scene.id)).toBe('Cam Active:true');
    expect(removed.length).toBe(1);
  });

  it('a removed camera cannot be removed twice: the second answer is false and no second name fires', () => {
    expect(runtime.removeCamera(scene.id, spare.id)).toBe(true);

    expect(runtime.removeCamera(scene.id, spare.id)).toBe(false);
    expect(removed.length).toBe(1);
    expect(cameraAccount(runtime, scene.id)).toBe('Cam Active:true');
  });
});

describe('M5 v239 - the ACTIVE camera is refused, and the sentence names the call to make first', () => {
  let runtime: ThreeRuntime;
  let scene: ReturnType<ThreeRuntime['createScene']>;
  let active: ReturnType<ThreeRuntime['createCamera']>;
  let spare: ReturnType<ThreeRuntime['createCamera']>;
  let removed: RemovedData[];

  beforeEach(() => {
    runtime = headlessRuntime().runtime;
    scene = runtime.createScene('Active Seat Scene');
    active = runtime.createCamera(scene.id, 'Cam Active');
    spare = runtime.createCamera(scene.id, 'Cam Spare');
    removed = [];
    runtime.addEventListener('cameraRemoved', (data?: unknown) => removed.push(data as RemovedData));
  });

  it('naming the active camera throws the sentence that tells the caller what to do', () => {
    expect(() => runtime.removeCamera(scene.id, active.id))
      .toThrow(`removeCamera: camera ${active.id} is the ACTIVE camera of scene ${scene.id}; call setActiveCamera first`);
    expect(() => runtime.removeCamera(scene.id, active.id))
      .toThrow('this method will not leave a scene holding cameras and nothing to draw from');
  });

  it('the refusal deletes nothing and moves no flag: same roster, same objects, same active seat', () => {
    const before = cameraAccount(runtime, scene.id);
    const sizeBefore = runtime.getScene(scene.id)!.cameras.size;
    const kept = runtime.getScene(scene.id)!.cameras.get(active.id);

    expect(() => runtime.removeCamera(scene.id, active.id)).toThrow();

    expect(runtime.getScene(scene.id)!.cameras.size).toBe(sizeBefore);
    expect(cameraAccount(runtime, scene.id)).toBe(before);
    expect(runtime.getScene(scene.id)!.cameras.get(active.id)).toBe(kept);
    expect(active.active).toBe(true);
    expect(spare.active).toBe(false);
  });

  it('the refusal fires no name on the bus: neither cameraRemoved nor activeCameraChanged', () => {
    const heard: string[] = [];
    runtime.addEventListener('cameraRemoved', () => heard.push('removed'));
    runtime.addEventListener('activeCameraChanged', () => heard.push('changed'));

    expect(() => runtime.removeCamera(scene.id, active.id)).toThrow();

    expect(heard).toEqual([]);
  });

  it('switching first makes the SAME camera removable: the refusal is an ordering rule, not a prohibition', () => {
    runtime.setActiveCamera(scene.id, spare.id);

    expect(runtime.removeCamera(scene.id, active.id)).toBe(true);
    expect(cameraAccount(runtime, scene.id)).toBe('Cam Spare:true');
    expect(removed).toEqual([{ sceneId: scene.id, cameraId: active.id }]);
  });

  it('a one-camera scene cannot be emptied by this verb, and the bound is the scene\'s own', () => {
    // The honest ceiling: `setActiveCamera` needs a target the scene holds, and a sole camera is active by
    // `createCamera`'s own rule, so the last camera of a scene is immovable here. A scene is taken down by
    // `dispose()` (and still has no `removeScene` verb), not by emptying it one camera at a time.
    const solo = runtime.createScene('Solo Scene');
    const only = runtime.createCamera(solo.id, 'Only Cam');

    expect(only.active).toBe(true);
    expect(() => runtime.removeCamera(solo.id, only.id)).toThrow('is the ACTIVE camera of scene');
    expect(cameraAccount(runtime, solo.id)).toBe('Only Cam:true');
  });
});

describe('M5 v239 - a camera a registered sequence names cannot go', () => {
  let runtime: ThreeRuntime;
  let scene: ReturnType<ThreeRuntime['createScene']>;
  let camA: ReturnType<ThreeRuntime['createCamera']>;
  let camB: ReturnType<ThreeRuntime['createCamera']>;
  let camC: ReturnType<ThreeRuntime['createCamera']>;
  let removed: RemovedData[];

  beforeEach(() => {
    runtime = headlessRuntime().runtime;
    scene = runtime.createScene('Cinematic Scene');
    camA = runtime.createCamera(scene.id, 'Cam A');
    camB = runtime.createCamera(scene.id, 'Cam B');
    camC = runtime.createCamera(scene.id, 'Cam C');
    removed = [];
    runtime.addEventListener('cameraRemoved', (data?: unknown) => removed.push(data as RemovedData));
  });

  it('a registered sequence names it, so the refusal prints the sequence and the shot that name it', () => {
    runtime.defineCinematic(scene.id, {
      id: 'seq',
      name: 'Seq',
      shots: [shot('s1', camA.id, 0, 1), shot('s2', camB.id, 1, 2)],
    });

    expect(() => runtime.removeCamera(scene.id, camB.id))
      .toThrow(`removeCamera: camera ${camB.id} is named by 1 shot(s) of registered sequence(s) "seq" shot s2; call removeCinematic first`);
  });

  it('the refusal counts every shot that names it, including two shots of one sequence', () => {
    runtime.defineCinematic(scene.id, {
      id: 'back-and-forth',
      name: 'Back And Forth',
      shots: [shot('s1', camB.id, 0, 1), shot('s2', camA.id, 1, 2), shot('s3', camB.id, 2, 3)],
    });

    expect(() => runtime.removeCamera(scene.id, camB.id))
      .toThrow('is named by 2 shot(s) of registered sequence(s) "back-and-forth" shot s1, "back-and-forth" shot s3');
  });

  it('the refusal removes nothing: camera in the scene, sequence registered, no name on the bus', () => {
    runtime.defineCinematic(scene.id, { id: 'seq', name: 'Seq', shots: [shot('s1', camB.id, 0, 1)] });
    const accountBefore = cameraAccount(runtime, scene.id);
    const heard: string[] = [];
    runtime.addEventListener('cinematicRemoved', () => heard.push('cinematicRemoved'));

    expect(() => runtime.removeCamera(scene.id, camB.id)).toThrow();

    expect(cameraAccount(runtime, scene.id)).toBe(accountBefore);
    expect(runtime.cinematicSnapshot().sequences.map(([id]) => id)).toEqual(['seq']);
    expect(heard).toEqual([]);
    expect(removed).toEqual([]);
  });

  it('a scene\'s sequence does not block a camera it does not name: the refusal is per camera, not per scene', () => {
    runtime.defineCinematic(scene.id, { id: 'seq', name: 'Seq', shots: [shot('s1', camB.id, 0, 1)] });

    expect(runtime.removeCamera(scene.id, camC.id)).toBe(true);
    expect(cameraAccount(runtime, scene.id)).toBe('Cam A:true,Cam B:false');
    expect(removed).toEqual([{ sceneId: scene.id, cameraId: camC.id }]);
  });

  it('removeCinematic first, and the identical removal then succeeds', () => {
    // The documented path, the same shape as the ACTIVE refusal: the verb says which call unlocks it, and
    // this case proves the sentence is not decoration.
    runtime.defineCinematic(scene.id, { id: 'seq', name: 'Seq', shots: [shot('s1', camB.id, 0, 1)] });

    expect(() => runtime.removeCamera(scene.id, camB.id)).toThrow('call removeCinematic first');
    expect(runtime.removeCinematic('seq')).toBe(true);
    expect(runtime.removeCamera(scene.id, camB.id)).toBe(true);

    expect(cameraAccount(runtime, scene.id)).toBe('Cam A:true,Cam C:false');
    expect(removed).toEqual([{ sceneId: scene.id, cameraId: camB.id }]);
  });

  it('a PLAYING sequence refuses the same way and is not interrupted by the refusal', () => {
    // The refused camera is the one the sequence names but is NOT currently aiming: at playhead 0.1 the player
    // holds shot s1's camera, so asking for camC reaches the shot branch instead of the active-seat one. Both
    // branches refuse a camera the timeline uses; they differ only in which call unlocks the removal.
    runtime.defineCinematic(scene.id, {
      id: 'cut',
      name: 'Cut',
      shots: [shot('s1', camB.id, 0, 1), shot('s2', camC.id, 1, 2)],
    });
    runtime.playCinematic('cut');
    runtime.simulateFrame(0.1);

    expect(() => runtime.removeCamera(scene.id, camC.id))
      .toThrow(`camera ${camC.id} is named by 1 shot(s) of registered sequence(s) "cut" shot s2`);

    const snapshot = runtime.cinematicSnapshot();
    expect(snapshot.activeSequence).toBe('cut');
    expect(snapshot.sequences.find(([id]) => id)?.[1].playing).toBe(true);
    expect(cameraAccount(runtime, scene.id)).toBe('Cam A:false,Cam B:true,Cam C:false');
    expect(removed).toEqual([]);
  });

  it('a sequence in ANOTHER scene naming the same id does not block this scene\'s camera', () => {
    // The scan is scoped by `entry.sceneId` because a shot addresses ONE scene's camera set (v118's rule, and
    // v225's case that an id held by two scenes is two cameras). Without the scope a second scene's sequence
    // would refuse a removal it cannot reach, which is an over-refusal the player has no use for.
    const here = runtime.createCamera(scene.id, 'Shared Here', 'perspective', {}, 'shared-id');
    const other = runtime.createScene('Other Scene');
    const there = runtime.createCamera(other.id, 'Shared There', 'perspective', {}, 'shared-id');
    runtime.defineCinematic(other.id, { id: 'other-seq', name: 'Other Seq', shots: [shot('s1', there.id, 0, 1)] });

    expect(runtime.removeCamera(scene.id, here.id)).toBe(true);

    expect(runtime.getScene(scene.id)!.cameras.has(here.id)).toBe(false);
    expect(runtime.getScene(other.id)!.cameras.get(there.id)).toBe(there);
    expect(runtime.cinematicSnapshot().sequences.map(([id]) => id)).toEqual(['other-seq']);
  });

  it('the reverse control, first face: deleting out of band crashes the next frame of a MOVING shot', () => {
    // Not the verb - `removeCamera` cannot produce this state. This is the bypass v239 closes, written so the
    // claim above is a measurement and not a reading of the code: `updateCinematics` does
    // `scene.cameras.get(shot.cameraId)!` (threeRuntime.ts:2952) and then writes through
    // `camera.threeCamera.position` (2955), so the frame after an outside delete throws `TypeError` on the
    // shot the sequence still names.
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 1, -5),
      new THREE.Vector3(1, 1.5, -4),
      new THREE.Vector3(2, 1, -3),
    ]);
    runtime.defineCinematic(scene.id, {
      id: 'move',
      name: 'Move',
      shots: [{ ...shot('s1', camB.id, 0, 1), cameraPath: curve }],
    });
    runtime.playCinematic('move');
    expect(() => runtime.simulateFrame(0.1)).not.toThrow();

    runtime.getScene(scene.id)!.cameras.delete(camB.id);

    expect(() => runtime.simulateFrame(0.1)).toThrow(TypeError);
  });

  it('the reverse control, second face: a plain cut does not crash - it aims nothing, moves on, and says nothing', () => {
    // The half that makes the crash only half the reason. `setActiveCamera` answers the PLAYER's own call with
    // `false` (v224's order), so the active seat stays where it was while `currentShot` advances to a shot
    // naming a camera the scene no longer holds. The picture keeps drawing, the sequence keeps counting, and
    // no listener can see the two have come apart - which is why this verb refuses rather than delete, and
    // why the refusal is the same for both shot shapes.
    runtime.defineCinematic(scene.id, {
      id: 'seq',
      name: 'Seq',
      shots: [shot('s1', camA.id, 0, 1), shot('s2', camB.id, 1, 2)],
    });
    runtime.playCinematic('seq');
    runtime.simulateFrame(0.1);

    runtime.getScene(scene.id)!.cameras.delete(camB.id);
    expect(() => runtime.simulateFrame(1.0)).not.toThrow();

    const sequence = runtime.cinematicSnapshot().sequences.find(([id]) => id === 'seq')![1];
    expect(sequence.currentShot).toBe(1);
    expect(sequence.shots[1]!.cameraId).toBe(camB.id);
    expect(runtime.getScene(scene.id)!.cameras.has(camB.id)).toBe(false);
    expect(cameraAccount(runtime, scene.id)).toBe('Cam A:true,Cam C:false');
  });
});
