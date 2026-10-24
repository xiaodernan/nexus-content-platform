/**
 * M7 v505 (ADR 0016 amendment 498) — the STUDIO ROOT, graded by static rendering.
 *
 * The gap. Every panel, every composer, the dock, the toolbar and all four surfaces now have direct
 * tests (v500–v504), and the one component that had never been asked anything is the one that holds
 * them all together: the Studio root. Its contract is COMPOSITION — which panels sit in which column,
 * which surface the main pane mounts for which `surface` value, that the minimap belongs to the 2D
 * surface alone, that the preview overlay exists only while `previewOpen`. A root that drops a panel
 * or mounts two surfaces at once is broken in a way no per-panel test can see, because every panel
 * still passes its own suite.
 *
 * The proof. Static rendering (v500) renders the whole shell against a driven store and pins the
 * composition. Nine cases: the root names its surface; the default pane is the canvas WITH its
 * minimap and nothing else; each of the three other surfaces mounts alone and unmounts the canvas and
 * the minimap; the three columns carry the families they were given; the preview overlay follows
 * `previewOpen`; and no composer overlay exists at rest. The last case renders the entire shell at
 * once and requires the toolbar, the canvas, the properties panel, the dock and the history panel to
 * be present together — the composition itself, graded.
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
 * root loads — it is imported dynamically in `beforeAll` for exactly this reason — gives the classic
 * output something to find, without editing source files or the shared vitest config a parallel lane
 * holds.
 */
(globalThis as unknown as { React: typeof React }).React = React;

/**
 * Why the mirror. React renders on the server from a store’s INITIAL state: zustand hands
 * `getInitialState` to `useSyncExternalStore` as the server snapshot, so the shell asked with
 * `renderToStaticMarkup` answers with the state the module was created with — every store action a
 * test ran beforehand is invisible to it. So the live state is mirrored onto that object before each
 * render. The shell, its selectors and the actions that build the state are the real ones; only the
 * snapshot React asks for is the driven one.
 */
function mirrorLiveStateIntoServerSnapshot(): void {
  const initial = useStudio.getInitialState() as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(useStudio.getState() as unknown as Record<string, unknown>)) {
    if (typeof value !== 'function') initial[key] = value;
  }
}

let Studio: ComponentType<Record<string, unknown>>;

beforeAll(async () => {
  Studio = (await import('./Studio')).default as unknown as ComponentType<Record<string, unknown>>;
});

const st = () => useStudio.getState();
const render = (): string => {
  mirrorLiveStateIntoServerSnapshot();
  return renderToStaticMarkup(React.createElement(Studio, {}));
};
const countOf = (html: string, needle: string): number => html.split(needle).length - 1;

beforeEach(() => {
  useStudio.setState({ aiBusy: false, hoverId: null, mode: 'demo', previewOpen: false, surface: '2d' });
  st().newProject();
});

describe('Studio — the root that holds every surface together (v505)', () => {
  it('names the surface it is showing on the root element', () => {
    expect(render()).toContain('data-surface="2d"');
    st().setSurface('world');
    expect(render()).toContain('data-surface="world"');
  });

  it('the default pane is the canvas, and the minimap belongs to it alone', () => {
    const html = render();
    expect(html).toContain('id="nexus-canvas"');
    expect(html).toContain('aria-label="Minimap"');
    expect(html).not.toContain('id="nexus-scene3d"');
    expect(html).not.toContain('id="nexus-world"');
    expect(html).not.toContain('id="nexus-assets"');
  });

  it('the 3D surface mounts alone, and the canvas and minimap leave with it', () => {
    st().setSurface('3d');
    const html = render();
    expect(html).toContain('id="nexus-scene3d"');
    expect(html).not.toContain('id="nexus-canvas"');
    expect(html).not.toContain('aria-label="Minimap"');
    expect(html).not.toContain('id="nexus-world"');
  });

  it('the world surface mounts alone', () => {
    st().setSurface('world');
    const html = render();
    expect(html).toContain('id="nexus-world"');
    expect(html).not.toContain('id="nexus-canvas"');
    expect(html).not.toContain('aria-label="Minimap"');
    expect(html).not.toContain('id="nexus-scene3d"');
  });

  it('the assets surface mounts alone', () => {
    st().setSurface('assets');
    const html = render();
    expect(html).toContain('id="nexus-assets"');
    expect(html).not.toContain('id="nexus-canvas"');
    expect(html).not.toContain('aria-label="Minimap"');
    expect(html).not.toContain('id="nexus-scene3d"');
  });

  it('the three columns carry the families they were given', () => {
    const html = render();
    // the left rail: layers, components, design system
    expect(html).toContain('>Layers<');
    expect(html).toContain('>Components<');
    expect(html).toContain('Design System');
    // the right rail: properties, the agent dock, history
    expect(html).toContain('>Properties<');
    expect(html).toContain('Agent dock');
    expect(html).toContain('History · Snapshots');
    // the bottom of the main pane: the prompt bar
    expect(html).toContain('>Compose<');
    // and the tabs and the align bar above the canvas
    expect(html).toContain('(double-click to rename)');
    expect(html).toContain('Select layers to align');
  });

  it('the preview overlay exists only while previewOpen says so', () => {
    expect(render()).not.toContain('NEXUS Preview');
    st().setPreview(true);
    const html = render();
    expect(html).toContain('NEXUS Preview');
    expect(html).toContain('title="NEXUS Preview"');
  });

  it('no composer overlay exists at rest', () => {
    const html = render();
    expect(html).not.toContain('data-comment-composer');
    expect(html).not.toContain('data-report-composer');
    expect(html).not.toContain('data-tip-composer');
  });

  it('the whole shell composes: every family present in one render', () => {
    const html = render();
    for (const part of [
      'NEXUS', // the toolbar
      'id="nexus-canvas"', // the 2D surface
      '>Properties<', // the right rail
      'Agent dock', // the dock
      'History · Snapshots', // the history panel
      '(double-click to rename)', // the page tabs
      'Select layers to align', // the align bar
      '>Compose<', // the prompt bar
      'Design System', // the design system panel
      '>Components<', // the components panel
    ]) {
      expect(html, part).toContain(part);
    }
    // exactly one canvas, one minimap, one prompt bar: a doubled mount would pass every panel test
    expect(countOf(html, 'id="nexus-canvas"')).toBe(1);
    expect(countOf(html, 'aria-label="Minimap"')).toBe(1);
    expect(countOf(html, 'Agent dock')).toBe(1);
  });
});
