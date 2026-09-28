import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createThreeRuntime, type ThreeRuntime } from '../src/threeRuntime.js';
import type { CameraId, CinematicShot, SceneId } from '../src/types.js';
import { createHeadlessBackend } from '../src/renderBackend.js';

/**
 * M5 v117: `CinematicSequence`, `CinematicShot` and `SerializedCinematic` were declared in `types.ts` and
 * read by NOTHING — `updateCinematics` was the last comment-shaped hole inside `simulateFrame`. This suite
 * gives them a registry that validates at the door, a player that moves a camera, a writer for the declared
 * save shape, and `cinematicFieldAudit`, which names the declared fields the package still cannot honor.
 *
 * Where a claim is about the TIMELINE (when a shot starts, where the camera is at an instant), the expected
 * numbers come from running the production code, not from restating its arithmetic here. Where a claim is
 * about a camera's aim or field of view, there is a control case that turns the mechanism off.
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
let camA: CameraId;
let camB: CameraId;

function freshScene(name = 'World'): SceneId {
  const created = runtime.createScene(name);
  runtime.setActiveScene(created.id);
  return created.id;
}

beforeEach(() => {
  runtime = createThreeRuntime({}, { backend: (_canvas, cfg) => createHeadlessBackend(cfg) });
  runtime.initialize(mockCanvas);
  scene = freshScene();
  camA = runtime.createCamera(scene, 'A').id;
  camB = runtime.createCamera(scene, 'B').id;
});

afterEach(() => {
  runtime?.dispose();
});

/** One shot with every required field named, so a case only spells out what it is about. */
function shot(over: Partial<CinematicShot> & { id: string; cameraId: CameraId }): CinematicShot {
  return { startTime: 0, endTime: 2, transition: 'cut', transitionDuration: 0, ...over };
}

const curve = (...points: [number, number, number][]) =>
  new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));

function define(over: { id?: string; shots?: CinematicShot[]; duration?: number } = {}, at: SceneId = scene) {
  return runtime.defineCinematic(at, {
    id: over.id ?? 'seq',
    name: 'A sequence',
    shots: over.shots ?? [shot({ id: 's0', cameraId: camA }), shot({ id: 's1', cameraId: camB, startTime: 2, endTime: 5 })],
    ...(over.duration === undefined ? {} : { duration: over.duration }),
  });
}

const activeOf = (id: CameraId) => runtime.getScene(scene)!.cameras.get(id)!.active;
const cameraPos = (id: CameraId) => runtime.getScene(scene)!.cameras.get(id)!.threeCamera.position;

describe('defineCinematic — a shot is validated by the player that has to read it', () => {
  it('derives the timeline from the shots and hands back the sequence the runtime owns', () => {
    const sequence = define();
    expect(sequence.duration).toBe(5);
    expect(sequence.playing).toBe(false);
    expect(runtime.cinematicFieldAudit('seq')!.playhead.duration).toBe(5);
  });

  it('accepts a declared duration that agrees with the shots, and refuses one that does not', () => {
    expect(define({ duration: 5 }).duration).toBe(5);
    expect(() => define({ id: 'disagrees', duration: 9 })).toThrow(/duration is declared 9 but the shots run to 5/);
  });

  it('refuses a second sequence under a taken id, and says so in those words', () => {
    define();
    expect(() => define()).toThrow(/named seq is already registered/);
  });

  it('refuses an empty shot list and a sequence that does not open at playhead 0', () => {
    expect(() => define({ shots: [] })).toThrow(/no shots has no timeline to play/);
    expect(() => define({ shots: [shot({ id: 's0', cameraId: camA, startTime: 1, endTime: 2 })] }))
      .toThrow(/must open at playhead 0/);
  });

  it('refuses overlapping and gapped-by-overlap shot times: one instant, two answers about the camera', () => {
    expect(() => define({
      shots: [shot({ id: 's0', cameraId: camA }), shot({ id: 's1', cameraId: camB, startTime: 1, endTime: 5 })],
    })).toThrow(/shot s1 starts at 1, at or before the previous shot's 2/);
  });

  it('refuses a shot that does not end after it starts, because progress divides by the shot', () => {
    expect(() => define({ shots: [shot({ id: 's0', cameraId: camA, startTime: 0, endTime: 0 })] }))
      .toThrow(/runs 0 → 0; progress inside a shot divides by its own length/);
    expect(() => define({
      shots: [shot({ id: 's0', cameraId: camA }), shot({ id: 's1', cameraId: camB, startTime: 3, endTime: 2 })],
    })).toThrow(/shot s1 runs 3 → 2/);
  });

  it('refuses a shot naming a camera that is not in the scene it registers against', () => {
    expect(() => define({ shots: [shot({ id: 's0', cameraId: 'nowhere' as CameraId })] }))
      .toThrow(/shot s0 names camera nowhere, which is not in scene/);
  });

  it('refuses every transition but a cut, and a duration for a cut that has none', () => {
    expect(() => define({ shots: [shot({ id: 's0', cameraId: camA, transition: 'dissolve' })] }))
      .toThrow(/asks for a 'dissolve' transition/);
    expect(() => define({ shots: [shot({ id: 's0', cameraId: camA, transitionDuration: 0.5 })] }))
      .toThrow(/transitionDuration 0\.5 while the only available transition is an instantaneous cut/);
  });

  it('refuses a fov animation on an orthographic camera, which has no fov to write', () => {
    const ortho = runtime.createCamera(scene, 'Ortho', 'orthographic').id;
    expect(() => define({
      shots: [shot({ id: 's0', cameraId: ortho, fovAnimation: { start: 40, end: 60, easing: 'linear' } })],
    })).toThrow(/which is orthographic; an orthographic camera has no "fov" to write/);
  });

  it('refuses a fov that would make the projection degenerate, and an easing word it does not implement', () => {
    const bad = (fov: { start: number; end: number }) => define({
      shots: [shot({ id: 's0', cameraId: camA, fovAnimation: { ...fov, easing: 'linear' } })],
    });
    expect(() => bad({ start: 0, end: 60 })).toThrow(/fovAnimation\.start is 0/);
    expect(() => bad({ start: 40, end: 180 })).toThrow(/fovAnimation\.end is 180/);
    expect(() => bad({ start: NaN, end: 60 })).toThrow(/fovAnimation\.start is NaN/);
    expect(() => define({ shots: [shot({ id: 's0', cameraId: camA, fovAnimation: { start: 40, end: 60, easing: 'bounce' } })] }))
      .toThrow(/names easing "bounce"/);
  });

  it('names the easings it implements in the refusal, read from the table rather than retyped', () => {
    const message = (() => {
      try {
        define({ shots: [shot({ id: 's0', cameraId: camA, fovAnimation: { start: 40, end: 60, easing: 'x' } })] });
        return '';
      } catch (error) {
        return (error as Error).message;
      }
    })();
    for (const name of ['easeIn', 'easeInOut', 'easeOut', 'linear']) {
      expect(message, `the refusal must list ${name}`).toContain(`"${name}"`);
    }
  });

  it('refuses a path with no arc, because the camera is placed along it', () => {
    const flat = curve([1, 0, 0], [1, 0, 0], [1, 0, 0]);
    expect(() => define({ shots: [shot({ id: 's0', cameraId: camA, cameraPath: flat })] }))
      .toThrow(/shot s0 cameraPath has no length/);
  });

  it('refuses a scene that does not exist', () => {
    expect(() => define({}, 'nope' as SceneId)).toThrow(/defineCinematic: scene nope does not exist/);
  });

  it('copies the shot array, so pushing onto the caller\'s list later does not move a registered timeline', () => {
    const list = [shot({ id: 's0', cameraId: camA })];
    const sequence = runtime.defineCinematic(scene, { id: 'seq', name: 'n', shots: list });
    list.push(shot({ id: 's1', cameraId: camB, startTime: 2, endTime: 8 }));
    expect(sequence.duration).toBe(2);
    expect(sequence.shots).toHaveLength(1);
    expect(runtime.cinematicSnapshot().sequences.get('seq')!.shots).toHaveLength(1);
  });
});

describe('playCinematic — one sequence at a time, because activeSequence is one id', () => {
  it('starts a sequence and refuses a second player without throwing', () => {
    define();
    define({ id: 'other', shots: [shot({ id: 'x0', cameraId: camB })] });
    expect(runtime.playCinematic('seq')).toBe(true);
    expect(runtime.playCinematic('seq')).toBe(false);
    expect(runtime.playCinematic('other')).toBe(false);
    expect(runtime.cinematicFieldAudit('other')!.playhead.blockedBy).toBe('seq');
    expect(runtime.cinematicFieldAudit('seq')!.playhead.blockedBy).toBe(null);
  });

  it('refuses to play an unregistered id, and one whose scene is not the active scene', () => {
    expect(() => runtime.playCinematic('ghost')).toThrow(/no sequence named ghost is registered/);
    const second = freshScene('Second');
    const cam2 = runtime.createCamera(second, 'SecondCam').id;
    define({ id: 'elsewhere', shots: [shot({ id: 'e0', cameraId: cam2 })] }, second);
    runtime.setActiveScene(scene);
    expect(() => runtime.playCinematic('elsewhere')).toThrow(/"elsewhere" belongs to scene/);
  });

  it('emits cinematicPlayed with the playhead it is starting from', () => {
    const seen: unknown[] = [];
    runtime.addEventListener('cinematicPlayed', (data) => seen.push(data));
    define();
    expect(runtime.playCinematic('seq')).toBe(true);
    expect(seen).toEqual([{ sequenceId: 'seq', time: 0, duration: 5 }]);
  });
});

describe('updateCinematics — the playhead, the cut, and where the camera ends up', () => {
  it('does nothing to the cameras until a frame runs', () => {
    define();
    runtime.playCinematic('seq');
    expect(activeOf(camA)).toBe(true);
    expect(activeOf(camB)).toBe(false);
  });

  it('puts the first shot\'s camera on screen on the first frame, and switches exactly once at the boundary', () => {
    const changes: object[] = [];
    runtime.addEventListener('cinematicShotChanged', (d: object) => changes.push(d));
    define();
    runtime.playCinematic('seq');

    runtime.simulateFrame(1);
    runtime.simulateFrame(0.5);
    expect(changes).toEqual([{ sequenceId: 'seq', shotIndex: 0, shotId: 's0', cameraId: camA }]);
    expect(activeOf(camA)).toBe(true);

    runtime.simulateFrame(1.5); // playhead 3, inside the second shot
    expect(changes.map((c) => c.shotIndex)).toEqual([0, 1]);
    expect(activeOf(camB)).toBe(true);
    expect(runtime.getScene(scene)!.cameras.get(camA)!.active).toBe(false);

    runtime.simulateFrame(0.5); // still shot 1: a cut is an event, not a per-frame write
    expect(changes).toHaveLength(2);
  });

  it('moves the camera along its path as the playhead advances, and stops at the end of the path', () => {
    const path = curve([0, 0, 0], [10, 0, 0], [20, 0, 0]);
    define({ shots: [shot({ id: 's0', cameraId: camA, endTime: 4, cameraPath: path })] });
    runtime.playCinematic('seq');
    const start = cameraPos(camA).clone();
    runtime.simulateFrame(2);
    const middle = cameraPos(camA).clone();
    runtime.simulateFrame(2);
    const end = cameraPos(camA).clone();

    expect(middle.distanceTo(start)).toBeGreaterThan(1);
    expect(middle.x).toBeGreaterThan(start.x);
    expect(end.x).toBeGreaterThan(middle.x);
    expect(end.z).toBeCloseTo(0, 10);
    // The arc parameter is what makes the second half of the move cover the second half of the curve.
    expect(end.x).toBeCloseTo(path.getPointAt(1).x, 10);
  });

  it('aims along a target path, and leaves the aim alone when a shot declares none', () => {
    const target = curve([10, 0, 0], [10, 10, 0]);
    define({ shots: [shot({ id: 's0', cameraId: camA, endTime: 2, targetPath: target })] });
    runtime.playCinematic('seq');
    runtime.simulateFrame(1);
    const camera = runtime.getScene(scene)!.cameras.get(camA)!;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.threeCamera.quaternion);
    // The camera sits at the origin (no `cameraPath` on this shot), and the aim is the curve's own answer
    // for the instant the playhead reached — so the expectation is derived, not a restated coordinate.
    const want = target.getPointAt(0.5).normalize();
    expect(forward.dot(want)).toBeGreaterThan(0.999);

    const plain = freshScene('Plain');
    const still = runtime.createCamera(plain, 'Still').id;
    define({ id: 'noaim', shots: [shot({ id: 'n0', cameraId: still, endTime: 2 })] }, plain);
    runtime.playCinematic('noaim');
    runtime.setActiveScene(plain);
    runtime.simulateFrame(1);
    expect(runtime.getScene(plain)!.cameras.get(still)!.threeCamera.quaternion.clone())
      .toEqual(new THREE.Quaternion());
  });

  it('animates the field of view, and the easing word decides what the midpoint is', () => {
    define({ shots: [shot({ id: 's0', cameraId: camA, endTime: 2, fovAnimation: { start: 40, end: 60, easing: 'easeIn' } })] });
    runtime.playCinematic('seq');
    runtime.simulateFrame(1);
    const fov = (runtime.getScene(scene)!.cameras.get(camA)!.threeCamera as THREE.PerspectiveCamera).fov;
    // easeIn is t², so half-time is a quarter of the way: 45 not 50. The control below proves the number
    // came from the named easing and not from the endpoints.
    expect(fov).toBeCloseTo(45, 10);

    runtime.dispose();
    runtime = createThreeRuntime({}, { backend: (_c, cfg) => createHeadlessBackend(cfg) });
    runtime.initialize(mockCanvas);
    const s2 = freshScene();
    const c2 = runtime.createCamera(s2, 'C2').id;
    define({ shots: [shot({ id: 's0', cameraId: c2, endTime: 2, fovAnimation: { start: 40, end: 60, easing: 'linear' } })] }, s2);
    runtime.playCinematic('seq');
    runtime.simulateFrame(1);
    expect((runtime.getScene(s2)!.cameras.get(c2)!.threeCamera as THREE.PerspectiveCamera).fov).toBeCloseTo(50, 10);
  });

  it('writes the projection matrix when it writes the fov, so a renderer sees the new frustum', () => {
    define({ shots: [shot({ id: 's0', cameraId: camA, endTime: 2, fovAnimation: { start: 40, end: 60, easing: 'linear' } })] });
    const camera = runtime.getScene(scene)!.cameras.get(camA)!.threeCamera as THREE.PerspectiveCamera;
    const before = camera.projectionMatrix.elements[5];
    runtime.playCinematic('seq');
    runtime.simulateFrame(1);
    expect(camera.fov).toBeCloseTo(50, 10);
    expect(camera.projectionMatrix.elements[5]).not.toBe(before);
  });

  it('holds the last frame at the end, stops playing, and finishes once', () => {
    const finished: unknown[] = [];
    runtime.addEventListener('cinematicFinished', (d) => finished.push(d));
    define({ shots: [shot({ id: 's0', cameraId: camA, endTime: 1 })] });
    const sequence = runtime.cinematicSnapshot().sequences.get('seq')!;
    runtime.playCinematic('seq');
    runtime.simulateFrame(0.5);
    runtime.simulateFrame(0.5);
    expect(finished).toEqual([{ sequenceId: 'seq', time: 1, duration: 1 }]);
    expect(sequence.playing).toBe(false);
    runtime.simulateFrame(0.5);
    expect(finished).toHaveLength(1);
    expect(runtime.cinematicSnapshot().currentTime).toBe(0);
  });

  it('keeps the playhead when stopped, and rewinds only a finished sequence on replay', () => {
    define({ shots: [shot({ id: 's0', cameraId: camA, endTime: 1 })] });
    runtime.playCinematic('seq');
    runtime.simulateFrame(0.5);
    expect(runtime.stopCinematic('seq')).toBe(true);
    expect(runtime.cinematicFieldAudit('seq')!.playhead.time).toBe(0.5);
    expect(runtime.stopCinematic('seq')).toBe(false);

    runtime.playCinematic('seq');
    expect(runtime.cinematicFieldAudit('seq')!.playhead.time).toBe(0.5);

    runtime.simulateFrame(0.5); // reaches the end and stops there
    expect(runtime.cinematicFieldAudit('seq')!.playhead.time).toBe(1);
    runtime.playCinematic('seq');
    expect(runtime.cinematicFieldAudit('seq')!.playhead.time).toBe(0);
  });

  it('stops a sequence whose scene is no longer being looked at, and says why', () => {
    const interrupts: { reason: string; time: number }[] = [];
    runtime.addEventListener('cinematicInterrupted', (d: { reason: string; time: number }) => interrupts.push(d));
    define();
    runtime.playCinematic('seq');
    runtime.simulateFrame(1);
    const other = freshScene('Other');
    runtime.setActiveScene(other);
    runtime.simulateFrame(1);

    expect(interrupts).toHaveLength(1);
    expect(interrupts[0]!.reason).toMatch(/scene .* is no longer the active scene/);
    expect(runtime.cinematicFieldAudit('seq')!.playhead.playing).toBe(false);
    // The playhead keeps its place: an interruption is not a rewind.
    expect(runtime.cinematicFieldAudit('seq')!.playhead.time).toBe(1);
    // and nothing about the dormant scene's camera changed after the interrupt.
    expect(activeOf(camB)).toBe(false);
  });

  it('is wired into simulateFrame, which is the only frame path the renderer takes', () => {
    define({ shots: [shot({ id: 's0', cameraId: camB, endTime: 2 })] });
    runtime.playCinematic('seq');
    runtime.simulateFrame(0.25);
    expect(activeOf(camB)).toBe(true);
  });

  it('steers a first-person character, because movement reads the camera the cinematic turned', () => {
    const hero = runtime.createEntity(scene, 'Hero', 'mesh').id;
    runtime.attachController(scene, hero, { type: 'firstPerson', speed: 4, groundY: 0 });
    // The target travels on +y from a fixed +x distance: that pitches the camera but never yaws it, so the
    // horizontal forward is +x at every instant of the shot.
    define({ shots: [shot({ id: 's0', cameraId: camA, endTime: 2, targetPath: curve([10, 0, 0], [10, 5, 0], [10, 10, 0]) })] });
    runtime.playCinematic('seq');
    runtime.simulateFrame(0.5); // the cinematic aims the camera along +x

    runtime.setControllerInput(hero, { moveForward: true });
    const position = runtime.getEntity(scene, hero)!.threeObject.position;
    const before = position.clone();
    runtime.simulateFrame(0.25);
    const dx = position.x - before.x;
    const dz = position.z - before.z;
    // An unaimed camera looks along -z, which would put the whole move in `dz`; only a cinematic that
    // actually wrote the camera's orientation produces a forward walk along +x.
    expect(dx).toBeGreaterThan(0.5);
    expect(Math.abs(dz)).toBeLessThan(Math.abs(dx));
  });
});

describe('cinematicSnapshot and cinematicFieldAudit, checked against types.ts', () => {
  const typesSource = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');

  /** The declared field names of one exported interface, taken from the file that DECLARES them. */
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

  it('reads the real field lists out of the artifact', () => {
    expect(declaredFields('CinematicShot').sort()).toEqual(
      ['cameraId', 'cameraPath', 'endTime', 'fovAnimation', 'id', 'postProcessing', 'startTime', 'targetPath', 'transition', 'transitionDuration'].sort(),
    );
    expect(declaredFields('CinematicSequence').sort()).toEqual(
      ['currentShot', 'duration', 'id', 'name', 'playing', 'shots'],
    );
    expect(declaredFields('SerializedCinematic').sort()).toEqual(
      ['activeSequence', 'currentTime', 'sequences'],
    );
  });

  it('fills EXACTLY the fields SerializedCinematic declares, and no more', () => {
    define();
    expect(Object.keys(runtime.cinematicSnapshot()).sort()).toEqual(declaredFields('SerializedCinematic').sort());
  });

  it('reports the live sequences and follows the playhead for activeSequence/currentTime', () => {
    define();
    expect(runtime.cinematicSnapshot().activeSequence).toBe(null);
    runtime.playCinematic('seq');
    runtime.simulateFrame(0.75);
    const snapshot = runtime.cinematicSnapshot();
    expect(snapshot.activeSequence).toBe('seq');
    expect(snapshot.currentTime).toBe(0.75);
    expect(snapshot.sequences.get('seq')).toBe(runtime.cinematicSnapshot().sequences.get('seq'));

    runtime.stopCinematic('seq');
    const stopped = runtime.cinematicSnapshot();
    // `currentTime` belongs to the ACTIVE sequence in the declared shape; with nothing active, the honest
    // answer is 0 rather than a playhead that is standing still off screen.
    expect(stopped.activeSequence).toBe(null);
    expect(stopped.currentTime).toBe(0);
    expect(runtime.cinematicFieldAudit('seq')!.playhead.time).toBe(0.75);
  });

  it('partitions CinematicShot into consulted and unhonored, with no gap and no overlap', () => {
    define();
    const audit = runtime.cinematicFieldAudit('seq')!;
    const named = [...audit.consulted, ...audit.unhonored.map((u) => u.field)];
    expect(declaredFields('CinematicShot').sort()).toEqual(named.sort());
    expect(new Set(named).size).toBe(named.length);
  });

  it('partitions CinematicSequence into what the player reads and what it writes', () => {
    define();
    const audit = runtime.cinematicFieldAudit('seq')!;
    const named = [...audit.sequenceRead, ...audit.sequenceWritten];
    expect(declaredFields('CinematicSequence').sort()).toEqual(named.sort());
    expect(audit.sequenceWritten).toEqual(['currentShot', 'playing']);
  });

  it('writes the two sequence fields it claims: playing flips on play, currentShot follows the shot index', () => {
    define();
    const sequence = runtime.cinematicSnapshot().sequences.get('seq')!;
    expect([sequence.playing, sequence.currentShot]).toEqual([false, 0]);
    runtime.playCinematic('seq');
    runtime.simulateFrame(3);
    expect([sequence.playing, sequence.currentShot]).toEqual([true, 1]);
  });

  it('gives every unhonored field a sentence rather than its own name', () => {
    define();
    const audit = runtime.cinematicFieldAudit('seq')!;
    expect(audit.unhonored.map((u) => u.field).sort()).toEqual(['postProcessing', 'transition', 'transitionDuration']);
    for (const entry of audit.unhonored) {
      expect(entry.reason.length, `${entry.field} must say WHY it is unhonored`).toBeGreaterThan(40);
      expect(entry.reason.toLowerCase()).not.toBe(entry.field.toLowerCase());
    }
    expect(audit.unhonored.find((u) => u.field === 'transition')!.reason).toMatch(/one active camera per frame/);
  });

  it('answers for a registered id only, and says what the camera is actually showing', () => {
    define();
    expect(runtime.cinematicFieldAudit('ghost')).toBe(undefined);
    const audit = runtime.cinematicFieldAudit('seq')!;
    // `currentShot` is the declared field, which cannot say "nothing yet" and sits at 0; `shotId` is the
    // audit's answer to what is on screen, and it says null until a frame has picked a shot.
    expect(audit.playhead.currentShot).toBe(0);
    expect(audit.playhead.shotId).toBe(null);
    expect(audit.playhead.cameraId).toBe(null);
    runtime.playCinematic('seq');
    runtime.simulateFrame(0.5);
    expect(runtime.cinematicFieldAudit('seq')!.playhead.shotId).toBe('s0');
    expect(runtime.cinematicFieldAudit('seq')!.playhead.cameraId).toBe(camA);
  });

  it('accepts a declared postProcessing config and reports it as unhonored, without doing anything with it', () => {
    define({
      shots: [shot({ id: 's0', cameraId: camA, postProcessing: { enabled: true, passes: [{ type: 'bloom', enabled: true, parameters: {} }] } })],
    });
    runtime.playCinematic('seq');
    runtime.simulateFrame(1);
    expect(runtime.cinematicFieldAudit('seq')!.unhonored.map((u) => u.field)).toContain('postProcessing');
  });

  it('leaves camera ids of other scenes out of reach: a sequence is registered against one scene', () => {
    const second = freshScene('Second');
    const otherCamera = runtime.createCamera(second, 'Other').id;
    expect(() => define({ id: 'mixed', shots: [shot({ id: 'm0', cameraId: otherCamera })] }))
      .toThrow(/shot m0 names camera .*, which is not in scene/);
    runtime.setActiveScene(scene);
    define({ id: 'here', shots: [shot({ id: 'h0', cameraId: camA })] });
    expect(runtime.playCinematic('here')).toBe(true);
  });
});

describe('a sequence that plays is still not a sequence that can be saved', () => {
  it('names the live curve as the blocker, not the stub that shipped until v116', () => {
    const hero = runtime.createEntity(scene, 'Hero', 'mesh').id;
    define({ shots: [shot({ id: 's0', cameraId: camA, endTime: 2, cameraPath: curve([0, 0, 0], [1, 1, 1], [2, 0, 0]) })] });
    runtime.playCinematic('seq');
    const audit = runtime.saveFeasibilityAudit(scene, hero)!;
    const row = audit.blocked.find((entry) => entry.field === 'cinematic');
    expect(row, 'a player for a sequence does not rebuild its curves: cinematic must stay in `blocked`').toBeDefined();
    expect(row!.needs).toContain('THREE.CatmullRomCurve3');
    expect(row!.needs, 'v117 replaced the empty stub, so a reason still calling it one is stale').not.toMatch(/empty stub/);
  });
});
