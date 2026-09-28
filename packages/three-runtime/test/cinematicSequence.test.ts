import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createThreeRuntime, type ThreeRuntime } from '../src/threeRuntime.js';
import type { CameraId, CinematicShot, SceneId, SerializedCinematic, SerializedCinematicSequence, SerializedCinematicShot, SerializedCurve } from '../src/types.js';
import { createHeadlessBackend } from '../src/renderBackend.js';

/**
 * M5 v117: `CinematicSequence`, `CinematicShot` and `SerializedCinematic` were declared in `types.ts` and
 * read by NOTHING — `updateCinematics` was the last comment-shaped hole inside `simulateFrame`. This suite
 * gives them a registry that validates at the door, a player that moves a camera, a writer for the declared
 * save shape, and `cinematicFieldAudit`, which names the declared fields the package still cannot honor.
 *
 * M5 v118 adds the READER: `restoreCinematic` plus the curve codec that makes `SerializedCurve` mean a
 * rebuildable path. That turned three of v117's cases inside out — a snapshot used to hand back the live
 * sequence, and now it must not — so those cases state the opposite claim and say which way they were
 * turned.
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
/** Extra runtimes a case built (the cross-runtime round trip), disposed after every case. */
const builtRuntimes: ThreeRuntime[] = [];

function makeRuntime(): ThreeRuntime {
  const created = createThreeRuntime({}, { backend: (_canvas, cfg) => createHeadlessBackend(cfg) });
  created.initialize(mockCanvas);
  builtRuntimes.push(created);
  return created;
}

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
  // v118's round-trip cases build a SECOND runtime to restore into, which is the point: the save has to be
  // readable by something that never saw the original. Those get disposed with the first one.
  for (const extra of builtRuntimes.splice(0)) extra.dispose();
});

/** One shot with every required field named, so a case only spells out what it is about. */
function shot(over: Partial<CinematicShot> & { id: string; cameraId: CameraId }): CinematicShot {
  return { startTime: 0, endTime: 2, transition: 'cut', transitionDuration: 0, ...over };
}

const curve = (...points: [number, number, number][]) =>
  new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));

/** A path that turns: on a near-straight one the three interpolation schemes land within femtometres of each
 *  other at the same ARC fraction, which is exactly the trap the control case below fell into. */
const TURN: [number, number, number][] = [[0, 0, 0], [1, 3, 0], [4, 0, 0], [6, 2, 0]];
const turning = (curveType: 'centripetal' | 'chordal' | 'catmullrom', tension = 0.5) =>
  new THREE.CatmullRomCurve3(TURN.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, curveType, tension);

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

/** Read from the artifact that DECLARES the shape, so a field added in `types.ts` cannot join the silent
 *  ones. Module-level since v118: the codec cases ask the same question about the serialized interfaces. */
const typesSource = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

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

/** One saved sequence by id, out of the `[key, record]` pairs a save is spelled as (v119). */
function sequenceOf(saved: SerializedCinematic, id: string): SerializedCinematicSequence | undefined {
  return saved.sequences.find(([key]) => key === id)?.[1];
}

/** A saved shot / sequence / snapshot, spelled the way a save spells them: plain data, and every field the
 *  declared interface names. `over` is what a case is about, including the shapes that are NOT data. */
function savedShot(over: Partial<SerializedCinematicShot> = {}): SerializedCinematicShot {
  return { id: 's0', cameraId: camA, startTime: 0, endTime: 2, transition: 'cut', transitionDuration: 0, ...over };
}

function savedSequence(over: Partial<SerializedCinematicSequence> = {}): SerializedCinematicSequence {
  return { id: 'seq', name: 'A sequence', sceneId: scene, shots: [savedShot()], duration: 2, currentShot: 0, playing: false, ...over };
}

function savedSnapshot(entries: readonly SerializedCinematicSequence[], over: Partial<SerializedCinematic> = {}): SerializedCinematic {
  return {
    sequences: entries.map((entry) => [entry.id, entry] as [string, SerializedCinematicSequence]),
    activeSequence: null,
    currentTime: 0,
    ...over,
  };
}

/** The curve data a case hands the reader, with the three constructor arguments named instead of defaulted:
 *  a test that writes `closed: false` cannot accidentally be proving the codec's default. */
function savedCurve(points: readonly (readonly [number, number, number])[], over: Partial<SerializedCurve> = {}): SerializedCurve {
  return {
    points: points.map(([x, y, z]) => ({ x, y, z })),
    closed: false,
    curveType: 'centripetal',
    tension: 0.5,
    ...over,
  };
}

/**
 * A runtime rebuilt to receive a save: the scene named by each saved sequence, and a camera for every
 * `cameraId` its shots name, created UNDER THOSE IDS. This is what `createCamera`'s `id` argument is for —
 * without it a saved cinematic could only ever be read by the process that wrote it.
 */
function runtimeRebuiltFrom(saved: SerializedCinematic): ThreeRuntime {
  const built = makeRuntime();
  const activeEntry = saved.activeSequence === null ? undefined : sequenceOf(saved, saved.activeSequence);
  const ordered = saved.sequences.map(([, entry]) => entry).sort((a, b) => (a === activeEntry ? -1 : b === activeEntry ? 1 : 0));
  for (const entry of ordered) {
    if (!built.getScene(entry.sceneId)) built.createScene(`rebuilt-${entry.sceneId}`, entry.sceneId);
    for (const shot of entry.shots) {
      if (!built.getScene(entry.sceneId)!.cameras.has(shot.cameraId)) {
        built.createCamera(entry.sceneId, `camera-for-${shot.id}`, 'perspective', {}, shot.cameraId);
      }
    }
  }
  // The active sequence's scene goes last, so it is the one being looked at — the same precondition
  // `playCinematic` and `restoreCinematic` both refuse without.
  if (activeEntry) built.setActiveScene(activeEntry.sceneId);
  return built;
}

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

  it('refuses a path with too few control points in its own words, not in three.js\'s', () => {
    // v117 claimed this refusal and did not give it: `getLength()` on a one-point curve throws
    // `TypeError: Cannot read properties of undefined (reading 'x')` from inside the library, so the door
    // crashed on the input it said it was refusing. A crash names three.js's internals; a refusal names the
    // caller's path. The count is asked BEFORE the length, which is what makes the message readable.
    const one = new THREE.CatmullRomCurve3([new THREE.Vector3(1, 2, 3)]);
    const none = new THREE.CatmullRomCurve3([]);
    expect(() => one.getLength()).toThrow(/Cannot read properties of undefined/); // the reason the door cannot ask
    expect(() => define({ shots: [shot({ id: 's0', cameraId: camA, cameraPath: one })] }))
      .toThrow(/shot s0 cameraPath has 1 control point/);
    expect(() => define({ shots: [shot({ id: 's0', cameraId: camA, targetPath: none })] }))
      .toThrow(/shot s0 targetPath has 0 control point/);
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
    expect(sequenceOf(runtime.cinematicSnapshot(), 'seq')!.shots).toHaveLength(1);
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
    // v117 read the LIVE sequence out of `cinematicSnapshot` here. Since v118 the snapshot is data, so the
    // playhead's own answer comes from the audit — and the stale reading is kept on purpose as the control:
    // a snapshot taken before the play must still say `playing: false` after the sequence has run and
    // finished, which is the claim that `updateCinematics` writes the live object and not the save.
    const beforePlay = sequenceOf(runtime.cinematicSnapshot(), 'seq')!;
    runtime.playCinematic('seq');
    runtime.simulateFrame(0.5);
    runtime.simulateFrame(0.5);
    expect(finished).toEqual([{ sequenceId: 'seq', time: 1, duration: 1 }]);
    expect(runtime.cinematicFieldAudit('seq')!.playhead.playing).toBe(false);
    expect(beforePlay.playing).toBe(false);
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

  it('reports the sequences as data: equal across calls, never the same object, never moving with the game', () => {
    define();
    expect(runtime.cinematicSnapshot().activeSequence).toBe(null);
    runtime.playCinematic('seq');
    runtime.simulateFrame(0.75);
    const snapshot = runtime.cinematicSnapshot();
    expect(snapshot.activeSequence).toBe('seq');
    expect(snapshot.currentTime).toBe(0.75);
    // v117 asserted `toBe` on this pair: the map held the LIVE `CinematicSequence`, so a "snapshot" was a
    // second name for the running game. v118 asserts the opposite in both halves of the new claim — two
    // snapshots of one state are DEEP-equal, and they are not the same object.
    const again = runtime.cinematicSnapshot();
    expect(sequenceOf(snapshot, 'seq')).toEqual(sequenceOf(again, 'seq'));
    expect(sequenceOf(snapshot, 'seq')).not.toBe(sequenceOf(again, 'seq'));

    runtime.stopCinematic('seq');
    const stopped = runtime.cinematicSnapshot();
    // `currentTime` belongs to the ACTIVE sequence in the declared shape; with nothing active, the honest
    // answer is 0 rather than a playhead that is standing still off screen.
    expect(stopped.activeSequence).toBe(null);
    expect(stopped.currentTime).toBe(0);
    expect(runtime.cinematicFieldAudit('seq')!.playhead.time).toBe(0.75);
    // The teeth of "data": the stop moved the LIVE sequence, and the snapshot taken before it did not.
    expect(sequenceOf(stopped, 'seq')!.playing).toBe(false);
    expect(sequenceOf(snapshot, 'seq')!.playing).toBe(true);
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
    const read = () => {
      const p = runtime.cinematicFieldAudit('seq')!.playhead;
      return [p.playing, p.currentShot];
    };
    expect(read()).toEqual([false, 0]);
    runtime.playCinematic('seq');
    // v117 read these two off `cinematicSnapshot()`, which handed back the live object. It reads off the
    // audit now, because since v118 the snapshot is data and would answer about the moment it was taken —
    // which is the case below, not this one.
    expect(sequenceOf(runtime.cinematicSnapshot(), 'seq')).toEqual(expect.objectContaining({ playing: true, currentShot: 0 }));
    runtime.simulateFrame(3);
    expect(read()).toEqual([true, 1]);
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

describe('the curve codec — a path is stored as points, and points are stored back as a path', () => {
  /** Register one shot that carries both a moving path and an aiming one, and hand back the live curve. */
  function withPath() {
    const path = curve([0, 0, 0], [3, 4, 0], [6, 1, 0], [9, 5, 0]);
    define({ shots: [shot({ id: 's0', cameraId: camA, endTime: 2, cameraPath: path })] });
    return path;
  }

  it('writes exactly the fields SerializedCurve declares, and only the shot keys a shot carries', () => {
    withPath();
    const savedShotData = sequenceOf(runtime.cinematicSnapshot(), 'seq')!.shots[0]!;
    expect(Object.keys(savedShotData.cameraPath!).sort()).toEqual(declaredFields('SerializedCurve').sort());

    // A saved shot carries the keys the live shot has, which for a plain shot is FEWER than the interface
    // declares. The three missing ones are exactly the three the interface marks optional — a save that
    // wrote `targetPath: undefined` would claim a field it does not carry and lose it to a JSON write.
    const written = Object.keys(savedShotData).sort();
    const declared = declaredFields('SerializedCinematicShot').sort();
    expect(written.every((key) => declared.includes(key))).toBe(true);
    expect(declared.filter((key) => !written.includes(key)).sort()).toEqual(['fovAnimation', 'postProcessing', 'targetPath']);
  });

  it('carries the three constructor arguments, because they decide the shape through the same points', () => {
    const path = withPath();
    path.curveType = 'chordal';
    path.tension = 0.9;
    path.closed = true;
    const saved = sequenceOf(runtime.cinematicSnapshot(), 'seq')!.shots[0]!.cameraPath!;
    expect([saved.curveType, saved.tension, saved.closed]).toEqual(['chordal', 0.9, true]);
    expect(saved.points).toEqual([
      { x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }, { x: 6, y: 1, z: 0 }, { x: 9, y: 5, z: 0 },
    ]);
  });

  it('rebuilds a curve that puts the camera where the live one did, to the last bit', () => {
    // Built as chordal from the start, so the curve the player sampled and the curve the save describes are
    // the same curve. The distance is then exactly 0, which is what makes the case below a finding.
    const path = new THREE.CatmullRomCurve3(
      [[0, 0, 0], [3, 4, 0], [6, 1, 0], [9, 5, 0]].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      false,
      'chordal',
      0.9,
    );
    define({ shots: [shot({ id: 's0', cameraId: camA, endTime: 2, cameraPath: path })] });
    runtime.playCinematic('seq');
    runtime.simulateFrame(1);
    const saved = runtime.cinematicSnapshot();

    const rebuilt = runtimeRebuiltFrom(saved);
    rebuilt.restoreCinematic(saved);
    rebuilt.simulateFrame(0); // a frame of no advance: it places the camera without moving the playhead
    const there = rebuilt.getScene(scene)!.cameras.get(camA)!.threeCamera.position;
    expect(there.distanceTo(cameraPos(camA))).toBe(0);
    expect([sequenceOf(saved, 'seq')!.shots[0]!.cameraPath!.curveType, sequenceOf(saved, 'seq')!.shots[0]!.cameraPath!.tension]).toEqual(['chordal', 0.9]);
  });

  it('a curve mutated after registration restores to the word the SAVE names, not the stale cache the live one used', () => {
    const path = withPath();
    // `defineCinematic` has already called `getLength()`, so three.js has cached this curve's arc-length table
    // under `centripetal`; assigning `curveType` does not set `needsUpdate`, so the LIVE curve keeps sampling
    // through the table of the word it no longer carries.
    path.curveType = 'chordal';
    runtime.playCinematic('seq');
    runtime.simulateFrame(1);
    const saved = runtime.cinematicSnapshot();

    const rebuilt = runtimeRebuiltFrom(saved);
    rebuilt.restoreCinematic(saved);
    rebuilt.simulateFrame(0);
    const there = rebuilt.getScene(scene)!.cameras.get(camA)!.threeCamera.position;
    // The codec's answer is the honest one: bit-exact against a curve built as `chordal` from the start…
    expect(there.distanceTo(new THREE.CatmullRomCurve3(
      sequenceOf(saved, 'seq')!.shots[0]!.cameraPath!.points.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
      false,
      'chordal',
      0.5,
    ).getPointAt(0.5))).toBe(0);
    // …while the live curve it replaced is not at that point, because its own numbers disagree with its word.
    expect(there.distanceTo(cameraPos(camA))).toBeGreaterThan(0);
  });

  it('and the saved word is not decoration: editing curveType in the save moves the camera off the path it was saved on', () => {
    define({ shots: [shot({ id: 's0', cameraId: camA, endTime: 2, cameraPath: turning('chordal') })] });
    runtime.playCinematic('seq');
    runtime.simulateFrame(1);
    const saved = runtime.cinematicSnapshot();
    const whereItWas = cameraPos(camA).clone();

    // The control a round-trip test needs, and the first draft of it did not control anything: it left the
    // save with `activeSequence: null`, so the restored sequence was never playing, no frame moved the
    // camera, and the assertion measured a camera still at the origin. This one restores a RUNNING sequence
    // and compares against an honest curve sampled the way the player samples.
    const [drifted] = JSON.parse(JSON.stringify(saved.sequences.map(([, entry]) => entry))) as SerializedCinematicSequence[];
    drifted!.shots[0]!.cameraPath!.curveType = 'centripetal';
    const other = runtimeRebuiltFrom(saved);
    other.restoreCinematic({ ...saved, sequences: [[drifted!.id, drifted!]] });
    other.simulateFrame(0);
    const there = other.getScene(scene)!.cameras.get(camA)!.threeCamera.position;
    expect(there.distanceTo(whereItWas)).toBeGreaterThan(0.001);
    // Not "different by some amount" but "different in the directed way": the drifted save lands exactly
    // where a centripetal curve built from the same points is, so the gap is the word, not the codec.
    expect(there.distanceTo(turning('centripetal').getPointAt(0.5))).toBe(0);
  });

  it('carries tension where three.js reads it, and loses nothing where it does not', () => {
    define({ shots: [shot({ id: 's0', cameraId: camA, endTime: 2, cameraPath: turning('catmullrom', 0.8) })] });
    runtime.playCinematic('seq');
    runtime.simulateFrame(1);
    const saved = runtime.cinematicSnapshot();
    expect(sequenceOf(saved, 'seq')!.shots[0]!.cameraPath!.tension).toBe(0.8);

    const faithful = runtimeRebuiltFrom(saved);
    faithful.restoreCinematic(saved);
    faithful.simulateFrame(0);
    expect([faithful.getScene(scene)!.cameras.get(camA)!.threeCamera.position.distanceTo(cameraPos(camA)),
      sequenceOf(saved, 'seq')!.shots[0]!.cameraPath!.curveType]).toEqual([0, 'catmullrom']);

    // Same points, same word, one number changed: a `catmullrom` curve reads tension as its shape.
    const [drifted] = JSON.parse(JSON.stringify(saved.sequences.map(([, entry]) => entry))) as SerializedCinematicSequence[];
    drifted!.shots[0]!.cameraPath!.tension = 0.2;
    const other = runtimeRebuiltFrom(saved);
    other.restoreCinematic({ ...saved, sequences: [[drifted!.id, drifted!]] });
    other.simulateFrame(0);
    const there = other.getScene(scene)!.cameras.get(camA)!.threeCamera.position;
    expect(there.distanceTo(cameraPos(camA))).toBeGreaterThan(0.001);
    expect(there.distanceTo(turning('catmullrom', 0.2).getPointAt(0.5))).toBe(0);
  });

  it('refuses a curveType it cannot name, printing the three it knows, on the way in and on the way out', () => {
    const spiral = savedCurve([[0, 0, 0], [1, 1, 1]], { curveType: 'spiral' as unknown as SerializedCurve['curveType'] });
    const saved = savedSnapshot([savedSequence({ shots: [savedShot({ cameraPath: spiral })] })]);
    expect(() => runtime.restoreCinematic(saved)).toThrow(/sequence seq shot 0 cameraPath curveType "spiral" is not one of "centripetal", "chordal", "catmullrom"/);

    const path = withPath();
    (path as unknown as { curveType: string }).curveType = 'spiral';
    expect(() => runtime.cinematicSnapshot()).toThrow(/shot s0 cameraPath has curveType "spiral", which is not one of/);
  });

  it('refuses a coordinate that is not a finite number, naming the index and the axis, both ways', () => {
    const nanPoint = savedCurve([[0, 0, 0], [1, Number.NaN, 1]]);
    const saved = savedSnapshot([savedSequence({ shots: [savedShot({ cameraPath: nanPoint })] })]);
    expect(() => runtime.restoreCinematic(saved)).toThrow(/cameraPath control point 1 has y = NaN/);

    const path = withPath();
    path.points[2] = new THREE.Vector3(6, Number.POSITIVE_INFINITY, 0);
    expect(() => runtime.cinematicSnapshot()).toThrow(/cameraPath control point 2 has a non-finite y \(Infinity\)/);
  });

  it('refuses one control point instead of handing three.js a crash, and refuses a non-array too', () => {
    const one = savedSnapshot([savedSequence({ shots: [savedShot({ cameraPath: savedCurve([[0, 0, 0]]) })] })]);
    expect(() => runtime.restoreCinematic(one)).toThrow(/cameraPath names 1 control point\(s\); one point is not a path/);

    const none = savedSnapshot([savedSequence({ shots: [savedShot({ cameraPath: savedCurve([]) })] })]);
    expect(() => runtime.restoreCinematic(none)).toThrow(/names 0 control point\(s\)/);

    const wrong = savedSnapshot([savedSequence({
      shots: [savedShot({ cameraPath: { points: 'nope', closed: false, curveType: 'centripetal', tension: 0.5 } as unknown as SerializedCurve })],
    })]);
    expect(() => runtime.restoreCinematic(wrong)).toThrow(/cameraPath points is string, not an array/);
  });

  it('refuses a closed flag that is not a boolean, because a truthy one would make the path loop', () => {
    const truthyClosed = savedCurve([[0, 0, 0], [1, 1, 1]], { closed: 'yes' as unknown as boolean });
    const saved = savedSnapshot([savedSequence({ shots: [savedShot({ cameraPath: truthyClosed })] })]);
    expect(() => runtime.restoreCinematic(saved)).toThrow(/cameraPath closed is string, not a boolean/);
  });

  it('refuses a non-finite tension on both doors: JSON would write it as null', () => {
    expect(JSON.stringify({ t: Number.NaN })).toContain('"t":null'); // the round trip this refusal is about
    const looseTension = savedCurve([[0, 0, 0], [1, 1, 1]], { tension: Number.NaN });
    const saved = savedSnapshot([savedSequence({ shots: [savedShot({ cameraPath: looseTension })] })]);
    expect(() => runtime.restoreCinematic(saved)).toThrow(/cameraPath tension is NaN/);

    const path = withPath();
    path.tension = Number.NaN;
    expect(() => runtime.cinematicSnapshot()).toThrow(/cameraPath has tension NaN/);
  });

  it('refuses a live THREE object inside postProcessing — the same reader userData has — and copies what it accepts', () => {
    const config = { enabled: true, passes: [{ type: 'bloom' as const, enabled: true, parameters: { strength: 0.7 } }] };
    define({ shots: [shot({ id: 's0', cameraId: camA, endTime: 2, postProcessing: config })] });
    const saved = runtime.cinematicSnapshot();
    config.passes[0]!.parameters.strength = 99; // the live bag moves; the save already written does not
    expect(sequenceOf(saved, 'seq')!.shots[0]!.postProcessing!.passes[0]!.parameters.strength).toBe(0.7);

    config.passes[0]!.parameters.holder = new THREE.Object3D() as unknown as number;
    expect(() => runtime.cinematicSnapshot())
      .toThrow(/postProcessing\.passes\[0\]\.parameters\.holder holds a Object3D instance, not plain data/);
  });

  it('refuses a live number a caller replaced with NaN after registration, and is inert about its own copy', () => {
    const live = define({ shots: [shot({ id: 's0', cameraId: camA, endTime: 2 })] });
    const copy = sequenceOf(runtime.cinematicSnapshot(), 'seq')!;
    // `defineCinematic` copies the ARRAY, not the shot objects, so the live timeline is reachable from
    // outside: the door validated 2, and the caller can put NaN where 2 was. The save refuses it.
    (live.shots as unknown as { startTime: number }[])[0]!.startTime = Number.NaN;
    expect(() => runtime.cinematicSnapshot()).toThrow(/shot s0 startTime is NaN; a save stores values/);
    // The other half of "a snapshot is data": rewriting the copy changes nothing about what the runtime
    // will save next — v117 handed back the live object, so its "copy" would have had teeth here.
    (copy.shots as unknown as { startTime: number }[])[0]!.startTime = 7;
    expect(() => runtime.cinematicSnapshot()).toThrow(/startTime is NaN/);
    expect(copy.shots[0]!.startTime).toBe(7);
  });

  it('refuses a shot whose id, camera or transition word is not a string, before the player reads one', () => {
    // `defineCinematic` would answer a numeric camera id with "not in scene", which is true but not the
    // defect: a save whose addresses are not addresses cannot be read by anything that keys by them, and a
    // JSON `null` in a required slot is the shape a corrupted save actually arrives as.
    const refuse = (shotData: Partial<SerializedCinematicShot>, pattern: RegExp, what: string) => {
      const saved = savedSnapshot([savedSequence({ shots: [savedShot(shotData)] })]);
      expect(() => runtime.restoreCinematic(saved), what).toThrow(pattern);
    };
    refuse({ cameraId: 7 as unknown as CameraId }, /sequence seq shot 0 cameraId is number, expected string/, 'a numeric camera id');
    refuse({ id: 7 as unknown as string }, /sequence seq shot 0 id is number, expected string/, 'a numeric shot id');
    refuse({ transition: null as unknown as 'cut' }, /sequence seq shot 0 transition is object, expected string/, 'a JSON-null transition word');
  });
});

describe('restoreCinematic — the declared save shape gets its first reader', () => {
  it('restores a whole snapshot into a runtime that never saw it, under the ids the save names', () => {
    const saved = savedSnapshot([savedSequence({
      shots: [savedShot(), savedShot({ id: 's1', cameraId: camB, startTime: 2, endTime: 5 })],
      duration: 5,
    })]);
    const rebuilt = runtimeRebuiltFrom(saved);
    expect(rebuilt.restoreCinematic(saved)).toEqual({ restored: ['seq'], activeSequence: null, playheads: [{ id: 'seq', time: 0, currentShot: 0 }] });
    expect(rebuilt.cinematicFieldAudit('seq')!.playhead.duration).toBe(5);
    expect(rebuilt.cinematicSnapshot()).toEqual(saved);
  });

  it('resumes the playhead and the playing flag through playCinematic, and the first frame cuts to the shot it is inside', () => {
    define();
    runtime.playCinematic('seq');
    runtime.simulateFrame(3); // inside shot 1, which names camB
    const saved = runtime.cinematicSnapshot();
    expect([saved.activeSequence, saved.currentTime]).toEqual(['seq', 3]);

    const rebuilt = runtimeRebuiltFrom(saved);
    const played: { sequenceId: string; time: number }[] = [];
    rebuilt.addEventListener('cinematicPlayed', (d) => played.push(d as { sequenceId: string; time: number }));
    expect(rebuilt.restoreCinematic(saved).playheads).toEqual([{ id: 'seq', time: 3, currentShot: 0 }]);
    // `playing` came from the slot's own door, which is the only thing that emits `cinematicPlayed`.
    expect(played).toEqual([{ sequenceId: 'seq', time: 3, duration: 5 }]);
    // Before a frame runs the restored camera is where this runtime left it and `currentShot` is still 0:
    // the player writes that field, and a restore that wrote it too would be a second owner.
    expect(rebuilt.getScene(scene)!.cameras.get(camB)!.active).toBe(false);
    rebuilt.simulateFrame(0);
    expect(rebuilt.getScene(scene)!.cameras.get(camB)!.active).toBe(true);
    expect(rebuilt.cinematicFieldAudit('seq')!.playhead.currentShot).toBe(1);
  });

  it('resumes a stopped sequence at the start of the shot its save names, and says which in the report', () => {
    define();
    runtime.playCinematic('seq');
    runtime.simulateFrame(3);
    runtime.stopCinematic('seq'); // 3 seconds in, shot 1 — and the shape has no time field for a stopped one
    const saved = runtime.cinematicSnapshot();
    expect([saved.activeSequence, saved.currentTime, sequenceOf(saved, 'seq')!.currentShot]).toEqual([null, 0, 1]);

    const rebuilt = runtimeRebuiltFrom(saved);
    expect(rebuilt.restoreCinematic(saved).playheads).toEqual([{ id: 'seq', time: 2, currentShot: 0 }]);
    expect(rebuilt.cinematicFieldAudit('seq')!.playhead.time).toBe(2);
    // The honest consequence: `playCinematic` does not rewind a sequence at 2 of 5, so the resume continues
    // inside the shot the save named rather than from the top.
    expect(rebuilt.playCinematic('seq')).toBe(true);
    expect(rebuilt.cinematicFieldAudit('seq')!.playhead.time).toBe(2);
  });

  it('refuses a save whose duration disagrees with its own shots, in defineCinematic\'s words', () => {
    const saved = savedSnapshot([savedSequence({ duration: 99 })]);
    expect(() => runtime.restoreCinematic(saved))
      .toThrow(/defineCinematic\("seq"\): duration is declared 99 but the shots run to 2/);
  });

  it('refuses a save whose two spellings of "which cutscene is running" disagree, printing both', () => {
    const twoPlaying = savedSnapshot(
      [savedSequence({ id: 'a', playing: true }), savedSequence({ id: 'b', shots: [savedShot({ id: 'b0' })], playing: true })],
      { activeSequence: 'a', currentTime: 1 },
    );
    expect(() => runtime.restoreCinematic(twoPlaying))
      .toThrow(/activeSequence names "a" while 2 sequence\(s\) claim playing \(a, b\)/);

    const nonePlaying = savedSnapshot([savedSequence({ id: 'a', playing: false })], { activeSequence: 'a', currentTime: 1 });
    expect(() => runtime.restoreCinematic(nonePlaying))
      .toThrow(/activeSequence names "a" but that sequence says playing: false/);

    const orphan = savedSnapshot([savedSequence({ id: 'a' })], { activeSequence: 'ghost', currentTime: 1 });
    expect(() => runtime.restoreCinematic(orphan)).toThrow(/activeSequence names "ghost", which the sequences map does not hold \(a\)/);

    const secretlyPlaying = savedSnapshot([savedSequence({ id: 'a', playing: true })]);
    expect(() => runtime.restoreCinematic(secretlyPlaying))
      .toThrow(/activeSequence is null while 1 sequence\(s\) claim playing \(a\)/);
  });

  it('refuses a playhead the shape cannot own: negative, NaN, at the end of a running save, or with nothing active', () => {
    const running = (currentTime: number) => savedSnapshot([savedSequence({ playing: true })], { activeSequence: 'seq', currentTime });
    expect(() => runtime.restoreCinematic(running(-0.5))).toThrow(/currentTime is -0\.5; a playhead is a non-negative number/);
    expect(() => runtime.restoreCinematic(running(Number.NaN))).toThrow(/currentTime is NaN/);
    // `updateCinematics` stops a sequence AT `duration`, so a save calling it playing there describes a state
    // the runtime never had — and `playCinematic` would rewind it to 0 on the way in.
    expect(() => runtime.restoreCinematic(running(2))).toThrow(/currentTime 2 is at or past the end of "seq", whose save says duration 2/);
    expect(() => runtime.restoreCinematic(savedSnapshot([savedSequence()], { currentTime: 1 })))
      .toThrow(/currentTime is 1 with no active sequence/);
  });

  it('refuses to resume a cutscene in a scene nobody is looking at, the way playCinematic refuses', () => {
    const other = freshScene('Stage'); // `freshScene` activates it, so the save would be restorable right now
    const cam = runtime.createCamera(other, 'OnStage').id;
    runtime.setActiveScene(scene); // ...until the caller looks away
    const saved = savedSnapshot([savedSequence({ sceneId: other, shots: [savedShot({ cameraId: cam })], playing: true })], { activeSequence: 'seq', currentTime: 1 });
    expect(() => runtime.restoreCinematic(saved))
      .toThrow(/"seq" belongs to scene .*, which is not the active scene[\s\S]*the restore rolled back: nothing had been registered/);
    // And the same save is readable the moment its scene is the one being shown: the refusal is about the
    // scene being looked at, not about the save.
    runtime.setActiveScene(other);
    expect(runtime.restoreCinematic(saved).restored).toEqual(['seq']);
  });

  it('refuses a pair key that disagrees with the record under it, and an id that is not a name', () => {
    const mismatched = { sequences: [['outer', savedSequence({ id: 'inner' })]], activeSequence: null, currentTime: 0 } as unknown as SerializedCinematic;
    expect(() => runtime.restoreCinematic(mismatched)).toThrow(/sequences\[0\] is keyed outer but the record under it says inner/);
    expect(() => runtime.restoreCinematic(savedSnapshot([savedSequence({ id: 42 as unknown as string })])))
      .toThrow(/the sequence stored under 42 calls itself 42; activeSequence addresses a sequence by its id/);
  });

  it('refuses a currentShot no shot answers to, a shots bag that is not an array, and a non-object shot', () => {
    expect(() => runtime.restoreCinematic(savedSnapshot([savedSequence({ currentShot: 3 })])))
      .toThrow(/sequence seq currentShot is 3 and the save gives it 1 shot\(s\)/);
    expect(() => runtime.restoreCinematic(savedSnapshot([savedSequence({ currentShot: -1 })])))
      .toThrow(/currentShot is -1/);
    expect(() => runtime.restoreCinematic(savedSnapshot([savedSequence({ shots: 'nope' as unknown as SerializedCinematicShot[] })])))
      .toThrow(/sequence seq shots is string, not an array/);
    expect(() => runtime.restoreCinematic(savedSnapshot([savedSequence({ shots: [null as unknown as SerializedCinematicShot] })])))
      .toThrow(/sequence seq shot 0 is object, not a shot object/);
    expect(() => runtime.restoreCinematic(savedSnapshot([savedSequence({ playing: 'yes' as unknown as boolean })])))
      .toThrow(/sequence seq playing is yes, not a boolean/);
  });

  it('spells its collection as pairs, so a JSON write is a round trip and a Map is the refused shape', () => {
    const path = savedCurve([[0, 0, 0], [1, 2, 3], [4, 0, 1]]);
    const saved = savedSnapshot([savedSequence({ shots: [savedShot({ cameraPath: path })] })]);
    const throughJSON = JSON.parse(JSON.stringify(saved)) as SerializedCinematic;
    // v118 refused this arrival because `sequences` was a Map and JSON writes a Map as `{}`. v119 changed
    // the SHAPE rather than loosening the reader, so the entries are still here after the disk trip.
    expect(throughJSON).toEqual(saved);
    const rebuilt = runtimeRebuiltFrom(throughJSON);
    expect(rebuilt.restoreCinematic(throughJSON).restored).toEqual(['seq']);
    expect(() => runtime.restoreCinematic({ ...saved, sequences: new Map([['seq', savedSequence()]]) } as unknown as SerializedCinematic))
      .toThrow(/sequences arrived as a Map, which is the shape v118 wrote and JSON erases/);
    // …and the other envelope failure is not a Map but anything else. Without this line the `not an array`
    // branch had no witness at all, and v119's first probe run came back with arm
    // `02-loader-accepts-a-non-array-envelope` as a SURVIVOR: deleting the check left the reader throwing a
    // TypeError out of a for-loop instead of refusing, and nothing in the plane could tell.
    expect(() => runtime.restoreCinematic({ ...saved, sequences: 'nope' } as unknown as SerializedCinematic))
      .toThrow(/sequences is string, not an array of \[key, sequence\] pairs/);
    expect(runtime.restoreCinematic(savedSnapshot([]))).toEqual({ restored: [], activeSequence: null, playheads: [] });
  });

  it('is all or nothing: a save whose second sequence is bad leaves neither of them registered', () => {
    const saved = savedSnapshot([
      savedSequence({ id: 'first' }),
      savedSequence({ id: 'second', shots: [savedShot({ id: 's9', cameraId: 'ghost' as CameraId })] }),
    ]);
    expect(() => runtime.restoreCinematic(saved)).toThrow(/shot s9 names camera ghost, which is not in scene[\s\S]*the restore rolled back: the 1 sequence\(s\) it had already registered \(first\) were removed again/);
    expect(runtime.cinematicFieldAudit('first')).toBe(undefined);
    expect(() => runtime.playCinematic('first')).toThrow(/no sequence named first is registered/);
  });

  it('rolls the registry back but cannot un-say the events it already emitted', () => {
    const defined: string[] = [];
    runtime.addEventListener('cinematicDefined', (d: { sequenceId: string }) => defined.push(d.sequenceId));
    const saved = savedSnapshot([
      savedSequence({ id: 'first' }),
      savedSequence({ id: 'second', shots: [savedShot({ cameraPath: savedCurve([[0, 0, 0]]) })] }),
    ]);
    expect(() => runtime.restoreCinematic(saved)).toThrow(/names 1 control point/);
    // The half of the truth a rollback cannot reach: a listener was told about `first`, and `first` is gone.
    expect(defined).toEqual(['first']);
    expect(runtime.cinematicFieldAudit('first')).toBe(undefined);
    expect(runtime.cinematicSnapshot().sequences.length).toBe(0);
  });

  it('refuses to take a slot that is already full, and leaves the sequence that holds it alone', () => {
    define({ id: 'live', shots: [shot({ id: 'l0', cameraId: camA, endTime: 4 })] });
    expect(runtime.playCinematic('live')).toBe(true);
    const saved = savedSnapshot([savedSequence({ id: 'guest', playing: true })], { activeSequence: 'guest', currentTime: 1 });
    expect(() => runtime.restoreCinematic(saved)).toThrow(/"guest" cannot take the active slot because this runtime is already playing live/);
    expect(runtime.cinematicFieldAudit('guest')).toBe(undefined);
    expect(runtime.cinematicFieldAudit('live')!.playhead.playing).toBe(true);
  });

  it('meets defineCinematic\'s own duplicate-id door when the runtime already owns the saved id', () => {
    define();
    expect(() => runtime.restoreCinematic(savedSnapshot([savedSequence()])))
      .toThrow(/a sequence named seq is already registered[\s\S]*the restore rolled back: nothing had been registered/);
  });

  it('plays a restored sequence like the one it was saved from, step for step', () => {
    define();
    runtime.playCinematic('seq');
    runtime.simulateFrame(2.5); // inside shot 1, which names camB
    const saved = runtime.cinematicSnapshot();

    const rebuilt = runtimeRebuiltFrom(saved);
    rebuilt.restoreCinematic(saved);
    // At the saved instant the two runtimes agree about everything the shape carries, including which shot
    // the next frame will pick: `currentShot` is still 0 in both, because a frame has not run in the
    // restored one and the player is the only thing that writes that field.
    rebuilt.simulateFrame(0);
    expect([rebuilt.cinematicFieldAudit('seq')!.playhead.time, runtime.cinematicFieldAudit('seq')!.playhead.time]).toEqual([2.5, 2.5]);
    expect(rebuilt.cinematicSnapshot().currentTime).toBe(runtime.cinematicSnapshot().currentTime);
    expect([rebuilt.cinematicFieldAudit('seq')!.playhead.shotId, rebuilt.cinematicFieldAudit('seq')!.playhead.cameraId])
      .toEqual(['s1', camB]);
    // Then both step by the same delta, and the resume stays where the original is.
    rebuilt.simulateFrame(1);
    runtime.simulateFrame(1);
    expect(rebuilt.cinematicSnapshot().currentTime).toBe(3.5);
    expect(runtime.cinematicSnapshot().currentTime).toBe(3.5);
    expect([rebuilt.cinematicFieldAudit('seq')!.playhead.currentShot, runtime.cinematicFieldAudit('seq')!.playhead.currentShot])
      .toEqual([1, 1]);
  });

  it('a save this runtime wrote is a save this runtime can read, twice around', () => {
    const path = curve([0, 0, 0], [3, 4, 0], [6, 1, 0], [9, 5, 0]);
    path.curveType = 'chordal';
    path.tension = 0.9;
    path.closed = true;
    define({
      shots: [shot({
        id: 's0',
        cameraId: camA,
        endTime: 2,
        cameraPath: path,
        targetPath: curve([10, 0, 0], [12, 2, 0], [14, 4, 0]),
        fovAnimation: { start: 40, end: 60, easing: 'easeInOut' },
        postProcessing: { enabled: true, passes: [{ type: 'bloom', enabled: true, parameters: { strength: 0.7 } }] },
      })],
    });
    runtime.playCinematic('seq');
    runtime.simulateFrame(1);

    const first = runtime.cinematicSnapshot();
    const rebuilt = runtimeRebuiltFrom(first);
    rebuilt.restoreCinematic(first);
    // One full turn of the codec: snapshot → save → restore → snapshot, and the two saves are the same bytes.
    expect(rebuilt.cinematicSnapshot()).toEqual(first);
    rebuilt.simulateFrame(0);
    expect(rebuilt.getScene(scene)!.cameras.get(camA)!.threeCamera.position.distanceTo(cameraPos(camA))).toBe(0);
    expect(rebuilt.getScene(scene)!.cameras.get(camA)!.threeCamera.fov)
      .toBe(runtime.getScene(scene)!.cameras.get(camA)!.threeCamera.fov);
  });

  it('a live curve does not survive a JSON write as a curve, which is what the serialized form is for', () => {
    const path = curve([0, 0, 0], [3, 4, 0], [6, 1, 0], [9, 5, 0]);
    define({ shots: [shot({ id: 's0', cameraId: camA, endTime: 2, cameraPath: path })] });
    const saved = runtime.cinematicSnapshot();

    // What v117's snapshot would have written: the LIVE curve flattened. Its numbers arrive and its methods
    // do not, so that save restores as an object which answers `getPointAt` with `undefined`.
    const flattenedLive = JSON.parse(JSON.stringify(path)) as { points: unknown[]; getPointAt?: unknown };
    expect(typeof flattenedLive.getPointAt).toBe('undefined');
    expect(flattenedLive.points).toHaveLength(4);

    // The shape a caller actually writes: values all the way down, so a disk trip changes nothing, and the
    // only thing that does not survive JSON is the Map at the top of it — which `restoreCinematic` refuses.
    const roundTripped = JSON.parse(JSON.stringify(saved.sequences.map(([, entry]) => entry))) as SerializedCinematicSequence[];
    const asSave: SerializedCinematic = {
      sequences: roundTripped.map((entry) => [entry.id, entry]),
      activeSequence: null,
      currentTime: 0,
    };
    const rebuilt = runtimeRebuiltFrom(asSave);
    expect(rebuilt.restoreCinematic(asSave).restored).toEqual(['seq']);
    expect(rebuilt.cinematicSnapshot()).toEqual(asSave);
  });
});

describe('the save split moved: cinematic has a writer AND a reader', () => {
  it('cinematic is savable now, and the live-curve reason is gone from the shipped table', () => {
    const hero = runtime.createEntity(scene, 'Hero', 'mesh').id;
    define({ shots: [shot({ id: 's0', cameraId: camA, endTime: 2, cameraPath: curve([0, 0, 0], [1, 1, 1], [2, 0, 0]) })] });
    runtime.playCinematic('seq');
    const audit = runtime.saveFeasibilityAudit(scene, hero)!;
    expect(audit.savable).toEqual(['entities', 'cinematic']);
    expect(audit.blocked.map((entry) => entry.field)).toEqual(['sceneGraph', 'npcs', 'quests', 'player', 'worldState']);
    // v117's row was blocked because nothing rebuilt a curve from points. That reason must not survive the
    // reader it describes, and neither may the older one about the stub that shipped until v116.
    expect(JSON.stringify(audit.blocked), 'a stale blocker for a field that is now savable').not.toMatch(/CatmullRomCurve3|empty stub/);
  });

  it('the shape declares the scene its shots address, and the snapshot fills it', () => {
    expect(declaredFields('SerializedCinematicSequence').sort()).toEqual(
      ['currentShot', 'duration', 'id', 'name', 'playing', 'sceneId', 'shots'].sort(),
    );
    define();
    const saved = sequenceOf(runtime.cinematicSnapshot(), 'seq')!;
    expect(Object.keys(saved).sort()).toEqual(declaredFields('SerializedCinematicSequence').sort());
    expect(saved.sceneId).toBe(scene);
  });

  it('saves the scene a sequence belongs to, not the one happening to be on screen', () => {
    const stage = freshScene('Stage');
    const cam = runtime.createCamera(stage, 'OnStage').id;
    define({ id: 'onStage', shots: [shot({ id: 'o0', cameraId: cam })] }, stage);
    runtime.setActiveScene(scene); // look away: the sequence is dormant, and still belongs where it is
    const saved = sequenceOf(runtime.cinematicSnapshot(), 'onStage')!;
    expect(saved.sceneId).toBe(stage);
    expect(runtime.getScene(scene)!.cameras.has(cam)).toBe(false);
    // Read back with the stage looked at again — the save is what says which scene to open.
    runtime.setActiveScene(stage);
    expect(runtime.restoreCinematic({
      sequences: [['revived', { ...saved, id: 'revived' }]],
      activeSequence: null,
      currentTime: 0,
    }).restored).toEqual(['revived']);
  });

  it('SerializedCinematic still spells its own three fields, and its sequences are the serialized record', () => {
    define();
    expect(declaredFields('SerializedCinematic').sort()).toEqual(['activeSequence', 'currentTime', 'sequences']);
    const saved = runtime.cinematicSnapshot();
    expect(Object.keys(sequenceOf(saved, 'seq')!).sort()).toEqual(declaredFields('SerializedCinematicSequence').sort());
    // The live type has no scene field; the save type must, which is the asymmetry the reader discovered.
    expect(declaredFields('CinematicSequence')).not.toContain('sceneId');
  });
});

/**
 * M5 v121 — the hole v117, v119 and v120 each named in writing: a sequence could be registered and played but
 * never un-registered, so a save whose second half failed left the first half installed and a taken id could
 * never be re-registered. `removeCinematic` closes that, and two shipped sentences about being unable to
 * unregister are retired with it — one of them pinned by a test below, because a stale claim in a message is
 * exactly the kind of sentence nobody goes back to delete.
 */
describe('removeCinematic / clearCinematics — the registry can give an id back', () => {
  it('un-registers a stopped sequence, says so on the bus, and frees the id for a new definition', () => {
    const removed: object[] = [];
    runtime.addEventListener('cinematicRemoved', (d) => removed.push(d));
    define();
    runtime.playCinematic('seq');
    runtime.simulateFrame(1);
    expect(runtime.stopCinematic('seq')).toBe(true);

    expect(runtime.removeCinematic('seq')).toBe(true);
    expect(removed).toEqual([{ sequenceId: 'seq', sceneId: scene }]);
    expect(runtime.cinematicFieldAudit('seq')).toBe(undefined);
    expect(runtime.cinematicSnapshot().sequences).toEqual([]);
    // The capability the old refusal said did not exist.
    expect(() => define()).not.toThrow();
    expect(runtime.cinematicFieldAudit('seq')!.playhead.duration).toBe(5);
  });

  it('refuses to remove a playing sequence, and answers false for one that was never registered', () => {
    const stopped: object[] = [];
    runtime.addEventListener('cinematicStopped', (d) => stopped.push(d));
    define();
    runtime.playCinematic('seq');
    expect(() => runtime.removeCinematic('seq')).toThrow(/"seq" is playing; call stopCinematic first/);
    expect(stopped, 'a removal that stopped the cutscene for you would emit an event nobody asked for').toEqual([]);
    expect(runtime.cinematicFieldAudit('seq')!.playhead.playing).toBe(true);
    expect(runtime.removeCinematic('never')).toBe(false);
  });

  it('clearCinematics removes the idle ones and reports the playing one rather than interrupting it', () => {
    const removed: { sequenceId: string; sceneId: SceneId }[] = [];
    const stopped: object[] = [];
    runtime.addEventListener('cinematicRemoved', (d) => removed.push(d as { sequenceId: string; sceneId: SceneId }));
    runtime.addEventListener('cinematicStopped', (d) => stopped.push(d));
    define();
    define({ id: 'idle', shots: [shot({ id: 'i0', cameraId: camB })] });
    runtime.playCinematic('seq');
    expect(runtime.clearCinematics()).toEqual({ removed: ['idle'], stillPlaying: ['seq'] });
    // One event per sequence that actually went away — the batch path is the same removal, and it says so the
    // same way. (v121's first probe run silenced exactly this emit and nothing was red: an absent case.)
    expect(removed).toEqual([{ sequenceId: 'idle', sceneId: scene }]);
    expect(stopped, 'clearing did not stop the playing one').toEqual([]);
    expect(runtime.cinematicSnapshot().sequences.map(([id]) => id)).toEqual(['seq']);
    runtime.stopCinematic('seq');
    expect(runtime.clearCinematics()).toEqual({ removed: ['seq'], stillPlaying: [] });
    expect(removed.map((e) => e.sequenceId)).toEqual(['idle', 'seq']);
    expect(runtime.cinematicSnapshot().sequences).toEqual([]);
  });

  it('the duplicate-id refusal now names removeCinematic, and the shipped prose no longer claims the opposite', () => {
    define();
    expect(() => define()).toThrow(/a sequence named seq is already registered; removeCinematic it first/);
    const shipped = readFileSync(new URL('../src/threeRuntime.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    // Scan the refusal messages, not the prose: a docstring is allowed to QUOTE a retired sentence in order to
    // say it was retired, and a thrown message is not.
    const messages = shipped.split('\n').filter((line) => line.includes('throw new Error(')).join('\n');
    expect(messages, 'v121 gave the runtime a way to unregister; a refusal still saying otherwise is a lie to the caller')
      .not.toMatch(/no way to unregister/);
    expect(messages).toMatch(/is already registered; removeCinematic it first/);
    expect(messages).toMatch(/removeCinematic: "\$\{id\}" is playing; call stopCinematic first/);
  });
});
