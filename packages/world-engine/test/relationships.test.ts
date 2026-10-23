import { describe, expect, it } from 'vitest';
import {
  RELATIONSHIP_FLOOR,
  RELATIONSHIP_CAP,
  INTERACTION_GAIN,
  DECAY_PER_TICK,
  DERIVED_RELATIONSHIP_TYPES,
  deriveRelationType,
  isDerivableRelationType,
  decayStrength,
  gainStrength,
} from '../src/index.js';

/**
 * The RELATIONSHIP core’s own rules, graded directly.
 *
 * v162 wrote these as pure arithmetic and the engine’s tick has carried them ever since: a bond sat in a
 * world, the world stepped, an assertion read the bond afterwards. That is coverage of the ENGINE and thin
 * coverage of the RULES — the band edges were probed at six numbers, the custom parameters never, and the
 * claims the module’s own doc-comment makes (“decay never manufactures hatred”, “a declared bond is never
 * retyped”, “absence wears a bond back to met-once”) were prose rather than cases. This file asks the
 * arithmetic directly, in its own words.
 */

describe('relationships — the constants the rest of the engine quotes', () => {
  it('pins the four numbers the agent and the tick are built on', () => {
    expect(RELATIONSHIP_FLOOR).toBe(10);
    expect(RELATIONSHIP_CAP).toBe(100);
    expect(INTERACTION_GAIN).toBe(5);
    expect(DECAY_PER_TICK).toBe(2);
  });

  it('owns exactly four derivable types, in band order', () => {
    expect(DERIVED_RELATIONSHIP_TYPES).toEqual(['enemy', 'neutral', 'friend', 'ally']);
  });

  it('the floor IS the enemy/neutral edge, and the cap sits in the ally band', () => {
    expect(deriveRelationType(RELATIONSHIP_FLOOR - 1)).toBe('enemy');
    expect(deriveRelationType(RELATIONSHIP_FLOOR)).toBe('neutral');
    expect(deriveRelationType(RELATIONSHIP_CAP)).toBe('ally');
  });
});

describe('deriveRelationType — the bands', () => {
  it('puts each edge in the band the doc-comment names', () => {
    expect(deriveRelationType(9)).toBe('enemy');
    expect(deriveRelationType(10)).toBe('neutral');
    expect(deriveRelationType(59)).toBe('neutral');
    expect(deriveRelationType(60)).toBe('friend');
    expect(deriveRelationType(84)).toBe('friend');
    expect(deriveRelationType(85)).toBe('ally');
  });

  it('everything below the floor is an enemy, however far below', () => {
    expect(deriveRelationType(0)).toBe('enemy');
    expect(deriveRelationType(-100)).toBe('enemy');
  });

  it('everything at or past the cap is an ally', () => {
    expect(deriveRelationType(100)).toBe('ally');
    expect(deriveRelationType(1000)).toBe('ally');
  });

  it('never moves backward as strength grows', () => {
    const order = ['enemy', 'neutral', 'friend', 'ally'];
    let last = -1;
    for (let s = -20; s <= 120; s++) {
      const rank = order.indexOf(deriveRelationType(s));
      expect(rank).toBeGreaterThanOrEqual(last);
      last = rank;
    }
  });
});

describe('isDerivableRelationType — arithmetic owns four types, people own the rest', () => {
  it('derives the four bands', () => {
    for (const t of DERIVED_RELATIONSHIP_TYPES) {
      expect(isDerivableRelationType(t)).toBe(true);
    }
  });

  it('never retypes a bond someone declared', () => {
    for (const t of ['family', 'romantic', 'rival', 'mentor', 'servant'] as const) {
      expect(isDerivableRelationType(t)).toBe(false);
    }
  });
});

describe('decayStrength — one tick of neglect', () => {
  it('takes the declared step by default', () => {
    expect(decayStrength(50)).toBe(48);
  });

  it('stops at the floor and never crosses it, from either side', () => {
    expect(decayStrength(11)).toBe(10);
    expect(decayStrength(10)).toBe(10);
    expect(decayStrength(4)).toBe(10);
    expect(decayStrength(0)).toBe(10);
    expect(decayStrength(-5)).toBe(10);
  });

  it('takes the step it is given, and the floor it is given', () => {
    expect(decayStrength(50, 7)).toBe(43);
    expect(decayStrength(5, 2, 0)).toBe(3);
    expect(decayStrength(50, 30, 10)).toBe(20);
    expect(decayStrength(3, 5, 10)).toBe(10);
  });

  it('an unmaintained bond converges to the floor and then stops moving', () => {
    let strength = RELATIONSHIP_CAP;
    let ticks = 0;
    while (strength > RELATIONSHIP_FLOOR) {
      strength = decayStrength(strength);
      ticks++;
    }
    expect(strength).toBe(RELATIONSHIP_FLOOR);
    expect(ticks).toBe(45);
    expect(decayStrength(strength)).toBe(RELATIONSHIP_FLOOR);
  });

  it('never manufactures hatred: no reachable strength decays into the enemy band', () => {
    for (let s = 0; s <= RELATIONSHIP_CAP; s++) {
      const worn = decayStrength(s);
      expect(worn).toBeGreaterThanOrEqual(RELATIONSHIP_FLOOR);
      expect(deriveRelationType(worn)).not.toBe('enemy');
    }
  });
});

describe('gainStrength — one friendly interaction', () => {
  it('pays the declared gain by default', () => {
    expect(gainStrength(10)).toBe(15);
    expect(gainStrength(0)).toBe(5);
  });

  it('never crosses the cap', () => {
    expect(gainStrength(99)).toBe(100);
    expect(gainStrength(100)).toBe(100);
    expect(gainStrength(1000)).toBe(100);
  });

  it('takes the gain and the cap it is given', () => {
    expect(gainStrength(10, 3)).toBe(13);
    expect(gainStrength(18, 5, 20)).toBe(20);
  });

  it('caps only — a gain has no floor, and the module claims none', () => {
    // The floor is written at FIRST MEETING (the agent seeds RELATIONSHIP_FLOOR), not enforced here.
    // Pinning the asymmetry keeps the two halves honest about which rule lives where.
    expect(gainStrength(-10)).toBe(-5);
  });
});

describe('the two halves compose — a tended bond climbs, a neglected one sinks', () => {
  it('a bond tended every tick walks neutral → friend → ally on the arithmetic alone', () => {
    let strength = RELATIONSHIP_FLOOR;
    let friendAt = -1;
    let allyAt = -1;
    for (let tick = 1; tick <= 20; tick++) {
      strength = gainStrength(strength);
      if (friendAt < 0 && deriveRelationType(strength) === 'friend') friendAt = tick;
      if (allyAt < 0 && deriveRelationType(strength) === 'ally') allyAt = tick;
    }
    expect(friendAt).toBe(10);
    expect(allyAt).toBe(15);
    expect(strength).toBe(RELATIONSHIP_CAP);
  });

  it('a bond neglected every tick walks ally → friend → neutral and rests at the floor', () => {
    let strength = RELATIONSHIP_CAP;
    const seen: string[] = [];
    for (let tick = 0; tick < 60; tick++) {
      strength = decayStrength(strength);
      const type = deriveRelationType(strength);
      if (seen[seen.length - 1] !== type) seen.push(type);
    }
    expect(seen).toEqual(['ally', 'friend', 'neutral']);
    expect(strength).toBe(RELATIONSHIP_FLOOR);
  });
});
