import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../src/registry.js';
import {
  WORLD_LOCATION_TYPES,
  WORLD_LORE_CATEGORIES,
  WORLD_TOOL_SPECS,
  registerWorldTools,
  type WorldDriver,
  type WorldSummary,
} from '../src/worldTools.js';

/**
 * M4 v144 — the `world.*` family, and the FIRST consumer of `@nexus/world-engine`.
 *
 * The package had 31 green tests and no consumer at all: `grep -rl '@nexus/world-engine'` across
 * `apps/ agents/ packages/` matched only its own `package.json`. This suite is the agent-side half of
 * closing that; the REAL engine is wired behind the seam by
 * `docs/evidence/agents/world-tools-proof.mjs`, so a seam width that only suited a fake fails there.
 *
 * What is asserted is what the FAMILY owns: which doors are read-class and which are not (and why the
 * decision door cannot be read), the argument and declared-word refusals, that a character may not be
 * placed in a location the world does not hold, and that the registry's §28 gate is the only gate.
 */

function fakeDriver(over: Partial<WorldDriver> = {}) {
  const locations: { id: string; name: string }[] = [];
  const characters: { id: string; name: string; locationId: string | null }[] = [];
  const lore: { id: string; title: string }[] = [];
  const calls: string[] = [];
  let seq = 0;
  const next = (p: string) => `${p}-${++seq}`;

  const base: WorldDriver = {
    engine: 'fake-world',
    summarize(): WorldSummary {
      return {
        id: 'world-1',
        name: 'New World',
        genre: 'fantasy',
        description: 'a world',
        stats: {
          characters: characters.length,
          locations: locations.length,
          factions: 0,
          lore: lore.length,
          events: 0,
          agents: characters.length,
          ticks: 0,
        },
        characterNames: characters.map((c) => c.name),
        characterIds: characters.map((c) => c.id),
        locationNames: locations.map((l) => l.name),
        locationIds: locations.map((l) => l.id),
        loreTitles: lore.map((l) => l.title),
      };
    },
    addLocation(spec) {
      calls.push(`addLocation:${spec.name}:${spec.type}`);
      const id = next('loc');
      locations.push({ id, name: spec.name });
      return id;
    },
    addCharacter(spec) {
      calls.push(`addCharacter:${spec.name}:${spec.locationId ?? 'nowhere'}`);
      const id = next('char');
      characters.push({ id, name: spec.name, locationId: spec.locationId ?? null });
      return id;
    },
    addLore(spec) {
      calls.push(`addLore:${spec.title}:${spec.category}`);
      const id = next('lore');
      lore.push({ id, title: spec.title });
      return id;
    },
    query(text, limit) {
      calls.push(`query:${text}:${limit}`);
      return {
        query: text,
        totalHits: Math.min(limit, 2),
        hits: [
          { id: 'lore-1', type: 'lore', title: 'The Sundering', score: 0.9 },
          { id: 'char-1', type: 'character', title: 'Mira', score: 0.4 },
        ].slice(0, limit),
      };
    },
    decide(characterId) {
      calls.push(`decide:${characterId}`);
      if (!characters.some((c) => c.id === characterId)) return undefined;
      return {
        characterId,
        actionId: 'patrol',
        reasoning: 'the road is quiet',
        confidence: 0.7,
        alternativeActions: ['rest'],
        expectedOutcome: 'nothing happens',
      };
    },
    simulate(steps) {
      calls.push(`simulate:${steps}`);
      return { steps, ticks: steps, decisions: steps * characters.length, actions: 0, events: 0, relationshipsChanged: 0 };
    },
    relationships() {
      calls.push('relationships');
      return { pairs: [], characters: characters.length };
    },
  };
  return { driver: { ...base, ...over } as WorldDriver, calls, locations, characters, lore };
}

function wired(over: Partial<WorldDriver> = {}) {
  const f = fakeDriver(over);
  const registry = registerWorldTools(new ToolRegistry(), f.driver);
  const approve = { checkpoint: () => true };
  const invoke = (tool: string, args: Record<string, unknown> = {}, opts: unknown = approve) =>
    registry.invoke({ callId: `c-${tool}-${Math.random()}`, tool, args }, opts as never);
  return { ...f, registry, invoke };
}

describe('world tools — the family routes every spec it declares', () => {
  it('registers every declared door', () => {
    const { registry } = wired();
    for (const spec of WORLD_TOOL_SPECS) {
      expect(registry.get(spec.name), `${spec.name} is not registered`).toBeDefined();
    }
  });

  it('declares exactly THREE read-class doors, and the decision door is not one of them', () => {
    // `CharacterAgent.decide()` stores the answer on the agent (`this.lastDecision = decision`), so a
    // door that called it a read would be claiming a mutation did not happen. The count is asserted, not
    // just the membership, because a fourth read door would be a mutation that skipped the §28 gate.
    const read = WORLD_TOOL_SPECS.filter((s) => s.permissions.includes('read')).map((s) => s.name).sort();
    expect(read).toEqual(['world.inspect', 'world.query', 'world.relationships.list']);
    const decide = WORLD_TOOL_SPECS.find((s) => s.name === 'world.character.decide')!;
    expect(decide.permissions).not.toContain('read');
    expect(decide.description).toMatch(/WRITE-class/); // the reason is on the door, not only in a comment
  });
});

describe('world tools — the §28 gate is the registry’s, and it is the only one', () => {
  it('a write door does not run without a checkpoint', async () => {
    const { invoke, calls } = wired();
    const r = await invoke('world.location.add', { name: 'Ashen Ford', description: 'a ford', type: 'town' }, {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/checkpoint/i);
    expect(calls).toEqual([]); // nothing reached the driver
  });

  it('the decision door is gated like a write, because it records one', async () => {
    const { invoke, calls } = wired();
    const r = await invoke('world.character.decide', { characterId: 'char-1' }, {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/checkpoint/i);
    expect(calls).toEqual([]);
  });

  it('all three read doors run with NO checkpoint', async () => {
    const { invoke } = wired();
    expect((await invoke('world.inspect', {}, {})).ok).toBe(true);
    expect((await invoke('world.query', { text: 'sundering' }, {})).ok).toBe(true);
    expect((await invoke('world.relationships.list', {}, {})).ok).toBe(true);
  });

  it('args are validated by the registry before the driver sees them', async () => {
    const { invoke, calls } = wired();
    const r = await invoke('world.lore.add', { title: 'X' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/missing required/);
    expect(calls).toEqual([]);
  });
});

describe('world tools — refusals that name the fact', () => {
  it('an unknown location type lists the declared ones instead of storing a word nothing reads', async () => {
    const { invoke, calls } = wired();
    const r = await invoke('world.location.add', { name: 'Ashen Ford', description: 'a ford', type: 'spaceport' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/the declared values are city, town, village, dungeon, wilderness, landmark, building, room, other/);
    expect(calls).toEqual([]);
  });

  it('an unknown lore category is refused the same way', async () => {
    const { invoke } = wired();
    const r = await invoke('world.lore.add', { title: 'X', content: 'Y', category: 'gossip' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/the declared values are history, myth, geography/);
  });

  it('a character may not be placed in a location the world does not hold', async () => {
    const { invoke, calls } = wired();
    const r = await invoke('world.character.add', { name: 'Mira', description: 'a scout', archetype: 'rogue', locationId: 'loc-ghost' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/holds no location loc-ghost/);
    expect(calls.some((c) => c.startsWith('addCharacter'))).toBe(false); // refused BEFORE the add
  });

  it('and IS placed when the location exists — checked by ID, not by name', async () => {
    const { invoke, characters } = wired();
    const loc = await invoke('world.location.add', { name: 'Ashen Ford', description: 'a ford', type: 'town' });
    const locationId = (loc.output as { locationId: string }).locationId;
    const r = await invoke('world.character.add', { name: 'Mira', description: 'a scout', archetype: 'rogue', locationId });
    expect(r.ok).toBe(true);
    expect(characters[0]!.locationId).toBe(locationId); // the ID was used, not the name
  });

  it('a query limit that is not a finite positive number is refused', async () => {
    const { invoke } = wired();
    expect((await invoke('world.query', { text: 'x', limit: 0 })).error).toMatch(/limit is 0/);
    expect((await invoke('world.query', { text: 'x', limit: -3 })).error).toMatch(/limit is -3/);
    expect((await invoke('world.query', { text: 'x', limit: Number.NaN })).error).toMatch(/limit is null/);
  });

  it('deciding for a character the world has no agent for is refused by name', async () => {
    const { invoke } = wired();
    const r = await invoke('world.character.decide', { characterId: 'char-ghost' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/holds no agent for char-ghost/);
  });

  it('an empty required string is refused, not passed through', async () => {
    const { invoke } = wired();
    expect((await invoke('world.location.add', { name: '', description: 'd', type: 'town' })).error).toMatch(/name must be a non-empty string/);
  });
});

describe('world tools — what a door answers', () => {
  it('inspect reports the world’s structure and its own counts', async () => {
    const { invoke } = wired();
    await invoke('world.location.add', { name: 'Ashen Ford', description: 'a ford', type: 'town' });
    await invoke('world.character.add', { name: 'Mira', description: 'a scout', archetype: 'rogue' });

    const r = await invoke('world.inspect');
    expect(r.ok).toBe(true);
    const out = r.output as WorldSummary & { engine: string };
    expect(out).toMatchObject({ engine: 'fake-world', id: 'world-1', name: 'New World', genre: 'fantasy' });
    expect(out.stats).toMatchObject({ characters: 1, locations: 1, lore: 0 });
    expect(out.characterNames).toEqual(['Mira']);
    expect(out.locationNames).toEqual(['Ashen Ford']);
    expect(out.locationIds).toHaveLength(1);
  });

  it('the add doors report the id they created and the count that followed', async () => {
    const { invoke } = wired();
    const loc = await invoke('world.location.add', { name: 'Ashen Ford', description: 'a ford', type: 'town' });
    expect(loc.output).toMatchObject({ name: 'Ashen Ford', type: 'town', locations: 1 });
    expect((loc.output as { locationId: string }).locationId).toBeTruthy();

    const lore = await invoke('world.lore.add', { title: 'The Sundering', content: 'long ago', category: 'history' });
    expect(lore.output).toMatchObject({ title: 'The Sundering', category: 'history', lore: 1 });
  });

  it('query passes the limit through and reports the hits it got', async () => {
    const { invoke, calls } = wired();
    const r = await invoke('world.query', { text: 'sundering', limit: 1 });
    expect(r.ok).toBe(true);
    const out = r.output as { hits: { title: string }[]; totalHits: number };
    expect(out.hits).toHaveLength(1); // the limit was honoured by the driver
    expect(out.hits[0]!.title).toBe('The Sundering');
    expect(calls).toContain('query:sundering:1');
  });

  it('query with no limit asks for the package’s own default of 10', async () => {
    const { invoke, calls } = wired();
    await invoke('world.query', { text: 'x' });
    expect(calls).toContain('query:x:10');
  });

  it('the decision door reports the whole answer, not just the action', async () => {
    const { invoke } = wired();
    await invoke('world.character.add', { name: 'Mira', description: 'a scout', archetype: 'rogue' });
    const created = await invoke('world.inspect');
    const characterId = (created.output as WorldSummary).characterIds[0];

    const r = await invoke('world.character.decide', { characterId });
    expect(r.ok).toBe(true);
    expect(r.output).toMatchObject({
      engine: 'fake-world',
      characterId,
      actionId: 'patrol',
      confidence: 0.7,
      alternativeActions: ['rest'],
    });
    expect((r.output as { reasoning: string }).reasoning).toBeTruthy();
  });

  it('a driver that answers with a PROMISE is awaited like one that answers directly', async () => {
    const { invoke } = wired({
      summarize: async () => ({
        id: 'w', name: 'Async', genre: 'noir', description: 'd',
        stats: { characters: 0, locations: 0, factions: 0, lore: 0, events: 0, agents: 0, ticks: 0 },
        characterNames: [], characterIds: [], locationNames: [], locationIds: [], loreTitles: [],
      }),
      addLocation: async (spec) => `async-${spec.name}`,
    });
    expect((await invoke('world.inspect')).output).toMatchObject({ name: 'Async' });
    expect((await invoke('world.location.add', { name: 'X', description: 'd', type: 'town' })).output).toMatchObject({ locationId: 'async-X' });
  });

  it('a driver that throws becomes a failed CALL, not a crash of the registry', async () => {
    const { invoke } = wired({
      summarize: () => {
        throw new Error('world store exploded');
      },
    });
    const r = await invoke('world.inspect', {}, {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/world store exploded/);
  });

  it('the declared word lists are exactly the package’s own', () => {
    expect([...WORLD_LOCATION_TYPES]).toEqual(['city', 'town', 'village', 'dungeon', 'wilderness', 'landmark', 'building', 'room', 'other']);
    expect([...WORLD_LORE_CATEGORIES]).toEqual(['history', 'myth', 'geography', 'magic', 'technology', 'culture', 'person', 'event', 'artifact', 'other']);
  });
});
describe('world tools — v162: the world simulates and its bonds are readable', () => {
  it('simulate passes whole positive steps through and reports the engine’s own numbers', async () => {
    const { invoke, calls } = wired();
    const r = await invoke('world.simulate', { steps: 3 });
    expect(r.ok).toBe(true);
    expect(r.output).toMatchObject({ engine: 'fake-world', steps: 3, ticks: 3, decisions: 0, actions: 0 });
    expect(calls).toContain('simulate:3');
  });

  it('simulate is WRITE-class: no checkpoint, no movement', async () => {
    const { invoke, calls } = wired();
    const r = await invoke('world.simulate', { steps: 2 }, {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/checkpoint/i);
    expect(calls.some((c) => c.startsWith('simulate'))).toBe(false);
  });

  it('simulate refuses steps that are not positive whole numbers', async () => {
    const { invoke } = wired();
    expect((await invoke('world.simulate', { steps: 0 })).error).toMatch(/steps is 0/);
    expect((await invoke('world.simulate', { steps: -4 })).error).toMatch(/steps is -4/);
    expect((await invoke('world.simulate', { steps: 1.5 })).error).toMatch(/steps is 1\.5/);
    expect((await invoke('world.simulate', { steps: 'ten' })).error).toMatch(/expected number, got string/); // the registry's own type gate answers first
    expect((await invoke('world.simulate', { steps: Number.NaN })).error).toMatch(/steps is null/);
  });

  it('simulate refuses to move the world more than 1000 ticks in one call, and names the bound', async () => {
    const { invoke } = wired();
    const r = await invoke('world.simulate', { steps: 1001 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/at most 1000 ticks/);
  });

  it('relationships.list is read-class and reports pairs with both sides named', async () => {
    const { invoke } = wired({
      relationships: () => ({
        pairs: [{ characterId: 'char-1', characterName: 'Mira', targetId: 'char-2', targetName: 'Toma', type: 'neutral', strength: 10 }],
        characters: 2,
      }),
    });
    const r = await invoke('world.relationships.list', {}, {});
    expect(r.ok).toBe(true);
    expect(r.output).toMatchObject({ engine: 'fake-world', characters: 2 });
    expect((r.output as { pairs: { characterName: string; targetName: string | null }[] }).pairs[0]).toMatchObject({ characterName: 'Mira', targetName: 'Toma', type: 'neutral', strength: 10 });
  });

  it('a v144-shaped driver that never grew simulate fails as a failed CALL, not a crash', async () => {
    const { invoke } = wired({ simulate: undefined as unknown as WorldDriver['simulate'] });
    const r = await invoke('world.simulate', { steps: 1 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not a function/);
  });
});