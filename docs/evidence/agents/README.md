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
npm test          # turbo: @nexus/agent-runtime 644/644 + @nexus/exec-host 336/336 vitest among all packages
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
node docs/evidence/agents/prefix-proof.mjs         # requires `npm run build` first (v65: FOUR repository config keys — `diff.noprefix`, `diff.mnemonicPrefix`, `diff.srcPrefix`, `diff.dstPrefix` — set in ONE throwaway repo whose index git’s own footer calls `4 files changed, 4 insertions(+), 2 deletions(-)`, where every header reader names 0 files and the pre-v65 0-file sentence is TRANSCRIBED into this file so the lie outlives the source; the pre-v65 process is replayed by a spawn stand-in that drops v65’s two prefix flags on the way to git, the shipped argv is hashed byte-identical to the old one over four reads in a repo that sets nothing, two hostile keys are driven at once beside `git.show`, and a hand-spliced phantom section proves an unread section adds no line to the file before it)
node docs/evidence/agents/cut-tally-proof.mjs     # requires `npm run build` first (v66: ONE throwaway repo whose index git's own footer calls `25 files changed, 75 insertions(+), 75 deletions(-)`, read through the three DIFF doors at budgets taken from git's byte offsets — all 774 cut boundaries swept by replaying git's RECORDED bytes through the shipped host (a shortcut §3a pays for with 12 real-vs-replay byte-identity checks, in the sentence AND the parsed files), `git.show`'s windows graded against its own `--numstat 60 0`, the "the changes named before the last are WHOLE" claim tested at a section boundary where it holds and 900 bytes later where the last change is short, both `--stat` faces proven immune over every line boundary, and one REAL commit recording 25 paths where the window said `AT LEAST 8`)
node docs/evidence/agents/sweep.mjs --ref HEAD      # v78: runs the REF's bytes and prints its identity FIRST — ref sha, dist digest, dirty sources, proofs diverging from the worktree
node docs/evidence/agents/sweep.mjs --isolated                # v83: the SAME sweep, run INSIDE v81's clean checkout — every proof spawned with cwd in the archived tree, so `graded build` names the build AT THAT cwd (0 dist files before a build) and home's digest is re-checked after, printing `UNMOVED (the isolation gate)` or the accusation that the run compiled into the repository it was grading
node docs/evidence/agents/tree-axis-proof.mjs   # v80: the sweep's third axis — walked-tree digest, ownership bins, mid-run re-check
node docs/evidence/agents/isolated-proof.mjs  # requires `npm run build` first (v81: a CLEAN CHECKOUT of the ref, built clean-room in a temp tree — graded on one gate, HOME's dist digest byte-identical before/after, so "isolated" is falsifiable instead of asserted; census-without-git reported as null not 0; the tree-walking proof run in both trees: 193 files vs 220, same verdict, every clean file tracked at HEAD), and since v82 its verdict carries a REASON line quoted from the build.log the runner itself wrote (see §3/§3b)
node docs/evidence/agents/isolated-arms.mjs  # human-run tool, NOT a proof row (v84): the two clean checkouts of ONE ref differing only in the DRIVE under `dest`, both built — ~18 min here, ~25 s with `--no-build` — exiting non-zero if the home build moved. This is where amendment 84's `exit 1 in 522.4s` / `exit 0 in 513.0s` pair comes from, and it is committed because a number nobody can re-measure is a number a later reader has to take on faith
node docs/evidence/agents/cwd-axis-proof.mjs    # requires `npm run build` first (v83: the axis under the sweep — census says 61+3 of 64 proofs resolve the shipped code through the CHILD's cwd and 0 through their own file location, a spawned child reports what it loads at three synthetic trees, and the ref's OWN roles-proof exits 1 at an archived checkout / 0 here over byte-identical bytes; `runSweep(proofsCwd)` prints the graded build beside the runner's own, and the witness asserts its own scheduling: 61.6 s of the 240 s a sweep row gets)
node docs/evidence/agents/drive-axis-proof.mjs  # requires `npm run build` first (v84: the drive under a clean checkout is an axis — two `relative()` calls derive the cross-drive request `./D:/…/next.js` and assert it EQUAL, byte for byte, to the reason line recorded in `isolated-arms.mjs`; the DEFAULT dest is pinned to the repository's drive while a caller can still ask for the other and is told `CROSS-DRIVE` plus who chose; the POSIX clause is graded by its ABSENCE on a win32 host; and the witness schedules itself in 67.9 s of the 240 s a sweep row gets while naming the 513 s build arm that can never be one)
```

A note on `spawns[…]` assertions: they pin the argv SHAPE a plan step is allowed to produce
(`diff` … `--cached` … no pathspec), not the current flag list. Exec-host's own contract tests
`agents/exec-host/test/*` are the authority on the exact argv; a proof that re-pinned it would
turn green only by agreeing with whatever the door was last edited to say. v46 put that rule to
work: hardening the diffing doors (`--no-ext-diff --no-textconv`) reddened four already-committed
proofs that had hard-coded the old strings, and they now interpolate the door's own exported
`GIT_DIFF_FLAGS` — so the literal list is pinned in exactly two places that exist to witness it
(`gitEnvIsolation.test.ts` and `config-proof.mjs` §1), while every other suite and proof pins only
the SHAPE around it. One source, and no way for a loosening to look like a refactor. v65 grew that constant from two tokens to four and the rule paid for itself a second time: the same two witnesses were re-counted in the same commit (`gitEnvIsolation.test.ts` now pins the exact four-token array, and `config-proof.mjs` interpolates `FLAGS` into the `git show` argv it asserts verbatim) and no other proof in the suite moved.

## Unit tests (vitest, `agents/runtime/test`)

The parenthesized counts below are the committed state, and they are checkable rather than
decorative: the runtime rows sum to exactly **644** (43 files) and the `exec-host/*` rows to exactly
**336** (13 files) — the same totals `npm test` prints. A row whose number drifts from its file is a
documentation bug, so an increment that adds a case updates its row in the same commit. v63 found this
table itself adrift: the `gitTools.test.ts` row still read (51) where HEAD measured 65, because every case
that file gained after am. 61 (when the package total this table reproduced was 201) was tallied into the
total and never into its own row — renumbered now by re-reading the vitest JSON per file, not by adding the
deltas by hand. v64 re-read that same report for its three touched rows (71→78, 30→33, 22→24) rather than
trusting the arithmetic above, and v65 re-read the same report for its three touched rows (78→86, 33→35, 12→13). v66 re-read it again for the same three rows it owns (86→94, 24→27, 35→39).
v90 re-read it again and found the table adrift in a way those recounts had made invisible: four rows, not
one — `codeIndex` 7→10, `indexStore` 11→13, `execHost` 38→39 (am. 86's async-reaper case), and a whole
FILE never entered (`policyAudit.test.ts`, 23 cases, shipped with am. 86b) — plus the two prose totals
above, which had been stale since before those rows were corrected individually. The recount is the same
method v63 prescribed: the JSON per file, read back from a `vitest run --reporter=json` over both packages,
never the sum of the deltas.

| File | Covers |
| ---- | ------ |
| `registry.test.ts` (7) | arg validation (missing/unknown/type), unknown tool, checkpoint required for write/exec, deny ⇒ implementation never runs, approve ⇒ runs, impl throw ⇒ `ok:false` (never rejects), double-register refused |
| `checkpointPolicy.test.ts` (13) | v54: `receiptsOrNote` answering for BOTH record kinds from one function (an owned call in ⇒ one receipt out, and the face's OTHER decision — same tool, different stage — stays off the line), `gatedCallIds` naming only calls whose tool carries a DANGEROUS permission in the registry that record acted through (reads never acquire a receipt, and a scoped view cannot borrow the host's wider list), the clone-out and the three silences told apart (owned-empty with no sentence / empty plus the one exported sentence / nothing gated ⇒ no sentence at all); v40: first-match-wins ordering, `matchesTool` glob semantics shared with role scoping (`fs.*`, `*`), unmatched ⇒ EXPLICIT default (never an invented verdict), `decide` purity (byte-identical JSON, policy not mutated), `validateCheckpointPolicy` rejection matrix (missing reason / empty pattern / non-boolean grant / duplicate pattern = dead rule / mute default) thrown at CONSTRUCTION, `policyCheckpoint` receipts in executed order quoting rule reasons verbatim, registry contract unchanged (policy denial == `denied at checkpoint (write)`), runTask end-to-end through policy gates (granted work STANDS under a later veto; read steps produce NO verdicts — §28 gates hands, not eyes) |
| `workspace.test.ts` (8) | sorted/prefix listing, case-insensitive 1-based `search`, append/missing-file throw, registry wiring incl. gated `fs.write`; v465: the tool SPECS asked directly — the six tools in order under one `fs.` namespace, only `fs.write`/`fs.append` carry write while the four read tools cannot mutate, args declared honestly (`fs.list`’s optional prefix, `fs.index`’s optional topK, the rest required), and registration registers exactly the specs — the registry’s own listing is the proof |
| `policyAudit.test.ts` (23) | v86b: `auditGateHistory` replays a CANDIDATE policy over recorded human verdicts — only human records are graded (policy records are counted as skipped, never as agreement), a history with nothing to grade answers 0 rather than a vacuous 1, a history of ONLY policy records proves nothing about people, agreement is a ratio over audited calls, too-strict (the table would BLOCK what a person allowed) and too-permissive (it lets through a human veto) are separate lists carrying the exact index, the matched pattern and the table's own reason, the DEFAULT row is named when no rule spoke, a wildcard that grants everything appears once per vetoed call, tools granted only through the default are named as such, duplicates dedupe keeping first-seen order, a rule-granted approval is never reported as silent, the two lists cover every default-granted call exactly once (no gap, no overlap), a malformed table and an implicit default are refused LOUDLY at the call, the policy and the history are never mutated, and identical inputs give byte-identical reports; plus `policyCheckpoint`'s decisions reduced to policy-made records, a history mixing real receipts with human verdicts, the clean line, and the skipped count in the summary |
| `agent.test.ts` (44) | stopword-aware keyword, plan determinism + seed stamp, golden path event order + `@search.hits.0.path` dataflow + note in file, denial leaves file untouched, failing verify → 1 fix round → pass, persistent failure → `failed_verification` after `maxFixRounds`, `maxSteps` → `budget_exhausted`, planner routes step 0 through `fs.index` when registered, warm memory outranks the index (`memory.recall` first), snapshot hook yields an observed changeSet (absent without hook); v36: `hasCommit` appends the commit step ONLY behind a verify step (and deterministically), a green run reaches it with the planned message, checkpoint DENY ⇒ status denied with earlier work standing and zero commits, green AFTER a fix round still commits with fix steps never re-run (execution order asserted), a red run never commits, a throwing commit tool is honest non-green; v38: `hasConfirm` trails a `git.log` step after the commit and NEVER plans one without a commit (or without verify — nested tail, determinism asserted), green ends commit→confirm in executed order, green-after-fix reaches confirm too, DENIED confirm ⇒ status denied while the landed commit's ok:true result STANDS a slot earlier, a throwing `git.log` is honest non-green; v39: `hasRemember` trails `memory.save` ONLY after the confirmed commit (all three tier-removals omit it, refs/targetPath arg shapes, determinism), a green run ends commit→confirm→remember with the planned `@search.hits.0.path` resolved INSIDE the array arg to the live path, green-after-fix remembers once, DENIED confirm means nothing to remember (0 saves), DENIED remember leaves commit+confirm standing and the store empty, a throwing `memory.save` is honest non-green; v44: `hasContent` trails a `git.show` inspect AFTER the hash confirm and BEFORE remember (nested tail — pull commit, confirm or verify and the content step vanishes with it; the planned `{path:'@search.hits.0.path'}` becomes the LIVE hit, and a `targetPath` task plans that path instead), green ends commit→confirm→inspect in executed order, the remembered summary still asserts NO content (never the word `CONTENT` — §60: memory keeps only what v39 could prove), DENIED inspect ⇒ status denied with the landed+confirmed arc standing a slot earlier, git answering "touches nothing" is DATA the walk completes on, a throwing `git.show` is honest non-green, a red run plans the tail and spends none of it; v45: `hasStaged` reads the index BEFORE the commit and NEVER without one, every exec step is its own §28 gate with the intent asked first, a DENIED index read stops the walk before the write, an EMPTY index is stated DATA that the static plan still walks into (§60 limit pinned), a throwing `git.staged` means a commit nobody could inspect never rides quietly, and a run that never verifies green never reads the index at all |
| `codeIndex.test.ts` (10) | extension → kind, TS symbol + markdown heading extraction, heading-section vs 40-line-window chunking, sorted file entries + coverage, hybrid query ranks the relevant chunk first and is deterministic, symbol query finds its file, empty index → no hits, and (v90's recount) the `heading` key is asserted ABSENT where nothing heads it — the pre-heading chunk, the 40-line window branch — and present only where a heading exists, so the two chunk shapes are never collapsed into one |
| `realfs.test.ts` (9) | extension/skip filtering with sorted slash keys, custom skipDirs + maxFiles cap, maxBytes drop, deterministic output independent of walk order — all against a fake fs (no host disk touched); v464: the DEFAULT skip list asked directly — exactly the six non-source names, every entry a bare directory NAME (the skip matches `ent.name`, so a path-like entry could never match), a no-options walk keeps all six out while the source stays in, and an explicit `skipDirs` REPLACES the default rather than extending it (an empty set skips nothing at all) |
| `agentRegistry.test.ts` (17) | the roster on its own terms: register/read-back and a duplicate id refused, listing in id order regardless of insertion order, every DEFAULT agent registering without the v91 collision and each stating at least one allowed tool, a tool view scoped to exactly that agent’s `allowedTools` (a trailing `fs.*` glob honoured, an unknown agent getting an EMPTY scope rather than the full registry), `roleFor` deriving the §24 role from the agent as a copy and answering null for nobody, `getAvailableCapabilities` the agent’s own list or `[]`, a handoff naming an unregistered agent refused, a handoff journalled AND written into §26 memory under a run-scoped key, filtered by run id, `createHandoff` stamping a payload without touching the registry, and persistence OPT-IN (an fs plus a path or nothing lands; a registry with no fs still records in memory; a bare filename needs no directory) |
| `browserTools.test.ts` (20) | the driver cannot act before `init` and names the missing call; an unmatched selector is an ERROR (the defect: a selector string used to be enough), a click on an input and a type on a button both refused BY KIND, missing required fields named, an unknown action type refused rather than ignored; `screenshot` and `evaluate` refuse IN WORDS and return NO data key, so a refusal cannot be mistaken for a picture; `navigate` adopts the host’s description and records history while an undescribed URL claims NO title and NO elements; `click`/`type` report the LABEL they acted on, `scroll` moves only the axes given, `wait` is bounded by `maxWaitMs` whatever was asked, `executeAll` stops at the first failure and returns the prefix it can name, `log()` records what ran in order and `close()` resets; every declared spec is ROUTED (an unrouted tool would be a silent hole), a dangerous door does not run without the §28 checkpoint while a read-class door runs with none, and the tools keep NO second gate — an approved call runs and a refusal surfaces as `ok:false`, args validated by the registry before the driver sees them |
| `sceneTools.test.ts` (28) | M5 v140, the 3D lane's first consumer: every declared `scene.*` spec ROUTED and EXACTLY ONE read-class door (a second read door would be a mutation that skipped the gate); a write door does not run without the §28 checkpoint while `scene.inspect` runs with none; a body cannot be added to a scene the driver does not hold, a PARTIAL position triple is refused rather than defaulted and a non-finite axis is named by its own letter, an unknown `kind` lists the six declared ones instead of storing a word nothing reads, an empty required string is refused; `create` answers the id, the name and `rendered: false`, a position is reported as given or `null` when none was named, removing a body that is not there answers `false` rather than throwing, the FIRST camera becomes active and the report reads that from the driver rather than asserting it, focusing an unknown camera answers `false` and leaves the active one alone; `inspect` reports STRUCTURE and its answer contains no word for a picture; a driver that answers with a PROMISE is awaited like one that answers directly, and a driver that throws becomes a failed CALL rather than a crash of the registry |
| `worldTools.test.ts` (31) | M4 v144, the WORLD lane's first consumer: every declared `world.*` spec ROUTED and EXACTLY TWO read-class doors (`world.inspect`, `world.query`) because a third read door would be a mutation that skipped the gate; `world.character.decide` is asserted NOT read and its description must carry the reason (the package records the decision on the agent); a write door and the decision door both refuse without the §28 checkpoint while both read doors run with none; an unknown location `type` lists the nine declared ones and an unknown lore `category` the ten, each refused rather than stored as a word nothing reads; a character may not be placed in a location the world does not hold — refused BEFORE the add, and placed by ID rather than by name when it does; a `limit` that is not a finite positive number is refused; deciding for a character with no agent is refused by name; an empty required string is refused; the add doors report the id they created and the count that followed, `query` passes the limit through (defaulting to the package's own 10), the decision door reports the whole answer; a driver that answers with a PROMISE is awaited and one that throws becomes a failed CALL; v467: the simulate CEILING asked directly — the cap is a positive whole number, a call at exactly the cap moves the world (the boundary is inclusive), one step past it is refused naming the cap and the remedy (“call it again for more”) with the world NOT moving, and the refusal is the same rule at any distance past the cap rather than a range check |
| `multiAgentPipeline.test.ts` (12) | a chain shorter than two agents refused, an unknown agent refused while reporting what already completed, an agent with no research door refused by NAMING the doors it wanted; the walk visits each EDGE once and names the agent that ran every stage, sends `fs.index {query}` and `fs.search {term}` so each door gets its OWN argument (an `fs.index`-holding agent gets `query`), carries refs forward and says so when an edge finds nothing, refuses when nothing was found and nothing was carried in; one §26 record per edge under a task-scoped key, ledger and evaluation written only when the host supplied files, the refs the LAST edge carried returned so a caller need not re-derive them, and the DEFAULT roster can actually be walked (every research-capable agent has a door) |
| `vectorStore.test.ts` (6) | refuses at the DOOR — pgvector has no connection here, and no foreign dimension can be honest; the memory store ranks hit-for-hit like `vectordb.queryVectors` and NAMES its engine; two identical stores answer identically (determinism is part of the seam); the local store writes NOTHING until `flush`, then a COLD second store reads the same rows; a file that exists but cannot be read is refused, not silently replaced by an empty store; `syncMemoryToVectorStore` names one row per ref, stably, and is idempotent under upsert
| `memDisk.test.ts` (9) | the shared `createMemDisk({ listing, seed })` and its three policies: `‘refuse’` throws, `‘real’` lists, the removed `‘empty’` was the dangerous one; seed derives dirs, `mkdirSync` records, `writeFileSync` does not, listing is sorted; five arms grade the policies |
| `assetTools.test.ts` (41) | M3 v145, the multimodal slice's first consumer: every declared `asset.*` spec ROUTED and exactly THREE read-class doors (`asset.list`, `asset.inspect`, `asset.storyboard.inspect`) with generation asserted NOT read; §60 asserted PER DOOR — no door name matches /screenshot **v160 added 18 more**: seven new doors (video / search / update / delete / the character-consistency trio) all ROUTED and the read set re-pinned at exactly SIX; a provenance-less answer refused by BOTH generate doors (the rule is shared, not duplicated); `asset.update` REFUSES an empty patch because the library answers `true` for one, and refuses an unknown id by name; `asset.delete` answers `false` for an id the library does not hold and its own description states how it differs from the panel’s ungated Remove; `asset.video.generate` reports the GENERATOR’s type/mimeType rather than a label it stamped; a character with no reference images and a strength above 1 are both refused; `asset.character.apply` answers `derived: 'request'` with NO assets and refuses an unregistered character by name; and every new write door refuses without the §28 checkpoint while the new read doors do not. |render|pixel|photo|picture/ and no description promises an image, while the generation door says DEMO MODE and no pixels on its own face; a generation answer WITHOUT provenance is REFUSED rather than forwarded, and one with provenance carries it through untouched; no result carries bytes or a `data` field; a write door refuses without the §28 checkpoint while all three read doors run with none; a count or size that is not a finite positive number is refused; an asset the library does not hold is named; a frame may not reference an absent asset — refused BEFORE the add, and filed when the asset exists; a frame added to a missing storyboard and an inspection of one are both refused by name; `generate` defaults to ONE asset and reports the count it got, `list` reports how many the library holds, `storyboard.inspect` reports frames in order; a driver answering with a PROMISE is awaited and one that throws becomes a failed CALL |
| `memory.test.ts` (14) | save/list/recall scoping, deterministic tie-broken recall bounded by k, forget/clear counts, clone-in/clone-out immutability, registry round-trip with `"path:startLine"` refs, denied `memory.save` leaves memory empty + arg validation; v6 `compact()`: ≥50% ref-overlap merges within scope (listed, idempotent), cross-scope isolation; v19: `recallVectors` equals inline recall exactly, and `memory.recall` states its `engine` with the vector path surviving a fresh store; v463: the tool SPECS asked directly — the four tools in order under one `memory.` namespace, save/forget carry write while recall/list are read-only, args declared honestly (save’s four required, recall’s optional `k` not claimed, list’s empty, forget’s required id), and registration registers exactly the specs — the registry’s own listing is the proof |
| `embedding.test.ts` (4) | tokenizer rules, zero-shared-tokens ⇒ score exactly 0, more shared tokens ⇒ strictly higher, unit-length embeddings |
| `changes.test.ts` (8) | LCS patch round-trip forward/inverse, no-op patch, create/remove all-add/all-del, mismatched input refuses, sorted changed-paths change set, unified-diff headers/hunk ranges/context, whole-snapshot round-trip through patches |
| `ledger.test.ts` (15) | v54: the run line held to the arc line's standard — `decisions`/`decisionsNote` round-trip for both verdicts, the same half-receipt matrix is malformed on either kind, `receiptsOwned` rejects a COMPLETE receipt naming a call the record never made (in both directions, and one genuine receipt plus one borrowed one still condemns the whole line), a run line and an arc line from one chain each answer for their own calls and the two lists are disjoint; v49/v50 fixtures now show records that MADE the calls they answer for; RunOutcome JSONL round-trip + junk rejection with reasons, append-only growth with parent mkdir, order + malformed counting + `last` tail trim + missing-file empty read; v49: an arc record round-trips through one line (walk, callIds and git's answers included), a line that CLAIMS `kind:'git-arc'` is shape-checked before it is believed (unknown status / non-array parts / missing role / non-demo provenance ⇒ `not a complete git-arc record`, never promoted into `runs`), one stream with two kinds keeps append order and `last` trims trailing RECORDS across kinds, the arc joins its run by `runId` while the run line still holds no git step (§60 anti-fold on disk), and a pre-v49 file gains `arcs: []` and nothing else; v50: complete receipts round-trip and an EMPTY list is data about a walk that gated nothing, a half-recorded decision (no reason, no verdict, no `call.callId`) makes the WHOLE line malformed, and a veto's reason reads back off the file |
| `gitArc.test.ts` (32) | v47: the nesting as ONE piece of data (`gitArcDoors` — no commit door ⇒ no arc; intent read precedes the commit it informs; hash after the commit; content after the hash; every subset ordered and never orphaned), an ANTI-DRIFT table running eight presence combinations through `planTask` and `gitArcSteps` demanding `deepEqual` (two copies of an order is an order waiting to drift), deferred `@ref` path tokens passing through UNtouched, `git.commit` asking for the human-staged index with no conditionals; `runGitArc` walks whatever registry it is handed — one §28 gate PER door (never a blanket approval), a denial stops at that door while the grants before it STAND, no checkpoint at all stops at the first door with a stated reason, git answering red is DATA the walk completes on (parity with the plan face), a throwing door stops the walk with git's words preserved, a content door with no live path is SKIPPED with a note while an absent door needs none (capability by absence is the scope's business); v50: a durable walk carries its own §28 receipts (rule, verdict, reason, in ask order), matched by CALL ID so an earlier stage's gate on the SAME tool cannot be pasted on, cloned out of the face so a running process cannot rewrite what it reported, `[]` + `NO_RECEIPTS_NOTE` for a face that keeps no list, `[]` and no note for a walk that gated nothing, and NO field at all when nothing is headed for a ledger  — v75 adds three: the arc’s caveats are read off its own door records (a windowed read floors every tally it reports, a killed read is stated as killed, and the two never merge into one sentence), while a whole walk and a doorless walk earn no note at all, which is what keeps §26’s remembered line byte-identical to v39/v47 |
| `roles.test.ts` (11) | `matchesTool` glob semantics, scope projection exposes/excludes (unknown ≠ denied), child copy can't mutate parent, role register unique + sorted list + ghost role ⇒ empty, researcher-vs-editor write behavior, plan tier follows role capabilities, capability gap fails honestly leaving files untouched; v47: exactly ONE demo role can see a git door (`releaser`) and the arc refuses to run through the `editor` scope; v49: that role's grant is DERIVED from `GIT_ARC_TOOLS`, so the name on a ledger line cannot name a privilege the registry never gave |
| `evaluate.test.ts` (5) | clean run scores 1 with named marks, failures degrade by weight (deterministic), last verify decides, change-economy budget option, append/reload order + corrupt-file reasons |
| `pipeline.test.ts` (8) | v54: the two-role face gets the same durable answer the chain learned in v50 — the stored run line names the rule behind each of ITS two gates (and `results.length > decisions.length`, because reads were never gated), a bare closure stores the one note sentence, and an in-memory pipeline carries NEITHER field; researcher→editor handoff happy path (refs from `fs.index`, editor plans memory-first, score 1), denied checkpoint leaves the handoff real but the run denied, durable mode writes memory+ledger+evaluation JSONL that reload cold, missing research tool ⇒ stated reason (no invented refs), full determinism across identical pipelines |
| `domkit.test.ts` (5) | v16/v20 DOM driver kit: `ui.observe` is read-only and indexed, `click`/`type` are exec-gated (no checkpoint ⇒ nothing happens), approved actions flow through the injected driver and log, out-of-range/wrong-kind targets fail as RESULTS rather than throwing, `findLabel` total + deterministic |
| `vectordb.test.ts` (8) | build sorts + dim-checks, persist→cold reload ranking bit-identical to inline hybridScore + zero-match empty, filterIds + determinism, rejection matrix (bad JSON/version/dim/entries/missing file); v461: the schema version asked directly — the builder stamps the CURRENT constant on every db, the reader accepts exactly that version (a future one refused with its number in the reason), the version is a positive integer, and one constant feeds both halves so the stamped db round-trips at the stamped version |
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
| `testRunner.test.ts` (23) | v28: predicate engine semantics (all-pass detail, VERBATIM failure messages, throw→`threw:` without crashing, name-order + first-registration duplicate wins, empty pack = stated vacuous failure, `only` filter + miss), tool contract (exec-gated without checkpoint, `{ok, detail}` + structured report when granted, unknown `only` errors), lazy file re-read after a write, runTask end-to-end (completed run journals 1 ok report; never-passing predicate → 3 honest reports + `failed_verification`; hosts without the tool keep the field absent), JSONL append/reload with malformed counting + last-N + missing-file empty; v31: the tool AWAITS an async runner with an identical report shape, a REJECTING async runner surfaces as a tool error not a crash, runTask journals async-runner reports like any other; v466: the tool SPECS asked directly — exactly one spec named `test.run`, carrying the EXEC permission (a run is gated like a subprocess even though it spawns none), its only arg the optional `only` filter so a bare call is a full run, the description’s two promises (in-process predicates, structured engine-labelled output) held verbatim, and registration registering exactly that spec |
| `execSandbox.test.ts` (18) | v29: allowlisted argv → inert plan (jail-resolved cwd, rule budgets, `matchedRule`, `executes:false` asserted field-for-field), default-deny refusal quoting the argv, `'*'` as argument wildcard matches but arity is fixed and shell-shaped single tokens still deny, path/separators in the executable refused before matching, malformed requests (non-array/empty/non-string tokens), cwd `..`+absolute+drive-letter refused via `guardedJoin` while missing cwd means the root, env scrubbed to allowlist with dropped names sorted, budgets clamped to policy ceilings, empty allow array denies everything, determinism + plan owns its data (no shared refs), invalid policy refused before the request and `registerExecTools` throws at registration, `exec.plan` callable WITHOUT a checkpoint (read perm) with `executes:false` in the output, refusals succeed as tool calls (`planned:false` + reason), registry `string[]` validation on argv |
| `buildPlanner.test.ts` (21) | `templateBuildPlanner`: catalog validation thrown at CONSTRUCTION (an empty catalog, a duplicate template id, an argv that is empty or holds an empty string), keyword-matched goal selection plus the always-on baseline, and the plan the template's own steps make |
| `deployArc.test.ts` (24) | `planDeployArc` refuses a build arc that did not complete, turns each stdout-bearing step into a fact, freezes inert `deploy.record` steps and names green-but-unmeasured steps rather than summarising them; `runDeployArc` walks the arc the plan describes |
| `codeIndex.sourcePrior.test.ts` (5) | `sourcePrior` boosts real source trees (`src/`, `lib/`) that are not tests, does NOT boost test/spec files even when they live in `src/`, discounts `docs/`/README/`.test.`/`.spec.` basenames anywhere, answers the neutral 1.0 for everything else, and is deterministic for identical inputs |
| `domkit.locate.test.ts` (6) | `locate` returns the exact-match index, falls back to a substring match when no exact match exists, prefers the exact match over an earlier substring one, and answers -1 for a label that appears nowhere; `findLabel` reads what it found |
| `durabilityLineFormat.test.ts` (4) | `formatEvaluationLine` and `formatTestLine` each emit exactly ONE line even when a field carries a raw newline, and round-trip back to the identical record through `loadEvaluations` / `loadTestReports` |
| `planBuildArc.test.ts` (10) | `planBuildArc`'s refusal reasons, thrown rather than returned: a blank/whitespace arcId, a blank/whitespace goal, an arc with no steps, a step with an empty stepId, duplicate stepIds |
| `runBuildArc.test.ts` (6) | `runBuildArc`'s status machine: completes when every step verifies green, stops at the first red verdict and reports failed, reports no-verifier when the registry has no `build.verify` door, denied when the §28 checkpoint refuses the step, invalid-spec when the spec cannot plan |
| `toolSpecs.test.ts` (6) | the one exec door and the one write door (§28): `BUILD_TOOL_SPECS` declares exactly `build.verify` gated by exec and requires `arcId`/`stepId`/`argv`; `DEPLOY_TOOL_SPECS` declares exactly `deploy.record` gated by write and requires `arcId`/`stepId`/`fact` |
| `visualQa.luminance.test.ts` (8) | `relativeLuminance`: 1 for white in both 6- and 3-digit hex, 0 for black, the WCAG channel weights anchored on the pure primaries, 3-digit hex expanded to its doubled 6-digit value, `rgb()`/`rgba()` parsed with the alpha channel ignored |
| `exec-host/execHost.test.ts` (39) | v30 + v48 + v51 (@nexus/exec-host, injected fake spawn — zero real processes in vitest): allowlisted run spawns argv-as-data with the plan cwd/env verbatim, arg tokens never re-tokenized, policy refusal spawns NOTHING even behind an approving checkpoint, no-checkpoint direct call = stated `checkpoint required for exec (§28)`, deny = `planned:true` + `checkpoint denied`, checkpoint asked with an exec ToolCall carrying the plan, output budget hard-caps stdout+stderr total and marks `truncated`, timeout kills marked `killedByBudget` + SIGTERM, ENOENT surfaces as structured `spawnError` not a crash, `exec.run` registry-gated (deny never reaches host; granted → `{ok, detail, result}`; refusal = tool ERROR; nonzero exit = ok:false data with stderr), JSONL journal round-trip with malformed + shape-wrong counting + last-N + missing-file empty. v48 rewrites the budget case and adds four: a cut stream keeps only WHOLE lines (`'ab\ncd\n'` at 6 bytes, where v30 kept the half-line `ef`), a cut that lands mid-FIRST-line yields `''` rather than a fragment, an UNCUT stream still keeps its unterminated final line verbatim (v28/v31's verbatim failure messages depend on it), the drop is per-stream (a stdout that fit is not punished for a stderr that did not), and a multibyte character split across CHUNKS decodes without U+FFFD. v51 adds seven for the host writing its OWN record: four outcomes (deny, §28-required, §28-denied, ran) make four lines with `seq [1,2,3,4]` and `rule [null,0,0,1]` for ONE process, a record is the caller's result plus exactly `seq`+`rule`, no sink means no bytes, v30 lines and v51 lines are compatible in one direction only (stated), three forged lines — a `rule` with `planned:false`, a `seq` that isn't a number, `rule` as a string — are `malformed` for the audit reader while the v30 reader believes all three, a sink that throws fails the CALL on both paths with the run's own exit code in the message, and two hosts on one file repeat `seq` because append order, not the counter, is the record (count corrected to 29 in v53, which rewrote the budget pair and added three: the 6-byte ceiling is now EVERY stream's own — the case that used to prove "starved stderr says nothing" now proves a 4-byte stderr is kept whole with `truncated: false` — write order no longer decides who is heard (9 100 B of stderr against 4 000 B of answer yields byte-identical stdout either way), the host holds at most 2 × the ceiling with each stream trimmed on its own, and a stream cut to NOTHING is a rule of its own rather than silence) — v55 adds seven for the process TREE: the default kill answers `not-attempted` with the reaper never called, a reaper is issued INSTEAD of the kill (`reaped`, ZERO direct kills asserted, because kill-then-reap is measured to reach nobody), a failed or throwing reaper still kills the child it can reach (`reaper-failed`), an adapter with no pid is answered `no-pid` rather than with a pretend success, a run that was never killed carries NO field at all, and `DEFAULT_TREE_REAPER(0)` returns false without throwing — v56 adds two for the PIPE: the host names which stream it cut (in a stable order, absent when nothing was cut rather than an empty list), and `exec.run`'s own sentence says `output truncated: stderr` while the byte-identical stdout beside it is not implicated — an answer that arrived whole is no longer described as doubtful — v86 adds the 39th: the reaper may be ASYNC, so `onEnd` settles the verdict through a promise and a reaped tree is never reported as if no decision had been made (`descendantsStopped` was `undefined` while `descendants` was still in flight) |
| `exec-host/nodeSpawn.test.ts` (6) | v468: the REAL spawn adapter, graded directly — every other case in this package injects a fake spawn, and the default `NODE_SPAWN` had no case of its own; these run against REAL processes (the interpreter running the suite): stdout and stderr arrive on their own streams with exit 0 and no error, the OS pid is surfaced (the handle a tree-kill needs), a nonzero exit arrives as a CODE not an error, an argument carrying shell metacharacters (`;` `&` `|` `$` backtick quotes `<` `>`) arrives as ONE argv token — `shell:false`, nothing re-parsed, the env handed in crosses into the child verbatim, and `kill()` ends a never-ending child promptly |
| `exec-host/containerVerifier.test.ts` (16) | `containerVerifyRunner`: the engine label defaults to `container:<pinned-image>`, a clean exit 0 maps to `ok:true` with a no-truncation detail, a non-zero exit maps to `ok:false` while still reporting the detail, a budget kill is not-ok regardless of exit code, and a spawn/client failure surfaces distinctly |
| `exec-host/containerExec.args.test.ts` (7) | `buildDockerArgs` always leads with `run` and carries every isolation flag, pins the container name / memory (with swap equal) / cpus / pids / tmpfs in order, emits env pairs sorted by key as `--env KEY=VALUE`, places the pinned image immediately before the inner argv with no host mount flag, and threads numeric resource limits straight through (no parsing, no clamping) |
| `exec-host/gitTools.notices.test.ts` (6) | `renamePairNotice` phrases a single pair with singular wording and both names, joins multiple pairs with commas and stays coherent for an empty list (0 pairs); `quotedPathNotice` phrases a single escaped path |
| `exec-host/execTestRunner.test.ts` (17) | v31 (fake spawn, zero real processes): exit 0 → passing report whose engine NAMES the argv, exit 1 + stderr → failure message verbatim, timeout kill → `killed at timeout budget (SIGTERM)` never noise, policy refusal → FAILING report with the stated reason and no spawn, missing `preApproved` → the exact `checkpoint required for exec (§28)` message, `only` miss → vacuous total-0 without paying for a spawn, through `registerTestTools` the granted call states the exec-host engine and an unknown `only` is a tool ERROR, runTask e2e verifies with a real COMMAND and journals the report | v60 rewrites the message builder and adds six: BOTH pipes quoted under their own label, in reader order and identically whatever the write order was (the old `stderr || stdout` pick is recomputed as a DIFFERENT sentence, not just disallowed), a stream the budget cut to NOTHING speaks v48's "no WHOLE line survived the output budget" instead of silence, a stream that SURVIVED its cut is quoted AND named as cut, a budget cut changes no VERDICT (exit 0 + truncated stays green), a killed verify carries v55's `(descendants: …)` and says `no exit code reported` rather than `exit null`, and a refusal is filed under `never-ran` with a `never ran:` sentence while `total` stays 1 — the registry must ANSWER that report, never throw "no test predicate named exit-zero" for a predicate that was in scope — v71 extends the verdict test and adds one case over five report shapes: an exit-zero run whose pipe was cut stays green AND now says which pipe (`["stdout"]`, or `["stderr"]` when the answer survived whole, reader order when both), while a clean run, a vacuous `only`-miss and a §28 refusal carry NO key at all — the field is absent, never an empty list, and that is what lets it survive a cold JSONL replay unchanged — v73 adds one case that kills a never-ending child through the policy’s 20 ms row: the report must then carry `killed` with the host’s own signal/tree/exit-code claims, must NOT carry `truncatedStreams` (a kill is not a cut), and a whole timely run must carry neither key |
| `exec-host/gitTools.test.ts` (101) | v32 (fake spawn): `parseGitStatus` XY→named statuses + counts + rename keeps NEW path + junk XY = `other`; `parseGitDiff` per-file hunk/add/delete tallies with git's name PAIR excluded WHERE git prints it — before the first `@@`, since v64 turned that exception into a position rule and a `+++` line inside a hunk counts as the line it is — and preamble ignored; `parseDiffStat` footer groups / empty / junk→null; policy allows EXACTLY `git status --short`/`git diff`/`git diff --stat` and default-denies push/commit/path-scoped diff; `gitEnv` picks only named vars; tools both exec-permission, no-checkpoint never reaches host (0 spawns), granted `git.status` returns PARSED entries and the spawn env is policy-scrubbed (`TOKEN` never seen), `stat:true` swaps argv, exit 128 is ok:false DATA not a throw, escaping cwd = stated tool ERROR, truncation labeled in detail; v46: the two diffing argv carry `--no-ext-diff --no-textconv`, `gitEnv` additionally EMITS the isolation (config sources pointed at a nonexistent file + the counted forced-config slots), and v32's own flag-free `git diff` shapes are now asserted DEFAULT-DENIED| v52 adds 17, and they are the door-language tests this package never had: EVERY fixture is git 2.52 for Windows speaking for itself (clean tree, dirty-but-unstaged six-liner, index.lock, conflicted merge, corrupt index, hook output, a silent 137, a 132-line usage page), and the assertions are the four cases of ONE rule — a `fatal:`/`error:`/`warning:` line outranks a banner and a status letter, with no prefix the LAST line is the verdict, one line is simply what git said, zero lines says git printed nothing — plus that the quote STATES how many lines it left out, that git tabs are folded, that `unmergedNotice` catches all three exit-0 shapes, and that a successful read carries no refusal sentence at all (v56 adds the budget sentence builder `budgetFlags` — ONE for six doors, naming the pipe — and `stdoutWasCut`, which answers only about the stream a door parses (37 with v53, which added the rule that a door may say "git printed no output at all" ONLY when the budget did not bite: `gitVerdict('', '', { truncated: true })` is `cut`, and its sentence names the budget instead of accusing git of silence — v57 adds four for the porcelain table: all SEVEN unmerged codes (`UU AA DD AU UA DU UD`) classify as `unmerged`, a genuine staged add still reads as `added`, `!!` is still `other`, and the status door names the conflicted path in its own sentence — v61 adds eight for the SHAPE of a name and rewrites one: a rename keeps BOTH names (`path` is what is on disk, `fromPath` what HEAD knows) while a path that merely contains ` -> ` stays ONE path, because only `R` and `C` are pairs, a rename that is ALSO modified in the tree survives as a pair with both halves still quoted together, `unwrapRendering` undoes git’s quoting of an ordinary name and hands a string git ESCAPED over verbatim and MARKED (every character git escapes carries a backslash), a pair keeps both names whether git quoted one half, both, or neither, `parseDiffHeader`/`parseFileLine` correct the split a ` b/` directory stole, `pathShapeNotices` speaks only about what the entries actually carry, and the STATUS DOOR itself now hands on the pair rather than the single name HEAD has never heard of | v62 spoke for porcelain's TWO COLUMNS as TWO trees (`treeSplitNotice`: how many entries a granted commit can reach, how many it cannot, and the `MM`/`AM` shape that is both) — and v63 adds six more for the READ standing behind that ratio: a cut pipe makes the denominator a WINDOW that must say `this door READ`, v62's wholly-staged silence is only true of a complete read, and a window that read nothing stays silent for v48/v52 to answer | v64 adds five for a body line that WEARS a header's shape and two more for the field separator: `--- `/`+++ ` name a file only before the first `@@` (`isDiffHeaderPairLine(line, insideHunk)` — the blanket `!startsWith('+++')` exception is gone, so a whole-file addition tallies its own `++ b/kept.md` content), and an UNQUOTED name line ends at git's TAB, so `+++ b/m b/n.md⇥` is the path `m b/n.md` and a cut that leaves nothing is `null` rather than a name of nothing | v65 adds eight for a prefix the REPOSITORY chose: under `diff.noprefix`/`diff.mnemonicPrefix`/`diff.srcPrefix`/`diff.dstPrefix` git still prints one section per file and `parseDiffHeader` names none of them, so `unnamableDiffSections` counts git’s structural `diff --git` lines and `unnamableSectionsNotice` says those ARE changes this door could not name — while the refusal to guess is kept and MEASURED (a two-character strip returns `ts` for `x.ts x.ts`, a path that exists nowhere, and `bin.dat` for `q/bin.dat b/bin.dat`, right by luck, and nothing in a guessed answer ever says which happened); a section-boundary clause ends the file being read at ANY `diff --git` line so an unread section cannot inflate its tally; `GIT_DIFF_FLAGS` is the four tokens that restore all four keys from the argv; and `git.diff` carries the notice beside a PARTIAL tally (two of the eight are the `it.each` over both renderings; the rest are the census’s semantics, the refuse-vs-guess strip, the boundary rule, the notice wording, the shape-owns-prefixes check and the door case) — v66 adds eight: `diffWindowNotice` says NOTHING for a read that was not cut and for a cut read that named no change; names the read's SUBJECT and the LAST change it reached, and reserves "the cut landed inside it" for a one-section read; `git.diff` qualifies its counts when the pipe it parses was cut while the record keeps the read's own arithmetic, and a whole read is worded EXACTLY as it was before v66; `git.diff` and `git.diff --stat` both refuse the 0-file census on a read their own budget emptied (v48's rule, never wired into this door); the sentence's load-bearing property is checked at EVERY line boundary of a 776-line diff (only the LAST change in a window can be short); and a `--stat` read that holds git's footer holds the whole body, so its tally needs no window clause — v67 rewrites the smuggling case for the wider table: the caller now plants `color.ui` at slot 7 of a SEVEN-key forced table, and the assertion is still v46’s — the COUNT is ours, so git never reads that slot (and `KEY_0` is now `color.status`, which is the shift pinned) — v68 adds three for the family’s sixth door: `logWindowNotice` says NOTHING for a read that was not cut; for a cut read it names the FLOOR, the bound the door ASKED for and the DIRECTION of what is missing, while v66’s hedges (`MAY stop`, `the cut landed inside`) and the word `hunk` are asserted ABSENT — a log line names exactly one commit and cannot be cut mid-entry; and the two notices are pinned as siblings, not one template wearing two wrong halves — v69 adds three and re-guards one pair: `windowField` is pinned on four inputs (nothing cut, the OTHER pipe cut, both cut, the aggregate bit alone), the two diff/status faces are read cut-and-whole to show the record bit appears exactly when the sentence names a window and that an uncut record has NO key at all, and a refusal whose stderr was cut carries `truncated: true` with no `windowed` — the ambiguity v69 ends, spelled out on a record rather than in prose — v74 adds one case that kills a door for real (a never-ending child against a 1 ms budget) and asserts the split in both places: the sentence names the exec host and never says ‘git REFUSED’, the record carries { killed } while ‘windowed’ stays absent (a timeout trims no pipe); plus the two pure helpers |
| `exec-host/gitCommitTool.test.ts` (18) | v35 (fake spawn): `parseCommitOutput` reads `[branch (root-commit)? hash] subject` + stat footer (create-mode lines AFTER the stat), insertions-only, non-echo → null; `gitCommitPolicy` allows EXACTLY `git commit -m <msg>` (incl. a message literally `*` — the v29 `'*'` ARG wildcard, first production wiring) and default-denies bare `git commit`, `-m a b`, `-am`, `--no-verify -m x`, `add`, `push`, `rm -rf /`; blank message throws BEFORE the policy with ZERO spawns; granted commit hands argv verbatim (`['commit','-m',msg]`, multi-line/quoted message intact, env scrubbed) and renders `git.commit → exit 0: master@0a1b2c3 · N file(s) +I −D`; nothing-staged exit 1 is ok:false DATA carrying git's first stderr line; escaping cwd = tool ERROR 0 spawns; a message smuggling `--no-verify -a` stays ONE argv token; v46: this door's argv is untouched — every measured escalation was a command that GENERATES a diff — but its spawn env now comes from `gitEnv()`, and `config-proof.mjs` deliberately does not claim to have tested commit under a hostile config| v52 adds two and rewrites a third: the nothing-staged fixture was ONE invented line, which cannot tell a verdict from a banner — it is now git two-line answer, with the banner asserted ABSENT from the caller sentence; plus the conflicted-merge case (reason on stderr, status letter on stdout) and git printing nothing at all — v70 leaves the count alone and the record richer: the commit door’s cases assert git’s echo parsed into a record, never the key set, so `windowed` sliding onto both branches changes nothing here — which is precisely why the three shapes a cut echo produces (full record / `stat: null` / no `record` at all, HEAD moving in every one) are measured with REAL commits in `commit-echo-proof.mjs` rather than with this harness’s fixtures |
| `exec-host/gitLogTool.test.ts` (20) | v37 (fake spawn): `parseGitLog` reads `<hash> <subject>` lines newest-first (leading-space tolerant), merge subjects kept verbatim, blank lines free, a hashless line is COUNTED (`skipped`) never guessed, empty stdout = honest empty log; `gitLogPolicy` allows EXACTLY `git log --oneline -n <count>` (the wildcard's second production wiring) and default-denies bare `git log`, no `-n`, no count, a trailing ref, `--all`, `git show`, `git commit`, `git push`; `git.log` is exec-permission (a read still spawns) — no checkpoint ⇒ 0 spawns, granted ⇒ default window 10 with argv `['log','--oneline','-n','10']` and scrubbed env, explicit count rides the wildcard token verbatim; junk counts (0, −3, 1.5, >100, NaN) throw the bounded-read-back error with the spawn counter frozen; empty-repo exit 128 is ok:false DATA quoting git's stderr line; escaping cwd = tool ERROR 0 spawns; skipped lines surface in detail as "counted not guessed"; v46: argv unchanged, spawn env now `gitEnv()`-isolated (`GIT_OPTIONAL_LOCKS=0` means even a read leaves `.git/index`'s mtime alone — asserted in the proof, not assumed); v48: the harness takes a `maxOutputBytes` so a budget is a POLICY input, and a 4-byte window in which NO whole line survives now answers `no complete line survived the output budget — this is NOT a statement that the repository has no commits` instead of the honest-sounding `(empty log)`| v52 extends the exit-128 case: an empty `commits` array after a REFUSAL now says so (NOT a statement that the repo has no commits), because a count of what git refused to answer is not a finding about history — v67 adds two cases and six refusal rows: a git DECORATION is indistinguishable from a subject that STARTS like one (so no reader may un-parse it), and one ANSI prefix on the line costs the whole history (`{commits: [], skipped: 3}` over 3 real lines, which the door printed as `0 commit(s)` at exit 0); the refusals now include v37’s OWN `git log --oneline -n 5`, because an unpinned shape lets the repository paint the two fields this door names — the two tokens live in `GIT_LOG_FLAGS` and are spread into BOTH the policy shape and the run argv so the gate and the process cannot diverge — v68 adds three and re-counts one: a cut read floors its own count and keeps every survivor git printed (newest-first, byte for byte), an uncut read is worded EXACTLY as before v68 AND a budget landing on the last line boundary gives the same answer as no budget at all (the rule keys off a cut, not off a small number), a cut that also costs a hashless line floors the count while v37’s `counted not guessed` stands beside it — and v48’s zero-budget case gains the two guards that keep a floor of NOTHING out of it |
| `exec-host/gitShowTool.test.ts` (27) | v42 (fake spawn): `parseShowDiff` yields HEAD's `addedLines` for ONE path (a new file = its whole content), `+++`/`---` are never content WHERE GIT PRINTS THEM — before the first `@@`, since v64 turned that exception into a position rule and a `+++` line inside a hunk is a line HEAD RECORDED, so `path`/`additions`/`deletions` all stay truthful while the added text is kept verbatim — and mode/rename/similarity lines are never content, `\ No newline` skipped, `Binary files … differ` → `binary:true` with no lines claimed, empty stdout = honest empty change; `validateShowPath` accept/refuse matrix (blank, whitespace, newline, leading `-`, absolute incl. `C:\`, any `..` segment); `gitShowPolicy` allows EXACTLY `git show --no-ext-diff --no-textconv --format= -- <path>` (revision pinned BY OMISSION, `--` forces pathspec semantics; v46 unpinned the two no-flags are what keep a `.gitattributes`-named diff driver from EXECUTING its `textconv` command — env pinning cannot reach repo DATA) and default-denies bare `git show`, v42's own flag-free shape, a named rev, `HEAD~9:file` blob syntax, 0/2/3 path tokens, `--textconv` smuggled back on, `git log`/`commit`/`add`; no checkpoint ⇒ 0 spawns, denied ⇒ 0 spawns, granted ⇒ argv `['show','--no-ext-diff','--no-textconv','--format=','--',path]` with the isolated env and the exact detail string; exit 128 is ok:false DATA quoting git's stderr; escaping cwd refused before any spawn; v48: same `maxOutputBytes` harness input, and a starved read of a path HEAD DOES change answers the CUT (`this is NOT a statement that HEAD touched notes/widget.md`) while the `HEAD touches nothing at <path>` sentence stays reserved for an un-cut empty diff| v52 extends the exit-128 case the same way, naming the path: a refusal may not be read as HEAD touching nothing — v61 adds two: a path that arrives as git’s C-QUOTED RENDERING is refused by `validateShowPath` while an ordinary name with a quote inside it stays acceptable, and the same refusal is checked at the DOOR with a counting host, where it costs ZERO spawns (the door that confirms content asks git rather than guessing at it) — v64 adds the pair this door never had: an added line whose OWN text is `++ b/phantom.md` is counted once and surfaced verbatim, and a removed line whose text is `-- a/ghost.ts` is one deletion, both through the same `@@`-anchored position rule the other two readers now share — v66 adds three: a trimmed read floors its own tally and puts the cut INSIDE the one path its argv confines; an uncut read keeps its pre-v66 sentence byte for byte, and a window over ONE change says nothing about the changes before it; every window that named a change floors it, so the census phrasing is unreachable on a cut read
| `exec-host/gitStagedTool.test.ts` (43) | v43 (fake spawn): `parseStagedDiff` reads the INDEX — change KIND from git's own metadata (`new file mode`→added, `deleted file mode`→deleted, `rename from`→renamed with the NEW path, `copy from`→copied, else modified), per-file hunks/additions/deletions/`addedLines`/binary, multi-file tallies, the name pair read by POSITION (v64: `--- `/`+++ ` names a file only before the first `@@`, so a staged line that merely wears that shape stays inside its own file), preamble ignored, `\ No newline` not a line, empty stdout = honest zero changes; `tallyStagedCounts` in canonical order regardless of key order; `gitStagedPolicy` allows EXACTLY `git diff --no-ext-diff --no-textconv --cached` and the same `+ --stat` (v46: a staged diff is still a DIFF, so `[diff] external` in the repo's own config could make this read EXECUTE and answer "0 files" about a real index) and default-denies v43's own flag-free shapes, the unstaged `git diff`, path-scoped and `--name-only` forms, `--ext-diff`/`--textconv` (git EXECUTES a helper), `--output=<file>` (a read that WRITES), `--stat --ext-diff`, `-c diff.external=evil …`, `add`/`commit`/`log`/`show`; `git.staged` is exec-permission — no checkpoint ⇒ 0 spawns, denied ⇒ 0 spawns, granted ⇒ argv `['diff',...GIT_DIFF_FLAGS,'--cached']` (or `+ '--stat'`) with the isolated env, counts/totals/paths and a byte-exact detail; an EMPTY index is spelled out as "nothing is staged, so a granted git.commit right now would have nothing to record"; binary counted with no lines claimed; exit 129 ok:false DATA; escaping cwd and a non-boolean `stat` refused with zero spawns; v48: `maxOutputBytes` harness input again, and a read whose budget killed every line now says `this is NOT a statement that the index has nothing staged for the §28 ask` — because THAT particular absence is the sentence a human weighs before approving a commit, while the `the index is EMPTY — nothing is staged` wording stays reserved for an un-cut empty index| v52 adds three, and one of them is the sharpest finding of the increment: in a CONFLICTED index git exits 0 and prints `* Unmerged path file.md` with no diff, which parses to zero, and this door — v45 puts it one step before the §28 commit ask — used to answer "the index is EMPTY". It now names the notice, the same notice in --stat shape, and a corrupt-index refusal quoting git fatal line — v56 adds the pair that settles v48's hedge: a cut on STDERR leaves "the index is EMPTY" standing and names (stderr), a cut on STDOUT still hedges and names (stdout) — v61 adds four: `rename from` is KEPT (as `fromPath`) and not only believed, an entry that is not a pair carries no `fromPath` key at all rather than an empty one, a path that reaches the door as a C-QUOTED RENDERING is marked as one, and a rename too pure to carry a hunk — which therefore has no `+++` line — is named by its own `rename to`/`copy to` lines, which is also where the stolen ` b/` header split loses — v64 adds three on the OTHER side of that rule: a `+++ b/second.md` that sits INSIDE a hunk stays in `notes.md` and lands in the `addedLines` a human is asked to approve, a `-- a/ghost.ts` is one deletion rather than a pre-image line, and a second `diff --git` section resets the position so its own pair names it and contributes nothing to the tally — v65 adds the two door cases over an index git calls 4 changes and this reader names 0: the answer now reads `… this door named 0 of them … it certainly cannot say the index is empty` (the 0-file branch runs unmerged → unnamable → cut → EMPTY, so EMPTY stays reserved for a read the door could NAME), and the half-named case reports the named file’s OWN `+2 −0` instead of `+5 −1 across 2 hunk(s)`, because an unread section’s `---`/`+++`/`@@` pair and content lines no longer land on the previous path — v66 adds four: a trimmed read calls its own count a floor and names the change that MAY be the short one; a read the budget left alone is worded EXACTLY as it was before v66; a `--stat` read that survived no line refuses to call the index empty while the record keeps git's arithmetic; and the floor is never a lie at ANY line boundary — the changes named are a PREFIX of the whole read, and every cut says AT LEAST; v469: the STAGED CHANGE ORDER asked directly — the five kinds in canonical order, no kind twice (a sentence that counted one kind twice would double-report it), the tally speaks in THIS order whatever order the counts arrive in, and every kind the parser can name is on the list at all
| `exec-host/gitEnvIsolation.test.ts` (14) | v46 (pure data, zero processes): `forcedConfigEnv()` numbers its slots in SORTED key order and `GIT_CONFIG_COUNT` equals the table size (`{}` → `COUNT: '0'`, not an absent key); the five forced keys are exactly the ones measurement found reachable from config (`core.fsmonitor`, `core.excludesFile`, `core.attributesFile`, and since v61 `core.quotePath` — which confines not what git MAY DO but what it may SAY about a filename — plus `status.showUntrackedFiles`) — and `diff.external` is asserted ABSENT, because no inert value exists for it (empty → exit 128, `true`/`false`/`none`/`default` each change the bytes) so the argv shape owns that hole; `GIT_DIFF_FLAGS` carries both no-flags literally; `GIT_ENV_NAMES` is complete through `planExec` (a door planned with `gitEnv()`'s own output loses NOTHING to the scrubber, and an injected `GITHUB_TOKEN` still lands in `droppedEnv`); `existsSync(GIT_ABSENT_CONFIG)` is false — naming a file git cannot open is how the read is told to read nothing; `gitEnv` idempotent and order-stable — v61 rewrites the forced-keys case (a key earns its slot by being MEASURED reachable: a command git would EXECUTE, a blind that hides files, or the shape of a PATH) and adds the orphan-slot check, which v61 had to move one place because `_4` became a legitimate slot: the assertion is now that NO slot exists at or past the COUNT, which is the number git stops reading at — and v65 adds the pair that keeps the two layers from trading a key back: `GIT_DIFF_FLAGS` is pinned to EXACTLY the four tokens, and NO `diff.*` key enters the forced-config table, because the argv outranks `.git/config`, covers keys git has not invented yet, and v46’s own sentence about `diff.external` (“it is confined by the argv shape instead”) is the precedent rather than the exception — v67 re-counts the table rather than quietly widening it: SEVEN sorted slots (`color.status` and `color.ui` now lead, so `core.quotePath` sits at `KEY_5` and `status.showUntrackedFiles` at `KEY_6`), and one new case that states WHERE a color key may live — a `color.*` entry appears in this table ONLY for a command with no color flag, asserted beside the `GIT_DIFF_FLAGS` literal (now five tokens) and `GIT_LOG_FLAGS` (now two) so the two layers cannot trade a key back |
| `exec-host/containerExec.test.ts` (26) | v166 — the SAME `planExec` decision executed one layer out, in an ephemeral container. `planContainerRun`: an allowlisted request plans the inner argv verbatim with the pinned image and a guarded workdir; the docker argv ALWAYS carries the isolation flags and NEVER a mount flag (asserted over the emitted argv, not the intent); env crosses only through the policy allowlist as `--env` pairs and is scrubbed otherwise; a request cannot choose an image, widen a budget or leave the workdir root; the pin, the root and the cap ranges are validated BEFORE anything plans; budgets clamp to the policy caps a request cannot raise; two plans in one process get DISTINCT container names, so a cleanup can target the right one. `createContainerExecHost`: an approved run spawns `docker` with the plan argv and the CLIENT env — not the container env; a policy refusal spawns NOTHING even behind an approving checkpoint (policy outranks §28); §28 is enforced at the host (no gate ⇒ refusal, deny ⇒ denial, the gate sees a `container.exec` ToolCall); a probe that says unavailable refuses LEGIBLY before any spawn; a timeout kills the client child AND retires the container BY NAME, with cleanup reported rather than assumed; a cleanup the runtime refuses is REPORTED and never upgraded into a claim of removal; the v48/v53 whole-line output discipline survives the container hop; and an ENOENT/daemon-down client failure is structured data rather than a crash. Through the gated registry: `container.exec` is exec-permission (no checkpoint ⇒ the tool never reaches the host), a grant + exit 0 answers `{ok, detail}` naming the image and the exit, env arrives as KEY=VALUE pairs and is STILL scrubbed, a policy refusal surfaces as a tool ERROR rather than a silent success, a nonzero exit is `ok:false` without throwing, and a host built on an invalid policy cannot register at all — the check reads a COPY, never the shared fixture. `probeContainerRuntime` answers the honest question (is there a daemon here?): a version line ⇒ available and trimmed; a nonzero exit, a spawn failure and a timeout are each STATED unavailability. The journal follows the v51 discipline container-shaped: append → reload round-trips, malformed and invariant-breaking lines are counted and never trusted, the old reader shape still parses (one-directional compatibility) while garbage is malformed, a host with no journal writes nothing, last-N keeps the tail, and a missing file reads empty. |
| `durability.test.ts` (14) | memory serialize/deserialize round-trip + version/schema rejection, `restore()` id high-water mark, save/load through an injected writable fake disk, corrupt-file honest failure, `guardedJoin` jail (absolute/`..`/drive-letter rejection, backslash folding), `disk.write` checkpoint gate + escape touches nothing, `disk.read`/`disk.list` confinement; v460: the two constants asked directly — the writer stamps the CURRENT version and the reader accepts exactly that one (a future version refused with its number in the reason), the version is a positive integer, the three disk tool specs in order, only `disk.write` carries the write permission (the read paths cannot mutate the disk), args declared honestly (required named, the optional `prefix` not claimed), and registration registers exactly the specs in the list — the registry’s own listing is the proof |
| `indexStore.test.ts` (17) | index snapshot serialize→deserialize verbatim + version/chunk schema rejection, save/load via injected fs, cold rescan equals `buildIndex`, unchanged files reuse chunks / edits rechunk exactly the changed paths / removals drop out, query ranking snapshot-independent; v5 provider: cold-first-build equals plain build, incremental refresh 0 re-chunked, edited file sole re-chunk, cross-provider snapshot restore, corrupt-snapshot fallback + repair, `fs.index` provider/default parity — plus, named by v90's recount rather than by its number, a heading-less markdown chunk that survives the snapshot and one round trip through a DISK (the proof path, not the in-memory one); v462: the schema version asked directly — the writer stamps the CURRENT constant on every snapshot, the reader accepts exactly that version (a future one refused with its number in the reason), the version is a positive integer, and the stamped snapshot round-trips at the stamped version |
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

## Prefix proof (`prefix-proof.mjs`, M2 v65 — the repository chose the prefix every reader strips)

52nd tracked proof (53rd script). Four doors read a unified diff, and one fact decides whether any of them can
NAME a file in it: git's own `a/`/`b/` on the `diff --git` line. v32 through v64 read those prefixes as a
given. They are a repository setting — `diff.noprefix`, `diff.mnemonicPrefix`, `diff.srcPrefix`,
`diff.dstPrefix` — and this proof sets each of them in one throwaway repo with a four-change index (an add, a
modify, a rename to a path containing a space, a delete), where `git diff --no-ext-diff --no-textconv --cached`
still exits 0, still prints FOUR sections, still carries every hunk, and `parseStagedDiff` returns ZERO files.

§0 measures git against git (`--shortstat`, `--numstat -z` name 4 changes where the header matcher names 0) and
TRANSCRIBES the pre-v65 0-file branch, so the sentence `the index is EMPTY — nothing is staged, so a granted
git.commit right now would have nothing to record` about that index is pinned in this file even after the source
stops containing it. §1 runs today's door over the same repository twice — once through a spawn stand-in that
drops v65's two prefix flags on the way to git (a door cannot be asked to run a shape its own policy no longer
names, and hand-writing the argv there would be this file's claim, not the door's), once shipped. The first
answers `git printed 4 diff section(s) whose header this door cannot split into two names (…) · this door named 0
of them … it certainly cannot say the index is empty`; the second names all four paths, per-file numbers equal to
git's `-z` census. §2 is the cross-check that makes the old bug a reviewer's problem too: the `--stat` face never
needed a prefix, so over the same bytes it always said 4 files — and the worktree door is shown naming 0 of 1
section on the same config. §3 drives `diff.noprefix=true` AND `diff.srcPrefix=zz/` together (the headers do not
move) beside `git.show`, which never depended on them. §4 hashes both argv shapes over four reads (`--cached`,
the worktree, `--stat`, `show`) in a repository that sets nothing: byte-identical, so the fix costs the common
case nothing measurable. §5 splices an unprefixed section onto a named file and asserts the reader counts the
sections while the unnamable one adds no line to any tally. §6 counts the wiring instead of trusting prose — one
boundary clause in each diff reader, both prefix flags on every shipped diff shape, each of them still allowed by
`planExec` — then walks a `c/`/`i/` mnemonic rendering through the shipped door. §7: this repository's HEAD
unchanged byte-for-byte after exactly seven door spawns, writes inside `os.tmpdir` only.

What v65 did NOT do, stated rather than smoothed over: the census only sees `diff --git`, so a rendering that
prints no such line stays outside it — a conflicted index is exactly that case and is answered first (v52),
giving the order unmerged → unnamable → cut → EMPTY; `--combined`/`cc` output would be another and no shipped
shape can ask for it. `diff.relative` and `diff.renameLimit` can change WHICH sections git prints (a rename
reported as a delete plus an add) without touching naming — recorded as a candidate, not measured as a case.
`git.show`'s immunity is measured for these four keys only, and its `path` still comes in from the caller.

## Cut-tally proof (`cut-tally-proof.mjs`, M2 v66 — a cut DIFF tally is a WINDOW claim too)

53rd tracked proof (54th script). v63 gave `git.status` the rule that a read the budget CUT can only support a
claim about the window it read, and left it there. This proof measures the three doors that read a DIFF instead,
in a throwaway repo whose index holds 25 changes — git's own footer `25 files changed, 75 insertions(+),
75 deletions(-)` — at budgets DERIVED from git's byte offsets rather than chosen to flatter the fix.

§1 is the control: git's census, then five WHOLE reads through the shipped doors, each asserted byte-identical
to the sentence it had before v66 and clause-free — a rule that leaks into an uncut answer has made the common
case worse to read. §2 is the finding itself, said by real git at two budgets over the same bytes: at
`sectionStart(staged, 8)` = 8696 the door answers `index holds AT LEAST 8 change(s)`, and EVERY change that
window names is whole — git's own `--numstat` grades the claim line by line — because the cut fell exactly at a
section boundary; 900 bytes later the 9th change has arrived and is short. §2 also prints the sentence v66
replaced, rebuilt from the door's own bytes with its clauses removed: `git.staged → exit 0: index holds 8
change(s): 8 modified · +24 −24 across 24 hunk(s)` — the wording quoted in the source comment, measured here
rather than remembered. That two-sided measurement is why a multi-section door says the last change it
reached MAY be the cut one, and reserves "the cut landed inside" for `git.show`, whose argv confines the read to
one path. §3 sweeps the whole population: 774 of that index read's 776 line boundaries are cuts, and every one
of them is driven — asserting each windows floors its own count, none speaks as a census, none breaks the
prefix rule (v48), none claims a whole change that
git's census contradicts, and none names a path git never printed (0 of the 774 named no change, so all 774
would have been a census before v66). §3a is what makes a 774-call sweep honest
rather than merely fast: the windows are produced by replaying git's RECORDED bytes through the shipped host,
so 12 budgets are also driven for real and compared byte-for-byte with the replay — in the `detail` string and
in the parsed file list. §4 grades `git.show`'s 67 line boundaries against git's own `60 0` for that path: 65
of them are cuts, 59 of those short-count, 60 carry the floor, 5 refuse to state a count at all, and none
phrases a census — the classification is exhaustive (`floored + refused === cuts`), so no window sits
uncounted, including the tight ones that must refuse rather than say HEAD touched nothing. §5 does the same for `git.diff`'s 51 windows,
with the sentence this door never had: `AT LEAST 1 files, +0 −0` where v65 said `1 files, +0 −0` about a file
git counts at +1 −1, and a refusal instead of `0 files` once nothing survives. §6 measures the OTHER face and
draws the line: both `--stat` reads are immune to short-counting because git's footer is its LAST line — over
every line boundary of the two stat bodies (27 and 6 lines) exactly 2 and 2 windows parse a footer, and none of
the four is missing any part of the read — so no window clause lands there, and their real hole was the zero.
§7 closes the loop the sentences point at: the same repository committed through the granted commit door
records 25 paths, where the window in §2 named 8 — the assertion is the numeric relation between a floor and a
census, not one string about another — and an index that IS empty afterwards is still stated as empty, because
v66 only speaks where the pipe was cut. §8 compares this repository's HEAD byte-wise after 28 door spawns, every
write inside `os.tmpdir()`.

What v66 did NOT do, stated rather than smoothed over: the rule lives in the SENTENCE, not in the record. A
door's structured output still prints `truncated: true` without `truncatedStreams`, so a reader that consumes
`totals` and skips `detail` can still take a window for a census — that is the sharpest gap left and the next
candidate. The numbers inside the notice are this door's parse of the surviving bytes, so they inherit v64's
bound (a body line wearing a header's shape) and v65's (a prefix the repository chose); the notices are
siblings, not substitutes. `diff.relative` would narrow `git.diff`'s "working tree" without any case here
measuring it. And nothing here changes what git is asked to do or how many bytes come back: a door with budget
to spare still reads the whole pipe, still says nothing about a cut it did not make, and still gets git's
arithmetic — only the phrasing now matches the read.

## Color proof (`color-proof.mjs`, M2 v67 — the repository paints the bytes every parser reads)

54th tracked proof (55th script). v46 confined what a git command may DO and v65 what it may PRINT about a
path's PREFIX; both stopped one line short of the question this proof asks — can the BYTES every parser reads be
painted by the repository being read? They can, and every false answer below arrived at exit 0. §1 measures git's
own bytes in a throwaway repo with `color.ui/status/diff = always` and `log.decorate = short`, once with v67's pin
removed and once re-applied: `git.status` 4 escape sequences, `git.staged` 19 (the `diff --git` line itself starts
with one), its `--stat` face 2, `git.log` 26 across 3 lines, `git.show` 19 — and 0 on all five with the pins, each
read asserted non-empty so a zero is a fix rather than a vacuity. §1 then measures WHICH LAYER can reach which
command, because that decides where the fix belongs: `git status` and `git commit` each refuse BOTH `--no-color`
and `--color=never` with exit 129 (four refusals asserted), `diff`/`log`/`show` take `--no-color` at exit 0, and a
forced `color.ui=false` does NOT beat a repository that named the colorspace itself — `color.status=always` still
paints 4 places under the umbrella key alone, which is why `color.status` is load-bearing and `color.ui` is stated
as the umbrella instead of claimed as a fix.

§2 drives the SHIPPED doors over that same repository and grades the sentences they are allowed to say:
`git.status` counts 2 entries with git's own two-character XY columns (`' M' notes/plain.md`, `'M ' src/base.ts`)
rather than `[31mM` wearing them, `git.staged` finds the 1 change the index holds instead of answering
`the index is EMPTY`, its `--stat` face says `index holds 1 file(s) · +1 −0`, `git.log` reads 3 commits instead of
`0 commit(s)`, `git.show` still names `HEAD changed src/base.ts` and keeps its one added line — and a final sweep
asserts NO door record from any of the five holds an escape byte at all.

§3 locates the harm rather than asserting the fix: §1's recorded UNPINNED bytes are replayed through the shipped
parsers, which is where the four false absences get their numbers — `parseGitStatus` classifies both painted
entries as `other`, `parseGitLog` returns `{commits: [], skipped: 3}` because the escapes ate the hash pattern on
all three lines, `parseGitDiff` returns zero sections, and `parseShowDiff` reads HEAD's painted
`+export const staged = 3;` as no addition at all and hands back nothing (beside it, the same door pinned hands
back the one line). To keep those from being this proof's arithmetic, the 0-file count is CALIBRATED against the
door sentence for an index that really is empty (`git reset` first, so the sentence is quoted from a live door),
and two rows are honest about what paint does NOT break: the `--stat` bar IS painted (`1 ESC[32m+ESC[m`) yet
`parseDiffStat` reads git's NUMBER column, so painted and pinned parses are deep-equal; and no ref decoration
reaches `git show --format=`, because an empty format prints no subject — which is why that door gained one flag
and not two.

§4 separates the two colorspaces git does not conflate: `--no-color` removes all 26 escapes and leaves every ref
in place (`(HEAD -> main, tag: v1.0, feature)` still sitting inside the subject field), while `--no-decorate`
removes the refs. It then checks each subject the door reports against git's own `--format=%s` — a format that has
never had room for a ref — byte for byte, 3/3. The fixture commits a title that STARTS with what a decoration
looks like, and §4 asserts BOTH directions: with the door shape on, the output still contains the string
`(HEAD -> main)` (as the title git was handed) while `tag:` appears nowhere (every ref git added is gone). That row
is the reason the fix is a pin and not a strip: a reader that deleted "decoration-shaped" text would have deleted
a real commit subject here, and nothing in the field tells the two apart.

§5 measures the write door's face — `git commit` with an empty index prints 4 escapes in its advice block under
the unpinned env and 0 under the pins, at the same line count — and notes the honest bound: the LAST line, the one
`gitVerdict` reads, is plain in BOTH faces, so this pin covers the block rather than the verdict line the doors
quote. §6 removes the config and proves the pins cost nothing: for all five faces the pinned argv and the old one
return byte-IDENTICAL output in a repository that asks for neither color nor decoration (33 / 272 / 51 / 114 / 284
bytes), each non-empty so the equality is measured rather than vacuous — which is what keeps the 53 previously
tracked proofs green. §7 pins the data: `GIT_DIFF_FLAGS` is the five tokens, `GIT_LOG_FLAGS` the two, exactly two
`color.*` keys sit in `GIT_FORCED_CONFIG` and `color.diff` is asserted ABSENT from it (the argv owns that face, and
v65's rule says which layer wins); 5 pinned shapes across the four git doors stay allowed while 6 old ones — v37's
own `git log --oneline -n 5` and v42's own `git show --no-ext-diff --no-textconv --format= -- <path>` among them —
now default-deny, because an unpinned read lets the repository paint the fields. §8 compares this repository's HEAD
byte-wise after 9 door reads and asserts the read count equals the spawn count, so no "door read" in the sections
above can have been a replay.

What v67 did NOT do, stated rather than smoothed over: the pins cover the five doors whose bytes get parsed
(`git.status`, `git.diff`, `git.staged`, `git.show`, `git.log`) plus the umbrella `color.ui`, and §1 shows
`color.ui=false` losing to a repo that names the colorspace itself, so it is deliberately NOT claimed to fix any
face the proof does not measure. `color.branch`, `color.interactive` and
`color.grep` reach no door here. A door's structured record still holds whatever its parser returned, so a future
reader must not treat an unpinned argv as safe — that is exactly the widening §7 keeps refused. The
`NO_COLOR`/`TERM`/`GIT_TERMINAL_PROMPT` environment hypotheses are not relied on anywhere: this fix does not assume
the environment is kind, it names the key. Nothing here changes what git is ASKED to do beyond three tokens on two
argv shapes, and DEMO MODE is unaffected (no Studio surface runs an exec host); staging stays a human act and
`git push` stays out of scope (§28, §9).

## Log-window proof (`log-window-proof.mjs`, M2 v68 — a log's count is a floor, its newest entry is not)

55th tracked proof (56th script). v66 put `AT LEAST` on the three doors that read a DIFF and left the door
that reads a LOG saying `N commit(s)` — the same §28-facing species of sentence, in the door the plan's
CONFIRM step (v37/v38) uses to check its own commit. §1 measures the premise with git's own words: a
throwaway repo whose `rev-list --count HEAD` is 25 prints 25 `--oneline` lines / 1653 bytes for the ask this
proof replays.

§2 drives the shipped door at two budgets derived from those byte offsets, not chosen to flatter the fix: at
`budgetOf(8)` the answer is `AT LEAST 8 commit(s) · newest e1258d7 "…" · the count is a FLOOR over the read,
not a census of the history: git printed more on that pipe, and on a newest-first log what never arrived is
OLDER than every entry named here (this door asked for 25) · output truncated at budget (stdout)`, and the
census phrasing is asserted UNREACHABLE (`: 8 commit(s)` may not appear); at `budgetOf(1)` one line is still
not a census of a 25-commit history, and the survivors are asserted to be git's own lines in git's own order.

§3 is the population: all 24 whole-line cut budgets, each driven through a real git (the proof's spawn count
is pinned equal to its door-read count, so nothing here is a replay), and five numbers reported —
24 floored, 0 census-shaped, 0 losing the newest entry, 0 whose survivors disagree with git's own lines,
0 overcounting the repository. §3 also rebuilds the PRE-v68 sentence from every window's own bytes (strip
v68's clause and the `AT LEAST` and the string starts `git.log → exit 0: N commit(s)`), so "all 24 were
censuses before" is measured in this file rather than remembered from the probe that found the bug.

§4 is the two-sided heart, with a real commit. The human stages, §28 grants `git.commit`, and git's own count
goes to 26. Read back through budgets that keep 1, 2 and 5 lines, the door's NEWEST entry is byte-equal to the
commit record's hash in all three — v37's equality, the claim the door exists for — while the SAME reads
report 1, 2 and 5 commits against a census of 26, each floored. One sentence, two claims pointing in opposite
directions, both true: that is what a log window is, and it is why v66's hedge could not simply be pasted
here.

§5 keeps v48's case intact: a 4-byte budget answers `no complete line survived the output budget — this is NOT
a statement that the repository has no commits`, with two negative guards — no `AT LEAST` (a floor of nothing
is not a floor of a count) and no `OLDER than every entry` (nothing is named to be older than). §6 shows the
rule keys off a CUT and not off a small number: the unbounded read and a budget landing exactly on the LAST
line boundary return byte-IDENTICAL sentences, both with `truncated: false`, and neither mentions a floor. §7
keeps the two notices siblings rather than one template — `diffWindowNotice` hedges (`MAY stop`, a section can
be cut mid-body) and `logWindowNotice` never does, and never says `hunk` — because a hedge about a shortened
commit entry would itself be a false statement. §8 compares this repository's HEAD byte-wise after 34 door
spawns, every write inside `os.tmpdir()`.

What v68 did NOT do: the rule is still in the SENTENCE. v66's sharpest named gap — a door's structured record
carries `truncated: true` and nothing that says its counts are floors — is untouched, and `git.status`'s
`N entries (M modified)` remains the family's other word-only case. `asked` is what this door requested, never
what the repository holds; the door cannot know how many commits git printed into a pipe it did not finish
reading. And `skipped` (v37's counted-not-guessed lines) is, like the floor, a count of surviving bytes.

## Record-window proof (`record-window-proof.mjs`, M2 v69 — the sentence and the record must answer one question)

56th tracked proof (57th script). Seven amendments made a door SAY that a number is a count of what it read
(v48 `cutNotAbsence`, v52 `refusedNotAbsence`, v56 `budgetFlags`, v63 `treeSplitNotice`, v65
`unnamableSectionsNotice`, v66 `diffWindowNotice`, v68 `logWindowNotice`) — and all seven write into `detail`.
The structured record still carried only v30's single `truncated` bit, which is about TWO pipes. This proof
moves the claim into the record and then shows the two layers answer different questions.

§1 measures the premise honestly, against this increment's own story: eight real git reads at exit 0
(`status --short`, `diff`, `diff --cached`, its `--stat` face, `log --oneline`, `show --format= -- path`,
`rev-parse`, `ls-files`) carry **0 bytes on stderr in 8 of 8**, so nothing here claims a git door ever muted a
number with bytes on the other pipe. What is fixed is that the host computed `truncatedStreams`, every door READ
it to write its clause, and then dropped it before handing the record on.

§2 is the coupling, door by door: all seven faces (status, diff, diff `--stat`, staged, staged `--stat`, log,
show) are read twice — once with budget to spare, once at a budget derived from git's own row bytes (98 B over a
40-change index, 3 of 40 porcelain rows). Both directions are asserted on the SAME read: an uncut record has no
`windowed` key and its sentence names no window; a cut record carries the key and its sentence carries one of the
family's markers (`no complete line survived` | `output truncated (pipe)` | `the read was CUT` | `AT LEAST` |
notice). 14 reads, agreement `YES` on every one — printed as a table so a future reader sees which face taught
what. It also asserts `'truncatedStreams' in record === false`: the door hands on the CONCLUSION, not a list a
consumer would have to re-derive the rule from (v51/v54's one-source argument, running the other way).

§3 proves the aggregate bit is a different question, with a real process rather than by argument: a stand-in
program through the confined host at a 512-byte ceiling writes 28 bytes of answer to stdout and 9 000 of noise to
stderr, and comes back `truncated: true`, `truncatedStreams: ["stderr"]`, `exit 0`, stdout **whole — 28 of 28
bytes**. A consumer holding only `truncated` would floor numbers that need no flooring; `windowField` on that
same result returns `{}`.

§4 closes the cost question structurally: strip `windowed` from a cut record and its key set is EXACTLY the uncut
record's — one key added, none moved, none renamed, on all seven faces. §5 compares this repository's HEAD
byte-wise after 29 processes and asserts the spawn count equals its own door-read count, so no window above was a
replay. The fixture had to grow before §2 could measure anything — a log door with one commit and a show door on a
path HEAD never touched both answer in bytes that fit any budget, and the first run of this proof said so by
failing on `windowed` — so the repository now carries 8 more commits and a 40-line HEAD change for that path.

What v69 did NOT do: `windowed` says the parsed pipe lost bytes, not how many — a reader can know there is a
window and still cannot size it. It is absent on a killed read (`killedByBudget` fails `ok` before any count is
spoken — v63's finding, kept). `truncated` still means what v30 made it mean, and the two are not
interchangeable, which is the whole point. `git.commit`'s record was left alone on purpose: its numbers come from
git's own commit echo, policed in prose by v48/v52, and extending the key there is queued rather than claimed.
`execTestRunner`'s report still carries neither v55's nor v56's facts, and a chain's stage-level calls still live
on no record (#117). No argv, env pin, budget, policy shape or gate moved, so no witness proof needed a re-count
and the other 55 tracked proofs are this increment's "nothing else moved" assertion. DEMO MODE is unaffected;
staging stays a human act and `git push` stays out of scope (§28, §9).

## Commit-echo proof (`commit-echo-proof.mjs`, M2 v70 — a budget trims what the door heard, not what git did)

57th tracked proof (58th script). v69 handed the window claim to every door that PARSES and named
`git.commit` as the deliberate exception. §1 of the probe that opened this increment
(`.scratch/v70-commit-echo-probe.mjs`) shows the exception is not cosmetic: git's commit echo is TWO lines
(`[main 2fd0f2f] <subject>`, then the stat footer), so a budget can keep the header and lose the footer —
`record.stat` becomes `null` — or lose both, and then the door's record has **no `record` at all** while HEAD
moved, because committing already happened.

§1 measures the control with real git: 40 staged files, a generous budget, then 600 bytes — both answer
`git.commit → exit 0: main@… · 40 file(s) +40 −40` with a full record and **no** `windowed` key, which is what
establishes the echo's actual size (both reads are whole, so the cut shapes are not a matter of degree). §2
drives the two derived boundaries — one byte past the header line (121 B) and twenty bytes short of it (100 B) —
and checks each against git outside the sandbox: HEAD moved, `rev-list --count` grew by exactly one,
`record.hash` equals the new HEAD's abbreviation and `record.subject` is the message verbatim; at 121 B the
record is present with `stat: null` and `windowed: true`, at 100 B `record` is absent and `windowed: true`
still tells a reader which of the two spoke. §3 asserts the door never implies a refusal there — no
`REFUSED` wording, v52's `refusedNotAbsence` stays reserved for git actually refusing — while its sentence does
name the pipe. §4 round-trips all three shapes through the JSON the ledger is built from and shows the key
survives into a cold read, nested record and null stat included. §5 compares this repository's HEAD byte-wise
after 9 granted real commits and pins `spawns === doorReads`, so every shape above cost a git process.

Fix size: one key, on both of the door's records (`windowField`, present only when THIS door's pipe was cut,
absent rather than false). No argv, policy, budget, gate or parser changed, so no witness proof needed a
re-count and exec-host's 271 tests are untouched — the shapes that matter here can only be measured against
git's real echo, which is exactly what a hand-written fixture gets quietly wrong (v46's and v60's lesson).

What it does NOT do: the door still cannot confirm its own commit. `git rev-parse HEAD` would be a second
command, and this policy allows exactly one argv shape (`git commit -m *`) — the door would have to be given a
power to be able to check itself, so it reports what survived of git's echo and says which pipe was cut
instead. An absent `record` is also what git produces for a commit that printed nothing at all, and the key
does not separate those two; the sentence does (`stated, not guessed` beside `output truncated at budget
(stdout)`). And a cold reader that ignores `windowed` still sees only `ok`/`exitCode`/`record` — the ledger's
validators check record KINDS, not door keys, so nothing here is enforced downstream yet.

## Report-window proof (`report-window-proof.mjs`, M2 v71 — the verdict is the command's, the evidence is the pipe's)

58th tracked proof (59th script). v69 moved the window claim from door sentences into door records and v70
finished the write door; this is the same defect one layer up, in the artefact the Studio chips render, the
ledger journals and the commit-after-green gate consults: `TestReport` carried
`engine/ok/total/passed/failures/detail` only, so a reader of `passed/total` could see `1/1 ✓` while the answer
it had not seen was 2 500 bytes of stdout trimmed to 2 000.

§1 measures four shapes with REAL programs at a 512-byte ceiling, because "exit 0 with a cut pipe" is exactly
the case a fake spawn can state and a real process must show: 4 000 bytes on stdout then exit 0 →
`ok: true` and `truncatedStreams: ["stdout"]`; 4 000 bytes of noise on stderr beside an answer that FITS →
`ok: true` and `["stderr"]`, the answer whole (only v53's per-stream ceiling makes this shape reachable at all);
both pipes cut and exit 1 → `["stdout","stderr"]` in reader order, not arrival order; a quiet program at a
generous ceiling → **no key at all**. §2 writes two reports through `appendTestReport` and reads them back cold:
the list survives the JSONL, and so does its ABSENCE — which is why the field is absent rather than empty, so a
replayed report never grows an empty list a reader has to interpret. §3 pins the three shapes that must carry
nothing: a vacuous `only` miss (nothing ran), a §28 refusal (filed under v60's `never-ran`, no pipe opened), and
a clean run — because a key that also appears when nothing was cut tells a consumer nothing.

The verdict itself is deliberately untouched: `ok` is the command's own exit code (v31's rule), an exit-zero
suite that overflowed its pipe is still green, and the proof asserts that agreement rather than arguing it —
`verdicts changed by a cut: 0`. §4 states the boundary instead of inflating it: v60 measured the one wired suite
command (design-model vitest) at 592 B stdout / 0 B stderr against a 2 000 B per-stream ceiling, so this hazard
is LATENT in the bridge and not a mislabel some shipped suite ever made; this file does not re-run that suite.

Cost: `TestReport.truncatedStreams?: Array<'stdout'|'stderr'>`, copied by the bridge from the list v56 already
computes — no new predicate, no second source. exec-host **272/272** (one extended case, one new case covering
all five report shapes); the runtime field is optional so `predicateRunner`, in-process hosts and the Studio chips
are unaffected, and no tracked proof asserted a report's key set (they use `toMatchObject`/array `deepEqual`s),
which is why 57 proofs swept green untouched. What v71 does NOT do: nothing DISPLAYS the field yet (the dock chip
still prints `passed/total` — browser-facing surface work belongs to the lane that owns `AgentPanel`),
`descendantsStopped` still reaches a report only in prose, and a consumer that reads the tool's top-level
`ok`/`detail` still bypasses every field this family has produced.

## Report-kill proof (`report-kill-proof.mjs`, M2 v73 — a kill is not a cut)

59th tracked proof (60th script). v55 established that `killedByBudget` is a claim about ONE process and
gave the host `descendantsStopped` to state what became of the rest of the tree (measured then: a detached
child kept writing 7 heartbeats after the host reported the kill). v60 put both in a verification report's
SENTENCE. §1 here measures what the report's STRUCTURE said before v73 — nothing at all:
`detail, engine, failures, ok, passed, total`, with the signal, the tree and the missing exit code surviving
only inside prose (`.scratch/v73-kill-report-probe.mjs`).

So `TestReport` gains `killed?: { signal, descendantsStopped, exitCode }`, filled only when the budget killed
the run, in the host's own words, absent rather than zeroed. The runtime deliberately does not restate v55's
five-label union as a type — it cannot import exec-host, and a second copy of that list is a second source
that can drift; the proof pins a real value instead.

§1 kills a real hanging parent that leaves a detached child and cross-checks the record against the OS: the
child wrote **8** more heartbeats after `killed`, so the field is not decoration. §2 keeps the axes apart — a
cut run carries `truncatedStreams: ["stdout"]` and no `killed`, a clean run carries neither, and neither
field ever stands in for the other. §3 round-trips the killed report through the ledger's JSONL: the nested
object returns intact including its `null` exit code, while the clean report still has no key. §4 is the
honesty check on the field itself: with `reapTree` ON it reads `reaped` and the signal is `null` (taskkill
replaced the kill — v55's ordering finding), so the value tracks what was attempted rather than the option
that was set. §5 compares this repository's HEAD byte-wise.

Bounds: the bridge reports what the host said, not what the machine did — the child's heartbeat file is
measured here precisely so that gap is visible rather than papered over; `signal: null` on the reaper path
looks odd beside `'SIGTERM'` and is what was observed; nothing DISPLAYS `killed` yet (v72 did that for the
pipes, and a failed verification is already red), so this field serves a cold reader of the ledger; and
`descendantsStopped: 'not-attempted'` is a statement that the DEFAULT host leaves a tree running — stopping
it remains the caller's `reapTree` choice, unchanged by v73.

## Door-kill proof (`door-kill-proof.mjs`, M2 v74 — "git REFUSED" was the wrong speaker)

60th tracked proof (61st script). Before v74, a door whose read the host killed said git refused it.
Measured over a 300-file repository with a 1 ms budget: **5 of 5 git doors** answered
`… · git REFUSED this command — this is NOT a statement that …` while also reporting `exit null` — git was
still running; the ceiling was ours. v52 built `refusedNotAbsence` for git declining and v53 built the `cut`
rule so an emptied pipe is never called git's silence; the kill had been wearing the refusal's clothes.

The fix is a clause and a field, both selected by `killedByBudget`: `killedNotRefusal(...)` says the exec host
killed the read and git refused nothing, and `killedField(result)` carries v73's
`{ signal, descendantsStopped }` into the record — absent, never empty.

§1 kills each of the five faces for real and asserts all four consequences at once: the record holds the kill
(all five `{"signal":"SIGTERM","descendantsStopped":"not-attempted"}`), the sentence names the host,
`git REFUSED` appears nowhere, and `windowed` stays away — a timeout trims no pipe, which is the axis
v69/v73 opened and this proof keeps apart. §2 is the mirror that makes the split mean something:
`git.staged` outside a repository, v52's own case, exits **129** under a 126-line usage page and must still be
attributed to git — the door says `git REFUSED this command` and carries no `killed`. §3 adds the pure rule and
the same door over the same repository on a generous budget, answering normally with neither marker, so
whole / cut / killed / refused are separated by data rather than by phrasing.

Bounds kept: `not-attempted` in every §1 case is the reaper being off by default — the marker attests the
process the host started, not the tree (v55, and v73 §4 where `reapTree` flips it to `reaped`); a kill that
also trimmed a pipe would carry both keys and neither substitutes for the other; the commit door's refusal
branch is deliberately untouched, because a killed `git commit` is the v70 asymmetry (it may have committed
while its echo was lost) and `killedNotRefusal` would be the wrong sentence there; and nothing DISPLAYS the
kill marker yet — a killed verification is already red, so this serves the reviewer of the sentence and the
reader of the record. exec-host **274/274**, 59 previously tracked proofs untouched, no argv/policy/gate change.

## Memory caveats — a remembered victory keeps its asterisk (M2 v75, headless)

v69–v74 moved the window claim from door sentences into door records (`windowed`) and separated a kill from a
cut (`killed`); v72 put the pipes on the chip a human reads. v75 closes the last place the distinction could
still be erased: §26 memory, which stores PROSE a later run reads back. `runGitArc` now folds
`arcReadCaveats(arc)` into its `notes` at both endings, so a walk whose index read was cut is remembered as
`… (every tally in this arc is a FLOOR — the read was cut (git.staged))`, and a walk whose confirm the host
killed says so too — while a walk that lost nothing earns no note and keeps the v39/v47 line byte for byte
(`chain.test.ts` compares whole summaries with `toEqual`, untouched).

Evidence is headless: `gitArc.test.ts` 29→32 (windowed / killed / both as two separate sentences / whole and
doorless earning nothing), typecheck and the eight turbo tasks green, and all 60 tracked agent proofs swept
without edit. Two notes on method, because both are the kind of thing this lane keeps being wrong about: the
suspicion that v69/v70's new keys would trip the ledger's strict validators was **measured and refuted** (a
plain pre-v69 record is rejected by the same fixture, so nothing was "fixed" to answer it), and the first draft
wired the derivation into `pipeline.ts` and was **reverted** so the claim lives once, beside the records it
reads — a copy in the consumer is the drift v51/v54/v69 keep naming.

Bounds kept: a caveat says there was a window, never its size (all v69's key carries); §26 stores text, so the
wording is the payload and cannot be filtered by field; the durable arc line already had `notes` and `results`,
so v75 changes what a reader SEES in memory, not what the ledger stores; the line is still written by the HOST
(roles cannot reach §26 — v39/v47's governance), so this cannot let a role embellish its own victory; and the
chip (v72) remains the only place a human sees it without reading prose.

## Reaper-survivor proof (`reaper-survivor-proof.mjs`, M2 v76 — a label that reads like an outcome)

61st script. v55 measured both halves of the kill: `child.kill()` stops one process, and reaping **instead of** killing reaches a detached survivor. Its `descendantsStopped` value was built to keep failure names apart, yet the single word `reaped` still reads as "the tree is down". Measured with a suite-shaped program (hangs, and leaves a `detached: true` grandchild writing heartbeats into a file): reaper OFF → `not-attempted`, 14 beats after the report; reaper ON → `reaped` reported **and** 14 beats after the report, because the grandchild had already left the reachable tree. The run produced a third witness on its own: deleting the temp dir failed with `EPERM` while a live process still held it — exactly v55's signature, now printed instead of tidied away.

The scope question was settled by the measurement, and it killed one hypothesis: `reapTree` is not unreachable through the verification seam (it belongs to `createExecHost`, which the caller already builds — the two arms of this proof differ by that option alone), so nothing was plumbed. What was wrong is a claim: the bridge now writes `(descendants: the reaper ran — a detached grandchild may still be alive)` where it wrote `(descendants: reaped)`, and every other v55 value keeps its wording, because those are names of what was attempted, not of what is dead. `execHost.ts` carries the limit beside the type so value and prose cannot drift apart.

Bounds: the beat counts are timing-dependent on one Windows box (what is asserted is the coexistence of `reaped` and survivors, not a number); `unsupported-platform` stays the honest POSIX answer, exercised only in unit tests; nothing about what the host DOES changed; and a record-level reader still sees `descendantsStopped: 'reaped'`, because a name cannot carry the caveat — which is precisely why the sentence carries it. exec-host 274/274 unchanged; the full 61-proof sweep this section owed was later reported here as **61 scripts, 0 failed**, and amendment 78's runner re-ran those same 61 bytes and printed **61 scripts · 3 failed** — see `sweep.mjs` below for which axis each red belongs to.

## Sweep provenance (`sweep.mjs` + `provenance-proof.mjs`, M2 v78 — a count that never named what it counted)

62nd tracked script, and the first runner in this directory that prints its own object. Every increment since v34 has closed with "the N-proof sweep is this increment's *nothing else moved* assertion" — one number, standing for two different facts: **which scripts ran** and **which build they graded**. A proof imports `./agents/runtime/dist/index.js` and `./agents/exec-host/dist/index.js` resolved against the working directory, so the committed bytes of a script and the compiled bytes it exercises have never been the same claim. `sweep.mjs` states them separately before any result appears: `[identity] ref HEAD = <sha> · node · platform · git version`, then `build under test: 224 dist files, digest <sha>` — sha256 over `path \t sha256(content)` for every shipped `dist` file, keyed by path so a deletion cannot hide inside a same-size rewrite — then how many tracked sources are modified, then how many committed proofs differ from the worktree copy. It materialises the **ref's** bytes into `os.tmpdir()` and runs those, re-checks the digest after the last script (a sweep is long enough for someone to rebuild), and closes with a `[summary]` line written to be quoted rather than paraphrased.

The first real use of it contradicted a sentence committed nine hours earlier. `d780df6` reported amendment 76's owed sweep as "61 scripts, 0 failed … against THIS commit's own tree"; the same 61 bytes run by this runner against that commit print **61 scripts · 3 failed**, and the named axes say whose each red is without a second opinion:

- `reap-proof.mjs` — `the default reaper answers a question even about a pid that cannot exist`, expected `boolean`, got `object`: another lane's uncommitted async reaper, sitting in the `dist` this sweep graded. Script and build came from two different histories — the exact pair the old sentence could not express.
- `index-store-proof.mjs` + `provider-proof.mjs` — one runtime defect, two witnesses: a chunk with `heading: undefined` carries the key in memory and loses it through `JSON.stringify`, so `snapshot must be verbatim` compares an object against a near-identical object that differs by an absent key. Both proofs are byte-identical between ref and worktree (`git diff HEAD` empty) and red in both, so the scripts axis is not involved — and both are red for a third reason the runner does not yet name: they call `collectTextFiles('.')`, so their object is **the working tree as it stands**, untracked scratch notes included. Fixing the round-trip is v79; a `walked-tree` line in `[identity]` is owed beside it.

`provenance-proof.mjs` keeps the runner honest in both directions. §1 the digest is an identity — stable when asked twice, moves on one byte, moves on a rename with no byte moved. §2 re-hashes all 61 committed proofs through a SECOND reader (`git show`, not the runner's own `cat-file`) and checks every worktree sha against the file actually on disk. §3 what lands in the temp dir is the ref's bytes, and where the worktree differs the landed copy differs from it — measured this window at **27 identical / 34 divergent**. §4 a red cannot read as green: exit 0, a throw with its reason, a hang labelled TIMEOUT, `process.exit(7)` reported as 7 — and because a thrown error prints its message FIRST, stdout is read from the tail and stderr from the head, which is the fourth bug this increment found (a FAIL row used to report `Node.js v24.15.0` instead of the reason). §5 runs one real committed proof (`code-index-proof.mjs`, 3 019 bytes) through the same materialised path and then the actual `runSweep` entry point. §6 prints the quotable numbers plus a synthetic-repo positive control for the dirty-source filter — porcelain v1 has TWO status columns, and slicing one made the filter answer **0** about a tree with two modified sources.

Bounds: naming the build is not reproducing it — a clean-room sweep needs a build from the ref's sources, and that is queued; the digest covers `dist`, so a source edit that nobody compiled shows up as `dirty-sources`, not as a moved digest; `sweep.mjs` is a human tool and shells out to `git` with the ambient environment (it is not a door, runs no agent code, and writes only into `os.tmpdir()`); and the divergence count of 34 is a fact about this shared worktree, not a claim that those copies are wrong — they are another lane's in-flight work, now measurable instead of recollected.

## Round-trip identity — `heading: undefined` is not the same object as no heading (M2 v79, runtime)

Two of the three reds in amendment 78's first named sweep were the same runtime defect, and it had been green for 25 increments. `chunkFile` kept TWO shapes for "no heading": the window branch pushed `{path,startLine,endLine,text}` and the markdown branch pushed the same plus `heading: undefined`. Both satisfy `heading?: string` and both read identically through `c.heading ?? ''`, so nothing in the code disagreed — but `JSON.stringify` drops a key whose value is `undefined`, so `saveIndex` → `loadIndex` returned an object that differed from the one in memory by a key that was never a value. `index-store-proof.mjs`'s `deepStrictEqual(loaded.index, cold)` was the assertion that could see it, and the thing that made it visible was an untracked scratch note whose text precedes its first `#` heading: every markdown file tracked in this repository starts with a heading, so the pre-heading markdown chunk was a shape this corpus never produced.

The fix takes the smaller shape: the markdown branch now omits the key exactly when there is no heading, so absence has one representation — the same rule `windowed` (v69), `truncatedStreams` (v71/v72) and the v75 caveats already follow. `deserializeIndex` could have re-added `heading: undefined` and made both proofs pass; that would have left the two shapes in place, which is what caused the bug. Five unit cases pin it from both sides — a pre-heading chunk names its four keys and has no `heading`; a chunk WITH a heading still carries it (so the fix is not a blanket deletion); the markdown branch agrees with the window branch over a two-file mix; and the round trip holds through memory and through a fake disk, with `queryIndex` results compared too so ranking cannot drift to buy the identity.

The control is stated because it is the part that could have been faked: both proofs were re-run with the heading-less scratch file STILL in `.scratch/`, so the trigger stayed in the walked tree and only the code changed — `index-store` and `provider` both print ALL ASSERTIONS PASSED. Bounds: `chunkFile` is the only chunk constructor and `files` entries have no optional fields, so no other persisted shape carries the class; `IndexHit.heading` can be undefined but hits are never persisted; and where a JSONL round trip IS asserted (the ledger's v69–v73 keys) the committed proofs already read the file back from disk, which is the assertion the index path lacked. runtime **349 → 354**; and the third axis amendment 78 named stays open — these two proofs read `.` , so a sweep's object includes files no commit owns, and `sweep.mjs`'s `[identity]` block does not name that yet.

The runner caught a bug in itself while grading this fix. Its `[identity]` line printed `scripts 63` where the committed population is 62 — `endsWith('.mjs')` listed `sweep.mjs` as a proof, materialised it and RAN it, so a nested sweep started a third and the run took 961 s instead of ~200 s, ending in a `FAIL sweep.mjs (exit null, TIMEOUT)` row that is not a proof result. Amendment 78's own text ("the next sweep is 62") is what made the two numbers meet; the filter now follows the directory's `-proof.mjs` convention, which every proof already used. One timing-sensitive consequence is reported rather than smoothed away: `report-kill-proof.mjs` was green in the clean sweep before the fix and red in the contended 961 s one, which is what CPU pressure from a recursive runner does to a heartbeat count.

The sweep over this build, in the runner's own words: `[summary] ref 5c89d0bd3a31 · scripts 62 · failed 1 · dist 8b3ff8b0e7f62133 (stable across the run) · dirty-sources 3 · 311s`, with its population line reading `[identity] scripts: 62 committed proofs materialised into C:\Users\18414\AppData\Local\Temp\nexus-sweep-wjlIvU · 34 of them differ from the WORKTREE copy (the ref's bytes are what runs)`. The reds are `reap-proof.mjs`.

## Walked-tree proof (`tree-axis-proof.mjs`, M2 v80 — the sweep's third axis, named)

63rd tracked script. `sweep.mjs` (v78) fixed which SCRIPTS ran and which BUILD they graded, and v79 left
the third axis open in its own sentence: proofs are run with the repository root as cwd, because that is
how `./agents/runtime/dist/index.js` resolves — so a script that reads `.` reads the WORKING TREE. Measured
here: the walk returns **220 files / 3 801 218 B**, a clean clone of the same commit yields **193**, and
the 27 untracked files carry **2 204 169 B** and **637 of the 1 664 chunks** (38 %) that
`code-index-proof.mjs` indexes. Its `deserializeApp schemaVersion localStorage` query expects
`apps/studio/src/lib/persist.ts` at **#3 in this tree, #2 in the clean clone**, with
`.scratch/README-damaged.md` and `.scratch/adr-head.md` taking two of the five slots. §1 the tree digest
is an identity: stable when asked twice, moves on an edit, on an untracked file, on a rename with no byte
moved, and an ignored-but-present `.md` IS walked (git-ignorance is not walk-ignorance). §2 the three
ownership bins are exhaustive, disjoint and re-derived by a second reader of git. §3 shows the
load-bearing part where the answer is known: five committed files fill 5 of 5 top-5 slots, six untracked
ones leave the ref **1 of 5** — the source stayed #1, so no shipped predicate flipped this run, and that
is printed rather than improved. §4 exercises both shapes of the mid-run re-check end to end through
`runSweep` (`treeStable` false with a file that lands between the last proof and the re-check, true
without). §6 prints the real numbers and asserts the scan's population only when the tree can support it
— the first version asserted the real-tree chunk difference unconditionally and would have gone RED in a
clean clone, inheriting the disease it grades; both branches were exercised, the vacuous one through a
mutated copy.

`walkedTree()` takes its population from the production walker imported from the same built `dist` the
proofs import, so no second copy of the skip-list exists; the digest is path-keyed like the build digest;
and the third bin is computed by elimination, which is also how the runner avoids enumerating every
ignored file under `node_modules`. The script-count line is a text scan of the ref's own bytes and says
so — 8 call `collectTextFiles('.')` and 1 walks `process.cwd()` with its own copy of the rule — guarded by a
negative control that 7 scripts naming `process.cwd()` as a jail root are NOT counted.

Bounds: naming the tree does not isolate it (running the walkers against a clean checkout of the ref is
queued, with the clean-room build); the 27 untracked files here are kept on purpose, being earlier
increments' own inputs; and `[summary]` now carries `tree <digest> (stable | MOVED mid-run)` because the
tree moving during ordinary work is what the re-check exists to say.

## Isolated clean-checkout proof (`isolated-proof.mjs`, M2 v81 — running a proof where nothing is untracked)

64th tracked script, plus `isolatedCheckout()` in `sweep.mjs`. v80 named the third axis and called its own
bound in the same breath: naming the tree is not isolating it. This is the isolation. `git archive <ref>`
(3 399 680 bytes measured) untars into a temp directory — no `.git`, therefore no untracked content, but
also no `dist`, since `dist` is untracked at HEAD — so the tree is built clean-room, with its own
workspace links derived from the **archived** `package.json` workspaces globs (5: ai-providers,
design-model, studio, exec-host, agent-runtime) because the home install's `@nexus/*` links are ABSOLUTE
paths into this working tree, and reusing them would compile uncommitted sources into home's `dist`.
§1 the census-without-git shape: a tree with no `.git` reports `gitRepo: false`, four `null` counts and
`censusUnknown === files` — "cannot ask", never `0`, because `0` would assert exactly what isolation is
supposed to earn — while digest identity and movement still hold; the positive control on this worktree
re-derives `tracked + untracked + other === files`. §2 the gate that makes the word falsifiable: HOME's
dist digest is byte-identical before and after the isolated build (`8b3ff8b0e7f62133`, 224 files, 35.0 s),
in both directions — the temp link resolves inside the temp root AND home's link still resolves to
`agents/runtime`. §3 reports the build verdict instead of smoothing it: exit 1, `Tasks: 4 successful, 5 total`,
`Cached: 0 cached, 5 total` (nothing restored from home's cache, so five packages really compiled there),
`Failed: @nexus/studio#build` over a Next specifier resolved through a cross-drive junction — which is
reported as THAT, not promoted into "HEAD does not build"; the same-drive rerun is queued. §3 asserts the
shape nonzero-exit ⇒ at-least-one-named-package, so the line cannot decay into a silent pass, and the temp
tree's own `agents/runtime/dist/index.js` exists and differs byte-wise from the worktree's (2 466 B
against 2 576 B here), which is what "it compiled the ref" means. The gap this increment found by trying to
quote itself: the reason line is at index 35 of 55 output lines and `isolatedCheckout` keeps
`tailOf(…, 4)`, so the runner names WHICH package died and not WHY — the `runProof` head-vs-tail rule,
broken one function over, and queued as its own increment rather than papered over here. §4 runs the one committed
tree-walking proof (`code-index-proof.mjs`) in BOTH trees: green in both, **193 files / 1 619 981 B**
clean against **220 / 3 801 218 B** here, and every clean file tracked at HEAD by an independently
re-derived `ls-tree` list rather than by trusting the census. Two mutation probes: M1 (delete the digest
gate) red; M2 (delete §4's leak assertions) initially **green**, because the poison landed after the walk
had already been computed — the re-aimed version goes red naming `scratch-leak.md`, and the ordering rule
is committed into the witness.

Bounds, as of v83: the flag v81 queued shipped — `runSweep` takes `proofsCwd` and the CLI takes
`--isolated` — but the DEFAULT `cwd` is still the worktree, so an ordinary sweep still grades the build it
sits next to, and a `.git`-less tree cannot host proofs that shell out to git (v83 §3 measures what the
missing `dist` costs a proof that does not shell out: exit 1, `ERR_MODULE_NOT_FOUND`).

v82 added §3/§3b to this script, and `describeBuild()` to `sweep.mjs`, because v81 could name WHICH
package failed and not WHY: the runner kept `tailOf(stdout+stderr, 4)` while the transcript put the reason
at line 35 of 55 and the banner in the last six. `describeBuild` is pure and exported — `{ lines, bytes,
failed, reasons, reason, tail, head }` — preferring a line the failing task itself printed (turbo prefixes
task lines `@scope/name:task:`), falling back to the first reason-shaped line, and to `null` when nothing
reason-shaped exists; the banner is never promoted, and an error from a package that built fine is not
this build's reason. The full transcript is written to `<dest>/build.log` BEFORE anything is reported —
in `dest`, not `root`, so §4's file count cannot mistake a runner's own file for the ref's — and §3
re-reads the file and re-derives `bytes`/`lines`/`failed`/`reason` from those bytes, asserting
`rawLog.includes(reason)`: a quote must be findable in its source. Measured at `2a62ddb`: exit 1 in
40.5 s, 55 output lines, `Cached: 0 cached, 5 total`, reason
`@nexus/studio:build: Module not found: Error: Can't resolve './D:/终极项目/node_modules/next/dist/client/next.js' …`,
quoted from the runner's own `[isolated]` and `[summary]` lines rather than from a side harness. §3b
grades the SELECTION deterministically, because §3 can only ever grade it against whatever the ref's build
happens to do: 38 synthetic lines with the reason at line 1 and the banner at line 37 (and the distance
itself asserted at \"> 4`, so the fixture cannot rot into a case `tailOf(4)` catches by luck), a
banner-only transcript yielding `reason: null`, two tasks' errors resolving to the one that FAILED, a
passing transcript yielding no failures and no reason. Control + 2 probes: m0 (unmutated, same import
rewiring) green across six sections; m1 (banner as reason) RED; m2 (log truncated after the verdict was
computed) RED.

## Build-verdict attribution record (`sweep.mjs` + `isolated-proof.mjs`, M2 v82 record written at v156 — a verdict that names the PACKAGE is not a verdict)

Amendment 82 was granted and never recorded. §7's ledger door counts it as one-sided to this ref, and the reason is
worth stating rather than smoothing over: every mention of v82 in this document sits inside someone else's section —
v81's bounds, v84's withdrawal, the census prose — where it credits 82 as a NEIGHBOUR. A sentence about a hole is not
its record, which is the very rule §7's positional title reader exists to enforce. The ledger's own heading is:
`— v82 (docs/evidence): a verdict that names the PACKAGE is not a verdict — `describeBuild()` quotes the line the BUILD wrote, and answers `null` when it cannot`

**What the increment changed, read off HEAD's bytes at `8b77fa6`.**
- `describeBuild()` (`docs/evidence/agents/sweep.mjs:1402`) is pure, exported, and returns
  `{ lines, bytes, failed, reasons, reason, tail, head }` from one scan (`docs/evidence/agents/sweep.mjs:1410`). The selection
  at `docs/evidence/agents/sweep.mjs:1409` prefers a line the FAILING task itself printed — turbo prefixes every task line
  `@scope/name:task:`, so `@nexus/studio#build` maps to `@nexus/studio:build:` — then falls back to the first
  reason-shaped line, then to `null`. The `null` is the point: two refusals are load-bearing, the summary banner is
  not a reason, and an error printed by a package that BUILT fine is not *this* build's reason.
- Capture fidelity came before reporting. The whole transcript is written to `<dest>/build.log` — in `dest`, NOT in
  `root`, because the sweep counts files inside the checked-out tree and a file this runner wrote must never be
  mistaken for a file the ref owns (`docs/evidence/agents/isolated-proof.mjs:173`). §3 then RE-READS that file (`docs/evidence/agents/isolated-proof.mjs:172`),
  re-derives every figure it prints from those bytes, and asserts the quote is findable in its source
  (`docs/evidence/agents/isolated-proof.mjs:184`). That re-derivation is the difference between "the object agrees with itself" and "the
  file says this".
- `§3b` (`docs/evidence/agents/isolated-proof.mjs:202`) grades the RULE on text the witness wrote, because a rule tested only by whatever the
  ref's build happens to do is untested when the build passes. The fixture puts the reason far above the banner and
  asserts the distance (`bannerAt - reasonAt > 4`, `docs/evidence/agents/isolated-proof.mjs:215`) so the case cannot rot into one
  `tailOf(4)` would have caught by luck; alongside it, a banner-only transcript names the package and reports
  `reason: null`, two tasks resolve to the one that FAILED (`docs/evidence/agents/isolated-proof.mjs:219`), and a passing transcript has
  no failures and no reason (`docs/evidence/agents/isolated-proof.mjs:220`).

**What its run quote turned out to be, stated here so the record is not a monument to a wrong attribution.** The
ledger bullet for amendment 82 quotes a real isolated run at `2a62ddb` — studio build exit 1, reason
`Module not found: Can't resolve './D:/…/next.js'` — and v84 later measured that transcript as an artifact of WHERE
THE RUNNER WROTE: the same ref, dest on the repository's own drive, compiles GREEN, so the attribution to the ref was
`withdrawn in favour of an attribution to` where `os.tmpdir()` sits (`README.md:2169`). The consequence for
the shipped witness is the part worth remembering (`README.md:2213): §3 only ever reached a failing build by
accident of drive placement; fix the default, `reason` is `null`, both reason assertions are skipped, and
`isolated-proof.mjs` stays GREEN having tested nothing. §3b is why the increment still holds: the selection rule was
graded on text that does not depend on the host's drive, which is exactly the reason it was written.

**Bounds.** This section changes no code and no verdict. It records amendment 82 and titles itself for §7; the
remaining one-sided grant is 21, whose record is owed the same treatment and is deliberately not written here (its
runtime counts — `Runtime 129/129`, `studio 90/90` — belong to a ref no one has re-measured, and a record that
repeats an unreproducible figure is worse than no record). The numbers quoted above are line numbers at `8b77fa6`
and the door re-derives its own census at every ref, so this page is not where a stale count can hide.

## Child-cwd proof (`cwd-axis-proof.mjs`, M2 v83 — which BUILD does a sweep grade?)

65th tracked proof (66th script in `docs/evidence/agents`, counting `sweep.mjs`). v78 named the ref's
bytes, v80 named the tree the rows walk, and both were read as "this sweep graded the ref". They grade the
ref's SCRIPTS. The census of HEAD's 64 tracked proofs, read off their own committed bytes: **61** import
the code under test as `pathToFileURL('./agents/runtime/dist/index.js')` and **3** as
`pathToFileURL(join(root, …))` with `root = process.cwd()`, and **0** reach it through their own file
location — the three are `provenance-proof`, `tree-axis-proof` and `isolated-proof`, i.e. this family itself.
`pathToFileURL` resolves a relative path against `process.cwd()`, so every one of them is
resolved by the CHILD's cwd — which means `runProof`'s cwd argument was never only a corpus choice, and
`sweep --ref <older sha>` from this worktree ran the older proof text against the CURRENT BUILD while
`[identity]` was quoting a digest of the tree the runner sat in.

§1 is the census, from one `git cat-file --batch` spawn (**8 744 ms** for 64 blobs, against **14m7s** for
the same witness reading blob-by-blob — longer than the 240 s the sweep budgets a row, which is how this
increment found out it was scheduling itself for a TIMEOUT). The corpus is now a bankable argument, and
because a stream parser one byte off grades the wrong text silently, the batch is checked against an
independent single read at BOTH ends of the population. §2 is the observation instead of a second copy of
the rule: `probeChildResolution()` spawns a child AT the cwd and reports what that child says
`process.cwd()` is and what it resolves — three synthetic trees under one spec name yield two digests
(`d44fec1017ce` / `1445f40e400c`) and an honest `exists: false, sha: null`, and the home arm is cross-checked
against a digest the witness computes itself (`73918b2b38eb`). §3 is one file at two cwd's: the ref's OWN
`roles-proof.mjs`, byte-identical off `3f18761200ef`, exits **1** with `ERR_MODULE_NOT_FOUND` in 3 119 ms
inside the archived checkout and **0** in 2 810 ms with cwd at this worktree. §4 runs `runSweep` both ways:
`proofsCwd` = archived checkout gives 1 row, failed 1, `graded build e3b0c44298fc (0 dist files)` — the
digest over nothing, printed as nothing — and an undigestable tree, while the default cwd gives 1 row,
failed 0, `graded build 8b3ff8b0e7f6 (224 dist files)`. §5 is v81's gate again: home's dist
`8b3ff8b0e7f62133` / 224 files byte-identical across the whole proof, which schedules itself in
**61 585 ms** of the **240 000 ms** a row gets and asserts that, rather than noting it.

What moved in the runner: `runSweep` takes `proofsCwd`; the identity block prints `child cwd for every row
below: spawn was given X, the child reports Y` (⚠ when they differ), `what a child standing there LOADS`,
and — only when the two cwd differ — the two builds as two lines; one tree is named once, not twice. The
summary ends `graded build <digest> (<n> dist files, stable across the run | BUILD MOVED mid-run) · tree
<digest> (stable | MOVED mid-run) <n> files`, and the CLI gains `--isolated`, which runs the sweep INSIDE
v81's clean checkout and then re-checks home's digest, printing `UNMOVED (the isolation gate)` or the
accusation that the run compiled into the repository it was grading. That closes v81's bound, "isolation is
still not `runSweep`'s default", as far as a flag can: the default remains the worktree, on purpose.

The defect this increment caught in itself is the one every evidence-pipeline edit risks: rewriting the
identity block to name two cwd's renamed three sentences that `tree-axis-proof.mjs` (v80) reads BY PREFIX,
and it went RED twice — once on `[identity] walked tree` / `read the WORKING TREE as their corpus`, once on
the summary's `tree <digest>` + `(MOVED mid-run)`. The producer moved back both times, not the witness
(v46's rule), and §4 now pins those sentences in both arms plus the number of tree lines, so the
rewording cannot come back quietly. Mutation **m4** re-ships the pre-fix wording and reddens BOTH
witnesses. Control + four probes, every red an `AssertionError` and never a stack: **control** (the
unmutated runner, import redirected only) GREEN in both witnesses; **m1** (`runCwd` ignores `proofsCwd`)
red on `the isolated row must be RED here`; **m2** (the census regex stops seeing `./…`) red on
`child-relative 3 of 64`; **m3** (the probe answers with the RUNNER's cwd) red on
`the child reported D:\终极项目, not the … it was given`; **m4** (the pre-fix wording) red in the new
witness on `exactly one walked-tree line per sweep` AND in the shipped `tree-axis-proof.mjs` on
`the tree line is PRINTED, not merely computed`.

Bounds: the census is a text scan of scripts — that is why §3 exists, and why `PROBED_BUILDS` is four
entries read off HEAD's bytes rather than a derivation (a fifth idiom must be added, not silently missed);
the numbers above are the population at the ref that was graded, so re-running with this commit as HEAD
reads **65/65** child-relative, 0 file-relative, `unresolved` empty, in 8 378 ms — the witness joins its
own census without reddening it, because §1 asserts `childRelative === total` and not a constant;
`--isolated` is opt-in, so the sentence "the sweep graded this worktree's build" stays true by default;
and an archived checkout has no `dist`, so a full isolated BUILD sweep is still not a green this box can
claim. **Amended by v84:** the middle clause — "across a cross-drive junction" — is now an ARGUMENT
(`dest`) rather than a property of the host, and on the repository's own drive the SAME ref compiles
**GREEN**, so v81/v82's attribution of that failure to the ref is withdrawn in favour of an attribution to
where `os.tmpdir()` sits; the "no `dist` in an archived tree" half of the bound stands untouched.

## Drive axis (`drive-axis-proof.mjs`, M2 v84 — which DRIVE does an isolated build compile on?)

66th tracked proof (68th script in `docs/evidence/agents`, counting `sweep.mjs` and the new human-run
`isolated-arms.mjs`). v81 built a clean checkout, v82 made its verdict quotable, v83 said which BUILD a
child's cwd grades — and all three put that checkout under `os.tmpdir()` without asking what drive that
is. On this box the answer is `C:` and the repository is `D:`, so every junction v81 makes crosses a
volume, and Windows `relative()` cannot express a `D:` path from a `C:` directory: it returns it
ABSOLUTE. A bundler handed `./` + that gets `./D:/终极项目/node_modules/next/dist/client/next.js` — neither
relative nor absolute — and the studio build dies on it.

§1 measures the drives (`tmpdir C:\Users\…\Temp on C:\ · repository on D:\ · node_modules realpath on D:\`)
and records that the PRE-v84 default was therefore cross-drive here — observed, not hypothesised — then
looks for a volume that is not the repository's and says so out loud if none exists, because §2's refuting
arm needs one. §2 is the mechanism with no bundler and no build: two real parent directories, one
`relative()` call each, and the derived string asserted EQUAL, byte for byte, to the reason line
`isolated-arms.mjs` records — `cross-drive → "D:\\终极项目\\…\\next.js", isAbsolute=true, request
"./D:/终极项目/node_modules/next/dist/client/next.js" names nothing under the app dir` against
`same-drive → "..\\..\\..\\终极项目\\…\\next.js", isAbsolute=false`, which reaches the entry. §3 runs the
runner: the default dest is now `D:\nexus-isolated-…` and prints `SAME DRIVE` plus
`chosen: repo-drive (FORCED off tmpdir by the drive mismatch)`, while a caller who asks for the other
volume still gets it and is told `CROSS-DRIVE` and `caller-supplied` — reported, not repaired. §4 grades
`driveVerdict()` as arithmetic on the shapes this box cannot reach, and on a win32 host asserts the
`POSIX-SINGLE-ROOT` clause is ABSENT from both real sentences rather than pretending to have run it. §5
re-measures the home build (`8b3ff8b0e7f62133`, 224 files, UNMOVED across two clean checkouts) and pins
the witness's own scheduling — 67 948 ms of the 240 000 ms a row gets — next to the number that can never
be a row: 513.0 s same-drive and 522.4 s cross-drive for a build arm, both over budget by more than 2×.

The measured finding this witness is quoted from, and cannot itself re-run: two clean checkouts of the
SAME ref, back to back, differing only in drive —

```
[A-cross-drive-C] build exit 1 in 522.4s · 55 lines · failed ["@nexus/studio#build"]
[B-same-drive-D]  build exit 0 in 513.0s · 59 lines · failed [] · reason NONE CAPTURED
[after] home dist 8b3ff8b0e7f62133 (224 files) · home node_modules 309 entries · UNMOVED=true
```

so the sentence v81/v82/v83 all carried — "the ref's studio build fails in a clean room" — was a sentence
about where the runner was allowed to write. `isolated-arms.mjs` is committed because a number nobody can
re-measure is a number a later reader has to take on faith; it runs both arms in ~18 minutes, or ~25
seconds with `--no-build`, and exits non-zero if the home build moved.

The consequence for a SHIPPED witness is the part worth remembering: v82's §3 gate only ever reached a
failing build by accident of drive placement. Fix the default and the clean-room build goes GREEN,
`reason` is `null`, both of §3's reason assertions are skipped, and `isolated-proof.mjs` stays GREEN having
tested nothing. It now asks for the cross-drive tree by name and prints why, so the gate that needs a red
build keeps one, and the drive it was built on is part of the record rather than a property of the host.

Control + four probes, all four RED on assertions (`drive-axis-proof.mjs` and, in the control, the shipped
`cwd-axis-proof.mjs` too): **m1** the dest goes back to `os.tmpdir()` → "the DEFAULT dest
`C:\Users\…\nexus-isolated-iInbZn` is on `C:\` while the repository is on `D:\` — v84's fix is not in
effect"; **m2** the fix stays and only the sentence is cut → "the [isolated] line must state the drive
verdict it computed"; **m3** `mismatch = false` → "a caller asked for `C:\…` on `C:\` and the runner
reported no mismatch — the axis is decoration if it cannot be asked for"; **m4** the runner relocates a
caller's cross-drive dest → the same sentence, quoting the replaced `D:\nexus-isolated-AqK2qe`. No
SyntaxError among them, and the harness throws rather than reporting a green for a file it never reached. Bounds: one back-to-back pair on one box
(tmpdir `C:`, repository `D:`), durations load-dependent; on a single-volume host the old default was
already right and §1 says which case it is; a same-drive tree buys a compiling checkout, not a green
isolated SWEEP — an archived tree still has no `dist`, which is v83's §3 and stands; and the POSIX clause
is graded here only by absence.

## Row budgets (`timeout-axis-proof.mjs`, M2 v85 — a KILL is not a FAILURE, and the number that ends a row is not always the runner's)

67th tracked proof (69th script in `docs/evidence/agents`). `runSweep` had been giving every row the same
`DEFAULT_PROOF_TIMEOUT_MS = 240_000` and printing a kill as `FAIL …, TIMEOUT`. One row in the population is
`isolated-proof.mjs`, whose clean-room BUILD this directory measured at **338.5 s quiet and 513.0 s /
522.4 s under load** (v84). From the day v81 admitted it, the sweep therefore carried a row that could not
be answered: the runner stopped asking before the proof's first assertion ran, and the red it wrote was a
fact about a constant in `sweep.mjs`. v83 and v84 both pinned "a witness must fit a row"; nobody had asked
whether the row fits the witness.

A proof now names its own need, in column 1 of its own source, read from the ref's bytes:
`// sweep-budget-ms: 900000`. `rowBudget` recognises that form and refuses every other out loud, with the
reason in the record — zero/negative/fractional/non-numeric ("no duration is being asked for"), two
declarations ("a contradiction, not a `max()` for the runner to guess at"), above the 3 600 000 ms ceiling
("raise `--timeout` for the whole sweep instead"), and an indented marker is neither a declaration nor a
refusal, because it may be a code sample inside prose. The declaration is honoured **upward and downward**:
§3's one real `runSweep` kept 8 773 ms of work alive on a row that asked for 60 000 while the run's default
was 30 000, and ended 1 500 ms of work at the 300 ms that row itself chose. Asking is not a floor and not a
courtesy.

The attribution moved from the sentence into the record, which is the half v73 already demanded of the host:
`runProof` returns `verdict: 'passed'|'failed'|'killed'` beside `budgetMs`/`budgetSource`, `ok` and
`s.failed` keep their old meaning (a killed row did not pass, so `cwd-axis-proof.mjs` §4's
`failed.length === 1` stays true), and a killed row's line says WHOSE number ended it —
`killed at the 900000ms this row named itself, so the number that ended it is the row's, not the runner's`
against `killed by the runner's default budget of 240000ms; this row named no budget, so this red belongs to
a constant in sweep.mjs`. A nonzero exit never gets a kill's words, and a kill never gets a red's. The
`[identity]` block prints the census of declarations BEFORE any row runs (whether a sweep is schedulable is
not a fact to reserve for a red at the end), and the `[summary]` line — still readable by prefix by the four
witnesses that grep it — gained `killed 2 (1 at the runner's default, 1 at a budget the row named)`.

The fixture is part of the finding, because it reddened twice on its own gate. §3's run default was 2 000 ms
first and the row meant to FAIL fast was KILLED (node had not finished starting) — the exact mis-attribution
v85 removes. At 10 000 ms the anti-flake assertion caught a "fast" red taking **5 879 ms** on a box running
two sweeps and a build at once, and printed "the fixture has no margin left and any verdict it reports is
the box's, not the runner's". The default moved to 30 000 ms; the assertion did not. §2 is the census on
bytes not yet committed (1 of 66 proofs declares, HEAD has none) with HEAD read alongside, and §5 schedules
the witness itself at 64 034 ms of the 240 000 ms a row gets — declaring nothing, because nothing measured
here needs more.

Two hazards this window hit while landing it, both recorded because the stack could not see them. A lane
rewrote the four shared docs from a held snapshot of the v76-era record, so the worktree's copy of ADR 0016
had lost amendments 78–84 and this README its v78–v84 sections — uncommitted, invisible to every green here,
because a sweep grades the REF's bytes and no proof reads the ADR; the docs were restored from HEAD with that
lane's text preserved out-of-band, and the guard (ref-vs-worktree heading sets, printed in the identity
block) is the queued next increment. And while ~1 MB of that restore's scratch dumps sat in `.scratch/`,
`code-index-proof.mjs` went RED for having its top-5 ranking beaten by three untracked copies of a README —
v80's untracked population, priced as a witness's assertion. Bounds: the 900 000 ms number is a schedule
sized from v84's load-dependent arms, not a re-measurement; an hour-long row may still sit for an hour
(refused above the ceiling, never clamped); a declaration that exists only in a worktree cannot be seen by a
sweep of a ref; and the 67-row sweep against this commit's own tree is owed to the next bookkeeping commit.

## The host that cannot spawn synchronously, and the silence that was `0 === 0` (`reap-proof.mjs`, M2 v86 — ADR 0016 amendment 86)

`spawnSync('git', ['--version'])` on this box answers `{ status: null, error: EBUSY }`. So does
`execFileSync`. So does `execSync`. So does the same call from inside a `worker_threads` Worker. Asynchronous
`spawn` answers normally. Nothing in the repository said so, so the failure was distributed: **44 of the 69
tracked proofs** imported `node:child_process`, **33 of them needed the synchronous half**, and every one of
those 33 has been unable to run since the host turned — with logic that is entirely correct.

`docs/evidence/lib/syncproc.mjs` re-implements the synchronous API on the asynchronous one (a Worker runs
the real `spawn`; the main thread parks on `Atomics.wait` and reads the result off the filesystem, because a
blocked main thread cannot take a `postMessage`). Each of the 33 proofs changed **one line, its import** — no
assertion moved, so each stays reviewable against its own history. The file is **tracked**: the sweep
materialises a ref with `git archive` (v78/v81), so an untracked helper would make 33 tracked proofs
unresolvable in every clean checkout and visible only in this worktree — v80's failure class, named rather
than repeated.

The second half is production code, and it was degraded in a way nobody could see: `DEFAULT_TREE_REAPER`
shipped `taskkill /T /F` through the broken sync call, so it always answered `false`, the host always said
`'reaper-failed'` (truthfully), and `reapTree: true` silently became a plain kill. `TreeReaper` may be async
now, and **`onEnd` waits on the settled reaping promise** — the shape that used to build a result while
`descendantsStopped` was still `undefined`, reporting a reaped tree as an undecided run. The unit test
releases its fake reaper on a later tick because that is the only schedule that distinguishes the two; sync
reapers are still accepted, so no already-injected test reaper moved.

And then `reap-proof.mjs` ran for the first time since v55, went red, and lied twice about it. The only error
a reader got was `ENOENT: …\heartbeats.txt` **thrown by the `finally` cleanup**; the assertion that actually
failed was behind it, and it failed because the proof's kill budget is a literal 700 ms while this box's
spawn→first-write latency measured **6 074 ms** in the same run (`node --version` as a child produced nothing
at all in 6 000 ms). So the parent was killed before executing a line, no heartbeat file ever appeared, and
§2's central claim — `beatsLater === beatsAtKill`, "the survivor went silent" — was satisfied by `0 === 0`.
`ran: true` was never a claim about a run; it is the host's report that ONE spawn call succeeded.

Three rules came out of that, all of them v85's and v80's rules turned on this directory's own fixtures:
**§0 measures before it judges** (`max(700, 4×latency)`, 6 074 → 24 296 ms here, so no section can be red
because a constant in a file was smaller than the host); **an after-the-kill assertion needs a subject seen
alive before it** (runs are sampled in flight; `grewWhileAlive` and beats-at-kill > 0 gate §1, §2's both
branches, §5 and §6); and **teardown reaps orphans by the handles their parents recorded** (10 this run),
because `taskkill /T` on a dead parent walks a tree that no longer exists — §3's ordering lesson, applied to
the proof that teaches it. A cleanup that throws now prints the finding it would have replaced, and
rethrows. `verdict-proof.mjs` lost a hardcoded `6` in the same spirit: git 2.55 prints two non-empty lines
for that lock failure, so the literal was an assertion about a git version rather than about the door.

Measured, this run: §0 6 074 ms · §1 +8 heartbeats after `killedByBudget: true` · §2 `exit=1 signal=null`,
176 → 176 over a survivor that existed · §3 taskkill on the dead pid → status 128 while the tree wrote 443 →
449 · §5 60 → 60 · §6 `descendantsStopped="reaped"`, seq 1, malformed 0 · teardown 10 handles.

## Grading a §28 table against the people it replaces (`policyaudit-proof.mjs`, M2 v86b — ADR 0016 amendment 87)

68th tracked proof (70th script). v40 made a checkpoint policy data and v41 made human §28 decisions data;
nothing joined them, so "this table stands in for how we decide" was readable only forward.
`auditGateHistory(policy, history)` validates the table, replays it over the recorded history call by call,
and separates the contradictions by direction — `too-permissive` (a human vetoed what the table would allow)
from `too-strict` (a human allowed what it would block) — plus `silentApprovals`, the tools a table grants
only through its DEFAULT row, i.e. an approval no rule ever names. The refusals are the increment: records
decided by a table are `skippedPolicyRecords` and never agreement (a policy agreeing with its own output says
nothing about people, §60), an empty history gives `agreement: 0` rather than a vacuous 1, and the replay is
over tool names with `args: {}` because that is exactly v40's whole matching rule — so the audit says nothing
about a future argument-aware rule, and says that out loud. `auditLineFor` prints the ratio beside every
named failure class and the skip count, so one ledger line cannot read as a clean table. Bound worth keeping
in view: it is a library whose only consumer today is its own proof; the dock's policy face does not show an
audit line yet.


## A proof is a closure, and a stack line is not a reason (`closure-proof.mjs`, M2 v88 — ADR 0016 amendment 88)

The sweep amendment 86 owed came back: ref `e04e3ae`, **68 rows, 35 red, 0 killed**. Thirty-two of those
reds shared one cause the runner itself supplied. Since v86, 32 tracked proofs import
`docs/evidence/lib/syncproc.mjs` — outside the proof directory, which is the only thing `trackedProofs`
lists — while `materialize` wrote every blob **flat** into a temp directory. So the import failed twice
over: the file was never fetched, and `../lib` from a flat copy points outside the copy anyway. Those 32
rows were red **without executing a single assertion**, and 26 of them printed an empty reason field and
three lines of stack — `errTail` is `headOf(stderr, 3)`, and Node puts `Cannot find module '…' imported
from …` on the **fourth** line.

Four changes, all in the runner: relative specifiers are read out of the ref's bytes and resolved in git's
slash space against the importer's own directory (`path.join` is avoided on purpose — this host emits
backslashes and the two spaces must not meet in a lookup table); `closureOf` splits the edges into
*inside the population / tracked elsewhere in the ref / in no commit at all*, prints the third group BEFORE
any row runs, and reports its own depth limit rather than implying a transitive closure; `materialize`
writes the ref's **directory shape**, because a shape is part of what a commit owns; and a row's `reason`
is now a scanned cause line, with an empty stdout stated as "the child never reached a print" instead of a
blank field. The census line `fileRelative is 0` (amendment 83) is corrected in place: it is 32 now, and
the run says so — 68/68 child-cwd, 32 file-relative.

The proof's §3 is the part that could not be faked: **the same bytes, twice, and only the layout differs** —
faithful `policyaudit-proof.mjs` exit 0 in 3 091 ms, flat basename exit 1 in 182 ms. §4 then asserts the
cause sits BELOW the three lines the old window quoted; without that, the section would only prove that a
wider `headOf` works too. §2 cross-checks its own importer count against an independent scan of the same
bytes, and compares the fetched blob to the working copy with line endings normalised **and labelled**,
because a raw equality there would be a red about a checkout filter rather than about the ref.

Population-wide numbers for this commit's own tree are launched, not claimed: the runner is worktree code,
and amendment 80's rule still bites — a fix that exists only in a worktree is invisible to a sweep of a ref
until the ref carries it.

## The sweep that graded itself, and the fixture that fooled it (M2 v89 — ADR 0016 amendment 89)

Amendment 88 owed a number and the runner produced one: ref 1c9c7ee04061, 69 scripts, 5 failed, 0 killed,
graded build 8b3ff8b0e7f62133 stable across the run, walked tree ecbdb9c3ceda569a stable at 219 files, dirty
sources 0, 420 s. Against 35 reds before the closure fix, 30 rows moved to green — and the tree stayed still,
because the commit landed before the sweep was launched rather than during it.

The first defect the run exposed was this directory's newest file. closure-proof.mjs passed standalone at
03:55 and failed in the 03:57 sweep with nothing changed but its being committed: section 1 hands a snippet of
source to relativeSpecs inside a template literal, and the v88 reader matched a from-clause anywhere in the
bytes, so the ref copy claimed to import two files that exist only as sample code, and the identity block
faithfully reported them as unsatisfiable. A quotation can wear the shape of an import — v64 said the same
about a diff body line wearing a header.

The reader is now a scanner that counts a specifier only at CODE position, outside comments and string bodies,
while a template interpolation still counts because there the text really is code. Over the 71 mjs files here:
byte reader 33 importers, code-position reader 32, and the single difference is closure-proof.mjs itself. The
fixture was not reworded; the reader got smarter, which is the only fix that keeps the class visible. After it
the runner prints 32 of 69 with zero unsatisfiable and the proof passes as a sweep ROW, exit 0 in 5817 ms — the
form of the claim that matters, since a proof must hold when it is materialised out of a ref.

Four reds remain and every one is a witness contradicted by its own history: cwd-axis pins a census number
that v86 changed, timeout-axis compares an anchored line rule against a git grep of MENTIONS inside a file
full of quoted markers, reaper-survivor schedules a 500 ms kill against a 6074 ms host and asserts what
happened after a subject that never ran, and isolated-proof is the known cross-drive arm. Each is measured
already, so amendment 90 starts from evidence rather than from a guess.

## The three witnesses that were red for the wrong reason (M2 v90 — ADR 0016 amendment 90)

Amendment 89 closed with four reds and a cause for each. Three files later: none of the four was a defect
in the host, and one of them had never once been able to run.

reaper-survivor-proof.mjs carried `timeoutMs: 500` from before amendment 86 existed, on a box whose
spawn-to-first-write latency this proof now measures in its own section 0 — **427 ms here, so a derived
budget of 3 427 ms** (the calibration answers a different number each run: 507 ms the time before). Both
arms then have a live subject to make claims about: reaper off, 46 heartbeats when the report was written
and 59 900 ms later; reaper on, `descendantsStopped: "reaped"`, 116 at the report and 129 later. The label
still means only that the tree-kill call succeeded — 13 beats arrive after it either way, because a
detached grandchild leaves the parent's tree — and the assertions on either side of the kill are now gated
on the subject having been alive, so the vacuous `0 === 0` that amendment 86 named cannot come back as a
green. The cleanup still fails with `EPERM`, and says so: the survivor the section measured is what is
holding the directory.

isolated-proof.mjs and timeout-axis-proof.mjs were still calling the synchronous child-process APIs this
host refuses with `EBUSY`. Amendment 86 built `docs/evidence/lib/syncproc.mjs` and moved 33 proofs onto it;
these two were missed, so neither their git reads nor their cross-checks could ever return a byte. They
now read through the same bridge, which is **35 files** in this directory.

The tar story is the one worth re-reading, because the fix v90 shipped was right and the *sentence* shipped
beside it was plane-blind. v81 extracted a clean checkout with an absolute path plus `--force-local`, since
GNU tar reads `C:` as a remote host; `--force-local` is GNU-only. Measured by path on this box:
`C:\Windows\System32\tar.exe` is bsdtar 3.8.8 and answers `Option --force-local is not supported`, while
`C:\Program Files\Git\usr\bin\tar.exe` is GNU tar 1.35 and takes it. Which binary the word `tar` reaches is
PATH order — from a Git Bash launch, GNU answers first — so a comment that asserts one of them flatly will
be falsified by the next shell. The extraction is now `tar -xf ref.tar -C repo`, run inside the directory
that holds both names: no colon for either tar, no flag for either tar, no dependence on which one answers.

timeout-axis-proof then went green on its own terms: **2 of 69** proofs declare a budget (isolated at
900 000 ms, reap at 600 000 ms), and after v90's amendment-89 fix the HEAD side and the worktree side of
that census answer the same anchored question.

## The doc table that became a row, and the reader that had the wrong grammar (M2 v91 — ADR 0016 amendment 91)

The unit-test table at the top of this file has claimed since v63 that its rows sum to exactly **354**
runtime cases over 26 files and **275** exec-host cases over 8, and that "a row whose number drifts from
its file is a documentation bug". Since then every check of that sentence was a person with a script in a
temp directory. `table-recount-proof.mjs` is now the 70th row of the population it grades: it boots vitest
for both packages, reads per-file case counts out of the JSON, reads this file's digits out of **HEAD's
bytes** (`git show`, so a half-edited README cannot be graded against a finished measurement), and compares
in four directions — row against its file, rows against the two prose totals, a file with no row, a row
with no file. Measured: **354/26 and 275/8, drift 0**. Amendment 92 corrects the clause about *where* the
bytes come from: `git show` is precisely what killed this row on the clean-checkout plane, where no `.git`
answers the question — the reader now asks once which plane it is on, grades the HEAD blob when git does
answer and the materialized bytes when it does not, and section 0 prints which arm graded the table.

Two parts of it are the reason the increment exists.

First, the reader. The rig that audited v90's table first insisted the digits sit inside the backticks.
This table writes them outside, and writes six rows as `` `visualQa.test.ts` +contrast (3) `` — a
continuation block for a file already on the page. That reader parsed 322 of 354 cases and reported two
FALSE drifts (repair 11 vs 16, visualQa 21 vs 26) on a table that was correct. A checker with the wrong
grammar does not fail quietly: it manufactures defects in healthy files. Amendment 89's lesson, one level
down — so section 1 tests the grammar on a base row, a continuation row, an `exec-host/`-prefixed row and a
prose line that merely wears a row's shape, before section 3 may use it.

Second, the checker has to be capable of red. Section 5 mutates a copy of this table four ways — a base row
plus one case, a continuation row plus one case, a whole row deleted, a prose total minus one — and asserts
the same function that just called the real table clean catches every one: 4/4, e.g.
`runtime/registry.test.ts: rows 8 = 8 vs measured 7`, `runtime/workspace.test.ts (4 cases)` with no row,
`prose 353 vs rows 354`.

The proof also refuses a dirty tree: a counted test file that differs from HEAD would be graded as if it
were committed, so the precondition is checked and named. Files no commit owns are excluded from the counts
and printed — at the run that wrote this paragraph, `agents/runtime/test/vectorStore.test.ts` is untracked
with one failing case, so vitest exits 1, the JSON is read anyway (a nonzero exit is data, not a lost
report), and the proof stays green about the table while stating that the suite in this worktree is not.

## The plane that grades a proof, and the proof that had to learn it has two (M2 v92 — ADR 0016 amendment 92)

Amendment 91's sentence was that `table-recount-proof.mjs` is "the 70th row of the population it grades". The
sweep that owed it the number answered: ref `adfa403`, **70 scripts, 43 failed, 0 killed, 172 s**, graded build
`cc73dcf781dd0a2b` over 224 dist files stable across the run, walked tree `61265f575e9c6e92` stable at 194
files, home build `204913d0f036b30c` UNMOVED. The new row died at load on
`Error: Command failed: git show HEAD:docs/evidence/agents/README.md`.

Counted rather than guessed: **40 of the 43 reason lines name a `git` command** and the remaining three
(`exec-host`, `isolated`, `porcelain-path`) assert against a real SHA or working tree. One cause, printed by the
runner before any row ran: `[identity] walked tree … census NO .git — every file here is the ref's`. This is not
a fall from amendment 89's 5-of-69 — that run graded rows with the WORKTREE as cwd, where git answers. It is the
first full sweep on the clean-checkout plane, and on that plane 27 rows pass and every row that asks the
repository about itself cannot. Amendment 88's rule generalises to a new axis: name the shared cause once,
before the rows.

The row's own fix keeps the claim instead of weakening it. `git rev-parse --show-toplevel` is asked ONCE and
`[§0]` prints which plane is grading: HEAD's blob cross-checked against the worktree copy where git answers, the
materialised file — which IS the ref's bytes — where it cannot. A checkout has no index, so `git diff` cannot
serve as the dirty-tree precondition there; the precondition is not reported as satisfied, it is replaced by a
before/after sha256 digest of the README and both test dirs taken around the vitest runs, and `[§6]` says which
of the two ran. Measured on the git plane at `fd21c28`: 354/26 + 275/8, drift 0, mutations 4/4, graded-tree
digest `5f9f4898a6fdbd4d` stable.

Two refusals belong in the record because they are the increment's real product. A hand-built rig reproduced the
clean-checkout plane only halfway — it junctions 308 third-party packages but skips the five `@nexus/*` links and
the build — and the proof went red there on `measured 127 over 26`. That indicts the rig, not the ref, and the
authoritative arm is the sweep's own isolated tree, where the row answers `OK table-recount-proof.mjs (exit 0,
18861ms, budget 300000ms declared)` and the population moves from 43 red to 42. And mid-cycle a completion
notification delivered other sweeps (`465 scripts / 395 failed`, then `16 of 70`, causes like
`npm : The term 'npm' is not recognized` and 22 rows of `Cannot find module`) that no file on disk supports:
over this cycle's log, `grep -ac "Cannot find module"` answers 0 and the named output file does not exist.
Amendment 80 says name the bytes you graded; this is the same rule applied to reports — cite the file you can
point at, not the channel that carried the number.

The green row carried the same lesson inside its own exit 0. Read that isolated line end to end and §6 speaks in
the checkout arm's words, then three fields later the row prints `[summary] graded README bytes are HEAD's (git
show) and every counted test file is HEAD's (git diff empty)` — two claims about commands that cannot answer
where the row was graded. §0 had switched arms; the sentence written to be quoted had not, and §5's mutations
could not catch it because they mutate the table, never the prose about method. The summary now opens
`plane GIT:` or `plane NO-GIT:` and the checkout arm names the materialised ref bytes and §6's digest as the
substitute precondition. Switching a plane moves the reporting, not only the assertions: a green row that
describes its own method falsely is worse than a red one, because a red one is the only kind anyone reads
closely.

## The sweep that predicts its own reds (`plane-axis-proof.mjs`, M2 v93 — ADR 0016 amendment 93)

Amendment 92 explained 43 reds after they landed. This version asks the runner to say, before the first child
boots, which rows are about to fail and why — and then to grade that sentence against the verdicts it actually
received. `[identity] plane axis: 49/71 tracked proofs reach a git child process AT CODE POSITION (238 call sites:
program=114 argv=124) … a naive "the word git appears anywhere" rule calls 54, and the 5-row difference is prose and
comments, which cannot spawn (amendment 89) · this tree has NO .git, so these rows must fall back or go red`.

The scanner is `gitReaches(src)`, exported from the runner so the row and the runner cannot drift into two
grammars. Two shapes count: a spawn-family callee whose first argument is a git literal (R1, including both arms of
a platform conditional), and an array literal that opens with `'git'` (R2, the argv shape the exec-host's tables
use). Comment bodies and string bodies are dropped first and a `${}` returns the scanner to code — this is
amendment 89's code-position rule, aimed at a new word.

After the rows: `[plane axis] prediction vs verdicts: 49 rows predicted to reach git · red AND predicted 39 (of
which 35 name git in their reason line) · RED WITHOUT being predicted 3 (closure-proof.mjs, cwd-axis-proof.mjs,
drive-axis-proof.mjs; of these 3 do name git, so the rest fail for a cause of their own) · GREEN while predicted 10
… · an empty "red without being predicted" list is the gate`. The gate is not zero reds; on this plane 42 reds is
the correct answer. The gate is that no row fails for something the runner did not foresee — and the three it did
not foresee are its own two documented blind spots: a wrapper (`const sh = (cmd, argv) => execFile(cmd, argv)`, so
program position holds a *parameter*) and a frame away (through `sweep.mjs`'s exports).

Re-counted with the same imported rule over three earlier logs, the numbers are stable and only the bucket that
should moves: adfa403 `population 70 · predicted 48 · naive 53 · call sites {"program":113,"argv":124}` → 43 red =
40 predicted + 3 not; fd21c28 and 29ad568 → 42 red = 39 + 3. `green WHILE predicted 8` becomes 9 with
`table-recount-proof.mjs` added — amendment 92's healing appearing as a number in this ledger — and 10 at 69e7d20
with `plane-axis-proof.mjs`. The unpredicted trio is identical in all four runs.

Three counts of "names git" answer three questions, and the runner's arithmetic is checkable against all of them:
over this log `grep -ac '^FAIL '` is 42, the same lines matching `\bgit\b` anywhere is 41, and the CAUSE segment
after `||` is 38 — exactly its 35 + 3. The gap is a row that prints the word in its own stdout while dying on an
assertion (`hunk-shape-proof.mjs` announces `git "3 files changed, 2 insertions(+), 1 deletion(-)"` then fails
`history must hold the commit that WROTE that predicate: []`), which is the argument for scanning code and not
reasons: four red rows name no command at all and every one of them IS predicted.

The row itself measures the rule on both planes: `[§0] plane GIT … 73 tracked .mjs, of which 71 are scored rows`,
`sweep.mjs matches HEAD byte-for-byte (74000 B)`, `[§1] grammar cases exact: 15/15 — including 8 that must NOT
count`, `[§2] … 49 … the naive grammar calls 54` with the five prose-only rows named
(`changes`, `closure`, `code-index`, `cwd-axis`, `rolechain`), `[§3] the bridge exports 3 process entries (execFileSync,
spawnSync, spawn); all of them are in the list the scanner trusts`, and `[§5] census moves: +1 call site on
agent-proof.mjs → 1 · prose-only append → 0 (unchanged, as required) · every program literal renamed in
bridge-report-proof.mjs → 0 from 1`. §3 is the silent-shrink guard: a callee list that drifts makes the census
smaller and every number still looks plausible. §5 is the three-way mutation, because a checker that can only agree
with the runner has nothing to say.

One finding sits inside the new row and is kept because naming it is cheaper than being wrong about it. `[§4] blind
spot · parameter-bound program: 2` counts `plane-axis-proof.mjs` itself, caught by a word-shape regex matching a §1
test-case STRING — while `[§6] … 0 rows binding the program name to a variable` is a different grammar asking a
different question (`const X = 'git'`). The population census is unaffected, because the scanner refuses that
quotation on principle (§1 case 14 demands 0 reaches for exactly that shape); only the blind-spot list carries the
artifact of a method that was not held to its own rule. Running the blind-spot checks through `gitReaches` is the
first lane here, and a row declaring what it asks (`// sweep-asks-repository:`, in the grammar amendments 85 and 89
already established) is the lane that closes the three misses for good. The run: `OK plane-axis-proof.mjs (exit 0,
2063ms, budget 240000ms default)`, `[summary] ref 69e7d2023356 · scripts 71 · failed 42 · killed 0 · … · 115s`, home
build `UNMOVED (the isolation gate)`.

## The population can confess what the scanner cannot see (`asks-axis-proof.mjs`, M2 v94 — ADR 0016 amendment 94)

Amendment 93 gave the sweep a prediction: before a single row runs, `gitReaches` reads the ref's bytes and says how
many of them spawn a git child process, and afterwards the verdicts are reconciled against that sentence. It also
named, honestly, the two shapes the prediction could not see. One is a wrapper — `const sh = (cmd, argv) =>
execFile(cmd, argv)` — where a call-site rule looks for the program name and finds a parameter. The other is this
directory's own runner: a row that asks for its corpus through `sw.proofCorpus`, or for a clean checkout through
`sw.isolatedCheckout`, spawns git one frame below the bytes being scanned. Three rows went red on the
clean-checkout plane for a cause the prediction foresaw in general and could not name in any of them.

The fix is not a deeper scanner; it is a channel the caller owns. A row may now state, in a first-column comment,
what it asks the repository:

    // sweep-asks-repository: git rev-parse HEAD

The grammar is the one amendment 85 established for `// sweep-budget-ms:`, and it is read by the same walker that
counts call sites, so the two channels cannot drift apart by grammar: a marker quoted into a string, wrapped in a
block comment, or written after code on the same line is invisible to both. `asks-axis-proof.mjs` holds that to
twenty-two cases, eleven of which must NOT count, and then censuses the population twice — once by the scanner, once
by the confessions — and asserts that the two disagree. Today four rows declare, one is corroborated by the
scanner's own eyes, and three are visible only to themselves; if the scanner ever learns to see those three, that
assertion has to move, which is the point rather than an inconvenience.

The runner prints the declaration axis before any row runs and reconciles three sources afterwards: what the row
said, what the bytes show, and what actually happened. The gate is the number of reds with neither a prediction nor
a declaration behind them. A declaration buys foreknowledge and buys the row nothing else — it cannot skip a row,
cannot grant a fallback, cannot soften a verdict — and the run says so by keeping the older number still at three:
the rows that confess to reaching git still fall over on a checkout, because a checkout is a checkout.

One more measurement lives here because it is the kind of thing a table hides. Adding these declarations moved the
naive "the word git appears anywhere" count from 54 to 56, because the prose explaining a blind spot spells out the
word git, while the code-position count moved from 49 to 50 only because the new proof itself spawns git in a
wrapper. Same population, two grammars, two answers — which is why every number in this directory is printed with
the grammar that produced it.

## A confession gets two witnesses, and only one disagreement is a defect (`confession-proof.mjs`, M2 v95 — ADR 0016 amendment 95)

Amendment 94 let a row say what it asks the repository. Saying it was the point — three rows were red for a cause
no scanner could foresee — and it left a sentence in the log that nobody could check. This increment gives the
sentence two witnesses, one static and one dynamic, and grades it against both.

The static witness is the body a clause names. `git ls-tree + git cat-file --batch via sw.proofCorpus` points at
`proofCorpus` in the runner's own file, so the arm reads that function's bytes and asks which verbs a tokenizer
can see there. It gets `archive` for `isolatedCheckout` and `cat-file` for `catFileBatch`, and NOTHING for
`proofCorpus` and `runSweep` — those reach git by calling other functions. The interesting answer is the fifth:
`trackedProofs` writes `git(['ls-tree', '-r', '--name-only', ref, …], cwd)`, a verb literal sitting in the source,
and the arm still sees nothing, because the callee is the runner's private wrapper `async function git(argv, cwd)`
and its own call site hands a PARAMETER to `run('git', argv)`. The file that scans the population for hidden
reaches hides two of its own, behind a function named exactly `git`. Over the whole population: 12 clauses from 4
declaring rows, 2 supported, 9 invisible, 1 naming no command — and `invisible` here is not "caught lying". Every
one of those nine claims is true. It is unreadable from where the scanner stands, and the arm's useful output is
that it says which frame to cite to make it readable.

The dynamic witness is the failure the row predicted. A declaring row that goes red prints a cause, and a cause
line names a git command, so `compareConfession` asks whether the confession covers it — and the two readings are
deliberately not symmetric. An OMITTED verb is a defect: the row is the only reader of its own cause, so a
confession that leaves out what it just printed is unfinished. A SURPLUS is a fact: a row may reach five commands
and break on one of them, so surplus is stated and never scored. A cause that names no command at all is
UNCHECKED and printed as its own number, because a comparison that had nothing to compare is not a pass.
The run at 174fc1e answered with the empty value: 3 red rows that confess, 3 of them gradeable, 0 not gradeable,
**0 omissions and 0 silent blind spots**, surplus 5 — the three rows amendment 94 named are still red, on the same
causes, and each one's confession covers the failure it printed. The rest of the population agrees from the other
two arms: 51 rows predicted to reach git, 39 red-and-predicted, 3 red the scanner could not see and the row
declared, and 0 red that neither happened to. `73 scripts · 42 failed · 0 killed · 694s`, graded tree
`61265f575e9c6e92` over 194 files.

Naming a command means deciding what counts as one, so the list is not the author's: 38 names, held in both
directions against `git --list-cmds=main`, which answers with 179 verbs OUTSIDE a repository and is therefore the
first authority in this directory that is not the index. Over 74 tracked files, 159 distinct tokens follow the
word git and 142 of them are prose (`repository`, `call`, `child process`) — the whole reason for the gate. What
the gate gives up is recorded rather than patched: `git -c x status` names nothing here, because an option that
takes a value as its own token is not skipped and the matcher reads `x` as a verb. Scanning forward for "the
first token in my list" would fix that and manufacture defects out of prose instead, which is the amendment 91
lesson; so every number this arm prints is a floor.

The row holds the rules to mutations on both sides. Narrowing closure's real declaration until it drops the verb
the row died on yields 1 omission; widening it by a command the run never touched yields a bigger surplus and
still no omission; renaming `isolatedCheckout` inside the RUNNER'S bytes (not the clause) turns a supported
clause into an invisible one, which is what proves the arm reads a body rather than a name. Re-running the
siblings at the same ref moved only where a new row must move them: predicted askers 50 to 51, the naive word
count 56 to 57, the declaration census untouched at 4 rows with 1 corroborated and 3 not, and the README table
steady at 354 over 26 and 275 over 8.

Two things this increment learned by breaking, and both are now checked in two seconds instead of seven minutes.
The first is that the axis died on a KEY. Its first version lived inline in the runner and looked up two maps with
`row` where they are keyed by `row.name`; the second lookup threw, in the last line of a full population sweep,
after 73 rows had run and two of the three axes had printed. The first lookup would not have thrown:
`declared.get(row)` answers `undefined` exactly as it does for a row that says nothing, so the sweep would have
graded every confession as empty and reported each verb in each cause line as an omission — a manufactured defect
wearing a variable name. Those six lines are now the exported `gradeCauseArm`, which the census and the unit row
read from the same place, and §6 reproduces both directions of a wrong key: the object-as-key bug turns one true
omission into a phantom one, and a basename-versus-path mismatch silences `declaring` to 0 while the unheard rows
reappear as SILENT BLIND SPOTS, 0 heard against 4 blind. A reader that hears nobody cannot hide behind its own
zero, because the gate counts the rows it dropped. The second is that writing a test for one rule rang a second:
the argv rule reuses `GIT_PROGRAM`, whose `/^git\s/` half exists for `execSync('git status')`, so a DATA array of
command strings is a reach — §6's four claim payloads moved their own row from 11 reaches to 15 and the
population's argv census from 134 to 138, with no other file moving. That is pinned as two grammar cases rather
than fixed, because the over-claim is already reported where it hurts (`green while predicted`) and narrowing the
rule would rewrite the baseline amendment 93 keeps comparable.

## Nine sentences could not be graded, and it turned out they were two different problems (`confession-proof.mjs`, M2 v96 — ADR 0016 amendment 96)

Amendment 95 gave a confession two witnesses. The static one read the bytes a clause points at, found that only two
of twelve clauses could be checked, and called the other nine `invisible`. That word was doing two jobs, and the
proof of it is that the two jobs want opposite responses. In two of the nine, a frame the arm is allowed to read
held the command the whole time — the clause had simply cited the wrong place, and a comment edit grades it. In the
other seven, nothing the arm may consult names the command at all, because the reach hands its argv to a wrapper
that takes a PARAMETER: the runner's own `git(argv, cwd)`, or the row's local `sh(cmd, argv)`. Fixing the first kind
means writing a better sentence. "Fixing" the second would mean editing code so a checker can see it, and a rule
that pushes the population toward its own green is the defect this directory has been reddening for since
amendment 91.

So each clause now carries the split beside its state. `gradeConfession` compares what is missing against the set
of verbs that ARE nameable at code position anywhere in the runner or in the row's own bytes, and reports
`fixable` and `dead`. The four states keep amendment 95's meanings, because a record that gets relabeled is a
record that gets lost. The runner prints `MIS-CITED n`, and the row asserts it at zero — with a counterexample in
the same run, because a gate that has never reddened is a sentence. `git archive HEAD via sw.runSweep` is invisible
and mis-cited: `archive` is perfectly readable in `isolatedCheckout`, the clause just did not point there.
`git archive HEAD via sw.isolatedCheckout` is supported. A five-case table beside them differs only in which verb
and which frame each clause names, and one of those holds both residuals at once.

The census before and after was measured, not remembered: `12 clauses · supported 2 · invisible 9 · fixable 2`
became `14 clauses · supported 4 · invisible 9 · fixable 0`, with those nine invisible clauses' dead verbs
resolving to five names —
`diff, ls-tree, rev-parse, show, status`. `invisible` staying at 9 while the total grows is the split itself: each
two-command claim became one claim the arm can read and one it provably cannot. And the ceiling has an address.
`trackedProofs` writes `git(['ls-tree', …], cwd)` in the runner's own source, and the arm sees nothing, because the
callee is the private wrapper named `git` whose body forwards a parameter — the file that scans the population for
hidden reaches hides two of its own, and now says so with a number instead of a shrug.

Two consequences worth keeping. The row's own file had to stop quoting another row: §4 used to carry a retyped copy
of closure's declaration, and once the declaration changed that copy would have graded a sentence no commit owns —
the amendment 89 mistake, in the file whose job is to catch it. §4 now reads the payload out of HEAD and insists the
command set is the four expected verbs. And the population's argv census moved 138 → 143, all of it attributable:
six new case lines each carry a command-string array (which amendment 95 pinned as a reach), the `no-command` case
adds nothing because its array does not open with `git`, and the retired quotation subtracts one. The pinned
over-prediction fired on the increment that cited it, and the arithmetic still closed.

Nothing about a verdict moved. 73 rows, 4 declaring, 1 corroborated by the scanner, 3 visible only to the row
itself, 51 predicted askers, 57 under the naive grammar, the graded-tree digest unchanged because no graded file
changed — and `table-recount-proof.mjs` still has one reach that names no verb, so its five true claims stay
unreadable until it cites the frame where its literal really lives. A better sentence buys a reader; it buys the row
nothing.

## The walk knew comments and strings but not the third way a character can hide (`confession-proof.mjs` §7, M2 v97 — ADR 0016 amendment 97)

`gitReaches` and `relativeSpecs` are hand-written walks: they know a quote, a backtick, a `//` and a `/* … */`, and everything else is code. A regular-expression literal is a fifth thing, and it was missing. So the closing `/` of a pattern read as a division, the text between two slashes read as code, and every string/code pairing after it in the file was inverted. That is not a rounding error in a census; it is the census reading the file backwards.

Two rows, one sign each, found in the same sweep. `intent-proof.mjs:227` carries `/^git's last line$/` — an apostrophe inside a pattern, which opens a "string" that no quote closes until some later line — and the real `execFileSync('git', ['rev-parse', 'HEAD'], …)` at the foot of that file was invisible at every ref before this one. `spawnlog-proof.mjs:187` is the opposite infection: an `assert.match` whose pattern is the escaped, JSON-quoted argv of a refusal the row is quoting, which nothing spawns, counted as an argv reach. The fix is `regexPosition` (can the code before a `/` end an expression? identifier char, `)` and `]` divide; `}` and the fifteen expression-starting keywords do not), plus `regexLiteralEnd` (character classes and escapes honoured, and a candidate that does not close on its own line is a division after all). Two guards keep the heuristic honest: `//` and `/*` are a comment before they are ever an empty pattern, and a skipped regex leaves a `VALUE_END` sentinel in `code`, because an expression that just ended is precisely what cannot be followed by a pattern.
The witness for this is §7 of `confession-proof.mjs`, and it does not grade the new code against itself: its last case slices the arm-less grammar out of `5551327`'s committed bytes, imports it from a temp directory, and requires that THAT walk both loses the `intent-proof` reach and gains the `spawnlog` one. The four cases beside it are the confusions a regex heuristic can create — a division on both sides of the slash, a character class holding an unmatched `(`, the comment channel, and a declaration inside a string — and the two live rows are pinned by their content, not by a count that any other line in the file could satisfy. acorn agrees with the fixed walk over the whole population and is not allowed in: `git archive HEAD` ships no `node_modules`, so a proof that imports a parser cannot run on the clean-checkout plane where these numbers mean anything.

What a grammar fix should look like: the census moves and no verdict does. At `194bc99` the population is 73 rows · 42 failed · 0 killed in 146 s, with `program 116 → 117` and `argv 143 → 142` and every axis figure unchanged — 51 predicted askers, 57 under the naive rule, 4 declaring rows (1 corroborated, 3 invisible), 14 clauses · supported 4 · partial 0 · invisible 9 · MIS-CITED 0, the same five dead verbs, both reconciliation gates at zero. Three rows moved in total, each one named by a differential replay rather than by a hope. And `confession-proof` itself gained a reach, because its new fixture writes `['git', 'status', …]` as a case: the pinned over-prediction from amendment 95 firing on the increment that cites it, for the third time running, kept on purpose.

The retracted number is the useful one. #152 was written down as "read a verb through a callee named `git`", expecting ~26 argv-forwarding aliases; re-measured through the fixed grammar it is 31 rows defining a git-named helper, 29 forwarding a program literal, 28 whose verbs would become readable — and the dominant shape is a REST parameter (`git('rev-parse', 'HEAD')` into `['-C', dir, …args]`), not an argv one. The name carries no information about WHICH repository is asked: `-C` and `cwd:` are two different redirects, and 18 of the 29 bodies carry neither, so they address whatever cwd the sweep gave the child. A naive alias rule would print thirteen verbs, most of them spent on throwaway repos in `os.tmpdir`. The rule that survives the measurement reads 3 rows and 6 verbs — among them five of `table-recount-proof`'s own claims, which the paragraph above has been promising a reader to since amendment 96.

## A helper's name says nothing about WHICH repository it asks, so only one that carries no location may be read (`confession-proof.mjs` §8, M2 v98 — ADR 0016 amendment 98)

Amendment 96 ended with a ceiling named as a fact about the code: nine `invisible` clauses over five `dead` verbs,
"every reach carries its verb through a wrapper that takes a PARAMETER", liftable only by rewriting the code. Half
of that was wrong in a checkable way. A wrapper that takes an argv is CALLED somewhere, and the call site normally
holds the verb literal: `table-recount-proof.mjs` declares five commands, and its bytes do name all five — as
`git('rev-parse', '--show-toplevel')`, `git('show', 'HEAD:docs/…')` and three more. The arm missed them because it
looked only inside a spawn frame's own argv, and there the argv was a parameter. So the arm opens one frame now. A
same-file helper whose body spawns `git` is an alias, and the string literals its call sites pass in the argv
position are commands the row asks.

The refusal is the increment. A row may prove something about a throwaway repository and about this one in the same
file, and a census that read both as "this row asked the repository" would manufacture a claim about the real tree
out of a command aimed at `os.tmpdir`. So an alias is readable only when nothing in its own bytes can move the
question elsewhere: no `-C`, `--git-dir`, `--git-common-dir` or `--work-tree` string anywhere in its body; no `cwd`
key in its spawn options in either spelling; and no parameter arriving in the OPTIONS position, because that is how
a wrapper lets its caller pick the directory. Two looser rules were run over the whole population before this one
was written, and the numbers say why they were dropped. A naive "read every git-named alias" credits 28 of the 73
rows with 14 verbs, and 18 of those 28 name a redirect in their own bytes — the verbs it would invent are `init`,
`config`, `add`, `commit`, `rm`, `reset`, the plumbing of a repository being built inside a temp directory. The one
looser variant that looked tempting, refusing only the text `cwd:`, misses the shorthand `{ cwd }` sitting in the
same options object, and that is the runner's own wrapper: `git(argv, cwd)`, whose directory belongs to whoever
called it. What survives all three doors is **2 rows** — `table-recount-proof`'s `git` and `bridge-report-proof`'s
`gitText`, both rest-parameter forwarders with no location anywhere. Eight further rows have a helper the arm
looked at and declined, and each of those eight is recorded with its reason; every other git wrapper in the tree is
dropped one filter earlier, silently, which is a fact about the census and not just about this run.

§8 of `confession-proof.mjs` grades that in both directions, and it is the refusal, not the reading, that the
section exists to hold. Six fixtures: the rest-forwarder the arm now reads; the `-C` twin; the literal `cwd:` twin;
the runner's own `(argv, cwd)` twin; a call site that hands over a VARIABLE, where there is no verb in the source to
read; and a wrapper whose PROGRAM position is the parameter, which is not a git alias at all. Then the population,
pinned by content instead of by a total any unrelated edit could satisfy: exactly two rows readable, and
`table-recount-proof`'s five clauses supported by the alias arm ALONE, since its direct spawn frames name no verb.
Then three mutations, each deleting one redirect from a fixture and requiring the same clause to move from
`invisible` to `supported` — a refusal no edit can reverse is a preference, not a rule. And a fourth mutation that
must NOT lift anything: delete `cwd` from the runner's options and the second parameter is used nowhere, so the
helper stops being an alias by the rule's own definition, which is precisely why `closure` and `cwd-axis` keep their
invisible clauses. The ceiling is code-deep, not comment-deep, and §8 asserts the ceiling as well as the reach.

What the witness reported, at the §8 ref `6bdb3cf` (73 scripts, 42 failed, 0 killed, 402 s, graded build
`cc73dcf781dd0a2b` stable across the run): the confession axis moved to `supported 9 · partial 0 · invisible 4 ·
name no command 1`, the four residual invisibles being three `closure-proof` clauses and one `cwd-axis` clause over
the three verbs `ls-tree`/`rev-parse`/`show`, `MIS-CITED` still 0, and `confession-proof.mjs` itself green in
149 s of its 240 s budget. The plane axis moved `260 → 261 call sites`, `program=117` unchanged and `argv 143 → 144`
— not the `+5 program` predicted for the §8 fixtures, because a fixture written as a string literal is a mention and
the one new `argv` reach is `confession-proof.mjs:412`'s `DECL` array, whose head string OPENS with `git ` and so
borrows the argv rule's `^git\s` test. `plane-axis-proof.mjs:86` already pins that shape as an over-prediction with
its expected count in the table, and the axis's own `GREEN while predicted` list names `confession-proof.mjs`, which
is where an over-claimed row that never breaks is supposed to show up. Full account in amendment 98's addendum,
including the runner sentence the increment left stale.

## The residual's explanation was written from memory, so it got a computation and a witness (`confession-proof.mjs` §9, M2 v99 — ADR 0016 amendment 99)

The confession axis ended its sentence with a reason: invisible clauses were invisible "because every reach carries
its verb through a wrapper that takes a PARAMETER, so only the CODE could name it". Amendment 98 refuted that
explanation and the runner kept printing it anyway, alongside a comment block that illustrated the unreadable case
with a helper the alias arm now reads. Prose has no witness, so nothing reddened. §9 gives the sentence one.
`aliasCeiling` buckets each row whose clause is dead by WHO CAN CLOSE IT: `declined` (the row owns a helper the arm
classified and refused out loud, and the bucket names the door — delete the location from that helper and the clause
lifts), `readable` (the row owns a working alias that reaches another verb, so the clause is `partial` and the edit is
a second literal at its own call site), and `silent` (the spawning frame is not the row's at all, so no row edit lifts
anything — this file's own `git(argv, cwd)` is on this face). The axis line interpolates those three counts and names
the rows in each, so the explanation is now downstream of the grammar instead of a memory of it.

The witness walks the faces with four fixtures, and the pair that matters differs by one `, { cwd: root }`: on a
row-owned helper the deletion moves the clause `invisible → supported` and the row off the declined face; on a borrowed
frame the same deletion changes nothing, which is the sentence's claim rendered as a mutation. Then it turns the arm on
the runner's own words: it reads the committed axis line, strips double-quoted spans, and requires the refuted
sentence to survive only as a citation — with a paired assertion that the citation is present, so the strip cannot
quietly pass a line that has forgotten the refutation. That check is amendment 89's rule ("a quotation wears an
import's shape") applied to prose, and it was written after the first version reddened against the runner honestly
quoting the sentence it had just refuted. The live population now reads `4 invisible clauses over 2 rows, 0/0/2 by
face`: every remaining blind spot is on the face no row can close, and the axis says so with a number it computed.

## A face the arm cannot name is a face it cannot be wrong about, so every filter now has a reason and every reason a fixture (`confession-proof.mjs` §10, M2 v100 — ADR 0016 amendment 100)

Amendment 99's third face said "the arm has no verdict here", and the sentence was unfalsifiable in a way the other
two were not: `gitAliases` recorded a refusal from one of its six filters and returned nothing from the rest, so the
census could enumerate what it declined only when the decline happened to be the `cwd` key. `aliasVerdicts` replaces
that side channel with `readable` / `refused` / `notAlias`, one `why` per entry, and the guarantee is arithmetic: the
entries across all three buckets are exactly the file's definitions, matched by offset. Over the 73 scored rows the
population speaks 354 verdicts for 354 definitions — 2 readable, 41 refused (8 by the `cwd` door that used to be the
only voice, 21 redirect-flag, 12 options-position), 311 not-an-alias. Compared against what amendment 98 recorded, 33
refusals had been occurring silently in the same files, three of them in the runner itself: `git`, `committedBlob`,
`catFileBatchOptional`.

§10 carries eight fixtures, one per reason, each asserting the bucket and the `why` for a single-definition source,
then walks the population with two invariants — one verdict per definition, and no reason in the census that §10 has
no fixture for, the admissible set being derived from the cases so a new door cannot join the silent face by
oversight. One reason died on the way: `no-argv` had no reachable shape, since the finder keys on the comma after the
program literal and a call cannot be written with nothing after it, so the branch was folded into the one above it
rather than kept as an untestable claim. And one over-claim is recorded instead of repaired: `refused` counts
definitions whose `git` sits in a comment or a string, because the candidate finder greps its text region — in this
repo that is why `spawnSlices` and `quotedIn` are "refused for redirect-flag". Every such case ends in a refusal, the
safe direction, so fixing it would widen the channel the ceiling exists to bound; the increment that gives the
finder the byte walk's comment/string arm owes a prediction about which way that number moves.

## A refusal census nobody could explain, because the arm was refusing sentences about helpers (`confession-proof.mjs` §10, M2 v101 — ADR 0016 amendment 101)

Amendment 100 counted 21 `redirect-flag` refusals in the scored rows and could not say what they had in common,
because the candidate finder grepped raw text between definition offsets: a function whose neighbour's documentation
contains `execFileSync('git', …)` looks like a git helper that redirects, and gets refused for it. The arm now asks
one question before it consults any door — does this definition reach a git child AT CODE POSITION? — and it asks it of
`gitReaches`, the same walk the plane axis uses, so the refusal census and the reach census cannot tell different
stories about the same bytes. Candidates that fail the question are not refused; they were never candidates, and they
move to `notAlias` under `no-code-position-git-spawn`: over the 73 rows: spoken 355/355, readable still 2, refused 41 → 40 (`redirect-flag` 21 → 20,
`cwd` 8 and `param-in-options` 12 unchanged), with `notAlias` gaining `no-code-position-git-spawn` 7 while
`no-params` fell to 5 and `param-outside-spawn` to 38. Over all 75 `.mjs` the scratch pre-measurement said
48 → 44 with 11 demotions — a different denominator, stated as one.

The reason was renamed after the witness contradicted it. `mention-only` was the obvious label, and §9's fixture for
the declined face (`const git = (args) => sw.runSweep('git', args, { cwd: root })`) fell off the face with the new
rule — a bridge outside `SPAWN_FAMILY` also answers "no reach", not because the `git` is a mention but because the
program position is a call the plane grammar does not read as a spawn. Two mechanisms, one observable fact, so the
label describes what the arm sees. §9's OWNER and PARTIAL fixtures moved onto `run('git', …)`, which the grammar does
recognize: a pair about who holds the edit cannot be demonstrated with a helper that is no longer a candidate. §10 now
carries ten reason fixtures, and the decisive one is the pair of sources identical except that one spawn is wrapped
in `/* … */` — same name, same argv slice, `readable` against `no-code-position-git-spawn`.

And the first prediction written into a commit message before the sweep it owes was wrong about its own base: the
message said the row would print `spoken 354/354` and `redirect-flag → 19`, and it printed `355/355` and `20`. The
discrepancy is one definition in the base — my pre-measurement script and the shipped row, over the same HEAD tree,
differ by one, and three probes (comments, strings and templates, both runner revisions) each returned "no phantom,
355". That gap is recorded rather than papered over, because it says something about the method: a census you cannot
reproduce with a second tool is not yet a prediction anchor. Reconciling it is #157.

### Amendment 101, addendum (same cycle): the gap had a name, and it was my base

The paragraph above handed a "one-definition gap" to the next increment. It closes inside this one: counting the 73
scored proofs at ref `012f1f3` and at `3c097ea` with the same shipped `definitions()` gives 354 → 355, and the only file
that moved is `confession-proof.mjs` itself, 12 → 13, the thirteenth definition being `ONE` — the helper §10 grew today
so its ten reason fixtures could be graded through a single function. Nothing was phantom and nothing was wrong with
the census: the row that censuses `docs/evidence/agents/*.mjs` is a member of that population, so every edit to the
row moves the very total it prints. What was wrong is that I anchored a prediction on the previous run's total, which
is a measurement of a different tree. Two consequences are recorded rather than argued: totals across runs must carry
the ref they were counted at, and §10's invariant form (verdicts === definitions, per file, this run) is the one that
cannot go stale — which is why #157 is now about printing the ref beside the totals and asserting a `git show <ref>`
census equals the in-row one, so a stale-base prediction reddens a row instead of writing a wrong sentence into an ADR.

## The census counts the file that prints it, so its totals now name their ref and prove they see themselves (`confession-proof.mjs` §10, M2 v102 — ADR 0016 amendment 102)

Amendment 101 predicted `spoken 354/354` from the previous run and the row printed `355/355`. The cause was not a
phantom in the scanner — it was the shape of the measurement: `confession-proof.mjs` counts definitions across
`docs/evidence/agents/*.mjs`, and that set contains the counting file, so growing §10 by one helper grew the census by
one. A total like that has two honest uses — as an invariant inside one run, and as a datum with a ref attached — and
one dishonest use, which is as a baseline quoted from yesterday. The row was doing the dishonest one and calling it a
prediction. The first version of the anchor then failed where it had to be asked: `git rev-parse HEAD` has no answer on
the isolated plane, because the row's own loader reads from disk when there is no index — the sweep reported one extra
failure and it was mine, while five siblings and a standalone run had all been green on the bug, since all four had an
index to lean on. So the ref is GIT-plane-only and the other plane prints `recount basis: the same disk read — …
UNCHECKED rather than corroborated`, which is amendment 86's rule that a tautology may not be booked as a pass.

§10 now prints `spoken 355/355 definitions counted at <sha>`, re-derives the same total from `git show <ref>:<path>`
for each row and asserts it equals the loaded population (so a census that silently read the worktree, or a
materialised tree, contradicts itself rather than printing a clean line), and grades the self-inclusion instead of
narrating it: appending a sentinel function to this row's own text has to move the count by exactly one, and it does
(`356`). No rule in the runner changed, so the axes were expected to hold — `262 call sites / program=117 / argv=145`
and `supported 9 · partial 0 · invisible 4 · no-command 1 · MIS-CITED 0` — and the confirmation run is recorded with
the amendment. The carry-forward form: a row that censuses a population containing itself may report invariants and
ref-anchored counts, and may predict the quantities its own edit moves, but the number it printed last run is
evidence about a different tree.

## A verdict cannot say which tree it was reached in, so each row's own plane self-report is now read, counted and reconciled (`provenance-proof.mjs` §8, M2 v103 — ADR 0016 amendment 103)

Amendment 102's row died only inside the isolated checkout, because a proof reads its population from `git show HEAD:`
where an index exists and from disk where it does not — and after the fact, exit 1 is the same shape on both trees. The
sweep already had verdicts, reasons and error windows per row; what it never had was the property that decided the
outcome. Each row record now keeps `head: headOf(stdout, 4)` beside its tail, and `planeCensus` splits the run into
rows that said `plane GIT`, rows that said `plane NO-GIT` and rows that said nothing, printing the three counts and
naming the silent ones. A row claiming the GIT plane inside a tree the runner knows has no index is printed as a
contradiction, which is amendment 80's and 83's failure mode arriving from the other direction: a finding about a
repository the row brought with it.

§8 grades that reader on four shapes — two banners, a verdict that discloses nothing, and prose that happens to write
the words "plane GIT". The last is pinned as an OVER-disclosure with its behavior asserted rather than narrowed away:
a pattern tight enough to ignore prose is a channel that only fires when a row is formatted as its author expected.
The section also requires the three buckets to sum to the rows given (a remainder is how a self-report channel goes
empty unnoticed), names the silent rows by file, and anchors the whole thing to the banner `confession-proof.mjs`
actually prints, so the fixtures are not the only bytes being read.

## The runner stopped asking rows to describe their tree and supplied the answer, then graded the difference (`provenance-proof.mjs` §9, M2 v104 — ADR 0016 amendment 104)

Amendment 103's live line was its own diagnosis: 4 of 73 rows said which plane they stood on and 69 said nothing, so
the report was a distribution over a channel nobody had been asked to fill. Making the banner mandatory would have been
the checker pressuring the population to write prose for its log — amendment 91's rule, applied now to the runner
itself — so the runner answers its own question: `suppliedPlane(cwd)` asks whether the directory a child is spawned
into has an index, the fact that decides whether `git show HEAD:` inside a row can work at all, and hands it over as
`NEXUS_PROOF_TREE`. `planeCensus(rows, supplied)` compares each speaking row's banner against that supply, so the four
disclosures become corroboration, the 69 silences become covered, and a row claiming `plane GIT` inside a tree with no
index becomes a named contradiction rather than an untested hope.

§9 grades the supply on three shapes — bare directory (NO-GIT), index directory (GIT), and a linked worktree whose
`.git` is a file (GIT), the case a directory-only probe would have called git-less — and requires the reconciliation to
be a PAIR that flips: which row agrees and which contradicts must swap when the supply swaps, because a comparison that
reads the same from both directions is a value checked against itself. Nothing may be scored as agreement when nothing
was supplied, since that is exactly how an empty channel looks healthy. And the wiring is asserted out of the committed
runner, so §9 cannot be grading a function that no call site uses.

## A hand-off nobody confirms is an action reported as if it were an effect, so the marker is echoed and the two words compared (`provenance-proof.mjs` §10, M2 v105 — ADR 0016 amendment 105)

The previous section's log line said the runner `SUPPLIED NO-GIT to every child`, and that sentence would have stayed
true if no child ever read it. So `confession-proof.mjs` now repeats the marker back in its own first line —
`supplied NO-GIT`, or `supplied ABSENT` when the hand-off failed — and `planeCensus` keeps echo apart from disclosure:
`echo` counts rows that repeated it, `echoAgree` the ones matching the supply, `echoLost` the ones reporting that it
never arrived, `echoContradict` the mismatch. The readings are separated on purpose. Saying `ABSENT` cannot be booked
as agreeing with a fact the row says it did not receive (amendment 86's rule, aimed at silence). An echo with no supply
on this plane is a contradiction, not a free pass, so the comparison needs both ends to be satisfied. And mentioning a
plane is not the same channel as repeating the marker; merging them would let a row that never looked at its
environment confirm it.

§10 holds a fixture per reading and asserts both ends of the wire out of the committed bytes — the row must still echo,
the runner must still hand the value over — because either half can be deleted later without changing a single verdict,
and the comparison would go on printing while meaning nothing.

## The reader that decided which tree a row stood on was wrong one directory below a root, so the question now has two readers and they print whether they agree (`provenance-proof.mjs` §11, M2 v106 — ADR 0016 amendment 106)

Amendment 104 handed every child a `NEXUS_PROOF_TREE` value computed from `existsSync(cwd/.git)`. That is a local
inference, and git does not answer that question — git resolves upward. Measured on this repository, `docs/evidence`
has no `.git` inside it, so the probe says NO-GIT while `git -C docs/evidence rev-parse --is-inside-work-tree` says
`true`, and a row spawned in such a directory can run `git show HEAD:` all afternoon. The bug was latent only because a
sweep happens to spawn rows at a root, and "latent" is not a property of a channel whose whole job is to tell a row
where it is standing.

So `planeReaders(cwd, askGit)` asks git and keeps the local probe beside it. Where git answers, git wins; where git
could not answer, the probe decides **with the reason printed** (`git unusable (gitFailed:EPERM), the local probe
decided`), because a git that failed is not a git that found no repository. The answer space is pinned rather than
assumed: exit 128 together with git's own fatal message are the only answers allowed to mean NO-GIT, and anything else
is NAMED (`unparsable:perhaps`) instead of being defaulted into a plane. §11 measures all of that on the live
filesystem rather than on fixtures — this repository's own `docs/evidence` diverges (probe NO-GIT, git GIT, and the
marker the row reports follows GIT), while the repository root and a bare temporary directory both agree, which is what
distinguishes a nested-case property from a generally-broken probe. It also asserts the wiring out of the committed
runner bytes, so the witness grades the shipped path and not a re-implementation of it.

This section is written now, from the committed reader and the committed §11, not in the increment's own commit — the
same late-recording §60 has been filing against all session.

## A run now says which host world it happened in, and the prediction written above that line was wrong, so both are printed (`sweep.mjs` `[identity]` host probe, M2 v107 — ADR 0016 amendment 107)

Amendment 86 built `docs/evidence/lib/syncproc.mjs` on a host fault: a plain `spawnSync(node, ['-e', 'process.exit(0)'])`
can come back `EBUSY` on this machine. Every reader that depends on that bridge inherits the fault, and nothing in the
population could say whether the bridge was load-bearing for the run being read. So the runner asks NODE — never the
bridge, per `syncproc.mjs`'s own rule — and prints the answer before any row runs, because "this run depended on a host
fault" is an identity fact, not a row result: either
`sync spawn API on this box: BROKEN (EBUSY) — … docs/evidence/lib/syncproc.mjs is LOAD-BEARING for every importer
below`, or `answers (status 0, no error) — … the amendment 86 host fault is NOT present in this run`, which is still
true information about the other branch.

The commit that added the line predicted the second reading on this box. Re-measured for the record, it does not hold:
the probe fails `EBUSY` 6 times out of 6 and `syncApiIsBroken()` returns `true`, so the line prints the first reading.
The code was right and needed no change; the wrong thing was a documented expectation nobody re-took, which is the
recurring failure mode this README keeps filing (§60) and the reason this section carries the refutation beside the
description rather than quietly restating the number. The probe costs one spawn per full run and adds no import edge.

Written now, from the committed line, rather than in the increment's own commit.

## A falsifier that copies the number it is supposed to perturb keeps passing after the number moves, which is a claim about a snapshot rather than a mechanism (`table-recount-proof.mjs` §5, M2 v110 — ADR 0016 amendment 109)

This README's own unit-test table is graded by a row that recounts vitest output per file and then asks
itself whether it could be red: four mutations of the table, each expected to be caught by the reader that
calls the unmutated text clean. One of those mutations was written as a literal string swap —
`sum to exactly **354**` → `**353**` — so it did not read the total it perturbs, it remembered it. When
four committed test files (`agentRegistry` 17, `browserTools` 20, `multiAgentPipeline` 12, `vectorStore` 6)
were finally entered and the live prose moved to **409 over 30 files**, that mutation stopped matching
anything, returned the README unchanged, and reported itself as executed. §5 caught it only because a
surviving mutation is named: `MUTATION SURVIVED: the prose total loses one — this checker cannot see the
defect it is claimed to catch`. The control was clean and the report was accurate; the falsifier was the
broken half, and a no-op mutation is indistinguishable from a passing one unless the target is derived.

So the case now captures the digits out of the prose it is editing and subtracts one, which makes it bite
whatever the total currently is. Read the other way: a mutation battery is a set of *programs*, and each one
has to satisfy the same rule as the checker it tests — take the value from the artifact, never from a copy
of a measurement someone made earlier.

Ordering note worth keeping: `table-recount-proof.mjs` refuses to grade README bytes that no commit owns, so
the workflow for a table change is patch → commit → re-run, and anyone who expects to verify locally before
committing will read a §0 red as a defect in their repair. Measured at `47a7537` that way: rows 409/30 and
275/8 matching their own recounts, 0 failing tracked cases, `control clean · mutations caught: 4/4`, exit 0.

## Run the witness on the plane the rows are graded on, and build that plane in four seconds if you cannot afford a sweep (`provenance-proof.mjs` §11, M2 v110 — ADR 0016 amendment 110)

Amendment 106 added §11, the section that reconciles the two readers of "is there a repository here?". It was green
everywhere it had been run — which was one plane. On the isolated checkout 42 of 73 rows live in, this row's first
line was an unconditional `git rev-parse HEAD`, so the child died before printing and the sweep could only report
`(no stdout — the child never reached a print)`. The witness had never once executed where its own subject runs. The
fix moves it to the top of the file and splits it honestly: the cases that need only a directory (a bare temp dir, an
unusable git, an unparsable answer, git's exit-128 answer) run on both planes, while the subdirectory divergence and
the repository-root case run only where a repository can stand in — the other plane prints them as `UNCHECKED rather
than corroborated` and reads the runner from disk instead of `HEAD`, saying so.

Getting to the second plane cost a `cp -r docs` into a temporary directory and one run — seconds, not a sweep — and
it immediately reddened an assertion this change had not touched: the exit-128 case required `diverged === true`,
which is a fact about the local probe, not about the answer git gave. Both planes now derive that expectation from
the probe they measured. Read as a rule: if a check has only ever run in one environment, its literals encode that
environment, and building the other environment is the cheapest way to find out which ones.

Measured: GIT plane exit 0 with subdirectory `["NO-GIT","GIT","GIT"]` DIVERGED; no-index plane exit 1 whose stdout
carries `[§0] plane NO-GIT` and `[§11]` before the HEAD sections fail for their own reason. The detached sweep at
`24589f2` then confirmed every predicted number — 73 rows, 42 failed, 0 killed, `GIT 0 · NO-GIT 5 · mute 68`,
echo `1/1/0/0`, plane axis 262 sites `program=117 argv=145`, confession `9 · 0 · 4` with `MIS-CITED 0` — and the row
whose silence started all this now appears as a red that prints.

## The ledger and the records that cite it (table-recount-proof.mjs §7, M2 v111 - ADR 0016 amendment 111)

A doc table is a claim (amendment 91), and so is a ledger. §7 enumerates the ADR amendment headings (106,
addendum lines excluded) against the record corpus - docs/evidence plus docs/ROADMAP.md, 94 files, with
docs/decisions excluded because each ADR numbers its own amendments - and refuses any explicit citation of a
number the ledger never granted. Measured at this landing: dangling 0, after policyaudit-proof line 1 was
retargeted to the amendment that actually owns that proof; one-sided 1 (Amendment 21, named on the console line
and NOT refused until its record can be read out of the ledger rather than invented); and 2 amendments whose
explicit citations survive only in code, never in a doc. Two grammars are kept apart because the text demanded
it: amendment N and am. N point at a record, while a version label (M2 v0-v14) or a prose range (am. 4-5) does
not, and treating either as a pointer manufactures defects in healthy docs. §7 mutates both directions: a
fabricated citation must be named dangling, and renumbering a CITED heading must leave its citations dangling
while the new number appears one-sided - gaining exactly the baseline entry, and proving first that the
mutation rewrote exactly one line, because a mutation that matches nothing is not evidence of anything.

Addendum (§7, amendment 111): the owed detached sweep ran at 00bf2ef74dec and held all six predictions — 73
rows, plane axis 262 sites program=117 argv=145, confession 9·0·4 with 0 ungradeable, self-report GIT 0 ·
NO-GIT 5 · mute 68, echo 1/0/0, and table-recount-proof itself green inside the full run at 19151ms. Addendum
lines are deliberately NOT amendment headings: §7 counts headings, and a redeemed promise must not move the
census it is being redeemed against.

## Record titles, not sentences (table-recount-proof.mjs §7, M2 v112 - ADR 0016 amendment 112)

A doc table is a claim (amendment 91), a ledger is a claim, and so is a door's own report line. Amendment
111 shipped a report-only axis - amendments the ledger grants that nothing outside it repeats - and it
closed itself the moment the README section describing it named amendment 21: a sentence ABOUT a hole is
a mention OF it. §7 therefore reads the same 94-file corpus twice. The mention reader scans every line
with both grammars; the title reader scans only record titles (a `#` heading in a doc, or the first eight
`//` lines of a proof) with the same grammars and nothing else. Measured at this landing: no mention at
all 0, no record TITLE 2 [21, 108] - 21 is named only in this README's prose and 108 only in a ROADMAP
table row, and neither is a record for its amendment. Both stay NAMED, not refused, for amendment 90's
reason: their increments were not performed by this cycle, so this cycle cannot write their records
honestly.

Containment is asserted rather than argued (a title line is a line, so the any-mention hole is always
inside the title hole) and it is checked on EVERY census the section builds, including the mutants,
because the baseline it would otherwise check has an empty list to check.

The house-style trap, found by a mutation that refused to work: the mention grammar refuses a number
followed by a dash - that is what keeps `am. 4-5` from posing as a pointer - and the ledger titles
itself "Amendment 21 - v21: host-verified UI runs", so a record title written in that style is credited
ONLY through its version label. A dash-tolerant title grammar was measured and rejected: over the real
corpus it changes nothing, and it would sever the containment. So write your README section heading with
the amendment version label in it (this section does, and §7 credits 112 for it) or the door will keep
saying you did not write a record.

§7 mutates the axis three ways, all derived at run time: the ledger's own heading text for the first hole
number appears in the README and the hole shrinks by exactly one (41f002e measures 2 to 1); the same
number in a sentence leaves the hole where it is, which is the case that keeps this door from being
satisfiable by its own report; and the README heading that is the SOLE title for a number gets every
digit scrubbed, so the hole gains exactly that number back (measured: heading 541, amendment 20) while
dangling does not move.

## Record titles are positional, and the newest grant must have one (table-recount-proof.mjs §7, M2 v113 - ADR 0016 amendment 113)

Amendment 112 made §7 ask "does any record carry this number as its TITLE" instead of "is the number
mentioned anywhere", and left the `.mjs` half of that reader reading any comment line among a module's
first eight. This section closes that seam. A module's title is the comment line that OPENS it (line 2
when line 1 is a shebang): below that line the header block becomes the module's abstract, and an
abstract that recites "v81 did this, v82 did that, v83 did the other" is one sentence about three
increments, not a record for any of them. That sentence was real — it is `drive-axis-proof.mjs:4`, and
under the window it made amendment 82 look recorded. Read positionally the hole is 21, 82, 108 and
nothing gains a title it did not already have, because the rule only removes.

The rule is about POSITION and never about a count, and the row says so with a measurement rather than
with confidence: 34 title lines in this tree credit more than one granted number, including proofs
whose real opening line names three of them. So a door that refused "titles" for naming two increments
would be refusing the population's normal style. What it refuses is narrower and affordable: the
NEWEST grant in the ledger must carry a title somewhere in the corpus, because that is the one number
whose author is the cycle currently holding the bytes. Scanning down from the top, 112, 111, 110 and
109 are titled and 108 is not — which is what the refusal would have caught at its own commit, and why
108 is a finding rather than a pass. Older holes stay NAMED in full with what each one has (a citation,
a version label, or nothing) and are not refused here: a record for an increment this row did not
perform would be a record invented, and that is exactly what amendment 90's title warns a table author
against.

Two author-facing consequences, since this door judges how the next record is written. A record title
must carry its increment's VERSION LABEL: the ledger's house style is a heading of the shape
"Amendment 21 — v21: …", the em dash makes the citation grammar refuse the phrase, and the `v21` is
what actually credits it — so a README section titled only with a dash-ended amendment number stays
unrecorded in this door's eyes. And a sentence about a hole no longer counts as its record: writing
"amendment N has no record yet" into the README moves the number's credit but never its title, which
is the difference between reporting a finding and closing one.


## The isolated plane is a repository, not a pile of files (sweep.mjs — M2 v132 — ADR 0016 amendment 132)

`--isolated` is the plane a sweep uses to grade a ref's proofs against the ref's OWN build rather than against
whatever this worktree last compiled. v81 staged that plane with `git archive` + `tar`: the ref's tracked bytes
and nothing else — and no `.git`. Measured on this host 2026-09-28, that made the plane unable to answer ANY
question about the repository, and a row that asks one died before reaching its own assertions:

| row | bare tree (v81 staging) | repository (v132 staging) |
| --- | --- | --- |
| `cwd-axis-proof.mjs` | **FAIL, exit 1 in 383 ms** — the whole verdict being `git ls-tree -r --name-only HEAD -- docs/evidence/agents → exit 128: fatal: not a git repository` | **OK, exit 0 in 43.9 s** (clean-room build exit 0 in 126.4 s) |
| `confession-proof.mjs` | OK (28.8 s) — it reads git through a helper that tolerates the refusal | OK (28.3 s) |

The 42-red standing population amendment 113's addendum counted was this, 42 times: not 42 broken proofs, but 42
rows being graded on a plane where their own subject did not exist (51 of 73 tracked proofs reach a git child
process at code position, measured by the runner's `[plane axis]` line). v132 stages the plane with
`git clone --shared --no-checkout` + `git checkout <ref>` instead. It is still a checkout of the same commit, so
"what a proof walks there is exactly what a commit owns" is unchanged; and it is also a repository, so a row that
asks git now gets an answer from the REF.

Measured on this host, 2026-09-28: clone 478 ms + checkout 1.1 s; `status --porcelain` empty and
`rev-parse HEAD` equal to the source HEAD; and on a real isolated run the walked-tree census reads
`tracked 225 / untracked 0 / ignored 0` where the bare tree reported `UNDIGESTABLE`. The archive path survives as
a DECLARED fallback, the `[isolated]` line names which of the two planes produced a verdict, and both staging
exit codes are checked (the first draft dropped them and leaned on the next command failing — the same "a cause
that only shows up as the failure of the following step is a cause nobody printed" mistake this directory keeps
finding).

Three rows whose prose the change made false were repaired in the same commit rather than left as claims the
plane contradicts: `isolated-proof.mjs` (§1 grades the no-git shape as the FALLBACK's shape, built by the row
itself), `cwd-axis-proof.mjs` (its `sweep-asks-repository:` declaration names the staging the runner performs),
and `table-recount-proof.mjs` (its ls-tree arm is reachable on the isolated plane for the first time — the arm
that was dead code there). `GIT_SUBCOMMANDS` gains `clone`, because the reaches axis is graded against that
list and the runner now spawns a verb it did not name.

Bounds, stated: a clone can fail where an archive would not (no `--shared` in the installed git, an unreadable
object store), and that run falls back to the bare tree with the 128s back — the `[isolated]` line is the only
place that difference is visible, and nothing yet FAILS a sweep for taking the fallback. `--no-build` runs are
unchanged. And the clone's `.git` is the one thing the plane holds that the ref does not own: every counter of
"files the ref owns" must keep skipping it, which is now a stated premise in three rows instead of an accident of
`git archive`.


## A plane downgrade is a refusal, not a log line (sweep.mjs + isolated-proof.mjs §6 — M2 v133 — ADR 0016 amendment 133)

The section above ends with the bound v133 exists to close: *"nothing yet FAILS a sweep for taking the archive
fallback, so the 42 reds can return silently on a host where the clone cannot run — the `[isolated]` line is the only
witness."* A line nothing reads is not a gate, and a summary pasted into a record does not carry it at all — the 42
reds amendment 113 counted were read out of exactly such a summary. So the fallback is now behind a door:

```
node docs/evidence/agents/sweep.mjs --isolated                    # REFUSES if the repository plane cannot be staged
node docs/evidence/agents/sweep.mjs --isolated --allow-archive    # the weaker plane, deliberately, out loud
```

`isolatedCheckout` throws an `Error` with `code = 'ISOLATED-PLANE-DOWNGRADE'` instead of logging the downgrade and
carrying on. The refusal names the clone's OWN cause, the price of the plane it is refusing, the opt-in that would
accept it, and the staging directory it left behind (a caller-supplied `dest`) or removed (one the runner chose). The
fallback is not deleted — a clone can fail where an archive would not — it is kept `allowArchive: true` away. The CLI
exits 2 with `REFUSED — …`; before that try/catch a refusal left the module's top-level await to reject and the runner
printed a stack trace where the sentence that says why belongs.

The price is one exported constant, `ARCHIVE_PLANE_COST`, spoken by BOTH the `[isolated]` fallback line and the
refusal — two independently typed numbers would be two claims. `isolated-proof.mjs` §6, the row that owns this
clause, measures all of it on ref `d77ca34` (2026-09-29) with a failure that is the natural one rather than a mock
(`git clone` refuses a destination that is not empty, so one stray file in `<dest>/repo` makes the plane genuinely
unstowable):

| arm | measured |
| --- | --- |
| REFUSE | **97 ms**, `code = ISOLATED-PLANE-DOWNGRADE`, message carrying the clone's own stderr, the price, `allowArchive`, and the dest — which is still on disk, as the message says |
| OPT-IN | `usedClone false`, `archiveBytes 5 099 520`, no `.git` in the tree, the stray file gone, 226 walked files all tracked at HEAD, and `git ls-tree … HEAD` INSIDE that plane exits non-zero |
| CONTROL | `usedClone true`, `archiveBytes null`, no downgrade sentence printed, `git rev-parse HEAD` inside the plane equals the source HEAD |
| AGREEMENT | the refusal and the `[isolated]` line both contain `ARCHIVE_PLANE_COST` byte for byte |

Re-measured with the runner's own scanner: this ref's 73 rows carry **264** git call sites at code position (program
119, argv 145) and **51 of 73** rows reach a git child process — amendment 130's 262 / 117 / 145 / 51 plus exactly the
two asks §6 adds (the scanner returns 1 call site over HEAD's blob of this row and 3 over the working copy). Home dist
`2fa6222b42cb5829` (260 files) UNMOVED.

Bounds, stated: a caller who passes `allowArchive: true` still gets a red population whose only witness is the
`[isolated]` line — the sweep's `[summary]` does not yet carry the plane, so a pasted summary from such a run is still
un-self-describing, and the guard is only that it can no longer happen by accident. The refusal claims the archive is
"the only staging left" without checking that it can run: on a host with no usable `git` the archive fails too, and
that failure is seen only by a caller who opted in.

## The 3D lane gets its first consumer (scene-tools-proof.mjs — M5 v140 — ADR 0016 amendment 140)

Every M5 grant so far has ended with the same bound: *"nothing outside `@nexus/three-runtime` imports it, so this
prevents rather than mends; the roadmap's M5 entry is still a runtime with tests, not a feature a user can open."*
v138 wrote it, v139 wrote it, and both left it standing. This proof closes the **agent** half:

```
node docs/evidence/agents/scene-tools-proof.mjs   # requires `npm run build` first
```

`agents/runtime/src/sceneTools.ts` declares a narrow `SceneDriver` (`engine`, `createScene`, `addEntity`,
`removeEntity`, `addCamera`, `setActiveCamera`, `summarize`) and the HOST supplies the implementation — the shape
`browserTools` uses for `BrowserDriver`. **`agents/runtime` therefore gains no dependency on
`@nexus/three-runtime`**, and the two lanes stay separable. Six doors: five write-class behind the §28 checkpoint and
one read-class (`scene.inspect`).

The proof is what makes the seam a fact rather than an interface nobody implements: it wires the **REAL**
`ThreeRuntime` (headless backend + manual scheduler) behind the driver, so a width that only suited a fake would fail
here.

| § | what it measures |
| --- | --- |
| 1 | every tool answer is cross-checked against the RUNTIME'S OWN graph — the body really exists, at the position that was named, and the summary's counts equal `scene.entities.size` |
| 2 | **the family composes WITHOUT rendering**: the real headless backend receives **0** frames across every tool call, and the SAME backend receives 1 on `start()` and 2 after one scheduler step — so the zero is a fact about the tools, not about an idle backend |
| 3 | the §28 gate is the registry's and it is the only one: one refused write moves the graph by 0 and asks the gate 0 times, one approved write moves it by 1 and asks once |
| 4 | four refusals, each naming its own fact (missing scene · partial position triple · unknown kind · missing arg), with the runtime moved by 0 bodies |
| 5 | this repository's HEAD is byte-identical: everything ran in memory |

Two §60 rules are asserted rather than promised. First, **no door here can be mistaken for a renderer**: there is no
`scene.screenshot`, no door is even NAMED like one, no description promises a picture, and `scene.inspect` reports
STRUCTURE (counts, names, the active camera) — a door that answered with an image would be `browserTools`'
`base64-screenshot-placeholder` defect in a new costume. Second, the proof's own summary line was WRONG in its first
draft and is corrected in the same landing: it said *"2 frames drawn by the tools themselves"* when the 2 came from
the frame loop and the tools drew 0. That is the class of sentence this lane keeps catching in its own committed text.

Bounds, stated: this is a COMPOSITION surface. It does not render, it does not step the frame loop, and it has no door
for combat, physics, controllers, cinematics or save/load — those exist in the package and are unreachable from here
today. It is registered in no default roster: a host must call `registerSceneTools` with a driver it built. And nothing
in the Studio imports it, so M5's PRODUCT face is still open — what is closed is that the lane had no consumer at all.


## The clone plane writes the ref own bytes, the first line names its choice, and the shrink claim asks the census (sweep.mjs + isolated-proof.mjs section 4 — M2 v141 — ADR 0016 amendment 141)

Three findings the v132 clone staging surfaced on the first isolated run that reached past it, measured
2026-09-29 rather than assumed. Before v141 the isolated plane was 4 red and the worktree plane 2 red,
all six from the staging change landing without its witnesses.

**BYTES.** This box system gitconfig sets `core.autocrlf = true`, so the clone checkout materialized CRLF
where `git show HEAD:file` answers LF — and provenance-proof section 2 therefore counted 0 of 74 proofs
identical to their committed bytes on the cloned plane, while the home worktree measures the opposite
(disk == `git show`, both LF: no checkout has rewritten those bytes since they were written). Two planes
reading different BYTES for the same ref is the drift this runner exists to catch, and v132 own claim
("stages the same tracked bytes") is only true without the conversion. `git clone -c core.autocrlf=false` is
the config own door: measured after the change, `git config --get core.autocrlf` answers false inside the
clone, `status --porcelain` is clean, and disk equals `git show` byte for byte. The alternative
`git -c core.autocrlf=false checkout ref` was measured and rejected: the code-position tokenizer takes the
first argument after the program as THE command, so that form reads as a call to `-c` and returns nothing —
the checkout would have gone invisible to every scanner this directory owns. `clone -c` keeps `clone` at
argv[0] (measured: `gitCommandsIn(sweep.mjs, isolatedCheckout)` is exactly clone, checkout, archive, and no
new call site enters the plane census).

**THE LINE.** drive-axis-proof takes the FIRST `[isolated]` line a caller log sees, and the clone arm line said
WHERE the dest was but not HOW it was chosen. It now carries `chosen:` with the computed choice — the default
arm reporting the forced repo-drive choice, the cross-drive arm `caller-supplied` — and both arms are green.

**SECTION 4 SHRINK.** isolated-proof asserted the clean checkout walks strictly fewer files than the standing
tree. The home plane census says 63 untracked files, isolation removes them, and the strict claim is correct
there. On the isolated plane this row STANDS in a clone the runner just staged — census 230 tracked, 0
untracked, 0 ignored — so the assertion reduced to 230 < 230 and could only fail, the first time that row ever
reached its own assertions on this plane. The census now picks the sentence: unowned files present gives the
strict shrink claim; none present gives IDENTITY, count AND digest, which is strictly stronger than "smaller".

Two witnesses were repaired in the same commit rather than left stale: confession-proof helperArms wanted the
old single-verb list where the body now reaches three commands, and drive-axis asks-declaration still said
`git archive HEAD` where the body clones first (`clone` is a verb the confession grammar knows, measured).

| plane | measured at c8396a3 |
| --- | --- |
| worktree | 74 scripts, 0 failed, 0 killed, 692 s · graded build 6fdf2eb7a3c1197b (268 dist files) · tree d5325b0eb90d624a (293 files) · dirty-sources 0 |
| isolated | 74 scripts, 0 failed, 0 killed, 671 s · graded build 2d04ef776f68808c (288 dist files) · runner build 6fdf2eb7a3c1197b · tree 8b260da25c7617db (230 files) · home build UNMOVED |

Bounds, stated: the `false` lives in the CLONE local config only — the home repository config is untouched,
and the system `true` still governs the worktree, whose files are LF as-written, which is exactly why the two
planes disagreed in the first place. On a host with `autocrlf=false` everywhere the flag changes nothing, so
it is belt rather than load-bearing; the measurement that would catch its absence is provenance-proof section 2
counting identical proofs, which is what caught it here.


Spot witnesses stayed as the census found them: `confession-proof` section 0 finds `sweep.mjs` byte-equal to HEAD on both planes, the asks census still declares its 4 rows (closure, cwd-axis, drive-axis, table-recount) with the same 3 uncorroborated, the plane-axis call sites are unchanged (`git -c` adds no spawn and `clone -c` keeps `clone` at argv[0]), and the identity sync probe answers status 0 (measured 6/6 in the session). The v132/v133 debt is retired: all 4 isolated-plane reds and the 2 worktree reds are green, and the clone plane now honestly stages the ref own bytes.

## The 3D lane gets its first consumer (scene-tools-proof.mjs — M5 v142 — ADR 0016 amendment 142)

This section records the M5 v142 grant written by the three-runtime lane. The full narrative lives in
`docs/evidence/three-runtime/README.md` section v142, `docs/evidence/studio/README.md`, and the runnable
`docs/evidence/studio/scene-surface-proof.mjs`; this is the ledger entry in the M2 evidence README so the
§7 title reader can credit it on the isolated plane (which clones HEAD and therefore does not have the
studio proof file until it is committed).

### The bound this closes
Every M5 grant from v108 onward ended with the same sentence, and v139/v140 wrote it verbatim:
*"nothing in the Studio imports `@nexus/three-runtime` ... the roadmap M5 entry is still a runtime
with tests, not a feature a user can open."* v140 closed the AGENT half with a `scene.*` tool family
over a driver seam. This closes the **product** half: the Studio grows a 3D surface, and the package
gains its first UI dependency edge (`apps/studio` → `@nexus/three-runtime`, added to `transpilePackages`
and to the workspace dependencies so the build order is declared rather than accidental).

### The first consumer found a defect no test could see
`ThreeRuntime.createScene` built two `THREE.Light` objects through `createDefaultLighting`, stored them
in `LightingConfig.lights` — and **put neither into the scene**. `lighting` was written once and read
by nothing. Every mesh this package makes is a `MeshStandardMaterial`, which requires a light to be
visible. The proof (`scene-surface-proof.mjs`) wires the REAL `ThreeRuntime` (headless backend + manual
scheduler) behind the driver, so a width that only suited a fake would fail here.

| section | what it measures |
| --- | --- |
| 1 | every tool answer is cross-checked against the RUNTIME own graph — the body really exists, at the position that was named, and the summary counts equal `scene.entities.size` |
| 2 | **the family composes WITHOUT rendering**: the real headless backend receives 0 frames across every tool call, and the SAME backend receives 1 on `start()` and 2 after one scheduler step — so the zero is a fact |
| 3 | the section 28 gate is the registry and it is the only one: one refused write moves the graph by 0 and asks the gate 0 times, one approved write moves it by 1 and asks once |
| 4 | four refusals, each naming its own fact (missing scene · partial position triple · unknown kind · missing arg), with the runtime moved by 0 bodies |
| 5 | this repository HEAD is byte-identical: everything ran in memory |

Bounds, stated: this is a COMPOSITION surface. It does not render, it does not step the frame loop,
and it has no door for combat, physics, controllers, cinematics or save/load — those exist in the
package and are unreachable from here today. It is registered in no default roster: a host must call
`registerSceneTools` with a driver it built. And nothing in the Studio imports it, so M5 product face
is still open — what is closed is that the lane had no consumer at all.

## A flag-first argv names its verb, because the free-text matcher already skips global options (sweep.mjs — M2 v143 — ADR 0016 amendment 143)

The code-position arm read THE command as the first literal after the program (`asArgv` is `last ===`
`['` — true for the first literal only), so a global option in front of the verb blinded it:
`run('git', ['-c', 'core.autocrlf=false', 'checkout', ref])` extracted `[]`, and the ~20 `-C`-first
call sites across 19 proofs were invisible to the very arm whose free-text twin reads `git -c x status`
as one command. The `afterProgram` branch now completes on the first COMMAND-shaped literal while its
frame is on top — `sub === null` keeps the first verb the winner; a nested call or array pushes a new
frame, so only literals that ARE this argv complete it — and the v95 comment above it was updated to
say the same.

Measured on synthetic shapes, before → after: `["-c", k=v, "checkout"]` `[]` → `["checkout"]` ·
`["-c", k=v]` `[]` → `[]` (the command moves forward, it is not invented) · `["-C", dir, "rev-parse"]`
`[]` → `["rev-parse"]` · `["archive", "--format=tar"]` unchanged · parameter-bound argv unchanged
(the documented blind spot stays blind) · `gitCommandsIn(sweep.mjs, "isolatedCheckout")` still
`["clone","checkout","archive"]`, which is why v141 chose `clone -c` over `git -c`.

Population, counted rather than guessed: those ~20 call sites resolve now, every one of their files
already had a command-first reach, so the asks census is byte-identical — declared still 4 rows,
uncorroborated still the same 3 — and the plane-axis synthetic grammar has no flag-first case, so its
section 1 cannot move. Confession gained two witnesses for the fixed shape: `-c` plus a verb names the
verb, `-c` alone names nothing. At `7ee35d3` the three grammar rows (confession, asks-axis, plane-axis)
ran green; the full sweep at that commit had 3 worktree + 1 isolated red, none of them this arm's —
untracked `.scratch` copies outranked real paths in the worktree index, and grant 142 had no record
title where a title reader looks (since closed by the README 142 section above).

## The world lane gets its first consumer (world-tools-proof.mjs — M4 v144 — ADR 0016 amendment 144)

`packages/world-engine` had **31 green tests and no consumer at all**: `grep -rl '@nexus/world-engine'` across
`apps/ agents/ packages/` matched only the package's own `package.json`. That is the shape the 3D lane was in
before v140 — a package with tests, not a capability anything can reach.

```
node docs/evidence/agents/world-tools-proof.mjs   # requires `npm run build` first
```

`agents/runtime/src/worldTools.ts` declares a narrow `WorldDriver` (`engine`, `summarize`, `addLocation`,
`addCharacter`, `addLore`, `query`, `decide`) and the HOST supplies the implementation, so **`agents/runtime`
gains no dependency on `@nexus/world-engine`**. Six doors: four write-class behind the §28 checkpoint and two
read-class (`world.inspect`, `world.query`).

| § | what it measures |
| --- | --- |
| 1 | every tool answer is cross-checked against the ENGINE's own `getWorld()`/`getStats()` — the location exists with the name given, the character is placed where the caller said, the lore is in the world |
| 2 | the §28 gate is the registry's and it is the only one: a refused write moved the world by 0 and asked the gate 0 times, an approved write moved it by 1 and asked once |
| 3 | four refusals, each naming its own fact (unknown location type · unknown lore category · a character placed in a location that does not exist · a decision asked of a character with no agent), with the engine moved by nothing |
| 4 | **the decision door's WRITE-class claim, measured**: `agent.getLastDecision()` is `null` before the call and non-null after, which is the mutation that forbids calling the door a read |
| 5 | retrieval reaches what the TOOLS wrote — the RAG finds the lore added through the doors, so the family's writes are real writes |
| 6 | this repository's HEAD is byte-identical: everything ran in memory |

The read/write split is the interesting part. `world.inspect` and `world.query` are `read` because they ask
the engine a question and change nothing. `world.character.decide` is **write-class** because the package's
`CharacterAgent.decide()` stores its answer on the agent (`this.lastDecision = decision`) — and §4 does not
take that on trust, it reads the agent's own record before and after. A door that called this a read would be
claiming a mutation did not happen.

The engine's own answer is quoted as it came rather than dressed up: for a minimally-populated world (no
goals, no threat) every action scores zero and the agent rests with `confidence: 0`. That is DEMO-MODE
arithmetic being honest about an empty world, and the proof prints the number instead of describing it.

Bounds, stated: the family creates and reads a world's DECLARED structure. It does not tick the engine, drive
`executeAction`, connect locations, create factions, manage relationships or goals, save/load a world, or
configure agents. No roster registers it by default — a host must call `registerWorldTools` with a driver it
built — and nothing in the Studio imports it yet.

## The multimodal lane gets its first consumer (asset-tools-proof.mjs — M3 v145 — ADR 0016 amendment 145)

The multimodal slice — `InMemoryAssetLibrary`, `DemoImageGenerator`, `DemoVideoGenerator`,
`CharacterConsistencyManager`, `StoryboardManager` — shipped with **13 green tests and no consumer outside its
own suite**. The 3D lane had that shape before v140 and the world lane before v144.

```
node docs/evidence/agents/asset-tools-proof.mjs   # requires `npm run build` first
```

`agents/runtime/src/assetTools.ts` declares a narrow `AssetDriver` (`engine`, `generateImage`, `listAssets`,
`getAsset`, `createStoryboard`, `addFrame`, `getStoryboard`) and the HOST supplies the implementation, so
**`agents/runtime` gains no dependency on `@nexus/ai-providers`**. Six doors: three write-class behind the §28
checkpoint and three read-class (`asset.list`, `asset.inspect`, `asset.storyboard.inspect`).

**This family exists to make §60 enforceable rather than promised.** There is no image or video model in this
build, so:

- `asset.image.generate` **REFUSES a driver answer that carries no provenance**. A result that dropped its own
  `provenance.mode` would be indistinguishable from a real generation's — the
  `base64-screenshot-placeholder` defect `browserTools` records, in a new costume. The door returns only
  answers that say how they were made.
- **No door is NAMED or DESCRIBED in a way that promises pixels**, asserted per door by the suite: no name
  matches `/screenshot|render|pixel|photo|picture/i`, and no description claims to return an image. The
  generation door says the opposite in words on its own face.
- **The proof measures why there are no bytes.** The payload stored beside a generated asset is **zero
  bytes** — the honest size of what DEMO MODE produces. A plausible non-zero size would be a fabrication, and
  it is the number a reviewer should check.

| § | what it measures |
| --- | --- |
| 1 | the real generator and library answer the seam; every answer is cross-checked against the LIBRARY's own metadata (id, prompt, mimeType, width/height) |
| 2 | the three §60 measurements above: `provenance.mode === 'demo'` carried through, a ZERO-length payload, and a provenance-less answer refused |
| 3 | the §28 gate is the registry's and it is the only one: a refused write moved the library by 0 and asked the gate 0 times, an approved write moved it by 1 and asked once |
| 4 | four refusals, each naming its own fact (a count of zero · an asset the library does not hold · a frame referencing an absent asset · a storyboard that does not exist), with the library moved by nothing |
| 5 | **a frame's `imageRef` is FOLLOWED, not trusted**: the reference resolves back into the library to the asset that was generated, so it is a fact rather than a string |
| 6 | this repository's HEAD is byte-identical: everything ran in memory |

Bounds, stated: the family generates image ASSETS and files storyboards. It does not generate video, apply
character consistency, delete or update assets or frames, or export a storyboard — and it never returns bytes,
because there are none. No roster registers it by default, and nothing in the Studio imports it, so M3's
PRODUCT face is still open.
## The index does not count a tree that is not this tree (collectTextFiles + code-index-proof — M2 v149 — ADR 0016 amendment 149)

A directory that carries its own `.git` is ANOTHER repository — a clone, a scratch checkout, a
submodule worktree — and its files belong to that tree, not this one. The fix adds a lookahead
peek in `realfs.collectTextFiles` (the runtime walker) and mirrors the same rule in the
proof's own walk (`code-index-proof.mjs`): before descending into a child directory, read its
entries once; if any entry is named `.git`, skip the whole subtree.

Measured before this commit on the worktree plane:

- `code-index-proof` indexed 1787 files (seven nested repositories under `.scratch/`), the query
  `rigidRotateRect rotatePointAbout` returned five clone copies of `geometry.ts` in every top-5
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
## The EBUSY fault is the SYNC SPAWN FAMILY, not contention (ebusy-proof.mjs — M2 v152 — ADR 0016 amendment 152, correcting amendment 151)

**v151 recorded this probe as "0 EBUSY in 340 spawns (0.00%)" and concluded that the failures attributed to
EBUSY in amendment 107 were `otherErr` rather than EBUSY. That record does not reproduce, and this section
replaces it.** Re-run on 2026-10-02 against the proof as it was shipped, the same four scenarios reported
**340 EBUSY in 340 spawns (100.00%)**, and a plain sequential `spawnSync('git', ['rev-parse','HEAD'])` ×20
reported **20/20 EBUSY**.

**Why the shipped proof could not settle it.** It wrapped a SYNCHRONOUS `spawnSync` inside a `new Promise`
executor:

```js
promises.push(new Promise(resolve => { const r = runGit([command, ...args]); resolve(r); }));
```

`runGit` runs to completion before the executor returns, so the four "concurrent" spawns in each batch ran
**one after another** — the concurrency was decorative. A contention measurement whose spawns never contend
cannot tell contention from an unconditional fault, and the number it produced (0%) is what the ASYNC path
gives, not what the sync path it actually called gives.

**The rewrite measures both arms.** The concurrent arm now uses async `spawn`, so `concurrency` children
really are alive at once; the sequential arm is the control. Measured on the worktree plane:

| arm | mechanism | EBUSY |
| --- | --- | --- |
| CONCURRENT | async `spawn` (up to 8 at once) | **0 / 340 (0.00%)** |
| SEQUENTIAL | `spawnSync` (one at a time) | **60 / 60 (100.00%)** |

Per shape, concurrent: `rev-parse HEAD` 160/160 ok · `status --porcelain` 60/60 ok · `clone --shared
--no-checkout` 40/40 ok · `checkout HEAD` 39 ok / 41 `otherErr` (concurrent checkouts in one repository
contend on the index lock — a real contention artifact, and it is `otherErr`, not EBUSY).

**The verdict the numbers support: `SYNC-FAMILY`.** The sequential control fails at 100% while the
concurrent arm is clean, so the fault belongs to the `spawnSync` API itself and has nothing to do with
contention. This also explains why `docs/evidence/lib/syncproc.mjs` — which re-implements the sync API on the
async path — is load-bearing rather than a convenience, and why every proof that imports it works.

The proof is a MEASUREMENT, not a gate: it always exits 0, prints the verdict, and writes a JSON artifact to
`.scratch/ebusy-<plane>-<ts>.json`. The isolated plane is measured by the sweep and recorded when it runs.
## The Amendment 129 behavioral probe runs: all reason-field mutations are caught (amendment129-probe.mjs — M2 v154 — ADR 0016 amendment 154)

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

## §7's window-vs-positional witness re-anchored on title SITES (`table-recount-proof.mjs`, M2 v157 — an arm whose subject a correct record can delete is watching the wrong thing)

**What broke, and what broke it.** The grant above (`M2 v82 record written at v156`) closed amendment 82's title hole,
and §7 died on the way: `table-recount-proof.mjs:524` at `215026c` asserted that the set
`c.hole − wide.hole` is non-empty — that is, that some granted number's only title is a header line BELOW a module's
opening line. That set is a subset of the holes, so every honest record written for a hole removes one of its members,
and the last one leaves the door unable to run at all. The assertion's own message named the situation ("no subject in
this tree … unfalsified here rather than verified") and its comment above said an empty answer must be SAID OUT LOUD;
the code asserted instead. v156 is the measurement that proved the arm was watching a quantity it was guaranteed to
destroy.

**The fix, read off the bytes that now ship.** The contrast keeps a subject that records cannot remove: the
window-only SITE population. `deepOnly(pos, wid)` (`docs/evidence/agents/table-recount-proof.mjs:529`) is one function used by both mouths — the
live claim and the falsification arm — and `deepRows = deepOnly(c, wide)` (`:536`) asks which lines the 8-deep
window titles and the positional reader refuses. The floor `:537` refuses a tree where the two readers agree
everywhere, and the claim `:541` says what the rule actually promises: **refusing a deep line loses no record**,
because every number a deep line credits is titled positionally as well. A row that fails it is the positional rule
being wrong about that line, and the red names the site.

**The arm, and why it is a witness rather than a restatement.** `:547` takes the first deep row and deletes
EVERY positional title of the number it credits, in memory (`census`'s edit hook), then requires three things at once:
the number falls into the positional hole (`:563`), the window still titles it from the deep line
(`:564`), and the same `deepOnly` derivation now reports that deep row as its only remaining credit
(`:565`). Those three together are the claim "the two readers differ by POSITION, not by coverage", and the
scrub is the only state in which it is red. Measured by the door at `215026c`: **153 deep sites over
68 grants, all of them also titled positionally**, and the scrub of 142's 5 positional
title(s) left `docs/evidence/studio/scene-surface-proof.mjs:2` as its only credit — caught, not asserted.

**Bounds.** No verdict, table row or test case moved: the same run reports 1 one-sided grant
[21] and the newest grant 156 titled, both unchanged by this increment. The 153/68
figures are the door's own line at `215026c`, not constants; they are repeated here because the commit message
quotes the run, and the door re-derives them at every ref thereafter. Amendment 21 remains owed its record for the
reason stated in v156's bounds — its ledger bullets carry per-ref counts nobody has re-measured.

## §7's strip arm stops requiring a SOLE title site, and learns to read a multi-grant heading (`table-recount-proof.mjs`, M2 v158 — an arm that forbids itself the common case is not a witness)

**What the increment answers, measured before writing it.** §7 proves that a grant's record can be lost the right way: delete
its title lines in memory and require the number to fall into the one-sided hole. The version that landed with v112 chose its
subject as `a granted number with EXACTLY ONE title site` (`:496` at `3d34207`) and then asserted, for that one
line, that nothing else on it was titled anywhere else (`:504`). Both halves are quantities that honest records only
ever shrink: a `.md` heading is a title wherever it stands, so each new section ADDS a site, and each title that credits two
grants makes a line the old arm could not touch. Measured by the door at this ref, the site-count census is
**1 site(s): 39 grant(s) · 2 site(s): 59 grant(s) · 3 site(s): 46 grant(s) · 4 site(s): 3 grant(s) · 5 site(s): 4 grant(s)**, and 2 of the 39 one-site grants share their heading with a better-recorded number — the
old arm's chooser sorts by number, so the moment the low half of that population got its records written it would have died on
its own per-line guard with the rest of that population still strippable. Grant 157 is the same
species caught earlier: it starved on a floor line; this one starves on a guard.

**The two arms that ship, read off the bytes.** The subject is now the SPARSEST site count (`sparse`, `:522`), which
exists as long as anything is titled at all — the floor `:523` says so instead of assuming a bucket stays non-empty.
One derivation of "what this line credits" (`creditedAt`, `:503`) and one in-memory scrubber over a chosen site set
(`scrubOf`, `:510`) serve both arms and both printed sentences, so no sentence can describe a population the assertion
never read (the rule v157 landed with, applied to its neighbour). The sparsest arm scrubs EVERY title of its subject and requires
the hole to gain exactly the numbers whose last title was in that set (`:535`) — measured here: grant **13**
at `docs/evidence/studio/README.md:416`, hole gains **13**.

**The half the old guard refused to test.** `shared` (`:546`) selects a one-site grant whose title line ALSO credits a
better-recorded grant — the exact shape the predecessor called "not a single-site mutation". Scrubbing that single line must
redden the numbers sole-titled there (`gained`, `:550`) and leave the others titled (`:555`): measured here
on `docs/evidence/agents/README.md:3031`, which credits [109, 110] and came out as **109 in the hole, 110 still titled**.
That is the discrimination the rule's own shape depends on — a title line is positional, not one-per-title — and it now has an
arm instead of an exclusion. If no grant in the corpus ever has that shape, `:560` prints the absence rather than a
caught mutation; today the arm runs.

**Bounds.** No verdict, table row or test case moved: the same run reports 1 one-sided grant [21],
153 window-only title sites over 68 grants with holes turning on position 0, 15 title lines
naming more than one grant under the positional rule (41 under the window), and newest grant 157 titled. Amendment
21 stays owed for the reason v156 stated — its ledger bullets carry per-ref counts nobody has re-measured. The figures above are the
door's own lines at `3d34207`, not constants; the door also prints the site-count census (`:567`) so the next reader can
re-measure the headroom without a scratch probe.

## The multimodal doors deepen (asset-tools-proof.mjs §6–§8 — M3 v160 — ADR 0016 amendment 160)

v145 gave this lane six doors. The package it wraps has more: a **video** generator, a metadata `search`,
`updateMetadata`, `remove`, and a whole `CharacterConsistencyManager`. v160 adds seven doors — the family is
now **13** — and the three new proof sections below run over the REAL generators, library and manager.

```
node docs/evidence/agents/asset-tools-proof.mjs   # requires `npm run build` first
```

| door | class | what it does |
| --- | --- | --- |
| `asset.video.generate` | write | the package's video generator, same provenance rule as the image door |
| `asset.search` | read | the library's metadata search, limit defaulted to 10 |
| `asset.update` | write | `updateMetadata`; **refuses an empty patch** (see below) |
| `asset.delete` | write | `remove`; answers `false` for an id the library does not hold |
| `asset.character.register` | write | a character's reference images and consistency strength |
| `asset.character.list` | read | the roster |
| `asset.character.apply` | read | the DERIVED REQUEST a generator would receive |

**The rule the library cannot make for itself.** `InMemoryAssetLibrary.updateMetadata` answers **`true` for a
patch that changes nothing**. §7 prints both sides of that: the door's refusal, and the library's own `true`
for the same empty patch. A door that forwarded it would report a successful update that updated nothing — a
no-op wearing a success.

**Two removal semantics, stated rather than inferred.** `asset.delete` is write-class and asks the §28
checkpoint; the Studio panel's `Remove` (v159) is ungated because it acts on the panel's own in-memory
library. The difference is WHO OWNS the library, not what removal means, and the door's own description
carries that sentence — a suite case asserts it is still there.

**`asset.character.apply` answers a request, not an asset.** It runs no generator: the result carries
`derived: 'request'`, the reference images that would be attached, and NO `assets` field. A door whose answer
could be read as a generation would be the §60 defect in a new place.

| § | what it measures |
| --- | --- |
| 6 | the video door over the package's own generator: `type`/`mimeType` come from the GENERATOR (not stamped by the door), the duration reached it, and the stored payload is still ZERO bytes |
| 7 | update and delete on the REAL library: the rename and tag list land, an empty patch is refused BY THE DOOR while the library calls it a success, delete removes it and a second delete answers `false` |
| 8 | the character trio: register/list round-trip, `apply` answers a derived request with 2 references and no assets, and an unregistered character is refused BY NAME rather than as a forwarded throw |
| 9 | this repository's HEAD is byte-identical |

Bounds, stated: still no real model anywhere — every generator is DEMO MODE and every stored payload is zero
bytes, measured on the video path too. There is no storyboard frame EDIT or DELETE, no character UPDATE or
DELETE, and no asset byte editing: the library has no such method, so no door invents one.

## The world doors learn to RUN (world-tools-proof.mjs §6–§8 — M4 v162 — ADR 0016 amendment 162)

v144 gave this lane a world driver with six doors that could COMPOSE and READ a world but not RUN one —
its own record said so. v162 adds two doors — the family is now **8** — over the same seam, and the new
proof sections run them over the REAL engine:

```
node docs/evidence/agents/world-tools-proof.mjs   # requires `npm run build` first
```

| door | class | what it does |
| --- | --- | --- |
| `world.simulate` | write | `steps` ticks of the engine's own `tickOnce()`, aggregated into one report |
| `world.relationships.list` | read | every bond, BOTH sides, by name |

**Simulation refuses nonsense at the door.** `steps` must be a positive integer no greater than
`WORLD_SIMULATE_MAX_STEPS` (1000): zero, negative, fractional and over-cap steps are named and refused —
and for a non-numeric step the registry's own type gate answers before the door does.

**A tick is the engine's decision loop, not a counter.** §6 steps a healthy world twice and watches
NOTHING execute; then wounds Rowan to 30/100 health, steps once, and watches the agent's own confidence
gate choose `rest` and EXECUTE it (30 → 40). A thousand-and-one-step request is refused by name.

**Bonds are born two-sided and erode when unmaintained.** §7: one tick introduces two co-located
characters — the first speak writes BOTH directions at the floor (10/10), the reply gains on both sides
(15/15), and the tick's own decay pass erodes them (13/13, `relationshipsChanged` = 2). §8 lists every
bond BY NAME through the read door, before and after.

| § | what it measures |
| --- | --- |
| 6 | `world.simulate`: a healthy world executes nothing (2 ticks · 0 actions), a wounded agent chooses and executes `rest` through its own gate (30 → 40), and 1001 steps are refused |
| 7 | the deterministic introduction trace over the REAL engine: 10/10 → 15/15 → 13/13 on BOTH sides, `relationshipsChanged` = 2 |
| 8 | `world.relationships.list`: every bond by name from both sides — a read door, zero checkpoints |
| 9 | this repository's HEAD is byte-identical |

Bounds, stated: the tick consults every agent's OWN decision gate — still no model anywhere (DEMO MODE
arithmetic, labeled). `world.simulate` aggregates the engine's own reports rather than narrating one.
Decay floors at the first-meeting anchor, so the enemy band is unreachable through simulation and no
number the doors return can be read as hatred. Factions and lore do not tick yet.

## The scene doors learn to PERSIST (scene-tools-proof.mjs §6 — M5 v163 — ADR 0016 amendment 163)

v142 gave this lane a scene driver with six doors that could COMPOSE and INSPECT a scene but not SAVE
one — and the runtime's own save format (`buildSaveFile`/`loadSaveFile`) sat in `@nexus/three-runtime`
with zero consumers. v163 adds two doors — the family is now **8** — and the new proof section runs
them over the REAL runtime:

```
node docs/evidence/agents/scene-tools-proof.mjs   # requires `npm run build` first
```

| door | class | what it does |
| --- | --- | --- |
| `scene.save` | write | the scene's own save file in the runtime's format — `savedAt` is optional because the CALLER names the instant; the runtime has no wall clock |
| `scene.load` | write | restore a save file into a scene — refused for a scene that already holds state |

**The file crosses the door as a JSON string.** The registry's `ArgType` has no object type, so
`scene.load` parses the string itself and refuses — by name — malformed JSON, a bare value (`parses to
number, not a save-file object`), an array and the empty string, before the driver is ever asked.
`scene.save` answers with the file AND the counts (`entities`/`npcs`/`worldStateKeys`), so an agent can
reason about a scene without printing bytes.

**A restore never overwrites live state.** §6 saves a two-body scene with a caller-named instant
(54321), round-trips the file through `JSON.stringify`/`JSON.parse` — the form an agent actually
handles — loads it into a FRESH scene and verifies the SAME entity ids landed through
`runtime.getEntity` itself; the same file against the LIVE scene is refused (`already in scene … a
restore never overwrites live state`), and three malformed files are refused by the door, not the
driver.

| § | what it measures |
| --- | --- |
| 6 | `scene.save` carries the caller's instant and both bodies through a JSON round-trip unchanged; `scene.load` restores them into a fresh scene under the SAME ids (runtime-verified); the live scene refuses its own file; 3 garbage files refused by name |
| 7 | this repository's HEAD is byte-identical |

Bounds, stated: both doors refuse a scene the driver does not hold, and both answer `rendered: false` —
a door never claims pixels. The format is the runtime's own, not a door invention; disk persistence is
still nobody's job here — the file exists in memory, and that is all the door claims.

## The exec host learns to CONTAIN (container-proof.mjs §1–§8 — M2 — ADR 0016 amendment 166)

v30's exec host could run a policy-approved command on the real filesystem, but the only wall around it was
the plan itself. Amendment 166 adds the OS-level wall ADR 0013 proposed: the SAME `planExec` decision
(argv allowlist, bare-name executables, env scrubbing, budget clamping — its `guardedJoin` jail check is
pure slash math, so the same check that guarded a host path guards a container workdir) now executes inside
an EPHEMERAL Docker container. `agents/exec-host/src/containerExec.ts` is that container layer; the
division of labour stays v29/v30's — `@nexus/agent-runtime` remains the single decision function, and the
container host adds what the plan cannot say: a POLICY-PINNED image (the request can never name one), a
CONTAINER-side workdir root, and `docker run` as the spawned argv — still through the ONE `SpawnLike` seam,
so the v30 audit's answer ("exactly ONE module in the monorepo may talk to node's process-spawn module")
keeps its teeth (exec-host-proof re-run at v171: the §60 line still reads capability confined to execHost.js).

> Record-keeping note (v171): this section and the next were first published with a35310f/3bf329e describing
> a system this code is not — three doors (`container.run`, `container.policy.validate`,
> `container.audit.list`) that do not exist, proof sections §6–§9 that do not exist, and the M6 milestone,
> which is not this lane. The ledger (amendments 164–171) carries the correction; the text below is re-pinned
> to the SHIPPED module.

```
node docs/evidence/agents/container-proof.mjs   # requires `npm run build` first — and a running Docker engine
```

| door | class | what it does |
| --- | --- | --- |
| `container.exec` | exec | run a policy-approved argv inside an ephemeral container — the §28 checkpoint and the `exec` permission class gate it exactly like every other exec-host door |

**The wall is 10 argv flags, audited from the spawned argv itself.** `CONTAINER_ISOLATION_ARGS` is exported
as data so the audit reads the array the builder reads: `--rm` (ephemeral), `--network none` (egress denied
at the socket layer), `--pull never` (a missing image FAILS — the host never reaches for a registry the
policy never asked about), `--cap-drop ALL` with `no-new-privileges`, a `--read-only` rootfs over one
`--tmpfs` scratch (`/tmp:rw,noexec,nosuid,size=64m`), `--memory 512m` (+ swap), `--cpus 1`,
`--pids-limit 128`. `CONTAINER_MOUNT_FLAGS` is the empty-audit list: the builder has NO mount flag it can
ever emit, and §2 of the proof counts mount flags in the real argv (0). Caps are policy fields clamped by
`validateContainerPolicy`; the probe answers `{available, serverVersion, reason}` — absence is a normal
answer, not an error. Wall-clock is a HOST budget: when it fires the docker client is killed and
`docker rm -f <name>` retires a container the client may have left running — attempted AND reported
(`cleanup.removed`), never assumed.

**§1–§8, measured against a real daemon (29.8.x, re-run 2026-10-07 at v171):**

| § | what it measures |
| --- | --- |
| 1 | the probe answers — the nested template `{{.Server.Version}}`, not `{{.ServerVersion}}` |
| 2 | the plan audit: 10 isolation flags in the argv, mount flags 0, caps as declared, `executes: false` |
| 3 | a REAL run: the pinned `node:22-alpine` answers `container-alive:` + its node version, exit 0 |
| 4 | the wall, measured: rootfs write → `EROFS`, `/tmp` writable, host fs ABSENT (no bind mount exists), egress denied immediately at the socket layer |
| 5 | the budget kills `sleep 60` at 4s AND retires the container by name — the daemon listing is empty after; on a cold engine an `rm -f` exceeding the proof's own 10s cleanup budget FAILS the proof (a slow engine is a failed claim — the right bias) |
| 6 | the policy outranks the gate: an unallowlisted argv never reaches docker — default-deny, no spawn, recorded |
| 7 | the JSONL journal: every outcome above in order, a rule number exactly when the policy said yes |
| 8 | the door: `container.exec` is exec-permission, gated at the registry, answered by the container |

26 vitest cases in `agents/exec-host/test/containerExec.test.ts` — package total 301/301, tsc clean.
Bounds, stated: this is a Docker backend for ADR 0013's first container sentence — gVisor/Firecracker,
per-job secret injection from `services/ai-svc`, a warm pool, and egress policy beyond `--network none`
are still open, and the ADR stays **Proposed** until they exist. The engine is trusted: this layer
enforces policy and cannot prevent a compromised engine from escaping. No image build/pull, no volumes
(by construction), no exec into a running container. The runtime's own tools do not route through the
container yet.


## The git wrapper pattern prevents direct spawn frames (sweep.mjs — M2 v155 — ADR 0016 amendment 168)

The `table-recount-proof.mjs` defines a `git` wrapper that all git calls in the file route through:

```javascript
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
```

This wrapper serves two purposes:

1. **Centralized git invocation** — All git calls in the file route through this single function,
   making it trivial to audit, instrument, or redirect git calls.

2. **Scanner hygiene** — The `gitReaches` scanner in `sweep.mjs` treats a function as a readable
   git alias when its body contains a git call at code position. By routing all git calls
   through this wrapper, the file's own direct git calls are eliminated — the only git
   reach in the file is the wrapper definition itself, which `aliasGitCommands` correctly
   identifies as the `git` alias.

Before this pattern (amendment 149), the `corpus` IIFE called `execFileSync('git',
['ls-files', '-z', '--', 'docs'], ...)` directly. This direct call was picked up by
`gitReaches` as a direct spawn frame, causing `confession-proof` §8 to fail with
`table-recount names NO verb at a direct spawn frame`. The fix was to route the
`ls-files` call through the `git` wrapper, so the only git reach in the file is the
wrapper definition itself, which `aliasGitCommands` correctly identifies as the `git`
alias.

**Bound (§60).** This pattern applies to any proof file that makes git calls. A file
that defines a wrapper and routes all git calls through it will have exactly one
readable alias (the wrapper), and zero direct spawn frames. The `confession-proof`
§8 enforces this by asserting `gitCommandsIn(file)` is empty for such files.


## The wiring is a record, not a re-export (M2 — ADR 0016 amendment 167)

`@nexus/exec-host` depends on `@nexus/agent-runtime` for `ToolRegistry`, `Checkpoint` and `planExec` — a
one-way dependency that must never be reversed (agent-runtime stays spawn-free, ADR 0013), so container
types are NOT re-exported through agent-runtime. A consumer wires the halves at the call site:

```typescript
import { ToolRegistry } from '@nexus/agent-runtime';
import { createContainerExecHost, registerContainerExecTools, type ContainerPolicy } from '@nexus/exec-host';

const policy: ContainerPolicy = { image: 'node:22-alpine', workdirRoot: '/workspace', allow: [/* ... */] };
const host = createContainerExecHost(policy);
const registry = new ToolRegistry();
registerContainerExecTools(registry, host); // validates the policy BEFORE registering
// the registry now answers 'container.exec' behind the exec permission class and §28
```

`registerContainerExecTools` refuses an invalid policy at construction rather than at first call, and the
tool answers `ok` only for exit 0 with no budget kill — a refused run THROWS with the door's reason, so a
silent failure cannot masquerade as an answer. The container subsystem's 26 cases live in
`agents/exec-host/test/containerExec.test.ts` under their own structure (the five-row test table first
published here matched no real suite). Bounds: this is a record, not a feature — no new code, and the
runtime's own tools do not route through the container yet.

## Eleven MemDisk mocks become one disk with a named listing policy (M2 v229 — ADR 0016 amendment 229)

Every suite in `agents/runtime/test` that needed the `FsWriteLike` seam defined its own `MemDisk`/`FakeDisk`,
and under one name they answered `readdirSync` three ways: **five threw**, **two answered `[]`**, and **three
answered a real listing** (byte-identical to each other), with `durability` a fourth shape (a `dirs` set and
`withFileTypes`). Same name, different disk.

`agents/runtime/test/memDisk.ts` is that disk once: `createMemDisk({ listing, seed })`, where the listing
policy is a NAMED per-suite choice — `'refuse'` (throws; a directory read here is a bug in the test, the
answer v206 argued for), `'empty'` (the honest answer for this suite is "nothing"), `'real'` (a true flat
listing, directories a `mkdirSync` recorded included). Eleven suites migrated: **refuse** = testRunner,
ledger, vectordb, chain, evaluate · **empty** = memory, vectorStore · **real** = durability, indexVectors,
indexStore, pipeline.

The migration found a real defect in the helper: its seed wrote via `writeFileSync` (which does not derive
parent dirs) while `durability`'s constructor did — so a seeded `out/a/x.md` could not be reached by a walk
that reads `readdirSync('out')`. The seed now derives the parents. `realfs`'s `FakeFs` is deliberately NOT
migrated: it implements `FsLike` with a `root`-prefix `strip`, a different seam.

Measured: `agents/runtime` **540/540** (36 files) green, `tsc -p tsconfig.test.json --noEmit` exit 0, no test
added or removed (the unchanged count is the proof the migrations are behaviour-preserving).

## The empty listing policy is removed — the dangerous answer was never load-bearing (M2 v230 — ADR 0016 amendment 230)

Amendment 229 made the eleven `MemDisk` mocks one disk with a named listing policy, which is the fix plan
item 19 asked for. But two of the eleven still declared `'empty'` (`memory.test.ts` and `vectorStore.test.ts`),
and `'empty'` answers `[]` for a disk that HAS entries. It was kept as "the dangerous one, deliberately,
taken only where a case measured it", and no case had measured it: the two suites never reached a listing
at all.

Measured, not assumed. With the disk's own suite in place (`memDisk.test.ts`), the arms graded exactly
that. `A1` (`'refuse'` answers `[]` instead of throwing) reddens **only the disk's own cases** and none of
the five `'refuse'` suites — which is the measurement of v206's claim, stated in five copies of a comment
and never once checked. `A2` reddens only the disk's own case, and tightening both `'empty'` suites to
`'refuse'` moves **nothing**: 549/549 before and after.

So the policy is removed rather than kept for symmetry. `'empty'` was strictly dominated: a disk that holds
nothing answers `[]` truthfully under `'real'`, and a disk that holds something must not answer `[]` at all.
`MemDiskListing` is now `'refuse' | 'real'`, the two policies that are actually about something.
`memory.test.ts` and `vectorStore.test.ts` now say `'refuse'`, which is the true statement about them.

The disk gets cases of its own (`memDisk.test.ts`, 9). A shared helper whose behaviour is nobody's
assertion is the same hazard in a new place: the three policies were eleven unsynchronised copies, and one
unpinned helper would have been a twelfth. The cases pin each policy, the difference between a SEED
(which derives its directories, because it is a whole tree) and a WRITE (which does not, because a listing
that reported a directory nobody made would be inventing structure), `mkdirSync`'s recording, and that the
listing is sorted and deterministic so no case depends on `Map` order.

The battery: 5 arms, 5 predictions, 5 reds, 5/5 MATCHED — after two re-derivations, recorded rather than
smoothed. The first A1 predicted 10 and measured 2, because it assumed the ported suites would redden; the
measurement said otherwise and the finding replaced the prediction. A2 was then re-armed to the lie the
removal prevents (`'real'` answering `[]` for a directory that has entries), first predicted 7 and measured
5, and corrected. Final: `A1` `'refuse'`→`[]` → 2 · `A2` `'real'`→`[]` → 5 · `A3` files-only listing → 3 ·
`A4` `mkdirSync` stops recording → 1 · `A5` a write derives its parents again → 1. Each arm is graded on
the disk's own suite AND on the whole package, and the second reading is what proved no other suite reaches
a listing under `'refuse'`. The disk is restored byte-identical after every arm.

Measured: `agents/runtime` **540 → 549** (36 → 37 files), `tsc -p tsconfig.test.json --noEmit` exit 0.
The 9 new cases are the disk's own; the 540 existing ones did not move, which is the proof the policy
removal changes nothing the corpus relies on.

Bounds: the helper is test-only (`agents/runtime/test/`), so nothing in the shipped package moved. The
listing policy is a per-suite DECLARATION, not an inference — a suite that needs a listing must now say
which kind, which is the point. `mkdirSync` records directories (so a listing can report them) while
`writeFileSync` does not; only the seed derives them. The `'empty'` policy was strictly dominated: an
empty directory answers `[]` truthfully under `'real'`, and a disk with entries must not answer `[]` at all.

## The doc gate's §4 measures each arm and names a loaded box (gate v232 — ADR 0016 amendment 232)

`table-recount-proof.mjs` §4 asserts HEAD's suite is green. A red there had TWO possible causes and named
neither: a real regression, or a loaded box that made a spawn-heavy case time out (measured 2026-10-10 —
`execHost.test.ts > the process tree (v55)` is ~3.7 s alone and 39/39 green standalone, yet a loaded run
pushed an arm past its 240 s budget and reddened §4 on it). §4 now times every arm (`Date.now()` around the
vitest spawn) and prints the wall-clock per arm; routes each arm through a PURE `classifyArm` answering
`ok` / `regression` / `incomplete` (a non-zero vitest exit, or fewer owned files reported than HEAD owns);
and, when a regression coincides with a non-zero vitest exit on a sibling arm, NAMES the coincidence and says
to re-run on a quiet box. An `incomplete` arm's failing cases are quoted only as suspects the timeout may
have stranded. Box-safe: on a healthy box every arm exits 0 and reports exactly its owned files, so neither
guarded arm is taken. Witnessed by §4b on five synthetic arms (no vitest, no host): ok · regression ·
incomplete (non-zero exit) · incomplete (dropped file) · timed-out-sibling coincidence. Measured this run
(gate exit 0): `runtime 106102ms exit 0 37/34 files · exec-host 27946ms exit 0 10/9 files` (the extra files
are untracked in-flight suites another lane owns, named and not graded); the table is unchanged (816 cases,
43 files, 4/4 mutations caught).

## The doc gate's arm budget was a NO-OP — `timeoutMs` is not a `child_process` option (gate v236 — ADR 0016 amendment 236)

The gate's vitest spawn carried `{ timeoutMs: 240_000 }` since v141, and v232 even quoted "its 240 s arm
budget" as a thing to name. But `execFileSync` takes **`timeout`**, not `timeoutMs`, and an unknown option is
silently ignored. Measured 2026-10-14: a 4 s child spawned with `timeoutMs: 1000` ran its full **4798 ms** (no
throw); the same child with `timeout: 1000` threw **ETIMEDOUT at 1144 ms**. So the arm had NO budget — it was
killed only by whatever the host imposed, here **~120 s** (the gate died with `vitest wrote no JSON for
runtime (exit -1 after 120072ms)` while the same suite run directly took **121.66 s** and finished green).
The fix is one word — `timeout: 300_000` — with the measurement in the comment. Measured after: `runtime
100907ms exit 0` · `exec-host 162040ms exit 0` (the 162 s arm is the witness: it would have been killed at
120 s before). Bounds: a real timeout makes the gate fail loudly where it used to be killed silently; a host
limit below 300 s still wins, and §4 reports that as `incomplete` (a host kill) rather than a regression.

## v21 — host-verified UI runs and ledger journaling (M2 v21 — ADR 0016 amendment 21)

_Backfilled: this grant and v164 below carried a ledger entry but no corpus title, so the doc gate named them as holes; the records are written from each amendment's own text._

`UiDriver.layerCount?()` is optional: when the host can report a REAL artifact count (the dock passes the Design Model node count — §8 canonical, not DOM scraping), the Studio's `runUiTask` registers a host `test.run`, so the SAME demo planner grows a fourth `verify` step whose completion means the design model actually CHANGED, not that buttons were clicked. Without a state reporter, NO verify step is invented (asserted). And every UI run is JOURNALED to the ledger — a `{goal: 'ui-task: …', approved, score, …}` line, so a host-verified run is durable rather than merely observed.

## v164 — the prose totals followed the suites late, so the evidence tables were re-pinned (M2 v164 — ADR 0016 amendment 164)

The evidence tables' prose totals had drifted behind the suites they claim to sum, so they were re-pinned to what the suites ACTUALLY answer. Numbering note from the record itself: the number was CLAIMED in `7241a28`'s message (2026-10-06) without a ledger entry; the ledger grants the number, and this is the grant (am. 111 — the ledger grants numbers).

## The record-encoding integrity gate: a writer model, a flank rule, and a 116-line digest ledger — M2 v237 — ADR 0016 amendment 237

- **What the defect was.** A writer read UTF-8 bytes as GBK. A 3-byte punctuation character becomes one CJK
  character from its first two bytes and a SECOND character from its third byte paired with the following byte,
  which that byte therefore loses. Three further spellings of the same corruption are declared in the model
  (M2 GBK-read-as-UTF-8, one U+FFFD per unreadable byte; M3 a fold of M1; M4 one codepoint substituted in place
  by a C0 control).
- **The part that could pass for prose.** Measured over all 11 three-byte punctuation characters and all
  96 printable ASCII followers: M1 eats EVERY one of the 96, contiguously — and only 33 of
  them (0x20-0x3F and 0x7F, the bytes that cannot be a GBK trail byte) leave a visible `?`. The other
  63 are rewritten as a plausible CJK character. A repair that only put the punctuation back would
  therefore leave the record one character short and read like English, which is why 17 of the 24
  ledger fixes are GLUE fixes that append the eaten follower.
- **The rule that decides what is damage.** A render site is chargeable only when NEITHER tight neighbour (the
  nearest non-space within one space) is CJK; U+FFFD and C0 controls are chargeable unconditionally, because no
  writer of a real Chinese word produces them. That rule is what protects `路径`: the writer's own render of a
  middle dot before a letter is that first character, and it is a legitimate word.
- **The census the gate keeps at zero.** Over the tracked tree plus its own file: 469 names, 5
  binary skipped, 464 graded — 0 chargeable lines, 5 form-only hits and
  5 flank-rejected render sites in 4 files. At the pinned ref the same rule charges
  116 lines, and those 116 are the ledger.
- **The ledger, as data generated from the bytes.** 116 rows keyed by the SHA-16 of the damaged line
  AND of the repaired line (81 LINE rows, 35 SPAN rows carrying 58 sites), split
  93-13-10 across the three record files, carrying 24 derived fixes: 17 GLUE + 7 CONTROL,
  each naming the channel that decided it (ATTESTED, bytes, CENSUS-FILE). A digest is a MULTISET, not a unique
  key — measured: `scene3dSurface.test.ts` holds the same damaged line twice (ref 862 and 986) and repaired
  identically, so rows pair one-for-one onto distinct tree lines instead of looking each other up.
- **The repair is refuted-or-explained, never assumed.** Walking the pinned ref into the tree reproduces
  116/116 lines image-exactly through the four declared mechanisms (all four are seen), and for
  each of the 24 fixed sites the UNFIXED producer is asked what it explains on its own: 19 are refuted
  outright, 5 fit only by consuming exactly the character the fix supplies, and 0 are free. A site the
  producer already explained would be a repair that restates what the writer left in place, and the gate names
  that as a failure.
- **Witness arms at rest: 9/9 matched their predicted clause.** B0 unmutated copy exit 0 (the
  harness control); B1 M4 undeclared -> `S4b` walk, 6 rows naming "no declared mechanism reproduces"; B2 a
  repaired digest flipped -> `S4` "(0 found at nothing)", proving the ledger keys on line bytes; B3 a row
  re-keyed by position (line 23 to 30) -> the tree side stays green and reports 116 minus one at
  position, and the first red is the REF side "is not the line the ledger pinned at 420f910" — the tree pairs by
  digest, the ref is positional by construction; B4 the glue-eaten branch destroyed -> `S4b` 4 rows naming "the
  UNFIXED producer already explains the site with nothing supplied"; B5 an unreadable ref -> exit 0 WITH the
  "[4b] ref side: UNGRADED" banner, so the skipped half is disclosed rather than counted; A1 a planted em-dash
  render in the shipped file -> `S2` chargeable, naming the file and line; A2 a planted lone CR -> `S2`
  (unconditional); A3 a planted bilingual `路径` line -> `S2` stays GREEN and the rejected count rises
  5 to 6, so the flank rule is seen protecting a real word on the shipped tree, and the
  only red is `S6`, the gate's own ASCII claim about a different file. Group A mutated the shipped file in place
  and restored it byte-exact (ca9730f42130338e) after each arm.
- **Files:** `docs/evidence/agents/record-encoding-proof.mjs` (513 lines, 46278 bytes: the gate
  carries the writer model as data, the derived 898-spelling render registry indexed by head codepoint,
  the census, the ledger, the ref-side walk, and the row's own self-claims). It adds no test case and touches no
  runtime code. Its sweep row joins the committed proofs with THIS commit: measured at the parent,
  `sweep.mjs --only record` reached 1 of 80 committed rows (`record-window-proof.mjs`, exit 0) and
  an untracked file cannot be a row yet — which is the same index blindness the bounds below name.
- **Measured:** Studio 33 files / 509 tests, exit 0 (`npm test -w @nexus/studio`), three-runtime 24 files / 543 tests, exit 0 (`npm test -w @nexus/three-runtime`),
  `tsc --noEmit` exit 0 in both; the gate itself 14.4 s against a budget declared from its own
  `// sweep-budget-ms: 120000` row comment (~10x the measured run, so it cannot redden for being slow — the
  rule amendment 85 established). No existing case moved.
- **Bounds (§60), stated.** The gate grades LINE TEXT in the tracked tree plus itself; it does not grade a
  file a commit has not made yet, and `git ls-files` cannot see an untracked proof — which is why SELF is added
  and disclosed rather than trusted to the index. It cannot prove a record line that reads like prose is
  correct: a bilingual look-alike is deliberately NOT charged, so a genuinely damaged CJK neighbour can hide a
  render, and the only backstop for that is the 116-line ledger pinned at the ref. On a plane with no
  git the ref-side half is ungraded, not passed (B5).

## The look-alike pin: the half the flank rule rescues becomes a population the gate has to name — M2 v238 — ADR 0016 amendment 238

- **The gap this closes.** Amendment 237 shipped the census and its flank rule, and its own Bounds section
  said what the rule must let through: a render site next to real Chinese is NOT charged, because the road glyph
  is both what the writer makes of a middle dot and a legitimate word. The gate SAW those sites and reported
  only that it rejected them — 10 of them in 6 files — and nothing said which lines they
  were. A new damage of that shape could therefore land and move nothing but a total.
- **What landed.** Section S2b pins every render-bearing line as a row of `{file, sha16(line bytes), image
  codepoints, rescue reason}`, and it pins it as a MULTISET, so two identical bilingual lines in one file are
  two rows. A line joining that population reddens `extra`; a pinned line that leaves reddens `vanished`; the
  census now hands S2b the line bytes it previously threw away.
- **The population, as measured.** 10 pinned rows against 10 live ones, over 6
  files, and the whole set is ONE image spelling (U+8def) — which the clause asserts, so a second
  spelling is a finding an amendment has to carry rather than a surprise. 3 rows are rescued on BOTH
  flanks, and S2b refuses a pin that carries none of that shape, because otherwise it would only be naming the
  lines S2 could half see anyway.
- **Every pinned image must be producible.** The registry is derived from the writer model, so a pinned spelling
  that the model cannot produce is refused (`S2b the pinned image U+…`), and a pinned reason that is not
  `REJECTED` is refused — the chargeable lines belong to S2, which runs first and reports its own count.
- **The plant that decides the grant.** v237's A3 arm put a bilingual road-word line into the shipped file and
  the only thing it reddened was the gate's own ASCII self-claim: the census class was invisible. The same plant
  now goes red at AssertionError [ERR_ASSERTION]: S2b no render-bearing line may join the tree unnamed by this pin, and the failure names the file and the digest of the planted line — the gap
  closed with the same bytes that exposed it.
- **Witness arms at rest: 8/8 matched their predicted clause.** D1 the unmutated copy, exit 0. D2
  the bilingual plant above, first red AssertionError [ERR_ASSERTION]: S2b no render-bearing line may join the tree unnamed by this pin. D3 a pinned digest changed by one hex digit: the tree side
  goes red first (AssertionError [ERR_ASSERTION]: S2b no render-bearing line may join the tree unnamed by this pin), because the corrupt key is both a join and a loss and the join is checked
  first. D3b a pinned row naming a digest the tree does not carry: AssertionError [ERR_ASSERTION]: S2b every pinned look-alike must still be in the tree — the vanished half, seen on
  its own. D4 a pinned row deleted: the tree side again, naming the file whose line lost its pin. D5 a pinned
  image replaced by a spelling the model cannot produce: AssertionError [ERR_ASSERTION]: S2b the pinned image U+1f600 at docs/evidence/agents/provenance-proof.mjs must be a render the WRITER MODEL produces. D6 a pinned rescue reason replaced by a
  charge: AssertionError [ERR_ASSERTION]: S2b a pinned look-alike is the RESCUED half only. D7 an ASCII-flanked writer render planted: AssertionError [ERR_ASSERTION]: S2 the tree must carry NO chargeable damage — the ordering proof that S2b
  takes nothing from S2, which still catches what it always caught.
- **Files:** `docs/evidence/agents/record-encoding-proof.mjs` (558 lines, 52668 bytes, sha256
  prefix `eb8afa5492532d5a`): the section, plus the census carrying line bytes. No runtime module changed and no test
  case was added.
- **Measured:** Studio 33 files / 509 tests, exit 0 (`npm test -w @nexus/studio`), three-runtime 24 files / 543 tests, exit 0 (`npm test -w @nexus/three-runtime`),
  `tsc --noEmit` exit 0 in both; the gate itself 37.0 s against its declared `sweep-budget-ms: 120000`
  row budget. Census unchanged at rest: 0 chargeable over 464 graded files, 10 form-only
  lines, 10 flank-rejected sites.
- **Bounds (§60), stated.** The pin records which lines the flank rule rescued, not that they are correct: a
  reader still has to decide whether a pinned line is a real Chinese word or sheltered damage, which is why the
  reason string is part of the row and why growth is a red rather than a stat. A later record that rewrites a
  pinned bilingual line must update the pin in its own amendment — the clause refuses the difference. The pin
  needs no git ref, so unlike the ledger's ref side it still grades on a plane with no repository. It is bounded
  to what the registry can produce: an image invented by hand cannot enter, which also means a damage spelling
  the model does not declare is invisible to both clauses.

## v258 — the §7 title arm assumed a heading STYLE and threw on a true statement; it now asserts the credit (v258 — ADR 0016 amendment 258)

§7's title arm picks the first record HOLE, builds a house-style title from that hole's own ledger heading, and asserted `!EXPLICIT.has(t4)` — that the EXPLICIT mention grammar REFUSES the phrase. That is true only for the old house style `## Amendment N — vN: …`, whose em dash the grammar's lookahead refuses. Newer headings are parenthesised (`### Amendment 242 (M7/v242, …)`), which EXPLICIT **accepts**, so when the hole's heading was 242 the assertion threw on a TRUE statement about a different door — the landmine the studio README's v255 section had already measured ("the door now throws deterministically at line 535").

The arm's real claim is that a house-style title **credits** the number (closing the hole). WHICH reader credits it depends on the heading's style, so it now asserts `credited.has(t4)` (version label OR amendment phrase — always true) and pins the dash rule only when the heading is dash-ended; otherwise it prints `DASH axis is UNVERIFIED this run`. Measured: gate **exit 0**, `[§7] ledger headings 250 · dangling 0 · newest grant 257 IS titled`, and `caught … credited through the amendment phrase (this heading is parenthesised, so the DASH axis is UNVERIFIED this run)`. Bounds: the dash rule is unverified while every hole is parenthesised — the arm says so rather than inventing a subject; a future dash-ended hole re-verifies it automatically.

## the amendment-154 claim was wrong twice: the probe mutated the TYPE, and it ran the wrong suite (M2 — ADR 0016 amendment 375)

**What 154 recorded.** "All three mutations are caught by the existing `saveSnapshot.test.ts` suite."
**What was actually true.** The probe replaced the FIRST occurrence of each reason string — the TYPE UNION, which esbuild erases, so two of the three mutations changed nothing and "survived" for a reason that had nothing to do with the tests. The third, `name-not-reenterable`, is asserted in `saveNameSpelling.test.ts` — a file the probe never ran.
**What was done.** The probe now targets the RUNTIME push sites (`reason: 'X', why:` — unique in the file) and runs the WHOLE `@nexus/three-runtime` suite, because the honest question is whether ANYTHING notices. It shells out through the syncproc bridge and separates a spawn failure from a test failure — a spawn error read as "the mutation was caught" is exactly the false green this arc exists to prevent. The 154 text stays as written: a record that can be edited to match its evidence is worth less than one that cannot.
Measured (2026-10-23): `node docs/evidence/agents/amendment129-probe.mjs` → ALL MUTATIONS CAUGHT.
**Bounds (§60).** The restore is registered on `exit` and the catchable signals; a SIGKILL mid-run still leaves the source mutated.
