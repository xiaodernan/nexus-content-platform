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

### Amendment 92 (M2 v92): the first clean-checkout population number, and a proof that asks WHICH PLANE is grading

Amendment 91 shipped a proof and staked a sentence — `table-recount-proof.mjs` "is now the 70th row of the
population it grades". The sweep that owed it a number ran, and the row went red at load. Every figure below is
quoted from a runner log on disk, then re-counted with `grep` over that same file.

- **The run that indicted the sentence.** `[isolated] adfa403 → D:\nexus-isolated-DO9EqZ\repo: 3727360 bytes of
  tar · … 308 third-party junctions · 5 workspace links from the ARCHIVED globs · build exit 0 in 128.1s`,
  then `[summary] ref adfa40360b30 · scripts 70 · failed 43 · killed 0 (0 at the runner's default, 0 at a
  budget the row named) · graded build cc73dcf781dd0a2b (224 dist files, stable across the run) · runner's own
  build 204913d0f036b30c stable · tree 61265f575e9c6e92 (stable) 194 files · dirty-sources 2 · 172s`, closing
  with `[isolated] home build after the run: 244 files, digest 204913d0f036b30c · UNMOVED (the isolation gate)`.
  Nothing was killed and the tree never moved, so 43 reds are 43 verdicts.
- **Counted, not assumed.** 40 of the 43 reason lines name a `git` command — 31 `Error: Command failed: git
  rev-parse HEAD`, 2 `git rev-parse HEAD → exit 128: fatal: not a git repository`, 3 `git ls-tree -r --name-only
  HEAD -- docs/evidence/agents → exit 128`, 1 `git archive HEAD → exit 128`, 1 `git show
  HEAD:docs/evidence/agents/README.md` (that one is amendment 91's own row). The other three —
  `exec-host-proof`, `isolated-proof`, `porcelain-path-proof` — assert against a real SHA or a real working
  tree. One cause: `[identity] walked tree … census NO .git — every file here is the ref's`.
- **Not a regression, and saying which plane a number belongs to is the whole point.** Amendment 89's
  "5 red of 69" was graded with the WORKTREE as cwd, where git answers. This is the first full population sweep
  ever run on the clean-checkout plane: 27 rows pass there — the ones whose subject is pure data — and every row
  that asks the repository a question about itself cannot. Amendment 88's rule is unchanged: name the shared
  cause once, before the rows, instead of letting 43 rows rediscover exit 128 individually. The runner already
  prints the census line that explains all 43; making it PREDICT them is the next lane, not this claim.
- **The row's fix, and the discipline that kept it honest.** A clean checkout is not a bug in a proof — it is
  the plane a row is supposed to run on, because those bytes are exactly what the commit owns. So the proof now
  asks `git rev-parse --show-toplevel` ONCE and prints which plane is grading: `[§0] plane GIT · the graded
  table comes from the HEAD blob, cross-checked equal to the worktree copy`, or on a checkout the materialised
  file with `[§0] plane NO-GIT …`. Where the GIT plane used `git diff` as a dirty-tree precondition, a checkout
  has no index to ask — and a precondition that cannot be evaluated must never be reported as satisfied
  (amendment 86's rule against a green that graded nothing), so §6 substitutes a before/after sha256 digest of
  the README and both test dirs taken around the vitest runs. Measured on the GIT plane at `fd21c28`:
  `[§3] rows vs measurement: runtime rows 354 over 26 files · measured 354 over 26 · exec-host rows 275/8 ·
  measured 275/8`, `[§5] control clean · mutations caught: 4/4`, `[§6] … graded-tree digest 5f9f4898a6fdbd4d
  stable across the run`.
- **A rig that reproduced the plane only halfway, and was not allowed to speak for it.** The hand-built rig
  junctions the 308 third-party packages but skips the five `@nexus/*` workspace links and the build, so vitest
  inside it graded `measured 127 over 26` runtime and `0/8` exec-host and the proof went red on drift. That red
  indicts the RIG, not the ref: the proof behaved correctly — it reached §3 and reported what it measured. The
  authoritative arm is the sweep's own isolated tree, which links all five and builds — and there the row is
  green: `OK table-recount-proof.mjs (exit 0, 18861ms, budget 300000ms declared)`, whose §6 line is the checkout
  arm speaking in its own words: `no index here, so the before/after digest stands in · graded-tree digest
  f2c2f0503153b175 stable across the run`. An exit 0 there means §3's assertions held against the ref's materialised
  bytes — 354 runtime cases over 26 files, 275 exec-host over 8, drift 0 — graded with no git in reach at all.
  The population number moved from 43 red to 42: `[summary] ref fd21c288ad57 · scripts 70 · failed 42 · killed 0
  · graded build cc73dcf781dd0a2b (224 dist files, stable across the run) · runner's own build 204913d0f036b30c
  stable · tree 61265f575e9c6e92 (stable) 194 files · dirty-sources 2 · 153s`, home build UNMOVED, and the
  remaining 42 are 39 `git …` cause lines plus the same three real-SHA assertions. One row healed; the plane
  itself is unchanged, as it should be.
- **Census claims rot, so they are corrected in place** (amendment 88's fourth rule; the runner prints the live
  number every run): `[identity] closure: 35/70 tracked proofs import 1 relative path(s) from their OWN location
  … (docs/evidence/lib/syncproc.mjs ← 35 proof(s)), 0 are in NO commit` — 35, where amendment 89 wrote 32 of 69,
  because amendment 90 migrated three more witnesses onto the shim. And `[identity] row budgets: 3 of 70 rows
  name the milliseconds they need (isolated-proof.mjs 900000ms, reap-proof.mjs 600000ms,
  table-recount-proof.mjs 300000ms)` — re-counted independently with `git grep -l -E
  '^//[ \t]*sweep-budget-ms:[ \t]*[0-9]+$' HEAD` = 3, one grammar on both sides (amendment 89).
- **The runner named someone else's work, which is what an identity block is for:** `dirty tracked sources
  under packages: 2 — agents/runtime/src/index.ts, packages/ai-providers/src/index.ts` and `untracked 36
  (2303351 B)` in the walked tree — why the runner's own build is 244 dist files while the ref's is 224. None of
  it is this increment's edit, and `git add` named four files rather than `-A` for exactly that reason.
- **A finding that was refused, which is the same rule applied to reports.** Mid-cycle a completion
  notification handed over other sweeps — `scripts 465 · failed 395`, then `16 of 70`, with named causes like
  `npm : The term 'npm' is not recognized`, `tar: Option --force-local is not supported`, a
  `git version 2.36.0.windows.1` box, and a follow-on claim of 22 rows dying on `Cannot find module`. Over the
  log this cycle actually wrote, `grep -ac "Cannot find module"` answers **0** and the file the notification
  pointed at does not exist. Amendment 80's rule was about bytes; this is that rule about reports — a number is
  citable only from a file you can point at, whichever channel carried it, including one the harness labels as
  finished. Nothing from it appears above except as the refusal itself.
- **The green row summarized itself in the wrong plane, and the log quoted above is the proof.** `fd21c28`s isolated row prints §6 in the checkout arm's words (`no index here, so the before/after digest stands in`) and then, three fields later on the SAME line, `[summary] graded README bytes are HEAD's (git show) and every counted test file is HEAD's (git diff empty)` — two claims about commands that cannot answer where the row was graded. §0 had switched arms; the one sentence written to be quoted had not, and §5's mutations could not have caught it: they mutate the TABLE, never the prose about method. The summary now opens `plane GIT:` or `plane NO-GIT:` and the checkout arm names what it actually used (the materialised ref bytes, with §6's digest standing in for the index). Rule, one notch beyond the amendment itself: switching planes moves the *reporting*, not only the assertions. A green row that prints a false sentence about its own method is worse than a red one, because a red one is the only kind anyone reads closely.


### Amendment 93 (M2 v93): the population's dependence on the repository is PREDICTED before the rows run, and the sweep reconciles that prediction against its own verdicts

Amendment 92 ended on a sentence about the runner, not about a proof: "The runner already prints the census line
that explains all 43; making it PREDICT them is the next lane, not this claim." This amendment is that lane. Every
figure below is quoted from a runner log on disk (`%TEMP%\nexus-v91\sweep-69e7d20.log`, 25199 bytes) and then
re-counted by a scratch script that reads that same log and those same committed bytes; where the two disagree, the
disagreement is written down rather than smoothed over.

- **The rule, and the grammar it is written in.** `sweep.mjs` exports `gitReaches(src)`, `SPAWN_FAMILY` and
  `GIT_PROGRAM`. A reach is counted at CODE POSITION by two shapes: **R1** — a spawn-family callee
  (`execFileSync`, `execFile`, `spawnSync`, `spawn`, `execSync`, `exec`, `fork`, plus the bridge's `run`/`runSync`)
  whose first argument is a git program literal, including both arms of a platform conditional; **R2** — an array
  literal that begins with `'git'`, the argv shape the exec-host's own tables use. Comment bodies and string bodies
  are dropped before matching, and a `${}` inside a template returns the scanner to code — the same
  code-position discipline amendment 89 imposed on `relativeSpecs`, reused here for a second question. This is not a
  new invention of a scanner; it is the rule that already reddened a closure census, aimed at the word `git`.
- **Predicted, before any row ran.** `[identity] plane axis: 49/71 tracked proofs reach a git child process AT CODE
  POSITION (238 call sites: program=114 argv=124) — bridge-report-proof.mjs, budgets-proof.mjs, color-proof.mjs,
  commit-echo-proof.mjs, commit-proof.mjs, config-proof.mjs …43 more · a naive "the word git appears anywhere" rule
  calls 54, and the 5-row difference is prose and comments, which cannot spawn (amendment 89) · this tree has NO
  .git, so these rows must fall back or go red`. The last clause is the prediction doing work: the runner now says,
  before the first child boots, which rows are about to ask a question this plane cannot answer, and why.
- **Reconciled, after the last row.** `[plane axis] prediction vs verdicts: 49 rows predicted to reach git · red AND
  predicted 39 (of which 35 name git in their reason line) · RED WITHOUT being predicted 3 (closure-proof.mjs,
  cwd-axis-proof.mjs, drive-axis-proof.mjs; of these 3 do name git, so the rest fail for a cause of their own) ·
  GREEN while predicted 10 (color-proof.mjs, cut-tally-proof.mjs, exec-sandbox-proof.mjs, execsuite-proof.mjs,
  exectest-proof.mjs, plane-axis-proof.mjs, prefix-proof.mjs, table-recount-proof.mjs, two-tree-proof.mjs,
  window-proof.mjs) · an empty "red without being predicted" list is the gate: every failure is accounted for by the
  prediction`. The gate is deliberately NOT "zero reds" — on this plane 42 reds are the correct answer (amendment
  92). The gate is that no row fails for a cause the runner did not foresee.
- **The three misses are the scanner's own named blind spots, and they are the same three.** `closure-proof.mjs`,
  `cwd-axis-proof.mjs` and `drive-axis-proof.mjs` reach git without a call site this rule can see: the first through
  `const sh = (cmd, argv, cwd = root) => …execFile(cmd, argv…)` — inside that wrapper the program position holds a
  PARAMETER, so `sh('git', ['rev-parse','HEAD'])` has no git literal in a spawn call at all — and all three through
  `sweep.mjs`'s own exports (`sw.proofCorpus`, `sw.gitReaches`, `sw.isolatedCheckout`), which reach git one frame
  away from where the scanner looks. Their cause lines confirm the diagnosis rather than contradicting it:
  `Error: git ls-tree -r --name-only HEAD -- docs/evidence/agents → exit 128` for two of them and `Error: git
  archive HEAD → exit 128` for the third. Amendment 92 called the runner's census line an after-the-fact attribution;
  this is the before-the-fact version, and its residual error is three rows whose shapes are now written down.
- **Re-counted on the same grammar over three historical logs, and stable.** A scratch script (`%TEMP%\nexus-v93\
  reconcile.mjs`) imports `gitReaches` from the committed `sweep.mjs` — it does not re-implement the rule — reads the
  population out of each ref with `git ls-tree … -- docs/evidence/agents | grep '-proof.mjs'`, and grades each
  ref's own log: `ref adfa403 · population 70 · predicted 48 · naive-mention 53 · call sites {"program":113,"argv":124}`
  → 43 red = 40 predicted + 3 not; `ref fd21c28 · population 70 · predicted 48 · naive 53` → 42 red = 39 + 3; `ref
  29ad568 · predicted 48 · naive 53` → 42 red = 39 + 3. The unpredicted trio is byte-identical across all three
  runs, and the only bucket that MOVES is the one that should: `green WHILE predicted 8` at adfa403 becomes `9` at
  fd21c28 and 29ad568, and the added name is `table-recount-proof.mjs` — amendment 92's healing shows up as a number
  in this ledger. At 69e7d20 the same bucket is 10, and the tenth name is `plane-axis-proof.mjs`.
- **The arithmetic of "names git", checked with grep because two different questions look like one.** Over the
  69e7d20 log: `grep -ac '^FAIL '` answers 42, `grep -a '^FAIL ' | grep -ac '\bgit\b'` answers 41, and counting only
  the CAUSE segment after the `||` separator answers 38 — which is exactly the runner's 35 + 3. The gap between 41
  and 38 is rows that print the word git in their own stdout while failing for an assertion: `hunk-shape-proof.mjs`
  announces `[§1] git "3 files changed, 2 insertions(+), 1 deletion(-)"` and then dies on `AssertionError: history
  must hold the commit that WROTE that predicate: []`. Four red rows name no command in their cause (exec-host,
  hunk-shape, isolated, porcelain-path) and all four ARE predicted — which is the argument for predicting at code
  position instead of grepping reasons. Amendment 89's rule applies to the runner's own prose too: a quotation of a
  git command is not a git call, in a proof's stdout or in a census.
- **The 71st row, and the numbers it measures.** `plane-axis-proof.mjs` runs green on both arms. On the GIT plane at
  `69e7d20`: `[§0] plane GIT · population graded from HEAD's tree (git ls-tree + git show, so a half-edited proof
  cannot be censused as if it were committed): 73 tracked .mjs, of which 71 are scored rows` and `[§0] the grammar
  used below is the committed one: docs/evidence/agents/sweep.mjs matches HEAD byte-for-byte (74000 B)`; `[§1]
  grammar cases exact: 15/15 — including 8 that must NOT count`; `[§2] census of the 71 scored rows: 49 reach a git
  child process at code position (program=114 argv=124 call sites) · the naive "the word appears anywhere" grammar
  calls 54` and `[§2] the 5 rows only the naive rule names (prose and comments, which cannot spawn):
  changes-proof.mjs, closure-proof.mjs, code-index-proof.mjs, cwd-axis-proof.mjs, rolechain-proof.mjs`; `[§3] the
  bridge exports 3 process entries (execFileSync, spawnSync, spawn); all of them are in the list the scanner
  trusts`; `[§4] blind spot · parameter-bound program: 2 (…)`, `[§4] blind spot · reaches through sweep.mjs itself:
  3 (closure-proof.mjs, cwd-axis-proof.mjs, drive-axis-proof.mjs)`; `[§5] census moves: +1 call site on
  agent-proof.mjs → 1 · prose-only append → 0 (unchanged, as required) · every program literal renamed in
  bridge-report-proof.mjs → 0 from 1`; `[§6] summary over 71 scored rows: 49 predicted askers, 5 prose-only
  mentions, 5 named blind-spot rows, 0 rows binding the program name to a variable`. §3 exists because a callee
  list that drifts makes the census SHRINK silently, and a smaller number is the one failure mode a checker must not
  be able to hide; §5 is the three-way mutation that proves the checker can be red — a call site appended moves it
  by exactly one, prose appended moves it not at all, and renaming every git literal in a real asker drops it.
- **A finding inside the new row, kept because it is embarrassing.** §6's last figure (`0 rows binding the program
  name to a variable`) and §4's first (`parameter-bound program: 2`) are two different grammars — the first looks for
  `const X = 'git'`, the second for `sh('git', …)` — so they are not a contradiction, but they read like one, and one
  of §4's two names is `plane-axis-proof.mjs` ITSELF, caught because a §1 test case contains the string
  `sh('git', ['rev-parse', 'HEAD'])`. The prediction scanner correctly refuses that string (§1 case 14 demands 0
  reaches for exactly that shape); the BLIND-SPOT census, written as a word-shape regex over raw text, does not. So
  the population number is unaffected and the blind-spot list carries an artifact of its own method. The fix is to
  run the blind-spot rules through the same code-position scanner, and it is named here instead of being quietly
  rounded away: a checker's self-description is held to the same standard as its subject's.
- **Census claims rot, so they are corrected in place** (amendment 88's fourth rule). Amendment 92 wrote "5 red of
  69"-style numbers against a 70-row population; this run grades 71 and predicts 49. The movement is not drift — the
  population grew by one row and that row is itself an asker, so 48/70 becomes 49/71, and the call sites 237 (113 +
  124) becomes 238 (114 + 124). Both sides of that comparison use the anchored `*-proof.mjs` grammar
  (`git ls-tree -r --name-only <ref> -- docs/evidence/agents`), not a remembered count.
- **What was refused, and what is next.** A prediction is not a healing: the 42 reds are still red, and nothing in
  this amendment makes a row fall back on a checkout. The mechanism that closes the gap is a row that DECLARES what
  it asks the repository — a `// sweep-asks-repository:` marker read with the same two-sided, anchored grammar
  amendment 85 used for `// sweep-budget-ms:` and amendment 89 used to keep the declaration and the census from
  disagreeing. That declaration also reaches the three blind spots, because a wrapper's caller can state what the
  call-site rule cannot see. It is the next lane, not this claim.
- **The run, whole.** `OK plane-axis-proof.mjs (exit 0, 2063ms, budget 240000ms default)` and
  `OK table-recount-proof.mjs (exit 0, 11899ms, budget 300000ms declared)`;
  `[summary] ref 69e7d2023356 · scripts 71 · failed 42 · killed 0 (0 at the runner's default, 0 at a budget the row
  named) · child cwd D:\nexus-isolated-CSTtrx\repo · graded build cc73dcf781dd0a2b (224 dist files, stable across
  the run) · runner's own build 204913d0f036b30c stable · tree 61265f575e9c6e92 (stable) 194 files · dirty-sources
  2 · 115s`, closing with `[isolated] home build after the run: 244 files, digest 204913d0f036b30c · UNMOVED (the
  isolation gate)`. Nothing was killed and neither build moved, so all 42 reds are verdicts and the reconciliation
  above is graded against bytes that did not change underneath it.

- **The documentation edit was reddened by its own row, and that is the ordering this lane now documents.** Between
  appending this amendment's README section and committing it, `table-recount-proof.mjs` went RED on the GIT plane at
  its own precondition — `on the GIT plane the worktree README must equal the blob the ref owns, or this proof would
  grade bytes no commit made` (its line 63, an `assert.equal` between `git show HEAD:README` and the disk copy). The
  row is refusing to certify a table it cannot attribute to a commit; the increment's own evidence row is what caught
  the increment's own uncommitted doc. So the sequence for any shared-doc append is append → commit → re-run, and the
  intermediate red must be reported as the precondition firing, never as a regression. Measured at the ref this
  ordering produced (`8661cc4`, which contains the two documents and nothing else): `[§3] rows vs measurement: runtime
  rows 354 over 26 files · measured 354 over 26 · exec-host rows 275/8 · measured 275/8`, `[§5] control clean ·
  mutations caught: 4/4`, `[§6] … graded-tree digest b0ec9a2cc51138ec stable across the run`, `[summary] plane GIT:
  graded README bytes are HEAD's (git show) …` — exit 0, with 42 lines of new prose in the graded README and both
  row totals unmoved, which is the check doing its job in the other direction (a doc section that is not a table row
  must not shift a table count). `plane-axis-proof.mjs` re-ran green at the same ref with the identical census —
  `[§2] census of the 71 scored rows: 49 reach a git child process at code position (program=114 argv=124 call
  sites) · the naive "the word appears anywhere" grammar calls 54` — because the population and the scanner's bytes
  did not change, only the document they describe.


### Amendment 94 (M2 v94): a row that reaches the repository through a frame the scanner cannot enter may SAY so, and the sweep reconciles declaration against prediction against verdict

- **Why a caller-side channel was the only honest option.** Amendment 93 shipped a prediction and then named, in its
  own record, the two shapes it could not see: `const sh = (cmd, argv) => execFile(cmd, argv)` puts a PARAMETER where
  a call-site rule looks for a program name, and a row that reaches git through this directory's own runner
  (`sw.proofCorpus`, `sw.isolatedCheckout`, `sw.runSweep`) spawns one frame below the bytes being scanned. Three rows
  therefore went red on the clean-checkout plane with a cause the prediction foresaw in general and could not name in
  any of them — `[plane axis] … RED WITHOUT being predicted 3 (closure-proof.mjs, cwd-axis-proof.mjs,
  drive-axis-proof.mjs)`. Making the scanner "deeper" is the tempting fix and the wrong one: it would have to follow
  a call graph across files, invent a wrapper heuristic, and then be graded by a rule nobody can check. So the CALLER
  speaks and the runner gets a third source to reconcile against.
- **The grammar is amendment 85's, reused rather than re-invented.** `// sweep-asks-repository: <claim>` —
  first-column, read out of the ref's bytes, one line per claim, payload free text. It is read by `declarations(src,
  marker)`, which walks a source ONCE and hands every code-position line comment to a sink; the budget channel
  (`// sweep-budget-ms:`) now goes through the same function. One tokenizer, two channels, so a quotation of a
  marker inside a string or a block comment is invisible to BOTH and the axes cannot drift apart by grammar.
  `asks-axis-proof.mjs` §2 demonstrates it on one source: `the same walk returned 2 reaches (argv+program) and
  collected 2 code-position comments, of which 1 declares`.
- **A declaration buys foreknowledge and buys the row nothing.** It does not skip a row, does not grant a fallback,
  does not soften a verdict (amendment 86's rule against a green that graded nothing), and the run proves that by
  leaving amendment 93's number exactly where it was: at 2755c0a the clean-checkout plane still reports
  `RED WITHOUT being predicted 3 (closure-proof.mjs, cwd-axis-proof.mjs, drive-axis-proof.mjs)` and still
  `failed 42` of `scripts 72`, while the NEW line reads
  `[asks axis] … RED with NEITHER prediction NOR declaration 0 (none)`. A channel that leaked a pass would have
  shown up as the first number falling, not the second.
- **The gate 93 could not satisfy became satisfiable without weakening it.** 93's gate was "every red was predicted",
  and three rows made it unsatisfiable from outside however correct the run was. 94's gate is the same list with a
  second channel into it — `red ∧ (predicted ∨ declared)` — and its verbatim form in the log is
  `4 rows declared what they ask (3 of them invisible to the code-position scanner — closure-proof.mjs,
  cwd-axis-proof.mjs, drive-axis-proof.mjs) · red AND declared 3 of 42 red · RED with NEITHER prediction NOR
  declaration 0 (none)`. This is the first ref in this repository's history where that list is empty.
- **Census, both grammars, each stated with the grammar that produced it.** Declaration census
  (`asks-axis-proof.mjs` §3, GIT plane, exit 0, 22 grammar cases of which 11 must NOT count): 4 of 72 scored rows
  declare — closure, cwd-axis, drive-axis, table-recount — 1 corroborated by the scanner's own eyes (table-recount)
  and 3 visible only to themselves. §3 asserts `uncorroborated.length > 0`, because a census in which every
  declaration was corroborated would mean the blind spots had been paper over rather than declared; if the scanner
  ever learns to see those three, that assertion has to MOVE, and that is the design, not an inconvenience.
  Call-site census (`plane-axis-proof.mjs`, same ref, exit 0): 74 tracked `.mjs`, 72 scored rows, `50 reach a git
  child process at code position (program=115 argv=124 call sites)`, naive "the word appears anywhere" 56, blind
  spots 2 parameter-bound + 3 through `sweep.mjs`, §5 mutations move the census `1 / 0 / 0` as required.
- **The run, whole.** `node docs/evidence/agents/sweep.mjs --isolated --ref 2755c0a` on the clean-checkout plane:
  tar 3 809 280 bytes, dest `D:\nexus-isolated-C65xIn` (SAME DRIVE as the repository, chosen repo-drive FORCED off
  `os.tmpdir()` by the C:/D: mismatch), 308 third-party junctions, 5 workspace links, `build exit 0 in 289.4s`,
  `closure: 37/72 tracked proofs import 2 relative path(s) … syncproc.mjs ← 37 proof(s), sweep.mjs ← 2 proof(s) …
  0 are in NO commit`, then `scripts 72 · failed 42 · killed 0 (0 at the runner's default, 0 at a budget the row
  named) · graded build cc73dcf781dd0a2b (224 dist files, stable across the run) · tree 61265f575e9c6e92 (stable)
  194 files · dirty-sources 2 · 144s`, and the isolation gate `home build after the run: 244 files, digest
  204913d0f036b30c · UNMOVED`. The graded build and tree digests are byte-identical to amendment 93's run, so the
  only thing that moved between those two sweeps is the population and the axes printed about it. The new row itself
  ran `OK asks-axis-proof.mjs (exit 0, 15463ms, budget 240000ms default)` — green on this plane and on the GIT plane,
  because it grades a grammar and detects its plane rather than requiring a repository.
- **A prediction written before the log was read, and what it got right.** The numbers above were forecast from the
  committed bytes and written down before opening the log: 50 predicted askers, 239 call sites (program=115
  argv=124), naive 56, declared 4 / corroborated 1 / uncorroborated 3, `failed 42`, `killed 0`, and the three
  declaring rows still red for the same exit-128 causes. All held. Two were only knowable from the run and are
  reported as such: `GREEN while predicted` moved 10 → 11 because the new proof is itself a predicted asker that
  passes on both planes, and the row's duration (15 463 ms) was not forecast at all.
- **The confessions and the child's own words agree, 3 for 3.** Each of the three rows whose declaration is
  invisible to the scanner failed on the checkout with a cause line naming a command its declaration lists:
  closure-proof and cwd-axis-proof both report `git ls-tree -r --name-only HEAD -- docs/evidence/agents → exit 128`
  and declare `git ls-tree + git cat-file --batch (sw.proofCorpus)`; drive-axis reports
  `git archive HEAD → exit 128` and declares `git archive HEAD once per sw.isolatedCheckout call`. That agreement
  is not yet a gate — it is measured by hand here — and grading a declaration against the failure the row itself
  reports is the obvious next increment, because it is the only way a confession becomes more than a sentence.
- **Adding prose to a row moves ONE grammar and not the other.** The declaration comments introduced the word git
  into the prose of `drive-axis-proof.mjs`, which had not spelled it before: the naive count went 54 → 56 and
  drive-axis joined the prose-only list, while the code-position count went 49 → 50 only because the new proof
  spawns git inside a wrapper. Same population, two grammars, two answers — which is why every number in this
  directory travels with the grammar and the plane that produced it.
- **The migration's own defect, caught before it shipped.** Routing `rowBudget` through the new reader left
  `const raw = all[0][1]` — a regex-era habit, correct while `declarations` returned match arrays, and now reading
  the SECOND CHARACTER of the payload. `// sweep-budget-ms: 900000` became `0`, which the function refuses as "no
  duration is asked for"; every declared budget in the population would have been refused, `isolated-proof.mjs`
  would have been killed at the runner's 240 000 ms default, and the red would have been filed as a slow build. §5
  is now written to fail on exactly that shape: 12 budget cases graded at a STATED VALUE (4 of them must be obeyed,
  6 must be refused or defaulted), plus a census arm that re-reads each marker line by hand and holds the obeyed
  number to the number the bytes spell — `3 rows declare milliseconds (isolated-proof.mjs=900000,
  reap-proof.mjs=600000, table-recount-proof.mjs=300000) and every one is obeyed at the number its own bytes hold`.
  Measured over the committed rows before shipping: 71/71 parse identically under both grammars, so this closed a
  hole the population does not exercise (no row today quotes a budget marker) rather than healing an incident —
  stated that way rather than as a save.
- **Independent reconciliation, so the runner is not its own witness.** A second path in `%TEMP%` lists the
  population with `git ls-tree` + `git show` and applies the exported rules directly: `scored rows 72 · predicted
  askers 50 (program=115 argv=124, total 239 call sites) · naive 56 · prose-only 6 · declared 4 … corroborated 1 …
  uncorroborated 3 … empty attempts none · declared budgets 3 … ceiling 3600000 · default 240000` — the same
  numbers the runner printed, reached by a different reader of the same bytes.
- **The table gate re-ran because this amendment touched a row it grades.** `table-recount-proof.mjs` gained a
  declaration comment; at 2755c0a it is exit 0 with `runtime rows 354 over 26 files · measured 354` and
  `exec-host rows 275/8 · measured 275/8`, `failing TRACKED cases: 0`, 4/4 mutations caught, graded-tree digest
  `b0ec9a2cc51138ec` stable. A proof's own bytes changing must not move the numbers it reports, and here they did
  not.
- **Refusals, limits, and seven shapes measured rather than reasoned about.** A declaration is not evidence: the
  runner cannot verify what only the declaring row could know, so the honest reading of `1 corroborated / 3 not` is
  that one arm is checkable and three are trust-me — the gain is that a reader can now SEE which is which. Five
  edge shapes were measured against the committed reader and frozen as §1 cases: a marker inside a template
  interpolation does not declare (the recursive `gitReaches(interp)` is called without a sink, so a nested frame can
  be counted and cannot speak); `/* c */ // sweep-asks-repository: …` does not declare, because the line does not
  start at column 0; a `/** … */` JSDoc line does not; a marker after a shebang does; a `/*` inside a line comment is
  payload text. Also recorded against my own tooling, because it is the same failure the population keeps catching:
  the first waiter for this run declared DONE at 30 of 72 rows, because it grepped `[summary]` UNANCHORED and
  `color-proof.mjs`'s stdout contains `[summary] faces measured: …` — the runner writes a row's whole stdout into
  one `:: ` segment, so an unanchored pattern on a token the population is allowed to print matches the population.
  The corrected waiter anchored `^\[summary\] ref `, a line only the runner can produce.
- **Next.** v95 candidate: make a confession GRADEABLE — for every declaring red, test whether the command the
  declaration names appears in the cause the row itself reported (3 of 3 hold by hand above, and one of the three
  declares a command that did NOT appear in its cause, which is the interesting case: a row may confess more than it
  asks, or ask something it never reaches). Then the declaration channel stops being foreknowledge and starts being
  a claim with a verdict on it.

- **Amended at the doc ref (`a4f60b0`), because a shared-document append is a precondition, not a detail.** The
  sequence this directory settled on (append → commit → re-run) was followed, and the three grammar gates were re-run
  against the commit that carries this record. All exit 0 on the GIT plane with the numbers quoted above unmoved:
  `runtime rows 354 over 26 files · measured 354 over 26 · exec-host rows 275/8 · measured 275/8`, `failing TRACKED
  cases: 0`, `mutations caught: 4/4`; `50 reach a git child process at code position (program=115 argv=124 call
  sites) · the naive grammar calls 56`, prose-only 6, blind spots 2 + 3, §5 census mutations `1 / 0 / 0`; and
  `declaration cases exact: 22/22 — including 11 that must NOT count`, census 4 declared / 1 corroborated / 3
  invisible. ONE number moved, and it is the one that should have: the graded-tree digest went
  `b0ec9a2cc51138ec → b59354c0972fefab`, because `table-recount-proof.mjs` grades the README's HEAD blob and this
  increment wrote 35 prose lines into it. Both row totals stayed exactly where they were, which is the same check
  answering in the other direction — a section that is not a table row must not shift a table count — and it is why
  the digest is printed: a stable digest across a run that changed a graded file would mean the file was not really
  being read.
- **The asymmetry between the two documents this increment touched, stated rather than left implicit.** The README is
  graded: a proof reads its bytes out of HEAD, cross-checks them against the worktree copy, and reddens when its own
  tables disagree with a real vitest recount. The ADR is graded by nothing in this directory — a grep over the 72
  scored rows finds zero references to `docs/decisions`, and the only CI arm is that the FILE appears in the index
  (`.github/workflows/ci.yml:19-25`, "ADR index integrity"). So "amendment 94 was recorded" carries no verdict; what
  carries verdicts are the logs this bullet transcribes, and the record is honest only insofar as a reader can re-run
  the line and check. Whether an amendment's OWN numbers should be gradeable — a row that re-derives the figures a
  record claims — is a candidate worth more than this one, and it is recorded here as the reason the next increment
  looks at confessions rather than at documents.

### Amendment 95 (M2 v95): a confession is graded twice — against the bytes it points at and against the failure it predicted — and only one of the two disagreements is a defect

- **What amendment 94 left unsaid.** v94's own record closed with the honest sentence: "A declaration is not
  evidence… the honest reading of `1 corroborated / 3 not` is that one arm is checkable and three are trust-me."
  The channel was worth opening because a reader can now SEE which is which, but the runner still printed a
  confession without grading it. This amendment spends its time on the two witnesses that actually exist. The
  first is static: a clause that says `via sw.proofCorpus` names a body, and that body is a file this repository
  owns — grade the clause against it. The second is dynamic: a declaring row that goes RED prints a cause, and
  that cause names a git command, so the confession can be asked whether it covers the failure it predicted.
  Neither witness requires the scanner to become deeper, which is what amendment 94 refused and why this one
  keeps the refusal: `// sweep-asks-repository:` still feeds a sentence, and the sentences are now checked
  against things, not against opinions.
- **The vocabulary is git's, not mine.** Naming a command means deciding what counts as one, and a hand-written
  list is exactly the artifact this directory keeps reddening for being stale. `GIT_SUBCOMMANDS` carries 38 names
  and `confession-proof.mjs` §1 checks it in BOTH directions against `git --list-cmds=main`, which answers with
  179 names OUTSIDE a repository — so the check works on either plane, which is the first time an authority in
  this directory is not the index. Neither direction is decorative: no shipped name may be a verb git does not
  have, and no verb the population actually writes may be missing from the list, because a missing name is an
  under-declared confession that would pass silently in the log. Measured over the 74 tracked files at this ref:
  159 distinct tokens follow the word git, 142 of them are prose (`repository`, `call`, `child process`) — which
  is the entire reason the gate exists, and the free-text reader amendment 93 warned about would have counted
  all 159.
- **The gate is deliberately one-directional, and its failure is recorded rather than fixed.**
  `git -c x status --porcelain` names NOTHING to this grammar: an option that takes a VALUE as a separate token
  is not skipped, so the matcher reads `x` as the verb and `x` is no verb. The temptation is to scan forward for
  "the first token that is in my list", and amendment 91 is precisely the record of what that does — a checker
  with the wrong grammar does not fail quietly, it manufactures defects out of prose. So the rule under-claims,
  the miss is frozen as a §2 case labelled a measured limit, and every number the arm prints is a floor.
- **`gitReaches` learns WHICH command, across exactly one bridge.** Each hit now carries `sub` and the byte
  offset it was found at, and a command is attributed by two literal shapes only: an argv array that opens with
  `'git'` and continues with a verb (`['git', 'diff', '--name-only']`), or a program literal followed immediately
  by an array literal (`run('git', ['cat-file','--batch'])`). The second needs a bridge — the verb is in the next
  frame — so a program hit parks itself in `pendingProgram` and the very next array opening adopts it. It is
  cleared by ANY other frame, which is the whole design in one line: a rule that chains is a call graph, and a
  call graph is the thing amendment 94 refused to build because nobody could grade it. `definitions` /
  `definitionAt` give each hit the function it sits inside, which is what lets a clause pointing at
  `sw.<helper>` be graded against that helper's bytes rather than against the file that wrote the clause.
- **The byte arm, and where it goes blind: the runner's own file.** Five helpers in `sweep.mjs` are held to
  stated answers, and three return NOTHING: `isolatedCheckout` → `['archive']` and `catFileBatch` →
  `['cat-file']` are visible where they stand, while `proofCorpus` and `runSweep` name no argv at all (they call
  other functions), which is amendment 93's blind shape one frame up. The finding is the fifth case.
  `trackedProofs` really does write `git(['ls-tree', '-r', '--name-only', ref, …], cwd)` — a verb literal at code
  position in the runner itself — and the arm still sees nothing, because the callee is the module's private
  wrapper `async function git(argv, cwd)`, whose own call site passes a PARAMETER to `run('git', argv)`. So the
  file that grades the population for hidden reaches hides two of its own, behind a wrapper named exactly `git`.
  Census over the population's 4 declaring rows: 12 clauses — 2 supported, 0 partial, 9 invisible, 1 naming no
  command. `invisible` is not "caught lying": every one of those nine claims is true and the row would still have
  died on it. It is "unreadable from here", and the arm says which frame to cite to make it readable.
- **The cause arm, and the asymmetry that makes it a rule rather than a diff.** For every declaring row that went
  red, `compareConfession(claims, reason)` extracts verbs from both sides. Three outcomes, deliberately not
  symmetric: an OMITTED verb is a defect, because the row is the only reader of its own cause and a confession
  that leaves out what it just printed is unfinished; a SURPLUS is a fact, because a row may reach five commands
  and fall on one of them, so it is stated and never scored; and a cause that names no command is UNCHECKED,
  printed as its own number, because amendment 86 forbids reading "nothing to compare" as a pass. At 174fc1e on
  the clean-checkout plane (`73 scripts · 42 failed · 0 killed · 694s`): **3 red declaring rows
  (closure-proof, cwd-axis-proof, drive-axis-proof), 3 gradeable, 0 NOT gradeable · OMISSIONS 0 · surplus 5 ·
  SILENT BLIND SPOTS 0**. The three declaring reds are the three rows amendment 94 named, each cause naming
  exactly one verb (`ls-tree`, `ls-tree`, `archive`), each covered by its declaration, and the surplus is the
  rest of what they reach and this run did not break on (closure's `rev-parse`/`show`/`cat-file`, cwd-axis's
  `cat-file`/`archive`, drive-axis none) — plus the third number, which is the shape amendment 94 could not rule
  out: a red that neither the scanner nor the row foresaw while its own cause names a verb. Zero. The gate is the
  two counts added, and it is the first number in this directory's history whose empty value was bought by a
  channel the callers own rather than by a scanner that got deeper. Two other arms corroborate it at the same
  run: the plane axis still puts 3 rows RED WITHOUT being predicted (`51` predicted, `39` red-and-predicted), and
  the asks axis closes those three by declaration — `RED with NEITHER prediction NOR declaration 0`.
- **The checker has to be able to move, in both directions, on both arms.** `confession-proof.mjs` §4 shows five
  gradings of one real declaration against one real cause line: the complete claim → 0 omissions / 3 surplus;
  narrowed until it drops the verb the row DIED on → 1 omission (`ls-tree`); widened by a command the run never
  touched → surplus 4 and still 0 omissions, which is the assertion that a surplus cannot become a crime; a
  silent cause → not gradeable and not an omission; and a cause with two verbs against a claim of one → omissions
  2 AND surplus 1 in the same reading, the case where "partial agreement" is two different verdicts at once. §3
  moves the byte arm the same way: appending a spawn with a literal argv to a synthetic helper makes it visible,
  and a spawn whose argv is a parameter keeps it blind — so the five helper answers above are not a lookup table
  over remembered strings. §5's flip is the sharpest of them: renaming `isolatedCheckout` in the runner's bytes
  (not the clause) turns `supported` into `invisible`, which is what makes the arm read a BODY and not a NAME.
- **The axis died on a KEY, not a rule, and that is why it is now a function.** The first version of the cause arm
  lived inline in `runSweep`. At 6807ba1 the isolation sweep ran all 73 rows, printed `[plane axis]` and
  `[asks axis]`, and threw `Cannot read properties of undefined (reading 'gradeable')` in the last line of a
  seven-minute run. Two lookups had been written `declared.get(row)` and `cmp.get(row)` where both maps are keyed
  by `row.name`. The throw is the small half: `declared.get(row)` returns `undefined` exactly as cheerfully as it
  returns for a row that declares nothing, so the population would have been graded against an EMPTY confession
  and every verb in every cause line would have been reported as an OMISSION — amendment 91's failure shape
  (a checker with the wrong grammar manufactures defects) wearing a variable name instead of a regex. The fix is
  a boundary: the six lines are now the exported `gradeCauseArm`, so the census and the unit arm read the same
  code, and `confession-proof.mjs` §6 feeds it row objects shaped like the ones that broke it. §6 measures both
  directions of a wrong key. An object used as a name-keyed map's key reproduces the defect in one line
  (`compareConfession(undefined, 'Error: git status --porcelain → exit 128').omissions` is `['status']` for a row
  that declared precisely that verb). A key that misses in the other direction — basename in the map, repo-relative
  path on the row — is the silent one: `declaring` and `omissions` both go to 0, which looks clean, and §6 pins
  what actually catches it: the four unheard rows reappear as SILENT BLIND SPOTS, 0 heard against 4 blind. A broken
  reader cannot hide behind its own zero because the rows it drops are counted by the other arm of the same gate.
  Nothing about the population's key shapes was wrong — 6807ba1's own `[asks axis]` line had already reported
  `red AND declared 3 of 42 red` through the same `declared.has(r.name)`, which is the measurement that says this
  was a call-site defect, not a fact about rows. The method lesson is the one worth keeping: **a rule whose only
  witness is a long run is a rule that is not tested**, and seven minutes is a worse place to find a typo than
  two seconds.
- **A §6 written to test one rule rang a second.** Those four synthetic claim payloads are array elements, and
  R2's argv branch reuses `GIT_PROGRAM` (`s === 'git' || /^git\s/`), so an ARRAY OF COMMAND STRINGS that nothing
  ever spawns is a reach. `confession-proof.mjs` went from 11 reaches to 15 by adding test data, which moved the
  population's argv census 134 → 138 and no other row: attributed by replaying `gitReaches` over both refs'
  blobs, whose totals (250 → 254, `program` unmoved at 116) reproduce the gate's own arithmetic. It is pinned as
  two cases in `plane-axis-proof.mjs` §1 (want 1, want 0) rather than fixed, for two reasons. Narrowing the rule
  would rewrite amendment 93's baseline, which the ADR keeps comparable across refs on purpose; and the over-claim
  is not invisible — a row the scanner names that never breaks is reported as `green while predicted`, which is
  the arm that already punishes guessing. The boundary of the leak is stated too: `['ls-tree is a command']`
  counts nothing, so it is specifically a string that OPENS with the word git.
- **Prediction versus measurement, including the three things the prediction got wrong.** Written from the
  committed bytes before the sweep ran: 3 declaring reds, 3 gradeable, 0 omissions, 5 surplus; supported clauses
  2; table-recount 0 of its 5 commands checkable. All of those held. Three numbers did not. (1) I counted
  *clauses* by eye as 8 with 2 naming no command, while `confessionClauses` splits on `·` and the four payloads
  hold 12 clauses with 1 naming no command — the per-clause prediction survived and the per-LINE arithmetic did
  not, and the hole is that a payload is free text whose internal separator is itself a rule, which prose in an
  ADR cannot show. (2) The wiring witness carried a pre-run expectation of `surplus 1` and the run answered 2;
  here the code was right and the sentence was wrong — I had written `syn-omit` to declare `ls-tree` while dying
  on `archive` and forgotten that a partial overlap leaves a surplus on BOTH sides. §6 asserts the 2 with the
  arithmetic spelled out rather than restating the prediction as if it had said so. (3) That same witness first
  printed `0 tracked proofs DECLARE` over a synthetic corpus, because a row's `bytes` are what the runner
  materialises while every identity axis reads its `text`. That is the key defect again in a different field: one
  assumption about what the caller and the callee share, caught by printing a number instead of reasoning about
  it.
- **The sibling gates, re-run at the same ref, moved exactly where a new row must move them and nowhere else.**
  `asks-axis-proof.mjs`: exit 0, 22/22 grammar cases, census still 4 declaring rows with 1 corroborated and 3
  invisible (the new row does not declare, so the uncorroborated number is untouched). `plane-axis-proof.mjs`:
  exit 0, 15/15 grammar cases, predicted askers 50 → 51 with call sites `program=116 argv=134` and the naive count
  56 → 57 — both moves are this row, which spawns git through `execFileSync('git', args, …)` at code position and
  is therefore FORESEEN, and neither number is pinned to a literal anywhere in either proof. Re-run a second time
  at 174fc1e, after the follow-on commits, the same five gates (adds `closure-proof.mjs`, ALL GREEN) came back
  with exit 0 and only three moves in the whole record: `sweep.mjs` 94 370 B → 95 472 B at the provenance line
  every one of them reads, plane-axis 15 → 17 grammar cases with `argv` 134 → 138 for the reason the previous
  bullet gives, and §6 appearing in `confession-proof.mjs`'s own output. `51` predicted askers, `116` program
  sites, the naive 57, the declaration census at 4 rows and every `table-recount` figure stayed where amendment
  94 left them — which is the point of re-running them twice: the first re-run showed what a new ROW costs, the
  second showed what a new TEST DATA TABLE costs, and neither is allowed to look free. `table-recount-proof.mjs`:
  exit 0, `runtime rows 354 over 26 files · measured 354 over 26`, `exec-host rows 275/8 · measured 275/8`, 629
  tracked cases in 34 files, 0 failing tracked, 4/4 table mutations caught, graded-tree digest `b59354c0972fefab`
  stable — the README table did not move, because a new proof is not a test file.
- **A provenance red that arrived exactly where it should have.** While `sweep.mjs` carried the new rules
  uncommitted, all three rows that demand it (`asks-axis`, `plane-axis`, `confession`) went red at their own
  precondition with the same sentence, before grading anything: "differs from HEAD — every rule below would be
  graded by a grammar no commit owns". That is the amendment 94 lesson (a doc-facing proof refuses uncommitted
  shared state) generalised: a RULE-facing proof refuses it harder, and the fix is not to relax the assert but to
  commit the rule. The shakeout that iteration made possible is worth naming for what it is not: the new row was
  run once from `%TEMP%` with the provenance assert patched out, which shook out crashes and nothing else — every
  number quoted above comes from the committed bytes, and the patched run's numbers were discarded.
- **Refusals and limits, stated.** A declaration is still not evidence of a pass, and the run shows it: the three
  rows that confess to reaching git remain red on the checkout plane, at the same causes, in the same numbers as
  amendment 94 reported. The byte arm reads FREE TEXT on the clause side, so a cause line that merely quotes a
  command names it (§2 freezes `console.log("git push --force")` as counting 1); the cause side is a runner
  capture of stderr rather than prose, so the exposure is a row's own confession, which is the thing being graded
  anyway. `definitions` is a regex over declaration headers, not an AST: it finds 62 in the runner's file and a
  hit is attributed to the last definition starting before it, which is right for this file's shape and would be
  wrong inside a class body — stated rather than hidden, because the byte arm's whole value is that its answers
  are floors.
- **Next.** The byte arm now tells a confession how to improve, so the obvious increment is to take the advice:
  rewrite the four declarations to cite the frame where the literal actually lives (`sw.catFileBatch`,
  `sw.trackedProofs`, `sw.isolatedCheckout`) instead of the frame where the CALL happens, and predict the census
  shift before running it — 9 invisible should fall, and specifically closure's third clause should land as
  `partial` (cat-file readable through `sw.catFileBatch`, ls-tree still hidden behind the wrapper named git). Two
  things must hold while that happens: no verdict may move (a better sentence buys a row nothing), and the
  `uncorroborated.length > 0` assertion in `asks-axis` §3 must stay true, because a census where every
  declaration is readable would mean the scanner grew rather than the rows speaking more precisely. A second
  candidate came out of §6 and is deliberately left undone here: R2's argv branch could require the array's first
  element to be EXACTLY `git` rather than `/^git\s/`, which would make a data table of command strings invisible
  again. That is a baseline rewrite, not a bug fix — it moves amendment 93's `program=116 argv=134` census, so it
  has to be predicted row by row before it is run, and the prediction has to include the two cases §1 just froze.

### Amendment 95, addendum (doc ref 741b4b3): what the record itself cost, measured with the tool that owns bytes

- **The doc commit was re-run through the five gates that read it.** `plane-axis`, `asks-axis`, `table-recount`,
  `confession`, `closure` all exit 0 at 741b4b3, and exactly two numbers moved from the 174fc1e-era logs:
  `plane-axis` §1 went 15/15 → 17/17 cases (the two R2 cases this amendment added, 8 → 9 of them must-not-count),
  and `table-recount`'s graded-tree digest went `b59354c0972fefab` → `5606ad68f4844562` — which moved BECAUSE the
  graded README moved, not because anything was re-counted: 629 tracked cases in 34 files, every row matching its
  file, both prose totals matching their row sums, 4/4 table mutations caught, all unmoved. `asks-axis`,
  `confession` and `closure` came back byte-identical to their previous logs. This is the same shape as
  amendment 94's addendum, and it is the reason a doc change is committed and re-run rather than asserted: the
  README is graded by a row, so writing about the population is itself a change to it.
- **The append wrote no existing bytes, and that claim has a grammar.** `git diff --numstat` on the two shared
  records reads `166 0` and `65 0` — 231 lines added, ZERO deleted, which is the byte-level statement the tool
  that owns bytes can make. The script that performed the append printed `+17688` and `+6130` beside a "B" that
  did not belong there: `before.length` in JavaScript counts UTF-16 code units, and this block carries multibyte
  punctuation (`·`, `→`, `—`), so the real byte deltas are 17 807 and 6 157. The number was right and its UNIT
  was invented by a label. Recorded rather than quietly corrected, because this directory's rule is that a figure travels with the grammar that produced it, and
  "characters" is a different grammar from "bytes" in a repository whose line endings already disagree with
  themselves.
- **What the addendum does NOT do: re-run the population.** A full isolated sweep at 741b4b3 would report the
  same axes numbers as 174fc1e — the README is not a scored row, and no proof reads the ADR — at a cost of
  roughly twelve minutes and a different tree digest. The population figures in the amendment above therefore
  carry the ref that produced them, and a reader who wants 741b4b3's own `61265f575e9c6e92` has to ask for it.

### Amendment 96 (M2 v96): the nine invisible confessions were two different failures wearing one label, so the byte arm splits them, the population re-cites its sentences, and the residual becomes a stated ceiling

- **The defect was in a word, not in a number.** Amendment 95's byte arm returned `12 clauses — supported 2,
  invisible 9, no-command 1`, and every one of those numbers was true. What it could not say is that `invisible`
  was covering two residuals with opposite remedies. One kind is the author's: the clause names a command, the arm
  looks where the clause points and finds nothing, and meanwhile a frame the arm is allowed to read holds that
  literal the whole time — the sentence cited the wrong place, and one edit to a comment grades it. The other kind
  is the arm's: no frame it may consult names the command at all, because every reach carries its verb into a
  wrapper that takes a PARAMETER. Nothing short of changing the code would move that, and a checker that requires
  it is a checker pressuring the population to flatter it (amendment 91's lesson turned against the arm's own
  appetite). A report that cannot tell these apart invites widening the scanner until it flatters, which is exactly
  what `confession-proof.mjs` §5 has an assertion on record to refuse.
- **The split is two arrays per clause, and the four states do not move.** `gradeConfession` now also returns
  `fixable` — the missing verbs some readable frame DOES name, where "readable" means at code position in any
  definition of the runner or in the row's own bytes, the only two sources the arm may consult — and `dead` for the
  rest. `supported / partial / invisible / no-command` keep amendment 95's meanings so its record stays comparable;
  the runner prints `MIS-CITED n` beside them, and `confession-proof.mjs` §5 asserts that list is empty. That gate
  has to be able to redden or it is decoration, so §3 grades the repair pair live in the same run:
  `git archive HEAD via sw.runSweep` is invisible-and-mis-cited (the verb is readable in `isolatedCheckout`, the
  clause just did not point there), while `git archive HEAD via sw.isolatedCheckout` is supported with nothing
  missing. Beside it a five-case partition table differs only in which verb and which frame each clause names,
  including the one clause that holds both residuals at once (`cat-file` citable, `ls-tree` dead, through a frame
  that shows neither).
- **The prediction was written down before the edit, and the arithmetic that surprised me is the honest part.**
  Measured against the committed bytes first (`%TEMP%\nexus-v96\predict-v96.out`): the OLD payloads give
  `12 clauses · supported 2 · invisible 9 · no-command 1 · fixable 2 · dead 9`. Both fixables were the same claim,
  written in two rows — `git ls-tree + git cat-file --batch via sw.proofCorpus`. `proofCorpus` really does both
  reads; what the arm cannot see is that its `cat-file` literal lives one frame down, in `catFileBatch`. So the
  re-citation
  was predicted to give `14 clauses · supported 4 · invisible 9 · no-command 1 · fixable 0 · dead 9`, and the run at
  `ffb203f` reported exactly that, with the dead verbs `["diff","ls-tree","rev-parse","show","status"]`. Note the
  middle number: invisible stays 9 while the total grows by 2, because each split trades one two-verb invisible
  clause for one one-verb invisible clause. That is not a coincidence to be optimised away; it is the two residuals
  separating.
- **What the ceiling is made of, named by the file and the line.** `ls-tree` is the runner's own blindness:
  `trackedProofs` writes `git(['ls-tree', '-r', '--name-only', ref, …], cwd)`, a command literal sitting in the
  source, and the callee is the private wrapper `async function git(argv, cwd)` (sweep.mjs:146), whose own body
  hands a parameter to `run('git', argv)`. `rev-parse`, `show`, `status` and `diff` are the same shape one level
  down: `table-recount-proof.mjs` has exactly one reach at code position and it names no verb, which is why its
  five true claims are unreadable. Over the whole runner only four definitions are readable and they hold two
  verbs — `archive` in `isolatedCheckout`, `cat-file` in `catFileBatch`/`catFileBatchOptional`/`committedBlob`. A
  depth-1 call graph would grade the rest and amendment 93 refused one on the record; the refusal still stands, so
  what this increment ships instead is the number of what remains refused.
- **Retiring my own stale quotation, and the census it paid for.** §4 used to carry a hard-coded copy of closure's
  declaration. The moment the real declaration changed, that copy would have been grading a sentence no commit
  owns — amendment 89's shape, reproduced in the file whose job is to catch it. §4 now reads closure's payload out
  of HEAD and asserts its command set is the four expected verbs, so a silent narrowing of a declaration reddens
  the proof instead of quietly shrinking a claim. The move cost exactly one population reach and the +5 the census
  reported is fully attributed (`%TEMP%\nexus-v96\per-line-argv.out`): six of the new case-table lines each carry
  one command-string array (158, 159, 160, 161, 172, 173), the `no-command` case adds nothing because its array
  does not open with `git`, and the retired quotation subtracts one. `argv 138 → 143`, `program 116` unmoved.
  Amendment 95 pinned "a DATA array of command strings is a reach" as a stated over-prediction; here it fired on
  its own successor and the numbers still add up, which is the sign that a stated boundary is being used rather
  than admired.
- **Siblings re-run at the same ref, and the invariant that a re-citation buys nothing.** `plane-axis-proof.mjs`
  exit 0, 17/17 grammar cases, predicted askers still 51, naive word count still 57 — only the call-site census
  moved, and only by the +5 above. `asks-axis-proof.mjs` exit 0: 73 scored rows, 4 declaring, 1 corroborated by the
  scanner, 3 visible only to the row itself — unmoved, which is the point: a better sentence about a reach changes
  what the arm can read, not whether the row runs or why it breaks. `table-recount-proof.mjs` exit 0 with the
  graded-tree digest `5606ad68f4844562` UNMOVED, correctly, because this commit changes no graded file.
  `sweep.mjs` grew 95 472 → 97 207 B and §0 re-asserts disk == HEAD for it.
- **Next.** The cause arm and the byte arm still read no word of this document: an amendment's own figures remain
  re-runnable only from a log, never from the prose (`docs/decisions` has zero scored rows naming it), so the
  record-vs-re-run row from amendment 95 is still the deeper open item. In this lane the smaller next step is
  `table-recount-proof.mjs`'s own five claims: they are dead only because its single reach names no verb, and a row
  that spawns git through a local helper could cite the frame where its literal really is — the same edit this
  amendment made twice, on a row that has not asked for it yet. #142 and #117 are unchanged in the queue.

### Amendment 97 (M2 v97): the byte arm's walk knew comments and strings but not the third way a character can hide, so one quote inside a regex-literal inverted a file in BOTH directions — it HID a real `rev-parse` and INVENTED an argv

- **The defect, in one sentence.** `gitReaches` and `relativeSpecs` share a hand-written walk that knows three things: `'`/`"`/backtick strings, `//` and block comments, and code. A regular-expression LITERAL is none of those, so its closing `/` read as a division and everything between the two slashes read as `code` — which inverts every pairing that follows it in the file: quotes that were strings become code (their `'git'` literals count), and code that was real falls inside a fake "string" (it stops counting). One row lost a reach and one gained one from the same missing arm, in the same run, with opposite signs.
- **The two rows, named by line.** `intent-proof.mjs:227` holds `/^git's last line$/` — an apostrophe *inside* a regex, which is the worst case, because the walk starts a string that no later quote closes until the next apostrophe many lines away; the file's own tail `execFileSync('git', ['rev-parse', 'HEAD'], …)` was uncounted at every ref before this one. `spawnlog-proof.mjs:187` is the mirror image: an `assert.match(line.reason, /…/)` whose pattern is the JSON-quoted argv of a refusal, escaped brackets and all — nothing there spawns anything, yet the walk saw a `git`-shaped string in array position and reported a reach.
- **What shipped.** Three small functions above both walks, shared by them: `regexPosition(code)` decides whether a `/` can begin a regex by asking whether the code before it can END an expression (identifier char, `)`, `]` divide; `}` and everything else expect a regex; the fifteen keywords that may precede one are the identifier exception), `regexLiteralEnd(text, i)` scans for the closing `/` honouring character classes and escapes and REFUSES to cross a newline, and `regexSkip` joins them. Two guards keep the heuristic from eating real code: `//` and `/*` are a comment first and never an "empty regex", and after a skipped regex the walks append the sentinel `VALUE_END` to `code`, because an expression that just ended is exactly what cannot be followed by a regex — `a = b / c / d` divides twice rather than matching ` / c / ` as a pattern.
- **Why a heuristic and not a parser.** acorn was run as a cross-check on the whole population and agrees with the fixed walk; it cannot ship. `git archive HEAD` carries no `node_modules`, so a proof that imports acorn cannot run on the clean-checkout plane — which is the only plane where these census numbers mean anything. A measurement tool built by copying a grammar inherits that grammar's blind spots, so the cross-check that mattered was not acorn either: it was the pre-v97 walk, sliced out of `5551327`'s own bytes and re-run beside the fixed one.
- **Prediction before the edit, and the whole move attributed.** Against the committed bytes first: 78 files, 13 rows whose numbers could move, 264 reaches, 41 relative specs over 38 files, 4 declarations. After: 264 reaches unmoved in total, with the internal split `program 116 → 117`, `argv 143 → 142` — a hidden reach recovered and an invented one withdrawn, and THREE rows moved, no more: `intent-proof` +1 (recovered), `spawnlog-proof` −1 (withdrawn), `confession-proof` +1 (its own new witness line carries a `['git', 'status', …]` data array).
- **The witness is graded both ways, against the grammar it is meant to catch.** `confession-proof.mjs` §7 pins the two live rows by CONTENT (a case that says "the reach exists" could pass on any other line in the file), then replays the four shapes a regex arm must not confuse — a division on both sides of the slash, a character class holding an unmatched `(`, the comment channel, a declaration inside a string. Its last case is the one that makes the section worth writing: the arm-less grammar is sliced out of `5551327`'s bytes, imported from a temp dir, and shown to BOTH hide the `intent-proof` reach and invent the `spawnlog` one. A witness that only ever runs the new code proves the new code agrees with itself.
- **Population at the code ref `194bc99`: the census moved and no verdict did.** 73 rows · 42 failed · 0 killed · 146 s, `program=117 argv=143` across 51 predicted askers, naive word-rule 57, 4 declaring rows (1 corroborated / 3 invisible), 14 graded clauses · supported 4 · partial 0 · invisible 9 · MIS-CITED 0 · the same five dead verbs, and both gates at zero (`RED with neither prediction nor declaration 0`, `OMISSIONS + SILENT BLIND SPOTS 0`). That is what a grammar fix should look like: a reach census that changes by exactly the two lines the diff says it must, inside a verdict table that does not move. Had a verdict moved, the finding would have been that the wrong count was load-bearing somewhere it should not be.
- **Amendment 96's lesson about data arrays fired on its own successor, again, and is recorded rather than removed.** My witness fixture writes `execFileSync('git', ['status', '--porcelain'])` as a CASE, so the fixed walk counts a reach in the proof that grades reaches: `confession-proof` 20 → 21. This is the third amendment running in which a row that quotes a command is over-predicted by the rule under test, and it stays over-predicted on purpose — the alternative is a grammar that flatters the file that checks it.
- **Next: the ceiling is not a naming convention, and the pre-measurement that said it was is now retracted.** #152 was written as "read a verb through a callee literally named `git`", expecting ~26 aliases whose argv array is forwarded. Measured through the fixed grammar over all 73 rows (`%TEMP%\nexus-v97\alias-census-194bc99.out`): 31 rows define a `git`-named helper, 29 forward a `git` program literal, 28 would read verbs from their call sites — and the dominant shape is not an argv parameter but a REST parameter, `const git = (…args) => execFileSync('git', ['-C', dir, …args])`, called as `git('rev-parse', 'HEAD')`. Worse, the name says nothing about WHICH repository is asked: `-C` in the argv and `cwd:` in the options are two different redirects, and 18 of the 29 bodies carry neither, so their target is the process cwd the sweep chose. The invention list a naive alias rule would print is `["add","commit","config","diff","init","log","reset","rev-list","rev-parse","rm","show","status"]` — thirteen verbs, most of them spent on throwaway repos inside `os.tmpdir`. The strict rule that survives this (forwards a program literal, no `-C`/`--git-dir`/`--work-tree`, no `cwd:` option) reads 3 rows and 6 verbs, including `table-recount-proof`'s five of the five claims it declares. That is the number to build the next increment on, and it is smaller than the ambition. #142 and #117 are unchanged in the queue.

### Amendment 97, addendum (doc ref d2579bd): the four siblings at the record ref, and the desync whose census effect is zero

- **Siblings re-run at the doc ref, all exit 0.** `confession-proof` §7 reports its seven cases including `(g) the arm-less grammar at 5551327 hides (a) and invents (b), both reproduced here`; `plane-axis` holds 51 predicted askers / 6 prose-only mentions / 5 named blind-spot rows / 0 rows binding the program name to a variable; `asks-axis` holds 73 scored rows, 4 declaring, 1 corroborated, 3 visible only to the row, 22 grammar cases; `closure` is ALL GREEN. `table-recount` reports 629 tracked cases in 34 files with 4/4 table mutations caught, and its graded-tree digest MOVED `ae25159732bc8982 → 184d29ac41596346` — correctly, for the first time in three cycles, because this commit edits a graded file.
- **The desync no census could see, stated precisely.** The file the v96 probe flagged first is `table-recount-proof.mjs:104`: its markdown-table pattern is written OUT of backticks, so the arm-less walk opened a template literal there and inverted every quote pairing after it, while the fixed walk skips the pattern. Neither grammar sees a second reach in that file — one program reach, no verb, before and after, measured this cycle by replaying the pre-v97 bytes against the shipped ones over that one file. So a three-row, `+1 −1 +1` census movement is complete and correct here, and it would have looked EXACTLY the same if a fourth file had been inverted end to end while every total stayed put. Counts cannot tell those two apart; a per-file replay can, which is why this record cites the replay and not the arithmetic. It matters for #152 concretely: the row whose desync netted zero is the row whose five claims the strict alias rule predicts will become readable, so its bytes are about to be re-read by a rule its own file once fooled.

### Amendment 98 (M2 v98): the ceiling was reported as a naming convention, and it was a frame the arm never opened — reading a git verb through a same-file alias, and only through an alias that cannot change repositories

Amendment 96 closed with a split: of the nine `invisible` confessions, none was mis-cited, and the rest sat on
five `dead` verbs — `{diff, ls-tree, rev-parse, show, status}` — verbs no readable frame named. The stated reason
was "every reach carries its verb through a wrapper that takes a PARAMETER", and the stated remedy was that only
CODE naming its literal at a call site could lift it. That reason was half true and the remedy was never tried,
because the premise was wrong in a checkable way: **a parameter-taking wrapper is called somewhere with a literal.**
`table-recount-proof.mjs` declares five verbs and its own bytes do name all five — at the calls
`git('rev-parse', '--show-toplevel')`, `git('show', 'HEAD:docs/…')`, and so on. The arm could not see them because
it only ever looked at a spawn frame's own argv, and that argv was the parameter.

So the arm now opens one frame: a same-file helper whose body spawns git is an ALIAS, and a call site that passes a
string literal names a verb the arm may read. Everything of substance here is the refusal that surrounds that
sentence, because a helper's NAME says nothing about WHICH repository it asks. A row may prove something about a
throwaway repo and about this one in the same file, and a census that read both as "this row asks the repository"
would be inventing a claim about the real tree from a command aimed at a scratch directory. Three doors, any one of
which makes the alias unreadable:

- a redirect flag anywhere in the helper's body as a quoted string — `-C`, `--git-dir`, `--git-common-dir`,
  `--work-tree`;
- any `cwd` key in the spawn's options object, written either way (`{ cwd }` shorthand or `{ cwd: root }`);
- a parameter arriving in the OPTIONS position, which is how a wrapper lets its CALLER choose the directory.

Two unsound rules were rejected by measurement before this one shipped, and they are worth recording because each
failed in the direction that would have flattered the arm. The first read every same-file alias: it read the
runner's own `git(argv, cwd)` and thereby recovered verbs for rows that ask the repository only via a checkout the
runner chose — and it did so because shorthand `{ cwd }` does not contain the text `cwd:`, which is the only shape
the naive check looked for. The second required a `cwd:` key and matched a literal value: it invented
`init`/`config`/`add`/`commit` for rows whose `{ cwd: root }` points at a scratch repo they created themselves.
The shipped rule is the intersection that survives both: an alias is readable only when its parameters all reach
the ARGV (never the options) and its body contains no location at all.

What the population looks like under it, with no row edited to flatter the checker: **2 of the 73 rows** carry a
readable alias — `table-recount-proof.mjs`'s rest-parameter `git` and `bridge-report-proof.mjs`'s `gitText`, both
with no location anywhere in their bytes. `table-recount`'s five clauses went from `invisible` to `supported`, and
§8 of `confession-proof.mjs` pins that they are supported by the alias arm ALONE, since that row names zero verbs at
a direct spawn frame. The census moved `supported 4 → 9 · invisible 9 → 4`, `MIS-CITED` stayed `0`, and the ceiling
fell from five verbs to three: `{ls-tree, rev-parse, show}`.


The three verbs that remain are the finding this increment did not expect. `gitAliases` filters candidates in
order, and the runner's own wrapper — `const git = (argv, cwd) => execFileSync('git', argv, { cwd, … })` — is
dropped by the third door, "a parameter in the options position", which returns silently; only the `cwd`-key door
pushes onto a `refused` list. So the arm can enumerate the aliases it looked at and declined, and cannot enumerate
the helpers it never classified as aliases at all. That is a ceiling with two faces, and the census has been
showing one of them. Measured over the population with the shipped code: 2 rows readable, **8 rows recorded as
refused** — `asks-axis`, `confession`, `door-kill`, `isolated`, `pipes`, `plane-axis`, `provenance`, `streams`, each
with `why: 'cwd'` — and every other git wrapper in the tree dropped before either verdict, including the runner's.
§8 states it rather than fixing it, because recording it would need a fourth return channel on
a function whose whole job is a set of verbs — and because the distinction matters for what the number means:
`ls-tree`/`rev-parse`/`show` are unreachable from `closure-proof` and `cwd-axis-proof` not by an accident of where
a literal sits but because the frames that hold them belong to a wrapper that takes its directory from its caller,
which is exactly the case the doors exist to refuse. Lifting it would mean editing the RUNNER to name its literals
at call sites, and amendment 91 settled that a checker may not pressure the population — including its own runner —
into shaping itself for the checker's convenience. So `dead` is reported, `MIS-CITED` is gated at zero, and the
gap between them is the arm's honest limit on this corpus.

Method notes carried forward, each of them a repeat of an older lesson rather than a new one: the rule was
pre-measured over all 73 rows before any witness was written (the naive variants above came out of that pass, not
out of a guess), the §8 cases are STRING literals so the reach census of the population is untouched by them and the
differential replay still owns that claim, and every must-count case in §8 has a must-not-count twin — plus three
mutation cases in which the redirect is deleted from the fixture and the clause is required to become
`supported`, because a refusal no edit can reverse is not a rule but a preference. One fixture in the twin set
refuses to open even after its `cwd` is deleted, and that is asserted too: dropping the option from
`(argv, cwd) => execFileSync('git', argv, { encoding })` leaves a parameter used nowhere, so the helper stops being
an alias by the rule's own definition. The mutation that does NOT bite is as much a measurement as the ones that do.

The reach census was replayed before it was trusted: the two grammars — `194bc99`'s and this one — run over all 75
`.mjs` in the directory give 265 hits against 265, 432 definitions against 432, and no row whose hit-key multiset
differs. That is what a purely additive arm should look like, and it is why the sweep's own `program`/`argv` totals
were predicted before the run rather than hoped after it. The prediction was `program 117 → 122, argv 142 unchanged`
— and the addendum below records that it was wrong in both halves, so the paragraph above is kept as the claim that
was tested and not rewritten into the number that came back.

Addendum to amendment 98 (same increment, written after the witness swept): the prediction about the census was
refuted, and the refutation is the part worth keeping. Before the run I wrote down what the new ref's plane axis
would print: `program 117 → 122, argv 142 unchanged`. The actual line at `6bdb3cf` is

  [identity] plane axis: 51/73 tracked proofs reach a git child process AT CODE POSITION (261 call sites:
  program=117 argv=144)

and the line at the pre-v98 ref `194bc99` was `(260 call sites: program=117 argv=143)`. So `program` moved by
nothing, `argv` moved by one, and both halves of the prediction were wrong for different reasons.

The `+5 program` was arithmetic on the wrong denominator. The axis counts the 73 `*-proof.mjs` rows; my replay
above ran over all 75 `.mjs` in the directory, and `sweep.mjs` itself holds exactly five program reaches
(122 - 117 = 5, and 75 - 73 = 2 rows: the runner and `isolated-arms.mjs`). I read the 122 and predicted a change to
the number the harness does not print. The `argv 142` base was read off a stale line rather than off the log next to
it — the pre-v98 axis printed 143. A prediction that does not name its denominator is not a prediction; it is a
number with a story attached, and the difference between the two showed up as two errors in one line.

What the fixtures actually did: the six §8 cases are STRING literals, so the `'git'` in them is a mention and not a
reach — the rule that `plane-axis-proof.mjs` §1 already pins ("a printed mention is not a reach", and its twin for a
template that only SAYS git). The single `+argv` is `confession-proof.mjs` line 412,

  const DECL = ["git rev-parse HEAD through this row's own git() alias"];

which is a declaration payload, not a spawn, and is counted because an array literal at code position whose first
element OPENS with `git ` borrows the argv rule's `^git\s` test. That shape is not a surprise discovered at the
sweep: `plane-axis-proof.mjs:86` pins it as an OVER-PREDICTION with its expected count written in the table
(`const claims = ['git status --porcelain', 'ls-files'];` → 1), and `:87` pins the twin that must stay at 0. So this
is the fourth row to add reaches to itself by declaring in the grammar's blind spot, and the census statement to
carry is: the §8 witness moved the axis by one argv reach, that reach is a pinned over-prediction rather than a
defect, and the differential replay of the RULE (both grammars over one text, 265 against 265, no row's hit-key
multiset differing) is a different measurement from the movement of the TEXT and cannot be quoted as if it promised
zero.

The mechanism that catches an over-claiming row also fired, which is the only reason this is a closed loop and not a
confession about a confession: the same run's `[plane axis] prediction vs verdicts` line lists
`confession-proof.mjs` among the twelve `GREEN while predicted`, which is where `plane-axis-proof.mjs` says an
over-predicted row that never breaks belongs. The punishment for inventing a reach is that the row can never again
explain a red by claiming one.

One sentence in the runner is now false in exactly the way this amendment's premise was, and it is left in place
because removing it is a code change and a code change owes a sweep: the `[identity] confession axis (bytes)` line
still explains every invisible clause by "every one of those reaches carries its verb through a wrapper that takes a
PARAMETER, so only the CODE could name it". Amendment 98 exists because a parameter-taking wrapper IS named by code
at its call sites, which is how four of the nine became readable. The residual four invisible clauses are now
invisible for the narrower reason this record states — their verbs sit in a wrapper whose DIRECTORY comes from its
caller, which the doors refuse to read — and the next increment should make the axis say that, and be graded on
saying it, rather than leaving a wrong explanation in the only line most readers of a sweep log will read.

### Amendment 99 (M2 v99): the residual had an explanation written from memory, and the memory was amendment 96's — so the ceiling is now classified by WHO HOLDS THE EDIT, the axis sentence interpolates that classification, and the check that enforces it had to learn that a quotation is not an assertion

Amendment 98 shipped a rule and left the runner's own sentence about its residual untouched. That sentence — the tail of
`[identity] confession axis (bytes)` — read: "every one of those reaches carries its verb through a wrapper that takes
a PARAMETER, so only the CODE could name it, and an arm that demanded that would be a checker pressuring the
population to flatter it". It was written in amendment 96 and it was false by amendment 98's own finding, twice over:
a parameter wrapper IS named by code at its call sites (that is the increment), and the comment block above
`gradeConfession` illustrated the "unreadable" case with `gitText()`, which the alias arm now reads perfectly well.
Nothing caught either drift, because the sentence was prose and prose has no witness.

So the residual is now a computation. `aliasCeiling(rows)` takes the rows whose clauses are dead and returns them
bucketed by which face of the ceiling they sit on, where the faces are defined by **who can close them**:

- `declined` — the row owns a helper the arm classified as a git alias and refused out loud, and the bucket carries
  the door that refused it (`git:cwd`). One edit by that row — delete the location from its own helper — lifts the
  clause, which is exactly the mutation §8 of `confession-proof.mjs` performs on a sibling fixture.
- `readable` — the row owns a readable alias and the clause is *still* dead, because that alias reaches some commands
  and not this one. Also closable by the row, at a call site.
- `silent` — neither: the arm has no verdict about any helper in the file, because the frame that spawns the child is
  not the row's own. This is the face no row edit lifts, and it is where this file's own `git(argv, cwd)` lives.

The axis line interpolates the three counts and names the rows in each bucket, so an explanation of a residual can no
longer outlive the grammar that produced it. The first cut of this increment had TWO buckets — declined and "no
verdict on record" — and §9's fixture pair caught the error before it shipped: the second bucket swallowed a row that
owns a working alias, i.e. a row the arm had classified and had merely not helped. A name that broad turns a
measurement into a shrug, so the split became three-way and the witness expectation was rewritten from `invisible` to
the `partial` the arm actually reports. That is the second time in two cycles that a bucket's NAME was the defect.

§9 grades the sentence rather than trusting it, in both directions. Four fixtures walk the faces, and the discriminating
pair is two sources that differ by one `, { cwd: root }`: on a row-owned helper that deletion moves the clause from
`invisible` to `supported` and the row off the declined face; on a borrowed frame the SAME deletion changes nothing at
all — same state, same face — which is the sentence's claim ("who holds the edit") rendered as a mutation the census
cannot fake. Then the anti-stale check reads the committed runner line and requires that the refuted sentence appear
only inside a quoted span: `axisLine.replace(/"[^"\n]*"/g, '')` strips citations, and the assertion fires if the phrase
survives the strip. The first version of that check looked only for the phrase anywhere in the line, and reddened
against the runner's own honest citation of it — amendment 89's lesson that a quotation wears an assertion's shape,
applied this time to prose instead of an import. So the check is paired with a non-vacuity assertion that the citation
IS present, otherwise the strip would silently pass a line that had forgotten the refutation entirely.

[identity] confession axis (bytes): 4 declaring rows · 14 clauses — supported 9 · partial 0 · invisible 4 · name no
command 1 · MIS-CITED 0 — versus unreadable-by-every-frame 4 (ls-tree, rev-parse, show) over 2 row(s), and those rows
sit on THREE faces of one ceiling, which differ in who holds the edit: 0 declined out loud by a door its own helper
named, 0 whose row owns a readable alias that simply does not reach this verb, and 2 on which the arm has no verdict
at all because the spawning frame is not the row's (closure-proof.mjs, cwd-axis-proof.mjs)

So the population says the residual is ALL on the third face: no row in it can lift its own clause, and the sentence
now says that by reading it off `aliasCeiling` rather than by reciting a reason. The plane axis moved
`261 → 262 call sites, program=117 argv 144 → 145`, and the single new reach is `confession-proof.mjs:429`'s
`const CEIL = ["git ls-tree -r --name-only HEAD …"]` — a declaration array whose head string opens with `git `, which
is the fifth instance of the over-prediction `plane-axis-proof.mjs:86` pins with its expected count in the table, and
the row reappears in the run's `GREEN while predicted 12` list, which is where amendment 98 said an over-claimed row
that never breaks belongs. `sweep.mjs`'s own five reaches did not change count; its `archive` program literal moved
from offset 72869 to 74962 purely because the file grew above it. Witness: §9 green, exit 0 in 71.0 s of a 240 s
budget, in a detached full sweep at `48715a0` that scored 73 scripts · 42 failed · 0 killed · 271 s with the graded
build digest `cc73dcf781dd0a2b` stable across the run.

One label in this record is wrong and stays wrong on purpose: the witness commit `48715a0` is titled "M2 v98 witness"
although the increment is v99. Fixing it would mean rewriting a commit that the sweep already names as its ref, and a
record that can be edited to match its evidence is worth less than one that cannot, so the error is noted here instead
— the same reasoning that keeps amendment 98's refuted prediction in the file rather than deleting it.

### Amendment 100 (M2 v100): a census that can only name the helpers it declined out loud was a census of its own blind spots, so every filter in the alias arm now speaks a reason and every definition in a file must be spoken for

Amendment 99 gave the residual three faces, and the third one was still an adjective: `gitAliases` pushed onto a
`refused` list from exactly one of its six filters — the `cwd`-key door — while the redirect-flag door, the
options-position door, the no-parameters door, the parameter-reaches-nowhere door and the no-spawn test all returned
nothing at all. That asymmetry was recorded as a finding in amendment 98 ("2 rows readable, 8 recorded as refused,
everything else dropped in silence, including the runner's own `git(argv, cwd)`") and then left in place. Leaving it
was right for a cycle and wrong forever, because the sentence "the arm has no verdict about this helper" cannot be
graded: it is true whether the arm looked and shrugged or never looked.

`aliasVerdicts(src)` replaces the side channel with three buckets and a reason on every entry — `readable`,
`refused` (`redirect-flag`, `cwd`, `param-in-options`), `notAlias` (`no-git-spawn`, `no-params`,
`param-outside-spawn`) — and `gitAliases` is now the thin projection of that into the list the caller walks. The
claim is arithmetic rather than descriptive: for every file, the entries across all three buckets are exactly the
definitions in the file, by offset. Measured over the 73 scored rows at the witness ref: **354 definitions, 354
verdicts, 0 unspoken** — readable 2, refused 41 (`cwd` 8, `redirect-flag` 21, `param-in-options` 12), notAlias 311
(`no-git-spawn` 263, `param-outside-spawn` 41, `no-params` 7). Read against amendment 98's record, the 8 refusals it
could count were the whole voiced set, and 33 more refusals had been happening silently in the same files — including
the three in the runner that the options-position door drops: `git`, `committedBlob`, `catFileBatchOptional`.

§10 of `confession-proof.mjs` grades that in two moves, and the second is the one that keeps the increment honest.
Eight fixtures, one per reason, each asserting the exact bucket and `why` for a one-definition source. Then the
census invariant over the whole population, and — because a filter with no fixture is a filter the census can hide in
— the set of admissible reasons is DERIVED from the fixtures themselves, so adding a ninth door to `aliasVerdicts`
without writing its case reddens the row rather than quietly widening the silent face. The reason list also lost one
member on the way: `no-argv` turned out to have no reachable shape, because the slice finder keys on the comma after
the program literal and `'git',` with nothing after it is not a call you can write. A reason that cannot be exercised
is not a conservative branch, it is an untested claim about the code, so the two guards were folded together and
`no-argv` is gone.

The finding this increment surfaced but deliberately did NOT fix: `refused` is inflated by definitions whose `git`
lives in a comment or a string. The candidate finder asks a text region for a `'git',` substring, so in this very file
`spawnSlices` and `quotedIn` are refused for `redirect-flag` — not because they redirect anything, but because the
region of one contains the other's documentation example, `execFileSync('git', …)`. That is amendment 97's defect
(walk without a regex/string/comment arm) appearing in the arm that was written AFTER 97 shipped, which is the
strongest argument in this record for why a fix must be graded by a row and not by a reading. It is left as a
measured over-claim rather than fixed here because every one of these cases ends in a REFUSAL: the arm declines to
read a verb, which is the safe direction, and narrowing it would make more aliases readable — widening the channel
the ceiling exists to bound. The next increment should give the candidate finder the same comment/string awareness
the byte walk has, and be graded on the count moving in the direction that claim predicts.

__WITNESS__

The prediction this increment kept, and the process gap around it. Before the sweep ran I expected the plane axis NOT
to move — §10's eight fixtures are STRING literals and none of its assertion arrays opens with `git `, so under the
rule that made amendment 98's witness move by one, nothing here is a reach. The witness ref `fde9159` measured
`[identity] plane axis: 51/73 tracked proofs reach a git child process AT CODE POSITION (262 call sites:
program=117 argv=145)` — identical to its parent ref in all three numbers — and the confession axis still ends at
`supported 9 · partial 0 · invisible 4 · no-command 1 · MIS-CITED 0`, its third face now naming its reasons:
`closure-proof.mjs dropped sh:param-outside-spawn, slashed:param-outside-spawn · 1 definition(s) never spawn git at
all`, `cwd-axis-proof.mjs no candidate beyond the spawn test · 5 definition(s) never spawn git`. The row ran green in
130.7 s of its 240 s budget inside a detached full sweep of 73 scripts · 42 failed · 0 killed · 416 s, graded build
`cc73dcf781dd0a2b` stable across the run, tree `61265f575e9c6e92` stable, dirty-sources 2 (neither of them mine).
Recording that honestly means naming the gap too: the prediction lived in the session's messages, not in a file the
ref could be compared against, which is how two earlier predictions in this stack were able to be wrong in ways that
were only discoverable afterwards. So the method change carried forward is that the next rule commit states its
expected numbers in its own commit message, BEFORE the sweep it owes.

Amendment 101's content came out of this census rather than out of a plan: `refused` counts definitions whose only
`git` is a mention. In this file `spawnSlices` and `quotedIn` are refused for `redirect-flag`, not because either
redirects anything but because the text region of one contains the other's documentation example
`execFileSync('git', …)`. The candidate finder greps a raw slice between definition offsets and so has no comment or
string arm — amendment 97's defect, rediscovered in a channel written after 97 shipped, which is the strongest
argument in this record for why a fix must be graded by a row rather than by a reading. It is left unfixed here
because every such case ends in a REFUSAL, the safe direction, and narrowing it would make more aliases readable —
widening the channel the ceiling exists to bound.

### Amendment 101 (M2 v101): the alias arm refused helpers whose only `git` was a sentence about a helper, so the candidate finder now asks the plane grammar the same question — and the first prediction written into a commit message came back one definition wrong in its own base

Amendment 100 ended with a measured over-claim it deliberately did not repair: `refused` counted candidates whose
region merely MENTIONS `'git',`. The candidate finder sliced text between definition offsets and grepped it, so in the
runner's own file `spawnSlices` and `quotedIn` were refused for `redirect-flag` — neither of them redirects anything,
and the `'git',` that made them candidates is documentation inside the region of the function above. Leaving that
unrepaired was right for a cycle (a false refusal errs toward reading less) and wrong to keep, because it made the
census's own numbers unexplainable: nobody could say what the 21 `redirect-flag` refusals had in common.

The fix is one line and it does not invent a second grammar: before any door is consulted, the arm asks whether the
definition's own region reaches a git child AT CODE POSITION — `gitReaches(body).length === 0` — which is the same
question the plane axis answers, using the same walk, so the two channels cannot desync (amendment 89's lesson about
two grammars of the same fact, applied before a second one was written). A candidate that fails it is not refused, it
never was a candidate: it lands in `notAlias` under `no-code-position-git-spawn`. The name took a second pass: the
first label was `mention-only`, and §9's own fixture pair disproved it — a helper whose bridge is not in
`SPAWN_FAMILY` (`sw.runSweep('git', args, { cwd })`) also answers "no", for a different reason: the program arrives
through a call the plane grammar does not treat as a spawn. Two mechanisms, one visible fact, so the reason says what
the arm can see rather than guessing which of the two it hit. §9's OWNER and PARTIAL fixtures were moved onto
`run('git', …)`, a bridge the plane grammar does recognize, because a face pair about a REFUSED helper cannot be built
out of a helper that is no longer a candidate.

The census over the 73 scored rows, printed by the shipped row: spoken 355/355, readable 2, refused **41 → 40**
(`redirect-flag` 21 → 20, `cwd` 8 and `param-in-options` 12 unchanged), `notAlias` 313 = `no-git-spawn` 263 +
`no-code-position-git-spawn` 7 + `param-outside-spawn` 38 + `no-params` 5. The scratch pre-measurement over ALL 75
`.mjs` (the runner and `isolated-arms.mjs` included) said refused 48 → 44 with 11 candidates demoted — a different
denominator, named here as such because amendment 98 was refuted for exactly this confusion. §10's ten reason fixtures each carry their own case,
and the pair that makes this increment a measurement rather than a preference is the two sources that differ only by a
comment wrapper — same name, same parameter, same argv slice, `readable` in one and `no-code-position-git-spawn` in
the other.

Where the prediction failed, and what that is worth. This is the first rule commit in the stack whose message states
the expected numbers before the sweep it owes, as amendment 100's record said it should. Three of its claims held
(`readable` stayed 2, the axis buckets kept their shape, the reason list closed), and one did not: the message said
`spoken 354/354` and `redirect-flag 21 → 19`; the row printed `spoken 355/355` and `redirect-flag 20`. The off-by-one
is the same quantity in both places, and it is in the BASE, not the rule: a pre-measurement script and the shipped row
counting the same HEAD tree disagree by exactly one definition, and three probes (comment shapes, string and template
shapes, both runner revisions over one text set) each came back "no phantom, both revisions say 355", so the
disagreement is real and unexplained, and the obvious hypothesis is already dead: the row reads its population out of
`git show HEAD:…` on the GIT plane (`confession-proof.mjs:43`), so a half-edited worktree cannot be the variable — the
two runs had the same 73 texts and the same `definitions()`, and still printed numbers one apart. Three probes came
back negative (comments, strings and templates, both runner revisions over one fixed text set, each returning 355), so
what is left is a gap to be chased rather than a story to be told, and #157 owns it with the exact reproduction: two
standalone runs of the same row version, at `012f1f3` and at `b96555e`, printing 354 and 355. The point this record
keeps is the method lesson: a census that will be used as a prediction anchor has to be reproducible INSIDE the row —
print the ref the texts came from, and assert a second census built from `git show` equals the in-row one. Until then
the anchor is the row's own figure, refused 40 of 355, and the prediction that missed it by one stays visible in the
commit message rather than being rewritten.

The evidence chain, at the witness ref `3c097ea`: a detached full sweep of 73 scripts · 42 failed · 0 killed · 346 s, graded build `cc73dcf781dd0a2b` and tree `61265f575e9c6e92` stable across the run, `dirty-sources 2` (the concurrent session’s two tracked sources, neither of them mine). `confession-proof.mjs` passed inside it in 113.4 s of its 240 s budget. The plane axis printed 262 call sites: program=117 argv=145 — the numbers the rule commit predicted before the run, which makes this the second prediction kept in this stack and the first whose base was taken from the row rather than from a scratch script. The confession axis reads supported 9 · partial 0 · invisible 4 · name no command 1, and its ceiling sentence now names the third face by reason: 0 declined, 0 readable-but-missing-the-verb, 2 on the face no row edit closes, with closure-proof’s helpers printed as `sh:no-code-position-git-spawn, slashed:no-code-position-git-spawn`. A row that once read “a wrapper that takes a PARAMETER” now reads which filter stopped which helper. §10’s own line from the same commit: [§10] verdict channel: 10/10 reasons each carry their own fixture · population of 73 rows speaks 355/355 definitions — readable 2, refused {"cwd":8,"redirect-flag":20,"param-in-options":12}, not-an-alias {"no-git-spawn":263,"no-code-position-git-spawn":7,"param-outside-spawn":38,"no-params":5} — so the ceiling's third face is now a list of reasons, not an adjective

### Amendment 101, addendum (written the same cycle, after the record): the one-definition gap is explained, and it was my base that was stale

The paragraph above says the gap between `spoken 354/354` (v100's row) and `spoken 355/355` (v101's row) was unexplained
after three probes. It is explained, and the explanation indicts the prediction rather than the census: counting each
of the 73 scored proofs at ref `012f1f3` and at `3c097ea` with the same shipped `definitions()` gives **354 → 355**, and
the single file that moved is `confession-proof.mjs` itself, 12 → 13. The thirteenth definition has a name and it is
`ONE` — the helper §10 grew today so its ten fixtures could be graded through one function. The row whose census I
quoted as an anchor is a member of the population it censuses, and the increment that added a reason table helper
grew the definition count by one — which is the ordinary behavior of a census over a corpus that includes the census.
So every number the rule MOVED was predicted correctly and the BASE was read off a stale ref.

That makes the lesson sharper than "re-measure before predicting": a proof that counts definitions across
`docs/evidence/agents/*.mjs` shifts its own denominator whenever it is edited, so its previous run's total is not a
baseline but a datum about a different tree. The honest form is the one §10 already uses for its INVARIANT (verdicts
=== definitions, per file, this run) and does not use for its CEILING: totals quoted across runs need the ref attached.
Task #157 shrinks accordingly, from "explain the phantom" to "print the ref the census texts came from beside the
totals, and assert that a second census built from `git show <ref>:…` equals the in-row one", which turns a stale-base
prediction like this one into a red row instead of a wrong ADR sentence.

### Amendment 102 (M2 v102): a total that counts a population containing the counter cannot be quoted across runs, so the census now names its ref and proves it sees itself

Amendment 101's addendum closed a one-definition discrepancy by noticing something the whole stack had taken for
granted: `confession-proof.mjs` censuses `docs/evidence/agents/*.mjs`, and that set contains the file printing the
number. Every edit to the row moves its own census — 354 became 355 the moment §10 grew a helper — which makes the
previous run's total a measurement of a different tree, not a baseline. The stale base was harmless as arithmetic and
harmful as method: it went into a rule commit's prediction and came out as a wrong sentence in a record.

§10 now refuses that shape in three ways. The printed line carries the ref the texts were counted at
(`spoken 355/355 definitions counted at <sha>`), because a number without a ref is only comparable to itself. The same
total is re-derived through `git show <ref>:<path>` for every row and asserted equal to the loaded population's, so a
census that quietly read a different plane — the worktree, a materialised tree, half an edit — contradicts itself
instead of printing. And the self-inclusion is graded rather than narrated: a sentinel function appended to this row's
own text must move the count by exactly one (`356`), which is the smallest possible witness that the counter is inside
what it counts. Nothing here changes what the arm reads: no runner rule moved, and the axes were predicted to hold at
`262 call sites / program=117 / argv=145` and `supported 9 · partial 0 · invisible 4 · no-command 1 · MIS-CITED 0`.

And the increment's own defect, caught by the thing it was written to satisfy: the first version of the anchor called
`git rev-parse HEAD` unconditionally. The sweep at that ref reported 43 failures instead of 42 — the extra one was this
row, dying in the isolated checkout, where the row's own population loader takes the DISK branch precisely because
that tree has no index (`confession-proof.mjs:38-45`). An assertion about which ref a census was counted at is
meaningless on a plane with no ref, and writing it without asking which plane the row runs on turned a corroboration
into a crash. The fix is small and the discipline is not: `rev` is `'DISK'` when there is no index, the recount then
compares the loaded texts against the same disk read — which the printed line now labels `UNCHECKED rather than
corroborated`, because amendment 86 already settled that a tautology may not be reported as a pass. That the sweep
caught it is the argument for running it: five siblings on the GIT plane, and my own standalone run, were both green on
the buggy version, because both had an index.

The confirmation run, at `da1c309` and the ref that fixes its plane bug: `scripts 73 · failed 42 · killed 0 · 314 s`, graded build `cc73dcf781dd0a2b` and tree `61265f575e9c6e92` stable across the run, `dirty-sources 2`. The plane axis printed 262 call sites: program=117 argv=145 and the confession axis supported 9 · partial 0 · invisible 4 · name no command 1, exactly the numbers the rule commit predicted, and `confession-proof.mjs` itself finished OK in 91.6 s with its census anchored in its own output: "10/10 reasons each carry their own fixture · population of 73 rows speaks 355/355 definitions counted at DISK (recount basis: the same disk read — this plane has no index, so that half is UNCHECKED rather than corroborated; got 355; a sentinel added to this row alone moves it"

The general form, for the next time a row reaches for a number from last run: a self-referential census has exactly
two honest uses — as an invariant within a run (verdicts === definitions, which §10 already graded) and as a ref-anchored
datum (which is what this adds). Quoting it as a baseline is the one use it does not have.

### Amendment 103 (M2 v103): a verdict cannot say which tree it was reached in, so the sweep now reports the plane each row says it stood on — and names the rows that never say

Amendment 102 left a lesson in its own record: a row gained an unconditional `git rev-parse HEAD`, and the sweep at
that ref reported 43 failures where every ref before it had reported 42. The extra one was the new code, and it died
only in the tree the sweep builds — the isolated checkout has no index, which is why the row's own loader falls back to
a disk walk there and reads `HEAD` wherever an index exists. Nothing about the failure distinguishes the two trees
afterwards: exit 1 looks the same on both, and the 41 rows that reach for the repository go red on the isolated plane
for a reason that is entirely correct. So the runner's per-row reporting carried verdicts and reasons while the property
that decided the outcome — which plane the row stood on — was knowable only by reading that row's own first line.

The runner now reads it. Each row record keeps `head: headOf(stdout, 4)` beside its tail and error window, and
`planeCensus(rows)` splits the run into rows that disclosed `plane GIT`, rows that disclosed `plane NO-GIT`, and rows
that said nothing, printing all three counts and naming the silent ones. The reconciliation the line exists to make is
explicit: a row claiming the GIT plane inside a tree the runner knows has no index is printed as a contradiction,
because that is the shape of "the finding is about a repository I brought with me" — the failure mode amendments 80
and 83 were written about, arriving from the opposite direction.

§8 of `provenance-proof.mjs` grades the reader, and its fourth case is a limitation stated rather than hidden: the
reader scans the first lines for a token and cannot distinguish a banner from prose that happens to write "plane GIT",
so that fixture is pinned as an OVER-disclosure with its behavior asserted. The alternative was to narrow the pattern
until no prose matches, which would trade a named over-claim for a silent channel that only fires when a row is
formatted exactly as its author expected. §8 also requires the three buckets to sum to the rows handed in and the
silent ones to be named — a remainder is how a self-report channel goes empty without anyone noticing — and anchors
the whole section to the live banner `confession-proof.mjs` prints, so the fixtures are not the only thing being read.

Measured at `876203a`: 73 scripts · 42 failed · 0 killed · 284 s, graded build `cc73dcf781dd0a2b` stable, `dirty-sources 2`. The predictions held: plane axis 262 call sites: program=117 argv=145, confession axis supported 9 · partial 0 · invisible 4 · MIS-CITED 0. The new line itself read: "which plane each row says it stood on (read out of the row's own first stdout lines, not inferred from its verdict): GIT 0 · NO-GIT 4 · mute about its own plane 69 (69 rows, e.g. agent-proof.mjs, bridge-report-proof.mjs, budgets-proof.mjs, changes-proof.mjs, closure-proof.mjs, code-index-proof.mjs, color-proof.mjs, commit-echo-proof.mjs …) · the tree the rows ran in has NO .git"

### Amendment 103, addendum: the channel is thin, and the row that grades it cannot run where the thinness shows

Of 73 rows, 4 disclose a plane and 69 are mute — that is the honest ceiling for a reader of prose the population was
never required to write, and the count is printed beside the names precisely so that "nobody says" cannot be read as
"everybody is fine". One more thing the numbers make visible: `provenance-proof.mjs`, the row that grades this
reader, sits inside the 42 that cannot run on the isolated plane at all, because it dies at its own first
`git rev-parse HEAD` — the very property the reader exists to report. So §8 holds on the home plane only, and that
limitation belongs to the increment rather than being smoothed over: the reader is graded where an index exists,
exactly as amendment 102 had to be learned where one does not. What the live line makes obvious for the next unit:
either the runner requires the banner, which turns the disclosure count into a gate, or the disclosure stays a
courtesy and 69 of 73 rows keep reporting findings about a tree nobody can name from their output.

### Amendment 104 (M2 v104): 69 rows could not name their own tree, so the runner stopped asking and started supplying it — and the reconciliation between supply and self-report became a gateable pair

Amendment 103 built a reader for a sentence most rows never write. Its own live line was the diagnosis: of 73 rows,
4 disclosed a plane and 69 were mute, which means the sweep could report a distribution over a channel that the
population had never been asked to fill. The two ways out were both in the record — make the banner a requirement, or
supply the fact — and the first was rejected on the stack's own rule: amendment 91 settled that a checker may not
pressure the population into shaping itself for the checker's convenience, and here the checker is the runner, asking
69 files to write a paragraph so its log can be tidier.

So the runner answers the question itself. `suppliedPlane(cwd)` asks the one thing that actually decides whether a
row's `git show HEAD:…` can work — does the directory the child is spawned into have an index — and `runProof` hands
the answer to every row through `NEXUS_PROOF_TREE`. `planeCensus(rows, supplied)` then does what a reader alone could
not: it grades each row's own banner against the supplied fact, producing an agreement list and a contradiction list,
so the four rows that do speak became corroboration rather than decoration, and the 69 that do not are covered by an
answer they can read instead of a question they never answered. The contradiction case is the finding the whole thread
has been circling — a row saying `plane GIT` while being spawned somewhere with no index is a row whose conclusions
belong to a repository it brought with it, which is amendment 80's and 83's failure mode arriving from the direction of
the rows rather than the build.

§9 of `provenance-proof.mjs` grades the supply on three directory shapes — a bare directory (NO-GIT), an index
directory (GIT), and a linked worktree whose `.git` is a FILE rather than a folder (GIT), the last being the shape a
probe that only checked directories would have called git-less and sent every worktree down the wrong branch. The
reconciliation is then tested as a pair that must FLIP: against a supplied NO-GIT one row agrees and one
contradicts, and against a supplied GIT it is the other row that contradicts, because a comparison that reads the same
from both directions is a value being compared with itself. With nothing supplied, no row may score as agreeing — a
free pass would be exactly how an empty channel looks healthy. And because amendment 78 exists for the case of a
runner function that nothing calls, §9 asserts out of the committed bytes that the marker is wired into the row spawn
itself.

Measured at `2040cda`: 73 scripts · 42 failed · 0 killed · 146 s, graded build `cc73dcf781dd0a2b` stable, `dirty-sources 2`. Every prediction held, including the one about the channel staying thin — no row reads the marker yet: plane axis 262 call sites: program=117 argv=145, confession axis supported 9 · partial 0 · invisible 4 · MIS-CITED 0, and the new line read "which plane each row says it stood on (read out of the row's own first stdout lines, not inferred from its verdict): GIT 0 · NO-GIT 4 · mute about its own plane 69 (69 rows, e.g. agent-proof.mjs, bridge-report-proof.mjs, budgets-proof.mjs, changes-proof.mjs, closure-proof.mjs, code-index-proof.mjs, color-proof.mjs, commit-echo-proof.mjs …) · the tree the rows ran in has NO .git · the runner SUPPLIED NO-GIT to every child through NEXUS_PROOF_TREE, from the directory it spawned them in (4 banner(s) agree with that, 0". The two rows that own this increment: provenance-proof: line not found · confession-proof: line not found.

### Amendment 105 (M2 v105): the runner hands a row a fact it never asked for, so the row now repeats it back and the two words are compared

Amendment 104 gave every child `NEXUS_PROOF_TREE`, and the sweep said so confidently — `the runner SUPPLIED NO-GIT to
every child`. Nothing in that sentence depends on the child reading it. The supply could be landing in an environment
no row looks at, and the log would read the same, which is the shape this stack has kept getting told about: an action
reported as if it were an effect. So the channel is now two-ended: `confession-proof.mjs` prints
`supplied ${process.env.NEXUS_PROOF_TREE || 'ABSENT'}` in its first line beside the plane it detected for itself,
`planeCensus` parses that echo into `echo` / `echoAgree` / `echoLost` / `echoContradict`, and the runner prints a second
comparison line.

Three readings matter and they are deliberately separated. An echo matching the supply is confirmation. A row printing
`ABSENT` is a failed hand-off — and it must never be booked as agreement with a fact it says it never received, which
is the same rule amendment 86 wrote about silence not being a pass. An echo with NO supply on this plane counts as a
contradiction rather than a free pass, so the comparison cannot be satisfied by one side alone. And the two channels
stay distinct: mentioning a plane is disclosure, repeating the marker is echo, and a census that merged them would
report a row that never read the environment as one that confirmed it.

§10 of `provenance-proof.mjs` holds the fixtures for all three readings and asserts BOTH ends of the wire out of the
committed bytes — the row must still echo, and the runner must still hand over. Those two assertions are the reason
this is an increment rather than a log line: either half can be deleted by a future edit without changing any verdict,
and the comparison would then be two functions each believing its own output.

Measured at `ad8502b`: 73 scripts · 42 failed · 0 killed · 266 s, graded build `cc73dcf781dd0a2b` stable, `dirty-sources 2`. The supply line read: "which plane each row says it stood on (read out of the row's own first stdout lines, not inferred from its verdict): GIT 0 · NO-GIT 4 · mute about its own plane 69 (69 rows, e.g. agent-proof.mjs, bridge-report-proof.mjs, budgets-proof.mjs, changes-proof.mjs, closure-proof.mjs, code-index-proof.mjs, color-proof.mjs, commit-echo-proof.mjs …) · the tree the rows ran in has NO .git · the runner SUPPLIED NO-GIT to every child throu" and the new comparison read: "the marker came back: 1 row(s) echoed NEXUS_PROOF_TREE into their own first lines — 1 match what this run supplied (confession-proof.mjs echoes NO-GIT against a supplied NO-GIT), 0 printed ABSENT so the hand-off itself failed (none), 0 contradict it (none) · a supply nobody echoes is decoration, and an echo nobody compares is a guess: this line is the comparison". Predictions: provenance-proof: FAIL in 6.8 s · confession-proof: OK in 63.8 s, plane axis 262 call sites: program=117 argv=145, confession axis supported 9 · partial 0 · invisible 4 · MIS-CITED 0.

### Amendment 106 (M2 v106, docs/evidence) — the tree-plane reader gets a witness on the live filesystem, 2026-09

- **Recorded late (§60):** this increment was committed as `efc7d8f` with no amendment, and is written
  here from that commit rather than left as an undocumented step. Its whole content is
  `provenance-proof.mjs` §11, a witness for the reader that decides whether a proof stood on a tree
  that has a `.git` (amendment 103's plane axis).
- **What §11 measures, on the live filesystem rather than on a fixture:** this repository's own
  `docs/evidence` directory diverges — the PROBE says `NO-GIT` while `git` says `GIT`, and the marker
  the row reports follows GIT, which is the point (the reader asks git, it does not infer from the
  directory's shape). Root and a bare temp directory agree, so the divergence is a property of the
  nested case, not of the probe being generally wrong.
- **The answer space is pinned, not assumed:** exit 128 together with git's own fatal message are the
  ONLY answers allowed to mean "no repository". An unusable `git` decides by probe **with the reason
  printed**, and an unparsable answer is NAMED rather than defaulted — the same rule amendment 96
  applied to the alias arm, one reader over.
- It also asserts the committed runner hands out the reconciled value, so the witness grades the
  shipped path and not a re-implementation of it.

### Amendment 107 (M2 v107, docs/evidence) — the runner reports whether the host fault the bridge was built on is still present, and the prediction in its commit message was WRONG, 2026-09

- **Recorded late (§60), and corrected.** Committed as `e4a2ed6` with no amendment. Its content is one
  line in the sweep's `[identity]` block: `syncProbe = spawnSync(process.execPath, ['-e',
  'process.exit(0)'])`, and the line says which of two worlds the run is in — the EBUSY class amendment
  86 measured, in which case `docs/evidence/lib/syncproc.mjs` is **load-bearing** for every importer
  below, or `answers (status 0, no error)`, in which case every importer still runs through the bridge
  but nothing depends on the fault being there. The probe asks NODE and not the bridge, per
  `syncproc.mjs`'s own rule, and it prints before any row runs because "this run depended on a host
  fault" is an identity fact rather than a row result.
- **The correction.** The commit message predicted "the new line … reads `answers (status 0, no error)`
  on this box". Re-measured for this record: **it does not.** `spawnSync(process.execPath, ['-e',
  'process.exit(0)'])` fails with `EBUSY` 6 times out of 6, and the bridge's own probe
  `syncApiIsBroken()` returns `true`. So the line prints
  `BROKEN (EBUSY) — … syncproc.mjs is LOAD-BEARING`, which is the truthful half of the same sentence.
  The CODE was right and needed no change; what was wrong was a documented expectation, which is the
  exact failure mode this project keeps finding (§60) — a claim about a measurement nobody re-took.
  The lesson recorded beside amendment 90's: a prediction written into a commit message is still a
  claim, and it is not retired by the code around it being correct.
- The probe costs one spawn per full run and adds no import edge to the population.

### Amendment 108 (M5 v108, three-runtime) — the renderer and the frame clock were welded to browser globals, so 26 of 27 tests could not run; both are seams now, 2026-09

- **The state this found.** `packages/three-runtime` (M5's foundation) was committed in the sense that
  the work existed, but it was **not in any commit** and had never compiled: `tsc` reported 15 errors and
  `vitest` reported **26 failed / 1 passed**. Every one of those 26 failures was the same two lines:
  `initialize()` called `new THREE.WebGLRenderer({ canvas })`, which needs a live GL context, and the
  render loop called the browser global `requestAnimationFrame`. So the scene graph, cameras,
  animations, components, events and lifecycle — all of it GL-free and all of it the actual product —
  was unreachable in CI, and the one passing test was the constructor.
- **The observation worth recording:** the immediately preceding eighteen amendments (90–107) are all
  sweep-and-provenance work, perfecting the self-description of the verification machinery, while this
  package sat at 1/27. The harness had become the most carefully described thing in the repository and
  the least useful description of what shipped.
- **Seam 1 — `RenderBackend` (`src/renderBackend.ts`).** The runtime now depends on an interface
  (`kind`, `state`, `setSize`, `setPixelRatio`, `render`, `stats`, `dispose`, optional `raw`) rather
  than on `WebGLRenderer`, exactly the split ADR 0005 made for the Studio: the model composes, the
  backend draws. `createWebGLBackend` is the production default and applies **every** setting the old
  inline code applied, so a browser gets byte-identical behaviour; `createHeadlessBackend` records each
  `render()` with its scene, camera and object count. `webglAvailable()` reports whether a real context
  is even possible, so a caller can choose instead of discovering the answer through a thrown
  constructor.
- **Seam 2 — `FrameScheduler`.** `requestAnimationFrame` does not exist in Node, so `start()` threw
  `ReferenceError` the moment it was called outside a browser. `defaultFrameScheduler()` picks rAF when
  the host has it and a ~60 Hz timer otherwise (chosen ONCE, so ids are never mixed between the two),
  and `manualFrameScheduler()` makes the loop **steppable** — a test can now assert exact frame counts,
  that `stop()` cancels the outstanding frame, and that nothing runs afterwards.
- **Honest bound, stated in the code.** The headless backend reports `calls` (knowable: it counts
  `render()` invocations) and reports `triangles`/`points`/`lines` as **0**, because a headless backend
  cannot know how many triangles a draw produced — only a real driver can. A plausible non-zero number
  there would be a fabricated statistic, which is the §60 failure this file exists to avoid.
- **Three real defects fixed on the way, each a type error rather than a style choice.** (1)
  `physicallyCorrectLights` was assigned to the renderer and exposed as a config key; three r155
  REMOVED that property, so the option changed nothing and was deleted rather than kept as a no-op
  switch. (2) `createAnimation` could return an `AnimationAction` that was `undefined` when handed zero
  clips — it now refuses the call, so the type's promise that `threeAnimation` is present stays true.
  (3) The `geometry`/`material` disposal traversal was duplicated in `removeEntity` and `dispose()` and
  reached through `Object3D`, which declares neither; it is one narrowing helper now.
- **Declared dependencies corrected.** `@nexus/agent-runtime`, `@nexus/design-model` and `canvas` were
  declared and imported by nothing (0 files each; only `three` is used). Removed — a heavy native
  dependency that no code touches is a cost with no capability.
- **Evidence.** `three-runtime` **1/27 → 29/29** (two new cases: the config reaching the injected
  backend, and the manual-scheduler frame control), `tsc` clean from 15 errors, and the package builds.
  `world-engine` 31/31, `ai-providers` 20/20 and `agent-runtime` 360/360 are untouched by this change.

### Amendment 109 (M2 v110, docs/evidence) — a mutation that copies the number it is supposed to derive stops mutating the moment the number legitimately moves, 2026-09

- **What landed, in three refs.** `d890a76` appended the README sections for amendments 106 and 107, which
  the ADR owned and the reader-facing doc did not (append-only: 41 lines added, 0 deleted, HEAD blob
  verified a prefix). `0804f46` repaired the unit-test table, which was **red at HEAD before this
  increment existed**: `agentRegistry.test.ts` (17 cases), `browserTools.test.ts` (20),
  `multiAgentPipeline.test.ts` (12) and `vectorStore.test.ts` (6) are files a commit owns and the table
  had no row for — the drift amendment 90 named once ("a whole FILE never entered") recurring one
  increment later. Rows were written from each file's own `it()` titles and the live prose claim moved
  `354 (26 files)` → `409 (30 files)`; the historical amendment paragraphs were left alone, so the diff is
  5 added / 1 deleted, the single deletion being that live claim. `47a7537` is the finding this amendment
  is about.
- **The finding.** Making that honest prose change reddened §5 with
  `MUTATION SURVIVED: the prose total loses one — this checker cannot see the defect it is claimed to
  catch`. The mutation was written as `replace('sum to exactly **354**', 'sum to exactly **353**')`: it
  carried a **hand-copied snapshot of the value it exists to perturb**. Once the true total became 409 the
  pattern matched nothing, `String.replace` returned the text unchanged, and the case kept reporting
  itself as run while mutating zero bytes. §5's unmutated control still passed and the survivor report was
  accurate — the reporting was right and the mutation was wrong, which is why this took a real prose
  change to discover rather than a reading.
- **The rule extracted.** A mutation's target must be derived from the artifact it mutates, here
  `replace(/sum to exactly \*\*(\d+)\*\*/, (whole, n) → 'sum to exactly **' + (Number(n) − 1) + '**')`, so
  it bites whatever the live total is. This is amendment 92's lesson ("equality is not derivation") in the
  opposite direction: the earlier family was a checker comparing a consumer to a source's *current* value;
  this one is a *falsifier* holding a stale copy of a number, where the stale copy is invisible because a
  no-op mutation looks exactly like a passing one. A battery that cannot tell "the defect was caught" from
  "the mutation did not apply" is reporting more than it measured.
- **Measured at `47a7537`, in the plane the assertion needed** (`table-recount-proof.mjs`, run from the
  repository root after the commit, because §0 refuses to grade README bytes no commit made): `plane GIT`,
  runtime rows 409 over 30 files = measured 409 over 30, exec-host 275 over 8 = measured 275 over 8,
  failing TRACKED cases 0, `control clean · mutations caught: 4/4`, graded-tree digest `c94e9e210c41556d`
  stable across the run, exit 0. The prediction written into `47a7537`'s own message (4/4, 409/30, 275/8,
  0 red) held.
- **The owed full sweep, launched detached at this ref and read out of its own summary line**
  (`--isolated --ref 47a7537`, which exits 1 because the isolated plane says so):
  `[summary] ref 47a75371c189 · scripts 73 · failed 42 · killed 0 (0 at the runner's default, 0 at a budget
  the row named) · graded build c04f8cab9c33cc15 (280 dist files, stable across the run) · tree 7808ba1`,
  with 38 of the 42 reds naming a git failure in their cause line. The axes this increment did not touch
  held: plane axis 51/73 rows over 262 call sites (`program=117 argv=145`); confession axis supported 9 ·
  partial 0 · invisible 4 with `MIS-CITED 0`; the plane self-report `GIT 0 · NO-GIT 4 · mute 69`; the echo
  line 1 echoed / 1 matched the supplied NO-GIT / 0 ABSENT / 0 contradicted; `[asks axis]`'s gate number,
  RED with neither prediction nor declaration, is 0; and the census row speaks 356/356 definitions counted
  at DISK. **`table-recount-proof.mjs` is OK inside the full run** (11.8s, on its no-index branch), so the
  repaired table is green under the runner and not only under a local single-process invocation.
- **What only the sweep could show.** `provenance-proof.mjs` reddens with *no stdout at all*:
  `git rev-parse HEAD → exit 128: fatal: not a git repository`. Its §11 — the section amendment 106 exists
  to be — therefore never executes on the plane 42 of 73 rows are graded on: the two readers of the tree get
  reconciled only where git can answer. That is the same class of defect the stack fixed once before, when
  `confession-proof.mjs`'s unconditional `git rev-parse HEAD` crashed the row on the isolated plane
  (amendment 102), and this row was already red before the present increment, so it is a hole and not a
  regression. The reading that matters is the general one: a witness that cannot run where the runner runs
  has said nothing about that run, however many assertions it holds.
- **One number that disagrees across runs, recorded rather than reconciled.** The amendment 107 host probe
  printed `answers (status 0, no error)` in this sweep's process tree, while that amendment's own record
  states it failed `EBUSY` 6 times out of 6 when re-measured. Both are real spawns of the same shape, so the
  truthful sentence is the narrower one: the fault is intermittent per run, and
  `sync spawn API on this box` reports a run rather than a box — the second time that phrase has needed its
  plane attached to it.
- **Still open, named rather than papered over.** Nothing in the population refuses a *new* test file that
  arrives with no table row, so this is the second occurrence of a defect the stack already described;
  and amendment 106's sweep verdict was never recorded, because the run launched at `efc7d8f` died at
  `isolated-proof.mjs` before printing `[summary]` — the value of a background run is the number it
  printed, not the number its launcher expected.

### Amendment 110 (M2 v110, docs/evidence) — a witness that cannot run where the rows are graded has said nothing about that run, and the assertion that proved it was written for the wrong plane, 2026-09

- **What the owed sweep showed, not what the local run did.** Amendment 106's record was written from a witness
  that had never executed on the plane most rows are graded on: `provenance-proof.mjs` began with an
  unconditional `git rev-parse HEAD`, so in an isolated checkout the child died at line 24 and the runner printed
  `(no stdout — the child never reached a print)`. Every one of §11's assertions had been green — on a machine
  with an index. That is amendment 102's failure mode reproduced one section later, and the only reason it was
  visible at all is that the runner distinguishes "printed nothing" from "printed and failed".
- **The change (`24589f2`).** The two-reader witness is now the first thing the row does and needs no index: the
  directory-outside-any-repository case, the unusable-git case, the unparsable-answer case and the exit-128 case
  run on both planes; the subdirectory divergence and the repository-root case run only where a repository exists
  to stand in, and the other plane prints them as `UNCHECKED rather than corroborated` instead of silently
  skipping; the runner's wiring is read from `HEAD` on the git plane and from disk on the other, saying which.
- **The second defect, found by building the missing plane in four seconds.** A copy of `docs/` into a fresh
  temporary directory reproduces the no-index environment without a full run, and running the row there reddened
  an assertion the change had not touched: the exit-128 case demanded `diverged === true`, which is a property of
  the local probe (true only where the probe says `GIT`), not of the injected git answer. It is now
  `notRepo.diverged === (plane0.probe !== 'NO-GIT')`, with the message saying why the two planes differ. A witness
  that has only ever run in one environment writes that environment into its literals.
- **Measured both ways.** GIT plane: exit 0, subdirectory `["NO-GIT","GIT","GIT"]` DIVERGED, root `GIT/GIT`, bare
  `NO-GIT/NO-GIT`, reason `git unusable (gitFailed:EPERM), the local probe decided`, `unparsable:perhaps`.
  No-index plane: exit 1, as it must be, but stdout now carries `[§0] plane NO-GIT` and the `[§11]` line before the
  HEAD-reading sections fail for their own named reason.
- **The prediction held, recounted at `24589f2` by the sweep that ran there:**
  `[summary] ref 24589f236330 · scripts 73 · failed 42 · killed 0`, plane axis 262 call sites
  `program=117 argv=145`, confession axis supported 9 · partial 0 · invisible 4 with `MIS-CITED 0`, self-report
  `GIT 0 · NO-GIT 5 · mute 68` (was 4/69 — the row now names its plane because it survives long enough to say
  so), echo `1 / 1 matching / 0 ABSENT / 0 contradicting`, and `provenance-proof.mjs` listed as
  `FAIL … :: §1 dist 摘要 … | §2 「跑的是 ref 的字节」… || Error: git ls-tree … exit 128` — a red with a record
  rather than a silence.
- **Still open:** #142 (a sweep must say whether the tree it runs from erases the shared record) and #161 (a door
  that refuses an ADR amendment with no README section, pre-measured: the ADR carries two heading grammars, so the
  naive rule would invent three false holes).

### Amendment 111 (M2 v111, docs/evidence) - the ledger grants numbers, and nothing in this directory had ever checked whether a record kept up

The ADR is the only place an amendment number is ISSUED. Two defects live in that gap and no gate saw either:
a tracked file citing a number the ledger never granted, which sends its reader to a record that does not exist,
and an amendment the ledger claims that nothing outside the ledger repeats. The first is refused from this
commit on; the second is named in full and left unrefused until its record can be written honestly.

Measured at this landing: 106 headings, a record corpus of 94 files (docs/evidence plus docs/ROADMAP.md, with
docs/decisions excluded because each ADR numbers its own amendments and counting them would manufacture a
dangling defect out of a legitimate cross-ADR citation), dangling explicit citations 0, one-sided claims 1,
and 2 amendments whose explicit citations survive only in code. §5 stayed 4/4 and the graded-tree digest 8c0d37f8af1fe511 held across the run.

The defect the door found was in a shipped proof line 1: it cited a number in the sixties that the ledger
narrates as never granted - it existed only in a stale working copy - while README names amendment 87 as the
record that owns that proof. Both header lines are retargeted, and the module itself is untouched.

What the text taught about the grammar, twice over: a version label is not a citation (a doc writing
M2 v0-v14 does not claim an amendment 0), and a prose chain is not a pointer (am. 4-5 and am. 74-77 name a
span), so a number followed by a dash is refused nowhere. The first draft refused two ROADMAP range endpoints
and was corrected by reading them rather than by narrowing the rule.

The mutation that renumbers a heading had to be rebuilt twice. First it was a NO-OP dressed as a witness:
the regex was assembled from a template literal, where "\b" is a backspace and "\d" is the letter d, so it
matched nothing and §7 correctly refused to report a caught mutation. Then it targeted the newest heading,
and what a door needs is a heading some record CITES - renaming an uncited number orphans nothing. Renaming
a cited one is now proven to rewrite exactly one line before any verdict is claimed.

The one-sided direction stays report-only on purpose. Amendment 21 (host-verified UI runs plus ledger
journaling) is claimed by the ledger and repeated by no doc or proof in the corpus; authoring its record here
would be writing an account of an increment this row did not perform. So the console line carries its heading
text verbatim, and the refusal waits for a cycle that can read the record out of the ledger.

The landing script itself is part of the record: it cited amendment 111 in the header it retargets, so the new
door reddened on its own repair (the corpus contains the file the repair edits), and it wrote utf8-decoded
strings out under encoding binary, which truncates every non-ASCII byte in a repo whose prose is full of them.
The append guard - refuse unless the shared doc diff deletes zero lines - is what turned that into a red stop
instead of a committed rewrite of two shared documents.

Owed, and not run inside this cycle: a detached full sweep at the record ref, predicted at the gate commit -
73 rows unchanged, plane axis 262 sites program=117 argv=145, confession 9-0-4 MIS-CITED 0, self-report
GIT 0 NO-GIT 5 mute 68, echo 1/1/0/0, and table-recount-proof green inside the run.

Addendum to amendment 111 — the detached sweep the record owed came back agreeing with every predicted axis,
and the mutation proved itself on a ref it had never been written for.

Read from the run's own summary line at ref 00bf2ef74dec: scripts 73 (unchanged — an added section is not an
added row), failed 42, killed 0, 270s, graded build c04f8cab9c33cc15 over 280 dist files stable across the run,
walked tree 7808ba169ef046a7 over 219 files stable, dirty-sources 0. Plane axis 262 call sites program=117
argv=145 with 51 of 73 tracked proofs reaching a git child at code position; confession axis supported 9 ·
partial 0 · invisible 4, with all 3 gradeable declaring rows reconciled and 0 ungradeable; plane self-report
GIT 0 · NO-GIT 5 · mute 68; marker echo 1 supplied and 1 matching, 0 ABSENT, 0 contradicting.

The line that was not predicted-then-wrong is the one worth keeping: inside that run §7 renumbered the newest
CITED heading, which by then was 111 itself, so the door reported "the old number 111 is dangling and the new
one 1011 is one-sided". A hardcoded target would have frozen at 110 and gone quietly stale the moment the
record it reads grew by one — the derivation is what makes the witness survive its own landing.

### Amendment 112 (M2 v112, docs/evidence) - a record TITLE is what a reader follows, and a sentence about a hole is not its record

Amendment 111 left its one-sided axis report-only, and the very next thing that axis did was close itself
by reporting. The README section that names amendment 21 as unrecorded is itself a sentence containing
amendment 21, so the any-mention reading went from 1 to 0 with no record written anywhere. §7 now reads
the same 94-file population a second way, over TITLE lines only - a heading in a doc, or the first eight
comment lines of a proof - and the two readings disagree exactly where prose has papered over an absent
record: no mention at all 0, no record TITLE 2.

The two holes, with where their only credit currently lives: amendment 21 (host-verified UI runs plus
ledger journaling) is named only in docs/evidence/agents/README.md prose, and amendment 108 (three-runtime
renderer and frame-clock seams) only in a docs/ROADMAP.md table row. A row in a table is a claim ABOUT a
number, not a record FOR it, so the title reader does not credit either, and both stay named rather than
refused - the same refusal as amendment 111: writing their records from this cycle would mean authoring an
account of increments this cycle did not perform.

Containment is asserted instead of argued, because the two readers are the same grammars over different
line sets: every title line is also a line, so a number with no mention anywhere cannot have a title.
The check runs on every census the section produces, including all the mutants, and not just the
baseline - the baseline nowhere list is empty, which is precisely when a baseline-only assertion proves
nothing.

Three mutations on the new axis, each derived from the measurement rather than typed: a record title
appears and the hole shrinks by exactly that entry while the mention reading does not move; the same
number appears in PROSE and the hole still names it (the defect this amendment exists for, now a case);
and the README heading that is the SOLE title for a number has every digit scrubbed, putting exactly that
number back in the hole with dangling unmoved.

What the first draft of this amendment learned from its own failure, and it is not a defect: its
synthetic title line was "## Amendment 21 - a record title added in memory only" and §7 refused to
credit it. The mention grammar deliberately refuses ANY number followed by a dash, because "am. 4-5" is
a span and not a pointer - the lesson amendment 111 wrote down - and the ledger house style is
"## Amendment 21 - v21: host-verified UI runs + ledger journaling". Measured both ways over the corpus,
a strict and a dash-tolerant title grammar give the IDENTICAL holes, so widening the grammar would buy
nothing and would break the containment above; instead the arm copies the ledger heading text verbatim
and asserts that the dash-ended phrase stays refused, which states out loud what a future record author
must know: give your README section the amendment version label, or this door will keep calling it
unrecorded.

Measured at the gate commit 41f002e: ledger headings 107, record corpus 94 files, dangling explicit
citations 0, no mention at all 0, no record TITLE 2 [21, 108], explicit citations surviving only in code
2 (4, 5), §5 4/4, graded-tree digest 0d70b33a074e stable across the run, row exit 0.

### Amendment 113 (M2 v113, docs/evidence) - a record title is POSITIONAL: the line that opens a module titles it, its abstract does not, and the newest grant is refused when nothing titles it

Amendment 112 moved §7's one-sided axis from "is this number mentioned anywhere" to "does any record
carry this number as its TITLE", because the old axis closed itself the moment the README wrote a
sentence about an unclosed finding. The new axis kept one seam of the same disease: the title reader
for a `.mjs` record took ANY comment line among the first eight. Measured at 98474bb, header comment
blocks in this population run from 0 to 50 lines wide and 50 of 78 modules go past line 8, so "eight"
was a fact about how far the reader was willing to scroll and nothing about what a title is. A deeper
line of a header is the module's ABSTRACT, and an abstract is prose in a smaller font.

The window's damage was not hypothetical, and it was found by reading the hole the door itself
reported. Under the window, amendment 82 looked recorded: its only title credit was
`docs/evidence/agents/drive-axis-proof.mjs:4`, `// v81 built a CLEAN CHECKOUT of the ref, v82 made
its build verdict quotable, v83 said which BUILD a child cwd grades …` — one sentence reciting three
increments, which is exactly the shape 112 refused in a README paragraph. Read positionally (the
comment line that OPENS the module, after an optional shebang), the hole goes from `[21, 108]` to
`[21, 82, 108]` and NO number gains a credit it did not already have: the rule only removes. The
witness in the row re-opens the reader with the window and names the chain it had to drop, so the
claim "a window titles by prose" is recomputed every run rather than remembered from this amendment.

What the rule deliberately is NOT: "a title names one increment". That was the obvious generalisation
and it is false in this repository — 34 title lines credit more than one granted number, including
proofs whose genuine opening line is `// NEXUS M2 v12+v25+v27 — QA→repair closed-loop proof` and the
README's own line 1. A door may not refuse what the population contradicts without inventing a
different population, so the separator is POSITION and nothing else; the row asserts that
multi-grant titles still exist (9 under the positional rule) so the comment above that choice cannot
quietly rot into a claim the tree stopped supporting.

Two defects the change exposed, both closed here rather than deferred. First, the report line
described each hole as "prose in c.site.get(n)", where `site` is built only from EXPLICIT `amendment
N` citations — so for 82, which no file cites by that grammar but three files version-label, the door
printed "no citing file". A wrong sentence about a real finding is the species this arc keeps meeting,
so `credit(n)` now names the grammar that found the credit ("cited by", "carried only by the version
label in", "carried by no file outside the ledger"), and the census edit hook reaches every corpus
file instead of only the README — the moment the hook was general, the strip arm's subject moved to
`docs/evidence/studio/README.md`, which the README-only hook could never have reached.

Second, the one-sided direction had no teeth at all: 112 said "named here, refused by a later cycle",
and a later cycle always had a newer hole to name. The refusal now applies to exactly one number —
the NEWEST grant in the ledger — because that is the one number whose author is the cycle holding the
bytes that would title it, so refusing it costs no invented record. Older holes stay named and
unrefused for 112's reason: writing a record for an increment this row did not perform is a record
invented instead of read, which is amendment 90's title. Measured scanning down from the newest under
the positional rule: 112, 111, 110, 109 are titled and 108 is not — so this door, had it existed,
would have reddened the cycle that entered amendment 108 in the ledger and never wrote its record,
and 108 sits in the hole today as the finding it left behind. The refusal is a pure function of a
census, so the mutation arm can ask a MONOTONE question of a mutant: scrub the newest grant's title
line(s) in memory and the refusal reads `unrecordedNewest:112` while the hole gains 112; nothing about
the tracked tree changes, and the arm asserts its own subject exists before it pronounces its fate.

Honest bounds. This is a door about DOCUMENTS, on the same two planes as every other evidence row: it
grades the bytes of the ref the runner materialises, and it is silent about whether a record is
ACCURATE — a titled record that misdescribes its increment passes this door, and only the row that
re-runs the proof catches a lie about behavior. The refusal guards one position (the newest grant),
not the ledger's history; three holes (21, 82, 108) remain open by design and are printed in full
with what each one currently has. And the positional rule is a rule about THIS population's file
kinds: a doc title is a heading at any level, a module title is its opening comment line, and a `.mjs`
whose line 1 is a shebang is titled at line 2 — measured here as 76 of 78 modules opening with a
comment directly, one behind a shebang, and one (`docs/evidence/lib/syncproc.mjs`) opening with a
block comment and therefore holding no title at all, which costs no grant today because nothing is
titled there.

### Amendment 113, addendum: the owed sweep ran, one row was killed for the host's reason, and the kill is counted as a failure on purpose

The detached sweep at `5041776` finished: 73 rows, `failed 43 · killed 1 (1 at the runner's
default, 0 at a budget the row named)`, graded build `c04f8cab9c33cc15` (280 dist files) stable
across the run, walked tree `7808ba169ef046a7` stable, dirty-sources 0, 796 s, and the home build
`UNMOVED` — the isolation gate. Reconciled against the prediction in `2886748`: plane axis 262
sites / program=117 / argv=145 HIT; confession axis supported 9 · partial 0 · invisible 4 with
MIS-CITED 0 HIT; `table-recount-proof.mjs` OK inside the run HIT, and its §7 digits at this ref —
ledger headings 109, corpus 94 files, dangling 0, no mention at all 0, no record TITLE 3
[21, 82, 108], newest grant 113 titled — are read by the row's own console at this ref, which the
`[identity]` excerpt does not carry (it prints a row's exit and tail lines only), so what the sweep
contributes here is the green exit and not a second reading of that line.

`rows still 73 · failed 42 · killed 0` MISSED: observed 43 and 1. The cause is measured, not
asserted. Every one of the 73 rows was slower in this run — median duration ratio 2.50, total
row-time 289 s then 764 s — and the FAIL SET IS THE SAME 42 NAMES in both logs, so the population
did not change its mind anywhere. The only verdict change between the two runs is
`confession-proof.mjs` OK→KILL at ratio 2.15 (111,810 ms then 240,403 ms): it was already the
SLOWEST of all 73 rows in the previous run, by 4.5x over the next one (`asks-axis-proof.mjs` at
24,998 ms), and it names no budget. No row exceeded 150,000 ms in the v112 run; in this run exactly
one did, and it is that row.

The arithmetic of the two numbers is the runner's own and is deliberate: `sweep.mjs` sets
`verdict: timedOut ? 'killed' : code === 0 ? 'passed' : 'failed'` and then counts
`failed = results.filter((r) => !r.ok)`, commented "v85: `failed` keeps its old meaning — a killed
row did NOT pass, and no witness may read a kill as a green — while the count of WHOSE number did it
is stated beside it rather than instead of it". So `failed 43` is 42 rows that answered and refused,
plus one row that answered nothing; `killed 1` is the sub-count that says WHICH, and the
parenthetical says whose constant ended it. Read the pair as "42 refusals and 1 ungraded", not as
44 reds.

What this leaves is a known ceiling with a measured instance, and it is worth naming precisely
because it is NOT a new hole in §7 or in the axes: a row whose natural duration sits within ~2x of
the default is killed for the HOST's reason rather than its own, and the runner already says so in
the kill line ("this red belongs to a constant in sweep.mjs and not to anything the proof
asserted") and in `[identity] row budgets` ("70 rows name nothing and take 240000ms, which the
runner cannot know is enough"). The edit that would close it is the row's — declare milliseconds as
`isolated-proof.mjs`, `reap-proof.mjs` and `table-recount-proof.mjs` do — and no amendment is
granted for it here, because amendment 85 already owns this axis and the population's product code
is the part of this repository that is thin.

Honest bound, stated because it changes what the run may be cited for: with that one kill the
sweep at `5041776` carries 72 verdicts, not 73, so NOTHING in it says anything about
`confession-proof.mjs` at this ref. The last verdict for that row is `98474bb` — OK, 111,810 ms —
and it is a different ref, so it is not quoted here as evidence about this one.
### Amendment 113, addendum: the §7 renumber witness counted a co-located addendum as a second grant, and this amend-113 addendum is what made it fire

The row run to verify the previous addendum (base `5041776`, this file committed at `d2a43e4`) printed its §7
baseline correctly — `ledger headings 109`, `record corpus 94 files`, `dangling 0`, `no mention at all 0`,
`no record TITLE 3 [21, 82, 108]`, `the newest grant 113 IS titled` — and THEN aborted with an uncaught
`AssertionError: the mutation must rewrite exactly ONE heading numbered 113 and rewrote 2`. So the prior
prediction that "the addendum leaves §0 through §6 unchanged in their arms and exits 0" was wrong about §7's
own mutation, and that miss is the hole this addendum closes.

Cause, read off the shipped file rather than reasoned about: §7 answered "which heading grants number N"
with TWO different rules that had never been reconciled. The grant set is built by `headingsOf`, which matches
`^#{2,3} Amendment (\d+)` AND SKIPS an addendum tail (`/^\s*(—\s*)?,?\s*addendum/i`) — an addendum reuses its
parent's number and grants nothing. But the renumber mutation matched `#{2,3} Amendment N` on raw lines
WITHOUT that skip, then asserted exactly one hit. Every addendum-carrying number was therefore a latent crash
for that witness, armed and waiting for the day it became the NEWEST CITED heading (renumber renames
`Math.max(...cited)`, and an addendum's number is indistinguishable from its grant's in the raw text).

What armed it was this very lane's previous commit: the owed-sweep addendum added a SECOND heading numbered
113, and 113 was already the newest cited grant, so renumber's `from` was 113 and its raw line-scan found two
lines and refused to run its own mutation. Measured statically against this file's HEAD blob, the six
addendum-bearing grants — 89, 95, 97, 101, 103, 113 — each report `hits 2` under the old line-match and
`hits 1` once the addendum is excluded; only the timing of which one became newest-cited hid the divergence.

Fix, in `docs/evidence/agents/table-recount-proof.mjs`: the addendum predicate is lifted into ONE shared
const, `ADDENDUM_TAIL`, and both readers now use it — `headingsOf` as before, and `renumber` so it renames
exactly the heading that GRANTS the number and leaves its addendum. This is not a widening: the mutation still
renames a real, corpus-cited grant and still requires that grant's citations to dangle; it simply stops being
confused by a heading that grants nothing. Reconciling two readers of one fact by deriving both from a single
predicate is the same discipline the alias/ceiling amendments learned for a different axis.

This addendum grants nothing — `### Amendment 113, addendum:` is matched and excluded by the very grammar in
dispute, so the ledger stays at 109 grants with newest 113 — and the reason it is an addendum rather than a
new amendment is that no new capability entered §7; an internal inconsistency was removed.

PREDICTION for the row run at the ref this commits, recounted there: exit 0; §7 still prints ledger headings
109 (NOT 110 — an addendum grants nothing by design), record corpus 94 files, dangling 0, no mention at all 0,
no record TITLE 3 [21, 82, 108], newest grant 113 titled; and the §7 renumber witness now runs against `from`
= 113 rewriting exactly ONE granting heading (its addenda excluded), so the dangling / renumber-orphan /
house-title / prose-not-a-record arms all print `caught` and the row no longer aborts. If it still reports
`rewrote 2` at 113, the two readers are NOT actually sharing the predicate and that is a defect in this edit,
not in the door.



### Amendment 114 — v114: the runtime steps a `CharacterController`, and says by name which declared fields it still refuses to honor

`types.ts` had declared `CharacterController` and `ControllerInput` for a full milestone while
`updateControllers` was a comment reading "would go here" — the types were read by nothing, so the
runtime declared a character controller it could not move. This amendment makes the integrator real and,
because a half-implementation of a declared surface is exactly the kind of claim that reads as complete
but is not, requires it to report its own gaps by name.

`packages/three-runtime/src/threeRuntime.ts` now owns a per-entity controller registry
(`Map<EntityId, {controller, groundY}>`) rather than a component, because `groundY` is a property of the
world the character stands on, not of the character. The public surface is `attachController` (throws
naming a missing scene or entity, refuses a second controller on one entity instead of replacing it
silently, and DERIVES `grounded` from `position.y <= groundY` rather than assuming the entity is
standing), `detachController`, `getController`, `setControllerInput`, and `controllerFieldAudit`.
`animate()` was re-pointed at a new `simulateFrame(delta)` that advances animations, physics,
controllers and cinematics, so the wall-clock loop and a deterministic test run the SAME code — the only
quantity a test cannot control (the clock delta) is pushed out of the path it asserts on. Movement is
plane-aware (`MOVEMENT_PLANE`): camera-relative XZ for first/third person, world XZ for top-down and
custom, and XY for side-scrollers, where the forward/backward keys legitimately have no axis to push
against; input is normalised before scaling so a diagonal is not `sqrt(2)` faster than a cardinal
direction, and `airControl` scales horizontal intent while airborne. Gravity/jump/landing: a jump frame
pays no gravity, a mid-air jump is refused, and landing clamps `position.y` to `groundY` exactly and
re-grounds. `type: 'custom'` keeps whatever state its owner wrote, so that declared literal stays
reachable. An entity removed from a scene drops its entry and emits `controllerOrphaned {entityId}`;
`dispose()` clears the registry directly, because a teardown is not a caller losing one live entity.

The honesty half is `controllerFieldAudit`, which derives its answer from `Object.keys` of the live
controller against the shipped read/write field tables — so a field declared on the type with no
implementation lands in `untouched` automatically instead of being ignored in silence. Measured from the
shipped code, a default controller's `untouched` list is exactly `[slopeLimit, stepOffset]`: both need
collision geometry this package does not have (`scene.physics` / `PhysicsConfig` is still read by
nothing). The suite pins that this is not decoration — two controllers differing only in those two fields
produce byte-identical 30-frame trajectories, while the `speed` positive control does not.

Verified: `packages/three-runtime/test/characterController.test.ts` — 39 cases through `simulateFrame`
with an exact delta; package total 68/68 vitest (29 v108 + 39 v114), `tsc` clean. A behavioral control
was run at the fix ref: deleting the diagonal normalisation reddened exactly one case, proving the
integrator is the live path and not a parallel copy. Honest bounds kept: `updatePhysics` and
`updateCinematics` are still empty stubs, there is no Studio surface driving this runtime, and the
cinematic slice is not built.

### Amendment 115 — v115: the declared save format gets a writer and a reader, and an audit that names what a save still cannot carry

The census that chose v114 was "which declared type is read by nothing". Re-running it after that commit left the
same shape of hole one level down: `types.ts` declares `SaveData`, `SerializedSceneGraph`, `SerializedScene`,
`SerializedEntity`, `SerializedNPC`, `SerializedQuestSystem`, `SerializedPlayer` and `SerializedCinematic`, and
before v115 **nothing in the package constructed or consumed any of them**. A save format with no writer is worse
than no save format, because a reader of the type list would believe the game state round-trips. So v115 built
the entity half of it and refused to pretend about the rest.

The first thing a snapshot has to get right is that it stops being a reference. `entity.transform.position` is the
very `THREE.Vector3` the renderer moves (the controller suite pins that identity), so a snapshot that assigned
rather than cloned would keep changing after it was taken, and nothing downstream could tell a saved position from
a live one. `snapshotEntity` clones position, rotation and scale, and keeps their classes — a saved rotation is a
`THREE.Euler`, not a `{x,y,z}` bag that happens to compare equal. The two open bags in the shape (`userData`, and
each `EntityComponent.data`) are checked before they are copied: a live `THREE.Vector3` stashed in `userData` is
refused **with its path**, so `userData.meta.tag` names itself rather than being flattened into something flatter
than what the caller put in, an array element is refused by index, a `Map` by class name, a function by kind. A
reference to a running object would keep the whole scene graph alive behind the snapshot and come back detached.

A restore is an insert under the saved address, not a fresh entity wearing the old name. `SerializedEntity.id` is
only worth storing if a load hands the same id back — otherwise every reference to the old id (a controller,
another entity's `userData`) points at nothing after a load while the save claims it recorded the id. That is why
`createEntity` no longer owns entity registration: both paths call the private `insertEntity(sceneId, id, …)`, and
the matrix rebuild the restored entity needs lives in that shared path. Restore is also **not** an overwrite: a
snapshot cannot be reloaded onto a live id, because the caller has not agreed to lose whatever changed since the
save was taken, and an unknown scene throws naming both the scene and the entity rather than creating a scene as a
side effect.

`saveFeasibilityAudit(sceneId, entity)` is the honesty half. It answers `{dropped, aliased, savable, blocked}`, and
`dropped` is derived at runtime by comparing the fields the entity actually has with the fields the snapshot
builder actually produces — so it cannot quietly go stale the way a hand-written list does. Two things it says
today: `threeObject` and `transform` are accepted as ALIASES only because every name their claim lists
(`position`, `rotation`, `scale`, `visible`, `castShadow`, `receiveShadow`, `layers`) is present in the record that
was really built, which is why `SerializedEntity` had to grow a `layers` field — an entity's render channel is part
of its state, and a save that omitted it would restore channel 0 and still report success. And `SaveData` is
**not** savable: `savable: ['entities']` against `blocked: [sceneGraph, npcs, quests, player, worldState,
cinematic]`, each with the reason named — `NPCSystem` and `QuestSystem` are declared and implemented by nothing,
`SerializedScene` stores a `LightingConfig` whose lights hold live `THREE.Light` objects, `SerializedPlayer` names
health/mana/inventory/skills the runtime does not hold. Writing a whole-game `SaveData` today would produce a file
full of empty maps that opens as an empty world, so the field list stays blocked rather than being filled with
decoration.

The probe was behavioural and it was run twice, because the first run changed the code. Nine arms, each a value
change in `packages/three-runtime/src/threeRuntime.ts` found exactly once before any test ran (the script refuses an arm
whose target string matches twice — that guard is what surfaced the redundancy below), plus an unmutated control
that collected 110 cases with 0 red. First run, reds per arm: `1-position-not-cloned` 2, `2-live-objects-accepted`
5, `3-layers-not-applied` 1, `4-fresh-id-on-restore` 3, `5-overwrite-allowed` 1, `6-dropped-hardcoded` 3,
`7-matrix-not-rebuilt` **0**, `8-component-data-by-reference` 2, `9-npcs-called-savable` 2. Arm 7 surviving is what
told me the arm was not testing a guarantee: `restoreEntity` called `updateMatrix()` after `insertEntity` had
already rebuilt the matrix from the copied position/rotation/scale, so removing that call reddened nothing — a
redundancy wearing a claim, written in the same uncommitted cycle it was caught in (it is nowhere in the landed
diff, which measures 222 lines in and 4 out against `ec3e8fc`, and those 4 are the `createEntity` lines the shared
`insertEntity` replaced). The answer was to delete the line rather than widen the test, and to re-arm the probe on
the call that actually owns the rebuild. Second run over the fixed source: control 110 / 0 red again, and 9 of 9
arms caught (2, 5, 1, 3, 1, 3, 1, 2, 2), the new `7b-insert-matrix-not-rebuilt` red in exactly one case —
`restoreEntity — a load hands back the entity the save described > puts the numbers back in the renderer's object
AND in the matrix that draws it`.

What v115 does not do, stated rather than left to be discovered: nothing is serialised to JSON or to disk — a
snapshot is an in-memory `SerializedEntity`; geometry and material are not in the shape, so a restored mesh is the
default `BoxGeometry(1, 1, 1)` with a `MeshStandardMaterial`, and a test measures both vertex counts instead of
asserting the loss in prose; a restore fires `entityRestored` AND `entityCreated`, because a load really does add
an object to the scene; `scene.physics`/`PhysicsConfig` is still read by nothing, `updatePhysics` and
`updateCinematics` are still empty stubs, and `slopeLimit`/`stepOffset` remain unhonored. The suite is
`packages/three-runtime/test/saveSnapshot.test.ts`; the last section of it does not restate the production tables —
it reads `src/types.ts` from disk and requires that the builder produces exactly the fields `SerializedEntity`
declares, that every declared field of `ThreeEntity` is carried or explicitly aliased, and that `savable ∪ blocked`
is an exact partition of the fields `SaveData` declares, so a shape that drifts from its writer is a red test.
Next: the declared physics is the same species of hole as the declared controller was in v114 — `gravity`,
`timeStep`, `maxSubSteps`, `broadphase` and `solverIterations` are read by nothing outside `types.ts`, and the
integrator takes its gravity from a package-level default instead of the scene that declares it.

### Amendment 116 — v116: the scene's declared physics gets its readers, `updatePhysics` stops being a stub, and an audit says what a declared world still cannot buy

Amendment 115's `Next:` named this hole, so this grant is a promise being paid rather than a new direction.
`PhysicsConfig` declared `gravity`, `timeStep`, `maxSubSteps`, `broadphase` and `solverIterations`; `ThreeScene`
and `SerializedScene` each held an optional `physics` slot; and nothing outside `types.ts` read any of them.
`updatePhysics` was two lines of comment apologising for not existing, and a character fell at
`DEFAULT_CONTROLLER.gravity` — a package-level constant that no scene could change, which is a strange thing for a
3D runtime to have decided about the world.

Three readers were added in `packages/three-runtime/src/threeRuntime.ts`.

`setScenePhysics(sceneId, physics)` validates **by the reading the storage has to support**, which is the rule this
lane keeps having to relearn. A controller carries gravity as a positive magnitude applied on `-y`, so `gravity.y`
must be `<= 0` — and that is ONE guard doing two jobs, because `!(NaN <= 0)` is true, so a caller who passes an
uninitialised vector is refused rather than silently defaulted. A vector with `x` or `z` is refused by name: a
scalar field cannot carry it and there is no per-body dynamics here for it to push. `timeStep` must be positive
(0 asks the accumulator for infinitely many slices) and `maxSubSteps` a whole number `>= 1` (0 asks a frame to run
none). It stores a CLONE of the gravity vector, because a caller keeping a handle on the world means the world
changes under a running game when someone writes to a vector they handed away once. It clears the scene's
accumulator and its last-frame record: a new step size must not spend — or report — time measured against the old
one. It returns the scene's OWN object, and a case asserts that, so the documented way to see what was stored is
not a fiction.

`updatePhysics(delta)` is now the only reader of `scene.physics`, and it returns a step PLAN rather than
integrating anything itself. First it pushes `-gravity.y` into every controller whose caller did not name a
gravity — active scene only, and non-declared controllers only, because a caller who wrote `gravity: 3` asked for
a number and the world does not get to overrule it. The sync lives in the frame loop and nowhere else: writing it
in the setter too would mean two write paths that can disagree, and a controller attached to a DORMANT scene would
be handed the active scene's pull. The frame loop is the one place that already knows which scene is live. Then it
turns the frame into `min(floor(available / timeStep), maxSubSteps)` slices of `timeStep` and
`updateControllers(steps)` integrates exactly those, so `timeStep` and `maxSubSteps` are read by the code that
moves things rather than by an audit about them. The per-scene backlog is capped at `maxSubSteps * timeStep` and
what the cap refuses is REPORTED as `droppedTime` rather than kept — an uncapped accumulator loses nothing for a
while and then spends one frame simulating ten seconds of world, which is a teleport with a nicer name. A scene
that declares no world returns `[delta]`, i.e. the v114 path, one slice of the whole frame: fixed stepping is a
property of a declared world, not of the runtime. `updateControllers` also resolves orphans ONCE per frame, before
any slice runs, because stepping a corpse and then dropping it emits `controllerOrphaned` after the motion it
claims did not happen.

`physicsFieldAudit(sceneId)` answers `{declared, consulted, unhonored, effectiveGravity, stepping}`. `consulted`
and `unhonored` come from the shipped tables, `effectiveGravity` and `stepping.lastFrame` come from the live scene
and the last frame — and `lastFrame` is keyed per scene, because an audit of a dormant world that answered with
the active world's numbers would be a reading of the wrong thing. The suite's last section does not restate those
tables: it reads the `PhysicsConfig` field list out of `src/types.ts` from disk and requires `consulted ∪ unhonored`
to be an exact partition of it, with no overlap and no gap, which is what stops a newly declared field from joining
the silent ones. `unhonored` carries a REASON per field, not a name — a broadphase searches candidate contact pairs
and there is no collision geometry to search among, solver iterations count passes over existing contacts and a
character is held up by a `groundY` plane, not by a solver.

v116 also made one shipped sentence stale, and the fix went into the code rather than into a footnote.
`SAVE_DATA_FEASIBILITY` (v115) refused `sceneGraph` because `SerializedScene` holds live `THREE.Light` objects;
`SerializedScene.physics` is now a field the runtime actually reads, and it holds a live `THREE.Vector3`, so that
reason had become incomplete. A hand-written string inside an audit is the one part of an audit that cannot derive
its own truth, so it got a test that requires the sentence to name both `THREE.Light` and `THREE.Vector3`, and a
probe arm that restores the v115 wording and reddens.

Measured: the suite is `packages/three-runtime/test/scenePhysics.test.ts` (30 cases), package total **140**
(29 runtime + 39 controller + 42 save + 30 physics), `tsc --noEmit` clean. The v114 controller cases were not
touched and still pass, which is the evidence that the no-world path is unchanged rather than a claim about it. The
behavioral probe ran 15 arms over the final source against an unmutated control that collected 140 with 0 red, each
arm's minimum written down before measuring; reds were 1, 1, 4, 3, 3, 2, 1, 2, 1, 2, 1, 2, 1, 1, 1 — no survivor,
no under-prediction. Three arms caught MORE than predicted: the sign-flip arm reddened two substepping cases it was
not credited with, and the reason is that those cases compare a world-driven fall against a run where the
controller declares its own gravity, so they are coupled to the sign convention too. Over-claiming is the failure
this door exists to catch, so under-predicting my own coupling is recorded as a measurement error in reading my own
tests, not as a bonus. The substepping equality claims are derived rather than restated: a `1.0` frame in a
`0.5`-step world must land where two `0.5` frames land with no world at all, and the control for that is a case
asserting the substepped fall is SHORTER than one big slice of the same second.

What v116 does not do, stated by name: `broadphase` and `solverIterations` remain unhonored, and so do
`slopeLimit`/`stepOffset` (v114's confession) — all four wait on collision geometry the package does not have; the
world is read for the ACTIVE scene only, so a dormant scene's gravity pushes nothing; horizontal gravity is
refused, not supported; a scene with no declared world still runs variable-step; `updateCinematics` is still an
empty stub, and `SaveData.cinematic` stays blocked for that reason. Next: the cinematic slice is the same species
of hole as the physics world was — `CinematicSequence` and `CinematicShot` are declared at `types.ts:125` and
`types.ts:134`, and measured at this ref those two names plus `SerializedCinematic` appear in `src/` ONLY inside
`types.ts`: everywhere else the word survives in exactly two places, the stub's own call site in `simulateFrame`
and the string in `SAVE_DATA_FEASIBILITY` that explains why `cinematic` is blocked. So the sequence has no writer,
no reader and no container that anything can hold — it is the last unread type surface inside `simulateFrame`.

### Amendment 117 — v117: the cinematic sequence gets a player, `updateCinematics` stops being a stub, and an audit says what a player still cannot honor

Amendment 116's `Next:` named this hole, and it named it accurately: `CinematicSequence` and `CinematicShot` are
declared at `types.ts:125` and `types.ts:134`, `SerializedCinematic` at `types.ts:488`, and outside `types.ts` the
word survived in exactly two places — the stub's call site inside `simulateFrame`, and the `SAVE_DATA_FEASIBILITY`
row explaining why `cinematic` is blocked. So the type surface had no writer, no reader, and no container anything
could hold. v117 gives it all three in `packages/three-runtime/src/threeRuntime.ts`.

`defineCinematic(sceneId, input)` is the registrar, and it is where the design decision lives: **a value this
runtime cannot perform is refused at registration rather than stored and ignored.** 14 refusals, each naming
what it was given — unknown scene, duplicate id (there is no unregister in this runtime), no shots, a first shot
that does not open at playhead 0, a shot starting at or before its predecessor's end, a shot that does not end
after it starts, a camera that is not in the scene the sequence registers against, a transition other than
`'cut'`, a non-zero `transitionDuration`, an `"fov"` animation on an orthographic camera, an fov that is
non-finite or outside `(0, 180)`, an easing name that is not a key of `CINEMATIC_EASINGS` (the message prints that
table's own keys, so the sentence cannot go stale when an easing is added), a path whose `getLength()` is not
positive, and a declared `duration` that disagrees with the derived one. The alternative — accept and ignore — is
what makes an audit's `unhonored` list a description of a lie rather than of a gap: a fade blends two rendered
images, this runtime draws one active camera per frame, and after refusing a non-cut there is no interval left for
`transitionDuration` to time.

`duration` is DERIVED as `max(shot.endTime)`, and a caller who names a different number is refused rather than
believed. The shots and the total are one fact with two spellings, which is the shape of bug this lane keeps
relearning; the refusal message prints both numbers so the caller can see which one the runtime is going to use.

`updateCinematics(delta)` is the frame reader, and three of its readings are of declared types rather than of
preference. The playhead advances to `min(time + delta, duration)` and the clamp is what makes "finished"
observable — without it `entry.time >= duration` is never true and the sequence runs forever. The camera switch
fires when the shot INDEX changes, which is the only behavior a `'cut'` can have under one camera per frame; the
same branch writes the declared `currentShot`, so the field the type claims is the field the player moves. The
paths are sampled with `getPointAt`, i.e. by arc length, so a shot's `startTime`/`endTime` say WHEN the move
happens and the curve's own geometry says HOW FAST — `getPoint` would make the camera crawl past wherever the
author put control points close together. `lookAt` runs after the position write because it reads the position it
was just given. When the sequence's scene stops being the active one the playhead stops and
`cinematicInterrupted` says why, but the POSITION is kept: a shot's `cameraId` addresses one scene's camera set,
so a dormant scene cannot show the frame, and a caller who switches back can resume from where the interruption
landed.

`playCinematic(id)` / `stopCinematic(id)` own the single active slot, and the reason is a field of the declared
save shape: `SerializedCinematic.activeSequence` is ONE id, so a runtime that could play two sequences at once
would have nothing honest to put in it. `playingCinematic()` is therefore DERIVED by scanning `sequence.playing`
rather than stored beside it — two sources for one fact can disagree. A play on a finished sequence rewinds it; a
stop does not, because a stop is someone interrupting a cutscene, not a request to watch it again.
`cinematicSnapshot()` fills all three declared fields from the registry, and is the first writer
`SerializedCinematic` has ever had. `cinematicFieldAudit(id)` answers the two partitions plus a live playhead, and
its `playhead` carries BOTH the declared `currentShot` and the audit's own `shotId`/`cameraId`: `currentShot`
cannot say "nothing has been shown yet", because its type is a number and it sits at 0 before the first frame.

Measured: `packages/three-runtime/test/cinematicSequence.test.ts` is 39 cases and the package total is **179**
(39 controller + 42 save + 30 physics + 29 runtime + 39 cinematic), `tsc --noEmit` exit 0. The behavioral probe ran 27 arms over the final source against
an unmutated control that collected **81 with 0 red** on the two-file plane that reads cinematic code
(`test/cinematicSequence.test.ts` + `test/saveSnapshot.test.ts`), each arm's minimum red written down before
measuring. Reds: 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 10, 3, 1, 1, 2, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1. No arm survived. One arm reddened MORE than written down for it: `14-end-clamp-never-reached` was credited 2 and reddened 3. The third red is `updateCinematics — the playhead, the cut, and where the camera ends up keeps the playhead when stopped, and rewinds only a finished sequence on replay` — its title is about stopping and rewinding, and its BODY asserts that the playhead lands exactly on `duration`, so the clamp is one of its assertions too. I predicted from the case's name instead of reading its assertions, which is the error amendment 116 recorded for the same reason. The last arm is not a playback arm: it restores
v116's `SAVE_DATA_FEASIBILITY` sentence about `cinematic`, which is the edit this grant describes below, and it
reddens one case — the one that requires the shipped reason to name `THREE.CatmullRomCurve3` and forbids it from
reading like an empty-stub confession.

v117 also retired a stale reason inside shipped code. That row said `updateCinematics` was an empty stub, so there
was no sequence state to save; v117 gave the shape a writer, so the true blocker is now that `sequences` holds LIVE
`CinematicSequence` objects whose shots carry `THREE.CatmullRomCurve3` paths and nothing here rebuilds a curve from
stored points. `SaveData.cinematic` therefore STAYS in `blocked` — six blocked fields, unchanged — and the honest
summary of v117 is that the declared save type has a writer and still has no reader.

Two measurement errors from this cycle are in the record rather than hidden, because both are the same failure in
different costumes. First, the probe harness itself: `spawnSync('npx', …)` without a shell does not exec a Windows
`.cmd`, and the vitest banner has two spellings for its summary line, so the first two runs of the probe refused
for reasons that were about the harness and not the code — the fix was to grade the JSON reporter and to let the
control fix the population every arm must match, which also catches a mutant that crashes collection (an
import-time crash is zero reds, not a caught mutation). Second, and worse: while the probe was mid-run I opened
`threeRuntime.ts` to quote it and read `activeSequence: null,` in `cinematicSnapshot` — arm 22's mutant, on disk at
the moment of the read. It looked exactly like a one-line lie about the playhead, and only the passing suite
contradicted it. A probe that mutates tracked files makes every concurrent read part of its own plane.

What v117 does not do, stated by name: `postProcessing` is uninterpreted, and with it every transition but the
cut; playback drives a camera and nothing else — no character, no audio, no material; one sequence at a time, one
scene per sequence, no unregistering, four easings; an orthographic camera cannot be fov-animated; there is no
Studio surface, so a sequence is authored by code as it has been since v108. Next: the same question this grant
answered for `CinematicSequence` is still open for the three `SaveData` fields whose blocker is not a missing
reader but a missing SYSTEM — `npcs`, `quests` and `player` are declared at `types.ts` and implemented by nothing,
so unlike `cinematic` there is no stub to replace, only a subsystem to decide the shape of. The cheaper adjacent
hole is `slopeLimit`/`stepOffset` and `broadphase`/`solverIterations`, all four of which wait on the same missing
collision geometry; a first capsule/box collider would move three of them out of `unhonored` at once.
### Amendment 118 — v118: the declared cinematic save gets its reader, the snapshot stops aliasing the running game, and a field leaves `blocked` for the first time since this table was written

Amendment 117 closed with a sentence about what its own grant left undone: `SerializedCinematic` had a writer
and no reader, and the reason was that nothing rebuilt a `THREE.CatmullRomCurve3` from stored points. v118 is
that rebuild, in `packages/three-runtime/src/threeRuntime.ts` and `packages/three-runtime/src/types.ts`, and
the interesting part is not the codec — it is the four questions a shape cannot avoid once something tries to
READ it.

**Which scene?** A shot's `cameraId` addresses one scene's camera set, and `defineCinematic` refuses a shot
naming a camera the scene it registers against does not have. The runtime keeps that scene on the registry
entry, `CinematicEntry.sceneId`, and the declared `CinematicSequence` has no such field — so neither did
`SerializedCinematicSequence` until a reader needed it. The save shape now declares `sceneId`, which is the same
repair `SerializedEntity.layers` was in v115: a field the shape must carry or a restore silently loses.

**Does the save agree with itself?** `activeSequence` and the set of sequences claiming `playing` are two
spellings of one fact, and a `Map` key and the record filed under it are another pair. At runtime the runtime
owns both — `playingCinematic()` derives the first from the second, and `defineCinematic` owns the key — so
neither pair can disagree without a caller. A save can. `restoreCinematic` refuses both directions (an
`activeSequence` that names nothing, a playing sequence with no active slot, two playing sequences, a key
holding a record that calls itself something else) and prints both answers in the message.

**Where does the playhead land?** `currentTime` exists once per save, for whichever sequence is active. The
others carry only `currentShot`. So a stopped sequence resumes at the START of the shot its save names, the most
specific instant the data can prove — and `CinematicRestoreReport.playheads` prints where every sequence landed,
because "restored" without that list would let a reader believe the playhead survived when only the shot index
did. v117's stop-keeps-position behavior stays true at runtime and is now honestly labeled as
unrepresentable in the declared shape.

**Who writes what?** `restoreCinematic` never touches `playing` and never touches a camera. It places the
playhead, leaves `lastShot` at -1, and calls `playCinematic` to take the slot — so the single-slot rule has one
owner, `cinematicPlayed` fires the way it does for a caller, and the first frame after a restore is the frame
that re-derives the index, cuts, and writes `currentShot`. A restore that aimed a camera too would be a second
owner of what `updateCinematics` exists to be.

The refusals are partitioned by what the alternative would be, and that sentence is the load-bearing one. The
codec refuses the inputs that would CRASH the player: a shot that is not an object (`defineCinematic` reads
`shots[0].startTime`), a curve with one control point, a `curveType` outside `CURVE_TYPES` — measured,
`new THREE.CatmullRomCurve3(points, false, 'bogus')` keeps the word and answers `getPointAt` with
`NaN, NaN, NaN` — a truthy non-boolean `closed`, and a non-finite coordinate or tension. 27
reader-side and 5 writer-side, each naming the value it found. Every TIMELINE decision stays
`defineCinematic`'s: the saved `duration` is passed through as `CinematicSequenceInput.duration`, so a save
edited to 99 is refused by the same door a hand-written call meets, printing 99 and 2. Two owners of one rule is
the failure this lane keeps relearning, and a reader is where it shows up.

The writer refuses too, and that is not symmetry for its own sake. `defineCinematic` copies the shot ARRAY and
not the shot OBJECTS — a path is a live curve, and copying a curve means rebuilding it — so
`live.shots[0].startTime = NaN` after registration is reachable, and the runtime would happily play the result.
A snapshot that wrote that NaN out would produce a save its own reader refuses; a save shape that cannot be read
back is not a save. `plainDataOrRefuse`, the check `userData` has carried since v115, runs over `postProcessing`
too, and `structuredClone` means the copy does not move when the live pass list does.

v118 also corrected a door that had been claiming a refusal it did not give. `defineCinematic`'s docstring said
it refused a zero-length path. Measured at this ref, `getLength()` on a curve with one control point throws
`TypeError: Cannot read properties of undefined (reading 'x')` from inside three.js — so the door crashed on the
input it said it was refusing, and the crash named three.js's internals rather than the caller's path. The
control-point count is now asked before the length, and the refusal names both numbers.

`createCamera` grew an optional `id` for the same reason a reader needs it: camera ids were invented per call, so
a saved shot's `cameraId` could never resolve in a fresh runtime, and the round trip was only ever a within-one-process
claim. With it, the suite rebuilds a world FROM a save — scene by `sceneId`, camera by `cameraId` — restores, plays,
and compares positions to the original. `centripetal` and `chordal` on the same four points differ by 0.0289 at
arc position 0.5, so the saved `curveType` is not decoration and the test that asserts bit-equality is asserting
something the codec could get wrong.

Measured: `test/cinematicSequence.test.ts` is 74 cases and the package total is **214**
(74 cinematic + 39 controller + 42 save + 30 physics + 29 runtime), `tsc --noEmit` exit 0. Note for whoever reads this row next: the package tsconfig
`include`s `src/**/*` and `exclude`s `test`, so `tsc` is a gate on the shipped source only — the test file's
types are checked by nothing but vitest running. The behavioral probe ran 33 arms over the final source
against an unmutated control that collected **116 with 0 red** on the two-file plane that reads cinematic
code (`test/cinematicSequence.test.ts` + `test/saveSnapshot.test.ts`), each arm's minimum red written down
before measuring, and every arm collected the full population — a mutation that crashes collection is refused by
the harness rather than counted as a catch. Reds: 20, 9, 1, 5, 3, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 8, 1, 2, 3, 1, 8, 8, 1, 3, 4, 1. No arm survived. No arm reddened fewer than claimed.
12 of the 33 arms reddened MORE than written down for them (01-snapshot-aliases-live-sequences: 4→20, 02-shot-objects-aliased-into-save: 2→9, 04-writer-hardcodes-curveType: 3→5, 05-writer-hardcodes-tension: 1→3, 06-writer-hardcodes-closed: 1→2, 13-reader-accepts-one-control-point: 1→2, 23-restore-skips-playhead: 3→8, 25-restore-writes-playing-directly: 1→2, 26-restore-does-not-rollback: 2→3, 28-snapshot-currenttime-always-zero: 3→8, 29-snapshot-active-always-null: 3→8, 32-table-claims-npcs: 3→4).

And the round trip's own control case was a vacuum until an out-of-band script caught it. The case edits
`curveType` inside a save and expects the camera to land somewhere else; the first draft left that save with
`activeSequence: null`, so the restored sequence never entered the single playing slot, no frame placed a camera,
and `toBeGreaterThan(0.001)` was satisfied by a camera still at its origin. What found it was
`curve-fidelity.mjs`, a scratch script written only to supply the prose's numbers: asked to confirm that two
curve types differ by more than 0.001 on the points the suite uses, it refused with 8.881784197001252e-16. That
refusal and the passing test were both correct — `getPointAt` re-maps through the curve's own arc-length table,
so on a near-straight path two schemes sampled at the same ARC fraction land nearly together, and a save whose
only change is a word moves nothing. The case now runs on a path that turns, restores a sequence that is
actually playing, and asserts not "different by some amount" but "exactly where an honest curve of the other
word is" — the same shape of claim the fidelity case makes in the other direction. It also reframed the codec's
promise: `restoreCinematic` rebuilds the curve the save DESCRIBES, which is not the same thing as reproducing
what a live object that had its `curveType` reassigned after `defineCinematic` had called `getLength()` was
actually doing (3.768222e-15 world units apart on the straight path, 0.0214 world units apart on a turning one).

What v118 broke deliberately, and how it was settled. Three of v117's assertions were ABOUT aliasing: one
required `snapshot.sequences.get('seq')` to BE the live object (`toBe`, twice), one read `playing` and
`currentShot` off a snapshot taken before the play, and one required `cinematic` to stay in `blocked` with a
reason naming `THREE.CatmullRomCurve3`. All three were rewritten to say the opposite thing, with the reason for
the reversal in the test comment and this ledger — not deleted. The fourth case, "holds the last frame at the
end", did NOT go red: it read `sequence.playing` through a snapshot taken before the play, and once the snapshot
was a copy the assertion passed for the wrong reason. An accidental green is the failure mode a change like this
produces and the runner cannot see it; that case now reads live state through `cinematicFieldAudit` and keeps the
frozen copy as the control.

And the guard that polices this very table had to be rebuilt. `saveSnapshot.test.ts`'s "nothing in the package's
exported surface yet implements a blocked half" compared `Object.keys(publicSurface)` against a regex over the
blocked field names, so a class method was invisible to it — `cinematicSnapshot` (v117) and `restoreCinematic`
(v118) both passed through while the table they should have forced stayed put. It now enumerates
`ThreeRuntime.prototype`, treats only the two verbs the entity pair uses (`snapshot`/`restore`) as
implementing a half, and requires a `savable` field to have both a writer AND a reader named after it while a
`blocked` field has neither. Its field stems are derived from the field's own spelling, because a hand-written
"which method counts as which field" table would be a second owner of the claim `SAVE_DATA_FEASIBILITY` makes.

What v118 does not do, stated by name: `SaveData` as a whole is still not a file — the envelope is a `Map`,
`JSON.stringify` writes one as `{}`, and `restoreCinematic` refuses that instead of reporting a successful
restore of nothing, so the values survive disk and the container does not. `postProcessing` is still
uninterpreted, `transition` is still only `'cut'`, and `npcs`/`quests`/`player`/`worldState`/`sceneGraph` are
still blocked on systems that do not exist — five rows now, where this cycle started with six. There is still no
Studio surface. Next, in order of cost: one `encodeSaveData`/`decodeSaveData` pair over `SaveData` would make
`savable` mean "survives a disk" rather than "survives a process"; then the four fields that need a subsystem;
then `slopeLimit`/`stepOffset`/`broadphase`/`solverIterations`, all four waiting on the same missing collision
geometry.
### Amendment 119 — v119: a save becomes a file — every `Map` and live `THREE` object leaves the save shape, the entity transform becomes data, and the loader refuses a field it cannot read rather than loading a smaller game

v118 ended with a sentence that this cycle went and tested: `savable`. The word had been earned twice over in
one direction — v115 wrote `snapshotEntity`, v117 wrote `cinematicSnapshot`, v118 wrote `restoreCinematic` —
and never once against a disk. Measured at `4496b22`, with nothing changed, `snapshotEntity` → `JSON.stringify`
→ `JSON.parse` → `restoreEntity` throws `TypeError: snapshot.components is not iterable`, and a rotation comes
back as `_x/_y/_z/_order/isEuler`. Both are the same defect wearing two failure modes: the save shape held
things a file cannot hold. The `Map` fails loudly; the flattened `Euler` fails quietly, restoring an entity that
exists and points at nothing, and the test that had been *requiring* `saved.position` to be
`instanceof THREE.Vector3` was on the side of the bug.

So the rule went into the shape rather than into a reader's tolerance. `SerializedEntity.position`/`scale` are
now `SerializedVector3`, its `rotation` is `SerializedEuler` **with the order**, because three.js composes a
quaternion from it and an order is part of a pose, and its `components` are `[name, component][]`.
`SaveData.entities` and `SerializedCinematic.sequences` — the two collections that were `Map`s — are arrays of
`[key, value]` pairs. Nothing reachable from the new `SaveFile` is a `Map` or a live object, and a test proves
it by walking the closure out of `types.ts` — following every interface a field annotation names, starting at
`SaveFile` — and refusing `: Map<` and `THREE.` anywhere in it. The closure is computed, so a field whose type
drags in a live class reddens the gate instead of joining the save shape unnoticed.

**Which shape is the file's, and which the engine's.** `SaveData` stays the in-memory aggregate — five of its
six fields are blocked and it is never constructed. `SaveFile` is what a disk holds, and the difference is not
cosmetic: a file states what it carries (`carries`, read out of `SAVE_DATA_FEASIBILITY.savable`) and what it
deliberately omits (`doesNotCarry`, the blocked rows with their reasons). That makes `buildSaveFile` and the
audit table one claim with two spellings, which is the failure shape this lane keeps relearning — so the test
reads both out of the shipped table rather than pinning a literal pair.

**A loader that ignores what it cannot read is a loader that deletes.** 44 reader refusals
name the value found: unknown `format` or `version` (both problems printed together, because a file with two
defects should not need two loads to say so), a `carries` entry the runtime cannot fill, a field named as both
carried and withheld, **content under any blocked name**, a `Map`/class instance/`NaN` anywhere inside with its
path, a pair keyed differently from the record under it, a target scene that does not exist, a live entity id.
The blocked-content refusal is the one with teeth: a save that arrives carrying three NPCs is a save whose
owner believes those NPCs will come back, and the honest answer is a refusal, not a smaller game.

**One writer's walk, one reader's walk, no exemptions.** `assertDiskSafe` runs over the finished file in
`buildSaveFile` as well as over what `loadSaveFile` was handed, so the producer cannot write what its own
reader refuses — and it catches values no per-record writer looks at: a live `layers` set to `NaN` after
registration is refused as `file.entities[0][1].layers holds NaN`. `eulerFromData` refuses an order outside
`EULER_ORDERS` because three.js would otherwise keep composing from the previous one, and the case asserts
that a `YXZ` save and an `XYZ` save land on **different quaternions** — the control that shows the saved order
is not decoration.

**Atomic where it can be, honest where it cannot.** Entity ids are all pre-checked before anything is written;
inserts are rolled back by removing what the call added; `restoreCinematic` rolls back its own registry. Two
things a rollback cannot reach, both stated in the thrown message rather than glossed: the event log has
already spoken, and sequences restored before an entity failure stay registered because this runtime still has
no unregister. That is v117's hole showing up in v119's boundary — a reason to build the unregister, not a
reason to claim atomicity.

Measured: `test/saveSnapshot.test.ts` is 56 cases and `test/cinematicSequence.test.ts` 74,
package total **228** (56 save + 39 controller + 74 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src` — the package's tsconfig
`exclude`s `test`, so that gate says nothing about the test file and the record says so too. The probe ran
23 arms over the final source against an unmutated control that collected **130 with 0 red** on the
two-file plane that reads save code; every arm collected the full population (a mutation that crashes
collection is refused, not counted), and each arm's minimum red was written down before measuring. Reds:
1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 1, 1, 10. No arm survived. No arm reddened fewer than claimed. 2 of the 23 arms reddened MORE than written down for them (21-producer-invents-a-carried-field: 1→5, 24-table-claims-npcs-savable: 2→10).

Three measurement errors from this cycle belong in the record. The probe's first draft carried an arm whose
two-line anchor did not match the shipped indentation — the anchor gate refused the run before it produced a
number, which is the only reason a bad anchor cannot become a fake "caught". One new case asserted
`rotation.quaternion.z` on a bare `Euler`, where that reference is `undefined` until an `Object3D` wires it,
so the assertion was about the right mechanism and the wrong object. And two test regexes were written against
messages I had intended rather than shipped; one was fixed in the test, the other — "which is the shape a file
writes as `{}`" — was weak prose about the real mechanism and got rewritten to name `JSON.stringify`.

What v119 does not do, stated by name: it writes no bytes (a `writeSaveFile`/`readSaveFile` pair over an
injected `FsWriteLike` is the next unit, and it needs no new shape); it cannot say which scene an entity came
from, because `SaveData.sceneGraph` is blocked and `SerializedEntity` names no scene — so a file carries one
scene's entities and the caller names where they land, while sequences carry their own scene from v118;
rollback does not reach the event log or a half-completed load; `postProcessing`, every transition but the
cut, and the Studio surface are unchanged. Next, in order: the byte writer, then `npcs`/`quests`/`player`/
`worldState`, then collision geometry — which is also what `slopeLimit`, `stepOffset`, `broadphase` and
`solverIterations` are all waiting on.
### Amendment 120 — v120: the save file gets bytes — an injected storage seam, three kinds of "I cannot read this" kept apart, and one confinement rule with a single owner

v119's record ended with the sentence it had earned: the shape survives a JSON write, and no code writes
bytes. v120 is the writer and the reader, and the interesting decisions are about what a disk makes possible
that memory does not: a file that is not there, a file that is empty, a file whose bytes were edited after
being written, and a save whose name says more than the store should let it.

**The seam is injected, and small.** `packages/three-runtime/src/saveStore.ts` defines `FsLike` as exactly
`writeFileSync`/`readFileSync`/`existsSync` and `SaveStore` as `write`/`read`/`exists` plus a `kind` the caller
never guesses. `createMemorySaveStore()` is the test-and-headless implementation;
`createFsSaveStore(fs, root)` wraps any `FsLike` — Node's `fs`, or a `localStorage` shim of the shape the M2
lane already uses for durable agent memory (§26), which is why the runtime keeps reaching for no filesystem of
its own. The package's dependency list is still `three` alone.

**`null` means "absent", and nothing else.** If `read` returned `''` for a path that does not exist, every
"there is no save here" would arrive as "the save here is corrupt", and the caller would go looking for
damage that was never there. So `readSaveFile` has three branches and the suite has three cases: no file at
that path (naming the path and the store kind), bytes that are not JSON (quoting the parser, and calling a
whitespace-only file `empty` rather than a syntax error), and a file that parses but describes something this
runtime cannot load — the last wrapped so `loadSaveFile`'s own refusal keeps its voice with the path added in
front: a door should not need to be read twice to say which file it is talking about.

**One rule, one owner, both stores.** `resolveSavePath` rejects absolute forms (`/x`, `C:\x`), `..`, `.` and
empty segments; the memory store and the fs store call it, and one case loops the same six bad names through
both so a divergence between them cannot live quietly. The fs store adds its own construction-time check —
a `root` containing `..` is refused when the store is made, not when a path tries to escape it later — and
because both halves are in place, the join itself does not re-check what cannot happen. That is the
converse of the mistake this lane keeps making: a rule stored twice drifts, and the drift is found by a
mutation that nobody predicted.

**Bytes are not trusted because this process wrote them.** The reader re-parses whatever comes back and runs
it through every v119 refusal, and the case proves it: copy a real save, bolt `"npcs": [["npc-1", {}]]` onto
it, and the read refuses by name instead of loading a game that quietly lost its NPCs. Another case proves the
file is not a scratch buffer: two runtimes read the same path into two scenes and agree, a second read into
the first runtime hits the live-id refusal, and the stored bytes are equal to what they were before either
attempt — a failed load rewrote nothing.

**What a rollback still cannot reach is said out loud.** `writeSaveFile` and `readSaveFile` inherit v119's
boundary: a load whose sequence half lands and entity half fails removes the entities and leaves the
sequences, because there is still no unregister, and the thrown message names both halves. A storage seam did
not fix that hole; it made it reachable from disk, which is where a user would meet it.

Measured: `test/saveSnapshot.test.ts` is 63 cases and `test/cinematicSequence.test.ts` 74,
package total **235** (63 save + 39 controller + 74 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src` (this package's tsconfig
excludes `test/`, so the type gate is not evidence about the test file). The probe ran 15 arms over
BOTH shipped files — the runtime's methods and the seam itself — against an unmutated control of **137
collected / 0 red**, each arm's minimum red written down first, every arm collecting the full population, and
both files restored byte-for-byte afterwards. Reds: 1, 1, 1, 1, 2, 2, 1, 4, 1, 2, 2, 2, 2, 2, 2. No arm survived. No arm reddened fewer than claimed.
9 of the 15 arms reddened MORE than written down for them (05-load-refusal-loses-the-path: 1→2, 06-write-report-claims-zero-bytes: 1→2, 08-file-written-as-a-stringified-object: 1→4, 10-escaping-root-accepted: 1→2, 11-root-keeps-its-trailing-separator: 1→2, 12-absent-path-reads-through-the-fs: 1→2, 13-memory-store-skips-path-rules: 1→2, 14-dot-segments-accepted: 1→2, 15-fs-store-escapes-its-root: 1→2).

Three harness failures preceded that run, and each is a bug in the script rather than a fact about the code:
the probe is a `.mjs` and its first draft carried TypeScript annotations (`new Map<string, string>`, a
non-null `!`) that are syntax errors at load; one anchor was written between backticks because the production
line it quotes contains backticks, so it looked for a quoted-then-backticked string and matched nothing; and
one two-line anchor was indented as though its `if` were nested deeper than it is. The `--anchors` gate and
the control's population floor refused all three before a byte was rewritten — the last of them caught the
control collecting 137 where the script's floor claimed 140, which is a wrong guess about the plane, not a
wrong result about the code.

What v120 does not do, stated by name: no delete, no list, no versioning, no atomic write-then-rename and no
compression or encryption — a half-written file is refused, which is a diagnosis and not a repair. An entity
record still names no scene, so a file is written for one scene and read back into a scene the caller picks;
the field that would carry the mapping (`SaveData.sceneGraph`) is still blocked, along with `npcs`, `quests`,
`player` and `worldState`. Next: `removeSequence`/unregister, which is what keeps a half-failed load from
being fully reversible and what makes "choose a new id" the only answer `defineCinematic` can give to a
duplicate; then the four blocked halves that need a subsystem; then collision geometry, which is what
`slopeLimit`, `stepOffset`, `broadphase` and `solverIterations` are all waiting on.
### Amendment 121 — v121: the cinematic registry can give an id back — `removeCinematic`, a load that now rolls back both halves, and two refusal sentences that were lying about what this runtime can do

Three grants carried the same confession in different words. v117 made `defineCinematic` refuse a taken id
with "this runtime has no way to unregister one — choose a new id". v119 wrote into `loadSaveFile`'s failure
message that the sequences restored before a failing entity pass "stay registered: this runtime has no way to
unregister a sequence". v120 restated it as a property of the disk path, and its README listed it under "what
this still does NOT honor". None of that was a design choice; it was the shape of a `Map` with no delete. v121
changes the shape, and the interesting work is what the change costs: two thrown messages that had become
false, and one test that had been written to prove the limitation and now has to say the opposite.

`removeCinematic(id)` returns `true` when it un-registered something and `false` when nothing was registered
under that id — the latter is `stopCinematic`'s existing shape, because "there was nothing to remove" is a fact
a caller may act on, not an error. It **throws on a playing sequence**: `playing` belongs to
`playCinematic`/`stopCinematic`, and a removal that stopped a cutscene to get its way would emit a
`cinematicStopped` nobody asked for and leave a listener to explain a stop that never happened. The case asserts
the absence of that event, not just the presence of the exception. `clearCinematics()` takes the same position
at batch scale: it removes the idle sequences, returns `{removed, stillPlaying}`, and leaves the playing one
alone rather than deciding for the caller.

With removal, the load becomes what v119 said it could not be. `loadSaveFile`'s catch stops and then removes
each sequence the call had registered, so a failure anywhere leaves neither half behind, and the message
changed to match: "the N entity(ies) and the M sequence(s) this load had registered were removed again; a load
is all or nothing". The test that pinned the old boundary — the one asserting `cinematicFieldAudit('seq')`
still answered after a failed load — was flipped in place to `toBe(undefined)`, with the reason in a comment
rather than deleted, because a removed assertion is invisible and a reversed one is a record.

And a stale refusal message is a lie with a timestamp, so the retirement is guarded rather than trusted: a case
reads `src/threeRuntime.ts`, keeps only the lines containing `throw new Error(`, and fails if any of them still
says "no way to unregister" — while the sentence is allowed to survive inside a docstring, where it is history
rather than an instruction. That distinction (prose may remember, an error may not) is the reusable part of
this grant.

Measured: `test/cinematicSequence.test.ts` 78 cases, `test/saveSnapshot.test.ts` 64, package
total **240** (64 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src`. The probe ran 8 arms over the
final source against an unmutated control of **142 collected / 0 red**, each arm's minimum red written down
before measuring, every arm collecting the full population, and the source restored byte-for-byte afterwards.
Reds: 2, 1, 1, 2, 1, 1, 1, 1. No arm survived. No arm reddened fewer than claimed. 2 of the 8 arms reddened MORE than written down for them (01-removing-a-playing-sequence-is-allowed: 1→2, 04-load-rollback-leaves-sequences-registered: 1→2).

What v121 does not do, stated by name: removing a sequence does not move the camera back — `updateCinematics`
owns the pose and there is no undo for a written position; removal does not erase the event log, which is why
`cinematicRemoved` exists rather than a rewind; the store still has no `deleteSaveFile`, no list and no atomic
rename; `npcs`/`quests`/`player`/`worldState`/`sceneGraph` remain blocked on systems that do not exist; an
entity record still carries no scene address, which is `SaveData`'s problem, not this one's. Next, in order:
`deleteSaveFile` on the seam (removal made a whole-game load reversible, so the file layer no longer has an
excuse for not being able to take a save back), then the four blocked halves that need a subsystem, then
collision geometry for `slopeLimit`/`stepOffset`/`broadphase`/`solverIterations`.
### Amendment 122 — v122: the store takes a save back — `deleteSaveFile`, a no-op that answers `false`, and an injected host that cannot delete saying so rather than succeeding

v120 built the storage seam and wrote its own limits into the record: "no delete, no list and no atomic
rename". v121 made the first of those safe — once a failed load could take back the sequences it had restored,
the only thing left that could outlive a decision to discard it was the file itself. v122 deletes the last
sentence by deleting the file, and the two decisions it had to make are the two this lane keeps being asked.

**What a no-op means.** `delete(path)` answers `false` when the path held nothing. That is `stopCinematic`'s
answer and `removeCinematic`'s answer, and the reason all three look alike is that "there was nothing there"
is a question about the world with a boolean answer, not a request that failed. A throw would teach every caller
to wrap an idempotent operation in try/catch, and an idempotent operation that cannot be retried silently is a
worse API than one that can.

**What a missing capability means.** `FsLike` grows `unlinkSync` as an OPTIONAL method — the seam exists so a
`localStorage`-shaped host can implement it (v120's whole reason for existing), and requiring the method would
have priced those hosts out. An fs store built over a host that cannot delete therefore **throws**, naming both
the method and the fact that the save is still there, and the case reads the bytes back afterwards to prove the
throw is true. The rejected alternatives are worth writing down because each is a mistake this lane has already
paid for: returning `true` (the lie), calling `fs.unlinkSync` and letting a `TypeError` escape (a message about
the host's internals rather than the caller's problem — v118's `getLength()` lesson), or making the method
required (a shim that cannot build a store at all).

**Confinement and agreement.** The fs store resolves the path through `at()`, which calls `resolveSavePath`,
before touching the host, so `delete('../outside.json')` is refused and the case asserts `unlinkSync` was never
called — a security boundary that fires after the effect is not a boundary. The other half is the pair the seam
has to keep consistent: after a successful delete, `readSaveFile` on the same path produces v120's "no save
file at" refusal, so `delete` and `read` describe one world rather than two opinions about it.

Runtime side: `deleteSaveFile(path)` → `{path, store, removed}`, emits `saveFileDeleted`, refuses a runtime
with no store, and — the part worth a test on its own — leaves the live scene exactly as it was. Deleting a save
is not resetting a game; `clearCinematics`/`removeEntity` are the in-memory tools and they are still separate
on purpose.

Measured: `test/saveSnapshot.test.ts` is 69 cases and `test/cinematicSequence.test.ts` 78,
package total **245** (69 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src`. The probe ran 7 arms
across the seam and the runtime method against an unmutated control of **147 collected / 0 red**, with each
arm's minimum red written down beforehand, every arm collecting the full population, and both files restored
byte-for-byte. Reds: 1, 1, 1, 1, 1, 2, 2. No arm survived. No arm reddened fewer than claimed. 2 of the 7 arms reddened MORE than written down for them (06-runtime-delete-without-a-store-pretends: 1→2, 07-delete-event-renamed: 1→2).

What v122 does not do, stated by name: the store still cannot list what it holds and has no atomic rename, so
there is no "most recent save" and a half-written file is refused rather than repaired; deleting a file does
not undo anything a load installed; `deleteSaveFile` trusts `existsSync`, and a host that lies about existence
earns a `false` it did not deserve. Next, in order: `listSaves()` — the last of v120's three named gaps and the
first thing a save picker needs — then `npcs`/`quests`/`player`/`worldState`, then collision geometry, which is
also what `slopeLimit`, `stepOffset`, `broadphase` and `solverIterations` are waiting on.
### Amendment 123 — v123: the store says what it holds — `listSaveFiles`, a newest that is the file's own claim, and a corrupt member that does not get to own the collection

v120 wrote its own gaps into the record: no delete, no list, no atomic rename. v122 took the delete; v123
takes the list, and with it the first question any save screen asks — which of these do I continue from. The
grant is small in surface and pointed in two decisions.

**A listing is names, and `[]` is a claim only some stores may make.** `SaveStore.list()` returns sorted,
namespace-relative names and reads no bytes at all: a fake host counts its own `readFileSync` calls and the case
asserts the menu came back with none, because a listing that costs O(total bytes) is the wrong seam. The memory
store answers `[]` when it holds nothing — that is a fact. An fs store built over a host without `readdirSync`
and `statSync` **throws**, naming both missing methods, because answering `[]` there would be a claim about a
world the store cannot see. The refusal is checked all the way through `listSaveFiles` and `latestSaveFile`: a
capability gap that gets caught into an empty list is the same lie v122 refused at delete time.

**The newest is whatever the files claim, because this runtime has no wall clock.** `latestSaveFile()` orders by
the `savedAt` inside each file, not by time now: no timezone, no skew, no remembered "later than last time"
state, and the docstring says plainly that a made-up timestamp wins honestly. Ties break by path and are
counted in `ties`, so an arbitrary choice is at least reported. This is the same rule that made
`buildSaveFile` demand the caller supply `savedAt` in v120 — the runtime that will not invent a clock also
will not borrow one to sort by.

**A save the runtime cannot understand is answered, not swallowed and not fatal.** Five reasons are distinct
in `unreadable`: not JSON (the parser's own complaint quoted), JSON but an array, a foreign `format`, a
`version` this runtime does not read ("version is 2, and this runtime reads exactly 1"), and a `savedAt` that is
not a finite number to order by. Each is asserted by exact text, because the reporting is the feature — the two
wrong designs were the exception escaping (a menu that dies on one bad file) and the silent skip (a menu that
quietly lost a save).

Pair agreement, third time: v119's loader and v122's delete each had to keep their word to the other methods;
here, taking the newest away moves `latestSaveFile` to the next candidate, which is what makes the three
methods one store rather than three opinions.

Measured: `test/saveSnapshot.test.ts` is 76 cases and `test/cinematicSequence.test.ts` 78,
package total **252** (76 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src`. The probe ran 11 arms
across the seam and the runtime against an unmutated control of **154 collected / 0 red**, each arm's
minimum red written down beforehand, every arm collecting the full population, both files restored
byte-for-byte. Reds: 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2. No arm survived. No arm reddened fewer than claimed. 10 of the 11 arms reddened MORE than written down for them (01-memory-list-forgets-to-sort: 1→2, 03-latest-picks-the-oldest: 1→2, 04-tie-break-flipped: 1→2, 05-ties-always-one: 1→2, 06-version-not-checked: 1→2, 07-format-not-checked: 1→2, 08-savedAt-not-checked: 1→2, 09-unreadable-not-reported: 1→2, 10-listing-without-a-store-works-anyway: 1→2, 11-latest-without-a-store-works-anyway: 1→2).

What v123 does not do, stated by name: still no atomic rename, so `writeSaveFile` can leave a half-written file
in the listing (refused with a reason, never repaired); no metadata is consulted, so ordering is only ever what
a file claims about itself; listing does not filter by scene, playhead or version, so "newest" is not "the one
you meant". Next: the last of v120's three gaps — a temp-write-and-rename, which needs `renameSync` on the
injected host and a decision about what to report when the rename fails halfway — then `npcs`/`quests`/
`player`/`worldState`, then collision geometry, which is what `slopeLimit`, `stepOffset`, `broadphase` and
`solverIterations` all wait on.
### Amendment 124 — v124: the save is written atomically — a temp file and a rename, a capability asked for before any byte moves, and a failure that reports the debris it left

v120 closed its own record with three gaps: no delete, no list, no atomic rename. v122 took the delete, v123 the
list; this takes the rename, and it is the only one of the three where a partial performance is possible. A save
screen that lists "unreadable" beside the file the player just wrote has already lost the game, however honest
its refusal.

`SaveStore.writeAtomic(path, contents)` writes `<path>.tmp` and renames it onto the real name. `FsLike` grows
its third optional method, `renameSync`, next to `unlinkSync`, `readdirSync` and `statSync` — the seam stays
implementable by a browser shim, and the shim that cannot rename is told so in a sentence that says no bytes
moved. That ordering is the grant's real content: the capability is checked **before** anything is written, and
the case asserts not just the throw but that the host recorded no operations whatsoever and its tree gained no
key. The rejected alternative — try, fail halfway, then explain a `.tmp` to `list()` — is exactly the state v123
had to build an `unreadable` report for.

When the rename itself fails, the assertion that matters is about the file that was already there: the old bytes
still read back unchanged, the temp has been unlinked, and the operations log proves the unlink happened. If the
cleanup fails too, the message quotes the leftover path (`it is left at "x.json.tmp"`) rather than saying
"cleanup failed", because the reader's next action is a delete of that name — and the listing does show it, so
the message is checked against the world it describes.

The runtime goes through the same door, and the test says so at the runtime's boundary: `writeSaveFile` asserts
the host saw `rename:saves/root/slot.json.tmp->saves/root/slot.json`. That is the shape of the lesson v118
learned when a guard only a regex could see was testing the author rather than the feature — a store whose
atomic path is perfect can still be bypassed by the method that calls it, and nothing in the store's own suite
would notice.

The memory store implements `writeAtomic` as one map mutation and the docstring narrows the claim: atomic with
respect to this process, not a durability promise, because a store that cannot outlive the tab has no window to
be torn about. Plain `write` is left alone — still direct, still used by tests that want a file to appear without
a rename — and one case asserts that difference in the operations log rather than in a comment.

Measured: `test/saveSnapshot.test.ts` is 82 cases and `test/cinematicSequence.test.ts` 78,
package total **258** (82 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src`. The probe ran 6 arms
against a control of **160 collected / 0 red** and, for the first time in this lane, its predictions were
written as **case names** rather than red counts — No arm survived. No arm reddened fewer than claimed. 3 of the 6 arms reddened MORE than written down for them (02-rename-replaced-by-a-second-write: 2→4, 05-real-file-overwritten-before-rename: 1→2, 06-runtime-bypasses-the-atomic-path: 1→3).
Both files were restored byte-for-byte afterwards.

What v124 does not do, stated by name: there is no `fsync`, so a power loss between the temp write and the
rename can lose the new save (the old one survives — that is the promise, and losing the new one silently is
still possible); a host whose `renameSync` quietly copies across devices is outside what this package can
detect; a leftover temp from a double failure is reported and never swept; and the five blocked `SaveData`
fields, the scene address an entity record does not carry, and any Studio surface are untouched. Next: either
give `FsLike` a durability verb and say what a shim owes, or stop widening the file layer and build the
subsystems — `npcs`, `quests`, `player`, `worldState` — whose absence has been the honest part of this table
since v115.
### Amendment 125 — v125: durability is chosen rather than assumed — an optional `flushSync`, a memory store that refuses the word, and a rename whose own durability is named as missing

v124 wrote its own remaining gap into the record: no `fsync`, so a power loss between the temp write and the
rename can still lose the save that looks completed. The task this cycle set was to *decide* the boundary, not
to widen it silently, and two options were on the table: give `FsLike` a flush verb and refuse when the host
lacks one, or leave the seam alone and stamp a `flushed: false` claim into the file itself.

The refusal won, and the reason is the injection. `FsLike` exists so a `localStorage` object can back a save
file (v120's whole point); a browser shim has no device to flush, so a `flushed: false` field would be
recording a fact every caller already knew and asking them to parse it, while an optional method plus a hard
refusal makes the limitation arrive at the moment it matters — the call that asked for it. So
`writeAtomic(path, contents, durable)` orders write-temp → **flush-temp** → rename, the memory store rejects
`durable` outright (`there is no device behind it to flush`), an fs host without `flushSync` is refused before
a single byte moves, and the case for each asserts that the host recorded **zero operations** afterwards.

`writeSaveFile(..., { durable })` reports `durable`, and that field earns its place by varying: `false` is the
default, not a failure — the caller asked for atomic, not durable — and `true` appears only on a path where the
flush really ran, which the success case checks by counting exactly one `flush:` entry in the host's own log.
A report field that carries the same value on every path is a field nobody consults; this lane learned that in
v118 while auditing a cinematic shape, and it is the same test applied to a byte-level claim.

What is deliberately **not** claimed is the interesting half. The rename is not flushed: durability of a
directory entry needs a directory handle, and this seam has paths. The docstring says so, the ROADMAP cell
says so, and there is no `flushSync('.')` in the code pretending otherwise — a durability claim nobody can
check is worse than a named gap, because the next reader will trust it. A failed flush rides the same failure
path as a failed rename: the old bytes stay, the temp is unlinked, and the message says "flushing and
renaming" so the reader can tell which half broke.

Measured: `test/saveSnapshot.test.ts` is 86 cases and `test/cinematicSequence.test.ts` 78,
package total **262** (86 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src`. The probe ran 5 arms
over the seam and the runtime against a control of **164 collected / 0 red**, predicting **case names**
rather than red counts, and both files were restored byte-for-byte. Reds: 2, 3, 3, 2, 3. No arm survived.
No arm reddened fewer than claimed. 5 of the 5 arms reddened MORE than written down for them (01-runtime-ignores-the-durable-flag: 1→2, 02-flush-never-issued: 1→3, 03-flush-capability-not-checked: 1→3, 04-memory-store-accepts-a-durability-promise: 1→2, 05-flush-failure-reported-as-a-rename: 1→3).

What v125 does not do, stated by name: the rename is unflushed (the missing verb needs a handle, not a path);
a host whose `flushSync` is a no-op wearing a name cannot be detected from here; a leftover temp from a double
failure is named and listed until someone deletes it; and the five blocked `SaveData` halves, the camera a
removal leaves behind and the absent Studio surface are exactly where v124 left them. Next: stop circling the
file layer and build one of the subsystems — `npcs`, `quests`, `player`, `worldState` are four rows of the
audit table that have been honestly blocked since v115, and the save format is now good enough that filling one
in would be worth a player's time.
### Amendment 126 — v126: the debris gets a sweeper — `sweepTempFiles`, deleting through the delete that already existed

v125 wrote its own leftover into the record: when a rename fails and the cleanup fails too, the message names a
`.tmp` that `listSaveFiles` will keep showing and no reader can load. Naming was the honest half; the other
half was this grant — a sweeper that takes debris back without inventing a second way to delete.

`SAVE_TEMP_SUFFIX` is exported from the seam and used by both sides: the atomic writer that produces the temp
and the sweeper that looks for one cannot disagree about a name by spelling it differently. That is a
load-bearing claim, not tidiness — the probe's second arm changes only the sweeper's filter to `.bak`, and the
suite goes red, which is what proves the shared constant carries the rule.

`sweepTempFiles()` returns `{store, removed, kept}` and removes each candidate through `deleteSaveFile`, the
public path, so path confinement, the "`false` means there was nothing there" answer, and the
`saveFileDeleted` event keep one owner. The alternative — calling `fs.unlinkSync` on a path the sweeper
assembled itself — would have been a second deletion rule with its own untested edge; the first probe arm is
exactly that bypass, and it is caught by an assertion on the event bus rather than on a return value.

`kept` is the honesty about a listing being a snapshot: a name that `list()` returned and `delete` could not
find is reported rather than quietly counted as removed. The case for it uses a stub store whose `delete`
answers false — a legitimate way to reproduce a race a real host would produce by timing, which this suite has
learned not to rely on. And the sweep's restraint is asserted as strongly as its action: the real save still
holds its own bytes afterwards, a second sweep answers with two empty lists, and a runtime with no store refuses
in the same sentence shape as every other file method since v120.

Measured: `test/saveSnapshot.test.ts` is 89 cases and `test/cinematicSequence.test.ts` 78,
package total **265** (89 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src`. The probe ran 5 arms
against a control of **167 collected / 0 red**, predicting case names: 1, 2, 1, 1, 1. No arm survived.
No arm reddened fewer than claimed. 1 of the 5 arms reddened MORE than written down for them (02-suffix-filter-blind: 1→2).

What v126 does not do, stated by name: it filters by suffix alone, so a save a player legitimately named
`ending.tmp` is debris-shaped and will be taken — the seam has no metadata to tell them apart, and inventing a
marker file to solve that would be a larger lie than the one it fixes; nothing schedules a sweep, so leftovers
wait until asked; a store whose `delete` throws propagates, because a sweeper should not decide which failures
are acceptable; and the rename-flush gap, the four blocked `SaveData` halves and the absent Studio surface are
exactly where v125 left them. Next: fill in one blocked half — `npcs`, which the audit table has been honestly
reporting as waiting on a system that does not exist since v115 — or take on the directory handle, which is
the only file-layer claim left that cannot be checked from here.
### Amendment 127 — v127: a file's claims get an answer — `diagnoseSaveFile`, and the silent direction is the one that mattered

v119 made a `SaveFile` state its own coverage (`carries`, `doesNotCarry`), and v123 let a caller enumerate the
files a store holds. Put those together and a question appears that nobody had answered: a file written by an
older runtime disagrees with the feasibility table that exists now, and until the load is attempted there is no
way to know whether the outcome will be a refusal, a clean read, or — the bad one — a successful load that
quietly restores less than the player expects. `diagnoseSaveFile(path)` answers that without loading, and the
grant is worth writing down mainly for which half turned out to be new.

The obvious direction was already covered: a file that claims to carry a field this build cannot read is
refused by `loadSaveFile`, and has been since v119, with the reason named. The **other** direction had no
voice at all — a file that omits a field this build *can* write. That load succeeds. It is not broken; it
predates a capability. `diagnoseSaveFile` reports it as a problem without marking the file unloadable
(`loadable` stays `true`), because the honest answer to "can I open this save" is yes, and the honest answer to
"will what I get be everything I could now have" is no. `readableNowButNotCarried` is the field that carries
that distinction, and `problems` keeps both kinds in a fixed order — asserted as an array rather than by
substring, because a report whose items can be reshuffled unnoticed is a report whose meaning lives in the
reader.

The verdict is tied to the operation it predicts, and that tie is the part with teeth. `loadable` is computed
from the same `SAVE_DATA_FEASIBILITY` the loader consults, and the case does not stop at comparing strings: for
the file that carries an unreadable field it then calls `loadSaveFile` and asserts the refusal arrives for the
same reason, and for the healthy file it asserts the load really does restore the entity. A diagnosis free to
disagree with the load would be an opinion about the runtime rather than a report from it — the same failure
this lane keeps meeting from the other side, a table that describes capabilities nobody implements.

Refusals are separated the way the file layer has learned to separate them: no file at that path, bytes that
are not JSON (with the parser's complaint quoted), and no store at all on the runtime each get their own
sentence; a file with a foreign `format` **and** an unread `version` gets both problems in one pass rather than
one per attempt.

Measured: `test/saveSnapshot.test.ts` is 93 cases and `test/cinematicSequence.test.ts` 78,
package total **269** (93 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src`. The probe ran 6 arms
against a control of **171 collected / 0 red**, predicting case names: 1, 1, 1, 1, 1, 2. No arm survived.
No arm reddened fewer than claimed. 1 of the 6 arms reddened MORE than written down for them (06-unreadable-filter-reversed: 1→2).

What v127 does not do, stated by name: it reads one named file — there is no pass over `listSaves()` that
returns which saves can actually be opened, which is the thing a save picker wants; it checks the file's
claims and not its content, so a file that claims `entities` and carries an empty list is loadable and mostly
empty, because that is exactly what the writer could produce; and a format change that leaves `version` at 1
while changing meaning is beyond any check this file offers, since the version is the only promise a file makes
about itself. Next: the sweep over the listing, or the blocked halves themselves — `npcs`, `quests`, `player`,
`worldState` — which is the only way `readableNowButNotCarried` stops being a message about files that have not
been written yet.
### Amendment 128 — v128: the listing gets a verdict of its own — `diagnoseSaveFiles`, three buckets that must add up

v127 could tell you whether one named save would load. A save screen does not have a named save; it has a
store, and the question is "which of these can I open". v128 answers that by delegating — `diagnoseSaveFiles()`
walks `list()` and calls the existing `diagnoseSaveFile` per name — and by what it returns:
`{store, total, loadable, unloadable, unreadable}`, with the case asserting that `total` is the three buckets
summed and that no name appears in more than one of them.

The interesting pressure is the temptation to merge buckets. `{ok, bad}` is the natural shorthand, and it
would have been a lie by conflation: "this file's claims do not match this runtime" and "this file's bytes
cannot be read at all" call for different user actions — pick another slot, versus the save is damaged.
Keeping them apart is why `unreadable` is its own field and why the probe includes an arm that swallows it:
that arm reddens the partition case and nothing else, which is the evidence that the separation is load-bearing
rather than decorative.

Delegating rather than re-implementing is the other half of the grant's shape, and it is the part the probe
measures. Four arms — collapse the two verdict buckets, invert the choice, drop the no-store refusal, swallow
the unreadable push — each break exactly one case, with **zero unexpected reds** across the run. The three
previous cycles in this lane over-predicted because single claims were asserted from several angles at once;
here the claim has one owner and one witness, and the prediction accuracy is the proof of that, not a lucky
night.

Measured: `test/saveSnapshot.test.ts` is 96 cases and `test/cinematicSequence.test.ts` 78,
package total **272** (96 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src`; probe 4 arms against
a control of **174 collected / 0 red**, predicting case names. No arm survived. No arm reddened fewer than claimed.
No arm over-predicted. Both fixes landed alongside this grant stay verified: the suite runs green in a CRLF working
copy (5d8a8b8, witnessed at 47823a4), and the diagnosis can no longer disagree with the load (48cf01f).

What v128 does not do, stated by name: it surveys nothing it cannot list, so an fs host without browsing still
cannot answer "which saves exist"; `unreadable` carries a prose `why` rather than a structured reason, so a
caller cannot branch on the difference without string matching — named here as the next grant's first job; and
nothing is repaired, migrated or rewritten by a survey. The four blocked `SaveData` halves are unchanged and
still the reason `readableNowButNotCarried` has anything to say.

### Amendment 107, addendum (M2 v107 re-measured) �� the record's correction claimed EBUSY 6/6, but re-measurement shows status 0 6/6; the host fault is intermittent, not absolute

Amendment 107's record (line 4757) states: e-measured for this record: spawnSync fails with EBUSY 6 times out of 6, and syncApiIsBroken() returns true �� so the line prints BROKEN. Re-measured for amendment 130's record at cf50329: spawnSync(process.execPath, ['-e', 'process.exit(0)']) returns status 0 with no error, 6/6, and syncApiIsBroken() returns false. The identity line prints nswers (status 0, no error) in both worktree and isolated sweeps.

The host fault is **intermittent/plane-dependent**, not absolute �� which is exactly why v107's identity line exists: it reports the state of this run, so a reader can tell which world the run stands in. Both the original commit's prediction (nswers...) and the record's correction (BROKEN...) were absolute claims; the truth is conditional.

### Amendment 129 (M5 v129, three-runtime) — the survey reports WHY a save could not be read, as a field not a sentence

The `diagnoseSaveFiles` method previously returned `{ path, why }` for unreadable saves, where `why` was a free-form error sentence. A caller that wanted to branch — pick another slot, or tell the player "this save is damaged" — had to string-match that sentence, which is the fragility amendments 118 and 122 kept naming. v129 replaces the prose with a discriminated field:

```ts
unreadable: { path: string; reason: 'not-json' | 'listed-then-missing'; why: string }[]
```

The `reason` is derived from **which check failed**, not from the error message wording:

- `'not-json'` — the store returned bytes but `JSON.parse` threw (the only throw `diagnoseSaveFile` can raise for bytes that exist).
- `'listed-then-missing'` — the store's `list()` returned the name but `read()` returned `null` (the name went stale between listing and the survey's own read).

The survey does its own read (`this.storage.read(path)`) rather than delegating to `diagnoseSaveFile`, so it observes both situations itself. A caller can now branch on `reason` without ever string-matching a message, and the `why` field remains as the human-readable detail.

Test coverage added in the same commit:
- `a name the store lists but cannot return is reported as listed-then-missing` — a stub `SaveStore` whose `list()` returns `['gone.json']` and `read()` returns `null`; the survey reports `reason: 'listed-then-missing'`.
- The existing atomic-save case now asserts `report.unreadable.map(e => e.reason) === ['not-json']` for the junk file.

Measured at `ca3932d`:
- `tsc --noEmit` exit 0 on `packages/three-runtime/src`
- Vitest: **273 tests collected, 0 failed** (2 new cases for the two reasons, plus existing 271)
- The two new cases exercise both branches of the new `reason` field.

DEBT recorded in the commit and carried here:
1. **Behavioural probe not run.** The harness for the mutation probe (which would mutate the `reason` field and assert the test catches it) failed to apply due to CRLF line-ending conflicts in the working copy — a two-line anchor never matched, and a heredoc patch produced a syntax error. The code change is not evidence for a mutation claim without the probe; this record notes the gap.
2. **No ADR grant was added at commit time.** The ledger stood at 123 headings then; it now stands at 128 (amendments 106–128 landed in the docs/evidence lane). This record writes the owed grant so the ledger's newest-grant refusal in `table-recount-proof.mjs` §7 does not fire when the next grant (130, already written by the evidence lane) is processed.

The record for amendment 129 is written in the cycle that followed the commit, not by the commit's author — the rule this stack keeps finding is that a citation in a commit message is not the record, and the record is the only thing that retires the debt (amendment 90, 107).s not fire spuriously when 129 is finally written.

### Amendment 130 (M2 v130, docs/evidence) �� two rows were red only on the plane where git works, so their dead assertions are repaired on the plane that can see them

Two rows in the population �� cwd-axis-proof.mjs and 	imeout-axis-proof.mjs �� carried assertions that were TRUE in v83 but went false when three rows landed (v91�Cv94) that never load the shipped build at all. On the ISOLATED plane those rows die early at git ls-tree exit 128, so the false assertions were never exercised; the 42-red standing population hid them. On the WORKTREE plane git answers, the rows reach their own assertions, and both failed:

- cwd-axis ��1 pinned childRelative === total (70 �� 73) but three rows have no build edge; the census now names the three (asks-axis, plane-axis, table-recount) instead of letting a reader round 70/73 up to 73/73. A code-position scan also asserts no non-child-cwd row smuggles a build in through its own location (a different reader than the text-scan distRelative check).
- timeout-axis ��2 required every budget declaration to cite a measurement in its header; 	able-recount-proof.mjs declared 300 000 ms but cited none. The row now cites measured 12.2 s inside a sweep row and 15.1 s standing alone, both on 2026-09-28, against a 300 000 ms ceiling. The checker's numeric arm is widened to the repo's spaced form 12.2 s (amendment 89's lesson: a grammar that doesn't match the population manufactures failures).
- The identity line [identity] sync spawn API on this box: prints once per run and reads nswers (status 0, no error) on this box in both planes.
- Identical verdict sets across the two planes for the rows that run: worktree 0 failed, isolated 42 failed, the 42 being the standing population from amendment 113's addendum.

Measured at cf50329: worktree 73 scripts �� 0 failed �� 0 killed �� 709s, isolated 73 scripts �� 42 failed �� 0 killed �� 146s (unchanged from amendment 113's addendum). The home build digest stays  1db41cffeab0c51 (260 dist files), tree digest 420a122818880cda (257 files), dirty-sources 0.
docs(adr-0016): M2 v130 record + amendment 107 addendum + amendment 129 owed note + README gates fix (ADR 0016)

Three records close open loops:

1. Amendment 130 (M2 v130, docs/evidence): two rows were red only on the plane where git works.
   The worktree sweep at cf50329 reports **73 scripts · 0 failed · 0 killed · 709s**. The isolated sweep
   reports **73 scripts · 42 failed · 0 killed · 146s** (unchanged from amendment 113's addendum).
   - cwd-axis §1: replaced the stale `childRelative === total` pin (70 �?73) with a named-remainder
     census: three rows (asks-axis, plane-axis, table-recount) reach no build through the child's cwd
     and are printed by name. A code-position scan also asserts no such row smuggles a build in
     through its own location (a different reader than the text-scan distRelative check).
   - timeout-axis §2: table-recount-proof now cites its measurement �?"measured 12.2 s inside a
     sweep row and 15.1 s standing alone, both on 2026-09-28, against a 300 000 ms ceiling". The
     checker's numeric arm is widened to the repo's spaced form "12.2 s" (amendment 89's lesson:
     a grammar that doesn't match the population manufactures failures).
   - The identity line `[identity] sync spawn API on this box:` prints once per run and reads
     `answers (status 0, no error)` on this box in both planes.
   - Identical verdict sets across the two planes for the rows that run: worktree 0 failed,
     isolated 42 failed, the 42 being the standing population from amendment 113's addendum.

2. Amendment 107, addendum (M2 v107 re-measured): the record's "correction" claimed EBUSY 6/6.
   Amendment 107's record (line 4757) states: "re-measured for this record: spawnSync fails with
   EBUSY 6 times out of 6, and syncApiIsBroken() returns true �?so the line prints BROKEN".
   Re-measured for amendment 130's record: `spawnSync(process.execPath, ['-e', 'process.exit(0)'])`
   returns status 0 with no error, 6/6, and syncApiIsBroken() returns false. The identity line
   prints `answers (status 0, no error)` in both worktree and isolated sweeps at cf50329.
   The host fault is **intermittent/plane-dependent**, not absolute �?which is exactly why v107's
   identity line exists: it reports the state of this run, so a reader can tell which world
   the run stands in. Both the original commit's prediction ("answers...") and the record's
   "correction" ("BROKEN...") were absolute claims; the truth is conditional.

3. Amendment 129 (M5 v129, three-runtime): the commit `ca3932d` ("feat(three-runtime): v129")
   landed but its record is still owed. This note records the debt so the ledger's newest-grant
   refusal in table-recount-proof.mjs §7 does not fire spuriously when 129 is finally written.

README line 59 updated: the gates command now reads
`@nexus/agent-runtime 409/409 + @nexus/exec-host 275/275 vitest among all packages`
(matching the table-recount-proof's table at HEAD: 409 cases in 30 runtime files + 275 in 8 exec-host files).

### Amendment 131 (M5 v131, three-runtime) — the NPC record gets a body and a file: `npcSnapshot`/`restoreNPC`, five declared fields named as gaps, and the old-file rule that keeps pre-v131 saves loadable

`SaveData.npcs` was declared in `types.ts` and backed by nothing: no record, no writer and no reader, so the
field sat in `SAVE_DATA_FEASIBILITY.blocked` with "implemented by nothing" beside it and every file had to omit
it. v131 adds the RECORD and its SHAPE — not the behavior — and the shape had to be repaired before it could be
one:

- **The declared `SerializedNPC` was unusable as a file.** It held `reputation: Map<string, number>` (which
  `JSON.stringify` writes as `{}` — the v119 lesson, one level down) and `currentTask`/`schedule`, which hold a
  live `THREE.Vector3` and an `onComplete` CALLBACK. The shape now holds what a file can hold: identity, the
  personality numbers, `homeLocation` as three numbers, faction, wander radius and `reputation` as a sorted
  ENTRY ARRAY.
- **The registry**: `attachNPC(sceneId, entity, options)` / `detachNPC` / `getNPC` / `setNPCReputation`, keyed
  by entity id, each entry remembering the scene it was attached in (an `NPC` names no scene of its own —
  `SaveData.sceneGraph` is the blocked field that would carry the mapping). `name` falls back to the entity's own
  name and `homeLocation` to where the entity STANDS, cloned in BOTH directions; `removeEntity` drops the record
  of the body it removes and emits `npcOrphaned`, because nothing runs an NPC per frame and that is the moment a
  record can lose its subject and say so.
- **`npcSnapshot`/`restoreNPC`** are the writer and the reader, and `npcFieldAudit` names the gap from the LIVE
  record against the snapshot rather than from a second list: `currentTask`, `dialogueTree`, `inventory`,
  `quests`, `schedule`, each with what it waits on. A field added to `NPC` tomorrow lands there automatically,
  and a field that gets carried stops being reported.
- **The file carries `npcs: [EntityId, SerializedNPC][]`**, scoped to the scene like `entities` (a record names
  an entity, so a file carrying records for bodies it does not carry would restore records about nothing), and
  `savable` gains `npcs`. The loader pre-checks before ANY half runs: the pair's key must equal the record's own
  `entityId`, the record's entity must be among the file's entities, and an entity that already has a record
  here is refused. Records restore after the entities and a failure rolls both back.
- **The compatibility rule, and why the loader may not refuse an old file.** A file written before this half
  existed carries no `npcs` list at all, and `diagnoseSaveFile` reports that file as LOADABLE with `npcs` in
  `readableNowButNotCarried` — so refusing it would make the diagnosis disagree with the operation it describes,
  which is the defect v127 closed one layer up. The **file's own claim decides**: a file whose `carries` does not
  name `npcs` is read as carrying none, while a file that DOES claim them and ships no list is refused for the
  claim it cannot back up. Both directions are pinned by name.

Measured at this ref: `tsc --noEmit` exit 0 over `packages/three-runtime/src`; **288 vitest cases, 0 failed**
(273 before this half, so 15 new) across the package's 5 files.

The probe (`probe.mjs` in scratch: 7 arms, one control, the source restored byte-for-byte in a `finally`): the
control fixed the plane at 288 with 0 red. Arms 01–06 each reddened the case predicted before the run —
homeLocation-as-alias (1), the snapshot emitting the live `Map` (6, see below), a hand-skipped audit gap (2), a
removal that leaves the record registered (1), a dropped body check in the loader (1), and a missing-npc-list
rule that ignores the file's claim (1). Arm 02 over-predicted and the extra reds are the honest part of the
result: emitting a `Map` also reddens the FILE cases, because `buildSaveFile` runs `assertDiskSafe` and a `Map`
in the record stops the write — the same claim seen from a second angle. **Arm 07 reddened NOTHING**: deleting
the rollback's `detachNPC(id)` loop changed no verdict, because `removeEntity` already takes the record with the
body. A second owner of one cleanup is how one of them eventually drifts, so the loop was REMOVED rather than
defended, and the rollback's record cleanup is now asserted through the removal path (the orphan case) instead
of through a detach the loader no longer performs.

Honest bounds this amendment adds: **a record drives nothing** — nothing reads `schedule`, `currentTask`,
`dialogueTree`, `inventory` or `quests`, so an NPC does not move, talk, trade or want anything; a record is
scoped to ONE scene, and an entity id that exists in two scenes resolves against the record's own scene rather
than against the body nearest the caller; `npcSnapshot` carries no geometry, so a restored merchant is a record
about the default box `restoreEntity` builds; and `sceneGraph`, `quests`, `player` and `worldState` remain
blocked on systems that do not exist or on live objects the shape cannot hold.
### Amendment 132 (M2 v132, docs/evidence) — the isolated plane was a pile of files, and 42 rows were graded on a plane where their own subject did not exist

`--isolated` exists so a sweep can grade a ref's proofs against that ref's own build. v81 staged the plane with
`git archive` + `tar`: the ref's tracked bytes, nothing untracked — and no `.git`. That last property was
recorded as a virtue ("what a proof walks there is exactly what a commit owns") and it is also the reason the
plane could not answer a single question about the repository. Amendment 130 found two rows whose assertions had
gone stale inside a red that nobody could read; this amendment removes the reason the red existed.

**The measurement, both planes, same row, same runner semantics.** `cwd-axis-proof.mjs` asks `git ls-tree -r
--name-only HEAD -- docs/evidence/agents` before anything else. Staged with `git archive` (HEAD's own
`isolatedCheckout`), it is FAIL, exit 1 in **383 ms**, and the entire verdict is that one refusal:
`exit 128: fatal: not a git repository (or any of the parent directories)`. Staged with
`git clone --shared --no-checkout` + `git checkout HEAD`, the same row on the same ref is **OK, exit 0 in
43.9 s** — after the plane's own clean-room build exits 0 in 126.4 s. `confession-proof.mjs` is OK on both
planes (28.8 s / 28.3 s), which is why the count was never 73: it reads git through a helper that tolerates the
refusal. The 42 reds amendment 113's addendum counted are this failure 42 times, and the runner's own
`[plane axis]` line measures why it matters — **51 of 73** tracked proofs reach a git child process at code
position (262 call sites: program 117, argv 145).

**The change.** `isolatedCheckout` stages with `git clone --shared --no-checkout` + `git checkout <ref>`.
Objects are reached through `.git/objects/info/alternates`, so they are neither copied nor hard-linked (the
fallback's first draft guessed "cross-filesystem hardlinks" as its failure mode; `--shared` never links files,
`--local` does). Both staging exit codes are checked now: the draft version dropped them and let the NEXT
command fail in a directory that is not a repository, which is the "a cause that only surfaces as the failure of
the following step is a cause nobody printed" mistake this directory keeps finding in other people's summaries.
The `git archive` path is KEPT as a declared fallback — a clone can fail where an archive would not — the tree
is emptied before the fallback extracts into it (a half-staged `.git` answers differently from none), and the
`[isolated]` line says which plane produced the verdict. `archiveBytes` becomes `null` under a clone rather
than a sentinel number, because 0 would be a byte count that means nothing.

**Three rows whose prose the change made false were repaired in the same commit**, because a plane that answers
questions is a plane that can contradict a sentence:
- `isolated-proof.mjs` — §1 still grades the no-`.git` shape (its witness is a directory the row builds
  itself), and its header now says the shape is what the FALLBACK produces; §4's message says "the CONTENT of the
  staged checkout is the ref" and names `.git` as the one thing a file counter must skip.
- `cwd-axis-proof.mjs` — its `sweep-asks-repository:` declaration names the staging the runner performs, and
  its four "archived checkout" sentences say "staged checkout", since a clone is not an archive.
- `table-recount-proof.mjs` — the ls-tree arm is reachable on the isolated plane for the first time; the
  listing arm is documented as the FALLBACK plane's arm rather than as the only reachable one.
- `GIT_SUBCOMMANDS` gains `clone`: the reaches axis is graded against that list, and the runner now spawns a
  verb it did not name.

**What the plane now answers, measured on a real isolated run of this ref.** The walked-tree census reads
`225 files · tracked 225 / untracked 0 / ignored 0` where the bare tree reported `UNDIGESTABLE (walkedTree: no
built runtime …)`. The [plane axis], [asks axis] and [confession axis] census numbers are unchanged from
amendment 130's record (262 call sites / 117 program / 145 argv; 4 declaring rows; supported 9 · partial 0 ·
invisible 4 · name-no-command 1 · MIS-CITED 0), which is the control: staging changed what the plane can answer
and not what the population says. `cwd-axis` re-run through the runner passes with §1's named remainder intact
(70/73 with asks-axis, plane-axis, table-recount named) and §4's tree clause reading `225 files named once`.
Home build digest `01db41cffeab0c51` (260 dist files) UNMOVED across every isolated run.

Bounds, stated: nothing yet FAILS a sweep for taking the archive fallback, so the 42 reds can return silently on
a host where the clone cannot run — the `[isolated]` line is the only witness. `--no-build` runs are unchanged.
And the clone adds `.git` to a tree that three witnesses count files in; all three skip it today, and that
skipping is now written down as a premise rather than left as an accident of `git archive`.

### Amendment 133 (M2 v133, docs/evidence) — a plane DOWNGRADE is a refusal now, not a log line: the runner will not grade a ref on a tree whose own git cannot answer unless a caller says so out loud

`--isolated` exists so a sweep grades a ref's proofs against that ref's own build. Amendment 132 gave that
plane a staging and a fallback — `git clone --shared --no-checkout` + `git checkout <ref>` when the clone
runs, `git archive` + `tar` when it does not — and it wrote the fallback's price down as a BOUND instead of
paying it: "nothing yet FAILS a sweep for taking the archive fallback, so the 42 reds can return silently on
a host where the clone cannot run — the `[isolated]` line is the only witness". A line nothing reads is not a
gate, and a summary pasted into a record does not carry it at all — the 42 reds amendment 113 counted were
read out of exactly such a summary. This amendment closes that bound.

**The change.** `isolatedCheckout` REFUSES a downgrade instead of logging one. The catch that used to print a
sentence and quietly extract an archive now throws an `Error` with `code = 'ISOLATED-PLANE-DOWNGRADE'`, whose
message carries four things a caller needs: the clone's OWN cause, the price of the plane being refused, the
name of the opt-in, and which staging directory the refusal left behind or removed. The fallback itself is
kept — a clone can fail where an archive would not (no `--shared` in the installed git, an unreadable object
store), and a runner with one way to stage a ref has one way to be unable to stage it — but it is reachable
only behind `allowArchive: true` (CLI `--isolated --allow-archive`), which prints the same price on the
`[isolated]` line. The CLI path wraps the staging in a try/catch and exits 2 with `REFUSED — …`: before that
wrapper a refusal left the module's top-level await to reject, so the runner printed a stack trace where the
sentence that says WHY belongs, and a guard whose own failure mode is an unreadable message is a guard
nobody can act on.

**One sentence, two mouths.** The price is one exported constant, `ARCHIVE_PLANE_COST`, spoken by both the
`[isolated]` fallback line and the refusal. Two independently typed numbers would be two claims, and the
witness asserts the two strings carry the SAME bytes rather than that either one is plausible.

**§6 of `isolated-proof.mjs` — the row that owns this clause — measured on ref d77ca34, 2026-09-29.** The
failure it injects is the NATURAL one rather than a mock: `git clone` refuses a destination that is not
empty, so one stray file in `<dest>/repo` makes the repository plane genuinely unstowable while the ref is
still there to archive.

- REFUSE: **97 ms**. `code = ISOLATED-PLANE-DOWNGRADE`, and the message carries the clone's own stderr
  (`destination path '…' already exists and is not an empty directory`), the price sentence, the opt-in's
  name, and the caller-supplied staging directory — which is still on disk, as the message says it is.
- OPT-IN: `usedClone === false`, `archiveBytes = 5 099 520`, the tree holds no `.git`, the stray file is
  GONE (the fallback empties the tree before extracting, so a half-staged repository cannot be read as a
  bare one), the 226 walked files are every one tracked at HEAD, and `git ls-tree -r --name-only HEAD` run
  INSIDE that plane exits non-zero. The plane is asked the question its own rows ask instead of being
  declared answerless from an absent directory.
- CONTROL: with the repository plane available, `usedClone === true`, `archiveBytes === null`, no downgrade
  sentence is printed at all, and `git rev-parse HEAD` inside the plane equals the source HEAD (`d77ca34`) —
  so "refuse the downgrade" is measured to mean that, and not "refuse everything".
- AGREEMENT: the refusal's message and the `[isolated]` fallback line both contain `ARCHIVE_PLANE_COST` byte
  for byte. Home dist `2fa6222b42cb5829` (260 files) UNMOVED across the row.

**The reach census, re-measured with the runner's own scanner.** This ref's 73 proof rows carry **264** git
call sites at code position (program 119, argv 145) and **51 of 73** rows reach a git child process. That is
amendment 130's 262 / 117 / 145 / 51 plus exactly the two program-position asks §6 adds: the same scanner
returns **1** call site over HEAD's blob of `isolated-proof.mjs` and **3** over the working copy. Measured,
not inferred — and it is also the control that amendment 130's census still holds at this ref.

Bounds, stated: the refusal is about `isolatedCheckout`'s staging and nothing else — a caller who passes
`allowArchive: true` still gets a red population whose only witness is the `[isolated]` line, and the
sweep's `[summary]` does not yet carry the plane, so a pasted summary from such a run is still
un-self-describing (the guard is that it can no longer happen by accident). The refusal says the archive is
"the only staging left" without checking that it CAN run: on a host with no usable `git` the archive fails
too, and that failure is only ever seen by a caller who opted in. Nothing re-measures the 42-row figure per
run — it is a citation carrying its ref and date, not a live claim. And `--no-build` runs are unchanged: the
flag selects whether the plane is compiled, not which plane it is.

**Re-measured on 2026-09-29 at HEAD `b16b8b4`, the run that LANDED this grant.** The record above was
written by the draft that measured `d77ca34`; this run came after the two three-runtime grants (v134, v135)
merged, so the numbers move and both are kept rather than one replacing the other. `node
docs/evidence/agents/isolated-proof.mjs` exits 0 with every row green:

- §6 REFUSE **441 ms** (was 97 ms, and a refusal that got slower is still a refusal). `code =
  ISOLATED-PLANE-DOWNGRADE`, the clone's own cause carried in the message, the opt-in named, and the
  caller-supplied staging directory still on disk as the message says it is.
- §6 OPT-IN: **226** files staged, every one tracked at HEAD, **5 171 200** bytes of tar (was 5 099 520), and
  `git rev-parse` run INSIDE that plane answers nothing.
- §6 CONTROL: `usedClone === true`, `archiveBytes === null`, `allowArchive` never asked, and `git rev-parse
  HEAD` inside the clone equals the source HEAD `b16b8b4bb176`.
- §6 AGREEMENT: the refusal and the `[isolated]` fallback line carry `ARCHIVE_PLANE_COST` byte for byte, and
  the control arm prints no downgrade sentence at all. Home dist `2697a2ef35081a3c` (264 files) UNMOVED
  across the isolated build; the clean checkout walks 226 of 258 worktree files.

One thing this run measured that the record above did not have to face: the plane was staged on `C:` while the
repository sits on `D:`, so the isolated tree's `@nexus/studio#build` FAILED with `Module not found: Can't
resolve './D:/…/node_modules/next/dist/client/next.js'` — a CROSS-DRIVE failure the row itself attributes to
where the checkout was put rather than to the ref (the same ref compiled green on the repository drive). It is
recorded rather than smoothed over because a build exit 1 inside the plane is loud, and the next reader of a
`[summary]` line will see it.

### Amendment 134 (M5 v134, three-runtime) — the scene's declared world bag gets an owner: the value is checked at the SET, the getter hands back a copy, and the bag goes last in a load

**This record is owed, and the reason it is late is part of it.** v134 and v135 shipped with no ADR
amendment and no ROADMAP cell because both shared files carried the M2 lane's uncommitted v133 draft, and
`git add` is file-granular: staging either would have published a claim about code that had not landed. The
v134 evidence record says so in its own words ("They are owed, and the sentence above is what says so"). That
draft landed as `97baaf9`, so the shared files are free and this amendment pays the debt. The full narrative
stays in `docs/evidence/three-runtime/README.md` section v134; this is the ledger entry.

`SaveData.worldState` was declared `Record<string, unknown>` and read and written by nothing, so the field sat
in `SAVE_DATA_FEASIBILITY.blocked` with no owner. It has one now, per scene:

- `setWorldState` / `getWorldState` / `getWorldStateKeys` / `deleteWorldState` is the only door that touches a
  value. The setter REFUSES a value no file can hold — a `Map`, a class instance, an `undefined` leaf — with
  the key path in the message, and it refuses at the SET rather than at `buildSaveFile`'s `assertDiskSafe`,
  because by then the caller has already stored something this runtime can never restore. That is v117's rule
  ("a value this renderer cannot perform refuses at registration") moved from the cinematic table onto the bag.
- `getWorldState` re-clones what it reads. A setter that clones on the way in and a getter that hands back the
  stored object is a READ a caller can move the scene through, which is the one property the input clone buys.
- `worldStateSnapshot` writes `{}` for a scene that holds nothing rather than omitting the key: the field's
  presence is a fact about the FORMAT and its content a fact about the world, and collapsing the two is how a
  loader loses the difference between "the player left no notes" and "this save predates notes".
- `loadSaveFile` reads the FILE's own `carries` before it reads the field, so a missing `worldState` is a
  refusal when the file claims it and an ordinary old file when it does not — v131's rule applied a second
  time, with one shared sentence.
- The bag goes LAST in a load (entities, then records, then the bag), so a failure in an earlier half leaves
  no world state behind; and a load into a scene that already holds keys refuses BEFORE anything runs, because
  replacing a live bag is a decision a caller makes by name rather than one a loader makes on their behalf.
- `worldStateFieldAudit` derives `untouched` from the gap table minus what the scene actually holds, so a name
  added to the table tomorrow shows up without anyone remembering to announce it.

Measured: the package at **300/300 green across 5 files**, `tsc --noEmit` exit 0. The probe ran **9 arms, 9
caught, 0 missed** against a control of **0 red / exit 0**; one arm (08-writer-omits-the-bag) reddened **31**
cases BEYOND its prediction, and that over-red is shipped code rather than a loose case — the arm deletes a
field from a file whose `carries` still names it, which is the refusal at `threeRuntime.ts:1450`/`1455`, so
every case that loads a built file reddened beside it. It is reported rather than folded into the prediction.
This increment adds 12 cases to `test/saveSnapshot.test.ts` and renames one (`carries the four fields it can
fill and names the three it leaves out`) so its title states the table's real shape.

**Provenance, because it changed what was measured.** The implementation arrived in the working tree from a run
of this lane that stopped with its probe reporting a MISSED arm: the arm predicted the case
`world state is scoped to the scene that set it`, and no case of that name existed. The run that followed
measured the dirty tree before touching it, wrote the missing case, found the case AS ADDED still did not catch
the arm (a setter that throws the bag away and rebuilds it passes a one-key-per-scene test while losing every
key the scene said before), strengthened it to two keys in each of two scenes, and added a second arm for the
other half of the sentence. The version is v134 rather than the v132 its own scratch header called it because
the counter is shared across lanes.

Bounds added: the bag holds only data a file can hold, so anything live goes through a record instead; nothing
outside a test reads `SAVE_DATA_FEASIBILITY`; and `sceneGraph`, `quests` and `player` remain blocked.

### Amendment 135 (M5 v135, three-runtime) — the three refusal accounts get ONE table, and every row says WHICH account refuses it

Also owed for the reason amendment 134 states — the shared files carried the M2 lane's v133 draft, which landed
as `97baaf9`. Full narrative in `docs/evidence/three-runtime/README.md` section v135.

`npcFieldAudit`, `worldStateFieldAudit` and the save file's `doesNotCarry` each printed a list of names this
package refuses to keep, the three lists hand-typed beside each other: `quests` appeared in all three with
three different sentences and `player` in two, and nothing in the package could say whether the accounts still
described the same refusal. Worse, a caller reading ONE of them got a flat answer to "is `quests` refused?" — a
question with no flat answer, because refusal is a property of an ACCOUNT, not of a name.

- `REFUSALS` (`threeRuntime.ts:125`) is 8 rows, each declaring `planes` — which accounts refuse the name — and
  `needs` keyed BY PLANE, so a row cannot assert a reason for one account while staying silent about whether
  another agrees. `refusalsFor(plane)` answers the account and THROWS rather than emitting a blank when a row
  declares a plane and withholds that plane's sentence, because a refusal a caller cannot read is a refusal
  that gets worked around.
- Each account is now ONE derivation: `npc-record` 5 rows, `world-state` 4, `save-file` 3 (which
  `buildSaveFile` copies into `doesNotCarry`).
- `refusalCensus()` answers `refusedBy`/`notRefusedBy` per row across the whole plane list: **12** refusing
  sentences, each owned by exactly one (name, plane) pair and each appearing exactly once in the file. A flat
  refusal list is a claim that every account agrees; the census makes that claim impossible to make by accident.
- The witness row is `entities`: the world bag refuses it — the bodies a scene holds *are* the scene graph, so
  mirroring them would give one list two owners — while the save file carries it for real. One flat list would
  have to make one of those two readings false.
- A derivation gives ONE order, so `doesNotCarry` is now alphabetical by field name. That is user-visible and
  it went in only after being measured: **5** cases pinned the old orders and went red with no other case
  moving, and each was then updated with a comment saying WHY alphabetical rather than to whatever the run
  printed. The reorder is safe for old files because `diagnoseSaveFile` reconciles `carries` against
  `doesNotCarry` by membership only; the one positional check it makes (`threeRuntime.ts:1493`, "appears both
  as carried and as not carried") is unreachable by a reorder, and every old-file case stayed green through
  all 8 arms.

Measured: **308 vitest cases across 5 files, 0 red**, with `tsc -p tsconfig.json` (declaration emit, which
`--noEmit` skips) exit 0; `test/saveSnapshot.test.ts` gains 8 cases and `test/cinematicSequence.test.ts` one
expectation. The probe ran **9 arms including the control, control 0 red of 308, 8 arms** counted. Two
measurement errors are kept in the record rather than tidied away: an arm whose anchor was written with a
newline escape against a CRLF file matched nothing and was reported as "anchor found 0 times" —
indistinguishable in the log from "the code changed" — and a shell-based reading of the same file reported 0 CR
bytes, contradicting the reader the probe actually uses. The lesson the record keeps is narrower than "grep
lies": **a line-ending measurement has to come from the same reader that will act on the answer.**

Bounds added: `player` is still a name with two refusals and no owner — giving it a record and a file is the
next grant's subject; the shipped table's own refusal has no reader, because a `needs` sentence missing from
the SHIPPED table throws during module initialisation, so it is graded through an injected row and no case can
show what a broken shipped table looks like at runtime; and nothing outside a test reads `refusalCensus()` —
the Studio has no face that shows which account refused which name.

### Amendment 136 (M5 v136, three-runtime) — the player record gets a body and a file: `attachPlayer`/`playerSnapshot`/`restorePlayer`, `player: null` as a claim rather than an omission, and a fourth refusal plane

`SaveData.player` was declared as `SerializedPlayer` and backed by nothing — the shape named a live
`THREE.Vector3`, a live `THREE.Euler` and a `Map`, no record held one, and the field sat in `blocked` for two
accounts. This grant gives it a record, a file shape and a home in the file, and gives the refusal table a
fourth plane. Full narrative in `docs/evidence/three-runtime/README.md` section v136; this is the ledger entry.

- **The record.** `attachPlayer(sceneId, entity, options)` holds one player per SCENE; position and rotation
  default to where the body already stands and are cloned in both directions; `getPlayer` answers `undefined`
  and drops a record whose body has left the scene; a second record for one scene refuses by name; `removeEntity`
  drops the scene's record with the body it removed. A hotbar slot naming a body outside the scene and a
  non-finite number in any scalar or skill level are refused AT THE DOOR — `JSON.stringify` writes `NaN` as
  `null`, so a record that accepted one would come back holding a different number than the caller wrote.
- **The file shape.** `SerializedPlayer` holds eleven of the twelve declared fields; `skills` is a sorted ENTRY
  ARRAY and the transform is plain numbers. `playerSnapshot` returns `null` for a playerless scene;
  `restorePlayer` pre-checks the shapes, the scene, the body and the live conflict before registering anything.
  `inventory` stays refused, and `playerFieldAudit` names it from the table rather than from a second list.
- **A claim, not an omission.** `buildSaveFile` always writes the half, so `null` means "looked for a player and
  found none" while an ABSENT key is a pre-v136 file. `loadSaveFile` reads the file's own `carries` first, and
  `diagnoseSaveFile` reports that same file loadable with `player` in `readableNowButNotCarried` — v127's rule
  kept in both directions. Every id the player names is checked against the bodies the file carries before any
  half runs.
- **The fourth plane.** `RefusalPlane` gains `player-record` by lengthening the declaration, and the plane set,
  the census, the per-plane reasons and every case that enumerates the planes move together — which is the shape
  amendment 135 built the table for. `savable` gains `player`: five fields carried, with `sceneGraph` and
  `quests` the only two left out.

Measured: **321 vitest cases across 5 files, 0 red** (`test/saveSnapshot.test.ts` 145, +13, one of them a renamed
v134 case so its title states the real shape), `tsc -p tsconfig.json --noEmit` exit 0. The probe ran **11 arms
including the control, control 0 red of 145, 11 caught, 0 missed, 3 over-reds**, each over-red attributed: the
live `Map` in `skills` is also caught by `assertDiskSafe` (4 cases instead of 2), hiding the `inventory` gap also
reddens the shared audits case (3 instead of 2), and dropping the plane also reddens the shared census cases (4
instead of 1).

**A measurement error is kept in the record.** The probe's first run reported 17 reds for an arm predicted to
redden 1, and 16 of them were not about the arm: the working copy was missing
`player: this.playerSnapshot(sceneId),` from `buildSaveFile` — a mutation shaped exactly like an arm, left
behind by an interrupted run. The line was restored, the file went back to 321/321, and the arm was re-run from a
verified-clean baseline, where it reddened its one predicted case.

Bounds added: the record is filed and NEVER DRIVEN — nothing reads `health`, `mana`, `experience`, `level`,
`skills` or `hotbar` to change anything, and no control, HUD or hotbar binds to it; `inventory` is still refused
on every plane; a restored player is carried as data rather than as geometry; `getPlayer`'s lazy drop and
`removeEntity`'s eager one are two owners of one cleanup, kept because a caller who removes an entity by another
route still must not be handed a player that cannot be anywhere; nothing outside a test reads `refusalCensus()`
or `SAVE_DATA_FEASIBILITY`; and `sceneGraph` and `quests` are the whole of the blocked list for the first time.

**Addendum at `1e729f5` (M5 v136 follow-on) — the diagnosis was grading the file's vocabulary, not its bytes.**

The sentence above that "`loadSaveFile` reads the FILE's own `carries` … and `diagnoseSaveFile` reports that
same file loadable" was true of the old-file direction only, and the probe arm that deletes the writer's
`player: this.playerSnapshot(sceneId),` line is what proved it: that arm reddened every case that loads a file it
had just built, because the loader refuses a claim whose half is missing, and left
`the whole listing is partitioned: loadable, unloadable and unreadable are three different answers` GREEN. A
file whose `carries` names `player` with no `player` key at all was reported loadable by a function whose own
docstring says the two readers must not be free to disagree about one file. Fixed by `claimsWithoutBytes`
(`threeRuntime.ts:1982`): every name in `carries` that this runtime can fill must also be a KEY in the bytes,
so `null` stays loadable (it is a value, the check reads the key, not the name) and the problem line is the
loader's own wording rather than a paraphrase, for the reason amendment 127's `noclaims` case already gives.

Re-measured here: Measured from kept artifacts, because two of them disagree and the disagreement IS the story: `full-after-diagfix.json` grades 5 files at 321 cases with 0 red — the population before the new case. `fix-run.json` grades 5 files at 322 cases with 1 red, and that red is this fix mid-flight: the new case quoted the diagnosis's paraphrase (`M5 v136 — the scene has one player, and a file can carry it …`) while the loader says `the file CLAIMS…`. The reading at this commit is not typed by me but taken from the gate artifact: 5 files / 322 cases / 0 red and `tsc --noEmit` exit 0 (114s), graded from HEAD's own bytes materialised into `.scratch/v136/headpkg/packages/three-runtime` with the write-side CRLF restored on 5 of its 12 files, and a before/after digest over every graded file saying nothing moved. The probe's population is the one file it runs — `test/saveSnapshot.test.ts`, 146 cases at this ref — not the 322-case package total, and the probe line itself reads `control: 0 red (expected 0) · exit 0` (`probe-fixed.log`).

The probe at the fixed bytes: arms 13 · caught 12 · missed 1 · arms that reddened MORE than predicted 5 · arms that reddened FEWER 0. Its one remaining miss —
`an OLD file that says nothing about the player is read as carrying none` — is the prediction's fault, not the
suite's: deleting the writer's line does not merely omit a half, it leaves `player` in `carries`, which is the
claim-without-bytes mismatch that case exists to survive. Reported as a witness. New arm
`13-diagnosis-grades-words-not-bytes` restores the vocabulary-only verdict and reddens exactly the one case that
pins the new check.

Two harness readings are kept because both were mine and both were wrong before they were corrected: a suite
run started ~15 s after an edit reported 1 red at a case that passes before and after (it graded the file while
it was being rewritten), and a landed source edit was found erased afterwards. `src` is therefore written by a
script that asserts its own anchor count and re-counts its marker AFTER the run, not only before it.

And one workspace reading, because it changed what this commit contains. A concurrent M5 run was writing v137
(player OPERATIONS: `damagePlayer`/`healPlayer`/`spendMana`/`gainExperience`) into `src/threeRuntime.ts` and
`src/types.ts` while this fix was being written; the whole-file writer that replaced the erased Edit read the
disk, and `git add <file>` then handed those hunks to this commit. Measured at the resulting ref: the four
operations have 0 test hits in the committed `test/saveSnapshot.test.ts` and 16/8/8/6 in the same file's
uncommitted worktree copy, which v137's own run is still writing. Nothing here reverts that — a shared tree
does not get cleaned by `git checkout` — but the rule it teaches is stated: in a shared worktree, staging by
file is not enough when the FILE is shared; the staged hunk list has to be checked against the grant being
committed before the commit is made.

The §7 door at this commit: 73 rows · 3 FAIL (confession-proof.mjs, drive-axis-proof.mjs, report-kill-proof.mjs) · 4 KILL (killed by the runner's own 240000ms default, which by its own sentence "belongs to a constant in sweep.mjs and not to anything the program does", and which this run earned by sharing the box with the package gate) · the walked tree was stable across the run. Of the FAILs, `confession-proof.mjs` and `drive-axis-proof.mjs` read `docs/evidence/agents/*` — the M2 lane's own surface, not three-runtime's, and recorded rather than edited here — while `report-kill-proof.mjs` is a timing-sensitive exec-host row that this shared box made slow.

Bounds added: the claim-vs-bytes check covers the shape v136 made reachable, not every shape a hand-written
file can wear — a missing `entities` or `cinematic` half is refused by the loader whatever the file claims, while
the diagnosis still calls that file loadable through `readableNowButNotCarried`; `inventory` is still refused on
every plane; and no Studio face attaches, detaches or reads a player.

### Amendment 137 (M5 v137, three-runtime) — the player record's declared numbers get OPERATIONS: damage, heal, mana, experience and level, each refusing by name what a drive would otherwise invent

Amendment 136 wrote its own loudest bound in the same breath as the gift: *"the record is FILED AND NEVER
DRIVEN — nothing reads `health`, `mana`, `experience`, `level`, `skills` or `hotbar` to change anything"*. This
grant drives four of those six numbers and leaves on the page why the other two wait. Full narrative in
`docs/evidence/three-runtime/README.md` section v137; this is the ledger entry.

- **One door.** `requirePlayerForOperation(sceneId, operation, amount)` is the only way into any of the five
  operations: a scene with no player is refused BY NAME of the scene, and an amount that is not a finite
  non-negative number is refused BY NAME of the operation. The second refusal is `attachPlayer`'s rule moved onto
  the operation — `JSON.stringify` writes `NaN` as `null`, so an amount this door accepted would come back off a
  file as a different number than the caller wrote. A NEGATIVE amount is refused rather than read as its
  opposite: a caller who means "heal" has `healPlayer`, and a sign that silently reverses an operation is how a
  damage call becomes a healing one.
- **Damage reports what LANDED.** `damagePlayer(sceneId, amount, reason)` subtracts `min(amount, player.health)`
  and answers `PlayerDamageReport { sceneId, entityId, amount, damage, health, maxHealth, died, reason }`; `died`
  is true only where `health === 0 && landed > 0`, so a zero-damage blow is not a death and a blow on a corpse is
  not a second one. The caller's own `reason` rides in the report and in the `playerDamaged` event and is never
  read by this runtime — a listener that has to guess why a blow landed is a listener reading a different event
  than the one that fired. `playerDied` fires on the crossing blow only.
- **Health clamps; mana refuses.** `healPlayer` clamps to `min(amount, maxHealth - health)` and answers
  `healed: 0` when the record is already full — asking for health it has is an answer, not an error. `spendMana`
  REFUSES a spend larger than the pool, naming both numbers, and the difference between the two is deliberate and
  stated: an overkill blow has an obvious reading (the target is dead) while a spell the player cannot afford
  does not, so the caller is told instead of being handed a spell nobody paid for.
- **Experience moves experience and nothing else.** `gainExperience` adds and does NOT touch the level, and
  carries the unchanged `level` in `PlayerExperienceReport` so a caller cannot read the silence as a curve that
  fired — there is no threshold table in this package on purpose, because an experience curve is a design
  decision. `setPlayerLevel` is therefore the ONLY door a level changes through, and it refuses a zero, a
  fractional or a non-finite level rather than flooring one.
- **The numbers are the numbers a file carries.** Every operation mutates the record `playerSnapshot` writes, so
  a blow taken in one runtime is read back by a runtime that never saw the record, through a real store, and each
  operation emits on the event bus with the report it returned.

Measured: **333 vitest cases across 5 files, 0 red** (`test/saveSnapshot.test.ts` 157, of which this grant's
describe holds 11), `tsc -p packages/three-runtime/tsconfig.json --noEmit` exit 0. The probe ran **10 arms
including the control · control 0 red of 157 · 10 caught · 0 missed · 2 over-reds**, each attributed: arm 01
(damage lands more than the player had) also reddens `a dead record is still a record: health never goes below
zero`, which is the other half of the same claim, and arm 09 (move the report without moving the record) reddens
4 cases because the death-boundary case and both save cases assert that same identity. The source was restored
byte-for-byte in a `finally` and the restore was checked before the evidence was written.

**A shared-worktree reading, kept because it changed what this commit contains.** The five methods and the five
report types were written into `src/threeRuntime.ts` and `src/types.ts` while the M2/v136 lane was writing
`claimsWithoutBytes` into the same two files, and that lane's `git add <file>` handed my hunks to `1e729f5` —
its own record says so, and states the rule it teaches: in a shared worktree, staging by file is not enough when
the FILE is shared, so the staged hunk list has to be checked against the grant being committed. Nothing here
reverts that. What this commit adds is the half that lane could not carry: the **11 cases** that drive the
operations, and these records. The reading at the resulting ref is therefore stated with its file, because the
two halves live in different places: HEAD's own `test/saveSnapshot.test.ts` contains 0 hits for the four
operations while the worktree copy of that same file — the population every figure above was measured over —
holds the 11 cases, and the package total is 333 only in the tree where both halves are present.

Bounds added: `skills` and `hotbar` are still FILED AND NEVER DRIVEN, and `inventory` is still refused on every
plane; there is no mana regeneration and no experience curve, so mana only ever falls and a level moves only when
a caller names one; death is a number reaching zero rather than a state this runtime keeps, so `healPlayer`
revives a corpse and nothing else notices; nothing outside a test calls any of the five operations — no Studio
face, no HUD, no autonomy drives them; and the operations move one scene's one player, with no rule about who is
allowed to call them.

### Amendment 138 (M5 v138, three-runtime) — `CombatSystem`/`CombatEntity` stop being declared words: a body's record gets an owner, two operations, ONE death transition, and a field audit that reads the declared type instead of restating it

_Numbering: 138 was claimed by the author before 139 and left uncommitted while 139 landed, and the v139 record
says so in its own text ("v138's in-flight names are in those bytes", "held by a live v138 writer"). It lands
here, after 139, and the README carries the same note rather than pretending the order was tidy. Full narrative
in `docs/evidence/three-runtime/README.md` section v138; this is the ledger entry._

- **The gap this closes.** `types.ts` declared `CombatEntity` (13 fields) and `CombatSystem`, and **no code in
  this package constructed either** — M5 names `combat` among its nouns, and the only health this runtime held
  was the player's own record (v136/v137). This grant gives ONE body's record an owner, in the shape the player
  plane already uses, one plane over.
- **An owner, a scene, and refusals that name the value.** `attachCombatant(sceneId, entity, options)` refuses a
  missing scene or body by name; refuses a body that is the scene's **player**, because the player's numbers
  already have an owner in `attachPlayer`/`damagePlayer` and one health with two records is the drift this
  package keeps naming; refuses a **second** record on one body; refuses a non-finite number (a save writes it
  as `null`, so the record would come back holding a different value than the one written), a negative one (no
  rule here reads a negative health/armor/power as anything but a record already at its floor), and
  `health > maxHealth` **rather than clamping it** — a record that starts above its own maximum is a claim no
  heal could honour. A fifth `attackType` word is refused rather than stored as a word nothing can read.
- **`strike` states its arithmetic.** `damage` is what LANDED after armor, the word `PlayerDamageReport` uses
  for the same reason: a blow and an overkill are two different claims and a report that conflated them would
  make armor unmeasurable. Armor subtracts and a non-zero blow lands **at least one**, so armor mitigates
  rather than immunises; a zero blow lands zero; with no `amount` the attacker's own `attackPower` is used and
  the report carries the number used. `died` is true only on the call that crossed health from positive to zero.
- **Death is ONE transition, entered and left by exactly two calls.** `strike` writes `aiState: 'dead'`; only
  `healCombatant` crossing health back above zero leaves it (to `idle`), and `revived` is true only there. A
  **corpse does not strike** — refused by name. A heal at full health answers a report of zero rather than
  refusing, exactly as `healPlayer` does, and clamps at `maxHealth`.
- **A body may not be its own target** — added while landing this grant, and the refusal comes BEFORE the
  striker's own state is read. "You named one body twice" is a fact about the CALL while "that body is dead" is
  a fact about the world, and a malformed call should not be reported as a world condition. Without it a caller
  who transposed two arguments halved their own health and got a report that looked like a hit. `damagePlayer`
  offers no precedent either way: it takes no attacker at all.
- **The audit reads the type.** `combatFieldAudit` answers `consulted`/`unhonored` in the shape
  `physicsFieldAudit` uses, and the suite's last section **reads `src/types.ts` off disk** and requires the two
  lists to PARTITION the declared `CombatEntity` — no overlap, no gap. 6 consulted (`aiState`, `armor`,
  `attackPower`, `entityId`, `health`, `maxHealth`), 7 unhonored each with what it waits on: `attackRange` (a
  strike NAMES its target), `attackSpeed` (nothing schedules a second blow), `attackType` (no rule differs
  between melee and ranged), `cooldowns` (the frame loop is the only clock here), `faction` (stored, consulted
  by nothing), `statusEffects` (`StatusEffect` holds FUNCTIONS, so a record carrying one is a record no file can
  hold and no tick here would run), `target` (a strike keeps none). A field added to the type tomorrow lands in
  one of those lists or the suite is red.
- **A record dies with its body.** `resolveCombatant` drops an entry whose entity has left the scene and emits
  `combatantOrphaned` — the rule `resolveNpc` runs by — so no caller is handed a record with nothing left to be
  a body; a record attached in ANOTHER scene is a stated refusal rather than an answer about this one.
- **Bounds (§60).** No turn, no initiative, no AI decision and no target choice. No formula beyond
  `max(1, amount - armor)` — no resistances, criticals or damage types. Armor never reaches immunity, so a
  sufficiently armored body still takes 1 per non-zero blow. No regeneration and no tick, so nothing advances a
  combat state over time. Self-inflicted damage has no operation; it is refused at `strike` rather than served
  by a second door. And **nothing outside a test calls any of this** — no Studio surface, no HUD, no agent tool,
  because no consumer imports `@nexus/three-runtime` at all.
- **Evidence.** `packages/three-runtime/test/combatRecord.test.ts` **23 cases**, package suite **362/362** across
  7 files, `tsc -p packages/three-runtime/tsconfig.json` clean.

### Amendment 139 (M5 v139, three-runtime) — the package face stops being a hand-copied list, so a grant can no longer export a name its callers cannot spell

`src/index.ts` re-exported three of the package's four modules BY NAME — the fourth, `./types.js`,
was already starred — which silently turned every grant into two grants: add the export to the
module, then remember the barrel line. v135 did the first and not the second, and nothing said so.
Full narrative in `docs/evidence/three-runtime/README.md` section v139; this is the ledger entry.

- **The accident, measured rather than recalled.** The reader written for this grant
  (`.scratch/v139/barrel.mjs <ref>`, which asks git for each module's bytes and compares what that
  module DECLARES against what the barrel NAMES for it) prints at 9bf77b1 — the ref before this
  grant — `holes=1 ghosts=0`, and names the hole: `RefusalRow`, the row type of `refusalsFor`'s own
  table parameter (amendment 135). So the type that documents the refusal census could not be
  spelled by anyone importing `@nexus/three-runtime`. A second reader
  (`.scratch/v139/measureOldListVsWorktree.mjs`) grades that same hand-copied list against the
  module bytes as they STAND in the worktree, where the v138 writer's combat names are still
  uncommitted: `holes=4` — `CombatAttachOptions`, `CombatantFieldAudit`, `DEFAULT_COMBATANT`,
  `RefusalRow` — while those same modules through this grant's face give `holes=0`. That is the case
  for the fix in one re-runnable number: the list was losing a name per forgotten line, silently,
  and the losses are not even of one kind — one is this lane's own oversight, three are a live
  neighbour's in-flight work that no checklist in this repository could have caught. At c30f592 the
  reader prints `holes=0 ghosts=0` and the line `face is complete and honest`.
- **The fix removes the class, not the instance.** The face is now the union of its modules: four
  wholesale `export *` clauses, so a module cannot declare a name the barrel omits. That shape had
  been refused before for a real reason — two starred modules that both OWN one name make that name
  vanish silently (TS2308 calls it an ambiguity; the runtime just drops it). It is now a measured
  precondition instead of a judgment: at `c30f592` the four modules own 123 names (`types 75`,
  `threeRuntime 31`, `saveStore 6`, `renderBackend 11`) with zero pairwise collisions — on the live
  worktree the same reader counts 129, because the v138 writer's names are in those bytes — and the
  only name two of them touch — `DEFAULT_THREE_CONFIG` — is OWNED at `types.ts:774` and merely
  FORWARDED at `threeRuntime.ts:49`, which is one binding with one owner rather than two owners.
  `tsc --noEmit` exits 0 on the wholesale barrel: that is the arbitration of the ambiguity question,
  not my reading of it.
- **The rule shipped as 6 derived cases** (`test/packageFace.test.ts`), none of which holds a
  literal name list: every export a module owns is reachable through the face; the face mentions
  every module it is built from; no two modules own one name; a forwarded name has exactly one owner
  AND is forwarded from that owner's file; the value layer of the imported namespace equals the
  modules' own values plus their forwards — nothing missing, nothing invented; and a synthetic
  witness runs the finders against a hand-listed barrel, because a gate that has never seen the
  broken shape it exists to catch has not been tested. The witness table is built in-process rather
  than by editing a module, since `src/types.ts` and `src/threeRuntime.ts` were under a live v138
  writer at the time.
- **Behavioural probe: [summary] 3 arms, 0 mismatched.** Each arm mutated only `src/index.ts` and
  asserted its own byte-change before grading. Arm A put v135's hand-copied list back and reddened
  exactly the reachability case and the value-layer case while the rest of the package did not
  notice — 361 cases collected, 2 failed, 0 reds outside `packageFace`: the accident reproduced and
  the suite shown blind to it. Arm B dropped one module and reddened 3 cases; arm C named a member
  the module had stopped declaring and reddened 2 while `tsc` exited 2 (TS2305). Round 1 of the same
  probe predicted 1/3/0 reds and measured 2/4/2 — three misses, all mine, each named in the landing
  commit — and round 2 hit all three. `src/index.ts` was restored byte-exactly between rounds (sha
  57e2cc864d79).

Measured at the landing: **361/361 cases across 7 files, 53/53 suites, 0 failed**, `tsc` exit 0,
staged diff derived from the bytes it wrote: **+198/−27 over 2 files**. Landed as `c30f592`.

**A hole this entry does not fill: amendment 138 does not exist.** The v138 grant (the combat
record) is still in flight in the shared worktree — its writer holds `src/threeRuntime.ts`,
`src/types.ts` and `test/combatRecord.test.ts` uncommitted — so 138 is that lane's entry to write,
and taking the number would be writing someone else's record. Nothing here adopts or reverts any of
their hunks: the two files this grant touched are `src/index.ts` and its own new test.

**Correction, recorded rather than smoothed over.** This entry was first landed by `15ebe8e` with
one sentence that interpolated a FRESH worktree reading (`holes=0`) into a clause about the
HISTORICAL pre-swap state — the error of a previous paragraph, and the reason the
`measureOldListVsWorktree.mjs` reader above now exists: the claim is only worth making because it
can be re-derived. The same landing's text reflow also broke bullet continuation indentation and
doubled two `- ` markers, which is why the region was rewritten whole rather than poked.

Bounds added: a wholesale face cannot hide a name by omitting it, only by not exporting it — a
different and visible decision; the gate reads declaration syntax with regexes, so an export form it
does not recognise (a computed or generated re-export) is invisible to it, and the synthetic witness
is the only case that exercises the broken shape; nothing outside this package imports
`@nexus/three-runtime`, so no consumer was ever broken by the hole and this repair prevents rather
than mends a user-visible failure; and `src/index.ts` no longer states which names are public — the
modules are the public surface now, so a name exported by a module is shipped.

### Amendment 140 (M5 v140, agent-runtime) — the 3D lane gets its FIRST CONSUMER: a `scene.*` tool family over a driver seam, driven by the §28 gate, with the real package behind it

_Numbering: 140 was free when this was written (`grep -n "^#\{2,3\} Amendment"` tops out at 139 and
`git log --oneline -1` is the v138 landing). Full narrative in `docs/evidence/three-runtime/README.md`
section v140 and `docs/evidence/agents/README.md`; this is the ledger entry._

- **The bound this closes.** v139's own last words were *"nothing outside `@nexus/three-runtime` imports
  it, so this prevents rather than mends; … the roadmap's M5 entry is still a runtime with tests, not a
  feature a user can open."* v138 and v139 both wrote that sentence and both left it standing. This grant
  closes the **agent** half of it: `agents/runtime` can now compose and inspect a 3D scene.
- **A driver seam, not a package import.** `agents/runtime/src/sceneTools.ts` declares the narrow
  `SceneDriver` it needs (`engine`, `createScene`, `addEntity`, `removeEntity`, `addCamera`,
  `setActiveCamera`, `summarize`) and the HOST supplies the implementation — the shape `browserTools`
  uses for `BrowserDriver`, and for the same reason: the agent lane holds the capability without holding
  the renderer, and the family is testable without a GL context. **`agents/runtime` gains no dependency
  on `@nexus/three-runtime`**, so the two lanes stay separable and no import cycle is created.
  Methods may answer directly or with a promise (the `TreeReaper` precedent), so a driver that must await
  a real renderer is not forced into a fake synchronous shape.
- **Six doors, one of them read-class.** `scene.create`, `scene.entity.add`, `scene.entity.remove`,
  `scene.camera.add`, `scene.camera.focus` are write-class and therefore behind the §28 checkpoint;
  `scene.inspect` is `read` and asks none. The suite asserts the read count is EXACTLY ONE, because a
  second read door would be a mutation that skipped the gate.
- **Refusals are spoken by the side that knows the fact.** A missing `sceneId`/`name`/`kind` is named by
  the argument reader; an unknown scene is named by the DRIVER ("no scene X is held by the Y driver");
  an unknown `kind` lists the six declared ones rather than storing a word nothing reads; and a position
  is **all three axes or none** — a partial triple is refused rather than defaulted, because defaulting
  the missing axes would place a body somewhere no caller named. A body is only ever added to a scene
  that exists, checked BEFORE the add, so a typo in an id is refused by this family rather than swallowed
  by a driver that happens to create-or-append.
- **§60: this family CANNOT be mistaken for a renderer, and that is asserted rather than promised.** There
  is no `scene.screenshot`, no door is even NAMED like one, and no description promises a picture — a door
  that answered with one would be `browserTools`' `base64-screenshot-placeholder` defect in a new costume.
  `scene.inspect` reports STRUCTURE (counts, names, the active camera) which is a claim this side can
  check. The proof makes "the tools draw nothing" a MEASUREMENT: the real headless backend receives **0**
  frames across every tool call, and the SAME backend receives 1 on `start()` and 2 after one scheduler
  step — so the zero is a fact about the tools rather than about an idle backend. (The first draft of the
  proof's own summary line said "2 frames drawn by the tools themselves", which was wrong and was
  corrected in the same landing: the 2 came from the frame loop.)
- **Evidence.** `agents/runtime/test/sceneTools.test.ts` **20 cases** against a recording fake (the
  family's own rules), and `docs/evidence/agents/scene-tools-proof.mjs` — a RUNNABLE proof that wires the
  **REAL** `ThreeRuntime` through the seam: §1 cross-checks every tool answer against the runtime's OWN
  graph (the body really exists, at the position named), §2 the zero-frames measurement above, §3 one
  refused write moves the graph by 0 and asks the gate 0 times while one approved write moves it by 1 and
  asks once, §4 four refusals each naming its own fact with the runtime moved by 0 bodies, §5 this
  repository's HEAD byte-identical. `agent-runtime` **409/409 → 429/429** (31 files),
  `tsc -p agents/runtime/tsconfig.json` clean.
- **Bounds (§60).** This is a COMPOSITION surface, not a game: it creates scenes, bodies and cameras and
  reads them back. It does not render, it does not step the frame loop, it does not drive combat, physics,
  controllers or cinematics (those exist in the package and have no door here yet), it has no save/load
  door, and it is not registered in any default roster — a host must call `registerSceneTools` with a
  driver it built. Nothing in the Studio imports it either, so M5's product face is still open; what is
  closed is that the lane has no consumer at all.

### Amendment 140 addendum — the doc gate could not tell a dropped test FILE from a missing one, so it now runs vitest the way this host needs

Found while landing 140, and it is the same class of fault the lane keeps recording: a red that is the
HOST's noise wearing the shape of a defect.

`table-recount-proof.mjs` exists to compare HEAD's test-file ownership against the files a vitest run
actually produced. It invoked vitest with the default parallel pool. On this host that pool is
handle-starved and **silently drops files**: measured with `--reporter=json`, `agents/exec-host` reported
**4 of its 8 files** with `gitTools.test.ts` among the missing, and the same suite reports 8/8 with
`--no-file-parallelism`. The proof therefore went red with *"HEAD owns this test file and the run produced
NO results for it"* — a sentence that reads as a missing test file and was in fact a dropped one. The flag
is now part of the row's argv, with the measurement and the reason written beside it.

The cost is wall time and it is stated rather than hidden: a gate whose reds cannot be told apart from the
host's own noise is not a gate. Verified green after the change — **704 tracked cases in 39 files** across
the two packages, every table row matching its file, both prose totals matching their row sums, and the
newest grant (140) carrying a title.

This is also why the number `140` appears in the mutation arm's own report: the proof refuses a ledger whose
newest grant is untitled, and it proves that refusal is a real condition by renumbering the heading and
watching the hole move.

### Amendment 141 (M2 v141, evidence) — the clone plane stopped lying about BYTES, and the `[isolated]` line says HOW its destination was chosen

_Owed record, written at v142. The landing `c8396a3` titles itself "(ADR 0016 amendment 141)" and no such
section existed: the sweep runner is the M2 lane's own tool, it was changed in that commit, and the ledger
entry for it was never typed. Numbering was checked first (`grep -n "^#\{2,3\} Amendment"` topped out at 140
and `git log` showed no competing claim), so this is the record the commit already cited rather than a new
amendment wearing its number. Nothing here is re-measured: every figure is the landing's own, quoted because
the lane's rule is that an unrecorded measurement is a measurement nobody can find._

- **The defect was bytes, not logic.** This box's system gitconfig carries `core.autocrlf = true`
  (`git config --show-origin core.autocrlf` → `file:C:/Program Files/Git/etc/gitconfig true`), so the v132
  clone plane's `git checkout` materialised CRLF where `git show HEAD:file` answers LF. The plane's whole
  credibility rests on it being the same bytes as the ref it names, and `provenance-proof.mjs` §2 therefore
  counted **0 of 74** proofs identical to their committed bytes on the cloned plane while the home worktree
  measured the opposite (disk == `git show`, both LF). Two planes reading different bytes for one ref is
  exactly the drift that runner exists to catch. The fix is the config's own door —
  `git clone -c core.autocrlf=false` — after which `git config --get core.autocrlf` answers `false` inside the
  clone, `status --porcelain` is clean, and disk == `git show` byte for byte. The command word stays `clone` at
  `argv[0]` where `gitCommandsIn` reads it: `git -c core.autocrlf=false checkout <ref>` leaves that arm at
  `[]`, because the tokenizer takes the first argument after the program as THE command (measured, not
  assumed).
- **A line that named WHERE but not HOW.** `drive-axis-proof.mjs` reads the FIRST `[isolated]` line and
  requires it to say how the destination was chosen; the clone arm's line named the location and not the
  choice, so that row went red on both planes. The line now carries `chosen: ${where.chose}` — measured green
  in both arms: `default: repo-drive (FORCED off tmpdir by the drive mismatch)` and `caller-supplied`.
- **A shrink claim that could only fail.** `isolated-proof.mjs` §4 asserted `cleanTree.files < home.files`.
  That is right on the home plane (**63** untracked files, which isolation removes) and impossible on the
  isolated plane, where this row stands inside a clone the runner has just staged: census **230 tracked / 0
  untracked / 0 ignored**, so the assertion reduced to `230 < 230`. The census now picks the sentence: unowned
  > 0 → the strict shrink claim; 0 → IDENTITY (count AND bytes), which is strictly stronger.
- **Two witnesses left stale by v132/v133, found by measuring rather than remembering.**
  `confession-proof.mjs`'s `helperArms` still expected `gitCommandsIn(sweep.mjs, 'isolatedCheckout')` to be
  `["archive"]` where the body now reaches clone + checkout + archive; `drive-axis-proof.mjs`'s
  `asks-declaration` still said "git archive HEAD once per `sw.isolatedCheckout` call". Both were red on the
  worktree plane before that commit and green after, with the wanted lists updated to the measured ones
  (`["clone","checkout","archive"]`, the archive named as the v133 fallback it is).
- **Bounds.** The 74-row sweep on the isolated plane counts 230 of this worktree's 293 files, every one
  tracked at HEAD, and a plane that silently took the archive fallback still has only the `[isolated]` line as
  its witness — v132's bound, closed at v133 for the runner and still true of any caller that reads the line
  and not the code.

The landing's two-plane sweep table and spot-witness census live in the README v141 section (worktree 74 rows / 0 failed / 0 killed in 692 s, isolated 74 / 0 / 0 in 671 s, both at `c8396a3`); this record keeps the narrative, that table keeps the numbers.

### Amendment 142 (M5 v142, studio + three-runtime) — the 3D lane gets its FIRST PRODUCT CONSUMER, and the first consumer is what finds that a declared light was never attached

_Numbering: 142 was free (`grep -n "^#\{2,3\} Amendment"` topped out at 140; 141 is the owed M2 record
directly above, written in the same landing). Full narrative in `docs/evidence/three-runtime/README.md`
section v142, `docs/evidence/studio/README.md` and the runnable `docs/evidence/studio/scene-surface-proof.mjs`;
this is the ledger entry._

- **The bound this closes.** Every M5 grant from v108 onward ended with the same sentence, and v139/v140 wrote
  it verbatim: *"nothing in the Studio imports `@nexus/three-runtime` … the roadmap's M5 entry is still a
  runtime with tests, not a feature a user can open."* v140 closed the AGENT half with a `scene.*` tool family
  over a driver seam. This closes the **product** half: the Studio grows a 3D surface, and the package gains
  its first UI dependency edge (`apps/studio` → `@nexus/three-runtime`, added to `transpilePackages` and to the
  workspace dependencies so the build order is declared rather than accidental).
- **The first consumer found a defect no test could see.** `ThreeRuntime.createScene` built two `THREE.Light`
  objects through `createDefaultLighting`, stored them in `LightingConfig.lights` — and **put neither into the
  scene**. `lighting` was written once and read by nothing. Every mesh this package makes is a
  `MeshStandardMaterial`, whose colour is a function of the lights in its scene, so **every scene from this
  runtime rendered black**, and the suite could not see it because every case above the renderer seam asserted
  the CONFIG (`lights.length === 2`) rather than the SCENE. The fix attaches each `enabled` light to
  `threeScene` and reuses that one `lighting` value, and the new cases assert the SCENE: both declared lights
  are children, each is retrievable by id, a second scene gets its OWN lights, and every non-light child of a
  fresh scene is still a registered body — because attaching lights moves the object count v140's own proof
  records, and that boundary needed pinning rather than noticing later.
- **The defect is now a NUMBER, not a sentence.** The proof computes the package's own lighting term over the
  package's own light objects: ambient contributes its intensity, the directional light
  `intensity * max(0, dot(normal, direction))`. Measured: **1.316496580927726** with the declared lights and
  **exactly 0** without them, with every body's `emissive` black, so a body's colour can only come from light.
  The claim "it renders" is a picture a human can open — `docs/evidence/studio/harness/studio-scene3d.png`
  shows four LIT boxes on a dark ground rather than the black frame the defect produced.
- **The surface is split the way ADR 0005 splits the 2D one: a pure model and a renderer.** `scene3d.ts` is
  pure and imports neither React nor three: `buildDemoScene` composes one scene, four bodies and one camera;
  `buildSceneReport` reads the runtime's state back; `createStudioScene` owns the frame count, because the
  runtime does not count frames and a report that invented one would be the class of number this project keeps
  writing amendments about. `Scene3D.tsx` is the ONLY file in the Studio that touches a canvas, a GL context or
  three.js, which keeps the model loadable during SSR and in a plain vitest process.
- **The camera had to be aimed, and that is where the seam earned its keep.** `createCamera` builds a camera
  at the origin looking down -Z, and aiming it is a three.js write the pure half may not perform, so the
  adapter is its own narrow interface (`placeCamera`) and the component holds the only implementation. The
  split is not decoration: the package's `createEntity` takes a `THREE.Vector3` (not a plain `{x,y,z}`), an
  entity's body is `threeObject` (not `object3D`), and `Object.assign(runtime, adapter)` type-checks while
  silently dropping every prototype method — all three were found by measurement, and the third reddened seven
  cases in this landing's first run.
- **§60 on the surface itself.** The backend is chosen honestly (`webglAvailable()`), the HUD names which one
  answered, and a host with no GL context gets the headless backend plus a visible sentence saying that no
  pixels are drawn — the graph, the camera and the frame loop are real and the picture is not. Every HUD number
  comes from `buildSceneReport`; the frame count is the one thing the component owns and it says so. The
  read-only bridge grows a second, separate reader (`window.__nexusScene3d`, frozen, no mutators) rather than a
  second global, and it answers `null` when no surface is mounted, which is the truth.
- **Evidence.** `three-runtime` **362/362 → 364/364** (7 files, `tsc` clean). Studio **130/130 (15 files) →
  149/149 (17 files)**, `tsc --noEmit` clean — and **the studio `typecheck` gate was RED at HEAD**:
  `instancePanel.test.ts` carried `error TS2532` since `d77ca34`, because the ambient studio build uses
  incremental `tsconfig.tsbuildinfo` and never re-checked that file, so the repo's own `turbo run typecheck`
  task had been failing (or skipping) unnoticed. That is fixed here too, by reading the capture group as what
  `noUncheckedIndexedAccess` says it is rather than dropping an unreadable receiver. A new `vitest.config.ts`
  aliases `@nexus/three-runtime` to the package **source**, because `dist/` is gitignored and a test that
  imported it would grade whatever the last `tsc` happened to leave on the machine.
- **Two new suites and one new proof, and what each can and cannot say.** `scene3d.test.ts` (16 cases) pins the
  model over a fake; `scene3dSurface.test.ts` (5 cases) runs the **real** `ThreeRuntime` on the headless seam
  through the same functions the component calls, which is what catches the interface drift above;
  `surface.test.ts` (7 cases) pins the surface as VIEW state (flipping it touches no document, is not undoable,
  is not persisted) and reads the shipped component bytes to refuse a toggle wired to a surface no branch
  renders — honest about its own limit: the Studio has no DOM test environment, so wiring is asserted by
  reading bytes, not by rendering. The runnable `docs/evidence/studio/scene-surface-proof.mjs` grades the
  **shipped Studio module itself** (type-stripped with `node:module`, not copied — a copy would prove only that
  the copy works) over the shipped runtime: §1 the composed scene is the runtime's own, §2 the lighting term
  above, §3 the aim moves a real camera and the frame carries it, §4 the surface's count and the backend's draws
  are kept apart, §5 home HEAD byte-identical.
- **The browser check, which is where the surface actually lives.** `tools/harness/studio-scene3d.mjs` (ADR
  0017 harness) drives the real Studio over CDP: **11/11** assertions — the 2D canvas is still the default and
  still paints (**482900/482900** px, before and after), pressing `3D` mounts `#nexus-scene3d` and unmounts the
  2D canvas, the bridge's frame count advances (**12 → 23**), the report names `Studio Scene` with four bodies
  and the active camera, the HUD names the backend, and the reading on this host 2026-09-29 is **`backend=webgl`**
  at 878×550 with 4 draw calls — headless Chrome does provide a software GL context, so the screenshot is a
  render rather than a fallback. Pressing `2D` restores the canvas, and the 3D reader answers `null`.
- **Bounds (§60).** The scene is DEMO-MODE geometry: four default meshes, one default camera, no assets and no
  model calls. There is no orbit/zoom camera control, no add/remove body from the UI, no lighting control, no
  save/load door on the surface, and nothing it composes reaches the Design Document — the two are separate
  systems sharing a window. The HUD's numbers are sampled at most once per 10 frames rather than per frame, the
  component reports the backend it got rather than the one it would prefer, and `Scene3D.tsx` is not
  unit-tested (there is no DOM test environment here): its behaviour is covered by the headless proof and the
  browser probe, and that is stated rather than implied.


### Amendment 143 (M2 v143, docs/evidence) — the code-position arm skips global options like the free-text matcher already does, so `run('git', ['-c', k=v, verb])` names its verb

_Recorded late (§60): committed as `7ee35d3` citing "ADR 0016 amendment 143" with no amendment written, so it
is written here from that commit rather than left as an undocumented step._

- **The hole.** v141 staged the isolated plane with `git clone -c core.autocrlf=false` and measured, on the
  way, that the confession arm reads that shape as `[]`. The tokenizer took the first literal after the
  program as THE command (`asArgv`, which is `last === '['` — true for the first literal only), so any
  global option before the verb (`-c k=v`, `-C dir`, `--no-pager`) blinded it. **The free-text matcher never
  had this hole** — its option-skipping group reads `git -c x status` as one command — and the argv-form arm
  (`['git', …]`) never had it either, since it already takes the first command-shaped literal anywhere in the
  array. Only the program-form arm (`run('git', […])`) was one-sided, which is the direction the vocabulary
  gate forbids an arm to err in.
- **The fix is one condition.** The `afterProgram` branch now completes on the first command-shaped literal
  while its frame is on top (`sub === null` keeps the first verb the winner; a nested call or array pushes a
  new top, so only literals that ARE this argv complete it) instead of only on the literal that opens the
  array. The v95 comment above it was updated to say the same.
- **Measured before/after on synthetic shapes:** `['-c', k=v, 'checkout']` `[]` → `["checkout"]`;
  `['-c', k=v]` `[]` → `[]` (the fix moves the command forward, it does not invent one);
  `['-C', dir, 'rev-parse']` `[]` → `["rev-parse"]`; `['archive', '--format=tar']` `["archive"]` →
  `["archive"]` (unchanged); parameter-bound argv `[]` → `[]` (the documented blind spot stays blind).
  `gitCommandsIn(sweep.mjs, 'isolatedCheckout')` stays `["clone","checkout","archive"]` — the v141
  `clone -c` keeps `clone` at argv[0], which is why that increment chose the clone option over `git -c`.
- **The population impact is counted, not guessed:** ~20 `-C`-first call sites across 19 proofs were
  invisible and now resolve, and **every one of those files already had a command-first reach**, so no row
  enters or leaves the predicted set. The asks census is byte-identical: declared still 4 rows (closure,
  cwd-axis, drive-axis, table-recount), uncorroborated still the same 3, corroborated still table-recount.
  The plane-axis synthetic grammar has no flag-first case, so §1 cannot move.

### Amendment 144 (M4 v144, agent-runtime) — the WORLD lane gets its FIRST CONSUMER: a `world.*` tool family over a driver seam, and its read/write split is MEASURED rather than asserted

_Numbering: 144 was free (`grep -an "^### Amendment 14"` topped out at 142). Full narrative in
`docs/evidence/agents/README.md`; this is the ledger entry._

- **The gap this closes.** `packages/world-engine` had **31 green tests and no consumer at all**:
  `grep -rl '@nexus/world-engine'` across `apps/ agents/ packages/` matched **only the package's own
  `package.json`**. That is the same shape the 3D lane was in before v140 and the same bound its records
  kept writing — a package with tests, not a capability anything can reach.
- **A driver seam, not an import.** `agents/runtime/src/worldTools.ts` declares the narrow `WorldDriver` it
  needs (`engine`, `summarize`, `addLocation`, `addCharacter`, `addLore`, `query`, `decide`) and the HOST
  supplies the implementation — the shape `browserTools` uses for `BrowserDriver` and `sceneTools` for
  `SceneDriver`. **`agents/runtime` gains no dependency on `@nexus/world-engine`**, so the lanes stay
  separable and the family is testable with no world package loaded. Methods may answer directly or with a
  promise (the `TreeReaper` precedent); the real engine's `decide()` is async and is awaited.
- **Six doors, two of them read-class.** `world.inspect` and `world.query` are `read` and ask no
  checkpoint; `world.location.add`, `world.character.add`, `world.lore.add` and `world.character.decide`
  are write-class and sit behind the §28 gate. The suite asserts the read count is EXACTLY TWO, because a
  third read door would be a mutation that skipped the gate.
- **`world.character.decide` is NOT a read, and the proof MEASURES why.** The package's
  `CharacterAgent.decide()` stores its answer on the agent (`this.lastDecision = decision`), so a door that
  called this a read would be claiming a mutation did not happen. The proof reads the agent's own
  `getLastDecision()` — **null before the call, non-null after** — which is the mutation, measured. This is
  the same rule that lets `scene.inspect` be read-class and forbids this door from being one.
- **Refusals are spoken by the side that knows the fact.** An unknown `type` lists the nine declared
  location types; an unknown `category` lists the ten declared lore categories; a `limit` that is not a
  finite positive number is refused; a **character may not be placed in a location the world does not
  hold** — checked BEFORE the add, against the world's own ID list, so a typo is refused here rather than
  creating a character that belongs nowhere. (An earlier draft of the file compared the id to the NAME
  list, which would have refused every correctly-named location and accepted any location whose name
  happened to equal an id; it is corrected in the same landing and the reason is in the code.)
- **A missing-arg or unknown-word call never reaches the driver**, so the world cannot be half-written by a
  call the door was going to refuse.
- **Evidence.** `agents/runtime/test/worldTools.test.ts` **21 cases** against a recording fake, and
  `docs/evidence/agents/world-tools-proof.mjs` — a RUNNABLE proof wiring the **REAL** `WorldEngine` behind
  the seam: §1 every tool answer cross-checked against the ENGINE's own `getWorld()`/`getStats()`, §2 the
  §28 gate (a refused write moved the world by 0 and asked the gate 0 times; an approved write moved it by
  1 and asked once), §3 four refusals each naming its own fact with the engine moved by nothing, §4 the
  measured mutation above, §5 **retrieval reaches what the tools wrote** (the RAG finds the lore added
  through the doors, so the family's writes are real writes), §6 this repository's HEAD byte-identical.
  `agent-runtime` **429/429 → 450/450** (32 files), `tsc -p agents/runtime/tsconfig.json` clean.
- **Bounds (§60).** The family creates and reads a world's DECLARED structure; it does not tick the engine,
  drive `executeAction`, connect locations, create factions, manage relationships or goals, save/load a
  world, or configure agents. Nothing in the Studio imports it, no roster registers it by default (a host
  must call `registerWorldTools` with a driver it built), and the decision the engine returns is its own
  DEMO-MODE arithmetic — quoted in the proof as it came (a minimally-populated world scores every action at
  zero and the agent rests) rather than dressed up.

### Amendment 145 (M3 v145, agent-runtime) — the MULTIMODAL slice gets its FIRST CONSUMER, and the family cannot return a result that pretends to be a picture

_Numbering: 145 was free (`grep -an "^### Amendment 14"` topped out at 144). Full narrative in
`docs/evidence/agents/README.md`; this is the ledger entry._

- **The gap this closes.** The multimodal slice — `InMemoryAssetLibrary`, `DemoImageGenerator`,
  `DemoVideoGenerator`, `CharacterConsistencyManager`, `StoryboardManager` — shipped with **13 green tests
  and no consumer outside its own suite**: `grep -rl` for its symbols across `apps/ agents/ packages/`
  matched the module, its barrel and its suite, and nothing else. The 3D lane had the same shape before
  v140 and the world lane before v144.
- **A driver seam, not an import.** `agents/runtime/src/assetTools.ts` declares the narrow `AssetDriver` it
  needs (`engine`, `generateImage`, `listAssets`, `getAsset`, `createStoryboard`, `addFrame`,
  `getStoryboard`) and the HOST supplies the implementation. **`agents/runtime` gains no dependency on
  `@nexus/ai-providers`.** Methods may answer directly or with a promise; the real generators and library
  are async and are awaited.
- **Six doors, three of them read-class.** `asset.list`, `asset.inspect` and `asset.storyboard.inspect` are
  `read` and ask no checkpoint; `asset.image.generate`, `asset.storyboard.create` and
  `asset.storyboard.frame.add` are write-class behind the §28 gate. The suite asserts the read set exactly,
  because a fourth read door would be a mutation that skipped the gate.
- **§60 is ENFORCED here, not promised — this is the whole point of the family.** There is no image or video
  model in this build. So: (1) `asset.image.generate` **REFUSES a driver answer that carries no
  provenance**, rather than forwarding assets a reader could mistake for a real generation's — a result
  that dropped its own `provenance.mode` is the `base64-screenshot-placeholder` defect in a new costume;
  (2) no door is NAMED or DESCRIBED in a way that promises pixels, and the suite asserts both per door;
  (3) no result carries bytes, and the proof measures the reason — **the payload stored beside a generated
  asset is ZERO bytes**, which is the honest size of what DEMO MODE produces, where a plausible non-zero
  size would be a fabrication.
- **A frame's reference is FOLLOWED, not trusted.** `asset.storyboard.frame.add` refuses an `imageRef` the
  library does not hold, checked BEFORE the add — the rule `world.character.add` applies to a location id —
  and the proof resolves a filed frame's `imageRef` back into the library, so the reference is a fact rather
  than a string.
- **Refusals are spoken by the side that knows the fact**, and a missing-arg or malformed-argument call
  never reaches the driver, so the library cannot be half-written by a call the door was going to refuse.
- **Evidence.** `agents/runtime/test/assetTools.test.ts` **23 cases** against a recording fake, and
  `docs/evidence/agents/asset-tools-proof.mjs` — a RUNNABLE proof wiring the **REAL** `DemoImageGenerator`,
  `InMemoryAssetLibrary` and `StoryboardManager` behind the seam: §1 every answer cross-checked against the
  library's own metadata, §2 the three §60 measurements above, §3 the §28 gate, §4 four refusals with the
  library moved by nothing, §5 the followed reference, §6 this repository's HEAD byte-identical.
  `agent-runtime` **450/450 → 473/473** (33 files), `tsc -p agents/runtime/tsconfig.json` clean.
- **Bounds (§60).** The family generates image ASSETS and files storyboards. It does not generate video, it
  does not apply character consistency, it does not delete or update assets or frames, it does not export a
  storyboard, and it never returns bytes — because there are none. No roster registers it by default (a host
  must call `registerAssetTools` with a driver it built), and nothing in the Studio imports it, so M3's
  PRODUCT face is still open.

### Amendment 146 (M5 v146, three-runtime) — a save may not be created on a name that debris already owns, so one atomic write can no longer delete two saves

`packages/three-runtime/src/saveStore.ts` hands out one name for two jobs: `writeAtomic(path)` puts its
half-written file at `${path}.tmp`, and `sweepTempFiles` deletes every listed name ending in that suffix,
while the
single boundary every path crosses refused absolute forms, `..`, `''` and `.` and said nothing about the
suffix.
Full narrative in `docs/evidence/three-runtime/README.md` section v146; this is the ledger entry.

- **Measured before it was fixed, on a re-runnable probe.** `.scratch/vnext/collisionProbe.mjs` asks the
  built
  store seam for the behaviour, and gets it: `resolveSavePath` ACCEPTS `"x.json.tmp"`, then a plain
  `writeAtomic("x.json")` makes that name hold the temp's bytes and renames it away, so `store.list()`
  answers
  `[]` — the hand-named save is gone and the save that was written is gone too, with no throw anywhere. The
  probe's second direction replays the sweeper's own predicate over a listing and puts a caller-written
  `real-save.tmp` INSIDE the deletion set. Neither is theoretical: `test/saveSnapshot.test.ts` planted its
  v126
  debris by calling `store.write('x.json.tmp', …)`, which is the repository demonstrating the hole in its
  own
  suite.
- **The rule is on creation, and the narrowness is the grant.** `resolveNewSavePath` now adds one clause to
  `resolveSavePath` and `write`/`writeAtomic` on both stores go through it; `read`, `exists`, `list` and
  `delete`
  keep the plain boundary. That distinction was made by a counter-example, not by taste: applying the suffix
  rule
  to `resolveSavePath` itself would make `latestSaveFile` throw while it reads the header of every name it
  lists —
  a leftover is a fact about the host, and a store that crashes on one trades a silent loss for a crash in a
  caller that did nothing wrong. Arm W5 below is exactly that widening, and it reddens 9 cases, which is
  how the record knows the narrowness is tested rather than asserted.
- **10 cases in `test/saveNameCollision.test.ts`**, every expectation derived from `SAVE_TEMP_SUFFIX`
  rather than from a typed-out `'.tmp'`, and paired: the refusal, the message that names the save whose temp
  the
  name is, the suffix-not-substring direction (`a.tmp.json`, `progress.tmp2` stay legal), the
  unconstructibility
  of the measured collision, and the four verbs that must keep accepting the name.
- **Arms: 5 of 5 matched their predicted red case names.** - W1 · MATCHED · collected 375 · red in
  saveNameCollision.test.ts: saveStore: a save may not be created on a name debris owns (v-next) creation
  refuses a name that is another save half-written file, and says which save it would land on; saveStore: a
  save may not be created on a name debris owns (v-next) a name that is nothing but the suffix is refused
  too, admitting the save it collides with is not a name; saveStore: a save may not be created on a name
  debris owns (v-next) both stores refuse the creation, because both cross the same creation rule;
  saveStore: a save may not be created on a name debris owns (v-next) the measured collision is
  unconstructible: the save cannot be made, so the atomic write has nothing to land on · red outside: 0
- W2 · MATCHED · collected 375 · red in saveNameCollision.test.ts: saveStore: a save may not be created on a
  name debris owns (v-next) creation refuses a name that is another save half-written file, and says which
  save it would land on; saveStore: a save may not be created on a name debris owns (v-next) both stores
  refuse the creation, because both cross the same creation rule; saveStore: a save may not be created on a
  name debris owns (v-next) the measured collision is unconstructible: the save cannot be made, so the
  atomic write has nothing to land on · red outside: 0
- W3 · MATCHED · collected 375 · red in saveNameCollision.test.ts: saveStore: a save may not be created on a
  name debris owns (v-next) creation refuses a name that is another save half-written file, and says which
  save it would land on · red outside: 0
- W4 · MATCHED · collected 375 · red in saveNameCollision.test.ts: saveStore: a save may not be created on a
  name debris owns (v-next) both stores refuse the creation, because both cross the same creation rule;
  saveStore: a save may not be created on a name debris owns (v-next) the measured collision is
  unconstructible: the save cannot be made, so the atomic write has nothing to land on · red outside: 0
- W5 · MATCHED · collected 375 · red in saveNameCollision.test.ts: saveStore: a save may not be created on a
  name debris owns (v-next) creation refuses a name that is another save half-written file, and says which
  save it would land on; saveStore: a save may not be created on a name debris owns (v-next) a name that is
  nothing but the suffix is refused too, admitting the save it collides with is not a name; saveStore: a
  save may not be created on a name debris owns (v-next) the narrowness is real: the same name still passes
  the boundary that reading and deleting use; saveStore: a save may not be created on a name debris owns
  (v-next) both stores refuse the creation, because both cross the same creation rule; saveStore: a save may
  not be created on a name debris owns (v-next) the measured collision is unconstructible: the save cannot
  be made, so the atomic write has nothing to land on; saveStore: a save may not be created on a name debris
  owns (v-next) debris the host already holds stays listable and readable, so browsing a store cannot crash
  on a leftover; saveStore: a save may not be created on a name debris owns (v-next) delete still takes a
  half-written file back, and says false the second time; saveStore: a save may not be created on a name
  debris owns (v-next) delete keeps the confinement even though it never carried the save-name rule;
  saveStore: a save may not be created on a name debris owns (v-next) the memory store answers false for a
  name it never held instead of pretending · red outside: 1 (declared: 1)
- **Measured on a frozen plane, because the shared worktree had a live writer.** The suite ran on a local
  clone of HEAD with -c core.autocrlf=false (2017f5c, 344 files, the plane's saveStore.ts held 11691 bytes
  with 0 CR, so the plane is the ref's own bytes), built because the shared worktree carried another
  writer's in-flight edits — baseline 365
  cases with 0 red before any of this grant's files entered the plane, 375 across 8 files after,
  0 red, `tsc --noEmit` exit 0, and the worktree staged at +378/-7. The gate numbers and the byte
  claims are the clone plane's; the landed bytes were checked against it after the commit.

**Bounds this entry does not cross.** The rule lives in the store seam; `sweepTempFiles` is unchanged and
still
decides by suffix, so a name that reaches the store from OUTSIDE this package (a file a human put in the
saves
directory) is still deleted by a sweep — what this grant closes is a save being created on that name by a
caller,
which is the direction the probe could actually reach. `deleteSaveFile` and `listSaveFiles` can still be
handed a
debris-shaped name on purpose, and that is the behaviour the sweeper depends on. Nothing outside
`packages/three-runtime` imports the package's store seam yet, so no user-visible outage is repaired here
either;
the v146 face is a runtime with tests.

### Amendment 147 (M5 v147, three-runtime) — a player record that starts above its own ceiling is
refused at the door, so the verb that puts health back cannot take it away

`packages/three-runtime/src/threeRuntime.ts` gave the player's attach door one numeric rule: a finiteness
loop
over its six declared numbers, at `:2915-2919` of `39448f9`. `attachCombatant`, three methods later,
has
refused an above-ceiling health since v138 (`:3208-3210`). The player door stored one, and `healPlayer` does
not
compare a heal to the ceiling — it subtracts from it (`:3090`) — so the stored shape made that difference
negative and the next heal removed health while reporting itself as a heal. Full narrative in
`docs/evidence/three-runtime/README.md` section v147; this is the ledger entry.

- **Measured before it was fixed, on a probe re-run against unpatched HEAD at the landing ref.**
  `.scratch/vnext/probeAtHead.mjs` clones HEAD into a throwaway plane, drops the probe in as a test file,
  runs
  it, and deletes it; its first clause reads the subject file and refuses if the ceiling rule is already
  there,
  because a probe that runs after the fix measures a green tree and calls it a finding. What HEAD answered:
  the
  door accepted health 150 against maxHealth 100, then healPlayer(10) reported healed=-50 and left the body
  at
  100, emitting `playerHealed` while taking 50 away. The same door accepted mana 900 against maxMana 50, and
  refused nothing else; `attachCombatant` refused, in the same run, in the same file.
- **The rule is the two pairs the record declares, and its narrowness is measured.** One loop over
  `(health, maxHealth)` and `(mana, maxMana)`, refusing `value > ceiling`, inserted after the finiteness
  loop so
  the two rules stay two rules. Each refusal names the mechanism its OWN field breaks — the
  `maxHealth - health`
  difference that turns into a removal for health, the report that carries maxMana beside the pool for mana
  —
  because a shared sentence would be a claim about the loop rather than about the number the caller passed.
  The
  sentence also claims nothing in this package raises a ceiling, and the new suite grades that claim against
  the
  source text: the scan that must find no assignment to any max field must still find the three fields that
  do
  move, or a broken scan would print the same zero as a true one. Deliberately NOT included: negative
  records,
  which the probe shows this door still accepts and which no verb here inverts — arm C5 runs exactly that
  widening and reddens the one case whose whole job is to say negatives still pass.
- **The file half inherits the door, and that is a disclosed behaviour change.** `restorePlayer` calls
  `attachPlayer` (`:3008`), and `loadSaveFile` calls `restorePlayer` inside the try whose catch removes
  everything it had already registered (`:1796`, `:1799`). A save written before this clause that holds the
  impossible record is now refused at load instead of played with an inverted heal. Two cases pin it: the
  direct
  refusal, and the loader refusal with its control — the same bytes with the ceiling untouched still file
  the
  body and the player — so the rollback sentence describes a rollback and not a loader that never loads.
- **11 cases in `test/playerCeiling.test.ts`**, across three subjects: what the door now refuses, what the
  file
  half inherits from it, and how narrow the rule is. The refusal directions are paired with their equality
  counterparts — a record exactly at its ceiling is a full pool and stays legal, and a legal record's heal
  report reads as a heal for every amount, including the overflow, the already-full answer of zero, and the
  requirement that no healed figure in the sequence is negative.
- **Arms: 5 of 5 matched their predicted red case names.**
- C1 · MATCHED · the clause never fires (the door stores the impossible record again) · collected 386 · red
  in playerCeiling.test.ts: attachPlayer refuses what attachCombatant already refuses health above maxHealth
  is refused at the door rather than clamped; attachPlayer refuses what attachCombatant already refuses mana
  above maxMana is refused by the same rule, not by a mana-specific one; attachPlayer refuses what
  attachCombatant already refuses each refusal names the mechanism its own field would break; attachPlayer
  refuses what attachCombatant already refuses the measured inversion is now unconstructible: no record for
  healPlayer to invert; the file half inherits the door restorePlayer refuses an above-ceiling record
  because it goes through attachPlayer; the file half inherits the door a save file whose player half
  exceeds the ceiling is refused by the loader, and its half-load goes back; the rule is exactly as wide as
  the mechanism attachCombatant still refuses its own shape, so the two doors agree by word as well as by
  rule · red outside: 0
- C2 · MATCHED · the mana pair is dropped from the rule (health alone is a ceiling) · collected 386 · red in
  playerCeiling.test.ts: attachPlayer refuses what attachCombatant already refuses mana above maxMana is
  refused by the same rule, not by a mana-specific one; attachPlayer refuses what attachCombatant already
  refuses each refusal names the mechanism its own field would break · red outside: 0
- C3 · MATCHED (round 3 at this ref, all 24 attributed) · the comparison becomes >= (a full pool is read as
  impossible) · collected 386 · red in playerCeiling.test.ts: attachPlayer refuses what attachCombatant
  already refuses a record exactly at its ceiling is a full pool, not an impossible one; attachPlayer
  refuses what attachCombatant already refuses each refusal names the mechanism its own field would break;
  attachPlayer refuses what attachCombatant already refuses a legal record has its heal report read as a
  heal for every amount; the file half inherits the door restorePlayer refuses an above-ceiling record
  because it goes through attachPlayer; the file half inherits the door a save file whose player half
  exceeds the ceiling is refused by the loader, and its half-load goes back · red outside: 24 (declared: 24)
- C4 · MATCHED · the two mechanism sentences are swapped (the message no longer names its own field) ·
  collected 386 · red in playerCeiling.test.ts: attachPlayer refuses what attachCombatant already refuses
  each refusal names the mechanism its own field would break · red outside: 0
- C5 · MATCHED · widened to refuse any negative too (this grant is NOT a validity rule) · collected 386 ·
  red in playerCeiling.test.ts: the rule is exactly as wide as the mechanism a negative record still passes
  the door: no measured inversion follows from it · red outside: 0
- **C3 is the finding, not a footnote.** A `>=` was predicted to add one case here; it reddened 5 here and
  24 outside, across the existing suites, because on `>=` the rule fires on the DEFAULT record
  (health 100/100 17x, mana 50/50 3x, health 5/5 1x, health 40/40 1x, health 10/10 1x) — the pool every
  scene in this package begins a playthrough at. That is what makes strict
  `>`
  the rule rather than a preference.
- **Measured on a frozen plane, because the shared worktree has live writers.** The suite ran on a local
  clone of HEAD with -c core.autocrlf=false (39448f9, 345 files, the plane's threeRuntime.ts held 212821
  bytes with 0 CR and hashed 11c9b05565e8, so the plane is the ref's own bytes), built because the shared
  worktree carries other lanes' in-flight edits — baseline
  375
  cases over 8 files with 0 red before any of this grant's bytes entered the plane, then
  386
  cases over 9 files with 0 red, tsc --noEmit exit 0, and the worktree staged at +491/-0.
  Re-run in the shared worktree at the landing, after these bytes were written there: 386 cases over 9
  files, 0 red, with playerCeiling.test.ts collecting 11, and every per-file count equal to the plane's —
  which is what lets a gate figure and a commit figure mean the same code
- **This grant was measured once at a ref that HEAD outgrew, and re-measured here.** The first pass measured
  this patch at c8396a3 — baseline 362 over 7 files, applied 373 over 8 — but 39448f9 moved 18 added and 1
  deleted line of threeRuntime.ts itself, so the anchor, every line citation in this section and C3's
  outside count were re-derived at the landing ref rather than carried over

**Bounds this entry does not cross.** The rule is on the attach door, not on the numbers a verb produces:
`damagePlayer`, `healPlayer` and `spendMana` keep their own clauses and gain none. Negative records still
pass
this door; `attachCombatant` refuses them at `:3204-3206`, and this entry does not silently widen itself to
match, because no measured inversion follows from a negative player record the way one follows from an
above-ceiling one. `player.maxHealth` and `player.maxMana` are still written nowhere after construction, so
a
full pool is permanent: this refuses an impossible record, it does not add a ceiling-raising verb the
package has
no demand for. Nothing outside `packages/three-runtime` calls `attachPlayer`, `restorePlayer` or
`loadSaveFile`, so no user-visible outage is repaired here, and no pre-existing save file is rewritten — a
file
holding the refused shape is refused, which is the loss this entry chooses over the inverted heal.


### Amendment 149 (M2 v149, evidence+agent-runtime) — the index does not count a tree that is not this tree

A directory that carries its own `.git` is ANOTHER repository — a clone, a scratch checkout, a
submodule worktree — and its files belong to that tree, not this one. The fix adds a lookahead
peek in `realfs.collectTextFiles` (the runtime walker) and mirrors the same rule in the
proof's own walk (`code-index-proof.mjs`): before descending into a child directory, read its
entries once; if any entry is named `.git`, skip the whole subtree.

Measured before this commit on the worktree plane:

- `code-index-proof` indexed 1787 files (five full clones under `.scratch/vnext/`), the query
  `rigidRotateRect rotatePointAbout` returned `.scratch/vnext/plane*/geometry.ts` in every top-5
  slot, and the real `packages/design-model/src/geometry.ts` was pushed out — the proof was red.
- `isolated-proof` compared the worktree run (red) against the clean run (green) and failed on
  "the VERDICT does not depend on which tree it ran in".
- `provenance-proof` materialized the smallest committed proof (code-index) and it exited 1.

Measured after the fix on the worktree plane (standalone, dist rebuilt):

- `code-index-proof` indexes 353 files, `geometry.ts` is at #1 in the top-5, all three queries
  surface their expected files, exit 0.
- Walked tree drops from 1787 to 353 files (the seven nested-repo directories under `.scratch/`
  are excluded), untracked-in-corpus drops from ~1500 to ~100.
- `npm test` 12/12 tasks green (agent-runtime 33, exec-host 8, studio 18, etc.), `lint` and
  `typecheck` green.

A unit witness was added to `realfs.test.ts`: a directory containing `.git` (whether a dir or a
gitlink file) is not ingested; the host tree still ingests. The proof's regression witness is
the code-index top-5 assertion, which was red without the rule and green with it.

Bounds, stated honestly: the root is never tested this way — a walk that starts inside a
repository must not refuse it — so a submodule's content is not indexed here (it answers to
another tree; this repo has none). The rule reads the directory, so a name-based skip cannot
be the answer (`vnext/plane4` is not a magic name). The fix is one condition, measured on
both planes.



Two-plane sweep at `6478308` (this commit plus its docs):

- **worktree**: 76 scripts · 0 failed · 0 killed · 727 s · graded build `4695286965bc2cb1` (296 dist files) · tree `6e648ab19d2da653` (395 files) · dirty-sources 0
- **isolated**: 76 scripts · 0 failed · 0 killed · 601 s · graded build `4695286965bc2cb1` · tree `dbdf0a1d58d4d3ca` (248 files) · dirty-sources 0

The sweep's `code-index-proof` now indexes ~395 files (was 1787) and returns the real `geometry.ts` at #1 for the first query; all three queries surface their expected files. The `isolated-proof` verdict-independence check passes because the worktree run is now green. The `provenance-proof` materialized proof passes.
### Amendment 148 (M4 v148, studio + world-engine) — the WORLD lane gets its PRODUCT consumer, and the reason it had none was that the package could not be imported at all

_Numbering: 148 — 146 and 147 were claimed by the three-runtime lane in the same cycle (`39448f9`,
`afc16a7`). Full narrative in `docs/evidence/studio/README.md`; this is the ledger entry._

- **The bound this closes.** v144 gave the world lane an AGENT consumer and wrote its own remaining gap in
  the same breath: *"nothing in the Studio imports it, so M4's PRODUCT face is still open."* This closes
  the product half: the Studio grows a `World` surface beside `2D` and `3D`.
- **Why the package had no consumer at all — the finding, not the assumption.** `packages/world-engine`
  declared **no `main`, no `module`, no `types`, no `exports` and no `files`**. Nothing outside the package
  could import it: its own suite reached it through `../src/index.js`, which is why 31 green tests never
  surfaced the gap. The missing consumer was not an oversight in the lanes; **the package was not
  consumable.** v148 adds the five fields (the shape `three-runtime` already had) and removes a declared
  dependency on `@nexus/design-model` that **zero files imported** — the same correction v108 made to the
  3D package's dependency list.
- **The split, the same one v142 used for the 3D surface.** `apps/studio/src/lib/world.ts` is the PURE half
  (`buildStudioWorld`, `buildWorldReport`, over a structural `WorldEngineLike`), unit-testable with no
  React, no DOM and no world package — which is also what keeps it loadable during Next's SSR pass.
  `apps/studio/src/components/WorldPanel.tsx` is the only file that touches a real `WorldEngine`.
  `apps/studio` gains `@nexus/world-engine` in `dependencies` and `transpilePackages`, so the build order
  is declared rather than accidental.
- **The read-only bridge, on the same terms as the scene one.** `installWorldBridge` publishes
  `window.__nexusWorld.world()`, a lazy read over the live engine with no mutators, and the panel
  UNREGISTERS on teardown so `world()` answers `null` once the surface is gone rather than describing a
  world that is no longer on screen.
- **The surface set is now DERIVED, not restated.** v142 wrote `['2d', '3d']` into two cases by hand, so a
  third surface failed them on a literal rather than on a wiring mistake. `surface.test.ts` now reads the
  members out of the store's own `export type Surface = …`, and asserts that the declared set, the
  toolbar's `data-surface-toggle` attrs and the branches Studio renders are the SAME SET — so a surface
  added to the union with no toggle fails, and a toggle wired to an undeclared name fails.
- **§60 holds on this surface too.** The panel says `DEMO MODE · no model is attached` on its own face; the
  headless proof asserts the composed world uses ONLY the package's declared location types and lore
  categories, and that the report carries **no field naming a provider or a model** — because none is
  attached. The panel's own closing line states what it does not do: it composes and reads a world, it does
  not simulate one.
- **Evidence, in three layers that agree.** `apps/studio/src/lib/world.test.ts` (11 cases, no DOM);
  `docs/evidence/studio/world-surface-proof.mjs` — which grades the SHIPPED Studio module (type-stripped
  through `node:module`, not copied) over the SHIPPED engine: §1 the composed world IS the engine's, §2
  every character's place verified by looking its id up (a name can be right while the relation is wrong),
  §3 the report is DERIVED — moving the engine through its own API moves the report, and a dangling place
  reports `null` rather than an id or a wrong name, §4 the §60 vocabulary and no-model checks, §5 HEAD
  byte-identical; and `tools/harness/studio-world.mjs` — the REAL browser over CDP, **14/14 assertions**:
  the 2D canvas is still the default and still paints, the `World` toggle swaps the surface, the bridge
  answers, every character stands in a location the world holds, **the panel's rows are the bridge's
  report** (so the surface is not a second story), the mode is named on screen, the stat tiles are
  labelled, a PNG is written, `2D` restores the canvas, and `world()` is `null` once unmounted.
- **Gates.** apps/studio **149/149 → 164/164** (18 files), `tsc --noEmit` clean · packages/world-engine
  31/31 · `world-surface-proof.mjs` green · `studio-world.mjs` 14/14 in a real browser.
- **Bounds (§60).** The surface COMPOSES and READS a world. Nothing ticks the engine, no character acts,
  no relationship or goal is simulated, and the RAG is queryable from the agent lane rather than from the
  panel. The world is not part of the design document and is not persisted (the same boundary `previewOpen`
  and the 3D scene sit on), and the surface is one of three views rather than a new document concept.

### Amendment 151 (M2 v151, evidence) — the EBUSY cross-plane probe finds zero contention

Amendment 107 addendum corrected the claim that EBUSY was deterministic; it is intermittent
and plane-dependent. This increment adds a dedicated measurement: `ebusy-proof.mjs` runs
four concurrent git shapes on both planes and records the raw EBUSY rate.

Measured on the worktree plane (340 spawns across four scenarios):

- `clone --shared --no-checkout` ×40: 0 EBUSY (0.00%)
- `checkout HEAD` ×80: 0 EBUSY (0.00%)
- `rev-parse HEAD` ×160: 0 EBUSY (0.00%)
- `status --porcelain` ×60: 0 EBUSY (0.00%)

Total: 340 spawns, 0 EBUSY (0.00%). The failures previously attributed to EBUSY in
amendment 107 were `otherErr` (destination exists, lock contention, etc.), not EBUSY.

The isolated plane will be measured by the sweep and recorded here when it runs.

The proof is a measurement, not a gate — it always passes and writes a JSON artifact
to `.scratch/ebusy-<plane>-<ts>.json` for the record.


### Amendment 150 (M5 v150, three-runtime) — a save name has ONE owner between the confinement and the host: the
backslash that already decided a refusal now decides the bytes on disk

`packages/three-runtime/src/saveStore.ts` confined a save name by splitting it on `[\\/]` (`:92` at `0ea322e`) and
then handed the name to the host UNCHANGED. One policy, two owners of the name's identity: a backslash was a
separator when it helped refuse `saves\..\escape.json`, and an ordinary character the moment the same bytes reached
a POSIX host — where `saves\hero.json` is one file whose NAME holds a backslash — while this host writes it into a
directory. So `list()` was a count that depended on the machine reading it, and a save the caller wrote under one
spelling could be silently replaced by a write under the other. Measured by a 12-leg probe
(`.scratch/vnext/probe196.mjs`, `probe196-measurement.json`: all 12 legs green at `c8396a3`), and re-collected at the
landing ref as run A: 12 legs collected, 11 green, and the twelfth — `sweepTempFiles` reaching a backslash-named temp
— is now UNREACHABLE for a v146 reason (`resolveNewSavePath` refuses to CREATE a name ending in `.tmp`,
`saveStore.ts:121`). That red is attributed and recorded beside the hole rather than counted as the hole closing.

- **Canonicalising was measured and REJECTED, not skipped.** `decide196.mjs` ran one decision probe under three
  rules on the same frozen plane — `none` (shipped), `refuse`, and `canonical` (`return path.replace(/\\/g,'/')`) —
  with the legacy name seeded BELOW the seam, which is what the shipped code produced before any rule existed. The
  third rule answers `delete() -> false` ("the path held nothing") while the host still holds the bytes, and sends a
  write under the other spelling to a file the caller never named. That is the lie this seam refuses everywhere
  else — v122's rule, a store must not report a success it cannot perform, and by the same logic must not report an
  emptiness it cannot see — so `refuse` won, and a case pins the absence: the shipped door contains
  `replace(/\\/g, '/')` exactly 0 times.
- **The rule is a re-join, and the obvious clause was FALSIFIED by measurement.** The first draft asked
  `segments.some((segment) => segment.includes('\\'))` AFTER that split — and the split had already eaten every
  backslash, so the clause could never fire. Round 1 of the grant's own run said so out loud: `tsc --noEmit` exit 0,
  403 cases collected, and the door refusing nothing while ten refusal cases printed
  `expected [Function] to throw an error`. The rule that can still see the difference is
  `segments.join('/') !== path` (`:111`): a name whose segments do not re-join is precisely a name that was split on
  something the store does not join with, and every other shape is already refused by the clauses above it. The
  grant file now pins the vacuous shape itself — `cannot be written against the segments, because the split that
  reads the name already ate the backslash` — and the census asserts the segment scan appears 0 times beside the
  re-join appearing once, so a future edit that restores the dead clause reddens the file rather than hiding in it.
- **A name the CALLER chose meets the door; a name the STORE chose is reported.** `resolveSavePath` throws for
  write, read, exists, delete and — through `resolveNewSavePath` — for creation. `list()` is a fact about the host,
  so a name that predates the rule stays listed, and `savePathRefusal` (`:126`, the same door without the throw)
  turns it into a bucket instead of an exception escaping a menu: `latestSaveFile` asks at `:1952`,
  `sweepTempFiles` at `:2023` (its record gains `refused`), `diagnoseSaveFiles` at `:2141` (its reason union gains
  `name-not-reenterable`). No branch keys on the wording — the case that seeds `a/.` joins the same bucket carrying
  the `.` rule's own sentence, which is what makes the bucket structural rather than a string match.
- **18 cases in `test/saveNameSpelling.test.ts`**, across four subjects: what the door refuses, what the store
  reports about a name it cannot re-enter, every verb refusing a caller-chosen name out loud, and how narrow the
  rule is. Three shipped `toEqual` pins in `test/saveSnapshot.test.ts` gain `refused: []`, because a sweep record
  that grows a field must be re-pinned where it was pinned rather than exempted.
- **Arms: 7 of 8 MATCHED their predicted red case names; W2 is deliberately COUNTED, not predicted.** Every arm is a
  single edit applied to run C's plane, restored before the next, and 0 red landed outside the grant file in any of
  them.
  - W1 · MATCHED · the re-join clause is deleted from the door · collected 404 · 12 red, all predicted, in
    saveNameSpelling.test.ts · outside 0 · the naming-rule census GREEN
  - W2 · COUNTED · the clause widens to refuse EVERY name · collected 404 · 61 red = 10 in-grant + 51 outside, in
    saveNameCollision (10), saveNameSpelling (10) and saveSnapshot (41) — the blast radius of the rule measured
    rather than asserted · outside 0 by construction, since outside IS the count
  - W3 · MATCHED · the guard is removed from `latestSaveFile` · 2 red: the save menu survives the refused name… /
    the three surveys that re-enter a listed name all ask the door… · census RED · outside 0
  - W4 · MATCHED · removed from `diagnoseSaveFiles` · 3 red: the diagnosis gives it a reason of its own / the branch
    does not read the message / the three surveys… · census RED · outside 0
  - W5 · MATCHED · removed from `sweepTempFiles` · 2 red: the sweep reports a refused temp… / the three surveys… ·
    census RED · outside 0
  - W6 · MATCHED · a refused temp is pushed into `kept` instead of `refused` · 1 red: the sweep reports a refused
    temp, still removes the rest, and does not call it kept · census GREEN · outside 0
  - W7 · MATCHED · the refused name borrows the `not-json` reason · 3 red: its own reason / the branch does not read
    the message / the three surveys… · census RED · outside 0
  - W8 · MATCHED · `savePathRefusal` always answers `null` (the door stays, the surveys stop asking) · 5 red: the
    four reporting cases + `savePathRefusal answers about every name` · **census GREEN** — this is the arm that
    separates behaviour from tokens: the call sites are still in the text while the behaviour is gone, and the file
    says so
- **Measured on a frozen plane, because the shared worktree has live writers.** `git clone -c core.autocrlf=false`
  of `0ea322ecb8b0095c0011917d7b6540589c60c261` into `.scratch/vnext/plane6`; plane identity asserted before any run
  (the plane's `saveStore.ts` 13,957 B / `79f8772f2136`, `threeRuntime.ts` 214,370 B / `d997aa881675`,
  `saveSnapshot.test.ts` 167,816 B / `999980ce683a`, 0 CR in each). A0: 386 cases over 9 files, 0 red — v147's
  published number, re-measured here rather than carried over. C: 404 cases over 10 files, 0 red, `tsc --noEmit`
  exit 0. The final tree was restored to run C and graded again: 404 over 10, 0 failed, `equals run C: true`.
  Harness `.scratch/vnext/planeMeasure196.mjs`, artifact `.scratch/vnext/plane6-measurement.json`, predictions
  `.scratch/vnext/PREDICTIONS-196.md` (round 1 and round 2, both kept). Nothing in this grant wrote to the shared
  worktree during measurement.

**Bounds this entry does not cross.** The rule is about NAMES, not contents: a readable save whose name re-joins is
still a readable save, and a refused name is never rewritten onto another file. Nothing rewrites or deletes a legacy
file the host already holds — `list()` still prints its name, and the surveys now say out loud that this build will
not re-enter it; the repair is outside the seam, on the host, by whoever owns the directory. This grant adds no
consumer: 66 sites call `writeSaveFile`/`readSaveFile`/`deleteSaveFile` at `0ea322e`, and outside the package's own
tests the carriers are three docs plus the declarations in `src/threeRuntime.ts`, so no shipped caller passes a
backslash today and no user-visible outage is repaired here — the exposure is a caller's own string (a pasted
Windows path in a save dialog is the obvious one), which is exactly the class a confinement rule exists for. The
POSIX half of the divergence is measured against an injected POSIX-semantics host inside the grant file, not against
this machine, which is Windows; the Windows half was measured on it. `sweepTempFiles()` gained a field, so a reader
that pinned the whole record had to be re-pinned — three such pins, all in `test/saveSnapshot.test.ts` — and no
other return shape changed.




### Amendment 153 (M3 v153, studio + ai-providers) — the MULTIMODAL lane gets its PRODUCT consumer: a Studio `Assets` surface that composes and reads a storyboard, and reports what DEMO MODE really holds

_Numbering: 153 — the agent lane's `assetTools.ts` was 145; 146–152 were taken by the three-runtime and evidence lanes. Full narrative in `docs/evidence/studio/README.md`; this is the ledger entry._

- **The bound this closes.** v145 gave the multimodal lane an AGENT consumer and wrote its own remaining gap in the same breath: *"no Studio surface for any of it yet, so the product half is still open."* This closes the product half: the Studio grows an `Assets` surface beside `2D`, `3D` and `World`.
- **The split, the same one v142 and v148 used.** `apps/studio/src/lib/assets.ts` is the PURE half (`buildStudioAssets`, `buildAssetReport`, over narrow structural `AssetGeneratorLike`/`AssetLibraryLike`/`StoryboardManagerLike`), unit-testable with no React, no DOM and no ai-providers — and loadable during Next's SSR pass, where importing a generator would be pointless work. `apps/studio/src/components/AssetPanel.tsx` is the only file that touches the real `DemoImageGenerator`, `InMemoryAssetLibrary` and `StoryboardManager`. The surface is added to `export type Surface` and the toolbar, so the derived-set check in `surface.test.ts` now enumerates `['2d','3d','world','assets']`.
- **The read-only bridge, on the same terms as the scene and world ones.** `installAssetBridge` publishes `window.__nexusAssets.assets()`, a lazy read over the latest report with no mutators, and the panel UNREGISTERS on teardown (`installAssetBridge(() => null)`) so `assets()` answers `null` once the surface is gone rather than describing a library no longer on screen.
- **§60 is built into the types, not asserted in prose.** The structural interfaces declare only the fields the module reads — including `provenance.mode` as the one provenance field used, so a type carrying a wider `Provenance` still satisfies it. Every asset is stored with an EMPTY payload because DEMO MODE produces no pixels, and `storedBytes` is summed from what the LIBRARY holds, so the number is checkable rather than believable. The panel renders **no `<img>`** (there is no image, and an element would imply one), states `DEMO MODE · no image model is attached` on its own face, and the report names no provider, model or picture.
- **The library's order is the library's, not the prompt's.** `InMemoryAssetLibrary` returns assets newest-first (`updatedAt` desc, id tiebreak); the surface presents that order and puts the prompt order only where it is guaranteed — in the storyboard's `frames`. Both the unit suite and the proof assert the report lists assets in the LIBRARY's order and NOT in the composition order.
- **Evidence, in three layers that agree.** `apps/studio/src/lib/assets.test.ts` (14 cases, no DOM); `docs/evidence/studio/asset-surface-proof.mjs` — graded from the SHIPPED Studio module (type-stripped through `node:module`, not copied) over the SHIPPED generators: §1 the composed assets ARE the library's (each id retrievable with the name/mimeType/prompt asked for), §2 §60 measured (`demo` carried through, `storedBytes` 0, zero-byte payloads, no model/provider named), §3 the report is DERIVED (growing the library moves the count 3→4 while the storyboard keeps its frames), §4 every frame's `imageRef` is FOLLOWED back into the library and resolves to the asset for its own shot, §5 home HEAD byte-identical; and `tools/harness/studio-assets.mjs` (**17/17 in a real browser**): default surface stays the 2D canvas (482900/482900 px), the `Assets` toggle mounts `#nexus-assets` and unmounts the canvas, the bridge answers once composition lands, `storedBytes` and every per-asset byte read 0, zero `<img>` elements, the on-screen rows match the bridge report, a 125 KB PNG is written, pressing `2D` restores the canvas to full paint, and `assets()` answers `null` after unmount.
- **Studio suite moved 149/149 (17 files) → 182/182 (19 files)**; `tsc --noEmit` clean; the two new files are the asset surface's. `@nexus/ai-providers` remains 20/20.
- **Honest bounds, stated not hidden.** The surface composes ONE fixed scene (three harbour shots) and does not let the user add/delete assets or storyboards (those write doors live in the agent lane); video generation and character consistency still have no product surface; the generators remain DEMO MODE (no keys, no pixels); `lib/assets.ts` is structural/SSR-safe by design, so the panel — the only consumer of the real classes — owns the demo behavior.
### Amendment 154 (M2 v154, evidence) — the Amendment 129 behavioral probe runs and all reason-field mutations are caught

Amendment 129 introduced a discriminated `reason` field on the `unreadable` entries of the save-file survey:
`'not-json' | 'listed-then-missing' | 'name-not-reenterable'`. The 129 record carried a debt:
the mutation probe harness could not be applied because CRLF line-ending conflicts in the working copy
prevented the patch from applying (a two-line anchor never matched, and a heredoc patch produced a
syntax error). The code change was not evidence for a mutation claim without the probe.

Since then, Amendment 149 fixed the CRLF line-ending issue (nested-repo exclusion, `core.autocrlf=false`
on the isolated plane). This increment applies the mutation probe programmatically — no patch, no
heredoc, no manual edit — and verifies that the three-runtime tests catch every mutation of the three
reason strings:

- `'not-json'` → `'not-json-mutated'`: tests FAIL (mutation caught)
- `'listed-then-missing'` → `'listed-then-missing-mutated'`: tests FAIL (mutation caught)
- `'name-not-reenterable'` → `'name-not-reenterable-mutated'`: tests FAIL (mutation caught)

All three mutations are caught by the existing `saveSnapshot.test.ts` suite. The probe is implemented
as `docs/evidence/agents/amendment129-probe.mjs` (committed as `0432ef6`): it programmatically mutates
each reason string in `packages/three-runtime/src/threeRuntime.ts`, runs the `saveSnapshot.test.ts`
suite via `vitest run`, and asserts the tests fail. The probe restores the original source after each
mutation. All three mutations are caught — the debt from Amendment 129 is retired.

The probe is committed as `docs/evidence/agents/amendment129-probe.mjs` and can be run independently:
`node docs/evidence/agents/amendment129-probe.mjs`.


### Amendment 152 (M2 v152, evidence) — the EBUSY fault is the SYNC SPAWN FAMILY, not contention: amendment 151's "0.00%" does not reproduce, and the proof that produced it could not have settled the question

_Corrects amendment 151. Numbering: 152 was free (`grep -an "^### Amendment 15"` topped out at 151)._

- **What 151 recorded.** *"Measured on the worktree plane (340 spawns across four scenarios): 0 EBUSY
  (0.00%) … The failures previously attributed to EBUSY in amendment 107 were `otherErr` (destination
  exists, lock contention, etc.), not EBUSY."*
- **What reproduces.** Re-run on 2026-10-02 against the proof as shipped, the SAME four scenarios reported
  **340 EBUSY in 340 spawns (100.00%)**, and a plain sequential `spawnSync('git', ['rev-parse','HEAD'])` ×20
  reported **20/20 EBUSY**. The record therefore contradicted both its own proof and `docs/KNOWN_ISSUES.md`,
  which had said the sync family was broken on this host all along. **§60: a record that does not reproduce
  is a defect, and it is the record that is corrected here — not the measurement.**
- **Why the shipped proof could not have settled it.** It wrapped a SYNCHRONOUS `spawnSync` inside a
  `new Promise` executor — `promises.push(new Promise(resolve => { const r = runGit(...); resolve(r); }))`.
  `runGit` completes before the executor returns, so the four "concurrent" spawns in each batch ran one
  after another: **the concurrency was decorative.** A contention measurement whose spawns never contend
  cannot distinguish contention from an unconditional fault. The number it printed (0%) is what the ASYNC
  path gives, not what the sync path it actually called gives — which is exactly the confusion the record
  then repeated.
- **The rewrite measures BOTH arms**, so the comparison is in the data rather than in a reader's head: the
  concurrent arm uses async `spawn` (up to 8 children genuinely alive at once) and the sequential arm is the
  control. Measured on the worktree plane: **concurrent 0/340 (0.00%) · sequential 60/60 (100.00%)**.
- **The verdict, as arithmetic: `SYNC-FAMILY`.** The sequential control fails at 100% while the concurrent
  arm is clean, so the fault belongs to the `spawnSync` API itself and has nothing to do with contention.
  The proof states this verdict itself (with the two other cases — `CONTENTION`, `CLEAN` — named as
  alternatives) rather than leaving it to prose.
- **A real contention artifact, kept apart from EBUSY.** Concurrent `checkout HEAD` reported 39 ok / **41
  `otherErr`** — concurrent checkouts in one repository contend on the index lock. It is classified as
  `otherErr`, not EBUSY, and the record says so; this is the one shape where concurrency does cause failures,
  and it is not the failure 107 named.
- **Why this matters beyond the record.** `docs/evidence/lib/syncproc.mjs` — which re-implements the sync API
  on the async path through a Worker and `Atomics.wait` — is load-bearing rather than a convenience, and
  every proof that imports it works for a measured reason: **the async family is clean at 8-way concurrency
  while the sync family fails unconditionally.** The rule for any future proof is now sharper than "avoid
  spawnSync": *the sync family is unusable on this host, and a claim about contention must measure a
  concurrent arm against a sequential control.*
- **Evidence.** `docs/evidence/agents/ebusy-proof.mjs` (rewritten; a MEASUREMENT, not a gate — it always
  exits 0, prints the verdict and writes `.scratch/ebusy-<plane>-<ts>.json`), and the corrected section in
  `docs/evidence/agents/README.md`.

### Amendment 155 (M5 v155, three-runtime) — a declared file shape is owned by a FIELD PATH or it is refused by name: the shape gate now counts `Serialized*` shapes instead of trusting one root's reach

`src/types.ts` declares 12 `Serialized*` interfaces at `b73165c` (SerializedCinematic, SerializedCinematicSequence, SerializedCinematicShot, SerializedCurve, SerializedEntity, SerializedEuler, SerializedNPC, SerializedPlayer, SerializedQuestSystem, SerializedScene, SerializedSceneGraph, SerializedVector3).
The suite ships a `declaredFields('NAME')` helper, and 2 of its 10 test files call it with a
`Serialized*` name; together they ask about 7 of the declared names, so the other 5 —
SerializedEuler, SerializedQuestSystem, SerializedScene, SerializedSceneGraph, SerializedVector3 — were named by no gate at all. 2 of them sit INSIDE `SaveFile`'s reach and are
written by src code (`vectorToData` at `threeRuntime.ts:947`, `eulerToData` at
`:958`): every exact-key gate in the suite stops at the top level of `SerializedEntity`, so a
nested shape could grow, shrink, or lose the field its own docstring calls part of the pose
(`types.ts:484` — an Euler flattened without its `order` restores as NaN) and nothing would say so.

The new gate (`test/serializedShapeName.test.ts`, 13 cases) is a CENSUS rather than a list. Its population is read off
`export interface Serialized*\b` declarations, so a shape added tomorrow joins without anyone editing a table. Each declared
shape must then be owned: the file climbs declared field types from either root and prints the chain
(`SaveData.sceneGraph → SerializedSceneGraph.scenes`), and every link is re-checked against the parent's own
field list. A shape inside `SaveFile`'s reach is legal only if some test file compares a writer's keys to it —
read out of the test sources themselves, so a gate another grant adds later counts — or if this file does it,
which it now does for the 2 transform shapes. A shape outside it is legal only if its chain's FIRST hop leaves
`SaveData` at a field the audit reports as blocked, with a reason; measured, that is
`quests` and `sceneGraph` (`threeRuntime.ts:240` is the row that owns the Map the file refuses).
The two roots are different sets and the gate pins the difference instead of assuming it: only the file reaches
1 shape (SerializedPlayer), only `SaveData` reaches
3 (SerializedQuestSystem, SerializedScene, SerializedSceneGraph).

**Measured.** Plane `.scratch/vnext/plane7e` (clone of `b73165cb1fa111bb87985c09f329b0dd1ed28fdf`, `core.autocrlf=false`): baseline 404 cases over 10
files, 0 red; with the gate 417 over 11, 0 red, `tsc --noEmit` exit 0; after restoring the
gate file the final run is 417 over 11, 0 red, tsc exit 0. Round 4 measured this gate at `edf8681`; since then HEAD has taken 9 more commits and the shared ADR-0016 ledger has grown from amendment 150 to 154, so the plane was re-cloned at `b73165c` and re-run end to end: every one of the six measurement fields (baseline, withGate, tscWith, arms, final, finalTsc) in `.scratch/vnext/p7e-measurement.json` is byte-identical to the `plane7d` file at `edf8681`, which is the check that the intervening commits touched nothing this package owns. 5 arms, each re-based to HEAD's
bytes before it was applied: S1 MATCHED, S2 MATCHED, S3 MATCHED, S4 MATCHED, S5 MATCHED. Round 1 and round 2 of this grant were spent on the gate reddening on its own
HEAD: first a clause that claimed each unreached shape is typed by a `SaveData` FIELD (`SerializedScene` is
typed by `SerializedSceneGraph.scenes` — a true defect in my claim, not in the tree), then a chain printer that
returned `hops.reverse()`, which mutates, so its caller read the LEAF hop as the root and named a field
(`SaveData.scenes`) that does not exist. The clause now asserts `hops[0].parent === 'SaveData'` so the
direction is checked, not assumed. Round 3 made the gate green and then returned 1 arm whose in-gate reds were exceptions rather than verdicts (S3 — 5 of its 5 in-gate reds read `Error:`, and 98 more reds landed outside the gate), 2 arms whose red lists came out larger than predicted (S3, S4) and 1 arm whose predicted `tsc` exit was wrong (S1: predicted 1, measured 2); all 5 arms published here redden on assertions only. The arm that round 4 published instead keeps every declared key and lies about the value (`the Euler writer keeps every declared key but stops carrying the live order (it always writes 'XYZ')`), so the writer's own type check stays out of the way and the only red left is the comparison's; and the empty-climb arm (`the SaveFile climb reads nothing (an empty reach wearing a green coverage case)`) reddens the coverage case as well, because that case pins that the shapes it compares are still reached — a self-pin written and never predicted.

**Bounds this entry does not cross.** This grant changes no src behaviour and no file format: `SaveFile` and
`SaveData` are exactly as they were, and the gate is a reader of `types.ts`. It does not make a refused shape
savable — the 3 shapes no shipped gate named and this file does not compare (`SerializedQuestSystem`, `SerializedScene` and `SerializedSceneGraph`) stay in the blocked half, and the census is what
keeps them honest there. `SerializedScene` is owned through a Map the file cannot hold, so the chain's root row,
not the shape, is what the audit refuses. 27 of the 72 exported type names in `types.ts`
are named by none of the package's three code modules (`threeRuntime.ts`, `saveStore.ts`, `renderBackend.ts`); that count and
the face claim just below are derived from HEAD's bytes by `.scratch/vnext/land155.mjs` itself, and naming those types is a
different grant. One limit of the new gate is said rather than hidden: its "declared outside `types.ts`" scan reads those
three modules plus `types.ts`, while `index.ts` is a barrel that declares nothing locally at
`b73165c` — so a shape declared in the package face today would be invisible to the census, and whoever adds one must
widen that list in the same grant.

### Amendment 156 — v156 (docs/evidence): amendment 82's record was owed, and a citation in a neighbour's sentence is not a record

- **The hole §7 named and this increment closes.** `table-recount-proof.mjs` reported the one-sided set as 21 and 82:
  granted in this ledger, titled nowhere in the record corpus. v82 is not unmentioned — it is mentioned inside v81's
  bounds, v84's withdrawal and the census prose, where it functions as a neighbour. The reader's rule ("a record TITLE
  is a heading in a doc or the line that opens a proof") is what separates the two, so the fix is the heading, not
  another paragraph of thanks.
- **Written from HEAD's bytes, not from the ledger's memory.** Every citation in `README.md`'s new section is derived
  at landing time from `git show HEAD:` of `sweep.mjs` and `isolated-proof.mjs` (`describeBuild()` and its two
  refusals, the `dest`-not-`root` log rule, the re-read-and-re-derive assertion, §3b's asserted banner distance), and
  the landing script refuses if any needle does not match exactly one line. The ref quoted for the historical run is
  checked with `git cat-file -e` rather than typed.
- **The record keeps v84's correction inside itself.** Amendment 82's own bullet quotes a studio build that v84 showed
  was produced by the runner's drive placement. The section says so in the same breath as the rule, because a record
  that restores the original wording would restore the wrong attribution too — and the RULE survives precisely because
  §3b grades it on text no host can change.
- **Not written here, on purpose.** Amendment 21 stays one-sided: its ledger bullets carry per-ref test counts that
  nobody has re-measured since, and this cycle refuses to launder them into a record.

### Amendment 157 — v157 (docs/evidence): a witness whose subject is the hole it exists to close will be deleted by its own success
- **Measured, not theorised.** Amendment 82's record (`215026c`'s successor, grant 156) closed v82's title hole
  and the §7 door CRASHED on the way to grading it: `assert.ok(chained.length, …)` demanded that some granted number
  be titled ONLY below a module's opening line, and that set is a subset of the holes this ledger is working to empty.
  Writing records was therefore guaranteed to destroy the arm, one grant at a time.
- **What replaced it.** The subject is now the window-only SITE population — the lines the deep reader titles and the
  positional reader refuses — with a floor that refuses a tree where the readers agree everywhere, a per-row claim that
  refusing a deep line loses no record, and an in-memory scrub arm that deletes every positional title of one deep
  row's number and requires the hole to name it while the window still titles it. One derivation (`deepOnly`) serves
  both the claim and the arm, so the arm cannot pass by testing a population the printed sentence never used.
- **The rule it records did not change.** Titles are still read positionally, the one-sided set is still 21, and no
  test row moved; what changed is which quantity the door is allowed to depend on.

### Amendment 158 — v158 (docs/evidence): an arm that requires its subject to be a rare shape is a witness until the tree gets healthier
- **Measured, not theorised.** §7's strip arm selected "a granted number with EXACTLY ONE title site" and then refused any line
  that also credited a grant titled elsewhere. Both conditions are shrunk by writing records: a doc heading is a title wherever it
  stands, so each new section adds a site to the numbers it credits. At this ref the census the door now prints reads
  **1 site(s): 39 grant(s) · 2 site(s): 59 grant(s) · 3 site(s): 46 grant(s) · 4 site(s): 3 grant(s) · 5 site(s): 4 grant(s)** — 39 grants still sit at one site, and 2 of them share that site with a better-recorded grant, which is
  the state in which the old per-line guard would have crashed the arm with the rest of that population still strippable.
- **What replaced it.** The subject is the SPARSEST site count (a floor that cannot starve while anything is titled), scrubbing
  reaches EVERY site of that grant, and the gained set is derived from one `creditedAt`/`scrubOf` pair shared by the claim and the
  arm. A second arm takes the shape the old guard forbade — a one-site grant heading-in-common with a well-recorded one — and
  requires the scrub to redden the first while the second stays titled: 109 in, [110] out, measured on `docs/evidence/agents/README.md:3031`.
- **The rule it records did not change.** Titles are still read positionally, the one-sided set is still [21], and no test
  row moved; what changed is which populations the door may depend on, and the multi-grant heading went from an exclusion to a case.

### Amendment 159 (M3 v159, studio) — the Assets surface becomes INTERACTIVE: the library can be grown and shrunk from the panel, and §60 holds across both writes

_Numbering: 159 was free (`grep -ao "^### Amendment 1[0-9][0-9]"` topped out at 158). This is item 1 of the
priority queue in `docs/DEVELOPMENT_PLAN.md`. Full narrative in `docs/evidence/studio/README.md`; this is
the ledger entry._

- **The gap this closes.** v153's surface COMPOSED a fixed set of three shots on mount. That demonstrates
  what a storyboard is; it does not answer *"what if I generate one more?"*, and its own record said so:
  *"the surface composes a fixed scene"*. v159 adds the smallest pair that makes it a surface a person can
  use — generate one, remove one.
- **`generateAsset(generator, library, prompt)`** trims the prompt and **refuses an empty one at the door**
  rather than sending it: an asset whose name says nothing would still be listed as if it were something. It
  generates one still, stores it with an **EMPTY payload** (the same zero-length store the composed shots
  use, because DEMO MODE produces no pixels), and returns `{ assetId, provenanceMode }` — the GENERATOR's own
  provenance word, so the panel carries it into the next report instead of inventing one.
- **`removeAsset(library, assetId)`** answers the LIBRARY's own `false` for an id it does not hold rather
  than throwing. Removing something twice is a caller's mistake, not a corrupt library, and a panel that
  turned it into an error banner would be reporting a failure that did not happen.
- **The library and the storyboard are SEPARATE state, and the proof measures it.** Generating into the
  library moves the asset count and the `storedBytes` tally; it does not move the storyboard's frames. A
  surface that conflated them would report a storyboard growing because someone generated a stray still.
- **§60 holds across the interactive write, as NUMBERS.** The new asset stores **0 bytes**, the library's
  `storedBytes` stays 0, and the panel renders no `<img>` — checked in the browser against the DOM, because
  an element would imply an image exists.
- **Evidence.** `src/lib/assets.test.ts` (the interactive describe block: generate stores one asset with an
  empty payload, leaves the storyboard untouched, remove deletes by id and the derived report follows,
  removing an unknown id answers `false`, and a second generate still produces metadata only);
  `docs/evidence/studio/asset-surface-proof.mjs` §5 grows and shrinks the **REAL** library through the
  shipped module; and `tools/harness/studio-assets.mjs` — the REAL browser, now **24/24**: the probe TYPES
  into the prompt input, presses **Generate**, and waits for the bridge's asset count to rise by exactly one;
  it then presses that row's **Remove** and waits for the count to fall back with the id gone, checking the
  storyboard is unmoved and the byte count is still zero throughout.
- **A defect found while landing it.** §5's first draft asserted the grown count against §1's mount-time
  report (`report.assets.length + 1`), but §3 had already grown the library by one, so the assertion read
  **5 !== 4**. The baseline is now read immediately before the write. The lesson is the one this lane keeps
  writing: *a section that measures against another section's snapshot is testing an arithmetic assumption
  about the sections before it, not the door.*
- **Bounds (§60).** The interaction generates and removes IMAGE assets only. There is no video generation, no
  character consistency, no asset UPDATE, and no way to edit a storyboard from the panel — those doors live
  in the agent lane (`assetTools.ts`) and the ones that do not exist there are listed as open in the plan.
  The library remains generator state: not the design document, not persisted, not undoable.

### Amendment 160 (M3 v160, agent-runtime) — the multimodal lane's doors deepen: video, search, update, delete, and the character-consistency trio — and the library's own no-op is REFUSED rather than forwarded

_Numbering: 160 was free (`grep -ao "^### Amendment 1[0-9][0-9]"` topped out at 159). This is item 2 of the
priority queue in `docs/DEVELOPMENT_PLAN.md`. Full narrative in `docs/evidence/agents/README.md`; this is the
ledger entry._

- **The gap this closes.** v145 gave the lane six doors — image generation, list, inspect, and the storyboard
  trio. The package it wraps has far more: a VIDEO generator, a metadata `search`, `updateMetadata`,
  `remove`, and a whole `CharacterConsistencyManager`. Those were reachable from the package's own tests and
  from nowhere else.
- **Seven new doors, taking the family from 6 to 13.** `asset.video.generate`; `asset.search`;
  `asset.update`; `asset.delete`; `asset.character.register`; `asset.character.list`; `asset.character.apply`.
  Four are write-class behind the §28 gate and three are read-class. **The read set is asserted EXACTLY**
  (six now), because a read door is one that skips the gate.
- **The rule the library cannot make for itself.** `InMemoryAssetLibrary.updateMetadata` answers **`true` for
  a patch that changes nothing** — verified in the proof against the real library, printed as `true` beside
  the door's refusal. So `asset.update` **refuses an empty patch** rather than forwarding it: a door that
  passed one through would report a successful update that updated nothing, which is a no-op wearing a
  success. An asset's BYTES and its id are not editable, and the door says so.
- **Two removal semantics, stated rather than left to a reader.** `asset.delete` is write-class and asks the
  checkpoint; the Studio panel's `Remove` (v159) is ungated because it acts on the panel's own in-memory
  library. The door's own DESCRIPTION carries that sentence, and a suite case asserts it is still there — a
  reader comparing the two should not have to infer why one asks a gate and the other does not.
- **`asset.video.generate` does not stamp the type it is named for.** The `type` and `mimeType` in the result
  come from the GENERATOR, so a driver that answered with an image under the video door would produce an
  image result, and the proof checks `type === 'video'` against the package's own generator rather than
  against a label the door applied.
- **`asset.character.apply` answers a REQUEST, not an asset, and says so.** It runs no generator; the result
  carries `derived: 'request'` and the reference images that *would* be attached. A door whose answer could
  be read as a generation would be the §60 defect in a new place. The package's manager THROWS for an
  unregistered character; the driver checks first, so the door can NAME the fact ("no character is
  registered as …") instead of forwarding a raw error string.
- **`asset.character.register` refuses two things the package would accept**: a character with no reference
  images (it would anchor nothing) and a `consistencyStrength` above 1 (the field means a fraction, and the
  package's own default is 0.8).
- **The §60 provenance rule is now SHARED, not duplicated.** Both generate doors call one
  `requireProvenance`, because two copies of the check the family exists to make could drift — and a suite
  case feeds a provenance-less answer to EACH door to prove neither forwards it.
- **Evidence.** `agents/runtime/test/assetTools.test.ts` **23 → 41 cases** (the new describe block covers
  every door, both directions of the provenance rule, the empty-patch refusal, the two removal semantics, the
  no-reference and strength-above-1 refusals, the derived-request answer, and the gate on each new door);
  `docs/evidence/agents/asset-tools-proof.mjs` gains **§6 video, §7 update/delete, §8 character trio** over
  the REAL generators, library and consistency manager (with the HEAD check renumbered to §9). `agent-runtime`
  **473/473 → 492/492** (33 files), `tsc -p agents/runtime/tsconfig.json` clean.
- **Bounds (§60).** Still no real model anywhere: every generator is DEMO MODE, every stored payload is zero
  bytes, and the proof measures that on the video path too. The doors cover the package's declared surface —
  there is no storyboard frame EDIT or DELETE, no character UPDATE or DELETE, and no asset byte editing
  (the library has no such method, so no door invents one). Nothing in the Studio imports this family, so
  the product face for video and character consistency remains open.

### Amendment 161 (M5 v161, studio) — the 3D surface becomes CONTROLLABLE: the camera gains an orbit (drag, wheel, reset) and the scene gains add/remove body

_Numbering: 161 was free (`grep -ao "^### Amendment 1[0-9][0-9]"` topped out at 160). This is item 3 of the
priority queue in `docs/DEVELOPMENT_PLAN.md`. Full narrative in `docs/evidence/studio/README.md`; this is
the ledger entry._

- **The gap this closes.** v142 placed the camera ONCE, at a fixed position, and never moved it again — its own
  record said so, and the surface's KNOWN-ISSUES row listed "no camera control (no orbit/zoom/pan)" and "no way
  to add or remove a body from the UI". A viewer you cannot turn is a picture; this makes the surface a viewer.
- **The orbit is PURE ARITHMETIC, not a controller class.** `OrbitState` is three numbers (azimuth folded to
  (−π, π], elevation clamped just short of the poles, distance clamped to [2, 40]); `orbitToPlacement` /
  `orbitFromPlacement` are exact inverses; `applyOrbit` clamps what has a limit and folds what does not. The
  Studio's DEFAULT orbit is **derived** from v142's `STUDIO_CAMERA_POSITION` by `orbitFromPlacement`, and a pure
  suite case asserts the round trip lands back on that position — the opening view is unchanged by construction,
  not by a hand-copied constant that could drift.
- **The controls live on the SURFACE, not in the component.** `orbitBy`/`resetOrbit` go through the adapter (the
  one writer allowed to touch the camera), `addBody` places each new body on a ring (`nextBodyPlacement`) so two
  added bodies never share a slot and none lands inside the composed shots, and `removeBody` answers the same
  `false` for an id the surface does not hold that `disk.write` gives for a path it was never given. `bodyIds` is
  now LIVE (mutated in place) so the frame loop writes the current set, not the mount-time one; a removed body is
  provably not written again.
- **The composed scene is UNTOUCHED by design.** Ground and Cube A/B/C keep the positions v142 gave them, and a
  suite case asserts it — a "add a body" feature that also moved the demo would be a different increment wearing
  this one's name. Removal takes the LAST body the surface holds, so a click can never delete the demo.
- **The component forwards events and NOTHING else.** Pointer-drag (with pointer capture, so a drag leaving the
  canvas keeps turning), wheel (deltaMode-normalised to notches, scroll-down-zooms-out — the convention every 3D
  viewer uses), a live orbit readout, and four buttons. It never reaches past the surface to edit a three.js
  object; the HUD panel is `pointerEvents: none` so it never eats a drag.
- **A defect found while landing it.** The first draft named the first user-added body `Cube A` — `64 + counter`
  collides with the composed `Cube A`, putting a second one into the graph on the first click. Added bodies now
  continue at D (`67 + counter`), and the counter is per-mount and never decremented by Remove, so names stay
  unique across add/remove cycles. The harness and proof pass explicit names, which is why only the UI path
  carried the bug — the lesson being: *the layer with no test is where the collision lived.*
- **Evidence.** `apps/studio/src/lib/scene3d.test.ts` **16 → 30** cases (the orbit block: round-trip, inverse,
  distance-preservation, fold/clamp, ring placement; the controllable block: orbit through the adapter, reset,
  orbit with NO adapter, add/remove against the runtime's graph, removed-not-written, composed-untouched) —
  studio **187 → 201**; `docs/evidence/studio/scene-surface-proof.mjs` gains **§5** over the REAL runtime and a
  REAL `THREE.Camera` (world matrix moved by the orbit, distance preserved, frame count unmoved, graph
  4 → 5 → 4 → unchanged); `tools/harness/studio-scene3d.mjs` **11 → 19** browser assertions — the probe DRAGS
  the canvas (azimuth 0.581 → −0.419, elevation 0.407 → 0.107, distance bit-identical), WHEELS out and back,
  presses **+ body** and **− body** (entities 4 → 5 → 4 against the bridge) and **reset view** (back to 0.581).
  `tsc` clean; `npm run verify:scene-surface` ALL ASSERTIONS PASSED.
- **Bounds (§60).** Still ONE demo scene with NO assets, textures, editable lights or model calls; no pan and no
  keyboard controls; added bodies are DEMO meshes, not document content — nothing here touches the 2D Design
  Document, the op log, history or persistence, and the surface toggle stays ephemeral view state (ADR 0014).
  Removal is last-body only (there is no per-body picker), and the save/load door remains item 5 of the plan.

### Amendment 162 (M4 v162, world) — the world becomes a SIMULATION: tickOnce over a connected composition, two-sided relationship bonds, lossless save/load, and a Studio surface that steps it

_Numbering: 162 was free (`grep -ao "^### Amendment 1[0-9][0-9]"` topped out at 161). This is item 4 of
the priority queue in `docs/DEVELOPMENT_PLAN.md`. Full narrative in `docs/evidence/agents/README.md` and
`docs/evidence/studio/README.md`; this is the ledger entry._

- **The gap this closes.** v148's own bounds said it: "relationships are declared but not simulated … no
  tick, no `executeAction`, no location connections, no save/load". A world that can be composed and read
  but not RUN is a filing cabinet; this makes it a clockwork — characters decide through their own gate,
  actions execute, unmaintained bonds erode, and the Studio panel drives all of it with a button.
- **Relationship strength is PURE ARITHMETIC, in its own module.** `relationships.ts`: bands (enemy < 10
  ≤ neutral < 60 ≤ friend < 85 ≤ ally), `decayStrength` floors at `RELATIONSHIP_FLOOR` = 10 — the
  first-meeting anchor, so decay can erode a bond to acquaintance but NEVER manufacture hatred (the
  enemy band is unreachable through simulation) — and caps at 100. `isDerivableRelationType` keeps
  DECLARED bonds (family/romantic/rival/mentor/servant) outside arithmetic's reach: a suite case asserts
  a family bond decays in strength while keeping its declared type.
- **speak lands on BOTH sides.** One `upsertBond` per direction: an existing bond gains (+5, its type
  re-derived only if derivable), a first meeting is born at the floor (10/10). The event's effects carry
  both directions, so a reader sees a meeting, not a one-way compliment.
- **`tickOnce()` is the engine's public heartbeat.** Deterministic: agents in insertion order, each
  consulted in sequence, then a decay pass, then event cleanup; it answers a `TickReport` (`tick`,
  `agents`, `decisions`, `actions`, `events`, `relationshipsChanged`). The legacy interval `tick()`
  delegates to it, so the panel and the doors run exactly what the tests run.
- **Three real defects found while landing it.** (1) save/load silently DROPPED knowledge — a reloaded
  agent relearned from nothing; `serializeKnowledge`/`hydrateKnowledge` make the round trip lossless,
  asserted for knowledge, rumors AND relationships. (2) A character standing NOWHERE crashed `decide()`
  (the old interval silently ate the throw — exactly the bug a `TickReport` makes visible); context now
  tolerates a null location and such an agent still rests. (3) speak candidates came from
  `location.npcs` while "nearby" read `inhabitants` — co-located characters could not meet; candidates
  are now the deduped union, which is the change that makes the whole simulation reachable.
- **The agent doors grew 6 → 8.** `world.simulate` (write) aggregates `steps` × `tickOnce()` into one
  report and refuses zero/negative/fractional/over-cap steps (`WORLD_SIMULATE_MAX_STEPS` = 1000; the
  registry's own type gate answers first for a non-number); `world.relationships.list` (read) answers
  every bond from BOTH sides, by name. The driver seam grew `simulate`/`relationships`, so hosts keep
  owning the engine.
- **The Studio surface steps the world.** Report schema 2: a `relationships` view with bonds resolved BY
  NAME (ghost targets report `null`, ids never printed as names). The composition connects ford↔ridge
  (path) and ford↔hamlet (road) and seats Mira & Toma at the ford — a tick CAN introduce someone. The
  panel gains a Simulate row (Step ×1/×5, a last-tick line) and a Relationships section, and runs the
  engine's own `tickOnce()` behind a 0.02 gate (a first meeting scores 0.3/10, which floats a hair below
  the literal 0.03 — the trap the proof documents).
- **Evidence.** `packages/world-engine` tests **31 → 43** (relationship bands/floor/cap, declared bonds
  immune, tickOnce on an empty world and the wounded-rest trace, decay re-derivation, two-sided speak, a
  repeated-dialogue climb to the ally edge, lossless save/load, co-located speak); `agents/runtime`
  **492 → 498** (8 doors, gate refusals, the read door's checkpoint count), `tsc` clean; studio
  **201 → 204** (schema 2, the connections, the shared ford, ghost-target null, JSON-safe). Proofs:
  `world-tools-proof.mjs` gains §6–§8 (a healthy world executes nothing / a wounded agent executes `rest`
  30 → 40 / 1001 steps refused; the introduction trace 10/10 → 15/15 → 13/13 with `relationshipsChanged`
  = 2; bonds by name), `world-surface-proof.mjs` gains §4 (the SHIPPED engine + module stepped once
  reproduces the trace and lists the bond both ways by name); `tools/harness/studio-world.mjs`
  **14 → 25 browser assertions** — the empty state, Step ×1 reproducing `tick 1 · 4 decisions ·
  2 actions · 2 bonds eroded` ON SCREEN, both sides at 13 on screen AND in the bridge, Step ×5 to tick 6
  with floor and bands holding, PNG. `npm run build` clean; all suites green.
- **Bounds (§60).** Still no model anywhere: every decision is the engine's own DEMO-MODE arithmetic and
  the surface says so on its own face. Factions and lore do not tick; there is no violence path (decay
  floors at the anchor — the engine cannot be stepped into hatred); no per-tick configuration and no
  disk persistence (save/load is JSON in memory); the bridge stays READ-ONLY — stepping happens through
  the panel's own engine, never through the bridge.

### Amendment 163 (M5 v163, studio) — the scene survives the surface: save/load doors over the runtime's own format, and authored bodies filed into the Design Document

_Numbering: 163 was free (`grep -ao "^### Amendment 1[0-9][0-9]"` topped out at 162). This is item 5 of
the priority queue in `docs/DEVELOPMENT_PLAN.md`. Full narrative in `docs/evidence/agents/README.md` and
`docs/evidence/studio/README.md`; this is the ledger entry._

- **The gap this closes.** v161's own bounds left the surface interactive but ephemeral, and
  KNOWN_ISSUES carried two open items: "no save/load door" and "the 3D scene and the Design Document
  are separate systems … nothing composed in 3D appears in the 2D document". Meanwhile
  `buildSaveFile`/`loadSaveFile` — the runtime's own declared save format — sat in
  `@nexus/three-runtime` with ZERO consumers. v163 is the consumption chain: two agent doors, two
  surface doors, and one pure function that files authored bodies into the document.
- **Agent lane: 6 → 8 doors.** `scene.save` (`sceneId` required, `savedAt` optional — the CALLER names
  the instant because the runtime has no wall clock) and `scene.load` (the file arrives as a JSON
  string the door parses itself — the registry's `ArgType` has no object type; malformed JSON, a bare
  value, an array and the empty string are refused BY NAME before the driver is asked). Both doors
  refuse a scene the driver does not hold and both answer with the counts the engine actually
  reported (`rendered: false` — a door never claims pixels). The loader's anti-overwrite semantics
  are proven over the REAL runtime: a load into a live scene is refused ("already in scene … a
  restore never overwrites live state").
- **Studio surface: save / load / send to doc.** `SceneSurface.save(savedAt)` answers the REAL
  `buildSaveFile` (the save format's first PRODUCT consumer); `load(file)` restores into a FRESH
  sibling scene (`Restored Scene`) — the demo scene, its bodies and its frame loop are never touched,
  and the runtime's own "already in scene" rule stands behind it. The panel's three buttons read their
  answers off the screen as counts, not moods: `saved 5 bodies · nexus-three-runtime-save v1 ·
  nothing written to disk`, `restored 5 bodies into a fresh scene — the runtime now holds 2 scenes,
  and the demo scene is untouched`, `sent 1 authored bodies to the document — one addSubtree of 2
  nodes, undoable like any other edit`.
- **3D→document composition is a PURE function over real ops.** `composeDocumentOps` turns the
  AUTHORED bodies (added via + body; the composed demo is deliberately excluded, so every other
  proof's demo scene stays byte-stable) into ONE `ops.addSubtree`: a frame named `Scene: <scene>` with
  one text child per body carrying kind and position (`mesh · (1.3, 0, 2.25)`). It is applied to a
  real document, read back, and inverted cleanly in the suite; the browser harness reads the
  `__nexus` editor bridge and finds the document gained exactly 2 nodes in one history row. §60: the
  document files structured spec TEXT — it never claims to render the scene.
- **Evidence.** `sceneTools.test.ts` +8 (506/506 across 33 files, tsc clean); scene-tools-proof §6
  over the REAL runtime (§1–§7 ALL PASSED: the caller's instant + 2 bodies through a JSON round-trip
  unchanged, fresh-scene load under the SAME ids verified through `runtime.getEntity`, live-scene
  restore refused, 3 garbage files refused by the door); `scene3d.test.ts` 30 → 40 (studio 204 → 214);
  scene-surface-proof §6 (save 5 bodies / instant 777 through JSON, fresh-scene restore with the demo
  scene still active, 1 authored body → one addSubtree applied and undone by a real document);
  browser harness `tools/harness/studio-scene3d.mjs` 19 → **25/25** (notes read off the screen; the
  editor bridge shows nodes 2 → 4 and one history row). `npm run build` clean; all suites green.
- **Bounds (§60).** save/load is JSON in memory — nothing is written to disk, and the note says so on
  the surface's own face. The document holds spec text, not a 3D preview. Authored bodies only — the
  composed demo never enters the document. Still open on this surface: pan, keyboard controls, a
  per-body picker, editable lights, disk persistence. The bridge stays read-only.
