// M5 v208 — addComponent on an occupied key REPLACES the old component, and the eviction must release
// the replaced component's runtime-only effects (targetObject visibility, paused animations) exactly the
// way v205's removeComponent does. The identity exemption: re-adding the SAME object is a no-op re-file,
// not an eviction — its own declared effects stay as its caller left them.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  ThreeRuntime,
  createHeadlessBackend,
  manualFrameScheduler,
  animationId,
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

describe('M5 v208 — addComponent replace-path cleanup', () => {
  let runtime: ThreeRuntime;

  beforeEach(() => {
    const headless = headlessRuntime();
    runtime = headless.runtime;
  });

  it('replacing a component restores the evicted one hidden targetObject', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');

    const targetObject = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff0000 }));

    runtime.addComponent(entity, {
      type: 'visual',
      data: {},
      enabled: true,
      targetObject,
    });
    runtime.setComponentEnabled(scene.id, entity.id, 'visual', false);
    expect(targetObject.visible).toBe(false);

    // A same-type add REPLACES the component — the evicted one's hidden target must not strand.
    runtime.addComponent(entity, { type: 'visual', data: { from: 'new' }, enabled: true });
    expect(targetObject.visible).toBe(true);
  });

  it('replacing a component resumes the evicted ones paused animation', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');

    const clip = new THREE.AnimationClip('test-clip', 1, [
      new THREE.VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 1, 1, 1]),
    ]);
    const anim = runtime.createAnimation(scene.id, entity, [clip], 'test-animation');

    runtime.addComponent(entity, {
      type: 'movement',
      data: {},
      enabled: true,
      animationIds: [anim.id],
    });
    runtime.setComponentEnabled(scene.id, entity.id, 'movement', false);
    expect(anim.threeAnimation.isRunning()).toBe(false);

    runtime.addComponent(entity, { type: 'movement', data: { from: 'new' }, enabled: true });
    expect(anim.threeAnimation.isRunning()).toBe(true);
  });

  it('re-adding the SAME component object is not an eviction: its own effects stay as left', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');

    const targetObject = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    const comp = { type: 'visual', data: {}, enabled: true, targetObject };

    runtime.addComponent(entity, comp);
    runtime.setComponentEnabled(scene.id, entity.id, 'visual', false);
    expect(targetObject.visible).toBe(false);

    // The registry already files THIS object under this key; re-filing it declares no eviction, so the
    // cleanup must not undo the state this very component put the target in.
    runtime.addComponent(entity, comp);
    expect(targetObject.visible).toBe(false);
    expect(runtime.getComponent(entity, 'visual')).toBe(comp);
  });

  it('the replacement still replaces: the registry now answers the NEW component', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');

    runtime.addComponent(entity, { type: 'health', data: { amount: 1 }, enabled: true });
    const replacement = { type: 'health', data: { amount: 2 }, enabled: true };
    runtime.addComponent(entity, replacement);

    expect(runtime.getComponent(entity, 'health')).toBe(replacement);
    expect(runtime.getComponent(entity, 'health')?.data).toEqual({ amount: 2 });
  });

  it('replacing a component with non-existent animationIds does not crash', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');

    runtime.addComponent(entity, {
      type: 'effect',
      data: {},
      enabled: true,
      animationIds: [animationId('non-existent-anim')],
    });
    expect(() => {
      runtime.addComponent(entity, { type: 'effect', data: {}, enabled: true });
    }).not.toThrow();
    expect(runtime.getComponent(entity, 'effect')?.animationIds).toBeUndefined();
  });

  it('a first add (nothing evicted) files the component with no cleanup side effects', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');

    const targetObject = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x0000ff }));
    targetObject.visible = false;

    // Nothing preceded this component — the add must not flip the target the CALLER left hidden.
    runtime.addComponent(entity, { type: 'visual', data: {}, enabled: true, targetObject });
    expect(targetObject.visible).toBe(false);
  });
});
