# 0005 — Custom scene-graph canvas renderer (Canvas 2D now, GPU later)

- **Status:** Accepted
- **Date:** 2026-09-22

## Context
The canvas (§7) is the primary interface between Human / AI / Design / Code / Runtime. It
must support zoom/pan/selection/multi-select/drag/resize/rotate/snapping/guides/grouping/
layers/components/responsive-layout/annotations/comments/code-layers/live-previews.

Research (Figma blog; library comparisons) shows pro tools render a custom scene graph on
GPU (Figma: WebGL→WebGPU via WASM). JS libraries (Konva, Fabric, Pixi) each own their
*own* scene objects — using them would make the library model canonical, violating ADR 0004.

## Decision
Build a **custom renderer that draws the Nexus Design Model** onto an HTML5 **Canvas 2D**
surface, with our own view transform (pan/zoom matrix), our own spatial hit-testing, and our
own selection/transform overlay. The renderer is a *pure projection* of the model; all
editing goes through operations (ADR 0006). Rendering is decoupled behind a `CanvasRenderer`
interface so the backend can be swapped.

## Options
- **Canvas 2D + custom scene graph + our hit-testing** (this choice for the vertical slice).
- WebGL/PixiJS now — best raw perf but premature for a slice with < ~2k nodes; higher cost.
- Konva/Fabric/react-konva — fast to select/drag, but library-owned model conflicts with
  canonical Design Model and structured-op editing.
- SVG/DOM — easy hit-testing/text, but poor for infinite pan/zoom perf at scale.

## Reason
For the Milestone 1 slice, Canvas 2D with our own transform + hit-test is entirely
sufficient, gives maximum control, keeps the Design Model authoritative, and is trivially
testable (headless `node-canvas`/jsdom). Because rendering sits behind an interface, we can
move to WebGL/WebGPU (spec §45, §50) for 3D/games without touching the model or ops.

## Tradeoffs
- (−) We implement selection/hit-testing/transform handles ourselves. Accepted — this is
  the differentiating control surface of a pro Studio and can't be delegated to a library.
- (−) Rich text editing on Canvas 2D is limited. Mitigated: text nodes render measured
  glyphs on-canvas; *editing* text uses an in-place DOM overlay input that writes back a
  text-update op — canvas stays canonical, editing stays ergonomic.

## Amendment — 2026-09-22 (rotation, no decision change)
When the rotate handle landed, geometry (`layoutPage`/`hitTest`) was deliberately kept
**axis-aligned**: rotation is a *render-time* transform per node (about its own AABB centre,
`lib/rotate.ts` + a transient `rotations` preview map in the studio store), committed through the
existing reversible `updateNode(id,{rotation})` op. Selection chrome, corner handles and the grip
rotate with the node; click/marquee hit-testing still use the unrotated box, and children of a
rotated container rotate individually rather than rigidly. Making hit bounds rotated and subtree
rotation rigid would need a design-model geometry change (new package tests + rebuild) — that is
the *next* step if it ever earns its cost; nothing in this ADR changes.

## Amendment 2 — 2026-09-22 (rotation-aware hit bounds in the model)
The deferred geometry change has now landed. `hitTest` in the design model resolves each candidate
through an exported **`containsRotated(rect, rotation, point)`** predicate (inverse-rotate the
point about the rect centre, then AABB-test; identity fast path at 0°). Hit bounds therefore match
what is painted — the previously "vacated" corners of a rotated node's AABB no longer select it,
and points outside the old AABB but inside the rotated body do. `layoutPage` remains axis-aligned
storage (positions/sizes are still unrotated boxes); only the *hit predicate* is rotation-aware.
Consequences kept as-is: resize math still commits AABB deltas (`width/height/x/y` of the
unrotated box), subtrees still rotate per-node rather than rigidly, and instances offer no
per-clone rotation. The studio's `lib/rotate.ts` `hitRotated` now delegates to the model, and
`handleHitTest` inverse-rotates the pointer before the corner test so resize grabs match the
rotated chrome exactly. No op-log or type changes; a design-model rebuild was required (23/23
package tests green, incl. three new rotated-hit cases).

## Amendment 3 — 2026-09-22 (rigid subtree rotation: flatten + bake)
The second deferred consequence — "subtrees rotate per-node rather than rigidly" — has now landed.
Turning a container turns its whole subtree as a unit, with **no change to the renderer, hit-test
or `layoutPage`** (which stays axis-aligned storage; ADR 0005's core decision is untouched). The
rigidity lives in *where the numbers get written*:

- **Authored subtrees — commit-flatten.** `lib/rotate.ts` exports a pure `subtreeRotatePlan(view,
  layout, rootId, Δ)` that maps every visible, unlocked descendant to its rigidly-turned AABB
  (`rigidRotateRect` about the root's centre in `@nexus/design-model/geometry`). The store action
  `rotateSubtree(id, deg)` then rewrites each authored descendant's *parent-relative* x/y (plan
  absolute rect minus the turned parent's rect) plus `rotation + Δ` in **one reversible op batch**.
  After the commit the per-node self-rotation renderer reproduces the preview exactly.
- **Instances — projection bake.** Rotating an instance stays a single `updateNode(id,{rotation})`
  op; `expandComponentInstances` post-processes each instance's projected clones
  (`bakeInstanceRotation`), rotating their positions about the instance centre and adding the
  instance angle to each clone — so clones, hit-testing and export rigidify for free, and the
  master is never touched. The two compose: baking a freshly-rotated instance equals applying the
  same rigid transform to an already-baked subtree (proved by the composition test).
- **Caveats (accepted).** Auto-layout (flow) containers place children by cursor, ignoring x/y, so
  the plan *stops descending* at nodes with a `layout` — a flow container's children keep their
  slot placement (their own `rotation` still gains Δ). Per-clone `rotation` overrides stay *local*
  (the bake composes the instance angle on top), so the overrides panel and clone-grip commit
  subtract the instance rotation. Locked/hidden nodes are skipped by both mechanisms.

Design-model rebuild with 5 new tests (28/28 green); studio gains `subtreeRotatePlan` +
`rotateSubtree` + grip-drag live preview through the same plan (71/71 green).

