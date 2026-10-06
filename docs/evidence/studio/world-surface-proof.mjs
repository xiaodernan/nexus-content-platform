// NEXUS M4 v148 — the Studio's world surface, the FIRST PRODUCT consumer of @nexus/world-engine
// (ADR 0016 amendment 146).
//
// v144 gave the world lane its AGENT consumer (`agents/runtime/src/worldTools.ts` over a `WorldDriver`
// seam), and its own record still ended with *"no Studio surface … the product half is still open."*
// This proof closes the product half, and it is built out of the SHIPPED bytes rather than a copy:
//
//   - the engine is `packages/world-engine/dist` (build it first), in memory, with no model attached;
//   - the surface is `apps/studio/src/lib/world.ts` — the ACTUAL Studio module, read off disk and run
//     through Node's own TypeScript type-stripper. A copy of its functions here would prove that the
//     copy works, which is the failure mode this file exists to avoid.
//
// What it asserts, in order:
//   §1 the Studio's composed world IS the engine's: every id the module returns is a registered entity in
//      the engine, and the report describes the world the engine actually holds;
//   §2 every character the Studio places stands in a location the ENGINE holds — checked by looking the
//      id up, not by trusting the name the report printed;
//   §3 the report is DERIVED rather than remembered: mutating the engine through its own API moves the
//      report, and a character standing in a location the world does not hold reports `null` for its
//      place rather than a dangling name;
//   §4 v162 — the world the Studio composed can be STEPPED: one tick of the SHIPPED engine (composed by
//      the SHIPPED module) introduces the two co-located characters through the engine's own decision
//      gate, and the report's relationships view lists the bond from BOTH sides, by NAME;
//   §5 §60 is measurable here too: the engine has NO model attached, so the report carries no field that
//      could be read as one, and the surface's own vocabulary is the package's declared words only;
//   §6 this repository's HEAD is byte-identical: everything here ran in memory.
//
// Run after `npm run build`:  node docs/evidence/studio/world-surface-proof.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from '../lib/syncproc.mjs';

// ── the shipped engine ───────────────────────────────────────────────────────────────────────────────
const world = await import(pathToFileURL('./packages/world-engine/dist/index.js').href);
const { WorldEngine } = world;

// ── the SHIPPED Studio module, type-stripped rather than copied ──────────────────────────────────────
const { stripTypeScriptTypes } = await import('node:module');
const STUDIO_MODULE = './apps/studio/src/lib/world.ts';
const stripped = stripTypeScriptTypes(readFileSync(STUDIO_MODULE, 'utf8'), { mode: 'strip' });
const box = mkdtempSync(join(tmpdir(), 'nexus-world-surface-'));
const modulePath = join(box, 'world.mjs');
writeFileSync(modulePath, stripped, 'utf8');
const studio = await import(pathToFileURL(modulePath).href);
const { buildStudioWorld, buildWorldReport } = studio;
assert.equal(typeof buildStudioWorld, 'function', 'the Studio module was really imported, not re-implemented');
assert.equal(typeof buildWorldReport, 'function', 'and so was its report builder');

const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

// ── the real engine, in memory, with no model attached ───────────────────────────────────────────────
const engine = new WorldEngine({ ragEnabled: true, autoSaveInterval: 0 });
const built = buildStudioWorld(engine);

// ── §1 the Studio's world IS the engine's ────────────────────────────────────────────────────────────
const held = engine.getWorld();
assert.equal(built.locationIds.length, 3);
assert.equal(built.characterIds.length, 4);
assert.equal(built.loreIds.length, 2);
for (const id of built.locationIds) assert.ok(held.locations.has(id), `location ${id} is not in the engine`);
for (const id of built.characterIds) assert.ok(held.characters.has(id), `character ${id} is not in the engine`);
for (const id of built.loreIds) assert.ok(held.lore.has(id), `lore ${id} is not in the engine`);

const report = buildWorldReport(engine);
assert.equal(report.id, held.id, 'the report names the ENGINE’s own world id');
assert.equal(report.stats.locations, held.locations.size, 'the counts are the engine’s');
assert.equal(report.stats.characters, held.characters.size);
assert.equal(report.stats.lore, held.lore.size);
assert.deepEqual(
  report.locations.map((l) => l.name).sort(),
  [...held.locations.values()].map((l) => l.name).sort(),
  'the report lists exactly the locations the engine holds',
);
console.log(`[§1] the Studio composed the ENGINE's own world: "${report.name}" (${report.id}) · ${report.locations.length} locations, ${report.characters.length} characters, ${report.lore.length} lore · the report and the engine agree on every count`);

// ── §2 every character stands somewhere the ENGINE holds ─────────────────────────────────────────────
// The report prints a NAME, but the check is done against the ID — the name could be right while the
// relation was wrong, which is exactly the defect `world.character.add` refuses on the agent side.
let placed = 0;
for (const id of built.characterIds) {
  const character = held.characters.get(id);
  assert.ok(character, `character ${id} vanished`);
  assert.ok(character.locationId, `${character.name} stands nowhere`);
  const location = held.locations.get(character.locationId);
  assert.ok(location, `${character.name} stands in ${character.locationId}, which the engine does not hold`);
  const row = report.characters.find((c) => c.id === id);
  assert.equal(row.locationName, location.name, `${character.name}'s reported place is not its real one`);
  placed += 1;
}
console.log(`[§2] every character stands somewhere the ENGINE holds: ${placed}/4 placed, each verified by looking the id up in the world and comparing against the reported name — a world where a character stands nowhere is one a reader cannot walk`);

// ── §3 the report is DERIVED, not remembered ─────────────────────────────────────────────────────────
const before = buildWorldReport(engine);
const added = engine.createLocation('A Second Ford', 'a place the Studio never composed', 'town');
const afterAdd = buildWorldReport(engine);
assert.equal(afterAdd.stats.locations, before.stats.locations + 1, 'a change through the ENGINE moves the report');
assert.ok(afterAdd.locations.some((l) => l.id === added.id), 'and the new location is in it');

// A character standing in a location the world does not hold reports `null` for its place — not a
// dangling id, and not the name of something else.
engine.createCharacter('Orphan', 'stands in a place that does not exist', 'nobody', 'loc-that-is-gone');
const withOrphan = buildWorldReport(engine);
const orphan = withOrphan.characters.find((c) => c.name === 'Orphan');
assert.ok(orphan, 'the orphan is in the report');
assert.equal(orphan.locationName, null, 'a dangling place reports null rather than an id or a wrong name');
assert.equal(JSON.stringify(withOrphan).includes('loc-that-is-gone'), false, 'and the dangling id is not leaked as a name');

// Every character the STUDIO composed still resolves, after the engine moved under it.
for (const id of built.characterIds) {
  const row = withOrphan.characters.find((c) => c.id === id);
  assert.ok(row.locationName, `${row.name} lost its place when the world grew`);
}
console.log(`[§3] the report is derived, not remembered: adding a location through the ENGINE moved the counts (${before.stats.locations} → ${afterAdd.stats.locations}) and the list · a character standing in a place the world does not hold reports null, and the dangling id is never printed as a name`);

// ── §4 v162 — the world the Studio composed can be STEPPED, and its bonds are in the report ──────────
// The panel's Step buttons call the engine's own tickOnce(); here the SHIPPED engine, composed by the
// SHIPPED module, is stepped directly, with the threshold the PANEL sets (0.02 — the engine's own
// decision gate, doubled as the RAG filter). Mira and Toma share the ford. The deterministic trace the
// engine must produce: Mira's speak passes the gate (a first meeting scores 0.03) and writes the bond on
// BOTH sides at the floor (10/10); Toma's own speak then passes too and gains +5 on both sides (15/15);
// the tick's decay pass erodes both (13/13). Two actions, one bond, both sides named in the report.
const panelEngine = new WorldEngine({ ragEnabled: true, autoSaveInterval: 0, ragScoreThreshold: 0.02 });
buildStudioWorld(panelEngine);
const panelHeld = panelEngine.getWorld();
const mira = [...panelHeld.characters.values()].find((c) => c.name === 'Mira');
const toma = [...panelHeld.characters.values()].find((c) => c.name === 'Toma');
assert.ok(mira && toma, 'the composition seats Mira and Toma at the ford together');

const tick1 = await panelEngine.tickOnce();
assert.equal(tick1.tick, 1);
assert.equal(tick1.decisions, 4, 'every composed character was consulted');
assert.equal(tick1.actions, 2, 'exactly the two co-located characters act: Mira greets, Toma greets back');
assert.equal(tick1.relationshipsChanged, 2, 'the tick\'s decay pass erodes both sides of the newborn bond (15 → 13, twice)');

const pairs = buildWorldReport(panelEngine).relationships;
assert.equal(pairs.length, 2, 'one bond, listed from both sides');
const m2t = pairs.find((p) => p.from === 'Mira' && p.to === 'Toma');
const t2m = pairs.find((p) => p.from === 'Toma' && p.to === 'Mira');
assert.ok(m2t && t2m, 'the report lists the bond from BOTH sides');
assert.equal(m2t.strength, 13, '10 (first meeting) + 5 (greeted back) − 2 (one decay pass), the engine\'s own arithmetic');
assert.equal(t2m.strength, 13, 'and the target\'s side carries the same number');
assert.equal(m2t.type, 'neutral');
assert.ok(m2t.to === 'Toma' && t2m.to === 'Mira', 'both parties are NAMED, not left as ids');
console.log(`[§4] v162 stepping the SHIPPED engine+module: 1 tick · ${tick1.decisions} decisions · ${tick1.actions} actions · "Mira"↔"Toma" born, greeted back and eroded to ${m2t.strength}/${t2m.strength} on BOTH sides · the report's relationships view names both parties`);

// ── §5 §60 — no model, and no vocabulary the engine cannot read ──────────────────────────────────────
const declaredTypes = ['city', 'town', 'village', 'dungeon', 'wilderness', 'landmark', 'building', 'room', 'other'];
const declaredCategories = ['history', 'myth', 'geography', 'magic', 'technology', 'culture', 'person', 'event', 'artifact', 'other'];
for (const l of held.locations.values()) {
  assert.ok(declaredTypes.includes(l.type), `the Studio used an undeclared location type: ${l.type}`);
}
for (const l of held.lore.values()) {
  assert.ok(declaredCategories.includes(l.category), `the Studio used an undeclared lore category: ${l.category}`);
}
// The report says what it is: a world's structure. No field claims a model, a provider or a generation.
const flat = JSON.stringify(report).toLowerCase();
for (const word of ['provider', 'openai', 'gpt', 'llm', 'model']) {
  assert.equal(flat.includes(word), false, `the world report mentions "${word}", which would imply a model behind it`);
}
console.log(`[§5] §60: ${declaredTypes.length} declared location types and ${declaredCategories.length} declared lore categories are the ONLY vocabulary the Studio used · the report carries no provider/model field, because no model is attached`);

// ── §6 the home repository never moved ───────────────────────────────────────────────────────────────
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§6: this repository HEAD byte-identical — everything here ran in memory');

rmSync(box, { recursive: true, force: true });

console.log(`\n[summary] the FIRST product consumer of @nexus/world-engine: the Studio's world surface, graded from the SHIPPED Studio module (type-stripped, not copied) over the SHIPPED engine · 1 world + ${report.locations.length} locations + ${report.characters.length} characters + ${report.lore.length} lore composed in memory, its places CONNECTED and two characters seated together · every character's place verified by id against the world · the report proven DERIVED by moving the engine under it · 1 deterministic tick introducing the co-located pair on BOTH sides of one named bond · no model attached and none claimed · home HEAD byte-identical: yes`);
console.log('[world-surface-proof] ALL ASSERTIONS PASSED (the world lane is reachable from the product, and the surface describes a world rather than a model)');
