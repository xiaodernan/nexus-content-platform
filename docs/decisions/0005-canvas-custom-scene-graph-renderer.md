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
