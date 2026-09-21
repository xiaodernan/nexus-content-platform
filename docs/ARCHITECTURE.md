# NEXUS Architecture

Status: **Milestone 0/1.** This document describes the target architecture and marks what is
*built* vs *scaffolded* so nothing is misrepresented (§60).

## 1. Core abstractions

- **Artifact** — the unit of creation (§1). Every artifact is addressable by id, carries
  `schemaVersion`, and supports Create/Edit/Run/Version/Fork/Remix/Publish/Share. The
  **Design Model** (ADR 0004) is the canonical structure for visual artifacts.
- **Op / OpBatch** — the only way to change a model (ADR 0006). Reversible, diffable,
  transactional. Powers undo/redo, snapshots, AI-diff, and version lineage.
- **Context** — structured, retrievable project knowledge (§2, §22). The Context Engine
  assembles minimal relevant context per task; agents never re-send whole repos.
- **Agent** — a role (Design/Coding/Research/World/…) driven by the Orchestrator (§23),
  exchanging structured artifacts on handoff (§25), not just prose.
- **Tool** — a permission-gated capability in the Tool Registry (§27).

## 2. System boundaries

```
        ┌──────────────────────── apps/studio (Next.js) ───────────────────────┐
        │  Workbench (client island)            Server-rendered public pages    │
        │  ┌───────────────┐  ┌──────────────┐  (/n/{user}/{project}, SSR/SEO)  │
        │  │ Canvas (custom │  │ Panels:      │                                  │
        │  │ scene-graph    │  │ layers/props/│                                  │
        │  │ renderer)      │  │ DS/prompt    │                                  │
        │  └──────┬─────────┘  └──────┬───────┘                                  │
        │         │  Design Model + Ops (in-browser, ADR 0004/0006)              │
        └─────────┼─────────────────────────────────────────────────────────────┘
                  │ typed contracts (packages/contracts)
      ┌───────────┴───────────────┐                 ┌─────────────────────────┐
      │ services/nexus-api        │  queues/cache   │ services/ai-svc (FastAPI)│
      │ (Spring Boot) system of   │◀──── Redis ─────▶│ model router server half, │
      │ record: auth, projects,   │                  │ provider adapters (keys), │
      │ artifacts, snapshots,     │   PostgreSQL     │ RAG index/retrieve,       │
      │ remix graph, community     │◀── + pgvector ──▶│ sandbox job dispatch,     │
      └───────────────────────────┘                  │ cost accounting           │
                                                     └─────────────────────────┘
```

**Built now:** `apps/studio` canvas + panels + in-browser Design Model/Ops;
`packages/design-model`; `packages/ai-providers` (DemoProvider).
**Scaffolded now, implemented in later milestones:** `services/*`, `agents/*`,
Postgres/Redis/MinIO (`docker-compose.yml`), sandbox, community, RAG persistence. The Studio
runs end-to-end with **no** backend for the slice.

## 3. Data flow: idea → running preview (the slice)

1. User types a prompt in the Studio.
2. The AI client calls the **ModelRouter** with task `design.generate`.
3. Router selects `DemoProvider` (no keys) → deterministic **heuristic composer** emits an
   `OpBatch` of Design Model nodes (labeled `provenance.mode = 'demo'`).
4. The batch is validated and applied by the pure reducer → new immutable model.
5. The **scene-graph renderer** re-projects the model to the canvas; **live preview**
   renders the same model as clean HTML/CSS from design tokens (ADR 0008).
6. Screenshot/export captures the projection. Undo restores prior batches (ADR 0006).

## 4. Rendering strategy (ADR 0005)

Custom renderer draws the canonical model to Canvas 2D with a view matrix (pan/zoom) and our
own spatial hit-testing + transform handles. Renderer sits behind a `CanvasRenderer`
interface so a WebGL/WebGPU backend (Three.js/R3F, §45/§50) can replace it for 3D/games
without touching the model or ops.

## 5. AI integration (ADR 0009/0010)

Narrow provider interfaces (`LlmProvider`, `ImageProvider`, `EmbeddingProvider`, …) return
domain-shaped results (Design Ops, embeddings, assets) plus `usage` for the Cost Engine
(§53). The ModelRouter maps tasks→providers by capability/cost/availability. With no keys,
everything resolves to the deterministic, clearly-labeled DemoProvider.

## 6. Persistence (ADR 0012) & security (ADR 0013)

PostgreSQL(+pgvector) is the system of record; snapshots store model JSON + append-only op
batches; Redis runs queues/cache; S3/MinIO holds assets. Untrusted generated code runs only
in ephemeral sandboxes (not built yet — nothing untrusted executes in the slice).
