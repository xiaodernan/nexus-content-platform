# M2 evidence — agent stack (v0 loop → v43 staged-intent door: the agent can read what a human meant to record; all ADR 0016 amendments)

All checks are headless, offline, key-free, and reproducible from the repo root. Nothing here
claims model-quality planning or neural retrieval (§60): the planner is a deterministic
template and the index embedder is a hash-based bag-of-tokens stand-in — both say so in
every emitted artifact (`provenance.mode = "demo"`). The honest exceptions since v30/v32/v34/v35/v36/v37/v38/v39/v40/v42/v43:
`exec-host-proof.mjs` and `git-aware-proof.mjs` spawn a few read-only local commands
(`git status --short`, `git diff --stat`), `execsuite-proof.mjs` runs the repo's OWN
@nexus/design-model vitest suite through the confined host (vitest's cache under
`node_modules` is the only thing it writes), `commit-proof.mjs` + `greencommit-proof.mjs`
+ `gitlog-proof.mjs` + `confirm-proof.mjs` + `remember-proof.mjs` + `policygate-proof.mjs`
+ `show-proof.mjs` + `staged-proof.mjs` + `inspect-proof.mjs` perform REAL `git commit`s (and since v37/v38
real `git log` read-backs — v38's for the first time driven by `runTask` itself, not a
hand-called tool; v39's runTask additionally writes a REAL in-process `MemoryStore`; v42 adds a real
`git show` content read-back and v43 a real `git diff --cached` index read, both HUMAN-staged
content only; v44's `inspect-proof.mjs` is the first where the PLAN ITSELF schedules that
content read, so the loop — not the proof — decides to look) — only inside throwaway `os.tmpdir()` repos
with hooks/signing neutralized LOCALLY there, never in this repository — still offline,
still key-free, and everything else in the stack spawns nothing.

## Reproducible gates

```
npm test          # turbo: @nexus/agent-runtime 239/239 + @nexus/exec-host 110/110 vitest among all packages
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
node docs/evidence/agents/exectest-proof.mjs       # requires `npm run build` first
node docs/evidence/agents/git-aware-proof.mjs      # requires `npm run build` first
node docs/evidence/agents/execsuite-proof.mjs      # requires `npm run build` first (boots the real design-model vitest suite, ~11s)
node docs/evidence/agents/commit-proof.mjs         # requires `npm run build` first (REAL commits, but ONLY in a throwaway os.tmpdir repo)
node docs/evidence/agents/greencommit-proof.mjs    # requires `npm run build` first (red/denied commit nothing; green-after-fix commits exactly once)
node docs/evidence/agents/gitlog-proof.mjs         # requires `npm run build` first (REAL commit + read-back, ONLY in a throwaway os.tmpdir repo)
node docs/evidence/agents/confirm-proof.mjs        # requires `npm run build` first (v38: runTask itself drives REAL commit→confirm in a throwaway os.tmpdir repo)
node docs/evidence/agents/remember-proof.mjs       # requires `npm run build` first (v39: four real loop runs; the confirmed arc journals itself into a REAL MemoryStore — and run 2 recalls it)
node docs/evidence/agents/policygate-proof.mjs     # requires `npm run build` first (v40: SAME plan under TWO policy tables against REAL git — audits differ on exactly one rule)
node docs/evidence/agents/show-proof.mjs           # requires `npm run build` first (v42: commit → hash → CONTENT read-back; git.show lines byte-equal what the human staged, throwaway os.tmpdir repo only)
node docs/evidence/agents/staged-proof.mjs         # requires `npm run build` first (v43: git.diff sees 0 files while git.staged recites the staged lines; the intent read BEFORE the commit equals the content read AFTER it, throwaway os.tmpdir repo only)
node docs/evidence/agents/inspect-proof.mjs        # requires `npm run build` first (v44: the PLAN's own tail ends in git.show — four §28 gates, human-staged lines read back byte-for-byte, an empty diff and an unborn-HEAD 128 both carried as DATA, throwaway os.tmpdir repos only)
```

## Unit tests (vitest, `agents/runtime/test`)

| File | Covers |
| ---- | ------ |
| `registry.test.ts` (7) | arg validation (missing/unknown/type), unknown tool, checkpoint required for write/exec, deny ⇒ implementation never runs, approve ⇒ runs, impl throw ⇒ `ok:false` (never rejects), double-register refused |
| `checkpointPolicy.test.ts` (8) | v40: first-match-wins ordering, `matchesTool` glob semantics shared with role scoping (`fs.*`, `*`), unmatched ⇒ EXPLICIT default (never an invented verdict), `decide` purity (byte-identical JSON, policy not mutated), `validateCheckpointPolicy` rejection matrix (missing reason / empty pattern / non-boolean grant / duplicate pattern = dead rule / mute default) thrown at CONSTRUCTION, `policyCheckpoint` receipts in executed order quoting rule reasons verbatim, registry contract unchanged (policy denial == `denied at checkpoint (write)`), runTask end-to-end through policy gates (granted work STANDS under a later veto; read steps produce NO verdicts — §28 gates hands, not eyes) |
| `workspace.test.ts` (4) | sorted/prefix listing, case-insensitive 1-based `search`, append/missing-file throw, registry wiring incl. gated `fs.write` |
| `agent.test.ts` (37) | stopword-aware keyword, plan determinism + seed stamp, golden path event order + `@search.hits.0.path` dataflow + note in file, denial leaves file untouched, failing verify → 1 fix round → pass, persistent failure → `failed_verification` after `maxFixRounds`, `maxSteps` → `budget_exhausted`, planner routes step 0 through `fs.index` when registered, warm memory outranks the index (`memory.recall` first), snapshot hook yields an observed changeSet (absent without hook); v36: `hasCommit` appends the commit step ONLY behind a verify step (and deterministically), a green run reaches it with the planned message, checkpoint DENY ⇒ status denied with earlier work standing and zero commits, green AFTER a fix round still commits with fix steps never re-run (execution order asserted), a red run never commits, a throwing commit tool is honest non-green; v38: `hasConfirm` trails a `git.log` step after the commit and NEVER plans one without a commit (or without verify — nested tail, determinism asserted), green ends commit→confirm in executed order, green-after-fix reaches confirm too, DENIED confirm ⇒ status denied while the landed commit's ok:true result STANDS a slot earlier, a throwing `git.log` is honest non-green; v39: `hasRemember` trails `memory.save` ONLY after the confirmed commit (all three tier-removals omit it, refs/targetPath arg shapes, determinism), a green run ends commit→confirm→remember with the planned `@search.hits.0.path` resolved INSIDE the array arg to the live path, green-after-fix remembers once, DENIED confirm means nothing to remember (0 saves), DENIED remember leaves commit+confirm standing and the store empty, a throwing `memory.save` is honest non-green; v44: `hasContent` trails a `git.show` inspect AFTER the hash confirm and BEFORE remember (nested tail — pull commit, confirm or verify and the content step vanishes with it; the planned `{path:'@search.hits.0.path'}` becomes the LIVE hit, and a `targetPath` task plans that path instead), green ends commit→confirm→inspect in executed order, the remembered summary still asserts NO content (never the word `CONTENT` — §60: memory keeps only what v39 could prove), DENIED inspect ⇒ status denied with the landed+confirmed arc standing a slot earlier, git answering "touches nothing" is DATA the walk completes on, a throwing `git.show` is honest non-green, a red run plans the tail and spends none of it |
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
| `testRunner.test.ts` (18) | v28: predicate engine semantics (all-pass detail, VERBATIM failure messages, throw→`threw:` without crashing, name-order + first-registration duplicate wins, empty pack = stated vacuous failure, `only` filter + miss), tool contract (exec-gated without checkpoint, `{ok, detail}` + structured report when granted, unknown `only` errors), lazy file re-read after a write, runTask end-to-end (completed run journals 1 ok report; never-passing predicate → 3 honest reports + `failed_verification`; hosts without the tool keep the field absent), JSONL append/reload with malformed counting + last-N + missing-file empty; v31: the tool AWAITS an async runner with an identical report shape, a REJECTING async runner surfaces as a tool error not a crash, runTask journals async-runner reports like any other |
| `execSandbox.test.ts` (18) | v29: allowlisted argv → inert plan (jail-resolved cwd, rule budgets, `matchedRule`, `executes:false` asserted field-for-field), default-deny refusal quoting the argv, `'*'` as argument wildcard matches but arity is fixed and shell-shaped single tokens still deny, path/separators in the executable refused before matching, malformed requests (non-array/empty/non-string tokens), cwd `..`+absolute+drive-letter refused via `guardedJoin` while missing cwd means the root, env scrubbed to allowlist with dropped names sorted, budgets clamped to policy ceilings, empty allow array denies everything, determinism + plan owns its data (no shared refs), invalid policy refused before the request and `registerExecTools` throws at registration, `exec.plan` callable WITHOUT a checkpoint (read perm) with `executes:false` in the output, refusals succeed as tool calls (`planned:false` + reason), registry `string[]` validation on argv |
| `exec-host/execHost.test.ts` (15) | v30 (@nexus/exec-host, injected fake spawn — zero real processes in vitest): allowlisted run spawns argv-as-data with the plan cwd/env verbatim, arg tokens never re-tokenized, policy refusal spawns NOTHING even behind an approving checkpoint, no-checkpoint direct call = stated `checkpoint required for exec (§28)`, deny = `planned:true` + `checkpoint denied`, checkpoint asked with an exec ToolCall carrying the plan, output budget hard-caps stdout+stderr total and marks `truncated`, timeout kills marked `killedByBudget` + SIGTERM, ENOENT surfaces as structured `spawnError` not a crash, `exec.run` registry-gated (deny never reaches host; granted → `{ok, detail, result}`; refusal = tool ERROR; nonzero exit = ok:false data with stderr), JSONL journal round-trip with malformed + shape-wrong counting + last-N + missing-file empty |
| `exec-host/execTestRunner.test.ts` (9) | v31 (fake spawn, zero real processes): exit 0 → passing report whose engine NAMES the argv, exit 1 + stderr → failure message verbatim, timeout kill → `killed at timeout budget (SIGTERM)` never noise, policy refusal → FAILING report with the stated reason and no spawn, missing `preApproved` → the exact `checkpoint required for exec (§28)` message, `only` miss → vacuous total-0 without paying for a spawn, through `registerTestTools` the granted call states the exec-host engine and an unknown `only` is a tool ERROR, runTask e2e verifies with a real COMMAND and journals the report |
| `exec-host/gitTools.test.ts` (17) | v32 (fake spawn): `parseGitStatus` XY→named statuses + counts + rename keeps NEW path + junk XY = `other`; `parseGitDiff` per-file hunk/add/delete tallies with `+++`/`---` excluded and preamble ignored; `parseDiffStat` footer groups / empty / junk→null; policy allows EXACTLY `git status --short`/`git diff`/`git diff --stat` and default-denies push/commit/path-scoped diff; `gitEnv` picks only named vars; tools both exec-permission, no-checkpoint never reaches host (0 spawns), granted `git.status` returns PARSED entries and the spawn env is policy-scrubbed (`TOKEN` never seen), `stat:true` swaps argv, exit 128 is ok:false DATA not a throw, escaping cwd = stated tool ERROR, truncation labeled in detail |
| `exec-host/gitCommitTool.test.ts` (16) | v35 (fake spawn): `parseCommitOutput` reads `[branch (root-commit)? hash] subject` + stat footer (create-mode lines AFTER the stat), insertions-only, non-echo → null; `gitCommitPolicy` allows EXACTLY `git commit -m <msg>` (incl. a message literally `*` — the v29 `'*'` ARG wildcard, first production wiring) and default-denies bare `git commit`, `-m a b`, `-am`, `--no-verify -m x`, `add`, `push`, `rm -rf /`; blank message throws BEFORE the policy with ZERO spawns; granted commit hands argv verbatim (`['commit','-m',msg]`, multi-line/quoted message intact, env scrubbed) and renders `git.commit → exit 0: master@0a1b2c3 · N file(s) +I −D`; nothing-staged exit 1 is ok:false DATA carrying git's first stderr line; escaping cwd = tool ERROR 0 spawns; a message smuggling `--no-verify -a` stays ONE argv token |
| `exec-host/gitLogTool.test.ts` (14) | v37 (fake spawn): `parseGitLog` reads `<hash> <subject>` lines newest-first (leading-space tolerant), merge subjects kept verbatim, blank lines free, a hashless line is COUNTED (`skipped`) never guessed, empty stdout = honest empty log; `gitLogPolicy` allows EXACTLY `git log --oneline -n <count>` (the wildcard's second production wiring) and default-denies bare `git log`, no `-n`, no count, a trailing ref, `--all`, `git show`, `git commit`, `git push`; `git.log` is exec-permission (a read still spawns) — no checkpoint ⇒ 0 spawns, granted ⇒ default window 10 with argv `['log','--oneline','-n','10']` and scrubbed env, explicit count rides the wildcard token verbatim; junk counts (0, −3, 1.5, >100, NaN) throw the bounded-read-back error with the spawn counter frozen; empty-repo exit 128 is ok:false DATA quoting git's stderr line; escaping cwd = tool ERROR 0 spawns; skipped lines surface in detail as "counted not guessed" |
| `exec-host/gitShowTool.test.ts` (19) | v42 (fake spawn): `parseShowDiff` yields HEAD's `addedLines` for ONE path (a new file = its whole content), `+++`/`---` and mode/rename/similarity lines are never content, `\ No newline` skipped, `Binary files … differ` → `binary:true` with no lines claimed, empty stdout = honest empty change; `validateShowPath` accept/refuse matrix (blank, whitespace, newline, leading `-`, absolute incl. `C:\`, any `..` segment); `gitShowPolicy` allows EXACTLY `git show --format= -- <path>` (revision pinned BY OMISSION, `--` forces pathspec semantics) and default-denies bare `git show`, `show HEAD`, a named rev, `HEAD~9:file` blob syntax, 0/2/3 path tokens, `git log`/`commit`/`add`; no checkpoint ⇒ 0 spawns, denied ⇒ 0 spawns, granted ⇒ argv `['show','--format=','--',path]` with scrubbed env and the exact detail string; exit 128 is ok:false DATA quoting git's stderr; escaping cwd refused before any spawn |
| `exec-host/gitStagedTool.test.ts` (20) | v43 (fake spawn): `parseStagedDiff` reads the INDEX — change KIND from git's own metadata (`new file mode`→added, `deleted file mode`→deleted, `rename from`→renamed with the NEW path, `copy from`→copied, else modified), per-file hunks/additions/deletions/`addedLines`/binary, multi-file tallies, preamble ignored, `\ No newline` not a line, empty stdout = honest zero changes; `tallyStagedCounts` in canonical order regardless of key order; `gitStagedPolicy` allows EXACTLY `git diff --cached` and `--cached --stat` and default-denies the unstaged `git diff`, path-scoped and `--name-only` forms, `--ext-diff`/`--textconv` (git EXECUTES a helper), `--output=<file>` (a read that WRITES), `--stat --ext-diff`, `-c diff.external=evil …`, `add`/`commit`/`log`/`show`; `git.staged` is exec-permission — no checkpoint ⇒ 0 spawns, denied ⇒ 0 spawns, granted ⇒ argv `['diff','--cached']` (or `--cached --stat`) with scrubbed env, counts/totals/paths and a byte-exact detail; an EMPTY index is spelled out as "nothing is staged, so a granted git.commit right now would have nothing to record"; binary counted with no lines claimed; exit 129 ok:false DATA; escaping cwd and a non-boolean `stat` refused with zero spawns |
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
(Amendment 35 later shipped a real `git.commit` tool — ONE argv, staged-index-only,
§28-gated — without retiring this in-jail patch flow.)

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

## ExecTest proof (`exectest-proof.mjs`, M2 v31)

All against FAKE spawns (the real-command demo already lives in `exec-host-proof.mjs`):
exit 0 maps to a passing report whose engine is literally `exec-host:node app.js`, exit 1
carries the stderr VERBATIM, a timeout kill says `killed at timeout budget (SIGTERM)`.
Denials are data: a policy refusal fails with its stated reason and zero spawns, no
`preApproved` yields the exact §28 string, an `only` miss is vacuous without paying for a
process. Through `registerTestTools` the registry's exec gate is the ONE checkpoint —
granted verify = exactly one spawn, and a `runTask` completes with its §63 verify step
answered by a COMMAND and journalled. Finally `runtime/dist/testRunner.js` is grepped for
`child_process` again: the async seam did not smuggle a spawn into the runtime.

## Git-aware proof (`git-aware-proof.mjs`, M2 v32)

Parsers first, while everything is still pure data: porcelain XY codes → named statuses +
counts (rename keeps its NEW path), unified diff → per-file hunk/add/delete tallies
(`+++`/`---` headers never count), `--stat` footer → summary or an honest `null`. Then the
policy: `gitReadOnlyPolicy` plans exactly `git status --short` / `git diff` /
`git diff --stat` and default-denies `git push`, `git commit -m x`, path-scoped diffs.
Against a FAKE child the tools are §28-gated (no checkpoint = zero spawns), return PARSED
entries, hand git a policy-scrubbed env (`TOKEN` dropped), refuse an escaping cwd, surface
exit 128 as data and label truncated reads partial. Finally the §60 honesty step on the
REAL repo: `git.status` and `git.diff --stat` through the same machinery, counted entries
agreeing with their own totals — the agent can SEE the repo; it still cannot TOUCH it.

## Exec-suite proof (`execsuite-proof.mjs`, M2 v34)

The first time a repo test suite answers `test.run` for real. Policy math up front: ONE
five-token argv (`node node_modules/vitest/vitest.mjs run --root
packages/design-model`) plans — inert, env-scrubbed, budgets clamped to the policy caps —
while whole-repo widening, other packages, wrong arity and `git push` all default-deny.
Every gate then runs against the REAL host with a counting wrapper around `NODE_SPAWN`:
§28 absence, human denial, an escaping cwd and a widened argv each return an honest
FAILING report while the spawn counter stays at zero; a vacuous `only` filter never even
pays for a process. Then the granted verify: the design-model vitest suite boots (~11s),
exits 0, and the counter moves exactly once — spawn cwd is the jail root and the spawn
env is EXACTLY the eight allowlisted names. §60 stays exact in the report itself: one
named exit-zero check whose detail carries vitest's own ANSI summary verbatim under the
engine label `exec-host:node …vitest…` — a command's verdict, never masquerading as
predicates. What this does NOT claim: no OS/container isolation (ADR 0013's other half is
open) and no suite is wired by DEFAULT anywhere else — this is the policy CHOICE made
once, visibly.

## Commit proof (`commit-proof.mjs`, M2 v35)

The first WRITE any agent tool has ever performed through the sandbox — and it is careful
about it. Policy math first: `gitCommitPolicy` plans ONLY `git commit -m <msg>` (the
message rides the v29 `'*'` ARG wildcard — shape fixed, content floats, arity enforced)
while bare `git commit`, `-am`, `--no-verify -m x`, `git add .`, `git push` and
`rm -rf /` all default-deny; a blank message is refused BEFORE the policy and before any
process could spawn. Then the REAL demo, §9-safe by construction: a throwaway repo under
`os.tmpdir()`, where `core.hooksPath`, `commit.gpgsign` and identity are set LOCALLY
(that repo only — the global codex hooks and the user's real git config are neither
bypassed nor touched). Through the §28 registry gate the granted `git.commit` commits
EXACTLY the staged file — stat says `1 file`, while an unstaged edit (` M a.txt`) and a
never-staged file survive the commit untouched, proven by porcelain, not by hope — a
second commit with an empty index returns honest `ok:false` DATA (git's own "nothing to
commit" line), and the entire run spawns exactly TWO sandboxed processes. The final
assertion is the one that matters for this repo: the HOME repository's HEAD is
byte-identical before and after.

## Green-commit proof (`greencommit-proof.mjs`, M2 v36)

v35 gave the loop a door; v36 teaches it WHEN to knock — and proves it still cannot force
its way in. Pure plan data first: `planTask` appends the `git.commit` step ONLY when the
host has BOTH a verify runner and a registered commit tool, and the step's message states
its own run (`chore(agent): verified run <id> · seed <n>`). Then the three-state story in
a throwaway `os.tmpdir()` repo (hooks/signing/identity neutralized LOCALLY there, §9):
a RED run carries the commit in its plan but reaches 0 steps past verify and 0 spawns; a
DENIED checkpoint (the human who never stages) records `denied at checkpoint (exec)` with
still 0 spawns; a GREEN-AFTER-FIX run — the case the old loop structurally skipped — walks
`search→read→annotate→verify→fix-1→verify-2→commit` in that exact EXECUTED order and
commits the ONE human-staged deliverable, argv `['commit','-m',msg]` verbatim in the jailed
cwd with exactly the scrubbed env keys. The proof's cumulative spawn counter is the honest
headline: red + denied together cost ZERO processes; each approved commit costs exactly
ONE. The ledger then replays `record.hash` from JSONL, `rev-list --count` agrees with
git's own eye, and the final assertion again byte-compares THIS repo's HEAD.

## Git-log proof (`gitlog-proof.mjs`, M2 v37)

See → touch → CONFIRM, all three verbs now real and all three behind keyed doors. ONE
registry, TWO hosts: a log host that can only read its one argv shape
(`git log --oneline -n <count>` — the wildcard's second production wiring, count bounded
1–100 by the tool itself) and a commit host that can only write v35's. In a throwaway
`os.tmpdir()` repo the story runs straight through: an empty repo answers exit-128 DATA
(not a crash), a HUMAN seeds history outside any sandbox, the agent commits the staged
file through §28 — then `git.log` reads the ledger back and must AGREE byte-for-byte:
newest logged hash+subject === the `GitCommitRecord` the commit tool handed back, with
the human commit sitting below (history shared, never overwritten). The gate negatives
are as loud as the positive: a denied checkpoint, an unbounded count, and `git push`
handed directly to the LOG host with `preApproved:true` all cost ZERO processes — the
whole true story spends exactly 3 spawns. HOME HEAD byte-identical, temp repo deleted.

## Confirm proof (`confirm-proof.mjs`, M2 v38)

v37's read-back existed as a DOOR; v38 makes it the plan's own LAST WORD — and this is the
first proof where `runTask`, the real loop rather than a hand-called tool, drives REAL
`git.commit` + REAL `git.log`. Pure plan data first: `planTask` appends the `confirm` step
(`git.log`, window `{count:2}`) only where a commit step exists, which exists only behind
verify — a nested tail nobody can reach early. Then the three-state story in a throwaway
`os.tmpdir()` repo (§9; hooks/signing/identity neutralized LOCALLY there): ALL-GRANTED
executes `search→read→annotate→verify→commit→confirm` in exactly that order, and the
money assertion is CROSS-TOOL — the log's newest hash+subject equals the
`GitCommitRecord` the commit tool reported, byte for byte, human seed below.
`rev-parse`'s FULL 40-char SHA vs the echoes' abbreviation is stated in the proof itself
(prefix, not equality). DENIED confirm after a LANDED commit: status `denied`, the commit
result stands a slot earlier, the vetoed read costs zero spawns. RED: the plan PROPOSED
the whole arc and neither tail ran. The ledger replays commit record AND read-back to a
cold reader on the same page. Total sandbox processes for the true story: 3. HOME HEAD
byte-identical, temp repo deleted.

## Remember proof (`remember-proof.mjs`, M2 v39)

The memory loop closes: ONE throwaway `os.tmpdir()` repo, REAL sandbox commit+log hosts
and a REAL `MemoryStore` alive across FOUR full `runTask` runs. Pure plan data first:
`memory.save` is planned ONLY as the tail of verify→commit→confirm — pull any earlier
tier (confirm, commit, or verify) and the step vanishes with it. Then the story: run 1
wins (executed order ends `commit→confirm→remember`; exactly ONE record in scope
`agent-runs`, its planned `@search.hits.0.path` ref resolved to the LIVE workspace path,
2 spawns). Run 2's research step is `memory.recall` — it RECALLS run 1's victory FROM the
memory that victory wrote — then meets a denied commit: no second win stored, zero
spawns, HEAD unmoved. Run 3 vetoes the ACT OF REMEMBERING itself after a landed,
confirmed commit: status denied, the agreeing read-back STANDS in results, the store
provably never saw the write. Run 4 goes red: the plan proposes the whole arc and
commits, confirms and remembers NOTHING. The ledger replays cold: the JSONL reader's
last result IS the `memory.save` whose `output.id` equals the live store's record id —
memory, ledger and git history tell ONE joinable story. 4 sandbox processes total; HOME
HEAD byte-identical, temp repo deleted.

## Policy-gate proof (`policygate-proof.mjs`, M2 v40)

§28 as a TABLE, diffed against itself. Pure data first: first-match-wins over ordered
rules, unmatched calls landing on the EXPLICIT default, and a rejection matrix proving a
malformed table (no reason, empty pattern, non-boolean grant, duplicate pattern = dead
rule, mute default) throws at CONSTRUCTION — before it can silently gate anything. Then
the SAME plan and the SAME REAL sandbox git tools run under TWO policies in a throwaway
`os.tmpdir()` repo (§9): the closed table denies `git.commit` — status denied, zero
spawns, HEAD unmoved, workspace work standing; the open table commits exactly once and
history moves. The two audit trails are the same length and differ on EXACTLY one
decision — `git.commit` — each receipt quoting its rule's stated reason verbatim, and
the read steps produce no verdicts at all (the gate sits on hands, not eyes). An
unlisted exec-capability falls to the default row and never runs. HOME HEAD
byte-identical, temp repo deleted.

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

## v31 note — verification by REAL commands: the async seam + the exec-host bridge

`TestRunner.run(only?)` may now return a Promise and `registerTestTools` awaits it;
`predicateRunner` stays sync so every v28 host is untouched. `execTestRunner(host, argv,
{name, preApproved, cwd, env})` — in `@nexus/exec-host`, never in the runtime — maps an
`ExecRunResult` to a `TestReport` verbatim: engine `exec-host:<argv>`, pass = ran ∧ exit 0
∧ not killed ∧ no spawn error. Refusals become honest FAILING reports (policy reason,
missing §28 gate, timeout kill), never crashes, never spawns. Through `registerTestTools`
the registry's exec permission remains the single checkpoint. This is the seam that lets a
real suite answer `test.run` — no repo suite is wired by default ANYWHERE else (§60: the
bridge proves the mechanics; v34's `execsuite-proof.mjs` is the one deliberate,
evidence-only wiring of a real suite).

## v32 note — read-only git awareness: see, don't touch

`gitReadOnlyPolicy(root)` allows exactly three argv (`git status --short`, `git diff`,
`git diff --stat`) — §9 holds BY POLICY, and the write tools (`git commit`) are
deliberately a later, separately-gated slice (Amendment 35 later landed exactly that
slice, still default-deny for everything but one argv — see below). `registerGitTools(registry, host, {env})`
exposes them as exec-permission `git.status`/`git.diff` (§28 gates the PROCESS even though
the repo is read-only; the registry checkpoint stays the single gate), always via the v30
host: planExec refusals become tool errors, env is policy-scrubbed, cwd stays jailed,
budgets bind. Outputs are STRUCTURED — parsed porcelain entries+counts, file→hunk tallies,
stat summaries — with `truncated`/`exitCode` riding along so partial awareness is always
labeled. `gitEnv()` picks the handful of vars git needs (`PATH`, `SYSTEMROOT`, `HOME`,
`USERPROFILE`) out of any source. Nothing in `@nexus/agent-runtime` changed: 207/207
holds, the runtime stays provably spawn-free.

## v34 note — a repo test suite really verifies through the sandbox

No product code changed; v34 is the POLICY CHOICE the v31 note said was pending, made
once in `execsuite-proof.mjs`: the design-model vitest suite boots through
`createExecHost` + `execTestRunner` + the §28 registry gate under a ONE-argv policy,
exits 0 in ~11s, and the counting `NODE_SPAWN` wrapper proves every denial spawned
nothing while the granted verify spawned exactly one process with EXACTLY the
allowlisted env at the jailed cwd. Honest bounds unchanged: POLICY sandbox (no OS
container/egress), subprocess reports are one exit-zero check carrying the suite's own
summary verbatim, and nothing outside the proof wires a real suite by default.

## v35 note — git.commit: the first write through the sandbox, one argv wide

`gitCommitPolicy(root)` allowlists EXACTLY `['git','commit','-m','*']` — the first
production wiring of the v29 `'*'` ARG wildcard: the shape is fixed, only the message
floats, and `argvMatches` arity keeps `-m a b` out. The tool commits ONLY the
human-staged index: no `add`, no `push`, no flag combinations — §28 stays double-gated
(stage is human, commit is the checkpointed call). Under `shell:false` argv-as-data even
a message literally containing `--no-verify -a` is ONE token that git reads as prose,
never as flags — proven in test. Blank messages throw before the policy (0 spawns);
refusals and escaping cwds are tool ERRORS; a real nonzero exit ("nothing staged") is
ok:false DATA with git's first stderr line. `parseCommitOutput` renders success into a
`GitCommitRecord` (branch/hash/root-commit/subject + stat footer, create-mode lines
come AFTER the stat). §9 discipline: `commit-proof.mjs` performs real commits ONLY in a
throwaway `os.tmpdir()` repo with hooks/signing neutralized locally there, and closes by
byte-comparing THIS repo's HEAD before/after — the agent can commit; this repository's
history remains the user's. Runtime untouched (spawn-free); exec-host 41/41 → 57/57.

## v36 note — commit after green: position in the plan IS the safety

The commit step became a PLANNED step: `PlannerOptions.hasCommit` (only meaningful with
`hasVerify`) appends `{stepId:'commit', tool:'git.commit'}` after the verify step, so a
plan only ever PROPOSES a commit at the one position that is structurally behind green —
§28 disposes. Executing it needed an orchestrator rewrite: the old verify block
early-returned `completed` on green-via-fix-round, which would have skipped the trailing
commit forever. Now a `green` flag replaces the early return, fix-round steps stay
appended to the plan array, and a `byStep`-executed check at the loop top guarantees an
inline-run `fix-N`/`verify-N` never runs twice when the loop keeps walking. Event streams
of every pre-v36 run are unchanged (207/207 passed BEFORE the new tests). Honest bounds:
Studio registers no exec-host tool, so no browser plan can contain a commit — this is
runtime + evidence only; agent-led STAGING remains out of design scope (the checkpoint
callback is WHERE the human stages); runtime 207/207 → 213/213, exec-host unchanged.

## v37 note — git.log: the read side earns its own keyed door

`gitLogPolicy(root)` allowlists EXACTLY `['git','log','--oneline','-n','*']` — the v29
`'*'` ARG wildcard's SECOND production wiring, this time on the read side: shape fixed,
count floats, arity enforced. `registerGitLogTool` exposes §28-gated `git.log` — a
READ that still spawns a real process, so the checkpoint still sits on it — and the tool
bounds the WINDOW (count 1–100, default 10) while the policy fixes the SHAPE: junk
counts are rejected before the policy is consulted, zero spawns. `parseGitLog` renders
`<hash> <subject>` lines into ordered entries and COUNTS hashless echo lines instead of
guessing them; an empty repo is git's exit-128 stderr quoted as DATA. The proof's money
assertion is self-verification: after a granted commit, `git.log`'s newest entry equals
the `GitCommitRecord` hash+subject byte-for-byte — the agent can CHECK, not just claim.
A log host handed `git push` with `preApproved:true` still refuses: keyed doors do not
borrow each other's powers. Runtime 213/213 UNCHANGED (no runtime code moved);
exec-host 57/57 → 71/71 (14 gitLogTool cases).

## v38 note — confirm after commit: the PLAN ends in git's own words

v37 built the door; v38 wires it into the plan itself: `PlannerOptions.hasConfirm` —
nested INSIDE the `hasCommit` block — trails a `{stepId:'confirm', tool:'git.log',
args:{count:2}}` step so the plan's arc is see→touch→CONFIRM and the run outcome closes
with git's verdict, not the agent's claim. The orchestrator's control flow did NOT move:
v36's green-flag walk already executes whatever trails verify, so the only runtime edit
besides the planner is capability detection (`hasConfirm: registry.has('git.log')`).
Denied-confirm semantics are now tested, not incidental: status `denied` while the landed
commit's `ok:true` result STANDS in results — "it wrote, and could not verify" is the
truthful outcome, and a throwing `git.log` still ends `failed_verification`, never a
silent green. Honest bounds: Studio registers no exec-host tool so no browser plan can
confirm anything — runtime + evidence only; staging remains a human act; agent-led
STAGING, `git push` and a real model behind the planner seam remain OUT.
Runtime 213/213 → 218/218 (5 new agent.test.ts cases); exec-host 71/71 unchanged.

## v39 note — remembered victories: memory holds only what the loop proved

`PlannerOptions.hasRemember` — nested inside hasConfirm, inside hasCommit, inside
hasVerify — puts the ONLY planned `memory.save` at the tail of the full arc, so the
summary string `COMMITTED+CONFIRMED` is a CONSEQUENCE of position, not a claim (§60):
red, denied-commit and even denied-confirm all structurally cannot write memory. The
orchestrator gained capability detection plus one dataflow upgrade — `resolveArgs` now
resolves `@refs` INSIDE array args, so the planned `refs:['@search.hits.0.path']` becomes
the live workspace path at invoke time (the same channel v0's read step always used,
widened to lists). Denied-remember points §26's delete-key promise inward: the human can
veto even remembering a real victory — status denied, commit and read-back still standing,
store provably untouched. Honest bounds: Studio registers no exec-host tools so no browser
plan reaches the remember tier at all; the recorded summary carries seed+mode, and the
commit HASH stays in results/ledger (joinable by `runId`) rather than being copied into
memory text. Runtime 218/218 → 224/224 (6 new agent.test.ts cases); exec-host 71/71 and
studio 99/99 unchanged — no exec-host or browser-side code moved.

## v40 note — checkpoint policy as data: a table you can diff, not a closure you must trust

`checkpointPolicy.ts` moves the §28 DECISION from anonymous closure to inspectable data:
ordered rules (tool pattern via the registry's own `matchesTool`, grant, REQUIRED reason)
+ explicit default, pure `decide`, and `policyCheckpoint` adapting a validated table to
the UNCHANGED `Checkpoint` type while keeping one receipt per gated call. Honest bounds
stated in the ADR: a policy auto-approving is exactly as trusted as the human who wrote
it — this changes WHERE judgment lives, not WHO owns it; the receipts exist so no
decision can be claimed silently. No host was switched over by this amendment: the
dock's live Allow-once human remains the default §28 face; the table is the
pre-authorizable, auditable alternative, proven side by side. Runtime 224/224 →
232/232 (new `checkpointPolicy.test.ts`, 8 cases); exec-host and studio unchanged.

## v42 note — CONTENT read-back: a hash says something landed; `git.show` says WHAT

v37/v38 confirmed a commit by HASH agreement with git's own echo — sufficient for
"something was recorded", silent about what. `gitShowTool.ts` adds the third pinned door:
the policy allows exactly `['git','show','--format=','--','*']` — HEAD pinned BY OMISSION,
`--` forcing the floating token to be a PATHSPEC (blob syntax like `HEAD~9:README.md`
after `--` matches nothing rather than naming another commit), `validateShowPath`
throwing on junk paths before any spawn. `parseShowDiff` → hunks/additions/deletions/
`addedLines`/binary, stating its own scope (a 1-line change claims 1 line, never the
file); git's non-zero answers (unborn HEAD ⇒ exit 128) are honest DATA, never a crash —
v44 corrected this note's original claim that an unmatched path prints a pathspec refusal,
because running it showed git exits 0 with an EMPTY diff after `--`. `show-proof.mjs` (31st) runs
commit → log → show against REAL git in a throwaway os.tmpdir repo and asserts the read
lines are BYTE-EQUAL what the human staged; a denied show costs 0 spawns. exec-host
71/71 → 90/90 (new `gitShowTool.test.ts`, 19 cases); runtime 232/232 and studio 105/105
unchanged — the plan tail stays v38/v39's; this is a tool, wired by humans or policy.

## v43 note — staged intent: the agent can read what a human MEANT to record, before it is recorded

v35 commits the STAGED index and §28/§9 keep staging a human act — so a person chooses the
bytes an agent records, and the stack could not read a single one of them: v32 allows plain
`git diff`, which compares the working tree TO the index, and a change that is only staged
shows as NOTHING there. `gitStagedTool.ts` adds the fourth pinned door
(`git diff --cached`, plus its `--stat` form) — narrow on purpose, because `git diff` gains
powers from options this policy will never name: `--ext-diff`/`--textconv` make git EXECUTE a
configured helper (code execution in a read-only costume) and `--output=<file>` makes a
"read" WRITE. `parseStagedDiff` answers the question an index poses — WHICH files, and as
WHAT kind of change — with the kind taken from git's own metadata lines, and it spells out an
empty index in the words that matter before a commit. `staged-proof.mjs` (32nd) measures the
gap in real git (`git.diff`: 0 files / `git.staged`: 3 verbatim lines, byte-equal
`git show :intent.md`), shows the two doors are complementary rather than redundant (edit
without staging: `git.diff` sees the new +1, `git.staged` still recites the staged three),
and closes the arc across the write — the intent read BEFORE a §28-granted commit is
BYTE-IDENTICAL to the content `git.show` reads AFTER it, while the line nobody staged is
stated as NOT recorded. exec-host 90/90 → 110/110 (new `gitStagedTool.test.ts`, 20 cases);
runtime 232/232 and studio 105/105 unchanged — a door, not yet a plan step.

## v44 note — the plan walks through the content door: `inspect` trails `confirm`, and git's blank answers stay blank

v42 built the CONTENT door and v43 the INTENT door; both stayed hand-invoked, so the PLAN still
stopped at v38's hash. `planTask` now takes `hasContent` (orchestrator: `registry.has('git.show')`)
and pushes `{stepId:'inspect', tool:'git.show', args:{path: target}}` INSIDE the `hasConfirm`
block and BEFORE `hasRemember` — a green run's own tail is
`verify → commit → confirm → inspect (→ remember)`, and the content step cannot be reached without
a commit that a hash confirm already agreed on. The step carries a `@search.hits.0.path` LIVE ref,
not a path the planner invents: it reads back whatever the run actually found and a human actually
staged (§28 keeps staging human). Two bounds hold the line: `memory.save` still says
COMMITTED+CONFIRMED and nothing about content (a test fails if the summary grows the word
`CONTENT`), and git's two BLANK answers are DATA — an unmatched path exits 0 with an empty diff
(zero hunks, zero lines, detail stating its own emptiness), while a non-zero git (unborn HEAD,
exit 128) reads as `ok:false` and never as a green. `inspect-proof.mjs` (33rd) runs `runTask` over
three keyed hosts in a throwaway os.tmpdir repo: four §28 gates per granted run (`test.run`,
`git.commit`, `git.log`, `git.show` — every exec-armed step asks for itself), `addedLines`
BYTE-EQUAL the three human-staged lines, a denied inspect costing 0 spawns with the landed arc
standing, red spending none of the tail, the exit-128 case reproduced by a real process in a
SECOND repo (the loop cannot produce it at `inspect`, since its own commit creates HEAD), and the
ledger replaying record + hash + content to a cold reader. runtime 232/232 → 239/239 (1 planner +
6 orchestrator cases); exec-host 110/110 and studio 105/105 unchanged — the only source change
there is v42's empty-diff sentence, which now says only what git said.

## Scope honesty

§63/§26 items *not* implemented (stated, not faked): general real-fs write tools (only
`disk.write` inside an explicit jail root, always checkpoint-gated), GENERAL process
execution — since v30 `@nexus/exec-host` can run EXACT allowlisted argv under §28 with
plan budgets, but there is no arbitrary-command path, no shell, and no OS/container
sandbox (ADR 0013's egress/secret/containers half is open); v31 added the bridge by which a
command CAN answer `test.run` (`execTestRunner`), and v34 proved it once for real —
`execsuite-proof.mjs` runs the design-model suite through the host — but NO repo suite is
wired by default outside that evidence file, and the runtime package itself stays
spawn-free by audited design. Since v35 the git write surface is ONE argv wide
(`git commit -m <msg>` via a separate `gitCommitPolicy`, staged-index-only, never `add`/
`push`), and since v37 the git read surface has grown exactly one bounded window
(`git log --oneline -n <count≤100>` via `gitLogPolicy`; since v42 exactly one bounded
CONTENT door too (`git show --format= -- <path>` via `gitShowPolicy` — HEAD pinned by
omission, pathspec-only float; v38 added NO new surface, it only wired that existing door
into the plan's tail, and v44 does the same for v42's content door — still ONE argv, now
walked by the plan itself instead of a hand; since v43 the INDEX is readable through a two-shape door
(`git diff --cached` / `--cached --stat` via `gitStagedPolicy` — no paths, and specifically
no `--ext-diff`/`--textconv`/`--output`, which would let a "read" execute a helper or write a
file) — the v32 see-don't-touch policy
stands for everything else, and real-commit
demos live only in throwaway temp repos. Agent-led STAGING (choosing what enters the
index) remains unimplemented by design: staging stays a human/`disk`-side act,
and v43 makes that act LEGIBLE to the agent (read the index, never write it),
live-model planning (the seam exists, the model needs keys), multi-agent registry.
Memory recall (v6) shares the index's deterministic token-bag hybrid score — a real
signature scheme, but still a stand-in for the pgvector hybrid retrieval of ADR 0012. The provider must be kept in sync with the workspace by the
host; it only ever sees the host-supplied file set (§60).
