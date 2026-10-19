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
 *
 * M5 v163 adds the second half of that split: persistence and the document. `SceneSaverLike` is the
 * save-file seam (structural, for the same SSR reason), the surface's `save()`/`load()` go through it
 * rather than paraphrasing the runtime's format, and `composeDocumentOps` is a pure function over the
 * real design-model ops — so what the "send to document" button commits is an ordinary, undoable
 * `addSubtree` that every existing document tool can already read, undo and export.
 */

import { frameNode, ops, textNode, type Op } from '@nexus/design-model';

/** The parts of a scene the Studio reports. Structural, so a test can build one without three.js. */
export interface SceneLike {
  id: string;
  name: string;
  /** v192 — the entity shape is read LOOSELY (the way `lighting` is): every host declares id and name;
   *  kind, visibility and position are wherever the host keeps them (the real runtime keeps the
   *  position on the wrapped three.js object, reachable through `transform.position`), and a host that
   *  declares none simply reports an inspector with fewer facts. */
  entities: Map<string, { id: string; name: string; type?: string; visible?: boolean; position?: SceneVec3; transform?: { position?: SceneVec3 }; components?: unknown }>;
  cameras: Map<string, { id: string; name: string; active: boolean }>;
  animations: Map<string, { id: string }>;
  /** v183 — the scene's declared lights, read LOOSELY: a host that declares none simply reports none,
   *  the same way `threeScene` is optional. The brightness lives wherever the host keeps it — on the
   *  real runtime that is the wrapped three.js object — so `lightIntensityOf` is what reads it. */
  lighting?: { lights: SceneLightSource[] };
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
  /** v227 — the optional `id` is the RESTORE seam: a save file's sequences name their scene, and a restore
   *  has to create it under that name for the shots to address anything. A taken id is REFUSED by the real
   *  runtime (v225 — "a restore never overwrites live state"), which is the honest answer for a file loaded
   *  twice into one graph. */
  createScene(name: string, id?: string): SceneLike;
  createEntity(sceneId: string, name: string, type: string, geometry?: unknown, material?: unknown, position?: SceneVec3): { id: string };
  /** v227 — widened for the same restore reason: a shot names a camera by its `CameraId`, and the save
   *  carries no camera objects, so the caller re-issues one under the id the file names. */
  createCamera(
    sceneId: string,
    name: string,
    type?: 'perspective' | 'orthographic',
    params?: { fov?: number; aspect?: number; near?: number; far?: number; left?: number; right?: number; top?: number; bottom?: number },
    id?: string,
  ): { id: string; name: string };
  /** v227 — make one scene the active one. Optional the way the gates below are: a host without it is
   *  legitimate, and the surface refuses a file describing a RUNNING cutscene rather than pretending to
   *  resume it (`playCinematic` plays only on the active scene). */
  setActiveScene?(sceneId: string): boolean;
  /** `false` when the runtime holds no such entity. Added in v161 with the remove-body control — the
   *  runtime has always had it; nothing in the Studio had ever called it. */
  removeEntity(sceneId: string, entityId: string): boolean;
  /** v183 — change one scene-local light (`{ enabled, intensity }`, both optional). `false` when the
   *  host holds no such scene/light or refuses the change. Optional the way `removeEntity` is NOT: a
   *  fake without a lighting gate is a legitimate host, and `setLight` on the surface answers honestly
   *  (the unchanged report) when absent. */
  setLightState?(sceneId: string, lightId: string, change: { enabled?: boolean; intensity?: number }): boolean;
  /** M5 v260 — move a scene's ACTIVE camera seat, the runtime's own v224 verb arriving on this seam.
   *  Optional like the gates beside it: a host without a switch is a legitimate host, and the surface answers
   *  `why: 'unsupported'` rather than claiming a seat it cannot ask anyone to hold.
   *
   *  The seat is not a label: the runtime renders from it (`animate`), picks from it (`pickAt`) and walks the
   *  player relative to it (`activeCameraYaw`), so this is the one write that decides which camera the person
   *  using the panel is looking THROUGH. */
  setActiveCamera?(sceneId: string, cameraId: string): boolean;
  /** M5 v244 — take one camera out of a scene, which is the runtime's own v239 verb arriving on this seam.
   *  OPTIONAL the way `setLightState` is: a host without a removal verb is a legitimate host, and the
   *  surface answers `why: 'unsupported'` rather than deleting a camera it cannot ask anyone to drop.
   *  The real runtime answers `false` for a subject it does not hold and THROWS for the ACTIVE seat and for
   *  a camera a registered sequence's shot names; `SceneSurface.removeCamera` is what a panel calls, because
   *  a panel needs the refusal as data. */
  removeCamera?(sceneId: string, cameraId: string): boolean;
  /** v197 — rename one body. `false` when the host holds no such scene/entity or the name is blank.
   *  Optional like `setLightState`: a host without the gate is legitimate, and `renameSelected` on the
   *  surface answers the unchanged report. */
  setEntityName?(sceneId: string, entityId: string, name: string): boolean;
  /** v197 — show or hide one body. `false` when the host holds no such scene/entity or refuses the
   *  ask. The real runtime moves the registry record and the three.js object TOGETHER. */
  setEntityVisible?(sceneId: string, entityId: string, visible: boolean): boolean;
  /** v200 — read one entity from a scene. Optional like the other gates: a host without it is legitimate. */
  getEntity?(sceneId: string, entityId: string): unknown;
  /** v200 — read one component from an entity. Takes the entity object (the runtime's own signature).
   *  Optional like the other gates. */
  getComponent?(entity: unknown, componentType: string): { enabled?: boolean } | undefined;
  /** v201 — return only enabled components on an entity. The enabled flag gates participation in queries,
   *  not rendering or game logic. Disabled components are stored but invisible to iteration. */
  getEnabledComponents?(entity: unknown): Array<{ type: string; enabled: boolean }>;
  /** v200 — toggle a component's enabled flag on the picked body. Answers false when the entity or
   *  the component is missing. Optional like the other gates: a host without the verb is legitimate,
   *  and the surface answers the unchanged report. */
  setComponentEnabled?(sceneId: string, entityId: string, componentType: string, enabled: boolean): boolean;
  /** v210 — the runtime's event log, its OWN two verbs. Optional like the other gates: a fake without
   *  listeners is a legitimate host, and `watchComponents` on the surface answers a no-op unsubscribe. */
  addEventListener?(event: string, listener: (data?: unknown) => void): void;
  removeEventListener?(event: string, listener: (data?: unknown) => void): void;
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
  /** v182 — name the body under one NDC point of the scene's ACTIVE camera, or null when nothing is
   *  there. Optional the same way `placeCamera` is load-bearing-optional: a fake without a pick
   *  raycaster is a legitimate host, and `pickAt` on the surface answers honestly when absent. */
  pickAt?(sceneId: string, nx: number, ny: number): { entityId: string; name: string; distance: number } | null;
}

/**
 * M5 v163 — the save-file seam, structural for the same reason every interface above is: the pure half
 * must stay loadable where the package's types (and its GL context) are not.
 *
 * The shapes are the runtime's OWN save format read loosely — the door counts and carries, it does not
 * interpret entity snapshots. A real `SaveFile` assigns to `SceneSaveFile`, and a `SceneSaveFile` flows
 * back into `loadSaveFile` only through the host's converter (the one place allowed to know the real
 * brands), exactly how `SceneAdapterLike` handles `THREE.Vector3`.
 */
/** M5 v169 — what listSaveFiles() answers about each save, structural for the same SSR reason.
 *  v185 adds `chars`: the file's string length, measured when the listing reads it for its header.
 *  The store's `list()` still reads no bytes — the METER is the caller that pays that cost on purpose. */
export interface SceneSaveEntry {
  path: string;
  savedAt: number;
  version: number;
  entityCount?: number;
  chars?: number;
}

export interface SceneSaveFile {
  format: string;
  version: number;
  /** The instant the CALLER named. The runtime owns a frame clock, not a wall clock, and refuses to
   *  invent one — so the surface's `save()` takes it as an argument rather than reading a clock. */
  savedAt: number;
  carries: string[];
  doesNotCarry: { field: string; needs: string }[];
  entities: [string, unknown][];
  npcs: [string, unknown][];
  worldState: Record<string, unknown>;
  player: unknown;
  cinematic: unknown;
}

/** What a restore answers: the runtime's own report, read loosely the same way. */
export interface SceneLoadReport {
  sceneId: string;
  entities: string[];
  npcs: string[];
  sequences: string[];
  worldState: string[];
  player: string | null;
  carries: string[];
}

/** M5 v244 — one camera of the reported scene, as the panel's row needs it.
 *
 *  The report has always carried the camera set twice over — a count and a name list, plus the active id —
 *  and that is exactly what a READOUT needs and what a CONTROL cannot use: to take a camera out you have to
 *  say WHICH one, and a name is not an address (two cameras may be called the same thing, and `createCamera`
 *  happily makes a second one). This record is the address, the label and the state in one row, read off the
 *  Map once, so a button and the figure beside it can never disagree about the scene they describe. */
export interface SceneCameraRow {
  id: string;
  name: string;
  active: boolean;
}

/** M5 v244 — what asking this surface to take a camera out answers.
 *
 *  The runtime's own `removeCamera` (v239) answers `false` for a subject it does not hold and THROWS for the
 *  two refusals that are facts rather than bugs — the camera holds the ACTIVE seat, or a registered
 *  sequence's shot names it. A panel cannot render a thrown Error, and the reason is the useful half of the
 *  refusal (it names the call that unlocks the removal), so the surface turns all three into data: the
 *  runtime's sentence rides along in `reason`, paraphrased by nobody. */
export type SceneCameraRemoval =
  | { ok: true; cameraId: string; count: number }
  | { ok: false; cameraId: string; why: 'absent' | 'blocked' | 'unsupported'; reason: string };

/** M5 v260 — what asking this surface to move the active seat answers.
 *
 *  There is no `blocked` arm: a switch has nothing that makes it a fact rather than a bug — any camera the
 *  scene holds may take the seat, and the seat cannot be left empty, because the asked-for camera is made
 *  active by the same write. `activeCamera` is the seat the LIVE scene names after the ask, read from the
 *  registry rather than echoed from the argument, so a host that answers `true` and moves nothing is told
 *  back as `null` instead of being quoted a seat it does not have. */
export type SceneCameraActivation =
  | { ok: true; cameraId: string; activeCamera: string | null }
  | { ok: false; cameraId: string; why: 'absent' | 'unsupported'; reason: string };

/** M5 v261 — one SCENE of this runtime, as the panel's row needs it.
 *
 *  The same reason v244 wrote down for cameras: the report carried a COUNT (`scenes`) and an ADDRESS
 *  (`activeSceneId`) and nothing in between, so a person could see that the runtime held two worlds and had no
 *  way to say WHICH one to look at. `entities` is on the row because that is the only way two scenes tell each
 *  other apart on screen — a restored sibling and the composed demo have different names, and a panel that
 *  lists names alone cannot show which one has anything in it. */
export interface SceneSceneRow {
  id: string;
  name: string;
  entities: number;
  active: boolean;
}

/** M5 v261 — what asking this surface to move the LIVE SCENE answers.
 *
 *  There is no `blocked` arm, and the reason is stronger than it was for v260's seat: the runtime's
 *  `setActiveScene` (threeRuntime.ts:1356) looks the scene up and answers `false` for a subject it does not
 *  hold — it refuses nothing that exists, because a scene switch has no invariant to protect the way a camera
 *  seat has "exactly one active row". `activeSceneId` is therefore the graph's own answer after the ask, read
 *  from the registry rather than echoed from the argument. */
export type SceneSceneActivation =
  | { ok: true; sceneId: string; activeSceneId: string | null; aimed: boolean }
  | { ok: false; sceneId: string; why: 'absent' | 'unsupported'; reason: string };

/** M5 v227 — what a restore had to re-issue to be loadable at all.
 *
 *  A save file carries no camera objects: a shot names a `cameraId`, and the camera it addressed — its name,
 *  its type, its FOV — is simply not in the format. The runtime's loader therefore refuses a shot naming a
 *  camera the target scene lacks, and puts the re-creation in the CALLER's hands. This is what the surface
 *  did about it, so a host can say so instead of showing a camera whose name is invented. */
export interface SceneLoadReissued {
  /** Camera ids the file's shots name, each created under its own id in the restored scene. */
  cameraIds: string[];
  /** True when the restore was made the ACTIVE scene, which happens only for a file describing a cutscene
   *  that was RUNNING — `playCinematic` refuses to resume one nobody is looking at. */
  activated: boolean;
}

export interface SceneSaverLike {
  buildSaveFile(sceneId: string, savedAt: number): SceneSaveFile;
  /** Read a file back into the scene named. Refusals are the DRIVER's own — a foreign format, a version
   *  this runtime cannot read, or a restore that would overwrite live state all throw here. */
  loadSaveFile(file: SceneSaveFile, sceneId: string): SceneLoadReport;
  /** M5 v169 — list available saves without reading any file (the store answers about names only). */
  listSaveFiles?(): SceneSaveEntry[];
  /** M5 v171 — take a save back. Returns true when something was deleted, false when the path held nothing. */
  deleteSaveFile?(path: string): boolean;
  /** M5 v172 — give a save a new name. Returns the new path on success, or throws with a refusal reason if the name is illegal. */
  renameSaveFile?(oldPath: string, newPath: string): string;
  /** M5 v168 — classify whether a save name is legal for this build's naming policy. */
  savePathRefusal?(path: string): string | null;
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
 *
 * M5 v181 — the orbit gains PAN: `panX`/`panZ` offset the TARGET laterally along the ground plane, so the
 * camera rig (target + spherical offset) slides as one piece. Pan is HORIZONTAL-ONLY by declaration — the
 * ground plane is what a person pans across, a vertical target would fight the elevation clamp, and an
 * undeclared axis that silently does nothing would be a control that lies. The offsets are stored in WORLD
 * units but applied from CAMERA-relative input (a key press means "into the screen", not "−Z"), which is
 * the arithmetic `applyPan` owns.
 */
export interface OrbitState {
  /** Rotation about the world Y axis, in radians, normalised to (−π, π]. */
  azimuth: number;
  /** Height above the horizon, in radians. Clamped so the camera never flips over a pole. */
  elevation: number;
  /** Distance from the target, in world units. */
  distance: number;
  /** v181 — how far the orbit target sits EAST of its anchor, in world units. Clamped to ±`ORBIT_PAN_LIMIT`. */
  panX: number;
  /** v181 — how far the orbit target sits SOUTH of its anchor (+Z), in world units. Clamped to ±`ORBIT_PAN_LIMIT`. */
  panZ: number;
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

/** The placement a given orbit produces, relative to `target`. The pan offsets (v181) slide the whole rig:
 *  the camera looks at `target + pan`, and sits at `target + pan + spherical(orbit)` — so panning moves the
 *  view across the ground without turning it or changing how far the camera stands from what it looks at. */
export function orbitToPlacement(orbit: OrbitState, target: SceneVec3): { position: SceneVec3; lookAt: SceneVec3 } {
  const anchor = { x: target.x + orbit.panX, y: target.y, z: target.z + orbit.panZ };
  const cosElevation = Math.cos(orbit.elevation);
  return {
    position: {
      x: anchor.x + orbit.distance * cosElevation * Math.sin(orbit.azimuth),
      y: anchor.y + orbit.distance * Math.sin(orbit.elevation),
      z: anchor.z + orbit.distance * cosElevation * Math.cos(orbit.azimuth),
    },
    lookAt: { x: anchor.x, y: anchor.y, z: anchor.z },
  };
}

/** The orbit that produces a given placement — the inverse, used below to turn v142's fixed pair into the
 *  default orbit instead of restating its numbers here where the two could drift apart. The pan offsets are
 *  ZERO by definition here: a placement is stated against its anchor, so anything else would be the
 *  function inventing an offset nobody gave it. Round-trips hold for pan-zero orbits — the only kind this
 *  inverse is for. */
export function orbitFromPlacement(position: SceneVec3, target: SceneVec3): OrbitState {
  const dx = position.x - target.x;
  const dy = position.y - target.y;
  const dz = position.z - target.z;
  const horizontal = Math.hypot(dx, dz);
  return {
    azimuth: normalizeAngle(Math.atan2(dx, dz)),
    elevation: Math.atan2(dy, horizontal),
    distance: Math.hypot(horizontal, dy),
    panX: 0,
    panZ: 0,
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

/** How far the orbit target may slide from its anchor, in world units, per axis. The demo scene fits well
 *  inside this box; the limit exists so a held key cannot walk the camera away from everything it orbits. */
export const ORBIT_PAN_LIMIT = 12;
/** World units one shift-dragged pixel pans — the same "push the world" scale the orbit uses. */
export const ORBIT_PAN_PER_PIXEL = 0.02;
/** World units one key press pans. Key repeat makes a held key continuous; one press is one step. */
export const ORBIT_PAN_PER_KEY = 0.5;

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
    // Pan is NOT an orbit concern: turning the camera must never move what it looks at, so the offsets
    // ride along untouched — a turn that zeroed them would be a reset wearing an orbit's name.
    panX: orbit.panX,
    panZ: orbit.panZ,
  };
}

/**
 * v181 — pan the orbit target, from CAMERA-relative input.
 *
 * A key press or a dragged pixel means "left of the view" or "into the screen", not a world axis, so the
 * deltas arrive as `forward` (along the camera's horizontal view direction) and `right` (along its
 * horizontal right), and THIS function converts them with the azimuth the orbit already holds:
 * forward is `(−sin az, 0, −cos az)` and right is `(cos az, 0, −sin az)`. Both are horizontal by
 * construction, which is what keeps the pan-inside-the-ground-plane promise `OrbitState` makes.
 *
 * Each axis clamps independently at `±ORBIT_PAN_LIMIT` — a pan that stops at one wall while the other
 * axis still has room is the behaviour a person expects from a bounded plane.
 */
export function applyPan(
  orbit: OrbitState,
  delta: { forward?: number; right?: number },
): OrbitState {
  const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
  const forward = delta.forward ?? 0;
  const right = delta.right ?? 0;
  const sin = Math.sin(orbit.azimuth);
  const cos = Math.cos(orbit.azimuth);
  return {
    azimuth: orbit.azimuth,
    elevation: orbit.elevation,
    distance: orbit.distance,
    panX: clamp(orbit.panX + right * cos - forward * sin, -ORBIT_PAN_LIMIT, ORBIT_PAN_LIMIT),
    panZ: clamp(orbit.panZ - right * sin - forward * cos, -ORBIT_PAN_LIMIT, ORBIT_PAN_LIMIT),
  };
}

/**
 * v183 — one declared light, as the surface READS it (loose, like every shape above) and as the
 * report STATES it (plain).
 *
 * `SceneLightSource` is the host's shape: the real runtime keeps the brightness on the wrapped three.js
 * object, a structural fake may keep it directly — `lightIntensityOf` is the one reader that knows both,
 * so no caller ever reaches into a host object to fish a number out. `SceneLightState` is the report's
 * shape: JSON-safe, and identical for every host that declares a light at all.
 */
export interface SceneLightSource {
  id: string;
  type: string;
  enabled: boolean;
  /** Where a host that owns no three.js object keeps the brightness. */
  intensity?: number;
  /** Where the real runtime keeps it. Read, never written — writes go through the host's gate. */
  threeLight?: { intensity?: number };
}

export interface SceneLightState {
  id: string;
  type: string;
  enabled: boolean;
  intensity: number;
}

/** The brightness of one light source, from whichever place the host declared it. A host that declares
 *  neither place has declared a light of unknown brightness — 0 says so rather than inventing a value. */
export function lightIntensityOf(light: SceneLightSource): number {
  if (typeof light.intensity === 'number') return light.intensity;
  return typeof light.threeLight?.intensity === 'number' ? light.threeLight.intensity : 0;
}

/** The brightness range a lighting control may ask for. The demo opens at 0.5 (ambient) and 1.0
 *  (directional), so 0..2 covers "off-black" through "twice the sun" without a second UI. */
export const LIGHT_INTENSITY_MIN = 0;
export const LIGHT_INTENSITY_MAX = 2;
/** How much one press of the −/+ control changes a light. */
export const LIGHT_INTENSITY_STEP = 0.1;

/**
 * v183 — fold a requested brightness into the range the control may ask for.
 *
 * This is the pure half of the lighting control: the surface clamps BEFORE it calls the host's gate, so
 * the host never receives a value the range forbids (the runtime refuses non-finite and negative on its
 * own — that guard is the last line, not the first). Non-finite input folds to the MINIMUM: "off" is the
 * only brightness a broken number could honestly mean.
 */
export function clampLightIntensity(value: number): number {
  if (!Number.isFinite(value)) return LIGHT_INTENSITY_MIN;
  return Math.min(LIGHT_INTENSITY_MAX, Math.max(LIGHT_INTENSITY_MIN, value));
}

/**
 * v197 — fold a rename ask into the name the host gate may receive: trimmed, non-empty. `null` when the
 * ask names nothing — a blank prompt answer is a NO-ASK, not a rename to some invented name (the
 * `clampLightIntensity` rule's string half: the surface folds BEFORE the host gate, and where a broken
 * number folds to "off", a broken name folds to nothing at all).
 */
export function clampEntityName(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * v192 — the selected body's INSPECTOR facts, as the report states them (plain, JSON-safe).
 *
 * Read from the LIVE scene at report time — the same rule the lighting follows — so the panel shows
 * what the host holds NOW, not what the pick named THEN. A body the scene no longer holds (removed,
 * or the scene swapped) has no facts: the selection stays a name, the inspector answers null, and
 * nothing invents a position for a body that is gone.
 */
export interface SceneSelectionFacts {
  id: string;
  name: string;
  /** The entity's declared kind (`mesh`, `group`, …). `unknown` when the host declares none. */
  kind: string;
  /** World position from wherever the host keeps it. null = the host declared no position — a fact
   *  the report refuses to invent (the `duration: null` rule, one surface over). */
  position: SceneVec3 | null;
  visible: boolean;
  /** v199 — the entity's ENABLED components, read from the LIVE registry in the host's own order.
   *  `[]` = the host declares none, or holds only disabled ones — an empty fact, not a missing one. */
  components: SceneSelectionComponent[];
  /** v207 — the registry's disabled half. v204 gated disabled components out of `components` so the HUD
   *  would show only what the query layer sees — and in doing so removed the ONLY re-enable affordance:
   *  a stored-but-invisible component can never be clicked back on. The gate stands (the active list
   *  stays filtered); the stripped half moves HERE, where the panel can render it as a re-enable door. */
  disabledComponents: SceneSelectionComponent[];
}

export interface SceneSelectionComponent {
  /** The component's own name — the runtime files a component under its `type`; a value that carries
   *  no type falls back to the key it is filed under, never to an invented label. */
  name: string;
  /** `enabled !== false` — the `visible !== false` rule: a host that declares nothing is declaring
   *  the default, not a disabled component. */
  enabled: boolean;
}

/** Read a host's component registry LOOSELY — three spellings exist in this repo: the live runtime
 *  keeps a `Map` (keyed by the component's own type), the SAVE shape is an entry ARRAY (v119: a Map
 *  is not JSON), and a Map that survived a stringify-shaped accident arrives as a plain object.
 *  Anything else — a field the host never declared — is none.
 *  v207 — this reader returns the FULL registry, enabled and disabled alike: a loose reader
 *  reports what is stored, it does not editorialize. v204 filtered disabled components HERE, which
 *  stranded them — the split into active/disabled is `selectionFactsOf`'s job, one layer up, where
 *  both halves remain named and reachable. */
export function entityComponentsOf(value: unknown): SceneSelectionComponent[] {
  const pairs: [string, unknown][] =
    value instanceof Map
      ? [...value.entries()]
      : Array.isArray(value)
        ? value.filter(Array.isArray).map((p) => p as [string, unknown])
        : value && typeof value === 'object'
          ? Object.entries(value as Record<string, unknown>)
          : [];
  return pairs.map(([key, c]) => {
    const comp = (c && typeof c === 'object' ? c : {}) as { type?: unknown; enabled?: unknown };
    const name = typeof comp.type === 'string' && comp.type.length > 0 ? comp.type : key;
    return { name, enabled: comp.enabled !== false };
  });
}

/** Read the selected body's facts off the LIVE scene. Null when nothing is selected, there is no
 *  live scene, or the selected body is no longer in it — each an honest "nothing to inspect". */
export function selectionFactsOf(scene: SceneLike | null, selected: { id: string; name: string } | null): SceneSelectionFacts | null {
  if (!selected || !scene) return null;
  const e = scene.entities.get(selected.id);
  if (!e) return null;
  const p = e.position ?? e.transform?.position;
  const finite = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
  const position = p && finite(p.x) && finite(p.y) && finite(p.z) ? { x: p.x, y: p.y, z: p.z } : null;
  // v204's gate, v207's split: the ACTIVE list stays filtered (the HUD shows what the query layer
  // iterates), and the disabled half is reported alongside it rather than dropped — a component the
  // panel cannot see is a component the user cannot click back on.
  const registry = entityComponentsOf(e.components);
  return {
    id: e.id,
    name: e.name,
    kind: typeof e.type === 'string' ? e.type : 'unknown',
    position,
    // A three.js Object3D is visible by default; the runtime sets `visible: true` on every entity it
    // builds. A host that declares nothing is declaring the default, not an invisible body.
    visible: e.visible !== false,
    components: registry.filter((c) => c.enabled),
    disabledComponents: registry.filter((c) => !c.enabled),
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
  /** M5 v261 — every scene the runtime holds, as the panel's row needs it. `scenes` and `activeSceneId` are
   *  read off THIS walk, the way v244 made `cameraRows` the single source behind `cameras`/`cameraNames`/
   *  `activeCamera`: a count and an address that come from different reads can disagree, and the disagreement
   *  is invisible to the person who is being shown both. */
  sceneRows: SceneSceneRow[];
  scene: {
    id: string;
    name: string;
    entities: number;
    cameras: number;
    animations: number;
    entityNames: string[];
    /** M5 v244 — the camera registry as the panel needs it: ONE derivation (`cameraRows`) that the two
     *  figures this report has always carried are read FROM, so a row can be clicked. `cameraNames` and
     *  `activeCamera` stay for every existing reader, and they are now projections of the same list built
     *  on the line below rather than a second walk of the Map — two walks would be two answers to
     *  "what cameras does this scene hold", and only one of them could go stale. */
    cameraRows: SceneCameraRow[];
    cameraNames: string[];
    activeCamera: string | null;
    /** v183 — the scene's declared lights, read from the LIVE scene (never a shadow the surface keeps):
     *  a change goes through the host's gate, and the next report re-reads what the host now holds. */
    lighting: SceneLightState[];
  } | null;
  /** Frames the LOOP produced, counted by its owner — not by the renderer. */
  frames: number;
  draws: { calls: number; triangles: number; points: number; lines: number };
  /**
   * The camera's orbit (M5 v161). Reported from the SURFACE that holds it — the runtime has no orbit of its
   * own, so a report that invented one would be describing a camera nobody moved.
   */
  orbit: OrbitState;
  /**
   * v182 — the body the last pick named, or null when the last pick hit empty space (or nothing has been
   * picked yet). Held by the SURFACE the same way `orbit` is: a click is an input to this surface, and
   * every later report carries the selection until another pick replaces or clears it.
   */
  selected: { id: string; name: string } | null;
  /**
   * v192 — the selected body's facts, read from the LIVE scene at report time (the lighting rule):
   * kind, position and visibility as the host holds them NOW. Null when nothing is selected, or the
   * selected body is no longer in the live scene — a name whose body left has nothing to inspect.
   */
  inspector: SceneSelectionFacts | null;
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
 * M5 v261 — the SCENE walk is now the single read behind three fields: `sceneRows` is built from the graph's
 * own Map, and `scenes` is its length while `activeSceneId` is the row it marks active. Before this the count
 * came from `scenes.size` and the address from `graph.activeSceneId` — two reads of one Map, which is what let
 * a panel show "2 scenes" and name an active one that was not in the list it drew. The summary (`scene`) is
 * the SAME walked object, so a row and the figures beside it describe one scene rather than two answers.
 */
export function buildSceneReport(
  runtime: SceneRuntimeLike,
  frames: number,
  orbit: OrbitState = STUDIO_ORBIT_DEFAULT,
  selected: { id: string; name: string } | null = null,
): SceneReport {
  const graph = runtime.getSceneGraph();
  const sceneRows: SceneSceneRow[] = [...graph.scenes.values()].map((s) => ({
    id: s.id,
    name: s.name,
    entities: s.entities.size,
    active: s.id === graph.activeSceneId,
  }));
  const activeSceneId = sceneRows.find((r) => r.active)?.id ?? null;
  const scene = activeSceneId ? graph.scenes.get(activeSceneId) : undefined;
  const backend = runtime.getBackend();
  const stats = graph.stats ?? EMPTY_STATS;
  // M5 v244 — the camera set is walked ONCE, and every camera figure in the report is read off that walk:
  // the count from its length, the name list and the active id as projections of the same rows the panel
  // puts a button on. Before this there were two walks and no address, which is why a row could be shown
  // but not taken away.
  const cameraRows: SceneCameraRow[] = scene
    ? [...scene.cameras.values()].map((c) => ({ id: c.id, name: c.name, active: c.active }))
    : [];

  return {
    schema: 1,
    backend: backend?.kind ?? null,
    pixels: backend ? { ...backend.state } : null,
    scenes: sceneRows.length,
    activeSceneId,
    sceneRows,
    scene: scene
      ? {
          id: scene.id,
          name: scene.name,
          entities: scene.entities.size,
          cameras: cameraRows.length,
          animations: scene.animations.size,
          entityNames: [...scene.entities.values()].map((e) => e.name),
          cameraRows,
          cameraNames: cameraRows.map((c) => c.name),
          activeCamera: cameraRows.find((c) => c.active)?.id ?? null,
          lighting: (scene.lighting?.lights ?? []).map((l) => ({
            id: l.id,
            type: l.type,
            enabled: l.enabled,
            intensity: lightIntensityOf(l),
          })),
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
    selected,
    inspector: selectionFactsOf(scene ?? null, selected),
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
 * v182 — canvas pixels to normalized device coordinates, the one conversion a pick needs and the one
 * place it lives. NDC y points UP while pixel y points DOWN, which is exactly the kind of sign flip
 * that reads fine and picks the wrong body — hence a named function the suite can pin, not an inline
 * expression in a click handler. The y algebra is written `1 − t·2` rather than `−(t·2 − 1)` so the
 * center answers +0, not −0 — a distinction deep-equal assertions rightly refuse to blur.
 */
export function ndcFromPixel(px: number, py: number, width: number, height: number): { x: number; y: number } {
  return { x: (px / width) * 2 - 1, y: 1 - (py / height) * 2 };
}

/** A function DECLARATION with an explicit `never` return, so control flow narrows after a refusal. */
function refused(message: string): never {
  throw new Error(message);
}

/**
 * M5 v163 — a scene body's STRUCTURED FACT, as it enters the Design Document.
 *
 * Deliberately a name, a kind and a position — the three things a document can hold honestly. There is
 * no geometry, no material and no pixels here (§60): the document gets a SPEC of the scene, not a fake
 * picture of one.
 */
export interface SceneBodyFact {
  id: string;
  name: string;
  kind: string;
  position: SceneVec3;
}

export interface SceneDocumentInput {
  /** The page (or any container) the scene's frame is filed under. */
  pageId: string;
  /** Where in the parent's child list the frame lands. */
  index: number;
  sceneName: string;
  bodies: SceneBodyFact[];
  /** Where the frame lands on the page. Defaults out of the origin, where composed content usually sits. */
  at?: { x: number; y: number };
}

/** Where the scene frame lands when the caller names no place. */
export const SCENE_DOCUMENT_DEFAULT_AT = { x: 40, y: 40 };

/** A coordinate in a document is a finite number, written to 2 decimals — a spec, not a measurement. */
function docCoordinate(value: number, axis: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    refused(`body position ${axis} is ${String(value)}; a coordinate in a document is a finite number`);
  }
  return Math.round(value * 100) / 100;
}

/**
 * M5 v163 — turn a scene's bodies into ONE ordinary document op.
 *
 * The result is a single `ops.addSubtree`: a frame named after the scene, with one text child per body
 * carrying the body's name and its world position. This is deliberately NOT a new node kind and not a
 * 3D preview — it is the document's own vocabulary describing a scene, which is why it is undoable,
 * selectable, exportable and persistable by every tool that already exists, with no new code anywhere.
 *
 * The bodies are passed in by the caller (the component reads names and positions off the runtime; the
 * pure half cannot touch a `threeObject`). Authored bodies only, says the panel: the four composed demo
 * shots are the demo every other proof asserts, and a button that filed THEM would make those proofs
 * depend on what a user clicked.
 */
export function composeDocumentOps(input: SceneDocumentInput): Op[] {
  const sceneName = input.sceneName.trim();
  if (!sceneName) refused('sceneName is empty; a frame filed about no scene names nothing');
  if (!input.pageId) refused('pageId is empty; the frame has to land somewhere');
  if (!Array.isArray(input.bodies) || input.bodies.length === 0) {
    refused('a scene with no bodies would file a frame about nothing — add one first');
  }

  const at = input.at ?? SCENE_DOCUMENT_DEFAULT_AT;
  const frame = frameNode(`Scene: ${sceneName}`, {
    mode: 'vertical',
    gap: 6,
    padding: { top: 12, right: 12, bottom: 12, left: 12 },
    primaryAxis: 'start',
    counterAxis: 'start',
  }, {
    x: at.x,
    y: at.y,
    width: 300,
    height: 24 + input.bodies.length * 30,
    fills: [{ kind: 'token', ref: 'color.surface' }],
  });

  const nodes: (typeof frame | ReturnType<typeof textNode>)[] = [frame];
  for (const body of input.bodies) {
    if (!body || typeof body.name !== 'string' || body.name === '') {
      refused(`a body without a name cannot be filed — the document records names, not anonymous ids`);
    }
    const x = docCoordinate(body.position.x, 'x');
    const y = docCoordinate(body.position.y, 'y');
    const z = docCoordinate(body.position.z, 'z');
    const label = textNode(
      body.name,
      `${body.kind} · (${x}, ${y}, ${z})`,
      {
        fontFamilyToken: 'font.family.body',
        sizeToken: 'font.size.sm',
        weight: 500,
        lineHeight: 1.3,
        letterSpacing: 0,
        align: 'left',
      },
      { width: 264, height: 24, fills: [{ kind: 'token', ref: 'color.text' }] },
    );
    label.parentId = frame.id;
    frame.childIds.push(label.id);
    nodes.push(label);
  }
  return [ops.addSubtree(input.pageId, input.index, nodes)];
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
  /** The scene this surface COMPOSED and animates — the address its body list and its document send are filed
   *  under, not the scene the panel is currently looking at. M5 v261: the VIEW follows the runtime's active
   *  row (`report().activeSceneId`), and this stays the composed one, exactly as `cameraId` stayed the
   *  composed camera when v260 made the orbit aim the seat. */
  readonly sceneId: string;
  /** The camera this surface COMPOSED — an address for `placeCamera`, not the seat. Since v260 the orbit aims
   *  whichever row the live scene names as active (`report().scene.activeCamera`), which is this one until a
   *  person moves the seat. */
  readonly cameraId: string;
  /**
   * The bodies the surface currently holds. **LIVE**: `addBody`/`removeBody` mutate this array in place, so
   * the frame writer the component passed in always sees the current set rather than the mount-time one.
   */
  readonly bodyIds: string[];
  /**
   * The bodies a person AUTHORED through this surface — **LIVE** the same way. The four composed demo
   * bodies are absent by definition: they are the demo the other proofs assert, not user content. This
   * is the list `composeDocumentOps` files, and after a load it is deliberately untouched — a restored
   * scene is a sibling the runtime holds, not content this surface authored.
   */
  readonly authoredBodyIds: string[];
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
  /** v181 — slide the orbit target across the ground, from CAMERA-relative deltas: `forward` is into the
   *  screen, `right` is to the view's right. Clamps at `±ORBIT_PAN_LIMIT` per world axis; a pan never
   *  turns the camera or changes its distance. */
  panBy(delta: { forward?: number; right?: number }): SceneReport;
  /** v182 — pick the body under one canvas pixel. A hit names it in `selected` from now on; empty space
   *  CLEARS it. A host without a picking adapter, or without pixel dimensions to convert with, answers
   *  the unchanged report — asking nothing is not the same answer as picking nothing. */
  pickAt(px: number, py: number): SceneReport;
  /** v183 — change one light of THIS surface's scene: `enabled` flips it (the runtime attaches/detaches
   *  the real three.js light) and `intensity` dims/brightens it, folded into the 0..LIGHT_INTENSITY_MAX
   *  range BEFORE the host sees it. The answer re-reads the live scene, so a host without a lighting
   *  gate answers the unchanged report — and the HUD shows what actually is, not what was asked. */
  setLight(lightId: string, change: { enabled?: boolean; intensity?: number }): SceneReport;
  /** v197 — rename the SELECTED body. The ask is folded (trimmed) BEFORE the host gate; a blank ask or
   *  no selection answers the unchanged report. When the host ACCEPTS, the pick record is re-pointed at
   *  the accepted name — the same both-records-move rule the runtime's restore holds — so `selected`
   *  and the live inspector can never disagree about what the body is called. */
  renameSelected(name: string): SceneReport;
  /** v197 — show or hide the SELECTED body. The answer re-reads the live scene, so a host without the
   *  gate answers the unchanged report; a hidden body keeps its selection and its facts (visible: false). */
  setSelectedVisible(visible: boolean): SceneReport;
  /** v200 — toggle one component's enabled flag on the selected body. Answers the unchanged report when
   *  there is no selection or the host holds no such verb; the inspector re-reads the registry at once. */
  toggleComponentEnabled(componentType: string): SceneReport;
  /** v210 — be told when the COMPONENT registry changes by anyone, not just through this surface's own
   *  verbs: the runtime emits `componentAdded`/`componentRemoved`/`componentStateChanged` from every
   *  write path, and a change made elsewhere (a console command, an agent) left the inspector showing a
   *  stale registry until something else happened to re-read it. The listener is called with NO payload:
   *  the message is "re-read the report", and the report stays the runtime's own single source. Answers
   *  an unsubscribe — idempotent, safe in a teardown. A host without event verbs answers a no-op
   *  unsubscribe: the surface keeps working, it just cannot be told. */
  watchComponents(listener: () => void): () => void;
  /** v212 — the same promise over the ENTITY pair: v211 gave `setEntityName`/`setEntityVisible` their
   *  voices (`entityRenamed`/`entityVisibilityChanged`), so an out-of-band rename or hide now exists as
   *  news on the bus — and this surface was not listening. A separate verb, NOT a fifth name inside
   *  `watchComponents`: v210's witnesses pin that subscription to EXACTLY the three component names, and
   *  widening it there would make those pins lie. Same contract as its sibling — no payload, an
   *  idempotent unsubscribe, and a host without event verbs answers a no-op unsubscribe. */
  watchEntities(listener: () => void): () => void;
  /** v216 — the BODY pair: `entityCreated` and `entityRemoved`, the two names that can add a body to, or
   *  take one out of, the scene this surface reports. v212's bounds named this grant; the NAME SET is
   *  decided by the emit census, not by the family's size:
   *  - `entityRestored` is NOT watched, because it is a SUBSUMED echo. `restoreEntity` builds its body
   *    through the same private `insertEntity` that `createEntity` uses, and that path emits
   *    `entityCreated` unconditionally (threeRuntime.ts:1387) before `restoreEntity` emits
   *    `entityRestored` (1799). There is no input where a restore news a body WITHOUT the pair already
   *    newing it, so watching the third name would add a subscription and no information — the witness
   *    for that claim is a real restore moving this leg exactly once.
   *  - `activeSceneChanged` can also move `report.scene`, but it changes WHICH scene is reported, not
   *    what is in it — a different fact, and a different leg. Named in bounds, not claimed here.
   *  Same contract as its siblings: no payload, one shared listener, idempotent unsubscribe, and a host
   *  without event verbs answers a no-op unsubscribe. */
  watchBodies(listener: () => void): () => void;
  /** v217 — the SCENE pair: `sceneCreated` and `activeSceneChanged`. The body pair says what is IN the
   *  reported scene; this says WHICH scene is reported and how many exist. The name set again comes from a
   *  write census, and this time the census says the two names are each load-bearing:
   *  - Only two methods touch what the report reads: `createScene` sets `scenes.set(...)` and, when the
   *    graph was empty, `activeSceneId` too (threeRuntime.ts:1238-1241), and `setActiveScene` writes
   *    `activeSceneId` alone (1285). Nothing deletes a scene, so `report.scenes` only ever grows.
   *  - `sceneCreated` is NOT subsumed by the switch name, which is the opposite of v216's `entityRestored`:
   *    the FIRST scene on an empty graph moves `activeSceneId` from inside `createScene`, and that silent
   *    first activation emits no `activeSceneChanged`. A switch-only leg would therefore miss a scene
   *    APPEARING. A second scene moves `scenes` and nothing else, so the two names also differ in WHICH
   *    field they move.
   *  - `disposed` (4212 clears the whole graph) is deliberately absent: it is the runtime's own end, and
   *    the Studio calls it from the component teardown, so it is not news about a scene the panel still
   *    shows. Named here so the absence is a decision, not an oversight.
   *  Same contract as its siblings: no payload, one shared listener, idempotent unsubscribe, and a host
   *  without event verbs answers a no-op unsubscribe. */
  watchScenes(listener: () => void): () => void;
  /** v218 — the PIXELS family: `initialized`, `resize` and `pixelRatioChanged`. The four legs above answer
   *  what is in the scene and which scene that is; this answers what the panel would be drawing it WITH —
   *  `report.backend` and `report.pixels`, the two fields no earlier name moves. Again a write census, not
   *  a family list:
   *  - Only three runtime writes touch these two fields. `initialize` builds the backend, so it sets the
   *    kind and all three pixel figures at once (threeRuntime.ts:1191-1193); `resize` writes width/height
   *    (1196-1199); `setPixelRatio` writes `pixelRatio` (1202-1209), and THAT announcement is this
   *    increment's other half — the verb used to change a reported field in silence.
   *  - `initialized` carries even though the Studio's own init happens BEFORE this leg subscribes (the
   *    component initializes at Scene3D.tsx:141 and subscribes at 287; the mount-time pull at 267 already
   *    reports it). The census question is not "can the listener be late" but "does any input move a
   *    reported field with no other announcer", and a re-`initialize` on a live runtime does exactly that.
   *  - `disposed` stays refused for v217's reason (the component teardown calls it, Scene3D.tsx:330), and
   *    `started`/`stopped`/`frame` are refused for a NEW one: no field of the report keys off whether the
   *    loop is running, and `frames`/`draws` already refresh from the loop's own pull (310-314), throttled
   *    by design. Watching the frame bus would be a rendering-cadence change dressed as a correctness fix.
   *  Same contract as its siblings: no payload, one shared listener, idempotent unsubscribe, and a host
   *  without event verbs answers a no-op unsubscribe. */
  watchPixels(listener: () => void): () => void;
  /** v224 — the CAMERA leg, widened to a TRIPLE by v239: `cameraCreated`, `activeCameraChanged` and
   *  `cameraRemoved` are the three names over the three report fields no earlier leg moves — `scene.cameras`,
   *  `cameraNames` and `activeCamera`. The census again:
   *  - Three methods write those fields and each announces once, AFTER the write. `createCamera` inserts into
   *    `scene.cameras` (threeRuntime.ts:2586) and, when that insert is the scene's FIRST camera, flips
   *    `active` itself; one `cameraCreated` follows both (2592). `setActiveCamera` looks the camera up before
   *    touching any flag (2604-2605, v224), clears the others, sets the asked one and emits (2612).
   *    `removeCamera` (v239) deletes (2646) and emits `cameraRemoved` (2647) — and refuses BEFORE it deletes
   *    when asked for the ACTIVE camera or for one a registered sequence's shot names, so neither refusal can
   *    move a reported field.
   *  - v224 could write "there is no third name, because there is no third write": `cameras.delete` appeared
   *    nowhere in the runtime. v239 is the third write, which is why this leg has a third name and why the
   *    fifteen-listener census and the six-way disjointness pin both widened with it. `createScene` still
   *    starts `cameras` at an empty Map and `setActiveScene` still changes WHICH scene is read — both move
   *    this leg's fields for a SCENE-level reason, and both are already watched by v217's scene pair.
   *  - Camera TRANSFORM writes are refused, a refusal shape this family has kept since v224: the cinematic shot
   *    paths (`position.copy`, `lookAt`, `fov`) and this surface's own `aim()` move the live `THREE.Camera`,
   *    which the report never reads — it takes only `id`, `name`, `active`. A leg on those would re-read a
   *    report that cannot have changed, and they reach no bus name at all.
   *  - `disposed` keeps v217's reason (the component teardown calls it). `cameraRemoved` is the one name this
   *    grant had to ADD: unlike v224's two, no bus carried it before the verb existed.
   *  Same contract as its siblings: no payload, one shared listener, idempotent unsubscribe, and a host
   *  without event verbs answers a no-op unsubscribe. */
  watchCameras(listener: () => void): () => void;
  /** Put the camera back to the default orbit — the view the Studio opens with. */
  resetOrbit(): SceneReport;
  /** Add a body at the next free slot. Answers `null` when the runtime produced no entity. */
  addBody(name: string, kind: string): { bodyId: string; count: number } | null;
  /** Remove a body. Answers `false` when this surface does not hold it — the same answer `disk.write` gives
   *  for a path it was never given. */
  removeBody(bodyId: string): boolean;
  /** M5 v244 — add a CAMERA to the scene this surface draws, through the runtime's own `createCamera`.
   *  Answers `null` when the runtime produced no camera, the same shape `addBody` uses.
   *
   *  Two things deliberately do NOT happen, and both are the reason this verb is small. A second camera is
   *  not made ACTIVE: the runtime activates only a scene's FIRST camera, so adding one leaves the picture
   *  exactly where the user had it. (M5 v260 corrects v244's REASON for that sentence: it claimed the orbit
   *  aims the seat, so moving it would strand the picture on an unaimed camera. What is actually true is that
   *  the seat is the camera the renderer draws from and `aim()` now follows it — so the reason a second
   *  camera is not activated is that adding is not a request to SWITCH, not that switching would break.)
   *  And the new camera is not aimed: `createCamera` leaves it at the origin looking down -Z, the report reads
   *  only `id`/`name`/`active`, and a position for it is not something this seam has an answer to until the
   *  person points at it — which `activateCamera` now does, by aiming the seat with the orbit already held.
   *  It is a row a person can look at, take back out with `removeCamera`, or give the seat to. */
  addCamera(name: string): { cameraId: string; count: number } | null;
  /** M5 v244 — take a camera out, and ANSWER why when the runtime will not. This is the shipped caller v239's
   *  third bus name has been waiting for: `cameraRemoved` could only ever be emitted by a runtime call nobody
   *  in the product made, so the camera leg's third name was a subscription to a silence.
   *
   *  The subject is looked up in THIS surface's scene before the runtime is asked, so an id the panel never
   *  showed is answered `absent` and never reaches a refusal path. A refusal that is a fact — the ACTIVE seat,
   *  or a registered shot — is answered `blocked` with the runtime's own sentence, which is the one that names
   *  the unlocking call. */
  removeCamera(cameraId: string): SceneCameraRemoval;
  /** M5 v260 — give the seat to one of this surface's cameras, and aim the new one with the orbit the person
   *  already has.
   *
   *  v244's refusal sentence told the user to `call setActiveCamera first` and the panel had no such control,
   *  so the instruction was a dead end: the row holding the seat could not be taken out, and nothing else
   *  could move the seat either. This is that control — and because the seat is the camera the runtime
   *  DRAWS FROM, the handover is part of the verb: the newly active camera is aimed at once with the current
   *  orbit, so switching seats keeps the view the user set instead of pointing the picture at the origin a
   *  fresh `createCamera` leaves it at. */
  activateCamera(cameraId: string): SceneCameraActivation;
  /** M5 v261 — move the LIVE SCENE, the seat one level up: the row the report reads and the renderer draws
   *  from. The same lookup-before-asking shape as `activateCamera`, and the same reason for it — until this
   *  verb existed the surface could only ever ACT on the scene it was composed under, while it REPORTED
   *  whichever scene the graph named. Measured on the shipped bytes (the proof's §9 grades the repaired shape
   *  and marks the pre-fix line where each of these was the defect): with the active row
   *  moved out-of-band, one drag aimed the composed scene's camera and the frame drew a different scene
   *  entirely, the camera rows the panel listed were refused by that panel's own buttons as "not in scene …",
   *  `save()` wrote the four demo bodies while the person was looking at one other body, and `setLight`
   *  changed a light no report was reading.
   *
   *  The handover does two things beyond the runtime's write: it re-aims with the orbit the person already
   *  holds, so the view does not jump, and it CLEARS the pick, because a selection is a body in a scene and
   *  the new scene does not hold it. */
  activateScene(sceneId: string): SceneSceneActivation;
  /** M5 v163 — serialise the scene this surface READS into the runtime's own save file. `savedAt` is the
   *  caller's instant; the runtime owns a frame clock, not a wall clock. Refuses when the host supplied no
   *  saver.
   *
   *  M5 v261 — the address moved from `built.sceneId` to the live one. Measured on the shipped bytes: with a
   *  second scene active, `save()` filed the four demo bodies while the panel listed the one world the person
   *  was looking at, so the button wrote a file about a scene nobody could see. */
  save(savedAt: number): SceneSaveFile;
  /** M5 v163 — read a save file back. A restore never overwrites live state (the saver's own rule), so
   *  the file lands in a FRESH sibling scene the runtime composes for exactly that, and this surface's
   *  own scene and loop stay untouched.
   *
   *  M5 v227 — and "fresh" is only two thirds of the protocol. A file that carries a cinematic names its
   *  scene in every sequence and its cameras in every shot, so the sibling is created UNDER THE SAVED ID
   *  and the named cameras are re-issued into it; a file describing a cutscene that was RUNNING also makes
   *  that scene the active one, because a sequence plays nowhere else. What was re-issued is ANSWERED
   *  rather than done silently — the format carries no camera objects, so a restored camera's name is
   *  spelled from its id and a host deserves to know that. */
  load(file: SceneSaveFile): { sceneId: string; report: SceneLoadReport; reissued: SceneLoadReissued };
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
 *
 * M5 v163: `saver` is the same story one seam over — a host that can persist passes one, and a host
 * that cannot (the pure suite's fakes) still builds a legal surface; `save()`/`load()` refuse honestly
 * instead of pretending.
 */
/** M5 v227 — the camera ids a file's shots name, in first-appearance order.
 *
 *  Read DEFENSIVELY and only for structure: the file is untrusted JSON that has not been through the loader
 *  yet, so a malformed `cinematic` must produce "names no camera" and let `loadSaveFile` refuse it in its own
 *  voice — never a TypeError from a property read on a non-object. A save carries no camera objects, so these
 *  are the ids the restore has to RE-ISSUE into the target scene before the loader can accept the shots that
 *  address them. */
function cameraIdsNamedBy(file: SceneSaveFile): string[] {
  const sequences = (file.cinematic as { sequences?: unknown } | null | undefined)?.sequences;
  if (!Array.isArray(sequences)) return [];
  const ids: string[] = [];
  for (const entry of sequences) {
    const shots = Array.isArray(entry) ? (entry[1] as { shots?: unknown } | undefined)?.shots : undefined;
    if (!Array.isArray(shots)) continue;
    for (const shot of shots) {
      const cameraId = (shot as { cameraId?: unknown } | null | undefined)?.cameraId;
      if (typeof cameraId !== 'string' || cameraId.length === 0) continue;
      if (!ids.includes(cameraId)) ids.push(cameraId);
    }
  }
  return ids;
}

/** M5 v227 — true when the file describes a cutscene that was RUNNING when it was written.
 *
 *  `activeSequence` is the save's own word for it, and it is the one case that needs more than cameras: the
 *  runtime refuses to resume a sequence whose scene is not the active one, because "a save that resumes a
 *  cutscene nobody is looking at is a save that is already interrupted". A file whose sequences are all
 *  stopped restores without touching which scene the panel reads. */
function describesRunningSequence(file: SceneSaveFile): boolean {
  const active = (file.cinematic as { activeSequence?: unknown } | null | undefined)?.activeSequence;
  return typeof active === 'string' && active.length > 0;
}

export function createStudioScene(
  runtime: SceneComposerLike,
  writeFrame: (bodyIds: string[], motion: { y: number; bob: number }) => void,
  adapter?: SceneAdapterLike,
  frames = 0,
  saver?: SceneSaverLike,
): SceneSurface {
  const built = buildDemoScene(runtime, adapter);
  let counted = frames;
  let orbit = STUDIO_ORBIT_DEFAULT;
  // v182 — what the last pick named. Surface state, like the orbit: it survives frames and turns, and
  // only another pick replaces or clears it.
  let selected: { id: string; name: string } | null = null;

  // A copy, not the array `buildDemoScene` returned: the surface owns its body list from here on, and the
  // builder's array is a construction detail. Mutated in place so the frame writer sees the current set.
  const bodyIds = [...built.bodyIds];
  // What the person using this surface AUTHORED (v163). Starts empty — the four composed bodies are the
  // demo, not user content — and is maintained by exactly the two controls below, so the list a document
  // button files can never quietly include a body nobody authored.
  const authoredIds: string[] = [];
  let added = 0;

  /** Which scene the panel is looking AT: the row the graph names as active, falling back to the one this
   *  surface composed when the graph names none.
   *
   *  M5 v261 — the same correction v260 made for the camera seat, one level up. `buildSceneReport` has always
   *  read the graph's active row, and `animate` renders it (threeRuntime.ts:2799); every WRITE this surface
   *  performed named `built.sceneId`. Those are the same scene only while nobody moves the seat, which is why
   *  the disagreement was invisible for 60 grants — and why the verbs below now resolve through HERE. */
  const liveSceneId = (): string => runtime.getSceneGraph().activeSceneId ?? built.sceneId;

  /** Which camera the panel is looking THROUGH: the row the live scene names as active.
   *
   *  The runtime has one source of truth for this and reads it in three places — `animate` renders from it
   *  (threeRuntime.ts:2799), `pickAt` casts its ray from it (:1497) and `activeCameraYaw` walks the player
   *  relative to it (:2895). It falls back to the camera this surface composed only when the scene names no
   *  seat at all (every camera taken out, or a host whose rows carry no active flag), which is the same
   *  camera the pre-v260 code aimed, so a single-camera scene changes behaviour by nothing. */
  const seatOf = (): string | null => {
    const live = runtime.getScene(liveSceneId());
    const active = live ? [...live.cameras.values()].find((c) => c.active) : undefined;
    return active?.id ?? null;
  };

  /** Aim the camera the renderer draws from, at the current orbit. A no-op when there is no adapter — a fake
   *  without cameras is a legitimate host, and the report is what says whether the aim happened.
   *
   *  M5 v260 — this resolved `built.cameraId` before the seat was a control. Measured on the shipped bytes:
   *  with the seat moved out-of-band to a second camera, one drag wrote the FIRST camera (probe: aimed
   *  `camera-6`, drawn `camera-7`), so every orbit, wheel and pan landed on a camera nobody renders and the
   *  picture stopped answering the mouse.
   *
   *  M5 v261 — the composed-camera fallback is now SCENE-conditional. `built.cameraId` is a camera of the
   *  composed scene, so aiming it while looking at another scene is the same cross-scene id bug this grant
   *  exists to fix, one line deeper: an orbit on a scene with no camera of its own does nothing rather than
   *  moving a camera nobody is drawing from. */
  const aim = () => {
    const subject = liveSceneId();
    const target = seatOf() ?? (subject === built.sceneId ? built.cameraId : null);
    if (!target) return;
    const placement = orbitToPlacement(orbit, STUDIO_CAMERA_LOOK_AT);
    adapter?.placeCamera(subject, target, placement.position, placement.lookAt);
  };

  return {
    sceneId: built.sceneId,
    cameraId: built.cameraId,
    bodyIds,
    authoredBodyIds: authoredIds,
    get frames() {
      return counted;
    },
    get orbit() {
      return orbit;
    },
    report() {
      return buildSceneReport(runtime, counted, orbit, selected);
    },
    step(elapsedSeconds) {
      counted += 1;
      writeFrame(bodyIds, spinAt(elapsedSeconds));
      return buildSceneReport(runtime, counted, orbit, selected);
    },
    orbitBy(delta) {
      orbit = applyOrbit(orbit, delta);
      aim();
      return buildSceneReport(runtime, counted, orbit, selected);
    },
    panBy(delta) {
      orbit = applyPan(orbit, delta);
      aim();
      return buildSceneReport(runtime, counted, orbit, selected);
    },
    pickAt(px, py) {
      // Convert only when there is something to convert WITH: dimensions from the backend the surface
      // actually draws into, and an adapter that can cast the ray. Otherwise this answers the current
      // report untouched — a no-op pick, not a fabricated miss.
      const size = runtime.getBackend()?.state;
      if (adapter?.pickAt && size && size.width > 0 && size.height > 0) {
        const ndc = ndcFromPixel(px, py, size.width, size.height);
        const hit = adapter.pickAt(liveSceneId(), ndc.x, ndc.y);
        selected = hit ? { id: hit.entityId, name: hit.name } : null;
      }
      return buildSceneReport(runtime, counted, orbit, selected);
    },
    setLight(lightId, change) {
      // The pure half first: the requested brightness is folded into the range the control owns, so the
      // host's own refusal is a second wall and never the first. Whether the host ACCEPTS is its answer
      // to give — the report that follows reads the live scene either way, which is what keeps the HUD
      // honest about a host that has no lighting gate at all.
      const asked = change.intensity !== undefined ? { ...change, intensity: clampLightIntensity(change.intensity) } : change;
      runtime.setLightState?.(liveSceneId(), lightId, asked);
      return buildSceneReport(runtime, counted, orbit, selected);
    },
    renameSelected(name) {
      const next = clampEntityName(name);
      const target = selected;
      // A blank ask is a no-ask and no selection is nothing to rename — both answer the unchanged report
      // rather than a refusal the host would have to phrase for a call that carried no question.
      if (next === null || !target) return buildSceneReport(runtime, counted, orbit, selected);
      if (runtime.setEntityName?.(liveSceneId(), target.id, next) === true) {
        // The pick record carries the name the pick SAW; an accepted rename makes that record stale, so
        // it moves WITH the body (the runtime's restore rule). A host without the gate — or one that
        // refused — leaves it as it was, and the report reads whichever name the live scene holds.
        selected = { id: target.id, name: next };
      }
      return buildSceneReport(runtime, counted, orbit, selected);
    },
    setSelectedVisible(visible) {
      const target = selected;
      if (!target) return buildSceneReport(runtime, counted, orbit, selected);
      runtime.setEntityVisible?.(liveSceneId(), target.id, visible);
      return buildSceneReport(runtime, counted, orbit, selected);
    },
    toggleComponentEnabled(componentType) {
      const target = selected;
      if (!target) return buildSceneReport(runtime, counted, orbit, selected);
      // Read the current enabled state from the live registry, then flip it through the host gate.
      const entity = runtime.getEntity?.(liveSceneId(), target.id);
      if (!entity) return buildSceneReport(runtime, counted, orbit, selected);
      const comp = runtime.getComponent?.(entity, componentType);
      const next = comp ? !comp.enabled : true;
      runtime.setComponentEnabled?.(liveSceneId(), target.id, componentType, next);
      return buildSceneReport(runtime, counted, orbit, selected);
    },
    // v210 — the three component events the runtime emits from EVERY write path (its own emit is
    // private; these are the public verbs). One listener joins all three names, so no event can be
    // added to the runtime's component family without a subscription here going stale in plain sight
    // — the stale set is what the watch tests count.
    watchComponents(listener) {
      if (!runtime.addEventListener || !runtime.removeEventListener) return () => {};
      const events = ['componentAdded', 'componentRemoved', 'componentStateChanged'];
      for (const event of events) runtime.addEventListener(event, listener);
      return () => {
        for (const event of events) runtime.removeEventListener?.(event, listener);
      };
    },
    // v212 — the entity pair the runtime announces after its OWN mutations (v211): the same one-listener-
    // joins-all-names shape as the component leg, over the two names that family holds.
    watchEntities(listener) {
      if (!runtime.addEventListener || !runtime.removeEventListener) return () => {};
      const events = ['entityRenamed', 'entityVisibilityChanged'];
      for (const event of events) runtime.addEventListener(event, listener);
      return () => {
        for (const event of events) runtime.removeEventListener?.(event, listener);
      };
    },
    // v216 — the body pair. `entityRestored` is deliberately absent: the restore path emits
    // `entityCreated` from the shared insert it routes through, so the pair already hears a restore
    // (see the declaration's census). One listener joins both names, as in the other two legs.
    watchBodies(listener) {
      if (!runtime.addEventListener || !runtime.removeEventListener) return () => {};
      const events = ['entityCreated', 'entityRemoved'];
      for (const event of events) runtime.addEventListener(event, listener);
      return () => {
        for (const event of events) runtime.removeEventListener?.(event, listener);
      };
    },
    // v217 — the scene pair. Both names carry, for opposite reasons from v216: the first scene on an empty
    // graph activates from inside `createScene` and emits no `activeSceneChanged`, so a switch-only leg
    // would miss a scene appearing (see the declaration's census).
    watchScenes(listener) {
      if (!runtime.addEventListener || !runtime.removeEventListener) return () => {};
      const events = ['sceneCreated', 'activeSceneChanged'];
      for (const event of events) runtime.addEventListener(event, listener);
      return () => {
        for (const event of events) runtime.removeEventListener?.(event, listener);
      };
    },
    // v218 — the pixels family. Three names, each the ONLY announcer of a write into `report.backend` or
    // `report.pixels`; `pixelRatioChanged` exists because the verb behind it changed a reported field in
    // silence (see the declaration's census for the `frame`/`disposed` refusals).
    watchPixels(listener) {
      if (!runtime.addEventListener || !runtime.removeEventListener) return () => {};
      const events = ['initialized', 'resize', 'pixelRatioChanged'];
      for (const event of events) runtime.addEventListener(event, listener);
      return () => {
        for (const event of events) runtime.removeEventListener?.(event, listener);
      };
    },
    // v224 joined the camera pair; v239 adds the third name, because the runtime grew the third write
    // (`removeCamera`) and a leg that only watched creates and switches would keep a stale camera count after
    // a removal. One listener joins all three, as in the other five legs.
    watchCameras(listener) {
      if (!runtime.addEventListener || !runtime.removeEventListener) return () => {};
      const events = ['cameraCreated', 'activeCameraChanged', 'cameraRemoved'];
      for (const event of events) runtime.addEventListener(event, listener);
      return () => {
        for (const event of events) runtime.removeEventListener?.(event, listener);
      };
    },
    resetOrbit() {
      orbit = STUDIO_ORBIT_DEFAULT;
      aim();
      return buildSceneReport(runtime, counted, orbit, selected);
    },
    // M5 v261 — the body pair stays on the scene this surface COMPOSED, and that is a deliberate bound, not
    // an oversight: `writeFrame` is resolved by the host against `surface.sceneId` (Scene3D.tsx:238) and the
    // document send against the same address (:807), so a body filed into whatever scene happens to be live
    // would join `bodyIds` and never be drawn — the frame writer would be handed an id in a scene it does not
    // own. Adding a body to a world the panel is not looking at is a different feature from reading a world it
    // is, and this grant does not pretend to be it.
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
      authoredIds.push(entity.id);
      return { bodyId: entity.id, count: bodyIds.length };
    },
    removeBody(bodyId) {
      const at = bodyIds.indexOf(bodyId);
      if (at === -1) return false;
      bodyIds.splice(at, 1);
      // The runtime owns the entity; this surface only stops tracking it. Both must move, or the report
      // would count a body the loop no longer writes.
      runtime.removeEntity(built.sceneId, bodyId);
      const authoredAt = authoredIds.indexOf(bodyId);
      if (authoredAt !== -1) authoredIds.splice(authoredAt, 1);
      return true;
    },
    // M5 v244 — the camera AUTHORING pair. Both answer the LIVE scene's camera count rather than a list this
    // surface keeps, which is the difference from the body pair above: `bodyIds` exists because the frame
    // writer moves those bodies, while the report walks the runtime's camera Map (see `cameraRows`) and a
    // camera this surface added is not something the frame loop touches.
    addCamera(name) {
      const subject = liveSceneId();
      const camera = runtime.createCamera(subject, name);
      if (!camera?.id) return null;
      return { cameraId: camera.id, count: runtime.getScene(subject)?.cameras.size ?? 0 };
    },
    removeCamera(cameraId) {
      if (!runtime.removeCamera) {
        return {
          ok: false,
          cameraId,
          why: 'unsupported',
          reason: 'this host has no camera-removal verb; the surface will not delete a camera it cannot ask the runtime to drop',
        };
      }
      const subject = liveSceneId();
      const live = runtime.getScene(subject);
      // The subject is looked up in the scene the panel is READING first, so an id it never showed — another
      // scene's camera, a row already taken out, a typo — is answered as the fact it is and never reaches the
      // runtime's refusal path. The runtime gives the same `false` for the same subject; this is the surface
      // describing the scene it looks at, in its own voice, the way `removeBody` describes the bodies it holds.
      if (!live?.cameras.has(cameraId)) {
        return {
          ok: false,
          cameraId,
          why: 'absent',
          reason: `camera ${cameraId} is not in scene ${subject}, so this surface has nothing to take out`,
        };
      }
      let removed: boolean;
      try {
        removed = runtime.removeCamera(subject, cameraId);
      } catch (error) {
        // v239's two refusals arrive as throws, and each names the call that unlocks it. The surface carries
        // that sentence instead of paraphrasing it: only the runtime knows which sequence and shot hold a
        // camera, and a re-worded reason would be a second answer to "why can't I delete this".
        return { ok: false, cameraId, why: 'blocked', reason: error instanceof Error ? error.message : String(error) };
      }
      // The host can still answer `false` about a subject this surface just saw — the scene left the graph
      // between the two reads. Same fact as the refusal above, told by the host rather than by the surface.
      if (!removed) {
        return {
          ok: false,
          cameraId,
          why: 'absent',
          reason: `the runtime no longer holds camera ${cameraId} in scene ${subject}`,
        };
      }
      return { ok: true, cameraId, count: runtime.getScene(subject)?.cameras.size ?? 0 };
    },
    // M5 v260 — the seat becomes a control, and the orbit follows it. Same lookup-before-asking shape as
    // `removeCamera` above: an id this surface never showed the panel is answered by the surface, in its own
    // voice, and the host is not asked at all.
    activateCamera(cameraId) {
      if (!runtime.setActiveCamera) {
        return {
          ok: false,
          cameraId,
          why: 'unsupported',
          reason: 'this host has no camera-switch verb; the surface will not claim a seat it cannot ask the runtime to hold',
        };
      }
      const subject = liveSceneId();
      const live = runtime.getScene(subject);
      if (!live?.cameras.has(cameraId)) {
        return {
          ok: false,
          cameraId,
          why: 'absent',
          reason: `camera ${cameraId} is not in scene ${subject}, so this surface has no seat to give it`,
        };
      }
      if (!runtime.setActiveCamera(subject, cameraId)) {
        return {
          ok: false,
          cameraId,
          why: 'absent',
          reason: `the runtime no longer holds camera ${cameraId} in scene ${subject}`,
        };
      }
      // The handover, and the reason this verb is not a flag write: the seat is what the renderer draws from,
      // so an unaimed camera would replace the user's view with whatever the origin looking down -Z sees.
      // Aimed from the LIVE registry, the same read `aim()` uses, so the two cannot disagree about the seat.
      aim();
      return { ok: true, cameraId, activeCamera: seatOf() };
    },
    // M5 v261 — the scene seat, one level above v260's camera seat, with the same two handover duties and one
    // more: re-aim the new scene's camera at the orbit the user is holding, CLEAR the pick (a body chosen in
    // the old world is not in the new one, and the inspector would name an entity the report cannot find), and
    // report the live id read back FROM THE GRAPH rather than the id that was asked for.
    //
    // There is no `blocked` arm, unlike `removeCamera`: `setActiveScene` (threeRuntime.ts:1356) refuses nothing
    // that exists — it answers `false` only for an id outside `graph.scenes`, the same fact the lookup below
    // already caught, told by the host instead of by the surface.
    activateScene(sceneId) {
      if (!runtime.setActiveScene) {
        return {
          ok: false,
          sceneId,
          why: 'unsupported',
          reason: 'this host has no scene-switch verb; the surface will not claim a world it cannot ask the runtime to make live',
        };
      }
      // Lookup before asking, in the graph's own walk — the same population `buildSceneReport` lists, so the
      // rows the panel shows and the ids this verb accepts cannot drift apart.
      if (!runtime.getSceneGraph().scenes.has(sceneId)) {
        return {
          ok: false,
          sceneId,
          why: 'absent',
          reason: `scene ${sceneId} is not in the runtime's graph, so this surface has no world to switch to`,
        };
      }
      if (!runtime.setActiveScene(sceneId)) {
        return {
          ok: false,
          sceneId,
          why: 'absent',
          reason: `the runtime no longer holds scene ${sceneId} in its graph`,
        };
      }
      aim();
      selected = null;
      return { ok: true, sceneId, activeSceneId: liveSceneId(), aimed: seatOf() !== null };
    },
    save(savedAt) {
      if (!saver) {
        refused('this surface was built without a saver; the host that composed it must pass one to save');
      }
      if (typeof savedAt !== 'number' || !Number.isFinite(savedAt) || savedAt < 0) {
        refused(`savedAt is ${String(savedAt)}; the caller names the instant and it has to be a finite non-negative number`);
      }
      return saver.buildSaveFile(liveSceneId(), savedAt);
    },
    load(file) {
      if (!saver) {
        refused('this surface was built without a saver; the host that composed it must pass one to load');
      }
      if (!file || typeof file !== 'object' || Array.isArray(file)) {
        refused(`file is ${Array.isArray(file) ? 'an array' : typeof file}, not a save-file object`);
      }
      // A restore never overwrites live state — that is the saver's own rule, and this surface obeys it
      // by giving the restore a FRESH scene instead of its own: the demo scene and its frame loop stay
      // exactly what they were, and the restored world is there to be inspected.
      //
      // M5 v227 — and "fresh" used to be the whole protocol, which made a file carrying a cinematic
      // unwritable-then-unreadable: the runtime's save says it carries 'cinematic', and loading such a file
      // back through this surface was REFUSED — `restoreCinematic: "seq" belongs to scene stage, which is not
      // the active scene (…)` — because the cinematic half of a file named an ABSOLUTE scene id and the
      // sibling had a generated one. The runtime now restores that half against the caller's target scene
      // like every other half (v227), so all a caller owes its file is the part only a caller can do:
      // re-issue the cameras its shots NAME, because the format carries no camera objects at all, and make
      // the sibling the ACTIVE scene when the file describes a cutscene that was RUNNING — a sequence plays
      // nowhere else. What was re-issued is ANSWERED rather than done silently.
      const running = describesRunningSequence(file);
      // A running cutscene can only resume on the ACTIVE scene — the runtime's own condition — so a host
      // with no such verb cannot resume one at all. Said HERE, in the surface's own voice, rather than as
      // the runtime's scene-id-shaped refusal three calls later.
      if (running && !runtime.setActiveScene) {
        refused("the file describes a cutscene that was RUNNING, and this host has no setActiveScene verb to resume it on; a sequence plays only on the active scene");
      }
      const fresh = runtime.createScene('Restored Scene');
      // No rollback lives here, and none is owed: the scene was created one line up and the ids below are
      // deduped from the file, so neither verb can refuse what it is asked for.
      const reissued: string[] = [];
      for (const cameraId of cameraIdsNamedBy(file)) {
        // The id is the file's own; the name is NOT — the format never carried one, so it is spelled from the
        // id rather than borrowed from a camera the save cannot describe. `SceneLoadReissued` is how a host
        // says that out loud.
        runtime.createCamera(fresh.id, `Restored ${cameraId}`, 'perspective', {}, cameraId);
        reissued.push(cameraId);
      }
      if (running) runtime.setActiveScene?.(fresh.id);
      const report = saver.loadSaveFile(file, fresh.id);
      return { sceneId: fresh.id, report, reissued: { cameraIds: reissued, activated: running } };
    },
  };
}
