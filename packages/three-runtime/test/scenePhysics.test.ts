import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createThreeRuntime, type ThreeRuntime } from '../src/threeRuntime.js';
import { DEFAULT_CONTROLLER } from '../src/threeRuntime.js';
import type { EntityId, SceneId } from '../src/types.js';
import { createHeadlessBackend } from '../src/renderBackend.js';

/**
 * M5 v116: `PhysicsConfig` and `ThreeScene.physics` were declared in `types.ts` and read by NOTHING —
 * `updatePhysics` was a comment saying so, and the integrator took its gravity from a package-level default
 * no scene could change. This suite gives the declared world three real readers: a validating setter, the
 * frame loop (world gravity reaching the characters that did not choose their own, and `timeStep` /
 * `maxSubSteps` deciding how many slices a frame integrates), and `physicsFieldAudit`, which names the
 * declared fields the package still cannot honor and is checked against `src/types.ts` so a newly declared
 * field cannot join the silent ones.
 *
 * Where a claim is about the INTEGRATION (substepping), the expected numbers come from running the same
 * production code twice, never from restating its arithmetic here.
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

/** A scene with one airborne mesh, so gravity has something to pull. `groundY: -1000` keeps it falling. */
function fallingWorld(attachOptions: Parameters<ThreeRuntime['attachController']>[2] = {}): THREE.Vector3 {
  runtime = createThreeRuntime({}, { backend: (_canvas, cfg) => createHeadlessBackend(cfg) });
  runtime.initialize(mockCanvas);
  const created = runtime.createScene('World');
  scene = created.id;
  runtime.setActiveScene(created.id);
  hero = runtime.createEntity(created.id, 'Hero', 'mesh').id;
  runtime.attachController(scene, hero, { speed: 0, groundY: -1000, ...attachOptions });
  return runtime.getEntity(scene, hero)!.threeObject.position;
}

const y = () => runtime.getEntity(scene, hero)!.threeObject.position.y;
const declared = (over: Partial<Parameters<ThreeRuntime['setScenePhysics']>[1]> = {}) =>
  runtime.setScenePhysics(scene, {
    gravity: new THREE.Vector3(0, -9.81, 0),
    timeStep: 1 / 60,
    maxSubSteps: 4,
    broadphase: 'sap',
    solverIterations: 10,
    ...over,
  });

beforeEach(() => {
  // Every case starts from the same airborne mesh, because `setScenePhysics` and `physicsFieldAudit` both
  // answer about a scene that exists; the validation cases below need a real scene to refuse against.
  fallingWorld();
});

afterEach(() => {
  runtime?.dispose();
});

describe('setScenePhysics — a declared world is validated by the code that has to read it', () => {
  it('refuses an upward gravity and names the number it was given', () => {
    expect(() => declared({ gravity: new THREE.Vector3(0, 9.81, 0) })).toThrow(/gravity\.y is 9\.81/);
  });

  it('refuses a NaN gravity instead of defaulting it', () => {
    expect(() => declared({ gravity: new THREE.Vector3(0, NaN, 0) })).toThrow(/gravity\.y is NaN/);
  });

  it('accepts a zero-G world: the refusal is about the sign, not about whether the world falls', () => {
    expect(declared({ gravity: new THREE.Vector3(0, 0, 0) }).gravity.y).toBe(0);
    expect(runtime.physicsFieldAudit(scene)!.effectiveGravity).toBeCloseTo(0, 12);
  });

  it('refuses horizontal gravity by name, because a scalar controller gravity cannot carry it', () => {
    expect(() => declared({ gravity: new THREE.Vector3(2, -9.81, 0) })).toThrow(/horizontal components \(2, 0\)/);
    expect(() => declared({ gravity: new THREE.Vector3(0, -9.81, -3) })).toThrow(/horizontal components \(0, -3\)/);
  });

  it('refuses a timeStep that is not a positive number of seconds', () => {
    expect(() => declared({ timeStep: 0 })).toThrow(/timeStep is the fixed slice/);
    expect(() => declared({ timeStep: -1 })).toThrow(/timeStep is the fixed slice/);
    expect(() => declared({ timeStep: NaN })).toThrow(/timeStep is the fixed slice/);
  });

  it('refuses a maxSubSteps below 1 or not a whole number', () => {
    expect(() => declared({ maxSubSteps: 0 })).toThrow(/maxSubSteps bounds how many fixed slices/);
    expect(() => declared({ maxSubSteps: 1.5 })).toThrow(/maxSubSteps bounds how many fixed slices/);
  });

  it('refuses an unknown scene and names it', () => {
    expect(() => runtime.setScenePhysics('no-such-scene' as SceneId, {
      gravity: new THREE.Vector3(0, -9.81, 0), timeStep: 1 / 60, maxSubSteps: 4, broadphase: 'grid', solverIterations: 6,
    })).toThrow(/setScenePhysics: scene no-such-scene does not exist/);
  });

  it('stores a CLONE of the gravity vector, so the caller moving theirs later does not move the world', () => {
    const g = new THREE.Vector3(0, -12, 0);
    declared({ gravity: g });
    g.set(0, -100, 0);
    expect(runtime.physicsFieldAudit(scene)!.effectiveGravity).toBe(12);
  });

  it('hands back the scene’s OWN config object, which is the documented way to see what was stored', () => {
    fallingWorld();
    const stored = declared();
    expect(runtime.getScene(scene)!.physics).toBe(stored);
    expect(stored.broadphase).toBe('sap');
  });
});

describe('the world’s pull reaches the characters that did not choose their own', () => {
  it('a controller with no declared gravity takes the scene’s, on the frame the world is read', () => {
    // The world is consulted by the frame loop, not by the setter: ONE mechanism writes this number, so a
    // caller who declared the world at attach time and a caller who declared it later both get it, and
    // neither gets a second, silently different update path.
    fallingWorld();
    expect(runtime.getController(hero)!.gravity).toBe(DEFAULT_CONTROLLER.gravity);
    declared({ gravity: new THREE.Vector3(0, -12, 0) });
    runtime.simulateFrame(1 / 60);
    expect(runtime.getController(hero)!.gravity).toBe(12);
  });

  it('reads the world that was already declared when the controller was attached', () => {
    fallingWorld();
    declared({ gravity: new THREE.Vector3(0, -3.7, 0) });
    runtime.detachController(hero);
    runtime.attachController(scene, hero, { speed: 0, groundY: -1000 });
    expect(runtime.getController(hero)!.gravity).toBeCloseTo(3.7, 12);
  });

  it('a gravity the caller named is NOT overwritten by the world', () => {
    fallingWorld({ gravity: 3 });
    declared({ gravity: new THREE.Vector3(0, -20, 0) });
    runtime.simulateFrame(0.1);
    expect(runtime.getController(hero)!.gravity).toBe(3);
  });

  it('changing the world between frames changes the fall, which is why it is declared on the scene', () => {
    fallingWorld();
    declared({ gravity: new THREE.Vector3(0, -10, 0), timeStep: 0.5, maxSubSteps: 1 });
    runtime.simulateFrame(0.5);
    const gentle = -y();
    declared({ gravity: new THREE.Vector3(0, -40, 0), timeStep: 0.5, maxSubSteps: 1 });
    runtime.simulateFrame(0.5);
    const strong = -y() - gentle;
    expect(gentle).toBeGreaterThan(0);
    expect(strong).toBeGreaterThan(gentle);
  });

  it('a controller in a DORMANT scene keeps its own number: the active world is not the dormant world’s', () => {
    fallingWorld();
    const other = runtime.createScene('Dormant');
    const otherHero = runtime.createEntity(other.id, 'Other', 'mesh').id;
    runtime.attachController(other.id, otherHero, { speed: 0, groundY: -1000 });
    declared({ gravity: new THREE.Vector3(0, -12, 0) });
    runtime.simulateFrame(0.1);
    expect(runtime.getController(otherHero)!.gravity).toBe(DEFAULT_CONTROLLER.gravity);
  });

  it('a scene that declares no world keeps the v114 path: the package default', () => {
    fallingWorld();
    runtime.simulateFrame(0.1);
    expect(runtime.getController(hero)!.gravity).toBe(DEFAULT_CONTROLLER.gravity);
    expect(runtime.physicsFieldAudit(scene)!.declared).toBe(false);
  });
});

describe('timeStep and maxSubSteps are read by the code that integrates', () => {
  it('one frame of 1.0 in a 0.5-step world lands exactly where two frames of 0.5 land with no world at all', () => {
    fallingWorld();
    declared({ gravity: new THREE.Vector3(0, -9.81, 0), timeStep: 0.5, maxSubSteps: 4 });
    runtime.simulateFrame(1.0);
    const substepped = y();
    fallingWorld();
    runtime.simulateFrame(0.5);
    runtime.simulateFrame(0.5);
    expect(substepped).toBeCloseTo(y(), 12);
  });

  it('and the slices really are smaller steps: the substepped fall is SHORTER than one big slice of the same second', () => {
    fallingWorld();
    declared({ gravity: new THREE.Vector3(0, -9.81, 0), timeStep: 0.5, maxSubSteps: 4 });
    runtime.simulateFrame(1.0);
    const substeppedDrop = -y();
    fallingWorld();
    runtime.simulateFrame(1.0);
    expect(substeppedDrop).toBeLessThan(-y());
  });

  it('a frame too short for one slice integrates nothing and keeps the time', () => {
    fallingWorld();
    declared({ gravity: new THREE.Vector3(0, -9.81, 0), timeStep: 0.5, maxSubSteps: 4 });
    runtime.simulateFrame(0.1);
    expect(runtime.physicsFieldAudit(scene)!.stepping.lastFrame).toEqual({ steps: 0, droppedTime: 0 });
    expect(y()).toBe(0);
    runtime.simulateFrame(0.4);
    expect(runtime.physicsFieldAudit(scene)!.stepping.lastFrame!.steps).toBe(1);
    expect(y()).toBeLessThan(0);
  });

  it('the cap refuses slices and says how many seconds it refused', () => {
    fallingWorld();
    declared({ gravity: new THREE.Vector3(0, -9.81, 0), timeStep: 0.5, maxSubSteps: 1 });
    runtime.simulateFrame(1.0);
    expect(runtime.physicsFieldAudit(scene)!.stepping.lastFrame).toEqual({ steps: 1, droppedTime: 0 });
    runtime.simulateFrame(1.0);
    expect(runtime.physicsFieldAudit(scene)!.stepping.lastFrame).toEqual({ steps: 1, droppedTime: 0.5 });
  });

  it('a sustained overload never grows its step count, so a stutter cannot become a teleport', () => {
    fallingWorld();
    declared({ gravity: new THREE.Vector3(0, -9.81, 0), timeStep: 0.5, maxSubSteps: 2 });
    const seen: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      runtime.simulateFrame(2.0);
      seen.push(runtime.physicsFieldAudit(scene)!.stepping.lastFrame!.steps);
    }
    expect(seen).toEqual([2, 2, 2, 2, 2]);
  });

  it('re-declaring the world clears the old backlog instead of spending it on the new step size', () => {
    fallingWorld();
    declared({ gravity: new THREE.Vector3(0, -9.81, 0), timeStep: 0.25, maxSubSteps: 4 });
    runtime.simulateFrame(0.9); // 3 slices, 0.15s left over
    expect(runtime.physicsFieldAudit(scene)!.stepping.lastFrame!.steps).toBe(3);
    declared({ gravity: new THREE.Vector3(0, -9.81, 0), timeStep: 0.5, maxSubSteps: 4 });
    runtime.simulateFrame(0.4); // 0.4 alone is not one 0.5 slice; the cleared backlog means 0 steps
    expect(runtime.physicsFieldAudit(scene)!.stepping.lastFrame!.steps).toBe(0);
  });
});

describe('physicsFieldAudit names what a declared world still cannot buy', () => {
  it('is undefined for a scene that does not exist', () => {
    fallingWorld();
    expect(runtime.physicsFieldAudit('nope' as SceneId)).toBeUndefined();
  });

  it('reports an undeclared world as undeclared, with the default it falls back to', () => {
    fallingWorld();
    expect(runtime.physicsFieldAudit(scene)).toEqual({
      declared: false,
      consulted: [],
      unhonored: [],
      effectiveGravity: DEFAULT_CONTROLLER.gravity,
      stepping: { timeStep: null, maxSubSteps: null, lastFrame: null },
    });
  });

  it('lists the fields it reads and gives each unread one a REASON, not just a name', () => {
    fallingWorld();
    declared();
    const audit = runtime.physicsFieldAudit(scene)!;
    expect(audit.consulted).toEqual(['gravity', 'maxSubSteps', 'timeStep']);
    expect(audit.unhonored.map((u) => u.field).sort()).toEqual(['broadphase', 'solverIterations']);
    for (const u of audit.unhonored) {
      expect(u.reason.length, `${u.field}'s reason must be a sentence`).toBeGreaterThan(20);
      expect(u.reason).not.toContain(u.field); // it must say WHY, not restate the name it was given
    }
  });

  it('follows the live world, so the answer is a reading and not a constant', () => {
    fallingWorld();
    declared({ gravity: new THREE.Vector3(0, -3, 0) });
    expect(runtime.physicsFieldAudit(scene)!.effectiveGravity).toBe(3);
    declared({ gravity: new THREE.Vector3(0, -19.6, 0) });
    expect(runtime.physicsFieldAudit(scene)!.effectiveGravity).toBeCloseTo(19.6, 12);
  });

  it('says which timeStep and maxSubSteps the last frame actually ran with', () => {
    fallingWorld();
    declared({ timeStep: 0.25, maxSubSteps: 3 });
    runtime.simulateFrame(1.0);
    expect(runtime.physicsFieldAudit(scene)!.stepping).toEqual({
      timeStep: 0.25, maxSubSteps: 3, lastFrame: { steps: 3, droppedTime: 0 },
    });
  });
});

describe('the audit and the declared type are the same set (read from types.ts)', () => {
  const typesSource = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');

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
    expect(declaredFields('PhysicsConfig').sort()).toEqual(
      ['broadphase', 'gravity', 'maxSubSteps', 'solverIterations', 'timeStep'],
    );
  });

  it('consulted and unhonored partition every declared field, with no overlap and no gap', () => {
    fallingWorld();
    declared();
    const audit = runtime.physicsFieldAudit(scene)!;
    const named = [...audit.consulted, ...audit.unhonored.map((u) => u.field)];
    expect(declaredFields('PhysicsConfig').sort()).toEqual(named.sort());
    expect(new Set(named).size).toBe(named.length);
  });

  it('and the stored gravity keeps its CLASS while being a different object from the caller’s', () => {
    fallingWorld();
    const caller = new THREE.Vector3(0, -7, 0);
    const stored = declared({ gravity: caller });
    expect(stored.gravity).toBeInstanceOf(THREE.Vector3);
    expect(stored.gravity).not.toBe(caller);
    expect(stored.gravity.y).toBe(-7);
  });
});

describe('a world that gained a reader is still not a scene that can be saved', () => {
  /**
   * v115 wrote the `sceneGraph` refusal as a one-clause sentence about lights, because at that point
   * `SerializedScene.physics` was declared and read by nothing, so naming it would have been decoration.
   * v116 gave that field a reader, which is what makes the old sentence incomplete: the same shape now
   * carries a second live object that a save would have to rebuild, and an audit that stops naming the
   * hazards when one of them becomes real is a note that lies about its own date.
   */
  it('names BOTH live objects a SerializedScene carries, not only the one that was stale when v115 wrote it', () => {
    fallingWorld();
    declared();
    const sceneGraph = runtime.saveFeasibilityAudit(scene, hero)!.blocked.find((entry) => entry.field === 'sceneGraph');
    expect(sceneGraph, 'a reader for scene.gravity does not rebuild it: sceneGraph must stay in `blocked`').toBeDefined();
    expect(sceneGraph!.needs).toContain('THREE.Light');
    expect(sceneGraph!.needs, 'v116 made PhysicsConfig.gravity a read field, so a reason naming only the lights is stale').toContain('THREE.Vector3');
  });
});
