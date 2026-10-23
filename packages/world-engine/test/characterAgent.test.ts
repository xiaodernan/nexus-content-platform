import { describe, expect, it, beforeEach } from 'vitest';
import {
  WorldEngine,
  CharacterAgent,
  DEFAULT_AGENT_CONFIG,
  RELATIONSHIP_FLOOR,
  createCharacterId,
  createLocationId,
  createEventId,
  type Character,
  type WorldState,
  type InventoryItem,
} from '../src/index.js';

/**
 * The CHARACTER AGENT’s own rules, graded directly.
 *
 * The agent has been exercised since v144 only THROUGH the engine’s tick — a simulation where the
 * agent decided something, and an assertion about the world afterwards. That is real coverage of the
 * engine and no coverage of the agent: which actions it offers, which one it picks and why, what an
 * execution actually writes. This file asks the agent directly.
 *
 * The rules under test, in the agent’s own words:
 *   - a character between places is still IN the world (v162): rest, goals and a decision are available
 *     with no location at all, and the old code crashed on exactly that;
 *   - anyone CO-LOCATED can be spoken to (v162), and a declared NPC who is also an inhabitant is ONE
 *     candidate, not two;
 *   - survival outranks the road: a hurt or exhausted character rests rather than travels;
 *   - a bond is TWO-SIDED: a conversation writes both sides, and a declared bond keeps its name while
 *     its number grows (v162);
 *   - an action that is not available is REFUSED by name, not silently performed.
 */
describe('CharacterAgent — the actions a character can take', () => {
  let engine: WorldEngine;
  let world: WorldState;
  let camp: ReturnType<WorldEngine['createLocation']>;
  let hero: Character;
  let agent: CharacterAgent;

  beforeEach(() => {
    engine = new WorldEngine();
    world = engine.getWorld();
    camp = engine.createLocation('Camp', 'A camp beside the road', 'landmark');
    hero = engine.createCharacter('Mira', 'A traveller', 'scout', camp.id);
    engine.addCharacterToLocation(hero.id, camp.id);
    agent = new CharacterAgent(hero, world, engine.getRAG());
  });

  const actionIds = (a: CharacterAgent): string[] => a.getContext().availableActions.map(x => x.id);

  it('rest is always available — even to a character between places', () => {
    // v162 — the bug this names: a locationless character used to crash decide(), because the code
    // asserted a location that was never guaranteed. Rest is the one action that needs nowhere.
    const nowhere = engine.createCharacter('Drifter', 'Between places', 'wanderer', null);
    const drifter = new CharacterAgent(nowhere, world, engine.getRAG());

    const context = drifter.getContext();

    expect(context.currentLocation).toBeNull();
    expect(context.nearbyCharacters).toEqual([]);
    expect(context.availableActions.map(a => a.id)).toContain('rest');
  });

  it('every connected location offers a move, priced by the connection', () => {
    const forest = engine.createLocation('Forest', 'Dark trees', 'wilderness');
    engine.connectLocations(camp.id, forest.id, {
      type: 'road',
      distance: 50,
      difficulty: 2,
      description: 'A worn road',
    });

    const move = agent.getContext().availableActions.find(a => a.id === `move-${forest.id}`);

    expect(move).toBeDefined();
    expect(move?.name).toBe('Move to Forest');
    expect(move?.duration).toBe(50 * 60);
    expect(move?.costs?.energy).toBe(25);
  });

  it('anyone CO-LOCATED can be spoken to — not only declared NPCs', () => {
    // v162 — a simulation where Mira cannot greet Toma because nobody declared him an NPC is not a
    // simulation of meeting people.
    const toma = engine.createCharacter('Toma', 'A local', 'local', camp.id);
    engine.addCharacterToLocation(toma.id, camp.id);

    expect(actionIds(agent)).toContain(`speak-${toma.id}`);
  });

  it('a declared NPC who is also an inhabitant is ONE candidate, not two', () => {
    const toma = engine.createCharacter('Toma', 'A local', 'local', camp.id);
    engine.addCharacterToLocation(toma.id, camp.id);
    camp.npcs.push(toma.id);

    const speaks = actionIds(agent).filter(id => id === `speak-${toma.id}`);

    expect(speaks).toHaveLength(1);
  });

  it('an item at the location offers a take that names the item', () => {
    const item: InventoryItem = {
      id: 'item-lantern',
      name: 'Lantern',
      type: 'tool',
      description: 'A brass lantern',
      value: 12,
      properties: {},
    };
    camp.items.push(item);

    const take = agent.getContext().availableActions.find(a => a.id === 'take-item-lantern');

    expect(take?.name).toBe('Take Lantern');
    expect(take?.effects?.[0]).toMatchObject({ type: 'inventory-change', change: { itemId: 'item-lantern' } });
  });

  it('a hurt character is offered healing, and a whole one is not', () => {
    expect(actionIds(agent)).not.toContain('heal');

    hero.status.health = hero.status.maxHealth * 0.4;

    expect(actionIds(agent)).toContain('heal');
  });

  it('an ACTIVE goal offers a pursuit, and a finished one does not', () => {
    hero.goals.push({
      id: 'g-1',
      description: 'find the healing spring',
      priority: 1,
      status: 'active',
      progress: 0,
      dependencies: [],
    });
    hero.goals.push({
      id: 'g-2',
      description: 'already done',
      priority: 1,
      status: 'completed',
      progress: 100,
      dependencies: [],
    });

    const ids = actionIds(agent);

    expect(ids).toContain('pursue-g-1');
    expect(ids).not.toContain('pursue-g-2');
  });

  it('the recent events are the public ones and the character’s own, newest first', () => {
    engine.addEvent({
      id: createEventId('evt-public'),
      timestamp: 1_000,
      type: 'world-state-change',
      description: 'The moon rose',
      participants: [],
      locationId: null,
      cause: 'the world',
      effects: [],
      visibility: 'public',
      metadata: {},
    });
    engine.addEvent({
      id: createEventId('evt-secret'),
      timestamp: 2_000,
      type: 'character-action',
      description: 'Someone else acted, unseen',
      participants: [createCharacterId('char-someone-else')],
      locationId: null,
      cause: 'another character',
      effects: [],
      visibility: 'secret',
      metadata: {},
    });
    engine.addEvent({
      id: createEventId('evt-mine'),
      timestamp: 3_000,
      type: 'character-action',
      description: 'Mira acted',
      participants: [hero.id],
      locationId: camp.id,
      cause: 'the agent',
      effects: [],
      visibility: 'participants',
      metadata: {},
    });

    // The engine writes its own events too (a character was created, a location was created), so the
    // rule is graded on the three this test added: the character’s own and the public one are told,
    // newest first, and somebody else’s secret is not told at all.
    const recent = agent.getContext().recentEvents.map(e => e.id);
    const mine = createEventId('evt-mine');
    const publicOne = createEventId('evt-public');

    expect(recent).toContain(mine);
    expect(recent).toContain(publicOne);
    expect(recent).not.toContain(createEventId('evt-secret'));
    expect(recent.indexOf(mine)).toBeLessThan(recent.indexOf(publicOne));
  });
});

describe('CharacterAgent — the decision', () => {
  let engine: WorldEngine;
  let world: WorldState;
  let hero: Character;
  let agent: CharacterAgent;

  beforeEach(() => {
    engine = new WorldEngine();
    world = engine.getWorld();
    const camp = engine.createLocation('Camp', 'A camp beside the road', 'landmark');
    const forest = engine.createLocation('Forest', 'Dark trees', 'wilderness');
    engine.connectLocations(camp.id, forest.id, {
      type: 'road',
      distance: 50,
      difficulty: 2,
      description: 'A worn road',
    });
    hero = engine.createCharacter('Mira', 'A traveller', 'scout', camp.id);
    engine.addCharacterToLocation(hero.id, camp.id);
    agent = new CharacterAgent(hero, world, engine.getRAG());
  });

  it('names an available action, and the alternatives are other actions', async () => {
    const decision = await agent.decide();

    const ids = agent.getContext().availableActions.map(a => a.id);
    expect(ids).toContain(decision.actionId);
    expect(decision.alternativeActions.length).toBeLessThanOrEqual(3);
    expect(decision.alternativeActions).not.toContain(decision.actionId);
    expect(decision.confidence).toBeGreaterThanOrEqual(0);
    expect(decision.confidence).toBeLessThanOrEqual(1);
    expect(decision.expectedOutcome.length).toBeGreaterThan(0);
  });

  it('a hurt character RESTS rather than takes the road', async () => {
    // The survival weight is the whole point of the agent: a character at a fifth of its health does
    // not walk fifty units, whatever else is on offer.
    hero.status.health = 20;

    const decision = await agent.decide();

    expect(decision.actionId).toBe('rest');
    expect(decision.reasoning).toContain('Health at 20%');
  });

  it('an exhausted character RESTS rather than takes the road', async () => {
    hero.status.energy = 10;

    const decision = await agent.decide();

    expect(decision.actionId).toBe('rest');
  });

  it('the last decision is null before the first, and the decision after', async () => {
    expect(agent.getLastDecision()).toBeNull();

    const decision = await agent.decide();

    expect(agent.getLastDecision()).toBe(decision);
  });

  it('a character with nothing at all still gets an answer', async () => {
    // No location, no goals, no company: the agent answers REST rather than crashing or inventing an
    // action that does not exist (v162's shape).
    hero.locationId = null;

    const decision = await agent.decide();

    expect(decision.actionId).toBe('rest');
  });

  it('the reasoning names the goals it is prioritising', async () => {
    hero.goals.push({
      id: 'g-1',
      description: 'find the healing spring',
      priority: 1,
      status: 'active',
      progress: 0,
      dependencies: [],
    });

    const decision = await agent.decide();

    expect(decision.reasoning).toContain('Prioritizing goals: find the healing spring');
  });
});

describe('CharacterAgent — what an execution writes', () => {
  let engine: WorldEngine;
  let world: WorldState;
  let camp: ReturnType<WorldEngine['createLocation']>;
  let forest: ReturnType<WorldEngine['createLocation']>;
  let hero: Character;
  let agent: CharacterAgent;

  beforeEach(() => {
    engine = new WorldEngine();
    world = engine.getWorld();
    camp = engine.createLocation('Camp', 'A camp beside the road', 'landmark');
    forest = engine.createLocation('Forest', 'Dark trees', 'wilderness');
    engine.connectLocations(camp.id, forest.id, {
      type: 'road',
      distance: 50,
      difficulty: 2,
      description: 'A worn road',
    });
    hero = engine.createCharacter('Mira', 'A traveller', 'scout', camp.id);
    engine.addCharacterToLocation(hero.id, camp.id);
    agent = new CharacterAgent(hero, world, engine.getRAG());
  });

  it('rest restores health and energy, and never past the maximum', async () => {
    hero.status.health = 95;
    hero.status.energy = 90;

    const result = await agent.executeAction('rest');

    expect(result.success).toBe(true);
    expect(hero.status.health).toBe(100);
    expect(hero.status.energy).toBe(100);
    expect(result.outcome).toContain('Recovered to 100 HP');
  });

  it('a move changes the location and writes an event naming both ends', async () => {
    const result = await agent.executeAction(`move-${forest.id}`);

    expect(hero.locationId).toBe(forest.id);
    expect(result.outcome).toContain('Moved from Camp to Forest');
    const event = result.events[0];
    expect(event?.type).toBe('location-change');
    expect(event?.description).toBe('Mira moved to Forest');
    expect(event?.effects[0]?.change).toMatchObject({ from: camp.id, to: forest.id });
  });

  it('a first conversation writes a TWO-SIDED bond at the floor', async () => {
    const toma = engine.createCharacter('Toma', 'A local', 'local', camp.id);
    engine.addCharacterToLocation(toma.id, camp.id);

    const result = await agent.executeAction(`speak-${toma.id}`);

    expect(result.outcome).toBe('Met Toma for the first time');
    // Both sides, or it is a contact list and not a relationship (v162).
    expect(hero.relationships.get(toma.id)?.strength).toBe(RELATIONSHIP_FLOOR);
    expect(toma.relationships.get(hero.id)?.strength).toBe(RELATIONSHIP_FLOOR);
    const event = result.events[0];
    expect(event?.type).toBe('dialogue');
    expect(event?.participants).toEqual([hero.id, toma.id]);
    expect(event?.effects).toHaveLength(2);
  });

  it('a second conversation GROWS the bond on both sides', async () => {
    const toma = engine.createCharacter('Toma', 'A local', 'local', camp.id);
    engine.addCharacterToLocation(toma.id, camp.id);
    await agent.executeAction(`speak-${toma.id}`);

    const second = await agent.executeAction(`speak-${toma.id}`);

    expect(second.outcome).toContain('bond now');
    expect(hero.relationships.get(toma.id)?.strength).toBe(RELATIONSHIP_FLOOR + 5);
    expect(toma.relationships.get(hero.id)?.strength).toBe(RELATIONSHIP_FLOOR + 5);
  });

  it('a DECLARED bond keeps its name while its number grows', async () => {
    // v162 — arithmetic does not un-declare a bond someone wrote: family stays family.
    const toma = engine.createCharacter('Toma', 'A local', 'local', camp.id);
    engine.addCharacterToLocation(toma.id, camp.id);
    agent.addRelationship(toma.id, {
      targetId: toma.id,
      type: 'family',
      strength: 20,
      description: 'Siblings',
      establishedAt: 1_700_000_000_000,
    });

    await agent.executeAction(`speak-${toma.id}`);

    expect(hero.relationships.get(toma.id)?.type).toBe('family');
    expect(hero.relationships.get(toma.id)?.strength).toBe(25);
  });

  it('taking an item moves it from the location into the inventory', async () => {
    camp.items.push({
      id: 'item-lantern',
      name: 'Lantern',
      type: 'tool',
      description: 'A brass lantern',
      value: 12,
      properties: {},
    });

    const result = await agent.executeAction('take-item-lantern');

    expect(result.outcome).toBe('Picked up Lantern');
    expect(hero.inventory.map(i => i.id)).toEqual(['item-lantern']);
    expect(camp.items).toHaveLength(0);
  });

  it('an action that is not available is REFUSED by name', async () => {
    const result = await agent.executeAction('take-item-nothing');

    expect(result.success).toBe(false);
    expect(result.outcome).toBe('Action not available');
    expect(result.events).toEqual([]);
  });

  it('the history records what was done, and the character can be asked for it', async () => {
    await agent.executeAction('rest');
    await agent.executeAction(`move-${forest.id}`);

    const history = agent.getActionHistory();

    expect(history.map(h => h.actionId)).toEqual(['rest', `move-${forest.id}`]);
    expect(history[1]?.outcome).toContain('Moved from Camp to Forest');
  });
});

describe('CharacterAgent — what the world can tell the agent', () => {
  let engine: WorldEngine;
  let hero: Character;
  let agent: CharacterAgent;

  beforeEach(() => {
    engine = new WorldEngine();
    hero = engine.createCharacter('Mira', 'A traveller', 'scout', null);
    agent = new CharacterAgent(hero, engine.getWorld(), engine.getRAG());
  });

  it('a fact the agent is told is a fact it knows', () => {
    agent.addKnowledge('the spring heals');

    expect(agent.getContext().character.knowledge.knownFacts.has('the spring heals')).toBe(true);
  });

  it('goal progress is clamped, and a finished goal is COMPLETED', () => {
    hero.goals.push({
      id: 'g-1',
      description: 'find the healing spring',
      priority: 1,
      status: 'active',
      progress: 0,
      dependencies: [],
    });

    agent.updateGoalProgress('g-1', 150);
    expect(hero.goals[0]?.progress).toBe(100);
    expect(hero.goals[0]?.status).toBe('completed');

    agent.updateGoalProgress('g-1', -20);
    expect(hero.goals[0]?.progress).toBe(0);
  });

  it('a goal that is not the character’s is left alone', () => {
    agent.updateGoalProgress('g-nobody', 50);

    expect(hero.goals).toHaveLength(0);
  });
});

describe('CharacterAgent — the default config, graded directly (v475)', () => {
  let engine: WorldEngine;
  let world: WorldState;
  let hero: Character;
  let agent: CharacterAgent;

  beforeEach(() => {
    engine = new WorldEngine();
    world = engine.getWorld();
    const camp = engine.createLocation('Camp', 'A camp beside the road', 'landmark');
    const forest = engine.createLocation('Forest', 'Dark trees', 'wilderness');
    engine.connectLocations(camp.id, forest.id, {
      type: 'road',
      distance: 50,
      difficulty: 2,
      description: 'A worn road',
    });
    hero = engine.createCharacter('Mira', 'A traveller', 'scout', camp.id);
    engine.addCharacterToLocation(hero.id, camp.id);
    agent = new CharacterAgent(hero, world, engine.getRAG());
  });

  it('the constant is the full pinned shape — six named fields, each in its honest range', () => {
    expect(Object.keys(DEFAULT_AGENT_CONFIG).sort()).toEqual([
      'decisionThreshold', 'goalWeight', 'planningHorizon', 'riskTolerance', 'socialWeight', 'survivalWeight',
    ]);
    expect(DEFAULT_AGENT_CONFIG.decisionThreshold).toBe(0.6);
    expect(DEFAULT_AGENT_CONFIG.planningHorizon).toBe(3);
    expect(DEFAULT_AGENT_CONFIG.riskTolerance).toBe(0.5);
    expect(DEFAULT_AGENT_CONFIG.socialWeight).toBe(0.3);
    expect(DEFAULT_AGENT_CONFIG.goalWeight).toBe(0.4);
    expect(DEFAULT_AGENT_CONFIG.survivalWeight).toBe(0.3);
    for (const w of [DEFAULT_AGENT_CONFIG.riskTolerance, DEFAULT_AGENT_CONFIG.socialWeight, DEFAULT_AGENT_CONFIG.goalWeight, DEFAULT_AGENT_CONFIG.survivalWeight]) {
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThanOrEqual(1);
    }
    expect(DEFAULT_AGENT_CONFIG.decisionThreshold).toBeGreaterThan(0);
    expect(DEFAULT_AGENT_CONFIG.decisionThreshold).toBeLessThanOrEqual(1);
    expect(Number.isInteger(DEFAULT_AGENT_CONFIG.planningHorizon)).toBe(true);
    expect(DEFAULT_AGENT_CONFIG.planningHorizon).toBeGreaterThan(0);
  });

  it('the three decision weights partition unity — a decision is a weighted vote (measured, not argued)', () => {
    const { socialWeight, goalWeight, survivalWeight } = DEFAULT_AGENT_CONFIG;
    expect(socialWeight + goalWeight + survivalWeight).toBeCloseTo(1, 10);
  });

  it('an agent built with no config runs exactly the default — the same decision as an explicit spread', async () => {
    const explicit = new CharacterAgent(hero, world, engine.getRAG(), { ...DEFAULT_AGENT_CONFIG });

    expect(await agent.decide()).toEqual(await explicit.decide());
  });

  it('the default survival weight is observable in the decision — a hurt character rests at exactly 5×survivalWeight/10 confidence', async () => {
    hero.status.health = 20;

    const decision = await agent.decide();

    expect(decision.actionId).toBe('rest');
    expect(decision.confidence).toBeCloseTo((5 * DEFAULT_AGENT_CONFIG.survivalWeight) / 10, 10);
  });

  it('one override changes one field — and the shared default is never mutated by a construction', async () => {
    hero.status.health = 20;
    hero.goals.push({
      id: 'g-1',
      description: 'find the healing spring',
      priority: 1,
      status: 'active',
      progress: 0,
      dependencies: [],
    });
    // default: rest scores 5×0.3 = 1.5, heal scores 4×0.3 + 0.5×1×0.4 = 1.4 — rest wins
    expect((await agent.decide()).actionId).toBe('rest');

    const greedy = new CharacterAgent(hero, world, engine.getRAG(), { goalWeight: 1 });
    // goalWeight 1 lifts heal to 1.7 — the ONE field named moved, and only it
    expect((await greedy.decide()).actionId).toBe('heal');

    expect(DEFAULT_AGENT_CONFIG.goalWeight).toBe(0.4);
    const after = new CharacterAgent(hero, world, engine.getRAG());
    expect((await after.decide()).actionId).toBe('rest');
  });
});