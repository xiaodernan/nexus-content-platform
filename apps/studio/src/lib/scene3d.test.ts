import { describe, expect, it } from 'vitest';
import {
  buildDemoScene,
  buildSceneReport,
  composeDocumentOps,
  createStudioScene,
  spinAt,
  STUDIO_CAMERA_LOOK_AT,
  STUDIO_ORBIT_DEFAULT,
  ORBIT_DISTANCE_MAX,
  ORBIT_DISTANCE_MIN,
  ORBIT_ELEVATION_LIMIT,
  orbitToPlacement,
  orbitFromPlacement,
  applyOrbit,
  applyPan,
  ndcFromPixel,
  normalizeAngle,
  nextBodyPlacement,
  ORBIT_PAN_LIMIT,
  type OrbitState,
  STUDIO_CAMERA_POSITION,
  type SceneAdapterLike,
  type SceneComposerLike,
  type SceneLike,
  type SceneSaveFile,
  type SceneSaverLike,
  type SceneVec3,
} from './scene3d';
import { applyOp, createEmptyDocument, invertOp } from '@nexus/design-model';

/**
 * M5 v142 — the Studio's 3D surface, PURE half.
 *
 * These cases run with NO React, NO DOM and NO three.js, which is the point of the split: the two
 * claims a reviewer cares about — what scene the Studio composes, and what the runtime's state is —
 * are functions of a narrow structural interface. What they can NOT prove is that the real package
 * answers these calls the same way; that is `scene3dSurface.test.ts`, which runs the shipped
 * `ThreeRuntime` through this same module on the headless seam.
 *
 * v163 extends the same discipline to persistence and the document: the save/load seam is answered by
 * a recording fake here (the REAL file format is proven against the shipped runtime in the headless
 * proof), while `composeDocumentOps` is asserted against the REAL design model — the op it returns is
 * applied to a real document, inverted, and re-applied, because an op that only the suite believes in
 * would be a button that does nothing on a real page.
 */

function fakeRuntime(over: Partial<SceneComposerLike> = {}) {
  const scenes = new Map<string, SceneLike>();
  const created: { scene: string; name: string; type: string; position: unknown }[] = [];
  let seq = 0;
  const id = (p: string) => `${p}-${++seq}`;

  const base: SceneComposerLike = {
    createScene(name) {
      const scene: SceneLike = {
        id: id('scene'),
        name,
        entities: new Map(),
        cameras: new Map(),
        animations: new Map(),
      };
      scenes.set(scene.id, scene);
      return scene;
    },
    createEntity(sceneId, name, type, _geometry, _material, position) {
      created.push({ scene: sceneId, name, type, position });
      const scene = scenes.get(sceneId)!;
      const entity = { id: id('entity'), name };
      scene.entities.set(entity.id, entity);
      return entity;
    },
    createCamera(sceneId, name) {
      const scene = scenes.get(sceneId)!;
      const camera = { id: id('camera'), name, active: scene.cameras.size === 0 };
      scene.cameras.set(camera.id, camera);
      return camera;
    },
    removeEntity(sceneId, entityId) {
      const scene = scenes.get(sceneId);
      if (!scene) return false;
      const entity = scene.entities.get(entityId);
      if (!entity) return false;
      scene.entities.delete(entityId);
      // Keep the recorder consistent with the graph, so an assertion about what was CREATED still means
      // what it says after a removal.
      const at = created.findIndex((c) => c.scene === sceneId && c.name === entity.name);
      if (at !== -1) created.splice(at, 1);
      return true;
    },
    getScene(sceneId) {
      return scenes.get(sceneId);
    },
    getSceneGraph() {
      return { scenes, activeSceneId: [...scenes.keys()][0] ?? null, stats: { drawCalls: 0, triangles: 0, points: 0, lines: 0 } };
    },
    getBackend() {
      return { kind: 'headless', state: { width: 800, height: 600, pixelRatio: 1 } };
    },
  };
  return { runtime: { ...base, ...over } as SceneComposerLike, scenes, created };
}

/** A recorder for the camera write, so the pure suite can assert the adapter was ASKED, in order. */
function fakeAdapter(): SceneAdapterLike & { placed: { sceneId: string; cameraId: string; position: SceneVec3; lookAt: SceneVec3 }[] } {
  const placed: { sceneId: string; cameraId: string; position: SceneVec3; lookAt: SceneVec3 }[] = [];
  return {
    placed,
    placeCamera(sceneId, cameraId, position, lookAt) {
      placed.push({ sceneId, cameraId, position, lookAt });
      return true;
    },
  };
}

/** M5 v163 — a recording saver: it answers in the runtime's own format and remembers what it was asked. */
function fakeSaver() {
  const saved: { sceneId: string; savedAt: number }[] = [];
  const loaded: { sceneId: string; file: SceneSaveFile }[] = [];
  const saver: SceneSaverLike = {
    buildSaveFile(sceneId, savedAt) {
      saved.push({ sceneId, savedAt });
      return {
        format: 'nexus-three-runtime-save',
        version: 1,
        savedAt,
        carries: ['entities', 'npcs', 'worldState', 'player', 'cinematic'],
        doesNotCarry: [{ field: 'videoTextures', needs: 'a video system' }],
        entities: [
          ['e-1', { id: 'e-1', name: 'Ground' }],
          ['e-2', { id: 'e-2', name: 'Cube D' }],
        ],
        npcs: [],
        worldState: { hour: 9 },
        player: null,
        cinematic: { sequences: [] },
      };
    },
    loadSaveFile(file, sceneId) {
      loaded.push({ sceneId, file });
      return {
        sceneId,
        entities: file.entities.map(([id]) => id),
        npcs: [],
        sequences: [],
        worldState: Object.keys(file.worldState ?? {}),
        player: null,
        carries: [...file.carries],
      };
    },
  };
  return { saver, saved, loaded };
}

describe('buildDemoScene — what the Studio puts on screen', () => {
  it('composes one named scene with four bodies and one camera', () => {
    const { runtime, scenes, created } = fakeRuntime();
    const built = buildDemoScene(runtime);

    expect(scenes.size).toBe(1);
    expect(runtime.getScene(built.sceneId)!.name).toBe('Studio Scene');
    expect(built.bodyIds).toHaveLength(4);
    expect(created.map((c) => c.name)).toEqual(['Ground', 'Cube A', 'Cube B', 'Cube C']);
    // The ground is the only body below the origin — that is what makes it read as a ground.
    expect(created[0]!.position).toEqual({ x: 0, y: -1, z: 0 });
    expect(created.filter((c) => c.type === 'mesh')).toHaveLength(4);
  });

  it('gives every body a DISTINCT position, so no two boxes occupy one place', () => {
    const { runtime, created } = fakeRuntime();
    buildDemoScene(runtime);
    const seen = created.map((c) => JSON.stringify(c.position));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('the camera it returns is the scene’s active one', () => {
    const { runtime } = fakeRuntime();
    const built = buildDemoScene(runtime);
    const cameras = [...runtime.getScene(built.sceneId)!.cameras.values()];
    expect(cameras).toHaveLength(1);
    expect(cameras[0]!.id).toBe(built.cameraId);
    expect(cameras[0]!.active).toBe(true);
  });

  it('aims that camera through the adapter, naming the scene and camera it just made', () => {
    const { runtime } = fakeRuntime();
    const adapter = fakeAdapter();
    const built = buildDemoScene(runtime, adapter);

    expect(adapter.placed).toHaveLength(1);
    expect(adapter.placed[0]!.sceneId).toBe(built.sceneId);
    expect(adapter.placed[0]!.cameraId).toBe(built.cameraId);
    expect(adapter.placed[0]!.position).toEqual(STUDIO_CAMERA_POSITION);
    expect(adapter.placed[0]!.lookAt).toEqual(STUDIO_CAMERA_LOOK_AT);
    // A camera the bodies can be seen FROM, at a target that is not the camera's own position.
    expect(STUDIO_CAMERA_POSITION).not.toEqual(STUDIO_CAMERA_LOOK_AT);
  });

  it('composes with NO adapter at all — a host without three.js is not a broken host', () => {
    const { runtime } = fakeRuntime();
    expect(() => buildDemoScene(runtime)).not.toThrow();
  });
});

describe('buildSceneReport — the runtime’s state, as a plain report', () => {
  it('reports the active scene the GRAPH names, with its real counts and names', () => {
    const { runtime } = fakeRuntime();
    const built = buildDemoScene(runtime);
    const report = buildSceneReport(runtime, 7);

    expect(report.schema).toBe(1);
    expect(report.scenes).toBe(1);
    expect(report.activeSceneId).toBe(built.sceneId);
    expect(report.scene).toMatchObject({
      id: built.sceneId,
      name: 'Studio Scene',
      entities: 4,
      cameras: 1,
      animations: 0,
      entityNames: ['Ground', 'Cube A', 'Cube B', 'Cube C'],
      cameraNames: ['Studio Camera'],
      activeCamera: built.cameraId,
    });
  });

  it('reports the frame count it was GIVEN, and never invents one', () => {
    const { runtime } = fakeRuntime();
    buildDemoScene(runtime);
    expect(buildSceneReport(runtime, 0).frames).toBe(0);
    expect(buildSceneReport(runtime, 123).frames).toBe(123);
  });

  it('an empty runtime answers with nulls rather than a fabricated scene', () => {
    const { runtime } = fakeRuntime();
    const report = buildSceneReport(runtime, 0);
    expect(report.scenes).toBe(0);
    expect(report.scene).toBeNull(); // not "a scene with zero bodies"
    expect(report.activeSceneId).toBeNull();
  });

  it('reports the backend kind and the surface it draws into', () => {
    const { runtime } = fakeRuntime();
    buildDemoScene(runtime);
    const report = buildSceneReport(runtime, 1);
    expect(report.backend).toBe('headless');
    expect(report.pixels).toEqual({ width: 800, height: 600, pixelRatio: 1 });
  });

  it('a runtime with NO backend reports null, which is not the same as zero pixels', () => {
    const { runtime } = fakeRuntime({ getBackend: () => null });
    buildDemoScene(runtime);
    const report = buildSceneReport(runtime, 0);
    expect(report.backend).toBeNull();
    expect(report.pixels).toBeNull();
  });

  it('the draw tallies come from the graph’s own stats, and default to zero when it has none', () => {
    const withStats = fakeRuntime({
      getSceneGraph: () => ({
        scenes: new Map(),
        activeSceneId: null,
        stats: { drawCalls: 12, triangles: 340, points: 0, lines: 3 },
      }),
    });
    expect(buildSceneReport(withStats.runtime, 0).draws).toEqual({ calls: 12, triangles: 340, points: 0, lines: 3 });

    const without = fakeRuntime({
      getSceneGraph: () => ({ scenes: new Map(), activeSceneId: null }),
    });
    expect(buildSceneReport(without.runtime, 0).draws).toEqual({ calls: 0, triangles: 0, points: 0, lines: 0 });
  });
});

describe("createStudioScene — the loop's arithmetic, owned by the model", () => {
  it('counts its OWN frames, one per step, starting from the count it was handed', () => {
    const { runtime } = fakeRuntime();
    const writes: number[] = [];
    const surface = createStudioScene(runtime, (_ids, motion) => writes.push(motion.y), undefined, 5);

    expect(surface.frames).toBe(5);
    expect(surface.report().frames).toBe(5);
    expect(surface.step(1).frames).toBe(6);
    expect(surface.step(2).frames).toBe(7);
    expect(surface.frames).toBe(7);
    expect(writes).toHaveLength(2);
  });

  it('hands the frame write the composed BODY ids and the motion for the instant it was given', () => {
    const { runtime } = fakeRuntime();
    const seen: { ids: string[]; motion: { y: number; bob: number } }[] = [];
    const surface = createStudioScene(runtime, (ids, motion) => seen.push({ ids, motion }));

    surface.step(2.5);
    expect(seen[0]!.ids).toEqual(surface.bodyIds);
    expect(seen[0]!.motion).toEqual(spinAt(2.5));
    // The write is the ONLY place a body moves, so two surfaces stepped to the same instant agree —
    // which is what makes the harness able to predict a frame it never saw.
    const otherMotions: { y: number; bob: number }[] = [];
    const other = createStudioScene(fakeRuntime().runtime, (_ids, motion) => otherMotions.push(motion));
    other.step(2.5);
    expect(otherMotions[0]).toEqual(seen[0]!.motion);
  });

  it('reports the scene it composed, and never a second one', () => {
    const { runtime, scenes } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {});
    const report = surface.report();
    expect(scenes.size).toBe(1);
    expect(report.scene!.id).toBe(surface.sceneId);
    expect(report.scene!.activeCamera).toBe(surface.cameraId);
  });
});

describe('spinAt — the animation is a function of TIME, not of a frame counter', () => {
  it('is deterministic for one instant and monotonic in the spin', () => {
    expect(spinAt(0)).toEqual({ y: 0, bob: 0 });
    expect(spinAt(1).y).toBeCloseTo(0.8, 12);
    expect(spinAt(2).y).toBeGreaterThan(spinAt(1).y);
    // Two calls at the same instant agree — so a harness can predict what it will see.
    expect(spinAt(3.5)).toEqual(spinAt(3.5));
  });

  it('the bob stays inside the amplitude, so a body never leaves its slot', () => {
    for (let t = 0; t < 20; t += 0.13) {
      expect(Math.abs(spinAt(t).bob)).toBeLessThanOrEqual(0.25 + 1e-12);
    }
  });
});

describe('the camera orbit — v142’s fixed placement becomes a default rather than the only view', () => {
  it('the DEFAULT orbit round-trips to the position v142 hard-coded', () => {
    // This is what makes the increment non-breaking: the Studio opens on exactly the view it opened on
    // before, and the orbit is derived from the constants rather than restating their numbers.
    const { position, lookAt } = orbitToPlacement(STUDIO_ORBIT_DEFAULT, STUDIO_CAMERA_LOOK_AT);
    expect(position.x).toBeCloseTo(STUDIO_CAMERA_POSITION.x, 10);
    expect(position.y).toBeCloseTo(STUDIO_CAMERA_POSITION.y, 10);
    expect(position.z).toBeCloseTo(STUDIO_CAMERA_POSITION.z, 10);
    expect(lookAt).toEqual(STUDIO_CAMERA_LOOK_AT);
  });

  it('orbitFromPlacement is the inverse of orbitToPlacement', () => {
    for (const orbit of [
      { azimuth: 0, elevation: 0, distance: 5, panX: 0, panZ: 0 },
      { azimuth: 1.2, elevation: -0.6, distance: 12, panX: 0, panZ: 0 },
      { azimuth: -2.9, elevation: 1.1, distance: 30, panX: 0, panZ: 0 },
    ] as OrbitState[]) {
      const back = orbitFromPlacement(orbitToPlacement(orbit, STUDIO_CAMERA_LOOK_AT).position, STUDIO_CAMERA_LOOK_AT);
      expect(back.azimuth).toBeCloseTo(orbit.azimuth, 10);
      expect(back.elevation).toBeCloseTo(orbit.elevation, 10);
      expect(back.distance).toBeCloseTo(orbit.distance, 10);
    }
  });

  it('the camera keeps its DISTANCE from the target wherever it orbits', () => {
    // The property that makes it an orbit rather than a drift: turning the camera must not also move it
    // closer or further away.
    for (let i = 0; i < 24; i++) {
      const orbit = { azimuth: (i * Math.PI) / 12, elevation: ((i % 7) - 3) * 0.3, distance: 9, panX: 0, panZ: 0 };
      const { position } = orbitToPlacement(orbit, STUDIO_CAMERA_LOOK_AT);
      const d = Math.hypot(
        position.x - STUDIO_CAMERA_LOOK_AT.x,
        position.y - STUDIO_CAMERA_LOOK_AT.y,
        position.z - STUDIO_CAMERA_LOOK_AT.z,
      );
      expect(d).toBeCloseTo(9, 10);
    }
  });

  it('normalizeAngle folds into (−π, π] and leaves an angle already inside it alone', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(0.5)).toBeCloseTo(0.5, 12);
    expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(normalizeAngle(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1, 12);
    expect(normalizeAngle(-Math.PI - 0.1)).toBeCloseTo(Math.PI - 0.1, 12);
    // Ten full turns is still one angle, not a number that grows with how much the user has dragged.
    expect(Math.abs(normalizeAngle(Math.PI * 20 + 0.3))).toBeLessThanOrEqual(Math.PI);
    expect(normalizeAngle(Math.PI * 20 + 0.3)).toBeCloseTo(0.3, 10);
  });

  it('applyOrbit clamps elevation at the poles and distance at its range', () => {
    const flat: OrbitState = { azimuth: 0, elevation: 0, distance: 10, panX: 0, panZ: 0 };
    expect(applyOrbit(flat, { elevation: 10 }).elevation).toBeCloseTo(ORBIT_ELEVATION_LIMIT, 12);
    expect(applyOrbit(flat, { elevation: -10 }).elevation).toBeCloseTo(-ORBIT_ELEVATION_LIMIT, 12);
    expect(applyOrbit(flat, { distance: 1000 }).distance).toBe(ORBIT_DISTANCE_MAX);
    expect(applyOrbit(flat, { distance: -1000 }).distance).toBe(ORBIT_DISTANCE_MIN);
    // A delta that names nothing changes nothing, and the result is a new object rather than the same one.
    const same = applyOrbit(flat, {});
    expect(same).toEqual(flat);
    expect(same).not.toBe(flat);
  });

  it('applyOrbit FOLDS azimuth rather than clamping it — it has no natural bound', () => {
    const spun = applyOrbit({ azimuth: Math.PI - 0.05, elevation: 0, distance: 10, panX: 0, panZ: 0 }, { azimuth: 0.1 });
    expect(spun.azimuth).toBeCloseTo(-Math.PI + 0.05, 10); // wrapped, not pinned at π
  });

  it('nextBodyPlacement gives every added body its own place', () => {
    const places = Array.from({ length: 6 }, (_, i) => nextBodyPlacement(i));
    const keys = places.map((p) => [p.x.toFixed(6), p.z.toFixed(6)].join(':'));
    expect(new Set(keys).size).toBe(places.length);
    // And none of them sits at the origin, where the composed shots already are.
    for (const p of places) expect(Math.hypot(p.x, p.z)).toBeCloseTo(2.6, 10);
  });
});

describe('pan — the camera rig slides across the ground (M5 v181)', () => {
  it('applyPan converts CAMERA-relative deltas with the orbit’s own azimuth', () => {
    // Facing −Z (azimuth 0): "forward" is −Z, "right" is +X.
    const facing = applyPan(
      { azimuth: 0, elevation: 0.3, distance: 8, panX: 0, panZ: 0 },
      { forward: 0.5, right: 0.5 },
    );
    expect(facing.panX).toBeCloseTo(0.5, 10);
    expect(facing.panZ).toBeCloseTo(-0.5, 10);
    // Facing +X (azimuth π/2): "forward" is now −X — the WORLD axis moved with the camera, which is what
    // makes W mean "into the screen" instead of "north".
    const turned = applyPan({ azimuth: Math.PI / 2, elevation: 0, distance: 8, panX: 0, panZ: 0 }, { forward: 0.5 });
    expect(turned.panX).toBeCloseTo(-0.5, 10);
    expect(turned.panZ).toBeCloseTo(0, 10);
    // A pan turns nothing and zooms nothing.
    expect(turned.azimuth).toBe(Math.PI / 2);
    expect(turned.elevation).toBe(0);
    expect(turned.distance).toBe(8);
  });

  it('applyPan clamps each axis independently at ±ORBIT_PAN_LIMIT', () => {
    const panned = applyPan(
      { azimuth: 0.7, elevation: 0, distance: 8, panX: 0, panZ: 0 },
      { forward: 1000, right: -1000 },
    );
    expect(panned.panX).toBeCloseTo(-ORBIT_PAN_LIMIT, 10);
    expect(panned.panZ).toBeCloseTo(-ORBIT_PAN_LIMIT, 10);
    // One wall stops its own axis; the other keeps its room.
    const atWall = applyPan({ azimuth: 0, elevation: 0, distance: 8, panX: ORBIT_PAN_LIMIT, panZ: 0 }, { right: 5 });
    expect(atWall.panX).toBe(ORBIT_PAN_LIMIT);
    expect(atWall.panZ).toBe(0);
  });

  it('orbitBy preserves the pan offsets — turning never moves what the camera looks at', () => {
    const panned = applyPan({ azimuth: 0, elevation: 0, distance: 8, panX: 0, panZ: 0 }, { right: 3 });
    const turned = applyOrbit(panned, { azimuth: 1, elevation: 0.2 });
    expect(turned.panX).toBe(panned.panX);
    expect(turned.panZ).toBe(panned.panZ);
  });

  it('orbitToPlacement pans the whole rig: lookAt moves WITH the camera', () => {
    const orbit: OrbitState = { azimuth: 0.9, elevation: 0.4, distance: 7, panX: 2, panZ: -3 };
    const { position, lookAt } = orbitToPlacement(orbit, STUDIO_CAMERA_LOOK_AT);
    expect(lookAt.x).toBeCloseTo(STUDIO_CAMERA_LOOK_AT.x + 2, 10);
    expect(lookAt.z).toBeCloseTo(STUDIO_CAMERA_LOOK_AT.z - 3, 10);
    // And the camera stands exactly `distance` from the PANNED anchor — pan changes neither the turn
    // nor the reach.
    const d = Math.hypot(position.x - lookAt.x, position.y - lookAt.y, position.z - lookAt.z);
    expect(d).toBeCloseTo(7, 10);
  });

  it('the DEFAULT orbit carries no pan, so the opening view is unchanged', () => {
    expect(STUDIO_ORBIT_DEFAULT.panX).toBe(0);
    expect(STUDIO_ORBIT_DEFAULT.panZ).toBe(0);
  });

  it('panBy moves the surface’s orbit and aims the adapter at the PANNED target', () => {
    const aims: { position: SceneVec3; lookAt: SceneVec3 }[] = [];
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {}, {
      placeCamera: (_s, _c, position, lookAt) => {
        aims.push({ position, lookAt });
        return true;
      },
    });

    const before = aims.length;
    const report = surface.panBy({ right: 2, forward: -1 });
    expect(aims.length).toBe(before + 1);
    expect(report.frames).toBe(surface.frames); // sliding the view is not a frame
    // The world deltas come from the camera-relative input through the azimuth the surface holds —
    // re-derived here from the documented vectors, not read back out of `applyPan`.
    const az = surface.orbit.azimuth;
    expect(surface.orbit.panX).toBeCloseTo(2 * Math.cos(az) + Math.sin(az), 10);
    expect(surface.orbit.panZ).toBeCloseTo(-2 * Math.sin(az) + Math.cos(az), 10);
    // And the placement handed to the adapter is the one the panned orbit describes.
    const expected = orbitToPlacement(surface.orbit, STUDIO_CAMERA_LOOK_AT);
    expect(aims[aims.length - 1]!.lookAt.x).toBeCloseTo(expected.lookAt.x, 10);
    expect(aims[aims.length - 1]!.lookAt.z).toBeCloseTo(expected.lookAt.z, 10);
  });

  it('resetOrbit clears the pan — back to the view the Studio opens with', () => {
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {}, { placeCamera: () => true });
    surface.panBy({ forward: 4, right: 4 });
    expect(surface.orbit).not.toEqual(STUDIO_ORBIT_DEFAULT);
    surface.resetOrbit();
    expect(surface.orbit).toEqual(STUDIO_ORBIT_DEFAULT);
  });
});

describe('the surface is CONTROLLABLE — orbit, zoom, and add/remove a body (M5 v161)', () => {
  it('orbitBy moves the camera through the adapter, and the surface reports the new orbit', () => {
    const aims: { position: SceneVec3; lookAt: SceneVec3 }[] = [];
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {}, {
      placeCamera: (_s, _c, position, lookAt) => {
        aims.push({ position, lookAt });
        return true;
      },
    });

    const before = aims.length;
    const report = surface.orbitBy({ azimuth: 0.5, elevation: 0.2 });
    expect(aims.length).toBe(before + 1); // the adapter was asked to aim, exactly once
    expect(surface.orbit.azimuth).toBeCloseTo(STUDIO_ORBIT_DEFAULT.azimuth + 0.5, 10);
    expect(report.frames).toBe(surface.frames); // turning the camera is not a frame
    // And the placement handed to the adapter is the one the new orbit describes.
    const expected = orbitToPlacement(surface.orbit, STUDIO_CAMERA_LOOK_AT);
    expect(aims[aims.length - 1]!.position.x).toBeCloseTo(expected.position.x, 10);
    expect(aims[aims.length - 1]!.position.z).toBeCloseTo(expected.position.z, 10);
  });

  it('resetOrbit returns to the view the Studio opens with', () => {
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {}, { placeCamera: () => true });
    surface.orbitBy({ azimuth: 1.5, elevation: 0.4, distance: 6 });
    expect(surface.orbit).not.toEqual(STUDIO_ORBIT_DEFAULT);
    surface.resetOrbit();
    expect(surface.orbit).toEqual(STUDIO_ORBIT_DEFAULT);
  });

  it('a surface with NO adapter still orbits — a fake without cameras is a legitimate host', () => {
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {});
    expect(() => surface.orbitBy({ azimuth: 0.3 })).not.toThrow();
    expect(surface.orbit.azimuth).toBeCloseTo(STUDIO_ORBIT_DEFAULT.azimuth + 0.3, 10);
  });

  it('addBody grows BOTH the surface’s list and the runtime’s graph', () => {
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {});
    const before = surface.bodyIds.length;
    const sceneBefore = runtime.getScene(surface.sceneId)!.entities.size;

    const added = surface.addBody('Cube D', 'mesh');
    expect(added).not.toBeNull();
    expect(added!.count).toBe(before + 1);
    expect(surface.bodyIds).toHaveLength(before + 1);
    expect(surface.bodyIds).toContain(added!.bodyId);
    // The report counts what the RUNTIME holds, so a body added only to the surface's array would show here.
    expect(runtime.getScene(surface.sceneId)!.entities.size).toBe(sceneBefore + 1);
    expect(surface.report().scene!.entities).toBe(sceneBefore + 1);
  });

  it('removeBody shrinks both, and answers false for an id this surface does not hold', () => {
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {});
    const added = surface.addBody('Cube D', 'mesh')!;
    const sceneBefore = runtime.getScene(surface.sceneId)!.entities.size;

    expect(surface.removeBody(added.bodyId)).toBe(true);
    expect(surface.bodyIds).not.toContain(added.bodyId);
    expect(runtime.getScene(surface.sceneId)!.entities.size).toBe(sceneBefore - 1);
    expect(surface.report().scene!.entities).toBe(sceneBefore - 1);

    // Removing it twice, or removing a body this surface never added, is a `false` rather than a throw.
    expect(surface.removeBody(added.bodyId)).toBe(false);
    expect(surface.removeBody('entity-never-existed')).toBe(false);
  });

  it('a REMOVED body is not written by the frame loop', () => {
    // The write callback receives the live list, so a surface that removed a body from its array but left
    // the loop writing it would be caught here.
    const written: string[][] = [];
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, (ids) => written.push([...ids]));
    const added = surface.addBody('Cube D', 'mesh')!;
    surface.step(1);
    expect(written[0]).toContain(added.bodyId);

    surface.removeBody(added.bodyId);
    surface.step(2);
    expect(written[1]).not.toContain(added.bodyId);
    expect(written[1]).toHaveLength(written[0]!.length - 1);
  });

  it('the composed scene is UNTOUCHED by add/remove — the four v142 bodies keep their places', () => {
    const { runtime, created } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {});
    const originalNames = created.map((c) => c.name);
    const added = surface.addBody('Cube D', 'mesh')!;
    surface.removeBody(added.bodyId);
    expect(created.map((c) => c.name)).toEqual(originalNames);
    expect(surface.bodyIds).toHaveLength(4);
  });
});

describe('save / load — the scene survives the process (M5 v163)', () => {
  it('save passes THIS surface’s scene and the instant it was given through to the saver', () => {
    const { runtime } = fakeRuntime();
    const { saver, saved } = fakeSaver();
    const surface = createStudioScene(runtime, () => {}, undefined, 0, saver);

    const file = surface.save(5000);
    expect(saved).toEqual([{ sceneId: surface.sceneId, savedAt: 5000 }]);
    expect(file.savedAt).toBe(5000);
    expect(file.format).toBe('nexus-three-runtime-save');
    expect(file.entities).toHaveLength(2);
  });

  it('save refuses a non-finite or negative instant — the caller names the clock', () => {
    const { runtime } = fakeRuntime();
    const { saver } = fakeSaver();
    const surface = createStudioScene(runtime, () => {}, undefined, 0, saver);
    expect(() => surface.save(Number.NaN)).toThrow(/savedAt is NaN/);
    expect(() => surface.save(-1)).toThrow(/savedAt is -1/);
  });

  it('a surface with NO saver refuses to save, instead of pretending', () => {
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {});
    expect(() => surface.save(1)).toThrow(/built without a saver/);
    expect(() => surface.load({} as SceneSaveFile)).toThrow(/built without a saver/);
  });

  it('load gives the restore a FRESH scene — the surface’s scene and loop are untouched', () => {
    const { runtime, scenes } = fakeRuntime();
    const { saver, loaded } = fakeSaver();
    const surface = createStudioScene(runtime, () => {}, undefined, 0, saver);
    const before = surface.report();

    const file = surface.save(5000);
    const result = surface.load(file);

    expect(loaded).toEqual([{ sceneId: result.sceneId, file }]);
    expect(scenes.size).toBe(2); // the demo scene, plus the one the restore landed in
    expect(result.sceneId).not.toBe(surface.sceneId);
    expect(result.report.entities).toEqual(['e-1', 'e-2']);
    expect(result.report.carries).toContain('entities');
    // The surface's own scene is exactly what it was: same id, same body count, same loop.
    expect(runtime.getScene(surface.sceneId)!.entities.size).toBe(before.scene!.entities);
    expect(surface.report().scene!.id).toBe(before.scene!.id);
    const written: string[][] = [];
    const loop = createStudioScene(runtime, (ids) => written.push([...ids]));
    expect(loop.bodyIds).toHaveLength(4); // the loop still writes the demo bodies, not the restored ones
  });

  it('load refuses a file that is not an object, rather than asking the saver about it', () => {
    const { runtime } = fakeRuntime();
    const { saver, loaded } = fakeSaver();
    const surface = createStudioScene(runtime, () => {}, undefined, 0, saver);
    expect(() => surface.load([1, 2] as unknown as SceneSaveFile)).toThrow(/parses|an array|not a save-file object/);
    expect(() => surface.load(undefined as unknown as SceneSaveFile)).toThrow(/not a save-file object/);
    expect(loaded).toHaveLength(0); // the saver was never asked
  });

  it('addBody and removeBody maintain the AUTHORED list — the composed demo stays out of it', () => {
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {});
    expect(surface.authoredBodyIds).toHaveLength(0); // the four composed bodies are not user content

    const first = surface.addBody('Cube D', 'mesh')!;
    const second = surface.addBody('Cube E', 'mesh')!;
    expect(surface.authoredBodyIds).toEqual([first.bodyId, second.bodyId]);
    expect(surface.bodyIds).toHaveLength(6); // 4 composed + 2 authored

    expect(surface.removeBody(second.bodyId)).toBe(true);
    expect(surface.authoredBodyIds).toEqual([first.bodyId]);
    // Removing a composed body is refused by `bodyIds` lookup semantics — it is not in the authored list
    // to begin with, so a document send can never file it.
    expect(surface.authoredBodyIds).not.toContain(surface.bodyIds[0]);
  });
});

describe('ndcFromPixel — canvas pixels to pick coordinates (M5 v182)', () => {
  it('the pixel at the CENTER of the canvas is NDC origin', () => {
    expect(ndcFromPixel(400, 300, 800, 600)).toEqual({ x: 0, y: 0 });
  });

  it('the TOP-LEFT pixel is NDC (-1, +1) — pixel y points DOWN while NDC y points UP', () => {
    expect(ndcFromPixel(0, 0, 800, 600)).toEqual({ x: -1, y: 1 });
  });

  it('the BOTTOM-RIGHT pixel is NDC (+1, -1) — the same flip, read from the other corner', () => {
    expect(ndcFromPixel(800, 600, 800, 600)).toEqual({ x: 1, y: -1 });
  });

  it('a quarter point maps proportionally, so off-center picks land where they should', () => {
    expect(ndcFromPixel(600, 150, 800, 600)).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('pickAt — the surface names the body under a click (M5 v182)', () => {
  /** The fake adapter plus a pick raycaster the suite scripts: `hits` answers one pick per entry. */
  function pickingFixture() {
    const { runtime } = fakeRuntime();
    const asked: { sceneId: string; nx: number; ny: number }[] = [];
    const hits: { entityId: string; name: string; distance: number }[] = [];
    const adapter: SceneAdapterLike = {
      ...fakeAdapter(),
      pickAt(sceneId: string, nx: number, ny: number) {
        asked.push({ sceneId, nx, ny });
        return hits.shift() ?? null;
      },
    };
    const surface = createStudioScene(runtime, () => {}, adapter);
    return { surface, asked, hits };
  }

  it('canvas pixels reach the adapter as NDC — the surface converts, it does not guess', () => {
    const { surface, asked } = pickingFixture();
    surface.pickAt(600, 150);
    expect(asked).toEqual([{ sceneId: surface.sceneId, nx: 0.5, ny: 0.5 }]);
  });

  it('a hit names the body from then on — a selection is state, not a one-shot answer', () => {
    const { surface, hits } = pickingFixture();
    hits.push({ entityId: 'e-9', name: 'Cube K', distance: 3.5 });
    const picked = surface.pickAt(400, 300);
    expect(picked.selected).toEqual({ id: 'e-9', name: 'Cube K' });
    // And the NEXT report — a frame later, a turn later — still carries it.
    expect(surface.report().selected).toEqual({ id: 'e-9', name: 'Cube K' });
  });

  it('clicking empty space CLEARS the selection — a miss is an input, not silence', () => {
    const { surface, hits } = pickingFixture();
    hits.push({ entityId: 'e-9', name: 'Cube K', distance: 3.5 });
    expect(surface.pickAt(400, 300).selected).toEqual({ id: 'e-9', name: 'Cube K' });
    expect(surface.pickAt(10, 10).selected).toBeNull();
    expect(surface.report().selected).toBeNull();
  });

  it('a host without a picking adapter answers the unchanged report — asking nothing is not a miss', () => {
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {}, fakeAdapter());
    const before = surface.report();
    const after = surface.pickAt(400, 300);
    expect(after.selected).toBeNull();
    expect(after).toEqual(before);
  });

  it('a pick never moves the camera — selecting is not a turn', () => {
    const { surface, hits } = pickingFixture();
    hits.push({ entityId: 'e-9', name: 'Cube K', distance: 3.5 });
    const orbitBefore = { ...surface.orbit };
    surface.pickAt(400, 300);
    expect(surface.orbit).toEqual(orbitBefore);
  });

  it('a turn keeps the selection — orbiting to look around does not drop what you had picked', () => {
    const { surface, hits } = pickingFixture();
    hits.push({ entityId: 'e-9', name: 'Cube K', distance: 3.5 });
    surface.pickAt(400, 300);
    const turned = surface.orbitBy({ azimuth: 1 });
    expect(turned.selected).toEqual({ id: 'e-9', name: 'Cube K' });
  });
});

describe('composeDocumentOps — a scene becomes an ordinary document subtree (M5 v163)', () => {
  const bodies = [
    { id: 'e-9', name: 'Cube D', kind: 'mesh', position: { x: 2.6, y: 0.51648, z: -0.00001 } },
    { id: 'e-10', name: 'Cube E', kind: 'mesh', position: { x: -2.6, y: 0, z: 0 } },
  ];

  it('returns ONE addSubtree op: a frame named after the scene, one text child per body', () => {
    const opsList = composeDocumentOps({ pageId: 'page-1', index: 0, sceneName: 'Studio Scene', bodies });
    expect(opsList).toHaveLength(1);
    const op = opsList[0]!;
    expect(op.type).toBe('addSubtree');
    if (op.type !== 'addSubtree') return;
    expect(op.parentId).toBe('page-1');
    expect(op.nodes).toHaveLength(3); // frame + two body labels
    const [frame, ...labels] = op.nodes;
    expect(frame!.name).toBe('Scene: Studio Scene');
    expect(frame!.childIds).toHaveLength(2);
    for (const label of labels) expect(label.parentId).toBe(frame!.id);
    expect(labels.map((l) => l.name)).toEqual(['Cube D', 'Cube E']);
  });

  it('the op APPLIES to a real document, carries positions in its text, and INVERTS cleanly', () => {
    // Against the REAL design model — an op the suite believes in but the reducer refuses would be a
    // button that does nothing on a real page.
    const opsList = composeDocumentOps({ pageId: 'page-1', index: 0, sceneName: 'Studio Scene', bodies });
    let doc = createEmptyDocument();
    const op = opsList[0]!;
    // The page the caller named must be the document's real page — the reducer checks parents.
    doc = applyOp(doc, { ...op, parentId: doc.activePageId } as typeof op);

    const frame = Object.values(doc.nodes).find((n) => n.name === 'Scene: Studio Scene');
    expect(frame).toBeDefined();
    expect(frame!.childIds).toHaveLength(2);
    const texts = frame!.childIds.map((id) => doc.nodes[id]!);
    // Coordinates are written to 2 decimals — a spec, not a measurement — and finite garbage is refused
    // long before it becomes document text.
    expect(texts[0]!.type).toBe('text');
    expect(JSON.stringify(texts[0])).toContain('mesh · (2.6, 0.52, 0)'); // -0.00001 rounds to a clean 0
    expect(JSON.stringify(texts[1])).toContain('(-2.6, 0, 0)');

    // And the subtree is ordinary document content: invert the op and it is gone, every node of it.
    const undone = applyOp(doc, invertOp(doc, op));
    expect(undone.nodes[frame!.id]).toBeUndefined();
    expect(Object.values(undone.nodes).filter((n) => n.type === 'text' && n.name === 'Cube D')).toHaveLength(0);
  });

  it('two sends compose DIFFERENT node ids, so a second send lands beside the first', () => {
    const first = composeDocumentOps({ pageId: 'p', index: 0, sceneName: 'S', bodies })[0]!;
    const second = composeDocumentOps({ pageId: 'p', index: 1, sceneName: 'S', bodies })[0]!;
    expect(first.type === 'addSubtree' && second.type === 'addSubtree' ? first.nodes[0]!.id : '').not.toBe(
      second.type === 'addSubtree' ? second.nodes[0]!.id : 'mismatch',
    );
    // And both apply against the same document — the second does not collide with the first.
    let doc = createEmptyDocument();
    doc = applyOp(doc, { ...first, parentId: doc.activePageId } as typeof first);
    doc = applyOp(doc, { ...second, parentId: doc.activePageId } as typeof second);
    expect(Object.values(doc.nodes).filter((n) => n.name === 'Scene: S')).toHaveLength(2);
  });

  it('refuses what would file a lie: no bodies, no scene name, no page, a non-finite coordinate', () => {
    expect(() => composeDocumentOps({ pageId: 'p', index: 0, sceneName: 'S', bodies: [] })).toThrow(/about nothing/);
    expect(() => composeDocumentOps({ pageId: 'p', index: 0, sceneName: '   ', bodies })).toThrow(/names nothing/);
    expect(() => composeDocumentOps({ pageId: '', index: 0, sceneName: 'S', bodies })).toThrow(/has to land somewhere/);
    expect(() =>
      composeDocumentOps({
        pageId: 'p',
        index: 0,
        sceneName: 'S',
        bodies: [{ id: 'e', name: 'B', kind: 'mesh', position: { x: Number.NaN, y: 0, z: 0 } }],
      }),
    ).toThrow(/position x is NaN/);
  });
});
