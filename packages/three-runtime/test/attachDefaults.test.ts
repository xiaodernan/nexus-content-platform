import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createThreeRuntime, DEFAULT_COMBATANT, DEFAULT_NPC, DEFAULT_PLAYER, SAVE_FILE_FORMAT, SAVE_FILE_VERSION, type ThreeRuntime } from '../src/threeRuntime.js';
import { createHeadlessBackend } from '../src/renderBackend.js';
import type { EntityId, SaveFile, SceneId } from '../src/types.js';

/**
 * v452 — the declared WORDS a record starts from, graded directly.
 *
 * `DEFAULT_NPC`, `DEFAULT_PLAYER` and `DEFAULT_COMBATANT` are the only consumers' answer to "what does a
 * record look like when the caller names nothing", and `SAVE_FILE_FORMAT` / `SAVE_FILE_VERSION` are the
 * two words a save file is stamped with. None of the five had a direct case: the attach doors were
 * graded for what they REFUSE (combatRecord.test.ts) and the save doors for what they round-trip
 * (saveSnapshot.test.ts), while the numbers a record is BORN with were reachable only by reading the
 * constants. This suite asks them directly, through the real attach and save paths.
 */

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

function body(name: string): EntityId {
  return runtime.createEntity(scene, name, 'mesh').id;
}

beforeEach(() => {
  runtime = createThreeRuntime({}, { backend: (_canvas, cfg) => createHeadlessBackend(cfg) });
  runtime.initialize(mockCanvas);
  scene = runtime.createScene('Arena').id;
});

afterEach(() => {
  runtime.dispose();
});

describe('the attach defaults — what a record starts from when a caller names nothing (v452)', () => {
  it('an NPC record starts from DEFAULT_NPC’s declared words, and its NAME from the world', () => {
    const npc = runtime.attachNPC(scene, body('Guard'));
    expect(npc.archetype).toBe(DEFAULT_NPC.archetype);
    expect(npc.archetype).toBe('villager');
    expect(npc.personality).toEqual(DEFAULT_NPC.personality);
    // One trait is deliberately not the middle of the road: a default populace of perfect calm
    // would make aggression a field nothing ever moves.
    expect(DEFAULT_NPC.personality.aggression).toBe(0.2);
    expect(npc.wanderRadius).toBe(DEFAULT_NPC.wanderRadius);
    expect(npc.faction).toBe(DEFAULT_NPC.faction);
    // The name is a READING of the entity, not a constant pretending to be one.
    expect(npc.name).toBe('Guard');
  });

  it('a named trait overrides ONE field and leaves the rest at their defaults', () => {
    // The spread order is the whole rule: `{ ...DEFAULT_NPC.personality, ...options.personality }`, so a
    // caller who names aggression does not silently reset curiosity to nothing.
    const npc = runtime.attachNPC(scene, body('Guard'), { personality: { aggression: 0.9 } });
    expect(npc.personality.aggression).toBe(0.9);
    expect(npc.personality.curiosity).toBe(DEFAULT_NPC.personality.curiosity);
    expect(npc.personality.loyalty).toBe(DEFAULT_NPC.personality.loyalty);
  });

  it('the player record starts at full health, HALF mana, level one and no experience', () => {
    const player = runtime.attachPlayer(scene, body('Hero'));
    expect(player.health).toBe(DEFAULT_PLAYER.health);
    expect(player.health).toBe(100);
    expect(player.maxHealth).toBe(100);
    expect(player.mana).toBe(50);
    expect(player.maxMana).toBe(50);
    expect(player.experience).toBe(0);
    expect(player.level).toBe(1);
    // A record that claimed items or skills from a constant would be the kind of save this lane has
    // spent eleven grants refusing: the two collections start EMPTY.
    expect(player.inventory).toEqual([]);
    expect(player.skills.size).toBe(0);
  });

  it('a combatant starts SMALL on purpose — the arithmetic of one blow is visible', () => {
    // Health 30 against attackPower 5 is SIX blows: a default that took a long fight to remove would
    // hide the arithmetic this record exists to make visible, and armor starts at zero so the floor
    // in `strike` is the first thing a caller meets.
    const foe = runtime.attachCombatant(scene, body('Foe'));
    expect(foe.health).toBe(DEFAULT_COMBATANT.health);
    expect(foe.health).toBe(30);
    expect(foe.maxHealth).toBe(30);
    expect(foe.armor).toBe(0);
    expect(foe.attackPower).toBe(5);
    expect(foe.attackRange).toBe(2);
    expect(foe.attackType).toBe('melee');
    expect(foe.faction).toBe('neutral');
    expect(DEFAULT_COMBATANT.maxHealth / DEFAULT_COMBATANT.attackPower).toBe(6);
  });

  it('the combatant’s declared-but-unread field is NAMED by the audit, not carried in silence', () => {
    // `attackSpeed` is on the record and read by nothing; the audit says so out loud, which is what
    // keeps a declared word from becoming a silent one.
    const foe = body('Foe');
    runtime.attachCombatant(scene, foe);
    const audit = runtime.combatFieldAudit(scene, foe);
    expect(audit?.unhonored.map((row) => row.field)).toContain('attackSpeed');
  });
});

describe('the save header’s two words (v452)', () => {
  it('the file names the runtime that wrote it, and the version it was written at', () => {
    body('Cube');
    const file = runtime.buildSaveFile(scene, 1_700_000_000_000);
    expect(file.format).toBe(SAVE_FILE_FORMAT);
    expect(file.format).toBe('nexus-three-runtime-save');
    expect(file.version).toBe(SAVE_FILE_VERSION);
    expect(file.version).toBe(1);
  });

  it('a file with a FOREIGN format is refused, naming both words', () => {
    body('Cube');
    const file = runtime.buildSaveFile(scene, 1_700_000_000_000);
    const foreign = { ...file, format: 'some-other-runtime-save' } as unknown as SaveFile;
    expect(() => runtime.loadSaveFile(foreign, scene)).toThrow(/format is "some-other-runtime-save", not "nexus-three-runtime-save"/);
  });

  it('a file from a FUTURE version is refused, naming both numbers — guessing is how a save comes back wrong and quiet', () => {
    body('Cube');
    const file = runtime.buildSaveFile(scene, 1_700_000_000_000);
    const future = { ...file, version: 2 } as unknown as SaveFile;
    expect(() => runtime.loadSaveFile(future, scene)).toThrow(/version is 2 and this runtime reads exactly 1/);
    expect(() => runtime.loadSaveFile(future, scene)).toThrow(/guessing at a future file/);
  });
});
