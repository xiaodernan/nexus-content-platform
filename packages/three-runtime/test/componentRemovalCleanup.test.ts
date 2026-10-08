// M5 v205 — removeComponent must clean up its behavioral effects: targetObject visibility and animation playback state.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  ThreeRuntime,
  createHeadlessBackend,
  manualFrameScheduler,
  type HeadlessBackend,
} from '../src/index.js';

const CONFIG = {
  renderer: { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'default' as const, stencil: false, depth: false, logarithmicDepthBuffer: false },
  shadowMap: { enabled: false, type: 0, autoUpdate: false },
  toneMapping: 0,
  toneMappingExposure: 1,
  colorSpace: 'srgb' as const,
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

describe('M5 v205 — component removal cleanup', () => {
  let runtime: ThreeRuntime;

  beforeEach(() => {
    const headless = headlessRuntime();
    runtime = headless.runtime;
  });

  it('removing a component with targetObject restores its visibility to true', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');

    // Create a target object and hide it initially
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

    // Remove the component - target should be restored to visible
    const removed = runtime.removeComponent(scene.id, entity, 'visual');
    expect(removed).toBe(true);
    expect(targetObject.visible).toBe(true);
  });

  it('removing a component with animationIds resumes paused animations', () => {
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

    // Remove the component - animation should resume
    const removed = runtime.removeComponent(scene.id, entity, 'movement');
    expect(removed).toBe(true);
    expect(anim.threeAnimation.isRunning()).toBe(true);
  });

  it('removing a component without runtime-only fields succeeds cleanly', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');

    // Add a plain data component
    runtime.addComponent(entity, {
      type: 'health',
      data: { amount: 100 },
      enabled: true,
    });

    // Remove should succeed without side effects
    const removed = runtime.removeComponent(scene.id, entity, 'health');
    expect(removed).toBe(true);
    expect(runtime.getComponent(entity, 'health')).toBeUndefined();
  });

  it('removing a non-existent component returns false', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');

    const removed = runtime.removeComponent(scene.id, entity, 'nonexistent');
    expect(removed).toBe(false);
  });

  it('removing a component with non-existent animationIds does not crash', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');

    // Add a component referencing a non-existent animation
    runtime.addComponent(entity, {
      type: 'effect',
      data: {},
      enabled: true,
      animationIds: ['non-existent-anim'],
    });

    // Removal should succeed (animation just won't be found)
    const removed = runtime.removeComponent(scene.id, entity, 'effect');
    expect(removed).toBe(true);
  });
});
