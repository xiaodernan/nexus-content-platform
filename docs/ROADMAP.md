# NEXUS Roadmap

Faithful to spec milestones. Status is honest; do not infer a capability is done because it
appears here.

| Milestone | Scope | Status |
|-----------|-------|--------|
| **M0 — Foundation** | repo, git, monorepo, docs, CI, ADRs | ✅ done this pass |
| **M1 — Studio Vertical Slice (core)** | Project→Prompt→AI Design→Canvas→Layers→Properties→Design System→AI Edit→Code→Live Preview→Screenshot→Publish | ✅ core done — model/canvas/layers/properties/tokens/AI-generate+edit/undo/preview/export all working & gated (evidence in `docs/evidence/studio`). ✅ polish pass "editor durability + direct manipulation" done — on-canvas text editing, magnetic snapping + smart guides, alignment/distribution actions, multi-page add/switch, local-first persistence + History/Snapshots panel (ADR 0014). ✅ polish pass "component → instance variants" done — create/insert/detach via a pure view-time projection, masters stored off-page, instances selectable as atomic units (ADR 0015). ⬜ still open for full M1 polish: rotate handles, per-instance override editing / nested-instance sub-selection, hosted publish (until M7). |
| **M2 — Agentic Coding** | repo understanding, code index, plan, edit, test, browser automation, visual QA, auto-fix, git commit | ⬜ planned |
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
