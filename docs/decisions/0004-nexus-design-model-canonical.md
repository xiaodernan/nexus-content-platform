# 0004 — Nexus Design Model is the single canonical representation

- **Status:** Accepted
- **Date:** 2026-09-22

## Context
Spec §8 is explicit: "Do NOT use raw DOM as the canonical representation." Every visual
modification must be a structured operation. AI agents (§11) must operate on the model, not
pixels. Design↔Code interop (§9), diffing (§36), snapshots (§35), and the project graph (§37)
all need one authoritative, serializable data structure.

## Decision
Define a **first-class Nexus Design Model** in `packages/design-model`: a normalized,
immutable graph of typed nodes — `Document → Page → Frame/Node`, plus `Component`,
`Instance`, `Variant`, `Token`, `Asset`, `Interaction`, `Animation`, and responsive rules.
The DOM, the canvas pixels, and generated code are all *projections* of this model, never
the source of truth.

## Options
- **Normalized node map (id → node) with ordered child ids** (this choice) — cheap to patch,
  diff, and look up by id; natural fit for the project graph and RAG embeddings.
- Deeply nested tree (like the DOM) — intuitive but expensive to address/patch by path.
- Reuse a library's model (Fabric/Konva scene objects) — rejected: would make the library
  canonical and fight §8.
- Epsilon / Penpot's model — great references, but we need our own types to include
  code-layers, worlds, and agent provenance.

## Reason
A normalized `Map<id, Node>` with parent/child id arrays gives O(1) node access, makes
structural sharing for undo trivial (copy only touched nodes), serializes cleanly to JSON
for snapshots, and maps 1:1 onto graph edges for the Project Graph.

## Tradeoffs
- (−) Losing nested ergonomics; must reconstruct tree from the map for rendering.
  Mitigated: memoized tree selector in the package.
- (−) A bespoke model means we own migrations across versions. Mitigated with an explicit
  `schemaVersion` field and forward-migration functions from the first commit.
