# NEXUS Studio

The creative workbench. Layout: a left **Layers** + **Components** + **Design System** panel, a
center **infinite canvas** (ADR 0005) under a **PageTabs** strip and an **AlignBar**, a right
**Properties** + **History/Snapshots** panel, a top **prompt/AI bar**, and a **Live Preview** mode.

## Canvas interactions (target set from §7)
zoom, pan, select, multi-select, drag, resize, rotate, snapping, guides, grouping, nesting,
layers, components, responsive layouts, annotations, comments, code layers, live previews.

**Implemented in the slice:** zoom (wheel/keys), pan (space-drag/middle-drag), click select,
marquee multi-select, drag-move, grab-a-frame-moves-its-subtree, corner resize handles,
**magnetic snapping to sibling + page anchors with pink smart guides** (drag aligns
edges/centers, resize snaps the dragged edge), **alignment + distribution actions** (align
left/center/right/top/middle/bottom against the page or selection bounds, and distribute ≥3
with equal gaps via `AlignBar`), **on-canvas text editing** (double-click → a
positioned DOM overlay that commits one reversible op; the model stays canonical, §8), grouping,
layer reordering, add/duplicate/delete nodes, select-all (Cmd/Ctrl+A), **multi-page add/switch with
per-page layout isolation**, **local-first persistence** (whole-model snapshot → `localStorage`,
hydrate on load), a **History/Snapshots panel** (mirror log; each row's diff is the AI-diff, restore
drives undo/redo), undo/redo, and prompt→generate.
**Components & instances (ADR 0015):** the **Components** panel turns selected layers into a
component (master stored off-page, never painted on a page) and drops an instance; *Insert* adds more
instances that share the master; *Detach* converts an instance back into editable layers. Instances
are materialized by a pure **view-time projection** (`expandComponentInstances`) — the canonical
model stores only `componentId` + `overrides`, and clicking any part of an instance selects the whole
unit (clone hits collapse to the owner via `meta`).
**Deferred:** rotate handles, per-instance override editing from the Properties panel and
nested-instance sub-selection (detach is the current escape hatch), on-canvas comments, code-layer
bidirectional sync (§9), live agent edits streaming, undoable page switching (needs a `setActivePage`
op, ADR 0014).

## Live preview & persistence
Live Preview renders the same Design Model as clean, token-driven HTML/CSS (a projection), plus a
PNG screenshot export used as proof-of-work (§30/§32). The document auto-saves to `localStorage`
(debounced) and rehydrates on load — see ADR 0014 for why this is local-first for the slice and
how it later folds into the hosted store of ADR 0012.

Status: running in-browser, no backend required. See KNOWN_ISSUES for the honest scope.
