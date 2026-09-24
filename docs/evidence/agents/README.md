# M2 evidence — agent stack (v0 loop → v51 the host keeps its own spawn record → v52 a door quotes what git MEANT → v53 the output budget is PER STREAM → v54 the run line answers for its own gates → v56 the budget names the pipe it cut → v57 one conflicted repository, one story → v60 the report sentence may not pick a favourite pipe → v61 a door hands on paths, and a picture of a path is not one; all ADR 0016 amendments)

All checks are headless, offline, key-free, and reproducible from the repo root. Nothing here
claims model-quality planning or neural retrieval (§60): the planner is a deterministic
template and the index embedder is a hash-based bag-of-tokens stand-in — both say so in
every emitted artifact (`provenance.mode = "demo"`). The honest exceptions since v30/v32/v34/v35/v36/v37/v38/v39/v40/v42/v43/v44/v45/v46/v47/v48/v49/v50/v51:
`exec-host-proof.mjs` and `git-aware-proof.mjs` spawn a few read-only local commands
(`git status --short`, `git diff --stat`), `execsuite-proof.mjs` runs the repo's OWN
@nexus/design-model vitest suite through the confined host (vitest's cache under
`node_modules` is the only thing it writes — and `bridge-report-proof.mjs` (v60) boots
that SAME suite once more, on purpose, only to compare the report SENTENCE against the bytes
of the one run that produced it), and `budgets-proof.mjs` (v48) boots that SAME
suite through the host TWICE — once under a 400 ms budget that KILLS it mid-run, so a real
SIGTERM and — since v60 — a stated `no exit code reported` are on the record, and once under a generous budget as the
control that proves the failure was the budget and nothing else — while its git sections make
one HUMAN seed commit inside a throwaway `os.tmpdir()` repo and then stage (never commit) the
content they measure, `commit-proof.mjs` + `greencommit-proof.mjs`
+ `gitlog-proof.mjs` + `confirm-proof.mjs` + `remember-proof.mjs` + `policygate-proof.mjs`
+ `show-proof.mjs` + `staged-proof.mjs` + `inspect-proof.mjs` + `intent-proof.mjs`
+ `role-arc-proof.mjs` + `durable-arc-proof.mjs` + `receipts-proof.mjs` + `spawnlog-proof.mjs`
+ `runreceipts-proof.mjs` + `verdict-proof.mjs` + `streams-proof.mjs` + `reap-proof.mjs` + `conflict-proof.mjs` perform REAL `git commit`s (and since v37/v38
real `git log` read-backs — v38's for the first time driven by `runTask` itself, not a
hand-called tool; v39's runTask additionally writes a REAL in-process `MemoryStore`; v42 adds a real
`git show` content read-back and v43 a real `git diff --cached` index read, both HUMAN-staged
content only; v44's `inspect-proof.mjs` is the first where the PLAN ITSELF schedules that
content read, and v45's `intent-proof.mjs` the first where the PLAN ITSELF reads the INDEX one
step before asking to record it, so the loop — not the proof — decides both to look and to look
first; v47's `role-arc-proof.mjs` is the first where that decision belongs to a NAMED ROLE
(`releaser`, four doors and nothing else) walking a green chain's tail; v49's
`durable-arc-proof.mjs` and v50's `receipts-proof.mjs` are the first where the chain's OWN audit
trail is a real `node:fs` JSONL file — created inside that same throwaway repo, read back by a cold
`loadLedger` after the chain returns, and deleted with it; v51's `spawnlog-proof.mjs` is the first
where the file is written by the HOST itself rather than by a caller that remembered to, it records
the REFUSALS no ledger line ever mentioned, and it deliberately lives in a sibling tmp directory
OUTSIDE the repo git is watching — because §9 caught that a journal inside the watched tree becomes
an untracked file that git then reports about itself; v52's `verdict-proof.mjs` is the first where the
thing under test is the DOORS' OWN SENTENCES — it builds a real conflicting merge, a real
`index.lock` and a truncated `.git/index` (all by the harness, playing the human) and then runs each
failing state TWICE, once through the sandbox and once RAW outside it, so every quote is checked
against git's bytes rather than against the door's memory of them; v54's `runreceipts-proof.mjs` walks the same
four doors and is the first where the RUN line's own gates live in that same file — who allowed the
write that the commit recorded, checked not against the runtime's memory but against the workspace the
granted write changed and the commits `git rev-list` counts) — only inside throwaway `os.tmpdir()` repos
with hooks/signing neutralized LOCALLY there, never in this repository — still offline,
still key-free, and everything else in the stack spawns nothing. `streams-proof.mjs`, `reap-proof.mjs` and `pipes-proof.mjs` (v53/v55/v56) spawn real `node` processes as their SUBJECT — one to measure how a byte ceiling falls between two pipes, the other to measure who is STILL ALIVE after a timeout kill — and write only inside `os.tmpdir()`, the latter proving it by reaping its own survivor before it dares to delete the directory. v53's `streams-proof.mjs` is the one
proof whose SUBJECT is a hook: it installs a real `pre-commit` in a throwaway repo that prints 20 000
bytes with no newline and refuses, purely so a door can be caught between quoting it verbatim and
admitting the budget ate it — and §1/§4 run real `node` processes only to measure how many bytes the
host is willing to hold, which is the whole point of that increment. `config-proof.mjs` (v46) is
the one place here where a proof DELIBERATELY makes git execute a program: its unpinned
control faces write a hostile `.git/config`, `.gitattributes` and `$HOME/.gitconfig` into
throwaway repos so the pre-v46 hole is REPRODUCED on the record instead of asserted (the
tripwire is a `touch` inside `os.tmpdir`, removed in `finally`), and every shipped door in the
same file is then asserted to run ZERO programs. `porcelain-path-proof.mjs` (v61) is the proof whose SUBJECT is git’s own RENDERING of a name: 11 real read-only `git` processes through the shipped doors, plus the human’s acts that make the state exist (init, config, add, and ONE real `git commit` through the commit door) — every byte inside a throwaway `os.tmpdir()` repo, and one section deliberately REMOVES the v61 pin from the environment so the counterfactual bytes come from git rather than from this file.

## Reproducible gates

```
npm test          # turbo: @nexus/agent-runtime 323/323 + @nexus/exec-host 233/233 vitest among all packages
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
node docs/evidence/agents/intent-proof.mjs         # requires `npm run build` first (v45: the PLAN reads the INDEX before asking to record it — five §28 gates, staged intent BEFORE and HEAD content AFTER byte-equal in one run, a denied read costing zero commits, an empty index stated one step before git's blunt first line)
node docs/evidence/agents/config-proof.mjs         # requires `npm run build` first (v46: hostile .git/config + .gitattributes + $HOME/.gitconfig in throwaway repos — the pre-v46 control REALLY executes a tripwire program and reports an empty diff; the shipped doors report git's builtin answer with ZERO programs, and .git/index keeps its mtime)
node docs/evidence/agents/role-arc-proof.mjs       # requires `npm run build` first (v47: `runRoleChain` + the `releaser` role over four REAL keyed doors — a ROLE reads the human's staged lines before the commit and the SAME lines back from HEAD after it, four git gates, a veto at the content door that leaves the granted commit standing, a red chain that spends no ask at all, and a chain without `release` that is the v14/v22 chain byte-for-byte; throwaway os.tmpdir repo only)
node docs/evidence/agents/budgets-proof.mjs        # requires `npm run build` first (v48: byte budgets DERIVED from real git's own output — 16 cuts that land INSIDE a line, 8 of them INSIDE one character — where the shipped door keeps whole staged lines and the legacy prefix is recomputed at the same cuts to show it invented content; a 4-byte budget that survives NO whole line names the cut instead of calling the index empty, while a genuinely clean index through the same door is still stated EMPTY; a ~107 KB read arriving in a dozen-plus chunks re-joins byte-exact; and the REAL design-model vitest suite KILLED at a 400 ms budget (SIGTERM, `exit null`, FAILING report) against the same argv green at 180 s)
node docs/evidence/agents/durable-arc-proof.mjs    # requires `npm run build` first (v49: the real `runRoleChain` writes a real `node:fs` JSONL ledger INSIDE a throwaway os.tmpdir repo and a cold reader replays it — the durable commit hash compared against `git rev-parse HEAD` measured OUTSIDE the loop, a veto durable AS stopped, a red chain's refusal durable as a refusal at zero spawns, a hand-forged arc line counted as `malformed` while the good lines keep loading)
node docs/evidence/agents/receipts-proof.mjs       # requires `npm run build` first (v50: the same face, now answering WHO allowed each door — 4 durable §28 receipts ↔ 4 doors ↔ 4 counted git processes ↔ HEAD, one row veto's reason read back verbatim beside the commit it could not undo, a closed table's receipt naming `default`, a bare-closure face that can only say it keeps no list, and a forged half-receipt that makes its whole line junk)
node docs/evidence/agents/spawnlog-proof.mjs       # requires `npm run build` first (v51: 4 REAL git processes ↔ 4 host-written journal lines whose argv is byte-identical to a counting spawn seam, PLUS the refusals no ledger line ever mentioned — a human-yes/policy-no `git push` that spent 0 processes, a §28 veto that costs 0 lines, and a cold reader given nothing but the file)
node docs/evidence/agents/verdict-proof.mjs        # requires `npm run build` first (v52: eleven real git failure states, each run TWICE — through the door and RAW outside the sandbox — so the sentence a §28 reviewer reads is checked against git's bytes, not the door's memory: banner dropped for the verdict line, a refusal never answered with a tally, three exit-0 unmerged NOTICE shapes named instead of "EMPTY", and the 132-line usage page that proves a door relays rather than diagnoses)
node docs/evidence/agents/streams-proof.mjs      # requires `npm run build` first (v53: the SAME command written stderr-first then stdout-first against ONE 4 096-byte ceiling — both orders keep the whole 4 000-byte answer and 8 000 bytes are held in total, which a single shared counter could not produce at all; six shipped git reads measured UNCHANGED at their own ceilings; one real 20 000-byte newline-less refusal quoted verbatim at one ceiling and stated as CUT at another, where even the v51 record holds nothing because the ceiling bounds what ANYONE downstream can see; five runs of one command agreeing on every byte count)
node docs/evidence/agents/reap-proof.mjs         # requires `npm run build` first (v55: real processes on purpose — a parent that leaves a DETACHED child behind is killed at a 700 ms budget and the child keeps writing (7 more heartbeats; the tmp dir cannot be deleted while it lives), the same run reaped goes SILENT, `taskkill` on the ALREADY-KILLED pid returns 128 while the survivor keeps writing — which is why reaping must REPLACE the kill rather than follow it — an ATTACHED child dies with its parent so the default was a limit and not a bug, and the v51 record of a killed run carries `killedByBudget` and `descendantsStopped` side by side)
node docs/evidence/agents/pipes-proof.mjs        # requires `npm run build` first (v56: one real program, 28 B of answer on stdout + 8 000 B of progress on stderr @ a 1 024 B ceiling — the answer comes back BYTE-IDENTICAL to an uncapped control run, and the sentence used to say only "(output truncated)"; now it names the pipe. The mirror at 8 B proves the difference is real, §4 drives a real `git.staged` over 24 multibyte staged lines at 10 budgets DERIVED from git's own offsets (5 of which leave nothing to parse — the hedge appears on exactly those 5), §5 measures that all five shipped read doors answer on stdout alone, and §6 shows the v51 record carrying the naming too)
node docs/evidence/agents/conflict-proof.mjs     # requires `npm run build` first (v57: three REAL conflict shapes, and for each one the proof ASKS FOR THE COMMIT the door says will be refused — exit 128 every time — after a raw `git status --short` control confirmed which code git really prints (that control corrected the proof's own guess: delete/modify is `DU` here, not `UD`); then one add/add repo described the same way by both doors, a clean tree where the SAME commit door lands a real commit (so §2 was about the conflict, not the door), and `MERGE_HEAD` read off disk against `git rev-parse`)
node docs/evidence/agents/runreceipts-proof.mjs    # requires `npm run build` first (v54: the SAME chain, now answering for the run's own gates — 2 run receipts + 4 arc receipts + 1 unowned brief = 7 face gates as a set equation, a vetoed `test.run` durable with the human's sentence beside a grant it cannot erase at 0 processes and 0 commits, one exported note sentence living in `decisionsNote` on one line and `notes` on the next, and a reader that re-derives ownership instead of trusting the writer — a receipt for a call the line never made is junk on BOTH kinds)
node docs/evidence/agents/bridge-report-proof.mjs # requires `npm run build` first (v60: ONE real node program whose 42-byte answer and 42-byte warning are written in BOTH orders — so the shipped sentence and the recomputed old one come from the same bytes and are shown to differ; 2 000 bytes of surviving stdout that used to sit outside a 53-byte report; a real kill at a 500 ms budget; the real design-model vitest suite measured at 592 B stdout / 0 B stderr through the confined host; three refusals that spawn nothing and are filed under `never-ran`)
node docs/evidence/agents/porcelain-path-proof.mjs  # requires `npm run build` first (v61: four measured ways porcelain’s bytes are NOT the file, plus one claim refuted — a staged rename read as a PAIR by both index doors and its two names weighed against each other with raw `git show` (221 bytes under the name HEAD knows, 0 under the one on disk, and an exit-0 EMPTY diff for the door that asked with the wrong one); the SAME commands run again with `core.quotePath` unpinned so a quoted header reaches v43’s own regex — copied out of the previous commit and pinned in this file — which sees 0 headers in bytes git’s `--stat` calls `1 file changed`, while the sentence the door would have spoken is captured byte-for-byte from that SAME door over a genuinely empty index; an ordinary SPACE quoted anyway, and a `m b/` directory created for real so the header’s positional split is shown being stolen and then beaten by git’s per-line name; and §4’s REFUTED candidate — an untracked directory is 3 entries here, not 1, because v46 already pinned `status.showUntrackedFiles=all`)
node docs/evidence/agents/two-tree-proof.mjs        # requires `npm run build` first (v62: porcelain's TWO columns answered by ONE door — 7 real porcelain shapes (MM/AM/D_/ M_/ D/??) read through the shipped git.status, the door's per-file staged/dirty fields cross-checked against git's own `diff --name-only --cached` and `diff --name-only` name-lists, one REAL commit through the commit door recording exactly the 4 staged paths while 5 worktree/untracked remain outside HEAD, and the notice correctly SILENT on a fully-staged tree)
node docs/evidence/agents/window-proof.mjs          # requires `npm run build` first (v63: ONE repository read at THREE budgets — git's own 403 porcelain lines against the 21 the 256-byte door is allowed to answer, and the 3 the 30-byte door survives with; the window may not invent a name, and may not fall silent)
node docs/evidence/agents/hunk-shape-proof.mjs      # requires `npm run build` first (v64: the same bytes measured by git itself — `--numstat -z`, `--name-only -z`, `--shortstat` — under the shipped `git.diff`, `git.staged` and `git.show`; the REPLACED prefix rule transcribed and re-run so the finding outlives the source; one real commit through the commit door, read back and compared with `show --numstat`; and git's own name line WITNESSED ending in a literal TAB, which the door must not hand on as part of the path)
```

A note on `spawns[…]` assertions: they pin the argv SHAPE a plan step is allowed to produce
(`diff` … `--cached` … no pathspec), not the current flag list. Exec-host's own contract tests
`agents/exec-host/test/*` are the authority on the exact argv; a proof that re-pinned it would
turn green only by agreeing with whatever the door was last edited to say. v46 put that rule to
work: hardening the diffing doors (`--no-ext-diff --no-textconv`) reddened four already-committed
proofs that had hard-coded the old strings, and they now interpolate the door's own exported
`GIT_DIFF_FLAGS` — so the literal list is pinned in exactly two places that exist to witness it
(`gitEnvIsolation.test.ts` and `config-proof.mjs` §1), while every other suite and proof pins only
the SHAPE around it. One source, and no way for a loosening to look like a refactor.

## Unit tests (vitest, `agents/runtime/test`)

The parenthesized counts below are the committed state, and they are checkable rather than
decorative: the runtime rows sum to exactly **323** (25 files) and the `exec-host/*` rows to exactly
**233** (8 files) — the same totals `npm test` prints. A row whose number drifts from its file is a
documentation bug, so an increment that adds a case updates its row in the same commit. v63 found this
table itself adrift: the `gitTools.test.ts` row still read (51) where HEAD measured 65, because every case
that file gained after am. 61 (when the package total this table reproduced was 201) was tallied into the
total and never into its own row — renumbered now by re-reading the vitest JSON per file, not by adding the
deltas by hand. v64 re-read that same report for its three touched rows (71→78, 30→33, 22→24) rather than
trusting the arithmetic above.

| File | Covers |
| ---- | ------ |
| `registry.test.ts` (7) | arg validation (missing/unknown/type), unknown tool, checkpoint required for write/exec, deny ⇒ implementation never runs, approve ⇒ runs, impl throw ⇒ `ok:false` (never rejects), double-register refused |
| `checkpointPolicy.test.ts` (13) | v54: `receiptsOrNote` answering for BOTH record kinds from one function (an owned call in ⇒ one receipt out, and the face's OTHER decision — same tool, different stage — stays off the line), `gatedCallIds` naming only calls whose tool carries a DANGEROUS permission in the registry that record acted through (reads never acquire a receipt, and a scoped view cannot borrow the host's wider list), the clone-out and the three silences told apart (owned-empty with no sentence / empty plus the one exported sentence / nothing gated ⇒ no sentence at all); v40: first-match-wins ordering, `matchesTool` glob semantics shared with role scoping (`fs.*`, `*`), unmatched ⇒ EXPLICIT default (never an invented verdict), `decide` purity (byte-identical JSON, policy not mutated), `validateCheckpointPolicy` rejection matrix (missing reason / empty pattern / non-boolean grant / duplicate pattern = dead rule / mute default) thrown at CONSTRUCTION, `policyCheckpoint` receipts in executed order quoting rule reasons verbatim, registry contract unchanged (policy denial == `denied at checkpoint (write)`), runTask end-to-end through policy gates (granted work STANDS under a later veto; read steps produce NO verdicts — §28 gates hands, not eyes) |
| `workspace.test.ts` (4) | sorted/prefix listing, case-insensitive 1-based `search`, append/missing-file throw, registry wiring incl. gated `fs.write` |
| `agent.test.ts` (44) | stopword-aware keyword, plan determinism + seed stamp, golden path event order + `@search.hits.0.path` dataflow + note in file, denial leaves file untouched, failing verify → 1 fix round → pass, persistent failure → `failed_verification` after `maxFixRounds`, `maxSteps` → `budget_exhausted`, planner routes step 0 through `fs.index` when registered, warm memory outranks the index (`memory.recall` first), snapshot hook yields an observed changeSet (absent without hook); v36: `hasCommit` appends the commit step ONLY behind a verify step (and deterministically), a green run reaches it with the planned message, checkpoint DENY ⇒ status denied with earlier work standing and zero commits, green AFTER a fix round still commits with fix steps never re-run (execution order asserted), a red run never commits, a throwing commit tool is honest non-green; v38: `hasConfirm` trails a `git.log` step after the commit and NEVER plans one without a commit (or without verify — nested tail, determinism asserted), green ends commit→confirm in executed order, green-after-fix reaches confirm too, DENIED confirm ⇒ status denied while the landed commit's ok:true result STANDS a slot earlier, a throwing `git.log` is honest non-green; v39: `hasRemember` trails `memory.save` ONLY after the confirmed commit (all three tier-removals omit it, refs/targetPath arg shapes, determinism), a green run ends commit→confirm→remember with the planned `@search.hits.0.path` resolved INSIDE the array arg to the live path, green-after-fix remembers once, DENIED confirm means nothing to remember (0 saves), DENIED remember leaves commit+confirm standing and the store empty, a throwing `memory.save` is honest non-green; v44: `hasContent` trails a `git.show` inspect AFTER the hash confirm and BEFORE remember (nested tail — pull commit, confirm or verify and the content step vanishes with it; the planned `{path:'@search.hits.0.path'}` becomes the LIVE hit, and a `targetPath` task plans that path instead), green ends commit→confirm→inspect in executed order, the remembered summary still asserts NO content (never the word `CONTENT` — §60: memory keeps only what v39 could prove), DENIED inspect ⇒ status denied with the landed+confirmed arc standing a slot earlier, git answering "touches nothing" is DATA the walk completes on, a throwing `git.show` is honest non-green, a red run plans the tail and spends none of it; v45: `hasStaged` reads the index BEFORE the commit and NEVER without one, every exec step is its own §28 gate with the intent asked first, a DENIED index read stops the walk before the write, an EMPTY index is stated DATA that the static plan still walks into (§60 limit pinned), a throwing `git.staged` means a commit nobody could inspect never rides quietly, and a run that never verifies green never reads the index at all |
| `codeIndex.test.ts` (7) | extension → kind, TS symbol + markdown heading extraction, heading-section vs 40-line-window chunking, sorted file entries + coverage, hybrid query ranks the relevant chunk first and is deterministic, symbol query finds its file, empty index → no hits |
| `realfs.test.ts` (4) | extension/skip filtering with sorted slash keys, custom skipDirs + maxFiles cap, maxBytes drop, deterministic output independent of walk order — all against a fake fs (no host disk touched) |
| `memory.test.ts` (10) | save/list/recall scoping, deterministic tie-broken recall bounded by k, forget/clear counts, clone-in/clone-out immutability, registry round-trip with `"path:startLine"` refs, denied `memory.save` leaves memory empty + arg validation; v6 `compact()`: ≥50% ref-overlap merges within scope (listed, idempotent), cross-scope isolation; v19: `recallVectors` equals inline recall exactly, and `memory.recall` states its `engine` with the vector path surviving a fresh store |
| `embedding.test.ts` (4) | tokenizer rules, zero-shared-tokens ⇒ score exactly 0, more shared tokens ⇒ strictly higher, unit-length embeddings |
| `changes.test.ts` (8) | LCS patch round-trip forward/inverse, no-op patch, create/remove all-add/all-del, mismatched input refuses, sorted changed-paths change set, unified-diff headers/hunk ranges/context, whole-snapshot round-trip through patches |
| `ledger.test.ts` (15) | v54: the run line held to the arc line's standard — `decisions`/`decisionsNote` round-trip for both verdicts, the same half-receipt matrix is malformed on either kind, `receiptsOwned` rejects a COMPLETE receipt naming a call the record never made (in both directions, and one genuine receipt plus one borrowed one still condemns the whole line), a run line and an arc line from one chain each answer for their own calls and the two lists are disjoint; v49/v50 fixtures now show records that MADE the calls they answer for; RunOutcome JSONL round-trip + junk rejection with reasons, append-only growth with parent mkdir, order + malformed counting + `last` tail trim + missing-file empty read; v49: an arc record round-trips through one line (walk, callIds and git's answers included), a line that CLAIMS `kind:'git-arc'` is shape-checked before it is believed (unknown status / non-array parts / missing role / non-demo provenance ⇒ `not a complete git-arc record`, never promoted into `runs`), one stream with two kinds keeps append order and `last` trims trailing RECORDS across kinds, the arc joins its run by `runId` while the run line still holds no git step (§60 anti-fold on disk), and a pre-v49 file gains `arcs: []` and nothing else; v50: complete receipts round-trip and an EMPTY list is data about a walk that gated nothing, a half-recorded decision (no reason, no verdict, no `call.callId`) makes the WHOLE line malformed, and a veto's reason reads back off the file |
| `gitArc.test.ts` (29) | v47: the nesting as ONE piece of data (`gitArcDoors` — no commit door ⇒ no arc; intent read precedes the commit it informs; hash after the commit; content after the hash; every subset ordered and never orphaned), an ANTI-DRIFT table running eight presence combinations through `planTask` and `gitArcSteps` demanding `deepEqual` (two copies of an order is an order waiting to drift), deferred `@ref` path tokens passing through UNtouched, `git.commit` asking for the human-staged index with no conditionals; `runGitArc` walks whatever registry it is handed — one §28 gate PER door (never a blanket approval), a denial stops at that door while the grants before it STAND, no checkpoint at all stops at the first door with a stated reason, git answering red is DATA the walk completes on (parity with the plan face), a throwing door stops the walk with git's words preserved, a content door with no live path is SKIPPED with a note while an absent door needs none (capability by absence is the scope's business); v50: a durable walk carries its own §28 receipts (rule, verdict, reason, in ask order), matched by CALL ID so an earlier stage's gate on the SAME tool cannot be pasted on, cloned out of the face so a running process cannot rewrite what it reported, `[]` + `NO_RECEIPTS_NOTE` for a face that keeps no list, `[]` and no note for a walk that gated nothing, and NO field at all when nothing is headed for a ledger |
| `roles.test.ts` (11) | `matchesTool` glob semantics, scope projection exposes/excludes (unknown ≠ denied), child copy can't mutate parent, role register unique + sorted list + ghost role ⇒ empty, researcher-vs-editor write behavior, plan tier follows role capabilities, capability gap fails honestly leaving files untouched; v47: exactly ONE demo role can see a git door (`releaser`) and the arc refuses to run through the `editor` scope; v49: that role's grant is DERIVED from `GIT_ARC_TOOLS`, so the name on a ledger line cannot name a privilege the registry never gave |
| `evaluate.test.ts` (5) | clean run scores 1 with named marks, failures degrade by weight (deterministic), last verify decides, change-economy budget option, append/reload order + corrupt-file reasons |
| `pipeline.test.ts` (8) | v54: the two-role face gets the same durable answer the chain learned in v50 — the stored run line names the rule behind each of ITS two gates (and `results.length > decisions.length`, because reads were never gated), a bare closure stores the one note sentence, and an in-memory pipeline carries NEITHER field; researcher→editor handoff happy path (refs from `fs.index`, editor plans memory-first, score 1), denied checkpoint leaves the handoff real but the run denied, durable mode writes memory+ledger+evaluation JSONL that reload cold, missing research tool ⇒ stated reason (no invented refs), full determinism across identical pipelines |
| `domkit.test.ts` (5) | v16/v20 DOM driver kit: `ui.observe` is read-only and indexed, `click`/`type` are exec-gated (no checkpoint ⇒ nothing happens), approved actions flow through the injected driver and log, out-of-range/wrong-kind targets fail as RESULTS rather than throwing, `findLabel` total + deterministic |
| `vectordb.test.ts` (4) | build sorts + dim-checks, persist→cold reload ranking bit-identical to inline hybridScore + zero-match empty, filterIds + determinism, rejection matrix (bad JSON/version/dim/entries/missing file) |
| `planBackend.test.ts` (7) | valid provider plan adopted end-to-end (backend stamped, @refs resolved), unknown tool/dup id/object args/empty/oversize/non-object rejections, throwing provider falls back with stated reason, default = demo with no fallback field |
| `visualQa.test.ts` (5) | clean layout ok, zero-size/off-page/overlap detection with severities, error-before-warn deterministic ordering, tolerances as explicit inputs, identical reports for identical inputs |
| `chain.test.ts` (30) | v54: the durable run line carries its OWN two gates and no git door, the arithmetic of one chain closes (face decisions = journaled + the designer's unowned brief, counted rather than waved), a veto of the run's own verification is durable with its reason beside a grant it cannot erase while the arc's `[]` is empty because nothing was gated, not durable ⇒ neither field on either kind, and a bare closure says the same sentence on both kinds of line; four-stage researcher→designer→qa→editor order + handoff records, QA honest-empty without host rects, designer denial stops the chain naming its stage, determinism; v22: ui-driver editor stage drives observe→type→click→verify with `editor→host` engine handoff, per-action denial leaves the page unclicked and states the partial engine; v47: `release` is opt-out by default (without it the chain is byte-for-byte the v14/v22 chain), a green chain walks all four doors through the `releaser` scope one gate each, the content door reads the path an EARLIER stage returned (never one this stage chose), a red chain never reaches the arc and the refusal names the editor's status, a veto at the content door stops the walk while the landed commit STANDS, a doorless host yields `no-arc` with no ask, and the arc is its OWN stage — the editor plan and results never claim git steps; v49: the chain writes its run line AND an arc line in that order joined by `runId`, the anti-fold holds on disk, a stopped arc is durable AS stopped, a red chain journals the release it was REFUSED, no `release` ⇒ one run line and no arc line, and append-only across two chains leaves four lines; v50: a policy face's verdicts land on the durable line (four receipts, all git, the face holding more than the arc claims), the veto's rule + reason survive in the file, `durability is what asks for receipts` (the same policy with no ledger path writes the v47 shape), a face that keeps no list states that on the line instead of leaving a gap, and a red chain gated NOTHING so its durable no-arc line carries `[]` and no note |
| `visualQa.test.ts` +contrast (3) | black/white passes, grey pair flags warn, rgb()/rgba() parse, junk colors yield no flag, 21:1 math |
| `visualQa.test.ts` +near-miss (6) | v24: default OFF (no opt-in no flags), 3px pair flags once with real px gaps in detail, boundaries (exact 0 passes, >tol passes, ==tol flags), near-center 2px-off vs exact/edge-touching, zero-size+off-page rects never collect near-miss noise, determinism |
| `visualQa.test.ts` +even-gap (6) | v26: default OFF, exactly-even spacing passes with the rule ON, a 1px-wobble row flags once per axis naming run+gaps+spread, boundaries (spread ==tol flags, >tol passes, 2-rect chain is not a distribution), non-positive gaps keep the chain in overlap territory, a zero-size member breaks the usable chain, determinism |
| `visualQa.test.ts` +near-edge (6) | v27: default OFF, near-flush left edge names side+margin, exact flush passes / >tol passes / ==tol flags, a corner lints ONCE naming both sides, hangover (negative margin) and off-page rects never collect near-edge noise, determinism |
| `repair.test.ts` (5) | clean input no-op, off-page pulled inside then QA-clean, overlap nudged below with gutter, zero-size grown, dedupe + determinism + "apply all repairs → zero error flags" |
| `repair.test.ts` +nudges (6) | v25: near-miss lints unproposed by default, equal-area mover tie broken by id with exact stated reason, smaller-area layer moves, center-nudge to page mid-line (other axis untouched, px stated), a/b/c chain where only the in-tolerance pair snaps, apply-all clears all flags, determinism |
| `repair.test.ts` +edge-snap (5) | v27: near-edge unproposed by default, opt-in snaps x flush with y untouched and px stated, right-edge snap uses page.width − width, a corner snaps the fixed-order side first and reports the other honestly in `remaining`, two independent slips both snap clean + determinism |
| `testRunner.test.ts` (18) | v28: predicate engine semantics (all-pass detail, VERBATIM failure messages, throw→`threw:` without crashing, name-order + first-registration duplicate wins, empty pack = stated vacuous failure, `only` filter + miss), tool contract (exec-gated without checkpoint, `{ok, detail}` + structured report when granted, unknown `only` errors), lazy file re-read after a write, runTask end-to-end (completed run journals 1 ok report; never-passing predicate → 3 honest reports + `failed_verification`; hosts without the tool keep the field absent), JSONL append/reload with malformed counting + last-N + missing-file empty; v31: the tool AWAITS an async runner with an identical report shape, a REJECTING async runner surfaces as a tool error not a crash, runTask journals async-runner reports like any other |
| `execSandbox.test.ts` (18) | v29: allowlisted argv → inert plan (jail-resolved cwd, rule budgets, `matchedRule`, `executes:false` asserted field-for-field), default-deny refusal quoting the argv, `'*'` as argument wildcard matches but arity is fixed and shell-shaped single tokens still deny, path/separators in the executable refused before matching, malformed requests (non-array/empty/non-string tokens), cwd `..`+absolute+drive-letter refused via `guardedJoin` while missing cwd means the root, env scrubbed to allowlist with dropped names sorted, budgets clamped to policy ceilings, empty allow array denies everything, determinism + plan owns its data (no shared refs), invalid policy refused before the request and `registerExecTools` throws at registration, `exec.plan` callable WITHOUT a checkpoint (read perm) with `executes:false` in the output, refusals succeed as tool calls (`planned:false` + reason), registry `string[]` validation on argv |
| `exec-host/execHost.test.ts` (38) | v30 + v48 + v51 (@nexus/exec-host, injected fake spawn — zero real processes in vitest): allowlisted run spawns argv-as-data with the plan cwd/env verbatim, arg tokens never re-tokenized, policy refusal spawns NOTHING even behind an approving checkpoint, no-checkpoint direct call = stated `checkpoint required for exec (§28)`, deny = `planned:true` + `checkpoint denied`, checkpoint asked with an exec ToolCall carrying the plan, output budget hard-caps stdout+stderr total and marks `truncated`, timeout kills marked `killedByBudget` + SIGTERM, ENOENT surfaces as structured `spawnError` not a crash, `exec.run` registry-gated (deny never reaches host; granted → `{ok, detail, result}`; refusal = tool ERROR; nonzero exit = ok:false data with stderr), JSONL journal round-trip with malformed + shape-wrong counting + last-N + missing-file empty. v48 rewrites the budget case and adds four: a cut stream keeps only WHOLE lines (`'ab\ncd\n'` at 6 bytes, where v30 kept the half-line `ef`), a cut that lands mid-FIRST-line yields `''` rather than a fragment, an UNCUT stream still keeps its unterminated final line verbatim (v28/v31's verbatim failure messages depend on it), the drop is per-stream (a stdout that fit is not punished for a stderr that did not), and a multibyte character split across CHUNKS decodes without U+FFFD. v51 adds seven for the host writing its OWN record: four outcomes (deny, §28-required, §28-denied, ran) make four lines with `seq [1,2,3,4]` and `rule [null,0,0,1]` for ONE process, a record is the caller's result plus exactly `seq`+`rule`, no sink means no bytes, v30 lines and v51 lines are compatible in one direction only (stated), three forged lines — a `rule` with `planned:false`, a `seq` that isn't a number, `rule` as a string — are `malformed` for the audit reader while the v30 reader believes all three, a sink that throws fails the CALL on both paths with the run's own exit code in the message, and two hosts on one file repeat `seq` because append order, not the counter, is the record (count corrected to 29 in v53, which rewrote the budget pair and added three: the 6-byte ceiling is now EVERY stream's own — the case that used to prove "starved stderr says nothing" now proves a 4-byte stderr is kept whole with `truncated: false` — write order no longer decides who is heard (9 100 B of stderr against 4 000 B of answer yields byte-identical stdout either way), the host holds at most 2 × the ceiling with each stream trimmed on its own, and a stream cut to NOTHING is a rule of its own rather than silence) — v55 adds seven for the process TREE: the default kill answers `not-attempted` with the reaper never called, a reaper is issued INSTEAD of the kill (`reaped`, ZERO direct kills asserted, because kill-then-reap is measured to reach nobody), a failed or throwing reaper still kills the child it can reach (`reaper-failed`), an adapter with no pid is answered `no-pid` rather than with a pretend success, a run that was never killed carries NO field at all, and `DEFAULT_TREE_REAPER(0)` returns false without throwing — v56 adds two for the PIPE: the host names which stream it cut (in a stable order, absent when nothing was cut rather than an empty list), and `exec.run`'s own sentence says `output truncated: stderr` while the byte-identical stdout beside it is not implicated — an answer that arrived whole is no longer described as doubtful |
| `exec-host/execTestRunner.test.ts` (15) | v31 (fake spawn, zero real processes): exit 0 → passing report whose engine NAMES the argv, exit 1 + stderr → failure message verbatim, timeout kill → `killed at timeout budget (SIGTERM)` never noise, policy refusal → FAILING report with the stated reason and no spawn, missing `preApproved` → the exact `checkpoint required for exec (§28)` message, `only` miss → vacuous total-0 without paying for a spawn, through `registerTestTools` the granted call states the exec-host engine and an unknown `only` is a tool ERROR, runTask e2e verifies with a real COMMAND and journals the report | v60 rewrites the message builder and adds six: BOTH pipes quoted under their own label, in reader order and identically whatever the write order was (the old `stderr || stdout` pick is recomputed as a DIFFERENT sentence, not just disallowed), a stream the budget cut to NOTHING speaks v48's "no WHOLE line survived the output budget" instead of silence, a stream that SURVIVED its cut is quoted AND named as cut, a budget cut changes no VERDICT (exit 0 + truncated stays green), a killed verify carries v55's `(descendants: …)` and says `no exit code reported` rather than `exit null`, and a refusal is filed under `never-ran` with a `never ran:` sentence while `total` stays 1 — the registry must ANSWER that report, never throw "no test predicate named exit-zero" for a predicate that was in scope |
| `exec-host/gitTools.test.ts` (78) | v32 (fake spawn): `parseGitStatus` XY→named statuses + counts + rename keeps NEW path + junk XY = `other`; `parseGitDiff` per-file hunk/add/delete tallies with git's name PAIR excluded WHERE git prints it — before the first `@@`, since v64 turned that exception into a position rule and a `+++` line inside a hunk counts as the line it is — and preamble ignored; `parseDiffStat` footer groups / empty / junk→null; policy allows EXACTLY `git status --short`/`git diff`/`git diff --stat` and default-denies push/commit/path-scoped diff; `gitEnv` picks only named vars; tools both exec-permission, no-checkpoint never reaches host (0 spawns), granted `git.status` returns PARSED entries and the spawn env is policy-scrubbed (`TOKEN` never seen), `stat:true` swaps argv, exit 128 is ok:false DATA not a throw, escaping cwd = stated tool ERROR, truncation labeled in detail; v46: the two diffing argv carry `--no-ext-diff --no-textconv`, `gitEnv` additionally EMITS the isolation (config sources pointed at a nonexistent file + the counted forced-config slots), and v32's own flag-free `git diff` shapes are now asserted DEFAULT-DENIED| v52 adds 17, and they are the door-language tests this package never had: EVERY fixture is git 2.52 for Windows speaking for itself (clean tree, dirty-but-unstaged six-liner, index.lock, conflicted merge, corrupt index, hook output, a silent 137, a 132-line usage page), and the assertions are the four cases of ONE rule — a `fatal:`/`error:`/`warning:` line outranks a banner and a status letter, with no prefix the LAST line is the verdict, one line is simply what git said, zero lines says git printed nothing — plus that the quote STATES how many lines it left out, that git tabs are folded, that `unmergedNotice` catches all three exit-0 shapes, and that a successful read carries no refusal sentence at all (v56 adds the budget sentence builder `budgetFlags` — ONE for six doors, naming the pipe — and `stdoutWasCut`, which answers only about the stream a door parses (37 with v53, which added the rule that a door may say "git printed no output at all" ONLY when the budget did not bite: `gitVerdict('', '', { truncated: true })` is `cut`, and its sentence names the budget instead of accusing git of silence — v57 adds four for the porcelain table: all SEVEN unmerged codes (`UU AA DD AU UA DU UD`) classify as `unmerged`, a genuine staged add still reads as `added`, `!!` is still `other`, and the status door names the conflicted path in its own sentence — v61 adds eight for the SHAPE of a name and rewrites one: a rename keeps BOTH names (`path` is what is on disk, `fromPath` what HEAD knows) while a path that merely contains ` -> ` stays ONE path, because only `R` and `C` are pairs, a rename that is ALSO modified in the tree survives as a pair with both halves still quoted together, `unwrapRendering` undoes git’s quoting of an ordinary name and hands a string git ESCAPED over verbatim and MARKED (every character git escapes carries a backslash), a pair keeps both names whether git quoted one half, both, or neither, `parseDiffHeader`/`parseFileLine` correct the split a ` b/` directory stole, `pathShapeNotices` speaks only about what the entries actually carry, and the STATUS DOOR itself now hands on the pair rather than the single name HEAD has never heard of | v62 spoke for porcelain's TWO COLUMNS as TWO trees (`treeSplitNotice`: how many entries a granted commit can reach, how many it cannot, and the `MM`/`AM` shape that is both) — and v63 adds six more for the READ standing behind that ratio: a cut pipe makes the denominator a WINDOW that must say `this door READ`, v62's wholly-staged silence is only true of a complete read, and a window that read nothing stays silent for v48/v52 to answer | v64 adds five for a body line that WEARS a header's shape and two more for the field separator: `--- `/`+++ ` name a file only before the first `@@` (`isDiffHeaderPairLine(line, insideHunk)` — the blanket `!startsWith('+++')` exception is gone, so a whole-file addition tallies its own `++ b/kept.md` content), and an UNQUOTED name line ends at git's TAB, so `+++ b/m b/n.md⇥` is the path `m b/n.md` and a cut that leaves nothing is `null` rather than a name of nothing |
| `exec-host/gitCommitTool.test.ts` (18) | v35 (fake spawn): `parseCommitOutput` reads `[branch (root-commit)? hash] subject` + stat footer (create-mode lines AFTER the stat), insertions-only, non-echo → null; `gitCommitPolicy` allows EXACTLY `git commit -m <msg>` (incl. a message literally `*` — the v29 `'*'` ARG wildcard, first production wiring) and default-denies bare `git commit`, `-m a b`, `-am`, `--no-verify -m x`, `add`, `push`, `rm -rf /`; blank message throws BEFORE the policy with ZERO spawns; granted commit hands argv verbatim (`['commit','-m',msg]`, multi-line/quoted message intact, env scrubbed) and renders `git.commit → exit 0: master@0a1b2c3 · N file(s) +I −D`; nothing-staged exit 1 is ok:false DATA carrying git's first stderr line; escaping cwd = tool ERROR 0 spawns; a message smuggling `--no-verify -a` stays ONE argv token; v46: this door's argv is untouched — every measured escalation was a command that GENERATES a diff — but its spawn env now comes from `gitEnv()`, and `config-proof.mjs` deliberately does not claim to have tested commit under a hostile config| v52 adds two and rewrites a third: the nothing-staged fixture was ONE invented line, which cannot tell a verdict from a banner — it is now git two-line answer, with the banner asserted ABSENT from the caller sentence; plus the conflicted-merge case (reason on stderr, status letter on stdout) and git printing nothing at all |
| `exec-host/gitLogTool.test.ts` (15) | v37 (fake spawn): `parseGitLog` reads `<hash> <subject>` lines newest-first (leading-space tolerant), merge subjects kept verbatim, blank lines free, a hashless line is COUNTED (`skipped`) never guessed, empty stdout = honest empty log; `gitLogPolicy` allows EXACTLY `git log --oneline -n <count>` (the wildcard's second production wiring) and default-denies bare `git log`, no `-n`, no count, a trailing ref, `--all`, `git show`, `git commit`, `git push`; `git.log` is exec-permission (a read still spawns) — no checkpoint ⇒ 0 spawns, granted ⇒ default window 10 with argv `['log','--oneline','-n','10']` and scrubbed env, explicit count rides the wildcard token verbatim; junk counts (0, −3, 1.5, >100, NaN) throw the bounded-read-back error with the spawn counter frozen; empty-repo exit 128 is ok:false DATA quoting git's stderr line; escaping cwd = tool ERROR 0 spawns; skipped lines surface in detail as "counted not guessed"; v46: argv unchanged, spawn env now `gitEnv()`-isolated (`GIT_OPTIONAL_LOCKS=0` means even a read leaves `.git/index`'s mtime alone — asserted in the proof, not assumed); v48: the harness takes a `maxOutputBytes` so a budget is a POLICY input, and a 4-byte window in which NO whole line survives now answers `no complete line survived the output budget — this is NOT a statement that the repository has no commits` instead of the honest-sounding `(empty log)`| v52 extends the exit-128 case: an empty `commits` array after a REFUSAL now says so (NOT a statement that the repo has no commits), because a count of what git refused to answer is not a finding about history |
| `exec-host/gitShowTool.test.ts` (24) | v42 (fake spawn): `parseShowDiff` yields HEAD's `addedLines` for ONE path (a new file = its whole content), `+++`/`---` are never content WHERE GIT PRINTS THEM — before the first `@@`, since v64 turned that exception into a position rule and a `+++` line inside a hunk is a line HEAD RECORDED, so `path`/`additions`/`deletions` all stay truthful while the added text is kept verbatim — and mode/rename/similarity lines are never content, `\ No newline` skipped, `Binary files … differ` → `binary:true` with no lines claimed, empty stdout = honest empty change; `validateShowPath` accept/refuse matrix (blank, whitespace, newline, leading `-`, absolute incl. `C:\`, any `..` segment); `gitShowPolicy` allows EXACTLY `git show --no-ext-diff --no-textconv --format= -- <path>` (revision pinned BY OMISSION, `--` forces pathspec semantics; v46 unpinned the two no-flags are what keep a `.gitattributes`-named diff driver from EXECUTING its `textconv` command — env pinning cannot reach repo DATA) and default-denies bare `git show`, v42's own flag-free shape, a named rev, `HEAD~9:file` blob syntax, 0/2/3 path tokens, `--textconv` smuggled back on, `git log`/`commit`/`add`; no checkpoint ⇒ 0 spawns, denied ⇒ 0 spawns, granted ⇒ argv `['show','--no-ext-diff','--no-textconv','--format=','--',path]` with the isolated env and the exact detail string; exit 128 is ok:false DATA quoting git's stderr; escaping cwd refused before any spawn; v48: same `maxOutputBytes` harness input, and a starved read of a path HEAD DOES change answers the CUT (`this is NOT a statement that HEAD touched notes/widget.md`) while the `HEAD touches nothing at <path>` sentence stays reserved for an un-cut empty diff| v52 extends the exit-128 case the same way, naming the path: a refusal may not be read as HEAD touching nothing — v61 adds two: a path that arrives as git’s C-QUOTED RENDERING is refused by `validateShowPath` while an ordinary name with a quote inside it stays acceptable, and the same refusal is checked at the DOOR with a counting host, where it costs ZERO spawns (the door that confirms content asks git rather than guessing at it) — v64 adds the pair this door never had: an added line whose OWN text is `++ b/phantom.md` is counted once and surfaced verbatim, and a removed line whose text is `-- a/ghost.ts` is one deletion, both through the same `@@`-anchored position rule the other two readers now share
| `exec-host/gitStagedTool.test.ts` (33) | v43 (fake spawn): `parseStagedDiff` reads the INDEX — change KIND from git's own metadata (`new file mode`→added, `deleted file mode`→deleted, `rename from`→renamed with the NEW path, `copy from`→copied, else modified), per-file hunks/additions/deletions/`addedLines`/binary, multi-file tallies, the name pair read by POSITION (v64: `--- `/`+++ ` names a file only before the first `@@`, so a staged line that merely wears that shape stays inside its own file), preamble ignored, `\ No newline` not a line, empty stdout = honest zero changes; `tallyStagedCounts` in canonical order regardless of key order; `gitStagedPolicy` allows EXACTLY `git diff --no-ext-diff --no-textconv --cached` and the same `+ --stat` (v46: a staged diff is still a DIFF, so `[diff] external` in the repo's own config could make this read EXECUTE and answer "0 files" about a real index) and default-denies v43's own flag-free shapes, the unstaged `git diff`, path-scoped and `--name-only` forms, `--ext-diff`/`--textconv` (git EXECUTES a helper), `--output=<file>` (a read that WRITES), `--stat --ext-diff`, `-c diff.external=evil …`, `add`/`commit`/`log`/`show`; `git.staged` is exec-permission — no checkpoint ⇒ 0 spawns, denied ⇒ 0 spawns, granted ⇒ argv `['diff',...GIT_DIFF_FLAGS,'--cached']` (or `+ '--stat'`) with the isolated env, counts/totals/paths and a byte-exact detail; an EMPTY index is spelled out as "nothing is staged, so a granted git.commit right now would have nothing to record"; binary counted with no lines claimed; exit 129 ok:false DATA; escaping cwd and a non-boolean `stat` refused with zero spawns; v48: `maxOutputBytes` harness input again, and a read whose budget killed every line now says `this is NOT a statement that the index has nothing staged for the §28 ask` — because THAT particular absence is the sentence a human weighs before approving a commit, while the `the index is EMPTY — nothing is staged` wording stays reserved for an un-cut empty index| v52 adds three, and one of them is the sharpest finding of the increment: in a CONFLICTED index git exits 0 and prints `* Unmerged path file.md` with no diff, which parses to zero, and this door — v45 puts it one step before the §28 commit ask — used to answer "the index is EMPTY". It now names the notice, the same notice in --stat shape, and a corrupt-index refusal quoting git fatal line — v56 adds the pair that settles v48's hedge: a cut on STDERR leaves "the index is EMPTY" standing and names (stderr), a cut on STDOUT still hedges and names (stdout) — v61 adds four: `rename from` is KEPT (as `fromPath`) and not only believed, an entry that is not a pair carries no `fromPath` key at all rather than an empty one, a path that reaches the door as a C-QUOTED RENDERING is marked as one, and a rename too pure to carry a hunk — which therefore has no `+++` line — is named by its own `rename to`/`copy to` lines, which is also where the stolen ` b/` header split loses — v64 adds three on the OTHER side of that rule: a `+++ b/second.md` that sits INSIDE a hunk stays in `notes.md` and lands in the `addedLines` a human is asked to approve, a `-- a/ghost.ts` is one deletion rather than a pre-image line, and a second `diff --git` section resets the position so its own pair names it and contributes nothing to the tally
| `exec-host/gitEnvIsolation.test.ts` (12) | v46 (pure data, zero processes): `forcedConfigEnv()` numbers its slots in SORTED key order and `GIT_CONFIG_COUNT` equals the table size (`{}` → `COUNT: '0'`, not an absent key); the five forced keys are exactly the ones measurement found reachable from config (`core.fsmonitor`, `core.excludesFile`, `core.attributesFile`, and since v61 `core.quotePath` — which confines not what git MAY DO but what it may SAY about a filename — plus `status.showUntrackedFiles`) — and `diff.external` is asserted ABSENT, because no inert value exists for it (empty → exit 128, `true`/`false`/`none`/`default` each change the bytes) so the argv shape owns that hole; `GIT_DIFF_FLAGS` carries both no-flags literally; `GIT_ENV_NAMES` is complete through `planExec` (a door planned with `gitEnv()`'s own output loses NOTHING to the scrubber, and an injected `GITHUB_TOKEN` still lands in `droppedEnv`); `existsSync(GIT_ABSENT_CONFIG)` is false — naming a file git cannot open is how the read is told to read nothing; `gitEnv` idempotent and order-stable — v61 rewrites the forced-keys case (a key earns its slot by being MEASURED reachable: a command git would EXECUTE, a blind that hides files, or the shape of a PATH) and adds the orphan-slot check, which v61 had to move one place because `_4` became a legitimate slot: the assertion is now that NO slot exists at or past the COUNT, which is the number git stops reading at |
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
runtime 232/232 and studio 105/105 unchanged — a door, not yet a plan step. **(v45 opened it from
the plan side: the `staged` read now runs INSIDE the commit block, one step before the §28 ask.)**

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
`CONTENT`) — v45 RETIRED that wording for the reason given in its own note below, while
keeping the no-content guard exactly as it was, and git's two BLANK answers are DATA — an unmatched path exits 0 with an empty diff
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

## v45 note — intent before the ask: the plan reads the INDEX one step before §28 is asked to record it

v43's door sat unused by the plan, so the loop still walked into its commit door blind: `git.diff`
cannot see a staged change, and `git.commit` records exactly what the index holds. `planTask` now
takes `hasStaged` (orchestrator: `registry.has('git.staged')`) and pushes
`{stepId:'staged', tool:'git.staged', args:{stat:false}}` INSIDE the `hasCommit` block and
IMMEDIATELY BEFORE the commit push — a green run's tail is
`verify → staged → commit → confirm → inspect (→ remember)`, five §28 gates where four used to
fire, and the first git process of the tail is a diff of the INDEX (`--cached`, with no pathspec —
the whole index rather than one path the agent chose). Position does two
jobs at once: refusing the READ stops the walk BEFORE the write (2b: zero spawns, no commit, the
human's staged change still sitting unrecorded where they left it, nothing remembered), and the
sentence explaining a refused commit comes from the run itself, because git's own first line for an
empty index is `On branch master` — a header, not a reason. **And a §60 debt got paid:** with
everything granted and nothing staged, the STATIC plan still asks the commit (the demo planner has
no conditionals — stated, not smuggled), git exits 1 as `ok:false` DATA with no `record`, and
`rev-list --count` does not move, yet v39's remembered summary asserted "git.commit landed".
Position guarantees an ARC was walked; only git may claim a commit. The planned sentence is now
`ARC-COMPLETE … whether anything LANDED is git's own answer, in this run's results`, the no-`CONTENT`
guard stands untouched, and `remember-proof.mjs` was re-greened on it. `intent-proof.mjs` (34th)
runs `runTask` over FOUR keyed doors in a throwaway os.tmpdir repo: the money assertion is a
three-way agreement — the `addedLines` read out of the index BEFORE the commit are byte-equal the
lines `git.show` returns AFTER it, byte-equal what the human staged — with red spending none of the
tail and the cold ledger replaying both ends in the executed order. runtime 239/239 → **246/246**
(1 planner + 6 orchestrator cases, one pinning the EMPTY-index limit in the unit face too);
exec-host and studio UNCHANGED — no tool, policy or UI file moved, only the PLAN. Honest bounds:
the read is unconditional, so an empty index still walks into a refused commit; the agent reads the
index and never writes it; and the remembered sentence is now deliberately weaker than v39's,
because it is the first version that is always true.

## v46 note — the environment is part of the policy: a read-only door could EXECUTE, and answer "0 files" about a dirty tree

v29–v43 confined the argv thoroughly, and every one of those confinements held — right up against
the fact that git decides what to DO by reading config this process never chose to read. Measured
against real git 2.52 on this machine, always with **exit code 0** (the failures were silent):
`[diff] external = <program>` makes `git diff` and `git diff --cached` run that program INSTEAD of
diffing and hand back an EMPTY answer, so v32's "read-only awareness" reported *0 files* about a
real change while executing code; `[core] fsmonitor = <command>` makes `git status` run a command
mid-scan; `[core] excludesFile` aimed at a file of `*`, and `[status] showUntrackedFiles = no`,
each make untracked files vanish from a status that still looked complete. Two layers close it,
because two SOURCES are involved: `gitEnv()` pins the machine's config inert (`GIT_CONFIG_GLOBAL`/
`GIT_CONFIG_SYSTEM` → a path that does not exist, `GIT_CONFIG_NOSYSTEM`, `GIT_ATTR_NOSYSTEM`,
`GIT_PAGER=cat`, `GIT_TERMINAL_PROMPT=0`, `GIT_OPTIONAL_LOCKS=0`, plus git's own counted override
`GIT_CONFIG_COUNT`/`KEY_n`/`VALUE_n` forcing `core.fsmonitor`, `core.excludesFile`,
`core.attributesFile`, `status.showUntrackedFiles`, and since v61 `core.quotePath`) — and the counted override is measured to beat
even the repo's own `.git/config`. What env CANNOT reach is repo **data**: a committed
`.gitattributes` naming a diff driver whose `textconv` is a command. §3a of `config-proof.mjs` says
so in its own output — shipped hardened env + v42's own `git show` shape → the command ran and the
diff came back empty — so the second layer is the argv shape (`GIT_DIFF_FLAGS =
['--no-ext-diff','--no-textconv']` on the three diffing doors), which is also where it belongs. Two
assumptions died in measurement: `git show --format=` IGNORES `[diff] external` but HONOURES a
`.gitattributes` driver, so `--no-textconv` is not decorative for the content door; and textconv
fires only on files git treats as BINARY, which is why a pinned binary change now states
`binary:true` with `addedLines: []` instead of inventing text (§60). `diff.external` is deliberately
ABSENT from the forced table — no inert value exists for it (empty → exit 128; `true`/`false`/
`none`/`default` each change the diff's bytes) — and `gitEnvIsolation.test.ts` asserts its absence
so the hole cannot be "fixed" back into the env and out of the shape. `gitEnv()` is applied at
REGISTRATION, so a caller cannot opt out; the tools' gates, argv, parse-and-report contracts, the
five doors / five policies / five keyed hosts, human-only staging and no-push are all unchanged,
and on a CLEAN repo the hardened argv are the old ones plus two no-flags. exec-host 110/110 →
**123/123** (new `gitEnvIsolation.test.ts` 11; `gitTools.test.ts` 17 → 19; every door suite now
asserts its PRE-hardening shape as DEFAULT-DENIED, so a loosening cannot pass as a refactor);
runtime and studio untouched. `config-proof.mjs` (35th) keeps both faces in one throwaway repo: 2a
is a LEGACY control — v43's exact argv with v43's exact 4-name allowlist against a hostile
`.git/config`, i.e. the bug reproduced rather than described (exit 0, empty stdout, tripwire files
from two doors, an untracked file gone) — and 2b runs the shipped doors in the SAME repo to the
opposite answer (5 pinned processes, 0 programs, diffs byte-equal to the clean builtin diff captured
from the same repo after the config is cleared); §4 repeats the trick for a hostile `$HOME/.gitconfig`
and each face asserts ITS OWN tripwire outcome, so a control can never quietly become the test; §5
closes with `.git/index`'s mtime unchanged by three more reads and the human's staged bytes intact.
Honest bounds: this confines git's CONFIG-READING, not git — still a real process with real
filesystem access inside a policy-rooted cwd, not a syscall sandbox; the closed vectors are the four
measured here, and a future git that reads a new source could open one no test in this repo would
notice; proofs run against whatever `git` is on `PATH`; and the commit door is NOT among the tested
commands, because every escalation measured generates a diff; a clean diff from a trustworthy read
is still only as honest as the repository it was pointed at.

## Role-arc proof (`role-arc-proof.mjs`, M2 v47 — the arc finally gains a role)

Ten amendments of git doors that no scoped role could see. §24's question — *who is allowed to do
what* — had no answer for `git.*`: `DEMO_ROLES` was researcher/designer/qa/editor/archivist, none
of them naming a git tool, so `roles.scopedRegistry(anything, host).has('git.commit')` was `false`
for every role in the project and a chained run could research, brief, check and annotate forever
without ever reading an index or recording anything. Widening `editor` would have handed commit
power to every chained run by mere presence — the opposite of §28 — so v47 did two things instead.

**The order became data first.** `gitArc.ts` now owns the nesting (`gitArcDoors`: no commit door ⇒
no arc, intent read before the commit it informs, hash after the commit, content after the hash),
the step objects (`gitArcSteps`) and a walker (`runGitArc`) that takes ANY registry. `planTask`'s
git block is a call into it, and an anti-drift case runs eight presence combinations through both
faces demanding `deepEqual` — an order kept in two places is an order waiting to drift.
**Ownership became a name.** The new `releaser` role's grant IS `GIT_ARC_TOOLS`: four doors, no
`git.add` (staging stays human), no push (out of scope), no `memory.save` (the arc cannot journal
its own success — the host does). The fifth chain stage is `release?: boolean`, explicitly opt-in.

§1 of the proof pins all of that as data (one git-role in the pack, its grant exactly the four
doors, the nesting table, the two-face identity). §3 then runs `runRoleChain` against FOUR REAL
keyed doors in a throwaway `os.tmpdir()` repo whose `docs/widget.md` deliberately shares a path
with the chain's in-memory corpus — so the path the arc reads back is the one the chain's own
research handed it. 3a repeats v45's three-way agreement from the other direction: a scoped ROLE
reads the human's staged lines out of the index before the commit and reads the SAME bytes back out
of HEAD after it, with four git gates, four processes, `rev-list --count` +1, and the handoff tail
`editor→releaser` then `releaser→host` via `git:staged→commit→confirm→inspect`. 3b vetoes the
content door: the walk stops, the already-granted commit STANDS as history (§28 answers doors, one
at a time — a later veto does not undo an earlier grant), the refused door was still ASKED, one
process spared. 3c runs the same host WITHOUT `release`: three handoffs, no field, zero processes.
3d stages something for a RED chain and shows it spends no ask, no process and no commit, the
human's staged file still showing in `git diff --cached --name-only`. 3e: a doorless host gets
`no-arc`, reasoning that "the arc belongs to no role by absence (§24)". §9 holds: home HEAD
byte-identical, throwaway deleted.

§60 kept its own two boundaries here. The arc's results are NOT folded into `editorOutcome` — that
stage never had git in its scope, and back-filling its plan would be a false record of what it
planned; the proof asserts the absence from both sides. And a UI chain hands the arc no path (its
`search` step is `ui.observe`, which returns a page, not refs), so the content door is dropped
**with a note** rather than a guessed path. runtime 246/246 → **279/279** (`gitArc.test.ts` 22 new;
`roles.test.ts` 7 → 10; `chain.test.ts` 6 → 14); exec-host and studio untouched, because the doors
were already built and only their ownership and a second walking face are new. `rolechain-proof.mjs`
grew a non-interference block and its role-id pin moved with the pack — a proof that refuses to
notice a new role would be asserting a fiction. Honest bounds: nothing in the Studio dock sets
`release` yet, so the dock still cannot commit (the capability exists, the button does not); the
role face has no `remember` door, so a chained release is journalled by the host's own record; and
the arc's results ride on `ChainResult.release` rather than the ledger, so a cold JSONL reader sees
the editor's run and not the stage after it.

## v48 note — budgets that bite: a cut answer may only speak in WHOLE lines

v29 wrote two numbers into every plan (`timeoutMs`, `maxOutputBytes`), v30 made the host honour
them, and the unit tests checked the NUMBERS — that stdout got shorter, that `truncated` flipped,
that a timer fired. What nobody checked for eighteen amendments was what the agent HEARD when a
budget bit. Probing real git for v48 answered that, and the answer was bad enough to change the
host: at a byte budget landing inside a line, `git.staged` handed back
`addedLines: ["staged line 01 \ufffd"]` — a line the human never staged and git never printed —
and counted it in `+N`. A truncated read was not a smaller read; it was a **fabricated** one. The
same class of bug lived one layer down: decoding each arriving chunk with its own `toString`
turned a multibyte character straddling a chunk boundary into U+FFFD even with zero budget
pressure.

The fix is in the one place that owns budgets — `ExecHost.run` — so no parser had to change and
no door can forget it: accumulate **raw bytes**, decode **once**, and trim a stream that actually
lost bytes back to its last newline. A stream that lost nothing stays byte-verbatim, which is what
v28/v31's verbatim failure messages and v32's parsed porcelain depend on. `truncated` keeps
meaning exactly what it did — the budget bit — and every door already labels it
(`· output truncated at budget`), so a short answer can never be mistaken for an empty one.

`budgets-proof.mjs` (38th — the concurrent runtime lane took 37th for `durable-arc-proof.mjs` while
this lane was measuring) makes the claim a measurement rather than a reading of the diff:
a human stages 24 multibyte lines in a throwaway `os.tmpdir()` repo, the door reads the whole
index once to establish ground truth (re-joining the claimed lines reproduces `git show
:intent.md` exactly), and then **16 budgets DERIVED from git's own byte offsets** are applied — 8
landing mid-line, 8 landing inside a single UTF-8 character — with `splitsChar()` proving each cut
really is inside a line before the case counts as a case. At every one of the 16 the shipped door
answers in whole lines that are a PREFIX of what the human staged, claims nothing outside that
set, and carries no U+FFFD; at every one of the 16 the legacy prefix, recomputed in the proof from
the same bytes so the before/after claim is arithmetic and not memory, ends mid-line and invents a
line. §2b then puts the new rule under a budget so tight NOTHING survives — 4 bytes, `diff`, no
newline — and there the fix's own hazard was waiting: trimmed to whole lines, the answer parses to
zero files, and three doors read that as a fact about the repository ("the index is EMPTY", "HEAD
touches nothing at …", "(empty log)") — which is the opposite of what a starved budget means, and
one of the three is a sentence a human weighs before approving a commit. All three now say
`no complete line survived the output budget — this is NOT a statement that …` through one shared
`cutNotAbsence()`, and the proof measures BOTH halves with real git through the same door in the
same repo: the 4-byte read names the cut, and the genuinely clean index — reached by unstaging, no
budget pressure — is still stated EMPTY in the old words with no budget wording attached. §3 raises
the cap on purpose and stages 2000 multibyte lines: the diff arrives in a dozen-plus chunks
(counted on the wire, not assumed) and re-joins byte-exact, and the proof PRINTS whether decoding
chunk-by-chunk would have agreed — every run so far it differs, i.e. the second bug was real here
too. §4
turns to the other budget: the REAL design-model vitest suite is killed at a 400 ms budget and
returns a FAILING `TestReport` reading `killed at timeout budget (SIGTERM) · exit null` — the
process never reported an exit code and the report says `null` instead of inventing one — while the
same argv under a 180 s budget passes in ~2 s; two spawns, both carrying the allowlisted argv.

What did NOT move: every policy, budget number, argv shape, gate and journal entry in the stack
(the shipped door defaults are still 65 536 bytes / 10 000 ms — v48 changed what a cut MEANS, not
where it falls), the runtime (still spawn-free by audit), and studio. exec-host 123/123 →
**130/130** (`execHost.test.ts` 15 → 19: the v30 budget case is rewritten, and four cases pin the
mid-first-line drop, the uncut-stream keeps-its-last-line rule, the per-stream cut, and the
chunk-split character; `gitLogTool` 14 → 15, `gitShowTool` 19 → 20 and `gitStagedTool` 20 → 21, one
cut-is-not-an-absence case each, whose harnesses gained a `maxOutputBytes` parameter so the tight
budget is a POLICY input and not an edited literal). `exec-host-proof.mjs`'s v30 line asserted
`['abcd','ef',true]` — the contract test that had ENCODED the lie — and now asserts
`['ab\ncd\n','',true]`.

Honest bounds, all §60: line-exactness is the right rule for THESE consumers because every door
here parses lines — a program whose output unit is not `\n` (a progress bar, a streamed JSON body)
loses its partial tail under a cut rather than inventing it, which is safe but not byte-exact, and
the raw-tail alternative is a policy choice a future host can make per-command. An UNCUT stream
keeps its unterminated final line (that is verbatim, not a line claim), and no real git command
exercises that case here — git ends its output with `\n` — so it is pinned only by the unit test.
The timeout kills the process the host spawned and nothing else: there are no process-group
semantics, so a tool that spawns children of its own (vitest does) may leave them running; what
this proof measured is the parent's exit and the report, not a reaped process tree. And a killed
run's exit code is `null` on this platform — the report relays that, it does not resolve it into a
number.

## Durable-arc proof (`durable-arc-proof.mjs`, M2 v49 — the arc survives its process)

v47 gave the git arc a role; the walk still lived only in the returned object, so a cold reader of
the JSONL audit trail saw, for a chain that had really committed, an editor run containing NO git
step and nothing else. The fix was a second record KIND in the same append-only stream — not a new
file, and not a fold: a run line is written exactly as v7 wrote it (no `kind` field, so every
pre-v49 ledger still parses, asserted rather than assumed) and a `git-arc` line
`{kind, provenance, runId, goal, role, arc}` rides immediately after the run it followed.

§1 pins the contract on hand-written lines: a pre-v49 run parses, an arc round-trips with its walk,
five tampered arcs (unknown status, missing `notes`, `results: 'seven doors'`, no `role`,
`mode:'real'`) are each rejected as `not a complete git-arc record`, and a run-shaped line is never
upgraded into an arc either. It also asserts the ownership chain is one constant: the role named on
the line is the role the REGISTRY granted, and that grant IS `GIT_ARC_TOOLS` — a privilege cannot
drift from the walk it licenses.

§2 runs `runRoleChain` itself over the four REAL keyed doors with `fsLike` = the real `node:fs` and
the ledger file inside a throwaway `os.tmpdir()` repo, then reads the file back cold. 2a is the
money case: the durable walk is `deepEqual` to the returned one, the recorded commit hash is
compared to `git rev-parse HEAD` measured OUTSIDE the loop (abbreviated vs full, so `startsWith`
plus the length difference, per the v38 lesson), the intent and content reads come back byte-equal
to what the human staged, and neither durable record claims the other's work. 2b vetoes the confirm
door and the stopped arc is durable AS stopped — reason, per-door `ok` array, and all four doors
still named (so a short walk reads as a veto, not a missing grant) — while the commit it had already
been granted remains HEAD. 2c journals a RED chain's refusal (`no-arc`, empty `doors`, the reason
naming the editor's status) and proves it costs zero processes and zero commits, because an absent
line would leave a reader guessing between "nobody asked" and "the ask was denied". 2d appends a
hand-forged arc line: `malformed` 1, it surfaces in no array, the three good arcs still load. 2e
reads a v7-shaped file: `arcs` is `[]` and nothing else moved. Home HEAD byte-identical; the repo
and the audit trail inside it are deleted in `finally` (§9).

## Receipts proof (`receipts-proof.mjs`, M2 v50 — the durable arc names its decider)

Amendment 49's own closing sentence named its bound: the ledger recorded what the runtime ASKED and
what git ANSWERED, but not what the human DECIDED. v40 had already made every §28 verdict a receipt
naming its rule and quoting its reason, and v41 had put those receipts in the dock's memory — so
v50 lets a walk that is headed for the ledger carry its own. One JSONL line now answers both
questions: git's answers, and who allowed each door.

§1 does it with no process in sight. A table-granted walk yields one receipt per door in ask order,
each quoting its rule (`git.*`) and its reason verbatim; the list is a COPY, proven by asking the
face for another door and flipping `decisions[0].granted` AFTER the arc returned; the call-scope trap
is set and measured (a face with FIVE decisions, one of them an earlier stage's `git.commit`, yields
FOUR arc receipts all carrying the release prefix — no borrowed alibis); a bare-closure face gets
`[]` plus `NO_RECEIPTS_NOTE` while a doorless walk gets `[]` and no note; a walk that is not headed
for a ledger gets NO field at all. Then the ledger's side: a complete receipt round-trips, four
half-recorded ones each make the whole line malformed, and a v49 line without the field still parses.

§2 puts that against REAL git in a throwaway `os.tmpdir()` repo with four keyed exec hosts and a
counting `spawnLike`, and it refuses to let the runtime grade its own homework — four sources have
to agree: the receipts, the doors, the number of git PROCESSES, and `rev-parse HEAD` measured outside
the loop (plus the content door's path cross-checked against the search hit recorded in the SAME
file's run line, so the two durable records must corroborate). 2b vetoes the content door with a
TABLE ROW and reads back `matched:'git.show'` with the human's sentence sitting beside the commit
that veto could not undo — three grants ahead of it, zero processes spent on the refusal, and the
ONE line the human appended still legible in the intent read. 2c closes the table: the walk stops at
the first door with ONE receipt naming `default`, no spawn, no commit, and the human's staging still
unread. 2d hands the same four-door walk a bare closure and gets the note instead of a name, then
runs the same policy WITHOUT a ledger file and gets neither field nor note — durability is what asks.
2e forges a receipt with no reason: counted as junk, surfacing nowhere, while every receipt a cold
reader does get holds a non-empty reason. Home HEAD byte-identical; repo and ledger deleted (§9);
`git push` never happens and staging stays a human act.

## Spawnlog proof (`spawnlog-proof.mjs`, M2 v51 — the host remembers what it did, including the times it said no)

40th script in this directory (39 before it; the runtime lane's `receipts-proof.mjs` took 39th). The
measurement that chose this increment was a grep, and it is worth stating plainly because it is the
kind of gap a test suite cannot see: v30 shipped `appendExecRun` and `loadExecRuns` and wired
**neither** — zero callers, only the definition and a barrel export — while `host.run` had seven
call sites, all inside this package.
So the sandbox could tell a caller what a command answered, and could not tell anyone which
processes it had actually started or which requests it had refused. Every "what ran?" question since
v32 has been answered by parsing the doors' prose.

§1 refuses to hard-code a single git flag. Six rules are lifted out of the FOUR shipped policy
factories (`gitStagedPolicy`'s two, `gitCommitPolicy`, `gitLogPolicy`, `gitShowPolicy`,
`gitReadOnlyPolicy`), so this proof goes stale on the same day the flags move, which is the only
honest schedule. §2 then walks a throwaway `os.tmpdir()` repo through four REAL git processes and
makes three witnesses agree line for line: the journal's `argv`, a counting `spawnLike` wrapper's own
sink, and the doors' returned records — with `rules [0,2,3,4]` (2 of 6 rules measured as never used,
which is a fact about the walk and not about the policy) and with the five keys that exist ONLY in the
host record (`argv`, `cwd`, `signal`, `spawnError`, `killedByBudget`) plus `rule`: a door's
caller-visible output carries none of them, which is exactly why the host is the only complete
witness. §3 separates the two doors deliberately — it asks for `git push` behind an APPROVING
checkpoint, so the line that lands carries `rule: null, planned: false` and 0 processes: human yes,
policy no, and that combination is invisible in every other file this stack writes.

§4 is the reader that matters: a cold process given nothing but the file. `seq` contiguous 1-6,
`malformed 0`, every granted record fitting the argv SHAPE of the rule its own `rule` field names
(the pattern read back from the shipped factories, not re-typed), and `git rev-parse HEAD` measured
OUTSIDE the sandbox appearing inside the host's own bytes — joined to the short hash the door
reported, so the two records of one fact must corroborate. §6 states the cost: 2357 bytes of journal
for 642 bytes of captured output, because the record is verbatim.

Two assertions here exist because reality refused to agree with the draft. §5: a §28 veto at the
REGISTRY adds 0 lines and 0 processes — the human's act is journalled in v50's ledger receipts, not
in the host's file, and the two are deliberately not merged (two records, two subjects). §3's second
half: a no-changes `git commit` makes git print a banner and then the reason, so the door's
caller-visible sentence is `git.commit → exit 1: On branch master` while the journal keeps BOTH
lines — a door quotes git, it does not summarize it, and quoting the verdict line instead of the
banner is the next increment's business, not this one's. The same accident is why the journal now
lives in a SIBLING tmp directory with an assertion that it is not inside the repo git is watching: a
journal inside the watched tree is an untracked file that git then reports about itself (§9).
Home HEAD byte-identical; repo and journal deleted in `finally`; `git push` never happens and
staging stays a human act.

## Run-receipts proof (`runreceipts-proof.mjs`, M2 v54 — the run line answers for its own gates)

41st script in this directory (40 before it; the exec-host lane's `spawnlog-proof.mjs` took 40th).
v50's honest-bounds list ended with its own replacement: "the editor's `fs.append` and `test.run`
gates are still nowhere in the file, since the anti-fold cuts both ways." So a cold reader of
`nexus-chain-ledger.jsonl` could ask WHO allowed the commit and read a receipt, and ask who allowed
the WRITE that commit recorded and read nothing. Nothing about what the runtime decided changed; what
changed is that the other half of the file became answerable.

§1 keeps the rule in one place, which is the whole design claim: v50's private matcher was LIFTED out
of `gitArc.ts` into `checkpointPolicy.ts` (`receiptsOrNote` + `gatedCallIds`, +9/−22 there, +43/−2
here) rather than copied, because two matchers let `decisions: []` mean one thing on an arc line and
another on a run line in the same file. Five calls of three permission classes gate THREE ids — a
read-permission call cannot acquire a receipt, because §28 was never consulted for it — and a face
holding two decisions yields ONE receipt, proving the paste runs in both directions now (v50 proved
the arc cannot borrow a stage's yes; this proves a run cannot borrow the arc's, and vice versa). Then
the ledger's side of it: `receiptsOwned` makes a receipt naming a call the record never made condemn
the WHOLE line on EITHER kind. The runtime already derived receipts that way by construction — but
construction is invisible to a reader, and v50's bound "a COMPLETE forged line is still believed" is
only narrower once the file checks it.

§2 runs the REAL chain over four keyed sandbox doors in a throwaway `os.tmpdir()` repo with a real
`node:fs` ledger, and refuses to let the runtime grade its own homework: SIX sources must agree — the
durable run line, the durable arc line, the decider's own list in ask order, the workspace the granted
write actually changed, the git processes counted on the `spawnLike` seam, and the commits counted by
`git rev-list` — with a seventh, the §26 memory file, read cold off real disk. The headline is
arithmetic: **7 face gates = 2 run receipts + 4 arc receipts + 1 unowned brief**, pinned as a set
equation and an order (`brief, annotate, verify, staged, commit, confirm, inspect`), because that
single uncounted gate is the honest exception this amendment makes VISIBLE rather than the one it
hides. A vetoed `test.run` (2b) is durable with the human's sentence beside a grant it cannot erase,
at zero processes and zero commits, while the arc's `[]` sits on the next line as the third kind of
emptiness — nothing gated, not nothing said, and no note owed. A chain with no ledger file (2c) gains
neither field and no line in the file; a bare closure (2d) puts one exported sentence in
`decisionsNote` on the run line and in `notes` on the arc line while spending the same four processes
and landing the same hash. Home HEAD byte-identical; repo, ledger and memory file deleted (§9);
`git push` never happens and staging stays a human act.

Two costs are paid in this same commit rather than deferred. `receipts-proof.mjs`'s §1 fixture had an
empty `results` beside one receipt — compact before, a paste now — so it learned to make the call it
answers for; and its §2e tamper block grew a second forged line (`malformed 1 → 2`), one half-receipt
and one complete-but-borrowed. A proof that encoded the looser contract had to be rewritten when the
contract tightened: that is the price a gate change should pay in writing, not in surprises.

## Verdict proof (`verdict-proof.mjs`, M2 v52 — a door quotes what git MEANT, and says how much of it it left out)

42nd script in this directory (the runtime lane took 41st for `runreceipts-proof.mjs` while this one
was still measuring). The eleven failure states here were probed BEFORE the fix was
designed, and the probe rewrote the plan: the increment was queued to stop doors quoting git's
banner, and it found two more ways a door misreports git. Every state is built by the harness playing
the HUMAN (init, seed commits, staging, a real conflicting merge, an `index.lock`, a truncated
`.git/index`, a failing `pre-commit` hook) and then each failing command is run TWICE — once through
the shipped door, once RAW outside the sandbox — so no assertion in this file grades a door's memory
of what git said.

§1 is the complaint that started it: over an unchanged tree `git commit` writes two lines to STDOUT,
`On branch master` then `nothing to commit, working tree clean`, and pre-v52 the door quoted the
first. Now the sentence carries the second and admits it (`· git's last line of the 2 it printed`),
and the banner is asserted ABSENT — with the further check that the quoted line is a verbatim line of
git's real output. §2 does it again at six lines, on the exact refusal a human weighs one second
before approving a commit, and adds that a §28 DENY costs no process and therefore no words. §3 is a
real `index.lock`: the door quotes the fatal line naming the lock file, the lock is still there
afterwards (the door only spoke), and the SAME door over the SAME human-staged index succeeds once
the human removes it — so the refusal demonstrably was about the lock, not about a broken door.

§4 is the second complaint, and it belonged to the two v32 READ doors, which quoted nothing at all on
a nonzero exit: they parsed the empty stdout and returned a tally, so a corrupt index answered
`git.status → exit 128: 0 entries` — a sentence that reads as "clean". Four doors (status, diff, diff
--stat, staged) meet one broken repo, and each is asserted on five points, the sharpest being a
subtraction: strip the disclaimer out of the detail and no bare absence claim (`is EMPTY`, `clean`)
may survive outside it. §5 is the complaint nobody had: git can exit 0 and still not ANSWER. In a
conflicted index it emits three different NOTICE shapes — `* Unmerged path file.md`,
` file.md | Unmerged` inside a stat footer, and a combined `diff --cc` body the v32 parser finds no
header for — all three parse to ZERO, and `git.staged`, the door v45 placed one step before the §28
commit ask precisely so a human would know whether anything existed to record, said **"the index is
EMPTY"**. An unmerged path is the one thing a granted commit cannot record, so that was the opposite
of the truth; all three doors now name the conflict, and the conflict is verified still unresolved
afterwards (the reads resolved nothing).

§6 measures the limit instead of hiding it: outside a repository `git diff --cached` degrades to
`--no-index` mode and fails on the FLAG with a 132-line usage page, so the door quotes
`error: unknown option ` — and does NOT say "not a git repository", which is the real cause and is
what `git status` in the SAME directory does say. A door relays git; it is not allowed to upgrade a
relay into a diagnosis git did not offer. §7 joins v51 to v52 on one refusal: the host's record keeps
both git lines because a record that summarizes stops being one, the door's sentence keeps the verdict
and drops the banner, and the two differing on purpose IS the design. Home HEAD byte-identical; every
repo deleted in `finally` (§9); staging, merging and lock removal stay human acts, and `git push`
never happens.

## Streams proof (`streams-proof.mjs`, M2 v53 — a budget may stop a pipe, it may not decide who gets heard)

43rd script in this directory, and the finding that motivated it is invisible from any door: v30 gave
a command ONE byte budget and spent it from a single counter, so the two pipes raced for it. Run a
real process that writes 9 100 bytes to stderr and then 4 000 bytes of answer to stdout against a
4 096-byte ceiling and the host returns NOTHING on either stream — stderr spent the counter, and v48's
whole-line trim discarded the partial line it had cut. Run the same program with the writes swapped and
the answer comes back. Same argv, same cwd, same env, same ceiling: **which pipe flushed first decided
whether the agent saw anything**, so the same command could answer differently twice in a row.

§1 measures the mute's absence and prices it in the same breath. Both write orders now keep the whole
4 000-byte answer and 8 000 bytes between the two streams — MORE than a single shared counter of 4 096
could hold, which is how the old model is excluded: by arithmetic on this run's own totals, not by
re-implementing it to win a comparison. A split-with-lending design (half guaranteed each, either free
to spend the other's unused half) was built first and rejected here — a fast stream spends borrowed
ground before the slow one reaches it, so a borrowed share is a race with better manners.

§2 measures the opposite worry instead of assuming it away: six shipped git reads at their real
ceilings, `truncated: false` on all six, no cut or refusal wording anywhere — the change costs a
well-behaved command nothing. §3 is a real `pre-commit` hook printing 20 000 bytes with no newline
anywhere and refusing the commit, run through the SHIPPED commit door at a ceiling that fits and one
that does not. The first quotes git's noise verbatim; the second says *"no WHOLE line survived the
output budget"* and is asserted NOT to say "git printed no output at all" — v52's own `none` rule
produced the self-contradicting sentence `exit 1: git printed no output at all · output truncated at
budget`, and this is the third member of the family v48 began (`cutNotAbsence` for a tally,
`refusedNotAbsence` for a refusal, `cut` for git's words). The v51 records tell the sharper half of
that story: at the tight ceiling the journal holds nothing either, because the ceiling bounds what
ANYONE downstream can see — which is exactly why the sentence has to say it out loud.

§4 pins the stated worst case (each stream ≤ the ceiling, both trimmed to whole lines, total ≤ 2 ×)
and v29's clamp still clamping — a rule cannot raise its own ceiling, so what changed is the meaning
of the number, not who may set it. §5 runs one command five times and asserts a single outcome, a
determinism claim the pre-v53 code could not honestly make. §6/§9: every repo, hook and journal is
under `os.tmpdir` and deleted; home HEAD byte-identical; the door's own commit is REFUSED by the hook,
so the only history written here is the harness's seed.

## Reap proof (`reap-proof.mjs`, M2 v55 — a killed parent is not a killed tree)

44th script in this directory, and the only one whose subject is a process that is still running when
the test asserts. Since v30 `killedByBudget: true` has meant *the process the host started was
terminated*, and it has been read as *the run is over*. A real program that leaves a **detached**
child behind settles that: killed at a 700 ms budget, the host reported
`killedByBudget: true, signal: SIGTERM` — and the child wrote **7 more heartbeats** afterwards, into
a `os.tmpdir` directory that then could not be deleted, because a live process still held it open.
The sandbox's own cleanup was being outlived by the thing it had killed.

The obstacle was the abstraction, so the abstraction moved first: v30's `ExecChild`
(`onData`/`onEnd`/`kill`) carried no process id, so the host could not reach anything else even if it
wanted to. `pid?: number` is now in the contract, and a fake that reports none is answered `no-pid`
rather than a pretend success.

§3 is the finding that decides the design, and it is a measurement of an ORDER. `taskkill /PID <pid>
/T /F` issued AFTER the host's own kill returns **128** — a dead parent has no children left to
enumerate — while the survivor's heartbeats keep growing; issued INSTEAD of the kill it returns 0 and
the survivor goes silent. So reaping is a substitution, never a cleanup step, and "kill, then tidy the
tree" is exactly a no-op that looks like hygiene.

§1 shows the survivor with reaping OFF (the default, byte-identical to v30-v54 — which is what lets
the other 43 scripts be the assertion that nothing else moved) and the record saying
`not-attempted`; §2 shows the same command with `reapTree: true` falling silent, and keeps the exit
fields the OS actually reported (`exit 1 / signal null`) beside `killedByBudget: true` instead of
smoothing the difference; §4 checks that the platform answer is a VALUE
(`TREE_REAPER_AVAILABLE`, and `DEFAULT_TREE_REAPER(0) === false` without throwing) so the proof can
assert what is true on this box rather than hope; §5 runs the same parent with an **attached** child
and shows it dies with its parent — so the default was never a bug, only a limit, and nothing here
claims to kill every descendant on a machine; §6 puts both claims in the v51 audit record, where
`killedByBudget` and `descendantsStopped` sit side by side and the v30/v51 readers still report
`malformed 0`.

The `finally` block is part of the finding: it reaps the trees it started BEFORE trying to delete the
directory, with a bounded retry and a hard assertion that nothing was left behind.

## Pipes proof (`pipes-proof.mjs`, M2 v56 — the budget says which pipe it took the bytes from)

45th script in this directory. v53 gave each stream its own ceiling and left one bit — `truncated` —
to describe both of them, and that bit is load-bearing twice: it is the clause a §28 reviewer reads,
and it is the condition v48's *"no complete line survived the output budget"* hedge turns on.

Measured first, through the shipped `exec.run` door: a program writing 28 bytes of answer to stdout
and 8 000 bytes of progress to stderr under a 1 024-byte ceiling came back with the answer
**byte-identical to an uncapped control run**, and the sentence `→ exit 0 (output truncated)`. The
door was doubting the one thing it had received whole. Swap the pipes at an 8-byte ceiling and the
answer genuinely is gone — and the sentence is the same. Both readings cannot be right.

§1 proves the intact case against a control run outside the sandbox; §2 proves the mirror; §3 asserts
the two sentences now DIFFER (the increment in one assertion) and that with no stream evidence the
builder names NOTHING rather than guessing. §4 is the substantive half: a real `git.staged` over 24
multibyte staged lines, budgets DERIVED from git's own byte offsets, including four that land inside
the very first line — across 10 sampled ceilings, 5 leave nothing to parse, and the hedge appears on
exactly those 5 and on none of the other 5, because it is keyed to `stdoutWasCut` now, not to the
aggregate bit. §5 measures where the hazard actually lives rather than assuming: all five shipped read
doors answered on stdout with zero bytes on stderr on this box, so the git doors are exposed through a
cut STDOUT (which §4 exercises) and §1/§2's two-pipe shape is a `test.run`/`exec.run` reality. §6
shows the v51 audit record carrying the same naming — *"whose bytes were dropped"* stays answerable a
week later from the file alone. §9: `os.tmpdir` only, home HEAD byte-identical, everything deleted.

The other thing this file's existence records: five doors had each re-assembled the same two budget
clauses by hand (v52 counted that duplication in the quoting; v56 removed the second copy). One
builder, `budgetFlags`, now writes it for all six, so a door added later cannot forget to say whose
bytes are missing.

## Conflict proof (`conflict-proof.mjs`, M2 v57 — one conflicted repository, one story)

46th script in this directory, and the second half of a bound v52 wrote about itself. v52 taught the
diff-family doors to name an unmerged path; the status door was left out, and measuring each shape
showed its table had a hole: it matched a code per row and asked whether the two-character field
CONTAINED it, so `UU`/`AU`/`UA`/`DU`/`UD` read as unmerged while **`AA` fell to the `A` row and `DD`
to the `D` row**. Git's own porcelain spec calls exactly those seven codes unmerged.

The consequence is not taxonomy. On a real add/add merge — two branches creating the same path with
different content — `git status --short` prints `AA new.md`, and the door reported
`1 entries (1 added)` about a repository where `git commit` answers exit 128 with "Committing is not
possible because you have unmerged files". The agent's first read of a conflicted tree said WORK
WAITING TO BE COMMITTED while the same plan's `git.staged` step said it was conflicted: two doors, one
repository, and the optimistic story came first.

§1 pins the set (`UNMERGED_XY`, consulted BEFORE the table) and its two narrow edges — a genuine
staged add is still `added`, an unknown code is still `other`. §2 drives three shapes and, for each,
asks git for the commit the new sentence promises will be refused, so the claim is tested rather than
asserted; the raw control also caught this file's own wrong guess about which code a delete/modify
merge prints (`DU` here, not `UD`). §3 is the point: one add/add repo, both doors, one word. §4 is the
control that makes §2 mean what it says — a clean tree gets no clause, and the same commit door lands a
real commit there. §5 reads `MERGE_HEAD` from disk against `git rev-parse`: the conflict is a fact in
the repository, not an artefact of parsing.

A migration note, said plainly: anything that counted `added` in a conflicted repo counted wrongly and
now counts it as `unmerged`. Nothing in this repo depended on that number — the 46/46 sweep proved it
rather than the prose assuming it.


## Bridge-report proof (`bridge-report-proof.mjs`, M2 v60 — a report sentence may not mute a pipe)

47th script in this directory, and the layer directly above v53. The host learned per-stream byte
ceilings; the bridge that turns an `ExecRunResult` into a `TestReport` had kept a worse version of
the same bug since v31 — `stderr || stdout`, which does not depend on timing at all: stderr simply
always won. That is why 30 versions of green proofs never saw it: a command that stays quiet on
stderr looked fine.

§1 runs ONE real node program twice, writing its answer and its warning in opposite orders, and
recomputes the shipped old rule from the very same `ExecRunResult` the bridge was handed — both
orders produced `exit 1 · (node:123) DeprecationWarning: legacy url`, i.e. the 42-byte answer was
never in the report; the new sentences carry both pipes and are equal to each other. §2 is the part
that was worse than muting: with 2 500 bytes on stdout under a 2 000-byte ceiling, the old sentence
was 53 bytes long, quoted a 5-byte stderr warning, and then announced `output truncated at budget
(stdout)` — describing a cut it had itself caused, while 2 000 whole bytes sat unreported. §3 gives
the empty-after-cut pipe v48's words instead of silence. §4 really kills a program at 500 ms so
v55's tree answer and the absence of an exit code reach a verify sentence. §5 first proves the
confined host DEFAULT-DENIES the suite argv (so the refusal path is measured, not decorated), then
runs the real `@nexus/design-model` vitest suite and records 592 B on stdout / 0 on stderr — the
hazard was latent in the bridge, not live in the one command this repo ships, and the file says so
with numbers. §6 files three refusals under `never-ran`, keeps `total` at 1, and asserts the
registry ANSWERS that report instead of throwing "no test predicate named exit-zero".

Every report here is checked against the single run that produced it, through a spy that records the
exact `ExecRunResult` — the first draft of this file ran the suite twice and compared one process's
output to the other's report, which is the same mistake in a new costume. Uses only async `spawn`/
`execFile` (this machine's synchronous child-process APIs fail with EBUSY — a limit of the box, not
of the design) and only `os.tmpdir()`; the home repo's HEAD is compared byte-wise at the end.

## Porcelain-path proof (`porcelain-path-proof.mjs`, M2 v61 — a door hands on PATHS, and a picture of a path is not one)

48th tracked proof in this directory (the 49th file sitting in it, counting the other lane’s uncommitted
`policyaudit-proof.mjs`), and the floor under three doors at once. v32 gave the agent `git.status`, v42
`git.show` and v43 `git.staged`; all three were built on one silent assumption — that the bytes between a
porcelain line’s columns ARE the file. This proof runs real git both ways, with the shipped environment and
with v61’s pin removed, so the damage is shown rather than asserted.

§0 pins the wiring (which slot number `core.quotePath` occupies, that `status.showUntrackedFiles` moved to the
slot after it, and that the scrubber drops none of it). §1 has a HUMAN stage a rename, reads it as a PAIR
through both index-facing doors, and weighs the two names against each other on raw `git show` with the very
argv the content door builds: **221 bytes** under the name HEAD knows and **0** under the one on disk — while
the door that asked with the wrong name got exit 0 and an EMPTY diff (v44’s finding), which is exactly how a
wrong name turns into a confident absence. The commit door then records that staged rename FOR REAL and
status has no pair left to speak. §2 is the escalation: the same commands with the pin removed print a
quoted header, v43’s header matcher — copied verbatim out of the previous commit and pinned in this file, so
the claim is about a regex and not about a memory — sees **0 headers** in bytes git’s own `--stat` line calls
`1 file changed`, and the sentence the door would have spoken (“the index is EMPTY”) is captured byte-for-byte
from the SAME door run over a genuinely empty index. §3 measures what the pin does NOT fix: an ordinary SPACE
is still quoted (`?? "plain name.md"`, `R  "a b.md" -> "c d.md"`), which is why the parsers undo a rendering
now; a `m b/` directory — legal on NTFS, created here — steals the header’s positional split and git’s own
per-line name beats it; and a name containing ` -> `, `"` or a tab cannot be created on this filesystem, so
the three attempts and their error codes ARE the evidence that the escaped branch is fixture-only. §4 is a
candidate this increment set out to fix and REFUTED instead (3 entries with the shipped pin, 1 with
`status.showUntrackedFiles=normal`, and that one is the prefix `dropzone/`). §5 the content door refuses to
ask git about a rendering, at zero spawns. §6 §9: every byte written lived in `os.tmpdir`, the door’s own
spawn total is printed, and this repository’s HEAD is compared byte-wise.

## Scope honesty

§63/§26 items *not* implemented (stated, not faked): general real-fs write tools (only
`disk.write` inside an explicit jail root, always checkpoint-gated), GENERAL process
execution — since v30 `@nexus/exec-host` can run EXACT allowlisted argv under §28 with
plan budgets, and since v48 those budgets may cut an answer SHORT but not change what it
SAYS (a stream that lost bytes is trimmed to its last whole line, so no parser downstream is
ever handed a fragment as content), but there is no arbitrary-command path, no shell, and no OS/container
sandbox (ADR 0013's egress/secret/containers half is open); since v46 the ENVIRONMENT a
confined command inherits is part of the policy too (`gitEnv()` makes machine config inert
and the argv shape confines repo config/data), which is still allowlist confinement — git
runs as a real process with real read access inside the jailed cwd, not inside a jail the OS
enforces; v31 added the bridge by which a
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
file; since v46 all three DIFFING doors carry `--no-ext-diff --no-textconv` IN their shape,
because measurement proved env pinning cannot reach repo DATA — only the shape can) — the v32 see-don't-touch policy
stands for everything else, and real-commit
demos live only in throwaway temp repos. v61 narrowed what a door may do with a NAME without closing the
gap: an escaped rendering (a name carrying a quote, a backslash, a control character, or — under git’s own
default — any non-ASCII byte) is still handed over exactly as git printed it, marked `quoted` and announced
in the door’s sentence, because undoing it would mean choosing among characters this filesystem cannot even
name (§3 records the attempts); and a paired entry whose name ends quote-adjacent to an arrow can still fool
a positional split, for which git’s own answer is porcelain v2’s NUL-terminated fields — which no door here
asks for yet. Agent-led STAGING (choosing what enters the
index) remains unimplemented by design: staging stays a human/`disk`-side act,
and v43 makes that act LEGIBLE to the agent (read the index, never write it) — v45 put that
read IN THE PLAN, so the intent is spoken out loud one step before the §28 ask to record it,
and v47 gave the whole arc its ONLY owner (`releaser`: exactly the four doors, no `git.add`, no
push, no `memory.save`, so it cannot journal its own success) behind an EXPLICIT host flag
(`ChainOptions.release`) — nothing in the Studio dock sets it, so the dock still cannot commit and
no UI pretends otherwise (§60); v49 made a chained arc durable in the ledger and v50 made the §28
receipts for its own doors durable beside it, and v54 gave the RUN line its own receipts on the same
terms — but `loadLedger().arcs` still has no reader in the browser and nothing renders `decisions` on
either kind, so that history is machine-checkable and not yet human-visible (§60 again — no panel
pretends). One gate is still journaled nowhere, and v54 is what makes it countable: a chained stage's
own call (the designer's `${id}:brief`, a gated `fs.append`) belongs to no `RunOutcome` and no arc, so
the honest fix is a THIRD record kind for stage-level calls, not a paste onto someone else's line; and v51 moved journalling INTO the host — every `run()` outcome, refusals included, is
now its own durable event when a caller passes a sink — but no host anywhere in this repo is built
with one outside `spawnlog-proof.mjs` and the exec-host unit tests, nothing reads such a file in the
browser, and the append is read-then-rewrite, so a crash mid-write can still cost the last line: the
guarantee is "the CALL either has its record or fails loudly", not "the file survives any failure"; v55 adds what a KILLED run says about the processes it spawned: `killedByBudget` was always about ONE process, and `descendantsStopped` now says which of `not-attempted` / `reaped` / `reaper-failed` / `no-pid` / `unsupported-platform` the host actually achieved — opt-in (`reapTree`), because the win32 reaper runs a SECOND binary (`taskkill`, fixed argv built from an integer pid, never an agent-supplied string), and reaping REPLACES the direct kill rather than following it (measured: after the kill there is no tree left to enumerate, so kill-then-reap is a no-op that looks like hygiene). What the host can promise stops there: it reports what IT did, never that no descendant anywhere survives; POSIX has no reaper and says `unsupported-platform` rather than pretending; an attached child needed no reaper at all; and when reaping succeeds the run's own `exitCode`/`signal` become whatever the OS reported for a force-kill, which the proof keeps visible instead of normalising; v53 changed what `maxOutputBytes` MEANS rather than who may set it — it is now EACH stream's ceiling,
so the host can retain 2 × that number per run (128 KiB at the default 64 KiB, 2 MiB where the suite
proof asks for 1 MiB), `truncated` is still ONE flag for two streams (the two strings are the evidence
of who was cut), and a program that writes 30 KB on a single pipe is still trimmed to its ceiling
exactly as before — v53 stops one stream silencing another, it raises nobody's limit; v56 says which
one was cut: `truncatedStreams` is present exactly when something was dropped (absent rather than `[]`,
so "nothing was cut" and "cut but unattributable" stay different facts), `budgetFlags` is the ONE
builder behind all six doors' budget sentences and prints the bare clause when it has no stream
evidence rather than guessing at one, and `stdoutWasCut` reads absence as false — correct for the
shipped host, and it would UNDER-report if a future writer set `truncated` by hand, which is why the
host is the only thing allowed to set either;
live-model planning (the seam exists, the model needs keys), multi-agent registry.
Memory recall (v6) shares the index's deterministic token-bag hybrid score — a real
signature scheme, but still a stand-in for the pgvector hybrid retrieval of ADR 0012. The provider must be kept in sync with the workspace by the
host; it only ever sees the host-supplied file set (§60).

## Two-tree proof (`two-tree-proof.mjs`, M2 v62 — porcelain's TWO columns answer TWO different trees)

49th tracked proof (50th file). §1 creates a throwaway `os.tmpdir` repository carrying all seven porcelain
shapes simultaneously (`MM`/`AM`/`M `/` D`/` M`/`D `/`??`) and runs the shipped `git.status` door over it.
The door's per-file `staged`/`dirty` fields are cross-checked against git's own authoritative name-lists:
`diff --name-only --cached` for the index side, `diff --name-only` for the worktree side, and
`git ls-files --others --exclude-standard` for untracked. The door's numbers must MATCH git's — not
the other way around. §2 makes one REAL commit through the shipped commit door and verifies that HEAD
recorded exactly the 4 staged paths (the two that were staged-only, the deletion that was staged, and the
first half of each `MM`/`AM` pair), while 5 worktree-side entries remain outside the commit — proving the
tree-split notice's prediction was correct. §3 sets up a fully-staged tree and asserts the notice's
SILENCE: no false alarm when there is no split. §4 compares this repository's HEAD byte-wise.

The candidate this increment REFUTED with numbers (v61's comment called it "the next increment"): porcelain
v2 costs 6.9x the bytes of v1 (33,706 vs 4,884 on 262 files), leaving 31 entries answerable at the shipped
4,096-byte budget where v1 answers 219. Adoption would cost the reader 86% of its range at the same
ceiling. The fix is therefore per-column parsing of the existing format, not a format upgrade.

## Window proof (`window-proof.mjs`, M2 v63 — a cut read is a WINDOW, not a census)

50th tracked proof (51st script). v62 gave `git.status` a ratio — `git.commit records the INDEX: 4/7 entries
differ from HEAD there` — and a ratio has a DENOMINATOR, which is a claim about the repository. Every door
reads git through v48's whole-line output budget, so that denominator can be smaller than git's answer.
This proof drives the SHIPPED door over ONE throwaway repository (3 staged edits + 400 untracked files, so
`git status --short` prints 403 lines) at three budgets and checks each answer against git, not against the
door.

§1 at a 1 MiB ceiling: `3/403 entries differ from HEAD there`, with no window clause — v62's sentences, byte-identical.
At 256 bytes: the denominator EQUALS the number of entries the door returned (21, not 403), the clause says
`this door READ`, and every path the window names appears in git's own list — a window may be short, it may
not invent. §1 also pins the measurement itself rather than its shape: 21 whole porcelain lines survive 256 bytes,
the 3 staged rows are all of them that came first, and the untracked tail that survived runs `u000.txt … u017.txt`
(18 names) — the numbers quoted in the source comment and the amendment are held by a green assertion, not by a
memory. §2 is the load-bearing one: at a 30-byte budget only the three `M ` rows survive (porcelain
prints tracked changes first, untracked last), so v62's own rule — "all entries staged means there is no
split to name" — fires and the door goes SILENT over 400 unseen files. The same parsed entries now yield
`''` for a complete read and a sentence for a cut one: the difference is the READ, not the repository. §3
controls the claims with git rather than the door (`diff --name-only --cached` is exactly the 3 the window
read; `ls-files --others` counts the 400 it did not). §4 makes one REAL commit through the shipped commit
door: HEAD records `s1.txt s2.txt s3.txt`, and the same door over the same tree then says `0/400 … a granted
commit records NONE of`. §5 measures why a status list is long enough to cut at all: with
`status.showUntrackedFiles=normal` a 400-file untracked directory is ONE porcelain line (`?? dropzone/` — a
prefix, not a path); under v46's forced `all`, which the door actually runs, it is 400. The door reads them
all, and v63 makes it say how many it finished. §6 compares this repository's HEAD byte-wise.

What v62's honest bounds got wrong, and is now measured instead of restated: untracked directories are NOT
collapsed by the shipped doors — v61 already found that, and v63 §5 puts the number on it. What v63 did NOT
do: the window flag is not wired from the aggregate `truncated` (v56's rule still decides WHICH pipe was
cut, and noise may not re-label an answer that arrived whole), and `killedByBudget` is not part of it
either — a killed read fails the door's `ok` and answers with v52's refusal sentence, so a `||
killedByBudget` operand would be unreachable code. The first draft had one, and it was deleted.

## Hunk-shape proof (`hunk-shape-proof.mjs`, M2 v64 — a body line can wear a header's shape)

51st tracked proof (52nd script). Three doors parse a diff, and all three asked the same question the wrong
way: what a line LOOKS LIKE. `parseFileLine` was consulted anywhere in the text, and a `+` counted unless the
line began with `+++`. Git prints the `--- `/`+++ ` pair ONCE per file, before the first `@@`; inside a hunk
every line is content and content carries a one-character prefix — so a line whose own text is `++ b/second.md`
is printed by git as `+++ b/second.md`. This proof drives the SHIPPED doors over ONE throwaway repository whose
changed text is exactly those shapes, and compares every answer to git's own census (`--numstat -z`,
`--name-only -z`, `--shortstat`), not to the door.

§1 the worktree door: git's census is `3 files changed, 2 insertions(+), 1 deletion(-)` and the door now says
`3 files, +2 −1 (3 hunks)`, path-for-path and count-for-count, while naming NONE of `second.md`, `ghost.ts` or
`fake-from-an-addition` — the names that live INSIDE those files as text. §2 is the sentence a human weighs at
§28: the index door answers `index holds 3 change(s): 3 modified · +2 −1`, matching git's `--numstat --cached`
path-for-path, and hands back `addedLines: ["++ b/second.md"]` — the one line a prefix rule throws away along
with the file it belongs to.
§3 transcribes the replaced reader over the SAME bytes and asserts its answer: `{add: 0, del: 0}` against git's
`+2 −1`, the bug witnessed rather than described; `git log -S` then reports exactly ONE commit that wrote that
predicate, which is what pins the change rather than a memory of it. §4 makes one REAL commit through the
shipped commit door and reads it back through `git.show`: HEAD changed `notes.md`, `+1 −0` across one hunk — the
line that had been swallowed is now the content the confirm-after-commit door reports. §5 witnesses the second
finding: git TERMINATES an unquoted name line with a literal TAB when the path contains a space, so a
staged diff prints the name line `+++ b/m b/n.md⇥`; the door's path is `m b/n.md`, and no path it returns contains
a TAB. §6 counts the rule instead of trusting prose: `isDiffHeaderPairLine` has ONE call site in each of the
three readers, so the position test is not re-invented per door. §7: this repository's HEAD unchanged
byte-for-byte, writes inside `os.tmpdir` only, and five real door spawns behind the claims above.

What v64 did NOT do, stated rather than smoothed over: on this box a file whose name contains a TAB cannot be
created (`git mv` answers `Invalid argument`), so the separator rule is measured on git's output for a SPACE in
the path and the TAB-named case is unmeasured, not worked around; a pure rename prints NO name pair at all (it
is named by its `rename from`/`rename to` lines, v61's rules), and `diff.noprefix` / `diff.mnemonicPrefix` are
still unpinned in v46's config table — a repo that sets them changes the bytes every one of these readers
sees, which is the first candidate for the next increment.
