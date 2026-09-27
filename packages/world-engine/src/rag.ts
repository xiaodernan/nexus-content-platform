import { hybridScore, embedTokens, tokenize } from '@nexus/agent-runtime';
import { cosine, EMBED_DIM } from '@nexus/ai-providers';
import type {
  WorldState,
  Character,
  Location,
  Faction,
  LoreEntry,
  WorldEvent,
  RAGQuery,
  RAGResult,
  RAGHit,
  CharacterId,
  LocationId,
  FactionId,
  LoreId,
  EventId,
} from './types.js';

export interface WorldRAGIndex {
  characters: Map<string, RAGDocument>;
  locations: Map<string, RAGDocument>;
  factions: Map<string, RAGDocument>;
  lore: Map<string, RAGDocument>;
  events: Map<string, RAGDocument>;
}

export interface RAGDocument {
  id: string;
  type: 'character' | 'location' | 'faction' | 'lore' | 'event';
  title: string;
  content: string;
  vector: number[];
  metadata: Record<string, unknown>;
  lastUpdated: number;
}

export class WorldRAG {
  private index: WorldRAGIndex = {
    characters: new Map(),
    locations: new Map(),
    factions: new Map(),
    lore: new Map(),
    events: new Map(),
  };
  private worldState: WorldState | null = null;

  setWorldState(world: WorldState): void {
    this.worldState = world;
    this.rebuildIndex();
  }

  rebuildIndex(): void {
    if (!this.worldState) return;

    this.index.characters.clear();
    this.index.locations.clear();
    this.index.factions.clear();
    this.index.lore.clear();
    this.index.events.clear();

    for (const [id, char] of this.worldState.characters) {
      this.index.characters.set(id, this.characterToDocument(id, char));
    }
    for (const [id, loc] of this.worldState.locations) {
      this.index.locations.set(id, this.locationToDocument(id, loc));
    }
    for (const [id, fac] of this.worldState.factions) {
      this.index.factions.set(id, this.factionToDocument(id, fac));
    }
    for (const [id, lore] of this.worldState.lore) {
      this.index.lore.set(id, this.loreToDocument(id, lore));
    }
    for (const event of this.worldState.timeline) {
      this.index.events.set(event.id, this.eventToDocument(event));
    }
  }

  private characterToDocument(id: CharacterId, char: Character): RAGDocument {
    const content = [
      `Name: ${char.name}`,
      `Description: ${char.description}`,
      `Archetype: ${char.archetype}`,
      `Location: ${char.locationId ?? 'unknown'}`,
      `Faction: ${char.factionId ?? 'none'}`,
      `Goals: ${char.goals.filter(g => g.status === 'active').map(g => g.description).join(', ')}`,
      `Relationships: ${Array.from(char.relationships.entries()).map(([k, v]) => `${k}: ${v.type} (${v.strength})`).join('; ')}`,
    ].join('\n');

    return {
      id,
      type: 'character',
      title: char.name,
      content,
      vector: embedTokens(content),
      metadata: { archetype: char.archetype, locationId: char.locationId, factionId: char.factionId },
      lastUpdated: char.updatedAt,
    };
  }

  private locationToDocument(id: LocationId, loc: Location): RAGDocument {
    const content = [
      `Name: ${loc.name}`,
      `Description: ${loc.description}`,
      `Type: ${loc.type}`,
      `Parent: ${loc.parentId ?? 'none'}`,
      `Connected: ${Array.from(loc.connectedLocations.keys()).join(', ')}`,
      `Inhabitants: ${loc.inhabitants.join(', ')}`,
      `Tags: ${loc.tags.join(', ')}`,
    ].join('\n');

    return {
      id,
      type: 'location',
      title: loc.name,
      content,
      vector: embedTokens(content),
      metadata: { type: loc.type, parentId: loc.parentId, tags: loc.tags },
      lastUpdated: Date.now(),
    };
  }

  private factionToDocument(id: FactionId, fac: Faction): RAGDocument {
    const content = [
      `Name: ${fac.name}`,
      `Description: ${fac.description}`,
      `Type: ${fac.type}`,
      `Leader: ${fac.leaderId ?? 'none'}`,
      `Members: ${fac.members.join(', ')}`,
      `Territories: ${fac.territories.join(', ')}`,
      `Allies: ${fac.allies.join(', ')}`,
      `Enemies: ${fac.enemies.join(', ')}`,
      `Ideology: ${fac.ideology}`,
      `Goals: ${fac.goals.filter(g => g.status === 'active').map(g => g.description).join(', ')}`,
    ].join('\n');

    return {
      id,
      type: 'faction',
      title: fac.name,
      content,
      vector: embedTokens(content),
      metadata: { type: fac.type, leaderId: fac.leaderId, ideology: fac.ideology },
      lastUpdated: fac.updatedAt,
    };
  }

  private loreToDocument(id: LoreId, lore: LoreEntry): RAGDocument {
    const content = [
      `Title: ${lore.title}`,
      `Content: ${lore.content}`,
      `Category: ${lore.category}`,
      `Tags: ${lore.tags.join(', ')}`,
      `Related Lore: ${lore.relatedLore.join(', ')}`,
      `Related Characters: ${lore.relatedCharacters.join(', ')}`,
      `Related Locations: ${lore.relatedLocations.join(', ')}`,
      `Related Factions: ${lore.relatedFactions.join(', ')}`,
      `Source: ${lore.source}`,
      `Visibility: ${lore.visibility}`,
    ].join('\n');

    return {
      id,
      type: 'lore',
      title: lore.title,
      content,
      vector: embedTokens(content),
      metadata: { category: lore.category, tags: lore.tags, visibility: lore.visibility },
      lastUpdated: lore.updatedAt,
    };
  }

  private eventToDocument(event: WorldEvent): RAGDocument {
    const content = [
      `Type: ${event.type}`,
      `Description: ${event.description}`,
      `Participants: ${event.participants.join(', ')}`,
      `Location: ${event.locationId ?? 'none'}`,
      `Cause: ${event.cause}`,
      `Effects: ${event.effects.map(e => `${e.type} on ${e.target}`).join('; ')}`,
      `Visibility: ${event.visibility}`,
    ].join('\n');

    return {
      id: event.id,
      type: 'event',
      title: `${event.type}: ${event.description.slice(0, 50)}`,
      content,
      vector: embedTokens(content),
      metadata: { eventType: event.type, participants: event.participants, locationId: event.locationId, timestamp: event.timestamp },
      lastUpdated: event.timestamp,
    };
  }

  query(query: RAGQuery): RAGResult {
    const startTime = Date.now();
    const qVector = embedTokens(query.query);
    const qTokens = new Set(tokenize(query.query));

    const allDocs: RAGDocument[] = [];
    const scope = query.scope ?? 'all';

    if (scope === 'all' || scope === 'characters') allDocs.push(...this.index.characters.values());
    if (scope === 'all' || scope === 'locations') allDocs.push(...this.index.locations.values());
    if (scope === 'all' || scope === 'factions') allDocs.push(...this.index.factions.values());
    if (scope === 'all' || scope === 'lore') allDocs.push(...this.index.lore.values());
    if (scope === 'all' || scope === 'events') allDocs.push(...this.index.events.values());

    const hits: RAGHit[] = [];
    for (const doc of allDocs) {
      if (query.filters) {
        let matches = true;
        for (const [key, value] of Object.entries(query.filters)) {
          if (doc.metadata[key] !== value) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
      }

      const score = hybridScore(query.query, doc.content);
      if (score >= (query.ragScoreThreshold ?? 0)) {
        hits.push({
          id: doc.id,
          type: doc.type,
          title: doc.title,
          content: doc.content,
          score,
          metadata: doc.metadata,
          source: doc.type,
        });
      }
    }

    hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const limited = hits.slice(0, query.limit ?? 10);

    let context = '';
    if (query.includeContext && limited.length > 0) {
      context = limited.map(h => `[${h.type.toUpperCase()}] ${h.title}: ${h.content}`).join('\n\n');
    }

    return {
      query: query.query,
      results: limited,
      context,
      totalHits: hits.length,
      searchTime: Date.now() - startTime,
    };
  }

  getDocument(type: 'character' | 'location' | 'faction' | 'lore' | 'event', id: string): RAGDocument | undefined {
    switch (type) {
      case 'character': return this.index.characters.get(id);
      case 'location': return this.index.locations.get(id);
      case 'faction': return this.index.factions.get(id);
      case 'lore': return this.index.lore.get(id);
      case 'event': return this.index.events.get(id);
    }
  }

  updateDocument(type: 'character' | 'location' | 'faction' | 'lore' | 'event', id: string, doc: RAGDocument): void {
    switch (type) {
      case 'character': this.index.characters.set(id, doc); break;
      case 'location': this.index.locations.set(id, doc); break;
      case 'faction': this.index.factions.set(id, doc); break;
      case 'lore': this.index.lore.set(id, doc); break;
      case 'event': this.index.events.set(id, doc); break;
    }
  }

  removeDocument(type: 'character' | 'location' | 'faction' | 'lore' | 'event', id: string): void {
    switch (type) {
      case 'character': this.index.characters.delete(id); break;
      case 'location': this.index.locations.delete(id); break;
      case 'faction': this.index.factions.delete(id); break;
      case 'lore': this.index.lore.delete(id); break;
      case 'event': this.index.events.delete(id); break;
    }
  }

  getStats(): { characters: number; locations: number; factions: number; lore: number; events: number } {
    return {
      characters: this.index.characters.size,
      locations: this.index.locations.size,
      factions: this.index.factions.size,
      lore: this.index.lore.size,
      events: this.index.events.size,
    };
  }
}