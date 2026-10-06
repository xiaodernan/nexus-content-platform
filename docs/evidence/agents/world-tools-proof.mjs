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
//   §6 the SIMULATE door moves the real world deterministically: an all-healthy world steps with zero
//      actions (the engine's confidence gate refuses zero-score decisions — quoted, not dressed up), and
//      one tick with a hurt character executes rest through the package's own +10 arithmetic, read back
//      through the ENGINE;
//   §7 the bonds are TWO-sided and they ERODE: two co-located characters speak through the package's own
//      executeAction, both sides of the bond are born, a second dialogue strengthens BOTH sides, and one
//      tickOnce() decays both sides by the same step — the reciprocity v161 lacked;
//   §8 the relationships door (read-class) lists that bond from both sides with both parties NAMED;
//   §9 this repository's HEAD is byte-identical: everything here ran in memory.
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
  // v162 — the driver grows with the seam: simulate steps the REAL engine's tickOnce() and aggregates
  // its own reports; relationships flattens the world's bonds with both sides named.
  simulate: async (steps) => {
    let ticks = 0, decisions = 0, actions = 0, events = 0, relationshipsChanged = 0;
    for (let i = 0; i < steps; i++) {
      const r = await engine.tickOnce();
      ticks = r.tick;
      decisions += r.decisions;
      actions += r.actions;
      events += r.events;
      relationshipsChanged += r.relationshipsChanged;
    }
    return { steps, ticks, decisions, actions, events, relationshipsChanged };
  },
  relationships: () => {
    const w = engine.getWorld();
    const names = new Map([...w.characters.values()].map((c) => [c.id, c.name]));
    const pairs = [];
    for (const c of w.characters.values()) {
      for (const rel of c.relationships.values()) {
        pairs.push({ characterId: c.id, characterName: c.name, targetId: rel.targetId, targetName: names.get(rel.targetId) ?? null, type: rel.type, strength: rel.strength });
      }
    }
    return { pairs, characters: w.characters.size };
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

// ── §6 the SIMULATE door moves the real world, deterministically ─────────────────────────────────────
// The engine's own gate: a decision whose confidence is below `ragScoreThreshold` never executes. An
// all-healthy character scores every action at zero, so steps move the TICK and nothing else — quoted,
// not dressed up. A HURT character scores `rest` high enough to pass the gate, and the package's own
// +10-health arithmetic fires through the door.
const idle = await invoke('world.simulate', { steps: 2 });
assert.equal(idle.ok, true, `world.simulate failed: ${idle.error}`);
assert.equal(idle.output.steps, 2);
assert.equal(idle.output.ticks, 2);
assert.equal(idle.output.decisions, 2, 'the world\'s one agent was consulted once per tick');
assert.equal(idle.output.actions, 0, 'an all-healthy world executes NOTHING: the confidence gate refuses zero-score decisions');

const hurt = await invoke('world.character.add', { name: 'Rowan', description: 'a fordside watcher', archetype: 'ranger' });
assert.equal(hurt.ok, true, `world.character.add failed: ${hurt.error}`);
const hurtId = hurt.output.characterId;
const rowan = engine.getWorld().characters.get(hurtId);
assert.ok(rowan, 'the engine holds the character the tools created');
rowan.status.health = 30;

const stepped = await invoke('world.simulate', { steps: 1 });
assert.equal(stepped.output.decisions, 2, 'now two agents are consulted per tick');
assert.equal(stepped.output.actions, 1, 'and the hurt watcher\'s rest passes the gate and executes');
assert.equal(rowan.status.health, 40, 'the engine\'s own rest arithmetic: 30 + 10, read back through the ENGINE');

const tooMany = await invoke('world.simulate', { steps: 1001 });
assert.equal(tooMany.ok, false);
assert.match(tooMany.error, /at most 1000 ticks/);
console.log(`[§6] world.simulate over the REAL engine: 2 all-healthy ticks = ${idle.output.decisions} decisions, 0 actions · 1 tick with a hurt watcher = ${stepped.output.actions} action, health 30 → ${rowan.status.health} (the package's own +10) · 1001 steps refused by name`);

// ── §7 the bonds are TWO-sided, and they ERODE ───────────────────────────────────────────────────────
// The package's own `executeAction('speak-…')` is called directly here (not through a door — the doors
// ask a character what it would decide; they do not script dialogue), which is exactly what makes this
// a test of the PACKAGE: v161 wrote only the speaker's side of a bond, so the other character remembered
// nothing. v162 writes both sides, and the tick erodes both sides together.
engine.addCharacterToLocation(hurtId, locationId);
engine.getWorld().locations.get(locationId).npcs.push(hurtId);

const miraAgent = engine.getAgent(characterId);
await miraAgent.executeAction(`speak-${hurtId}`);
const mira = engine.getWorld().characters.get(characterId);
const m2r = mira.relationships.get(hurtId);
const r2m = rowan.relationships.get(characterId);
assert.ok(m2r && r2m, 'v162: BOTH sides of the bond exist after one dialogue');
assert.equal(m2r.strength, 10, 'a first meeting lands at the floor, on the speaker\'s side');
assert.equal(r2m.strength, 10, 'and on the TARGET\'s side — the side v161 never wrote');

await miraAgent.executeAction(`speak-${hurtId}`);
assert.equal(m2r.strength, 15, 'the second dialogue strengthens the speaker\'s side');
assert.equal(r2m.strength, 15, 'and the target\'s side, by the same gain');

const decayed = await engine.tickOnce();
assert.equal(decayed.relationshipsChanged, 2, 'one unmaintained tick erodes BOTH sides (15 → 13, twice)');
assert.equal(mira.relationships.get(hurtId).strength, 13);
assert.equal(rowan.relationships.get(characterId).strength, 13);
console.log(`[§7] two-sided bonds over the REAL engine: "Mira"↔"Rowan" born at 10/10 on first speak, 15/15 on the second, 13/13 after one unmaintained tick (relationshipsChanged=${decayed.relationshipsChanged})`);

// ── §8 the relationships door: both sides NAMED, and no gate asked ───────────────────────────────────
const gateCallsBefore = checkpointCalls;
const rels = await invoke('world.relationships.list', {}, {});
assert.equal(rels.ok, true, `world.relationships.list failed: ${rels.error}`);
assert.equal(checkpointCalls, gateCallsBefore, 'a read-class door asked the gate ZERO times');
assert.equal(rels.output.characters, 2);
assert.equal(rels.output.pairs.length, 2, 'one bond, listed from both sides');
const named = rels.output.pairs.find((p) => p.characterName === 'Mira');
assert.ok(named, 'the speaker side is listed');
assert.equal(named.targetName, 'Rowan', 'and the target is NAMED, not an id the reader must resolve');
assert.equal(named.type, 'neutral');
assert.equal(named.strength, 13);
console.log(`[§8] world.relationships.list (read-class, ${checkpointCalls - gateCallsBefore} checkpoints asked): 2 pairs for one bond — "Mira"→"Rowan" and "Rowan"→"Mira", both neutral @ ${named.strength}, both sides NAMED`);

// ── §9 the home repository never moved ───────────────────────────────────────────────────────────────
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: this repository HEAD byte-identical — everything here ran in memory');

console.log(`\n[summary] the FIRST consumer of @nexus/world-engine: ${WORLD_TOOL_SPECS.length} world.* doors over a driver seam, driven through the registry's §28 gate, with the REAL engine behind it · 1 world + 2 locations + 2 characters + lore composed in memory · 3 deterministic ticks stepped and both sides of one bond born, strengthened and eroded · ${WORLD_LOCATION_TYPES.length} location types and ${WORLD_LORE_CATEGORIES.length} lore categories refused by name · the decision door's write-class claim measured on the agent's own record · home HEAD byte-identical: yes`);
console.log('[world-tools-proof] ALL ASSERTIONS PASSED (the world lane now has a consumer, and its read/write split is measured rather than asserted)');
