import type { ToolImpl, ToolRegistry } from './registry.js';
import type { ToolSpec } from './types.js';

/**
 * M5 v140 (§63-adjacent, the 3D plane) — the FIRST consumer of `@nexus/three-runtime`.
 *
 * Why this exists, in the words every M5 grant has had to write: *"no consumer imports
 * `@nexus/three-runtime`; the roadmap's M5 entry is still a runtime with tests, not a feature a user can
 * open."* v138 gave the package a combat record and v139 gave it a package face, and the bound survived
 * both. This file is the agent-side consumer: a `scene.*` tool family that lets the loop compose and
 * inspect a 3D scene through the registry's own §28 gate.
 *
 * **Why a driver seam and not an import.** This module does NOT depend on `@nexus/three-runtime`. It
 * declares the narrow `SceneDriver` interface it needs and the HOST supplies the implementation — exactly
 * the shape `browserTools` uses for `BrowserDriver`, and for the same reason: the agent lane must be able
 * to hold the capability without holding the renderer, and a test must be able to drive the family without
 * a GL context. `docs/evidence/agents/scene-tools-proof.mjs` wires the REAL `ThreeRuntime` through it, so
 * the seam is proven against the package it was written for rather than against a second fake.
 *
 * **What this family does NOT do (§60).** It never renders, and it has no door that could be mistaken for
 * one. There is no `scene.screenshot`: this runtime can compose a scene and read its shape back, and a
 * door that answered with a picture would be `browserTools`' own `base64-screenshot-placeholder` defect in
 * a new costume. Every result therefore says which engine answered, and `scene.inspect` reports the scene's
 * STRUCTURE — counts and names — which is a claim this side can actually check.
 *
 * **M5 v163 — the scene survives the process.** `scene.save` serialises a scene into the runtime's own
 * JSON-safe save file, and `scene.load` reads one back into an EXISTING scene. Two honesty rules shape the
 * pair. First, the door reports the file's STRUCTURE (counts, `carries`, `savedAt`) and hands the file
 * itself along — it does not paraphrase the runtime's format into something of its own invention, and what
 * comes back from `scene.save` is exactly what `scene.load` accepts. Second, the load target must already
 * exist and the driver's OWN anti-overwrite rules stand: a restore never overwrites live state, so loading
 * a scene's file back into that same live scene is refused by the driver and surfaces here as `ok:false`
 * with the driver's reason. The file travels as a JSON string because `ArgType` has no object type — the
 * registry validates declared shapes, and an undeclared one would be a gate with a hole in it.
 *
 * **The gate is the registry's.** The tool bodies do not gate themselves: `ToolRegistry.invoke` validates
 * args, asks the §28 checkpoint for every dangerous permission, and turns a thrown error into `ok:false`.
 * A second gate here could disagree with the first — the defect `browserTools` records in its own header.
 */

/** One body to add to a scene. Deliberately a NAME and a KIND, not a geometry/material object: an agent
 *  supplies data a model can emit, and the driver decides what a `mesh` is made of. */
export interface SceneEntitySpec {
  name: string;
  kind: 'mesh' | 'group' | 'sprite' | 'points' | 'line' | 'skinnedMesh';
  /** World position. Absent means the driver's own origin, and the summary says where it landed. */
  position?: [number, number, number];
}

/** The scene's STRUCTURE, which is what this side can check. Every field is countable or nameable — there
 *  is no field here that would require a rendering pass to answer. */
export interface SceneSummary {
  sceneId: string;
  name: string;
  entities: number;
  cameras: number;
  animations: number;
  entityNames: string[];
  cameraNames: string[];
  activeCamera: string | null;
}

/**
 * M5 v163 — the save file, as THIS side may hold it. Structural and deliberately shallow: the door counts
 * and carries, it does not interpret entity snapshots. Every field is one the real `ThreeRuntime` writes
 * (`buildSaveFile`), and a file that survives `JSON.stringify` — which the runtime itself guarantees — is
 * exactly what `scene.load` takes back in.
 */
export interface SceneSaveFileLike {
  format: string;
  version: number;
  savedAt: number;
  carries: string[];
  doesNotCarry: { field: string; needs: string }[];
  entities: [string, unknown][];
  npcs: [string, unknown][];
  worldState: Record<string, unknown>;
  player: unknown;
  cinematic: unknown;
}

/** What `scene.load` gets back from the driver: the report the runtime itself writes about a restore. */
export interface SceneLoadReportLike {
  sceneId: string;
  entities: string[];
  npcs: string[];
  sequences: string[];
  worldState: string[];
  player: string | null;
  carries: string[];
}

/**
 * The slice of a 3D runtime an agent is allowed to reach.
 *
 * Methods may answer synchronously or with a promise — the same allowance `TreeReaper` makes — so a driver
 * that has to await a real renderer is not forced into a fake synchronous shape.
 */
export interface SceneDriver {
  /** Which implementation is answering, so a result never has to guess. Never inferred by a caller. */
  readonly engine: string;
  createScene(name: string): string | Promise<string>;
  addEntity(sceneId: string, spec: SceneEntitySpec): string | Promise<string>;
  /** `false` when the body or the scene was not there — the driver's own answer, not a guess. */
  removeEntity(sceneId: string, entityId: string): boolean | Promise<boolean>;
  addCamera(sceneId: string, name: string): string | Promise<string>;
  setActiveCamera(sceneId: string, cameraId: string): boolean | Promise<boolean>;
  /** `undefined` when the driver holds no such scene — a different answer from an empty one. */
  summarize(sceneId: string): SceneSummary | undefined | Promise<SceneSummary | undefined>;
  /** M5 v163 — serialise a scene into the runtime's own save file. `savedAt` is the CALLER's instant: the
   *  runtime owns a frame clock, not a wall clock, and refuses to invent one. */
  saveScene(sceneId: string, savedAt: number): SceneSaveFileLike | Promise<SceneSaveFileLike>;
  /** M5 v163 — read a save file back into an EXISTING scene. Refusals are the driver's own: a missing
   *  target, a foreign format, or a restore that would overwrite live state all throw here. */
  loadScene(sceneId: string, file: SceneSaveFileLike): SceneLoadReportLike | Promise<SceneLoadReportLike>;
}

export const SCENE_ENTITY_KINDS: readonly SceneEntitySpec['kind'][] = [
  'mesh',
  'group',
  'sprite',
  'points',
  'line',
  'skinnedMesh',
];

/** A function DECLARATION with an explicit `never` return — TypeScript narrows control flow after a call
 *  to one of these, which a `const` arrow assigned to `never` does not do. Every refusal below relies on
 *  that narrowing to prove the happy path is unreachable after a refusal. */
function refused(message: string): never {
  throw new Error(message);
}

/** `position` arrives as three separate numbers because `ToolArgSpec` has no array-of-number type; the
 *  door refuses a PARTIAL triple rather than defaulting the missing axes, which would place a body
 *  somewhere no caller named. */
function readPosition(x: unknown, y: unknown, z: unknown): [number, number, number] | undefined {
  const given = [x, y, z].filter((v) => v !== undefined);
  if (given.length === 0) return undefined;
  if (given.length !== 3) {
    refused(`position needs all three of x, y and z, or none of them; this call gave ${given.length}`);
  }
  for (const [axis, value] of [['x', x], ['y', y], ['z', z]] as const) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      refused(`position ${axis} is ${String(value)}; a scene position is a finite number`);
    }
  }
  return [x as number, y as number, z as number];
}

function readKind(kind: unknown): SceneEntitySpec['kind'] {
  if (!SCENE_ENTITY_KINDS.includes(kind as SceneEntitySpec['kind'])) {
    refused(`kind is ${String(kind)}; the declared kinds are ${SCENE_ENTITY_KINDS.join(', ')}`);
  }
  return kind as SceneEntitySpec['kind'];
}

/** M5 v163 — the file argument arrives as a JSON STRING (`ArgType` has no object type), so the door owns
 *  the parse and refuses what no loader should ever see: malformed JSON, a bare value, an array. */
function readSaveFile(raw: unknown): SceneSaveFileLike {
  if (typeof raw !== 'string' || raw === '') {
    refused(`file must be the JSON text of a scene.save result, got ${raw === '' ? 'an empty string' : typeof raw}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    refused(`file is not JSON a loader can read: ${(error as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    refused(`file parses to ${Array.isArray(parsed) ? 'an array' : typeof parsed}, not a save-file object`);
  }
  return parsed as SceneSaveFileLike;
}

export const SCENE_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'scene.create',
    description: 'Create a scene and answer its id. Nothing is rendered: this family composes and inspects a scene graph.',
    permissions: ['write'],
    args: [{ name: 'name', type: 'string', required: true }],
  },
  {
    name: 'scene.entity.add',
    description: 'Add a body to a scene. A position is all three axes or none — a partial triple is refused rather than defaulted.',
    permissions: ['write'],
    args: [
      { name: 'sceneId', type: 'string', required: true },
      { name: 'name', type: 'string', required: true },
      { name: 'kind', type: 'string', required: true },
      { name: 'x', type: 'number', required: false },
      { name: 'y', type: 'number', required: false },
      { name: 'z', type: 'number', required: false },
    ],
  },
  {
    name: 'scene.entity.remove',
    description: 'Remove a body from a scene. A body that is not there answers false rather than throwing.',
    permissions: ['write'],
    args: [
      { name: 'sceneId', type: 'string', required: true },
      { name: 'entityId', type: 'string', required: true },
    ],
  },
  {
    name: 'scene.camera.add',
    description: 'Add a camera to a scene and answer its id. The first camera a scene gets is its active one.',
    permissions: ['write'],
    args: [
      { name: 'sceneId', type: 'string', required: true },
      { name: 'name', type: 'string', required: true },
    ],
  },
  {
    name: 'scene.camera.focus',
    description: 'Make one camera the scene’s active one. Answers false when the scene or the camera is not there.',
    permissions: ['write'],
    args: [
      { name: 'sceneId', type: 'string', required: true },
      { name: 'cameraId', type: 'string', required: true },
    ],
  },
  {
    name: 'scene.save',
    description:
      'Serialise a scene into the runtime’s own JSON-safe save file — bodies, NPC records, world state, player, cinematic sequences. ' +
      'Answers the file’s STRUCTURE (counts, carries, savedAt) plus the file itself; nothing is rendered and nothing reaches a disk.',
    permissions: ['write'],
    args: [
      { name: 'sceneId', type: 'string', required: true },
      { name: 'savedAt', type: 'number', required: false },
    ],
  },
  {
    name: 'scene.load',
    description:
      'Read a save file back into an EXISTING scene — pass the JSON text of a scene.save result as `file`. ' +
      'A restore never overwrites live state: loading into the scene the file was saved FROM is refused, load into a fresh scene.',
    permissions: ['write'],
    args: [
      { name: 'sceneId', type: 'string', required: true },
      { name: 'file', type: 'string', required: true },
    ],
  },
  {
    name: 'scene.inspect',
    description: 'Read a scene’s STRUCTURE — counts, names and the active camera. Read-class: no checkpoint is asked, and no picture is produced.',
    permissions: ['read'],
    args: [{ name: 'sceneId', type: 'string', required: true }],
  },
];

/**
 * Register the `scene.*` family over `driver`.
 *
 * Every refusal is spoken by the door that knows the fact: a missing `sceneId`/`name`/`kind` is named by
 * the argument reader, an unknown scene or camera is named by the driver's own answer, and the registry
 * names a missing arg or a denied checkpoint before any of this runs.
 */
export function registerSceneTools(registry: ToolRegistry, driver: SceneDriver): ToolRegistry {
  const requireString = (value: unknown, what: string): string => {
    if (typeof value !== 'string' || value === '') {
      refused(`${what} must be a non-empty string, got ${JSON.stringify(value)}`);
    }
    return value;
  };
  const summarizeOrRefuse = async (sceneId: string): Promise<SceneSummary> => {
    const summary = await driver.summarize(sceneId);
    if (!summary) {
      refused(`no scene ${sceneId} is held by the ${driver.engine} driver; create it with scene.create first`);
    }
    return summary;
  };

  const impls: Record<string, ToolImpl> = {
    'scene.create': async (args) => {
      const name = requireString(args.name, 'scene.create name');
      const sceneId = await driver.createScene(name);
      return { engine: driver.engine, sceneId, name, rendered: false };
    },

    'scene.entity.add': async (args) => {
      const sceneId = requireString(args.sceneId, 'scene.entity.add sceneId');
      const name = requireString(args.name, 'scene.entity.add name');
      const kind = readKind(args.kind);
      const position = readPosition(args.x, args.y, args.z);
      // The scene must exist BEFORE the body is added, so a typo in the id is refused by this family
      // rather than swallowed by a driver that happens to create-or-append.
      await summarizeOrRefuse(sceneId);
      const entityId = await driver.addEntity(sceneId, { name, kind, ...(position ? { position } : {}) });
      return { engine: driver.engine, sceneId, entityId, name, kind, position: position ?? null, rendered: false };
    },

    'scene.entity.remove': async (args) => {
      const sceneId = requireString(args.sceneId, 'scene.entity.remove sceneId');
      const entityId = requireString(args.entityId, 'scene.entity.remove entityId');
      await summarizeOrRefuse(sceneId);
      const removed = await driver.removeEntity(sceneId, entityId);
      return { engine: driver.engine, sceneId, entityId, removed };
    },

    'scene.camera.add': async (args) => {
      const sceneId = requireString(args.sceneId, 'scene.camera.add sceneId');
      const name = requireString(args.name, 'scene.camera.add name');
      await summarizeOrRefuse(sceneId);
      const cameraId = await driver.addCamera(sceneId, name);
      const summary = await driver.summarize(sceneId);
      return {
        engine: driver.engine,
        sceneId,
        cameraId,
        name,
        // The first camera a scene gets becomes active — reported from the driver's own summary rather
        // than asserted here, because whether that is true is the driver's fact and not this file's.
        activeCamera: summary?.activeCamera ?? null,
      };
    },

    'scene.camera.focus': async (args) => {
      const sceneId = requireString(args.sceneId, 'scene.camera.focus sceneId');
      const cameraId = requireString(args.cameraId, 'scene.camera.focus cameraId');
      await summarizeOrRefuse(sceneId);
      const focused = await driver.setActiveCamera(sceneId, cameraId);
      const summary = await driver.summarize(sceneId);
      return { engine: driver.engine, sceneId, cameraId, focused, activeCamera: summary?.activeCamera ?? null };
    },

    'scene.save': async (args) => {
      const sceneId = requireString(args.sceneId, 'scene.save sceneId');
      await summarizeOrRefuse(sceneId);
      // The instant is the CALLER's to name (the runtime owns no wall clock); the door's host process is
      // a legitimate caller, so an absent savedAt defaults to this process's own clock.
      const savedAt = args.savedAt === undefined ? Date.now() : (args.savedAt as number);
      const file = await driver.saveScene(sceneId, savedAt);
      return {
        engine: driver.engine,
        sceneId,
        savedAt: file.savedAt,
        format: file.format,
        version: file.version,
        entities: file.entities.length,
        npcs: file.npcs.length,
        worldStateKeys: Object.keys(file.worldState ?? {}).length,
        carries: [...file.carries],
        // The file itself, unparaphrased: what comes back here is exactly what scene.load takes in.
        file,
        rendered: false,
      };
    },

    'scene.load': async (args) => {
      const sceneId = requireString(args.sceneId, 'scene.load sceneId');
      const file = readSaveFile(args.file);
      // The target must exist — a loader that created one would be inventing the world the file was meant
      // to describe, so the same "scene must exist first" rule the write doors keep applies here.
      await summarizeOrRefuse(sceneId);
      const report = await driver.loadScene(sceneId, file);
      return {
        engine: driver.engine,
        sceneId,
        loadedInto: report.sceneId,
        entities: report.entities.length,
        npcs: report.npcs.length,
        sequences: report.sequences.length,
        worldStateKeys: report.worldState.length,
        player: report.player,
        carries: [...report.carries],
        rendered: false,
      };
    },

    'scene.inspect': async (args) => {
      const sceneId = requireString(args.sceneId, 'scene.inspect sceneId');
      const summary = await summarizeOrRefuse(sceneId);
      return { engine: driver.engine, ...summary };
    },
  };

  for (const spec of SCENE_TOOL_SPECS) {
    const impl = impls[spec.name];
    if (!impl) throw new Error(`unrouted scene tool ${spec.name}`);
    registry.register(spec, impl);
  }
  return registry;
}
