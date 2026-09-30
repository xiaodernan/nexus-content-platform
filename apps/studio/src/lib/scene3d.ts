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
export function buildSceneReport(runtime: SceneRuntimeLike, frames: number): SceneReport {
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
  readonly bodyIds: string[];
  /** Frames this surface has advanced. Reported, never estimated by a reader. */
  readonly frames: number;
  /** Advance to `elapsedSeconds` and return the runtime's state at that instant. */
  step(elapsedSeconds: number): SceneReport;
  /** The report at the CURRENT frame count, without advancing. */
  report(): SceneReport;
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

  return {
    sceneId: built.sceneId,
    cameraId: built.cameraId,
    bodyIds: built.bodyIds,
    get frames() {
      return counted;
    },
    report() {
      return buildSceneReport(runtime, counted);
    },
    step(elapsedSeconds) {
      counted += 1;
      writeFrame(built.bodyIds, spinAt(elapsedSeconds));
      return buildSceneReport(runtime, counted);
    },
  };
}
