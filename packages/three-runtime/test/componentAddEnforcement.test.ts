// M5 v209 — addComponent must enforce a newly-filed DISABLED component's gates at file time:
// targetObject hidden and animations disabled, with no setComponentEnabled call in between.
// The enabled half is deliberately NOT enforced: an enabled add declares the default state.
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

describe('M5 v209 — add-time disabled enforcement', () => {
  let runtime: ThreeRuntime;

  beforeEach(() => {
    const headless = headlessRuntime();
    runtime = headless.runtime;
  });

  it('filing a disabled component with targetObject hides it at add time, no toggle call', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');
    const targetObject = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    expect(targetObject.visible).toBe(true);

    runtime.addComponent(entity, {
      type: 'visual',
      data: {},
      enabled: false,
      targetObject,
    });

    expect(targetObject.visible).toBe(false);
  });

  it('filing a disabled component with animationIds disables the animation at add time', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');
    const clip = new THREE.AnimationClip('test-clip', 1, [
      new THREE.VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 1, 1, 1]),
    ]);
    const anim = runtime.createAnimation(scene.id, entity, [clip], 'test-animation');
    anim.threeAnimation.play();
    expect(anim.threeAnimation.isRunning()).toBe(true);

    runtime.addComponent(entity, {
      type: 'movement',
      data: {},
      enabled: false,
      animationIds: [anim.id],
    });

    expect(anim.threeAnimation.enabled).toBe(false);
    expect(anim.threeAnimation.isRunning()).toBe(false);
  });

  it('filing an ENABLED component does not re-assert the default: a target the scene keeps hidden stays hidden', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');
    const targetObject = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    targetObject.visible = false;

    runtime.addComponent(entity, {
      type: 'visual',
      data: {},
      enabled: true,
      targetObject,
    });

    // The enabled add declares the default state; enforcement runs only for enabled === false.
    expect(targetObject.visible).toBe(false);
  });

  it('filing an ENABLED component touches neither a SHOWN target nor a RUNNING animation', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');
    const shown = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    expect(shown.visible).toBe(true);

    const clip = new THREE.AnimationClip('test-clip', 1, [
      new THREE.VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 1, 1, 1]),
    ]);
    const anim = runtime.createAnimation(scene.id, entity, [clip], 'test-animation');
    anim.threeAnimation.play();

    runtime.addComponent(entity, {
      type: 'visual',
      data: {},
      enabled: true,
      targetObject: shown,
      animationIds: [anim.id],
    });

    expect(shown.visible).toBe(true);
    expect(anim.threeAnimation.enabled).toBe(true);
    expect(anim.threeAnimation.isRunning()).toBe(true);
  });

  it('a disabled replacement over the same target ends hidden: v208 restores it, v209 re-hides it last', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');
    const targetObject = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff0000 }));

    runtime.addComponent(entity, { type: 'shield', data: {}, enabled: true, targetObject });
    runtime.setComponentEnabled(scene.id, entity.id, 'shield', false);
    expect(targetObject.visible).toBe(false);

    // Same type, same target, filed disabled. The eviction cleanup (v208) restores visibility,
    // then the new component's own disabled declaration (v209) is enforced LAST.
    runtime.addComponent(entity, { type: 'shield', data: { amount: 2 }, enabled: false, targetObject });
    expect(targetObject.visible).toBe(false);

    // And the registry actually holds the disabled replacement, so the last writer is its owner.
    expect(runtime.getComponent(entity, 'shield')?.data).toEqual({ amount: 2 });
  });

  it('filing a disabled component with non-existent animationIds does not crash', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');

    expect(() =>
      runtime.addComponent(entity, {
        type: 'effect',
        data: {},
        enabled: false,
        animationIds: ['non-existent-anim'],
      }),
    ).not.toThrow();
    expect(runtime.getComponent(entity, 'effect')?.enabled).toBe(false);
  });

  it('filing a disabled plain component stores it and excludes it from the enabled query', () => {
    const scene = runtime.createScene('Test Scene');
    const entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');

    runtime.addComponent(entity, { type: 'health', data: { amount: 100 }, enabled: false });

    expect(runtime.getComponent(entity, 'health')).toBeDefined();
    expect(runtime.getEnabledComponents(entity).map((c) => c.type)).toEqual([]);
  });
});
