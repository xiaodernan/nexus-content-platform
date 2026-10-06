/**
 * M5 v142 — the Studio's 3D surface, split the way ADR 0005 splits the 2D one: the MODEL is pure and
 * testable, the renderer is a component.
 *
 * Why this file exists: every M5 grant so far ended with the same bound — *"no Studio surface, HUD or
 * agent tool imports `@nexus/three-runtime`; the roadmap's M5 entry is still a runtime with tests, not
 * a feature a user can open."* v140 closed the agent half (`agents/runtime/src/sceneTools.ts` over a
 * `SceneDriver` seam). This is the PRODUCT half.
 *
 * It is written so that the two claims a reviewer actually cares about — *what scene did we compose*
 * and *what is the runtime's state right now* — are pure functions over a narrow structural interface,
 * unit-testable without React, without a DOM and without three.js.
 *
 * The interface below is deliberately STRUCTURAL rather than `import type { ThreeRuntime }`: this
 * module must stay loadable on the server (Next.js evaluates it during SSR) and in a plain vitest
 * process, neither of which has a GL context. `Scene3D.tsx` is the only place that touches a canvas,
 * and it is the only place that converts the plain `SceneVec3` here into what the package declares
 * (`THREE.Vector3`, a `THREE.Camera` it can aim).
 *
 * That split is not decoration, and this increment is where it paid: the package's `createEntity`
 * takes a `THREE.Vector3` (not a plain `{x,y,z}`), an entity's body is `threeObject` (not `object3D`)
 * and `createCamera` places a camera nowhere — all three would have type-checked against a looser
 * interface and two of them would have been wrong at runtime. `test/scene3dSurface.test.ts` runs the
 * REAL `ThreeRuntime` through these functions on the headless seam, so the structural claim is
 * measured rather than asserted.
 */

/** The parts of a scene the Studio reports. Structural, so a test can build one without three.js. */
export interface SceneLike {
  id: string;
  name: string;
  entities: Map<string, { id: string; name: string }>;
  cameras: Map<string, { id: string; name: string; active: boolean }>;
  animations: Map<string, { id: string }>;
  /** The three.js scene itself, when the object in hand really is the package's. Read by the adapter
   *  to reach a camera; never touched by the pure functions above it. */
  threeScene?: unknown;
}

/** The parts of the runtime this module reads. Every method here exists on the real `ThreeRuntime`;
 *  nothing is invented for the Studio's convenience. */
export interface SceneRuntimeLike {
  getBackend(): { kind: string; state: { width: number; height: number; pixelRatio: number } } | null;
  getSceneGraph(): {
    scenes: Map<string, SceneLike>;
    activeSceneId: string | null;
    stats?: { drawCalls: number; triangles: number; points: number; lines: number };
  };
  getScene(id: string): SceneLike | undefined;
}

export interface SceneVec3 {
  x: number;
  y: number;
  z: number;
}

/** The same narrow surface, plus the write calls `buildDemoScene` needs. */
export interface SceneComposerLike extends SceneRuntimeLike {
  createScene(name: string): SceneLike;
  createEntity(sceneId: string, name: string, type: string, geometry?: unknown, material?: unknown, position?: SceneVec3): { id: string };
  createCamera(sceneId: string, name: string): { id: string; name: string };
  /** `false` when the runtime holds no such entity. Added in v161 with the remove-body control — the
   *  runtime has always had it; nothing in the Studio had ever called it. */
  removeEntity(sceneId: string, entityId: string): boolean;
}

/**
 * The write calls that only a REAL runtime can serve.
 *
 * `ThreeRuntime.createCamera` builds a camera at the origin looking down -Z, and the type it declares
 * exposes the `three.Camera` it wrapped. Aiming it is therefore a three.js operation, which the pure
 * half may not perform and a fake need not implement: this is the whole of what the adapter adds.
 */
export interface SceneAdapterLike {
  /** Put a camera at `position` looking at `lookAt`. Returns false when it could not (a missing
   *  scene/camera, or a runtime whose cameras are not three.js objects). */
  placeCamera(sceneId: string, cameraId: string, position: SceneVec3, lookAt: SceneVec3): boolean;
}

/** Where the demo camera stands. Far enough out to see four bodies, close enough to read their faces. */
export const STUDIO_CAMERA_POSITION: SceneVec3 = { x: 4.2, y: 3.1, z: 6.4 };
export const STUDIO_CAMERA_LOOK_AT: SceneVec3 = { x: 0, y: -0.2, z: 0 };

/**
 * M5 v161 — the camera's ORBIT, as a pure function of three numbers.
 *
 * v142 placed the camera ONCE, at a fixed position, and never moved it again: `STUDIO_CAMERA_POSITION` was
 * written into the scene and read by nothing afterwards. That demonstrates a camera; it is not a camera a
 * person can use. This turns the same placement into spherical coordinates — the two v142 constants become
 * the DEFAULT orbit rather than the only view — so orbit and zoom are arithmetic the pure suite can assert
 * with no DOM and no three.js, and the component only has to forward pointer events.
 */
export interface OrbitState {
  /** Rotation about the world Y axis, in radians, normalised to (−π, π]. */
  azimuth: number;
  /** Height above the horizon, in radians. Clamped so the camera never flips over a pole. */
  elevation: number;
  /** Distance from the target, in world units. */
  distance: number;
}

/** How far the camera may tilt. Just short of the poles, where `lookAt` has no stable up vector. */
export const ORBIT_ELEVATION_LIMIT = (85 * Math.PI) / 180;
/** How close and how far the camera may get, in world units. */
export const ORBIT_DISTANCE_MIN = 2;
export const ORBIT_DISTANCE_MAX = 40;

/** Fold any angle into (−π, π]. Without this an orbit accumulates without bound and the number a report
 *  prints stops meaning "where the camera is" and starts meaning "how much the user has dragged". */
export function normalizeAngle(radians: number): number {
  const twoPi = Math.PI * 2;
  let a = radians % twoPi;
  if (a <= -Math.PI) a += twoPi;
  else if (a > Math.PI) a -= twoPi;
  return a;
}

/** The placement a given orbit produces, relative to `target`. */
export function orbitToPlacement(orbit: OrbitState, target: SceneVec3): { position: SceneVec3; lookAt: SceneVec3 } {
  const cosElevation = Math.cos(orbit.elevation);
  return {
    position: {
      x: target.x + orbit.distance * cosElevation * Math.sin(orbit.azimuth),
      y: target.y + orbit.distance * Math.sin(orbit.elevation),
      z: target.z + orbit.distance * cosElevation * Math.cos(orbit.azimuth),
    },
    lookAt: { x: target.x, y: target.y, z: target.z },
  };
}

/** The orbit that produces a given placement — the inverse, used below to turn v142's fixed pair into the
 *  default orbit instead of restating its numbers here where the two could drift apart. */
export function orbitFromPlacement(position: SceneVec3, target: SceneVec3): OrbitState {
  const dx = position.x - target.x;
  const dy = position.y - target.y;
  const dz = position.z - target.z;
  const horizontal = Math.hypot(dx, dz);
  return {
    azimuth: normalizeAngle(Math.atan2(dx, dz)),
    elevation: Math.atan2(dy, horizontal),
    distance: Math.hypot(horizontal, dy),
  };
}

/**
 * The Studio's default orbit, DERIVED from v142's constants rather than restated.
 *
 * The pure suite asserts the round trip lands back on `STUDIO_CAMERA_POSITION`, which is what makes the
 * opening view unchanged by this increment — a hand-written `{ azimuth: 0.58, … }` here would look right
 * and could be wrong.
 */
export const STUDIO_ORBIT_DEFAULT: OrbitState = orbitFromPlacement(STUDIO_CAMERA_POSITION, STUDIO_CAMERA_LOOK_AT);

/** How far one pointer move or one wheel notch may turn the camera. */
export const ORBIT_RADIANS_PER_PIXEL = 0.01;
export const ORBIT_ZOOM_PER_NOTCH = 0.1;

/**
 * Apply a delta to an orbit, clamping what has a limit and folding what does not.
 *
 * Elevation is clamped at the poles (a camera past them turns over and the view flips), distance is clamped
 * to its range (zero or negative distance puts the camera inside its target), and azimuth is normalised —
 * it has no natural bound, so it is folded rather than clamped.
 */
export function applyOrbit(orbit: OrbitState, delta: { azimuth?: number; elevation?: number; distance?: number }): OrbitState {
  const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
  return {
    azimuth: normalizeAngle(orbit.azimuth + (delta.azimuth ?? 0)),
    elevation: clamp(orbit.elevation + (delta.elevation ?? 0), -ORBIT_ELEVATION_LIMIT, ORBIT_ELEVATION_LIMIT),
    distance: clamp(orbit.distance + (delta.distance ?? 0), ORBIT_DISTANCE_MIN, ORBIT_DISTANCE_MAX),
  };
}

/**
 * The Studio's scene, as a plain JSON-safe report.
 *
 * `frames` is passed IN rather than read off the runtime: the runtime does not count frames, the frame
 * loop does, and the component that owns the loop is the only thing that can answer honestly. A report
 * that invented a frame count would be the kind of number this project keeps writing amendments about.
 */
export interface SceneReport {
  schema: 1;
  /** Which renderer answered: `webgl` in a browser, `headless` where there is no GL context. */
  backend: string | null;
  /** The canvas the backend is drawing into, or null when it owns no surface. */
  pixels: { width: number; height: number; pixelRatio: number } | null;
  scenes: number;
  activeSceneId: string | null;
  scene: {
    id: string;
    name: string;
    entities: number;
    cameras: number;
    animations: number;
    entityNames: string[];
    cameraNames: string[];
    activeCamera: string | null;
  } | null;
  /** Frames the LOOP produced, counted by its owner — not by the renderer. */
  frames: number;
  draws: { calls: number; triangles: number; points: number; lines: number };
  /**
   * The camera's orbit (M5 v161). Reported from the SURFACE that holds it — the runtime has no orbit of its
   * own, so a report that invented one would be describing a camera nobody moved.
   */
  orbit: OrbitState;
}

const EMPTY_STATS = { drawCalls: 0, triangles: 0, points: 0, lines: 0 };

/**
 * Build the Studio's demo scene: three bodies standing on a ground, and one camera aimed at them.
 *
 * It is deliberately SMALL and deliberately visible from the position above — the point is a surface a
 * person can open and a harness can photograph, not a showcase. Everything it creates is a declared
 * `ThreeEntity` type the runtime already supports; no geometry is invented here beyond boxes and a
 * plane, both of which are the runtime's own defaults when `createEntity` is given none.
 */
export function buildDemoScene(
  runtime: SceneComposerLike,
  adapter?: SceneAdapterLike,
): { sceneId: string; cameraId: string; bodyIds: string[] } {
  const scene = runtime.createScene('Studio Scene');
  const sceneId = scene.id;

  // `createEntity` builds its own default geometry and material per kind, so the Studio passes only a
  // name, a kind and a position. A caller that wants a specific mesh has the runtime's own API for it.
  const bodyIds = [
    runtime.createEntity(sceneId, 'Ground', 'mesh', undefined, undefined, { x: 0, y: -1, z: 0 }).id,
    runtime.createEntity(sceneId, 'Cube A', 'mesh', undefined, undefined, { x: -1.6, y: 0, z: 0 }).id,
    runtime.createEntity(sceneId, 'Cube B', 'mesh', undefined, undefined, { x: 0, y: 0.4, z: 0 }).id,
    runtime.createEntity(sceneId, 'Cube C', 'mesh', undefined, undefined, { x: 1.6, y: 0, z: 0 }).id,
  ];

  const camera = runtime.createCamera(sceneId, 'Studio Camera');
  // The first camera a scene gets is made active by the runtime itself, so nothing here has to ask.
  // Aiming it is the adapter's job and its ANSWER is not checked here: a fake without cameras is a
  // legitimate host (the pure suite uses one), and `buildSceneReport` is what reports the truth.
  adapter?.placeCamera(sceneId, camera.id, STUDIO_CAMERA_POSITION, STUDIO_CAMERA_LOOK_AT);

  return { sceneId, cameraId: camera.id, bodyIds };
}

/**
 * Read the runtime's state back as a plain report.
 *
 * `activeSceneId` is the graph's own answer, and the scene summary is read from the scene the graph
 * points at — so a report can never describe a scene the runtime is not actually holding as active.
 */
export function buildSceneReport(runtime: SceneRuntimeLike, frames: number, orbit: OrbitState = STUDIO_ORBIT_DEFAULT): SceneReport {
  const graph = runtime.getSceneGraph();
  const activeSceneId = graph.activeSceneId;
  const scene = activeSceneId ? runtime.getScene(activeSceneId) : undefined;
  const backend = runtime.getBackend();
  const stats = graph.stats ?? EMPTY_STATS;

  return {
    schema: 1,
    backend: backend?.kind ?? null,
    pixels: backend ? { ...backend.state } : null,
    scenes: graph.scenes.size,
    activeSceneId: activeSceneId ?? null,
    scene: scene
      ? {
          id: scene.id,
          name: scene.name,
          entities: scene.entities.size,
          cameras: scene.cameras.size,
          animations: scene.animations.size,
          entityNames: [...scene.entities.values()].map((e) => e.name),
          cameraNames: [...scene.cameras.values()].map((c) => c.name),
          activeCamera: [...scene.cameras.values()].find((c) => c.active)?.id ?? null,
        }
      : null,
    frames,
    draws: {
      calls: stats.drawCalls,
      triangles: stats.triangles,
      points: stats.points,
      lines: stats.lines,
    },
    orbit,
  };
}

/**
 * The per-frame spin, as a pure function of elapsed seconds.
 *
 * Kept here rather than inline in the component so the one thing a reviewer would otherwise have to
 * trust — that the animation is a function of time and not of a frame counter — is testable.
 */
export function spinAt(elapsedSeconds: number): { y: number; bob: number } {
  return { y: elapsedSeconds * 0.8, bob: Math.sin(elapsedSeconds * 1.6) * 0.25 };
}

/**
 * A composed, running Studio scene — everything the React component needs, and the only thing that
 * knows how many frames have gone by.
 *
 * `step` is the ONE place a body is moved, so the wall-clock loop in the component and the
 * deterministic loop in a test run the same arithmetic: the clock's delta is the only thing a test
 * cannot control, and it is out of the path this function asserts on.
 */
export interface SceneSurface {
  readonly sceneId: string;
  readonly cameraId: string;
  /**
   * The bodies the surface currently holds. **LIVE**: `addBody`/`removeBody` mutate this array in place, so
   * the frame writer the component passed in always sees the current set rather than the mount-time one.
   */
  readonly bodyIds: string[];
  /** Frames this surface has advanced. Reported, never estimated by a reader. */
  readonly frames: number;
  /** The camera's orbit as the surface currently has it. */
  readonly orbit: OrbitState;
  /** Advance to `elapsedSeconds` and return the runtime's state at that instant. */
  step(elapsedSeconds: number): SceneReport;
  /** The report at the CURRENT frame count, without advancing. */
  report(): SceneReport;
  /** Turn the camera by a delta. Elevation clamps at the poles, distance at its range, azimuth folds. */
  orbitBy(delta: { azimuth?: number; elevation?: number; distance?: number }): SceneReport;
  /** Put the camera back to the default orbit — the view the Studio opens with. */
  resetOrbit(): SceneReport;
  /** Add a body at the next free slot. Answers `null` when the runtime produced no entity. */
  addBody(name: string, kind: string): { bodyId: string; count: number } | null;
  /** Remove a body. Answers `false` when this surface does not hold it — the same answer `disk.write` gives
   *  for a path it was never given. */
  removeBody(bodyId: string): boolean;
}

/**
 * Where the n-th added body goes: a ring around the origin, so two added bodies never occupy one place and
 * none of them lands inside the three composed shots.
 *
 * The composed scene is deliberately left alone — `Ground`, `Cube A/B/C` keep the positions v142 gave them,
 * because the existing proof asserts that view and a "add a body" feature that also MOVED the existing ones
 * would be a different increment wearing this one's name.
 */
export function nextBodyPlacement(index: number): SceneVec3 {
  const angle = (index * Math.PI) / 3;
  return { x: Math.cos(angle) * 2.6, y: 0, z: Math.sin(angle) * 2.6 };
}

/**
 * Build the demo scene on `runtime`, aim its camera through `adapter`, and hand back the loop it is
 * driven by.
 *
 * `writeFrame` is where the three.js write happens — the component passes a callback that assigns
 * rotations, a test passes a recorder. Everything above it (which bodies, how many frames, what the
 * runtime then says) is this module's, which is why the pure suite can assert the whole surface.
 *
 * The adapter stays a SEPARATE argument rather than being merged into the runtime: the real
 * `ThreeRuntime` carries its methods on the prototype, so spreading it into an object literal silently
 * drops `getScene` and every other method behind it. Measured the hard way — `Object.assign(runtime,
 * adapter)` type-checks and fails at the first call.
 */
export function createStudioScene(
  runtime: SceneComposerLike,
  writeFrame: (bodyIds: string[], motion: { y: number; bob: number }) => void,
  adapter?: SceneAdapterLike,
  frames = 0,
): SceneSurface {
  const built = buildDemoScene(runtime, adapter);
  let counted = frames;
  let orbit = STUDIO_ORBIT_DEFAULT;

  // A copy, not the array `buildDemoScene` returned: the surface owns its body list from here on, and the
  // builder's array is a construction detail. Mutated in place so the frame writer sees the current set.
  const bodyIds = [...built.bodyIds];
  let added = 0;

  /** Aim the camera at the current orbit. A no-op when there is no adapter — a fake without cameras is a
   *  legitimate host, and the report is what says whether the aim happened. */
  const aim = () => {
    const placement = orbitToPlacement(orbit, STUDIO_CAMERA_LOOK_AT);
    adapter?.placeCamera(built.sceneId, built.cameraId, placement.position, placement.lookAt);
  };

  return {
    sceneId: built.sceneId,
    cameraId: built.cameraId,
    bodyIds,
    get frames() {
      return counted;
    },
    get orbit() {
      return orbit;
    },
    report() {
      return buildSceneReport(runtime, counted, orbit);
    },
    step(elapsedSeconds) {
      counted += 1;
      writeFrame(bodyIds, spinAt(elapsedSeconds));
      return buildSceneReport(runtime, counted, orbit);
    },
    orbitBy(delta) {
      orbit = applyOrbit(orbit, delta);
      aim();
      return buildSceneReport(runtime, counted, orbit);
    },
    resetOrbit() {
      orbit = STUDIO_ORBIT_DEFAULT;
      aim();
      return buildSceneReport(runtime, counted, orbit);
    },
    addBody(name, kind) {
      const entity = runtime.createEntity(
        built.sceneId,
        name,
        kind,
        undefined,
        undefined,
        nextBodyPlacement(added),
      );
      if (!entity?.id) return null;
      added += 1;
      bodyIds.push(entity.id);
      return { bodyId: entity.id, count: bodyIds.length };
    },
    removeBody(bodyId) {
      const at = bodyIds.indexOf(bodyId);
      if (at === -1) return false;
      bodyIds.splice(at, 1);
      // The runtime owns the entity; this surface only stops tracking it. Both must move, or the report
      // would count a body the loop no longer writes.
      runtime.removeEntity(built.sceneId, bodyId);
      return true;
    },
  };
}
