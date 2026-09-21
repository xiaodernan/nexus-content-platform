# 0009 — Provider abstraction & model router

- **Status:** Accepted
- **Date:** 2026-09-22

## Context
Spec §18, §51, §52 forbid hard-coding the product to a single AI provider and require
task-specific routing across LLM / vision / embedding / reranker / image / video / audio /
speech models. §53 wants per-call cost/latency tracking. This environment currently has **no
provider keys**, so the abstraction must be real but runnable without one (see ADR 0010).

## Decision
Define narrow TypeScript interfaces in `packages/ai-providers` —
`LlmProvider`, `VisionProvider`, `EmbeddingProvider`, `RerankerProvider`, `ImageProvider`,
`VideoProvider` — each returning normalized result types plus a `usage` record (tokens,
latency, model id, estimated cost). A **ModelRouter** maps a *task descriptor*
(e.g. `design.generate`, `image.text-to-image`, `code.edit`) to a provider+model based on
config, capability, cost ceiling and availability, and emits every call through a
`CallRecorder` for the Cost Engine (§53) and Observability (§56).

## Options
- **Own thin interfaces + router, adapters per provider** (this choice).
- Adopt Vercel AI SDK / LiteLLM as the abstraction directly — excellent, but they don't
  cover image/video/3D routing or our structured Design-Op outputs; we'd fight their types.
- Call providers ad-hoc at each feature site — rejected; §51 disallows the coupling.

## Reason
Adapters isolate provider churn; the router is the single place cost/latency/fallback live.
Keeping our interfaces *thin and provider-shaped-to-our-domain* (they return Design Ops,
not free text) means features don't parse prose into structure.

## Tradeoffs
- (−) We maintain adapters rather than inheriting a marketplace. Accepted for control over
  structured outputs; we may wrap an SDK *inside* an adapter later.
