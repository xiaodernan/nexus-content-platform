# NEXUS Studio

The creative workbench. Layout: a left **Layers** panel, a center **infinite canvas**
(ADR 0005), a right **Properties** + **Design System** panel, a top **prompt/AI bar**, and a
**Live Preview** mode.

## Canvas interactions (target set from §7)
zoom, pan, select, multi-select, drag, resize, rotate, snapping, guides, grouping, nesting,
layers, components, responsive layouts, annotations, comments, code layers, live previews.

**Implemented in the slice:** zoom (wheel/keys), pan (space-drag/middle-drag), click select,
marquee multi-select, drag-move, corner resize handles, snapping to siblings + guides,
grouping, layer reordering, add/duplicate/delete nodes, undo/redo, and prompt→generate.
**Deferred:** rotate handles, nested components authoring, on-canvas comments, code-layer
bidirectional sync (§9), live agent edits streaming.

## Live preview
Renders the same Design Model as clean, token-driven HTML/CSS (a projection), plus a PNG
screenshot export used as proof-of-work (§30/§32).

Status: running in-browser, no backend required. See KNOWN_ISSUES for the honest scope.
