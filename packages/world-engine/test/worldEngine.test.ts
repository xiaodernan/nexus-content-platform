import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  WorldEngine,
  WorldRAG,
  CharacterAgent,
  createWorldId,
  createCharacterId,
  createLocationId,
  createFactionId,
  createLoreId,
  type WorldState,
  type Character,
  type Location,
  type Faction,
  type LoreEntry,
  type WorldEvent,
  type RAGQuery,
  RELATIONSHIP_FLOOR,
  deriveRelationType,
  decayStrength,
  gainStrength,
  isDerivableRelationType,
} from '../src/index.js';


describe('WorldEngine', () => {
  let engine: WorldEngine;

  beforeEach(() => {
    engine = new WorldEngine();
  });

  it('creates a world with default state', () => {
    const world = engine.getWorld();
    expect(world.id).toBeDefined();
    expect(world.name).toBe('New World');
    expect(world.characters.size).toBe(0);
    expect(world.locations.size).toBe(0);
    expect(world.factions.size).toBe(0);
    expect(world.lore.size).toBe(0);
  });

  it('creates and retrieves characters', () => {
    const char = engine.createCharacter('Hero', 'A brave hero', 'warrior');
    expect(char.id).toBeDefined();
    expect(char.name).toBe('Hero');
    expect(char.archetype).toBe('warrior');
    expect(char.attributes.strength).toBe(10);

    const world = engine.getWorld();
    expect(world.characters.size).toBe(1);
    expect(world.characters.get(char.id)).toBe(char);
  });

  it('creates character with custom attributes', () => {
    const char = engine.createCharacter('Mage', 'A wise mage', 'mage', null, null, {
      intelligence: 18,
      strength: 6,
    });
    expect(char.attributes.intelligence).toBe(18);
    expect(char.attributes.strength).toBe(6);
  });

  it('creates and connects locations', () => {
    const city = engine.createLocation('Capital City', 'The grand capital', 'city');
    const village = engine.createLocation('River Village', 'A peaceful village', 'village');

    engine.connectLocations(city.id, village.id, {
      type: 'road',
      distance: 50,
      difficulty: 2,
      description: 'Well-maintained road',
    });

    const cityLoc = engine.getWorld().locations.get(city.id)!;
    const conn = cityLoc.connectedLocations.get(village.id);
    expect(conn).toBeDefined();
    expect(conn?.type).toBe('road');
    expect(conn?.distance).toBe(50);
  });

  it('creates factions', () => {
    const faction = engine.createFaction(
      'Knight Order',
      'Protectors of the realm',
      'organization',
      null,
      'Honor and duty above all'
    );
    expect(faction.id).toBeDefined();
    expect(faction.name).toBe('Knight Order');
    expect(faction.type).toBe('organization');
    expect(faction.ideology).toBe('Honor and duty above all');
  });

  it('creates lore entries', () => {
    const lore = engine.createLore(
      'The Great War',
      'A war that shaped the continent',
      'history',
      ['war', 'history'],
      'public'
    );
    expect(lore.id).toBeDefined();
    expect(lore.title).toBe('The Great War');
    expect(lore.category).toBe('history');
    expect(lore.visibility).toBe('public');
  });

  it('moves character between locations', () => {
    const city = engine.createLocation('City', 'Big city', 'city');
    const forest = engine.createLocation('Forest', 'Dark forest', 'wilderness');

    const char = engine.createCharacter('Traveler', 'A wanderer', 'ranger', city.id);
    expect(char.locationId).toBe(city.id);

    const moved = engine.addCharacterToLocation(char.id, forest.id);
    expect(moved).toBe(true);
    expect(char.locationId).toBe(forest.id);

    const cityLoc = engine.getWorld().locations.get(city.id)!;
    const forestLoc = engine.getWorld().locations.get(forest.id)!;
    expect(cityLoc.inhabitants).not.toContain(char.id);
    expect(forestLoc.inhabitants).toContain(char.id);
  });

  it('start schedules the tick + autosave intervals, is idempotent, and stop clears them', () => {
    // The old form of this test called start(); stop(); with a "Should not throw" comment and
    // asserted NOTHING — a green that proved only that neither method threw. `isRunning` is
    // private, but the intervals it schedules are observable, so the contract is graded directly.
    vi.useFakeTimers();
    try {
      expect(vi.getTimerCount(), 'a fresh engine has scheduled nothing').toBe(0);
      engine.start();
      const afterStart = vi.getTimerCount();
      expect(afterStart, 'start() must schedule the tick interval (and autosave when configured)').toBeGreaterThan(0);
      engine.start(); // a second start must NOT add a second pair of intervals
      expect(vi.getTimerCount(), 'start() is idempotent: a second call schedules nothing more').toBe(afterStart);
      engine.stop();
      expect(vi.getTimerCount(), 'stop() must clear every interval start() created').toBe(0);
    } finally {
      engine.stop();
      vi.useRealTimers();
    }
  });

  it('serializes and deserializes world state', () => {
    const city = engine.createLocation('Test City', 'A city', 'city');
    const char = engine.createCharacter('Test Char', 'A character', 'warrior', city.id);

    const json = engine.save();
    expect(json).toContain('Test City');
    expect(json).toContain('Test Char');

    const newEngine = new WorldEngine();
    newEngine.load(json);

    const world = newEngine.getWorld();
    expect(world.locations.size).toBe(1);
    expect(world.characters.size).toBe(1);
    expect(world.locations.get(city.id)?.name).toBe('Test City');
    expect(world.characters.get(char.id)?.name).toBe('Test Char');
  });

  it('provides stats', () => {
    engine.createLocation('City', 'City', 'city');
    engine.createLocation('Village', 'Village', 'village');
    engine.createCharacter('Char1', 'Char 1', 'warrior');
    engine.createCharacter('Char2', 'Char 2', 'mage');
    engine.createFaction('Faction1', 'Faction', 'guild');

    const stats = engine.getStats();
    expect(stats.locations).toBe(2);
    expect(stats.characters).toBe(2);
    expect(stats.factions).toBe(1);
    expect(stats.agents).toBe(2);
  });
});

describe('WorldRAG', () => {
  let engine: WorldEngine;
  let rag: WorldRAG;

  beforeEach(() => {
    engine = new WorldEngine();
    rag = engine.getRAG();
  });

  it('indexes characters', () => {
    engine.createCharacter('Hero', 'A brave warrior', 'warrior');
    engine.createCharacter('Mage', 'A wise spellcaster', 'mage');

    const stats = rag.getStats();
    expect(stats.characters).toBe(2);
  });

  it('queries characters by name', () => {
    engine.createCharacter('Aragorn', 'Ranger of the North', 'ranger');
    engine.createCharacter('Gandalf', 'Wizard of great power', 'wizard');

    const result = rag.query({
      query: 'Aragorn',
      worldId: createWorldId('test'),
      scope: 'characters',
    });

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0]!.title).toBe('Aragorn');
    expect(result.results[0]!.type).toBe('character');
  });

  it('queries locations', () => {
    engine.createLocation('Minas Tirith', 'White city of Gondor', 'city');
    engine.createLocation('Mordor', 'Dark land of Sauron', 'wilderness');

    const result = rag.query({
      query: 'Minas',
      worldId: createWorldId('test'),
      scope: 'locations',
    });

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0]!.type).toBe('location');
  });

  it('queries lore', () => {
    engine.createLore('The One Ring', 'A ring of power', 'artifact', ['ring', 'power']);
    engine.createLore('Sauron', 'Dark lord', 'person', ['villain']);

    const result = rag.query({
      query: 'ring power',
      worldId: createWorldId('test'),
      scope: 'lore',
    });

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0]!.type).toBe('lore');
  });

  it('returns context when requested', () => {
    engine.createCharacter('Frodo', 'Ring bearer', 'hobbit');

    const result = rag.query({
      query: 'Frodo',
      worldId: createWorldId('test'),
      scope: 'characters',
      includeContext: true,
    });

    expect(result.context).toBeDefined();
    expect(result.context).toContain('Frodo');
  });

  it('filters by metadata', () => {
    engine.createCharacter('Warrior', 'Strong fighter', 'warrior');
    engine.createCharacter('Mage', 'Magic user', 'mage');

    const result = rag.query({
      query: 'character',
      worldId: createWorldId('test'),
      scope: 'characters',
      filters: { archetype: 'warrior' },
    });

    expect(result.results.length).toBe(1);
    expect(result.results[0]!.metadata.archetype).toBe('warrior');
  });
});

describe('CharacterAgent', () => {
  let engine: WorldEngine;
  let rag: WorldRAG;
  let agent: CharacterAgent;
  let char: Character;

  beforeEach(() => {
    engine = new WorldEngine();
    rag = engine.getRAG();
    const city = engine.createLocation('Test City', 'A city', 'city');
    char = engine.createCharacter('Test Hero', 'A hero', 'warrior', city.id);
    agent = new CharacterAgent(char, engine.getWorld(), rag);
  });

  it('creates agent context', () => {
    const context = agent.getContext();
    expect(context.character.id).toBe(char.id);
    expect(context.currentLocation).toBeDefined();
    expect(context.availableActions.length).toBeGreaterThan(0);
  });

  it('includes rest action when low health', () => {
    char.status.health = 30;
    char.status.maxHealth = 100;

    const context = agent.getContext();
    const restAction = context.availableActions.find(a => a.type === 'rest');
    expect(restAction).toBeDefined();
  });

  it('includes move actions for connected locations', () => {
    const city = engine.createLocation('City', 'City', 'city');
    const forest = engine.createLocation('Forest', 'Forest', 'wilderness');
    engine.connectLocations(city.id, forest.id, { type: 'road', distance: 10, difficulty: 1, description: 'Path' });

    engine.addCharacterToLocation(char.id, city.id);
    const context = agent.getContext();

    const moveAction = context.availableActions.find(a => a.id.includes('move-'));
    expect(moveAction).toBeDefined();
  });

  it('makes decisions', async () => {
    const decision = await agent.decide();
    expect(decision.actionId).toBeDefined();
    expect(decision.reasoning).toBeDefined();
    expect(decision.confidence).toBeGreaterThanOrEqual(0);
    expect(decision.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(decision.alternativeActions)).toBe(true);
  });

  it('executes rest action', async () => {
    char.status.health = 50;
    char.status.energy = 50;

    const result = await agent.executeAction('rest');
    expect(result.success).toBe(true);
    expect(char.status.health).toBe(60);
    expect(char.status.energy).toBe(70);
  });

  it('executes move action', async () => {
    const city = engine.createLocation('City', 'City', 'city');
    const forest = engine.createLocation('Forest', 'Forest', 'wilderness');
    engine.connectLocations(city.id, forest.id, { type: 'road', distance: 10, difficulty: 1, description: 'Path' });
    engine.addCharacterToLocation(char.id, city.id);

    const context = agent.getContext();
    const moveAction = context.availableActions.find(a => a.id.startsWith('move-'));
    expect(moveAction).toBeDefined();

    const result = await agent.executeAction(moveAction!.id);
    expect(result.success).toBe(true);
    expect(char.locationId).toBe(forest.id);
  });

  it('executes speak action with NPC', () => {
    const city = engine.createLocation('City', 'City', 'city');
    const npc = engine.createCharacter('NPC', 'A local', 'commoner', city.id);
    city.npcs.push(npc.id);

    engine.addCharacterToLocation(char.id, city.id);
    const context = agent.getContext();

    const speakAction = context.availableActions.find(a => a.id.startsWith('speak-'));
    expect(speakAction).toBeDefined();
  });

  it('tracks action history', async () => {
    await agent.executeAction('rest');
    await agent.executeAction('rest');

    const history = agent.getActionHistory();
    expect(history.length).toBe(2);
    expect(history[0]!.actionId).toBe('rest');
  });

  it('updates goal progress', () => {
    char.goals.push({
      id: 'goal-1',
      description: 'Find the sword',
      priority: 10,
      status: 'active',
      progress: 0,
      dependencies: [],
    });

    agent.updateGoalProgress('goal-1', 50);
    expect(char.goals[0]!.progress).toBe(50);

    agent.updateGoalProgress('goal-1', 100);
    expect(char.goals[0]!.progress).toBe(100);
    expect(char.goals[0]!.status).toBe('completed');
  });

  it('adds knowledge', () => {
    agent.addKnowledge('The sword is in the cave');
    expect(char.knowledge.knownFacts.has('The sword is in the cave')).toBe(true);
  });

  it('adds relationships', () => {
    const npc = engine.createCharacter('Friend', 'A friend', 'commoner');
    agent.addRelationship(npc.id, {
      targetId: npc.id,
      type: 'ally',
      strength: 50,
      description: 'Childhood friend',
      establishedAt: Date.now(),
    });

    const rel = char.relationships.get(npc.id);
    expect(rel).toBeDefined();
    expect(rel?.type).toBe('ally');
    expect(rel?.strength).toBe(50);
  });
});

describe('World Events', () => {
  let engine: WorldEngine;
  let events: WorldEvent[] = [];

  beforeEach(() => {
    engine = new WorldEngine();
    events = [];
    engine.setEventCallbacks({
      onEvent: (e) => events.push(e),
    });
  });

  it('emits events on character creation', () => {
    engine.createCharacter('Hero', 'Hero', 'warrior');
    expect(events.length).toBeGreaterThan(0);
  });

  it('emits events on location creation', () => {
    engine.createLocation('City', 'City', 'city');
    expect(events.length).toBeGreaterThan(0);
  });

  it('emits events on faction creation', () => {
    engine.createFaction('Faction', 'Faction', 'guild');
    expect(events.length).toBeGreaterThan(0);
  });

  it('emits events on lore creation', () => {
    engine.createLore('Lore', 'Content', 'history');
    expect(events.length).toBeGreaterThan(0);
  });
});

describe('Relationship simulation (v162)', () => {
  it('derives a bond type from its strength bands', () => {
    expect(deriveRelationType(9)).toBe('enemy');
    expect(deriveRelationType(10)).toBe('neutral');
    expect(deriveRelationType(59)).toBe('neutral');
    expect(deriveRelationType(60)).toBe('friend');
    expect(deriveRelationType(84)).toBe('friend');
    expect(deriveRelationType(85)).toBe('ally');
  });

  it('decays toward the first-meeting floor and never through it', () => {
    expect(decayStrength(50)).toBe(48);
    expect(decayStrength(11)).toBe(10);
    expect(decayStrength(10)).toBe(10);
    expect(decayStrength(4)).toBe(10);
  });

  it('gains with a cap', () => {
    expect(gainStrength(10)).toBe(15);
    expect(gainStrength(99)).toBe(100);
  });

  it('never retypes a declared bond', () => {
    expect(isDerivableRelationType('family')).toBe(false);
    expect(isDerivableRelationType('romantic')).toBe(false);
    expect(isDerivableRelationType('rival')).toBe(false);
    expect(isDerivableRelationType('neutral')).toBe(true);
    expect(isDerivableRelationType('ally')).toBe(true);
  });

  it('steps the world deterministically: ticks advance and an empty world decides nothing', async () => {
    const engine = new WorldEngine();
    const report = await engine.tickOnce();
    expect(report.tick).toBe(1);
    expect(report.agents).toBe(0);
    expect(report.decisions).toBe(0);
    expect(report.actions).toBe(0);
    expect(engine.getStats().ticks).toBe(1);
    const second = await engine.tickOnce();
    expect(second.tick).toBe(2);
  });

  it('a hurt character executes rest through the tick, measurably', async () => {
    const engine = new WorldEngine();
    const char = engine.createCharacter('Hurt', 'needs rest', 'warrior');
    char.status.health = 30;
    const report = await engine.tickOnce();
    expect(report.decisions).toBe(1);
    expect(report.actions).toBe(1);
    expect(char.status.health).toBe(40);
  });

  it('a healthy world executes nothing: the confidence gate refuses zero-score decisions', async () => {
    const engine = new WorldEngine();
    engine.createCharacter('Idle', 'nothing to do', 'commoner');
    const report = await engine.tickOnce();
    expect(report.decisions).toBe(1);
    expect(report.actions).toBe(0);
  });

  it('decay erodes unmaintained bonds and retypes only the derivable bands', async () => {
    const engine = new WorldEngine();
    const a = engine.createCharacter('A', 'a', 'commoner');
    const b = engine.createCharacter('B', 'b', 'commoner');
    const c = engine.createCharacter('C', 'c', 'commoner');
    a.relationships.set(b.id, { targetId: b.id, type: 'ally', strength: 86, description: 'war-forged', establishedAt: 0 });
    a.relationships.set(c.id, { targetId: c.id, type: 'family', strength: 30, description: 'kin', establishedAt: 0 });

    const report = await engine.tickOnce();

    expect(report.relationshipsChanged).toBe(2);
    const allyBond = a.relationships.get(b.id)!;
    expect(allyBond.strength).toBe(84);
    expect(allyBond.type).toBe('friend');
    const familyBond = a.relationships.get(c.id)!;
    expect(familyBond.strength).toBe(28);
    expect(familyBond.type).toBe('family');
  });

  it('speak builds the bond on BOTH sides (v162 reciprocity)', async () => {
    const engine = new WorldEngine();
    const city = engine.createLocation('City', 'c', 'city');
    const mira = engine.createCharacter('Mira', 'm', 'rogue', city.id);
    const toma = engine.createCharacter('Toma', 't', 'commoner', city.id);
    city.npcs.push(toma.id);
    const agent = engine.getAgent(mira.id)!;

    await agent.executeAction(`speak-${toma.id}`);
    const m2t = mira.relationships.get(toma.id);
    const t2m = toma.relationships.get(mira.id);
    expect(m2t).toBeDefined();
    expect(t2m).toBeDefined();
    expect(m2t!.strength).toBe(10);
    expect(t2m!.strength).toBe(10);
    expect(m2t!.type).toBe('neutral');

    await agent.executeAction(`speak-${toma.id}`);
    expect(mira.relationships.get(toma.id)!.strength).toBe(15);
    expect(toma.relationships.get(mira.id)!.strength).toBe(15);
  });

  it('enough dialogue promotes the bond through the bands', async () => {
    const engine = new WorldEngine();
    const city = engine.createLocation('City', 'c', 'city');
    const mira = engine.createCharacter('Mira', 'm', 'rogue', city.id);
    const toma = engine.createCharacter('Toma', 't', 'commoner', city.id);
    city.npcs.push(toma.id);
    const agent = engine.getAgent(mira.id)!;

    await agent.executeAction(`speak-${toma.id}`);
    for (let i = 0; i < 15; i++) await agent.executeAction(`speak-${toma.id}`);
    const bond = mira.relationships.get(toma.id)!;
    expect(bond.strength).toBe(85);
    expect(bond.type).toBe('ally');
  });

  it('save/load is LOSSLESS for knowledge now: facts, secrets and rumors survive, and the loaded agent still learns', () => {
    const engine = new WorldEngine();
    const city = engine.createLocation('City', 'c', 'city');
    const char = engine.createCharacter('Scribe', 's', 'scholar', city.id);
    const friend = engine.createCharacter('Friend', 'f', 'commoner');
    char.knowledge.knownFacts.add('The ford is guarded');
    char.knowledge.secrets.add('Vane never comes down');
    char.knowledge.rumors.set('a ghost on the ridge', 3);
    char.knowledge.knownCharacters.add(friend.id);
    engine.getAgent(char.id)!.addRelationship(friend.id, {
      targetId: friend.id, type: 'friend', strength: 70, description: 'pen pals', establishedAt: 0,
    });

    const json = engine.save();
    const loaded = new WorldEngine();
    loaded.load(json);
    const restored = loaded.getWorld().characters.get(char.id)!;

    expect(restored.knowledge.knownFacts instanceof Set).toBe(true);
    expect(restored.knowledge.knownFacts.has('The ford is guarded')).toBe(true);
    expect(restored.knowledge.secrets.has('Vane never comes down')).toBe(true);
    expect(restored.knowledge.rumors.get('a ghost on the ridge')).toBe(3);
    expect(restored.knowledge.knownCharacters.has(friend.id)).toBe(true);
    expect(restored.relationships.get(friend.id)?.strength).toBe(70);
    expect(() => loaded.getAgent(char.id)!.addKnowledge('learned after the round-trip')).not.toThrow();
    expect(restored.knowledge.knownFacts.has('learned after the round-trip')).toBe(true);
  });
});
describe('v162 — speak reaches co-located characters, declared NPC or not', () => {
  it('offers speak for an inhabitant nobody registered as an NPC, and not for oneself', async () => {
    const engine = new WorldEngine();
    const city = engine.createLocation('City', 'c', 'city');
    const mira = engine.createCharacter('Mira', 'm', 'rogue', city.id);
    const toma = engine.createCharacter('Toma', 't', 'commoner', city.id);
    const agent = engine.getAgent(mira.id)!;
    const context = agent.getContext();
    const ids = context.availableActions.filter((a) => a.id.startsWith('speak-')).map((a) => a.id);
    expect(ids).toEqual([`speak-${toma.id}`]);
  });
});
