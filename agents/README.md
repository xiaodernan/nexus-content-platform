# agents/ — Agent Runtime & roles

- `runtime/` — **`@nexus/agent-runtime` (M2 v0+v1, ADR 0016): implemented.** A hermetic agent loop:
  Task/Plan/Step/ToolCall contracts (§25), a permission-scoped Tool Registry with Human-Checkpoint
  gating (§27/§28, the executable subset of ADR 0013), an in-memory workspace exposing
  `fs.list/read/search/index/write/append` (repo understanding without a real fs), a deterministic
  DEMO-MODE planner (research → read → annotate → verify), and an orchestrator with `@ref`
  dataflow, host-injected `test.run` verification, bounded auto-fix rounds and a step budget.
  v1 adds `src/codeIndex.ts`: a pure hybrid index (markdown-heading/line-window chunking, symbol
  extraction, token-bag hash embeddings + query-token coverage) surfaced as the `fs.index` tool —
  when it is registered the planner routes its research step through it (same `hits.0.path`
  dataflow). v2 adds `src/realfs.ts` (read-only real-directory ingestion through an injected fs
  adapter) and `src/memory.ts` (§26 first slice: scoped, inspectable, deletable `MemoryStore`
  with checkpoint-gated `memory.save`/`memory.forget` and lexical `memory.recall`; planner
  research priority memory → index → line search).
  Proof: `agents/runtime/test` (vitest 37/37), `node docs/evidence/agents/agent-proof.mjs`
  (deterministic transcript + honest denial), `node docs/evidence/agents/code-index-proof.mjs`
  and `node docs/evidence/agents/memory-proof.mjs` (two-run discovery→recall over the real repo).

Still placeholder (§24): the multi-agent Registry (roster/handoff). Long-term memory (§26) has
its first scoped slice in v2 (in-process store; persistence across processes pending).
Not yet implemented from §63: real fs/exec write tools (v2 ingestion is read-only injection),
process runner, browser automation, visual QA,
git commit — all gated on ADR 0013 approval machinery. The M1 Design "agent" remains the
deterministic composer inside `packages/ai-providers` (DEMO MODE), which emits the same structured
`OpBatch` contract a live-model agent will use.
