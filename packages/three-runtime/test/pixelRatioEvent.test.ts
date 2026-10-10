// M5 v218 — `setPixelRatio` wrote a REPORTED field in silence: the runtime's own `resize` has announced
// itself on the event bus since always, and `initialize` announces the backend it builds, but this verb
// changes `backend.state.pixelRatio`, which is exactly the `pixels.pixelRatio` the Studio surface reports,
// and no name on the bus carried the news. An out-of-band ratio change therefore left the panel showing a
// pixel figure that was no longer in force. This verb now emits AFTER the backend has taken the value, and
// a call with no backend — which can change no state — announces nothing.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  ThreeRuntime,
  createHeadlessBackend,
  manualFrameScheduler,
  type HeadlessBackend,
} from '../src/index.js';

const CONFIG = {
  renderer: { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'default' as const, stencil: false, depth: false, logarithmicDepthBuffer: false },
  shadowMap: { enabled: false, type: THREE.BasicShadowMap, autoUpdate: false },
  toneMapping: THREE.NoToneMapping,
  toneMappingExposure: 1,
  colorSpace: 'srgb' as const,
  maxLights: 100,
  frustumCulling: true,
  sortObjects: true,
};

function headlessRuntime() {
  let backend: HeadlessBackend | null = null;
  const scheduler = manualFrameScheduler();
  const runtime = new ThreeRuntime(
    CONFIG,
    {
      backend: () => {
        backend = createHeadlessBackend(CONFIG);
        return backend;
      },
      scheduler,
    },
  );
  const mockCanvas = { width: 800, height: 600, style: {}, addEventListener() {}, removeEventListener() {}, getContext: () => null } as unknown as HTMLCanvasElement;
  runtime.initialize(mockCanvas);
  return { runtime, scheduler, backend: backend! };
}

interface RatioData {
  ratio: number;
}
interface ResizeData {
  width: number;
  height: number;
}

describe('M5 v218 — setPixelRatio announces the ratio it applied', () => {
  let runtime: ThreeRuntime;
  let backend: HeadlessBackend;
  let changed: RatioData[];
  let resized: ResizeData[];

  const listen = () => {
    runtime.addEventListener('pixelRatioChanged', (data?: unknown) => changed.push(data as RatioData));
    runtime.addEventListener('resize', (data?: unknown) => resized.push(data as ResizeData));
  };

  beforeEach(() => {
    const headless = headlessRuntime();
    runtime = headless.runtime;
    backend = headless.backend;
    changed = [];
    resized = [];
    listen();
  });

  it('a successful ratio change emits pixelRatioChanged exactly once, with the ratio asked for', () => {
    runtime.setPixelRatio(2);

    expect(changed).toEqual([{ ratio: 2 }]);
  });

  it('the announcement arrives AFTER the backend took the value: a listener reading the state sees the NEW ratio', () => {
    // The ordering is the whole grant. The runtime's emit try/CATCHES each listener, so an inline expect
    // would be swallowed — RECORD what the listener read from the BACKEND (not the payload) and assert
    // outside, the rule v211 established for the entity verbs.
    const ratioAtEmit: number[] = [];
    runtime.addEventListener('pixelRatioChanged', () => {
      ratioAtEmit.push(backend.state.pixelRatio);
    });
    runtime.setPixelRatio(1.5);

    expect(ratioAtEmit).toEqual([1.5]);
    expect(backend.state.pixelRatio).toBe(1.5);
  });

  it('a call BEFORE initialize() is SILENT: there is no backend whose state could change, so there is no news', () => {
    const fresh = new ThreeRuntime(CONFIG, {
      backend: () => createHeadlessBackend(CONFIG),
      scheduler: manualFrameScheduler(),
    });
    const seen: RatioData[] = [];
    fresh.addEventListener('pixelRatioChanged', (data?: unknown) => seen.push(data as RatioData));

    expect(fresh.getBackend()).toBeNull();
    fresh.setPixelRatio(3);

    expect(seen).toEqual([]);
  });

  it('the write survives a listener that throws: the value is applied before the emit, so the announce cannot un-apply it', () => {
    // v211's swallowed-expect rule turned into a case: a throwing listener is caught by `emit`, and what
    // the reporter must not be able to do is leave the STATE half-applied.
    runtime.addEventListener('pixelRatioChanged', () => {
      throw new Error('a listener that fails');
    });
    const before = backend.state.pixelRatio;

    expect(() => runtime.setPixelRatio(4)).not.toThrow();
    expect(backend.state.pixelRatio).toBe(4);
    expect(before).not.toBe(4);
  });

  it('the bus reports ASKS, not deltas: setting the ratio it already holds still announces, and still writes', () => {
    runtime.setPixelRatio(2);
    runtime.setPixelRatio(2);

    // Honest about the mechanism: the verb does not compare against the old value, so a subscriber re-reads
    // once per call. A dedup would be a different claim, and a leg that re-reads a report is cheap.
    expect(changed).toEqual([{ ratio: 2 }, { ratio: 2 }]);
  });

  it('the two pixels names do not cross: a resize announces geometry, a ratio change announces ratio', () => {
    runtime.resize(640, 480);
    runtime.setPixelRatio(2);

    expect(resized).toEqual([{ width: 640, height: 480 }]);
    expect(changed).toEqual([{ ratio: 2 }]);
  });

  it('removeEventListener silences the verb: after unsubscribe, further changes announce nothing', () => {
    const listener = (data?: unknown) => changed.push(data as RatioData);
    runtime.addEventListener('pixelRatioChanged', listener);
    runtime.setPixelRatio(1);
    runtime.removeEventListener('pixelRatioChanged', listener);
    runtime.setPixelRatio(3);

    // The beforeEach listener shares this ledger, so the first call pushes twice (both listeners live) and
    // the second pushes once (only the shared one) — the ADDED listener heard exactly once.
    expect(changed.map((c) => c.ratio)).toEqual([1, 1, 3]);
  });
});
