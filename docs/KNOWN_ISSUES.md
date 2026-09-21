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
  A **rotate handle + rotation-aware canvas rendering *and hit-testing* + rigid subtree rotation**
  (`lib/rotate.ts` + design-model `containsRotated`/`rotateSubtree`) now ship too — caveats below.
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
  **Clone rotation now works too** (ADR 0015 amendment 3): a `rotation` override (degrees, local to
  the instance's own angle — the projection bake composes them)
  plus the rotate grip on a focused clone, and a Rotation input per row of the *Instance overrides*
  panel. Remaining gaps: per-instance geometry override
  beyond x/y/width/height/rotation (fills/radius editable only via detach), and a dedicated off-page
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
- **Rotation is visual-precise *and* hit-precise (ADR 0005 Amendments 2–3):** the renderer
  rotates each node about its own centre (`lib/rotate.ts` math, `rotations` live-preview map,
  rotated chrome + grip), and the rotate grip drags free angles with Shift 15° snapping.
  `hitTest` is now **rotation-aware through the canonical model**: design-model exports
  `containsRotated` (inverse-rotate the point about the node centre, then AABB-test) and uses it
  in `hitChildren`, so a rotated node selects by its *turned* outline — vacated AABB corners no
  longer hit, and points outside the old box but inside the rotated body do (marquee selection
  still intersects the unrotated boxes). Studio resize grabs
  match the painted chrome via `handleHitTest` (same inverse rotation), and `hitRotated` now just
  delegates to the model. **Subtrees now turn rigidly** (ADR 0005 amendment 3): rotating a
  container/shape rewrites its descendants' positions as one reversible step (`rotateSubtree`
  commit-flattens authored nodes; the instance projection bakes clone positions about the
  instance centre). Remaining caveats: `layoutPage` storage stays axis-aligned, so resize
  *math* still commits AABB deltas (width/height/x/y of the unrotated box); **flow (auto-layout)
  containers** keep their children's slot placement when rotated — rigidity applies to absolutely
  positioned subtrees only; a per-clone `rotation` override stays *local* (it composes on top of
  the instance's own angle). Instance clones rotate too via that override
  (ADR 0015 amendment 3), but note `hitChildren` descends only while an ancestor's *own* rect
  contains the point: a rotated clone that sticks out past its (unrotated) container's box stays
  unreachable outside that box — same pre-existing container-overflow rule as moved/resized clones.
  The interactive
  grip drag is covered by pure-math tests, a recording fake-`ctx` render test and the store op
  path, plus the Properties-panel Rotation field and a real-browser rigid grip-drag on an
  absolutely positioned frame (90° → children flatten to the predicted rel x/y + rotation,
  single history row, Ctrl+Z restores exactly); pixel screenshots of the rotated canvas are not
  claimable under the §60 harness.
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
- `agents/runtime` (`@nexus/agent-runtime`) is now **implemented** through M2 v0–v2 (ADR 0016):
  the loop, permission-gated registry, hermetic workspace tools, hybrid code index (`fs.index`),
  read-only real-directory ingestion (injected fs adapter) and a first §26 memory slice
  (scoped/inspectable/deletable, checkpoint-gated writes). It is still *not* a coding agent that
  writes the real fs, runs processes, browses, or commits — those §63 duties stay unimplemented
  until ADR 0013's exec sandbox exists. Known limits, stated not hidden (§60): memory and index
  are in-process only (no cross-run persistence), recall is lexical, and the template planner
  fails honestly (`failed_verification`) when both memory and the index are absent.
- `services/*` are still **README-only shells** (a real `packages/contracts` does not exist yet);
  the Studio intentionally does not depend on them for the slice.
- Sandbox/security enforcement (ADR 0013) is **partially realized**: the permission-scoped Tool
  Registry + Human-Checkpoint gate are executable and tested; container isolation is not built —
  the runtime's only host surface is a read-only, injected fs used by `collectTextFiles`.

## Tooling
- Package manager is **npm workspaces**, not pnpm: `corepack` cannot write the global pnpm
  shim without admin rights in this environment (EPERM). Layout stays pnpm-compatible.
- Never run `next build` while `next dev` serves the same directory: the build rewrites `.next`
  and the live dev page silently loses its chunks (404 `main-app.js`, React handlers dead).
  Restart dev (or clear `.next`) after any build gate.
