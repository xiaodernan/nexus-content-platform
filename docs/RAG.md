# RAG & Context Engine

Universal retrieval (§21) over project files, docs, code, design, world lore, characters,
conversations and user-approved external sources. Target architecture: PostgreSQL + **pgvector**,
**hybrid search** (lexical `tsvector` + semantic vector, fused) then **reranking**. The Context
Engine (§22) assembles minimal relevant context per task; agents never re-send whole repos.

In DEMO MODE the `EmbeddingProvider` returns stable **hash-based** vectors so the retrieval
pipeline (chunk → embed → index → search → rank) is genuinely wired and testable end-to-end
without a live model. Real embedding/rerank models swap in behind ADR 0009 interfaces.

Status: retrieval *plumbing* is exercised by unit tests in `packages/ai-providers`; persistent
indexing lands with `services/ai-svc` + pgvector (ADR 0012).
