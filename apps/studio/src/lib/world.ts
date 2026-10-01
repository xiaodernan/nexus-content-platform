/**
 * M4 v148 — the Studio's world surface, split the way ADR 0005 splits the 2D one and v142 split the 3D
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
}

/** The world, as a plain JSON-safe report. Names ride beside ids so a reader can see what it is looking at. */
export interface WorldReport {
  schema: 1;
  id: string;
  name: string;
  genre: string;
  description: string;
  stats: WorldStatsLike;
  characters: { id: string; name: string; archetype: string; locationName: string | null }[];
  locations: { id: string; name: string; type: string }[];
  lore: { id: string; title: string; category: string }[];
}

/**
 * Compose the Studio's demo world: three connected-feeling places, three characters placed in them, and
 * two lore entries the retrieval can find.
 *
 * It is deliberately SMALL and deliberately WALKABLE — every character stands somewhere that exists, and
 * the panel shows that relation rather than a flat list. Everything here uses the package's own declared
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

  const mira = engine.createCharacter('Mira', 'A scout who reads the ford and its traffic.', 'rogue', ford.id);
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
    characterIds: [mira.id, cassian.id, vane.id],
    loreIds: [history.id, myth.id],
  };
}

/**
 * Read the engine's state back as a plain report.
 *
 * Every collection is read from the WORLD the engine holds, and a character's place is resolved to the
 * location's NAME rather than left as an id — a panel that showed a bare id would be showing the caller
 * its own reference instead of the world's answer. A character whose location the world does not hold
 * reports `null` for it rather than a dangling name.
 */
export function buildWorldReport(engine: WorldEngineLike): WorldReport {
  const world = engine.getWorld();
  const stats = engine.getStats();
  const locations = [...world.locations.values()];
  const byId = new Map(locations.map((l) => [l.id, l.name]));

  return {
    schema: 1,
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
  };
}
