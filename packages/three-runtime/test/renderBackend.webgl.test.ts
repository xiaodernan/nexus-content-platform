// v476 — the PRODUCTION backend's wiring, graded directly.
//
// The seam (v108) split the renderer out so everything ABOVE it is testable without a GPU, and the
// headless half has had its own cases since v430. The WebGL half — the factory the runtime defaults to
// — had none: in Node a real WebGLRenderer cannot exist, so the factory's own decisions (which options it
// constructs the renderer with, which settings it applies, what it delegates) were reachable only in a
// browser. These cases fake the renderer ONE LEVEL BELOW the seam (the class createWebGLBackend news
// up) and grade the factory's wiring against it: the config rides in verbatim, the settings the runtime
// used to assign inline are applied here, and every method the backend exposes is the renderer's own
// call plus the state it must keep honest. The GL-less honesty of the real construction — what the
// factory does where no context exists — lives beside this file, in renderBackend.test.ts.
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createWebGLBackend } from '../src/index.js';

const fake = vi.hoisted(() => {
  const constructed: Array<Record<string, unknown>> = [];
  const instances: unknown[] = [];
  class WebGLFake {
    shadowMap = { enabled: false, type: -1, autoUpdate: true };
    toneMapping = -1;
    toneMappingExposure = -1;
    outputColorSpace = '';
    sortObjects = true;
    info = { render: { calls: 0, triangles: 0, points: 0, lines: 0 } };
    sizeCalls: unknown[][] = [];
    ratioCalls: number[] = [];
    renderCalls: unknown[][] = [];
    disposeCount = 0;
    constructor(params: Record<string, unknown>) {
      constructed.push(params);
      instances.push(this);
    }
    setSize(...args: unknown[]): void {
      this.sizeCalls.push(args);
    }
    setPixelRatio(ratio: number): void {
      this.ratioCalls.push(ratio);
    }
    render(scene: unknown, camera: unknown): void {
      this.renderCalls.push([scene, camera]);
    }
    dispose(): void {
      this.disposeCount += 1;
    }
  }
  return { WebGLFake, constructed, instances };
});

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, WebGLRenderer: fake.WebGLFake } as unknown as typeof import('three');
});

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

const canvas = { tag: 'the-canvas' } as unknown as HTMLCanvasElement;

const lastFake = (): InstanceType<typeof fake.WebGLFake> =>
  fake.instances[fake.instances.length - 1] as InstanceType<typeof fake.WebGLFake>;

describe('the WebGL backend’s wiring, graded directly (v476)', () => {
  it('constructs the renderer with exactly the config’s renderer options — the canvas and the seven switches', () => {
    fake.constructed.length = 0;

    createWebGLBackend(canvas, CONFIG);

    expect(fake.constructed).toHaveLength(1);
    expect(fake.constructed[0]).toEqual({
      canvas,
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'default',
      stencil: false,
      depth: false,
      logarithmicDepthBuffer: false,
    });
  });

  it('applies the seven settings the runtime used to assign inline, and nothing else moved', () => {
    createWebGLBackend(canvas, CONFIG);
    const renderer = lastFake();

    expect(renderer.shadowMap).toEqual({ enabled: true, type: THREE.PCFSoftShadowMap, autoUpdate: false });
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(renderer.toneMappingExposure).toBe(1.25);
    expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(renderer.sortObjects).toBe(false);
  });

  it('names itself webgl, hands the renderer out as raw, and starts unsized with the config’s settings', () => {
    const backend = createWebGLBackend(canvas, CONFIG);

    expect(backend.kind).toBe('webgl');
    expect(backend.raw as unknown).toBe(lastFake());
    expect(backend.state).toEqual({
      shadowMapEnabled: true,
      shadowMapType: THREE.PCFSoftShadowMap,
      shadowMapAutoUpdate: false,
      toneMapping: THREE.ACESFilmicToneMapping,
      toneMappingExposure: 1.25,
      outputColorSpace: THREE.SRGBColorSpace,
      sortObjects: false,
      pixelRatio: 1,
      width: 0,
      height: 0,
    });
  });

  it('setSize and setPixelRatio delegate to the renderer AND move the state they name', () => {
    const backend = createWebGLBackend(canvas, CONFIG);
    const renderer = lastFake();

    backend.setSize(800, 600, true);
    expect(renderer.sizeCalls).toEqual([[800, 600, true]]);
    expect(backend.state.width).toBe(800);
    expect(backend.state.height).toBe(600);
    backend.setPixelRatio(2);
    expect(renderer.ratioCalls).toEqual([2]);
    expect(backend.state.pixelRatio).toBe(2);
  });

  it('render and dispose delegate, and stats reads the driver’s own numbers verbatim', () => {
    const backend = createWebGLBackend(canvas, CONFIG);
    const renderer = lastFake();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();

    backend.render(scene, camera);
    expect(renderer.renderCalls).toEqual([[scene, camera]]);

    renderer.info.render = { calls: 42, triangles: 1234, points: 5, lines: 7 };
    expect(backend.stats).toEqual({ calls: 42, triangles: 1234, points: 5, lines: 7 });

    backend.dispose();
    expect(renderer.disposeCount).toBe(1);
  });
});
