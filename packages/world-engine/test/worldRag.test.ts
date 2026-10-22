import { describe, expect, it } from 'vitest';
import { WorldRAG, type WorldRAGIndex } from '../src/rag.js';
import {
  characterId,
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
