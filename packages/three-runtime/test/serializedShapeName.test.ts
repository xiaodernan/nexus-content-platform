// M5 #197 — every `Serialized*` shape the package declares is accounted by NAME and by a field path.
//
// Measured at edf8681 by `.scratch/vnext/reach197.mjs`: `src/types.ts` declares 12 `Serialized*` interfaces, and
// `declaredFields('…')` — the helper four shipped test files each carry — is called with only 7 of them. The two
// that sit INSIDE the shipped file's reach and are written by src code (`SerializedVector3`, 12 read sites;
// `SerializedEuler`, 9) are compared by nobody: every exact-key gate in the suite stops at the top level of
// `SerializedEntity`, so a nested shape can grow, shrink, or lose the field its own docstring calls load-bearing
// (types.ts:478-483: an Euler flattened without its `order` restores as NaN) and no gate names it.
//
// The rule installed here is a CENSUS, not a list. A declared shape is legal only if (a) some field path owns it —
// this file climbs the declared field types from one of the two roots and prints the path, so "declared and owned
// by nothing" is a red case rather than a directory nobody reads — and (b) if the owning root is `SaveData`, the
// chain's first field sits in the audit's blocked half with a reason, while a shape owned only by `SaveFile` has
// its writer's keys compared to its declaration, HERE or in a gate this file reads out of the test sources.
//
// One clause of the first draft was falsified by its own first run (plane7: `with` = 415 cases, 1 red): it claimed
// each unreached shape is typed by a `SaveData` FIELD. `SerializedScene` is not — it is typed by
// `SerializedSceneGraph.scenes`. The chain version is both the true claim and the stronger one: it names the path
// rather than the first hop, and it keeps `SerializedSceneGraph.scenes` honest about being a Map the file refuses.

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createThreeRuntime, type ThreeRuntime } from '../src/threeRuntime.js';
import { createHeadlessBackend } from '../src/renderBackend.js';
import { entityId as eid, type EntityId, type SceneId } from '../src/types.js';

const lf = (text: string) => text.replace(/\r\n/g, '\n');
const typesSource = lf(readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8'));
const TEST_DIR = new URL('./', import.meta.url);

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

/** The field names AND declared types of one interface, from the file that declares it. */
function declaredFields(name: string): { field: string; type: string; optional: boolean }[] {
  const header = new RegExp(`export interface ${name}\\s*\\{`).exec(typesSource);
  if (!header) throw new Error(`types.ts no longer declares \`export interface ${name}\``);
  const out: { field: string; type: string; optional: boolean }[] = [];
  let depth = 0;
  for (const line of typesSource.slice(header.index + header[0].length).split('\n')) {
    const trimmed = line.trim();
    if (depth === 0 && trimmed && !trimmed.startsWith('*') && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
      const field = /^\s*([A-Za-z_$][\w$]*)(\??)\s*:\s*(.+?)\s*;?\s*$/.exec(line);
      if (field) out.push({ field: field[1]!, optional: field[2] === '?', type: field[3]! });
    }
    for (const character of line) {
      if (character === '{') depth += 1;
      else if (character === '}') {
        depth -= 1;
        if (depth < 0) return out;
      }
    }
  }
  return out;
}

/** Every `Serialized*` interface the package declares, read off the declarations themselves. */
const declaredNames = (source: string) => [...source.matchAll(/^export interface (Serialized[A-Za-z0-9_]*)\s*\{/gm)].map((m) => m[1]!);
const population = declaredNames(typesSource).sort();

/** The source text of every shipped test file — the census asks the suite what it actually gates. */
const testSources = Object.fromEntries(
  readdirSync(TEST_DIR)
    .filter((f) => f.endsWith('.test.ts') && f !== 'serializedShapeName.test.ts')
    .map((f) => [f, lf(readFileSync(new URL(f, TEST_DIR), 'utf8'))]),
);
/** The source text of every src module — the root claim is about all of them, not about the one file. */
const srcSources = Object.fromEntries(
  ['types.ts', 'threeRuntime.ts', 'saveStore.ts', 'renderBackend.ts'].map((f) => [f, lf(readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'))]),
);

// The non-Serialized names a save-shaped field can carry, so the climb does not stop at a `Player` or a
// `LightingConfig` and call everything below it unowned. Measured: SaveData.player is typed `Player`, not
// `SerializedPlayer`, which is exactly why the file's reach and the runtime's account are different sets.
const BRIDGES = /\b(ThreeEntity|LightingConfig|PhysicsConfig|PostProcessingConfig|PersonalityTraits|EntityComponent|QuestState)\b/g;

/** The owned set of one root, PLUS the edge that brought each name in, so an owner can be printed as a path. */
function ownership(root: string): { reached: Set<string>; edges: Map<string, { parent: string; field: string }[]> } {
  const reached = new Set<string>();
  const edges = new Map<string, { parent: string; field: string }[]>();
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const { field, type } of declaredFields(current)) {
      for (const match of [...type.matchAll(/\b(Serialized[A-Za-z0-9_]*)\b/g), ...type.matchAll(BRIDGES)]) {
        const name = match[1]!;
        if (!edges.has(name)) edges.set(name, []);
        edges.get(name)!.push({ parent: current, field });
        if (!reached.has(name)) {
          if (name !== root) reached.add(name);
          queue.push(name);
        }
      }
    }
  }
  return { reached, edges };
}

/** The field path from one root down to a shape, or the reason the climb broke. `hops` is ROOT-FIRST, so
 *  `hops[0].parent` is the root and `hops[0].field` is the top-level field that owns the whole chain.
 *  (Round 2 of the plane measurement returned a real red here: the path printer reversed this very array in
 *  place, so the caller's "root field" was the last hop — the leaf — and the case named `SaveData.scenes`,
 *  a field that does not exist. The binding below is what makes that direction impossible to assume again.) */
function chainTo(root: string, edges: Map<string, { parent: string; field: string }[]>, name: string): { ok: boolean; path: string; hops: { parent: string; field: string; child: string }[] } {
  const backwards: { parent: string; field: string; child: string }[] = [];
  let current = name;
  const seen = new Set<string>();
  while (current !== root) {
    if (seen.has(current)) return { ok: false, path: `cycle at ${current}`, hops: [] };
    seen.add(current);
    const incoming = edges.get(current);
    if (!incoming || incoming.length === 0) return { ok: false, path: `no field of any type names ${current}`, hops: [] };
    const hop = incoming.find((e) => seen.has(e.parent) || e.parent === root) ?? incoming[0]!;
    backwards.push({ ...hop, child: current });
    current = hop.parent;
  }
  const hops = backwards.reverse();
  return { ok: true, path: hops.map((h) => `${h.parent}.${h.field}`).join(' → '), hops };
}

const fileOwn = ownership('SaveFile');
const dataOwn = ownership('SaveData');
const inFile = population.filter((n) => fileOwn.reached.has(n));
const outside = population.filter((n) => !fileOwn.reached.has(n));

// ── the writers this file compares against declarations ──────────────────────────────────────────
let runtime: ThreeRuntime;
let scene: SceneId;
let hero: EntityId;
let heroObj: THREE.Object3D;

beforeEach(() => {
  const created = createThreeRuntime({}, { backend: (_canvas, cfg) => createHeadlessBackend(cfg) });
  created.initialize(mockCanvas);
  runtime = created;
  scene = created.createScene('World').id;
});

/** A mesh at a pose, so the nested transform shapes exist as written bytes. */
function withHero(): EntityId {
  const built = runtime.createEntity(scene, 'Hero', 'mesh', undefined, undefined, new THREE.Vector3(1.5, 2.25, -3.75));
  hero = built.id;
  built.threeObject.rotation.set(0.1, 0.2, 0.3, 'YXZ');
  return hero;
}

describe('the population is read off the declarations', () => {
  it('the parse really parses: the census has a population and it contains names not in question', () => {
    expect(population.length, 'the scan found no Serialized* interface — the census would be reading an empty population').toBeGreaterThan(0);
    expect(population).toContain('SerializedEntity');
    expect(population).toContain('SerializedVector3');
    expect(population).toContain('SerializedEuler');
  });

  it('one root declares them, and the claim covers every src module rather than the file that happens to hold them today', () => {
    const elsewhere = Object.entries(srcSources)
      .flatMap(([file, text]) => (file === 'types.ts' ? [] : declaredNames(text).map((n) => `${file}:${n}`)));
    expect(elsewhere, `a Serialized* shape declared outside src/types.ts is invisible to every shape gate, which all read types.ts by name: ${elsewhere.join(', ')}`).toEqual([]);
  });
});

describe('every declared shape is owned by a field path from one of the two roots', () => {
  it('no declared shape is owned by neither root — a shape no field names is a shape that quietly exists', () => {
    const unowned = population.filter((n) => !fileOwn.reached.has(n) && !dataOwn.reached.has(n));
    expect(unowned, `declared in types.ts and named by no field of SaveFile or SaveData: ${unowned.join(', ')}`).toEqual([]);
  });

  it('an owner is a field path, not a name: every link is a field its parent really declares', () => {
    const broken: string[] = [];
    let examined = 0;
    for (const name of population) {
      for (const { root, own } of [
        { root: 'SaveFile', own: fileOwn },
        { root: 'SaveData', own: dataOwn },
      ]) {
        if (!own.reached.has(name)) continue;
        const chain = chainTo(root, own.edges, name);
        if (!chain.ok) {
          broken.push(`${root} → ${name}: ${chain.path}`);
          continue;
        }
        for (const hop of chain.hops) {
          examined += 1;
          const fields = declaredFields(hop.parent).map((f) => f.field);
          if (!fields.includes(hop.field)) broken.push(`${root} → ${name}: ${hop.parent}.${hop.field} is not a declared field (${fields.join(', ')})`);
          const typed = declaredFields(hop.parent).find((f) => f.field === hop.field)!;
          if (typed && !new RegExp(`\\b${hop.child}\\b`).test(typed.type)) broken.push(`${root} → ${name}: ${hop.parent}.${hop.field} is typed ${typed.type}, which does not name ${hop.child}`);
        }
      }
    }
    // The check has to have run on something: with no root reaching no shape, every loop above skips and an
    // empty `broken` would be a green that read nothing.
    expect(examined, 'the link check examined no chain at all, so its empty list of broken links proves nothing').toBeGreaterThan(0);
    expect(broken, `an owner chain this file printed is not made of declared fields: ${broken.join(' · ')}`).toEqual([]);
  });

  it('the file\'s reach is a real set, read from the shape the loader actually accepts', () => {
    expect(inFile.length, 'SaveFile reaches no Serialized* shape — the reach parse read nothing').toBeGreaterThan(0);
    expect(inFile).toContain('SerializedEntity');
    expect(inFile).toContain('SerializedVector3');
  });
});

describe('a shape the FILE reaches is gated by name somewhere or compared here', () => {
  it('every shape the file writes has its keys compared to its declaration, somewhere in the suite', () => {
    // A shape counts as gated when some test file calls declaredFields('NAME') — read out of the test sources,
    // so this census cannot be left behind by a gate another grant adds later.
    const gatedElsewhere = population.filter((n) => Object.values(testSources).some((t) => new RegExp(`declaredFields\\(\\s*['"\`]${n}['"\`]\\s*\\)`).test(t)));
    const comparedHere = ['SerializedVector3', 'SerializedEuler'];
    const ungated = inFile.filter((n) => !gatedElsewhere.includes(n) && !comparedHere.includes(n));
    expect(ungated, `in the shipped file's reach but no gate compares a writer's keys to it: ${ungated.join(', ')}`).toEqual([]);
    // …and the comparison this file claims to make is not a claim about a shape that stopped existing.
    for (const n of comparedHere) expect(inFile, `${n} is compared here but is no longer part of the file's shape — retire the comparison with it`).toContain(n);
  });
});

describe('the nested transform shapes, compared to what the writers write', () => {
  it('snapshotEntity writes exactly the fields SerializedVector3 declares, in position and in scale', () => {
    withHero();
    const declared = declaredFields('SerializedVector3').map((f) => f.field).sort();
    const saved = runtime.snapshotEntity(scene, hero);
    expect(Object.keys(saved.position).sort(), 'position is not the declared vector').toEqual(declared);
    expect(Object.keys(saved.scale).sort(), 'scale is the same declared shape and must answer to it too').toEqual(declared);
  });

  it('snapshotEntity writes exactly the fields SerializedEuler declares, order included', () => {
    withHero();
    const declared = declaredFields('SerializedEuler').map((f) => f.field).sort();
    expect(declared, 'the declared Euler shape lost the order this file exists over').toContain('order');
    const saved = runtime.snapshotEntity(scene, hero);
    expect(Object.keys(saved.rotation).sort()).toEqual(declared);
    expect(saved.rotation.order, 'a pose without its order is a pose three.js recomposes wrong').toBe('YXZ');
  });

  it('playerSnapshot writes the same two nested shapes, because a second writer of one shape is a second way to diverge', () => {
    const entity = withHero();
    runtime.attachPlayer(scene, entity);
    const player = runtime.playerSnapshot(scene);
    expect(player, 'the scene has an attached player, so a snapshot of it is not null').not.toBeNull();
    const vector = declaredFields('SerializedVector3').map((f) => f.field).sort();
    const euler = declaredFields('SerializedEuler').map((f) => f.field).sort();
    expect(Object.keys(player!.position).sort()).toEqual(vector);
    expect(Object.keys(player!.rotation).sort()).toEqual(euler);
    // The KEYS are the same shape in both writers; the order is the fact that a second writer can diverge on
    // without the key census noticing. Measured at round 3: an arm that froze the written order to 'XYZ' left
    // every key comparison green, so this case asks the value as well.
    expect(player!.rotation.order, 'the player writer kept the declared keys but not the pose they describe').toBe('YXZ');
  });

  it('what the writers write still restores, so the comparisons above are not describing an unloadable shape', () => {
    withHero();
    const saved = runtime.snapshotEntity(scene, hero);
    runtime.removeEntity(scene, hero);
    const back = runtime.restoreEntity(scene, saved);
    expect(back.threeObject.rotation.order).toBe('YXZ');
    expect([back.threeObject.position.x, back.threeObject.position.y, back.threeObject.position.z]).toEqual([1.5, 2.25, -3.75]);
  });
});

describe('a shape outside the file is accounted by the blocked half', () => {
  it('the shapes the file does not reach are exactly the ones with no writer to compare', () => {
    expect(outside.sort(), 'a shape moved in or out of the file without this census being told').toEqual(['SerializedQuestSystem', 'SerializedScene', 'SerializedSceneGraph']);
  });

  it('each unreached shape\'s owner chain starts at a SaveData field the audit reports as blocked, with a reason', () => {
    const audit = runtime.saveFeasibilityAudit(scene, withHero())!;
    const blocked = new Map(audit.blocked.map((entry) => [entry.field, entry.needs]));
    const unowned: string[] = [];
    for (const name of outside) {
      const chain = chainTo('SaveData', dataOwn.edges, name);
      if (!chain.ok) {
        unowned.push(`${name}: ${chain.path}`);
        continue;
      }
      expect(chain.hops[0]!.parent, `${name}'s chain claims a SaveData owner but does not start at SaveData: ${chain.path}`).toBe('SaveData');
      const rootField = chain.hops[0]!.field;
      expect(blocked.has(rootField), `${name} is outside the file's reach and its owner is SaveData.${rootField} (path ${chain.path}), which the audit does not report as blocked — a shape with no writer and no refusal is a shape that quietly exists`).toBe(true);
      expect(blocked.get(rootField)!.length, `SaveData.${rootField} is blocked without a reason for ${name}`).toBeGreaterThan(0);
    }
    expect(unowned, `an unreached shape no SaveData field path reaches: ${unowned.join(' · ')}`).toEqual([]);
    for (const entry of audit.blocked) expect(entry.needs.length, `${entry.field} is blocked without a reason`).toBeGreaterThan(0);
  });

  it('the two roots reach different shapes, and each asymmetry has a named owner', () => {
    // Measured: `player` is typed `Player | null` on SaveData (types.ts:414, the LIVE record) and
    // `SerializedPlayer | null` on SaveFile (types.ts:449), while `sceneGraph` and `quests` are typed only on
    // SaveData. So the file's reach and the runtime's account are not the same set, and the census says which
    // names each side owns rather than assuming they agree.
    const onlyFile = population.filter((n) => fileOwn.reached.has(n) && !dataOwn.reached.has(n)).sort();
    const onlyData = population.filter((n) => dataOwn.reached.has(n) && !fileOwn.reached.has(n)).sort();
    expect(onlyFile, 'a shape the file writes but SaveData never mentions needs its asymmetry re-read, not retyped').toEqual(['SerializedPlayer']);
    expect(onlyData).toEqual(['SerializedQuestSystem', 'SerializedScene', 'SerializedSceneGraph']);
  });
});
