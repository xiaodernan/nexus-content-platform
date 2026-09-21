# 0011 — Backend service boundaries

- **Status:** Accepted
- **Date:** 2026-09-22

## Context
Spec §50 wants a Java/Spring Boot + PostgreSQL + Redis backend with a separate
Python/FastAPI AI-services layer. The chosen build scope is **frontend-first**: get the
Studio slice real, scaffold backend services as contract-bearing shells now, implement them
as milestones require.

## Decision
Three runtime boundaries, each independently deployable:
1. **`apps/studio`** (Next.js) — the workbench + server-rendered public artifact pages. Talks
   to the API gateway over typed HTTP/WS contracts only; holds no privileged data access.
2. **`services/nexus-api`** (Spring Boot) — system of record: auth, projects, artifacts,
   snapshots, versions, remix graph, community, billing. Owns PostgreSQL.
3. **`services/ai-svc`** (FastAPI) — the model router's *server* half: provider adapters that
   must stay off-browser (keys, quotas), RAG indexing/embedding/retreival, sandbox job
   dispatch, cost accounting. Owns Redis (queues/cache) and pgvector access.

Contracts live in `packages/contracts` (shared types + OpenAPI/AsyncAPI) generated so
TypeScript and Java/Python stay in sync. Cross-service calls use documented HTTP/queues,
never shared DB access.

## Options
- **Three services + shared contracts, frontend-first** (this choice).
- Spring monolith doing AI too — couples GPU/model iteration to JVM release cadence.
- Node-only backend — fastest for us, but §50 explicitly prefers Spring/Java for the core
  and Python for AI; honoring that reduces future rewrite.
- Build all backends now — rejected: delays the Studio, and Milestone 1 needs little backend
  (the slice runs client-side + DEMO MODE).

## Reason
Clear ownership (system-of-record vs AI-vs-browser-isolation) matches the spec's stack and
the security rule that provider keys never reach the client (§54). Contract-first lets the
Studio integrate against real endpoints the moment services light up.

## Tradeoffs
- (−) Local dev spans three runtimes. Mitigated by ADR 0012's docker-compose and by the
  Studio running fully against DEMO MODE with no backend during the slice.
