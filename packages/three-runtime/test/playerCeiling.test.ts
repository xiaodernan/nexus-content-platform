import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createThreeRuntime, type ThreeRuntime } from '../src/threeRuntime.js';
import { createHeadlessBackend } from '../src/renderBackend.js';
import type { EntityId, SceneId } from '../src/types.js';

/**
 * M5 v-next: the player's attach door tested FINITENESS and nothing else, so it stored a record above its own
 * ceiling — a shape `attachCombatant` has refused since v138. The consequence was measured on a frozen clone of
 * HEAD before this grant: `healPlayer` clamps with `maxHealth - health`, so on a body at health 150 / maxHealth
 * 100 a heal of 10 reported `healed: -50` and LEFT 100 — the verb that puts health back took 50 away and emitted
 * `playerHealed` while doing it.
 *
 * The rule is on the DOOR, not on the numbers a verb produces: `damagePlayer` and `healPlayer` cannot build an
 * above-ceiling record, and nothing in this package raises a ceiling (the last section of this file checks that
 * claim against the source rather than restating it). `restorePlayer` calls `attachPlayer`, so the file half
 * inherits the refusal — a save that already holds the impossible record is now refused at load, and
 * `loadSaveFile` rolls its own half-load back, which is what makes that refusal leave a playable scene.
 */

const here = fileURLToPath(new URL('.', import.meta.url));

const mockCanvas = {
  width: 800,
  height: 600,
  style: {},
  getContext: vi.fn(() => ({ canvas: mockCanvas, drawingBufferWidth: 800, drawingBufferHeight: 600 })),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  clientWidth: 800,
  clientHeight: 600,
} as unknown as HTMLCanvasElement;

let runtime: ThreeRuntime;
let scene: SceneId;
let hero: EntityId;

beforeEach(() => {
  runtime = createThreeRuntime({}, { backend: (_canvas, cfg) => createHeadlessBackend(cfg) });
  runtime.initialize(mockCanvas);
  scene = runtime.createScene('Arena').id;
  hero = runtime.createEntity(scene, 'Hero', 'mesh').id;
});

describe('attachPlayer refuses what attachCombatant already refuses', () => {
  it('health above maxHealth is refused at the door rather than clamped', () => {
    expect(() => runtime.attachPlayer(scene, hero, { health: 150, maxHealth: 100 })).toThrow(/above its own maximum/);
    expect(runtime.getPlayer(scene)).toBeUndefined();
  });

  it('mana above maxMana is refused by the same rule, not by a mana-specific one', () => {
    expect(() => runtime.attachPlayer(scene, hero, { mana: 900, maxMana: 50 })).toThrow(/above its own maximum/);
    expect(runtime.getPlayer(scene)).toBeUndefined();
  });

  it('a record exactly at its ceiling is a full pool, not an impossible one', () => {
    const full = runtime.attachPlayer(scene, hero, { health: 100, maxHealth: 100, mana: 50, maxMana: 50 });
    expect(full.health).toBe(100);
    expect(full.mana).toBe(50);
  });

  it('each refusal names the mechanism its own field would break', () => {
    expect(() => runtime.attachPlayer(scene, hero, { health: 101, maxHealth: 100 }))
      .toThrow(/maxHealth - health/);
    expect(() => runtime.attachPlayer(scene, hero, { mana: 51, maxMana: 50 }))
      .toThrow(/no later spend can be measured against/);
  });

  it('the measured inversion is now unconstructible: no record for healPlayer to invert', () => {
    expect(() => runtime.attachPlayer(scene, hero, { health: 150, maxHealth: 100 })).toThrow(/above its own maximum/);
    expect(() => runtime.healPlayer(scene, 10)).toThrow(/healPlayer: scene .+ has no player/);
  });

  it('a legal record has its heal report read as a heal for every amount', () => {
    runtime.attachPlayer(scene, hero);
    expect(runtime.damagePlayer(scene, 30).health).toBe(70);
    const back = runtime.healPlayer(scene, 10);
    expect(back.healed).toBe(10);
    expect(back.health).toBe(80);
    const overflow = runtime.healPlayer(scene, 999);
    expect(overflow.healed).toBe(20);
    expect(overflow.health).toBe(100);
    const atFull = runtime.healPlayer(scene, 10);
    expect(atFull.healed).toBe(0);
    for (const report of [back, overflow, atFull]) expect(report.healed).toBeGreaterThanOrEqual(0);
  });
});

describe('the file half inherits the door', () => {
  it('restorePlayer refuses an above-ceiling record because it goes through attachPlayer', () => {
    runtime.attachPlayer(scene, hero);
    const saved = runtime.playerSnapshot(scene);
    expect(saved).not.toBeNull();
    runtime.detachPlayer(scene);
    expect(() => runtime.restorePlayer(scene, { ...saved!, health: 150 })).toThrow(/attachPlayer: health is 150/);
    expect(runtime.getPlayer(scene)).toBeUndefined();
  });

  it('a save file whose player half exceeds the ceiling is refused by the loader, and its half-load goes back', () => {
    runtime.attachPlayer(scene, hero);
    const file = JSON.parse(JSON.stringify(runtime.buildSaveFile(scene, 1_700_000_000_000)));
    const untouched = JSON.parse(JSON.stringify(file));
    file.player.health = 150;
    const refused = runtime.createScene('Refused').id;
    expect(() => runtime.loadSaveFile(file, refused)).toThrow(/above its own maximum/);
    expect(runtime.getPlayer(refused)).toBeUndefined();
    expect(runtime.getEntity(refused, hero)).toBeUndefined();
    // The control runs the same loader over the same bytes with the ceiling left alone, so the two lines above
    // describe a rollback rather than a loader that never files anything.
    const loaded = runtime.createScene('Loaded').id;
    expect(() => runtime.loadSaveFile(untouched, loaded)).not.toThrow();
    expect(runtime.getEntity(loaded, hero)).toBeDefined();
    expect(runtime.getPlayer(loaded)!.entityId).toBe(hero);
  });
});

describe('the rule is exactly as wide as the mechanism', () => {
  it('a negative record still passes the door: no measured inversion follows from it', () => {
    const wounded = runtime.attachPlayer(scene, hero, { health: -5, maxHealth: 100, mana: -20, maxMana: 50 });
    expect(wounded.health).toBe(-5);
    // and the heal on such a record ADDS, which is why this grant does not claim to be a validity rule.
    expect(runtime.healPlayer(scene, 10).healed).toBe(10);
  });

  it('attachCombatant still refuses its own shape, so the two doors agree by word as well as by rule', () => {
    expect(() => runtime.attachCombatant(scene, hero, { health: 40, maxHealth: 30 })).toThrow(/above its own maximum/);
    expect(() => runtime.attachPlayer(scene, hero, { health: 40, maxHealth: 30 })).toThrow(/above its own maximum/);
  });

  it('nothing in the package raises a ceiling, which is why an above-ceiling record could never be honoured', () => {
    const src = readFileSync(`${here}../src/threeRuntime.ts`, 'utf8');
    // the scan is only worth anything if it can see an assignment at all: the same regex over the fields that
    // DO move must find them, or a broken scan would print the same 0 as a true one.
    const moving = [...src.matchAll(/\bplayer\.(?:health|mana|experience)\s*[-+]?=[^=]/g)].map((m) => m[0].trim());
    expect(moving.length).toBeGreaterThanOrEqual(3);
    const ceilings = [...src.matchAll(/\b(?:player|entry|victim|combatant)\.max(?:Health|Mana)\s*[-+]?=[^=]/g)].map((m) => m[0]);
    expect(ceilings).toEqual([]);
  });
});
