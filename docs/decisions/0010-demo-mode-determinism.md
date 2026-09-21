# 0010 — Deterministic DEMO MODE (never fake a capability)

- **Status:** Accepted
- **Date:** 2026-09-22

## Context
§60 is absolute: never *pretend* AI generation, RAG, deployment etc. work when they don't.
If a provider is unavailable, the system must clearly mark itself unavailable **or** run in
an explicit DEMO MODE. This build has no provider keys, so every AI surface would otherwise
be a lie.

## Decision
Provide a built-in **`DemoProvider`** implementing the same interfaces as ADR 0009. It is
**deterministic** (seeded from the request, so identical prompts yield identical output —
reproducible for tests/screenshots/eval) and clearly **labeled**: every demo result carries
`provenance: { mode: 'demo', provider: 'nexus-demo' }`, the Studio shows a persistent
"DEMO MODE" badge, and the badge disappears only when a live provider is configured.

- `design.generate` → a heuristic layout composer that emits real Design Model Ops
  (grids, cards, hero sections) from the prompt keywords — genuinely usable output, not
  a screenshot of a mockup.
- `image.*` → procedural placeholder art (deterministic gradients/shapes on canvas) tagged
  as demo.
- `embedding.*` → a stable hash-based embedding so RAG plumbing (retrieval, ranking) is real
  and testable end-to-end without a vector model.

## Options
- **Deterministic, labeled DemoProvider** (this choice).
- Return hard-coded JSON "canned responses" — rejected: brittle, not reproducible, hides
  that it isn't real.
- Disable AI features entirely — honest but leaves the Studio un-runnable for its core loop.
- Ship with fake "AI works!" copy — forbidden by §60.

## Reason
DEMO MODE keeps the vertical slice runnable and *verifiable* (same input → same output →
golden tests + stable screenshots) while being transparently not-live. When keys are added,
the router prefers live providers and nothing else changes.

## Tradeoffs
- (−) Demo output quality ≠ real model quality; must never be presented as the product's
  ceiling. Mitigated by the always-on badge and `provenance` metadata surfaced in the UI.
