import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createThreeRuntime, type ThreeRuntime } from '../src/threeRuntime.js';
import { createHeadlessBackend } from '../src/renderBackend.js';
import type { EntityId, SceneId } from '../src/types.js';

/**
 * M5 v138: `CombatSystem` / `CombatEntity` were declared in `types.ts` and constructed by NOTHING. The M5 goal
 * names `combat` among its nouns, and until now no code in this package held a body's health but the player's
 * own record. This suite makes one body's combat record real: who may hold it, what a blow does to the
 * declared numbers, which transition death is and which it is not, and how long a record lives.
 *
 * The last section deliberately does NOT restate the shipped tables. It reads `src/types.ts` from disk and
 * requires `consulted` and `unhonored` to PARTITION the declared `CombatEntity`, so a field added to the type
 * and forgotten on the reader side is a red test rather than a declared word nothing consults.
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
let hero: EntityId;
let foe: EntityId;

function freshWorld(): ThreeRuntime {
  const created = createThreeRuntime({}, { backend: (_canvas, cfg) => createHeadlessBackend(cfg) });
  created.initialize(mockCanvas);
  return created;
}

/** One more body in the arena, named for whoever has to be hit. */
function body(name: string): EntityId {
  return runtime.createEntity(scene, name, 'mesh').id;
}

beforeEach(() => {
  runtime = freshWorld();
  scene = runtime.createScene('Arena').id;
  hero = body('Hero');
  foe = body('Foe');
});

describe('attachCombatant — a declared shape gets its first owner', () => {
  it('a body gets a record, and the record it gets is the declared shape', () => {
    const record = runtime.attachCombatant(scene, hero);
    expect(record.entityId).toBe(hero);
    expect(record.health).toBe(30);
    expect(record.maxHealth).toBe(30);
    expect(record.armor).toBe(0);
    expect(record.attackPower).toBe(5);
    expect(record.attackRange).toBe(2);
    expect(record.attackType).toBe('melee');
    expect(record.faction).toBe('neutral');
    expect(record.aiState).toBe('idle');
    expect(record.target).toBeNull();
    expect(record.cooldowns.size).toBe(0);
    expect(record.statusEffects).toEqual([]);
    expect(runtime.getCombatant(scene, hero)).toBe(record);
  });

  it('the door refuses a non-finite number and a negative one, naming the field', () => {
    expect(() => runtime.attachCombatant(scene, hero, { health: NaN })).toThrow(/health is NaN/);
    expect(() => runtime.attachCombatant(scene, hero, { maxHealth: Infinity })).toThrow(/maxHealth is Infinity/);
    expect(() => runtime.attachCombatant(scene, hero, { armor: -1 })).toThrow(/armor is -1/);
    expect(() => runtime.attachCombatant(scene, hero, { attackPower: -0.5 })).toThrow(/attackPower is -0.5/);
    expect(runtime.getCombatant(scene, hero)).toBeUndefined();
  });

  it('a record that starts above its own maximum is refused rather than clamped', () => {
    expect(() => runtime.attachCombatant(scene, hero, { health: 40, maxHealth: 30 })).toThrow(/above its own maximum/);
    expect(runtime.getCombatant(scene, hero)).toBeUndefined();
  });

  it('one body takes one blow at a time: a second record is refused, and detaching is how it goes away', () => {
    runtime.attachCombatant(scene, hero);
    expect(() => runtime.attachCombatant(scene, hero)).toThrow(/already has a combat record/);
    expect(runtime.getCombatant(scene, hero)!.health).toBe(30);
    expect(runtime.detachCombatant(hero)).toBe(true);
    expect(runtime.detachCombatant(hero)).toBe(false);
    expect(runtime.getCombatant(scene, hero)).toBeUndefined();
  });

  it('a scene or a body that is not there is refused by name', () => {
    const elsewhere = runtime.createScene('Elsewhere').id;
    expect(() => runtime.attachCombatant(elsewhere, hero)).toThrow(/is not in scene/);
    expect(() => runtime.attachCombatant(scene, 'nobody' as EntityId)).toThrow(/is not in scene/);
  });
});

describe('the player is not a combatant, because its numbers already have an owner', () => {
  it('a body that is the scene player is refused at the attach door', () => {
    runtime.attachPlayer(scene, hero);
    expect(() => runtime.attachCombatant(scene, hero)).toThrow(/second owner of one health/);
  });

  it('and the strike door refuses it too, whether or not a record was ever attached', () => {
    runtime.attachPlayer(scene, hero);
    runtime.attachCombatant(scene, foe);
    expect(() => runtime.strike(scene, foe, hero)).toThrow(/does not route one blow through two records/);
    expect(runtime.getPlayer(scene)!.health).toBe(100);
  });
});

describe('strike — the arithmetic is stated rather than tuned', () => {
  it('armor subtracts, and a blow that is not zero lands at least one', () => {
    runtime.attachCombatant(scene, hero);
    runtime.attachCombatant(scene, foe, { armor: 100 });
    const hit = runtime.strike(scene, hero, foe, 5);
    expect(hit.amount).toBe(5);
    expect(hit.armor).toBe(100);
    expect(hit.damage).toBe(1);
    expect(hit.health).toBe(29);
    const nothing = runtime.strike(scene, hero, foe, 0);
    expect(nothing.damage).toBe(0);
    expect(nothing.health).toBe(29);
    expect(nothing.died).toBe(false);
  });

  it('a strike with no amount uses the attacker’s attackPower, and the report carries the number used', () => {
    runtime.attachCombatant(scene, hero, { attackPower: 7 });
    runtime.attachCombatant(scene, foe, { health: 10, maxHealth: 10 });
    const hit = runtime.strike(scene, hero, foe);
    expect(hit.amount).toBe(7);
    expect(hit.damage).toBe(7);
    expect(hit.health).toBe(3);
    expect(hit.entityId).toBe(hero);
    expect(hit.targetId).toBe(foe);
  });

  it('damage is what LANDED: an overkill blow reports less than it asked for, and a blow on a corpse zero', () => {
    runtime.attachCombatant(scene, hero, { attackPower: 12 });
    runtime.attachCombatant(scene, foe, { health: 5, maxHealth: 5 });
    const overkill = runtime.strike(scene, hero, foe, 50);
    expect(overkill.damage).toBe(5);
    expect(overkill.died).toBe(true);
    expect(overkill.health).toBe(0);
    const after = runtime.strike(scene, hero, foe, 50);
    expect(after.damage).toBe(0);
    expect(after.died).toBe(false);
    expect(after.health).toBe(0);
  });

  it('the caller’s reason rides the report and is never read by the runtime', () => {
    runtime.attachCombatant(scene, hero);
    runtime.attachCombatant(scene, foe);
    expect(runtime.strike(scene, hero, foe, 3, 'fell into the pit').reason).toBe('fell into the pit');
    expect(runtime.strike(scene, hero, foe, 3).reason).toBe('');
  });

  it('both doors refuse an amount that is not a finite non-negative number, naming the operation', () => {
    runtime.attachCombatant(scene, hero);
    runtime.attachCombatant(scene, foe);
    expect(() => runtime.strike(scene, hero, foe, -1)).toThrow(/strike: amount is -1/);
    expect(() => runtime.strike(scene, hero, foe, NaN)).toThrow(/strike: amount is NaN/);
    expect(() => runtime.healCombatant(scene, hero, NaN)).toThrow(/healCombatant: amount is NaN/);
    expect(() => runtime.healCombatant(scene, hero, -2)).toThrow(/healCombatant: amount is -2/);
  });

  it('a strike at a body with no record is refused by name, rather than moving a number nothing owns', () => {
    runtime.attachCombatant(scene, hero);
    expect(() => runtime.strike(scene, hero, foe, 1)).toThrow(/has no combat record; attachCombatant/);
    expect(() => runtime.strike(scene, foe, hero, 1)).toThrow(/has no combat record; attachCombatant/);
  });

  it('a body may not be its own target, and the refusal beats the striker-state one', () => {
    // The caller-error this catches: transposing two arguments halved your own health and got a report
    // that looked like a hit. Refused as a malformed CALL, before the striker's own state is consulted —
    // so the same mistake on a corpse is still reported as the malformed call, not as a dead striker.
    runtime.attachCombatant(scene, hero);
    runtime.attachCombatant(scene, foe);

    expect(() => runtime.strike(scene, hero, hero, 5)).toThrow(/is both attacker and target/);
    const before = runtime.getCombatant(scene, hero)!;
    expect(before.health).toBe(before.maxHealth); // the refused call moved nothing

    expect(runtime.strike(scene, foe, hero, 9999).died).toBe(true); // hero is now dead
    expect(() => runtime.strike(scene, hero, hero, 5)).toThrow(/is both attacker and target/); // call shape wins
    expect(() => runtime.strike(scene, hero, foe, 5)).toThrow(/is dead on its own record/); // the state refusal is still there
  });

  it('a record belongs to one scene, and another scene is not an answer about it', () => {
    runtime.attachCombatant(scene, hero);
    const elsewhere = runtime.createScene('Elsewhere').id;
    expect(runtime.getCombatant(elsewhere, hero)).toBeUndefined();
    expect(() => runtime.strike(elsewhere, hero, hero, 1)).toThrow(/combat record in scene/);
    expect(runtime.getCombatant(scene, hero)!.health).toBe(30);
  });
});

describe('death is one transition, and it is entered and left by exactly two calls', () => {
  it('a corpse does not strike, and only a heal that crosses back leaves dead', () => {
    runtime.attachCombatant(scene, hero, { attackPower: 9 });
    runtime.attachCombatant(scene, foe, { health: 9, maxHealth: 20 });
    runtime.strike(scene, hero, foe, 9);
    expect(runtime.getCombatant(scene, foe)!.aiState).toBe('dead');
    expect(() => runtime.strike(scene, foe, hero, 1)).toThrow(/a corpse does not strike/);
    const healed = runtime.healCombatant(scene, foe, 4);
    expect(healed.revived).toBe(true);
    expect(healed.health).toBe(4);
    expect(runtime.getCombatant(scene, foe)!.aiState).toBe('idle');
    expect(runtime.healCombatant(scene, foe, 4).revived).toBe(false);
  });

  it('a heal at full health answers zero rather than refusing, and clamps at the maximum', () => {
    runtime.attachCombatant(scene, hero, { health: 20, maxHealth: 30 });
    const clamped = runtime.healCombatant(scene, hero, 40);
    expect(clamped.healed).toBe(10);
    expect(clamped.health).toBe(30);
    const full = runtime.healCombatant(scene, hero, 5);
    expect(full.healed).toBe(0);
    expect(full.revived).toBe(false);
    expect(full.health).toBe(30);
  });

  it('an entity that leaves the scene takes its record with it', () => {
    runtime.attachCombatant(scene, hero);
    const orphaned: unknown[] = [];
    runtime.addEventListener('combatantOrphaned', (payload: unknown) => orphaned.push(payload));
    expect(runtime.removeEntity(scene, hero)).toBe(true);
    expect(runtime.getCombatant(scene, hero)).toBeUndefined();
    expect(orphaned).toEqual([{ entityId: hero }]);
  });

  it('and a body that leaves by another route is dropped at the next question, not handed back', () => {
    runtime.attachCombatant(scene, hero);
    const orphaned: unknown[] = [];
    runtime.addEventListener('combatantOrphaned', (payload: unknown) => orphaned.push(payload));
    // removeEntity is the supported route and it cleans up eagerly. The scene graph this runtime hands out is
    // LIVE, so a caller can take a body out without going through it — and a record must not survive that as
    // a record about nothing, which is the same reason resolveNpc drops its own orphans on the way out.
    runtime.getSceneGraph().scenes.get(scene)!.entities.delete(hero);
    expect(runtime.getCombatant(scene, hero)).toBeUndefined();
    expect(orphaned).toEqual([{ entityId: hero }]);
  });

  it('every operation says so on the event bus, with the report it returned', () => {
    const seen: Record<string, unknown[]> = {};
    for (const name of ['combatantAttached', 'combatantDamaged', 'combatantDied', 'combatantHealed', 'combatantDetached']) {
      runtime.addEventListener(name, (payload: unknown) => {
        seen[name] = [...(seen[name] ?? []), payload];
      });
    }
    runtime.attachCombatant(scene, hero, { attackPower: 4 });
    runtime.attachCombatant(scene, foe, { health: 4, maxHealth: 4 });
    const hit = runtime.strike(scene, hero, foe);
    expect(seen.combatantDamaged).toEqual([hit]);
    expect(seen.combatantDied).toEqual([hit]);
    runtime.healCombatant(scene, foe, 2);
    runtime.detachCombatant(hero);
    expect(seen.combatantAttached).toHaveLength(2);
    expect(seen.combatantHealed).toHaveLength(1);
    expect(seen.combatantDetached).toHaveLength(1);
  });
});

describe('the audit and the declared type are the same set (read from types.ts)', () => {
  const typesSource = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

  /** The field names of one exported interface, taken from the file that DECLARES them. */
  function declaredFields(name: string): string[] {
    const opener = new RegExp(`export interface ${name} \\{`);
    const match = opener.exec(typesSource);
    if (!match) throw new Error(`${name} is no longer declared in src/types.ts`);
    const lines = typesSource.slice(match.index + match[0].length).split('\n');
    const fields: string[] = [];
    for (const line of lines) {
      if (line.startsWith('}')) break;
      const field = /^\s*([A-Za-z_$][\w$]*)\??:\s/.exec(line);
      if (field && !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//')) fields.push(field[1]);
    }
    return fields;
  }

  it('reads the real field list out of the artifact', () => {
    expect(declaredFields('CombatEntity').sort()).toEqual([
      'aiState', 'armor', 'attackPower', 'attackRange', 'attackSpeed', 'attackType', 'cooldowns',
      'entityId', 'faction', 'health', 'maxHealth', 'statusEffects', 'target',
    ]);
  });

  it('consulted and unhonored partition every declared field, with no overlap and no gap', () => {
    runtime.attachCombatant(scene, hero);
    const audit = runtime.combatFieldAudit(scene, hero)!;
    const named = [...audit.consulted, ...audit.unhonored.map((row) => row.field)];
    expect(declaredFields('CombatEntity').sort()).toEqual(named.sort());
    expect(new Set(named).size).toBe(named.length);
  });

  it('names every field no code path consults, and answers undefined for a body with no record', () => {
    runtime.attachCombatant(scene, hero);
    const audit = runtime.combatFieldAudit(scene, hero)!;
    expect(audit.declared).toBe(true);
    expect(audit.consulted).toEqual(['aiState', 'armor', 'attackPower', 'entityId', 'health', 'maxHealth']);
    expect(audit.unhonored.map((row) => row.field)).toEqual([
      'attackRange', 'attackSpeed', 'attackType', 'cooldowns', 'faction', 'statusEffects', 'target',
    ]);
    for (const row of audit.unhonored) expect(row.reason.length).toBeGreaterThan(20);
    expect(runtime.combatFieldAudit(scene, foe)).toBeUndefined();
  });
});