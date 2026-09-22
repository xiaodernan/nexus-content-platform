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
  the out-of-the-box behavior). v6 extracts the shared `embedding.ts` seam (`hybridScore`:
  token-bag cosine + coverage, zero-overlap ⇒ 0) used by BOTH index queries and memory
  recall, and adds `MemoryStore.compact()` (listed, idempotent, ≥50% ref-overlap merges).
  v7 adds `changes.ts` (pure line-LCS patches, refusing `applyPatch`, exact inverses,
  git-style `formatUnifiedDiff`), an orchestrator `snapshot` hook that records observed
  `RunOutcome.changeSet`s, and `ledger.ts` (append-only JSONL audit trail) — agent output now
  ships as reviewable patch files written to the jail, the honest stand-in for a git tool.
  v8 opens §24: `roles.ts` (role = data: allowed-tool globs → `registry.scope` projections,
  capability-by-absence) with three demo roles, and `evaluate.ts` (`scoreRun`: five
  weighted deterministic rubric marks over RunOutcome data + JSONL persistence).
  v9 adds `pipeline.ts` — §25 as durable data: a researcher session produces a structured
  HandoffRecord the host persists into scoped memory (optionally to JSON), and an editor
  run completes memory-first, even in a separate process (`pipeline-proof.mjs`). v10 lands
  that pipeline **inside the Studio**: `apps/studio/src/lib/agentDock.ts` + `AgentPanel`
  run the same `runRolePipeline` over a per-layer corpus view, and proposals only reach the
  Design Model when the user clicks Approve — §28 as product UI, decisions journaled to a
  localStorage ledger (ADR 0016 amendment 10). v11 adds `visualQa.ts` — structural rect
  checks (zero-size/off-page/overlap/overflow) that the dock runs on the applied document,
  rendering verdict chips and journaling the QA verdict (amendment 11). v12 closes the
  loop: `repair.ts` turns QA flags into deterministic, deduped repair moves (bounded
  passes, honest `remaining`), previewed and dispatched through the dock's §28 gate.
  v13 brings v3 durability into the browser: `apps/studio/src/lib/webfs.ts` implements the
  same `FsWriteLike` over localStorage, so agent memory persists across page refreshes and
  the dock's Memory (§26) panel can list and forget records (amendment 13). v14 adds
  `runRoleChain` (researcher → designer → qa → editor, typed stage handoffs, denial names
  its stage) + a computed WCAG-contrast QA rule (`contrastRatio`; arithmetic, no opinions).
  Proof: `agents/runtime/test` (vitest 108/108) plus the thirteen headless proofs in
  `docs/evidence/agents/` (agent, code-index, memory, durability, index-store, provider,
  recall, changes, roles, pipeline, qa, repair, rolechain).

Still placeholder (§24): the multi-agent Registry (roster/handoff). Long-term memory (§26) is
now durable across processes (v3: schema-versioned JSON via the injected fs + jail-rooted
`disk.write`); vector-backed recall still pending.
Not yet implemented from §63: general real-fs write tools (writes are jailed to one root,
text-only, checkpoint-gated; v5 persists index snapshots but executes nothing),
process runner, browser automation, visual QA,
git commit — all gated on ADR 0013 approval machinery. The M1 Design "agent" remains the
deterministic composer inside `packages/ai-providers` (DEMO MODE), which emits the same structured
`OpBatch` contract a live-model agent will use.
