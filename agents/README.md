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
  with checkpoint-gated `memory.save`/`memory.forget` and lexical `memory.recall; planner
  research priority memory → index → line search). v3 adds `src/durability.ts`: schema-versioned
  memory serialization, `saveMemory`/`loadMemoryStore` through an injected writable fs, and the
  first jailed real-disk tools `disk.read/write/list` — every path confined to one host-chosen
  root by `guardedJoin`, writes checkpoint-gated. v4 adds `src/indexStore.ts`: schema-versioned
  index snapshots (`saveIndex/loadIndex`) + fingerprint incremental `rescanIndex` whose output
  deep-equals a cold rebuild (unchanged repo: 0 files re-chunked in ~3 ms). v5 wires those
  snapshots into `fs.index` via `createIndexProvider` + `registerWorkspaceTools(..., {
  indexProvider })` — second-task research re-chunks 0 files, provider/default hits are
  provably identical, corrupt snapshots fall back honestly (default rebuild-per-call stays
  the out-of-the-box behavior).
  Proof: `agents/runtime/test` (vitest 56/56) plus five headless proofs in
  `docs/evidence/agents/` (agent, code-index, memory, durability, index-store, provider).

Still placeholder (§24): the multi-agent Registry (roster/handoff). Long-term memory (§26) is
now durable across processes (v3: schema-versioned JSON via the injected fs + jail-rooted
`disk.write`); vector-backed recall still pending.
Not yet implemented from §63: general real-fs write tools (writes are jailed to one root,
text-only, checkpoint-gated; v5 persists index snapshots but executes nothing),
process runner, browser automation, visual QA,
git commit — all gated on ADR 0013 approval machinery. The M1 Design "agent" remains the
deterministic composer inside `packages/ai-providers` (DEMO MODE), which emits the same structured
`OpBatch` contract a live-model agent will use.
