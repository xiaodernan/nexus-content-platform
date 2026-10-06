import type { Relationship } from './types.js';

/**
 * M4 v162 — the relationship-simulation core, as PURE functions.
 *
 * Before this module a relationship could only be BORN (`speak` writes a neutral 10 on a first
 * meeting) and nudged (+5 on the speaker's side only). Nothing ever eroded, nothing derived a bond's
 * type from its strength, and the target's side of the bond did not exist at all. That is a contact
 * list, not a simulation.
 *
 * The rules here are deliberately small and legible:
 *   - a first meeting lands at `RELATIONSHIP_FLOOR` (10) — the anchor `characterAgent` has always used;
 *   - every friendly interaction gains `INTERACTION_GAIN` (5), capped at `RELATIONSHIP_CAP` (100);
 *   - every simulation tick, a bond nobody maintained decays `DECAY_PER_TICK` (2) toward the floor —
 *     absence wears a bond back to "met once", never into hatred, so the `enemy` band is reachable
 *     only by an explicit write, never by decay;
 *   - a bond's TYPE is derived from its strength (`deriveRelationType`) — but only for the four types
 *     this module owns. `family`, `romantic`, `rival`, `mentor` and `servant` are bonds someone
 *     declared, and arithmetic does not un-declare them.
 */

/** Where a first meeting lands, and where decay stops. */
export const RELATIONSHIP_FLOOR = 10;

/** The most a bond can hold. */
export const RELATIONSHIP_CAP = 100;

/** Strength gained per friendly interaction — the number `speak` has always paid. */
export const INTERACTION_GAIN = 5;

/** Strength lost per simulation tick for every bond nobody maintained. */
export const DECAY_PER_TICK = 2;

/** The four types this module derives from strength. Everything else is a declared bond. */
export const DERIVED_RELATIONSHIP_TYPES: readonly Relationship['type'][] = ['enemy', 'neutral', 'friend', 'ally'];

/** The band edges: <10 `enemy`, 10–59 `neutral`, 60–84 `friend`, 85+ `ally`. */
export function deriveRelationType(strength: number): Relationship['type'] {
  if (strength < RELATIONSHIP_FLOOR) return 'enemy';
  if (strength < 60) return 'neutral';
  if (strength < 85) return 'friend';
  return 'ally';
}

/** Whether a bond's type may be re-derived from its strength. Declared bonds are never retyped. */
export function isDerivableRelationType(type: Relationship['type']): boolean {
  return DERIVED_RELATIONSHIP_TYPES.includes(type);
}

/** One tick of neglect. Never crosses the floor. */
export function decayStrength(strength: number, perTick: number = DECAY_PER_TICK, floor: number = RELATIONSHIP_FLOOR): number {
  return Math.max(floor, strength - perTick);
}

/** One friendly interaction. Never crosses the cap. */
export function gainStrength(strength: number, gain: number = INTERACTION_GAIN, cap: number = RELATIONSHIP_CAP): number {
  return Math.min(cap, strength + gain);
}
