/**
 * M4 — the Studio's world surface, split the way ADR 0005 splits the 2D one and v142 split the 3D
 * one: the MODEL is pure and testable, the panel is a component.
 *
 * Why this file exists: the world lane got its AGENT consumer in v144 (`worldTools.ts` over a
 * `WorldDriver` seam), and its record still ends with *"no Studio surface … the product half is still
 * open."* This is the product half, written so that the two claims a reviewer cares about — *what world
 * did we compose* and *what does the engine hold right now* — are pure functions over a narrow structural
 * interface, unit-testable with no React, no DOM and no world package loaded.
 *
 * The interface below is deliberately STRUCTURAL rather than `import type { WorldEngine }`: Next.js
 * evaluates this module during SSR, where loading a package whose job is to build worlds is pointless
 * work and a needless dependency edge. The panel is the only place that touches a real engine.
 *
 * v162 — the surface stops being read-only. The report grows a `relationships` view (schema 2): every
 * bond in the world, with both sides resolved to NAMES the reader can walk, the same rule the character
 * rows have always used for places. The composer now also CONNECTS its three places — a world of
 * unconnected rooms has nothing to walk — and seats Toma at the ford beside Mira, so the simulation the
 * panel can now step has two people who can actually meet.
 */

/** A world's counts, exactly the seven the package's own `getStats()` answers. */
export interface WorldStatsLike {
  characters: number;
  locations: number;
  factions: number;
  lore: number;
  events: number;
  agents: number;
  ticks: number;
}

export interface WorldCharacterLike {
  id: string;
  name: string;
  archetype: string;
  locationId: string | null;
  /** v162 — the bonds this character holds. Structural: only the fields the report needs. */
  relationships: Map<string, { targetId: string; type: string; strength: number }>;
}

export interface WorldLocationLike {
  id: string;
  name: string;
  type: string;
}

export interface WorldLoreLike {
  id: string;
  title: string;
  category: string;
}

/** The parts of the engine this module reads and writes. Every member exists on the real `WorldEngine`;
 *  nothing is invented for the Studio's convenience. */
export interface WorldEngineLike {
  getWorld(): {
    id: string;
    name: string;
    genre: string;
    description: string;
    characters: Map<string, WorldCharacterLike>;
    locations: Map<string, WorldLocationLike>;
    lore: Map<string, WorldLoreLike>;
  };
  getStats(): WorldStatsLike;
  createLocation(name: string, description: string, type: string, parentId?: string | null): WorldLocationLike;
  createCharacter(name: string, description: string, archetype: string, locationId?: string | null): WorldCharacterLike;
  createLore(title: string, content: string, category: string): WorldLoreLike;
  /** v162 — a world of unconnected places has nothing to walk. */
  connectLocations(
    fromId: string,
    toId: string,
    connection: { type: string; distance: number; difficulty: number; description: string },
  ): void;
}

/** The world, as a plain JSON-safe report. Names ride beside ids so a reader can see what it is looking at. */
export interface WorldReport {
  schema: 2;
  id: string;
  name: string;
  genre: string;
  description: string;
  stats: WorldStatsLike;
  characters: { id: string; name: string; archetype: string; locationName: string | null }[];
  locations: { id: string; name: string; type: string }[];
  lore: { id: string; title: string; category: string }[];
  /** v162 — every bond, both sides resolved to names a reader can walk. */
  relationships: WorldPairRow[];
}

export interface WorldPairRow {
  from: string;
  to: string | null;
  type: string;
  strength: number;
}

/**
 * Compose the Studio's demo world: three connected places, four characters (two of them sharing the
 * ford, so the simulation can actually introduce them), and two lore entries the retrieval can find.
 *
 * It is deliberately SMALL and deliberately WALKABLE — every character stands somewhere that exists and
 * every place is joined to the ford by a named road. Everything here uses the package's own declared
 * words (`town`/`village`/`wilderness` are declared location types; `history`/`myth` are declared lore
 * categories), so nothing in this file invents a vocabulary the engine cannot read.
 */
export function buildStudioWorld(engine: WorldEngineLike): {
  locationIds: string[];
  characterIds: string[];
  loreIds: string[];
} {
  const ford = engine.createLocation('Ashen Ford', 'A river crossing where the road narrows.', 'town');
  const ridge = engine.createLocation('The Grey Ridge', 'A wind-scoured ridge above the ford.', 'wilderness');
  const hamlet = engine.createLocation('Lowmarch', 'A hamlet that trades across the ford.', 'village');

  engine.connectLocations(ford.id, ridge.id, {
    type: 'path',
    distance: 8,
    difficulty: 2,
    description: 'A steep track that climbs from the ford to the ridge.',
  });
  engine.connectLocations(ford.id, hamlet.id, {
    type: 'road',
    distance: 5,
    difficulty: 1,
    description: 'The well-worn trade road across the river.',
  });

  const mira = engine.createCharacter('Mira', 'A scout who reads the ford and its traffic.', 'rogue', ford.id);
  const toma = engine.createCharacter('Toma', 'A fordside idler who talks to anyone who crosses.', 'commoner', ford.id);
  const cassian = engine.createCharacter('Cassian', 'A ledger-keeper who remembers every toll.', 'merchant', hamlet.id);
  const vane = engine.createCharacter('Vane', 'A watcher who keeps to the ridge.', 'ranger', ridge.id);

  const history = engine.createLore(
    'The Sundering',
    'The ford was cut by a river that remembers the ridge it came from.',
    'history',
  );
  const myth = engine.createLore(
    'The Grey Watch',
    'They say a watcher on the ridge has never once come down.',
    'myth',
  );

  return {
    locationIds: [ford.id, ridge.id, hamlet.id],
    characterIds: [mira.id, toma.id, cassian.id, vane.id],
    loreIds: [history.id, myth.id],
  };
}

/**
 * Read the engine's state back as a plain report.
 *
 * Every collection is read from the WORLD the engine holds, and a character's place — and, since v162, a
 * bond's other party — is resolved to the NAME rather than left as an id: a panel that showed a bare id
 * would be showing the caller its own reference instead of the world's answer. A reference the world does
 * not hold reports `null` rather than a dangling name.
 */
export function buildWorldReport(engine: WorldEngineLike): WorldReport {
  const world = engine.getWorld();
  const stats = engine.getStats();
  const locations = [...world.locations.values()];
  const byId = new Map(locations.map((l) => [l.id, l.name]));
  const charById = new Map([...world.characters.values()].map((c) => [c.id, c.name]));

  const relationships: WorldPairRow[] = [];
  for (const c of world.characters.values()) {
    for (const rel of c.relationships.values()) {
      relationships.push({
        from: c.name,
        to: charById.get(rel.targetId) ?? null,
        type: rel.type,
        strength: rel.strength,
      });
    }
  }

  return {
    schema: 2,
    id: world.id,
    name: world.name,
    genre: world.genre,
    description: world.description,
    stats,
    characters: [...world.characters.values()].map((c) => ({
      id: c.id,
      name: c.name,
      archetype: c.archetype,
      locationName: c.locationId ? byId.get(c.locationId) ?? null : null,
    })),
    locations: locations.map((l) => ({ id: l.id, name: l.name, type: l.type })),
    lore: [...world.lore.values()].map((l) => ({ id: l.id, title: l.title, category: l.category })),
    relationships,
  };
}
