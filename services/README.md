# services/ — Backend runtimes (Scaffolded)

Two independently-deployable services per ADR 0011. Frontend-first means these are contract
shells until the milestones that need them.

- `nexus-api/` — **Java 25 + Spring Boot**. System of record: auth, projects, artifacts,
  snapshots, versions, remix graph, community, billing. Owns PostgreSQL.
  Build with Maven (`pom.xml`) when implemented.
- `ai-svc/` — **Python 3.11 + FastAPI**. Model-router server half: provider adapters holding
  keys/quotas, RAG index/retrieve, sandbox job dispatch, cost accounting. Owns Redis + pgvector.

The Studio (`apps/studio`) runs with **no** backend for the vertical slice. Shared API
contracts live in `packages/contracts`. Local infra: see root `docker-compose.yml`.
