# M2 evidence — agent stack (v0 loop → v30 confined exec host; all ADR 0016 amendments)

All checks are headless, offline, key-free, and reproducible from the repo root. Nothing here
claims model-quality planning or neural retrieval (§60): the planner is a deterministic
template and the index embedder is a hash-based bag-of-tokens stand-in — both say so in
every emitted artifact (`provenance.mode = "demo"`). One honest exception since v30:
`exec-host-proof.mjs` spawns exactly ONE read-only local command (`git status --short`)
through the confined host — still offline, still key-free, and everything else in the
stack spawns nothing.

## Reproducible gates

```
npm test          # turbo: @nexus/agent-runtime 204/204 + @nexus/exec-host 15/15 vitest among all packages
npm run build     # tsc dist for agents/runtime + agents/exec-host (build order via ^build deps)
node docs/evidence/agents/agent-proof.mjs
node docs/evidence/agents/code-index-proof.mjs   # requires `npm run build` first
node docs/evidence/agents/memory-proof.mjs       # requires `npm run build` first
node docs/evidence/agents/durability-proof.mjs   # requires `npm run build` first
node docs/evidence/agents/index-store-proof.mjs  # requires `npm run build` first
node docs/evidence/agents/provider-proof.mjs     # requires `npm run build` first
node docs/evidence/agents/recall-proof.mjs       # requires `npm run build` first
node docs/evidence/agents/changes-proof.mjs      # requires `npm run build` first
node docs/evidence/agents/roles-proof.mjs        # requires `npm run build` first
node docs/evidence/agents/pipeline-proof.mjs    # requires `npm run build` first
node docs/evidence/agents/qa-proof.mjs          # requires `npm run build` first
node docs/evidence/agents/repair-proof.mjs        # requires `npm run build` first
node docs/evidence/agents/rolechain-proof.mjs    # requires `npm run build` first
node docs/evidence/agents/dom-ui-proof.mjs         # requires `npm run build` first
node docs/evidence/agents/planner-proof.mjs        # requires `npm run build` first
node docs/evidence/agents/vector-store-proof.mjs   # requires `npm run build` first
node docs/evidence/agents/memory-vectors-proof.mjs # requires `npm run build` first
node docs/evidence/agents/index-vectors-proof.mjs  # requires `npm run build` first
node docs/evidence/agents/testrunner-proof.mjs     # requires `npm run build` first
node docs/evidence/agents/exec-sandbox-proof.mjs   # requires `npm run build` first
node docs/evidence/agents/exec-host-proof.mjs      # requires `npm run build` first
```

## Unit tests (vitest, `agents/runtime/test`)

| File | Covers |
| ---- | ------ |
| `registry.test.ts` (7) | arg validation (missing/unknown/type), unknown tool, checkpoint required for write/exec, deny ⇒ implementation never runs, approve ⇒ runs, impl throw ⇒ `ok:false` (never rejects), double-register refused |
| `workspace.test.ts` (4) | sorted/prefix listing, case-insensitive 1-based `search`, append/missing-file throw, registry wiring incl. gated `fs.write` |
| `agent.test.ts` (10) | stopword-aware keyword, plan determinism + seed stamp, golden path event order + `@search.hits.0.path` dataflow + note in file, denial leaves file untouched, failing verify → 1 fix round → pass, persistent failure → `failed_verification` after `maxFixRounds`, `maxSteps` → `budget_exhausted`, planner routes step 0 through `fs.index` when registered, warm memory outranks the index (`memory.recall` first), snapshot hook yields an observed changeSet (absent without hook) |
| `codeIndex.test.ts` (7) | extension → kind, TS symbol + markdown heading extraction, heading-section vs 40-line-window chunking, sorted file entries + coverage, hybrid query ranks the relevant chunk first and is deterministic, symbol query finds its file, empty index → no hits |
| `realfs.test.ts` (4) | extension/skip filtering with sorted slash keys, custom skipDirs + maxFiles cap, maxBytes drop, deterministic output independent of walk order — all against a fake fs (no host disk touched) |
| `memory.test.ts` (8) | save/list/recall scoping, deterministic tie-broken recall bounded by k, forget/clear counts, clone-in/clone-out immutability, registry round-trip with `"path:startLine"` refs, denied `memory.save` leaves memory empty + arg validation; v6 `compact()`: ≥50% ref-overlap merges within scope (listed, idempotent), cross-scope isolation |
| `embedding.test.ts` (4) | tokenizer rules, zero-shared-tokens ⇒ score exactly 0, more shared tokens ⇒ strictly higher, unit-length embeddings |
| `changes.test.ts` (8) | LCS patch round-trip forward/inverse, no-op patch, create/remove all-add/all-del, mismatched input refuses, sorted changed-paths change set, unified-diff headers/hunk ranges/context, whole-snapshot round-trip through patches |
| `ledger.test.ts` (3) | RunOutcome JSONL round-trip + junk rejection with reasons, append-only growth with parent mkdir, order + malformed counting + `last` tail trim + missing-file empty read |
| `roles.test.ts` (7) | `matchesTool` glob semantics, scope projection exposes/excludes (unknown ≠ denied), child copy can't mutate parent, role register unique + sorted list + ghost role ⇒ empty, researcher-vs-editor write behavior, plan tier follows role capabilities, capability gap fails honestly leaving files untouched |
| `evaluate.test.ts` (5) | clean run scores 1 with named marks, failures degrade by weight (deterministic), last verify decides, change-economy budget option, append/reload order + corrupt-file reasons |
| `pipeline.test.ts` (5) | researcher→editor handoff happy path (refs from `fs.index`, editor plans memory-first, score 1), denied checkpoint leaves the handoff real but the run denied, durable mode writes memory+ledger+evaluation JSONL that reload cold, missing research tool ⇒ stated reason (no invented refs), full determinism across identical pipelines |
| `vectordb.test.ts` (4) | build sorts + dim-checks, persist→cold reload ranking bit-identical to inline hybridScore + zero-match empty, filterIds + determinism, rejection matrix (bad JSON/version/dim/entries/missing file) |
| `planBackend.test.ts` (7) | valid provider plan adopted end-to-end (backend stamped, @refs resolved), unknown tool/dup id/object args/empty/oversize/non-object rejections, throwing provider falls back with stated reason, default = demo with no fallback field |
| `visualQa.test.ts` (5) | clean layout ok, zero-size/off-page/overlap detection with severities, error-before-warn deterministic ordering, tolerances as explicit inputs, identical reports for identical inputs |
| `chain.test.ts` (6) | four-stage researcher→designer→qa→editor order + handoff records, QA honest-empty without host rects, designer denial stops the chain naming its stage, determinism; v22: ui-driver editor stage drives observe→type→click→verify with `editor→host` engine handoff, per-action denial leaves the page unclicked and states the partial engine |
| `visualQa.test.ts` +contrast (3) | black/white passes, grey pair flags warn, rgb()/rgba() parse, junk colors yield no flag, 21:1 math |
| `visualQa.test.ts` +near-miss (6) | v24: default OFF (no opt-in no flags), 3px pair flags once with real px gaps in detail, boundaries (exact 0 passes, >tol passes, ==tol flags), near-center 2px-off vs exact/edge-touching, zero-size+off-page rects never collect near-miss noise, determinism |
| `visualQa.test.ts` +even-gap (6) | v26: default OFF, exactly-even spacing passes with the rule ON, a 1px-wobble row flags once per axis naming run+gaps+spread, boundaries (spread ==tol flags, >tol passes, 2-rect chain is not a distribution), non-positive gaps keep the chain in overlap territory, a zero-size member breaks the usable chain, determinism |
| `visualQa.test.ts` +near-edge (6) | v27: default OFF, near-flush left edge names side+margin, exact flush passes / >tol passes / ==tol flags, a corner lints ONCE naming both sides, hangover (negative margin) and off-page rects never collect near-edge noise, determinism |
| `repair.test.ts` (5) | clean input no-op, off-page pulled inside then QA-clean, overlap nudged below with gutter, zero-size grown, dedupe + determinism + "apply all repairs → zero error flags" |
| `repair.test.ts` +nudges (6) | v25: near-miss lints unproposed by default, equal-area mover tie broken by id with exact stated reason, smaller-area layer moves, center-nudge to page mid-line (other axis untouched, px stated), a/b/c chain where only the in-tolerance pair snaps, apply-all clears all flags, determinism |
| `repair.test.ts` +edge-snap (5) | v27: near-edge unproposed by default, opt-in snaps x flush with y untouched and px stated, right-edge snap uses page.width − width, a corner snaps the fixed-order side first and reports the other honestly in `remaining`, two independent slips both snap clean + determinism |
| `testRunner.test.ts` (15) | v28: predicate engine semantics (all-pass detail, VERBATIM failure messages, throw→`threw:` without crashing, name-order + first-registration duplicate wins, empty pack = stated vacuous failure, `only` filter + miss), tool contract (exec-gated without checkpoint, `{ok, detail}` + structured report when granted, unknown `only` errors), lazy file re-read after a write, runTask end-to-end (completed run journals 1 ok report; never-passing predicate → 3 honest reports + `failed_verification`; hosts without the tool keep the field absent), JSONL append/reload with malformed counting + last-N + missing-file empty |
| `execSandbox.test.ts` (18) | v29: allowlisted argv → inert plan (jail-resolved cwd, rule budgets, `matchedRule`, `executes:false` asserted field-for-field), default-deny refusal quoting the argv, `'*'` as argument wildcard matches but arity is fixed and shell-shaped single tokens still deny, path/separators in the executable refused before matching, malformed requests (non-array/empty/non-string tokens), cwd `..`+absolute+drive-letter refused via `guardedJoin` while missing cwd means the root, env scrubbed to allowlist with dropped names sorted, budgets clamped to policy ceilings, empty allow array denies everything, determinism + plan owns its data (no shared refs), invalid policy refused before the request and `registerExecTools` throws at registration, `exec.plan` callable WITHOUT a checkpoint (read perm) with `executes:false` in the output, refusals succeed as tool calls (`planned:false` + reason), registry `string[]` validation on argv |
| `exec-host/execHost.test.ts` (15) | v30 (@nexus/exec-host, injected fake spawn — zero real processes in vitest): allowlisted run spawns argv-as-data with the plan cwd/env verbatim, arg tokens never re-tokenized, policy refusal spawns NOTHING even behind an approving checkpoint, no-checkpoint direct call = stated `checkpoint required for exec (§28)`, deny = `planned:true` + `checkpoint denied`, checkpoint asked with an exec ToolCall carrying the plan, output budget hard-caps stdout+stderr total and marks `truncated`, timeout kills marked `killedByBudget` + SIGTERM, ENOENT surfaces as structured `spawnError` not a crash, `exec.run` registry-gated (deny never reaches host; granted → `{ok, detail, result}`; refusal = tool ERROR; nonzero exit = ok:false data with stderr), JSONL journal round-trip with malformed + shape-wrong counting + last-N + missing-file empty |
| `durability.test.ts` (8) | memory serialize/deserialize round-trip + version/schema rejection, `restore()` id high-water mark, save/load through an injected writable fake disk, corrupt-file honest failure, `guardedJoin` jail (absolute/`..`/drive-letter rejection, backslash folding), `disk.write` checkpoint gate + escape touches nothing, `disk.read`/`disk.list` confinement |
| `indexStore.test.ts` (11) | index snapshot serialize→deserialize verbatim + version/chunk schema rejection, save/load via injected fs, cold rescan equals `buildIndex`, unchanged files reuse chunks / edits rechunk exactly the changed paths / removals drop out, query ranking snapshot-independent; v5 provider: cold-first-build equals plain build, incremental refresh 0 re-chunked, edited file sole re-chunk, cross-provider snapshot restore, corrupt-snapshot fallback + repair, `fs.index` provider/default parity |
| `indexVectors.test.ts` (11) | v23: `indexToVectorDb` shape (one entry per chunk, id `path#startLine`, real dim-64 vectors), vector-vs-inline hit-for-hit parity across five query shapes + stated engine, null db ⇒ honest inline; cold merge ≡ cold build, unchanged chunks reuse the identical vector object / only touched windows re-embed / removals drop out; tampered-text, missing-id and wrong-dim drift each send the WHOLE query inline with real inline hits; persisted provider: lazy `vectors()`, byte-identical reuse by a cold second provider, corrupt-file self-repair, `fs.index` engine labels with/without vectorsFile, edits tracked through the provider lifecycle |

## Headless proof (`agent-proof.mjs`) against the built `dist/`

- Golden path transcript: `search → read → annotate → verify(fail) → fix-1 → verify-2(pass)`,
  status `completed`, gates visited: `fs.append:write`, `test.run:exec`. Since v1 the
  `search` step runs the `fs.index` tool (same stepId, same `hits.0.path` dataflow).
- **Determinism:** two fresh runs produce byte-identical `{plan, events, results}` JSON and
  identical workspace snapshots.
- **Honest denial:** with no checkpoint callback the write step returns
  `checkpoint required`, status `denied`, workspace snapshot equals the seed exactly.

## Real-repo index proof (`code-index-proof.mjs`, M2 v1)

Indexes the actual repository from disk via `node:fs` (150 files, 648 chunks as of this
writing; skips `node_modules/.git/.next/dist` and files > 256 KB) and answers
identifier-precise queries with the built hybrid scorer × `sourcePrior` (src/lib 1.2,
docs/tests 0.85 — quoting docs no longer crowd out the code they describe):

| Query | Definition file rank |
| ----- | -------------------- |
| `rigidRotateRect rotatePointAbout` | `packages/design-model/src/geometry.ts` #2 |
| `deserializeApp schemaVersion localStorage` | `apps/studio/src/lib/persist.ts` #2 |
| `DANGEROUS checkpoint ToolRegistry invoke` | `agents/runtime/src/registry.ts` #1 |

Top-5 (not top-1) is asserted deliberately: the demo scorer has no source-vs-test or
recency weighting, so files that import or exercise the same identifiers — including this
very evidence README, which quotes them — legitimately outrank definitions. Determinism
(identical hits across repeated queries) is asserted too.

## Real-repo ingestion + memory proof (`memory-proof.mjs`, M2 v2)

- **Run A (cold memory):** `collectTextFiles('.', node:fs)` ingests the real repository
  read-only (130+ files as of this writing), the planner researches via `fs.index` →
  `agents/runtime/src/embedding.ts` (v6 moved the scoring seam), annotates the **in-memory copy only** (§9 — the
  host disk is never written), verifies via the host predicate, and the host persists the
  finding through checkpoint-gated `memory.save` (gate observed as `memory.save:write`).
- **Run B (warm memory):** a fresh registry with **no `fs.index`** and a near-empty
  workspace containing only the remembered file — the planner's research step is served by
  `memory.recall` and the run completes. Two identical run-B harnesses produce identical
  transcripts (determinism).
- **§26 deletable:** after `store.clear(scope)`, the same run-B task *fails honestly*
  (`failed_verification`) instead of fabricating a result (§60).

## Durability proof (`durability-proof.mjs`, M2 v3)

The only NEXUS surface that writes the real disk anywhere in this repo: a `disk.write` call
confined by `guardedJoin` to a jailed temp root (`%TEMP%/nexus-durability-proof`, removed at
the end). Flow: run 1 completes a task with cold memory, the host persists the finding via
checkpoint-gated `memory.save`, then flushes `serializeMemory` to `state/memory.json`
through **`disk.write`** (gate observed as `disk.write:write`). A **separate `node` child
process** then reloads that file with `loadMemoryStore` and recalls the right path —
genuine cross-process durability, not an in-memory illusion. Two negative controls:
`../../nexus-escape.txt` is refused and provably never created, and a corrupted JSON file
returns `{ok:false, reason:'not valid JSON'}` instead of half-loading.

## Index snapshot proof (`index-store-proof.mjs`, M2 v4)

Cold-builds the real repo's index (129 files), serializes it via `saveIndex` through
`node:fs` into a jailed temp root, and reloads with a cold `loadIndex`: the index is
byte-identical and `queryIndex` rankings deep-equal. Incremental `rescanIndex` with
fingerprints: unchanged repo rescan re-chunks **0 files in ~3 ms**; a one-file edit
re-chunks exactly that file and the result deep-equals a full cold rebuild (which would
re-chunk all 129); the edited file's new symbol is queryable immediately. Corrupting the
snapshot file yields `{ok:false, reason:'not valid JSON'}` — no half-load.

## Provider proof (`provider-proof.mjs`, M2 v5)

One `createIndexProvider` serves two agent tasks over the real repo (129 files): task 1
cold-builds (129 re-chunked) and persists the snapshot; task 2's research is answered from
the same provider with **0 re-chunked files and deep-equal hits**. A brand-new provider —
the stand-in for a fresh process — restores the persisted snapshot cold with 0 re-chunked
files; a corrupted snapshot triggers an honest full rebuild and repairs the file.
`fs.index` with and without a provider returns identical hits, so the seam cannot silently
change retrieval behavior.

## Recall + consolidation proof (`recall-proof.mjs`, M2 v6)

Seeds five memory records from real-repo `fs.index` research (four distinct questions plus
one realistic rediscovery of the first finding). A **paraphrased probe** ("how does the code
index embed and score tokens") recalls the right record with identical results across runs;
the printed comparison shows the hybrid top against the lexical-only baseline. `compact()`
then merges the duplicate-research records (`mem-5→mem-1`, 5→4) — every merge listed, and
the probe's answer survives consolidation unchanged.

## Changes + ledger proof (`changes-proof.mjs`, M2 v7)

Two agent runs over a mini workspace produce observed change-sets (orchestrator `snapshot`
hook → `createChangeSet`). Each renders as a git-style unified diff (`--- a/… @@ -2,3 +2,4
@@`), lands in the jailed patches dir through checkpoint-gated `disk.write`, and reverts
exactly under `applyPatch(after, inversePatch(f))`. Full `RunOutcome`s append to a JSONL
ledger that a fresh reader reloads in order (`malformed: 0`, `last: 1` trims to newest).
This is the honest substitute for a "git commit tool": the runtime emits reviewable
patches; applying them stays a human/git action outside it (§60, ADR 0013 pending).

## Roles + evaluation proof (`roles-proof.mjs`, M2 v8)

One host registry, two §24 role projections, the same task: the `researcher` (no write
capabilities) fails with `unknown tool "fs.append"` *even with an approving checkpoint* —
capabilities are absent, not denied — while the `editor` completes and scores 1.00 on the
five-mark rubric. The weaker run scores 0.20 on the identical rubric; both evaluations
reload from JSONL in order. Rubric output is pure data over the RunOutcome — deterministic
by construction, no model judging a model (§60).

## Pipeline proof (`pipeline-proof.mjs`, M2 v9)

§25 as durable data: a researcher session over the real repo hands off its top refs
(`{from, to, goal, via, refs}` — no chat) to an editor stage; the parent run scores 1.00,
then a **separate node child process** loads only the persisted handoff JSON + the target
file, completes the editor stage memory-first (`plan.steps[0].tool === 'memory.recall'`)
and scores 1 too. Ledger and evaluation files record the stages; the jail is cleaned after.

## QA proof (`qa-proof.mjs`, M2 v11 + v24 + v26 + v27)

Synthetic triad (clean / stacked / off-page) plus real `layoutPage` data: a banner over a
hero on a sized page is `ok`; a zero-height layer is flagged `zero-size`, not tolerated.
The Studio dock runs exactly this after every Approve (verdict + flag chips, `qa` field in
the ledger). v24 adds the opt-in near-miss lints: same 1.5px-slip pair proves flags are
absent by DEFAULT, a single `near-align` warn names the measured gaps, a 1px-off rect
lints `near-center`, and zero-size/off-page rects never collect noise. v26 adds
`uneven-gaps`: an 11px/12px row lints with the real spread in the detail, an
exactly-even row and a spread beyond tolerance pass, and a chain with a crushed
(non-positive) gap stays the overlap rule's business. v27 adds `near-edge`: a 1.5px
page margin lints naming the side, exact-flush placement passes on purpose, and a
rect hanging PAST the edge is overflow's business, never near-edge noise. Stated
limit (§60): structural geometry only — no pixel or aesthetic claims.

## Repair proof (`repair-proof.mjs`, M2 v12 + v25 + v27)

Three simultaneous problems (off-page, stacked pair, zero-size) → `proposeRepairs` emits
one deduped, sorted repair per node; applying all repairs clears every ERROR flag on the
QA re-run; identical inputs give byte-identical output; an unsolvable stack (two
full-page siblings) stops after bounded passes and reports what remains — the loop quits
honestly instead of thrashing. v25 adds the nudge section: with the near-miss lints
visible, the DEFAULT run proposes zero nudges; `{alignRepairs:true}` snaps the 1.5px slip
to exact (`align-nudge`, smaller area moves) and the 1px-off rect to the page mid-line
(`center-nudge`), leaves the 140px-away node alone, clears all flags on re-run, mutates
nothing itself, and is byte-identical on repeat. In the dock this closes end-to-end:
flagged banner → Propose repairs → Approve → status `QA now flagged/ok` + `repairs:N`
journaled. v27 adds the edge-snap section: the near-edge lint is silent without the
opt-in; with it a corner snaps its LEFT edge first (fixed order, stated px) and the loop
stops honestly reporting the still-1px top in `remaining`, while two slips on opposite
edges both flush in one run — apply-all → zero flags, byte-identical repeats.

## Role-chain proof (`rolechain-proof.mjs`, M2 v14 + v22)

Four §24 roles run one goal in sequence (researcher → designer → qa → editor): three typed
`ChainStageHandoff` records, the designer's brief appended under checkpoint, the QA stage
**computing** WCAG 2.1 contrast on real hex pairs (`#777/#888` flagged warn,
`#000/#fff` 21:1 passes), and the editor completing memory-first with score 1.00. A
denied designer checkpoint stops the chain at exactly `stage:'designer'` with the prior
handoff intact. Contrast is arithmetic, not opinion (§60); unparsable colors produce no flag.

## Dom-UI proof (`dom-ui-proof.mjs`, M2 v16)

The runtime's `ui.*` tools drive an injected fake page through the SAME checkpoint gate as
every write: allowed runs log each gated action in order; denying the second step stops the
run with the first action kept and the third never happening; a missing label fails BEFORE
asking a human (no invented UI). In the Studio the same tools drive real DOM — verified
live with two Allow-once dialogs after which the composed dashboard appeared.

## Vector-store proof (`vector-store-proof.mjs`, M2 v18)

219 real repo-chunk vectors (token-bag hash embeddings — the store is mechanics, not a
trained model, §60) persisted to a jailed JSON, cold-loaded in ~3 ms, exact cosine scan
matching inline scoring to 1e-12 across three queries; corrupt file rejected with a
reason. Exact scan is stated as the algorithm (correct at this scale), not hidden as ANN.

## Memory-vectors proof (`memory-vectors-proof.mjs`, M2 v19)

Cold reader (restored store + persisted vectors) reproduces inline ranking exactly; `memory.recall` reports its engine, and a corrupted vector file falls back to inline computation while saying `engine:'inline'`. The Studio dock persists `agent/vectors-studio.json` on every approval, so refreshed pages recall from cold vectors.

## Index-vectors proof (`index-vectors-proof.mjs`, M2 v23)

711 real repo-chunk vectors (ids `path#startLine`, token-bag embeddings — mechanics, not a
trained model, §60) persisted through the `createIndexProvider` lifecycle into a jailed dir:
the cold file deep-equals a direct `indexToVectorDb` build; four queries rank hit-for-hit
identical to inline `queryIndex` while stating `engine:'vectors'`; a COLD second provider
re-chunks 0 files and rewrites a **byte-identical** vectors file (pure reuse, provable);
appending one line to one file re-embeds exactly 1 of 711 vectors and the new symbol is
immediately queryable through the vector path. Negative controls: a tampered entry sends the
WHOLE query to `engine:'inline'` with the real inline ranking (never half-vector), and a
corrupt file self-repairs on refresh. On the tool surface `fs.index` returns
`{engine:'vectors'}` with a vector-backed provider and `{engine:'inline'}` without — same
hits either way, honest label either way.

## Exec-host proof (`exec-host-proof.mjs`, M2 v30)

Gate/budget semantics are first shown against a FAKE child (zero real processes): policy
refusal + missing checkpoint + human denial all provably spawn nothing; an approved run
hands `spawnLike` the plan's argv-as-data, jail cwd and scrubbed env verbatim; a 6-byte
budget cuts across both streams (`truncated`), a 30ms budget kills (`killedByBudget`,
SIGTERM); through the registry, `exec.run` is exec-gated and a `rm -rf /` request stays a
tool ERROR even past an approving checkpoint; JSONL reloads 2 runs with 2 malformed lines
counted. Then the §60 honesty step: exactly ONE real read-only command (`git status
--short`) through `NODE_SPAWN` under the same machinery, labeled with its engine. Finally
the boundary audit BOTH WAYS: all 25 runtime dist modules clean of `child_process`, and in
exec-host the capability is confined to `execHost.js` alone.

## v20 note — orchestrator-driven UI

The dock's Agent UI run now executes the demo planner's `observe→type→click` plan through the UNCHANGED runTask loop; ui tools address labels (exact, then substring). Browser: two per-action Allow dialogs, then the composed dashboard — live plan→act→verify, fully gated.

## v22 note — UI-capable role-chain editor

`runRoleChain` accepts an optional `uiDriver`: the ui tools are registered on a registry COPY
(caller's registry asserted unchanged), the editor role alone gains `ui.*` (researcher absence
asserted — unknown tool, not denied), and the v20 UI template fires for the editor stage. The
chain then appends an `editor→host` handoff recording exactly which ui tools SUCCEEDED
(`ui:ui.observe+ui.type+ui.click`); refusing `ui.click` yields `ui:ui.observe+ui.type` with
status `denied` and the page never clicked (§60: the audit names the real engine).

## v23 note — persisted chunk vectors as an fs.index scoring path

`createIndexProvider` now syncs a `vectorsFile` alongside the snapshot: vectors are merged
incrementally per refresh (only touched chunk windows re-embed) and the provider exposes
`vectors()`. `fs.index` scores from those stored vectors via `queryIndexWithVectors` —
the SAME hybrid formula, asserted hit-for-hit identical to inline — and states its engine in
the output (`{engine:'vectors'|'inline', hits}`). Any drift between db and index (tampered
text, missing id, wrong dim) falls the whole query back to inline scoring, stated. Still the
deterministic token-bag stand-in (§60): this is real vector-store mechanics, not neural
retrieval.

## v24 note — opt-in near-miss lints in the QA rule pack

`runVisualQa` gained `alignTolerance`/`centerTolerance` (default 0 = OFF — asserted, so no
host silently gains flags): `near-align` fires per pair when an edge gap is >0 but ≤ the
tolerance (exact alignment and wide-open layouts pass), `near-center` when a fully-on-page
rect's opposing page margins differ by 1–2px. Both warn-only, deterministic, and excluded
for rects that already carry zero-size/off-page errors. The Studio dock opts in at 2px in
`qaForDoc`; `proposeRepairs` deliberately does NOT auto-fix these — nudging alignment is a
human call (§28), which the dock shows honestly as "Nothing safely fixable".
(Amendment 25 later made the nudge itself an opt-in, still-gated PROPOSAL — see below;
the default-off behavior asserted here is unchanged.)

## v25 note — near-miss slips become gated align-nudge proposals

`proposeRepairs(input, {alignRepairs:true})` turns the v24 lints into explicit repairs:
`align-nudge` snaps the flagged edge (fixed left→right→top→bottom check order) of the
deterministic mover — smaller area, later id on ties — to exact, and `center-nudge`
centers a near-center rect per axis at `page.x + (page.width − w)/2`. Every reason states
the measured px (§60). Default OFF stays provably OFF: without the opt-in the same input
yields zero nudge repairs. The dock wires it in `planRepairs` (mirroring `qaForDoc`'s 2px
tolerances) — but a nudge still only lands after the human Approves and the op path
applies it (§28); `proposeRepairs` never mutates the input rects.

## v26 note — even-gap distribution lint, deliberately without an auto-fix

Third member of the opt-in near-miss family: per axis, the usable rects sorted by start
edge form a gap chain; all gaps positive and a max−min spread of >0 up to
`gapTolerance` flags one `uneven-gaps` warn naming the run, the gaps and the spread
(exact-even passes — this is the 1px wobble, not the design). `qaForDoc` opts in at the
same 2px. No repair action exists for it on purpose: re-spacing a whole chain is a
bigger call than snapping one slipped edge, so the loop answers "nothing safely
fixable" while the chip states the measurement (§28/§60).

## v27 note — near-edge lint and its gated edge-snap nudge

Fourth opt-in rule: `edgeTolerance` lints a rect whose page margin is >0 but ≤ tolerance
(exact flush = intent, passes; a negative margin is overflow's domain, never near-edge
noise). Unlike v26 this one DOES ride the v25 nudge machinery: under
`{alignRepairs:true}` an `edge-snap` proposal moves the first near-flush side (fixed
left→right→top→bottom order) flush with the px stated, and multi-edge corners stop
honestly after one snap (`remaining` reports the rest). The dock opts both QA and repair
into the same 2px — the flush slip shows a chip, earns exactly one proposal, and the
document only changes through §28 Approve → op path.

## v28 note — the test-run seam: one predicate engine instead of ad-hoc verify bodies

Until v28 every host hand-rolled its own `test.run` tool body (the dock's corpus check and
the UI runner's layer-count were duplicate ideas). Now the runtime ships the seam:
`registerTestTools(registry, predicateRunner(engine, predicates, files))` — deterministic
name-ordered evaluation, VERBATIM failure messages, throwing predicates reported as
`threw: …` instead of crashing, an empty pack as a stated `vacuous` failure (never green),
and an unknown `only` filter as an error (never a vacuous pass). The orchestrator
journals every report onto `RunOutcome.testReports` — verify AND fix-round re-checks —
and `appendTestReport` persists verdicts as JSONL with the ledger's malformed-line
discipline. Both dock modes and the UI runner were converted to the shared factory.
§60 line that must never be crossed: this runs in-process predicates, NOT a real test
suite — actually executing `npm test`/git awaits the ADR 0013 exec sandbox.
`testrunner-proof.mjs` asserts all of it against the built dist.

## v29 note — exec policy as pure data: the gate that exists before any spawn does

ADR 0013's sandbox is still `Proposed` (no Docker here), but its PORTABLE half — the policy —
is string arithmetic that can be proven today. `planExec(request, policy)` answers
allow-but-inert: exact-argv allowlist (`'*'` only in argument positions — a wildcard
executable throws at `registerExecTools`), bare-name executables (any path separator dies
before matching), cwd confined through the v3 `guardedJoin` jail, env scrubbed to a named
allowlist with `droppedEnv` listed, and timeout/output budgets clamped to ceilings the
request cannot raise. `ExecPlan.executes` is the literal `false` in its own TYPE, and the
`exec.plan` tool is `read`-permission because it DECIDES and never executes — §28 has nothing
to gate, and refusals come back as successful tool calls with `planned:false` + reason. The
proof closes the §60 loop checkably: every `agents/runtime/dist/*.js` is scanned for
`child_process` and none is found — "nothing in the runtime can spawn" is now re-proved on
every evidence run. No studio wiring: a plan nobody executes would be dead UI (stated, not
hidden). `exec-sandbox-proof.mjs` asserts all of it against the built dist.

## v30 note — the confined exec host: a keyed door on the policy gate

`@nexus/exec-host` is a NEW workspace package whose whole reason to exist is where its
capability is NOT: `@nexus/agent-runtime` stays provably spawn-free (v29 audit still runs),
and `exec-host-proof.mjs` checks the boundary BOTH WAYS — exactly one exec-host module may
name `child_process`. `createExecHost(policy, {spawnLike})` starts every run at `planExec`:
a policy refusal returns data and spawns nothing even behind an approving checkpoint (the
policy outranks the human). Approved plans execute argv-as-data through `shell: false`, and
the plan's OWN numbers bind: total stdout+stderr capped (marked `truncated`), timeout kill
(marked `killedByBudget`), scrubbed env verbatim. §28 is a single gate: direct calls carry a
checkpoint (no gate = stated refusal), registry calls pass through the tool's exec gate with
`preApproved`. Refusals surface as tool errors, nonzero exits as `{ok:false, detail, result}`
data, and every run reloads from append-only JSONL. The proof runs all gate/budget logic
against a fake child, then executes ONE real read-only `git status --short` under
`NODE_SPAWN` — labeled honestly: this is a POLICY sandbox (argv allowlist + budgets +
checkpoint), NOT an OS/container sandbox; ADR 0013's egress/secret-injection/containers
half remains open, and untrusted generated code still has nowhere to run.

## Scope honesty

§63/§26 items *not* implemented (stated, not faked): general real-fs write tools (only
`disk.write` inside an explicit jail root, always checkpoint-gated), GENERAL process
execution — since v30 `@nexus/exec-host` can run EXACT allowlisted argv under §28 with
plan budgets, but there is no arbitrary-command path, no shell, and no OS/container
sandbox (ADR 0013's egress/secret/containers half is open); running the repo's real test
suites through the host is a future policy choice, not current behavior; the runtime
package itself stays spawn-free by audited design. git commit,
live-model planning (the seam exists, the model needs keys), multi-agent registry.
Memory recall (v6) shares the index's deterministic token-bag hybrid score — a real
signature scheme, but still a stand-in for the pgvector hybrid retrieval of ADR 0012. The provider must be kept in sync with the workspace by the
host; it only ever sees the host-supplied file set (§60).
