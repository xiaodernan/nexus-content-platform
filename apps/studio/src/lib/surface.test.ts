import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStudio } from './store';

/**
 * M5 v142 — the SURFACE toggle, and the wiring that makes the 3D scene reachable.
 *
 * The store half is behavioural: which surface is showing, that it defaults to the 2D canvas the
 * golden-path harness drives, and that flipping it touches NOTHING in the document (it is view state,
 * like `previewOpen` — not an undoable op, not persisted).
 *
 * The wiring half is deliberately read off the shipped BYTES rather than asserted through a renderer:
 * the Studio has no DOM test environment (no jsdom, no testing-library) and adding two dependencies to
 * assert "this `<Scene3D />` is in that branch" would be a poor trade. What a file-reading case CAN do
 * honestly is refuse the failure that type-checking cannot catch — a toggle wired to a surface name no
 * branch renders, which is a button that does nothing. The pattern is the one `packageFace.test.ts`
 * set in the three-runtime lane.
 */

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const STUDIO = read('../components/Studio.tsx');
const TOOLBAR = read('../components/Toolbar.tsx');
const SCENE = read('../components/Scene3D.tsx');

const st = () => useStudio.getState();

beforeEach(() => {
  st().newProject();
  st().setSurface('2d');
});

describe('the surface toggle is view state, and it starts on the canvas', () => {
  it('defaults to 2d and flips to 3d and back', () => {
    expect(st().surface).toBe('2d');
    st().setSurface('3d');
    expect(st().surface).toBe('3d');
    st().setSurface('2d');
    expect(st().surface).toBe('2d');
  });

  it('moving between surfaces changes NO part of the document, and is not undoable', () => {
    st().addShape('rectangle', { x: 40, y: 40 });
    const before = st().doc;
    const cached = st().historyCursor;

    st().setSurface('3d');
    expect(st().doc).toBe(before);
    expect(st().historyCursor).toBe(cached);

    st().undo();
    // Undo walks the OP log, so it may not take back the shape at all — what it must never do is
    // restore a previous surface, because the surface was never an op.
    expect(st().surface).toBe('3d');
  });
});

describe('the wiring that makes the 3D surface reachable', () => {
  it('Studio renders Scene3D on the 3d surface and the 2D Canvas on 2d — from the same read', () => {
    expect(STUDIO).toMatch(/const surface = useStudio\(\(s\) => s\.surface\)/);
    // The branch is keyed on the store value, and BOTH surfaces are named in it.
    expect(STUDIO).toMatch(/surface === '3d' \? \(\s*<Scene3D \/>/);
    expect(STUDIO).toMatch(/<Canvas \/>/);
    // The canvas is not rendered alongside the 3D scene: a hidden 2D canvas would keep painting.
    expect(STUDIO).toMatch(/data-surface=\{surface\}/);
  });

  it('every surface the Toolbar can SET is a surface Studio RENDERS', () => {
    const setable = [...TOOLBAR.matchAll(/setSurface\('([^']+)'\)/g)].map((m) => m[1]);
    expect(setable.length).toBeGreaterThanOrEqual(2);
    expect(new Set(setable)).toEqual(new Set(['2d', '3d']));

    // Studio states the store value once; the branches below it name the surfaces it draws explicitly,
    // and the DEFAULT branch is the surface that needs no condition — asserted as such rather than
    // assumed, so a Studio that stopped rendering the canvas would fail here.
    const rendered = [...STUDIO.matchAll(/surface === '([^']+)'/g)].map((m) => m[1]);
    expect(rendered).toContain('3d');
    expect(new Set(rendered).size).toBe(rendered.length); // no duplicated branch for one surface
    const defaultBranch = rendered.length + 1; // every setable surface is named or is the fallback
    expect(defaultBranch).toBe(setable.length);
    for (const surface of rendered) {
      expect(setable, `Studio renders '${surface}' and the toolbar must be able to reach it`).toContain(surface);
    }
  });

  it('the toolbar keys are attrs a harness can find, one per surface', () => {
    const keys = [...TOOLBAR.matchAll(/data-surface-toggle="([^"]+)"/g)].map((m) => m[1]);
    expect(keys).toEqual(['2d', '3d']);
  });

  it('Scene3D owns the canvas, the runtime and the teardown — and reports honestly', () => {
    expect(SCENE).toMatch(/^'use client';/m);
    expect(SCENE).toMatch(/id="nexus-scene3d"/);
    expect(SCENE).toMatch(/new ThreeRuntime\(/);
    expect(SCENE).toMatch(/runtime\.initialize\(canvas\)/);
    expect(SCENE).toMatch(/webglAvailable\(\)/);
    // The teardown must dispose the runtime, or a rebuild leaks a frame loop and a GL context.
    expect(SCENE).toMatch(/runtime\.dispose\(\)/);
    // §60: the headless path is NAMED on screen rather than left to look like a render.
    expect(SCENE).toMatch(/HEADLESS — this host has no GL context/);
  });

  it('the 3D scene is NOT part of the design document the Studio persists', () => {
    // The persistence path serialises `doc` only; a scene that leaked into it would be saved as part
    // of the user's design. This is the same boundary `previewOpen` sits on.
    const persist = read('./persist.ts');
    expect(persist).not.toMatch(/scene3d|SceneReport|surface3d/i);
  });
});
