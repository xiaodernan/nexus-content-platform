import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../src/registry.js';
import {
  SCENE_ENTITY_KINDS,
  SCENE_TOOL_SPECS,
  registerSceneTools,
  type SceneDriver,
  type SceneEntitySpec,
  type SceneSaveFileLike,
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
 * gate is the only one, and that nothing in this family can be mistaken for a rendered picture. v163 adds
 * the save/load pair and the rules only a DOOR can own: the file is passed through unparaphrased, the
 * JSON string is parsed once and refused when it is not a save-file object, and the load target must
 * exist before the driver is asked anything.
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
    // M5 v163 — the save/load pair, answered the way the real runtime answers: the file is the scene's
    // bodies plus the format's own claims, and a restore refuses a live target instead of overwriting it.
    saveScene(sceneId, savedAt) {
      calls.push(`saveScene:${sceneId}:${savedAt}`);
      const scene = scenes.get(sceneId);
      if (!scene) throw new Error(`fake: no scene ${sceneId}`);
      const file: SceneSaveFileLike = {
        format: 'nexus-three-runtime-save',
        version: 1,
        savedAt,
        carries: ['entities', 'npcs', 'worldState', 'player', 'cinematic'],
        doesNotCarry: [{ field: 'videoTextures', needs: 'a video system' }],
        entities: scene.entities.map((e) => [e.id, { id: e.id, name: e.spec.name }]),
        npcs: [],
        worldState: { hour: 9 },
        player: null,
        cinematic: { sequences: [] },
      };
      return file;
    },
    loadScene(sceneId, file) {
      calls.push(`loadScene:${sceneId}:${file.entities.length}`);
      const scene = scenes.get(sceneId);
      if (!scene) throw new Error(`fake: no scene ${sceneId}`);
      // The driver's own anti-overwrite rule, in the fake exactly as the real runtime states it.
      for (const [id] of file.entities) {
        if (scene.entities.some((e) => e.id === id)) {
          throw new Error(`loadSaveFile refused: entity ${id} is already in scene ${sceneId}; a restore never overwrites live state`);
        }
      }
      for (const [id, snapshot] of file.entities) {
        const record = snapshot as { id: string; name: string };
        scene.entities.push({ id, spec: { name: record.name, kind: 'mesh' } });
      }
      return {
        sceneId,
        entities: file.entities.map(([id]) => id),
        npcs: [],
        sequences: [],
        worldState: Object.keys(file.worldState ?? {}),
        player: null,
        carries: [...file.carries],
      };
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

describe('scene.save / scene.load — the scene survives the process (M5 v163)', () => {
  it('save answers the file’s STRUCTURE and hands the file itself along, unparaphrased', async () => {
    const { invoke } = wired();
    const created = await invoke('scene.create', { name: 'Vault' });
    const sceneId = (created.output as { sceneId: string }).sceneId;
    await invoke('scene.entity.add', { sceneId, name: 'Cube', kind: 'mesh' });
    await invoke('scene.entity.add', { sceneId, name: 'Cube II', kind: 'mesh' });

    const r = await invoke('scene.save', { sceneId, savedAt: 5000 });
    expect(r.ok).toBe(true);
    const out = r.output as { engine: string; savedAt: number; format: string; entities: number; carries: string[]; file: SceneSaveFileLike; rendered: boolean };
    expect(out).toMatchObject({ engine: 'fake-scene', savedAt: 5000, format: 'nexus-three-runtime-save', entities: 2, rendered: false });
    expect(out.carries).toContain('entities');
    // The file is the DRIVER's own object, not the door's paraphrase of one — the savedAt the caller
    // named is what the file carries, because the runtime owns no clock of its own.
    expect(out.file.savedAt).toBe(5000);
    expect(out.file.entities).toHaveLength(2);
    expect(JSON.stringify(out.file)).not.toMatch(/screenshot|base64|png|jpeg/i);
  });

  it('save refuses a scene the driver does not hold, before the driver is asked', async () => {
    const { invoke, calls } = wired();
    const r = await invoke('scene.save', { sceneId: 'scene-nope', savedAt: 1 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no scene scene-nope is held/);
    expect(calls.some((c) => c.startsWith('saveScene'))).toBe(false);
  });

  it('load takes the JSON TEXT of a save result, and answers the driver’s own report', async () => {
    const { invoke } = wired();
    const created = await invoke('scene.create', { name: 'Vault' });
    const sceneId = (created.output as { sceneId: string }).sceneId;
    await invoke('scene.entity.add', { sceneId, name: 'Cube', kind: 'mesh', x: 1, y: 2, z: 3 });
    const saved = await invoke('scene.save', { sceneId, savedAt: 5000 });
    const file = (saved.output as { file: SceneSaveFileLike }).file;

    // The roundtrip goes through the string, exactly as a caller over the registry would send it.
    const fresh = await invoke('scene.create', { name: 'Fresh' });
    const freshId = (fresh.output as { sceneId: string }).sceneId;
    const r = await invoke('scene.load', { sceneId: freshId, file: JSON.stringify(file) });
    expect(r.ok).toBe(true);
    const out = r.output as { engine: string; entities: number; worldStateKeys: number; player: unknown; rendered: boolean };
    expect(out).toMatchObject({ engine: 'fake-scene', entities: 1, worldStateKeys: 1, player: null, rendered: false });

    // And the fresh scene really holds the body the file carried, name and all.
    const inspected = await invoke('scene.inspect', { sceneId: freshId });
    expect((inspected.output as { entityNames: string[] }).entityNames).toEqual(['Cube']);
  });

  it('load refuses malformed JSON, a bare value and an array — each by name', async () => {
    const { invoke } = wired();
    const created = await invoke('scene.create', { name: 'Target' });
    const sceneId = (created.output as { sceneId: string }).sceneId;

    const broken = await invoke('scene.load', { sceneId, file: '{not json' });
    expect(broken.ok).toBe(false);
    expect(broken.error).toMatch(/file is not JSON a loader can read/);

    const bare = await invoke('scene.load', { sceneId, file: '17' });
    expect(bare.ok).toBe(false);
    expect(bare.error).toMatch(/parses to number, not a save-file object/);

    const array = await invoke('scene.load', { sceneId, file: '[1,2]' });
    expect(array.ok).toBe(false);
    expect(array.error).toMatch(/parses to an array, not a save-file object/);

    const empty = await invoke('scene.load', { sceneId, file: '' });
    expect(empty.ok).toBe(false);
    expect(empty.error).toMatch(/file must be the JSON text of a scene.save result/);
  });

  it('load refuses a target the driver does not hold, before the file is even parsed deep', async () => {
    const { invoke, calls } = wired();
    const r = await invoke('scene.load', { sceneId: 'scene-nope', file: '{"format":"x"}' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no scene scene-nope is held/);
    expect(calls.some((c) => c.startsWith('loadScene'))).toBe(false);
  });

  it('loading a scene’s file back into that LIVE scene is refused — a restore never overwrites', async () => {
    // The driver owns this rule; the door's job is to surface it as a failed call with the reason intact.
    const { invoke } = wired();
    const created = await invoke('scene.create', { name: 'Vault' });
    const sceneId = (created.output as { sceneId: string }).sceneId;
    await invoke('scene.entity.add', { sceneId, name: 'Cube', kind: 'mesh' });
    const saved = await invoke('scene.save', { sceneId, savedAt: 5000 });
    const file = (saved.output as { file: SceneSaveFileLike }).file;

    const r = await invoke('scene.load', { sceneId, file: JSON.stringify(file) });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already in scene .* a restore never overwrites live state/);
  });

  it('a driver refusal that is not the door’s business still arrives with its reason intact', async () => {
    const { invoke } = wired({
      loadScene: () => {
        throw new Error('loadSaveFile refused: version is 99 and this runtime reads exactly 1');
      },
    });
    const created = await invoke('scene.create', { name: 'Target' });
    const sceneId = (created.output as { sceneId: string }).sceneId;
    const r = await invoke('scene.load', { sceneId, file: '{"format":"nexus-three-runtime-save","version":99}' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/version is 99/);
  });

  it('an absent savedAt defaults to the host process’s own clock — finite and non-negative', async () => {
    const { invoke } = wired();
    const created = await invoke('scene.create', { name: 'Vault' });
    const sceneId = (created.output as { sceneId: string }).sceneId;
    const before = Date.now();
    const r = await invoke('scene.save', { sceneId });
    const after = Date.now();
    expect(r.ok).toBe(true);
    const savedAt = (r.output as { savedAt: number }).savedAt;
    expect(savedAt).toBeGreaterThanOrEqual(before);
    expect(savedAt).toBeLessThanOrEqual(after);
  });
});
