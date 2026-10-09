// M5 v206 — removeEntity must clean up all components' behavioral effects: targetObject visibility and animation playback state.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  ThreeRuntime,
  createHeadlessBackend,
  manualFrameScheduler,
  entityId as brandEntityId,
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

function headlessRuntime() {
  let backend: HeadlessBackend | null = null;
  const scheduler = manualFrameScheduler();
  const runtime = new ThreeRuntime(
    CONFIG,
    {
      backend: () => {
        backend = createHeadlessBackend(CONFIG);
        return backend;
      },
      scheduler,
    },
  );
  const mockCanvas = { width: 800, height: 600, style: {}, addEventListener() {}, removeEventListener() {}, getContext: () => null } as unknown as HTMLCanvasElement;
  runtime.initialize(mockCanvas);
  return { runtime, scheduler, backend: backend! };
}

describe('M5 v206 — entity removal component cleanup', () => {
  let runtime: ThreeRuntime;

  beforeEach(() => {
    const headless = headlessRuntime();
    runtime = headless.runtime;
  });

  it('removing an entity with a component that has targetObject restores its visibility', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');

    // Create a target object and hide it
    const targetObject = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    targetObject.visible = false;

    // Add a component that controls this target object
    runtime.addComponent(entity, {
      type: 'visual',
      data: {},
      enabled: true,
      targetObject,
    });

    // Disable the component - target should be hidden
    runtime.setComponentEnabled(scene.id, entity.id, 'visual', false);
    expect(targetObject.visible).toBe(false);

    // Remove the entity - target should be restored to visible
    const removed = runtime.removeEntity(scene.id, entity.id);
    expect(removed).toBe(true);
    expect(targetObject.visible).toBe(true);
  });

  it('removing an entity with a component that has animationIds resumes paused animations', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');

    // Create a simple animation clip
    const clip = new THREE.AnimationClip('test-clip', 1, [
      new THREE.VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 1, 1, 1]),
    ]);

    // Create the animation through the runtime
    const anim = runtime.createAnimation(scene.id, entity, [clip], 'test-animation');
    const animId = anim.id;

    // Add a component that gates this animation
    runtime.addComponent(entity, {
      type: 'movement',
      data: {},
      enabled: true,
      animationIds: [animId],
    });

    // Disable the component - animation should pause
    runtime.setComponentEnabled(scene.id, entity.id, 'movement', false);
    expect(anim.threeAnimation.isRunning()).toBe(false);

    // Remove the entity - animation should resume
    const removed = runtime.removeEntity(scene.id, entity.id);
    expect(removed).toBe(true);
    expect(anim.threeAnimation.isRunning()).toBe(true);
  });

  it('removing an entity with multiple components cleans up all of them', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');

    // Create two target objects
    const target1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    const target2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    target1.visible = false;
    target2.visible = false;

    // Create an animation
    const clip = new THREE.AnimationClip('test-clip', 1, [
      new THREE.VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 1, 1, 1]),
    ]);
    const anim = runtime.createAnimation(scene.id, entity, [clip], 'test-animation');
    const animId = anim.id;

    // Add two components with different runtime-only fields
    runtime.addComponent(entity, {
      type: 'visual1',
      data: {},
      enabled: true,
      targetObject: target1,
    });
    runtime.addComponent(entity, {
      type: 'visual2',
      data: {},
      enabled: true,
      targetObject: target2,
    });
    runtime.addComponent(entity, {
      type: 'movement',
      data: {},
      enabled: true,
      animationIds: [animId],
    });

    // Disable all components
    runtime.setComponentEnabled(scene.id, entity.id, 'visual1', false);
    runtime.setComponentEnabled(scene.id, entity.id, 'visual2', false);
    runtime.setComponentEnabled(scene.id, entity.id, 'movement', false);

    expect(target1.visible).toBe(false);
    expect(target2.visible).toBe(false);
    expect(anim.threeAnimation.isRunning()).toBe(false);

    // Remove the entity - all should be cleaned up
    const removed = runtime.removeEntity(scene.id, entity.id);
    expect(removed).toBe(true);
    expect(target1.visible).toBe(true);
    expect(target2.visible).toBe(true);
    expect(anim.threeAnimation.isRunning()).toBe(true);
  });

  it('removing an entity without components succeeds cleanly', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');

    const removed = runtime.removeEntity(scene.id, entity.id);
    expect(removed).toBe(true);
    expect(runtime.getEntity(scene.id, entity.id)).toBeUndefined();
  });

  it('removing a non-existent entity returns false', () => {
    const scene = runtime.createScene('Test Scene');

    const removed = runtime.removeEntity(scene.id, brandEntityId('non-existent'));
    expect(removed).toBe(false);
  });
});
