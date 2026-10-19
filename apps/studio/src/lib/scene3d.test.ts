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
  clampLightIntensity,
  clampEntityName,
  entityComponentsOf,
  lightIntensityOf,
  LIGHT_INTENSITY_MAX,
  LIGHT_INTENSITY_MIN,
  LIGHT_INTENSITY_STEP,
  type OrbitState,
  type SceneLightSource,
  STUDIO_CAMERA_POSITION,
  type SceneAdapterLike,
  type SceneComposerLike,
  type SceneLike,
  type SceneSaveFile,
  type SceneSaverLike,
  type SceneSurface,
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
  // M5 v261 — the fake now HOLDS the seat instead of deriving it from insertion order. The old expression
  // (`[...scenes.keys()][0]`) agreed with production only while nobody moved the seat, which is exactly the
  // input v261 exists for: a surface that composes one world and reads another. Production's rule is
  // threeRuntime.ts:1238-1241 (the FIRST scene on an empty graph takes the seat, from inside `createScene`)
  // plus :1356 (`setActiveScene` moves it and refuses an id the graph lacks), so the fake obeys both.
  let activeSceneId: string | null = null;
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
      if (scenes.size === 1) activeSceneId = scene.id;
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
    // M5 v244 — the fake obeys v239's contract: the subject is looked up before anything is touched, an
    // unknown one answers `false`, the ACTIVE one is refused by THROWING, and only then does the delete
    // happen. The refusal sentence is the FAKE'S OWN words on purpose: the surface promises to carry the
    // host's reason through untouched, and a host that says what the production runtime says would prove
    // nothing about that promise. `scene3dSurface.test.ts` pins the production sentence.
    removeCamera(sceneId, camId) {
      const scene = scenes.get(sceneId);
      if (!scene) return false;
      const camera = scene.cameras.get(camId);
      if (!camera) return false;
      if (camera.active) throw new Error(`host refuses: ${camId} holds the active seat in ${sceneId}`);
      scene.cameras.delete(camId);
      return true;
    },
    // M5 v260 — the fake obeys v224's ORDER, not production's words: the requested camera is looked up
    // BEFORE any `active` flag is touched, so a `false` answer leaves the seat where it was. The surface's
    // `activateCamera` claims to answer the LIVE seat after the handover, which is only testable against a
    // host that moves the flags the way the real registry does.
    setActiveCamera(sceneId, camId) {
      const scene = scenes.get(sceneId);
      if (!scene) return false;
      const camera = scene.cameras.get(camId);
      if (!camera) return false;
      for (const other of scene.cameras.values()) other.active = false;
      camera.active = true;
      return true;
    },
    // M5 v261 — the fake holds the SCENE seat the way production does: the id is looked up first, so a `false`
    // answer leaves the world the panel is reading exactly where it was. The surface's `activateScene` claims to
    // answer the graph's OWN active id after the ask and to re-aim inside the new world, and neither claim is
    // testable against a fake whose active row is an insertion order.
    setActiveScene(sceneId) {
      if (!scenes.has(sceneId)) return false;
      activeSceneId = sceneId;
      return true;
    },
    getScene(sceneId) {
      return scenes.get(sceneId);
    },
    getSceneGraph() {
      return { scenes, activeSceneId, stats: { drawCalls: 0, triangles: 0, points: 0, lines: 0 } };
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

describe('lighting control (v183) — the surface folds the ask, the host owns the light', () => {
  /**
   * A host WITH a lighting gate: it records every ask and applies it to the declared lights it hangs on
   * the demo scene — the same apply-rules the real `setLightState` upholds, in fake form. The lights use
   * the fake shape (`intensity` directly on the source); the real runtime's shape is proven one file over
   * (`scene3dSurface.test.ts`), through `lightIntensityOf`'s other branch.
   */
  function lightingFixture() {
    const asked: { sceneId: string; lightId: string; change: { enabled?: boolean; intensity?: number } }[] = [];
    const { runtime, scenes } = fakeRuntime({
      setLightState(sceneId, lightId, change) {
        asked.push({ sceneId, lightId, change });
        const scene = scenes.get(sceneId);
        const light = scene?.lighting?.lights.find((l) => l.id === lightId);
        if (!scene || !light) return false;
        if (change.intensity !== undefined && (!Number.isFinite(change.intensity) || change.intensity < 0)) return false;
        if (change.enabled !== undefined) light.enabled = change.enabled;
        if (change.intensity !== undefined) light.intensity = change.intensity;
        return true;
      },
    });
    const surface = createStudioScene(runtime, () => {}, fakeAdapter());
    const scene = scenes.get(surface.sceneId)!;
    const lights: SceneLightSource[] = [
      { id: 'ambient', type: 'ambient', enabled: true, intensity: 0.5 },
      { id: 'directional', type: 'directional', enabled: true, intensity: 1 },
    ];
    scene.lighting = { lights };
    return { surface, scene, lights, asked };
  }

  it('clampLightIntensity folds any ask into the range the control owns', () => {
    expect(clampLightIntensity(1.23)).toBe(1.23);
    expect(clampLightIntensity(-3)).toBe(LIGHT_INTENSITY_MIN);
    expect(clampLightIntensity(9)).toBe(LIGHT_INTENSITY_MAX);
    // One rule for EVERY non-finite number, +Infinity included: a brightness that is not a number
    // means "off" — the only thing a broken ask could honestly mean.
    expect(clampLightIntensity(Number.NaN)).toBe(LIGHT_INTENSITY_MIN);
    expect(clampLightIntensity(Number.POSITIVE_INFINITY)).toBe(LIGHT_INTENSITY_MIN);
  });

  it('lightIntensityOf reads both host shapes, and an undeclared brightness reads 0', () => {
    expect(lightIntensityOf({ id: 'a', type: 'ambient', enabled: true, intensity: 0.5 })).toBe(0.5);
    expect(lightIntensityOf({ id: 'a', type: 'ambient', enabled: true, threeLight: { intensity: 1 } })).toBe(1);
    // The direct field wins when both exist — the fake shape is the declared one.
    expect(lightIntensityOf({ id: 'a', type: 'ambient', enabled: true, intensity: 0.5, threeLight: { intensity: 1 } })).toBe(0.5);
    expect(lightIntensityOf({ id: 'a', type: 'ambient', enabled: true })).toBe(0);
  });

  it('the report states the lights as the host holds them — read from the scene, JSON-safe', () => {
    const { surface, lights } = lightingFixture();
    expect(surface.report().scene?.lighting).toEqual([
      { id: lights[0]!.id, type: 'ambient', enabled: true, intensity: 0.5 },
      { id: lights[1]!.id, type: 'directional', enabled: true, intensity: 1 },
    ]);
  });

  it('setLight reaches the host gate with THIS surface\'s scene id, and the report follows', () => {
    const { surface, lights, asked } = lightingFixture();
    const answered = surface.setLight('directional', { intensity: 0.3 });
    expect(asked).toEqual([{ sceneId: surface.sceneId, lightId: 'directional', change: { intensity: 0.3 } }]);
    expect(answered.scene?.lighting.find((l) => l.id === 'directional')!.intensity).toBe(0.3);
    // And the NEXT report still says so — the light holds its state, the report re-reads it.
    expect(surface.report().scene?.lighting.find((l) => l.id === 'directional')!.intensity).toBe(0.3);
    expect(lights.find((l) => l.id === 'directional')!.intensity).toBe(0.3);
  });

  it('an out-of-range ask is folded BEFORE the host sees it — the host never receives what the range forbids', () => {
    const { surface, asked } = lightingFixture();
    surface.setLight('ambient', { intensity: 9 });
    surface.setLight('ambient', { intensity: -3 });
    surface.setLight('ambient', { intensity: Number.NaN });
    expect(asked.map((a) => a.change.intensity)).toEqual([LIGHT_INTENSITY_MAX, LIGHT_INTENSITY_MIN, LIGHT_INTENSITY_MIN]);
  });

  it('an enabled flip goes through the same gate', () => {
    const { surface, asked } = lightingFixture();
    const answered = surface.setLight('ambient', { enabled: false });
    expect(asked).toEqual([{ sceneId: surface.sceneId, lightId: 'ambient', change: { enabled: false } }]);
    expect(answered.scene?.lighting.find((l) => l.id === 'ambient')!.enabled).toBe(false);
  });

  it('a host without a lighting gate answers the unchanged report — asking is not changing', () => {
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {}, fakeAdapter());
    const before = surface.report();
    const after = surface.setLight('ambient', { intensity: 0.3, enabled: false });
    expect(after).toEqual(before);
  });

  it('one press of the control moves a light exactly LIGHT_INTENSITY_STEP, clamped at both ends', () => {
    const { surface } = lightingFixture();
    // From 1.0, one brighten press; the pure suite cannot press a button, so it asks the same ask the
    // button would — the step arithmetic the component uses is this constant, not a second number.
    const brightened = surface.setLight('directional', { intensity: 1 + LIGHT_INTENSITY_STEP });
    expect(brightened.scene?.lighting.find((l) => l.id === 'directional')!.intensity).toBeCloseTo(1.1, 10);
    // At the top of the range the step cannot push past it.
    const top = surface.setLight('directional', { intensity: LIGHT_INTENSITY_MAX + LIGHT_INTENSITY_STEP });
    expect(top.scene?.lighting.find((l) => l.id === 'directional')!.intensity).toBe(LIGHT_INTENSITY_MAX);
    // At the bottom, below zero clamps to the floor.
    const bottom = surface.setLight('ambient', { intensity: LIGHT_INTENSITY_MIN - LIGHT_INTENSITY_STEP });
    expect(bottom.scene?.lighting.find((l) => l.id === 'ambient')!.intensity).toBe(LIGHT_INTENSITY_MIN);
  });
});

describe('inspector edit (v197) — the picked body becomes renamable and hideable', () => {
  /** An adapter that names the demo scene's FIRST body at the view center, so a click selects a body
   *  the fake graph really holds — the pick plumbing itself is proven one file over. */
  function pickAdapterFor(runtime: SceneComposerLike, scenes: Map<string, SceneLike>): SceneAdapterLike {
    return {
      placeCamera: () => true,
      pickAt(_sceneId, nx, ny) {
        if (nx !== 0 || ny !== 0) return null;
        const graph = runtime.getSceneGraph();
        const scene = graph.activeSceneId ? scenes.get(graph.activeSceneId) : undefined;
        const first = scene?.entities.values().next().value;
        return first ? { entityId: first.id, name: first.name, distance: 1 } : null;
      },
    };
  }

  /** A host WITH the entity gates: it records every ask and applies it to the fake scene's records —
   *  the same apply-rules the real `setEntityName`/`setEntityVisible` uphold, in fake form. The real
   *  gates (and the BOTH-records visibility rule) are proven one file over, on the shipped runtime. */
  function editFixture() {
    const askedName: { sceneId: string; entityId: string; name: string }[] = [];
    const askedVisible: { sceneId: string; entityId: string; visible: boolean }[] = [];
    const { runtime, scenes } = fakeRuntime({
      setEntityName(sceneId, entityId, name) {
        askedName.push({ sceneId, entityId, name });
        const entity = scenes.get(sceneId)?.entities.get(entityId);
        if (!entity || typeof name !== 'string' || name.trim().length === 0) return false;
        entity.name = name;
        return true;
      },
      setEntityVisible(sceneId, entityId, visible) {
        askedVisible.push({ sceneId, entityId, visible });
        const entity = scenes.get(sceneId)?.entities.get(entityId) as { visible?: boolean } | undefined;
        if (!entity || typeof visible !== 'boolean') return false;
        entity.visible = visible;
        return true;
      },
    });
    const surface = createStudioScene(runtime, () => {}, pickAdapterFor(runtime, scenes));
    return { surface, scenes, askedName, askedVisible };
  }

  it('clampEntityName folds a rename ask — trimmed, or null when the ask names nothing', () => {
    expect(clampEntityName('  Hero  ')).toBe('Hero');
    expect(clampEntityName('Hero')).toBe('Hero');
    expect(clampEntityName('   ')).toBeNull();
    expect(clampEntityName('')).toBeNull();
    expect(clampEntityName(null)).toBeNull();
    expect(clampEntityName(undefined)).toBeNull();
  });

  it('renameSelected reaches the host gate FOLDED, and both name records follow an accepted rename', () => {
    const { surface, askedName } = editFixture();
    surface.pickAt(400, 300);
    const picked = surface.report().selected!;

    const answered = surface.renameSelected('  Hero  ');
    expect(askedName).toEqual([{ sceneId: surface.sceneId, entityId: picked.id, name: 'Hero' }]);
    // The pick record moved WITH the accepted rename (the restore rule), and the inspector reads the
    // live record — so one report cannot disagree about what the body is called.
    expect(answered.selected).toEqual({ id: picked.id, name: 'Hero' });
    expect(answered.inspector?.name).toBe('Hero');
  });

  it('a blank ask is a NO-ASK — the gate is never called and the report is unchanged', () => {
    const { surface, askedName } = editFixture();
    surface.pickAt(400, 300);
    const before = surface.report();
    const after = surface.renameSelected('   ');
    expect(askedName).toEqual([]);
    expect(after).toEqual(before);
  });

  it('no selection answers the unchanged report — there is nothing to rename', () => {
    const { surface, askedName } = editFixture();
    const before = surface.report();
    const after = surface.renameSelected('Hero');
    expect(askedName).toEqual([]);
    expect(after).toEqual(before);
    expect(after.inspector).toBeNull();
  });

  it('a host that refuses leaves the pick record alone — the report reads the name the live scene holds', () => {
    const refused: string[] = [];
    const { runtime, scenes } = fakeRuntime({
      setEntityName(_sceneId, _entityId, name) {
        refused.push(name);
        return false;
      },
    });
    const surface = createStudioScene(runtime, () => {}, pickAdapterFor(runtime, scenes));
    surface.pickAt(400, 300);
    const before = surface.report();

    const answered = surface.renameSelected('Hero');
    expect(refused).toEqual(['Hero']);
    expect(answered.selected).toEqual(before.selected);
    expect(answered.inspector?.name).toBe(before.inspector?.name);
  });

  it('setSelectedVisible reaches the host gate and the report re-reads the live scene', () => {
    const { surface, askedVisible } = editFixture();
    surface.pickAt(400, 300);
    const picked = surface.report().selected!;

    const hidden = surface.setSelectedVisible(false);
    expect(askedVisible).toEqual([{ sceneId: surface.sceneId, entityId: picked.id, visible: false }]);
    // Hiding keeps the selection — the body is still IN the scene, its facts just say hidden.
    expect(hidden.selected).toEqual(picked);
    expect(hidden.inspector?.visible).toBe(false);

    const shown = surface.setSelectedVisible(true);
    expect(askedVisible).toEqual([
      { sceneId: surface.sceneId, entityId: picked.id, visible: false },
      { sceneId: surface.sceneId, entityId: picked.id, visible: true },
    ]);
    expect(shown.inspector?.visible).toBe(true);
  });

  it('a host without the gates answers the unchanged report — asking is not changing', () => {
    const { runtime, scenes } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {}, pickAdapterFor(runtime, scenes));
    surface.pickAt(400, 300);
    const before = surface.report();
    expect(surface.setSelectedVisible(false)).toEqual(before);
    expect(surface.renameSelected('Hero')).toEqual(before);
  });
});

describe('entityComponentsOf (v199) — one registry, three spellings, none invented', () => {
  it('reads Map, entry-array and plain-object hosts in their own order', () => {
    const mapHost = new Map([
      ['b', { type: 'b-type', enabled: false }],
      ['a', { type: 'a-type', enabled: true }],
    ]);
    expect(entityComponentsOf(mapHost)).toEqual([
      { name: 'b-type', enabled: false },
      { name: 'a-type', enabled: true },
    ]);
    expect(
      entityComponentsOf([
        ['b', { type: 'b-type', enabled: false }],
        ['a', { type: 'a-type', enabled: true }],
      ]),
    ).toEqual([
      { name: 'b-type', enabled: false },
      { name: 'a-type', enabled: true },
    ]);
    expect(entityComponentsOf({ a: { type: 'a-type', enabled: true } })).toEqual([
      { name: 'a-type', enabled: true },
    ]);
  });

  it('refuses to invent: undeclared, garbage and valueless entries answer none — a nameless value answers its key', () => {
    expect(entityComponentsOf(undefined)).toEqual([]);
    expect(entityComponentsOf(null)).toEqual([]);
    expect(entityComponentsOf(42)).toEqual([]);
    expect(entityComponentsOf('components')).toEqual([]);
    expect(entityComponentsOf([['k', 42], ['j', null]])).toEqual([
      { name: 'k', enabled: true },
      { name: 'j', enabled: true },
    ]);
    expect(entityComponentsOf([['filed-as', { enabled: false }]])).toEqual([
      { name: 'filed-as', enabled: false },
    ]);
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

// M5 v210 — the watch seam over the two honest host shapes the interfaces already allow.
describe('watchComponents (M5 v210)', () => {
  it('a host without event verbs answers a no-op unsubscribe instead of crashing', () => {
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {});
    const unwatch = surface.watchComponents(() => {});
    expect(typeof unwatch).toBe('function');
    expect(() => unwatch()).not.toThrow();
  });

  it('a host WITH verbs is subscribed to exactly the three component names with one shared listener, and unsubscribed from all three on the way out', () => {
    const on: Array<{ event: string; listener: unknown }> = [];
    const off: Array<{ event: string; listener: unknown }> = [];
    const { runtime } = fakeRuntime({
      addEventListener: (event, listener) => {
        on.push({ event, listener });
      },
      removeEventListener: (event, listener) => {
        off.push({ event, listener });
      },
    });
    const surface = createStudioScene(runtime, () => {});
    const listener = () => {};
    const unwatch = surface.watchComponents(listener);

    expect(on.map((entry) => entry.event).sort()).toEqual(
      ['componentAdded', 'componentRemoved', 'componentStateChanged'].sort(),
    );
    // ONE listener joins all three names — a per-event wrapper would make the unsubscribe a different
    // function than the subscription, and the runtime's indexOf would silently drop nothing.
    expect(new Set(on.map((entry) => entry.listener)).size).toBe(1);
    expect(on[0]!.listener).toBe(listener);

    unwatch();
    expect(off.map((entry) => entry.event).sort()).toEqual(on.map((entry) => entry.event).sort());
    for (const entry of off) expect(entry.listener).toBe(listener);
  });

  it('the listener fires when the host emits one of the watched names — the runtime drives, the surface obeys', () => {
    const listeners = new Map<string, ((data?: unknown) => void)[]>();
    const { runtime } = fakeRuntime({
      addEventListener: (event, listener) => {
        const list = listeners.get(event) ?? [];
        list.push(listener);
        listeners.set(event, list);
      },
      removeEventListener: (event, listener) => {
        const list = listeners.get(event) ?? [];
        const at = list.indexOf(listener);
        if (at !== -1) list.splice(at, 1);
      },
    });
    const surface = createStudioScene(runtime, () => {});
    let fired = 0;
    surface.watchComponents(() => {
      fired += 1;
    });

    // Emit the way the real runtime does: every listener under the name, with the event's data.
    for (const listener of listeners.get('componentAdded') ?? []) listener({ entityId: 'e1' });
    expect(fired).toBe(1);
  });
});

// M5 v212 — the entity leg of the same seam. These cases are deliberately shaped like v210's, because the
// whole claim of v212 is that the two legs are the SAME promise over a DIFFERENT name set: any drift in
// the shape (a payload, a per-event wrapper, a missing no-verbs guard) should read as a diff here.
describe('watchEntities (M5 v212)', () => {
  it('a host without event verbs answers a no-op unsubscribe instead of crashing', () => {
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {});
    const unwatch = surface.watchEntities(() => {});
    expect(typeof unwatch).toBe('function');
    expect(() => unwatch()).not.toThrow();
  });

  it('a host WITH verbs joins exactly the two entity names with one shared listener, and leaves on both', () => {
    const on: Array<{ event: string; listener: unknown }> = [];
    const off: Array<{ event: string; listener: unknown }> = [];
    const { runtime } = fakeRuntime({
      addEventListener: (event, listener) => {
        on.push({ event, listener });
      },
      removeEventListener: (event, listener) => {
        off.push({ event, listener });
      },
    });
    const surface = createStudioScene(runtime, () => {});
    const listener = () => {};
    const unwatch = surface.watchEntities(listener);

    expect(on.map((entry) => entry.event).sort()).toEqual(['entityRenamed', 'entityVisibilityChanged']);
    expect(new Set(on.map((entry) => entry.listener)).size).toBe(1);
    expect(on[0]!.listener).toBe(listener);

    unwatch();
    expect(off.map((entry) => entry.event).sort()).toEqual(on.map((entry) => entry.event).sort());
    for (const entry of off) expect(entry.listener).toBe(listener);
  });

  it('the two legs watch DISJOINT name sets — watchEntities takes no component name and vice versa', () => {
    const on: string[] = [];
    const { runtime } = fakeRuntime({
      addEventListener: (event) => {
        on.push(event);
      },
      removeEventListener: () => {},
    });
    const surface = createStudioScene(runtime, () => {});
    surface.watchComponents(() => {});
    const componentNames = on.slice();
    surface.watchEntities(() => {});
    const entityNames = on.slice(componentNames.length);

    expect(componentNames).toEqual(['componentAdded', 'componentRemoved', 'componentStateChanged']);
    expect(entityNames).toEqual(['entityRenamed', 'entityVisibilityChanged']);
    expect(entityNames.filter((name) => componentNames.includes(name))).toEqual([]);
  });

  it('an entityRenamed from the host fires the entity watcher and no component watcher', () => {
    const listeners = new Map<string, ((data?: unknown) => void)[]>();
    const { runtime } = fakeRuntime({
      addEventListener: (event, listener) => {
        const list = listeners.get(event) ?? [];
        list.push(listener);
        listeners.set(event, list);
      },
      removeEventListener: (event, listener) => {
        const list = listeners.get(event) ?? [];
        const at = list.indexOf(listener);
        if (at !== -1) list.splice(at, 1);
      },
    });
    const surface = createStudioScene(runtime, () => {});
    let entityFires = 0;
    let componentFires = 0;
    surface.watchEntities(() => {
      entityFires += 1;
    });
    surface.watchComponents(() => {
      componentFires += 1;
    });

    for (const listener of listeners.get('entityVisibilityChanged') ?? []) listener({ entityId: 'e1', visible: false });
    expect({ entityFires, componentFires }).toEqual({ entityFires: 1, componentFires: 0 });

    for (const listener of listeners.get('componentAdded') ?? []) listener({ entityId: 'e1' });
    expect({ entityFires, componentFires }).toEqual({ entityFires: 1, componentFires: 1 });
  });
});

// M5 v216 — the BODY leg of the same seam. Its name set is decided by the emit census, not by the size of
// the family: `entityRestored` is NOT watched, because `restoreEntity` builds its body through the same
// private `insertEntity` that `createEntity` calls, and that path emits `entityCreated` unconditionally
// before `restoreEntity` emits its own name. The shape is v210's and v212's on purpose: any drift (a
// payload, a per-event wrapper, a missing no-verbs guard, a third name sneaking in) reads as a diff here.
describe('watchBodies (M5 v216)', () => {
  function withBus() {
    const listeners = new Map<string, ((data?: unknown) => void)[]>();
    const { runtime } = fakeRuntime({
      addEventListener: (event, listener) => {
        const list = listeners.get(event) ?? [];
        list.push(listener);
        listeners.set(event, list);
      },
      removeEventListener: (event, listener) => {
        const list = listeners.get(event) ?? [];
        const at = list.indexOf(listener);
        if (at !== -1) list.splice(at, 1);
      },
    });
    // Emit the way the real runtime does: every listener under the name, with the event's data.
    const emit = (event: string, data?: unknown) => {
      for (const listener of listeners.get(event) ?? []) listener(data);
    };
    return { runtime, listeners, emit };
  }

  it('a host without event verbs answers a no-op unsubscribe instead of crashing', () => {
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {});
    const unwatch = surface.watchBodies(() => {});
    expect(typeof unwatch).toBe('function');
    expect(() => unwatch()).not.toThrow();
  });

  it('a host WITH verbs joins exactly the two body names with one shared listener, and leaves on both', () => {
    const on: Array<{ event: string; listener: unknown }> = [];
    const off: Array<{ event: string; listener: unknown }> = [];
    const { runtime } = fakeRuntime({
      addEventListener: (event, listener) => {
        on.push({ event, listener });
      },
      removeEventListener: (event, listener) => {
        off.push({ event, listener });
      },
    });
    const surface = createStudioScene(runtime, () => {});
    const listener = () => {};
    const unwatch = surface.watchBodies(listener);

    expect(on.map((entry) => entry.event)).toEqual(['entityCreated', 'entityRemoved']);
    expect(new Set(on.map((entry) => entry.listener)).size).toBe(1);
    expect(on[0]!.listener).toBe(listener);

    unwatch();
    expect(off.map((entry) => entry.event).sort()).toEqual(on.map((entry) => entry.event).sort());
    for (const entry of off) expect(entry.listener).toBe(listener);
  });

  it('the THREE legs join pairwise DISJOINT name sets — every name belongs to exactly one leg', () => {
    const on: string[] = [];
    const { runtime } = fakeRuntime({
      addEventListener: (event) => {
        on.push(event);
      },
      removeEventListener: () => {},
    });
    const surface = createStudioScene(runtime, () => {});
    surface.watchComponents(() => {});
    const componentNames = on.slice();
    surface.watchEntities(() => {});
    const afterEntities = on.slice();
    const entityNames = afterEntities.slice(componentNames.length);
    surface.watchBodies(() => {});
    const bodyNames = on.slice(afterEntities.length);

    expect(componentNames).toEqual(['componentAdded', 'componentRemoved', 'componentStateChanged']);
    expect(entityNames).toEqual(['entityRenamed', 'entityVisibilityChanged']);
    expect(bodyNames).toEqual(['entityCreated', 'entityRemoved']);
    // One name, one leg: a shared name would make two panels re-read for one event and would mean the
    // legs above no longer describe three families. Derived from the slices, so the claim is about THIS
    // file's joins, not about a hand-typed count.
    const joined = [...componentNames, ...entityNames, ...bodyNames];
    expect(new Set(joined).size).toBe(joined.length);
  });

  it('an entityCreated fires the body watcher and neither of the other two legs', () => {
    const { runtime, emit } = withBus();
    const surface = createStudioScene(runtime, () => {});
    let bodyFires = 0;
    let entityFires = 0;
    let componentFires = 0;
    surface.watchBodies(() => {
      bodyFires += 1;
    });
    surface.watchEntities(() => {
      entityFires += 1;
    });
    surface.watchComponents(() => {
      componentFires += 1;
    });

    emit('entityCreated', { sceneId: 's', entity: { id: 'e1' } });
    expect({ bodyFires, entityFires, componentFires }).toEqual({ bodyFires: 1, entityFires: 0, componentFires: 0 });

    emit('entityRemoved', { sceneId: 's', entityId: 'e1' });
    expect({ bodyFires, entityFires, componentFires }).toEqual({ bodyFires: 2, entityFires: 0, componentFires: 0 });

    // The entity pair stays the ENTITY leg's news: adding a body is not a rename or a hide.
    emit('entityRenamed', { sceneId: 's', entityId: 'e1', name: 'X' });
    expect({ bodyFires, entityFires, componentFires }).toEqual({ bodyFires: 2, entityFires: 1, componentFires: 0 });
  });

  it('entityRestored is NOT a watched name — the census says the pair already hears a restore', () => {
    const { runtime, emit } = withBus();
    const surface = createStudioScene(runtime, () => {});
    const heard: string[] = [];
    surface.watchBodies(() => heard.push('news'));

    // The runtime's own restore announcement, on its own, moves NOTHING here. This is the refused shape:
    // if `entityRestored` were added to the watched set the case below would fire twice and this pin is
    // the only thing that would notice the difference.
    emit('entityRestored', { sceneId: 's', entity: { id: 'e1' }, entityId: 'e1' });
    expect(heard).toEqual([]);

    // And the leg is ALIVE — the silence above is the name's, not a dead subscription. The real-package
    // cases prove the restore itself does reach this leg, through the `entityCreated` the insert emits.
    emit('entityCreated', { sceneId: 's', entity: { id: 'e2' } });
    expect(heard).toEqual(['news']);
  });
});

// M5 v217 — the SCENE leg, the fourth and last family the Studio panel listens for. Its name set comes from
// the same write census as v216's, and reaches the OPPOSITE verdict: both names carry, because the runtime
// activates the FIRST scene from inside `createScene` without emitting `activeSceneChanged`
// (threeRuntime.ts:1240-1241). A switch-only leg would therefore miss a scene APPEARING at all — the
// surface cases below prove that on the shipped package, where the refusal would be silent.
describe('watchScenes (M5 v217)', () => {
  function withBus() {
    const listeners = new Map<string, ((data?: unknown) => void)[]>();
    const { runtime } = fakeRuntime({
      addEventListener: (event, listener) => {
        const list = listeners.get(event) ?? [];
        list.push(listener);
        listeners.set(event, list);
      },
      removeEventListener: (event, listener) => {
        const list = listeners.get(event) ?? [];
        const at = list.indexOf(listener);
        if (at !== -1) list.splice(at, 1);
      },
    });
    const emit = (event: string, data?: unknown) => {
      for (const listener of listeners.get(event) ?? []) listener(data);
    };
    return { runtime, listeners, emit };
  }

  it('a host without event verbs answers a no-op unsubscribe instead of crashing', () => {
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {});
    const unwatch = surface.watchScenes(() => {});
    expect(typeof unwatch).toBe('function');
    expect(() => unwatch()).not.toThrow();
  });

  it('a host WITH verbs joins exactly the two scene names with one shared listener, and leaves on both', () => {
    const on: Array<{ event: string; listener: unknown }> = [];
    const off: Array<{ event: string; listener: unknown }> = [];
    const { runtime } = fakeRuntime({
      addEventListener: (event, listener) => {
        on.push({ event, listener });
      },
      removeEventListener: (event, listener) => {
        off.push({ event, listener });
      },
    });
    const surface = createStudioScene(runtime, () => {});
    const listener = () => {};
    const unwatch = surface.watchScenes(listener);

    expect(on.map((entry) => entry.event)).toEqual(['sceneCreated', 'activeSceneChanged']);
    expect(new Set(on.map((entry) => entry.listener)).size).toBe(1);
    expect(on[0]!.listener).toBe(listener);

    unwatch();
    expect(off.map((entry) => entry.event).sort()).toEqual(on.map((entry) => entry.event).sort());
    for (const entry of off) expect(entry.listener).toBe(listener);
  });

  it('ALL SIX legs join pairwise DISJOINT name sets — the camera triple borrows no name from the other five', () => {
    const on: string[] = [];
    const { runtime } = fakeRuntime({
      addEventListener: (event) => {
        on.push(event);
      },
      removeEventListener: () => {},
    });
    const surface = createStudioScene(runtime, () => {});
    surface.watchComponents(() => {});
    const componentNames = on.slice();
    surface.watchEntities(() => {});
    const afterEntities = on.slice();
    const entityNames = afterEntities.slice(componentNames.length);
    surface.watchBodies(() => {});
    const bodyNames = on.slice(afterEntities.length);
    surface.watchScenes(() => {});
    const sceneNames = on.slice(on.length - 2);
    surface.watchPixels(() => {});
const pixelNames = on.slice(on.length - 3);
    surface.watchCameras(() => {});
    const cameraNames = on.slice(on.length - 3);

    expect(componentNames).toEqual(['componentAdded', 'componentRemoved', 'componentStateChanged']);
    expect(entityNames).toEqual(['entityRenamed', 'entityVisibilityChanged']);
    expect(bodyNames).toEqual(['entityCreated', 'entityRemoved']);
    expect(sceneNames).toEqual(['sceneCreated', 'activeSceneChanged']);
    expect(pixelNames).toEqual(['initialized', 'resize', 'pixelRatioChanged']);
    expect(cameraNames).toEqual(['cameraCreated', 'activeCameraChanged', 'cameraRemoved']);

// The whole seam, not one leg: 15 joins, 15 distinct names. Each new leg re-widens this pin, because
// the earlier leg's case cannot see a name only the newest one adds — so a name joined twice, or a
// family that starts sharing news with another, reddens HERE.
const joined = [...componentNames, ...entityNames, ...bodyNames, ...sceneNames, ...pixelNames, ...cameraNames];
expect(on.length).toBe(15);
expect(joined.length).toBe(15);
expect(new Set(joined).size).toBe(joined.length);
    // And each later family's names appear in NO earlier leg's slice.
    for (const name of [...sceneNames, ...pixelNames, ...cameraNames]) {
      expect(componentNames).not.toContain(name);
      expect(entityNames).not.toContain(name);
      expect(bodyNames).not.toContain(name);
    }
    for (const name of [...pixelNames, ...cameraNames]) expect(sceneNames).not.toContain(name);
    for (const name of cameraNames) expect(pixelNames).not.toContain(name);
  });

  it('sceneCreated and activeSceneChanged each fire the scene leg and none of the other three', () => {
    const { runtime, emit } = withBus();
    const surface = createStudioScene(runtime, () => {});
    let sceneFires = 0;
    let bodyFires = 0;
    let entityFires = 0;
    let componentFires = 0;
    const bump = (counter: 'sceneFires' | 'bodyFires' | 'entityFires' | 'componentFires') => () => {
      if (counter === 'sceneFires') sceneFires += 1;
      if (counter === 'bodyFires') bodyFires += 1;
      if (counter === 'entityFires') entityFires += 1;
      if (counter === 'componentFires') componentFires += 1;
    };
    surface.watchScenes(bump('sceneFires'));
    surface.watchBodies(bump('bodyFires'));
    surface.watchEntities(bump('entityFires'));
    surface.watchComponents(bump('componentFires'));

    const counts = () => ({ sceneFires, bodyFires, entityFires, componentFires });

    emit('sceneCreated', { scene: { id: 'second' } });
    expect(counts()).toEqual({ sceneFires: 1, bodyFires: 0, entityFires: 0, componentFires: 0 });

    emit('activeSceneChanged', { sceneId: 'second' });
    expect(counts()).toEqual({ sceneFires: 2, bodyFires: 0, entityFires: 0, componentFires: 0 });

    // The body pair stays the BODY leg's news: a scene appearing is not a body appearing.
    emit('entityCreated', { sceneId: 'second', entity: { id: 'e1' } });
    expect(counts()).toEqual({ sceneFires: 2, bodyFires: 1, entityFires: 0, componentFires: 0 });
  });

  it('disposed is NOT a watched name — and the leg stays alive without it', () => {
    const { runtime, emit } = withBus();
    const surface = createStudioScene(runtime, () => {});
    const heard: string[] = [];
    surface.watchScenes(() => heard.push('news'));

    // The absence is a DECISION recorded in the declaration: `dispose()` clears the whole graph
    // (threeRuntime.ts:4212) and the Studio calls it from the same teardown that unwatches, so a `disposed`
    // leg would re-read the report against a runtime the panel is shutting down.
    emit('disposed');
    expect(heard).toEqual([]);

    // The silence is this name's, not a dead subscription.
    emit('activeSceneChanged', { sceneId: 'other' });
    expect(heard).toEqual(['news']);
  });
});

// v218 — the fifth leg. Its name set comes from the same write census as the four above, aimed at the two
// fields no earlier leg reads: `report.backend` and `report.pixels`. Only three runtime writes move them —
// `initialize`, `resize` and `setPixelRatio` — and the third of those used to write a REPORTED field with no
// announcement at all, which is why this grant has a runtime half as well as a surface half.
describe('watchPixels (M5 v218)', () => {
  function withBus() {
    const listeners = new Map<string, ((data?: unknown) => void)[]>();
    const { runtime } = fakeRuntime({
      addEventListener: (event, listener) => {
        const list = listeners.get(event) ?? [];
        list.push(listener);
        listeners.set(event, list);
      },
      removeEventListener: (event, listener) => {
        const list = listeners.get(event) ?? [];
        const at = list.indexOf(listener);
        if (at !== -1) list.splice(at, 1);
      },
    });
    const emit = (event: string, data?: unknown) => {
      for (const listener of listeners.get(event) ?? []) listener(data);
    };
    return { runtime, listeners, emit };
  }

  it('a host without event verbs answers a no-op unsubscribe instead of crashing', () => {
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {});
    const unwatch = surface.watchPixels(() => {});
    expect(typeof unwatch).toBe('function');
    expect(() => unwatch()).not.toThrow();
  });

  it('a host WITH verbs joins exactly the three pixels names with one shared listener, and leaves on all three', () => {
    const on: Array<{ event: string; listener: unknown }> = [];
    const off: Array<{ event: string; listener: unknown }> = [];
    const { runtime } = fakeRuntime({
      addEventListener: (event, listener) => {
        on.push({ event, listener });
      },
      removeEventListener: (event, listener) => {
        off.push({ event, listener });
      },
    });
    const surface = createStudioScene(runtime, () => {});
    const listener = () => {};
    const unwatch = surface.watchPixels(listener);

    expect(on.map((entry) => entry.event)).toEqual(['initialized', 'resize', 'pixelRatioChanged']);
    expect(new Set(on.map((entry) => entry.listener)).size).toBe(1);
    expect(on[0]!.listener).toBe(listener);

    unwatch();
    expect(off.map((entry) => entry.event).sort()).toEqual(on.map((entry) => entry.event).sort());
    for (const entry of off) expect(entry.listener).toBe(listener);
  });

  it('initialized, resize and pixelRatioChanged each fire the pixels leg and none of the other four', () => {
    const { runtime, emit } = withBus();
    const surface = createStudioScene(runtime, () => {});
    let pixelsFires = 0;
    let sceneFires = 0;
    let bodyFires = 0;
    let entityFires = 0;
    let componentFires = 0;
    surface.watchPixels(() => {
      pixelsFires += 1;
    });
    surface.watchScenes(() => {
      sceneFires += 1;
    });
    surface.watchBodies(() => {
      bodyFires += 1;
    });
    surface.watchEntities(() => {
      entityFires += 1;
    });
    surface.watchComponents(() => {
      componentFires += 1;
    });

    const counts = () => ({ pixelsFires, sceneFires, bodyFires, entityFires, componentFires });

    emit('initialized', { backend: { kind: 'headless' } });
    expect(counts()).toEqual({ pixelsFires: 1, sceneFires: 0, bodyFires: 0, entityFires: 0, componentFires: 0 });

    emit('resize', { width: 640, height: 480 });
    expect(counts()).toEqual({ pixelsFires: 2, sceneFires: 0, bodyFires: 0, entityFires: 0, componentFires: 0 });

    // The name this grant ADDED to the bus: a ratio change is pixels news and nothing else's.
    emit('pixelRatioChanged', { ratio: 2 });
    expect(counts()).toEqual({ pixelsFires: 3, sceneFires: 0, bodyFires: 0, entityFires: 0, componentFires: 0 });
  });

  it('frame is NOT a watched name — the loop already pulls, so the bus would only change the CADENCE', () => {
    const { runtime, emit } = withBus();
    const surface = createStudioScene(runtime, () => {});
    const heard: string[] = [];
    surface.watchPixels(() => heard.push('news'));

    // Refused for a NEW reason, recorded in the declaration: no reported field keys off whether the loop
    // runs, and `frames`/`draws` already refresh from the component's own rAF pull (Scene3D.tsx:310-314),
    // deliberately sampled every HUD_EVERY_FRAMES. Subscribing here would trade that throttle for a render
    // per frame and call it correctness.
    emit('frame', { delta: 0.016 });
    emit('started');
    emit('stopped');
    expect(heard).toEqual([]);

    // And the leg is alive: the silence is these names', not a dead subscription.
    emit('pixelRatioChanged', { ratio: 1 });
    expect(heard).toEqual(['news']);
  });

  it('disposed is NOT a watched name for the pixels leg either', () => {
    const { runtime, emit } = withBus();
    const surface = createStudioScene(runtime, () => {});
    const heard: string[] = [];
    surface.watchPixels(() => heard.push('news'));

    // v217's refusal holds here too, and for the same reason: `dispose()` disposes the BACKEND, which is
    // this leg's own subject, and the component calls it in the same cleanup that unwatches (Scene3D.tsx:319-330).
    emit('disposed');
    expect(heard).toEqual([]);

    emit('resize', { width: 800, height: 600 });
    expect(heard).toEqual(['news']);
  });
});

describe('watchCameras (M5 v224)', () => {
  function withBus() {
    const listeners = new Map<string, ((data?: unknown) => void)[]>();
    const { runtime } = fakeRuntime({
      addEventListener: (event, listener) => {
        const list = listeners.get(event) ?? [];
        list.push(listener);
        listeners.set(event, list);
      },
      removeEventListener: (event, listener) => {
        const list = listeners.get(event) ?? [];
        const at = list.indexOf(listener);
        if (at !== -1) list.splice(at, 1);
      },
    });
    const emit = (event: string, data?: unknown) => {
      for (const listener of listeners.get(event) ?? []) listener(data);
    };
    return { runtime, listeners, emit };
  }

  it('a host without event verbs answers a no-op unsubscribe instead of crashing', () => {
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {});
    const unwatch = surface.watchCameras(() => {});
    expect(typeof unwatch).toBe('function');
    expect(() => unwatch()).not.toThrow();
  });

  it('a host WITH verbs joins exactly the three camera names with one shared listener, and leaves on all three', () => {
    const on: Array<{ event: string; listener: unknown }> = [];
    const off: Array<{ event: string; listener: unknown }> = [];
    const { runtime } = fakeRuntime({
      addEventListener: (event, listener) => {
        on.push({ event, listener });
      },
      removeEventListener: (event, listener) => {
        off.push({ event, listener });
      },
    });
    const surface = createStudioScene(runtime, () => {});
    const listener = () => {};
    const unwatch = surface.watchCameras(listener);

    expect(on.map((entry) => entry.event)).toEqual(['cameraCreated', 'activeCameraChanged', 'cameraRemoved']);
    expect(new Set(on.map((entry) => entry.listener)).size).toBe(1);
    expect(on[0]!.listener).toBe(listener);

    unwatch();
    expect(off.map((entry) => entry.event).sort()).toEqual(on.map((entry) => entry.event).sort());
    for (const entry of off) expect(entry.listener).toBe(listener);
  });

  it('the THREE camera names each fire the camera leg and none of the other five', () => {
    const { runtime, emit } = withBus();
    const surface = createStudioScene(runtime, () => {});
    let cameraFires = 0;
    let pixelsFires = 0;
    let sceneFires = 0;
    let bodyFires = 0;
    let entityFires = 0;
    let componentFires = 0;
    surface.watchCameras(() => {
      cameraFires += 1;
    });
    surface.watchPixels(() => {
      pixelsFires += 1;
    });
    surface.watchScenes(() => {
      sceneFires += 1;
    });
    surface.watchBodies(() => {
      bodyFires += 1;
    });
    surface.watchEntities(() => {
      entityFires += 1;
    });
    surface.watchComponents(() => {
      componentFires += 1;
    });

    const counts = () => ({ cameraFires, pixelsFires, sceneFires, bodyFires, entityFires, componentFires });

    emit('cameraCreated', { sceneId: 'studio', camera: { id: 'c2', name: 'Review Cam' } });
    expect(counts()).toEqual({ cameraFires: 1, pixelsFires: 0, sceneFires: 0, bodyFires: 0, entityFires: 0, componentFires: 0 });

    emit('activeCameraChanged', { sceneId: 'studio', cameraId: 'c2' });
    expect(counts()).toEqual({ cameraFires: 2, pixelsFires: 0, sceneFires: 0, bodyFires: 0, entityFires: 0, componentFires: 0 });

    // v244 — the third name joins the pin. v239 put it on the leg, and the real-bus census fires it, but on
    // this plane nothing emitted it through the fake bus until the surface grew a caller that reaches it.
    emit('cameraRemoved', { sceneId: 'studio', cameraId: 'c2' });
    expect(counts()).toEqual({ cameraFires: 3, pixelsFires: 0, sceneFires: 0, bodyFires: 0, entityFires: 0, componentFires: 0 });
  });

  it('the scene pair is NOT watched by the camera leg, even though a scene switch moves the camera rows', () => {
    const { runtime, emit } = withBus();
    const surface = createStudioScene(runtime, () => {});
    const heard: string[] = [];
    surface.watchCameras(() => heard.push('news'));

    // The boundary v224 declares and v217 already owns: `activeSceneChanged` and `sceneCreated` change WHICH
    // camera list the report reads (and, for a new scene, empty it), but they are the scene leg's names and the
    // component subscribes BOTH legs. Keeping them out of this pair is what makes the disjointness pin above
    // mean something; a camera leg that also joined them would re-read twice and hide a missing scene leg.
    emit('activeSceneChanged', { sceneId: 'second' });
    emit('sceneCreated', { scene: { id: 'second' } });
    // `disposed` keeps v217's and v218's reason: the component teardown calls it, beside this leg's unwatch.
    emit('disposed');
    expect(heard).toEqual([]);

    // And the leg is alive: the silence is these names', not a dead subscription.
    emit('cameraCreated', { sceneId: 'studio', camera: { id: 'c2' } });
    expect(heard).toEqual(['news']);
  });
});

  /**
   * M5 v227 — what the surface's `load()` answers about the restore, over the FAKE saver.
   *
   * The real-runtime cases live in `scene3dSurface.test.ts`; these are the surface's OWN contract: that it
   * reports the cameras it re-issued rather than doing it silently, and that a host which cannot make a scene
   * active is told so in the surface's voice instead of meeting the runtime's scene-id-shaped refusal.
   */
  describe('load() reports the re-issue rather than doing it silently (M5 v227)', () => {
    it('a cinematic-free file answers an empty re-issue and still lands in a fresh sibling', () => {
      const { runtime, scenes } = fakeRuntime();
      const { saver } = fakeSaver();
      const surface = createStudioScene(runtime, () => {}, undefined, 0, saver);
      const file = surface.save(1);
      // The fake saver's file carries no cinematic, so there is nothing to re-issue and nothing to activate.
      expect((file.cinematic as { sequences: unknown[] }).sequences).toEqual([]);

      const loaded = surface.load(file);

      expect(loaded.reissued).toEqual({ cameraIds: [], activated: false });
      expect(loaded.sceneId).not.toBe(surface.sceneId);
      expect(scenes.size).toBe(2);
    });

    it('a file naming cameras answers each id, in first-appearance order', () => {
      const { runtime } = fakeRuntime();
      const { saver } = fakeSaver();
      const surface = createStudioScene(runtime, () => {}, undefined, 0, saver);
      const file = {
        ...surface.save(1),
        cinematic: {
          sequences: [
            ['a', { id: 'a', sceneId: 'x', shots: [{ id: 's', cameraId: 'cam-1' }, { id: 't', cameraId: 'cam-2' }] }],
            ['b', { id: 'b', sceneId: 'x', shots: [{ id: 'u', cameraId: 'cam-1' }] }],
          ],
          activeSequence: null,
          currentTime: 0,
        },
      };

      const loaded = surface.load(file);

      // Deduped, and in the order the file names them: a host rendering "restored 2 cameras" must not count
      // one twice because two shots address it.
      expect(loaded.reissued.cameraIds).toEqual(['cam-1', 'cam-2']);
      expect(loaded.reissued.activated).toBe(false);
    });

    it('a file describing a RUNNING cutscene is refused on a host with no setActiveScene', () => {
      const { runtime } = fakeRuntime();
      // M5 v261 — the fake's `base` now HAS this verb, because the scene seat became a control and a fake that
      // lacked it could not prove that one. So this case says its own premise instead of inheriting it from the
      // fixture's history: the verb is optional on the seam, and a host without it is legitimate — it simply
      // cannot resume a file describing a running cutscene.
      delete runtime.setActiveScene;
      const { saver } = fakeSaver();
      const surface = createStudioScene(runtime, () => {}, undefined, 0, saver);
      const file = {
        ...surface.save(1),
        cinematic: { sequences: [], activeSequence: 'seq', currentTime: 0.5 },
      };

      expect(() => surface.load(file)).toThrow(/a cutscene that was RUNNING.*no setActiveScene verb/);
    });

    it('a malformed cinematic is the loader\u2019s to refuse, not a crash in the surface', () => {
      const { runtime } = fakeRuntime();
      const { saver } = fakeSaver();
      const surface = createStudioScene(runtime, () => {}, undefined, 0, saver);
      // Untrusted JSON reaching the surface's own reads first: `sequences` is a number here. The surface must
      // find nothing to re-issue and let the loader answer in its own voice.
      const file = { ...surface.save(1), cinematic: { sequences: 7, activeSequence: null, currentTime: 0 } };

      const loaded = surface.load(file);

      expect(loaded.reissued).toEqual({ cameraIds: [], activated: false });
    });
  });

/**
 * M5 v244 — the camera pair on the SURFACE, and the one camera walk the report reads off.
 *
 * v239 gave the runtime a camera-removal verb and the camera leg a third name, and nothing shipped called
 * either: the leg was a subscription to a silence, and the panel's camera figures were a readout of a set
 * that could only ever grow. These are the surface's own answers over a fake whose refusal words are
 * deliberately NOT the production runtime's — so the carry-through claim can only be proved by the host's
 * sentence arriving intact. The production sentences are pinned in `scene3dSurface.test.ts`.
 */
describe('addCamera / removeCamera — the surface authors the camera set (M5 v244)', () => {
  it('every camera figure in the report is a projection of the ONE cameraRows walk', () => {
    const { runtime } = fakeRuntime();
    const built = buildDemoScene(runtime);
    const second = runtime.createCamera(built.sceneId, 'Second Cam');
    // Put the live seat on the SECOND row: a report that read `activeCamera` from a walk of its own could
    // still get this right by accident, and a projection of the rows cannot.
    const rows = runtime.getScene(built.sceneId)!.cameras;
    rows.get(built.cameraId)!.active = false;
    rows.get(second.id)!.active = true;

    const scene = buildSceneReport(runtime, 0).scene!;

    expect(scene.cameraRows).toEqual([
      { id: built.cameraId, name: 'Studio Camera', active: false },
      { id: second.id, name: 'Second Cam', active: true },
    ]);
    expect(scene.cameras).toBe(scene.cameraRows.length);
    expect(scene.cameraNames).toEqual(scene.cameraRows.map((row) => row.name));
    expect(scene.activeCamera).toBe(scene.cameraRows.find((row) => row.active)?.id ?? null);
    // And the VALUES, not only their agreement — three empty rows would satisfy the three lines above.
    expect(scene.cameras).toBe(2);
    expect(scene.cameraNames).toEqual(['Studio Camera', 'Second Cam']);
    expect(scene.activeCamera).toBe(second.id);
  });

  it('addCamera answers the id and the count the LIVE scene now holds, and does not move the active seat', () => {
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {});
    expect(surface.report().scene!.cameras).toBe(1);

    const added = surface.addCamera('Review Cam');

    expect(added).not.toBeNull();
    expect(added!.count).toBe(2);
    const scene = surface.report().scene!;
    // Only a scene's FIRST camera is activated by the insert, and the seat is what this surface's orbit aims,
    // so adding a camera leaves the picture exactly where it was.
    expect(scene.cameraRows.find((row) => row.id === added!.cameraId)).toEqual({
      id: added!.cameraId,
      name: 'Review Cam',
      active: false,
    });
    expect(scene.activeCamera).toBe(surface.cameraId);
    expect(scene.cameraNames).toEqual(['Studio Camera', 'Review Cam']);
  });

  it('addCamera answers null when the host produces a camera with no id', () => {
    const { runtime } = fakeRuntime({ createCamera: () => ({ id: '', name: 'Nothing' }) });
    const surface = createStudioScene(runtime, () => {});

    expect(surface.addCamera('Nothing')).toBeNull();
  });

  it('removeCamera takes a non-active row out and answers the count the report now reads', () => {
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {});
    const added = surface.addCamera('Review Cam')!;

    expect(surface.removeCamera(added.cameraId)).toEqual({ ok: true, cameraId: added.cameraId, count: 1 });
    const scene = surface.report().scene!;
    expect(scene.cameras).toBe(1);
    expect(scene.cameraRows.map((row) => row.name)).toEqual(['Studio Camera']);
    expect(scene.activeCamera).toBe(surface.cameraId);
  });

  it('an id this surface never showed the panel is answered absent, and the host is never asked', () => {
    const asked: string[] = [];
    const { runtime } = fakeRuntime({
      removeCamera: (sceneId, cameraId) => {
        asked.push(`${sceneId}/${cameraId}`);
        return true;
      },
    });
    const surface = createStudioScene(runtime, () => {});

    const answer = surface.removeCamera('camera-never-created');

    expect(asked).toEqual([]);
    expect(answer).toEqual({
      ok: false,
      cameraId: 'camera-never-created',
      why: 'absent',
      reason: `camera camera-never-created is not in scene ${surface.sceneId}, so this surface has nothing to take out`,
    });
    expect(surface.report().scene!.cameras).toBe(1);
  });

  it('the row that holds the active seat comes back blocked with the hosts refusal, and stays in the report', () => {
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {});

    expect(surface.removeCamera(surface.cameraId)).toEqual({
      ok: false,
      cameraId: surface.cameraId,
      why: 'blocked',
      reason: `host refuses: ${surface.cameraId} holds the active seat in ${surface.sceneId}`,
    });
    expect(surface.report().scene!.cameraRows.map((row) => row.id)).toEqual([surface.cameraId]);
  });

  it('a host that refuses by throwing is answered blocked with ITS OWN sentence, paraphrased by nobody', () => {
    // The fake's words are not the production runtime's on purpose: this case can only pass by carrying the
    // host's reason through untouched. A surface that re-worded the refusal would show its own phrasing here.
    const { runtime } = fakeRuntime({
      removeCamera: (_sceneId, cameraId) => {
        throw new Error(`host-sentence: ${cameraId} stays where it is`);
      },
    });
    const surface = createStudioScene(runtime, () => {});
    const added = surface.addCamera('Review Cam')!;

    expect(surface.removeCamera(added.cameraId)).toEqual({
      ok: false,
      cameraId: added.cameraId,
      why: 'blocked',
      reason: `host-sentence: ${added.cameraId} stays where it is`,
    });
    expect(surface.report().scene!.cameraRows.map((row) => row.id)).toContain(added.cameraId);
  });

  it('a host that throws something that is not an Error is still answered in data, not in a crash', () => {
    const { runtime } = fakeRuntime({
      removeCamera: () => {
        throw 'a bare string';
      },
    });
    const surface = createStudioScene(runtime, () => {});
    const added = surface.addCamera('Review Cam')!;

    let answer: ReturnType<SceneSurface['removeCamera']> | null = null;
    expect(() => {
      answer = surface.removeCamera(added.cameraId);
    }).not.toThrow();
    expect(answer).toEqual({ ok: false, cameraId: added.cameraId, why: 'blocked', reason: 'a bare string' });
  });

  it('a host that answers false about a row the surface just saw is told back as absent', () => {
    const { runtime } = fakeRuntime({ removeCamera: () => false });
    const surface = createStudioScene(runtime, () => {});
    const added = surface.addCamera('Review Cam')!;

    expect(surface.removeCamera(added.cameraId)).toEqual({
      ok: false,
      cameraId: added.cameraId,
      why: 'absent',
      reason: `the runtime no longer holds camera ${added.cameraId} in scene ${surface.sceneId}`,
    });
    expect(surface.report().scene!.cameras).toBe(2);
  });

  it('a host with no removal verb at all is answered unsupported, and deletes nothing itself', () => {
    const { runtime } = fakeRuntime();
    delete (runtime as { removeCamera?: unknown }).removeCamera;
    const surface = createStudioScene(runtime, () => {});
    const added = surface.addCamera('Review Cam')!;

    expect(surface.removeCamera(added.cameraId)).toEqual({
      ok: false,
      cameraId: added.cameraId,
      why: 'unsupported',
      reason: 'this host has no camera-removal verb; the surface will not delete a camera it cannot ask the runtime to drop',
    });
    expect(surface.report().scene!.cameras).toBe(2);
  });
});

/**
 * M5 v260 — the ACTIVE seat becomes a control, and every aim follows it.
 *
 * Measured on the shipped bytes before this file changed: with the seat moved to a second camera, one drag
 * wrote the FIRST one (`aimed camera-6, drawn camera-7`), because `aim()` resolved the camera the surface
 * COMPOSED while the runtime renders, picks and walks the player off the row flagged active. So the panel
 * aimed a camera nobody draws from, and the only row it could not take out was the one holding the seat —
 * v244's refusal told the user to `call setActiveCamera first` and there was no such control. These cases run
 * over a fake whose `setActiveCamera` obeys v224's ORDER (look up, then touch flags) but not the production
 * words; the shipped `ThreeRuntime` legs are in `docs/evidence/studio/scene-surface-proof.mjs`.
 */
describe('activateCamera — the seat is a control and the orbit aims the drawn camera (M5 v260)', () => {
  it('activateCamera answers the LIVE seat, the report reads the same row, and a handover is not a frame', () => {
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {}, undefined, 3);
    const composed = surface.report().scene!.cameraRows.find((row) => row.name === 'Studio Camera')!.id;
    const added = surface.addCamera('Review Cam')!;
    expect(surface.report().scene!.activeCamera).toBe(composed);

    const answer = surface.activateCamera(added.cameraId);

    expect(answer).toEqual({ ok: true, cameraId: added.cameraId, activeCamera: added.cameraId });
    const scene = surface.report().scene!;
    expect(scene.activeCamera).toBe(added.cameraId);
    expect(scene.cameraRows).toEqual([
      { id: composed, name: 'Studio Camera', active: false },
      { id: added.cameraId, name: 'Review Cam', active: true },
    ]);
    // The surface's own `cameraId` is the address it was COMPOSED under, not the seat. Rewriting it here
    // would report a camera nobody built and silently re-point `placeCamera`'s first argument.
    expect(surface.cameraId).toBe(composed);
    expect(surface.frames).toBe(3);
  });

  it('one drag writes the camera the renderer DRAWS FROM, not the one the surface composed', () => {
    const { runtime } = fakeRuntime();
    const adapter = fakeAdapter();
    const surface = createStudioScene(runtime, () => {}, adapter);
    const added = surface.addCamera('Review Cam')!;
    // Out of band, through the host's own verb — the seat move the panel's button performs.
    expect(runtime.setActiveCamera!(surface.sceneId, added.cameraId)).toBe(true);
    const writes = adapter.placed.length;

    surface.orbitBy({ azimuth: 0.4 });

    expect(adapter.placed).toHaveLength(writes + 1);
    const last = adapter.placed[adapter.placed.length - 1]!;
    expect(last.cameraId).toBe(added.cameraId);
    // PRE-FIX RED: this line read `surface.cameraId`, because `aim()` resolved the composed row while the
    // renderer drew the seat. The two are different cameras, so the assertion is the defect.
    expect(last.cameraId).not.toBe(surface.cameraId);
    expect(last.position).toEqual(orbitToPlacement(surface.orbit, STUDIO_CAMERA_LOOK_AT).position);
  });

  it('orbit, pan AND reset all aim the seat — one shared read, no call site re-resolving the composed id', () => {
    const { runtime } = fakeRuntime();
    const adapter = fakeAdapter();
    const surface = createStudioScene(runtime, () => {}, adapter);
    const added = surface.addCamera('Review Cam')!;
    runtime.setActiveCamera!(surface.sceneId, added.cameraId);

    surface.orbitBy({ azimuth: 0.4 });
    surface.panBy({ forward: 0.5, right: -0.25 });
    surface.resetOrbit();

    // Every aim path in the surface goes through `aim()`, so all three writes name the seat. A fourth call
    // site added beside them that spells `built.cameraId` would show up as a different id in this array.
    expect(adapter.placed.slice(1).map((p) => p.cameraId)).toEqual([added.cameraId, added.cameraId, added.cameraId]);
  });

  it('the handover aims the new seat with the orbit ALREADY held, so switching keeps the view', () => {
    const { runtime } = fakeRuntime();
    const adapter = fakeAdapter();
    const surface = createStudioScene(runtime, () => {}, adapter);
    surface.orbitBy({ azimuth: 0.9, elevation: 0.3, distance: 1.5 });
    const held = { ...surface.orbit };
    const added = surface.addCamera('Review Cam')!;

    expect(surface.activateCamera(added.cameraId).ok).toBe(true);

    const placement = orbitToPlacement(held, STUDIO_CAMERA_LOOK_AT);
    const last = adapter.placed[adapter.placed.length - 1]!;
    expect(last).toEqual({ sceneId: surface.sceneId, cameraId: added.cameraId, ...placement });
    // The whole point of the handover: a fresh `createCamera` leaves its camera at the origin looking down
    // -Z, so an unaimed seat would replace the user's view with that. The written placement is the orbit's,
    // and it is provably not the opening one.
    expect(placement.position).not.toEqual(STUDIO_CAMERA_POSITION);
    expect(surface.orbit).toEqual(held);
  });

  it('an id this surface never showed the panel is answered absent, and the host is never asked', () => {
    const asked: string[] = [];
    const { runtime } = fakeRuntime({
      setActiveCamera: (sceneId, cameraId) => {
        asked.push(`${sceneId}/${cameraId}`);
        return true;
      },
    });
    const adapter = fakeAdapter();
    const surface = createStudioScene(runtime, () => {}, adapter);
    const writes = adapter.placed.length;

    const answer = surface.activateCamera('camera-never-created');

    expect(asked).toEqual([]);
    expect(answer).toEqual({
      ok: false,
      cameraId: 'camera-never-created',
      why: 'absent',
      reason: `camera camera-never-created is not in scene ${surface.sceneId}, so this surface has no seat to give it`,
    });
    expect(adapter.placed).toHaveLength(writes);
    expect(surface.report().scene!.activeCamera).toBe(surface.cameraId);
  });

  it('a host that answers false about a row the surface just saw is told back as absent, and nothing is aimed', () => {
    const { runtime } = fakeRuntime({ setActiveCamera: () => false });
    const adapter = fakeAdapter();
    const surface = createStudioScene(runtime, () => {}, adapter);
    const added = surface.addCamera('Review Cam')!;
    const writes = adapter.placed.length;

    expect(surface.activateCamera(added.cameraId)).toEqual({
      ok: false,
      cameraId: added.cameraId,
      why: 'absent',
      reason: `the runtime no longer holds camera ${added.cameraId} in scene ${surface.sceneId}`,
    });
    expect(adapter.placed).toHaveLength(writes);
    expect(surface.report().scene!.activeCamera).toBe(surface.cameraId);
  });

  it('a host with no camera-switch verb is answered unsupported, and the surface claims no seat', () => {
    const { runtime } = fakeRuntime();
    delete (runtime as { setActiveCamera?: unknown }).setActiveCamera;
    const adapter = fakeAdapter();
    const surface = createStudioScene(runtime, () => {}, adapter);
    const added = surface.addCamera('Review Cam')!;
    const writes = adapter.placed.length;

    expect(surface.activateCamera(added.cameraId)).toEqual({
      ok: false,
      cameraId: added.cameraId,
      why: 'unsupported',
      reason: 'this host has no camera-switch verb; the surface will not claim a seat it cannot ask the runtime to hold',
    });
    expect(adapter.placed).toHaveLength(writes);
    expect(surface.report().scene!.cameraRows.map((row) => row.active)).toEqual([true, false]);
  });

  it('a host that accepts the seat but leaves the scene naming none answers activeCamera: null, and the aim falls back', () => {
    // v224 keeps a scene that holds cameras holding exactly ONE active row, so this is a host that broke the
    // invariant, not one the product ships. The surface's answer must still be the scene's own truth (no seat)
    // and its aim must still land on SOMETHING — the camera it composed, which is what pre-v260 always aimed.
    const { runtime, scenes } = fakeRuntime({
      setActiveCamera: (sceneId) => {
        for (const camera of scenes.get(sceneId)!.cameras.values()) camera.active = false;
        return true;
      },
    });
    const adapter = fakeAdapter();
    const surface = createStudioScene(runtime, () => {}, adapter);
    const added = surface.addCamera('Review Cam')!;

    expect(surface.activateCamera(added.cameraId)).toEqual({ ok: true, cameraId: added.cameraId, activeCamera: null });
    expect(surface.report().scene!.activeCamera).toBeNull();
    expect(adapter.placed[adapter.placed.length - 1]!.cameraId).toBe(surface.cameraId);
  });

  it('the dead end v244 left open: once the seat moves, the row that held it is removable', () => {
    const { runtime } = fakeRuntime();
    const surface = createStudioScene(runtime, () => {});
    expect(surface.removeCamera(surface.cameraId)).toMatchObject({ ok: false, why: 'blocked' });
    const added = surface.addCamera('Review Cam')!;

    expect(surface.activateCamera(added.cameraId).ok).toBe(true);

    expect(surface.removeCamera(surface.cameraId)).toEqual({ ok: true, cameraId: surface.cameraId, count: 1 });
    const scene = surface.report().scene!;
    expect(scene.cameraRows.map((row) => row.id)).toEqual([added.cameraId]);
    expect(scene.activeCamera).toBe(added.cameraId);
  });

  it('the row that already holds the seat answers ok and moves nothing the user can see', () => {
    const { runtime } = fakeRuntime();
    const adapter = fakeAdapter();
    const surface = createStudioScene(runtime, () => {}, adapter);
    const added = surface.addCamera('Review Cam')!;
    surface.activateCamera(added.cameraId);
    surface.orbitBy({ azimuth: 0.7 });
    const held = { ...surface.orbit };
    const writes = adapter.placed.length;

    expect(surface.activateCamera(added.cameraId)).toEqual({ ok: true, cameraId: added.cameraId, activeCamera: added.cameraId });

    expect(surface.orbit).toEqual(held);
    expect(surface.report().scene!.activeCamera).toBe(added.cameraId);
    // It DOES write — the same numbers, to the same camera. Idempotent in the view, not silent in the adapter:
    // a click that quietly did nothing would be indistinguishable from a host that refused.
    const written = adapter.placed.slice(writes);
    expect(written).toHaveLength(1);
    expect(written[0]).toEqual({ sceneId: surface.sceneId, cameraId: added.cameraId, ...orbitToPlacement(held, STUDIO_CAMERA_LOOK_AT) });
  });

  it('a one-camera scene aims exactly what it aimed before the seat was a control', () => {
    // The seat and the composed row are the same camera in a single-camera scene, which is the case every
    // existing proof runs. Without this line, 'the orbit aims the seat' could be satisfied only by scenes
    // that already have two rows.
    const { runtime } = fakeRuntime();
    const adapter = fakeAdapter();
    const surface = createStudioScene(runtime, () => {}, adapter);

    surface.orbitBy({ azimuth: 0.5 });

    expect(surface.report().scene!.cameras).toBe(1);
    expect(adapter.placed[1]!.cameraId).toBe(surface.cameraId);
  });
});

/**
 * M5 v261 — the SCENE seat becomes a control, one level above v260's camera seat.
 *
 * The shape of the defect is the same and so is the discipline for proving the fix: build a graph whose active
 * row is NOT the scene this surface composed, then ask the surface to do the things the panel offers and check
 * which world each ask touched. Every case below is written so it CANNOT pass when a verb still names the
 * composed scene — the assertion names the other scene, not just "something changed".
 */
describe('activateScene — the world the panel reads is the world it writes (M5 v261)', () => {
  /** A second scene with one body and one camera — the situation `load()` has produced since v163, reached
   *  here without the save format so the cases below stay about the seat, not about the file. */
  function twoScenes() {
    const { runtime, scenes, created } = fakeRuntime();
    const adapter = fakeAdapter();
    const surface = createStudioScene(runtime, () => {}, adapter);
    const second = runtime.createScene('Second World');
    runtime.createEntity(second.id, 'Solo Body', 'mesh');
    const secondCamera = runtime.createCamera(second.id, 'Second Cam');
    return { runtime, scenes, created, adapter, surface, second, secondCamera };
  }

  it('the rows, the count and the active address are one walk, and the switch moves all three', () => {
    const { surface, second } = twoScenes();
    const before = surface.report();
    expect(before.scenes).toBe(2);
    expect(before.activeSceneId).toBe(surface.sceneId);
    // Two rows, each saying how much is in that world — the figure that makes the rows distinguishable.
    expect(before.sceneRows).toEqual([
      { id: surface.sceneId, name: 'Studio Scene', entities: 4, active: true },
      { id: second.id, name: 'Second World', entities: 1, active: false },
    ]);

    const answer = surface.activateScene(second.id);
    expect(answer).toEqual({ ok: true, sceneId: second.id, activeSceneId: second.id, aimed: true });

    const after = surface.report();
    expect(after.activeSceneId).toBe(second.id);
    expect(after.scene!.name).toBe('Second World');
    // The summary is the SAME row the list walks: `scenes` did not become a third answer.
    expect(after.scenes).toBe(after.sceneRows.length);
    expect(after.sceneRows.map((row) => row.active)).toEqual([false, true]);
    // The camera figures follow the world, because they were always read from `report.scene`.
    expect(after.scene!.cameraRows.map((row) => row.name)).toEqual(['Second Cam']);
  });

  it('a seat naming a world the graph does not hold answers null, not an address no row lists (M5 v261)', () => {
    // The ONE state in which this grant's two reads could disagree, and therefore the only witness the
    // one-walk refactor has: pre-v261 `scenes` came from `scenes.size` and `activeSceneId` was copied from
    // `graph.activeSceneId`, so a host whose graph names a world it does not hold produced a report that
    // claimed an active scene ABSENT from the rows printed beside it — the panel would point at an (N+1)-th
    // world while drawing N. The shipped runtime cannot reach this state (it has no scene-deletion verb), but
    // `SceneGraph` is plain data a host builds, so the derivation has to answer it anyway.
    const { runtime, surface, second } = twoScenes();
    const graph = runtime.getSceneGraph!();
    const ghost = {
      ...runtime,
      getSceneGraph: () => ({ ...graph, activeSceneId: 'a-world-the-graph-never-held' }),
    } as SceneComposerLike;

    const report = buildSceneReport(ghost, 0);
    // The walk is unchanged — it lists what exists and marks nothing active, because the address is read FROM
    // the rows rather than handed to them.
    expect(report.sceneRows.map((row) => row.id)).toEqual([surface.sceneId, second.id]);
    expect(report.sceneRows.map((row) => row.active)).toEqual([false, false]);
    expect(report.scenes).toBe(report.sceneRows.length);
    expect(report.activeSceneId).toBeNull();
    expect(report.scene).toBeNull();
  });

  it('after the switch, an orbit aims the camera of the scene being READ', () => {
    // The measured pre-fix half of this grant's defect: the report listed the second world's camera while the
    // drag wrote the composed scene's, so the picture answered the mouse in a world nobody was looking at.
    const { surface, adapter, second, secondCamera } = twoScenes();
    surface.activateScene(second.id);
    const writes = adapter.placed.length;

    surface.orbitBy({ azimuth: 0.6 });

    const last = adapter.placed[writes]!;
    expect(last).toEqual({
      sceneId: second.id,
      cameraId: secondCamera.id,
      ...orbitToPlacement(surface.orbit, STUDIO_CAMERA_LOOK_AT),
    });
    // The composed scene's camera was NOT touched by this drag.
    expect(adapter.placed.slice(writes).some((w) => w.cameraId === surface.cameraId)).toBe(false);
  });

  it('the handover aims with the orbit the person ALREADY holds, not with the default', () => {
    // A switch that re-aimed from `STUDIO_ORBIT_DEFAULT` would snap the view back every time a row was clicked,
    // which is a change the user did not ask for; the write must carry the held numbers.
    const { surface, adapter, second, secondCamera } = twoScenes();
    surface.orbitBy({ azimuth: 1.1, elevation: 0.2 });
    const held = { ...surface.orbit };
    const writes = adapter.placed.length;

    expect(surface.activateScene(second.id)).toMatchObject({ ok: true, aimed: true });

    expect(adapter.placed).toHaveLength(writes + 1);
    expect(adapter.placed[writes]).toEqual({
      sceneId: second.id,
      cameraId: secondCamera.id,
      ...orbitToPlacement(held, STUDIO_CAMERA_LOOK_AT),
    });
    expect(surface.orbit).toEqual(held);
  });

  it('a world with no camera of its own answers aimed: false and aims nothing', () => {
    // `createScene` starts an empty camera Map, so switching into one is a real input — and the composed
    // camera is a camera of a DIFFERENT scene, so falling back to it here would be the cross-scene bug this
    // grant exists to close, one line deeper.
    const { runtime, surface, adapter } = twoScenes();
    const empty = runtime.createScene('World With Nothing In It');
    const writes = adapter.placed.length;

    expect(surface.activateScene(empty.id)).toMatchObject({ ok: true, activeSceneId: empty.id, aimed: false });

    expect(adapter.placed).toHaveLength(writes);
    expect(surface.report().scene!.cameras).toBe(0);
  });

  it('the switch clears the pick, because a selection is a body in a scene', () => {
    const { runtime, adapter, second } = twoScenes();
    const withPick = { ...adapter, pickAt: () => ({ entityId: 'entity-1', name: 'Ground', distance: 1 }) };
    const picking = createStudioScene(runtime, () => {}, withPick, 0);
    picking.pickAt(100, 100);
    expect(picking.report().selected).toEqual({ id: 'entity-1', name: 'Ground' });

    picking.activateScene(second.id);

    expect(picking.report().selected).toBeNull();
    expect(picking.report().inspector).toBeNull();
  });

  it('a scene the graph does not hold is answered absent, and the seat does not move', () => {
    const { surface, adapter } = twoScenes();
    const writes = adapter.placed.length;

    expect(surface.activateScene('scene-does-not-exist')).toEqual({
      ok: false,
      sceneId: 'scene-does-not-exist',
      why: 'absent',
      reason: "scene scene-does-not-exist is not in the runtime's graph, so this surface has no world to switch to",
    });
    expect(surface.report().activeSceneId).toBe(surface.sceneId);
    // Lookup BEFORE asking: a refused switch may not write a camera anywhere.
    expect(adapter.placed).toHaveLength(writes);
  });

  it('a host with no scene-switch verb answers unsupported and changes nothing', () => {
    const { runtime, surface } = twoScenes();
    delete runtime.setActiveScene;

    expect(surface.activateScene('any')).toEqual({
      ok: false,
      sceneId: 'any',
      why: 'unsupported',
      reason: 'this host has no scene-switch verb; the surface will not claim a world it cannot ask the runtime to make live',
    });
    expect(surface.report().activeSceneId).toBe(surface.sceneId);
  });

  it('the camera authoring pair follows the switch, so the rows the panel shows are its own', () => {
    // This is the user-visible refusal the probe measured: the report listed ["Second Cam"] while `addCamera`
    // answered count 2 — the composed scene's rows — and `removeCamera` refused a row the panel had just drawn
    // with "camera … is not in scene <composed>, so this surface has nothing to take out".
    const { scenes, surface, second, secondCamera } = twoScenes();
    surface.activateScene(second.id);

    const added = surface.addCamera('Third Cam')!;
    expect(scenes.get(second.id)!.cameras.has(added.cameraId)).toBe(true);
    expect(added.count).toBe(2);

    // A non-seat row in the NEW world is removable, and the count comes back from the NEW world.
    expect(surface.removeCamera(added.cameraId)).toEqual({ ok: true, cameraId: added.cameraId, count: 1 });
    // The seat's refusal still arrives, and its sentence names the world being looked at — pre-v261 it named
    // the composed one, which is the half of the lie a user reads.
    const refused = surface.removeCamera(secondCamera.id);
    expect(refused).toMatchObject({ ok: false, why: 'blocked' });
    expect(refused.ok === false && refused.reason).toContain(second.id);
    // An id the panel never drew is answered by the surface, in the live world's address.
    const absent = surface.removeCamera('camera-never-listed');
    expect(absent).toMatchObject({ ok: false, why: 'absent' });
    expect(absent.ok === false && absent.reason).toContain(second.id);
  });

  it('save() files the world being looked at', () => {
    const { runtime, second } = twoScenes();
    const { saver, saved } = fakeSaver();
    const withSaver = createStudioScene(runtime, () => {}, undefined, 0, saver);
    withSaver.activateScene(second.id);

    withSaver.save(7);

    expect(saved).toEqual([{ sceneId: second.id, savedAt: 7 }]);
  });

  it('the light, rename, hide and component asks reach the live world', () => {
    const writes: string[] = [];
    // ONE host for the whole case: a second `fakeRuntime()` would be a second graph, and switching to a scene
    // it does not hold is a refusal, not a write.
    const { runtime } = fakeRuntime({
      setLightState: (sceneId) => {
        writes.push(`light:${sceneId}`);
        return true;
      },
      setEntityName: (sceneId, entityId, name) => {
        writes.push(`name:${sceneId}:${entityId}:${name}`);
        return true;
      },
      setEntityVisible: (sceneId, entityId, visible) => {
        writes.push(`visible:${sceneId}:${entityId}:${String(visible)}`);
        return true;
      },
      getEntity: (_sceneId: string, entityId: string) => ({ id: entityId, name: 'Solo Body' }),
      setComponentEnabled: (sceneId, entityId, type, enabled) => {
        writes.push(`component:${sceneId}:${entityId}:${type}:${String(enabled)}`);
        return true;
      },
    });
    const surface = createStudioScene(
      runtime,
      () => {},
      { ...fakeAdapter(), pickAt: () => ({ entityId: 'entity-9', name: 'Solo Body', distance: 1 }) },
      0,
    );
    const second = runtime.createScene('Second World');
    surface.activateScene(second.id);
    surface.pickAt(10, 10);
    surface.setLight('light-1', { intensity: 2 });
    surface.renameSelected('Renamed in B');
    surface.setSelectedVisible(false);
    surface.toggleComponentEnabled('mesh');

    expect(writes).toEqual([
      `light:${second.id}`,
      `name:${second.id}:entity-9:Renamed in B`,
      `visible:${second.id}:entity-9:false`,
      `component:${second.id}:entity-9:mesh:true`,
    ]);
  });

  it('a pick casts its ray in the world being looked at', () => {
    const { runtime, surface, second } = twoScenes();
    const scenes: string[] = [];
    const picking = createStudioScene(
      runtime,
      () => {},
      {
        ...fakeAdapter(),
        pickAt: (sceneId) => {
          scenes.push(sceneId);
          return null;
        },
      },
      0,
    );
    picking.pickAt(10, 10);
    picking.activateScene(second.id);
    picking.pickAt(10, 10);

    expect(scenes).toEqual([surface.sceneId, second.id]);
  });

  it('THE BOUND: a body still lands in the scene whose frame loop this surface drives', () => {
    // Deliberate, and written down so a future change is a decision rather than drift. The host resolves the
    // frame writer against `surface.sceneId` (Scene3D.tsx:238) and the document send against the same address
    // (:807), so a body filed into whatever world is live would join `bodyIds` and never be drawn.
    const { scenes, surface, second } = twoScenes();
    surface.activateScene(second.id);

    const added = surface.addBody('Authored Body', 'mesh')!;

    expect(scenes.get(surface.sceneId)!.entities.has(added.bodyId)).toBe(true);
    expect(scenes.get(second.id)!.entities.has(added.bodyId)).toBe(false);
    expect(surface.bodyIds).toContain(added.bodyId);
    // And the removal takes it back out of the same world it went into.
    expect(surface.removeBody(added.bodyId)).toBe(true);
    expect(scenes.get(surface.sceneId)!.entities.has(added.bodyId)).toBe(false);
  });
});
