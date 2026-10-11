// M5 v228 — `createAnimation` was the ONE create* verb that did not refuse a scene the graph does not hold.
// `createEntity` and `createCamera` both throw `Scene X not found`; this one looked the scene up AFTER
// building the animation, guarded the registration with `if (scene)`, emitted `animationCreated` anyway, and
// returned a live `ThreeAnimation` that no scene's map holds — so `playAnimation`, which searches the scenes'
// maps, could never find it. Measured on the shipped bytes before this file existed, by a probe that called it
// twice on one bogus scene id:
//
//     returned: "anim-…/Ghost/clips=1"          — a live animation object, handed back as success
//     scenesHoldingTheGhost: 0                  — registered NOWHERE
//     realSceneAnimationCount: 0                — and not in the real scene either
//     scenesInGraph: 1                          — the graph did not grow
//     animationCreatedFired: 2                  — news about a record no scene holds
//     reachableById: "no"                       — `playAnimation` could never find it again
//     PROBE SIBLINGS { cameraOutcome: "Scene scene-that-does-not-exist not found",
//                      entityOutcome: "Scene scene-that-does-not-exist not found" }
//
// So the caller was handed a success for work that did not happen, announced on the bus, with no way to reach
// the object again — the same family as v225's taken id and v227's absolute scene id.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  ThreeRuntime,
  createHeadlessBackend,
  manualFrameScheduler,
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

describe('M5 v228 — createAnimation refuses a scene the graph does not hold', () => {
  let runtime: ThreeRuntime;
  let scene: ReturnType<ThreeRuntime['createScene']>;
  let entity: ReturnType<ThreeRuntime['createEntity']>;

  beforeEach(() => {
    const h = headlessRuntime();
    runtime = h.runtime;
    scene = runtime.createScene('Anim Scene');
    entity = runtime.createEntity(scene.id, 'Cube', 'mesh');
  });

  /** One clip with a real channel, so the mixer has an action to build. */
  const clip = () => {
    const clip = new THREE.AnimationClip('clip', 1, [
      new THREE.VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 1, 1, 1]),
    ]);
    return clip;
  };

  it('a scene the graph does not hold is refused by name, like every other create* verb', () => {
    const bogus = sceneId('scene-that-does-not-exist');

    expect(() => runtime.createAnimation(bogus, entity, [clip()], 'Ghost'))
      .toThrow(`Scene ${bogus} not found`);
  });

  it('the refusal announces nothing: no animationCreated for work that did not happen', () => {
    // Before the fix the bus carried `animationCreated` for an animation registered nowhere — news about a
    // record no scene holds.
    const heard: unknown[] = [];
    runtime.addEventListener('animationCreated', (data?: unknown) => heard.push(data));

    expect(() => runtime.createAnimation(sceneId('bogus'), entity, [clip()], 'Ghost')).toThrow();

    expect(heard).toEqual([]);
  });

  it('the refusal leaves NO half-built animation behind: no mixer, no registry entry', () => {
    const bogus = sceneId('bogus');
    let threw: string | null = null;
    try {
      runtime.createAnimation(bogus, entity, [clip()], 'Ghost');
    } catch (error) {
      threw = (error as Error).message;
    }

    expect(threw).toContain('not found');
    // The scene the entity really lives in is untouched: no animation was filed under it, and the source
    // scene holds none either.
    expect(runtime.getScene(scene.id)!.animations.size).toBe(0);
    expect(runtime.getSceneGraph().scenes.get(bogus)).toBeUndefined();
  });

  it('the guard is the FIRST thing: nothing is built before the scene is known', () => {
    // The pre-fix order built a `THREE.AnimationMixer` and an action before discovering the scene was
    // missing — work whose only observable effect was the emit. The refusal now precedes all of it, and the
    // entity's own object is untouched (a mixer would have bound to its `threeObject`).
    const object = entity.threeObject;

    expect(() => runtime.createAnimation(sceneId('bogus'), entity, [clip()], 'Ghost')).toThrow();

    expect(entity.threeObject).toBe(object);
    expect(entity.threeObject.animations).toHaveLength(0);
  });

  it('a real scene still works, and the animation is reachable by its id', () => {
    const animation = runtime.createAnimation(scene.id, entity, [clip()], 'Real');

    expect(runtime.getScene(scene.id)!.animations.get(animation.id)).toBe(animation);
    expect(runtime.getScene(scene.id)!.animations.size).toBe(1);
  });

  it('the two create* siblings agree: createCamera and createEntity refuse the same bogus scene', () => {
    const bogus = sceneId('bogus');

    expect(() => runtime.createCamera(bogus, 'Cam')).toThrow(`Scene ${bogus} not found`);
    expect(() => runtime.createEntity(bogus, 'Body', 'mesh')).toThrow(`Scene ${bogus} not found`);
  });

  it('the scene is named before the clips: a bogus scene with no clips reports the SCENE', () => {
    // Two refusals in one call, and the order says which one the caller hears. The scene is the wider
    // claim — everything after it is about a scene that does not exist — so it is asked first.
    expect(() => runtime.createAnimation(sceneId('bogus'), entity, [], 'No Clips'))
      .toThrow(/not found/);
  });

  it('the announcement arrives AFTER the registration: a listener reading the scene\u2019s map sees the animation', () => {
    // The rule v218 established for `setPixelRatio` and v211 for the entity verbs, applied here: the emit is
    // not first. A listener that reads `scene.animations` must find the record the news is about.
    const seen: boolean[] = [];
    runtime.addEventListener('animationCreated', () => {
      seen.push(runtime.getScene(scene.id)!.animations.size === 1);
    });

    runtime.createAnimation(scene.id, entity, [clip()], 'Announced');

    expect(seen).toEqual([true]);
  });
});
