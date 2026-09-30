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
  STUDIO_CAMERA_LOOK_AT,
  STUDIO_CAMERA_POSITION,
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
