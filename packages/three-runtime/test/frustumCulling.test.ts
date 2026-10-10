// M5 v221 — `frustumCulling` was a REQUIRED field of `ThreeRuntimeConfig` that nothing in this package read:
// `frustumCulled` was set nowhere, so the flag was a promise the runtime never kept, and every caller had to
// state a value that changed nothing. It is now APPLIED at the one funnel both `createEntity` and a restore
// pass through — and its sibling `maxLights` is OPTIONAL and documented as unhonored, because there is no
// light-creation API for a cap to cap.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  ThreeRuntime,
  createHeadlessBackend,
  manualFrameScheduler,
  sceneId as brandSceneId,
  type HeadlessBackend,
} from '../src/index.js';

const BASE = {
  renderer: { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'default' as const, stencil: false, depth: false, logarithmicDepthBuffer: false },
  shadowMap: { enabled: false, type: THREE.BasicShadowMap, autoUpdate: false },
  toneMapping: THREE.NoToneMapping,
  toneMappingExposure: 1,
  colorSpace: 'srgb' as const,
  // `maxLights` is deliberately ABSENT here: it is optional as of v221, and a config that omits it must work.
  sortObjects: true,
} as const;

function runtimeWith(frustumCulling: boolean) {
  let backend: HeadlessBackend | null = null;
  const runtime = new ThreeRuntime(
    { ...BASE, frustumCulling },
    { backend: () => { backend = createHeadlessBackend({ ...BASE, frustumCulling }); return backend; }, scheduler: manualFrameScheduler() },
  );
  const mockCanvas = { width: 800, height: 600, style: {}, addEventListener() {}, removeEventListener() {}, getContext: () => null } as unknown as HTMLCanvasElement;
  runtime.initialize(mockCanvas);
  const scene = runtime.createScene('Frustum', brandSceneId('frustum-scene'));
  return { runtime, scene };
}

describe('M5 v221 — frustumCulling is APPLIED, and maxLights is honestly optional', () => {
  it('the default config leaves every created body at THREE’s own default — culling ON', () => {
    const { runtime, scene } = runtimeWith(true);
    const body = runtime.createEntity(scene.id, 'Cube', 'mesh');
    expect(body.threeObject.frustumCulled).toBe(true);
  });

  it('`frustumCulling: false` reaches the created body — the flag is not decorative', () => {
    const { runtime, scene } = runtimeWith(false);
    const body = runtime.createEntity(scene.id, 'Cube', 'mesh');
    expect(body.threeObject.frustumCulled).toBe(false);
    // The neighbouring fields are untouched, so this is the flag and not a wholesale object replacement.
    expect(body.threeObject.visible).toBe(true);
  });

  it('a RESTORED body carries the runtime’s config, not whatever the object arrived with', () => {
    // The claim is about the FUNNEL: `insertEntity` is what both `createEntity` and `restoreEntity` pass
    // through, so a restore cannot land on a different value than a create in the same runtime. The restore
    // goes into a SECOND scene because this runtime refuses to overwrite live state ("a restore never
    // overwrites live state") — the refusal is its own rule, not a workaround.
    const { runtime, scene } = runtimeWith(false);
    const other = runtime.createScene('Elsewhere', brandSceneId('frustum-other'));
    const created = runtime.createEntity(scene.id, 'Cube', 'mesh');
    const snapshot = runtime.snapshotEntity(scene.id, created.id);
    const restored = runtime.restoreEntity(other.id, snapshot);

    expect(created.threeObject.frustumCulled).toBe(false);
    expect(restored.threeObject.frustumCulled).toBe(false);
  });

  it('the flag is re-DERIVED on restore rather than carried in the file — it is a runtime setting, not state', () => {
    const { runtime, scene } = runtimeWith(false);
    const body = runtime.createEntity(scene.id, 'Cube', 'mesh');
    const snapshot = runtime.snapshotEntity(scene.id, body.id);

    // The save shape has no field for it, which is why a restore has to take the value from the config.
    expect(Object.keys(snapshot)).not.toContain('frustumCulled');
    expect(Object.keys(snapshot)).toContain('visible');
  });

  it('a config that omits `maxLights` builds and runs — the field no longer has to be stated', () => {
    // `maxLights` is unhonored (no light-creation API exists to cap) and is now OPTIONAL. The observable claim
    // a runtime case can make is that omitting it is not a hole: the runtime builds, a scene is created and a
    // body lands, exactly as with the field present.
    const { runtime, scene } = runtimeWith(true);
    const body = runtime.createEntity(scene.id, 'Cube', 'mesh');
    expect(runtime.getScene(scene.id)!.entities.size).toBe(1);
    expect(body.threeObject.frustumCulled).toBe(true);
  });
});
