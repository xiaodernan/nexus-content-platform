# NEXUS Studio

The creative workbench. Layout: a left **Layers** + **Components** + **Design System** panel, a
center **infinite canvas** (ADR 0005) under a **PageTabs** strip and an **AlignBar**, a right
**Properties** + **History/Snapshots** panel, a top **prompt/AI bar**, and a **Live Preview** mode.

## Canvas interactions (target set from §7)
zoom, pan, select, multi-select, drag, resize, rotate, snapping, guides, grouping, nesting,
layers, components, responsive layouts, annotations, comments, code layers, live previews.

**Implemented in the slice:** zoom (wheel/keys), pan (space-drag/middle-drag), click select,
marquee multi-select, drag-move, grab-a-frame-moves-its-subtree, corner resize handles,
**rotate via the grip above the single selection** (free-angle drag, Shift snaps to 15°; the angle
commits to the model's `rotation` through one reversible op and the renderer turns the node about
its own centre — selection chrome, corner handles and the grip all rotate with it; hit-testing is
rotation-aware in the canonical model (`containsRotated`), so click-select and resize grabs follow
the turned outline; **rotating a node turns its subtree rigidly** (ADR 0005 amendment 3):
`rotateSubtree` rewrites each absolutely positioned descendant's rel x/y + rotation as one
reversible batch (grip drag and the panel Rotation field both route through it, with a live
`subtreeRotatePlan` preview), and the instance projection bakes clone positions about the
instance centre so instances rotate rigidly for free — flow/auto-layout containers keep their
children's slot placement by design),
**magnetic snapping to sibling + page anchors with pink smart guides** (drag aligns
edges/centers, resize snaps the dragged edge), **alignment + distribution actions** (align
left/center/right/top/middle/bottom against the page or selection bounds, and distribute ≥3
with equal gaps via `AlignBar`), **on-canvas text editing** (double-click → a
positioned DOM overlay that commits one reversible op; the model stays canonical, §8), grouping,
layer reordering, add/duplicate/delete nodes, select-all (Cmd/Ctrl+A), **multi-page add/switch with
per-page layout isolation**, **local-first persistence** (whole-model snapshot → `localStorage`,
hydrate on load), a **History/Snapshots panel** (mirror log; each row's diff is the AI-diff, restore
drives undo/redo), undo/redo, and prompt→generate. A bottom-left **minimap** projects the page, its
visible nodes (frames as outlines, leaves as tiles) and the current viewport rect (`lib/minimap.ts`
pure fit/invert math); clicking or dragging it recenters the viewport through the existing
`setViewport` state at the unchanged zoom.
**Components & instances (ADR 0015):** the **Components** panel turns selected layers into a
component (master stored off-page, never painted on a page) and drops an instance; *Insert* adds more
instances that share the master; *Detach* converts an instance back into editable layers. Instances
are materialized by a pure **view-time projection** (`expandComponentInstances`) — the canonical
model stores only `componentId` + `overrides`, and clicking any part of an instance selects the whole
unit (clone hits collapse to the owner via `meta`). Selecting an instance surfaces an **Instance
overrides** section in the Properties panel (`InstanceOverrides.tsx`): editing a leaf's text or width
there calls `setInstanceOverride`, which merges keyed by the *master* child id into that instance's
`overrides` (geometry and text kept in separate maps) and commits one reversible op — the change
re-projects onto that instance's clones only, never the master or sibling instances.
**Sub-selection (drill-in):** double-clicking a part of an instance *enters* it — the clicked clone
becomes the selection (a breadcrumb chip names the focused instance). While inside, hit-testing keeps
clone ids, so drag-move (with snapping), corner resize, arrow keys and on-canvas text editing all
work on clones; each commit lands as one `overrides` op on the owning instance — `x`/`y` as **deltas**
off the master position (so masters keep authoring freedom), `width`/`height` absolute, `characters`
into `overrides.text`. Escape, the chip's *Exit* button, double-clicking the instance body, or
clicking empty canvas drills back out and selects the whole unit. The focus state is studio-local
view state (ADR 0014): not persisted, not undoable. **Clone rotation:** the *Instance overrides*
panel has a per-row Rotation input and the rotate grip works on a focused clone — it commits a
**local** `rotation` override (degrees relative to the instance's own angle, since the projection
bake composes the two, ADR 0015 amendment 3 + ADR 0005 amendment 3) on the owning instance, so the
master and sibling instances stay untouched and hit-testing follows the turned clone. Note a
rotated clone that overhangs its (unrotated) container box is unreachable outside that box —
the same pre-existing container-overflow rule as moved/resized clones.
**Deferred:** per-instance geometry overrides beyond x/y/width/height/rotation (fills, radius —
detach is the escape hatch), on-canvas comments, code-layer
bidirectional sync (§9), live agent edits streaming, undoable page switching (needs a `setActivePage`
op, ADR 0014).

## Live preview & persistence
Live Preview renders the same Design Model as clean, token-driven HTML/CSS (a projection), plus a
PNG screenshot export used as proof-of-work (§30/§32). The **AI/Edit diff card** now shows **before/
after thumbnails** alongside its semantic counts (§36): both are self-contained SVG snapshots produced
by `lib/thumbnail.ts` (`docToSvg`) from `layoutPage` + token resolution — the same geometry the canvas
paints, not pixel captures — so a generate/edit previews its visual result even in DEMO MODE. The
document auto-saves to `localStorage` (debounced) and rehydrates on load — see ADR 0014 for why this is local-first for the slice and
how it later folds into the hosted store of ADR 0012.

Status: running in-browser, no backend required. See KNOWN_ISSUES for the honest scope.

## Agent dock (§23/§25/§28, ADR 0016 amendment 10)
The right rail hosts `AgentPanel`: type a goal, press **Plan**, and the real
`@nexus/agent-runtime` pipeline (`runRolePipeline`: researcher session → structured
`HandoffRecord` → memory-first editor run, scored by the deterministic rubric) runs
in-browser over a *corpus view* of the current page (one pseudo-file per layer —
`lib/agentDock.ts`). The panel then shows exactly what the pipeline found
(target layer, research path, pipeline status, score, op count) and waits on **you**:
**Approve** dispatches the proposal as one reversible `OpBatch` through the normal op path
(history, AI-diff, undo all behave as for any edit); **Deny** changes nothing. Every
decision appends a line to the `nexus.agentLedger.v1` localStorage audit log that survives
reload. Since v11 the dock also runs **structural visual QA** after approval
(`runVisualQa` over `layoutPage` rects — zero-size/off-page/overlap/overflow), showing a
verdict chip plus flag chips and journaling `qa: ok|flagged` in the ledger. Since v12, a
flagged verdict offers **Propose repairs**: `proposeRepairs` (pure rect math in the
runtime) previews deterministic moves — nudge overlaps below with a 16px gutter, clamp
off-page nodes inside, grow zero-size layers — and Approve dispatches them as one
reversible `updateNode` batch, journaling `repairs:N`. When no move can fix a flag (e.g. a
section taller than the page), the loop stops honestly and the residual flags stay visible.
This is
geometry, not taste: contrast/aesthetic judgment remains explicitly out of scope (§60).
Since v13 the dock's findings are **browser-durable**: `lib/webfs.ts` implements the
runtime's `FsWriteLike` seam over `localStorage`, so the same `saveMemory/loadMemoryStore`
JSON proven in Node reloads on every Plan, and a Memory (§26) panel lists stored
findings with per-record **forget**.
Everything is DEMO MODE-labeled: the agent proposes, the model stays canonical
(§8), and no document mutation happens without the human checkpoint (§28).
