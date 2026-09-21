# agents/ — Agent Runtime & roles

- `runtime/` — **`@nexus/agent-runtime` (M2 v0, ADR 0016): implemented.** A hermetic agent loop:
  Task/Plan/Step/ToolCall contracts (§25), a permission-scoped Tool Registry with Human-Checkpoint
  gating (§27/§28, the executable subset of ADR 0013), an in-memory workspace exposing
  `fs.list/read/search/write/append` (repo understanding without a real fs), a deterministic
  DEMO-MODE planner (research → read → annotate → verify), and an orchestrator with `@ref`
  dataflow, host-injected `test.run` verification, bounded auto-fix rounds and a step budget.
  Proof: `agents/runtime/test` (vitest 18/18) and
  `node docs/evidence/agents/agent-proof.mjs` (deterministic transcript + honest denial).

Still placeholder (§24/§26): the Agent Registry (multi-agent roster/handoff) and long-term memory.
Not yet implemented from §63: real fs/exec tools, process runner, browser automation, visual QA,
git commit — all gated on ADR 0013 approval machinery. The M1 Design "agent" remains the
deterministic composer inside `packages/ai-providers` (DEMO MODE), which emits the same structured
`OpBatch` contract a live-model agent will use.
