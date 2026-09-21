# NEXUS Roadmap

Faithful to spec milestones. Status is honest; do not infer a capability is done because it
appears here.

| Milestone | Scope | Status |
|-----------|-------|--------|
| **M0 — Foundation** | repo, git, monorepo, docs, CI, ADRs | ✅ done this pass |
| **M1 — Studio Vertical Slice** | Project→Prompt→AI Design→Canvas→Layers→Properties→Design System→AI Edit→Code→Live Preview→Screenshot→Publish | 🚧 building now (canvas/model/preview/prompt; Publish deferred to a local "export" until M7) |
| **M2 — Agentic Coding** | repo understanding, code index, plan, edit, test, browser automation, visual QA, auto-fix, git commit | ⬜ planned |
| **M3 — Multimodal Assets** | image/video engines, asset library, reference, character consistency, storyboard | ⬜ planned |
| **M4 — World Engine** | world/lore/character/relationship + RAG + World/Character agents | ⬜ planned |
| **M5 — Three.js Runtime** | 3D scene/camera/lighting/materials/character/interaction/combat/NPC/save; cinematic slice | ⬜ planned |
| **M6 — Autonomous Build** | end-to-end plan→deploy with human checkpoints | ⬜ planned |
| **M7 — Community** | profiles/explore/likes/comments/follow/publish/remix | ⬜ planned |
| **M8 — Creator Economy** | marketplace, templates, credits, subscriptions | ⬜ planned |
| **M9 — NEXUS Ops** | observability, incident→patch→PR→approve→deploy | ⬜ planned |
| **M10 — External Agent Ecosystem** | API, MCP, tool registry, webhooks | ⬜ planned |

M1 completion gate: the Studio slice runs in-browser, produces a real Design Model from a
prompt in DEMO MODE, edits it via structured ops with undo, renders live preview from tokens,
and is validated with screenshots + tests (ADR 0005/0006/0010, §59/§32).
