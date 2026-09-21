# 0012 — Persistence: PostgreSQL + pgvector + Redis

- **Status:** Accepted
- **Date:** 2026-09-22

## Context
§21/§50 call for PostgreSQL + pgvector with hybrid search + reranking, and Redis for
queues/cache. Snapshots (§35), the project graph (§37), RAG (§21) and memory (§26) all need
durable storage. `psql` is not installed locally, but Docker is.

## Decision
- **Primary store:** PostgreSQL 16, one schema per bounded context (projects, artifacts,
  snapshots, community). Artifacts store their Design Model as `jsonb` with a GIN index;
  operation batches (ADR 0006) stored append-only for version lineage/remix (§42).
- **Vectors:** `pgvector` extension in the same Postgres for embeddings; hybrid search =
  `tsvector` (lexical) + pgvector (semantic) fused, then reranked by the RerankerProvider
  (ADR 0009). Chosen over a dedicated vector DB to keep one transactional store for the
  vertical slice; a dedicated engine can be introduced if recall/latency demand it.
- **Redis:** job queues (agent/async tasks), hot cache, and rate-limit counters.
- **Local/dev:** `docker-compose.yml` provisions Postgres(pgvector) + Redis + MinIO
  (S3-compatible object storage for assets, §50). Not required for the Studio slice, which
  runs client-side + DEMO MODE.

## Options
- Postgres + pgvector (this choice) vs separate vector DB (Qdrant/Weaviate/pg) — latter adds
  operational surface without near-term payoff for a slice.
- SQLite for local dev — simplest, but diverges from prod and lacks pgvector. Rejected for
  fidelity; Docker gives real Postgres.

## Tradeoffs
- (−) Dev needs Docker running. Mitigated: Studio path is Docker-free; compose is only for
  the later service milestones.
