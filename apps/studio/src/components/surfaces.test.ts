/**
 * M7 v504 (ADR 0016 amendment 497) — the SURFACES, graded by static rendering.
 *
 * The gap. The Studio’s main pane is four surfaces behind one switch — the 2D canvas, the 3D scene, the
 * world, the assets — and each of them is a component whose real work happens in effects (a rAF draw
 * loop, a three.js renderer, a WorldEngine, an asset library probe) that no unit test in this repo has
 * ever run. What was never graded is the part that does NOT need an effect: the shell each surface
 * puts on screen before its engine answers, the honest word it says while waiting (`starting…`,
 * `composing…`), the controls it offers regardless, and the canvas’s own view-state grammar — the
 * crosshair that becomes a text cursor over an edit, the focus chip that names the instance being
 * drilled into. Those are the decisions a reader sees in the first frame, and they had no test.
 *
 * The proof. Static rendering (v500) asks each surface what it shows with every effect still pending.
 * Eleven cases: the canvas’s cursor and overlays follow `editingId` and `focusedInstanceId` — including
 * the guard that only an INSTANCE can be drilled into; the 3D scene wears its canvas and its control
 * pairs while its report is still `starting…`; the world and assets panels each say their one honest
 * word before their report arrives; and all four share the pane geometry the surface switch assumes.
 */
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useStudio } from '@/lib/store';
import type { ComponentType } from 'react';

/**
 * Why a global. Vitest’s esbuild runs the CLASSIC JSX transform here (the studio tsconfig asks for
 * `preserve`, and classic output is what a node test gets), so a component’s JSX compiles to a call on
 * a free variable named `React` — while the components import their hooks by name and not the
 * namespace, because in the app Next’s automatic runtime supplies it. Installing the global BEFORE the
 * surfaces load — they are imported dynamically in `beforeAll` for exactly this reason — gives the
 * classic output something to find, without editing source files or the shared vitest config a
 * parallel lane holds.
 */
(globalThis as unknown as { React: typeof React }).React = React;

/**
 * Why the mirror. React renders on the server from a store’s INITIAL state: zustand hands
 * `getInitialState` to `useSyncExternalStore` as the server snapshot, so a surface asked with
 * `renderToStaticMarkup` answers with the state the module was created with — every store action a
 * test ran beforehand is invisible to it. So the live state is mirrored onto that object before each
 * render. The surfaces, their selectors and the actions that build the state are the real ones; only
 * the snapshot React asks for is the driven one.
 */
function mirrorLiveStateIntoServerSnapshot(): void {
  const initial = useStudio.getInitialState() as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(useStudio.getState() as unknown as Record<string, unknown>)) {
    if (typeof value !== 'function') initial[key] = value;
  }
}

let surfaces: Record<string, ComponentType<Record<string, unknown>>>;

beforeAll(async () => {
  surfaces = {
    Canvas: (await import('./Canvas')).default as unknown as ComponentType<Record<string, unknown>>,
    Scene3D: (await import('./Scene3D')).default as unknown as ComponentType<Record<string, unknown>>,
    WorldPanel: (await import('./WorldPanel')).default as unknown as ComponentType<Record<string, unknown>>,
    AssetPanel: (await import('./AssetPanel')).default as unknown as ComponentType<Record<string, unknown>>,
  };
});

const st = () => useStudio.getState();
const render = (name: string): string => {
  mirrorLiveStateIntoServerSnapshot();
  return renderToStaticMarkup(React.createElement(surfaces[name]!, {}));
};
const countOf = (html: string, needle: string): number => html.split(needle).length - 1;

beforeEach(() => {
  useStudio.setState({ aiBusy: false, hoverId: null, mode: 'demo' });
  st().newProject();
});

/** A page holding a frame, which holds a leaf — used where a nested document is wanted. */
function twoShapes(): [string, string] {
  st().addShape('rectangle', { x: 40, y: 40 });
  const a = st().selection[0]!;
  st().addShape('ellipse', { x: 240, y: 40 });
  const b = st().selection[0]!;
  return [a, b];
}

/** One component with one instance of it on the page, selected. */
function oneInstance(): string {
  const [a, b] = twoShapes();
  st().select([a, b]);
  st().createComponent();
  return st().selection[0]!;
}

describe('Canvas — the 2D surface’s view-state grammar (v504)', () => {
  it('fills the pane and wears the crosshair until something is being edited', () => {
    const html = render('Canvas');
    expect(html).toContain('id="nexus-canvas"');
    expect(html).toContain('cursor:crosshair');
    expect(html).not.toContain('cursor:text');
    expect(html).not.toContain('id="nexus-focus-chip"');
  });

  it('editing a text node turns the cursor to text and lays a textarea over the canvas', () => {
    st().addShape('text', { x: 40, y: 40 });
    st().setEditing(st().selection[0]!);
    const html = render('Canvas');
    expect(html).toContain('cursor:text');
    expect(countOf(html, '<textarea')).toBe(1);
    expect(html).toContain('position:absolute');
    // the draft itself is filled by an effect once the edit opens, so the field opens empty here
    expect(html).toContain('border:1px solid #6ea8fe');
  });

  it('a focused instance is named in the focus chip, with the way out', () => {
    const inst = oneInstance();
    st().setFocused(inst);
    const html = render('Canvas');
    expect(html).toContain('id="nexus-focus-chip"');
    expect(html).toContain('Editing inside');
    expect(html).toContain('Exit (Esc)');
  });

  it('only an instance can be drilled into — a focused frame gets no chip', () => {
    const [a] = twoShapes();
    st().setFocused(a);
    expect(render('Canvas')).not.toContain('id="nexus-focus-chip"');
  });
});

describe('Scene3D — the 3D surface before its renderer answers (v504)', () => {
  it('wears its canvas, named for the surface switch', () => {
    const html = render('Scene3D');
    expect(html).toContain('id="nexus-scene3d"');
    expect(html).toContain('data-surface="3d"');
    expect(html).toContain('cursor:grab');
  });

  it('says starting… under its name while the report is still out', () => {
    const html = render('Scene3D');
    expect(html).toContain('3D SCENE (M5)');
    expect(html).toContain('starting…');
    expect(html).not.toContain('data-scene3d-frames');
  });

  it('offers its control pairs whether or not the renderer answered', () => {
    const html = render('Scene3D');
    for (const id of ['add-body', 'remove-body', 'add-camera', 'reset-view', 'save', 'save-disk', 'load', 'browse-saves', 'send-doc']) {
      expect(html).toContain('data-scene-' + id);
    }
  });
});

describe('WorldPanel — the world surface before its engine reports (v504)', () => {
  it('wears its pane and names its mode', () => {
    const html = render('WorldPanel');
    expect(html).toContain('id="nexus-world"');
    expect(html).toContain('data-surface="world"');
    expect(html).toContain('WORLD (M4)');
    expect(html).toContain('DEMO MODE · no model is attached');
  });

  it('says starting… and offers no step buttons before the first report', () => {
    const html = render('WorldPanel');
    expect(html).toContain('starting…');
    expect(html).not.toContain('data-sim-step');
    expect(html).not.toContain('data-world-stats');
  });
});

describe('AssetPanel — the assets surface before its library reports (v504)', () => {
  it('wears its pane and says the demo generators hold no pixels', () => {
    const html = render('AssetPanel');
    expect(html).toContain('id="nexus-assets"');
    expect(html).toContain('data-surface="assets"');
    expect(html).toContain('ASSETS (M3)');
    expect(html).toContain('DEMO MODE · no image or video model is attached, so these assets hold metadata and NO pixels');
  });

  it('says composing… and offers no generator form before the first report', () => {
    const html = render('AssetPanel');
    expect(html).toContain('composing…');
    expect(html).not.toContain('data-asset-generator');
    expect(html).not.toContain('data-asset-error');
  });
});

describe('the four surfaces share the pane geometry the switch assumes (v504)', () => {
  it('each one fills the pane absolutely, so the switch can swap them without a layout jump', () => {
    for (const name of ['Canvas', 'Scene3D', 'WorldPanel', 'AssetPanel']) {
      const html = render(name);
      expect(html, name).toContain('position:absolute');
      expect(html, name).toContain('inset:0');
    }
  });
});
