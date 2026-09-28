import * as THREE from 'three';
import { DEFAULT_THREE_CONFIG, sceneId, entityId, cameraId, animationId } from './types.js';
import type {
  ThreeScene,
  ThreeEntity,
  ThreeCamera,
  ThreeAnimation,
  SceneGraph,
  SceneId,
  EntityId,
  CameraId,
  AnimationId,
  EntityComponent,
  ThreeRuntimeConfig,
  LightingConfig,
  PhysicsConfig,
  CharacterController,
  ControllerInput,
  SerializedEntity,
  SerializedVector3,
  SerializedEuler,
  SaveFile,
  CinematicSequence,
  CinematicShot,
  SerializedCinematic,
  SerializedCinematicSequence,
  SerializedCinematicShot,
  SerializedCurve,
} from './types.js';
import {
  createWebGLBackend,
  defaultFrameScheduler,
  type FrameScheduler,
  type RenderBackend,
  type RenderBackendFactory,
} from './renderBackend.js';
import type { SaveStore } from './saveStore.js';

export { DEFAULT_THREE_CONFIG };

/** A controller attached to an entity, stepped by the frame loop. `groundY` is NOT one of these fields
 *  — it is a property of the world the character stands on, so it lives on the registry entry. */
export interface ControllerAttachOptions {
  type?: CharacterController['type'];
  speed?: number;
  runSpeed?: number;
  jumpForce?: number;
  gravity?: number;
  airControl?: number;
  slopeLimit?: number;
  stepOffset?: number;
  groundY?: number;
  input?: Partial<ControllerInput>;
}

/** The declared numbers the integrator starts from when a caller names none. */
export const DEFAULT_CONTROLLER = {
  type: 'thirdPerson' as const,
  speed: 4,
  runSpeed: 8,
  jumpForce: 5,
  gravity: 9.81,
  airControl: 0.5,
  slopeLimit: 45,
  stepOffset: 0.3,
  groundY: 0,
};

/** The `PhysicsConfig` fields the frame loop READS. `physicsFieldAudit` reports the rest of the type by
 *  name, so a declared word is never left with no reader: `broadphase` and `solverIterations` name work
 *  on contacts, and this package has no collision geometry to have contacts with. */
const HONORED_PHYSICS_FIELDS: readonly string[] = ['gravity', 'timeStep', 'maxSubSteps'];

const UNHONORED_PHYSICS_REASONS: readonly { field: string; reason: string }[] = [
  { field: 'broadphase', reason: 'names a search over candidate contact pairs, and there is no collision geometry in this package to search among' },
  { field: 'solverIterations', reason: 'counts passes over existing contacts, and a character is held up by the `groundY` plane, not by a solver' },
];

/** The `CinematicShot` fields the playhead reads while time advances. `transition`, `transitionDuration`
 *  and `postProcessing` are the declared words left over, and `cinematicFieldAudit` says WHY each one is
 *  in the second list: a value this player cannot perform is refused at `defineCinematic`, which is not
 *  the same claim as honoring a field — a field that can only ever hold one value changes nothing. */
const HONORED_SHOT_FIELDS: readonly string[] = [
  'id', 'cameraId', 'startTime', 'endTime', 'cameraPath', 'targetPath', 'fovAnimation',
];

const UNHONORED_SHOT_REASONS: readonly { field: string; reason: string }[] = [
  { field: 'transition', reason: "only the value 'cut' is accepted; a fade, dissolve, wipe or slide blends two rendered images, and this runtime draws one active camera per frame" },
  { field: 'transitionDuration', reason: 'the only transition available is instantaneous, so a non-zero duration is refused at defineCinematic rather than timed — after the refusal the number has nothing to control' },
  { field: 'postProcessing', reason: 'declares a list of render passes; nothing here compiles a pass, so a shot cannot switch a filter chain the backend does not have' },
];

/** `CinematicSequence` split the same way: `duration` is DERIVED from the shots, `currentShot` and
 *  `playing` are written by the player, and the rest identify what is being played. */
const READ_SEQUENCE_FIELDS: readonly string[] = ['id', 'name', 'shots', 'duration'];
const WRITTEN_SEQUENCE_FIELDS: readonly string[] = ['currentShot', 'playing'];

/**
 * The easings a `fovAnimation` can name. The declared type says `easing: string`, so the honest options
 * were to treat an unknown word as linear (a silent guess) or to refuse it at definition; this refuses,
 * and `defineCinematic` names the keys of THIS table in the message, so the list cannot go stale in prose.
 */
const CINEMATIC_EASINGS: Record<string, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
};

/**
 * The three `curveType` words a `THREE.CatmullRomCurve3` answers to. This is a table rather than a
 * pass-through to the constructor because the constructor does NOT refuse an unknown one: measured,
 * `new THREE.CatmullRomCurve3(points, false, 'bogus')` keeps the word on the object and then answers
 * `getPointAt` with `NaN, NaN, NaN`. A save whose path is a bag of numbers has to say which interpolation
 * rebuilt it, or the camera lands at NaN and the runtime's only complaint is that the path has no length.
 */
const CURVE_TYPES: readonly string[] = ['centripetal', 'chordal', 'catmullrom'];

const CURVE_AXES = ['x', 'y', 'z'] as const;

const quoted = (list: readonly string[]) => list.map((word) => `"${word}"`).join(', ');

/**
 * A live curve as the data `SerializedCurve` declares — the control points and the three constructor
 * arguments that decide the shape through them.
 *
 * It refuses on the way OUT because `JSON.stringify` writes a NaN as `null`: a non-finite coordinate would
 * come back as a DIFFERENT number than the one written, and the curve rebuilt from it points somewhere
 * else. `curveToData` also refuses a `curveType` outside `CURVE_TYPES`, because the writer must not emit a
 * word its own reader refuses.
 */
function curveToData(path: THREE.CatmullRomCurve3, where: string): SerializedCurve {
  const points = path.points.map((point, index) => {
    for (const axis of CURVE_AXES) {
      if (!Number.isFinite(point[axis])) {
        throw new Error(`cinematicSnapshot: ${where} control point ${index} has a non-finite ${axis} (${point[axis]}); a save stores values, and JSON writes this one as null`);
      }
    }
    return { x: point.x, y: point.y, z: point.z };
  });
  if (!CURVE_TYPES.includes(path.curveType)) {
    throw new Error(`cinematicSnapshot: ${where} has curveType ${JSON.stringify(path.curveType)}, which is not one of ${quoted(CURVE_TYPES)} — three.js reads an unknown word as NaN coordinates, so this codec will not write one it cannot read back`);
  }
  if (!Number.isFinite(path.tension)) {
    throw new Error(`cinematicSnapshot: ${where} has tension ${path.tension}; the field is read by a "catmullrom" curve, so a non-finite one is either a destroyed shape or a destroyed round trip through JSON`);
  }
  return {
    points,
    closed: path.closed,
    curveType: path.curveType as SerializedCurve['curveType'],
    tension: path.tension,
  };
}

/**
 * The data back into a curve. Three of these refusals are about CRASHES rather than meaning: one control
 * point makes `getLength()` throw a TypeError out of three.js (`Cannot read properties of undefined`), and
 * an array of plain `{x,y,z}` objects makes it throw `p1.distanceToSquared is not a function`. A save that
 * hands the player a crash is not a refused save, so the decoder checks the SHAPE here and leaves
 * `defineCinematic` the timeline questions it already answers — the partition is deliberate, because two
 * owners of one rule is the bug this lane keeps relearning.
 */
function curveFromData(data: SerializedCurve, where: string): THREE.CatmullRomCurve3 {
  const points = data.points;
  if (!Array.isArray(points)) {
    throw new Error(`restoreCinematic: ${where} points is ${typeof points}, not an array of {x, y, z}`);
  }
  if (points.length < 2) {
    throw new Error(`restoreCinematic: ${where} names ${points.length} control point(s); one point is not a path, and three.js answers getLength() for it by throwing a TypeError from inside the library`);
  }
  const vectors = points.map((point, index) => {
    for (const axis of CURVE_AXES) {
      const value = (point as unknown as Record<string, unknown> | null | undefined)?.[axis];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`restoreCinematic: ${where} control point ${index} has ${axis} = ${String(value)}; a saved coordinate has to be a finite number, and three.js reads anything else as a NaN position or a crash`);
      }
    }
    return new THREE.Vector3(point.x, point.y, point.z);
  });
  if (typeof data.closed !== 'boolean') {
    throw new Error(`restoreCinematic: ${where} closed is ${typeof data.closed}, not a boolean; a truthy non-boolean would make a path loop without the save saying so`);
  }
  if (!CURVE_TYPES.includes(data.curveType)) {
    throw new Error(`restoreCinematic: ${where} curveType ${JSON.stringify(data.curveType)} is not one of ${quoted(CURVE_TYPES)}; three.js would keep the word and answer getPointAt with NaN, which is a camera at no position wearing a named curve type`);
  }
  if (typeof data.tension !== 'number' || !Number.isFinite(data.tension)) {
    throw new Error(`restoreCinematic: ${where} tension is ${String(data.tension)}; a "catmullrom" curve reads it as its shape, and JSON writes a NaN here as null`);
  }
  return new THREE.CatmullRomCurve3(vectors, data.closed, data.curveType, data.tension);
}

/** A live shot as data. Only the keys the shot actually carries are written: `cameraPath` and `targetPath`
 *  are optional in the declared type, and a snapshot full of `undefined`s is a shape that claims fields the
 *  shot does not have (and drops them on the floor the moment anything JSON-writes it).
 *
 *  The numeric checks are here because `defineCinematic` copies the shot ARRAY but not the shot OBJECTS: a
 *  caller that writes `shot.startTime = NaN` after registering has a live sequence this runtime plays and
 *  cannot save. The writer refuses what its own reader would refuse, so no snapshot this method produces is
 *  a save that cannot be restored. */
function shotToData(shot: CinematicShot, where: string): SerializedCinematicShot {
  for (const name of ['startTime', 'endTime', 'transitionDuration'] as const) {
    const value = shot[name];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`cinematicSnapshot: ${where} ${name} is ${String(value)}; a save stores values, and this one would be unreadable by restoreCinematic`);
    }
  }
  const data: SerializedCinematicShot = {
    id: shot.id,
    cameraId: shot.cameraId,
    startTime: shot.startTime,
    endTime: shot.endTime,
    transition: shot.transition,
    transitionDuration: shot.transitionDuration,
  };
  if (shot.cameraPath) data.cameraPath = curveToData(shot.cameraPath, `${where} cameraPath`);
  if (shot.targetPath) data.targetPath = curveToData(shot.targetPath, `${where} targetPath`);
  if (shot.fovAnimation) {
    for (const name of ['start', 'end'] as const) {
      const value = shot.fovAnimation[name];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`cinematicSnapshot: ${where} fovAnimation.${name} is ${String(value)}, which JSON would write as null and a camera would read as no field of view`);
      }
    }
    data.fovAnimation = {
      start: shot.fovAnimation.start,
      end: shot.fovAnimation.end,
      easing: shot.fovAnimation.easing,
    };
  }
  if (shot.postProcessing) {
    plainDataOrRefuse(shot.postProcessing, `${where} postProcessing`);
    data.postProcessing = structuredClone(shot.postProcessing);
  }
  return data;
}

/** The data back into a shot. Every field is checked for the PRIMITIVE it has to be, because a shot that is
 *  not an object crashes `defineCinematic` on its first property read (`Cannot read properties of null`),
 *  and a crash is not a refusal. What the shot MEANS — its window, its camera, its transition word, its
 *  easing, its arc — stays `defineCinematic`'s to answer, so a drifted save meets the same door a
 *  hand-written call does. */
function shotFromData(saved: SerializedCinematicShot, where: string): CinematicShot {
  const value = saved as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`restoreCinematic: ${where} is ${Array.isArray(value) ? 'an array' : typeof value}, not a shot object; defineCinematic reads its fields and a non-object would be a crash, not a refusal`);
  }
  for (const [name, kind] of [['id', 'string'], ['cameraId', 'string'], ['transition', 'string']] as const) {
    const field = (value as Record<string, unknown>)[name];
    if (typeof field !== kind) {
      throw new Error(`restoreCinematic: ${where} ${name} is ${typeof field}, expected ${kind}`);
    }
  }
  for (const name of ['startTime', 'endTime', 'transitionDuration'] as const) {
    const field = (value as Record<string, unknown>)[name];
    if (typeof field !== 'number' || !Number.isFinite(field)) {
      throw new Error(`restoreCinematic: ${where} ${name} is ${String(field)}; the shot's window is in seconds, and a non-finite one makes the timeline unreadable in a way that only shows up as a NaN position`);
    }
  }
  const shot: CinematicShot = {
    id: saved.id,
    cameraId: saved.cameraId,
    startTime: saved.startTime,
    endTime: saved.endTime,
    transition: saved.transition,
    transitionDuration: saved.transitionDuration,
  };
  if (saved.cameraPath) shot.cameraPath = curveFromData(saved.cameraPath, `${where} cameraPath`);
  if (saved.targetPath) shot.targetPath = curveFromData(saved.targetPath, `${where} targetPath`);
  if (saved.fovAnimation) {
    const fov = saved.fovAnimation as unknown;
    for (const name of ['start', 'end'] as const) {
      const field = (fov as Record<string, unknown>)?.[name];
      if (typeof field !== 'number' || !Number.isFinite(field)) {
        throw new Error(`restoreCinematic: ${where} fovAnimation.${name} is ${String(field)}; the player interpolates it onto a camera, so a non-number there is a camera whose field of view goes NaN — an out-of-range NUMBER is defineCinematic's own refusal`);
      }
    }
    shot.fovAnimation = { ...saved.fovAnimation };
  }
  if (saved.postProcessing) {
    plainDataOrRefuse(saved.postProcessing, `${where} postProcessing`);
    shot.postProcessing = structuredClone(saved.postProcessing);
  }
  return shot;
}

/**
 * The `sequences` collection as an ordered list, answering the ENVELOPE questions a reader has to ask before
 * a single sequence is registered.
 *
 * A `Map` is refused by name, and that refusal is v119's correction to v118: the older shape spelled this
 * collection as a `Map` and the reader refused a plain object — which is what a JSON write leaves behind — so
 * the save could not survive the one trip a save exists to survive. Collections in a save shape are arrays of
 * `[key, value]` pairs, here and in `SaveData.entities`. The rest are the two-spellings-of-one-fact checks
 * the runtime itself cannot produce (`playing` is derived from the slot while playing, and `defineCinematic`
 * owns its own key): a pair whose key disagrees with the record under it, an `id` that is not a name
 * `activeSequence` can address, a scene the shots do not belong to, a `currentShot` no shot answers to.
 */
function savedSequences(snapshot: SerializedCinematic): SerializedCinematicSequence[] {
  const pairs = snapshot.sequences as unknown;
  if (pairs instanceof Map) {
    throw new Error('restoreCinematic: sequences arrived as a Map, which is the shape v118 wrote and JSON erases; a save spells its collections as [key, value] arrays so the entries are still there on the way back');
  }
  if (!Array.isArray(pairs)) {
    throw new Error(`restoreCinematic: sequences is ${typeof pairs}, not an array of [key, sequence] pairs`);
  }
  const list: SerializedCinematicSequence[] = [];
  for (const [index, pair] of (pairs as [string, SerializedCinematicSequence][]).entries()) {
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new Error(`restoreCinematic: sequences[${index}] is ${Array.isArray(pair) ? `an array of ${pair.length}` : typeof pair}, not a [key, sequence] pair`);
    }
    const [key, value] = pair;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`restoreCinematic: sequences[${index}] holds ${Array.isArray(value) ? 'an array' : typeof value} under key ${String(key)}, not a sequence object`);
    }
    const entry = value;
    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      throw new Error(`restoreCinematic: the sequence stored under ${String(key)} calls itself ${String(entry.id)}; activeSequence addresses a sequence by its id, so an id that is not a name is a field no part of the save can point at`);
    }
    if (key !== entry.id) {
      throw new Error(`restoreCinematic: sequences[${index}] is keyed ${String(key)} but the record under it says ${entry.id}; a key and the name it stores are two spellings of one fact and the save has to pick one`);
    }
    if (typeof entry.sceneId !== 'string' || entry.sceneId.length === 0) {
      throw new Error(`restoreCinematic: sequence ${entry.id} sceneId is ${String(entry.sceneId)}; a shot's cameraId addresses one scene's camera set, so the save has to name the scene it belongs to`);
    }
    if (typeof entry.playing !== 'boolean') {
      throw new Error(`restoreCinematic: sequence ${entry.id} playing is ${String(entry.playing)}, not a boolean; a truthy non-boolean would make the save claim a running cutscene without saying so`);
    }
    if (!Array.isArray(entry.shots)) {
      throw new Error(`restoreCinematic: sequence ${entry.id} shots is ${typeof entry.shots}, not an array; defineCinematic reads shots[0] and would crash instead of refusing`);
    }
    if (!Number.isInteger(entry.currentShot) || entry.currentShot < 0 || entry.currentShot >= entry.shots.length) {
      throw new Error(`restoreCinematic: sequence ${entry.id} currentShot is ${String(entry.currentShot)} and the save gives it ${entry.shots.length} shot(s); an index no shot answers to is a save lying about its own timeline`);
    }
    list.push(entry);
  }
  return list;
}

/**
 * Which axes a controller type moves on, and whose frame those axes come from. `sideScroll` lives in
 * XY, so `moveForward`/`moveBackward` have nothing to push against; `firstPerson`/`thirdPerson` read
 * the ACTIVE camera's yaw, so the same key produces a different world direction per camera.
 */
const MOVEMENT_PLANE: Record<CharacterController['type'], 'cameraXZ' | 'worldXZ' | 'worldXY'> = {
  firstPerson: 'cameraXZ',
  thirdPerson: 'cameraXZ',
  topDown: 'worldXZ',
  custom: 'worldXZ',
  sideScroll: 'worldXY',
};

/** Names the integrator CONSULTS to decide what happens this frame. */
const READ_CONTROLLER_FIELDS: readonly string[] = [
  'entityId', 'type', 'speed', 'runSpeed', 'jumpForce', 'gravity', 'airControl', 'grounded', 'input',
];

/** Names the integrator WRITES as its result. Kept separate from the reads, because a field can be
 *  both (`grounded`) and because writing a field is not the same claim as consulting it. */
const WRITTEN_CONTROLLER_FIELDS: readonly string[] = ['velocity', 'state', 'grounded'];

/** Same rule for the input flags; which of them a plane can honor is derived from `MOVEMENT_PLANE`. */
const READ_INPUT_FLAGS: readonly string[] = ['moveForward', 'moveBackward', 'moveLeft', 'moveRight', 'jump', 'run', 'crouch'];

interface ControllerEntry {
  controller: CharacterController;
  groundY: number;
  /** False when the caller named no gravity, which is what makes the world's declared pull the source
   *  for this controller: an entry that cannot say whether its number was a choice would have to ignore
   *  `scene.physics` (refusing to honor it) or overwrite a caller's explicit value (honoring it too much). */
  gravityDeclared: boolean;
}

/** What `physicsFieldAudit` answers for a scene. `consulted`/`unhonored` are read off the shipped tables
 *  against the fields `PhysicsConfig` declares, and `effectiveGravity`/`stepping` are read off the live
 *  scene and the last frame, so the answer cannot be a constant wearing a name. */
export interface PhysicsFieldAudit {
  declared: boolean;
  consulted: string[];
  unhonored: { field: string; reason: string }[];
  effectiveGravity: number;
  stepping: { timeStep: number | null; maxSubSteps: number | null; lastFrame: { steps: number; droppedTime: number } | null };
}

/** What `playCinematic`/`updateCinematics` need beyond the declared sequence: which scene's cameras the
 *  shot ids address, and where the playhead is. `CinematicSequence` has no time field — and
 *  `SerializedCinematic` keeps `currentTime` OUTSIDE the sequence — so the playhead lives on the entry,
 *  mirroring the declared save shape instead of inventing a field the type does not have. */
interface CinematicEntry {
  sequence: CinematicSequence;
  sceneId: SceneId;
  time: number;
  /** Which shot the playhead was inside on the previous frame, or -1 before the first. The camera switch
   *  happens on a CHANGE, so this is the memory that makes a cut fire once rather than every frame. */
  lastShot: number;
}

/** What the caller declares. `duration`, `currentShot` and `playing` are the runtime's to fill: a
 *  `duration` that disagreed with its own shots would be a timeline with two answers. */
export interface CinematicSequenceInput {
  id: string;
  name: string;
  shots: CinematicShot[];
  duration?: number;
}

/** What `cinematicFieldAudit` answers for a sequence, in the same shape as `physicsFieldAudit`: the two
 *  field lists are partitions of `CinematicShot` / `CinematicSequence` as DECLARED in `types.ts` (the
 *  suite requires that, so a newly declared field cannot join the silent ones), and `playhead` is read
 *  off the live entry so the answer moves when the timeline does. */
export interface CinematicFieldAudit {
  consulted: string[];
  unhonored: { field: string; reason: string }[];
  sequenceRead: string[];
  sequenceWritten: string[];
  playhead: {
    playing: boolean;
    time: number;
    duration: number;
    currentShot: number;
    shotId: string | null;
    cameraId: CameraId | null;
    /** True when another sequence holds the single active slot — see `playCinematic`. */
    blockedBy: string | null;
  };
}

/** What `restoreCinematic` answers. `playheads` is here rather than left implicit because the declared save
 *  shape carries a per-sequence `currentShot` but a playhead TIME only for the active sequence: for a
 *  stopped one the most specific instant a save can prove is the start of the shot it names, and the report
 *  has to say what it landed on instead of pretending it restored what it could not read. */
export interface CinematicRestoreReport {
  restored: string[];
  activeSequence: string | null;
  playheads: { id: string; time: number; currentShot: number }[];
}

/** What `loadSaveFile` answers: the scene it loaded into, the entity ids it inserted, the sequence ids it
 *  registered, and the `carries` list it checked its own work against. Every field is a record of what
 *  happened, so a caller can tell "loaded nothing because the file was empty" from "refused" — the latter
 *  throws, and no report is returned at all. */
export interface SaveFileLoadReport {
  sceneId: SceneId;
  entities: EntityId[];
  sequences: string[];
  carries: string[];
}

/** What `writeSaveFile` answers: where the bytes went, through which store, how big they are, and what the
 *  file says it carries. `bytes` is the length of the string this call wrote — the store's own count would be
 *  a second measurement of a value the writer already had in hand. */
export interface SaveFileWriteReport {
  path: string;
  store: string;
  bytes: number;
  /** Whether the bytes were flushed before the rename. `false` is the default and is not a failure: the
   *  caller asked for atomic, not for durable. A store that cannot flush refuses the request outright, so a
   *  `true` here always means a flush actually happened. */
  durable: boolean;
  sceneId: SceneId;
  entities: number;
  sequences: number;
  carries: string[];
  doesNotCarry: string[];
}

/** What `readSaveFile` answers: the load report plus where the bytes came from. */
export interface SaveFileReadReport extends SaveFileLoadReport {
  path: string;
  store: string;
  bytes: number;
}

/** What `deleteSaveFile` answers. `removed: false` means the path held nothing — see the method for why that
 *  is an answer rather than an error. */
export interface SaveFileDeleteReport {
  path: string;
  store: string;
  removed: boolean;
}

/** What `latestSaveFile` answers when at least one save could be understood. `ties` counts the readable saves
 *  sharing the winning `savedAt`; the tie-break is the path, and the caller deserves to know it was arbitrary.
 *  `unreadable` is never empty by accident — a save the runtime cannot read is reported, not hidden. */
export interface SaveFileLatest {
  path: string;
  savedAt: number;
  version: number;
  ties: number;
  unreadable: { path: string; why: string }[];
}

/** What `controllerFieldAudit` answers. The `untouched` list is the honesty surface — a field declared
 *  on `CharacterController` but never implemented shows up there BY NAME instead of being ignored in
 *  silence. `slopeLimit` and `stepOffset` are in it today: both need collision geometry this package
 *  does not have. (`scene.physics` / `PhysicsConfig` was in that sentence up to v116, which gave the
 *  declared world a reader; see `physicsFieldAudit` for what it still cannot honor.) */
export interface ControllerFieldAudit {
  consulted: string[];
  written: string[];
  untouched: string[];
  input: { consulted: string[]; untouched: string[] };
}

function emptyControllerInput(): ControllerInput {
  return { moveForward: false, moveBackward: false, moveLeft: false, moveRight: false, jump: false, run: false, crouch: false, custom: {} };
}

/** Which shot owns a playhead instant: the LAST one that has started, so a shot holds the camera until the
 *  next one begins. `defineCinematic` has already refused a timeline with a gap or an overlap, which is
 *  what makes this total — with a gap, the frames inside it would silently show the previous shot. */
function shotIndexAt(shots: readonly CinematicShot[], time: number): number {
  let index = 0;
  for (let i = 0; i < shots.length; i += 1) {
    if (shots[i]!.startTime <= time) index = i;
  }
  return index;
}

/**
 * What the save surface can carry. `snapshotEntity`/`restoreEntity` are the first readers of the
 * `SerializedEntity` type, which `types.ts` had declared with nothing constructing or consuming it.
 *
 * An entity's `threeObject` and `transform` are not extra state — they are two views of the same
 * numbers (`entity.transform.position === entity.threeObject.position`, pinned in the controller
 * suite) — so the save shape carries them as `position`/`rotation`/`scale`. This table records WHICH
 * fields of that view the shape claims to carry, and `saveFeasibilityAudit` accepts an alias only when
 * every name it claims is present in the snapshot it actually builds. That is why `layers` is listed
 * here and declared on `SerializedEntity`: the claim is checked against the produced record, so a shape
 * that stops carrying a field it claims is reported as broken instead of restoring a default.
 */
const SAVE_ALIAS_CLAIMS: Record<string, readonly string[]> = {
  threeObject: ['position', 'rotation', 'scale', 'visible', 'castShadow', 'receiveShadow', 'layers'],
  transform: ['position', 'rotation', 'scale'],
};

/** Which declared `SaveData` fields the runtime can fill today, and which are waiting on a system that
 *  does not exist yet. The blocked half is the honest part: `npcs`/`quests`/`player` are declared in
 *  `types.ts` and implemented by nothing, so a `SaveData` written today would carry empty maps that look
 *  like an empty game world. `savable` means BOTH directions survive a FILE since v119: `entities` has
 *  `snapshotEntity`/`restoreEntity`, `cinematic` has `cinematicSnapshot`/`restoreCinematic`, and
 *  `buildSaveFile` runs `assertDiskSafe` over the finished file so neither half can write a `Map` or a live
 *  object the reader could not get back. The pair is not decoration — `saveSnapshot.test.ts` derives each
 *  field's stem from its own name and requires a surface name to implement a `savable` row and NONE to
 *  implement a `blocked` one, which is what makes this table unable to sit still while an implementation
 *  ships beside it. */
const SAVE_DATA_FEASIBILITY: { savable: readonly string[]; blocked: readonly { field: string; needs: string }[] } = {
  savable: ['entities', 'cinematic'],
  blocked: [
    { field: 'sceneGraph', needs: 'SerializedScene stores a LightingConfig whose lights hold live THREE.Light objects and a PhysicsConfig whose gravity is a live THREE.Vector3; nothing here rebuilds either' },
    { field: 'npcs', needs: 'NPCSystem is declared in types.ts and implemented by nothing' },
    { field: 'quests', needs: 'QuestSystem is declared in types.ts and implemented by nothing' },
    { field: 'player', needs: 'SerializedPlayer names health/mana/inventory/skills; the runtime holds no player state' },
    { field: 'worldState', needs: 'the runtime keeps no world-state store' },
  ],
};

/** The answer `saveFeasibilityAudit` gives. `dropped` is the list that matters: a live field the shape
 *  cannot carry is a save that lies about the state it restored. */
export interface SaveFeasibilityAudit {
  dropped: string[];
  aliased: string[];
  savable: string[];
  blocked: { field: string; needs: string }[];
}

/**
 * The two open bags in the save shape (`userData`, `EntityComponent.data`) must hold data, not live
 * objects. A reference to a running `THREE.Object3D` inside a snapshot keeps the whole scene graph alive
 * behind it and restores as a detached object, so a class instance is refused BY NAME rather than copied
 * into something flatter than what the caller put in.
 */
function plainDataOrRefuse(value: unknown, path: string): void {
  if (value === null || value === undefined) return;
  const kind = typeof value;
  if (kind === 'number' || kind === 'string' || kind === 'boolean') return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => plainDataOrRefuse(item, `${path}[${i}]`));
    return;
  }
  if (kind !== 'object') {
    throw new Error(`snapshot: ${path} holds ${kind}, which a save cannot carry`);
  }
  const proto = Object.getPrototypeOf(value as object);
  if (proto !== Object.prototype && proto !== null) {
    const name = (value as { constructor?: { name?: string } }).constructor?.name ?? 'unnamed class';
    throw new Error(`snapshot: ${path} holds a ${name} instance, not plain data — a save stores values, not live objects`);
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    plainDataOrRefuse(nested, `${path}.${key}`);
  }
}

/**
 * The `format` literal and `version` a `SaveFile` this runtime writes and reads must carry. A file whose
 * version is not this number is refused rather than interpreted: v117 learned with `curveType` that an
 * unrecognized word handed to a permissive reader does not fail, it silently means something else.
 */
export const SAVE_FILE_FORMAT = 'nexus-three-runtime-save';
export const SAVE_FILE_VERSION = 1;

/** The rotation orders three.js composes a quaternion from. */
const EULER_ORDERS: readonly string[] = ['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX'];

/** A live vector as the three numbers a file can hold. */
function vectorToData(vector: THREE.Vector3, where: string): SerializedVector3 {
  const data = { x: vector.x, y: vector.y, z: vector.z };
  for (const axis of CURVE_AXES) {
    if (!Number.isFinite(data[axis])) {
      throw new Error(`snapshotEntity: ${where} ${axis} is ${data[axis]}; a file stores finite numbers, and JSON writes this one as null`);
    }
  }
  return data;
}

/** An `Euler` as four values, including the order, because the order is part of the pose. */
function eulerToData(euler: THREE.Euler, where: string): SerializedEuler {
  const data = { x: euler.x, y: euler.y, z: euler.z, order: euler.order };
  for (const axis of CURVE_AXES) {
    if (!Number.isFinite(data[axis])) {
      throw new Error(`snapshotEntity: ${where} ${axis} is ${data[axis]}; a file stores finite numbers, and JSON writes this one as null`);
    }
  }
  if (typeof data.order !== 'string') {
    throw new Error(`snapshotEntity: ${where} order is ${typeof data.order}, not one of ${quoted(EULER_ORDERS)}`);
  }
  return data;
}

/**
 * The numbers back into a live object. `Euler.copy` is NOT usable on a plain object and this is the whole
 * reason the shape declares `SerializedEuler`: read straight from a file, `x` is `undefined` where the
 * flattened Euler wrote `_x`, and the entity comes back aimed at NaN with no error anywhere to say so.
 */
function vectorFromData(data: SerializedVector3, where: string): THREE.Vector3 {
  const value = data as unknown as Record<string, unknown> | null;  for (const axis of CURVE_AXES) {
    const component = value?.[axis];
    if (typeof component !== 'number' || !Number.isFinite(component)) {
      throw new Error(`restoreEntity: ${where} ${axis} is ${String(component)}; a saved position is three finite numbers, and a flattened THREE.Vector3 that lost its class still reads as {x,y,z} while an Euler flattened the same way arrives as _x/_y/_z and would restore as NaN`);
    }
  }
  return new THREE.Vector3((data as SerializedVector3).x, (data as SerializedVector3).y, (data as SerializedVector3).z);
}

function eulerFromData(data: SerializedEuler, where: string): THREE.Euler {
  const value = data as unknown as Record<string, unknown> | null;
  for (const axis of CURVE_AXES) {
    const component = value?.[axis];
    if (typeof component !== 'number' || !Number.isFinite(component)) {
      throw new Error(`restoreEntity: ${where} ${axis} is ${String(component)}, not a finite number of radians`);
    }
  }
  if (typeof data.order !== 'string' || !EULER_ORDERS.includes(data.order)) {
    throw new Error(`restoreEntity: ${where} order is ${String(data.order)}, which is not one of ${quoted(EULER_ORDERS)}; three.js would leave the quaternion composed from the previous order rather than refusing the word`);
  }
  return new THREE.Euler(data.x, data.y, data.z, data.order as THREE.EulerOrder);
}

/**
 * Say whether a value could be a FILE: no `Map` (JSON writes one as `{}`, which is how a save with three
 * components on it comes back with none), no `Set`, no class instance, no function, no non-finite number
 * (JSON writes NaN and Infinity as `null`), and no `undefined` arriving as a value.
 *
 * The loader runs it over what it is handed and the writer runs it over what it is about to produce, so the
 * rule has one owner and neither direction can write or accept a shape the other cannot read. A `Map` is
 * refused BY NAME with the replacement spelled out, because "it restored zero components" is the failure this
 * whole lane exists to prevent.
 */
function assertDiskSafe(value: unknown, path: string): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`saveFile: ${path} holds ${value}, which JSON writes as null`);
    return;
  }
  if (typeof value !== 'object') {
    if (typeof value !== 'string' && typeof value !== 'boolean') {
      throw new Error(`saveFile: ${path} holds ${typeof value}, which a file cannot hold at all`);
    }
    return;
  }
  if (value instanceof Map || value instanceof Set) {
    throw new Error(`saveFile: ${path} holds a ${value instanceof Map ? 'Map' : 'Set'}, which JSON.stringify writes as {} — a save shape spells its collections as arrays of entries so the contents survive the trip`);
  }
  const proto = Object.getPrototypeOf(value as object);
  if (proto !== Object.prototype && proto !== null && !Array.isArray(value)) {
    const name = (value as { constructor?: { name?: string } }).constructor?.name ?? 'unnamed class';
    throw new Error(`saveFile: ${path} holds a ${name} instance, not plain data — a file stores values, not live objects`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertDiskSafe(item, `${path}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    assertDiskSafe(nested, `${path}.${key}`);
  }
}

/** The components entry array back into the `Map` the live record uses.
 *
 *  The pair's KEY and the component's own `type` are two spellings of one name — `addComponent` files every
 *  component under `component.type` — so a save that shows them disagreeing is refused with both printed
 *  rather than one of them being believed. A `Map` handed in is refused too, because that is the shape a save
 *  written before this rule (or by a caller who ignored it) carries, and silently loading it would drop
 *  every component on the floor: `for…of` over a plain `{}` yields nothing and throws nothing. */
function componentsFromData(list: SerializedEntity['components']): [string, EntityComponent][] {
  if (list instanceof Map) {
    throw new Error('restoreEntity: components arrived as a Map, which JSON.stringify writes as {} — a reader that accepted it would load no components at all, so the save shape spells them as [name, component] pairs');
  }
  if (!Array.isArray(list)) {
    throw new Error(`restoreEntity: components is ${typeof list}, not an array of [name, component] pairs`);
  }
  return list.map((pair, index) => {
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new Error(`restoreEntity: components[${index}] is ${Array.isArray(pair) ? `an array of ${pair.length}` : typeof pair}, not a [name, component] pair`);
    }
    const [key, component] = pair as [string, EntityComponent];
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error(`restoreEntity: components[${index}] key is ${String(key)}, expected the component's type`);
    }
    if (!component || typeof component !== 'object' || typeof component.type !== 'string' || typeof component.enabled !== 'boolean') {
      throw new Error(`restoreEntity: components[${index}] holds a component with no string type or no boolean enabled flag`);
    }
    if (component.type !== key) {
      throw new Error(`restoreEntity: components[${index}] is filed under "${key}" but calls itself "${component.type}"; addComponent files a component under its own type, so a save with two names for one key has to pick one`);
    }
    plainDataOrRefuse(component.data, `components.${key}.data`);
    return [key, { type: component.type, data: component.data, enabled: component.enabled }];
  });
}

export class ThreeRuntime {
  private config: ThreeRuntimeConfig;
  private sceneGraph: SceneGraph;
  private backend: RenderBackend | null = null;
  private backendFactory: RenderBackendFactory;
  private scheduler: FrameScheduler;
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private animationFrameId: number | null = null;
  private running = false;
  private eventListeners: Map<string, Function[]> = new Map();
  /** Entities carrying a character controller, keyed by entity id. The registry — not a component —
   *  owns this because the integrator needs a per-entity world property (`groundY`) beside the controller. */
  private controllers: Map<EntityId, ControllerEntry> = new Map();
  /** Cinematic sequences the runtime owns, keyed by their declared id. */
  private readonly cinematics = new Map<string, CinematicEntry>();
  /** Where save files go. `null` when the runtime was built without a store, which the file methods refuse. */
  private readonly storage: SaveStore | null;

  constructor(config: Partial<ThreeRuntimeConfig> = {}, options: ThreeRuntimeOptions = {}) {
    this.config = { ...DEFAULT_THREE_CONFIG, ...config };
    this.backendFactory = options.backend ?? createWebGLBackend;
    this.scheduler = options.scheduler ?? defaultFrameScheduler();
    this.storage = options.storage ?? null;
    this.sceneGraph = this.createEmptySceneGraph();
  }

  private createEmptySceneGraph(): SceneGraph {
    return {
      scenes: new Map(),
      activeSceneId: null,
      clock: new THREE.Clock(),
      stats: { fps: 0, drawCalls: 0, triangles: 0, points: 0, lines: 0 },
    };
  }

  initialize(canvas: HTMLCanvasElement | OffscreenCanvas): void {
    this.canvas = canvas;
    // The renderer is built by the injected backend (M5 v108). Production passes `createWebGLBackend`,
    // which applies the exact same settings this method used to apply inline; a headless caller passes
    // a recording backend and every decision ABOVE this line becomes verifiable without a GPU.
    this.backend = this.backendFactory(canvas, this.config);
    this.emit('initialized', { renderer: this.backend.raw, backend: this.backend });
  }

  resize(width: number, height: number): void {
    if (!this.backend) return;
    this.backend.setSize(width, height, false);
    this.emit('resize', { width, height });
  }

  setPixelRatio(ratio: number): void {
    this.backend?.setPixelRatio(ratio);
  }

  createScene(name: string, id?: string): ThreeScene {
    const sceneIdValue = id ? sceneId(id) : sceneId(`scene-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const threeScene = new THREE.Scene();

    const scene: ThreeScene = {
      id: sceneIdValue,
      name,
      threeScene,
      entities: new Map(),
      cameras: new Map(),
      animations: new Map(),
      lighting: this.createDefaultLighting(),
      metadata: {},
    };

    this.sceneGraph.scenes.set(sceneIdValue, scene);

    if (!this.sceneGraph.activeSceneId) {
      this.sceneGraph.activeSceneId = sceneIdValue;
    }

    this.emit('sceneCreated', { scene });
    return scene;
  }

  private createDefaultLighting(): LightingConfig {
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    const directional = new THREE.DirectionalLight(0xffffff, 1);
    directional.position.set(10, 20, 10);
    directional.castShadow = true;
    directional.shadow.mapSize.width = 2048;
    directional.shadow.mapSize.height = 2048;
    directional.shadow.camera.near = 0.5;
    directional.shadow.camera.far = 50;
    directional.shadow.camera.left = -20;
    directional.shadow.camera.right = 20;
    directional.shadow.camera.top = 20;
    directional.shadow.camera.bottom = -20;

    return {
      ambient: new THREE.Color(0x404040),
      ambientIntensity: 0.5,
      shadows: true,
      shadowMapType: THREE.PCFSoftShadowMap,
      lights: [
        { id: 'ambient', type: 'ambient', threeLight: ambient, enabled: true, castShadow: false },
        { id: 'directional', type: 'directional', threeLight: directional, enabled: true, castShadow: true },
      ],
    };
  }

  getScene(id: SceneId): ThreeScene | undefined {
    return this.sceneGraph.scenes.get(id);
  }

  getActiveScene(): ThreeScene | undefined {
    return this.sceneGraph.activeSceneId ? this.sceneGraph.scenes.get(this.sceneGraph.activeSceneId) : undefined;
  }

  setActiveScene(id: SceneId): boolean {
    const scene = this.sceneGraph.scenes.get(id);
    if (!scene) return false;
    this.sceneGraph.activeSceneId = id;
    this.emit('activeSceneChanged', { sceneId: id });
    return true;
  }

  createEntity(
    sceneId: SceneId,
    name: string,
    type: ThreeEntity['type'],
    geometry?: THREE.BufferGeometry,
    material?: THREE.Material | THREE.Material[],
    position?: THREE.Vector3,
    rotation?: THREE.Euler,
    scale?: THREE.Vector3
  ): ThreeEntity {
    return this.insertEntity(
      sceneId,
      entityId(`entity-${Date.now()}-${Math.random().toString(36).slice(2)}`),
      name,
      type,
      geometry,
      material,
      position,
      rotation,
      scale,
    );
  }

  /**
   * Build one entity and register it under `id`. `createEntity` generates the id; a restore passes the
   * saved one, because `SerializedEntity.id` is only worth storing if a load hands back the SAME address
   * — otherwise everything that referenced the old id (a controller, another entity's `userData`) points
   * at nothing after a load, while the save itself claims it recorded the id.
   */
  private insertEntity(
    sceneId: SceneId,
    id: EntityId,
    name: string,
    type: ThreeEntity['type'],
    geometry?: THREE.BufferGeometry,
    material?: THREE.Material | THREE.Material[],
    position?: THREE.Vector3,
    rotation?: THREE.Euler,
    scale?: THREE.Vector3
  ): ThreeEntity {
    const scene = this.sceneGraph.scenes.get(sceneId);
    if (!scene) throw new Error(`Scene ${sceneId} not found`);

    let threeObject: THREE.Object3D;
    switch (type) {
      case 'mesh':
        threeObject = new THREE.Mesh(geometry || new THREE.BoxGeometry(1, 1, 1), material || new THREE.MeshStandardMaterial());
        break;
      case 'group':
        threeObject = new THREE.Group();
        break;
      case 'sprite':
        threeObject = new THREE.Sprite(material as THREE.SpriteMaterial || new THREE.SpriteMaterial());
        break;
      case 'points':
        threeObject = new THREE.Points(geometry || new THREE.BufferGeometry(), material as THREE.PointsMaterial || new THREE.PointsMaterial());
        break;
      case 'line':
        threeObject = new THREE.Line(geometry || new THREE.BufferGeometry(), material as THREE.LineBasicMaterial || new THREE.LineBasicMaterial());
        break;
      case 'skinnedMesh':
        threeObject = new THREE.SkinnedMesh(geometry || new THREE.BufferGeometry(), material || new THREE.MeshStandardMaterial());
        break;
      default:
        threeObject = new THREE.Object3D();
    }

    if (position) threeObject.position.copy(position);
    if (rotation) threeObject.rotation.copy(rotation);
    if (scale) threeObject.scale.copy(scale);

    threeObject.updateMatrix();
    threeObject.updateMatrixWorld(true);

    const entity: ThreeEntity = {
      id,
      name,
      type,
      threeObject,
      components: new Map(),
      transform: {
        position: threeObject.position,
        rotation: threeObject.rotation,
        scale: threeObject.scale,
        matrix: threeObject.matrix,
        matrixWorld: threeObject.matrixWorld,
      },
      visible: true,
      castShadow: true,
      receiveShadow: true,
      layers: 0,
      userData: {},
    };

    scene.entities.set(id, entity);
    scene.threeScene.add(threeObject);

    this.emit('entityCreated', { sceneId, entity });
    return entity;
  }

  getEntity(sceneId: SceneId, entityId: EntityId): ThreeEntity | undefined {
    return this.sceneGraph.scenes.get(sceneId)?.entities.get(entityId);
  }

  removeEntity(sceneId: SceneId, entityId: EntityId): boolean {
    const scene = this.sceneGraph.scenes.get(sceneId);
    if (!scene) return false;

    const entity = scene.entities.get(entityId);
    if (!entity) return false;

    scene.threeScene.remove(entity.threeObject);
    this.disposeSubtree(entity.threeObject);

    scene.entities.delete(entityId);
    this.emit('entityRemoved', { sceneId, entityId });
    return true;
  }

  /**
   * Dispose every GPU resource under `root`.
   *
   * `THREE.Object3D` does not declare `geometry`/`material` — only the subclasses that own them do
   * (Mesh, Line, Points, Sprite) — so this narrows explicitly instead of reaching through a cast at
   * each call site. Kept as one function because the same traversal was duplicated in `removeEntity`
   * and `dispose()`, which is how one of them eventually stops matching the other.
   */
  private disposeSubtree(root: THREE.Object3D): void {
    root.traverse((obj) => {
      const owner = obj as THREE.Object3D & {
        geometry?: { dispose(): void };
        material?: THREE.Material | THREE.Material[];
      };
      owner.geometry?.dispose();
      const material = owner.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
  }

  addComponent(entity: ThreeEntity, component: EntityComponent): void {
    entity.components.set(component.type, component);
    this.emit('componentAdded', { entityId: entity.id, component });
  }

  removeComponent(entity: ThreeEntity, componentType: string): boolean {
    const removed = entity.components.delete(componentType);
    if (removed) {
      this.emit('componentRemoved', { entityId: entity.id, componentType });
    }
    return removed;
  }

  getComponent(entity: ThreeEntity, componentType: string): EntityComponent | undefined {
    return entity.components.get(componentType);
  }

  /**
   * Copy one entity's state out of the running scene, under the shape `SerializedEntity` declares.
   *
   * The three numbers-bearing fields are written as DATA — `SerializedVector3` / `SerializedEuler` — and not
   * as cloned `THREE` objects, which is what v115 did and what a file cannot hold: measured, JSON keeps a
   * Vector3's numbers and loses its class, and turns an Euler into `_x/_y/_z/_order/isEuler`, so the read
   * side would have had nothing to complain about while the entity came back aimed at NaN. The components
   * are an ARRAY OF ENTRIES for the same reason a `Map` is not: `JSON.stringify` writes a Map as `{}`.
   *
   * The two open bags (`userData`, each component's `data`) are still checked by `plainDataOrRefuse` first,
   * so a value that is a live class instance is refused with its path named instead of being flattened into
   * a plain object.
   */
  snapshotEntity(sceneId: SceneId, entity: EntityId): SerializedEntity {
    const target = this.getEntity(sceneId, entity);
    if (!target) throw new Error(`snapshotEntity: entity ${entity} is not in scene ${sceneId}`);
    const copy = (record: Record<string, unknown>, path: string): Record<string, unknown> => {
      plainDataOrRefuse(record, path);
      return structuredClone(record);
    };
    return {
      id: target.id,
      name: target.name,
      type: target.type,
      position: vectorToData(target.threeObject.position, 'position'),
      rotation: eulerToData(target.threeObject.rotation, 'rotation'),
      scale: vectorToData(target.threeObject.scale, 'scale'),
      visible: target.visible,
      castShadow: target.castShadow,
      receiveShadow: target.receiveShadow,
      layers: target.layers,
      components: [...target.components].map(([key, component]) => [
        key,
        { type: component.type, data: copy(component.data, `components.${key}.data`), enabled: component.enabled },
      ]),
      userData: copy(target.userData, 'userData'),
    };
  }

  /**
   * Put a snapshot back, under the id it was saved with.
   *
   * This is a NEW entity, not an overwrite: restoring onto a live id would replace state the caller has
   * not agreed to lose, so an occupied id throws instead. Because `SerializedEntity` carries no geometry
   * or material, a restored mesh is built the same way `createEntity` builds one with no shape arguments
   * — the default box and standard material — which `saveFeasibilityAudit` names rather than leaves for
   * the caller to discover as a wrong-looking scene.
   */
  restoreEntity(sceneId: SceneId, snapshot: SerializedEntity): ThreeEntity {
    if (!this.sceneGraph.scenes.get(sceneId)) {
      throw new Error(`restoreEntity: scene ${sceneId} does not exist (entity ${snapshot.id})`);
    }
    if (this.getEntity(sceneId, snapshot.id)) {
      throw new Error(`restoreEntity: entity ${snapshot.id} is already in scene ${sceneId}; a restore never overwrites live state`);
    }
    const position = vectorFromData(snapshot.position, 'position');
    const rotation = eulerFromData(snapshot.rotation, 'rotation');
    const scale = vectorFromData(snapshot.scale, 'scale');
    const components = componentsFromData(snapshot.components);
    const entity = this.insertEntity(
      sceneId,
      snapshot.id,
      snapshot.name,
      snapshot.type,
      undefined,
      undefined,
      position,
      rotation,
      scale,
    );
    entity.visible = snapshot.visible;
    entity.castShadow = snapshot.castShadow;
    entity.receiveShadow = snapshot.receiveShadow;
    entity.layers = snapshot.layers;
    entity.threeObject.visible = snapshot.visible;
    entity.threeObject.castShadow = snapshot.castShadow;
    entity.threeObject.receiveShadow = snapshot.receiveShadow;
    entity.threeObject.layers.set(snapshot.layers);
    for (const [key, component] of components) {
      entity.components.set(key, { type: component.type, data: structuredClone(component.data), enabled: component.enabled });
    }
    plainDataOrRefuse(snapshot.userData, 'userData');
    for (const [key, value] of Object.entries(snapshot.userData)) {
      entity.userData[key] = structuredClone(value);
    }
    // No `updateMatrix()` here: the insert path rebuilds it after copying position/rotation/scale, and a
    // second call measured as a mutation is caught by nothing — which is how a redundant line becomes a
    // claimed guarantee that no test can falsify.
    this.emit('entityRestored', { sceneId, entity, entityId: snapshot.id });
    return entity;
  }

  /**
   * Build a save FILE for one scene: every entity of that scene, the cinematic registry, and the two lists
   * that say what the file holds and what it deliberately does not.
   *
   * `entities` is scoped to a scene because a `SerializedEntity` names no scene — `SaveData.sceneGraph` is the
   * field that would, and it is blocked — so a file that gathered every scene's entities could not say where
   * they belonged on the way back. Sequences carry their own `sceneId` (v118), so the whole registry fits.
   *
   * `assertDiskSafe` runs on the way OUT, over the finished file: a producer that cannot name a shape its
   * reader would refuse has no business writing one, and a silent `Map` in this file would be three
   * components quietly becoming none.
   */
  buildSaveFile(sceneId: SceneId, savedAt: number): SaveFile {
    const scene = this.sceneGraph.scenes.get(sceneId);
    if (!scene) {
      throw new Error(`buildSaveFile: scene ${sceneId} does not exist, and a file describing entities in a scene that is not there would be a file about nothing`);
    }
    if (typeof savedAt !== 'number' || !Number.isFinite(savedAt) || savedAt < 0) {
      throw new Error(`buildSaveFile: savedAt is ${String(savedAt)}; this runtime owns a frame clock, not a wall clock, so the caller names the instant and it has to be a finite non-negative number`);
    }
    const entities: [EntityId, SerializedEntity][] = [...scene.entities.keys()]
      .sort()
      .map((id) => [id, this.snapshotEntity(sceneId, id)]);
    const file: SaveFile = {
      format: SAVE_FILE_FORMAT,
      version: SAVE_FILE_VERSION,
      savedAt,
      carries: [...SAVE_DATA_FEASIBILITY.savable],
      doesNotCarry: SAVE_DATA_FEASIBILITY.blocked.map(({ field, needs }) => ({ field, needs })),
      entities,
      cinematic: this.cinematicSnapshot(),
    };
    assertDiskSafe(file, 'file');
    this.emit('saveFileBuilt', {
      sceneId,
      entityCount: entities.length,
      sequenceCount: file.cinematic.sequences.length,
      carries: [...file.carries],
      doesNotCarry: file.doesNotCarry.map((entry) => entry.field),
    });
    return file;
  }

  /**
   * Read a save FILE back. The refusal list is the interesting part, because a loader that quietly ignores
   * what it cannot read is a loader that DELETES it: a file whose `carries` names a field this runtime cannot
   * fill, or that has bolted a blocked field onto its object anyway, is refused with the field named rather
   * than loaded as a smaller game.
   *
   * Atomicity is per half, and the boundary is stated rather than wished away: `restoreCinematic` rolls its
   * own registry back, entity inserts are rolled back here too, and the entity ids are all pre-checked before
   * either half runs so the common collision never reaches the second half. If the entity pass still fails
   * after the sequences landed, this runtime has no way to un-register a sequence (v117's own hole), and the
   * thrown message says so instead of claiming the scene is untouched.
   */
  loadSaveFile(file: SaveFile, sceneId: SceneId): SaveFileLoadReport {
    const problems: string[] = [];
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
      throw new Error(`loadSaveFile: the file is ${Array.isArray(file) ? 'an array' : typeof file}, not a save-file object`);
    }
    if (file.format !== SAVE_FILE_FORMAT) {
      problems.push(`format is ${JSON.stringify(file.format)}, not ${JSON.stringify(SAVE_FILE_FORMAT)}`);
    }
    if (file.version !== SAVE_FILE_VERSION) {
      problems.push(`version is ${String(file.version)} and this runtime reads exactly ${SAVE_FILE_VERSION}; guessing at a future file is how a save comes back wrong and quiet`);
    }
    if (!this.sceneGraph.scenes.get(sceneId)) {
      problems.push(`scene ${sceneId} does not exist — a loader that created one would be inventing the world the file was meant to describe`);
    }
    if (!Array.isArray(file.carries)) {
      problems.push(`carries is ${typeof file.carries}, not an array of field names`);
    } else {
      for (const field of file.carries) {
        if (!SAVE_DATA_FEASIBILITY.savable.includes(field)) {
          problems.push(`the file says it carries "${field}", which this runtime can neither fill nor read; loading past it would drop that field's content without a word`);
        }
      }
    }
    if (!Array.isArray(file.doesNotCarry)) {
      problems.push(`doesNotCarry is ${typeof file.doesNotCarry}, not the list of fields the file leaves out`);
    } else {
      for (const entry of file.doesNotCarry) {
        if (entry && typeof entry.field === 'string' && Array.isArray(file.carries) && file.carries.includes(entry.field)) {
          problems.push(`"${entry.field}" appears both as carried and as not carried`);
        }
      }
    }
    for (const field of SAVE_DATA_FEASIBILITY.blocked.map((entry) => entry.field)) {
      const value = (file as unknown as Record<string, unknown>)[field];
      const empty = value === undefined || value === null
        || (Array.isArray(value) && value.length === 0)
        || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0);
      if (!empty) {
        problems.push(`the file holds content under "${field}", a field this runtime cannot read — refusing is honest, loading it and dropping it is not`);
      }
    }
    if (problems.length > 0) throw new Error(`loadSaveFile refused: ${problems.join('; ')}`);
    assertDiskSafe(file, 'file');

    const pairs = file.entities;
    if (!Array.isArray(pairs)) {
      throw new Error(`loadSaveFile refused: entities is ${typeof pairs}, not an array of [id, entity] pairs`);
    }
    for (const [index, pair] of (pairs as [EntityId, SerializedEntity][]).entries()) {
      const [key, snapshot] = Array.isArray(pair) && pair.length === 2 ? pair : [];
      if (!snapshot || typeof snapshot !== 'object') {
        throw new Error(`loadSaveFile refused: entities[${index}] is ${Array.isArray(pair) ? `an array of ${pair.length}` : typeof pair}, not an [id, entity] pair`);
      }
      if (key !== snapshot.id) {
        throw new Error(`loadSaveFile refused: entities[${index}] is keyed ${String(key)} but the record under it says ${String(snapshot.id)}; restoreEntity files an entity under its own id, so a pair with two names for one entity has to pick one`);
      }
      // The collision is checked against the id the restore will actually use, and BEFORE any restore runs,
      // so a file that would half-load never reaches the half that cannot be undone.
      if (this.getEntity(sceneId, snapshot.id)) {
        throw new Error(`loadSaveFile refused: entity ${snapshot.id} (entities[${index}]) is already in scene ${sceneId}; a restore never overwrites live state, and half a file is not a load`);
      }
    }

    const loadedSequences = this.restoreCinematic(file.cinematic);
    const restored: EntityId[] = [];
    try {
      for (const [, snapshot] of pairs as [EntityId, SerializedEntity][]) {
        this.restoreEntity(sceneId, snapshot);
        restored.push(snapshot.id);
      }
    } catch (error) {
      for (const id of restored) this.removeEntity(sceneId, id);
      // Since v121 the second half is undoable too, so a load that fails partway leaves nothing: stopping
      // first is what makes removal legal (see `removeCinematic`), and the file was the only reason those
      // sequences existed in this runtime.
      for (const id of loadedSequences.restored) {
        this.stopCinematic(id);
        this.removeCinematic(id);
      }
      throw new Error(`${(error as Error).message} — the ${restored.length} entity(ies) and the ${loadedSequences.restored.length} sequence(s) this load had registered were removed again; a load is all or nothing`);
    }
    const report: SaveFileLoadReport = {
      sceneId,
      entities: restored,
      sequences: file.cinematic.sequences.map(([id]) => id),
      carries: [...file.carries],
    };
    this.emit('saveFileLoaded', report);
    return report;
  }

  /**
   * Write the scene's save file THROUGH THE STORE and report the bytes it wrote.
   *
   * The store is injected (`storage`), because this package runs in a browser tab as happily as in Node and a
   * runtime that reached for `node:fs` itself could be neither sandboxed nor tested. A runtime built without
   * one refuses rather than keeping the file to itself: a `writeSaveFile` that quietly returned the bytes
   * without storing them would be the loudest kind of lie this lane has been chasing.
   */
  writeSaveFile(path: string, sceneId: SceneId, savedAt: number, options: { durable?: boolean } = {}): SaveFileWriteReport {
    if (!this.storage) throw new Error(`writeSaveFile: this runtime has no SaveStore — create it with { storage } (an injected fs or createMemorySaveStore), or keep using buildSaveFile for a value you will serialize yourself`);
    const durable = options.durable === true;
    const file = this.buildSaveFile(sceneId, savedAt);
    const contents = JSON.stringify(file);
    // Atomic on purpose: a caller who loses power, or a host whose rename fails, must be left holding the
    // PREVIOUS save rather than a truncated one that `readSaveFile` can only refuse. `durable` adds the flush
    // before the rename, and the store refuses it out loud when the host cannot provide one.
    this.storage.writeAtomic(path, contents, durable);
    const report: SaveFileWriteReport = {
      path,
      store: this.storage.kind,
      bytes: contents.length,
      durable,
      sceneId,
      entities: file.entities.length,
      sequences: file.cinematic.sequences.length,
      carries: [...file.carries],
      doesNotCarry: file.doesNotCarry.map((entry) => entry.field),
    };
    this.emit('saveFileWritten', report);
    return report;
  }

  /**
   * Read bytes back from the store and load them. Three failures are told apart, because the caller's next
   * action differs for each: no file at that path, bytes that are not JSON at all, and a file that parses but
   * describes something this runtime cannot load (every refusal in `loadSaveFile`, from a bad version to
   * content under a blocked name). The third is reported with the path attached, because after a disk trip
   * "which file said this" is the first question.
   */
  readSaveFile(path: string, sceneId: SceneId): SaveFileReadReport {
    if (!this.storage) throw new Error(`readSaveFile: this runtime has no SaveStore — create it with { storage }, or parse the bytes and call loadSaveFile yourself`);
    const contents = this.storage.read(path);
    if (contents === null) {
      throw new Error(`readSaveFile: no save file at "${path}" in the ${this.storage.kind} store; a missing file and an empty one are different problems and this reader will not guess which was meant`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch (error) {
      throw new Error(`readSaveFile: "${path}" is ${(contents.trim().length === 0 ? 'empty' : 'not valid JSON')}; ${(error as Error).message} — a corrupt save is refused, not loaded as an empty game`);
    }
    try {
      const loaded = this.loadSaveFile(parsed as SaveFile, sceneId);
      const report: SaveFileReadReport = { ...loaded, path, store: this.storage.kind, bytes: contents.length };
      this.emit('saveFileRead', report);
      return report;
    } catch (error) {
      // The load refusals are `loadSaveFile`'s own voice — the same door a caller meets when they hold the
      // value already — and the path is what a disk trip adds to the question.
      throw new Error(`readSaveFile: "${path}" holds a file this runtime cannot load: ${(error as Error).message}`);
    }
  }

  /** The store this runtime was given, or `null` when it has none. Reported rather than guessed at: a caller
   *  that asks whether saves persist deserves the same object the runtime writes through. */
  saveStore(): SaveStore | null {
    return this.storage ?? null;
  }

  /**
   * Take a save back. `removed: false` is a real answer, not a failure — the path held nothing — and it is the
   * same shape `removeCinematic` and `stopCinematic` use, so "there was nothing there" reads the same way in
   * every part of this package. What a store cannot do it says out loud: an injected fs with no `unlinkSync`
   * throws rather than reporting a delete that never happened.
   */
  deleteSaveFile(path: string): SaveFileDeleteReport {
    if (!this.storage) throw new Error(`deleteSaveFile: this runtime has no SaveStore — create it with { storage }, or delete the bytes yourself`);
    const removed = this.storage.delete(path);
    const report: SaveFileDeleteReport = { path, store: this.storage.kind, removed };
    this.emit('saveFileDeleted', report);
    return report;
  }

  /**
   * Name every save the store holds, without reading one. The listing is a fact about names: an empty store
   * answers `[]`, and a host that cannot browse throws (v122's rule for a missing capability — an empty list
   * would be a claim about the world this store cannot support).
   */
  listSaveFiles(): { store: string; paths: string[] } {
    if (!this.storage) throw new Error('listSaveFiles: this runtime has no SaveStore — create it with { storage }, or list the directory yourself');
    return { store: this.storage.kind, paths: this.storage.list() };
  }

  /**
   * The newest save the store can actually be asked about — newest meaning the greatest `savedAt` **the file
   * itself carries**. This runtime has no wall clock to compare against and does not invent one, so a file
   * written with a made-up timestamp wins honestly and the caller who wrote it knows why.
   *
   * A file that is listed but cannot be understood does not fail the answer: it is reported in `unreadable`
   * with its reason (not JSON, not an object, a foreign `format`, a `version` this runtime does not read, a
   * `savedAt` that is not a finite number), because a menu that dies on one corrupt save is unusable. Ties are
   * broken by path and counted, so "which one did you pick" has an answer in the result.
   */
  latestSaveFile(): SaveFileLatest | null {
    if (!this.storage) throw new Error('latestSaveFile: this runtime has no SaveStore — create it with { storage }');
    const unreadable: { path: string; why: string }[] = [];
    const readable: { path: string; savedAt: number; version: number }[] = [];
    for (const path of this.storage.list()) {
      const contents = this.storage.read(path);
      if (contents === null) {
        unreadable.push({ path, why: 'listed but nothing was read back — the store changed underneath the listing' });
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(contents);
      } catch (error) {
        unreadable.push({ path, why: `not valid JSON (${(error as Error).message})` });
        continue;
      }
      const header = parsed as Partial<SaveFile> | null;
      if (!header || typeof header !== 'object' || Array.isArray(header)) {
        unreadable.push({ path, why: `JSON, but ${Array.isArray(parsed) ? 'an array' : typeof header} rather than a save object` });
        continue;
      }
      if (header.format !== SAVE_FILE_FORMAT) {
        unreadable.push({ path, why: `format is ${String(header.format)}, not ${SAVE_FILE_FORMAT}` });
        continue;
      }
      if (header.version !== SAVE_FILE_VERSION) {
        unreadable.push({ path, why: `version is ${String(header.version)}, and this runtime reads exactly ${SAVE_FILE_VERSION}` });
        continue;
      }
      if (typeof header.savedAt !== 'number' || !Number.isFinite(header.savedAt)) {
        unreadable.push({ path, why: `savedAt is ${String(header.savedAt)}, which is not a finite number to order by` });
        continue;
      }
      readable.push({ path, savedAt: header.savedAt, version: header.version });
    }
    if (readable.length === 0) return null;
    const newest = readable.reduce((best, candidate) => (
      candidate.savedAt > best.savedAt || (candidate.savedAt === best.savedAt && candidate.path < best.path) ? candidate : best
    ), readable[0]!);
    return {
      path: newest.path,
      savedAt: newest.savedAt,
      version: newest.version,
      ties: readable.filter((entry) => entry.savedAt === newest.savedAt).length,
      unreadable,
    };
  }

  /**
   * Say, for one live entity, what a save would actually carry.
   *
   * `dropped` is derived by comparing the fields the runtime's OWN snapshot builder produces with the
   * fields the caller's entity has, so it cannot go stale quietly: a field added to `ThreeEntity` without
   * a matching line in `snapshotEntity` lands here by name, and `threeObject`/`transform` land here with
   * the specific claim of theirs that no longer holds (`SAVE_ALIAS_CLAIMS`). `blocked` is the other half
   * of the honesty: the declared `SaveData` asks for npcs, quests, a player, a world-state store and a
   * serialized scene graph the runtime does not implement. Since v119 that half is not written into a
   * file at all — `buildSaveFile` emits a `SaveFile` whose `doesNotCarry` names these fields with their
   * reasons, so a save says what it omits instead of arriving as a page of empty maps.
   */
  saveFeasibilityAudit(sceneId: SceneId, entity: EntityId): SaveFeasibilityAudit | undefined {
    const target = this.getEntity(sceneId, entity);
    if (!target) return undefined;
    const carried = new Set(Object.keys(this.snapshotEntity(sceneId, entity)));
    const dropped: string[] = [];
    const aliased: string[] = [];
    for (const field of Object.keys(target)) {
      if (carried.has(field)) continue;
      const claim = SAVE_ALIAS_CLAIMS[field];
      if (!claim) {
        dropped.push(field);
        continue;
      }
      const missing = claim.filter((name) => !carried.has(name));
      if (missing.length === 0) aliased.push(field);
      else dropped.push(`${field} (${missing.join(', ')} not carried)`);
    }
    return {
      dropped: dropped.sort(),
      aliased: aliased.sort(),
      savable: [...SAVE_DATA_FEASIBILITY.savable],
      blocked: SAVE_DATA_FEASIBILITY.blocked.map(({ field, needs }) => ({ field, needs })),
    };
  }

  /**
   * Create a camera, optionally UNDER A NAME. The `id` is what v118 needed to read a saved cinematic at all:
   * a shot addresses a camera by its `CameraId`, `createCamera` used to invent one every call, and
   * `defineCinematic` refuses a shot naming a camera the scene does not have — so a `SerializedCinematic`
   * could only ever be restored inside the process that wrote it. `createScene(name, id?)` has taken a name
   * since v108; this is the same seam one level down.
   */
  createCamera(
    sceneId: SceneId,
    name: string,
    type: 'perspective' | 'orthographic' = 'perspective',
    params: { fov?: number; aspect?: number; near?: number; far?: number; left?: number; right?: number; top?: number; bottom?: number } = {},
    id?: string
  ): ThreeCamera {
    const scene = this.sceneGraph.scenes.get(sceneId);
    if (!scene) throw new Error(`Scene ${sceneId} not found`);

    const cameraIdValue = id ? cameraId(id) : cameraId(`camera-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    let threeCamera: THREE.Camera;
    if (type === 'perspective') {
      threeCamera = new THREE.PerspectiveCamera(
        params.fov ?? 75,
        params.aspect ?? 16 / 9,
        params.near ?? 0.1,
        params.far ?? 1000
      );
    } else {
      threeCamera = new THREE.OrthographicCamera(
        params.left ?? -10,
        params.right ?? 10,
        params.top ?? 10,
        params.bottom ?? -10,
        params.near ?? 0.1,
        params.far ?? 1000
      );
    }

    const camera: ThreeCamera = {
      id: cameraIdValue,
      name,
      type,
      threeCamera,
      active: false,
      viewport: { x: 0, y: 0, width: 1, height: 1 },
    };

    scene.cameras.set(cameraIdValue, camera);

    if (scene.cameras.size === 1) {
      camera.active = true;
    }

    this.emit('cameraCreated', { sceneId, camera });
    return camera;
  }

  setActiveCamera(sceneId: SceneId, cameraId: CameraId): boolean {
    const scene = this.sceneGraph.scenes.get(sceneId);
    if (!scene) return false;

    for (const camera of scene.cameras.values()) {
      camera.active = false;
    }

    const camera = scene.cameras.get(cameraId);
    if (!camera) return false;

    camera.active = true;
    this.emit('activeCameraChanged', { sceneId, cameraId });
    return true;
  }

  createAnimation(
    sceneId: SceneId,
    entity: ThreeEntity,
    clips: THREE.AnimationClip[],
    name: string
  ): ThreeAnimation {
    // An animation with no clips has no action to play, so it is refused here rather than handed back
    // in a state where `play()` silently does nothing (the type says `threeAnimation` is present, and
    // it must be true — M5 v108).
    if (clips.length === 0) {
      throw new Error(`createAnimation("${name}") needs at least one AnimationClip`);
    }
    const mixer = new THREE.AnimationMixer(entity.threeObject);
    const actions = clips.map(clip => mixer.clipAction(clip));
    const primary = actions[0];
    if (!primary) {
      // Unreachable given the guard above, but stated rather than asserted away: the type says
      // `threeAnimation` is present, so this function may not return one that is not.
      throw new Error(`createAnimation("${name}") produced no AnimationAction for ${clips.length} clip(s)`);
    }

    const animationIdValue = animationId(`anim-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    const animation: ThreeAnimation = {
      id: animationIdValue,
      name,
      threeAnimation: primary,
      mixer,
      clips,
      playing: false,
      loop: THREE.LoopRepeat,
      weight: 1,
      timeScale: 1,
    };

    const scene = this.sceneGraph.scenes.get(sceneId);
    if (scene) {
      scene.animations.set(animationIdValue, animation);
    }

    this.emit('animationCreated', { sceneId, animation });
    return animation;
  }

  playAnimation(animationId: AnimationId): void {
    for (const scene of this.sceneGraph.scenes.values()) {
      const animation = scene.animations.get(animationId);
      if (animation) {
        animation.playing = true;
        animation.mixer.setTime(0);
        animation.threeAnimation.play();
        this.emit('animationPlayed', { animationId });
        break;
      }
    }
  }

  stopAnimation(animationId: AnimationId): void {
    for (const scene of this.sceneGraph.scenes.values()) {
      const animation = scene.animations.get(animationId);
      if (animation) {
        animation.playing = false;
        animation.threeAnimation.stop();
        this.emit('animationStopped', { animationId });
        break;
      }
    }
  }

  start(): void {
    if (this.running || !this.backend) return;
    this.running = true;
    this.sceneGraph.clock.start();
    this.animate();
    this.emit('started');
  }

  stop(): void {
    this.running = false;
    if (this.animationFrameId !== null) {
      this.scheduler.cancel(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.sceneGraph.clock.stop();
    this.emit('stopped');
  }

  private animate = (): void => {
    if (!this.running || !this.backend) return;

    this.animationFrameId = this.scheduler.request(this.animate);

    const delta = this.sceneGraph.clock.getDelta();

    this.simulateFrame(delta);

    const activeScene = this.getActiveScene();
    if (activeScene) {
      const activeCamera = Array.from(activeScene.cameras.values()).find(c => c.active);
      if (activeCamera && this.backend) {
        this.backend.render(activeScene.threeScene, activeCamera.threeCamera);
        this.updateStats();
      }
    }

    this.emit('frame', { delta, time: this.sceneGraph.clock.getElapsedTime() });
  };

  private updateAnimations(delta: number): void {
    for (const scene of this.sceneGraph.scenes.values()) {
      for (const animation of scene.animations.values()) {
        if (animation.playing) {
          animation.mixer.update(delta * animation.timeScale);
        }
      }
    }
  }

  /**
   * Advance every simulation subsystem by exactly `delta` seconds, without a clock and without
   * rendering. `animate()` calls THIS, so the frame loop and a test can never run different code —
   * the delta a wall clock supplies is the only thing a test cannot control, and it is out of the path.
   */
  simulateFrame(delta: number): void {
    this.updateAnimations(delta);
    const steps = this.updatePhysics(delta);
    this.updateControllers(steps);
    this.updateCinematics(delta);
  }

  /** Per-scene fixed-timestep backlog, keyed by the scene that declared it. */
  private readonly physicsAccumulators = new Map<SceneId, number>();
  /** What the last frame actually ran, per scene that declares a world: an audit of a DORMANT scene must
   *  not answer with the active scene's numbers. */
  private readonly physicsFrames = new Map<SceneId, { steps: number; droppedTime: number }>();

  /**
   * The physics subsystem: the only place that reads `scene.physics`. It does the two jobs the declared
   * type exists for. First it syncs the world's pull into every controller whose caller named no gravity,
   * so changing a scene's gravity between frames changes the fall — which is the point of declaring it on
   * the world rather than baked into each character. Then it turns the frame's `delta` into the fixed
   * slices the scene asked for, and `updateControllers` integrates exactly those slices, so `timeStep`
   * and `maxSubSteps` are read by the code that moves things rather than by an audit about them.
   *
   * A scene that declares no world keeps the v114 path exactly: one slice of the whole frame.
   */
  private updatePhysics(delta: number): number[] {
    const scene = this.getActiveScene();
    const physics = scene?.physics;
    if (!scene || !physics) return [delta];
    const worldGravity = -physics.gravity.y;
    for (const [entity, entry] of this.controllers) {
      if (entry.gravityDeclared) continue;
      if (!scene.entities.has(entity)) continue;
      entry.controller.gravity = worldGravity;
    }
    const available = (this.physicsAccumulators.get(scene.id) ?? 0) + delta;
    const steps = Math.min(Math.floor(available / physics.timeStep), physics.maxSubSteps);
    const backlog = available - steps * physics.timeStep;
    // The backlog is capped at what ONE frame may simulate, and what the cap refuses is REPORTED rather
    // than kept: an uncapped accumulator loses nothing for a while and then spends a frame simulating ten
    // seconds of world, which is a teleport with a nicer name.
    const budget = physics.maxSubSteps * physics.timeStep;
    const dropped = Math.max(0, backlog - budget);
    this.physicsAccumulators.set(scene.id, backlog - dropped);
    this.physicsFrames.set(scene.id, { steps, droppedTime: dropped });
    return new Array<number>(steps).fill(physics.timeStep);
  }

  private updateControllers(steps: number[]): void {
    if (this.controllers.size === 0) return;
    const scene = this.getActiveScene();
    // Active scene only: a controller in a dormant scene does not move, and the camera-relative types
    // would otherwise borrow a yaw from a camera that is not looking at them.
    if (!scene) return;
    const yaw = this.activeCameraYaw(scene);
    // Orphans are resolved once per frame, before any slice runs: stepping a corpse and then dropping it
    // would emit `controllerOrphaned` after the motion it claims did not happen.
    const live: { target: ThreeEntity; entry: ControllerEntry }[] = [];
    for (const [entity, entry] of this.controllers) {
      const target = scene.entities.get(entity);
      if (!target) {
        // The entity left its scene while its entry stayed: drop it here and announce it, so a caller
        // that lost an entity under a controller knows which one rather than watching it stop moving.
        this.resolveController(entity);
        continue;
      }
      live.push({ target, entry });
    }
    for (const step of steps) {
      for (const { target, entry } of live) this.advanceController(target, entry, yaw, step);
    }
  }

  private activeCameraYaw(scene: ThreeScene): number {
    const camera = Array.from(scene.cameras.values()).find((c) => c.active);
    // Yaw only: a character walks the ground plane, so the camera's pitch is not the character's
    // forward. No camera means no frame to be relative to, and 0 is the world-forward case.
    return camera?.threeCamera.rotation.y ?? 0;
  }

  private advanceController(entity: ThreeEntity, entry: ControllerEntry, cameraYaw: number, delta: number): void {
    const c = entry.controller;
    const plane = MOVEMENT_PLANE[c.type];
    const yaw = plane === 'cameraXZ' ? cameraYaw : 0;
    const f = (c.input.moveForward ? 1 : 0) - (c.input.moveBackward ? 1 : 0);
    const s = (c.input.moveRight ? 1 : 0) - (c.input.moveLeft ? 1 : 0);
    const magnitude = Math.hypot(f, s);
    // Air control scales the WHOLE horizontal intent, not a separate axis — an airborne character keeps
    // steering along the same normalised direction, just slower.
    const speed = (c.input.run ? c.runSpeed : c.speed) * (c.grounded ? 1 : c.airControl);
    // Normalised BEFORE scaling, so a diagonal is not `sqrt(2)` faster than a cardinal direction.
    const nf = magnitude > 0 ? f / magnitude : 0;
    const ns = magnitude > 0 ? s / magnitude : 0;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    c.velocity.x = (-sin * nf + cos * ns) * speed;
    c.velocity.z = plane === 'worldXY' ? 0 : (-cos * nf - sin * ns) * speed;

    if (c.input.jump && c.grounded) {
      // The takeoff frame pays NO gravity: the jump force is what the character leaves the ground with.
      c.velocity.y = c.jumpForce;
      c.grounded = false;
    } else {
      c.velocity.y -= c.gravity * delta;
    }

    const position = entity.threeObject.position;
    position.x += c.velocity.x * delta;
    if (plane !== 'worldXY') position.z += c.velocity.z * delta;
    position.y += c.velocity.y * delta;

    // Landing is a clamp, not an approximation: at or below the ground plane with downward velocity, the
    // character is set exactly on it, vertical velocity zeroed, and grounded restored.
    if (position.y <= entry.groundY && c.velocity.y <= 0) {
      position.y = entry.groundY;
      c.velocity.y = 0;
      c.grounded = true;
    }

    // `custom` keeps its own state: the type exists for callers that run their own state machine, and
    // overwriting what they wrote would make the declared literal `'custom'` unreachable.
    if (c.type !== 'custom') {
      if (!c.grounded) c.state = c.velocity.y > 0 ? 'jump' : 'fall';
      else if (c.input.crouch) c.state = 'crouch';
      else if (magnitude > 0) c.state = c.input.run ? 'run' : 'walk';
      else c.state = 'idle';
    }

    entity.threeObject.updateMatrix();
  }

  /**
   * The cinematic subsystem: advance the one playing sequence and put its camera where the shot says.
   * It was the last comment-shaped hole inside `simulateFrame` (M5 v117 gave `CinematicSequence`,
   * `CinematicShot` and `SerializedCinematic` their first readers).
   *
   * Three decisions are worth naming, because each one is a reading of a declared type rather than a
   * preference: the playhead stops when its scene stops being the active one (a shot's `cameraId` means
   * one scene's camera set, and a dormant scene is not being drawn); the camera switch fires on a CHANGE
   * of shot index, which is the only behavior `'cut'` can have when one camera is rendered per frame; and
   * the path is sampled by ARC length (`getPointAt`), so a shot's `startTime`/`endTime` say when the move
   * happens and the curve's own geometry says how fast the camera covers it.
   */
  private updateCinematics(delta: number): void {
    const entry = this.playingCinematic();
    if (!entry) return;
    const { sequence } = entry;
    if (this.sceneGraph.activeSceneId !== entry.sceneId) {
      // Not an error and not a pause-with-hope: the sequence is over as far as this runtime is concerned,
      // because the only thing that could finish it — its own scene being looked at — has gone away. The
      // playhead keeps its position, so a caller that switches back can `playCinematic` from where it is.
      sequence.playing = false;
      this.emit('cinematicInterrupted', {
        sequenceId: sequence.id,
        time: entry.time,
        reason: `scene ${entry.sceneId} is no longer the active scene, and this sequence's shots address its cameras`,
      });
      return;
    }
    const scene = this.sceneGraph.scenes.get(entry.sceneId)!;
    entry.time = Math.min(entry.time + delta, sequence.duration);

    const index = shotIndexAt(sequence.shots, entry.time);
    const shot = sequence.shots[index]!;
    if (index !== entry.lastShot) {
      entry.lastShot = index;
      sequence.currentShot = index;
      this.setActiveCamera(entry.sceneId, shot.cameraId);
      this.emit('cinematicShotChanged', {
        sequenceId: sequence.id, shotIndex: index, shotId: shot.id, cameraId: shot.cameraId,
      });
    }

    const camera = scene.cameras.get(shot.cameraId)!;
    const span = shot.endTime - shot.startTime;
    const local = Math.min(Math.max((entry.time - shot.startTime) / span, 0), 1);
    if (shot.cameraPath) camera.threeCamera.position.copy(shot.cameraPath.getPointAt(local));
    // `lookAt` reads the position it was just given, so an aiming path has to run after a moving one.
    if (shot.targetPath) camera.threeCamera.lookAt(shot.targetPath.getPointAt(local));
    if (shot.fovAnimation && camera.threeCamera instanceof THREE.PerspectiveCamera) {
      const { start, end, easing } = shot.fovAnimation;
      camera.threeCamera.fov = start + (end - start) * CINEMATIC_EASINGS[easing]!(local);
      camera.threeCamera.updateProjectionMatrix();
    }

    if (entry.time >= sequence.duration) {
      sequence.playing = false;
      this.emit('cinematicFinished', { sequenceId: sequence.id, time: entry.time, duration: sequence.duration });
    }
  }

  // ── declared world physics ────────────────────────────────────────────────────────────────────

  /**
   * Declare the world a scene integrates in, and validate it HERE, because a value this model cannot
   * express has to refuse rather than be read as zero. A controller carries gravity as a positive
   * magnitude applied on -y: a vector pointing up has no scalar reading (the sign would be a guess about
   * what the caller meant), and a vector with horizontal components has no scalar reading at all — this
   * package has no per-body dynamics to apply them to. `timeStep` of 0 would ask the accumulator for an
   * infinite number of slices, and `maxSubSteps` below 1 would ask a frame to run none.
   *
   * The stored gravity is a CLONE, so the caller's vector moving later does not silently change the
   * world mid-game. The object returned IS the scene's own — change the world through another
   * `setScenePhysics`, not by reaching around it.
   */
  setScenePhysics(sceneId: SceneId, physics: PhysicsConfig): PhysicsConfig {
    const scene = this.sceneGraph.scenes.get(sceneId);
    if (!scene) throw new Error(`setScenePhysics: scene ${sceneId} does not exist`);
    const g = physics.gravity;
    if (!(g.y <= 0)) {
      throw new Error(`setScenePhysics: gravity.y is ${g.y}; a controller applies gravity as a positive magnitude on -y and will not guess your sign — name gravity.y <= 0 (a falling world uses a negative y, a zero-G world uses 0), or give each controller its own gravity`);
    }
    if (g.x !== 0 || g.z !== 0) {
      throw new Error(`setScenePhysics: gravity has horizontal components (${g.x}, ${g.z}) that a scalar controller gravity cannot carry; a character on a ground plane has no body for them to push`);
    }
    if (!(physics.timeStep > 0)) {
      throw new Error(`setScenePhysics: timeStep is the fixed slice the integrator runs, so it must be a positive number of seconds; got ${physics.timeStep}`);
    }
    if (!Number.isInteger(physics.maxSubSteps) || physics.maxSubSteps < 1) {
      throw new Error(`setScenePhysics: maxSubSteps bounds how many fixed slices ONE frame may run, so it must be a whole number >= 1; got ${physics.maxSubSteps}`);
    }
    scene.physics = { ...physics, gravity: g.clone() };
    // A new world needs a new backlog AND a new frame record: keeping either would let the next frame
    // report, or spend, time measured against a step size that no longer exists.
    this.physicsAccumulators.delete(scene.id);
    this.physicsFrames.delete(scene.id);
    return scene.physics;
  }

  /** The scene's pull read the only way this model can: `-gravity.y`, or the package default when the
   *  scene declares no world. */
  private worldGravityFor(sceneId: SceneId): number {
    const physics = this.sceneGraph.scenes.get(sceneId)?.physics;
    return physics ? -physics.gravity.y : DEFAULT_CONTROLLER.gravity;
  }

  /**
   * What the declared physics of a scene actually buys. `consulted` and `unhonored` come from the shipped
   * tables, `effectiveGravity` and `stepping` come from the live scene and the last frame, so the answer
   * moves when the world moves — and the suite requires these two lists to cover every field
   * `PhysicsConfig` DECLARES (read out of `src/types.ts`), which is what stops a new declared field from
   * joining the silent ones.
   */
  physicsFieldAudit(sceneId: SceneId): PhysicsFieldAudit | undefined {
    const scene = this.sceneGraph.scenes.get(sceneId);
    if (!scene) return undefined;
    const physics = scene.physics;
    return {
      declared: physics !== undefined,
      consulted: physics ? [...HONORED_PHYSICS_FIELDS].sort() : [],
      unhonored: physics ? UNHONORED_PHYSICS_REASONS.map((r) => ({ ...r })) : [],
      effectiveGravity: this.worldGravityFor(scene.id),
      stepping: {
        timeStep: physics?.timeStep ?? null,
        maxSubSteps: physics?.maxSubSteps ?? null,
        lastFrame: physics ? this.physicsFrames.get(scene.id) ?? null : null,
      },
    };
  }

  // ── controller registry ───────────────────────────────────────────────────────────────────────

  /** Attach a character controller to `entity`. Throws naming the id when the scene or entity is not
   *  there, and refuses a second controller on one entity instead of replacing it silently. */
  attachController(sceneId: SceneId, entity: EntityId, options: ControllerAttachOptions = {}): CharacterController {
    if (!this.sceneGraph.scenes.get(sceneId)) {
      throw new Error(`attachController: scene ${sceneId} does not exist (entity ${entity})`);
    }
    const target = this.getEntity(sceneId, entity);
    if (!target) throw new Error(`attachController: entity ${entity} is not in scene ${sceneId}`);
    if (this.controllers.has(entity)) {
      throw new Error(`attachController: entity ${entity} already has a controller; detachController(${entity}) first`);
    }
    const groundY = options.groundY ?? DEFAULT_CONTROLLER.groundY;
    const controller: CharacterController = {
      entityId: entity,
      type: options.type ?? DEFAULT_CONTROLLER.type,
      speed: options.speed ?? DEFAULT_CONTROLLER.speed,
      runSpeed: options.runSpeed ?? DEFAULT_CONTROLLER.runSpeed,
      jumpForce: options.jumpForce ?? DEFAULT_CONTROLLER.jumpForce,
      gravity: options.gravity ?? this.worldGravityFor(sceneId),
      airControl: options.airControl ?? DEFAULT_CONTROLLER.airControl,
      slopeLimit: options.slopeLimit ?? DEFAULT_CONTROLLER.slopeLimit,
      stepOffset: options.stepOffset ?? DEFAULT_CONTROLLER.stepOffset,
      // `grounded` is READ FROM THE POSITION, not assumed true — a controller attached in mid-air that
      // reported itself grounded would let a caller press jump and never see a fall.
      grounded: target.threeObject.position.y <= groundY,
      velocity: new THREE.Vector3(),
      input: { ...emptyControllerInput(), ...options.input },
      state: 'idle',
    };
    this.controllers.set(entity, { controller, groundY, gravityDeclared: options.gravity !== undefined });
    this.emit('controllerAttached', { entityId: entity, controller });
    return controller;
  }

  detachController(entity: EntityId): boolean {
    const removed = this.controllers.delete(entity);
    if (removed) this.emit('controllerDetached', { entityId: entity });
    return removed;
  }

  /** The live controller for `entity`, or `undefined`. An entry whose entity is gone is dropped here, so
   *  `getController` can never hand back a controller that has nothing to move. */
  getController(entity: EntityId): CharacterController | undefined {
    return this.resolveController(entity)?.controller;
  }

  /** Write input flags between frames. Returns false when there is no controller for `entity`. */
  setControllerInput(entity: EntityId, input: Partial<ControllerInput>): boolean {
    const entry = this.resolveController(entity);
    if (!entry) return false;
    Object.assign(entry.controller.input, input);
    return true;
  }

  /**
   * Report, from the object the caller attached, which declared fields the integrator CONSULTS, which it
   * WRITES, and which it touches in NEITHER direction — plus the same split for the input flags, narrowed
   * by the controller's plane. Nothing here is hand-listed for a particular controller: every list is
   * derived from `Object.keys` of the live object against the shipped field tables, so a field added to
   * the type with no implementation lands in `untouched` automatically.
   */
  controllerFieldAudit(entity: EntityId): ControllerFieldAudit | undefined {
    const entry = this.resolveController(entity);
    if (!entry) return undefined;
    const names = Object.keys(entry.controller);
    const plane = MOVEMENT_PLANE[entry.controller.type];
    const inputRead = plane === 'worldXY'
      ? READ_INPUT_FLAGS.filter((flag) => flag !== 'moveForward' && flag !== 'moveBackward')
      : [...READ_INPUT_FLAGS];
    const consult = (list: readonly string[]) => names.filter((n) => list.includes(n)).sort();
    return {
      consulted: consult(READ_CONTROLLER_FIELDS),
      written: consult(WRITTEN_CONTROLLER_FIELDS),
      untouched: names.filter((n) => !READ_CONTROLLER_FIELDS.includes(n) && !WRITTEN_CONTROLLER_FIELDS.includes(n)).sort(),
      input: {
        consulted: inputRead.slice().sort(),
        untouched: [...new Set([...READ_INPUT_FLAGS, 'custom'])].filter((flag) => !inputRead.includes(flag)).sort(),
      },
    };
  }

  private resolveController(entity: EntityId): ControllerEntry | undefined {
    const entry = this.controllers.get(entity);
    if (!entry) return undefined;
    for (const scene of this.sceneGraph.scenes.values()) {
      if (scene.entities.has(entity)) return entry;
    }
    this.controllers.delete(entity);
    this.emit('controllerOrphaned', { entityId: entity });
    return undefined;
  }

  // ── cinematic sequences ───────────────────────────────────────────────────────────────────────

  /**
   * Register a sequence against `sceneId` and validate it HERE, for the same reason `setScenePhysics`
   * validates a world: a shot whose value this player cannot perform has to refuse at the door rather than
   * be read as something else at play time. So `defineCinematic` refuses a shot that names a camera the
   * scene does not have, a timeline with a gap or an overlap (two shots claiming one instant leave no
   * answer to which camera is showing), a `transition` other than `'cut'` (blending needs two rendered
   * images and this runtime draws one active camera per frame), a non-zero `transitionDuration` (nothing
   * would time it), an `fovAnimation` on an orthographic camera (there is no `fov` to write), a field of
   * view outside (0, 180) (the projection matrix goes degenerate), an easing word it does not implement
   * (reading it as linear would be a guess about what the caller meant), a path with no arc (an arc
   * parameter divided by the arc it does not have), and a path with too few control points to have an arc
   * at all. That last one is v118's correction to this list: asking three.js for `getLength()` on a
   * one-point curve does not return 0, it throws `TypeError: Cannot read properties of undefined (reading
   * 'x')` from inside the library, so up to v117 the door CRASHED on the input it claimed to refuse — and
   * a crash is a message about three.js's internals rather than about the path the caller handed over.
   *
   * `duration` is DERIVED from the shots. A caller may name it, and then it has to agree; a declared
   * duration that disagreed with its own timeline would be two answers to "when does this end", and the
   * save shape has one field for it.
   *
   * The shot ARRAY is copied, so a caller pushing another shot later cannot move a registered timeline.
   * The shot objects are not copied — a path is a live `THREE.CatmullRomCurve3`, and copying a curve means
   * rebuilding it. v118 gave the rebuild a direction and a home: `cinematicSnapshot` reads a live path's
   * points into a `SerializedCurve`, and `restoreCinematic` builds the curve back. That is also why the
   * save door refuses numbers a live shot can be mutated into (`shot.startTime = NaN` after registration is
   * reachable, because these objects are the caller's) instead of writing a save its own reader refuses.
   */
  defineCinematic(sceneId: SceneId, input: CinematicSequenceInput): CinematicSequence {
    const scene = this.sceneGraph.scenes.get(sceneId);
    if (!scene) throw new Error(`defineCinematic: scene ${sceneId} does not exist`);
    if (this.cinematics.has(input.id)) {
      throw new Error(`defineCinematic: a sequence named ${input.id} is already registered; removeCinematic it first, or choose a new id`);
    }
    const shots = [...input.shots];
    if (shots.length === 0) {
      throw new Error(`defineCinematic("${input.id}"): a sequence with no shots has no timeline to play, and \`duration\` would be 0 with nothing on camera`);
    }
    if (shots[0]!.startTime !== 0) {
      throw new Error(`defineCinematic("${input.id}"): the first shot starts at ${shots[0]!.startTime}; a sequence must open at playhead 0 or the frames before it show nothing while the type claims a shot is playing`);
    }
    let cursor = 0;
    for (const shot of shots) {
      if (shot.startTime < cursor) {
        throw new Error(`defineCinematic("${input.id}"): shot ${shot.id} starts at ${shot.startTime}, at or before the previous shot's ${cursor} — two shots claiming one playhead instant have no single answer to which camera is showing`);
      }
      if (!(shot.endTime > shot.startTime)) {
        throw new Error(`defineCinematic("${input.id}"): shot ${shot.id} runs ${shot.startTime} → ${shot.endTime}; progress inside a shot divides by its own length, so it must end after it starts`);
      }
      const camera = scene.cameras.get(shot.cameraId);
      if (!camera) {
        throw new Error(`defineCinematic("${input.id}"): shot ${shot.id} names camera ${shot.cameraId}, which is not in scene ${sceneId}. A sequence is registered against ONE scene because its shot ids address that scene's cameras and nothing else`);
      }
      if (shot.transition !== 'cut') {
        throw new Error(`defineCinematic("${input.id}"): shot ${shot.id} asks for a '${shot.transition}' transition. This player switches the active camera and draws one camera per frame, so a blend has no two images to blend — only 'cut' is available`);
      }
      if (shot.transitionDuration !== 0) {
        throw new Error(`defineCinematic("${input.id}"): shot ${shot.id} declares transitionDuration ${shot.transitionDuration} while the only available transition is an instantaneous cut; a duration that nothing times is refused rather than accepted and ignored`);
      }
      const fov = shot.fovAnimation;
      if (fov) {
        if (!(camera.threeCamera instanceof THREE.PerspectiveCamera)) {
          throw new Error(`defineCinematic("${input.id}"): shot ${shot.id} animates the field of view of camera ${shot.cameraId}, which is ${camera.type}; an orthographic camera has no "fov" to write`);
        }
        for (const [which, value] of [['start', fov.start], ['end', fov.end]] as const) {
          if (!Number.isFinite(value) || value <= 0 || value >= 180) {
            throw new Error(`defineCinematic("${input.id}"): shot ${shot.id} fovAnimation.${which} is ${value}; a PerspectiveCamera fov must be finite and strictly between 0 and 180, or updateProjectionMatrix builds a degenerate matrix`);
          }
        }
        if (!(fov.easing in CINEMATIC_EASINGS)) {
          throw new Error(`defineCinematic("${input.id}"): shot ${shot.id} fovAnimation names easing "${fov.easing}". The easings this package implements are ${Object.keys(CINEMATIC_EASINGS).sort().map((n) => `"${n}"`).join(', ')} — an unknown word would be read as linear, which is a guess about what you meant`);
        }
      }
      for (const [name, path] of [['cameraPath', shot.cameraPath], ['targetPath', shot.targetPath]] as const) {
        if (!path) continue;
        // BEFORE asking for the length: `getLength()` on a curve with fewer than two points does not answer
        // 0, it throws a TypeError from inside three.js, and a door whose refusal is a library crash tells
        // the caller nothing about the path they handed over.
        if (!(path.points.length >= 2)) {
          throw new Error(`defineCinematic("${input.id}"): shot ${shot.id} ${name} has ${path.points.length} control point(s); a path is sampled between points, so one point has no arc to sample`);
        }
        if (!(path.getLength() > 0)) {
          throw new Error(`defineCinematic("${input.id}"): shot ${shot.id} ${name} has no length; the camera is placed by arc position along it, so a path with no arc has no position to return`);
        }
      }
      cursor = shot.endTime;
    }
    const duration = cursor;
    if (input.duration !== undefined && input.duration !== duration) {
      throw new Error(`defineCinematic("${input.id}"): duration is declared ${input.duration} but the shots run to ${duration}. The timeline the shots describe wins — name a matching number, or name none`);
    }

    const sequence: CinematicSequence = { id: input.id, name: input.name, shots, duration, currentShot: 0, playing: false };
    this.cinematics.set(sequence.id, { sequence, sceneId, time: 0, lastShot: -1 });
    this.emit('cinematicDefined', { sequenceId: sequence.id, sceneId, shotCount: shots.length, duration });
    return sequence;
  }

  /** The single playing sequence, DERIVED from `sequence.playing` rather than stored beside it. Two
   *  sources for one fact can disagree, and `SerializedCinematic.activeSequence` is a single id: a runtime
   *  that could not answer "which one" uniquely would have nothing honest to put in that field. */
  private playingCinematic(): CinematicEntry | undefined {
    for (const entry of this.cinematics.values()) {
      if (entry.sequence.playing) return entry;
    }
    return undefined;
  }

  /**
   * Start (or restart) a sequence. Returns false when another one holds the single active slot — see
   * `cinematicFieldAudit`'s `playhead.blockedBy`, which names it — and throws when the request cannot mean
   * anything: an unregistered id, or a sequence whose scene is not the active one.
   *
   * Replaying a finished sequence rewinds its playhead first; stopping one does NOT, because a stop is a
   * caller interrupting a cutscene, not a request to watch it again.
   */
  playCinematic(id: string): boolean {
    const entry = this.cinematics.get(id);
    if (!entry) throw new Error(`playCinematic: no sequence named ${id} is registered`);
    if (this.sceneGraph.activeSceneId !== entry.sceneId) {
      throw new Error(`playCinematic: "${id}" belongs to scene ${entry.sceneId}, which is not the active scene (${this.sceneGraph.activeSceneId ?? 'none'}); its shots address that scene's cameras`);
    }
    if (entry.sequence.playing) return false;
    if (this.playingCinematic()) return false;
    if (entry.time >= entry.sequence.duration) {
      entry.time = 0;
      entry.lastShot = -1;
    }
    entry.sequence.playing = true;
    this.emit('cinematicPlayed', { sequenceId: id, time: entry.time, duration: entry.sequence.duration });
    return true;
  }

  /** Stop a playing sequence where its playhead stands. False when it was not playing. */
  stopCinematic(id: string): boolean {
    const entry = this.cinematics.get(id);
    if (!entry || !entry.sequence.playing) return false;
    entry.sequence.playing = false;
    this.emit('cinematicStopped', { sequenceId: id, time: entry.time, duration: entry.sequence.duration });
    return true;
  }

  /**
   * Un-register a sequence, which v117-v120 did not allow and named twice as a limitation: `defineCinematic`
   * refused a taken id with "this runtime has no way to unregister one", and `loadSaveFile`'s rollback said the
   * sequences it had restored would stay registered. Both sentences are now false and have been rewritten.
   *
   * Two decisions are load-bearing. Removing an id that is not registered answers `false` rather than
   * throwing — that is `stopCinematic`'s shape, and "there was nothing to remove" is a fact, not an error. And
   * removing a PLAYING sequence throws: `playing` belongs to `playCinematic`/`stopCinematic`, and a removal
   * that quietly stopped a cutscene would emit a `cinematicStopped` no caller asked for, leaving a listener to
   * explain a stop that never happened as one.
   */
  removeCinematic(id: string): boolean {
    const entry = this.cinematics.get(id);
    if (!entry) return false;
    if (entry.sequence.playing) {
      throw new Error(`removeCinematic: "${id}" is playing; call stopCinematic first — this method will not emit a cinematicStopped the caller did not ask for`);
    }
    this.cinematics.delete(id);
    this.emit('cinematicRemoved', { sequenceId: id, sceneId: entry.sceneId });
    return true;
  }

  /**
   * Un-register every sequence that is not playing, and say which ones that excludes. The playing ones are
   * reported rather than stopped: a caller clearing the registry has not asked to interrupt a cutscene, and
   * the answer that leaves the decision where it belongs is the honest one.
   */
  clearCinematics(): { removed: string[]; stillPlaying: string[] } {
    const removed: string[] = [];
    const stillPlaying: string[] = [];
    for (const [id, entry] of [...this.cinematics]) {
      if (entry.sequence.playing) {
        stillPlaying.push(id);
        continue;
      }
      this.cinematics.delete(id);
      removed.push(id);
      this.emit('cinematicRemoved', { sequenceId: id, sceneId: entry.sceneId });
    }
    return { removed, stillPlaying };
  }

  /** The declared `SerializedCinematic` shape, built from the registry. Since v118 every value in it is a
   *  VALUE: the map holds `SerializedCinematicSequence` records, and a shot's path is a `SerializedCurve`
   *  whose control points are copies rather than the live curve.
   *
   *  v117 put the live `CinematicSequence` objects in this map, and the difference is not cosmetic. A
   *  snapshot of a live object MOVES when the game does — `test/cinematicSequence.test.ts` pinned that in
   *  v117, and v118 turns it into the opposite claim — and it cannot leave the process: `JSON.stringify`
   *  flattens a `CatmullRomCurve3` into a bag of numbers whose `getPointAt` reads back as `undefined`, so
   *  the save shape would have carried something that restores as a lie. */
  cinematicSnapshot(): SerializedCinematic {
    const sequences: [string, SerializedCinematicSequence][] = [];
    for (const [id, entry] of this.cinematics) {
      sequences.push([id, {
        id: entry.sequence.id,
        name: entry.sequence.name,
        sceneId: entry.sceneId,
        shots: entry.sequence.shots.map((shot) => shotToData(shot, `sequence ${id} shot ${shot.id}`)),
        duration: entry.sequence.duration,
        currentShot: entry.sequence.currentShot,
        playing: entry.sequence.playing,
      }]);
    }
    const playing = this.playingCinematic();
    return {
      sequences,
      activeSequence: playing?.sequence.id ?? null,
      currentTime: playing?.time ?? 0,
    };
  }

  /**
   * The declared save shape's first READER — and being a reader asks questions a shape has never been
   * asked. Four of them are new since v117:
   *
   * * **Which scene?** `SerializedCinematicSequence.sceneId`, declared for this. A shot's `cameraId`
   *   addresses ONE scene's camera set, so a shape that cannot name the scene could not be read at all —
   *   the same class of hole `SerializedEntity.layers` was for v115.
   * * **Does the save agree with itself?** `activeSequence` and the set of sequences claiming `playing` are
   *   two spellings of one fact, and a map key and the record under it are another pair. A save showing
   *   either pair disagreeing is refused with both answers printed, rather than one of them being believed.
   * * **Where does the playhead land?** `currentTime` exists once, for the active sequence. Every other
   *   sequence's position has to come from the field it does carry — `currentShot` — so a stopped one resumes
   *   at the START of the shot it names, the most specific instant the save can prove. `playheads` prints
   *   where each landed instead of hiding the approximation.
   * * **Who owns `currentShot` and `playing`?** The player. Restore calls `playCinematic` to honor a saved
   *   `playing: true` — which keeps the single-slot rule and emits the event a listener expects — and writes
   *   only the playhead, leaving `lastShot` at -1 so the next frame re-derives the index, cuts the camera
   *   and writes `currentShot`. This method touches no camera: a restore that aimed one too would be a
   *   second owner of what `updateCinematics` exists to do.
   *
   * Shape and timeline questions go to the doors that already answer them: `savedSequences` and
   * `shotFromData` refuse the inputs that would CRASH the player, and `defineCinematic` refuses everything it
   * already refuses — including a saved `duration` that disagrees with its own shots, because the save's
   * number is passed through as a caller's claim instead of being believed. One rule, one owner.
   *
   * A failed restore leaves nothing half-landed: every sequence this call registered is removed again before
   * the error reaches the caller. What a rollback cannot undo is the event log — listeners were already told
   * about the sequences that landed before the failure — so the registry and the log can disagree about the
   * past, and the message counts what was removed instead of claiming the log never spoke.
   */
  restoreCinematic(snapshot: SerializedCinematic): CinematicRestoreReport {
    const added: string[] = [];
    try {
      const saved = savedSequences(snapshot);
      const active = snapshot.activeSequence;

      const playingIds = saved.filter((entry) => entry.playing).map((entry) => entry.id);
      if (active === null) {
        if (playingIds.length > 0) {
          throw new Error(`restoreCinematic: activeSequence is null while ${playingIds.length} sequence(s) claim playing (${playingIds.join(', ')}); this shape spells one fact twice and the two have to agree before anything is registered`);
        }
      } else {
        const known = saved.find((entry) => entry.id === active);
        if (!known) {
          throw new Error(`restoreCinematic: activeSequence names "${active}", which the sequences map does not hold (${saved.map((entry) => entry.id).join(', ') || 'it is empty'})`);
        }
        if (!known.playing) {
          throw new Error(`restoreCinematic: activeSequence names "${active}" but that sequence says playing: false, so the save would restore a cutscene that is not running`);
        }
        if (playingIds.length !== 1) {
          throw new Error(`restoreCinematic: activeSequence names "${active}" while ${playingIds.length} sequence(s) claim playing (${playingIds.join(', ')}); this runtime plays one at a time, which is the reason the field holds a single id`);
        }
      }

      if (active !== null) {
        const known = saved.find((entry) => entry.id === active)!;
        if (!Number.isFinite(snapshot.currentTime) || snapshot.currentTime < 0) {
          throw new Error(`restoreCinematic: currentTime is ${String(snapshot.currentTime)}; a playhead is a non-negative number of seconds`);
        }
        // STRICTLY before the end: `updateCinematics` stops a sequence the instant it reaches `duration`, so
        // a save claiming a RUNNING cutscene at its own final instant describes a state this runtime cannot
        // have produced, and `playCinematic` would quietly rewind it to 0 on the way in.
        if (snapshot.currentTime >= known.duration) {
          throw new Error(`restoreCinematic: currentTime ${snapshot.currentTime} is at or past the end of "${active}", whose save says duration ${known.duration}; the player stops a sequence there, so a save calling it playing at that instant is describing something that never happened`);
        }
        if (this.sceneGraph.activeSceneId !== known.sceneId) {
          throw new Error(`restoreCinematic: "${active}" belongs to scene ${known.sceneId}, which is not the active scene (${this.sceneGraph.activeSceneId ?? 'none'}); playCinematic refuses the same request, and a save that resumes a cutscene nobody is looking at is a save that is already interrupted`);
        }
      } else if (snapshot.currentTime !== 0) {
        throw new Error(`restoreCinematic: currentTime is ${String(snapshot.currentTime)} with no active sequence; the field belongs to whichever one is playing, so a number with nothing to own it is a playhead in the dark`);
      }

      for (const entry of saved) {
        this.defineCinematic(entry.sceneId, {
          id: entry.id,
          name: entry.name,
          shots: entry.shots.map((shot, index) => shotFromData(shot, `sequence ${entry.id} shot ${index}`)),
          duration: entry.duration,
        });
        added.push(entry.id);
      }

      // The playhead is placed BEFORE the slot is taken, so the `cinematicPlayed` event a listener sees
      // carries the instant the save resumes at rather than the 0 a fresh `defineCinematic` starts from.
      const playheads = saved.map((entry) => {
        const live = this.cinematics.get(entry.id)!;
        // The active sequence has a saved time; every other one resumes at the start of the shot the save
        // names, because the shape carries one playhead and it is not this sequence's.
        live.time = entry.id === active ? snapshot.currentTime : entry.shots[entry.currentShot]!.startTime;
        // -1 so the next frame re-derives the index, cuts, and writes `currentShot` itself.
        live.lastShot = -1;
        return { id: entry.id, time: live.time, currentShot: live.sequence.currentShot };
      });

      // The save's `playing` is honored by the door that owns it: `playCinematic` keeps the single-slot rule,
      // emits `cinematicPlayed`, and is the method that moves `playing` — restore never writes that field.
      // A `false` here means the slot was already taken by a sequence this call did not restore, and the save
      // cannot be honored beside it; rolling back is the honest answer, not a silent `playing: false`.
      if (active !== null && !this.playCinematic(active)) {
        throw new Error(`restoreCinematic: "${active}" cannot take the active slot because this runtime is already playing ${this.playingCinematic()?.sequence.id ?? 'something'}; the shape has one field for that answer and it is full`);
      }

      return { restored: saved.map((entry) => entry.id), activeSequence: active, playheads };
    } catch (error) {
      for (const id of added) this.cinematics.delete(id);
      const rolled = added.length
        ? `the ${added.length} sequence(s) it had already registered (${added.join(', ')}) were removed again, although their cinematicDefined events had already been emitted`
        : 'nothing had been registered';
      throw new Error(`${error instanceof Error ? error.message : String(error)} — the restore rolled back: ${rolled}`);
    }
  }

  /** What declaring a sequence actually buys, in the same shape as `physicsFieldAudit`. */
  cinematicFieldAudit(id: string): CinematicFieldAudit | undefined {
    const entry = this.cinematics.get(id);
    if (!entry) return undefined;
    const { sequence } = entry;
    const names = Object.keys(sequence);
    const showing = entry.lastShot < 0 ? undefined : sequence.shots[entry.lastShot];
    const other = this.playingCinematic();
    return {
      consulted: [...HONORED_SHOT_FIELDS].sort(),
      unhonored: UNHONORED_SHOT_REASONS.map((r) => ({ ...r })),
      sequenceRead: names.filter((n) => READ_SEQUENCE_FIELDS.includes(n)).sort(),
      sequenceWritten: names.filter((n) => WRITTEN_SEQUENCE_FIELDS.includes(n)).sort(),
      playhead: {
        playing: sequence.playing,
        time: entry.time,
        duration: sequence.duration,
        // `currentShot` is the declared field, which has no way to say "nothing yet" and so sits at 0
        // before the first frame; `shotId` is the audit's answer to what the camera is actually showing.
        currentShot: sequence.currentShot,
        shotId: showing?.id ?? null,
        cameraId: showing?.cameraId ?? null,
        blockedBy: other && other !== entry ? other.sequence.id : null,
      },
    };
  }

  private updateStats(): void {
    if (!this.backend || !this.sceneGraph.stats) return;
    const info = this.backend.stats;
    this.sceneGraph.stats.drawCalls = info.calls;
    this.sceneGraph.stats.triangles = info.triangles;
    this.sceneGraph.stats.points = info.points;
    this.sceneGraph.stats.lines = info.lines;
  }

  addEventListener(event: string, listener: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  removeEventListener(event: string, listener: Function): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) listeners.splice(index, 1);
    }
  }

  private emit(event: string, data?: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      }
    }
  }

  /** The wrapped WebGL renderer, or null under a backend that owns none (e.g. headless). */
  getRenderer(): THREE.WebGLRenderer | null {
    return this.backend?.raw ?? null;
  }

  /** The backend in force — `null` before `initialize()`. Callers that must know which
   *  implementation is drawing (rather than assuming WebGL) should read `getBackend()?.kind`. */
  getBackend(): RenderBackend | null {
    return this.backend;
  }

  getSceneGraph(): SceneGraph {
    return this.sceneGraph;
  }

  dispose(): void {
    this.stop();

    for (const scene of this.sceneGraph.scenes.values()) {
      for (const entity of scene.entities.values()) {
        this.disposeSubtree(entity.threeObject);
      }
      scene.threeScene.clear();
    }

    this.sceneGraph.scenes.clear();
    // Controllers live in a registry keyed by entity id, not in a scene's entity map, so clearing the
    // scenes would otherwise strand them. Clearing here (rather than orphan-walking) is deliberate: the
    // entities are already gone, and a dispose is not a caller losing one entity under a live controller.
    this.controllers.clear();
    // Same reason as the controllers: a sequence is registered by id against a scene that no longer
    // exists, so keeping it would let `playCinematic` answer for cameras that are gone.
    this.cinematics.clear();

    if (this.backend) {
      this.backend.dispose();
      this.backend = null;
    }

    this.canvas = null;
    this.emit('disposed');
  }
}

/** Construction options. `backend` and `scheduler` are the host seams (M5 v108); omit both for a
 *  browser (WebGL + `requestAnimationFrame`). */
export interface ThreeRuntimeOptions {
  backend?: RenderBackendFactory;
  scheduler?: FrameScheduler;
  /** Where `writeSaveFile`/`readSaveFile` put bytes. Omitted means saves stay in memory: the file methods
   *  refuse rather than pretend. */
  storage?: SaveStore;
}

export function createThreeRuntime(
  config: Partial<ThreeRuntimeConfig> = {},
  options: ThreeRuntimeOptions = {},
): ThreeRuntime {
  return new ThreeRuntime(config, options);
}