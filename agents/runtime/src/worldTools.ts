import type { ToolImpl, ToolRegistry } from './registry.js';
import type { ToolSpec } from './types.js';

/**
 * M4 v144 — the FIRST consumer of `@nexus/world-engine`.
 *
 * The package has 31 green tests and, until this file, **no consumer at all**: `grep -rl
 * '@nexus/world-engine'` across `apps/ agents/ packages/` matched only the package's own
 * `package.json`. That is the same shape the 3D lane was in before v140, and the same bound its records
 * kept writing — *"a package with tests, not a capability anything can reach."*
 *
 * **A driver seam, not an import.** This module does NOT depend on `@nexus/world-engine`. It declares the
 * narrow `WorldDriver` it needs and the HOST supplies the implementation — the shape `browserTools` uses
 * for `BrowserDriver` and `sceneTools` uses for `SceneDriver`. So the agent lane holds the capability
 * without holding the world model, the two stay separable, and the family is testable with no world
 * package loaded. `docs/evidence/agents/world-tools-proof.mjs` wires the REAL `WorldEngine` behind it, so
 * the seam is proven against the package it was written for rather than against a second fake.
 *
 * **The §28 gate is the registry's.** The bodies below do not gate themselves: `ToolRegistry.invoke`
 * validates args, asks the checkpoint for every dangerous permission, and turns a thrown error into
 * `ok:false`. A second gate here could disagree with the first — the defect `browserTools` records.
 *
 * **One door is deliberately NOT read-class.** `world.character.decide` asks a character what it would do,
 * and the package's `CharacterAgent.decide()` **stores the answer on the agent** (`this.lastDecision =
 * decision`). Calling that a read would be claiming a mutation did not happen, so it is write-class and
 * says so — the same reason `scene.inspect` is allowed to be read and this is not.
 */

/** The world's counts, exactly the seven the package's own `getStats()` answers. */
export interface WorldStats {
  characters: number;
  locations: number;
  factions: number;
  lore: number;
  events: number;
  agents: number;
  ticks: number;
}

/** The world as a plain, JSON-safe summary. Names are included so a caller can address what it made, and
 *  ids beside them so a door can check a reference it was handed rather than trusting it. */
export interface WorldSummary {
  id: string;
  name: string;
  genre: string;
  description: string;
  stats: WorldStats;
  characterNames: string[];
  locationNames: string[];
  /** The ids a caller may reference — the same set `locationNames` describes, in the same order. */
  locationIds: string[];
  characterIds: string[];
  loreTitles: string[];
}

/** One retrieval hit, flattened to what a tool result should carry. */
export interface WorldHit {
  id: string;
  type: string;
  title: string;
  score: number;
}

export interface WorldQueryResult {
  query: string;
  totalHits: number;
  hits: WorldHit[];
}

/** A character's answer, flattened from the package's `AgentDecision`. */
export interface WorldDecision {
  characterId: string;
  actionId: string;
  reasoning: string;
  confidence: number;
  alternativeActions: string[];
  expectedOutcome: string;
}

export interface WorldLocationSpec {
  name: string;
  description: string;
  type: string;
}

export interface WorldCharacterSpec {
  name: string;
  description: string;
  archetype: string;
  locationId?: string;
}

export interface WorldLoreSpec {
  title: string;
  content: string;
  category: string;
}

/**
 * The slice of a world model an agent is allowed to reach.
 *
 * Methods may answer directly or with a promise (the `TreeReaper` precedent), so a driver that has to
 * await a real store is not forced into a fake synchronous shape.
 */
export interface WorldDriver {
  /** Which implementation is answering, so a result never has to guess. */
  readonly engine: string;
  summarize(): WorldSummary | Promise<WorldSummary>;
  addLocation(spec: WorldLocationSpec): string | Promise<string>;
  addCharacter(spec: WorldCharacterSpec): string | Promise<string>;
  addLore(spec: WorldLoreSpec): string | Promise<string>;
  query(text: string, limit: number): WorldQueryResult | Promise<WorldQueryResult>;
  /** `undefined` when the world holds no agent for that character — a different answer from a refusal. */
  decide(characterId: string): WorldDecision | undefined | Promise<WorldDecision | undefined>;
}

export const WORLD_LOCATION_TYPES: readonly string[] = [
  'city', 'town', 'village', 'dungeon', 'wilderness', 'landmark', 'building', 'room', 'other',
];

export const WORLD_LORE_CATEGORIES: readonly string[] = [
  'history', 'myth', 'geography', 'magic', 'technology', 'culture', 'person', 'event', 'artifact', 'other',
];

/** A function DECLARATION with an explicit `never` return, so TypeScript narrows control flow after it. */
function refused(message: string): never {
  throw new Error(message);
}

function requireString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value === '') {
    refused(`${what} must be a non-empty string, got ${JSON.stringify(value)}`);
  }
  return value;
}

/** A declared word is checked against the list it came from, so an unknown one is refused rather than
 *  stored as a word nothing can read. */
function requireDeclared(value: unknown, allowed: readonly string[], what: string): string {
  const word = requireString(value, what);
  if (!allowed.includes(word)) {
    refused(`${what} is "${word}"; the declared values are ${allowed.join(', ')}`);
  }
  return word;
}

export const WORLD_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'world.inspect',
    description: 'Read the world’s structure — its name, genre and counts, and the names of what it holds. Read-class: no checkpoint is asked.',
    permissions: ['read'],
    args: [],
  },
  {
    name: 'world.query',
    description: 'Retrieve from the world’s own lore/characters/locations by text. Read-class: no checkpoint is asked.',
    permissions: ['read'],
    args: [
      { name: 'text', type: 'string', required: true },
      { name: 'limit', type: 'number', required: false },
    ],
  },
  {
    name: 'world.location.add',
    description: 'Add a location to the world. The type must be one of the declared ones.',
    permissions: ['write'],
    args: [
      { name: 'name', type: 'string', required: true },
      { name: 'description', type: 'string', required: true },
      { name: 'type', type: 'string', required: true },
    ],
  },
  {
    name: 'world.character.add',
    description: 'Add a character to the world, optionally placed in a location that already exists.',
    permissions: ['write'],
    args: [
      { name: 'name', type: 'string', required: true },
      { name: 'description', type: 'string', required: true },
      { name: 'archetype', type: 'string', required: true },
      { name: 'locationId', type: 'string', required: false },
    ],
  },
  {
    name: 'world.lore.add',
    description: 'Add a lore entry. The category must be one of the declared ones.',
    permissions: ['write'],
    args: [
      { name: 'title', type: 'string', required: true },
      { name: 'content', type: 'string', required: true },
      { name: 'category', type: 'string', required: true },
    ],
  },
  {
    name: 'world.character.decide',
    description: 'Ask what a character would do. WRITE-class, because the package records the decision on the agent — a door that called this a read would be claiming a mutation did not happen.',
    permissions: ['write'],
    args: [{ name: 'characterId', type: 'string', required: true }],
  },
];

/**
 * Register the `world.*` family over `driver`.
 *
 * The family owns three rules and refuses to own any others: it names a missing or malformed argument, it
 * refuses a declared word outside its list, and it refuses to place a character in a location the world
 * does not hold — checked BEFORE the add, so a typo in an id is refused here rather than silently
 * creating a character that belongs nowhere.
 */
export function registerWorldTools(registry: ToolRegistry, driver: WorldDriver): ToolRegistry {
  const summarize = async (): Promise<WorldSummary> => driver.summarize();

  const impls: Record<string, ToolImpl> = {
    'world.inspect': async () => {
      const summary = await summarize();
      return { engine: driver.engine, ...summary };
    },

    'world.query': async (args) => {
      const text = requireString(args.text, 'world.query text');
      const rawLimit = args.limit;
      let limit = 10; // the package's own `ragTopK` default, used when the caller names none
      if (rawLimit !== undefined) {
        if (typeof rawLimit !== 'number' || !Number.isFinite(rawLimit) || rawLimit <= 0) {
          refused(`world.query limit is ${JSON.stringify(rawLimit)}; a limit is a finite positive number`);
        }
        limit = Math.floor(rawLimit);
      }
      const result = await driver.query(text, limit);
      return { engine: driver.engine, ...result };
    },

    'world.location.add': async (args) => {
      const name = requireString(args.name, 'world.location.add name');
      const description = requireString(args.description, 'world.location.add description');
      const type = requireDeclared(args.type, WORLD_LOCATION_TYPES, 'world.location.add type');
      const locationId = await driver.addLocation({ name, description, type });
      const summary = await summarize();
      return { engine: driver.engine, locationId, name, type, locations: summary.stats.locations };
    },

    'world.character.add': async (args) => {
      const name = requireString(args.name, 'world.character.add name');
      const description = requireString(args.description, 'world.character.add description');
      const archetype = requireString(args.archetype, 'world.character.add archetype');
      const locationId = args.locationId === undefined ? undefined : requireString(args.locationId, 'world.character.add locationId');

      if (locationId !== undefined) {
        // The location must exist BEFORE the character is placed in it. The package would happily store a
        // dangling id; this door will not, because "the character is somewhere that is not there" is a
        // world a reader cannot walk. Checked against the world's own ID list, not against names — an
        // earlier draft of this file compared the id to the NAME list, which would have refused every
        // correctly-named location and accepted any location whose name happened to equal an id.
        const summary = await summarize();
        if (!summary.locationIds.includes(locationId)) {
          refused(`world.character.add: this world holds no location ${locationId}; add it with world.location.add first`);
        }
      }

      const characterId = await driver.addCharacter({
        name,
        description,
        archetype,
        ...(locationId !== undefined ? { locationId } : {}),
      });
      const summary = await summarize();
      return {
        engine: driver.engine,
        characterId,
        name,
        archetype,
        locationId: locationId ?? null,
        characters: summary.stats.characters,
      };
    },

    'world.lore.add': async (args) => {
      const title = requireString(args.title, 'world.lore.add title');
      const content = requireString(args.content, 'world.lore.add content');
      const category = requireDeclared(args.category, WORLD_LORE_CATEGORIES, 'world.lore.add category');
      const loreId = await driver.addLore({ title, content, category });
      const summary = await summarize();
      return { engine: driver.engine, loreId, title, category, lore: summary.stats.lore };
    },

    'world.character.decide': async (args) => {
      const characterId = requireString(args.characterId, 'world.character.decide characterId');
      const decision = await driver.decide(characterId);
      if (!decision) {
        refused(`world.character.decide: this world holds no agent for ${characterId}; a decision is asked of a character the engine has an agent for`);
      }
      return { engine: driver.engine, ...decision };
    },
  };

  for (const spec of WORLD_TOOL_SPECS) {
    const impl = impls[spec.name];
    if (!impl) throw new Error(`unrouted world tool ${spec.name}`);
    registry.register(spec, impl);
  }
  return registry;
}
