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
  it('copies the three number-bearing fields instead of storing the renderer\'s own objects', () => {
    const entity = withEntity();
    const saved = runtime.snapshotEntity(scene, hero);

    expect(saved.position).not.toBe(entity.threeObject.position);
    expect(saved.rotation).not.toBe(entity.threeObject.rotation);
    expect(saved.scale).not.toBe(entity.threeObject.scale);
    // ...and the copies are still the declared classes, not flattened `{x,y,z}` bags.
    expect(saved.position).toBeInstanceOf(THREE.Vector3);
    expect(saved.rotation).toBeInstanceOf(THREE.Euler);
    expect(saved.scale).toBeInstanceOf(THREE.Vector3);
  });

  it('keeps the saved position when the live entity moves afterwards', () => {
    const entity = withEntity();
    const saved = runtime.snapshotEntity(scene, hero);
    const atSaveTime = saved.position.clone();

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

    expect(saved.components.get('health')!.data).toEqual({ current: 10, tags: ['alive'] });
    expect(saved.components.get('health')!.enabled).toBe(true);

    const restored = reload(saved);
    restored.components.get('health')!.data.current = 7;
    expect(saved.components.get('health')!.data.current).toBe(10);
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
