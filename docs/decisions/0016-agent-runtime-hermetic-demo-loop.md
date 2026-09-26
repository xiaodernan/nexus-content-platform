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
  (125 files / 540 chunks as of the v2 commit) and asserts definition files appear in the top 5
  for three identifier-precise queries plus run-to-run determinism. Test count rises to 26/26.

## Amendment 2 — v2: real-repo ingestion + scoped memory (`realfs.ts`, `memory.ts`), 2026-09
- **`collectTextFiles(root, fsLike, opts)`** walks a real directory through an **injected**
  minimal fs adapter (node:fs satisfies it), so the package keeps zero fs imports: pure,
  hermetically testable against a fake fs, host side-effects confined to the caller. Filters:
  skip-dir set, extension regex, per-file byte cap, total file cap; sorted slash-relative keys.
  Ingestion is strictly **read-only** — annotations land in the in-memory workspace copy, never
  on disk (§9).
- **Memory (§26 first slice):** `MemoryStore` records `{id, scope, runId, query, summary, refs}`
  saved/cloned so callers cannot mutate stored state; `recall(query, {scope, k})` scores
  records with `lexicalScore` over their query+summary (deterministic, ties by id then path);
  `forget`/`clear` make memory deletable, `list` inspectable — all three §26 properties.
- **Governance:** memory access goes through registry tools — `memory.save`/`memory.forget` are
  **write**-permission (checkpoint-gated), `memory.recall`/`memory.list` read. The *host* decides
  what persists; nothing ghost-writes.
- **Planner priority:** research step = `memory.recall` when registered, else `fs.index`, else
  `fs.search` — all keep `stepId: 'search'` and the `{hits:[{path,…}]}` shape, so `@ref`
  dataflow is untouched. Known template limit (honest, §60): with cold memory **and** no index
  the research step returns no hits and the run fails (`failed_verification`) rather than
  fabricating — a fallback-research step is a later increment.
- **Proof:** `docs/evidence/agents/memory-proof.mjs` — run A discovers
  `agents/runtime/src/codeIndex.ts:121` in the real repo and the host persists it via gated
  `memory.save`; run B, with no index registered, completes from `memory.recall`; transcripts
  deterministic; after `clear(scope)` the task fails honestly. Tests 37/37.
- **Tradeoffs:** memory is in-process and lexical-only — a stand-in for the persisted
  vector hybrid retrieval of ADR 0012, chosen because it is real, testable machinery today
  without a database.

## Amendment 3 — v3: durability + the first jailed real-disk write (`durability.ts`), 2026-09
- **Memory persistence:** `serializeMemory/deserializeMemory` (pure, `schemaVersion` +
  per-record structural validation, reasons not exceptions) and `saveMemory/loadMemoryStore`
  over an extended injected `FsWriteLike` (adds `mkdirSync`/`writeFileSync`; node:fs satisfies
  it directly, the package still imports no node:fs). `MemoryStore.restore()` re-imports
  records verbatim and bumps the id high-water mark.
- **`disk.read`/`disk.write`/`disk.list`:** the runtime's first real-I/O tools, jailed to one
  explicit root by `guardedJoin` (no absolute paths, no drive letters, any `..` rejected —
  even mid-path). `disk.write` carries the **write** permission class, so nothing lands on
  disk without the checkpoint gate; denials and escapes return `ok:false`.
- **Why this is still honest (§60/ADR 0013):** the "sandbox" is a path jail plus a human
  gate, not container isolation — acceptable because the only writable surface is a root the
  *host* chose, and the demo planner never emits disk ops unless a host registers them.
- **Proof:** `docs/evidence/agents/durability-proof.mjs` — a finding persists through
  `memory.save` → `disk.write` into `%TEMP%/nexus-durability-proof`, and a **separate node
  child process** reloads and recalls it; escape write provably never creates a file;
  corrupt JSON fails honestly. Tests 45/45 (8 new durability cases).
- **Tradeoffs:** the code index remains per-call in-memory (persisting a serializable index is
  the obvious v4 candidate); recall stays lexical; writes are text-only and single-root.

## Amendment 4 — v4: persisted index snapshots + incremental rescan (`indexStore.ts`), 2026-09
- **What landed:** `serializeIndex/deserializeIndex` (schemaVersion + structural validation of
  file entries and chunks — reasons, never throws) and `saveIndex/loadIndex` over the same
  injected `FsWriteLike`; `fingerprintFiles` (per-file `hashString` over path+content) enables
  `rescanIndex(previous, previousFp, files)`: unchanged files reuse their stored entry+chunks,
  changed/new files re-chunk, removals drop out, and the result **deep-equals a cold
  `buildIndex`** so snapshot use can never silently change query ranking. `rechunked` is
  returned, not hidden — the host can see exactly what the incremental path did (§60).
- **Measured (this repo, 129 files):** unchanged rescan ~3 ms re-chunking 0 files; one-file
  edit re-chunks exactly 1 and lands in ~4 ms vs full cold rebuild of 129.
- **Deliberate limit:** `fs.index` still rebuilds per call; snapshots are a host-side layer
  (proof persists through `saveIndex` directly). Provider-injection into the tool loop is the
  first v5 candidate, stated in the evidence README rather than half-wired now.
- **Proof:** `docs/evidence/agents/index-store-proof.mjs` + 6 unit tests → 51/51.

## Amendment 5 — v5: snapshot-backed `IndexProvider` wired into `fs.index`, 2026-09
- **What landed:** `createIndexProvider({ files, snapshotFile?, fsLike? })` in `indexStore.ts`
  — first refresh prefers the persisted snapshot (verified against current fingerprints),
  later refreshes are incremental fingerprint rescans, and every refresh persists.
  `registerWorkspaceTools(registry, ws, { indexProvider })` routes `fs.index` through the
  provider; omitting it keeps the v1 rebuild-per-call behavior unchanged (default untouched →
  all prior tests/proofs stay green verbatim). Orchestrator/planner never touched: same tool,
  same `{hits:[{path}]}` contract.
- **Observability (§60):** `lastRechunked()` reports exactly what each refresh did;
  provider-vs-default `fs.index` results are asserted deep-equal, so the seam cannot
  silently alter retrieval. A corrupt snapshot falls back to a cold build and repairs the
  file rather than half-loading.
- **Contract with the host:** the provider serves only the host-supplied file set; keeping it
  in sync with the registered workspace is the host's job, stated in the tool docs.
- **Proof:** `docs/evidence/agents/provider-proof.mjs` — task 1 cold (129 chunked) persists
  the snapshot; task 2 same-session 0 re-chunked with identical hits; a fresh provider
  (new-process stand-in) restores with 0 re-chunked; corruption controls. Tests 56/56.

## Amendment 6 — v6: shared hybrid-embedding seam + memory consolidation, 2026-09
- **`src/embedding.ts`:** `tokenize`/`embedTokens`/`hybridScore` extracted from the v1 index
  into the single seam both retrieval surfaces use — `queryIndex` behavior is unchanged by
  construction (56/56 suite green across the refactor without touching index tests), and
  `memory.recall` upgrades from pure Jaccard to the same `0.6 × cosine + 0.4 × coverage`.
- **Zero-overlap ⇒ exactly 0:** cosine noise alone can never rank a candidate in (index or
  memory) — retrieval honesty (§60) enforced at the scorer, not per-caller.
- **`MemoryStore.compact()`:** greedily merges same-scope records whose ref-path Jaccard ≥
  0.5; survivor keeps the oldest id, summaries concatenate, refs union deterministically;
  every merge is *returned and listed* (§26 inspectability), and it is idempotent.
- **Proof:** `docs/evidence/agents/recall-proof.mjs` — paraphrased probe over seeded
  real-repo findings: deterministic hybrid top, printed lexical-baseline comparison,
  duplicate research consolidated (5→4) with the probe answer surviving. Tests 62/62
  (+6: 4 embedding-seam, 2 consolidation).

## Amendment 7 — v7: change-sets, reviewable patches, run ledger (`changes.ts`, `ledger.ts`), 2026-09
- **`changes.ts`:** pure line-LCS `computeFilePatch` (budget-capped → whole-file replace on
  huge inputs), `applyPatch` that *refuses* mismatched replays instead of corrupting,
  `inversePatch`, `createChangeSet(before, after)` over snapshots, and `formatUnifiedDiff`
  (git-style headers + hunk ranges + context). Round-trip identity: forward then inverse
  reproduces both endpoints exactly.
- **Orchestrator seam:** `RunOptions.snapshot?: () => Record<string,string>` — when the host
  supplies it, `RunOutcome.changeSet` carries the *observed* file effects of the run
  (nothing claimed that didn't happen; absent ⇒ zero behavior change, §60).
- **`ledger.ts`:** append-only JSONL of full `RunOutcome`s through the injected fs —
  order-preserving audit trail; junk lines are counted, never trusted; `last: N` tail reads.
- **Why this instead of a git tool:** emitting a reviewable patch + human `git apply` keeps
  ADR 0013's approval posture intact — the runtime still executes no processes and writes
  only inside the jail (`disk.write`, checkpointed). The patch files are the handoff (§25).
- **Proof:** `docs/evidence/agents/changes-proof.mjs` (2 runs → jailed patches, exact
  reverts, ledger reload). Tests 74/74 (+12).

## Amendment 8 — v8: role registry (§24) + deterministic run evaluation (§63), 2026-09
- **`registry.scope(allowed)` + `matchesTool`:** glob-aware projections (`*`, `fs.*`, exact).
  Excluded tools answer `unknown tool` — capability-by-absence rather than permission
  errors, so a role can't even probe what it shouldn't have. A scope is a copy; children
  never mutate the parent registry.
- **`roles.ts`:** `RoleDefinition` is plain data (id/name/description/allowedTools) in a
  `RoleRegistry`; `scopedRegistry(roleId, host)` resolves a role's whole world. Ships three
  `DEMO_ROLES` (researcher / editor / archivist). The planner needs no change: it already
  picks its research tier from `registry.has(...)`, so a scoped registry honestly changes
  the plan. Unknown role ⇒ empty scope ⇒ honest failure, never a silent widening.
- **`evaluate.ts`:** `scoreRun` — five weighted deterministic checks over RunOutcome data
  (completed 0.4, all-steps-ok 0.15, final-verify 0.25, ≤1 fix round 0.1, change-economy
  ≤40 added lines 0.1), each mark carrying the plain `detail` that decided it. Appended to
  its own JSONL through the injected fs; reload keeps order.
- **Why rubric-not-LLM (§60):** an LLM judge here would be pretending; every score is
  reproducible from the logged data alone, and the proof demonstrates role strength
  changing the score (1.00 vs 0.20) on an identical task.
- **Proof:** `docs/evidence/agents/roles-proof.mjs`. Tests 86/86 (+12).

## Amendment 9 — v9: §25 role pipeline as durable data (`pipeline.ts`), 2026-09
- **What landed:** `runRolePipeline(task, opts)` — a researcher tool-session (`fs.index`/
  `fs.search` through the role's *scoped* registry) produces a `HandoffRecord`
  `{from, to, goal, via, refs[], runId}`: structured data, never chat (§25). The **host**
  persists the handoff into scoped §26 memory (optionally flushed to JSON via
  `saveMemory`), then an editor-scoped `runTask` picks it up — the planner's memory-first
  tier means the editor researches *from the handoff*, not a cold index. The editor run is
  scored (§63 rubric) and both outcome + evaluation append to the JSONL files.
- **No new privileges:** every stage goes through the same registry gates; failure modes
  return stated reasons (`no research tool`, `research failed: …`, `no refs`) rather than
  invented handoffs (§60).
- **Cross-process:** with `memoryFile` + `fsLike` the handoff JSON loads in a *separate
  process* — `docs/evidence/agents/pipeline-proof.mjs` spawns a node child that completes
  the editor stage from the persisted handoff alone (score 1, `steps[0] = memory.recall`).
  This is multi-agent cooperation as durable data, still honestly demo-mode machinery.
- **Tests:** 91/91 (+5 pipeline cases: happy path, denied checkpoint, durable reload,
  missing-capability reason, determinism).

## Amendment 10 — v10: Studio Agent dock — §28 human checkpoint in-product, 2026-09
- **What landed:** `apps/studio/src/lib/agentDock.ts` (pure) + `AgentPanel.tsx` (right rail).
  The Design Model is projected into a deterministic *corpus view* (one pseudo-file per
  layer, text content included); `planAgentRun` runs the REAL v9 `runRolePipeline`
  (researcher → HandoffRecord → editor, memory-first) over that view inside the browser;
  the proposal surfaces as an `OpBatch` preview with **Approve / Deny** — the user is the
  §28 Human Checkpoint. Approve dispatches through the existing reversible op path
  (undo reverts it; history/diff panels show it normally); Deny changes nothing. Either
  decision appends a JSONL line to the `nexus.agentLedger.v1` KvStore entry — the audit
  trail persists across reloads.
- **Honesty (§60/§8):** every card carries the DEMO MODE badge and states its research
  path + pipeline status + score; the dock only *proposes* — the Design Model remains the
  single source of truth, and the pipeline runs on a copy of layer data, never mutating
  the document before approval. The machine checkpoint inside the pipeline is explicitly
  labeled as such in code; the human gate is the panel.
- **Proven in-browser** (dev server, hidden-canvas environment): compose → Plan (proposal
  "proposed for title · research: fs.index → … · score 1.00 · 1 op(s), reversible") →
  Approve → banner layer appears + ledger line `{approved:true}` → toolbar undo removes
  it while the ledger keeps the decision. Console clean.
- **Coupling:** studio now depends on `@nexus/agent-runtime` (transpilePackages); no
  runtime package changes were needed — the browser bundle proves the same modules the
  CLI proofs exercise. Tests 75/75 studio vitest (+4 `agentDock.test.ts`).

## Amendment 11 — v11: structural visual QA + dock verdict chips, 2026-09
- **`visualQa.ts`:** pure rect-data checks — `zero-size`, `off-page` (error), `overflow`
  (tolerance-parameterized warn), `overlap` (≥50% of the smaller area, error) — sorted
  deterministically (severity → code → ids). The runtime stays decoupled from the Design
  Model: callers pass `{page, rects}`; nothing here looks at pixels (§60).
- **Dock integration:** after Approve, `qaForDoc` feeds `layoutPage` rects into
  `runVisualQa`; the panel renders a verdict chip + up to three flag chips, and the
  ledger line gains `qa: 'ok'|'flagged'` — the audit trail now records what the change
  *did to the composition*, not just that it happened.
- **Browser evidence:** applying the agent banner over a composed dashboard honestly
  reports `visual QA: flagged · 2 checked` with `overlap` + `overflow` chips (the banner
  genuinely overlaps the hero strip; composed sections exceed the starter page height) —
  a real finding surfaced by structural checks in-product, not a mock.
- **Tests/proof:** runtime 96/96 (+5 `visualQa.test.ts`), studio 76/76 (+1 QA case),
  `docs/evidence/agents/qa-proof.mjs` (synthetic triad + real `layoutPage` data).
- **Limit stated:** this is geometry QA, not visual-quality judgment (contrast, hierarchy,
  brand fit need model or human eyes — §60 keeps that claim out).

## Amendment 12 — v12: QA→repair closed loop (dock auto-fix proposals), 2026-09
- **`repair.ts`:** `proposeRepairs({page, rects})` — pure deterministic rect math over the
  QA report: zero-size → grow to 8px min; overlap → nudge the later node below with a
  16px gutter; off-page/overflow → clamp back inside the page. Deduped to one final
  repair per node (sorted ids), bounded to 3 passes, **stopping with `remaining` reported
  when no progress is possible** — an honest quit, not a thrash loop.
- **Dock:** when QA flags, "Propose repairs" previews each move (target, action,
  to-coords, reason); Approve dispatches them as one reversible `updateNode` OpBatch
  through the normal op path; the ledger line gains `repairs:N` plus post-repair `qa`.
- **Browser-verified end-to-end:** compose → Plan → Approve (flagged) → Propose repairs
  (1 nudge) → Approve repairs → status `Agent repairs applied (undoable) · QA now
  flagged` — flagged *correctly*: the composed sections are taller than the starter page,
  which no move can fix; the loop reported the residual instead of pretending (§60).
  Geometry that CAN move was moved and cleared.
- **Stated limits:** repairs are heuristics (order by sorted ids, gutter 16px), they never
  resize content to fit a small page, and they are proposals only — the §28 human gate
  still decides. Runtime 101/101 (+5), studio 77/77 (+1); `repair-proof.mjs`.

## Amendment 13 — v13: browser-durable memory (`webfs.ts`) + §26 memory panel, 2026-09
- **What landed:** `createWebFs(localStorage-backed KvStore)` implements the SAME
  `FsWriteLike` seam the Node proofs inject — so v3's `saveMemory/loadMemoryStore` run
  unchanged in the page. `planAgentRun` now cold-restores `agent/memory-studio.json` on
  every run and persists after handoff; `studioMemoryOverview`/`studioMemoryForget`
  expose inspection and deletion (§26: scoped, inspectable, deletable), and the dock's
  Memory panel lists records with a per-row forget button. All dock functions accept an
  injectable `Kv` — unit tests run headlessly against a Map fake (3 new webfs + 1 new
  agentDock cases; studio 81/81).
- **Proven in-browser:** compose → Plan → Approve stores one durable record (localStorage
  shows `schemaVersion 1, records 1`), the panel lists it, forget empties the file to 0
  and the panel states "No stored findings yet" — the same JSON the separate-process
  reload test covers in Node, now surviving a page refresh path in the product.
- **No drift by design:** zero runtime changes in v13 for the seam itself; the one runtime
  tweak proved necessary is `sourcePrior(path)` in `queryIndex` — a transparent metadata
  weight (src/lib ×1.2, docs/tests/READMEs ×0.85). Reason discovered by the proofs
  themselves: as the evidence corpus grows, docs that merely *quote* identifiers crowded
  the defining sources out of top-5 (v1's README even ranked above geometry). The prior
  is stated here, in the scorer's doc-comment, and in the unit README — not hidden —
  and definition files now rank #2/#2/#1 for the three proof queries.

## Amendment 14 — v14: four-role chain + computed WCAG-contrast QA, 2026-09
- **`runRoleChain(task, opts)`:** §24's roster in motion — researcher (read scope) →
  designer (append brief, write-gated) → qa (computes `runVisualQa` over host-supplied
  rect data) → editor (full memory-first loop). Each transition is a typed
  `ChainStageHandoff` record; every stage persists a scoped memory record; failure returns
  `{ok:false, stage, reason}` naming the exact stage (no silent degradation).
- **Contrast as arithmetic:** `relativeLuminance`/`contrastRatio` (WCAG 2.1) over hex and
  rgb/rgba strings; `low-contrast` warn flag below a configurable floor (default 3, the
  large-text line). Unparsable colors yield NO flag — absence of data is never faked as a
  verdict (§60). The Studio dock resolves node/page fills through design-model tokens so
  real documents feed real colors into QA.
- **Recall ordering fix found by the chain:** refs previously tie-broke alphabetically,
  letting `docs/extra.md` beat a record's primary target; ordering is now score → memId
  (stable refs keep insertion order), with an optional `newestFirst` for chain semantics.
- **Proof/tests:** `rolechain-proof.mjs` (4 stages + denial stops at designer), runtime
  108/108 (+7), studio 81/81 unchanged; dock browser path re-verified (chips render,
  console clean).

## Amendment 15 — v15: chain mode + decisions timeline in the dock, 2026-09
- **What landed:** `planAgentChain` in the studio dock — same corpus-view machinery as
  `planAgentRun` but running `runRoleChain` end-to-end, with QA fed the REAL page
  (`qaInputForDoc` now shared, colors token-resolved). The panel's chain checkbox shows
  all three typed handoffs and the pre-approval QA verdict BEFORE any dispatch; Approve
  still proposes only the editor banner — the designer's brief provably lives solely in
  the sandbox corpus (unit test asserts the document never sees `DESIGN (DEMO MODE`).
- **Decisions timeline:** `readAgentLedger` entries render newest-first (goal,
  approved/denied, qa verdict, repair count) — the §28 audit trail becomes visible
  product UI, no new persistence layer (same JSONL in localStorage).
- **Browser-verified** (hidden surface, async evaluate script): compose → checkbox →
  Plan → three `→` handoff lines + pre-approval QA + Approve → banner in Layers +
  `RECENT DECISIONS · approved · … · qa:flagged`. Studio 82/82; runtime unchanged 108/108.

## Amendment 16 — v16: the agent drives the UI, one gated action at a time, 2026-09
- **First §63 'browser automation *by* the agent' slice:** `domkit.ts` adds `ui.observe`
  (read) and `ui.click`/`ui.type` (**exec**) to the runtime — the package touches no DOM;
  the Studio injects a `UiDriver` over real buttons/inputs (`uiRun.ts`). Because these are
  registry tools with the exec class, EVERY click/type passes the Human Checkpoint — in
  the product this renders as an 'Allow once / Deny' card naming the exact element and
  effect before anything happens.
- **Proven twice:** `dom-ui-proof.mjs` (fake driver: allow-all → two logged gated actions;
  deny the second → first stands and the run stops `denied at checkpoint`; missing label →
  fails before asking anyone) and the live browser: Agent UI run → two sequential dialogs
  → the agent typed into the real composer and clicked Compose — dashboard layers appeared,
  console clean.
- **Honest framing (§60):** the driving script is deterministic and demo-labeled, not model
  planning; automation capability ≠ autonomy — the gate is the point, and the runtime stays
  browser-free/unit-testable (113/113 runtime +5 `domkit`, 85/85 studio +3 `uiRun`).

## Amendment 17 — v17: planner backend seam (seam ≠ capability), 2026-09
- **`planBackend.ts`:** `PlanBackend { name; plan(task, ctx, knownTool) → Planned }`;
  `demoPlanner` wraps the v0 template planner and REMAINS the default everywhere
  (all prior tests/proofs unchanged, determinism preserved). `runTask` gains
  `planner?: PlanBackend` and every outcome now carries `planner: {backend, fellBack?}`.
- **`routerPlanner(provider, fallback)`:** the ModelRouter-ready shape — provider output is
  accepted only after `validatePlan` totality: non-empty ≤ 12 steps, unique step ids, tools
  that exist in the receiving registry, primitive-only args. Anything else (or a throw)
  falls back to demo and RECORDS `{from:'provider', reason}` in the outcome — a rejected
  plan is visible, never silently swapped (§60). The `@ref` dataflow still works because
  steps are ordinary `Step` objects.
- **What this is NOT:** no model, no keys, no autonomy claim. Planning became pluggable;
  the demo planner remains the only producer in this repo (`planner-proof.mjs` shows a
  fake provider adopted when valid, rejected with a stated reason when not). Runtime 120/120 (+7), fifteen proofs.

## Amendment 18 — v18: local persisted vector store (exact scan, honest limits), 2026-09
- **`vectordb.ts`:** `VectorEntry {id, text, vector}` where the vectors are the SAME
  deterministic token-bag embeddings as everywhere (hash seam, explicitly NOT trained —
  the store provides vector MECHANICS, not model semantics, §60). `buildVectorDb` sorts by
  id; `serialize/deserialize` enforce schemaVersion, dim === 64, per-entry structural
  checks (short vectors, NaNs, junk rejected with reasons); save/load over the injected fs.
- **`queryVectors`:** exact cosine scan over stored vectors + query-token coverage, zero
  overlap ⇒ 0, ties by id — asserted equal to inline `hybridScore` to 1e-12, so
  persistence cannot drift the ranking. Exact scan is stated, not hidden behind ANN buzz.
- **Measured:** real-repo proof — 219 chunk vectors, 391 KB JSON, 3.4 ms cold load, three
  queries with sane top hits, corrupt file honest.
- Runtime 124/124 (+4 `vectordb.test.ts`); `vector-store-proof.mjs`; sixteen proofs.

## Amendment 19 — v19: vector-backed §26 recall with stated engine, 2026-09
- **What landed:** `MemoryStore.toVectorDb()` exports records as a v18 vector db; `recallVectors(db, …)` answers from STORED vectors, and `registerMemoryTools` accepts `{vectorsFile, fsLike}` so `memory.recall` uses the vector path when a (valid) file exists — reporting `engine: 'vectors' | 'inline'` in every result. Corrupt or missing vector files fall back to inline computation, and SAY so (§60).
- **Parity is total, not sampled:** identical score function ⇒ vector-backed recall is asserted deep-equal to inline for scoped/global probes and for the three real-repo queries in `memory-vectors-proof.mjs`; switching mechanics cannot shift semantics.
- **Dock:** every plan/chain approval persists `agent/vectors-studio.json` alongside the memory JSON, so a refreshed page recalls from cold vectors (studio test covers load + meta path).
- Runtime 126/126 (+2), studio 86/86 (+1); seventeen proofs.

## Amendment 20 — v20: the orchestrator drives the real page, 2026-09
- **planTask gains the UI template** (`hasUi`: ui.observe → ui.type(goal) → ui.click, optional verify); domkit's ui tools now address elements by LABEL (exact, then substring) so plan args are pure data — no index math leaks into the planner, and the unmodified runTask loop executes them with per-step exec checkpoints.
- **Dock:** 'Agent UI run' switched from the scripted drive to `runUiTask` — the demo planner's plan, the orchestrator's loop, the human gate per action. Browser-verified end-to-end: two Allow-once dialogs naming element + payload, then the composed dashboard in Layers and 'Agent UI task finished' — a genuine plan→act→verify cycle on live DOM, still 100% human-gated (§28) and demo-labeled (§60).
- Runtime 128/128 (+2 ui-plan cases), studio uiRun +2 orchestrator cases (88/88 target).

## Amendment 21 — v21: host-verified UI runs + ledger journaling, 2026-09
- **`UiDriver.layerCount?()` (optional):** when the host can report real artifact count
  (the dock passes Design Model node count — §8 canonical, not DOM scraping), the studio
  `runUiTask` registers a host `test.run`, so the SAME demo planner grows a 4th
  `verify` step: completion means the design model actually changed, not that buttons
  were clicked. Without a state reporter, NO verify step is invented (asserted).
- **Ledger journaling:** every UI run appends a `{goal:'ui-task: …', approved, score,
  reason:'status=… planner=demo'}` line to the existing agent ledger and is scored by
  `scoreRun` — UI actions join the same §26/§63 audit stream as design proposals.
- Runtime 129/129 (+1 verified-plan case), studio 90/90 (+2), verify dialog also gated.

## Amendment 22 — v22: the chain's editor stage can act through gated ui tools, 2026-09
- **`ChainOptions.uiDriver?` (+ label options):** capability by PRESENCE — the ui tools are
  registered only when the host hands the chain a driver, and they go onto a copy
  (`registry.scope(['*'])`, the existing full projection) so the caller's registry is never
  mutated. The editor role's definition gains `ui.*`; researcher/designer/qa do not, so for
  them the tools remain unknown, not denied (§24 unchanged).
- **The v20 UI plan template now fires inside the chain:** with a driver the unmodified
  runTask loop plans observe→type(goal)→click(→verify) for the editor stage, and each
  exec action still passes the same Human Checkpoint as everywhere else (§28).
- **Engine recorded, not assumed (§60):** when ui results succeed, the chain appends an
  `editor→host` handoff whose `via` lists exactly the ui tools that ran
  (e.g. `ui:ui.observe+ui.type+ui.click`). Denying `ui.click` mid-plan yields
  `ui:ui.observe+ui.type` and status `denied` — the page is never clicked, and the audit
  trail says which actions DID happen.
- Runtime 131/131 (+2 chain-ui cases); `rolechain-proof.mjs` extended (completion,
  per-action denial, registry-immutability, researcher-absence assertions); seventeen
  proofs.

## Amendment 23 — v23: persisted chunk vectors become a real scoring path inside fs.index, 2026-09
- **`indexVectors.ts` — vectors ride the index lifecycle:** each chunk gets a stored vector
  under id `path#startLine` with text `heading + ' ' + text` — exactly the string `queryIndex`
  scores inline. `mergeIndexVectors` reuses stored vectors verbatim for unchanged (id, text)
  pairs and re-embeds only touched windows; the merged db is asserted deep-equal to a cold
  `indexToVectorDb` build. `createIndexProvider` gains `vectorsFile` + `vectors()`: cold-load
  once, incremental merge on every refresh, persist each time; a corrupt vectors file rebuilds
  and repairs.
- **Parity by construction, engine stated (§60):** `queryIndexWithVectors` re-derives the
  exact `hybridScore × sourcePrior` formula from the STORED vector (same zero-shared ⇒ 0 rule,
  same tiebreaks, same snippets) — tests and proof assert hit-for-hit equality with
  `queryIndex`. `fs.index` output is now `{engine:'inline'|'vectors', hits}`; if ANY chunk
  lacks a matching vector (drifted, tampered or wrong-dim db) the WHOLE query falls back to
  inline scoring and says `engine:'inline'` — never a silently half-vector ranking.
- Runtime 142/142 (+11 `indexVectors.test.ts` cases); new `index-vectors-proof.mjs` over the
  real repo (711 chunk vectors: cold persistence, 4-query parity, byte-identical cold reuse,
  one-line edit re-embedded 1/711, tamper ⇒ stated inline fallback, corrupt ⇒ repair,
  tool-surface engine labels); eighteen proofs.

## Amendment 24 — v24: opt-in near-miss lints — measurable "almost aligned", never taste, 2026-09
- **Two new structural rules in `visualQa.ts`:** `near-align` (a pair whose left/right/top/
  bottom edges differ by >0 and ≤ `alignTolerance` px — exact coincidence passes, big design
  freedom passes, only the 1–2px slip that every designer recognizes lints) and `near-center`
  (a fully-on-page rect whose |leftGap − rightGap| or |topGap − bottomGap| is >0 and ≤
  `centerTolerance`). Pure arithmetic on the same rect inputs (§60: nothing claims taste).
- **Opt-in by default (`tolerance ?? 0` ⇒ rule OFF):** existing hosts provably gain zero new
  flags — asserted. The Studio dock explicitly opts in at a tight 2px in `qaForDoc`, so the
  chip row can now show `near-align`/`near-center` after every Approve; the generic
  flag renderer needed no change. Rects already carrying `zero-size`/`off-page` are excluded
  from near-miss noise (usable-set guard, asserted).
- **Repair stays honest:** `proposeRepairs` does NOT touch near-miss flags — "nudge to align"
  is a human call by default (§28), and the loop never invents a fix it can't justify.
- Runtime 148/148 (+6 near-miss cases), studio 91/91 (+1 dock opt-in case);
  `qa-proof.mjs` extended (defaults-off, real px gaps in details, noise guard); eighteen
  proofs.

## Amendment 25 — v25: near-miss slips become gated align-nudge proposals, 2026-09
- **`proposeRepairs(input, opts)` gains `{alignRepairs?: boolean}` (default OFF):** with the
  opt-in, a `near-align` flag produces an `align-nudge` — the deterministic mover (smaller
  area moves; equal area ⇒ localeCompare-later id) snaps the first flagged edge (fixed order
  left/right/top/bottom, gap ≤ `alignTolerance`) to exact, and a `near-center` flag produces
  a `center-nudge` to the page mid-line per axis (both margins positive required). Reasons
  state the exact px snapped (§60); without the opt-in the v24 behavior is provably
  unchanged — lints surface, zero nudge repairs proposed.
- **Still only proposals (§28):** nudges flow through the same planRepairs → Approve → op
  path as every other repair; `proposeRepairs` itself never mutates input rects (asserted).
  The dock mirrors `qaForDoc`'s 2px tolerances into the repair input so the internal QA
  re-run sees the same lints the user saw.
- Runtime 154/154 (+6 repair nudge cases), studio 92/92 (+1 "proposals, not magic" dock
  case); `repair-proof.mjs` extended (default-off, 1.5px slip → exact with stated mover,
  1px center snap, 140px gap untouched, apply-all → zero flags, non-mutation, determinism);
  eighteen proofs.

## Amendment 26 — v26: even-gap distribution lint — the near-miss family grows a third member, 2026-09
- **`uneven-gaps` in `visualQa.ts`:** per axis, the usable rects are sorted by start edge
  (ties by id); the consecutive gaps must ALL be positive (a broken chain is overlap
  territory, not distribution), and when ≥3 rects give a gap set whose max−min spread is
  >0 and ≤ `gapTolerance`, one warn flag names the run, the real gaps and the spread.
  Exact-even spacing (spread 0) passes — this lints the 1px wobble, not the design.
- **Same opt-in contract as v24 (`gapTolerance ?? 0` ⇒ OFF):** hosts that never pass the
  tolerance provably gain no flags; zero-size/off-page rects stay out via the usable set.
  The Studio dock opts in at the same tight 2px in `qaForDoc`.
- **Lint, not auto-fix (§28 + §60):** `proposeRepairs` deliberately has no `distribute`
  action — even re-spacing of a whole chain is a bigger human call than snapping one
  slipped edge; the dock stays honest with "nothing safely fixable" while the chip shows
  the measured wobble.
- Runtime 160/160 (+6 distribution cases), studio 93/93 (+1 dock chip case);
  `qa-proof.mjs` extended (defaults-off, exact-even passes, 11/12px row flags with the
  real spread in the detail, >tol passes, crushed chain stays overlap's business);
  eighteen proofs.

## Amendment 27 — v27: near-edge lint + edge-snap nudge — the page edge joins the near-miss family, 2026-09
- **`near-edge` in `visualQa.ts`:** a usable rect whose margin to a page edge is >0 and ≤
  `edgeTolerance` (default 0 ⇒ OFF, same no-silent-flags contract) lints warn once per
  rect, naming every near-flush side with the measured px. Exact flush placement is
  intent and passes; a NEGATIVE margin is overflow/off-page territory and never collects
  near-edge noise (usable/margin-sign guards, asserted).
- **`edge-snap` rides the v25 opt-in machinery:** under `{alignRepairs:true}` the fixed
  side order (left→right→top→bottom) snaps the first near-flush edge flush, stated px in
  the reason; a corner that is near TWO edges snaps the first and then STOPS HONESTLY —
  `remaining` reports the other side instead of chasing it. Still proposals only (§28).
- **Dock:** `qaForDoc` and `planRepairs` opt into the same tight 2px, so a 1.5px page
  margin shows a chip and earns exactly one gated flush proposal (studio test asserts the
  doc is untouched until the batch goes through the op path, then `ok`).
- Runtime 171/171 (+6 visualQa, +5 repair cases), studio 94/94 (+1 edge-snap dock case);
  `qa-proof.mjs` and `repair-proof.mjs` extended; eighteen proofs.

## Amendment 28 — v28: the test-run seam — `test.run` graduates from ad-hoc bodies to a shared predicate engine, 2026-09
- **Why a seam, not a runner:** the M2 line says "test", but spawning real processes is
  forbidden until the ADR 0013 exec sandbox exists (§9, §60). So v28 formalizes what the
  hosts were already doing — hand-rolling one-off `test.run` tool bodies — into a port:
  a `TestRunner` whose default implementation executes host-registered **in-process
  predicates** over a file snapshot. Nothing here runs a real test suite, and every
  report carries its engine string so it can never masquerade as one.
- **`testRunner.ts`:** `runPredicates(engine, predicates, files, only?)` is deterministic
  (name-ordered, stable — first registration wins a duplicate name), verbatim (a returned
  string IS the failure message), throw-safe (an exception becomes `threw: …`, the run
  continues) and honest at the edges: an EMPTY pack is a stated `vacuous: no predicate
  ran` failure, never a green pass; an unknown `only` filter is an ERROR at the tool
  level, not a vacuous pass. `registerTestTools` keeps the loop's `{ok, detail}` contract
  and adds a structured `report`; `predicateRunner` reads files LAZILY so a later write
  changes the next verdict with no re-registration.
- **Journalled verification:** the orchestrator collects every `test.run` report onto
  `RunOutcome.testReports` in execution order — verify AND each fix-round re-check are on
  record; hosts without the tool keep the old shape (field absent, no fake data).
  `appendTestReport`/`loadTestReports` persist verdicts as append-only JSONL with the
  ledger's counted-never-trusted malformed-line discipline.
- **Hosts converted:** the studio dock (both plan modes share the named
  `annotation-landed` predicate) and the UI runner (a `layers-grew` predicate closing
  over the design-model reporter) now use the runtime factory — §8 stays true: the check
  runs against the canonical model, in-process, checkpoint-gated `exec` as before.
- Runtime 186/186 (+15 testRunner cases), studio 96/96 (+1 dock +1 uiRun report cases);
  `testrunner-proof.mjs` added (predicates · tool contract · e2e loop journalling ·
  JSONL durability); nineteen proofs.

## Amendment 29 — v29: exec-sandbox policy as PURE DATA — ADR 0013 first slice, 2026-09
- **Why data first:** ADR 0013 (sandbox security) is still `Proposed`, and this repo has no
  Docker/host-exec surface to guard. The portable half of the design — the POLICY — is pure
  arithmetic on strings and can be built, tested and proven today; the executor is deliberately
  NOT wired until the policy itself is battle-proven (§60: no half-built process pipes).
- **`execSandbox.ts`:** `planExec(request, policy)` returns `{ok:true, plan}` or
  `{ok:false, reason}`. Pillars, all default-deny: exact-argv allowlist (`'*'` matches one
  ARGUMENT token, never the executable), bare-name executables only (any path separator is
  refused before matching), cwd confined through the proven v3 `guardedJoin` jail, env scrubbed
  to a named allowlist with every dropped var LISTED, and timeout/output budgets clamped to
  policy ceilings the request cannot raise. `validatePolicy` fires at `registerExecTools` time:
  a wildcard-executable policy is a programmer error and dies at registration, not at decision.
- **Type-level honesty:** `ExecPlan.executes` is the literal `false` IN THE TYPE — every plan
  this module can produce says so. The `exec.plan` tool is `read`-permission (it decides, it
  does not execute — §28 has nothing to gate) and its refusals still succeed AS tool calls
  (`planned:false` + stated reason), matching the loop's never-rejects contract.
- **The claim is CHECKED, not claimed:** `exec-sandbox-proof.mjs` scans every built
  `agents/runtime/dist/*.js` for `child_process` and finds none — "nothing in the runtime can
  spawn" is now an assertion the evidence gate re-proves on every run.
- Runtime 204/204 (+18 execSandbox cases), studio 96/96 untouched (dock wiring deferred until
  an executor exists — a plan nobody runs would be dead UI); twentieth proof added
  (`exec-sandbox-proof.mjs`); twenty proofs.

## Amendment 30 — v30: the sandboxed exec host — a SEPARATE package owns the key, 2026-09
- **Why a new package:** v29's most valuable property is that `@nexus/agent-runtime`
  provably CANNOT spawn (the proof greps every dist module for `child_process`). Wiring an
  executor in there would trade a checked guarantee for a comment. `@nexus/exec-host` holds
  the capability instead, and `exec-host-proof.mjs` audits the boundary BOTH WAYS: runtime
  dist stays clean, and exactly one exec-host module may name `child_process`.
- **Only-approved-plans execute:** the host's `run()` starts at `planExec` — a policy
  refusal returns structured data and spawns nothing even behind an approving checkpoint
  (the policy outranks the human, not vice versa). Execution is argv-as-data through
  `shell: false`; no string is ever re-parsed. The plan's OWN budgets are enforced: total
  stdout+stderr hard-capped at `maxOutputBytes` (over-run marked `truncated`), `timeoutMs`
  kills marked `killedByBudget`, and the scrubbed env is what the process actually gets.
- **§28 single-gate contract:** a DIRECT `host.run` must carry a checkpoint (or explicitly
  `preApproved`); no gate = stated refusal, nothing spawns. Via `registerExecHostTools`
  the registry's exec gate is that one checkpoint — refusals and denials surface as tool
  ERRORS, never silent successes; exits report as `{ok, detail, result}` data and every
  run round-trips through append-only JSONL (`appendExecRun`/`loadExecRuns`).
- **Real, honestly labeled:** the proof executes ONE read-only `git status --short` under
  NODE_SPAWN through the same machinery (§60: it is one command, not a sandbox escape
  claim — container/network isolation per ADR 0013 remains open; the ADR's status moves to
  Accepted-partial only when the docs team ratifies, for now it stays Proposed with the
  v29/v30 landed-slice note).
- Runtime 204/204 UNCHANGED (no runtime source touched), NEW @nexus/exec-host 15/15,
  studio 96/96 untouched; twenty-first proof added (`exec-host-proof.mjs`); twenty-one proofs.

## Amendment 31 — v31: verification by REAL commands — the async seam + the exec-host bridge, 2026-09
- **The seam widened, not forked:** `TestRunner.run(only?)` may now return
  `TestReport | Promise<TestReport>` and `registerTestTools` AWAITS it. `predicateRunner`
  stays synchronous, so every v28 host is untouched — the type change is backward
  compatible and the studio/dock tests prove it (96/96 unchanged).
- **The bridge lives where the key lives:** `execTestRunner(host, argv, {name, preApproved,
  cwd, env})` is in `@nexus/exec-host`, NOT in the runtime — the v29/v30 "runtime cannot
  spawn" audit survives, and `exectest-proof.mjs` re-checks `testRunner.js` for
  `child_process` anyway. It maps an `ExecRunResult` to a `TestReport` VERBATIM: the
  engine label is `exec-host:<argv>` (nobody can mistake a command verdict for a
  predicate), pass means `ran && exit 0 && not killed && no spawn error`, and every
  failure message carries the exit code, the streams and the budget flags as observed.
- **Refusals are data, not drama:** an unlisted argv produces a FAILING report stating
  the policy reason and ZERO spawns; no `preApproved` and no checkpoint yields the exact
  `checkpoint required for exec (§28)` string; an `only` filter miss returns the vacuous
  total-0 shape, which the `test.run` tool converts into its stated error — the bridge
  never even pays for a spawn on a name nobody registered.
- **§28 stays a SINGLE gate:** wired through `registerTestTools`, the registry's exec
  permission is the checkpoint, and the bridge runs with `preApproved: true`; the proof
  counts spawns per granted verify — exactly one, none for denials.
- Runtime 207/207 (+3 async-seam cases), @nexus/exec-host 24/24 (+9 bridge cases), studio
  96/96 untouched; twenty-second proof added (`exectest-proof.mjs`); twenty-two proofs.

## Amendment 32 — v32: read-only git awareness on the confined host, 2026-09
- **See, don't touch:** the agent stack learns the repo's state through REAL git
  commands — `git.status` (porcelain) and `git.diff` (per-file tallies or `--stat`
  summary) — while §9 holds BY POLICY: `gitReadOnlyPolicy(root)` allows exactly three
  exact argv (`git status --short`, `git diff`, `git diff --stat`) and default-denies
  everything else, verified against `git push` / `git commit -m` / path-scoped diffs.
  The git COMMIT write tool is deliberately NOT this slice.
- **No new machinery, only wiring:** every run goes through the v30 host unchanged —
  planExec first (a refusal is a tool error), the registry's exec permission is the one
  §28 checkpoint (read-only for the repo still means a PROCESS spawns), the policy
  env-allowlist scrubs git's environment (`TOKEN` never reaches it), and the jail's
  `cwd` refusal holds even for status/diff. Truncation and nonzero exits are labeled
  data, never silent and never crashes.
- **Structured, not blobby:** pure parsers (`parseGitStatus`/`parseGitDiff`/
  `parseDiffStat`) turn stdout into entries+counts / file→hunk tallies / stat summaries
  BEFORE anything sees them; renames report the new path, `+++`/`---` headers never
  count as changes, junk stat footers say `null`.
- Runtime 207/207 UNCHANGED (nothing in agent-runtime was touched), @nexus/exec-host
  41/41 (+17 gitTools cases), studio 96/96 untouched; twenty-third proof added
  (`git-aware-proof.mjs`, incl. real read-only status+diff-stat demos); twenty-three proofs.

## Amendment 33 — v33: the dock makes WHO-VERIFIED visible (test-report chips), 2026-09
- **Verification is data, not vibes:** every `RunOutcome` already journals
  `testReports` (v28), but the Studio dock dropped them on the floor. `testChipsFor`
  (pure, in `agentDock.ts`) maps each report to a chip — `<engine> passed/total`,
  green/red by verdict, first failure in the tooltip — so the panel states WHICH engine
  proved the run instead of the user trusting a bare "status completed".
- **Annotation-land only, stated plainly (§60):** the dock hosts register only the
  in-process `annotation-landed` predicate — the chips say exactly that
  (`in-process-predicates 1/1 ok`), and a run whose host registered no tests shows
  "(no test.run in this host)" rather than an empty row that could be misread as
  "verified". Real suite runs stay behind the exec sandbox (`execTestRunner`, am. 31);
  no `child_process` crossed into the browser.
- **The ledger learns the verdict too:** `ledgerLine` gains an optional `tests` field
  taken from the LAST report of the plan's outcome (engine + tally + ok/FAIL); plans
  with no reports add no field, and `readAgentLedger`'s only required keys stay
  `goal`+`approved`, so v10-era lines still parse.
- Runtime 207/207 and @nexus/exec-host 41/41 UNCHANGED (no agents-package edits),
  studio 99/99 (+3 agentDock cases: pure chip mapping incl. a failing report, a real
  pipeline plan yielding exactly one honest ok chip, the ledger `tests` field present
  and absent); chips are plain React renders of the tested selector — the hidden-
  viewport harness caveat still applies to pixel claims. Twenty-three proofs re-run
  green (25 scripts incl. the two studio evidence scripts).

## Amendment 34 — v34: a repo test suite really verifies through the exec sandbox, 2026-09
- **A caveat retires by DEMONSTRATION:** since v31 the README stated "running the repo's
  real test suites through the host remains a future policy choice, not current
  behavior". v34 makes that choice once and proves it: the 24th proof
  (`execsuite-proof.mjs`) boots the ACTUAL @nexus/design-model vitest suite through
  `createExecHost` + `execTestRunner` + the §28 registry gate — policy allowlists ONE
  five-token argv (`node node_modules/vitest/vitest.mjs run --root
  packages/design-model`), budgets capped (180s / 1 MiB, request-clamp shown), env
  confined to eight named vars (the proof asserts the spawn saw EXACTLY the policy
  list), cwd jailed. The suite passed: exit 0 in ~11s, engine
  `exec-host:node …vitest…` named verbatim in the report.
- **Zero wasted spawns is COUNTED, not claimed:** a wrapper around the real
  `NODE_SPAWN` tallies every process ever born during the proof — §28 absence, human
  denial, cwd escape, whole-repo widening (and the vacuous `only` filter) all return
  honest FAILING reports with the counter unmoved; exactly ONE granted verify moves it
  by one.
- **§60 stays exact:** a subprocess report is ONE named exit-zero check whose detail
  carries vitest's own summary verbatim (ANSI included) — it is not a predicate pack,
  the label never pretends otherwise; the sandbox is still POLICY-level (no OS
  container, ADR 0013 egress/containers open); running tests writes vitest's cache
  under `node_modules` (ordinary dev behavior) and touches no source file (§9 intact).
- NO product code changed — runtime 207/207, exec-host 41/41, studio 99/99 all
  UNCHANGED; this is the v29–v31 machinery doing exactly what it was built to do.
  Twenty-four proofs (26 scripts with the two studio evidence files) re-run green.

## Amendment 35 — v35: git.commit, the staged index behind §28 and the first '*' arg wildcard, 2026-09
- **The v32 caveat closes on its own terms:** read-only git awareness shipped with the
  deliberate note that a COMMIT tool would be "a separately-gated slice, not an
  oversight". v35 lands exactly that slice in `agents/exec-host/src/gitCommitTool.ts`:
  `gitCommitPolicy(root)` allowlists ONE argv shape — `git commit -m <message>` — and
  nothing else. No `add`, no `push`, no flag combinations: the tool commits ONLY what
  a human already staged, so the §28 checkpoint keeps the highest-stakes call in the
  loop twice over (stage = human; commit = checkpointed tool call).
- **First production use of the `'*'` ARG wildcard (v29 design, v35 first wiring):**
  `argvMatches` lets `*` match exactly one token and never the executable, so the
  message floats while the shape stays fixed. The sneaky case is proven: a message
  literally containing `--no-verify -a` arrives as ONE argv element under
  `shell: false` — git sees it as the commit message, never as flags. Policy
  default-deny covers `git commit` (no `-m`), `-m a b` (arity), `-am`, `--no-verify -m x`,
  `add`, `push`, `rm`. A blank/whitespace message throws BEFORE the policy — git needs
  something to say, and no process is ever born for an empty string.
- **Refusals are data, exits are data:** §28 absence/denial, cwd escape and
  default-deny surface as tool ERRORS (nothing ran); a real nonzero git exit (e.g.
  "nothing staged") returns `ok:false` WITH git's first stderr line — the agent learns,
  the process table stays honest. Success parses `[branch (root-commit)? hash] subject`
  + the stat footer (`parseCommitOutput` knows create-mode lines come AFTER the stat)
  into a `GitCommitRecord`.
- **§9 proves itself where it bites hardest:** the 25th proof (`commit-proof.mjs`)
  performs REAL commits only inside a throwaway `os.tmpdir()` repo — local
  `core.hooksPath`/`commit.gpgsign false`/identity set INSIDE that repo so the global
  codex hooks and the user's real git config are never touched or bypassed. It commits
  ONE staged file while an unstaged edit (` M a.txt`) and a never-staged file survive
  untouched — staged-only semantics demonstrated by the porcelain, not asserted by
  hope — and byte-compares the HOME repo's HEAD before/after as the final assertion.
  Runtime unchanged (spawn-free); exec-host 41/41 → 57/57 (16 gitCommitTool cases);
  twenty-five proofs (27 scripts) green.

## Amendment 36 — v36: commit after green — the loop learns WHEN to knock, 2026-09
- **v35 built the door; v36 decides when to knock at it.** The demo planner gains
  `hasCommit` (detected via `registry.has('git.commit')`, like `hasIndex`/`hasUi`
  before it): when a verify tool is ALSO present, a `commit` step is appended AFTER
  `verify`. Position is the whole safety story — the loop returns
  `failed_verification` at the verify step, so a red run can never reach the commit,
  no matter what the plan carried.
- **The fix-round rewrite this needed is the real product change:** until now a run
  that turned green inside a fix round RETURNED `completed` immediately, skipping any
  later step. The verify block now tracks a `green` flag and lets the outer loop keep
  walking; steps already executed inline during fix rounds (`fix-1`, `verify-2`) are
  recognized via the by-step result map and skipped — never run twice. Existing plans
  are event-for-event unchanged (v0's golden-path assertions still hold), and a
  verified-via-fix run now commits too, which is exactly what "after green" promised.
- **§28 stays the human's seat — staging included:** the commit step's checkpoint IS
  where a person reviews and STAGES what they want; the tool then commits that index
  and nothing else. A denial stops the run with status `denied` and zero spawns; a
  throwing commit implementation surfaces as honest non-green, never a silent pass.
- **Studio is untouched by construction:** the browser registers no exec-host tools,
  so `hasCommit` is false there and no plan gains a commit step — 99/99 unchanged
  proves it. Runtime 207/207 → 213/213 (1 planner + 5 orchestrator cases, fake spawn
  free); the 26th proof (`greencommit-proof.mjs`) runs the whole story against a REAL
  throwaway `os.tmpdir()` repo: red → 0 spawns, denied → 0 spawns, green-after-fix →
  exactly ONE spawn whose argv/env/cwd are asserted verbatim, and the JSONL ledger
  replays the landed commit hash to a cold reader. Home-repo HEAD byte-checked again.

## Amendment 37 — v37: git.log read-back — see → touch → CONFIRM, 2026-09
- **The circle closes in `@nexus/exec-host`; the runtime stays untouched.** v32 gave the
  agent EYES on the working tree, v35 gave it the one-argv HAND, v36 taught it WHEN to
  reach — v37 gives it the last step: reading its own history back. `gitLogPolicy(root)`
  allowlists EXACTLY `['git','log','--oneline','-n','*']` — the SECOND production wiring
  of the v29 `'*'` ARG wildcard, this time on the read side: shape fixed, count floats,
  arity enforced (`git log`, `--all`, a trailing ref, `git show`, `git commit`, `git push`
  all default-deny). `registerGitLogTool` exposes §28-gated `git.log` (an exec-permission
  read: nothing is written, but a REAL process still spawns, so the checkpoint still sits
  on it); the tool's OWN bound (count 1–100, default 10) rejects junk before the policy
  ever sees it — the policy fixes the SHAPE, the tool bounds the WINDOW.
- **`parseGitLog` is honest echo math:** `<hash> <subject>` per line into ordered
  `GitLogEntry[]`; a hashless line is COUNTED (`skipped`), never guessed into a commit;
  an empty repo is git's exit-128 DATA quoted verbatim, not a crash.
- **The 27th proof (`gitlog-proof.mjs`) is the self-verification story** in a throwaway
  `os.tmpdir()` repo (§9; hooks/signing/identity neutralized LOCALLY there): ONE registry
  behind TWO keyed doors — a log host that can only read and a commit host that can only
  write its one shape — and even `preApproved:true` through the log host cannot spawn a
  push. Sequence: empty repo → exit-128 data; HUMAN seed commit outside the sandbox; agent
  commits the staged file through §28; `git.log -n 2` then agrees BYTE-FOR-BYTE — newest
  logged hash+subject === the `GitCommitRecord` the commit tool handed back, human seed
  sitting below. Denied checkpoints, out-of-bound counts and out-of-policy argv cost zero
  processes (3 spawns for the whole true story); HOME HEAD byte-identical before/after.
- exec-host 57/57 → 71/71 (14 gitLogTool cases); runtime 213/213 UNCHANGED (spawn-free by
  audited design — no product code in the runtime moved); studio 99/99 unchanged;
  twenty-seven proofs (29 scripts) green.

## Amendment 38 — v38: confirm after commit — the PLAN itself ends in git's own words, 2026-09
- **v37 built the read-back door; v38 walks the agent through it automatically.** The demo
  planner gains `hasConfirm` — nested INSIDE the `hasCommit` block, which is itself nested
  inside `hasVerify`: the `confirm` step (a `git.log` read of the last 2 commits) exists
  only where a commit exists, which exists only where green verification exists. Position
  in the plan IS the safety, one tier deeper than v36 ever took it. The orchestrator's
  control flow did NOT change at all — v36's green-flag walk already executes whatever
  trails verify; the only runtime edit is capability detection
  (`hasConfirm: registry.has('git.log')`). A run outcome now ENDS with git's verdict on
  the agent's own work instead of the agent's claim about it.
- **Denied confirm is honest bookkeeping, not amnesia.** If the human vetoes the read-back
  AFTER the commit landed, the run says `denied` — and the landed commit's `ok:true` result
  STANDS in `results` a slot earlier: the truthful story is "it wrote, and could not
  verify". Tests assert exactly that pair (status denied + commit result + commit executed
  once + vetoed read spawned nothing). A throwing `git.log` after a green commit keeps the
  v36 contract: the run ends `failed_verification`, never a silent green.
- **The 28th proof (`confirm-proof.mjs`) is the first where `runTask` — the REAL loop, not
  a hand-called tool — drives REAL `git.commit` + REAL `git.log`** over a throwaway
  `os.tmpdir()` repo (§9; hooks/signing/identity neutralized LOCALLY there). Granted run:
  executed callIds `search→read→annotate→verify→commit→confirm`, and the money assertion
  is cross-tool — the log's newest hash+subject equals the `GitCommitRecord` the commit
  tool reported, byte for byte, with the human seed below. Full-SHA nuance stated in the
  proof itself: `rev-parse` prints 40 chars, git's own echoes abbreviate — prefix, not
  equality. Denied confirm: history moved once, run still says denied. Red run: the plan
  PROPOSED the arc and neither tail executed. The ledger replays commit record AND read-back
  to a cold reader. HOME HEAD byte-identical before/after.
- runtime 213/213 → 218/218 (5 new agent.test.ts cases — planner nesting + determinism and
  the four orchestrator semantics; that file is now 24 tests); exec-host 71/71 UNCHANGED
  (no product code moved there); studio 99/99 unchanged; twenty-eight proofs
  (30 scripts) green.

## Amendment 39 — v39: remembered victories — memory only ever holds what the loop PROVED, 2026-09
- **Position-is-safety reaches its fourth tier, and the runtime does it WITHOUT git.**
  `PlannerOptions.hasRemember` nests a `remember` step (tool `memory.save`) INSIDE the
  hasConfirm block inside the hasCommit block inside the hasVerify block: the ONLY
  position in any demo plan where a memory write exists is the tail of the FULL
  verify→commit→confirm arc. A red run, a denied commit, even a DENIED CONFIRM cannot
  produce a remembered victory — the summary string `COMMITTED+CONFIRMED` is therefore
  not a claim but a consequence of where the step sits. **(Amendment 45 corrects this
  sentence: position guarantees the doors were WALKED, not that git RECORDED anything —
  a §28-granted commit over an EMPTY index exits 1, and the string said otherwise.
  The planned summary now reads `ARC-COMPLETE` and cites git's own answer for the
  landing; `remember-proof.mjs` was re-greened on the new wording.)** The orchestrator gained exactly
  two things: capability detection (`hasRemember: registry.has('memory.save')`) and the
  dataflow upgrade `resolveArgs` now resolves `@refs` INSIDE array args — the planned
  `refs:['@search.hits.0.path']` became the LIVE workspace path at invoke time, the same
  channel v0's read step has always used, just widened to lists.
- **Denied-remember is §26's delete-key promise pointed inward:** the human can veto even
  the ACT OF REMEMBERING a real, confirmed victory — status `denied`, the commit and the
  agreeing read-back still STAND in results, and the store provably never saw the write
  (deny ⇒ impl never runs). A throwing `memory.save` ends `failed_verification`: an arc
  nobody stored never closes as completed either.
- **The 29th proof (`remember-proof.mjs`) closes the loop for real:** ONE throwaway
  `os.tmpdir()` repo, REAL sandbox commit+log hosts, a REAL `MemoryStore` alive across
  FOUR full `runTask` runs. Run 1 wins (executed order ends commit→confirm→remember;
  exactly one record `mem-1`, refs resolved to the live path, 2 spawns). Run 2's research
  step is `memory.recall` — and it RECALLS run 1's victory FROM the memory that victory
  wrote, then meets a denied commit: no second win stored, zero spawns. Run 3 vetoes the
  remembering itself; run 4 goes red. The ledger then replays COLD: the JSONL reader's
  last result IS the `memory.save` whose `output.id` equals the live store's record id —
  memory, ledger and git history tell ONE joinable story. HOME HEAD byte-identical.
- runtime 218/218 → 224/224 (6 new agent.test.ts cases — planner nesting with the
  refs/targetPath variants and all three tier-removal omissions, plus five orchestrator
  semantics; that file is now 30 tests); exec-host 71/71 UNCHANGED (no exec-host code
  moved); studio 99/99 unchanged; twenty-nine proofs (31 scripts) green.

## Amendment 40 — v40: checkpoint policy as pure data — §28 becomes a table you can diff, 2026-09
- **The human in §28 was always a closure; v40 makes the DECISION inspectable.**
  `checkpointPolicy.ts` is a pure runtime module: an ordered `CheckpointRule[]`
  (tool pattern — exact/trailing-glob/`*`, reusing the registry's own `matchesTool` —
  plus `grant` and a REQUIRED `reason`), an EXPLICIT default (no implicit verdicts),
  `decide` = pure first-match, and `policyCheckpoint(policy)` adapting it to the
  registry's unchanged `Checkpoint` type while keeping a receipt (`CheckpointDecision`)
  for every single gated call. `validateCheckpointPolicy` throws at CONSTRUCTION on a
  missing reason, non-boolean grant or duplicate pattern (a duplicate means the later
  rule is dead code — the table says what it means, or it does not gate).
- **Honest bounds (§60):** a policy auto-approving is exactly as trusted as the human
  who wrote it — the module changes WHERE judgment lives, not WHO owns it; the receipts
  exist so no decision can later be claimed silently. Read-permission calls never reach
  the checkpoint (gates stay on hands, not eyes), and no host is switched to policy mode
  by this amendment — the dock's live Allow-once human stays the default §28 face; this
  is the pre-authorizable, auditable ALTERNATIVE, proven side by side.
- **The 30th proof (`policygate-proof.mjs`) runs the SAME plan+tools under TWO tables**
  against REAL git in a throwaway `os.tmpdir()` repo (§9): the closed table denies the
  commit with 0 spawns and HEAD unmoved; the open table commits exactly once; the two
  audit trails are the same length and differ on EXACTLY one line — `git.commit` — each
  receipt quoting its rule's stated reason verbatim. An unlisted exec-capability falls
  to the default row and never runs. HOME HEAD byte-identical.
- runtime 224/224 → 232/232 (NEW checkpointPolicy.test.ts, 8 cases incl. a runTask
  end-to-end through policy gates); exec-host 71/71 and studio 99/99 unchanged (no
  exec-host or browser code moved); thirty proofs (32 scripts) green.

## Amendment 41 — v41: the dock grows a second §28 face — human clicks and table receipts side by side, 2026-09
- **`apps/studio/src/lib/dockPolicy.ts` is the seam:** `faceCheckpoint({mode:'human'|'policy'})`
  adapts EITHER face into the registry's unchanged `Checkpoint`, recording every verdict
  (`GateVerdict{tool, granted, by, reason}`) — the policy face delegates to v40's
  `policyCheckpoint` (validation at construction, receipts quoting `rule <matched>:
  <reason>`), the human face wraps exactly the pre-v41 per-action callback. `gateLineFor`
  renders who spoke: `human: …` / `policy: …` / `mixed: …` / the honest `no gated calls`.
- **`runUiTask` gained an optional `face` and a `gate` line in its ledger entry.**
  Default remains the live human — the pre-v41 consultation set and order are asserted
  UNCHANGED in tests; with `{mode:'policy'}` the visitor is never consulted and the
  table's receipts journal into the same ledger the RECENT DECISIONS timeline reads
  (LedgerEntry gains optional `gate` — the lenient reader still only requires goal +
  approved). A policy that forgets `test.run` gets vetoed by its own DEFAULT row and the
  run lands `denied`, never a silent green: the two faces share one registry, one gate.
- **Honest bounds (§60, no UI theater):** the mode toggle is NOT in the dock UI yet —
  today only tests construct the policy face; the browser still shows Allow-once for
  humans. The Studio stays spawn-free and registers no exec-host tools.
- studio 99/99 → 105/105 (NEW dockPolicy.test.ts, 6 cases); runtime 232/232 and
  exec-host 71/71 UNCHANGED (no product code moved there); thirty proofs (32 scripts)
  green — this increment's evidence is headless vitest, so no new node proof (studio lib
  is app code, not a built package).

## Amendment 42 — v42 (exec-host): the CONTENT read-back — a run finishes its sentence: something landed AND this is what it says, 2026-09
- **`agents/exec-host/src/gitShowTool.ts` is the third pinned door:** v37 and v38 let a run
  confirm THAT a commit landed — a hash agreeing with git's own echo. A hash says
  *something* was recorded. `git.show` answers *what*: the policy allows exactly ONE argv
  shape, `['git','show','--format=','--','*']` — the revision is pinned to HEAD **by
  omission** (no `--format` header, no ref slot), and the `--` separator forces the one
  floating token to be a PATHSPEC, so blob syntax like `HEAD~9:README.md` after `--`
  matches nothing instead of reaching into another commit. `validateShowPath` throws on
  junk (blank, newline/CR, leading `-`, absolute, any `..` segment) BEFORE policy, with
  zero spawns. Read-only like v32; still a real process, so `permissions:['exec']` and the
  §28 registry gate still speak first.
- **The answer is parseable, scope-stated data:** `parseShowDiff` (the tool's own code, §8)
  → `GitShowFileChange{path, hunks, additions, deletions, addedLines, binary}` —
  `addedLines` carries only `+` body lines of HEAD's hunk for that path (a 1-line change
  claims 1 line, never the file); `\ No newline` markers are skipped on their own line;
  `Binary files … differ` is labeled `binary:true` and the detail says no lines are claimed;
  exit 0 with an untouched path reads back as the stated empty diff; git's exit-128 refusal is
  `ok:false` DATA quoting git's first stderr line, not a crash **(amendment 44 corrects the
  trigger: an unmatched pathspec exits 0 with an EMPTY diff here — 128 is an unborn HEAD)**;
  `truncated` / `killedByBudget` flags ride along from the host budgets.
- **31st proof `docs/evidence/agents/show-proof.mjs` runs the FULL circle against REAL git**
  in a throwaway `os.tmpdir()` repo (`core.hooksPath`/`commit.gpgsign` neutralized LOCALLY
  there, plus `core.autocrlf false` so staged bytes are recorded bytes): the HUMAN writes and
  stages a known multi-line file (§28 keeps staging human), one counting spawn wrapper
  watches three separately-keyed hosts (commit/log/show — the show host cannot borrow commit
  power), and the granted arc runs `git.commit → git.log → git.show` asserting
  `addedLines` BYTE-EQUAL the staged lines (quotes, double spaces, the §60 banner included)
  and that re-joining them reproduces the staged file byte for byte; a second commit touching
  one line reads back `+1 −0` only; a DENIED show costs 0 spawns while the landed history
  stands; the rev-shaped path token reads back nothing and prints none of the other
  commit's content; escaping cwd is a stated refusal; and the proof's own direct `git show`
  bytes parse through the SAME `parseShowDiff` — no second implementation. §9: home repo
  HEAD byte-identical, temp repo removed in `finally`.
- runtime 232/232 and studio 105/105 UNCHANGED (planner, orchestrator and the dock never
  moved — the plan tail stays v38/v39's; `git.show` is a tool a human or a later policy
  wires); exec-host 71/71 → 90/90 (NEW gitShowTool.test.ts, 19 cases); thirty-first proof,
  33 scripts green.

## Amendment 43 — v43 (exec-host): staged-intent awareness — the agent can read what a human MEANT to record, before it is recorded, 2026-09
- **The gap was structural, not incidental:** v35's `git.commit` records the STAGED index
  and §28/§9 keep staging a human act, so the bytes an agent commits are chosen by a person.
  But NOTHING in the stack could read the index — v32's policy allows `git diff`, and plain
  `git diff` compares the working tree TO the index, so a change that is only staged shows as
  NOTHING. `agents/exec-host/src/gitStagedTool.ts` opens that window: `gitStagedPolicy`
  allowlists exactly TWO argv shapes, `['git','diff','--cached']` and
  `['git','diff','--cached','--stat']` — no paths, no flags, no refs. The narrowness is not
  tidiness: `git diff` gains powers from options this policy will never name, and
  `--ext-diff`/`--textconv` make git EXECUTE a configured helper (code execution wearing a
  read-only costume) while `--output=<file>` makes a "read" WRITE a file. Read-only by argv,
  still a real process, so `permissions:['exec']` and the §28 gate still speak first — a
  denied intent read costs zero spawns.
- **The answer is the CHANGE KIND, stated by git:** `parseStagedDiff` (the tool's own code,
  §8) → `StagedIndex{files[{path, change: added|modified|deleted|renamed|copied, hunks,
  additions, deletions, addedLines, binary}], counts, totals}` — kind comes from git's own
  metadata lines (`new file mode`, `deleted file mode`, `rename from`), never from memory or
  guesswork; `tallyStagedCounts` speaks in canonical order so the sentence does not jitter
  with object key order. v42's `parseShowDiff` reads ONE file's diff body; the whole index is
  several such bodies and asks a different question (which files is a human about to record,
  and as what), so it is a distinct parser, not a second implementation. An EMPTY index is
  the answer that matters most before a commit and is spelled out: *"the index is EMPTY —
  nothing is staged, so a granted git.commit right now would have nothing to record"*.
- **32nd proof `docs/evidence/agents/staged-proof.mjs` measures the gap, then closes it,** in
  a throwaway `os.tmpdir()` repo (`core.hooksPath`/`commit.gpgsign`/`core.autocrlf false`
  neutralized LOCALLY there): a HUMAN writes and stages a known 3-line file, and the real
  `git.diff` door reports **0 files** while `git.staged` reports 1 `added` change whose
  `addedLines` are BYTE-EQUAL `git show :intent.md` (the index's own bytes, read the way a
  human would — precisely because the agent's door must not be able to). Then the same file
  is edited WITHOUT staging: the two doors are complementary, not redundant — `git.diff` sees
  only the unstaged +1, `git.staged` still recites the staged three. The §28-gated commit
  records the INDEX (not the edit), `git.staged` then says EMPTY, and v42's `git.show` reads
  back the same 3 lines the intent door quoted BEFORE the commit: two doors, one truth, one
  read on each side of the write. Refusals all cost zero processes and move no history —
  vetoed at the checkpoint, jailed at the cwd, and refused at the SPEC (`path` is not a
  declared arg, so a `HEAD~1:intent.md` smuggling attempt never reaches the policy). §9:
  home repo HEAD byte-identical, temp repo removed in `finally`.
- exec-host 90/90 → 110/110 (NEW gitStagedTool.test.ts, 20 cases); runtime and studio
  UNCHANGED at the committed baseline (232/232, 105/105 — the planner, orchestrator and dock
  never moved; `git.staged` is a door, not a plan step). Honest bounds: this is a POLICY
  sandbox, and the repo's own working tree was never the target — every write landed in
  `os.tmpdir`. A concurrent session is mid-flight in `agents/runtime` (its `inspect-proof.mjs`
  is red in the working tree at the time of this commit); this amendment claims 43 and its
  plan-side content confirmation takes 44.

## Amendment 44 — v44 (runtime): content confirmation IN THE PLAN — the loop walks through the door v42 built, 2026-09
- **A door nobody opens is not a capability:** v42 shipped `git.show` and v43 shipped
  `git.staged`, yet the PLAN still stopped at v38's hash confirm — the content read-back
  happened only because a human, or a proof, called the tool by hand. `planTask` now takes
  `hasContent` and the orchestrator detects it (`registry.has('git.show')`), so a green run's
  own plan ends `verify → commit → confirm → inspect`. The runtime gained no new power here:
  it gained the habit of using a power the exec host already confined.
- **Position is still the safety, and the nesting is exact:** the `inspect` step is pushed
  INSIDE the `hasConfirm` block and BEFORE `hasRemember` — unreachable without a verified
  green, a commit and a hash confirm, while `remember` stays the plan's tail. Pull any earlier
  tier and the content step vanishes with it (asserted both directions in the planner test).
- **The plan proposes a SOURCE, never an answer:** the step carries `{ path: target }`, i.e.
  `@search.hits.0.path` unless the task named its own file — the same live dataflow ref
  `read`/`annotate` resolve at invoke time. So the planner never hard-codes a path it cannot
  know, and what git prints is decided by what the run actually found and what a HUMAN actually
  staged (v35's staging boundary untouched; PUSH still out).
- **§60 bound kept deliberately:** `memory.save`'s summary still says COMMITTED+CONFIRMED and
  asserts NOTHING about content. The remembered claim stays exactly what v39 could prove; WHAT
  landed lives in `results`, `events` and the ledger, where the tool's own words are — not in a
  sentence the planner wrote in advance. A unit test guards the word: the summary never says CONTENT.
- **33rd proof `docs/evidence/agents/inspect-proof.mjs` runs the REAL loop** (`runTask`, not a
  hand-invoked tool) over THREE keyed doors in a throwaway `os.tmpdir()` repo
  (`core.hooksPath`/`commit.gpgsign`/`core.autocrlf false` neutralized LOCALLY there). 2a:
  callIds end `commit→confirm→inspect`, FOUR §28 gates fire (`test.run`, `git.commit`,
  `git.log`, `git.show` — every exec-armed step is its own ask, the reads included), and
  `addedLines` are BYTE-EQUAL the three lines a human staged, with the live argv
  `show --format= -- notes/widget.md`. 2b: a denied `git.show` costs 0 spawns while the
  landed, hash-confirmed arc STANDS in results. 2c: a planned path that never reached the repo
  completes carrying git's EMPTY DIFF as data — `hunks/additions/deletions` all 0, `addedLines:
  []`, detail stating its own emptiness. 2d: red spends none of the tail. 2e: the NON-zero git
  answer is produced by a real process in a SECOND unborn-HEAD throwaway repo (exit 128 as
  `ok:false` DATA, one pinned argv) — a state the loop cannot reach at `inspect`, because its
  own granted commit would already have created HEAD. Section 3: the ledger replays record,
  hash AND content to a cold reader, `rev-list --count` says exactly 4, both temp repos are
  gone in `finally`, and home HEAD stays byte-identical (§9).
- **Running the proof paid an honesty debt owed by v42:** `git show --format= -- <unmatched>`
  does NOT print `fatal: pathspec … did not match any files`. After `--`, git 2.52 resolves the
  pathspec loosely and exits **0 with an empty diff**, so the empty-diff detail could not claim
  the path "is in history" (git cannot tell that case from a path that never existed). It now
  reads *"HEAD touches nothing at `<path>` (empty diff — git recorded no change for this path in
  HEAD)"*, and the unit fixture that hand-wrote a 128 line now carries git's REAL
  unborn-HEAD fatal. Amendment 42's sentence about a "pathspec refusal" is SUPERSEDED by this
  one. No behavior changed — only what the tool is allowed to SAY.
- runtime 232/232 → **239/239** (1 planner + 6 orchestrator cases); exec-host **110/110** and
  studio **105/105** UNCHANGED at the committed baseline (v42's wording fix replaced 2 tests
  with 2 tests; no new door, no policy change). Thirty-third proof, 35 scripts green. Honest
  bounds: this is still DEMO MODE template planning — the tail is a fixed template, not a
  model's decision; `git.show` reads HEAD's change for ONE path in ONE policy-rooted repo; the
  agent still cannot stage, and a red or denied run never reaches any of it.

## Amendment 45 — v45 (runtime): intent before the ask — the plan reads the index it is about to be asked to record, 2026-09

- **A door nobody opens is not a capability.** v43 built `git.staged` and left it hand-invoked
  ("a door, not yet a plan step", its own README words). This amendment moves it into the PLAN:
  `PlannerOptions.hasStaged` inserts a `staged` step (tool `git.staged`, args `{stat:false}`)
  INSIDE the hasCommit block and IMMEDIATELY BEFORE the commit push, so a green run's tail reads
  verify→staged→commit→confirm→inspect→remember and the §28 ask to RECORD is preceded by the
  agent's own read of what the human put in the index. Every other nesting holds: pull verify or
  commit and the read vanishes with them; a host without the door gets the v44 plan
  byte-for-byte (asserted both ways).
- **Why the position carries the meaning twice over.** Forward: refusing the READ stops the walk
  BEFORE the write — a human who withholds the intent also withholds the commit, at zero spawns,
  with history untouched and the staged change still sitting unrecorded where the human left it.
  Backward: git's own answer to a refused commit is the FIRST line of its output, and for an
  empty index that line is `On branch master` — a header, not a reason. The sentence that
  explains the refusal is the one the plan spoke one step earlier: *"the index is EMPTY — nothing
  is staged, so a granted git.commit right now would have nothing to record."* The read exists
  precisely because the write's answer is not enough.
- **A §60 finding, fixed rather than filed.** 2c runs the static plan against an EMPTY index with
  everything granted: the loop walks into the commit anyway, git exits 1 as `ok:false` DATA,
  `record` is absent, `rev-list --count` does not move — and v39's planned summary asserted a
  landing. That has been a false claim since the day a human staged nothing; nobody had run it.
  The sentence is now `ARC-COMPLETE (DEMO MODE · seed N): goal "…" — verify, git.commit and
  git.log all ran under §28; whether anything LANDED is git's own answer, in this run's results`.
  Position may claim an ARC; only git may claim a commit. `remember-proof.mjs` (v39's) was
  re-greened on the new wording, and the tests that pinned the old one say why.
- **No control flow moved.** The orchestrator gained exactly one capability detection
  (`hasStaged: registry.has('git.staged')`); v36's green-walk executes the new step because it
  walks the plan, and a `git.staged` that answers EMPTY is DATA, not a branch — the demo planner
  has no conditionals, and this increment says so in the open rather than smuggling an `if` into
  the loop. The human at the gate IS the conditional; that is §28's whole design.
- **34th proof `docs/evidence/agents/intent-proof.mjs`** runs `runTask` itself over FOUR keyed
  doors in a throwaway `os.tmpdir()` repo (hooks/signing/autocrlf neutralized LOCALLY there).
  2a's money assertion is a three-way agreement: the `addedLines` the plan read out of the index
  BEFORE the commit are byte-equal the lines `git.show` returns AFTER it, byte-equal what the
  human staged — with FIVE §28 gates firing (`test.run`, `git.staged`, `git.commit`, `git.log`,
  `git.show`) and the first git process of the tail being a diff of the INDEX (`--cached`, with no
  pathspec — the whole index, not one path the agent chose). 2b:
  denied read ⇒ zero spawns and zero commits. 2c: the empty index above, its confirm step
  honestly reading back 2a's hash because nothing new landed, and the remembered sentence
  claiming only the arc. 2d: red spends none of the tail. Section 3: the cold ledger replays
  both ends of the agreement in the executed order `git.staged→git.commit→git.log→git.show`;
  `rev-list --count` ends at 2 (human seed + 2a), both throwaways gone in `finally`, home HEAD
  byte-identical (§9).
- runtime 239/239 → **246/246** (1 planner + 6 orchestrator cases, one of them pinning the
  EMPTY-index limit in the unit face too); exec-host and studio UNCHANGED by this amendment —
  no tool, policy or UI file moved, because the door was already built and only the PLAN changed.
  Thirty-fourth proof; the 36-script sweep green against this commit's own tree, and the proof
  asserts an argv SHAPE (`diff` … `--cached` … no pathspec) rather than exec-host's current flag
  list — the door's exact argv is its own contract tests' business, so hardening the door cannot
  silently redden a plan proof, and a plan proof cannot launder a door change into a green.
  Honest bounds: DEMO MODE template planning still, and
  now visibly so — the read is unconditional, so an empty index still walks into a refused
  commit; the agent reads the index and never writes it; and v45's remembered sentence is
  deliberately weaker than v39's, because it is the first version that is always true.

## Amendment 46 — v46 (exec-host): the environment is part of the policy — the argv shape confined what git may SAY, this confines what git may DO, 2026-09

- **A perfectly-shaped argv is not a safe command.** v29–v43 confined the process thoroughly:
  exact tokens, `'*'` only in argument positions, cwd jailed to the policy root, budgets clamped,
  secrets dropped from the env. None of that confines what git *decides to do* with a command that
  passed every check, because git consults config this process never chose to read —
  `~/.gitconfig` (reached through the `HOME`/`USERPROFILE` we must pass through or git cannot run
  at all) and the repository's own `.git/config` and `.gitattributes`, both of which §9 puts
  off-limits. Measured against real git 2.52 on this machine, with **exit code 0 throughout** — the
  failures were silent, not loud: `[diff] external = <program>` made `git diff` and
  `git diff --cached` *execute* that program and return an **empty** answer, so the agent's read-only
  door reported "0 files" about a dirty tree while running code; `[core] fsmonitor = <command>`
  made `git status` run a command mid-scan; `[core] excludesFile` pointing at a file of `*`, and
  `[status] showUntrackedFiles = no`, both hid untracked files from a "complete" status.
- **Two layers, because they cover two different sources — and the proof names which layer closes
  which hole.** Layer one is the ENV: `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` aimed at a path that
  does not exist (naming a file git cannot open is how you tell git to read NOTHING from a source),
  plus `GIT_CONFIG_NOSYSTEM`, `GIT_ATTR_NOSYSTEM`, `GIT_PAGER=cat`, `GIT_TERMINAL_PROMPT=0` and
  `GIT_OPTIONAL_LOCKS=0`, plus git's own counted override (`GIT_CONFIG_COUNT` /
  `GIT_CONFIG_KEY_n`/`VALUE_n`) forcing `core.fsmonitor=`, `core.excludesFile=`,
  `core.attributesFile=`, `status.showUntrackedFiles=all`. Measured: that override does beat
  repo-local `.git/config`. Measured, and stated in the proof's own output, what it does NOT beat:
  **repo DATA** — §3a runs the *shipped* hardened env against v42's own `git show` shape in a repo
  whose committed `.gitattributes` names a diff driver whose `textconv` is a command, and the
  command **still executes** and the diff comes back **empty**. Layer two is the argv shape, and
  that is the only thing that reaches this hole.
- **Two of my own assumptions died in measurement (§60).** 1) `git show --format=` is *immune* to
  `[diff] external` (added and modified paths, measured) — the first draft of the tool's header
  claimed otherwise and was rewritten. It does honour a `.gitattributes`-named driver, so
  `--no-textconv` is not decorative insurance for the content door; it is the only defence it has.
  2) `textconv` fires only on files git treats as **binary**, which is why three probes looked like
  a negative result before the fixture was right. Pinned, a binary change now reports
  `binary: true` with `addedLines: []` and a detail that says BINARY — it does not invent text
  lines to fill the gap.
- **`diff.external` is deliberately ABSENT from the forced-config table**, because measurement
  found no inert value for it: empty makes `git diff` exit 128 (git re-invokes itself as the
  "driver"), and `true`/`false`/`none`/`default` each change the diff's bytes. So that key is
  confined by the shape instead — and `gitEnvIsolation.test.ts` asserts its absence from
  `GIT_FORCED_CONFIG` while the door tests assert `--ext-diff` plans as default-deny, so nobody
  "fixes" the hole back into the env and nobody forgets which layer owns it.
- **No opt-out, by construction.** `gitEnv()` is applied at tool *registration*, not per call: a
  caller passes secrets in and gets `PATH`/`SYSTEMROOT`/`HOME`/`USERPROFILE` back, scrubbed, plus
  the isolation. The allowlist and the emitter are derived from the same modules, so they cannot
  drift apart silently — `planExec` is asked to plan every door with `gitEnv()`'s own output and
  asserts `plan.env` is byte-identical to what was emitted, with the injected `GITHUB_TOKEN` in
  `droppedEnv`, and `GIT_CONFIG_COUNT` equal to the size of the forced table. `existsSync` of the
  absent-config path is asserted `false` (the trick is that the file is not there).
- **What did not move: nothing the human relies on.** No new tool, no new gate, no runtime or
  studio file. Five doors, five policies, five keyed hosts, every exec still a §28 ask. The
  hardening is invisible to a clean repo — the new argv are the old ones plus two no-flags, and
  §5 asserts `.git/index`'s mtime is unchanged by three more reads (`GIT_OPTIONAL_LOCKS=0`) and
  that the file the human staged still has its original bytes. Push is still out; staging is still
  a human act.
- **exec-host 110/110 → 123/123** (new `gitEnvIsolation.test.ts` at 11; the five door suites now
  allow only the hardened shapes and pin the pre-v46 ones as *default-denied*, so a loosening
  cannot pass as a refactor). runtime and studio unchanged. **35th proof
  `docs/evidence/agents/config-proof.mjs`** runs both faces in one throwaway `os.tmpdir()` repo:
  §2a is a *legacy control* — v43's exact argv with v43's exact 4-name allowlist against a hostile
  `.git/config`, which is the bug reproduced on the record (exit 0, empty stdout, tripwire files
  from two doors, an untracked file vanished) — and §2b runs the shipped doors in the same repo to
  the opposite result: 5 pinned processes, **0 programs executed**, diffs byte-equal to the clean
  diff captured from the same repo after the config is cleared. §4 repeats the trick for a hostile
  `$HOME/.gitconfig`, each face asserting its own tripwire outcome so the control cannot quietly
  become the test. Four already-committed proofs (`git-aware`, `staged`, `show`, `inspect`) were
  re-greened under the new argv because they pin argv strings — which is exactly the cost a door
  hardening should have to pay in writing rather than in surprises. 37-script sweep green. Honest
  bounds: this confines git's *config-reading*, not git itself — it is still a real process with
  real filesystem access inside a policy-rooted cwd, not a syscall sandbox; the vectors closed are
  the four measured here on git 2.52 (a future git that reads a new source could open a new hole
  no test in this repo would notice); the proofs run against whatever `git` is on `PATH`; and the
  agent's *conclusions* from a clean diff are still only as good as the repo it was pointed at —
  the env makes the read trustworthy, it does not make the repository honest.

## Amendment 47 — v47 (runtime): the arc gains a role — ten amendments of git doors that no scoped role could see, 2026-09

- **The hole was structural, not cosmetic.** v36–v45 nested four §28-gated doors into the plan and
  v46 confined the environment behind them, but §24's role pack — the face the pipeline, the chain
  and the Studio dock actually run — granted `git.*` to NOBODY. `DEMO_ROLES` was
  researcher/designer/qa/editor/archivist, and none of the five names a git tool, so
  `roles.scopedRegistry(anything, host).has('git.commit')` was `false` for every role in the
  project. A chained run could research, brief, check and annotate forever and could not read an
  index, commit anything, or read a word back: the most powerful thing the runtime had learned to
  do was invisible to the abstraction the docs describe as "who is allowed to do what" (§24).
  Widening `editor` was the wrong fix — it would hand commit power to every chained run by mere
  presence, which is the opposite of §28's "explicitly asked for".
- **The order moved into DATA before the capability was added.** `gitArcDoors(present)` now owns
  the nesting that lived inline in `planTask` (no commit door ⇒ no arc; the intent read precedes
  the commit it informs; the hash trails the commit; the content trails the hash),
  `gitArcSteps({present,message,showPath})` owns the step objects (stepIds, args, rationales), and
  `runGitArc(registry, opts)` walks them through ANY registry. `planTask`'s git block is now a
  call to that module, and the `agent.test.ts`/`gitArc.test.ts` anti-drift case runs the SAME
  eight presence combinations through both faces and requires `deepEqual` — so the two ways of
  reaching a door cannot disagree silently. `runGitArc` invents nothing: doors absent from the
  scope are absent from the walk (§24), a `git.show` with no live path is dropped **with a note**
  ("a path the walker invented would be a guess"), each door keeps its own `callId`
  (`<run>:release:<step>`), and the SAME `Checkpoint` answers every ask — one gate per door, never
  one for the arc.
- **One owner, four doors, nothing else.** The new `releaser` role's `allowedTools` is exactly
  `GIT_ARC_TOOLS`: no `git.add` (staging stays the human act of v35), no push (out of scope by
  design), no `memory.save` — so the arc cannot journal its own success; the HOST records it into
  §26 and governance stays outside the actor. The role's grant is asserted to be *the arc and only
  the arc*, and every other role is asserted to see no door at all.
- **Opt-in, because commit power is never granted by mere presence.** `ChainOptions.release?:
  boolean` adds a fifth stage AFTER the v22 editor handoff; absent, the chain is the v14/v22 chain
  byte-for-byte — same three handoffs, no `release` field on the result, zero git processes
  (asserted in the unit face, in `rolechain-proof.mjs`'s new non-interference block, and against
  real git in 3c of the new proof). A chain whose editor stage did not END `completed` gets
  `status:'no-arc'` naming that status and spends not even a §28 ask: position, not permission,
  refused it — the same safety the plan face has had since v36, arrived at by a different route.
- **§60: the arc is a stage, not an edit to somebody else's plan.** `runGitArc`'s results are NOT
  merged into `editorOutcome`; the editor never had git in its scope, and back-filling its plan or
  results to make the story look complete would be a false record of what that stage planned. The
  proof asserts the absence from both sides (no `git.*` step in that plan, no `git.*` result, while
  the release's own four results are on the page), and `evaluation.score` still measures only what
  the editor did.
- **36th proof `docs/evidence/agents/role-arc-proof.mjs`** runs `runRoleChain` itself over the four
  REAL keyed doors in a throwaway `os.tmpdir()` repo whose `docs/widget.md` deliberately shares a
  path with the chain's in-memory corpus — so the path the arc reads back is the one the chain's
  own research handed it, not one this proof chose. 3a is v45's three-way agreement reached the
  OTHER way round: the lines a scoped ROLE pulled out of the index before the commit are byte-equal
  the lines `git.show` returns after it, byte-equal what the human staged, with four git gates
  firing, four processes spent, `rev-list --count` moving by exactly one, and the handoff tail
  reading `editor→releaser` then `releaser→host` via `git:staged→commit→confirm→inspect`. 3b vetoes
  the content door: the walk stops, the already-granted commit STANDS as history (a later veto does
  not roll back an earlier grant — §28 answers doors, one at a time), the refused door was still
  ASKED, and exactly one process is spared. 3c runs the same host WITHOUT `release`: three
  handoffs, no field, zero processes. 3d stages something for a red chain and shows a failed run
  spends no ask, no process and no commit, leaving `git diff --cached --name-only` still naming the
  human's file. 3e: a host with no doors gets `no-arc` saying *"the arc belongs to no role by
  absence (§24)"*. Home HEAD byte-identical, throwaway deleted in `finally` (§9).
- runtime 246/246 → **279/279** (new `gitArc.test.ts` at 22 — nesting table, the two-face anti-drift
  loop, walker order/callIds, one-gate-per-door, denial stops, the PARITY case where a granted door
  returns git's red answer as DATA and the walk continues exactly as the plan face does, plus
  skipped-content notes; `roles.test.ts` +3 (7 → 10) for the new owner and the arc walked through the
  releaser scope but refusing to exist in the editor scope; `chain.test.ts` +8 covering the fifth
  stage's opt-out, green walk, live-path derivation, red refusal, mid-arc veto, doorless host and
  §60 non-folding). `rolechain-proof.mjs`'s role-id pin moved with the pack — a proof that refuses
  to notice a new role would be asserting a fiction. exec-host and studio UNCHANGED by this
  amendment; no door, policy or dock file moved, because the doors were already built and only
  their OWNERSHIP and a second walking face are new. Thirty-sixth proof; 38-script sweep green.
  Honest bounds: `release` is a host flag, so a chain that does not set it still cannot commit —
  the capability exists but nothing in the Studio dock asks for it yet (§60: the dock has no
  release button, and this increment does not pretend it does); the role face has no `remember`
  door, so a chained release is journalled by the host's record rather than by a plan step; the
  arc's results ride on `ChainResult.release` and are not (yet) appended to the ledger, so a cold
  reader of `nexus-ledger.jsonl` sees the editor's run and not the stage after it; the proof's four
  doors are the real sandbox tools but the corpus is an in-memory workspace, so the shared-path
  trick proves the arc reads the path it was handed, not that a chained agent can find a real file
  it has never been shown; and DEMO MODE still plans by template — v47 moved an order into data and
  gave it an owner, it did not make the runtime decide anything.

## Amendment 48 — v48 (exec-host): budgets that bite — a cut answer may only speak in WHOLE lines, 2026-09

_Sequencing note: this is the exec-host lane the concurrent runtime slice (amendment 49) reserved
48 for. It is orthogonal to that lane — it touches no runtime or studio file — but it moves what
every git door says, so proofs from v30 onward are re-read below rather than assumed green._

- **The numbers were always right; the sentence was wrong.** v29 put two budgets in every plan and
  v30 made the host honour them to the byte, and the unit tests checked exactly that. Nobody asked
  what the AGENT HEARD when a budget bit. Probing real git for this amendment answered it the ugly
  way: a `maxOutputBytes` landing inside a line made a truncated `git.staged` hand back
  `addedLines: ["staged line 01 \ufffd"]` — a line no human staged and git never printed, complete
  with a replacement character, counted as content by v43's parser and shown to a human one step
  before a §28 ask to commit it. Measured, §2 of the new proof: at **16 budgets that land inside a
  line (8 of them inside a single CHARACTER)** the pre-v48 prefix invented a bogus staged line at
  every one — 16/16 — while the shipped door claimed only whole staged lines, in order, as a
  PREFIX of what the human staged, at all sixteen.
- **Two independent defects, not one.** The byte cap was not the only liar: `run()` decoded each
  chunk with its own `toString('utf8')`, so any multibyte character straddling a pipe-chunk boundary
  became U+FFFD even with **no budget pressure at all**. §3 measures it with the cap RAISED past
  the output (4 MB against a ~107 KB diff, so the decoder is on trial, not the budget): the read
  arrives in ~10-15 real chunks, re-joins byte-for-byte equal to `git show :big.md`, and decoding
  each chunk on its own is computed HERE and shown to differ — the corruption is not hypothetical.
- **Fixed at the one layer that owns budgets.** `ExecHost.run` now accumulates raw `Buffer`s,
  decodes ONCE at the end, and trims a stream that lost bytes back to its last newline. Not N
  parsers: only the layer that drops bytes knows a drop happened, every parser downstream is
  line-based, and a fifth door added later inherits the guarantee for free. An UNcut stream keeps
  its final unterminated line (git's own output normally ends in `\n`; the difference is pinned in
  `execHost.test.ts`), and the cap is shared across both streams, so the per-stream cases are
  pinned too: `stdout 'abcd\n'` survives while a starved `stderr` says nothing.
- **§60, turned on my own fix: a cut is not an absence.** Trimming to whole lines can leave NOTHING
  to parse — and three doors read "zero lines" as a fact about the repository: `git.staged` declared
  "the index is EMPTY — nothing is staged", `git.show` declared "HEAD touches nothing at <path>",
  `git.log` declared "(empty log)". Each of those is the exact opposite of what a starved budget
  means, and the first is a sentence a human weighs before approving a commit. So `gitTools.ts`
  exports one shared `cutNotAbsence(what)` and all three now answer *"no complete line survived the
  output budget — this is NOT a statement that …"* when (and only when) `truncated` is set. §2b
  measures both halves against real git through the same door in the same repo: a 4-byte budget
  (`diff`, no newline) names the cut, while a genuinely clean index — no budget pressure — is still
  stated EMPTY, in the old words, with no budget wording attached.
- **What did not move: no number, no argv, no gate.** Door defaults are still 65_536 bytes and
  10_000 ms (§1 asserts it, and asserts a rule can still never raise its own cap above the policy
  ceiling); every argv shape is byte-identical to v46's; no tool, role, plan step, runtime or studio
  file changed; the timeout still kills with SIGTERM and still relays `exit null` rather than
  inventing a code. `git.status`/`git.diff` keep their "0 entries"/"0 files" wording on purpose —
  those are counts of lines that survived, and they carry the `output truncated at budget` flag
  beside them, which is not the same claim as an empty repository.
- **One committed proof had to be rewritten, which is the point of writing it down.**
  `exec-host-proof.mjs`'s v30 case asserted `[stdout, stderr, truncated] === ['abcd','ef',true]` —
  the byte-prefix contract pinned AS the desired behavior, half a line presented as content. It now
  asserts `['ab\ncd\n','',true]` with the reason in a comment. A fix that leaves a proof asserting
  the old lie is a fix that will be reverted by the next person who trusts the proof.
- **38th proof `docs/evidence/agents/budgets-proof.mjs`** does all of the above with real git in
  `os.tmpdir()` (one human seed commit, `core.hooksPath` neutralized INSIDE the throwaway,
  `core.autocrlf=false` so staged bytes are the bytes git records), plus §4's timeout face: the
  SAME allowlisted vitest argv run twice — killed at 400 ms into a FAILING `TestReport` that names
  `killed at timeout budget (SIGTERM) · exit null` with `passed: 0` in ~0.4 s, then green under a
  180 s budget — so "the budget caused it" is a controlled comparison, not a story. 19 git/vitest
  processes spent in §2's arithmetic, all counted on the wire; home HEAD byte-identical; throwaways
  deleted in `finally` (§9). exec-host **123/123 → 130/130** (`execHost.test.ts` 15 → 19, plus one
  cut-is-not-absence case in each of the three affected door suites: `gitLogTool` 14 → 15,
  `gitShowTool` 19 → 20, `gitStagedTool` 20 → 21). Sweep note, stated rather than smoothed over:
  every script in `docs/evidence/agents` ran green on this tree, and that tree carried the
  concurrent lane's in-flight work — so the runtime/studio counts quoted there are the WORKTREE's,
  not this commit's; my lane is checked on its own at 130/130 so neither side inherits the other's
  red.
- Honest bounds: line-oriented trimming is correct for LINE consumers, which is every parser here —
  a command whose whole answer is one enormous line yields nothing at all under any cut (that is the
  starved case, and it is now worded as a cut); budgets are still shared across both streams, so a
  chatty stderr can starve stdout to zero, which the per-stream test pins but does not prevent; the
  timeout bounds OUR waiting, not the process tree — a killed `node` may leave grandchildren
  running, and no reaping is claimed; `exit null` is relayed, not explained; decoding is UTF-8
  single-shot, so a command in another charset is as wrong as it ever was (just never mid-character
  wrong); and DEMO MODE still plans by template — v48 made an answer honest about being short, it
  did not make the runtime decide anything.

## Amendment 49 — v49 (runtime): the arc survives its process — a role that committed left no trace a cold reader could find, 2026-09

_Sequencing note: amendment 48 is the concurrent exec-host lane (budgets that bite); this runtime
slice deliberately takes 49 so the two lanes cannot collide on a number, and the file may briefly
show a gap. History, not a mistake._

- **The hole was in v47's last honest-bound sentence.** A released chain wrote ONE ledger line: the
  editor's `RunOutcome`. That record contains no git step — correctly, because the editor's scope
  never held one — so a cold reader of `nexus-ledger.jsonl` looked at the audit trail of a chain
  that had really committed and found a run that searched, annotated and verified, and nothing else.
  The plan face has journaled every door since v36 (that is how `confirm-proof`/`intent-proof` can
  replay an arc at all); the role face journaled the arc's _summary_ into §26 memory and its _data_
  nowhere. Asymmetry between two faces of the same safety property is how an audit trail becomes
  decoration: the strongest record in the file was the one that was silent.
- **One stream, two record kinds — and nothing folded together.** The obvious cheap fix was to
  splice the arc's steps into the editor's `RunOutcome` before appending. Refused: that plan never
  contained a git step, and back-filling it would be a false record of what that stage planned —
  exactly the §60 line v47 drew. Instead `ledger.ts` now carries a discriminated record: a run line
  is written EXACTLY as v7 wrote it (no `kind` field, so every pre-v49 file still parses — asserted,
  not assumed), and `GitArcLedgerRecord`
  (`{kind:'git-arc', provenance, runId, goal, role, arc}`) is appended immediately after the run
  line it followed, joined to it by `runId`. `appendLedger`/`formatLedgerLine` widened to the
  union; `loadLedger` gained `arcs` beside `runs`; `last` now trims trailing **records** across both
  kinds, because "the last thing that happened" is a question about the stream, not about one shape.
- **A claim is not a record.** `parseLedgerLine` checks the arc's shape before believing it: a line
  whose `kind` says `git-arc` but whose `status` is not one of `completed|stopped|no-arc`, whose
  `doors|steps|results|notes` are not arrays, whose `role` is missing, or whose
  `provenance.mode !== 'demo'` is `{ok:false, reason:'not a complete git-arc record'}` and counts
  toward `malformed`. The discrimination is one-directional on purpose: a self-labelled arc is
  **never** re-read as a run (that is how a corrupt record would smuggle itself into a report), and
  a run-shaped line is never upgraded into an arc. `isArcRecord` is exported so consumers narrow
  instead of casting.
- **`RELEASE_ROLE`: the name in the ledger is the name the registry granted.** Who owns the arc was
  a string literal in three files. It is now one constant in `gitArc.ts`, next to the doors it
  names: `DEMO_ROLES` builds the releaser's `allowedTools` from `[...GIT_ARC_TOOLS]` and its `id`
  from `RELEASE_ROLE`, the chain scopes `roles.scopedRegistry(RELEASE_ROLE, host)`, and the durable
  record's `role` field is that same constant. A privilege can no longer drift from the walk it
  licenses, and no run can be journalled under a name the role pack never granted.
- **The REQUEST is journalled, not just the successes.** `release: true` writes an arc line even
  when the walk was refused: a red chain's line carries `status:'no-arc'`, `doors: []` and the
  reason naming the editor's status. An absent line would leave a reader to guess between "nobody
  asked for a release" and "the ask was refused" — the two are different facts about the human, and
  §28's history is exactly the difference between them.
- **37th proof `docs/evidence/agents/durable-arc-proof.mjs`.** §1 pins the contract on hand-written
  lines (pre-v49 run parses; arc round-trips; five tampered arcs each rejected with the reason
  quoted). §2 then runs `runRoleChain` itself over the four REAL keyed doors against a throwaway
  `os.tmpdir()` repo, with `fsLike` = the real `node:fs`, and reads the file back afterwards: 2a
  asserts the durable walk is `deepEqual` to the returned one (steps, callIds, git's own
  `exit 0` details) AND that the repository signs off on it — the durable commit hash compared to
  `git rev-parse HEAD` measured OUTSIDE the loop (abbreviated-vs-full, so `startsWith` with the
  length difference asserted too, per the v38 lesson), the intent read's `addedLines` and the
  content read's `addedLines` both byte-equal to what the human staged, and the run line still
  carrying no git step from either side. 2b vetoes the confirm door: the stopped arc is durable
  AS stopped — reason, per-door `ok` array and `doors.length === 4` (what the role COULD walk, so a
  shorter walk reads as a veto and not a missing grant) all survive, while the already-granted
  commit remains HEAD. 2c journals a red chain's refusal and shows it spends zero processes, zero
  commits and leaves `git diff --cached --name-only` still naming the human's file. 2d appends a
  forged arc line to the real file: `malformed` becomes 1, it surfaces in no array, and the three
  good arcs still load. 2e reads a v7-shaped single-line file back: `arcs` is `[]` and nothing else
  changed. Home HEAD byte-identical; the repo and the ledger inside it are deleted in `finally` (§9).
- runtime 279/279 → **290/290** (`ledger.test.ts` 3 → 7: arc round-trip, the five rejections,
  one-stream two-kinds with cross-kind `last`, the runId join and the on-record anti-fold;
  `chain.test.ts` 14 → 20: two lines in write order, anti-fold on disk, a stopped arc durable as
  stopped, a red chain's refusal journalled, no-`release` ⇒ v14 shape, append-only across two
  chains; `roles.test.ts` 10 → 11 for the derivation guard). `loadLedger`'s read shape gained
  `arcs`; every consumer outside `ledger.ts` reads `.runs`, and the thirty-six proofs that existed
  before this amendment stayed green untouched — an additive field, asserted by the seven
  pre-existing ledger-reading proofs (`changes`/`confirm`/`greencommit`/`inspect`/`intent`/
  `pipeline`/`remember`) rather than by a promise. exec-host, studio, all doors and policies UNCHANGED: no new capability, no new
  gate, nothing the human can see differently. Honest bounds: this journals what the runtime ASKED
  and what git ANSWERED, not what the human decided — the §28 receipts of v40/v41 still live on the
  dock's own face and are not written beside the arc, so a ledger reader sees a refusal's _effect_
  but not the decider's _reason_; the two-role `runRolePipeline` has no release stage, so it writes
  no arc line; nothing in the Studio dock reads `arcs` yet (§60: no panel pretends to); the `kind`
  discrimination is a shape check, not a signature — a writer that forges a COMPLETE arc record is
  believed, because the ledger's threat model is accident and drift, not adversary; and the
  durability proven here is "the bytes on disk replay correctly in a cold reader", already the same
  standard as v7's ledger — the cross-process face remains `pipeline-proof.mjs`'s.

## Amendment 50 — v50 (runtime): the durable arc names its decider — v49 recorded what git answered, this records what the human decided, 2026-09

_Sequencing note: this closes the bound amendment 49 stated about itself ("a ledger reader sees a
refusal's _effect_ but not the decider's _reason_"). It is the runtime lane's own work: no door, no
policy, no argv, no exec-host or studio file moved._

- **Two records that answered different questions.** v40 made §28 a table with a REQUIRED reason per
  row and a receipt per verdict; v41 put those receipts in the dock's memory. v49 put the walk in
  the file. Neither answered the other's question: `nexus-chain-ledger.jsonl` could show a
  `git.show` door with a red result and no output while saying nothing about whether a human clicked
  Deny, whether a row vetoed it, or WHICH row. `GitArcOutcome.decisions` is that answer, and it is
  this walk's own answer — the receipts for the four callIds it knocked on, in ask order.
- **Matched by CALL ID, not by tool name.** One chain gates the same tool twice: the editor stage
  can pass a `git.commit` ask that has nothing to do with the release stage's, and v40's face keeps
  a flat list. Filtering by tool would paste the earlier stage's yes onto the arc's door — a
  borrowed alibi, which is exactly what §60 forbids. `receiptsFor` (`gitArc.ts`) builds the set of
  callIds the walk itself issued (``${opts.callId}:${stepId}``) and keeps only those. §1 of the
  proof sets the trap and measures it: a face holding FIVE decisions, one of them an earlier stage's
  `git.commit`, yields FOUR on the arc line, each carrying the release prefix.
- **A copy, not a window.** Every receipt leaves the face through `structuredClone`, so a walk's
  durable record cannot be edited afterwards by the process that produced it. §1 asserts it by
  asking the face for one more door AND flipping `open.decisions[0].granted` after the arc returned,
  then comparing JSON snapshots: an audit trail is a snapshot of a moment, or it is nothing.
- **`[]` and "nothing to give" are different facts, so they are stated differently.** A durable walk
  whose checkpoint keeps no list (the live dock's Allow-once human is a bare closure) gets
  `decisions: []` plus a `notes` line naming the limit — `NO_RECEIPTS_NOTE`, exported so the sentence
  has one source. A walk that gated nothing (no doors at all) gets `[]` and NO note, because there
  was no decision to lose. `undefined` stays reserved for "not headed for the ledger".
- **Nothing is recorded unless it is stored.** `runRoleChain` passes `recordReceipts` only when BOTH
  `opts.fsLike` and `opts.ledgerFile` are present: a receipt nobody stores is a cost with no
  benefit, and the rule keeps the dock's in-memory chains byte-identical to v47/v49. Asserted twice,
  from both faces — `'decisions' in outcome === false` in `gitArc.test.ts`, and §2d running the same
  policy table with and without a ledger path.
- **The ledger refuses half a receipt.** `isArcShape` now validates `decisions` when present: an
  array whose every element carries a `call.callId`, a `call.tool`, a boolean `granted`, a
  `matched` and a `reason`. §1 feeds it four tampers (no reason, `granted: 'yes'`, a call with no
  callId, a string instead of an array) and each makes the WHOLE line malformed — a receipt without
  its reason is not a lighter receipt, it is not a receipt, and a reader must never be left to guess
  which one it got.
- **39th proof `docs/evidence/agents/receipts-proof.mjs`.** §2 runs the real chain over the four REAL
  keyed doors against a throwaway `os.tmpdir()` repo with a real `node:fs` ledger, and checks three
  sources against each other instead of against the runtime's own memory. 2a: four receipts line up
  one-for-one with the four doors, with the four git PROCESSES counted on the spawn seam, and with
  the commit hash compared to `git rev-parse HEAD` measured OUTSIDE the loop — and the content
  door's path is cross-checked against the search hit in the SAME file's run line, so the two
  durable records must agree or the proof fails. 2b vetoes `git.show` with a ROW and reads
  `matched: 'git.show'` and the human's sentence back verbatim, sitting beside the commit that veto
  could not undo, with three grants ahead of it and ZERO processes spent on the refusal. 2c closes
  the table: one ask, one receipt, `matched: 'default'` — the row nobody wrote a tool into still has
  to explain itself — and no spawn, no commit, the human's staging still unread. 2d hands the same
  walk a bare closure and gets the note instead of a name. 2e appends a forged receipt with no
  reason: `malformed` 1, it surfaces in no array, every receipt a cold reader DOES get holds a
  non-empty reason, and the four run lines around it keep loading. Home HEAD byte-identical; the
  repo and its ledger are deleted in `finally` (§9).
- runtime 290/290 → **305/305** (`gitArc.test.ts` 22 → 29, `chain.test.ts` 20 → 25,
  `ledger.test.ts` 7 → 10), every pre-v50 ledger still parsing (asserted: a v49 line has no
  `decisions` field and loads). Four files changed: `gitArc.ts` (the option, the field,
  `receiptsFor`, the note), `pipeline.ts` (one `durableArc` flag), `ledger.ts` (`isReceipt`),
  `index.ts` (export the note constant). v49's anti-fold still holds and is asserted on disk: the
  editor's run line gains no `decisions` either, because that plan never contained these doors.
  Honest bounds: receipts exist only when the host's face KEEPS a list, so a real Studio session
  running on the Allow-once human still journals the note rather than a name — closing that is the
  dock's lane (a release toggle is #100, and none exists), not this one; the shape check is still
  accident-and-drift defence and not a signature, so a writer that forges a COMPLETE arc line is
  believed; only the release walk carries receipts, so the editor's `fs.append` and `test.run` gates
  remain nowhere in the file; whether `ChainResult.release` has the field depends on whether the
  caller passed a ledger path, which is a real subtlety of the API and not a hidden one; nothing in
  the Studio dock renders `arcs` yet (§60: no panel pretends to); and DEMO MODE still plans by
  template — v50 made a decision auditable, it did not make the runtime make one.

## Amendment 51 — v51 (exec-host): the host journals its own outcomes — a caller could forget `appendExecRun`, this cannot be forgotten, 2026-09

_Sequencing note: this closes the bound v30 stated about itself. v30 shipped a JSONL writer
(`appendExecRun`) and a reader (`loadExecRuns`) and wired neither: the measurement that chose this
increment was a grep. `appendExecRun` had **zero** callers — only its own definition and a barrel
export — while `host.run` had **seven** call sites, all inside this package (`execTestRunner`,
`gitTools`, `gitCommitTool`, `gitLogTool`, `gitShowTool`, `gitStagedTool`, and the `exec.run` tool
itself) — so "which processes actually ran, and which did you refuse?" was only
inferable from parsing the doors' prose. No policy, no argv, no budget, no checkpoint and no door
file moved._

- **Journalling became a behavior of the host, not an API a caller may forget.** The fix is one
  closure (`audit`) inside the one function every process is born through, called from every return
  path in it. That is the whole design claim, and it is why the change is +88/−12 in ONE source file
  instead of one line in each of seven callers: a door added next month cannot escape a record that
  its own entry
  point writes. It is also why the option is `journal?: ExecJournalRef` and **default OFF** — the
  39 pre-existing headless proofs run hosts with no sink, so they are the assertion that nothing
  else moved (all 39 still pass, byte-identical output).
- **Every outcome is a record, refusals included.** A default-deny rejection, a `checkpoint required
  for exec (§28)`, a `checkpoint denied`, and a completed run are all events the host knows about
  and nobody else does. §3 of the proof asks for `git push` behind an **approving** checkpoint to
  separate the two doors: the human said yes, the policy said no, and the line that lands carries
  `rule: null, planned: false` and costs 0 processes. That is the record a reader most wants and the
  one a per-tool caller would most likely skip.
- **`ExecAuditRecord = ExecRunResult & { seq, rule }`, and the pair carries an invariant.** `rule` is
  the index into `policy.allow` that authorized the argv, and `null` **if and only if**
  `planned === false`. `isExecAuditRecord` re-checks that bidirectionally, so a line that claims a
  matched rule while saying nothing was planned is rejected rather than believed; `seq` counts from 1
  within one host instance and is incremented BEFORE the write, so a record that fails to land
  leaves a gap — which is what a gap should mean.
- **A sink that cannot write fails the CALL.** Loudly, on both paths, and with both facts in the
  message: `exec audit failed for "git commit -m …" (the process ran and exited 0; the record did
  not land)`. A host that was asked to keep an audit trail must not report success about something it
  could not record — the alternative is a green result and a silently missing line, which is §60 in
  the shape of a bug. Asserted against a throwing disk on the run path and the refusal path.
- **Compatibility is one-directional, and the direction is stated.** A v51 line still loads under the
  v30 reader (it is a superset; the extra fields ride past `isExecRunResult`). A v30 line does NOT
  load under the v51 reader — it has no `seq`/`rule`, so it is counted `malformed`. That is the right
  trade for a file with no product writers yet; it is not free, and a deployment that already has
  v30-era journals must keep the old reader for them.
- **40th proof `docs/evidence/agents/spawnlog-proof.mjs`.** One host holding six rules **derived from
  the four shipped policy factories** (`gitStagedPolicy`'s two, `gitCommitPolicy`, `gitLogPolicy`,
  `gitShowPolicy`, `gitReadOnlyPolicy`) — no flag string is re-typed here, so the proof stops being
  true on the same day the flag moves, which is the point. §2 walks a real throwaway `os.tmpdir()`
  repo through four REAL git processes and joins three sources: the journal's argv, a counting
  `spawnLike` wrapper's own sink, and the doors' returned records — `argv` byte-identical line for
  line, `rules [0,2,3,4]` with 2 of 6 rules measured as never used, and the five keys plus `rule`
  that exist ONLY in the host record (the door's caller-visible output has no `rule` at all, which is
  what makes the host the only complete witness). §4 is a cold reader with nothing but the file:
  contiguous `seq`, `malformed 0`, and the commit hash that `git rev-parse HEAD` reports from outside
  the sandbox appearing inside the host's own bytes. §6 states the cost honestly — 2357 bytes of
  journal for 642 bytes of captured output, under `os.tmpdir`.
- **§9 bit, and the lesson is in the proof rather than in prose.** The first draft of this journal
  lived inside the throwaway repo, so the file it was writing became an untracked file that git then
  reported about itself. Two things came out of that: the journal now lives in a sibling tmp
  directory with an assertion that it is NOT inside the repo it watches, and a sharper statement of
  what a door's failure sentence is worth (next bullet).
- **A door's one-line failure prose and the host's verbatim record disagree, on purpose, and the
  proof measures the gap.** A no-changes commit makes git print a banner then the reason;
  `git.commit` relays the FIRST line, so the caller reads `git.commit → exit 1: On branch master`
  while the journal keeps both lines. This increment leaves that prose asymmetry in place — it is a
  real limit of a door that quotes rather than summarizes, and quoting the verdict line instead of
  the banner is the next candidate here, not a silent fix buried in an audit increment.
- **What did not move:** no door, no policy factory, no argv, no env list, no budget, no checkpoint
  semantics; `loadExecRuns`' contract is unchanged for existing callers. exec-host unit tests
  130/130 → **137/137** (7 new: four-outcomes/one-process, record ≡ result + two fields, no-journal
  writes nothing, both compatibility directions, the throwing sink on both paths, two hosts on one
  file repeating `seq` because file order — not `seq` — is the record across hosts).
- Honest bounds: a §28 veto at the **registry** never reaches `host.run`, so it leaves no host line at
  all — that record is v50's ledger receipt, and the two files are deliberately not merged (§60: two
  subjects, one fact each; §5 of the proof asserts 0 lines and 0 processes for a veto). `seq` is
  per-host, so a shared file has repeated numbers by design. There is no clock: ordering is
  append-order, and a reader that needs wall time must add it outside this record. An argv the policy
  refused has `argv: []` with the refused command only inside `reason`, so a search for
  `"git push"` in the argv column finds nothing — stated, not hidden. Output is verbatim, so the file
  grows without rotation and can carry repo content: **location is an operator decision with a
  confidentiality consequence**, and §9's rule (outside any watched repo, in `os.tmpdir`) is what
  proofs use, not what a deployment must choose. Appending is read-then-rewrite, so a crash
  mid-write can cost the last line — inherited from v30 and unchanged. `rule` is an INDEX, so
  reordering `policy.allow` changes the meaning of old lines; a reader that needs permanence must
  re-derive rules from the shipped factories the way the proof does. And DEMO MODE is intact: nothing
  in Studio registers an exec host, so a journaled host exists in unit tests and proofs only — no
  panel shows this file, and none pretends to.

## Amendment 52 — v52 (exec-host): a door quotes what git MEANT, says how much of it it left out, and never reads a refusal or a notice as an empty repository, 2026-09

_Sequencing note: the concurrent runtime lane wrote amendment 54 while this one was still measuring;
52 and 53 were unclaimed by either lane at the time of writing (checked against this file's headings),
so this slice takes 52 and sits where the numbering puts it. No policy, no argv, no env list, no
budget, no gate and no host file moved — this is entirely about what the six git doors are allowed to
SAY about what git did._

- **Probed before designed, and the probe changed the shape of the fix.** Eleven real failure states
  were built in throwaway `os.tmpdir()` repos and run with the EXACT argv each shipped door uses
  (the harness plays the human: init, seed commits, staging, a real conflicting merge, a lock file, a
  truncated `.git/index`, a failing `pre-commit` hook). They sorted into three complaints, and only
  the first was the one queued for this increment:
  1. a refusal's REASON is the line git prefixes (`fatal:`/`error:`/`warning:`) — but the single most
     common refusal has no prefix at all. `git commit` over an unchanged tree answers, on **stdout**,
     `On branch master` / `nothing to commit, working tree clean`. Every door quoted line 1, so the
     sentence a human weighs at §28 was the banner;
  2. the two v32 READ doors quoted NOTHING on a nonzero exit. They parsed the empty stdout and
     returned a tally: a corrupt index answered `git.status → exit 128: 0 entries`, which reads as
     "clean";
  3. git can exit 0 and still not answer — see the notice bullet below.
- **One rule, exported once, used by every door.** `gitVerdict(stdout, stderr)` looks at stderr first
  (a conflicted commit puts its reason there and a status letter on stdout), folds git's own
  indentation, and returns `{line, rule, lines}` by four directional cases: `prefixed` — the earliest
  `fatal:`/`error:`/`warning:` line, because that is where git puts a diagnosis; `sole` — one line
  total is simply what git said; `last` — with no prefix, git's LAST line is the actionable summary
  and its first is a header; `none` — git printed nothing, which is stated as that and not as a
  reason. `quoteVerdict` then says how much of git the quote is NOT: `· git's last line of the 6 it
  printed`. Before this, four doors carried the same hand-rolled line-1 expression and two carried no
  quoting at all — six doors, seven sentences, one rule now.
- **A refusal is never a tally.** `refusedNotAbsence(what)` is the sibling of v48's `cutNotAbsence`,
  and it went on every door that returns parsed-empty data after a nonzero exit: `git.status`
  ("NOT a statement that the working tree is clean or empty"), `git.diff`, `git.diff --stat`,
  `git.staged`, `git.log` ("…that the repo has no commits"), `git.show` ("…that HEAD touches nothing
  at `<path>`"). The parsed arrays still ride along — the shape callers read did not change — but the
  sentence now says the zero is a count of what was refused, not a finding about the repository.
- **`exit 0` is not an answer either, and that one was found mid-increment.** In a conflicted index
  git exits 0 and prints a NOTICE in place of a diff. Three shapes, all measured: `git diff --cached`
  says `* Unmerged path file.md` and nothing else; `git diff --cached --stat` says ` file.md |
  Unmerged` then ` 0 files changed`; plain `git diff` emits a COMBINED `diff --cc file.md` body for
  which the v32 parser finds no `diff --git` header. All three parse to ZERO, and `git.staged` — the
  door v43 built and v45 put one step before the §28 commit ask, the door whose whole purpose is to
  tell a human whether there is anything to record — said **"the index is EMPTY"**. That is the exact
  opposite of the truth: an unmerged path is the one thing a granted commit cannot record. One shared
  detector (`unmergedNotice`) now covers all three shapes and the three diffing doors name the
  conflict instead of claiming absence.
- **42nd proof `docs/evidence/agents/verdict-proof.mjs`** (the concurrent lane took 41st for
  `runreceipts-proof.mjs` while this one was measuring). Every case has a CONTROL: the same argv is
  run RAW, outside the sandbox, by the harness, so each quote is checked against git's own bytes
  rather than against the door's memory of them. §1 banner → verdict, verbatim, and the banner
  asserted ABSENT from the caller's sentence. §2 the six-line refusal, plus a §28 DENY that costs no
  process and therefore no words. §3 a real `index.lock`: the door quotes the fatal line naming the
  lock file, the lock is still there afterwards (the door only spoke), and the SAME door over the
  SAME human-staged index succeeds once the human removes it — so the refusal was about the lock and
  not about the door. §4 one corrupt index, FOUR read doors, five assertions each, including the
  sharpest technique in the file: strip the disclaimer from the detail and no bare absence claim
  (`is EMPTY`, `clean`) may survive outside it. §5 the three notice shapes across three doors, with
  the conflict verified still-unresolved afterwards. §6 states the limit by measuring it: outside a
  repository `git diff --cached` degrades to `--no-index` mode and fails on the FLAG with a 132-line
  usage page, so the door quotes `error: unknown option \`cached'` and NOT "not a git repository" —
  a door relays git, it does not upgrade a relay into a diagnosis git did not offer (and two commands
  in the SAME directory produce two different git complaints, each quoted as git spoke it). §7 joins
  v51 to v52: one refusal, two memories — the host's record keeps the banner because a record that
  summarizes stops being one, the door's sentence drops it, and the two differing on purpose is the
  design. Home HEAD byte-identical; every repo deleted in `finally` (§9).
- **Two already-committed proofs pinned the old sentence and had to follow it** — v45's
  `intent-proof.mjs` asserted `git.commit → exit 1: On branch master` EQUAL, and v51's own
  `spawnlog-proof.mjs` asserted the reason was NOT in the caller's sentence. A proof that pins last
  week's wording undoes this fix, so both now assert the new one, with the reason for the change in
  the comment beside them. That is the second time this has happened in this lane (v48 reddened four
  proofs the same way) and it is the strongest argument for the README's rule that proofs quote
  SHAPE, not shipped strings — the two cases here are quoted prose, and prose is a shape too.
- **What did not move:** no policy factory, argv shape, env list, budget, truncation rule, checkpoint
  or ledger format; `ExecHost` is untouched (v51's journal is why §7 could be written at all); the
  runtime and Studio parse none of these sentences (checked by grep — the orchestrator relays `detail`
  as text), so no planned step changed. exec-host **137/137 → 159/159** (`gitTools.test.ts` 19 → 36,
  `gitStagedTool.test.ts` 21 → 24, `gitCommitTool.test.ts` 16 → 18, and two existing 128-cases in
  `gitLogTool`/`gitShowTool` extended rather than added), 42/42 agent proofs green, home repo gates
  green.
- Honest bounds: the rule reads git's ENGLISH diagnostics, and it works because v46's env pinning
  passes only `PATH`/`SYSTEMROOT`/`HOME`/`USERPROFILE` — a caller cannot hand git a `LANG` it would
  answer in, but neither has anyone measured a git built with translated messages; the quoted phrases
  in the door tests are git 2.52's bytes and will age with git (the proof cross-checks them against
  raw git in the same run precisely so a wording change reddens an assertion instead of silently
  changing what an agent reads); `prefixed` can name a symptom rather than a cause (§6's real case:
  the flag was fine, the repository was missing); v48 and v52 interact — if the budget trimmed the
  notice line away, no door can name it, and the truncation clause is what says so; `git.status` still
  labels an unmerged entry `other` (v32's honest junk-XY bucket) because naming it there would mean
  teaching the porcelain parser a new status family, which is a separate claim; the door relays one
  line and the host record keeps them all, so an audit reader who wants everything must read the v51
  file, which no UI shows (§60); and DEMO MODE is intact — no Studio surface renders a git door's
  sentence, and every repo here lives in `os.tmpdir`.


## Amendment 53 — v53 (exec-host): the output budget is PER STREAM — a limit may stop a pipe, it may not decide who gets heard, 2026-09

_Sequencing note: the runtime lane is at 54 and this lane took 52, so 53 was the gap between them —
checked against this file's own headings before claiming it. The policy NUMBER is unchanged; what
changed is what it means, where the memory goes, and what a door is allowed to conclude from an
empty answer._

- **The measurement first, because the bug was not visible in any door.** One real program, run twice
  through `ExecHost.run` with the same 4 096-byte budget: it writes 9 100 bytes to stderr and then
  4 000 bytes of answer to stdout. Written stderr-first the host returned **nothing at all on either
  stream** — stderr spent the whole counter, and v48's whole-line trim then discarded the partial line
  it had cut, so the answer that had not even been asked for was gone. Written stdout-first the same
  command returned the answer. Same argv, same cwd, same env, same ceiling: the outcome was decided by
  **which pipe flushed first**, which means the same command could answer differently twice in a row,
  and no test at any level above the host could have caught that by pinning expected strings.
- **One line of accounting, and the rejected alternative named.** `append` now measures a chunk
  against `budget - kept[target]` instead of `budget - keptTotal`. A split-with-lending design
  (half guaranteed to each, either stream free to spend the other's unused half) was implemented
  first and rejected by this file's own logic: a fast stream spends borrowed ground before the slow
  one reaches it, so a borrowed share is not a guarantee — it is the same race with better manners.
  The shipped rule is that each stream has its own ceiling and nothing another stream wrote can
  consume it.
- **The cost, stated as a number rather than as a footnote.** The host can now retain up to
  **2 × `maxOutputBytes`** where it retained `maxOutputBytes`: 128 KiB per run at the default 64 KiB,
  2 MiB where `execsuite-proof` asks for 1 MiB. The policy field, its default, its per-rule override
  and v29's clamp (`Math.min(rule.cap, policy.cap)`) are untouched — §4 of the proof asserts a rule
  still cannot raise its own ceiling, so what changed is the meaning of the number, not who may set
  it. Doubling a bounded bound is a real trade; it buys the property that a refusal to show output is
  never an accident of scheduling.
- **v52's verdict rule gets the half of itself the budget used to eat.** `gitVerdict` now takes
  `{ truncated }`, and when nothing survives AND the budget bit, the rule is `cut`: the door says
  *"no WHOLE line survived the output budget — git may have printed more; this is NOT a statement
  that it said nothing."* Without that, v52's own `none` rule produced the sentence `git.commit →
  exit 1: git printed no output at all · output truncated at budget` — two clauses that contradict
  each other, in the one line a §28 reviewer reads. This is the third member of a family v48 started:
  `cutNotAbsence` (a parsed tally), `refusedNotAbsence` (a git refusal), and now `cut` (git's words).
- **43rd proof `docs/evidence/agents/streams-proof.mjs`.** §1 runs the mute and its absence: both
  write orders, raw control outside the sandbox, and the old model **excluded by arithmetic on this
  run's own numbers** — 4 000 bytes kept on stdout plus 4 000 on stderr is 8 000 bytes against a
  4 096-byte ceiling, which a single shared counter cannot produce at all (this deliberately does not
  re-implement v30's counter to "win" the comparison; the totals say it). §2 measures the opposite
  worry: six shipped git reads at their real ceilings, `truncated: false` on all six, no cut or
  refusal wording anywhere — the change costs a well-behaved command nothing. §3 is a real refusal
  built the way a noisy tool misbehaves: a `pre-commit` hook that emits 20 000 bytes with **no
  newline anywhere**, at a ceiling that fits and one that does not; the second sentence says CUT,
  never "printed no output at all", and the host's own v51 records show the sharper truth — at the
  tight ceiling the RECORD holds nothing either, because the ceiling bounds what anyone downstream can
  ever see, which is exactly why the sentence has to say it. §4 asserts the stated worst case
  (≤ 2 × ceiling, both streams trimmed to whole lines) and the unchanged clamp. §5 runs the same
  command five times and asserts one outcome — a determinism claim the pre-v53 code could not honestly
  make. §6: everything under `os.tmpdir`, home HEAD byte-identical.
- **Two committed assertions encoded the shared counter, and both were rewritten in this commit.**
  `execHost.test.ts`'s "the cut is per-stream: starved stderr loses its partial line while intact
  stdout keeps its own" asserted, as its own expectation, the thing v53 removes — it now asserts that
  a 4-byte stderr is kept whole (`truncated: false`), with the old expectation quoted in the comment
  so the reversal is auditable. `exec-host-proof.mjs` §budgets asserted `['ab\ncd\n', '', true]` for
  the same reason and now asserts `['ab\ncd\n', 'ef\ngh\n', false]` plus a second case where the loud
  stream alone pays. That is the third increment running in this pattern (v46's flags, v48's byte
  prefixes, v52's sentences, now v53's totals): **an assertion that encodes the old contract will
  quietly undo the fix**, so the fix is not done until the old assertions are read, not just green.
- **What did not move:** no policy field, default, clamp, argv shape, env list, gate, checkpoint, door
  sentence (beyond the `cut` clause), timeout, journal shape or record kind. exec-host
  **159/159 → 163/163** (26 → 29 in `execHost.test.ts`, 36 → 37 in `gitTools.test.ts`), all 43 agent
  proofs green, and the four root gates green.
- Honest bounds: the worst-case retention doubles, and nothing in this repo makes that operator-settable
  per stream — an operator who needs the old total must halve the number they write; `truncated` is
  still ONE flag for two streams, so a caller learns that something was cut and not what that cost the
  other side (the two strings are the evidence, and a per-stream flag is a real future change rather
  than this one); a program that writes 30 KB on a single stream is still cut to its ceiling — v53
  stops one stream silencing another, it does not raise anybody's limit; the shipped git doors were
  **not** silently muted before this (git merges a failing hook's output onto stderr, and the real
  suite prints on stdout), which §2 measures instead of claiming, so the honest description of this
  increment is "the host is no longer order-dependent", not "a door was lying"; `test.run` is where a
  program with two busy streams is most likely to appear, and it inherits the fix without a change of
  its own; what the timeout actually stops — a killed parent with a living process tree — is still
  unmeasured and stays queued; and DEMO MODE is untouched: no Studio surface runs an exec host, so this
  whole file is enforced in unit tests and proofs, and nothing pretends otherwise.



## Amendment 54 — v54 (runtime): the run line answers for its own gates — v50 named this gap in its own last sentence, 2026-09

_Sequencing note: v50 closed v49's bound and, in the same breath, stated the one this increment
closes: "the editor's `fs.append` and `test.run` gates are still nowhere in the file, since the
anti-fold cuts both ways." A cold reader could ask WHO allowed the commit and get a receipt; the same
reader asking who allowed the WRITE that commit recorded got silence. Nothing about what the runtime
decided changed here — what changed is that the other half of the file is now answerable. No door, no
argv, no policy table, no checkpoint semantics and no planner template moved._

- **The rule was lifted, not copied.** v50's private `receiptsFor` (and its `NO_RECEIPTS_NOTE`
  sentence) moved out of `gitArc.ts` into `checkpointPolicy.ts` as `receiptsOrNote` + `gatedCallIds`
  (+9/−22 in the arc, +43/−2 in the policy module), and BOTH record kinds now call it. That is the
  design claim: if the run line and the arc line each had their own matcher, `decisions: []` could
  come to mean one thing on a line and another thing on the next, in the same file, with no reader
  able to tell. The same move replaced the chain's two separate durability questions with ONE
  `durable` flag in `runRoleChain`, which both the run line and the arc line now obey.
- **Ownership comes from the record's own transcript.** `gatedCallIds(registry, outcome.results)`
  asks, for each call this record actually made, whether the tool it names carries a
  `DANGEROUS` permission **in the registry that record acted through** — the editor's scoped view,
  never the host's wider set. Reads (`fs.index`, `fs.search`, `memory.recall`) therefore can never
  acquire a receipt, because §28 was never consulted for them, and a run line cannot claim a verdict
  on a tool its own role could not see.
- **`RunOutcome.decisions?` and `RunOutcome.decisionsNote?`, additive, with the three silences kept
  distinct** (empty list = gated nothing, which owes no explanation; empty list + the shared sentence
  = this face keeps no readable list; no field at all = pre-v54 or not headed for a ledger). The
  returned outcome IS the appended one — v49's identity, extended to the run face and asserted by
  `expect(run).toEqual(res.editorOutcome)`.
- **The ownership rule is now CHECKED on read, not only followed by construction.** `receiptsOwned`
  in `ledger.ts` makes a receipt whose call id is absent from that record's own `results` condemn the
  WHOLE line, for both kinds (`isRunOutcome` and `isArcShape` share it). Construction was already
  sound; construction is invisible to a cold reader, and v50's stated bound — "a COMPLETE forged line
  is still believed" — is closed for the paste variant by this. Tightening a gate an already-committed
  proof leaned on has a price, and it is paid in this same commit: `receipts-proof.mjs`'s §1 fixture
  had to learn to make the call it answers for (`results: []` beside a receipt is no longer a compact
  example, it is a paste), and its §2e tamper block grew a second forged line — `malformed 1 → 2`, one
  half-receipt and one complete-but-borrowed one.
- **The dock is byte-identical, from both directions.** `apps/studio/src` contains **zero**
  occurrences of `ledgerFile` (grep), and `agentDock.ts:303` hands the chain `memoryFile` + `fsLike`
  only — so `durable` is false and no new field exists to render. The runtime face asserts it too:
  an in-memory chain carries neither `decisions` nor `decisionsNote` nor a note in `release`.
- **41st proof `docs/evidence/agents/runreceipts-proof.mjs`.** §1 is the data face with no process:
  five calls of three permission classes yield three gated ids (so the reads are silent for a reason
  a reader can check), a face holding two decisions yields ONE receipt for the owned call (the
  paste-proof runs in both directions now, run→arc and arc→run), and the three silences are told
  apart. §2 runs the REAL chain over four keyed sandbox doors in a throwaway `os.tmpdir()` repo and
  triangulates SIX independent sources rather than trusting the runtime's memory: the durable run
  line, the durable arc line, the decider's own seven-decision list in ask order, the workspace the
  granted write actually changed, the git processes counted on the `spawnLike` seam, and the commits
  counted by `git rev-list` — plus the §26 memory file read cold off real disk, which names the
  editor's denial in its own words. The arithmetic is the headline: **7 face gates = 2 run receipts +
  4 arc receipts + 1 unowned brief**, asserted as a set equation, with the face's order pinned to
  `['rr-1:brief', annotate, verify, staged, commit, confirm, inspect]`. A vetoed `test.run` is
  durable with the human's sentence beside a grant it cannot erase, at 0 processes and 0 commits; a
  bare closure puts one exported sentence in `decisionsNote` on one line and `notes` on the next while
  the walk spends the same four processes and lands the same hash; and the whole file is re-read
  cold, with v54's invariant re-derived by the reader rather than re-asserted by the writer.
- **What did not move:** `runTask`'s control flow is untouched — the receipts are derived from the
  outcome at the append site, never inside the loop, so no call order, event or budget changed; the
  arc's door order and its four tools are unchanged; `git.log`/`git.show`/`git.status` and every
  policy row are unchanged; the 40 previously-committed agent proofs pass untouched except the two
  fixtures named above. Runtime unit tests 305/305 → **323/323** across 25 files (ledger 10→15, chain
  25→30, checkpointPolicy 8→13, pipeline 5→8; `gitArc.test.ts` 29 with an import move only, count
  unchanged), source diff +121/−37 across six files. Full sweep at this commit: 43 scripts (41 agents
  + 2 studio), **41 green**. The two red ones — `intent-proof.mjs`, `spawnlog-proof.mjs` — are NOT
  this amendment's: they assert git's banner as a door's failure line, and the worktree holds a
  concurrent, uncommitted exec-host change (`gitVerdict`/`quoteVerdict`, that lane's v52) that quotes
  the verdict instead. Attribution is mechanical, not remembered: the offending sentence is built by
  `gitVerdict`/`quoteVerdict`, and `git grep -c "gitVerdict" HEAD -- agents/exec-host` returns **no
  match** while the worktree has them in two files — and `dist/`, which is what the proofs actually
  import, is gitignored, so a clean rebuild at this commit is green. This commit touches neither.
- Honest bounds: a chained stage's own call — the designer's `${id}:brief`, a gated `fs.append` — is
  journaled on **no** record, because no record owns the chain as such; v54 is what makes that gap
  countable (the arithmetic above), and the fix is a third record kind for stage-level calls, not a
  paste onto someone else's line. The ledger's defence remains shape, not signature: a complete line
  whose receipts match its OWN fabricated transcript is still believed, and only an external witness
  (the proof's spawn counter and `rev-list`) catches that. An Allow-once human session still journals
  the note rather than a name — closing that needs the dock's release toggle, which does not exist
  (#100's lane). Nothing in Studio renders `decisions`, on either record kind: this history is
  machine-checkable and not yet human-visible, and no panel pretends otherwise. And DEMO MODE is
  intact — planning is still template-driven; v54 made a second batch of decisions auditable, it did
  not make the runtime make one.

## Amendment 55 — v55 (exec-host): a killed parent is not a killed tree — the host now says which it stopped, and can stop more when asked, 2026-09

_Numbering: 55 was free when this was written (checked against this file's headings and the task
list). The runtime lane had it as a CANDIDATE for stage-level ledger records; that candidate should
take 56, because a claim is made by committing the section, not by naming a task._

- **The claim that was being over-read.** `killedByBudget: true, signal: 'SIGTERM'` has meant one
  thing since v30 — the process the host started was terminated — and it has been read as another:
  the run is over. Measured with real processes before writing code: a program that leaves a
  **detached** child behind kept writing **7 more heartbeats after the host reported the kill**, and
  the `os.tmpdir` directory it wrote into could not be deleted, because a live process still held it
  open — the sandbox's own cleanup was being outlived by the thing it had killed.
- **The abstraction was the obstacle, so the abstraction changed first.** `ExecChild` (v30's minimal
  fakeable process view: `onData`/`onEnd`/`kill`) carried NO process id, so the host structurally
  could not reach anything but its own child, however much it wanted to. `pid?: number` is now part
  of the contract; a fake that reports none is answered `no-pid` rather than a pretend success.
- **Reaping is a SUBSTITUTION, never an addition, and the proof measures why.** §3 runs
  `taskkill /PID <pid> /T /F` against a pid the host had already killed: it returns **128** (not
  found — a dead parent has no enumerable children) while the survivor's heartbeats keep growing, so
  "kill, then tidy up the tree" is a no-op that LOOKS like hygiene. Issued instead of the kill, the
  same call returns 0 and the survivor goes silent. That ordering is the finding, and it is now in the
  code comment where the timer fires.
- **Opt-in, so v30-v54 behaviour is byte-identical.** `createExecHost(policy, { reapTree: true })` —
  default OFF, exactly like v51's journal, which is what lets the other 43 committed scripts be the
  assertion that nothing else moved. A reaper that fails or throws is `reaper-failed` AND the host
  still performs the kill it can do: a failed tree call may degrade reach, never the guarantee.
- **`descendantsStopped` is present exactly when a kill happened, and is absent otherwise.** The five
  values (`reaped` / `reaper-failed` / `no-pid` / `unsupported-platform` / `not-attempted`) are not
  collapsed into a boolean: an operator who asked for reaping needs to know whether the reason was
  this platform, a missing handle, or a call that failed. Optional rather than defaulted keeps the
  v30 and v51 readers byte-compatible (asserted: `malformed 0` when the new field rides past them),
  and the field is present in the v51 record of a killed run, where it sits beside `killedByBudget`
  because those are the two facts an audit reader needs together.
- **What the reaper costs, in visibility.** A force-killed tree reports `exit 1 / signal null`
  instead of `signal SIGTERM`, because that is what the OS says — so opting in changes the exit
  fields a run carries while leaving `killedByBudget` (the host's own knowledge) intact. The proof
  asserts both halves rather than smoothing the difference, and `execTestRunner`'s
  `killed at timeout budget (SIGTERM)` wording follows the signal it was given.
- **Scope, measured not assumed.** §5 runs the same parent with a NON-detached child: it dies with
  its parent, so the default was never a bug — it is a limit, and this increment states the limit and
  sells the escape hatch. Anything claiming "kills all descendants" would be over-reading again: a
  process that re-parents itself, or one already gone, is outside what any single call can promise,
  and no such promise is made here.
- **Platform honesty is a value, not a rumour.** `TREE_REAPER_AVAILABLE` exists so the proof can
  assert the branch that is TRUE on this box instead of hoping: on win32 it measures silence, and the
  `unsupported-platform` branch — the one any POSIX box would take — is exercised in unit tests
  rather than claimed as observed. `DEFAULT_TREE_REAPER(0)` is asserted to return `false` and not
  throw, because an unreachable pid is a failed call, not a success.
- **44th proof `docs/evidence/agents/reap-proof.mjs`.** Real processes throughout: the harness writes
  `parent.js`/`grand.js` into a throwaway `os.tmpdir` dir and the SHIPPED host runs them under a
  700 ms budget. §1 the survivor + `not-attempted`; §2 reaped + silence; §3 the ordering control;
  §4 the platform value; §5 the attached control; §6 the v51 record carrying both claims; and the
  `finally` block reaps the trees it started BEFORE deleting the directory — the finding applied to
  the proof itself, with a bounded retry and a hard assertion that nothing was left behind.
- **What did not move:** no policy field, argv shape, env list, gate, checkpoint, door, budget or
  truncation rule (v48/v52/v53 are untouched); `exec.run`'s and every door's existing sentences are
  byte-identical unless a run was killed AND reaping was asked for. exec-host **163/163 → 170/170**
  (7 new tree cases in `execHost.test.ts`), 44/44 agent proofs and the four root gates green.
- Honest bounds: the host reports what IT did, never what the whole machine did, so `reaped` means
  "the reaper said 0 and the survivor was observed silent", not "no descendant anywhere survives";
  the win32 reaper shells out to `taskkill` — a second binary the host may run, which is exactly why
  reaping is opt-in and why the argv it uses is fixed and built from an integer pid; POSIX is
  `unsupported-platform`, stated rather than silently absent, and adding it there needs a
  group-kill-and-detach story measured on a POSIX box; a killed run's `exitCode`/`signal` become the
  OS's force-kill values when reaping is on; nothing in Studio registers an exec host, so no user
  surface shows any of this (§60); and DEMO MODE is unaffected — this is about how much of a process
  tree the sandbox can honestly stop, not about what the agent is allowed to plan.

## Amendment 56 — v56 (exec-host): the budget names the PIPE it cut — one bit was doubting an answer that had arrived whole, 2026-09

_Numbering: 56 was free when this was written (checked against this file's headings, the task list and
`git log --oneline -1`). 53 gave each stream its own ceiling; this is the half of that story the
ceiling could not tell._

- **The measurement that made this an increment rather than a nit.** One real program, run through the
  SHIPPED `exec.run` door under a 1 024-byte ceiling: 28 bytes of answer on stdout, 8 000 bytes of
  progress on stderr. It came back with the answer BYTE-IDENTICAL to what the same command prints
  uncapped, and this sentence: `exec node -e … → exit 0 (output truncated)`. The door was casting
  doubt on the one thing it had received whole. Swap the pipes with a 8-byte ceiling and the answer
  really IS gone — and the sentence is the same. One bit about two pipes, and both readings of it are
  wrong half the time.
- **The fix is a fact, not a policy: `truncatedStreams`.** The host already knew which stream it cut
  — v48 keeps a per-stream `cut` map to do the whole-line trim — it just never said so. Now
  `ExecRunResult` carries `truncatedStreams?: Array<'stdout' | 'stderr'>`, present exactly when
  something was cut and in a STABLE order (streams, not arrival), and absent when nothing was cut
  rather than an empty array: the host does not answer a question nobody asked, and a reader can tell
  "no cut" from "cut, but I cannot say whose".
- **The second bug was worse than the cosmetic one, and it is about a claim, not a sentence.** v48's
  hedge — `no complete line survived the output budget — this is NOT a statement that …` — is a
  statement about the stream the door PARSED. It was keyed off the aggregate flag, so a door reading a
  genuinely EMPTY stdout whose OTHER pipe had overflowed said the index might have had something in it
  after all. v52's `gitVerdict` `cut` rule had the same aggregate key. Both now ask
  `stdoutWasCut(result)`: the hedge appears exactly when nothing survived TO PARSE, which §4 of the
  proof measures across real budgets (10 sampled, 5 of them emptied the stream, and the hedge appears
  on precisely those 5 and on none of the other 5).
- **Six doors, one sentence — the duplication v52 counted is gone.** `budgetFlags(result)` is now the
  single builder of the two budget clauses (truncation + timeout kill) that five doors each
  re-assembled locally and the sixth (`execTestRunner`) spelled a fifth way. Removing that copy is
  what makes the naming impossible to forget in a door added later — the same argument v51 made for
  writing the journal inside `run()`.
- **45th proof `docs/evidence/agents/pipes-proof.mjs`.** §1 the intact answer with the clause naming
  the other pipe, cross-checked against an uncapped control run; §2 the mirror at 8 bytes, where
  `truncatedStreams` is `['stdout', 'stderr']` and the answer really is gone; §3 asserts the two
  sentences DIFFER (the increment in one line) and that with no stream evidence the builder names
  NOTHING rather than guessing; §4 drives a real `git.staged` over 24 multibyte staged lines at
  budgets DERIVED from git's own byte offsets, including four that land inside the very first line;
  §5 measures where the hazard actually lives — five shipped read doors all answered on stdout with
  zero bytes on stderr, so the git doors are exposed through a cut STDOUT only, which is exactly what
  §4 exercises; §6 shows the v51 audit record carrying the same naming, so "whose bytes were dropped"
  is answerable a week later from the file alone; §7/§9: everything under `os.tmpdir`, home HEAD
  byte-identical.
- **What did not move:** the ceilings themselves (v53's per-stream accounting is untouched), the
  trim-to-whole-lines rule, any policy field or clamp, any argv, any gate, the aggregate
  `truncated` flag and every existing prefix of its sentence — which is why 44 already-committed
  proofs stayed green without edit. exec-host **170/170 → 177/177** (7 new cases: 2 in
  `execHost.test.ts`, 3 in `gitTools.test.ts`, 2 in `gitStagedTool.test.ts` — the last pair being
  the false-hedge case and its mirror).
- Honest bounds: the new field is only as good as the host's own bookkeeping, so a run that never
  reached the byte counter reports nothing rather than "nothing was cut" for a stream it did not read;
  `budgetFlags` deliberately prints the bare clause (no parentheses) when `truncated` arrived without
  stream evidence — an old-shaped input gets an honest old-shaped sentence, never a guess;
  `stdoutWasCut` reads absence as false, which is correct for the shipped host and would UNDER-report
  if some future writer set `truncated` alone; the proof's §5 finding is a statement about git 2.52
  on this box, not a promise that a git read never writes to stderr (a warning-bearing read would
  simply exercise the naming, which is the point of having it); the doors' sentences are longer by one
  parenthetical and nothing parses them for meaning (v52's rules key off git's words, not off
  `flags()`); and DEMO MODE is unaffected — no Studio surface runs an exec host, so the naming is
  visible in proofs and unit tests and no panel claims otherwise.

## Amendment 57 — v57 (exec-host): one conflicted repository, one story — `AA` was being counted as "added", in a tree no commit can record, 2026-09

_Numbering: 57 was free when this was written (checked against this file's headings, the task list and
`git log --oneline -1`). v52 named an unmerged path in the DIFF-family doors and left this bound in
its own list: "`git.status` still labels an unmerged entry `other`". It was worse than that bound,
and only measuring each conflict shape showed it._

- **The classification had a hole in the middle of its own table.** v32's porcelain mapper looked for
  a code in order — `?` untracked, then `U` unmerged, then `A` added, `R`, `C`, `D`, `M` — and
  asked whether the two-character field CONTAINED it. That made `UU`, `AU`, `UA`, `DU` and `UD`
  unmerged correctly, because they contain a `U`; it also made **`AA` report as `added` and `DD`
  report as `deleted`**, because the pair's first letter is the row that matched. Git's own porcelain
  spec lists exactly seven unmerged codes — those five plus `AA` and `DD`.
- **Why that is a safety problem and not a taxonomy nit.** Measured on a real add/add merge (two
  branches creating the same path with different content): `git status --short` prints `AA new.md`,
  and the door reported `1 entries (1 added)` — of a repository where `git commit` answers exit 128
  with "Committing is not possible because you have unmerged files". So the agent's first read of a
  conflicted tree described it as WORK WAITING TO BE COMMITTED, in the same plan whose `git.staged`
  step (v52) said the index was conflicted. Two doors, one repository, two contradictory stories, and
  the optimistic one came first.
- **The fix is git's set, checked first.** `UNMERGED_XY` (the seven) is consulted BEFORE the table, so
  no row can win a conflict pair; `A ` and `D ` keep meaning added and deleted, and an unknown code
  still reports `other` — v32's honesty about junk is the point of the ordering, not collateral of it.
  The door then says what the tally hides: `git reported 1 UNMERGED path(s) (new.md) — a conflicted
  working tree, so these entries are NOT a staged change and a granted git.commit right now would be
  refused by git itself`.
- **46th proof `docs/evidence/agents/conflict-proof.mjs` does not take that sentence on trust.** §2
  builds three conflict shapes for real (both-modified, both-added, delete/modify), and for each:
  asserts what raw `git status --short` actually prints (the shape labels were corrected by that
  control — the third is `DU` on this box, not `UD`), asserts the door classifies it as unmerged and
  names the path, then ASKS FOR THE COMMIT the door says will be refused and asserts git refuses it
  (all three exit 128, with git's own reason quoted). §3 is the point of the increment: one add/add
  repository, two doors, one word — status "1 entries (1 unmerged)", staged "git reported 1 UNMERGED
  path…", with the staged parser still finding zero per-file diffs and STILL refusing to call that an
  empty index. §4 is the control that keeps §2 honest: a clean tree gets no conflict clause, and the
  SAME commit door lands a real commit there — so the refusals were about the conflict, not about the
  door. §5 reads `MERGE_HEAD` from disk and checks it against `git rev-parse MERGE_HEAD`: the conflict
  is a fact in the repository, not an artefact of parsing.
- **What did not move:** the porcelain SHAPE of the result (`files`/`counts` keep their fields; only
  a `status` VALUE changed for two codes), every policy, argv, gate, budget and door sentence except
  the new clause, and the v52 notice machinery the new clause deliberately parallels rather than
  duplicates. exec-host **181/181** (4 new cases in `gitTools.test.ts`: the seven codes, the two
  narrow non-regressions, and both door sides), 46/46 agent proofs green, all four root gates green.
- **A migration note, said plainly:** anything that counted `added` in a conflicted repo counted
  wrongly and now counts differently. Nothing in this repo depended on that number — the sweep proved
  it (46/46 unchanged) rather than the prose assuming it — but a downstream consumer reading
  `counts.added` across a merge conflict will see it move into `counts.unmerged`, which is the fix,
  not a regression.
- Honest bounds: `parseGitStatus` still reports one status per entry, so a path unmerged by BOTH sides
  being deleted carries no more information than `DD` (git's own stage-1/2/3 rows are a deeper read
  that no door here asks for); the notice lists paths verbatim from git, so a rename-with-conflict
  shows the new path as v32 decided; nothing here teaches the Studio dock to render a conflict, and
  DEMO MODE is unaffected — no Studio surface runs an exec host, so the whole of v57 is enforced in
  unit tests and proofs, and no panel pretends otherwise.

## Amendment 60 — v60 (exec-host): one pipe may not mute the other in the SENTENCE either — the `test.run` bridge was quoting `stderr || stdout`, filing refusals under the predicate's own name, and printing `exit null` for a process that never exited, 2026-09
- **What was found:** v53 gave each stream its own byte ceiling after measuring that a shared counter
  let stderr starve stdout. One layer up, the bridge that turns an `ExecRunResult` into a `TestReport`
  had kept a strictly worse version of the same hazard since v31: `stderr || stdout`. It did not
  depend on timing — **stderr simply always won**, which is why 30 versions of green proofs never
  caught it: a command that stays quiet on stderr always looked fine. Measured against real processes
  before anything was written (and the shipped rule is recomputed inside the proof from the SAME
  result, so the damage is shown rather than asserted):
  a suite whose 42-byte answer sits on stdout and whose 42-byte deprecation warning sits on stderr
  produced the sentence `exit 1 · (node:123) DeprecationWarning: legacy url` — in **both** write
  orders, identically; the answer never appeared. Worse, a command with 2 500 bytes on stdout under a
  2 000-byte ceiling and a 5-byte warning on stderr produced a **53-byte** sentence that quoted the
  warning and then announced `output truncated at budget (stdout)` — it described a cut it had itself
  hidden, while 2 000 bytes of surviving, whole-line stdout sat outside the report entirely.
- **The rule now:** every non-empty pipe is quoted **under its own label**, and a pipe the budget cut
  to nothing says so in v48's words ("no WHOLE line survived the output budget … NOT a statement that
  it printed nothing"), so an absent pipe is never read as a silent one. v56's aggregate clause still
  names the cut pipes at the end; the doors' `budgetFlags` wording is unchanged, so there is still one
  truncation vocabulary in the package. `exit ${code}` is printed only when an exit code exists —
  otherwise `no exit code reported`. v55's `descendantsStopped` finally has a landing point: a killed
  verify now reads `killed at timeout budget (SIGTERM) (descendants: not-attempted)`, which matters
  precisely for a suite runner that spawns workers of its own.
- **A refusal is not a failed test — and the fix is a NAME, not a NUMBER.** The dock chip's tooltip is
  `failures[0].name: failures[0].message`, so a default-deny answer used to read
  "exit-zero: no allowlist rule matches …", attributing a verdict to a predicate that was never asked
  of a command that was never started. It is now filed under `NEVER_RAN` (`never-ran`). `total`
  deliberately stays **1**: `runPredicates` defines `total` as predicates *in scope*, and
  `registerTestTools` answers `total 0` for an asked-for `only` by throwing *"no test predicate named
  X"* — zeroing the number to make the arithmetic look honest would have replaced one lie with a
  stranger one. §6 of the proof pins that trap so nobody "fixes" the number later.
- **The price, in numbers:** a report sentence can now carry BOTH pipes, so where the old one capped
  itself at one stream's text the new one can reach the pair — measured at **2 072 bytes** for a
  sentence under a 2 000-byte per-stream ceiling. That is the same 2× ceiling v53 already accepted for
  retention, now also visible in the text a run journals.
- **Verified:** exec-host 181 → **187/187** (8 files); NEW `bridge-report-proof.mjs` (48th script in
  `docs/evidence/agents/`, §1–§7, real spawns, real kill at 500 ms, real vitest, `os.tmpdir` only,
  home HEAD compared byte-wise). Two COMMITTED proofs were re-accounted in this same commit because
  their expectations encoded the old contract: `exectest-proof.mjs` (5 assertions — the
  `1/1 passed — exit 0 · all good` equality, the `exit 1 · boom: …` failure message, and the §28
  refusal's exact message; each now states the pipe or the `never ran:` wording) and
  `budgets-proof.mjs` (its `/exit null/` match, whose old comment argued "the report says null rather
  than inventing one" — the new wording keeps that anti-invention property and stops implying an exit
  happened at all). Their real-vitest section now reads
  `killed at timeout budget (SIGTERM) (descendants: not-attempted) · no exit code reported`.
- **Honest bounds (§60):** the shipped suite was MEASURED, not excused — real `@nexus/design-model`
  vitest writes **592 bytes on stdout and 0 on stderr**, so for the ONE command this repo actually
  verifies with, v31's picking rule happened to pick right: the hazard was latent in the bridge, not
  live in a shipped door. Where it IS live is any program that warns — which is every real test
  runner, and the host is where every door is born. Not changed here: the verdict rule (a cut stream
  turns neither green to red nor red to green — asserted), budgets, gates, argv, the engine label, and
  `TestReport`'s shape, which stays runtime-owned. What this also did NOT settle: `total` cannot
  express "nothing ran" to a consumer that reads only numbers (the chip still prints `0/1`), and the
  only honest carrier for that is a field on `TestReport` — a runtime-side decision, deliberately not
  smuggled through an exec-host commit.

## Amendment 61 — v61 (exec-host): a door hands on PATHS, and a picture of a path is not one — a rename was read through the half HEAD has never heard of, and a name git chose to QUOTE made a whole file vanish from a door that then said `the index is EMPTY`, 2026-09

_Numbering: 61 was free when this was written (checked against this file's headings, the task list and
`git log --oneline -1`). v32 gave the agent `git.status`, v42 `git.show`, v43 `git.staged`. All three were
built on one silent assumption: that the bytes between a porcelain line's columns ARE the file. Measured
against real git 2.52 on this box, they are not — in four separate ways, one of which turned a door that
reads an index into a door that denies it has anything to read._

- **A rename is ONE change with TWO names, and v32 kept the half that answers nothing.** Porcelain prints
  `R  old -> new`; the parser cut at ` -> ` for EVERY entry and kept the right-hand name. So
  `M  notes -> draft.md` — one modified file, an arrow that is DATA — became a phantom pair with half a
  filename deleted from the answer; and for a real rename the door named the path HEAD has never heard of.
  Measured what that costs: in one throwaway repo, raw `git show` answers 221 bytes under the old name and
  0 under the new one, and the content door takes the new name to git, gets exit 0 with an empty diff (v44
  had already measured that git answers an unmatched pathspec with silence, not a refusal), and reports
  `HEAD touches nothing at <the file the human is about to commit>`. That is the exact inverse of what §60
  allows a door to say.
- **`core.quotePath` is git's permission to render a name as a STRING about the name.** It defaults to
  `true`, so any non-ASCII byte arrives C-quoted and octal-escaped. In `git.status` that path will not
  open and will not match a pathspec. In a diff header the quoting wraps the `a/`/`b/` PREFIX too, so
  `diff --git "a/docs/caf\303\251-note.md" "b/…"` matched v43's header regex not at all: the file vanished
  from the parse, the door got zero files, and a door with zero files said the one thing a door must never
  say about a non-empty index — `the index is EMPTY`. v52's lie-by-omission had escalated into a positive
  claim of absence, and git's own `--stat` line for those same bytes reads `1 file changed`.
- **Quoting is not about exotic bytes at all, which the first version of this fix assumed.** Re-measured
  with `core.quotePath=false` pinned: a name containing an ordinary SPACE still arrives as
  `?? "plain name.md"`, and a spaced pair still arrives as `R  "a b.md" -> "c d.md"` — git is
  disambiguating the arrow, not escaping. So the pin alone would have left every spaced filename in a
  repository unopenable through the doors. The rule that follows from the asymmetry is
  `unwrapRendering`: everything git ESCAPES (`"`, a backslash, a control character, and non-ASCII under
  the default) escapes as a BACKSLASH sequence, so a quoted rendering with no backslash inside is git's
  quoting of an ordinary name and the bytes between the quotes ARE the file; a backslash inside means git
  stood for something, and the door keeps the string verbatim and MARKS it rather than guessing.
- **A header is split by POSITION, and a path can steal that split.** `m b/n.md` — a directory whose name
  ends in a space, which NTFS allows and the proof creates — puts a second ` b/` inside the header, so
  `diff --git a/x.md b/m b/n.md` splits into `x.md b/m` and `n.md`: one name out of two paths, which the
  agent then takes to `git.show` and is told nothing exists. git prints the same change's name
  unambiguously one line at a time (`+++ b/…`, and for a rename too pure to carry a hunk, `rename to` /
  `copy to`), so those now win wherever they exist, and the header is only the fallback.
- **One candidate this increment set out to fix and could not:** "an untracked directory counts as ONE
  entry." Measured both ways — 3 entries with the shipped environment, 1 with
  `status.showUntrackedFiles=normal`, and the single entry is the directory prefix `dropzone/`. v46's pin
  already confined it; the proof now carries the measurement so the claim has a witness instead of a
  memory.
- **The fix is one pin and one rule, in two layers.** v46's counted table gains a fifth key,
  `core.quotePath=false` (the argv is untouched: this confines what git SAYS, not what it DOES — measured
  that it changes the status line's bytes and nothing else); every name any parser hands out goes through
  `unwrapRendering`; a pair keeps both halves (`fromPath` is what HEAD knows, `path` what is on disk, and
  the split is a separator only for `R`/`C`); `parseDiffHeader` and `parseFileLine` are shared by the
  three diff-reading doors the way v52 shared `gitVerdict` and v56 shared `budgetFlags`; and
  `pathShapeNotices` gives the two entry-bearing doors one rule for what an entry cannot say for itself.
  `git.show` refuses to ask git about a rendering at ZERO spawns — the door that confirms content is the
  one place where silence could be mistaken for absence.
- **49th script in `docs/evidence/agents/` — `porcelain-path-proof.mjs` — shows the damage rather than
  asserting the fix.** §0 pins the wiring (which slot number `core.quotePath` occupies, that `status.showUntrackedFiles`
  moved to the slot after it, and that the policy scrubber drops none of it). §1 makes a HUMAN stage a
  rename and has both index-facing doors read it as a pair, then weighs the two names against each other
  with raw `git show` (221 bytes vs 0) and against the commit door's own promise. §2 removes the pin from
  the environment and lets real git speak: the SAME commands now print a quoted name and a quoted header,
  those bytes go through v43's header matcher — copied out of the previous commit and pinned in the proof,
  so the claim is about a regex and not about a memory — which sees 0 headers, and the sentence the door
  would have spoken is captured byte-for-byte from the SAME door run over a genuinely empty index, which
  is what makes it attributable to the rendering rather than to this file. §3 measures the ordinary-name
  quoting (a spaced pair the door unwraps into two names that open, one on disk and one in HEAD), the
  stolen split (a ` b/` directory created for real, the header mis-splitting exactly as documented, the
  door answering from git's own per-line names), and the bound: a name containing ` -> `, `"`, or a tab
  cannot be created on this filesystem — all three attempts recorded with their error codes — so the
  escaped branch is exercised by fixture and said to be. §4 is the refuted candidate. §5 the zero-spawn
  refusal, §6 §9: this repository's HEAD compared byte-wise and every throwaway repo inside `os.tmpdir`.
- **What did not move:** every argv shape, every policy, gate and budget, the porcelain SHAPE of the
  results (three optional fields added: `fromPath`, `quoted`, and the pair notice), and every door sentence
  except the clauses that now ride `pathShapeNotices`. Two accounts were re-written in this same commit,
  because v61 refutes them: `config-proof.mjs`'s "four repo values" is five, and its orphan-slot check
  asserted the absence of a slot named `_4` — which is now a legitimate slot; it asserts absence one past
  the COUNT instead. exec-host **201/201** (from 187: the pair, unwrap, per-line-name, escaped-residue and
  door-notice cases), the whole agent proof sweep green — **49/49 scripts** in `docs/evidence/agents/`, of
  which 48 are tracked after this commit and the 49th is the other lane's uncommitted
  `policyaudit-proof.mjs` — and all four root gates green.
- Honest bounds: an escaped rendering is still handed over as git printed it, marked and announced —
  unescaping it would mean choosing among the characters git refused to print, and on this box none of
  them can even be named in a file (§3 records the attempts); a paired entry whose name ends quote-adjacent
  to an arrow can still fool the positional split, and git's own answer to that is porcelain v2's
  NUL-terminated fields, which no door here asks for yet; `git.diff`'s worktree door carries no pre-image
  because measured, an un-staged rename reaches it as a delete plus an untracked file, not as a pair;
  `git.show` still answers "HEAD touches nothing at X" for a name HEAD genuinely does not know, because
  that is what git says and the door relays it (v52's rule) — what v61 removed is the door being handed a
  photograph of a name and asking the question anyway. Nothing here teaches the Studio dock to render a
  path shape, and DEMO MODE is unaffected: no Studio surface runs an exec host, so all of v61 is enforced
  in unit tests and proofs.

## Amendment 62 — v62 (exec-host): porcelain's TWO columns answer TWO different trees, and v32's flat status list could not say which one a commit records, 2026-09

_Numbering: 62 was free when this was written (checked against this file's headings and `git log --oneline -1`). v32 gave `git.status` a table that matched a SUBSTRING per row and stored ONE status per file — collapsing the two columns into a single word. Measured on a real repository: porcelain printed 7 entries and a granted commit recorded exactly 4; the door could not distinguish them._

- **`XY path` is two answers, not one.** Column X says "how does the INDEX differ from HEAD?" —
  it names what `git.commit` WILL record. Column Y says "how does the WORKTREE differ from the
  INDEX?" — it names what a commit will NOT record. `MM` means one file carries TWO different
  modifications (one staged, one only on disk); ` M` looks identical to `M ` in the door's old
  single-word label ("modified"), yet a commit records one and not the other. Before v62 the
  door said "7 entries (3 modified, 1 added, 1 deleted, 1 untracked, 1 renamed)" and nothing
  about how many of those 7 a granted commit would actually place in HEAD.
- **Porcelain v2 was measured and REFUTED as the fix** (the v61 comment called it "the next
  increment's subject"). v2 outputs 6.9× the bytes of v1 (33 706 vs 4 884 on 262 files), which
  at the shipped 4 096-byte whole-line budget answers only 31 entries where v1 answers 219 — a
  86% loss of the door's effective range. v2 still C-quotes non-ASCII under the default. Adopting
  it would cost the reader 88% of its answers at the same ceiling. The fix is therefore per-column
  parsing of the existing format, not a format upgrade.
- **The fix: two optional boolean fields, one notice, zero new spawns.** `parseGitStatus` now
  computes `staged = xy[0] is not space/question-mark and not unmerged` and `dirty = xy[1] is not
  space/question-mark and not unmerged`; these ride the existing `GitStatusFile` shape (optional,
  absent when false, so no caller sees `false`-valued noise). Unmerged rows get neither field:
  a commit is refused outright (exit 128, v57's finding), so neither column means what it says.
  `treeSplitNotice` is exported and wired into `git.status`'s detail sentence alongside
  `pathShapeNotices` — the same family (v52 `gitVerdict` · v56 `budgetFlags` · v57
  `unmergedStatusNotice` · v61 `pathShapeNotices`). It fires whenever `staged < total` and
  names: how many entries a commit records, which are worktree-side or untracked (so a
  commit records NONE of them), and how many are staged AND edited again on disk (`MM`/`AM`).
  It stays silent when every entry is staged (no split to name).
- **50th script `docs/evidence/agents/two-tree-proof.mjs` cross-checks against git itself.**
  §1 creates a repository with all 7 porcelain shapes (`MM`/`AM`/`M `/` D`/` M`/`D `/`??`) and
  verifies the door's `staged` set against `git diff --name-only --cached`, the `dirty`-only
  set against `git diff --name-only` minus the cached list, and untracked against
  `git ls-files --others`. §2 makes a real commit through the shipped commit door and asserts
  HEAD records exactly the 4 staged paths; the 3 worktree/untracked remain outside it. §3
  verifies the notice's silence on a fully-staged tree. §4 confirms this repo's HEAD is
  unchanged and all writes lived inside `os.tmpdir`.
- **What moved:** `GitStatusFile` gained `staged?: true` and `dirty?: true` (optional fields,
  not required); `parseGitStatus` gained 2 lines of computation; one exported function and one
  sentence-clause added to the door's detail; the stale porcelain-v2 comment replaced with the
  measured refutation; `index.ts` gained one export. Two committed proof scripts re-wrote their
  exact-shape `deepEqual` assertions to carry the new fields (same commit, per v53's lesson).
  exec-host **215/215** (from 201: the 7-shape per-column cases, unmerged exclusion, notice's
  presence/silence, and two door-level tests), 50/50 proof scripts green, all 16 turbo tasks green.
- Honest bounds: the notice counts the door's parsed entries, not git's own `--porcelain=2` field
  counts — a rename pair (`R ` with dirty `RM`) appears once, as git printed it; a name containing
  `-> ` inside an R/C line can fool the pair-split (v61's residual bound, unchanged); untracked
  directories are still counted as one entry per git's default (v46's pin is the bound); the
  notice says "0/N" for a fully-worktree tree (nothing staged), which IS the correct claim, and
  "N/N" is silent — a false-alarm on a tree that has only untracked files is possible but not
  harmful (the reader learns nothing a commit could record, which is the truth). DEMO MODE is
  unaffected: no Studio surface runs an exec host.

## Amendment 63 — v63 (exec-host): v62's ratio has a DENOMINATOR, and a denominator is a claim about the repository — a read the budget CUT can only support a claim about the window it read, 2026-09

_Numbering: 63 was free when this was written (`git log --oneline -3` top = v62; this file's headings in HEAD end at 62; 58 and 59 belong to the concurrent lane's UNCOMMITTED work in the working tree). Amendment 62 gave `git.status` the sentence `git.commit records the INDEX: 4/7 entries differ from HEAD there`. This amendment is about the `7`._

- **A count is a claim about the tree; a cut count is a claim about the read.** Every door in this
  package reads git through v48's whole-line output budget, and v48's own rule is that the budget
  decides HOW LINES ARRIVE, never who gets heard. v62's ratio inherited a denominator without being
  given the read. Measured on this box through the SHIPPED door (3 staged edits + 400 untracked
  files, so `git status --short` prints **403** porcelain lines): at the 1 MiB ceiling this proof
  uses for its whole read the detail says
  `3/403 entries differ from HEAD there`; at **256 bytes** the budget keeps 21 whole lines and — in
  v62's wording, which is what shipped until now — the detail says
  `3/21 entries differ from HEAD there · 18 worktree-side/untracked (u000.txt … u017.txt)
  a granted commit records NONE of`. The second sentence is true only of the 21 lines that survived,
  and is phrased as a fact about the repository. v56's `· output truncated at budget (stdout)` does
  ride at the END of it — but a reader who stops at the ratio never gets there, and the ratio had
  already spoken.
- **The worse half: v62's silence rule fires on a window.** `treeSplitNotice` returns `''` when
  `stagedCount === files.length` — "every entry is staged, so there is no split to name". At a
  30-byte budget the only lines that survive are the three `M ` rows (porcelain prints tracked
  changes FIRST, untracked LAST), so the condition is met and the door falls SILENT about a tree
  holding 400 untracked files. Measured: `treeSplitNotice(windowEntries) === ""`. A silence that is
  correct for a complete read is a false statement for a partial one — and it is the same failure
  shape v48 fixed for a tally (`cutNotAbsence`) and v52 fixed for git's verdict (the `cut` rule),
  left behind by v62 because v62 only looked at the entries and not at the read.
- **The fix: one parameter, no new spawn, and no invented number.** `treeSplitNotice(files, {
  window })` takes the read back in, and the door passes v56's `stdoutWasCut(result)` — the ONE
  fact that says "git printed more on the very pipe I parsed". Under a window: the ratio is re-named
  (`${staged}/${total} entries this door READ differ from HEAD there`), the worktree list is labelled
  `worktree-side/untracked read (…)`, and a final clause states the bound — `the read was CUT at the
  budget: these are the entries that survived, NOT a census of the repository`. v62's silence is
  replaced, never dropped: a wholly-staged WINDOW now says `all N entries this door read differ from
  HEAD in the index · the read was CUT at the budget, so this is NOT a statement that nothing
  unstaged or untracked exists behind it`. The notice deliberately does NOT say how many entries were
  missed — the door cannot know, and inventing a number is the thing this family exists to prevent.
  A complete read produces v62's sentences BYTE-IDENTICALLY (asserted).
- **`killedByBudget` is NOT part of the flag, and the reason is a reachability fact.** The timeout
  branch fails the door's `ok`, so a killed read answers with `quoteVerdict` + v52's
  `refusedNotAbsence` and never reaches the split sentence at all. The first draft of this wiring
  read `stdoutWasCut(result) || result.killedByBudget`; that second operand is DEAD CODE in this
  door, so it is not in the shipped one (and the door's comment says why, so the next reader does not
  "restore" it).
- **What v62's honest-bounds line got wrong, measured.** v62 wrote "untracked directories are still
  counted as one entry per git's default (v46's pin is the bound)". §5 measures the pin instead of
  restating it: with `status.showUntrackedFiles=normal` a 400-file untracked directory is **1**
  porcelain line (`?? dropzone/` — a prefix, not a path); under v46's forced
  `status.showUntrackedFiles=all`, which the door actually runs, the same directory is **400** lines.
  So the door does NOT collapse directories — and the pin is exactly what makes a status list long
  enough to be cut. The honest response is to say what was read, not to read less.
- **51st script `docs/evidence/agents/window-proof.mjs` drives ONE repository at three budgets.** §1
  asserts git's own census (403 lines) and that the 256-byte door's denominator EQUALS the number of
  entries it returned, that it is smaller than the census, and that every path the window named
  appears in git's own list (a window may not invent). §2 is the load-bearing one: the SAME parsed
  entries yield `''` for a complete read and a sentence for a cut one — the difference is the READ,
  not the repository. §3 controls the claims against git rather than against the door: `diff
  --name-only --cached` is exactly the 3 the 30-byte window read, and `ls-files --others` counts the
  400 it did not. §4 makes one REAL commit through the shipped commit door: HEAD records exactly
  `s1.txt s2.txt s3.txt`, and the door over the same tree then says `0/400 … a granted commit records
  NONE of`. §5 measures the pin. §6: this repo's HEAD unchanged, writes inside `os.tmpdir` only.
- **What moved:** `treeSplitNotice` gained an optional second parameter and 3 clauses; the
  `git.status` door gained one local (`windowed`) and a comment; nothing else in the package changed,
  and no argv, policy, or env moved. exec-host **221/221** (from 215: complete-read back-compat,
  window phrasing, the replaced silence, an empty window, and two door-level budget tests), 51/51
  proof scripts green, and the four root gates green (typecheck 8/8, lint 4/4, build 5/5, test 8/8
  turbo tasks). Recorded rather than hidden: one SIBLING proof (`reap-proof`, v55's timing-sensitive tree
  measurement) failed inside an earlier 51-script sweep, passed standalone, and passed the final sweep — a
  sweep that runs 51 real-process scripts on one box gives a timing-bound measurement no cleaner floor than
  this, and v63 changes nothing in that path.
- **Docs reconciled, and one drift found by re-adding the table.** `docs/evidence/agents/README.md` promises that
  its per-file rows sum to what `npm test` prints; the `gitTools.test.ts` row still read (51) where HEAD
  measured 65 — every case the file gained after am. 61 (when this table last reproduced what `npm test`
  printed: 201) went into the package total and never into its own row — so the row reads (71) today and the
  sum sentence reads 221. The counts came from a per-file vitest JSON report, not from adding deltas by hand:
  the same rule v63 applies to a door, recount from the source rather than infer what the answer must be.
- Honest bounds: the window flag is per-door and per-stream, so `git.staged`, `git.diff` and
  `git.show` keep their own v48/v52/v56 handling and gained nothing here (only `git.status` speaks a
  ratio of entries). `truncated` (the aggregate flag) is NOT used as the window test — a cut on the
  NOISE stream must not re-label an answer that arrived whole, which is v56's rule, not this one's.
  The notice still counts ENTRIES, not files-in-a-pair. Nothing here teaches the Studio dock to
  render a window; DEMO MODE is unaffected, since no Studio surface runs an exec host, and all of v63
  is enforced in unit tests and proofs.
## Amendment 64 — v64 (exec-host): a diff BODY line can wear a HEADER's shape — three readers asked what a line LOOKS LIKE when the question was WHERE it sits, so both diff doors tallied `+0 −0` where git tallied 2 insertions, and handed the §28 reviewer a filename that lives inside another file, 2026-09

_Numbering: 64 was free when this was written (`git log --oneline -3` top = v63; this file's HEAD headings end at 63 and there are 61 of them, i.e. 58 and 59 — the concurrent lane's numbers — were folded out of HEAD by a docs reorder). Recorded rather than hidden: the WORKING COPY of this file is a stale buffer that still carries 58/59 and lacks 62/63, because a concurrent session holds it uncommitted; this commit splices its own section onto HEAD's blob and touches nothing else in it. v63 gave `git.status`'s ratio a denominator it had actually read. This amendment is about the diff doors, and about a fact those three readers never had: which lines are NAMES._

- **Three readers, one shape test, and no position.** `parseGitDiff` (`git.diff`, the worktree),
  `parseStagedDiff` (`git.staged`, the index — the very text a human is asked to approve) and
  `parseShowDiff` (`git.show`, what HEAD recorded) all count a diff the same way: a line starting with
  `+` is an addition, `−` a deletion, EXCEPT a line starting with `+++`/`---`, which is git naming a
  file. That exception asks what the line LOOKS LIKE. git prints the name pair exactly ONCE per file
  section, in the preamble before the first `@@`; inside a hunk EVERY line is content, and content is
  prefixed with one character — so a file that gains the text `++ b/second.md` shows it to the door as
  `+++ b/second.md`. Nothing distinguishes those two jobs by shape. Measured on this box (worktree:
  `code.ts` loses a line reading `-- a/ghost.ts`, `notes.md` gains `++ b/second.md`, `plain.txt` gains
  `+++ b/fake-from-an-addition`): git's own shortstat says
  `3 files changed, 2 insertions(+), 1 deletion(-)` and the same bytes through the pre-v64 rule —
  transcribed into the proof, so the finding survives a future rewrite of the source — tally
  `{"paths":["code.ts","second.md","plain.txt"],"add":0,"del":0}`, which is the door sentence
  `3 files, +0 −0 (3 hunks)`.
- **The counts were the smaller half.** v61 established that a `+++ b/p` line NAMES a path and beats a
  `diff --git` header whose positional split a ` b/` directory stole — so the reader that swallowed the
  body line also BELIEVED it: `notes.md` was renamed to `second.md`, a path that exists nowhere in the
  repository, and `code.ts` lost `-- a/ghost.ts` to the same rule. `git.staged` went further than a
  wrong number: `addedLines` is the text this door exists to put in front of a human at §28 (v43's whole
  reason for existing), and the swallowed line vanished from it — the door withheld from a person the
  exact line the commit would add, under a filename the commit would not touch. A door that mislabels a
  path is the failure v61 named; a door that edits what a human is asked to approve is worse, and it came
  from the same four characters.
- **The fix is one predicate and a boolean per reader.** `isDiffHeaderPairLine(line, insideHunk)` is
  `!insideHunk && (line.startsWith('--- ') || line.startsWith('+++ '))` — the pair names only on the
  caller's side of the first `@@`, and each reader keeps one local (`insideHunk`, reset at every
  `diff --git` header, set at the first `@@`). Each of the three sources has EXACTLY ONE call site, so
  there is no second rule to drift from the first, and the old blanket `!startsWith('+++')` exception is
  gone from all three (pinned by a source-level assertion in the proof, not by a review). v61's rule is
  KEPT, not reverted: a pair line before the first hunk still corrects a stolen header split, which §5
  of the proof drives for real. One line that merely WEARS the shape now counts as what git means by it:
  an addition.
- **Second clause, found by the same proof: the name line can end with a TAB.** `git diff --cached`
  renaming `m b/spaced.md` to `m b/renamed.md` prints BOTH `--- a/m b/spaced.md⇥` and
  `+++ b/m b/renamed.md⇥`, and `git show` puts the same trailing TAB on a spaced path it adds — while a
  space-free name (`+++ b/brand-new.md`), a `/dev/null` side, and a C-QUOTED name
  (`+++ "b/caf\303\251.md"`) each carry none. That TAB is the unified header's name/timestamp separator
  with an empty second field; keeping it reproduces v61's harm from the other direction — the door hands
  §28 `m b/n.md⇥`, a path that will not open and will not match a pathspec. So an UNQUOTED name ends at
  its first TAB, and a cut that leaves nothing names nothing (`parseFileLine` returns `null` rather than
  `path: ''`, the same rule v61 used for a half-header). A POSIX filename may contain a tab; this box
  cannot create one to measure it (`git mv` → `fatal: renaming 'tabbed.md' failed: Invalid argument`),
  which is stated here instead of worked around — a control character reaches the reader through git's
  C-quoted rendering, and that branch cuts nothing. (Every `⇥` in this section is a rendering of one
  literal TAB byte, which markdown would otherwise hide.)
- **The 51st tracked proof (`docs/evidence/agents/hunk-shape-proof.mjs`, 52nd script) refuses to be the
  only witness.** Its yardstick is git's own machinery, never this file's expectations:
  `diff --numstat -z`, `--name-only -z` and `--shortstat` over the same flags the door uses. `-z` is
  load-bearing, and measured: a rename makes plain `--numstat` print `1⇥0⇥x.md => m b/n.md` (fields
  TAB-separated, the two names joined by `=>`), a key the reader would have to rebuild by guessing,
  while `-z` gives an EMPTY path field
  followed by the pre- and post-image names as their own NUL-terminated records. §1 drives `git.diff`
  and §2 `git.staged` against that census (paths, per-file tallies, totals, and the `addedLines` a
  human sees). §3 transcribes the REPLACED rule and runs it over the same bytes, then asks history for
  the commit that wrote `!line.startsWith('+++')` (`git log -S`) so the claim "this shipped and was
  wrong" is a record, not a memory. §4 makes one REAL commit through the commit door — whose own sentence
  carries git's census (`main@… · 3 file(s) +2 −1`) — and reads it back through `git.show`, compared with
  `show --numstat`. §5 renames `x.md` into a `m b/` directory for real, adds a `++`-starting new file,
  and then WITNESSES the tab: it takes the name line out of git's own bytes, asserts that it ends with
  `⇥`, asserts `parseFileLine` returns the tab-free name, and asserts no door path carries a tab at all.
  §6 is the wiring check; §7 compares this repository's HEAD byte-wise after 5 door spawns.
- **What moved:** `isDiffHeaderPairLine` added to `gitTools.ts` and exported; `parseGitDiff`,
  `parseStagedDiff` and `parseShowDiff` each gained one local and lost their blanket prefix exception;
  `parseFileLine` cuts git's field separator. exec-host **233/233** (from 221: 7 in `gitTools.test.ts`
  — 5 for the position rule, 2 for the TAB — 3 in `gitStagedTool.test.ts`, 2 in `gitShowTool.test.ts`),
  52/52 proof scripts green, four root gates green (typecheck 8/8, lint 4/4, build 5/5, test 8/8 turbo
  tasks). Two already-committed sentences were re-counted in the same commit rather than left to rot:
  `git-aware-proof.mjs` asserted `+++ / --- headers never count as changes`, which is now false as
  phrased (it reads `git's name pair is not a change WHERE IT SITS`), and two unit-test titles that said
  headers are "never content" now say what is actually pinned.
- Honest bounds: this is a POSITION rule over git's own bytes, not a parser. It decides the two jobs
  apart where git's rendering makes them ambiguous; a CONTEXT line whose text begins `--- ` arrives as
  ` --- x` (git prefixes every line of a hunk) and is neither a name nor a change — v64 changes nothing
  about it, and nothing here claims it was measured as a case. `diff.noprefix` and `diff.mnemonicPrefix` are NOT in v46's forced-config table, so
  under a repo that sets them the pair lines carry no `b/` prefix, `parseFileLine` names nothing, and the
  reader keeps the header's split — the v61 fallback, unmeasured here and left as a candidate rather than
  fixed on speculation. `git.show`'s own `path` is passed IN by the caller, so the TAB clause changes what
  `git.diff`/`git.staged` hand out and not what `git.show` asks git for. `parseDiffStat` still reads only
  the LAST line of `--stat` output, and `git.diff`'s full-mode tally is still a denominator that v63
  proved can be a window — both recorded as v65 candidates. Nothing here touches argv, policy or env;
  DEMO MODE is unaffected (no Studio surface runs an exec host), and staging stays human (§28).

## Amendment 65 — v65 (exec-host): a repository's own diff config CHOOSES THE PREFIX every diff reader names files by — four keys make git print four sections that parse to zero files, and the pre-commit intent window called that `the index is EMPTY`, 2026-09

_Numbering: 65 was free when this was written (`git log --oneline -3` top = v64; this file's HEAD headings end at 64 and there are 62 of them — no `## Amendment 58` or `## Amendment 59` heading exists in HEAD; those two numbers live only in the concurrent session's stale working copy, which is why 58..59 are occupied while 65 is free). Recorded rather than hidden: the WORKING COPY of this file is a stale buffer a concurrent session holds uncommitted (it stops at 61 and lacks 62/63/64), so this section is spliced onto HEAD's blob with `git show HEAD:…` → `hash-object -w` → `update-index --cacheinfo` and nothing else in the file is touched. v64's own honest bounds named this exact hole — "`diff.noprefix` and `diff.mnemonicPrefix` are NOT in v46's forced-config table … the v61 fallback, unmeasured here and left as a candidate rather than fixed on speculation". This amendment measures it, finds TWO keys that amendment did not name, and fixes it at the layer the measurement picked._

- **The prefix was never ours.** Four doors read a unified diff, and one fact decides whether any of them can
  NAME a file in it: git's own `a/`/`b/` on the `diff --git` line. v32 through v64 read those prefixes as a
  given — `parseDiffHeader` is anchored to them, and so is v61's `parseFileLine` fallback. But four keys in
  the repository's OWN `.git/config` choose them: `diff.noprefix`, `diff.mnemonicPrefix` (which renders the
  pair as `c/`/`i/`), `diff.srcPrefix`, `diff.dstPrefix` — the last two found by probing the key family
  after the first two reproduced the bug. Measured on this box (git 2.52), in a throwaway repo with a
  four-change index — an add, a modify, a rename to a path containing a space, a delete — with ANY of the
  four set, `git diff --no-ext-diff --no-textconv --cached` still exits 0, still prints FOUR `diff --git`
  sections, still carries every hunk; the headers simply stop saying which half is which
  (`diff --git docs/gone.md docs/gone.md`). `parseDiffHeader` matches none of them, so `parseStagedDiff`
  returned ZERO files and `git.staged` — the door v43 built to show a human what is about to be recorded —
  answered `the index is EMPTY — nothing is staged, so a granted git.commit right now would have nothing to
  record` about an index git's own footer called `4 files changed, 4 insertions(+), 2 deletions(-)`. A §28
  reviewer weighing that sentence would be weighing an absence the door invented.
- **v46's hole, in the other layer.** v46 pinned the ENVIRONMENT so a repository cannot make git EXECUTE a
  configured helper. This is a repository deciding what a READ PRINTS — same ownership error, different
  layer. Fixing it there was measured and rejected: forcing `diff.noprefix=false` +
  `diff.mnemonicPrefix=false` through the counted-config table (which v46 grew from 4 slots to 5 for
  `core.quotePath`, and would have to grow again per key) leaves `diff.srcPrefix`/`diff.dstPrefix` free to
  re-break the rendering, and enumerating keys loses to any key git invents later. `--src-prefix=a/
  --dst-prefix=b/` on the command line restores all four (§0), keeps git's answer byte-identical in a
  repository that sets nothing (§4: sha256 over four shapes), covers `git show` and the `--stat` bodies by
  being the same two tokens in the same constant, and OUTRANKS the config file — measured with
  `diff.noprefix=true` AND `diff.srcPrefix=zz/` set together, where the headers did not move (§3). So
  `GIT_DIFF_FLAGS` is now four tokens, and the sentence v46 wrote about `diff.external` ("it is confined by
  the argv shape instead") is the precedent, not the exception. The env table stays at 5 forced slots; a new
  test pins that NO `diff.*` key is in it, so the two layers cannot silently trade a key back.
- **The door REFUSES the split rather than guessing it.** Under `diff.noprefix=true` git prints
  `diff --git x.ts x.ts`; a reader that stripped two characters from each name would report `ts`, a path
  that exists nowhere. Under `diff.srcPrefix=q/` the same reader prints `diff --git q/bin.dat b/bin.dat`,
  where stripping two characters returns `bin.dat` — CORRECT. One rendering wrong, the next right by luck,
  and nothing in the answer says which happened: that is v61's harm arriving from the opposite direction, so
  the reader keeps refusing, and now counts instead of trusting itself.
- **A section is countable WITHOUT naming it.** `diff --git` is the one line whose only job is "a file's
  section begins here", so `unnamableDiffSections(stdout)` counts the lines git printed structurally and
  `parseDiffHeader` could not split — the floor under every rendering bug, and the fourth member of the
  family v48 (`cutNotAbsence`), v52 (`refusedNotAbsence`/`unmergedNotice`) and v56 (`stdoutWasCut` /
  `budgetFlags`) built. `git.staged`'s 0-file branch now runs unmerged → unnamable → cut → EMPTY, so the
  EMPTY sentence is only ever said about a read the door could NAME, and `git.diff`/`git.staged` append the
  notice beside a PARTIAL tally too. Second clause, found while writing that test and of the same family as
  v64: an unread section used to be counted into the file BEFORE it, because only a recognised header
  started a new record — the phantom section's `---`/`+++`/`@@`/content lines landed on the last named
  path, so a 2-line added file plus one unread section printed `+5 −1 across 2 hunk(s)`. A tally that is
  short is checkable; a tally that is inflated by bytes the door never attributed is not. Both diff readers
  now END the current file at any `diff --git` line, named or not (§5).
- **The 52nd tracked proof (`docs/evidence/agents/prefix-proof.mjs`, 53rd script) holds the lie itself.**
  §0 sets each of the four keys in a real repo and measures git against git: `--shortstat` and
  `--numstat -z` name 4 changes, `parseDiffHeader` names 0 headers, `parseStagedDiff` returns 0 files, and
  the pre-v65 0-file branch — TRANSCRIBED into the proof, so the finding survives a rewrite of the source —
  says `the index is EMPTY` over those bytes. §1 runs TODAY's door over the same repository twice, and the
  v46 process is replayed by a spawn stand-in that drops v65's two flags on the way to git (the door cannot
  be asked to run a shape its own policy no longer names, and a hand-written argv there would be this
  file's claim, not the door's): v46 → `git printed 4 diff section(s) whose header this door cannot split
  into two names ("diff --git docs/gone.md docs/gone.md", …) · this door named 0 of them … it certainly
  cannot say the index is empty`; v65 → `index holds 4 change(s): 1 added, 1 modified, 1 deleted, 1 renamed
  · +4 −2 across 3 hunk(s)`, with per-file numbers equal to git's `-z` census. §2 is the cross-check that
  makes the old bug a reviewer's problem too: the `--stat` face never needed a prefix, so over the same
  bytes it always said 4 files. §3 drives two hostile keys at once plus `git.show`; §4 the byte-identity
  claim; §5 the boundary rule; §6 the wiring (both readers, exactly one call site each, all 5 diff shapes
  carrying both flags, and each of them still allowed by `planExec`); §7 compares this repository's HEAD
  byte-wise after exactly 7 door spawns.
- **What moved:** `GIT_DIFF_FLAGS` 2 tokens → 4; `unnamableDiffSections` + `unnamableSectionsNotice` added
  to `gitTools.ts` and exported (with the package bucket);
  `parseGitDiff` and `parseStagedDiff` each gained a section-boundary clause; the two doors' EMPTY/partial
  sentences and both tool descriptions now say what the door could not name. exec-host **244/244** (from
  233: +8 in `gitTools.test.ts` — 2 from the `it.each` over the two renderings, plus one each for the
  census's semantics, the refuse-vs-guess strip, the boundary rule, the notice wording, the shape that owns
  the prefixes and `git.diff`'s own 0-file sentence — +2 in `gitStagedTool.test.ts`, +1 in
  `gitEnvIsolation.test.ts`). Two witnesses of the old literal were re-counted in this same commit rather
  than left to rot: `gitEnvIsolation.test.ts` now pins the EXACT four-token array (and that no `diff.*` key
  entered the env table), and `config-proof.mjs` — which asserts a spawned `git show` argv verbatim — now
  interpolates `FLAGS` instead of spelling `--no-ext-diff --no-textconv`. 52/52 tracked proofs green
  (53/53 scripts on disk), four root gates green (typecheck 8/8, lint 4/4, build 5/5, test 8/8 turbo tasks).
- Honest bounds: this is a RENDERING claim, not a diff parser. The census only sees `diff --git`, so a
  rendering that prints no such line stays outside it — `git.staged`'s conflicted index is the one such case
  this package knows about, and it is handled first (v52's unmerged notice) and in the order unmerged →
  unnamable → cut → EMPTY; `--combined`/`cc` output would be another, and no shipped shape can ask for it.
  `diff.relative`, `diff.renameLimit` and rename detection can change WHICH sections git prints (a rename
  reported as a delete plus an add) without touching naming — the doors report what git printed and the
  census still agrees with it, but no case here measures that, so it is a candidate rather than a claim.
  `git.show`'s immunity is measured for these four keys only, and its `path` still comes in from the caller.
  `parseDiffStat` still reads only the LAST line of `--stat` output (v64's bound, open), `git.diff`'s
  full-mode tally is still a denominator v63 proved can be a window, and the test bridge's report still
  carries no v55/v56 facts — all three stay on the queue. Nothing here touches policy, env or the spawn
  contract beyond the two flags; DEMO MODE is unaffected (no Studio surface runs an exec host), and staging
  stays a human act while `git push` stays out of scope (§28, §9).

## Amendment 66 — v66 (exec-host): v63's WINDOW rule was written for `git.status` and left THERE — the three doors that read a DIFF went on phrasing a budget-trimmed read as the repository's census, so the fix is a WORDING one that no budget size can settle, 2026-09

_Numbering: 66 was free when this was written (`git log --oneline -3` top = v65; this file's HEAD headings end at 65 and there are 63 of them — no `## Amendment 58` or `## Amendment 59` heading exists in HEAD; those two numbers live only in the concurrent session's stale working copy). Recorded rather than hidden: the WORKING COPY of this file is that stale buffer (it stops at 61 and lacks 62/63/64/65), so this section is spliced onto HEAD's blob with `git show HEAD:…` → `hash-object -w` → `update-index --cacheinfo` and nothing else in the file is touched. This hole was not a surprise: v65's honest bounds closed with "`git.diff`'s full-mode tally is still a denominator v63 proved can be a window … stays on the queue", and v63's own section was explicit that it fixed ONE door's sentence. This amendment measures the other three._

- **Measured first, in the layer the earlier amendments left unmeasured.** A throwaway repo whose index holds 25
  changes — git's own footer: `25 files changed, 75 insertions(+), 75 deletions(-)` — read through the shipped
  doors at budgets derived from git's byte offsets, not from hopes:
  - a budget that keeps 8 of the 25 sections made `git.staged` answer `index holds 8 change(s): 8 modified ·
    +24 −24 across 24 hunk(s)`. Its only budget clause was v56's `output truncated at budget (stdout)` — a
    sentence that admits bytes were lost while the numbers go on meaning "the index". Over EVERY line boundary
    of that read: 774 of its 776 boundaries are cuts, and all 774 of them produced such a census-shaped answer
    (§3 measures the whole population — 0 of the 774 named no change).
  - `git.diff` said `1 files, +0 −0 (0 hunks)` about a file git counts at `+1 −1`, and `0 files, +0 −0
    (0 hunks)` about a 4-section, 2004-byte worktree diff — v48's `cutNotAbsence` was wired into `git.show`'s
    and `git.staged`'s zeros, and never into THIS door's zero.
  - `git.show` said `HEAD changed src/mod-09/a-long-file-name-9.ts · +12 −0` where git's own `--numstat` for
    that path is `60 0`: of its 65 cut windows (the face has 67 line boundaries), 59 short-count a file the
    same sentence calls changed.
- **The harm is PHRASING, not size.** Nothing above is a bug in the parser — every number was git's own number
  for the bytes that arrived. What is wrong is that a small count was worded as the repository's. So no
  arithmetic changed and no budget changed: the doors now say what KIND of number it is — `AT LEAST` inside the
  count itself, plus one sentence beside it.
- **One rule, three doors, at the sentence layer (v63's precedent, no new record fields).** `windowed =
  stdoutWasCut(result)` — v56's predicate, until now read by two doors — drives both, and
  `diffWindowNotice({ window, subject, named, partial })` is the fifth member of the family v48
  (`cutNotAbsence`), v52 (`refusedNotAbsence`/`unmergedNotice`), v56 (`budgetFlags`) and v65
  (`unnamableSectionsNotice`) built. `git.staged`'s subject is spelled out as "the index — what a granted
  git.commit would record", because that is the sentence a §28 reviewer is weighing.
- **A diff read's SHAPE lets the sentence be specific, and the shape was measured rather than argued.** The
  host keeps a PREFIX of whole lines (v48) and a diff section ends where the next `diff --git` begins (v65's
  boundary clause), so every change named BEFORE the last one in a window is byte-complete — only the last can
  be short. That is a two-sided finding, graded against git's own `--numstat` in the proof (§2), not a wording
  preference: at a budget that stops exactly at a section boundary the 8th change is WHOLE and only the
  9th never arrives; 900 bytes later the 9th is there and SHORT. So the door that reads several sections says
  the last change it reached MAY be the short one, and `cutIsInside` is true only for `git.show`, whose read is
  confined to one path by its own argv. Stated plainly because it was a §60 violation in my own first draft:
  "the cut landed inside X" is not knowable from a multi-section read, and the door cannot tell the two cases
  apart.
- **A `--stat` read keeps its census, for the same reason turned inside out.** git's stat footer is its LAST
  line, so any window that holds the footer holds the whole body. Measured over every line boundary of both
  stat faces (27 and 6 lines): 2 and 2 windows parse a footer, and none of the four was missing any part of the
  read — which is why no window clause is applied to a stat tally that names files. Their real hole was the
  zero, which is v48's sentence, not v66's: `git.diff` and `git.staged --stat` both refused at a 1-byte budget
  where they had been printing `0 files` / `index holds 0 file(s)`.
- **The 53rd tracked proof (`docs/evidence/agents/cut-tally-proof.mjs`, 54th script) sweeps the whole
  population without pretending to be cheaper than it is.** §1: git's census plus five WHOLE reads byte-exact
  and clause-free (the rule must not leak into an uncut answer). §2: real git at the two boundary budgets, with
  the "named before it are whole" claim checked against `--numstat`. §3: all 774 cut windows of the index read —
  0 census-shaped, 0 prefix violations, 0 wrong whole-claims, 0 invented names — and 0 of the 774 named no
  change, so every cut window of that read really did speak as a census before. §4: `git.show`'s 65 cut windows
  (its face has 67 line boundaries) — 60 floor the tally, 5 refuse to state one, 59 short-count git's own
  `60 0`, 0 phrase a census, and `floored + refused === cuts` so no window sits unclassified. §5: `git.diff`'s
  51 windows. §6: both stat
  faces. §7: ONE real commit through the commit door records 25 paths where the window said `AT LEAST 8` — the
  assertion is the numeric relation, not a string about a string. §8: this repository's HEAD byte-compared
  after 28 door spawns, all writes inside `os.tmpdir()`. §3's sweep is 774 door calls, so it replays git's
  recorded bytes through the SHIPPED host instead of paying for them; §3a buys that shortcut's legitimacy by
  comparing real git against the replay byte-for-byte at 12 budgets, in both the `detail` and the parsed files.
- **What moved:** `diffWindowNotice` added to `gitTools.ts` and exported (with the package bucket); the three
  doors' tally sentences gained `AT LEAST` plus the notice; three zero-branches gained v48's
  `cutNotAbsence`. exec-host **259/259** (from 244: +8 in `gitTools.test.ts` — the pure rule's two-sided case,
  the `cutIsInside` pair, `git.diff`'s cut and uncut sentences, its zero, its `--stat` refusal and the
  per-boundary sweep — +3 in `gitShowTool.test.ts`, +4 in `gitStagedTool.test.ts`). The 52 previously-tracked
  proofs stay green BY CONSTRUCTION: every non-cut sentence is byte-identical to what it said before, and the
  three literals they assert (`index holds 3 change(s): …`, `HEAD changed notes/widget.md · +2 −0 …`) were read
  back from HEAD's tests before editing and re-asserted in the new cases. 53/53 tracked proofs green (54/54
  scripts on disk), four root gates green.
- Honest bounds: this is a WORDING rule, and it lives in the sentence, not in the record. A door's structured
  output still prints `truncated: true` without `truncatedStreams`, so a reader who consumes `totals` and skips
  `detail` can still take a window for a census — that is now the sharpest remaining gap and the next candidate.
  The `named`/`partial` numbers are this door's parse of the surviving bytes, so they inherit v64's and v65's
  bounds (a body line wearing a header's shape, a prefix the repository chose) — the notices are siblings, not
  substitutes. `git.diff`'s subject is "the working tree"; `diff.relative` would make that a narrower tree and
  no case here measures it. Nothing here changes what git is ASKED to do or how many bytes come back: a door
  with budget to spare still reads the whole pipe. `parseDiffStat` still reads only git's last line (v64's
  bound, open) and the test bridge's report still carries no v55/v56 facts. DEMO MODE is unaffected (no Studio
  surface runs an exec host), and staging stays a human act while `git push` stays out of scope (§28, §9).
- Recorded on the way, because a sweep that goes red is information: the first full 54-script run of this
  increment had ONE red, and it was not exec-host's — `provider-proof.mjs` (runtime lane) failed its
  snapshot round-trip assertion (`deepEqual(revived.index(), provider.index())`). Traced by removal, not by
  guessing: with this session's `ROADMAP`/clause DRAFT files moved out of the tree the proof is green (216
  files indexed, vs 220), because a markdown file with no heading yields a chunk whose `heading` is
  `undefined`, and a JSON snapshot drops that KEY entirely — so in-memory and revived chunk objects stop being
  deep-equal for any repository containing a heading-less `.md`. No exec-host file is involved, and the fix
  belongs to the lane that owns `codeIndex.ts`/`indexStore.ts`, whose `agents/runtime/src/index.ts` is dirty in
  this same working tree — so it is REPORTED here and across the lane boundary, not patched here. What this
  increment did do is stop polluting the measured tree: doc drafts now live outside the repository, and a
  heading-less `.md` is a known trigger for that proof rather than a surprise.

## Amendment 67 — v67 (exec-host): a repository can PAINT the bytes every door parses — `color.*` wrote ANSI escapes and `log.decorate` wrote git's OWN refs INTO the fields the parsers read, and four doors answered at exit 0 that the thing was not there, 2026-09

_Numbering: 67 was free when this was written (`git log --oneline -3` top = v66 `8a7bbbd`; this file's HEAD headings end at 66 — 66 of them; `## Amendment 58`/`## Amendment 59` still exist only in the concurrent session's stale working copy). The WORKING COPY of this file is still that stale buffer, so this section is spliced onto HEAD's blob with `git cat-file blob HEAD:…` → `hash-object -w` → `update-index --cacheinfo` and nothing else in the file is touched._

- **Measured first, in the layer v46 and v65 both left standing.** v46 confined what a git command may DO
  (`diff.external`, `core.fsmonitor` — commands wearing a config key) and v65 what it may PRINT about a path's
  PREFIX. Neither asked whether the BYTES every parser reads belong to the repository at all. They need not:
  `color.ui`/`color.status`/`color.diff` wrap git's own output in ANSI escapes and `log.decorate` prints git's
  refs inside `--oneline`'s subject, and a door that cannot see the start of its line says the thing is not
  there. `color-proof.mjs` §1 measures five faces in a throwaway repo holding 3 commits, 1 staged change and 1
  unstaged edit — escape sequences with the pin removed, then re-applied: `git status --short` 4 → 0,
  `git diff --cached` 19 → 0, its `--stat` face 2 → 0, `git log --oneline` 26 → 0 across 3 lines,
  `git show --format=` 19 → 0. Four FALSE ABSENCES came out of exit 0 (§3, replaying the recorded bytes through
  the SHIPPED parsers): an index holding ONE change parsed to zero files, which is the sentence
  `the index is EMPTY — nothing is staged, so a granted git.commit right now would have nothing to record`; a
  3-commit history parsed to `{commits: [], skipped: 3}`, which the door prints as `0 commit(s)`; the two dirty
  files came back classified `other` with PATHS beginning `[31mM`; and HEAD's painted
  `+export const staged = 3;` was not read as an addition, so the door that confirms WHAT a commit recorded
  handed back no content at all. The first two are the same shape as v48's and v65's worst findings — an
  absence a §28 reviewer is asked to weigh, stated by a door that had just been handed the thing.
- **The rule that decided the layer is per-COMMAND, and it is measured rather than argued: a colorspace with a
  flag is pinned by the argv; a colorspace without one is pinned by the env.** `git status` and `git commit`
  refuse BOTH `--no-color` and `--color=never` with exit 129 (§1 asserts all four refusals), so their only pin
  is a key of `GIT_FORCED_CONFIG`; `diff`, `log` and `show` accept `--no-color` at exit 0, so the argv owns
  theirs — which is also why `color.diff` is asserted ABSENT from the table. The second half of the rule came
  from measuring the tempting one-key fix and watching it fail: a forced `color.ui=false` left a repository's
  `color.status=always` painting 4 places (4 in, 4 out), because git resolves a colorspace's OWN key before the
  umbrella. So `color.status` is the load-bearing key and `color.ui` is recorded as the umbrella for the
  colorspaces no door reads yet — not claimed to fix any face this proof does not measure, the way v46's
  `GIT_CONFIG_NOSYSTEM` is belt-and-braces rather than a finding.
- **Decoration is a SECOND colorspace, and the color flag does not touch it.** Measured on the same history:
  `--no-color` alone removes all 26 escapes and leaves git's own refs in the subject — a hash followed by
  `(HEAD -> main, tag: v1.0, feature)`, still part of the one field this door names. Hence `GIT_LOG_FLAGS =
  ['--no-decorate',
  '--no-color']`, spread into BOTH the policy shape and the run argv so the gate and the process cannot diverge.
- **Why the fix is a pin and not a strip — recorded because the strip is the design a reader would reach for.**
  The fixture's newest commit is TITLED `(HEAD -> main) I titled myself like a decoration`. With both flags on,
  §4 asserts the output STILL contains the string `(HEAD -> main)` — as the title git was handed — while `tag:`
  appears nowhere. So a reader that deleted "decoration-shaped text" would have destroyed a real commit subject,
  and nothing inside the field distinguishes the two. The same argument covers ANSI: git's rendering and the
  repository's bytes land in the same field, so only the source can be confined. What the door CAN assert it
  checked against git's own `--format=%s` — a format that has never had room for a ref — byte for byte, 3/3.
- **Two measured negatives, kept in the proof because they bound the claim.** The `--stat` face IS painted
  (`1 ESC[32m+ESC[m`) yet survives: `parseDiffStat` reads git's NUMBER column, not the colored bar, so painted
  and pinned parses are deep-equal — asserted as an equality, so the day the bar becomes load-bearing that row
  goes red instead of describing a bug that has moved. And `git show --format=` needed only the color half: 19
  escapes reach that face while no ref decoration does, because an empty format prints no subject — so the
  content door gained the one flag `GIT_DIFF_FLAGS` already carries and no second list.
- **Cost, measured rather than promised.** §6 removes the config and compares the pinned argv with the shape it
  replaced, on all five faces: byte-IDENTICAL output (33/272/51/114/284 bytes), each face asserted non-empty so
  the equality is not a pair of silences. That is why the 48 tracked proofs that never mention color stayed green
  untouched — and why the 5 that transcribe a pinned argv did not.
- **What moved.** `GIT_DIFF_FLAGS` 4 → 5 tokens (`--no-color`, shared by the three diff doors and `git.show`);
  `GIT_LOG_FLAGS` new, exported through the package bucket, and in `gitLogPolicy`'s one allowed shape plus its
  run argv; `GIT_FORCED_CONFIG` 5 → 7 keys, which moves every counted slot. exec-host **262/262** (from 259: +1
  `gitEnvIsolation.test.ts` — color keys appear in the table ONLY for a command with no color flag, the rest of
  the table is the shape — and +2 `gitLogTool.test.ts`: a decoration is not a subject, an escape-prefixed line
  is `skipped` and never guessed into a commit). The old-contract re-count this increment owes (fourth
  increment running): the sorted-slot list 5 → 7 in `gitEnvIsolation.test.ts`, and `gitTools.test.ts`'s
  "a caller cannot opt out", which now plants `color.ui` at slot 7 past a 7-key table so the assertion is that
  the COUNT is ours.
- **Five witnesses re-counted in this same commit, index-only** (their worktree copies belong to the concurrent
  lane, so each was spliced onto HEAD's blob and staged with `update-index --cacheinfo`):
  `config-proof.mjs` derives 12 argv shapes from one `FLAGS` literal, so one hunk moved all of them;
  `gitlog-proof.mjs` now allows only the pinned shape and asserts v37's own `git log --oneline -n 5`
  DEFAULT-DENIES; `confirm-proof.mjs`'s planned-window spawn args; `prefix-proof.mjs`, where the stand-in that
  replays v46's process must now drop v67's color token too or the label lies; and `porcelain-path-proof.mjs`,
  whose §0 slot table shifted twice (quotePath `KEY_3` → `KEY_5`, `COUNT` '5' → '7') and whose "shipped table
  minus v61's slot" counterfactual is now DERIVED from the shipped env instead of hand-copied — the hand copy
  was exactly the thing that went stale. 54/54 tracked proofs green (55 scripts sit in the directory), four
  root gates green.
- Honest bounds: this pins the five doors that PARSE, plus the umbrella. `git.commit` is not a parser of colored
  output — §5 measures that its advice block carries 4 escapes unpinned and 0 pinned at the same line count, and
  that the LAST line, the one `gitVerdict` reads, is plain in BOTH faces, so that pin covers the block rather
  than the verdict line. `color.branch`/`color.interactive`/`color.grep` reach nothing this package reads. No
  door's structured record changed shape, so a consumer that reads `files`/`commits`/`addedLines` and skips
  `detail` inherits exactly what the pinned parse returned — which is the point of pinning the source instead of
  teaching the reader. `NO_COLOR`/`TERM`/`color.auto` were treated as hypotheses and are relied on nowhere: an env
  that happens to be unkind is not a gate. `parseDiffStat` still reads only git's last line (v64's bound, open),
  the test bridge's report still carries no v55/v56 facts, and a door's structured output still prints
  `truncated: true` without `truncatedStreams` (v66's sharpest gap, still open). DEMO MODE is unaffected (no
  Studio surface runs an exec host), staging stays a human act, and `git push` stays out of scope (§28, §9).

## Amendment 68 — v68 (exec-host): a LOG read's count is a FLOOR and its entries are not — v66's window rule reached the sixth door, and the one it had to say differently is that newest-first survives the cut, 2026-09

_Numbering: 68 was free when this was written (`git log --oneline -3` top = v67 `9ea5114`; this file's HEAD headings end at 67 — 66 of them; `## Amendment 58`/`## Amendment 59` still exist only in the concurrent session's stale working copy). The WORKING COPY of this file is still that stale buffer (it stops at 61), so this section is spliced onto HEAD's blob with `git cat-file blob HEAD:…` → `hash-object -w` → `update-index --cacheinfo` and nothing else in the file is touched._

- **The bug was v66's own sentence, in a door v66 did not touch.** v66 opened with "v63's WINDOW rule was written for `git.status` and left THERE — the three doors that read a DIFF went on phrasing a budget-trimmed read as the repository's census", and named the record-layer gap as the next candidate. It did not look at `git.log`, which speaks its own tally: `git.log → exit 0: ${commits.length} commit(s)`. Measured on this box (git 2.52) in a throwaway repo holding 25 commits — git's own `rev-list --count HEAD` = 25, `git log --oneline --no-decorate --no-color -n 25` = 25 lines / 1653 bytes — **every one of the read's 24 whole-line cut budgets printed a census**: `AT LEAST` appeared nowhere, and the only budget wording beside the number was v56's `(output truncated at budget (stdout))`. At `budgetOf(8)` the door said `8 commit(s)` about a pipe that held 25 lines; at `budgetOf(1)` it said `1 commit(s)` about the same history. That is the §28-facing species of sentence v63 and v66 exist to stop, and this door sits in the plan's CONFIRM step (v37/v38), so it is the one an agent's own commit is checked against.
- **The finding that decided the wording is that a log read is NOT a diff read — and the difference is symmetrical, not a weakening.** A diff section may be cut MID-BODY, so v66 had to hedge: the last change the read reached `MAY` be short, and the ones before it are whole. A log line names exactly ONE commit, and git prints them **newest first**, so a cut cannot shorten an entry at all — it can only stop handing over the OLDER ones. Measured both ways (§3, all 24 windows): 0 windows lost the newest entry, 0 windows named a survivor that disagrees with git's own line for that position, 0 windows overcounted the history — while all 24 had been speaking a census. So the sentence now carries TWO claims that point in opposite directions and are both true: `AT LEAST 8 commit(s)`, and `newest …` unchanged. v66's hedge is asserted ABSENT here (`MAY stop`, `hunk`, `the cut landed inside`) because a hedge about a shortened entry would be a new false statement about a read that cannot produce one.
- **A floor needs a denominator, and this is the only door here that owns one.** `logWindowNotice({ window, read, asked })` names the bound the DOOR asked git for (`this door asked for 25`), which is its own request, not a claim about the repository — the door cannot know how many commits exist, nor how many git printed into the pipe, only that git printed more than survived. The wording says exactly that: `the count is a FLOOR over the read, not a census of the history: git printed more on that pipe, and on a newest-first log what never arrived is OLDER than every entry named here`.
- **The zero case is v48's, and v68 keeps its hands off it.** A budget that leaves no whole line answers `0 commit(s) · no complete line survived the output budget — this is NOT a statement that the repository has no commits`. Asserted with two negative guards: no `AT LEAST` (a floor of nothing is not a floor of a count) and no `OLDER than every entry named here` (a door that names no entries cannot say what is older than them). The `floor = stdoutWasCut(result) && commits.length > 0` predicate is the whole rule, built on v56's predicate that v63 and v66 already read.
- **v37's money claim survives the cut that floors its count — measured with a real commit, not by argument.** §4 stages a change as the human, grants it through the commit door (the history then holds 26 by git's own count), and reads it back through budgets that keep 1, 2 and 5 lines. In all three the door's newest entry is byte-equal to the commit record's hash — the equality `gitlog-proof.mjs` and `confirm-proof.mjs` were built to assert — while the SAME read reports 1, 2, 5 commits against a census of 26. Two doors' facts, one sentence, each labelled as what it is.
- **Cost, and the two-sided discipline again.** An uncut read is worded exactly as before v68, and §6 proves the rule keys off a CUT rather than off a small number: the unbounded read and a budget landing exactly on the LAST line boundary return the SAME sentence byte for byte (`git.log → exit 0: 25 commit(s) · newest …`), with `truncated: false` on both. §6 also rebuilds the pre-v68 sentence from the door's own bytes — strip the clause and the `AT LEAST`, and the string is the census the amendment is about — for one window explicitly and for all 24 in §3, so "all 24 were censuses before" is measured here rather than remembered from the probe.
- **What moved.** `logWindowNotice` added to `gitTools.ts` and exported (with the package bucket); `gitLogTool.ts` reads `stdoutWasCut` through it and floors its own count; `GIT_LOG_FLAGS`/policy/argv UNCHANGED (v68 touches no bytes git is asked for, so no argv witness moves and none of the 54 tracked proofs needs a re-count for a shape). exec-host **268/268** (from 262: +3 `gitTools.test.ts` — the pure rule's silence on an uncut read, its floor+direction+asked wording with the diff hedges asserted absent, and the two notices kept as siblings rather than a shared template — and +3 `gitLogTool.test.ts`: a cut read floors and keeps its survivors, an uncut read is byte-identical to pre-v68 AND agrees with a last-line-boundary budget, and a cut that also costs a hashless line floors the count while v37's `counted not guessed` skip stands beside it; v48's zero-budget case gained two negative guards in the same commit). The 55th tracked proof (`docs/evidence/agents/log-window-proof.mjs`, 56th script) spends 34 real git processes and asserts the spawn count equals its own door-read count, so no "window" in §3 was a replay.
- Honest bounds: this is still a WORDING rule and it lives in the sentence, not in the record — v66's sharpest gap is untouched by v68, and a consumer reading `commits.length` while skipping `detail` still takes a floor for a census. `git.status`'s `N entries (M modified)` and `git.log`'s `N commit(s)` are the same family and both now say their piece only in words. The floor is over THIS door's read: `asked` is what the door requested, never what the repository holds. `skipped` (v37's counted-not-guessed lines) is likewise a count of surviving bytes. Nothing here changes the argv, the env pins, the budgets or the gates — a door with budget to spare still reads the whole pipe and still says nothing about a cut it did not make. DEMO MODE is unaffected (no Studio surface runs an exec host), staging stays a human act and `git push` stays out of scope (§28, §9).

## Amendment 69 — v69 (exec-host): the window claim moves from the SENTENCE into the RECORD — one derived key on every door that parses, and the aggregate bit is shown, with a real two-pipe process, not to be the same question, 2026-09

_Numbering: 69 was free when this was written (`git log --oneline -3` top = v68 `14f02a4`; this file's HEAD headings end at 68 — 67 of them; `## Amendment 58`/`## Amendment 59` still exist only in the concurrent session's stale working copy). The WORKING COPY of this file is still that stale buffer, so this section is spliced onto HEAD's blob with `git cat-file blob HEAD:…` → `hash-object -w` → `update-index --cacheinfo` and nothing else in the file is touched._

- **The gap was named twice and lived in a layer nobody had fixed.** v66 closed with "the rule lives in the SENTENCE, not in the record. A door's structured output still prints `truncated: true` without `truncatedStreams`, so a reader that consumes `totals` and skips `detail` can still take a window for a census — that is now the sharpest remaining gap and the next candidate", and v68 restated it. Seven amendments (v48 `cutNotAbsence`, v52 `refusedNotAbsence`, v56 `budgetFlags`, v63 `treeSplitNotice`, v65 `unnamableSectionsNotice`, v66 `diffWindowNotice`, v68 `logWindowNotice`) all made a door SAY that a number is a count of what it READ; every one of them writes into `detail`. The record — the part other code reads — carried only v30's single `truncated` bit, which is a statement about TWO pipes.
- **Measured before written, including against my own story.** §1 re-runs v56's discipline on eight real git states at exit 0 (`status --short`, `diff`, `diff --cached`, its `--stat` face, `log --oneline`, `show --format= -- path`, `rev-parse`, `ls-files`): stderr carried **0 bytes in 8/8**. So this amendment does NOT claim a git door ever muted a number with bytes on the other pipe — a git door's `truncated` happens to coincide with its parsed stream today. What is fixed is the layering: the host computed `truncatedStreams` (`execHost.ts`), every door READ it to write its own clause (`budgetFlags`, `stdoutWasCut`), and then dropped it before handing the record on.
- **One derived key, not a forwarded list.** `windowField(result)` in `gitTools.ts` returns `{ windowed: true }` exactly when `stdoutWasCut(result)` — the same predicate every clause already uses — and `{}` otherwise, so the key is ABSENT rather than false, which is v55's `descendantsStopped` and v56's `truncatedStreams` precedent and what keeps every uncut record byte-identical. The door hands on the CONCLUSION, not the host's pipe list, because a consumer that had to compute `truncatedStreams.includes('stdout')` itself would be a second copy of the rule (v51's and v54's one-source argument, in the other direction). `'truncatedStreams' in record === false` is asserted per door for that reason.
- **Spread into the seven faces that PARSE, refusal branches included:** `git.status`, `git.diff` and its `--stat` face, `git.staged` and its `--stat` face, `git.log`, `git.show`. A refusal record reports parsed numbers too (`files: []`, `commits: []`, `summary`), and git can put the reason on stderr while a status letter rides on stdout at exit 128 (v52 measured it) — so the bit is about the stream, not about the outcome.
- **The aggregate bit is proven insufficient with a real process, not by argument.** §3 runs a stand-in program through the confined host at a 512-byte ceiling: 28 bytes of answer on stdout and 9 000 on stderr. It comes back `truncated: true`, `truncatedStreams: ["stderr"]`, `exit 0`, and **stdout whole — 28 of 28 bytes**. A consumer holding only `truncated` would floor numbers that need no flooring; `windowField` on that same result returns `{}`, and the unit case `gitTools.test.ts` now pins that pair (a door's own cut-stderr refusal carries `truncated: true` and no `windowed`, and its sentence has named `(stderr)` all along — v56).
- **Coupling, door by door: the record's bit and the sentence's clause are the same fact.** §2 drives all seven faces twice — once with budget to spare, once at a budget derived from git's own row bytes (98 B over a 40-change index, keeping 3 of 40 porcelain rows) — and asserts both directions on the SAME read: uncut ⇒ no key AND no clause; cut ⇒ key present AND the sentence carries one of the family's markers (v48's `no complete line survived`, v56's `output truncated (pipe)`, v63's `the read was CUT`, v66's/v68's `AT LEAST`, v65's notice). 7 × 2 = 14 reads, and the agreement is `YES` for every one. §4 closes the "did anything else move?" question structurally: strip `windowed` from a cut record and its key set is EXACTLY the uncut record's key set — one key added to a record, zero moved, zero renamed.
- **Cost, and the honest scope.** The fixture needed to grow before §2 could measure anything: a log door with one commit, and a show door pointed at a path HEAD never touched, both answer in bytes small enough to fit any budget, and the first run of this proof said so by failing (`false !== true` on `windowed`) — a door whose whole answer fits cannot demonstrate a window, so the repository now carries 8 more commits and a 40-line HEAD change for that path. exec-host **271/271** (from 268: +3 `gitTools.test.ts` — the pure rule's four cases, the door pair, and the cut-stderr refusal). No argv, env pin, budget, policy shape or gate moved, so no witness proof needed a re-count and the sweep of the 55 previously tracked proofs is this increment's "nothing else moved" assertion. `git.commit`'s record was deliberately left alone: its numbers come from git's own commit echo, which v48/v52 already police in prose, and extending the key there is queued rather than claimed.
- Honest bounds: `windowed` says what v66's notices say — the parsed pipe lost bytes — and nothing about HOW MUCH was lost; it is absent on a killed read (`killedByBudget` fails `ok` first, v63's finding). A consumer still has to look at the key: `truncated` remains what it always meant (v30, both pipes), and the two are not interchangeable — which is the point. The structured record still carries no count of the bytes that did not arrive, so a reader cannot size the window, only know there is one. `execTestRunner`'s report carries neither v55's nor v56's facts (open since v60), and the chain's stage-level calls still live on no record (#117). DEMO MODE is unaffected — no Studio surface runs an exec host; staging stays a human act and `git push` stays out of scope (§28, §9).

## Amendment 70 — v70 (exec-host): the WRITE door's record joins the window family — a budget trims what the door heard, never what git did, and `ok: true` with no record must not read as a refusal, 2026-09

_Numbering: 70 was free when this was written (`git log --oneline -3` top = v69 `eb0d87c`; this file's HEAD headings end at 69 — 68 of them; `## Amendment 58`/`59` exist only in the concurrent session's stale working copy). That stale working copy is why this section is spliced onto HEAD's blob with `git cat-file blob HEAD:…` → `hash-object -w` → `update-index --cacheinfo` rather than edited in place._

- **What v69 left open, measured first.** v69 gave the window claim to every door that PARSES and named `git.commit` as the deliberate exception. A probe (`.scratch/v70-commit-echo-probe.mjs`, 40 staged files committed through the shipped door at four budgets) showed the exception is not cosmetic: git's commit echo is TWO lines — `[main 2fd0f2f] <subject>` then the stat footer — so a budget can keep the header and lose the footer (`record.stat` becomes `null` at 121 bytes), or lose both (`record` ABSENT from the output entirely at 100 bytes). **HEAD moved on every single run**, because a budget trims what the door heard, never what git did. So the record a §28 reviewer journals can show `ok: true, exitCode: 0` with NO `record` at all, and nothing in the record distinguished "git's echo was cut" from a door that has no fact to carry.
- **The fix is the same one key, on both branches.** `windowField(result)` goes onto `git.commit`'s record exactly as it did on the seven parsing faces in v69 — present when and only when the pipe THIS door parsed was cut, absent rather than false — which makes `record: absent` + `windowed: true` read as "the commit landed and git's summary did not arrive", and `record.stat: null` + `windowed: true` as the same statement about the footer alone. No new rule, no new field, no second copy of the predicate.
- **Coupling proven with real commits, not a fixture echo** — `commit-echo-proof.mjs` (57th tracked proof, 58th script). §1 establishes the control: at a generous budget and again at 600 bytes the door answers `main@… · 40 file(s) +40 −40` with a full record and NO `windowed`, which is what measures the echo's real size (both reads are whole, so the two shapes below are not a matter of degree). §2 drives the two derived boundaries — one byte past the header line, and twenty bytes short of it — and asserts against git OUTSIDE the sandbox each time: HEAD moved, exactly one commit appeared in `rev-list --count`, `record.hash` equals the new HEAD's abbreviation, `record.subject` equals the message verbatim, `stat` is `null` where the footer was lost, and `record` is absent where the header was. §3 asserts the door never implies a refusal on those reads (no `REFUSED` wording; v52's `refusedNotAbsence` stays reserved for git actually refusing) while its sentence does name the pipe. §4 round-trips all three shapes through the JSON the ledger is made of and checks the key survives into a cold read, including the nested record with its null stat. §5 compares this repository's HEAD byte-wise after 9 real granted commits and pins `spawns === doorReads`.
- **What moved.** `gitCommitTool.ts`: `windowField` on the success and refusal records, plus the measured note in the door's comment; nothing else — no argv, policy, budget, gate or parser changed, which is why no witness proof needed a re-count and why the sweep is this increment's "nothing else moved" assertion. exec-host stays **271/271** (the commit door's existing fake-spawn cases assert the sentence and the parsed record, not the key set, so the added key is invisible to them — and the shapes that matter here can only be measured against git's real echo, which is what the proof is for).
- Honest bounds: `windowed` still says the parsed pipe lost bytes, not how many, and the door still cannot confirm its own commit independently — `git rev-parse HEAD` is a second command, and this policy allows exactly one argv shape (`git commit -m *`), so the door would have to be given a power to be able to check itself; it reports what survived of git's echo and says which pipe was cut instead. A `record` that is absent is also what git produces for a commit that printed nothing at all, and the key does not distinguish those two; the sentence does (`stated, not guessed` beside `output truncated at budget (stdout)`). The ledger's own reader is unchanged (v49/v50/v54 validate record kinds, not door keys), so a cold reader that ignores `windowed` still sees only `ok`/`exitCode`/`record`. `execTestRunner`'s report carries neither v55's nor v56's facts, and a chain's stage-level calls still live on no record (#117). DEMO MODE is unaffected; staging stays a human act and `git push` stays out of scope (§28, §9).

## Amendment 71 — v71 (runtime + exec-host): a TEST REPORT's verdict is the command's own, but its evidence is quoted from pipes the budget may have cut — so the report names them, 2026-09

_Numbering: 71 was free when this was written (`git log --oneline -3` top = v70 `d6dfaf7`; this file's HEAD headings end at 70 — 69 of them; `## Amendment 58`/`59` exist only in the concurrent session's stale working copy, and its working copy of THIS file is still that stale buffer, so the section is spliced onto HEAD's blob via `git cat-file blob HEAD:…` → `hash-object -w` → `update-index --cacheinfo`.)_

- **The last place the family stopped at was one layer above the doors.** v48/v52/v56/v63/v65/v66/v68 put "this is a count of what I read, not a census of the repository" into door sentences; v69 moved that claim into the doors' RECORDS; v70 finished the write door. One artefact outside the doors was still carrying the old shape: `TestReport`, the object the dock's verification chips render (v33), the ledger journals (v28) and the commit-after-green gate consults (v36). v60 gave its SENTENCE both pipes under their own labels, and its structured fields stayed `engine/ok/total/passed/failures/detail` — so a consumer reading `passed/total` could see `1/1 ✓` while the answer it had not seen was 2 500 bytes of stdout trimmed to 2 000.
- **What a cut can and cannot change, said precisely.** It cannot change the verdict: `ok` is the command's own exit code (`ran ∧ exit 0 ∧ !killedByBudget ∧ no spawnError`, v31's rule), and this increment does not touch that — an exit-zero suite that overflowed its pipe is still green, because the exit code IS the verification. What a cut does change is the EVIDENCE quoted beside that verdict, and until now nothing in the report said which pipe had been shortened.
- **The fix is one optional field, spelled the host's way.** `TestReport.truncatedStreams?: Array<'stdout' | 'stderr'>`, copied by the bridge from `ExecRunResult.truncatedStreams` — the list v56 already computes, already orders by stream rather than by arrival, and already keeps ABSENT rather than empty when nothing was cut. No new predicate, no second source: the bridge hands on a fact it had already used to write `detail`, which is exactly the v69 finding one layer up (the host computed it, the reader used it, the record dropped it).
- **Measured with real processes** — `report-window-proof.mjs` (58th tracked proof, 59th script), because "exit 0 with a cut pipe" is precisely the case a fake spawn can state and a real one must show. §1 runs four programs at a 512-byte ceiling: 4 000 bytes on stdout and exit 0 → `ok: true`, list `["stdout"]`; 4 000 bytes of noise on stderr beside an answer that fits → `ok: true`, list `["stderr"]`, the ANSWER untouched (v53's per-stream ceiling is what makes this shape reachable at all); both pipes cut and exit 1 → `["stdout","stderr"]` in reader order; a quiet program at a generous ceiling → NO key at all. §2 writes two of those reports through `appendTestReport` and reads them back cold: the list survives the JSONL and so does its ABSENCE, which is what stops a replayed report from growing an empty list a reader has to interpret. §3 fixes the three shapes that must carry nothing — a vacuous `only` miss (nothing ran), a §28 refusal (filed under v60's `never-ran`, no pipe opened), and a clean run — because a key that is also present when nothing was cut tells a consumer nothing.
- **Cost, bounded honestly.** exec-host **272/272** (from 271: one extended case — the existing "a budget cut may not change the VERDICT" test now also asserts the field — and one new case covering all five report shapes), the runtime change is additive and optional so `predicateRunner`, every in-process host and the Studio chips are unaffected (all 8 turbo tasks green, and no proof asserted a report's exact KEY SET — the existing ones use `toMatchObject`/`deepEqual` on `total/passed/failures`, which is why 57 tracked proofs swept green untouched). §4 states the boundary rather than inflating it: v60 measured the one wired suite command (design-model vitest) at 592 B stdout / 0 B stderr against a 2 000 B per-stream ceiling, so this hazard is LATENT in the bridge, not a mislabel some shipped suite ever made — and this proof does not re-run that suite to re-prove it.
- Honest bounds: nothing DISPLAYS the new field yet — the dock chip still prints `passed/total` (browser-verified surface work belongs to the lane that owns `AgentPanel`), so v71 makes the fact available to a cold reader rather than changing what a human sees; `descendantsStopped` (v55) still reaches the report only in prose, since it is an exec-host union the runtime contract does not name; the vacuous `only`-miss report has no `failures` at all and is still told by its `total: 0`; and `registerTestTools` hands the report on nested under `report`, so a consumer that reads only the tool's top-level `ok`/`detail` still bypasses every field this family has. DEMO MODE is unaffected (no Studio surface runs an exec host), staging stays a human act, and `git push` stays out of scope (§28, §9).

## Amendment 72 — v72 (Studio dock): the chip a human reads must say when a green ✓ quotes a window — v71's field, finally consumed, and not by pretending a browser can reach it, 2026-09

_Numbering: 72 was free when this was written (`git log --oneline -3` top = v71 `13d2644`; this file's HEAD headings end at 71 — 70 of them; `## Amendment 58`/`59` exist only in the concurrent session's stale working copy, and this section is spliced onto HEAD's blob with `git cat-file blob HEAD:…` → `hash-object -w` → `update-index --cacheinfo`, exactly as in v66–v71, because their worktree copies of these docs are behind HEAD by several sections.)_

- **Why this increment exists at all.** v71 closed with the honest complaint: the field existed and nothing read it — “nothing DISPLAYS the field yet … a consumer reading only `test.run`'s top-level `ok`/`detail` still bypasses every field this family has produced.” The consumer that matters is 6 lines of code: `testChipsFor(outcome)` (v33) maps a `TestReport` to a chip, and `AgentPanel`'s `TestChips` renders `✓ <engine> passed/total` in green. So a run verified by an exec-host command whose answer pipe was cut looked exactly like a run whose evidence was whole — the same “window spoken as a census” that v63/v66/v68/v69/v70/v71 have each fixed one layer at a time, now at the layer a person actually reads.
- **The shape of the claim, kept two-sided.** `TestChip` gains `evidenceCut: string | null`, derived by joining the report's `truncatedStreams` with `' + '` — the same joining v56 chose for its budget clause, so no new vocabulary enters. It is `null` for an in-process predicate report (no pipes to cut), never an empty string. The renderer does NOT redden a cut: `ok` is still the command's own exit code (v31's rule, re-asserted in v71), so a cut chip turns **amber** (`#e0c060` against the existing `#7dd97d`/`#ff7a7a` pair) and appends `⚠ evidence cut: stdout`. Red would claim the suite failed; green would claim the quote was complete. Neither is what happened.
- **Evidence is headless, and that is stated rather than papered over.** `testChipsFor` is a pure function over a `RunOutcome` — the same class of change v33 and v41 evidenced with studio's headless vitest rather than a browser (v41's precedent, recorded in memory). Studio's suite is **115/115** (from 114: one new case over three reports — `['stdout']` → `'stdout'` on a green chip, `['stdout','stderr']` → `'stdout + stderr'` in reader order, an in-process report → `null`) and **two existing strict `toEqual` chip expectations were re-counted in this same commit**, because they pinned the old key set — the fifth consecutive increment that had to pay that account rather than leave a proof asserting a contract that no longer exists.
- **What was NOT claimed.** The browser-reachable path is unchanged by design: no Studio surface runs an exec host (that has been true since v30 moved spawning into a separate package, and v47/v48's proofs keep saying `provenance.mode='demo'` for the dock), so no browser session today can produce a report carrying `truncatedStreams`, and no visual change was verified — the honest statement is that the marker is reachable only by a caller that supplies an exec-host runner, which the dock does not do. If a future increment wires one, this chip becomes observable and will need a browser pass.
- **Cost, and what moved:** `apps/studio/src/lib/agentDock.ts` (+8 lines: one field, one derivation, one doc comment), `AgentPanel.tsx` (+3/−2: colour, tooltip, suffix), `agentDock.test.ts` (+21/−3). No runtime, exec-host, agent, policy, argv or budget changed; the 58 tracked agent proofs sweep green untouched, and typecheck / lint / build / test are green across all eight tasks.
- Honest bounds: the chip still shows `passed/total` first — a cut is signalled, not measured (v71's field says which pipes lost bytes, never how many, and this increment inherits that exactly); `descendantsStopped` (v55) is still absent from reports, so a killed-tree run shows its green/amber state and its kill wording but not its reaping; the dock's ledger row (v41) journals the human's decision, not the chip's caveat, so a cold ledger replay still needs the report itself to see `truncatedStreams`; and the other lane's stage-level calls remain on no record (#117). DEMO MODE is unaffected in the sense used throughout this lane — nothing in the browser runs a process — and §28/§9 hold: staging is a human act, `git push` is out of scope.

## Amendment 73 — v73 (runtime + exec-host): a kill is not a cut, and a report must say which it saw — v55's two claims leave the prose and enter the record, 2026-09

_Numbering: 73 was free when this was written (`git log --oneline -3` top = v72 `91ea59a`; this file's HEAD headings end at 72 — 71 of them; `## Amendment 58`/`59` exist only in the concurrent session's stale working copy, so this section is spliced onto HEAD's blob via `git cat-file blob HEAD:…` → `hash-object -w` → `update-index --cacheinfo`.)_

- **Measured first, and the measurement was already on the record for v71's own sake.** `.scratch/v73-kill-report-probe.mjs` hung a real parent that left a detached child, killed it at a 700 ms budget, and printed the report: `detail, engine, failures, ok, passed, total` — no signal, no tree claim, no statement that the exit code was simply absent. The three kill facts lived only inside `detail`: `killed at timeout budget (SIGTERM) (descendants: not-attempted) · no exit code reported`. v55 had built `descendantsStopped` precisely because `killedByBudget` is a claim about ONE process (measured then: a detached child wrote 7 more heartbeats after the host reported the kill) — and 18 amendments later a cold reader of a report still could not ask that question.
- **One nested optional object, in the host's own words.** `TestReport.killed?: { signal: string | null; descendantsStopped: string | null; exitCode: number | null }`, filled by the bridge only when `killedByBudget` fired. It deliberately does NOT restate v55's five-label union (`not-attempted | reaped | reaper-failed | no-pid | unsupported-platform`) as a runtime type — the runtime cannot import exec-host (dependency direction), and a second copy of that list is a second source that can drift; the value is typed `string | null` and the proof pins a real one. Absent rather than a zeroed object, exactly as v55/v56/v71 did their fields, which is what keeps every non-killed report byte-identical.
- **The two axes stay separate, measured rather than asserted.** `report-kill-proof.mjs` (59th tracked proof, 60th script) §1 kills a real hang and checks the record against the host's own words AND the OS's view — the detached child wrote **8** more heartbeats after `killed`, so the field is not decoration. §2 shows a cut run carries `truncatedStreams: ["stdout"]` and no `killed`, a clean run carries neither, and neither substitutes for the other. §3 round-trips the killed report through the ledger's JSONL: the nested object comes back intact including its `null` exit code, while the clean report still has no key. §4 is the one that keeps the field honest about itself: with `reapTree` ON, the same `descendantsStopped` reads **`reaped`** and the signal is `null` (taskkill replaced the kill, v55's ordering finding) — so the field tracks what was attempted, not the option that was set.
- **Cost:** exec-host **273/273** (from 272: one case that kills a never-ending child through the policy's 20 ms row and asserts the record, the prose, and that a cut never claims to be a kill), typecheck/lint/build green across eight tasks, and — because the runtime field is optional and the Studio chip builder reads only `truncatedStreams` — 115/115 studio tests and all 58 previously tracked proofs sweep untouched. No argv, policy, budget, gate or parser changed.
- Honest bounds: the bridge still reports what the host SAID, not what the machine did — a reaped tree is attested by `taskkill`'s exit status (v55), not by watching the child die, and this proof measures the child's own heartbeat file rather than trusting either; `killed.signal` is `null` on the reaper path because the replacement kill does not signal through `child.kill`, which reads oddly next to `'SIGTERM'` and is exactly what §4 measured; nothing DISPLAYS `killed` yet (v72 did that for the pipes, and the chip's red already covers "this verification failed"), so the field is for a cold reader of the ledger, not a new colour; and a killed run's `descendantsStopped: 'not-attempted'` is a statement that the DEFAULT host leaves a tree running — a caller that wants the tree stopped must pass `reapTree`, which is v55's opt-in and unchanged here. DEMO MODE is unaffected (no Studio surface runs an exec host); staging stays a human act and `git push` stays out of scope (§28, §9).

## Amendment 74 — v74 (exec-host): a KILL is the host's action, and a door may not say "git REFUSED" for it — the family's last misattribution, in the sentence, and the record agrees, 2026-09

_Numbering: 74 was free when this was written (`git log --oneline -3` top = `0521ceb`; this file's HEAD headings end at 73 — 72 of them; `## Amendment 58`/`59` exist only in the concurrent session's stale working copy, so this section is spliced onto HEAD's blob with `git cat-file blob HEAD:…` → `hash-object -w` → `update-index --cacheinfo`.)_

- **Measured first, and it was a §60 defect in prose, not only a missing field.** `.scratch/v74-door-kill-probe.mjs` drove all five git doors (six faces including `--stat`) against a 1 ms timeout budget over a 300-file repository, so the host really terminated a living git. **5 of 5 answered `… · git REFUSED this command — this is NOT a statement that …`** — in the same sentence that reported `exit null`. git refused nothing: it was still running when the ceiling stopped it. v52 wrote `refusedNotAbsence` for the case where git declines; v53 introduced the `cut` rule so an emptied pipe is not called git's silence; the kill case had been folded into the refusal wording all along, and a §28 reviewer is shown precisely one thing by these sentences: WHO spoke.
- **The split, in one clause and one field.** `killedNotRefusal(what)` — "the exec host KILLED this read at its own timeout budget — git refused nothing, and this is NOT a statement about …" — is selected by `result.killedByBudget` at the five refusal sites; `killedField(result)` puts v73's `{ signal, descendantsStopped }` in the record beside it, absent rather than empty. No third branch, no new state: the same boolean the sentences were already passing to `gitVerdict`/`budgetFlags` (`truncated || killedByBudget`) now decides the wording too.
- **Both directions, with real git** — `door-kill-proof.mjs` (60th tracked proof, 61st script). §1 kills each of the five faces and asserts the record carries the kill (`{"signal":"SIGTERM","descendantsStopped":"not-attempted"}` in all five), the sentence names the host, `git REFUSED` appears nowhere, and — the axis v69/v73 opened — `windowed` is ABSENT, because a timeout trims no pipe. §2 drives the mirror case, v52's own: `git.staged` outside a repository, which exits **129** with a 126-line usage page and must still be attributed to git; the door says `git REFUSED this command` and carries no `killed` key. §3 pins the pure rule and closes with the same door over the same repository on a generous budget answering normally with neither marker, so the three worlds (whole / cut / killed / refused) are separated by data, not by wording.
- **Cost:** exec-host **274/274** (from 273: one case covering the pure pair and the killed door, asserting both the new sentence and the absence of the old accusation), and because no uncut, un-killed sentence changed at all the 59 previously tracked proofs sweep untouched — the sweep is this increment's "nothing else moved" assertion. No argv, policy shape, budget default, gate or parser changed.
- Honest bounds: `killed.descendantsStopped` is `'not-attempted'` in every §1 case because the reaper is off by default — the marker says the host stopped the process it started, and v55's rule still holds that it says nothing about a tree unless `reapTree` is on (measured in v73 §4: `'reaped'`, with `signal` then `null`); a kill that arrives with bytes already trimmed would carry BOTH `killed` and `windowed`, and neither stands in for the other (verified for the single-axis cases, not for a hypothetical mixture); the commit door's refusal branch is unchanged, since a killed `git commit` is a different claim — the process may have committed while its echo was lost (v70 measured that asymmetry), and `killedNotRefusal` would be the wrong sentence there; and nothing DISPLAYS the kill marker yet — v72 gave the chip its pipe marker, and a killed verification is already red, so this serves the reader of the record and the reviewer of the sentence. DEMO MODE is unaffected; staging stays a human act and `git push` stays out of scope (§28, §9).

## Amendment 75 — v75 (runtime): what the walk LOST is part of what the walk did — the arc's caveats come off the records, and §26 can no longer remember a victory more confidently than it was earned, 2026-09

_Numbering: 75 was free when this was written (`git log --oneline -3` top = `d412cee`; this file's HEAD headings end at 74 — 73 of them; `## Amendment 58`/`59` exist only in the concurrent session's stale working copy, so this section is spliced onto HEAD's blob with `git cat-file blob HEAD:…` → `hash-object -w` → `update-index --cacheinfo`. The claim was re-checked immediately before committing, as amendments 52/55/57 each taught.)_

- **Where the family's facts stopped short.** v69/v70 put `windowed` on every door record, v73/v74 put `killed` beside it, and both reached the §28 sentence and the Studio chip (v72). But §26 memory is prose a LATER run reads back: `runGitArc` builds `notes`, and `pipeline.ts` prints those notes into the remembered line `release completed: staged→commit→confirm→inspect`. So a chain whose index read was floored by a budget — or whose confirm was killed by the host's own ceiling — was remembered with exactly the same confidence as a chain that saw everything. The distinction v48/v52/v56/v63/v65–v74 spent seven increments refusing to erase was silently restored at the memory boundary.
- **Measured, including a suspicion that turned out to be wrong.** The obvious hazard was that adding keys to door records breaks the ledger's strict validators (v49's `isArcShape` refuses "half a receipt", v54's `receiptsOwned` condemns a whole line over an unowned call), which would make journalled arcs vanish on cold read. `.scratch/v75-ledger-shape-probe.mjs` drove it and got **`malformed=1` for a plain, pre-v69 record too** — the fixture, not the keys, was at fault, so the suspicion is REFUTED and nothing was "fixed" to answer it. The live gap was the memory line, and it is a wording gap in the runtime, not a validation one.
- **Single source, one function, joined where the notes already are.** `arcReadCaveats(arc)` reads the arc's own records and says `every tally in this arc is a FLOOR — the read was cut (git.staged)` for a `windowed` record and `a read was KILLED at its timeout budget (git.log) — nothing was answered about it` for a `killed` one — and `runGitArc` folds the result into `notes` on both endings (stopped and completed) through a `caveated()` wrapper. Because §26 already prints `notes`, `pipeline.ts` needed **no change at all**: the first draft wired the derivation there and was reverted in favour of this single-source shape (an inline copy in the consumer is exactly the drift v51/v54/v69 keep naming).
- **Empty means nothing was lost, and that is the compatibility proof.** No caveats on a walk that lost nothing, so the v39/v47 line is byte-for-byte unchanged — asserted by `chain.test.ts:229` and `:298`, which compare whole summaries with `toEqual` and pass untouched. Runtime **349/349** (from 346: `gitArc.test.ts` 29→32, covering the windowed case, the killed case, both together as two separate sentences, and the whole/doorless cases earning no caveat).
- Honest bounds: the caveat is stated once per door that lost something, and says there was a window, not its size (that is all v69's key carries); §26 stores text, so a remembered line cannot be filtered by field — the wording is the payload; the durable **arc line** already had `notes` and `results`, so v75 changes what a reader SEES in memory, not what the ledger stores; the memory line is still written by the HOST (roles cannot reach §26 — v39/v47's governance), so adding a note here cannot let a role embellish its own victory; and the chip-side display (v72) remains the only place a human sees this without reading prose. All 60 tracked agent proofs sweep untouched, four root gates green, hooks unaided, no argv/policy/gate/parser change.

## Amendment 76 — v76 (exec-host): `'reaped'` is what the reaper REPORTED, not a promise that nothing runs — the label's meaning moves into the sentence, and a survivor holds the temp dir as the third witness, 2026-09

_Numbering: 76 was free when this was written (`git log --oneline -3` top = `17d8b79`; this file's HEAD headings end at 75 — 74 of them; `## Amendment 58`/`59` exist only in the concurrent session's stale working copy, so this section is spliced onto HEAD's blob with `git cat-file blob HEAD:…` → `hash-object -w` → `update-index --cacheinfo`, and the claim is re-checked immediately before committing.)_

- **Both halves of v55 are true, and one word invited a third claim that is not.** v55 measured that `child.kill()` stops the process the host started and NOTHING else (a detached child kept writing), and that issuing the reaper **instead of** that call silences a detached survivor. `descendantsStopped` was built to keep the failure names apart (`not-attempted | reaped | reaper-failed | no-pid | unsupported-platform`) precisely so the label would never over-promise — but `'reaped'` alone still reads as "the tree is down". Measured here (`docs/evidence/agents/reaper-survivor-proof.mjs`, a suite-shaped program that hangs and leaves a `detached: true` grandchild beating into a file): reaper OFF → `'not-attempted'`, 14 heartbeats after the report; reaper ON → **`'reaped'` reported, and 14 heartbeats after the report too**, because a detached grandchild has left the tree the reaper could reach. Both statements hold at once, so the label answers "what did the host attempt, and did the attempt succeed", never "is the machine quiet". (A third witness fell out of the run itself: the temp directory could not be deleted, `EPERM`, a live process still holding it — v55's own signature.)
- **Scope chosen by the measurement, and one hypothesis discarded.** The first guess was a plumbing gap — that the verification seam cannot ask for the reaper. It is not one: `reapTree` belongs to `createExecHost`'s options, so the caller who builds the host already controls it (probe arms (a)/(b) differ by exactly that option), and no parameter was added. What the measurement did find is a *claim* problem in the sentence, which is where this lane puts claims.
- **Fix, in the sentence that a cold reader trusts.** The bridge's kill clause stops printing `(descendants: reaped)` — a word that reads as an outcome — and prints `(descendants: the reaper ran — a detached grandchild may still be alive)`, while every other value keeps v55's wording untouched (`not-attempted`, `no-pid`, `reaper-failed`, `unsupported-platform` are names of what was attempted, not of what is dead). `execHost.ts`'s `descendantsStopped` contract now states the limit next to the type, so the value and the prose cannot drift apart silently.
- **Evidence, and what it does not cover.** exec-host **274/274** unchanged (the reaped-string is asserted nowhere in the unit suite; the v73 case asserts `not-attempted`, which this amendment deliberately leaves as it was), and the proofs that touch these values — `reap-proof.mjs` (v55), `report-kill-proof.mjs` (v73), `door-kill-proof.mjs` (v74) — were re-run green alongside the new proof, as were the four root gates (`typecheck`/`lint`/`build`/`test`, eight tasks) and the new 61st script. The full 61-proof sweep was still owed when this section was written, and a later bookkeeping commit reported it as run against THIS commit's own tree with **61 scripts, 0 failed**. **Amendment 78 re-ran it, and that number is corrected: the same 61 bytes, graded by a runner that names its ref and its build, print 61 scripts · 3 failed** — one red belonging to a build that is not this commit's (another lane's async reaper, compiled into the `dist` under test) and two to a runtime round-trip defect plus a working tree those proofs walk. What the bookkeeping commit DID verify is narrower than what it said: the 61 script bytes were byte-identical to the ref, and the compiled bytes they exercised had no source in the record at all. The corrected number is recorded in amendment 78, which exists because of this sentence.
- Honest bounds: the survivor counts are timing-dependent on one Windows box (14 beats in both arms is what THIS spacing measured, and the proof asserts the coexistence of `reaped` + survivors, not a number), so on a box where the reaper genuinely reaches the grandchild the §2 assertion path differs and the wording claim still holds; `unsupported-platform` remains the honest POSIX answer and is exercised only in unit tests; nothing in this amendment changes what the host *does* — same kill order, same reaper call, same values in the record — only what the sentence is allowed to mean; `record`-level consumers still see `descendantsStopped: 'reaped'` (a boolean-by-name cannot encode the caveat), so the ledger's cold reader must be read together with this amendment to avoid the over-reading the sentence no longer commits; and the v55 source comment's heartbeat count differs from the number earlier amendments quoted (its file says 6, memory said 7), which is recorded here rather than silently reconciled: recalled numbers get re-measured, not re-typed. DEMO MODE is unaffected, staging stays a human act, and `git push` stays out of scope (§28, §9).

## Amendment 78 — v78 (docs/evidence): a SWEEP must name the BYTES it graded, because "the N-proof sweep is green" has never been certifiable — it is a claim about scripts and a claim about a build, and only one of them had a source

- **What set this off was a sentence I committed myself.** Amendment 76's wrap-up first said the full
  sweep was OWED and must not be claimed; the bookkeeping commit `d780df6` then reported it as run
  "against THIS commit's own tree (read from the index, not from a worktree): 61 scripts, 0 failed".
  Checking that sentence before building on it found it false in BOTH halves. The scripts were the
  commit's — 61 files materialised from `88eba7e` re-hashed against `git cat-file blob 88eba7e:…`
  matched byte for byte — but the BUILD was not: each proof imports `./agents/runtime/dist/index.js`
  and `./agents/exec-host/dist/index.js` resolved against the CURRENT WORKING DIRECTORY, so a proof can
  be the committed one while the code it grades is whatever someone compiled last, and
  `agents/exec-host/dist/execHost.js` had been rewritten 2½ hours AFTER that sweep. And the number
  itself did not reproduce: the same 61 bytes, run by this amendment's runner against the tree
  `d780df6` itself, print **61 scripts · 3 failed**. A compiled artifact has no provenance stamp and a
  count has no name, so nothing in the record could tell any of those situations apart.
- **The class, not the incident.** Every amendment since v34 has written some version of "the N-script
  sweep is this increment's 'nothing else moved' assertion". That is the project's main anti-regression
  instrument, and it has been reporting one number for two different things. This is the same mistake
  the doors keep getting made to correct, applied to the harness that checks the doors: v69 moved a
  window claim from a door's sentence into its RECORD so a consumer need not re-read prose; this does
  that for the evidence pipeline — the sweep's object (which ref, which build, how dirty) stops living
  only in the sentence.
- **`docs/evidence/agents/sweep.mjs` (new, tracked).** Not an agent door: a human-run tool, so it shells
  out to `git` with the ambient environment, and it holds §9 by never writing inside the repository
  except into a temp dir under `os.tmpdir()`. It prints an `[identity]` block BEFORE any test result —
  ref → commit sha, node/platform/git version, a digest of the build, the count of tracked-and-modified
  sources under the workspace packages, and how many committed proofs differ from their worktree copy —
  then runs the ref's OWN bytes (materialised, not the files lying around), then a `[summary]` line
  written to be pasted into an amendment without paraphrase. `--ref <sha>` and `--only <pattern>` are
  the whole interface. The digest is sha256 over `path \t sha256(content)` for every file in every
  shipped `dist` tree: keyed by path, because a digest over content alone lets a deleted file hide
  inside a same-size rewrite — v65's lesson, one level up.
- **Two claims the runner has to keep separate, and now does.** *Scripts*: the ref's bytes are what run,
  so a worktree holding rewritten copies cannot be mistaken for a sweep of the commit. *Build*: named by
  digest, and re-checked after the last script, because a sweep is long enough for someone to rebuild —
  if the digest moves mid-run the summary says the rows "were not all graded against the same bytes".
  The honest bound is stated rather than fixed: this makes a sweep's object identifiable; it does not
  make a clean-room reproduction, which would need a build from the ref's sources and is queued.
- **62nd tracked script, `docs/evidence/agents/provenance-proof.mjs`.** §1 the digest is an identity:
  stable when asked twice, moves on one byte, moves on a RENAME with no byte moved, moves on an edit to
  the last file in the walk. §2 re-hashes all 61 committed proofs with a SECOND, independent reader
  (`git show` in the proof, not the runner's own `cat-file` path) in both directions: every sha the
  runner reports is the object store's bytes, and every reported worktree sha is the file actually on
  disk. §3 what materialises into the temp dir is the ref's bytes, and where the worktree differs, the
  landed copy differs from it — that branch is the sentence the runner exists to make checkable, and it
  is taken only if such a proof exists, else the script says the branch was vacuous. §4 a red cannot be
  read as green: exit 0 OK, a throw FAIL with its reason, a hung script FAIL labelled TIMEOUT, and
  `process.exit(7)` reported as 7 rather than normalised. §5 runs one real committed proof through the
  same materialised path (`code-index-proof.mjs`, 3019 bytes, chosen by size, deterministic) and then
  the actual `runSweep` entry point with `--only`. §6 prints the numbers an amendment will quote. §7
  §9 holds: HEAD byte-identical, everything else in `os.tmpdir()`.
- **Four bugs, all found by the proof while it was being written, none of them hypothetical.**
  (1) `toString('buffer')` — an `ERR_UNKNOWN_ENCODING` crash on the first blob read; the runner's own
  `encoding` option now means "return bytes". (2) The first pass over the REAL repository died on
  `statSync('agents/README.md/dist')`: a directory listing is not a list of directories, and a package
  with no build is a fact about the tree rather than an error — §1's synthetic tree could not have found
  this, which is why §6 reads the real repo too. (3) The one worth the amendment's attention: `runProof`
  tailed BOTH streams, and a thrown error prints its message FIRST then the stack, so a FAIL row read
  `Node.js v24.15.0` instead of the reason — the assertion written to catch exactly that went red on the
  first run. stdout keeps the tail (a passing proof prints its `[summary]` last), stderr takes the head,
  and §4's `chatter` fixture pins both directions with seven lines of stderr so a tail-read cannot pass
  it. (4) `dirtySources` answered **0** about a tree with two modified sources: porcelain v1 has TWO
  status columns and the code sliced one, gluing `M ` to the path so nothing matched the filter. The real
  repository cannot guard that — whether it is dirty is not this script's to decide — so §6 carries a
  synthetic-repo positive control where the answer IS known: one modified source, one untracked file
  under `src/`, one modified file outside `src/`, and the expected result is exactly the first. That
  control fails on the pre-fix code in every repo state.
- **The sweep this amendment reports, with its identity.** `[identity] ref HEAD = d780df69d0e2 · node
  v24.15.0 · win32 · git version 2.52.0.windows.1`, `build under test: 224 dist files, digest
  607cadb597d8a690`, `dirty tracked sources under packages: 2 — agents/exec-host/src/execHost.ts,
  agents/runtime/src/index.ts`, `scripts: 61 committed proofs materialised · 34 of them differ from the
  WORKTREE copy`, and `[summary] ref d780df69d0e2 · scripts 61 · failed 3 · dist 607cadb597d8a690
  (stable across the run) · 185s`. Because the axes are named, the three reds separate on sight into two
  different owners, which is the whole point of the increment:
  - `reap-proof.mjs` — `the default reaper answers a question even about a pid that cannot exist`,
    expected `boolean`, got `object`. That is this window's OTHER lane's uncommitted async tree reaper
    (`DEFAULT_TREE_REAPER` now returns a promise) sitting in the `dist` this sweep graded. The ref's
    script and a stranger's build: exactly the pair `d780df6` could not express and therefore reported as
    green. **Not mine to fix, and now not mine to guess at.**
  - `index-store-proof.mjs` + `provider-proof.mjs` — one defect, two witnesses: `snapshot must be
    verbatim` fails because a chunk with `heading: undefined` carries that key in memory and loses it
    through `JSON.stringify`/`deserializeIndex`, so the cold-build-vs-reload `deepStrictEqual` sees an
    object that differs by a key whose value was never a value. Reproduced in eight lines over two
    synthetic files, one with a `# ` heading and one without. Both proofs are byte-identical between ref
    and worktree (`git diff HEAD` empty) and red in BOTH, so this is not a scripts-axis artifact either.
- **The third axis this increment found and does NOT yet name.** `index-store-proof.mjs` and
  `provider-proof.mjs` call `collectTextFiles('.')`: their object is not the ref and not the build, it is
  **the working tree as it stands**, untracked files included. The tree became failing-adjacent when this
  window wrote an untracked scratch note with no `# ` heading into `.scratch/` — a file no commit owns,
  which nevertheless reached a shipped assertion through the shipped index builder. So a sweep has three
  objects and `sweep.mjs` names two; the third (what the tree-walking proofs actually read) is stated
  here as the bound and queued: v79 takes the round-trip defect itself, and the runner owes a
  walked-tree line to its `[identity]` block.
- **Cost, and what did NOT move.** No `packages/*`, no `agents/*` source, no argv, env pin, policy,
  budget, gate, parser or record shape: the four root gates and the 61 committed proofs are this
  increment's "nothing else moved" assertion, and they are reported WITH their identity for the first
  time. `provenance-proof.mjs` is the 62nd tracked script, so the next sweep is 62 — and it will not be
  describable as green until the two reds above are either fixed or named as belonging to another lane.
  Shared with the other lane: their uncommitted `syncproc.mjs` is imported by worktree proof copies and
  is UNTRACKED, so those copies are not reproducible from a clean clone — the divergence table now
  measures that number (34) instead of it being a recollection, and the finding is theirs to resolve.

## Amendment 79 — v79 (runtime): a key whose VALUE is `undefined` is not a key — the persisted index round-tripped into an object that could never have come off disk, and 25 increments of green proofs could not see it

- **This amendment exists because amendment 78's sweep named its own bytes.** Two of that sweep's three
  reds were one defect in `@nexus/agent-runtime`: `index-store-proof.mjs` asserts
  `deepStrictEqual(loaded.index, cold)` — "what came back from disk is the index I built" — and
  `provider-proof.mjs` asserts the same fact through the provider. Both had been green since v4/v5.
  They went red in this window, and the reason is not that the code got worse: `chunkFile` has always had
  TWO shapes for "this chunk has no heading". The window (non-markdown) branch pushes
  `{ path, startLine, endLine, text }` — no `heading` key. The markdown branch pushed
  `{ ..., heading: undefined, ... }` — the key PRESENT, its value `undefined`. Both satisfy the
  declared type (`heading?: string`), both read the same at every call site (`c.heading ?? ''`), and they
  are equal to a human. They are not equal to `deepStrictEqual`, and they are not equal **across
  `JSON.stringify`**, which drops the key — so the in-memory index carried a fact that its own persisted
  form could never express. The round trip did not lose data; it revealed that one side of the
  comparison had been inventing a key.
- **What made it reachable was an untracked file.** `collectTextFiles('.')` — so the object of both
  proofs is the working tree, and this window had written a scratch note whose text precedes its first
  `#` heading. Every markdown file in this repository happens to START with a heading, so for 25
  increments the markdown branch never produced a pre-heading chunk, and the two-shape bug sat in a
  branch nobody's corpus reached. Amendment 78 called this the third axis a sweep must name; the product
  defect it exposed is closed here, and the runner's `[identity]` block still owes a walked-tree line.
- **The fix is the smaller shape, not the looser comparison.** `codeIndex.ts`'s markdown branch now
  omits the key when there is no heading, so BOTH branches agree and "absent" is the only representation
  of absence — the same rule this stack applies to `windowed` (v69), `truncatedStreams` (v71/v72) and the
  caveat fields (v75): a field is present exactly when it carries information. The alternative — having
  `deserializeIndex` re-add `heading: undefined` — would have made the comparison pass while leaving two
  in-memory shapes for one fact, which is the thing that produced the bug.
- **Five unit cases, and the pre-fix counterfactual was measured BEFORE the edit.** `codeIndex.test.ts`
  pins (1) a pre-heading chunk has no `heading` key and names its exact four keys, (2) a chunk that DOES
  have a heading still carries it, so the two shapes are not collapsed into one by a blanket deletion,
  and (3) the markdown branch agrees with the window branch, which never had the key — measured as
  exactly one chunk in a two-file mix. `indexStore.test.ts` pins the round trip itself, in memory
  (`toStrictEqual`, the same comparison the proofs run) and through a `FakeDisk`, plus
  `queryIndex` identity so the fix cannot pass by ranking differently. Before the edit, the defect was
  reproduced in eight lines over two synthetic files — one with a `# ` heading, one without — against the
  then-current `dist`, so the red is on the record as a measurement and not as a retelling.
- **The control that says the fix did the work, not the tree.** Both proofs were re-run with the SAME
  heading-less scratch file still sitting in `.scratch/`, i.e. the trigger was left in place:
  `index-store-proof.mjs` and `provider-proof.mjs` now both print ALL ASSERTIONS PASSED. Removing the
  scratch file would have "fixed" the sweep without fixing anything.
- **The same-class sweep this triggered, and what it found.** Only `chunkFile` constructs chunks, and
  `files` entries have no optional fields. `IndexHit.heading` (line 135) does carry `heading:` with a
  possibly-undefined value — but hits are query results and are never persisted, so no round trip can
  disagree with them. Where JSONL round trips ARE asserted — the ledger's `windowed`,
  `truncatedStreams`, `killedByBudget` keys (v69–v73) — the committed proofs already re-read the file
  from disk and pass, which is exactly the assertion this index path lacked.
- **Cost.** `agents/runtime/src/codeIndex.ts` one branch, plus five test cases; runtime
  **349 → 354**. No exported type changed, no argv, policy, budget or record shape moved. Eight turbo
  tasks green; studio **115** unchanged; exec-host reads **275** in THIS worktree, one above the 274 this
  lane last counted, and the extra case is the other lane's uncommitted `execHost.test.ts` — reported as
  theirs, not adopted. `reap-proof.mjs` remains red for the reason amendment 78 named: the `dist` under
  test carries their async tree reaper, and a promise is not a boolean.
- **The runner found a bug in itself on the way, and the count is what caught it.** `sweep.mjs` listed its
  own file as a proof (`endsWith('.mjs')`), materialised it, RAN it — spawning a nested sweep that started
  a third — and so printed `[identity] scripts: 63` where the committed population is 62, spent 961 s on a
  sweep that takes ~200 s, and reported a `FAIL sweep.mjs (exit null, TIMEOUT)` row that is not a proof
  result at all. Amendment 78 had just written "the next sweep is 62", so the two numbers could be
  reconciled against each other; a runner whose population line nobody checks would have shipped the
  recursion silently. The filter is now the directory's own `-proof.mjs` convention, which every proof and
  the runner this file replaced already used. `report-kill-proof.mjs` also moved between the two sweeps
  (green in the first, red in the contaminated 961 s one) — reported here as a fact about what CPU
  contention does to a timing-sensitive proof, and the clean re-run is the number quoted below.
- **The sweep, as its runner printed it.** `[summary] ref 5c89d0bd3a31 · scripts 62 · failed 1 · dist 8b3ff8b0e7f62133 (stable across the run) · dirty-sources 3 · 311s`, with its population line reading `[identity] scripts: 62 committed proofs materialised into C:\Users\18414\AppData\Local\Temp\nexus-sweep-wjlIvU · 34 of them differ from the WORKTREE copy (the ref's bytes are what runs)`. The reds are `reap-proof.mjs`.

## Amendment 80 — v80 (docs/evidence): a sweep must name the TREE it walked, because a ref-materialised proof still reads `.` — and 27 of the 220 files this box's proofs indexed are in no commit

- **The bound, in v79's own words.** "the third axis amendment 78 named stays open — these two proofs
  read `.`, so a sweep's object includes files no commit owns, and `sweep.mjs`'s `[identity]` block does
  not name that yet." v78 had given a sweep an identity for its SCRIPTS (the ref's bytes, materialised
  into `os.tmpdir()`) and for its BUILD (a path-keyed digest over every shipped `dist` file), and left the
  third thing unnamed. It could not be named away: `runProof` passes the REPOSITORY ROOT as cwd, because
  that is how a proof resolves `./agents/runtime/dist/index.js`. A script that reads `.` therefore does
  not read the ref at all — it reads the working tree, including whatever files no commit owns.
- **Measured before anything was claimed, by `tree-axis-proof.mjs` (63rd tracked script).** On this box
  at this commit the walk a shipped proof performs returns **220 files / 3 801 218 bytes**, and a clean
  clone of the same commit returns **193 files**. The 27 untracked ones carry **2 204 169 bytes** — 58 %
  of what the proofs read — and account for **637 of the 1 664 chunks** (38 %) that `code-index-proof.mjs`
  indexes. For its `deserializeApp schemaVersion localStorage` query the expected source is **#3** in this
  tree and **#2** in the clean clone, with `.scratch/README-damaged.md` and `.scratch/adr-head.md` —
  leftovers of earlier increments' splice recipes — holding two of the five slots.
- **The mechanism, shown where the answer is known (§3), not inferred from the real repo.** A synthetic
  repository with five committed files that mention a query's identifiers fills all five top hits with
  ref-owned chunks; add six untracked `.md` files whose text repeats those identifiers and the ref owns
  **1 of 5**. Reported exactly as measured: the source itself stayed #1, so `code-index-proof.mjs`'s
  `paths.includes(expected)` did NOT go red this run — the finding is not that a shipped proof is
  currently failing, it is that a top-5 has finite slots and the population competing for them is not the
  commit's. §6 exercises the vacuous shape too (see the follow-on commit): the witness used to assert the
  real-tree chunk difference unconditionally, which is RED in a clean clone — the disease it grades.
- **`walkedTree(cwd)`.** The population comes from the production walker (`collectTextFiles`) imported
  from the same built `dist` the proofs import, so the runner holds no second copy of the skip-list or the
  extension rule — and because that walker lives in the built code, the build axis already names its
  bytes. The identity is sha256 over `path \t sha256(content)`, path-keyed for the same reason as v78's
  build digest: a deletion must not hide inside a same-size rename. Ownership is split into three bins —
  tracked (the ref owns it), untracked-and-not-ignored (present, owned by nobody), and the remainder **by
  elimination**, which is also how the runner avoids the expensive question of enumerating every ignored
  file including `node_modules`. `collectTextFiles` skips by directory name and extension and knows
  nothing of `.gitignore`, so git-ignorance is NOT walk-ignorance, and §1 asserts that rather than
  assuming it: an ignored `.md` present on disk is walked, and lands in the third bin.
- **`[identity]` prints it before any result and re-checks it after the last script** — a sweep is long
  enough for someone to rebuild AND long enough for a file to land in the tree these scripts walk — and
  the `[summary]` line now carries `tree <digest> (stable | MOVED mid-run)`, so the sentence an amendment
  pastes cannot lose the caveat. `treeMoveNotice` is exported so both shapes are gradable; `beforeRecheck`
  is a documented seam on `runSweep`, because nothing deterministic can move the tree from inside a sweep
  of read-only scripts and a race-based test would have proven nothing.
- **Which scripts depend on it, and how that is known.** A text scan of the ref's own bytes, labelled as
  such in the line itself: 8 call `collectTextFiles('.')` (including this witness, which classifies
  itself honestly) and 1 — `code-index-proof.mjs` — re-implements the walk over `process.cwd()`, so
  **9 of 63** at this commit against **8 of 62** at the previous one. The scan was first much looser and
  counted 10, because it matched any `process.cwd(`; the tightened predicate is guarded by a NEGATIVE
  control (§6): 7 scripts name `process.cwd()` as a jail root or an import path and must NOT be counted,
  which makes the precision tested rather than assumed.
- **Two bugs the witness found while being written, both of them mine.** (1) `walkedTree` took a `cwd`
  argument and then walked `'.'` — so it reported the home repository's 220 files about a synthetic
  two-file repo. §1's `assert.equal(t0.files, 2)` caught it on the first run; the parameter is now the
  root, and the same fix moved the walker's resolution to the runner's own repository root instead of the
  walked directory, because a synthetic repo has no `dist`. (2) `.gitignore` is not text to this walker —
  a first guess of "two committed files plus the ignore file" was wrong because the extension rule does
  not match it, which is the same class of mistake as counting a directory as a file (v61).
- **Cost, and what did NOT move.** No `packages/*`, no `agents/*` source, no argv, env pin, policy,
  budget, gate, parser or record shape: this increment is the evidence pipeline, so the four root gates
  and every committed proof are its "nothing else moved" assertion. Measured on this tree, where
  `git status` names another lane's uncommitted work: typecheck **8/8 tasks**, lint **4/4**, build
  **5/5**, test **8/8**, all exit 0, with **781** vitest tests green across five packages (runtime
  **354**, exec-host **275**, studio **115**, design-model **30**, ai-providers **7**). Exec-host's
  **275** is one more than the **274** this lane has quoted since v76, and the reason is the tree rather
  than this increment: `agents/exec-host/test/execHost.test.ts` is modified and uncommitted. Those counts
  are therefore the WORKING TREE's, not `f715b18`'s: the runner exists precisely because the two are not
  the same thing, and it would be the worst kind of dishonesty for this amendment to reclaim them as its
  own.
- **Bounds, stated rather than fixed.** Naming the tree is not isolating it: the honest next step is to
  run the tree-walking proofs against a clean checkout of the ref (queued with the clean-room build).
  The 27 untracked files on this box are left in place deliberately — they are the only copy of earlier
  increments' splice recipes, and deleting evidence to make a metric look clean is the mistake this whole
  family exists to avoid. And the tree digest moves during ordinary work: that is not a defect being
  reported, it is what the re-check is for.
- **The sweep, as its runner printed it — including its one red.** `[summary] ref f715b1820da5 · scripts 63 · failed 1 · dist 8b3ff8b0e7f62133 (stable across the run) · tree 2ee3841ef14c0e1b (stable) 220 files · dirty-sources 2 · 426s` The tree line
  reads `[identity] walked tree (read by the tree-walking scripts via cwd, so the WORKTREE not the ref): 220 files / 3801218 B, digest 2ee3841ef14c0e1b · owned by the ref 193 · UNTRACKED 27 (2204169 B) · ignored-but-read 0 — e.g. .scratch/README-damaged.md, .scratch/adr-head.md, .scratch/adr-new.md, .scratch/adr-staged-patched.md, .scratch/adr-staged-patched2.md, .scratch/adr-staged-patched3.md …` and the population line `[identity] of those 63, 9 read the WORKING TREE as their corpus — 8 call collectTextFiles on '.' and 1 re-implement the walk over process.cwd() (a text scan of their committed bytes: a claim about the scripts, not an observation of what a process opened)`. The failing script is `reap-proof.mjs`
  (v55's own witness), and the runner already names why a reader cannot dismiss it as flake: the identity
  block reported `dirty tracked sources under packages: 2 — agents/exec-host/src/execHost.ts, agents/runtime/src/index.ts` as the dirty tracked sources, and the reaper those sources are mid-edit
  on is the very code that proof asserts against. `reaper-survivor-proof.mjs`, which tests the adjacent
  behaviour, ran green in the same sweep, seconds apart, against the same bytes — so the red is a real
  disagreement between one committed v55 claim and one uncommitted build, not a broken pipeline. This
  amendment does not fix it: it is another lane's in-flight work, and naming it is the whole job here.
- **What the third axis bought immediately.** Before v80, that red would have been reported as
  "62 of 63 proofs pass", which is a sentence about the worktree's build wearing the ref's name. With the
  build digest (224 files, `8b3ff8b0e7f62133`, stable across the run) and the walked tree (220 files,
  `2ee3841ef14c0e1b`, stable) both printed, the reader can see that the red and the green rows were all
  graded against ONE build, and that the build contains code no commit owns.

## Amendment 81 — v81 (docs/evidence): v80's bound becomes a capability — a clean checkout of the ref, BUILT in isolation, and the one gate that makes "isolated" falsifiable: home's `dist` did not move

- **What was queued, and what `git archive` does not give you.** v80 wrote its own limit in its own
  bounds bullet: "Naming the tree is not isolating it: the honest next step is to run the tree-walking
  proofs against a clean checkout of the ref". `isolatedCheckout({ref})` in `sweep.mjs` now does it:
  `git archive --format=tar <ref>` measured at **3 399 680 bytes** on this commit, untarred into a temp
  directory. That tree has no `.git` — which is the entire point, since untracked content is what v80
  counted — and it also has no `dist`, because `dist` is untracked at HEAD too. So isolation needs a
  clean-room build, and a clean-room build on this box needed four facts that were nowhere on record
  until each was hit: `cmd //c mklink /J` fails with 无效参数 where `fs.symlinkSync(t, p, 'junction')`
  works; a symlink with a RELATIVE target is EPERM without developer mode; GNU tar reads `C:\Users\…` as
  a **remote host** (`Cannot connect to C:`) and needs `--force-local` plus forward slashes; and
  `spawn('npm')` is ENOENT because npm here is `npm.cmd`, so the build runs `cmd.exe /c npm`.
- **The hazard that made the workspace links part of the design.** The root `node_modules/@nexus/*`
  entries are **absolute** symlinks into the working tree. A temp tree that reused the home install would
  resolve `@nexus/agent-runtime` to `D:/终极项目/agents/runtime`, compile HOME's uncommitted sources, and
  write them into HOME's `dist` — all while printing a green row labelled "clean checkout". So the temp
  tree builds its own workspace links **from the ARCHIVED `package.json`'s workspaces globs** rather than
  from a list kept in this runner (**5** links here: `@nexus/ai-providers, @nexus/design-model,
  @nexus/studio, @nexus/exec-host, @nexus/agent-runtime`), beside **308** third-party junctions, with its
  own `.cache` so the build's writes stay on the temp side of the boundary.
- **The one gate: HOME's dist digest byte-identical before and after.** Everything else about isolation
  is circumstantial — where a link resolves, which directories exist, what the argv said. The property
  that matters is that the build this lane already depends on did not move while a second build ran:
  `assert.equal(after.digest, before.digest, 'HOME dist digest MOVED … the isolation is fake')`, measured
  `8b3ff8b0e7f62133` over **224 files**, identical before and after a **35.0 s** isolated build. Both
  directions are checked: the temp tree's `@nexus/agent-runtime` resolves *inside* `iso.root`, AND home's
  own link still resolves to `agents/runtime` — a one-way check passes vacuously when the link is missing.
  A side harness measured the neighbour of that claim too: this worktree's own walked-tree digest
  (`2ee3841ef14c0e1b`, **220 files**) is identical across an isolated build, so "isolation" here has not
  meant "the temp tree borrowed writes from home" in either direction.
- **A real defect in v80's code, found by trying to use it.** `walkedTree()` asked git for the ownership
  census unconditionally, so the exact tree v81 exists to walk — one with no `.git` — crashed the runner
  instead of grading it. The census is now `null` when git cannot answer: `gitRepo: false`, all four
  counts `null`, `censusUnknown === files`, empty `sample`. §1 asserts the distinction the number has to
  carry: a clean checkout's untracked bin reads **"cannot ask"**, not **`0`** — because `0` asserts that
  nothing untracked is present, which is precisely the claim isolation exists to make and therefore the
  last claim that may be reported without evidence. Digest identity and digest-on-edit still hold with no
  git at all, since a tree's bytes are its own; and the git-ful branch is still exercised on this worktree
  with `tracked + untracked + other === files`.
- **What the clean checkout is smaller by, and what did not change.** `code-index-proof.mjs` — the one
  committed proof whose corpus is the tree under `cwd` — walks **193 files / 1 619 981 B** there against
  this worktree's **220 / 3 801 218 B** (**−27 files, −2 181 237 B**), is green in **both** trees, and
  every one of those 193 is tracked at HEAD. That last check re-derives the ref's file list with
  `git ls-tree -r HEAD` inside the witness rather than trusting the census `walkedTree` just reported:
  v80's rule that ownership must be re-derived, applied to v81's own headline claim.
- **The build verdict is reported, not improved.** The isolated `npm run build` exits **1** with
  `Tasks: 4 successful, 5 total` and `Cached: 0 cached, 5 total` — the second of those lines is
  isolation evidence of its own: nothing in the temp tree was restored from home's build cache, so five
  packages really compiled there — and `Failed: @nexus/studio#build`. Its reason line, captured by a
  side harness that kept the whole output, reads
  `@nexus/studio:build: Module not found: Error: Can't resolve './D:/终极项目/node_modules/next/dist/client/next.js' in 'C:\Users\18414\AppData\Local\Temp\nexus-isolated-JJbTXo\repo\apps\studio'`.
  This amendment therefore does **not** claim "HEAD does not build": what is established is that the temp
  tree built its own `agents/runtime/dist/index.js` — 2 466 bytes against this worktree's 2 576, so the
  clean compile compiled the ref rather than borrowing home's answer — and that the failure is Next
  resolving a `./D:/…` specifier through a junction that crosses drives. What is queued rather than
  asserted: the same run with a same-drive temp root, which is the experiment that would say whether the
  fault is this harness's plumbing or the ref's own build.
- **The gap this increment found in itself, by trying to quote it.** `isolatedCheckout` keeps
  `tailOf(stdout + stderr, 4)` and the list of failed packages. Measured on that output: **55** non-empty
  lines / **2 978** bytes, and the reason line above sits at index **35** — so `tailOf(4)` **loses it**.
  That is the exact mistake `runProof`'s own comment warns about ("the reason a script failed is its FIRST
  stderr line, not its last") reproduced one function over, in the newer code. §3 therefore asserts only
  the shape it can defend — nonzero exit ⇒ the runner names at least one failed package, and `[summary]`
  prints the exit code and the package rather than a reason this runner never captured. Naming a REASON,
  not merely a package, is the next increment; quoting a line the witness did not keep would have made the
  bookkeeping less honest than the code it documents.
- **Two mutation probes, one of which refuted nothing — and the comment that keeps the lesson.** M1,
  deleting the digest-equality gate: red, `actual true, expected false`. M2, deleting §4's "nothing
  outside the ref is in this tree" assertions: **GREEN**, because the poison sat on a line *after*
  `cleanPaths` had already been computed — the walk being guarded had already happened, so removing the
  check of its result said nothing about the check. Re-aimed before the walk it goes red naming
  `scratch-leak.md`. The rule now lives as a comment in the witness (`ORDERING IS LOAD-BEARING`): a probe
  that cannot reach the line which grades it is not a refutation.
- **Cost, and what did NOT move.** No `packages/*`, no `agents/*` source, no argv, env pin, policy,
  budget, gate, parser or record shape: `sweep.mjs` edited, `isolated-proof.mjs` new — the 64th tracked
  script. The increment's "nothing else moved" assertion is the same property its subject asserts about
  itself: home's `dist` unmoved. Measured at `878fb1e`, where `git status` still names another lane's
  in-flight work (`agents/exec-host/src/execHost.ts`, `agents/runtime/src/index.ts`) and the tree line
  still reads 220 files — this lane neither touches that work nor reclaims its numbers.
- **Bounds, stated rather than fixed.** (1) Isolation is a capability, not yet the default: `runSweep`
  still runs every proof with `cwd` = the worktree, so `--isolated` wiring is queued and until it lands
  this witness is the only thing that executes a proof against a clean tree. (2) `git archive` gives no
  `.git`, so a proof that shells out to git cannot run there as-is — a property of the isolation, not a
  bug, and §1 is what makes it visible instead of fatal. (3) Two things are open and neither is smoothed
  over here: the cross-drive studio failure, whose cause this lane has narrowed to the junction rather
  than proven to be the harness; and the `tailOf(4)` gap above, which is why the next increment is
  "name the REASON a build failed", not another isolation flourish. (4) The temp trees are deleted by the
  witness on the way out (`rmSync(iso.dir)`), so any sentence quoted here came from output the runner
  itself printed or a harness that wrote it down — the reason line above is quoted from a saved copy, not
  from memory.

## Amendment 82 — v82 (docs/evidence): a verdict that names the PACKAGE is not a verdict — `describeBuild()` quotes the line the BUILD wrote, and answers `null` when it cannot

- **The sentence this increment exists to make true.** v81's own bounds bullet recorded, in the middle of
  quoting a build failure, that its runner could not have quoted it: `isolatedCheckout` kept
  `tailOf(stdout + stderr, 4)`, and on the transcript actually measured the reason line sits at index **35
  of 55** — the banner owns the last six lines. So amendment 81 could say "exits 1 naming
  `@nexus/studio#build`" and had to source the *reason* from a side harness that wrote the output down:
  bookkeeping less honest than the code it documented. v82 fixes the runner, not the wording. This is
  `runProof`'s own documented rule ("the reason a script failed is its FIRST stderr line, not its last")
  and v52+'s rule for the doors ("quote the verdict line, not the banner"), applied at last to the tool
  that watches the doors.
- **`describeBuild(text)`: pure, exported, and the `null` is the point.** It returns `{ lines, bytes,
  failed, reasons, reason, tail, head }`. Selection prefers a line the FAILING task itself printed —
  turbo prefixes every task line `@scope/name:task:`, so `@nexus/studio#build` maps to
  `@nexus/studio:build:` — then falls back to the first reason-shaped line, then to `null`. Two refusals
  are load-bearing: the summary banner is not a reason, and an error printed by a package that BUILT fine
  is not *this* build's reason either. `null` rather than a plausible value is v80's census lesson
  re-used: absence reported as absence.
- **Capture fidelity: the log exists before anything is reported.** The whole transcript is written to
  `<dest>/build.log` — in `dest`, deliberately NOT in `root`, because §4 counts the files inside the
  checked-out tree and a file this runner wrote must never be mistaken for a file the ref owns. §3 then
  RE-READS that file and re-derives every figure it prints (`bytes`, `lines`, `failed`, `reason`) from
  those bytes, and asserts `rawLog.includes(iso.build.reason)`: a quote must be findable in its source.
  The re-derivation is the difference between "the object agrees with itself" and "the file says this".
- **§3b grades the RULE on text the witness wrote, because §3 can only grade it against an accident.** If
  the ref's build passes, §3 never exercises the selection at all. The fixture is 38 non-empty lines with
  the reason at line 1 and the `Failed:` banner at line 37, and the distance itself is asserted
  (`bannerAt - reasonAt > 4`) so the case cannot rot into one `tailOf(4)` would have caught by luck.
  Alongside it: a banner-only transcript still names the package but reports `reason: null`; two error
  lines from two tasks resolve to the one whose package FAILED; a passing transcript has no failures, no
  reason, and `lines === 2`.
- **What the real run prints now, at `2a62ddb`, quoted from the witness's own output.** `[isolated] …
  build exit 1 in 40.5s · 55 output lines · FAILED @nexus/studio#build · reason
  "@nexus/studio:build: Module not found: Error: Can't resolve './D:/终极项目/node_modules/next/dist/client/next.js' in 'C:\Users\18414\…\repo\apps\studio'`,
  with `缓存：Cached: 0 cached, 5 total` read off the log, and the same reason carried into `[summary]`.
  The isolation gate still holds on that run — home dist `8b3ff8b0e7f62133`, 224 files, byte-identical
  before and after — and so does v81's corpus claim: 193 files / 1 624 986 B clean against this worktree's
  220 / 3 801 218 B. An amendment from here on can quote the runner instead of a harness.
- **Control plus two probes, all three outside the repository.** Whole-file copies, import rewired to the
  mutant. **m0** is an unmutated control through the same rewiring: exit 0, green, all six sections
  reached — so a red in m1/m2 belongs to the mutant and not to the harness. **m1** promotes the banner to
  being the reason (`all[all.length - 1]`): RED at §3, `the reason line " ERROR run failed: command
  exited (1)" was not printed by a FAILING task (@nexus/studio#build)` — it never reached §3b, because
  §3 is where the real transcript gets graded. **m2** truncates the log to its first 900 bytes *after*
  the verdict was computed, which is the shape of a runner whose report and record drift apart: RED at
  `the log on disk is not the byte count the runner reported writing` (906 against 2 979). Both
  mutations change a VALUE on the load-bearing line; neither is a collection error, and neither is placed
  downstream of the data it claims to test — the ordering rule this family committed in v81.
- **Cost, and what did NOT move.** Two evidence files only: `describeBuild` plus the build block in
  `sweep.mjs`, and §3/§3b plus the `[summary]` line in `isolated-proof.mjs`. No `packages/*`, no
  `agents/*` source, no argv, env pin, policy, budget, gate, parser or record shape — and no TypeScript
  at all, so this increment does not quote fresh root-gate numbers it did not measure: the pre-commit
  hook's lint ran over the commit, and the witness is the gate for a change that lives entirely in the
  evidence pipeline. The tree it was measured on is still the other lane's: 220 files, with
  `agents/exec-host/src/execHost.ts` and `agents/runtime/src/index.ts` modified and uncommitted.
- **Bounds, stated rather than fixed.** (1) `reasons` is capped at 8 lines and the predicate is a
  KNOWN-SHAPE list (webpack / tsc / node / a handful of banners), sampled from ONE real failing build. An
  unrecognised failure phrasing yields `reason: null`, and §3 turns that into a loud RED on a failing
  build — deliberately: a new toolchain's wording will fail this witness rather than be summarised into
  nothing. (2) Isolation is still not `runSweep`'s default; v81's bound stands. (3) The cross-drive
  `@nexus/studio#build` failure is still open and still not promoted into "HEAD does not build" — v82
  makes it quotable, not explained.

## Amendment 83 — v83 (docs/evidence): a sweep's `cwd` is not a corpus choice, it is the BUILD — 64/64 tracked proofs resolve the shipped code through the child's cwd, so the runner has to say which one it graded

- **The sentence this increment exists to make true.** v78 put a ref and a dist digest in the identity
  block, v80 put the walked tree beside it, and both were read as "this sweep graded the ref's bytes".
  They grade the ref's SCRIPTS. Where the code under test comes from is decided somewhere else, and the
  census now says so in the block: of the **64** tracked proofs at `3f18761200ef`, **61** spell the import
  `pathToFileURL('./agents/runtime/dist/index.js')` and **3** spell it `pathToFileURL(join(root, …))` with
  `root = process.cwd()` (the three are `provenance-proof`, `tree-axis-proof`, `isolated-proof` — this family itself) — and `pathToFileURL`
  resolves a relative path against `process.cwd()`. **0**
  reach it through their own file location. So the child's cwd is the whole story, and it was the one
  thing the runner never named. The consequence is not hypothetical: `sweep --ref <older sha>` with the
  worktree as cwd runs the OLDER proof text against the CURRENT BUILD while `[identity]` was quoting a
  digest of whatever tree the runner happened to sit in.
- **Observation, not a second copy of the rule.** `probeChildResolution(cwd)` spawns a child standing at
  that cwd and asks IT to print `process.cwd()` plus the resolved path and sha256 of every entry in
  `PROBED_BUILDS`; the runner reports what the child says rather than re-deriving the resolution it is
  claiming, and the text census keeps its own line, labelled as a scan of the scripts. §2 pins that the
  probe is real by putting three synthetic trees under one spec name — two builds, one bare — and getting
  two digests (`d44fec1017ce` / `1445f40e400c`) and an honest `exists: false, sha: null`, then cross-checks
  the home arm against a digest the witness computes itself (`73918b2b38eb`).
- **`proofsCwd` becomes an axis, and the two builds get two names.** `runSweep` takes `proofsCwd`, spawns
  every row there, and prints `child cwd for every row below: spawn was given X, the child reports Y` (⚠
  when they differ), `what a child standing there LOADS`, and — only when the two cwd differ — `build AT
  THAT cwd: N dist files, digest … vs … at the runner's cwd, so the two are not the same code`. One tree
  is named once, not twice. The summary ends `graded build <digest> (<n> dist files, stable | MOVED
  mid-run)`, and the CLI gains `--isolated`, which composes v81's `isolatedCheckout` with the sweep that
  was always meant to run inside it and then re-checks home's digest, printing either
  `UNMOVED (the isolation gate)` or the accusation that the run compiled into the repository it graded.
  An unbuilt checkout reports `graded build e3b0c44298fc (0 dist files)` — the digest over nothing,
  printed as nothing, which is the v80 census rule (absence as absence) applied to a build.
- **A batch read, and who grades the batch.** Census cost was measured before it was fixed: reading blob
  by blob made the witness take **14m7s**, longer than the 240 s the sweep allows any row it schedules —
  a proof that TIMEOUTs inside the runner it is grading. `proofCorpus()` now reads the whole population in
  ONE `git cat-file --batch` spawn (**8 744 ms** for 64 blobs on the run quoted below), and the corpus is a
  bankable argument, so a witness that censused in its own §1 does not pay for the population twice. A
  stream parser that is one byte off grades the wrong text silently, so the batch is checked against an
  independent single read at BOTH ends of the population and the runner throws naming both byte counts.
- **What the witness prints, quoted from its own transcript.** `[4] runSweep: proofsCwd=archived checkout →
  1 row, failed 1, graded build e3b0c44298fc/0 dist files, tree undigestable, walked-tree line names the
  child cwd and the runner gets a second one; default cwd → 1 row, failed 0, graded build
  8b3ff8b0e7f6/224 dist files, tree 220 files named once`, with §3's one-file experiment beside it: the
  ref's OWN `roles-proof.mjs` exits **1** (`ERR_MODULE_NOT_FOUND`) in 3 119 ms with cwd inside the archived
  checkout and **0** in 2 810 ms with cwd at this worktree — same bytes off the same commit. §5: home dist
  `8b3ff8b0e7f62133`, 224 files, byte-identical across the whole proof, which took **61 585 ms** of the
  **240 000 ms** a sweep row gets — and says so as an assertion, not as a footnote.
- **The defect this increment caught in itself.** Rewriting the identity block to name two cwd's renamed
  two lines, and `tree-axis-proof.mjs` — shipped in v80 — reads them BY PREFIX (`[identity] walked tree`,
  `read the WORKING TREE as their corpus`) and went RED: `and the tree line is PRINTED, not merely
  computed`. The producer moved back rather than the witness, which is v46's rule for a contract an
  already-committed proof pins; and §4 of the new witness now pins those same two sentences in BOTH arms
  plus the number of tree lines, so neither the rewording nor the duplication v83 would have introduced can
  come back quietly. Mutation **m4** re-ships the pre-fix wording and reddens both witnesses.
- **Control plus four mutants, all outside the repository.** **control** — the unmutated runner with only
  its import redirected — is GREEN in both witnesses, which is what makes the four reds below evidence
  rather than noise. **m1** (`const runCwd = proofsCwd ?? cwd` collapsed to `const runCwd = cwd`, so the
  axis becomes decoration) reddens §4 on `the isolated row must be RED here — §3 measured why`. **m2** (the
  census regex stops matching the `./…` idiom) reddens §1 on
  `every tracked proof must resolve through the child's cwd, or the census sentence below overstates
  (child-relative 3 of 64)` — the three `join(root, …)` rows survive, so the mutant is a lie of omission,
  not a crash, and the assertion is what notices. **m3** (the probe returns the RUNNER's `process.cwd()`
  instead of the child's self-report) reddens §2 on
  `the child reported D:\终极项目, not the C:\Users\…\nexus-v83-one-77jj6Y it was given`. **m4** (this
  increment's own first wording) reddens §4 on `exactly one walked-tree line per sweep` AND the shipped
  `tree-axis-proof.mjs` on `and the tree line is PRINTED, not merely computed` — a producer that rewords a
  sentence a committed proof reads by prefix goes red in the lane it broke, which is the whole point of
  pinning numbers in prose. Every one of the four reds is an `AssertionError`, not a stack trace.
- **Two harness defects that had to be fixed before any of the above counted.** A mutant copy of the runner
  written outside the repository dies in the identity block for a reason that has nothing to do with the
  axis: `walkedTree`'s DEFAULT build entry hangs off `REPO_ROOT`, which is derived from the module's own
  path, so a copy under `%TEMP%` looked for `C:\Users\18414\AppData\agents\runtime\dist\index.js` and threw
  — control was red four times for free until the harness began writing mutants at the same DEPTH inside a
  temp root whose `agents/` is a junction to the real one, so the same bytes are loaded and nothing in the
  repository is touched. And `tree-axis-proof.mjs` reaches the runner by a DIFFERENT idiom
  (`join(root, 'docs/evidence/agents/sweep.mjs')`) than the new witness does
  (`'./docs/evidence/agents/sweep.mjs'`), so a harness that rewrites one form silently grades the SHIPPED
  code against a mutant claim — a false green in the only direction that matters. The harness now keeps a
  needle per witness and throws when a needle is absent, instead of reporting an exit code for a file it
  never re-wired.
- **The witness joins its own census, and the census survives it.** Every number in this amendment is
  measured against the ref it was written for, so §1's "64/64" is the population as v82 left it — and a
  proof that ends up in the population it grades is exactly the self-reference v79 made a rule about.
  Re-run with this commit as HEAD: **65/65 child-relative, 0 file-relative, `unresolved` empty, the whole
  read in 8 378 ms**, and the four dist paths the probe covers are still named by 61 / 41 / 1 / 1 proofs.
  The count is therefore a property of the ref being graded, not a constant in the docs — which is why
  §1's assertion is `childRelative === total` rather than `=== 64`, and why the printed sentence carries
  the denominator instead of quoting it. The hazard I checked for and did not find: `fileRelative` also
  fires on any `import.meta.url`, so a witness that used one for its own module resolution would have
  reddened its successor's §1; this one reaches the runner through `pathToFileURL('./…')` and scores 0.
- **What did NOT move.** Two evidence files: `sweep.mjs` and `cwd-axis-proof.mjs`, the **65th** tracked
  proof. No `packages/*`, no `agents/*` source, and inside the exec host no argv shape, env pin, policy,
  budget, gate, record or door parser moved — the only new parser in this increment is the runner's own
  `git cat-file --batch` stream reader, and it is checked against independent single reads at both ends of
  the population because a stream reader one byte off grades the wrong text silently. No TypeScript at
  all, so this increment quotes no fresh root-gate numbers it did not measure:
  the pre-commit hook's lint ran over the commit, and the witness is the gate for a change that lives
  entirely in the evidence pipeline.
- **Bounds, stated rather than fixed.** (1) `--isolated` is opt-in: the DEFAULT sweep still grades this
  worktree's build, deliberately, because that is the code the four root gates just compiled, and a runner
  must not silently change the meaning of a sentence already written into the amendments. (2)
  `PROBED_BUILDS` is the four entries the census finds — the population names exactly four dist paths
  (61 × `agents/runtime`, 41 × `agents/exec-host`, 1 each `packages/design-model` and
  `packages/ai-providers`, counted over proofs that may name several), so the probe covers every path the
  scripts can resolve today; a fifth idiom has to be added rather than silently missed, and §1's census is
  what tells a future reader whether the list still covers the population. (3) §1 is a text scan of scripts and §3 is the observation; the scan alone would be v82's
  criticism of v81. (4) An archived checkout has no build, so a full isolated BUILD sweep is still not a
  green this box can claim: `isolated-proof.mjs` measures the clean-room `@nexus/studio#build` failure
  across a cross-drive junction, and v81/v82's attribution of it stands untouched.

## Amendment 84 (M2 v84, docs/evidence) — the DRIVE under a clean checkout decides whether its build compiles, so three increments of "the ref's studio build fails" were quoting a drive letter

- **What v83 left as a bound, v84 varied.** Amendment 83's bound (4) read: "an archived checkout has no
  build, so a full isolated BUILD sweep is still not a green this box can claim: `isolated-proof.mjs`
  measures the clean-room `@nexus/studio#build` failure across a cross-drive junction, and v81/v82's
  attribution of it stands untouched." That phrase — "across a cross-drive junction" — had been carried
  forward three times and never tested by turning the knob. It is now turned: one ref (HEAD), two arms,
  back to back, nothing changed but which drive the clean checkout sat on. Dest on `C:` (where
  `os.tmpdir()` is) → `build exit 1 in 522.4s · 55 lines · failed ["@nexus/studio#build"]`. Dest on `D:`
  (where the repository and every `node_modules` realpath are) → `build exit 0 in 513.0s · 59 lines ·
  failed []`. The home build digest `8b3ff8b0e7f62133` over 224 files and 309 `node_modules` entries were
  re-measured unchanged after both arms, so the isolation gate v81 built still holds. The failure was
  never a property of the ref, of the archived tree, or of the studio app: it was a property of where this
  runner was allowed to put a directory.
- **The mechanism, derived rather than believed.** v81 junctions third-party packages rather than copying
  them, so a checkout on `C:` holds links whose targets are on `D:`. Windows `relative()` cannot express a
  `D:` path from a `C:` directory and returns it ABSOLUTE — `D:\终极项目\node_modules\next\dist\client\next.js`
  — and a bundler handed `./` + that is handed `./D:/终极项目/node_modules/next/dist/client/next.js`, which
  is neither relative (nothing under the app directory is named `D:`) nor absolute (it begins `./`). The
  file itself is reachable; only its relative-ness is gone. §2 of `drive-axis-proof.mjs` computes that
  string from this box's own paths and asserts it EQUAL, byte for byte, to the reason line recorded in
  `isolated-arms.mjs` — so the quote and the derivation are pinned to each other, not to my summary of
  them. Same-drive, the same arithmetic gives `..\..\..\终极项目\node_modules\…` and reaches the entry.
- **What moved in the runner (`docs/evidence/agents/`).** `driveOf()` names the axis; `isolatedDest(cwd)`
  picks a temp dest that shares the repository's drive, keeping `os.tmpdir()` only when it already agrees
  and reporting `FORCED off tmpdir by the drive mismatch` when it does not; `driveVerdict()` renders the
  sentence, with a `POSIX-SINGLE-ROOT` clause for a host where the question cannot arise; the
  `[isolated]` line now prints `dest <dir> on <drive> vs the repository on <drive> — <verdict> (chosen:
  <how>)`, and appends `⚠ this build FAILED in a CROSS-DRIVE tree: on this ref the same checkout compiled
  GREEN on the repository drive, so do not read this as a defect of the ref without re-measuring`.
  `isolatedCheckout` returns `destDrive`, `repoDrive`, `driveMismatch`, `tmpDrive`, `destChoice`. A
  caller-supplied `dest` is respected, never repaired — the axis has to stay askable, and the line says
  who chose. `isolated-arms.mjs` is committed as the human-run tool that re-measures the two arms, because
  a number nobody can re-measure is a number a later reader has to take on faith.
- **The defect this increment caught in its own evidence.** v82's §3 gate exists to force a failing build
  to name a REASON line quoted from its own log. Reaching a failing build here was never arranged; it
  happened because `os.tmpdir()` sat on the wrong drive. Move the dest — which v84's fix does by default —
  and the build goes GREEN, `reason` is `null`, both of §3's assertions are skipped, and the witness stays
  GREEN having tested nothing. So `isolated-proof.mjs` now asks for the cross-drive tree BY NAME
  (`dest: mkdtempSync(join(tmpdir(), 'nexus-isolated-crossdrive-'))`) with a comment saying why, and
  prints the drive pair beside the reason it quotes: `CROSS-DRIVE: isolated-arms.mjs measured this same
  ref GREEN on the repository drive, so this reason is a fact about where the checkout was put`. A gate
  that depends on an accident must convert the accident into an argument.
- **What did NOT move.** Three evidence files changed and one was added: `sweep.mjs`,
  `isolated-proof.mjs`, the new `drive-axis-proof.mjs` (the **66th** tracked proof, **68th** script in
  `docs/evidence/agents` counting `sweep.mjs` and `isolated-arms.mjs`), and the new human-run
  `isolated-arms.mjs`. No `packages/*`, no `agents/*` source, no exec-host argv shape, env pin, policy,
  budget, gate, record or door parser moved. No TypeScript at all, so this increment quotes no fresh
  root-gate numbers it did not measure. Every `[identity]` and `[summary]` sentence that
  `tree-axis-proof.mjs` and `cwd-axis-proof.mjs` read BY PREFIX is untouched — the only printed line that
  changed is `[isolated]`, which was grep-confirmed unpinned before the edit and is re-verified by
  running `cwd-axis-proof.mjs` against the control mutant.
- **Mutation probes.** The harness re-wires each witness's OWN import idiom to the mutant runner and
  throws when a needle is absent — a mutant nobody reached is a false green (v83's lesson) — and hosts the
  mutant at the real depth under a fake root whose `agents/` and `node_modules/` are junctions, because
  `REPO_ROOT` is module-relative and a copy dropped into Temp reddens the CONTROL for the wrong reason.
  Control: `drive-axis-proof.mjs` GREEN and the shipped `cwd-axis-proof.mjs` GREEN against the same file.
  **m1** `isolatedDest` goes back to `mkdir(join(tmp, …))` → RED: "the DEFAULT dest
  `C:\Users\18414\AppData\Local\Temp\nexus-isolated-iInbZn` is on `C:\` while the repository is on `D:\` —
  v84's fix is not in effect". **m2** the fix stays and only the SENTENCE goes (`· dest ${where.dir}`) →
  RED: "the [isolated] line must state the drive verdict it computed", quoting a line that printed the
  path and no verdict. **m3** `const mismatch = false` → RED: "a caller asked for
  `C:\Users\…\nexus-v84-cross-TTzqNH` on `C:\` and the runner reported no mismatch — the axis is decoration
  if it cannot be asked for". **m4** the runner "helpfully" relocates a caller-supplied dest → RED on the
  same sentence, with the path the caller asked for replaced by `D:\nexus-isolated-AqK2qe`: the ask was
  silently overwritten, which is precisely how v82's failing-build gate would be lost. Four behavioural
  mutants, four assertion failures, no SyntaxError among them.
- **Bounds, stated rather than fixed.** (1) The two build verdicts are ONE back-to-back pair on ONE box
  whose tmpdir is on `C:` and whose repository is on `D:`; the durations are load-dependent (v81 measured
  212.6 s for an arm on a quiet box, against 513–522 s here) and no proof re-runs them, because a build
  arm cannot be scheduled at all — 513 s is more than double the 240 000 ms a sweep row gets, which is why
  the witness asserts its own 67.9 s and points at `isolated-arms.mjs` instead. (2) On a host where
  tmpdir and the repository share a volume, the pre-v84 default was already correct; §1 prints which case
  it is in rather than importing this box's defect everywhere. (3) A same-drive clean tree buys a
  COMPILING checkout, not a green isolated sweep: an archived tree still has no `dist`, which is exactly
  what v83's §3 measured, and that bound stands. (4) `driveOf()` is a Windows-shaped reading; the POSIX
  clause is graded on this host only by its ABSENCE from both real sentences. (5) `PROBED_BUILDS` is
  unchanged from v83 and still lists four dist paths — the drive axis does not add an import idiom, so
  the census's `childRelative === total` claim is untouched, and this proof reaches the runner through
  `process.cwd()` precisely so it stays that way.

## Amendment 85 — v85 (docs/evidence): a sweep row's BUDGET belongs to the ROW, and a KILL is a different finding from a FAILURE — the runner stopped deciding how long a proof may take, and started saying whose number ended it

_Numbering: 85 was free when this was written — `git log --oneline -3` tops out at `3b5f6bd` (v84's
bookkeeping) and this file's headings stop at 84. Two other amendments are owed a home in this file
(58, whose runtime work is uncommitted, and 77, whose exec-host reaper fix is uncommitted); neither is
claimed here, and the number 85 does not stand for either._

- **The constant, measured against the population it graded.** `runSweep` gave every row
  `DEFAULT_PROOF_TIMEOUT_MS = 240_000` and printed a kill as `FAIL …, TIMEOUT`. One row of that
  population is `isolated-proof.mjs`, which asks for a clean-room BUILD — and the durations for that arm
  are this file's own record: **338.5 s quiet, 513.0 s and 522.4 s back-to-back under load** (amendment
  84, measured, and quoted rather than re-run here because a build arm cannot be scheduled at all). So
  from the moment v81 admitted that proof, every full sweep carried a row that **cannot be answered**: the
  runner stopped asking before the proof's first assertion ran, and the red it wrote was a fact about a
  number in `sweep.mjs`. v83 and v84 each pinned the rule "a witness must FIT a row"
  (`totalMs < DEFAULT_PROOF_TIMEOUT_MS`); nobody had asked whether the row fits the witness.
- **The rule (`rowBudget(text, fallback)`).** A proof speaks its need from its own source, in column 1:
  `// sweep-budget-ms: 900000`. It is read from the **ref's bytes**, like every other fact this runner
  takes from the population it grades. What it does NOT recognise is **refused out loud** and falls back
  to the default, with the reason in the record: zero or negative (no duration is being asked for),
  fractional, non-numeric, two declarations (a contradiction, not a `max()` for the runner to guess at),
  or above `MAX_ROW_BUDGET_MS = 3_600_000` — past an hour a human has to raise `--timeout` for the whole
  sweep deliberately. An INDENTED marker is not a declaration either, and not a refusal: it may be a code
  sample inside prose, and treating it as a request would let a doc comment buy time for a row.
- **Honouring is bidirectional, so a declaration is neither a floor nor a courtesy.** §3's fixture proves
  both directions in ONE `runSweep`: a row that named `60000` did **8 773 ms** of work and survived a
  run whose default was `30000`, while a row that named `300` was ended by its own number **during**
  1 500 ms of work. The first is the increment's point; the second is the guard against reading the point
  as "asking buys extra time".
- **The finding moves from the sentence into the record.** `runProof` returns `verdict:
  'passed' | 'failed' | 'killed'` beside `budgetMs` and `budgetSource: 'default' | 'declared' | 'refused'`
  (`+ budgetNote`). `ok` and the sweep's `failed` list keep their old meaning on purpose — a killed row
  did NOT pass, and every committed witness that counts reds (`cwd-axis-proof.mjs` §4's
  `failed.length === 1`) stays correct. What changed is that the runner can now say **whose number ended
  it**: `KILL isolated-proof.mjs (…) — killed at the 900000ms this row named itself, so the number that
  ended it is the row's, not the runner's` versus `…killed by the runner's default budget of 240000ms;
  this row named no budget, so this red belongs to a constant in sweep.mjs and not to anything the proof
  asserted`. Amendment 73 refused to let a kill borrow a cut's vocabulary from the host's side; this is
  the same rule turned on the runner's own output, where `FAIL …, TIMEOUT` had been doing exactly that.
- **The census prints BEFORE any row runs.** `[identity] row budgets: 1 of 66 rows name the milliseconds
  they need (isolated-proof.mjs 900000ms); 0 of those exceed this run's default of 240000ms…` —
  whether a sweep was schedulable at all is a fact a reader should get from the identity block, not from a
  red at the end of ten minutes. Refusals print in the same line, named, with their reasons.
- **`timeout-axis-proof.mjs` — the 67th tracked proof** (69th script in `docs/evidence/agents`). §1 ten
  texts through the rule: 2 recognised, 6 refused each with a stated reason, 2 silent. §2 the census on
  the bytes about to be committed, cross-checked against HEAD, because the two can differ at this moment:
  **1 of 66** proofs declares, and HEAD has none yet. §3 the two directions above with one real
  `runSweep`. §4 the printed lines themselves — one `KILL` per killed row, a red that must NOT contain the
  string `kill`, a surviving row that prints what it asked for, and a `[summary]` that still begins the way
  four committed witnesses read it while adding `killed 2 (1 at the runner's default, 1 at a budget the row
  named)`. §5 the witness's own schedule: **64 034 ms of the 240 000 ms** a row gets, declaring nothing.
- **Its own fixture reddened twice, and both were the gate's doing.** §3's run default started at 2 000 ms
  and the row meant to FAIL fast was instead KILLED — node had not finished starting, which is the exact
  mis-attribution this increment exists to remove. At 10 000 ms the anti-flake assertion
  (`d.ms < RUN_DEFAULT_MS / 2`) caught a fast red taking **5 879 ms** while this box ran two sweeps and a
  build at once, and said so: "the fixture has no margin left and any verdict it reports is the box's, not
  the runner's". The default became 30 000 ms and the fast red used 1 468 ms of it. **The assertion never
  moved; the fixture got room.** That ordering is the whole point of writing the margin as a measurement.
- **Damage this window found in its own tree, stated because it was not visible.** A lane wrote
  `docs/AGENTS.md`, `docs/ROADMAP.md`, `docs/evidence/agents/README.md` and this file from a held snapshot
  of the **v76-era** record, so the worktree's copy of the ADR had lost amendments 78–84 (594 lines) and
  the evidence README its v78–v84 sections (213 lines), and amendment 76's sentence about the corrected
  sweep count had reverted to the pre-78 wording. Nothing committed was damaged, and nothing in the stack
  could have seen it: the sweep grades the **ref's** bytes, no proof reads this file, so a worktree that
  contradicts the record is invisible to every green in `docs/evidence/agents/`. The four docs were
  restored to HEAD's bytes with that lane's own text preserved out-of-band and untracked (its
  `policyAudit.ts` work stays uncommitted and un-landed — amendment 58 is not taken by this window). The
  guard that would have caught this — a heading-set comparison between the ref's shared docs and the
  worktree's, printable in the identity block and reddening on an erasure — is **queued as the next
  increment**, not claimed here.
- **And the same family, one hour later, from my own hand.** While roughly 1 MB of doc dumps sat in
  `.scratch/`, `code-index-proof.mjs` went RED: not a build, not a byte of source, but a proof that walks
  `.` and asserts that `apps/studio/src/lib/persist.ts` ranks in a query's **top 5** — three untracked
  copies of a README outranked it. Measured (`got .scratch/v86/readme-head.md, docs/evidence/agents/README.md,
  .scratch/README-damaged.md, …`), moved out of the graded tree, green again (`ALL ASSERTIONS PASSED`, 231
  files / 1 931 chunks). Amendment 80 counted the untracked population of the tree a sweep digests; this is
  what that population COSTS a ranking assertion, and it is the second reason the identity block should say
  how much of what a proof walked is in no commit.
- **What did NOT move.** Two files in `docs/evidence/agents/` changed — `sweep.mjs` (`rowBudget`,
  `MAX_ROW_BUDGET_MS`, the verdict/budget fields, the row and summary sentences, the identity census) and
  `isolated-proof.mjs` (its `sweep-budget-ms: 900000` header, plus the comment naming where the number
  came from) — and one script was added. No `packages/*`, no `agents/*` source, no argv shape, policy,
  permission, §28 gate, budget default or parser moved; `DEFAULT_PROOF_TIMEOUT_MS` is still 240 000. No
  TypeScript at all, so this increment quotes no root-gate numbers it did not measure.
- **Bounds, stated rather than fixed.** (1) The 900 000 ms declaration is sized from v84's arms for a BUSY
  box and is not re-measured here; a build arm's duration is load-dependent, so it is a schedule, not a
  measurement. (2) One hour is a ceiling, not a cure: a row that names 3 600 000 ms may still sit for an
  hour, which is why the ceiling is refused rather than clamped. (3) The census counts declarations in the
  bytes a run grades, so a declaration that exists only in a worktree is invisible to a sweep of a ref —
  §2 prints ref and worktree separately for exactly that reason. (4) This witness proves the plumbing on
  synthetic rows and the census on git's bytes; the **67-row sweep's schedule** is a different claim, and
  the sweep against this commit's own tree is owed to the next one. (5) `verdict` is derived from the
  exit code and the runner's own kill flag, so a process that exits nonzero at the instant it is killed
  still reads `killed` — the runner's action wins, which is the attribution amendment 74 already chose.

## Amendment 86 — v86 (exec-host + docs/evidence): every SYNCHRONOUS spawn API on this host fails with `EBUSY`, so the tree reaper never reaped, 33 tracked proofs could not run at all, and the proof that finally ran turned its central claim into `0 === 0`

_Numbering: 86 was free when this was written — `git log --oneline -3` tops out at `19595c4` (v85's
work) and this file's headings stop at 85. This amendment gives a home to the **exec-host half of the
draft amendment 85 noted as uncommitted** ("77, whose exec-host reaper fix is uncommitted"); that draft
is landed here under 86, and 77 stays unclaimed. The other owed draft (58's policy audit) lands as
amendment 87._

- **The host fact, measured.** `spawnSync('git', ['--version'])` → `{ status: null, error: EBUSY }`, and
  so do `execFileSync`, `execSync` and the same calls made from inside a `worker_threads` Worker, while
  asynchronous `spawn` answers normally. This is a property of the box, not of the code — but the code
  had been written as if it were not. Census taken before moving anything: **44 of the 69 tracked proofs
  imported `node:child_process`**, of which **33 needed the synchronous API**; 15 keep it (they use async
  `spawn`, or use nothing but the ref bytes).
- **Move 1 — the workaround is a file, tracked, with a delete-by date.** `docs/evidence/lib/syncproc.mjs`
  re-implements `execFileSync`/`spawnSync` on the async path: a Worker runs the real `spawn` while the
  main thread parks on `Atomics.wait`, and the result travels through the filesystem because a blocked
  main thread cannot process a `postMessage`. Each proof changes **one line — its import**; no assertion,
  no fixture, no argv moves, so every one of the 33 remains reviewable against its own history. The lib
  is now TRACKED for a reason amendment 83/84 already established: the sweep materialises a ref with
  `git archive`, so an untracked helper means 33 tracked proofs that cannot resolve their imports in any
  clean checkout — the fix would have been visible only in this worktree, which is exactly the failure
  class amendment 80 names.
- **Move 2 — the reaper could never have worked here.** `DEFAULT_TREE_REAPER` drove
  `taskkill /PID <pid> /T /F` through `spawnSync`, so it always returned `false`; the host therefore
  reported `'reaper-failed'` (honestly!) and `reapTree: true` silently degraded to a plain kill. `TreeReaper`
  may now return a `Promise<boolean>`, the host awaits it, and **`onEnd` waits on the settled reaping
  promise** — without that the result used to be built while `descendantsStopped` was still `undefined`,
  i.e. a genuinely reaped tree would be reported as a run nobody had decided about. The regression test
  releases the fake reaper on a later tick, which is the only shape that can tell the two apart; a
  synchronous reaper is still accepted and behaves byte-identically, so every already-injected test reaper
  is untouched.
- **Move 3 — the red that lied twice.** With the import fixed, `reap-proof.mjs` ran for the first time
  since v55 and failed. The failure a reader saw was `ENOENT: …\heartbeats.txt` **raised by the `finally`
  cleanup**, which buried the assertion that actually failed. That assertion (§1) failed because the
  proof's kill budget is a literal 700 ms and this box's measured spawn→first-write latency is
  **6 074 ms** (`node --version` as a child produced NOTHING in 6 000 ms; `git --version` took 10 594 ms
  on the same saturated host), so the parent was killed before it executed a line and no heartbeat file
  ever existed. And that exposed the hole under both: §2's central claim is
  `beatsLater === beatsAtKill` — "the survivor went silent" — which **0 === 0 satisfies**. A silence
  measured over an absent survivor is not a finding about reaping, and `ran: true` was never a claim about
  a run: it is the host's report that ONE spawn call succeeded.
- **The rules now in the file.** (1) **§0 measures before it judges**: the latency is taken once per run
  and every kill below happens at `max(700, 4×latency)` — this run 6 074 → 24 296 ms — so no section can
  be red because a constant in the file was smaller than the host (amendment 85's rule, turned on a
  proof's own fixture rather than the runner). (2) An assertion about what happened AFTER a kill requires
  the subject to have been seen ALIVE BEFORE it: runs are sampled in flight and `grewWhileAlive(samples)`
  plus `beats at kill > 0` gate §1, §2 (both branches), §5 and §6. (3) Teardown reaps the **orphan**
  handles the parents recorded while alive (10 this run), not a dead parent's pid: `taskkill /T` on the
  parent of §1 walks a tree that no longer exists, which is §3's own ordering lesson applied to the
  proof — and it is why the directory survived 3.2 s of retries without it. (4) A cleanup may not replace
  the finding: `catch` prints it and rethrows before `finally` touches a file. Measured this run: §1 +8
  beats after `killedByBudget` · §2 `exit=1 signal=null`, 176 → 176 · §3 status 128, 443 → 449 ·
  §5 60 → 60 · §6 `reaped`, seq 1, malformed 0.
- **Also moved, same cause.** `verdict-proof.mjs` asserted a literal `6` for "git printed six lines, one
  quoted"; git 2.55 prints two non-empty lines for that lock failure, so the literal was an assertion
  about a git VERSION, not about the door. The count is now derived with the door's own rule (non-empty
  lines across both streams).
- **What did NOT move.** No argv shape, policy gate, permission, §28 decision, budget default, parser or
  record field changed; `planExec`, the doors and the ledger are untouched. The exec-host change is one
  widened type (`TreeReaper`) plus an `await`; the runtime package was not edited by this increment.
- **Bounds, stated rather than fixed.** (1) `syncproc.mjs` is a host workaround, not a design choice: the
  day `spawnSync` works, this file and 33 import lines are the only thing to delete. (2) `4×latency` is a
  schedule, not a law — a box slower than ~150 s per arm will make §2's row fall back on its declared
  `sweep-budget-ms: 600000` instead. (3) §0 measures ONE latency and reuses it; per-process variance on a
  saturated box is not modelled, and the sampling loop proves "grew while alive", not "alive at the
  millisecond of the kill". (4) 33 proofs now import the lib; this amendment quotes the four that were
  re-run (`reap`, `door-kill`, `verdict`, `policyaudit`) and the two package suites, not a population-wide
  sweep — **the full sweep against this commit's tree is owed**, and is the only number that shows whether
  the lib holds under every proof's own load. (5) The parent/child tags are matched by substring in the
  proof's own line protocol, so a tag that is a substring of another tag would confuse teardown — the five
  tags here are not.

## Amendment 87 — v86b (runtime): a §28 table is now graded against the people it claims to speak for, and refuses to be impressed by its own past

_Numbering: the content is amendment 87's, but it was committed as `M2 v86b` (`e04e3ae`) because it
landed hours after the v58 draft was written and one commit before this file was opened. Its proof file,
`docs/evidence/agents/policyaudit-proof.mjs`, rode into `92c3664` via a `*.mjs` glob; the module, its
tests and the export are in `e04e3ae`. Recorded here rather than smoothed over, because "which commit owns
which claim" is the thing this file keeps audit._

- **The gap.** v40 made a checkpoint policy **data**, v41 made human §28 decisions **data**, and nothing
  joined them — so "this table stands in for the way we actually decide" was a claim with no test, and a
  table could only be read forward (what WOULD it do), never backward (what DID it miss).
- **The join (`auditGateHistory(policy, history)`).** Validate the table first (a malformed policy has no
  business being graded, let alone shipped), replay it over the history call by call, and split the
  contradictions by DIRECTION: `too-permissive` — a human vetoed what this table would allow — versus
  `too-strict` — a human allowed what it would block. Plus `silentApprovals`: tools the table grants
  **only through its default row**, i.e. an approval no rule ever names. `divergences` and
  `silentApprovals` together cover every default-granted call exactly once: agree with the human or
  contradict it, never both.
- **What it refuses to know is the increment.** Records decided by a table, not a person, are counted as
  `skippedPolicyRecords` and NEVER as agreement (a policy agreeing with its own output proves nothing about
  people — §60); `agreement` for an empty history is 0, not a vacuous 1; and the replay is over tool NAMES
  with `args: {}` and `permissions: []` because that is exactly the whole of v40's matching, so the audit
  openly says nothing about a future argument-aware rule. `auditLineFor` prints the ratio beside every
  named failure class and the skip count, so a single ledger line cannot read as a clean table.
- **Gates.** `@nexus/agent-runtime`: 354 tests / 26 files (45 of them this module's own), root
  `npm run build` clean, `policyaudit-proof.mjs` green (purity, determinism and the "no human decisions"
  rule included).
- **Bounds.** (1) It is a **library with one consumer: its own proof.** Nothing in the dock or the ledger
  calls it yet, so no operator sees an audit line; wiring it into the §28 face is the next increment's
  question, not this one's claim. (2) A boolean carries no motive — the audit grades verdicts, not
  reasons. (3) Agreement over a history that contains nothing dangerous is agreement over nothing, which
  is why `total`/`audited`/`skippedPolicyRecords` ship alongside the ratio rather than under it.


## Amendment 88 — v88 (docs/evidence): the population is a CLOSURE, not a directory — 32 of 68 sweep rows were red because the runner could not stage a proof, and the row that hid the cause was a window of three lines

_Numbering: 88 was free when this was written — `git log --oneline -3` tops out at `e12082a` (amendment
86/87's bookkeeping) and this file's headings stop at 87. This amendment is the answer to the question
amendment 86 left open on purpose: its bound (4) said "the full sweep against this commit's tree is owed,
and is the only number that shows whether the lib holds under every proof's own load". The sweep ran. The
lib holds; the RUNNER did not._

- **The measured result, before any fix.** Ref `e04e3ae`: **68 rows, 35 red, 0 killed.** Of the 35, **32
  were one class** — `ERR_MODULE_NOT_FOUND` — and the arithmetic closes exactly: the 32 proofs that import
  `docs/evidence/lib/syncproc.mjs` (the census that amendment 86's own fix created) plus the three rows that
  failed for their own reasons (`cwd-axis`, `isolated`, `timeout-axis`). Every one of those 32 was red
  **without its assertion having run once**, and 26 of them printed an EMPTY reason field followed by
  three lines of stack, because `materialize` wrote the ref's bytes **one file per proof into a flat temp
  directory** — so the shared file was never fetched (it is outside the proof directory, which is what
  `trackedProofs` lists) and `../lib` from a flat copy points OUTSIDE the copy regardless.
- **Why this is the same fault, one level up.** Amendment 86 found that `ran: true` was a claim about ONE
  spawn call rather than about a run, and that a silence measured over an absent subject is not a finding.
  Here the runner asserted 32 reds about proofs whose bytes it had never been able to load. And the report
  repeated the excerpt mistake amendment 63 named for the git doors: `errTail` is `headOf(stderr, 3)`, while
  Node prints `Cannot find module '…' imported from …` as the **fourth** line. Widening the window would
  only move the cut, so the runner now SCANS for the cause-shaped line and quotes it, and says
  `NO NAMED CAUSE` out loud when the stream contains none.
- **What landed.** (1) `relativeSpecs` + `resolveRelative` — git's slash space, the importer's own directory
  as the base, because `path.join` on this host would produce backslashes and the two spaces must never meet
  inside a lookup table. (2) `closureOf(ref, cwd, corpus)` splits every relative edge three ways: lands
  inside the population / tracked elsewhere in the REF (fetched, attributed to its importers) / **in no commit
  at all**, which is named in the identity block BEFORE the rows run rather than discovered 32 times after.
  It reports its own depth limit (`nestedDeps`) instead of implying a transitive closure it does not take.
  (3) `materialize` writes the ref's **directory shape**, not its basenames — a ref's SHAPE is part of what
  it committed, and amendment 80's lesson ("a ref-materialised proof still reads `.`") had a mirror this
  amendment found: a ref-materialised proof also *imports relative to where it stands*. (4) `runProof` gains
  `reason` (the scanned cause line) beside `errTail` (the window), and a row whose stdout is empty prints
  `(no stdout — the child never reached a print)` instead of a blank field, because "the subject never spoke"
  is the finding, not a formatting gap.
- **The census this corrects, in place.** `proofImportIdioms`'s comment said `fileRelative` **is 0** — true
  when amendment 83 wrote it, and now false: the run prints **68/68 child-cwd · 32 file-relative**. The
  comment carries the correction rather than being rewritten, because the number that made it false is the
  number amendment 86's fix introduced.
- **`closure-proof.mjs` (the 69th proof) and what would have made it lie.** §3 is the section that matters:
  the SAME bytes from the SAME ref are run twice, and it is the LAYOUT that decides — faithful path
  `exit 0` in 3 091 ms, flat basename `exit 1` in 182 ms. A fixture written by this file could not have
  shown that: an invented "flat staging" would have tested this file's own guess about Node's resolver
  instead of the population's real import. §4 then asserts the cause line sits BELOW the three the old
  window quoted — without that the section would only prove the scanner finds a line that a wider `headOf`
  would have found too. §2 checks the importer count against an independent scan of the same bytes, and
  §2's byte-comparison of the fetched blob against the working copy **normalises line endings and says so**,
  because git stores LF while this checkout may not; a raw equality there would have been a red about a
  working-tree filter, not about the ref.
- **What did NOT move.** No proof's assertions, no argv, no policy, no gate, no budget default, no row
  selection: `--only`, the budgets, the digests, the isolated arm and the ref-materialisation contract are
  byte-identical in behaviour. The dependency files are fetched and written but never run as rows, and
  `materialize`'s return shape is unchanged, so every existing caller (`isolated-proof`, `tree-axis-proof`,
  `provenance-proof`) keeps its contract.
- **Bounds, stated rather than fixed.** (1) The closure is **depth 1**: a dependency that itself imports a
  third file would be named by `nestedDeps` and NOT fetched — the proof asserts that list is empty today, so
  the bound is live, not decorative. (2) Only **relative** specifiers are followed; a proof importing a bare
  package specifier resolves it through `node_modules`, which the sweep never materialises (the child's cwd
  is the repository, so the home `node_modules` answers — same build-vs-script split as amendment 83).
  (3) The fix is in the RUNNER, which is worktree code: amendment 80's rule says a declaration that exists
  only in a worktree cannot be seen by a sweep of a ref — so the 68-row population sweep against this
  commit's own tree is what turns this from a local repair into a certified one, and it is launched rather
  than claimed here. (4) `missing` is empty on this ref; nothing in this amendment makes a proof that
  imports an untracked file pass — it makes the runner SAY which proof and which file, before the rows.

## Amendment 89 — v89 (docs/evidence): the population sweep landed (69 rows, 5 red, 420 s), and the first defect it exposed was in amendment 88's own scanner, because a witness that scans the population must survive JOINING it

- **The number amendments 85, 86 and 88 each deferred, quoted from the runner.** ref 1c9c7ee04061, 69
  scripts, 5 failed, 0 killed, graded build 8b3ff8b0e7f62133 over 224 dist files and stable across the run,
  walked tree ecbdb9c3ceda569a stable at 219 files, dirty sources 0, 420 seconds. Against the pre-fix run on
  e04e3ae (68 rows, 35 red) the closure materialisation moved 30 rows from red to green. This time the walked
  tree did NOT move during the run, because the commit landed before the sweep was launched rather than in the
  middle of it — the discipline amendment 80 already stated and this cycle had violated once.
- **The defect the sweep found belongs to this file.** closure-proof.mjs passed standalone at 03:55 and failed
  inside the 03:57 sweep with nothing changed except that it had been COMMITTED, so it joined the population it
  scans. Its section 1 hands a snippet of source text to relativeSpecs inside a template literal, and the v88
  reader matched a from-clause anywhere in the BYTES, so the ref copy of that proof claimed to import
  docs/evidence/lib/s.mjs and docs/evidence/agents/x.mjs. The identity block reported both as unsatisfiable and
  named closure-proof.mjs as the wanter. That is amendment 64 in a new costume: a QUOTATION can wear the shape
  of an import, just as a diff body line can wear the shape of a header.
- **The fix, and what it deliberately is not.** relativeSpecs is now a scanner: a specifier counts only when
  the token introducing it stands at CODE position, outside every comment and outside every string body, read
  character by character. A template interpolation is genuinely code, so an import written inside a dollar
  brace still counts, and that asymmetry is what no line-based or indentation rule can express. The fixture was
  NOT reworded. Deleting the quotation that fooled the reader would hide the class and leave the next witness to
  rediscover it; the fix belongs in the reader.
- **Measured both ways before shipping.** Over the 71 mjs files in the proof directory the byte reader called
  33 an importer and the code-position reader calls 32, and the only difference is closure-proof.mjs, which
  goes from two phantom edges to none. The check re-implemented the v88 rule independently rather than importing
  it, per amendment 81. After the fix the runner prints 32 of 69 with zero unsatisfiable, and closure-proof.mjs
  passes AS A SWEEP ROW (exit 0, 5817 ms), which is the only form of the claim worth making: it has to hold for
  a proof materialised out of a ref, not merely for one running from a worktree.
- **The four reds that remain are witnesses contradicted by their own history, not host faults**, recorded so
  the next increment starts from measurement. cwd-axis-proof asserts fileRelative equals zero, which amendment
  86 falsified and 88 documented as 32; the expectation must be derived from the same bytes, not pinned.
  timeout-axis-proof section 2 compares an anchored line rule over the worktree against a git grep count of
  MENTIONS at the ref, and that file mentions the marker a dozen times inside its own fixtures, so the two
  halves of one independence check ask different questions — an independent reader must be independent in
  implementation, not in grammar. reaper-survivor-proof asserts a detached grandchild keeps writing after a kill
  scheduled at a literal 500 ms on a box whose measured spawn-to-first-write latency is 6074 ms, so its subject
  never lived and its own reason line said heartbeats 0 at report and 0 after 900 ms; that is amendment 86
  rules 1 and 2 applied to a witness predating them. isolated-proof is the known cross-drive arm, needing
  re-measurement rather than a verdict on the ref.
- **What did not move.** No proof assertion, budget, argv, policy, checkpoint gate or selection rule; the
  identity block gained no spawn, and the 32 real importers keep their edges byte for byte — the change answers
  differently for exactly one file, and the rig asserts it is the one that quotes an import.

### Amendment 89 addendum — the timeout-axis red was the same fault as 89, one file over

The sweep of 1c9c7ee left `timeout-axis-proof.mjs` red with the reason line: HEAD carries the marker in 3
proofs while this worktree carries it in 2. Diagnosis: the worktree half reads declarations with an ANCHORED
line rule, while the HEAD half asked git to count MENTIONS of the string — and that proof mentions its own
marker a dozen times inside its section 1 fixtures, so the two halves of one cross-check were asking two
different questions and comparing their answers proved nothing. Fix: the HEAD side now asks git the same
anchored question. The general rule this adds beside amendment 89 is short: an independent reader may differ
in IMPLEMENTATION, never in GRAMMAR. Verified green end to end, 2 of 69 rows declaring (isolated at 900000 ms,
reap at 600000 ms), the same number on both sides of the check.

### Amendment 90 — v90: three witnesses red for the wrong reason, and the record their fix needed

The 1c9c7ee sweep left four reds and amendment 89 named a cause for each. Three of them turned out not to
be host defects at all, and the fourth was a fixture that had never been able to run. Written now, in the
past tense of measurement, because the citations to this number (a commit message, a proof header, a
sentence at the end of the evidence README) were written BEFORE anybody wrote the record they cite. That
order is the defect class this repository already names — a citation in citation syntax is not evidence
that the thing cited exists — and the fix for a missing record is the record, not a deleted reference.

Measured on this box, 2026-09-27, against `da70f3b`:

- **reaper-survivor-proof.mjs** — v53's witness had carried `timeoutMs: 500` since before amendment 86
  existed. Section 0 now asks the box how long a spawned process takes to write its first byte and derives
  the kill budget from the answer: **427 ms here, so 3 427 ms of budget** (a previous run of the same
  calibration answered 507 ms, i.e. the number is the box's, not the file's). With that, both arms have a
  live subject: reaper OFF, 46 heartbeats at the report and 59 900 ms later; reaper ON, `reaped` reported,
  116 at the report and 129 later. The label still means "the tree-kill call succeeded", not "nothing
  runs", and now the assertions on either side of the kill are gated on the subject having been alive, so
  a 0-beat comparison fails loudly instead of passing as `0 === 0` — amendment 86's disease, cured in the
  one file that predated the cure. The temp directory is still held at cleanup (`EPERM`) because the
  detached grandchild the section just measured is alive; the proof prints that instead of hiding it.
- **isolated-proof.mjs and timeout-axis-proof.mjs** — both were still calling the synchronous child-process
  APIs this host refuses with `EBUSY`. Amendment 86 shipped `docs/evidence/lib/syncproc.mjs` and migrated
  33 proofs onto it; these two were left behind, so their git reads never returned a byte and their
  cross-checks could not run. They now import from the same bridge, which puts the population at **35 files
  reading their git through it**.
- **The tar flag, and which plane says what.** v81 extracted a clean checkout with
  `tar -xf <absolute path with C:> --force-local`, because GNU tar reads a drive colon as a remote host.
  `--force-local` is GNU-only. Both tar binaries on this box were then measured by path: `C:\Windows\System32\tar.exe`
  is **bsdtar 3.8.8** and answers `Option --force-local is not supported`; `C:\Program Files\Git\usr\bin\tar.exe`
  is **GNU tar 1.35** and accepts it. Which one the word `tar` reaches is PATH order, and from a Git Bash
  launch GNU answers first — so the comment v90 shipped, which asserted flatly that this box's `tar` is
  bsdtar, is true of System32 and of a scrubbed PATH and false of the plane a sweep launched from here
  actually uses. The fix does not depend on the answer: the archive and its destination are now named
  RELATIVE to the extraction directory (`tar -xf ref.tar -C repo`), which carries no colon for either tar
  and needs no flag for either tar. The lesson is amendment 88's census rule in a new costume — a claim
  about a binary is a claim about a PLANE, and a comment that drops the plane will be falsified by the next
  shell.
- **isolated-proof's "the two dists MUST differ"** was a pinned expectation. It is now derived from
  `git status` on `agents/runtime`: equal bytes over a clean package is the reproducible rebuild v84 expects,
  and only DIRTY sources with equal bytes would be v81's isolation failure. Re-running the proof at
  `8910ed3` exercised exactly that branch — the worktree then carried 6 uncommitted changes under
  `agents/runtime`, and the proof reported "the two dists differ (the home repository carries uncommitted
  changes)" instead of passing on a coincidence. The same run: cross-drive build exit 1 in 93.8 s naming
  `@nexus/studio#build` with the reason quoted from its own log, labelled `CROSS-DRIVE` beside the statement
  that this ref compiled GREEN on the repository drive; a clean checkout walking 194 of the worktree's 230
  files; the home dist unmoved at `204913d0f036b30c` over 244 files across the whole isolated build; and the
  ownership census in a git-free directory answered `null` — "cannot ask" — rather than `0`.

What did not move: no budget marker, no selection rule, no production source. The two migrated proofs keep
their assertions; only the call that could not return bytes changed.

### Amendment 91 — v91: a documentation table is a claim, so it became a row

`docs/evidence/agents/README.md` has staked a sentence since v63: the runtime rows sum to exactly **354**
over 26 files, the `exec-host/*` rows to exactly **275** over 8, and "a row whose number drifts from its
file is a documentation bug". Every recount since then was done by whoever remembered, with a script kept
in a temp directory. v91 makes the sentence a row of the population it grades.

`docs/evidence/agents/table-recount-proof.mjs` boots vitest for both packages, reads the per-file case
counts out of the JSON report, reads the table's digits out of the README **as HEAD owns it** (`git show
HEAD:…`, so the worktree cannot be graded against a half-edited doc), and compares in four directions:
row vs its own file, rows vs the prose totals, a file with no row, and a row with no file. Measured on this
box, 2026-09-27: **354 over 26 files and 275 over 8, drift 0, and the census is now 3 of 70 proofs declaring
a budget** (this witness declares 300 000 ms for its two vitest arms, beside isolated's 900 000 and reap's
600 000). The two claims that make it a
witness rather than a script:

- **The reader is the subject, and its grammar was wrong twice.** v90's table was audited with a rig whose
  first grammar insisted the digits sit INSIDE the backticks. The table writes them outside, and writes six
  rows as `` `visualQa.test.ts` +contrast (3) `` — a continuation block for a file already on the page. That
  reader saw 322 of 354 cases and reported TWO FALSE DRIFTS on a table that was correct (repair 11 vs 16,
  visualQa 21 vs 26). A checker with the wrong grammar does not fail quietly; it manufactures defects in
  healthy files, which is amendment 89's lesson one level down. Section 1 therefore tests the grammar
  against base, continuation and `exec-host/`-prefixed rows — and against a prose line that merely wears a
  row's shape — before section 3 is allowed to use it.
- **The checker is required to be able to go red.** Section 5 mutates a copy of the table four ways (a base
  row plus one case, a continuation row plus one case, a whole row deleted, a prose total minus one) and
  asserts the SAME function that graded the real table catches each, after asserting the unmutated control is
  clean. All **4/4 caught**, e.g. `runtime/registry.test.ts: rows 8 = 8 vs measured 7`.
- **A dirty tree is refused, and a foreign file is named rather than counted.** Every counted test file must
  be byte-clean against HEAD, or the proof says it would be grading a modified file as if it were the
  committed one. Files that no commit owns are excluded from the counts and printed: at this run
  `agents/runtime/test/vectorStore.test.ts` is untracked and carries one failing case, so vitest exits 1,
  the JSON is still read (a nonzero exit is data, not a lost report), and the proof stays green about the
  table while stating plainly that the suite in this worktree is not green. v80's census lesson, applied to
  a doc gate: the numbers a proof reports must carry the plane they were measured on.

Nothing else moved: no test file, no source file, no assertion in another proof.
