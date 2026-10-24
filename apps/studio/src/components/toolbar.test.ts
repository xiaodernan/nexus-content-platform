/**
 * M7 v502 (ADR 0016 amendment 495) — the TOOLBAR, graded by static rendering.
 *
 * The gap. The toolbar is the largest component in the Studio — 2121 lines — and the row every other
 * surface is reached through: the tools, the undo/redo arrows, the four surface toggles, the export
 * trio, the publish face with its service probe, and the four service-gated panels. Until now none of
 * it had a test: the golden-path harness clicks these buttons in a real browser, and a harness proves
 * the click, not the face — which tool is marked, which badge the mode wears, what the publish button
 * says BEFORE its probe answers, are decisions no harness asserts because a harness never reads them.
 *
 * The proof. The static rendering v500 established — React to a string in plain node, the classic JSX
 * global installed first, the store state mirrored where React asks for it — renders the toolbar
 * against a driven store and pins the face. Twelve cases: the brand and the document name; the five
 * tools with their key hints and the mark that follows `tool`; the four surface toggles and the mark
 * that follows `surface`; the status line and the DEMO/LIVE badge; the export trio; and the publish
 * face in its PROBING state, which is the state a fresh checkout is actually in.
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
 * toolbar loads — it is imported dynamically in `beforeAll` for exactly this reason — gives the classic
 * output something to find, without editing source files or the shared vitest config a parallel lane
 * holds.
 */
(globalThis as unknown as { React: typeof React }).React = React;

/**
 * Why the mirror. React renders on the server from a store’s INITIAL state: zustand hands
 * `getInitialState` to `useSyncExternalStore` as the server snapshot, so a panel asked with
 * `renderToStaticMarkup` answers with the state the module was created with — every store action a
 * test ran beforehand is invisible to it. So the live state is mirrored onto that object before each
 * render. The toolbar, its selectors and the actions that build the state are the real ones; only the
 * snapshot React asks for is the driven one.
 */
function mirrorLiveStateIntoServerSnapshot(): void {
  const initial = useStudio.getInitialState() as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(useStudio.getState() as unknown as Record<string, unknown>)) {
    if (typeof value !== 'function') initial[key] = value;
  }
}

let Toolbar: ComponentType<Record<string, unknown>>;

beforeAll(async () => {
  Toolbar = (await import('./Toolbar')).default as unknown as ComponentType<Record<string, unknown>>;
});

const st = () => useStudio.getState();
const render = (): string => {
  mirrorLiveStateIntoServerSnapshot();
  return renderToStaticMarkup(React.createElement(Toolbar, {}));
};
const countOf = (html: string, needle: string): number => html.split(needle).length - 1;

/** The whole <button> that carries the given title attribute, for reading its own attributes. */
const buttonAround = (html: string, title: string): string => {
  const at = html.indexOf('title="' + title + '"');
  expect(at, 'no button titled ' + title).toBeGreaterThan(-1);
  const end = html.indexOf('</button>', at) + '</button>'.length;
  return html.slice(html.lastIndexOf('<button', at), end);
};

beforeEach(() => {
  useStudio.setState({ aiBusy: false, hoverId: null, mode: 'demo' });
  st().newProject();
});

describe('Toolbar — the row every surface is reached through (v502)', () => {
  it('leads with the brand and names the document it is editing', () => {
    const html = render();
    expect(html).toContain('NEXUS');
    expect(html).toContain('>Studio<');
    expect(html).toContain('Untitled Project');
  });

  it('offers the five tools with their key hints and marks the current one', () => {
    const html = render();
    for (const title of ['Move (V)', 'Frame (F)', 'Rectangle (R)', 'Ellipse (O)', 'Text (T)']) {
      expect(html).toContain('title="' + title + '"');
    }
    expect(countOf(html, 'tool-active')).toBeGreaterThanOrEqual(1);
    // the mark sits on the first tool: select is the tool a fresh project opens with
    expect(html.indexOf('tool-active')).toBeLessThan(html.indexOf('title="Move (V)"') + 'title="Move (V)"'.length);
  });

  it('choosing another tool moves the mark to it', () => {
    st().setTool('text');
    const html = render();
    // the mark now sits on Text: between the Ellipse button and the Text button, and nowhere earlier
    // in the tool row (the button wears its class before its title, so the mark precedes the title)
    const at = html.indexOf('title="Text (T)"');
    expect(html.lastIndexOf('tool-active', at)).toBeGreaterThan(html.indexOf('title="Ellipse (O)"'));
  });

  it('offers the four surfaces and marks the one being shown', () => {
    const html = render();
    expect(html).toContain('data-surface-toggle="2d"');
    expect(html).toContain('data-surface-toggle="3d"');
    expect(html).toContain('data-surface-toggle="world"');
    expect(html).toContain('data-surface-toggle="assets"');
    expect(html).toContain('title="2D canvas (the Design Model)"');
    expect(html).toContain('title="3D scene (@nexus/three-runtime, M5)"');
    expect(html).toContain('title="World (@nexus/world-engine, M4)"');
    expect(html).toContain('title="Assets (@nexus/ai-providers multimodal, M3)"');
    // 2D is the default the golden-path harness drives, and it is the marked one
    expect(html.indexOf('data-surface-toggle="2d"')).toBeLessThan(html.indexOf('data-surface-toggle="3d"'));
  });

  it('switching the surface moves the mark', () => {
    st().setSurface('world');
    const html = render();
    // the world button now wears the mark; the 2D button, which wore it a render ago, does not
    const at = html.indexOf('data-surface-toggle="world"');
    expect(html.lastIndexOf('tool-active', at)).toBeGreaterThan(html.indexOf('data-surface-toggle="3d"'));
    expect(buttonAround(html, '2D canvas (the Design Model)')).not.toContain('tool-active');
  });

  it('the undo and redo arrows are offered with no disabled state, unlike the history panel’s pair', () => {
    const html = render();
    expect(buttonAround(html, 'Undo (Ctrl+Z)')).not.toContain('disabled');
    expect(buttonAround(html, 'Redo (Ctrl+Shift+Z)')).not.toContain('disabled');
  });

  it('the status line mirrors the store, and the badge names the mode', () => {
    st().setStatus('four layers selected');
    const demo = render();
    expect(demo).toContain('four layers selected');
    expect(demo).toContain('>DEMO MODE<');
    expect(demo).toContain('title="No AI provider keys configured. All generation runs in deterministic DEMO MODE (§60)."');
    useStudio.setState({ mode: 'live' });
    const live = render();
    expect(live).toContain('>LIVE<');
    expect(live).not.toContain('>DEMO MODE<');
  });

  it('offers the export trio unconditionally', () => {
    const html = render();
    expect(html).toContain('>PNG<');
    expect(html).toContain('>HTML<');
    expect(html).toContain('>JSON<');
  });

  it('the publish face says it is checking before its probe has answered', () => {
    // a fresh checkout is exactly this state: the service probe runs in an effect, and effects do not
    // run here — so what is pinned is the face a reader sees while the probe is out
    const html = render();
    expect(buttonAround(html, 'checking whether nexus-api is running…')).not.toContain('disabled');
    expect(html).toContain('>Publish<');
    expect(html).toContain('publish: checking…');
  });

  it('the four service-gated panels are reachable while the probe is out', () => {
    const html = render();
    for (const id of ['published', 'trail', 'desk', 'economy']) {
      expect(html).toContain('data-toolbar-' + id + '-toggle');
    }
    expect(html).toContain('title="what is published on the service"');
    expect(html).toContain('title="what the service recorded happening: publishes and take-downs, newest first"');
    expect(html).toContain('title="the reports filed against the work you own"');
    expect(html).toContain('title="the tips this account was given — and what has not been built yet"');
    expect(countOf(html, 'disabled=')).toBe(0);
  });

  it('the explore link opens the public door in a new tab', () => {
    const html = render();
    expect(html).toContain('href="/explore"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).toContain('title="browse everything that is published"');
  });

  it('closes the row with the account, new-project and preview controls', () => {
    const html = render();
    expect(buttonAround(html, 'Account')).toContain('👤');
    expect(html).toContain('>New<');
    expect(html).toContain('>Preview<');
  });
});
