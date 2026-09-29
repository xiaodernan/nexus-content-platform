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
