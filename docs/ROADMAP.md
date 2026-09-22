# NEXUS Roadmap

Faithful to spec milestones. Status is honest; do not infer a capability is done because it
appears here.

| Milestone | Scope | Status |
|-----------|-------|--------|
| **M0 — Foundation** | repo, git, monorepo, docs, CI, ADRs | ✅ done this pass |
| **M1 — Studio Vertical Slice (core)** | Project→Prompt→AI Design→Canvas→Layers→Properties→Design System→AI Edit→Code→Live Preview→Screenshot→Publish | ✅ core done — model/canvas/layers/properties/tokens/AI-generate+edit/undo/preview/export all working & gated (evidence in `docs/evidence/studio`). ✅ polish pass "editor durability + direct manipulation" done — on-canvas text editing, magnetic snapping + smart guides, alignment/distribution actions, multi-page add/switch, local-first persistence + History/Snapshots panel (ADR 0014). ✅ polish pass "component → instance variants" done — create/insert/detach via a pure view-time projection, masters stored off-page, instances selectable as atomic units (ADR 0015). ✅ polish pass "per-instance overrides" done — the Properties panel edits an instance leaf's text/width through the same projection path (ADR 0015 amendment). ✅ polish pass "visual AI-diff" done — the diff card renders before/after model→SVG thumbnails. ✅ polish pass "rotation" done — rotate grip with Shift 15° snap, rotation-aware renderer + chrome, committed via the reversible op path (ADR 0005 amendment). ✅ polish pass "nested-instance sub-selection" done — progressive double-click drill-in, clone move/resize/text edit commit as x/y-delta + text overrides on the owning instance, Escape/chip drill-out (ADR 0015 amendment 2). ✅ polish pass "rotated hit bounds" done — `hitTest` is rotation-aware in the canonical model (`containsRotated`, ADR 0005 amendment 2), so click-select and resize grabs follow the turned outline; layout storage + resize math stay AABB. ✅ polish pass "per-clone rotation" done — an absolute `rotation` override on the owning instance, editable via the rotate grip on a focused clone and a per-row Rotation input (ADR 0015 amendment 3); rotated clones hit-test through the same `containsRotated` path. ✅ polish pass "rigid subtree rotation" done — turning a container now turns its absolutely positioned subtree as a unit: authored nodes commit-flatten through one reversible batch, instances bake clone positions in the projection (flow containers keep slot placement, ADR 0005 amendment 3). ⬜ still open for full M1 polish: hosted publish (until M7). |
| **M2 — Agentic Coding** | repo understanding, code index, plan, edit, test, browser automation, visual QA, auto-fix, git commit | 🟡 v13 done — `@nexus/agent-runtime` v0–v9 (ADR 0016 am. 1–9), Studio dock + §28 checkpoint (am. 10), visual QA (am. 11), QA→repair loop (am. 12), **browser-durable memory: localStorage `FsWriteLike` + Memory (§26) panel with per-record forget, proven live across a refresh path** (am. 13) — 101/101 runtime + 81/81 studio vitest, twelve proofs + in-browser loops. ⬜ remaining: vector-store recall, browser automation *by* the agent, aesthetic QA, live-model planning |
| **M3 — Multimodal Assets** | image/video engines, asset library, reference, character consistency, storyboard | ⬜ planned |
| **M4 — World Engine** | world/lore/character/relationship + RAG + World/Character agents | ⬜ planned |
| **M5 — Three.js Runtime** | 3D scene/camera/lighting/materials/character/interaction/combat/NPC/save; cinematic slice | ⬜ planned |
| **M6 — Autonomous Build** | end-to-end plan→deploy with human checkpoints | ⬜ planned |
| **M7 — Community** | profiles/explore/likes/comments/follow/publish/remix | ⬜ planned |
| **M8 — Creator Economy** | marketplace, templates, credits, subscriptions | ⬜ planned |
| **M9 — NEXUS Ops** | observability, incident→patch→PR→approve→deploy | ⬜ planned |
| **M10 — External Agent Ecosystem** | API, MCP, tool registry, webhooks | ⬜ planned |

M1 completion gate (met): the Studio slice runs in-browser, produces a real Design Model from
a prompt in DEMO MODE, edits it via structured ops with undo/redo + AI diff, renders live
preview from tokens, and is validated by tests + a headless pipeline proof + model-derived
SVG artifacts (ADR 0005/0006/0010, §59/§32). See `docs/evidence/studio/README.md` for the
honest note on why pixel screenshots were substituted in this environment.
