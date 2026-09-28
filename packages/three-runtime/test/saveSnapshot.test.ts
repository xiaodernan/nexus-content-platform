import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as publicSurface from '../src/index.js';
import { createThreeRuntime, type ThreeRuntime } from '../src/threeRuntime.js';
import type { EntityComponent, EntityId, SceneId, SerializedEntity, ThreeEntity } from '../src/types.js';
import { entityId as eid, sceneId as sid } from '../src/types.js';
import { createHeadlessBackend } from '../src/renderBackend.js';

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
  const typesSource = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');

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
  const savedTypes = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');

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

  it('rolls back the entities it had inserted, and says the sequences stayed behind', () => {
    const { file } = fileWithContent();
    const second = structuredClone(file) as typeof file;
    second.entities.push([eid('bad'), { ...structuredClone(file.entities[0][1]), id: eid('bad') }]);
    (second.entities[1][1] as unknown as { position: unknown }).position = 'not a vector';
    const loaded = freshWorld();
    const stage = second.cinematic.sequences[0][1].sceneId;
    loaded.createScene('Stage', stage);
    loaded.createCamera(stage, 'Cam again', 'perspective', {}, second.cinematic.sequences[0][1].shots[0].cameraId);
    expect(() => loaded.loadSaveFile(second, stage))
      .toThrow(/restoreEntity: position x is undefined[\s\S]*the 1 entity\(ies\) this load had inserted were removed again[\s\S]*1 sequence\(s\) restored ahead of them stay registered/);
    expect(loaded.getScene(stage)!.entities.size).toBe(0);
    // …and the half a rollback cannot reach really is there, so the message is not decoration.
    expect(loaded.cinematicFieldAudit('seq')!.playhead.duration).toBe(2);
    loaded.dispose();
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
    const shipped = readFileSync(new URL('../src/threeRuntime.ts', import.meta.url), 'utf8');
    const at = shipped.indexOf('   * Say, for one live entity, what a save would actually carry.');
    expect(at, 'the audit method lost the docstring this claim is pinned to').toBeGreaterThan(-1);
    const doc = shipped.slice(at, shipped.indexOf('*/', at));
    expect(doc).toContain('doesNotCarry');
    expect(doc, 'v117 gave the cinematic half an owner and v119 gave it a reader; a comment still calling it unimplemented is stale')
      .not.toMatch(/a cinematic state the runtime does not implement|file full of empty maps/);
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
