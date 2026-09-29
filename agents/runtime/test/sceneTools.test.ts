import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../src/registry.js';
import {
  SCENE_ENTITY_KINDS,
  SCENE_TOOL_SPECS,
  registerSceneTools,
  type SceneDriver,
  type SceneEntitySpec,
  type SceneSummary,
} from '../src/sceneTools.js';

/**
 * M5 v140 — the `scene.*` family, and the first consumer of the 3D lane.
 *
 * Every M5 grant so far has had to write the same bound: *no consumer imports `@nexus/three-runtime`*.
 * This suite is the agent-side half of closing it. The real wiring against the real package is proven in
 * `docs/evidence/agents/scene-tools-proof.mjs`; here a RECORDING fake stands in, so the family's own rules
 * can be asserted without a renderer — the same split `browserTools` uses.
 *
 * What is asserted is what the family OWNS: the doors' refusals, that the scene must exist before a body
 * is added to it, that a partial position triple is refused rather than defaulted, that the registry's §28
 * gate is the only gate, and that nothing in this family can be mistaken for a rendered picture.
 */

/** A recording fake that answers like a small scene graph and remembers every call. */
function fakeDriver(over: Partial<SceneDriver> = {}) {
  const scenes = new Map<string, { name: string; entities: { id: string; spec: SceneEntitySpec }[]; cameras: { id: string; name: string }[]; active: string | null }>();
  const calls: string[] = [];
  let seq = 0;
  const next = (p: string) => `${p}-${++seq}`;

  const base: SceneDriver = {
    engine: 'fake-scene',
    createScene(name) {
      calls.push(`createScene:${name}`);
      const id = next('scene');
      scenes.set(id, { name, entities: [], cameras: [], active: null });
      return id;
    },
    addEntity(sceneId, spec) {
      calls.push(`addEntity:${sceneId}:${spec.name}:${spec.kind}`);
      const scene = scenes.get(sceneId);
      if (!scene) throw new Error(`fake: no scene ${sceneId}`);
      const id = next('entity');
      scene.entities.push({ id, spec });
      return id;
    },
    removeEntity(sceneId, entityId) {
      calls.push(`removeEntity:${sceneId}:${entityId}`);
      const scene = scenes.get(sceneId);
      if (!scene) return false;
      const before = scene.entities.length;
      scene.entities = scene.entities.filter((e) => e.id !== entityId);
      return scene.entities.length < before;
    },
    addCamera(sceneId, name) {
      calls.push(`addCamera:${sceneId}:${name}`);
      const scene = scenes.get(sceneId);
      if (!scene) throw new Error(`fake: no scene ${sceneId}`);
      const id = next('camera');
      scene.cameras.push({ id, name });
      if (scene.active === null) scene.active = id; // the real runtime's rule: the first camera is active
      return id;
    },
    setActiveCamera(sceneId, cameraId) {
      calls.push(`setActiveCamera:${sceneId}:${cameraId}`);
      const scene = scenes.get(sceneId);
      if (!scene) return false;
      if (!scene.cameras.some((c) => c.id === cameraId)) return false;
      scene.active = cameraId;
      return true;
    },
    summarize(sceneId) {
      const scene = scenes.get(sceneId);
      if (!scene) return undefined;
      const summary: SceneSummary = {
        sceneId,
        name: scene.name,
        entities: scene.entities.length,
        cameras: scene.cameras.length,
        animations: 0,
        entityNames: scene.entities.map((e) => e.spec.name),
        cameraNames: scene.cameras.map((c) => c.name),
        activeCamera: scene.active,
      };
      return summary;
    },
  };
  return { driver: { ...base, ...over } as SceneDriver, calls, scenes };
}

function wired(over: Partial<SceneDriver> = {}) {
  const f = fakeDriver(over);
  const registry = registerSceneTools(new ToolRegistry(), f.driver);
  const approve = { checkpoint: () => true };
  const invoke = (tool: string, args: Record<string, unknown> = {}, opts: unknown = approve) =>
    registry.invoke({ callId: `c-${tool}-${Math.random()}`, tool, args }, opts as never);
  return { ...f, registry, invoke };
}

describe('scene tools — the family routes every spec it declares', () => {
  it('registers every declared door (an unrouted tool is a silent hole)', () => {
    const { registry } = wired();
    for (const spec of SCENE_TOOL_SPECS) {
      expect(registry.get(spec.name), `${spec.name} is not registered`).toBeDefined();
    }
  });

  it('declares exactly one read-class door, and it is the inspector', () => {
    // A read door asks no checkpoint; every other door here writes. If a second read door appeared, it
    // would be a mutation that skipped the §28 gate — so the count is asserted, not just the name.
    const read = SCENE_TOOL_SPECS.filter((s) => s.permissions.includes('read'));
    expect(read.map((s) => s.name)).toEqual(['scene.inspect']);
  });
});

describe('scene tools — the §28 gate is the registry’s, and it is the only one', () => {
  it('a write door does not run without a checkpoint', async () => {
    const { invoke, calls } = wired();
    const r = await invoke('scene.create', { name: 'Arena' }, {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/checkpoint/i);
    expect(calls).toEqual([]); // nothing reached the driver
  });

  it('the read door runs with NO checkpoint', async () => {
    const { invoke } = wired();
    const created = await invoke('scene.create', { name: 'Arena' });
    const sceneId = (created.output as { sceneId: string }).sceneId;
    const r = await invoke('scene.inspect', { sceneId }, {});
    expect(r.ok).toBe(true);
    expect((r.output as { name: string }).name).toBe('Arena');
  });

  it('args are validated by the registry before the driver sees them', async () => {
    const { invoke, calls } = wired();
    const r = await invoke('scene.create', {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/missing required/);
    expect(calls).toEqual([]);
  });
});

describe('scene tools — refusals that name the fact', () => {
  it('a body cannot be added to a scene the driver does not hold', async () => {
    const { invoke } = wired();
    const r = await invoke('scene.entity.add', { sceneId: 'scene-nope', name: 'Cube', kind: 'mesh' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no scene scene-nope is held by the fake-scene driver/);
  });

  it('a partial position triple is refused rather than defaulted', async () => {
    const { invoke } = wired();
    const created = await invoke('scene.create', { name: 'Arena' });
    const sceneId = (created.output as { sceneId: string }).sceneId;
    const r = await invoke('scene.entity.add', { sceneId, name: 'Cube', kind: 'mesh', x: 1, y: 2 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/position needs all three of x, y and z, or none/);
  });

  it('a non-finite axis is refused by name of the axis', async () => {
    const { invoke } = wired();
    const created = await invoke('scene.create', { name: 'Arena' });
    const sceneId = (created.output as { sceneId: string }).sceneId;
    const r = await invoke('scene.entity.add', { sceneId, name: 'Cube', kind: 'mesh', x: 1, y: Number.NaN, z: 3 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/position y is NaN/);
  });

  it('an unknown kind lists the declared ones instead of storing a word nothing reads', async () => {
    const { invoke } = wired();
    const created = await invoke('scene.create', { name: 'Arena' });
    const sceneId = (created.output as { sceneId: string }).sceneId;
    const r = await invoke('scene.entity.add', { sceneId, name: 'Cube', kind: 'torus' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/the declared kinds are mesh, group, sprite, points, line, skinnedMesh/);
  });

  it('the declared kinds are exactly the ones the runtime declares', () => {
    expect([...SCENE_ENTITY_KINDS]).toEqual(['mesh', 'group', 'sprite', 'points', 'line', 'skinnedMesh']);
  });

  it('an empty required string is refused, not passed through', async () => {
    const { invoke } = wired();
    const r = await invoke('scene.create', { name: '' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/name must be a non-empty string/);
  });
});

describe('scene tools — what a door answers', () => {
  it('create answers the id, the name, and that NOTHING was rendered', async () => {
    const { invoke } = wired();
    const r = await invoke('scene.create', { name: 'Arena' });
    expect(r.ok).toBe(true);
    expect(r.output).toMatchObject({ engine: 'fake-scene', name: 'Arena', rendered: false });
    expect((r.output as { sceneId: string }).sceneId).toBeTruthy();
  });

  it('adding a body reports the position it was given, or null when none was named', async () => {
    const { invoke } = wired();
    const created = await invoke('scene.create', { name: 'Arena' });
    const sceneId = (created.output as { sceneId: string }).sceneId;

    const placed = await invoke('scene.entity.add', { sceneId, name: 'Cube', kind: 'mesh', x: 1, y: 2, z: 3 });
    expect((placed.output as { position: number[] }).position).toEqual([1, 2, 3]);
    expect((placed.output as { rendered: boolean }).rendered).toBe(false);

    const unplaced = await invoke('scene.entity.add', { sceneId, name: 'Loose', kind: 'group' });
    expect((unplaced.output as { position: unknown }).position).toBeNull(); // not [0,0,0]: nothing was named
  });

  it('removing a body that is not there answers false rather than throwing', async () => {
    const { invoke } = wired();
    const created = await invoke('scene.create', { name: 'Arena' });
    const sceneId = (created.output as { sceneId: string }).sceneId;
    const r = await invoke('scene.entity.remove', { sceneId, entityId: 'entity-ghost' });
    expect(r.ok).toBe(true);
    expect((r.output as { removed: boolean }).removed).toBe(false);
  });

  it('the first camera becomes active, and the report reads that from the driver', async () => {
    const { invoke } = wired();
    const created = await invoke('scene.create', { name: 'Arena' });
    const sceneId = (created.output as { sceneId: string }).sceneId;
    const first = await invoke('scene.camera.add', { sceneId, name: 'Main' });
    const cameraId = (first.output as { cameraId: string }).cameraId;
    expect((first.output as { activeCamera: string }).activeCamera).toBe(cameraId);

    const second = await invoke('scene.camera.add', { sceneId, name: 'Top' });
    // A second camera does NOT steal focus — reported from the summary, not asserted by this family.
    expect((second.output as { activeCamera: string }).activeCamera).toBe(cameraId);
  });

  it('focusing an unknown camera answers false and leaves the active one alone', async () => {
    const { invoke } = wired();
    const created = await invoke('scene.create', { name: 'Arena' });
    const sceneId = (created.output as { sceneId: string }).sceneId;
    const cam = await invoke('scene.camera.add', { sceneId, name: 'Main' });
    const cameraId = (cam.output as { cameraId: string }).cameraId;

    const r = await invoke('scene.camera.focus', { sceneId, cameraId: 'camera-ghost' });
    expect(r.ok).toBe(true);
    expect((r.output as { focused: boolean }).focused).toBe(false);
    expect((r.output as { activeCamera: string }).activeCamera).toBe(cameraId);
  });

  it('inspect reports STRUCTURE — counts and names — and never a picture', async () => {
    const { invoke } = wired();
    const created = await invoke('scene.create', { name: 'Arena' });
    const sceneId = (created.output as { sceneId: string }).sceneId;
    await invoke('scene.entity.add', { sceneId, name: 'Cube', kind: 'mesh' });
    await invoke('scene.entity.add', { sceneId, name: 'Loose', kind: 'group' });
    await invoke('scene.camera.add', { sceneId, name: 'Main' });

    const r = await invoke('scene.inspect', { sceneId });
    expect(r.ok).toBe(true);
    const out = r.output as SceneSummary & { engine: string };
    expect(out).toMatchObject({ engine: 'fake-scene', name: 'Arena', entities: 2, cameras: 1, animations: 0 });
    expect(out.entityNames).toEqual(['Cube', 'Loose']);
    expect(out.cameraNames).toEqual(['Main']);

    // The §60 rule this family is written to: nothing here can be mistaken for a rendered image. No key
    // in the answer holds pixels, and the word for one never appears.
    expect(JSON.stringify(out)).not.toMatch(/screenshot|base64|png|jpeg|placeholder/i);
  });

  it('inspect refuses a scene the driver does not hold, rather than answering an empty one', async () => {
    const { invoke } = wired();
    const r = await invoke('scene.inspect', { sceneId: 'scene-nope' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no scene scene-nope is held/);
  });

  it('a driver that answers with a PROMISE is awaited like one that answers directly', async () => {
    // The seam allows either shape (the `TreeReaper` precedent), so the async path is exercised here
    // rather than assumed from the sync one.
    const { invoke } = wired({
      createScene: async (name: string) => `async-${name}`,
      summarize: async (sceneId: string) => ({
        sceneId,
        name: 'Async',
        entities: 0,
        cameras: 0,
        animations: 0,
        entityNames: [],
        cameraNames: [],
        activeCamera: null,
      }),
    });
    const created = await invoke('scene.create', { name: 'Async' });
    expect((created.output as { sceneId: string }).sceneId).toBe('async-Async');
    const inspected = await invoke('scene.inspect', { sceneId: 'async-Async' });
    expect(inspected.ok).toBe(true);
    expect((inspected.output as { name: string }).name).toBe('Async');
  });

  it('a driver that throws becomes a failed CALL, not a crash of the registry', async () => {
    const { invoke } = wired({
      createScene: () => {
        throw new Error('driver exploded');
      },
    });
    const r = await invoke('scene.create', { name: 'Arena' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/driver exploded/);
  });
});
