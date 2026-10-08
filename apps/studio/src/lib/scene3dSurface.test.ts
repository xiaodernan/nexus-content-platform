import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  cameraId as toCameraId,
  createHeadlessBackend,
  entityId as toEntityId,
  manualFrameScheduler,
  sceneId as toSceneId,
  ThreeRuntime,
  type HeadlessBackend,
} from '@nexus/three-runtime';
import {
  buildDemoScene,
  createStudioScene,
  selectionFactsOf,
  STUDIO_CAMERA_LOOK_AT,
  STUDIO_CAMERA_POSITION,
  type SceneAdapterLike,
  type SceneVec3,
} from './scene3d';

/**
 * M5 v142 — the ADAPTER half of the Studio's 3D surface, run against the SHIPPED package.
 *
 * The pure suite (`scene3d.test.ts`) proves the model over a fake, and a fake agrees with whatever its
 * author believed. That is exactly how this increment's real defect was hiding: a scene whose two
 * declared lights were never attached to it, so every mesh in it rendered black — invisible above the
 * renderer seam, because every earlier case asserted the CONFIG (`lights.length === 2`) and none looked
 * at the SCENE.
 *
 * So this file runs the real `ThreeRuntime` on the injectable headless seam (M5 v108) through the same
 * functions the component calls, and pins what only the real package can answer: that the three
 * declarations line up (entity body, camera shape, those lights), and that a frame really reaches a
 * backend carrying the camera the Studio aimed.
 */

const mockCanvas = {
  width: 800,
  height: 600,
  style: {} as CSSStyleDeclaration,
  addEventListener: () => {},
  removeEventListener: () => {},
  getContext: () => null,
} as unknown as HTMLCanvasElement;

function headlessRuntime() {
  let backend: HeadlessBackend | null = null;
  const scheduler = manualFrameScheduler();
  const runtime = new ThreeRuntime(
    {},
    {
      backend: (canvas, config) => {
        void canvas;
        backend = createHeadlessBackend(config);
        return backend;
      },
      scheduler,
    },
  );
  runtime.initialize(mockCanvas);
  return { runtime, scheduler, getBackend: () => backend! };
}

/** The component's adapter, written the same way here so the test cannot pass while it is broken. */
function aimCamera(runtime: ThreeRuntime, scene: string, camera: string): THREE.Camera | null {
  const found = runtime.getScene(toSceneId(scene));
  const target = found?.cameras.get(toCameraId(camera));
  if (!target) return null;
  target.threeCamera.position.set(STUDIO_CAMERA_POSITION.x, STUDIO_CAMERA_POSITION.y, STUDIO_CAMERA_POSITION.z);
  target.threeCamera.lookAt(new THREE.Vector3(STUDIO_CAMERA_LOOK_AT.x, STUDIO_CAMERA_LOOK_AT.y, STUDIO_CAMERA_LOOK_AT.z));
  target.threeCamera.updateMatrixWorld(true);
  return target.threeCamera;
}

describe('the Studio’s scene, composed on the REAL runtime', () => {
  let runtime: ThreeRuntime | null = null;
  afterEach(() => {
    runtime?.dispose();
    runtime = null;
  });

  it('buildDemoScene composes what the report then describes — one runtime, no second source', () => {
    const headless = headlessRuntime();
    runtime = headless.runtime;

    const surface = createStudioScene(headless.runtime, () => {});
    const report = surface.report();

    expect(report.backend).toBe('headless');
    expect(report.scenes).toBe(1);
    expect(report.activeSceneId).toBe(surface.sceneId);
    expect(report.scene).not.toBeNull();
    expect(report.scene!.name).toBe('Studio Scene');
    expect(report.scene!.entityNames).toEqual(['Ground', 'Cube A', 'Cube B', 'Cube C']);
    expect(report.scene!.cameraNames).toEqual(['Studio Camera']);
    expect(report.scene!.activeCamera).toBe(surface.cameraId);
    // The graph and the surface agree about which bodies exist — the ids are the runtime's own.
    const composed = headless.runtime.getScene(toSceneId(surface.sceneId))!;
    for (const id of surface.bodyIds) {
      expect(composed.entities.has(toEntityId(id))).toBe(true);
    }
  });

  it('a click at the view center names the body the real ray finds — Cube B (v182)', () => {
    const headless = headlessRuntime();
    runtime = headless.runtime;
    // The component's adapter, written the same way here: aim + pick both go through the real package.
    const adapter: SceneAdapterLike = {
      placeCamera(sceneId: string, cameraId: string, position: SceneVec3, lookAt: SceneVec3) {
        const found = headless.runtime.getScene(toSceneId(sceneId))?.cameras.get(toCameraId(cameraId));
        if (!found) return false;
        found.threeCamera.position.set(position.x, position.y, position.z);
        found.threeCamera.lookAt(new THREE.Vector3(lookAt.x, lookAt.y, lookAt.z));
        found.threeCamera.updateMatrixWorld(true);
        return true;
      },
      pickAt(sceneId: string, nx: number, ny: number) {
        return headless.runtime.pickAt(toSceneId(sceneId), nx, ny);
      },
    };
    const surface = createStudioScene(headless.runtime, () => {}, adapter);

    // The component resizes its backend on mount; the headless state starts at 0×0, and a pick with no
    // dimensions to convert with is an honest no-op — so resize FIRST, exactly like the product does.
    headless.runtime.resize(800, 600);
    // The aimed-at point sits INSIDE Cube B (the probe measured it), so the pixel at the exact center
    // converts to NDC (0, 0) and names Cube B.
    const picked = surface.pickAt(400, 300);
    expect(picked.selected).toEqual({ id: surface.bodyIds[2], name: 'Cube B' });
    // Empty sky at the top-left corner: a miss, and the report says so.
    expect(surface.pickAt(40, 30).selected).toBeNull();
  });

  it('the pick gains INSPECTOR facts read from the live scene — kind, position, visibility (v192)', () => {
    const headless = headlessRuntime();
    runtime = headless.runtime;
    const adapter: SceneAdapterLike = {
      placeCamera(sceneId: string, cameraId: string, position: SceneVec3, lookAt: SceneVec3) {
        const found = headless.runtime.getScene(toSceneId(sceneId))?.cameras.get(toCameraId(cameraId));
        if (!found) return false;
        found.threeCamera.position.set(position.x, position.y, position.z);
        found.threeCamera.lookAt(new THREE.Vector3(lookAt.x, lookAt.y, lookAt.z));
        found.threeCamera.updateMatrixWorld(true);
        return true;
      },
      pickAt(sceneId: string, nx: number, ny: number) {
        return headless.runtime.pickAt(toSceneId(sceneId), nx, ny);
      },
    };
    const surface = createStudioScene(headless.runtime, () => {}, adapter);
    headless.runtime.resize(800, 600);

    // The writeFrame here is a no-op, so Cube B still stands where the demo composed it — the one
    // place an EXACT position assertion is honest. (The product's frame loop bobs bodies; the
    // browser harness asserts the fact shape, never the number.)
    const picked = surface.pickAt(400, 300);
    expect(picked.selected?.name).toBe('Cube B');
    expect(picked.inspector).toEqual({
      id: surface.bodyIds[2],
      name: 'Cube B',
      kind: 'mesh',
      position: { x: 0, y: 0.4, z: 0 },
      visible: true,
      components: [],
    });

    // Remove the SELECTED body and the selection STAYS a name while the inspector answers null —
    // the facts are the live scene's, and a scene that no longer holds the body has none.
    const bodyId = surface.bodyIds[2]!;
    surface.removeBody(bodyId);
    const after = surface.report();
    expect(after.selected).toEqual({ id: bodyId, name: 'Cube B' });
    expect(after.inspector).toBeNull();

    // A miss clears BOTH: no selection, and no facts to inspect.
    expect(surface.pickAt(40, 30).inspector).toBeNull();
    expect(surface.report().selected).toBeNull();
  });

  it('the declared lighting is IN the scene — the v142 defect, measured on the shipped runtime', () => {
    const headless = headlessRuntime();
    runtime = headless.runtime;
    const surface = createStudioScene(headless.runtime, () => {});

    const scene = headless.runtime.getScene(toSceneId(surface.sceneId))!;
    const lights = scene.threeScene.children.filter((c) => (c as { isLight?: boolean }).isLight === true);
    expect(lights).toHaveLength(scene.lighting.lights.length);
    expect(lights).toHaveLength(2);
    for (const light of scene.lighting.lights) {
      expect(scene.threeScene.children).toContain(light.threeLight);
    }
    // The claim that matters for a `MeshStandardMaterial`: this scene can return light at all. A scene
    // holding none has nothing for the renderer to shade with, which is what "renders black" means.
    expect(lights.length).toBeGreaterThan(0);
  });

  // M5 v183 — the full lighting chain on the shipped runtime: the surface folds the ask, the runtime's
  // gate writes the LIVE three.js light (attaching and detaching it, per v142's rule), and the report
  // re-reads the scene — so the HUD states what the renderer will actually shade with.
  it('the lighting is CONTROLLABLE end to end — surface ask, runtime gate, live light, honest report', () => {
    const headless = headlessRuntime();
    runtime = headless.runtime;
    const surface = createStudioScene(headless.runtime, () => {});
    const scene = headless.runtime.getScene(toSceneId(surface.sceneId))!;

    // The report reads the REAL brightness where the real runtime keeps it (the wrapped three.js object).
    expect(surface.report().scene?.lighting).toEqual([
      { id: 'ambient', type: 'ambient', enabled: true, intensity: 0.5 },
      { id: 'directional', type: 'directional', enabled: true, intensity: 1 },
    ]);

    // Dim through the surface: the live light carries it, and so does the next report.
    const dimmed = surface.setLight('directional', { intensity: 0.25 });
    const directional = scene.lighting.lights.find((l) => l.id === 'directional')!;
    expect(directional.threeLight.intensity).toBe(0.25);
    expect(dimmed.scene?.lighting.find((l) => l.id === 'directional')!.intensity).toBe(0.25);

    // An out-of-range ask is folded by the surface BEFORE the runtime sees it.
    surface.setLight('ambient', { intensity: 99 });
    expect(scene.lighting.lights.find((l) => l.id === 'ambient')!.threeLight.intensity).toBe(2);

    // Disabling through the surface DETACHES the real light — v142's rule through the whole chain.
    surface.setLight('directional', { enabled: false });
    expect(scene.threeScene.children).not.toContain(directional.threeLight);
    expect(surface.report().scene?.lighting.find((l) => l.id === 'directional')).toEqual({
      id: 'directional',
      type: 'directional',
      enabled: false,
      intensity: 0.25,
    });
    // Re-enabling attaches it back.
    surface.setLight('directional', { enabled: true });
    expect(scene.threeScene.children).toContain(directional.threeLight);
  });

  // M5 v197 — the inspector's edit chain on the shipped runtime: the surface folds the ask, the
  // runtime's gate writes the LIVE records (BOTH of them, for visibility), and the report re-reads the
  // scene — so the HUD states the body's state, never the button's opinion.
  it('the inspector is EDITABLE end to end — surface ask, runtime gate, both records, honest report', () => {
    const headless = headlessRuntime();
    runtime = headless.runtime;
    const adapter: SceneAdapterLike = {
      placeCamera(sceneId: string, cameraId: string, position: SceneVec3, lookAt: SceneVec3) {
        const found = headless.runtime.getScene(toSceneId(sceneId))?.cameras.get(toCameraId(cameraId));
        if (!found) return false;
        found.threeCamera.position.set(position.x, position.y, position.z);
        found.threeCamera.lookAt(new THREE.Vector3(lookAt.x, lookAt.y, lookAt.z));
        found.threeCamera.updateMatrixWorld(true);
        return true;
      },
      pickAt(sceneId: string, nx: number, ny: number) {
        return headless.runtime.pickAt(toSceneId(sceneId), nx, ny);
      },
    };
    const surface = createStudioScene(headless.runtime, () => {}, adapter);
    headless.runtime.resize(800, 600);
    // The pick is v182's answer: Cube B stands under the view center.
    const picked = surface.pickAt(400, 300);
    expect(picked.selected).toEqual({ id: surface.bodyIds[2], name: 'Cube B' });
    const selectedId = surface.bodyIds[2]!;
    const scene = headless.runtime.getScene(toSceneId(surface.sceneId))!;

    // Rename through the surface: the live registry record carries it, the pick record moves WITH it
    // (the runtime's restore rule), and the inspector reads the new name off the live scene.
    const renamed = surface.renameSelected('  Hero  ');
    expect(renamed.selected).toEqual({ id: selectedId, name: 'Hero' });
    expect(renamed.inspector?.name).toBe('Hero');
    expect(scene.entities.get(toEntityId(selectedId))!.name).toBe('Hero');

    // Hide through the surface: BOTH records move together — and the runtime's own picker then skips
    // the hidden body, so the registry and the ray agree about what is on screen.
    const hidden = surface.setSelectedVisible(false);
    const entity = scene.entities.get(toEntityId(selectedId))!;
    expect(entity.visible).toBe(false);
    expect(entity.threeObject.visible).toBe(false);
    expect(hidden.inspector?.visible).toBe(false);
    expect(hidden.selected).toEqual({ id: selectedId, name: 'Hero' });

    // Show it again and every record says so.
    const shown = surface.setSelectedVisible(true);
    expect(scene.entities.get(toEntityId(selectedId))!.visible).toBe(true);
    expect(scene.entities.get(toEntityId(selectedId))!.threeObject.visible).toBe(true);
    expect(shown.inspector?.visible).toBe(true);
  });

  // M5 v199 — the components half, on the SHIPPED runtime: components enter through the runtime's own
  // `addComponent`, and the inspector reads the live registry — so what the report states is what the
  // registry holds, in the order it holds it, not a shadow the surface keeps.
  it('the inspector reads the component registry the runtime owns — added, disabled, removed, live', () => {
    const headless = headlessRuntime();
    runtime = headless.runtime;
    const adapter: SceneAdapterLike = {
      placeCamera(sceneId: string, cameraId: string, position: SceneVec3, lookAt: SceneVec3) {
        const found = headless.runtime.getScene(toSceneId(sceneId))?.cameras.get(toCameraId(cameraId));
        if (!found) return false;
        found.threeCamera.position.set(position.x, position.y, position.z);
        found.threeCamera.lookAt(new THREE.Vector3(lookAt.x, lookAt.y, lookAt.z));
        found.threeCamera.updateMatrixWorld(true);
        return true;
      },
      pickAt(sceneId: string, nx: number, ny: number) {
        return headless.runtime.pickAt(toSceneId(sceneId), nx, ny);
      },
    };
    const surface = createStudioScene(headless.runtime, () => {}, adapter);
    headless.runtime.resize(800, 600);
    const picked = surface.pickAt(400, 300);
    expect(picked.selected?.name).toBe('Cube B');
    const scene = headless.runtime.getScene(toSceneId(surface.sceneId))!;
    const entity = scene.entities.get(toEntityId(surface.bodyIds[2]!))!;

    // The Studio builds no components, so the honest baseline is an empty fact — stated, not missing.
    expect(surface.report().inspector?.components).toEqual([]);

    headless.runtime.addComponent(entity, { type: 'health', data: { amount: 100 }, enabled: true });
    const added = surface.report().inspector;
    expect(added?.components).toEqual([{ name: 'health', enabled: true }]);

    headless.runtime.addComponent(entity, { type: 'shield', data: {}, enabled: false });
    expect(surface.report().inspector?.components).toEqual([
      { name: 'health', enabled: true },
      { name: 'shield', enabled: false },
    ]);

    // The registry is the owner: removing through the runtime moves the next report.
    expect(headless.runtime.removeComponent(entity, 'health')).toBe(true);
    expect(surface.report().inspector?.components).toEqual([{ name: 'shield', enabled: false }]);
  });

  // M5 v200 — the component toggle verb: the surface flips a component's enabled flag through the host
  // gate and the inspector re-reads the live registry at once.
  it('the component toggle flips the enabled flag through the host gate — the report follows the live registry', () => {
    const headless = headlessRuntime();
    runtime = headless.runtime;
    const adapter: SceneAdapterLike = {
      placeCamera(sceneId: string, cameraId: string, position: SceneVec3, lookAt: SceneVec3) {
        const found = headless.runtime.getScene(toSceneId(sceneId))?.cameras.get(toCameraId(cameraId));
        if (!found) return false;
        found.threeCamera.position.set(position.x, position.y, position.z);
        found.threeCamera.lookAt(new THREE.Vector3(lookAt.x, lookAt.y, lookAt.z));
        found.threeCamera.updateMatrixWorld(true);
        return true;
      },
      pickAt(sceneId: string, nx: number, ny: number) {
        return headless.runtime.pickAt(toSceneId(sceneId), nx, ny);
      },
    };
    const surface = createStudioScene(headless.runtime, () => {}, adapter);
    headless.runtime.resize(800, 600);
    const picked = surface.pickAt(400, 300);
    expect(picked.selected?.name).toBe('Cube B');
    const scene = headless.runtime.getScene(toSceneId(surface.sceneId))!;
    const entity = scene.entities.get(toEntityId(surface.bodyIds[2]!))!;

    // Add two components: one enabled, one disabled.
    headless.runtime.addComponent(entity, { type: 'health', data: { amount: 100 }, enabled: true });
    headless.runtime.addComponent(entity, { type: 'shield', data: {}, enabled: false });
    expect(surface.report().inspector?.components).toEqual([
      { name: 'health', enabled: true },
      { name: 'shield', enabled: false },
    ]);

    // Toggle health OFF through the surface: the report re-reads the live registry.
    const afterHealthOff = surface.toggleComponentEnabled('health');
    expect(afterHealthOff.inspector?.components).toEqual([
      { name: 'health', enabled: false },
      { name: 'shield', enabled: false },
    ]);

    // Toggle shield ON: both are now enabled.
    const afterShieldOn = surface.toggleComponentEnabled('shield');
    expect(afterShieldOn.inspector?.components).toEqual([
      { name: 'health', enabled: false },
      { name: 'shield', enabled: true },
    ]);

    // Toggle a non-existent component: the report is unchanged (no selection or no such component).
    const noChange = surface.toggleComponentEnabled('ghost');
    expect(noChange.inspector?.components).toEqual([
      { name: 'health', enabled: false },
      { name: 'shield', enabled: true },
    ]);
  });

  // M5 v201 — enabled gates query participation: getEnabledComponents returns only enabled components,
  // disabled ones are stored but invisible to iteration.
  it('getEnabledComponents filters out disabled components — the enabled flag gates queries, not storage', () => {
    const headless = headlessRuntime();
    runtime = headless.runtime;
    const adapter: SceneAdapterLike = {
      placeCamera(sceneId: string, cameraId: string, position: SceneVec3, lookAt: SceneVec3) {
        const found = headless.runtime.getScene(toSceneId(sceneId))?.cameras.get(toCameraId(cameraId));
        if (!found) return false;
        found.threeCamera.position.set(position.x, position.y, position.z);
        found.threeCamera.lookAt(new THREE.Vector3(lookAt.x, lookAt.y, lookAt.z));
        return true;
      },
      pickAt(sceneId: string, nx: number, ny: number) {
        return headless.runtime.pickAt(toSceneId(sceneId), nx, ny);
      },
    };
    const surface = createStudioScene(runtime, () => {}, adapter);
    headless.runtime.resize(800, 600);
    surface.pickAt(400, 300);
    const scene = headless.runtime.getScene(toSceneId(surface.sceneId))!;
    const entity = scene.entities.get(toEntityId(surface.bodyIds[2]!))!;

    // Add three components: two enabled, one disabled.
    runtime.addComponent(entity, { type: 'health', data: { amount: 100 }, enabled: true });
    runtime.addComponent(entity, { type: 'shield', data: {}, enabled: false });
    runtime.addComponent(entity, { type: 'stamina', data: { current: 50 }, enabled: true });

    // All three are stored.
    expect(entity.components.size).toBe(3);

    // Only two are visible to queries.
    const enabled = runtime.getEnabledComponents?.(entity);
    expect(enabled).toBeDefined();
    expect(enabled!.length).toBe(2);
    expect(enabled!.map((c) => c.type)).toEqual(['health', 'stamina']);

    // Disable health — now only stamina is queryable.
    runtime.setComponentEnabled?.(toSceneId(surface.sceneId), entity.id, 'health', false);
    const afterHealthOff = runtime.getEnabledComponents?.(entity);
    expect(afterHealthOff?.length).toBe(1);
    expect(afterHealthOff?.[0]?.type).toBe('stamina');

    // Re-enable shield — back to two queryable.
    runtime.setComponentEnabled?.(toSceneId(surface.sceneId), entity.id, 'shield', true);
    const afterShieldOn = runtime.getEnabledComponents?.(entity);
    expect(afterShieldOn?.length).toBe(2);
    // Order follows Map insertion order: health(first), shield(second), stamina(third) → after health disabled: [shield, stamina]
    expect(afterShieldOn?.map((c) => c.type)).toEqual(['shield', 'stamina']);
  });

  // M5 v202 — enabled gates material visibility: when a component with a targetObject is disabled,
  // its visual target is hidden in the scene. The flag now controls rendering, not just queries.
  it('setComponentEnabled hides the component’s targetObject — enabled gates rendering, not just storage', () => {
    const headless = headlessRuntime();
    runtime = headless.runtime;
    const adapter: SceneAdapterLike = {
      placeCamera(sceneId: string, cameraId: string, position: SceneVec3, lookAt: SceneVec3) {
        const found = headless.runtime.getScene(toSceneId(sceneId))?.cameras.get(toCameraId(cameraId));
        if (!found) return false;
        found.threeCamera.position.set(position.x, position.y, position.z);
        found.threeCamera.lookAt(new THREE.Vector3(lookAt.x, lookAt.y, lookAt.z));
        return true;
      },
      pickAt(sceneId: string, nx: number, ny: number) {
        return headless.runtime.pickAt(toSceneId(sceneId), nx, ny);
      },
    };
    const surface = createStudioScene(runtime, () => {}, adapter);
    headless.runtime.resize(800, 600);
    surface.pickAt(400, 300);
    const scene = headless.runtime.getScene(toSceneId(surface.sceneId))!;
    const entity = scene.entities.get(toEntityId(surface.bodyIds[2]!))!;

    // Add a component WITH a targetObject (the entity's own threeObject).
    runtime.addComponent(entity, { type: 'health', data: { amount: 100 }, enabled: true, targetObject: entity.threeObject });
    
    // The target starts visible.
    expect(entity.threeObject.visible).toBe(true);

    // Disable the component — the target should be hidden.
    runtime.setComponentEnabled?.(toSceneId(surface.sceneId), entity.id, 'health', false);
    expect(entity.threeObject.visible).toBe(false);

    // Re-enable — the target becomes visible again.
    runtime.setComponentEnabled?.(toSceneId(surface.sceneId), entity.id, 'health', true);
    expect(entity.threeObject.visible).toBe(true);

    // A component without a targetObject does nothing when toggled (no crash, no change).
    runtime.addComponent(entity, { type: 'shield', data: {}, enabled: true });
    runtime.setComponentEnabled?.(toSceneId(surface.sceneId), entity.id, 'shield', false);
    // No targetObject means no visible property to change — the flag still updates.
    const comp = entity.components.get('shield');
    expect(comp?.enabled).toBe(false);
  });

  it('every body the surface hands the frame write is a REAL three.js object it can move', () => {
    const headless = headlessRuntime();
    runtime = headless.runtime;
    const writes: { ids: string[]; moved: number }[] = [];

    const surface = createStudioScene(headless.runtime, (ids) => {
      const scene = headless.runtime.getScene(toSceneId(surface.sceneId))!;
      let moved = 0;
      for (const id of ids) {
        const entity = scene.entities.get(toEntityId(id));
        if (!entity) continue;
        // This is the write the component performs. A structural interface naming `object3D` (or a
        // plain `{x,y,z}` position) would have compiled and failed here.
        expect(entity.threeObject).toBeInstanceOf(THREE.Object3D);
        entity.threeObject.rotation.y = 1;
        entity.threeObject.position.y = 0.5;
        moved += 1;
      }
      writes.push({ ids, moved });
    });

    surface.step(1);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.moved).toBe(4);
    const scene = headless.runtime.getScene(toSceneId(surface.sceneId))!;
    for (const id of surface.bodyIds) {
      const entity = scene.entities.get(toEntityId(id))!;
      expect(entity.threeObject.rotation.y).toBe(1);
      expect(entity.threeObject.position.y).toBe(0.5);
    }
  });

  it('the camera the runtime hands back is a THREE.Camera the component can AIM', () => {
    const headless = headlessRuntime();
    runtime = headless.runtime;
    const built = buildDemoScene(headless.runtime);

    const aimed = aimCamera(headless.runtime, built.sceneId, built.cameraId);
    expect(aimed).toBeInstanceOf(THREE.Camera);
    expect(aimed!.position.toArray()).toEqual([
      STUDIO_CAMERA_POSITION.x,
      STUDIO_CAMERA_POSITION.y,
      STUDIO_CAMERA_POSITION.z,
    ]);
    // An aimed camera has a finite, non-degenerate world matrix — a camera left at the origin looking
    // down -Z is still a camera, which is why "it exists" was never the interesting claim.
    expect(aimed!.matrixWorld.determinant()).not.toBe(0);
    const scene = headless.runtime.getScene(toSceneId(built.sceneId))!;
    expect(scene.cameras.get(toCameraId(built.cameraId))!.active).toBe(true);
  });

  it('a frame reaches the backend with the camera the Studio aimed, and the count is the loop’s', () => {
    const headless = headlessRuntime();
    runtime = headless.runtime;
    const surface = createStudioScene(headless.runtime, () => {});
    const aimed = aimCamera(headless.runtime, surface.sceneId, surface.cameraId);
    expect(aimed).not.toBeNull();

    headless.runtime.start();
    headless.scheduler.step();
    headless.runtime.stop();

    const frames = headless.getBackend().frames;
    const drawn = frames[frames.length - 1]!;
    const scene = headless.runtime.getScene(toSceneId(surface.sceneId))!;
    expect(drawn.camera).toBe(aimed);
    expect(drawn.scene).toBe(scene.threeScene);
    // The backend counted what the runtime handed it, lights included — the number a consumer reads.
    expect(drawn.objects).toBeGreaterThanOrEqual(4);
    // The surface's own counter is NOT the backend's `calls`: it counts calls to `step`, which is the
    // loop a reader can ask about with no GPU present.
    expect(surface.step(1).frames).toBe(1);
    expect(surface.report().frames).toBe(1);
  });
});

describe('the selection facts are the LIVE scene’s answer, not the pick’s echo (v192)', () => {
  const SELECTED = { id: 'e1', name: 'Cube A' };

  /** A minimal structural scene: only id/name are required, exactly like the interface says. */
  function sceneWith(entity?: {
    id: string;
    name: string;
    type?: string;
    visible?: boolean;
    position?: SceneVec3;
    transform?: { position?: SceneVec3 };
    components?: unknown;
  }) {
    const entities = new Map<string, NonNullable<typeof entity>>();
    if (entity) entities.set(entity.id, entity);
    return { id: 's1', name: 'Studio Scene', entities, cameras: new Map(), animations: new Map() };
  }

  it('answers null for every honest "nothing to inspect": no selection, no scene, or the body is gone', () => {
    expect(selectionFactsOf(sceneWith({ id: 'e1', name: 'Cube A' }), null)).toBeNull();
    expect(selectionFactsOf(null, SELECTED)).toBeNull();
    expect(selectionFactsOf(sceneWith(), SELECTED)).toBeNull();
  });

  it('reads what the host declares and never invents what it does not: kind unknown, position null, visible true', () => {
    const facts = selectionFactsOf(sceneWith({ id: 'e1', name: 'Cube A' }), SELECTED);
    expect(facts).toEqual({ id: 'e1', name: 'Cube A', kind: 'unknown', position: null, visible: true, components: [] });
  });

  it('a visible:false body is reported hidden, and a non-finite position is a fact the report refuses to state', () => {
    const hidden = selectionFactsOf(sceneWith({ id: 'e1', name: 'Cube A', visible: false }), SELECTED);
    expect(hidden?.visible).toBe(false);
    const drifted = selectionFactsOf(
      sceneWith({ id: 'e1', name: 'Cube A', position: { x: Number.NaN, y: 0, z: 0 } }),
      SELECTED,
    );
    expect(drifted?.position).toBeNull();
  });

  it('the position comes from wherever the host keeps it — top-level or transform.position', () => {
    const top = selectionFactsOf(sceneWith({ id: 'e1', name: 'Cube A', position: { x: 1, y: 2, z: 3 } }), SELECTED);
    expect(top?.position).toEqual({ x: 1, y: 2, z: 3 });
    const nested = selectionFactsOf(
      sceneWith({ id: 'e1', name: 'Cube A', transform: { position: { x: 4, y: 5, z: 6 } } }),
      SELECTED,
    );
    expect(nested?.position).toEqual({ x: 4, y: 5, z: 6 });
    const declared = selectionFactsOf(sceneWith({ id: 'e1', name: 'Cube A', type: 'mesh' }), SELECTED);
    expect(declared?.kind).toBe('mesh');
  });

  // v199 — the components half of the bounds, read LOOSELY: the live runtime keeps a Map, the save
  // shape is an entry array (v119: a Map is not JSON), and a stringify accident arrives as an object.
  // All three spellings are one registry; the reader answers all three, in the registry's own order.
  it('components read from the live registry in the host’s own order, enabled by the default rule', () => {
    const mapHost = new Map<string, { type: string; enabled: boolean }>([
      ['health', { type: 'health', enabled: true }],
      ['mana', { type: 'mana', enabled: false }],
    ]);
    const fromMap = selectionFactsOf(sceneWith({ id: 'e1', name: 'Cube A', components: mapHost }), SELECTED);
    expect(fromMap?.components).toEqual([
      { name: 'health', enabled: true },
      { name: 'mana', enabled: false },
    ]);
    const entryArray = selectionFactsOf(
      sceneWith({
        id: 'e1',
        name: 'Cube A',
        components: [
          ['stamina', { type: 'stamina', enabled: true }],
          ['shield', { type: 'shield', enabled: false }],
        ],
      }),
      SELECTED,
    );
    expect(entryArray?.components).toEqual([
      { name: 'stamina', enabled: true },
      { name: 'shield', enabled: false },
    ]);
    const objectHost = selectionFactsOf(
      sceneWith({ id: 'e1', name: 'Cube A', components: { health: { type: 'health', enabled: true } } }),
      SELECTED,
    );
    expect(objectHost?.components).toEqual([{ name: 'health', enabled: true }]);
  });

  it('a component filed under one name that calls itself another answers the name the VALUE carries; a nameless one answers its key', () => {
    const mismatched = selectionFactsOf(
      sceneWith({ id: 'e1', name: 'Cube A', components: [['key-name', { type: 'value-type', enabled: true }]] }),
      SELECTED,
    );
    expect(mismatched?.components).toEqual([{ name: 'value-type', enabled: true }]);
    const nameless = selectionFactsOf(
      sceneWith({ id: 'e1', name: 'Cube A', components: [['filed-as', { enabled: false }]] }),
      SELECTED,
    );
    expect(nameless?.components).toEqual([{ name: 'filed-as', enabled: false }]);
    // A registry the host never declared — or one holding garbage — answers none, not an invented row.
    expect(selectionFactsOf(sceneWith({ id: 'e1', name: 'Cube A' }), SELECTED)?.components).toEqual([]);
    const garbage = selectionFactsOf(sceneWith({ id: 'e1', name: 'Cube A', components: 42 }), SELECTED);
    expect(garbage?.components).toEqual([]);
  });
});
