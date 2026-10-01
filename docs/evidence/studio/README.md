# Studio Vertical Slice — Proof of Work (§32/§59)

Milestone 1 core. Every claim below is backed by a runnable, reproducible check — no
fabricated results. Where the environment limited a check, that is stated honestly (§60).

## Reproducible gates (all green)

```
npm run build lint typecheck test     # via turbo: build 4/4 · lint 3/3 · typecheck 6/6 · test 6/6
npm run verify:harness                # 8/8 harness capabilities (ADR 0017)
npm run verify:studio                 # 19/19 golden-path assertions against the real bundle
npm run verify:scene-surface          # the 3D surface's headless proof (M5 v142, amendment 142)
npm run verify:scene                  # 11/11 3D-surface assertions in a real browser (needs the Studio on :3210)
```

Counts below are from `NODE_OPTIONS= npx vitest run --root <pkg> --no-file-parallelism`
(authoritative — see KNOWN_ISSUES → Tooling for why the default pool under-reports here).

| Package            | Result |
| ------------------ | ------ |
| @nexus/design-model| 32/32 vitest (`design-model` 18 incl. 3 rotated-hitTest + 2 rigid-geometry + 2 cycle-safe/visit-once `layoutPage` cases + `instances` 14), tsc clean |
| @nexus/ai-providers| 7/7 vitest, tsc clean |
| @nexus/agent-runtime| 232/232 vitest · tsc clean — M2 v0–v41, ADR 0016 am. 1–41; see `docs/evidence/agents/README.md` |
| @nexus/exec-host   | 181/181 vitest (8 files: git staged/show/commit/log tools, env isolation, exec test runner) · tsc clean |
| @nexus/studio      | 149/149 vitest (17 files: `snap` `persist` `align` `store-variants` 20 `thumbnail` `rotate` 14 `render` `minimap` `agentDock` 18 `webfs` 3 `uiRun` 8 `dockPolicy` 6 `observability` 11 `instancePanel` 2 `scene3d` 16 `scene3dSurface` 5 `surface` 7) · tsc `--noEmit` clean · eslint `--max-warnings=0` clean · `next build` ✓ (4/4 static pages) |

_Counts moved at M5 v142: the studio row was `119/119 (15 files)` and is now `149/149 (17 files)`.
`instancePanel` gained no case — it gained a FIX (see the v142 section below), and the three new files are
the 3D surface's. The `observability` row moved 9 → 11 with the second, separate reader._

## Reproducible browser verification (ADR 0017)

`tools/harness/` drives a real Chrome over the DevTools pipe — zero dependencies — and
asserts against the Studio's **read-only** observability bridge (`window.__nexus`). It reports
a visible `1418×802` viewport, a running rAF loop, `482900/482900` painted canvas pixels, an
accepted 100 KB full-page PNG, and **19/19** golden-path assertions on the unmodified bundle.
Full transcript and the honest remaining gaps: [`harness/README.md`](harness/README.md).

## Headless pipeline proof

`node docs/evidence/studio/pipeline-proof.mjs` runs the real Design Model + Model Router
against the **built** packages, asserting the full loop:

```
{ ok: true, mode: "demo", nodesBefore: 2, nodesAfter: 18, addedByCompose: 16,
  contentNodesWithLayout: 16, pagesAfterAdd: 2,
  instanceProjection: "2 instances -> disjoint clones, override + purity verified",
  sampleNodeTypes: ["frame","text","ellipse","rectangle"],
  usage: { provider: "nexus-demo", model: "demo-composer:dashboard", mode: "demo",
           inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 } }
```

Proven end-to-end with assertions:
1. **prompt → real editable ops** — `generateDesign()` returns an `OpBatch`, not canned JSON.
2. **layout is real** — all 16 content nodes have finite, positive `layoutPage()` rects.
3. **AI Diff (§36)** — `diffFromBatch` reports `added: 16`, correct before/after counts.
4. **undo/redo (§35)** — op-log reversibility restores exact node counts (2↔18).
5. **deterministic AI edit** — a real `updateNode` transform on a live selection.
6. **honest cost (§53/§60)** — `mode: "demo"`, `estimatedCostUsd: 0`. Never faked as "live".
7. **multi-page add is reversible** — an `addSubtree(root)` grows `pageIds` 1→2, the fresh page
   lays out in isolation (`layoutPage` returns only its rect), and undo removes it again.
8. **persistence round-trip at the model level** — serialize → JSON → revalidate root + page →
   the revived doc lays out identically (mirrors `lib/persist.ts` guarantees).
9. **component → instance projection (ADR 0015)** — `expandComponentInstances` materializes two
   instances of one master into **disjoint** clone subtrees, applies a text `override` to the clone
   while the master stays untouched (purity), maps each clone back to its owning instance, and the
   off-page master never appears in page layout.

## The 3D surface (M5 v142, ADR 0016 amendment 142)

The Studio's second surface, and the first PRODUCT consumer of `@nexus/three-runtime`. It is split the way
ADR 0005 splits the 2D one — a pure model plus a renderer:

- `src/lib/scene3d.ts` — pure, no React and no three. `buildDemoScene` composes one scene with four bodies
  and one camera; `buildSceneReport` reads the runtime back as a plain JSON-safe report; `createStudioScene`
  owns the frame count and performs exactly one frame write per step. Structural interfaces
  (`SceneComposerLike`, `SceneAdapterLike`) keep it loadable during SSR and in a plain vitest process.
- `src/components/Scene3D.tsx` — the ONLY file in the Studio that touches a canvas, a GL context or
  three.js. It picks the backend with `webglAvailable()`, mounts the runtime, aims the camera through the
  adapter, drives the loop, publishes the report on the read-only bridge and disposes everything on unmount.
- The surface is VIEW state (`store.surface`, default `'2d'`): not part of the document, not undoable, not
  persisted. The 2D canvas is untouched and the golden-path harness still drives it.

**A defect the first consumer found.** Every M5 grant's own bound said the package had no product consumer;
v142 built one, and the first thing it did was render a scene. `createScene` had been building two lights,
storing them in `LightingConfig.lights` and attaching neither — so every scene from the package was **black**
under its `MeshStandardMaterial` meshes, and 362 green cases could not see it because they asserted the
config. Fixed in `packages/three-runtime/src/threeRuntime.ts`; the measurement is §2 of the proof below.

**What is proven where.**

| Check | What it grades | Result |
| --- | --- | --- |
| `src/lib/scene3d.test.ts` (16 cases) | the model, over a fake composer | 16/16 |
| `src/lib/scene3dSurface.test.ts` (5 cases) | the model over the **real** `ThreeRuntime` on the headless seam | 5/5 |
| `src/lib/surface.test.ts` (7 cases) | the surface as view state + the shipped component bytes (a toggle wired to no branch is refused) | 7/7 |
| `docs/evidence/studio/scene-surface-proof.mjs` | the **shipped** Studio module (type-stripped, not copied) over the shipped runtime | all assertions |
| `tools/harness/studio-scene3d.mjs` | the real bundle in a real browser | **11/11** |

The proof's five sections: §1 the composed scene IS the runtime's own (every body id is a registered
`ThreeEntity`, the graph names that scene active); §2 the lighting term — **1.316496580927726** with the
declared lights attached and **exactly 0** without them, every body's `emissive` black; §3 the camera is a
real `THREE.Camera`, aiming it moves it off the identity world matrix, and the frame the loop produced
carried THAT camera and THAT scene into the backend; §4 the surface's step count and the backend's draw count
are different questions, kept apart; §5 this repository's HEAD byte-identical.

The browser probe, measured on this host 2026-09-29 (`NODE_OPTIONS= …/next dev -p 3210`, Chrome 153 over
`--headless=new`): the Studio still opens on the 2D canvas painting `482900/482900` px; pressing `3D` mounts
`#nexus-scene3d` and unmounts the 2D canvas; the bridge's frame count advances `12 → 23`; the report names
`Studio Scene` with four bodies and one active camera; **`backend=webgl`** at `878×550` with 4 draw calls; a
`92525`-byte PNG is written to `harness/studio-scene3d.png`; pressing `2D` restores the canvas, still fully
painted; and the 3D reader answers `null` once the surface is unmounted. Headless Chrome does provide a
software GL context on this box, so the screenshot is a render rather than a fallback.

**Bounds (§60).** DEMO-MODE geometry only — four default meshes, one default camera, no assets, no model
calls. No orbit/zoom camera control, no add/remove body from the UI, no lighting control, no save/load door,
and nothing the 3D scene composes reaches the Design Document (two separate systems sharing a window).
`Scene3D.tsx` has no unit test because there is no DOM test environment in this repo — its behaviour is
covered by the headless proof and the browser probe, which is stated rather than implied. The HUD samples the
report at most once per 10 frames, and the headless path says on screen that it draws no pixels.

## In-browser golden path (live React app)

Driven through the running `next dev` server via the browser automation surface:
- Full Studio shell renders: toolbar, 5 tools, undo/redo, **DEMO MODE** badge, Layers tree
  ("Page 1"), Design System panel listing all color/font/space/radius tokens, zoom controls,
  Generate/AI-Edit prompt bar, Properties panel. **No console errors.**
- Clicking a suggestion ("an analytics dashboard") grew the model **2 → 18 nodes** and the
  AI-Diff card showed `2 → 18 nodes`. Undo/Redo buttons dispatched without error.
- Opening **Preview** mounted the iframe whose HTML was generated **from the Design Model**
  and contained the composed content (`An analytics dashboard`, `Revenue $48,920`,
  `Active users`, `Conversion`, `3.7%` …).

### Persistence + multi-page hydrate (real browser bundle, no rAF needed)

Because hydration runs on mount (not in the paint loop), it was verified for real despite the
hidden viewport: write a valid snapshot envelope to `localStorage['nexus.studio.doc.v1']`, reload
`http://localhost:3210/`, and confirm the store rehydrated — the toolbar shows `PersistedDoc`, the
PageTabs strip shows its `PersistedPage` (proving `activePageId` resolved via the staleness guard),
the prior "My First World / Page 1" is gone, and the status reads `Restored from local snapshot`.
The test artifact was then cleared.

### Alignment + distribution

`lib/align.ts` is pure geometry over selection/page rects, covered by 9 headless unit tests
(align-left/center-to-page, align-to-selection-bounds, equal-gap distribute x & y pinning the
extremes, out-of-order sorting, <3-item no-op). The `AlignBar` mount was verified in the running
bundle: all 8 buttons render and are correctly **disabled** with no selection, and the hint reads
"Select layers to align". The store glue (`align`/`distribute`) reuses the same reversible
`commitOps`→History→diff→persistence path already proven for move/resize/duplicate, so each click
is a single undoable batch — the actual canvas-select→click gesture is gated by the hidden-viewport
limitation below and is therefore not asserted as a screenshot here (§60 honesty).

### Components & instances (ADR 0015)

Two layers of evidence:
- **Pure projection unit tests** (`instances.test.ts`, 10 — later additions detailed in the
  sub-selection and per-clone-rotation sections below): single expansion keeps page layout
  consistent; two instances get **disjoint** clone ids; text + width overrides patch the clone and
  leave the master; nested instances expand one level; a component **cycle** terminates with the
  guarded instance childless; `ownerInstanceId` maps every clone to its top-level owner; a doc with
  no instances is returned with node object **identity preserved**.
- **Store action tests** (`store-variants.test.ts`, 16 — later additions detailed in the
  sub-selection and per-clone-rotation sections below) drive the real zustand store headless:
  *create component* wraps the selection into a master + one instance and re-parents the layers;
  *undo/redo* restores the two original page shapes exactly (lossless); *insert instance* gives a
  second, disjoint materialization sharing the master; *detach* promotes the projected clones to a
  concrete editable group while the master survives for other instances. Three more cover
  *per-instance overrides*: a `width` override re-projects onto that instance's clone
  (`${instId}::${masterId}`) while the master keeps its authored width; a second `{ visible:false }`
  call **merges** into the same override key without dropping the prior width; a text override lands
  in the `overrides.text` map, applies to the projected clone, and `undo()` restores an empty
  override — all reversible through the same op path.

The **Components** panel and its full golden path were driven in the running `next dev` bundle via
DOM structure (no rAF needed): with an empty selection, *Make component* / *Detach* are disabled and
the "No components yet" hint shows; after generating a design and pressing **Ctrl/Cmd+A** (select
all on page), *Make component* enables; clicking it drops the hint and reveals a component row with an
*Insert* button, and *Detach* enables (the new instance is auto-selected); *Insert* keeps the master
listed; *Detach* disables *Detach* again (a concrete group is now selected) while the master and its
*Insert* action survive. Selecting that instance also reveals the **Instance overrides** section in the
Properties panel (its "stored on this instance only, not the master" hint is present); editing a leaf
width field to a new value round-trips through `setInstanceOverride` → the memoized projection → the
controlled input and persists in the real React bundle. **No console errors** through the whole
sequence. The projection itself is pure and headless-proven, so canvas paint (rAF, gated by the hidden
viewport) is not asserted as a pixel screenshot (§60).

### Visual before/after AI-diff thumbnails (§36)

`lib/thumbnail.ts` is a **pure** model→SVG projection (`docToSvg` reuses `layoutPage` + token
resolution — the same geometry the canvas paints; no DOM, no pixel capture) plus an `svgToDataUri`
encoder. Covered by 5 headless unit tests: rect/ellipse/text shapes + a page-sized `viewBox` from real
layout; XML escaping of `<`, `>`, `&` in text; invisible nodes are skipped; an empty page yields a
minimal placeholder SVG; and the data URI decodes back to the exact markup.

The store now caches a `before`/`after` document + `pageId` on every edit (dispatch/generate/AI-edit),
so the live **AI/Edit diff card** renders two `<img>` thumbnails side by side. In the running
`next dev` bundle (no rAF needed): New → generate "an analytics dashboard" mounts exactly two
`data:image/svg+xml` images labelled `before` and `after`; decoded, **before** is an empty page
(1 background rect) while **after** carries the composed result (9 rects + 7 texts + 1 ellipse) —
they differ and the "after" mirrors the Design Model. **No console errors.**

### Rotate handle + rotation-aware rendering (ADR 0005 amendment)

`lib/rotate.ts` is pure math (8 unit tests): centre/normalise/snap, grip placement
`rotateHandlePoint` (matches the painter's clockwise y-down convention), `rotationFromDrag`
(quarter-turn drag → exactly 90°), `hitRotated` point-in-rotated-rect. `render.test.ts` (5 tests)
drives the real `drawScene` against a **recording fake 2D context**: a node authored at 90° calls
`ctx.rotate(90·π/180)` after translating to its own centre; a 0° node never rotates; the transient
`rotations` preview map overrides the authored value mid-drag; single selection paints the grip
`arc()` at the rotated handle point; rotated chrome renders without throwing. The store proves the
commit path: `updateNode(id,{rotation})` round-trips through undo/redo, and `clearLiveGeom` drops
the preview without touching the doc.

In the running `next dev` bundle (real React, no rAF needed): select a layer → set the Properties
**Rotation** field to 30 → Ctrl+Z returns 0 → Shift+Ctrl+Z restores 30 → **reload** → still 30
(whole-model snapshot). **No console errors.** Per §60: the interactive grip *drag gesture* is
proven through the pure/render/store layers, not a pixel screenshot of the hidden canvas.

### Rotated hit bounds (model-level `containsRotated` + studio handle grabs)

Follow-up to the rotation pass (closes the "hit-test stays AABB" caveat, ADR 0005 Amendment 2).
Design-model layer (+3 → `design-model.test.ts` 14): a 200×40 bar at 90° **misses** its vacated
AABB corner (110,105) and **hits** (200,20)/(200,120) on the turned outline; a 0° node keeps the
old AABB behaviour (regression); a rotated frame still yields its child on top when the point is
inside both. `hitChildren` now routes every candidate through the exported `containsRotated`
(inverse-rotate about the centre → AABB test). Studio layer (`rotate.test.ts`, +3 → 11):
`handleHitTest` at 90° grabs the *painted* nw corner world point (150,−50) for a centre-(100,50)
rect and refuses the empty old-AABB corner (0,0); at 0° it matches the plain corner test.
`hitRotated` delegates to the model so there is exactly one rotated-hit predicate. `handlePoints`
moved from `render.ts` to `rotate.ts` (pure geometry; render keeps importing it).

Real-browser proof (fresh `next dev` reload so the new bundle is live; synthetic events, no rAF):
draw a 160×120 rectangle at world (1300,100) with the ▭ tool → Properties **Rotation** = 90 →
click world (1305,105), *inside the old AABB but outside the turned shape* → selection clears
(Rotation field gone); click (1380,230), *outside the old AABB but inside the turned shape* →
the Rectangle selects again; drag from (1440,80), the **painted** nw corner → history shows
`Resize Rectangle` and the model commits exactly the AABB delta `{x:1336,y:136,w:124,h:84}`
with rotation intact, persisted to the `localStorage` snapshot. Ctrl+Z ×3 returns the document
to Dashboard-only. **No console errors.** Harness caveat re-confirmed: pointer **move/up must be
dispatched on the canvas element itself** — the handlers are React props on the wrapper, so
events sent to `window` never reach `finishDrag` (a first resize attempt silently no-oped until
re-dispatched on the element).

### Minimap (viewport overview + click-to-recenter)

`lib/minimap.ts` is pure geometry, covered by 7 headless unit tests: `fitPage` scales a page into a
padded box touching exactly one axis and centring the slack on the other; `projectRect`/
`unprojectPoint` round-trip at rect centres; `viewportWorldRect` inverts the viewport transform
(`{x:100,y:50,zoom:2}` + 800×600 → world `(-50,-25,400,300)`); `intersectRects` clips the visible
region to the page; `viewportCenteredAt` re-centres at constant zoom. The `Minimap` component paints
page + node tiles + the clipped viewport rect in a plain `useEffect` (no rAF), so it renders even
under the hidden-viewport harness.

Real-browser proof (no rAF needed): the minimap canvas exists (200×150) over the generated
dashboard; a synthetic `pointerdown`+`pointermove` drag over it changes the minimap's own painted
pixels (`getImageData` hash moves during the drag, stable after `pointerup`) — i.e. the handler →
`setViewport` → repaint loop is live end to end. **No app console errors.** Caveat found while
verifying: running `next build` while `next dev` serves the same directory 404s the dev server's
chunks (React event handlers silently stop) — dev must be restarted afterwards (§60 honesty note).

### Sub-selection (drill into an instance, edit clones via overrides)

Design-model layer (`instances.test.ts`, +1): `overrides[mid].x/y` apply as **deltas** off the
master's authored position and compose with width overrides; the master and the authored doc stay
untouched (20/20). Studio layer (`store-variants.test.ts`, +6 → 15): clone move accumulates x/y
override deltas, a mixed clone+authored selection commits as **one** reversible step, clone resize
works in layout space (a moved instance must not skew the delta — regression covered), focus state
resets with `newProject`, and the override composes into `layoutPage` (instance.x + master.x + Δ).
The store's selection/edit **liveness** now prunes against the *projected* doc, not `doc.nodes` —
canonical-only pruning dropped clone selections on every commit.

Real-browser golden path on the restored dashboard (synthetic events, no rAF): select the page-child
frame → *Make component* → history `Create component Dashboard` → double-click the instance →
**`#nexus-focus-chip`** ("Editing inside Dashboard") renders → double-click the KPI text clone →
overlay editor opens, Ctrl+Enter commits → history `Set instance override`, `overrides.text` lands
in the `localStorage` snapshot → Escape drills out (chip gone, instance selected) → re-enter and
drag the clone → history `Move 1 node(s)`, snapshot shows `overrides[fr_…] = {x:73,y:50}`.
**No console errors.** Honest caveats: the first drag attempt in a single synchronous script did
not register (React renders between tasks — events must be dispatched in separate evaluations);
clone selection intentionally shows no Properties-panel fields.

### Per-clone rotation (`rotation` override with absolute replacement semantics, ADR 0015 amendment 3)

Closes the "rotate handles not offered on clones" deferral. Design-model layer
(`instances.test.ts`, +1 → 10): an `{ rotation: 90 }` override **replaces** the master child's
authored rotation on that instance's clone only (master stays 0°); the clone's layout box is the
axis-aligned bounding box of the turned rect (120×40 → w/h swap); `hitTest` on the expanded doc
selects the rotated clone at (60,70), and at the vacated corner (5,5) the point falls through to
the **instance body** — `hitChildren` descends only while an ancestor's own rect contains the
point, so a rotated clone overhanging its unrotated container box stays unreachable there (same
pre-existing container-overflow rule as moved/resized clones, now documented). Studio layer
(`store-variants.test.ts`, +1 → 16): `setInstanceOverride(id, mid, {rotation})` is **absolute**
(45 then 90 → `{rotation:90}`, not additive), one reversible op, the projected clone hit-tests
rotated, and undo ×2 empties the override.

Real-browser proof on the generated dashboard (synthetic events on the canvas element, no rAF):
select the instance → drill in → *Instance overrides* panel **Rotation** input = 45 → the
`localStorage` snapshot shows `overrides = {fr_1oq17ly:{rotation:45}}` and history row
`Set instance override`; then the **rotate grip** on the focused clone: drag from screen
(828.85, 51.15) to (1050, 500) commits 116° — matching the hand-computed expected angle 116.05 —
again as one override op. Ctrl+Z ×2 returns the instance to authored state (only the pre-existing
sub-selection `{x:73,y:50}` override remains). **No console errors.**

### Per-instance fill + corner radius (ADR 0015 amendment 4)

The *Instance overrides* panel gains the two style controls, so a fill or a radius no longer requires
detaching. Design-model layer (`instances.test.ts`, +2 → 14): an `overrides[mid]` patch of
`{ fills: [paint], cornerRadius: 12 }` **replaces** the master child's stack and radius on that
instance's clone only — the unpatched sibling instance and the canonical master both still read the
master's authored values. The second case is the one that matters for a renderer: the clone gets a
**copy** of the array (`clone.fills !== patch.fills` by identity), and a `push` on the projected clone
leaves the document's patch at length 1. Studio layer (`store-variants.test.ts`, +2 → 20): a fill and a
radius land as one merged patch on the instance, project onto `${instId}::${masterId}`, leave the
master alone, and undo ×2 unwinds them one edit at a time; a negative radius lands as `{cornerRadius:0}`
(a square corner is a value, unlike `width`'s clamp at 1) and a style patch addressed to a rectangle is
a no-op with document identity preserved.

Panel evidence is a **source-level wiring guard** (`instancePanel.test.ts`, 2 cases) — this repo's
recorded idiom for a component the studio suite cannot render (node environment, no jsdom, no
testing-library). It parses every `setInstanceOverride(<receiver>,` in `InstanceOverrides.tsx` and
requires the receiver to be `instance.id` (count ≥ 3), that the swatch writes a solid paint over
`fills[0]`, that the radius input writes `{ cornerRadius: n }`, that both read the *projected* clone
(`node.fills` / `node.cornerRadius`), and that the file never reaches for `updateNode` — which edits
the canonical node, i.e. the master. That receiver check exists because a mutation probe arm
**survived** the first, literal-string version of the guard (see the ADR 0015 amendment 4 record);
what this guard still cannot prove — that a real click moves the model — is stated there too.
Re-runnable probe: `node docs/evidence/studio/style-override-probe.mjs` — 6 mutation arms over the
projection, the store and this panel guard; measured on this host, every arm lands exactly 1 red.

### Rigid subtree rotation (commit-flatten + projection bake, ADR 0005 amendment 3)

Turning a container now turns its subtree as a unit, with the renderer, hit-test and `layoutPage`
untouched. Model layer (+4 → 28/28): `geometry.ts` exports pure `rotatePointAbout` /
`rigidRotateRect` (y-down clockwise convention matching `ctx.rotate`); `expandComponentInstances`
gains `bakeInstanceRotation` — after projection, every visible clone's position rotates about the
instance centre and `clone.rotation += instance.rotation`, so a 90° instance hit-tests on the
*turned* clone body while the master record stays untouched, and a pre-existing (local) clone
rotation override composes (30 → 120 at instance 90°). Studio layer (+5 → 71/71):
`subtreeRotatePlan` tests (descendants turned + rel-to-turned-parent coords, root excluded,
locked/hidden skipped, flow containers stop descent, 0° → empty) and `rotateSubtree` store tests
(one reversible batch flattens authored x/y + rotation; for an instance it commits the single
`rotation` op and the *bake* reproduces the preview — rotated clone hit-tests outside its old
AABB; undo restores both paths). The grip drag previews through the same plan via the existing
`liveGeom`/`rotations` maps; the *Instance overrides* row and clone-grip commit now subtract
`instance.rotation` (overrides are instance-local).

Real-browser proof (synthetic events on `#nexus-canvas`, no rAF): the generated DEMO dashboard is
**entirely auto-layout** (every frame flow, all authored x/y are 0), so the proof injected an
absolutely positioned subtree into the `localStorage` snapshot first — frame `rigidF` at
(600,600,300×200) with `rigidA` rel(20,20,60²) and `rigidB` rel(200,120,60²). Select → grip at
world (750, 556.4) → drag to (893.6, 700) = exactly +90° → pointerup persists
`rigidF.rotation=90`, `rigidA={x:170,y:-30,rotation:90}`, `rigidB={x:70,y:150,rotation:90}` —
both hand-predicted from the rigid math — as a single `Rotate Rigid frame` history row; Ctrl+Z
restores all three nodes exactly. **No console errors.** Harness notes: synthetic pointer events
must reuse `pointerId:1` (the mouse pointer) or `setPointerCapture` throws and the handler aborts
silently; and the detached `next dev` background process died twice mid-session — restart + 200-poll
before browser proofs.

## Model-derived visual artifacts

`node docs/evidence/studio/emit-svg.mjs "<prompt>"` composes a design and emits an SVG
directly from `layoutPage()` + token resolution — the same geometry the canvas uses:
- `generated-a-saas-landing-page.svg` — nav + hero + pill CTA + 3 feature cards (24 shapes)
- `generated-an-analytics-dashboard.svg` — KPI/stat cards (16 shapes)
- `generated-a-login-screen.svg` — auth card (9 shapes)

Different prompts select different templates → different node counts, confirming the
heuristic composer is genuinely parameterised, not one fixed output.

## Honest environment limitation — RESOLVED (ADR 0017)

Earlier passes could only drive the Studio through an in-app browser page that reported
`document.hidden = true` with a `0×0` viewport, so `requestAnimationFrame` was suspended, the
live canvas paint loop never ran in that surface, and pixel screenshots / real pointer clicks
were refused (`NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`). The slice was therefore verified through
DOM structure, the headless pipeline, the model→preview HTML, and model→SVG artifacts.

**That was a property of the tool, not of the app, and it is now solved.**
`tools/harness/` (ADR 0017) drives a real Chrome over the DevTools pipe and measures a
**visible** `1418×802` viewport with a running rAF loop, `482900/482900` painted canvas pixels
and an accepted 100 KB full-page PNG. See
[`harness/README.md`](harness/README.md) — it is re-runnable via `npm run verify:harness`
and `npm run verify:studio`, and the sections below that were written against the old hidden
surface are kept for the record.

## Agent dock golden path (M2 v10, DOM evidence under the pre-0017 surface)

No rAF needed — pure React state, so the §28 flow verified even there
(dev server on :3112, driven via `evaluate_script`): compose a dashboard → Agent dock →
type goal → **Plan** → panel shows `proposed for title · research: fs.index → tx_…,
el_…, fr_… · pipeline status completed · score 1.00 · 1 op(s), reversible` → **Approve**
→ 'Agent Note' layer appears in Layers + history gains the agent entry +
`nexus.agentLedger.v1` holds `{"approved":true}` → toolbar undo ×2 removes the banner
while the ledger keeps the decision (audit is persistent, edits are not). Empty-page
honesty verified too: Plan on a blank page reports "this page has no layers to research".
Console clean (single React DevTools info line).

## Visual QA chips (M2 v11, in-browser)

After Approve the dock renders `visual QA: flagged · 2 checked` with flag chips when the
banner genuinely overlaps the composed hero (`overlap`, `overflow` chips) — and the ledger
line gains `"qa":"flagged"`. On a roomy page the same run reports `visual QA: ok`. QA is
structural geometry over `layoutPage` rects (`runVisualQa`), explicitly NOT pixel or
taste judgment (see ADR 0016 amendment 11's stated limit).

## Repair loop golden path (M2 v12, in-browser)

With the v11 flags live, "Propose repairs" previewed the single deterministic nudge
(banner below its overlap anchor, 16px gutter); Approve dispatched one reversible
updateNode batch and journaled `"repairs":1` with the post-repair qa verdict. The verdict
remained `flagged` — honestly: the composed sections exceed the starter page height and no
MOVE can fix that; the loop reports the residual rather than pretending. Repairable
geometry was repaired.

## Browser-durable memory (M2 v13, in-browser)

`createWebFs(localStorage)` reuses the exact `FsWriteLike` seam from the Node durability
proofs. Verified live: after one Approve, `nexus.agentFs.v1:agent/memory-studio.json`
holds `{schemaVersion:1, records:1}`; the Memory (§26) panel lists it; **forget** empties
the durable file to 0 records and the panel shows the honest empty message. Cold-restore
runs on every Plan, so findings survive refreshes. Headless coverage: webfs 3 + agentDock
durability/forget case on an injected Map store (studio 81/81).

## Role-chain mode + decisions timeline (M2 v15, in-browser)

Checkbox switches Plan to `planAgentChain` (four §24 roles over the layer corpus with real
computed QA input incl. token-resolved colors). Verified live: the awaiting card lists all
three typed handoffs (`researcher → designer`, `designer → qa`, `qa → editor`) plus a
`pre-approval QA` line BEFORE any dispatch — the designer brief provably stays in the
sandbox corpus, the document is untouched until Approve. Post-approve a RECENT DECISIONS
timeline shows `approved · <goal> · qa:flagged` newest-first from the localStorage ledger.
Headless: +1 agentDock chain case (82/82 studio).

## Near-miss lints → gated nudges → distribution + edge chips (M2 v24 + v25 + v26 + v27, headless)

`qaForDoc` opts the dock into the v24 near-miss lints at a tight 2px, so the chip row can
show `near-align`/`near-center` after every Approve. v25 wires `planRepairs` to
`proposeRepairs(…, {alignRepairs:true})` with the same tolerances: a 1.5px slip now
previews as an explicit `align-nudge` proposal (smallest layer moves, stated px) — and the
agentDock test asserts the document is UNTOUCHED until the batch goes through the normal
§28 Approve → op path, after which `qaForDoc` comes back `ok`. v26 adds the third opt-in
at the same 2px: a 1px spacing wobble across a 3-layer chain surfaces as exactly one
`uneven-gaps` warn naming the run and the measured spread — and, stated honestly, gets NO
repair proposal (`planRepairs` returns "nothing safely fixable"; re-spacing a whole chain
is a bigger human call than snapping one edge). v27 adds the fourth opt-in at the same 2px:
a layer sitting 1.5px off the page edge surfaces as a `near-edge` chip and earns an
`edge-snap` flush proposal through the same gated §28 path (a corner that is near-flush on
two sides snaps one and states the other in `remaining` — honest progress, not magic).
(studio 94/94, agentDock 13).

## Shared test-run seam in the dock (M2 v28, headless)

The dock's and the UI runner's verification steps were duplicate hand-rolled `test.run`
bodies; v28 converts all three hosts (plan mode, chain mode, ui task) to the runtime's
shared `predicateRunner`/`registerTestTools` factory — the dock registers the named
`annotation-landed` predicate over the corpus copy, the UI runner a `layers-grew`
predicate over the design-model reporter (§8: checks run against the canonical model,
in-process, exec-checkpoint-gated as before). New studio assertions: each run's
`outcome.testReports` carries the engine-stated structured report
(`in-process-predicates: 1/1 passed`), and empty packs/unknown filters can never
masquerade as green (§60 — this is NOT a real test-suite run; that stays behind the
ADR 0013 exec sandbox). Runtime 186/186 (+15), studio 96/96 (+2); `testrunner-proof.mjs`
added — nineteen proofs.

## Verification chips — who proved this run? (M2 v33, headless)

`RunOutcome.testReports` (journaled since v28) was invisible in the dock; v33 adds the
pure selector `testChipsFor` and a `TestChips` row. The awaiting card and the UI-run area
now show e.g. `✓ in-process-predicates 1/1` (engine-named, green/red by verdict, first
failure in the tooltip), and a host that registered no tests states
`(no test.run in this host)` instead of an ambiguous empty row — chips say WHO verified,
never pretend to be more (§60: annotation-land predicates only; real suite runs stay
behind the exec sandbox, no `child_process` in the browser). The §28 ledger gains an
optional `tests` field (`<engine> passed/total ok|FAIL` from the last report);
report-less plans add no field and old ledger lines still parse. Studio 99/99 (+3
agentDock cases), runtime/exec-host untouched.

## Two §28 faces — human clicks and table receipts (M2 v41, headless)

v40 made checkpoint decisions DATA in the runtime; v41 gives the dock a seam to either
face: `faceCheckpoint({mode:'human'|'policy'})` in `src/lib/dockPolicy.ts` adapts the
live per-action Allow-once callback OR a v40 policy table into the unchanged registry
`Checkpoint`, recording every verdict (`by`, `granted`, `reason` — policy receipts quote
`rule <matched>: <reason>` verbatim). `runUiTask` gained an optional `face` and always
journals a `gate` line (`human: …` / `policy: …` / `mixed: …`) into the RECENT DECISIONS
ledger — the lenient reader still only requires goal+approved, so every pre-v41 line
parses. Tests prove the sharp edges: default human consultation is byte-for-byte the
pre-v41 set and order; a policy face NEVER asks the human yet completes the task; a
table that forgets `test.run` is vetoed by its OWN default row and the run lands
`denied`, never silent green. Honest bounds (§60): the mode toggle is NOT in the dock UI
yet — today only tests construct the policy face; the browser still shows Allow-once.
Studio 99/99 → 105/105 (new `dockPolicy.test.ts`, 6 cases); runtime/exec-host untouched.

## Evidence-cut chips — a green ✓ that quotes a window says so (M2 v72, headless)

v71 put `truncatedStreams` into `TestReport` and closed by admitting nothing read it. This is the reader:
`testChipsFor` (v33) gains `evidenceCut: string | null` per chip — the report's pipes joined with `' + '`,
the same joining v56 chose for its budget clause — and `AgentPanel`'s `TestChips` stops pretending: a report
that passed on a cut pipe renders **amber** rather than green with `⚠ evidence cut: stdout`, and its tooltip
says the quote is a window rather than the whole answer. Red is reserved for a real failure, because
`ok` is still the command's own exit code (v31's rule; v71 re-asserted it in the bridge).

Evidence is studio's headless vitest — `testChipsFor` is a pure function over a `RunOutcome`, the same class
of change v33 and v41 evidenced this way — and the suite is **115/115** (from 114): one new case over three
reports (`['stdout']` on a green chip, `['stdout','stderr']` in reader order, `null` for an in-process
predicate runner — never an empty string), plus **two existing strict `toEqual` chip expectations re-counted in
the same commit** because they pinned the old key set.

The bound that matters, stated rather than skipped: **no visual verification was done, because none is
reachable.** No Studio surface runs an exec host (true since v30 moved spawning out of the runtime), so a
browser session cannot produce a report carrying `truncatedStreams` today; the marker becomes observable only
when a caller supplies an exec-host runner, and if this lane ever wires one, the chip will need a real browser
pass. Also inherited from v71: a cut is signalled, not measured (the field says which pipes lost bytes, never
how many); `descendantsStopped` (v55) still never reaches a report; and v41's ledger row journals the human's
decision, not the chip's caveat, so a cold replay reads the report or sees nothing.

## Unread imports in the 3D surface — the whole-monorepo pre-commit gate could not pass at HEAD (M5, headless)

`core.hooksPath` points at a machine-wide `pre-commit` that lints the ENTIRE monorepo for any staged
`.ts`/`.tsx`/`.js`/`.jsx` path: it runs root `npm run lint`, i.e. `turbo run lint` over 5 packages, and
`@nexus/studio`'s script is `eslint . --max-warnings=0`. So one warning in one package is a repository-wide
refusal — and at `563a0ad` there were two.

**Measured before anything was changed, on a frozen clone** (`git clone -c core.autocrlf=false` at
`563a0ad`, so no other run's working-copy file was in the population): `eslint . --max-warnings=0`
in `apps/studio` exits **1** with exactly 2 `@typescript-eslint/no-unused-vars`
warnings, `Scene3D.tsx:12:3 'STUDIO_CAMERA_LOOK_AT'` and `13:3 'STUDIO_CAMERA_POSITION'`.
v142 split the surface into `lib/scene3d.ts` (which owns the two values and passes them to
`adapter.placeCamera` at `:142`) and the component (which owns the `placeCamera` MECHANISM);
the component kept importing both names and never read them. One census over the tracked tree
finds the readers — `lib/scene3d.ts`, `lib/scene3d.test.ts`,
`lib/scene3dSurface.test.ts`, `docs/evidence/studio/scene-surface-proof.mjs` — and `Scene3D.tsx` as the only
importer that does not use what it imports.

**The fix is a deletion and its whole delta is 2 lines:** `0 insertions, 2 deletions`, 7778 B ->
7770 B. No side-effect delta is possible: `@/lib/scene3d` stays imported (for `createStudioScene`),
so the module still evaluates — only two unread bindings left the file.

Witness in both directions on the frozen clone: delete those 2 lines -> `eslint` exits **0**;
restore them -> exits **1** with 2 warnings and the file is byte-identical to
HEAD again (true). That pairing is what makes the green a property of the deletion rather
than of the plane. Then the hook's OWN command in the working copy: `npm run lint` ->
`Tasks: 5 successful, 5 total`, exit 0. Studio's other gates read the same with the edit applied —
`tsc --noEmit` exit 0 and `vitest run` 160 passed over 18 files — and the case group that actually reads this
file's BYTES, `src/lib/surface.test.ts` (`:26` reads `components/Scene3D.tsx`), reports the same **7 passed**
at HEAD on the clone as in the patched working copy. That is the only suite that could have noticed, and it
did not, because the two names were never part of what it asserts.

**Not claimed:** how v143-v145 got through the same gate is not measured here — the only measured fact is
that at `563a0ad` the gate refuses. **Not fixed:** nothing new guards against the next unread
import; a warning is a refusal only because `--max-warnings=0` in `apps/studio/package.json` says so. And the
160-case reading belongs to this working copy, not to `563a0ad`: another run has in-flight files in
`apps/studio/src/lib`, so that total is a property of the tree, stated as one.

## The world surface (M4 v148 — ADR 0016 amendment 148)

The Studio's main pane has three surfaces: `2D` (the Design Model canvas, the default), `3D` (M5 v142) and
`World` (M4 v148). This section records the third.

**Why the world lane had no product consumer, and why that was not an oversight.** `packages/world-engine`
declared **no `main`, no `module`, no `types`, no `exports` and no `files`** — nothing outside the package
could import it. Its own suite reached it through `../src/index.js`, so 31 green tests never surfaced the
gap. The fix is five fields (the shape `three-runtime` already carried) plus the removal of a declared
dependency on `@nexus/design-model` that zero files imported.

**The split, the same one the 3D surface uses:**

- `apps/studio/src/lib/world.ts` — the PURE half: `buildStudioWorld` (three locations, three characters,
  two lore entries, every character placed in a location that exists) and `buildWorldReport` (the engine's
  state as a plain JSON-safe report), over a structural `WorldEngineLike`. No React, no DOM, no world
  package — which is also what keeps it loadable during Next's SSR pass.
- `apps/studio/src/components/WorldPanel.tsx` — the only file that touches a real `WorldEngine`. It says
  `DEMO MODE · no model is attached` on its own face, and its closing line states what it does not do.
- `installWorldBridge` publishes `window.__nexusWorld.world()`, a lazy read over the live engine with no
  mutators. The panel UNREGISTERS on teardown, so `world()` answers `null` once the surface is gone rather
  than describing a world that is no longer on screen.

**The surface set is DERIVED now, not restated.** v142 wrote `['2d', '3d']` into two cases by hand, so
adding a third surface failed them on a literal rather than on a wiring mistake. `surface.test.ts` reads the
members out of the store's own `export type Surface = …` and asserts that the declared set, the toolbar's
`data-surface-toggle` attrs and the branches Studio renders are the SAME SET.

| layer | what it proves |
| --- | --- |
| `src/lib/world.test.ts` (11) | the pure rules: what is composed, that every character stands somewhere, that a place is resolved to the LOCATION'S NAME, that a dangling place reports `null` and never leaks the id, that the report is JSON-safe |
| `docs/evidence/studio/world-surface-proof.mjs` | grades the SHIPPED Studio module (type-stripped through `node:module`, not copied) over the SHIPPED engine: the composed world IS the engine's · every character's place verified by looking the id up (a name can be right while the relation is wrong) · the report is DERIVED — moving the engine through its own API moves it · §60 vocabulary and no-model checks · HEAD byte-identical |
| `tools/harness/studio-world.mjs` | the REAL browser over CDP, **14/14**: the 2D canvas is still the default and still paints · the `World` toggle swaps the surface · the bridge answers · every character stands in a location the world holds · **the panel's rows are the bridge's report** · the mode is named on screen · the stat tiles are labelled · a PNG is written · `2D` restores the canvas · `world()` is `null` once unmounted |

Run them:

```
node docs/evidence/studio/world-surface-proof.mjs     # requires `npm run build` first
node tools/harness/studio-world.mjs                   # requires the Studio running on :3210
```

Bounds, stated: the surface COMPOSES and READS a world. Nothing ticks the engine, no character acts, no
relationship or goal is simulated, and the RAG is queryable from the agent lane rather than from the panel.
The world is not part of the design document and is not persisted — the same boundary `previewOpen` and the
3D scene sit on — and it is one of three views rather than a new document concept.

**A flake, recorded rather than hidden.** On the first run after the v148 rename the browser probe reported
**13/14**: one assertion failed while the Studio's dev server was recompiling the edited modules. Two
subsequent runs on the SAME bytes reported 14/14. The failing assertion was not captured, so the cause is
stated as what it looked like — a page read during a dev-server recompile — and not as a diagnosis. The
lesson is the one this lane keeps writing: **a browser proof is only as trustworthy as the state the page
was in when it was read**, so a red here should be re-run before it is believed, and a proof that can flake
is not yet a gate.
