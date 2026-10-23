// v430 — the RENDERER SEAM's own rules, graded directly.
//
// The seam exists (v108) so everything ABOVE the renderer is testable without a GPU, but the seam itself
// had no case of its own: the headless backend's contracts (what it records, what it refuses to invent),
// the honest GL probe and the scheduler's selection were reached only through the runtime tests that
// happened to drive them. Measured on HEAD: renderBackend.ts ships with no test file beside it. These
// cases grade the seam on its own terms — a headless backend that cannot know a triangle count must SAY
// zero rather than invent one, a scheduler must name which implementation is in force rather than let a
// caller guess, and a manual scheduler must run a callback exactly when a test says so.
import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  createHeadlessBackend,
  webglAvailable,
  defaultFrameScheduler,
  manualFrameScheduler,
} from '../src/index.js';

const CONFIG = {
  renderer: { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'default' as const, stencil: false, depth: false, logarithmicDepthBuffer: false },
  shadowMap: { enabled: true, type: THREE.PCFSoftShadowMap, autoUpdate: false },
  toneMapping: THREE.ACESFilmicToneMapping,
  toneMappingExposure: 1.25,
  colorSpace: THREE.SRGBColorSpace,
  maxLights: 100,
  frustumCulling: true,
  sortObjects: false,
};

describe('the headless backend: records what it was asked to draw, invents nothing', () => {
  it('the state mirrors the config before any size is set', () => {
    const backend = createHeadlessBackend(CONFIG);

    expect(backend.kind).toBe('headless');
    // No GL object to hand out: a caller that needs one must use the WebGL backend, not a fake.
    expect(backend.raw).toBeUndefined();
    const s = backend.state;
    expect(s.shadowMapEnabled).toBe(true);
    expect(s.shadowMapType).toBe(THREE.PCFSoftShadowMap);
    expect(s.shadowMapAutoUpdate).toBe(false);
    expect(s.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(s.toneMappingExposure).toBe(1.25);
    expect(s.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(s.sortObjects).toBe(false);
    // Nothing has been sized yet, and the backend says so rather than guessing a viewport.
    expect(s.pixelRatio).toBe(1);
    expect(s.width).toBe(0);
    expect(s.height).toBe(0);
  });

  it('setSize and setPixelRatio move the state they name, and the last call wins', () => {
    const backend = createHeadlessBackend(CONFIG);

    backend.setSize(800, 600, false);
    expect(backend.state.width).toBe(800);
    expect(backend.state.height).toBe(600);
    backend.setSize(1024, 768, false); // updateStyle is WebGL's concern; there is no style here
    expect(backend.state.width).toBe(1024);
    expect(backend.state.height).toBe(768);
    backend.setPixelRatio(2);
    expect(backend.state.pixelRatio).toBe(2);
  });

  it('render records the scene, the camera and the object count, in order', () => {
    const backend = createHeadlessBackend(CONFIG);
    const scene = new THREE.Scene();
    scene.add(new THREE.Object3D(), new THREE.Object3D());
    const camera = new THREE.PerspectiveCamera();

    backend.render(scene, camera);
    backend.render(scene, camera);

    expect(backend.frames).toHaveLength(2);
    // The scene root itself is visited by traverse, so two children read as three objects.
    expect(backend.frames[0]!.objects).toBe(3);
    expect(backend.frames[0]!.camera).toBe(camera);
    expect(backend.frames[1]!.scene).toBe(scene);
  });

  it('stats counts the calls it made and refuses to invent the geometry tallies', () => {
    const backend = createHeadlessBackend(CONFIG);
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    backend.render(scene, new THREE.PerspectiveCamera());

    const stats = backend.stats;
    expect(stats.calls).toBe(1);
    // A headless backend cannot know how many triangles a draw produced — only a GL driver can. Zero
    // is the honest answer; a plausible number here would be a fabricated statistic.
    expect(stats.triangles).toBe(0);
    expect(stats.points).toBe(0);
    expect(stats.lines).toBe(0);
  });

  it('dispose is counted, so a double dispose is visible rather than swallowed', () => {
    const backend = createHeadlessBackend(CONFIG);

    backend.dispose();
    expect(backend.disposedCount).toBe(1);
    backend.dispose();
    expect(backend.disposedCount).toBe(2);
  });
});

describe('webglAvailable: an honest probe, never a guess', () => {
  afterEach(() => {
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  it('answers false where there is no document at all (headless Node)', () => {
    expect(webglAvailable()).toBe(false);
  });

  it('answers false when a canvas hands back no context', () => {
    (globalThis as unknown as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => null }),
    };
    expect(webglAvailable()).toBe(false);
  });

  it('answers true when a context comes back, and false when the probe THROWS', () => {
    (globalThis as unknown as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => ({}) }),
    };
    expect(webglAvailable()).toBe(true);

    (globalThis as unknown as { document?: unknown }).document = {
      createElement: () => ({
        getContext: () => {
          throw new Error('context lost');
        },
      }),
    };
    expect(webglAvailable()).toBe(false);
  });
});

describe('the default scheduler names the implementation in force', () => {
  afterEach(() => {
    delete (globalThis as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    delete (globalThis as unknown as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;
  });

  it('falls back to a timer where there is no rAF (Node)', () => {
    expect(defaultFrameScheduler().kind).toBe('timer');
  });

  it('uses rAF when the host really has it, and delegates both ways', () => {
    const seen: Array<number | string> = [];
    let nextHandle = 7;
    (globalThis as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame = (cb: () => void) => {
      seen.push('raf');
      cb();
      return nextHandle++;
    };
    (globalThis as unknown as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = (handle: number) => {
      seen.push(handle);
    };

    const scheduler = defaultFrameScheduler();
    expect(scheduler.kind).toBe('raf');
    const handle = scheduler.request(() => {});
    expect(seen).toEqual(['raf']); // the callback ran through the host's rAF, not a copy of it
    scheduler.cancel(handle);
    expect(seen).toEqual(['raf', handle]); // and the cancel went to the host too
  });
});

describe('the manual scheduler: frames run when a test says, and only then', () => {
  it('runs every queued callback exactly once per step, and a callback scheduled DURING a step waits for the next', () => {
    const scheduler = manualFrameScheduler();
    const ran: string[] = [];

    scheduler.request(() => {
      ran.push('first');
      scheduler.request(() => ran.push('nested'));
    });
    expect(scheduler.pending()).toBe(1);
    expect(scheduler.step()).toBe(1);
    expect(ran).toEqual(['first']);
    // The nested request landed while stepping; it is not swallowed by the step already running.
    expect(scheduler.pending()).toBe(1);
    expect(scheduler.step()).toBe(1);
    expect(ran).toEqual(['first', 'nested']);
    expect(scheduler.pending()).toBe(0);
    expect(scheduler.step()).toBe(0);
  });

  it('cancel removes a pending frame, and cancelling an unknown handle is a no-op', () => {
    const scheduler = manualFrameScheduler();
    const ran: string[] = [];
    const kept = scheduler.request(() => ran.push('kept'));
    const dropped = scheduler.request(() => ran.push('dropped'));

    scheduler.cancel(dropped);
    scheduler.cancel(999); // a handle nobody queued
    expect(scheduler.pending()).toBe(1);
    expect(scheduler.step()).toBe(1);
    expect(ran).toEqual(['kept']);
    expect(kept).not.toBe(dropped); // handles are distinct
  });
});
