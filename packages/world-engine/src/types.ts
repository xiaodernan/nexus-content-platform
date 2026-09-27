export type WorldId = string & { readonly __brand: unique symbol };
export type CharacterId = string & { readonly __brand: unique symbol };
export type LocationId = string & { readonly __brand: unique symbol };
export type FactionId = string & { readonly __brand: unique symbol };
export type EventId = string & { readonly __brand: unique symbol };
export type LoreId = string & { readonly __brand: unique symbol };

export function worldId(id: string): WorldId { return id as WorldId; }
export function characterId(id: string): CharacterId { return id as CharacterId; }
export function locationId(id: string): LocationId { return id as LocationId; }
export function factionId(id: string): FactionId { return id as FactionId; }
export function eventId(id: string): EventId { return id as EventId; }
export function loreId(id: string): LoreId { return id as LoreId; }

export interface WorldState {
  id: WorldId;
  name: string;
  description: string;
  genre: string;
  timeline: WorldEvent[];
  characters: Map<CharacterId, Character>;
  locations: Map<LocationId, Location>;
  factions: Map<FactionId, Faction>;
  lore: Map<LoreId, LoreEntry>;
  currentTime: number;
  metadata: Record<string, unknown>;
}

export interface Character {
  id: CharacterId;
  name: string;
  description: string;
  archetype: string;
  locationId: LocationId | null;
  factionId: FactionId | null;
  attributes: CharacterAttributes;
  relationships: Map<CharacterId, Relationship>;
  knowledge: KnowledgeState;
  goals: Goal[];
  inventory: InventoryItem[];
  status: CharacterStatus;
  createdAt: number;
  updatedAt: number;
}

export interface CharacterAttributes {
  strength: number;
  intelligence: number;
  charisma: number;
  stealth: number;
  perception: number;
  willpower: number;
}

export interface Relationship {
  targetId: CharacterId;
  type: 'ally' | 'enemy' | 'neutral' | 'family' | 'romantic' | 'rival' | 'mentor' | 'servant' | 'friend';
  strength: number;
  description: string;
  establishedAt: number;
}

export interface KnowledgeState {
  knownFacts: Set<string>;
  knownLocations: Set<LocationId>;
  knownCharacters: Set<CharacterId>;
  knownLore: Set<LoreId>;
  secrets: Set<string>;
  rumors: Map<string, number>;
}

export interface Goal {
  id: string;
  description: string;
  priority: number;
  status: 'active' | 'completed' | 'failed' | 'abandoned';
  progress: number;
  dependencies: string[];
}

export interface InventoryItem {
  id: string;
  name: string;
  type: 'weapon' | 'armor' | 'consumable' | 'tool' | 'key' | 'currency' | 'lore' | 'other';
  description: string;
  value: number;
  properties: Record<string, unknown>;
}

export interface CharacterStatus {
  health: number;
  maxHealth: number;
  energy: number;
  maxEnergy: number;
  conditions: StatusCondition[];
}

export interface StatusCondition {
  id: string;
  name: string;
  description: string;
  duration: number;
  effects: Record<string, number>;
}

export interface Location {
  id: LocationId;
  name: string;
  description: string;
  type: 'city' | 'town' | 'village' | 'dungeon' | 'wilderness' | 'landmark' | 'building' | 'room' | 'other';
  parentId: LocationId | null;
  children: LocationId[];
  connectedLocations: Map<LocationId, Connection>;
  inhabitants: CharacterId[];
  npcs: CharacterId[];
  items: InventoryItem[];
  events: EventId[];
  lore: LoreId[];
  tags: string[];
  coordinates?: { x: number; y: number; z?: number };
  metadata: Record<string, unknown>;
}

export interface Connection {
  targetId: LocationId;
  type: 'road' | 'path' | 'portal' | 'door' | 'passage' | 'teleport' | 'other';
  distance: number;
  difficulty: number;
  description: string;
  requirements?: string[];
}

export interface Faction {
  id: FactionId;
  name: string;
  description: string;
  type: 'nation' | 'guild' | 'cult' | 'family' | 'organization' | 'race' | 'other';
  leaderId: CharacterId | null;
  members: CharacterId[];
  territories: LocationId[];
  allies: FactionId[];
  enemies: FactionId[];
  resources: Map<string, number>;
  reputation: Map<FactionId, number>;
  goals: Goal[];
  ideology: string;
  createdAt: number;
  updatedAt: number;
}

export interface LoreEntry {
  id: LoreId;
  title: string;
  content: string;
  category: 'history' | 'myth' | 'geography' | 'magic' | 'technology' | 'culture' | 'person' | 'event' | 'artifact' | 'other';
  tags: string[];
  relatedLore: LoreId[];
  relatedCharacters: CharacterId[];
  relatedLocations: LocationId[];
  relatedFactions: FactionId[];
  source: 'canon' | 'discovered' | 'rumor' | 'player-created';
  visibility: 'public' | 'hidden' | 'secret' | 'forbidden';
  createdAt: number;
  updatedAt: number;
}

export interface WorldEvent {
  id: EventId;
  timestamp: number;
  type: 'character-action' | 'combat' | 'dialogue' | 'discovery' | 'faction-change' | 'location-change' | 'lore-revealed' | 'quest-start' | 'quest-complete' | 'quest-fail' | 'world-state-change' | 'other';
  description: string;
  participants: CharacterId[];
  locationId: LocationId | null;
  cause: string;
  effects: WorldEventEffect[];
  visibility: 'public' | 'witnesses' | 'participants' | 'secret';
  metadata: Record<string, unknown>;
}

export interface WorldEventEffect {
  type: 'attribute-change' | 'relationship-change' | 'location-change' | 'faction-change' | 'knowledge-change' | 'inventory-change' | 'status-change' | 'world-state-change';
  target: string;
  change: Record<string, unknown>;
  permanent: boolean;
}

export interface RAGQuery {
  query: string;
  worldId: WorldId;
  scope?: 'characters' | 'locations' | 'factions' | 'lore' | 'events' | 'all';
  limit?: number;
  filters?: Record<string, unknown>;
  includeContext?: boolean;
  ragScoreThreshold?: number;
}

export interface RAGResult {
  query: string;
  results: RAGHit[];
  context?: string;
  totalHits: number;
  searchTime: number;
}

export interface RAGHit {
  id: string;
  type: 'character' | 'location' | 'faction' | 'lore' | 'event';
  title: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
  source: string;
}

export interface CharacterAgentContext {
  character: Character;
  world: WorldState;
  currentLocation: Location;
  nearbyCharacters: Character[];
  recentEvents: WorldEvent[];
  activeGoals: Goal[];
  availableActions: CharacterAction[];
}

export interface CharacterAction {
  id: string;
  type: 'move' | 'interact' | 'speak' | 'investigate' | 'combat' | 'craft' | 'trade' | 'rest' | 'learn' | 'custom';
  name: string;
  description: string;
  requirements?: string[];
  costs?: Record<string, number>;
  effects?: WorldEventEffect[];
  duration: number;
  cooldown?: number;
}

export interface AgentDecision {
  actionId: string;
  reasoning: string;
  confidence: number;
  alternativeActions: string[];
  expectedOutcome: string;
}

export interface WorldEngineConfig {
  ragEnabled: boolean;
  ragTopK: number;
  ragScoreThreshold: number;
  agentTickInterval: number;
  maxConcurrentAgents: number;
  eventRetentionDays: number;
  autoSaveInterval: number;
}