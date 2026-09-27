import * as THREE from 'three';
import type { ThreeRuntimeConfig } from './types.js';

/**
 * M5 v108 — the RENDERER SEAM.
 *
 * Why this exists (§60, stated): the runtime used to construct `new THREE.WebGLRenderer({ canvas })`
 * inline inside `initialize()`. A `WebGLRenderer` needs a live GL context, so **nothing** above that
 * line was testable without a GPU: 26 of this package's 27 tests failed in headless Node with
 * `THREE.WebGLRenderer: Error creating WebGL context`, and the one that passed was the constructor.
 * The whole scene graph, camera, animation, event and lifecycle surface — all of it GL-free in
 * principle — was unreachable in CI.
 *
 * So the runtime now depends on this interface rather than on a concrete renderer, exactly the way
 * ADR 0005 split the Studio's scene graph from its canvas: the model composes, the backend draws.
 * Production passes the WebGL backend (behaviour unchanged, settings applied inside it); tests and
 * headless/SSR callers pass the recording backend and can then verify every decision ABOVE the seam.
 *
 * It is also the seam M5/M6 need on their own terms: a cinematic slice or an agent-driven scene
 * check has to compose and inspect a scene with no browser present, and this is what makes that a
 * supported path rather than a test-only hack.
 */

/** The renderer settings the runtime configures, as a readable snapshot — WebGL applies them, the
 *  headless backend records them, and both expose them here so a test can assert the wiring. */
export interface RenderBackendState {
  shadowMapEnabled: boolean;
  shadowMapType: THREE.ShadowMapType;
  shadowMapAutoUpdate: boolean;
  toneMapping: THREE.ToneMapping;
  toneMappingExposure: number;
  outputColorSpace: THREE.ColorSpace;
  sortObjects: boolean;
  pixelRatio: number;
  width: number;
  height: number;
}

export interface RenderBackend {
  /** Which implementation this is: `'webgl'` or `'headless'`. Never guessed by callers. */
  readonly kind: string;
  /** Settings actually in force, after the runtime's config was applied. */
  readonly state: RenderBackendState;
  setSize(width: number, height: number, updateStyle: boolean): void;
  setPixelRatio(ratio: number): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  /** Render statistics, mirroring the `WebGLRenderer.info.render` fields the runtime reports. */
  readonly stats: { calls: number; triangles: number; points: number; lines: number };
  dispose(): void;
  /** The wrapped renderer, when the backend owns one. `undefined` for the headless backend, which
   *  deliberately has no GL object to hand out — a caller that needs one must use WebGL. */
  readonly raw?: THREE.WebGLRenderer;
}

export type RenderBackendFactory = (
  canvas: HTMLCanvasElement | OffscreenCanvas,
  config: ThreeRuntimeConfig,
) => RenderBackend;

function initialState(config: ThreeRuntimeConfig): RenderBackendState {
  return {
    shadowMapEnabled: config.shadowMap.enabled,
    shadowMapType: config.shadowMap.type,
    shadowMapAutoUpdate: config.shadowMap.autoUpdate,
    toneMapping: config.toneMapping,
    toneMappingExposure: config.toneMappingExposure,
    outputColorSpace: config.colorSpace,
    sortObjects: config.sortObjects,
    pixelRatio: 1,
    width: 0,
    height: 0,
  };
}

/**
 * The production backend: a real `THREE.WebGLRenderer`, configured exactly as the runtime used to
 * configure it inline. Every setting the old code touched is applied HERE, so moving the code behind
 * the seam did not change what a browser gets.
 */
export function createWebGLBackend(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  config: ThreeRuntimeConfig,
): RenderBackend {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: config.renderer.antialias,
    alpha: config.renderer.alpha,
    preserveDrawingBuffer: config.renderer.preserveDrawingBuffer,
    powerPreference: config.renderer.powerPreference,
    stencil: config.renderer.stencil,
    depth: config.renderer.depth,
    logarithmicDepthBuffer: config.renderer.logarithmicDepthBuffer,
  });

  renderer.shadowMap.enabled = config.shadowMap.enabled;
  renderer.shadowMap.type = config.shadowMap.type;
  renderer.shadowMap.autoUpdate = config.shadowMap.autoUpdate;
  renderer.toneMapping = config.toneMapping;
  renderer.toneMappingExposure = config.toneMappingExposure;
  renderer.outputColorSpace = config.colorSpace;
  renderer.sortObjects = config.sortObjects;
  // NOTE: the config used to carry `physicallyCorrectLights`, and this line used to assign it. three
  // r155 REMOVED that property (the renderer is always physically correct now), so the assignment was
  // both a type error and a lie about what the switch did. The field is gone rather than kept as a
  // no-op, because a config option that changes nothing is exactly the kind of claim §60 exists for.

  const state = initialState(config);

  return {
    kind: 'webgl',
    raw: renderer,
    state,
    setSize(width, height, updateStyle) {
      renderer.setSize(width, height, updateStyle);
      state.width = width;
      state.height = height;
    },
    setPixelRatio(ratio) {
      renderer.setPixelRatio(ratio);
      state.pixelRatio = ratio;
    },
    render(scene, camera) {
      renderer.render(scene, camera);
    },
    get stats() {
      const r = renderer.info.render;
      return { calls: r.calls, triangles: r.triangles, points: r.points, lines: r.lines };
    },
    dispose() {
      renderer.dispose();
    },
  };
}

/** One recorded `render()` call, so a headless test can assert WHAT was drawn and with which camera. */
export interface HeadlessFrame {
  scene: THREE.Scene;
  camera: THREE.Camera;
  /** Scene-space object count at draw time — a cheap, honest "did the graph reach the backend". */
  objects: number;
}

export interface HeadlessBackend extends RenderBackend {
  /** Every `render()` call, in order. */
  readonly frames: HeadlessFrame[];
  /** How many times the backend was disposed — `dispose()` must be idempotent-safe to observe. */
  readonly disposedCount: number;
}

/**
 * The headless backend: records what it was asked to draw and never touches a GPU.
 *
 * It deliberately reports `triangles`/`points`/`lines` as 0 rather than inventing plausible numbers.
 * A headless backend cannot know how many triangles a draw produced — only a real GL driver can — so
 * a non-zero count here would be a fabricated statistic, which is precisely the §60 failure this
 * project keeps writing amendments about. `calls` IS knowable (it counts `render()` invocations) and
 * is reported; the geometry-dependent fields stay zero and are documented as such.
 */
export function createHeadlessBackend(config: ThreeRuntimeConfig): HeadlessBackend {
  const state = initialState(config);
  const frames: HeadlessFrame[] = [];
  let disposedCount = 0;

  return {
    kind: 'headless',
    state,
    frames,
    get disposedCount() {
      return disposedCount;
    },
    setSize(width, height) {
      state.width = width;
      state.height = height;
    },
    setPixelRatio(ratio) {
      state.pixelRatio = ratio;
    },
    render(scene, camera) {
      let objects = 0;
      scene.traverse(() => {
        objects += 1;
      });
      frames.push({ scene, camera, objects });
    },
    get stats() {
      // `calls` is a fact about this backend; the geometry tallies are NOT knowable without a GPU.
      return { calls: frames.length, triangles: 0, points: 0, lines: 0 };
    },
    dispose() {
      disposedCount += 1;
    },
  };
}

/** True when this environment can construct a real WebGL renderer. Used to pick a default honestly
 *  rather than letting `initialize()` throw where no GL context exists. */
export function webglAvailable(): boolean {
  try {
    if (typeof document === 'undefined') return false;
    const probe = document.createElement('canvas');
    return Boolean(
      probe.getContext('webgl2') || probe.getContext('webgl') || probe.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

/**
 * M5 v108 — the FRAME SCHEDULER seam.
 *
 * `requestAnimationFrame` does not exist in Node, so the render loop threw `ReferenceError` the
 * moment `start()` was called outside a browser. That is the same class of fault as the renderer
 * seam beside it: the loop's *logic* (delta, animation update, backend render, stats, `frame` event)
 * has nothing to do with the browser, but it was welded to a browser-only global.
 *
 * A scheduler is therefore injectable. The default picks rAF when the host really has it and falls
 * back to a timer otherwise, so `start()` works headlessly; a test can also inject a MANUAL scheduler
 * and step frames one at a time, which is what makes loop behaviour deterministic to assert.
 */
export interface FrameScheduler {
  /** Schedule `cb` for the next frame; returns a handle usable with `cancel`. */
  request(cb: () => void): number;
  cancel(handle: number): void;
  /** Which implementation is in force, so a caller never has to guess. */
  readonly kind: 'raf' | 'timer' | 'manual';
}

/** rAF when present, a ~60 Hz timer otherwise. Chosen ONCE so ids are never mixed between the two. */
export function defaultFrameScheduler(): FrameScheduler {
  if (typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function') {
    return {
      kind: 'raf',
      request: (cb) => requestAnimationFrame(cb),
      cancel: (handle) => cancelAnimationFrame(handle),
    };
  }
  return {
    kind: 'timer',
    request: (cb) => setTimeout(cb, 16) as unknown as number,
    cancel: (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
  };
}

/** A scheduler that only runs when `step()` is called — deterministic frame control for tests. */
export function manualFrameScheduler(): FrameScheduler & { step(): number; pending(): number } {
  let next = 1;
  const queue = new Map<number, () => void>();
  return {
    kind: 'manual',
    request(cb) {
      const handle = next++;
      queue.set(handle, cb);
      return handle;
    },
    cancel(handle) {
      queue.delete(handle);
    },
    pending() {
      return queue.size;
    },
    /** Run every callback queued so far, once. Returns how many ran. */
    step() {
      const due = [...queue.entries()];
      queue.clear();
      for (const [, cb] of due) cb();
      return due.length;
    },
  };
}
