import type {
  Character,
  CharacterId,
  Location,
  WorldState,
  WorldEvent,
  Goal,
  CharacterAction,
  AgentDecision,
  CharacterAgentContext,
  CharacterAttributes,
  Relationship,
  InventoryItem,
  KnowledgeState,
  CharacterStatus,
} from './types.js';
import { worldId, characterId, locationId, factionId, loreId, eventId } from './types.js';
import { WorldRAG } from './rag.js';
import { RELATIONSHIP_FLOOR, gainStrength, deriveRelationType, isDerivableRelationType } from './relationships.js';

export interface CharacterAgentConfig {
  decisionThreshold: number;
  planningHorizon: number;
  riskTolerance: number;
  socialWeight: number;
  goalWeight: number;
  survivalWeight: number;
}

export const DEFAULT_AGENT_CONFIG: CharacterAgentConfig = {
  decisionThreshold: 0.6,
  planningHorizon: 3,
  riskTolerance: 0.5,
  socialWeight: 0.3,
  goalWeight: 0.4,
  survivalWeight: 0.3,
};

export class CharacterAgent {
  private character: Character;
  private world: WorldState;
  private rag: WorldRAG;
  private config: CharacterAgentConfig;
  private lastDecision: AgentDecision | null = null;
  private actionHistory: Array<{ actionId: string; timestamp: number; outcome: string }> = [];

  constructor(character: Character, world: WorldState, rag: WorldRAG, config: Partial<CharacterAgentConfig> = {}) {
    this.character = character;
    this.world = world;
    this.rag = rag;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
  }

  getCharacter(): Character {
    return this.character;
  }

  getContext(): CharacterAgentContext {
    // v162 — a character between places (locationId null) is still IN the world: it can rest, tend
    // its goals and be asked for a decision. The old code asserted a location that was never
    // guaranteed and crashed `decide()` for locationless characters — surfacing now that tickOnce
    // counts every consulted agent instead of swallowing the error in an interval.
    const location = this.character.locationId
      ? this.world.locations.get(this.character.locationId) ?? null
      : null;
    const nearbyCharacters = location ? this.getNearbyCharacters(location) : [];
    const recentEvents = this.getRecentEvents();
    const activeGoals = this.character.goals.filter(g => g.status === 'active');
    const availableActions = this.getAvailableActions(location);

    return {
      character: this.character,
      world: this.world,
      currentLocation: location,
      nearbyCharacters,
      recentEvents,
      activeGoals,
      availableActions,
    };
  }

  private getNearbyCharacters(location: Location): Character[] {
    return location.inhabitants
      .map(id => this.world.characters.get(id))
      .filter((c): c is Character => c !== undefined && c.id !== this.character.id);
  }

  private getRecentEvents(limit = 10): WorldEvent[] {
    return this.world.timeline
      .filter(e => e.participants.includes(this.character.id) || e.visibility === 'public')
      .slice(-limit)
      .reverse();
  }

  private getAvailableActions(location: Location | null): CharacterAction[] {
    const actions: CharacterAction[] = [];

    actions.push({
      id: 'rest',
      type: 'rest',
      name: 'Rest',
      description: 'Recover health and energy',
      duration: 3600,
      cooldown: 1800,
    });

    if (location) {
    for (const [targetId, conn] of location.connectedLocations) {
      actions.push({
        id: `move-${targetId}`,
        type: 'move',
        name: `Move to ${this.world.locations.get(targetId)?.name ?? targetId}`,
        description: `Travel via ${conn.type} (${conn.distance} units)`,
        duration: conn.distance * 60,
        costs: { energy: Math.ceil(conn.distance * 0.5) },
      });
    }

    // v162 — anyone CO-LOCATED can be spoken to, not only characters a world-builder registered as
    // `npcs`: the agent's own nearby-characters list is the inhabitants, and a simulation where Mira
    // cannot greet Toma because nobody declared him an NPC is not a simulation of meeting people.
    // The union is de-duplicated; a declared NPC who is also an inhabitant is one candidate, not two.
    const candidates = [...location.npcs, ...location.inhabitants];
    const spoken = new Set<string>();
    for (const otherId of candidates) {
      if (otherId === this.character.id || spoken.has(otherId)) continue;
      const npc = this.world.characters.get(otherId);
      if (!npc) continue;
      spoken.add(otherId);
      actions.push({
        id: `speak-${otherId}`,
        type: 'speak',
        name: `Talk to ${npc.name}`,
        description: `Engage in dialogue with ${npc.name}`,
        duration: 300,
      });
    }

    for (const item of location.items) {
      actions.push({
        id: `take-${item.id}`,
        type: 'interact',
        name: `Take ${item.name}`,
        description: `Pick up ${item.name}`,
        duration: 10,
        effects: [{ type: 'inventory-change', target: this.character.id, change: { itemId: item.id }, permanent: true }],
      });
    }

    }
    for (const goal of this.character.goals.filter(g => g.status === 'active')) {
      actions.push({
        id: `pursue-${goal.id}`,
        type: 'custom',
        name: `Pursue: ${goal.description}`,
        description: `Work towards goal: ${goal.description}`,
        duration: 1800,
      });
    }

    if (this.character.status.health < this.character.status.maxHealth * 0.5) {
      actions.push({
        id: 'heal',
        type: 'custom',
        name: 'Seek Healing',
        description: 'Find a way to restore health',
        duration: 600,
      });
    }

    return actions;
  }

  async decide(): Promise<AgentDecision> {
    const context = this.getContext();
    const scores = new Map<string, number>();

    for (const action of context.availableActions) {
      let score = 0;

      score += this.evaluateGoalAlignment(action, context.activeGoals);
      score += this.evaluateSurvival(action, context);
      score += this.evaluateSocial(action, context);
      score += this.evaluateRisk(action, context);
      score += this.evaluateKnowledge(action, context);

      scores.set(action.id, score);
    }

    const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
    const bestActionId = sorted[0]?.[0] ?? 'rest';
    const bestScore = sorted[0]?.[1] ?? 0;
    const bestAction = context.availableActions.find(a => a.id === bestActionId)!;

    const alternatives = sorted.slice(1, 4).map(([id]) => id);

    const decision: AgentDecision = {
      actionId: bestActionId,
      reasoning: this.generateReasoning(bestAction, context, bestScore),
      confidence: Math.min(1, bestScore / 10),
      alternativeActions: alternatives,
      expectedOutcome: this.predictOutcome(bestAction, context),
    };

    this.lastDecision = decision;
    return decision;
  }

  private evaluateGoalAlignment(action: CharacterAction, goals: Goal[]): number {
    let score = 0;
    for (const goal of goals) {
      const actionRelevance = this.estimateActionRelevance(action, goal);
      score += actionRelevance * goal.priority * this.config.goalWeight;
    }
    return score;
  }

  private estimateActionRelevance(action: CharacterAction, goal: Goal): number {
    const keywords = goal.description.toLowerCase().split(/\s+/);
    const actionText = `${action.name} ${action.description}`.toLowerCase();
    let matches = 0;
    for (const kw of keywords) {
      if (kw.length > 3 && actionText.includes(kw)) matches++;
    }
    return Math.min(1, matches / Math.max(1, keywords.length));
  }

  private evaluateSurvival(action: CharacterAction, context: CharacterAgentContext): number {
    const healthRatio = context.character.status.health / context.character.status.maxHealth;
    const energyRatio = context.character.status.energy / context.character.status.maxEnergy;

    if (action.type === 'rest' && (healthRatio < 0.8 || energyRatio < 0.5)) return 5 * this.config.survivalWeight;
    if (action.type === 'move' && energyRatio < 0.3) return -3 * this.config.survivalWeight;
    if (action.type === 'combat' && healthRatio < 0.4) return -5 * this.config.survivalWeight;
    if (action.id === 'heal' && healthRatio < 0.5) return 4 * this.config.survivalWeight;

    return 0;
  }

  private evaluateSocial(action: CharacterAction, context: CharacterAgentContext): number {
    if (action.type === 'speak') {
      const targetId = action.id.replace('speak-', '');
      const target = context.nearbyCharacters.find(c => c.id === targetId);
      if (target) {
        const rel = context.character.relationships.get(characterId(targetId));
        if (rel) {
          if (rel.type === 'ally' || rel.type === 'friend') return 2 * this.config.socialWeight;
          if (rel.type === 'enemy' || rel.type === 'rival') return -1 * this.config.socialWeight;
        }
        return 1 * this.config.socialWeight;
      }
    }
    return 0;
  }

  private evaluateRisk(action: CharacterAction, context: CharacterAgentContext): number {
    if (action.type === 'move') {
      const targetId = action.id.replace('move-', '');
      const conn = context.currentLocation?.connectedLocations.get(locationId(targetId));
      if (conn && conn.difficulty > 5) return -2 * this.config.riskTolerance;
    }
    if (action.type === 'combat') return -3 * this.config.riskTolerance;
    return 0;
  }

  private evaluateKnowledge(action: CharacterAction, context: CharacterAgentContext): number {
    const actionText = `${action.name} ${action.description}`.toLowerCase();
    const knownFacts = Array.from(context.character.knowledge.knownFacts).join(' ').toLowerCase();
    let score = 0;
    for (const word of actionText.split(/\s+/)) {
      if (word.length > 4 && knownFacts.includes(word)) score += 0.5;
    }
    return Math.min(3, score);
  }

  private generateReasoning(action: CharacterAction, context: CharacterAgentContext, score: number): string {
    const reasons: string[] = [];

    if (action.type === 'rest') {
      reasons.push(`Health at ${Math.round(context.character.status.health / context.character.status.maxHealth * 100)}%, energy at ${Math.round(context.character.status.energy / context.character.status.maxEnergy * 100)}%`);
    }

    const topGoals = context.activeGoals.slice(0, 2);
    if (topGoals.length > 0) {
      reasons.push(`Prioritizing goals: ${topGoals.map(g => g.description).join(', ')}`);
    }

    if (context.nearbyCharacters.length > 0) {
      reasons.push(`${context.nearbyCharacters.length} characters nearby`);
    }

    return reasons.join('; ') || `Evaluated action ${action.name} with score ${score.toFixed(2)}`;
  }

  private predictOutcome(action: CharacterAction, context: CharacterAgentContext): string {
    switch (action.type) {
      case 'rest': return 'Recover health and energy';
      case 'move': return `Travel to new location`;
      case 'speak': return `Social interaction, potential relationship change`;
      case 'interact': return `Environment interaction, possible item acquisition`;
      case 'combat': return `Combat engagement, risk of injury`;
      default: return `Execute ${action.name}`;
    }
  }

  async executeAction(actionId: string): Promise<{ success: boolean; outcome: string; events: WorldEvent[] }> {
    const context = this.getContext();
    const action = context.availableActions.find(a => a.id === actionId);
    if (!action) return { success: false, outcome: 'Action not available', events: [] };

    const events: WorldEvent[] = [];
    let outcome = '';

    switch (action.type) {
      case 'rest':
        this.character.status.health = Math.min(this.character.status.maxHealth, this.character.status.health + 10);
        this.character.status.energy = Math.min(this.character.status.maxEnergy, this.character.status.energy + 20);
        outcome = `Recovered to ${this.character.status.health} HP, ${this.character.status.energy} energy`;
        break;

      case 'move': {
        const targetId = actionId.replace('move-', '');
        const oldLocationId = this.character.locationId;
        this.character.locationId = locationId(targetId);
        const newLocation = this.world.locations.get(locationId(targetId))!;
        outcome = `Moved from ${this.world.locations.get(oldLocationId ?? locationId(''))?.name ?? 'unknown'} to ${newLocation.name}`;
        events.push({
          id: eventId(`evt-${Date.now()}`),
          timestamp: Date.now(),
          type: 'location-change',
          description: `${this.character.name} moved to ${newLocation.name}`,
          participants: [this.character.id],
          locationId: locationId(targetId),
          cause: 'character movement',
          effects: [{ type: 'location-change', target: this.character.id, change: { from: oldLocationId, to: targetId }, permanent: true }],
          visibility: 'public',
          metadata: {},
        });
        break;
      }

      case 'speak': {
        const targetId = actionId.replace('speak-', '');
        const target = this.world.characters.get(characterId(targetId))!;
        // v162 — a bond is TWO-sided: both characters gain (or first-meet) together, and each side's
        // type is derived from the number it now carries.
        const mine = this.upsertBond(this.character, target);
        const theirs = this.upsertBond(target, this.character);
        outcome = mine.created
          ? `Met ${target.name} for the first time`
          : `Spoke with ${target.name}, bond now ${mine.rel.strength}`;
        events.push({
          id: eventId(`evt-${Date.now()}`),
          timestamp: Date.now(),
          type: 'dialogue',
          description: `${this.character.name} spoke with ${target.name}`,
          participants: [this.character.id, target.id],
          locationId: this.character.locationId,
          cause: 'social interaction',
          effects: [
            { type: 'relationship-change', target: this.character.id, change: { with: targetId, strength: mine.rel.strength, created: mine.created }, permanent: true },
            { type: 'relationship-change', target: target.id, change: { with: this.character.id, strength: theirs.rel.strength, created: theirs.created }, permanent: true },
          ],
          visibility: 'participants',
          metadata: {},
        });
        break;
      }

      case 'interact': {
        const itemId = actionId.replace('take-', '');
        const location = this.world.locations.get(this.character.locationId ?? locationId(''))!;
        const itemIndex = location.items.findIndex(i => i.id === itemId);
        if (itemIndex >= 0) {
          const item = location.items.splice(itemIndex, 1)[0]!;
          this.character.inventory.push(item);
          outcome = `Picked up ${item.name}`;
        } else {
          outcome = 'Item not found';
        }
        break;
      }

      default:
        outcome = `Performed ${action.name}`;
    }

    this.actionHistory.push({ actionId, timestamp: Date.now(), outcome });
    if (this.actionHistory.length > 100) this.actionHistory.shift();

    return { success: true, outcome, events };
  }

  updateCharacter(character: Character): void {
    this.character = character;
  }

  updateWorld(world: WorldState): void {
    this.world = world;
  }

  getLastDecision(): AgentDecision | null {
    return this.lastDecision;
  }

  getActionHistory(): Array<{ actionId: string; timestamp: number; outcome: string }> {
    return [...this.actionHistory];
  }

  addKnowledge(fact: string): void {
    this.character.knowledge.knownFacts.add(fact);
  }

  addRelationship(targetId: CharacterId, relationship: Relationship): void {
    this.character.relationships.set(targetId, relationship);
  }

  /** v162 — find-or-create a bond on `from`'s side toward `to`, gaining one interaction's worth of
   *  strength when it already exists. Only the four derivable types are re-derived; a declared bond
   *  (`family`, `rival`, and friends) keeps its name and just carries the number. */
  private upsertBond(from: Character, to: Character): { rel: Relationship; created: boolean } {
    const existing = from.relationships.get(to.id);
    if (existing) {
      existing.strength = gainStrength(existing.strength);
      if (isDerivableRelationType(existing.type)) existing.type = deriveRelationType(existing.strength);
      return { rel: existing, created: false };
    }
    const rel: Relationship = {
      targetId: to.id,
      type: 'neutral',
      strength: RELATIONSHIP_FLOOR,
      description: 'First meeting',
      establishedAt: Date.now(),
    };
    from.relationships.set(to.id, rel);
    return { rel, created: true };
  }

  updateGoalProgress(goalId: string, progress: number): void {
    const goal = this.character.goals.find(g => g.id === goalId);
    if (goal) {
      goal.progress = Math.min(100, Math.max(0, progress));
      if (goal.progress >= 100) goal.status = 'completed';
    }
  }
}