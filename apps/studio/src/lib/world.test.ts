import { describe, expect, it } from 'vitest';
import { buildStudioWorld, buildWorldReport, type WorldEngineLike } from './world';

/**
 * M4 v148 (extended v162) — the Studio's world surface, pure half.
 *
 * These cases run with NO React, NO DOM and NO world package, which is the point of the split: what world
 * the Studio composes, and what the engine holds, are functions of a narrow structural interface — so they
 * can be asserted here and again in a real browser by the CDP proof without the two disagreeing about what
 * they checked. v162 adds the relationships view (schema 2) and the connected, meetable composition.
 */

interface FakeRel {
  targetId: string;
  type: string;
  strength: number;
}

interface FakeChar {
  id: string;
  name: string;
  archetype: string;
  locationId: string | null;
  relationships: Map<string, FakeRel>;
}

function fakeEngine() {
  const characters = new Map<string, FakeChar>();
  const locations = new Map<string, { id: string; name: string; type: string }>();
  const lore = new Map<string, { id: string; title: string; category: string }>();
  const connections: string[] = [];
  const created: { kind: string; name: string; extra: unknown }[] = [];
  let seq = 0;
  const id = (p: string) => `${p}-${++seq}`;

  const engine: WorldEngineLike = {
    getWorld: () => ({
      id: 'world-1',
      name: 'New World',
      genre: 'fantasy',
      description: 'A procedurally generated world',
      characters,
      locations,
      lore,
    }),
    getStats: () => ({
      characters: characters.size,
      locations: locations.size,
      factions: 0,
      lore: lore.size,
      events: 0,
      agents: characters.size,
      ticks: 0,
    }),
    createLocation(name, _description, type) {
      const created_ = { id: id('loc'), name, type };
      locations.set(created_.id, created_);
      created.push({ kind: 'location', name, extra: type });
      return created_;
    },
    createCharacter(name, _description, archetype, locationId) {
      const created_: FakeChar = { id: id('char'), name, archetype, locationId: locationId ?? null, relationships: new Map() };
      characters.set(created_.id, created_);
      created.push({ kind: 'character', name, extra: locationId ?? null });
      return created_;
    },
    createLore(title, _content, category) {
      const created_ = { id: id('lore'), title, category };
      lore.set(created_.id, created_);
      created.push({ kind: 'lore', name: title, extra: category });
      return created_;
    },
    connectLocations(fromId, toId, connection) {
      const from = locations.get(fromId)?.name ?? fromId;
      const to = locations.get(toId)?.name ?? toId;
      connections.push(`${from}->${to}:${connection.type}`);
    },
  };
  return { engine, created, characters, locations, lore, connections };
}

describe('buildStudioWorld — what the Studio puts in the world', () => {
  it('composes three locations, four characters and two lore entries', () => {
    const { engine, created } = fakeEngine();
    const built = buildStudioWorld(engine);

    expect(built.locationIds).toHaveLength(3);
    expect(built.characterIds).toHaveLength(4);
    expect(built.loreIds).toHaveLength(2);
    expect(created.filter((c) => c.kind === 'location').map((c) => c.name)).toEqual(['Ashen Ford', 'The Grey Ridge', 'Lowmarch']);
    expect(created.filter((c) => c.kind === 'character').map((c) => c.name)).toEqual(['Mira', 'Toma', 'Cassian', 'Vane']);
    expect(created.filter((c) => c.kind === 'lore').map((c) => c.name)).toEqual(['The Sundering', 'The Grey Watch']);
  });

  it('CONNECTS its places — a world of unconnected rooms has nothing to walk (v162)', () => {
    const { connections } = fakeEngineAndBuild();
    expect(connections).toEqual(['Ashen Ford->The Grey Ridge:path', 'Ashen Ford->Lowmarch:road']);
  });

  it('seats TWO characters at the ford, so the simulation can actually introduce them (v162)', () => {
    const { characters, locations } = fakeEngineAndBuild();
    const fordId = [...locations.values()].find((l) => l.name === 'Ashen Ford')!.id;
    const atFord = [...characters.values()].filter((c) => c.locationId === fordId).map((c) => c.name);
    expect(atFord.sort()).toEqual(['Mira', 'Toma']);
  });

  it('uses ONLY declared words for location types and lore categories', () => {
    // The engine reads these as a closed vocabulary; a word outside it would be stored and never read.
    const { created } = fakeEngineAndBuild();
    const types = created.filter((c) => c.kind === 'location').map((c) => c.extra);
    const categories = created.filter((c) => c.kind === 'lore').map((c) => c.extra);
    for (const t of types) expect(['city', 'town', 'village', 'dungeon', 'wilderness', 'landmark', 'building', 'room', 'other']).toContain(t);
    for (const c of categories) expect(['history', 'myth', 'geography', 'magic', 'technology', 'culture', 'person', 'event', 'artifact', 'other']).toContain(c);
  });

  it('EVERY character is placed in a location the world really holds', () => {
    // A world where a character stands nowhere is one a reader cannot walk, and it is the defect the
    // agent-side `world.character.add` door refuses — the Studio must not compose one either.
    const { characters, locations } = fakeEngineAndBuild();
    const held = new Set(locations.keys());
    for (const c of characters.values()) {
      expect(c.locationId, `${c.name} stands nowhere`).toBeTruthy();
      expect(held.has(c.locationId!), `${c.name} stands in a location the world does not hold`).toBe(true);
    }
  });

  it('gives every body a distinct id, so nothing overwrites anything', () => {
    const { created } = fakeEngineAndBuild();
    const ids = [...new Map([...created].map((c) => [c.name, c])).values()].length;
    expect(ids).toBe(created.length);
  });
});

function fakeEngineAndBuild() {
  const f = fakeEngine();
  buildStudioWorld(f.engine);
  return f;
}

describe('buildWorldReport — the engine’s state, as a plain report', () => {
  it('reports the world’s own identity and counts', () => {
    const { engine } = fakeEngine();
    buildStudioWorld(engine);
    const report = buildWorldReport(engine);

    expect(report.schema).toBe(2);
    expect(report).toMatchObject({ id: 'world-1', name: 'New World', genre: 'fantasy' });
    expect(report.stats).toMatchObject({ locations: 3, characters: 4, lore: 2, agents: 4 });
  });

  it('resolves each character’s place to the LOCATION’S NAME, not its id', () => {
    // A panel that showed the raw id would be showing the caller its own reference instead of the
    // world's answer.
    const { engine, locations } = fakeEngine();
    buildStudioWorld(engine);
    const report = buildWorldReport(engine);
    const names = new Set([...locations.values()].map((l) => l.name));

    expect(report.characters).toHaveLength(4);
    for (const c of report.characters) {
      expect(c.locationName, `${c.name} has no place`).toBeTruthy();
      expect(names.has(c.locationName!), `${c.name}'s place "${c.locationName}" is not a location name`).toBe(true);
    }
    // And the specific relation the composer intended holds.
    expect(report.characters.find((c) => c.name === 'Mira')!.locationName).toBe('Ashen Ford');
    expect(report.characters.find((c) => c.name === 'Vane')!.locationName).toBe('The Grey Ridge');
  });

  it('reports a character standing in a location the world does NOT hold as null, not as a dangling id', () => {
    const { engine, characters } = fakeEngine();
    buildStudioWorld(engine);
    characters.set('orphan', { id: 'orphan', name: 'Orphan', archetype: 'nobody', locationId: 'loc-gone', relationships: new Map() });

    const report = buildWorldReport(engine);
    const orphan = report.characters.find((c) => c.name === 'Orphan')!;
    expect(orphan.locationName).toBeNull();
    expect(JSON.stringify(report)).not.toContain('loc-gone'); // the dangling id is not leaked as a name
  });

  it('reports a character standing NOWHERE as null too', () => {
    const { engine, characters } = fakeEngine();
    buildStudioWorld(engine);
    characters.set('nowhere', { id: 'nowhere', name: 'Nowhere', archetype: 'nobody', locationId: null, relationships: new Map() });
    const report = buildWorldReport(engine);
    expect(report.characters.find((c) => c.name === 'Nowhere')!.locationName).toBeNull();
  });

  it('an empty engine answers with empty collections rather than a fabricated world', () => {
    const { engine } = fakeEngine();
    const report = buildWorldReport(engine);
    expect(report.locations).toEqual([]);
    expect(report.characters).toEqual([]);
    expect(report.lore).toEqual([]);
    expect(report.relationships).toEqual([]);
    expect(report.stats.locations).toBe(0);
    expect(report.name).toBe('New World'); // the engine's own default, not a Studio invention
  });

  it('lists lore with its declared category', () => {
    const { engine } = fakeEngine();
    buildStudioWorld(engine);
    const report = buildWorldReport(engine);
    expect(report.lore.map((l) => l.title)).toEqual(['The Sundering', 'The Grey Watch']);
    expect(report.lore.map((l) => l.category)).toEqual(['history', 'myth']);
  });

  it('resolves a bond’s other party to a NAME, and a bond with an unknown target to null (v162)', () => {
    const { engine, characters, locations } = fakeEngine();
    buildStudioWorld(engine);
    const mira = [...characters.values()].find((c) => c.name === 'Mira')!;
    const toma = [...characters.values()].find((c) => c.name === 'Toma')!;
    mira.relationships.set(toma.id, { targetId: toma.id, type: 'neutral', strength: 10 });
    toma.relationships.set(mira.id, { targetId: mira.id, type: 'neutral', strength: 10 });
    // And a bond pointing at a character the world does not hold — the engine would store it; the
    // report must not turn it into a dangling name.
    mira.relationships.set('char-ghost', { targetId: 'char-ghost', type: 'rival', strength: 40 });

    const report = buildWorldReport(engine);
    expect(report.relationships).toHaveLength(3);
    const m2t = report.relationships.find((p) => p.from === 'Mira' && p.to === 'Toma')!;
    expect(m2t).toMatchObject({ type: 'neutral', strength: 10 });
    const t2m = report.relationships.find((p) => p.from === 'Toma')!;
    expect(t2m.to).toBe('Mira');
    const ghost = report.relationships.find((p) => p.from === 'Mira' && p.to === null)!;
    expect(ghost).toMatchObject({ type: 'rival', strength: 40 });
    // The ghost id is dropped, not leaked: both maps (locations) and rows resolve by name only.
    expect(JSON.stringify(report.relationships)).not.toContain('char-ghost');
    expect(locations.size).toBe(3);
  });

  it('the report is JSON-safe — no Maps, no functions, nothing a harness cannot read', () => {
    const { engine, characters } = fakeEngine();
    buildStudioWorld(engine);
    const mira = [...characters.values()].find((c) => c.name === 'Mira')!;
    const toma = [...characters.values()].find((c) => c.name === 'Toma')!;
    mira.relationships.set(toma.id, { targetId: toma.id, type: 'neutral', strength: 10 });

    const report = buildWorldReport(engine);
    const round = JSON.parse(JSON.stringify(report));
    expect(round).toEqual(report);
    for (const value of Object.values(report)) expect(value).not.toBeInstanceOf(Map);
  });
});
