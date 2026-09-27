import type {
  WorldState,
  WorldId,
  Character,
  CharacterId,
  Location,
  LocationId,
  Faction,
  FactionId,
  LoreEntry,
  LoreId,
  WorldEvent,
  EventId,
  CharacterAttributes,
  CharacterStatus,
  InventoryItem,
  Goal,
  KnowledgeState,
  Relationship,
  WorldEngineConfig,
  RAGQuery,
  RAGResult,
  AgentDecision,
} from './types.js';
import { WorldRAG } from './rag.js';
import { CharacterAgent, type CharacterAgentConfig } from './characterAgent.js';
import { worldId, characterId, locationId, factionId, loreId, eventId } from './types.js';

export interface WorldEngineEvents {
  onEvent?: (event: WorldEvent) => void;
  onCharacterUpdate?: (character: Character) => void;
  onLocationUpdate?: (location: Location) => void;
  onFactionUpdate?: (faction: Faction) => void;
  onLoreUpdate?: (lore: LoreEntry) => void;
  onAgentDecision?: (characterId: CharacterId, decision: AgentDecision) => void;
  onAgentAction?: (characterId: CharacterId, actionId: string, outcome: string) => void;
}

export class WorldEngine {
  private world: WorldState;
  private rag: WorldRAG;
  private agents: Map<CharacterId, CharacterAgent> = new Map();
  private config: WorldEngineConfig;
  private eventCallbacks: WorldEngineEvents = {};
  private tickInterval: NodeJS.Timeout | null = null;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private currentTick = 0;

  constructor(config: Partial<WorldEngineConfig> = {}) {
    this.config = {
      ragEnabled: true,
      ragTopK: 10,
      ragScoreThreshold: 0.1,
      agentTickInterval: 5000,
      maxConcurrentAgents: 50,
      eventRetentionDays: 30,
      autoSaveInterval: 60000,
      ...config,
    };

    this.world = this.createEmptyWorld();
    this.rag = new WorldRAG();
    this.rag.setWorldState(this.world);
  }

  private createEmptyWorld(): WorldState {
    return {
      id: worldId('world-1'),
      name: 'New World',
      description: 'A procedurally generated world',
      genre: 'fantasy',
      timeline: [],
      characters: new Map(),
      locations: new Map(),
      factions: new Map(),
      lore: new Map(),
      currentTime: Date.now(),
      metadata: {},
    };
  }

  setEventCallbacks(callbacks: WorldEngineEvents): void {
    this.eventCallbacks = { ...this.eventCallbacks, ...callbacks };
  }

  getWorld(): WorldState {
    return this.world;
  }

  getRAG(): WorldRAG {
    return this.rag;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.tickInterval = setInterval(() => this.tick(), this.config.agentTickInterval);

    if (this.config.autoSaveInterval > 0) {
      this.autoSaveInterval = setInterval(() => this.save(), this.config.autoSaveInterval);
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  private tick(): void {
    this.currentTick++;
    this.world.currentTime = Date.now();

    const agentEntries = Array.from(this.agents.entries());
    const activeAgents = agentEntries.slice(0, this.config.maxConcurrentAgents);

    for (const [characterId, agent] of activeAgents) {
      try {
        this.processAgent(characterId, agent);
      } catch (error) {
        console.error(`Agent error for ${characterId}:`, error);
      }
    }

    this.cleanupOldEvents();
  }

  private async processAgent(characterId: CharacterId, agent: CharacterAgent): Promise<void> {
    const character = this.world.characters.get(characterId);
    if (!character) return;

    const decision = await agent.decide();
    if (this.eventCallbacks.onAgentDecision) {
      this.eventCallbacks.onAgentDecision(characterId, decision);
    }

    if (decision.confidence >= this.config.ragScoreThreshold) {
      const result = await agent.executeAction(decision.actionId);
      if (result.success) {
        for (const event of result.events) {
          this.addEvent(event);
        }
        if (this.eventCallbacks.onAgentAction) {
          this.eventCallbacks.onAgentAction(characterId, decision.actionId, result.outcome);
        }
      }
    }
  }

  private cleanupOldEvents(): void {
    const cutoffTime = Date.now() - this.config.eventRetentionDays * 24 * 60 * 60 * 1000;
    this.world.timeline = this.world.timeline.filter(e => e.timestamp > cutoffTime);
  }

  addEvent(event: WorldEvent): void {
    this.world.timeline.push(event);
    this.rag.updateDocument('event', event.id, this.rag['eventToDocument'](event));

    if (this.eventCallbacks.onEvent) {
      this.eventCallbacks.onEvent(event);
    }
  }

  createCharacter(
    name: string,
    description: string,
    archetype: string,
    locationId: LocationId | null = null,
    factionId: FactionId | null = null,
    attributes?: Partial<CharacterAttributes>
  ): Character {
    const id = characterId(`char-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const now = Date.now();

    const character: Character = {
      id,
      name,
      description,
      archetype,
      locationId,
      factionId,
      attributes: {
        strength: 10,
        intelligence: 10,
        charisma: 10,
        stealth: 10,
        perception: 10,
        willpower: 10,
        ...attributes,
      },
      relationships: new Map(),
      knowledge: {
        knownFacts: new Set(),
        knownLocations: new Set(),
        knownCharacters: new Set(),
        knownLore: new Set(),
        secrets: new Set(),
        rumors: new Map(),
      },
      goals: [],
      inventory: [],
      status: {
        health: 100,
        maxHealth: 100,
        energy: 100,
        maxEnergy: 100,
        conditions: [],
      },
      createdAt: now,
      updatedAt: now,
    };

    this.world.characters.set(id, character);

    if (locationId) {
      const location = this.world.locations.get(locationId);
      if (location) location.inhabitants.push(id);
    }

    if (factionId) {
      const faction = this.world.factions.get(factionId);
      if (faction) faction.members.push(id);
    }

    this.rag.updateDocument('character', id, this.rag['characterToDocument'](id, character));

    const agent = new CharacterAgent(character, this.world, this.rag);
    this.agents.set(id, agent);

    this.addEvent({
      id: eventId(`evt-${Date.now()}-${Math.random().toString(36).slice(2)}`),
      timestamp: Date.now(),
      type: 'world-state-change',
      description: `Character ${name} created`,
      participants: [id],
      locationId: locationId,
      cause: 'character creation',
      effects: [{ type: 'world-state-change', target: id, change: { action: 'create', type: 'character' }, permanent: true }],
      visibility: 'public',
      metadata: {},
    });

    if (this.eventCallbacks.onCharacterUpdate) {
      this.eventCallbacks.onCharacterUpdate(character);
    }

    return character;
  }

  createLocation(
    name: string,
    description: string,
    type: Location['type'],
    parentId: LocationId | null = null,
    tags: string[] = []
  ): Location {
    const id = locationId(`loc-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    const location: Location = {
      id,
      name,
      description,
      type,
      parentId,
      children: [],
      connectedLocations: new Map(),
      inhabitants: [],
      npcs: [],
      items: [],
      events: [],
      lore: [],
      tags,
      metadata: {},
    };

    this.world.locations.set(id, location);

    if (parentId) {
      const parent = this.world.locations.get(parentId);
      if (parent) parent.children.push(id);
    }

    this.rag.updateDocument('location', id, this.rag['locationToDocument'](id, location));

    this.addEvent({
      id: eventId(`evt-${Date.now()}-${Math.random().toString(36).slice(2)}`),
      timestamp: Date.now(),
      type: 'world-state-change',
      description: `Location ${name} created`,
      participants: [],
      locationId: id,
      cause: 'location creation',
      effects: [{ type: 'world-state-change', target: id, change: { action: 'create', type: 'location' }, permanent: true }],
      visibility: 'public',
      metadata: {},
    });

    if (this.eventCallbacks.onLocationUpdate) {
      this.eventCallbacks.onLocationUpdate(location);
    }

    return location;
  }

  connectLocations(fromId: LocationId, toId: LocationId, connection: Omit<import('./types.js').Connection, 'targetId'>): void {
    const from = this.world.locations.get(fromId);
    const to = this.world.locations.get(toId);
    if (!from || !to) return;

    from.connectedLocations.set(toId, { targetId: toId, ...connection });
    to.connectedLocations.set(fromId, { targetId: fromId, ...connection });

    this.rag.updateDocument('location', fromId, this.rag['locationToDocument'](fromId, from));
    this.rag.updateDocument('location', toId, this.rag['locationToDocument'](toId, to));
  }

  createFaction(
    name: string,
    description: string,
    type: Faction['type'],
    leaderId: CharacterId | null = null,
    ideology: string = ''
  ): Faction {
    const id = factionId(`fac-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const now = Date.now();

    const faction: Faction = {
      id,
      name,
      description,
      type,
      leaderId,
      members: [],
      territories: [],
      allies: [],
      enemies: [],
      resources: new Map(),
      reputation: new Map(),
      goals: [],
      ideology,
      createdAt: now,
      updatedAt: now,
    };

    if (leaderId) {
      const leader = this.world.characters.get(leaderId);
      if (leader) leader.factionId = id;
    }

    this.world.factions.set(id, faction);
    this.rag.updateDocument('faction', id, this.rag['factionToDocument'](id, faction));

    this.addEvent({
      id: eventId(`evt-${Date.now()}-${Math.random().toString(36).slice(2)}`),
      timestamp: Date.now(),
      type: 'world-state-change',
      description: `Faction ${name} created`,
      participants: leaderId ? [leaderId] : [],
      locationId: null,
      cause: 'faction creation',
      effects: [{ type: 'world-state-change', target: id, change: { action: 'create', type: 'faction' }, permanent: true }],
      visibility: 'public',
      metadata: {},
    });

    if (this.eventCallbacks.onFactionUpdate) {
      this.eventCallbacks.onFactionUpdate(faction);
    }

    return faction;
  }

  createLore(
    title: string,
    content: string,
    category: LoreEntry['category'],
    tags: string[] = [],
    visibility: LoreEntry['visibility'] = 'public'
  ): LoreEntry {
    const id = loreId(`lore-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const now = Date.now();

    const lore: LoreEntry = {
      id,
      title,
      content,
      category,
      tags,
      relatedLore: [],
      relatedCharacters: [],
      relatedLocations: [],
      relatedFactions: [],
      source: 'canon',
      visibility,
      createdAt: now,
      updatedAt: now,
    };

    this.world.lore.set(id, lore);
    this.rag.updateDocument('lore', id, this.rag['loreToDocument'](id, lore));

    this.addEvent({
      id: eventId(`evt-${Date.now()}-${Math.random().toString(36).slice(2)}`),
      timestamp: Date.now(),
      type: 'world-state-change',
      description: `Lore "${title}" created`,
      participants: [],
      locationId: null,
      cause: 'lore creation',
      effects: [{ type: 'world-state-change', target: id, change: { action: 'create', type: 'lore' }, permanent: true }],
      visibility: 'public',
      metadata: {},
    });

    if (this.eventCallbacks.onLoreUpdate) {
      this.eventCallbacks.onLoreUpdate(lore);
    }

    return lore;
  }

  addCharacterToLocation(characterId: CharacterId, locationId: LocationId): boolean {
    const character = this.world.characters.get(characterId);
    const location = this.world.locations.get(locationId);
    if (!character || !location) return false;

    if (character.locationId) {
      const oldLoc = this.world.locations.get(character.locationId);
      if (oldLoc) {
        oldLoc.inhabitants = oldLoc.inhabitants.filter(id => id !== characterId);
        this.rag.updateDocument('location', oldLoc.id, this.rag['locationToDocument'](oldLoc.id, oldLoc));
      }
    }

    character.locationId = locationId;
    location.inhabitants.push(characterId);
    character.updatedAt = Date.now();

    this.rag.updateDocument('character', characterId, this.rag['characterToDocument'](characterId, character));
    this.rag.updateDocument('location', locationId, this.rag['locationToDocument'](locationId, location));

    return true;
  }

  queryRAG(query: RAGQuery): RAGResult {
    return this.rag.query({
      ...query,
      worldId: this.world.id,
      ragScoreThreshold: this.config.ragScoreThreshold,
      limit: this.config.ragTopK,
    });
  }

  getAgent(characterId: CharacterId): CharacterAgent | undefined {
    return this.agents.get(characterId);
  }

  getAllAgents(): CharacterAgent[] {
    return Array.from(this.agents.values());
  }

  updateAgentConfig(characterId: CharacterId, config: Partial<CharacterAgentConfig>): void {
    const agent = this.agents.get(characterId);
    if (agent) {
      // Would need to expose config update in CharacterAgent
    }
  }

  save(): string {
    const serializable = {
      world: {
        ...this.world,
        characters: Array.from(this.world.characters.entries()).map(([id, char]) => [
          id,
          { ...char, relationships: Array.from(char.relationships.entries()) },
        ]),
        locations: Array.from(this.world.locations.entries()).map(([id, loc]) => [
          id,
          { ...loc, connectedLocations: Array.from(loc.connectedLocations.entries()) },
        ]),
        factions: Array.from(this.world.factions.entries()).map(([id, fac]) => [
          id,
          { ...fac, resources: Array.from(fac.resources.entries()), reputation: Array.from(fac.reputation.entries()) },
        ]),
        lore: Array.from(this.world.lore.entries()),
        timeline: this.world.timeline,
      },
      config: this.config,
      currentTick: this.currentTick,
    };
    return JSON.stringify(serializable, null, 2);
  }

  load(json: string): void {
    const data = JSON.parse(json);
    this.world = {
      ...data.world,
      characters: new Map(
        data.world.characters.map(([id, char]: [string, any]) => [
          id,
          { ...char, relationships: new Map(char.relationships) },
        ])
      ),
      locations: new Map(
        data.world.locations.map(([id, loc]: [string, any]) => [
          id,
          { ...loc, connectedLocations: new Map(loc.connectedLocations) },
        ])
      ),
      factions: new Map(
        data.world.factions.map(([id, fac]: [string, any]) => [
          id,
          { ...fac, resources: new Map(fac.resources), reputation: new Map(fac.reputation) },
        ])
      ),
      lore: new Map(data.world.lore),
      timeline: data.world.timeline,
    };
    this.config = { ...this.config, ...data.config };
    this.currentTick = data.currentTick ?? 0;

    this.rag.setWorldState(this.world);

    this.agents.clear();
    for (const [id, character] of this.world.characters) {
      this.agents.set(id, new CharacterAgent(character, this.world, this.rag));
    }
  }

  getStats(): {
    characters: number;
    locations: number;
    factions: number;
    lore: number;
    events: number;
    agents: number;
    ticks: number;
  } {
    return {
      characters: this.world.characters.size,
      locations: this.world.locations.size,
      factions: this.world.factions.size,
      lore: this.world.lore.size,
      events: this.world.timeline.length,
      agents: this.agents.size,
      ticks: this.currentTick,
    };
  }
}