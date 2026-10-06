# NEXUS — Long-Term Development Plan

> Working continuation plan for NEXUS. It is derived from `docs/PRODUCT.md`, the milestone table in
> `docs/ROADMAP.md` and the honest limits in `docs/KNOWN_ISSUES.md`. Status is kept truthful per §60 —
> nothing here is "done" just because it is listed; each row names the verifiable evidence that closes it.

## Purpose

NEXUS turns ideas into executable digital worlds. The plan is organized around the product pipeline
(`RESEARCH → PLAN → DESIGN → GENERATE → CODE → BUILD → TEST → SIMULATE → DEPLOY → OBSERVE → IMPROVE →
PUBLISH → REMIX`) and the spec's milestones. The working method is the repo's own **ADR 0016 cadence**:
one deep, *verified*, increment at a time — pure model layer → agent door (when a lane needs one) →
headless proof → product surface → real-browser verification → record the amendment in the ledger.

## Current honest status (2026-10-06)

- **M0 — Foundation:** done (git, monorepo, docs, CI, ADRs 0001–0017).
- **M1 — Studio Vertical Slice:** core + many polish passes done (canvas, layers, properties, design
  system, DEMO generate/edit, undo/redo, AI diff, live preview, local export, rotate, components &
  instances + per-instance overrides + nested sub-selection, rigid-subtree rotation, minimap, local-first
  persistence + History/Snapshots). Hosted publish deferred to M7.
- **M2 — Agentic Coding:** model/registry/workspace/planner/orchestrator, hybrid code index + memory,
  change-sets/ledger, roles + rubric, §25 pipeline, Studio dock + §28 checkpoint, visual QA + repair loop,
  browser-durable memory, role-chain editor, vector recall, near-miss QA lints + align-nudge proposals,
  UI-capable task running. Exec sandbox (§63) still gated on ADR 0013.
- **M3 — Multimodal Assets:** `@nexus/ai-providers` multimodal slice (asset library, demo image/video
  generators, character consistency, storyboard manager) + agent doors (`assetTools.ts`). **Product face
  now built (v153) and INTERACTIVE (v159):** Studio gains the `Assets` surface (asset/storyboard report,
  §60 byte-zero honesty) with a prompt form that generates into the real library and a per-row Remove.
  Still open: video generation, character consistency, asset update, and storyboard editing.
- **M4 — World Engine:** `@nexus/world-engine` (world/lore/character/location/faction + RAG + character
  agent) + agent doors + product surface (`World` panel, v148). Still open: real model behind the persona,
  relationship simulation, factions/tick/`executeAction`, save/load.
- **M5 — Three.js Runtime:** `@nexus/three-runtime` scene graph/entities/cameras/lighting/animations +
  save/quest/combat/NPC type surface + document/op-log integration (v141+). Product surface (`3D`, v142).
  Still open: full camera control, add/remove body from UI, lighting control, save/load door, 3D→document
  composition.
- **M6–M10:** planned, not started (autonomous build, community, creator economy, ops, external agents).

## Execution order (next increments)

The cadence is deliberately small and verifiable. The current priority queue, in order:

| # | Milestone | Increment | Why now |
|---|-----------|-----------|---------|
| ~~1~~ | M3 | ~~Asset surface `generate`/`delete` interaction~~ | **DONE — v159** (ADR 0016 amendment 159): `generateAsset`/`removeAsset` in the shipped module, a prompt form + per-row Remove in the panel, §5 of the headless proof growing and shrinking the REAL library, and the browser probe at **24/24** (it types, generates, removes, and checks the storyboard is unmoved and every byte count still reads 0) |
| 2 | M3 | `asset.video.generate`, `asset.character.*` and `asset.delete`/`asset.update` doors in `assetTools.ts` + proof | Deepens the lane that just got its product face. NOTE: `asset.delete` now has a product-side counterpart in `removeAsset`, so the agent door and the panel should agree on what removal means |
| 3 | M5 | Camera orbit/zoom + add/remove-body on the `3D` surface | The biggest visible UX gap on the runtime surface |
| 4 | M4 | Relationship simulation + `executeAction`/tick + save/load in the world engine | Moves the world lane from "compose & read" toward "simulate" |
| 5 | M5 | 3D save/load door + 3D→document composition | Unblocks authored content entering the Design Document |
| 6 | M2 | Exec sandbox (ADR 0013): container isolation + out-of-jail disk/git/exec tools | The §63 door that unlocks the real coding-agent duties |
| 7 | M6 | Autonomous build: end-to-end plan→deploy with checkpoints | First milestone that uses everything built so far |
| 8 | M7–M10 | Hosted publish + community; then creator economy, ops, external agents | Product-goal milestones; require `nexus-api` + real persistence |

## Guardrails (what "done" means here)

- Every feature lands with a runnable check: unit tests, a headless proof against the SHIPPED module,
  and (for product surfaces) a real-browser harness (ADR 0017).
- No fake implementations (§60): DEMO MODE is labeled, provenance is carried, and a surface never
  shows a size or an `<img>` that implies a model that is not attached.
- Regression is kept targeted: run the affected package/lane, not the whole monorepo, unless a change
  genuinely crosses boundaries.
- The ADR 0016 ledger is updated when a lane closes a bound; a bound is marked closed only after its
  proof is green.