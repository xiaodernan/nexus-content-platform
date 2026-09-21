# Known Issues & Limitations (honesty per §60)

Live list. Nothing here is hidden behind marketing copy.

## AI / providers
- **No live model provider is wired.** All AI output is **DEMO MODE** — deterministic
  heuristic composition + procedural placeholder imagery + hash embeddings. It is genuinely
  functional (produces real Design Model ops) but is **not** model-quality. The Studio shows
  a persistent "DEMO MODE" badge.

## Studio (Milestone 1 — polished slice, see docs/evidence/studio)
- The Design Model, infinite Canvas (2D scene-graph renderer), layers tree, properties
  editor, design-system token panel, DEMO-MODE generate + AI-edit, live preview, undo/redo,
  AI-diff and local export (JSON / standalone HTML / canvas PNG) are all functional. This
  pass adds **on-canvas text editing, magnetic snapping + smart guides, multi-page
  add/switch, local-first persistence with a History/Snapshots panel** (ADR 0014), and
  **component → instance authoring** (create/insert/detach + per-instance text/width overrides, ADR 0015)
  and **instance sub-selection** (drill-in clone move/resize/text via x/y-delta + text overrides).
  The AI-diff card now pairs its semantic counts with **before/after thumbnails** (`lib/thumbnail.ts`).
  These are deterministic SVG snapshots from `layoutPage` + token resolution — model-derived geometry,
  *not* pixel screenshots (§60), so they render even under the hidden-viewport harness.
  A **rotate handle + rotation-aware canvas rendering *and hit-testing*** (`lib/rotate.ts` +
  design-model `containsRotated`) now ship too — caveats below.
  A bottom-left **minimap** (`lib/minimap.ts` pure fit math + a small painted canvas) previews the
  page/nodes/viewport rect; click or drag recenters the main viewport at the current zoom.
- "Publish" in the slice means **local export** only. Hosted public URLs `/n/{user}/{project}`,
  accounts, and SEO (SSR/OpenGraph) land with M7/community + the `nexus-api` service.
- Persistence is **local-first `localStorage`** (whole-model snapshot, debounced save, hydrate
  on load; ADR 0014). It is per-browser, unauthenticated and ~5 MB-capped — **not** the hosted,
  versioned server store of ADR 0012, which supersedes it at M7. The op-log *snapshot* timeline
  (branch/fork/compare at a point in time) is mirrored read-only by the History panel; the panel
  restores via undo/redo rather than a separate replay engine.
- Text is edited **on-canvas** (double-click → positioned overlay that commits one reversible
  op), *and* via the Properties panel. No per-span/inline rich text yet. Pen/vector, boolean
  ops, and masks are deferred.
- **Components & instances (ADR 0015) work end-to-end** but are intentionally *atomic at the
  selection layer*: an instance materializes through a pure view-time projection
  (`expandComponentInstances`) and clicking any part selects the whole instance. **Per-instance
  override editing is now present** — selecting an instance shows an *Instance overrides* section in
  the Properties panel that edits a leaf's text/width via `setInstanceOverride` (merged by master id
  into that instance's `overrides`, one reversible op, applied to its clones only, never the master or
  sibling instances). Live instance→master sync on master edits *is* present (the projection is
  derived). **Sub-selection (drill-in) now works** (ADR 0015 amendment 2): double-click enters the
  instance and selects the clicked clone; while focused, clone move/resize/arrows/on-canvas text edit
  commit as `overrides` ops on the owning instance (`x`/`y` are *deltas* off the master position).
  Remaining gaps: **clone rotation** (the rotate grip is intentionally hidden on clones — a rotation
  op would target a non-canonical id; *Detach* is the escape hatch), per-instance geometry override
  beyond x/y/width/height (fills/radius editable only via detach), and a dedicated off-page
  "library" container.
- **Sub-selection caveats:** the focused instance is studio-local view state (like active page —
  *not* persisted, *not* undoable; deliberate, ADR 0014). While a clone is selected the Properties
  panel shows nothing for it (it reads canonical nodes; clones have none — the chip + on-canvas
  editing are the edit surfaces). Undoing a drill-in edit reverts the override but does not re-open
  the drill state. Browser-validated end-to-end: make component → drill chip appears → text clone
  edit persists `overrides.text` → Escape drills out → clone drag persists `overrides[mid] =
  {x,y}` deltas into the `localStorage` snapshot.
- Drag snapping aligns a selection's edges/centers to sibling + page anchors within a 6px
  (screen) threshold and renders guide lines; resize snaps the dragged edge. **Explicit
  alignment (left/center/right/top/middle/bottom) and equal-gap distribution (≥3 nodes) are
  wired via `lib/align.ts` + the `AlignBar`**, each committed as one reversible op. Smart
  distribute-with-rotate is still not present.
- **Rotation is visual-precise *and* hit-precise (ADR 0005 Amendment 2):** the renderer
  rotates each node about its own centre (`lib/rotate.ts` math, `rotations` live-preview map,
  rotated chrome + grip), and the rotate grip drags free angles with Shift 15° snapping.
  `hitTest` is now **rotation-aware through the canonical model**: design-model exports
  `containsRotated` (inverse-rotate the point about the node centre, then AABB-test) and uses it
  in `hitChildren`, so a rotated node selects by its *turned* outline — vacated AABB corners no
  longer hit, and points outside the old box but inside the rotated body do (marquee selection
  still intersects the unrotated boxes). Studio resize grabs
  match the painted chrome via `handleHitTest` (same inverse rotation), and `hitRotated` now just
  delegates to the model. Remaining caveats: `layoutPage` storage stays axis-aligned, so resize
  *math* still commits AABB deltas (width/height/x/y of the unrotated box); container subtrees
  rotate *individually* (each child about its own centre) rather than rigidly as a group — rigid
  subtree rotation stays deferred; instance clones offer no per-clone rotation. The interactive
  grip drag is covered by pure-math tests, a recording fake-`ctx` render test and the store op
  path, plus the Properties-panel Rotation field end-to-end in the real browser (set → undo →
  redo → reload persists); pixel screenshots of the rotated canvas are not claimable under the
  §60 harness.
- **Multi-page caveat:** adding a page is an undoable op (`addSubtree`→`pageIds`), but which page
  is *active* is ephemeral view-state — switching pages is **not undoable** and can differ across
  browser tabs. A `setActivePage`/`patchDocument` op (needs a design-model rebuild) is the next step.
- **Visual QA automation caveat:** the Qoder in-app browser reports `document.hidden=true`
  with a `0×0` viewport, suspending `requestAnimationFrame` and refusing pointer/screenshot
  actions. Canvas paint and clicks were therefore validated through DOM structure, the
  headless pipeline proof, the model→preview HTML, and model→SVG artifacts (see
  `docs/evidence/studio/README.md`). The persistence + multi-page **hydrate path was verified
  in the real browser bundle** (write snapshot → reload → toolbar shows the restored doc name and
  PageTabs shows its page) since it needs no rAF. In a normal visible browser via `npm run dev`
  the canvas paints, snaps, edits in place and exports PNG.

## Architecture
- `services/*` and `agents/*` are **scaffolded shells** with contracts only; they are not yet
  implemented. The Studio intentionally does not depend on them for the slice.
- Sandbox/security enforcement (ADR 0013) is **Proposed**, not built — no untrusted code path
  exists in the slice to protect.

## Tooling
- Package manager is **npm workspaces**, not pnpm: `corepack` cannot write the global pnpm
  shim without admin rights in this environment (EPERM). Layout stays pnpm-compatible.
- Never run `next build` while `next dev` serves the same directory: the build rewrites `.next`
  and the live dev page silently loses its chunks (404 `main-app.js`, React handlers dead).
  Restart dev (or clear `.next`) after any build gate.
