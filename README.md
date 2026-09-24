# NEXUS

> **Turn ideas into executable digital worlds.**

NEXUS is an **AI-native creative operating system**: humans provide intent, agents provide
execution, and the boundary between *idea → design → code → world → software → game → media*
gradually dissolves. Everything NEXUS makes is an editable, runnable, versionable, forkable,
remixable **Artifact**, and everything a project contains is structured **Context** that
agents can retrieve precisely.

The full product directive lives in [`docs/PRODUCT.md`](docs/PRODUCT.md). The authoritative
capability pipeline is:

```
RESEARCH → PLAN → DESIGN → GENERATE → CODE → BUILD → TEST
        → SIMULATE → DEPLOY → OBSERVE → IMPROVE → PUBLISH → REMIX
```

## Repository layout

```
apps/        user-facing products (studio — the creative workbench)
packages/    shared, framework-agnostic libraries (design-model, ai-providers, contracts)
services/    backend runtimes (nexus-api: Spring Boot, ai-svc: FastAPI) — scaffolded
agents/      agent runtime + definitions (orchestrator, roles) — scaffolded
docs/        living documentation (see below)
architecture/ diagrams and system overview
```

## Where the project is right now

We follow the spec's milestones and its development philosophy (§59): **never a giant fake
demo** — OBSERVE → PLAN → IMPLEMENT → RUN → TEST → SCREENSHOT → INSPECT → FIX → RETEST →
COMMIT. See [`docs/ROADMAP.md`](docs/ROADMAP.md) and the honest status in
[`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md).

- **Milestone 0 — Foundation:** this repo (git, monorepo, docs, CI, ADRs). ✅
- **Milestone 1 — Studio Vertical Slice:** the Nexus Design Model + infinite Canvas +
  layers/properties + live preview, running in the browser. 🚧 in progress.

## AI provider status (no fake implementations — §60)

There are **no live provider keys** in this build. AI surfaces run against a **deterministic
DEMO MODE** that is clearly badged in the UI and labeled in every result's `provenance`.
Real providers plug in behind the same interfaces via the Model Router. See
[ADR 0009](docs/decisions/0009-provider-abstraction-model-router.md) and
[ADR 0010](docs/decisions/0010-demo-mode-determinism.md).

## Getting started

```bash
npm install          # installs all workspaces
npm run dev          # turbo: starts the Studio (apps/studio)
npm test             # package + app unit tests
npm run typecheck    # strict TS across the repo
npm run build        # production build
```

Reproducible browser verification (ADR 0017) — drives a real Chrome, no extra dependencies.
Start the Studio first (`NODE_OPTIONS= ../../node_modules/.bin/next dev -p 3210` from
`apps/studio`), then:

```bash
npm run verify:harness   # proves the harness: visible viewport, rAF, canvas pixels, screenshot
npm run verify:studio    # 19/19 golden-path assertions on the unmodified Studio bundle
```

The Studio runs fully client-side + DEMO MODE — no backend or Docker required for the slice.
To bring up the later-stage infrastructure: `docker compose up -d` (Postgres+pgvector, Redis,
MinIO).

## Documentation index

| Doc | Purpose |
|-----|---------|
| [PRODUCT.md](docs/PRODUCT.md) | The full product directive & principles |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture and boundaries |
| [decisions/](docs/decisions/) | Architecture Decision Records (ADR 0001–0017) |
| [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Design model + tokens |
| [STUDIO.md](docs/STUDIO.md) | The Studio product |
| [AGENTS.md](docs/AGENTS.md) | Agent runtime, roles, handoff |
| [RAG.md](docs/RAG.md) | Retrieval & context engine |
| [RUNTIME.md](docs/RUNTIME.md) | Execution/preview runtime |
| [SECURITY.md](docs/SECURITY.md) | Safety, sandbox, RBAC |
| [TESTING.md](docs/TESTING.md) | Quality gates, proof-of-work |
| [ROADMAP.md](docs/ROADMAP.md) | Milestones |
| [KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) | Honest current limitations |

## License / content policy
General-purpose platform. No copyrighted commercial assets/characters/branding are copied;
no sexual/exploitative content is designed for. Reporting & moderation are handled in the
Community milestone (§55).
