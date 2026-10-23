import { describe, expect, it } from 'vitest';
import { WorldRAG, type WorldRAGIndex } from '../src/rag.js';
import {
  characterId,
  eventId,
  factionId,
  loreId,
  locationId,
  worldId,
  type Character,
  type Location,
  type WorldState,
} from '../src/types.js';

// `rag.ts` (WorldRAG) had no direct unit coverage before this file — it is only exercised
// indirectly through WorldEngine. These pin the index build + query/scoping/filter/limit/context
// behavior and the get/update/remove/getStats document ops, all against a minimal WorldState.

function makeWorld(): WorldState {
  const cid = characterId('c1');
  const lid = locationId('l1');
  const char: Character = {
    id: cid,
    name: 'Aria',
    description: 'A brave warrior of the village',
    archetype: 'warrior',
    locationId: lid,
    factionId: null,
    attributes: { strength: 10, intelligence: 5, charisma: 6, stealth: 4, perception: 7, willpower: 8 },
    relationships: new Map(),
    knowledge: {
      knownFacts: new Set(),
      knownLocations: new Set(),
      knownCharacters: new Set(),
      knownLore: new Set(),
      secrets: new Set(),
      rumors: new Map(),
    },
    goals: [{ id: 'g1', description: 'Defeat the dragon', priority: 1, status: 'active', progress: 0, dependencies: [] }],
    inventory: [],
    status: { health: 100, maxHealth: 100, energy: 100, maxEnergy: 100, conditions: [] },
    createdAt: 0,
    updatedAt: 100,
  };
  const loc: Location = {
    id: lid,
    name: 'Oakhaven',
    description: 'A quiet village by the forest',
    type: 'village',
    parentId: null,
    children: [],
    connectedLocations: new Map(),
    inhabitants: [cid],
    npcs: [],
    items: [],
    events: [],
    lore: [],
    tags: ['forest', 'peaceful'],
    metadata: {},
  };
  return {
    id: worldId('w1'),
    name: 'Test World',
    description: 'd',
    genre: 'fantasy',
    timeline: [],
    characters: new Map([[cid, char]]),
    locations: new Map([[lid, loc]]),
    factions: new Map(),
    lore: new Map(),
    currentTime: 0,
    metadata: {},
  };
}

describe('WorldRAG — index build', () => {
  it('rebuilds the per-type indexes from world state', () => {
    const rag = new WorldRAG();
    rag.setWorldState(makeWorld());
    const stats = rag.getStats();
    expect(stats).toEqual({ characters: 1, locations: 1, factions: 0, lore: 0, events: 0 });
    expect(rag.getDocument('character', 'c1')?.title).toBe('Aria');
    expect(rag.getDocument('location', 'l1')?.title).toBe('Oakhaven');
  });

  it('does not build when no world state is set', () => {
    const rag = new WorldRAG();
    const stats = rag.getStats();
    expect(stats).toEqual({ characters: 0, locations: 0, factions: 0, lore: 0, events: 0 });
  });
});

describe('WorldRAG — query', () => {
  const rag = new WorldRAG();
  rag.setWorldState(makeWorld());

  it('returns character hits for a matching query', () => {
    const res = rag.query({ query: 'Aria warrior', worldId: worldId('w1') });
    expect(res.results.length).toBeGreaterThanOrEqual(1);
    expect(res.results[0]!.type).toBe('character');
    expect(res.query).toBe('Aria warrior');
  });

  it('respects scope (only locations when scoped to locations)', () => {
    const res = rag.query({ query: 'Oakhaven', scope: 'locations', worldId: worldId('w1') });
    expect(res.results.length).toBeGreaterThanOrEqual(1);
    expect(res.results.every((r) => r.type === 'location')).toBe(true);
  });

  it('applies metadata filters and drops non-matching docs', () => {
    const hit = rag.query({ query: 'Aria', filters: { archetype: 'warrior' }, worldId: worldId('w1') });
    expect(hit.results.some((r) => r.id === 'c1')).toBe(true);
    const miss = rag.query({ query: 'Aria', filters: { archetype: 'mage' }, worldId: worldId('w1') });
    expect(miss.results.some((r) => r.id === 'c1')).toBe(false);
  });

  it('honors limit (limit 0 yields no results) and includeContext', () => {
    const limited = rag.query({ query: 'Aria', limit: 0, worldId: worldId('w1') });
    expect(limited.results).toHaveLength(0);
    const withCtx = rag.query({ query: 'Aria', includeContext: true, worldId: worldId('w1') });
    expect(withCtx.context).toContain('[CHARACTER]');
    expect(withCtx.totalHits).toBeGreaterThanOrEqual(1);
  });
});

describe('WorldRAG — document mutations', () => {
  it('update / remove a document and reflect it in stats', () => {
    const rag = new WorldRAG();
    rag.setWorldState(makeWorld());
    const doc = rag.getDocument('character', 'c1')!;
    rag.updateDocument('character', 'c1', { ...doc, title: 'Renamed' });
    expect(rag.getDocument('character', 'c1')?.title).toBe('Renamed');
    rag.removeDocument('character', 'c1');
    expect(rag.getDocument('character', 'c1')).toBeUndefined();
    expect(rag.getStats().characters).toBe(0);
  });
});


// v433 — the QUERY CONTRACT's own rules, graded directly.
//
// The cases above pin that a query returns hits, respects scope/filter/limit and can carry a context.
// What they do not pin is the contract those answers are made of: what ORDER equal scores come back in,
// what a limit does to the count the answer reports, what the threshold admits when a document shares
// nothing with the question, what a rebuilt index does to the documents the last world state left
// behind, and what a document actually SAYS. Measured on HEAD, each of these was reachable only by
// reading the code — the query answered correctly while its own rules went unasked.

/** Two characters with identical words and different ids: the only way to make a score tie on purpose. */
function twinWorld(): WorldState {
  const world = makeWorld();
  const twin: Character = { ...world.characters.get(characterId('c1'))!, id: characterId('c2') };
  world.characters.set(characterId('c2'), twin);
  return world;
}

/** A character with one active and one finished goal, one relationship, and an event on the timeline. */
function richWorld(): WorldState {
  const world = makeWorld();
  const cid = characterId('c1');
  const char = world.characters.get(cid)!;
  char.goals = [
    { id: 'g1', description: 'Defeat the dragon', priority: 1, status: 'active', progress: 0, dependencies: [] },
    { id: 'g2', description: 'Rest at the inn', priority: 2, status: 'completed', progress: 1, dependencies: [] },
  ];
  char.relationships = new Map([
    [characterId('c2'), { targetId: characterId('c2'), type: 'friend', strength: 80, description: '', establishedAt: 0 }],
  ]);
  world.timeline = [
    {
      id: eventId('e1'),
      timestamp: 55,
      type: 'combat',
      description: 'x'.repeat(80),
      participants: [cid],
      locationId: locationId('l1'),
      cause: 'a slight',
      effects: [{ type: 'attribute-change', target: 'c1', change: { health: -5 }, permanent: false }],
      visibility: 'public',
      metadata: {},
    },
  ];
  return world;
}

describe('WorldRAG — the query contract (v433)', () => {
  it('breaks a score tie by id, so the order is a rule and not a map-iteration accident', () => {
    const rag = new WorldRAG();
    rag.setWorldState(twinWorld());

    const res = rag.query({ query: 'Aria warrior', worldId: worldId('w1') });

    // The twins tie and are ordered by id; the location shares nothing, scores 0, and sorts last.
    expect(res.results.map((r) => r.id)).toEqual(['c1', 'c2', 'l1']);
    expect(res.results[0]!.score).toBe(res.results[1]!.score); // a real tie, not a near one
    expect(res.results[2]!.score).toBe(0);
  });

  it('limit truncates the results while totalHits keeps counting the whole answer', () => {
    const rag = new WorldRAG();
    rag.setWorldState(twinWorld());

    const res = rag.query({ query: 'Aria warrior', limit: 1, worldId: worldId('w1') });

    expect(res.results).toHaveLength(1);
    expect(res.results[0]!.id).toBe('c1'); // the winner of the tie leads the window
    expect(res.totalHits).toBe(3); // the window is not the answer's idea of how many matched
  });

  it('the default threshold admits a document that shares nothing — at score 0 — and a named threshold does not', () => {
    const rag = new WorldRAG();
    rag.setWorldState(makeWorld());

    const ungated = rag.query({ query: 'zzz-nothing-matches', worldId: worldId('w1') });
    expect(ungated.results.map((r) => r.score)).toEqual([0, 0]); // ">= 0" admits them, and says they are worth 0

    const gated = rag.query({ query: 'zzz-nothing-matches', ragScoreThreshold: 0.5, worldId: worldId('w1') });
    expect(gated.results).toHaveLength(0);
    expect(gated.totalHits).toBe(0);
  });

  it('a filter is exact equality on every key it names, including a null one', () => {
    const rag = new WorldRAG();
    rag.setWorldState(makeWorld());

    const both = rag.query({ query: 'Aria', filters: { archetype: 'warrior', factionId: null }, worldId: worldId('w1') });
    expect(both.results.some((r) => r.id === 'c1')).toBe(true);
    const half = rag.query({ query: 'Aria', filters: { archetype: 'warrior', factionId: 'f1' }, worldId: worldId('w1') });
    expect(half.results.some((r) => r.id === 'c1')).toBe(false);
  });

  it('the context is the RANKED hits, each as "[TYPE] title: content", blank-line separated', () => {
    const rag = new WorldRAG();
    rag.setWorldState(makeWorld());

    const res = rag.query({ query: 'Aria warrior', includeContext: true, worldId: worldId('w1') });
    const char = rag.getDocument('character', 'c1')!;
    const loc = rag.getDocument('location', 'l1')!;

    // The character outranks the location (it shares both words), so it leads the context.
    expect(res.context).toBe(`[CHARACTER] ${char.title}: ${char.content}\n\n[LOCATION] ${loc.title}: ${loc.content}`);
    expect(res.searchTime).toBeGreaterThanOrEqual(0); // the answer says how long it took
  });

  it('a second world state REPLACES the index: no document from the last world lingers', () => {
    const rag = new WorldRAG();
    rag.setWorldState(makeWorld());
    expect(rag.getStats().characters).toBe(1);

    rag.setWorldState({ ...makeWorld(), characters: new Map(), locations: new Map() });

    expect(rag.getStats()).toEqual({ characters: 0, locations: 0, factions: 0, lore: 0, events: 0 });
    expect(rag.getDocument('character', 'c1')).toBeUndefined();
  });
});

describe('WorldRAG — what a document says (v433)', () => {
  it('a character document reads as labelled lines and lists only ACTIVE goals', () => {
    const rag = new WorldRAG();
    rag.setWorldState(richWorld());

    const doc = rag.getDocument('character', 'c1')!;
    expect(doc.title).toBe('Aria');
    expect(doc.content).toContain('Location: l1');
    expect(doc.content).toContain('Faction: none'); // no faction is "none", not an empty line
    expect(doc.content).toContain('Goals: Defeat the dragon');
    expect(doc.content).not.toContain('Rest at the inn'); // a finished goal is not an active one
    expect(doc.content).toContain('Relationships: c2: friend (80)');
    expect(doc.lastUpdated).toBe(100); // the character's own updatedAt, not "now"
  });

  it('an event document titles itself type + the first 50 characters, and keeps its own timestamp', () => {
    const rag = new WorldRAG();
    rag.setWorldState(richWorld());

    const doc = rag.getDocument('event', 'e1')!;
    expect(doc.title).toBe(`combat: ${'x'.repeat(50)}`);
    expect(doc.content).toContain('Effects: attribute-change on c1');
    expect(doc.lastUpdated).toBe(55);
  });

  it('a location document stamps itself with NOW — the one builder whose type carries no clock', () => {
    const before = Date.now();
    const rag = new WorldRAG();
    rag.setWorldState(makeWorld());
    const after = Date.now();

    const doc = rag.getDocument('location', 'l1')!;
    expect(doc.lastUpdated).toBeGreaterThanOrEqual(before);
    expect(doc.lastUpdated).toBeLessThanOrEqual(after);
    expect(doc.content).toContain('Connected: '); // an unconnected place says so, with an empty list
    expect(doc.content).toContain('Inhabitants: c1');
  });
});
