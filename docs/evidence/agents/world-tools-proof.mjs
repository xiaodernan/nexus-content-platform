// NEXUS M4 v144 — the FIRST consumer of @nexus/world-engine (ADR 0016 amendment 144).
//
// The package had 31 green tests and NO consumer at all: `grep -rl '@nexus/world-engine'` across
// `apps/ agents/ packages/` matched only the package's own `package.json`. That is the shape the 3D lane
// was in before v140, and the same bound its records kept writing — a package with tests, not a
// capability anything can reach. This proof closes the agent half for the world lane.
//
// Why a driver seam and not an import: `agents/runtime` does not depend on `@nexus/world-engine`. It
// declares the narrow `WorldDriver` it needs and the HOST supplies the implementation — the shape
// `browserTools` uses for `BrowserDriver` and `sceneTools` for `SceneDriver`. A fake driver proves the
// family's own rules (that is what the vitest suite does); only wiring the REAL engine proves the seam is
// the right width. That is this file's job.
//
// What it asserts, in order:
//   §1 the real engine answers the seam — every tool result is checked against the ENGINE's own state,
//      not against the tool's echo of it;
//   §2 the §28 gate is the registry's and it is the only one: an unapproved write reaches the driver zero
//      times, and the world does not move;
//   §3 the refusals are spoken by the side that knows the fact, and the world is unchanged by them;
//   §4 the decision door's WRITE-class claim is MEASURED, not asserted: the agent's own `getLastDecision()`
//      is null before the call and non-null after, which is the mutation that forbids calling it a read;
//   §5 retrieval reaches content that was added THROUGH the tools, so the family's writes are real writes;
//   §6 this repository's HEAD is byte-identical: everything here ran in memory.
// Run after `npm run build`:  node docs/evidence/agents/world-tools-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync } from '../lib/syncproc.mjs';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const { ToolRegistry, registerWorldTools, WORLD_TOOL_SPECS, WORLD_LOCATION_TYPES, WORLD_LORE_CATEGORIES } = rt;
const world = await import(pathToFileURL('./packages/world-engine/dist/index.js').href);
const { WorldEngine } = world;

const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

// ── the real engine, behind the seam ─────────────────────────────────────────────────────────────────
const engine = new WorldEngine({ ragEnabled: true, autoSaveInterval: 0 });

// Every method delegates to the package's own public API. The only conversion is flattening the
// package's Maps into plain arrays, which is what makes a tool result JSON-safe.
const driver = {
  engine: 'world-engine',
  summarize: () => {
    const w = engine.getWorld();
    const stats = engine.getStats();
    return {
      id: w.id,
      name: w.name,
      genre: w.genre,
      description: w.description,
      stats,
      characterNames: [...w.characters.values()].map((c) => c.name),
      characterIds: [...w.characters.keys()],
      locationNames: [...w.locations.values()].map((l) => l.name),
      locationIds: [...w.locations.keys()],
      loreTitles: [...w.lore.values()].map((l) => l.title),
    };
  },
  addLocation: (spec) => engine.createLocation(spec.name, spec.description, spec.type).id,
  addCharacter: (spec) =>
    engine.createCharacter(spec.name, spec.description, spec.archetype, spec.locationId ?? null).id,
  addLore: (spec) => engine.createLore(spec.title, spec.content, spec.category).id,
  query: (text, limit) => {
    const result = engine.queryRAG({ query: text, worldId: engine.getWorld().id, limit });
    return {
      query: result.query,
      totalHits: result.totalHits,
      hits: result.results.map((h) => ({ id: h.id, type: h.type, title: h.title, score: h.score })),
    };
  },
  decide: (characterId) => {
    const agent = engine.getAgent(characterId);
    if (!agent) return undefined;
    // `decide()` is async in the package; the seam allows a promise, and the tool awaits it.
    return agent.decide().then((d) => ({ characterId, ...d }));
  },
};

const registry = registerWorldTools(new ToolRegistry(), driver);
let checkpointCalls = 0;
const gate = { checkpoint: () => { checkpointCalls += 1; return true; } };
let seq = 0;
const invoke = (tool, args = {}, opts = gate) =>
  registry.invoke({ callId: `world-proof-${++seq}`, tool, args }, opts);

// ── §1 the real engine answers the seam ──────────────────────────────────────────────────────────────
const inspected0 = await invoke('world.inspect', {}, {});
assert.equal(inspected0.ok, true, `world.inspect failed: ${inspected0.error}`);
assert.equal(inspected0.output.engine, 'world-engine', 'the answer names the engine that answered');
assert.equal(inspected0.output.id, engine.getWorld().id, 'the id is the ENGINE’s own world id');
assert.equal(inspected0.output.stats.locations, 0);

const loc = await invoke('world.location.add', { name: 'Ashen Ford', description: 'a river crossing', type: 'town' });
assert.equal(loc.ok, true, `world.location.add failed: ${loc.error}`);
const locationId = loc.output.locationId;
// Read back through the ENGINE, not through the tool: the location exists, with the name that was given.
const realLocation = engine.getWorld().locations.get(locationId);
assert.ok(realLocation, 'the engine holds the location the tool reported');
assert.equal(realLocation.name, 'Ashen Ford');
assert.equal(realLocation.type, 'town');

const char = await invoke('world.character.add', {
  name: 'Mira', description: 'a scout who reads the ford', archetype: 'rogue', locationId,
});
assert.equal(char.ok, true, `world.character.add failed: ${char.error}`);
const characterId = char.output.characterId;
const realCharacter = engine.getWorld().characters.get(characterId);
assert.ok(realCharacter, 'the engine holds the character the tool reported');
assert.equal(realCharacter.locationId, locationId, 'and placed it where the caller said');
assert.equal(char.output.locationId, locationId);

const lore = await invoke('world.lore.add', {
  title: 'The Sundering', content: 'the ford was cut by a river that remembers', category: 'history',
});
assert.equal(lore.ok, true, `world.lore.add failed: ${lore.error}`);
assert.equal(engine.getWorld().lore.get(lore.output.loreId).title, 'The Sundering');
console.log(`[§1] real engine behind the seam: world "${inspected0.output.name}" (${inspected0.output.id}) · location "${realLocation.name}" (${realLocation.type}) · character "${realCharacter.name}" placed at it · lore "${engine.getWorld().lore.get(lore.output.loreId).title}" · engine reported as "${inspected0.output.engine}"`);

// ── §2 the §28 gate is the registry's, and it is the only one ────────────────────────────────────────
const locationsBefore = engine.getStats().locations;
const before = checkpointCalls;
const denied = await invoke('world.location.add', { name: 'Denied', description: 'd', type: 'town' }, {});
assert.equal(denied.ok, false, 'an unapproved write door is refused');
assert.match(denied.error, /checkpoint/i, 'and the refusal names the gate');
assert.equal(engine.getStats().locations, locationsBefore, 'the ENGINE did not move: no location was created');
assert.equal(checkpointCalls, before, 'the gate was never consulted — no checkpoint function was supplied');

const allowed = await invoke('world.location.add', { name: 'Allowed', description: 'd', type: 'village' });
assert.equal(allowed.ok, true);
assert.equal(engine.getStats().locations, locationsBefore + 1, 'the approved call did create one');
assert.equal(checkpointCalls, before + 1, 'exactly one checkpoint for exactly one write');
console.log(`[§2] §28: 1 refused write moved the world by 0 and asked the gate 0 times · 1 approved write moved it by 1 and asked once · registry is the only gate`);

// ── §3 refusals are spoken by the side that knows the fact ───────────────────────────────────────────
const statsBefore = JSON.stringify(engine.getStats());
const badType = await invoke('world.location.add', { name: 'X', description: 'd', type: 'spaceport' });
assert.equal(badType.ok, false);
assert.match(badType.error, /the declared values are city, town, village, dungeon, wilderness, landmark, building, room, other/);

const badCategory = await invoke('world.lore.add', { title: 'X', content: 'y', category: 'gossip' });
assert.equal(badCategory.ok, false);
assert.match(badCategory.error, /the declared values are history, myth, geography/);

const ghostPlace = await invoke('world.character.add', { name: 'Nobody', description: 'd', archetype: 'a', locationId: 'loc-ghost' });
assert.equal(ghostPlace.ok, false);
assert.match(ghostPlace.error, /holds no location loc-ghost/, 'the door names the reference it refused');

const ghostAgent = await invoke('world.character.decide', { characterId: 'char-ghost' });
assert.equal(ghostAgent.ok, false);
assert.match(ghostAgent.error, /holds no agent for char-ghost/);

assert.equal(JSON.stringify(engine.getStats()), statsBefore, 'four refused calls moved the engine by nothing');
console.log(`[§3] 4 refusals, each naming its own fact, and the engine moved by 0: unknown location type · unknown lore category · a character placed in a location that does not exist · a decision asked of a character with no agent`);

// ── §4 the decision door's WRITE-class claim is MEASURED ─────────────────────────────────────────────
// The family classifies `world.character.decide` as write-class on the grounds that the package records
// the answer on the agent. That is the kind of sentence this project refuses to leave unmeasured: here is
// the agent's own record, null before and non-null after, through the door.
const agent = engine.getAgent(characterId);
assert.ok(agent, 'the engine has an agent for the character the tools created');
assert.equal(agent.getLastDecision(), null, 'the agent has recorded no decision yet');

const decided = await invoke('world.character.decide', { characterId });
assert.equal(decided.ok, true, `world.character.decide failed: ${decided.error}`);
const recorded = agent.getLastDecision();
assert.ok(recorded, 'the agent NOW holds a decision — which is the mutation that forbids calling this door a read');
assert.equal(recorded.actionId, decided.output.actionId, 'and it is the decision the door returned, not another one');
assert.equal(decided.output.characterId, characterId);
assert.ok(decided.output.reasoning.length > 0, 'the answer carries a reason, not just an action id');
// The confidence is the ENGINE's own number and it is reported as it came, not dressed up: a character in
// a world this small has no goals, no threat and nothing to chase, so every action scores zero and the
// agent falls back to `rest`. That is the world engine being honest about an empty world — and it is
// exactly why the number is quoted here rather than described.
assert.equal(typeof decided.output.confidence, 'number');
console.log(`[§4] the decision door really writes: agent.getLastDecision() was null, is now "${recorded.actionId}" with confidence ${decided.output.confidence} · a door that called this a read would be claiming a mutation did not happen`);
console.log(`     (the confidence is the ENGINE's own number for a minimally-populated world: no goals, no threat, so every action scores 0 and the agent rests — quoted, not dressed up)`);

// ── §5 retrieval reaches what the tools wrote ────────────────────────────────────────────────────────
const found = await invoke('world.query', { text: 'Sundering ford', limit: 5 }, {});
assert.equal(found.ok, true, `world.query failed: ${found.error}`);
assert.ok(found.output.totalHits > 0, 'the RAG found the lore this proof added THROUGH the tools');
assert.ok(
  found.output.hits.some((h) => h.title === 'The Sundering'),
  `the hit names the lore the tools wrote; got ${JSON.stringify(found.output.hits.map((h) => h.title))}`,
);
console.log(`[§5] retrieval over the family’s own writes: ${found.output.totalHits} hit(s) for "Sundering ford", top = "${found.output.hits[0].title}" (${found.output.hits[0].type})`);

// ── §6 the home repository never moved ───────────────────────────────────────────────────────────────
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§6: this repository HEAD byte-identical — everything here ran in memory');

console.log(`\n[summary] the FIRST consumer of @nexus/world-engine: ${WORLD_TOOL_SPECS.length} world.* doors over a driver seam, driven through the registry's §28 gate, with the REAL engine behind it · 1 world + location + character + lore composed in memory · ${WORLD_LOCATION_TYPES.length} location types and ${WORLD_LORE_CATEGORIES.length} lore categories refused by name · the decision door's write-class claim measured on the agent's own record · home HEAD byte-identical: yes`);
console.log('[world-tools-proof] ALL ASSERTIONS PASSED (the world lane now has a consumer, and its read/write split is measured rather than asserted)');
