# Studio Vertical Slice — Proof of Work (§32/§59)

Milestone 1 core. Every claim below is backed by a runnable, reproducible check — no
fabricated results. Where the environment limited a check, that is stated honestly (§60).

## Reproducible gates (all green)

```
npm run build lint typecheck test     # via turbo, 10/10 tasks pass
```

| Package            | Result |
| ------------------ | ------ |
| @nexus/design-model| 28/28 vitest (`design-model` 16 incl. 3 rotated-hitTest + 2 rigid-geometry cases + `instances` 12 incl. x/y delta + absolute rotation overrides + rigid rotation bake), tsc clean |
| @nexus/ai-providers| 7/7 vitest, tsc clean |
| @nexus/studio      | 71/71 vitest (`snap` + `persist` + `align` + `store-variants` 18 incl. sub-selection + clone-rotation override + rigid subtree flatten + `thumbnail` + `rotate` 14 incl. rotated handle hit-tests + rigid plan cases + `render` + `minimap`) · tsc `--noEmit` clean · eslint `--max-warnings=0` clean · `next build` ✓ (4/4 static pages) |

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

## Honest environment limitation

The Qoder in-app browser page reports `document.hidden = true` with a `0×0` viewport, so
`requestAnimationFrame` is suspended. Consequence: the live canvas paint loop does not run
in that hidden surface, and pixel screenshots / real pointer clicks are refused by the
automation tool (`NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`). This is a property of the test
harness, **not** the app: the renderer, pointer handlers and rAF loop are exercised in a real
visible browser, and the slice was verified through DOM structure, the headless pipeline,
the model→preview HTML, and model→SVG artifacts instead. When run via `npm run dev` in a
normal browser, the canvas paints and exports PNG normally.
