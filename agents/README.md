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
  dataflow). Proof: `agents/runtime/test` (vitest 26/26),
  `node docs/evidence/agents/agent-proof.mjs` (deterministic transcript + honest denial) and
  `node docs/evidence/agents/code-index-proof.mjs` (indexes the real repo from disk).

Still placeholder (§24/§26): the Agent Registry (multi-agent roster/handoff) and long-term memory.
Not yet implemented from §63: real fs/exec tools, process runner, browser automation, visual QA,
git commit — all gated on ADR 0013 approval machinery. The M1 Design "agent" remains the
deterministic composer inside `packages/ai-providers` (DEMO MODE), which emits the same structured
`OpBatch` contract a live-model agent will use.
