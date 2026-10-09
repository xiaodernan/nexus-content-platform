import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { createThreeRuntime, type ThreeRuntime } from '../src/index.js';
import type { CharacterController, EntityId, SceneId } from '../src/types.js';
import { entityId as eid, sceneId as sid } from '../src/types.js';
import { createHeadlessBackend, manualFrameScheduler, type HeadlessBackend } from '../src/renderBackend.js';

/**
 * M5 v114: `CharacterController` and `ControllerInput` were declared in `types.ts` and read by
 * NOTHING — `updateControllers` was a comment saying so. These cases drive the integrator with an
 * EXACT delta and pin what each declared field does; the last section then names, by list, the
 * declared fields it still does not touch, and proves the list is not decoration.
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

const DT = 0.1;

let runtime: ThreeRuntime;
let scene: SceneId;
let hero: EntityId;

/** Build a scene with one camera and one entity at `start`, and remember them. */
function world(start = new THREE.Vector3(0, 0, 0)): ThreeRuntime {
  runtime = createThreeRuntime({}, { backend: (_canvas, cfg) => createHeadlessBackend(cfg) });
  runtime.initialize(mockCanvas);
  const created = runtime.createScene('World');
  scene = created.id;
  runtime.setActiveScene(created.id);
  runtime.createCamera(created.id, 'Main');
  hero = runtime.createEntity(created.id, 'Hero', 'mesh', undefined, undefined, start).id;
  return runtime;
}

/** Patch input, run `frames` exact frames, and hand back where the entity ended up. */
function advance(frames: number, input: Partial<CharacterController['input']> = {}, delta = DT): THREE.Vector3 {
  if (Object.keys(input).length > 0) expect(runtime.setControllerInput(hero, input)).toBe(true);
  for (let i = 0; i < frames; i += 1) runtime.simulateFrame(delta);
  return position();
}

function position(): THREE.Vector3 {
  return runtime.getEntity(scene, hero)!.threeObject.position.clone();
}

beforeEach(() => {
  world();
});

afterEach(() => {
  runtime.dispose();
});

describe('attaching a controller', () => {
  it('fills every field CharacterController declares, echoing what the caller named', () => {
    const c = runtime.attachController(scene, hero, { speed: 3.5, type: 'topDown' });
    expect(Object.keys(c).sort()).toEqual([
      'airControl', 'entityId', 'gravity', 'grounded', 'input', 'jumpForce', 'runSpeed',
      'slopeLimit', 'speed', 'state', 'stepOffset', 'type', 'velocity',
    ]);
    expect(c.entityId).toBe(hero);
    expect(c.type).toBe('topDown');
    expect(c.speed).toBe(3.5);
    expect(c.state).toBe('idle');
    expect(c.velocity).toBeInstanceOf(THREE.Vector3);
    expect(c.input.custom).toEqual({});
  });

  it('reads `grounded` from the position instead of assuming the entity is standing', () => {
    expect(runtime.attachController(scene, hero).grounded).toBe(true);
    world(new THREE.Vector3(0, 5, 0));
    expect(runtime.attachController(scene, hero).grounded).toBe(false);
  });

  it('refuses an unknown scene, and names it', () => {
    expect(() => runtime.attachController(sid('no-such-scene'), hero)).toThrow(/no-such-scene/);
  });

  it('refuses an entity that is not in the scene it was named with', () => {
    expect(() => runtime.attachController(scene, eid('no-such-entity'))).toThrow(/no-such-entity/);
  });

  it('refuses a second controller on one entity and leaves the first one working', () => {
    const first = runtime.attachController(scene, hero, { speed: 2 });
    runtime.setControllerInput(hero, { moveLeft: true });
    expect(() => runtime.attachController(scene, hero, { speed: 900 })).toThrow(/detachController/);
    const still = runtime.getController(hero)!;
    expect(still).toBe(first);
    expect(still.speed).toBe(2);
    expect(still.input.moveLeft).toBe(true);
  });

  it('answers nothing, in every direction, for an entity that never had one', () => {
    expect(runtime.getController(eid('never'))).toBeUndefined();
    expect(runtime.setControllerInput(eid('never'), { jump: true })).toBe(false);
    expect(runtime.detachController(eid('never'))).toBe(false);
    expect(runtime.controllerFieldAudit(eid('never'))).toBeUndefined();
  });
});

describe('horizontal movement', () => {
  beforeEach(() => {
    runtime.attachController(scene, hero, { speed: 4, runSpeed: 8, airControl: 1 });
  });

  it('forward walks -Z at `speed`: distance is frames x speed x delta', () => {
    const p = advance(10, { moveForward: true });
    expect(p.z).toBeCloseTo(-4, 10);
    expect(p.x).toBeCloseTo(0, 10);
    expect(p.y).toBe(0);
  });

  it('run uses `runSpeed`, not `speed`', () => {
    expect(advance(10, { moveForward: true, run: true }).z).toBeCloseTo(-8, 10);
  });

  it('backward, right and left each own their half of an axis', () => {
    expect(advance(10, { moveBackward: true }).z).toBeCloseTo(4, 10);
  });

  it('right is +X and left is -X', () => {
    expect(advance(10, { moveRight: true }).x).toBeCloseTo(4, 10);
    world();
    runtime.attachController(scene, hero, { speed: 4, airControl: 1 });
    expect(advance(10, { moveLeft: true }).x).toBeCloseTo(-4, 10);
  });

  it('a diagonal travels the SAME distance as a cardinal direction, not sqrt(2) of it', () => {
    const p = advance(1, { moveForward: true, moveRight: true });
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(0.4, 10);
    expect(p.x).toBeCloseTo(0.4 / Math.SQRT2, 10);
    expect(p.z).toBeCloseTo(-0.4 / Math.SQRT2, 10);
  });

  it('opposite inputs cancel instead of one of them winning', () => {
    const p = advance(10, { moveForward: true, moveBackward: true, moveLeft: true, moveRight: true });
    expect(p.x).toBe(0);
    expect(p.z).toBe(0);
  });

  it('airborne movement is scaled by `airControl`', () => {
    world(new THREE.Vector3(0, 5, 0));
    runtime.attachController(scene, hero, { speed: 4, airControl: 0.25, gravity: 0 });
    expect(advance(1, { moveForward: true }).z).toBeCloseTo(-4 * 0.25 * DT, 10);
  });

  it('writes through the position vector the entity already handed out, so no holder is left behind', () => {
    const entity = runtime.getEntity(scene, hero)!;
    const held = entity.transform.position;
    advance(3, { moveForward: true });
    expect(entity.transform.position).toBe(held);
    expect(entity.threeObject.position).toBe(held);
    expect(held.z).toBeCloseTo(-1.2, 10);
    // The matrix is rebuilt from that same position, so a renderer following the object sees the move.
    expect(entity.threeObject.matrix.elements[14]).toBeCloseTo(-1.2, 10);
  });
});

describe('jump, gravity and the ground plane', () => {
  it('a jump sets velocity to jumpForce on its own frame and gravity does not tax that frame', () => {
    const c = runtime.attachController(scene, hero, { speed: 0, jumpForce: 10, gravity: 10 });
    advance(1, { jump: true });
    expect(c.velocity.y).toBe(10);
    expect(c.grounded).toBe(false);
    expect(c.state).toBe('jump');
    advance(1, {});
    expect(c.velocity.y).toBeCloseTo(10 - 10 * DT, 10);
  });

  it('jump is refused in mid-air, where gravity keeps its hold on velocity', () => {
    world(new THREE.Vector3(0, 5, 0));
    const c = runtime.attachController(scene, hero, { gravity: 10, jumpForce: 10 });
    advance(1, { jump: true });
    expect(c.velocity.y).toBeCloseTo(-10 * DT, 10);
    expect(c.state).toBe('fall');
  });

  it('landing clamps to the ground exactly, zeroes vertical velocity and re-grounds', () => {
    const c = runtime.attachController(scene, hero, { speed: 0, jumpForce: 5, gravity: 10 });
    advance(1, { jump: true });
    for (let i = 0; i < 500 && !c.grounded; i += 1) runtime.simulateFrame(DT);
    expect(c.grounded).toBe(true);
    expect(position().y).toBe(0);
    expect(c.velocity.y).toBe(0);
    expect(c.state).toBe('idle');
  });

  it('a raised ground plane stops the fall at ITS height', () => {
    world(new THREE.Vector3(0, 10, 0));
    const c = runtime.attachController(scene, hero, { speed: 0, gravity: 10, groundY: 2 });
    for (let i = 0; i < 500 && !c.grounded; i += 1) runtime.simulateFrame(DT);
    expect(position().y).toBe(2);
  });

  it('gravity is what makes a fall fall: two declared values give two trajectories', () => {
    world(new THREE.Vector3(0, 20, 0));
    runtime.attachController(scene, hero, { gravity: 20, groundY: -1000 });
    const heavy = advance(2).y;
    world(new THREE.Vector3(0, 20, 0));
    runtime.attachController(scene, hero, { gravity: 5, groundY: -1000 });
    const light = advance(2).y;
    // frame 1 leaves vy = -g*dt, frame 2 leaves -2g*dt, so y = y0 - 3*g*dt^2 for both.
    expect(heavy).toBeCloseTo(20 - 3 * 20 * DT * DT, 10);
    expect(light).toBeCloseTo(20 - 3 * 5 * DT * DT, 10);
    expect(heavy).not.toBe(light);
  });

  it('velocity is an input as well as an output: a caller-set rise is integrated, not reset', () => {
    const c = runtime.attachController(scene, hero, { gravity: 0, groundY: -1000 });
    c.velocity.y = 3;
    expect(advance(1).y).toBeCloseTo(0.3, 10);
    expect(c.velocity.y).toBe(3);
  });

  it('a zero delta moves nothing but still lets a jump claim the air', () => {
    const c = runtime.attachController(scene, hero, { jumpForce: 7, gravity: 10 });
    advance(1, { jump: true }, 0);
    expect(position().y).toBe(0);
    expect(c.velocity.y).toBe(7);
    expect(c.grounded).toBe(false);
  });
});

describe('the declared state machine', () => {
  it('walks idle, walk, run, crouch, jump, fall and back, one transition per frame', () => {
    const c = runtime.attachController(scene, hero, { speed: 4, runSpeed: 8, jumpForce: 5, gravity: 10 });
    advance(1);
    expect(c.state).toBe('idle');
    advance(1, { moveForward: true });
    expect(c.state).toBe('walk');
    advance(1, { run: true });
    expect(c.state).toBe('run');
    advance(1, { run: false, moveForward: false, crouch: true });
    expect(c.state).toBe('crouch');
    advance(1, { crouch: false, jump: true });
    expect(c.state).toBe('jump');
    advance(1, { jump: false });
    expect(c.state).toBe('jump'); // still rising
    do {
      runtime.simulateFrame(DT);
    } while (c.velocity.y > 0);
    expect(c.state).toBe('fall');
    for (let i = 0; i < 500 && !c.grounded; i += 1) runtime.simulateFrame(DT);
    advance(1, {});
    expect(c.state).toBe('idle');
  });

  it('crouch is a grounded state: mid-air it cannot mask the fall', () => {
    world(new THREE.Vector3(0, 5, 0));
    const c = runtime.attachController(scene, hero, { gravity: 10 });
    advance(1, { crouch: true });
    expect(c.grounded).toBe(false);
    expect(c.state).toBe('fall');
  });

  it('type `custom` leaves the state to its owner and still moves the entity', () => {
    const c = runtime.attachController(scene, hero, { type: 'custom', speed: 4, airControl: 1 });
    c.state = 'crouch';
    advance(5, { moveForward: true });
    expect(c.state).toBe('crouch');
    expect(position().z).toBeCloseTo(-2, 10);
  });
});

describe('whose frame: planes, cameras and scenes', () => {
  it('firstPerson steers by the ACTIVE camera yaw and stays on the ground plane', () => {
    const three = runtime.getScene(scene)!.cameras.values().next().value!.threeCamera;
    three.rotation.y = Math.PI / 2;
    const c = runtime.attachController(scene, hero, { speed: 4, type: 'firstPerson' });
    const p = advance(10, { moveForward: true });
    expect(p.x).toBeCloseTo(-4, 10);
    expect(p.z).toBeCloseTo(0, 10);
    expect(p.y).toBe(0);
    expect(c.grounded).toBe(true);
  });

  it('topDown reads the same keys as world axes and ignores the camera entirely', () => {
    const three = runtime.getScene(scene)!.cameras.values().next().value!.threeCamera;
    three.rotation.y = Math.PI / 2;
    runtime.attachController(scene, hero, { speed: 4, type: 'topDown' });
    const p = advance(10, { moveForward: true });
    expect(p.z).toBeCloseTo(-4, 10);
    expect(p.x).toBeCloseTo(0, 10);
  });

  it('sideScroll lives in XY, so its forward key has nothing to push against', () => {
    const c = runtime.attachController(scene, hero, { speed: 4, type: 'sideScroll', gravity: 10, jumpForce: 6 });
    advance(10, { moveForward: true });
    expect(position().x).toBe(0);
    expect(position().z).toBe(0);
    advance(10, { moveForward: false, moveRight: true });
    expect(position().x).toBeCloseTo(4, 10);
    advance(1, { moveRight: false, jump: true });
    expect(c.state).toBe('jump');
    for (let i = 0; i < 500 && !c.grounded; i += 1) runtime.simulateFrame(DT);
    expect(position().z).toBe(0);
    expect(c.grounded).toBe(true);
  });

  it('only the ACTIVE scene moves, and switching back resumes it', () => {
    const c = runtime.attachController(scene, hero, { speed: 4 });
    const other = runtime.createScene('Other');
    runtime.setActiveScene(other.id);
    advance(10, { moveForward: true });
    expect(position().z).toBe(0);
    expect(c.grounded).toBe(true);
    runtime.setActiveScene(scene);
    advance(1, {});
    expect(position().z).toBeCloseTo(-0.4, 10);
  });
});

describe('the registry, not just the math', () => {
  it('detach stops the movement and answers only once', () => {
    const c = runtime.attachController(scene, hero, { speed: 4 });
    advance(1, { moveForward: true });
    expect(runtime.detachController(hero)).toBe(true);
    expect(runtime.detachController(hero)).toBe(false);
    expect(runtime.getController(hero)).toBeUndefined();
    const before = position().z;
    expect(runtime.setControllerInput(hero, { moveForward: true })).toBe(false);
    runtime.simulateFrame(DT);
    expect(position().z).toBe(before);
    expect(c.input.moveForward).toBe(true); // the object the caller holds is inert, not rewired
  });

  it('an entity removed from a scene drops its controller and says so by id', () => {
    runtime.attachController(scene, hero);
    const events: unknown[] = [];
    runtime.addEventListener('controllerOrphaned', (e: unknown) => events.push(e));
    expect(runtime.removeEntity(scene, hero)).toBe(true);
    expect(runtime.getController(hero)).toBeUndefined();
    expect(events).toEqual([{ entityId: hero }]);
    expect(runtime.detachController(hero)).toBe(false);
  });

  it('dispose empties the registry without calling anything orphaned', () => {
    runtime.attachController(scene, hero);
    const events: unknown[] = [];
    runtime.addEventListener('controllerOrphaned', (e: unknown) => events.push(e));
    runtime.dispose();
    expect(events).toEqual([]);
    expect(runtime.getController(hero)).toBeUndefined();
    runtime = createThreeRuntime({}, { backend: (_c, cfg) => createHeadlessBackend(cfg) });
  });

  it('setControllerInput patches only the flags the caller named', () => {
    const c = runtime.attachController(scene, hero);
    runtime.setControllerInput(hero, { moveForward: true, custom: { fire: true } });
    expect(c.input.moveForward).toBe(true);
    expect(c.input.run).toBe(false);
    expect(c.input.custom).toEqual({ fire: true });
    runtime.setControllerInput(hero, { run: true });
    expect(c.input.moveForward).toBe(true);
    expect(c.input.custom).toEqual({ fire: true });
  });
});

describe('what the integrator admits not touching', () => {
  it('names the fields it consults, the ones it writes, and the ones it does neither — from the object', () => {
    runtime.attachController(scene, hero);
    const audit = runtime.controllerFieldAudit(hero)!;
    expect(audit.consulted).toEqual(['airControl', 'entityId', 'gravity', 'grounded', 'input', 'jumpForce', 'runSpeed', 'speed', 'type']);
    expect(audit.written).toEqual(['grounded', 'state', 'velocity']);
    expect(audit.untouched).toEqual(['slopeLimit', 'stepOffset']);
    expect(audit.input.consulted).toEqual(['crouch', 'jump', 'moveBackward', 'moveForward', 'moveLeft', 'moveRight', 'run']);
    expect(audit.input.untouched).toEqual(['custom']);
  });

  it('sideScroll reports forward and backward as untouched, because its plane has no use for them', () => {
    runtime.attachController(scene, hero, { type: 'sideScroll' });
    const audit = runtime.controllerFieldAudit(hero)!;
    expect(audit.input.consulted).toEqual(['crouch', 'jump', 'moveLeft', 'moveRight', 'run']);
    expect(audit.input.untouched).toEqual(['custom', 'moveBackward', 'moveForward']);
  });

  it('a field the type does not declare yet still shows up as untouched, so the list cannot go stale quietly', () => {
    const c = runtime.attachController(scene, hero);
    (c as unknown as Record<string, unknown>).hoverHeight = 3;
    expect(runtime.controllerFieldAudit(hero)!.untouched).toContain('hoverHeight');
  });

  it('and untouched is not a lie: changing those two fields cannot change the trajectory', () => {
    const run = (slopeLimit: number, stepOffset: number): number[] => {
      world(new THREE.Vector3(0, 3, 0));
      runtime.attachController(scene, hero, { speed: 6, gravity: 12, jumpForce: 4, slopeLimit, stepOffset });
      runtime.setControllerInput(hero, { moveForward: true, moveRight: true, jump: true });
      const path: number[] = [];
      for (let i = 0; i < 30; i += 1) {
        runtime.simulateFrame(DT);
        if (i === 2) runtime.setControllerInput(hero, { jump: false });
        const p = position();
        path.push(p.x, p.y, p.z);
      }
      return path;
    };
    const declared = run(45, 0.3);
    expect(declared.some((v) => v !== 0)).toBe(true); // the frame moved, so the two arms below mean something
    expect(run(0, 0)).toEqual(declared);
    expect(run(1_000_000, 1_000_000)).toEqual(declared);
  });

  it('while a field it does consult does change it — `speed`, the cheapest one to prove', () => {
    const run = (speed: number): number[] => {
      world();
      runtime.attachController(scene, hero, { speed, airControl: 1 });
      advance(5, { moveForward: true });
      const p = position();
      return [p.x, p.y, p.z];
    };
    expect(run(1)).not.toEqual(run(2));
    expect(runtime.controllerFieldAudit(hero)!.consulted).toContain('speed');
  });
});

describe('the real frame loop reaches the controller', () => {
  it('start() plus a manual stepper moves the character, so simulateFrame is not a parallel copy', () => {
    let backend: HeadlessBackend | null = null;
    const scheduler = manualFrameScheduler();
    const loop = createThreeRuntime({}, {
      backend: (_canvas, cfg) => (backend = createHeadlessBackend(cfg)),
      scheduler,
    });
    loop.initialize(mockCanvas);
    const scene2 = loop.createScene('Loop');
    loop.setActiveScene(scene2.id);
    const camera = loop.createCamera(scene2.id, 'Main');
    loop.setActiveCamera(scene2.id, camera.id);
    const walker = loop.createEntity(scene2.id, 'Walker', 'mesh', undefined, undefined, new THREE.Vector3());
    loop.attachController(scene2.id, walker.id, { speed: 4 });
    loop.setControllerInput(walker.id, { moveForward: true });
    loop.start();
    for (let i = 0; i < 5; i += 1) scheduler.step();
    loop.stop();
    // The loop supplies a WALL-CLOCK delta, so only the direction is pinned here; every exact number
    // elsewhere in this file comes from simulateFrame, which is the same path animate() takes.
    expect(walker.threeObject.position.z).toBeLessThan(0);
    expect(walker.threeObject.position.y).toBe(0); // gravity had its chance in every frame and held
    expect(backend!.frames.length).toBeGreaterThan(1);
    loop.dispose();
  });

  it('a frame with no scene, no controller or no active scene is a no-op rather than a throw', () => {
    const frames: unknown[] = [];
    runtime.addEventListener('frame', (e: unknown) => frames.push(e));
    expect(() => runtime.simulateFrame(DT)).not.toThrow();
    runtime.attachController(scene, hero);
    expect(runtime.setActiveScene(sid('nope'))).toBe(false);
    expect(() => runtime.simulateFrame(DT)).not.toThrow();
    const spare = createThreeRuntime({}, { backend: (_c, cfg) => createHeadlessBackend(cfg) });
    expect(() => spare.simulateFrame(DT)).not.toThrow(); // a runtime with no scenes at all
    expect(frames).toEqual([]); // simulateFrame does not claim a frame was drawn
    spare.dispose();
  });
});
