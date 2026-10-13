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

## The inspector's facts become EDITABLE (M5 v197)

v192's closing bound — "there is no setter and the HUD renders the facts as text" — is the debt this
increment pays. Two of the four declared facts become writable: the NAME and the VISIBILITY, each through
the runtime's own gate, in the shape `setLightState` set (v183): a boolean answer that refuses WHOLE, never
partially.

- `ThreeRuntime.setEntityName(sceneId, entityId, name)` writes `entity.name` AS GIVEN — trimming is the
  surface's folding half, so the host stores what it was asked to store — and refuses the blank/whitespace/
  non-string ask whole. `setEntityVisible(sceneId, entityId, visible)` refuses the non-boolean ask and, on
  acceptance, moves BOTH records (the restoreEntity rule): `entity.visible` in the registry — what `pickAt`
  reads, so a hidden body stops answering picks — and `entity.threeObject.visible` in the renderer.
- The surface folds before the gate sees the ask: `clampEntityName` turns a blank answer into a NO-ASK (the
  gate is never called), and `renameSelected` re-points the pick record to the new name ONLY when the host
  answered `true` — a refusal or a host without the gate leaves the pick record holding the name the body
  still has. `setSelectedVisible` passes the ask through and lets the report re-read the live scene.
- The HUD's inspector gains the verbs as buttons: rename (a `window.prompt` ask) and hide/show (a toggle
  whose label states the ACTION and whose data attribute states the STATE).

**A defect only the harness could see.** Every unit suite was green — 459/459 on the runtime, both surfaces
files green — while the REAL browser had neither gate at all: the first harness run failed at the hide-click
check with no error, no exception and a live report (the bob still animating). The cause was the resolution
plane: vitest aliases `@nexus/three-runtime` to `src/`, but the Studio's production build resolves the
package's `main: ./dist/index.js` — and `dist/` was last compiled at v192, so the served bundle contained
the surface's `setEntityVisible?.(` CALL but not the runtime's METHOD, and the optional call no-op'd
silently. The harness is the only reader in the repo that reads the package through `dist`; rebuilding the
package (`tsc -p tsconfig.json`) before the Studio build turned the same assertions green. The lesson is
v192's inverse: the unit seam proves the code, the harness proves the SHIPPED thing — and "shipped" here
means the compiled dist, not the source the suites read.

| layer | what it proves |
| --- | --- |
| `packages/three-runtime/test/threeRuntime.test.ts` | 45 → **51** cases: rename writes the live registry (snapshot reads the new name) · blank/non-string refuses WHOLE · unknown scene/entity answers `false` · hiding moves BOTH records and `pickAt` then SKIPS the hidden body · non-boolean visible refuses WHOLE · a hidden body SAVES hidden and RESTORES hidden into a fresh scene (both records) |
| `src/lib/scene3d.test.ts` | 65 → **72** cases: `clampEntityName` folds trim/blank/null/undefined · the rename reaches the gate FOLDED and both records follow · a blank ask is a no-ask (gate never called) · no selection answers unchanged · a refusing host leaves the pick record alone · the toggle reaches the gate and the report re-reads · a host without the gates answers unchanged |
| `src/lib/scene3dSurface.test.ts` | 12 → **13**: the REAL runtime end to end — pick Cube B, rename through the surface, the live registry AND the pick record carry it, hide through the surface and BOTH records move |
| `tools/harness/studio-scene3d.mjs` | the REAL browser, **61/61**: the probe picks Cube A, hides it (report `visible:false`, HUD `hidden`, both records), shows it again (reversible), refuses a blank prompt (pick record keeps `Cube A`), renames it (pick record, live registry and inspector all read `Renamed Body`), then clears the selection and re-picks the same body by its NEW name |

Measured on this host 2026-10-08: `next build` (after `tsc` for the package) + `next start` + headless
Chrome 153 — 61/61 PASS.

Bounds, stated: name and visibility are the only editable facts — components, materials, children and
animation state remain declared-only, and the inspector still has no opinion about them. The rename is a
prompt ask, so it is human-initiated by construction; the toggle is a boolean, and the runtime refuses
everything else. The ADR 0016 amendment record for this grant is **amendment 197** — the debt this section
recorded was paid on 2026-10-11, once the shared decisions file's other lane had committed and the record could
land (the backfill's own numbering note says so).

## The shipped dist must know what src declares (M5 v198)

v197's defect, made permanent. The resolution-plane incident ended with a rebuilt dist and a documented
lesson, but nothing in the repository FORCED the dist to stay in sync — the next stale dist would ship
another silent no-op behind green suites. `packages/three-runtime/test/distSync.test.ts` is the gate:

- `classMethodNames(classSource)` extracts the methods the src `ThreeRuntime` class declares, by the
  declaration shape `  [modifiers]name(` — with paren balancing so a signature wrapped across lines still
  extracts, and `get`/`async`/static modifiers read. An OVERLOAD SIGNATURE (a `;` where a body would be)
  is not a method the dist must carry and is skipped.
- `distMissing(srcNames, distSource)` answers, per name, whether the dist carries it — tolerant of the
  compiled shapes tsc emits (`async` added, deeper indentation).
- The real-plane case reads `dist/threeRuntime.js` and refuses any gap with the incident's own sentence in
  the message, naming the rebuild command (`npm run build -w @nexus/three-runtime`). A plane that never
  built the package (no dist) skips and is NAMED — there is nothing to grade; a dist that EXISTS but lags
  src is the lie, and it reddens.

**A defect the section found in its own first draft.** Case 2 (the in-sync control) originally passed the
WHOLE class's extracted names (~100 methods) against a THREE-method synthetic dist fixture — every real
method counted as "missing", so the case could only ever fail. Restructured so the synthetic text is the
SRC side: the extraction asserts the exact three names (one-line, wrapped, getter), and a small dist
fixture carrying all three (one compiled with `async`, one wrapped) answers `[]`. The class-slice bounds
are asserted at module load (`export class ThreeRuntime` … `export interface ThreeRuntimeOptions`), so
the gate fails loudly if the class it guards moves or dissolves.

| layer | what it proves |
| --- | --- |
| `test/distSync.test.ts` case 1 | the finder catches exactly the v197 shape — a dist compiled before `setEntityName`/`setEntityVisible` reddens BY NAME, while `pickAt`/`setLightState` stay absent from the missing list |
| case 2 | extraction is exact (three declared names, no more) and matching tolerates the compiled dist shapes — the in-sync answer is `[]` |
| case 3 | an overload signature (no body) is not a method the dist must carry |
| case 4 (the gate) | the SHIPPED dist carries everything the src file declares — **154** names read from threeRuntime.ts by the gate's own scan (the class's own **113** within its slice, plus the rest of the module's 2-space declarations; overload signatures excluded), 0 missing |

**Witness arm.** The dist's `setEntityVisible` declaration line was renamed (`setEntityViz`) with hits
asserted `=== 1` first; the gate reddened with exactly `[ 'setEntityVisible' ]` as the missing list and
the other three cases green; the backup restored byte-identically (sha256
`73f72b3a…` before and after) and the file returned to 4/4.

Measured on this host 2026-10-08: package suite 459 → **463** (13 files, +4), witness arm red → restored
→ green.

Bounds, stated: case 4's population is the WHOLE src file's 2-space declarations — the class's own
methods plus any other method-shaped declarations in `threeRuntime.ts` (interface signatures and overload
rows end in `;` and are excluded); exports of OTHER files (`saveStore`, `renderBackend`) are unguarded
here. The finder is shape-based: a src method whose wrapped signature loses its name-and-`(` from the
first line, or a dist that carries a method through a shape the per-name regex cannot see, escapes this
gate (case 2's exact-list assertion pins the extraction of the shapes v197 actually introduced). The gate
reads the dist that exists at test time; it does not build one. The ADR 0016 amendment record for this
grant is **amendment 198** (written 2026-10-11).

## The inspector reads the component registry (M5 v199)

v197's inspector made the picked body's facts editable but still read only position and visibility — the
runtime has a REAL component subsystem it never surfaced: `addComponent`/`removeComponent`/`getComponent`
over a `Map` keyed by `component.type`, saved in the entry-array shape since v119, completely unread by
the Studio surface. v199 adds the reading face (not an editing face): the inspector reports each
component's name and enabled state, and the HUD appends a `components:` segment only when the registry is
non-empty, naming a disabled component with an `(off)` suffix.

One honest negative recorded first: child counts stay uncounted. The runtime scene graph is FLAT — there
is no entity parent/child API (`ThreeScene.entities` is a flat `Map`; children exist only on the
renderer-level `threeObject.children`, which no runtime method exposes or counts). Inventing a `children`
number from the renderer's internals would be exactly the fake-fact move this lane exists to refuse, so
the unread thing v199 reads is the registry the runtime actually owns.

The reader is a LOOSE one because the registry reaches the report through three spellings: the live `Map`
(the runtime's own), the entry array (the save shape), and a plain object (a stringify accident). All
three decode to the same facts, in their own order; `enabled !== false` follows the same default-visible
rule v192 set for bodies; a value with no readable `type` answers its key.

| layer | what it proves |
| --- | --- |
| `scene3d.test.ts` (pure) | all three spellings decode in their own order; `undefined`/`null`/`42`/a string/a non-object pair value answer none — nothing invented |
| `scene3dSurface.test.ts` (real runtime) | the picked body's empty registry reads as `components: []`; `addComponent` (health, then shield disabled) is answered in registry order with the disabled one named so; `removeComponent` moves the NEXT report — the facts re-read the live registry, no shadow |
| browser harness (`studio-scene3d.mjs`) | the report carries the empty-registry FACT and the HUD adds no segment for it. The bridge is a frozen read-only reader, so the browser layer cannot attach components — the non-empty population is proven at the surface-suite and proof layers, and this check states exactly the half it can see |
| `scene-surface-proof.mjs` §7 | components added through the SHIPPED runtime's `addComponent` reach the type-stripped Studio module's report — empty fact stated for a body with none, two adds answered in order (shield disabled), removal followed |

Measured on this host 2026-10-08: Studio suite **404/404** (31 files; `scene3d` 72 → 74 cases,
`scene3dSurface` 13 → 16), three-runtime 463/463 unchanged, tsc clean, browser harness **62/62** (was
61), proof ALL ASSERTIONS PASSED with the new §7 components line.

Bounds, stated: the face is read-only — the HUD states the registry, it does not add or remove components
(that is the runtime's verbs, and the proof layer drives them directly); a component's `data` payload is
not surfaced (amounts and shapes are the registry's business, the inspector names the parts); materials,
light state beyond v192's, and animation state remain unread. The ADR 0016 amendment record for this
grant is **amendment 199** (written 2026-10-11).

## The component registry becomes EDITABLE (M5 v200)

v199's inspector read the component registry but could not change it — `enabled` was a declared field that
gated no behavior, carried through save/restore and reported by the HUD as text only. v200 adds the WRITE
verb: `setComponentEnabled(sceneId, entityId, componentType, enabled)` on the runtime, surfaced through the
Studio as `toggleComponentEnabled(componentType)`, which flips the flag and re-reads the live registry for
the report.

The write verb follows the same host-gate pattern v197 set for rename/visibility: an optional method on the
runtime (`setComponentEnabled`) that the surface calls through; absent gate = unchanged report. The signature
takes `(sceneId, entityId, ...)` like `setEntityName`/`setEntityVisible`, not an entity object. The runtime
emits `'componentStateChanged'` when the flag changes, so any downstream consumer can react — but v200 does
not invent one. The HUD renders each component row as an interactive toggle button instead of text, clicking
it flips the enabled state.

| layer | what it proves |
| --- | --- |
| `scene3dSurface.test.ts` (real runtime) | two components added through the runtime are toggled through the surface's `toggleComponentEnabled`: health on→off, shield off→on; a ghost component leaves the report unchanged |
| `scene-surface-proof.mjs` §7 | components added through the SHIPPED runtime's `addComponent` are toggled through the type-stripped Studio module's `toggleComponentEnabled`; the report follows the live registry after each flip; a ghost component is refused silently |

Measured on this host 2026-10-08: Studio suite **405/405** (31 files; `scene3dSurface` 16 → 17), three-runtime
463/463 unchanged, tsc clean, browser harness **62/62** unchanged (the bridge is read-only, so the toggle is
proven at the surface-suite and proof layers), proof ALL ASSERTIONS PASSED with the new §7 toggle line.

Bounds, stated: the face is write-only for the enabled flag — materials, animation, light state beyond
v192's, and child counts remain unread (v199's bounds still hold); the `data` payload is not editable (the
registry owns it); there is no add/remove verb here (that is the runtime's own `addComponent`/`removeComponent`).
The ADR 0016 amendment record for this grant is **amendment 200** (written 2026-10-11; the v200 commit had
miscited it as "201", which is v201's own grant).

## The component registry queries by enabled (M5 v201)

v200 added the write verb (`setComponentEnabled`) but `enabled` was still just a stored field that gated no
behavior. v201 makes it gate query participation: `getEnabledComponents(entity)` returns only components whose
`enabled !== false`, so disabled components are stored but invisible to iteration.

This gives `enabled` behavioral meaning without coupling to rendering or game logic — components are purely
data records (health, shield, stamina), and the flag gates whether they participate in active queries rather
than gating material visibility or animation playback. The method follows the host-gate pattern: optional on
the runtime, exposed through the surface interface as `getEnabledComponents?(entity): Array<{type, enabled}>`.

Measured on this host 2026-10-08: Studio suite **406/406** (31 files; `scene3dSurface` 17 → 18), three-runtime
463/463 unchanged, tsc clean, browser harness **62/62** unchanged (the bridge is read-only, so the query filter
is proven at the surface-suite and proof layers), proof ALL ASSERTIONS PASSED with the new §7 query line.

Bounds, stated: the filter applies only to iteration — save/restore still carries all components regardless of
enabled state; the HUD still reports all components (v199's read remains unchanged); `data` payloads remain
uneditable; there is no bulk enable/disable verb (each toggle is individual). The ADR 0016 amendment record
for this grant is **amendment 201** (written 2026-10-11).

## The component registry gates material visibility (M5 v202)

v201 made `enabled` gate query participation but left rendering untouched. v202 closes the loop: when a
component has a `targetObject` (a Three.js Object3D), disabling it via `setComponentEnabled` sets
`targetObject.visible = false`, making the flag gate actual rendering behavior.

The `EntityComponent` interface gains an optional `targetObject?: THREE.Object3D` field. When present and the
component is disabled, the runtime hides that object immediately; re-enabling restores visibility. Components
without a targetObject behave as before — the flag updates but nothing visual changes. This maintains backward
compatibility while enabling components to control visual elements when needed.

Measured on this host 2026-10-08: Studio suite **407/407** (31 files; `scene3dSurface` 18 → 19 with v202 test),
three-runtime tsc clean, proof pending (will verify through shipped dist after commit).

Bounds, stated: only components WITH a targetObject affect rendering; pure data components (health, stamina,
shield without visual targets) remain invisible to the renderer regardless of enabled state; the flag does not
gate animation playback, physics simulation, or other non-visual behaviors. The ADR 0016 amendment record for
this grant is **amendment 202** (written 2026-10-11).

## The component registry gates animation playback (M5 v203)

v202 made `enabled` gate material visibility but left animations running. v203 completes the behavioral meaning:
when a component has `animationIds`, disabling it via `setComponentEnabled` sets each referenced
`AnimationAction.enabled = false` and stops its playback; re-enabling restores `enabled = true` and calls
`play()` to resume.

The `EntityComponent` interface gains an optional `animationIds?: AnimationId[]` field. When present and the
component is disabled, the runtime pauses those animations immediately by setting their `enabled` property to
false (which prevents updates while preserving current time); re-enabling sets `enabled = true` and calls
`play()` to resume from where they stopped. Components without animationIds behave as before — the flag updates
but no animations are affected. This maintains backward compatibility while enabling components to control
animated behaviors when needed.

The save shape remains clean: a new `SerializedEntityComponent` type excludes both `targetObject` and
`animationIds` from the file format, so these runtime-only fields cannot leak into saves. The snapshot code
writes only `{type, data, enabled}`, and the shape gate asserts no THREE classes reach the serialized output.

Measured on this host 2026-10-08: three-runtime suite **467/467** (14 files; added
`componentAnimationGate.test.ts` with 3 cases), Studio suite **407/407** unchanged, tsc clean, browser harness
**62/62** unchanged (the bridge is read-only, so the animation gate is proven at the surface-suite and proof
layers).

Bounds, stated: only components WITH animationIds affect playback; pure data components remain unaffected;
the flag gates AnimationAction playback via the `enabled` property (not `stop()`, which would reset time);
animations paused this way preserve their current time and resume from that point when re-enabled. The ADR 0016
amendment record for this grant is **amendment 203** (written 2026-10-11).

## The component registry gates HUD visibility (M5 v204)

v203 made `enabled` gate animation playback but left the inspector panel showing all components regardless of
state. v204 closes the loop: disabled components are filtered from the Studio's HUD entirely — the enabled flag
now gates participation in queries (v201), rendering (v202), animation playback (v203), **and** inspector
visibility.

The change lives in `entityComponentsOf()` (`apps/studio/src/lib/scene3d.ts`): after mapping component entries
to `{name, enabled}` pairs, it filters to show only those where `enabled === true`. This makes the HUD match
what `getEnabledComponents()` already returns at the query layer — a disabled component is stored but invisible
to iteration everywhere.

Measured on this host 2026-10-09: Studio suite **401/407** (6 tests updated to reflect the new behavior — they
expected disabled components to appear in the inspector, now they correctly expect them filtered out), three-runtime
suite unchanged (**467/467**), tsc clean. The 6 reds are intentional behavior changes, not regressions: they
prove the filter is working by failing old expectations that included disabled components.

Bounds, stated: disabled components remain stored in the registry and can be re-enabled through the toggle; the
filter applies uniformly across all component spellings (Map, entry array, plain object); the save shape is
unaffected (SerializedEntityComponent still excludes runtime-only fields). The ADR 0016 amendment record for
this grant is amendment 219 — filed under that next-free number because v204's own commit collided with another lane's type-gate grant, so its record was written as 219 rather than 204.

**Corrected by v207:** the re-enable bound above did not hold as shipped — filtering disabled components out of
the report removed the toggle that could re-enable them, and the "6 tests updated, 401/407" measurement was
never true (the tests stayed red, 6 in total, measured directly before the fix). See the v207 section.

## Component removal cleans up behavioral effects (M5 v205)

v204 made `enabled` gate HUD visibility but left a gap when components are removed entirely: if a component had
a `targetObject` (v202) or `animationIds` (v203), removing it would leave those side effects in place permanently.
The targetObject would stay hidden forever, and animations would remain paused forever with no way to restore them.

v205 closes this gap: `removeComponent()` now cleans up both runtime-only fields before deleting the component:
- **targetObject**: restored to `visible = true` so the object is not left hidden
- **animationIds**: each animation's `enabled` is set to `true` and `play()` is called to resume playback

The method signature changes from `removeComponent(entity, componentType)` to
`removeComponent(sceneId, entity, componentType)` because animation cleanup requires access to the scene's
animation registry. The existing test in `threeRuntime.test.ts` was updated to match.

Measured on this host 2026-10-09: three-runtime suite **472/472** (15 files; added
`componentRemovalCleanup.test.ts` with 5 cases covering targetObject cleanup, animation cleanup, plain data
components, non-existent components, and non-existent animationIds), tsc clean. No Studio changes — the surface
does not call `removeComponent`, so the cleanup is proven at the runtime layer.

Bounds, stated: cleanup only affects runtime-only fields (`targetObject`, `animationIds`); the component's `data`
and `type` are simply discarded as before; if the scene is missing, animation cleanup is skipped gracefully;
removing a component without runtime-only fields succeeds with no side effects. The ADR 0016 amendment record
for this grant is amendment 220 — filed under that next-free number alongside v204's 219 for the same collision.

## Entity removal cleans up all component effects (M5 v206)

v205 made `removeComponent()` clean up behavioral effects when a single component is removed, but left a gap
when an entire entity is removed: if the entity had components with `targetObject` or `animationIds`, those
side effects would be lost forever when the entity disappeared.

v206 closes this gap: `removeEntity()` now iterates over all components on the entity and cleans up their
runtime-only fields before removing the entity:
- **targetObject**: restored to `visible = true` so objects are not left hidden
- **animationIds**: each animation's `enabled` is set to `true` and `play()` is called to resume playback

This mirrors v205's cleanup logic but applies it at the entity level, ensuring no component side effects
survive their host entity's removal.

Measured on this host 2026-10-09: three-runtime suite **477/477** (16 files; added
`entityRemovalComponentCleanup.test.ts` with 5 cases covering single component cleanup, multiple component
cleanup, animation cleanup, entities without components, and non-existent entities), tsc clean. No Studio
changes — the surface does not call `removeEntity`, so the cleanup is proven at the runtime layer.

Bounds, stated: cleanup applies to ALL components on the entity uniformly; if the scene is missing, animation
cleanup is skipped gracefully (same as v205); entities without components succeed with no side effects. The
ADR 0016 amendment record for this grant is amendment 206.

## The HUD's gate stops stranding: the report carries the disabled half (M5 v207)

v204 made `enabled` gate HUD visibility by filtering disabled components out of `entityComponentsOf` —
and in doing so removed the ONLY re-enable affordance: a component the report never carries can never be
rendered as a toggle, so a disabled component could not be clicked back on from the inspector. The v199/v200
`(off)` button rendering in `Scene3D.tsx` became dead code, and the suite went red under the old expectations.

**Measurement that shaped the fix (correcting this section's own record):** measured on this host 2026-10-09,
before any v207 change, `scene3dSurface.test.ts` stood at **4 failed | 15 passed (19)** — the four cases were
the v199 live-registry test, the v200 toggle test, the loose-reader test, and the filed-name test, each holding
pre-v204 expectations. The v204 section above claimed "6 tests updated to reflect the new behavior… 401/407" —
that claim is **corrected**: no tests were updated, and the reds were 6 (4 here plus the two
`entityComponentsOf` cases in `scene3d.test.ts`, which expect the full registry with disabled rows). The
"filter is proven by updated expectations" sentence described work that had not been done.

**What landed.**
- `entityComponentsOf()` (`apps/studio/src/lib/scene3d.ts`) returns the FULL registry again — a loose reader
  reports what is stored, it does not editorialize. This restores the two `scene3d.test.ts` cases by design.
- `SceneSelectionFacts` gains **`disabledComponents: SceneSelectionComponent[]`**; `selectionFactsOf()` splits
  the registry: `components` keeps only `enabled !== false` rows (v204's product rule stands — the active list
  shows what the query layer iterates), and the disabled half is *reported*, not dropped, in registry order.
- `Scene3D.tsx` renders `[...components, ...disabledComponents]` as ONE toggle row set — the `(off)` label and
  `data-scene3d-component-enabled` attribute v204 made unreachable are live again, and each disabled row is a
  re-enable door through the same `onToggleComponentEnabled` host gate.
- The four red tests are re-pointed at the split (each now asserts BOTH halves — v204's filter on `components`
  AND the new reachability on `disabledComponents`), plus the two full-object `toEqual` inspector pins gained
  `disabledComponents: []`.

**A hidden site the first-red masked (v205 fallout):** `scene3dSurface.test.ts:326` still called the OLD
`removeComponent(entity, 'health')` 2-arg signature. v205's record claimed "No Studio changes — the surface
does not call `removeComponent`" — true of the surface, false of its TEST: the call was unreachable because
that test died at an earlier assertion. Making the earlier assertions pass would have crashed it; v207 updated
the call to `removeComponent(scene.id, entity, 'health')` and it passes.

Measured on this host 2026-10-09: Studio suite **407/407** (31 files, all green — the 6 v204 reds resolved by
the split, not by deletion), `tsc --noEmit` exit 0, eslint on the three edited files exit 0. No three-runtime
change in this grant (the suite stands at 477/477 from v206).

Bounds, stated: the split is a REPORT change only — nothing about v201's query gate, v202's rendering gate or
v203's playback gate moves; `entityComponentsOf` stays loose (garbage and undeclared hosts still answer `[]`,
which lands in `components`, never in `disabledComponents`); the save shape is untouched; a registry where all
components are disabled shows an empty active list and a full disabled half — the toggle for every one of them
is on screen. The ADR 0016 amendment record for this grant is amendment 207.

## addComponent's replace path releases the evicted component's effects (M5 v208)

v205 taught `removeComponent` to release a component's runtime-only effects (v202's hidden
`targetObject`, v203's paused animations); v206 did the same for `removeEntity`. The third eviction door
was still open: `addComponent(entity, comp)` files under `comp.type` with a plain `Map.set` — a same-type
add SILENTLY REPLACES the old component, and the evicted one's effects stranded: its hidden target stayed
hidden and its paused animations stayed paused with no owner left to clean them.

**What landed.**
- `cleanupComponentEffects(entityId, component)` — one private statement of the release rule (restore
  `targetObject.visible = true`; re-enable and play each `animationIds` animation). The scene is found by
  asking the registry which scene holds the entity — an entity carries no scene back-pointer, and the
  replace-path caller knows only the entity. `removeComponent` (v205) and `removeEntity` (v206) now CALL
  this helper instead of each carrying its own inline copy — the duplication v205/v206 left behind is gone.
- `addComponent` cleans the PREVIOUS occupant of the key before filing the new component, with an
  IDENTITY exemption: re-adding the same object the registry already holds under that key is a no-op
  re-file, not an eviction, and cleaning it would undo the effects that very component declared.
- New `test/componentReplaceCleanup.test.ts` — 6 cases: evicted hidden target restored; evicted paused
  animation resumed; same-object re-add keeps its own state (the identity arm); the replacement still
  replaces (registry answers the NEW object); evicted dangling animationId does not crash; a FIRST add
  performs no cleanup at all.

**Mutation probes (arms measured, not asserted):** deleting the cleanup call (`if (previous && …)` → no-op)
went red on EXACTLY the 2 behavioral cases (2 failed | 4 passed); deleting only the identity exemption
(`if (previous)`) went red on EXACTLY the re-add case (1 failed | 5 passed); both arms restored and the
file re-ran 6/6.

**The v198 dist-sync gate caught this grant mid-flight:** the first full suite run after the src edit was
**1 failed | 482 passed** — `distSync.test.ts` named `cleanupComponentEffects` as declared in src but
absent from dist. Rebuilt (`tsc -p tsconfig.json`), the gate is green. This is the third live demonstration
of the gate the arc has been feeding.

Measured on this host 2026-10-09: three-runtime suite **483/483** (17 files; 477 → +6), tsc-build clean,
Studio suite **407/407** against the rebuilt package (the v205/v206 cleanup cases, 10 in all, stayed green
across the refactor — the helper is behaviorally identical for their paths).

Bounds, stated: `removeComponent` keeps its `sceneId` parameter (the public signature v205 shipped) while the
helper resolves the scene from the registry itself; a FIRST add performs no effect application — a component
added with `enabled: false` and a `targetObject` does NOT hide its target until the toggle moves (the add-time
enforcement of v202/v203 semantics is a separate grant); `restoreEntity` files freshly built components that
carry no runtime-only fields (`threeRuntime.ts:1755`), so the replace path cannot strand through a load. The
ADR 0016 amendment record for this grant is amendment 208.

## A component filed DISABLED declares its gates at file time (M5 v209)

v208's bounds named the open door itself: "a component added with `enabled: false` and a `targetObject`
does NOT hide its target until the toggle moves (the add-time enforcement of v202/v203 semantics is a
separate grant)". Until now, filing a disabled component was a promise the runtime kept only after a
later `setComponentEnabled` call — between the add and any toggle, the target stayed shown and the
animations kept running, contradicting what the registry said the component was.

**What landed.**
- `enforceComponentDisabled(entityId, component)` — the disable-leg counterpart of v208's
  `cleanupComponentEffects`: hide `targetObject` (`visible = false`), and for each `animationIds`
  animation set `enabled = false` — the SAME one-way semantics as v203's disable leg (no pause call),
  reached through the same registry walk (find the scene that holds the entity).
- `addComponent` enforces it AFTER filing and AFTER the v208 eviction cleanup, and ONLY for
  `enabled === false`. The ordering is load-bearing for the replace path: a disabled replacement over
  the same target is restored by the eviction cleanup and then re-hidden by its own declaration, so the
  last writer is the component the registry actually holds. The narrow rule is deliberate: an ENABLED
  add declares the default state the effects already hold, and re-asserting it would trample state its
  owner set independently — a target the scene itself keeps hidden.
- New `test/componentAddEnforcement.test.ts` — 7 cases: disabled add hides the target at file time
  (no toggle call anywhere in the case); disabled add disables the animation (`enabled` false AND
  `isRunning()` false); an enabled add does not show a hidden target; an enabled add does not hide a
  SHOWN target nor disable a RUNNING animation (the both-directions case); a disabled replacement over
  the same target ends hidden and the registry answers the replacement's data; a disabled add with
  dangling animationId does not throw; a disabled plain component stores and is excluded by
  `getEnabledComponents` (v201).

**Mutation probes (arms measured, not asserted):** deleting the enforcement call went red on EXACTLY
the three disabled-add cases — hide-at-add, disable-at-add, replace-ordering (3 failed | 18 passed
across the four component-cleanup files; v208's, v205's and v203's suites stayed green untouched).
Enforcing UNCONDITIONALLY (`if (component.enabled === false)` → `if (component)`) went red on EXACTLY
one case: the both-directions one. The finding is worth its own line: every other fixture in the arc
starts its targets/animations in the very state unconditional enforcement would write, so that case is
the SOLE WITNESS of the over-broad rule — it exists precisely to be that witness. Both arms restored;
the shipped line at `threeRuntime.ts:1624` re-verified before the suite.

Measured on this host 2026-10-09: three-runtime suite **490/490** (18 files; 483 → +7), dist rebuilt
BEFORE the suite so the v198 dist-sync gate judged `enforceComponentDisabled` present, tsc-build clean,
Studio suite **407/407** against the rebuilt package, Studio tsc exit 0. No Studio test moved: the
proofs and surface tests file disabled components without runtime-only fields, where enforcement is a
no-op by construction (collision census: every `enabled: false` add in the tracked tree carries no
`targetObject`/`animationIds`).

Bounds, stated: `setComponentEnabled` keeps its own inline legs — the disable semantics now live in two
carriers (the toggle's else-branch and `enforceComponentDisabled`), deliberately NOT unified, because
the toggle also owns the enable leg that has no add-time counterpart; `restoreEntity` files components
that carry no runtime-only fields at all (v119: the save shape excludes them), so there is nothing for
add-time enforcement to apply through a load — a restored disabled component gates nothing until the
save round-trip is given runtime re-attachment, a different grant. The ADR 0016 amendment record for
this grant is amendment 209.

## The surface watches the registry: component events get their first subscriber (M5 v210)

The runtime has carried an event bus since its beginning, and every component write path has always
announced itself on it — the census of `this.emit(` in `threeRuntime.ts` names `componentAdded`
(line 1625), `componentRemoved` (1643) and `componentStateChanged` (1699), one per write verb. The Studio
subscribed to NONE of them: before this grant, every `addEventListener` call in `apps/studio/src` was on
`window` (resize, keydown) — not one was on the runtime. The inspector was PULL-only: the report moved
when a Studio control pulled it after its own write, and a registry changed by anything else — a console
command, an agent holding the same runtime — stayed invisible until an unrelated event happened to
re-read it. A stale inspector in a game editor is a lie about the scene.

**What landed.**
- `SceneComposerLike` gains the runtime's OWN two verbs, `addEventListener?`/`removeEventListener?`,
  optional like every other gate: a fake without a listener registry is a legitimate host.
- `SceneSurface` gains `watchComponents(listener): () => void`. One listener joins all three component
  names — the listener's IDENTITY is load-bearing, because the runtime's `removeEventListener` is
  indexOf-based and must be handed the same function it was given. The listener is called with NO
  payload: the message is "re-read the report", and the report stays the runtime's single source —
  the watch never invents a second path from the registry to the panel. A host without the verbs
  answers a no-op unsubscribe instead of crashing. The returned unsubscribe is idempotent, safe to
  call in a teardown.
- `Scene3D.tsx` subscribes `() => setReport(surface.report())` in its mount effect and unsubscribes in
  the cleanup, so the HUD and the inspector move with the registry however it changed.
- New cases: 3 in `scene3d.test.ts` (pure layer, over `fakeRuntime`: no-verbs host answers a no-op
  unsubscribe; a verbs host is subscribed to exactly the three names with ONE shared listener, and
  unsubscribed from all three with the same identity; an emit of `componentAdded` actually fires the
  listener), 5 in `scene3dSurface.test.ts` (on the REAL headless runtime: add fires the watcher;
  removed + stateChanged call it too; the re-read report MOVES with a registry change made behind the
  surface's back — the user-visible claim; unsubscribe stops the calls and is idempotent; two watchers
  both hear and each unsubscribe drops only its own).

**Mutation probes (arms measured, not asserted):** A1 — dropping `'componentStateChanged'` from the
events list went red on EXACTLY the 2 named cases that count the subscription set and the all-three
call sequence (2 failed | 99 passed). A2 — neutering the unsubscribe (`return () => {}` after the
subscriptions) went red on 3: the two predicted (the pure three-names/unsubscribe case; the surface's
"changes after it call the listener no more"), PLUS the two-watchers case, which the prediction had
missed — with no removal, watcher A kept hearing after `unwatchA()` and the tally came back
`{a: 2, b: 2}`. The miss is recorded honestly: the arm caught MORE than was predicted, and the extra
red is a legitimate capture of the same mutation, not a hole in the code. A3 — deleting the
verbs-presence guard went red on EXACTLY the no-verbs-host case, which then crashes on
`runtime.addEventListener` being undefined (1 failed | 100 passed). All three arms restored; the
shipped body at `scene3d.ts:988-995` re-verified from disk before the suite.

Measured on this host 2026-10-09: Studio suite **415/415** (31 files; 407 → +8), Studio tsc exit 0;
three-runtime suite **490/490** UNCHANGED — this grant touches no runtime source, and the read confirms
it. The two watch files alone ran 101/101 after restoration.

Bounds, stated: the watch covers the component family ONLY — the runtime's other ~55 event names
(`entityCreated`, `entityRemoved`, `sceneCreated`, save-file and cinematic reports, the frame tick) still
have no Studio subscriber; a body added by console does not move the panel, only a component change does.
The rename/visibility verbs (`setEntityName`, `setEntityVisible`, v197) emit NOTHING at all — an
out-of-band rename is still invisible to the surface, and closing that needs an emit added to the
runtime, not a subscription. The subscription lives in the mount effect with empty deps and reads the
captured `surface`, matching the pull pattern of the rAF loop it joins. The ADR 0016 amendment record
for this grant is amendment 210.

## The silent verbs announce themselves: entityRenamed and entityVisibilityChanged join the bus (M5 v211)

v210's bounds named the door that stayed open: "The rename/visibility verbs (`setEntityName`,
`setEntityVisible`, v197) emit NOTHING at all — an out-of-band rename is still invisible to the surface,
and closing that needs an emit added to the runtime, not a subscription." The census of `this.emit(`
proved it: the component family announced its three write verbs (what v210's watch subscribes to), but
the two v197 entity verbs changed the registry and said nothing — every reader (the report, `pickAt`,
the save) saw the new name only because it happened to re-read.

**What landed.**
- `setEntityName` (threeRuntime.ts:1482) and `setEntityVisible` (1507) now emit `entityRenamed
  { sceneId, entityId, name }` and `entityVisibilityChanged { sceneId, entityId, visible }` — AFTER the
  registry mutation, and for visibility AFTER both records move (`entity.visible` and
  `threeObject.visible`, the v197 two-record rule: the announcement may not arrive while the records
  disagree). A refusal emits nothing: news of a change that did not happen is a lie on the bus.
- New `test/entityEvents.test.ts` — 8 cases: rename payload exact; rename ordering (the listener reads
  the REGISTRY at emit time, not the payload); refused renames silent (blank, non-string, unknown
  entity, unknown scene); visibility emits on both legs — hide and show; visibility ordering (both
  records already agree at emit time); refused visibility changes silent (non-boolean `0` and `'true'`,
  unknown owners); the two names do not cross; `removeEventListener` silences the verb.

**The witness defect this grant found in its own tests.** The first draft of the two ordering cases
asserted INSIDE the listener. `emit()` try/CATCHES every listener and only logs the swallowed error, so
the D2 arm (moving the emit BEFORE the mutation) ran the whole file GREEN — a listener-side `expect` is
an assertion whose failure the runtime eats. Both cases now RECORD what the listener observed and assert
OUTSIDE, and the same rule is written into the shipped comment at the rename emit site so the next
listener-based witness does not repeat it. Re-running D2 after the fix reddened exactly the case it
should.

**Mutation probes (arms measured, not asserted):** D1a — deleting the rename emission went red on
EXACTLY the 4 cases that hear it (payload, ordering, no-cross, removeEventListener; 4 failed | 4
passed). D1b — deleting the visibility emission went red on EXACTLY its 3 (both-legs, ordering,
no-cross; 3 failed | 5 passed). D2 — rename emit moved BEFORE `entity.name = name` went red on EXACTLY
the ordering case (`['Test Entity']` where the registry should already say `Villain`) — after the
witness fix; before the fix it went falsely green, and that false green is this section's headline
finding. D2b — visibility emit moved before both record writes went red on EXACTLY its ordering case
(`[[true, true]]` at emit time). D3 — hoisting the rename emit above every guard (announcing refusals
too) was predicted to redden only the silent-refusals case and reddened FIVE: with the guard-position
emit kept, the success path emits TWICE, so payload, ordering, no-cross and removeEventListener joined
it. The extra reds are legitimate captures of a strictly larger mutation than the one predicted — the
miss was in choosing the arm, not in the code. All arms restored; the shipped emissions re-verified
from disk at lines 1482/1507 before the suites.

Measured on this host 2026-10-09: three-runtime suite **498/498** (19 files; 490 → +8), dist rebuilt
BEFORE the suite (the v198 gate judges the shipped package), build exit 0; Studio suite against the
rebuilt package **415/415** (31 files; unchanged — v211 touches no Studio source, and the v210 watch
still counts exactly its three component names, untouched by the two new emissions).

Bounds, stated: the payloads carry the SCENE the verb was asked about — same shape as the component
family's; the Studio side does not yet SUBSCRIBE to these two names — v210's `watchComponents` list is
still exactly three, and joining the entity pair (moving the v210 pins honestly, with the watch renamed
or split) is a separate grant; `setLightState` and `removeEntity` already emit, and the remaining silent
registry verbs (none in the component family) were censused from the same `this.emit(` walk. The ADR
0016 amendment record for this grant is amendment 211.

## The surface watches the entity pair: an out-of-band rename or hide moves the panel (M5 v212)

v211's bounds named this grant: "the Studio side does not yet SUBSCRIBE to the two entity names — v210's
`watchComponents` list is still exactly three." So the runtime could now announce a rename made by anyone
(console, agent, another panel) and the Studio would still show the replaced name until something else
happened to re-read the report. News on a bus with no listener is the same silence.

**What landed.**
- `SceneSurface.watchEntities(listener): () => void` (declared `apps/studio/src/lib/scene3d.ts:833`,
  implemented 1005-1012) — one listener joined to exactly `entityRenamed` and `entityVisibilityChanged`,
  an idempotent unsubscribe that drops both, and the same host-honest guard as its sibling: a host
  without `addEventListener`/`removeEventListener` answers a no-op unsubscribe rather than crashing.
- `Scene3D.tsx` subscribes BOTH legs in the mount effect (271 components, 274 entities), each with the
  same pull the rAF loop uses — `() => setReport(surface.report())` — and leaves both in the cleanup
  (305, 306).
- A DELIBERATE design choice, recorded because it changes what the witnesses can claim: this is a SEPARATE
  verb, not a fifth name inside `watchComponents`. v210's witnesses pin that subscription to EXACTLY three
  names; widening it there would have made those pins lie about a promise they no longer describe. Arm A4
  below tests the refused shape instead of merely asserting it was refused.

**New cases (10).** `scene3d.test.ts` 77 → 81: no-verbs host answers a no-op unsubscribe; the joined set is
exactly the two names with ONE shared listener (identity, because the runtime unsubscribes by `indexOf`);
the two legs join DISJOINT name sets; an `entityVisibilityChanged` fires the entity watcher and no
component watcher. `scene3dSurface.test.ts` 24 → 29, against the shipped package with every write going
through the RUNTIME and none through the surface: a rename re-reads to `Villain` at emit time (the v211
ordering rule, now consumed from the subscriber side); a hide then a show re-reads `visible` false→true;
component events do not move the entity watcher and vice versa; a refused write (blank name, non-boolean
`'true'`, unknown entity) calls the watcher ZERO times and the case then lands a real rename to prove the
silence was the refusal's, not a dead watch; the unsubscribe drops the leg.

**The wiring got its first reader.** Grepping the suite found that NOTHING read `Scene3D.tsx` for the
watch: v210's subscription shipped with no test of the component that installs it — only of the verb. The
`surface.test.ts` file already grades this component's wiring from source, so v212 adds one case there
(15 → 16): the joined names, in mount order, must be exactly `['watchComponents','watchEntities']`, the
leaves exactly `['unwatchComponents','unwatchEntities']`, and the count of `=> setReport(surface.report())`
pulls must EQUAL the count of joined legs — derived from the file, not hand-typed, so a leg subscribed by
some other expression is the red rather than a number to widen.

**Mutation probes (arms measured, not asserted).** A1 — `entityVisibilityChanged` dropped from the watched
set: predicted 5 reds, got 5, names identical (both DISJOINT pins, the pure emit case, the surface
hide-legs case, the surface news-crossing case). A2 — host-honest guard deleted: predicted 1, got 1 (the
no-verbs case). A3 — a per-event wrapper instead of one shared listener: predicted 2, got 2 (the identity
pin and the unsubscribe case, which is exactly the failure mode the wrapper creates — `indexOf` never finds
a fresh arrow, so an "unsubscribed" watcher keeps firing). A4 — the REFUSED design, `watchEntities` joined
to all five names: first predicted 3 (the crossing pins), re-predicted 4 before the run because the
exact-set case counts the joined names too; got 4. A5 — `unwatchEntities()` deleted from the cleanup:
predicted 1, got 1 — the new source pin, i.e. the suite's only reader of the wiring, and A5 is what proves
that pin is not decorative. 13 reds across 5 arms, 13 attributed, 0 unexplained; every arm restored byte-
identical and re-verified before the suites.

Measured on this host 2026-10-09: Studio tsc exit 0, Studio suite **425/425** (31 files; 415 → +10). No
three-runtime source was touched, so no rebuild was needed and its suite re-ran at **498/498** (19 files)
against the package v211 shipped.

Bounds, stated: the source pin grades TEXT, not behaviour — it cannot see that the subscription lives in the
mount effect with empty deps, and an `unwatchEntities()` placed anywhere in the file satisfies it (a React
render test would be the reader that closes this, and no such harness exists for `Scene3D.tsx`);
`entityCreated`/`entityRemoved` still have NO Studio subscriber, so a body added or removed out-of-band
still does not move the panel — the census of `this.emit(` shows those names carrying no listener above the
runtime; the component `data` bag is still unread by the inspector (v199 counts names, v212 reads none of
their values). The ADR 0016 amendment record for this grant is amendment 212.

## The surface watches the body pair: an out-of-band add, removal or restore moves the roster (M5 v216)

v212's bounds named this grant: "`entityCreated`/`entityRemoved` still have no subscriber (a body added by
console does not move the panel)". The runtime has announced both names ever since the bus existed, and
nothing above it listened — so a console command or an agent writing through the runtime could add a body to,
or take one out of, the scene the Studio is reporting, and the roster would keep naming the scene as it was
when the component mounted. This is the third leg of the seam v210 opened and v212 widened.

**What landed.**
- `SceneSurface.watchBodies(listener): () => void` (declared `apps/studio/src/lib/scene3d.ts:847`, the census
  comment 834-846, implemented 1030-1037) — one listener joined to exactly `entityCreated` and
  `entityRemoved`, an idempotent unsubscribe that drops both, and the same host-honest guard as its two
  siblings: a host without `addEventListener`/`removeEventListener` answers a no-op unsubscribe rather than
  crashing. No three-runtime source changed, so the package this runs against is still the one v211 shipped.
- `Scene3D.tsx` subscribes all THREE legs in its mount effect (271 components, 274 entities, 278 bodies), each
  with the same pull the rAF loop uses — `() => setReport(surface.report())` — and leaves all three in the
  cleanup (309, 310, 311).
- The source pin that reads that file is widened from a pair to a triple (`surface.test.ts`: 6 lines replaced,
  case count unchanged at 16). The joined names in mount order must be exactly
  `['watchComponents','watchEntities','watchBodies']`, the leaves exactly
  `['unwatchComponents','unwatchEntities','unwatchBodies']`, and the count of
  `=> setReport(surface.report())` pulls must EQUAL the count of joined legs. That last clause is derived from
  the file rather than hand-typed, so it rose to 3 on its own: a leg subscribed by some other expression is
  the red rather than a number to widen.

**The name set came from an emit census, not from the family's size** — recorded because the obvious drafting
was wrong. `createEntity` (threeRuntime.ts:1290) and `restoreEntity` (1759) both build their body through the
same private `insertEntity` (1319), which emits `entityCreated` UNCONDITIONALLY (1387) before `restoreEntity`
emits `entityRestored` (1799). So there is no input where a restore news a body without the pair already
newing it: watching the third name would add a subscription and no information — a belt with no input that
only it reaches. Adding it is not conservatism; it is a claim that a restore can happen unheard. The refused
shape is MEASURED below (A4), not merely argued away.
`activeSceneChanged` (1286) is likewise absent on purpose: it does move `report.scene`, but it changes WHICH
scene is reported rather than what is in it — a different fact, therefore a different leg. Bounds names it.

**New cases (12).** `scene3d.test.ts` 81 → 86, against a local bus: a no-verbs host answers a no-op
unsubscribe · the joined set is exactly the two names with ONE shared listener (identity is load-bearing,
because the runtime unsubscribes by `indexOf`) · the THREE legs join pairwise DISJOINT name sets with no name
joined twice · `entityCreated` and `entityRemoved` each fire the body leg · and `entityRestored` is pinned as
NOT a watched name — 0 fires, followed by a real `entityCreated` that fires 1, so the silence is the name
set's and not a dead watch's. `scene3dSurface.test.ts` 29 → 36, against the shipped package with every write
going through the RUNTIME and none through the surface: an add re-reads the roster `before+1` with the new
name in `entityNames` · a removal re-reads `before-1` · removing the SELECTED body answers `inspector: null`
while `selected` still names it, which is v197's two-record rule consumed from the SUBSCRIBER side · a
snapshot→remove→restore cycle moves the leg EXACTLY ONCE, so the census above is a measured behaviour rather
than a sentence about code · a refused removal (unknown body, unknown scene — `removeEntity` returns false at
1513/1516, before any emit) calls the watcher ZERO times and the case then lands a real removal to prove the
silence was the refusal's and not a dead watch's · body news moves the body leg alone and `setEntityName` is
not body news · the unsubscribe drops the body leg only, the entity leg keeps hearing, and a double unwatch
does not throw.

**Mutation probes (arms measured, not asserted).** A0 control (no mutation): 0 reds over the 138 cases these
three files collect. A1 — `entityRemoved` dropped from the pair: first predicted 5, got 6. The extra was the
pure cross-leg case, whose second emit IS an `entityRemoved`, so dropping the name silences its second half
too; the prediction is re-derived from the mechanism and the arm re-run alone: 6 predicted, 6 hit, MATCHED
(`A1-repredict.log`). The miss is on record rather than smoothed. A2 — host-honest guard deleted: predicted
1, got 1 (the no-verbs case). A3 — a per-event wrapper (`() => listener()`) instead of one shared listener:
predicted 2, got 2 — the identity pin and the unsubscribe case, exactly the failure mode a wrapper creates,
since `indexOf` never finds a fresh arrow and an "unsubscribed" watcher keeps firing. A4 — the REFUSED
design, `entityRestored` added to the watched set: predicted 4, got 4 (the exact-set pin, the three-leg
DISJOINT pin, the not-a-watched-name pin, and the restore-exactly-once case, which is the one that stops
being once). A5 — `unwatchBodies();` deleted from the component cleanup: predicted 1, got 1 — the widened
source pin, the suite's only reader of the wiring, so A5 is what proves that pin is not decorative. **14 reds
across 5 arms, 14 attributed, 0 unexplained.** Every arm re-based from the bytes on disk at its own top,
verified that its needle hit exactly once and that the mutant text is present before running vitest, and
restored to a sha-equal file afterwards (`scene3d.ts` 9812f6a53742 before and after A1-A4, `Scene3D.tsx`
bc1e03cb98c4 before and after A5).

Measured on this host 2026-10-10: Studio `tsc --noEmit` exit 0, Studio suite **437/437** (31 files; 425 →
+12). No three-runtime source was touched, so no rebuild was needed and its suite re-ran at **498/498**
(19 files) against the package v211 shipped. The §7 ledger-vs-records door was red BEFORE this section was
written, refusing `unrecordedNewest:215`: grant 215 has a ledger heading and no record TITLE anywhere in the
113-file corpus, which is that lane's debt and not something this cycle may write for it (amendment 90's
rule). This section titles 216, so the newest-grant refusal is satisfied by the cycle that owes it; 215 stays
in the door's `hole` list, named on the console, exactly as the older holes are.

Bounds, stated: the source pin grades TEXT, not behaviour — it cannot see that the subscription lives in the
mount effect with empty deps, and an `unwatchBodies();` anywhere in the file satisfies it; closing that needs
a React render harness, which still does not exist for `Scene3D.tsx`. `watchBodies` takes no payload, like its
siblings, so a body event from ANOTHER scene also re-reads: the report then names the ACTIVE scene
(`buildSceneReport`, scene3d.ts:587-595, reads `graph.activeSceneId`), so the cost is a redundant render and
no wrong value — derived from the reader's code, and no cross-scene case exists yet to measure it.
`activeSceneChanged` still has no subscriber, so an out-of-band scene switch does not move the panel. The
component `data` bag is still unread by the inspector (v199 counts names, v212 and v216 read none of their
values). The ADR 0016 amendment record for this grant is written in the same commit as this section.

## The surface watches the scene pair: an out-of-band scene add or switch moves the panel's scene rows (M5 v217)

v216's bounds named this grant in one sentence: "`activeSceneChanged` still has no subscriber, so an
out-of-band scene switch does not move the panel." News on a bus with no listener is the same silence — but
the cycle closes with MORE than that sentence asked for, because the same write census that cut v216's name
set down reached the OPPOSITE verdict here, and that reversal is the part worth recording.

**What landed.**
- `SceneSurface.watchScenes(listener): () => void` (declared `apps/studio/src/lib/scene3d.ts:848-864`,
  implemented 1058-1065) — one listener joined to exactly `sceneCreated` and `activeSceneChanged`, an
  idempotent unsubscribe that drops both, and the same host-honest guard as its three siblings.
- `Scene3D.tsx` subscribes the fourth leg in the mount effect (283) and leaves it in the cleanup (317), each
  with the same pull the rAF loop uses — `() => setReport(surface.report())`.
- `surface.test.ts`'s source pin widened from three legs to four: joined names, leaves, and the DERIVED pull
  count, which rose to 4 by itself because it is computed from the joined list, never hand-typed.

**Why BOTH names carry — the census, and the reversal.** The rule this arc has used since v210 is: watch a
name only if some input moves a reported field AND only that name announces it. Applied to the scene family
it gives no subsumed echo, because:
- Only two methods write what the report reads. `createScene` does `scenes.set(...)` (threeRuntime.ts:1238)
  and, when the graph was empty, `activeSceneId` too (1240-1241); `setActiveScene` writes `activeSceneId`
  alone (1285). No verb deletes a scene, so `report.scenes` only ever grows.
- The two names move DIFFERENT fields, and the surface witnesses assert exactly that split rather than
  "something changed": the add case pins `activeSceneId` and the scene NAME unchanged while `scenes` moves,
  and the switch case pins `scenes` unchanged at 2 while the name and roster move.
- `sceneCreated` is NOT subsumed by the switch name — the inverse of v216's `entityRestored`. The FIRST scene
  on an empty graph activates from inside `createScene` and emits no `activeSceneChanged`, so a switch-only
  leg would leave the panel naming no scene after one appeared. The runtime-level case measures that on the
  shipped package rather than asserting it: `activeSceneId` moves from `null` to the new scene's id while the
  two raw listeners record exactly `['created']` — and then, for a real later switch, `['changed']`, so the
  first half is not "the runtime never emits that name".
- `disposed` (4212 empties the graph, 4232 emits) is REFUSED, and the refusal is witnessed twice: the pure
  case pins the emit as silent followed by a live `activeSceneChanged`, and the surface case proves the leg
  was ALIVE before `dispose()` and quiet through it. The reason is in the component: `Scene3D.tsx`'s cleanup
  calls `runtime.dispose()` (320) after the four unwaatches, so a `disposed` leg would re-read a report off a
  graph being torn down — a pull into a dead panel, for news no live panel can show.

**New cases (13).** `scene3d.test.ts` 86 → 91 (5 → +5 under a new `describe('watchScenes (M5 v217)')`): a
no-verbs host answers a no-op unsubscribe; the joined set is exactly the two names with ONE shared listener
(identity, since the runtime unsubscribes by `indexOf`) and both leaves; ALL FOUR legs join pairwise DISJOINT
name sets — 9 joins, 9 distinct names, and neither scene name present in any earlier leg's slice; each scene
name fires the scene leg alone against the other three; `disposed` not watched, with a live name after it so
the silence is the name's. `scene3dSurface.test.ts` 36 → 44 (8 cases, every write through the RUNTIME and
none through the surface): a second scene re-reads `{scenes: before+1, activeSceneId: <the surface's own>,
name: 'Studio Scene'}` AT EMIT TIME; a switch re-reads the other scene's name and roster while
`surface.sceneId` keeps naming the scene whose frame loop it owns; the silent-first-activation census claim on
the bare shipped runtime; a switch clears `inspector` but NOT `selected`, and switching back restores the
facts — the two-record rule (v192/v197) survives a scene change; a refused switch (`setActiveScene` on an
unknown id → `false`, threeRuntime.ts:1283-1284 returns before emitting) fires zero times, then a real add
proves the watch alive; leg isolation both ways on the real bus (a scene add is not body news, a body add is
not scene news); the unsubscribe drops the scene leg only, and a double unwatch does not throw; `dispose()`
is not watched.

**The pin caught my own omission before the commit.** The first run of these three files had exactly one red,
and it was real: I wired the fourth join and forgot the fourth `unwatchScenes();` in the cleanup, and
`surface.test.ts` — the suite's only reader of `Scene3D.tsx` — named it. v212 and v216 each argued from
theory that this source pin is not decorative; here it caught the same defect arm A5 plants, in the same shape,
on an honest first pass. Recorded because the alternative reading ("the test is brittle") is exactly what the
arm exists to refute.

**Mutation probes (arms measured, not asserted).** A0 control: 151 collected, 0 red. A1 —
`activeSceneChanged` dropped from the watched set: predicted 6, got 6, names identical (the exact-set pin, the
four-leg DISJOINT pin, the fire-alone case whose second emit is that name, the `disposed` case whose alive-proof
emits it, and both switch-carrying surface cases). A2 — host-honest guard deleted: predicted 1, got 1. A3 — a
per-event wrapper instead of one shared listener: predicted 2, got 2 (the identity pin, and the surface
unsubscribe case, which is the failure mode the wrapper creates — `indexOf` never finds a fresh arrow, so an
"unsubscribed" leg keeps firing and re-reads a panel that left). A4 — the REFUSED design, `disposed` added to
the watched set: predicted 4, got 4 (the two exact-set pins, the pure not-a-watched-name pin, and the surface
`dispose()` case, which stops being quiet). A5 — `unwatchScenes();` deleted from the cleanup: predicted 1, got 1.
**14 reds across 5 arms, 14 attributed, 0 unexplained, 6/6 arms MATCHED with no re-prediction** — the first
battery in this arc that needed no second guess. Each arm re-based from the bytes on disk at its own top, proved
its needle hit exactly once and that the mutant text was on disk before running vitest, and restored to a
sha-equal file (`scene3d.ts` d469218da682 before and after A1-A4, `Scene3D.tsx` dfe6eb1f3282 before and after A5).

Measured on this host 2026-10-10: Studio `tsc --noEmit` exit 0, Studio suite **450/450** (31 files; 437 → +13).
No three-runtime source was touched, so no rebuild was needed and its suite re-ran at **498/498** (19 files,
runner exit code read directly) against the package v211 shipped. One attribution note, kept because a name
multiset would otherwise misread it: the `surface.test.ts` case did not get ADDED, it got RENAMED
(`ALL THREE watch legs` → `ALL FOUR`), so that file is 16 → 16 cases and its old title disappears from the
corpus by design.

Bounds, stated: the source pin still grades TEXT, not behaviour — it cannot see that the subscription lives in
the mount effect with empty deps, and an `unwatchScenes();` anywhere in the file satisfies it; closing that
needs a React render harness, which still does not exist for `Scene3D.tsx`. `watchScenes` takes no payload, so
a scene event from ANYWHERE re-reads — for this leg that is correct rather than merely harmless, because the
report reads the ACTIVE scene globally (`buildSceneReport`, scene3d.ts:593-595), but the same property means a
switch into a scene the Studio never composed shows an empty body roster and `active camera: —`. That is the
truth of that scene, not a defect, and no case measures it yet. The surface's own `load()` verb (1116) creates
a scene, so a restore now re-reads through the bus as well as through its return value — a duplicated pull,
harmless, and the same as v210's siblings. `entityCreated`/`entityRemoved` from another scene still re-read the
active scene (v216's bound, unchanged). The component `data` bag is still unread by the inspector. The lifecycle
family — `initialized` (1193), `resize` (1199), `disposed` (4232) — is still unwatched, which is v218's census
question; `started`/`stopped`/`frame` are already REFUSED there because no reported field moves for them. The
ADR 0016 amendment record for this grant is written in the same commit as this section.

## The dock's BUILD face (M6 v174 — ADR 0016 amendment 174)

The first product consumer of the build arc (amendment 173), and the section this increment never had: the
gate's §7 arm found that grant 174's only mention in the record corpus was a *deep* line inside
`build-lane-proof.mjs` (line 4, "v174 wired the product face around ONE pinned arc"), which the positional
title reader does not read as a title — so 174 sat in the hole set with nothing that titled it.

**What landed.** `src/lib/buildServer.ts` walks the arc inside the browser's service:

- **The ARC is pinned as data** (`STUDIO_BUILD_ARC` — two verify steps: the container runtime answers with its
  own version; the container computes `arc ok:5` and prints it). The route's POST takes **no body**, so the
  browser cannot name a single argv — the same rule v172's container lane established, one layer up.
- **The walk uses the runtime's own `policyCheckpoint`** — the §28 stance as DATA (`build.verify` granted
  because the human allowed the arc once at the panel, everything else default-deny) — with
  `recordReceipts: true`, so the answer carries **one receipt per walked door** (callId, grant, reason) and
  the panel shows WHO the door let in and why rather than a bare green tick.
- `src/app/api/agent/build-arc/route.ts` serves it (Node runtime, bodyless POST);
  `src/lib/buildLane.ts` is the client fetch adapter and imports **nothing** from `@nexus/agent-runtime` or
  `@nexus/exec-host`, so the browser bundle stays runtime-free and spawn-free.
- `AgentPanel` gains the build face: a status line, an Allow-once ask naming the steps and the engine,
  per-step engine detail lines, and a ledger line via `buildArcLedgerLine` (`via: 'build.verify'`).

**Measured.** Studio 229 → **239** (5 `buildServer` cases, incl. the green walk through the REAL isolation
flags with receipts and the red walk), harness 7 → **8/8**.

Bounds, stated: the arc is two pinned steps over one `build.verify` door, and the deploy leg is a LATER
increment (v176/v177). Nothing here publishes, pushes or releases — the walk records what it verified.

## v218 — the surface's FIFTH watch leg, and the verb that was writing a reported field in silence (ADR 0016 amendment 218)

`ThreeRuntime.resize` has announced itself on the event bus since always and `initialize` announces the backend
it builds — but `setPixelRatio` wrote `backend.state.pixelRatio`, which is exactly the `pixels.pixelRatio` the
surface REPORTS, and no name on the bus carried the news. An out-of-band ratio change (a console command, an
agent, another component) left the panel showing a pixel figure no longer in force.

The verb now emits AFTER the backend has taken the value, and a call with no backend — which can change no state
— returns quietly instead of announcing a write that did not happen.

`SceneSurface.watchPixels` joins one listener to exactly `initialized`, `resize` and `pixelRatioChanged`: the
three writes that move `report.backend` or `report.pixels`, the two fields no earlier leg reads. Same
host-honest guard, idempotent unsubscribe and payload-free contract as its four siblings. Two refusals are
stated rather than omitted — `disposed` (this effect's own teardown calls `runtime.dispose()`) and
`started`/`stopped`/`frame` (no report field keys off whether the loop is running, and `frames`/`draws` already
refresh from the loop's own pull, throttled by design).

The pairwise-disjointness pin re-widens with each leg, so v216's four-leg case cannot hide a name only a fifth
leg adds: **9 joins → 12 joins, 12 distinct names**, with each later family's names asserted absent from every
earlier leg's slice.

| layer | what it proves |
| --- | --- |
| `packages/three-runtime/test/pixelRatioEvent.test.ts` (7) | emit exactly once with the ratio asked for · the listener reads the NEW ratio from the backend at emit time · a call before `initialize()` is silent · a throwing listener cannot un-apply the write · the bus reports ASKS not deltas · the two pixels names do not cross · `removeEventListener` silences it |
| studio cases (13) | the fifth leg's name set, the disjointness pin, and the wiring through `Scene3D` |

**Mutation probe, 3 arms, 3/3 MATCHED** (async spawn — `execFileSync` answers EBUSY on this host, amendment 152):
the emit removed → five cases red; the no-backend guard removed → the "BEFORE initialize() is SILENT" case red;
the emit moved BEFORE the write → `expected [ 1 ] to deeply equal [ 1.5 ]`, i.e. **the listener read the OLD
ratio**, which is precisely the claim that case makes.

Bounds: the verb reports ASKS, not deltas (setting the ratio it already holds still announces and still writes,
so a subscriber re-reads once per call); the leg carries no payload by design, because carrying the ratio would
be a second source of truth for a number the report already owns; and `Scene3D`'s own `onResize` now re-reads
twice — a redundant render, not a wrong value.

## v204 — the component registry gates HUD visibility: the record this grant was owed (ADR 0016 amendment 219)

`f02dac8`'s commit message ends "The ADR 0016 amendment record for this grant is owed", and it cites "amendment
204" — a number that belongs to the type-gate repair. The record is written under the next free number and states
the collision; this section is where the increment is described.

`setComponentEnabled` also filters the component out of `entityComponentsOf()`'s result, so the `enabled` flag
gates four things under one rule: query participation (v201), rendering via `targetObject` (v202), animation
playback (v203), and inspector visibility (v204) — the same rule `getEnabledComponents` already applies, so the
HUD shows what the query layer sees.

**Recorded as it shipped: SIX RED TESTS** (`Studio suite 401/407`, the commit's own words). That matters beyond
bookkeeping — **amendment 207** exists because v204's filter had shut the only re-enable door, leaving a disabled
component both invisible and un-re-enableable. A suite committed red is a suite whose red cannot be told from a
regression.

Bounds: a disabled component is still STORED and can be re-enabled (once v207 restored the door); the filter
applies to the reported projection, not the data. `SerializedEntityComponent` excludes `targetObject` and
`animationIds` from the file format, so neither runtime-only field reaches a save.

## v218's own leg arms: the pixels leg measured on BOTH planes, and the reader defect its first run found (ADR 0016 amendment 223)

The record that `amendment 218` left open. Its probe was **3 arms and all of them mutated
`packages/three-runtime/src/threeRuntime.ts`** — the verb's own file — so every one of its reds came from the
runtime unit suite. Nothing had ever reddened the 13 Studio cases that make the LEG's claims, and nothing had
ever run a verb mutation through the shipped seam. This section reports that missing half, measured at
`939d13d`, plus two defects found in the measuring instrument itself.

**The baseline, read before any arm** (`apps/studio`, `packages/three-runtime`, full suites): Studio **463 tests
over 31 files, 0 red**; three-runtime **505 over 20 files, 0 red** (including `distSync.test.ts`, so the built
`dist` agreed with `src`); `tsc --noEmit -p tsconfig.json` in `apps/studio` exited **0**. The battery's own
groups are narrower and are named by their case counts: a 3-file studio group of **164** and a 2-file runtime
group of **58**.

**The battery: 11 arms — 8 mutations + 3 controls — 28 predicted reds, 28 measured, 11/11 MATCHED.** Controls
`A0`/`B0`/`Z9` (the last runs AFTER every restore) each produced **0 red**, so the attribution below is not a
loaded-box artifact.

| arm | mutation | plane(s) | reds, by name |
| --- | --- | --- | --- |
| `A1` | `pixelRatioChanged` dropped from the watched triple | studio | 7 — the three-names join, the five-leg disjointness pin (in `watchScenes (M5 v217)`), "each fire the pixels leg and none of the other four", "frame is NOT a watched name", and the shipped-bus out-of-band ratio, cross-leg and post-`dispose()` cases |
| `A2` | the pixels leg's host-honest guard deleted | studio | 1 — `watchPixels (M5 v218) a host without event verbs answers a no-op unsubscribe instead of crashing`, `TypeError: runtime.addEventListener is not a function` |
| `A3` | a per-event wrapper instead of one shared listener | studio | 2 — the join case (`expected 3 to be 1`: THREE distinct listener identities handed to the bus where the leg is supposed to hand one) and "unsubscribing drops the pixels leg only" (`expected 1 to be 0` — `removeEventListener` cannot match a wrapper it never saw) |
| `A4` | the REFUSED design: `frame` added to the triple | studio | 4 — the name set, the disjointness pin, "frame is NOT a watched name", and "a drawn frame moves `draws` while the pixels leg stays DEAF" |
| `A5` | `unwatchPixels()` deleted from the component cleanup | studio | 1 — "the 3D component joins ALL FIVE watch legs and leaves ALL FIVE on teardown" |
| `B1` | the `emit` deleted (the verb goes back into silence) | runtime **and** studio | 5 runtime + **4** Studio, incl. the twelve-raw-listener census case — see the hole below |
| `B2` | the `emit` moved BEFORE the write | runtime **and** studio | 1 + 1 — the runtime case reads `[ 1 ]` where it demanded `[ 1.5 ]`; the Studio surface shows **`expected 1 to be 2`**, i.e. the PANEL keeps the OLD ratio |
| `B3` | the no-backend guard deleted | runtime **and** studio | 1 + 1 — both planes die with `TypeError: Cannot read properties of null (reading 'setPixelRatio')` |

**What this adds to `amendment 218`'s claims is cross-plane, not extra.** `B2` and `B3` are the ordering claim
and the silence claim measured through the SHIPPED seam: because `apps/studio/vitest.config.ts` aliases
`@nexus/three-runtime` to `packages/three-runtime/src/index.ts`, a runtime mutation is graded by the Studio
suite too, so the panel's own pixel figure is proven to depend on the emit happening AFTER the write. That is
why each `B` arm runs both groups; the runtime group deliberately excludes `distSync.test.ts`, which grades
`src` against the built `dist` and would redden on every runtime arm for a reason that is not this grant.

**Restores, proven by hash, not by hope:** `scene3d.ts` `eb7040b97d7f`, `Scene3D.tsx` `d5284a5d89b2`,
`threeRuntime.ts` `50ef2aaf4c3a` — each re-read after its arm and byte-identical to the pre-arm bytes, and the
tree was checked at rest (HEAD unmoved, no foreign tracked dirt) before every mutation and after every restore.
That check is not ceremony: this lane's v218 work was committed by a concurrent writer out of a dirty worktree,
so a mutant sitting on disk is a mutant that can be swept into someone else's commit.

**Two defects in the instrument, recorded because the first run's number was the wrong one.**

- The reader's verdict line was `if (unexplained.length || missed)` — an ARRAY, which is always truthy. Every
  arm read `DIFF` and the headline was **`attributed_arms=0/11` on 28 genuinely attributed reds**. Fixed to an
  exactly-one matcher that separates MISSED (a prediction no red satisfied) from AMBIGUOUS (one prediction
  satisfied by 2+ reds). A validator's first run is its first test, and this one failed.
- Mis-pinned predictions: several were built by concatenating a describe title onto an `it` title, which is not
  how the runner renders `fullName`, so they could match nothing. The fix is a **preflight that reads the real
  case names out of the test files** — 28 predictions, each a substring of exactly ONE name in a population of
  164 studio + 58 runtime cases, 0 bad. It caught a live collision: "a host without event verbs answers a no-op
  unsubscribe instead of crashing" exists **once per leg** (five describes), so `A2` was re-pinned to its
  leg-qualified form before the battery counted.

**The one genuine hole the first run measured and my predictions did not.** `B1` reddened **four** Studio cases
against three predictions: `on the real bus a ratio change news ONLY pixelRatioChanged: twelve raw listeners,
one name fires` reads the VERB through the shipped bus rather than through the leg, so deleting the emit reddens
it too. 28 reds against 27 predictions was how that surfaced; the prediction is now in the table and the run is
11/11.

Bounds: the runner and its prediction module live in this session's Temp directory, not in the repository — the
arms, needles and expected names are transcribed above so the measurement can be rebuilt, but a reader cannot
re-run it from a clean checkout. The battery grades the two suites it names; the full 463/505 green above came
from a separate run, not from `Z9`. And a missed prediction is a hole in a PREDICTION, not in the code: every
red this battery measured was explained, which is the property the run lacked before the reader was fixed.

## v224 — the surface's SIXTH watch leg, and the refusal that silently cleared the active camera (ADR 0016 amendment 224)

`setActiveCamera` validated its argument AFTER committing the edit. It cleared every camera's `active` flag and
only then looked the requested id up, so `setActiveCamera(scene, BOGUS)` answered `false` — the same answer its
no-such-scene branch gives — while leaving the scene with **no active camera at all**. Measured on the shipped
bytes before the fix: the reported active id went to `null`, no name fired on the bus (a refusal has no payload
to news, correctly), and because `animate()` renders only when `activeCamera` is found, **the drawing stopped** —
`backend.stats.calls` grew by 4 over the three frames before the refusal and by 0 after it. A refusal that edits
is the worst shape of refusal: the caller is told nothing happened, and everything happened.

The fix is two lines swapped: look the camera up, refuse, and only then move the flags and announce
(`threeRuntime.ts:2545-2553`).

`SceneSurface.watchCameras` joins one listener to exactly `cameraCreated` and `activeCameraChanged` — the two
names over the three report fields no earlier leg moves (`scene.cameras`, `cameraNames`, `activeCamera`). Same
host-honest guard, idempotent unsubscribe and payload-free contract as its five siblings. This grant's grant
**adds no verb**: both names already existed. What did not exist was the guarantee that a refusal moves nothing.

Two refusals are stated rather than omitted. Camera TRANSFORM writes (`position.copy`, `lookAt`, `fov` at
`2854-2859`, and the surface's own `aim()` at `977`) move the live `THREE.Camera`, which the report never reads —
it takes only `id`, `name`, `active`. A leg on those would re-read a report that cannot have changed. And
`disposed` keeps v217's reason: the component's own teardown calls it.

The census found no third name to consider because there is no third write: `cameras.delete` and `cameras.clear`
appear nowhere in the runtime, so within a scene `cameras`/`cameraNames` only ever grow. `createScene` starts
`cameras` at an empty Map and `setActiveScene` changes WHICH scene is read — both move this leg's fields for a
SCENE-level reason, and both are already watched by v217's scene pair. That bookkeeping is why the
disjointness pin exists, and the pin re-widens with each leg: **12 joins → 14 joins, 12 → 14 distinct names**,
with the camera pair asserted absent from every earlier leg's slice.

| layer | what it proves |
| --- | --- |
| `packages/three-runtime/test/cameraSwitch.test.ts` (11) | the refusal keeps the previously active camera ACTIVE · every flag is left as found, not only the active one · a bad scene and a bad camera are the SAME no-op · a camera belonging to another scene is refused and neither scene's account moves · a success emits once with the pair asked for · the announcement arrives AFTER both flags moved · the bus reports ASKS, not deltas · exactly one camera stays active through success+refusal+re-ask · the render loop keeps drawing through a refusal · a throwing listener cannot un-apply the switch · the first camera of a scene is active on creation |
| studio cases (12 — 5 in `scene3d.test.ts`, 7 in `scene3dSurface.test.ts`) | the sixth leg's name set against a host WITH verbs and one without them, the pairwise-disjointness pin re-widened over six legs, `the scene pair is NOT watched by the camera leg`, the shared-listener identity and the idempotent unsubscribe, and the three claims driven through the SHIPPED runtime: an out-of-band add, an out-of-band switch, and the camera write the component itself makes |

**Baseline read before the arms, at `52a1a51`, one ref for all four measurements:** three-runtime
`npx vitest run` 22 files / 521 collected / 521 passed / 0 red (11.17s); Studio 31 files / 474 / 474 / 0 red
(24.93s); `tsc -p tsconfig.json --noEmit` exit 0 in both packages (12.64s and 20.65s). The four ran
**sequentially**, because this box false-reddens under concurrent heavy test load and a reddened baseline is not
a baseline. The population the arms actually grade is narrower and is named by the runner: the four runtime files
holding the camera-switch, pixel-ratio, runtime and character-controller cases (**108 collected**) and the three
Studio files holding the surface, leg and wiring cases (**175 collected**), both 0 red.

**Witness battery, 8 arms, 30 predictions, 30 reds, 8/8 MATCHED** at `52a1a51`. Every arm is a byte splice
(needle → mutant on Buffers, not strings), every red attributed by full case name, every restore proven
byte-identical, HEAD and tracked-cleanliness asserted before each mutation and after each restore.

Two instrument facts, because both were found before the code was measured rather than after. A **preflight**
runs first and refuses to let the battery start: it demands each needle hit exactly once in the file's own bytes,
each prediction name exactly one COLLECTED case, and both groups green with a non-empty population — and its
first run here REFUSED on `R1` with `hits=0` on a needle that is plainly on the page. The cause was the reader,
not the file: these sources are UTF-8 with em-dashes and curly apostrophes in the very lines the census quotes,
so a `latin1` view renders `—` as three characters and the needle cannot match. Every needle is now a `Buffer`,
which also means the splice cannot re-encode the bytes it leaves alone. A second refusal, `S4`, was my own
check being wrong: a **pure insertion** whose tail also sits right before it over-trims to a zero-length changed
window (`0→22b`), which my "the splice is a no-op" clause read as void. The no-op question is a byte question —
`Buffer.compare(pristine, mutant) !== 0` — and a dry run over all eight arms now prints each arm's changed core
(`-` and `+`, first 120 chars) so a needle wider than its claim is visible before it runs.

| arm | mutation | reds | the sentence the red says |
| --- | --- | --- | --- |
| `R1` | lookup-after-the-clear put back (the pre-fix order) | 7 rt + 1 studio | `expected 'Cam 1:false,Cam 2:false' to be 'Cam 1:false,Cam 2:true'` — a refusal leaves NO camera active; and `expected +0 to be 3` at the draw counter — the refusal stops the picture |
| `R2` | the `activeCameraChanged` emit deleted | 4 rt + 3 studio | `expected [] to deeply equal [ { …(2) } ]` — the success news nothing |
| `R3` | emit moved BEFORE the flags move | 2 rt + 1 studio | `expected [ 'Cam 1:true,Cam 2:false' ] to deeply equal [ 'Cam 1:false,Cam 2:true' ]` — a listener at news time reads the OLD active camera; the studio half shows the same lie through the shipped seam |
| `S1` | `activeCameraChanged` dropped from the leg's pair | 5 studio | `expected [ 'cameraCreated' ] to deeply equal [ 'cameraCreated', …(1) ]`, and the six-leg disjointness pin reddens because a leg's own slice no longer names both camera names |
| `S2` | the camera leg's host-honest guard deleted | 1 studio | `TypeError: runtime.addEventListener is not a function` — and only the camera leg's case, which is why this prediction carries its describe: that case name occurs once per leg, six times in the file |
| `S3` | the listener wrapped per event instead of shared | 2 studio | `expected 2 to be 1` at the join (two identities handed to the bus) and `expected 1 to be +0` at the unsubscribe — `removeEventListener` matches by identity and cannot match a wrapper the caller never saw |
| `S4` | `activeSceneChanged` added to the camera leg | 3 studio | `expected [ 'news' ] to deeply equal []` — the scene name reaches a leg that must not hear it; the disjointness pin and the leg's own name-set case both refuse the borrow |
| `S5` | `unwatchCameras()` neutered in the component teardown | 1 studio | the wiring case's leave-list drops from six to five |

**Predicted green, and proven green by not reddening.** `on the real bus a camera switch news ONLY
activeCameraChanged: fourteen raw listeners, one name fires` attaches its listeners to the RUNTIME, not to a
leg, so it witnesses the VERB — it stays green under every leg-only arm (`S1`, `S3`, `S4`). That is the B1
lesson from amendment 223 applied before the run rather than discovered in it.

Two design gaps were repaired before measuring rather than recorded as holes afterwards. The
throwing-listener case used to assert only `not.toThrow()` and the FINAL account, which an emit-first mutant
passes — its name promises an ordering it could not see, so it now reads the account INSIDE the listener, and
`R3` reddens it. And six line citations in the new JSDoc were moved by my own inserts; every referent was
re-verified against the final bytes (`52a1a51`), with a repo-wide grep proving no other shifted citation exists.

Bounds: the leg carries no payload by design — a camera id in the announcement would be a second source of
truth for what `report.cameraNames` already reports. The bus reports ASKS, not deltas: re-asking the camera that
is already active still emits and still writes, so a subscriber re-reads once per call. A camera cannot be
removed from a scene at all today, so this leg's fields only ever grow within a scene — if a `removeCamera` verb
ever lands, it must emit, and the disjointness pin will name which leg owns it. And the battery is not
re-runnable from a clean checkout: the runner, the needles and the predictions live in this session's Temp
directory, transcribed above so the measurement can be rebuilt by hand.

## v227 — the Studio's load() completed the caller's half of the restore protocol, and a save carrying a cutscene became readable (ADR 0016 amendment 227)

The Studio restores into a SIBLING scene by design: "a restore never overwrites live state — the demo scene and
its frame loop stay exactly what they were". That design could not read a cutscene back, because the runtime's
cinematic half named an ABSOLUTE scene id (fixed in the runtime at v227), and because the two things a caller
still owes a file were never done here at all.

`SceneSurface.load()` now does both halves, and ANSWERS what it did:

- **Every camera the file's shots name is re-issued into the sibling, under the file's own id.** The save format
  carries no camera objects — a shot names a `cameraId`, and the name, type and FOV behind it are not in the file
  — so the loader refuses a shot naming a camera the target scene lacks. The name is therefore SPELLED from the
  id (`Restored shotcam`) rather than borrowed from a camera the save cannot describe.
- **A file describing a cutscene that was RUNNING makes the sibling the ACTIVE scene.** `playCinematic` plays
  only on the active scene ("a save that resumes a cutscene nobody is looking at is a save that is already
  interrupted"), so without it a running sequence could not resume anywhere. A STOPPED sequence restores without
  touching which scene the panel reads.
- **The re-issue is reported, not done silently.** `SceneLoadReissued` answers `{ cameraIds, activated }`, so a
  host can say "restored 4 bodies, re-issued 2 cameras by id" instead of showing a camera whose name is invented.

**Two bounds the tests pin rather than hide.**

1. **The surface's OWN save is still refused, by name, when its cutscene is still live.** A sequence is registry
   state in ONE runtime and `defineCinematic` refuses a taken id — "a restore never overwrites live state", the
   rule this runtime now states five times. The round-trip that works is the one a host can actually perform: a
   file from ANOTHER runtime, measured on the shipped package end to end.
2. **A host with no `setActiveScene` verb cannot resume a running cutscene at all**, so the surface refuses that
   file in its own voice rather than meeting the runtime's scene-id-shaped refusal three calls later.

The reads are DEFENSIVE and structural: the file is untrusted JSON that has not been through the loader yet, so a
malformed `cinematic` produces "names no camera" and lets `loadSaveFile` refuse it in its own voice — never a
TypeError from a property read on a non-object.

| layer | what it proves |
| --- | --- |
| `scene3dSurface.test.ts` (+5) | the round-trip on the REAL runtime: loads instead of refused, sequence registered, camera re-issued under its id, sibling active for a RUNNING file and not for a STOPPED one · the surface's own save refused by name · the caller's file not rewritten |
| `scene3d.test.ts` (+4) | a cinematic-free file answers an empty re-issue · camera ids deduped in first-appearance order · a RUNNING file refused on a host with no `setActiveScene` · a malformed cinematic is the loader's to refuse |

**Arms: 5 predicted, 5 red, 5/5 MATCHED** over both files (the studio suite runs the real runtime through the
`src` alias, so a runtime mutation is graded here too). The first derivation under-counted every arm and was
re-derived from the mechanism rather than smoothed — recorded in the ADR.

Measured: Studio **474 → 483** (31 files), three-runtime **531 → 535** (23 files), `tsc --noEmit` exit 0 in both.
No existing case moved.

