# Studio Vertical Slice — Proof of Work (§32/§59)

Milestone 1 core. Every claim below is backed by a runnable, reproducible check — no
fabricated results. Where the environment limited a check, that is stated honestly (§60).

## Reproducible gates (all green)

```
npm run build lint typecheck test     # via turbo: build 4/4 · lint 3/3 · typecheck 6/6 · test 6/6
npm run verify:harness                # 8/8 harness capabilities (ADR 0017)
npm run verify:studio                 # 19/19 golden-path assertions against the real bundle
npm run verify:scene-surface          # the 3D surface's headless proof (M5 v142, amendment 142)
npm run verify:scene                  # 55/55 3D-surface assertions in a real browser (needs the Studio on :3210)
npm run verify:assets-surface         # the Assets surface's headless proof (M3 v153, amendment 153)
npm run verify:assets                 # 29/29 Assets-surface assertions in a real browser (needs the Studio on :3210)
```

Counts below are from `NODE_OPTIONS= npx vitest run --root <pkg> --no-file-parallelism`
(authoritative — see KNOWN_ISSUES → Tooling for why the default pool under-reports here).

| Package            | Result |
| ------------------ | ------ |
| @nexus/design-model| 32/32 vitest (`design-model` 18 incl. 3 rotated-hitTest + 2 rigid-geometry + 2 cycle-safe/visit-once `layoutPage` cases + `instances` 14), tsc clean |
| @nexus/ai-providers| **20/20** vitest, tsc clean — the multimodal slice (asset library, demo image + video generators, character consistency, storyboard manager) |
| @nexus/three-runtime| **453/453** vitest, tsc clean — M5: scene graph, entities, cameras, lighting, save/quest/combat/NPC surface, document/op-log integration |
| @nexus/world-engine  | **43/43** vitest, tsc clean — M4: world/lore/character/location + relationships + tick + save/load |
| @nexus/agent-runtime| **540/540** vitest · tsc clean — M2/M3/M4/M5 doors; see `docs/evidence/agents/README.md` |
| @nexus/exec-host   | **309/309** vitest · tsc clean — the only `child_process` holder (ADR 0013 policy sandbox, incl. the v166 container host) |
| @nexus/studio      | **369/369** vitest (29 files: `scene3d` 65 `assets` 41 `storageMeter` 21 `agentDock` 20 `store-variants` 20 `deployServer` 15 `surface` 15 `rotate` 14 `world` 14 `scene3dSurface` 12 `saveFsServer` 12 `observability` 11 `saveFsLane` 11 `align` 9 `containerServer` 8 `uiRun` 8 `worldSaveServer` 8 `buildServer` 7 `minimap` 7 `persist` 7 `worldSaveLane` 7 `dockPolicy` 6 `snap` 6 `buildLane` 5 `containerLane` 5 `render` 5 `thumbnail` 5 `webfs` 3 `instancePanel` 2) · tsc `--noEmit` clean |

_The whole table was RE-MEASURED at M5 v192 and had drifted badly: it had stood at `agent-runtime 232`,
`exec-host 181`, `ai-providers 7` and `studio 182/182 (19 files)`, and it listed **no row at all** for
`three-runtime` or `world-engine` — two packages the Studio consumes directly. Every number above is a
`vitest run --root <pkg> --no-file-parallelism` count taken on 2026-10-07. The `studio` row's per-file
breakdown is machine-extracted rather than hand-written, because a hand-maintained list of 29 files is a
list nobody re-reads. `verify:scene` also said `11/11` while the probe had grown to 55 assertions._

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

## The 3D surface (M5 v142, interactive v161 — ADR 0016 amendments 142 and 161)

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
| `src/lib/scene3d.test.ts` (30 cases after v161) | the model, over a fake composer | 30/30 |
| `src/lib/scene3dSurface.test.ts` (5 cases) | the model over the **real** `ThreeRuntime` on the headless seam | 5/5 |
| `src/lib/surface.test.ts` (7 cases) | the surface as view state + the shipped component bytes (a toggle wired to no branch is refused) | 7/7 |
| `docs/evidence/studio/scene-surface-proof.mjs` | the **shipped** Studio module (type-stripped, not copied) over the shipped runtime | all assertions |
| `tools/harness/studio-scene3d.mjs` | the real bundle in a real browser | **19/19** (after v161) |

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

**Bounds (§60).** DEMO-MODE geometry only — four default meshes (plus whatever the user adds), one default
camera, no assets, no model calls. v161 added the orbit and add/remove (below); still no pan, no keyboard
controls, no per-body picker, no lighting control, no save/load door,
and nothing the 3D scene composes reaches the Design Document (two separate systems sharing a window).
`Scene3D.tsx` has no unit test because there is no DOM test environment in this repo — its behaviour is
covered by the headless proof and the browser probe, which is stated rather than implied. The HUD samples the
report at most once per 10 frames, and the headless path says on screen that it draws no pixels.

## The 3D surface becomes CONTROLLABLE (M5 v161 — ADR 0016 amendment 161)

v142 placed the camera ONCE and never moved it again — its own bounds row said "no orbit/zoom camera control,
no add/remove body from the UI". v161 closes both halves with the smallest machinery that survives the lane's
purity rules:

- **The orbit is pure arithmetic.** `OrbitState` is three numbers; `orbitToPlacement`/`orbitFromPlacement` are
  exact inverses; `applyOrbit` folds azimuth (it has no natural bound) and clamps elevation (just short of the
  poles, where `lookAt` has no stable up) and distance ([2, 40]). The DEFAULT orbit is **derived** from v142's
  `STUDIO_CAMERA_POSITION`, and the suite asserts the round trip lands back on that position — the opening view
  is unchanged by construction, not by a restated constant that could drift.
- **The controls live on the surface, not in the component.** `orbitBy`/`resetOrbit` aim the camera through the
  adapter (the one writer allowed to touch it); `addBody` places each new body on a ring slot
  (`nextBodyPlacement`, one step of π/3 at radius 2.6 — two added bodies never share a place, none lands inside
  the composed shots); `removeBody` answers the same `false` for a foreign id that `disk.write` gives for a
  path it was never given. `bodyIds` went LIVE (mutated in place) so the frame loop writes the CURRENT set, and
  a suite case proves a removed body is written no more.
- **The composed demo is untouched by design.** Ground and Cube A/B/C keep their v142 positions (asserted), and
  removal takes the LAST body the surface holds — a click can never delete the demo the other proofs read.
- **The component forwards events and nothing else.** Pointer-drag with capture, wheel normalised to notches
  (scroll-down zooms out — the convention every 3D viewer uses), a live `orbit: az · el · d` readout, four
  buttons; the HUD panel is `pointerEvents: none` so it never eats a drag meant for the canvas.
- **A defect caught before landing.** The first draft named the first added body `Cube A` (`64 + counter`),
  colliding with the composed `Cube A`. Added bodies continue at D (`67 + counter`), and the counter is
  per-mount and never decremented by Remove, so names stay unique across add/remove cycles. Only the UI path
  carried the bug because the tests and proof pass explicit names — the untested layer was where the collision
  lived.

**Evidence.** `scene3d.test.ts` 16 → 30 (studio 187 → 201); the headless proof gains **§5** over the REAL
runtime and a REAL `THREE.Camera`: orbiting moved the world matrix (x `4.200 → 6.545 → 4.200` after reset)
with the distance to target preserved and the frame count unmoved; add/remove moved the runtime's own graph
`4 → 5 → 4`. The browser harness is **19/19**: the probe DRAGS the canvas (azimuth `0.581 → −0.419`,
elevation `0.407 → 0.107`, distance bit-identical through a turn), WHEELS out (`8.336 → 9.170`) and back in,
presses **+ body** and **− body** (entities `4 → 5 → 4` against the bridge) and **reset view** (azimuth back
to `0.581`).
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


## The Assets surface (M3 v153, interactive v159, footage v187 — ADR 0016 amendments 153, 159 and 187)

The Studio's fourth surface, and the first PRODUCT consumer of `@nexus/ai-providers`' multimodal slice
(the agent door `assetTools.ts` was v145). Split the same way v142 and v148 split theirs:

- `src/lib/assets.ts` — pure, no React, no DOM, no ai-providers. `buildStudioAssets` composes one ordered
  storyboard (three harbour shots, a still each) through structural `AssetGeneratorLike`/`AssetLibraryLike`/
  `StoryboardManagerLike`; `buildAssetReport` reads the library + storyboard back as a JSON-safe report;
  and the v159 pair `generateAsset`/`removeAsset` is the INTERACTIVE half. Keeping it structural is what lets
  it load during Next's SSR pass and run in a plain vitest process.
- `src/components/AssetPanel.tsx` — the ONLY file touching the real `DemoImageGenerator`/`InMemoryAssetLibrary`/
  `StoryboardManager`, publishing `window.__nexusAssets.assets()` through a read-only bridge that the panel
  UNREGISTERS on teardown (`assets()` answers `null` once the surface is gone).
- `src/lib/observability.ts` — `installAssetBridge`, a separate read-only global on the same terms as the
  scene and world ones (`__nexusAssets`).

**§60 is built into the types, not asserted in prose.** `DemoImageGenerator` produces deterministic metadata
and NO pixels, so every stored asset carries an empty payload, `storedBytes` is summed from what the LIBRARY
holds (zero), the report names the generator's own `provenance` word (`demo`) and neither a provider nor a
model, and the panel renders **no `<img>`** because there is no image to render.

**v159 made it a surface you can USE rather than one you can look at.** v153 composed a fixed set of three
shots on mount; v159 adds a prompt input, a **Generate** button and a **Remove** control per library row:

- `generateAsset` refuses an EMPTY prompt at the door (an asset whose name says nothing would still be
  listed as if it were something), generates one still, stores it with the same **zero-length payload** the
  composed shots use, and returns the GENERATOR's own provenance word so the panel carries it forward.
- `removeAsset` answers the LIBRARY's own `false` for an id it does not hold rather than throwing — removing
  something twice is a caller's mistake, not a corrupt library.
- **v187 added FOOTAGE.** The plan listed video generation as having no product surface; `generateAsset`
  gained a `type: 'image' | 'video'` (defaulting to `'image'`, so existing callers are unchanged) and the
  panel gained an image/video toggle. **The dispatch is the point, and it is measured**: both demo generators
  answer whatever they are asked, so `DemoImageGenerator.generate({ type: 'video', … })` returns an
  `image/png` — a single-generator panel would store a still under a video ask and label it footage. The
  proof prints that `image/png` (§6a) before showing the fix (§6b), and the routing lives in the PANEL,
  where the real classes are touched; `lib/assets.ts` never inspects the type, it forwards it.
- **A still and footage are told apart by a `null`, not a zero.** `AssetSummary` carries `duration: number |
  null`: footage reports its seconds, a still reports `null`, because `0` would claim a still is a
  zero-length video. The type in the report is the GENERATOR's, not a label this module stamped.
- **The library and the storyboard are separate state.** Generating into the library moves the asset count
  and the byte tally; it does NOT move the storyboard's frames, and the proof measures both.

Evidence in three agreeing layers: `src/lib/assets.test.ts` (no DOM — including the interactive block:
generate stores one asset with an empty payload, the storyboard is untouched, remove deletes by id and the
derived report follows, an unknown id answers `false`); `asset-surface-proof.mjs` (grades the SHIPPED Studio
module type-stripped through `node:module`, over the SHIPPED generators — §1 the composed assets ARE the
library's, §2 §60 measured, §3 the report DERIVED, §4 every `imageRef` followed back, §5 the REAL library
grown and shrunk through the interactive pair, §6 home HEAD byte-identical); and
`tools/harness/studio-assets.mjs` (**29/29 in a real browser**, PNG written): the probe types into the prompt
input, presses **Generate**, waits for the bridge's count to rise by exactly one, presses that row's
**Remove**, and waits for it to fall back with the id gone — checking the storyboard is unmoved and every
byte count still reads `0` throughout.

Bounds, stated: the interaction generates and removes IMAGE and VIDEO assets. The surface can ASK for
footage; it cannot play it, scrub it or see it — there is no video element anywhere, because there is no
video. Character consistency still has no product surface, and there is no asset UPDATE and no way to edit a
storyboard from the panel. The asset library is generator state, not the design document — not persisted, not
undoable, not exported. The library lists assets newest-first; the prompt order is guaranteed only in the
storyboard's `frames`.

## The World surface (M4 v148, simulated v162 — ADR 0016 amendments 148 and 162)

The Studio's fifth surface, and the first PRODUCT consumer of `@nexus/world-engine` (the agent doors
`worldTools.ts` were v144; v162 made the family 8). Split the same way v142/v148/v153 split theirs:

- `src/lib/world.ts` — pure, no React, no DOM, no engine import. `buildStudioWorld` composes the demo
  world through a structural `WorldEngineLike` — since v162 it also CONNECTS its three places
  (ford↔ridge path, ford↔hamlet road) and seats TWO characters at the ford, because a world of
  unconnected rooms with solitary occupants has nothing to simulate. `buildWorldReport` reads the engine
  back as a JSON-safe report — schema 2 since v162, carrying a `relationships` view whose bonds are
  resolved BY NAME against the character table (a ghost target reports `null`, and the dangling id is
  never printed as a name).
- `src/components/WorldPanel.tsx` — the ONLY file touching the real `WorldEngine`. It owns the engine
  instance (RAG on, autosave off, the decision gate's threshold at 0.02 — the value the deterministic
  trace needs, since a first-meeting score of 0.3/10 sits a float's hair below the literal 0.03), steps
  it with the engine's own `tickOnce()`, and publishes the DERIVED report through the read-only
  `window.__nexusWorld.world()` bridge, unregistered on teardown.
- `src/lib/observability.ts` — `installWorldBridge`, on the same terms as the scene and assets ones.

**v162 made the surface a SIMULATION you can drive.** A Simulate row (Step ×1 / Step ×5) runs ticks and
reports the last one (`tick N · decisions · actions · bonds eroded`); a Relationships section lists every
bond BY NAME from both sides, with an empty state that says bonds form only through simulated dialogue.
The deterministic first tick — 4 decisions · 2 actions · the newborn Mira↔Toma bond eroded to 13/13 — is
asserted identically by the unit suite, the headless proof and the browser harness.

Evidence in three agreeing layers: `src/lib/world.test.ts` (14 cases — composition counts, the
connections, the shared ford, schema 2 with by-name bonds and ghost targets reporting null, JSON-safety);
`world-surface-proof.mjs` (§1–§3 the report IS the engine's and DERIVED; §4 the SHIPPED engine + module
stepped once reproduces the trace and lists the bond both ways by name; §5 §60 measured; §6 HEAD
byte-identical); and `tools/harness/studio-world.mjs` (**25/25 in a real browser**, PNG written): the
probe checks the empty state, presses Step ×1 and reads `tick 1 · 4 decisions · 2 actions · 2 bonds
eroded` off the screen, sees both sides of the bond at 13 on screen AND in the bridge, presses Step ×5 to
tick 6 with the floor and bands holding, and the toggle back to 2D still restores a painting canvas.

Bounds, stated: DEMO MODE only — every decision is the engine's own arithmetic and the surface says so on
its own face. The bridge stays read-only (stepping happens through the panel's own engine). No factions
or lore in the tick, no per-tick configuration, and save/load is JSON in memory, not the local snapshot.

## The 3D scene survives the surface — and enters the document (M5 v163 — ADR 0016 amendment 163)

v161 left the `3D` surface controllable but ephemeral: KNOWN_ISSUES carried "no save/load door" and
"the 3D scene and the Design Document are separate systems — nothing composed in 3D appears in the 2D
document". v163 closes both, in the smallest honest slice:

- `src/lib/scene3d.ts` — the surface gains `save(savedAt)` and `load(file)` over a structural
  `SceneSaverLike` the component wires to the REAL runtime's `buildSaveFile`/`loadSaveFile` (the save
  format's first PRODUCT consumer; the agent door was the first consumer of any kind). `load` restores
  into a FRESH sibling scene (`Restored Scene`) — the demo scene, its bodies and its frame loop are
  never touched, and the loader's own anti-overwrite rule (refuse a scene that already holds state)
  stands. It also gains the pure `composeDocumentOps`: the AUTHORED bodies (added via + body; the
  composed demo is deliberately excluded, so every other proof's demo scene stays byte-stable) become
  ONE real `ops.addSubtree` — a frame named `Scene: <scene>` with one text child per body carrying kind
  and position (`mesh · (1.3, 0, 2.25)`) as structured spec text. §60: the document never claims to
  render the scene; it files a spec that is honest about being a spec.
- `src/components/Scene3D.tsx` — the ONLY file touching the real runtime — grew three buttons: **save**
  (note names the format and counts: `saved 5 bodies · nexus-three-runtime-save v1 · nothing written to
  disk`), **load** (`restored 5 bodies into a fresh scene — the runtime now holds 2 scenes, and the
  demo scene is untouched`), and **send to doc** (`sent N authored bodies to the document — one
  addSubtree of M nodes, undoable like any other edit`), which commits through the same `commitOps` any
  editor edit uses.

Evidence in three agreeing layers: `scene3d.test.ts` 30 → 40 — the op `composeDocumentOps` returns is
applied to a REAL document, read back, and undone cleanly via `invertOp` (an op only the suite believed
in would be a button that does nothing); `scene-surface-proof.mjs` §6 — save carries a caller-named
instant and 5 bodies through JSON unchanged, load lands them in a fresh scene under the same ids while
the demo stays active, and the 1 authored body becomes one addSubtree a real document applies and
undoes; and `tools/harness/studio-scene3d.mjs` **19 → 25/25 in a real browser** — the probe presses
save/load/send and reads the notes off the screen, then reads the `__nexus` editor bridge: the document
gained EXACTLY 2 nodes (`Scene: Studio Scene`, 1 child) in ONE history row. `agent-runtime` 498 → 506
(`scene.save`/`scene.load`, the family 6 → 8; scene-tools-proof §6 over the REAL runtime).

Bounds, stated: save/load is JSON in memory — nothing is written to disk and the note says so; no pan,
no keyboard controls, no per-body picker, no editable lights, no disk persistence; the document holds
spec text, not a 3D preview.

## Save browser with delete (M5 v171 — ADR 0016 amendment 171)

v169 gave the Studio a UI face for the save/load system; v170 wired it to localStorage-backed persistence;
v171 makes the browser usable by adding **delete** — the first way to take a save back from the store.

- `src/lib/scene3d.ts` — `SceneSaverLike` gained an optional `deleteSaveFile?(path: string): boolean` method.
  Optional keeps backward compatibility for hosts that do not support deletion. Returns true when something
  was removed, false when the path held nothing.
- `src/components/Scene3D.tsx` — the saver implementation delegates to `runtime.deleteSaveFile(path)` and
  returns `report.removed`. The UI adds a red-styled **delete** button beside each save entry in the browser
  list. Clicking delete calls `stopPropagation` to prevent accidental selection, refreshes the available saves
  list, clears the selection if the deleted save was selected, and updates the save note with success/failure.

Evidence: builds clean (Next.js 15.5.25), **214/214 Studio tests green** (same suite, no regressions). The
delete button renders only when the host provides `listSaveFiles`, keeping the surface honest about what the
store can do.

Bounds, stated: delete operates on the injected filesystem abstraction — in the Studio's case localStorage
via `createLocalStorageSaveStore`. No trash/recycle bin, no confirmation dialog beyond the small button size
and red color scheme. A failed delete (permission denied, race condition) is caught silently and reported in
the note rather than crashing the UI.
## Container lane in the Agent dock (M2 v172 — ADR 0016 amendment 172)

The dock's exec door is BORN in the container — there is no host-exec lane behind it.

- Server: `src/lib/containerServer.ts` pins the policy as data (image `node:22-alpine`, container root
  `/workspace`, a two-rule allowlist: `node -e *` and `node --version`, empty env allow, 15s/16KiB budgets)
  and serves `app/api/agent/container`: GET fuses the daemon probe with the pinned facts; POST runs a fresh
  `createContainerExecHost` per call.
- Client: `src/lib/containerLane.ts` is a fetch adapter that imports nothing from `@nexus/exec-host` — the
  browser bundle stays spawn-free by construction (headless proof §6).
- Face: `AgentPanel` states the probe honestly (available with daemon version + pins, or "unavailable" with
  the reason), offers one named self-check behind an Allow-once §28 dialog, prints the run's detail line, and
  lands the decision in the same dock ledger (`containerLedgerLine` / `LedgerEntry.exec`).

Evidence: studio 214 → **229** tests; `docs/evidence/studio/container-lane-proof.mjs` §1–§6 ALL PASSED against
the real daemon (real ephemeral run, 10 isolation flags, 0 mount flags); `tools/harness/studio-container.mjs`
**7/7** in a real browser.

Bounds, stated: the route machine-approves because the human Allow-once already happened in the panel (the
dock pipeline's own model, stated in the route source); one command is offered by name — the lane is a proof
of life, not a shell; the runtime's headless tool doors remain unconsumed.

## The picked body gets an INSPECTOR (M5 v192 — ADR 0016 amendment 192)

v182 made a body pickable: a click named it and the HUD printed the name. A name is a label, not
information. v192 adds the FACTS — kind, world position, visibility — read from the live scene at report
time.

- `selectionFactsOf(scene, selected)` in `src/lib/scene3d.ts` reads the live scene on every report build;
  all seven of the surface's report call sites pass the current selection, so nothing is cached at pick time.
- `SceneReport` gains `inspector: SceneSelectionFacts | null`. `position` is `SceneVec3 | null` — **null when
  the host declares none, never invented**, the same rule as `duration: null` on the Assets surface one
  milestone over. `kind` answers `'unknown'` rather than guessing.
- The HUD renders `data-scene3d-inspector`: `Cube A · mesh · (-1.60, 0.12, 0.00) · visible`.
- **A body that has LEFT the scene reports nothing.** The selection stays the NAME it was (the two are
  separate state) and the inspector answers `null`; a pick into empty space clears both.

**Why the position can never be asserted as a constant.** The frame loop BOBS every body, so the live y is a
fraction that changes per frame — measured `0.0022732435670642045` headlessly and `0.12688570962266804` in
the browser. A proof asserting `-1.6, 0, 0` would pass against an inspector that invented its numbers. The
proof therefore asserts agreement with the runtime's own `threeObject.position`, which the controller pins to
`transform.position`, and separately MOVES the body +3 to prove the facts follow (`-1.6 → 1.4` with no
re-pick).

| layer | what it proves |
| --- | --- |
| `src/lib/scene3dSurface.test.ts` | the inspector cases over the REAL runtime |
| `scene-surface-proof.mjs` §7 | nothing selected → `null` · a pick produces facts whose position AGREES with the runtime's own object · moving the body moves the reported x · a miss-pick clears both · a removed body reports `null` while the selection survives |
| `tools/harness/studio-scene3d.mjs` | the REAL browser, **55/55**: the probe picks Cube A, checks the report AND the HUD carry `mesh` / a position / `visible`, then clears the selection and checks both answer nothing |

**The proof supplies its own raycaster, and says why.** The real `pickAt` needs a GL context and lives in the
component; a raycaster's accuracy is v182's subject, not this section's. So the proof's adapter answers a
deterministic target and the section exercises the surface's OWN `pickAt` path rather than reaching into the
surface's internals.

**A defect the section found in itself.** The first draft set the pick target to null and then read the report
WITHOUT performing the miss-pick, expecting a clearing no call had performed (`actual: {id, name: 'Cube A'},
expected: null`). A section that asserts a state change must perform the action that causes it.

Bounds, stated: the inspector reports what a host DECLARES — id, name, kind, position, visibility. It does
not read components, materials, children or animation state, and it cannot edit any of them: there is no
setter and the HUD renders the facts as text.
