# 0016 — Agent runtime v0: hermetic in-memory loop with a deterministic demo planner

- **Status:** Accepted
- **Date:** 2026-09-22

## Context
M2 (§63) demands repo understanding, code index, planning, file modification, testing, browser
automation, visual QA, auto-fix and git commit. The environment stays self-contained: no provider
keys, no Docker, no network (§60 honesty, ADR 0010 demo determinism). `agents/` held only a
README; ADR 0013 (sandbox, *Proposed*) specifies ephemeral containers + a permission-scoped Tool
Registry + Human Checkpoints — the container part is unbuildable here.

## Decision
Ship `@nexus/agent-runtime` (workspace `agents/runtime`) as the M2 v0 core:

1. **Contracts** (`types.ts`): Task → Plan → Step → ToolCall/ToolResult → AgentEvent, every
   `RunOutcome` stamped `provenance {mode:'demo'}` — the §25 handoff artifacts as data.
2. **Permission-scoped Tool Registry** (`registry.ts`): tools declare `read|write|exec|network`;
   any non-read invocation requires a host-supplied **checkpoint callback**; denial is a normal
   `ok:false` result, never a throw. This implements the *executable subset* of ADR 0013 without
   containers: the runtime can only touch what the host hands it.
3. **Hermetic in-memory workspace** (`workspace.ts`): `fs.list/read/search/write/append` over a
   `Map` — repo-understanding tools with zero real-fs/network surface.
4. **Deterministic demo planner** (`planner.ts`): a fixed seed-stamped *research → read →
   annotate → verify* template (keyword extracted from the goal; seed via the ai-providers
   `hashString`). Honest template planning, not model reasoning (§60).
5. **Orchestrator loop** (`orchestrator.ts`): plan → act (registry-gated) → observe (`@ref`
   dataflow resolves later args from earlier outputs) → verify via a **host-injected `test.run`
   tool** → bounded auto-fix rounds → step budget. Full event log + final status
   (`completed|failed_verification|denied|budget_exhausted`).

## Options
- Real-fs + child_process tools now — rejected: un-sandboxable here, violates ADR 0013's spirit.
- LLM-in-the-loop planning — rejected: no keys; would be pretending (§60).
- Just an event-bus skeleton — rejected: violates the "one deep, *verified* increment" cadence.

## Reason
Every M2 duty that can be done honestly offline lands as tested, reusable machinery: the registry
+ checkpoint + workspace are exactly what the real (fs/exec) tools will later plug into, and the
orchestrator's verify/fix/budget shape is the loop the M2 browser/QA steps will extend.

## Tradeoffs
- (−) v0 plans with templates, not language models; the planner seam is one interface away from a
  ModelRouter-backed implementation (same provenance discipline).
- (−) `test.run` is host-injected, so "testing" means *whatever the host's predicate checks* —
  no process runner yet. Stated plainly rather than faked.
- (−) No git-commit/browser tools this increment (§63 partial). Deferred beyond v1, still gated
  on ADR 0013's approval machinery.

## Verification
`agents/runtime` vitest (registry, workspace, planner+orchestrator, code index) + headless
`docs/evidence/agents/agent-proof.mjs` (golden fix-loop path, transcript-level determinism across
two fresh runs, checkpoint denial leaving the workspace byte-identical).

## Amendment — v1: hybrid code index (`codeIndex.ts` + `fs.index`), 2026-09
- **What landed:** a pure in-memory index over `path → content` snapshots — extension-based
  `fileKind`, light regex symbol/heading extraction, markdown chunked by heading sections and
  code by 40-line windows (trailing-newline line trimmed), and `queryIndex` scoring
  `0.6 × cosine + 0.4 × query-token coverage` over deterministic bag-of-tokens hash embeddings
  (per-token `hashEmbed` averaged + L2-normalised, ADR 0010). Ties break by path then line.
- **Why token bags:** whole-string hash embeddings make *every* pair of distinct texts pure
  noise, so the 0.6 cosine weight drowned lexical signal in tests; averaging per-token
  embeddings gives shared tokens a genuine, still-deterministic pull — honest plumbing
  without pretending a neural model (§60).
- **Coverage over Jaccard:** query-token coverage (|q∩d|/|q|) does not punish long chunks the
  way intersection-over-union does.
- **Wiring:** `fs.index` registers as a *read*-permission tool over the in-memory workspace
  (rebuilt per call — no persisted index yet); the planner swaps only step 0's tool when
  `fs.index` is available, keeping `stepId: 'search'` and the `{hits:[{path}]}` shape so all
  existing `@search.hits.0.path` dataflow is unchanged.
- **Proof:** `docs/evidence/agents/code-index-proof.mjs` indexes the real repository from disk
  (121 files / 523 chunks) and asserts definition files appear in the top 5 for three
  identifier-precise queries plus run-to-run determinism. Test count rises to 26/26.
