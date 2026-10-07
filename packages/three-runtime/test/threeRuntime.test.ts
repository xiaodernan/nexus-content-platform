import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { ThreeRuntime, createThreeRuntime, DEFAULT_THREE_CONFIG, sceneId, entityId, cameraId } from '../src/index.js';
import type { ThreeRuntimeConfig, ThreeScene, ThreeEntity, ThreeCamera, ThreeAnimation, EntityId, SceneId, CameraId, AnimationId } from '../src/types.js';
import { createHeadlessBackend, webglAvailable, manualFrameScheduler, type HeadlessBackend } from '../src/renderBackend.js';

const mockCanvas = {
  width: 800,
  height: 600,
  style: {},
  getContext: vi.fn(() => ({
    canvas: mockCanvas,
    drawingBufferWidth: 800,
    drawingBufferHeight: 600,
  })),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  clientWidth: 800,
  clientHeight: 600,
} as unknown as HTMLCanvasElement;

/**
 * M5 v108: these tests drive the runtime through the HEADLESS backend, because a real
 * `WebGLRenderer` needs a GL context and this suite runs in Node. Before the seam existed, 26 of
 * these 27 cases failed at `initialize()` and only the constructor passed — the whole scene graph,
 * camera, animation, event and lifecycle surface was unreachable in CI.
 */
function headlessRuntime(config: Partial<ThreeRuntimeConfig> = {}) {
  let backend: HeadlessBackend | null = null;
  const runtime = createThreeRuntime(config, {
    backend: (canvas, cfg) => {
      void canvas;
      backend = createHeadlessBackend(cfg);
      return backend;
    },
  });
  return { runtime, backend: () => backend as HeadlessBackend };
}

describe('ThreeRuntime', () => {
  let runtime: ThreeRuntime;

  beforeEach(() => {
    runtime = headlessRuntime().runtime;
  });

  afterEach(() => {
    runtime.dispose();
  });

  it('creates runtime with default config', () => {
    expect(runtime).toBeInstanceOf(ThreeRuntime);
    expect(runtime.getRenderer()).toBeNull();
    expect(runtime.getBackend()).toBeNull();
  });

  it('initializes through the injected backend and applies the config to it', () => {
    const h = headlessRuntime();
    h.runtime.initialize(mockCanvas);
    const backend = h.backend();

    expect(h.runtime.getBackend()).toBe(backend);
    expect(backend.kind).toBe('headless');
    // The settings the runtime used to assign to a WebGLRenderer are the backend's now, so they are
    // still asserted — against a backend that can be observed without a GPU.
    expect(backend.state.shadowMapEnabled).toBe(true);
    expect(backend.state.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(backend.state.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(backend.state.sortObjects).toBe(true);
    // A headless backend owns no GL object, and says so rather than handing back a fake one.
    expect(h.runtime.getRenderer()).toBeNull();
    h.runtime.dispose();
  });

  it('reports whether this host can supply a real GL context instead of throwing', () => {
    // The seam's production default is unchanged; the point is that the CHOICE is observable. Node
    // has no `document`, so `webglAvailable()` is false here — which is exactly why this suite
    // injects a backend rather than hoping the default constructor works.
    expect(webglAvailable()).toBe(false);
  });

  it('the loop runs without requestAnimationFrame, and a manual scheduler makes it steppable', () => {
    // Before the scheduler seam, `start()` threw `ReferenceError: requestAnimationFrame is not
    // defined` in Node. Now the default falls back to a timer, and a test can take exact control.
    const scheduler = manualFrameScheduler();
    let backend: HeadlessBackend | null = null;
    const runtime2 = createThreeRuntime(
      {},
      {
        backend: (_canvas, cfg) => (backend = createHeadlessBackend(cfg)),
        scheduler,
      },
    );
    runtime2.initialize(mockCanvas);
    const scene = runtime2.createScene('Loop');
    runtime2.createCamera(scene.id, 'Main');

    const frames: number[] = [];
    runtime2.addEventListener('frame', () => frames.push(1));

    runtime2.start();
    // `start()` draws ONE frame synchronously and then schedules the next — pre-existing behaviour,
    // preserved by the seam. The point is that everything AFTER it is under the caller's control.
    expect(frames).toHaveLength(1);
    expect(backend!.frames).toHaveLength(1);
    expect(scheduler.pending()).toBe(1);

    scheduler.step();
    expect(frames).toHaveLength(2);
    expect(backend!.frames).toHaveLength(2); // the backend really received the second draw
    expect(backend!.frames[0].camera).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(backend!.frames[0].objects).toBeGreaterThan(0); // the scene reached the backend

    runtime2.stop();
    expect(scheduler.pending()).toBe(0); // stop() cancelled the outstanding frame
    scheduler.step();
    expect(frames).toHaveLength(2); // and nothing runs after stop
    runtime2.dispose();
  });

  it('creates scenes', () => {
    runtime.initialize(mockCanvas);
    const scene = runtime.createScene('Test Scene');
    expect(scene.name).toBe('Test Scene');
    expect(scene.id).toBeDefined();
    expect(scene.threeScene).toBeInstanceOf(THREE.Scene);
  });

  it('sets active scene', () => {
    runtime.initialize(mockCanvas);
    const scene1 = runtime.createScene('Scene 1');
    const scene2 = runtime.createScene('Scene 2');

    expect(runtime.getActiveScene()?.id).toBe(scene1.id);

    const switched = runtime.setActiveScene(scene2.id);
    expect(switched).toBe(true);
    expect(runtime.getActiveScene()?.id).toBe(scene2.id);
  });

  it('creates entities', () => {
    runtime.initialize(mockCanvas);
    const scene = runtime.createScene('Test Scene');

    const entity = runtime.createEntity(scene.id, 'Cube', 'mesh');
    expect(entity.name).toBe('Cube');
    expect(entity.type).toBe('mesh');
    expect(entity.threeObject).toBeInstanceOf(THREE.Mesh);
    expect(scene.entities.size).toBe(1);
  });

  it('creates entities with custom geometry and material', () => {
    runtime.initialize(mockCanvas);
    const scene = runtime.createScene('Test Scene');

    const geometry = new THREE.SphereGeometry(1, 32, 32);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const entity = runtime.createEntity(scene.id, 'Sphere', 'mesh', geometry, material);

    expect(entity.threeObject).toBeInstanceOf(THREE.Mesh);
    const mesh = entity.threeObject as THREE.Mesh;
    expect(mesh.geometry).toBe(geometry);
    expect(mesh.material).toBe(material);
  });

  it('creates different entity types', () => {
    runtime.initialize(mockCanvas);
    const scene = runtime.createScene('Test Scene');

    const group = runtime.createEntity(scene.id, 'Group', 'group');
    expect(group.threeObject).toBeInstanceOf(THREE.Group);

    const sprite = runtime.createEntity(scene.id, 'Sprite', 'sprite');
    expect(sprite.threeObject).toBeInstanceOf(THREE.Sprite);

    const points = runtime.createEntity(scene.id, 'Points', 'points');
    expect(points.threeObject).toBeInstanceOf(THREE.Points);
  });

  it('positions, rotates, and scales entities', () => {
    runtime.initialize(mockCanvas);
    const scene = runtime.createScene('Test Scene');

    const position = new THREE.Vector3(10, 5, -3);
    const rotation = new THREE.Euler(Math.PI / 4, 0, 0);
    const scale = new THREE.Vector3(2, 2, 2);

    const entity = runtime.createEntity(scene.id, 'Transformed', 'mesh', undefined, undefined, position, rotation, scale);

    expect(entity.threeObject.position).toEqual(position);
    expect(entity.threeObject.scale).toEqual(scale);
    // Compared by COMPONENT, not by object: three attaches `_onChangeCallback` to a live Euler (it
    // keeps the matrix in sync), so a deep-equality against a freshly constructed one fails on an
    // implementation detail rather than on the rotation. The numbers are what the test is about.
    expect(entity.threeObject.rotation.x).toBeCloseTo(Math.PI / 4, 12);
    expect(entity.threeObject.rotation.y).toBe(0);
    expect(entity.threeObject.rotation.z).toBe(0);
  });

  it('removes entities', () => {
    runtime.initialize(mockCanvas);
    const scene = runtime.createScene('Test Scene');

    const entity = runtime.createEntity(scene.id, 'ToRemove', 'mesh');
    expect(scene.entities.size).toBe(1);

    const removed = runtime.removeEntity(scene.id, entity.id);
    expect(removed).toBe(true);
    expect(scene.entities.size).toBe(0);

    const notRemoved = runtime.removeEntity(scene.id, entity.id);
    expect(notRemoved).toBe(false);
  });

  it('creates cameras', () => {
    runtime.initialize(mockCanvas);
    const scene = runtime.createScene('Test Scene');

    const camera = runtime.createCamera(scene.id, 'Main Camera', 'perspective', { fov: 90 });
    expect(camera.name).toBe('Main Camera');
    expect(camera.type).toBe('perspective');
    expect(camera.threeCamera).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(camera.active).toBe(true); // First camera is active
  });

  it('creates orthographic cameras', () => {
    runtime.initialize(mockCanvas);
    const scene = runtime.createScene('Test Scene');

    const camera = runtime.createCamera(scene.id, 'Ortho', 'orthographic', { left: -10, right: 10, top: 10, bottom: -10 });
    expect(camera.type).toBe('orthographic');
    expect(camera.threeCamera).toBeInstanceOf(THREE.OrthographicCamera);
  });

  it('switches active camera', () => {
    runtime.initialize(mockCanvas);
    const scene = runtime.createScene('Test Scene');

    const cam1 = runtime.createCamera(scene.id, 'Cam 1');
    const cam2 = runtime.createCamera(scene.id, 'Cam 2');

    expect(cam1.active).toBe(true);
    expect(cam2.active).toBe(false);

    const switched = runtime.setActiveCamera(scene.id, cam2.id);
    expect(switched).toBe(true);
    expect(cam1.active).toBe(false);
    expect(cam2.active).toBe(true);
  });

  it('creates animations', () => {
    runtime.initialize(mockCanvas);
    const scene = runtime.createScene('Test Scene');

    const entity = runtime.createEntity(scene.id, 'Animated', 'mesh');
    const clip = new THREE.AnimationClip('test', 1, [new THREE.KeyframeTrack('.position', [0, 1], [0, 0, 0, 10, 0, 0])]);

    const animation = runtime.createAnimation(scene.id, entity, [clip], 'Move');
    expect(animation.name).toBe('Move');
    expect(animation.clips.length).toBe(1);
    expect(animation.threeAnimation).toBeInstanceOf(THREE.AnimationAction);
  });

  it('plays and stops animations', () => {
    runtime.initialize(mockCanvas);
    const scene = runtime.createScene('Test Scene');

    const entity = runtime.createEntity(scene.id, 'Animated', 'mesh');
    const clip = new THREE.AnimationClip('test', 1, [new THREE.KeyframeTrack('.position', [0, 1], [0, 0, 0, 10, 0, 0])]);
    const animation = runtime.createAnimation(scene.id, entity, [clip], 'Move');

    runtime.playAnimation(animation.id);
    expect(animation.playing).toBe(true);

    runtime.stopAnimation(animation.id);
    expect(animation.playing).toBe(false);
  });

  it('starts and stops render loop', () => {
    const h = headlessRuntime();
    h.runtime.initialize(mockCanvas);

    h.runtime.start();
    expect(h.runtime.getBackend()).toBeDefined();

    h.runtime.stop();
    expect(h.runtime.getBackend()).toBeDefined(); // the backend still exists after stop
    h.runtime.dispose();
  });

  it('resizes the backend', () => {
    const h = headlessRuntime();
    h.runtime.initialize(mockCanvas);
    h.runtime.resize(1024, 768);

    expect(h.backend().state.width).toBe(1024);
    expect(h.backend().state.height).toBe(768);
    h.runtime.dispose();
  });

  it('sets pixel ratio on the backend', () => {
    const h = headlessRuntime();
    h.runtime.initialize(mockCanvas);
    h.runtime.setPixelRatio(2);

    expect(h.backend().state.pixelRatio).toBe(2);
    h.runtime.dispose();
  });

  it('emits events', () => {
    runtime.initialize(mockCanvas);

    const sceneCreated = vi.fn();
    runtime.addEventListener('sceneCreated', sceneCreated);

    const scene = runtime.createScene('Event Test');
    expect(sceneCreated).toHaveBeenCalledWith(expect.objectContaining({ scene: expect.any(Object) }));
  });

  it('removes event listeners', () => {
    runtime.initialize(mockCanvas);

    const listener = vi.fn();
    runtime.addEventListener('sceneCreated', listener);
    runtime.removeEventListener('sceneCreated', listener);

    runtime.createScene('Test');
    expect(listener).not.toHaveBeenCalled();
  });

  it('disposes properly', () => {
    runtime.initialize(mockCanvas);
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Cube', 'mesh');

    runtime.dispose();

    expect(runtime.getRenderer()).toBeNull();
    expect(runtime.getBackend()).toBeNull();
    expect(runtime.getSceneGraph().scenes.size).toBe(0);
  });
});

describe('Default Config', () => {
  it('has correct default values', () => {
    expect(DEFAULT_THREE_CONFIG.renderer.antialias).toBe(true);
    expect(DEFAULT_THREE_CONFIG.shadowMap.enabled).toBe(true);
    expect(DEFAULT_THREE_CONFIG.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(DEFAULT_THREE_CONFIG.colorSpace).toBe(THREE.SRGBColorSpace);
    // `physicallyCorrectLights` used to be asserted here. three r155 REMOVED that renderer property
    // (lights are always physically correct now), so the option changed nothing and was deleted
    // rather than kept as a no-op switch — a config key that does nothing is a claim, not a feature.
    expect('physicallyCorrectLights' in DEFAULT_THREE_CONFIG).toBe(false);
  });
});

describe('Scene Management', () => {
  let runtime: ThreeRuntime;

  beforeEach(() => {
    runtime = headlessRuntime().runtime;
    runtime.initialize(mockCanvas);
  });

  afterEach(() => {
    runtime.dispose();
  });

  it('returns undefined for non-existent scene', () => {
    expect(runtime.getScene(sceneId('non-existent'))).toBeUndefined();
  });

  it('returns undefined for non-existent entity', () => {
    const scene = runtime.createScene('Test');
    expect(runtime.getEntity(scene.id, entityId('non-existent'))).toBeUndefined();
  });

  it('returns undefined for non-existent camera', () => {
    const scene = runtime.createScene('Test');
    expect(runtime.getScene(scene.id)?.cameras.get(cameraId('non-existent'))).toBeUndefined();
  });

  it('handles removing non-existent entity', () => {
    const scene = runtime.createScene('Test');
    const removed = runtime.removeEntity(scene.id, entityId('non-existent'));
    expect(removed).toBe(false);
  });

  it('adds and removes components', () => {
    const scene = runtime.createScene('Test');
    const entity = runtime.createEntity(scene.id, 'Entity', 'mesh');

    const component = { type: 'test', data: { value: 42 }, enabled: true };
    runtime.addComponent(entity, component);

    const retrieved = runtime.getComponent(entity, 'test');
    expect(retrieved).toEqual(component);

    runtime.removeComponent(entity, 'test');
    expect(runtime.getComponent(entity, 'test')).toBeUndefined();
  });
});

describe('Lighting', () => {
  let runtime: ThreeRuntime;

  beforeEach(() => {
    runtime = headlessRuntime().runtime;
    runtime.initialize(mockCanvas);
  });

  afterEach(() => {
    runtime.dispose();
  });

  it('creates default lighting', () => {
    const scene = runtime.createScene('Test');
    expect(scene.lighting.lights.length).toBe(2);
    expect(scene.lighting.lights[0].type).toBe('ambient');
    expect(scene.lighting.lights[1].type).toBe('directional');
    expect(scene.lighting.shadows).toBe(true);
  });

  // M5 v142: the case above asserted the CONFIG and nothing looked at the SCENE, so a runtime that
  // declared two lights and attached none passed every test in this file. The colour of a
  // `MeshStandardMaterial` is a function of the lights in its scene, so that scene rendered black.
  it('the declared lights are IN the three scene, identically — not merely described in a config', () => {
    const scene = runtime.createScene('Test');
    const attached = scene.threeScene.children.filter((child) => (child as { isLight?: boolean }).isLight === true);
    expect(attached).toHaveLength(2);
    for (const light of scene.lighting.lights) {
      expect(scene.threeScene.children).toContain(light.threeLight);
      expect(scene.threeScene.getObjectById(light.threeLight.id)).toBe(light.threeLight);
    }
    const ambient = scene.lighting.lights.find((l) => l.type === 'ambient')!;
    expect((ambient.threeLight as { isAmbientLight?: boolean }).isAmbientLight).toBe(true);
  });

  it('a new scene gets its OWN lights, so one scene cannot light another', () => {
    const first = runtime.createScene('First');
    const second = runtime.createScene('Second');
    expect(first.threeScene.children).toHaveLength(2);
    expect(second.threeScene.children).toHaveLength(2);
    expect(second.lighting.lights[0].threeLight).not.toBe(first.lighting.lights[0].threeLight);
  });

  it('the lights do not wear an entity\'s clothes: every non-light child is still a REGISTERED body', () => {
    // v140's proof counted a scene's objects through the headless backend, and those numbers were taken
    // from a runtime whose scenes held no lights at all. Attaching the declared lighting moves that
    // number, so the thing worth pinning is the boundary rather than the total: what a scene gains is
    // LIGHTS, and nothing that used to be a body stops being one.
    const scene = runtime.createScene('Counted');
    runtime.createEntity(scene.id, 'Cube', 'mesh');
    const registered = new Set([...scene.entities.values()].map((e) => e.threeObject));
    const nonLights = scene.threeScene.children.filter((child) => (child as { isLight?: boolean }).isLight !== true);
    expect(nonLights).toHaveLength(1);
    expect(registered.has(nonLights[0]!)).toBe(true);
  });
});
describe('pickAt (v182) — the runtime names the body under a view point', () => {
  /** A rig aimed at the origin from +Z, so NDC (0, 0) IS the origin — every case reasons from there. */
  function pickRig() {
    const runtime = headlessRuntime().runtime;
    runtime.initialize(mockCanvas);
    const scene = runtime.createScene('Pick Scene');
    const camera = runtime.createCamera(scene.id, 'Pick Camera');
    camera.threeCamera.position.set(0, 0, 5);
    camera.threeCamera.lookAt(new THREE.Vector3(0, 0, 0));
    camera.threeCamera.updateMatrixWorld(true);
    return { runtime, scene, camera };
  }

  it('the center of the view names the body standing there', () => {
    const { runtime, scene } = pickRig();
    const box = runtime.createEntity(scene.id, 'Box', 'mesh');

    const picked = runtime.pickAt(scene.id, 0, 0);
    expect(picked).not.toBeNull();
    expect(picked!.entityId).toBe(box.id);
    expect(picked!.name).toBe('Box');
    expect(picked!.distance).toBeGreaterThan(0);
    expect(picked!.distance).toBeLessThan(5);
  });

  it('a corner that no body occupies answers null — a miss is an honest answer', () => {
    const { runtime, scene } = pickRig();
    runtime.createEntity(scene.id, 'Box', 'mesh');
    expect(runtime.pickAt(scene.id, 0.95, 0.95)).toBeNull();
  });

  it('two bodies on one ray answer the NEARER one', () => {
    const { runtime, scene } = pickRig();
    const far = runtime.createEntity(scene.id, 'Far', 'mesh', undefined, undefined, new THREE.Vector3(0, 0, -2));
    const near = runtime.createEntity(scene.id, 'Near', 'mesh', undefined, undefined, new THREE.Vector3(0, 0, 1));

    const picked = runtime.pickAt(scene.id, 0, 0);
    expect(picked!.entityId).toBe(near.id);
    expect(picked!.entityId).not.toBe(far.id);
  });

  it('an invisible body is not pickable — a pick answers what an eye could see', () => {
    const { runtime, scene } = pickRig();
    const box = runtime.createEntity(scene.id, 'Ghost', 'mesh');
    box.visible = false;
    expect(runtime.pickAt(scene.id, 0, 0)).toBeNull();
  });

  it('a scene with no active camera answers null — nothing to ask through', () => {
    const runtime = headlessRuntime().runtime;
    runtime.initialize(mockCanvas);
    const bare = runtime.createScene('No Camera');
    runtime.createEntity(bare.id, 'Box', 'mesh');
    expect(runtime.pickAt(bare.id, 0, 0)).toBeNull();
  });

  it('an unknown scene is refused, not answered with a fake miss', () => {
    const runtime = headlessRuntime().runtime;
    runtime.initialize(mockCanvas);
    expect(() => runtime.pickAt(sceneId('nope'), 0, 0)).toThrow(/not found/);
  });

  it('the pick follows the LIVE scene, not the last matrices somebody left behind', () => {
    const { runtime, scene } = pickRig();
    const box = runtime.createEntity(scene.id, 'Box', 'mesh');
    // Walked out of the aimed-at spot: the center is now empty...
    box.threeObject.position.set(2, 0, 0);
    expect(runtime.pickAt(scene.id, 0, 0)).toBeNull();
    // ...and re-aiming at where it went finds it again — same center, different answer.
    const camera = runtime.getScene(scene.id)!.cameras.get([...runtime.getScene(scene.id)!.cameras.keys()][0]!);
    camera!.threeCamera.position.set(2, 0, 5);
    camera!.threeCamera.lookAt(new THREE.Vector3(2, 0, 0));
    expect(runtime.pickAt(scene.id, 0, 0)!.name).toBe('Box');
  });

  it('NDC y points UP: the body ABOVE the aim point is picked above center, not below', () => {
    const { runtime, scene } = pickRig();
    // fov 75: half-height at depth 5 is 5·tan(37.5°) ≈ 3.84, so the box center at y=1 sits at NDC
    // y ≈ +0.26. A y-DOWN implementation would answer exactly the opposite pair here.
    runtime.createEntity(scene.id, 'High', 'mesh', undefined, undefined, new THREE.Vector3(0, 1, 0));
    expect(runtime.pickAt(scene.id, 0, 0.26)!.name).toBe('High');
    expect(runtime.pickAt(scene.id, 0, -0.26)).toBeNull();
  });
});
