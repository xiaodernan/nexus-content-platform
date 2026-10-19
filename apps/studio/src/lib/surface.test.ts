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

/** Source with comments removed, so a case can assert on CODE rather than on prose about the code. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '');

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const STUDIO = read('../components/Studio.tsx');
const TOOLBAR = read('../components/Toolbar.tsx');
const SCENE = read('../components/Scene3D.tsx');
const WORLD = read('../components/WorldPanel.tsx');
const ASSETS_PANEL = read('../components/AssetPanel.tsx');
const STORE = read('./store.ts');

/**
 * M4 v148 — the surface set is DERIVED from the store's own union, not restated here.
 *
 * v142 wrote `['2d', '3d']` into two cases by hand, so adding a third surface made them fail on a
 * literal rather than on a wiring mistake. The set is now read out of `Surface`'s declaration, which is
 * the single place the set is defined: a surface added to the union without a toggle and a branch fails
 * below, and a toggle wired to a name the union does not declare fails too.
 */
const DECLARED_SURFACES = (() => {
  const m = STORE.match(/export type Surface = ([^;]+);/);
  if (!m) throw new Error('store.ts no longer declares `export type Surface = …`');
  return m[1]!.split('|').map((s) => s.trim().replace(/^'|'$/g, ''));
})();

const st = () => useStudio.getState();

beforeEach(() => {
  st().newProject();
  st().setSurface('2d');
});

describe('the surface toggle is view state, and it starts on the canvas', () => {
  it('defaults to 2d and flips through every declared surface and back', () => {
    expect(st().surface).toBe('2d');
    for (const surface of DECLARED_SURFACES) {
      st().setSurface(surface as ReturnType<typeof st>['surface']);
      expect(st().surface).toBe(surface);
    }
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

  it('every surface the Toolbar can SET is a surface Studio RENDERS, and vice versa', () => {
    const setable = [...TOOLBAR.matchAll(/setSurface\('([^']+)'\)/g)].map((m) => m[1]);
    expect(setable.length).toBeGreaterThanOrEqual(2);
    // Every toggle is a declared surface, and every declared surface has a toggle.
    expect(new Set(setable)).toEqual(new Set(DECLARED_SURFACES));

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
    // And the union the store declares is exactly what got wired — a name added there with no branch
    // fails here rather than silently becoming an unreachable surface.
    expect(new Set([...rendered, '2d'])).toEqual(new Set(DECLARED_SURFACES));
  });

  it('the toolbar keys are attrs a harness can find, one per declared surface', () => {
    const keys = [...TOOLBAR.matchAll(/data-surface-toggle="([^"]+)"/g)].map((m) => m[1]);
    expect(keys).toEqual(DECLARED_SURFACES);
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

  it('the 3D component joins ALL SIX watch legs and leaves ALL SIX on teardown (M5 v212, v216, v217, v218, v224)', () => {
    // The surface verbs are tested against a runtime; this case tests the COMPONENT — the only place
    // they are ever called in production. Pairing is counted from the file rather than hand-typed, and
    // the order is the mount's: a subscription with no matching unwatch leaks a listener into a runtime
    // that outlives the component, and a second leg added without its own leave would pass a prose test.
    const joined = [...SCENE.matchAll(/surface\.(watchComponents|watchEntities|watchBodies|watchScenes|watchPixels|watchCameras)\(/g)].map(
      (m) => m[1],
    );
    const left = [...SCENE.matchAll(/(unwatchComponents|unwatchEntities|unwatchBodies|unwatchScenes|unwatchPixels|unwatchCameras)\(\);/g)].map(
      (m) => m[1],
    );
    expect(joined).toEqual(['watchComponents', 'watchEntities', 'watchBodies', 'watchScenes', 'watchPixels', 'watchCameras']);
    expect(left).toEqual(['unwatchComponents', 'unwatchEntities', 'unwatchBodies', 'unwatchScenes', 'unwatchPixels', 'unwatchCameras']);
    // All four re-read the SAME way the rAF pull does: through the captured surface's own report.
    // Counted against `joined` rather than hand-typed, so a leg subscribed some other way is the red.
    const pullArrows = [...SCENE.matchAll(/=> setReport\(surface\.report\(\)\)/g)].length;
    expect(pullArrows).toBe(joined.length);
  });

  it('the 3D scene is NOT part of the design document the Studio persists', () => {
    // The persistence path serialises `doc` only; a scene that leaked into it would be saved as part
    // of the user's design. This is the same boundary `previewOpen` sits on.
    const persist = read('./persist.ts');
    expect(persist).not.toMatch(/scene3d|SceneReport|surface3d/i);
  });

  it('the load note SAYS what the restore re-issued (M5 v227)', () => {
    // v227 made `load()` answer what it had to re-create (the save format holds no camera objects, so a
    // shot's camera comes back under its own id with a name spelled from it). The component reads that
    // answer into the note rather than showing a camera row whose name the save never carried — pinned
    // from the file because the note is prose nobody types twice.
    expect(SCENE).toMatch(/result\.reissued\.cameraIds\.length/);
    // Both load paths (the in-memory file and the server's disk) carry it: a disk restore that re-issued
    // cameras quietly would be the same silence one level over.
    expect([...SCENE.matchAll(/re-issued by id \(the format holds no camera objects\)/g)]).toHaveLength(2);
    expect(SCENE).toMatch(/cutscene\(s\) restored/);
    expect(SCENE).toMatch(/so a running cutscene resumes/);
  });

  it('every camera verb the SURFACE declares is a control the panel RENDERS (M5 v260)', () => {
    // The population is DERIVED from `SceneSurface`, so a camera verb added to the surface that the panel
    // cannot reach fails here rather than shipping as a capability with no UI. The set is counted first:
    // an empty derivation would satisfy every `every()` below.
    const lib = read('./scene3d.ts');
    const block = lib.match(/export interface SceneSurface \{[\s\S]*?\n\}/);
    if (!block) throw new Error('scene3d.ts no longer declares `export interface SceneSurface { … }`');
    const verbs = [...block[0].matchAll(/^  (\w*Camera\w*)\(/gm)].map((m) => m[1] ?? '');
    expect(verbs).toEqual(['watchCameras', 'addCamera', 'removeCamera', 'activateCamera']);

    // `watch*` is the subscription leg, pinned by its own case above; the rest are CONTROLS, and each gets
    // a handler named `on<Verb>` that the file both DEFINES and RENDERS.
    const controls = verbs.filter((verb) => !verb.startsWith('watch'));
    expect(controls.length).toBe(3);
    for (const verb of controls) {
      const handler = `on${verb.replace(/^./, (first) => first.toUpperCase())}`;
      const body = SCENE.match(new RegExp(`const ${handler} = useCallback[\\s\\S]*?\\}, \\[\\]\\);`));
      expect(body, `${handler} is not a useCallback in Scene3D.tsx`).not.toBeNull();
      // The handler reaches the runtime THROUGH the surface — the panel does not re-implement the verb.
      expect(body![0], `${handler} never asks the surface`).toMatch(new RegExp(`surface\\.${verb}\\(`));
      const rendered =
        new RegExp(`onClick=\\{\\(\\) => ${handler}\\(c\\.id\\)\\}`).test(SCENE) || new RegExp(`onClick=\\{${handler}\\}`).test(SCENE);
      expect(rendered, `${handler} is defined but no button calls it — a control nobody can click`).toBe(true);
    }
  });

  it('every scene verb the SURFACE declares is a control or a leg the panel wires (M5 v261)', () => {
    // The twin of the camera-verb pin above, derived the same way: a scene verb added to `SceneSurface` that the
    // panel cannot reach fails here rather than shipping as a capability with no UI. The population is DERIVED
    // from the same block and counted first, so an empty derivation cannot satisfy the loop.
    const lib = read('./scene3d.ts');
    const block = lib.match(/export interface SceneSurface \{[\s\S]*?\n\}/);
    if (!block) throw new Error('scene3d.ts no longer declares `export interface SceneSurface { … }`');
    const verbs = [...block[0].matchAll(/^  (\w*Scene\w*)\(/gm)].map((m) => m[1] ?? '');
    expect(verbs).toEqual(['watchScenes', 'activateScene']);

    const controls = verbs.filter((verb) => !verb.startsWith('watch'));
    expect(controls).toEqual(['activateScene']);
    for (const verb of controls) {
      const handler = `on${verb.replace(/^./, (first) => first.toUpperCase())}`;
      const body = SCENE.match(new RegExp(`const ${handler} = useCallback[\\s\\S]*?\\}, \\[\\]\\);`));
      expect(body, `${handler} is not a useCallback in Scene3D.tsx`).not.toBeNull();
      expect(body![0], `${handler} never asks the surface`).toMatch(new RegExp(`surface\\.${verb}\\(`));
      // RENDERED, not merely defined — a handler nothing calls is a capability with no door.
      expect(SCENE, `${handler} is defined but no button calls it`).toMatch(
        new RegExp(`onClick=\\{\\(\\) => ${handler}\\(r\\.id\\)\\}`),
      );
    }
  });

  it('the world control is offered on the row that is NOT live, its refusal is shown in the surface\u2019s words, and its rows come from the same walk as its count (M5 v261)', () => {
    // Where the button appears is the claim: the live row has nothing to switch to, and the figure that makes the
    // other rows worth clicking — how much is in that world — has to be on the row.
    const rows = SCENE.match(/\{report\.sceneRows\.map\(\(r\) => \(/);
    expect(rows, 'the scene rows are no longer rendered from `report.sceneRows`').not.toBeNull();
    // The list is the SAME derivation the count and the active address come from, so the panel cannot draw a
    // third answer to "which world is this".
    expect(SCENE).toMatch(/\{report\.sceneRows\.length > 0 && \(/);
    expect(SCENE).toMatch(/data-scene3d-scenes/);
    expect(SCENE).toMatch(/data-scene3d-scene=\{r\.id\}/);
    expect(SCENE).toMatch(/\{r\.name \? r\.name : '\(unnamed\)'\} · \{r\.entities\} bodies/);
    expect(SCENE).toMatch(/\{r\.active \? ' · active' : ''\}/);

    const guard = SCENE.match(/\{!r\.active && \(/);
    expect(guard, 'the world control is no longer gated on the row being inactive').not.toBeNull();
    expect([...SCENE.matchAll(/!r\.active/g)].length).toBe(1);
    const from = guard!.index!;
    const activateAttr = SCENE.indexOf('data-scene3d-scene-activate');
    expect(activateAttr, 'the world control has no data attribute a harness can click').toBeGreaterThan(from);
    // Exactly one button inside the guard — a row that offered two ways to do the same nothing would be the lie
    // v260 pinned for cameras, and there is no scene-removal verb to put beside this one.
    expect([...SCENE.slice(from, activateAttr).matchAll(/<button/g)]).toHaveLength(1);
    expect(SCENE.slice(activateAttr, SCENE.indexOf('</button>', activateAttr))).toMatch(/look at/);

    // The refusal is QUOTED, in the same template as the camera rows — the surface's `why` and `reason`, not a
    // word this component invents. Counted, because a note that said "failed" would pass a prose-only case.
    const body = SCENE.match(/const onActivateScene = useCallback[\s\S]*?\}, \[\]\);/)!;
    expect(body[0]).toContain("setSceneNote(answer.ok ? '' : `${answer.why}: ${answer.reason}`)");
    expect(body[0]).toContain('setReport(surface.report())');
    expect(SCENE).toMatch(/\{sceneNote && <div data-scene3d-scene-note>\{sceneNote\}<\/div>\}/);
    // Its OWN note state: a scene refusal and a camera refusal can be on screen about different rows at once.
    expect(SCENE).toMatch(/const \[sceneNote, setSceneNote\] = useState\(''\);/);
  });

  it('the panel moves the world seat ONLY through the surface (M5 v261)', () => {
    // The v260 rule one level up: a component that wrote `runtime.setActiveScene` itself would make the graph's
    // active row and the surface's view two answers again — the exact split this grant closes. Code only, since
    // the file's own prose names the verb.
    const code = stripComments(SCENE);
    expect(code).toMatch(/surface\.activateScene\(/);
    expect(code).not.toMatch(/\.setActiveScene\(/);
  });

  it('the seat control is offered on the row that does NOT hold it, and its refusal is shown in the surfaces words (M5 v260)', () => {
    // v244's refusal told the user to `call setActiveCamera first` with no such button; v260 added the button.
    // This case pins the two things that make it honest rather than merely present: WHERE it appears, and
    // what the panel does with the answer.
    const guard = SCENE.match(/\{!c\.active && \(/);
    expect(guard, 'the activate control is no longer gated on the row being inactive').not.toBeNull();
    expect([...SCENE.matchAll(/!c\.active/g)].length).toBe(1);
    // The guard wraps exactly ONE button, and that button is the seat control — so `remove` stays available
    // on every row (the runtime refuses the live one itself) while `make live` cannot offer a no-op.
    const from = guard!.index!;
    const activateAttr = SCENE.indexOf('data-scene3d-camera-activate');
    expect(activateAttr, 'the activate control has no data attribute a harness can click').toBeGreaterThan(from);
    expect([...SCENE.slice(from, activateAttr).matchAll(/<button/g)]).toHaveLength(1);
    expect(SCENE.slice(activateAttr, SCENE.indexOf('</button>', activateAttr))).toMatch(/make live/);
    const guardClose = SCENE.indexOf(')}', SCENE.indexOf('make live'));
    expect(guardClose).toBeGreaterThan(-1);
    // The remove control's own tag opens AFTER the guard closes: it is not gated, and taking the seat is
    // what makes the formerly-refused row removable.
    const removeAttr = SCENE.indexOf('data-scene3d-camera-remove');
    expect(SCENE.lastIndexOf('<button', removeAttr)).toBeGreaterThan(guardClose);
    // The row still says which one is live, so the absence of the button is explainable on screen.
    expect(SCENE).toMatch(/\{c\.active \? ' · active' : ''\}/);

    // Both row handlers answer a refusal by quoting the surface's own `why`/`reason` — the same template in
    // each, counted rather than described, because a note that said "failed" would pass a prose-only case.
    for (const handler of ['onRemoveCamera', 'onActivateCamera']) {
      const body = SCENE.match(new RegExp(`const ${handler} = useCallback[\\s\\S]*?\\}, \\[\\]\\);`))!;
      expect(body[0]).toContain("setCameraNote(answer.ok ? '' : `${answer.why}: ${answer.reason}`)");
      expect(body[0]).toContain('setReport(surface.report())');
    }
    expect(SCENE).toMatch(/\{cameraNote && <div data-scene3d-camera-note>\{cameraNote\}<\/div>\}/);
  });

  it('the panel moves the seat ONLY through the surface, never by reaching past it (M5 v260)', () => {
    // A component that called `runtime.setActiveCamera` itself would hold the seat in two places at once —
    // the registry row and the surface's aim — which is exactly the split v260 removed. Code only: the file's
    // own prose names the verb (v244 told the user to call it), so a raw scan would match the comment.
    const code = stripComments(SCENE);
    expect(code).toMatch(/surface\.activateCamera\(/);
    expect(code).not.toMatch(/\.setActiveCamera\(/);
    // And the aim stays the surface's business too: the panel supplies the adapter, it never aims a camera.
    expect(code).toMatch(/placeCamera\(sceneId, cameraId, position, lookAt\)/);
    expect(code).not.toMatch(/orbitToPlacement\(/);
  });
});

describe('the wiring that makes the WORLD surface reachable (M4 v148)', () => {
  it('Studio renders WorldPanel on the world surface', () => {
    expect(STUDIO).toMatch(/surface === 'world' \? \(\s*<WorldPanel \/>/);
    expect(STUDIO).toMatch(/import WorldPanel from '\.\/WorldPanel'/);
  });

  it('WorldPanel owns the engine, composes through the pure module, and registers the bridge', () => {
    expect(WORLD).toMatch(/^'use client';/m);
    expect(WORLD).toMatch(/id="nexus-world"/);
    expect(WORLD).toMatch(/data-surface="world"/);
    expect(WORLD).toMatch(/new WorldEngine\(/);
    // The composition and the report come from the PURE module, which is what makes them testable with
    // no React and no DOM — a panel that re-implemented either would put the two out of step.
    expect(WORLD).toMatch(/buildStudioWorld\(/);
    expect(WORLD).toMatch(/buildWorldReport\(/);
    expect(WORLD).toMatch(/installWorldBridge\(/);
    // The teardown must UNREGISTER, or a harness could read a world that is no longer on screen.
    expect(WORLD).toMatch(/installWorldBridge\(\(\) => null\)/);
    // §60: the surface names its own mode rather than letting a reader assume a model is behind it.
    expect(WORLD).toMatch(/DEMO MODE/);
  });

  it('the world is NOT part of the design document the Studio persists either', () => {
    const persist = read('./persist.ts');
    expect(persist).not.toMatch(/worldEngine|WorldReport|world-engine/i);
  });

  it('the world bridge is a separate read-only global, like the scene one', () => {
    const obs = read('./observability.ts');
    expect(obs).toMatch(/export function installWorldBridge\(/);
    expect(obs).toMatch(/target\.__nexusWorld = bridge/);
    // Read-only: no mutator may be installed on the bridge, or verification could drive the product
    // through a back door.
    expect(obs).toMatch(/version: 'nexus-studio-world\/1'/);
  });
});

describe('the wiring that makes the ASSET surface reachable (M3 v153)', () => {
  it('Studio renders AssetPanel on the assets surface', () => {
    expect(STUDIO).toMatch(/surface === 'assets' \? \(\s*<AssetPanel \/>/);
    expect(STUDIO).toMatch(/import AssetPanel from '\.\/AssetPanel'/);
  });

  it('AssetPanel owns the generators, composes through the pure module, and registers the bridge', () => {
    expect(ASSETS_PANEL).toMatch(/^'use client';/m);
    expect(ASSETS_PANEL).toMatch(/id="nexus-assets"/);
    expect(ASSETS_PANEL).toMatch(/data-surface="assets"/);
    expect(ASSETS_PANEL).toMatch(/new DemoImageGenerator\(\)/);
    expect(ASSETS_PANEL).toMatch(/new InMemoryAssetLibrary\(\)/);
    expect(ASSETS_PANEL).toMatch(/new StoryboardManager\(\)/);
    // The composition and the report come from the PURE module, which is what makes them testable with
    // no React and no DOM — a panel that re-implemented either would put the two out of step.
    expect(ASSETS_PANEL).toMatch(/buildStudioAssets\(/);
    expect(ASSETS_PANEL).toMatch(/buildAssetReport\(/);
    expect(ASSETS_PANEL).toMatch(/installAssetBridge\(/);
    // The teardown must UNREGISTER, or a harness could read a library that is no longer on screen.
    expect(ASSETS_PANEL).toMatch(/installAssetBridge\(\(\) => null\)/);
    // §60: the surface names its own mode, and it renders NO <img> — there is no image to render, and an
    // <img> would imply one exists.
    expect(ASSETS_PANEL).toMatch(/DEMO MODE/);
    // Stripped of comments first: the panel's own prose explains WHY it renders no image, and a check
    // against the raw bytes would fail on that explanation rather than on an element.
    expect(stripComments(ASSETS_PANEL)).not.toMatch(/<img/);
  });

  it('the assets bridge is a separate read-only global, like the scene and world ones', () => {
    const obs = read('./observability.ts');
    expect(obs).toMatch(/export function installAssetBridge\(/);
    expect(obs).toMatch(/target\.__nexusAssets = bridge/);
    expect(obs).toMatch(/version: 'nexus-studio-assets\/1'/);
  });

  it('the asset library is NOT part of the design document the Studio persists', () => {
    const persist = read('./persist.ts');
    expect(persist).not.toMatch(/assetLibrary|AssetReport|multimodal/i);
  });

  it('every declared surface beyond the default canvas has a render branch in Studio (derived)', () => {
    for (const surface of DECLARED_SURFACES) {
      if (surface === '2d') continue; // the canvas is the base layer, not a named branch
      expect(STUDIO).toContain(`surface === '${surface}'`);
    }
  });
});
