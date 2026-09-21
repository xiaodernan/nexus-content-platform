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
  **component → instance authoring** (create/insert/detach, ADR 0015).
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
  (`expandComponentInstances`), clicking any part selects the whole instance, and there is **no
  per-instance override editing in the Properties panel yet** (edit the master, or *Detach* the
  instance to get concrete layers). Live instance→master sync on master edits *is* present (the
  projection is derived); nested-instance sub-selection and a dedicated off-page "library"
  container are the next steps.
- Drag snapping aligns a selection's edges/centers to sibling + page anchors within a 6px
  (screen) threshold and renders guide lines; resize snaps the dragged edge. **Explicit
  alignment (left/center/right/top/middle/bottom) and equal-gap distribution (≥3 nodes) are
  wired via `lib/align.ts` + the `AlignBar`**, each committed as one reversible op. Rotate-angle
  snapping and smart distribute-with-rotate are still not present.
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
