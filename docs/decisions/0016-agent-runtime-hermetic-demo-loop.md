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
