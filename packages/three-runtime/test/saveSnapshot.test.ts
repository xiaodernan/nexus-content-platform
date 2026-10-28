import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as publicSurface from '../src/index.js';
import { createThreeRuntime, refusalsFor, type ThreeRuntime, type NpcAttachOptions, type PlayerAttachOptions } from '../src/threeRuntime.js';
import type { EntityComponent, EntityId, NPC, Player, SaveFile, SceneId, SerializedEntity, SerializedNPC, SerializedPlayer, ThreeEntity } from '../src/types.js';
import { entityId as eid, sceneId as sid } from '../src/types.js';
import { createHeadlessBackend } from '../src/renderBackend.js';
import { createFsSaveStore, createMemorySaveStore, resolveSavePath, type FsLike, type SaveStore } from '../src/saveStore.js';

/**
 * M5 v115: `SerializedEntity` / `SerializedSceneGraph` / `SaveData` were declared in `types.ts` and
 * constructed or consumed by NOTHING — a save format with no writer and no reader. This suite makes the
 * entity half of that format real (`snapshotEntity` / `restoreEntity`), then audits what is still a claim:
 * `saveFeasibilityAudit` answers which fields a save carries, which it aliases, and which declared halves
 * of `SaveData` the runtime cannot fill at all.
 *
 * The last section deliberately does NOT restate the production tables. It reads `src/types.ts` from disk
 * and requires the shipped shape and the shipped builder to be the SAME SET, so a field added to one side
 * and forgotten on the other is a red test rather than a save that quietly restores a default.
 */

const mockCanvas = {
  width: 800,
  height: 600,
  style: {},
  getContext: vi.fn(() => ({ canvas: mockCanvas, drawingBufferWidth: 800, drawingBufferHeight: 600 })),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  clientWidth: 800,
  clientHeight: 600,
} as unknown as HTMLCanvasElement;

let runtime: ThreeRuntime;
let scene: SceneId;
let hero: EntityId;

function freshWorld(): ThreeRuntime {
  const created = createThreeRuntime({}, { backend: (_canvas, cfg) => createHeadlessBackend(cfg) });
  created.initialize(mockCanvas);
  return created;
}

/** A runtime that can put a save file somewhere: v120's seam, injected rather than imported. */
function runtimeWithStore(storage: SaveStore): ThreeRuntime {
  const created = createThreeRuntime({}, { backend: (_canvas, cfg) => createHeadlessBackend(cfg), storage });
  created.initialize(mockCanvas);
  return created;
}

/** One entity in a named scene of a named runtime, for the cases that run two runtimes at once. */
function withEntityIn(rt: ThreeRuntime, sceneId: SceneId): EntityId {
  const created = rt.createEntity(sceneId, 'Hero', 'mesh');
  rt.getEntity(sceneId, created.id)!.threeObject.position.set(1, 2, 3);
  return created.id;
}

/** One mesh at `position`, remembered as `hero`, with the flags a test may want to flip. */
function withEntity(
  position = new THREE.Vector3(1.5, 2.25, -3.75),
  extras: Partial<Pick<ThreeEntity, 'visible' | 'castShadow' | 'receiveShadow' | 'layers'>> = {}
): ThreeEntity {
  const entity = runtime.createEntity(scene, 'Hero', 'mesh', undefined, undefined, position);
  hero = entity.id;
  Object.assign(entity, extras);
  if (extras.layers !== undefined) entity.threeObject.layers.set(extras.layers);
  if (extras.visible !== undefined) entity.threeObject.visible = extras.visible;
  if (extras.castShadow !== undefined) entity.threeObject.castShadow = extras.castShadow;
  if (extras.receiveShadow !== undefined) entity.threeObject.receiveShadow = extras.receiveShadow;
  return entity;
}

function reload(snapshot: SerializedEntity): ThreeEntity {
  runtime.removeEntity(scene, hero);
  return runtime.restoreEntity(scene, snapshot);
}

/** `src/types.ts` as text, line endings normalised. Read once at module scope so every shape guard in this
 *  file reads the SAME bytes; a second reader is where one of them eventually stops matching the other. */
const typesSource = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/** Read the top-level field names of one declared interface, out of the source file itself. */
function declaredFields(name: string): string[] {
  const header = new RegExp(`export interface ${name}\\s*\\{`).exec(typesSource);
  if (!header) throw new Error(`types.ts no longer declares \`export interface ${name}\``);

  const fields: string[] = [];
  let depth = 0;
  for (const line of typesSource.slice(header.index + header[0].length).split('\n')) {
    const trimmed = line.trim();
    if (depth === 0 && trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')) {
      const field = /^\s*([A-Za-z_$][\w$]*)\??:\s/.exec(line);
      if (field) fields.push(field[1]!);
    }
    for (const character of line) {
      if (character === '{') depth += 1;
      else if (character === '}') {
        depth -= 1;
        if (depth < 0) return fields;
      }
    }
  }
  throw new Error(`\`interface ${name}\` has no closing brace in types.ts`);
}

/** Every value inside `value` that a file cannot hold. One owner for the walk: the file suite and the npc
 *  suite both hold shapes to this standard, and a copy per suite is how the two standards drift. */
function offenders(value: unknown, path = 'file'): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [`${path}: ${value}`];
  if (typeof value !== 'object') return typeof value === 'function' ? [`${path}: function`] : [];
  if (value instanceof Map || value instanceof Set) return [`${path}: ${value instanceof Map ? 'Map' : 'Set'}`];
  const proto = Object.getPrototypeOf(value);
  const bad = proto !== Object.prototype && proto !== null && !Array.isArray(value)
    ? [`${path}: ${(value as { constructor?: { name?: string } }).constructor?.name ?? 'class'}`] : [];
  const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  const keys = Array.isArray(value) ? value.map((_item, i) => `[${i}]`) : Object.keys(value as object);
  return [...bad, ...children.flatMap((child, i) => offenders(child, `${path}${Array.isArray(value) ? '' : '.'}${keys[i]}`))];
}

beforeEach(() => {
  runtime = freshWorld();
  const world = runtime.createScene('World');
  scene = world.id;
  hero = eid('no-entity-built-yet');
  runtime.setActiveScene(world.id);
});

afterEach(() => {
  runtime.dispose();
});

describe('snapshotEntity — a saved value is a copy, not a live reference', () => {
  it('writes the transform as DATA, not as the renderer’s own objects', () => {
    const entity = withEntity();
    const saved = runtime.snapshotEntity(scene, hero);

    expect(saved.position).not.toBe(entity.threeObject.position);
    expect(saved.rotation).not.toBe(entity.threeObject.rotation);
    expect(saved.scale).not.toBe(entity.threeObject.scale);
    // v115 asserted the opposite: that these were `instanceof THREE.Vector3`/`Euler`. A save shape may not
    // hold live objects — a file stores values — and an Euler flattened by JSON arrives as
    // `_x/_y/_z/_order/isEuler`, which `Euler.copy` then reads as `undefined`. v119 is the measured reason.
    expect(saved.position.constructor.name).toBe('Object');
    expect(Object.keys(saved.position).sort()).toEqual(['x', 'y', 'z']);
    expect(Object.keys(saved.rotation).sort()).toEqual(['order', 'x', 'y', 'z']);
  });

  it('keeps the saved position when the live entity moves afterwards', () => {
    const entity = withEntity();
    const saved = runtime.snapshotEntity(scene, hero);
    const atSaveTime = { ...saved.position };

    entity.threeObject.position.set(99, 99, 99);
    entity.threeObject.scale.set(4, 4, 4);
    entity.threeObject.rotation.set(1, 1, 1);

    expect(saved.position).toEqual(atSaveTime);
    expect(saved.position.z).toBe(-3.75);
    expect(saved.scale).not.toEqual(entity.threeObject.scale);
    expect(saved.rotation.x).toBe(0);
  });

  it('carries the exact numbers of the live transform', () => {
    withEntity(new THREE.Vector3(1.5, 2.25, -3.75));
    const saved = runtime.snapshotEntity(scene, hero);

    expect([saved.position.x, saved.position.y, saved.position.z]).toEqual([1.5, 2.25, -3.75]);
  });

  it('deep-copies userData so a later mutation of the live bag cannot rewrite the save', () => {
    const entity = withEntity();
    entity.userData.loadout = { slots: ['sword', 'shield'] };
    const saved = runtime.snapshotEntity(scene, hero);

    entity.userData.loadout = { slots: ['gun'] };
    (saved.userData.loadout as { slots: string[] }).slots.push('torch');

    expect(runtime.getEntity(scene, hero)!.userData.loadout).toEqual({ slots: ['gun'] });
    expect((saved.userData.loadout as { slots: string[] }).slots).toEqual(['sword', 'shield', 'torch']);
  });

  it('refuses to snapshot an entity that is not in the scene, naming both addresses', () => {
    withEntity();
    expect(() => runtime.snapshotEntity(scene, eid('entity-nope'))).toThrow(
      /snapshotEntity: entity entity-nope is not in scene/
    );
  });

  it('snapshots the declared shape: id, name, type and every flag are present', () => {
    const entity = withEntity(new THREE.Vector3(0, 1, 0), { visible: false, castShadow: false, receiveShadow: true, layers: 2 });
    const saved = runtime.snapshotEntity(scene, hero);

    expect(saved.id).toBe(entity.id);
    expect(saved.name).toBe('Hero');
    expect(saved.type).toBe('mesh');
    expect(saved.visible).toBe(false);
    expect(saved.castShadow).toBe(false);
    expect(saved.receiveShadow).toBe(true);
    expect(saved.layers).toBe(2);
  });
});

describe('plainDataOrRefuse — the two open bags hold data, not live objects', () => {
  function putUserData(value: Record<string, unknown>): () => SerializedEntity {
    return () => {
      const entity = withEntity();
      Object.assign(entity.userData, value);
      return runtime.snapshotEntity(scene, hero);
    };
  }

  it('refuses a live THREE object in userData and names the path that holds it', () => {
    expect(putUserData({ anchor: new THREE.Vector3(1, 2, 3) })).toThrow(/userData\.anchor/);
    expect(putUserData({ anchor: new THREE.Vector3(1, 2, 3) })).toThrow(/Vector3/);
  });

  it('names the FULL path when the live object is nested', () => {
    expect(putUserData({ meta: { tag: new THREE.Object3D() } })).toThrow(/userData\.meta\.tag/);
    expect(putUserData({ meta: { tag: new THREE.Object3D() } })).toThrow(/Object3D/);
  });

  it('names the ARRAY INDEX when the live object is an element', () => {
    expect(putUserData({ list: [1, new THREE.Euler()] })).toThrow(/userData\.list\[1\]/);
  });

  it('refuses a non-plain prototype by class name, so a Map does not restore as an object', () => {
    expect(putUserData({ inventory: new Map([['key', 1]]) })).toThrow(/Map instance, not plain data/);
  });

  it('refuses a function value by kind instead of dropping it', () => {
    expect(putUserData({ onTick: () => 1 })).toThrow(/userData\.onTick holds function/);
  });

  it('accepts plain data at any depth, including null and undefined', () => {
    expect(putUserData({ a: 1, b: 'x', c: true, d: null, e: undefined, f: [1, [2, { g: 3 }]] })).not.toThrow();
  });

  it('checks a component\'s data too, and puts the component type in the path', () => {
    const entity = withEntity();
    runtime.addComponent(entity, { type: 'health', data: { target: new THREE.Vector3(0, 0, 0) }, enabled: true });

    expect(() => runtime.snapshotEntity(scene, hero)).toThrow(/components\.health\.data\.target/);
  });

  it('deep-copies component data so the snapshot and the live component are independent', () => {
    const entity = withEntity();
    const component: EntityComponent = { type: 'health', data: { current: 10, tags: ['alive'] }, enabled: true };
    runtime.addComponent(entity, component);

    const saved = runtime.snapshotEntity(scene, hero);
    component.data.current = 0;
    component.data.tags = ['dead'];

    // `components` is an array of [name, component] pairs since v119, because a `Map` is what JSON erases.
    const savedHealth = () => saved.components.find(([key]) => key === 'health')?.[1];
    expect(savedHealth()!.data).toEqual({ current: 10, tags: ['alive'] });
    expect(savedHealth()!.enabled).toBe(true);

    const restored = reload(saved);
    restored.components.get('health')!.data.current = 7;
    expect(savedHealth()!.data.current).toBe(10);
  });

  it('keeps every component of a multi-component entity, keyed the same way', () => {
    const entity = withEntity();
    runtime.addComponent(entity, { type: 'health', data: { current: 1 }, enabled: true });
    runtime.addComponent(entity, { type: 'sprite', data: { frame: 2 }, enabled: false });

    const restored = reload(runtime.snapshotEntity(scene, hero));

    expect([...restored.components.keys()]).toEqual(['health', 'sprite']);
    expect(restored.components.get('sprite')).toEqual({ type: 'sprite', data: { frame: 2 }, enabled: false });
  });
});

describe('restoreEntity — a load hands back the entity the save described', () => {
  it('restores under the SAVED id, so references to that id still resolve', () => {
    const entity = withEntity();
    const saved = runtime.snapshotEntity(scene, hero);

    const restored = reload(saved);

    expect(restored.id).toBe(saved.id);
    expect(restored.id).toBe(entity.id);
    expect(runtime.getEntity(scene, saved.id)).toBe(restored);
  });

  it('refuses to restore onto a live id, because a save must not overwrite state nobody agreed to lose', () => {
    withEntity();
    const saved = runtime.snapshotEntity(scene, hero);

    expect(() => runtime.restoreEntity(scene, saved)).toThrow(/already in scene/);
    expect(() => runtime.restoreEntity(scene, saved)).toThrow(/never overwrites/);
    // The refusal has to leave the live entity alone, not half-replaced:
    expect(runtime.getEntity(scene, saved.id)!.threeObject.position.toArray()).toEqual([1.5, 2.25, -3.75]);
  });

  it('refuses an unknown scene by name rather than creating one', () => {
    const saved = runtime.snapshotEntity(scene, (withEntity(), hero));

    expect(() => runtime.restoreEntity(sid('scene-does-not-exist'), saved)).toThrow(
      /restoreEntity: scene scene-does-not-exist does not exist/
    );
    expect(() => runtime.restoreEntity(sid('scene-does-not-exist'), saved)).toThrow(new RegExp(saved.id));
  });

  it('puts the numbers back in the renderer\'s object AND in the matrix that draws it', () => {
    withEntity(new THREE.Vector3(1.5, 2.25, -3.75));
    const saved = runtime.snapshotEntity(scene, hero);
    const restored = reload(saved);

    expect(restored.threeObject.position.toArray()).toEqual([1.5, 2.25, -3.75]);
    // The matrix is rebuilt by the shared insert path, not by a second call inside `restoreEntity`: a
    // mutation that removed that second call changed nothing in this suite, so the guarantee lives here.
    expect(restored.threeObject.matrix.elements.slice(12, 15)).toEqual([1.5, 2.25, -3.75]);
    expect(restored.transform.matrix).toBe(restored.threeObject.matrix);
  });

  it('restores rotation and scale, not just position', () => {
    const entity = withEntity();
    entity.threeObject.rotation.set(0.25, 0.5, 0.75);
    entity.threeObject.scale.set(2, 3, 4);

    const restored = reload(runtime.snapshotEntity(scene, hero));

    expect(restored.threeObject.rotation.toArray().slice(0, 3)).toEqual([0.25, 0.5, 0.75]);
    expect(restored.threeObject.scale.toArray()).toEqual([2, 3, 4]);
  });

  it('restores the visibility and shadow flags onto the record and the three object', () => {
    withEntity(new THREE.Vector3(0, 0, 0), { visible: false, castShadow: false, receiveShadow: true });
    const saved = runtime.snapshotEntity(scene, hero);
    const restored = reload(saved);

    expect([restored.visible, restored.castShadow, restored.receiveShadow]).toEqual([false, false, true]);
    expect([restored.threeObject.visible, restored.threeObject.castShadow, restored.threeObject.receiveShadow]).toEqual([
      false, false, true,
    ]);
  });

  it('restores layers, which is why the shape declares them', () => {
    const entity = withEntity(new THREE.Vector3(0, 0, 0), { layers: 3 });
    expect(entity.threeObject.layers.mask).toBe(1 << 3); // the control: the live entity really is on channel 3
    const saved = runtime.snapshotEntity(scene, hero);
    const restored = reload(saved);

    expect(restored.layers).toBe(3);
    expect(restored.threeObject.layers.mask).toBe(1 << 3);
  });

  it('is not decoration: a freshly created entity is on channel 0, so the layers round trip can fail', () => {
    expect(runtime.createEntity(scene, 'Plain', 'mesh').layers).toBe(0);
    expect(runtime.createEntity(scene, 'Plain', 'mesh').threeObject.layers.mask).toBe(1);
  });

  it('attaches the restored object to the scene graph so it will actually be drawn', () => {
    const saved = runtime.snapshotEntity(scene, (withEntity(), hero));
    const restored = reload(saved);

    expect(runtime.getScene(scene)!.entities.has(restored.id)).toBe(true);
    expect(runtime.getScene(scene)!.threeScene.children).toContain(restored.threeObject);
  });

  it('emits entityRestored once with the scene and the id it restored', () => {
    const saved = runtime.snapshotEntity(scene, (withEntity(), hero));
    const seen: Array<{ sceneId: SceneId; entityId: EntityId }> = [];
    const listener = (data: { sceneId: SceneId; entityId: EntityId }): void => {
      seen.push(data);
    };
    runtime.addEventListener('entityRestored', listener);

    reload(saved);

    expect(seen).toHaveLength(1);
    expect(seen[0]!.sceneId).toBe(scene);
    expect(seen[0]!.entityId).toBe(saved.id);
    runtime.removeEventListener('entityRestored', listener);
  });

  it('also emits entityCreated, because a restore really does add an object to the scene', () => {
    const saved = runtime.snapshotEntity(scene, (withEntity(), hero));
    const created: EntityId[] = [];
    const listener = (data: { sceneId: SceneId; entity: ThreeEntity }): void => {
      if (data.sceneId === scene) created.push(data.entity.id);
    };
    runtime.addEventListener('entityCreated', listener);

    reload(saved);

    // Recorded so nobody has to rediscover it: two listeners fire on a restore, and the created event
    // carries the restored id rather than a freshly generated one.
    expect(created).toEqual([saved.id]);
    runtime.removeEventListener('entityCreated', listener);
  });

  it('leaves the scene holding one entity per id, not a duplicate, after remove + restore', () => {
    const saved = runtime.snapshotEntity(scene, (withEntity(), hero));
    reload(saved);
    expect(runtime.getScene(scene)!.entities.size).toBe(1);
    expect([...runtime.getScene(scene)!.entities.keys()]).toEqual([saved.id]);
  });

  it('restores userData as a copy, so two loads of one save are independent', () => {
    const entity = withEntity();
    entity.userData.flags = { seen: false };
    const saved = runtime.snapshotEntity(scene, hero);

    runtime.removeEntity(scene, hero);
    const first = runtime.restoreEntity(scene, saved);
    (first.userData.flags as { seen: boolean }).seen = true;

    runtime.removeEntity(scene, hero);
    const second = runtime.restoreEntity(scene, saved);

    expect((second.userData.flags as { seen: boolean }).seen).toBe(false);
    expect(saved.userData.flags).toEqual({ seen: false });
  });

  it('restores a non-mesh type as the same type', () => {
    const group = runtime.createEntity(scene, 'Rig', 'group');
    const saved = runtime.snapshotEntity(scene, group.id);
    runtime.removeEntity(scene, group.id);

    expect(runtime.restoreEntity(scene, saved).type).toBe('group');
  });
});

describe('what a save does NOT carry, said out loud', () => {
  it('geometry is not in the shape, so a restored mesh is the default box', () => {
    const sphere = runtime.createEntity(scene, 'Ball', 'mesh', new THREE.SphereGeometry(2, 12, 8));
    const saved = runtime.snapshotEntity(scene, sphere.id);
    runtime.removeEntity(scene, sphere.id);
    const restored = runtime.restoreEntity(scene, saved);
    const geometry = (restored.threeObject as THREE.Mesh).geometry;

    expect(geometry).toBeInstanceOf(THREE.BoxGeometry);
    // Honest measurement rather than a hardcoded vertex count: the sphere's own count and the box's count
    // differ, so this assertion is only green because the shape really was lost.
    const sphereCount = (sphere.threeObject as THREE.Mesh).geometry.getAttribute('position').count;
    expect(geometry.getAttribute('position').count).not.toBe(sphereCount);
    expect((geometry as THREE.BoxGeometry).parameters).toEqual({ width: 1, height: 1, depth: 1, widthSegments: 1, heightSegments: 1, depthSegments: 1 });
  });

  it('material is not in the shape either', () => {
    const lit = runtime.createEntity(scene, 'Unlit', 'mesh', undefined, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    const saved = runtime.snapshotEntity(scene, lit.id);
    runtime.removeEntity(scene, lit.id);

    const material = (runtime.restoreEntity(scene, saved).threeObject as THREE.Mesh).material as THREE.Material;
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(material).not.toBeInstanceOf(THREE.MeshBasicMaterial);
  });

  it('the audit says so: only the entity RECORD is auditable, and its record loses nothing', () => {
    withEntity(new THREE.Vector3(1, 2, 3), { layers: 1 });
    const audit = runtime.saveFeasibilityAudit(scene, hero)!;

    expect(audit.dropped).toEqual([]);
    expect(audit.aliased).toEqual(['threeObject', 'transform']);
  });

  it('answers undefined for an entity that is not there instead of inventing an empty audit', () => {
    withEntity();
    expect(runtime.saveFeasibilityAudit(scene, eid('entity-absent'))).toBeUndefined();
  });
});

describe('saveFeasibilityAudit is a reader, not a constant', () => {
  it('names an extra live field on the entity the shape cannot carry', () => {
    const entity = withEntity();
    expect(runtime.saveFeasibilityAudit(scene, hero)!.dropped).toEqual([]);

    (entity as unknown as Record<string, unknown>).anchor = new THREE.Vector3(0, 1, 0);

    expect(runtime.saveFeasibilityAudit(scene, hero)!.dropped).toEqual(['anchor']);
    expect(runtime.saveFeasibilityAudit(scene, hero)!.aliased).toEqual(['threeObject', 'transform']);
  });

  it('lists several dropped fields sorted, so the answer is stable enough to diff', () => {
    const entity = withEntity();
    (entity as unknown as Record<string, unknown>).zebra = 1;
    (entity as unknown as Record<string, unknown>).alpha = 2;

    expect(runtime.saveFeasibilityAudit(scene, hero)!.dropped).toEqual(['alpha', 'zebra']);
  });

  it('reports an alias as BROKEN when the builder stops carrying a field the claim names', () => {
    // The claim is checked against the record `snapshotEntity` actually builds. Here the builder is
    // patched to forget `layers` — exactly the drift that would otherwise restore channel 0 in silence.
    const entity = withEntity(new THREE.Vector3(0, 0, 0), { layers: 3 });
    expect(runtime.saveFeasibilityAudit(scene, entity.id)!.dropped).toEqual([]);

    const build = runtime.snapshotEntity.bind(runtime);
    runtime.snapshotEntity = (sceneId: SceneId, id: EntityId): SerializedEntity => {
      const record = build(sceneId, id);
      const { layers, ...withoutLayers } = record;
      expect(layers).toBe(3); // the patch removes a field the live entity really had
      return withoutLayers as SerializedEntity;
    };

    const audit = runtime.saveFeasibilityAudit(scene, entity.id)!;
    // Two statements, both true: the entity's own `layers` field is no longer carried, AND the alias
    // that promised it is now broken. A single list naming only one of them would understate the drift.
    expect(audit.dropped).toEqual(['layers', 'threeObject (layers not carried)']);
    expect(audit.aliased).toEqual(['transform']);

    runtime.snapshotEntity = build;
    expect(runtime.saveFeasibilityAudit(scene, entity.id)!.dropped).toEqual([]);
  });

  it('reports the SaveData split assavable-vs-blocked, and names what each blocked half is waiting on', () => {
    withEntity();
    const audit = runtime.saveFeasibilityAudit(scene, hero)!;

    // v118 moved `cinematic` across this line: v117 gave the shape a writer, v118 gave it a reader. The
    // guard below is the one that says so, and it keys on the field's own spelling rather than a list.
    // v131 moved `npcs` across it the same way: `npcSnapshot` writes a record and `restoreNPC` reads one.
    // v133 moved `worldState` across it too. v136 moved `player`, and that is the last of the four that needed
    // only an owner plus a writer and a reader: the two left are `sceneGraph` (repairing the live objects inside
    // `SerializedScene`) and `quests` (a subsystem that does not exist), which are different kinds of gap from
    // a record nobody kept.
    expect(audit.savable).toEqual(['entities', 'cinematic', 'npcs', 'worldState', 'player']);
    // The order is the derivation's, not a typing order — v135 made this list the save-file slice of `REFUSALS`
    // (see the note in the world-state audit case for why one table cannot keep three hand-written orders).
    expect(audit.blocked.map((entry) => entry.field)).toEqual(
      ['quests', 'sceneGraph']
    );
    for (const entry of audit.blocked) {
      expect(entry.needs.length, `${entry.field} must say WHY it is blocked`).toBeGreaterThan(0);
    }
    expect(audit.blocked.find((entry) => entry.field === 'quests')!.needs).toMatch(/implemented by nothing/);
  });
});

describe('the shipped shape and the shipped builder are the same set (read from types.ts)', () => {
  it('the reader really reads: each parse finds the fields it must contain', () => {
    // A parse that returned [] would make every set comparison below vacuously true, so the parser is
    // checked on names that are not in question before any conclusion is drawn from it.
    expect(declaredFields('SerializedEntity')).toContain('id');
    expect(declaredFields('ThreeEntity')).toContain('threeObject');
    expect(declaredFields('SaveData')).toContain('entities');
    expect(declaredFields('SerializedEntity')).toContain('layers');
  });

  it('snapshotEntity produces EXACTLY the fields SerializedEntity declares', () => {
    withEntity();
    const declared = declaredFields('SerializedEntity');
    const carried = Object.keys(runtime.snapshotEntity(scene, hero)).sort();

    expect(carried).toEqual([...declared].sort());
  });

  it('no declared field of ThreeEntity is neither carried nor aliased', () => {
    const entity = withEntity(new THREE.Vector3(1, 1, 1), { layers: 2 });
    const carried = new Set(Object.keys(runtime.snapshotEntity(scene, hero)));
    const audit = runtime.saveFeasibilityAudit(scene, hero)!;
    const explained = new Set([...carried, 'threeObject', 'transform']);

    for (const field of declaredFields('ThreeEntity')) {
      expect(explained.has(field), `${field} is declared on ThreeEntity but a save would drop it`).toBe(true);
    }
    expect(audit.dropped).toEqual([]);
    expect(carried.has('layers')).toBe(true);
    expect(entity.layers).toBe(2);
  });

  it('savable and blocked partition the fields SaveData declares, with no overlap and no gap', () => {
    withEntity();
    const audit = runtime.saveFeasibilityAudit(scene, hero)!;
    const declared = declaredFields('SaveData');
    const accounted = [...audit.savable, ...audit.blocked.map((entry) => entry.field)];

    expect(accounted.sort()).toEqual([...declared].sort());
    expect(new Set(accounted).size).toBe(accounted.length);
  });

  it('a savable half has a snapshot AND a restore that name it; a blocked half has neither', () => {
    // What this guard was, and why it had to be rewritten. v115 compared `Object.keys(publicSurface)` — the
    // module's top-level exports — against a regex over the blocked field names, and claimed that "the
    // `blocked` list cannot go stale by an implementation shipping and the table staying put". It could not
    // keep that promise: every implementation this package ships is a METHOD on `ThreeRuntime`, so
    // `cinematicSnapshot` (v117) and `restoreCinematic` (v118) were invisible to it, and the table moved
    // while the guard stayed green. The surface is read off the class now.
    const exported = Object.keys(publicSurface);
    expect(exported).toContain('ThreeRuntime'); // the import read a real surface, not an empty module
    withEntity();
    const audit = runtime.saveFeasibilityAudit(scene, hero)!;

    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(runtime))
      .filter((name) => name !== 'constructor' && typeof (runtime as unknown as Record<string, Function>)[name] === 'function');
    expect(methods.length, 'the prototype read a real class, not an empty object').toBeGreaterThan(20);
    // The two verbs the save lane uses for the two directions of a shape, taken from the entity pair
    // (`snapshotEntity`/`restoreEntity`) rather than hand-picked per field.
    const saveDoors = methods.filter((name) => /snapshot|restore/i.test(name));
    expect(saveDoors.sort()).toEqual(['cinematicSnapshot', 'npcSnapshot', 'playerSnapshot', 'restoreCinematic', 'restoreEntity', 'restoreNPC', 'restorePlayer', 'restoreWorldState', 'snapshotEntity', 'worldStateSnapshot']);

    // A field is named by a door when the door's own spelling carries the field's stem — `entities` is the
    // singular in the method name, and the stem rule is derived from the field, never from a table of which
    // method "counts as" which field. That table would be a second owner of the claim `SAVE_DATA_FEASIBILITY`
    // is making, which is the bug this lane keeps relearning.
    const stem = (field: string) => field.replace(/ies$/, 'y').replace(/s$/, '').toLowerCase();
    const doorsFor = (field: string) => saveDoors.filter((name) => name.toLowerCase().includes(stem(field)));

    for (const field of audit.savable) {
      const named = doorsFor(field);
      expect(named, `${field} is listed savable, but no snapshot or restore method on the class names it`).not.toEqual([]);
      expect(named.filter((n) => /snapshot/i.test(n)).length, `${field} is savable, so a writer must name it`).toBeGreaterThan(0);
      expect(named.filter((n) => /restore/i.test(n)).length, `${field} is savable, so a reader must name it too — a shape with only a writer is a shape nothing can load`).toBeGreaterThan(0);
    }
    for (const field of audit.blocked.map((entry) => entry.field)) {
      expect(doorsFor(field), `${field} is still listed blocked, but ${doorsFor(field).join(', ')} ships`).toEqual([]);
    }
  });
});

/**
 * M5 v119 — the save format becomes a FILE. v115 declared `SaveData`, v118 gave the cinematic half a reader,
 * and the claim `savable` made was still only "survives a process": measured at `4496b22`,
 * `snapshotEntity` → `JSON.stringify` → `restoreEntity` threw `TypeError: snapshot.components is not iterable`
 * because a `Map` is written as `{}`, and an `Euler` came back as `_x/_y/_z/_order` where `Euler.copy` reads
 * `x`. So the shape lost every `Map` and every live `THREE` object, and the boundary that a save always
 * needed — a file that says what it carries and what it deliberately does not — got an author and a reader.
 */
describe('a save FILE: it survives the disk, and the loader refuses what it cannot read', () => {
  /** One entity with a transform worth comparing, plus one sequence with a path. */
  function fileWithContent() {
    withEntity(new THREE.Vector3(1.5, 2.25, -3.75), { layers: 5 });
    const cam = runtime.createCamera(scene, 'Cam').id;
    runtime.defineCinematic(scene, {
      id: 'seq',
      name: 'A cutscene',
      shots: [{
        id: 's0',
        cameraId: cam,
        startTime: 0,
        endTime: 2,
        transition: 'cut',
        transitionDuration: 0,
        cameraPath: new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 2, 3), new THREE.Vector3(4, 0, 1),
        ]),
      }],
    });
    return { file: runtime.buildSaveFile(scene, 1700000000000), cam };
  }

  it('carries the five fields it can fill and names the two it leaves out', () => {
    const events: { entityCount: number; npcCount: number; sequenceCount: number }[] = [];
    runtime.addEventListener('saveFileBuilt', (data: unknown) => events.push(data as { entityCount: number; npcCount: number; sequenceCount: number }));
    const { file } = fileWithContent();
    expect(file.format).toBe('nexus-three-runtime-save');
    expect(file.version).toBe(1);
    expect(file.carries).toEqual(['entities', 'cinematic', 'npcs', 'worldState', 'player']);
    expect(file.doesNotCarry.map((entry) => entry.field)).toEqual(['quests', 'sceneGraph']);
    for (const entry of file.doesNotCarry) expect(entry.needs.length, `${entry.field} must say why it is absent`).toBeGreaterThan(0);
    expect(file.entities.length).toBe(1);
    expect(file.npcs).toEqual([]);
    // v133: the bag is always written, so an empty one is a claim about the file rather than about the scene.
    expect(file.worldState).toEqual({});
    // v136: the same rule for the player half — `null` is WRITTEN, so a file with no player says so instead of
    // leaving a reader to guess from a missing key (which is what a pre-v136 file does).
    expect(file.player).toBeNull();
    expect(file.cinematic.sequences.length).toBe(1);
    expect(file.savedAt).toBe(1700000000000);
    expect(events).toEqual([{ sceneId: scene, entityCount: 1, npcCount: 0, worldStateCount: 0, hasPlayer: false, sequenceCount: 1, carries: ['entities', 'cinematic', 'npcs', 'worldState', 'player'], doesNotCarry: ['quests', 'sceneGraph'] }]);
  });

  it('holds no Map and no class instance anywhere — and the walker can see one', () => {
    const { file } = fileWithContent();
    expect(offenders(file)).toEqual([]);
    // The control the walker needs: a check that finds nothing in every input is not a check.
    expect(offenders({ sequences: new Map([['a', 1]]) })).toEqual(['file.sequences: Map']);
    expect(offenders({ position: new THREE.Vector3(1, 2, 3) })).toEqual(['file.position: Vector3']);
    expect(offenders({ items: [1, Number.NaN] })).toEqual(['file.items[1]: NaN']);
  });

  it('survives a JSON write, and a second runtime loads the bytes and gets the same scene', () => {
    const { file, cam } = fileWithContent();
    const bytes = JSON.parse(JSON.stringify(file)) as typeof file;
    expect(offenders(bytes)).toEqual([]);

    const other = freshWorld();
    other.createScene('World again', bytes.cinematic.sequences[0]![1].sceneId);
    other.setActiveScene(bytes.cinematic.sequences[0]![1].sceneId);
    other.createCamera(bytes.cinematic.sequences[0]![1].sceneId, 'Cam again', 'perspective', {}, cam);
    const report = other.loadSaveFile(bytes, bytes.cinematic.sequences[0]![1].sceneId);
    expect(report).toEqual({
      sceneId: bytes.cinematic.sequences[0]![1].sceneId,
      entities: bytes.entities.map(([id]) => id),
      npcs: [],
      sequences: ['seq'],
      worldState: [],
      player: null,
      carries: ['entities', 'cinematic', 'npcs', 'worldState', 'player'],
    });
    // The position a file carried, and the camera position the restored curve puts the player at.
    const loaded = other.getEntity(report.sceneId, bytes.entities[0]![0])!;
    expect([loaded.threeObject.position.x, loaded.threeObject.position.y, loaded.threeObject.position.z])
      .toEqual([1.5, 2.25, -3.75]);
    expect(loaded.layers).toBe(5);
    other.playCinematic('seq');
    other.simulateFrame(1);
    const here = other.getScene(report.sceneId)!.cameras.get(cam)!.threeCamera.position;
    runtime.playCinematic('seq');
    runtime.simulateFrame(1);
    expect(here.distanceTo(runtime.getScene(scene)!.cameras.get(cam)!.threeCamera.position)).toBe(0);
    other.dispose();
  });

  /**
   * M5 v227 — the cinematic half is restored against the CALLER's scene, like every other half.
   *
   * Before this grant a sequence's `sceneId` was the one absolute reference in a file of relative ones:
   * `entities`, `npcs`, `worldState` and `player` are all restored into the `sceneId` ARGUMENT, while the
   * loader demanded that the scene a file's sequences NAME exist. A file carrying a cutscene could therefore
   * only be loaded into the very scene it was saved from — which is why the Studio's sibling restore, whose
   * whole design is "the live scene stays untouched", was refused with
   * `restoreCinematic: "seq" belongs to scene stage, which is not the active scene (…)`.
   */
  describe('the cinematic half answers to the scene the caller names (M5 v227)', () => {
    it('the SCENE half is the loader\u2019s now; the CAMERA half is the caller\u2019s, and its absence is refused by name', () => {
      const { file } = fileWithContent();
      const other = freshWorld();
      // A sibling under a GENERATED id: not the saved scene's name, and not empty either.
      const sibling = other.createScene('Sibling');
      other.createEntity(sibling.id, 'Body', 'mesh');

      // Before v227 this load was refused for the SCENE — `belongs to scene …, which is not the active
      // scene` — because the cinematic half named an absolute scene id. What is left is the half ONLY a
      // caller can do: the shot names a camera the sibling does not have, and the loader refuses it by name
      // rather than inventing one (the format carries no camera objects at all).
      expect(() => other.loadSaveFile(file, sibling.id))
        .toThrow(/shot s0 names camera .*, which is not in scene .*\. A sequence is registered against ONE scene/);
    });

    it('the caller re-issues the shot camera under its own id, and the load completes', () => {
      const { file, cam } = fileWithContent();
      const other = freshWorld();
      const sibling = other.createScene('Sibling');

      other.createCamera(sibling.id, 'Cam again', 'perspective', {}, cam);

      const report = other.loadSaveFile(file, sibling.id);

      expect(report.sequences).toEqual(['seq']);
      // The camera the shot addresses is the SIBLING's, under the file's id — not the writer's object.
      expect(other.getScene(sibling.id)!.cameras.get(cam)!.name).toBe('Cam again');
    });

    it('the caller\u2019s file is not rewritten: the cinematic half keeps the scene the save was taken from', () => {
      const { file } = fileWithContent();
      const before = JSON.stringify(file.cinematic);
      const other = freshWorld();
      const sibling = other.createScene('Sibling');
      other.createCamera(sibling.id, 'Cam again', 'perspective', {}, file.cinematic.sequences[0]![1].shots[0]!.cameraId);

      other.loadSaveFile(file, sibling.id);

      expect(JSON.stringify(file.cinematic)).toBe(before);
      expect(file.cinematic.sequences[0]![1].sceneId).toBe(scene);
    });

    it('a RUNNING sequence resumes on the target scene once the caller looks at it', () => {
      // The same file with the cutscene actually PLAYING: `activeSequence` is set and the save's
      // `currentTime` is mid-shot. Restoring it into a sibling and looking at that sibling resumes it — the
      // runtime's own condition is that a sequence plays only on the active scene.
      const { cam } = fileWithContent();
      runtime.playCinematic('seq');
      runtime.simulateFrame(0.5);
      const file = runtime.buildSaveFile(scene, 1700000000000);
      expect(file.cinematic.activeSequence).toBe('seq');
      const other = freshWorld();
      const sibling = other.createScene('Sibling');
      other.createCamera(sibling.id, 'Cam again', 'perspective', {}, cam);
      other.setActiveScene(sibling.id);

      const report = other.loadSaveFile(file, sibling.id);

      expect(report.sequences).toEqual(['seq']);
      expect(other.cinematicSnapshot().activeSequence).toBe('seq');
    });
  });

  it('refuses a file whose format or version is not this one’s, printing every problem at once', () => {
    const { file } = fileWithContent();
    expect(() => runtime.loadSaveFile({ ...file, format: 'nexus-save' as typeof file.format, version: 2 }, scene))
      .toThrow(/format is "nexus-save", not "nexus-three-runtime-save"; version is 2 and this runtime reads exactly 1/);
  });

  it('refuses a file that claims to carry a field it cannot fill, or that both carries and withholds', () => {
    const { file } = fileWithContent();
    expect(() => runtime.loadSaveFile({ ...file, carries: ['entities', 'cinematic', 'quests'] } as typeof file, scene))
      .toThrow(/carries "quests", which this runtime can neither fill nor read/);
    expect(() => runtime.loadSaveFile({
      ...file,
      doesNotCarry: [...file.doesNotCarry, { field: 'entities', needs: 'and also does not' }],
    }, scene)).toThrow(/"entities" appears both as carried and as not carried/);
  });

  it('refuses a file carrying CONTENT under a blocked name rather than loading a smaller game', () => {
    const { file } = fileWithContent();
    const smuggling = { ...file, quests: [['q-1', {}]] } as unknown as typeof file;
    expect(() => runtime.loadSaveFile(smuggling, scene))
      .toThrow(/the file holds content under "quests", a field this runtime cannot read/);
    expect(runtime.getScene(scene)!.entities.size, 'a refused load changes nothing').toBe(1);
  });

  it('refuses a Map or a live object that arrived inside the file, naming the path', () => {
    const { file } = fileWithContent();
    expect(() => runtime.loadSaveFile({ ...file, entities: new Map() } as unknown as typeof file, scene))
      .toThrow(/saveFile: file\.entities holds a Map/);
    const live = structuredClone(file) as typeof file;
    // The annotation is written as `SerializedEntity['position']` rather than `typeof live.entities[0]![1].position`,
    // which TypeScript CANNOT PARSE: `typeof` in a type position takes an entity name, and an indexed access
    // (`[0][1]`) is not one. It said so — `error TS1005: ';' expected` — but only to a gate that reads this
    // file, and until v204 no gate did: this package's `tsconfig.json` excludes `test/` because `rootDir: "src"`
    // is required by the BUILD, and vitest strips types instead of checking them, so an unparseable annotation
    // ran happily for as long as it has existed. (v204 — see ADR 0016 amendment 204.)
    live.entities[0]![1].position = new THREE.Vector3(1, 2, 3) as unknown as SerializedEntity['position'];
    expect(() => runtime.loadSaveFile(live, scene)).toThrow(/saveFile: file\.entities\[0\]\[1\]\.position holds a Vector3/);
  });

  it('refuses to load into a scene that is not there, and refuses to overwrite a live entity', () => {
    const { file } = fileWithContent();
    expect(() => runtime.loadSaveFile(file, sid('no-such-scene'))).toThrow(/scene no-such-scene does not exist/);

    const target = freshWorld();
    target.createScene('Other', 'other');
    const moved = structuredClone(file) as typeof file;
    moved.entities[0]![0] = eid('dup');
    moved.entities[0]![1].id = eid('dup');
    target.restoreEntity(sid('other'), moved.entities[0]![1]);
    expect(() => target.loadSaveFile({ ...moved, cinematic: { sequences: [], activeSequence: null, currentTime: 0 } }, sid('other')))
      .toThrow(/entity dup \(entities\[0\]\) is already in scene other/);
    // …and the pair's key is checked against the id the restore will use, because a pair with two names for
    // one entity is the same two-owners defect the envelope checks already refuse elsewhere.
    const twoNames = structuredClone(file) as typeof file;
    twoNames.entities[0]![0] = eid('key');
    let mismatch = '';
    try {
      target.loadSaveFile({ ...twoNames, cinematic: { sequences: [], activeSequence: null, currentTime: 0 } }, sid('other'));
    } catch (error) {
      mismatch = (error as Error).message;
    }
    expect(mismatch).toContain(`entities[0] is keyed key but the record under it says ${twoNames.entities[0]![1].id}`);
    expect(target.getScene(sid('other'))!.entities.size).toBe(1);
    target.dispose();
  });

  it('rolls back BOTH halves of a load that fails partway, which v119 could not say', () => {
    const { file } = fileWithContent();
    const second = structuredClone(file) as typeof file;
    second.entities.push([eid('bad'), { ...structuredClone(file.entities[0]![1]), id: eid('bad') }]);
    (second.entities[1]![1] as unknown as { position: unknown }).position = 'not a vector';
    const loaded = freshWorld();
    const stage = second.cinematic.sequences[0]![1].sceneId;
    loaded.createScene('Stage', stage);
    loaded.createCamera(stage, 'Cam again', 'perspective', {}, second.cinematic.sequences[0]![1].shots[0]!.cameraId);
    expect(() => loaded.loadSaveFile(second, stage))
      .toThrow(/restoreEntity: position x is undefined[\s\S]*the 1 entity\(ies\), the 0 NPC record\(s\), the 0 world-state key\(s\) and the 1 sequence\(s\) this load had registered were removed again; a load is all or nothing/);
    expect(loaded.getScene(stage)!.entities.size).toBe(0);
    // v119 recorded the opposite of this line: it asserted the sequence stayed registered, because nothing
    // could un-register it. v121 added `removeCinematic`, so a failed load now leaves neither half behind.
    expect(loaded.cinematicFieldAudit('seq')).toBe(undefined);
    loaded.dispose();
  });

  it('a load that fails after STARTING a cutscene stops it and takes it back too', () => {
    // v121's first probe run left this path unarmed: deleting the `stopCinematic` call from the rollback kept
    // the whole suite green, because every other rollback case loads an IDLE sequence. A playing one is the
    // case where the order matters — removing it without stopping first throws from inside the catch.
    const store = createMemorySaveStore();
    const writer = runtimeWithStore(store);
    const stage = writer.createScene('Stage').id;
    writer.setActiveScene(stage);
    const cam = writer.createCamera(stage, 'Cam').id;
    withEntityIn(writer, stage);
    writer.defineCinematic(stage, {
      id: 'roll',
      name: 'Rolling',
      shots: [{ id: 's0', cameraId: cam, startTime: 0, endTime: 4, transition: 'cut', transitionDuration: 0 }],
    });
    writer.playCinematic('roll');
    writer.simulateFrame(1);

    const file = JSON.parse(JSON.stringify(writer.buildSaveFile(stage, 1700000000001))) as Record<string, unknown>;
    expect((file.cinematic as { sequences: [string, { playing: boolean }][] }).sequences[0]![1].playing).toBe(true);
    const entities = file.entities as [string, Record<string, unknown>][];
    entities.push(['e-bad', { ...structuredClone(entities[0]![1]), id: 'e-bad', position: 'not a vector' }]);

    const reader = runtimeWithStore(store);
    reader.createScene('Stage copy', stage);
    reader.setActiveScene(stage);
    reader.createCamera(stage, 'Cam copy', 'perspective', {}, cam);
    const stopped: { sequenceId: string }[] = [];
    reader.addEventListener('cinematicStopped', (d: unknown) => stopped.push(d as { sequenceId: string }));
    expect(() => reader.loadSaveFile(file as never, stage))
      .toThrow(/position x is undefined[\s\S]*the 1 entity\(ies\), the 0 NPC record\(s\), the 0 world-state key\(s\) and the 1 sequence\(s\) this load had registered were removed again; a load is all or nothing/);
    expect(stopped.map((e) => e.sequenceId)).toEqual(['roll']);
    expect(reader.getScene(stage)!.entities.size).toBe(0);
    expect(reader.cinematicFieldAudit('roll')).toBe(undefined);
    writer.dispose();
    reader.dispose();
  });

  it('refuses the flattened Euler a v115 save arrived as, and carries the rotation order it never could', () => {
    withEntity(new THREE.Vector3(1, 2, 3));
    const live = runtime.getEntity(scene, hero)!;
    live.threeObject.rotation.set(0.25, 0.5, 0.75, 'YXZ');
    const saved = runtime.snapshotEntity(scene, hero);
    expect(saved.rotation).toEqual({ x: 0.25, y: 0.5, z: 0.75, order: 'YXZ' });

    runtime.removeEntity(scene, hero);
    const restored = runtime.restoreEntity(scene, saved);
    expect(restored.threeObject.rotation.order).toBe('YXZ');
    expect(restored.threeObject.rotation.toArray()).toEqual([0.25, 0.5, 0.75, 'YXZ']);
    // The control: an `XYZ` save and a `YXZ` save hold the same three numbers, so if the order were dropped
    // the two would be indistinguishable — and they are not the same pose.
    runtime.removeEntity(scene, hero);
    const asXYZ = structuredClone(saved);
    asXYZ.rotation.order = 'XYZ';
    const otherOrder = runtime.restoreEntity(scene, asXYZ);
    expect(new THREE.Quaternion().setFromEuler(otherOrder.threeObject.rotation).z)
      .not.toBe(new THREE.Quaternion().setFromEuler(restored.threeObject.rotation).z);

    runtime.removeEntity(scene, hero);
    const legacy = structuredClone(saved) as unknown as typeof saved;
    // What `JSON.stringify(new THREE.Euler(…))` actually writes — measured, the underscore fields — which is
    // how a v115-era save arrives, and why `Euler.copy` must never see it.
    legacy.rotation = { _x: 0.25, _y: 0.5, _z: 0.75, _order: 'XYZ', isEuler: true } as unknown as typeof saved.rotation;
    expect(() => runtime.restoreEntity(scene, legacy)).toThrow(/rotation x is undefined/);
    runtime.removeEntity(scene, hero);
    const badOrder = structuredClone(saved);
    badOrder.rotation.order = 'ZXB';
    expect(() => runtime.restoreEntity(scene, badOrder)).toThrow(/rotation order is ZXB, which is not one of "XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"/);
  });

  it('refuses components that arrive as a Map, or filed under a name that is not their type', () => {
    const entity = withEntity();
    runtime.addComponent(entity, { type: 'health', data: { current: 10 }, enabled: true });
    const saved = runtime.snapshotEntity(scene, hero);
    expect(saved.components).toEqual([['health', { type: 'health', data: { current: 10 }, enabled: true }]]);

    runtime.removeEntity(scene, hero);
    const asMap = structuredClone(saved) as unknown as typeof saved;
    asMap.components = new Map(saved.components) as unknown as typeof saved.components;
    expect(() => runtime.restoreEntity(scene, asMap))
      .toThrow(/components arrived as a Map, which JSON\.stringify writes as \{\}/);

    runtime.removeEntity(scene, hero);
    const misfiled = structuredClone(saved);
    misfiled.components = [['vitals', misfiled.components[0]![1]]];
    expect(() => runtime.restoreEntity(scene, misfiled))
      .toThrow(/components\[0\] is filed under "vitals" but calls itself "health"/);

    runtime.removeEntity(scene, hero);
    const notPairs = structuredClone(saved) as unknown as typeof saved;
    notPairs.components = { health: { type: 'health', data: {}, enabled: true } } as unknown as typeof saved.components;
    expect(() => runtime.restoreEntity(scene, notPairs)).toThrow(/components is object, not an array/);
  });

  it('refuses, at the file, the numbers no per-record writer looks at', () => {
    const entity = withEntity();
    expect(() => runtime.buildSaveFile(scene, Number.NaN))
      .toThrow(/savedAt is NaN; this runtime owns a frame clock, not a wall clock/);
    expect(() => runtime.buildSaveFile(scene, -5)).toThrow(/savedAt is -5/);
    expect(() => runtime.buildSaveFile(sid('no-such'), 1)).toThrow(/scene no-such does not exist/);
    // `layers` is copied straight out of the entity — no writer checks it — so a NaN there can only be
    // caught by the walk over the finished file, which is the producer's own refusal.
    entity.layers = Number.NaN;
    expect(() => runtime.buildSaveFile(scene, 1)).toThrow(/saveFile: file\.entities\[0\]\[1\]\.layers holds NaN, which JSON writes as null/);
    entity.layers = 0;
    expect(runtime.buildSaveFile(scene, 1).entities[0]![1].layers).toBe(0);
  });

  it('the audit sentence that used to call cinematic unimplemented now says a file names what it omits', () => {
    const shipped = readFileSync(new URL('../src/threeRuntime.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const at = shipped.indexOf('   * Say, for one live entity, what a save would actually carry.');
    expect(at, 'the audit method lost the docstring this claim is pinned to').toBeGreaterThan(-1);
    const doc = shipped.slice(at, shipped.indexOf('*/', at));
    expect(doc).toContain('doesNotCarry');
    expect(doc, 'v117 gave the cinematic half an owner and v119 gave it a reader; a comment still calling it unimplemented is stale')
      .not.toMatch(/a cinematic state the runtime does not implement|file full of empty maps/);
  });

  it('the save store is a seam: a file written through it is read by a runtime that never saw the original', () => {
    const store = createMemorySaveStore();
    const writer = runtimeWithStore(store);
    const scene = writer.createScene('World').id;
    writer.setActiveScene(scene);
    const cam = writer.createCamera(scene, 'Cam').id;
    const hero = writer.createEntity(scene, 'Hero', 'mesh').id;
    writer.addComponent(writer.getEntity(scene, hero)!, { type: 'health', data: { current: 10 }, enabled: true });
    writer.getEntity(scene, hero)!.threeObject.position.set(1.5, 2.25, -3.75);
    writer.getEntity(scene, hero)!.threeObject.rotation.set(0.25, 0.5, 0.75, 'YXZ');
    writer.defineCinematic(scene, {
      id: 'seq',
      name: 'A cutscene',
      shots: [{
        id: 's0', cameraId: cam, startTime: 0, endTime: 2, transition: 'cut', transitionDuration: 0,
        cameraPath: new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 3, 0), new THREE.Vector3(4, 0, 0), new THREE.Vector3(6, 2, 0),
        ]),
      }],
    });
    writer.playCinematic('seq');
    writer.simulateFrame(1);

    const written = writer.writeSaveFile('saves/hero.json', scene, 1700000000000);
    expect(written).toEqual({
      path: 'saves/hero.json',
      store: 'memory',
      // v125: the report now also says whether the bytes were flushed before the rename. Default false —
      // atomicity was asked for, durability was not.
      durable: false,
      bytes: store.read('saves/hero.json')!.length,
      sceneId: scene,
      entities: 1,
      npcs: 0,
      worldState: 0,
      sequences: 1,
      carries: ['entities', 'cinematic', 'npcs', 'worldState', 'player'],
      doesNotCarry: ['quests', 'sceneGraph'],
    });

    // A second runtime, sharing only the store. Nothing here came from the first one's memory.
    const reader = runtimeWithStore(store);
    reader.createScene('World again', scene);
    reader.setActiveScene(scene);
    reader.createCamera(scene, 'Cam again', 'perspective', {}, cam);
    const read = reader.readSaveFile('saves/hero.json', scene);
    expect(read).toEqual({
      sceneId: scene,
      entities: [hero],
      npcs: [],
      sequences: ['seq'],
      worldState: [],
      player: null,
      carries: ['entities', 'cinematic', 'npcs', 'worldState', 'player'],
      path: 'saves/hero.json',
      store: 'memory',
      bytes: written.bytes,
    });
    const loaded = reader.getEntity(scene, hero)!;
    expect(loaded.threeObject.position.toArray()).toEqual([1.5, 2.25, -3.75]);
    expect(loaded.threeObject.rotation.toArray()).toEqual([0.25, 0.5, 0.75, 'YXZ']);
    expect([...loaded.components.keys()]).toEqual(['health']);
    expect(loaded.components.get('health')!.data).toEqual({ current: 10 });
    reader.playCinematic('seq');
    reader.simulateFrame(0); // a frame of no advance: it places the camera without moving the playhead
    expect(reader.getScene(scene)!.cameras.get(cam)!.threeCamera.position.distanceTo(writer.getScene(scene)!.cameras.get(cam)!.threeCamera.position))
      .toBe(0);
    writer.dispose();
    reader.dispose();
  });

  it('a runtime built without a store refuses both directions instead of keeping the file to itself', () => {
    // `runtime` comes from the beforeEach with no storage — the same way every earlier suite in this file
    // built one, which is why the file methods have to say what they do not have.
    withEntity();
    expect(() => runtime.writeSaveFile('saves/hero.json', scene, 1)).toThrow(/has no SaveStore — create it with \{ storage \}/);
    expect(() => runtime.readSaveFile('saves/hero.json', scene)).toThrow(/has no SaveStore/);
    expect(runtime.saveStore()).toBe(null);
    const withOne = runtimeWithStore(createMemorySaveStore());
    expect(withOne.saveStore()!.kind).toBe('memory');
    withOne.dispose();
  });

  it('a missing file, an empty file, and bytes that are not JSON are three different answers', () => {
    const store = createMemorySaveStore();
    const reader = runtimeWithStore(store);
    const scene2 = reader.createScene('Stage').id;
    expect(() => reader.readSaveFile('saves/nope.json', scene2)).toThrow(/no save file at "saves\/nope.json" in the memory store/);

    store.write('saves/blank.json', '   ');
    expect(() => reader.readSaveFile('saves/blank.json', scene2)).toThrow(/"saves\/blank.json" is empty/);

    store.write('saves/half.json', '{"format":"nexus-three-runtime-save","entities":[');
    expect(() => reader.readSaveFile('saves/half.json', scene2)).toThrow(/"saves\/half.json" is not valid JSON/);

    store.write('saves/notasave.json', '[]');
    expect(() => reader.readSaveFile('saves/notasave.json', scene2))
      .toThrow(/"saves\/notasave.json" holds a file this runtime cannot load: loadSaveFile: the file is an array/);
    reader.dispose();
  });

  it('the file keeps its v119 refusals after the disk trip, with the path attached', () => {
    const store = createMemorySaveStore();
    const writer = runtimeWithStore(store);
    const scene2 = writer.createScene('World').id;
    writer.setActiveScene(scene2);
    withEntityIn(writer, scene2);
    const written = writer.writeSaveFile('saves/a.json', scene2, 1);
    const smuggled = JSON.parse(store.read('saves/a.json')!) as Record<string, unknown>;
    smuggled.quests = [['q-1', {}]];
    store.write('saves/b.json', JSON.stringify(smuggled));

    const reader = runtimeWithStore(store);
    reader.createScene('Copy', scene2);
    expect(() => reader.readSaveFile('saves/b.json', scene2))
      .toThrow(/"saves\/b.json" holds a file this runtime cannot load: .*content under "quests"/);
    expect(reader.getScene(scene2)!.entities.size, 'a refused read leaves the scene alone').toBe(0);
    expect(store.read('saves/a.json'), 'the refused copy is a different file; the good one is untouched').toBe(store.read('saves/a.json'));
    // v131: the good file now carries an (empty) npc list, which is the shape the smuggled copy was caught for
    // putting CONTENT into a blocked name beside — an empty list is a claim about the file, not about this one.
    expect(JSON.parse(store.read('saves/a.json')!).npcs).toEqual([]);
    writer.dispose();
    reader.dispose();
    void written;
  });

  it('a store joins under its own root and neither store lets a name escape it', () => {
    const writes: string[] = [];
    const reads: string[] = [];
    const fakeFs: FsLike = {
      writeFileSync: (p) => { writes.push(p); },
      readFileSync: (p) => { reads.push(p); return '{"stored":true}'; },
      existsSync: (p) => p.endsWith('there.json'),
    };
    const fs = createFsSaveStore(fakeFs, 'saves/root/');
    fs.write('a/deep/b.json', '{}');
    expect(writes).toEqual(['saves/root/a/deep/b.json']);
    expect(fs.read('there.json')).toBe('{"stored":true}');
    expect(reads).toEqual(['saves/root/there.json']);
    expect(fs.read('gone.json'), 'an absent path is null, not an empty string').toBe(null);
    expect(fs.kind).toBe('fs');

    // One rule, one owner: both stores refuse the same names because both call `resolveSavePath`.
    for (const bad of ['../escape', '/abs/x.json', 'C:/x.json', '', '   ', 'a/./b.json', 'a//b.json']) {
      expect(() => fs.write(bad, '{}'), `fs store with ${JSON.stringify(bad)}`).toThrow(/saveStore:/);
      expect(() => createMemorySaveStore().write(bad, '{}'), `memory store with ${JSON.stringify(bad)}`).toThrow(/saveStore:/);
    }
    expect(() => createFsSaveStore(fakeFs, 'up/../down')).toThrow(/the root "up\/\.\.\/down" itself walks out/);
    expect(resolveSavePath('a/b.json')).toBe('a/b.json');
  });

  it('a load does not disturb the bytes, and reading the same file twice gives the same content', () => {
    const store = createMemorySaveStore();
    const writer = runtimeWithStore(store);
    const scene2 = writer.createScene('World').id;
    writer.setActiveScene(scene2);
    withEntityIn(writer, scene2);
    writer.writeSaveFile('saves/twice.json', scene2, 1);
    const before = store.read('saves/twice.json')!;

    const first = runtimeWithStore(store);
    first.createScene('Copy one', scene2);
    const second = runtimeWithStore(store);
    second.createScene('Copy two', scene2);
    const a = first.readSaveFile('saves/twice.json', scene2);
    const b = second.readSaveFile('saves/twice.json', scene2);
    expect(a.entities).toEqual(b.entities);
    expect(store.read('saves/twice.json')).toBe(before);
    expect(() => first.readSaveFile('saves/twice.json', scene2)).toThrow(/is already in scene/);
    expect(store.read('saves/twice.json'), 'a failed load rewrote nothing').toBe(before);
    writer.dispose();
    first.dispose();
    second.dispose();
  });

  it('writes and reads both say so on the event bus, with the report they returned', () => {
    const store = createMemorySaveStore();
    const writer = runtimeWithStore(store);
    const scene2 = writer.createScene('World').id;
    writer.setActiveScene(scene2);
    withEntityIn(writer, scene2);
    const events: { path: string; bytes: number; kind: string }[] = [];
    const brief = (d: unknown) => ({ path: (d as { path: string }).path, bytes: (d as { bytes: number }).bytes });
    writer.addEventListener('saveFileWritten', (d: unknown) => events.push({ ...brief(d), kind: 'written' }));
    const report = writer.writeSaveFile('saves/e.json', scene2, 1);
    const reader = runtimeWithStore(store);
    reader.createScene('Copy', scene2);
    reader.addEventListener('saveFileRead', (d: unknown) => events.push({ ...brief(d), kind: 'read' }));
    reader.readSaveFile('saves/e.json', scene2);
    expect(events).toEqual([
      { path: 'saves/e.json', bytes: report.bytes, kind: 'written' },
      { path: 'saves/e.json', bytes: report.bytes, kind: 'read' },
    ]);
    writer.dispose();
    reader.dispose();
  });

  it('the declared shape reachable from SaveFile names no Map and no THREE class', () => {
    const bodyOf = (name: string): string => {
      const opener = new RegExp(`export interface ${name} \\{`).exec(typesSource);
      if (!opener) throw new Error(`${name} is no longer declared in src/types.ts`);
      const lines = typesSource.slice(opener.index + opener[0].length).split('\n');
      const body: string[] = [];
      for (const line of lines) {
        if (line.startsWith('}')) break;
        body.push(line);
      }
      return body.join('\n');
    };
    // Which type names a field's annotation refers to. `ThreeEntity['type']` is an ACCESS (a string field of
    // that type), not a value of that type, so it must not pull the live record into a save closure; `X[]`
    // and `[K, V]` do. Comment lines are prose and are skipped.
    const namedType = (body: string): string[] => {
      const names = new Set<string>();
      for (const line of body.split('\n')) {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        const annotation = /^\s*[A-Za-z_$][\w$]*\??:\s*(.*)$/.exec(line);
        if (!annotation) continue;
        for (const match of annotation[1]!.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b(\[[^\]]*\])?/g)) {
          const [, name, subscript] = match;
          if (subscript && subscript !== '[]') continue;
          names.add(name!);
        }
      }
      return [...names];
    };
    // The closure is computed from the artifact, not hand-listed: start at SaveFile, follow every declared
    // interface name found in each body, and stop when nothing new turns up.
    const seen = new Set<string>(['SaveFile']);
    const unresolved = new Set<string>();
    const queue = ['SaveFile'];
    while (queue.length > 0) {
      const name = queue.pop()!;
      for (const next of namedType(bodyOf(name))) {
        if (!typesSource.includes(`export interface ${next} `)) { unresolved.add(next); continue; }
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    const shape = [...seen].map((name) => `${name}\n${bodyOf(name)}`).join('\n');
    // `SerializedCurve` is reachable only by walking SaveFile → SerializedCinematic → the sequence → the
    // shot → the path, so its presence proves the walk went three hops rather than returning one name.
    expect([...seen].sort()).toContain('SerializedCurve');
    expect([...seen].sort(), `names in types.ts that the walk could not open: ${[...unresolved].join(', ')}`)
      .toEqual(['PersonalityTraits', 'PostProcessingConfig', 'PostProcessingPass', 'SaveFile', 'SerializedCinematic', 'SerializedCinematicSequence', 'SerializedCinematicShot', 'SerializedCurve', 'SerializedEntity', 'SerializedEntityComponent', 'SerializedEuler', 'SerializedNPC', 'SerializedPlayer', 'SerializedVector3']);
    expect(shape).not.toMatch(/:\s*Map</);
    expect(shape).not.toMatch(/THREE\./);
  });
});

/**
 * M5 v131 — the NPC half of the save. `SaveData.npcs` was declared in `types.ts` and backed by nothing: no
 * record, no writer, no reader — so the field sat in `blocked` with "implemented by nothing" beside it, and a
 * file could only ever omit it. This suite makes the RECORD real (attach/detach/read/audit), makes the SHAPE a
 * file (`npcSnapshot`/`restoreNPC`, no Map and no live object anywhere), and makes the FILE carry it, which is
 * what moves `npcs` across the line the other half of this file pins.
 */
describe('M5 v131 — an NPC record is a thing the runtime holds and files', () => {
  /** One entity at a position worth comparing, with a record attached the way a caller would. */
  function withNPC(options: NpcAttachOptions = {}): { npc: NPC } {
    withEntity(new THREE.Vector3(4, 5, 6));
    return { npc: runtime.attachNPC(scene, hero, options) };
  }

  it('attaches a record built from the entity and the declared defaults', () => {
    const { npc } = withNPC({ personality: { bravery: 0.9 }, reputation: { guild: 2 } });
    expect(npc.entityId).toBe(hero);
    // The name is READ off the entity rather than defaulted to a constant…
    expect(npc.name).toBe('Hero');
    expect(npc.archetype).toBe('villager');
    expect(npc.faction).toBe('neutral');
    expect(npc.wanderRadius).toBe(5);
    // …and the personality is the declared set with the caller's partial merged OVER it, not replaced by it.
    expect(npc.personality).toEqual({ aggression: 0.2, curiosity: 0.5, sociability: 0.5, bravery: 0.9, intelligence: 0.5, loyalty: 0.5 });
    expect([...npc.reputation]).toEqual([['guild', 2]]);
    expect(runtime.getNPC(hero)).toBe(npc);
  });

  it('reads home from where the entity STANDS, and copies it', () => {
    const { npc } = withNPC();
    expect([npc.homeLocation.x, npc.homeLocation.y, npc.homeLocation.z]).toEqual([4, 5, 6]);
    // Both directions, because one of them alone is satisfied by an alias: moving the body may not move the
    // home, and moving the home may not move the body.
    runtime.getEntity(scene, hero)!.threeObject.position.set(40, 50, 60);
    expect([npc.homeLocation.x, npc.homeLocation.y, npc.homeLocation.z]).toEqual([4, 5, 6]);
    npc.homeLocation.set(0, 0, 0);
    expect(runtime.getEntity(scene, hero)!.threeObject.position.toArray()).toEqual([40, 50, 60]);
  });

  it('refuses a second record, a missing scene and a missing entity, and a detach makes room again', () => {
    withNPC();
    expect(() => runtime.attachNPC(scene, hero)).toThrow(/already has an NPC record; detachNPC\(/);
    expect(() => runtime.attachNPC(sid('nowhere'), hero)).toThrow(/scene nowhere does not exist/);
    expect(() => runtime.attachNPC(scene, eid('ghost'))).toThrow(/entity ghost is not in scene/);
    expect(runtime.detachNPC(hero)).toBe(true);
    expect(runtime.getNPC(hero)).toBeUndefined();
    expect(runtime.detachNPC(hero), 'nothing there is an answer, not a failure').toBe(false);
    expect(() => runtime.attachNPC(scene, hero)).not.toThrow();
  });

  it('writes a standing, answers false with no record, and refuses one a file could not carry', () => {
    expect(runtime.setNPCReputation(hero, 'guild', 3)).toBe(false);
    withNPC();
    expect(runtime.setNPCReputation(hero, 'guild', 3)).toBe(true);
    expect(runtime.getNPC(hero)!.reputation.get('guild')).toBe(3);
    expect(() => runtime.setNPCReputation(hero, 'guild', Number.POSITIVE_INFINITY))
      .toThrow(/a save writes a non-finite number as null/);
    expect(runtime.getNPC(hero)!.reputation.get('guild'), 'the refusal left the standing alone').toBe(3);
  });

  it('a removed entity orphans its record and says so', () => {
    withNPC();
    const orphaned: { entityId: EntityId }[] = [];
    runtime.addEventListener('npcOrphaned', (data: unknown) => orphaned.push(data as { entityId: EntityId }));
    expect(runtime.removeEntity(scene, hero)).toBe(true);
    expect(orphaned).toEqual([{ entityId: hero }]);
    expect(runtime.getNPC(hero)).toBeUndefined();
    expect(runtime.removeEntity(scene, hero), 'no entity, no second orphan').toBe(false);
    expect(orphaned).toHaveLength(1);
  });

  it('npcSnapshot produces EXACTLY the fields SerializedNPC declares', () => {
    withNPC();
    // The guard the entity half has, one level down: the shape and the builder have to be the same SET, so a
    // field added to one side is a red test rather than a snapshot that quietly drops it.
    const declared = declaredFields('SerializedNPC');
    expect(Object.keys(runtime.npcSnapshot(scene, hero)).sort()).toEqual([...declared].sort());
    expect(declared.length, 'the parse found nothing, so the comparison above is vacuous').toBeGreaterThan(4);
  });

  it('the snapshot is data: no Map, no live object, and no alias back into the record', () => {
    withNPC({ reputation: { guild: 3 } });
    runtime.setNPCReputation(hero, 'thieves', 7);
    const snapshot = runtime.npcSnapshot(scene, hero);
    expect(snapshot.reputation, 'an entry array, sorted, not a Map').toEqual([['guild', 3], ['thieves', 7]]);
    expect(snapshot.homeLocation.constructor.name).toBe('Object');
    // A copy, not a window: mutating the snapshot may not move the record it came from.
    snapshot.name = 'Someone else';
    snapshot.personality.bravery = 0;
    expect(runtime.getNPC(hero)!.name).toBe('Hero');
    expect(runtime.getNPC(hero)!.personality.bravery).toBe(0.5);
    // And it survives the trip a file makes, which is the claim `savable` is making.
    expect(offenders(JSON.parse(JSON.stringify(snapshot)))).toEqual([]);
    // The control the empty list needs: the same walk over a record that still held its Map finds it.
    expect(offenders({ ...snapshot, reputation: new Map([['guild', 3]]) })).toEqual(['file.reputation: Map']);
  });

  it('npcFieldAudit names every declared NPC field the file shape does not carry', () => {
    withNPC();
    const audit = runtime.npcFieldAudit(hero)!;
    expect(audit.carried.sort()).toEqual(['archetype', 'entityId', 'faction', 'homeLocation', 'name', 'personality', 'reputation', 'wanderRadius']);
    // Derived from the LIVE record against the snapshot, so the list cannot go stale beside an implementation.
    expect(audit.untouched.map((entry) => entry.field)).toEqual(['currentTask', 'dialogueTree', 'inventory', 'quests', 'schedule']);
    for (const entry of audit.untouched) {
      expect(entry.needs.length, `${entry.field} must say what it is waiting on`).toBeGreaterThan(0);
    }
    expect(runtime.npcFieldAudit(eid('ghost'))).toBeUndefined();
  });

  it('every declared NPC field is either carried or named as a gap — read out of types.ts', () => {
    withNPC();
    const audit = runtime.npcFieldAudit(hero)!;
    const accounted = [...audit.carried, ...audit.untouched.map((entry) => entry.field)];
    expect(accounted.sort()).toEqual(declaredFields('NPC').sort());
    expect(new Set(accounted).size).toBe(accounted.length);
  });

  it('a record travels in the file, and a second runtime restores it whole', () => {
    const store = createMemorySaveStore();
    const writer = runtimeWithStore(store);
    const stage = writer.createScene('Stage').id;
    writer.setActiveScene(stage);
    const body = withEntityIn(writer, stage);
    writer.attachNPC(stage, body, {
      archetype: 'merchant',
      faction: 'guild',
      wanderRadius: 2.5,
      personality: { loyalty: 1 },
      reputation: { guild: 9 },
    });

    const written = writer.writeSaveFile('saves/npc.json', stage, 12);
    expect(written.npcs).toBe(1);
    expect(written.carries).toContain('npcs');
    const bytes = JSON.parse(store.read('saves/npc.json')!) as { npcs: [EntityId, unknown][] };
    expect(bytes.npcs.map(([id]) => id)).toEqual([body]);

    const reader = runtimeWithStore(store);
    reader.createScene('Again', stage);
    const read = reader.readSaveFile('saves/npc.json', stage);
    expect(read.npcs).toEqual([body]);
    const record = reader.getNPC(body)!;
    expect(record.archetype).toBe('merchant');
    expect(record.faction).toBe('guild');
    expect(record.wanderRadius).toBe(2.5);
    expect([record.homeLocation.x, record.homeLocation.y, record.homeLocation.z])
      .toEqual([...writer.getNPC(body)!.homeLocation.toArray()]);
    expect(record.personality.loyalty).toBe(1);
    // A live Map again on this side, holding the same standings — the entry array is the file's spelling,
    // not the record's.
    expect([...record.reputation]).toEqual([['guild', 9]]);
    // …and the record it restores is the shape npcSnapshot would write, so a second save is the same file.
    expect(reader.npcSnapshot(stage, body)).toEqual(writer.npcSnapshot(stage, body));
    writer.dispose();
    reader.dispose();
  });

  it('refuses records that do not fit the bodies the file carries, before anything is loaded', () => {
    withEntity();
    // A scene with no records still writes the list: `npcs: []` is a claim about the file, and the field is
    // never left out for a caller to guess at.
    expect(runtime.buildSaveFile(scene, 1).npcs).toEqual([]);
    runtime.attachNPC(scene, hero, { name: 'Hero' });
    const good = runtime.buildSaveFile(scene, 2);
    expect(good.npcs.map(([id]) => id)).toEqual([hero]);
    const record = good.npcs[0]![1];

    // A record whose body is already somebody's, in another scene: the file's entity list passes (that id is
    // not in this scene), and the record check is the one that refuses.
    const elsewhere = runtime.createScene('Elsewhere').id;
    expect(() => runtime.loadSaveFile(good, elsewhere))
      .toThrow(/entity .* already has an NPC record; a restore never overwrites live state/);

    // The other two refusals need a scene that does NOT already hold the body, or the entity collision would
    // answer first and the record checks would never run.
    const loader = freshWorld();
    loader.createScene('Copy', scene);
    const misKeyed = { ...good, npcs: [[eid('other'), record]] } as typeof good;
    expect(() => loader.loadSaveFile(misKeyed, scene))
      .toThrow(new RegExp(`npcs\\[0\\] is keyed other but the record under it says ${hero};`));
    const foreign = { ...good, npcs: [[eid('other'), { ...record, entityId: eid('other') }]] } as typeof good;
    expect(() => loader.loadSaveFile(foreign, scene))
      .toThrow(/NPC other \(npcs\[0\]\) is not among the entities this file carries/);
    expect(loader.getScene(scene)!.entities.size, 'every refusal landed before the first restore').toBe(0);
    loader.dispose();
  });

  it('refuses a pair whose two halves are different records, and one that is not a pair at all', () => {
    withEntity();
    runtime.attachNPC(scene, hero);
    const file = runtime.buildSaveFile(scene, 1);
    // Into a scene that does NOT already hold the body: the entity collision is checked first and would
    // answer before the pair checks got a turn.
    const loader = freshWorld();
    loader.createScene('Copy', scene);
    const halfPair = { ...file, npcs: [[hero]] } as unknown as typeof file;
    expect(() => loader.loadSaveFile(halfPair, scene))
      .toThrow(/npcs\[0\] is an array of 1, not an \[id, record\] pair/);
    const notPairs = { ...file, npcs: {} } as unknown as typeof file;
    expect(() => loader.loadSaveFile(notPairs, scene)).toThrow(/npcs is object, not an array/);
    loader.dispose();
  });

  it('an OLD file carries no npc list, and the file\'s own claim is what decides how that reads', () => {
    const store = createMemorySaveStore();
    const writer = runtimeWithStore(store);
    const stage = writer.createScene('Stage').id;
    writer.setActiveScene(stage);
    const body = withEntityIn(writer, stage);
    writer.attachNPC(stage, body, { name: 'Keeper' });
    writer.writeSaveFile('saves/old.json', stage, 1);
    const written = JSON.parse(store.read('saves/old.json')!) as Record<string, unknown>;

    // A file from before this half existed: the npc list is simply absent…
    const old = { ...written };
    delete old.npcs;
    old.carries = ['entities', 'cinematic'];
    store.write('saves/legacy.json', JSON.stringify(old));
    const reader = runtimeWithStore(store);
    reader.createScene('Again', stage);
    const report = reader.readSaveFile('saves/legacy.json', stage);
    expect(report.npcs, 'a file that does not claim the records is read as carrying none').toEqual([]);
    expect(reader.getScene(stage)!.entities.size).toBe(1);
    // …and the diagnosis said this file was loadable, which is the claim the load has to agree with.
    expect(reader.diagnoseSaveFile('saves/legacy.json').loadable).toBe(true);
    expect(reader.diagnoseSaveFile('saves/legacy.json').readableNowButNotCarried).toEqual(['npcs', 'worldState', 'player']);

    // The other direction: a file that SAYS it carries npcs owes a list, and omitting one is refused.
    store.write('saves/liar.json', JSON.stringify({ ...old, carries: ['entities', 'cinematic', 'npcs'] }));
    const second = runtimeWithStore(store);
    second.createScene('Copy', stage);
    expect(() => second.readSaveFile('saves/liar.json', stage))
      .toThrow(/npcs is undefined, not an array of \[id, record\] pairs — and the file CLAIMS to carry npcs/);
    writer.dispose();
    reader.dispose();
    second.dispose();
  });

  it('restoreNPC refuses a body that is not there, and a reputation that arrived as a Map', () => {
    withEntity();
    const snapshot: SerializedNPC = {
      entityId: hero,
      name: 'Hero',
      archetype: 'villager',
      personality: { aggression: 0.2, curiosity: 0.5, sociability: 0.5, bravery: 0.5, intelligence: 0.5, loyalty: 0.5 },
      homeLocation: { x: 1, y: 2, z: 3 },
      wanderRadius: 5,
      faction: 'neutral',
      reputation: [['guild', 1]],
    };
    expect(() => runtime.restoreNPC(sid('nowhere'), snapshot)).toThrow(/scene nowhere does not exist/);
    expect(() => runtime.restoreNPC(scene, { ...snapshot, entityId: eid('ghost') })).toThrow(/entity ghost is not in scene/);
    expect(runtime.restoreNPC(scene, snapshot).name).toBe('Hero');
    expect(() => runtime.restoreNPC(scene, snapshot)).toThrow(/already has an NPC record/);
    runtime.detachNPC(hero);
    const asMap = { ...snapshot, reputation: new Map([['guild', 1]]) } as unknown as typeof snapshot;
    expect(() => runtime.restoreNPC(scene, asMap)).toThrow(/reputation arrived as a Map/);
    const notFinite = { ...snapshot, reputation: [['guild', Number.NaN]] } as typeof snapshot;
    expect(() => runtime.restoreNPC(scene, notFinite)).toThrow(/reputation\[0\] \("guild"\) is NaN/);
  });

  it('a load that fails on the SECOND record takes the entities and the first record back too', () => {
    const store = createMemorySaveStore();
    const writer = runtimeWithStore(store);
    const stage = writer.createScene('Stage').id;
    writer.setActiveScene(stage);
    const one = withEntityIn(writer, stage);
    const two = writer.createEntity(stage, 'Second', 'mesh').id;
    writer.attachNPC(stage, one, { name: 'One' });
    writer.attachNPC(stage, two, { name: 'Two' });
    writer.writeSaveFile('saves/two.json', stage, 1);
    const file = JSON.parse(store.read('saves/two.json')!) as { npcs: [EntityId, { homeLocation: Record<string, number> }][] };
    // The second record is well-formed enough to pass `assertDiskSafe` and reach the restore, and breaks inside
    // it — a MISSING coordinate, not a non-finite one, because `assertDiskSafe` refuses a NaN before any half
    // runs and this case is about the half that does run.
    delete file.npcs[1]![1].homeLocation.y;

    const reader = runtimeWithStore(store);
    reader.createScene('Copy', stage);
    expect(() => reader.loadSaveFile(file as never, stage))
      .toThrow(/restoreNPC: homeLocation y is undefined[\s\S]*the 2 entity\(ies\), the 1 NPC record\(s\), the 0 world-state key\(s\) and the 0 sequence\(s\) this load had registered were removed again; a load is all or nothing/);
    expect(reader.getScene(stage)!.entities.size, 'a refused load leaves no bodies behind').toBe(0);
    expect(reader.getNPC(one)).toBeUndefined();
    expect(reader.getNPC(two)).toBeUndefined();
    writer.dispose();
    reader.dispose();
  });
});

/**
 * M5 v133 — the world-state bag is held, checked and filed.
 *
 * `SaveData.worldState` was declared as `Record<string, unknown>` and backed by nothing, so it sat in
 * `SAVE_DATA_FEASIBILITY.blocked` with "the runtime keeps no world-state store" written beside it. What a bag
 * needs that a CLOSED record does not is a rule for values nobody declared — and the rule has to hold at the
 * SET, not when a save is built, because by then the caller has already stored something this runtime could
 * never restore. Two of the refusals are ones a plain validator cannot express: `undefined`, which
 * `JSON.stringify` writes as no key at all, and a value that contains itself, which `JSON.stringify` refuses
 * to write and a walk with no path stack would hang on.
 */
describe('M5 v133 — the world-state bag is held, checked and filed', () => {
  it('sets, reads and forgets a key, and answers a removal rather than assuming one', () => {
    runtime.setWorldState(scene, 'gate-open', true);
    runtime.setWorldState(scene, 'visits', 3);
    expect(runtime.getWorldState(scene, 'gate-open')).toBe(true);
    expect(runtime.getWorldState(scene, 'visits')).toBe(3);
    expect(runtime.getWorldStateKeys(scene)).toEqual(['gate-open', 'visits']);
    expect(runtime.getWorldState(scene, 'never-set')).toBeUndefined();
    expect(runtime.deleteWorldState(scene, 'gate-open')).toBe(true);
    expect(runtime.deleteWorldState(scene, 'gate-open'), 'a second removal is an answer, not a failure').toBe(false);
    expect(runtime.getWorldStateKeys(scene)).toEqual(['visits']);
  });

  it('refuses a value a file could not hold, at the set rather than at the write', () => {
    // Every one of these is something `JSON.stringify` flattens, drops or writes as null. Storing one would
    // leave the runtime holding a value it could never restore, and refusing LATER — at `buildSaveFile` —
    // would be refusing after the caller had already put the value in.
    expect(() => runtime.setWorldState(scene, 'bag', new Map([['a', 1]])))
      .toThrow(/setWorldState: worldState\.bag holds a Map, which JSON\.stringify writes as \{\}/);
    expect(() => runtime.setWorldState(scene, 'when', Number.NaN))
      .toThrow(/setWorldState: worldState\.when holds NaN, which JSON writes as null/);
    expect(() => runtime.setWorldState(scene, 'body', new THREE.Vector3(1, 2, 3)))
      .toThrow(/setWorldState: worldState\.body holds a Vector3 instance, not plain data/);
    expect(() => runtime.setWorldState(scene, 'fn', () => 1))
      .toThrow(/setWorldState: worldState\.fn holds function, which a file cannot hold at all/);
    expect(() => runtime.setWorldState(scene, 'gone', undefined))
      .toThrow(/setWorldState: worldState\.gone is undefined; JSON\.stringify writes a key whose value is undefined as no key at all/);
    // Nested, because a bag holds trees: the path is named rather than the top-level key alone.
    expect(() => runtime.setWorldState(scene, 'deep', { a: [{ b: new Set([1]) }] }))
      .toThrow(/setWorldState: worldState\.deep\.a\[0\]\.b holds a Set/);
    // A value that contains itself is refused here rather than discovered by `JSON.stringify` at write time
    // — and rather than hanging a walk, which is what the recursion would do without a path stack.
    const cycle: Record<string, unknown> = { name: 'loop' };
    cycle.self = cycle;
    expect(() => runtime.setWorldState(scene, 'cycle', cycle))
      .toThrow(/setWorldState: worldState\.cycle\.self contains itself/);
    expect(runtime.getWorldStateKeys(scene), 'a refused value stored nothing').toEqual([]);
  });

  it('refuses a key with no name, and a scene that is not there', () => {
    expect(() => runtime.setWorldState(scene, '', 1)).toThrow(/the key is ; world state is addressed by name/);
    expect(() => runtime.setWorldState(sid('nowhere'), 'k', 1)).toThrow(/setWorldState: scene nowhere does not exist/);
    expect(() => runtime.worldStateSnapshot(sid('nowhere'))).toThrow(/worldStateSnapshot: scene nowhere does not exist/);
    expect(() => runtime.restoreWorldState(sid('nowhere'), {})).toThrow(/restoreWorldState: scene nowhere does not exist/);
    expect(runtime.worldStateFieldAudit(sid('nowhere'))).toBeUndefined();
    // `restoreWorldState` is a public door as well as the loader's half, so it checks its own argument.
    expect(() => runtime.restoreWorldState(scene, ['visits', 3] as never))
      .toThrow(/restoreWorldState: worldState is an array, not the bag of named values a file writes/);
  });

  it('the snapshot is data — sorted, deep-copied, and a shared branch copied twice rather than mistaken for a cycle', () => {
    const shared = { seen: ['harbour'] };
    runtime.setWorldState(scene, 'zeta', 1);
    runtime.setWorldState(scene, 'alpha', { left: shared, right: shared, flags: ['a', 'b'] });
    const snapshot = runtime.worldStateSnapshot(scene);
    expect(Object.keys(snapshot)).toEqual(['alpha', 'zeta']);
    expect(offenders(snapshot, 'worldState')).toEqual([]);
    // A caller mutating what they handed over cannot move the scene's state…
    shared.seen.push('tower');
    expect(runtime.getWorldState(scene, 'alpha'))
      .toEqual({ left: { seen: ['harbour'] }, right: { seen: ['harbour'] }, flags: ['a', 'b'] });
    // …and mutating what the runtime handed BACK cannot either, on the snapshot or on a plain read.
    (snapshot.alpha as { flags: string[] }).flags.push('c');
    (runtime.getWorldState(scene, 'alpha') as { flags: string[] }).flags.push('d');
    expect(runtime.getWorldState(scene, 'alpha'))
      .toEqual({ left: { seen: ['harbour'] }, right: { seen: ['harbour'] }, flags: ['a', 'b'] });
    // Two branches sharing ONE object is not a cycle: a file has no identity to share, so it is written
    // twice — and the copies must be independent, which is what proves the second visit was not read as the
    // value containing itself.
    (runtime.getWorldState(scene, 'alpha') as { left: { seen: string[] } }).left.seen.push('deep');
    expect((runtime.getWorldState(scene, 'alpha') as { right: { seen: string[] } }).right.seen).toEqual(['harbour']);
  });

  it('the file carries the bag, and a second runtime restores the same facts', () => {
    const store = createMemorySaveStore();
    const writer = runtimeWithStore(store);
    const world = writer.createScene('World').id;
    writer.setActiveScene(world);
    withEntityIn(writer, world);
    writer.setWorldState(world, 'visits', 3);
    writer.setWorldState(world, 'gate-open', true);
    writer.setWorldState(world, 'journal', { seen: ['harbour', 'tower'] });

    const written = writer.writeSaveFile('saves/world.json', world, 1700000000000);
    expect(written.worldState).toBe(3);
    expect(written.carries).toContain('worldState');
    // Sorted, so the same bag writes the same bytes twice rather than in whatever order it was set.
    expect((JSON.parse(store.read('saves/world.json')!) as { worldState: unknown }).worldState)
      .toEqual({ 'gate-open': true, journal: { seen: ['harbour', 'tower'] }, visits: 3 });

    const reader = runtimeWithStore(store);
    reader.createScene('World again', world);
    reader.setActiveScene(world);
    const report = reader.readSaveFile('saves/world.json', world);
    expect(report.worldState).toEqual(['gate-open', 'journal', 'visits']);
    expect(reader.getWorldState(world, 'journal')).toEqual({ seen: ['harbour', 'tower'] });
    expect(reader.getWorldStateKeys(world)).toEqual(['gate-open', 'journal', 'visits']);
    writer.dispose();
    reader.dispose();
  });

  it('a scene with no world state writes an empty bag, not an absent field', () => {
    const store = createMemorySaveStore();
    const rt = runtimeWithStore(store);
    const world = rt.createScene('World').id;
    rt.setActiveScene(world);
    withEntityIn(rt, world);

    const file = rt.buildSaveFile(world, 1700000000000);
    expect(file.worldState).toEqual({});
    // The distinction that matters: `carries` names it, so OMITTING it would be a claim the file could not
    // back up — which the loader refuses. An empty bag is a claim about the file, not about the scene.
    expect(file.carries).toContain('worldState');
    rt.dispose();
  });

  it('world state is scoped to the scene that set it', () => {
    const other = runtime.createScene('Other').id;
    runtime.setWorldState(scene, 'here', 1);
    runtime.setWorldState(other, 'there', 2);
    // Two keys per scene, because the invariant has two halves and one write tests only the cheaper one: a
    // setter that builds a FRESH bag on every call still keeps each scene's facts apart, and still loses
    // everything that scene said before. `getWorldStateKeys` is the answer that says which half broke.
    runtime.setWorldState(scene, 'also', 11);
    runtime.setWorldState(other, 'also', 22);
    expect(runtime.getWorldStateKeys(scene)).toEqual(['also', 'here']);
    expect(runtime.getWorldStateKeys(other)).toEqual(['also', 'there']);
    expect(runtime.worldStateSnapshot(scene)).toEqual({ also: 11, here: 1 });
    expect(runtime.worldStateSnapshot(other)).toEqual({ also: 22, there: 2 });
    withEntity();
    expect(runtime.buildSaveFile(scene, 1700000000000).worldState, 'a file carries only its own scene').toEqual({ also: 11, here: 1 });
  });

  it('refuses to load a bag into a scene that already holds one, before anything runs', () => {
    const store = createMemorySaveStore();
    const writer = runtimeWithStore(store);
    const world = writer.createScene('World').id;
    writer.setActiveScene(world);
    withEntityIn(writer, world);
    writer.setWorldState(world, 'visits', 3);
    const file = writer.buildSaveFile(world, 1700000000000);

    const reader = runtimeWithStore(store);
    reader.createScene('World again', world);
    reader.setActiveScene(world);
    reader.setWorldState(world, 'already', true);
    expect(() => reader.loadSaveFile(file, world))
      .toThrow(/already holds world state \(already\); a load replaces the bag whole/);
    // Pre-checked, so the entities the file carried were never restored either — and what the scene held is
    // still exactly what it held.
    expect(reader.getScene(world)!.entities.size, 'a refused load leaves no bodies behind').toBe(0);
    expect(reader.getWorldState(world, 'already')).toBe(true);
    writer.dispose();
    reader.dispose();
  });

  it("an OLD file carries no bag, and the file's own claim is what decides how that reads", () => {
    const store = createMemorySaveStore();
    const writer = runtimeWithStore(store);
    const world = writer.createScene('World').id;
    writer.setActiveScene(world);
    withEntityIn(writer, world);
    writer.setWorldState(world, 'visits', 3);
    writer.writeSaveFile('saves/current.json', world, 1700000000000);

    const legacy = JSON.parse(store.read('saves/current.json')!) as Record<string, unknown>;
    legacy.carries = ['entities', 'cinematic', 'npcs'];
    delete legacy.worldState;
    store.write('saves/legacy.json', JSON.stringify(legacy));

    const reader = runtimeWithStore(store);
    reader.createScene('Copy', world);
    reader.setActiveScene(world);
    const report = reader.readSaveFile('saves/legacy.json', world);
    expect(report.worldState, 'a file that does not claim the bag carries none').toEqual([]);
    expect(reader.getWorldStateKeys(world), 'and the load sets nothing rather than clearing the world').toEqual([]);
    // The diagnosis has to agree with the load: readable here, simply not carried by that file.
    expect(reader.diagnoseSaveFile('saves/legacy.json').readableNowButNotCarried).toEqual(['worldState', 'player']);

    // The other direction: a file that SAYS it carries the bag owes one, and omitting it is refused.
    store.write('saves/liar.json', JSON.stringify({ ...legacy, carries: ['entities', 'cinematic', 'npcs', 'worldState'] }));
    const other = runtimeWithStore(store);
    other.createScene('Copy again', world);
    other.setActiveScene(world);
    expect(() => other.readSaveFile('saves/liar.json', world))
      .toThrow(/worldState is missing, not the bag of named values a file writes — and the file CLAIMS to carry worldState, so a bag is owed rather than optional/);
    writer.dispose();
    reader.dispose();
    other.dispose();
  });

  it('refuses a bag that is not a bag, or that hides a value a file cannot hold', () => {
    const store = createMemorySaveStore();
    const writer = runtimeWithStore(store);
    const world = writer.createScene('World').id;
    writer.setActiveScene(world);
    withEntityIn(writer, world);
    const file = writer.buildSaveFile(world, 1700000000000) as unknown as Record<string, unknown>;
    store.write('saves/array.json', JSON.stringify({ ...file, worldState: ['visits', 3] }));

    const reader = runtimeWithStore(store);
    reader.createScene('Copy', world);
    reader.setActiveScene(world);
    expect(() => reader.readSaveFile('saves/array.json', world))
      .toThrow(/worldState is an array, not the bag of named values a file writes/);
    expect(reader.getWorldStateKeys(world), 'a refused file set nothing').toEqual([]);

    // An `undefined` VALUE cannot survive a JSON trip at all — `JSON.stringify` drops the key — so it is
    // refused as data rather than loaded as a bag one key shorter than the one that was written.
    expect(() => runtime.loadSaveFile({ ...file, worldState: { gone: undefined } } as never, scene))
      .toThrow(/loadSaveFile: file\.worldState\.gone is undefined/);
    // A live object smuggled in is refused by name, one level below the setter that would have stopped it —
    // and the refusal wears the FILE walker's name rather than this half's, because `assertDiskSafe(file)`
    // reaches it first: the per-key check above exists for what that walker deliberately allows (`undefined`,
    // which is legal for an optional field), not to restate what it already refuses.
    expect(() => runtime.loadSaveFile({ ...file, worldState: { body: new THREE.Vector3(1, 2, 3) } } as never, scene))
      .toThrow(/saveFile: file\.worldState\.body holds a Vector3 instance, not plain data/);
    // And content under a name that is STILL blocked is refused exactly as it was before this half.
    expect(() => runtime.loadSaveFile({ ...file, quests: [['q-1', {}]] } as never, scene))
      .toThrow(/content under "quests"/);
    writer.dispose();
    reader.dispose();
  });

  it('a load that fails on the entity half leaves no world state behind, because the bag goes last', () => {
    const store = createMemorySaveStore();
    const writer = runtimeWithStore(store);
    const world = writer.createScene('World').id;
    writer.setActiveScene(world);
    withEntityIn(writer, world);
    writer.setWorldState(world, 'visits', 3);
    // A file whose entity half is broken the way a hand-edited save breaks: the bag is perfectly good, and
    // the load must still leave the scene with neither.
    const file = structuredClone(writer.buildSaveFile(world, 1700000000000)) as unknown as {
      entities: [EntityId, { position: { x?: number } }][];
      worldState: Record<string, unknown>;
    };
    file.entities[0]![1].position.x = undefined;

    const reader = runtimeWithStore(store);
    reader.createScene('World again', world);
    reader.setActiveScene(world);
    expect(() => reader.loadSaveFile(file as never, world)).toThrow(/position x is undefined/);
    expect(reader.getScene(world)!.entities.size).toBe(0);
    expect(reader.getWorldStateKeys(world), 'the bag is applied after the halves that can fail').toEqual([]);
    writer.dispose();
    reader.dispose();
  });

  it('the audit names the keys the scene holds and the names this package refuses to keep', () => {
    const audit = runtime.worldStateFieldAudit(scene)!;
    expect(audit.carried).toEqual([]);
    // The order is alphabetical because v135 derives this list from the same `REFUSALS` table the NPC record
    // and the save file read, and one table cannot honour the three orders the three accounts were typed in
    // (the NPC account put `inventory` before `quests`, this one put it after). `refusalCensus` is the reader
    // that says WHICH accounts refuse a name; the sorted order is what makes each account's own list stable.
    expect(audit.untouched.map((entry) => entry.field)).toEqual(['entities', 'inventory', 'player', 'quests']);
    for (const entry of audit.untouched) expect(entry.needs.length, `${entry.field} must say WHY it is not kept`).toBeGreaterThan(0);
    // A name that gets carried stops being reported as a gap, so the two lists cannot disagree about it.
    runtime.setWorldState(scene, 'quests', 'not a quest system — a caller-named fact under that name');
    expect(runtime.worldStateFieldAudit(scene)!.carried).toEqual(['quests']);
    expect(runtime.worldStateFieldAudit(scene)!.untouched.map((entry) => entry.field)).toEqual(['entities', 'inventory', 'player']);
  });
});

/**
 * M5 v122 — the store learns to take a save back. v120 shipped `write`/`read`/`exists` and its own record said
 * the seam "has no delete, no list and no atomic rename"; v121 removed the last reason a delete would be unsafe
 * (a load is now reversible end to end, so a save file is the only thing left that can outlive a decision).
 * The two decisions worth pinning are the shape of a no-op and the honesty of a missing capability.
 */
describe('deleteSaveFile: a save can be taken back, and a store that cannot says so', () => {
  /** A scene with one entity, written to a path, in a runtime that has a store. */
  function written(path = 'saves/one.json') {
    const store = createMemorySaveStore();
    const rt = runtimeWithStore(store);
    const sceneId = rt.createScene('World').id;
    rt.setActiveScene(sceneId);
    withEntityIn(rt, sceneId);
    rt.writeSaveFile(path, sceneId, 1);
    return { store, rt, sceneId, path };
  }

  it('deleting a written save makes the next read say there is no file at that path', () => {
    const { store, rt, path } = written();
    expect(store.exists(path)).toBe(true);
    const deleted: object[] = [];
    rt.addEventListener('saveFileDeleted', (d: object) => deleted.push(d));
    expect(rt.deleteSaveFile(path)).toEqual({ path, store: 'memory', removed: true });
    expect(deleted).toEqual([{ path, store: 'memory', removed: true }]);
    expect(store.exists(path)).toBe(false);
    // The two methods have to agree: a delete the reader does not honour is a delete that did not happen.
    expect(() => rt.readSaveFile(path, 'anything' as SceneId)).toThrow(/no save file at "saves\/one.json" in the memory store/);
    rt.dispose();
  });

  it('a path that held nothing answers removed:false, and leaves the other saves alone', () => {
    const { store, rt, path } = written();
    store.write('saves/other.json', '{}');
    expect(rt.deleteSaveFile('saves/ghost.json')).toEqual({ path: 'saves/ghost.json', store: 'memory', removed: false });
    expect(store.read('saves/other.json')).toBe('{}');
    expect(store.exists(path), 'a no-op delete removed nothing else').toBe(true);
    rt.dispose();
  });

  it('an injected fs with no unlinkSync refuses the delete instead of reporting one that never happened', () => {
    const files = new Map<string, string>([['saves/root/saves/two.json', '{}']]);
    const host: FsLike = {
      writeFileSync: (p, data) => { files.set(p, data); },
      readFileSync: (p) => files.get(p) ?? '',
      existsSync: (p) => files.has(p),
    };
    const fsStore = createFsSaveStore(host, 'saves/root');
    expect(fsStore.read('saves/two.json')).toBe('{}');
    expect(() => fsStore.delete('saves/two.json')).toThrow(/injected fs has no unlinkSync/);
    expect(fsStore.read('saves/two.json'), 'a refused delete changed nothing').toBe('{}');
  });

  it('a host that can delete removes the joined path, and an escaping name is refused before it is touched', () => {
    const unlinked: string[] = [];
    const files = new Map<string, string>([['saves/root/saves/three.json', '{}']]);
    const host: FsLike = {
      writeFileSync: (p, data) => { files.set(p, data); },
      readFileSync: (p) => files.get(p) ?? '',
      existsSync: (p) => files.has(p),
      unlinkSync: (p) => { unlinked.push(p); files.delete(p); },
    };
    const fsStore = createFsSaveStore(host, 'saves/root/');
    expect(fsStore.delete('saves/three.json')).toBe(true);
    expect(unlinked).toEqual(['saves/root/saves/three.json']);
    expect(fsStore.delete('saves/three.json'), 'a second delete is a no-op, not an error').toBe(false);
    expect(() => fsStore.delete('../outside.json')).toThrow(/saveStore:/);
    expect(unlinked, 'a refused path never reached the host').toEqual(['saves/root/saves/three.json']);
  });

  it('a runtime with no store refuses to delete, and a delete never disturbs the live scene', () => {
    expect(() => runtime.deleteSaveFile('saves/x.json')).toThrow(/has no SaveStore/);
    const { rt, sceneId } = written();
    expect(rt.deleteSaveFile('saves/one.json').removed).toBe(true);
    expect(rt.getScene(sceneId)!.entities.size, 'taking back the file is not taking back the game').toBe(1);
    rt.dispose();
  });
});

/**
 * M5 v123 — the last of the three gaps v120 wrote into its own record: the store could write, read and (in
 * v122) delete, but it could not say what it held, so there was no menu and no "continue". Two rules carry the
 * grant: a listing is names only (reading bytes to build a menu is the wrong cost), and a missing capability is
 * refused rather than answered with an empty list, because `[]` is a claim about the world.
 */
describe('listSaveFiles / latestSaveFile: the store says what it holds', () => {
  /** A fake fs over an in-memory tree, with the browsing methods optional so both cases can be built. */
  function fakeHost(options: { browse?: boolean } = {}) {
    const tree = new Map<string, string>([['a.json', '{}']]);
    const dirs = new Set<string>(['saves', 'saves/old']);
    for (const dir of ['saves/root', 'saves/root/old']) dirs.add(dir);
    const reads: string[] = [];
    const host: FsLike = {
      writeFileSync: (p, data) => { tree.set(p, data); },
      readFileSync: (p) => { reads.push(p); return tree.get(p) ?? ''; },
      existsSync: (p) => tree.has(p) || dirs.has(p),
    };
    if (options.browse !== false) {
      host.readdirSync = (p) => [...tree.keys()].filter((k) => k.startsWith(`${p}/`)).map((k) => k.slice(p.length + 1).split('/')[0]!).filter((v, i, a) => a.indexOf(v) === i);
      host.statSync = (p) => ({ isDirectory: () => dirs.has(p), isFile: () => tree.has(p) });
    }
    return { host, tree, dirs, reads };
  }

  const save = (savedAt: number, over: Record<string, unknown> = {}) => JSON.stringify({
    format: 'nexus-three-runtime-save', version: 1, savedAt, carries: ['entities', 'cinematic'],
    doesNotCarry: [], entities: [], cinematic: { sequences: [], activeSequence: null, currentTime: 0 }, ...over,
  });

  it('an empty store lists [] and a filled one lists names, sorted and relative', () => {
    const empty = createMemorySaveStore();
    expect(empty.list()).toEqual([]);
    empty.write('saves/b.json', '{}');
    empty.write('saves/a.json', '{}');
    empty.write('deep/c.json', '{}');
    expect(empty.list()).toEqual(['deep/c.json', 'saves/a.json', 'saves/b.json']);
  });

  it('a host with no browsing refuses to list, and the refusal reaches the runtime intact', () => {
    const { host } = fakeHost({ browse: false });
    const store = createFsSaveStore(host, 'saves/root');
    expect(() => store.list()).toThrow(/needs BOTH readdirSync and statSync/);
    const rt = runtimeWithStore(store);
    expect(() => rt.listSaveFiles()).toThrow(/needs BOTH readdirSync and statSync/);
    expect(() => rt.latestSaveFile()).toThrow(/needs BOTH readdirSync and statSync/);
    rt.dispose();
  });

  it('a root that does not exist yet is an empty listing, not an error', () => {
    const { host } = fakeHost();
    const store = createFsSaveStore(host, 'nowhere');
    expect(store.list()).toEqual([]);
    expect(runtimeWithStore(store).listSaveFiles()).toEqual({ store: 'fs', paths: [], refused: [] });
  });

  it('listing reads names only — no file is opened to build the menu', () => {
    const { host, tree, reads } = fakeHost();
    tree.set('saves/root/one.json', save(5));
    tree.set('saves/root/two.json', save(9));
    const rt = runtimeWithStore(createFsSaveStore(host, 'saves/root/'));
    expect(rt.listSaveFiles().paths).toEqual(['one.json', 'two.json']);
    expect(reads, 'a listing that cost O(total bytes) is the wrong seam').toEqual([]);
    rt.dispose();
  });

  it('latest is the greatest savedAt the FILES claim, ties broken by path and counted', () => {
    const store = createMemorySaveStore();
    store.write('saves/early.json', save(100));
    store.write('saves/late.json', save(200));
    const rt = runtimeWithStore(store);
    expect(rt.latestSaveFile()).toMatchObject({ path: 'saves/late.json', savedAt: 200, ties: 1, unreadable: [] });
    store.write('saves/also-late.json', save(200));
    expect(rt.latestSaveFile()).toMatchObject({ path: 'saves/also-late.json', savedAt: 200, ties: 2 });
    expect(rt.deleteSaveFile('saves/late.json').removed).toBe(true);
    expect(rt.latestSaveFile()!.ties, 'the tie was the two that shared the stamp; one of them is gone now').toBe(1);
    rt.dispose();
  });

  it('a save the runtime cannot understand is reported, never silently skipped or fatal', () => {
    const store = createMemorySaveStore();
    store.write('saves/good.json', save(50));
    store.write('saves/corrupt.json', '{"format":');
    store.write('saves/array.json', '[]');
    store.write('saves/foreign.json', save(60, { format: 'other-game-save' }));
    store.write('saves/newer.json', save(70, { version: 2 }));
    store.write('saves/nostamp.json', save('yesterday' as unknown as number));
    const rt = runtimeWithStore(store);
    const latest = rt.latestSaveFile()!;
    expect(latest.path).toBe('saves/good.json');
    expect(latest.unreadable.map((entry) => entry.path)).toEqual([
      'saves/array.json', 'saves/corrupt.json', 'saves/foreign.json', 'saves/newer.json', 'saves/nostamp.json',
    ]);
    expect(latest.unreadable.map((entry) => entry.why).join(' |')).toMatch(/an array rather than a save object/);
    expect(latest.unreadable.map((entry) => entry.why).join(' |')).toMatch(/not valid JSON/);
    expect(latest.unreadable.map((entry) => entry.why).join(' |')).toMatch(/format is other-game-save, not nexus-three-runtime-save/);
    expect(latest.unreadable.map((entry) => entry.why).join(' |')).toMatch(/version is 2, and this runtime reads exactly 1/);
    expect(latest.unreadable.map((entry) => entry.why).join(' |')).toMatch(/savedAt is yesterday, which is not a finite number/);
    rt.dispose();
  });

  it('nothing readable is null, and a runtime with no store refuses to answer at all', () => {
    const store = createMemorySaveStore();
    store.write('saves/junk.json', 'not json at all');
    const rt = runtimeWithStore(store);
    expect(rt.latestSaveFile()).toBe(null);
    expect(rt.listSaveFiles().paths).toEqual(['saves/junk.json']);
    expect(() => runtime.latestSaveFile()).toThrow(/has no SaveStore/);
    expect(() => runtime.listSaveFiles()).toThrow(/has no SaveStore/);
    rt.dispose();
  });
});

/**
 * M5 v124 — the last gap v120 wrote into its own record: "no atomic rename, so a half-written file is listed
 * as unreadable and never repaired". Refusing a broken save is honest, but a save screen that shows "unreadable"
 * for the file the player just wrote is a lost game. The write now goes temp-then-rename, the capability is
 * asked for before any byte moves, and a failure is reported with whatever debris it left.
 */
describe('atomic save writes: a reader sees the old save or the new one, never a piece of each', () => {
  /** A recording fs host whose rename can be made to fail, with an optional failing unlink. */
  function renameHost(options: { failRename?: boolean; failUnlink?: boolean; canRename?: boolean; flush?: boolean; failFlush?: boolean } = {}) {
    const tree = new Map<string, string>();
    const ops: string[] = [];
    const host: FsLike = {
      writeFileSync: (p, data) => { ops.push(`write:${p}`); tree.set(p, data); },
      readFileSync: (p) => tree.get(p) ?? '',
      existsSync: (p) => tree.has(p) || p === 'saves/root',
    };
    if (options.canRename !== false) {
      host.renameSync = (from, to) => {
        ops.push(`rename:${from}->${to}`);
        if (options.failRename) throw new Error('EBUSY: resource busy or locked');
        tree.set(to, tree.get(from) ?? '');
        tree.delete(from);
      };
    }
    host.unlinkSync = (p) => {
      ops.push(`unlink:${p}`);
      if (options.failUnlink) throw new Error('EBUSY: cannot remove');
      tree.delete(p);
    };
    if (options.flush) {
      host.flushSync = (p) => {
        ops.push(`flush:${p}`);
        if (options.failFlush) throw new Error('EIO: input/output error');
      };
    }
    // The browse capability, so `list()` can be asserted on the same host the rename is asserted against.
    host.readdirSync = (p) => [...new Set(
      [...tree.keys()].filter((k) => k.startsWith(`${p}/`)).map((k) => k.slice(p.length + 1).split('/')[0]!),
    )];
    host.statSync = (p) => ({
      isDirectory: () => p === 'saves/root' || [...tree.keys()].some((k) => k.startsWith(`${p}/`)),
      isFile: () => tree.has(p),
    });
    return { host, tree, ops };
  }

  it('a save reaches the host as one temp write and a rename, and nothing is left behind', () => {
    const { host, ops } = renameHost();
    const store = createFsSaveStore(host, 'saves/root');
    store.writeAtomic('x.json', '{"savedAt":1}');
    expect(ops).toEqual(['write:saves/root/x.json.tmp', 'rename:saves/root/x.json.tmp->saves/root/x.json']);
    expect(store.list()).toEqual(['x.json']);
    expect(store.read('x.json')).toBe('{"savedAt":1}');
  });

  it('a rename that fails leaves the previous save exactly as it was and takes the temp away', () => {
    const { host, tree, ops } = renameHost({ failRename: true });
    const store = createFsSaveStore(host, 'saves/root');
    tree.set('saves/root/x.json', '{"savedAt":1,"old":true}');
    expect(() => store.writeAtomic('x.json', '{"savedAt":2}')).toThrow(/renaming "saves\/root\/x\.json\.tmp" onto "x\.json" failed \(EBUSY/);
    expect(store.read('x.json'), 'the old save is the answer, not a truncated new one').toBe('{"savedAt":1,"old":true}');
    expect(tree.has('saves/root/x.json.tmp'), 'the temp was cleaned up').toBe(false);
    expect(ops.slice(-1)).toEqual(['unlink:saves/root/x.json.tmp']);
    expect(store.list()).toEqual(['x.json']);
  });

  it('when the cleanup fails too, the message names the leftover instead of hiding it', () => {
    const { host, tree } = renameHost({ failRename: true, failUnlink: true });
    const store = createFsSaveStore(host, 'saves/root');
    tree.set('saves/root/x.json', 'old');
    expect(() => store.writeAtomic('x.json', 'new')).toThrow(/the temp file could not be removed — it is left at "x\.json\.tmp"/);
    expect(store.list()).toEqual(['x.json', 'x.json.tmp']);
    expect(() => store.writeAtomic('x.json', 'new again')).toThrow(/EBUSY/);
  });

  it('a host with no renameSync is refused before a single byte is written', () => {
    const { host, tree, ops } = renameHost({ canRename: false });
    tree.set('saves/root/x.json', 'old');
    const store = createFsSaveStore(host, 'saves/root');
    expect(() => store.writeAtomic('x.json', 'new')).toThrow(/no renameSync; nothing was written/);
    expect(ops, 'the capability gap was asked about first, so no temp exists to apologise for').toEqual([]);
    expect([...tree.keys()]).toEqual(['saves/root/x.json']);
  });

  it('writeSaveFile replaces a save whole, and a fresh runtime loads the new stamp', () => {
    const { host, ops: hostOps } = renameHost();
    const store = createFsSaveStore(host, 'saves/root');
    const rt = runtimeWithStore(store);
    const sceneId = rt.createScene('World').id;
    rt.setActiveScene(sceneId);
    const heroId = withEntityIn(rt, sceneId);
    expect(rt.writeSaveFile('slot.json', sceneId, 1).bytes).toBe(store.read('slot.json')!.length);
    // The runtime, not just the seam, is on the atomic path: if `writeSaveFile` quietly went back to
    // `storage.write`, every store-level assertion below would still pass.
    expect(hostOps.filter((op) => op.startsWith('rename:'))).toEqual([
      'rename:saves/root/slot.json.tmp->saves/root/slot.json',
    ]);

    const first = runtimeWithStore(store);
    first.createScene('copy', sceneId);
    expect(first.readSaveFile('slot.json', sceneId).entities).toEqual([heroId]);

    rt.writeSaveFile('slot.json', sceneId, 2);
    expect((JSON.parse(store.read('slot.json')!) as { savedAt: number }).savedAt).toBe(2);
    const second = runtimeWithStore(store);
    second.createScene('copy two', sceneId);
    expect(second.readSaveFile('slot.json', sceneId).entities).toEqual([heroId]);
    expect(store.list(), 'no temp file ever surfaced in the listing').toEqual(['slot.json']);
    rt.dispose();
    first.dispose();
    second.dispose();
  });

  it('the memory store mutates once and lists no temp, and plain write still writes directly', () => {
    const store = createMemorySaveStore();
    store.writeAtomic('a.json', 'one');
    expect(store.list()).toEqual(['a.json']);
    expect(store.read('a.json')).toBe('one');
    const { host, ops } = renameHost();
    const fsStore = createFsSaveStore(host, 'saves/root');
    fsStore.write('b.json', 'plain');
    expect(ops).toEqual(['write:saves/root/b.json']);
  });

  it('v125: a durable write flushes the temp before the rename, and says so in the report', () => {
    const { host, ops } = renameHost({ flush: true });
    const store = createFsSaveStore(host, 'saves/root');
    const rt = runtimeWithStore(store);
    const sceneId = rt.createScene('World').id;
    rt.setActiveScene(sceneId);
    withEntityIn(rt, sceneId);
    expect(rt.writeSaveFile('d.json', sceneId, 7, { durable: true })).toMatchObject({ durable: true, store: 'fs' });
    expect(ops).toEqual([
      'write:saves/root/d.json.tmp',
      'flush:saves/root/d.json.tmp',
      'rename:saves/root/d.json.tmp->saves/root/d.json',
    ]);
    expect(rt.writeSaveFile('d.json', sceneId, 8).durable).toBe(false);
    expect(ops.filter((op) => op.startsWith('flush:'))).toHaveLength(1);
    rt.dispose();
  });

  it('a durable request is refused before any byte moves when the host cannot flush', () => {
    const { host, tree, ops } = renameHost();
    const store = createFsSaveStore(host, 'saves/root');
    tree.set('saves/root/x.json', 'old');
    expect(() => store.writeAtomic('x.json', 'new', true)).toThrow(/asked to be durable but the injected fs has no flushSync; nothing was written/);
    expect(ops, 'no half-written temp is left behind to explain').toEqual([]);
    expect(tree.get('saves/root/x.json')).toBe('old');
  });

  it('the memory store refuses durability rather than promising a survival it cannot arrange', () => {
    const store = createMemorySaveStore();
    expect(() => store.writeAtomic('a.json', 'one', true)).toThrow(/memory store cannot write durably/);
    expect(store.list()).toEqual([]);
    const rt = runtimeWithStore(store);
    const sceneId = rt.createScene('World').id;
    withEntityIn(rt, sceneId);
    expect(() => rt.writeSaveFile('a.json', sceneId, 1, { durable: true })).toThrow(/memory store cannot write durably/);
    expect(store.list()).toEqual([]);
    rt.dispose();
  });

  it('when the flush itself fails, the old save is untouched and the temp is cleaned up', () => {
    const { host, tree, ops } = renameHost({ flush: true, failFlush: true });
    const store = createFsSaveStore(host, 'saves/root');
    tree.set('saves/root/x.json', 'old');
    expect(() => store.writeAtomic('x.json', 'new', true)).toThrow(/flushing and renaming "saves\/root\/x\.json\.tmp" onto "x\.json" failed \(EIO/);
    expect(tree.get('saves/root/x.json')).toBe('old');
    expect(ops.slice(-1)).toEqual(['unlink:saves/root/x.json.tmp']);
    expect(store.list()).toEqual(['x.json']);
  });

  it('v126: a leftover temp is swept, and a real save is never touched', () => {
    const { host, tree } = renameHost();
    const store = createFsSaveStore(host, 'saves/root');
    const rt = runtimeWithStore(store);
    const sceneId = rt.createScene('World').id;
    withEntityIn(rt, sceneId);
    rt.writeSaveFile('x.json', sceneId, 1);
    // Stand in for the debris v125 describes — a double failure that left a temp behind. It goes into the
    // HOST rather than through the store, because a `.tmp` name is no longer something a caller may create
    // (v-next: it is the temp of the save called `x.json`); a leftover is what the filesystem holds.
    tree.set('saves/root/x.json.tmp', 'half-written junk');
    expect(store.list()).toEqual(['x.json', 'x.json.tmp']);
    const deleted: { path: string }[] = [];
    rt.addEventListener('saveFileDeleted', (d: unknown) => deleted.push(d as { path: string }));
    expect(rt.sweepTempFiles()).toEqual({ store: 'fs', removed: ['x.json.tmp'], kept: [], refused: [] });
    expect(deleted).toEqual([{ path: 'x.json.tmp', store: 'fs', removed: true }]);
    expect(store.list()).toEqual(['x.json']);
    expect(tree.get('saves/root/x.json'), 'a sweep never touches a name it did not pick').toContain('"savedAt":1');
    expect(rt.sweepTempFiles()).toEqual({ store: 'fs', removed: [], kept: [], refused: [] });
    rt.dispose();
  });

  it('a name that vanished between listing and deleting is reported, not invented away', () => {
    const backing = createMemorySaveStore();
    const racing: SaveStore = {
      kind: 'memory',
      write: (p, c) => backing.write(p, c),
      read: (p) => backing.read(p),
      exists: (p) => backing.exists(p),
      writeAtomic: (p, c, d) => backing.writeAtomic(p, c, d),
      list: () => ['ghost.json.tmp'],
      savePathRefusal: () => { throw new Error('unused by this case'); },
      rename: () => { throw new Error('unused by this case'); },
      delete: () => false,
    };
    const rt = runtimeWithStore(racing);
    expect(rt.sweepTempFiles()).toEqual({ store: 'memory', removed: [], kept: ['ghost.json.tmp'], refused: [] });
    rt.dispose();
  });

  it('a runtime with no store cannot sweep', () => {
    expect(() => runtime.sweepTempFiles()).toThrow(/sweepTempFiles: this runtime has no SaveStore/);
  });

  it('v127: a file that carries a field this runtime cannot read is diagnosed, and the load agrees', () => {
    const store = createMemorySaveStore();
    const rt = runtimeWithStore(store);
    const sceneId = rt.createScene('World').id;
    rt.setActiveScene(sceneId);
    withEntityIn(rt, sceneId);
    const file = rt.buildSaveFile(sceneId, 1) as unknown as Record<string, unknown>;
    file.carries = ['entities', 'quests'];
    store.write('old.json', JSON.stringify(file));

    const diagnosis = rt.diagnoseSaveFile('old.json');
    expect(diagnosis).toEqual({
      path: 'old.json',
      bytes: store.read('old.json')!.length,
      loadable: false,
      problems: [
        'it carries "quests", which this runtime can neither fill nor read',
        'it omits "cinematic", which this runtime could now write — the file predates that capability',
        'it omits "npcs", which this runtime could now write — the file predates that capability',
        'it omits "worldState", which this runtime could now write — the file predates that capability',
        'it omits "player", which this runtime could now write — the file predates that capability',
      ],
      carriedButUnreadableHere: ['quests'],
      readableNowButNotCarried: ['cinematic', 'npcs', 'worldState', 'player'],
    });
    // The pair: the verdict is the load's verdict, not a parallel opinion about it.
    let loadMessage = '';
    try {
      rt.loadSaveFile(file as never, sceneId);
    } catch (error) {
      loadMessage = (error as Error).message;
    }
    expect(loadMessage).toMatch(/the file says it carries "quests"/);
    rt.dispose();
  });

  it('a current file diagnoses as loadable with nothing to report', () => {
    const store = createMemorySaveStore();
    const rt = runtimeWithStore(store);
    const sceneId = rt.createScene('World').id;
    rt.setActiveScene(sceneId);
    withEntityIn(rt, sceneId);
    rt.writeSaveFile('now.json', sceneId, 2);
    const diagnosis = rt.diagnoseSaveFile('now.json');
    expect(diagnosis).toMatchObject({ loadable: true, problems: [], carriedButUnreadableHere: [], readableNowButNotCarried: [] });
    expect(diagnosis.bytes).toBe(store.read('now.json')!.length);
    // …and the load really does succeed, which is the other half of "the verdict is the load's verdict".
    const reader = runtimeWithStore(store);
    reader.createScene('copy', sceneId);
    expect(reader.loadSaveFile(JSON.parse(store.read('now.json')!), sceneId).entities).toHaveLength(1);
    rt.dispose();
    reader.dispose();
  });

  it('an unreadable file is refused with the reason it can check, and a missing path is its own answer', () => {
    const store = createMemorySaveStore();
    const rt = runtimeWithStore(store);
    expect(() => rt.diagnoseSaveFile('nothing.json')).toThrow(/diagnoseSaveFile: no save file at "nothing.json"/);
    store.write('broken.json', '{"carries": [');
    expect(() => rt.diagnoseSaveFile('broken.json')).toThrow(/is not readable as JSON/);
    store.write('wrong.json', JSON.stringify({ format: 'other', version: 9, carries: [], doesNotCarry: [] }));
    expect(rt.diagnoseSaveFile('wrong.json')).toMatchObject({
      loadable: false,
      problems: ['format is other, not nexus-three-runtime-save', 'version is 9, and this runtime reads exactly 1'],
    });
    rt.dispose();
  });

  it('a runtime with no store cannot diagnose either', () => {
    expect(() => runtime.diagnoseSaveFile('x.json')).toThrow(/diagnoseSaveFile: this runtime has no SaveStore/);
    expect(() => runtime.diagnoseSaveFiles()).toThrow(/diagnoseSaveFiles: this runtime has no SaveStore/);
  });

  it('the whole listing is partitioned: loadable, unloadable and unreadable are three different answers', () => {
    const store = createMemorySaveStore();
    const rt = runtimeWithStore(store);
    const sceneId = rt.createScene('World').id;
    rt.setActiveScene(sceneId);
    withEntityIn(rt, sceneId);
    rt.writeSaveFile('good.json', sceneId, 1);
    const stale = rt.buildSaveFile(sceneId, 2);
    stale.carries = ['entities', 'cinematic', 'quests'];
    store.write('future.json', JSON.stringify(stale));
    store.write('junk.json', 'not even json');

    const report = rt.diagnoseSaveFiles();
    expect(report.store).toBe('memory');
    expect(report.total).toBe(3);
    expect(report.total).toBe(report.loadable.length + report.unloadable.length + report.unreadable.length);
    expect(report.loadable.map((entry) => entry.path)).toEqual(['good.json']);
    expect(report.unloadable.map((entry) => entry.path)).toEqual(['future.json']);
    expect(report.unloadable[0]!.carriedButUnreadableHere).toEqual(['quests']);
    expect(report.unreadable.map((entry) => entry.path)).toEqual(['junk.json']);
    expect(report.unreadable.map((entry) => entry.reason)).toEqual(['not-json']);
    // The partition claim, checked as a claim: three names, none of them in two buckets.
    const names = [
      ...report.loadable.map((entry) => entry.path),
      ...report.unloadable.map((entry) => entry.path),
      ...report.unreadable.map((entry) => entry.path),
    ];
    expect(new Set(names).size).toBe(names.length);
    expect(names.sort()).toEqual(['future.json', 'good.json', 'junk.json']);
    rt.dispose();
  });

  it('a shape-reading gate sees nothing on a CRLF parse, and everything after normalising', () => {
    // The witness for 5d8a8b8. On a CRLF file `.` will not match `\r` and `$` without `m` cannot reach the end
    // of a line that carries one, so a parser written as /^\s*key\??:\s*(.*)$/ matches NOTHING — and a gate that
    // asserts an ABSENCE over that population passes while having read no shape at all. Both halves are
    // asserted: the normalised parse agrees with the LF baseline, and the raw CRLF parse is still blind. That
    // second assertion is what keeps this case from going vacuous — if the helper ever stops being blind, the
    // test says so instead of quietly proving nothing.
    const raw = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const annotations = (text: string) => {
      const opener = /export interface SaveFile \{/.exec(text);
      if (!opener) throw new Error('SaveFile is gone from src/types.ts');
      const found: string[] = [];
      for (const line of text.slice(opener.index + opener[0].length).split('\n')) {
        if (line.startsWith('}')) break;
        const m = /^\s*[A-Za-z_$][\w$]*\??:\s*(.*)$/.exec(line);
        if (m) found.push(m[1]!);
      }
      return found;
    };
    const crlf = raw.replace(/\n/g, '\r\n');
    const lf = annotations(raw);
    expect(lf.length, 'the baseline parse found nothing — the gate is reading an empty population').toBeGreaterThan(3);
    expect(annotations(crlf)).toEqual([]);
    expect(annotations(crlf.replace(/\r\n/g, '\n'))).toEqual(lf);
  });

  it('a name the store lists but cannot return is reported as listed-then-missing', () => {
    // The second situation the survey can observe for itself. A stub store makes it deterministic instead of
    // racing a real host — a listing that goes stale on its own is not something a test should try to time.
    const ghost: SaveStore = {
      kind: 'memory',
      write: () => { throw new Error('unused by this case'); },
      writeAtomic: () => { throw new Error('unused by this case'); },
      read: () => null,
      exists: () => false,
      delete: () => false,
      list: () => ['gone.json'],
      savePathRefusal: () => { throw new Error('unused by this case'); },
      rename: () => { throw new Error('unused by this case'); },
    };
    const rt = runtimeWithStore(ghost);
    const report = rt.diagnoseSaveFiles();
    expect(report.total).toBe(1);
    expect(report.unreadable).toHaveLength(1);
    expect(report.unreadable[0]!.path).toBe('gone.json');
    expect(report.unreadable[0]!.reason).toBe('listed-then-missing');
    expect(report.loadable).toEqual([]);
    expect(report.unloadable).toEqual([]);
    rt.dispose();
  });

  it('a file whose claims are the wrong shape is diagnosed unloadable, because the loader refuses it', () => {
    // v127 treated a missing carries list as an empty one and called the file loadable, while loadSaveFile
    // refuses that very file. The diagnosis and the operation must not be free to disagree: that is the same
    // defect this lane keeps meeting, a report that describes a world the code does not produce.
    const store = createMemorySaveStore();
    const rt = runtimeWithStore(store);
    const sceneId = rt.createScene('World').id;
    store.write('noclaims.json', JSON.stringify({ format: 'nexus-three-runtime-save', version: 1 }));

    const diagnosis = rt.diagnoseSaveFile('noclaims.json');
    expect(diagnosis.loadable).toBe(false);
    expect(diagnosis.problems).toEqual([
      'carries is undefined, not an array of field names',
      'doesNotCarry is undefined, not the list of fields the file leaves out',
    ]);

    let loadMessage = '';
    try {
      rt.loadSaveFile(JSON.parse(store.read('noclaims.json')!), sceneId);
    } catch (error) {
      loadMessage = (error as Error).message;
    }
    expect(loadMessage).toContain('carries is undefined, not an array of field names');
    expect(loadMessage).toContain('doesNotCarry is undefined, not the list of fields the file leaves out');
    // One sentence, one rule: the diagnosis quotes the loader's wording rather than paraphrasing it, so the
    // two cannot drift into two different descriptions of the same refusal.
    expect(diagnosis.problems[1]).toContain('not the list of fields the file leaves out');
    rt.dispose();
  });
});

/**
 * M5 v135 — the refusals get ONE owner. `npcFieldAudit`, `worldStateFieldAudit` and the save file each print a
 * list of names this package refuses to keep, and until now every one of those lists was typed by hand beside
 * the others: `quests` appeared in all three with three different sentences, `player` in two, and nothing could
 * tell you whether the accounts still described the same refusal. Worse, a caller reading ONE of them got a
 * flat answer to "is `quests` refused?" — a question that has no single answer, because refusal is a property of
 * an account, not of a name. The table is now one `REFUSALS` list whose rows declare WHICH planes refuse them
 * and say what each plane says; the three accounts are slices of it. The cases below grade the census, the
 * derivation, and the reading where a flat list would have to lie: `entities` is refused by the world bag and
 * carried by the save file.
 */
describe('v135: one refusal table, read per plane', () => {
  /** This grant's only reader of the implementation's bytes. `typesSource` at the top of this file reads
   *  `types.ts`; this reads `threeRuntime.ts`, so no two guards compare different copies of a file. */
  const implSource = readFileSync(new URL('../src/threeRuntime.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

  it('the census answers WHICH accounts refuse a name, so a flat refusal list cannot be read as the whole truth', () => {
    const census = runtime.refusalCensus();
    expect(census.planes).toEqual(['npc-record', 'world-state', 'save-file', 'player-record']);
    expect(census.rows.length, 'the census read no rows, so every partition below would pass vacuously').toBeGreaterThan(0);
    const names = census.rows.map((row) => row.field);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    for (const row of census.rows) {
      expect([...row.refusedBy].filter((plane) => row.notRefusedBy.includes(plane)),
        `${row.field} is both refused by and not refused by the same account`).toEqual([]);
      expect([...row.refusedBy, ...row.notRefusedBy].sort()).toEqual([...census.planes].sort());
      expect(row.refusedBy.length, `${row.field} names no refusing account, so it has no business being in the table`).toBeGreaterThan(0);
    }
  });

  it('a name refused by three of the four accounts and a name refused by exactly one are kept apart, and the carried one is named', () => {
    const rowOf = (field: string) => runtime.refusalCensus().rows.find((row) => row.field === field)!;
    // v135 could say `quests` was refused by EVERY account; with the fourth plane it is refused by three, and
    // the one that does not refuse it is the player record — which has no quest field to refuse. That is the
    // census doing its job: a flat list would have to either overstate the player record or lose `quests`.
    expect(rowOf('quests').refusedBy).toEqual(['npc-record', 'world-state', 'save-file']);
    expect(rowOf('quests').notRefusedBy).toEqual(['player-record']);
    expect(rowOf('inventory').refusedBy).toEqual(['npc-record', 'world-state', 'player-record']);
    expect(rowOf('sceneGraph').refusedBy).toEqual(['save-file']);
    expect(rowOf('sceneGraph').notRefusedBy).toEqual(['npc-record', 'world-state', 'player-record']);
    // THE row a flat list cannot tell the truth about: the world bag refuses `entities` while the save file
    // carries it for real. A single "refused names" list would make one of those two readings false.
    expect(rowOf('entities').refusedBy).toEqual(['world-state']);
    expect(rowOf('entities').notRefusedBy).toEqual(['npc-record', 'save-file', 'player-record']);
    // v136 moves `player` into the same shape as `entities`: a savable file half the world bag still refuses,
    // because the runtime now owns one player per scene and a bag key of that name would be a second owner.
    expect(rowOf('player').refusedBy).toEqual(['world-state']);
    const file = runtime.buildSaveFile(scene, 1700000000000);
    expect(file.carries).toContain('entities');
    expect(file.carries).toContain('player');
    expect(file.doesNotCarry.map((entry) => entry.field)).not.toContain('entities');
    expect(file.doesNotCarry.map((entry) => entry.field)).not.toContain('player');
  });

  it('a refusal never ships without its reason, and never speaks in a plane that does not refuse it', () => {
    const census = runtime.refusalCensus();
    for (const row of census.rows) {
      for (const plane of row.refusedBy) {
        const needs = row.needs[plane];
        expect(typeof needs, `${row.field} is refused by ${plane} but has no sentence`).toBe('string');
        expect(needs!.length, `${row.field} says an empty reason in ${plane}`).toBeGreaterThan(0);
      }
      for (const plane of row.notRefusedBy) {
        expect(row.needs[plane], `${row.field} carries a reason for ${plane}, which does not refuse it`).toBeUndefined();
      }
    }
    // Per-plane sentences that are one sentence pasted twice would make the planes a decoration.
    const shared = census.rows.filter((row) => row.refusedBy.length > 1);
    expect(shared.length, 'no name is refused by more than one plane, so the per-plane shape is untested').toBeGreaterThan(0);
    for (const row of shared) {
      const sentences = row.refusedBy.map((plane) => row.needs[plane]);
      expect(new Set(sentences).size, `${row.field} says the same sentence in every plane that refuses it`).toBe(sentences.length);
    }
  });

  it('a row that declares a plane and withholds its reason is refused at the call, not printed as a blank', () => {
    // The control first: the shipped table answers, so the throws below are about the injected rows, not a
    // validator that refuses everything (which would be green for the wrong reason).
    expect(refusalsFor('save-file').length).toBeGreaterThan(0);
    const missing = [{ field: 'ghost', planes: ['world-state'] as const, needs: {} }];
    expect(() => refusalsFor('world-state', missing)).toThrow(/with no reason/);
    expect(() => refusalsFor('world-state', missing)).toThrow(/ghost/);
    const blank = [{ field: 'hollow', planes: ['save-file'] as const, needs: { 'save-file': '' } }];
    expect(() => refusalsFor('save-file', blank)).toThrow(/with no reason/);
  });

  it('every account the census names is one derivation of the one table, not a copy of it', () => {
    expect(implSource.includes('const REFUSALS'), 'the read found no table, so this guard would grade nothing').toBe(true);
    // The plane set comes from the census, not from a list typed beside it: v136 added a fourth plane, and a
    // hand-written loop of three would have stayed green while the new account went ungraded.
    const planes = runtime.refusalCensus().planes;
    expect(planes.length, 'the census named no planes, so the loop below would grade nothing').toBeGreaterThan(2);
    for (const plane of planes) {
      const hits = implSource.split(`refusalsFor('${plane}')`).length - 1;
      expect(hits, `${plane} is not read out of the table exactly once — ${hits} derivations in threeRuntime.ts`).toBe(1);
    }
    // And each refusing (name, plane) pair's sentence exists once: retyping an account by hand would put a
    // second copy of its sentences in the file, which is the drift this grant exists to make impossible.
    const census = runtime.refusalCensus();
    const sentences = census.rows.flatMap((row) => row.refusedBy.map((plane) => row.needs[plane] as string));
    expect(sentences.length, 'the census reported no refusals, so the sentence count would pass on nothing').toBeGreaterThan(0);
    for (const sentence of sentences) {
      const quoted = `'${sentence}'`;
      const hits = implSource.split(quoted).length - 1;
      expect(hits, `"${sentence.slice(0, 48)}…" appears ${hits} times in threeRuntime.ts; the table is its only owner, so a second copy is a second account`).toBe(1);
    }
  });

  it('a save file names what it leaves out in the census\'s own words, in the census\'s own order', () => {
    const expected = runtime.refusalCensus().rows.filter((row) => row.refusedBy.includes('save-file'));
    expect(expected.length).toBeGreaterThan(0);
    const file = runtime.buildSaveFile(scene, 1700000000000);
    expect(file.doesNotCarry.map((entry) => entry.field)).toEqual(expected.map((row) => row.field));
    expect(file.doesNotCarry.map((entry) => entry.needs)).toEqual(expected.map((row) => row.needs['save-file']));
  });

  it('the audits answer in the table\'s own sentences for their own plane, not a reason written at the call site', () => {
    // Built here rather than through the NPC describe's fixture: `withNPC` is scoped to that block, and this
    // grant's table is read by all three record-shaped accounts, so the case that grades the reading lives
    // with the table.
    hero = runtime.createEntity(scene, 'Hero', 'mesh').id;
    runtime.attachNPC(scene, hero, {});
    // The player account needs a live record to speak for, and it gets its own body: whether one body may be
    // both an NPC and the scene's player is a question this grant does not answer, so the case does not
    // accidentally answer it either.
    const body = runtime.createEntity(scene, 'Wanderer', 'mesh').id;
    runtime.attachPlayer(scene, body, {});
    const census = runtime.refusalCensus();
    const said = (plane: 'npc-record' | 'world-state' | 'player-record', entries: { field: string; needs: string }[]) => {
      expect(entries.length, `${plane} audit carried no gaps, so this comparison would grade nothing`).toBeGreaterThan(0);
      for (const entry of entries) {
        const row = census.rows.find((r) => r.field === entry.field);
        expect(row, `${plane} reports "${entry.field}", which the table does not refuse anywhere`).toBeDefined();
        expect(row!.refusedBy, `${plane} reports "${entry.field}", which this plane does not refuse`).toContain(plane);
        expect(entry.needs, `${plane} says something other than the table about "${entry.field}"`).toBe(row!.needs[plane]);
      }
    };
    said('npc-record', runtime.npcFieldAudit(hero)!.untouched);
    said('world-state', runtime.worldStateFieldAudit(scene)!.untouched);
    said('player-record', runtime.playerFieldAudit(scene)!.untouched);
  });

  it('a field the live record carries that the table never heard of is named as a gap, not dropped', () => {
    // The fallback at the end of the NPC audit is what stands between "a field was added" and "a field went
    // missing from every account". It is reached the way it happens in a real change: the record gains a
    // property the snapshot does not carry and no row refuses, and the audit's own docstring promises such a
    // field "shows up here without anyone remembering to add it" — which is only true if the audit still has
    // something to say about a name its table does not know.
    hero = runtime.createEntity(scene, 'Hero', 'mesh').id;
    runtime.attachNPC(scene, hero, {});
    const record = runtime.getNPC(hero)!;
    (record as unknown as Record<string, unknown>).mood = 'curious';
    const audit = runtime.npcFieldAudit(hero)!;
    const gap = audit.untouched.find((entry) => entry.field === 'mood');
    expect(gap, `the audit dropped an untabled field: ${JSON.stringify(audit.untouched.map((e) => e.field))}`).toBeDefined();
    expect(gap!.needs).toContain('no entry in the gap table');
    // The sentence names the silence as the finding rather than inventing a plausible reason for a field
    // nobody has read the code to explain.
    expect(gap!.needs).toContain('which is itself the finding');
    // And it stays the last resort: a tabled field still answers in the table's own words.
    expect(audit.untouched.find((entry) => entry.field === 'schedule')!.needs)
      .toBe(runtime.refusalCensus().rows.find((row) => row.field === 'schedule')!.needs['npc-record']);
  });
});

/**
 * M5 v136 — `SaveData.player` gets an owner. The field was declared as `SerializedPlayer`, a shape written
 * against a `THREE.Vector3`, a `THREE.Euler` and a `Map`, and backed by nothing: no record to hold it, no
 * writer, no reader — so it sat in `blocked` and a file could only ever name it as an omission. (v126's first
 * attempt at this half is on record in ADR 0016 as a stranded grant; the shape was the problem, not the will.)
 *
 * This suite makes the three halves that a save lane needs, in the order the lane has always needed them: a
 * RECORD the runtime holds and can lose (`attachPlayer`/`getPlayer`/`detachPlayer`, orphaned by
 * `removeEntity`), a FILE shape that survives `JSON.stringify` (`SerializedPlayer` retyped to data,
 * `playerSnapshot`/`restorePlayer`), and the FILE carrying it — where `player: null` is a claim the writer
 * makes and an absent key is a file that predates the half, which is the same old-file rule v131 and v133
 * had to make `diagnoseSaveFile` agree with. `inventory` stays refused by the record and is the fourth plane's
 * first finding, so the refusal table gained `player-record` rather than a third hand-written gap list.
 */
describe('M5 v136 — the scene has one player, and a file can carry it', () => {
  /** One body standing at a transform worth comparing, plus the player that is played as it.
   *
   *  Options may be spelled as a FUNCTION of the body's id, and must be when they name it: the object literal a
   *  caller writes is evaluated BEFORE this helper creates the entity, so a plain `hotbar: [hero, null]` carries
   *  the placeholder id `beforeEach` left behind and is refused at the door as a slot pointing at nothing. */
  function withPlayer(options: PlayerAttachOptions | ((body: EntityId) => PlayerAttachOptions) = {}): Player {
    withEntity(new THREE.Vector3(1.5, 2.25, -3.75));
    runtime.getEntity(scene, hero)!.threeObject.rotation.set(0.25, 0.5, 0.75, 'YXZ');
    return runtime.attachPlayer(scene, hero, typeof options === 'function' ? options(hero) : options);
  }

  /** A two-entity scene whose player has skills and a hotbar, so nothing in the round trip is an empty list. */
  function fileWithPlayer(rt: ThreeRuntime, sceneId: SceneId, heroId: EntityId): { file: SaveFile; other: EntityId } {
    const other = rt.createEntity(sceneId, 'Torch', 'mesh').id;
    rt.attachPlayer(sceneId, heroId, {
      health: 61,
      maxHealth: 80,
      mana: 12,
      maxMana: 40,
      experience: 1440,
      level: 7,
      skills: { sneak: 5, 'lock-picking': 3 },
      hotbar: [heroId, null, other],
    });
    return { file: rt.buildSaveFile(sceneId, 1700000000000), other };
  }

  it('reads the body it is attached to rather than inventing a place to stand', () => {
    const player = withPlayer();
    const body = runtime.getEntity(scene, hero)!.threeObject;
    expect([player.position.x, player.position.y, player.position.z]).toEqual([1.5, 2.25, -3.75]);
    expect(player.position).not.toBe(body.position);
    expect([player.rotation.x, player.rotation.y, player.rotation.z, player.rotation.order])
      .toEqual([0.25, 0.5, 0.75, 'YXZ']);
    expect(player.rotation).not.toBe(body.rotation);
    // The declared numbers come from the constant, and the two bags start EMPTY — a record that claimed items
    // from a default would be the save this lane has spent eleven grants refusing.
    expect([player.health, player.maxHealth, player.mana, player.maxMana, player.experience, player.level])
      .toEqual([100, 100, 50, 50, 0, 1]);
    expect(player.inventory).toEqual([]);
    expect(player.skills.size).toBe(0);
    expect(player.hotbar).toEqual([]);
    // The clone is the claim: a record that aliased the renderer's object would move when the world moved.
    body.position.set(99, 99, 99);
    expect(player.position.z).toBe(-3.75);
  });

  it('refuses a scene that does not exist and a body that is not in the scene', () => {
    expect(() => runtime.attachPlayer(sid('no-such-scene'), eid('no-such-body'))).toThrow(/attachPlayer: scene no-such-scene does not exist/);
    withEntity();
    expect(() => runtime.attachPlayer(scene, eid('no-such-body'))).toThrow(/attachPlayer: entity no-such-body is not in scene/);
  });

  it('one scene is played as one body: a second record refuses, naming the owner it would displace', () => {
    const first = withPlayer();
    const second = runtime.createEntity(scene, 'Wanderer', 'mesh').id;
    expect(() => runtime.attachPlayer(scene, second))
      .toThrow(new RegExp(`attachPlayer: scene ${scene} already has a player on entity ${first.entityId}; detachPlayer\\(${scene}\\) first`));
    expect(runtime.getPlayer(scene)!.entityId).toBe(first.entityId);
    expect(runtime.detachPlayer(scene)).toBe(true);
    expect(runtime.detachPlayer(scene), 'a second detach has nothing to take — that is an answer, not a failure').toBe(false);
    expect(runtime.attachPlayer(scene, second).entityId).toBe(second);
  });

  it('a hotbar slot names a body in the scene or nothing at all', () => {
    withPlayer();
    const torch = runtime.createEntity(scene, 'Torch', 'mesh').id;
    runtime.detachPlayer(scene);
    expect(runtime.attachPlayer(scene, hero, { hotbar: [hero, null, torch] }).hotbar).toEqual([hero, null, torch]);
    // The slot is checked at the door: a save would write an id the scene does not hold, and a restore would
    // then hand back a quick slot no one can use rather than refuse the value it was given.
    runtime.detachPlayer(scene);
    expect(() => runtime.attachPlayer(scene, hero, { hotbar: [torch, eid('ghost')] }))
      .toThrow(/attachPlayer: hotbar\[1\] names ghost, which is not an entity in scene/);
    expect(runtime.getPlayer(scene), 'a refused attach leaves no half-built record behind').toBeUndefined();
  });

  it('a non-finite number is refused at the door, naming the field it would have turned into null', () => {
    // `JSON.stringify` writes NaN and Infinity as `null`, so the record a file gives back holds a DIFFERENT
    // number than the one put in. `setNPCReputation` refuses a standing for this reason; a player's stats are
    // the same drift with more fields to hide it in.
    expect(() => withPlayer({ health: Number.NaN })).toThrow(/attachPlayer: health is NaN/);
    expect(() => withPlayer({ level: Number.POSITIVE_INFINITY })).toThrow(/attachPlayer: level is Infinity/);
    expect(() => withPlayer({ skills: { sneak: Number.NaN } })).toThrow(/attachPlayer: the skill "sneak" is NaN/);
    expect(runtime.getPlayer(scene), 'a refused attach leaves no half-built record behind').toBeUndefined();
  });

  it('playerSnapshot writes the file shape: no Map, no live object, and a sorted entry array for skills', () => {
    withPlayer((body) => ({ skills: { sneak: 5, 'lock-picking': 3 }, hotbar: [body, null] }));
    const saved = runtime.playerSnapshot(scene)!;
    expect(Object.keys(saved).sort()).toEqual(declaredFields('SerializedPlayer').sort());
    expect(saved.skills).toEqual([['lock-picking', 3], ['sneak', 5]]);
    expect(saved.hotbar).toEqual([hero, null]);
    expect(saved.position).toEqual({ x: 1.5, y: 2.25, z: -3.75 });
    expect(saved.rotation).toEqual({ x: 0.25, y: 0.5, z: 0.75, order: 'YXZ' });
    expect(offenders(saved)).toEqual([]);
    // The snapshot is a copy in both directions: a caller holding one cannot move the live record.
    saved.hotbar.push(eid('somewhere-else'));
    saved.skills.push(['invented', 9]);
    expect(runtime.getPlayer(scene)!.hotbar).toEqual([hero, null]);
    expect([...runtime.getPlayer(scene)!.skills.entries()].sort()).toEqual([['lock-picking', 3], ['sneak', 5]]);
    expect(runtime.playerSnapshot(sid('no-such-scene'))).toBeNull();
  });

  it('playerFieldAudit answers for every field Player declares, and an untabled one is named as the finding', () => {
    withPlayer();
    const audit = runtime.playerFieldAudit(scene)!;
    expect(audit.carried).toEqual(declaredFields('SerializedPlayer').sort());
    // THE gap this grant cannot close: the live record holds an `InventoryItem[]`, whose items each hold two
    // Maps, and no inventory system here fills or reads one.
    expect(audit.untouched.map((entry) => entry.field)).toEqual(['inventory']);
    expect(audit.untouched[0]!.needs).toBe(runtime.refusalCensus().rows.find((row) => row.field === 'inventory')!.needs['player-record']);
    // The partition is the claim: carried and untouched together name every declared field, no more and no
    // less — which is what makes a field added tomorrow a finding instead of a silent drop.
    const declared = declaredFields('Player').sort();
    expect(declared.length, 'the read found no Player fields, so the partition below would grade nothing').toBeGreaterThan(10);
    expect([...audit.carried, ...audit.untouched.map((entry) => entry.field)].sort()).toEqual(declared);

    const record = runtime.getPlayer(scene)!;
    (record as unknown as Record<string, unknown>).title = 'Captain';
    const after = runtime.playerFieldAudit(scene)!;
    const gap = after.untouched.find((entry) => entry.field === 'title');
    expect(gap, `the audit dropped an untabled field: ${JSON.stringify(after.untouched.map((entry) => entry.field))}`).toBeDefined();
    expect(gap!.needs).toContain('no entry in the gap table');
    expect(gap!.needs).toContain('which is itself the finding');
  });

  it('a file written through the store is read by a runtime that never saw the record, and the numbers match', () => {
    const store = createMemorySaveStore();
    const writer = runtimeWithStore(store);
    const stage = writer.createScene('Stage').id;
    writer.setActiveScene(stage);
    const body = withEntityIn(writer, stage);
    const { file, other } = fileWithPlayer(writer, stage, body);
    expect(file.carries).toContain('player');
    expect(file.player).not.toBeNull();
    expect(file.player!.entityId).toBe(body);
    expect(file.player!.skills).toEqual([['lock-picking', 3], ['sneak', 5]]);

    // The bytes, not the value: what a disk holds is the only version that has to work.
    const parsed = JSON.parse(JSON.stringify(file));
    expect(offenders(parsed)).toEqual([]);
    store.write('saves/player.json', JSON.stringify(parsed));

    const reader = runtimeWithStore(store);
    reader.createScene('Again', stage);
    reader.setActiveScene(stage);
    const report = reader.readSaveFile('saves/player.json', stage);
    expect(report.player, 'the load report names the body this file made the player').toBe(body);
    const player = reader.getPlayer(stage)!;
    expect([player.health, player.maxHealth, player.mana, player.maxMana, player.experience, player.level])
      .toEqual([61, 80, 12, 40, 1440, 7]);
    expect([...player.skills.entries()].sort()).toEqual([['lock-picking', 3], ['sneak', 5]]);
    expect(player.hotbar).toEqual([body, null, other]);
    expect([player.position.x, player.position.y, player.position.z]).toEqual([1, 2, 3]);
    expect(player.inventory).toEqual([]);
    const restored: unknown[] = [];
    reader.addEventListener('playerRestored', (data: unknown) => restored.push(data));
    reader.detachPlayer(stage);
    expect(reader.attachPlayer(stage, body).entityId).toBe(body);
    expect(restored, 'a direct attach is not a restore — the two events name different happenings').toEqual([]);
    writer.dispose();
    reader.dispose();
  });

  it('an OLD file that says nothing about the player is read as carrying none', () => {
    const store = createMemorySaveStore();
    const writer = runtimeWithStore(store);
    const stage = writer.createScene('Stage').id;
    writer.setActiveScene(stage);
    const body = withEntityIn(writer, stage);
    writer.attachNPC(stage, body, { name: 'Keeper' });
    writer.writeSaveFile('saves/current.json', stage, 1700000000000);

    const legacy = JSON.parse(store.read('saves/current.json')!) as Record<string, unknown>;
    delete legacy.player;
    legacy.carries = ['entities', 'cinematic', 'npcs', 'worldState'];
    store.write('saves/legacy.json', JSON.stringify(legacy));

    const reader = runtimeWithStore(store);
    reader.createScene('Copy', stage);
    reader.setActiveScene(stage);
    const report = reader.readSaveFile('saves/legacy.json', stage);
    expect(report.player, 'a file with no player key predates the half, and is read as carrying none').toBeNull();
    expect(reader.getPlayer(stage)).toBeUndefined();
    // The pair v127 made the rule of: the diagnosis must not call loadable a file the load refuses, and must
    // name the same half the load skipped.
    const diagnosis = reader.diagnoseSaveFile('saves/legacy.json');
    expect(diagnosis.loadable).toBe(true);
    expect(diagnosis.readableNowButNotCarried).toEqual(['player']);

    // The other direction: a file that CLAIMS the half owes a value, and `null` is the value a playerless
    // scene writes.
    store.write('saves/liar.json', JSON.stringify({ ...legacy, carries: ['entities', 'cinematic', 'npcs', 'worldState', 'player'] }));
    const second = runtimeWithStore(store);
    second.createScene('Copy again', stage);
    second.setActiveScene(stage);
    expect(() => second.readSaveFile('saves/liar.json', stage))
      .toThrow(/the file CLAIMS to carry player but ships no player half — not even `null`/);
    // And a file that ships `null` without claiming the half is still readable: the key answers for itself.
    store.write('saves/quiet.json', JSON.stringify({ ...legacy, player: null }));
    const third = runtimeWithStore(store);
    third.createScene('Copy once more', stage);
    third.setActiveScene(stage);
    expect(third.readSaveFile('saves/quiet.json', stage).player).toBeNull();
    writer.dispose();
    reader.dispose();
    second.dispose();
    third.dispose();
  });

  it('refuses a player whose body the file does not carry BEFORE any half runs, so nothing is half-loaded', () => {
    const store = createMemorySaveStore();
    const writer = runtimeWithStore(store);
    const stage = writer.createScene('Stage').id;
    writer.setActiveScene(stage);
    const body = withEntityIn(writer, stage);
    const { file } = fileWithPlayer(writer, stage, body);
    store.write('saves/ok.json', JSON.stringify(file));

    // A record about a body the bytes never carry: the player would be restored onto nothing.
    const stranger = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    (stranger.player as Record<string, unknown>).entityId = eid('e300-ghost');
    store.write('saves/stranger.json', JSON.stringify(stranger));
    const reader = runtimeWithStore(store);
    reader.createScene('Copy', stage);
    reader.setActiveScene(stage);
    expect(() => reader.readSaveFile('saves/stranger.json', stage))
      .toThrow(/the player names e300-ghost, which is not among the entities this file carries/);
    // The refusal is the whole point of pre-checking: nothing this load would have had to undo ever landed.
    expect(reader.getScene(stage)!.entities.size).toBe(0);
    expect(reader.getPlayer(stage)).toBeUndefined();

    // The same rule one field in: an empty hotbar slot is legal, a slot pointing outside the file is not.
    const slot = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    (slot.player as Record<string, unknown>).hotbar = [body, eid('e301-ghost')];
    store.write('saves/slot.json', JSON.stringify(slot));
    const second = runtimeWithStore(store);
    second.createScene('Copy again', stage);
    second.setActiveScene(stage);
    expect(() => second.readSaveFile('saves/slot.json', stage))
      .toThrow(/player\.hotbar\[1\] names e301-ghost, which is not among the entities this file carries/);

    // A live player is live state, and a load never overwrites live state.
    const third = runtimeWithStore(store);
    third.createScene('Third', stage);
    third.setActiveScene(stage);
    const heldBody = withEntityIn(third, stage);
    third.attachPlayer(stage, heldBody);
    expect(() => third.readSaveFile('saves/ok.json', stage))
      .toThrow(new RegExp(`loadSaveFile refused: scene ${stage} already has a player on entity ${heldBody}; a load never overwrites live state`));
    expect(third.getPlayer(stage)!.entityId).toBe(heldBody);
    writer.dispose();
    reader.dispose();
    second.dispose();
    third.dispose();
  });

  it('a file that CLAIMS a player and ships no player key is diagnosed the way the loader refuses it', () => {
    // v127's diagnosis graded only the file's VOCABULARY — `carries` against what this runtime can fill — so a file
    // that named `player` and shipped no `player` key at all was reported loadable while the `loadSaveFile` about to
    // run refused it. v136 made that shape writable-by-accident (a half can now be omitted as well as be `null`),
    // and the probe arm that omitted the writer's player line is what caught the diagnosis still disagreeing: a
    // report that can disagree with the operation it describes is an opinion, not a report.
    const store = createMemorySaveStore();
    const writer = runtimeWithStore(store);
    const stage = writer.createScene('Stage').id;
    writer.setActiveScene(stage);
    const body = withEntityIn(writer, stage);
    const { file } = fileWithPlayer(writer, stage, body);
    const unbacked = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    delete unbacked.player;
    store.write('saves/backed.json', JSON.stringify(file));
    store.write('saves/unbacked.json', JSON.stringify(unbacked));
    // `null` is a value, so a claimed half written as `null` is backed by bytes and stays loadable: the check is
    // about the key, not about the name.
    const explicitNone = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    explicitNone.player = null;
    store.write('saves/explicit-none.json', JSON.stringify(explicitNone));

    const reader = runtimeWithStore(store);
    reader.createScene('Copy', stage);
    expect(reader.diagnoseSaveFile('saves/backed.json')).toMatchObject({ loadable: true, problems: [] });
    expect(reader.diagnoseSaveFile('saves/explicit-none.json')).toMatchObject({ loadable: true, problems: [] });

    const diagnosis = reader.diagnoseSaveFile('saves/unbacked.json');
    expect(diagnosis.loadable).toBe(false);
    expect(diagnosis.problems).toEqual(['the file CLAIMS to carry player but ships no player half']);

    let loadMessage = '';
    try {
      reader.loadSaveFile(JSON.parse(store.read('saves/unbacked.json')!), stage);
    } catch (error) {
      loadMessage = (error as Error).message;
    }
    // One rule, one wording: the diagnosis quotes the loader's sentence rather than paraphrasing it, so the two
    // readers of the same file cannot drift into two different descriptions of the same refusal.
    expect(loadMessage).toContain(diagnosis.problems[0]);
    expect(reader.getScene(stage)!.entities.size).toBe(0);
    writer.dispose();
    reader.dispose();
  });

  it('restorePlayer refuses the shapes a file cannot have written, and refuses them before it registers anything', () => {
    withPlayer({ skills: { sneak: 1 } });
    const real = runtime.playerSnapshot(scene)!;
    const ghost = eid('e310-ghost');
    expect(() => runtime.restorePlayer(sid('no-such-scene'), { ...real, entityId: ghost }))
      .toThrow(/restorePlayer: scene no-such-scene does not exist/);
    expect(() => runtime.restorePlayer(scene, { ...real, entityId: ghost }))
      .toThrow(new RegExp(`restorePlayer: entity e310-ghost is not in scene ${scene}`));
    expect(() => runtime.restorePlayer(scene, { ...real, skills: { sneak: 1 } as unknown as SerializedPlayer['skills'] }))
      .toThrow(/restorePlayer: skills is object, not the \[name, level\] entry array a file writes/);
    expect(() => runtime.restorePlayer(scene, { ...real, hotbar: 'none' as unknown as SerializedPlayer['hotbar'] }))
      .toThrow(/restorePlayer: hotbar is string, not an array of entity ids and empty slots/);
    // Every one of those refused before anything registered, so the scene's player is still the original.
    expect(runtime.getPlayer(scene)!.entityId).toBe(hero);
    expect(() => runtime.restorePlayer(scene, real))
      .toThrow(new RegExp(`restorePlayer: scene ${scene} already has a player on entity ${hero}; a restore never overwrites live state`));
  });

  it('removeEntity takes the scene’s player with the body it names, and the file then says null', () => {
    const player = withPlayer();
    const orphaned: unknown[] = [];
    runtime.addEventListener('playerOrphaned', (data: unknown) => orphaned.push(data));
    const fileBefore = runtime.playerSnapshot(scene);
    expect(fileBefore).not.toBeNull();
    expect(runtime.removeEntity(scene, player.entityId)).toBe(true);
    expect(orphaned).toEqual([{ sceneId: scene, entityId: player.entityId }]);
    expect(runtime.getPlayer(scene)).toBeUndefined();
    expect(runtime.playerSnapshot(scene)).toBeNull();
    // The half that matters for a save: a file built after the body left cannot name a player it does not have.
    const built = runtime.buildSaveFile(scene, 1700000000000);
    expect(built.player).toBeNull();
    const events: { hasPlayer: boolean }[] = [];
    runtime.addEventListener('saveFileBuilt', (data: unknown) => events.push(data as { hasPlayer: boolean }));
    runtime.buildSaveFile(scene, 1700000000001);
    expect(events.map((event) => event.hasPlayer)).toEqual([false]);
  });

  it('the player is a REFUSAL PLANES plane: the fourth account is enumerable and its own gaps are named', () => {
    const census = runtime.refusalCensus();
    expect(census.planes).toContain('player-record');
    // Exactly one name is refused by the player record and by nothing else's reading of it: `inventory`.
    expect(census.rows.filter((row) => row.refusedBy.includes('player-record')).map((row) => row.field)).toEqual(['inventory']);
    // And the account a caller reads answers in the table's words, never a reason written at the call site.
    withPlayer();
    expect(runtime.playerFieldAudit(scene)!.untouched).toEqual(refusalsFor('player-record'));
    expect(refusalsFor('player-record').length).toBe(1);
  });
});

/**
 * M5 v137 — the declared player numbers get OPERATIONS. v136 gave the record a body and a file and said out
 * loud in its own bounds that the record is FILED AND NEVER DRIVEN: nothing read `health`, `mana`,
 * `experience` or `level` to change anything. This suite drives them — and refuses, by name, everything a drive
 * would otherwise invent: a negative amount (a sign that silently reverses an operation is how a damage call
 * becomes a healing one), a spell the pool cannot cover (a clamp would hand over a spell nobody paid for), and a
 * LEVEL, which this runtime derives from nothing at all.
 */
describe('M5 v137 — the player record’s declared numbers get operations', () => {
  function withPlayedPlayer(options: PlayerAttachOptions = {}): Player {
    withEntity(new THREE.Vector3(1.5, 2.25, -3.75));
    return runtime.attachPlayer(scene, hero, options);
  }

  it('damagePlayer takes health down by what LANDS, and an overkill blow reports less than it asked for', () => {
    withPlayedPlayer({ health: 30, maxHealth: 100 });
    const report = runtime.damagePlayer(scene, 12, 'fall');
    expect([report.amount, report.damage, report.health, report.maxHealth, report.died, report.reason])
      .toEqual([12, 12, 18, 100, false, 'fall']);
    const overkill = runtime.damagePlayer(scene, 999);
    expect([overkill.amount, overkill.damage, overkill.health, overkill.died, overkill.reason])
      .toEqual([999, 18, 0, true, '']);
    // The record IS the numbers the report describes: a report that disagreed with the live record would be a
    // second owner of one fact.
    expect(runtime.getPlayer(scene)!.health).toBe(0);
  });

  it('damagePlayer refuses an amount that is not a finite non-negative number, and names the operation', () => {
    withPlayedPlayer();
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, '5' as unknown as number]) {
      expect(() => runtime.damagePlayer(scene, bad))
        .toThrow(/damagePlayer: amount is .*an operation takes a finite, non-negative number/);
    }
    expect(runtime.getPlayer(scene)!.health, 'a refused blow moved nothing').toBe(100);
  });

  it('the death boundary is crossed once: playerDied fires on the blow that reaches zero, and not on the next', () => {
    withPlayedPlayer({ health: 5, maxHealth: 5 });
    const died: unknown[] = [];
    runtime.addEventListener('playerDied', (data: unknown) => died.push(data));
    expect(runtime.damagePlayer(scene, 0).died, 'a zero-damage blow is not a death').toBe(false);
    expect(runtime.damagePlayer(scene, 2).died).toBe(false);
    expect(runtime.damagePlayer(scene, 3).died).toBe(true);
    expect(runtime.damagePlayer(scene, 4).died, 'a blow on a corpse is not a second death').toBe(false);
    expect(died.length).toBe(1);
  });

  it('healPlayer clamps at maxHealth, and a heal at full health answers a report of zero rather than refusing', () => {
    withPlayedPlayer({ health: 90, maxHealth: 100 });
    expect(runtime.healPlayer(scene, 4)).toMatchObject({ amount: 4, healed: 4, health: 94, maxHealth: 100 });
    const clamped = runtime.healPlayer(scene, 50);
    expect([clamped.healed, clamped.health]).toEqual([6, 100]);
    const full = runtime.healPlayer(scene, 10);
    expect([full.healed, full.health]).toEqual([0, 100]);
  });

  it('spendMana refuses a spend the pool cannot cover, naming both numbers, and takes exactly what is left', () => {
    withPlayedPlayer({ mana: 12, maxMana: 50 });
    expect(runtime.spendMana(scene, 12)).toMatchObject({ amount: 12, mana: 0, maxMana: 50 });
    expect(() => runtime.spendMana(scene, 1))
      .toThrow(/spendMana: the player holds 0 mana and this call spends 1; a spend larger than the pool is refused rather than clamped/);
    expect(runtime.getPlayer(scene)!.mana, 'a refused spend is not a partial one').toBe(0);
    expect(runtime.spendMana(scene, 0).mana).toBe(0);
  });

  it('gainExperience adds to the declared number and moves NO level, and the report carries the level that did not move', () => {
    withPlayedPlayer({ experience: 0, level: 3 });
    const report = runtime.gainExperience(scene, 12_500);
    expect([report.amount, report.experience, report.level]).toEqual([12500, 12500, 3]);
    // The bound stated as a case: a number this large is exactly the shape a threshold table would fire on, and
    // nothing here fires, because this runtime implements no curve.
    expect(runtime.gainExperience(scene, 1_000_000).level).toBe(3);
    expect(runtime.getPlayer(scene)!.level).toBe(3);
  });

  it('setPlayerLevel is the only door a level changes through: a zero, a fractional or a non-finite level is refused', () => {
    withPlayedPlayer({ level: 1 });
    expect(runtime.setPlayerLevel(scene, 7)).toMatchObject({ level: 7 });
    for (const bad of [0, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => runtime.setPlayerLevel(scene, bad))
        .toThrow(/setPlayerLevel: level is .*a level is a finite integer of at least 1/);
    }
    expect(runtime.getPlayer(scene)!.level).toBe(7);
  });

  it('every operation refuses a scene with no player, by naming the scene', () => {
    withEntity();
    for (const call of [
      () => runtime.damagePlayer(scene, 1),
      () => runtime.healPlayer(scene, 1),
      () => runtime.spendMana(scene, 1),
      () => runtime.gainExperience(scene, 1),
      () => runtime.setPlayerLevel(scene, 2),
    ]) {
      expect(call).toThrow(/has no player, and an operation on a record that is not there would move numbers nothing owns/);
    }
    expect(() => runtime.damagePlayer(sid('no-such-scene'), 1))
      .toThrow(/damagePlayer: scene no-such-scene has no player/);
  });

  it('the numbers an operation leaves are the numbers a save carries, through a real store', () => {
    const store = createMemorySaveStore();
    const writer = runtimeWithStore(store);
    const stage = writer.createScene('Stage').id;
    writer.setActiveScene(stage);
    const body = withEntityIn(writer, stage);
    writer.attachPlayer(stage, body, {
      health: 40, maxHealth: 40, mana: 9, maxMana: 9, experience: 0, level: 2, skills: { sneak: 4 },
    });
    writer.damagePlayer(stage, 6, 'trap');
    writer.healPlayer(stage, 2);
    writer.spendMana(stage, 4);
    writer.gainExperience(stage, 300);
    writer.setPlayerLevel(stage, 5);
    const file = writer.buildSaveFile(stage, 1700000000000);
    expect(offenders(JSON.parse(JSON.stringify(file)))).toEqual([]);
    store.write('saves/after.json', JSON.stringify(file));

    const reader = runtimeWithStore(store);
    reader.createScene('Copy', stage);
    reader.setActiveScene(stage);
    reader.readSaveFile('saves/after.json', stage);
    const player = reader.getPlayer(stage)!;
    expect([player.health, player.maxHealth, player.mana, player.maxMana, player.experience, player.level])
      .toEqual([36, 40, 5, 9, 300, 5]);
    expect([...player.skills.entries()]).toEqual([['sneak', 4]]);
    writer.dispose();
    reader.dispose();
  });

  it('each operation says so on the event bus, with the report it returned', () => {
    withPlayedPlayer({ health: 10, maxHealth: 10, mana: 5, maxMana: 5, level: 1 });
    const seen: [string, unknown][] = [];
    for (const name of ['playerDamaged', 'playerHealed', 'playerManaSpent', 'playerExperienceGained', 'playerLevelSet']) {
      runtime.addEventListener(name, (data: unknown) => seen.push([name, data]));
    }
    const damaged = runtime.damagePlayer(scene, 4);
    const healed = runtime.healPlayer(scene, 1);
    const spent = runtime.spendMana(scene, 2);
    const gained = runtime.gainExperience(scene, 7);
    const leveled = runtime.setPlayerLevel(scene, 2);
    expect(seen).toEqual([
      ['playerDamaged', damaged],
      ['playerHealed', healed],
      ['playerManaSpent', spent],
      ['playerExperienceGained', gained],
      ['playerLevelSet', leveled],
    ]);
  });

  it('a dead record is still a record: health never goes below zero, and a corpse can be healed', () => {
    withPlayedPlayer({ health: 3, maxHealth: 10 });
    expect(runtime.damagePlayer(scene, 100).health).toBe(0);
    expect(runtime.getPlayer(scene)!.health).toBe(0);
    expect(runtime.healPlayer(scene, 4)).toMatchObject({ healed: 4, health: 4 });
    // And nothing about the SHAPE changed: the file still carries the half, and the audit still names one gap.
    expect(runtime.playerSnapshot(scene)).not.toBeNull();
    expect(runtime.playerFieldAudit(scene)!.untouched.map((entry) => entry.field)).toEqual(['inventory']);
  });
});

/**
 * M5 v256 — the save file's row ORDER, and the key that makes it mean something.
 *
 * `buildSaveFile` lays its rows out by SORTING the scene's entity ids, and until this grant an id was spelled
 * `entity-<millisecond>-<random>`. Two bodies minted in one millisecond therefore arrived in the file in an
 * order decided by a coin flip: measured at the shipped build, a loop of 200 creations put 183 of its 199
 * adjacent pairs inside a single millisecond and left 177 of the 200 rows in a position that was not their
 * creation position, and two runtimes built the same way wrote different name orders. A reader that takes
 * `entities[0]` to be "the first body" is reading that race — which is what
 * `docs/evidence/agents/scene-tools-proof.mjs` does at its §6, measured 5 red out of 10 runs at rest.
 *
 * The decision (ADR 0016 amendment 256) keeps the sort and fixes its key: an id now spells
 * `<millisecond>-<this runtime's own counter, fixed width>-<random tail>`. Sorting ids therefore sorts
 * creation order, and the tail only separates two runtimes that minted the same body number in the same
 * millisecond — where it does what a tail is for, which is preventing a collision, not choosing a row.
 * These cases hold both halves: the arithmetic of the key, and the rows the key produces. The load-bearing
 * pair is the one where a body ARRIVES late but was MADE early, because that is the only state in which
 * "sorted by id" and "left in map order" give different answers.
 */
describe('M5 v256 — a save file’s rows are ordered by CREATION, not by a coin flip', () => {
  const ID_SHAPE = /^entity-(?<ms>\d{13})-(?<stamp>\d{8})-(?<tail>[a-z0-9]+)$/;

  /** `count` mesh bodies in one tight loop, named in creation order and returned in it. */
  function mint(rt: ThreeRuntime, scene: SceneId, count: number): EntityId[] {
    const ids: EntityId[] = [];
    for (let i = 0; i < count; i += 1) ids.push(rt.createEntity(scene, `b${i}`, 'mesh').id);
    return ids;
  }

  /** The three fields of a minted id, or a crash naming the id whose spelling this grant no longer mints. */
  function fieldsOf(id: EntityId): { ms: string; stamp: string; tail: string } {
    const found = ID_SHAPE.exec(id);
    if (!found?.groups) throw new Error(`id ${id} is not spelled entity-<13-digit ms>-<8-digit stamp>-<tail>`);
    return found.groups as { ms: string; stamp: string; tail: string };
  }

  it('mints a stamp that is fixed-width and strictly increasing, so the sort key IS the creation order', () => {
    // The clock is PINNED for the mint loop. The 9→10 crossing inside one millisecond is the state an
    // unpadded counter gets wrong, and racing the host to produce it made this case measure the machine:
    // CI run 40664263104 failed it because a fast ubuntu loop crossed the millisecond boundary before
    // stamp 10. With `Date.now` frozen the crossing exists by construction on every host, and the sort
    // assertion below still fails on an unpadded counter — that is the property, not the host's speed.
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    let ids: EntityId[];
    try {
      ids = mint(runtime, scene, 200);
    } finally {
      clock.mockRestore();
    }
    const malformed = ids.filter((id) => !ID_SHAPE.test(id));
    expect(malformed.slice(0, 3), `${malformed.length} of ${ids.length} minted ids do not spell <ms>-<8-digit stamp>-<tail>: ${malformed.slice(0, 3).join(', ')}`).toEqual([]);

    const stamps = ids.map((id) => Number(fieldsOf(id).stamp));
    const notRising = stamps.filter((value, index) => index > 0 && value <= stamps[index - 1]!);
    expect(notRising, `the stamp must strictly increase with every mint; it did not at ${notRising.join(', ')}`).toEqual([]);

    // The arithmetic the padding buys, measured from the SAME ids rather than asserted about them: a
    // millisecond that holds both stamp 9 and stamp 10 is the state where an UNPADDED counter would sort
    // `10` before `9`. Zero of these means this case graded no padding at all, so it is a red, not a green.
    const nineToTen = ids.filter((id, index) => {
      if (index === 0) return false;
      const here = fieldsOf(id);
      const before = fieldsOf(ids[index - 1]!);
      return here.ms === before.ms && Number(here.stamp) === 10 && Number(before.stamp) === 9;
    }).length;
    expect(nineToTen, 'the pinned clock put every mint in one millisecond, so the 9 into 10 crossing must exist — a zero here means the mint loop read a clock it was told not to').toBeGreaterThan(0);

    // And the claim the file acts on: sorting the ids answers with the order the bodies were made.
    expect([...ids].sort(), 'sorting minted ids must answer with creation order').toEqual(ids);
  });

  it('writes every entity row in creation order, including the ones minted in the same millisecond', () => {
    const ids = mint(runtime, scene, 200);
    const file = runtime.buildSaveFile(scene, 1700000000000);
    expect(file.entities.length).toBe(200);
    expect(file.entities.map(([id]) => id), 'row ids follow creation').toEqual(ids);
    expect(file.entities.map(([, row]) => row.name), 'and so do the names the rows carry')
      .toEqual(ids.map((_id, index) => `b${index}`));
  });

  it('writes the same row order for the same construction, in two runtimes that never spoke to each other', () => {
    const other = freshWorld();
    const twin = other.createScene('Twin').id;
    const mine = mint(runtime, scene, 50).map((_id, index) => `b${index}`);
    const theirs = mint(other, twin, 50).map((_id, index) => `b${index}`);
    const from = (rt: ThreeRuntime, id: SceneId) => rt.buildSaveFile(id, 1).entities.map(([, row]) => row.name);
    expect(from(runtime, scene), 'the first runtime orders its rows by creation').toEqual(mine);
    expect(from(other, twin), 'so does the second').toEqual(theirs);
    expect(from(other, twin), 'and the two answers are the same sequence').toEqual(from(runtime, scene));
    other.dispose();
  });

  it('orders rows by when a body was MADE, not by when it arrived in this process', () => {
    const early = runtime.createEntity(scene, 'Early', 'mesh').id;
    const snapshot = runtime.snapshotEntity(scene, early);
    runtime.removeEntity(scene, early);
    const late = mint(runtime, scene, 5);
    const restored = runtime.restoreEntity(scene, snapshot);

    // The scene's own insertion order now says the opposite: five bodies that were made LATER arrived FIRST.
    expect([...runtime.getScene(scene)!.entities.keys()], 'insertion order would have put the late bodies first')
      .toEqual([...late, restored.id]);
    expect(runtime.buildSaveFile(scene, 1).entities.map(([id]) => id), 'the file says otherwise: the body made first is row 0')
      .toEqual([restored.id, ...late]);
  });

  it('orders the NPC rows by the same rule as the body rows', () => {
    const early = runtime.createEntity(scene, 'Early', 'mesh').id;
    const snapshot = runtime.snapshotEntity(scene, early);
    runtime.removeEntity(scene, early);
    const late = runtime.createEntity(scene, 'Late', 'mesh').id;
    const restored = runtime.restoreEntity(scene, snapshot);
    runtime.attachNPC(scene, restored.id);
    runtime.attachNPC(scene, late);

    const file = runtime.buildSaveFile(scene, 1);
    expect(file.npcs.map(([id]) => id), 'the record about the earlier-made body is the earlier row')
      .toEqual([restored.id, late]);
    expect([...runtime.getScene(scene)!.entities.keys()], 'and that is not what arrival order said')
      .toEqual([late, restored.id]);
  });
});
