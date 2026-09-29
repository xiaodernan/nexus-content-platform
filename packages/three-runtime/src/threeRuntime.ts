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
  NPC,
  Player,
  PlayerDamageReport,
  PlayerExperienceReport,
  PlayerHealReport,
  PlayerLevelReport,
  PlayerManaSpendReport,
  CombatEntity,
  CombatStrikeReport,
  CombatHealReport,
  PersonalityTraits,
  SerializedNPC,
  SerializedPlayer,
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
import { SAVE_TEMP_SUFFIX, type SaveStore } from './saveStore.js';

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

/** What a caller can name when attaching an NPC record. Everything left out comes from `DEFAULT_NPC` or
 *  from the entity itself — `homeLocation` defaults to where the entity stands, which is a reading of the
 *  world rather than a constant pretending to be one. */
export interface NpcAttachOptions {
  name?: string;
  archetype?: string;
  personality?: Partial<PersonalityTraits>;
  homeLocation?: THREE.Vector3;
  wanderRadius?: number;
  faction?: string;
  /** Initial standing per faction, as a plain bag so the caller does not have to build a `Map` to reach
   *  a method whose live record holds one. */
  reputation?: Record<string, number>;
}

/** The declared words an NPC record starts from when a caller names none. */
export const DEFAULT_NPC = {
  archetype: 'villager',
  personality: { aggression: 0.2, curiosity: 0.5, sociability: 0.5, bravery: 0.5, intelligence: 0.5, loyalty: 0.5 },
  wanderRadius: 5,
  faction: 'neutral',
};

/** What a caller can name when attaching the player record. `skills` is a plain bag for the reason
 *  `NpcAttachOptions.reputation` gives: the live record holds a `Map`, and making a caller build one to reach
 *  the method would be a second spelling of the same fact. `position` and `rotation` default to where the body
 *  ALREADY is, which is a reading of the world rather than a constant pretending to be one. */
export interface PlayerAttachOptions {
  position?: THREE.Vector3;
  rotation?: THREE.Euler;
  health?: number;
  maxHealth?: number;
  mana?: number;
  maxMana?: number;
  experience?: number;
  level?: number;
  skills?: Record<string, number>;
  hotbar?: (EntityId | null)[];
}

/** The declared words the player record starts from when a caller names none. These are the numbers a DEMO MODE
 *  world begins a playthrough at; `inventory` and `skills` start EMPTY, because a record that claimed six items
 *  from a constant would be the kind of save this lane has spent eleven grants refusing. */
export const DEFAULT_PLAYER = {
  health: 100,
  maxHealth: 100,
  mana: 50,
  maxMana: 50,
  experience: 0,
  level: 1,
};

/** What a caller may declare about one body's combat record. NOTHING here is a mechanic: `attackRange`,
 *  `attackType` and `faction` are carried as declared words, and `combatFieldAudit` says per field whether
 *  any code path here reads it. `attackSpeed` is deliberately absent — it is not an option because no caller
 *  decision could reach a reader. */
export interface CombatAttachOptions {
  health?: number;
  maxHealth?: number;
  armor?: number;
  attackPower?: number;
  attackRange?: number;
  attackType?: CombatEntity['attackType'];
  faction?: string;
}

/** The declared words a combat record starts from when a caller names none. `health` is deliberately small:
 *  a default that took a long fight to remove would hide the arithmetic this grant exists to make visible,
 *  and `armor` starts at zero because a body that shrugged off blows by default would make the floor in
 *  `strike` the first thing a caller met. */
export const DEFAULT_COMBATANT = {
  health: 30,
  maxHealth: 30,
  armor: 0,
  attackPower: 5,
  attackRange: 2,
  attackType: 'melee' as const,
  faction: 'neutral',
  /** Carried because `CombatEntity` declares it and read by nothing — the reason is in
   *  `UNHONORED_COMBAT_REASONS`, and the suite requires that table to name every declared field this
   *  runtime does not consult. */
  attackSpeed: 1,
};

/**
 * WHICH account of a refused field is speaking.
 *
 * Three separate lists in this package say what it refuses to keep — `npcFieldAudit`'s untouched records,
 * `worldStateFieldAudit`'s refused bag keys, and `saveFeasibilityAudit`'s blocked save-file halves — and they
 * were written as three literals. That is how an account goes stale beside its neighbours: `quests` was named
 * by all three with THREE different sentences, `player` and `inventory` by two each, and nothing said whether
 * those differences were declared or accidental. Worse, a flat "refused" list cannot describe `entities` at
 * all: it is a savable file half (`snapshotEntity`/`restoreEntity`) AND a world-state key this runtime refuses,
 * because mirroring the scene's bodies into the bag would give one list two owners.
 *
 * So each row declares which PLANES refuse it and what it says in each of them. The accounts the callers
 * read are DERIVED from this table, which is what makes the table unable to sit still while one of the accounts
 * drifts. v136 added the fourth plane (`player-record`, the live player's own gaps) by lengthening this
 * declaration and nothing else — which is the shape the table was built for: an account that ships has to be
 * answerable, and every case that enumerates the plane set feels it in the same commit.
 */
export type RefusalPlane = 'npc-record' | 'world-state' | 'save-file' | 'player-record';

/** The plane set `refusalCensus` partitions over — read off this declaration rather than retyped by a caller
 *  that would otherwise have to remember how many accounts exist. */
const REFUSAL_PLANES: readonly RefusalPlane[] = ['npc-record', 'world-state', 'save-file', 'player-record'];

/** One name this package refuses to keep, and the PLANES that say so. `needs` is keyed by plane, and a plane
 *  listed in `planes` with no entry there is a refusal with no reason — `refusalsFor` throws on that rather
 *  than printing a blank. */
export interface RefusalRow {
  field: string;
  planes: readonly RefusalPlane[];
  needs: Partial<Record<RefusalPlane, string>>;
}

const REFUSALS: readonly RefusalRow[] = [
  {
    field: 'schedule',
    planes: ['npc-record'],
    needs: { 'npc-record': 'the NPC task scheduler (`NPCTaskScheduler`) is declared in types.ts and implemented by nothing, so a record carries no queue this runtime could run' },
  },
  {
    field: 'currentTask',
    planes: ['npc-record'],
    needs: { 'npc-record': 'nothing advances a task, so a record has no current one to report — the field would hold a constant wearing a name' },
  },
  {
    field: 'inventory',
    planes: ['npc-record', 'world-state', 'player-record'],
    needs: {
      'npc-record': '`InventoryItem` holds `attributes` and `requirements` as Maps and nothing here implements an inventory; a record carrying one would put a Map in a file that JSON writes as {}',
      'world-state': '`InventoryItem` holds `attributes` and `requirements` as Maps and nothing here implements an inventory',
      'player-record': 'the live player holds `InventoryItem[]`, whose items each carry two `Map`s, and no inventory system exists here to fill or read one — so the bag would be a file half with no owner on either side',
    },
  },
  {
    field: 'dialogueTree',
    planes: ['npc-record'],
    needs: { 'npc-record': '`DialogueSystem` is declared in types.ts and implemented by nothing' },
  },
  {
    field: 'quests',
    planes: ['npc-record', 'world-state', 'save-file'],
    needs: {
      'npc-record': '`QuestSystem` is declared in types.ts and implemented by nothing',
      'world-state': '`QuestSystem` is declared in types.ts and implemented by nothing, so there are no quest states to keep',
      'save-file': 'QuestSystem is declared in types.ts and implemented by nothing',
    },
  },
  {
    field: 'player',
    planes: ['world-state'],
    needs: {
      'world-state': 'the runtime owns exactly one player record per scene through `attachPlayer`/`restorePlayer`, so a bag key of the same name would be a second owner of one player, and the two would drift',
    },
  },
  {
    field: 'sceneGraph',
    planes: ['save-file'],
    needs: { 'save-file': 'SerializedScene stores a LightingConfig whose lights hold live THREE.Light objects and a PhysicsConfig whose gravity is a live THREE.Vector3; nothing here rebuilds either' },
  },
  {
    field: 'entities',
    planes: ['world-state'],
    needs: { 'world-state': 'the bodies a scene holds are the scene graph itself; mirroring them into world state would be a second owner of the same list, and the two would drift' },
  },
];

/** The rows that speak for one plane, each with the sentence that plane says. `table` is a parameter because
 *  the check below has to be answerable without breaking the module: production calls this with `REFUSALS`,
 *  and a caller who wants to know what a mis-declared row does can hand over the row. A row that names a plane
 *  and withholds its reason is refused BY NAME — an account that says "refused" without a `needs` is the same
 *  silent face this package keeps refusing in its own ledgers.
 *
 *  The result is sorted by field name, and that is load-bearing rather than tidy. The three accounts were
 *  written out by hand in three different orders, and ONE table cannot honour three: the NPC account listed
 *  `inventory` before `quests` while the world account listed it after, so whatever order the rows sit in, one
 *  caller's list comes out rearranged. Alphabetical is the only order that does not depend on where a future
 *  row happens to be typed. Nothing reconciles these lists positionally — the save-file reader compares `carries`
 *  by name (`diagnoseSaveFile` uses `.includes`), and `doesNotCarry` is read as a set of names — so a file written
 *  before this rearrangement still loads. */
export function refusalsFor(plane: RefusalPlane, table: readonly RefusalRow[] = REFUSALS): { field: string; needs: string }[] {
  const rows = table.filter((row) => row.planes.includes(plane)).sort((a, b) => a.field.localeCompare(b.field));
  for (const row of rows) {
    if (typeof row.needs[plane] !== 'string' || row.needs[plane] === '') {
      throw new Error(`refusalsFor(${plane}): ${row.field} is declared refused by this plane with no reason; a refusal a caller cannot read is a refusal that will be worked around`);
    }
  }
  return rows.map((row) => ({ field: row.field, needs: row.needs[plane] as string }));
}

/** One field's refusal partition: which accounts refuse it, which do not, and the sentence each refusing
 *  account says. `notRefusedBy` is not an assertion that the account HOLDS the field — it says only that the
 *  account has no row, which is exactly the distinction a flat list cannot make. `entities` is the witness:
 *  refused by `world-state`, not refused by `save-file`, and carried there for real. */
export interface RefusalCensusRow {
  field: string;
  refusedBy: RefusalPlane[];
  notRefusedBy: RefusalPlane[];
  needs: Partial<Record<RefusalPlane, string>>;
}

export interface RefusalCensus {
  planes: RefusalPlane[];
  rows: RefusalCensusRow[];
}

/** The declared `NPC` fields this package cannot fill, and what each is waiting on. `npcFieldAudit` derives
 *  its `untouched` list from the LIVE record against the shipped file shape and then names each leftover
 *  field from THIS table — so a field added to `NPC` with no implementation lands in the audit as
 *  "unnamed by the gap table" instead of being ignored in silence, and a gap that gets implemented has to
 *  be removed from here to stop being reported. */
const UNTOUCHED_NPC_FIELDS: readonly { field: string; needs: string }[] = refusalsFor('npc-record');

/** What `npcFieldAudit` answers. `carried` is read off the SNAPSHOT — the file shape is the single owner of
 *  what a save holds — and `untouched` names every declared field the snapshot does not hold, with the
 *  reason. A field the gap table has not named is reported as such rather than dropped from the list. */
export interface NpcFieldAudit {
  carried: string[];
  untouched: { field: string; needs: string }[];
}

/** A world-state key this package will not hold. `worldStateFieldAudit` names the rest of the bag by name
 *  instead of letting a caller believe the runtime keeps a world; `entities` is the one this runtime could
 *  honestly keep as a list of the bodies a scene holds, and the rest of this plane's rows are state this
 *  package has no system to produce or consume. */
const UNTOUCHED_WORLD_STATE_FIELDS: readonly { field: string; needs: string }[] = refusalsFor('world-state');

/** What `worldStateFieldAudit` answers. `carried` is every key the scene actually holds (so a caller can
 *  see what a file would write), and `untouched` names the well-known keys this package REFUSES to keep,
 *  each with what it waits on — so a caller cannot assume the runtime is keeping a quest log or an inventory
 *  for them. A name that stops being refused has to leave that table to stop being reported; `player` stayed,
 *  and its sentence changed under v136, because the runtime now keeps a player in a place the bag must not. */
export interface WorldStateFieldAudit {
  carried: string[];
  untouched: { field: string; needs: string }[];
}

/** The declared `Player` fields this package cannot fill. v136 ships one row: `inventory`, whose items each
 *  hold two `Map`s with no inventory system on either side of them. */
const UNTOUCHED_PLAYER_FIELDS: readonly { field: string; needs: string }[] = refusalsFor('player-record');

/** What `playerFieldAudit` answers, in the same two halves as the NPC audit: `carried` is the field list of
 *  the FILE shape, read off the snapshot this scene's player produces, and `untouched` names every declared
 *  live field the snapshot does not hold, in the table's own words. */
export interface PlayerFieldAudit {
  carried: string[];
  untouched: { field: string; needs: string }[];
}

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

/** An NPC record attached to an entity. The entry names the scene the record was attached in because an
 *  `NPC` has no scene field of its own (the declared type asks for `entityId`, and `SaveData.sceneGraph` is
 *  the blocked field that would carry the mapping) — so the registry is the one place that knows where a
 *  record belongs, and a file scoped to one scene can be built from it. */
interface NpcEntry {
  npc: NPC;
  sceneId: SceneId;
}

/** What `physicsFieldAudit` answers for a scene. `consulted`/`unhonored` are read off the shipped tables
 *  against the fields `PhysicsConfig` declares, and `effectiveGravity`/`stepping` are read off the live
 *  scene and the last frame, so the answer cannot be a constant wearing a name. */

/** One body's combat record and the scene it was attached in. The scene rides on the ENTRY rather than
 *  inside `CombatEntity`, whose declared shape has no scene field — the same split `NpcEntry` uses, and for
 *  the same reason: the record is the declared type, and the registry owns what the type does not. */
interface CombatantEntry {
  combatant: CombatEntity;
  sceneId: SceneId;
}

/** The `CombatEntity` fields a code path in this runtime reads or writes. The other half is
 *  `UNHONORED_COMBAT_REASONS`, and the suite requires the two lists to partition the declared type by
 *  reading `src/types.ts` — so a field added to `CombatEntity` tomorrow lands in one of them instead of
 *  joining the silent ones. */
const CONSULTED_COMBAT_FIELDS: readonly string[] = ['aiState', 'armor', 'attackPower', 'entityId', 'health', 'maxHealth'];

/** The declared `CombatEntity` fields this runtime does not consult, each with what it is waiting on. */
const UNHONORED_COMBAT_REASONS: readonly { field: string; reason: string }[] = [
  { field: 'attackRange', reason: 'nothing here measures the distance between two bodies: a strike NAMES its target, so a range has no reader' },
  { field: 'attackSpeed', reason: 'nothing schedules a second blow — a strike happens when a caller makes one, so a speed has no interval to divide' },
  { field: 'attackType', reason: 'the door refuses a word outside the four declared ones, but no rule here differs between a melee and a ranged blow' },
  { field: 'cooldowns', reason: 'a cooldown is a clock, and the frame loop is the only clock this package has; nothing consults it before or after a strike' },
  { field: 'faction', reason: 'stored at the door and consulted by nothing — no rule here reads a faction, so two bodies stand in the same relation to each other whatever they are named' },
  { field: 'statusEffects', reason: '`StatusEffect` holds `onApply`/`onRemove`/`onTick` FUNCTIONS, so a record carrying one would be a record no file can hold and no tick here would run' },
  { field: 'target', reason: 'a strike names a target for the length of the call and keeps none — nothing in this package chooses a target or remembers one' },
];

/** What `combatFieldAudit` answers, in the shape `PhysicsFieldAudit` uses: `consulted` are the declared
 *  fields a code path here reads or writes, and `unhonored` names the rest with the reason each has no
 *  reader. `declared` is false when the body holds no record at all, which is not the same answer as a
 *  record whose fields are all unconsulted. */
export interface CombatantFieldAudit {
  declared: boolean;
  consulted: string[];
  unhonored: { field: string; reason: string }[];
}

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
  /** The ids whose NPC records this load restored, in the order the file listed them. Empty is the ordinary
   *  answer for a scene with no NPCs, which is not the same claim as "this file carries no npcs". */
  npcs: EntityId[];
  sequences: string[];
  /** The world-state keys this load restored, sorted. Empty is the ordinary answer for a scene whose world
   *  state was saved empty, which is not the same claim as "this file carries no worldState" — the two are
   *  told apart by `carries`, which is what the file itself said. */
  worldState: string[];
  /** The body this load made the scene's player, or `null` when the file carried none. `null` is the file's own
   *  claim read back — it is not the same statement as a pre-v136 file having no player half at all, which is
   *  what `carries` tells apart. */
  player: EntityId | null;
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
  /** How many NPC records the file carries. Zero is the ordinary answer for a scene with no NPCs and is not
   *  the same claim as the file omitting the field — `npcs` is always written, even when it is empty. */
  npcs: number;
  sequences: number;
  /** How many world-state keys the file carries. Zero is the ordinary answer for a scene with no world
   *  state and is not the same claim as the file omitting the field — `worldState` is always written. */
  worldState: number;
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

/** What `diagnoseSaveFile` answers. `loadable` is the verdict `loadSaveFile` would reach about the same
 *  claims — not a guess about it — and `problems` keeps the reasons in both directions: a field the file
 *  carries that cannot be read here, and a field this runtime could write that the file predates. */
export interface SaveFileDiagnosis {
  path: string;
  bytes: number;
  loadable: boolean;
  problems: string[];
  carriedButUnreadableHere: string[];
  readableNowButNotCarried: string[];
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
 *  does not exist yet. The blocked half is the honest part: `quests` names a `QuestSystem` declared in
 *  `types.ts` and implemented by nothing, and `sceneGraph` names a shape built out of live objects — a different
 *  kind of gap from a missing system: the shape exists and is unusable as a file. `savable` means BOTH directions
 *  survive a FILE since v119: `entities` has `snapshotEntity`/`restoreEntity`, `cinematic` has
 *  `cinematicSnapshot`/`restoreCinematic`, `npcs` has `npcSnapshot`/`restoreNPC`, `worldState` has
 *  `worldStateSnapshot`/`restoreWorldState`, and `player` has `playerSnapshot`/`restorePlayer` (v136, which is
 *  the row this table carried as blocked for eleven grants); `buildSaveFile` runs `assertDiskSafe` over the
 *  finished file so no half can write a `Map` or a live object the reader could not get back. The pair is not
 *  decoration — `saveSnapshot.test.ts` derives each field's stem from its own name and requires a surface name
 *  to implement a `savable` row and NONE to implement a `blocked` one, which is what makes this table unable to
 *  sit still while an implementation ships beside it.
 *
 *  `blocked` is v135's derivation, not a fourth copy: the save file is one of the PLANES that refuse names,
 *  and the same rows previously sat here as literals beside the NPC record's and the world bag's, each free to
 *  drift. Read as a flat list that drift is invisible; read per plane (`refusalCensus`) it is the whole
 *  story — `quests` is refused by every account, `sceneGraph` by the save file alone, and `entities` and `player`
 *  by the world bag alone while this very table lists both as `savable`. */
const SAVE_DATA_FEASIBILITY: { savable: readonly string[]; blocked: readonly { field: string; needs: string }[] } = {
  savable: ['entities', 'cinematic', 'npcs', 'worldState', 'player'],
  // The save-file slice of `REFUSALS`, so a blocked half of a file is reported with the same sentence the file
  // itself writes into `doesNotCarry` and the census answers — one owner for three readers.
  blocked: refusalsFor('save-file'),
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
function vectorToData(vector: THREE.Vector3, where: string, who = 'snapshotEntity'): SerializedVector3 {
  const data = { x: vector.x, y: vector.y, z: vector.z };
  for (const axis of CURVE_AXES) {
    if (!Number.isFinite(data[axis])) {
      throw new Error(`${who}: ${where} ${axis} is ${data[axis]}; a file stores finite numbers, and JSON writes this one as null`);
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
function vectorFromData(data: SerializedVector3, where: string, who = 'restoreEntity'): THREE.Vector3 {
  const value = data as unknown as Record<string, unknown> | null;  for (const axis of CURVE_AXES) {
    const component = value?.[axis];
    if (typeof component !== 'number' || !Number.isFinite(component)) {
      throw new Error(`${who}: ${where} ${axis} is ${String(component)}; a saved position is three finite numbers, and a flattened THREE.Vector3 that lost its class still reads as {x,y,z} while an Euler flattened the same way arrives as _x/_y/_z and would restore as NaN`);
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
/** Walk a value and refuse anything a save file cannot hold, naming the path and the owner the caller answers
 *  to. `seen` is a PATH stack rather than a set of everything visited: a value that contains itself has no
 *  file spelling and is refused by name, while the same object reached twice through two different branches
 *  is not a cycle — `JSON` has no identity to share, so it is written twice and this walk must not confuse
 *  the two (which is also what keeps a cyclic value from hanging the walk the way it would a plain
 *  recursion). */
function assertDiskSafe(value: unknown, path: string, who = 'saveFile', seen: Set<object> = new Set()): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${who}: ${path} holds ${value}, which JSON writes as null`);
    return;
  }
  if (typeof value !== 'object') {
    if (typeof value !== 'string' && typeof value !== 'boolean') {
      throw new Error(`${who}: ${path} holds ${typeof value}, which a file cannot hold at all`);
    }
    return;
  }
  if (value instanceof Map || value instanceof Set) {
    throw new Error(`${who}: ${path} holds a ${value instanceof Map ? 'Map' : 'Set'}, which JSON.stringify writes as {} — a save shape spells its collections as arrays of entries so the contents survive the trip`);
  }
  const proto = Object.getPrototypeOf(value as object);
  if (proto !== Object.prototype && proto !== null && !Array.isArray(value)) {
    const name = (value as { constructor?: { name?: string } }).constructor?.name ?? 'unnamed class';
    throw new Error(`${who}: ${path} holds a ${name} instance, not plain data — a file stores values, not live objects`);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error(`${who}: ${path} contains itself — a value that appears inside its own tree is one JSON.stringify refuses to write, so a file could never hold it`);
    seen.add(value);
    value.forEach((item, index) => assertDiskSafe(item, `${path}[${index}]`, who, seen));
    seen.delete(value);
    return;
  }
  if (seen.has(value)) throw new Error(`${who}: ${path} contains itself — a value that appears inside its own tree is one JSON.stringify refuses to write, so a file could never hold it`);
  seen.add(value);
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    assertDiskSafe(nested, `${path}.${key}`, who, seen);
  }
  seen.delete(value);
}

/** A world-state value, as the DATA a file holds: checked and deep-copied, and the check is not a second
 *  implementation of anything. `assertDiskSafe` owns "what a file can hold" for every other value in a save
 *  and states it here, with the path, BEFORE a byte is copied — so a `Map`, a class instance or a non-finite
 *  number is refused in the canonical words rather than in a paraphrase that could drift from them. */
function cloneWorldStateValue(value: unknown, path: string, who: string): unknown {
  assertDiskSafe(value, path, who);
  return copyWorldStateValue(value, path, who);
}

/** The copy half of `cloneWorldStateValue`: the one refusal a validator cannot make — an `undefined` leaf,
 *  which `assertDiskSafe` allows elsewhere because an optional field may be absent, but which `JSON.stringify`
 *  writes as NO KEY AT ALL, so a bag that came back one key shorter would be a different bag. No cycle guard
 *  lives here: `assertDiskSafe` proved the value acyclic one call up, and a second guard would be a second
 *  owner of a claim this walk does not make. */
function copyWorldStateValue(value: unknown, path: string, who: string): unknown {
  if (value === undefined) {
    throw new Error(`${who}: ${path} is undefined; JSON.stringify writes a key whose value is undefined as no key at all, so the bag would come back one key shorter — use null for "no value", or delete the key instead`);
  }
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item, index) => copyWorldStateValue(item, `${path}[${index}]`, who));
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    out[key] = copyWorldStateValue(nested, `${path}.${key}`, who);
  }
  return out;
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

/** The reputation entry array back into the `Map` a live NPC record uses, for the same reason
 *  `componentsFromData` exists: a `Map` is what `JSON.stringify` writes as `{}`, so a reader that accepted
 *  one would load a record with no standings at all and say nothing. A standing that is not a finite number
 *  is refused here rather than restored, because a file writes a non-finite number as `null` and the record
 *  would come back holding a different value than the one that was saved. */
function reputationFromData(list: SerializedNPC['reputation']): [string, number][] {
  if (list instanceof Map) {
    throw new Error('restoreNPC: reputation arrived as a Map, which JSON.stringify writes as {} — a reader that accepted it would load no standings at all, so the save shape spells them as [faction, value] pairs');
  }
  if (!Array.isArray(list)) {
    throw new Error(`restoreNPC: reputation is ${typeof list}, not an array of [faction, value] pairs`);
  }
  return list.map((pair, index) => {
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new Error(`restoreNPC: reputation[${index}] is ${Array.isArray(pair) ? `an array of ${pair.length}` : typeof pair}, not a [faction, value] pair`);
    }
    const [faction, value] = pair as [string, number];
    if (typeof faction !== 'string' || faction.length === 0) {
      throw new Error(`restoreNPC: reputation[${index}] key is ${String(faction)}, expected the faction's name`);
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`restoreNPC: reputation[${index}] ("${faction}") is ${String(value)}; a saved standing is a finite number, and JSON writes this one as null`);
    }
    return [faction, value];
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
  /** NPC records, keyed by entity id, each remembering the scene it was attached in. A registry rather
   *  than an array on the entity because the record OUTLIVES nothing: the scene graph is the thing a save
   *  files, and the entity is only the body the record is about. */
  private npcs: Map<EntityId, NpcEntry> = new Map();
  /** The player per scene — ONE record, keyed by the scene rather than by the entity, because "who is playing
   *  this world" is a fact about a scene and a body can be named by only one of the two accounts at a time. */
  private players: Map<SceneId, Player> = new Map();
  private combatants: Map<EntityId, CombatantEntry> = new Map();
  /** Arbitrary world state, per scene, as plain data. Keyed by scene for the same reason the NPC registry
   *  is: a save FILE is scoped to one scene, and a bag shared across scenes would make one scene's file
   *  carry another scene's facts. A value must be data a file can hold, which is why the setter refuses a
   *  `Map`, a class instance or a non-finite number rather than storing something `JSON` would flatten. */
  private worldStates: Map<SceneId, Map<string, unknown>> = new Map();
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
    // An NPC record is about a body, so the body going away takes the registration with it. Controllers are
    // cleaned lazily by the frame loop's own walk; nothing runs an NPC per frame, so this is the moment a
    // record can lose its subject and say so.
    if (this.npcs.delete(entityId)) this.emit('npcOrphaned', { entityId });

    // A combat record is about a body too, and unlike an NPC record it is READ per blow, so it can lose
    // its subject here rather than at the next strike.
    if (this.combatants.delete(entityId)) this.emit('combatantOrphaned', { entityId });

    // The player is owned per SCENE, so the question here is which scene the body just left: a player whose
    // body was removed would be a record pointing at nothing, and `players` is the only place that knows the
    // pairing, exactly as `npcs` is for the records keyed by entity.
    const orphanedScene = [...this.players.entries()].find(([, player]) => player.entityId === entityId);
    if (orphanedScene) {
      this.players.delete(orphanedScene[0]);
      this.emit('playerOrphaned', { sceneId: orphanedScene[0], entityId });
    }
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
   * they belonged on the way back. `npcs` inherits that scoping for the same reason and one more: a record
   * names an entity, so a file carrying records for bodies it does not carry would restore records about
   * nothing. Sequences carry their own `sceneId` (v118), so the whole registry fits.
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
    // Records are gathered from the entities THIS scene holds, so a file can never list a record whose body
    // it does not also carry — the same rule the loader refuses a foreign file for.
    const npcs: [EntityId, SerializedNPC][] = [...scene.entities.keys()]
      .sort()
      .filter((id) => this.resolveNpc(id)?.sceneId === sceneId)
      .map((id) => [id, this.npcSnapshot(sceneId, id)]);
    const file: SaveFile = {
      format: SAVE_FILE_FORMAT,
      version: SAVE_FILE_VERSION,
      savedAt,
      carries: [...SAVE_DATA_FEASIBILITY.savable],
      doesNotCarry: SAVE_DATA_FEASIBILITY.blocked.map(({ field, needs }) => ({ field, needs })),
      entities,
      npcs,
      worldState: this.worldStateSnapshot(sceneId),
      // `null` is written, not omitted: a file that says `player: null` claims it looked and found no player,
      // which is a different statement from a pre-v136 file that has no such key. `carries` names the half, so
      // the loader can tell the two apart instead of guessing from a missing field.
      player: this.playerSnapshot(sceneId),
      cinematic: this.cinematicSnapshot(),
    };
    assertDiskSafe(file, 'file');
    this.emit('saveFileBuilt', {
      sceneId,
      entityCount: entities.length,
      npcCount: npcs.length,
      worldStateCount: Object.keys(file.worldState).length,
      sequenceCount: file.cinematic.sequences.length,
      hasPlayer: file.player !== null,
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
   * own registry back, entity inserts and NPC records are rolled back here too, and every id the file touches
   * — the entities AND the records that name them — is pre-checked before any half runs, so a collision never
   * reaches a half that would have to be undone. A failure after the sequences landed rolls them back through
   * `removeCinematic` (v121 closed the hole this comment used to describe), and the thrown message names how
   * many of each were removed rather than claiming the scene was untouched.
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

    // The NPC half is checked the same way and BEFORE anything runs, for the same reason: a record is about
    // a body, so a file whose records name entities it does not carry is refused rather than loaded with
    // records pointing at nothing.
    // A file written BEFORE this half existed carries no `npcs` list at all, and refusing it would make every
    // older save unloadable — while `diagnoseSaveFile` reports that same file as loadable with `npcs` in
    // `readableNowButNotCarried`, which is exactly the report the two must not be free to disagree about
    // (v127's rule). So the file's OWN claim decides: a file that does not say it carries npcs is read as
    // carrying none, and a file that DOES claim them but ships no list is refused for the claim it cannot
    // back up.
    const claimsNpcs = Array.isArray(file.carries) && file.carries.includes('npcs');
    const npcPairs = file.npcs === undefined || file.npcs === null
      ? (claimsNpcs ? undefined : [])
      : file.npcs;
    if (!Array.isArray(npcPairs)) {
      throw new Error(`loadSaveFile refused: npcs is ${typeof npcPairs}, not an array of [id, record] pairs${claimsNpcs && npcPairs === undefined ? ' — and the file CLAIMS to carry npcs, so a list is owed rather than optional' : ''}`);
    }
    for (const [index, pair] of (npcPairs as [EntityId, SerializedNPC][]).entries()) {
      const [key, record] = Array.isArray(pair) && pair.length === 2 ? pair : [];
      if (!record || typeof record !== 'object') {
        throw new Error(`loadSaveFile refused: npcs[${index}] is ${Array.isArray(pair) ? `an array of ${pair.length}` : typeof pair}, not an [id, record] pair`);
      }
      if (key !== record.entityId) {
        throw new Error(`loadSaveFile refused: npcs[${index}] is keyed ${String(key)} but the record under it says ${String(record.entityId)}; a record is filed under the entity it names, so a pair with two names for one record has to pick one`);
      }
      if (!(pairs as [EntityId, SerializedEntity][]).some(([id]) => id === record.entityId)) {
        throw new Error(`loadSaveFile refused: NPC ${record.entityId} (npcs[${index}]) is not among the entities this file carries; a record is about a body, and restoring one for a body the file does not carry would register an NPC with nothing to be`);
      }
      if (this.resolveNpc(record.entityId)) {
        throw new Error(`loadSaveFile refused: entity ${record.entityId} already has an NPC record; a restore never overwrites live state`);
      }
    }

    // The world-state half obeys the same rule as the two above and is pre-checked here, before any half
    // runs. `worldState` is a bag rather than a list, so the checks are that it IS a bag, that every value
    // is data a file can hold, and that the scene holds NO world state at all — a restore REPLACES the bag,
    // and replacing a live one would drop facts a rollback could not bring back, so the boundary is the
    // same one entities already draw: a restore never overwrites live state.
    const claimsWorldState = Array.isArray(file.carries) && file.carries.includes('worldState');
    const worldState = file.worldState === undefined || file.worldState === null
      ? (claimsWorldState ? undefined : {})
      : file.worldState;
    if (worldState === undefined || typeof worldState !== 'object' || Array.isArray(worldState)) {
      throw new Error(`loadSaveFile refused: worldState is ${worldState === undefined ? 'missing' : Array.isArray(worldState) ? 'an array' : typeof worldState}, not the bag of named values a file writes${claimsWorldState && worldState === undefined ? ' — and the file CLAIMS to carry worldState, so a bag is owed rather than optional' : ''}`);
    }
    const liveWorldStateKeys = this.getWorldStateKeys(sceneId);
    if (liveWorldStateKeys.length > 0) {
      throw new Error(`loadSaveFile refused: scene ${sceneId} already holds world state (${liveWorldStateKeys.join(', ')}); a load replaces the bag whole, so loading into a scene that already has one would drop those facts with nothing to bring them back`);
    }
    for (const [key, value] of Object.entries(worldState)) {
      if (key.length === 0) {
        throw new Error('loadSaveFile refused: worldState holds an empty key, and a value filed under no name is one no reader could ever ask for');
      }
      // `assertDiskSafe(file)` above already refused a `Map`, a live object or a non-finite number anywhere
      // in this bag, so this walk is here for the ONE thing that walk deliberately allows: `undefined`,
      // which is legal for an optional field but is written by `JSON.stringify` as no key at all.
      cloneWorldStateValue(value, `file.worldState.${key}`, 'loadSaveFile');
    }

    // The player half obeys the same old-file rule as the two above: a file with NO `player` key predates the
    // half and is read as carrying none, while a file that CLAIMS `player` owes a value — `null` included,
    // because `null` is the claim "looked for a player and found none" and an absent key does not say that.
    // Every id the player names is checked against the bodies THIS FILE carries, before any half runs, for the
    // reason the NPC half gives: a load that registered a player pointing outside the file would leave the
    // scene holding a player nothing in it can find, and a rollback cannot hand back a body that was never there.
    const claimsPlayer = Array.isArray(file.carries) && file.carries.includes('player');
    const playerHalf = (file as { player?: SerializedPlayer | null }).player;
    if (playerHalf === undefined && claimsPlayer) {
      throw new Error('loadSaveFile refused: the file CLAIMS to carry player but ships no player half — not even `null`, which is what a file with no player writes');
    }
    const savedPlayer = playerHalf ?? null;
    if (savedPlayer !== null) {
      if (typeof savedPlayer !== 'object' || Array.isArray(savedPlayer)) {
        throw new Error(`loadSaveFile refused: player is ${Array.isArray(savedPlayer) ? 'an array' : typeof savedPlayer}, not the record a file writes`);
      }
      if (!(pairs as [EntityId, SerializedEntity][]).some(([id]) => id === savedPlayer.entityId)) {
        throw new Error(`loadSaveFile refused: the player names ${String(savedPlayer.entityId)}, which is not among the entities this file carries; a player is the body the controls belong to, so a record about a body outside the file would restore a player that cannot be anywhere`);
      }
      for (const [index, slot] of (savedPlayer.hotbar ?? []).entries()) {
        if (slot !== null && !(pairs as [EntityId, SerializedEntity][]).some(([id]) => id === slot)) {
          throw new Error(`loadSaveFile refused: player.hotbar[${index}] names ${String(slot)}, which is not among the entities this file carries; an empty slot is legal, a slot pointing outside the file is not`);
        }
      }
      const heldHere = this.getPlayer(sceneId);
      if (heldHere) {
        throw new Error(`loadSaveFile refused: scene ${sceneId} already has a player on entity ${heldHere.entityId}; a load never overwrites live state`);
      }
    }

    const loadedSequences = this.restoreCinematic(file.cinematic);
    const restored: EntityId[] = [];
    const restoredNpcs: EntityId[] = [];
    let restoredWorldState: string[] = [];
    let restoredPlayer: EntityId | null = null;
    try {
      for (const [, snapshot] of pairs as [EntityId, SerializedEntity][]) {
        this.restoreEntity(sceneId, snapshot);
        restored.push(snapshot.id);
      }
      for (const [, record] of npcPairs as [EntityId, SerializedNPC][]) {
        this.restoreNPC(sceneId, record);
        restoredNpcs.push(record.entityId);
      }
      restoredWorldState = this.restoreWorldState(sceneId, worldState);
      if (savedPlayer) {
        this.restorePlayer(sceneId, savedPlayer);
        restoredPlayer = savedPlayer.entityId;
      }
    } catch (error) {
      // The records go back with their bodies: `removeEntity` is the one owner of orphaning a record, and
      // it emits `npcOrphaned` on the way, so a rollback that also detached them by hand would be a second
      // owner of the same cleanup — and the weaker of the two, since a record registered by a `restoreNPC`
      // that threw is not in `restoredNpcs` at all (the push happens after the call returns) while the body
      // removal still takes it. Measured: deleting this line reddened NOTHING, which is what a duplicate
      // owner looks like from outside (v131 probe arm 07, before it was retired).
      for (const id of restored) this.removeEntity(sceneId, id);
      // Since v121 the second half is undoable too, so a load that fails partway leaves nothing: stopping
      // first is what makes removal legal (see `removeCinematic`), and the file was the only reason those
      // sequences existed in this runtime.
      for (const id of loadedSequences.restored) {
        this.stopCinematic(id);
        this.removeCinematic(id);
      }
      // The world bag goes back the same way, key by key: the pre-check above proved the scene held none,
      // so deleting what this load set leaves exactly the state that was there before it ran.
      for (const key of restoredWorldState) this.deleteWorldState(sceneId, key);
      // The player is NOT detached here, for the reason v131 found for the NPC records: `removeEntity` above is
      // the one owner of "a record whose body is gone", and it already took the scene's player with the body it
      // names (a player's body is always among `restored`, which the pre-check insisted on). A second cleanup
      // path here would be the weaker of two owners — and would have to fire on the half of a load that failed
      // before the player landed, where there is nothing to undo.
      throw new Error(`${(error as Error).message} — the ${restored.length} entity(ies), the ${restoredNpcs.length} NPC record(s), the ${restoredWorldState.length} world-state key(s) and the ${loadedSequences.restored.length} sequence(s) this load had registered were removed again${restoredPlayer !== null ? `, and the player on ${restoredPlayer} went with its body` : ''}; a load is all or nothing`);
    }
    const report: SaveFileLoadReport = {
      sceneId,
      entities: restored,
      npcs: restoredNpcs,
      sequences: file.cinematic.sequences.map(([id]) => id),
      worldState: restoredWorldState,
      player: restoredPlayer,
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
      npcs: file.npcs.length,
      worldState: Object.keys(file.worldState).length,
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
   * Take back the temp files a store is holding. v125 named this gap out loud — a double failure (rename
   * fails, then cleanup fails too) leaves a `.tmp` that `listSaveFiles` reports and `readSaveFile` refuses,
   * and nothing swept it — so a save screen could show a file that is pure debris.
   *
   * Removal goes through `deleteSaveFile`, not a second unlink path: the same confinement, the same
   * no-op-means-`false` answer, the same `saveFileDeleted` event, one owner. `kept` is the honest
   * acknowledgement that a listing is a snapshot: a name that was there when `list()` answered and gone by
   * the time `delete` was asked is reported, not invented away.
   */
  sweepTempFiles(): { store: string; removed: string[]; kept: string[] } {
    if (!this.storage) throw new Error('sweepTempFiles: this runtime has no SaveStore — create it with { storage }');
    const removed: string[] = [];
    const kept: string[] = [];
    for (const path of this.storage.list()) {
      if (!path.endsWith(SAVE_TEMP_SUFFIX)) continue;
      if (this.deleteSaveFile(path).removed) removed.push(path);
      else kept.push(path);
    }
    return { store: this.storage.kind, removed, kept };
  }

  /**
   * Say what a save file claims, and whether this runtime agrees with it — without loading it.
   *
   * A file is a snapshot of what the writer could do. `carries` and `doesNotCarry` were copied out of
   * `SAVE_DATA_FEASIBILITY` at write time, so a file from an older runtime can disagree with the table that
   * exists now: it can claim to carry a field this build cannot read (a load would refuse), or omit a field
   * this build *can* fill (a load succeeds and quietly leaves that half empty). Today neither is visible
   * before the fact, which is how a "successful" load of an old file can be a partial restore.
   *
   * The diagnosis is deliberately answerable: `loadable` is computed from the same table `loadSaveFile`
   * consults, and the suite asserts for three crafted files that the verdict and the actual load agree. A
   * diagnosis that disagrees with the operation it describes is the failure mode this whole lane keeps
   * chasing, so it is tested as a pair rather than trusted as a report.
   */
  diagnoseSaveFile(path: string): SaveFileDiagnosis {
    if (!this.storage) throw new Error('diagnoseSaveFile: this runtime has no SaveStore — create it with { storage }');
    const contents = this.storage.read(path);
    if (contents === null) {
      throw new Error(`diagnoseSaveFile: no save file at "${path}" in the ${this.storage.kind} store`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch (error) {
      throw new Error(`diagnoseSaveFile: "${path}" is not readable as JSON (${(error as Error).message}); the diagnosis needs the file's own claims, and there are none here`);
    }
    const file = parsed as Partial<SaveFile>;
    const problems: string[] = [];
    if (!file || typeof file !== 'object' || Array.isArray(file)) problems.push('the bytes parse to something other than an object');
    if (file?.format !== SAVE_FILE_FORMAT) problems.push(`format is ${String(file?.format)}, not ${SAVE_FILE_FORMAT}`);
    if (file?.version !== SAVE_FILE_VERSION) problems.push(`version is ${String(file?.version)}, and this runtime reads exactly ${SAVE_FILE_VERSION}`);
    const declaredCarries: string[] | null = Array.isArray(file?.carries) ? file.carries : null;
    const declaredOmits: string[] | null = Array.isArray(file?.doesNotCarry) ? file.doesNotCarry.map((entry) => entry.field) : null;
    // The claims must be the shapes `loadSaveFile` insists on, or the diagnosis reports "loadable" about a file
    // the loader is about to refuse — and a report that can disagree with the operation it describes is an
    // opinion about the runtime, not a report from it.
    if (declaredCarries === null || declaredOmits === null) {
      if (declaredCarries === null) problems.push(`carries is ${typeof file?.carries}, not an array of field names`);
      if (declaredOmits === null) problems.push(`doesNotCarry is ${typeof file?.doesNotCarry}, not the list of fields the file leaves out`);
      return {
        path, bytes: contents.length, loadable: false, problems,
        carriedButUnreadableHere: [], readableNowButNotCarried: [],
      };
    }
    if (problems.length > 0) {
      return {
        path, bytes: contents.length, loadable: false, problems,
        carriedButUnreadableHere: [], readableNowButNotCarried: [],
      };
    }
    const carriedButUnreadableHere = declaredCarries.filter((field) => !SAVE_DATA_FEASIBILITY.savable.includes(field));
    const readableNowButNotCarried = SAVE_DATA_FEASIBILITY.savable.filter((field) => !declaredCarries.includes(field));
    for (const field of carriedButUnreadableHere) {
      problems.push(`it carries "${field}", which this runtime can neither fill nor read`);
    }
    for (const field of readableNowButNotCarried) {
      problems.push(`it omits "${field}", which this runtime could now write — the file predates that capability`);
    }
    // A claim must be backed by BYTES, not merely be a name this runtime can fill. The loader refuses a file
    // that names a half in `carries` and ships no value for it (`null` is a value; an absent key is not), so a
    // diagnosis that read only the claim called such a file loadable while the load about to run refused it —
    // v127's rule, and the half v136 introduced is what made it sharp: a file can now claim a player and write
    // no `player` key at all. The wording is the loader's, so the two readers cannot describe one refusal twice.
    const claimsWithoutBytes = declaredCarries.filter((field) =>
      SAVE_DATA_FEASIBILITY.savable.includes(field)
      && (file as Record<string, unknown>)[field] === undefined);
    for (const field of claimsWithoutBytes) {
      problems.push(`the file CLAIMS to carry ${field} but ships no ${field} half`);
    }
    return {
      path,
      bytes: contents.length,
      loadable: carriedButUnreadableHere.length === 0 && claimsWithoutBytes.length === 0,
      problems,
      carriedButUnreadableHere,
      readableNowButNotCarried,
    };
  }

  /**
   * Every save the store holds, diagnosed — which is the question a save-picker actually asks.
   *
   * v127 answers one named path, so a caller with a listing still had to attempt every file to learn which
   * ones could be opened. This runs the same code over everything `list()` returns, so the verdict has one
   * owner rather than a second opinion about the same claims.
   *
   * The result is a partition, and the suite asserts it as one: `total` equals the three buckets summed, and
   * no name appears twice. `unreadable` is kept apart from `unloadable` on purpose — "I could not look at it"
   * and "I looked and refused" need different fixes, and a listing that conflates them hides which one
   * happened.
   */
  diagnoseSaveFiles(): {
    store: string;
    total: number;
    loadable: SaveFileDiagnosis[];
    unloadable: SaveFileDiagnosis[];
    unreadable: { path: string; reason: 'not-json' | 'listed-then-missing'; why: string }[];
  } {
    if (!this.storage) throw new Error('diagnoseSaveFiles: this runtime has no SaveStore — create it with { storage }');
    const loadable: SaveFileDiagnosis[] = [];
    const unloadable: SaveFileDiagnosis[] = [];
    const unreadable: { path: string; reason: 'not-json' | 'listed-then-missing'; why: string }[] = [];
    for (const path of this.storage.list()) {
      // The reason is decided by WHICH check failed, not by reading an error sentence back: the survey does its
      // own read, so "nothing came back" and "bytes that are not JSON" are two situations it observes itself.
      // A caller forced to string-match a message to branch is a caller whose branch breaks the moment the
      // wording improves — which is the fragility this field exists to remove.
      const contents = this.storage.read(path);
      if (contents === null) {
        unreadable.push({ path, reason: 'listed-then-missing', why: 'listed by the store, but nothing was read back when the survey reached it' });
        continue;
      }
      try {
        const diagnosis = this.diagnoseSaveFile(path);
        (diagnosis.loadable ? loadable : unloadable).push(diagnosis);
      } catch (error) {
        unreadable.push({ path, reason: 'not-json', why: (error as Error).message });
      }
    }
    return {
      store: this.storage.kind,
      total: loadable.length + unloadable.length + unreadable.length,
      loadable,
      unloadable,
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

  // ── npc records ───────────────────────────────────────────────────────────────────────────────

  /**
   * Attach an NPC record to `entity`, registered under the entity's id.
   *
   * The record is built from `DEFAULT_NPC` plus what the caller names, and two fields are READ rather than
   * defaulted: `name` falls back to the entity's own name, and `homeLocation` to where the entity is
   * STANDING right now (cloned — a record aliasing the live position would call the walk home a trip to
   * wherever the character happens to be). Nothing here moves the body: this is the record, and no
   * behavior reads it yet, which `npcFieldAudit` says out loud for the fields that would need one.
   */
  attachNPC(sceneId: SceneId, entity: EntityId, options: NpcAttachOptions = {}): NPC {
    if (!this.sceneGraph.scenes.get(sceneId)) {
      throw new Error(`attachNPC: scene ${sceneId} does not exist (entity ${entity})`);
    }
    const target = this.getEntity(sceneId, entity);
    if (!target) throw new Error(`attachNPC: entity ${entity} is not in scene ${sceneId}`);
    if (this.resolveNpc(entity)) {
      throw new Error(`attachNPC: entity ${entity} already has an NPC record; detachNPC(${entity}) first`);
    }
    const npc: NPC = {
      entityId: entity,
      name: options.name ?? target.name,
      archetype: options.archetype ?? DEFAULT_NPC.archetype,
      personality: { ...DEFAULT_NPC.personality, ...options.personality },
      schedule: [],
      currentTask: null,
      homeLocation: (options.homeLocation ?? target.threeObject.position).clone(),
      wanderRadius: options.wanderRadius ?? DEFAULT_NPC.wanderRadius,
      faction: options.faction ?? DEFAULT_NPC.faction,
      reputation: new Map(Object.entries(options.reputation ?? {})),
      inventory: [],
      dialogueTree: [],
      quests: [],
    };
    this.npcs.set(entity, { npc, sceneId });
    this.emit('npcAttached', { entityId: entity, npc });
    return npc;
  }

  detachNPC(entity: EntityId): boolean {
    const removed = this.npcs.delete(entity);
    if (removed) this.emit('npcDetached', { entityId: entity });
    return removed;
  }

  /** The live record for `entity`, or `undefined`. An entry whose entity is gone is dropped by
   *  `resolveNpc` before this answers, so a caller can never be handed a record with no body to be. */
  getNPC(entity: EntityId): NPC | undefined {
    return this.resolveNpc(entity)?.npc;
  }

  /** Write one faction's standing on a live record. `false` means there is no record for `entity` — the
   *  same shape `setControllerInput` uses for "nothing to write to". A non-finite standing is refused
   *  rather than stored: a file writes one as `null`, so the record would come back holding a different
   *  number than the one written, which is the drift `assertDiskSafe` exists to catch on the way out. */
  setNPCReputation(entity: EntityId, faction: string, value: number): boolean {
    const entry = this.resolveNpc(entity);
    if (!entry) return false;
    if (!Number.isFinite(value)) {
      throw new Error(`setNPCReputation: the standing with "${faction}" is ${value}; a save writes a non-finite number as null, so the record would come back holding a different value than the one written`);
    }
    entry.npc.reputation.set(faction, value);
    return true;
  }

  /**
   * The record as FILE data. Each field is a value, not a reference: `personality` is copied and
   * `homeLocation` becomes three numbers, so a caller holding the snapshot cannot move the live record by
   * mutating what it was handed. `reputation` is an ENTRY ARRAY, sorted, for the reason the type spells out
   * — a `Map` would be written as `{}` and come back empty.
   */
  npcSnapshot(sceneId: SceneId, entity: EntityId): SerializedNPC {
    const entry = this.resolveNpc(entity);
    if (!entry || !this.getEntity(sceneId, entity)) {
      throw new Error(`npcSnapshot: entity ${entity} has no NPC record in scene ${sceneId}`);
    }
    return {
      entityId: entry.npc.entityId,
      name: entry.npc.name,
      archetype: entry.npc.archetype,
      personality: { ...entry.npc.personality },
      homeLocation: vectorToData(entry.npc.homeLocation, 'homeLocation', 'npcSnapshot'),
      wanderRadius: entry.npc.wanderRadius,
      faction: entry.npc.faction,
      reputation: [...entry.npc.reputation.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    };
  }

  /**
   * Put a record back onto the entity it names.
   *
   * A record is about a BODY, so a snapshot naming an entity this scene does not have is refused: an NPC
   * with nothing to be would be a record whose own `entityId` points at nothing, and every later question
   * about it (where is it, what does it want) would have no answer that came from the world. Restoring onto
   * an occupied id is refused for the same reason `restoreEntity` refuses one — a restore never overwrites
   * live state.
   */
  restoreNPC(sceneId: SceneId, snapshot: SerializedNPC): NPC {
    if (!this.sceneGraph.scenes.get(sceneId)) {
      throw new Error(`restoreNPC: scene ${sceneId} does not exist (entity ${snapshot.entityId})`);
    }
    if (!this.getEntity(sceneId, snapshot.entityId)) {
      throw new Error(`restoreNPC: entity ${snapshot.entityId} is not in scene ${sceneId}; a record is about a body, and one restored onto nothing would be an NPC that cannot be anywhere`);
    }
    if (this.resolveNpc(snapshot.entityId)) {
      throw new Error(`restoreNPC: entity ${snapshot.entityId} already has an NPC record; a restore never overwrites live state`);
    }
    const npc = this.attachNPC(sceneId, snapshot.entityId, {
      name: snapshot.name,
      archetype: snapshot.archetype,
      personality: snapshot.personality,
      homeLocation: vectorFromData(snapshot.homeLocation, 'homeLocation', 'restoreNPC'),
      wanderRadius: snapshot.wanderRadius,
      faction: snapshot.faction,
      reputation: Object.fromEntries(reputationFromData(snapshot.reputation)),
    });
    this.emit('npcRestored', { sceneId, entityId: snapshot.entityId, npc });
    return npc;
  }

  /**
   * Report which declared `NPC` fields the file shape carries and which it does not, derived from the live
   * record against the snapshot rather than from a list written twice. The snapshot is the single owner of
   * what a save holds; this audit only names the leftovers, so a field added to `NPC` tomorrow shows up
   * here without anyone remembering to add it, and a field that gets carried stops being reported.
   */
  npcFieldAudit(entity: EntityId): NpcFieldAudit | undefined {
    const entry = this.resolveNpc(entity);
    if (!entry) return undefined;
    const carried = Object.keys(this.npcSnapshot(entry.sceneId, entity)).sort();
    const untouched = Object.keys(entry.npc)
      .filter((field) => !carried.includes(field))
      .sort()
      .map((field) => ({
        field,
        needs: UNTOUCHED_NPC_FIELDS.find((gap) => gap.field === field)?.needs
          ?? 'declared on NPC and not carried by the file shape, with no entry in the gap table saying why — which is itself the finding',
      }));
    return { carried, untouched };
  }

  // ── the player record ─────────────────────────────────────────────────────────────────────────
  //
  // v136 gives `SaveData.player` an owner. The record is a SINGLETON per scene rather than a registry keyed by
  // entity, because "who this world is played as" is a fact about a scene: a second player in one scene would
  // leave every later question — whose controls, whose hotbar, whose save — with two answers.

  /**
   * Name the body this scene is played as, and register it as the scene's player.
   *
   * Two fields are READ rather than defaulted, for the reason `attachNPC` gives for a record's home: `position`
   * and `rotation` come from where the body is standing right now, cloned. `inventory` starts empty and stays
   * empty — nothing in this package fills one, and `playerFieldAudit` says so in the table's own words.
   */
  attachPlayer(sceneId: SceneId, entity: EntityId, options: PlayerAttachOptions = {}): Player {
    if (!this.sceneGraph.scenes.get(sceneId)) {
      throw new Error(`attachPlayer: scene ${sceneId} does not exist (entity ${entity})`);
    }
    const target = this.getEntity(sceneId, entity);
    if (!target) throw new Error(`attachPlayer: entity ${entity} is not in scene ${sceneId}`);
    const held = this.getPlayer(sceneId);
    if (held) {
      throw new Error(`attachPlayer: scene ${sceneId} already has a player on entity ${held.entityId}; detachPlayer(${sceneId}) first — one scene is played as one body, and a second record would leave every later question about the controls with two answers`);
    }
    const hotbar = [...(options.hotbar ?? [])];
    for (const [index, slot] of hotbar.entries()) {
      if (slot === null) continue;
      if (typeof slot !== 'string' || !this.getEntity(sceneId, slot)) {
        throw new Error(`attachPlayer: hotbar[${index}] names ${String(slot)}, which is not an entity in scene ${sceneId}; a quick slot pointing at a body the scene does not hold is a slot no one can use`);
      }
    }
    const player: Player = {
      entityId: entity,
      position: (options.position ?? target.threeObject.position).clone(),
      rotation: new THREE.Euler().copy(options.rotation ?? target.threeObject.rotation),
      health: options.health ?? DEFAULT_PLAYER.health,
      maxHealth: options.maxHealth ?? DEFAULT_PLAYER.maxHealth,
      mana: options.mana ?? DEFAULT_PLAYER.mana,
      maxMana: options.maxMana ?? DEFAULT_PLAYER.maxMana,
      experience: options.experience ?? DEFAULT_PLAYER.experience,
      level: options.level ?? DEFAULT_PLAYER.level,
      inventory: [],
      skills: new Map(Object.entries(options.skills ?? {})),
      hotbar,
    };
    // A non-finite number is refused at the door rather than stored: `JSON.stringify` writes `NaN` and
    // `Infinity` as `null`, so the record would come back off a file holding a DIFFERENT number than the one
    // the caller put in — the same drift `setNPCReputation` refuses a standing for.
    for (const [name, value] of [['health', player.health], ['maxHealth', player.maxHealth], ['mana', player.mana], ['maxMana', player.maxMana], ['experience', player.experience], ['level', player.level]] as [keyof Player, number][]) {
      if (!Number.isFinite(value)) {
        throw new Error(`attachPlayer: ${name} is ${value}; a save writes a non-finite number as null, so the record would come back holding a different value than the one written`);
      }
    }
    for (const [name, value] of player.skills.entries()) {
      if (!Number.isFinite(value)) {
        throw new Error(`attachPlayer: the skill "${name}" is ${value}; a save writes a non-finite number as null, so the skill would come back holding a different level than the one written`);
      }
    }
    this.players.set(sceneId, player);
    this.emit('playerAttached', { sceneId, entityId: entity, player });
    return player;
  }

  /** The scene's player, or `undefined`. A record whose body has left the scene is dropped HERE, on the way to
   *  answering, for the same reason `resolveNpc` drops an orphaned record: a caller must not be handed a player
   *  that cannot be anywhere. */
  getPlayer(sceneId: SceneId): Player | undefined {
    const player = this.players.get(sceneId);
    if (!player) return undefined;
    if (!this.getEntity(sceneId, player.entityId)) {
      this.players.delete(sceneId);
      this.emit('playerOrphaned', { sceneId, entityId: player.entityId });
      return undefined;
    }
    return player;
  }

  /** Take the scene's player back. `false` means the scene had none — an answer, not a failure, because a
   *  rollback has to be legal on the half of a load that did not happen. */
  detachPlayer(sceneId: SceneId): boolean {
    const removed = this.players.delete(sceneId);
    if (removed) this.emit('playerDetached', { sceneId });
    return removed;
  }

  /**
   * The player as FILE data, or `null` when the scene has no player. `null` is written by the file and is a
   *  CLAIM — it says this format looked for a player and found none, which is not the same statement as an old
   *  file that has no `player` key at all (see `loadSaveFile`). Every value is a copy: `position`/`rotation`
   *  become plain numbers, `skills` becomes a sorted ENTRY ARRAY, and `hotbar` is a new array, so a caller
   *  holding a snapshot cannot move the live record by editing what it was handed.
   */
  playerSnapshot(sceneId: SceneId): SerializedPlayer | null {
    const player = this.getPlayer(sceneId);
    if (!player) return null;
    return {
      entityId: player.entityId,
      position: vectorToData(player.position, 'position', 'playerSnapshot'),
      rotation: eulerToData(player.rotation, 'rotation'),
      health: player.health,
      maxHealth: player.maxHealth,
      mana: player.mana,
      maxMana: player.maxMana,
      experience: player.experience,
      level: player.level,
      skills: [...player.skills.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      hotbar: [...player.hotbar],
    };
  }

  /**
   * Put a saved player back into a scene.
   *
   * The pre-checks run before anything is registered, because a restore that half-applies leaves a scene with a
   *  player and a body that does not match it: the body has to be IN the scene, the scene has to have no player
   *  already (`detachPlayer` first — a restore never overwrites live state), and the `skills`/`hotbar` halves have
   *  to arrive in the shapes a file can actually hold. A `Map` written by `JSON.stringify` is `{}`, so an object
   *  here is refused by name instead of restoring a player who quietly lost every skill.
   *
   * The shape checks come BEFORE the live-player one, in the same order `loadSaveFile` uses for the record it was
   *  given: "these bytes are not a player half" is a fact about the argument that stays true whatever the scene
   *  holds, while the state conflict tells the caller to detach and retry — and retrying a badly-shaped half
   *  would only earn the same refusal a step later, having sent them looking at the wrong thing first.
   */
  restorePlayer(sceneId: SceneId, saved: SerializedPlayer): Player {
    if (!Array.isArray(saved.skills)) {
      throw new Error(`restorePlayer: skills is ${typeof saved.skills}, not the [name, level] entry array a file writes; a live Map is written as {}, so reading an object here would restore a player who lost every skill they had`);
    }
    if (!Array.isArray(saved.hotbar)) {
      throw new Error(`restorePlayer: hotbar is ${typeof saved.hotbar}, not an array of entity ids and empty slots`);
    }
    if (!this.sceneGraph.scenes.get(sceneId)) {
      throw new Error(`restorePlayer: scene ${sceneId} does not exist (entity ${saved.entityId})`);
    }
    if (!this.getEntity(sceneId, saved.entityId)) {
      throw new Error(`restorePlayer: entity ${saved.entityId} is not in scene ${sceneId}; a player is the body the controls belong to, and one restored onto nothing would be a player that cannot be anywhere`);
    }
    const held = this.getPlayer(sceneId);
    if (held) {
      throw new Error(`restorePlayer: scene ${sceneId} already has a player on entity ${held.entityId}; a restore never overwrites live state`);
    }
    const player = this.attachPlayer(sceneId, saved.entityId, {
      position: vectorFromData(saved.position, 'position', 'restorePlayer'),
      rotation: eulerFromData(saved.rotation, 'rotation'),
      health: saved.health,
      maxHealth: saved.maxHealth,
      mana: saved.mana,
      maxMana: saved.maxMana,
      experience: saved.experience,
      level: saved.level,
      skills: Object.fromEntries(saved.skills),
      hotbar: [...saved.hotbar],
    });
    this.emit('playerRestored', { sceneId, entityId: saved.entityId, player });
    return player;
  }

  /**
   * Report which declared `Player` fields the file shape carries and which it does not, derived from the live
   *  record against the snapshot rather than from a list written twice — the same rule `npcFieldAudit` runs by,
   *  so a field added to `Player` tomorrow shows up here as the finding instead of being dropped in silence.
   */
  playerFieldAudit(sceneId: SceneId): PlayerFieldAudit | undefined {
    const player = this.getPlayer(sceneId);
    if (!player) return undefined;
    const carried = Object.keys(this.playerSnapshot(sceneId) as SerializedPlayer).sort();
    const untouched = Object.keys(player)
      .filter((field) => !carried.includes(field))
      .sort()
      .map((field) => ({
        field,
        needs: UNTOUCHED_PLAYER_FIELDS.find((gap) => gap.field === field)?.needs
          ?? 'declared on Player and not carried by the file shape, with no entry in the gap table saying why — which is itself the finding',
      }));
    return { carried, untouched };
  }

  /** The one door every player OPERATION goes through for its argument and its subject.
   *
   *  An amount that is not a finite non-negative number is refused rather than stored, for the reason
   *  `attachPlayer` refuses a non-finite scalar: `JSON.stringify` writes NaN as null, so a number this door
   *  accepted would come back off a file as a different number. And a NEGATIVE amount is refused rather than
   *  interpreted as its opposite — a caller who means "heal" has `healPlayer`, and a sign that silently
   *  reverses an operation is how a damage call becomes a healing one.
   */
  private requirePlayerForOperation(sceneId: SceneId, operation: string, amount: number): Player {
    const player = this.getPlayer(sceneId);
    if (!player) {
      throw new Error(`${operation}: scene ${sceneId} has no player, and an operation on a record that is not there would move numbers nothing owns`);
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      throw new Error(`${operation}: amount is ${String(amount)}; an operation takes a finite, non-negative number, and a save writes a non-finite one as null`);
    }
    return player;
  }

  /** Take health off the scene's player, and report what LANDED rather than what was asked for. `died` is
   *  true only on the call that crossed the boundary: a blow on a corpse lands 0 and is not a second death.
   *  Nothing here enforces what a dead player may do — this method moves a number and says so. */
  damagePlayer(sceneId: SceneId, amount: number, reason = ''): PlayerDamageReport {
    const player = this.requirePlayerForOperation(sceneId, 'damagePlayer', amount);
    const landed = Math.min(amount, player.health);
    player.health -= landed;
    const died = player.health === 0 && landed > 0;
    const report: PlayerDamageReport = {
      sceneId,
      entityId: player.entityId,
      amount,
      damage: landed,
      health: player.health,
      maxHealth: player.maxHealth,
      died,
      reason,
    };
    this.emit('playerDamaged', report);
    if (died) this.emit('playerDied', report);
    return report;
  }

  /** Put health back, clamped at `maxHealth`. A heal at full health answers a report of zero — asking for
   *  health the record already has is an answer, not an error. */
  healPlayer(sceneId: SceneId, amount: number): PlayerHealReport {
    const player = this.requirePlayerForOperation(sceneId, 'healPlayer', amount);
    const healed = Math.min(amount, player.maxHealth - player.health);
    player.health += healed;
    const report: PlayerHealReport = {
      sceneId,
      entityId: player.entityId,
      amount,
      healed,
      health: player.health,
      maxHealth: player.maxHealth,
    };
    this.emit('playerHealed', report);
    return report;
  }

  /** Spend mana, refusing a spend the pool cannot cover. Health clamps and mana refuses, and the difference is
   *  deliberate: an overkill blow has an obvious reading (the target is dead), while a spell the player cannot
   *  afford does not — so the caller is told instead of being handed a spell. */
  spendMana(sceneId: SceneId, amount: number): PlayerManaSpendReport {
    const player = this.requirePlayerForOperation(sceneId, 'spendMana', amount);
    if (amount > player.mana) {
      throw new Error(`spendMana: the player holds ${player.mana} mana and this call spends ${amount}; a spend larger than the pool is refused rather than clamped, because a caller who cannot afford it has to be told instead of being handed the spell`);
    }
    player.mana -= amount;
    const report: PlayerManaSpendReport = {
      sceneId,
      entityId: player.entityId,
      amount,
      mana: player.mana,
      maxMana: player.maxMana,
    };
    this.emit('playerManaSpent', report);
    return report;
  }

  /** Add experience — and NOTHING ELSE. The level does not move, and the report carries the unchanged level so
   *  a caller cannot read the silence as a level-up rule that fired. No curve is implemented here on purpose:
   *  a threshold table is a design decision this lane has no basis to invent, and the honest place for one is a
   *  caller that says out loud when a level is owed. */
  gainExperience(sceneId: SceneId, amount: number): PlayerExperienceReport {
    const player = this.requirePlayerForOperation(sceneId, 'gainExperience', amount);
    player.experience += amount;
    const report: PlayerExperienceReport = {
      sceneId,
      entityId: player.entityId,
      amount,
      experience: player.experience,
      level: player.level,
    };
    this.emit('playerExperienceGained', report);
    return report;
  }

  /** Set the level by name. This is the only way a level changes, because this runtime derives none: a level
   *  below 1 is refused (there is no level zero to be on), and a non-integer is refused rather than floored,
   *  because silently rounding a caller's number is how two callers disagree about what a record holds. */
  setPlayerLevel(sceneId: SceneId, level: number): PlayerLevelReport {
    const player = this.getPlayer(sceneId);
    if (!player) {
      throw new Error(`setPlayerLevel: scene ${sceneId} has no player, and an operation on a record that is not there would move numbers nothing owns`);
    }
    if (typeof level !== 'number' || !Number.isFinite(level) || !Number.isInteger(level) || level < 1) {
      throw new Error(`setPlayerLevel: level is ${String(level)}; a level is a finite integer of at least 1, and this runtime derives none from experience — the curve is a design decision, so a caller names the level or nothing does`);
    }
    player.level = level;
    const report: PlayerLevelReport = { sceneId, entityId: player.entityId, level: player.level, experience: player.experience };
    this.emit('playerLevelSet', report);
    return report;
  }

  // ── combat registry ───────────────────────────────────────────────────────────────────────────

  /**
   * Attach a combat record to `entity` — the owner `CombatEntity` has never had.
   *
   * Three refusals are this grant's own shape. A scene or a body that is not there is refused BY NAME, as
   * everywhere else in this class. A body that is the scene's PLAYER is refused, because the player's
   * numbers already have an owner in `attachPlayer`/`damagePlayer`: one health with two records is the drift
   * this package keeps naming, and routing a blow through whichever record a caller happened to reach would
   * make the number depend on the call. And every declared number is checked at the DOOR — a non-finite one
   * because a file writes it as `null`, a negative one because no rule here reads a negative health, armor
   * or power as anything but a record already at its floor.
   */
  attachCombatant(sceneId: SceneId, entity: EntityId, options: CombatAttachOptions = {}): CombatEntity {
    if (!this.sceneGraph.scenes.get(sceneId)) {
      throw new Error(`attachCombatant: scene ${sceneId} does not exist (entity ${entity})`);
    }
    const target = this.getEntity(sceneId, entity);
    if (!target) throw new Error(`attachCombatant: entity ${entity} is not in scene ${sceneId}`);
    const player = this.getPlayer(sceneId);
    if (player && player.entityId === entity) {
      throw new Error(`attachCombatant: entity ${entity} is scene ${sceneId}'s player, whose numbers already have an owner in attachPlayer/damagePlayer; a combat record on the same body would be a second owner of one health, and the two would drift`);
    }
    if (this.resolveCombatant(entity)) {
      throw new Error(`attachCombatant: entity ${entity} already has a combat record; detachCombatant(${entity}) first — one body takes one blow at a time, and a second record would leave every later question about its health with two answers`);
    }
    const combatant: CombatEntity = {
      entityId: entity,
      health: options.health ?? DEFAULT_COMBATANT.health,
      maxHealth: options.maxHealth ?? DEFAULT_COMBATANT.maxHealth,
      armor: options.armor ?? DEFAULT_COMBATANT.armor,
      attackPower: options.attackPower ?? DEFAULT_COMBATANT.attackPower,
      attackSpeed: DEFAULT_COMBATANT.attackSpeed,
      attackRange: options.attackRange ?? DEFAULT_COMBATANT.attackRange,
      attackType: options.attackType ?? DEFAULT_COMBATANT.attackType,
      cooldowns: new Map<string, number>(),
      statusEffects: [],
      target: null,
      faction: options.faction ?? DEFAULT_COMBATANT.faction,
      aiState: 'idle',
    };
    for (const [name, value] of [['health', combatant.health], ['maxHealth', combatant.maxHealth], ['armor', combatant.armor], ['attackPower', combatant.attackPower], ['attackRange', combatant.attackRange]] as [string, number][]) {
      if (!Number.isFinite(value)) {
        throw new Error(`attachCombatant: ${name} is ${String(value)}; a save writes a non-finite number as null, so the record would come back holding a different value than the one written`);
      }
      if (value < 0) {
        throw new Error(`attachCombatant: ${name} is ${value}; nothing here reads a negative ${name} as anything but a record that is already at its floor`);
      }
    }
    if (combatant.health > combatant.maxHealth) {
      throw new Error(`attachCombatant: health is ${combatant.health} and maxHealth is ${combatant.maxHealth}; a record that starts above its own maximum is a claim no heal could honour, so it is refused rather than clamped`);
    }
    if (!['melee', 'ranged', 'magic', 'area'].includes(combatant.attackType)) {
      throw new Error(`attachCombatant: attackType is ${String(combatant.attackType)}; the declared words are melee, ranged, magic and area, and a fifth is refused rather than stored as a word nothing here can read`);
    }
    this.combatants.set(entity, { combatant, sceneId });
    this.emit('combatantAttached', { sceneId, entityId: entity, combatant });
    return combatant;
  }

  /** The body's combat record in THIS scene, or `undefined`. A record whose body has left the scene is
   *  dropped by `resolveCombatant` on the way to answering, and a record attached in ANOTHER scene is not an
   *  answer about this one — a caller that asked about this scene must not be handed the other's numbers. */
  getCombatant(sceneId: SceneId, entity: EntityId): CombatEntity | undefined {
    const entry = this.resolveCombatant(entity);
    return entry && entry.sceneId === sceneId ? entry.combatant : undefined;
  }

  /** Take the body's combat record back. `false` means the body had none — an answer, not a failure. */
  detachCombatant(entity: EntityId): boolean {
    const removed = this.combatants.delete(entity);
    if (removed) this.emit('combatantDetached', { entityId: entity });
    return removed;
  }

  /**
   * One blow, from a body that holds a record to a body that holds one.
   *
   * The arithmetic is the whole of it, and it is stated rather than tuned. Armor SUBTRACTS, and a blow that
   * is not zero lands at least 1, so armor can never make a body invulnerable: a rule that floored at zero
   * would turn a large enough armor into a target nothing can reach, which is a state this package has no
   * way to report. A zero blow is not a hit that pierces armor — it is nothing happening, and it is the one
   * amount armor is not a floor for. `damage` is what LANDED, so an overkill blow reports less than it asked
   * for and a blow on a corpse reports 0.
   *
   * `died` is true only on the blow that crossed the boundary, and that is the ONE write this runtime makes
   * to `aiState`: `dead` is entered at zero and left only by `healCombatant` crossing back. What a dead body
   * may do is not decided here beyond that — a strike FROM a corpse is refused, and that is the whole rule.
   */
  strike(sceneId: SceneId, attacker: EntityId, target: EntityId, amount?: number, reason = ''): CombatStrikeReport {
    const striker = this.requireCombatant(sceneId, attacker, 'strike');
    const victim = this.requireCombatant(sceneId, target, 'strike');
    // v140 — a body may not be its own target, and the refusal comes BEFORE the striker's own state is
    // read: "you named one body twice" is a fact about the call, while "that body is dead" is a fact about
    // the world, and a malformed call should not be reported as a world condition. Without this a caller
    // who transposed two arguments halved their own health and got a report that looked like a hit.
    if (attacker === target) {
      throw new Error(`strike: entity ${attacker} is both attacker and target; a body cannot strike itself — self-inflicted damage is a different operation from one body hitting another, and this door does not guess which was meant`);
    }
    if (striker.combatant.aiState === 'dead') {
      throw new Error(`strike: entity ${attacker} is dead on its own record, and a corpse does not strike — the state a dead body is in is the one transition this runtime keeps, and this is it being read`);
    }
    const asked = amount ?? striker.combatant.attackPower;
    if (typeof asked !== 'number' || !Number.isFinite(asked) || asked < 0) {
      throw new Error(`strike: amount is ${String(asked)}; a strike takes a finite, non-negative number, and a save writes a non-finite one as null`);
    }
    const raw = asked === 0 ? 0 : Math.max(1, asked - victim.combatant.armor);
    const landed = Math.min(raw, victim.combatant.health);
    victim.combatant.health -= landed;
    const died = victim.combatant.health === 0 && landed > 0;
    if (died) victim.combatant.aiState = 'dead';
    const report: CombatStrikeReport = {
      sceneId,
      entityId: attacker,
      targetId: target,
      amount: asked,
      damage: landed,
      armor: victim.combatant.armor,
      health: victim.combatant.health,
      maxHealth: victim.combatant.maxHealth,
      died,
      reason,
    };
    this.emit('combatantDamaged', report);
    if (died) this.emit('combatantDied', report);
    return report;
  }

  /** Put health back on a body's record, clamped at `maxHealth`, and leave `dead` only where the health
   *  actually crossed back above zero — the other half of the one transition `strike` enters. A heal at full
   *  health answers a report of zero rather than refusing, exactly as `healPlayer` does. */
  healCombatant(sceneId: SceneId, entity: EntityId, amount: number): CombatHealReport {
    const entry = this.requireCombatant(sceneId, entity, 'healCombatant');
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      throw new Error(`healCombatant: amount is ${String(amount)}; a heal takes a finite, non-negative number, and a save writes a non-finite one as null`);
    }
    const healed = Math.min(amount, entry.combatant.maxHealth - entry.combatant.health);
    entry.combatant.health += healed;
    const revived = entry.combatant.health > 0 && entry.combatant.aiState === 'dead';
    if (revived) entry.combatant.aiState = 'idle';
    const report: CombatHealReport = {
      sceneId,
      entityId: entity,
      amount,
      healed,
      health: entry.combatant.health,
      maxHealth: entry.combatant.maxHealth,
      revived,
    };
    this.emit('combatantHealed', report);
    return report;
  }

  /** Which declared `CombatEntity` fields this runtime consults and which it does not, in the shape
   *  `physicsFieldAudit` uses. The suite reads `src/types.ts` and requires the two lists to partition the
   *  declared type, so a field added to `CombatEntity` cannot join the silent ones. `undefined` means the
   *  body holds no record in this scene — a different answer from a record no code path reads. */
  combatFieldAudit(sceneId: SceneId, entity: EntityId): CombatantFieldAudit | undefined {
    const entry = this.resolveCombatant(entity);
    if (!entry || entry.sceneId !== sceneId) return undefined;
    return {
      declared: true,
      consulted: [...CONSULTED_COMBAT_FIELDS].sort(),
      unhonored: UNHONORED_COMBAT_REASONS.map((row) => ({ ...row })),
    };
  }

  /** The one door `strike` and `healCombatant` go through for their subjects. A body that is the scene's
   *  player is refused HERE as well as at the attach door, because the routing rule has to hold for a caller
   *  who attached no record: the numbers' owner is a fact about the body, not about the order two calls were
   *  made in. */
  private requireCombatant(sceneId: SceneId, entity: EntityId, operation: string): CombatantEntry {
    const player = this.getPlayer(sceneId);
    if (player && player.entityId === entity) {
      throw new Error(`${operation}: entity ${entity} is scene ${sceneId}'s player, whose health is moved by damagePlayer; this runtime does not route one blow through two records`);
    }
    const entry = this.resolveCombatant(entity);
    if (!entry) {
      throw new Error(`${operation}: entity ${entity} has no combat record; attachCombatant(${sceneId}, ${entity}) first`);
    }
    if (entry.sceneId !== sceneId) {
      throw new Error(`${operation}: entity ${entity} has a combat record in scene ${entry.sceneId}, not in ${sceneId}; a record is about a body in one scene, and this call is about another one`);
    }
    return entry;
  }

  /** The live record for `entity`, or `undefined`. An entry whose body is gone is dropped HERE, so a caller
   *  is never handed a combat record with nothing left to be a body — the rule `resolveNpc` runs by. */
  private resolveCombatant(entity: EntityId): CombatantEntry | undefined {
    const entry = this.combatants.get(entity);
    if (!entry) return undefined;
    if (!this.getEntity(entry.sceneId, entity)) {
      this.combatants.delete(entity);
      this.emit('combatantOrphaned', { entityId: entity });
      return undefined;
    }
    return entry;
  }

  private resolveNpc(entity: EntityId): NpcEntry | undefined {
    const entry = this.npcs.get(entity);
    if (!entry) return undefined;
    const scene = this.sceneGraph.scenes.get(entry.sceneId);
    if (scene?.entities.has(entity)) return entry;
    this.npcs.delete(entity);
    this.emit('npcOrphaned', { entityId: entity });
    return undefined;
  }

  // ── world state ───────────────────────────────────────────────────────────────────────────────

  /**
   * Set one world-state key for a scene.
   *
   * The value must be DATA a file can hold, checked HERE rather than when a save is built: `assertDiskSafe`
   * would catch a `Map` or a class instance at `buildSaveFile` time, but by then the caller has already
   * stored something this runtime can never restore, and a write that refuses later is a worse answer than
   * a set that refuses now. `undefined` is refused rather than stored as `null`: a file writes it as no key
   * at all, so the bag would come back shorter than the one that was set.
   */
  setWorldState(sceneId: SceneId, key: string, value: unknown): void {
    if (!this.sceneGraph.scenes.get(sceneId)) {
      throw new Error(`setWorldState: scene ${sceneId} does not exist, and state filed against a scene that is not there would be a fact about nothing`);
    }
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error(`setWorldState: the key is ${String(key)}; world state is addressed by name, and an empty name is one no reader could ever ask for`);
    }
    const stored = cloneWorldStateValue(value, `worldState.${key}`, 'setWorldState');
    let bag = this.worldStates.get(sceneId);
    if (!bag) {
      bag = new Map();
      this.worldStates.set(sceneId, bag);
    }
    bag.set(key, stored);
  }

  /** One world-state value, or `undefined` when the scene or the key is not there. Both answer `undefined`
   *  on purpose — a caller asking about a key in a scene that does not exist has no value either way — and
   *  `getWorldStateKeys` is what tells the two apart. The value is a COPY, the same way a snapshot is: a
   *  caller who could mutate what they read would be moving the runtime's state through a getter, which is
   *  the one thing `setWorldState` cloning on the way in would then not have bought. */
  getWorldState(sceneId: SceneId, key: string): unknown {
    const bag = this.worldStates.get(sceneId);
    if (!bag?.has(key)) return undefined;
    return cloneWorldStateValue(bag.get(key), `worldState.${key}`, 'getWorldState');
  }

  /** Every key this scene holds, sorted: the population `worldStateFieldAudit` reports over and the reason
   *  the audit needs no second list of what is stored. */
  getWorldStateKeys(sceneId: SceneId): string[] {
    return [...(this.worldStates.get(sceneId)?.keys() ?? [])].sort();
  }

  /** Forget one key, answering whether it was there — so "removed" and "was never set" are not the same
   *  silence. */
  deleteWorldState(sceneId: SceneId, key: string): boolean {
    return this.worldStates.get(sceneId)?.delete(key) ?? false;
  }

  /**
   * The scene's world state as FILE data: a plain object, because that is the shape `SaveData.worldState`
   * declares and the shape `JSON.stringify` keeps whole. `setWorldState` is the one door that checks a
   * value, so what comes out here is data by construction rather than by hope, and every value is copied so
   * a caller holding the snapshot cannot move the scene's state by mutating it.
   */
  worldStateSnapshot(sceneId: SceneId): Record<string, unknown> {
    if (!this.sceneGraph.scenes.get(sceneId)) {
      throw new Error(`worldStateSnapshot: scene ${sceneId} does not exist`);
    }
    const bag = this.worldStates.get(sceneId);
    if (!bag) return {};
    const out: Record<string, unknown> = {};
    for (const key of [...bag.keys()].sort()) out[key] = cloneWorldStateValue(bag.get(key), `worldState.${key}`, 'worldStateSnapshot');
    return out;
  }

  /**
   * Replace a scene's world state with what a file carried, answering how many keys landed.
   *
   * REPLACE, not merge: a save describes a world, and merging it into whatever the scene happens to hold
   * would leave keys from the previous state standing beside the loaded ones with nothing saying which is
   * which. An empty object is a legitimate value — a scene saved with no world state comes back with none
   * — which is why the answer is a count rather than a boolean that could not tell "empty" from "failed".
   */
  restoreWorldState(sceneId: SceneId, state: Record<string, unknown>): string[] {
    if (!this.sceneGraph.scenes.get(sceneId)) {
      throw new Error(`restoreWorldState: scene ${sceneId} does not exist`);
    }
    if (state === null || typeof state !== 'object' || Array.isArray(state)) {
      throw new Error(`restoreWorldState: worldState is ${Array.isArray(state) ? 'an array' : typeof state}, not the bag of named values a file writes`);
    }
    for (const [key, value] of Object.entries(state)) cloneWorldStateValue(value, `worldState.${key}`, 'restoreWorldState');
    const bag = new Map<string, unknown>();
    for (const key of Object.keys(state).sort()) bag.set(key, cloneWorldStateValue(state[key], `worldState.${key}`, 'restoreWorldState'));
    this.worldStates.set(sceneId, bag);
    return [...bag.keys()];
  }

  /** The scene's keys and the well-known names this package refuses to keep, so "the runtime has no world
   *  state" is answerable by name rather than by a caller reading the source. */
  worldStateFieldAudit(sceneId: SceneId): WorldStateFieldAudit | undefined {
    if (!this.sceneGraph.scenes.get(sceneId)) return undefined;
    const carried = this.getWorldStateKeys(sceneId);
    const untouched = UNTOUCHED_WORLD_STATE_FIELDS
      .filter((gap) => !carried.includes(gap.field))
      .map((gap) => ({ ...gap }));
    return { carried, untouched };
  }

  /**
   * The one refusal table, read as a census over planes instead of as the single slice a caller happens to
   * be about to write. `npcFieldAudit`, `worldStateFieldAudit` and `buildSaveFile` each print a `blocked`
   * list, and each of those lists is true ONLY of its own plane: `inventory` is refused by the NPC record and
   * by the world bag, `sceneGraph` is refused by the save file alone, and `entities` is carried by the save
   * file while the world bag refuses it as a second owner of a list it does not hold. So "is `quests`
   * refused?" has no single answer, and a caller that asks one question of three differently-scoped tables
   * gets one flat list that is wrong for at least two of them. This returns, per name, the planes that refuse
   * it and the planes that do not, so the flat reading is impossible to produce by accident.
   */
  refusalCensus(): RefusalCensus {
    return {
      planes: [...REFUSAL_PLANES],
      rows: [...REFUSALS]
        .sort((a, b) => a.field.localeCompare(b.field))
        .map((row) => ({
          field: row.field,
          refusedBy: REFUSAL_PLANES.filter((plane) => row.planes.includes(plane)),
          notRefusedBy: REFUSAL_PLANES.filter((plane) => !row.planes.includes(plane)),
          needs: { ...row.needs },
        })),
    };
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
    // Same reason as the controllers: the records are keyed by entity id, and every entity is gone by this
    // line, so leaving them would be a registry of NPCs that cannot be anywhere.
    this.npcs.clear();
    // Same reason again: the state is keyed by scene id, and every scene is gone by this line.
    this.worldStates.clear();
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
