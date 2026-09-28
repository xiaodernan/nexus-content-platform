import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as publicSurface from '../src/index.js';
import { createThreeRuntime, type ThreeRuntime } from '../src/threeRuntime.js';
import type { EntityComponent, EntityId, SceneId, SerializedEntity, ThreeEntity } from '../src/types.js';
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
    expect(seen[0].sceneId).toBe(scene);
    expect(seen[0].entityId).toBe(saved.id);
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
    expect(audit.savable).toEqual(['entities', 'cinematic']);
    expect(audit.blocked.map((entry) => entry.field)).toEqual(
      ['sceneGraph', 'npcs', 'quests', 'player', 'worldState']
    );
    for (const entry of audit.blocked) {
      expect(entry.needs.length, `${entry.field} must say WHY it is blocked`).toBeGreaterThan(0);
    }
    expect(audit.blocked.find((entry) => entry.field === 'npcs')!.needs).toMatch(/implemented by nothing/);
  });
});

describe('the shipped shape and the shipped builder are the same set (read from types.ts)', () => {
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
        if (field) fields.push(field[1]);
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
    expect(saveDoors.sort()).toEqual(['cinematicSnapshot', 'restoreCinematic', 'restoreEntity', 'snapshotEntity']);

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
  const savedTypes = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

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

  /** Every value inside `value` that a file cannot hold. */
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

  it('carries the two fields it can fill and names the five it leaves out', () => {
    const events: { entityCount: number; sequenceCount: number }[] = [];
    runtime.addEventListener('saveFileBuilt', (data) => events.push(data as { entityCount: number; sequenceCount: number }));
    const { file } = fileWithContent();
    expect(file.format).toBe('nexus-three-runtime-save');
    expect(file.version).toBe(1);
    expect(file.carries).toEqual(['entities', 'cinematic']);
    expect(file.doesNotCarry.map((entry) => entry.field)).toEqual(['sceneGraph', 'npcs', 'quests', 'player', 'worldState']);
    for (const entry of file.doesNotCarry) expect(entry.needs.length, `${entry.field} must say why it is absent`).toBeGreaterThan(0);
    expect(file.entities.length).toBe(1);
    expect(file.cinematic.sequences.length).toBe(1);
    expect(file.savedAt).toBe(1700000000000);
    expect(events).toEqual([{ sceneId: scene, entityCount: 1, sequenceCount: 1, carries: ['entities', 'cinematic'], doesNotCarry: ['sceneGraph', 'npcs', 'quests', 'player', 'worldState'] }]);
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
    other.createScene('World again', bytes.cinematic.sequences[0][1].sceneId);
    other.setActiveScene(bytes.cinematic.sequences[0][1].sceneId);
    other.createCamera(bytes.cinematic.sequences[0][1].sceneId, 'Cam again', 'perspective', {}, cam);
    const report = other.loadSaveFile(bytes, bytes.cinematic.sequences[0][1].sceneId);
    expect(report).toEqual({
      sceneId: bytes.cinematic.sequences[0][1].sceneId,
      entities: bytes.entities.map(([id]) => id),
      sequences: ['seq'],
      carries: ['entities', 'cinematic'],
    });
    // The position a file carried, and the camera position the restored curve puts the player at.
    const loaded = other.getEntity(report.sceneId, bytes.entities[0][0])!;
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

  it('refuses a file whose format or version is not this one’s, printing every problem at once', () => {
    const { file } = fileWithContent();
    expect(() => runtime.loadSaveFile({ ...file, format: 'nexus-save' as typeof file.format, version: 2 }, scene))
      .toThrow(/format is "nexus-save", not "nexus-three-runtime-save"; version is 2 and this runtime reads exactly 1/);
  });

  it('refuses a file that claims to carry a field it cannot fill, or that both carries and withholds', () => {
    const { file } = fileWithContent();
    expect(() => runtime.loadSaveFile({ ...file, carries: ['entities', 'cinematic', 'npcs'] } as typeof file, scene))
      .toThrow(/carries "npcs", which this runtime can neither fill nor read/);
    expect(() => runtime.loadSaveFile({
      ...file,
      doesNotCarry: [...file.doesNotCarry, { field: 'entities', needs: 'and also does not' }],
    }, scene)).toThrow(/"entities" appears both as carried and as not carried/);
  });

  it('refuses a file carrying CONTENT under a blocked name rather than loading a smaller game', () => {
    const { file } = fileWithContent();
    const smuggling = { ...file, npcs: [['npc-1', {}]] } as unknown as typeof file;
    expect(() => runtime.loadSaveFile(smuggling, scene))
      .toThrow(/the file holds content under "npcs", a field this runtime cannot read/);
    expect(runtime.getScene(scene)!.entities.size, 'a refused load changes nothing').toBe(1);
  });

  it('refuses a Map or a live object that arrived inside the file, naming the path', () => {
    const { file } = fileWithContent();
    expect(() => runtime.loadSaveFile({ ...file, entities: new Map() } as unknown as typeof file, scene))
      .toThrow(/saveFile: file\.entities holds a Map/);
    const live = structuredClone(file) as typeof file;
    live.entities[0][1].position = new THREE.Vector3(1, 2, 3) as unknown as typeof live.entities[0][1].position;
    expect(() => runtime.loadSaveFile(live, scene)).toThrow(/saveFile: file\.entities\[0\]\[1\]\.position holds a Vector3/);
  });

  it('refuses to load into a scene that is not there, and refuses to overwrite a live entity', () => {
    const { file } = fileWithContent();
    expect(() => runtime.loadSaveFile(file, sid('no-such-scene'))).toThrow(/scene no-such-scene does not exist/);

    const target = freshWorld();
    target.createScene('Other', 'other');
    const moved = structuredClone(file) as typeof file;
    moved.entities[0][0] = eid('dup');
    moved.entities[0][1].id = eid('dup');
    target.restoreEntity(sid('other'), moved.entities[0][1]);
    expect(() => target.loadSaveFile({ ...moved, cinematic: { sequences: [], activeSequence: null, currentTime: 0 } }, sid('other')))
      .toThrow(/entity dup \(entities\[0\]\) is already in scene other/);
    // …and the pair's key is checked against the id the restore will use, because a pair with two names for
    // one entity is the same two-owners defect the envelope checks already refuse elsewhere.
    const twoNames = structuredClone(file) as typeof file;
    twoNames.entities[0][0] = eid('key');
    let mismatch = '';
    try {
      target.loadSaveFile({ ...twoNames, cinematic: { sequences: [], activeSequence: null, currentTime: 0 } }, sid('other'));
    } catch (error) {
      mismatch = (error as Error).message;
    }
    expect(mismatch).toContain(`entities[0] is keyed key but the record under it says ${twoNames.entities[0][1].id}`);
    expect(target.getScene(sid('other'))!.entities.size).toBe(1);
    target.dispose();
  });

  it('rolls back BOTH halves of a load that fails partway, which v119 could not say', () => {
    const { file } = fileWithContent();
    const second = structuredClone(file) as typeof file;
    second.entities.push([eid('bad'), { ...structuredClone(file.entities[0][1]), id: eid('bad') }]);
    (second.entities[1][1] as unknown as { position: unknown }).position = 'not a vector';
    const loaded = freshWorld();
    const stage = second.cinematic.sequences[0][1].sceneId;
    loaded.createScene('Stage', stage);
    loaded.createCamera(stage, 'Cam again', 'perspective', {}, second.cinematic.sequences[0][1].shots[0].cameraId);
    expect(() => loaded.loadSaveFile(second, stage))
      .toThrow(/restoreEntity: position x is undefined[\s\S]*the 1 entity\(ies\) and the 1 sequence\(s\) this load had registered were removed again; a load is all or nothing/);
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
    expect((file.cinematic as { sequences: [string, { playing: boolean }][] }).sequences[0][1].playing).toBe(true);
    const entities = file.entities as [string, Record<string, unknown>][];
    entities.push(['e-bad', { ...structuredClone(entities[0][1]), id: 'e-bad', position: 'not a vector' }]);

    const reader = runtimeWithStore(store);
    reader.createScene('Stage copy', stage);
    reader.setActiveScene(stage);
    reader.createCamera(stage, 'Cam copy', 'perspective', {}, cam);
    const stopped: { sequenceId: string }[] = [];
    reader.addEventListener('cinematicStopped', (d) => stopped.push(d as { sequenceId: string }));
    expect(() => reader.loadSaveFile(file as never, stage))
      .toThrow(/position x is undefined[\s\S]*the 1 entity\(ies\) and the 1 sequence\(s\) this load had registered were removed again; a load is all or nothing/);
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
    misfiled.components = [['vitals', misfiled.components[0][1]]];
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
    expect(runtime.buildSaveFile(scene, 1).entities[0][1].layers).toBe(0);
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
      sequences: 1,
      carries: ['entities', 'cinematic'],
      doesNotCarry: ['sceneGraph', 'npcs', 'quests', 'player', 'worldState'],
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
      sequences: ['seq'],
      carries: ['entities', 'cinematic'],
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
    smuggled.npcs = [['npc-1', {}]];
    store.write('saves/b.json', JSON.stringify(smuggled));

    const reader = runtimeWithStore(store);
    reader.createScene('Copy', scene2);
    expect(() => reader.readSaveFile('saves/b.json', scene2))
      .toThrow(/"saves\/b.json" holds a file this runtime cannot load: .*content under "npcs"/);
    expect(reader.getScene(scene2)!.entities.size, 'a refused read leaves the scene alone').toBe(0);
    expect(store.read('saves/a.json'), 'the refused copy is a different file; the good one is untouched').toBe(store.read('saves/a.json'));
    expect(JSON.parse(store.read('saves/a.json')!).npcs).toBeUndefined();
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
    writer.addEventListener('saveFileWritten', (d) => events.push({ ...brief(d), kind: 'written' }));
    const report = writer.writeSaveFile('saves/e.json', scene2, 1);
    const reader = runtimeWithStore(store);
    reader.createScene('Copy', scene2);
    reader.addEventListener('saveFileRead', (d) => events.push({ ...brief(d), kind: 'read' }));
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
      const opener = new RegExp(`export interface ${name} \\{`).exec(savedTypes);
      if (!opener) throw new Error(`${name} is no longer declared in src/types.ts`);
      const lines = savedTypes.slice(opener.index + opener[0].length).split('\n');
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
        for (const match of annotation[1].matchAll(/\b([A-Z][A-Za-z0-9_]*)\b(\[[^\]]*\])?/g)) {
          const [, name, subscript] = match;
          if (subscript && subscript !== '[]') continue;
          names.add(name);
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
        if (!savedTypes.includes(`export interface ${next} `)) { unresolved.add(next); continue; }
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    const shape = [...seen].map((name) => `${name}\n${bodyOf(name)}`).join('\n');
    // `SerializedCurve` is reachable only by walking SaveFile → SerializedCinematic → the sequence → the
    // shot → the path, so its presence proves the walk went three hops rather than returning one name.
    expect([...seen].sort()).toContain('SerializedCurve');
    expect([...seen].sort(), `names in types.ts that the walk could not open: ${[...unresolved].join(', ')}`)
      .toEqual(['EntityComponent', 'PostProcessingConfig', 'PostProcessingPass', 'SaveFile', 'SerializedCinematic', 'SerializedCinematicSequence', 'SerializedCinematicShot', 'SerializedCurve', 'SerializedEntity', 'SerializedEuler', 'SerializedVector3']);
    expect(shape).not.toMatch(/:\s*Map</);
    expect(shape).not.toMatch(/THREE\./);
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
    rt.addEventListener('saveFileDeleted', (d) => deleted.push(d));
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
      host.readdirSync = (p) => [...tree.keys()].filter((k) => k.startsWith(`${p}/`)).map((k) => k.slice(p.length + 1).split('/')[0]).filter((v, i, a) => a.indexOf(v) === i);
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
    expect(runtimeWithStore(store).listSaveFiles()).toEqual({ store: 'fs', paths: [] });
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
      [...tree.keys()].filter((k) => k.startsWith(`${p}/`)).map((k) => k.slice(p.length + 1).split('/')[0]),
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
    // Stand in for the debris v125 describes — a double failure that left a temp behind. Planting it here
    // keeps the test about the sweeper rather than about rigging two host faults in sequence.
    store.write('x.json.tmp', 'half-written junk');
    expect(store.list()).toEqual(['x.json', 'x.json.tmp']);
    const deleted: { path: string }[] = [];
    rt.addEventListener('saveFileDeleted', (d) => deleted.push(d as { path: string }));
    expect(rt.sweepTempFiles()).toEqual({ store: 'fs', removed: ['x.json.tmp'], kept: [] });
    expect(deleted).toEqual([{ path: 'x.json.tmp', store: 'fs', removed: true }]);
    expect(store.list()).toEqual(['x.json']);
    expect(tree.get('saves/root/x.json'), 'a sweep never touches a name it did not pick').toContain('"savedAt":1');
    expect(rt.sweepTempFiles()).toEqual({ store: 'fs', removed: [], kept: [] });
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
      delete: () => false,
    };
    const rt = runtimeWithStore(racing);
    expect(rt.sweepTempFiles()).toEqual({ store: 'memory', removed: [], kept: ['ghost.json.tmp'] });
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
    file.carries = ['entities', 'npcs'];
    store.write('old.json', JSON.stringify(file));

    const diagnosis = rt.diagnoseSaveFile('old.json');
    expect(diagnosis).toEqual({
      path: 'old.json',
      bytes: store.read('old.json')!.length,
      loadable: false,
      problems: [
        'it carries "npcs", which this runtime can neither fill nor read',
        'it omits "cinematic", which this runtime could now write — the file predates that capability',
      ],
      carriedButUnreadableHere: ['npcs'],
      readableNowButNotCarried: ['cinematic'],
    });
    // The pair: the verdict is the load's verdict, not a parallel opinion about it.
    let loadMessage = '';
    try {
      rt.loadSaveFile(file as never, sceneId);
    } catch (error) {
      loadMessage = (error as Error).message;
    }
    expect(loadMessage).toMatch(/the file says it carries "npcs"/);
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
    expect(report.unloadable[0].carriedButUnreadableHere).toEqual(['quests']);
    expect(report.unreadable.map((entry) => entry.path)).toEqual(['junk.json']);
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
        if (m) found.push(m[1]);
      }
      return found;
    };
    const crlf = raw.replace(/\n/g, '\r\n');
    const lf = annotations(raw);
    expect(lf.length, 'the baseline parse found nothing — the gate is reading an empty population').toBeGreaterThan(3);
    expect(annotations(crlf)).toEqual([]);
    expect(annotations(crlf.replace(/\r\n/g, '\n'))).toEqual(lf);
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
