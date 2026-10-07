// M5 v203 — enabled gates animation playback: when a component with animationIds is disabled,
// its animations pause; re-enabling resumes them.
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

describe('M5 v203 — enabled gates animation playback', () => {
  let runtime: ThreeRuntime;

  beforeEach(() => {
    const headless = headlessRuntime();
    runtime = headless.runtime;
  });

  it('disabling a component pauses its animations, re-enabling resumes them', () => {
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

    // The animation should be playable (created but not yet playing)
    expect(anim.threeAnimation).toBeDefined();

    // Disable the component — the animation should pause
    runtime.setComponentEnabled(scene.id, entity.id, 'movement', false);
    // After pause, isRunning() should be false
    expect(anim.threeAnimation.isRunning()).toBe(false);

    // Re-enable — the animation should resume (play called)
    runtime.setComponentEnabled(scene.id, entity.id, 'movement', true);
    // After play, isRunning() should be true
    expect(anim.threeAnimation.isRunning()).toBe(true);
  });

  it('a component without animationIds toggles safely without affecting animations', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');

    // Add a component without animationIds
    runtime.addComponent(entity, {
      type: 'health',
      data: { amount: 100 },
      enabled: true,
    });

    // Toggling should not crash
    expect(runtime.setComponentEnabled(scene.id, entity.id, 'health', false)).toBe(true);
    expect(runtime.setComponentEnabled(scene.id, entity.id, 'health', true)).toBe(true);
  });

  it('a component with non-existent animationIds toggles safely', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');

    // Add a component referencing a non-existent animation
    runtime.addComponent(entity, {
      type: 'effect',
      data: {},
      enabled: true,
      animationIds: ['non-existent-anim'],
    });

    // Toggling should not crash (the animation just won't be found)
    expect(runtime.setComponentEnabled(scene.id, entity.id, 'effect', false)).toBe(true);
    expect(runtime.setComponentEnabled(scene.id, entity.id, 'effect', true)).toBe(true);
  });
});
